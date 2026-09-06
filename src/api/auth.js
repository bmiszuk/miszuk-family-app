import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError } from './errors.js';

const keySets = new Map();
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalDevelopment(request, env) {
  return env.LOCAL_DEV === 'true' && localHosts.has(new URL(request.url).hostname);
}

export async function authenticate(request, env) {
  if (isLocalDevelopment(request, env)) {
    return { id: 'local-development', email: 'family@localhost', name: 'Local family member', local: true };
  }
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (typeof domain !== 'string' || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) || !env.ACCESS_AUD) {
    throw new HttpError(503, 'Family sign-in is not configured yet.');
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new HttpError(401, 'Please sign in again to continue.');
  if (!keySets.has(domain)) keySets.set(domain, createRemoteJWKSet(new URL(`https://${domain}/cdn-cgi/access/certs`)));
  return verifyIdentity(token, keySets.get(domain), `https://${domain}`, env.ACCESS_AUD);
}

// Exported to test real signature/issuer/audience/expiry validation with isolated keys.
export async function verifyIdentity(token, keys, issuer, audience) {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'email', 'exp', 'iat'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || !payload.email.includes('@')) {
      throw new Error('Missing member identity');
    }
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim().slice(0, 160) : payload.email.split('@')[0],
      local: false,
    };
  } catch {
    throw new HttpError(401, 'Please sign in again to continue.');
  }
}

export function checkOrigin(request, env) {
  if (['GET', 'HEAD'].includes(request.method)) return;
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, 'Open the family website to make changes.');
  const origin = request.headers.get('Origin');
  if (!origin) return; // Non-browser clients still require a valid Access JWT.
  const url = new URL(request.url);
  if (origin === url.origin) return;
  if (isLocalDevelopment(request, env)) {
    try { if (localHosts.has(new URL(origin).hostname)) return; } catch { /* Reject invalid origin. */ }
  }
  throw new HttpError(403, 'Open the family website to make changes.');
}
