import 'server-only';

import { Bot } from 'grammy';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from './prisma';
import { startLocalBotPolling, stopLocalBotPolling } from './bot';
import { decryptSecret, encryptSecret, hashWebhookSecret, randomToken } from './security';

interface TelegramConfiguration {
  botToken?: string;
  isActive: boolean;
  welcomeMsg?: string;
  supportMessage?: string;
  menuConfig?: Record<string, unknown>;
}

type TelegramConnection = {
  mode: 'configured_webhook' | 'local_polling' | 'platform_setup_required' | 'disabled';
  message: string;
};

function configuredApplicationUrl() {
  const value = process.env.APP_BASE_URL?.trim().replace(/\/$/, '') || '';
  if (!value.startsWith('https://')) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return null;
    return value;
  } catch {
    return null;
  }
}

function friendlyTelegramError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  const normalized = message.toLowerCase();
  if (normalized.includes('401') || normalized.includes('unauthorized') || normalized.includes('token')) {
    return 'رمز البوت غير صحيح أو تم إلغاؤه من BotFather. انسخ الرمز الجديد كاملًا ثم حاول مرة أخرى.';
  }
  if (normalized.includes('409') || normalized.includes('conflict')) {
    return 'البوت يعمل حاليًا في مكان آخر. أوقف النسخة الأخرى ثم اضغط حفظ وتشغيل البوت مرة أخرى.';
  }
  if (normalized.includes('fetch') || normalized.includes('network') || normalized.includes('timeout')) {
    return 'تعذر الاتصال بتيليجرام الآن. تحقق من الإنترنت ثم حاول مرة أخرى.';
  }
  if (normalized.includes('webhook') || normalized.includes('https') || normalized.includes('host')) {
    return 'تم حفظ رمز البوت، لكن تيليجرام لم يستطع الوصول إلى المنصة الآن. حاول مرة أخرى بعد قليل.';
  }
  return 'تم حفظ الإعدادات، لكن تشغيل استقبال الرسائل لم يكتمل. حاول مرة أخرى بعد قليل.';
}

export async function configureTelegramBot(tenantId: string, input: TelegramConfiguration) {
  const existing = await prisma.botSettings.findUnique({ where: { tenantId } });
  const token = input.botToken?.trim()
    ? input.botToken.trim()
    : existing?.botTokenEncrypted
      ? decryptSecret(existing.botTokenEncrypted)
      : existing?.botToken ?? null;

  if (!token) throw new Error('الصق رمز البوت الذي أرسله لك BotFather أولًا');
  if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    throw new Error('رمز البوت غير صحيح. انسخه كاملًا من رسالة BotFather من دون مسافات.');
  }

  const bot = new Bot(token);
  let identity;
  try {
    identity = await bot.api.getMe();
  } catch (error) {
    console.error('Telegram bot identity check failed', error);
    throw new Error(friendlyTelegramError(error));
  }

  const webhookId = existing?.webhookId || randomToken(18);
  const webhookSecret = randomToken(24);
  const publicUrl = configuredApplicationUrl();
  let connection: TelegramConnection = {
    mode: 'disabled',
    message: 'تم حفظ إعدادات البوت وهو متوقف حاليًا.',
  };
  let connectionStatus = 'disabled';
  let lastError: string | null = null;

  if (input.isActive) {
    if (publicUrl) {
      try {
        await stopLocalBotPolling(token, tenantId);
        await bot.api.setWebhook(`${publicUrl}/api/webhooks/telegram/${webhookId}`, {
          secret_token: webhookSecret,
          allowed_updates: ['message', 'callback_query'],
          drop_pending_updates: false,
        });
        connectionStatus = 'connected';
        connection = {
          mode: 'configured_webhook',
          message: 'تم ربط البوت برابط المنصة وتشغيل استقبال الرسائل.',
        };
      } catch (error) {
        console.error('Telegram webhook setup failed', error);
        connectionStatus = 'error';
        lastError = friendlyTelegramError(error);
        connection = { mode: 'configured_webhook', message: lastError };
      }
    } else if (process.env.NODE_ENV !== 'production') {
      try {
        await startLocalBotPolling(token, tenantId);
        connectionStatus = 'connected';
        connection = {
          mode: 'local_polling',
          message: 'تم تشغيل البوت في وضع الاختبار المحلي الآمن، من دون نشر لوحة التحكم على الإنترنت.',
        };
      } catch (error) {
        console.error('Local Telegram polling setup failed', error);
        connectionStatus = 'error';
        lastError = friendlyTelegramError(error);
        connection = { mode: 'local_polling', message: lastError };
      }
    } else {
      connectionStatus = 'setup_required';
      lastError = 'تم حفظ رمز البوت، لكن استقبال الرسائل يحتاج تفعيلًا مرة واحدة من مالك المنصة. تواصل مع دعم المنصة، ولن تحتاج إلى أي إعداد تقني.';
      connection = { mode: 'platform_setup_required', message: lastError };
    }
  } else {
    try {
      await stopLocalBotPolling(token, tenantId);
      await bot.api.deleteWebhook({ drop_pending_updates: false });
    } catch (error) {
      console.error('Telegram connection stop failed', error);
    }
  }

  const settings = await prisma.botSettings.upsert({
    where: { tenantId },
    update: {
      botToken: null,
      botTokenEncrypted: encryptSecret(token),
      tokenLast4: token.slice(-4),
      botUsername: identity.username ? '@' + identity.username : null,
      botName: identity.first_name,
      webhookId,
      webhookSecretHash: hashWebhookSecret(webhookSecret),
      isActive: input.isActive,
      welcomeMsg: input.welcomeMsg?.trim() || 'مرحباً بك، اختر الخدمة التي تناسبك من القائمة.',
      supportMessage: input.supportMessage?.trim() || 'اكتب رسالتك وسيتواصل معك فريق الدعم.',
      menuConfig: input.menuConfig as Prisma.InputJsonValue | undefined,
      connectionStatus,
      lastHealthCheckAt: new Date(),
      lastError,
    },
    create: {
      tenantId,
      botTokenEncrypted: encryptSecret(token),
      tokenLast4: token.slice(-4),
      botUsername: identity.username ? '@' + identity.username : null,
      botName: identity.first_name,
      webhookId,
      webhookSecretHash: hashWebhookSecret(webhookSecret),
      isActive: input.isActive,
      welcomeMsg: input.welcomeMsg?.trim() || 'مرحباً بك، اختر الخدمة التي تناسبك من القائمة.',
      supportMessage: input.supportMessage?.trim() || 'اكتب رسالتك وسيتواصل معك فريق الدعم.',
      menuConfig: input.menuConfig as Prisma.InputJsonValue | undefined,
      connectionStatus,
      lastHealthCheckAt: new Date(),
      lastError,
    },
  });

  return { settings, connection };
}

