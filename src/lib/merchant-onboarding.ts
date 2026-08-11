import 'server-only';

import { prisma } from './prisma';

export async function assertMerchantOnboardingComplete(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { onboardingCompletedAt: true },
  });

  if (!tenant?.onboardingCompletedAt) {
    throw new Error('أكمل إعداد متجرك أولًا. سنحفظ تقدمك ويمكنك المتابعة في أي وقت.');
  }
}
