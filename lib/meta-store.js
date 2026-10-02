import { get } from '@vercel/blob';
import { decryptJson } from './security.js';

export async function getInstagramToken() {
  const stored = await get('meta/instagram-token.enc', { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
  if (!stored || stored.statusCode !== 200 || !stored.stream) return null;
  return decryptJson(await new Response(stored.stream).text());
}
