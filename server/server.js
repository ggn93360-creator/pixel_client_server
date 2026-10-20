/**
 * ============================================================
 *  Pixels Client — Backend Server
 *  Node.js 18+, без внешних зависимостей.
 *
 *  Назначение:
 *    • регистрирует игроков, запустивших скрипт (userid, ник,
 *      отображаемое имя, включённые модули/визуалы)
 *    • отдаёт Luau-скрипт по адресу /api/script
 *    • отдаёт список онлайн-игроков для виджета на сайте
 *    • админ-панель со списком игроков
 *
 *  Запуск:
 *    node server.js
 *
 *  Переменные окружения:
 *    PORT            порт (по умолчанию 8787)
 *    ADMIN_TOKEN     токен для админ-эндпоинтов
 *    PUBLIC_URL      публичный адрес сервера (вставляется в скрипт)
 *    DATA_DIR        папка с данными (по умолчанию ./data)
 *    SCRIPT_FILE     файл с телом скрипта (по умолчанию ./payload/loader.luau)
 *    OFFLINE_TTL     секунд без heartbeat → игрок считается офлайн
 *    WHITELIST_ONLY  "1" — отдавать скрипт только разрешённым userid
 * ============================================================
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// ---------------------------------------------------------- конфиг
const ROOT = __dirname;

const CFG = {
  port: Number(process.env.PORT || 8787),
  adminToken: process.env.ADMIN_TOKEN || '',
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  scriptFile: path.resolve(ROOT, process.env.SCRIPT_FILE || 'payload/loader.luau'),
  offlineTtl: Number(process.env.OFFLINE_TTL || 120),
  whitelistOnly: process.env.WHITELIST_ONLY === '1',
  sessionSecret: process.env.SESSION_SECRET || '',
};

if (!CFG.adminToken) {
  CFG.adminToken = crypto.randomBytes(24).toString('hex');
  console.warn('\n  [!] ADMIN_TOKEN не задан — сгенерирован временный:');
  console.warn(`      ${CFG.adminToken}`);
  console.warn('      Задай его в окружении, иначе токен изменится при перезапуске.\n');
}

// ---------------------------------------------------------- хранилище
const FILES = {
  players: path.join(CFG.dataDir, 'players.json'),
  whitelist: path.join(CFG.dataDir, 'whitelist.json'),
};

/** @type {Map<string, PlayerRecord>} */
let players = new Map();
/** @type {Set<string>} */
let whitelist = new Set();

/**
 * @typedef {Object} PlayerRecord
 * @property {string} userid
 * @property {string} username
 * @property {string} displayname
 * @property {string} game
 * @property {string[]} features
 * @property {number} firstSeen
 * @property {number} lastSeen
 * @property {number} hits
 * @property {string} hwid
 */

function ensureDataDir() {
  fs.mkdirSync(CFG.dataDir, { recursive: true });
}

function loadStore() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(FILES.players, 'utf8');
    const obj = JSON.parse(raw);
    players = new Map(Object.entries(obj.players || {}));
  } catch {
    players = new Map();
  }
  try {
    const raw = fs.readFileSync(FILES.whitelist, 'utf8');
    const obj = JSON.parse(raw);
    whitelist = new Set(obj.ids || []);
  } catch {
    whitelist = new Set();
  }
  console.log(
    `  [store] игроков: ${players.size}, в whitelist: ${whitelist.size}`
  );
}

// --- атомарная запись + дебаунс, чтобы не писать на каждый heartbeat
let saveTimer = null;
let saving = false;

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (saving) return scheduleSave();
    saving = true;
    try {
      await writeJson(FILES.players, {
        updated: new Date().toISOString(),
        players: Object.fromEntries(players),
      });
      await writeJson(FILES.whitelist, {
        updated: new Date().toISOString(),
        ids: [...whitelist],
      });
    } catch (e) {
      console.error('  [store] ошибка сохранения:', e.message);
    } finally {
      saving = false;
    }
  }, 1500);
}

async function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

// ---------------------------------------------------------- модели
function isOnline(rec) {
  return Date.now() - rec.lastSeen <= CFG.offlineTtl * 1000;
}

function publicPlayer(rec) {
  return {
    userid: rec.userid,
    username: rec.username,
    displayname: rec.displayname || rec.username,
    game: rec.game,
    features: rec.features || [],
    firstSeen: rec.firstSeen,
    lastSeen: rec.lastSeen,
    hits: rec.hits || 0,
    online: isOnline(rec),
  };
}

function onlineList(game) {
  const out = [];
  for (const rec of players.values()) {
    if (!isOnline(rec)) continue;
    if (game && rec.game !== game) continue;
    out.push(publicPlayer(rec));
  }
  out.sort((a, b) => b.lastSeen - a.lastSeen);
  return out;
}

