"use client";

import { useEffect } from "react";

/**
 * The autofill purposes Clerk's own markup leaves off.
 *
 * ## Why this exists at all
 *
 * WCAG 2.1 §1.3.5 (Identify Input Purpose, AA) asks that a field collecting
 * information *about the user* declares which information it is, so that a
 * password manager can fill it and so that assistive software can label it in
 * the reader's own vocabulary. Clerk's components set `autocomplete` on exactly
 * two things — `new-password` on the fields where a password is being chosen,
 * and `webauthn` on the identifier when passkeys are switched on — and set it
 * on nothing else. Checked against the shipped bundle rather than assumed:
 * `one-time-code` does not appear anywhere in `@clerk/ui`, and the sign-in
 * identifier, the sign-up email and the sign-in password all render with the
 * attribute absent.
 *
 * So a customer whose address is in their password manager was not offered it,
 * and a customer holding a six-digit code in a text message had to read it
 * across and type it. Both are one attribute away from working.
 *
 * ## Why it is done to the DOM rather than passed as a prop
 *
 * There is no prop. `appearance` styles Clerk's elements and cannot add
 * attributes to them, and the alternative — rebuilding these forms against the
 * headless hooks so we own the inputs — means also owning email verification,
 * password reset, bot protection and second factors, which is the trade
 * components/AuthSheet sets out at length and declines.
 *
 * The narrow version of that trade is this file: a `MutationObserver` over the
 * one subtree Clerk renders into, filling in attributes it left blank. It is a
 * dependency on Clerk's field *names*, which are a stabler surface than its
 * markup — they are what Clerk's own API and documentation use — and the
 * failure mode if one is renamed is the attribute going missing again, not a
 * broken form.
 */
const PURPOSE: Record<string, string> = {
  /* Sign-in's one field. `username` rather than `email`, even though this
     instance only accepts an address: `username` is the token a password
     manager pairs with a password to offer a saved login, and it is what the
     HTML spec names for the identifying half of a sign-in form. */
  identifier: "username",
  /* Sign-up's, where the field really is only ever an email address. */
  emailAddress: "email",
  /* Signing in, not choosing. Clerk already sets `new-password` wherever a
     password is being created, and the guard below leaves that alone. */
  password: "current-password",
  /* The three that appear only if the bakery switches them on in the Clerk
     dashboard. Listed so that enabling one does not quietly regress this. */
  phoneNumber: "tel",
  firstName: "given-name",
  lastName: "family-name",
};

/**
 * Say what a field is for, unless Clerk already has.
 *
 * Never an overwrite. Clerk knows things this file does not — which screen of a
 * multi-step flow is on show, whether a password is being set or recalled — so
 * anything it has already declared is better informed than anything here.
 *
 * `webauthn` is the one value that is not a whole answer. It is not an autofill
 * field name; it is a flag saying "a passkey may be offered here", and the spec
 * has it *append* to a field name rather than replace one. Clerk sets it alone,
 * which leaves the browser knowing a passkey is welcome and not knowing what
 * the field is. Prepending restores both.
 */
function declare(el: HTMLInputElement, purpose: string): void {
  const had = el.getAttribute("autocomplete");
  if (had && had !== "webauthn") return;
  el.setAttribute("autocomplete", had === "webauthn" ? `${purpose} webauthn` : purpose);
}

function apply(root: HTMLElement): void {
  for (const input of root.querySelectorAll<HTMLInputElement>("input[name]")) {
    const purpose = PURPOSE[input.name];
    if (purpose) declare(input, purpose);
  }

  /*
   * The verification code, and only its first box.
   *
   * Clerk renders the six-digit code as six single-character inputs inside a
   * `role="group"`. `one-time-code` goes on the first one alone: that is the
   * field a browser fills from a message, and it then distributes the digits
   * across the rest itself. Putting the token on all six hands the platform six
   * candidates for one code, which is how a phone ends up offering the same
   * suggestion six times or filling the whole code into every box.
   */
  const firstCodeBox = root.querySelector<HTMLInputElement>(".cl-otpCodeFieldInput");
  if (firstCodeBox) declare(firstCodeBox, "one-time-code");
}

/**
 * Renders nothing. Watches the sheet Clerk draws into.
 *
 * `.s-auth` is the container components/AuthSheet puts around `<SignIn>` and
 * `<SignUp>`, and it is also the hook every rule in the `.s-auth` block of
 * app/globals.css hangs off — so it is not a selector that can quietly stop
 * matching. If it were ever renamed the page would lose its styling long before
 * anybody noticed a missing attribute.
 *
 * The observer watches `childList` and not `attributes`, which is what keeps it
 * from waking itself up: `setAttribute` above is an attribute mutation, so the
 * writes this file makes are invisible to the observer that made them. It has
 * to keep watching rather than run once because Clerk replaces the whole form
 * in place as the flow moves on — identifier, then password, then the code —
 * without a navigation this component would otherwise hear about.
 */
export function AuthAutofill() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".s-auth");
    if (!root) return;

    /* Clerk mounts after hydration, so the first pass usually finds nothing and
       the observer does the real work. Running it anyway costs one query and
       covers the case where it got there first. */
    apply(root);

    const watch = new MutationObserver(() => apply(root));
    watch.observe(root, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, []);

  return null;
}
