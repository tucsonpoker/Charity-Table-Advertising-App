'use strict';
const { esc } = require('./security');

const money = (c) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number(c) % 100 ? 2 : 0 }).format(Number(c || 0) / 100);
const ROLE = { cactus: 'Cactus admin', manager: 'Charity lead', sales: 'Volunteer' };
const TZ = 'America/Phoenix';
const fmtDate = (d, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => (d ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(typeof d === 'string' ? d + (d.length === 10 ? 'T00:00:00Z' : '') : d)) : '');
const fmtWhen = (d) => (d ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(d)) : '');
const dateOnly = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : '');
function ago(d) {
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'; if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return fmtWhen(d);
}
const spaceName = (code) => (code === 'CENTER' ? 'Center' : code.startsWith('CENTER-') ? ['', 'Center left', 'Center right', 'Center lower left', 'Center lower right'][Number(code.slice(7))] || code : 'Space ' + code.slice(1));

// Asset version = fingerprint of the CSS and JS files, so every change reaches phones right away.
const ASSET_V = require('crypto').createHash('sha256').update(require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'app.css'))).update(require('fs').readFileSync(require('path').join(__dirname, '..', 'public', 'app.js'))).digest('hex').slice(0, 10);

// Visual polish layer: sits on top of app.css and changes looks only (never layout logic or behavior).
const POLISH = `
body:not(.bare){background:linear-gradient(180deg,rgba(var(--brand-rgb),.24) 0%,#edf2ec 36%,#f4f3ee 100%);background-attachment:fixed}
body:not(.bare)::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(440px 440px at 88% 6%,rgba(var(--brand-rgb),.5),transparent 70%),radial-gradient(380px 380px at 4% 30%,rgba(255,196,87,.42),transparent 70%),radial-gradient(500px 500px at 96% 58%,rgba(var(--brand-rgb),.3),transparent 70%),radial-gradient(420px 420px at 6% 88%,rgba(70,160,200,.26),transparent 70%)}
body:not(.bare)::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Cpath d='M28 0 56 28 28 56 0 28Z' fill='none' stroke='rgba(20,35,28,0.06)'/%3E%3Cpath d='M28 1.2 54.8 28 28 54.8 1.2 28Z' fill='none' stroke='rgba(255,255,255,0.75)' transform='translate(0 1)'/%3E%3Cpath d='M28 23 33 28 28 33 23 28Z' fill='rgba(20,35,28,0.05)'/%3E%3Cpath d='M28 24.2 31.8 28 28 31.8 24.2 28Z' fill='rgba(255,255,255,0.6)' transform='translate(0 1)'/%3E%3C/svg%3E"),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .08 0 0 0 0 .14 0 0 0 0 .1 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");background-size:56px 56px,160px 160px}
.top{background:rgba(250,249,245,.66);border-bottom:1px solid rgba(255,255,255,.7);box-shadow:0 6px 20px -16px rgba(20,35,28,.35)}
.card,.tcard,.empty{background:rgba(255,255,255,.66);-webkit-backdrop-filter:blur(18px) saturate(1.9);backdrop-filter:blur(18px) saturate(1.9);border:1px solid rgba(255,255,255,.85);border-radius:20px;box-shadow:0 1px 0 rgba(255,255,255,.95) inset,0 14px 34px -16px rgba(20,35,28,.26),0 2px 6px rgba(20,35,28,.05)}
.card.attention{background:linear-gradient(180deg,rgba(var(--brand-rgb),.14),rgba(255,255,255,.78) 70%);border-color:rgba(var(--brand-rgb),.32)}
.card.private{background:linear-gradient(180deg,rgba(251,250,246,.9),rgba(255,255,255,.8))}
.hero{border:1px solid rgba(255,255,255,.16);box-shadow:0 26px 50px -22px rgba(var(--brand-rgb),.6),0 1px 0 rgba(255,255,255,.22) inset}
.tcard-art{background:linear-gradient(180deg,rgba(243,241,234,.9),rgba(235,232,223,.9));box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}
.seg-sold path,.seg-sold rect{fill-opacity:.6;stroke:rgba(255,255,255,.78);stroke-width:1.6;stroke-linejoin:round}
.seg-sold{filter:drop-shadow(0 0 7px rgba(var(--brand-rgb),.6))}
.seg-pending path,.seg-pending rect{stroke:rgba(255,255,255,.6);stroke-width:1.4;stroke-linejoin:round}
.rows>li+li{border-top-color:rgba(20,35,28,.08)}
.money-grid div{background:rgba(255,255,255,.7);border-color:rgba(20,35,28,.07)}
.tabs{left:12px;right:12px;bottom:calc(10px + env(safe-area-inset-bottom));padding:6px;border-radius:26px;border:1px solid rgba(255,255,255,.85);background:rgba(255,255,255,.7);-webkit-backdrop-filter:blur(22px) saturate(1.9);backdrop-filter:blur(22px) saturate(1.9);box-shadow:0 20px 40px -16px rgba(20,35,28,.4),0 2px 8px rgba(20,35,28,.08)}
.tabs .tab{border-radius:20px;transition:background .2s,color .2s}
.tabs .tab.on{background:rgba(var(--brand-rgb),.13)}
.content{padding-bottom:calc(var(--tabs-h) + 48px + env(safe-area-inset-bottom))}
.toast{bottom:calc(env(safe-area-inset-bottom) + 98px)}
@media(min-width:900px){.toast{bottom:28px}}
@media(min-width:960px){.side{background:rgba(255,255,255,.66);-webkit-backdrop-filter:blur(20px) saturate(1.7);backdrop-filter:blur(20px) saturate(1.7)}.side .tab{border-radius:14px}.side .tab.on{background:rgba(var(--brand-rgb),.12)}}
.btn-primary{background:linear-gradient(180deg,var(--brand-hi),var(--brand));box-shadow:0 10px 22px -10px rgba(var(--brand-rgb),.75),0 1px 0 rgba(255,255,255,.3) inset}
.btn-soft{background:rgba(var(--brand-rgb),.1);border-color:rgba(var(--brand-rgb),.16)}
.btn-ghost{background:rgba(255,255,255,.6);border-color:rgba(20,35,28,.1)}
.hero .btn-primary{background:#fff;box-shadow:0 8px 20px -10px rgba(0,0,0,.4)}
input:not([type=radio]):not([type=checkbox]):not([type=color]),select,textarea{background-color:rgba(255,255,255,.88);border-color:rgba(20,35,28,.11);box-shadow:0 1px 2px rgba(20,35,28,.04) inset}
.av{box-shadow:0 0 0 2px #fff,0 4px 10px -4px rgba(20,35,28,.35)}
.pill{border:1px solid rgba(20,35,28,.06)}
.pill-sold{border-color:rgba(var(--brand-rgb),.2)}
h1,.page-h{font-weight:800;letter-spacing:-.025em}
.eyebrow{letter-spacing:.1em}
.code{box-shadow:0 2px 6px -2px rgba(20,35,28,.2)}
::selection{background:rgba(var(--brand-rgb),.22)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.card,.tcard,.empty,.tabs{background:rgba(255,255,255,.94)}}
@media(prefers-reduced-transparency:reduce){.card,.tcard,.empty,.tabs,.top{background:#fff;-webkit-backdrop-filter:none;backdrop-filter:none}}
`.replace(/\s*\n\s*/g, '');

