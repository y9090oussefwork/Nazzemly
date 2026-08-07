import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { prisma } from './prisma';
import { debitWallet, createPaymentRequest } from './wallet';

// Cache for bot instances to avoid re-creating them on every request
const botCache = new Map<string, Bot>();

/**
 * Returns or creates a grammY Bot instance for the given bot token and registers all middleware.
 */
export function getBotInstance(botToken: string, tenantId: string): Bot {
  if (botCache.has(botToken)) {
    return botCache.get(botToken)!;
  }

  const bot = new Bot(botToken);

  // Define Bot handlers
  bot.command('start', async (ctx) => {
    const tgId = String(ctx.from?.id);
    const tgUsername = ctx.from?.username || '';
    const firstName = ctx.from?.first_name || 'عميلنا العزيز';

    try {
      // Find customer by Telegram User ID
      let customer = await prisma.customer.findFirst({
        where: {
          tenantId,
          tgId,
        },
      });

      if (!customer) {
        // Customer not registered. Ask for phone number sharing.
        const keyboard = new Keyboard()
          .requestContact('👤 مشاركة رقم الهاتف لتسجيل الدخول')
          .oneTime()
          .resized();

        await ctx.reply(
          `👋 أهلاً بك يا ${firstName} في متجرنا الرقمي!\n\n` +
          `لتصفح الخدمات وشحن رصيدك، يرجى مشاركة رقم الهاتف الخاص بك لتفعيل حسابك تلقائياً.`,
          { reply_markup: keyboard }
        );
      } else {
        // Update username if changed
        if (customer.tgUsername !== tgUsername) {
          await prisma.customer.update({
            where: { id: customer.id },
            data: { tgUsername },
          });
        }
        await showMainMenu(ctx, customer);
      }
    } catch (e: any) {
      console.error('Error in start command:', e);
      await ctx.reply('⚠️ حدث خطأ أثناء تشغيل البوت. يرجى المحاولة مرة أخرى لاحقاً.');
    }
  });

  // Handle Shared Contact (Phone number registration)
  bot.on('message:contact', async (ctx) => {
    const contact = ctx.message.contact;
    if (!contact) return;

    const tgId = String(ctx.from?.id);
    const tgUsername = ctx.from?.username || '';
    let phone = contact.phone_number;

    // Normalize phone number (remove country code plus signs if any, standardise Egyptian format)
    phone = phone.replace(/^\+/, '');
    if (phone.startsWith('20')) {
      phone = phone.substring(2); // Remove Egyptian country code '20' to match local format e.g. 010...
    }
    if (!phone.startsWith('0')) {
      phone = '0' + phone; // Add leading zero if missing
    }

    try {
      // Check if customer with this phone number already exists
      let customer = await prisma.customer.findUnique({
        where: {
          tenantId_phone: {
            tenantId,
            phone,
          },
        },
      });

      if (customer) {
        // Link Telegram ID to existing Customer
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: {
            tgId,
            tgUsername,
            name: contact.first_name + (contact.last_name ? ' ' + contact.last_name : ''),
          },
        });
      } else {
        // Create new Customer
        customer = await prisma.customer.create({
          data: {
            tenantId,
            name: contact.first_name + (contact.last_name ? ' ' + contact.last_name : ''),
            phone,
            tgId,
            tgUsername,
            createdBy: 'telegram_bot',
          },
        });
      }

      await ctx.reply(`✅ تم تفعيل حسابك بنجاح يا ${customer.name}!`, {
        reply_markup: { remove_keyboard: true }, // Remove the requestContact keyboard
      });

      await showMainMenu(ctx, customer);
    } catch (e: any) {
      console.error('Error saving contact:', e);
      await ctx.reply('⚠️ حدث خطأ أثناء ربط حسابك. يرجى كتابة /start والمحاولة مجدداً.');
    }
  });

  // Handle Callback Queries (Inline Button Clicks)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const tgId = String(ctx.from?.id);

    try {
      const customer = await prisma.customer.findFirst({
        where: { tenantId, tgId },
      });

      if (!customer) {
        await ctx.answerCallbackQuery({ text: 'يرجى كتابة /start أولاً لتفعيل حسابك.', show_alert: true });
        return;
      }

      if (data === 'menu') {
        await showMainMenu(ctx, customer, true);
      } else if (data === 'browse_services') {
        await showServices(ctx);
      } else if (data === 'my_wallet') {
        await showWallet(ctx, customer);
      } else if (data === 'my_subs') {
        await showSubscriptions(ctx, customer);
      } else if (data.startsWith('srv_')) {
        const serviceId = data;
        await showServiceDetails(ctx, serviceId);
      } else if (data.startsWith('buy_')) {
        const serviceId = data.replace('buy_', '');
        await processPurchase(ctx, customer, serviceId);
      } else if (data.startsWith('recharge_')) {
        const amount = parseFloat(data.replace('recharge_', ''));
        await generateRechargeInstructions(ctx, customer, amount);
      } else if (data.startsWith('transferred_')) {
        const requestId = data.replace('transferred_', '');
        await handleTransferNotification(ctx, requestId);
      } else if (data.startsWith('cancel_request_')) {
        const requestId = data.replace('cancel_request_', '');
        await handleCancelRequest(ctx, requestId);
      } else {
        await ctx.answerCallbackQuery({ text: 'خيار غير معروف' });
      }
    } catch (e: any) {
      console.error('Callback error:', e);
      await ctx.answerCallbackQuery({ text: 'حدث خطأ في النظام' });
    }
  });

  botCache.set(botToken, bot);
  return bot;
}

