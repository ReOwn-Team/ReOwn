const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const root = path.resolve(__dirname, "../../api");
module.exports = async function ({
  pool,
  apiPort,
  storage,
  mail,
  databaseUrl,
  prefix,
}) {
  const base = `http://localhost:${apiPort}/api/v1`,
    origin = "http://localhost:3102";
  const headers = {
    Origin: origin,
    "X-ReOwn-Client": "web",
    "X-HCaptcha-Response": "10000000-aaaa-bbbb-cccc-000000000001",
  };
  async function call(route, token, method = "GET", body) {
    return fetch(base + route, {
      method,
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body instanceof FormData
          ? {}
          : body
            ? { "Content-Type": "application/json" }
            : {}),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
      signal: AbortSignal.timeout(30000),
    });
  }
  async function user(role, number) {
    const email = `inspection-${randomUUID()}@example.com`;
    let response = await call("/users/register", null, "POST", {
      displayName: `Inspection ${role}`,
      email,
      phone: `+8491234567${number}`,
      password: "inspection-test-password",
    });
    assert.equal(response.status, 202);
    const challenge = await response.json();
    response = await call("/auth/otp/verify", null, "POST", {
      challengeId: challenge.challengeId,
      code: mail.code(email),
    });
    assert.equal(response.status, 200);
    const session = await response.json();
    if (role === "admin")
      await pool.query("UPDATE users SET role='admin' WHERE id=$1", [
        session.user.id,
      ]);
    return session;
  }
  const seller = await user("seller", 1),
    admin = await user("admin", 2);
  const fixture = require(path.join(root, "tests/helpers/photo-fixture.cjs"));
  const original = await fixture(),
    invalid = await fixture({ gps: false });
  const input = {
    requestId: randomUUID(),
    title: "Laptop inspection fixture",
    category: "Laptop",
    description: "A fixture description with visible product information.",
    price: 500000,
    condition: "Dùng tốt",
    knownDefects: "",
    location: "TP. Hồ Chí Minh",
    fulfillmentMethods: ["shipping"],
    images: [{ upload: 0 }],
    confirmed: true,
  };
  function form(data, bytes = original) {
    const f = new FormData();
    f.append("data", JSON.stringify(data));
    if (bytes)
      f.append(
        "files",
        new Blob([bytes], { type: "image/jpeg" }),
        "original.jpg",
      );
    return f;
  }
  const before = storage.objects.size;
  let response = await call(
    "/products",
    seller.accessToken,
    "POST",
    form(input, invalid),
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "METADATA_REQUIRED");
  assert.equal(storage.objects.size, before);
  response = await call("/products", seller.accessToken, "POST", form(input));
  assert.equal(response.status, 201);
  const product = await response.json();
  assert.equal(product.status, "hidden");
  assert.equal(product.reviewStatus, "pending");
  assert.equal(product.revision, 1);
  assert.equal((await call(`/products/${product.id}`)).status, 404);
  assert.equal(
    (await call(`/product-images/${product.images[0].id}`)).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/products/mine/${product.id}/images/${product.images[0].id}`,
        seller.accessToken,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        `/products/mine/${product.id}/images/${product.images[0].id}`,
        admin.accessToken,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/products/${product.id}/status`,
        seller.accessToken,
        "PATCH",
        { status: "published" },
      )
    ).status,
    409,
  );
  assert.equal(
    (await call("/admin/product-reviews", seller.accessToken)).status,
    403,
  );
  assert.equal((await call("/admin/product-reviews")).status, 401);
  const reviewId = (
    await pool.query("SELECT id FROM product_reviews WHERE product_id=$1", [
      product.id,
    ])
  ).rows[0].id;
  response = await call(
    `/admin/product-reviews/${reviewId}`,
    admin.accessToken,
  );
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.equal(detail.evidence[0].metadata.latitude, 10);
  assert.ok(!JSON.stringify(detail).includes("r2:"));
  response = await call(
    `/admin/product-reviews/${reviewId}/originals/${product.images[0].id}`,
    admin.accessToken,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
  console.log(
    "PASS inspection: metadata gate, private original bytes, owner preview, pending listing and image invisibility, admin authorization",
  );
  // Exercise the real persistent queue with an observation-only provider; no external photos sent.
  const { PrismaClient } = require(
    path.join(root, "dist/generated/prisma/client"),
  );
  const { PrismaPg } = require(
    path.join(root, "node_modules/@prisma/adapter-pg"),
  );
  const { ProductStorageService } = require(
    path.join(root, "dist/storage/product-storage.service"),
  );
  const { ProductInspectionWorker } = require(
    path.join(root, "dist/inspection/product-inspection.worker"),
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  const old = { ...process.env };
  Object.assign(process.env, storage.env, {
    NODE_ENV: "test",
    INSPECTION_WORKER_ENABLED: "true",
    REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
    REDIS_KEY_PREFIX: prefix + "queue:",
    R2_KEY_PREFIX: "products",
    PRODUCT_STORAGE_DRIVER: "r2",
  });
  const objects = new ProductStorageService();
  let calls = 0;
  const provider = {
    inspect: async (snapshot, images) => {
      calls++;
      const metadata = await require(path.join(root, "node_modules/sharp"))(
        images[0].bytes,
      ).metadata();
      assert.equal(metadata.exif, undefined);
      return {
        model: "test/vision:free",
        report: {
          summary: "Một ảnh chụp vật thể màu xám.",
          productObservations: [
            {
              imageIds: [images[0].id],
              observation: "Vật thể màu xám",
              evidence: "Toàn ảnh",
              certainty: "low",
            },
          ],
          visibleDefects: [],
          imageQuality: [],
          inconsistencies: [],
          limitations: ["Không kiểm tra được hoạt động qua ảnh."],
        },
      };
    },
  };
  const worker = new ProductInspectionWorker(prisma, objects, provider);
  try {
    worker.onModuleInit();
    for (let i = 0; i < 100; i++) {
      const row = await prisma.productInspection.findFirst({
        where: { reviewId },
      });
      if (row.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const inspection = await prisma.productInspection.findFirst({
      where: { reviewId },
    });
    assert.equal(inspection.status, "completed");
    assert.equal(calls, 1);
    assert.equal(inspection.promptVersion, "v2");
    const ownerReport = await (
      await call(`/products/mine/${product.id}/inspection`, seller.accessToken)
    ).json();
    assert.equal(ownerReport.inspection.status, "completed");
    assert.equal(
      ownerReport.inspection.report.summary,
      inspection.report.summary,
    );
    assert.ok(!JSON.stringify(ownerReport).includes("originalKey"));
    assert.ok(!JSON.stringify(ownerReport).includes("metadata"));
    assert.ok(!JSON.stringify(ownerReport).includes("objectKey"));
    assert.equal(
      (await call(`/products/mine/${product.id}/inspection`, admin.accessToken))
        .status,
      404,
    );
    assert.equal(
      (await call(`/products/mine/${product.id}/inspection`)).status,
      401,
    );

    assert.equal(
      (await prisma.product.findUnique({ where: { id: product.id } }))
        .reviewStatus,
      "pending",
    );
    assert.equal(
      (
        await call(
          `/admin/product-reviews/${reviewId}/decision`,
          seller.accessToken,
          "POST",
          { revision: 1, decision: "approve" },
        )
      ).status,
      403,
    );
    const decisions = await Promise.all(
      [1, 2].map(() =>
        call(
          `/admin/product-reviews/${reviewId}/decision`,
          admin.accessToken,
          "POST",
          { revision: 1, decision: "approve" },
        ),
      ),
    );
    assert.deepEqual(
      decisions.map((result) => result.status).sort(),
      [201, 409],
    );
    assert.equal((await call(`/products/${product.id}`)).status, 200);
    assert.equal(
      (await call(`/product-images/${product.images[0].id}`)).status,
      200,
    );
    assert.equal(
      (
        await call(
          `/admin/product-reviews/${reviewId}/decision`,
          admin.accessToken,
          "POST",
          { revision: 1, decision: "reject", reason: "late" },
        )
      ).status,
      409,
    );
    console.log(
      "PASS inspection: Redis queue recovers persisted request; AI observations cannot approve; human decision publishes once",
    );
    const edited = {
      ...input,
      title: "Changed product title",
      images: [{ id: product.images[0].id }],
    };
    delete edited.requestId;
    response = await call(
      `/products/${product.id}`,
      seller.accessToken,
      "PUT",
      form(edited, null),
    );
    assert.equal(response.status, 200);
    const updated = await response.json();
    assert.equal(updated.revision, 2);
    assert.equal(updated.reviewStatus, "pending");
    assert.equal((await call(`/products/${product.id}`)).status, 404);
    assert.equal(
      (
        await call(
          `/admin/product-reviews/${reviewId}/inspections`,
          admin.accessToken,
          "POST",
        )
      ).status,
      409,
    );
    const review2 = await prisma.productReview.findFirst({
      where: { productId: product.id, revision: 2 },
    });
    assert.equal(
      (
        await call(
          `/admin/product-reviews/${review2.id}/decision`,
          admin.accessToken,
          "POST",
          { revision: 1, decision: "approve" },
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          `/admin/product-reviews/${review2.id}/decision`,
          admin.accessToken,
          "POST",
          { revision: 2, decision: "reject" },
        )
      ).status,
      400,
    );
    const { InspectionFailure } = require(
      path.join(root, "dist/inspection/inspection-report"),
    );
    const flaky = new ProductInspectionWorker(prisma, objects, {
      inspect: async () => {
        throw new InspectionFailure("AI_RATE_LIMITED", true, 300);
      },
    });
    const queued = await prisma.productInspection.findFirst({
      where: { reviewId: review2.id },
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      await prisma.productInspection.update({
        where: { id: queued.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await flaky.run(queued.id);
      const failed = await prisma.productInspection.findUnique({
        where: { id: queued.id },
      });
      assert.equal(failed.attempts, attempt);
      assert.equal(failed.status, attempt === 3 ? "failed" : "queued");
      assert.ok(failed.nextAttemptAt.getTime() > Date.now() + 290000);
    }
    assert.equal(
      (await prisma.product.findUnique({ where: { id: product.id } }))
        .reviewStatus,
      "pending",
    );
    response = await call(
      `/admin/product-reviews/${review2.id}/inspections`,
      admin.accessToken,
      "POST",
    );
    assert.equal(response.status, 201);
    const retry = await response.json();
    assert.equal(
      (
        await call(
          `/products/${product.id}`,
          seller.accessToken,
          "PUT",
          form(edited, null),
        )
      ).status,
      200,
    );
    await worker.run(retry.id);
    assert.equal(
      (await prisma.productInspection.findUnique({ where: { id: retry.id } }))
        .status,
      "cancelled",
    );
    const review3 = await prisma.productReview.findFirst({
      where: { productId: product.id, revision: 3 },
    });
    assert.equal(
      (
        await call(
          `/admin/product-reviews/${review2.id}/decision`,
          admin.accessToken,
          "POST",
          { revision: 2, decision: "approve" },
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await call(
          `/admin/product-reviews/${review3.id}/decision`,
          admin.accessToken,
          "POST",
          { revision: 3, decision: "reject", reason: "Cần ảnh rõ hơn" },
        )
      ).status,
      201,
    );
    console.log(
      "PASS inspection: concurrent decisions have one winner; rate-limit retries respect backoff and stop at three; obsolete revision jobs cancel",
    );
    assert.equal(
      (
        await call(
          `/products/${product.id}/status`,
          seller.accessToken,
          "PATCH",
          { status: "published" },
        )
      ).status,
      409,
    );
    await prisma.productEvidence.update({
      where: { id: product.images[0].id },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(
      (
        await call(
          `/admin/product-reviews/${reviewId}/originals/${product.images[0].id}`,
          admin.accessToken,
        )
      ).status,
      404,
    );
    await worker.purge();
    const evidence = await prisma.productEvidence.findUnique({
      where: { id: product.images[0].id },
    });
    assert.equal(evidence.originalKey, null);
    assert.ok(evidence.purgedAt);
    console.log(
      "PASS inspection: edit invalidates approval, stale decisions rejected, rejection requires reason, originals expire and are purged",
    );
    response = await call("/products", seller.accessToken, "POST", form(input));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).id, product.id);
    assert.equal(await prisma.product.count({ where: { id: product.id } }), 1);

    // Removing a listing preserves its audit trail and cannot affect another seller.
    assert.equal(
      (await call(`/products/${product.id}`, admin.accessToken, "DELETE"))
        .status,
      404,
    );
    assert.equal(
      (await call(`/products/${product.id}`, null, "DELETE")).status,
      401,
    );
    assert.equal(
      (await call(`/products/${product.id}`, seller.accessToken, "DELETE"))
        .status,
      204,
    );
    assert.equal(
      (await call(`/products/mine/${product.id}`, seller.accessToken)).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/products/mine/${product.id}/inspection`,
          seller.accessToken,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/products/mine/${product.id}/images/${product.images[0].id}`,
          seller.accessToken,
        )
      ).status,
      404,
    );
    assert.equal((await call(`/products/${product.id}`)).status, 404);
    assert.ok(
      await prisma.productReview.count({ where: { productId: product.id } }),
    );
    assert.equal(
      await prisma.productInspection.count({
        where: {
          review: { productId: product.id },
          status: { in: ["queued", "processing"] },
        },
      }),
      0,
    );
    assert.equal(
      (
        await call(
          `/products/${product.id}/status`,
          seller.accessToken,
          "PATCH",
          { status: "published" },
        )
      ).status,
      404,
    );

    response = await call(
      "/products",
      seller.accessToken,
      "POST",
      form({ ...input, requestId: randomUUID() }),
    );
    assert.equal(response.status, 201);
    const soldProduct = await response.json();
    assert.equal(
      (
        await call(
          `/products/${soldProduct.id}/status`,
          seller.accessToken,
          "PATCH",
          { status: "sold" },
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(`/products/${soldProduct.id}`, seller.accessToken, "DELETE"))
        .status,
      409,
    );
    response = await call(
      "/products",
      seller.accessToken,
      "POST",
      form({ ...input, requestId: randomUUID() }),
    );
    assert.equal(response.status, 201);
    const orderedProduct = await response.json();
    await prisma.order.create({
      data: {
        orderCode: `TEST-${randomUUID().slice(0, 20)}`,
        idempotencyKey: randomUUID(),
        itemPrice: orderedProduct.price,
        productId: orderedProduct.id,
        buyerId: admin.user.id,
        sellerId: seller.user.id,
        productSnapshot: { title: orderedProduct.title },
        amount: 1,
        totalPrice: orderedProduct.price,
        paymentMethod: 0,
        fulfillmentMethod: 0,
        recipientName: "Test buyer",
        recipientPhone: "+84912345670",
        buyerNote: [],
        status: "pending",
      },
    });
    assert.equal(
      (
        await call(
          `/products/${orderedProduct.id}`,
          seller.accessToken,
          "DELETE",
        )
      ).status,
      409,
    );
    console.log(
      "PASS listing management: owner-only AI observations, versioned prompts, private metadata excluded, deletion cancels work and preserves history",
    );
  } finally {
    await worker.onModuleDestroy();
    objects.onModuleDestroy();
    await prisma.$disconnect();
    process.env = old;
  }
};
