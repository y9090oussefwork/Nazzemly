import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'a-very-long-secret-key-that-is-at-least-32-chars';
// Derive a 32-byte key from secret
const KEY = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
const ALGORITHM = 'aes-256-gcm';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function encrypt(payload: any): Promise<string> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  
  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:encrypted:authTag
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

export async function decrypt(token: string): Promise<any> {
  try {
    const [ivHex, encryptedHex, authTagHex] = token.split(':');
    if (!ivHex || !encryptedHex || !authTagHex) return null;
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (e) {
    console.error('Session decryption failed:', e);
    return null;
  }
}

export async function getSession(): Promise<any | null> {
  if (process.env.TEST_MODE === 'true' && (global as any).testSession) {
    return (global as any).testSession;
  }
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;
  if (!sessionToken) return null;
  return decrypt(sessionToken);
}

export async function login(payload: { userId: string; username: string; role: string; tenantId: string; storeName: string; permissions: string[] }) {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const session = await encrypt({ ...payload, expires });
  
  const cookieStore = await cookies();
  cookieStore.set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
    path: '/',
  });
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.set('session', '', { expires: new Date(0), path: '/' });
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session || session.role !== 'super_admin') {
    throw new Error('Unauthorized: Super Admin access required');
  }
  return session;
}
