-- AlterTable
ALTER TABLE "BotSettings" ADD COLUMN     "autoPostRestocks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoPostServices" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "channelChatId" TEXT,
ADD COLUMN     "channelUrl" TEXT,
ADD COLUMN     "requireChannelJoin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN     "paymentMethodId" TEXT,
ADD COLUMN     "reportedAmount" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "ServiceCategory" ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "businessDescription" TEXT,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "websiteUrl" TEXT;

-- CreateTable
CREATE TABLE "TenantContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "url" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "showInBot" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPaymentMethod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountIdentifier" TEXT NOT NULL,
    "directPaymentUrl" TEXT,
    "instructions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showInBot" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantContact_tenantId_type_showInBot_idx" ON "TenantContact"("tenantId", "type", "showInBot");

-- CreateIndex
CREATE INDEX "TenantPaymentMethod_tenantId_isActive_showInBot_sortOrder_idx" ON "TenantPaymentMethod"("tenantId", "isActive", "showInBot", "sortOrder");

-- AddForeignKey
ALTER TABLE "TenantContact" ADD CONSTRAINT "TenantContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPaymentMethod" ADD CONSTRAINT "TenantPaymentMethod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "TenantPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing merchants keep their current workflow; the guided setup is required for new merchants.
UPDATE "Tenant"
SET "onboardingStep" = 4, "onboardingCompletedAt" = CURRENT_TIMESTAMP
WHERE "onboardingCompletedAt" IS NULL;
