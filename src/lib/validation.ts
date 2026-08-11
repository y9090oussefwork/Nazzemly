export function cleanText(value: unknown, field: string, min = 1, max = 500): string {
  if (typeof value !== 'string') throw new Error(field + ' مطلوب');
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) {
    throw new Error(`${field} يجب أن يكون بين ${min} و${max} حرفاً`);
  }
  return cleaned;
}

export function optionalText(value: unknown, max = 2000): string | null {
  if (value === undefined || value === null || value === '') return null;
  return cleanText(value, 'القيمة', 1, max);
}

export function normalizeUsername(value: unknown): string {
  const username = cleanText(value, 'اسم المستخدم', 3, 50).toLowerCase();
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    throw new Error('اسم المستخدم يقبل الحروف الإنجليزية والأرقام والرموز . _ - فقط');
  }
  return username;
}

export function normalizePhone(value: unknown): string {
  const input = cleanText(value, 'رقم الهاتف', 7, 25).replace(/[\s()-]/g, '');
  const normalized = input.startsWith('+20') ? '0' + input.slice(3) : input;
  if (!/^\+?[0-9]{7,15}$/.test(normalized)) throw new Error('رقم الهاتف غير صالح');
  return normalized;
}

export function optionalEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const email = cleanText(value, 'البريد الإلكتروني', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('البريد الإلكتروني غير صالح');
  }
  return email;
}

export function dateValue(value: unknown, field: string): Date {
  const date = new Date(cleanText(value, field, 4, 40));
  if (Number.isNaN(date.getTime())) throw new Error(field + ' غير صالح');
  return date;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(field + ' غير صالح');
  }
  return value as T;
}
