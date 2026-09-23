import { runAssignmentWorker } from "@/lib/assignment";
export const maxDuration = 60;
export async function POST(req: Request) {
  const secret = process.env.ASSIGNMENT_WORKER_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Not authorised" }, { status: 401 });
  return Response.json(await runAssignmentWorker());
}
