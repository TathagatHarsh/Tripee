import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";

// playwright.config.ts rejects non-scratch databases before this suite runs.
// All fixtures are synthetic and notifications must be disabled in the test server.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let product: { slug: string; variantId: string };
const date = (days = 30) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
function order(extra: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    customerName: "E2E Checkout Test",
    customerPhone: "9876543210",
    items: [
      {
        cakeSlug: product.slug,
        variantId: product.variantId,
        qty: 2,
        choices: { delivery: "standard", pincode: "500081" },
      },
    ],
    fulfillment: {
      method: "delivery",
      slot: "standard",
      recipientName: "E2E Checkout Test",
      addressLine1: "12 Test Street",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
      requestedDate: date(),
      requestedWindow: "Client text is not authoritative",
    },
    ...extra,
  };
}
test.beforeAll(async () => {
  const { rows } = await pool.query(
    'SELECT p.slug, v.id AS "variantId" FROM "CakeProduct" p JOIN "CakeVariant" v ON v."cakeId" = p.id WHERE p."isAvailable" AND v."isAvailable" AND p."productionSpec" IS NOT NULL ORDER BY p.slug LIMIT 1',
  );
  expect(
    rows.length,
    "Seed the scratch database before running checkout tests",
  ).toBe(1);
  product = rows[0];
});
test.afterAll(async () => {
  await pool.end();
});

test("concurrent retries create one frozen order with two cakes and one shipping charge", async ({
  request,
}) => {
  const body = order();
  const quoteResponse = await request.post("/api/price", { data: body });
  expect(quoteResponse.status(), await quoteResponse.text()).toBe(200);
  const { quote } = await quoteResponse.json();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      request.post("/api/orders", {
        data: { ...body, quotedOrderTotalPaise: quote.totalPaise },
      }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([
    200, 200, 200, 200, 201,
  ]);
  const receipts = await Promise.all(results.map((r) => r.json()));
  expect(new Set(receipts.map((r) => r.order.ref)).size).toBe(1);
  expect(receipts[0].order.totalPaise).toBe(quote.totalPaise);
  const { rows } = await pool.query(
    'SELECT o.*, to_char(o."requestedFor", \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') AS requested_utc, (SELECT count(*)::int FROM "OrderCake" c WHERE c."orderId" = o.id) AS cakes FROM "Order" o JOIN "CheckoutAttempt" a ON a."orderId" = o.id WHERE a.id = $1',
    [body.idempotencyKey],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].cakes).toBe(2);
  expect(rows[0].paymentStatus).toBe("none");
  expect(rows[0].status).toBe("draft");
  expect(rows[0].requestedWindow).toBe("10:00–20:00");
  expect(rows[0].deliveryFeePaise).toBe(quote.deliveryFeePaise);
  expect(rows[0].requested_utc).toBe(`${date()}T04:30:00.000Z`);
});

test("a committed attempt survives later blackout and quote changes", async ({
  request,
}) => {
  const body = order();
  body.fulfillment.requestedDate = date(32);
  const first = await request.post("/api/orders", { data: body });
  expect(first.status(), await first.text()).toBe(201);
  const receipt = await first.json();
  const blackoutId = randomUUID();
  await pool.query(
    "INSERT INTO \"FulfillmentBlackout\" (id, date, method, reason) VALUES ($1, $2, 'delivery', 'E2E closure')",
    [blackoutId, date(32)],
  );
  try {
    const replay = await request.post("/api/orders", {
      data: {
        ...body,
        quotedOrderTotalPaise: 1,
        items: body.items.map((i) => ({ ...i, quotedTotalPaise: 1 })),
      },
    });
    expect(replay.status(), await replay.text()).toBe(200);
    expect((await replay.json()).order).toEqual(receipt.order);
    const quote = await request.post("/api/price", { data: body });
    expect(quote.status()).toBe(409);
    expect((await quote.json()).code).toBe("capacity_unavailable");
  } finally {
    await pool.query('DELETE FROM "FulfillmentBlackout" WHERE id = $1', [
      blackoutId,
    ]);
  }
});

test("a reused attempt cannot change customer or cake details", async ({
  request,
}) => {
  const body = order();
  const first = await request.post("/api/orders", { data: body });
  expect(first.status(), await first.text()).toBe(201);
  const changed = await request.post("/api/orders", {
    data: { ...body, customerName: "Different customer" },
  });
  expect(changed.status()).toBe(409);
  expect((await changed.json()).code).toBe("idempotency_conflict");
});

test("tampered totals, impossible dates, missing addresses and unserviceable pins are refused", async ({
  request,
}) => {
  const body = order();
  const price = await request.post("/api/orders", {
    data: { ...body, quotedOrderTotalPaise: 1 },
  });
  expect(price.status()).toBe(409);
  const invalidDate = await request.post("/api/orders", {
    data: {
      ...body,
      fulfillment: { ...body.fulfillment, requestedDate: "2028-02-31" },
    },
  });
  expect(invalidDate.status()).toBe(422);
  const address = await request.post("/api/orders", {
    data: { ...body, fulfillment: { ...body.fulfillment, addressLine1: "" } },
  });
  expect(address.status()).toBe(400);
  const pin = await request.post("/api/price", {
    data: { ...body, fulfillment: { ...body.fulfillment, pincode: "110001" } },
  });
  expect(pin.ok()).toBe(false);
  const { rows } = await pool.query(
    'SELECT id FROM "CheckoutAttempt" WHERE id = $1',
    [body.idempotencyKey],
  );
  expect(rows).toHaveLength(0);
});

test("cross-site writes and malformed requests fail closed", async ({
  request,
}) => {
  for (const path of ["/api/orders", "/api/price"]) {
    expect(
      (
        await request.post(path, {
          headers: { origin: "https://untrusted.example" },
          data: order(),
        })
      ).status(),
    ).toBe(403);
    expect((await request.post(path, { data: "not json" })).status()).toBe(400);
  }
});
