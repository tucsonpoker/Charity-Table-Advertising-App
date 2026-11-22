'use strict';
const crypto = require('node:crypto');

// Same scrypt format as the original app, so existing passwords keep working.
function hashPassword(p) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(p), salt, 64).toString('hex');
}
function verifyPassword(p, h) {
  try {
    const [s, v] = String(h).split(':');
    return crypto.timingSafeEqual(crypto.scryptSync(String(p), s, 64), Buffer.from(v, 'hex'));
  } catch { return false; }
}
const token = () => crypto.randomBytes(32).toString('hex');
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const csrfFor = (sid) => (sid ? crypto.createHmac('sha256', sid).update('cactus-v3-form').digest('hex') : '');
function csrfOk(sid, value) {
  const want = csrfFor(sid);
  if (!want || typeof value !== 'string' || value.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(value));
}

// Simple in-memory attempt limiter (per process). Good enough for a single Railway instance.
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return false; }
  b.n += 1;
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.n > max;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
const isEmail = (s) => /^[^\s@]{1,120}@[^\s@]{1,120}\.[^\s@]{2,40}$/.test(String(s || ''));

module.exports = { hashPassword, verifyPassword, token, digest, csrfFor, csrfOk, limited, esc, isUuid, isEmail };
