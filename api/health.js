import { json } from '../lib/http.js';

export default function handler(req, res) {
  return json(res, 200, { ok: true, service: 'extensize-meta-cloud', time: new Date().toISOString() });
}
