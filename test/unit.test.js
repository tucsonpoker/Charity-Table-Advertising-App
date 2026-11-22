'use strict';
// Fast checks that need no database: run with `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const image = require('../lib/image');
const sec = require('../lib/security');
const ui = require('../lib/ui');

function png(w, h) { const b = Buffer.alloc(33); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; }

test('artwork: small PNG is flagged, large PNG passes', () => {
  assert.equal(image.grade(png(300, 200), 'image/png').quality, 'low');
  assert.equal(image.grade(png(2400, 1600), 'image/png').quality, 'good');
});
test('artwork: renamed text file is rejected', () => {
  assert.equal(image.looksLike(Buffer.from('hello, this is not an image'), 'image/png'), false);
  assert.equal(image.looksLike(png(10, 10), 'image/png'), true);
  assert.equal(image.looksLike(Buffer.from('%PDF-1.7 ...'), 'application/pdf'), true);
  assert.equal(image.looksLike(Buffer.from('<?xml version="1.0"?><svg xmlns="x"></svg>'), 'image/svg+xml'), true);
});
test('passwords: hash and verify', () => {
  const h = sec.hashPassword('correct horse battery');
  assert.ok(sec.verifyPassword('correct horse battery', h));
  assert.ok(!sec.verifyPassword('wrong', h));
});
test('sign-in failures are counted per key and cleared', () => {
  const k = 'test:' + Math.random();
  for (let i = 0; i < 8; i++) sec.recordFailure(k, 60e3);
  assert.equal(sec.failures(k), 8);
  sec.clearFailures(k);
  assert.equal(sec.failures(k), 0);
});
test('escaping blocks script tags', () => {
  assert.equal(sec.esc('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});
test('asset version is a content fingerprint', () => {
  assert.match(ui.ASSET_V, /^[0-9a-f]{10}$/);
});
test('a malformed cookie does not crash the server', async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://invalid/none';
  const { handle } = require('../server');
  const http = require('http');
  const srv = http.createServer(handle).listen(0);
  const port = srv.address().port;
  const get = (cookie) => new Promise((resolve) => http.get({ port, path: '/login', headers: { cookie } }, (r) => { r.resume(); r.on('end', () => resolve(r.statusCode)); }).on('error', () => resolve(0)));
  const a = await get('sid=%');
  const b = await get('sid=%E0%A4%A; fl=%');
  srv.close();
  assert.ok(a > 0 && b > 0, 'server answered both requests');
});
