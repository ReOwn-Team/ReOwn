import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
    createCipheriv,
    createDecipheriv,
    createHmac,
    randomBytes,
} from "node:crypto";

/**
 * Envelope encryption for KYC data.
 *
 * Every object gets its own random 256-bit data key (DEK). The DEK is wrapped
 * by a key-encryption key (KEK) identified by `kid`, so KEKs can be rotated by
 * adding a new id and re-sealing lazily. AES-256-GCM authenticates both
 * layers; `aad` binds a ciphertext to its row so it cannot be swapped between
 * users or kinds.
 *
 * Sealed layout (single buffer, stored in a bytea column):
 *   magic "RK1" | kidLen(1) | kid | wrapIv(12) | wrapTag(16) | wrappedDek(32)
 *   | iv(12) | tag(16) | ciphertext
 *
 * Configuration (never commit real values):
 *   KYC_KEYS        "k1:<base64 32 bytes>,k2:<base64 32 bytes>"
 *   KYC_ACTIVE_KEY  id of the key used for new data (defaults to the first)
 *   KYC_HMAC_KEY    base64, at least 32 bytes; used for the student-id index
 */
const MAGIC = Buffer.from("RK1");
const IV = 12;
const TAG = 16;
const DEK = 32;

type Keyring = {
    keys: Map<string, Buffer>;
    active: string;
    hmac: Buffer;
};

function decodeKey(value: string, minimum: number) {
    const bytes = Buffer.from(value.trim(), "base64");
    if (bytes.length < minimum) throw new Error("Key is too short");
    return bytes;
}

export function loadKeyring(env: NodeJS.ProcessEnv = process.env): Keyring {
    const keys = new Map<string, Buffer>();
    for (const entry of (env.KYC_KEYS ?? "").split(",")) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const separator = trimmed.indexOf(":");
        const id = trimmed.slice(0, separator);
        if (separator < 1 || !/^[a-zA-Z0-9_-]{1,32}$/.test(id))
            throw new Error("Invalid KYC key id");
        if (keys.has(id)) throw new Error("Duplicate KYC key id");
        const key = decodeKey(trimmed.slice(separator + 1), 32);
        if (key.length !== 32) throw new Error("KYC keys must be 32 bytes");
        keys.set(id, key);
    }
    const active = env.KYC_ACTIVE_KEY ?? [...keys.keys()][0];
    if (!keys.size || !active || !keys.has(active))
        throw new Error("KYC encryption keys are not configured");
    if (!env.KYC_HMAC_KEY) throw new Error("KYC_HMAC_KEY is not configured");
    const hmac = decodeKey(env.KYC_HMAC_KEY, 32);
    for (const key of keys.values())
        if (key.equals(hmac.subarray(0, 32)) && hmac.length === 32)
            throw new Error("KYC_HMAC_KEY must differ from encryption keys");
    return { keys, active, hmac };
}

@Injectable()
export class KycCryptoService {
    private ring?: Keyring;

    private keyring(): Keyring {
        if (this.ring) return this.ring;
        try {
            this.ring = loadKeyring();
        } catch {
            // Fail closed without echoing configuration details.
            throw new ServiceUnavailableException(
                "KYC is not configured on this server",
            );
        }
        return this.ring;
    }

    /** Whether KYC may be offered at all. */
    available(): boolean {
        try {
            this.keyring();
            return true;
        } catch {
            return false;
        }
    }

    seal(plain: Buffer, aad: string): Buffer {
        const { keys, active } = this.keyring();
        const kek = keys.get(active)!;
        const dek = randomBytes(DEK);
        const wrapIv = randomBytes(IV);
        const wrapper = createCipheriv("aes-256-gcm", kek, wrapIv);
        wrapper.setAAD(Buffer.from(`dek|${active}`));
        const wrapped = Buffer.concat([wrapper.update(dek), wrapper.final()]);
        const wrapTag = wrapper.getAuthTag();
        const iv = randomBytes(IV);
        const cipher = createCipheriv("aes-256-gcm", dek, iv);
        cipher.setAAD(Buffer.from(aad));
        const body = Buffer.concat([cipher.update(plain), cipher.final()]);
        const tag = cipher.getAuthTag();
        dek.fill(0);
        const kid = Buffer.from(active);
        return Buffer.concat([
            MAGIC,
            Buffer.from([kid.length]),
            kid,
            wrapIv,
            wrapTag,
            wrapped,
            iv,
            tag,
            body,
        ]);
    }

    open(sealed: Buffer, aad: string): Buffer {
        const { keys } = this.keyring();
        try {
            if (
                sealed.length < MAGIC.length + 1 ||
                !sealed.subarray(0, MAGIC.length).equals(MAGIC)
            )
                throw new Error();
            let at = MAGIC.length;
            const kidLength = sealed[at++];
            const kid = sealed.subarray(at, at + kidLength).toString();
            at += kidLength;
            const kek = keys.get(kid);
            if (!kek || sealed.length < at + IV + TAG + DEK + IV + TAG)
                throw new Error();
            const wrapIv = sealed.subarray(at, (at += IV));
            const wrapTag = sealed.subarray(at, (at += TAG));
            const wrapped = sealed.subarray(at, (at += DEK));
            const iv = sealed.subarray(at, (at += IV));
            const tag = sealed.subarray(at, (at += TAG));
            const body = sealed.subarray(at);
            const unwrapper = createDecipheriv("aes-256-gcm", kek, wrapIv);
            unwrapper.setAAD(Buffer.from(`dek|${kid}`));
            unwrapper.setAuthTag(wrapTag);
            const dek = Buffer.concat([
                unwrapper.update(wrapped),
                unwrapper.final(),
            ]);
            const decipher = createDecipheriv("aes-256-gcm", dek, iv);
            decipher.setAAD(Buffer.from(aad));
            decipher.setAuthTag(tag);
            const plain = Buffer.concat([
                decipher.update(body),
                decipher.final(),
            ]);
            dek.fill(0);
            return plain;
        } catch {
            // One generic failure for tampering, wrong AAD and unknown keys.
            throw new Error("KYC data could not be decrypted");
        }
    }

    /** Which key id sealed this value (for rotation reports). */
    keyId(sealed: Buffer): string | null {
        if (sealed.length < 5 || !sealed.subarray(0, 3).equals(MAGIC))
            return null;
        return sealed.subarray(4, 4 + sealed[3]).toString();
    }

    needsRotation(sealed: Buffer): boolean {
        return this.keyId(sealed) !== this.keyring().active;
    }

    /** Deterministic keyed index of a student id; the raw value is never stored. */
    studentIdIndex(studentId: string): string {
        return createHmac("sha256", this.keyring().hmac)
            .update(`student-id|${studentId}`)
            .digest("hex");
    }
}
