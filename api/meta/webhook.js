import { json } from '../../lib/http.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).end('Verificação recusada.');
  }
  if (req.method === 'POST') {
    // Os eventos serão persistidos quando habilitarmos mensagens/comentários.
    return json(res, 200, { received: true });
  }
  return json(res, 405, { error: 'Método não permitido' });
}
