import { normalizePhone, PaymentProof } from "@/lib/checkout";

/**
 * Razorpay's hosted checkout, opened from the browser.
 *
 * The result is a value, never a throw: the caller only has to choose the words
 * for each outcome. A `paid` result carries the three fields /api/orders needs
 * to confirm the payment server-side, and nothing here decides whether the
 * payment is genuine; that is the signature check on the server.
 */

type RazorpaySuccess = {
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
};
type RazorpayFailure = { error?: { description?: string } };
type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  prefill: { name: string; contact: string; email?: string };
  handler: (response: RazorpaySuccess) => void;
  modal: { ondismiss: () => void };
};
type RazorpayModal = {
  open(): void;
  on(event: "payment.failed", listener: (response: RazorpayFailure) => void): void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayModal;
  }
}

export type PaymentResult =
  | { kind: "paid"; proof: PaymentProof }
  | { kind: "dismissed" }
  | { kind: "failed"; message: string }
  | { kind: "unavailable" };

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<boolean> | null = null;

/** Appends checkout.js once. A failed load is forgotten so the next press tries again. */
function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  loading ??= new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => {
      script.remove();
      resolve(false);
    };
    document.head.appendChild(script);
  }).then((ok) => {
    if (!ok) loading = null;
    return ok;
  });
  return loading;
}

export async function payWithRazorpay(opts: {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  name: string;
  phone: string;
  email?: string;
}): Promise<PaymentResult> {
  if (!(await loadCheckout()) || !window.Razorpay) return { kind: "unavailable" };
  const Razorpay = window.Razorpay;

  return new Promise<PaymentResult>((resolve) => {
    // The first outcome wins. A failed attempt does not settle: the customer can
    // retry inside the open window, and settling early would drop a later success.
    let failure: string | null = null;
    let settled = false;
    const settle = (result: PaymentResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const modal = new Razorpay({
        key: opts.keyId,
        order_id: opts.razorpayOrderId,
        amount: opts.amountPaise,
        currency: "INR",
        name: "MakeMyCake",
        // Razorpay wants the country code; checkout takes 10 digits with or without +91 or 0.
        prefill: { name: opts.name, contact: `+91${normalizePhone(opts.phone).slice(-10)}`, email: opts.email },
        handler: (response) => {
          const proof = PaymentProof.safeParse({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          settle(
            proof.success
              ? { kind: "paid", proof: proof.data }
              : {
                  kind: "failed",
                  message: `We couldn't read the payment confirmation. If you were charged, contact us with payment ${response.razorpay_payment_id ?? "details from your bank"}.`,
                },
          );
        },
        modal: {
          ondismiss: () =>
            settle(failure ? { kind: "failed", message: failure } : { kind: "dismissed" }),
        },
      });
      modal.on("payment.failed", (response) => {
        failure =
          response.error?.description ?? "Your payment didn't go through. Please try again.";
      });
      modal.open();
    } catch {
      settle({ kind: "unavailable" });
    }
  });
}
