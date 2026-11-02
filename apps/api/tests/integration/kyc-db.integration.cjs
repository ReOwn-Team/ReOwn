#!/usr/bin/env node
"use strict";

// pg parses timestamp-without-time-zone values in the process timezone; match
// Prisma's UTC interpretation so direct SQL and adapter reads are comparable.
process.env.TZ = "UTC";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { createServer } = require("node:net");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Pool } = require("pg");

const apiDirectory = path.resolve(__dirname, "../..");
const loopbackHost = "127.0.0.1";
const databaseUser = "reown_test";
const prismaApplication = "reown-kyc-db-prisma";
const abort = new AbortController();
const hash = (token) => createHash("sha256").update(token).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let temporaryDirectory;
let postgres;
let postgresExit;
let postgresFinished = false;
let postgresOutput = "";
let pool;
let prisma;
let passed = 0;

function killGroup(child, signal) {
    if (!child?.pid) return;
    try {
        process.kill(-child.pid, signal);
    } catch (error) {
        if (error.code !== "ESRCH") throw error;
    }
}

function command(binary, args, timeoutMs = 15000) {
    abort.signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, {
            cwd: apiDirectory,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        let failure;
        const capture = (chunk) => {
            output = (output + chunk).slice(-16000);
        };
        child.stdout.on("data", capture);
        child.stderr.on("data", capture);
        const stop = (error) => {
            failure = error;
            killGroup(child, "SIGKILL");
        };
        const onAbort = () => stop(abort.signal.reason);
        const timer = setTimeout(
            () => stop(new Error(`${binary} exceeded ${timeoutMs}ms`)),
            timeoutMs,
        );
        abort.signal.addEventListener("abort", onAbort, { once: true });
        child.once("error", (error) => {
            failure = error;
        });
        child.once("close", (code, signal) => {
            clearTimeout(timer);
            abort.signal.removeEventListener("abort", onAbort);
            if (failure || code !== 0) {
                reject(
                    new Error(
                        `${binary} failed (${code ?? signal}): ${failure?.message ?? ""}\n${output}`,
                    ),
                );
            } else {
                resolve(output);
            }
        });
    });
}

async function bounded(promise, timeoutMs, label) {
    let timer;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`${label} exceeded ${timeoutMs}ms`)),
                    timeoutMs,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function freeLoopbackPort() {
    const probe = createServer();
    try {
        return await bounded(
            new Promise((resolve, reject) => {
                probe.once("error", reject);
                probe.listen(0, loopbackHost, () =>
                    resolve(probe.address().port),
                );
            }),
            2000,
            "Loopback port selection",
        );
    } finally {
        if (probe.listening) {
            await bounded(
                new Promise((resolve, reject) => {
                    probe.close((error) => (error ? reject(error) : resolve()));
                }),
                1000,
                "Loopback port probe shutdown",
            );
        } else {
            probe.close(() => {});
        }
    }
}

async function check(name, action) {
    abort.signal.throwIfAborted();
    await action();
    abort.signal.throwIfAborted();
    passed += 1;
    console.log(`PASS ${name}`);
}

