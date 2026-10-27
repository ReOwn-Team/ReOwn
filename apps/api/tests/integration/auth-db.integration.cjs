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
const prismaApplication = "reown-auth-db-prisma";
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

const unauthorized = (error) => error?.getStatus?.() === 401;

async function noUnrevokedFamily(familyId) {
    const result = await pool.query(
        'SELECT count(*)::int AS count FROM "sessions" WHERE "family_id" = $1 AND "revoked_at" IS NULL',
        [familyId],
    );
    assert.equal(
        result.rows[0].count,
        0,
        "Family revocation must be visible to a separate SQL connection",
    );
}

async function sessionRow(id) {
    const result = await pool.query(
        'SELECT * FROM "sessions" WHERE "id" = $1',
        [id],
    );
    assert.equal(
        result.rows.length,
        1,
        "Historical session rows must be retained",
    );
    return result.rows[0];
}

// Hold the same key externally until both real adapter transactions are waiting.
// This exercises lock contention, not merely two promises that might run sequentially.
async function contended(familyId, actions) {
    const blocker = await pool.connect();
    let results;
    let observationError;
    try {
        await blocker.query("BEGIN");
        await blocker.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))::text",
            [familyId],
        );
        results = Promise.allSettled(actions.map((action) => action()));
        const deadline = Date.now() + 2500;
        let queued = false;
        while (Date.now() < deadline) {
            abort.signal.throwIfAborted();
            const waiting = await pool.query(
                `SELECT count(*)::int AS count
                 FROM pg_locks AS locks JOIN pg_stat_activity AS activity USING (pid)
                 WHERE locks.locktype = 'advisory' AND NOT locks.granted
                   AND activity.application_name = $1`,
                [prismaApplication],
            );
            if (waiting.rows[0].count === actions.length) {
                queued = true;
                break;
            }
            await sleep(25);
        }
        assert.ok(
            queued,
            "Both API transactions must queue on the real family advisory lock within 2.5s",
        );
    } catch (error) {
        observationError = error;
    } finally {
        try {
            await blocker.query("ROLLBACK");
        } finally {
            blocker.release();
        }
    }
    const settled = await results;
    if (observationError) throw observationError;
    return settled;
}

