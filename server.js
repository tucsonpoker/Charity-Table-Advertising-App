'use strict';
// Cactus Charity Table Advertising App — v3 single, explicit server (no monkey-patching).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Busboy = require('busboy');
const db = require('./lib/db');
const sec = require('./lib/security');
const ui = require('./lib/ui');

const PUBLIC = path.join(__dirname, 'public');
const STATIC = { '/app.css': 'text/css', '/app.js': 'text/javascript', '/manifest.webmanifest': 'application/manifest+json', '/icon.svg': 'image/svg+xml', '/icon-180.png': 'image/png', '/icon-512.png': 'image/png' };
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const baseHeaders = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

// ---------- request helpers ----------
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; })); }
async function readForm(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 200000) fail(413, 'That form was too large.'); }
  return Object.fromEntries(new URLSearchParams(raw));
}
function readMultipart(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let bb;
    try { bb = Busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: 2, fields: 30 } }); } catch (e) { return reject(new HttpError(400, 'Upload could not be read.')); }
    const fields = {}, files = [];
    bb.on('field', (k, v) => { fields[k] = v; });
    bb.on('file', (name, stream, info) => {
      const parts = []; let size = 0, truncated = false;
      stream.on('data', (d) => { size += d.length; parts.push(d); });
      stream.on('limit', () => { truncated = true; });
      stream.on('end', () => { if (size) files.push({ name, mime: info.mimeType, filename: String(info.filename || '').slice(0, 120), data: Buffer.concat(parts), truncated }); });
    });
    bb.on('close', () => resolve({ fields, files }));
    bb.on('error', () => reject(new HttpError(400, 'Upload could not be read.')));
    req.pipe(bb);
  });
}

