-- Audit trail for role changes (lib/staffRoles, scripts/role.ts). Additive only:
-- safe to apply before the code that writes to it is deployed.
CREATE TABLE "RoleChange" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "targetId" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "fromRole" "UserRole",
    "toRole" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RoleChange_createdAt_idx" ON "RoleChange"("createdAt");

-- No policies, on purpose: see 1_enable_rls.
ALTER TABLE "RoleChange" ENABLE ROW LEVEL SECURITY;
