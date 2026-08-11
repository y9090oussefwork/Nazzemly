import { NextResponse } from 'next/server';
import { Bot } from 'grammy';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/session';
import { decryptBotToken } from '@/lib/telegram-manager';

const RECEIPT_BROWSER_CACHE = 'private, no-cache, max-age=0, must-revalidate';
const FILE_PATH_TTL_MS = 6 * 60 * 60 * 1000;
const RECEIPT_MEMORY_TTL_MS = 60 * 60 * 1000;
const MAX_MEMORY_RECEIPTS = 24;
const MAX_MEMORY_RECEIPT_BYTES = 8 * 1024 * 1024;

type CachedPath = { path: string; expiresAt: number };
type CachedReceipt = { bytes: ArrayBuffer; contentType: string; expiresAt: number };

const telegramPathCache = new Map<string, CachedPath>();
const receiptMemoryCache = new Map<string, CachedReceipt>();

function cacheHeaders(requestId: string, contentType: string, etag: string, contentLength?: number) {
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': RECEIPT_BROWSER_CACHE,
    'Content-Disposition': `inline; filename="receipt-${requestId}.jpg"`,
    'X-Content-Type-Options': 'nosniff',
    ETag: etag,
  });
  if (contentLength && contentLength > 0) headers.set('Content-Length', String(contentLength));
  return headers;
}

function rememberReceipt(key: string, receipt: CachedReceipt) {
  if (receipt.bytes.byteLength > MAX_MEMORY_RECEIPT_BYTES) return;
  receiptMemoryCache.delete(key);
  receiptMemoryCache.set(key, receipt);
  while (receiptMemoryCache.size > MAX_MEMORY_RECEIPTS) {
    const oldestKey = receiptMemoryCache.keys().next().value;
    if (!oldestKey) break;
    receiptMemoryCache.delete(oldestKey);
  }
}

async function telegramFilePath(bot: Bot, tenantId: string, fileId: string) {
  const cacheKey = `${tenantId}:${fileId}`;
  const cached = telegramPathCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.path;
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) throw new Error('تعذر تحديد ملف الإيصال');
  telegramPathCache.set(cacheKey, { path: file.file_path, expiresAt: Date.now() + FILE_PATH_TTL_MS });
  return file.file_path;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const session = await requirePermission('payments');
    const { requestId } = await params;
    const payment = await prisma.paymentRequest.findFirst({
      where: { id: requestId, tenantId: session.tenantId },
      select: { screenshotUrl: true, updatedAt: true },
    });

    if (!payment?.screenshotUrl) {
      return NextResponse.json({ error: 'لا يوجد إيصال مرفق بهذا الطلب' }, { status: 404 });
    }

    const etag = `"receipt-${requestId}-${payment.updatedAt.getTime()}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { 'Cache-Control': RECEIPT_BROWSER_CACHE, ETag: etag } });
    }

    if (payment.screenshotUrl.startsWith('telegram-file:')) {
      const memoryKey = `${session.tenantId}:${requestId}:${payment.updatedAt.getTime()}`;
      const cachedReceipt = receiptMemoryCache.get(memoryKey);
      if (cachedReceipt && cachedReceipt.expiresAt > Date.now()) {
        return new Response(cachedReceipt.bytes, {
          headers: cacheHeaders(requestId, cachedReceipt.contentType, etag, cachedReceipt.bytes.byteLength),
        });
      }

      const fileId = payment.screenshotUrl.slice('telegram-file:'.length);
      const settings = await prisma.botSettings.findUnique({
        where: { tenantId: session.tenantId },
        select: { botToken: true, botTokenEncrypted: true },
      });
      if (!settings) {
        return NextResponse.json({ error: 'إعدادات البوت غير متاحة' }, { status: 404 });
      }

      const token = decryptBotToken(settings);
      const filePath = await telegramFilePath(new Bot(token), session.tenantId, fileId);
      const telegramResponse = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
      if (!telegramResponse.ok || !telegramResponse.body) {
        return NextResponse.json({ error: 'تعذر تحميل الإيصال من تيليجرام' }, { status: 502 });
      }

      const contentType = telegramResponse.headers.get('content-type') || 'image/jpeg';
      const contentLength = Number(telegramResponse.headers.get('content-length') || 0);
      const [clientStream, cacheStream] = telegramResponse.body.tee();
      void new Response(cacheStream).arrayBuffer().then((buffer) => {
        rememberReceipt(memoryKey, {
          bytes: buffer,
          contentType,
          expiresAt: Date.now() + RECEIPT_MEMORY_TTL_MS,
        });
      }).catch(() => undefined);

      return new Response(clientStream, {
        headers: cacheHeaders(requestId, contentType, etag, contentLength),
      });
    }

    const externalUrl = new URL(payment.screenshotUrl);
    if (externalUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'رابط الإيصال غير مدعوم' }, { status: 400 });
    }
    return NextResponse.redirect(externalUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'Unauthorized' ? 401 : message.startsWith('Forbidden') ? 403 : message.includes('timeout') ? 504 : 500;
    return NextResponse.json({ error: status === 504 ? 'استغرق تحميل الإيصال وقتًا طويلًا. حاول مرة أخرى.' : 'تعذر عرض الإيصال' }, { status });
  }
}
