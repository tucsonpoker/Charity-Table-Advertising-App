// Checks for the 2026-11-21 audit fixes. Run after test/e2e.js setup (same environment variables).
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const http = require('http');
const B = process.env.BASE || 'http://localhost:4000';
const PSQL = process.env.PSQL || 'psql -h /tmp -p 5433 -U postgres app';
const sql = (q) => execSync(`${PSQL} -At -c "${q}"`).toString().trim();
const creds = Object.fromEntries(sql('select email,password from demo_credentials').split('\n').map((l) => l.split('|')));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('pass:', m); };
const raw = (cookie) => new Promise((r) => { const u = new URL(B); http.get({ host: u.hostname, port: u.port, path: '/login', headers: { cookie } }, (res) => { res.resume(); res.on('end', () => r(res.statusCode)); }).on('error', () => r(0)); });
async function login(p, email, pw) { await p.goto(B + '/login'); await p.fill('input[name=email]', email); await p.fill('input[name=password]', pw); await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]); }
(async () => {
  ok((await raw('sid=%')) === 200 && (await raw('sid=%')) === 200 && (await raw('x=%E0%A4%A')) === 200, 'broken cookie does not crash server');
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage();
  await login(p, 'lead@demo.cactuspoker.app', creds['lead@demo.cactuspoker.app']);
  ok((await p.content()).includes('Net so far'), 'lead sees money card');
  const css = await p.$eval('link[rel=stylesheet]', (l) => l.getAttribute('href'));
  ok(/\?v=[0-9a-f]{10}$/.test(css), 'stylesheet has content fingerprint');
  const before = Number(sql("select count(*) from tables t join events e on e.id=t.event_id join charities c on c.id=e.charity_id where c.slug='demo'"));
  await p.goto(B + '/tables/new');
  ok(await p.$eval('select[name=kind]', (s) => s.value) === 'platinum', 'defaults to Platinum');
  await p.selectOption('select[name=count]', '12');
  await Promise.all([p.waitForNavigation(), p.click('form[action="/tables/new"] button')]);
  const after = Number(sql("select count(*) from tables t join events e on e.id=t.event_id join charities c on c.id=e.charity_id where c.slug='demo'"));
  ok(after - before === 12, '12 tables added in one save');
  ok(Number(sql("select count(*) from positions p join tables t on t.id=p.table_id where t.label='Table 15'")) === 11, 'new platinum table has 10 edges + center');
  await p.goto(B + '/tables/new');
  await p.selectOption('select[name=kind]', 'center');
  ok(await p.$eval('select[name=center_parts]', (s) => s.closest('[hidden]') !== null), 'center split hidden for Center only');
  await p.selectOption('select[name=kind]', 'platinum'); await p.selectOption('select[name=center_parts]', '2');
  ok(await p.$eval('input[name=piece_price]', (i) => i.required && !i.closest('[hidden]')), 'split center asks for a price');
  await p.fill('input[name=piece_price]', '750');
  await Promise.all([p.waitForNavigation(), p.click('form[action="/tables/new"] button')]);
  ok(sql("select string_agg(distinct asking_cents::text, ',') from positions where code like 'CENTER-%' and table_id=(select id from tables order by created_at desc limit 1)") === '75000', 'split center uses the price entered');
  // still available = sum of asking for available spaces
  await p.goto(B + '/');
  const avail = Number(sql("select coalesce(sum(asking_cents),0) from positions p join tables t on t.id=p.table_id join events e on e.id=t.event_id join charities c on c.id=e.charity_id where c.slug='demo' and e.name='Poker Night' and p.status='available'")) / 100;
  ok((await p.content()).includes('$' + avail.toLocaleString('en-US') + ' still available'), 'still available matches unsold asking prices');
  // renamed text file refused
  const pid = sql("select p.id from positions p join tables t on t.id=p.table_id where t.label='Table 15' and p.code='P1'");
  const sold = sql("select p.id from positions p join tables t on t.id=p.table_id join events e on e.id=t.event_id join charities c on c.id=e.charity_id where c.slug='demo' and p.status='sold' and t.stage='open' limit 1");
  await p.goto(B + '/position/' + (sold || pid));
  const fake = '/tmp/fake.png'; require('fs').writeFileSync(fake, 'this is just text');
  const up = await p.$('input[type=file][name=art]');
  if (up) { await up.setInputFiles(fake); await Promise.all([p.waitForNavigation(), p.click('form[action$="/artwork"] button')]); ok((await p.content()).includes('doesn’t look like a real image'), 'renamed text file refused'); }
  else ok(false, 'artwork upload form found');
  // lockout: wrong password from another device does not lock the real owner
  const c2 = await b.newContext(); const q = await c2.newPage();
  for (let i = 0; i < 9; i++) { await q.goto(B + '/login'); await q.fill('input[name=email]', 'priya@demo.cactuspoker.app'); await q.fill('input[name=password]', 'wrong-password'); await Promise.all([q.waitForNavigation(), q.click('button[type=submit]')]); }
  ok((await q.content()).includes('Too many attempts'), 'guessing device gets locked');
  const c3 = await b.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.9' } }); const r = await c3.newPage();
  await login(r, 'priya@demo.cactuspoker.app', creds['priya@demo.cactuspoker.app']);
  ok(r.url() === B + '/', 'real owner on another device can still sign in');
  ok(!(await r.content()).includes('Net so far'), 'volunteer does not see money card');
  await b.close();
  console.log('FAILS', fails); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
