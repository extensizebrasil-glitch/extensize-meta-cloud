import { json } from '../../lib/http.js';
import { getInstagramToken } from '../../lib/meta-store.js';

async function fetchGraph(path, accessToken) {
  const url = new URL(`https://graph.instagram.com/${path}`);
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  return { ok: response.ok, status: response.status, data: await response.json() };
}

export default async function handler(req, res) {
  try {
    const auth = await getInstagramToken();
    if (!auth?.accessToken) return json(res, 401, { ok: false, error: 'Token ausente.' });
    const [profile, permissions] = await Promise.all([
      fetchGraph('me?fields=id,user_id,username,account_type', auth.accessToken),
      fetchGraph('me/permissions', auth.accessToken)
    ]);
    const granted = Array.isArray(permissions.data?.data) ? permissions.data.data.filter(item => item.status === 'granted').map(item => item.permission) : [];
    return json(res, 200, { ok: profile.ok, storedUserId: auth.instagramUserId || null, profileStatus: profile.status, profile: profile.ok ? profile.data : { error: profile.data?.error?.message || 'Perfil indisponível.' }, permissionsStatus: permissions.status, grantedPermissions: granted, contentPublishGranted: granted.includes('instagram_business_content_publish') });
  } catch (error) {
    return json(res, 500, { ok: false, error: error?.message || 'Diagnóstico indisponível.' });
  }
}
