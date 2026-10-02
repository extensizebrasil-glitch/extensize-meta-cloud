import { get } from '@vercel/blob';
import { json, requiredEnv } from '../../lib/http.js';
import { decryptJson } from '../../lib/security.js';

export default async function handler(req, res) {
  try {
    requiredEnv(['TOKEN_ENCRYPTION_KEY', 'TOKEN_STORE_ID']);
    const stored = await get('meta/instagram-token.enc', { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
    if (!stored || stored.statusCode !== 200 || !stored.stream) return json(res, 200, { connected: false, tokenStored: false });
    const encrypted = await new Response(stored.stream).text();
    const record = decryptJson(encrypted);
    const profileUrl = new URL('https://graph.instagram.com/me');
    profileUrl.search = new URLSearchParams({ fields: 'user_id,username,account_type', access_token: record.accessToken });
    const profileResponse = await fetch(profileUrl, { headers: { Accept: 'application/json' } });
    const profile = await profileResponse.json();
    const expiresAt = record.expiresIn ? new Date(new Date(record.connectedAt).getTime() + Number(record.expiresIn) * 1000).toISOString() : null;
    if (!profileResponse.ok) return json(res, 200, { connected: true, tokenStored: true, apiVerified: false, connectedAt: record.connectedAt, expiresAt });
    return json(res, 200, { connected: true, tokenStored: true, apiVerified: true, instagramUserId: String(profile.user_id || profile.id || record.instagramUserId || ''), username: profile.username || '', accountType: profile.account_type || '', connectedAt: record.connectedAt, expiresAt });
  } catch (error) {
    console.error('Instagram status failed:', error.message);
    return json(res, 500, { connected: false, tokenStored: false, error: 'Não foi possível verificar a conexão.' });
  }
}
