-- AlterTable
ALTER TABLE "AccountPool" ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "deliveredCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'account',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "servicePlanId" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'available';

-- AlterTable
ALTER TABLE "ServicePlan" ADD COLUMN     "fulfillmentMode" TEXT NOT NULL DEFAULT 'manual_contact',
ADD COLUMN     "purchaseMessage" TEXT,
ADD COLUMN     "requiredCustomerFields" JSONB,
ADD COLUMN     "statusTemplates" JSONB,
ADD COLUMN     "warrantyDays" INTEGER,
ADD COLUMN     "warrantyType" TEXT NOT NULL DEFAULT 'none';

-- Preserve legacy one-sale delivery units and connect them to the first plan of their service.
UPDATE "AccountPool"
SET "deliveredCount" = CASE WHEN "isUsed" THEN 1 ELSE 0 END;

UPDATE "AccountPool" AS inventory
SET "servicePlanId" = (
  SELECT plan."id"
  FROM "ServicePlan" AS plan
  WHERE plan."serviceId" = inventory."serviceId"
  ORDER BY plan."sortOrder" ASC, plan."durationDays" ASC, plan."createdAt" ASC
  LIMIT 1
);

UPDATE "ServicePlan" AS plan
SET
  "fulfillmentMode" = 'auto_delivery',
  "trackInventory" = true,
  "stockQuantity" = COALESCE((
    SELECT SUM(GREATEST(inventory."capacity" - inventory."deliveredCount", 0))::INTEGER
    FROM "AccountPool" AS inventory
    WHERE inventory."servicePlanId" = plan."id" AND inventory."status" = 'available'
  ), 0)
WHERE EXISTS (SELECT 1 FROM "AccountPool" AS inventory WHERE inventory."servicePlanId" = plan."id");


-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "servicePlanId" TEXT,
    "subscriptionId" TEXT,
    "assignedToId" TEXT,
    "orderNo" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'dashboard',
    "paymentStatus" TEXT NOT NULL DEFAULT 'paid',
    "fulfillmentStatus" TEXT NOT NULL DEFAULT 'new',
    "amount" DECIMAL(18,2) NOT NULL,
    "costPrice" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "paymentFee" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
    "customerNote" TEXT,
    "internalNote" TEXT,
    "warrantyType" TEXT NOT NULL DEFAULT 'none',
    "warrantyEndsAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderInputValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderInputValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "message" TEXT,
    "isCustomerVisible" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAllocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountPoolId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotFlowSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "flow" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "dataEncrypted" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotFlowSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_subscriptionId_key" ON "Order"("subscriptionId");

-- CreateIndex
CREATE INDEX "Order_tenantId_fulfillmentStatus_createdAt_idx" ON "Order"("tenantId", "fulfillmentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_paymentStatus_createdAt_idx" ON "Order"("tenantId", "paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_customerId_createdAt_idx" ON "Order"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_serviceId_servicePlanId_idx" ON "Order"("tenantId", "serviceId", "servicePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_orderNo_key" ON "Order"("tenantId", "orderNo");

-- CreateIndex
CREATE INDEX "OrderInputValue_tenantId_orderId_idx" ON "OrderInputValue"("tenantId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderInputValue_orderId_fieldKey_key" ON "OrderInputValue"("orderId", "fieldKey");

-- CreateIndex
CREATE INDEX "OrderEvent_tenantId_orderId_createdAt_idx" ON "OrderEvent"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_tenantId_type_createdAt_idx" ON "OrderEvent"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryAllocation_tenantId_accountPoolId_deliveredAt_idx" ON "DeliveryAllocation"("tenantId", "accountPoolId", "deliveredAt");

-- CreateIndex
CREATE INDEX "DeliveryAllocation_tenantId_customerId_deliveredAt_idx" ON "DeliveryAllocation"("tenantId", "customerId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAllocation_accountPoolId_orderId_key" ON "DeliveryAllocation"("accountPoolId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "BotFlowSession_orderId_key" ON "BotFlowSession"("orderId");

-- CreateIndex
CREATE INDEX "BotFlowSession_tenantId_flow_expiresAt_idx" ON "BotFlowSession"("tenantId", "flow", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BotFlowSession_tenantId_customerId_key" ON "BotFlowSession"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "AccountPool_tenantId_servicePlanId_status_createdAt_idx" ON "AccountPool"("tenantId", "servicePlanId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountPool" ADD CONSTRAINT "AccountPool_servicePlanId_fkey" FOREIGN KEY ("servicePlanId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_servicePlanId_fkey" FOREIGN KEY ("servicePlanId") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderInputValue" ADD CONSTRAINT "OrderInputValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderInputValue" ADD CONSTRAINT "OrderInputValue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAllocation" ADD CONSTRAINT "DeliveryAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAllocation" ADD CONSTRAINT "DeliveryAllocation_accountPoolId_fkey" FOREIGN KEY ("accountPoolId") REFERENCES "AccountPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAllocation" ADD CONSTRAINT "DeliveryAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAllocation" ADD CONSTRAINT "DeliveryAllocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAllocation" ADD CONSTRAINT "DeliveryAllocation_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotFlowSession" ADD CONSTRAINT "BotFlowSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotFlowSession" ADD CONSTRAINT "BotFlowSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotFlowSession" ADD CONSTRAINT "BotFlowSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
