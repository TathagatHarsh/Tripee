"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { advanceOrderStatus, type ActionResult } from "./actions";
import { useToast } from "@/components/admin/Toast";
import { aBtn } from "@/components/admin/ui";

/** One-tap "Confirm" for a new order. Prop is `orderRef`: React reserves `ref`. */
export function ConfirmButton({ orderRef }: { orderRef: string }) {
  const [result, action, pending] = useActionState<ActionResult | undefined, FormData>(advanceOrderStatus, undefined);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!result) return;
    toast(result.message, result.ok);
    if (result.ok) router.refresh();
  }, [result, toast, router]);

  return (
    <form action={action}>
      <input type="hidden" name="ref" value={orderRef} />
      <input type="hidden" name="to" value="confirmed" />
      <button type="submit" disabled={pending} className={aBtn("primary", "md")}>
        {pending ? "Confirming…" : "Confirm"}
      </button>
    </form>
  );
}
