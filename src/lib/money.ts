import 'server-only';

type DecimalLike = { toNumber(): number } | number | string | null | undefined;

export function money(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'object' && 'toNumber' in value) return value.toNumber();
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('قيمة مالية غير صالحة');
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

export function requirePositiveMoney(value: unknown, field = 'القيمة'): number {
  const parsed = money(value as DecimalLike);
  if (parsed <= 0 || parsed > 100_000_000) {
    throw new Error(field + ' يجب أن تكون قيمة موجبة ضمن الحد المسموح');
  }
  return parsed;
}

export function serializeMoney<T extends Record<string, unknown>>(
  record: T,
  fields: Array<keyof T>,
): T {
  const output = { ...record };
  for (const field of fields) {
    output[field] = money(record[field] as DecimalLike) as T[keyof T];
  }
  return output;
}
