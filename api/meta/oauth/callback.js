import { put } from '@vercel/blob';
import { publicBaseUrl, requiredEnv } from '../../../lib/http.js';
import { encryptJson, readOAuthState } from '../../../lib/security.js';

export default async function handler(req, res) {
  try {
    requiredEnv(['META_INSTAGRAM_APP_ID', 'META_INSTAGRAM_APP_SECRET', 'META_STATE_SECRET', 'TOKEN_ENCRYPTION_KEY', 'TOKEN_STORE_ID']);
    if (req.query.error) return res.status(400).end('Autorização cancelada no Instagram.');
    const state = readOAuthState(req.query.state);
    if (!state) return res.status(400).end('Estado OAuth inválido ou expirado.');
    const slot = state.slot === 'secondary' ? 'secondary' : 'primary';
    const code = String(req.query.code || '');
    if (!code) return res.status(400).end('Código de autorização ausente.');
    const redirectUri = `${publicBaseUrl()}/api/meta/oauth/callback`;
    const form = new URLSearchParams({
      client_id: process.env.META_INSTAGRAM_APP_ID,
      client_secret: process.env.META_INSTAGRAM_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code
    });
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) throw new Error('Falha ao trocar o código OAuth');
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.search = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: process.env.META_INSTAGRAM_APP_SECRET, access_token: token.access_token });
    const longResponse = await fetch(longUrl);
    const longToken = await longResponse.json();
    const accessToken = longResponse.ok && longToken.access_token ? longToken.access_token : token.access_token;
    const profileUrl = new URL('https://graph.instagram.com/me');
    profileUrl.search = new URLSearchParams({ fields: 'id,user_id,username,account_type', access_token: accessToken });
    const profileResponse = await fetch(profileUrl);
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.id) throw new Error('Falha ao confirmar o perfil do Instagram');
    const record = {
      instagramUserId: profile.id,
      accessToken,
      expiresIn: longResponse.ok ? longToken.expires_in : null,
      connectedAt: new Date().toISOString()
    };
    const tokenPath = slot === 'secondary' ? 'meta/instagram-token-secondary.enc' : 'meta/instagram-token.enc';
    await put(tokenPath, encryptJson(record), { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json', storeId: process.env.TOKEN_STORE_ID });
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><title>Extensize conectado</title><style>body{font:18px system-ui;background:#050805;color:#efffe8;display:grid;place-items:center;min-height:100vh}main{max-width:560px;padding:32px;border:1px solid #3c6;border-radius:18px}h1{color:#8cff2b}</style><main><h1>Instagram conectado</h1><p>@${profile.username || profile.id} foi armazenado no espaço ${slot === 'secondary' ? 'secundário' : 'principal'}, de forma privada e criptografada. Você pode fechar esta página.</p></main>`);
  } catch (error) {
    console.error('OAuth callback failed:', error.message);
    res.status(500).end('Não foi possível concluir a conexão. Verifique a configuração do projeto.');
  }
}