// Helpers to show UI views in Telegram

async function showMainMenu(ctx: any, customer: any, isEdit = false) {
  const keyboard = new InlineKeyboard()
    .text('🛍️ تصفح الخدمات والاشتراكات', 'browse_services').row()
    .text('💳 محفظتي ورصيدي', 'my_wallet')
    .text('📦 اشتراكاتي النشطة', 'my_subs').row()
    .text('🔄 تحديث القائمة', 'menu');

  const text = 
    `📱 **لوحة التحكم الخاصة بك**\n\n` +
    `👤 الاسم: *${customer.name}*\n` +
    `📞 الهاتف: \`${customer.phone}\`\n` +
    `💰 الرصيد المتاح: *${customer.walletBalance.toFixed(2)} EGP*\n\n` +
    `يرجى اختيار أحد الخيارات أدناه لتصفح المنتجات أو إدارة حسابك:`;

  if (isEdit && ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

async function showServices(ctx: any) {
  // Fetch active tenant details from context
  const services = await prisma.service.findMany({
    orderBy: { name: 'asc' },
  });

  if (services.length === 0) {
    const keyboard = new InlineKeyboard().text('🔙 العودة للقائمة الرئيسية', 'menu');
    await ctx.editMessageText('🛍️ لا توجد خدمات متوفرة في المتجر حالياً. يرجى مراجعتنا لاحقاً!', {
      reply_markup: keyboard,
    });
    await ctx.answerCallbackQuery();
    return;
  }

  const keyboard = new InlineKeyboard();
  services.forEach((s) => {
    keyboard.text(`${s.name} - ${s.defaultSellingPrice} EGP`, s.id).row();
  });
  keyboard.text('🔙 العودة للقائمة الرئيسية', 'menu');

  await ctx.editMessageText(
    `🛍️ **الخدمات المتاحة للشراء**\n\nاختر الخدمة التي تود الاستفسار عنها أو الاشتراك بها:`,
    { reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
}

async function showServiceDetails(ctx: any, serviceId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service) {
    await ctx.answerCallbackQuery({ text: 'الخدمة غير متوفرة', show_alert: true });
    return;
  }

  const keyboard = new InlineKeyboard()
    .text(`🛒 شراء الآن بقيمة ${service.defaultSellingPrice} EGP`, `buy_${service.id}`).row()
    .text('🔙 العودة لقائمة الخدمات', 'browse_services');

  await ctx.editMessageText(
    `🧩 **تفاصيل الخدمة: ${service.name}**\n\n` +
    `⏱️ مدة الاشتراك: *${service.defaultDuration} يوم*\n` +
    `💰 التكلفة: *${service.defaultSellingPrice.toFixed(2)} EGP*\n\n` +
    `⚡ سيتم تفعيل الاشتراك وسحب المبلغ تلقائياً من محفظتك فور الشراء.\n` +
    `إذا كان هناك حساب متوفر في المخزون، سيتم تسليمه لك فوراً هنا!`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
}

async function processPurchase(ctx: any, customer: any, serviceId: string) {
  try {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      await ctx.answerCallbackQuery({ text: 'الخدمة غير موجودة حالياً', show_alert: true });
      return;
    }

    if (customer.walletBalance < service.defaultSellingPrice) {
      const keyboard = new InlineKeyboard()
        .text('💳 شحن محفظتي الآن', `recharge_${service.defaultSellingPrice}`).row()
        .text('🔙 العودة لقائمة الخدمات', 'browse_services');

      await ctx.editMessageText(
        `❌ **رصيدك غير كافٍ لإتمام عملية الشراء!**\n\n` +
        `سعر الخدمة: *${service.defaultSellingPrice.toFixed(2)} EGP*\n` +
        `رصيدك الحالي: *${customer.walletBalance.toFixed(2)} EGP*\n\n` +
        `يرجى شحن المحفظة أولاً لإكمال العملية.`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // Process Purchase in a Transaction
    const subscription = await prisma.$transaction(async (t) => {
      // 1. Debit Wallet
      await debitWallet(customer.id, service.defaultSellingPrice, `شراء خدمة: ${service.name}`, t);

      // 2. Calculate dates
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + service.defaultDuration);

      // 3. Check for available account in AccountPool
      const availableAccount = await t.accountPool.findFirst({
        where: {
          serviceId,
          isUsed: false,
        },
      });

      // 4. Create Subscription
      const sub = await t.subscription.create({
        data: {
          tenantId: customer.tenantId,
          customerId: customer.id,
          serviceId,
          startDate,
          endDate,
          sellingPrice: service.defaultSellingPrice,
          costPrice: service.defaultCostPrice,
          status: 'active',
          notes: availableAccount ? 'تسليم تلقائي' : 'انتظار التسليم اليدوي من التاجر',
          createdBy: 'telegram_bot',
        },
      });

      // 5. If account is available, mark it as used and link it
      if (availableAccount) {
        await t.accountPool.update({
          where: { id: availableAccount.id },
          data: {
            isUsed: true,
            usedAt: new Date(),
            subscriptionId: sub.id,
          },
        });
      }

      return { sub, availableAccount };
    });

    const keyboard = new InlineKeyboard().text('🔙 العودة للقائمة الرئيسية', 'menu');

    let successMsg = 
      `🎉 **تمت عملية الشراء بنجاح!**\n\n` +
      `📦 الخدمة: *${service.name}*\n` +
      `⏱️ الصلاحية: إلى *${subscription.sub.endDate.toLocaleDateString('en-GB')}*\n` +
      `💰 تم خصم: *${service.defaultSellingPrice.toFixed(2)} EGP*\n\n`;

    if (subscription.availableAccount) {
      successMsg += 
        `🚀 **بيانات الاشتراك الخاص بك جاهزة:**\n` +
        `🔑 الحساب/الكود:\n` +
        `\`${subscription.availableAccount.credentials}\`\n\n` +
        `احتفظ بهذه البيانات سريّة!`;
    } else {
      successMsg += 
        `⏳ **طلبك قيد التحضير:**\n` +
        `لا يوجد حسابات جاهزة للتسليم التلقائي في المخزن حالياً. تم إخطار التاجر لتسليم حسابك يدوياً في أقرب وقت وسيصلك إشعار بالبيانات فوراً.`;
    }

    await ctx.editMessageText(successMsg, { parse_mode: 'Markdown', reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } catch (e: any) {
    console.error('Purchase processing failed:', e);
    await ctx.reply('⚠️ حدث خطأ غير متوقع أثناء إتمام عملية الشراء. يرجى التواصل مع الدعم.');
  }
}

async function showWallet(ctx: any, customer: any) {
  const keyboard = new InlineKeyboard()
    .text('شحن +50 EGP', 'recharge_50')
    .text('شحن +100 EGP', 'recharge_100').row()
    .text('شحن +200 EGP', 'recharge_200')
    .text('شحن +500 EGP', 'recharge_500').row()
    .text('🔙 العودة للقائمة الرئيسية', 'menu');

  await ctx.editMessageText(
    `💳 **المحفظة والرصيد**\n\n` +
    `رصيدك الحالي: *${customer.walletBalance.toFixed(2)} EGP*\n\n` +
    `لشحن رصيد إضافي في محفظتك، يرجى اختيار أحد المبالغ السريعة أدناه لنعطيك تفاصيل التحويل المؤتمتة:`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
}

async function generateRechargeInstructions(ctx: any, customer: any, amount: number) {
  // Fetch tenant parameters/payment instructions
  const tenant = await prisma.tenant.findUnique({
    where: { id: customer.tenantId },
  });

  const request = await createPaymentRequest(customer.id, amount, 'vodafone_cash');
  const exactAmount = request.amount + request.fraction;

  const keyboard = new InlineKeyboard()
    .text('✅ قمت بتحويل المبلغ الدقيق', `transferred_${request.id}`).row()
    .text('❌ إلغاء الطلب والتراجع', `cancel_request_${request.id}`);

  await ctx.editMessageText(
    `⚠️ **تعليمات الدفع والشحن الهامة** ⚠️\n\n` +
    `لتفعيل رصيدك بشكل تلقائي، يجب عليك إرسال **المبلغ بالكسر الدقيق** المذكور أدناه:\n\n` +
    `💵 المبلغ المطلوب إرساله: **${exactAmount.toFixed(2)} EGP**\n` +
    `📞 رقم فودافون كاش للتسجيل: \`01026040854\` (مثال لمتجر التاجر)\n` +
    `🏦 حساب إنستا باي (بديل): \`store@instapay\`\n\n` +
    `⏰ صلاحية الطلب والمطابقة التلقائية: **15 دقيقة فقط**.\n\n` +
    `بعد قيامك بالتحويل، اضغط على زر "قمت بالتحويل" أدناه ليقوم النظام بالتحقق التلقائي وشحن رصيدك فوراً.`,
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
}

async function handleTransferNotification(ctx: any, requestId: string) {
  // Inform client we are checking or ask for manual entry fallback
  const keyboard = new InlineKeyboard()
    .text('🔙 العودة للقائمة الرئيسية', 'menu');

  await ctx.editMessageText(
    `⏳ **جاري فحص وتأكيد المعاملة تلقائياً...**\n\n` +
    `يقوم خادمنا بمطابقة رسائل التحويل المستلمة على هاتف التاجر. سنقوم بإضافة الرصيد فور العثور على رسالة الدفع المطابقة. ستتلقى إشعاراً في التيلجرام بمجرد الشحن.\n\n` +
    `إذا لم يتم الشحن خلال دقيقتين، يرجى مشاركة لقطة الشاشة للتحويل (Screenshot) للتحقق اليدوي.`,
    { reply_markup: keyboard }
  );
  await ctx.answerCallbackQuery();
}

async function handleCancelRequest(ctx: any, requestId: string) {
  try {
    await prisma.paymentRequest.update({
      where: { id: requestId },
      data: { status: 'rejected', notes: 'تم إلغاؤه من قبل العميل' },
    });
    
    const keyboard = new InlineKeyboard().text('🔙 العودة للمحفظة', 'my_wallet');
    await ctx.editMessageText('❌ تم إلغاء طلب الشحن بنجاح.', { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  } catch (e) {
    await ctx.answerCallbackQuery({ text: 'فشل إلغاء الطلب' });
  }
}

async function showSubscriptions(ctx: any, customer: any) {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      customerId: customer.id,
      status: { in: ['active', 'expiring_soon'] },
    },
    include: { service: true },
    orderBy: { endDate: 'asc' },
  });

  if (subscriptions.length === 0) {
    const keyboard = new InlineKeyboard().text('🔙 العودة للقائمة الرئيسية', 'menu');
    await ctx.editMessageText('📦 ليس لديك أي اشتراكات نشطة حالياً.', { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
    return;
  }

  let text = `📦 **اشتراكاتك النشطة**\n\n`;
  const keyboard = new InlineKeyboard();

  subscriptions.forEach((s) => {
    text += 
      `🧩 الخدمة: *${s.service.name}*\n` +
      `📅 تاريخ الانتهاء: *${s.endDate.toLocaleDateString('en-GB')}*\n` +
      `🔒 الحالة: *${s.status === 'active' ? 'نشط' : 'أوشك على الانتهاء'}*\n` +
      `------------------------\n`;
    keyboard.text(`🔁 تجديد: ${s.service.name}`, `buy_${s.serviceId}`).row();
  });

  keyboard.text('🔙 العودة للقائمة الرئيسية', 'menu');

  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard });
  await ctx.answerCallbackQuery();
}
