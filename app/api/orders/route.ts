import { Prisma } from "@prisma/client";
import { db, hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { deriveAllergens } from "@/lib/allergens";
import { getCatalogSnapshot } from "@/lib/catalogData";
import { resolveSlot } from "@/lib/delivery";
import { priceCake } from "@/lib/pricing";
import { validateCake } from "@/lib/rules";
import { CakeConfig } from "@/lib/schema";
import { deriveServings } from "@/lib/servings";
import { makeOrderRef } from "@/lib/share";

export async function POST(req: Request) {
  let body: {
    config?: unknown;
    clientTotal?: number;
    customerName?: string;
    customerPhone?: string;
    designSlug?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({ error: NO_DATABASE_MESSAGE }, { status: 503 });
  }

  const parsed = CakeConfig.safeParse(body.config);
  if (!parsed.success) {
    return Response.json({ error: "Invalid cake configuration" }, { status: 400 });
  }

  /*
   * Both of these were optional and defaulted to null, so the API would happily
   * mint an order for a ₹10,000 three-tier cake with no name on it and no way to
   * ring anybody about it. The kitchen cannot bake that and nobody can chase it.
   * The review form already collects both; the server has to be the one that
   * insists, because the form is not the only thing that can call this.
   */
  const customerName = body.customerName?.trim() ?? "";
  const customerPhone = (body.customerPhone ?? "").replace(/[\s-]/g, "");

  if (customerName.length < 2) {
    return Response.json(
      { error: "We need a name for the order.", field: "customerName" },
      { status: 400 },
    );
  }
  // Indian mobile numbers, with or without +91 / 0 / 91 in front.
  if (!/^(?:\+?91|0)?[6-9]\d{9}$/.test(customerPhone)) {
    return Response.json(
      { error: "We need a 10-digit mobile number to confirm the order.", field: "customerPhone" },
      { status: 400 },
    );
  }

  const violations = validateCake(parsed.data);
  if (violations.some(v => v.severity === "block")) {
    return Response.json(
      { error: "Configuration not buildable", violations },
      { status: 422 },
    );
  }

  /*
   * Authoritative price. The client's number is advisory only — and now its
   * *catalogue* is too: the builder priced against whatever it fetched when the
   * page loaded, which may be minutes old and may predate an admin's edit. This
   * reads the catalogue as it is now, and what it produces is what gets frozen
   * onto the order below.
   */
  const price = priceCake(parsed.data, await getCatalogSnapshot());

  if (body.clientTotal && body.clientTotal !== price.total) {
    // Could be a stale client, could be tampering. Either way the server wins.
    console.warn("price_mismatch", { client: body.clientTotal, server: price.total });
  }

  const allergens = deriveAllergens(parsed.data);
  const servings = deriveServings(parsed.data);
  const slot = resolveSlot(parsed.data.delivery, parsed.data.pincode);

  // The builder shows "we don't deliver to 560001 yet" and then lets the order
  // through anyway, which turns a clear refusal on screen into a phone call
  // three days later. If the slot is not available for that pincode, it is not
  // an order.
  if (!slot.available) {
    return Response.json(
      {
        error: slot.unavailableReason ?? "That delivery slot is not available for this pincode.",
        field: "delivery",
      },
      { status: 422 },
    );
  }

  const design = body.designSlug
    ? await db.design.findUnique({ where: { slug: body.designSlug } })
    : null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await db.order.create({
        data: {
          ref: makeOrderRef(),
          config: parsed.data,
          priceBreakdown: price as unknown as Prisma.InputJsonValue,
          totalPaise: price.total,
          payablePaise: price.payable,
          status: "draft",
          userId: null,            // hook for auth later
          paymentStatus: "none",   // hook for Razorpay later
          customerName,
          customerPhone,
          pincode: parsed.data.pincode ?? null,
          deliverySlot: parsed.data.delivery,
          leadHours: slot.effectiveLeadHours,
          allergens: allergens.allergens,
          servesMin: servings.min,
          servesMax: servings.max,
          designId: design?.id ?? null,
          items: {
            create: price.lines.map((l, position) => ({
              label: l.label,
              kind: l.kind,
              amountPaise: l.amount,
              position,
            })),
          },
        },
      });

      return Response.json({ orderId: order.ref, price, violations }, { status: 201 });
    } catch (e) {
      // Unique violation on `ref` — mint another and try again.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      console.error("order_create_failed", e);
      return Response.json({ error: "Could not place the order." }, { status: 500 });
    }
  }

  return Response.json({ error: "Could not allocate an order reference." }, { status: 503 });
}
