import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { hashPin, checkPin } from './auth.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(root, 'data');
const FAMILY_CODE = (process.env.FAMILY_CODE || '').trim();
const DB_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(root, 'public');
const MAX_UPLOAD = 5 * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --- Stockage : un petit fichier JSON, relu à chaque requête (quelques Ko en famille) ---

function readDb() {
  let db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    db = { users: [], gifts: [], sessions: {} };
  }
  if (!db.secret) {
    db.secret = crypto.randomBytes(32).toString('hex');
    writeDb(db);
  }
  return db;
}

function writeDb(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const uid = () => crypto.randomBytes(8).toString('hex');

// --- Utilitaires HTTP ---

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Fichier trop volumineux'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req, 100 * 1024);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON invalide');
  }
}

function cookie(req, name) {
  const match = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Limite les essais de code par adresse IP
const attempts = new Map();
function throttle(req) {
  const ip = req.socket.remoteAddress;
  const now = Date.now();
  const entry = (attempts.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (entry.length >= 20) throw new HttpError(429, 'Trop d’essais, réessaie dans quelques minutes');
  entry.push(now);
  attempts.set(ip, entry);
}

// --- Récupération sécurisée de pages et d'images (aperçu des liens) ---

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80')) return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, 'Lien invalide');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Lien invalide');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new HttpError(400, 'Lien non autorisé');
  return url;
}

async function safeFetch(raw, { maxBytes, accept }) {
  let url = await assertPublicUrl(raw);
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(7000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NoelFamille/1.0)',
        Accept: accept,
        'Accept-Language': 'fr,en;q=0.8',
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
      continue;
    }
    if (!res.ok) throw new HttpError(502, 'Page inaccessible');
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      chunks.push(chunk);
      if (size >= maxBytes) break;
    }
    return { url, type: res.headers.get('content-type') || '', body: Buffer.concat(chunks) };
  }
  throw new HttpError(502, 'Trop de redirections');
}

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

function metaContent(html, keys) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (key && keys.includes(key.toLowerCase())) {
      const content = (tag.match(/content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i) || []).slice(1).find(Boolean);
      if (content) return decodeEntities(content);
    }
  }
  return null;
}

