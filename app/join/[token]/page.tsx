import { getViewer } from "@/lib/auth";
import type { Metadata } from "next";
import { getBakeryInfo } from "@/lib/catalogData";
import { whatsappHref } from "@/lib/customCakes";
import { invitedBakery } from "@/lib/vendorInvite";
import { AcceptForm } from "./AcceptForm";

export const metadata: Metadata = {
  title: "Bakery invite — MakeYourCakes",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const button = "inline-flex min-h-11 items-center justify-center rounded-[14px] bg-[#94472c] px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#94472c]";

/** Public on purpose: the invitee has no account yet. The token is the credential and only its hash is stored. */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bakery = await invitedBakery(token);

  let body: React.ReactNode;
  if (!bakery) {
    const support = whatsappHref((await getBakeryInfo()).phone, "Hi, my bakery invite link has expired. Could you send a new one?");
    body = (
      <>
        <h1 className="font-serif text-2xl">This invite has expired. Ask MakeYourCakes for a new one.</h1>
        {support && <a href={support} target="_blank" rel="noreferrer" className={button}>Message MakeYourCakes on WhatsApp</a>}
      </>
    );
  } else {
    const viewer = await getViewer();
    body = (
      <>
        <h1 className="font-serif text-2xl">{bakery.name} has been invited to MakeYourCakes</h1>
        {viewer ? (
          <AcceptForm token={token} />
        ) : (
          <a href={`/sign-up?redirect_url=${encodeURIComponent(`/join/${token}`)}`} className={button}>Sign up to continue</a>
        )}
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 bg-[#fbf6ef] px-4 py-10 text-[#2b1d14]">
      {body}
    </main>
  );
}
