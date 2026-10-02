import { publicBaseUrl, requiredEnv } from '../../../lib/http.js';
import { createOAuthState } from '../../../lib/security.js';

export default function handler(req, res) {
  try {
    requiredEnv(['META_INSTAGRAM_APP_ID', 'META_STATE_SECRET']);
    const redirectUri = `${publicBaseUrl()}/api/meta/oauth/callback`;
    const slot = req.query.slot === 'secondary' ? 'secondary' : 'primary';
    const params = new URLSearchParams({
      client_id: process.env.META_INSTAGRAM_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic,instagram_business_content_publish',
      state: createOAuthState({ slot }),
      enable_fb_login: '0',
      force_authentication: '1'
    });
    res.statusCode = 302;
    res.setHeader('Location', `https://www.instagram.com/oauth/authorize?${params}`);
    res.end();
  } catch (error) {
    res.status(500).end('Integração ainda não configurada na Vercel.');
  }
}
