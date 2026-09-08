-- Who is signed in, and what they are allowed to do.
--
-- Supabase Auth already owns identity: `auth.users`, the passwords, the Google
-- identities, the sessions and the refresh tokens all live in the `auth`
-- schema and none of them are copied here. This migration adds only the half
-- Auth cannot answer -- whether the person holding a valid session is a
-- customer, a baker, or the owner.
--
-- It has to be a table rather than a claim on the token. Supabase lets a
-- signed-in user write their own `user_metadata`, so a role kept there would be
-- a role its holder could grant themselves; the session is proof of identity
-- and nothing else. `UserProfile.role` is writable only by the database owner,
-- which is Prisma's connection and the `npm run role` script, and by nothing a
-- browser can reach.
--
-- Additive and reversible in effect. Every existing table keeps every column it
-- has, "Order"."userId" already existed and is NULL on every row ever written,
-- so the foreign key below validates against nothing and cannot fail. Orders
-- placed before this migration stay guest orders, which is what they were.

-- CreateEnum
-- No OWNER. It would carry exactly ADMIN's powers today, and a role that grants
-- nothing new is one more thing to reason about at every call site. Adding it
-- is one value here and one line in lib/auth.ts's ROLE_RANK.
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'KITCHEN', 'ADMIN');

-- CreateTable
-- "id" is TEXT holding the Supabase Auth UUID verbatim, and deliberately has no
-- foreign key to `auth.users`: that table belongs to another schema owned by
-- another role, and a cross-schema constraint would hand Supabase's migrations
-- a veto over this one. The id is only ever issued by Auth and never minted
-- here, so the two cannot drift apart.
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- "Who can get into the kitchen" is the only question ever asked of this table
-- other than by id, and it is asked by a person at a psql prompt.
CREATE INDEX "UserProfile_role_idx" ON "UserProfile"("role");

-- AddForeignKey
-- SET NULL, not CASCADE. Deleting a person must not delete the cake they
-- ordered: the kitchen still baked it, the books still count it, and the
-- price lines frozen on it are a record of what was agreed. The order simply
-- becomes what it would have been if they had never signed in -- a guest order.
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "UserProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, for the reason migration 1 gives: Supabase publishes a
-- PostgREST API over the public schema and the anon key is publishable. This is
-- the table that decides who gets into the kitchen and the admin portal, so it
-- is the one row set on this database that must never be writable by anybody
-- holding a public key -- a policy-less RLS here is the difference between a
-- role and a suggestion. No policies, so anon and authenticated get nothing at
-- all through PostgREST; Prisma connects as the table owner and bypasses RLS
-- unless FORCE is set, so the application is unaffected.
ALTER TABLE "UserProfile" ENABLE ROW LEVEL SECURITY;
