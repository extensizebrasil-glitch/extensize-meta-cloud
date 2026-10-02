import crypto from 'node:crypto';

const b64url = value => Buffer.from(value).toString('base64url');

export function createOAuthState() {
  const secret = process.env.META_STATE_SECRET;
  if (!secret) throw new Error('META_STATE_SECRET não configurado');
  const payload = b64url(JSON.stringify({ issuedAt: Date.now(), nonce: crypto.randomBytes(18).toString('hex') }));
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state) {
  const secret = process.env.META_STATE_SECRET;
  const [payload, signature] = String(state || '').split('.');
  if (!secret || !payload || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Date.now() - Number(data.issuedAt) < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export function encryptJson(value) {
  const keyText = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyText) throw new Error('TOKEN_ENCRYPTION_KEY não configurado');
  const key = crypto.createHash('sha256').update(keyText).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
}

export function decryptJson(value) {
  const keyText = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyText) throw new Error('TOKEN_ENCRYPTION_KEY não configurado');
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  const key = crypto.createHash('sha256').update(keyText).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}
