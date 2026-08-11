export interface ParsedSMS {
  amount: number;
  senderPhone?: string;
  transactionId?: string;
  isMatch: boolean;
}

function normalizeDigits(input: string) {
  const eastern = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return input
    .replace(/[٠-٩]/g, (digit) => String(eastern.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSMS(messageText: string): ParsedSMS {
  const text = normalizeDigits(messageText);
  const upper = text.toUpperCase();
  const debitIndicators = ['WITHDRAWN', 'DEBITED', 'PURCHASE', 'تم خصم', 'تم سحب'];
  if (debitIndicators.some((indicator) => upper.includes(indicator.toUpperCase()))) {
    return { amount: 0, isMatch: false };
  }
  const creditIndicators = [
    'CREDITED', 'RECEIVED', 'VODAFONE CASH', 'INSTAPAY',
    'تم استلام', 'استلام مبلغ', 'تم إيداع', 'إضافة مبلغ', 'تحويل إلى رقمك',
  ];
  if (!creditIndicators.some((indicator) => upper.includes(indicator.toUpperCase()))) {
    return { amount: 0, isMatch: false };
  }

  const patterns = [
    /(?:EGP|جنيه|ج\.م|جم)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:EGP|جنيه|ج\.م|جم)/i,
    /(?:مبلغ|amount)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];
  let amount = 0;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      amount = Number(match[1].replace(/,/g, ''));
      break;
    }
  }
  if (!Number.isFinite(amount) || amount <= 0) return { amount: 0, isMatch: false };

  const phoneMatch = text.match(/(?:من\s+(?:رقم\s+)?|FROM\s+)(01[0125][0-9]{8})/i);
  const transactionMatch =
    text.match(/(?:REF(?:ERENCE)?|TXN|رقم\s+(?:العملية|المعاملة)|مرجع)\s*[:#-]?\s*([A-Z0-9-]{5,50})/i);

  return {
    amount: Math.round(amount * 100) / 100,
    senderPhone: phoneMatch?.[1],
    transactionId: transactionMatch?.[1],
    isMatch: true,
  };
}
