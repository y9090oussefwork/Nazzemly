INSERT INTO "ServicePlan" (
  "id",
  "tenantId",
  "serviceId",
  "name",
  "durationDays",
  "price",
  "costPrice",
  "trackInventory",
  "stockQuantity",
  "showInBot",
  "isActive",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_' || substring(md5(random()::text || clock_timestamp()::text || service."id") from 1 for 20),
  service."tenantId",
  service."id",
  CASE WHEN service."defaultDuration" = 30 THEN 'شهر واحد' ELSE service."defaultDuration"::text || ' يوم' END,
  service."defaultDuration",
  service."defaultSellingPrice",
  service."defaultCostPrice",
  false,
  0,
  service."showInBot",
  service."isActive",
  0,
  now(),
  now()
FROM "Service" AS service
WHERE NOT EXISTS (
  SELECT 1 FROM "ServicePlan" AS plan WHERE plan."serviceId" = service."id"
);
