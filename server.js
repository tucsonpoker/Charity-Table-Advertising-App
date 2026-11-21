'use strict';
// Adapt the legacy request handler without changing its inventory and sales code.
const http = require('node:http');
const createServer = http.createServer;
http.createServer = function (handler) {
  http.createServer = createServer;
  const workspace = require('./workspace');
  return createServer.call(http, async (req, res) => {
    try {
      if (await workspace.handle(req, res)) return;
      const end = res.end;
      res.end = function (chunk, ...args) {
        if (typeof chunk === 'string' && chunk.includes('<nav>')) {
          chunk = chunk.replace('<nav>', '<nav><a href="/workspace">My workspace</a>');
        }
        return end.call(this, chunk, ...args);
      };
      return handler(req, res);
    } catch (err) {
      console.error('Workspace request failed', err.code || 'request_error');
      if (!res.headersSent) { res.writeHead(400, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}); res.end('Unable to complete this request. Return to your workspace and try again.'); }
      else res.end();
    }
  });
};
require('./full_app');
