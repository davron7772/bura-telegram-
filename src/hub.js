'use strict';
/* WebSocket ulanishlari, stollar va ovozli chat signallari. */
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Room } = require('./room');
const { validateInitData } = require('./auth');
const { displayName, safePhoto } = require('./util');

const MAX_ROOMS = 5000;
const IDLE_MS = 2 * 60 * 60 * 1000; // 2 soat hech kim boʻlmasa stol oʻchadi
const VOICE_MAX = 6;                // bitta stolda ovozli chatda bir vaqtda (har kim har kim bilan ulanadi)
const MAX_SDP = 20000;
const HALL_MAX = 20;                // guruh zalida koʻpi bilan shuncha stol
const HALL_HIDE_EMPTY_MS = 10 * 60 * 1000; // hech kim qolmagan eski stol zalda koʻrsatilmaydi
const CREATE_COOLDOWN_MS = 15000;   // bir kishi zaldan tez-tez stol ochmasin

function cryptoRng() { return crypto.randomInt(0, 4294967296) / 4294967296; }

// WebRTC signal xabarini tekshirish: faqat kerakli maydonlar uzatiladi
function cleanSignal(d) {
  if (!d || typeof d !== 'object') return null;
  if (typeof d.sid !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(d.sid)) return null;
  if (d.type === 'offer' || d.type === 'answer') {
    if (typeof d.sdp !== 'string' || d.sdp.length > MAX_SDP || !/^v=0\r?\n/.test(d.sdp)) return null;
    return { type: d.type, sid: d.sid, sdp: d.sdp };
  }
  if (d.type === 'cand') {
    if (!Array.isArray(d.c) || d.c.length > 40) return null;
    const c = [];
    for (const x of d.c) {
      if (!x || typeof x.candidate !== 'string' || x.candidate.length > 1024) continue;
      const o = { candidate: x.candidate };
      if (typeof x.sdpMid === 'string' && x.sdpMid.length <= 64) o.sdpMid = x.sdpMid;
      if (Number.isInteger(x.sdpMLineIndex) && x.sdpMLineIndex >= 0 && x.sdpMLineIndex < 16) o.sdpMLineIndex = x.sdpMLineIndex;
      if (typeof x.usernameFragment === 'string' && x.usernameFragment.length <= 256) o.usernameFragment = x.usernameFragment;
      if (o.sdpMid == null && o.sdpMLineIndex == null) continue;
      c.push(o);
    }
    return c.length ? { type: 'cand', sid: d.sid, c: c } : null;
  }
  return null;
}

const VOICE_MSG = { rtc: 1, voice_join: 1, voice_leave: 1, voice_set: 1 };

class Hub {
  constructor(cfg) {
    this.cfg = cfg;
    this.rooms = new Map();
    this.conns = new Map(); // roomId -> Set(conn)
    this.onRoomChange = cfg.onRoomChange || function () {};
    this.onRoomRemoved = cfg.onRoomRemoved || function () {};
    this.inviteLink = cfg.inviteLink || function (id) { return '/?room=' + id; };
    this.iceServers = Array.isArray(cfg.iceServers) ? cfg.iceServers : [];
    this.voiceRelay = !!cfg.voiceRelay;
    this.voiceSeq = 0;
    // Guruh zallari: kalit guruh raqamidan imzo bilan yasaladi — server qayta ishga tushsa ham havola ishlaydi
    this.groups = new Map(); // key -> { key, chatId, title, rooms:Set, subs:Set, sig, timer }
    this.hallSecret = crypto.createHash('sha256').update('bura-hall:' + (cfg.botToken || 'dev')).digest();
    this.onHallChange = cfg.onHallChange || function () {};
    this.onTableCreated = cfg.onTableCreated || function () {};
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
    const g = opts.group ? this.ensureGroup(opts.chatId, opts.title) : null;
    const room = new Room({
      id: id,
      chatId: opts.chatId || null,
      title: opts.title || '',
      groupKey: g ? g.key : null,
      no: g ? this.freeTableNo(g) : 0,
      turnSeconds: this.cfg.turnSeconds,
      rng: cryptoRng,
      onChange: function (r) { self.broadcast(r); },
      onRoundEnd: function (r) { self.onRoomChange(r, 'roundEnd'); }
    });
    this.rooms.set(id, room);
    this.conns.set(id, new Set());
    if (g) { g.rooms.add(id); this.hallChanged(g); }
    return room;
  }

