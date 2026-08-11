import 'server-only';

import { Context, InlineKeyboard } from 'grammy';
import { prisma } from './prisma';

const statusLabels: Record<string, string> = {
  new: 'جديد',
  processing_delivery: 'جاري التسليم',
  awaiting_contact: 'بانتظار تواصل الدعم',
  awaiting_customer_data: 'بانتظار بياناتك',
  activation_in_progress: 'جاري التفعيل',
  invitation_sent: 'تم إرسال الدعوة',
  fulfilled: 'تم التفعيل',
  cancelled: 'ملغي',
};

export async function showOrdersInBot(
  ctx: Context,
  customer: { id: string },
  tenantId: string,
) {
  const orders = await prisma.order.findMany({
    where: { tenantId, customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      service: { select: { name: true } },
      servicePlan: { select: { name: true } },
    },
  });
  const message = orders.length
    ? [
        'طلباتك الأخيرة',
        '',
        ...orders.map((order) =>
          `${order.orderNo}\n${order.service.name}${order.servicePlan ? ` - ${order.servicePlan.name}` : ''}\nالحالة: ${statusLabels[order.fulfillmentStatus] || order.fulfillmentStatus}\nالقيمة: ${Number(order.amount).toFixed(2)}`,
        ),
      ].join('\n\n')
    : 'لا توجد لديك طلبات حتى الآن.';
  const keyboard = new InlineKeyboard()
    .text('الخدمات والاشتراكات', 'browse_services')
    .row()
    .text('العودة للقائمة', 'menu');
  try {
    await ctx.editMessageText(message, { reply_markup: keyboard });
  } catch {
    await ctx.reply(message, { reply_markup: keyboard });
  }
}

