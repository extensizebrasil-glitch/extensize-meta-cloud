import { get, put } from '@vercel/blob';
import { json, publicBaseUrl } from '../lib/http.js';

const PLAN_PATH = 'planning/current-draft.json';
const ALLOWED_TIMES = new Set(['06:00', '10:00', '14:00', '18:00', '22:00']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return null;
}

function validate(body) {
  if (!body || !DATE_PATTERN.test(body.startDate || '') || !DATE_PATTERN.test(body.endDate || '')) throw new Error('Período inválido.');
  if (body.endDate < body.startDate) throw new Error('A data final deve ser igual ou posterior à inicial.');
  const postsPerDay = Number(body.postsPerDay);
  if (!Number.isInteger(postsPerDay) || postsPerDay < 1 || postsPerDay > 5) throw new Error('Quantidade diária inválida.');
  const defaultCaption = String(body.defaultCaption || '').trim();
  if (defaultCaption.length > 2200) throw new Error('A legenda deve ter no máximo 2.200 caracteres.');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 304) throw new Error('Lista de vídeos inválida.');
  const names = new Set();
  const items = body.items.map((item, index) => {
    const fileName = String(item.fileName || '');
    if (!fileName.toLowerCase().endsWith('.mp4') || fileName.length > 240 || names.has(fileName)) throw new Error('Arquivo inválido ou repetido.');
    if (!DATE_PATTERN.test(item.date || '') || item.date < body.startDate || item.date > body.endDate) throw new Error('Data de item inválida.');
    if (!ALLOWED_TIMES.has(item.time)) throw new Error('Horário inválido.');
    names.add(fileName);
    return { order: index + 1, fileName, date: item.date, time: item.time, status: 'draft' };
  });
  return { startDate: body.startDate, endDate: body.endDate, postsPerDay, defaultCaption, items };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const stored = await get(PLAN_PATH, { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
      if (!stored || stored.statusCode !== 200 || !stored.stream) return json(res, 200, { ok: true, plan: null });
      return json(res, 200, { ok: true, plan: JSON.parse(await new Response(stored.stream).text()) });
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const origin = String(req.headers.origin || '').replace(/\/$/, '');
    const expectedOrigin = publicBaseUrl();
    if (origin && expectedOrigin && origin !== expectedOrigin) return json(res, 403, { ok: false, error: 'Origem não autorizada.' });
    const data = validate(parseBody(req));
    const now = new Date().toISOString();
    const plan = { version: 1, status: 'draft', createdAt: now, updatedAt: now, ...data, locks: { publishing: true, scheduling: true, permanentStorage: true } };
    await put(PLAN_PATH, JSON.stringify(plan), { access: 'private', storeId: process.env.TOKEN_STORE_ID, allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
    return json(res, 200, { ok: true, plan: { status: plan.status, updatedAt: plan.updatedAt, itemCount: plan.items.length } });
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.message || 'Não foi possível salvar o rascunho.' });
  }
}
