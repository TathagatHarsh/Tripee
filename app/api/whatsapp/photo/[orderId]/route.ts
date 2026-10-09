import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";
import { siteUrl, verifyPhotoSignature } from "@/lib/whatsapp";

const jpegHeaders = (cache: string) => ({ "content-type": "image/jpeg", "cache-control": cache });

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** WhatsApp only takes JPEG/PNG; stored photos are WebP. Any failure degrades to a name card. */
async function convert(src: string): Promise<Buffer | null> {
  // Same hosts the bakery photo download allows (app/api/orders/[ref]/photo): this site or the catalogue's blob store.
  const url = new URL(src, siteUrl());
  const sameSite = src.startsWith("/") && !src.startsWith("//");
  const blob = url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  if (!sameSite && !blob) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize({ width: 1080, height: 1080, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}

const BLANK = { create: { width: 800, height: 800, channels: 3 as const, background: "#FFF7EC" } };

async function nameCard(name: string): Promise<Buffer> {
  try {
    return await renderNameCard(name.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""));
  } catch {
    return sharp(BLANK).jpeg({ quality: 82 }).toBuffer();
  }
}

function renderNameCard(name: string): Promise<Buffer> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#FFF7EC"/>` +
    `<text x="400" y="400" font-size="48" text-anchor="middle" dominant-baseline="middle" fill="#4a2c1a">${xmlEscape(name.slice(0, 40))}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

export async function GET(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  if (!verifyPhotoSignature(orderId, new URL(req.url).searchParams.get("s"))) {
    return new Response("Not found", { status: 404 });
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      cakeName: true,
      cakeImageUrl: true,
      cakes: { select: { cakeName: true, cakeImageUrl: true }, orderBy: { position: "asc" } },
    },
  });
  if (!order) return new Response("Not found", { status: 404 });

  const src = order.cakes.find((c) => c.cakeImageUrl)?.cakeImageUrl ?? order.cakeImageUrl;
  const photo = src ? await convert(src) : null;
  const jpeg = photo ?? (await nameCard(order.cakes[0]?.cakeName ?? order.cakeName ?? "Custom cake"));
  // A fallback must not be cached: the real photo may be fixed (or the fetch succeed) a minute later.
  return new Response(new Uint8Array(jpeg), { headers: jpegHeaders(photo ? "public, max-age=86400" : "no-store") });
}
