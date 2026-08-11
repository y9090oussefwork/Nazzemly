import 'server-only';

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PASSWORD_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10) {
    throw new Error('يجب أن تتكون كلمة المرور من 10 أحرف على الأقل');
  }
  const salt = crypto.randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return [PASSWORD_PREFIX, salt.toString('base64url'), derived.toString('base64url')].join('$');
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const legacy = crypto.createHash('sha256').update(password).digest('hex');
    const valid = safeEqual(Buffer.from(legacy), Buffer.from(storedHash));
    return { valid, needsRehash: valid };
  }
  const [prefix, saltEncoded, hashEncoded] = storedHash.split('$');
  if (prefix !== PASSWORD_PREFIX || !saltEncoded || !hashEncoded) {
    return { valid: false, needsRehash: false };
  }
  try {
    const salt = Buffer.from(saltEncoded, 'base64url');
    const expected = Buffer.from(hashEncoded, 'base64url');
    const actual = (await scrypt(password, salt, expected.length)) as Buffer;
    return { valid: safeEqual(actual, expected), needsRehash: false };
  } catch {
    return { valid: false, needsRehash: false };
  }
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashWebhookSecret(value: string): string {
  return hashToken('telegram-webhook:' + value);
}

export function verifyWebhookSecret(value: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  return safeEqual(
    Buffer.from(hashWebhookSecret(value), 'hex'),
    Buffer.from(expectedHash, 'hex'),
  );
}

export function signWebhookBody(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  const normalized = signature.replace(/^sha256=/i, '').trim();
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
  return safeEqual(
    Buffer.from(signWebhookBody(secret, body), 'hex'),
    Buffer.from(normalized, 'hex'),
  );
}

function encryptionKey(): Buffer {
  const source = process.env.APP_ENCRYPTION_KEY;
  if (!source || source.length < 32) {
    throw new Error('تعذر تشغيل الحماية الآمنة حاليًا. يحتاج مالك المنصة إلى مراجعة إعداد الأمان الداخلي.');
  }
  return crypto.createHash('sha256').update(source).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const [ivEncoded, tagEncoded, encryptedEncoded] = payload.split('.');
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error('قيمة التشفير غير صالحة');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivEncoded, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
