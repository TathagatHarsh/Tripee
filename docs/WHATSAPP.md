# WhatsApp order desk

New orders go to the nearest in-stock bakery on WhatsApp, with the cake photo. The bakery taps **Accept**, then **Started**, **Ready**, **Handed over**, **Delivered** (for a pickup: **Ready for collection**, **Collected**). The admin gets every step on his own WhatsApp. The website stays the record: a WhatsApp reply runs the same checks as the vendor portal buttons.

Design: `docs/superpowers/specs/2026-10-09-whatsapp-order-desk-design.md`. No database migration was needed.

## How it works

1. An order is confirmed. If `ASSIGNMENT_AUTO_START=true`, the nearest eligible bakery gets an offer (the existing rules: exact cake, size and egg type in stock, accepting orders, under capacity, in radius, can meet the deadline).
2. The bakery gets the `order_offer` template with the cake photo and Accept / Reject buttons. The admin gets `admin_new_order` and an update saying who was offered.
3. Accept: the bakery gets "yours" with Started / Ready / Handed over buttons. Reject, or no answer within `ASSIGNMENT_RESPONSE_SECONDS` (default 15 minutes): the next-nearest eligible bakery is offered (needs `ASSIGNMENT_AUTO_REASSIGN=true`). The admin is told each time. With `ASSIGNMENT_AUTO_START=true`, an order no bakery can take (none eligible at checkout, or every bakery declined or timed out) is cancelled and the customer told "Sorry, we can't deliver this order"; the admin gets a "Cancelled" note, not an "assign it" alert.
4. No bakery left: the order goes to MANUAL and the admin gets a message with the admin order link.
5. The bakery delivers the cake, so it moves the customer's order to the end, exactly as the vendor portal does. **Started** puts the order In the kitchen. **Handed over** sends it out for delivery (for a pickup, the customer sees "Ready to collect"), and the reply carries one more button, **Delivered** (or **Collected**), which closes the order. The customer's tracker moves with each step. On WhatsApp the customer hears only four things: confirmed, out for delivery, delivered and, if it happens, cancelled (see Customer templates below). Nothing is sent while the cake is being baked. Cancellation stays on the website. The admin gets every step on WhatsApp, and a cancellation also tells the bakery that held the order.

If Meta is down, offers still expire and move on. Messages wait in the outbox and retry (up to 8 attempts).

## What bakeries can type

Not case-sensitive. Add `MC-XXXX` when the bakery has more than one open order.

| Action | Words |
|---|---|
| Accept | accept, yes, ok, okay |
| Reject | reject, no |
| Started | start, started, order started, start order |
| Ready | ready, order ready |
| Handed over | handed over, handover, picked up, done, ready for collection |
| Delivered | delivered, order delivered, collected, order collected |

Example: `started MC-1234`. **Delivered** only works once the order is out for delivery.

If the word fits one order, it applies. If it fits none, the bakery is told so. If it fits several, the bakery is asked which one. Anything else gets a short help message. A message from a number that is not an active bakery gets one fixed line saying the number is for bakery partners.

Bakery phones are matched to the sender after cleaning them up. Spaces, `+91` and a leading `0` are all fine. Each active bakery needs its own number. If two active bakeries share one, WhatsApp replies from it do nothing except ask them to contact the admin. Set phones in `/admin/vendors`.

## Environment variables

| Variable | What it is |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Permanent token of a Meta system user. Secret. |
| `WHATSAPP_PHONE_NUMBER_ID` | From WhatsApp, API Setup. |
| `WHATSAPP_APP_SECRET` | From App, Basic. Secret. |
| `WHATSAPP_VERIFY_TOKEN` | Any random string. Type the same one into Meta's webhook form. |
| `PHONE_VERIFICATION` | `on` makes checkout verify the phone with a WhatsApp code (needs the `verify_code` template Active). Anything else: off. |
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
8. WhatsApp Manager, Message templates: create the ten templates below (five for bakeries and the admin, four for customers, and the verification code template).

