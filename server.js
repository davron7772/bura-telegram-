'use strict';
/*
 * Bura — Telegram Mini App serveri.
 * Ishga tushirish: node server.js   (sozlamalar .env faylida)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./src/util');

loadEnv(path.join(__dirname, '.env'));

const { Hub } = require('./src/hub');
const { TelegramApi } = require('./src/telegram');
const { createBot } = require('./src/bot');
const { parseIceServers, hasTurn } = require('./src/ice');
const { createTurn } = require('./src/turn');

// Render'da manzil RENDER_EXTERNAL_URL orqali avtomatik keladi
const publicUrl = String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
const cfg = {
  port: Number(process.env.PORT) || 3000,
  botToken: String(process.env.BOT_TOKEN || '').trim(),
  publicUrl: publicUrl,
  appShortName: String(process.env.APP_SHORT_NAME || '').trim(),
  botMode: (process.env.BOT_MODE || (/^https:\/\//.test(publicUrl) ? 'webhook' : 'polling')).toLowerCase(),
  devMode: process.env.DEV_MODE === '1',
  turnSeconds: Math.max(10, Math.min(120, Number(process.env.TURN_SECONDS) || 30)),
  iceServers: parseIceServers(process.env, function (msg) { console.warn('[ovoz] ' + msg); })
};
// TURN kalitlari API orqali (Cloudflare yoki Metered) — ixtiyoriy
const turn = createTurn(process.env, { log: function (msg) { console.warn('[ovoz] ' + msg); } });
// Ovoz faqat TURN orqali: oʻyinchilar bir-birining IP manzilini koʻrmaydi (TURN server shart)
cfg.voiceRelay = process.env.VOICE_RELAY_ONLY === '1';
if (cfg.voiceRelay && !hasTurn(cfg.iceServers) && !turn) console.warn('[ovoz] VOICE_RELAY_ONLY=1 uchun TURN server kerak — TURN boʻlmasa eʼtiborsiz qoldiriladi');
// WebRTC ulanmagan juftliklar ovozini server uzatadi (VOICE_FWD=0 — oʻchirish)
cfg.voiceFwd = process.env.VOICE_FWD !== '0';

const VERSION = Date.now().toString(36);
const PUBLIC_DIR = path.join(__dirname, 'public');
const SHARED = {
  '/engine.js': path.join(__dirname, 'src', 'engine.js'),
  '/room.js': path.join(__dirname, 'src', 'room.js'),
  '/adpcm.js': path.join(__dirname, 'src', 'adpcm.js')
};
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

let bot = null;

const { Stats } = require('./src/stats');
// Statistika fayli: DATA_DIR (masalan Render Disk: /var/data) yoki ./data
const stats = new Stats({ file: path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'stats.json') });
process.on('SIGTERM', function () { stats.flush(); });
const hub = new Hub({
  stats: stats,
  botToken: cfg.botToken,
  devMode: cfg.devMode,
  turnSeconds: cfg.turnSeconds,
  requireReady: process.env.READY_CHECK !== '0', // «Tayyorman» tugmasi (0 — oʻchirish, avtomatik boshlash)
  iceServers: cfg.iceServers,
  turn: turn,
  voiceRelay: cfg.voiceRelay,
  voiceFwd: cfg.voiceFwd,
  inviteLink: function (id) { return bot ? bot.appLink(id) : (cfg.publicUrl || '') + '/?room=' + id; },
  onRoomChange: function (room) { if (bot) bot.onRoomChange(room); },
  onRoomRemoved: function (room) { if (bot) bot.onRoomRemoved(room); },
  onHallChange: function (group) { if (bot) bot.onHallChange(group); },
  onTableCreated: function (room, user) { if (bot) bot.onTableCreated(room, user); }
});

function serveFile(req, res, file) {
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Topilmadi'); return; }
    const ext = path.extname(file).toLowerCase();
    if (ext === '.html') buf = Buffer.from(buf.toString('utf8').replace(/__V__/g, VERSION));
    res.writeHead(200, {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

const server = http.createServer(function (req, res) {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (_) { res.writeHead(400); res.end(); return; }
  const p = url.pathname;

  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (req.method === 'POST' && bot && p === bot.webhookPath) { bot.handleWebhook(req, res); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }

  if (SHARED[p]) return serveFile(req, res, SHARED[p]);
  let rel;
  try { rel = decodeURIComponent(p === '/' ? '/index.html' : p); } catch (_) { res.writeHead(400); res.end(); return; }
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  serveFile(req, res, file);
});

hub.attach(server);

server.listen(cfg.port, function () {
  console.log('Bura serveri ishga tushdi: http://localhost:' + cfg.port);
  console.log('Ovozli chat: ' + (turn ? 'STUN + TURN (' + turn.name + ', API orqali)' : hasTurn(cfg.iceServers) ? 'STUN + TURN' : 'faqat STUN (TURN sozlanmagan)') +
    (cfg.voiceRelay ? ', faqat TURN orqali' : '') + (cfg.voiceFwd ? '; ulanmaganlar uchun ovoz server orqali' : ''));
  if (turn) turn.start();
  if (cfg.devMode) console.log('DEV rejimi: brauzerda sinash — http://localhost:' + cfg.port + '/?dev=1&uid=1&name=Ali');
  if (!cfg.botToken) {
    console.warn('BOT_TOKEN berilmagan — Telegram bot oʻchiq' + (cfg.devMode ? ' (DEV rejimida brauzerda sinash mumkin)' : ''));
    return;
  }
  if (cfg.botMode === 'webhook' && !/^https:\/\//.test(cfg.publicUrl)) {
    console.warn('Webhook uchun PUBLIC_URL https:// bilan boshlanishi kerak — polling rejimiga oʻtildi');
    cfg.botMode = 'polling';
  }
  if (!cfg.publicUrl) console.warn('PUBLIC_URL berilmagan — Mini App havolasi uchun BotFather’da URL kiriting');
  bot = createBot({ api: new TelegramApi(cfg.botToken, { apiRoot: process.env.TELEGRAM_API_ROOT }), hub: hub, cfg: cfg });
  bot.start().catch(function (e) { console.error('[bot] ishga tushmadi:', e.message); });
});

function shutdown() {
  console.log('Toʻxtatilmoqda…');
  if (turn) turn.stop();
  hub.close();
  server.close(function () { process.exit(0); });
  setTimeout(function () { process.exit(0); }, 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
