import { del, list } from '@vercel/blob';
import { json, publicBaseUrl } from '../../lib/http.js';

const CONFIRMATION = 'Remover biblioteca Magnate e priorizar Dosis de Animo.';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const origin = String(req.headers.origin || '').replace(/\/$/, '');
    const expectedOrigin = publicBaseUrl();
    if (origin && expectedOrigin && origin !== expectedOrigin) return json(res, 403, { ok: false, error: 'Origem não autorizada.' });
    if (String(req.body?.confirmation || '') !== CONFIRMATION) return json(res, 403, { ok: false, error: 'Confirmação inválida.' });

    let cursor;
    let removed = 0;
    let bytes = 0;
    do {
      const result = await list({ access: 'public', storeId: process.env.VIDEO_STORE_ID, prefix: 'reels/', limit: 1000, cursor });
      const magnate = result.blobs.filter(blob => blob.pathname.toLowerCase().endsWith('.mp4') && !blob.pathname.split('/').at(-1).startsWith('dosisdeanimoo-'));
      if (magnate.length) {
        await del(magnate.map(blob => blob.url), { access: 'public', storeId: process.env.VIDEO_STORE_ID });
        removed += magnate.length;
        bytes += magnate.reduce((total, blob) => total + Number(blob.size || 0), 0);
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);

    return json(res, 200, { ok: true, removed, bytes, preservedPrefix: 'dosisdeanimoo-' });
  } catch (error) {
    return json(res, 400, { ok: false, error: error?.message || 'Não foi possível liberar a biblioteca.' });
  }
}
