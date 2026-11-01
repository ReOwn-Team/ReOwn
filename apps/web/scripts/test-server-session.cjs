#!/usr/bin/env node
// Real Next.js + Redis; isolated fake NestJS upstream. Never uses the app database.
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const { randomBytes, createHash } = require("node:crypto");
const path = require("node:path");
const { createClient } = require("redis");
const { chromium } = require("@playwright/test");
const web = path.resolve(__dirname, "..");
const prefix = `reown:test:bff:${randomBytes(12).toString("hex")}:`;
const redis = createClient({
  url: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
  socket: { reconnectStrategy: false, connectTimeout: 1500 },
});
redis.on("error", () => {});
const children = [];
let browser, upstream, origin, second;
let refreshes = 0,
  loseRefresh = false,
  logoutFailure = false;
let profile = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Nguyễn An",
  email: "nguyenan@example.com",
  phone: "+84901234567",
  avatarKey: null,
  emailVerified: 0,
  phoneVerified: 0,
  kycStatus: 0,
  role: "user",
  status: "active",
};
const challenges = new Set();
const refreshTokens = new Set(),
  accessTokens = new Set();
const password = "server-session-test-password";
function grant(res, status = 200) {
  const token = randomBytes(32).toString("base64url"),
    access = randomBytes(32).toString("base64url");
  refreshTokens.add(token);
  accessTokens.add(access);
  res.setHeader(
    "Set-Cookie",
    `reown_refresh=${token}; HttpOnly; Path=/api/v1/auth; Expires=${new Date(Date.now() + 86400000).toUTCString()}; SameSite=Lax`,
  );
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      user: profile,
      accessToken: access,
      tokenType: "Bearer",
      expiresIn: 900,
    }),
  );
}
function reply(res, status, body = {}) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );
}
async function freePort() {
  const s = createServer();
  const p = await listen(s);
  await new Promise((r) => s.close(r));
  return p;
}
async function startWeb(port, apiPort, extra = {}) {
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: web,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
        WEB_ORIGIN: origin,
        API_CLIENT_ORIGIN: origin,
        REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
        WEB_SESSION_PREFIX: prefix,
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.push(child);
  child.stdout.resume();
  child.stderr.resume();
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error("Next server exited");
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/auth/session`)).ok)
        return child;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Next startup timed out");
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const done = new Promise((r) => child.once("exit", r));
  child.kill();
  const t = setTimeout(() => child.kill("SIGKILL"), 3000);
  await done;
  clearTimeout(t);
}
function key(cookie) {
  const id = cookie.split("=")[1];
  return `${prefix}session:${createHash("sha256").update(id).digest("hex")}`;
}
async function call(
  route,
  cookie,
  method = "GET",
  body,
  base = origin,
  requestOrigin = origin,
) {
  return fetch(base + route, {
    method,
    headers: {
      "X-HCaptcha-Response": "10000000-aaaa-bbbb-cccc-000000000001",
      Origin: requestOrigin,
      "X-ReOwn-Client": "web",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function login(base = origin) {
  let r = await call(
    "/api/auth/login",
    null,
    "POST",
    { identifier: profile.email, password },
    base,
  );
  assert.equal(r.status, 202);
  assert.equal(r.headers.get("set-cookie"), null);
  const challenge = await r.json();
  r = await call(
    "/api/auth/otp-verify",
    null,
    "POST",
    { challengeId: challenge.challengeId, code: "123456" },
    base,
  );
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.deepEqual(Object.keys(data), ["user"]);
  const set = r.headers.getSetCookie()[0];
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=lax/i);
  assert.match(set, /Path=\//);
  assert.doesNotMatch(set, /reown_refresh/);
  return set.split(";")[0];
}
async function expire(cookie) {
  const k = key(cookie),
    record = JSON.parse(await redis.get(k));
  record.accessExpiresAt = Date.now() - 1;
  await redis.set(k, JSON.stringify(record), { PXAT: record.expiresAt });
}
(async () => {
  try {
    await redis.connect();
    upstream = createServer(async (req, res) => {
      try {
        let text = "";
        for await (const chunk of req) text += chunk;
        const body = text ? JSON.parse(text) : {};
        assert.equal(req.headers.origin, origin);
        assert.equal(req.headers["x-reown-client"], "web");
        if (
          req.url === "/api/v1/users/login" ||
          req.url === "/api/v1/users/register"
        ) {
          assert.equal(req.headers["x-hcaptcha-response"], "10000000-aaaa-bbbb-cccc-000000000001");
          if (body.password !== password) {
            reply(res, 401);
            return;
          }
          const challengeId = randomBytes(32).toString("base64url");
          challenges.add(challengeId);
          reply(res, 202, {
            requiresOtp: true,
            challengeId,
            emailHint: "n***@example.com",
            expiresIn: 300,
            resendAfter: 60,
          });
          return;
        }
        if (req.url === "/api/v1/auth/otp/verify") {
          if (body.code !== "123456" || !challenges.delete(body.challengeId)) {
            reply(res, 401);
            return;
          }
          grant(res);
          return;
        }
        if (req.url === "/api/v1/auth/refresh") {
          refreshes++;
          const token = req.headers.cookie?.split("=")[1];
          if (!refreshTokens.delete(token)) {
            reply(res, 401);
            return;
          }
          await new Promise((r) => setTimeout(r, 80));
          if (loseRefresh) {
            res.destroy();
            return;
          }
          grant(res);
          return;
        }
        if (req.url === "/api/v1/auth/logout") {
          if (logoutFailure) {
            reply(res, 500);
            return;
          }
          refreshTokens.delete(req.headers.cookie?.split("=")[1]);
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.url === "/api/v1/users/me") {
          if (
            !accessTokens.has(
              req.headers.authorization?.replace(/^Bearer /, ""),
            )
          ) {
            reply(res, 401);
            return;
          }
          if (req.method === "PATCH") {
            assert.deepEqual(Object.keys(body), ["displayName"]);
            profile = { ...profile, displayName: body.displayName };
          }
          reply(res, 200, profile);
          return;
        }
        reply(res, 404);
      } catch {
        reply(res, 500);
      }
    });
    const apiPort = await listen(upstream),
      port = await freePort(),
      port2 = await freePort();
    origin = `http://127.0.0.1:${port}`;
    second = `http://127.0.0.1:${port2}`;
    await startWeb(port, apiPort);
    await startWeb(port2, apiPort);
    assert.equal(
      (
        await call(
          "/api/auth/login",
          null,
          "POST",
          { identifier: profile.email, password },
          origin,
          "https://evil.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(origin + "/api/auth/session", {
          headers: { "Sec-Fetch-Site": "cross-site" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/auth/login", null, "POST", {
          password: "x".repeat(17000),
        })
      ).status,
      413,
    );
    let cookie = await login();
    const original = JSON.parse(await redis.get(key(cookie)));
    assert.ok(original.accessToken);
    assert.ok(original.refreshCookie);
    assert.ok((await redis.pTTL(key(cookie))) > 0);
    const durations = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now(),
        r = await call("/api/auth/session", cookie);
      assert.equal((await r.json()).user.id, profile.id);
      durations.push(Math.round(performance.now() - start));
    }
    assert.equal(refreshes, 0);
    let html = await (await call("/", cookie)).text();
    assert.ok(html.includes("Nguyễn An"));
    assert.ok(!html.includes(original.accessToken));
    assert.ok(!html.includes(original.refreshCookie));
    console.log(
      "PASS: five warm restores, no upstream refresh; local timings ms:",
      durations.join(", "),
    );
    await expire(cookie);
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        call(
          "/api/auth/session",
          cookie,
          "GET",
          undefined,
          i % 2 ? second : origin,
        ),
      ),
    );
    for (const r of responses) {
      assert.equal(r.status, 200);
      assert.equal((await r.json()).user.id, profile.id);
    }
    assert.equal(refreshes, 1);
    const rotated = JSON.parse(await redis.get(key(cookie)));
    assert.notEqual(rotated.refreshCookie, original.refreshCookie);
    assert.equal(rotated.expiresAt, original.expiresAt);
    console.log(
      "PASS: concurrent requests across two Next servers rotate exactly once, absolute TTL preserved",
    );
    accessTokens.clear();
    let r = await call("/api/v1/users/me", cookie, "PATCH", {
      displayName: "Tên mới",
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).displayName, "Tên mới");
    assert.equal(refreshes, 2);
    assert.equal(
      (await (await call("/api/auth/session", cookie)).json()).user.displayName,
      "Tên mới",
    );
    console.log(
      "PASS: upstream 401 refreshes once and profile changes update the cached session",
    );
    logoutFailure = true;
    assert.equal((await call("/api/auth/logout", cookie, "POST")).status, 500);
    assert.ok(await redis.get(key(cookie)));
    logoutFailure = false;
    assert.equal((await call("/api/auth/logout", cookie, "POST")).status, 204);
    assert.equal(await redis.get(key(cookie)), null);
    assert.equal(
      (await (await call("/api/auth/session", cookie)).json()).user,
      null,
    );
    console.log(
      "PASS: logout failure retains session, successful logout removes session across instances",
    );
    cookie = await login();
    await expire(cookie);
    loseRefresh = true;
    const before = refreshes;
    assert.equal((await call("/api/auth/session", cookie)).status, 503);
    loseRefresh = false;
    assert.equal((await call("/api/auth/session", cookie)).status, 401);
    assert.equal(refreshes, before + 1);
    assert.equal(
      (await (await call("/api/auth/session", cookie)).json()).user,
      null,
    );
    console.log(
      "PASS: ambiguous rotation is never replayed after a lost response",
    );
    cookie = await login();
    let record = JSON.parse(await redis.get(key(cookie)));
    record.refreshing = true;
    await redis.set(key(cookie), JSON.stringify(record), { PX: 10000 });
    const beforeCrash = refreshes;
    assert.equal((await call("/api/auth/session", cookie)).status, 401);
    assert.equal(refreshes, beforeCrash);
    cookie = await login();
    await redis.pExpire(key(cookie), 1);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(
      (await (await call("/api/auth/session", cookie)).json()).user,
      null,
    );
    console.log(
      "PASS: crashed-worker barrier and expired Redis sessions fail closed",
    );
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PW_CHROMIUM,
    });
    const context = await browser.newContext();
    await require("./captcha-fixture.cjs")(context);
    const page = await context.newPage();
    const browserRequests = [];
    page.on("request", (r) => browserRequests.push(r.url()));
    await page.goto(origin + "/");
    await page
      .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
      .click();
    const dialog = page.locator("dialog.auth-dialog");
    await dialog.getByLabel("Email hoặc số điện thoại").fill(profile.email);
    await dialog.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await dialog.locator("button[type=submit]").click();
    await dialog.getByRole("button", {name:"Tôi là con người"}).click();
    await dialog.getByLabel("Mã xác nhận", { exact: true }).fill("123456");
    await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await page
      .getByRole("link", { name: "Tài khoản Tên mới", exact: true })
      .waitFor();
    const beforeReload = refreshes;
    await page.reload();
    await page
      .getByRole("link", { name: "Tài khoản Tên mới", exact: true })
      .waitFor();
    assert.equal(refreshes, beforeReload);
    assert.ok(
      browserRequests.every(
        (u) => !u.startsWith(`http://127.0.0.1:${apiPort}`),
      ),
    );
    const storage = await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
        cookie: document.cookie,
      }),
    );
    assert.ok(!storage.includes("accessToken"));
    assert.ok(!storage.includes("reown_web_session"));
    assert.ok(!storage.includes(password));
    const tab = await context.newPage();
    await tab.goto(origin + "/account");
    await tab.getByRole("button", { name: "Đăng xuất", exact: true }).click();
    await page
      .getByRole("button", { name: "Đăng nhập / Đăng ký", exact: true })
      .waitFor();
    await context.close();
    console.log(
      "PASS: Chromium login/reload and cross-tab logout; browser never receives API tokens",
    );
    await stop(children[1]);
    await startWeb(port2, apiPort, {
      REDIS_URL: `redis://127.0.0.1:${await freePort()}`,
    });
    cookie = await login();
    assert.equal(
      (await call("/api/auth/session", cookie, "GET", undefined, second))
        .status,
      503,
    );
    console.log("PASS: unavailable Redis returns 503, no memory fallback");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    for (const c of children) await stop(c);
    if (upstream) await new Promise((r) => upstream.close(r));
    if (redis.isReady) {
      const keys = await redis.keys(prefix + "*");
      if (keys.length) await redis.del(keys);
      await redis.quit();
    }
  }
})();
