# WhatsApp order desk

New orders go to the nearest in-stock bakery on WhatsApp, with the cake photo. The bakery taps **Accept**, then **Started**, **Ready**, **Handed over**. The admin gets every step on his own WhatsApp. The website stays the record: a WhatsApp reply runs the same checks as the vendor portal buttons.

Design: `docs/superpowers/specs/2026-10-09-whatsapp-order-desk-design.md`. No database migration was needed.

## How it works

1. An order is confirmed. If `ASSIGNMENT_AUTO_START=true`, the nearest eligible bakery gets an offer (the existing rules: exact cake, size and egg type in stock, accepting orders, under capacity, in radius, can meet the deadline).
2. The bakery gets the `order_offer` template with the cake photo and Accept / Reject buttons. The admin gets `admin_new_order` and an update saying who was offered.
3. Accept: the bakery gets "yours" with Started / Ready / Handed over buttons. Reject, or no answer within `ASSIGNMENT_RESPONSE_SECONDS` (default 15 minutes): the next-nearest eligible bakery is offered (needs `ASSIGNMENT_AUTO_REASSIGN=true`). The admin is told each time.
4. No bakery left: the order goes to MANUAL and the admin gets a message with the admin order link.
5. Out for delivery, delivered and cancelled stay on the website. The admin gets each on WhatsApp. A cancellation also tells the bakery that held the order.

If Meta is down, offers still expire and move on. Messages wait in the outbox and retry (up to 8 attempts).

## What bakeries can type

Not case-sensitive. Add `MC-XXXX` when the bakery has more than one open order.

| Action | Words |
|---|---|
| Accept | accept, yes, ok, okay |
| Reject | reject, no |
| Started | start, started, order started, start order |
| Ready | ready, order ready |
| Handed over | handed over, handover, picked up, done |

Example: `started MC-1234`.

If the word fits one order, it applies. If it fits none, the bakery is told so. If it fits several, the bakery is asked which one. Anything else gets a short help message. A message from a number that is not an active bakery gets one fixed line saying the number is for bakery partners.

Bakery phones are matched to the sender after cleaning them up. Spaces, `+91` and a leading `0` are all fine. Each active bakery needs its own number. If two active bakeries share one, WhatsApp replies from it do nothing except ask them to contact the admin. Set phones in `/admin/vendors`.

## Environment variables

| Variable | What it is |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Permanent token of a Meta system user. Secret. |
| `WHATSAPP_PHONE_NUMBER_ID` | From WhatsApp, API Setup. |
| `WHATSAPP_APP_SECRET` | From App, Basic. Secret. |
| `WHATSAPP_VERIFY_TOKEN` | Any random string. Type the same one into Meta's webhook form. |
| `WHATSAPP_ADMIN_NUMBERS` | Comma-separated, with country code, e.g. `919800000000,919811111111`. A 10-digit Indian number gets `91` added. |
| `ASSIGNMENT_AUTO_START` | `true`: offer the nearest eligible bakery at confirmation. |
| `ASSIGNMENT_AUTO_REASSIGN` | `true`: after a rejection or expiry, offer the next bakery. |
| `ASSIGNMENT_RESPONSE_SECONDS` | Reply window, default 900. |
| `ASSIGNMENT_WORKER_SECRET`, `NOTIFICATION_WORKER_SECRET` | Secrets the pinger sends (see below). |
| `NEXT_PUBLIC_SITE_URL` | Base of the cake-photo links. Default `https://makeyourcakes.com`. |

WhatsApp is off unless `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are both set. With it off, nothing is queued and the site behaves as before.

For go-live, set all four of `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN`. `WHATSAPP_APP_SECRET` is needed for webhook signatures and for the cake-photo links. Without it the photo route returns 404 and template sends fail.

Cake-photo links point at `NEXT_PUBLIC_SITE_URL`. On a preview deploy, set it to the preview's own URL, or Meta will fetch photos from the production site.

Never commit real values. `.env.example` has the names only.

## Admin: one-time Meta setup

The admin does these. Code can't.

1. Go to business.facebook.com and create a Business portfolio.
2. Go to developers.facebook.com, create an app of type Business, and add **WhatsApp**.
3. WhatsApp, API Setup, **Add phone number**. Use the new number, display name "MakeYourCakes", and verify it with the SMS or voice code. This number is API-only: it can't also be opened in the WhatsApp app. The admin reads everything on his personal WhatsApp.
4. WhatsApp Manager: add a payment method.
5. Business settings, System users: create one. Assign it the app and the WhatsApp account. Generate a non-expiring token with `whatsapp_business_messaging` and `whatsapp_business_management`. This is `WHATSAPP_ACCESS_TOKEN`.
6. App, Basic: copy the App secret into `WHATSAPP_APP_SECRET`. Add the site's privacy policy URL. Switch the app to **Live**.
7. WhatsApp, Configuration, Webhook: callback URL `https://<site>/api/whatsapp/webhook`, the verify token (`WHATSAPP_VERIFY_TOKEN`), and subscribe to **messages**.
8. WhatsApp Manager, Message templates: create the three templates below.

Business verification is not needed to start. The unverified limit (250 recipients a day) is far above a few bakeries plus the admin.

### Templates

All three: category **Utility**, language **English** (`en`). Names and parameter order must match exactly. They live in `lib/whatsappMessages.ts`.