async function run() {
    if (process.getuid?.() === 0) {
        throw new Error(
            "Run this test as a non-root user: PostgreSQL initdb refuses root",
        );
    }
    for (const filename of [
        "dist/generated/prisma/client.js",
        "dist/services/kyc.service.js",
    ]) {
        assert.ok(
            fs.existsSync(path.join(apiDirectory, filename)),
            `Missing ${filename}; run npm run build first`,
        );
    }

    temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "reown-kyc-db-"),
    );
    fs.chmodSync(temporaryDirectory, 0o700);
    const data = path.join(temporaryDirectory, "data");
    const password = randomBytes(32).toString("base64url");
    const passwordFile = path.join(temporaryDirectory, "initdb-password");
    fs.writeFileSync(passwordFile, password + "\n", {
        mode: 0o600,
        flag: "wx",
    });
    fs.chmodSync(passwordFile, 0o600);
    const port = await freeLoopbackPort();
    abort.signal.throwIfAborted();

    // Every connection uses this newly initialized cluster and random credentials,
    // never an inherited DATABASE_URL or values from .env.
    const databaseUrl = new URL(
        `postgresql://${databaseUser}@${loopbackHost}:${port}/postgres`,
    );
    databaseUrl.password = password;
    databaseUrl.searchParams.set("sslmode", "disable");
    process.env.DATABASE_URL = databaseUrl.toString();
    process.env.DOTENV_CONFIG_OVERRIDE = "false";
    const connection = {
        host: loopbackHost,
        port,
        user: databaseUser,
        password,
        database: "postgres",
        ssl: false,
        max: 8,
        connectionTimeoutMillis: 1000,
        idleTimeoutMillis: 1000,
        query_timeout: 5000,
        options:
            "-c statement_timeout=5000 -c lock_timeout=4000 -c timezone=UTC",
    };

    await command("initdb", [
        "-D",
        data,
        "--username=reown_test",
        "--auth-local=reject",
        "--auth-host=scram-sha-256",
        `--pwfile=${passwordFile}`,
        "--no-locale",
        "--encoding=UTF8",
    ]);
    abort.signal.throwIfAborted();
    postgres = spawn(
        "postgres",
        [
            "-D",
            data,
            "-h",
            loopbackHost,
            "-k",
            "",
            "-p",
            String(port),
            "-c",
            "max_connections=24",
            "-c",
            "shared_buffers=16MB",
        ],
        { detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const capture = (chunk) => {
        postgresOutput = (postgresOutput + chunk).slice(-16000);
    };
    postgres.stdout.on("data", capture);
    postgres.stderr.on("data", capture);
    postgresExit = new Promise((resolve) => {
        postgres.once("error", (error) => {
            postgresFinished = true;
            resolve({ error });
        });
        postgres.once("close", (code, signal) => {
            postgresFinished = true;
            resolve({ code, signal });
        });
    });
    pool = new Pool({
        ...connection,
        application_name: "reown-kyc-db-control",
    });
    // Idle connection errors must not bypass finally and orphan the cluster.
    pool.on("error", (error) => abort.abort(error));
    let ready = false;
    let lastStartupError;
    const startupDeadline = Date.now() + 10000;
    while (Date.now() < startupDeadline) {
        abort.signal.throwIfAborted();
        if (postgresFinished)
            throw new Error(
                `Temporary PostgreSQL exited during startup: ${JSON.stringify(await postgresExit)}`,
            );
        try {
            await pool.query("SELECT 1");
            ready = true;
            break;
        } catch (error) {
            lastStartupError = error;
            await sleep(75);
        }
    }
    assert.ok(
        ready,
        `Temporary PostgreSQL did not start within 10s: ${lastStartupError?.message}`,
    );

    const legacyId = randomUUID();
    await check(
        "all migrations apply and preserve a pre-KYC user",
        async () => {
            const directory = path.join(apiDirectory, "prisma/migrations");
            const migrations = fs
                .readdirSync(directory, { withFileTypes: true })
                .filter(
                    (entry) =>
                        entry.isDirectory() &&
                        fs.existsSync(
                            path.join(directory, entry.name, "migration.sql"),
                        ),
                )
                .map((entry) => entry.name)
                .sort();
            assert.ok(migrations.includes("20261101000000_kyc_student_card"));
            assert.ok(migrations.includes("20261102000000_kyc_generation"));
            for (const migration of migrations) {
                await pool.query(
                    fs.readFileSync(
                        path.join(directory, migration, "migration.sql"),
                        "utf8",
                    ),
                );
                if (migration === "20261026151710_init") {
                    await pool.query(
                        `INSERT INTO users (id, display_name, phone, email, password_hash, phone_verified, email_verified, kyc_status, role, status)
                    VALUES ($1, 'Synthetic User', '+15550000000', 'legacy@example.test', 'synthetic', 0, 0, 0, 'user', 'active')`,
                        [legacyId],
                    );
                }
            }
            const row = (
                await pool.query(
                    "SELECT email, kyc_generation FROM users WHERE id = $1",
                    [legacyId],
                )
            ).rows[0];
            assert.deepEqual(row, {
                email: "legacy@example.test",
                kyc_generation: 0,
            });
        },
    );

    process.env.KYC_KEYS = `test:${randomBytes(32).toString("base64")}`;
    process.env.KYC_ACTIVE_KEY = "test";
    process.env.KYC_HMAC_KEY = randomBytes(32).toString("base64");
    require("reflect-metadata");
    const { PrismaClient } = require(
        path.join(apiDirectory, "dist/generated/prisma/client.js"),
    );
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { KycService } = require(
        path.join(apiDirectory, "dist/services/kyc.service.js"),
    );
    const { KycCryptoService } = require(
        path.join(apiDirectory, "dist/kyc/security/kyc-crypto.service.js"),
    );
    prisma = new PrismaClient({
        adapter: new PrismaPg({
            ...connection,
            application_name: prismaApplication,
        }),
    });
    await prisma.$connect();
    const crypto = new KycCryptoService();
    const files = {
        front: Buffer.from("synthetic front"),
        selfie: Buffer.from("synthetic selfie"),
    };
    const success = (studentId) => ({
        ok: true,
        card: {
            layout: "white",
            fullName: "Synthetic User",
            dateOfBirth: "2000-01-01",
            major: "Test",
            cohort: { start: 2022, end: 2099 },
            studentId,
            studentIdSource: "barcode",
            studentIdOcrConflict: false,
        },
        faceScore: 0.7,
        faceBand: "match",
        images: { front: files.front, selfie: files.selfie },
    });
    const service = (analyse) =>
        new KycService(prisma, crypto, { ready: () => true, analyse });
    async function user() {
        const id = randomUUID();
        await prisma.user.create({
            data: {
                id,
                displayName: "Synthetic User",
                phone: `synthetic-${id}`,
                email: `${id}@example.test`,
                passwordHash: "synthetic",
                phoneVerified: 0,
                emailVerified: 0,
                kycStatus: 0,
                role: "user",
                status: "active",
            },
        });
        return {
            id,
            displayName: "Synthetic User",
            role: "user",
            kycStatus: 0,
        };
    }
    const status = (result) => result.reason?.getStatus?.();
    const countAttempts = (id) =>
        prisma.auditLog.count({
            where: { actorId: id, action: "kyc.attempt" },
        });

    await check(
        "concurrent attempts reserve exactly eight slots across service instances",
        async () => {
            const u = await user();
            let analysed = 0;
            const analyse = async () => {
                analysed++;
                return { ok: false, issues: [] };
            };
            const instances = [service(analyse), service(analyse)];
            const results = await Promise.allSettled(
                Array.from({ length: 12 }, (_, i) =>
                    instances[i % 2].submit(u, files),
                ),
            );
            assert.equal(results.filter((r) => status(r) === 422).length, 8);
            assert.equal(results.filter((r) => status(r) === 429).length, 4);
            assert.equal(analysed, 8);
            assert.equal(await countAttempts(u.id), 8);
            assert.equal(
                await prisma.kycSubmission.count({ where: { userId: u.id } }),
                0,
            );
        },
    );

    await check(
        "withdrawal during delayed analysis prevents persistence",
        async () => {
            const u = await user();
            let release, started;
            const entered = new Promise((resolve) => {
                started = resolve;
            });
            const gate = new Promise((resolve) => {
                release = resolve;
            });
            const a = service(async () => {
                started();
                await gate;
                return success("synthetic-delayed");
            });
            const pending = a.submit(u, files);
            try {
                await bounded(entered, 5000, "analysis start");
                await service(async () => success("unused")).withdraw(u.id);
            } finally {
                release();
            }
            await assert.rejects(
                pending,
                (error) => error.getStatus?.() === 409,
            );
            assert.equal(await countAttempts(u.id), 1);
            assert.equal(
                await prisma.kycSubmission.count({ where: { userId: u.id } }),
                0,
            );
            const row = await prisma.user.findUniqueOrThrow({
                where: { id: u.id },
            });
            assert.equal(row.kycGeneration, 1);
            assert.equal(row.kycStatus, 0);
        },
    );

    await check(
        "approval then withdrawal erases data and releases the card",
        async () => {
            const u = await user();
            const admin = await user();
            const svc = service(async () => success("synthetic-approved"));
            await svc.submit(u, files);
            const row = await prisma.kycSubmission.findFirstOrThrow({
                where: { userId: u.id },
                include: { assets: true },
            });
            assert.equal(row.assets.length, 2);
            assert.ok(row.sealedPayload.length > 0);
            assert.deepEqual(
                await svc.decide(row.id, admin.id, { decision: "approve" }),
                { status: "verified" },
            );
            let stored = await prisma.kycSubmission.findUniqueOrThrow({
                where: { id: row.id },
                include: { assets: true },
            });
            assert.equal(stored.status, "verified");
            assert.equal(stored.sealedPayload.length, 0);
            assert.equal(stored.assets.length, 0);
            assert.equal(
                (await prisma.user.findUniqueOrThrow({ where: { id: u.id } }))
                    .kycStatus,
                2,
            );
            await svc.withdraw(u.id);
            stored = await prisma.kycSubmission.findUniqueOrThrow({
                where: { id: row.id },
            });
            assert.equal(stored.status, "withdrawn");
            assert.ok(stored.purgedAt);
            assert.equal(
                (await prisma.user.findUniqueOrThrow({ where: { id: u.id } }))
                    .kycStatus,
                0,
            );
            const other = await user();
            await svc.submit(other, files);
            assert.equal(
                await prisma.kycSubmission.count({
                    where: { userId: other.id, status: "needs_review" },
                }),
                1,
            );
        },
    );

    await check(
        "expiry purges stale submissions and permits retry",
        async () => {
            const u = await user();
            const svc = service(async () => success("synthetic-expired"));
            await svc.submit(u, files);
            const row = await prisma.kycSubmission.findFirstOrThrow({
                where: { userId: u.id },
            });
            await prisma.kycSubmission.update({
                where: { id: row.id },
                data: { createdAt: new Date(Date.now() - 15 * 86400000) },
            });
            assert.equal(await svc.purgeStale(), 1);
            assert.equal(await svc.purgeStale(), 0);
            const stored = await prisma.kycSubmission.findUniqueOrThrow({
                where: { id: row.id },
                include: { assets: true },
            });
            assert.equal(stored.status, "expired");
            assert.equal(stored.sealedPayload.length, 0);
            assert.equal(stored.assets.length, 0);
            assert.equal(
                (await prisma.user.findUniqueOrThrow({ where: { id: u.id } }))
                    .kycStatus,
                0,
            );
            await svc.submit(u, files);
            assert.equal(
                await prisma.kycSubmission.count({
                    where: { userId: u.id, status: "needs_review" },
                }),
                1,
            );
        },
    );
}

async function cleanup() {
    const errors = [];
    // Closing connections is bounded; PostgreSQL shutdown below also terminates
    // any query that was still in progress when the overall deadline fired.
    const closers = [];
    if (prisma)
        closers.push(bounded(prisma.$disconnect(), 5000, "Prisma disconnect"));
    if (pool) closers.push(bounded(pool.end(), 5000, "pg pool shutdown"));
    for (const result of await Promise.allSettled(closers)) {
        if (result.status === "rejected") errors.push(result.reason);
    }
    if (postgres && !postgresFinished) {
        for (const [signal, timeoutMs] of [
            ["SIGINT", 5000],
            ["SIGQUIT", 3000],
            ["SIGKILL", 1000],
        ]) {
            if (postgresFinished) break;
            try {
                if (signal === "SIGKILL") killGroup(postgres, signal);
                else postgres.kill(signal);
                await bounded(
                    postgresExit,
                    timeoutMs,
                    `PostgreSQL shutdown (${signal})`,
                );
            } catch (error) {
                if (signal === "SIGKILL") errors.push(error);
            }
        }
    }
    if (temporaryDirectory) {
        if (postgres && !postgresFinished) {
            errors.push(
                new Error(
                    `PostgreSQL did not exit; refusing to remove its data directory ${temporaryDirectory}`,
                ),
            );
        } else {
            try {
                fs.rmSync(temporaryDirectory, {
                    recursive: true,
                    force: true,
                    maxRetries: 2,
                    retryDelay: 50,
                });
            } catch (error) {
                errors.push(error);
            }
        }
    }
    if (errors.length)
        throw new AggregateError(errors, "Temporary database cleanup failed");
}

async function main() {
    const onInterrupt = () =>
        abort.abort(new Error("Database test interrupted"));
    process.once("SIGINT", onInterrupt);
    process.once("SIGTERM", onInterrupt);
    // 65s work + <=14s bounded cleanup stays below the 90s runner budget.
    const timer = setTimeout(
        () =>
            abort.abort(
                new Error("Database test exceeded its 65s work budget"),
            ),
        65000,
    );
    const interrupted = new Promise((_, reject) => {
        abort.signal.addEventListener(
            "abort",
            () => reject(abort.signal.reason),
            { once: true },
        );
    });
    try {
        await Promise.race([run(), interrupted]);
    } catch (error) {
        process.exitCode = 1;
        console.error("FAIL KYC database integration:", error);
        if (postgresOutput)
            console.error(
                "Temporary PostgreSQL diagnostics:\n" + postgresOutput,
            );
    } finally {
        clearTimeout(timer);
        try {
            await cleanup();
        } catch (error) {
            process.exitCode = 1;
            console.error("FAIL cleanup:", error);
        }
        process.removeListener("SIGINT", onInterrupt);
        process.removeListener("SIGTERM", onInterrupt);
    }
    if (!process.exitCode)
        console.log(
            `PASS ${passed} real-PostgreSQL KYC checks; temporary cluster stopped and removed`,
        );
}

main().catch((error) => {
    process.exitCode = 1;
    console.error("FAIL runner:", error);
});
