'use strict';
// Database access and additive, idempotent migrations.
// RULE: never DROP or rewrite existing data here. Only CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { hashPassword } = require('./security');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 6,
  ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
});
const q = (text, params = []) => pool.query(text, params);
const one = async (text, params = []) => (await q(text, params)).rows[0] || null;
const all = async (text, params = []) => (await q(text, params)).rows;
const uid = () => crypto.randomUUID();

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn({
      q: (t, p = []) => client.query(t, p),
      one: async (t, p = []) => (await client.query(t, p)).rows[0] || null,
    });
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const statements = [
  // Original (legacy) tables — identical definitions so existing data keeps working.
  `CREATE TABLE IF NOT EXISTS charities(id UUID PRIMARY KEY,name TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS users(id UUID PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('cactus','manager','sales')),charity_id UUID REFERENCES charities(id),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS events(id UUID PRIMARY KEY,charity_id UUID NOT NULL REFERENCES charities(id),name TEXT NOT NULL,event_date DATE,created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS tables(id UUID PRIMARY KEY,event_id UUID NOT NULL REFERENCES events(id),label TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('standard','center','platinum')),center_parts INTEGER NOT NULL DEFAULT 1 CHECK(center_parts IN (1,2,4)),created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sponsors(id UUID PRIMARY KEY,charity_id UUID NOT NULL REFERENCES charities(id),company TEXT NOT NULL,contact TEXT,email TEXT,phone TEXT,created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS positions(id UUID PRIMARY KEY,table_id UUID NOT NULL REFERENCES tables(id),code TEXT NOT NULL,asking_cents INTEGER NOT NULL DEFAULT 0 CHECK(asking_cents>=0),status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','pending','sold')),sponsor_id UUID REFERENCES sponsors(id),seller_id UUID REFERENCES users(id),agreed_cents INTEGER CHECK(agreed_cents>=0),artwork_status TEXT NOT NULL DEFAULT 'needed',created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(table_id,code))`,
  `CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id UUID NOT NULL REFERENCES users(id),expires_at TIMESTAMPTZ NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit(id UUID PRIMARY KEY,actor_id UUID REFERENCES users(id),action TEXT NOT NULL,details TEXT,created_at TIMESTAMPTZ DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS account_links(id UUID PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('invite','reset')),email TEXT NOT NULL,charity_id UUID REFERENCES charities(id),role TEXT NOT NULL DEFAULT 'sales',created_by UUID REFERENCES users(id),used_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS recovery_requests(email TEXT PRIMARY KEY,requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved BOOLEAN NOT NULL DEFAULT false)`,
  `CREATE TABLE IF NOT EXISTS workspace_prospects(id UUID PRIMARY KEY,event_id UUID NOT NULL REFERENCES events(id),owner_id UUID NOT NULL REFERENCES users(id),company TEXT NOT NULL,contact TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS workspace_notes(id UUID PRIMARY KEY,prospect_id UUID NOT NULL REFERENCES workspace_prospects(id),author_id UUID NOT NULL REFERENCES users(id),visibility TEXT NOT NULL CHECK(visibility IN ('private','shared')),body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS workspace_reminders(id UUID PRIMARY KEY,prospect_id UUID NOT NULL REFERENCES workspace_prospects(id),owner_id UUID NOT NULL REFERENCES users(id),title TEXT NOT NULL,due_at TIMESTAMPTZ NOT NULL,done BOOLEAN NOT NULL DEFAULT false)`,

  // v3 additive columns
  `ALTER TABLE charities ADD COLUMN IF NOT EXISTS slug TEXT`,
  `ALTER TABLE charities ADD COLUMN IF NOT EXISTS mission TEXT`,
  `ALTER TABLE charities ADD COLUMN IF NOT EXISTS brand_color TEXT`,
  `ALTER TABLE charities ADD COLUMN IF NOT EXISTS logo_mime TEXT`,
  `ALTER TABLE charities ADD COLUMN IF NOT EXISTS logo_data BYTEA`,
  `ALTER TABLE charities ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false`,
  `CREATE UNIQUE INDEX IF NOT EXISTS charities_slug ON charities(slug) WHERE slug IS NOT NULL`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS deadline DATE`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS venue TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_mime TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_data BYTEA`,
  `ALTER TABLE tables ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'open'`,
  `ALTER TABLE tables ADD COLUMN IF NOT EXISTS stage_note TEXT`,
  `ALTER TABLE positions ADD COLUMN IF NOT EXISTS needs_approval BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE positions ADD COLUMN IF NOT EXISTS artwork_note TEXT`,
  `ALTER TABLE positions ADD COLUMN IF NOT EXISTS filler TEXT`,
  `ALTER TABLE positions ADD COLUMN IF NOT EXISTS filler_text TEXT`,
  `ALTER TABLE positions ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES workspace_prospects(id)`,
  `ALTER TABLE positions ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ`,
  `ALTER TABLE workspace_prospects ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES sponsors(id)`,
  `ALTER TABLE workspace_prospects ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'new'`,
  `ALTER TABLE account_links ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id)`,

  // v3 new tables
  `CREATE TABLE IF NOT EXISTS event_members(event_id UUID NOT NULL REFERENCES events(id),user_id UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(event_id,user_id))`,
  `CREATE TABLE IF NOT EXISTS activity(id UUID PRIMARY KEY,event_id UUID NOT NULL REFERENCES events(id),actor_id UUID REFERENCES users(id),kind TEXT NOT NULL,text TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS activity_event ON activity(event_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS artwork_files(id UUID PRIMARY KEY,position_id UUID NOT NULL REFERENCES positions(id),mime TEXT NOT NULL,filename TEXT NOT NULL DEFAULT '',data BYTEA NOT NULL,width INTEGER,height INTEGER,quality TEXT NOT NULL,uploaded_by UUID REFERENCES users(id),via_link BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS artwork_links(token_hash TEXT PRIMARY KEY,position_id UUID NOT NULL REFERENCES positions(id),created_by UUID REFERENCES users(id),expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS table_proofs(id UUID PRIMARY KEY,table_id UUID NOT NULL REFERENCES tables(id),mime TEXT NOT NULL,data BYTEA NOT NULL,uploaded_by UUID REFERENCES users(id),decision TEXT,decision_note TEXT,decided_by UUID REFERENCES users(id),decided_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS view_as UUID REFERENCES users(id)`,
  `CREATE TABLE IF NOT EXISTS demo_credentials(email TEXT PRIMARY KEY,password TEXT NOT NULL,label TEXT NOT NULL)`,
];

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'charity';
}

