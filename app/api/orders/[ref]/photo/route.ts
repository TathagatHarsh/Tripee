import { allows, getViewer } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * The cake's photograph as a file download, for the bakery copying it.
 *
 * A plain `<a download>` is ignored by browsers for a cross-origin image, and the
 * catalogue's photos live on Vercel Blob, so the file is streamed from here with
 * `Content-Disposition: attachment`.
 *
 * Only the URL frozen on the order (or one of its cakes) is ever fetched, and
 * only from this site or the catalogue's blob store: nothing in the request can
 * point this route at another host.
 */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Sign in required" }, { status: 401 });

  const { ref } = await params;
  const cakeId = new URL(req.url).searchParams.get("cake");
  const order = await db.order.findUnique({
    where: { ref },
    select: {
      id: true,
      cakeImageUrl: true,
      cakes: { select: { id: true, cakeImageUrl: true } },
    },
  });
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

  const role = viewer.profile.role;
  const vendorId = viewer.profile.vendorId;
  const permitted =
    (role !== "VENDOR" && allows(role, "KITCHEN")) ||
    (role === "VENDOR" &&
      !!vendorId &&
      (await db.vendorOrder.count({ where: { orderId: order.id, vendorId, offeredAt: { not: null } } })) > 0);
  if (!permitted) return Response.json({ error: "Not authorised" }, { status: 403 });

  const src = cakeId
    ? order.cakes.find((c) => c.id === cakeId)?.cakeImageUrl
    : order.cakeImageUrl ?? order.cakes[0]?.cakeImageUrl;
  if (!src) return Response.json({ error: "This order has no photograph" }, { status: 404 });

  const url = new URL(src, req.url);
  const sameSite = src.startsWith("/") && !src.startsWith("//");
  const blob = url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  if (!sameSite && !blob) return Response.json({ error: "Unsupported photo location" }, { status: 400 });

  const upstream = await fetch(url, { cache: "no-store" });
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) {
    return Response.json({ error: "Could not load the photograph" }, { status: 502 });
  }

  const ext = type.split("/")[1]?.split(/[+;]/)[0] || "jpg";
  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${ref}-cake${cakeId ? `-${cakeId.slice(-4)}` : ""}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
