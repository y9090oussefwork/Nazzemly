import 'server-only';

import { Bot } from 'grammy';
import { prisma } from './prisma';
import { decryptBotToken } from './telegram-manager';

type Segment = { stage?: string | null; tag?: string | null };

function parseSegment(value: unknown): Segment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    stage: typeof input.stage === 'string' && input.stage ? input.stage : null,
    tag: typeof input.tag === 'string' && input.tag ? input.tag : null,
  };
}

export async function processDueBroadcasts(limit = 3) {
  const broadcasts = await prisma.botBroadcast.findMany({
    where: {
      status: 'queued',
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
    },
    orderBy: { scheduledAt: 'asc' },
    take: Math.min(Math.max(limit, 1), 10),
  });

  const results: Array<{ id: string; delivered: number; failed: number; status: string }> = [];
  for (const broadcast of broadcasts) {
    const claimed = await prisma.botBroadcast.updateMany({
      where: { id: broadcast.id, status: 'queued' },
      data: { status: 'processing' },
    });
    if (claimed.count !== 1) continue;

    let delivered = 0;
    let failed = 0;
    try {
      const settings = await prisma.botSettings.findFirst({
        where: {
          id: broadcast.botSettingsId,
          tenantId: broadcast.tenantId,
          isActive: true,
        },
      });
      if (!settings) throw new Error('Bot is not active');

      const segment = parseSegment(broadcast.segment);
      const customers = await prisma.customer.findMany({
        where: {
          tenantId: broadcast.tenantId,
          tgId: { not: null },
          deletedAt: null,
          ...(segment.stage ? { stage: segment.stage } : {}),
          ...(segment.tag ? { tags: { has: segment.tag } } : {}),
        },
        select: { tgId: true },
        take: 5000,
      });
      const bot = new Bot(decryptBotToken(settings));

      for (const customer of customers) {
        if (!customer.tgId) continue;
        try {
          await bot.api.sendMessage(customer.tgId, broadcast.message);
          delivered += 1;
        } catch {
          failed += 1;
        }
        if ((delivered + failed) % 25 === 0) {
          await prisma.botBroadcast.update({
            where: { id: broadcast.id },
            data: { delivered, failed },
          });
        }
      }

      const status = failed > 0 && delivered === 0 ? 'failed' : failed > 0 ? 'partial' : 'sent';
      await prisma.botBroadcast.update({
        where: { id: broadcast.id },
        data: { delivered, failed, status, sentAt: new Date() },
      });
      results.push({ id: broadcast.id, delivered, failed, status });
    } catch (error) {
      failed += 1;
      await prisma.botBroadcast.update({
        where: { id: broadcast.id },
        data: { delivered, failed, status: 'failed', sentAt: new Date() },
      });
      console.error('Broadcast failed', {
        broadcastId: broadcast.id,
        tenantId: broadcast.tenantId,
        error: error instanceof Error ? error.message : 'unknown',
      });
      results.push({ id: broadcast.id, delivered, failed, status: 'failed' });
    }
  }
  return results;
}
