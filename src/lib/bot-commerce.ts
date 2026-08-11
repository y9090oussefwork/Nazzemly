import 'server-only';

import { Bot, Context, InlineKeyboard } from 'grammy';
import { prisma } from './prisma';
import { createPaymentRequest } from './wallet';
import { money } from './money';

type CustomerView = {
  id: string;
  name: string;
  phone: string;
  walletBalance: unknown;
};

type ChannelSettings = {
  channelChatId: string | null;
  channelUrl: string | null;
  requireChannelJoin: boolean;
};

const customAmountState = new Map<string, number>();

function stateKey(tenantId: string, telegramId: number | string) {
  return `${tenantId}:${telegramId}`;
}

function menuAmounts(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [50, 100, 200, 500];
  const values = (value as Record<string, unknown>).rechargeAmounts;
  if (!Array.isArray(values)) return [50, 100, 200, 500];
  const amounts = values.map(Number).filter((amount) => Number.isFinite(amount) && amount > 0).slice(0, 8);
  return amounts.length ? amounts : [50, 100, 200, 500];
}

function channelLink(settings: ChannelSettings) {
  if (settings.channelUrl) return settings.channelUrl;
  if (settings.channelChatId?.startsWith('@')) return `https://t.me/${settings.channelChatId.slice(1)}`;
  return null;
}

async function editOrReply(ctx: Context, text: string, keyboard?: InlineKeyboard) {
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, keyboard ? { reply_markup: keyboard } : undefined).catch(async () => {
      await ctx.reply(text, keyboard ? { reply_markup: keyboard } : undefined);
    });
    await ctx.answerCallbackQuery().catch(() => undefined);
  } else {
    await ctx.reply(text, keyboard ? { reply_markup: keyboard } : undefined);
  }
}

async function customerFor(ctx: Context, tenantId: string): Promise<CustomerView | null> {
  if (!ctx.from) return null;
  return prisma.customer.findFirst({
    where: { tenantId, tgId: String(ctx.from.id), deletedAt: null },
    select: { id: true, name: true, phone: true, walletBalance: true },
  });
}

async function isChannelMember(bot: Bot, settings: ChannelSettings, telegramId: number) {
  if (!settings.requireChannelJoin || !settings.channelChatId) return true;
  try {
    const member = await bot.api.getChatMember(settings.channelChatId, telegramId);
    return !['left', 'kicked'].includes(member.status);
  } catch (error) {
    console.error('Telegram channel membership check failed', error);
    return false;
  }
}

async function showJoinGate(ctx: Context, settings: ChannelSettings) {
  const keyboard = new InlineKeyboard();
  const url = channelLink(settings);
  if (url) keyboard.url('الانضمام إلى قناة المتجر', url).row();
  keyboard.text('تحققت من الاشتراك', 'channel_check');
  await editOrReply(
    ctx,
    'أهلًا بك. للاستفادة من خدمات المتجر والعروض، انضم أولًا إلى قناة المتجر ثم اضغط تحققت من الاشتراك.',
    keyboard,
  );
}

async function showMainMenu(ctx: Context, customer: CustomerView, tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { storeName: true, currency: true } });
  const keyboard = new InlineKeyboard()
    .text('🛍️ الخدمات والاشتراكات', 'browse_services')
    .row()
    .text('💰 محفظتي وشحن الرصيد', 'my_wallet')
    .text('📋 اشتراكاتي', 'my_subs')
    .row()
    .text('💬 التواصل مع الدعم', 'merchant_support')
    .row()
    .text('الإبلاغ عن مشكلة في اشتراك', 'report_issue')
    .row()
    .text('🔄 تحديث القائمة', 'menu');
  await editOrReply(
    ctx,
    `${tenant?.storeName || 'المتجر'}\n\nمرحبًا ${customer.name}\nرصيدك الحالي: ${money(customer.walletBalance as never).toFixed(2)} ${tenant?.currency || 'EGP'}\n\nاختر ما تريد:`,
    keyboard,
  );
}

