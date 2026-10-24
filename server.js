'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_HOURS = 8;
const ANALYTICS_RETENTION_DAYS = 90;
const DEFAULT_CONTENT = {
  brandName: 'NORTHSTAR CYBER',
  heroLine1: 'Know your risk.',
  heroLine2: 'Own your response.',
  heroCopy: 'Round-the-clock defense and real-world offensive testing, delivered by people who make complex security feel clear.',
  socSummary: 'Continuous security operations, with analysts who investigate and help you respond.',
  socServices: [
    '24/7 security monitoring and alert triage',
    'SIEM and log source onboarding',
    'Endpoint, email, identity and cloud detection',
    'Threat hunting and detection engineering',
    'Incident response coordination and containment guidance',
    'Digital forensics support, evidence preservation and timeline building',
    'Root-cause investigation, recovery guidance and lessons learned',
    'Vulnerability prioritization and risk reporting'
  ],
  trainingCopy: 'Hands-on learning paths for students exploring security operations and penetration testing. Practice uses controlled labs and explicitly authorized environments.',
  contactEmail: 'deepak.ray184@outlook.com'
};
const CONTENT_LIMITS = { brandName: 45, heroLine1: 70, heroLine2: 70, heroCopy: 260, socSummary: 260, trainingCopy: 260, contactEmail: 120 };
const sessions = new Map();
const failedLogins = new Map();
const trackLimiter = { minute: Math.floor(Date.now() / 60000), count: 0 };
const sessionKey = crypto.randomBytes(32);
const passwordSalt = crypto.randomBytes(16);
const adminPassword = process.env.ADMIN_PASSWORD || '';
const configuredPasswordHash = adminPassword.length >= 16 ? crypto.scryptSync(adminPassword, passwordSalt, 64) : null;

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CONTENT_FILE)) atomicWrite(CONTENT_FILE, DEFAULT_CONTENT);
if (!fs.existsSync(ANALYTICS_FILE)) atomicWrite(ANALYTICS_FILE, {});

