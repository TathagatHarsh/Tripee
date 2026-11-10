# Hosting on Railway

Production runs on Railway in **Singapore** (`asia-southeast1`), the closest region to Hyderabad. It is one project with two services:

- **web**, built from this repository's `main` branch. `railway.json` sets the region, the start command and the healthcheck.
- **Postgres**, the shop's database, in the same region.

DNS for makeyourcakes.com is on Cloudflare. GoDaddy still holds the registration, but its nameservers point to Cloudflare.

## Variables on the web service

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_PUBLIC_URL}}` (see below) |
| `DATABASE_POOL_MAX` | `10`. The app is one long-running server, not short serverless functions, so it can keep more connections open. |
| `SERVICE_AREA` | `hyderabad`. Keep it while no partner bakery is active, or every delivery is refused. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk dashboard → production instance → API keys |
| `ORDER_TOKEN_SECRET` | `openssl rand -base64 32` |
| `ASSIGNMENT_WORKER_SECRET`, `NOTIFICATION_WORKER_SECRET` | Must match the secrets the cron-job.org pingers send |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ADMIN_NUMBERS` | Meta app → WhatsApp |
| `OLA_MAPS_API_KEY`, `NEXT_PUBLIC_OLA_MAPS_API_KEY` | Ola Maps console |

Changing a `NEXT_PUBLIC_*` value requires a new build. Use **Redeploy**; a restart is not enough.

### Why `DATABASE_URL` is the public URL

`next build` reads the database while it prerenders cake pages. Railway's private network (`*.railway.internal`) is not available during a build, so a private URL would fail every build.

The public URL goes through Railway's proxy in the same region. It costs a few milliseconds per query and a little egress.

> ponytail: to move to the private URL later, keep the build from reading the database, or override `DATABASE_URL` only in the start command.

## Domain (Cloudflare)

- `makeyourcakes.com` and `www` are CNAMEs to the targets Railway shows under web → Settings → Domains. Set them to **DNS only** (grey cloud).
  - With the orange-cloud proxy, every visitor would reach the app from a Cloudflare IP, which breaks the per-visitor rate limit in `lib/apiGuard.ts`.
- Clerk's records (`clerk`, `accounts`, `clkmail`, `clk._domainkey`, `clk2._domainkey`) must be **DNS only**, or Clerk sign-in breaks.
- Zoho mail records (MX, SPF TXT, DKIM) are copied as they are.

## Day to day

- **Deploys:** every push to `main` deploys. A deploy goes live only once `/icon.svg` responds, so a build that fails to start never replaces the running site.
- **Logs:** web → Deployments → View logs.
- **Database migrations:** never run automatically. Run them by hand with `DATABASE_URL=<public url> npx prisma migrate deploy`, after testing against a scratch database.
- **Backups:** see [BACKUPS.md](BACKUPS.md). Railway can also take its own scheduled backups of the Postgres volume (Postgres service → Backups).
