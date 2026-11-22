'use strict';
const fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'redesign.css'),'utf8');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function navigation(user){return '<nav aria-label="Main navigation"><a href="/">Dashboard</a><a href="/events">Sell advertising</a><a href="/sponsors">Sponsors</a><a href="/workspace">My follow-ups</a>'+(user&&user.role!=='sales'?'<a href="/charities">Manage events</a><a href="/team">Team</a>':'')+'<a class="account-link" href="/password">Account</a><button type="button" class="install-help save-phone" aria-expanded="false" aria-controls="phone-help">Save to phone</button><form method="post" action="/logout"><button>Sign out</button></form></nav>'}
function header(user){return '<header><div class="brand"><span class="brand-mark" aria-hidden="true">C</span><div><strong>Cactus Promotions</strong><small>Charity sponsorships</small></div></div>'+(user?navigation(user):'')+'</header>'}
const help='<aside id="phone-help" hidden><h2>Your workspace, one tap away</h2><p>iPhone: in Safari, open Share and choose Add to Home Screen. Android: use your browser menu to choose Add to Home screen or Install app, when offered.</p><p>Saving an icon and saving your password are separate actions. Your phone controls password saving.</p><button class="close-help" type="button">Close</button></aside>';
function transform(html,context={}){
 if(typeof html!=='string'||!html.toLowerCase().includes('<!doctype html>'))return html;
 const inferred=html.includes('<nav>')||html.includes('href="/workspace"');
 const user=context.user||(inferred?{role:/CACTUS ·/.test(html)?'cactus':/MANAGER ·/.test(html)?'manager':'sales'}:null);
 html=html.replace(/<header>[\s\S]*?<\/header>/,header(user));
 // Inline the app stylesheet: legacy workspace CSP did not permit external CSS.
 const assets='<style data-design="cactus-v3">'+css+'</style><script src="/app-design.js" defer></script>';
 html=html.includes('</head>')?html.replace('</head>',assets+'</head>'):html.replace('<header>',assets+'<header>');
 html=html.replace(/<main(?:\s[^>]*)?>/,'<main id="main-content" tabindex="-1">'+(user?help:''));
 html=html.replace('<header>','<a class="skip-link" href="#main-content">Skip to main content</a><header>');
 return html;
}
function page(user,title,content){return transform('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#123e33"><title>'+esc(title)+' · Cactus Promotions</title></head><body><header></header><main>'+content+'</main><footer>Cactus Promotions · A little table space. A bigger difference.</footer></body></html>',{user})}
function asset(req,res){const p=new URL(req.url,'http://localhost').pathname;if(p!=='/app-design.js')return false;if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return true}res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=120'});res.end(req.method==='HEAD'?undefined:fs.readFileSync(path.join(__dirname,'app-design.js')));return true}
module.exports={transform,page,asset,esc};
