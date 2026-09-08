# Signing in

Who can open what, how it is enforced, and everything you have to configure once.

---

## The shape of it

```
Clerk  ─────────────────────►  who you are        (Clerk's instance, not our DB)
UserProfile.role  ──────────►  what you may do    (public."UserProfile", ours)
Server-side guards  ────────►  the enforcement    (layouts, pages, server actions)
```

Being signed in proves identity and nothing else. Every door is opened by a row in
`UserProfile`, read on the server, on the request that opens it.

| | `/build`, `/presets`, ordering | `/account` | `/kitchen` | `/admin` |
|---|---|---|---|---|
| **Guest** | ✅ | → sign in | → sign in | → sign in |
| **CUSTOMER** | ✅ | ✅ | ❌ | ❌ |
| **KITCHEN** | ✅ | ✅ | ✅ | ❌ |
| **ADMIN** | ✅ | ✅ | ✅ | ✅ |

Nobody needs an account to design a cake, see its price, or place an order. That was
true before authentication existed and it is still true; see "Guests", below.

---

## What you have to configure

### 1. Create a Clerk application

**dashboard.clerk.com** → create an application. Enable **Email** and **Google** on
the sign-in options screen. That is the whole of it — see *Google*, below, for why
there is no Google Cloud Console step in development.

### 2. Environment variables

From **Clerk dashboard → Configure → API keys**:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
```

Both are required by the running application. The publishable key belongs in the
browser and is safe there — it identifies the instance and nothing more. **The secret
key is not**: it can read, modify and impersonate every account in the instance.
`clerkMiddleware` needs it because session verification happens server-side, so it is
a deployment secret in the same tier as `DATABASE_URL`, and it must never appear
under a `NEXT_PUBLIC_` name or in a client component.

Keys are per instance: a development instance issues `pk_test_`/`sk_test_`,
production issues `pk_live_`/`sk_live_`. Use the production pair on the production
deployment.

`DATABASE_URL` is unchanged — the database is still Supabase Postgres. Only the
identity provider moved.

**Delete these six**, in `.env` and in the deployment — nothing reads them:

```
ADMIN_USER  ADMIN_PASSWORD  KITCHEN_USER  KITCHEN_PASSWORD
NEXT_PUBLIC_SUPABASE_URL  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

### 3. Paths

Set these in **Clerk dashboard → Configure → Paths**, so Clerk's own links and
redirects land on this app's pages rather than Clerk's hosted ones:

```
Sign-in URL   /sign-in
Sign-up URL   /sign-up
```

No environment variables are needed for this — the app uses Clerk's default route
names, and `app/sign-in/[[...sign-in]]` / `app/sign-up/[[...sign-up]]` are catch-alls
because Clerk's flow has more than one screen behind each URL (a second factor, a
password reset, an SSO callback).

---

## Google

**In development, there is nothing to configure.** A Clerk development instance ships
with shared OAuth credentials, so switching Google on in the dashboard is the entire
step — no Google Cloud project, no client ID, no redirect URI, no consent screen.

**For production**, Clerk requires your own credentials, because the shared ones are
development-only and rate-limited:

1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* →
   **Web application**.
2. **Authorised redirect URI** — Clerk's, not this app's. The exact value is shown in
   the Clerk dashboard next to the Google toggle when you switch it to custom
   credentials. It looks like `https://clerk.<your-domain>/v1/oauth_callback`.
3. Paste the Client ID and Client secret into Clerk → Google → *Use custom
   credentials*.

Nothing goes in `.env`: Clerk holds the secret, and this app never sees it.

---

## The database

**No migration is needed, and none was made for Clerk.**

`UserProfile.id` is a plain `TEXT` column holding whatever the identity provider
issues — a Clerk `user_2abc…` now, a Supabase UUID before that. There is no foreign
key to any provider's tables, which is exactly why swapping providers cost this table
nothing: it never knew which one it was holding.

The migration that created it, `5_user_profile`, is already applied. If you are
setting up a fresh database, note that `_prisma_migrations` on the existing
production database was behind the schema — migrations 3 and 4 had been applied
out-of-band — and was reconciled with `prisma migrate resolve --applied`. A fresh
database needs none of that; `npm run db:deploy` runs all six in order.

---

## Creating the first ADMIN

There is no bootstrap page, no seed row and no "first user becomes admin" rule — each
of those is a door that stays open after it has been used. A role is granted from a
shell that already holds the credentials.

**1. Sign in once, normally.** Go to `/sign-in` on the deployment, with Google or an
email and password. This creates the Clerk account, and the first authenticated
request creates the `UserProfile` row with the default role, `CUSTOMER`. Nothing else
can create either.

**2. Grant the role** from a machine with `DATABASE_URL` and `CLERK_SECRET_KEY`:

```bash
npm run role -- you@example.com ADMIN
```

```
  you@example.com
  CUSTOMER → ADMIN

  That account can now change prices, the catalogue and the delivery map,
  and can open the kitchen board as well.
```

**3. Reload `/admin`.** The role is read fresh on every request, so there is no
sign-out and back in.

To see who has what:

```bash
npm run role
```

---

## Adding a KITCHEN user

The same two steps, in this order — the person must exist before they can be given a
job.

```bash
# 1. They sign in once at /sign-in themselves. Their password is theirs; nobody
#    else ever sees or sets it, which is the thing the old shared password
#    could not do.
# 2. Then:
npm run role -- baker@example.com KITCHEN
```

