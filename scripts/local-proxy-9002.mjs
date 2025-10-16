import http from 'node:http';
import { request as httpsRequest } from 'node:https';

const TARGET_HOST = 'api.labelary.com';
const TARGET_PROTOCOL = 'https:';
const TARGET_PORT = 443;
const LISTEN_PORT = 9002;

function forward(req, res) {
  const options = {
    protocol: TARGET_PROTOCOL,
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: {
      ...req.headers,
      host: TARGET_HOST,
      'x-forwarded-host': req.headers.host || `localhost:${LISTEN_PORT}`,
      'x-forwarded-proto': 'http'
    }
  };

  const proxyReq = httpsRequest(options, proxyRes => {
    // Write status and headers
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Proxy error: ${err.message}`);
  });

  // Pipe body
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  // Health/info endpoints
  if (url === '/' || url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Labelary local proxy online. Use POST /v1/printers/{dpmm}dpmm/labels/{w}x{h}/{orientation}');
    return;
  }

  // Only proxy under /v1/
  if (!url.startsWith('/v1/')) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bad Request: use path starting with /v1/');
    return;
  }

  forward(req, res);
});

server.listen(LISTEN_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Labelary local proxy listening on http://127.0.0.1:${LISTEN_PORT}`);
});


