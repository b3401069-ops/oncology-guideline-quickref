'use strict';

function cloudConfig(env = process.env) {
  if (!env.K_SERVICE && env.NODE_ENV !== 'production') return null;
  let origin;
  try { origin = new URL(env.APP_ORIGIN); } catch { throw new Error('APP_ORIGIN is required in production'); }
  if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN ||
      !/^\/projects\/\d+\/locations\/[a-z0-9-]+\/services\/[a-z0-9-]+$/.test(env.IAP_AUDIENCE || '') ||
      !/^[^\s@]+@[^\s@]+$/.test(env.ALLOWED_EMAIL || '')) {
    throw new Error('Production requires exact HTTPS origin, IAP audience and allowed email');
  }
  return { origin: origin.origin, host: origin.host, audience: env.IAP_AUDIENCE, email: env.ALLOWED_EMAIL };
}

function createIapVerifier(config, client) {
  // Lazy loading keeps the local-only app usable without cloud dependencies.
  client ||= new (require('google-auth-library').OAuth2Client)();
  return async (token) => {
    if (typeof token !== 'string' || token.length > 16384) return false;
    try {
      const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
      if (header.alg !== 'ES256' || typeof header.kid !== 'string') return false;
      const { pubkeys } = await client.getIapPublicKeys();
      const ticket = await client.verifySignedJwtWithCertsAsync(token, pubkeys, config.audience, ['https://cloud.google.com/iap']);
      const payload = ticket.getPayload();
      const now = Date.now() / 1000;
      return !!payload && payload.email === config.email && typeof payload.sub === 'string' && !!payload.sub &&
        Number.isFinite(payload.iat) && Number.isFinite(payload.exp) &&
        payload.iat <= now + 30 && payload.exp >= now - 30 &&
        payload.exp > payload.iat && payload.exp - payload.iat <= 660;
    } catch {
      // Never log the assertion, patient fields, credentials or provider response.
      return false;
    }
  };
}

module.exports = { cloudConfig, createIapVerifier };
