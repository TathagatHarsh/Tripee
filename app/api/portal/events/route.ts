import { db } from '@/lib/db';
import { portalScope } from '@/lib/portalScope';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function GET(req: Request) {
  const scope = await portalScope();
  if (!scope) return Response.json({ error: 'Not authorised' }, { status: 403 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let stopped = false;
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => {
        if (stopped) return;
        stopped = true; clearTimeout(timer); clearTimeout(deadline);
        req.signal.removeEventListener('abort', finish);
        controller.close();
      };
      cleanup = () => {
        stopped = true; clearTimeout(timer); clearTimeout(deadline);
        req.signal.removeEventListener('abort', finish);
      };
      const deadline = setTimeout(finish, 25000);
      req.signal.addEventListener('abort', finish, { once: true });
      const send = async () => {
        try {
          const rows = await db.portalNotification.findMany({ where: scope.where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, include: { reads: { where: { userId: scope.viewer.userId }, select: { userId: true } } } });
          if (stopped) return;
          const data = rows.map(({ id, title, message, orderRef, createdAt, reads }) => ({ id, title, message, orderRef, createdAt, read: reads.length > 0 }));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          timer = setTimeout(send, 2500);
        } catch (error) { console.error('portal_stream_failed', error); finish(); }
      };
      if (req.signal.aborted) finish(); else void send();
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no', connection: 'keep-alive' } });
}