const IMAGE_TYPES = [
  { ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { ext: '.png', test: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  { ext: '.gif', test: (b) => b.subarray(0, 3).toString() === 'GIF' },
  { ext: '.webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

function saveImage(buf) {
  const kind = IMAGE_TYPES.find((t) => t.test(buf));
  if (!kind) throw new HttpError(400, 'Format d’image non supporté');
  const name = uid() + kind.ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return '/uploads/' + name;
}

function removeImage(image) {
  if (image && image.startsWith('/uploads/')) {
    fs.rm(path.join(UPLOAD_DIR, path.basename(image)), { force: true }, () => {});
  }
}

async function preview(rawUrl) {
  const page = await safeFetch(rawUrl, { maxBytes: 600 * 1024, accept: 'text/html,*/*;q=0.5' });
  const html = page.body.toString('utf8');
  const title =
    metaContent(html, ['og:title', 'twitter:title']) ||
    decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '');
  const imgRaw = metaContent(html, ['og:image', 'og:image:url', 'twitter:image']);
  let image = null;
  if (imgRaw) {
    try {
      const img = await safeFetch(new URL(imgRaw, page.url).href, { maxBytes: MAX_UPLOAD, accept: 'image/*' });
      image = saveImage(img.body);
    } catch {
      // Pas d'image récupérable : on garde juste le titre
    }
  }
  return { title: title.slice(0, 120), image };
}

// --- Logique métier ---

const clean = (v, max) => String(v ?? '').trim().slice(0, max);

function cleanUrl(v) {
  const raw = clean(v, 1000);
  if (!raw) return '';
  const withProto = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  try {
    return new URL(withProto).href;
  } catch {
    throw new HttpError(400, 'Lien invalide');
  }
}

function giftFields(body) {
  const title = clean(body.title, 120);
  if (!title) throw new HttpError(400, 'Donne un nom à ce cadeau');
  const image = clean(body.image, 200);
  return {
    title,
    url: cleanUrl(body.url),
    price: clean(body.price, 20),
    note: clean(body.note, 400),
    love: Boolean(body.love),
    image: /^\/uploads\/[a-f0-9]+\.\w+$/.test(image) ? image : '',
  };
}

const AVATARS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐧', '🦉', '🐙', '🦄', '🐢', '🐰', '🎅', '🤶', '⛄', '🦌', '🧝', '🐶', '🐱', '🐨'];

const publicUser = (u) => ({ id: u.id, name: u.name, avatar: u.avatar || '🎅', hasPin: Boolean(u.hash) });

function view(db, me) {
  const byId = Object.fromEntries(db.users.map((u) => [u.id, u]));
  return {
    me: publicUser(me),
    users: db.users.map((u) => ({
      ...publicUser(u),
      gifts: db.gifts
        .filter((g) => g.userId === u.id)
        .map(({ claimedBy, ...g }) => ({
          ...g,
          // On ne montre jamais à quelqu'un qui a reçu l'idée si elle est prise : la surprise reste entière
          claimedBy: u.id === me.id ? null : claimedBy ? { id: claimedBy, name: byId[claimedBy]?.name || '?' } : null,
        })),
    })),
  };
}

const cookieFlags = () => `HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 365}${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`;
const gateToken = (db) => crypto.createHmac('sha256', db.secret).update(FAMILY_CODE).digest('hex');
const isUnlocked = (req, db) => !FAMILY_CODE || cookie(req, 'noel_gate') === gateToken(db);

function startSession(db, res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = user.id;
  writeDb(db);
  send(res, 200, { ok: true }, { 'Set-Cookie': `noel=${token}; ${cookieFlags()}` });
}

const cleanAvatar = (v) => (AVATARS.includes(v) ? v : AVATARS[Math.floor(Math.random() * AVATARS.length)]);

function cleanPin(v) {
  const pin = clean(v, 40);
  if (pin && pin.length < 4) throw new HttpError(400, 'Ton code doit faire au moins 4 caractères');
  return pin;
}

async function api(req, res, pathname) {
  const db = readDb();
  const method = req.method;

  if (method === 'GET' && pathname === '/api/config') {
    const unlocked = isUnlocked(req, db);
    return send(res, 200, {
      locked: !unlocked,
      avatars: AVATARS,
      users: unlocked ? db.users.map(publicUser) : [],
    });
  }

  // Code famille : demandé une seule fois par appareil, si FAMILY_CODE est défini
  if (method === 'POST' && pathname === '/api/unlock') {
    throttle(req);
    const { code } = await readJson(req);
    if (!FAMILY_CODE || clean(code, 100) !== FAMILY_CODE) throw new HttpError(403, 'Ce n’est pas le bon code');
    return send(res, 200, { ok: true }, { 'Set-Cookie': `noel_gate=${gateToken(db)}; ${cookieFlags()}` });
  }

  if (method === 'POST' && pathname === '/api/join') {
    throttle(req);
    if (!isUnlocked(req, db)) throw new HttpError(403, 'Code famille requis');
    const body = await readJson(req);
    const name = clean(body.name, 30);
    if (!name) throw new HttpError(400, 'Indique ton prénom');
    if (db.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'Ce prénom existe déjà : touche-le dans la liste pour te connecter');
    }
    const pin = cleanPin(body.pin);
    const user = { id: uid(), name, avatar: cleanAvatar(body.avatar), ...(pin ? hashPin(pin) : {}) };
    db.users.push(user);
    return startSession(db, res, user);
  }

  if (method === 'POST' && pathname === '/api/login') {
    throttle(req);
    if (!isUnlocked(req, db)) throw new HttpError(403, 'Code famille requis');
    const body = await readJson(req);
    const user = db.users.find((u) => u.id === body.id);
    if (!user) throw new HttpError(404, 'Profil introuvable');
    if (user.hash && !checkPin(clean(body.pin, 40), user)) throw new HttpError(401, 'Code incorrect');
    return startSession(db, res, user);
  }

  // Tout ce qui suit demande d'être connecté
  const token = cookie(req, 'noel');
  const me = isUnlocked(req, db) && token && db.users.find((u) => u.id === db.sessions[token]);
  if (!me) throw new HttpError(401, 'Non connecté');

  if (method === 'POST' && pathname === '/api/logout') {
    delete db.sessions[token];
    writeDb(db);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'noel=; HttpOnly; Path=/; Max-Age=0' });
  }

  if (method === 'GET' && pathname === '/api/state') return send(res, 200, view(db, me));

  if (method === 'PUT' && pathname === '/api/profile') {
    const body = await readJson(req);
    if (body.avatar) me.avatar = cleanAvatar(body.avatar);
    if (body.pin === null) {
      delete me.hash;
      delete me.salt;
    } else if (typeof body.pin === 'string' && body.pin.trim()) {
      Object.assign(me, hashPin(cleanPin(body.pin)));
    }
    writeDb(db);
    return send(res, 200, { ok: true });
  }

  if (method === 'POST' && pathname === '/api/preview') {
    const { url } = await readJson(req);
    const link = cleanUrl(url);
    return send(res, 200, await preview(link).catch((err) => {
      throw err instanceof HttpError ? err : new HttpError(502, 'Page inaccessible');
    }));
  }

  if (method === 'POST' && pathname === '/api/upload') {
    return send(res, 200, { image: saveImage(await readBody(req, MAX_UPLOAD)) });
  }

  if (method === 'POST' && pathname === '/api/gifts') {
    const gift = { id: uid(), userId: me.id, claimedBy: null, createdAt: Date.now(), ...giftFields(await readJson(req)) };
    db.gifts.push(gift);
    writeDb(db);
    return send(res, 200, { ok: true });
  }

  const match = pathname.match(/^\/api\/gifts\/([a-f0-9]+)(\/claim)?$/);
  if (match) {
    const gift = db.gifts.find((g) => g.id === match[1]);
    if (!gift) throw new HttpError(404, 'Cadeau introuvable');

    if (match[2] && method === 'POST') {
      if (gift.userId === me.id) throw new HttpError(403, 'Tu ne peux pas réserver ton propre cadeau');
      if (gift.claimedBy && gift.claimedBy !== me.id) throw new HttpError(409, 'Déjà réservé par quelqu’un d’autre');
      gift.claimedBy = gift.claimedBy ? null : me.id;
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    if (gift.userId !== me.id) throw new HttpError(403, 'Ce n’est pas ta liste');

    if (method === 'PUT') {
      const fields = giftFields(await readJson(req));
      if (gift.image && gift.image !== fields.image) removeImage(gift.image);
      Object.assign(gift, fields);
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    if (method === 'DELETE') {
      removeImage(gift.image);
      db.gifts = db.gifts.filter((g) => g.id !== gift.id);
      writeDb(db);
      return send(res, 200, { ok: true });
    }
  }

  throw new HttpError(404, 'Introuvable');
}

// --- Fichiers statiques ---

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function serveStatic(req, res, pathname) {
  const isUpload = pathname.startsWith('/uploads/');
  const base = isUpload ? UPLOAD_DIR : PUBLIC_DIR;
  const rel = isUpload ? pathname.slice('/uploads/'.length) : pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Introuvable');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': isUpload ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname.startsWith('/api/')) await api(req, res, pathname);
      else if (req.method === 'GET') serveStatic(req, res, decodeURIComponent(pathname));
      else send(res, 405, 'Méthode non autorisée');
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      if (!res.headersSent) {
        send(res, err.status || 500, { error: err instanceof HttpError ? err.message : 'Erreur serveur' });
      }
    }
  })
  .listen(PORT, () => console.log(`Noël en famille : http://localhost:${PORT}`));
