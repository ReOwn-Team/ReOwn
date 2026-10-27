import { describe, expect, it } from "@jest/globals";
import { PasswordProvider } from "../../../src/providers/password.provider";

describe("PasswordProvider", () => {
    const passwords = new PasswordProvider();
    const password = "A sufficiently long password";

    it("stores a salted scrypt hash and verifies only the correct password", async () => {
        const hash = await passwords.hash(password);
        expect(hash).toMatch(
            /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/,
        );
        expect(hash).not.toContain(password);
        await expect(passwords.verify(password, hash)).resolves.toBe(true);
        await expect(
            passwords.verify("a different password", hash),
        ).resolves.toBe(false);
    });

    it("uses a different random salt for each hash", async () => {
        const first = await passwords.hash(password);
        const second = await passwords.hash(password);
        expect(first).not.toEqual(second);
    });

    it("does not trim or truncate passwords", async () => {
        const hash = await passwords.hash(` ${password} `);
        await expect(passwords.verify(password, hash)).resolves.toBe(false);
        await expect(passwords.verify(` ${password} `, hash)).resolves.toBe(
            true,
        );
    });

    it("rejects an unknown account using a dummy password hash", async () => {
        await expect(passwords.verify(password)).resolves.toBe(false);
    });

    it.each([
        "",
        "plaintext-password",
        "bcrypt$not-supported",
        "scrypt$1073741824$8$3$" + "00".repeat(16) + "$" + "00".repeat(64),
        "scrypt$32768$8$3$bad-salt$bad-hash",
        "scrypt$32768$8$3$" + "00".repeat(16) + "$" + "00".repeat(63),
    ])(
        "rejects malformed or unsupported hashes without accepting parameters: %s",
        async (hash) => {
            await expect(passwords.verify(password, hash)).resolves.toBe(false);
        },
    );
});