  removeRoom(room) {
    room.destroy();
    this.rooms.delete(room.id);
    this.conns.delete(room.id);
    const g = room.groupKey ? this.groups.get(room.groupKey) : null;
    if (g) { g.rooms.delete(room.id); this.hallChanged(g); }
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
      const roster = this.voiceRoster(room);
      for (const c of set) {
        this.send(c, { t: 'state', room: room.snapshot(c.user.id), invite: invite, voice: this.voiceView(roster, c) });
      }
    }
    if (room.groupKey) this.hallChanged(this.groups.get(room.groupKey));
    this.onRoomChange(room, 'change');
  }

  send(c, obj) {
    if (c.ws.readyState === 1) {
      try { c.ws.send(JSON.stringify(obj)); } catch (_) { /* yopilgan */ }
    }
  }

  attach(server) {
    const wss = new WebSocketServer({ server: server, path: '/ws', maxPayload: 48 * 1024 });
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
    for (const g of this.groups.values()) clearTimeout(g.timer);
    if (this.wss) this.wss.close();
  }

  onConnection(ws) {
    const now = Date.now();
    const c = {
      ws: ws, user: null, room: null,
      vid: crypto.randomBytes(5).toString('hex'), // ovozli chatdagi ichki raqam (har ulanishga yangi)
      voice: null,
      raw: 120, rawLast: now, tokens: 30, last: now, rtc: 120, rtcLast: now
    };
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (raw, isBinary) => {
      if (isBinary || !this.allowRaw(c)) return;
      let m;
      try { m = JSON.parse(raw); } catch (_) { return; }
      if (!m || typeof m !== 'object') return;
      if (!(m.t === 'rtc' ? this.allowRtc(c) : this.allow(c))) return;
      try { this.onMessage(c, m); } catch (e) { console.error('[ws] xato:', e); }
    });
    ws.on('close', () => { this.detach(c); this.leaveHall(c); });
    ws.on('error', () => {});
  }

  // Cheklovlar (token chelak): umumiy — soniyasiga ~10 ta, signal xabarlari — ~30 ta
  bucket(c, key, lastKey, cap, perMs) {
    const now = Date.now();
    c[key] = Math.min(cap, c[key] + (now - c[lastKey]) * perMs);
    c[lastKey] = now;
    if (c[key] < 1) return false;
    c[key] -= 1;
    return true;
  }
  allowRaw(c) { return this.bucket(c, 'raw', 'rawLast', 120, 0.05); }
  allow(c) { return this.bucket(c, 'tokens', 'last', 30, 0.01); }
  allowRtc(c) { return this.bucket(c, 'rtc', 'rtcLast', 120, 0.03); }

  onMessage(c, m) {
    if (m.t === 'ping') return this.send(c, { t: 'pong' });
    if (m.t === 'hello') return this.hello(c, m);
    if (!c.user) return this.send(c, { t: 'error', msg: 'Avval tizimga kiring' });
    if (m.t === 'create') return this.createFor(c);
    if (m.t === 'hall') return this.toHall(c);
    if (m.t === 'join') return this.join(c, m);
    if (!c.room) {
      if (m.t === 'voice_join') return this.send(c, { t: 'voice_end', reason: 'noroom' });
      if (VOICE_MSG[m.t]) return; // eski signal — jimgina tashlaymiz
      return this.send(c, { t: 'error', msg: 'Stol topilmadi' });
    }
    switch (m.t) {
      case 'rtc': return this.relay(c, m);
      case 'voice_join': return this.voiceJoin(c, m);
      case 'voice_leave': return this.voiceLeave(c);
      case 'voice_set': return this.voiceSet(c, m);
    }
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
    this.leaveHall(c);
    c.user = user;
    this.send(c, { t: 'welcome', me: { name: user.name } });
    const ref = String(m.room || startParam || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (ref[0] === 'g') { // guruh zali
      const g = this.groupByKey(ref);
      if (g) return this.enterHall(c, g);
      return this.send(c, { t: 'home', missing: true });
    }
    const room = ref ? this.rooms.get(ref.slice(0, 16)) : null;
    if (room) this.enter(c, room);
    else this.send(c, { t: 'home', missing: !!ref });
  }

  enter(c, room) {
    if (c.room) this.detach(c);
    this.leaveHall(c);
    c.room = room;
    this.conns.get(room.id).add(c);
    room.connect(c.user); // holat hammaga yuboriladi
  }

  // ---------- guruh zali: guruhdagi barcha stollar ----------
  groupKeyFor(chatId) {
    if (chatId === 'dev') return 'gdev';
    const n = Number(chatId);
    const sig = crypto.createHmac('sha256', this.hallSecret).update('g:' + n).digest('hex').slice(0, 10);
    return 'g' + (n < 0 ? 'n' : 'p') + Math.abs(n).toString(36) + 'x' + sig;
  }

  // Kalitdan guruh raqamini tiklash (imzo tekshiriladi — begona guruhni topib boʻlmaydi)
  parseGroupKey(key) {
    if (key === 'gdev') return this.cfg.devMode ? { chatId: 'dev' } : null;
    const m = /^g([np])([0-9a-z]{1,12})x([0-9a-f]{10})$/.exec(key || '');
    if (!m) return null;
    const n = parseInt(m[2], 36) * (m[1] === 'n' ? -1 : 1);
    if (!Number.isSafeInteger(n) || n === 0) return null;
    const want = Buffer.from(this.groupKeyFor(n));
    const got = Buffer.from(key);
    return want.length === got.length && crypto.timingSafeEqual(want, got) ? { chatId: n } : null;
  }

  ensureGroup(chatId, title) {
    const key = this.groupKeyFor(chatId);
    let g = this.groups.get(key);
    if (!g) {
      g = { key: key, chatId: chatId, title: '', rooms: new Set(), subs: new Set(), sig: '', timer: null, lastCreate: new Map() };
      this.groups.set(key, g);
    }
    if (title) g.title = String(title).slice(0, 64);
    return g;
  }

  groupByKey(key) {
    const g = this.groups.get(key);
    if (g) return g;
    const p = this.parseGroupKey(key);
    return p ? this.ensureGroup(p.chatId) : null;
  }

  freeTableNo(g) {
    const used = new Set();
    for (const id of g.rooms) { const r = this.rooms.get(id); if (r) used.add(r.no); }
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  // Zalda koʻrinadigan stollar: odami bor yoki yangi ochilgan stollar
  hallTables(g) {
    const now = Date.now();
    const list = [];
    for (const id of g.rooms) {
      const r = this.rooms.get(id);
      if (!r || r.destroyed) continue;
      const humans = r.seats.some((s) => s && !s.bot);
      if (!humans && r.onlineCount() === 0 && now - r.createdAt > HALL_HIDE_EMPTY_MS) continue;
      list.push(r);
    }
    list.sort((a, b) => a.no - b.no);
    return list.slice(0, HALL_MAX);
  }

  tableView(r, uid) {
    let voice = 0;
    const set = this.conns.get(r.id);
    if (set) for (const c of set) if (c.voice) voice++;
    return {
      id: r.id,
      no: r.no,
      phase: r.phase,
      round: r.round,
      score: r.score.slice(),
      matchOver: r.matchOver,
      seats: r.seats.map((s) => (s ? {
        name: s.name, photo: s.photo || null, bot: !!s.bot, auto: !!s.auto,
        online: !!s.bot || r.isOnline(s.id), you: uid != null && s.id === uid
      } : null)),
      spectators: r.spectators.size,
      voice: voice,
      mine: uid != null ? r.seatOf(uid) : -1
    };
  }

  hallView(g, uid) {
    return { key: g.key, title: g.title, tables: this.hallTables(g).map((r) => this.tableView(r, uid)) };
  }

  // Stollardan biri oʻzgardi: zalni koʻrib turganlarga va guruhdagi xabarga yetkazamiz (faqat koʻrinish oʻzgarsa)
  hallChanged(g) {
    if (!g) return;
    const sig = JSON.stringify(this.hallTables(g).map((r) => this.tableView(r, null)));
    if (sig === g.sig) return;
    g.sig = sig;
    if (!g.timer && g.subs.size) {
      g.timer = setTimeout(() => {
        g.timer = null;
        for (const c of g.subs) this.send(c, { t: 'hall', hall: this.hallView(g, c.user.id) });
      }, 250);
    }
    this.onHallChange(g);
  }

  enterHall(c, g) {
    this.leaveRoomFor(c);
    this.leaveHall(c);
    c.hall = g;
    g.subs.add(c);
    this.send(c, { t: 'hall', hall: this.hallView(g, c.user.id) });
  }

  leaveHall(c) {
    if (c.hall) { c.hall.subs.delete(c); c.hall = null; }
  }

  // Stoldan chiqib ketish: lobbida oʻrin darhol boʻshaydi, oʻyin paytida esa saqlanadi
  leaveRoomFor(c) {
    const r = c.room;
    if (!r) return;
    if (r.phase === 'lobby' && r.seatOf(c.user.id) >= 0) {
      let others = 0;
      for (const o of this.conns.get(r.id) || []) if (o !== c && o.user && o.user.id === c.user.id) others++;
      if (!others) r.dispatch(c.user.id, { t: 'leave' });
    }
    this.detach(c);
  }

  toHall(c) {
    const g = c.room && c.room.groupKey ? this.groups.get(c.room.groupKey) : c.hall;
    if (!g) return this.send(c, { t: 'error', msg: 'Bu stol guruhga tegishli emas' });
    this.enterHall(c, g);
  }

  // Zaldan stolga: kuzatish yoki aniq oʻringa oʻtirish
  join(c, m) {
    const id = String(m.room || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
    const room = this.rooms.get(id);
    if (!room || room.destroyed) {
      this.send(c, { t: 'error', msg: 'Bu stol yopilgan' });
      if (c.hall) this.send(c, { t: 'hall', hall: this.hallView(c.hall, c.user.id) });
      return;
    }
    if (c.room !== room) {
      this.leaveRoomFor(c);
      this.enter(c, room);
    }
    if (Number.isInteger(m.seat) && m.seat >= 0 && m.seat < 4 && room.seatOf(c.user.id) !== m.seat) {
      const err = room.dispatch(c.user.id, { t: 'sit', seat: m.seat });
      if (err) this.send(c, { t: 'error', msg: err });
    }
  }

  // Yangi stol: zaldan (yoki guruh stolidan) ochilsa — shu guruhga, aks holda alohida stol
  createFor(c) {
    const g = c.hall || (c.room && c.room.groupKey ? this.groups.get(c.room.groupKey) : null);
    if (!g) {
      this.leaveRoomFor(c);
      return this.enter(c, this.createRoom({}));
    }
    const now = Date.now();
    if (now - (g.lastCreate.get(c.user.id) || 0) < CREATE_COOLDOWN_MS) return this.send(c, { t: 'error', msg: 'Biroz kuting — stol hozirgina ochildi' });
    if (this.hallTables(g).length >= HALL_MAX) return this.send(c, { t: 'error', msg: 'Zalda stollar toʻla' });
    g.lastCreate.set(c.user.id, now);
    const room = this.createRoom({ group: true, chatId: g.chatId, title: g.title });
    this.leaveRoomFor(c);
    this.enter(c, room);
    this.onTableCreated(room, c.user);
  }

  detach(c) {
    const room = c.room;
    if (!room) return;
    const hadVoice = !!c.voice;
    c.voice = null;
    c.room = null;
    const set = this.conns.get(room.id);
    if (set) set.delete(c);
    if (c.user) room.disconnect(c.user.id);
    if (hadVoice) this.broadcastVoice(room);
  }

  // ---------- ovozli chat ----------
  // Ovoz serverdan oʻtmaydi: server faqat kim qoʻshilganini aytadi va ulanish xabarlarini uzatadi.
  voiceRoster(room) {
    const set = this.conns.get(room.id);
    const list = [];
    if (set) for (const c of set) if (c.voice) list.push(c);
    list.sort((a, b) => a.voice.seq - b.voice.seq);
    return list.map((c) => ({ v: c.vid, seat: room.seatOf(c.user.id), name: c.user.name, muted: c.voice.muted, mic: c.voice.mic }));
  }

  voiceView(roster, c) { return { roster: roster, me: c.voice ? c.vid : null }; }

  broadcastVoice(room) {
    const set = this.conns.get(room.id);
    if (!set) return;
    const roster = this.voiceRoster(room);
    for (const c of set) this.send(c, Object.assign({ t: 'voice' }, this.voiceView(roster, c)));
    if (room.groupKey) this.hallChanged(this.groups.get(room.groupKey)); // zalda 🎙 soni
  }

  voiceJoin(c, m) {
    const set = this.conns.get(c.room.id);
    // Bir kishi ikkinchi qurilmadan qoʻshilsa, birinchisi chiqariladi (aks holda ovoz qaytadi)
    for (const o of set) {
      if (o !== c && o.voice && o.user.id === c.user.id) {
        o.voice = null;
        this.send(o, { t: 'voice_end', reason: 'elsewhere' });
      }
    }
    const mic = m.mic !== false;
    const muted = mic && !!m.muted;
    if (c.voice) {
      c.voice.mic = mic;
      c.voice.muted = muted;
    } else {
      let n = 0;
      for (const o of set) if (o.voice) n++;
      if (n >= VOICE_MAX) return this.send(c, { t: 'voice_end', reason: 'full', max: VOICE_MAX });
      c.voice = { mic: mic, muted: muted, seq: ++this.voiceSeq };
    }
    this.send(c, { t: 'voice_cfg', ice: this.iceServers, relay: this.voiceRelay, max: VOICE_MAX });
    this.broadcastVoice(c.room);
  }

  voiceLeave(c) {
    if (!c.voice) return;
    c.voice = null;
    this.broadcastVoice(c.room);
  }

  voiceSet(c, m) {
    if (!c.voice) return;
    if (typeof m.mic === 'boolean') c.voice.mic = m.mic;
    c.voice.muted = c.voice.mic && !!m.muted;
    this.broadcastVoice(c.room);
  }

  relay(c, m) {
    if (!c.voice) return;
    const data = cleanSignal(m.data);
    if (!data) return;
    const to = String(m.to || '');
    for (const o of this.conns.get(c.room.id)) {
      if (o !== c && o.vid === to && o.voice) {
        this.send(o, { t: 'rtc', from: c.vid, data: data });
        return;
      }
    }
  }
}

module.exports = { Hub, cleanSignal, VOICE_MAX };
