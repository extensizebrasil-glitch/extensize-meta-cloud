import { del, get, head, put } from '@vercel/blob';
import { json, publicBaseUrl } from '../../lib/http.js';
import { getInstagramToken } from '../../lib/meta-store.js';
import { getCurrentPlan, saveCurrentPlan } from '../../lib/plan-store.js';

const STATE_PATH = 'tests/official-reel-state.json';
const CONFIRMATION = 'Autorizo publicar o Reel de teste.';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getState() {
  try {
    const stored = await get(STATE_PATH, { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
    if (!stored || stored.statusCode !== 200 || !stored.stream) return null;
    return JSON.parse(await new Response(stored.stream).text());
  } catch { return null; }
}

async function saveState(state) {
  await put(STATE_PATH, JSON.stringify(state), { access: 'private', storeId: process.env.TOKEN_STORE_ID, allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
}

async function markPlanPublished(receipt) {
  const plan = await getCurrentPlan();
  if (!plan?.items?.[0]) return;
  plan.items[0] = { ...plan.items[0], status: 'published', mediaId: receipt.mediaId, publishedAt: receipt.publishedAt };
  plan.updatedAt = new Date().toISOString();
  await saveCurrentPlan(plan);
}

async function graph(path, token, options = {}) {
  const response = await fetch(`https://graph.instagram.com/${path}`, options.method === 'POST' ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...options.body, access_token: token }) } : { headers: { Accept: 'application/json' } });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || `Falha na API do Instagram (${response.status}).`);
  return data;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const origin = String(req.headers.origin || '').replace(/\/$/, '');
    const expectedOrigin = publicBaseUrl();
    if (origin && expectedOrigin && origin !== expectedOrigin) return json(res, 403, { ok: false, error: 'Origem não autorizada.' });
    if (String(req.body?.confirmation || '') !== CONFIRMATION) return json(res, 403, { ok: false, error: 'Confirmação final inválida.' });

    const previous = await getState();
    if (previous?.stage === 'published') {
      await markPlanPublished(previous);
      return json(res, 200, { ok: true, alreadyPublished: true, mediaId: previous.mediaId, publishedAt: previous.publishedAt, cleanupComplete: previous.cleanupComplete });
    }

    const [plan, auth] = await Promise.all([getCurrentPlan(), getInstagramToken()]);
    const first = plan?.items?.[0];
    if (!plan || plan.status !== 'draft' || !first || !auth?.accessToken) throw new Error('Plano ou conexão do Instagram indisponível.');
    const profileUrl = new URL('https://graph.instagram.com/me');
    profileUrl.search = new URLSearchParams({ fields: 'id,user_id,username,account_type', access_token: auth.accessToken });
    const profileResponse = await fetch(profileUrl, { headers: { Accept: 'application/json' } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error(profile.error?.message || 'Não foi possível confirmar o ID atual do Instagram.');
    const instagramUserId = profile.id;
    const captionSlot = Number(first.captionSlot || 1);
    const caption = plan.captions?.[captionSlot - 1];
    if (!caption) throw new Error('Legenda do teste não encontrada.');
    const pathname = `temporary/official-test/${first.fileName}`;
    const blob = await head(pathname, { access: 'public', storeId: process.env.VIDEO_STORE_ID });
    if (blob.contentType !== 'video/mp4' || Number(blob.size) > 25 * 1024 * 1024) throw new Error('Vídeo temporário inválido.');

    let state = previous;
    if (!state?.containerId) {
      const created = await graph(`${instagramUserId}/media`, auth.accessToken, { method: 'POST', body: { media_type: 'REELS', video_url: blob.url, caption, share_to_feed: 'true' } });
      state = { stage: 'container_created', containerId: created.id, fileName: first.fileName, captionSlot, createdAt: new Date().toISOString() };
      await saveState(state);
    }

    let status;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const url = new URL(`https://graph.instagram.com/${state.containerId}`);
      url.search = new URLSearchParams({ fields: 'status_code,status', access_token: auth.accessToken });
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      status = await response.json();
      if (!response.ok || status.error) throw new Error(status.error?.message || 'Falha ao consultar processamento do Reel.');
      if (status.status_code === 'FINISHED') break;
      if (['ERROR', 'EXPIRED'].includes(status.status_code)) throw new Error(status.status || `Processamento ${status.status_code}.`);
      await wait(3000);
    }
    if (status?.status_code !== 'FINISHED') {
      await saveState({ ...state, stage: 'processing', lastStatus: status?.status_code || 'IN_PROGRESS', checkedAt: new Date().toISOString() });
      return json(res, 202, { ok: true, processing: true, containerId: state.containerId, status: status?.status_code || 'IN_PROGRESS' });
    }

    const published = await graph(`${instagramUserId}/media_publish`, auth.accessToken, { method: 'POST', body: { creation_id: state.containerId } });
    const receipt = { ...state, stage: 'published', mediaId: published.id, publishedAt: new Date().toISOString(), cleanupComplete: false };
    await saveState(receipt);
    await markPlanPublished(receipt);
    try {
      await del(pathname, { access: 'public', storeId: process.env.VIDEO_STORE_ID });
      receipt.cleanupComplete = true;
      await saveState(receipt);
    } catch {}
    return json(res, 200, { ok: true, published: true, mediaId: receipt.mediaId, publishedAt: receipt.publishedAt, cleanupComplete: receipt.cleanupComplete });
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.message || 'Não foi possível publicar o teste.' });
  }
}
