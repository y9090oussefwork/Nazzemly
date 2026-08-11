import { NextResponse } from 'next/server';
import { processDueBroadcasts } from '@/lib/broadcast';

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!configuredSecret || authorization !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const results = await processDueBroadcasts(3);
  return NextResponse.json({ ok: true, processed: results.length, results });
}
