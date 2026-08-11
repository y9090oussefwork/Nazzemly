import { NextResponse } from 'next/server';
import type { Update } from 'grammy/types';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getBotInstance } from '@/lib/bot';
import { decryptBotToken } from '@/lib/telegram-manager';
import { verifyWebhookSecret } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ webhookId: string }> },
) {
  const { webhookId } = await params;
  const settings = await prisma.botSettings.findUnique({
    where: { webhookId },
    select: {
      id: true,
      tenantId: true,
      botToken: true,
      botTokenEncrypted: true,
      webhookSecretHash: true,
      isActive: true,
      tenant: {
        select: {
          saasStatus: true,
          saasExpiry: true,
        },
      },
    },
  });

  if (!settings?.isActive || !settings.webhookSecretHash) {
    return NextResponse.json({ ok: true, status: 'inactive' });
  }
  const expired = settings.tenant.saasExpiry && settings.tenant.saasExpiry <= new Date();
  if (settings.tenant.saasStatus !== 'active' || expired) {
    return NextResponse.json({ ok: true, status: 'tenant_inactive' });
  }

  const secret = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!verifyWebhookSecret(secret, settings.webhookSecretHash)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  let update: Record<string, unknown>;
  try {
    update = JSON.parse(await request.text()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const updateId = update.update_id;
  if (typeof updateId !== 'number') {
    return NextResponse.json({ error: 'missing_update_id' }, { status: 400 });
  }
  const externalId = String(updateId);

  let event = await prisma.botEvent.findUnique({
    where: {
      botSettingsId_externalId: {
        botSettingsId: settings.id,
        externalId,
      },
    },
  });
  if (event?.status === 'processed') {
    return NextResponse.json({ ok: true, status: 'duplicate' });
  }

  if (!event) {
    try {
      event = await prisma.botEvent.create({
        data: {
          tenantId: settings.tenantId,
          botSettingsId: settings.id,
          externalId,
          type: 'telegram_update',
          payload: update as Prisma.InputJsonValue,
          status: 'received',
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      event = await prisma.botEvent.findUniqueOrThrow({
        where: {
          botSettingsId_externalId: {
            botSettingsId: settings.id,
            externalId,
          },
        },
      });
      if (event.status === 'processed') {
        return NextResponse.json({ ok: true, status: 'duplicate' });
      }
    }
  }

  try {
    await prisma.botEvent.update({
      where: { id: event.id },
      data: { status: 'processing', attempts: { increment: 1 }, error: null },
    });
    const token = decryptBotToken(settings);
    await getBotInstance(token, settings.tenantId).handleUpdate(update as unknown as Update);
    await prisma.$transaction([
      prisma.botEvent.update({
        where: { id: event.id },
        data: { status: 'processed', processedAt: new Date(), error: null },
      }),
      prisma.botSettings.update({
        where: { id: settings.id },
        data: { lastWebhookAt: new Date(), connectionStatus: 'connected', lastError: null },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'update_failed';
    await prisma.$transaction([
      prisma.botEvent.update({
        where: { id: event.id },
        data: { status: 'failed', error: message },
      }),
      prisma.botSettings.update({
        where: { id: settings.id },
        data: { lastError: message, connectionStatus: 'error' },
      }),
    ]).catch(() => undefined);
    console.error('Telegram webhook processing failed', {
      tenantId: settings.tenantId,
      eventId: event.id,
      error: message,
    });
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
