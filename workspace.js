'use strict';
const crypto = require('node:crypto');
const {Pool} = require('pg');
const pool = new Pool({connectionString:process.env.DATABASE_URL,max:3,ssl:process.env.PGSSL==='require'?{rejectUnauthorized:false}:undefined});
const q = (s,p=[]) => pool.query(s,p);
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ready;
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS workspace_prospects(id UUID PRIMARY KEY,event_id UUID NOT NULL REFERENCES events(id),owner_id UUID NOT NULL REFERENCES users(id),company TEXT NOT NULL,contact TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS workspace_notes(id UUID PRIMARY KEY,prospect_id UUID NOT NULL REFERENCES workspace_prospects(id),author_id UUID NOT NULL REFERENCES users(id),visibility TEXT NOT NULL CHECK(visibility IN ('private','shared')),body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await q(`CREATE TABLE IF NOT EXISTS workspace_reminders(id UUID PRIMARY KEY,prospect_id UUID NOT NULL REFERENCES workspace_prospects(id),owner_id UUID NOT NULL REFERENCES users(id),title TEXT NOT NULL,due_at TIMESTAMPTZ NOT NULL,done BOOLEAN NOT NULL DEFAULT false)`);
 await q('CREATE INDEX IF NOT EXISTS workspace_notes_prospect ON workspace_notes(prospect_id)');
 await q('CREATE INDEX IF NOT EXISTS workspace_reminders_owner ON workspace_reminders(owner_id,due_at)');
}
function token(sid){return crypto.createHmac('sha256',sid).update('workspace-v1').digest('hex')}
function page(res,title,content){
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
 res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Charity workspace</title><style>body{margin:0;background:#f3f5ef;color:#163c2d;font:17px system-ui,sans-serif}header{background:#103e2c;color:white;padding:20px}header a{color:white}main{max-width:900px;margin:auto;padding:18px}section{background:white;border:1px solid #c5d1c7;padding:20px;border-radius:14px;margin:16px 0}h1{font-size:1.7rem}h2{font-size:1.2rem}label{display:block;font-weight:600;margin:14px 0}input,select,textarea,button{font:inherit;box-sizing:border-box;border:1px solid #738578;border-radius:8px;padding:12px;width:100%;margin-top:6px}textarea{min-height:100px}button{background:#146342;color:white;cursor:pointer;min-height:48px}a{color:#075f3c}a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid #b05200;outline-offset:3px}.muted{color:#4d6153}.note{white-space:pre-wrap;overflow-wrap:anywhere}.private{border-left:5px solid #7352a1;padding-left:12px}summary{cursor:pointer;padding:12px 0}small{font-size:.9rem}</style></head><body><header><a href="/">Sales dashboard</a> · <a href="/workspace">My workspace</a></header><main><h1>${esc(title)}</h1>${content}</main></body></html>`);
}
function input(label,name,type='text',required=false){return `<label>${esc(label)}<input name="${name}" type="${type}" ${required?'required':''} maxlength="250"></label>`}
function form(action,csrf,fields,label){return `<form method="post" action="${action}"><input type="hidden" name="csrf" value="${csrf}">${fields}<button type="submit">${esc(label)}</button></form>`}
function redirect(res,to){res.writeHead(303,{Location:to,'Cache-Control':'no-store'});res.end()}
async function read(req){let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>20000)throw Error('too large')}return Object.fromEntries(new URLSearchParams(s))}
function calendarLink(r){const d=new Date(r.due_at);const finish=new Date(d.getTime()+30*60000);const fmt=x=>x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');return 'https://calendar.google.com/calendar/render?'+new URLSearchParams({action:'TEMPLATE',text:r.title,dates:fmt(d)+'/'+fmt(finish)}).toString()}
async function handle(req,res){
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/workspace'))return false;
 if(!['GET','POST'].includes(req.method)){res.writeHead(405,{Allow:'GET, POST'});res.end();return true}
 const sid=/(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
 const u=sid?(await q('SELECT u.id,u.name,u.role,u.charity_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>now() AND u.active=true',[sid])).rows[0]:null;
 if(!u){redirect(res,'/login');return true}
 if(!ready)ready=init().catch(e=>{ready=null;throw e});await ready;
 const csrf=token(sid);
 const events=(await q('SELECT id,name FROM events WHERE ($1::text=\'cactus\' OR charity_id=$2::uuid) ORDER BY name',[u.role,u.charity_id])).rows;
 const eventId=url.searchParams.get('event')||events[0]?.id;
 const event=events.find(e=>e.id===eventId);
 if(!event){page(res,'My workspace','<p>No accessible event selected. Ask your lead to create an event.</p>');return true}
 const base='/workspace?event='+encodeURIComponent(event.id);
 const access=async id=>(await q('SELECT p.* FROM workspace_prospects p JOIN events e ON e.id=p.event_id WHERE p.id=$1 AND p.event_id=$2 AND ($3::text=\'cactus\' OR e.charity_id=$4::uuid)',[id,event.id,u.role,u.charity_id])).rows[0];
 if(req.method==='POST'){
  const f=await read(req);
  if(f.csrf!==csrf)throw Error('invalid csrf');
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw Error('invalid origin');
  if(url.pathname==='/workspace/prospect'){
   if(!f.company?.trim()||f.company.length>250)throw Error('company required');
   await q('INSERT INTO workspace_prospects(id,event_id,owner_id,company,contact,email,phone) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),event.id,u.id,f.company.trim(),(f.contact||'').slice(0,250),(f.email||'').slice(0,250),(f.phone||'').slice(0,250)]);
   redirect(res,base);return true;
  }
  if(url.pathname==='/workspace/done'){
   await q('UPDATE workspace_reminders SET done=true WHERE id=$1 AND owner_id=$2 AND prospect_id IN (SELECT id FROM workspace_prospects WHERE event_id=$3)',[f.id,u.id,event.id]);
   redirect(res,base);return true;
  }
  const prospect=await access(f.prospect_id);if(!prospect)throw Error('access denied');
  if(url.pathname==='/workspace/note'){
   if(!f.body?.trim()||f.body.length>5000||!['private','shared'].includes(f.visibility))throw Error('invalid note');
   await q('INSERT INTO workspace_notes(id,prospect_id,author_id,visibility,body) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),prospect.id,u.id,f.visibility,f.body.trim()]);
  }else if(url.pathname==='/workspace/reminder'){
   const due=new Date(f.due);if(!f.title?.trim()||f.title.length>250||!Number.isFinite(due.getTime()))throw Error('invalid reminder');
   await q('INSERT INTO workspace_reminders(id,prospect_id,owner_id,title,due_at) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),prospect.id,u.id,f.title.trim(),due.toISOString()]);
  }else throw Error('unknown action');
  redirect(res,base+'&prospect='+encodeURIComponent(prospect.id));return true;
 }
 const reminders=(await q('SELECT r.*,p.company FROM workspace_reminders r JOIN workspace_prospects p ON p.id=r.prospect_id WHERE r.owner_id=$1 AND p.event_id=$2 AND r.done=false ORDER BY r.due_at',[u.id,event.id])).rows;
 let html=`<p>Welcome, ${esc(u.name)}. Private notes and reminders stay out of the team feed.</p><form method="get"><label>Event<select name="event">${events.map(e=>`<option value="${e.id}" ${e.id===event.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select></label><button>Open event</button></form>`;
 html+='<section><h2>My follow-ups</h2>'+ (reminders.map(r=>`<article><h3>${esc(r.title)}</h3><p>${esc(r.company)} · ${esc(new Date(r.due_at).toISOString())} (UTC)</p><details><summary>Add to Google Calendar</summary><p>Calendar preview: only the reminder title and a 30-minute time slot are sent. Private notes and contact details are not included automatically. Check who can see your calendar before saving.</p><a href="${esc(calendarLink(r))}" rel="noreferrer noopener" target="_blank">Review in Google Calendar (new tab)</a></details>${form('/workspace/done?event='+event.id,csrf,`<input type="hidden" name="id" value="${r.id}">`,'Mark complete')}</article>`).join('')||'<p>No upcoming follow-ups.</p>')+'</section>';
 if(url.searchParams.has('prospect')){
  const p=await access(url.searchParams.get('prospect'));if(!p)throw Error('access denied');
  const notes=(await q("SELECT n.body,n.visibility,n.created_at,u.name FROM workspace_notes n JOIN users u ON u.id=n.author_id WHERE n.prospect_id=$1 AND (n.visibility='shared' OR n.author_id=$2) ORDER BY n.created_at DESC",[p.id,u.id])).rows;
  const hidden=`<input type="hidden" name="prospect_id" value="${p.id}">`;
  html+=`<section><h2>${esc(p.company)}</h2><p>Team-visible contact: ${esc(p.contact)} · ${esc(p.email)} · ${esc(p.phone)}</p><h3>My private notes</h3>${notes.filter(n=>n.visibility==='private').map(n=>`<p class="note private">${esc(n.body)}<br><small>${esc(new Date(n.created_at).toISOString())}</small></p>`).join('')||'<p>No private notes.</p>'}<details><summary>Shared team notes</summary>${notes.filter(n=>n.visibility==='shared').map(n=>`<p class="note">${esc(n.body)}<br><small>${esc(n.name)} · ${esc(new Date(n.created_at).toISOString())}</small></p>`).join('')||'<p>No shared notes.</p>'}</details>${form('/workspace/note?event='+event.id,csrf,hidden+'<label>Note<textarea name="body" maxlength="5000" required></textarea></label><label>Who can see this?<select name="visibility"><option value="private">Only me (private)</option><option value="shared">Event team (shared)</option></select></label>','Save note')}<details><summary>Set a private follow-up</summary>${form('/workspace/reminder?event='+event.id,csrf,hidden+input('Reminder title (may be sent to Google Calendar)','title','text',true)+input('Date and time, including timezone; example: 2026-12-01T09:00:00-07:00','due','text',true),'Save my reminder')}</details></section>`;
 }
 const prospects=(await q('SELECT p.id,p.company,p.owner_id,u.name FROM workspace_prospects p JOIN users u ON u.id=p.owner_id WHERE p.event_id=$1 ORDER BY p.created_at DESC',[event.id])).rows;
 html+='<section><h2>My prospects</h2>'+prospects.filter(p=>p.owner_id===u.id).map(p=>`<p><a href="${base}&amp;prospect=${p.id}">${esc(p.company)}</a></p>`).join('')+'<details><summary>Other event-team prospects</summary>'+prospects.filter(p=>p.owner_id!==u.id).map(p=>`<p><a href="${base}&amp;prospect=${p.id}">${esc(p.company)}</a> · ${esc(p.name)}</p>`).join('')+'</details></section>';
 html+='<section><h2>Add a potential sponsor</h2><p>Contact details are shared with this event team. No seat or advertising space will be reserved.</p>'+form('/workspace/prospect?event='+event.id,csrf,input('Sponsor or company name','company','text',true)+input('Contact full name','contact')+input('Email','email','email')+input('Phone','phone','tel'),'Save prospect')+'</section>';
 page(res,'My workspace · '+event.name,html);return true;
}
module.exports={handle,esc,calendarLink};