They can now open `/kitchen` and move dockets. They cannot open `/admin`, cannot
change a price, and cannot promote themselves or anybody else — there is no code path
on any request that writes `UserProfile.role`.

**Removing access** is the same command pointed the other way, and takes effect on
their next request:

```bash
npm run role -- ex-baker@example.com CUSTOMER
```

Nobody else's access changes, which is the whole reason this replaced a shared
password.

**"KITCHEN" is never offered at sign-up.** Clerk's sign-up form collects an email and
a password, and no role field exists anywhere in the request path.

---

## Guests

Unchanged, and deliberately so:

- `/build` never asks who you are. `clerkMiddleware` runs over it — that is what makes
  `auth()` available anywhere — but with no session cookie it answers locally and
  nothing leaves the machine, and `requirementFor()` returns null so the request is
  waved straight through.
- `POST /api/orders` reads the session if there is one and writes `Order.userId` from
  it. No session means `userId: null`, which is what every order in the database
  already is. **There is no `userId` in the request body and there must never be one.**
- Price, catalogue, validation and the frozen price lines are identical either way.
  Signing in changes exactly one column.

The only thing an account buys a customer today is that their orders appear on
`/account`.

---

## Why it is enforced where it is

`proxy.ts` does two things and neither is the authorisation. It runs `clerkMiddleware`
so `auth()` works downstream, and it turns away a request with no session before it
costs a database round-trip.

The authorisation is inside the thing being protected:

| Where | Guard |
|---|---|
| `app/admin/layout.tsx` | `requireAdmin()` — covers every page under `/admin` |
| `app/admin/actions.ts` | `requireAdmin()` at the top of all nine writes |
| `app/kitchen/page.tsx` | `requireKitchen()` |
| `app/kitchen/actions.ts` | `requireKitchen()` |
| `app/account/page.tsx` | `requireRole("CUSTOMER")` |

Every server action carries its own guard, because **a layout does not run for a
server action**. An action is a POST to an endpoint whose id ships in the page
payload; anybody who has ever loaded `/admin` has that id. The apparent duplication is
the point.

A proxy is also a gate that can be routed around — CVE-2025-29927 was exactly that, a
header that persuaded Next to skip middleware. Clerk's own documentation says the same
thing in its own words: protect access as close to the resource as possible. Delete
`proxy.ts` entirely and both portals stay shut.

---

## Failing closed, without taking the shop down

With no Clerk keys set, `clerkMiddleware` and `<ClerkProvider>` both throw — and
because the middleware matcher has to be broad, that would answer 500 for **every page
on the site**, shopfront and builder included.

That is a worse failure than the one it warns about, so it is handled in two places:

- `proxy.ts` does not invoke `clerkMiddleware` at all when either key is missing.
  Public paths pass through untouched; `/admin`, `/kitchen` and `/account` get a 503
  naming the variables to set.
- `app/layout.tsx` mounts `<ClerkProvider>` only when there is an instance to point it
  at, and `/sign-in` prints "Not switched on" rather than throwing.

So a deployment with no keys is a fully working shop with two locked doors, which is
the same line `lib/db.ts` has always taken about a missing database.

---

## Row Level Security

Every table in `public` has RLS enabled with **no policies**, including `UserProfile`.
Unchanged from migration `1_enable_rls`.

- **What it protects**: the database is still Supabase Postgres, which publishes a
  PostgREST API over `public`. With RLS on and no policies, the `anon` and
  `authenticated` roles can read and write nothing through it — including the table
  that decides who gets into the kitchen.
- **Prisma is unaffected**: it connects as the table owner, which bypasses RLS unless
  `FORCE` is set.
- **Clerk is unaffected**: it never touches this database. Its users live in its own
  instance.
- **Server-side authorisation is still required**, and does all the real work. RLS
  here closes a side door; it is not the lock on the front one.

---

## What CI does and does not cover

CI runs with **no Clerk keys**, deliberately. A fake pair is not a usable stand-in: a
development instance answers the first request with a handshake redirect to its own
`<slug>.clerk.accounts.dev`, and an invented slug resolves to nothing.

So CI holds the unconfigured path, which is a real path worth holding — the staff
areas must 503 rather than open, and the shopfront, builder and guest ordering must
keep working. `e2e/auth.spec.ts` asserts exactly that, and `tests/auth.test.ts` settles
the whole guest/customer/kitchen/admin matrix without a network.

**Not covered by CI:** the signed-in redirect through a live Clerk instance. That
needs a real instance and `CLERK_SECRET_KEY` in repository secrets, which is a
decision rather than an oversight.

---

## When something goes wrong

| What you see | What it means |
|---|---|
| `503` on `/admin` or `/kitchen` | One or both Clerk keys are unset. Both areas fail closed rather than opening. |
| "Not switched on" at `/sign-in` | Same cause, said from the page rather than the proxy. |
| `Missing secretKey` in the server log | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set but `CLERK_SECRET_KEY` is not. Both are required. |
| Redirected to sign-in and straight back | Signed in, but no role. `npm run role` to check, then grant one. |
| "Wrong account" on `/account` | Signed in as somebody without the rank. Sign out, sign in as the right one. |
| Handshake redirect to a domain that does not resolve | The publishable key names a Clerk instance that does not exist. Check you pasted the right one. |
| Signed in but `/account` says no orders | Orders placed as a guest stay guest orders. Only orders placed while signed in attach. |
