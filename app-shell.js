'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assets={
 '/app-design.css':['text/css; charset=utf-8','app-design.css'],
 '/app-design.js':['text/javascript; charset=utf-8','app-design.js']
};
function asset(req,res){
 const item=assets[new URL(req.url,'http://localhost').pathname];
 if(!item)return false;
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return true}
 const body=fs.readFileSync(path.join(__dirname,item[1]));
 res.writeHead(200,{'Content-Type':item[0],'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});
 res.end(req.method==='HEAD'?undefined:body);return true;
}
function transform(html){
 if(typeof html!=='string'||!html.includes('<!doctype html>'))return html;
 const authenticated=html.includes('<nav>')||html.includes('href="/workspace"');
 const lead=/CACTUS ·|MANAGER ·/.test(html);
 const nav=authenticated?'<nav aria-label="Main navigation"><a href="/workspace">My dashboard</a><a href="/sponsors">Sponsors</a><a href="/events">Tables &amp; advertising</a>'+(lead?'<a href="/team">Team settings</a>':'')+'<a href="/password">My account</a><button type="button" class="install-help" aria-expanded="false" aria-controls="phone-help">Save to phone</button><form method="post" action="/logout"><button type="submit">Sign out</button></form></nav>':'';
 html=html.replace(/<nav>[\s\S]*?<\/nav>/,nav);
 if(authenticated&&!html.includes('aria-label="Main navigation"'))html=html.replace('</header>',nav+'</header>');
 const help='<aside id="phone-help" hidden aria-label="Save to phone"><h2>Keep your workspace handy</h2><p>iPhone: open this page in Safari, choose Share, then Add to Home Screen. Android: open your browser menu and choose Add to Home screen or Install app, if offered.</p><p>Your phone may offer to save your password separately. Adding an icon does not save your password.</p><button type="button" class="close-help">Close instructions</button></aside>';
 html=html.replace('<main>','<main id="main-content" tabindex="-1">'+(authenticated?help:''));
 const head='<link rel="stylesheet" href="/app-design.css"><script src="/app-design.js" defer></script><meta name="theme-color" content="#123d32">';
 html=html.includes('</head>')?html.replace('</head>',head+'</head>'):html.replace('<header>',head+'<header>');
 html=html.replace('<header>','<a class="skip-link" href="#main-content">Skip to main content</a><header>');
 return html;
}
module.exports={asset,transform};
