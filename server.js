'use strict';
const http=require('node:http');
const {Pool}=require('pg');
const shell=require('./app-shell');
const {createExperience}=require('./experience');
const {createRelease}=require('./release');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:3,ssl:process.env.PGSSL==='require'?{rejectUnauthorized:false}:undefined});
const experience=createExperience(pool),release=createRelease(pool);
const createServer=http.createServer;
http.createServer=function(handler){
 http.createServer=createServer;
 const workspace=require('./workspace');
 return createServer.call(http,async(req,res)=>{
 try{
 if(shell.asset(req,res))return;
 const u=await experience.user(req);
 const writeHead=res.writeHead;
 res.writeHead=function(status,headers){
 if(headers&&headers['Content-Security-Policy']&&!headers['Content-Security-Policy'].includes('script-src'))headers['Content-Security-Policy']+="; script-src 'self'";
 return writeHead.call(this,status,headers);
 };
 const end=res.end;
 res.end=function(chunk,...args){
 if(typeof chunk==='string'&&chunk.includes('<!doctype html>')){
 if(!chunk.includes('data-design="cactus-v3"'))chunk=shell.transform(chunk,{user:u});
 chunk=chunk.replace(/<div class="hero-art"><svg[\s\S]*?<\/svg><\/div>/g,'');
 chunk=chunk.replace('No accessible event selected. Ask your lead to create an event.','No event is available yet. <a href="/">Open your dashboard to get started.</a>');
 if(!u&&chunk.includes('action="/login"'))chunk=chunk.replace('</main>','<p><a href="/recover">Forgot your password?</a></p></main>');
 chunk=chunk.replace(/(<input\b[^>]*name="email")(?![^>]*autocomplete=)/g,'$1 autocomplete="email"');
 chunk=chunk.replace(/(<input\b[^>]*name="password")(?![^>]*autocomplete=)/g,'$1 autocomplete="current-password"');
 }
 return end.call(this,chunk,...args);
 };
 if(await release.handle(req,res,u))return;
 if(await experience.handle(req,res,u))return;
 if(await workspace.handle(req,res))return;
 return await handler(req,res);
 }catch(e){console.error('Application request failed',e.code||'request_error');if(!res.headersSent){res.writeHead(400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(shell.page(null,'Please try again','<h1>We couldn’t complete that step.</h1><p>Check the form and try again. Your existing records have not been cleared.</p><a class="action" href="/">Return to dashboard</a>'))}else res.end()}
 });
};
require('./full_app');