async function showWallet(ctx: Context, customer: CustomerView, tenantId: string) {
  const [settings, tenant, transactions] = await Promise.all([
    prisma.botSettings.findUnique({ where: { tenantId }, select: { menuConfig: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
    prisma.walletTransaction.findMany({
      where: { tenantId, customerId: customer.id },
      select: { amount: true, description: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 4,
    }),
  ]);
  const keyboard = new InlineKeyboard();
  menuAmounts(settings?.menuConfig).forEach((amount, index) => {
    keyboard.text(`${amount} ${tenant?.currency || 'EGP'}`, `wallet_amount_${amount}`);
    if (index % 2 === 1) keyboard.row();
  });
  keyboard.row().text('✍️ قيمة أخرى', 'wallet_custom').row().text('العودة للقائمة', 'menu');
  const history = transactions.length
    ? `\n\nآخر العمليات:\n${transactions.map((item) => `${money(item.amount).toFixed(2)} | ${item.description || 'حركة محفظة'}`).join('\n')}`
    : '';
  await editOrReply(
    ctx,
    `رصيد محفظتك: ${money(customer.walletBalance as never).toFixed(2)} ${tenant?.currency || 'EGP'}${history}\n\nاختر قيمة الشحن أو اكتب قيمة خاصة:`,
    keyboard,
  );
}

async function showPaymentMethods(ctx: Context, tenantId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error('قيمة الشحن غير صحيحة');
  const methods = await prisma.tenantPaymentMethod.findMany({
    where: { tenantId, isActive: true, showInBot: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 12,
  });
  if (!methods.length) throw new Error('لا توجد وسيلة دفع متاحة الآن. تواصل مع دعم المتجر.');
  const keyboard = new InlineKeyboard();
  methods.forEach((method) => keyboard.text(method.label, `paym:${method.id}:${amount}`).row());
  keyboard.text('العودة للمحفظة', 'my_wallet');
  await editOrReply(ctx, `قيمة الشحن: ${amount.toFixed(2)}\n\nاختر طريقة الدفع المناسبة:`, keyboard);
}

async function createRecharge(ctx: Context, customer: CustomerView, tenantId: string, methodId: string, amount: number) {
  const [method, tenant] = await Promise.all([
    prisma.tenantPaymentMethod.findFirst({ where: { id: methodId, tenantId, isActive: true, showInBot: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
  ]);
  if (!method) throw new Error('طريقة الدفع غير متاحة');
  const request = await createPaymentRequest({
    tenantId,
    customerId: customer.id,
    amount,
    method: method.type,
    paymentMethodId: method.id,
  });
  await prisma.paymentRequest.update({ where: { id: request.id }, data: { notes: 'awaiting_transfer' } });
  const exactAmount = request.amount.plus(request.fraction);
  const keyboard = new InlineKeyboard();
  if (method.directPaymentUrl) keyboard.url('فتح رابط الدفع', method.directPaymentUrl).row();
  keyboard.text('✅ تم التحويل', `wallet_sent_${request.id}`).row().text('إلغاء الطلب', `cancel_request_${request.id}`);
  await editOrReply(
    ctx,
    `طلب شحن جديد\n\nالطريقة: ${method.label}\nحوّل المبلغ الدقيق: ${exactAmount.toFixed(2)} ${tenant?.currency || 'EGP'}\nبيانات التحويل: ${method.accountIdentifier}${method.instructions ? `\nالتعليمات: ${method.instructions}` : ''}\n\nالمبلغ الدقيق يساعد التاجر على مطابقة التحويل بسرعة. بعد التحويل اضغط تم التحويل وسأكمل معك خطوة بخطوة.`,
    keyboard,
  );
}

async function showLinkedService(ctx: Context, tenantId: string, serviceId: string) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, tenantId, isActive: true, showInBot: true },
    include: {
      category: { select: { id: true, name: true } },
      plans: {
        where: { isActive: true, showInBot: true },
        orderBy: [{ sortOrder: 'asc' }, { durationDays: 'asc' }],
      },
    },
  });
  if (!service) {
    await editOrReply(ctx, 'هذه الخدمة غير متاحة حاليًا.', new InlineKeyboard().text('عرض الخدمات المتاحة', 'browse_services').row().text('القائمة الرئيسية', 'menu'));
    return;
  }
  const keyboard = new InlineKeyboard();
  for (const plan of service.plans) {
    const available = !plan.trackInventory || plan.stockQuantity > 0;
    keyboard.text(`${available ? '✅' : '⏳'} ${plan.name} | ${money(plan.price).toFixed(2)}`, `plan_${plan.id}`).row();
  }
  keyboard.text(service.category ? `عرض قسم ${service.category.name}` : 'كل الخدمات', service.category ? `cat_${service.category.id}` : 'browse_services').row();
  keyboard.text('القائمة الرئيسية', 'menu');
  const features = service.features.length ? `\n\nالمميزات:\n${service.features.map((item) => `• ${item}`).join('\n')}` : '';
  await editOrReply(ctx, `${service.icon || '🛍️'} ${service.name}\n\n${service.description || 'اختر مدة الاشتراك المناسبة.'}${features}\n\nاختر الباقة والمدة:`, keyboard);
}

async function showSupport(ctx: Context, tenantId: string) {
  const [contacts, settings] = await Promise.all([
    prisma.tenantContact.findMany({
      where: { tenantId, showInBot: true, type: { in: ['whatsapp', 'telegram'] } },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      take: 8,
    }),
    prisma.botSettings.findUnique({ where: { tenantId }, select: { supportMessage: true } }),
  ]);
  const keyboard = new InlineKeyboard();
  contacts.forEach((contact) => {
    if (contact.url) keyboard.url(`${contact.type === 'whatsapp' ? 'واتساب' : 'تيليجرام'} | ${contact.label}`, contact.url).row();
  });
  keyboard.text('العودة للقائمة', 'menu');
  await editOrReply(ctx, settings?.supportMessage || 'اختر طريقة التواصل المناسبة وسيرد عليك فريق المتجر.', keyboard);
}

async function pendingPayment(customerId: string, tenantId: string) {
  return prisma.paymentRequest.findFirst({
    where: {
      tenantId,
      customerId,
      status: 'pending',
      notes: { in: ['awaiting_sender', 'awaiting_amount', 'awaiting_proof'] },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function handlePaymentText(ctx: Context, customer: CustomerView, tenantId: string, text: string) {
  const request = await pendingPayment(customer.id, tenantId);
  if (!request) return false;
  if (request.notes === 'awaiting_sender') {
    const sender = text.replace(/[^0-9+]/g, '');
    if (sender.length < 8) {
      await ctx.reply('اكتب رقم الهاتف أو الحساب الذي حوّلت منه بشكل صحيح.');
      return true;
    }
    await prisma.paymentRequest.update({ where: { id: request.id }, data: { senderIdentifier: sender, notes: 'awaiting_amount' } });
    await ctx.reply(`تم حفظ رقم التحويل. اكتب الآن المبلغ الذي حوّلته، والمطلوب هو ${request.amount.plus(request.fraction).toFixed(2)}.`);
    return true;
  }
  if (request.notes === 'awaiting_amount') {
    const reportedAmount = Number(text.replace(',', '.').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(reportedAmount) || reportedAmount <= 0) {
      await ctx.reply('اكتب قيمة التحويل بالأرقام، مثال: 100.37');
      return true;
    }
    await prisma.paymentRequest.update({ where: { id: request.id }, data: { reportedAmount, notes: 'awaiting_proof' } });
    await ctx.reply(
      'الخطوة الأخيرة: أرسل صورة إيصال التحويل الآن. إذا لم تكن لديك صورة يمكنك المتابعة بدونها.',
      { reply_markup: new InlineKeyboard().text('متابعة بدون صورة', `skip_proof_${request.id}`) },
    );
    return true;
  }
  if (request.notes === 'awaiting_proof') {
    await ctx.reply('أرسل صورة الإيصال، أو اضغط متابعة بدون صورة من الرسالة السابقة.');
    return true;
  }
  return false;
}

async function savePaymentProof(ctx: Context, customer: CustomerView, tenantId: string, telegramFileId: string) {
  const request = await pendingPayment(customer.id, tenantId);
  if (!request || request.notes !== 'awaiting_proof') return false;
  await prisma.paymentRequest.update({
    where: { id: request.id },
    data: { screenshotUrl: `telegram-file:${telegramFileId}`, notes: 'payment_proof_received' },
  });
  await ctx.reply('تم استلام كل البيانات وإرسال طلب الشحن للتاجر. سيصلك إشعار فور الاعتماد.', {
    reply_markup: new InlineKeyboard().text('العودة للمحفظة', 'my_wallet'),
  });
  return true;
}

export function registerCommerceBotFeatures(bot: Bot, tenantId: string) {
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const callback = ctx.callbackQuery?.data || '';
    const text = ctx.message?.text?.trim() || '';
    const settings = await prisma.botSettings.findUnique({
      where: { tenantId },
      select: { channelChatId: true, channelUrl: true, requireChannelJoin: true },
    });
    const channelSettings: ChannelSettings = settings || { channelChatId: null, channelUrl: null, requireChannelJoin: false };

    if (callback === 'channel_check') {
      if (await isChannelMember(bot, channelSettings, ctx.from.id)) {
        await editOrReply(ctx, 'تم التحقق من اشتراكك بنجاح. اضغط متابعة.', new InlineKeyboard().text('متابعة', 'menu'));
      } else {
        await ctx.answerCallbackQuery({ text: 'لم يظهر اشتراكك بعد. انضم إلى القناة ثم حاول مرة أخرى.', show_alert: true });
      }
      return;
    }
    if (!(await isChannelMember(bot, channelSettings, ctx.from.id))) {
      await showJoinGate(ctx, channelSettings);
      return;
    }

    const customer = await customerFor(ctx, tenantId);
    if (!customer) return next();

    if (text.startsWith('/start')) {
      const serviceId = text.split(/\s+/)[1]?.replace(/^service_/, '');
      if (serviceId) {
        await showLinkedService(ctx, tenantId, serviceId);
      } else {
        await showMainMenu(ctx, customer, tenantId);
      }
      return;
    }
    if (callback === 'menu') {
      await showMainMenu(ctx, customer, tenantId);
      return;
    }
    if (callback === 'my_wallet') {
      await showWallet(ctx, customer, tenantId);
      return;
    }
    if (callback === 'merchant_support') {
      await showSupport(ctx, tenantId);
      return;
    }
    if (callback === 'wallet_custom') {
      customAmountState.set(stateKey(tenantId, ctx.from.id), Date.now());
      await editOrReply(ctx, 'اكتب قيمة الشحن التي تريدها بالأرقام، مثال: 275');
      return;
    }
    if (callback.startsWith('wallet_amount_')) {
      await showPaymentMethods(ctx, tenantId, Number(callback.slice('wallet_amount_'.length)));
      return;
    }
    if (callback.startsWith('paym:')) {
      const [, methodId, amountText] = callback.split(':');
      await createRecharge(ctx, customer, tenantId, methodId, Number(amountText));
      return;
    }
    if (callback.startsWith('wallet_sent_')) {
      const requestId = callback.slice('wallet_sent_'.length);
      const changed = await prisma.paymentRequest.updateMany({
        where: { id: requestId, tenantId, customerId: customer.id, status: 'pending' },
        data: { notes: 'awaiting_sender' },
      });
      if (changed.count !== 1) throw new Error('طلب الشحن غير موجود أو انتهت صلاحيته');
      await editOrReply(ctx, 'سنكمل في 3 خطوات بسيطة. اكتب الآن رقم الهاتف أو الحساب الذي حوّلت منه.');
      return;
    }
    if (callback.startsWith('skip_proof_')) {
      const requestId = callback.slice('skip_proof_'.length);
      const changed = await prisma.paymentRequest.updateMany({
        where: { id: requestId, tenantId, customerId: customer.id, status: 'pending', notes: 'awaiting_proof' },
        data: { notes: 'customer_confirmed_transfer' },
      });
      if (changed.count !== 1) throw new Error('طلب الشحن غير موجود');
      await editOrReply(ctx, 'تم إرسال بيانات التحويل للتاجر للمراجعة. سيصلك إشعار فور اعتماد الشحن.', new InlineKeyboard().text('العودة للمحفظة', 'my_wallet'));
      return;
    }

    if (ctx.message?.photo?.length) {
      const fileId = ctx.message.photo.at(-1)?.file_id;
      if (fileId && await savePaymentProof(ctx, customer, tenantId, fileId)) return;
    }
    if (ctx.message?.document) {
      if (await savePaymentProof(ctx, customer, tenantId, ctx.message.document.file_id)) return;
    }
    if (text) {
      const customKey = stateKey(tenantId, ctx.from.id);
      if (customAmountState.has(customKey)) {
        const amount = Number(text.replace(',', '.').replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
          await ctx.reply('اكتب قيمة صحيحة بين 1 و100000.');
          return;
        }
        customAmountState.delete(customKey);
        await showPaymentMethods(ctx, tenantId, amount);
        return;
      }
      if (await handlePaymentText(ctx, customer, tenantId, text)) return;
    }
    return next();
  });
}
