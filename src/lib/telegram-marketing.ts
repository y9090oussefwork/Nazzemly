import 'server-only';

import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from './prisma';
import { decryptBotToken } from './telegram-manager';

export async function publishCatalogUpdate(input: {
  tenantId: string;
  kind: 'service' | 'restock';
  serviceId: string;
  serviceName: string;
  description?: string | null;
  planName?: string;
  stockQuantity?: number;
}) {
  try {
    const settings = await prisma.botSettings.findUnique({
      where: { tenantId: input.tenantId },
      select: {
        isActive: true,
        botTokenEncrypted: true,
        botToken: true,
        botUsername: true,
        channelChatId: true,
        autoPostServices: true,
        autoPostRestocks: true,
      },
    });
    const enabled = input.kind === 'service' ? settings?.autoPostServices : settings?.autoPostRestocks;
    if (!settings?.isActive || !settings.channelChatId || !enabled) return { sent: false };
    const bot = new Bot(decryptBotToken(settings));
    const title = input.kind === 'service' ? '✨ خدمة جديدة' : '📦 عاد المخزون';
    const text = input.kind === 'service'
      ? `${title}\n\n${input.serviceName}${input.description ? `\n${input.description}` : ''}`
      : `${title}\n\n${input.serviceName}${input.planName ? ` | ${input.planName}` : ''}${typeof input.stockQuantity === 'number' ? `\nالمتاح الآن: ${input.stockQuantity}` : ''}`;
    const keyboard = settings.botUsername
      ? new InlineKeyboard().url('عرض داخل البوت', `https://t.me/${settings.botUsername.replace(/^@/, '')}?start=service_${input.serviceId}`)
      : undefined;
    await bot.api.sendMessage(settings.channelChatId, text, keyboard ? { reply_markup: keyboard } : undefined);
    return { sent: true };
  } catch (error) {
    console.error('Telegram marketing post failed', error);
    return { sent: false };
  }
}
