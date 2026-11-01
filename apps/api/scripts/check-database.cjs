"use strict";

const path = require("node:path");
const { lookup } = require("node:dns/promises");
const { Client } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

async function main() {
    let url;
    try {
        url = new URL(process.env.DATABASE_URL ?? "");
        if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
    } catch {
        throw new Error("DATABASE_URL must be a valid PostgreSQL URL in apps/api/.env");
    }
    // Show only public connection coordinates, never usernames/passwords or raw errors.
    console.log(`Checking PostgreSQL at ${url.hostname}:${url.port || "5432"}`);
    const addresses = await lookup(url.hostname, { all: true });
    console.log(`DNS address families: ${[...new Set(addresses.map(entry => `IPv${entry.family}`))].join(", ")}`);
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
        query_timeout: 5000,
    });
    try {
        await client.connect();
        await client.query("SELECT 1");
        console.log("PASS: PostgreSQL connection and query succeeded");
    } catch (error) {
        const codes = new Set([error?.code, ...(error?.errors ?? []).map(item => item?.code)]);
        const code = [...codes].find(value => typeof value === "string" && /^[A-Z0-9_]+$/.test(value)) ?? "CONNECTION_FAILED";
        if (codes.has("ENETUNREACH") && addresses.every(entry => entry.family === 6)) {
            throw new Error(`${code}: the database endpoint resolves only to IPv6, which this network cannot reach. For Supabase, copy the Session pooler connection from Connect (port 5432, username postgres.<project-ref>) into DATABASE_URL.`);
        }
        throw new Error(`${code}: PostgreSQL connection failed. Check DATABASE_URL, DNS, network and database access settings.`);
    } finally {
        await client.end().catch(() => {});
    }
}

main().catch(error => {
    // DNS errors can include driver-specific details; avoid printing raw exceptions.
    console.error(error?.syscall ? `Database DNS lookup failed (${error.code})` : error.message);
    process.exitCode = 1;
});