function atomicWrite(file, value) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function readJson(file, fallback) {
  try {
    const val = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (val && typeof val === 'object') ? val : fallback;
  } catch { return fallback; }
}
function cleanAnalytics(data) {
  if (!data || typeof data !== 'object') return {};
  const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - ANALYTICS_RETENTION_DAYS);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  for (const date of Object.keys(data)) if (date < cutoffKey) delete data[date];
  return data;
}
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store', ...headers });
  res.end(payload);
}
function json(res, status, value, headers = {}) { send(res, status, value, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); }
function setCommonSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
}
function readBody(req, maxBytes = 16_384) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw) > maxBytes) { reject(Object.assign(new Error('Request is too large.'), { statusCode: 413 })); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}
function originIsSame(req) {
  const origin = req.headers.origin;
  if (!origin || !req.headers.host) return false;
  try { return new URL(origin).host.toLowerCase() === req.headers.host.toLowerCase(); }
  catch { return false; }
}
function cookies(req) {
  const out = {};
  for (const piece of (req.headers.cookie || '').split(';')) {
    const index = piece.indexOf('=');
    if (index > 0) {
      const key = piece.slice(0, index).trim();
      const val = piece.slice(index + 1).trim();
      try { out[key] = decodeURIComponent(val); } catch { out[key] = val; }
    }
  }
  return out;
}
function currentSession(req) {
  const token = cookies(req).northstar_admin;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) { if (token) sessions.delete(token); return null; }
  return session;
}
function requireAdmin(req, res) {
  if (!currentSession(req)) { json(res, 401, { error: 'Please sign in again.' }); return false; }
  return true;
}
function clientKey(req) {
  const address = req.socket.remoteAddress || 'unknown';
  return crypto.createHmac('sha256', sessionKey).update(address).digest('hex');
}
function guessMime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' })[ext] || 'application/octet-stream';
}
function publicContent(content) {
  const { brandName, heroLine1, heroLine2, heroCopy, socSummary, socServices, trainingCopy, contactEmail } = content;
  return { brandName, heroLine1, heroLine2, heroCopy, socSummary, socServices, trainingCopy, contactEmail };
}
function validText(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max; }
function normalizeContent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Content payload is invalid.');
  const next = {};
  for (const [key, max] of Object.entries(CONTENT_LIMITS)) {
    if (!validText(input[key], max)) throw new Error(`Check the ${key} field. It must be 1–${max} characters.`);
    next[key] = input[key].trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contactEmail)) throw new Error('Enter a valid contact email address.');
  if (!Array.isArray(input.socServices) || input.socServices.length < 1 || input.socServices.length > 16) throw new Error('Add between 1 and 16 SOC service items.');
  next.socServices = input.socServices.map((item) => {
    if (!validText(item, 140)) throw new Error('Each SOC service must be 1–140 characters.');
    return item.trim();
  });
  return next;
}
function getAnalytics(days) {
  const stored = cleanAnalytics(readJson(ANALYTICS_FILE, {}));
  atomicWrite(ANALYTICS_FILE, stored);
  const output = [];
  const pages = new Map();
  let totalPageViews = 0;
  let totalCtaClicks = 0;
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(); date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const day = stored[key] || {};
    let pageViews = 0; let ctaClicks = 0;
    for (const [page, counts] of Object.entries(day)) {
      const views = Number(counts.pageViews) || 0;
      const clicks = Number(counts.ctaClicks) || 0;
      pageViews += views; ctaClicks += clicks;
      const aggregate = pages.get(page) || { page, pageViews: 0, ctaClicks: 0 };
      aggregate.pageViews += views; aggregate.ctaClicks += clicks; pages.set(page, aggregate);
    }
    totalPageViews += pageViews; totalCtaClicks += ctaClicks;
    output.push({ date: key, label: `${key.slice(5, 7)}/${key.slice(8, 10)}`, pageViews, ctaClicks });
  }
  return { days: output, totalPageViews, totalCtaClicks, topPages: [...pages.values()].sort((a, b) => b.pageViews - a.pageViews).slice(0, 10) };
}
async function handle(req, res) {
  setCommonSecurityHeaders(res);
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname); }
  catch { return json(res, 400, { error: 'Invalid URL.' }); }

  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (pathname === '/admin/') {
    res.writeHead(301, { Location: '/admin' });
    return res.end();
  }
  if (pathname === '/api/content' && req.method === 'GET') {
    return json(res, 200, publicContent(readJson(CONTENT_FILE, DEFAULT_CONTENT)), { 'Cache-Control': 'no-cache' });
  }
  if (pathname === '/api/track' && req.method === 'POST') {
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== trackLimiter.minute) { trackLimiter.minute = minute; trackLimiter.count = 0; }
    if (trackLimiter.count >= 300) return json(res, 429, { error: 'Try again later.' });
    trackLimiter.count++;
    try {
      const body = await readBody(req, 2048);
      const event = body.event;
      const page = typeof body.page === 'string' && /^\/[a-zA-Z0-9/_.-]{0,100}$/.test(body.page) ? body.page : null;
      if (!page || !['page_view', 'cta_click'].includes(event)) return json(res, 400, { error: 'Invalid analytics event.' });
      const data = cleanAnalytics(readJson(ANALYTICS_FILE, {}));
      const date = new Date().toISOString().slice(0, 10);
      data[date] ||= {}; data[date][page] ||= { pageViews: 0, ctaClicks: 0 };
      if (event === 'page_view') data[date][page].pageViews++;
      else data[date][page].ctaClicks++;
      atomicWrite(ANALYTICS_FILE, data);
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, error.statusCode || 400, { error: 'Event could not be recorded.' }); }
  }
  if (pathname.startsWith('/api/admin/')) {
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && !originIsSame(req)) return json(res, 403, { error: 'Request origin could not be verified.' });
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      if (!configuredPasswordHash) return json(res, 503, { error: 'Admin setup is incomplete. Set ADMIN_PASSWORD to a value at least 16 characters long, then restart the server.' });
      const key = clientKey(req); const attempts = failedLogins.get(key) || { count: 0, until: 0 };
      if (attempts.until > Date.now() && attempts.count >= 6) return json(res, 429, { error: 'Too many sign-in attempts. Wait 10 minutes and try again.' });
      const body = await readBody(req);
      const candidate = typeof body.password === 'string' ? body.password : '';
      const candidateHash = crypto.scryptSync(candidate, passwordSalt, 64);
      if (!crypto.timingSafeEqual(candidateHash, configuredPasswordHash)) {
        if (attempts.until < Date.now()) { attempts.count = 0; attempts.until = Date.now() + 10 * 60 * 1000; }
        attempts.count++; failedLogins.set(key, attempts);
        return json(res, 401, { error: 'That password was not accepted.' });
      }
      failedLogins.delete(key);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000 });
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      return json(res, 200, { ok: true }, { 'Set-Cookie': `northstar_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_HOURS * 60 * 60}${secure}` });
    }
    if (pathname === '/api/admin/session' && req.method === 'GET') return currentSession(req) ? json(res, 200, { ok: true }) : json(res, 401, { error: 'Sign in required.' });
    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      const token = cookies(req).northstar_admin; if (token) sessions.delete(token);
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'northstar_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0' });
    }
    if (!requireAdmin(req, res)) return;
    if (pathname === '/api/admin/content' && req.method === 'GET') return json(res, 200, readJson(CONTENT_FILE, DEFAULT_CONTENT));
    if (pathname === '/api/admin/content' && req.method === 'PUT') {
      try { const body = await readBody(req); const content = normalizeContent(body); atomicWrite(CONTENT_FILE, content); return json(res, 200, { ok: true }); }
      catch (error) { return json(res, 400, { error: error.message || 'Content could not be saved.' }); }
    }
    if (pathname === '/api/admin/analytics' && req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
      return json(res, 200, getAnalytics(days));
    }
    return json(res, 404, { error: 'Admin route not found.' });
  }

  let relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (pathname === '/admin') relative = 'admin.html';
  if (pathname === '/admin/admin.css') relative = 'admin.css';
  if (pathname === '/admin/admin.js') relative = 'admin.js';
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found.', { 'Content-Type': 'text/plain; charset=utf-8' });
  const ext = path.extname(file).toLowerCase();
  if (!['.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico'].includes(ext)) return send(res, 404, 'Not found.', { 'Content-Type': 'text/plain; charset=utf-8' });
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=300';
  res.writeHead(200, { 'Content-Type': guessMime(file), 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => { if (!res.headersSent) json(res, 500, { error: 'A server error occurred.' }); else res.destroy(); });
});
server.listen(PORT, HOST, () => {
  if (!configuredPasswordHash) console.log('Set ADMIN_PASSWORD to a strong value of at least 16 characters before signing in.');
  console.log(`Northstar Cyber site: http://${HOST}:${PORT}`);
  console.log(`Admin panel: http://${HOST}:${PORT}/admin`);
});
