// Checks the 12-volunteer limit (invite, join, reactivate, cancel). Same environment variables as test/e2e.js.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const B = process.env.BASE || 'http://localhost:4000';
const PSQL = process.env.PSQL || 'psql -h /tmp -p 5433 -U postgres app';
const sql = (q) => execSync(`${PSQL} -At -c "${q}"`).toString().trim();
const creds = Object.fromEntries(sql('select email,password from demo_credentials').split('\n').map((l) => l.split('|')));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('pass:', m); };
const CH = "(select id from charities where slug='demo')";
const vols = () => Number(sql(`select count(*) from users where charity_id=${CH} and role='sales' and active`));
async function invite(p, email) { await p.goto(B + '/team'); await p.fill('form[action="/team/invite"] input[name=email]', email); await Promise.all([p.waitForNavigation(), p.click('form[action="/team/invite"] button')]); return p.content(); }
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(B + '/login'); await p.fill('input[name=email]', 'lead@demo.cactuspoker.app'); await p.fill('input[name=password]', creds['lead@demo.cactuspoker.app']);
  await Promise.all([p.waitForNavigation(), p.click('button[type=submit]')]);
  await p.goto(B + '/team');
  ok((await p.content()).includes(`of 12 volunteer spots used`), 'team page shows spots used');
  const start = vols();
  let links = [];
  for (let i = start; i < 12; i++) { const h = await invite(p, `v${i}@test.local`); links.push(h.match(/\/join\?token=([\w-]+)/)[1]); }
  ok((await invite(p, 'extra@test.local')).includes('already has 12 volunteers'), '13th invitation refused');
  // cancel one invitation frees a spot
  await p.goto(B + '/team');
  await Promise.all([p.waitForNavigation(), p.click('form[action="/team/cancel-invite"] button')]);
  ok((await p.content()).includes('Invitation cancelled'), 'invitation can be cancelled');
  const h = await invite(p, 'late@test.local'); const late = h.match(/\/join\?token=([\w-]+)/)[1];
  ok(h.includes('Invitation ready'), 'cancelling frees a spot');
  // fill the team directly, then the late link cannot join
  for (let i = vols(); i < 12; i++) sql(`insert into users(id,email,password_hash,name,role,charity_id) values(gen_random_uuid(),'fill${i}@test.local','x','Fill Person','sales',${CH})`);
  const j = await (await b.newContext()).newPage();
  await j.goto(B + '/join?token=' + late); await j.fill('input[name=name]', 'Late Person'); await j.fill('input[name=password]', 'LongPassword123');
  await Promise.all([j.waitForNavigation(), j.click('button[type=submit]')]);
  ok((await j.content()).includes('This team is full'), 'joining a full team is refused');
  ok(vols() === 12, 'never more than 12 active volunteers');
  // deactivate one, then reactivating another past the limit is refused
  const id = sql(`select id from users where email='fill${11}@test.local' or (charity_id=${CH} and role='sales' and active) order by email desc limit 1`);
  sql(`update users set active=false where id='${id}'`);
  sql(`insert into users(id,email,password_hash,name,role,charity_id) values(gen_random_uuid(),'fillx@test.local','x','Fill Extra','sales',${CH})`);
  const r = await p.request.post(B + '/team/toggle', { form: { user_id: id, csrf: await p.$eval('input[name=csrf]', (i) => i.value).catch(() => '') } });
  ok(r.status() === 400 || (await r.text()).includes('already has 12'), 'reactivating past the limit is refused');
  ok(vols() === 12, 'still 12 after reactivation attempt');
  await b.close();
  console.log(fails ? `${fails} FAILED` : 'all volunteer-limit checks passed'); process.exit(fails ? 1 : 0);
})();
