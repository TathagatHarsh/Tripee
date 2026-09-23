import { db } from '@/lib/db';
import { portalScope } from '@/lib/portalScope';
import { crossSite } from '@/lib/apiGuard';
export async function POST(req: Request) {
  if (crossSite(req)) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const scope = await portalScope();
  if (!scope) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const rows = await db.portalNotification.findMany({ where: { ...scope.where, reads: { none: { userId: scope.viewer.userId } } }, select: { id: true } });
  await db.notificationRead.createMany({ data: rows.map(row => ({ notificationId: row.id, userId: scope.viewer.userId })), skipDuplicates: true });
  return Response.json({ ok: true });
}
