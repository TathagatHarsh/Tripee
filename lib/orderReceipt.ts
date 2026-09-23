import { z } from "zod";

/** The saved server receipt is presentation data, never authority to create an order. */
export const OrderReceipt = z.object({
  ref: z.string().regex(/^MC-[A-Z0-9]+$/),
  totalPaise: z.number().int().nonnegative(),
  date: z.iso.date().nullable(),
  window: z.string(),
  address: z.string(),
  method: z.enum(["delivery", "pickup"]).optional(),
  items: z.array(z.object({ name: z.string(), variant: z.string(), qty: z.number().int().positive() })),
});
export type Receipt = z.infer<typeof OrderReceipt>;