// ---- Color: keep brand colors readable (WCAG AA against white text) ----
function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
function theme(hex) {
  let rgb = hexToRgb(hex) || [22, 101, 70];
  let guard = 0;
  while ((1.05 / (lum(rgb) + 0.05)) < 4.6 && guard++ < 40) rgb = rgb.map((v) => Math.round(v * 0.92));
  const h = '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
  const hi = '#' + rgb.map((v) => Math.round(v + (255 - v) * 0.28).toString(16).padStart(2, '0')).join('');
  return `--brand:${h};--brand-rgb:${rgb.join(',')};--brand-hi:${hi}`;
}

// ---- Icons (hand-drawn strokes, 24px grid) ----
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  table: 'M6 5h12a6 6 0 0 1 0 12H6A6 6 0 0 1 6 5zM9 9h6v4H9z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  check: 'M20 6 9 17l-5-5',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  more: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  image: 'M4 5h16v14H4zM4 15l4-4 5 5 3-3 4 4M15 9h.01',
  bell: 'M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  out: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  chev: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  phone: 'M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  share: 'M4 12v7h16v-7M12 3v12M7 8l5-5 5 5',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${P[n] || ''}"/></svg>`;

function avatar(u, size = 'sm') {
  if (!u) return '';
  const initials = String(u.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return u.has_photo
    ? `<img class="av av-${size}" src="/photo/${esc(u.id)}" alt="" loading="lazy">`
    : `<span class="av av-${size}" aria-hidden="true">${esc(initials)}</span>`;
}

const hidden = (ctx) => `<input type="hidden" name="csrf" value="${esc(ctx.csrf)}">`;
function form(ctx, action, inner, { cls = '', multipart = false, confirm = '' } = {}) {
  return `<form method="post" action="${esc(action)}" class="${cls}"${multipart ? ' enctype="multipart/form-data"' : ''}${confirm ? ` data-confirm="${esc(confirm)}"` : ''}>${hidden(ctx)}${inner}</form>`;
}
function field(label, name, { type = 'text', value = '', required = false, hint = '', attrs = '' } = {}) {
  const id = 'f-' + name + '-' + Math.random().toString(36).slice(2, 7);
  return `<div class="field"><label for="${id}">${esc(label)}${required ? '' : ' <span class="opt">optional</span>'}</label><input id="${id}" name="${esc(name)}" type="${type}" value="${esc(value)}"${required ? ' required' : ''} ${attrs}>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
}
function textarea(label, name, { value = '', required = false, attrs = '', hint = '' } = {}) {
  const id = 'f-' + name + '-' + Math.random().toString(36).slice(2, 7);
  return `<div class="field"><label for="${id}">${esc(label)}${required ? '' : ' <span class="opt">optional</span>'}</label><textarea id="${id}" name="${esc(name)}" rows="3"${required ? ' required' : ''} ${attrs}>${esc(value)}</textarea>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
}
function select(label, name, options, value = '', { attrs = '' } = {}) {
  const id = 'f-' + name + '-' + Math.random().toString(36).slice(2, 7);
  return `<div class="field"><label for="${id}">${esc(label)}</label><select id="${id}" name="${esc(name)}" ${attrs}>${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
}
const button = (text, { kind = 'primary', ic = '', attrs = '' } = {}) => `<button class="btn btn-${kind}" ${attrs}>${ic ? icon(ic) : ''}<span>${esc(text)}</span></button>`;
const linkBtn = (href, text, { kind = 'primary', ic = '', attrs = '', cls = '' } = {}) => `<a class="btn btn-${kind}${cls ? ' ' + cls : ''}" href="${esc(href)}" ${attrs}>${ic ? icon(ic) : ''}<span>${esc(text)}</span></a>`;
const pill = (status, text) => `<span class="pill pill-${esc(status)}">${esc(text || status)}</span>`;
const STATUS = { available: 'Available', pending: 'Reserved', sold: 'Sold' };
const ART = { needed: 'Artwork needed', submitted: 'Awaiting review', correction: 'Needs changes', approved: 'Artwork approved' };
const STAGE = { open: 'Selling', submitted: 'Submitted for production', proof: 'Proof ready for lead', approved: 'Lead approved proof', production: 'In production' };
const empty = (title, text, action = '') => `<div class="empty"><div class="empty-art" aria-hidden="true">${icon('star')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

// ---- Live table graphic: continuous edge sections + center, matching the original design ----
let svgSeq = 0;
function tableSVG(positions, kind, { linkBase = '/position/', small = false } = {}) {
  const k = 'g' + (++svgSeq);
  const fill = { available: 'rgba(255,255,255,.07)', pending: `url(#${k}p)`, sold: `url(#${k}s)` };
  const ink = { available: 'rgba(255,255,255,.92)', pending: '#3d2a00', sold: '#fff' };
  const cell = (p, shape, label, x, y) => {
    if (!p) return '';
    const st = p.filler && p.status === 'available' ? 'pending' : p.status;
    const aria = `${spaceName(p.code)}: ${STATUS[p.status]}${p.company ? ', ' + p.company : ''}, asking ${money(p.asking_cents)}`;
    const inner = shape.replace('FILL', fill[st] || fill.available) + `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${ink[st]}" class="t-label${label.length > 3 ? ' t-long' : ''}">${esc(label)}</text>`;
    return small ? `<g class="seg seg-${esc(st)}">${inner}</g>` : `<a href="${linkBase}${esc(p.id)}" class="seg seg-${esc(st)}" aria-label="${esc(aria)}"><title>${esc(aria)}</title>${inner}</a>`;
  };
  const coords = [null, [240, 51, 'M160 16H320V86H160Z'], [400, 51, 'M320 16H480V86H320Z'], [543, 83, 'M480 16Q581 24 619 106L555 140Q535 102 480 86Z'], [591, 170, 'M619 106Q650 170 619 234L555 200Q572 170 555 140Z'], [543, 257, 'M619 234Q581 316 480 324V254Q535 238 555 200Z'], [400, 289, 'M320 254H480V324H320Z'], [240, 289, 'M160 254H320V324H160Z'], [97, 257, 'M160 254V324Q59 316 21 234L85 200Q105 238 160 254Z'], [49, 170, 'M21 234Q-10 170 21 106L85 140Q68 170 85 200Z'], [97, 83, 'M21 106Q59 24 160 16V86Q105 102 85 140Z']];
  let shapes = '';
  if (kind === 'platinum') for (let n = 1; n <= 10; n++) { const p = positions.find((x) => x.code === 'P' + n); const [x, y, d] = coords[n]; shapes += cell(p, `<path d="${d}" fill="FILL"/>`, String(n), x, y); }
  const centers = positions.filter((p) => p.code.startsWith('CENTER')).sort((a, b) => a.code.localeCompare(b.code));
  const inset = kind === 'platinum' ? 0 : -54;
  centers.forEach((p, i) => {
    const cols = centers.length === 1 ? 1 : 2, rows = centers.length > 2 ? 2 : 1;
    const W = 360 - inset * 2 * 1.4, H = 168 - inset * 2, X0 = 140 + inset * 1.4, Y0 = 86 + inset;
    const w = W / cols, h = H / rows, x = X0 + (i % cols) * w, y = Y0 + Math.floor(i / cols) * h;
    shapes += cell(p, `<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="16" fill="FILL"/>`, centers.length === 1 ? 'CENTER' : 'C' + (i + 1), x + w / 2, y + h / 2);
  });
  if (kind === 'standard') shapes = `<text x="320" y="170" text-anchor="middle" dominant-baseline="central" class="t-label t-long" fill="rgba(255,255,255,.7)">No sponsor spaces</text>`;
  const defs = `<defs><clipPath id="${k}c"><rect x="0" y="8" width="640" height="324" rx="162"/></clipPath>
<linearGradient id="${k}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3532"/><stop offset=".5" stop-color="#1c1917"/><stop offset="1" stop-color="#0c0a09"/></linearGradient>
<radialGradient id="${k}f" cx=".5" cy=".45" r=".62"><stop offset="0" stop-color="#2f8a5c"/><stop offset=".7" stop-color="#1d6b45"/><stop offset="1" stop-color="#11482f"/></radialGradient>
<linearGradient id="${k}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--brand-hi)"/><stop offset="1" style="stop-color:var(--brand)"/></linearGradient>
<linearGradient id="${k}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#f6b93b"/></linearGradient></defs>`;
  return `<svg class="poker ${small ? 'poker-sm' : ''}" viewBox="-14 -6 668 352" role="${small ? 'img' : 'group'}" aria-label="${small ? 'Table preview' : 'Advertising spaces. Choose a numbered edge space or the center.'}">${defs}
<rect x="-12" y="-3" width="664" height="346" rx="173" fill="url(#${k}r)"/><rect x="-8" y="0" width="656" height="340" rx="170" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="2"/>
<g clip-path="url(#${k}c)"><rect x="0" y="8" width="640" height="324" rx="162" fill="url(#${k}f)"/>${shapes}</g>
<rect x="0" y="8" width="640" height="324" rx="162" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="3"/></svg>`;
}

// ---- Page layout ----
function nav(ctx, active) {
  const u = ctx.user;
  const items = [['/', 'Home', 'home'], ['/tables', 'Tables', 'table'], ['/sponsors', 'Sponsors', 'users'], ['/my', 'My list', 'list']];
  if (u.role !== 'sales') items.push(['/team', 'Team', 'shield']);
  if (u.role === 'cactus' || ctx.realUser?.role === 'cactus') items.push(['/admin', 'Admin', 'star']);
  const tab = (h, t, i) => `<a href="${h}" class="tab${active === h ? ' on' : ''}"${active === h ? ' aria-current="page"' : ''}>${icon(i)}<span>${t}</span></a>`;
  const mobile = items.filter((x) => ['/', '/tables', '/sponsors', '/my'].includes(x[0])).map((x) => tab(...x)).join('') + tab('/more', 'More', 'more');
  return { side: items.map((x) => tab(...x)).join('') + tab('/profile', 'Profile', 'users'), mobile };
}

function shell(ctx, { title, body, active = '', back = '' }) {
  const u = ctx.user, c = ctx.charity, e = ctx.event;
  const n = nav(ctx, active);
  const brand = c ? `<a class="brand" href="/">${c.has_logo ? `<img src="/logo/${esc(c.id)}" alt="" class="brand-logo">` : `<span class="brand-mark">${esc(c.name[0])}</span>`}<span class="brand-txt"><strong>${esc(c.name)}</strong>${e ? `<small>${esc(e.name)}${e.event_date ? ' · ' + fmtDate(e.event_date, { month: 'short', day: 'numeric' }) : ''}</small>` : ''}</span></a>`
    : `<a class="brand" href="/"><span class="brand-mark">C</span><span class="brand-txt"><strong>Cactus</strong><small>Charity table sponsorships</small></span></a>`;
  const switcher = ctx.events && ctx.events.length > 1
    ? form(ctx, '/switch-event', `<label class="sr" for="evsw">Event</label><select id="evsw" name="event_id" data-autosubmit>${ctx.events.map((x) => `<option value="${esc(x.id)}"${e && x.id === e.id ? ' selected' : ''}>${esc(x.charity_name + ' — ' + x.name)}</option>`).join('')}</select><noscript><button class="btn btn-ghost">Go</button></noscript>`, { cls: 'switch' })
    : '';
  const viewing = ctx.realUser ? `<div class="viewas" role="status">${icon('eye')}<span>Viewing as <strong>${esc(u.name)}</strong> (${ROLE[u.role]}) · read-only</span>${form(ctx, '/admin/view-as/stop', button('Exit', { kind: 'light' }))}</div>` : '';
  const flash = ctx.flash ? `<div class="toast toast-${esc(ctx.flash.kind || 'ok')}" role="status" data-toast>${icon(ctx.flash.kind === 'err' ? 'bell' : 'check')}<span>${esc(ctx.flash.text)}</span></div>` : '';
  return page({ title, theme: c?.brand_color, body: `${viewing}
<div class="app">
  <aside class="side" aria-label="Main">${brand}<nav class="side-nav">${n.side}</nav>
    <div class="side-me">${avatar(u)}<div><strong>${esc(u.name)}</strong><small>${ROLE[u.role]}</small></div></div></aside>
  <div class="main">
    <header class="top">${back ? `<a class="iconbtn" href="${esc(back)}" aria-label="Back">${icon('back')}</a>` : ''}<div class="top-brand">${brand}</div>${switcher}<a class="top-me" href="/profile" aria-label="Your profile">${avatar(u)}</a></header>
    <main id="main" class="content" tabindex="-1">${flash}${body}</main>
  </div>
  <nav class="tabs" aria-label="Main">${n.mobile}</nav>
</div>` });
}

function page({ title, body, theme: t, bare = false }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)} · Cactus Charity Tables</title><meta name="theme-color" content="#0f3d2e"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/icon-180.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Cactus Tables">
<link rel="stylesheet" href="/app.css?v=${ASSET_V}"><style>${POLISH}</style><script src="/app.js?v=${ASSET_V}" defer></script></head>
<body class="${bare ? 'bare' : ''}" style="${theme(t)}"><a class="skip" href="#main">Skip to content</a>${body}</body></html>`;
}

module.exports = { ASSET_V, money, ROLE, STATUS, ART, STAGE, fmtDate, fmtWhen, dateOnly, ago, spaceName, theme, icon, avatar, form, field, textarea, select, button, linkBtn, pill, empty, tableSVG, shell, page, hidden, esc, TZ };
