const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');

const POS_URL = process.env.POS_URL || 'http://localhost:3010';

const app = express();
app.use(cors());
app.use(express.json({limit: '50mb'}));
app.use(express.static(__dirname));

function proxy(method, posPath, req, res) {
  const { host, ...cleanHeaders } = req.headers;
  const opts = { method, hostname: 'localhost', port: new URL(POS_URL).port || 3010, path: posPath, headers: cleanHeaders };
  const pr = http.request(opts, (prRes) => {
    let data = '';
    prRes.on('data', c => data += c);
    prRes.on('end', () => {
      res.status(prRes.statusCode);
      for (const [k, v] of Object.entries(prRes.headers)) res.setHeader(k, v);
      try { res.json(JSON.parse(data)); } catch { res.send(data); }
    });
  });
  pr.on('error', () => res.status(502).json({ error: 'POS no disponible' }));
  if (req.body && Object.keys(req.body).length > 0) pr.write(JSON.stringify(req.body));
  pr.end();
}

// Proxy all /api/* routes to POS server
const API_PROXY = ['/api/web-data', '/api/web-save', '/api/save', '/api/web/config', '/api/web/products', '/api/products', '/api/config', '/api/upload-image', '/api/visits/increment', '/api/visits/stats', '/api/visits'];
for (const route of API_PROXY) {
  if (route === '/api/visits/increment') {
    app.post(route, (req, res) => proxy('POST', '/api/visits', req, res));
  } else if (route === '/api/visits/stats') {
    app.get(route, (req, res) => proxy('GET', '/api/visits', req, res));
  } else if (route === '/api/visits') {
    app.get(route, (req, res) => proxy('GET', '/api/visits', req, res));
  } else if (route === '/api/upload-image') {
    app.post(route, (req, res) => proxy('POST', '/api/web/upload-image', req, res));
  } else if (route === '/api/save') {
    app.post(route, (req, res) => proxy('POST', '/api/web-save', req, res));
  } else if (route === '/api/web-save') {
    app.post(route, (req, res) => proxy('POST', '/api/web-save', req, res));
  } else if (route === '/api/web-data') {
    app.get(route, (req, res) => proxy('GET', '/api/web-data', req, res));
  } else if (route === '/api/web/config') {
    app.get(route, (req, res) => proxy('GET', '/api/web/config', req, res));
  } else if (route === '/api/web/products') {
    app.get(route, (req, res) => proxy('GET', '/api/web/products', req, res));
  } else if (route === '/api/products') {
    app.get(route, (req, res) => proxy('GET', '/api/web/products', req, res));
  } else if (route === '/api/config') {
    app.get(route, (req, res) => proxy('GET', '/api/web/config', req, res));
  }
}

// Public repair lookup proxy (dynamic route with :code param)
app.get('/api/repairs/lookup/:code', (req, res) => proxy('GET', '/api/repairs/lookup/' + req.params.code, req, res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('--------------------------------------------------');
    console.log('Web-main proxy iniciado: http://localhost:' + PORT);
    console.log('Proxy hacia POS: ' + POS_URL);
    console.log('--------------------------------------------------');
});
