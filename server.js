'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DataStore = require('./data-store');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 80);
const APP_USER = process.env.APP_USER || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || 'Bracoffee@2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'bracoffee-change-this-secret-in-coolify';
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 43200); // 12h
const COOKIE_NAME = 'bracoffee_session';
const loginAttempts = new Map();
const store = new DataStore(process.env.DATA_DIR || path.join(ROOT, 'data'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2'
};

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}
function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
function makeSession(user) {
  const payload = b64url(JSON.stringify({ user, exp: Date.now() + SESSION_TTL_SECONDS * 1000 }));
  return `${payload}.${sign(payload)}`;
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function validSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!safeEqual(sig, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.user === APP_USER && Number(data.exp) > Date.now();
  } catch { return false; }
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  securityHeaders(res);
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(body);
}
function redirect(res, to) {
  securityHeaders(res);
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' });
  res.end();
}
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function rateLimited(ip) {
  const now = Date.now();
  const item = loginAttempts.get(ip);
  if (!item) return false;
  if (now > item.resetAt) { loginAttempts.delete(ip); return false; }
  return item.count >= 8;
}
function registerFailure(ip) {
  const now = Date.now();
  const item = loginAttempts.get(ip);
  if (!item || now > item.resetAt) loginAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
  else item.count += 1;
}
function clearFailures(ip) { loginAttempts.delete(ip); }
function readBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > maxBytes) { reject(new Error('body-too-large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function secureCookie(req, token, maxAge = SESSION_TTL_SECONDS) {
  const proto = String(req.headers['x-forwarded-proto'] || '');
  const secure = proto.split(',')[0].trim() === 'https' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
function serveFile(res, filePath, cache = false) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Não encontrado.');
    const ext = path.extname(filePath).toLowerCase();
    securityHeaders(res);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache ? 'public, max-age=86400' : 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}
const loginHtml = require('./login-template');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/health') return send(res, 200, 'ok');
  if (pathname === '/sw.js') return serveFile(res, path.join(ROOT, 'sw.js'), false);
  if (['/bracoffee_logo.png','/icon-192.png','/icon-512.png'].includes(pathname)) {
    return serveFile(res, path.join(ROOT, pathname.slice(1)), true);
  }
  if (pathname.startsWith('/assets/')) {
    const fp = path.resolve(ROOT, '.' + pathname);
    if (!fp.startsWith(path.resolve(ROOT, 'assets') + path.sep)) return send(res, 403, 'Acesso negado.');
    return serveFile(res, fp, true);
  }

  if (pathname === '/login' && req.method === 'GET') {
    if (validSession(req)) return redirect(res, '/');
    return send(res, 200, loginHtml(url.searchParams.get('erro') ? 'Usuário ou senha incorretos.' : ''), 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const ip = clientIp(req);
    if (rateLimited(ip)) return send(res, 429, loginHtml('Muitas tentativas. Aguarde alguns minutos e tente novamente.'), 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
    try {
      const raw = await readBody(req);
      const contentType = String(req.headers['content-type'] || '');
      let username = '', password = '';
      if (contentType.includes('application/json')) {
        const data = JSON.parse(raw || '{}'); username = String(data.username || ''); password = String(data.password || '');
      } else {
        const data = new URLSearchParams(raw); username = String(data.get('username') || ''); password = String(data.get('password') || '');
      }
      if (safeEqual(username.trim(), APP_USER) && safeEqual(password, APP_PASSWORD)) {
        clearFailures(ip);
        const token = makeSession(APP_USER);
        securityHeaders(res);
        res.writeHead(303, { Location: '/', 'Set-Cookie': secureCookie(req, token), 'Cache-Control': 'no-store' });
        return res.end();
      }
      registerFailure(ip);
      return redirect(res, '/login?erro=1');
    } catch {
      return send(res, 400, 'Requisição inválida.');
    }
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    securityHeaders(res);
    res.writeHead(204, { 'Set-Cookie': secureCookie(req, '', 0), 'Cache-Control': 'no-store' });
    return res.end();
  }

  if (!validSession(req)) {
    const acceptsHtml = String(req.headers.accept || '').includes('text/html');
    return acceptsHtml ? redirect(res, '/login') : send(res, 401, 'Não autorizado.');
  }

  if (pathname === '/api/data' && req.method === 'GET') {
    const state=store.read();
    if(url.searchParams.get('instanceId')===state.instanceId&&url.searchParams.has('revision')&&Number(url.searchParams.get('revision'))===state.revision)return send(res,304,'','application/json',{'Cache-Control':'no-store'});
    return send(res,200,JSON.stringify(state),'application/json; charset=utf-8',{'Cache-Control':'no-store'});
  }
  if (pathname === '/api/data' && req.method === 'PUT') {
    try {
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,'{"error":"Origem inválida."}','application/json');
      const body=JSON.parse(await readBody(req,12*1024*1024));
      const result=store.save(body.data,body.baseRevision,body.baseInstanceId);
      return send(res,result.status,JSON.stringify(result.state||{error:result.error}),'application/json; charset=utf-8',{'Cache-Control':'no-store'});
    }catch{return send(res,400,'{"error":"Não foi possível salvar os dados."}','application/json');}
  }
  if (pathname.startsWith('/api/')) return send(res,404,'{"error":"Não encontrado."}','application/json');

  let requested = pathname === '/' ? '/index.html' : pathname;
  const publicFiles=['/index.html','/app.js','/sync.js','/styles.css','/manifest.json','/bracoffee_logo.png','/icon-192.png','/icon-512.png'];
  if(!publicFiles.includes(requested))return send(res,404,'Não encontrado.');
  let filePath = path.resolve(ROOT, '.' + requested);
  if (!filePath.startsWith(path.resolve(ROOT) + path.sep)) return send(res, 403, 'Acesso negado.');
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return serveFile(res, filePath, false);
  return serveFile(res, path.join(ROOT, 'index.html'), false);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BRACOFFEE rodando na porta ${PORT}`);
});
