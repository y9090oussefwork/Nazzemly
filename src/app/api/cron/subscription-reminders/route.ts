import { NextResponse } from 'next/server';
import { processSubscriptionReminders } from '@/lib/subscription-reminders';

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const results = await processSubscriptionReminders(100);
  return NextResponse.json({ ok: true, processed: results.length, results });
}