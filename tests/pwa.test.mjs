import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url));
test('PWA identity, credentialed manifest and correctly sized icon assets', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.name, 'Miszuk Family');
  assert.equal(manifest.short_name, 'Miszuk Family');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/#home');
  assert.equal(manifest.scope, '/');
  assert.match(read('index.html').toString(), /rel="manifest"[^>]+crossorigin="use-credentials"/);
  for (const icon of manifest.icons) {
    const png = read('public' + icon.src);
    assert.equal(png.subarray(1,4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  const apple = read('public/app-icons/apple-touch-icon.png');
  assert.equal(apple.readUInt32BE(16), 180);
  assert.equal(apple.readUInt32BE(20), 180);
});
