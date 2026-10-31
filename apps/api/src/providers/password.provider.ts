import { Injectable } from "@nestjs/common";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PREFIX = "scrypt$32768$8$3";
// Unknown accounts still do the same password derivation as an incorrect password.
const DUMMY_HASH = `${PREFIX}$${"00".repeat(16)}$${"00".repeat(64)}`;

@Injectable()
export class PasswordProvider {
    private derive(password: string, salt: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(key);
                }
            });
        });
    }

    async hash(password: string): Promise<string> {
        const salt = randomBytes(16);
        const key = await this.derive(password, salt);
        return `${PREFIX}$${salt.toString("hex")}$${key.toString("hex")}`;
    }

    async verify(password: string, encodedHash: string = DUMMY_HASH): Promise<boolean> {
        const parts = encodedHash.split("$");
        if (
            parts.length !== 6 ||
            parts.slice(0, 4).join("$") !== PREFIX ||
            !/^[a-f0-9]{32}$/.test(parts[4]) ||
            !/^[a-f0-9]{128}$/.test(parts[5])
        ) {
            return false;
        }

        const actual = await this.derive(password, Buffer.from(parts[4], "hex"));
        return timingSafeEqual(actual, Buffer.from(parts[5], "hex"));
    }
}
