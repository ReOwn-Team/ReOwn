// Test-only store/mail double. Production always uses Redis and Resend.
import { UnauthorizedException } from "@nestjs/common";
import type { OtpRecord, OtpStore } from "../../src/otp/otp.store";
export class MemoryOtpStore implements Pick<
    OtpStore,
    "read" | "reserve" | "activate" | "discard" | "consume"
> {
    records = new Map<string, OtpRecord>();
    reset() {
        this.records.clear();
    }
    async read(id: string) {
        const value = this.records.get(id);
        return value && value.expiresAt > Date.now() ? value : null;
    }
    async reserve(id: string, value: OtpRecord, oldVersion = "") {
        if (oldVersion && (await this.read(id))?.version !== oldVersion)
            throw new UnauthorizedException();
        this.records.set(id, { ...value });
    }
    async activate(id: string, version: string) {
        const value = await this.read(id);
        if (!value || value.version !== version)
            throw new UnauthorizedException();
        value.ready = true;
    }
    async discard(id: string, version: string) {
        if ((await this.read(id))?.version === version) this.records.delete(id);
    }
    async consume(id: string, digest: string) {
        const value = await this.read(id);
        if (!value || !value.ready) throw new UnauthorizedException();
        value.attempts++;
        if (value.digest !== digest) {
            if (value.attempts >= 5) this.records.delete(id);
            throw new UnauthorizedException();
        }
        this.records.delete(id);
        return value;
    }
}
export class MemoryOtpMail {
    sent: Array<{ email: string; code: string }> = [];
    assertConfigured() {}
    async send(email: string, code: string) {
        this.sent.push({ email, code });
    }
}