async function migrate() {
  for (const s of statements) await q(s);
  // Give existing charities a branded entry link slug.
  for (const c of await all('SELECT id,name FROM charities WHERE slug IS NULL')) {
    let base = slugify(c.name), slug = base, n = 2;
    while (await one('SELECT 1 FROM charities WHERE slug=$1', [slug])) slug = base + '-' + n++;
    await q('UPDATE charities SET slug=$1 WHERE id=$2', [slug, c.id]);
  }
  // Preserve today's access: existing volunteers keep access to their charity's existing events.
  await q(`INSERT INTO event_members(event_id,user_id)
           SELECT e.id,u.id FROM users u JOIN events e ON e.charity_id=u.charity_id
           WHERE u.role='sales' AND NOT EXISTS(SELECT 1 FROM event_members m WHERE m.user_id=u.id)
           ON CONFLICT DO NOTHING`);
  // One sponsor directory: every sold/pending legacy sponsor gets a sponsor record in its event.
  await q(`INSERT INTO workspace_prospects(id,event_id,owner_id,company,contact,email,phone,sponsor_id,stage)
           SELECT DISTINCT ON (t.event_id,s.id) gen_random_uuid(),t.event_id,
             coalesce(p.seller_id,(SELECT id FROM users WHERE role='cactus' ORDER BY created_at LIMIT 1)),
             s.company,coalesce(s.contact,''),coalesce(s.email,''),coalesce(s.phone,''),s.id,'sold'
           FROM positions p JOIN tables t ON t.id=p.table_id JOIN sponsors s ON s.id=p.sponsor_id
           WHERE NOT EXISTS(SELECT 1 FROM workspace_prospects w WHERE w.event_id=t.event_id AND w.sponsor_id=s.id)
             AND coalesce(p.seller_id,(SELECT id FROM users WHERE role='cactus' LIMIT 1)) IS NOT NULL`);
  await q(`UPDATE positions p SET prospect_id=w.id FROM tables t, workspace_prospects w
           WHERE p.prospect_id IS NULL AND p.sponsor_id IS NOT NULL AND t.id=p.table_id AND w.event_id=t.event_id AND w.sponsor_id=p.sponsor_id`);

  if (process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    const n = await one(`SELECT count(*)::int n FROM users WHERE role='cactus'`);
    if (n.n === 0) await q(`INSERT INTO users(id,email,password_hash,name,role) VALUES($1,$2,$3,'Cactus Administrator','cactus')`,
      [uid(), process.env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase().trim(), hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD)]);
  }
  await require('./demo').seed({ q, one, all, uid, tx });
}

// Each charity can have at most this many active volunteers (the charity lead is not counted).
const VOLUNTEER_LIMIT = 12;
async function volunteerCount(charityId, db = { one }, withInvites = false, exceptEmail = '') {
  const a = await db.one(`SELECT count(*)::int n FROM users WHERE charity_id=$1 AND role='sales' AND active`, [charityId]);
  if (!withInvites) return a.n;
  const b = await db.one(`SELECT count(*)::int n FROM account_links WHERE kind='invite' AND role='sales' AND used_at IS NULL AND charity_id=$1 AND (expires_at IS NULL OR expires_at>now()) AND email<>$2`, [charityId, exceptEmail]);
  return a.n + b.n;
}
const LIMIT_MSG = `This team already has ${VOLUNTEER_LIMIT} volunteers (the limit). Deactivate someone or cancel an invitation first.`;

module.exports = { pool, q, one, all, tx, uid, migrate, slugify, VOLUNTEER_LIMIT, volunteerCount, LIMIT_MSG };
