import { del, get, head, put } from '@vercel/blob';
import { json, publicBaseUrl } from '../../lib/http.js';
import { getInstagramToken } from '../../lib/meta-store.js';
import { getCurrentPlan, saveCurrentPlan } from '../../lib/plan-store.js';

const STATE_PATH = 'tests/official-reel-state.json';
const CONFIRMATION = 'Autorizo publicar o Reel de teste.';
const AUTOMATION_CONFIRMATION = 'Ativar e executar a fila automática Extensize.';
const CLOUD_CONFIRMATION = 'Executar próximo horário da fila Extensize na nuvem.';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getState(statePath = STATE_PATH) {
  try {
    const stored = await get(statePath, { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
    if (!stored || stored.statusCode !== 200 || !stored.stream) return null;
    return JSON.parse(await new Response(stored.stream).text());
  } catch { return null; }
}

async function saveState(state, statePath = STATE_PATH) {
  await put(statePath, JSON.stringify(state), { access: 'private', storeId: process.env.TOKEN_STORE_ID, allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
}

async function markPlanPublished(receipt, order = 1) {
  const plan = await getCurrentPlan();
  const index = plan?.items?.findIndex(item => item.order === order);
  if (index == null || index < 0) return;
  plan.items[index] = { ...plan.items[index], status: 'published', mediaId: receipt.mediaId, publishedAt: receipt.publishedAt };
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
    const cloudRequest = String(req.body?.confirmation || '') === CLOUD_CONFIRMATION;
    const automationRequest = cloudRequest || String(req.body?.confirmation || '') === AUTOMATION_CONFIRMATION;
    if (!automationRequest && String(req.body?.confirmation || '') !== CONFIRMATION) return json(res, 403, { ok: false, error: 'Confirmação final inválida.' });
    const initialPlan = automationRequest ? await getCurrentPlan() : null;
    const lastPublishedAt = cloudRequest ? initialPlan?.items?.filter(item => item.status === 'published' && item.publishedAt).map(item => new Date(item.publishedAt).getTime()).sort((a, b) => b - a)[0] : null;
    const recoveryWait = lastPublishedAt ? Date.now() - lastPublishedAt : Infinity;
    if (cloudRequest && recoveryWait < 55 * 60 * 1000) return json(res, 200, { ok: true, published: false, reason: 'Intervalo mínimo entre publicações ainda não concluído.', retryAfterMinutes: Math.ceil((55 * 60 * 1000 - recoveryWait) / 60000) });
    const dueItem = cloudRequest ? initialPlan?.items?.filter(item => item.status !== 'published' && Date.now() >= new Date(`${item.date}T${item.time}:00-03:00`).getTime()).sort((a, b) => new Date(`${a.date}T${a.time}:00-03:00`) - new Date(`${b.date}T${b.time}:00-03:00`) || a.order - b.order)[0] : null;
    if (cloudRequest && !dueItem) return json(res, 200, { ok: true, published: false, reason: 'Nenhum item vencido na fila.' });
    const order = automationRequest ? Number(cloudRequest ? dueItem.order : req.body?.order) : 1;
    const statePath = automationRequest ? `automation/items/${String(order).padStart(4, '0')}.json` : STATE_PATH;

    const previous = await getState(statePath);
    if (previous?.stage === 'published') {
      await markPlanPublished(previous, order);
      return json(res, 200, { ok: true, alreadyPublished: true, mediaId: previous.mediaId, publishedAt: previous.publishedAt, cleanupComplete: previous.cleanupComplete });
    }

    const [plan, auth] = await Promise.all([initialPlan || getCurrentPlan(), getInstagramToken()]);
    const first = automationRequest ? plan?.items?.find(item => item.order === order) : plan?.items?.[0];
    if (!plan || plan.status !== 'draft' || !first || !auth?.accessToken) throw new Error('Plano ou conexão do Instagram indisponível.');
    if (automationRequest) {
      if (!plan.automation?.active) throw new Error('Automação não está ativa.');
      if (first.status === 'published') throw new Error('Item já publicado.');
      if (!cloudRequest && String(req.body?.fileName || '') !== first.fileName) throw new Error('Arquivo não corresponde ao item da fila.');
      const scheduled = new Date(`${first.date}T${first.time}:00-03:00`).getTime();
      const delay = Date.now() - scheduled;
      if (delay < 0) throw new Error('Item ainda não atingiu o horário autorizado.');
    }
    const profileUrl = new URL('https://graph.instagram.com/me');
    profileUrl.search = new URLSearchParams({ fields: 'id,user_id,username,account_type', access_token: auth.accessToken });
    const profileResponse = await fetch(profileUrl, { headers: { Accept: 'application/json' } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error(profile.error?.message || 'Não foi possível confirmar o ID atual do Instagram.');
    const instagramUserId = profile.id;
    const captionSlot = Number(first.captionSlot || 1);
    const caption = plan.captions?.[captionSlot - 1];
    if (!caption) throw new Error('Legenda do teste não encontrada.');
    const pathname = cloudRequest ? `reels/${first.fileName}` : automationRequest ? `temporary/automation/${String(first.order).padStart(4, '0')}-${first.fileName}` : `temporary/official-test/${first.fileName}`;
    const blob = await head(pathname, { access: 'public', storeId: process.env.VIDEO_STORE_ID });
    if (blob.contentType !== 'video/mp4' || Number(blob.size) > 25 * 1024 * 1024) throw new Error('Vídeo temporário inválido.');

    let state = previous;
    if (!state?.containerId) {
      const created = await graph(`${instagramUserId}/media`, auth.accessToken, { method: 'POST', body: { media_type: 'REELS', video_url: blob.url, caption, share_to_feed: 'true' } });
      state = { stage: 'container_created', containerId: created.id, fileName: first.fileName, captionSlot, createdAt: new Date().toISOString() };
      await saveState(state, statePath);
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
      await saveState({ ...state, stage: 'processing', lastStatus: status?.status_code || 'IN_PROGRESS', checkedAt: new Date().toISOString() }, statePath);
      return json(res, 202, { ok: true, processing: true, containerId: state.containerId, status: status?.status_code || 'IN_PROGRESS' });
    }

    const published = await graph(`${instagramUserId}/media_publish`, auth.accessToken, { method: 'POST', body: { creation_id: state.containerId } });
    const receipt = { ...state, stage: 'published', mediaId: published.id, publishedAt: new Date().toISOString(), cleanupComplete: false };
    await saveState(receipt, statePath);
    await markPlanPublished(receipt, order);
    try {
      await del(pathname, { access: 'public', storeId: process.env.VIDEO_STORE_ID });
      receipt.cleanupComplete = true;
      await saveState(receipt, statePath);
    } catch {}
    return json(res, 200, { ok: true, published: true, mediaId: receipt.mediaId, publishedAt: receipt.publishedAt, cleanupComplete: receipt.cleanupComplete });
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.message || 'Não foi possível publicar o teste.' });
  }
}
