import { get, list } from '@vercel/blob';
import { json } from '../lib/http.js';
import { decryptJson } from '../lib/security.js';

const LOCAL_LIBRARY = { collected: 308, renderedFiles: 306, valid: 304, ignored: 2 };

async function instagramSummary() {
  try {
    const stored = await get('meta/instagram-token.enc', { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
    if (!stored || stored.statusCode !== 200 || !stored.stream) return { connected: false, apiVerified: false };
    const record = decryptJson(await new Response(stored.stream).text());
    const profileUrl = new URL('https://graph.instagram.com/me');
    profileUrl.search = new URLSearchParams({ fields: 'user_id,username,account_type', access_token: record.accessToken });
    const response = await fetch(profileUrl, { headers: { Accept: 'application/json' } });
    const profile = await response.json();
    const expiresAt = record.expiresIn ? new Date(new Date(record.connectedAt).getTime() + Number(record.expiresIn) * 1000).toISOString() : null;
    return { connected: true, apiVerified: response.ok, username: response.ok ? profile.username || '' : '', accountType: response.ok ? profile.account_type || '' : '', connectedAt: record.connectedAt, expiresAt };
  } catch { return { connected: false, apiVerified: false }; }
}

async function cloudLibrary() {
  try {
    const result = await list({ access: 'public', storeId: process.env.VIDEO_STORE_ID, prefix: 'reels/', limit: 1000 });
    return { uploaded: result.blobs.filter(blob => blob.pathname.toLowerCase().endsWith('.mp4')).length, bytes: result.blobs.reduce((total, blob) => total + Number(blob.size || 0), 0), hasMore: result.hasMore };
  } catch { return { uploaded: 0, bytes: 0, hasMore: false }; }
}

export default async function handler(req, res) {
  const [instagram, cloud] = await Promise.all([instagramSummary(), cloudLibrary()]);
  return json(res, 200, { ok: true, mode: 'configuration_only', publishingEnabled: false, schedulingEnabled: false, uploadsEnabled: false, uploadStrategy: 'temporary_on_demand', instagram, library: { ...LOCAL_LIBRARY, cloud }, updatedAt: new Date().toISOString() });
}
