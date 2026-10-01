export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function requiredEnv(names) {
  const missing = names.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(', ')}`);
}

export function publicBaseUrl() {
  const explicit = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (explicit) return explicit;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : '';
}
