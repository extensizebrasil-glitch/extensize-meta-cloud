import { issueSignedToken, presignUrl } from '@vercel/blob';
import { json, publicBaseUrl } from '../../lib/http.js';
import { getCurrentPlan } from '../../lib/plan-store.js';

const MAX_TEST_BYTES = 25 * 1024 * 1024;
const AUTOMATION_CONFIRMATION = 'Ativar e executar a fila automática Extensize.';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const origin = String(req.headers.origin || '').replace(/\/$/, '');
    const expectedOrigin = publicBaseUrl();
    if (origin && expectedOrigin && origin !== expectedOrigin) return json(res, 403, { ok: false, error: 'Origem não autorizada.' });
    const plan = await getCurrentPlan();
    const automationRequest = req.body?.confirmation === AUTOMATION_CONFIRMATION;
    if (automationRequest && req.body?.storage === 'persistent' && Array.isArray(req.body?.orders)) {
      if (!plan?.automation?.active) throw new Error('Automação não está ativa.');
      const orders = [...new Set(req.body.orders.map(Number))].slice(0, 20);
      const selected = orders.map(order => plan.items.find(item => item.order === order && item.status !== 'published')).filter(Boolean);
      if (!selected.length) throw new Error('Nenhum item válido para envio.');
      const validUntil = Date.now() + 15 * 60 * 1000;
      const uploads = await Promise.all(selected.map(async item => {
        const pathname = `reels/${item.fileName}`;
        const token = await issueSignedToken({ access: 'public', storeId: process.env.VIDEO_STORE_ID, pathname, operations: ['put'], allowedContentTypes: ['video/mp4'], maximumSizeInBytes: MAX_TEST_BYTES, validUntil });
        const { presignedUrl } = await presignUrl(token, { operation: 'put', pathname, access: 'public', allowedContentTypes: ['video/mp4'], maximumSizeInBytes: MAX_TEST_BYTES, allowOverwrite: true, addRandomSuffix: false, validUntil });
        return { order: item.order, fileName: item.fileName, pathname, presignedUrl };
      }));
      return json(res, 200, { ok: true, persistent: true, uploads, validUntil: new Date(validUntil).toISOString() });
    }
    const first = automationRequest
      ? plan?.items?.find(item => item.order === Number(req.body?.order) && item.status !== 'published')
      : plan?.items?.[0];
    if (!plan || plan.status !== 'draft' || !first || !Array.isArray(plan.captions) || plan.captions.length !== 5) throw new Error('Rascunho completo não encontrado.');
    if (automationRequest && !plan.automation?.active) throw new Error('Automação não está ativa.');
    const requestedName = String(req.body?.fileName || '');
    if (requestedName !== first.fileName) throw new Error(`Selecione exatamente o arquivo ${first.fileName}.`);
    const persistent = automationRequest && req.body?.storage === 'persistent';
    const pathname = persistent ? `reels/${first.fileName}` : automationRequest ? `temporary/automation/${String(first.order).padStart(4, '0')}-${first.fileName}` : `temporary/official-test/${first.fileName}`;
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({ access: 'public', storeId: process.env.VIDEO_STORE_ID, pathname, operations: ['put'], allowedContentTypes: ['video/mp4'], maximumSizeInBytes: MAX_TEST_BYTES, validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: 'put', pathname, access: 'public', allowedContentTypes: ['video/mp4'], maximumSizeInBytes: MAX_TEST_BYTES, allowOverwrite: true, addRandomSuffix: false, validUntil });
    return json(res, 200, { ok: true, order: first.order, fileName: first.fileName, pathname, persistent, presignedUrl, validUntil: new Date(validUntil).toISOString(), maximumSizeInBytes: MAX_TEST_BYTES, captionSlot: first.captionSlot || 1, publicationLocked: !automationRequest });
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.message || 'Não foi possível preparar o teste.' });
  }
}
