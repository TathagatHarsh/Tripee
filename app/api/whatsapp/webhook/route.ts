import { after } from "next/server";
import { log } from "@/lib/log";
import { dispatchPendingNotifications } from "@/lib/notifications";
import { maskedPhone } from "@/lib/notify";
import { verifySignature } from "@/lib/whatsapp";
import { handleInbound } from "@/lib/whatsappInbound";

export const maxDuration = 30;

// Meta's one-time subscribe handshake.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (q.get("hub.mode") === "subscribe" && token && q.get("hub.verify_token") === token) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

interface WaMessage {
  id: string;
  from: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { id?: string; title?: string } };
}
interface WaStatus {
  id: string;
  status: string;
  recipient_id: string;
  errors?: { code?: number }[];
}
interface WaPayload {
  entry?: { changes?: { value?: { messages?: WaMessage[]; statuses?: WaStatus[] } }[] }[];
}

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, signature)) {
    /* A rejected call is otherwise invisible, and it is the first thing to
       check when Meta says it delivered and nothing happened: a wrong
       WHATSAPP_APP_SECRET looks exactly like this. Never the body. */
    log("warn", "whatsapp_webhook_bad_signature", { hasSignature: signature !== null, bytes: raw.length });
    return Response.json({ error: "Bad signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(raw) as WaPayload;
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const s of change.value?.statuses ?? []) {
          if (s.status === "failed") {
            log("error", "whatsapp_delivery_failed", {
              id: s.id,
              recipient: maskedPhone(s.recipient_id),
              code: s.errors?.[0]?.code,
            });
          }
        }
        for (const m of change.value?.messages ?? []) {
          // The message id and a masked sender, never the text: this line is
          // how to see that Meta called us at all, since success is silent.
          log("info", "whatsapp_inbound", { id: m.id, from: maskedPhone(m.from), kind: m.type ?? "unknown" });
          await handleInbound({
            id: m.id,
            from: m.from,
            text: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? null,
            payload: m.button?.payload ?? m.interactive?.button_reply?.id ?? null,
          });
        }
      }
    }
    after(() =>
      dispatchPendingNotifications(10).catch((err) =>
        log("error", "whatsapp_dispatch_failed", { error: String(err) }),
      ),
    );
    return Response.json({ ok: true });
  } catch (err) {
    // 500 makes Meta retry; handleInbound dedupes replies on retry.
    log("error", "whatsapp_webhook_failed", { error: String(err) });
    return Response.json({ error: "Webhook failed" }, { status: 500 });
  }
}