function allList() {
  return [...players.values()]
    .map(publicPlayer)
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

function stats() {
  const all = [...players.values()];
  const online = all.filter(isOnline);
  const features = new Map();
  for (const p of all) {
    for (const f of p.features || []) {
      features.set(f, (features.get(f) || 0) + 1);
    }
  }
  return {
    total: all.length,
    online: online.length,
    onlineNow: online.length,
    totalHits: all.reduce((s, p) => s + (p.hits || 0), 0),
    whitelist: whitelist.size,
    topFeatures: [...features.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count })),
    serverTime: Date.now(),
  };
}

// ---------------------------------------------------------- скрипт
let scriptCache = { text: '', mtime: 0 };

async function loadScript() {
  try {
    const st = await fsp.stat(CFG.scriptFile);
    if (st.mtimeMs === scriptCache.mtime && scriptCache.text) {
      return scriptCache.text;
    }
    let text = await fsp.readFile(CFG.scriptFile, 'utf8');
    text = text.replace(/__API__/g, CFG.publicUrl || '');
    text = text.replace(/__TOKEN__/g, CFG.sessionSecret || '');
    scriptCache = { text, mtime: st.mtimeMs };
    return text;
  } catch (e) {
    return `--[[ Pixels Client: не удалось прочитать ${CFG.scriptFile} ]]\n-- ${e.message}\n`;
  }
}

// ---------------------------------------------------------- утилиты
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-Pixels-Token',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj, null, 2));
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isAdmin(req) {
  const header = req.headers['x-admin-token'];
  if (header && header === CFG.adminToken) return true;
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('token');
  return !!q && q === CFG.adminToken;
}

// простые лимиты, чтобы скрипт не завалил сервер
const rate = new Map();

function rateLimited(ip, limit, windowMs) {
  const now = Date.now();
  const rec = rate.get(ip) || { count: 0, reset: now + windowMs };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + windowMs;
  }
  rec.count += 1;
  rate.set(ip, rec);
  if (rate.size > 5000) rate.clear();
  return rec.count > limit;
}

// ---------------------------------------------------------- роуты
async function handleHeartbeat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { status: 'error', message: 'invalid json' });
  }

  const userid = String(body.userid ?? '').trim();
  if (!userid) {
    return sendJson(res, 400, { status: 'error', message: 'missing userid' });
  }

  const now = Date.now();
  const features = Array.isArray(body.features)
    ? body.features.filter((f) => typeof f === 'string').slice(0, 64)
    : [];

  const existing = players.get(userid);
  const rec = existing || {
    userid,
    firstSeen: now,
    hits: 0,
  };
  rec.username = String(body.username ?? rec.username ?? '').slice(0, 64);
  rec.displayname = String(body.displayname ?? rec.displayname ?? rec.username).slice(0, 64);
  rec.game = String(body.game ?? rec.game ?? '').slice(0, 64);
  rec.features = features;
  rec.hwid = String(body.hwid ?? rec.hwid ?? '').slice(0, 128);
  rec.lastSeen = now;
  rec.hits = (rec.hits || 0) + 1;

  players.set(userid, rec);
  scheduleSave();

  sendJson(res, 200, {
    status: 'ok',
    userid,
    online: true,
    features,
    serverTime: now,
  });
}

async function handleScript(req, res, url) {
  const userid = url.searchParams.get('userid') || '';
  const token = url.searchParams.get('token') || req.headers['x-pixels-token'] || '';

  if (CFG.whitelistOnly) {
    if (!userid || !whitelist.has(String(userid))) {
      return sendJson(res, 403, {
        status: 'error',
        message: 'not whitelisted',
        hint: 'Добавь свой userid в whitelist на сервере',
      });
    }
  }

  if (CFG.sessionSecret && token !== CFG.sessionSecret) {
    return sendJson(res, 403, { status: 'error', message: 'bad token' });
  }

  const text = await loadScript();
  send(res, 200, text, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  });
}

function handleWhitelist(req, res) {
  if (!isAdmin(req)) {
    return sendJson(res, 401, { status: 'error', message: 'unauthorized' });
  }
  const ids = [...whitelist].map(Number).filter((n) => !Number.isNaN(n));
  sendJson(res, 200, { status: 'ok', ids, count: ids.length });
}

