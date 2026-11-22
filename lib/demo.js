'use strict';
// Creates ONE demo charity (lead + two volunteers + sample event and tables) the first time the app starts.
// Demo sign-in details are random and visible only to Cactus administrators on the Admin page.
// Runs once; if the demo charity exists it does nothing. Never touches real charities.
const crypto = require('node:crypto');
const { hashPassword } = require('./security');

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c4dff"/><stop offset="1" stop-color="#4527a0"/></linearGradient></defs><circle cx="60" cy="60" r="56" fill="url(#g)"/><path d="M60 26c6 10 18 14 18 30a18 18 0 0 1-36 0c0-16 12-20 18-30z" fill="#fff"/><path d="M38 84h44" stroke="#ffd54f" stroke-width="6" stroke-linecap="round"/><circle cx="60" cy="58" r="6" fill="#7c4dff"/></svg>`;

const pw = () => crypto.randomBytes(9).toString('base64url');

async function seed({ q, one, uid, tx }) {
  if (await one('SELECT 1 FROM charities WHERE is_demo=true')) return;
  const people = [
    { label: 'Charity lead', name: 'Dana Rivera', email: 'lead@demo.cactuspoker.app', role: 'manager' },
    { label: 'Volunteer', name: 'Marcus Lee', email: 'marcus@demo.cactuspoker.app', role: 'sales' },
    { label: 'Volunteer', name: 'Priya Shah', email: 'priya@demo.cactuspoker.app', role: 'sales' },
  ];
  for (const p of people) if (await one('SELECT 1 FROM users WHERE email=$1', [p.email])) return; // never collide with real accounts
  await tx(async (t) => {
    const cid = uid(), eid = uid();
    await t.q(`INSERT INTO charities(id,name,slug,mission,brand_color,logo_mime,logo_data,is_demo) VALUES($1,$2,'demo',$3,'#5e35b1','image/svg+xml',$4,true)`,
      [cid, 'Desert Bloom Children’s Fund (Demo)', 'Music and art programs for Tucson kids.', Buffer.from(LOGO)]);
    await t.q(`INSERT INTO events(id,charity_id,name,event_date,deadline,venue) VALUES($1,$2,'Poker Night','2027-02-10','2026-12-20','Tucson')`, [eid, cid]);
    const ids = {};
    for (const p of people) {
      const id = uid(), password = pw(); ids[p.email] = id;
      await t.q('INSERT INTO users(id,email,password_hash,name,role,charity_id) VALUES($1,$2,$3,$4,$5,$6)', [id, p.email, hashPassword(password), p.name, p.role, cid]);
      await t.q('INSERT INTO event_members(event_id,user_id) VALUES($1,$2)', [eid, id]);
      await t.q('INSERT INTO demo_credentials(email,password,label) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET password=EXCLUDED.password', [p.email, password, p.label + ' — ' + p.name]);
    }
    const lead = ids[people[0].email], marcus = ids[people[1].email], priya = ids[people[2].email];
    const tables = [];
    for (const [label, kind, parts] of [['Table 1', 'platinum', 1], ['Table 2', 'platinum', 2], ['Table 3', 'center', 1]]) {
      const tid = uid(); tables.push(tid);
      await t.q('INSERT INTO tables(id,event_id,label,kind,center_parts) VALUES($1,$2,$3,$4,$5)', [tid, eid, label, kind, parts]);
      const codes = [...(kind === 'platinum' ? Array.from({ length: 10 }, (_, i) => 'P' + (i + 1)) : []), ...(parts === 1 ? ['CENTER'] : Array.from({ length: parts }, (_, i) => 'CENTER-' + (i + 1)))];
      for (const code of codes) await t.q('INSERT INTO positions(id,table_id,code,asking_cents) VALUES($1,$2,$3,$4)', [uid(), tid, code, code.startsWith('P') ? 29900 : parts === 1 ? 199900 : 99900]);
    }
    const sale = async (tid, code, company, contact, seller, cents, status = 'sold') => {
      const sid = uid(), pid = uid();
      await t.q('INSERT INTO sponsors(id,charity_id,company,contact,email,phone) VALUES($1,$2,$3,$4,$5,$6)', [sid, cid, company, contact, '', '520-555-01' + String(Math.floor(Math.random() * 90) + 10)]);
      await t.q(`INSERT INTO workspace_prospects(id,event_id,owner_id,company,contact,phone,sponsor_id,stage) VALUES($1,$2,$3,$4,$5,'520-555-0100',$6,'sold')`, [pid, eid, seller, company, contact, sid]);
      await t.q(`UPDATE positions SET status=$1,sponsor_id=$2,prospect_id=$3,seller_id=$4,agreed_cents=$5,needs_approval=$6,sold_at=now() WHERE table_id=$7 AND code=$8`,
        [status, sid, pid, seller, cents, status === 'pending', tid, code]);
      await t.q(`INSERT INTO activity(id,event_id,actor_id,kind,text) VALUES($1,$2,$3,'sale',$4)`, [uid(), eid, seller, (status === 'sold' ? 'sold ' : 'reserved ') + (code === 'CENTER' ? 'the center' : 'space ' + code.slice(1)) + ' on ' + (tid === tables[0] ? 'Table 1' : 'Table 2') + ' to ' + company]);
    };
    await sale(tables[0], 'P1', 'Saguaro Coffee Roasters', 'Ana Torres', marcus, 29900);
    await sale(tables[0], 'P2', 'Mesa Auto Glass', 'Jim Park', priya, 29900);
    await sale(tables[0], 'CENTER', 'Sonoran Credit Union', 'Lena Ortiz', marcus, 199900);
    await sale(tables[1], 'P5', 'Barrio Bread', 'Don Guerra', priya, 25000, 'pending');
    const p1 = uid(), p2 = uid();
    await t.q(`INSERT INTO workspace_prospects(id,event_id,owner_id,company,contact,phone,stage) VALUES($1,$2,$3,'Cleveland Family Dental','Dr. Cleveland','520-555-0142','interested')`, [p1, eid, marcus]);
    await t.q(`INSERT INTO workspace_prospects(id,event_id,owner_id,company,contact,phone,stage) VALUES($1,$2,$3,'Catalina Hardware','Ruth Kim','520-555-0177','new')`, [p2, eid, priya]);
    await t.q(`INSERT INTO workspace_notes(id,prospect_id,author_id,visibility,body) VALUES($1,$2,$3,'shared','Interested in a center space. Asked us to call back Friday.')`, [uid(), p1, marcus]);
    await t.q(`INSERT INTO workspace_notes(id,prospect_id,author_id,visibility,body) VALUES($1,$2,$3,'private','My neighbor — mention the kids’ choir.')`, [uid(), p1, marcus]);
    await t.q(`INSERT INTO workspace_reminders(id,prospect_id,owner_id,title,due_at) VALUES($1,$2,$3,'Call Dr. Cleveland',now()+interval '2 days')`, [uid(), p1, marcus]);
    void lead;
  });
  console.log('Demo charity created (sign-in details on the Admin page).');
}
module.exports = { seed };
