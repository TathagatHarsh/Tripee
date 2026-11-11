# Order confirmation email

A customer who gives an email at checkout gets one email when their order is
confirmed, from `orders@makeyourcakes.com`; replies go to `hello@makeyourcakes.com`.
Delivery orders are confirmed when placed, pickup orders when staff confirm them.
Custom-cake quotes get no email (the quote form collects no email address).

Code: `lib/orderEmail.ts` (content, queueing), `lib/email.ts` (Resend),
`lib/notifications.ts` (outbox delivery and retries). Off unless `RESEND_API_KEY` is set.

## Go-live, in order

1. Zoho admin → Users → hello@ → add email alias `orders@makeyourcakes.com`.
2. Resend → create account → Domains → add `makeyourcakes.com` (region closest to India).
3. GoDaddy DNS → add exactly the records Resend shows (manual setup, not
   "Auto configure"): TXT `resend._domainkey` (DKIM), CNAME `rsend` →
   `rsend-apne1.forge.rmta.net`, CNAME `send` → `send.forge.rmta.net`. Leave
   "Enable receiving" off. Do **not** edit the root MX or the root SPF — those
   are Zoho's and carry hello@'s mail. (Done 2026-11-11, region Tokyo.)
4. Resend → Verify domain; create an API key with sending access to this domain only.
5. Production env → set `RESEND_API_KEY` and
   `EMAIL_FROM="MakeYourCakes <orders@makeyourcakes.com>"`; redeploy.
6. Place one real delivery order with your own email. The email should arrive
   from orders@, and Gmail "Show original" should show DKIM pass for makeyourcakes.com.

When DNS moves to Cloudflare, copy the Resend records too (DNS only, grey cloud).
