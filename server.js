'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 80);
const APP_USER = process.env.APP_USER || 'admin';
const APP_PASSWORD = process.env.APP_PASSWORD || 'Bracoffee@2026';
const SESSION_SECRET = process.env.SESSION_SECRET || 'bracoffee-change-this-secret-in-coolify';
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 43200); // 12h
const COOKIE_NAME = 'bracoffee_session';
const loginAttempts = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
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
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 16 * 1024) { reject(new Error('body-too-large')); req.destroy(); }
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
function loginHtml(message = '') {
  const error = message ? `<div class="error">${message}</div>` : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#221e1b"><title>BRACOFFEE | Login</title><style>
:root{--brown:#8a6035;--brown2:#6f4c2c;--gold:#d9c197;--ink:#28211c;--muted:#756b62;--line:#e5dbcf}*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:radial-gradient(circle at 18% 8%,rgba(217,193,151,.17),transparent 30%),linear-gradient(145deg,#191614 0%,#271f1a 58%,#493321 100%);display:grid;place-items:center;padding:22px;color:var(--ink)}.card{width:min(440px,100%);background:#fffdfa;border:1px solid rgba(255,255,255,.17);border-radius:28px;padding:34px;box-shadow:0 30px 90px rgba(0,0,0,.34)}.brand{text-align:center;margin-bottom:27px}.brand img{width:min(285px,82%);height:auto;display:block;margin:0 auto 12px}.brand p{margin:0;color:var(--muted);font-size:12px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}.field{display:flex;flex-direction:column;gap:8px;margin-bottom:15px}.field span{font-size:13px;font-weight:800;color:#554b43}.field input{width:100%;border:1px solid var(--line);background:#fff;border-radius:13px;padding:13px 14px;outline:none;font:inherit;color:var(--ink)}.field input:focus{border-color:#ba9369;box-shadow:0 0 0 4px rgba(186,147,105,.13)}.pw{position:relative}.pw input{padding-right:84px}.show{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:#f2ece4;color:#654a30;border-radius:9px;padding:7px 9px;font-weight:800;cursor:pointer}.submit{width:100%;border:0;border-radius:13px;background:var(--brown);color:#fff;padding:13px 16px;font-weight:900;font-size:15px;cursor:pointer;box-shadow:0 9px 24px rgba(138,96,53,.2)}.submit:hover{background:var(--brown2)}.error{background:#fcebe8;color:#a5483f;border:1px solid #efcbc6;border-radius:11px;padding:10px 12px;margin:2px 0 14px;font-size:12px;font-weight:800}.foot{text-align:center;color:#9a8f84;font-size:11px;margin-top:19px}.secure{display:flex;align-items:center;justify-content:center;gap:6px;color:#71665c;font-size:12px;margin:0 0 22px}.dot{width:8px;height:8px;border-radius:50%;background:#4d956e}@media(max-width:560px){.card{padding:26px 20px;border-radius:22px}.brand img{width:min(245px,80%)}}
</style></head><body><main class="card"><div class="brand"><img src="/assets/bracoffee_logo.png" alt="BRACOFFEE"><p>Gestão de Café</p></div><div class="secure"><i class="dot"></i>Acesso restrito</div>${error}<form method="post" action="/api/login" autocomplete="on"><label class="field"><span>Usuário</span><input name="username" autocomplete="username" autofocus required placeholder="Digite seu usuário"></label><label class="field"><span>Senha</span><div class="pw"><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="Digite sua senha"><button class="show" type="button" id="toggle">Mostrar</button></div></label><button class="submit" type="submit">Entrar no sistema</button></form><div class="foot">BRACOFFEE • acesso protegido</div></main><script>document.getElementById('toggle').onclick=()=>{const p=document.getElementById('password'),b=document.getElementById('toggle');p.type=p.type==='password'?'text':'password';b.textContent=p.type==='password'?'Mostrar':'Ocultar'};if('serviceWorker'in navigator){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));caches?.keys?.().then(ks=>ks.forEach(k=>caches.delete(k))).catch(()=>{})}</script></body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/health') return send(res, 200, 'ok');
  if (pathname === '/sw.js') return serveFile(res, path.join(ROOT, 'sw.js'), false);
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

  let requested = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.resolve(ROOT, '.' + requested);
  if (!filePath.startsWith(path.resolve(ROOT) + path.sep)) return send(res, 403, 'Acesso negado.');
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return serveFile(res, filePath, false);
  return serveFile(res, path.join(ROOT, 'index.html'), false);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BRACOFFEE rodando na porta ${PORT}`);
});