async function handleWhitelistEdit(req, res) {
  if (!isAdmin(req)) {
    return sendJson(res, 401, { status: 'error', message: 'unauthorized' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { status: 'error', message: 'invalid json' });
  }
  const id = String(body.userid ?? '').trim();
  if (!id) return sendJson(res, 400, { status: 'error', message: 'missing userid' });

  if (body.remove) whitelist.delete(id);
  else whitelist.add(id);

  scheduleSave();
  sendJson(res, 200, {
    status: 'ok',
    ids: [...whitelist],
    action: body.remove ? 'removed' : 'added',
  });
}

// ---------------------------------------------------------- статика
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.luau': 'text/plain; charset=utf-8',
  '.lua': 'text/plain; charset=utf-8',
};

async function serveStatic(res, base, rel) {
  const safe = path
    .normalize(rel)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  const file = path.join(base, safe);
  if (!file.startsWith(base)) return sendJson(res, 403, { status: 'error' });
  try {
    const data = await fsp.readFile(file);
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
  } catch {
    sendJson(res, 404, { status: 'error', message: 'not found' });
  }
}

// ---------------------------------------------------------- сервер
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';

  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token, X-Pixels-Token',
    });
  }

  try {
    // --- служебные ---
    if (p === '/' || p === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'pixels-client-backend',
        version: '1.0.0',
        uptime: Math.round(process.uptime()),
        players: players.size,
        online: onlineList().length,
      });
    }

    // --- API игроков ---
    if (p === '/api/heartbeat' || p === '/api/update') {
      if (rateLimited(ip, 60, 60000)) {
        return sendJson(res, 429, { status: 'error', message: 'rate limit' });
      }
      return await handleHeartbeat(req, res);
    }

    if (p === '/api/list' || p === '/api/players') {
      const game = url.searchParams.get('game') || '';
      return sendJson(res, 200, {
        status: 'ok',
        users: onlineList(game),
        count: onlineList(game).length,
      });
    }

    if (p === '/api/player') {
      const id = url.searchParams.get('userid') || '';
      const rec = players.get(String(id));
      if (!rec) return sendJson(res, 404, { status: 'error', message: 'not found' });
      return sendJson(res, 200, { status: 'ok', player: publicPlayer(rec) });
    }

    if (p === '/api/all') {
      if (!isAdmin(req)) {
        return sendJson(res, 401, { status: 'error', message: 'unauthorized' });
      }
      return sendJson(res, 200, { status: 'ok', users: allList() });
    }

    if (p === '/api/stats') {
      return sendJson(res, 200, { status: 'ok', stats: stats() });
    }

    // --- скрипт ---
    if (p === '/api/script' || p === '/script') {
      return await handleScript(req, res, url);
    }

    // --- whitelist ---
    if (p === '/api/whitelist') {
      if (req.method === 'POST') return await handleWhitelistEdit(req, res);
      return handleWhitelist(req, res);
    }

    // --- админка ---
    if (p === '/admin' || p === '/admin/') {
      return serveStatic(res, path.join(ROOT, 'public'), 'admin.html');
    }
    if (p.startsWith('/admin/')) {
      return serveStatic(res, path.join(ROOT, 'public'), p.slice('/admin/'.length));
    }

    sendJson(res, 404, { status: 'error', message: 'not found' });
  } catch (e) {
    console.error('  [error]', e);
    sendJson(res, 500, { status: 'error', message: e.message });
  }
});

function cleanup() {
  const now = Date.now();
  let removed = 0;
  for (const [id, rec] of players) {
    if (now - rec.lastSeen > CFG.offlineTtl * 1000 * 60) {
      players.delete(id);
      removed++;
    }
  }
  if (removed) {
    console.log(`  [cleanup] удалено протухших записей: ${removed}`);
    scheduleSave();
  }
}

loadStore();
cleanup();
setInterval(cleanup, 5 * 60 * 1000).unref();

server.listen(CFG.port, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  Pixels Client Backend                     │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
  console.log(`   Слушаю:    http://localhost:${CFG.port}`);
  console.log(`   Публичный: ${CFG.publicUrl || '(не задан — задай PUBLIC_URL)'}`);
  console.log(`   Данные:    ${CFG.dataDir}`);
  console.log(`   Скрипт:    ${CFG.scriptFile}`);
  console.log(`   TTL:       ${CFG.offlineTtl} c`);
  console.log(`   Whitelist: ${CFG.whitelistOnly ? 'ВКЛЮЧЁН' : 'выключен'}`);
  console.log('');
  console.log(`   Админка:   http://localhost:${CFG.port}/admin?token=${CFG.adminToken}`);
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log('\n  Останавливаюсь, сохраняю данные...');
    try {
      await writeJson(FILES.players, {
        updated: new Date().toISOString(),
        players: Object.fromEntries(players),
      });
    } catch {}
    process.exit(0);
  });
}
