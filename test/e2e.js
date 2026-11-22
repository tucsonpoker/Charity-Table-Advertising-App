// Full browser walkthrough (28 checks) against a running copy of the app with a fresh test database.
// Needs: npm i --no-save playwright && npx playwright install chromium
// Run:   BASE=http://localhost:4000 PSQL="psql <connection>" node test/e2e.js
// Uses the seeded demo charity and BOOTSTRAP_ADMIN_EMAIL=admin@test.local / BOOTSTRAP_ADMIN_PASSWORD=AdminPass12345.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const B = process.env.BASE || 'http://localhost:4000';
const PSQL = process.env.PSQL || 'psql -h /tmp -p 5433 -U postgres app';
const SHOTS = process.env.SHOTS || '/tmp/shots';
require('fs').mkdirSync(SHOTS, { recursive: true });
const creds = Object.fromEntries(execSync(`${PSQL} -At -c "select email,password from demo_credentials"`).toString().trim().split('\n').map(l => l.split('|')));
const fs = require('fs');
const log = (...a) => console.log(...a);
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('pass:', m); };
async function ctxFor(browser, mobile = true) { return browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1360, height: 900 } }); }
async function login(page, email, pw, slug = '') { await page.goto(B + (slug ? '/c/' + slug : '/login')); await page.fill('input[name=email]', email); await page.fill('input[name=password]', pw); await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]); }
const shot = async (p, n, full = true) => { await p.waitForTimeout(1200); return p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full }); };
(async () => {
  execSync(`${PSQL} -q -c "INSERT INTO charities(id,name,slug) VALUES('11111111-1111-1111-1111-111111111111','Other Charity','other') ON CONFLICT DO NOTHING; INSERT INTO events(id,charity_id,name) VALUES('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Other Night') ON CONFLICT DO NOTHING; INSERT INTO tables(id,event_id,label,kind) VALUES('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','Other T','center') ON CONFLICT DO NOTHING; INSERT INTO events(id,charity_id,name) SELECT '55555555-5555-5555-5555-555555555555',id,'Demo Second Event' FROM charities WHERE slug='demo' ON CONFLICT DO NOTHING; INSERT INTO tables(id,event_id,label,kind) VALUES('66666666-6666-6666-6666-666666666666','55555555-5555-5555-5555-555555555555','Second T','center') ON CONFLICT DO NOTHING;"`);
  const browser = await chromium.launch();
  const errors = [];
  // ---- Volunteer Marcus on phone
  let c = await ctxFor(browser); let p = await c.newPage();
  p.on('console', m => m.type() === 'error' && errors.push(m.text())); p.on('pageerror', e => errors.push(e.message));
  await p.goto(B + '/c/demo'); await shot(p, '01-login-branded', false);
  await login(p, 'marcus@demo.cactuspoker.app', creds['marcus@demo.cactuspoker.app'], 'demo');
  ok(p.url() === B + '/', 'marcus lands on dashboard'); await p.waitForTimeout(1300); await shot(p, '02-home-volunteer');
  ok(!(await p.content()).includes('/team"'), 'volunteer has no Team link');
  await p.goto(B + '/tables'); await shot(p, '03-tables');
  await p.click('.tcard >> nth=0'); await p.waitForLoadState(); await shot(p, '04-table-detail');
  // sell available space 3 below asking
  await p.click('a.seg >> nth=2'); await p.waitForLoadState(); await shot(p, '05-position-sell');
  await p.fill('input[name=company]', 'Tucson Tacos'); await p.fill('input[name=phone]', '520-555-0101'); await p.fill('input[name=price]', '200');
  await Promise.all([p.waitForNavigation(), p.click('form[action$="/sell"] button')]);
  ok((await p.content()).includes('awaiting') || (await p.content()).includes('waiting for the charity lead'), 'below-asking sale goes to approval');
  // sell space 4 at asking
  await p.goto(B + '/tables'); await p.click('.tcard >> nth=0'); await p.click('a.seg >> nth=3');
  await p.fill('input[name=company]', 'Desert Dog Grooming'); await p.fill('input[name=email]', 'hi@dog.test');
  await Promise.all([p.waitForNavigation(), p.click('form[action$="/sell"] button')]);
  ok(p.url().includes('celebrate=1') || (await p.content()).includes('confetti'), 'full-price sale celebrates'); await p.waitForTimeout(600); await shot(p, '06-sold-celebrate', false);
  // upload tiny artwork
  const tiny = '/tmp/tiny.png'; execSync(`convert -size 120x60 xc:'#c00' ${tiny}`);
  await p.setInputFiles('input[name=art]', tiny); await Promise.all([p.waitForNavigation(), p.click('form[action$="/artwork"] button')]);
  ok((await p.content()).includes('Too small'), 'small artwork flagged');
  await Promise.all([p.waitForNavigation(), p.click('form[action$="/artlink"] button')]);
  const artLink = await p.inputValue('#lnk').catch(() => ''); ok(/\/art\/[a-f0-9]{64}$/.test(artLink), 'sponsor upload link created'); await shot(p, '07-position-sold');
  // sponsors
  await p.goto(B + '/sponsors'); await shot(p, '08-sponsors');
  await p.click('text=Cleveland Family Dental'); await p.waitForLoadState();
  await p.fill('textarea[name=body]', 'MARCUS SECRET NOTE'); await Promise.all([p.waitForNavigation(), p.click('form[action$="/note"] button')]);
  await p.fill('input[name=due]', '2026-12-01T10:30'); await Promise.all([p.waitForNavigation(), p.click('form[action$="/reminder"] button')]);
  ok((await p.content()).includes('MARCUS SECRET NOTE'), 'author sees own private note'); await shot(p, '09-sponsor-detail');
  const calHref = await p.getAttribute('a[data-cal-preview]', 'href'); ok(calHref && !calHref.includes('SECRET') && !calHref.includes('520'), 'calendar link has no notes/contact');
  await p.goto(B + '/my'); await shot(p, '10-my-list');
  await p.goto(B + '/more'); await shot(p, '11-more', false);
  // ---- Priya must not see Marcus private note
  const c2 = await ctxFor(browser); const p2 = await c2.newPage();
  await login(p2, 'priya@demo.cactuspoker.app', creds['priya@demo.cactuspoker.app']);
  await p2.goto(B + '/sponsors'); await p2.click('text=Cleveland Family Dental'); await p2.waitForLoadState();
  const h2 = await p2.content(); ok(!h2.includes('MARCUS SECRET') && !h2.includes('My neighbor'), 'teammate cannot see private note'); ok(h2.includes('Interested in a center'), 'teammate sees shared note');
  // priya cannot open other charity's event via switch
  const r = await p2.request.get(B + '/tables/33333333-3333-3333-3333-333333333333'); ok(r.status() === 404, 'cross-charity table blocked (' + r.status() + ')'); const r3 = await p2.request.get(B + '/tables/66666666-6666-6666-6666-666666666666'); ok(r3.status() === 404, 'same-charity other-event blocked for non-member (' + r3.status() + ')');
  const r2 = await p2.request.post(B + '/team/invite', { form: { email: 'x@y.com' } }); ok(r2.status() === 403, 'POST without CSRF blocked (' + r2.status() + ')');
  // ---- Sponsor upload via link (no account), big image
  const c3 = await ctxFor(browser); const p3 = await c3.newPage();
  const big = '/tmp/big.png'; execSync(`convert -size 2400x1200 gradient:'#123'-'#9cf' ${big}`);
  await p3.goto(artLink.replace(/^https:\/\/[^/]+/, B)); await shot(p3, '12-sponsor-upload', false); await p3.setInputFiles('input[name=art]', big); await Promise.all([p3.waitForNavigation(), p3.click('button[type=submit]')]);
  ok((await p3.content()).includes('Initial quality check passed'), 'sponsor big upload passes check');
  // ---- Lead (desktop)
  const c4 = await ctxFor(browser, false); const p4 = await c4.newPage(); p4.on('pageerror', e => errors.push(e.message));
  await login(p4, 'lead@demo.cactuspoker.app', creds['lead@demo.cactuspoker.app']); await p4.waitForTimeout(1300); await shot(p4, '13-home-lead-desktop');
  await p4.goto(B + '/approvals'); await p4.click('text=Tucson Tacos'); await Promise.all([p4.waitForNavigation(), p4.click('form[action$="/approve"] button')]);
  ok((await p4.content()).includes('Price approved'), 'lead approves discounted price');
  await p4.goto(B + '/team'); await p4.fill('input[name=email]', 'newvol@test.local'); await Promise.all([p4.waitForNavigation(), p4.click('form[action="/team/invite"] button')]);
  const inv = await p4.inputValue('#sl'); ok(inv.includes('/join?token='), 'invite link created'); await shot(p4, '14-team-desktop');
  await p4.goto(B + '/tables'); await p4.click('.tcard >> nth=1'); await p4.click('text=Submit for production'); await p4.waitForLoadState(); await shot(p4, '15-submit-unsold');
  await p4.check('input[name=ack]'); await Promise.all([p4.waitForNavigation(), p4.click('form[action$="/submit"] button')]);
  ok((await p4.content()).includes('locked'), 'table locked after submit');
  const tableUrl = p4.url();
  // ---- Invite join flow (new phone)
  const c5 = await ctxFor(browser); const p5 = await c5.newPage();
  await p5.goto(inv.replace(/^https:\/\/[^/]+/, B)); await shot(p5, '16-join', false);
  await p5.fill('input[name=name]', 'Nina'); await p5.fill('input[name=password]', 'correct horse battery'); await Promise.all([p5.waitForNavigation(), p5.click('button[type=submit]')]);
  ok((await p5.content()).includes('full name'), 'join requires full name');
  await p5.fill('input[name=name]', 'Nina Gomez'); await p5.fill('input[name=password]', 'correct horse battery'); await Promise.all([p5.waitForNavigation(), p5.click('button[type=submit]')]);
  ok(p5.url().endsWith('/welcome'), 'join signs in and shows welcome'); await shot(p5, '17-welcome');
  const again = await c5.request.get(inv.replace(/^https:\/\/[^/]+/, B)); ok((await again.text()).includes('can’t be used'), 'invite single-use');
  // ---- Admin
  const c6 = await ctxFor(browser, false); const p6 = await c6.newPage(); p6.on('pageerror', e => errors.push(e.message));
  await login(p6, 'admin@test.local', 'AdminPass12345'); await p6.goto(B + '/admin'); await shot(p6, '18-admin');
  // switch to demo event and upload proof
  await p6.goto(tableUrl); ok(p6.url() === tableUrl, 'admin can open demo table');
  const proof = '/tmp/proof.png'; execSync(`convert -size 800x400 xc:'#ddd' ${proof}`);
  await p6.setInputFiles('input[name=proof]', proof); await Promise.all([p6.waitForNavigation(), p6.click('form[action$="/proof"] button')]);
  await p4.goto(tableUrl); await shot(p4, '19-proof-for-lead'); await Promise.all([p4.waitForNavigation(), p4.click('text=I approve')]);
  p6.on('dialog', d => d.accept());
  await p6.goto(tableUrl); await Promise.all([p6.waitForNavigation(), p6.click('text=Authorize production')]);
  ok((await p6.content()).includes('In production'), 'production authorized'); await shot(p6, '20-production');
  // view as marcus
  await p6.goto(B + '/admin'); await p6.fill('#uq', 'marcus'); await Promise.all([p6.waitForNavigation(), p6.click('#u-list li:not([hidden]) form[action="/admin/view-as"] button')]);
  ok((await p6.content()).includes('Viewing as'), 'view-as banner'); await shot(p6, '21-viewas');
  await p6.goto(B + '/sponsors'); await p6.click('text=Cleveland Family Dental'); await p6.waitForLoadState();
  ok(!(await p6.content()).includes('MARCUS SECRET'), 'view-as hides private notes');
  await p6.fill('textarea[name=body]', 'should fail'); await Promise.all([p6.waitForNavigation(), p6.click('form[action$="/note"] button')]);
  ok((await p6.content()).includes('read-only'), 'view-as is read-only');
  // recover flow
  const c7 = await ctxFor(browser); const p7 = await c7.newPage(); await p7.goto(B + '/recover'); await p7.fill('input[name=email]', 'priya@demo.cactuspoker.app'); await Promise.all([p7.waitForNavigation(), p7.click('button[type=submit]')]); ok((await p7.content()).includes('Request sent'), 'recovery request');
  await p4.goto(B + '/team'); await Promise.all([p4.waitForNavigation(), p4.click('form[action="/team/reset"] button')]); const rl = await p4.inputValue('#sl');
  await p7.goto(rl.replace(/^https:\/\/[^/]+/, B)); await p7.fill('input[name=password]', 'brand new password 1'); await Promise.all([p7.waitForNavigation(), p7.click('button[type=submit]')]); ok(p7.url() === B + '/', 'password reset signs in');
  await p.goto(B + '/'); await p.waitForTimeout(1300); await shot(p, '22-home-after');
  ok(errors.length === 0, 'no browser JS errors ' + JSON.stringify(errors.slice(0, 3)));
  console.log('FAILS', fails); await browser.close();
})().catch(e => { console.error('CRASH', e); process.exit(1); });