export function decryptBotToken(settings: {
  botTokenEncrypted: string | null;
  botToken: string | null;
}): string {
  if (settings.botTokenEncrypted) return decryptSecret(settings.botTokenEncrypted);
  if (settings.botToken) return settings.botToken;
  throw new Error('لم يتم إعداد رمز بوت تيليجرام');
}

export async function getTelegramHealth(tenantId: string) {
  const settings = await prisma.botSettings.findUnique({ where: { tenantId } });
  if (!settings) return { configured: false, status: 'disconnected' };

  try {
    const token = decryptBotToken(settings);
    const bot = new Bot(token);
    const identity = await bot.api.getMe();
    const publicUrl = configuredApplicationUrl();

    if (settings.isActive && !publicUrl && process.env.NODE_ENV !== 'production') {
      await startLocalBotPolling(token, tenantId);
      await prisma.botSettings.update({
        where: { id: settings.id },
        data: { connectionStatus: 'connected', lastHealthCheckAt: new Date(), lastError: null },
      });
      return {
        configured: true,
        status: 'connected',
        username: identity.username ? '@' + identity.username : null,
        pendingUpdates: 0,
        lastError: null,
        webhookUrl: 'local_polling',
      };
    }

    const webhook = await bot.api.getWebhookInfo();
    const telegramError = webhook.last_error_message || null;
    const webhookReady = Boolean(webhook.url);
    const status = !settings.isActive
      ? 'disabled'
      : webhookReady && !telegramError
        ? 'connected'
        : settings.connectionStatus === 'setup_required'
          ? 'setup_required'
          : 'warning';
    const lastError = telegramError
      ? friendlyTelegramError(new Error(telegramError))
      : !webhookReady && settings.isActive
        ? settings.lastError || 'تم حفظ البوت، لكن استقبال الرسائل لم يبدأ بعد. اضغط حفظ وتشغيل البوت للمحاولة مرة أخرى.'
        : null;

    await prisma.botSettings.update({
      where: { id: settings.id },
      data: { connectionStatus: status, lastHealthCheckAt: new Date(), lastError },
    });
    return {
      configured: true,
      status,
      username: identity.username ? '@' + identity.username : null,
      pendingUpdates: webhook.pending_update_count,
      lastError,
      webhookUrl: webhookReady ? 'configured' : 'missing',
    };
  } catch (error) {
    console.error('Telegram health check failed', error);
    const message = friendlyTelegramError(error);
    await prisma.botSettings.update({
      where: { id: settings.id },
      data: { connectionStatus: 'error', lastHealthCheckAt: new Date(), lastError: message },
    });
    return { configured: true, status: 'error', lastError: message };
  }
}
