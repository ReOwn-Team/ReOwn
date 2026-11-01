import {
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
    type OnModuleDestroy,
} from "@nestjs/common";
import { createClient, type RedisClientType } from "redis";
import { RedisStore } from "rate-limit-redis";

export const REDIS_CONNECTION = Symbol("REDIS_CONNECTION");
export type RedisConnection = RedisClientType | null;
const logger = new Logger("Redis");

export async function createRedisConnection(): Promise<RedisConnection> {
    const url = process.env.REDIS_URL?.trim();
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (!["redis:", "rediss:"].includes(parsed.protocol)) throw new Error();
    } catch {
        throw new Error("REDIS_URL must be a valid redis:// or rediss:// URL");
    }
    let connected = false;
    const client = createClient({
        url,
        disableOfflineQueue: true,
        socket: {
            connectTimeout: 3000,
            reconnectStrategy: (retries) =>
                !connected && retries >= 2
                    ? false
                    : Math.min(100 * 2 ** Math.min(retries, 5), 2000),
        },
    });
    // Never log connection URLs or driver errors, which can contain credentials.
    client.on("error", () => logger.warn("Redis connection error"));
    client.on("ready", () => {
        connected = true;
    });
    try {
        await client.connect();
        await client.withCommandOptions({ timeout: 2000 }).ping();
        logger.log("Redis connected");
        return client;
    } catch {
        if (client.isOpen) client.destroy();
        throw new Error("Cannot connect to configured Redis server");
    }
}

@Injectable()
export class RedisService implements OnModuleDestroy {
    readonly prefix: string;
    constructor(
        @Inject(REDIS_CONNECTION) private readonly client: RedisConnection,
    ) {
        const prefix = process.env.REDIS_KEY_PREFIX ?? "reown:";
        if (!prefix || !/^[a-zA-Z0-9:_-]+$/.test(prefix))
            throw new Error(
                "REDIS_KEY_PREFIX must contain only letters, numbers, colon, underscore or hyphen",
            );
        this.prefix = prefix.endsWith(":") ? prefix : `${prefix}:`;
    }
    get enabled(): boolean {
        return this.client !== null;
    }
    get ready(): boolean {
        return this.client?.isReady ?? false;
    }

    private async command(args: string[]): Promise<unknown> {
        if (!this.client?.isReady)
            throw new ServiceUnavailableException("Redis is unavailable");
        try {
            return await this.client
                .withCommandOptions({ timeout: 2000 })
                .sendCommand(args);
        } catch {
            throw new ServiceUnavailableException("Redis is unavailable");
        }
    }
    async atomic(
        script: string,
        keys: string[],
        args: string[],
    ): Promise<unknown> {
        return this.command([
            "EVAL",
            script,
            String(keys.length),
            ...keys,
            ...args,
        ]);
    }
    async ping(): Promise<boolean> {
        return this.enabled && (await this.command(["PING"])) === "PONG";
    }
    async getJson<T>(key: string): Promise<T | null> {
        if (!this.enabled) return null;
        const value = await this.command(["GET", `${this.prefix}cache:${key}`]);
        return typeof value === "string" ? (JSON.parse(value) as T) : null;
    }
    async setJson(
        key: string,
        value: unknown,
        ttlSeconds: number,
    ): Promise<void> {
        if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0)
            throw new Error(
                "Redis cache TTL must be a positive integer in seconds",
            );
        const serialized = JSON.stringify(value);
        if (serialized === undefined)
            throw new Error("Redis cache value must be JSON serializable");
        if (!this.enabled) return;
        await this.command([
            "SET",
            `${this.prefix}cache:${key}`,
            serialized,
            "EX",
            String(ttlSeconds),
        ]);
    }
    async deleteCache(key: string): Promise<void> {
        if (this.enabled)
            await this.command(["DEL", `${this.prefix}cache:${key}`]);
    }
    createRateLimitStore(
        bucket: "credentials" | "sessions" | "otp",
    ): RedisStore | undefined {
        if (!this.enabled) return undefined;
        return new RedisStore({
            prefix: `${this.prefix}rate-limit:${bucket}:`,
            sendCommand: async (...args: string[]) =>
                (await this.command(args)) as
                    string | number | boolean | (string | number | boolean)[],
        });
    }
    async onModuleDestroy(): Promise<void> {
        if (!this.client?.isOpen) return;
        // Discard queued/reconnecting work so shutdown remains bounded.
        this.client.destroy();
    }
}