| Name | Header | Body | Buttons |
|---|---|---|---|
| `order_offer` | Image | `New order {{1}} 🎂 {{2}}. Due {{3}}. Deliver to {{4}} ({{5}} km). Your earning ₹{{6}}. Please reply within {{7}} minutes.` | Quick reply **Accept**, quick reply **Reject** |
| `admin_new_order` | Image | `New order {{1}} for ₹{{2}}: {{3}}. Due {{4}}, delivery to {{5}}. Assignment has started.` | none |
| `order_update` | none | `Update on order {{1}}: {{2}}. Details are on the admin page.` | none |

Variables:

| Template | {{1}} | {{2}} | {{3}} | {{4}} | {{5}} | {{6}} | {{7}} |
|---|---|---|---|---|---|---|---|
| `order_offer` | order ref (MC-XXXX) | cake, size, egg type | due time | delivery area | distance in km | bakery's earning | reply window in minutes |
| `admin_new_order` | order ref | order total | cake | due time | delivery area | | |
| `order_update` | order ref | what happened | | | | | |

Parameters never contain line breaks. Approval can take a while, so create them early. If Meta rejects or edits one, change the matching builder in `lib/whatsappMessages.ts`.

## Pinger (every-minute timer)

Offer expiry and retries need something to call the site every minute. Vercel Hobby crons run daily only, so use cron-job.org (free):

1. Create two jobs, each every minute, method **POST**.
2. URLs: `https://<site>/api/internal/assignments` and `https://<site>/api/internal/notifications`.
3. Header on both: `Authorization: Bearer <secret>`. Use `ASSIGNMENT_WORKER_SECRET` for the first and `NOTIFICATION_WORKER_SECRET` for the second.

Messages caused by website actions can lag up to a minute. Messages caused by a WhatsApp reply or by checkout go out at once.

## Dry run on Meta's test number

Do this before the real number. Meta gives a free test number that sends to up to 5 verified phones.

1. Deploy a Vercel preview with the demo database (see `.env.demo`, git-ignored). Set `NEXT_PUBLIC_SITE_URL` to the preview URL, then **redeploy**: `NEXT_PUBLIC_` values are inlined at build time, so a change only takes effect on a new build. Also set `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` on the preview (the handshake and photo links need them).
   - Vercel Deployment Protection (Vercel Authentication) is on for previews by default and blocks Meta's webhook calls and photo fetches. Either turn protection off for this preview while testing, or create a "Protection Bypass for Automation" secret. Meta can't send custom headers, so the practical route is the query parameter `x-vercel-protection-bypass=<secret>` on the callback URL. Check Vercel's docs for the current method before relying on this.
2. In the Meta app, use the test number's phone number ID and temporary token. Add your own phones as recipients. Point the webhook at the preview.
3. Create three vendors in the demo DB whose phones are the verified test phones. Set `WHATSAPP_ADMIN_NUMBERS` to another verified phone.
4. Set `ASSIGNMENT_AUTO_START=true` and `ASSIGNMENT_AUTO_REASSIGN=true`. Run the pinger or call the two worker URLs by hand.
5. Place an order. Check: the nearest in-stock bakery gets the photo and Accept / Reject buttons; the admin phone gets "new order" and "offered to".
6. Tap Accept. Then Started, Ready, Handed over. Check the order page on the website follows, and the admin phone gets each step.
7. Place a second order and Reject it. The next bakery should get an offer. Let a third offer expire and check it moves on. To make expiry quick, set `ASSIGNMENT_RESPONSE_SECONDS=60` on the preview for this step (and redeploy), then restore it (default 900) afterwards.
8. Type `started`, `done`, and a word with `MC-XXXX`. Check the replies.
9. Check an order with no cake photo (a builder order). The photo is a generated name card. Known limitation: it draws text with system fonts, and Vercel's runtime may not have them. The card is still a valid image, but check the text looks right.

## Rollout

1. Ship with all new flags unset. No change in production.
2. The admin completes the Meta setup. Templates get approved.
3. Test end to end on the preview and demo DB with Meta's test number.
4. Production: set the WhatsApp variables, check every bakery's phone in `/admin/vendors`, set up the pinger. Then set `ASSIGNMENT_AUTO_START=true` and `ASSIGNMENT_AUTO_REASSIGN=true`.

To turn it all off: unset `ASSIGNMENT_AUTO_START` (the admin picks again) and `WHATSAPP_ACCESS_TOKEN` (nothing is sent).

## If something fails

- Messages stay `pending` or end `failed`: look at `lastError` on the `NotificationOutbox` row. Usual causes are a wrong token, a template that isn't approved, or a bakery not on WhatsApp.
- Webhook handshake fails: `WHATSAPP_VERIFY_TOKEN` differs between Vercel and Meta.
- Webhook returns 401: `WHATSAPP_APP_SECRET` is wrong.
- Photos don't show: `WHATSAPP_APP_SECRET` unset (route returns 404), or `NEXT_PUBLIC_SITE_URL` points somewhere Meta can't reach.
- A bakery gets no offer: its phone is empty. The offer still shows in the vendor portal and still expires on time.
- A bakery's replies do nothing: its phone is shared with another active bakery. It still receives offers, but any reply gets "This number is linked to more than one bakery. Please contact the admin." Give each bakery its own number.
