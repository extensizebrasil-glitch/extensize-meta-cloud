import { get, put } from '@vercel/blob';
import { json, publicBaseUrl } from '../lib/http.js';

const PLAN_PATH = 'planning/current-draft.json';
const ALLOWED_TIMES = new Set(['06:00', '10:00', '14:00', '18:00', '22:00']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HOURS = ['06:00', '10:00', '14:00', '18:00', '22:00'];
const REBASE_CONFIRMATION = 'Redistribuir fila restante a partir de 2026-10-03 18:00';
const ACTIVATE_CONFIRMATION = 'Ativar e executar a fila automática Extensize.';

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
  if (!Array.isArray(body.captions) || body.captions.length !== 5) throw new Error('Cadastre exatamente cinco legendas.');
  const captions = body.captions.map(value => String(value || '').trim());
  if (captions.some(value => !value)) throw new Error('Preencha as cinco legendas.');
  if (captions.some(value => value.length > 2200)) throw new Error('Cada legenda deve ter no máximo 2.200 caracteres.');
  if (new Set(captions.map(value => value.toLocaleLowerCase('pt-BR'))).size !== 5) throw new Error('As cinco legendas devem ser diferentes.');
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 304) throw new Error('Lista de vídeos inválida.');
  const names = new Set();
  const items = body.items.map((item, index) => {
    const fileName = String(item.fileName || '');
    if (!fileName.toLowerCase().endsWith('.mp4') || fileName.length > 240 || names.has(fileName)) throw new Error('Arquivo inválido ou repetido.');
    if (!DATE_PATTERN.test(item.date || '') || item.date < body.startDate || item.date > body.endDate) throw new Error('Data de item inválida.');
    if (!ALLOWED_TIMES.has(item.time)) throw new Error('Horário inválido.');
    names.add(fileName);
    return { order: index + 1, fileName, date: item.date, time: item.time, captionSlot: (index % 5) + 1, status: 'draft' };
  });
  return { startDate: body.startDate, endDate: body.endDate, postsPerDay, captions, captionRotation: 'sequential', items };
}

function dateText(date) {
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

async function rebaseRemaining(body) {
  if (String(body?.confirmation || '') !== REBASE_CONFIRMATION) throw new Error('Confirmação inválida.');
  const stored = await get(PLAN_PATH, { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
  if (!stored || stored.statusCode !== 200 || !stored.stream) throw new Error('Plano não encontrado.');
  const plan = JSON.parse(await new Response(stored.stream).text());
  const pending = plan.items.filter(item => item.status !== 'published').sort((a, b) => a.order - b.order);
  const startDay = new Date(Date.UTC(2026, 9, 3));
  const startIndex = HOURS.indexOf('18:00');
  pending.forEach((item, index) => {
    const slot = startIndex + index;
    const day = new Date(startDay);
    day.setUTCDate(day.getUTCDate() + Math.floor(slot / HOURS.length));
    item.date = dateText(day);
    item.time = HOURS[slot % HOURS.length];
    item.status = 'draft';
  });
  plan.startDate = '2026-10-03';
  plan.endDate = pending.at(-1)?.date || plan.endDate;
  plan.updatedAt = new Date().toISOString();
  plan.rebasedAt = plan.updatedAt;
  plan.rebaseRule = { preserveOrder: true, catchUpBurst: false, firstPendingSlot: '2026-10-03T18:00:00-03:00' };
  plan.automation = { active: false, mode: 'prepared', timeZone: 'America/Sao_Paulo' };
  await put(PLAN_PATH, JSON.stringify(plan), { access: 'private', storeId: process.env.TOKEN_STORE_ID, allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
  return { ok: true, active: false, pending: pending.length, first: pending[0] ? { order: pending[0].order, fileName: pending[0].fileName, date: pending[0].date, time: pending[0].time, captionSlot: pending[0].captionSlot } : null, last: pending.at(-1) ? { order: pending.at(-1).order, date: pending.at(-1).date, time: pending.at(-1).time } : null };
}

async function setAutomation(body) {
  if (String(body?.confirmation || '') !== ACTIVATE_CONFIRMATION) throw new Error('Confirmação inválida.');
  const stored = await get(PLAN_PATH, { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
  if (!stored || stored.statusCode !== 200 || !stored.stream) throw new Error('Plano não encontrado.');
  const plan = JSON.parse(await new Response(stored.stream).text());
  plan.automation = { active: body.active === true, mode: body.active === true ? 'automatic' : 'paused', timeZone: 'America/Sao_Paulo', catchUp: { enabled: true, intervalMinutes: 60, maxPerRun: 1, oldestFirst: true }, changedAt: new Date().toISOString() };
  plan.updatedAt = plan.automation.changedAt;
  await put(PLAN_PATH, JSON.stringify(plan), { access: 'private', storeId: process.env.TOKEN_STORE_ID, allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
  return { ok: true, automation: plan.automation };
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
    const body = parseBody(req);
    if (body?.action === 'rebaseRemaining') return json(res, 200, await rebaseRemaining(body));
    if (body?.action === 'setAutomation') return json(res, 200, await setAutomation(body));
    const data = validate(body);
    const now = new Date().toISOString();
    const plan = { version: 1, status: 'draft', createdAt: now, updatedAt: now, ...data, locks: { publishing: true, scheduling: true, permanentStorage: true } };
    await put(PLAN_PATH, JSON.stringify(plan), { access: 'private', storeId: process.env.TOKEN_STORE_ID, allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
    return json(res, 200, { ok: true, plan: { status: plan.status, updatedAt: plan.updatedAt, itemCount: plan.items.length } });
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.message || 'Não foi possível salvar o rascunho.' });
  }
}
