'use strict';
/* WebSocket ulanishlari va stollarni boshqarish. */
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Room } = require('./room');
const { validateInitData } = require('./auth');
const { displayName, safePhoto } = require('./util');

const MAX_ROOMS = 5000;
const IDLE_MS = 2 * 60 * 60 * 1000; // 2 soat hech kim boʻlmasa stol oʻchadi

function cryptoRng() { return crypto.randomInt(0, 4294967296) / 4294967296; }

class Hub {
  constructor(cfg) {
    this.cfg = cfg;
    this.rooms = new Map();
    this.conns = new Map(); // roomId -> Set(conn)
    this.onRoomChange = cfg.onRoomChange || function () {};
    this.onRoomRemoved = cfg.onRoomRemoved || function () {};
    this.inviteLink = cfg.inviteLink || function (id) { return '/?room=' + id; };
  }

  newId() {
    let id;
    do { id = crypto.randomBytes(4).toString('hex'); } while (this.rooms.has(id));
    return id;
  }

  createRoom(opts) {
    opts = opts || {};
    if (this.rooms.size >= MAX_ROOMS) this.gc(true);
    const id = this.newId();
    const self = this;
    const room = new Room({
      id: id,
      chatId: opts.chatId || null,
      title: opts.title || '',
      turnSeconds: this.cfg.turnSeconds,
      rng: cryptoRng,
      onChange: function (r) { self.broadcast(r); },
      onRoundEnd: function (r) { self.onRoomChange(r, 'roundEnd'); }
    });
    this.rooms.set(id, room);
    this.conns.set(id, new Set());
    return room;
  }

  removeRoom(room) {
    room.destroy();
    this.rooms.delete(room.id);
    this.conns.delete(room.id);
    this.onRoomRemoved(room);
  }

  gc(force) {
    const rooms = Array.from(this.rooms.values());
    for (const r of rooms) if (r.isIdle(IDLE_MS)) this.removeRoom(r);
    if (force && this.rooms.size >= MAX_ROOMS) {
      rooms.filter((r) => r.onlineCount() === 0)
        .sort((a, b) => a.lastActive - b.lastActive)
        .slice(0, Math.ceil(MAX_ROOMS / 10))
        .forEach((r) => this.removeRoom(r));
    }
  }

  broadcast(room) {
    const set = this.conns.get(room.id);
    if (set) {
      const invite = this.inviteLink(room.id);
      for (const c of set) this.send(c, { t: 'state', room: room.snapshot(c.user.id), invite: invite });
    }
    this.onRoomChange(room, 'change');
  }

  send(c, obj) {
    if (c.ws.readyState === 1) {
      try { c.ws.send(JSON.stringify(obj)); } catch (_) { /* yopilgan */ }
    }
  }

  attach(server) {
    const wss = new WebSocketServer({ server: server, path: '/ws', maxPayload: 16 * 1024 });
    this.wss = wss;
    wss.on('connection', (ws) => this.onConnection(ws));
    this.intervals = [
      setInterval(() => {
        for (const ws of wss.clients) {
          if (ws.isAlive === false) { ws.terminate(); continue; }
          ws.isAlive = false;
          try { ws.ping(); } catch (_) { /* */ }
        }
      }, 25000),
      setInterval(() => { for (const r of this.rooms.values()) r.sweep(); }, 5000),
      setInterval(() => this.gc(false), 60000)
    ];
    return wss;
  }

  close() {
    for (const i of this.intervals || []) clearInterval(i);
    for (const r of this.rooms.values()) r.destroy();
    if (this.wss) this.wss.close();
  }

  onConnection(ws) {
    const c = { ws: ws, user: null, room: null, tokens: 30, last: Date.now() };
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw) => {
      if (!this.allow(c)) return;
      let m;
      try { m = JSON.parse(raw); } catch (_) { return; }
      if (!m || typeof m !== 'object') return;
      try { this.onMessage(c, m); } catch (e) { console.error('[ws] xato:', e); }
    });
    ws.on('close', () => this.detach(c));
    ws.on('error', () => {});
  }

  // Oddiy cheklov: soniyasiga ~10 ta xabar, birdaniga 30 tagacha
  allow(c) {
    const now = Date.now();
    c.tokens = Math.min(30, c.tokens + (now - c.last) / 100);
    c.last = now;
    if (c.tokens < 1) return false;
    c.tokens -= 1;
    return true;
  }

  onMessage(c, m) {
    if (m.t === 'ping') return this.send(c, { t: 'pong' });
    if (m.t === 'hello') return this.hello(c, m);
    if (!c.user) return this.send(c, { t: 'error', msg: 'Avval tizimga kiring' });
    if (m.t === 'create') return this.enter(c, this.createRoom({}));
    if (!c.room) return this.send(c, { t: 'error', msg: 'Stol topilmadi' });
    const err = c.room.dispatch(c.user.id, m);
    if (err) this.send(c, { t: 'error', msg: err });
  }

  hello(c, m) {
    let user = null, startParam = '';
    const auth = this.cfg.botToken ? validateInitData(String(m.initData || ''), this.cfg.botToken) : null;
    if (auth) {
      user = { id: 'tg:' + auth.user.id, name: displayName(auth.user), photo: safePhoto(auth.user.photo_url) };
      startParam = auth.startParam;
    } else if (this.cfg.devMode && m.dev && m.dev.id) {
      user = { id: 'dev:' + String(m.dev.id).slice(0, 32), name: displayName({ first_name: String(m.dev.name || 'Mehmon') }), photo: null };
    }
    if (!user) return this.send(c, { t: 'auth_error', msg: 'Ilovani Telegram orqali oching' });
    if (c.room) this.detach(c);
    c.user = user;
    this.send(c, { t: 'welcome', me: { name: user.name } });
    const roomId = String(m.room || startParam || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    const room = roomId ? this.rooms.get(roomId) : null;
    if (room) this.enter(c, room);
    else this.send(c, { t: 'home', missing: !!roomId });
  }

  enter(c, room) {
    if (c.room) this.detach(c);
    c.room = room;
    this.conns.get(room.id).add(c);
    room.connect(c.user); // holat hammaga yuboriladi
  }

  detach(c) {
    const room = c.room;
    if (!room) return;
    c.room = null;
    const set = this.conns.get(room.id);
    if (set) set.delete(c);
    if (c.user) room.disconnect(c.user.id);
  }
}

module.exports = { Hub };
