import { NextResponse } from 'next/server';
import { processSaaSAutoRenewals } from '@/lib/saas-renewals';

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results = await processSaaSAutoRenewals();
  return NextResponse.json({
    ok: true,
    renewed: results.filter((item) => item.status === 'renewed').length,
    insufficientBalance: results.filter((item) => item.status === 'insufficient_balance').length,
    results,
  });
}
