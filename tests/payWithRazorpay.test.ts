import { afterEach, describe, expect, it, vi } from "vitest";
import { payWithRazorpay } from "../components/shop/payWithRazorpay";

type Options = {
  handler: (r: Record<string, string>) => void;
  modal: { ondismiss: () => void };
};

const opts = {
  keyId: "rzp_test_K",
  razorpayOrderId: "order_A",
  amountPaise: 124900,
  name: "Asha",
  phone: "9876543210",
};
const success = {
  razorpay_order_id: "order_A",
  razorpay_payment_id: "pay_B",
  razorpay_signature: "a".repeat(64),
};

/** A stand-in checkout.js: `script` receives the options and the failure listener. */
function install(script: (options: Options, fail: (d?: string) => void) => void) {
  const seen: { options?: Options } = {};
  class Razorpay {
    private listener: (r: { error?: { description?: string } }) => void = () => {};
    constructor(options: Options) {
      seen.options = options;
    }
    on(_event: string, listener: Razorpay["listener"]) {
      this.listener = listener;
    }
    open() {
      script(seen.options as Options, (d) => this.listener({ error: { description: d } }));
    }
  }
  vi.stubGlobal("window", { Razorpay });
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

describe("payWithRazorpay", () => {
  it("opens the window with the order and maps a payment to a proof", async () => {
    const seen = install((o) => o.handler(success));
    await expect(payWithRazorpay(opts)).resolves.toEqual({
      kind: "paid",
      proof: {
        razorpayOrderId: "order_A",
        razorpayPaymentId: "pay_B",
        razorpaySignature: "a".repeat(64),
      },
    });
    expect(seen.options).toMatchObject({
      key: "rzp_test_K",
      order_id: "order_A",
      amount: 124900,
      currency: "INR",
      name: "MakeMyCake",
      prefill: { name: "Asha", contact: "9876543210" },
    });
  });

  it("reports a closed window as dismissed", async () => {
    install((o) => o.modal.ondismiss());
    await expect(payWithRazorpay(opts)).resolves.toEqual({ kind: "dismissed" });
  });

  it("reports a failed attempt, in the bank's words, once the window is closed", async () => {
    install((o, fail) => {
      fail("Your card was declined.");
      o.modal.ondismiss();
    });
    await expect(payWithRazorpay(opts)).resolves.toEqual({
      kind: "failed",
      message: "Your card was declined.",
    });
  });

  it("keeps the payment when a retry inside the window succeeds after a failure", async () => {
    install((o, fail) => {
      fail("Your card was declined.");
      o.handler(success);
      o.modal.ondismiss();
    });
    await expect(payWithRazorpay(opts)).resolves.toMatchObject({ kind: "paid" });
  });

  it("does not treat a malformed confirmation as a payment", async () => {
    install((o) => o.handler({ ...success, razorpay_signature: "nope" }));
    await expect(payWithRazorpay(opts)).resolves.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("pay_B"),
    });
  });

  it("is unavailable when the script cannot be loaded", async () => {
    const script: { onerror?: () => void; remove: () => void } = { remove() {} };
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      createElement: () => script,
      head: { appendChild: () => queueMicrotask(() => script.onerror?.()) },
    });
    await expect(payWithRazorpay(opts)).resolves.toEqual({ kind: "unavailable" });
    // A failed load is forgotten: the next press tries the network again.
    await expect(payWithRazorpay(opts)).resolves.toEqual({ kind: "unavailable" });
  });
});