Business verification is not needed, including for the `verify_code` Authentication template. The unverified limit (250 recipients a day) is far above a few bakeries plus the admin.

### Templates

The nine bakery, admin and customer templates: category **Utility**, language **English** (`en`). The verification code template is the exception (see below). Names and parameter order must match exactly. They live in `lib/whatsappMessages.ts`.

| Name | Header | Body | Buttons |
|---|---|---|---|
| `order_offer` | Image | `New cake order {{1}} 🎂 {{2}}. This order is due on {{3}}. It needs to be delivered to {{4}}, which is about {{5}} km from your bakery. If you accept it, your earning will be ₹{{6}}. Please accept or reject it within {{7}} minutes, or it will be offered to another bakery.` | Quick reply **Accept**, quick reply **Reject** |
| `admin_new_order` | Image | `A new cake order {{1}} has been placed for a total of ₹{{2}}. Cake details: {{3}}. It is due on {{4}} and will be delivered to {{5}}. We will send you an update here at every step of this order.` | none |
| `order_update` | none | `Update on cake order {{1}}: {{2}}. If you have any questions about this order, please contact the MakeYourCakes team.` | none |
| `custom_offer` | Image (customer's reference photo) | `A customer wants a custom cake, request {{1}} 🎂 Size: {{2}}. Flavour: {{3}}. Message on the cake: {{4}}. It is needed by {{5}} and will be delivered to {{6}}. Their budget: {{7}}. The photo above shows the design they like. If you can make it, reply to this message with your price in rupees, or tap the button if you cannot.` Footer: `Reply with your price, e.g. 1800` | Quick reply **Can't do it** |
| `custom_quote` | Image (customer's reference photo) | `Good news, we can make your custom cake, request {{1}} 🎂 Size: {{2}}. It will be ready for {{3}}. The price is ₹{{4}}, delivery included. Tap the button below to see the details and pay. Your cake is confirmed only once you have paid.` | URL **Pay now** → `https://makeyourcakes.com/c/{{1}}` (the one variable is the quote token), quick reply **Not for me** |

Variables:

| Template | {{1}} | {{2}} | {{3}} | {{4}} | {{5}} | {{6}} | {{7}} |
|---|---|---|---|---|---|---|---|
| `order_offer` | order ref (MC-XXXX) | cake, size, egg type | due time | delivery area | distance in km | bakery's earning | reply window in minutes |
| `admin_new_order` | order ref | order total | cake | due time | delivery area | | |
| `order_update` | order ref | what happened | | | | | |
| `custom_offer` | request ref (CR-XXXXXX) | size, e.g. "1.5 kg" | flavour | message on the cake ("-" if none) | needed-by time | delivery area only (never name, phone or street) | budget with the rupee sign, e.g. "₹1,800", or "no budget given" |
| `custom_quote` | request ref | size | due time | price to pay | | | |

### Customer templates

The customer gets these four and nothing else. The line breaks below are part of the approved text; parameters themselves never contain one. The footer is fixed text. `{{1}}` is always the customer's first name, or "there" when we don't have one.

**`customer_order_confirmed`**: sent once, when the order is confirmed (at checkout, since orders are created confirmed). Header: image (the cake photo).

```
Hi {{1}}, your cake order is confirmed! 🎉

🎂 {{2}}
📅 {{3}}
📍 {{4}}
🧾 Order {{5}} · ₹{{6}}

Our partner bakery will bake it fresh for you. We'll message you here when it's on its way.
```
Footer: `MakeYourCakes · Freshly baked in Hyderabad`

**`customer_out_for_delivery`**: sent when the bakery taps Handed over. Not sent for pickup orders. Header: image.

```
Your cake is on its way, {{1}}! 🚚

🎂 {{2}}
📍 Arriving at {{3}} by {{4}}
🧾 Order {{5}}

Please keep your phone close. The delivery partner may call you when they arrive.
```
Footer: `MakeYourCakes`

**`customer_order_delivered`**: sent when the order is marked delivered (or collected). Header: image.

```
Delivered! Enjoy your cake, {{1}} 🎂

Your order {{2}} has been handed over. Thank you for choosing MakeYourCakes, we hope it makes the day special 💛

Tip: keep it in the fridge and let it rest for 20 minutes before serving.
```
Footer: `MakeYourCakes · Freshly baked in Hyderabad`

**`customer_order_cancelled`**: sent only if the order is cancelled. No header.

```
Hi {{1}}, we're sorry, your cake order {{2}} has been cancelled.

{{3}}

If you already paid for it, we will refund the full amount to you.
```
Footer: `MakeYourCakes`

| Template | {{1}} | {{2}} | {{3}} | {{4}} | {{5}} | {{6}} |
|---|---|---|---|---|---|---|
| `customer_order_confirmed` | first name | cake, size, egg type (and the message on the cake) | due time | delivery area | order ref | order total |
| `customer_out_for_delivery` | first name | cake | delivery area | due time | order ref | |
| `customer_order_delivered` | first name | order ref | | | | |
| `customer_order_cancelled` | first name | order ref | why: "No partner bakery near you could make it in time." when no bakery could take it, otherwise "If you didn't ask for this, please write to hello@makeyourcakes.com and we'll sort it out." The staff cancel reason never goes to the customer. | | | |

Sample values for Meta: `Asha`, `Chocolate Truffle · 1kg · eggless`, `Sat 10 Oct, 4:00 pm`, `Jubilee Hills, Hyderabad, 500033`, `MC-AB12CD`, `1,250`.

**Deploy order:** merge the code that sends these only after all four are **Active** in WABA 985694517174842. Before that, every customer message fails with `132001` (template not found) and retries until it gives up; the old `order_update` customer messages keep working until then.

Parameters never contain line breaks. The first three are the texts Meta approved (the first draft was shorter, and Meta refused it with "too many variables for its length", so the fixed wording around the variables was lengthened; the variables and their order did not change). If a template is ever edited or rejected, change the matching builder in `lib/whatsappMessages.ts`.

`custom_offer` and `custom_quote` have **not been submitted to Meta yet**. Submit them with the wording above. If Meta asks for changes, change the matching builder in `lib/whatsappMessages.ts` before the branch ships.

**Deploy order for custom cakes:** run the `9l_custom_requests` migration on production (`prisma migrate deploy` on the Supabase session pooler, port 5432) *before* deploying the code that uses it. The outbox code writes `NotificationOutbox.customRequestId` on every insert, so code deployed ahead of the migration breaks checkout and every notification. The migration is safe for the code already running. Also, the custom-cake form only appears once WhatsApp, an image store and online payment are all configured.

### Verification code template

Used to confirm a customer's phone number. Name `verify_code`, category **Authentication**, language English. It must be created in WABA 985694517174842.

- Body: Meta's fixed text. The code is its only parameter (`{{1}}`), filled in by `verifyCodeMessage` in `lib/whatsappMessages.ts`, so nothing is typed in by hand.
- Button: **Copy code**, carrying the same code (`verifyCodeMessage` sends it as the button's parameter).
- Turn on **Add security recommendation**.
- Turn on **Add expiry time**, set to 10 minutes.

It was created on 2026-11-14 and went **Active** straight away, with no Business Verification needed. Turn on `PHONE_VERIFICATION` only while this template is **Active**.

Before turning on `PHONE_VERIFICATION`:

- On the production edge, confirm what `callerKey` resolves to. The per-caller send limit keys on the last `x-forwarded-for` entry, which behind Cloudflare/Railway may be a proxy IP shared by many customers.
- On the preview, verify a real code and inspect the `Set-Cookie` from `/api/phone/verify` (`myc_phone; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`), then complete a test payment.

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
