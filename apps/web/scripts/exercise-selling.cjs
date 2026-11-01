const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const sharp = require("../../api/node_modules/sharp");
module.exports = async function exercise({
  page,
  browser,
  pool,
  apiPort,
  storage,
  mail,
}) {
  const base = "http://localhost:3102",
    api = `http://localhost:${apiPort}/api/v1`;
  const csrf = { Origin: base, "X-ReOwn-Client": "web" };
  const fixture = require("../../api/tests/helpers/photo-fixture.cjs");
  const photo = await fixture(),
    photo2 = await fixture({ color: "#3180da" });
  const adminEmail = `admin-${randomUUID()}@example.com`;
  let adminResponse = await fetch(api + "/users/register", {
    method: "POST",
    headers: {
      ...csrf,
      "X-HCaptcha-Response": "10000000-aaaa-bbbb-cccc-000000000001",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      displayName: "Review admin",
      email: adminEmail,
      phone: "+84987654322",
      password: "isolated-admin-test-password",
    }),
  });
  assert.equal(adminResponse.status, 202);
  const challenge = await adminResponse.json();
  adminResponse = await fetch(api + "/auth/otp/verify", {
    method: "POST",
    headers: { ...csrf, "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: challenge.challengeId,
      code: mail.code(adminEmail),
    }),
  });
  assert.equal(adminResponse.status, 200);
  const admin = await adminResponse.json();
  await pool.query("UPDATE users SET role='admin' WHERE id=$1", [
    admin.user.id,
  ]);
  async function approve(id) {
    const review = (
      await pool.query(
        "SELECT id,revision FROM product_reviews WHERE product_id=$1 ORDER BY revision DESC LIMIT 1",
        [id],
      )
    ).rows[0];
    const response = await fetch(
      api + `/admin/product-reviews/${review.id}/decision`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${admin.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          revision: review.revision,
          decision: "approve",
        }),
      },
    );
    assert.equal(response.status, 201);
  }
  await page.goto(base + "/sell");
  await page
    .getByLabel("Tên sản phẩm", { exact: true })
    .fill("Laptop đăng bán kiểm thử");
  await page
    .getByLabel("Mô tả chi tiết")
    .fill(
      "Laptop cá nhân đang hoạt động tốt, có sạc và có thể kiểm tra trước khi nhận.",
    );
  await page.getByLabel("Giá bán (đ)", { exact: true }).fill("1250000");
  await page.getByLabel("Ảnh sản phẩm", { exact: true }).setInputFiles([
    { name: "front.jpg", mimeType: "image/jpeg", buffer: photo },
    { name: "back.jpg", mimeType: "image/jpeg", buffer: photo2 },
  ]);
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận thông tin phản ánh đúng tình trạng sản phẩm.",
    })
    .check();
  await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
  await page.reload();
  await page.getByLabel("Tên sản phẩm", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("Tên sản phẩm", { exact: true }).inputValue(),
    "Laptop đăng bán kiểm thử",
  );
  assert.equal(await page.locator(".sell-photo").count(), 2);
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận thông tin phản ánh đúng tình trạng sản phẩm.",
    })
    .check();
  await page.locator('main button[type="submit"]').first().click();
  await page.getByRole("dialog").waitFor();
  const rows = await pool.query(
    "SELECT id, seller_id, amount FROM products WHERE title=$1",
    ["Laptop đăng bán kiểm thử"],
  );
  assert.equal(rows.rows.length, 1);
  const id = rows.rows[0].id;
  assert.equal(rows.rows[0].amount, 1);
  const read = async () => {
    const r = await fetch(`${api}/products/${id}`);
    assert.equal(r.status, 200);
    return r.json();
  };
  assert.equal((await fetch(`${api}/products/${id}`)).status, 404);
  await approve(id);
  const original = await read();
  assert.equal(original.images.length, 2);
  assert.equal(original.price, 1250000);
  for (const image of original.images) {
    const r = await fetch(base + image.url);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("Content-Type"), "image/webp");
    assert.equal(
      (await sharp(Buffer.from(await r.arrayBuffer())).metadata()).format,
      "webp",
    );
  }
  const otherContext = await browser.newContext();
  const visitor = await otherContext.newPage();
  await visitor.goto(`${base}/products/${id}`);
  await visitor
    .getByRole("heading", { name: "Laptop đăng bán kiểm thử", exact: true })
    .waitFor();
  assert.equal(
    await visitor
      .getByRole("button", { name: "Đặt hàng", exact: true })
      .isDisabled(),
    true,
  );
  await visitor.goto(`${base}/checkout?product=${id}`);
  await visitor
    .getByRole("heading", {
      name: "Chưa hỗ trợ đặt hàng cho sản phẩm này",
      exact: true,
    })
    .waitFor();
  await otherContext.close();
  console.log(
    "PASS selling: draft reload, two real photos, persisted listing, public detail from another browser, no simulated order for real item",
  );
  await page.goto(base + "/listings");
  await page.getByRole("button", { name: /^Thêm thao tác:/ }).click();
  await page.getByRole("menuitem", { name: "Ẩn tin", exact: true }).click();
  await page.getByRole("button", { name: /^Thêm thao tác:/ }).click();
  await page.getByRole("menuitem", { name: "Hiện lại", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal((await fetch(`${api}/products/${id}`)).status, 404);
  await page.getByRole("link", { name: "Chỉnh sửa", exact: true }).click();
  await page
    .getByLabel("Tên sản phẩm", { exact: true })
    .fill("Laptop đã cập nhật thật");
  await page.getByRole("button", { name: "Đặt làm ảnh bìa" }).last().click();
  await page
    .getByRole("checkbox", {
      name: "Tôi xác nhận thông tin phản ánh đúng tình trạng sản phẩm.",
    })
    .check();
  await page.locator('main button[type="submit"]').first().click();
  await page.getByRole("dialog").waitFor();
  await approve(id);
  await page.goto(base + "/listings");
  await page.getByRole("button", { name: /^Thêm thao tác:/ }).waitFor();
  const updated = await read();
  assert.equal(updated.title, "Laptop đã cập nhật thật");
  assert.equal(updated.images[0].id, original.images[1].id);
  assert.equal(updated.images[1].id, original.images[0].id);
  console.log(
    "PASS selling: hide removes public access, edit persists, photo cover order retained, republish restores public listing",
  );
  const otherEmail = `other-${randomUUID()}@example.com`,
    otherPassword = "isolated-selling-test-password";
  let registration = await fetch(api + "/users/register", {
    method: "POST",
    headers: {
      "X-HCaptcha-Response": "10000000-aaaa-bbbb-cccc-000000000001",
      ...csrf,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      displayName: "Other seller",
      email: otherEmail,
      phone: "+84987654321",
      password: otherPassword,
    }),
  });
  assert.equal(registration.status, 202);
  const pending = await registration.json();
  registration = await fetch(api + "/auth/otp/verify", {
    method: "POST",
    headers: { ...csrf, "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId: pending.challengeId,
      code: mail.code(otherEmail),
    }),
  });
  assert.equal(registration.status, 200);
  const other = await registration.json();
  const otherHeaders = { Authorization: `Bearer ${other.accessToken}` };
  assert.equal(
    (await fetch(`${api}/products/mine/${id}`, { headers: otherHeaders }))
      .status,
    404,
  );
  assert.equal(
    (
      await fetch(`${api}/products/${id}/status`, {
        method: "PATCH",
        headers: { ...otherHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "sold" }),
      })
    ).status,
    404,
  );
  const requestId = randomUUID();
  function submission(title = "Idempotent listing") {
    const form = new FormData();
    form.append(
      "data",
      JSON.stringify({
        requestId,
        title,
        category: "Laptop",
        description: "A sufficiently long description for validation.",
        price: 1000,
        condition: "Dùng tốt",
        knownDefects: "",
        location: "TP.HCM",
        fulfillmentMethods: ["meetup"],
        images: [{ upload: 0 }],
        confirmed: true,
      }),
    );
    form.append("files", new Blob([photo], { type: "image/png" }), "real.png");
    return form;
  }
  const duplicate = await Promise.all(
    [1, 2].map(() =>
      fetch(`${api}/products`, {
        method: "POST",
        headers: otherHeaders,
        body: submission(),
      }),
    ),
  );
  for (const response of duplicate) assert.equal(response.status, 201);
  assert.equal((await duplicate[0].json()).id, (await duplicate[1].json()).id);
  assert.equal(
    (
      await fetch(`${api}/products`, {
        method: "POST",
        headers: otherHeaders,
        body: submission("Different payload"),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM products WHERE id=$1",
        [requestId],
      )
    ).rows[0].count,
    1,
  );
  console.log(
    "PASS selling: concurrent duplicate submissions create one listing; changed payload with reused request ID is rejected",
  );
  const beforeFiles = storage.objects.size;
  const invalid = new FormData();
  invalid.append(
    "data",
    JSON.stringify({
      title: "Forged listing",
      category: "Laptop",
      description: "A sufficiently long description for validation.",
      price: 1000,
      condition: "Dùng tốt",
      knownDefects: "",
      location: "TP.HCM",
      fulfillmentMethods: ["meetup"],
      images: [{ upload: 0 }],
      confirmed: true,
    }),
  );
  invalid.append(
    "files",
    new Blob(["this is not an actual PNG"], { type: "image/png" }),
    "forged.png",
  );
  assert.equal(
    (
      await fetch(`${api}/products`, {
        method: "POST",
        headers: otherHeaders,
        body: invalid,
      })
    ).status,
    400,
  );
  assert.equal(storage.objects.size, beforeFiles);
  assert.equal(
    (await fetch(`${api}/products`, { method: "POST", body: invalid })).status,
    401,
  );
  await fetch(api + "/auth/logout", {
    method: "POST",
    headers: {
      ...csrf,
      Cookie: registration.headers.getSetCookie()[0].split(";")[0],
    },
  });
  console.log(
    "PASS selling: another seller cannot read/change owned listing, forged image rejected and cleaned up, anonymous publish rejected",
  );
  await page.getByRole("button", { name: /^Thêm thao tác:/ }).click();
  await page
    .getByRole("menuitem", { name: "Đánh dấu đã bán", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận đã bán", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal((await fetch(`${api}/products/${id}`)).status, 404);
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "reown_web_session",
  );
  const result = await fetch(`${base}/api/products/${id}/status`, {
    method: "PATCH",
    headers: {
      ...csrf,
      Cookie: `reown_web_session=${cookie.value}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "published" }),
  });
  assert.equal(result.status, 409);
  assert.equal(
    (await pool.query("SELECT status FROM products WHERE id=$1", [id])).rows[0]
      .status,
    "sold",
  );
  console.log(
    "PASS selling: sold listing cannot be republished; state persisted in PostgreSQL",
  );

  const disposable = submission("BFF deletion fixture");
  disposable.set(
    "data",
    JSON.stringify({
      ...JSON.parse(disposable.get("data")),
      requestId: randomUUID(),
    }),
  );
  const sessionHeaders = {
    ...csrf,
    Cookie: `reown_web_session=${cookie.value}`,
  };
  const created = await fetch(`${base}/api/products`, {
    method: "POST",
    headers: sessionHeaders,
    body: disposable,
  });
  assert.equal(created.status, 201);
  const removable = await created.json();
  assert.equal(
    (
      await fetch(`${base}/api/products/mine/${removable.id}/inspection`, {
        headers: sessionHeaders,
      })
    ).status,
    200,
  );
  const removed = await fetch(`${base}/api/products/${removable.id}`, {
    method: "DELETE",
    headers: sessionHeaders,
  });
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), "");
  assert.equal(
    (
      await fetch(`${base}/api/products/mine/${removable.id}`, {
        headers: sessionHeaders,
      })
    ).status,
    404,
  );
  console.log(
    "PASS BFF management: authenticated owner inspection, bodyless DELETE and empty 204; deleted listing inaccessible",
  );
  assert.ok(storage.requests.some((request) => request.method === "PUT"));
  assert.ok(storage.requests.some((request) => request.method === "GET"));
  assert.ok(storage.requests.some((request) => request.method === "DELETE"));
  console.log(
    "PASS R2: photos uploaded/read/cleaned through signed S3 requests; no local image storage",
  );
  await fetch(api + "/auth/logout", {
    method: "POST",
    headers: {
      ...csrf,
      Cookie: adminResponse.headers.getSetCookie()[0].split(";")[0],
    },
  });
  await page.goto(base + "/account");
  await page.getByLabel("Tên hiển thị").waitFor();
};
