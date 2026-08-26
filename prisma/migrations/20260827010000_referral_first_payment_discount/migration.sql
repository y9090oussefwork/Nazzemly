-- Additive referral promotion fields. Existing merchant, wallet, and referral
-- records are preserved; existing attributions receive a zero-value offer.
ALTER TABLE "ReferralSettings"
  ADD COLUMN IF NOT EXISTS "firstMonthDiscountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0.0;

ALTER TABLE "ReferralAttribution"
  ADD COLUMN IF NOT EXISTS "firstMonthDiscountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS "firstPaidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstMonthDiscountAppliedAt" TIMESTAMP(3);
