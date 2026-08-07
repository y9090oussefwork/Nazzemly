import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseSMS } from '@/lib/smsParser';
import { approvePaymentRequest } from '@/lib/wallet';
import { getBotInstance } from '@/lib/bot';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    // Simple secret validation (you can configure a secret token per merchant, here we check if tenant exists)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { botSettings: true },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Optional: Validate merchant secret (e.g. check against botToken or a custom field)
    // For demo/simplicity, we check if secret matches a hashed value or is present
    if (!secret) {
      return NextResponse.json({ error: 'Unauthorized secret missing' }, { status: 401 });
    }

    const { sender, message } = await request.json();
    if (!sender || !message) {
      return NextResponse.json({ error: 'Missing sender or message' }, { status: 400 });
    }

    // 1. Log the incoming SMS
    const smsLog = await prisma.sMSLog.create({
      data: {
        tenantId,
        sender,
        message,
        receivedAt: new Date(),
      },
    });

    // 2. Parse SMS content
    const parsed = parseSMS(message);
    if (!parsed.isMatch) {
      return NextResponse.json({ ok: true, status: 'ignored_unmatched_sms_format' });
    }

    // 3. Match with pending PaymentRequest
    // Match logic:
    // amount_requested_with_fraction = request.amount + request.fraction
    // We look for pending requests created in the last 25 minutes
    const timeLimit = new Date(Date.now() - 25 * 60 * 1000);
    
    // Fetch pending requests for this tenant's customers
    const pendingRequests = await prisma.paymentRequest.findMany({
      where: {
        status: 'pending',
        createdAt: { gte: timeLimit },
        customer: {
          tenantId,
        },
      },
      include: {
        customer: true,
      },
    });

    // Find the request where (request.amount + request.fraction) equals parsed.amount (with minor float delta threshold)
    const matchingRequest = pendingRequests.find((r) => {
      const expectedTotal = r.amount + r.fraction;
      return Math.abs(expectedTotal - parsed.amount) < 0.01; // float comparison
    });

    if (matchingRequest) {
      // 4. Approve request and credit wallet
      const approvedRequest = await approvePaymentRequest(
        matchingRequest.id,
        parsed.transactionId || `auto_${smsLog.id}`,
        `شحن تلقائي عبر رسالة من: ${sender}`
      );

      // Update SMS Log
      await prisma.sMSLog.update({
        where: { id: smsLog.id },
        data: {
          isMatched: true,
          matchedId: matchingRequest.id,
        },
      });

      // 5. Notify customer via Telegram Bot if tgId is connected
      if (matchingRequest.customer.tgId && tenant.botSettings?.botToken && tenant.botSettings.isActive) {
        try {
          const bot = getBotInstance(tenant.botSettings.botToken, tenantId);
          const totalAmount = matchingRequest.amount + matchingRequest.fraction;
          const freshCustomer = await prisma.customer.findUnique({
            where: { id: matchingRequest.customerId },
            select: { walletBalance: true },
          });
          
          await bot.api.sendMessage(
            matchingRequest.customer.tgId,
            `🎉 **تم استلام تحويلك بنجاح!** 🎉\n\n` +
            `💰 المبلغ المستلم: *${totalAmount.toFixed(2)} EGP*\n` +
            `💳 طريقة الدفع: *فودافون كاش / إنستا باي*\n` +
            `💵 رصيد محفظتك الجديد: *${freshCustomer?.walletBalance.toFixed(2)} EGP*\n\n` +
            `يمكنك الآن تصفح الخدمات والشراء مباشرة من القائمة!`,
            { parse_mode: 'Markdown' }
          );
        } catch (botErr) {
          console.error('Failed to send Telegram notification to customer:', botErr);
        }
      }

      return NextResponse.json({ ok: true, status: 'matched_and_approved', requestId: matchingRequest.id });
    }

    return NextResponse.json({ ok: true, status: 'no_matching_pending_payment_request' });
  } catch (e: any) {
    console.error('SMS Webhook processing error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
