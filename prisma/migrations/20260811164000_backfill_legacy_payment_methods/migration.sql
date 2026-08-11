-- Preserve payment details configured by existing merchants before payment methods became first-class records.
INSERT INTO "TenantPaymentMethod" (
  "id", "tenantId", "type", "label", "accountIdentifier", "isActive", "showInBot", "sortOrder"
)
SELECT
  'legacy-wallet-' || settings."tenantId",
  settings."tenantId",
  'wallet',
  'فودافون كاش',
  settings."menuConfig"->>'vodafoneNumber',
  true,
  true,
  0
FROM "BotSettings" AS settings
WHERE NULLIF(BTRIM(settings."menuConfig"->>'vodafoneNumber'), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TenantPaymentMethod" AS method
    WHERE method."tenantId" = settings."tenantId"
      AND method."type" = 'wallet'
      AND method."accountIdentifier" = settings."menuConfig"->>'vodafoneNumber'
  );

INSERT INTO "TenantPaymentMethod" (
  "id", "tenantId", "type", "label", "accountIdentifier", "isActive", "showInBot", "sortOrder"
)
SELECT
  'legacy-instapay-' || settings."tenantId",
  settings."tenantId",
  'instapay',
  'InstaPay',
  settings."menuConfig"->>'instapayAddress',
  true,
  true,
  1
FROM "BotSettings" AS settings
WHERE NULLIF(BTRIM(settings."menuConfig"->>'instapayAddress'), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "TenantPaymentMethod" AS method
    WHERE method."tenantId" = settings."tenantId"
      AND method."type" = 'instapay'
      AND method."accountIdentifier" = settings."menuConfig"->>'instapayAddress'
  );
