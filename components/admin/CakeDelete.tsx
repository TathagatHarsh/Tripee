"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { deleteCake, setCakeAvailability } from "@/app/admin/cakes/actions";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./Toast";
import { aBtn } from "./ui";

/**
 * The two ways a cake stops being sold, and why they are not one button.
 *
 * **Off the shelf** is the one an owner wants almost every time: the cake stops
 * appearing in the shop immediately, every order that names it stays readable,
 * and it can come back on a Tuesday. That is what "we're not baking that at the
 * moment" means, and it is the default offer here.
 *
 * **Delete** removes the row, and is only offered when nobody has ever ordered
 * the cake — a mistyped duplicate, a test cake, something added and thought
 * better of. Once an order names it, deleting would sever the only link between
 * that order and the product it came from, so the button is not shown and
 * `deleteCake` refuses it on the server as well. A hidden button is not a rule.
 *
 * Both confirmations say the consequence rather than "are you sure": §26's
 * requirement, and the difference between a dialog people read and one they
 * click through.
 */
export function CakeDelete({
  id,
  name,
  orders,
}: {
  id: string;
  name: string;
  /** How many orders name this cake. Above zero, Delete is not offered. */
  orders: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [delState, del, deleting] = useActionState(deleteCake, undefined);
  const [offState, off, withdrawing] = useActionState(setCakeAvailability, undefined);
  const [asking, setAsking] = useState<"delete" | "withdraw" | null>(null);

  /* Both announcements and the navigation are effects rather than render-phase
     work — see the note in components/admin/CakeForm. */
  useEffect(() => {
    if (delState) toast(delState.message, delState.ok);
    /* Back to the list: this page's cake no longer exists, and staying on it
       would show a 404 to somebody who did exactly what they meant to. */
    if (delState?.ok) router.push("/admin/cakes");
  }, [delState, toast, router]);

  useEffect(() => {
    if (offState) toast(offState.message, offState.ok);
  }, [offState, toast]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <form action={off}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="next" value="false" />
          <button
            type="button"
            disabled={withdrawing}
            onClick={() => setAsking("withdraw")}
            className={aBtn("secondary", "md")}
          >
            Take off the shelf
          </button>
          {/* The real submit, fired by the dialog. Hidden rather than absent so
              the form still posts without JavaScript in the browser's own way. */}
          <button type="submit" id={`withdraw-${id}`} className="hidden" />
        </form>

        {orders === 0 && (
          <form action={del}>
            <input type="hidden" name="id" value={id} />
            <button
              type="button"
              disabled={deleting}
              onClick={() => setAsking("delete")}
              className={aBtn("danger", "md")}
            >
              Delete permanently
            </button>
            <button type="submit" id={`delete-${id}`} className="hidden" />
          </form>
        )}
      </div>

      {orders > 0 && (
        <p className="text-a-small leading-relaxed text-a-muted">
          Deleting is not offered for a cake with orders against it. Taking it
          off the shelf does what you want in every case where it is available:
          the shop stops selling it and the history stays readable.
        </p>
      )}

      <ConfirmDialog
        open={asking === "withdraw"}
        title={`Take ${name} off the shelf?`}
        tone="primary"
        confirmLabel="Take it off"
        busy={withdrawing}
        body={
          <>
            <p>It disappears from the shop straight away and stops being orderable.</p>
            <p className="mt-2">
              Orders already placed are unaffected, and you can put it back at
              any time.
            </p>
          </>
        }
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          setAsking(null);
          document.getElementById(`withdraw-${id}`)?.click();
        }}
      />

      <ConfirmDialog
        open={asking === "delete"}
        title={`Delete ${name}?`}
        confirmLabel="Delete it"
        busy={deleting}
        body={
          <>
            <p>
              The cake and its photograph are removed for good. There is no undo.
            </p>
            <p className="mt-2">
              Nobody has ordered it, so nothing else is affected — but if you
              only want it off the shop for now, take it off the shelf instead.
            </p>
          </>
        }
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          setAsking(null);
          document.getElementById(`delete-${id}`)?.click();
        }}
      />
    </div>
  );
}
