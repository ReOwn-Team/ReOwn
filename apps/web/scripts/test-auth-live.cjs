#!/usr/bin/env node
let captcha;
// Isolated, real NestJS + PostgreSQL + Chromium integration. Never uses .env's DB.
const { spawn } = require("node:child_process");
const {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
  existsSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const { createServer } = require("node:net");
const web = path.resolve(__dirname, "..");
const api = path.resolve(web, "../api");
const { Pool } = require(path.join(api, "node_modules/pg"));
const { chromium } = require(path.join(web, "node_modules/@playwright/test"));
const { createClient } = require("redis");
const redis = createClient({
  url: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
  socket: { reconnectStrategy: false },
});
redis.on("error", () => {});
const prefix = `reown:test:live:${randomUUID()}:`;
let directory,
  postgres,
  apiServer,
  webServer,
  browser,
  pool,
  r2,
  watchProbe,
  watchAssetProbe,
  watchConfig,
  watchOutput,
  mail;
function child(binary, args, cwd, env, group = false) {
  const process = spawn(binary, args, {
    cwd,
    detached: group,
    env: { ...global.process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.ownGroup = group;
  process.stdout.resume();
  process.stderr.resume();
  return process;
}
function exit(process) {
  return new Promise((resolve, reject) => {
    process.once("error", reject);
    process.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error("Integration setup command failed")),
    );
  });
}
async function command(binary, args, cwd, env) {
  await exit(child(binary, args, cwd, env));
}
async function stop(process) {
  if (!process || process.exitCode !== null) return;
  const done = new Promise((resolve) => process.once("exit", resolve));
  if (process.ownGroup) global.process.kill(-process.pid, "SIGTERM");
  else process.kill("SIGTERM");
  const timer = setTimeout(() => {
    try {
      if (process.ownGroup) global.process.kill(-process.pid, "SIGKILL");
      else process.kill("SIGKILL");
    } catch {}
  }, 4000);
  await done;
  clearTimeout(timer);
}
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
async function requirePort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is in use; stop no existing services automatically`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}
async function until(action, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      if (await action()) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}
(async () => {
  try {
    assert.notEqual(process.getuid?.(), 0, "Run as a non-root user for initdb");
    await redis.connect();
    r2 = await require("../../api/tests/helpers/r2-server.cjs")();
    captcha = await require("../../api/tests/helpers/hcaptcha-server.cjs")();
    mail = await require("../../api/tests/helpers/resend-server.cjs")();
    const apiPort = await freePort();
    await requirePort(3102);
    directory = mkdtempSync(path.join(tmpdir(), "reown-web-auth-"));
    chmodSync(directory, 0o700);
    const password = randomBytes(32).toString("base64url");
    const passwordFile = path.join(directory, "pg-password");
    writeFileSync(passwordFile, password + "\n", { mode: 0o600 });
    const data = path.join(directory, "data");
    const port = await freePort();
    const databaseUrl = new URL(
      `postgresql://reown_web_test@127.0.0.1:${port}/postgres`,
    );
    databaseUrl.password = password;
    databaseUrl.searchParams.set("sslmode", "disable");
    const env = {
      ...r2.env,
      ...mail.env,
      OTP_SECRET: randomBytes(48).toString("hex"),
      REDIS_KEY_PREFIX: prefix + "api:",
      PRODUCT_STORAGE_DRIVER: "r2",
      DATABASE_URL: databaseUrl.toString(),
      JWT_SECRET: randomBytes(48).toString("hex"),
      CLIENT_ORIGIN: "http://localhost:3102",
      COOKIE_SECURE: "false",
      COOKIE_SAMESITE: "lax",
      PORT: String(apiPort),
      NODE_ENV: "test",
      ...captcha.env,
      DOTENV_CONFIG_OVERRIDE: "false",
      TZ: "UTC",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
      PRODUCT_UPLOAD_DIR: path.join(directory, "images"),
    };
    await command(
      "initdb",
      [
        "-D",
        data,
        "--username=reown_web_test",
        "--auth-local=reject",
        "--auth-host=scram-sha-256",
        `--pwfile=${passwordFile}`,
        "--no-locale",
        "--encoding=UTF8",
      ],
      api,
      env,
    );
    postgres = child(
      "postgres",
      [
        "-D",
        data,
        "-h",
        "127.0.0.1",
        "-k",
        "",
        "-p",
        String(port),
        "-c",
        "shared_buffers=16MB",
      ],
      api,
      env,
    );
    pool = new Pool({
      connectionString: databaseUrl.toString(),
      connectionTimeoutMillis: 1000,
    });
    pool.on("error", () => {});
    await until(async () => {
      await pool.query("SELECT 1");
      return true;
    }, "temporary PostgreSQL");
    await command("npm", ["run", "prisma:deploy"], api, env);
    if (process.argv.includes("--watch-build")) {
      const devOutput = (watchOutput = path.join(
        api,
        `.dev-dist-test-${randomUUID()}`,
      ));
      const config = (watchConfig = path.join(
        api,
        `.tsconfig.watch-test-${randomUUID()}.json`,
      ));
      writeFileSync(
        config,
        JSON.stringify({
          extends: path.join(api, "tsconfig.dev.json"),
          compilerOptions: { outDir: devOutput },
        }),
      );
      apiServer = child(
        process.execPath,
        [
          "node_modules/@nestjs/cli/bin/nest.js",
          "start",
          "--watch",
          "--path",
          path.basename(config),
        ],
        api,
        env,
        true,
      );
      let starts = 0,
        missing = false;
      apiServer.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        starts += (text.match(/Nest application successfully started/g) ?? [])
          .length;
        missing ||= /MODULE_NOT_FOUND|Cannot find module/.test(text);
      });
      apiServer.stderr.on("data", (chunk) => {
        missing ||= /MODULE_NOT_FOUND|Cannot find module/.test(
          chunk.toString(),
        );
      });
      await until(
        async () =>
          starts > 0 &&
          (await fetch(`http://localhost:${apiPort}/api/v1/health`)).ok,
        "Nest watch startup",
      );
      for (const file of [
        "inspection/templates/v1.txt",
        "inspection/templates/v2.txt",
        "inspection/workers/heic.cjs",
        "otp/templates/otp.html",
      ]) {
        await until(
          async () => existsSync(path.join(devOutput, file)),
          `watch asset ${file}`,
        );
      }
      // Nest's expanded file globs watch existing files only. A directory watch
      // must also copy templates introduced after the CLI has already started.
      const assetName = `__watch_asset_${randomUUID()}.txt`;
      watchAssetProbe = path.join(api, "src/inspection/templates", assetName);
      const copiedAsset = path.join(
        devOutput,
        "inspection/templates",
        assetName,
      );
      writeFileSync(watchAssetProbe, "asset-v1");
      await until(
        async () =>
          existsSync(copiedAsset) &&
          readFileSync(copiedAsset, "utf8") === "asset-v1",
        "new template copied while watch is running",
      );
      writeFileSync(watchAssetProbe, "asset-v2");
      await until(
        async () => readFileSync(copiedAsset, "utf8") === "asset-v2",
        "template update copied while watch is running",
      );
      rmSync(watchAssetProbe);
      await until(
        async () => !existsSync(copiedAsset),
        "deleted template removed from watch output",
      );
      watchAssetProbe = undefined;
      await command("npm", ["run", "build"], api, env);
      assert.ok(existsSync(path.join(devOutput, "main.js")));
      assert.ok(existsSync(path.join(devOutput, "generated/prisma/client.js")));
      watchProbe = path.join(
        api,
        "src",
        `__watch_probe_${randomUUID().replace(/-/g, "")}.ts`,
      );
      const before = starts;
      writeFileSync(watchProbe, "export const watchProbe = 1;\n");
      await until(
        async () =>
          starts > before &&
          (await fetch(`http://localhost:${apiPort}/api/v1/health`)).ok,
        "watch restart after parallel build",
      );
      const next = starts;
      writeFileSync(watchProbe, "export const watchProbe = 2;\n");
      await until(
        async () =>
          starts > next &&
          (await fetch(`http://localhost:${apiPort}/api/v1/health`)).ok,
        "second incremental restart",
      );
      assert.equal(
        missing,
        false,
        "Watch must retain its entry point and generated Prisma client",
      );
      console.log(
        "PASS watch/build isolation: new/updated/deleted templates synchronized; build succeeds while watch stays healthy; two incremental restarts load Prisma correctly",
      );
    } else apiServer = child(process.execPath, ["dist/main.js"], api, env);
    await until(
      async () => (await fetch(`http://localhost:${apiPort}/api/v1/health`)).ok,
      "NestJS API",
    );
    if (process.argv.includes("--inspection")) {
      await require("./exercise-inspection.cjs")({
        pool,
        apiPort,
        storage: r2,
        mail,
        databaseUrl: databaseUrl.toString(),
        prefix,
      });
      return;
    }
    webServer = child(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3102",
      ],
      web,
      {
        NODE_ENV: "production",
        API_INTERNAL_URL: `http://localhost:${apiPort}`,
        WEB_ORIGIN: "http://localhost:3102",
        API_CLIENT_ORIGIN: "http://localhost:3102",
        REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
        WEB_SESSION_PREFIX: prefix,
      },
    );
    await until(
      async () => (await fetch("http://localhost:3102")).ok,
      "Next.js production server",
    );
    browser = await chromium.launch({
      executablePath: process.env.PW_CHROMIUM || undefined,
    });
    const context = await browser.newContext();
    await require("./captcha-fixture.cjs")(context);
    const page = await context.newPage();
    await page.goto("http://localhost:3102/account");
    await page
      .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
      .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog.getByRole("button", { name: "Đăng ký", exact: true }).click();
    const email = `web-${randomUUID()}@example.com`;
    const accountPassword = randomBytes(24).toString("base64url");
    await dialog.getByLabel("Họ và tên").fill("Kiểm thử auth");
    await dialog.getByLabel("Email", { exact: true }).fill(email);
    await dialog
      .getByLabel("Số điện thoại", { exact: true })
      .fill("0901234567");
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(accountPassword);
    await dialog.locator("button[type=submit]").click();
    await dialog.getByRole("button", { name: "Tôi là con người" }).click();
    await dialog.getByLabel("Mã xác nhận", { exact: true }).waitFor();
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM users WHERE email=$1",
          [email],
        )
      ).rows[0].count,
      0,
      "Registration must not create a user before OTP",
    );
    assert.ok(
      !(await context.cookies()).some(
        (cookie) => cookie.name === "reown_web_session",
      ),
    );
    await dialog.getByLabel("Mã xác nhận", { exact: true }).waitFor();
    await dialog
      .getByLabel("Mã xác nhận", { exact: true })
      .fill(mail.code(email));
    await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByLabel("Tên hiển thị").fill("Tên từ API thật");
    await page
      .getByRole("button", { name: "Lưu thay đổi", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Đã lưu thay đổi" })
      .waitFor();
    if (process.argv.includes("--selling"))
      await require("./exercise-selling.cjs")({
        page,
        browser,
        pool,
        apiPort,
        directory,
        storage: r2,
        mail,
      });
    const beforeCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "reown_web_session",
    );
    assert.ok(
      beforeCookie?.httpOnly,
      "Opaque web session cookie must be HttpOnly",
    );
    assert.ok(
      !(await page.evaluate(() => document.cookie)).includes(
        "reown_web_session",
      ),
      "JS must not read web session cookies",
    );
    await page.reload();
    await page.getByLabel("Tên hiển thị").waitFor();
    await until(
      () => page.getByLabel("Tên hiển thị").isEnabled(),
      "profile loaded",
    );
    assert.equal(
      await page.getByLabel("Tên hiển thị").inputValue(),
      "Tên từ API thật",
    );
    const afterCookie = (await context.cookies()).find(
      (cookie) => cookie.name === "reown_web_session",
    );
    assert.ok(
      afterCookie && beforeCookie.value === afterCookie.value,
      "Reload must preserve the web session cookie",
    );
    const sessionKey = `${prefix}session:${createHash("sha256").update(beforeCookie.value).digest("hex")}`;
    const cached = JSON.parse(await redis.get(sessionKey));
    const beforeCount = await pool.query(
      "SELECT count(*)::int AS count FROM sessions",
    );
    cached.accessExpiresAt = Date.now() - 1;
    await redis.set(sessionKey, JSON.stringify(cached), {
      PXAT: cached.expiresAt,
    });
    await page.reload();
    await page.getByLabel("Tên hiển thị").waitFor();
    await until(
      () => page.getByLabel("Tên hiển thị").isEnabled(),
      "profile loaded",
    );
    const rotated = JSON.parse(await redis.get(sessionKey));
    assert.notEqual(
      rotated.refreshCookie,
      cached.refreshCookie,
      "Expired access token must rotate on server",
    );
    const afterCount = await pool.query(
      "SELECT count(*)::int AS count FROM sessions",
    );
    assert.equal(afterCount.rows[0].count, beforeCount.rows[0].count + 1);
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await page
      .getByRole("heading", { name: "Đăng nhập để quản lý tài khoản" })
      .waitFor();
    assert.ok(
      !(await context.cookies()).some(
        (cookie) => cookie.name === "reown_web_session",
      ),
      "Logout must clear the web session cookie",
    );
    await page
      .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
      .click();
    const cooldowns = await redis.keys(prefix + "api:otp:cooldown:*");
    if (cooldowns.length) await redis.del(cooldowns);
    await dialog.getByLabel("Email hoặc số điện thoại").fill(email);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(accountPassword);
    await dialog.locator("button[type=submit]").click();
    await dialog.getByRole("button", { name: "Tôi là con người" }).click();
    await dialog.getByLabel("Mã xác nhận", { exact: true }).waitFor();
    await dialog
      .getByLabel("Mã xác nhận", { exact: true })
      .fill(mail.code(email));
    await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    const second = await context.newPage();
    await second.goto("http://localhost:3102/account");
    await second.getByLabel("Tên hiển thị").waitFor();
    assert.equal(
      await second.getByLabel("Tên hiển thị").inputValue(),
      "Tên từ API thật",
    );
    await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await second
      .getByRole("heading", { name: "Đăng nhập để quản lý tài khoản" })
      .waitFor();
    const result = await pool.query(
      "SELECT display_name FROM users WHERE email=$1",
      [email],
    );
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].display_name, "Tên từ API thật");
    const sessions = await pool.query(
      "SELECT count(*)::int AS count FROM sessions WHERE revoked_at IS NULL",
    );
    assert.equal(sessions.rows[0].count, 0);
    console.log(
      "PASS real PostgreSQL + NestJS + browser: register/login with email OTP, server Bearer profile, PATCH, Redis reload, server token rotation, logout, cross-tab logout, persisted database changes and revoked session families",
    );
  } finally {
    await browser?.close();
    await stop(webServer);
    await stop(apiServer);
    if (watchProbe) rmSync(watchProbe, { force: true });
    if (watchAssetProbe) rmSync(watchAssetProbe, { force: true });
    if (watchConfig) rmSync(watchConfig, { force: true });
    if (watchOutput) rmSync(watchOutput, { recursive: true, force: true });
    await r2?.close();
    await captcha?.close();
    await mail?.close();
    await pool?.end();
    await stop(postgres);
    if (directory) rmSync(directory, { recursive: true, force: true });
    if (redis.isReady) {
      const keys = await redis.keys(prefix + "*");
      if (keys.length) await redis.del(keys);
      await redis.quit();
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
