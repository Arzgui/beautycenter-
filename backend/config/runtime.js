export function validateRuntime(env = process.env) {
  if (env.NODE_ENV !== 'production') return;
  const httpsOrigin = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password; }
    catch { return false; }
  };
  if (!httpsOrigin(env.SITE_URL)) throw new Error('Production requires SITE_URL to be an HTTPS origin');
  const origins = (env.CORS_ORIGINS || '').split(',').map(value => value.trim());
  if (!origins.length || !origins.every(httpsOrigin) || !origins.includes(env.SITE_URL)) throw new Error('Production requires explicit HTTPS CORS_ORIGINS including SITE_URL');
  for (const key of ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','BREVO_API_KEY','BREVO_SENDER_EMAIL','BREVO_SENDER_NAME']) {
    if (!env[key] || /^your[_ ]/i.test(env[key])) throw new Error('Production requires configured ' + key);
  }
  if (!env.DATABASE_FILE || !/^(?:[A-Za-z]:[\\/]|\/)/.test(env.DATABASE_FILE)) throw new Error('Production requires an absolute DATABASE_FILE');
  if (!/^\d+$/.test(env.PORT || '4000') || Number(env.PORT || 4000) < 1 || Number(env.PORT || 4000) > 65535) throw new Error('Invalid PORT');
  if (!/^[0-5]$/.test(env.TRUST_PROXY || '1')) throw new Error('Invalid TRUST_PROXY hop count');
}
