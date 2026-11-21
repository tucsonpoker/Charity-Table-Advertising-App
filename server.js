const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'));
const port = Number(process.env.PORT || 3000);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/health') {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'});
    return res.end('ok');
  }
  if (pathname !== '/' && pathname !== '/index.html') {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    return res.end('Not found');
  }
  res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
  res.end(html);
});
server.listen(port, '0.0.0.0', () => console.log('Preview listening on '+port));