// ---------- responses ----------
function send(ctx, status, html, extra = {}) {
  if (ctx.res.headersSent) return;
  ctx.res.writeHead(status, { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, ...extra, ...(ctx.setCookies.length ? { 'Set-Cookie': ctx.setCookies } : {}) });
  ctx.res.end(html);
}
function redirect(ctx, to, flash) {
  if (flash) ctx.setCookies.push('fl=' + encodeURIComponent(JSON.stringify(typeof flash === 'string' ? { text: flash } : flash)) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=30');
  ctx.res.writeHead(303, { ...baseHeaders, Location: to, 'Cache-Control': 'no-store', ...(ctx.setCookies.length ? { 'Set-Cookie': ctx.setCookies } : {}) });
  ctx.res.end();
}
function binary(ctx, mime, data, cache = 'private, max-age=300') {
  const safe = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf'].includes(mime) ? mime : 'application/octet-stream';
  ctx.res.writeHead(200, { ...baseHeaders, 'Content-Type': safe, 'Cache-Control': cache, 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'Content-Disposition': 'inline' });
  ctx.res.end(data);
}
const render = (ctx, opts) => send(ctx, opts.status || 200, ui.shell(ctx, opts));

// ---------- access control (server-side, every request) ----------
const access = {
  async events(u) {
    if (u.role === 'cactus') return db.all(`SELECT e.*,c.name charity_name FROM events e JOIN charities c ON c.id=e.charity_id ORDER BY c.is_demo,e.event_date NULLS LAST,e.created_at DESC`);
    if (u.role === 'manager') return db.all(`SELECT e.*,c.name charity_name FROM events e JOIN charities c ON c.id=e.charity_id WHERE e.charity_id=$1 ORDER BY e.event_date NULLS LAST,e.created_at DESC`, [u.charity_id]);
    return db.all(`SELECT e.*,c.name charity_name FROM events e JOIN charities c ON c.id=e.charity_id JOIN event_members m ON m.event_id=e.id AND m.user_id=$1 WHERE e.charity_id=$2 ORDER BY e.event_date NULLS LAST,e.created_at DESC`, [u.id, u.charity_id]);
  },
  // Returns the event row if this user may see it, otherwise null.
  async event(u, eventId) {
    if (!sec.isUuid(eventId)) return null;
    const e = await db.one('SELECT e.*,c.name charity_name FROM events e JOIN charities c ON c.id=e.charity_id WHERE e.id=$1', [eventId]);
    if (!e) return null;
    if (u.role === 'cactus') return e;
    if (e.charity_id !== u.charity_id) return null;
    if (u.role === 'manager') return e;
    return (await db.one('SELECT 1 FROM event_members WHERE event_id=$1 AND user_id=$2', [eventId, u.id])) ? e : null;
  },
  isLead: (u) => u.role === 'cactus' || u.role === 'manager',
  needLead(u) { if (!access.isLead(u)) fail(403, 'Only the charity lead can do that.'); },
  needCactus(u) { if (u.role !== 'cactus') fail(403, 'Only Cactus can do that.'); },
};

async function loadUser(sid) {
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return {};
  const row = await db.one(`SELECT u.id,u.email,u.name,u.role,u.charity_id,(u.photo_data IS NOT NULL) has_photo,s.view_as FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now() AND u.active=true`, [sid]);
  if (!row) return {};
  if (row.view_as && row.role === 'cactus') {
    const t = await db.one(`SELECT id,email,name,role,charity_id,(photo_data IS NOT NULL) has_photo FROM users WHERE id=$1`, [row.view_as]);
    if (t) return { user: { ...t, readOnly: true }, realUser: row };
  }
  return { user: row };
}

async function buildContext(ctx) {
  const u = ctx.user;
  ctx.events = await access.events(u);
  const wanted = ctx.cookies.ev;
  ctx.event = ctx.events.find((e) => e.id === wanted) || ctx.events.find((e) => !e.event_date || new Date(e.event_date) >= new Date(Date.now() - 864e5)) || ctx.events[0] || null;
  const charityId = ctx.event?.charity_id || u.charity_id;
  ctx.charity = charityId ? await db.one('SELECT id,name,slug,mission,brand_color,(logo_data IS NOT NULL) has_logo,is_demo FROM charities WHERE id=$1', [charityId]) : null;
}

// Keep the header, theme and Tables tab in step with the record being viewed
// (for example an admin opening another charity's table from the Admin page).
async function useEvent(ctx, eventId) {
  if (!eventId || ctx.event?.id === eventId) return;
  const e = (ctx.events || []).find((x) => x.id === eventId);
  if (!e) return;
  ctx.event = e;
  ctx.charity = await db.one('SELECT id,name,slug,mission,brand_color,(logo_data IS NOT NULL) has_logo,is_demo FROM charities WHERE id=$1', [e.charity_id]);
  ctx.setCookies.push(`ev=${e.id}; Path=/; Secure; SameSite=Lax; HttpOnly; Max-Age=31536000`);
}

// ---------- router ----------
const routes = [];
const app = {
  get: (p, h, o = {}) => routes.push({ m: 'GET', p, h, o }),
  post: (p, h, o = {}) => routes.push({ m: 'POST', p, h, o }),
  db, sec, ui, access, fail, HttpError, send, redirect, render, binary, readForm, readMultipart, buildContext, loadUser, useEvent,
};
require('./lib/routes-public')(app);
require('./lib/routes-main')(app);
require('./lib/routes-sales')(app);
require('./lib/routes-admin')(app);

function match(method, pathname) {
  for (const r of routes) {
    if (r.m !== method) continue;
    if (typeof r.p === 'string') { if (r.p === pathname) return { r, params: [] }; continue; }
    const m = r.p.exec(pathname); if (m) return { r, params: m.slice(1) };
  }
  return null;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const ctx = { req, res, url, setCookies: [], cookies: cookies(req), params: [] };
  try {
    if (url.pathname === '/health') { await db.q('SELECT 1'); res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (req.method === 'GET' && STATIC[url.pathname]) {
      const file = path.join(PUBLIC, url.pathname.slice(1));
      res.writeHead(200, { ...baseHeaders, 'Content-Type': STATIC[url.pathname] + (STATIC[url.pathname].startsWith('text') ? '; charset=utf-8' : ''), 'Cache-Control': url.search ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' });
      return res.end(fs.readFileSync(file));
    }
    if (!['GET', 'POST', 'HEAD'].includes(req.method)) fail(405, 'That action is not supported.');
    // Cross-site protection: a different Origin is rejected; a blank or "null" Origin is allowed because
    // every signed-in form also carries a session-bound token (checked below).
    if (req.method === 'POST' && req.headers.origin && req.headers.origin !== 'null') {
      let host = ''; try { host = new URL(req.headers.origin).host; } catch { host = 'invalid'; }
      if (host !== req.headers.host) fail(403, 'This form must be submitted from the app itself.');
    }
    ctx.flash = (() => { try { return ctx.cookies.fl ? JSON.parse(ctx.cookies.fl) : null; } catch { return null; } })();
    if (ctx.flash) ctx.setCookies.push('fl=; Path=/; Max-Age=0; Secure; SameSite=Lax');
    ctx.sid = ctx.cookies.sid;
    Object.assign(ctx, await loadUser(ctx.sid));
    ctx.csrf = sec.csrfFor(ctx.sid);
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const found = match(method, url.pathname);
    if (!found) {
      if (!ctx.user) return redirect(ctx, '/login');
      await buildContext(ctx);
      return render(ctx, { title: 'Not found', status: 404, body: ui.empty('We couldn’t find that page', 'It may have moved. Head back to your dashboard.', ui.linkBtn('/', 'Go to dashboard')) });
    }
    const { r, params } = found; ctx.params = params;
    if (!r.o.public) {
      if (!ctx.user) return method === 'GET' ? redirect(ctx, '/login?next=' + encodeURIComponent(url.pathname)) : redirect(ctx, '/login', { kind: 'err', text: 'Please sign in again.' });
      if (method === 'POST') {
        const isMultipart = String(req.headers['content-type'] || '').startsWith('multipart/form-data');
        if (isMultipart) { const mp = await readMultipart(req); ctx.form = mp.fields; ctx.files = mp.files; } else ctx.form = await readForm(req);
        if (!sec.csrfOk(ctx.sid, ctx.form.csrf)) fail(403, 'This page was open too long. Please go back, refresh, and try again.');
        if (ctx.user.readOnly && !r.o.viewAsOk) fail(403, 'You are viewing as another person in read-only mode. Exit “View as” to make changes.');
      }
      await buildContext(ctx);
    }
    await r.h(ctx);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('Request failed:', req.method, url.pathname, e.code || '', e.message);
    if (res.headersSent) return res.end();
    const msg = e instanceof HttpError ? e.message : 'Something went wrong on our side. Nothing was lost — please try again.';
    // For form posts, go back to the page with a clear message instead of a dead-end screen.
    const back = req.headers.referer && (() => { try { const r = new URL(req.headers.referer); return r.host === req.headers.host ? r.pathname + r.search : ''; } catch { return ''; } })();
    if (req.method === 'POST' && back && status !== 500) return redirect(ctx, back, { kind: 'err', text: msg });
    if (ctx.user && !ctx.events) { try { await buildContext(ctx); } catch { /* ignore */ } }
    const body = ui.empty(status === 403 ? 'Not available' : 'That didn’t work', msg, ui.linkBtn('/', 'Back to dashboard'));
    send(ctx, status, ctx.user && ctx.events ? ui.shell(ctx, { title: 'Problem', body }) : ui.page({ title: 'Problem', bare: true, body: `<main class="auth"><div class="auth-card">${body}</div></main>` }));
  }
}

module.exports = { handle, app };
if (require.main === module) {
  db.migrate().then(() => {
    http.createServer(handle).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Cactus Charity Tables v3 listening'));
  }).catch((e) => { console.error('Database setup failed:', e.message); process.exit(1); });
}
