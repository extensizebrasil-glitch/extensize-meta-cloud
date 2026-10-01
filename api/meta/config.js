import { json, publicBaseUrl } from '../../lib/http.js';

export default function handler(req, res) {
  const keys = ['META_INSTAGRAM_APP_ID', 'META_INSTAGRAM_APP_SECRET', 'META_STATE_SECRET', 'META_WEBHOOK_VERIFY_TOKEN', 'TOKEN_ENCRYPTION_KEY', 'TOKEN_STORE_ID', 'VIDEO_STORE_ID'];
  return json(res, 200, {
    ok: true,
    baseUrl: publicBaseUrl(),
    callbackUrl: `${publicBaseUrl()}/api/meta/oauth/callback`,
    webhookUrl: `${publicBaseUrl()}/api/meta/webhook`,
    configured: Object.fromEntries(keys.map(key => [key, Boolean(process.env[key])]))
  });
}
