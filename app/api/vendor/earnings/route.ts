import { getViewer } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (viewer?.profile.role !== "VENDOR" || !viewer.profile.vendorId)
    return Response.json({ error: "Not authorised" }, { status: 403 });
  const vendor = await db.vendor.findUnique({
    where: { id: viewer.profile.vendorId },
    select: { isActive: true },
  });
  if (!vendor?.isActive)
    return Response.json({ error: "Not authorised" }, { status: 403 });
  const cursor = new URL(req.url).searchParams.get("cursor");
  const rows = await db.vendorOrder.findMany({
    where: { vendorId: viewer.profile.vendorId, offeredAt: { not: null } },
    orderBy: { id: "asc" },
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      assignmentStatus: true,
      status: true,
      orderValuePaise: true,
      commissionPaise: true,
      feePaise: true,
      vendorEarningPaise: true,
      acceptedAt: true,
      order: { select: { ref: true, status: true } },
    },
  });
  return Response.json({
    assignments: rows.slice(0, 50),
    nextCursor: rows.length > 50 ? rows[49].id : null,
  });
}
