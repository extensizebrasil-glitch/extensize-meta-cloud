import { get } from '@vercel/blob';
import { decryptJson } from './security.js';

export async function getInstagramToken(slot = 'primary') {
  const pathname = slot === 'secondary' ? 'meta/instagram-token-secondary.enc' : 'meta/instagram-token.enc';
  const stored = await get(pathname, { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
  if (!stored || stored.statusCode !== 200 || !stored.stream) return null;
  return decryptJson(await new Response(stored.stream).text());
}
