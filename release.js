'use strict';
const crypto=require('node:crypto');
const {page,esc}=require('./app-shell');
const token=()=>crypto.randomBytes(32).toString('hex');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const hash=p=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(p,salt,64).toString('hex')};
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n||0)/100);
function tableSVG(positions,kind='platinum'){
 const color={available:'#e5efdc',pending:'#ffda77',sold:'#147a4a'};
 const cell=(p,shape,label)=>p?'<a href="/position/'+esc(p.id)+'" aria-label="'+esc(label+' — '+p.status+' — '+money(p.asking_cents))+'"><title>'+esc(label+' · '+p.status+(p.company?' · '+p.company:''))+'</title>'+shape.replaceAll('FILL',color[p.status]||color.available)+'<text text-anchor="middle" dominant-baseline="middle" fill="'+(p.status==='sold'?'white':'#173d2b')+'" font-size="23" font-weight="750">'+esc(label)+'</text></a>':'';
 const coords=[null,[240,42,'M160 16H320V86H160Z'],[400,42,'M320 16H480V86H320Z'],[543,83,'M480 16Q581 24 619 106L555 140Q535 102 480 86Z'],[591,170,'M619 106Q650 170 619 234L555 200Q572 170 555 140Z'],[543,257,'M619 234Q581 316 480 324V254Q535 238 555 200Z'],[400,289,'M320 254H480V324H320Z'],[240,289,'M160 254H320V324H160Z'],[97,257,'M160 254V324Q59 316 21 234L85 200Q105 238 160 254Z'],[49,170,'M21 234Q-10 170 21 106L85 140Q68 170 85 200Z'],[97,83,'M21 106Q59 24 160 16V86Q105 102 85 140Z']];
 let shapes='';
 if(kind==='platinum')for(let n=1;n<=10;n++){const p=positions.find(p=>p.code==='P'+n),[x,y,d]=coords[n];shapes+=cell(p,'<path d="'+d+'" fill="FILL" stroke="#284e37" stroke-width="2"/>',String(n)).replace('<text ','<text x="'+x+'" y="'+y+'" ')}
 const centers=positions.filter(p=>p.code.startsWith('CENTER')).sort((a,b)=>a.code.localeCompare(b.code));
 centers.forEach((p,i)=>{const cols=centers.length===1?1:2,rows=centers.length>2?2:1,w=360/cols,h=168/rows,x=140+(i%cols)*w,y=86+Math.floor(i/cols)*h;shapes+=cell(p,'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="FILL" stroke="#284e37" stroke-width="2"/>',centers.length===1?'CENTER':p.code.replace('CENTER-','CENTER ')).replace('<text ','<text x="'+(x+w/2)+'" y="'+(y+h/2)+'" ')});
 return '<svg viewBox="-10 0 660 340" role="group" aria-label="Live advertising spaces. Select a numbered edge space or center."><defs><clipPath id="felt"><rect x="0" y="8" width="640" height="324" rx="162"/></clipPath></defs><rect x="-6" y="2" width="652" height="336" rx="168" fill="#173d2b"/><g clip-path="url(#felt)"><rect x="0" y="8" width="640" height="324" rx="162" fill="#e5efdc"/>'+shapes+'</g></svg>';
}
function createRelease(pool){
 const q=(s,p=[])=>pool.query(s,p);let ready;
 async function init(){await q(`CREATE TABLE IF NOT EXISTS account_links(id UUID PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('invite','reset')),email TEXT NOT NULL,charity_id UUID REFERENCES charities(id),role TEXT NOT NULL DEFAULT 'sales',created_by UUID REFERENCES users(id),used_at TIMESTAMPTZ,expires_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);await q(`CREATE TABLE IF NOT EXISTS recovery_requests(email TEXT PRIMARY KEY,requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved BOOLEAN NOT NULL DEFAULT false)`)}
 function csrf(req){const sid=/(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1];return sid?crypto.createHmac('sha256',sid).update('release-v1').digest('hex'):''}
 function send(res,u,title,html,status=200){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(page(u,title,html))}
 const field=(label,name,type='text',value='')=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" required maxlength="250" '+(type==='password'?'minlength="12" autocomplete="new-password"':name==='email'?'autocomplete="email"':'')+'></label>';
 const form=(req,action,html,label)=>'<form method="post" action="'+esc(action)+'"><input type="hidden" name="release_csrf" value="'+csrf(req)+'">'+html+'<button>'+esc(label)+'</button></form>';
 async function read(req){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>20000)throw Error('Form too large')}return Object.fromEntries(new URLSearchParams(raw))}
 function redirect(res,to){res.writeHead(303,{Location:to,'Cache-Control':'no-store'});res.end()}
 async function handle(req,res,u){
 const url=new URL(req.url,'http://localhost'),p=url.pathname;
 if(!['/team','/account-link','/join','/recover','/reset'].includes(p)&&!p.startsWith('/table/'))return false;
 if(!ready)ready=init().catch(e=>{ready=null;throw e});await ready;
 if(!['GET','POST'].includes(req.method)){send(res,u,'Method not allowed','<h1>Use the form to continue.</h1>',405);return true}
 if(req.method==='POST'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){send(res,u,'Request blocked','<h1>Open the form in this app and try again.</h1>',403);return true}
 if(p==='/recover'){
 if(req.method==='POST'){const f=await read(req),email=String(f.email||'').trim().toLowerCase();if(email.length<=250&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))await q('INSERT INTO recovery_requests(email) SELECT email FROM users WHERE email=$1 AND active=true ON CONFLICT(email) DO UPDATE SET requested_at=now(),resolved=false WHERE recovery_requests.requested_at<now()-interval \'5 minutes\'',[email]);send(res,null,'Recovery requested','<h1>Recovery request recorded.</h1><p>For an existing account, your charity lead or Cactus administrator can issue a single-use password reset link. Contact your lead to receive it. This app does not send automated recovery emails.</p><a href="/login">Back to sign in</a>');return true}
 send(res,null,'Recover account','<h1>Recover your account</h1><p>Enter your account email. Then contact your charity lead, who can issue your private reset link.</p>'+form(req,'/recover',field('Account email','email','email'),'Request recovery'));return true;
 }
 if(p==='/join'||p==='/reset'){
 const secret=url.searchParams.get('token')||'',kind=p==='/join'?'invite':'reset';
 if(!/^[a-f0-9]{64}$/.test(secret)){send(res,null,'Invalid link','<h1>This link is not valid.</h1><p>Ask your charity lead for the complete personal link.</p>',400);return true}
 const link=(await q('SELECT * FROM account_links WHERE token_hash=$1 AND kind=$2 AND used_at IS NULL AND (expires_at IS NULL OR expires_at>now())',[digest(secret),kind])).rows[0];
 if(!link){send(res,null,'Link unavailable','<h1>This link has already been used or is no longer valid.</h1><p>Ask your charity lead for a new link.</p>',400);return true}
 let error='';
 if(req.method==='POST'){
 const f=await read(req);
 if(String(f.email||'').trim().toLowerCase()!==link.email||!f.password||f.password.length<12||f.password.length>250||(kind==='invite'&&!f.name?.trim()))error='Use the invited email, enter your full name, and choose a password of at least 12 characters.';
 else {const client=await pool.connect();try{await client.query('BEGIN');const locked=(await client.query('SELECT * FROM account_links WHERE id=$1 AND used_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE',[link.id])).rows[0];if(!locked)throw Error('Link unavailable');
 if(kind==='invite'){await client.query('SELECT id FROM charities WHERE id=$1 FOR UPDATE',[link.charity_id]);if(link.role==='sales'){const active=(await client.query("SELECT count(*)::int n FROM users WHERE charity_id=$1 AND role='sales' AND active=true",[link.charity_id])).rows[0].n;if(active>=12)throw Error('Team limit reached')}await client.query('INSERT INTO users(id,email,password_hash,name,role,charity_id) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),link.email,hash(f.password),f.name.trim().slice(0,250),link.role,link.charity_id]);}
 else {const changed=await client.query('UPDATE users SET password_hash=$1 WHERE email=$2 AND active=true RETURNING id',[hash(f.password),link.email]);if(!changed.rowCount)throw Error('Account unavailable');await client.query('DELETE FROM sessions WHERE user_id=$1',[changed.rows[0].id]);await client.query('UPDATE recovery_requests SET resolved=true WHERE email=$1',[link.email]);await client.query("UPDATE account_links SET used_at=now() WHERE email=$1 AND kind='reset' AND used_at IS NULL",[link.email])}
 await client.query('UPDATE account_links SET used_at=now() WHERE id=$1',[link.id]);await client.query('COMMIT');send(res,null,'Account ready','<h1>'+ (kind==='invite'?'Your account is ready.':'Your password has been changed.')+'</h1><p>Your browser or password manager may offer to save your password. The app does not silently save it.</p><a class="action" href="/login">Sign in</a>');return true;
 }catch(e){await client.query('ROLLBACK');error=e.code==='23505'?'An account already uses this email. Sign in or request password recovery.':'The account could not be updated. The link has not been consumed unless it was already used. Try again or contact your lead.'}finally{client.release()}}
 }
 send(res,null,kind==='invite'?'Set up your account':'Reset your password','<h1>'+(kind==='invite'?'Welcome to your charity team.':'Choose a new password.')+'</h1>'+(error?'<p role="alert" class="alert">'+esc(error)+'</p>':'')+'<p>This personal link is for '+esc(link.email)+'. '+(kind==='invite'?'It remains usable until successful account setup.':'It expires one hour after issue.')+'</p>'+form(req,p+'?token='+secret,(kind==='invite'?field('Full name','name'):'')+field('Invited / account email','email','email',link.email)+field('Password — at least 12 characters','password','password'),'Save and continue'));return true;
 }
 if(!u){redirect(res,'/login');return true}
 if(p.startsWith('/table/')){
 if(req.method!=='GET'){send(res,u,'Method not allowed','<h1>This view is read-only.</h1>',405);return true}
 const id=p.split('/')[2];if(!/^[a-f0-9-]{36}$/.test(id)){send(res,u,'Not found','<h1>Table not found.</h1>',404);return true}
 const t=(await q('SELECT t.*,e.charity_id,e.name event FROM tables t JOIN events e ON e.id=t.event_id WHERE t.id=$1',[id])).rows[0];
 if(!t||(u.role!=='cactus'&&t.charity_id!==u.charity_id)){send(res,u,'Not available','<h1>This table is not available to your account.</h1>',403);return true}
 const positions=(await q('SELECT p.*,s.company FROM positions p LEFT JOIN sponsors s ON s.id=p.sponsor_id WHERE p.table_id=$1 ORDER BY p.code',[id])).rows;
 const count=s=>positions.filter(x=>x.status===s).length,gross=positions.filter(x=>x.status==='sold').reduce((a,x)=>a+Number(x.agreed_cents||0),0);
 send(res,u,t.label,'<p><a href="/event/'+t.event_id+'">'+esc(t.event)+' · All tables</a></p><h1>'+esc(t.label)+'</h1><section class="card"><p class="eyebrow">Gross sold revenue</p><div class="metric">'+money(gross)+'</div><div class="stats">'+['available','pending','sold'].map(s=>'<div class="stat"><b>'+count(s)+'</b><span>'+s+'</span></div>').join('')+'</div></section><section class="card"><h2>Select an advertising space</h2>'+(t.kind==='standard'?'<p>This standard table has no advertising inventory.</p>':'<div style="max-width:760px;margin:auto">'+tableSVG(positions,t.kind)+'</div><p>Available: light green · Pending: gold · Sold: dark green. Select a numbered edge section or a center section. The large links below provide the same actions.</p>')+'<div class="grid">'+positions.map(x=>'<a class="quick" href="/position/'+x.id+'">'+esc(x.code.replace('P','Space '))+' · '+esc(x.status)+'<small>'+esc(x.company||'No sponsor')+' · Asking '+money(x.asking_cents)+'</small></a>').join('')+'</div></section><p class="muted">Charity table cost: '+money(t.kind==='standard'?15000:t.kind==='center'?55000:60000)+'. This is a separate expense, not sponsorship revenue.</p>');return true;
 }
 if(u.role==='sales'){send(res,u,'Not permitted','<h1>Only a charity lead can manage account links.</h1>',403);return true}
 if(p==='/account-link'){
 if(req.method!=='POST'){redirect(res,'/team');return true}
 const f=await read(req);if(f.release_csrf!==csrf(req)){send(res,u,'Request blocked','<h1>Refresh the Team page and try again.</h1>',403);return true}
 const kind=f.kind,email=String(f.email||'').trim().toLowerCase();if(!['invite','reset'].includes(kind)||!/^\S+@\S+\.\S+$/.test(email)||email.length>250)throw Error('Valid email required');
 let charity=f.charity_id,role=f.role||'sales';
 if(kind==='reset'){const target=(await q('SELECT id,charity_id,role FROM users WHERE email=$1 AND active=true',[email])).rows[0];if(!target||(u.role!=='cactus'&&(target.charity_id!==u.charity_id||target.role!=='sales')))throw Error('Account unavailable');charity=target.charity_id;role=target.role}
 else {if(!['sales','manager'].includes(role)||(u.role==='manager'&&role!=='sales')||(u.role!=='cactus'&&charity!==u.charity_id))throw Error('Not permitted');const exists=(await q('SELECT id FROM charities WHERE id=$1',[charity])).rows[0];if(!exists)throw Error('Choose a charity');const n=(await q("SELECT count(*)::int n FROM users WHERE charity_id=$1 AND active=true AND role='sales'",[charity])).rows[0].n;if(role==='sales'&&n>=12)throw Error('Maximum 12 active salespeople per charity')}
 const secret=token();await q('INSERT INTO account_links(id,token_hash,kind,email,charity_id,role,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $3=\'reset\' THEN now()+interval \'1 hour\' ELSE NULL END)',[crypto.randomUUID(),digest(secret),kind,email,charity,role,u.id]);
 const host=String(req.headers.host||'');if(!/^[a-zA-Z0-9.:-]+$/.test(host))throw Error('Invalid host');const href='https://'+host+(kind==='invite'?'/join':'/reset')+'?token='+secret;
 send(res,u,'Personal account link','<h1>Your '+(kind==='invite'?'invitation':'password reset')+' link is ready.</h1><p>Send this link privately to '+esc(email)+'. It is shown here only; only a hash is stored in the database.</p><label>Personal link<input readonly value="'+esc(href)+'"></label><p><a href="'+esc(href)+'">Open account setup</a></p><p>Do not share this link with anyone else. '+(kind==='reset'?'It expires after one hour.':'It is consumed only after successful setup.')+'</p><a href="/team">Back to Team</a>');return true;
 }
 const args=u.role==='cactus'?[]:[u.charity_id],where=u.role==='cactus'?'':' WHERE u.charity_id=$1';
 const users=(await q('SELECT u.name,u.email,u.role,c.name charity FROM users u LEFT JOIN charities c ON c.id=u.charity_id'+where+' ORDER BY u.name',args)).rows;
 const charities=(await q('SELECT id,name FROM charities'+(u.role==='cactus'?'':' WHERE id=$1')+' ORDER BY name',args)).rows;
 const requests=(await q('SELECT r.email,r.requested_at FROM recovery_requests r JOIN users u ON u.email=r.email WHERE r.resolved=false'+(u.role==='cactus'?'':" AND u.charity_id=$1 AND u.role='sales'")+' ORDER BY r.requested_at DESC',args)).rows;
 const select='<label>Charity<select name="charity_id" required>'+charities.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('')+'</select></label>';
 send(res,u,'Team','<h1>Your charity team</h1><section class="card"><h2>Invite a volunteer</h2><p>No temporary passwords. Send a personal link; the volunteer enters their own full name and password.</p>'+form(req,'/account-link','<input type="hidden" name="kind" value="invite">'+field('Invited email','email','email')+select+'<label>Role<select name="role"><option value="sales">Volunteer / salesperson</option>'+(u.role==='cactus'?'<option value="manager">Charity lead</option>':'')+'</select></label>','Create personal invitation')+'</section><section class="card"><h2>Account recovery</h2><p>Verify the person’s identity before sending a reset link. Resetting revokes existing signed-in sessions.</p>'+form(req,'/account-link','<input type="hidden" name="kind" value="reset">'+field('Existing account email','email','email'),'Create one-hour reset link')+'<h3>Recovery requests</h3>'+(requests.map(r=>'<p>'+esc(r.email)+' · '+esc(new Date(r.requested_at).toISOString())+'</p>').join('')||'<p>No unresolved requests.</p>')+'</section><section class="card"><h2>Accounts</h2>'+users.map(x=>'<p>'+esc(x.name)+' · '+esc(x.email)+' · '+esc(x.role)+' · '+esc(x.charity||'Cactus administration')+'</p>').join('')+'</section>');return true;
 }
 return {handle};
}
module.exports={createRelease,tableSVG};
