'use strict';
// Compatibility adapter until the legacy server exports a request handler.
const http = require('node:http');
const shell = require('./app-shell');
const createServer = http.createServer;
http.createServer = function (handler) {
 http.createServer = createServer;
 const workspace = require('./workspace');
 return createServer.call(http, async (req, res) => {
  try {
   if(shell.asset(req,res))return;
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&url.pathname==='/'&&!url.searchParams.has('overview')){
    res.writeHead(303,{Location:'/workspace','Cache-Control':'no-store'});res.end();return;
   }
   const writeHead=res.writeHead;
   res.writeHead=function(status,headers){
    if(headers&&headers['Content-Security-Policy']&&!headers['Content-Security-Policy'].includes('script-src'))headers['Content-Security-Policy']+="; script-src 'self'";
    return writeHead.call(this,status,headers);
   };
   const end=res.end;
   res.end=function(chunk,...args){
    if(typeof chunk==='string'&&chunk.includes('<!doctype html>')){
     chunk=shell.transform(chunk);
    }
    return end.call(this,chunk,...args);
   };
   if(await workspace.handle(req,res))return;
   return await handler(req,res);
  }catch(err){
   console.error('Application request failed',err.code||'request_error');
   if(!res.headersSent){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end('Unable to complete this request. Please return to your dashboard and try again.')}else res.end();
  }
 });
};
require('./full_app');
