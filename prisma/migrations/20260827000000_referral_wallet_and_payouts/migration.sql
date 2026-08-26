-- Referral program, wallet, and payout workflow.
-- Additive migration: it creates new tables only and does not touch merchant data.

CREATE TABLE IF NOT EXISTS "ReferralSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "defaultCommissionRate" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
  "minimumPayout" DECIMAL(18,2) NOT NULL DEFAULT 100.0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ReferralSettings" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "ReferralProgram" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
  "availableBalance" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
  "pendingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
  "totalEarned" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
  "totalRedeemed" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
  "totalPaidOut" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReferralAttribution" (
  "id" TEXT NOT NULL,
  "referrerProgramId" TEXT NOT NULL,
  "referredTenantId" TEXT NOT NULL,
  "commissionRate" DECIMAL(5,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReferralPayoutRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "processedById" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  "method" TEXT NOT NULL,
  "accountIdentifier" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "merchantNote" TEXT,
  "ownerNote" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralPayoutRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReferralWalletTransaction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "attributionId" TEXT,
  "payoutRequestId" TEXT,
  "sourceInvoiceId" TEXT,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "balanceAfter" DECIMAL(18,2) NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralWalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralProgram_tenantId_key" ON "ReferralProgram"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralProgram_code_key" ON "ReferralProgram"("code");
CREATE INDEX IF NOT EXISTS "ReferralProgram_isActive_code_idx" ON "ReferralProgram"("isActive", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralAttribution_referredTenantId_key" ON "ReferralAttribution"("referredTenantId");
CREATE INDEX IF NOT EXISTS "ReferralAttribution_referrerProgramId_status_createdAt_idx" ON "ReferralAttribution"("referrerProgramId", "status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralWalletTransaction_sourceInvoiceId_key" ON "ReferralWalletTransaction"("sourceInvoiceId");
CREATE INDEX IF NOT EXISTS "ReferralWalletTransaction_tenantId_createdAt_idx" ON "ReferralWalletTransaction"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReferralWalletTransaction_programId_type_createdAt_idx" ON "ReferralWalletTransaction"("programId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "ReferralPayoutRequest_tenantId_status_requestedAt_idx" ON "ReferralPayoutRequest"("tenantId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "ReferralPayoutRequest_status_requestedAt_idx" ON "ReferralPayoutRequest"("status", "requestedAt");

ALTER TABLE "ReferralProgram" ADD CONSTRAINT "ReferralProgram_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referrerProgramId_fkey" FOREIGN KEY ("referrerProgramId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referredTenantId_fkey" FOREIGN KEY ("referredTenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralPayoutRequest" ADD CONSTRAINT "ReferralPayoutRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralPayoutRequest" ADD CONSTRAINT "ReferralPayoutRequest_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralPayoutRequest" ADD CONSTRAINT "ReferralPayoutRequest_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferralWalletTransaction" ADD CONSTRAINT "ReferralWalletTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralWalletTransaction" ADD CONSTRAINT "ReferralWalletTransaction_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferralWalletTransaction" ADD CONSTRAINT "ReferralWalletTransaction_attributionId_fkey" FOREIGN KEY ("attributionId") REFERENCES "ReferralAttribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReferralWalletTransaction" ADD CONSTRAINT "ReferralWalletTransaction_payoutRequestId_fkey" FOREIGN KEY ("payoutRequestId") REFERENCES "ReferralPayoutRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
