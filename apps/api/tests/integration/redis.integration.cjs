"use strict";
// Uses only an isolated Redis child and mocked Prisma. Never connects to .env's database/Redis.
require("reflect-metadata");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createServer } = require("node:net");
const { randomUUID, randomBytes } = require("node:crypto");
const { once } = require("node:events");
const { Test } = require("@nestjs/testing");
const { createClient } = require("redis");
const { setTimeout: sleep } = require("node:timers/promises");
Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: randomBytes(32).toString("hex"),
    CLIENT_ORIGIN: "http://localhost:3001",
    COOKIE_SECURE: "false",
    REDIS_KEY_PREFIX: `reown-integration:${randomUUID()}:`,
});
const { AppModule } = require("../../dist/app.module");
const { PrismaService } = require("../../dist/prisma/prisma.service");
const {
    RedisService,
    createRedisConnection,
} = require("../../dist/redis/redis.service");
const { configureHttp } = require("../../dist/config/http.config");
let redisProcess, observer;
const apps = [];
async function freePort() {
    const server = createServer();
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return port;
}
async function startApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue({})
        .compile();
    const app = module.createNestApplication({ logger: false });
    apps.push(app);
    configureHttp(app);
    await app.listen(0, "127.0.0.1");
    return app;
}
async function request(app, path) {
    return fetch(`${await app.getUrl()}/api/v1/${path}`, {
        method: "POST",
        headers: {
            Origin: process.env.CLIENT_ORIGIN,
            "X-ReOwn-Client": "web",
            "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(5000),
    });
}
async function main() {
    try {
        const port = await freePort();
        process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
        redisProcess = spawn(
            process.env.REDIS_SERVER ?? "redis-server",
            [
                "--bind",
                "127.0.0.1",
                "--port",
                String(port),
                "--save",
                "",
                "--appendonly",
                "no",
            ],
            { stdio: ["ignore", "pipe", "pipe"] },
        );
        await new Promise((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error("Redis startup timed out")),
                5000,
            );
            redisProcess.once("error", (error) => {
                clearTimeout(timer);
                reject(error);
            });
            redisProcess.once("exit", (code) => {
                clearTimeout(timer);
                reject(new Error(`Redis exited during startup (${code})`));
            });
            redisProcess.stdout.on("data", (chunk) => {
                if (chunk.toString().includes("Ready to accept connections")) {
                    clearTimeout(timer);
                    resolve();
                }
            });
            redisProcess.stderr.resume();
        });
        observer = createClient({
            url: process.env.REDIS_URL,
            socket: { reconnectStrategy: false },
        });
        observer.on("error", () => {});
        await observer.connect();
        const first = await startApp(),
            second = await startApp();
        const cache = first.get(RedisService);
        assert.equal(await cache.ping(), true);
        await cache.setJson("sample", { value: 42 }, 1);
        assert.deepEqual(await second.get(RedisService).getJson("sample"), {
            value: 42,
        });
        await sleep(1100);
        assert.equal(await cache.getJson("sample"), null);
        await cache.setJson("delete-me", { ok: true }, 60);
        await cache.deleteCache("delete-me");
        assert.equal(await cache.getJson("delete-me"), null);
        console.log("PASS shared JSON cache, expiry and deletion");
        for (let i = 0; i < 10; i++)
            assert.equal(
                (await request(i % 2 ? first : second, "users/login")).status,
                400,
            );
        const blocked = await request(second, "users/register");
        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers.get("retry-after")) > 0);
        assert.equal((await request(first, "auth/refresh")).status, 401);
        const keys = await observer.keys(
            `${process.env.REDIS_KEY_PREFIX}rate-limit:*`,
        );
        assert.equal(keys.length, 2);
        for (const key of keys) assert.ok((await observer.pTTL(key)) > 0);
        console.log(
            "PASS limits shared across instances, separate auth/session buckets, Retry-After and key TTL",
        );
        await first.close();
        const restarted = await startApp();
        assert.equal((await request(restarted, "users/login")).status, 429);
        console.log("PASS API restart retains the Redis rate limit");
        observer.destroy();
        observer = null;
        const exited = once(redisProcess, "exit");
        redisProcess.kill("SIGTERM");
        await exited;
        assert.equal((await request(second, "users/login")).status, 503);
        assert.equal(
            (await fetch(`${await second.getUrl()}/api/v1/health`)).status,
            200,
        );
        await assert.rejects(
            createRedisConnection(),
            /Cannot connect to configured Redis server/,
        );
        console.log(
            "PASS outage rejects auth instead of bypassing limits; liveness stays available; unavailable Redis fails startup",
        );
    } finally {
        if (observer?.isOpen) observer.destroy();
        await Promise.allSettled(apps.map((app) => app.close()));
        if (redisProcess?.exitCode === null) {
            redisProcess.kill("SIGKILL");
            await once(redisProcess, "exit");
        }
    }
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
