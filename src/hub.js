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
      const roster = this.voiceRoster(room);
      for (const c of set) {
        this.send(c, { t: 'state', room: room.snapshot(c.user.id), invite: invite, voice: this.voiceView(roster, c) });
      }
    }
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
    ws.on('close', () => this.detach(c));
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
    if (m.t === 'create') return this.enter(c, this.createRoom({}));
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
