export interface ParsedSMS {
  amount: number;
  senderPhone?: string;
  transactionId?: string;
  isMatch: boolean;
}

/**
 * Parses raw SMS messages to extract transaction details.
 * Supports Vodafone Cash and generic Egyptian bank transfer alerts.
 */
export function parseSMS(messageText: string): ParsedSMS {
  const result: ParsedSMS = {
    amount: 0,
    isMatch: false,
  };

  // Normalize message text (remove double spaces, standardise Arabic digits if any)
  let text = messageText.replace(/\s+/g, ' ').trim();
  // Convert Eastern Arabic numerals (٠-٩) to Western Arabic (0-9)
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  for (let i = 0; i < 10; i++) {
    text = text.replace(new RegExp(arabicDigits[i], 'g'), String(i));
  }

  // 1. Vodafone Cash Pattern (Arabic)
  // E.g. "تم استلام مبلغ 100.12 جنيه من رقم 01012345678. رصيدك الحالي..."
  // E.g. "تم تحويل مبلغ 200.00 جنيه إلى رقمك من 01234567890. العملية رقم 987654321"
  if (text.includes('فودافون كاش') || text.includes('استلام مبلغ') || text.includes('تحويل مبلغ')) {
    // Extract amount
    const amountMatch = text.match(/(?:مبلغ\s+)?([\d\.]+)\s*(?:جنيه|جم)/);
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1]);
    }

    // Extract sender phone number
    const phoneMatch = text.match(/(?:من\s+رقم\s+|من\s+)(01\d{9})/);
    if (phoneMatch) {
      result.senderPhone = phoneMatch[1];
    }

    // Extract transaction number
    const txMatch = text.match(/(?:العملية|المعاملة)\s*رقم\s*(\d+)/) || text.match(/رقم\s*(?:العملية|المعاملة)\s*(\d+)/);
    if (txMatch) {
      result.transactionId = txMatch[1];
    }

    if (result.amount > 0) {
      result.isMatch = true;
      return result;
    }
  }

  // 2. Generic English Bank SMS / InstaPay Credit Notification
  // E.g. "NBE: A/C ... Credited with EGP 150.25 Ref: 12345678"
  // E.g. "CIB: EGP 150.25 was credited to account ... Ref: 12345678"
  // E.g. "CIB: your A/C ... received EGP 500.00 from InstaPay Ref: 87654321"
  const upperText = text.toUpperCase();
  if (upperText.includes('CREDITED') || upperText.includes('RECEIVED') || upperText.includes('إضافة') || upperText.includes('إيداع')) {
    // Extract amount in EGP/EGP/جم
    const egpMatch = text.match(/(?:EGP|EGP\s+|جم\s+|جم)\s*([\d\.,]+)/i) || text.match(/([\d\.,]+)\s*(?:EGP|جم)/i);
    if (egpMatch) {
      // Remove comma thousands separators e.g. 1,000.50 -> 1000.50
      result.amount = parseFloat(egpMatch[1].replace(/,/g, ''));
    }

    // Extract transaction ID / Reference
    const refMatch = text.match(/REF(?:\s*NO\s*|:\s*|\s*)(\d+)/i) || text.match(/REFERENCE\s*(\d+)/i) || text.match(/(?:مرجع|مرجعي)\s*(\d+)/);
    if (refMatch) {
      result.transactionId = refMatch[1];
    }

    if (result.amount > 0) {
      result.isMatch = true;
      return result;
    }
  }

  return result;
}
