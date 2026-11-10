# Database backups

Every Sunday at 03:00 IST, `.github/workflows/db-backup.yml` copies the shop's data (the `public` schema of the production Postgres on Railway: orders, cakes, settings, delivery zones) and keeps it for 90 days, so about 13 weekly backups exist at any time. You can also start one by hand: **GitHub → Actions → Weekly database backup → Run workflow**.

The repository is public, so each backup is encrypted (AES-256) before it is uploaded. Without the passphrase, a backup file is unreadable.

## One-time setup

In GitHub, go to **Settings → Secrets and variables → Actions → New repository secret** and add two secrets:

| Secret | Value |
|---|---|
| `SUPABASE_BACKUP_URL` | The name is historical. In Railway, open the **Postgres** service → **Variables** and copy `DATABASE_PUBLIC_URL`. (The private `DATABASE_URL` only works inside Railway, not from GitHub.) |
| `BACKUP_PASSPHRASE` | A long random passphrase. Make one with `openssl rand -base64 32` in Terminal, **save it in your password manager first**, then paste it here. Without it, no backup can ever be opened. |

Then run the workflow once by hand and check that it finishes green.

## Getting a backup

**Actions → Weekly database backup**, open a green run, and under **Artifacts** download `db-backup-YYYY-MM-DD`. Unzip it to get `makeyourcakes-db-YYYY-MM-DD.sql.gz.enc`.

## Opening a backup (macOS has everything needed)

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 \
  -in makeyourcakes-db-YYYY-MM-DD.sql.gz.enc | gunzip > backup.sql
```

It asks for the passphrase. `backup.sql` is plain SQL you can read.

## Restoring

Restore into a **new, empty** database, never on top of the live one. That can be a new Railway Postgres or a local one. In the new database, first remove its empty `public` schema (the backup recreates it), then load the file:

```bash
psql "<new database URL>" -c 'DROP SCHEMA public;'
psql "<new database URL>" -v ON_ERROR_STOP=1 -f backup.sql
```

Then point `DATABASE_URL` on the Railway web service at the new database and redeploy.

The restore was tested on 9 November 2026. A backup of the scratch database was encrypted with OpenSSL 3, decrypted on macOS (LibreSSL), and restored into an empty database. Every table's row count matched, and row-level security was restored with it.

## What is not in the backup

- **Sign-in accounts.** They live in Clerk, not this database.
- **Cake photos.** Uploaded photos are in Vercel Blob storage, and the custom-cake photos are in `public/` in this repository.

If the database is lost, a restore brings back the orders, catalogue and settings, and people sign in again with the same accounts.
