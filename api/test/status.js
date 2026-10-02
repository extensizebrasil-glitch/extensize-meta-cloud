import { head } from '@vercel/blob';
import { json } from '../../lib/http.js';
import { getCurrentPlan } from '../../lib/plan-store.js';

export default async function handler(req, res) {
  try {
    const plan = await getCurrentPlan();
    const first = plan?.items?.[0];
    if (!first) return json(res, 200, { ok: true, ready: false, reason: 'Rascunho não encontrado.', publicationLocked: true });
    const pathname = `temporary/official-test/${first.fileName}`;
    const blob = await head(pathname, { access: 'public', storeId: process.env.VIDEO_STORE_ID });
    return json(res, 200, { ok: true, ready: blob.contentType === 'video/mp4' && Number(blob.size) <= 25 * 1024 * 1024, fileName: first.fileName, pathname, size: Number(blob.size || 0), contentType: blob.contentType, captionSlot: first.captionSlot || 1, publicationLocked: true });
  } catch {
    return json(res, 200, { ok: true, ready: false, reason: 'Vídeo temporário ainda não enviado.', publicationLocked: true });
  }
}