async function run() {
    if (process.getuid?.() === 0) {
        throw new Error(
            "Run this test as a non-root user: PostgreSQL initdb refuses root",
        );
    }
    for (const filename of [
        "dist/generated/prisma/client.js",
        "dist/services/sessions.service.js",
    ]) {
        assert.ok(
            fs.existsSync(path.join(apiDirectory, filename)),
            `Missing ${filename}; run npm run build first`,
        );
    }

    temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "reown-auth-db-"),
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
        application_name: "reown-auth-db-control",
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

    await check(
        "isolated PostgreSQL uses loopback TCP, SCRAM authentication and no Unix sockets",
        async () => {
            assert.equal(
                (await pool.query("SHOW listen_addresses")).rows[0]
                    .listen_addresses,
                loopbackHost,
            );
            assert.equal(
                (await pool.query("SHOW unix_socket_directories")).rows[0]
                    .unix_socket_directories,
                "",
            );
            const address = await pool.query(
                "SELECT host(inet_server_addr()) AS host, inet_server_port() AS port",
            );
            assert.deepEqual(address.rows, [{ host: loopbackHost, port }]);
            const hostRules = await pool.query(
                "SELECT auth_method FROM pg_hba_file_rules WHERE type LIKE 'host%'",
            );
            assert.ok(hostRules.rows.length > 0);
            assert.ok(
                hostRules.rows.every(
                    (rule) => rule.auth_method === "scram-sha-256",
                ),
            );
            assert.equal(fs.statSync(passwordFile).mode & 0o777, 0o600);
        },
    );

    const legacyUserId = randomUUID();
    const legacySessionId = randomUUID();
    const legacyHash = hash("legacy migration fixture, never a refresh grant");
    const legacyExpiry = new Date(
        Math.floor(Date.now() / 1000) * 1000 + 86400000,
    );
    await check(
        "all sorted migrations preserve legacy rows, normalize identifiers and backfill families",
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
            assert.ok(migrations.includes("20261026151710_init"));
            assert.ok(
                migrations.includes("20261027000000_unique_user_identifiers"),
            );
            assert.ok(migrations.includes("20261027010000_session_families"));
            for (const migration of migrations) {
                abort.signal.throwIfAborted();
                await pool.query(
                    fs.readFileSync(
                        path.join(directory, migration, "migration.sql"),
                        "utf8",
                    ),
                );
                if (migration === "20261026151710_init") {
                    await pool.query(
                        `INSERT INTO "users" (id, display_name, phone, phone_verified, email, email_verified,
                                          password_hash, kyc_status, role, status)
                     VALUES ($1, 'Legacy User', ' +84901234567 ', 0, '  LeGaCy@Example.COM  ', 0,
                             'test-only-password-hash', 0, 'user', 'active')`,
                        [legacyUserId],
                    );
                    await pool.query(
                        `INSERT INTO "sessions" (id, user_id, refresh_token_hash, expires_at, user_agent, ip_address)
                     VALUES ($1, $2, $3, $4, 'legacy-agent', 123)`,
                        [
                            legacySessionId,
                            legacyUserId,
                            legacyHash,
                            legacyExpiry,
                        ],
                    );
                }
            }
            const users = await pool.query('SELECT * FROM "users"');
            assert.equal(users.rows.length, 1);
            assert.equal(users.rows[0].id, legacyUserId);
            assert.equal(users.rows[0].email, "legacy@example.com");
            assert.equal(users.rows[0].phone, "+84901234567");
            assert.equal(
                users.rows[0].password_hash,
                "test-only-password-hash",
            );
            assert.equal(
                (
                    await pool.query(
                        'SELECT count(*)::int AS count FROM "sessions"',
                    )
                ).rows[0].count,
                1,
            );
            const row = await sessionRow(legacySessionId);
            assert.equal(row.family_id, legacySessionId);
            assert.equal(row.user_id, legacyUserId);
            assert.equal(row.refresh_token_hash, legacyHash);
            assert.equal(row.expires_at.getTime(), legacyExpiry.getTime());
            assert.equal(row.revoked_at, null);
            assert.equal(row.user_agent, "legacy-agent");
            assert.equal(row.ip_address, 123);
            const column = await pool.query(
                "SELECT data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'family_id'",
            );
            assert.deepEqual(column.rows, [
                { data_type: "uuid", is_nullable: "NO" },
            ]);
            const index = await pool.query(
                "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'sessions_family_id_index'",
            );
            assert.equal(index.rows.length, 1);
            assert.match(index.rows[0].indexdef, /\(family_id\)/);
        },
    );

    abort.signal.throwIfAborted();
    require("reflect-metadata");
    const { PrismaClient } = require(
        path.join(apiDirectory, "dist/generated/prisma/client.js"),
    );
    const { PrismaPg } = require("@prisma/adapter-pg");
    const { SessionsService, REFRESH_TOKEN_TTL_SECONDS } = require(
        path.join(apiDirectory, "dist/services/sessions.service.js"),
    );
    prisma = new PrismaClient({
        adapter: new PrismaPg({
            ...connection,
            application_name: prismaApplication,
        }),
    });
    await prisma.$connect();
    const sessions = new SessionsService(prisma);
    let first;
    let successor;
    let independent;

    await check(
        "root creation persists only a SHA-256 hash, a UUID family and a 30-day expiry",
        async () => {
            const before = Date.now();
            first = await sessions.create(legacyUserId);
            const after = Date.now();
            assert.equal(REFRESH_TOKEN_TTL_SECONDS, 30 * 24 * 60 * 60);
            assert.ok(
                /^[A-Za-z0-9_-]{43}$/.test(first.refreshToken),
                "Expected a 43-character base64url secret",
            );
            assert.equal(
                Buffer.from(first.refreshToken, "base64url").length,
                32,
            );
            const row = await sessionRow(first.familyId);
            assert.equal(row.id, row.family_id);
            assert.equal(row.user_id, legacyUserId);
            assert.equal(row.refresh_token_hash, hash(first.refreshToken));
            assert.ok(
                !JSON.stringify(row).includes(first.refreshToken),
                "Raw refresh tokens must not be persisted",
            );
            assert.ok(
                first.expiresAt.getTime() >=
                    before + REFRESH_TOKEN_TTL_SECONDS * 1000,
            );
            assert.ok(
                first.expiresAt.getTime() <=
                    after + REFRESH_TOKEN_TTL_SECONDS * 1000,
            );
            // PostgreSQL Timestamp(0) rounds the root's millisecond expiry to seconds.
            assert.ok(
                Math.abs(row.expires_at.getTime() - first.expiresAt.getTime()) <
                    1000,
            );
            await sessions.assertActive(legacyUserId, first.familyId);
            await assert.rejects(
                sessions.assertActive(randomUUID(), first.familyId),
                unauthorized,
            );
            independent = await sessions.create(legacyUserId);
            assert.notEqual(independent.familyId, first.familyId);
        },
    );

    await check(
        "real Prisma advisory-lock SQL rotates atomically with fixed stored expiry and retained history",
        async () => {
            const before = await sessionRow(first.familyId);
            successor = await sessions.rotate(first.refreshToken);
            const old = await sessionRow(first.familyId);
            const current = await prisma.session.findUnique({
                where: { refreshTokenHash: hash(successor.refreshToken) },
            });
            assert.ok(current);
            assert.notEqual(current.id, first.familyId);
            assert.equal(current.familyId, first.familyId);
            assert.equal(current.userId, legacyUserId);
            assert.equal(
                successor.expiresAt.getTime(),
                before.expires_at.getTime(),
            );
            assert.equal(
                current.expiresAt.getTime(),
                before.expires_at.getTime(),
            );
            assert.ok(old.revoked_at instanceof Date);
            assert.ok(old.last_used_at instanceof Date);
            assert.equal(old.refresh_token_hash, hash(first.refreshToken));
            assert.equal(current.revokedAt, null);
            assert.ok(
                !JSON.stringify(current).includes(successor.refreshToken),
            );
            await sessions.assertActive(legacyUserId, first.familyId);
        },
    );

    await check(
        "replay returns 401 after COMMIT of family revocation without affecting a second login",
        async () => {
            await assert.rejects(
                sessions.rotate(first.refreshToken),
                unauthorized,
            );
            await noUnrevokedFamily(first.familyId);
            const revoked = await pool.query(
                'SELECT revoked_at FROM "sessions" WHERE refresh_token_hash = $1',
                [hash(successor.refreshToken)],
            );
            assert.ok(revoked.rows[0].revoked_at instanceof Date);
            await assert.rejects(
                sessions.assertActive(legacyUserId, first.familyId),
                unauthorized,
            );
            await sessions.assertActive(legacyUserId, independent.familyId);
        },
    );

    await check(
        "logout with a historical token invalidates the current family and is idempotent",
        async () => {
            const rotated = await sessions.rotate(independent.refreshToken);
            await sessions.revoke(independent.refreshToken);
            await noUnrevokedFamily(independent.familyId);
            await assert.rejects(
                sessions.assertActive(legacyUserId, independent.familyId),
                unauthorized,
            );
            await assert.rejects(
                sessions.rotate(rotated.refreshToken),
                unauthorized,
            );
            await sessions.revoke(independent.refreshToken);
            await sessions.revoke("malformed");
            await sessions.revoke("_".repeat(43));
        },
    );

    await check(
        "successor insertion failure rolls back old-token revocation in PostgreSQL",
        async () => {
            const root = await sessions.create(legacyUserId);
            await pool.query(
                'ALTER TABLE "sessions" ADD CONSTRAINT auth_db_test_reject_successor CHECK (id = family_id) NOT VALID',
            );
            try {
                await assert.rejects(
                    sessions.rotate(root.refreshToken),
                    (error) => error instanceof Error && !unauthorized(error),
                );
                const row = await sessionRow(root.familyId);
                assert.equal(row.revoked_at, null);
                assert.equal(row.last_used_at, null);
                const count = await pool.query(
                    'SELECT count(*)::int AS count FROM "sessions" WHERE family_id = $1',
                    [root.familyId],
                );
                assert.equal(count.rows[0].count, 1);
            } finally {
                await pool.query(
                    'ALTER TABLE "sessions" DROP CONSTRAINT auth_db_test_reject_successor',
                );
            }
            const valid = await sessions.rotate(root.refreshToken);
            await sessions.revoke(valid.refreshToken);
        },
    );

    await check(
        "two genuinely contending duplicate refreshes yield one grant, one 401 and a revoked family",
        async () => {
            const root = await sessions.create(legacyUserId);
            const results = await contended(root.familyId, [
                () => sessions.rotate(root.refreshToken),
                () => sessions.rotate(root.refreshToken),
            ]);
            const fulfilled = results.filter(
                (result) => result.status === "fulfilled",
            );
            const rejected = results.filter(
                (result) => result.status === "rejected",
            );
            assert.equal(fulfilled.length, 1);
            assert.equal(rejected.length, 1);
            assert.ok(
                unauthorized(rejected[0].reason),
                "The second refresh must fail with 401, not a SQL/adapter error",
            );
            await noUnrevokedFamily(root.familyId);
            const count = await pool.query(
                'SELECT count(*)::int AS count FROM "sessions" WHERE family_id = $1',
                [root.familyId],
            );
            assert.equal(count.rows[0].count, 2);
            await assert.rejects(
                sessions.assertActive(legacyUserId, root.familyId),
                unauthorized,
            );
        },
    );

    await check(
        "contending refresh/logout leave no active family, regardless of operation order",
        async () => {
            for (const reverse of [false, true]) {
                const root = await sessions.create(legacyUserId);
                const actions = [
                    () => sessions.rotate(root.refreshToken),
                    () => sessions.revoke(root.refreshToken),
                ];
                if (reverse) actions.reverse();
                const results = await contended(root.familyId, actions);
                const rotation = results[reverse ? 1 : 0];
                assert.equal(
                    results[reverse ? 0 : 1].status,
                    "fulfilled",
                    "Logout must succeed",
                );
                if (rotation.status === "rejected")
                    assert.ok(unauthorized(rotation.reason));
                await noUnrevokedFamily(root.familyId);
                await assert.rejects(
                    sessions.assertActive(legacyUserId, root.familyId),
                    unauthorized,
                );
            }
        },
    );

    await check(
        "expired and inactive-user refreshes commit revocation before rejecting",
        async () => {
            const expired = await sessions.create(legacyUserId);
            await prisma.session.update({
                where: { id: expired.familyId },
                data: { expiresAt: new Date(Date.now() - 10000) },
            });
            await assert.rejects(
                sessions.rotate(expired.refreshToken),
                unauthorized,
            );
            await noUnrevokedFamily(expired.familyId);
            const inactive = await sessions.create(legacyUserId);
            await prisma.user.update({
                where: { id: legacyUserId },
                data: { status: "inactive" },
            });
            try {
                await assert.rejects(
                    sessions.rotate(inactive.refreshToken),
                    unauthorized,
                );
                await noUnrevokedFamily(inactive.familyId);
            } finally {
                await prisma.user.update({
                    where: { id: legacyUserId },
                    data: { status: "active" },
                });
            }
        },
    );

    await check(
        "concurrent duplicate user identifiers are enforced by the migrated unique index",
        async () => {
            const data = {
                displayName: "Race User",
                email: "race@example.com",
                passwordHash: "test-only-hash",
                phoneVerified: 0,
                emailVerified: 0,
                kycStatus: 0,
                role: "user",
                status: "active",
            };
            const results = await Promise.allSettled([
                prisma.user.create({
                    data: { ...data, phone: "+84909990001" },
                }),
                prisma.user.create({
                    data: { ...data, phone: "+84909990002" },
                }),
            ]);
            assert.equal(
                results.filter((result) => result.status === "fulfilled")
                    .length,
                1,
            );
            const failures = results.filter(
                (result) => result.status === "rejected",
            );
            assert.equal(failures.length, 1);
            assert.equal(failures[0].reason.code, "P2002");
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
        console.error("FAIL auth database integration:", error);
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
            `PASS ${passed} real-PostgreSQL auth checks; temporary cluster stopped and removed`,
        );
}

main().catch((error) => {
    process.exitCode = 1;
    console.error("FAIL runner:", error);
});
