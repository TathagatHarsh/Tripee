"use client";

import { useActionState } from "react";
import { acceptJoin, type JoinState } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(acceptJoin.bind(null, token), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-[14px] bg-[#94472c] px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94472c] disabled:opacity-60">
        {pending ? "Joining…" : "Accept and set up my bakery"}
      </button>
      {state && <p role="alert" className="text-sm font-medium text-[#874027]">{state.message}</p>}
    </form>
  );
}
