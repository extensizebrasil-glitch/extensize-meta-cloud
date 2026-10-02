import { get, put } from '@vercel/blob';

export async function getCurrentPlan() {
  const stored = await get('planning/current-draft.json', { access: 'private', storeId: process.env.TOKEN_STORE_ID, useCache: false });
  if (!stored || stored.statusCode !== 200 || !stored.stream) return null;
  return JSON.parse(await new Response(stored.stream).text());
}

export async function saveCurrentPlan(plan) {
  await put('planning/current-draft.json', JSON.stringify(plan), { access: 'private', storeId: process.env.TOKEN_STORE_ID, allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' });
}
