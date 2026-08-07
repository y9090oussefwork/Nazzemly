import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getBotInstance } from '@/lib/bot';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ botToken: string }> }
) {
  try {
    const { botToken } = await params;
    if (!botToken) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // 1. Resolve BotSettings and Tenant
    const botSettings = await prisma.botSettings.findFirst({
      where: {
        botToken,
        isActive: true,
      },
    });

    if (!botSettings) {
      // Return 200 to prevent Telegram from spamming retries for unregistered bots
      console.warn(`Received webhook update for inactive or unknown bot token: ${botToken}`);
      return NextResponse.json({ ok: true, status: 'inactive' });
    }

    // 2. Parse update payload
    const update = await request.json();

    // 3. Get bot instance and handle update
    const bot = getBotInstance(botToken, botSettings.tenantId);
    
    // Process update asynchronously so we reply to Telegram immediately (avoids timeouts)
    bot.handleUpdate(update).catch((err) => {
      console.error(`Error processing update for bot ${botSettings.botUsername}:`, err);
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Webhook error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
