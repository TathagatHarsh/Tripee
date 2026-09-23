import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { crossSite } from "@/lib/apiGuard";
import { db } from "@/lib/db";
import {
  AssignmentConflict,
  correctDeliveryPin,
  expireAndAdvance,
  assignmentCandidates,
  manualAssignment,
  respondToAssignment,
  startAssignment,
} from "@/lib/assignment";
const Command = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("respond"),
    assignmentId: z.string().min(1),
    response: z.enum(["ACCEPTED", "REJECTED"]),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal("manual"), vendorId: z.string().min(1), expectedAssignmentId: z.string().nullable() }).strict(),
  z.object({ action: z.literal("advance") }),
  z.object({
    action: z.literal("location"),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  z.object({ action: z.literal("start") }),
]);
export async function GET(
  req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  const viewer = await getViewer();
  if (viewer?.profile.role !== "ADMIN")
    return Response.json({ error: "Not authorised" }, { status: 403 });
  const { ref } = await params;
  if (new URL(req.url).searchParams.get("eligible") === "true") {
    try {
      return Response.json({ bakeries: await assignmentCandidates(ref) });
    } catch (error) {
      if (error instanceof AssignmentConflict)
        return Response.json({ error: error.message }, { status: 409 });
      throw error;
    }
  }
  const order = await db.order.findUnique({
    where: { ref },
    select: {
      ref: true,
      assignmentState: true,
      assignmentNote: true,
      currentAssignmentId: true,
      assignments: {
        orderBy: { sequence: "asc" },
        include: {
          vendor: { select: { name: true, latitude: true, longitude: true } },
          events: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  return order
    ? Response.json(order)
    : Response.json({ error: "Order not found" }, { status: 404 });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> },
) {
  if (crossSite(req))
    return Response.json({ error: "Not authorised" }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const body = Command.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return Response.json(
      { error: "Invalid assignment action" },
      { status: 400 },
    );
  const { ref } = await params,
    command = body.data;
  try {
    if (command.action === "respond") {
      if (viewer.profile.role !== "VENDOR" || !viewer.profile.vendorId)
        return Response.json({ error: "Not authorised" }, { status: 403 });
      const result = await respondToAssignment(
        viewer.profile.vendorId,
        ref,
        command.assignmentId,
        command.response,
        command.reason,
        viewer.userId,
      );
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }
    if (viewer.profile.role !== "ADMIN")
      return Response.json({ error: "Not authorised" }, { status: 403 });
    if (command.action === "location")
      await correctDeliveryPin(ref, command, viewer.profile.id);
    else if (command.action === "manual")
      await manualAssignment(ref, command.vendorId, viewer.profile.id, command.expectedAssignmentId);
    else if (command.action === "advance") await expireAndAdvance(ref);
    else await startAssignment(ref);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AssignmentConflict)
      return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
