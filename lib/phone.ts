/** Digits-only international form Meta expects (no "+"); bare Indian numbers get the 91 prefix. */
export function normalizePhone(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2); // 0091… international dialling prefix
  if (digits.length === 13 && digits.startsWith("910")) digits = `91${digits.slice(3)}`; // "+91 0 98765 43210"
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

/** An Indian mobile number as WhatsApp will send to it (91 + 10 digits starting 6–9), or null. */
export function indianMobile(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  return n && /^91[6-9]\d{9}$/.test(n) ? n : null;
}
