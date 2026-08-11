import { NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { parseSMS } from '@/lib/smsParser';
import { decryptSecret, hashToken, verifyWebhookSignature } from '@/lib/security';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  if (Number(request.headers.get('content-length') || 0) > 100_000) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  const integration = await prisma.sMSIntegration.findUnique({
    where: { tenantId },
    include: { tenant: { select: { saasStatus: true, saasExpiry: true } } },
  });
  if (!integration?.isActive) {
    return NextResponse.json({ error: 'integration_not_found' }, { status: 404 });
  }
  const expired = integration.tenant.saasExpiry && integration.tenant.saasExpiry <= new Date();
  if (integration.tenant.saasStatus !== 'active' || expired) {
    return NextResponse.json({ error: 'tenant_inactive' }, { status: 403 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-webhook-signature') || '';
  if (!verifyWebhookSignature(decryptSecret(integration.secretEncrypted), rawBody, signature)) {
    await prisma.sMSIntegration.update({
      where: { id: integration.id },
      data: { lastError: 'invalid_signature' },
    }).catch(() => undefined);
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const sender = typeof body.sender === 'string' ? body.sender.trim().slice(0, 100) : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : '';
  const externalId =
    typeof body.externalId === 'string' && body.externalId.trim()
      ? body.externalId.trim().slice(0, 200)
      : 'body:' + hashToken(rawBody);

  if (!sender || !message) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (
    integration.allowedSenders.length > 0 &&
    !integration.allowedSenders.some((allowed) => allowed.toLowerCase() === sender.toLowerCase())
  ) {
    return NextResponse.json({ error: 'sender_not_allowed' }, { status: 403 });
  }

  let smsLog;
  try {
    smsLog = await prisma.sMSLog.create({
      data: {
        tenantId,
        externalId,
        sender,
        message,
        receivedAt: new Date(),
        signatureVerified: true,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ ok: true, status: 'duplicate' });
    }
    throw error;
  }

  const parsed = parseSMS(message);
  if (!parsed.isMatch) {
    await prisma.sMSIntegration.update({
      where: { id: integration.id },
      data: { lastWebhookAt: new Date(), lastError: null },
    });
    return NextResponse.json({ ok: true, status: 'ignored' });
  }

  const pending = await prisma.paymentRequest.findMany({
    where: { tenantId, status: 'pending', expiresAt: { gt: new Date() } },
    select: {
      id: true, amount: true, fraction: true, senderIdentifier: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const parsedCents = Math.round(parsed.amount * 100);
  const match = pending.find((item) => {
    const expectedCents = Math.round(item.amount.plus(item.fraction).toNumber() * 100);
    const senderMatches =
      !item.senderIdentifier ||
      !parsed.senderPhone ||
      item.senderIdentifier.replace(/\D/g, '').endsWith(parsed.senderPhone.slice(-10));
    return expectedCents === parsedCents && senderMatches;
  });

  await prisma.$transaction([
    prisma.sMSLog.update({
      where: { id: smsLog.id },
      data: { isMatched: Boolean(match), matchedId: match?.id },
    }),
    prisma.sMSIntegration.update({
      where: { id: integration.id },
      data: { lastWebhookAt: new Date(), lastError: null },
    }),
    ...(match
      ? [
          prisma.paymentRequest.update({
            where: { id: match.id },
            data: {
              transactionId: parsed.transactionId || 'sms:' + smsLog.id,
              notes: `تمت مطابقة رسالة دفع موثقة من ${sender} — بانتظار اعتماد المسؤول`,
            },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    ok: true,
    status: match ? 'matched_pending_review' : 'no_match',
  });
}
