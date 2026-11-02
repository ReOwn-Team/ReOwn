import { describe, expect, it } from "@jest/globals";
import { randomBytes } from "node:crypto";
import {
    KycCryptoService,
    loadKeyring,
} from "../../../src/kyc/security/kyc-crypto.service";

const key = () => randomBytes(32).toString("base64");

function configure(env: Record<string, string | undefined>) {
    const original = { ...process.env };
    Object.assign(process.env, env);
    for (const [name, value] of Object.entries(env))
        if (value === undefined) delete process.env[name];
    return () => {
        process.env = original;
    };
}

describe("KycCryptoService", () => {
    const k1 = key();
    const k2 = key();
    const hmac = key();

    it("round-trips and never stores plaintext in the envelope", () => {
        const restore = configure({ KYC_KEYS: `k1:${k1}`, KYC_HMAC_KEY: hmac });
        try {
            const crypto = new KycCryptoService();
            const plain = Buffer.from("secret-card-bytes");
            const sealed = crypto.seal(plain, "aad");
            expect(sealed.includes(plain)).toBe(false);
            expect(crypto.open(sealed, "aad").equals(plain)).toBe(true);
            // Fresh DEK and IV each time.
            expect(crypto.seal(plain, "aad").equals(sealed)).toBe(false);
        } finally {
            restore();
        }
    });

    it("rejects tampering, a different AAD and truncation", () => {
        const restore = configure({ KYC_KEYS: `k1:${k1}`, KYC_HMAC_KEY: hmac });
        try {
            const crypto = new KycCryptoService();
            const sealed = crypto.seal(Buffer.from("payload"), "row-a");
            expect(() => crypto.open(sealed, "row-b")).toThrow();
            for (const position of [
                10,
                sealed.length - 1,
                sealed.length - 20,
            ]) {
                const damaged = Buffer.from(sealed);
                damaged[position] ^= 0x01;
                expect(() => crypto.open(damaged, "row-a")).toThrow();
            }
            expect(() =>
                crypto.open(sealed.subarray(0, 20), "row-a"),
            ).toThrow();
            expect(() => crypto.open(Buffer.alloc(0), "row-a")).toThrow();
        } finally {
            restore();
        }
    });

    it("opens data sealed with a retired key after rotation", () => {
        let restore = configure({ KYC_KEYS: `k1:${k1}`, KYC_HMAC_KEY: hmac });
        let sealed: Buffer;
        try {
            sealed = new KycCryptoService().seal(Buffer.from("old"), "aad");
        } finally {
            restore();
        }
        restore = configure({
            KYC_KEYS: `k1:${k1},k2:${k2}`,
            KYC_ACTIVE_KEY: "k2",
            KYC_HMAC_KEY: hmac,
        });
        try {
            const crypto = new KycCryptoService();
            expect(crypto.open(sealed, "aad").toString()).toBe("old");
            expect(crypto.needsRotation(sealed)).toBe(true);
            expect(crypto.keyId(crypto.seal(Buffer.from("new"), "aad"))).toBe(
                "k2",
            );
        } finally {
            restore();
        }
        // Removing the old key makes old data unreadable, by design.
        restore = configure({ KYC_KEYS: `k2:${k2}`, KYC_HMAC_KEY: hmac });
        try {
            expect(() => new KycCryptoService().open(sealed, "aad")).toThrow();
        } finally {
            restore();
        }
    });

    it("indexes student ids with a keyed, deterministic hash", () => {
        const restore = configure({ KYC_KEYS: `k1:${k1}`, KYC_HMAC_KEY: hmac });
        try {
            const crypto = new KycCryptoService();
            const a = crypto.studentIdIndex("0000000001");
            expect(a).toMatch(/^[a-f0-9]{64}$/);
            expect(a).toBe(crypto.studentIdIndex("0000000001"));
            expect(a).not.toBe(crypto.studentIdIndex("0000000002"));
            expect(a).not.toContain("0000000001");
        } finally {
            restore();
        }
        // A different pepper yields a different index for the same id.
        const first = (() => {
            const restore = configure({
                KYC_KEYS: `k1:${k1}`,
                KYC_HMAC_KEY: key(),
            });
            try {
                return new KycCryptoService().studentIdIndex("0000000001");
            } finally {
                restore();
            }
        })();
        const second = (() => {
            const restore = configure({
                KYC_KEYS: `k1:${k1}`,
                KYC_HMAC_KEY: key(),
            });
            try {
                return new KycCryptoService().studentIdIndex("0000000001");
            } finally {
                restore();
            }
        })();
        expect(first).not.toBe(second);
    });

    it("fails closed when keys are missing or malformed", () => {
        expect(() => loadKeyring({})).toThrow();
        expect(() => loadKeyring({ KYC_KEYS: `k1:${k1}` })).toThrow();
        expect(() =>
            loadKeyring({ KYC_KEYS: "k1:c2hvcnQ=", KYC_HMAC_KEY: hmac }),
        ).toThrow();
        expect(() =>
            loadKeyring({
                KYC_KEYS: `k1:${k1}`,
                KYC_ACTIVE_KEY: "nope",
                KYC_HMAC_KEY: hmac,
            }),
        ).toThrow();
        expect(() =>
            loadKeyring({ KYC_KEYS: `k1:${k1},k1:${k2}`, KYC_HMAC_KEY: hmac }),
        ).toThrow();
        expect(() =>
            loadKeyring({ KYC_KEYS: `k1:${k1}`, KYC_HMAC_KEY: k1 }),
        ).toThrow();
        const restore = configure({
            KYC_KEYS: undefined,
            KYC_HMAC_KEY: undefined,
        });
        try {
            const crypto = new KycCryptoService();
            expect(crypto.available()).toBe(false);
            expect(() => crypto.seal(Buffer.from("x"), "a")).toThrow(
                /not configured/,
            );
        } finally {
            restore();
        }
    });
});
