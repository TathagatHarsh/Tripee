# Order confirmation email from orders@makeyourcakes.com — design

Date: 2026-11-11 · Status: approved in chat, awaiting spec review

## Goal

When a customer's order is confirmed, send them one email from
`orders@makeyourcakes.com` with the order details. Nothing else.

## Decisions (from the user)

- **Addresses:** `hello@makeyourcakes.com` is the one Zoho mailbox (public
  contact, replies). `orders@makeyourcakes.com` is a free Zoho alias of hello@
  and the From address of automated order email. No noreply@, support@,
  admin@ or vendors@ for now; each can be added later as a free alias.
- **Which emails:** only "order confirmed". No status-update, cancellation,
  admin or vendor emails (WhatsApp already covers updates).
- **Email at checkout stays optional.** Orders without `customerEmail` get no
  email; WhatsApp still covers them.
- **Provider:** Resend, called with `fetch` (no new dependency). Not the Zoho
  mailbox: Mail Free has no SMTP for apps, and a mailbox is not a
  transactional sender.

## Where an order becomes confirmed (the three triggers)

1. `lib/placeOrder.ts` — delivery orders are created `confirmed`.
2. `lib/orderTransition.ts` — pickup orders move `draft → confirmed`.
3. `lib/customRequests.ts` — a custom-cake quote is paid and set `confirmed`.

Each calls the enqueue function inside its existing transaction.

## Components

### `lib/orderEmail.ts` (new)

- `orderConfirmationEmail(facts) → { subject, text, html }` — pure builder.
  Subject: `Your MakeYourCakes order <ref> is confirmed`. Body: ref, cake
  line(s), total in ₹ (existing `formatINR`), delivery or pickup, date and
  slot, delivery address (delivery only), link
  `${NEXT_PUBLIC_SITE_URL}/orders/<ref>`. Every customer-supplied string is
  HTML-escaped in the html part.
- `queueOrderConfirmationEmail(tx, order)` — returns without writing when
  `order.customerEmail` is empty or email is not configured
  (`RESEND_API_KEY` unset). Otherwise writes one `NotificationOutbox` row via
  `outboxCreate`:
  - `channel: "email"`, `destination: customerEmail`
  - `kind`: `new_order` for orders, `custom_request` for quotes (existing enum
    values — **no migration**; `channel` is already a free-text column)
  - `payload`: the rendered `{ subject, text, html }` (a snapshot; later order
    edits do not change a queued email)
  - `dedupeKey: email:order:<orderId>:confirmed` (custom quotes:
    `email:custom:<customRequestId>:confirmed`) — at most one email each, and
    re-running a trigger is a no-op (create must tolerate the unique conflict
    the same way existing outbox writes do).

`OutboxInput.channel` widens to `"webhook" | "whatsapp" | "email"`.

### `lib/email.ts` (new)

`sendEmail(row)` — one `POST https://api.resend.com/emails`:

- `from: process.env.EMAIL_FROM` (`MakeYourCakes <orders@makeyourcakes.com>`)
- `reply_to: hello@makeyourcakes.com`, `to: row.destination`
- `subject`, `text`, `html` from the payload
- headers: `Authorization: Bearer RESEND_API_KEY`, `Idempotency-Key: row.id`
- 10 s timeout; non-2xx throws `email_provider_<status>`; missing
  destination/config throws `email_destination_missing` /
  `email_provider_unconfigured`.

### `lib/notifications.ts` (changed)

`dispatchPendingNotifications` routes `channel === "email"` to `sendEmail`.
Retries, backoff, leases and the 8-attempt cap are unchanged.

## Error handling and privacy

- Email failure never affects the order: enqueue is a row write inside the
  order's transaction; sending happens later in the dispatcher.
- Logs never contain the full address (mask like `maskedPhone`: `t…@gmail.com`)
  or the email body; the provider status code is logged as today.

## Configuration and setup (outside code)

- Env: `RESEND_API_KEY`, `EMAIL_FROM`. Unset key = feature off (nothing queued).
- Resend: create account, add domain `makeyourcakes.com`, add its records at
  GoDaddy — DKIM TXT `resend._domainkey`, and MX + SPF TXT on the `send`
  subdomain. Root MX/SPF (Zoho) stay untouched; DMARC (`p=quarantine`,
  relaxed) passes via aligned DKIM.
- Zoho: add `orders@` as an alias of hello@ so customer replies land there.
- Set the env vars in production, then place one real delivery order with an
  email to verify.

## Testing

- Unit: builder fields, ₹ formatting, HTML escaping of name/address/message;
  enqueue skipped without email or key; dedupe key shape; dispatcher email
  branch with `fetch` mocked (URL, auth, Idempotency-Key, from, reply_to,
  error mapping).
- Integration (scratch Postgres, never production): each of the three
  triggers writes exactly one email row; repeating the trigger writes none.
- No test sends real email.

## Out of scope

Status/cancellation emails, admin/vendor email, required email at checkout,
email templates in a CMS, unsubscribe handling (transactional only).
