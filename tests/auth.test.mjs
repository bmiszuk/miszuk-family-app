import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyIdentity, checkOrigin } from '../src/api/auth.js';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const issuer = 'https://test.cloudflareaccess.com';
async function token(overrides = {}) {
  return new SignJWT({ sub: 'member-1', email: 'member@example.com', name: 'Family Member', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+300, iss: issuer, aud: ['family-aud'], ...overrides }).setProtectedHeader({ alg: 'RS256' }).sign(privateKey);
}
test('valid Access JWT yields the signed identity', async () => {
  const member = await verifyIdentity(await token(), publicKey, issuer, 'family-aud');
  assert.deepEqual(member, { id: 'member-1', email: 'member@example.com', name: 'Family Member', local: false });
});
test('rejects invalid issuer, audience, expiry, future nbf, missing email and subject', async () => {
  for (const changes of [{ iss: 'https://other.cloudflareaccess.com' }, { aud: ['other-app'] }, { exp: 1 }, { nbf: Math.floor(Date.now()/1000)+300 }, { email: null }, { sub: '' }, { iat: undefined }]) {
    await assert.rejects(verifyIdentity(await token(changes), publicKey, issuer, 'family-aud'), { status: 401 });
  }
});
test('rejects a token signed by an untrusted key', async () => {
  const other = await generateKeyPair('RS256');
  await assert.rejects(verifyIdentity(await token(), other.publicKey, issuer, 'family-aud'), { status: 401 });
});
test('production writes require a matching browser origin', () => {
  assert.doesNotThrow(() => checkOrigin(new Request('https://family.miszuk.com/api/news', { method: 'POST', headers: { Origin: 'https://family.miszuk.com' } }), {}));
  assert.throws(() => checkOrigin(new Request('https://family.miszuk.com/api/news', { method: 'POST', headers: { Origin: 'https://other.example' } }), {}), { status: 403 });
});
