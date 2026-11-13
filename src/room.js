/*
 * Bura — bitta oʻyin stoli: 4 ta oʻrin (2×2 jamoa), botlar, taymerlar, match hisobi.
 * Serverda ham, brauzerdagi demo rejimida ham ishlaydi.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'));
  else root.BuraRoom = factory(root.BuraEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const SEATS = 4;
  const BOT_NAMES = ['Botir', 'Robiya', 'Jasur', 'Malika', 'Sardor', 'Lola', 'Bekzod', 'Nilufar'];
  const EVENT_RANK = { aces: 9, win: 8, draw: 8, bura: 7, reveal: 6, collect: 5, lead: 4, beat: 4, discard: 4, deal: 1 };

  function Room(o) {
    o = o || {};
    this.id = o.id || 'demo';
    this.chatId = o.chatId || null;
    this.title = o.title || '';
    this.groupKey = o.groupKey || null; // guruh zali (bir guruhdagi barcha stollar)
    this.no = o.no || 0;                // zaldagi stol raqami: 1-stol, 2-stol…
    this.now = o.now || function () { return Date.now(); };
    this.setTimer = o.setTimeout || function (f, ms) { return setTimeout(f, ms); };
    this.clearTimer = o.clearTimeout || function (h) { clearTimeout(h); };
    this.rng = o.rng || Math.random;
    this.turnMs = (o.turnSeconds || 30) * 1000;
    this.offlineMs = o.offlineMs || 8000;
    this.botDelay = o.botDelay || [900, 1500];
    this.collectMs = o.collectMs != null ? o.collectMs : 1900;
    this.autoStartMs = o.autoStartMs != null ? o.autoStartMs : 1800;
    // «Tayyorman»: hamma oʻtirgach har kim tasdiqlaydi; vaqtida bosmagan — kuzatuvchiga oʻtadi
    this.requireReady = !!o.requireReady;
    this.readyMs = o.readyMs != null ? o.readyMs : 15000;
    this.readyTimer = null;
    this.readyAt = 0;
    this.readyOut = null; // { at, ids } — oxirgi marta kuzatuvchiga oʻtkazilganlar
    this.onChange = o.onChange || function () {};
    this.onRoundEnd = o.onRoundEnd || function () {};
    this.onEmpty = o.onEmpty || function () {};  // stolda faol oʻyinchi qolmadi — stol yopiladi
    this.emptyMs = o.emptyMs != null ? o.emptyMs : 2500;        // hamma turib ketsa
    this.awayMs = o.awayMs != null ? o.awayMs : 90000;          // hamma oflayn boʻlsa (ilova yopilgan)
    this.resumeMs = o.resumeMs != null ? o.resumeMs : 30000;    // davom/yangidan tanlovi — shundan keyin davom etadi

    this.size = o.size === 2 ? 2 : 4; // 4 — 2×2 jamoaviy, 2 — bir-biriga qarshi
    this.seats = this.size === 2 ? [null, null] : [null, null, null, null]; // {id, name, photo, bot, auto, offlineSince}; 0 va 2 — 1-jamoa, 1 va 3 — 2-jamoa
    this.spectators = new Map();
    this.online = new Map();
    this.hostId = null;
    this.phase = 'lobby'; // lobby | playing | roundEnd
    this.game = null;
    this.round = 0;
    this.firstLeader = -1;
    this.score = [0, 0];      // match ballari (yutqazgan jamoaga yoziladi — kami yaxshi)
    this.drawBonus = 0;       // 60:60 boʻlsa — keyingi yutqazgan jamoaga qoʻshimcha (har durang uchun +2)
    this.matchWins = [0, 0];
    this.matchNo = 1;
    this.matchOver = false;
    this.lastResult = null;
    this.lastEvent = null;
    this.evSeq = 0;
    this.settings = { helper: true };
    this.timer = null;
    this.lobbyTimer = null;
    this.deadline = 0;
    this.deadlineTotal = 0;
    this.botSeq = 0;
    this.joinSeq = 0;       // stolga oʻtirish tartibi (stol egasi ketsa — keyingi kelgan egasi boʻladi)
    this.kickedOut = null;  // { at, id } — stol egasi chiqargan oʻyinchi
    this.resumeAsk = false;   // oʻyin oʻrtasida boʻshagan oʻrin toʻldi: stol egasi davom ettirish yoki yangidan boshlashni tanlaydi
    this.resumeAt = 0;
    this.resumeTimer = null;
    this.emptyTimer = null;
    this.emptyKind = '';
    this.lastActive = this.now();
    this.createdAt = this.now();
    this.destroyed = false;
  }

  const P = Room.prototype;

  // ---------- yordamchilar ----------
  P.seatOf = function (uid) { return this.seats.findIndex(function (s) { return s && s.id === uid; }); };
  P.filled = function () { return this.seats.filter(Boolean).length; };
  P.firstFree = function () { return this.seats.indexOf(null); };
  P.isOnline = function (uid) { return (this.online.get(uid) || 0) > 0; };
  P.onlineCount = function () { let n = 0; this.online.forEach(function (v) { if (v > 0) n++; }); return n; };
  P.touch = function () { this.lastActive = this.now(); };
  P.changed = function () { this.touch(); if (!this.destroyed) { this.checkEmpty(); this.onChange(this); } };
  // Oʻyin oʻrtasida oʻrin boʻsh — oʻyin toʻxtaydi (kimdir oʻtirguncha yoki bot qoʻshilguncha)
  P.paused = function () { return this.phase === 'playing' && this.filled() < this.size; };
  P.frozen = function () { return this.paused() || this.resumeAsk; };

  // Stolda faol oʻyinchi qolmasa — yopiladi. Hamma turib ketsa — darhol; hamma oflayn boʻlsa — kutib turib.
  P.checkEmpty = function () {
    const self = this;
    const humans = this.seats.filter(function (s) { return s && !s.bot; });
    const active = humans.some(function (s) { return !s.auto && self.isOnline(s.id); });
    let kind = '';
    if (!humans.length) {
      // lobbida hech kim yoʻq va bot ham yoʻq — bu yangi/boʻsh stol, zal oʻzi tozalaydi
      if (this.phase !== 'lobby' || this.seats.some(function (s) { return s && s.bot; })) kind = 'empty';
    } else if (!active && this.phase !== 'lobby') kind = 'away';
    if (kind === this.emptyKind) return;
    if (this.emptyTimer) this.clearTimer(this.emptyTimer);
    this.emptyTimer = null;
    this.emptyKind = kind;
    if (!kind) return;
    this.emptyTimer = this.setTimer(function () {
      self.emptyTimer = null;
      if (!self.destroyed) self.onEmpty(self, kind);
    }, kind === 'empty' ? this.emptyMs : this.awayMs);
  };
  P.isHost = function (uid) { return uid != null && uid === this.hostId; };
  P.humans = function () { return this.seats.filter(function (s) { return s && !s.bot; }); };

  // Bir qadamda bir nechta hodisa boʻlishi mumkin (olish → yopiq karta ochildi → bura)
  P.setEvents = function (list) {
    if (!list || !list.length) return;
    const top = list.slice().sort(function (a, b) { return (EVENT_RANK[b.kind] || 0) - (EVENT_RANK[a.kind] || 0); })[0];
    this.lastEvent = Object.assign({}, top, {
      seq: ++this.evSeq,
      also: list.filter(function (e) { return e !== top && (e.kind === 'reveal' || e.kind === 'bura'); })
    });
  };

  P.fixHost = function () {
    const self = this;
    const ok = this.seats.some(function (s) { return s && !s.bot && !s.auto && s.id === self.hostId; });
    if (!ok) {
      // Stol egasi ketdi — undan keyin stolga kirgan (eng oldin oʻtirgan) oʻyinchi egasi boʻladi
      let h = null;
      this.seats.forEach(function (s) { if (s && !s.bot && !s.auto && (!h || (s.joined || 0) < (h.joined || 0))) h = s; });
      this.hostId = h ? h.id : null;
    }
  };
  P.nextBotName = function () {
    const used = new Set(this.seats.filter(Boolean).map(function (s) { return s.name; }));
    for (const nm of BOT_NAMES) if (!used.has(nm)) return nm;
    return 'Bot ' + (this.botSeq + 1);
  };
  P.makeBot = function () {
    this.botSeq++;
    return { id: 'bot:' + this.botSeq, name: this.nextBotName(), photo: null, bot: true, auto: false, offlineSince: 0 };
  };

  // ---------- ulanish ----------
  // pref — taklif havolasidagi oʻrin (boʻsh boʻlsa, oʻsha joyga oʻtiradi)
  P.connect = function (user, pref) {
    this.online.set(user.id, (this.online.get(user.id) || 0) + 1);
    const i = this.seatOf(user.id);
    if (i >= 0) {
      const s = this.seats[i];
      s.name = user.name || s.name;
      s.photo = user.photo || s.photo || null;
      s.offlineSince = 0;
      if (s.auto) { s.auto = false; this.fixHost(); }
      this.spectators.delete(user.id);
    } else if (this.phase === 'lobby' && this.firstFree() >= 0) {
      const want = Number.isInteger(pref) && pref >= 0 && pref < this.size && !this.seats[pref] ? pref : this.firstFree();
      this.addHuman(user, want);
    } else {
      this.spectators.set(user.id, user);
    }
    this.reschedule();
    this.changed();
  };

  P.disconnect = function (uid) {
    const c = (this.online.get(uid) || 1) - 1;
    if (c > 0) { this.online.set(uid, c); return; }
    this.online.delete(uid);
    this.spectators.delete(uid);
    const i = this.seatOf(uid);
    if (i >= 0) this.seats[i].offlineSince = this.now();
    this.reschedule();
    this.changed();
  };

  P.addHuman = function (user, idx) {
    this.seats[idx] = { id: user.id, name: user.name, photo: user.photo || null, bot: false, auto: false, offlineSince: 0, ready: false, joined: ++this.joinSeq };
    this.spectators.delete(user.id);
    if (!this.hostId) this.hostId = user.id;
    this.checkAutoStart();
  };

  // Lobbida uzoq vaqt oflayn boʻlganlarni chiqarish
  P.sweep = function () {
    if (this.phase !== 'lobby') return false;
    const now = this.now();
    let ch = false;
    for (let i = 0; i < this.size; i++) {
      const s = this.seats[i];
      if (s && !s.bot && !this.isOnline(s.id) && s.offlineSince && now - s.offlineSince >= 30000) { this.seats[i] = null; ch = true; }
    }
    if (ch) { this.fixHost(); this.clearLobbyTimer(); this.changed(); }
    return ch;
  };

  P.isIdle = function (maxIdleMs) { return this.onlineCount() === 0 && this.now() - this.lastActive > maxIdleMs; };

  P.destroy = function () {
    this.destroyed = true;
    [this.timer, this.lobbyTimer, this.resumeTimer, this.emptyTimer].forEach((h) => { if (h) this.clearTimer(h); });
    this.timer = this.lobbyTimer = this.resumeTimer = this.emptyTimer = null;
  };

  // ---------- mijoz buyruqlari ----------
  P.dispatch = function (uid, m) {
    if (!m || typeof m !== 'object') return 'Notoʻgʻri soʻrov';
    switch (m.t) {
      case 'sit': return this.sit(uid, m.seat);
      case 'leave': return this.leave(uid);
      case 'addBot': return this.addBot(uid, m.seat);
      case 'fillBots': return this.fillBots(uid);
      case 'kick': return this.kick(uid, m.seat);
      case 'start': return this.start(uid);
      case 'ready': return this.setReady(uid);
      case 'act': return this.act(uid, m.action);
      case 'next': return this.nextRound(uid);
      case 'lobby': return this.backToLobby(uid);
      case 'setting': return this.setSetting(uid, m.key, m.value);
      case 'resume': return this.resume(uid, m.mode);
    }
    return 'Nomaʼlum buyruq';
  };

  P.sit = function (uid, seatIdx) {
    const idx = typeof seatIdx === 'number' && seatIdx >= 0 && seatIdx < this.size ? seatIdx : -1;
    const my = this.seatOf(uid);
    if (my >= 0) {
      const s = this.seats[my];
      if (s.auto) { s.auto = false; this.fixHost(); this.reschedule(); this.changed(); return null; }
      if (this.phase === 'lobby' && idx >= 0 && idx !== my) { // oʻrin almashtirish (jamoa tanlash)
        if (this.seats[idx]) return 'Bu oʻrin band';
        this.seats[idx] = s;
        this.seats[my] = null;
        this.changed();
      }
      return null;
    }
    const user = this.spectators.get(uid);
    if (!user) return 'Avval stolga kiring';
    // Oʻyin oʻrtasida yoki raund oxirida boʻsh oʻringa oʻtirish
    if (this.phase !== 'lobby' && (idx >= 0 ? !this.seats[idx] : this.firstFree() >= 0)) {
      const t = idx >= 0 ? idx : this.firstFree();
      this.seats[t] = { id: user.id, name: user.name, photo: user.photo || null, bot: false, auto: false, offlineSince: 0, joined: ++this.joinSeq };
      this.spectators.delete(uid);
      if (!this.hostId) this.hostId = uid;
      this.fixHost();
      this.seatFilled();
      this.changed();
      return null;
    }
    if (this.phase === 'lobby') {
      const t = idx >= 0 ? idx : this.firstFree();
      if (t < 0) return 'Boʻsh oʻrin yoʻq';
      if (this.seats[t]) return 'Bu oʻrin band';
      this.addHuman(user, t);
      this.changed();
      return null;
    }
    if (this.phase === 'roundEnd') {
      const t = idx >= 0 ? idx : this.seats.findIndex(function (s) { return s && (s.bot || s.auto); });
      const s = this.seats[t];
      if (!s || !(s.bot || s.auto)) return 'Bu oʻrin band';
      this.seats[t] = { id: user.id, name: user.name, photo: user.photo || null, bot: false, auto: false, offlineSince: 0, joined: ++this.joinSeq };
      this.spectators.delete(uid);
      if (!this.hostId) this.hostId = uid;
      this.changed();
      return null;
    }
    return 'Raund tugashini kuting';
  };

  P.leave = function (uid) {
    const i = this.seatOf(uid);
    if (i < 0) return null;
    const s = this.seats[i];
    // Stoldan turish: oʻrin boʻshaydi, oʻzi kuzatuvchi boʻlib qoladi.
    // Oʻyin oʻrtasida boʻlsa — oʻyin toʻxtaydi, boʻsh oʻringa kimdir oʻtirguncha yoki bot qoʻshilguncha.
    this.seats[i] = null;
    if (this.isOnline(uid)) this.spectators.set(uid, { id: uid, name: s.name, photo: s.photo });
    this.fixHost();
    this.clearLobbyTimer();
    this.cancelResume();
    this.reschedule();
    this.changed();
    return null;
  };

  // Boʻshagan oʻrin toʻldi: oʻyin oʻrtasida boʻlsa — stol egasidan soʻraladi (davom ettirish yoki yangidan)
  P.seatFilled = function () {
    if (this.phase === 'lobby') { this.checkAutoStart(); return; }
    if (this.phase !== 'playing' || this.filled() < this.size || this.resumeAsk) { this.reschedule(); return; }
    const self = this;
    this.resumeAsk = true;
    this.resumeAt = this.now() + this.resumeMs;
    if (this.resumeTimer) this.clearTimer(this.resumeTimer);
    this.resumeTimer = this.setTimer(function () {
      self.resumeTimer = null;
      if (self.resumeAsk && !self.destroyed) { self.doResume('continue'); self.changed(); }
    }, this.resumeMs);
    this.reschedule();
  };
  P.cancelResume = function () {
    this.resumeAsk = false;
    if (this.resumeTimer) this.clearTimer(this.resumeTimer);
    this.resumeTimer = null;
  };
  P.resume = function (uid, mode) {
    if (!this.resumeAsk) return 'Hozir tanlash kerak emas';
    if (!this.isHost(uid)) return 'Faqat stol egasi tanlaydi';
    this.doResume(mode === 'restart' ? 'restart' : 'continue');
    this.changed();
    return null;
  };
  P.doResume = function (mode) {
    this.cancelResume();
    if (mode === 'restart') {
      // Yangidan: hisob 0:0, kartalar qayta tarqatiladi
      this.score = [0, 0];
      this.drawBonus = 0;
      this.matchOver = false;
      this.matchNo++;
      this.round = 0;
      this.beginRound();
      this.lastEvent = Object.assign({}, this.lastEvent, { restart: true });
    } else {
      this.setEvents([{ n: 0, kind: 'resume', seat: -1 }]);
      this.reschedule();
    }
  };

  P.addBot = function (uid, seatIdx) {
    if (!this.canManage(uid)) return 'Bot qoʻshish uchun stolda oʻtirgan boʻlishingiz kerak';
    const t = typeof seatIdx === 'number' && seatIdx >= 0 && seatIdx < this.size && !this.seats[seatIdx] ? seatIdx : this.firstFree();
    if (t < 0) return 'Boʻsh oʻrin yoʻq';
    this.seats[t] = this.makeBot();
    this.seatFilled();
    this.changed();
    return null;
  };

  P.fillBots = function (uid) {
    if (!this.canManage(uid)) return 'Bot qoʻshish uchun stolda oʻtirgan boʻlishingiz kerak';
    if (this.firstFree() < 0) return 'Boʻsh oʻrin yoʻq';
    for (let i = 0; i < this.size; i++) if (!this.seats[i]) this.seats[i] = this.makeBot();
    this.seatFilled();
    this.changed();
    return null;
  };

  // Botni stoldan chiqarish (stolda oʻtirgan har kim); oflayn odamni — faqat stol egasi
  P.kick = function (uid, idx) {
    const s = this.seats[idx];
    if (!s) return 'Oʻrin topilmadi';
    if (s.bot) { if (!this.canManage(uid)) return 'Botni chiqarish uchun stolda oʻtirgan boʻlishingiz kerak'; }
    else {
      // Stol egasi istalgan oʻyinchini chiqara oladi — u mehmon (kuzatuvchi) boʻlib qoladi
      if (!this.isHost(uid)) return 'Faqat stol egasi';
      if (s.id === uid) return 'Oʻzingizni chiqara olmaysiz — «Stoldan turish»ni bosing';
      if (this.isOnline(s.id)) this.spectators.set(s.id, { id: s.id, name: s.name, photo: s.photo });
      this.kickedOut = { at: this.now(), id: s.id };
    }
    this.seats[idx] = null;
    this.fixHost();
    this.clearLobbyTimer();
    this.cancelResume();
    this.reschedule();
    this.changed();
    return null;
  };
  // Stolda oʻtirgan (bot oʻynamayotgan) odam
  P.canManage = function (uid) {
    const i = this.seatOf(uid);
    return i >= 0 && !this.seats[i].auto;
  };

  P.checkAutoStart = function () {
    if (this.phase !== 'lobby' || this.filled() < this.size) { this.cancelReady(); return; }
    if (this.requireReady) return this.checkReady();
    if (this.lobbyTimer) return;
    const self = this;
    this.lobbyTimer = this.setTimer(function () {
      self.lobbyTimer = null;
      if (self.phase === 'lobby' && self.filled() === self.size && !self.destroyed) {
        self.beginRound();
        self.changed();
      }
    }, this.autoStartMs);
  };
  P.clearLobbyTimer = function () {
    if (this.lobbyTimer) { this.clearTimer(this.lobbyTimer); this.lobbyTimer = null; }
    this.cancelReady();
  };

  // Hamma oʻtirdi: «Tayyorman» uchun vaqt; hamma tayyor boʻlsa — oʻyin boshlanadi
  P.checkReady = function () {
    const self = this;
    if (this.seats.every(function (s) { return s && (s.bot || s.ready); })) {
      this.cancelReady();
      this.beginRound();
      return;
    }
    if (this.readyTimer) return;
    this.readyAt = this.now() + this.readyMs;
    this.readyTimer = this.setTimer(function () {
      self.readyTimer = null;
      if (!self.destroyed) self.readyTimeout();
    }, this.readyMs);
  };
  P.cancelReady = function () {
    if (this.readyTimer) this.clearTimer(this.readyTimer);
    this.readyTimer = null;
    this.readyAt = 0;
  };
  // Vaqtida «Tayyorman» bosmaganlar kuzatuvchi boʻladi (boʻsh oʻringa qayta oʻtira oladi)
  P.readyTimeout = function () {
    if (this.phase !== 'lobby') return;
    const out = [];
    for (let i = 0; i < this.size; i++) {
      const s = this.seats[i];
      if (!s || s.bot || s.ready) continue;
      out.push(s.id);
      this.seats[i] = null;
      if (this.isOnline(s.id)) this.spectators.set(s.id, { id: s.id, name: s.name, photo: s.photo });
    }
    this.readyAt = 0;
    if (out.length) this.readyOut = { at: this.now(), ids: out };
    this.fixHost();
    this.changed();
  };
  P.setReady = function (uid) {
    if (this.phase !== 'lobby') return 'Oʻyin allaqachon boshlangan';
    const i = this.seatOf(uid);
    if (i < 0) return 'Siz bu stolda oʻynamayapsiz';
    if (this.filled() < this.size) return 'Hali hamma oʻtirmadi';
    this.seats[i].ready = true;
    this.checkAutoStart();
    this.changed();
    return null;
  };

  P.start = function (uid) {
    if (this.phase !== 'lobby') return 'Oʻyin allaqachon boshlangan';
    if (!this.isHost(uid)) return 'Faqat stol egasi boshlay oladi';
    if (this.filled() < this.size) return (this.size + ' kishi kerak — boʻsh oʻrinlarga bot qoʻshing');
    this.beginRound();
    this.changed();
    return null;
  };

  P.beginRound = function () {
    this.clearLobbyTimer();
    this.seats.forEach(function (s) { if (s) s.ready = false; }); // keyingi lobbida yana soʻraladi
    this.readyOut = null;
    if (this.matchOver) { this.score = [0, 0]; this.drawBonus = 0; this.matchOver = false; this.matchNo++; }
    // birinchi yurish har raundda navbat bilan almashadi
    this.firstLeader = this.firstLeader < 0 ? Math.floor(this.rng() * this.size) : (this.firstLeader + 1) % this.size;
    this.phase = 'playing';
    this.round++;
    this.lastResult = null;
    this.game = E.newRound({ leader: this.firstLeader, rng: this.rng, n: this.size });
    const evs = E.takeEvents(this.game);
    this.setEvents([{ n: 0, kind: 'deal', seat: this.firstLeader, round: this.round }].concat(evs));
    if (this.game.phase === 'roundEnd') this.finishRound();
    this.reschedule();
  };

  P.act = function (uid, action) {
    if (this.phase !== 'playing' || !this.game) return 'Oʻyin ketmayapti';
    if (this.paused()) return 'Oʻyin toʻxtatilgan — boʻsh oʻrin bor';
    if (this.resumeAsk) return 'Stol egasi tanlamoqda: davom ettirish yoki yangidan';
    const i = this.seatOf(uid);
    if (i < 0) return 'Siz bu stolda oʻynamayapsiz';
    if (!action || typeof action !== 'object') return 'Notoʻgʻri harakat';
    const a = {
      type: String(action.type || ''),
      cards: Array.isArray(action.cards) ? action.cards.slice(0, 4).map(String) : []
    };
    const res = E.act(this.game, i, a);
    if (!res.ok) return res.error;
    const s = this.seats[i];
    if (s.auto) { s.auto = false; this.fixHost(); }
    this.setEvents(res.events);
    if (this.game.phase === 'roundEnd') this.finishRound();
    this.reschedule();
    this.changed();
    return null;
  };

  P.finishRound = function () {
    const r = this.game.result;
    // Ball raundda yutqazgan jamoaga yoziladi (qoida — E.addToMatch).
    // 60:60 — hech kimga yozilmaydi; keyingi raundda yutqazgan jamoaga yana +2 qoʻshiladi.
    const draw = r.type === 'draw';
    const aces = r.type === 'aces';
    const bonus = draw || aces ? 0 : this.drawBonus;
    // 4 ta tuz: raqib jamoa hisobi 14 boʻladi (match yutqaziladi)
    const base = aces ? Math.max(0, E.MATCH_LOSE - this.score[1 - r.team]) : r.award;
    const m = E.addToMatch(this.score, r.team, base + bonus);
    this.drawBonus = draw ? this.drawBonus + 2 : 0;
    const loser = m.loser, matchLoser = m.matchLoser;
    this.score = m.score;
    if (matchLoser >= 0) {
      this.matchOver = true;
      this.matchWins[1 - matchLoser]++;
    }
    this.phase = 'roundEnd';
    this.lastResult = Object.assign({}, E.resultView(this.game), {
      round: this.round,
      award: draw ? 0 : base + bonus,
      base: base,
      bonus: bonus,
      nextBonus: this.drawBonus,
      loser: loser,
      score: this.score.slice(),
      matchOver: this.matchOver,
      matchLoser: matchLoser,
      matchWinner: matchLoser >= 0 ? 1 - matchLoser : -1,
      matchWins: this.matchWins.slice()
    });
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.deadline = 0;
    this.onRoundEnd(this);
  };

  P.nextRound = function (uid) {
    if (this.phase !== 'roundEnd') return 'Raund hali tugamagan';
    const i = this.seatOf(uid);
    if (i < 0 || this.seats[i].auto) return 'Faqat oʻyinchilar davom ettira oladi';
    if (this.filled() < this.size) return 'Boʻsh oʻrin bor — avval kimdir oʻtirsin yoki bot qoʻshing';
    this.beginRound();
    this.changed();
    return null;
  };

  P.backToLobby = function (uid) {
    if (this.phase !== 'roundEnd') return 'Faqat raund oxirida mumkin';
    if (!this.isHost(uid)) return 'Faqat stol egasi';
    for (let i = 0; i < this.size; i++) {
      const s = this.seats[i];
      if (s && s.auto) {
        if (this.isOnline(s.id)) this.spectators.set(s.id, { id: s.id, name: s.name, photo: s.photo });
        this.seats[i] = null;
      }
    }
    this.phase = 'lobby';
    this.game = null;
    this.lastEvent = null;
    this.score = [0, 0]; // lobbidan keyin yangi match
    this.drawBonus = 0;
    this.matchOver = false;
    this.matchNo++;
    this.fixHost();
    this.checkAutoStart();
    this.changed();
    return null;
  };

  P.setSetting = function (uid, key, value) {
    if (!this.isHost(uid)) return 'Faqat stol egasi';
    if (this.phase === 'playing') return 'Oʻyin vaqtida oʻzgartirib boʻlmaydi';
    if (key === 'helper') this.settings.helper = !!value;
    else return 'Nomaʼlum sozlama';
    this.changed();
    return null;
  };

  // ---------- navbat, botlar, taymer ----------
  P.reschedule = function () {
    if (this.timer) this.clearTimer(this.timer);
    this.timer = null;
    this.deadline = 0;
    this.deadlineTotal = 0;
    if (this.destroyed || this.phase !== 'playing' || !this.game || this.frozen()) return;
    const g = this.game, self = this;
    if (g.phase === 'trickEnd') {
      this.timer = this.setTimer(function () { self.step('collect'); }, this.collectMs);
      return;
    }
    if (g.phase === 'roundEnd') return;
    const actor = g.phase === 'lead' ? g.leader : g.turn;
    const seat = this.seats[actor];
    if (!seat) return;
    if (seat.bot || seat.auto) {
      const d = this.botDelay[0] + Math.floor(Math.random() * (this.botDelay[1] - this.botDelay[0] + 1));
      this.timer = this.setTimer(function () { self.step('ai', actor); }, d);
      return;
    }
    const ms = this.isOnline(seat.id) ? this.turnMs : this.offlineMs;
    this.deadline = this.now() + ms;
    this.deadlineTotal = ms;
    this.timer = this.setTimer(function () { self.step('timeout', actor); }, ms);
  };

  P.step = function (kind, seatIdx) {
    this.timer = null;
    const g = this.game;
    if (!g || this.phase !== 'playing' || this.destroyed) return;
    if (kind === 'collect') {
      this.setEvents(E.collect(g));
    } else {
      const actor = g.phase === 'lead' ? g.leader : g.turn;
      if (actor !== seatIdx) { this.reschedule(); return; }
      // vaqt tugasa — chap tarafdagi kartalar; bot va chiqib ketganlar oʻrniga — kompyuter oʻyinchisi
      const a = (kind === 'timeout' && E.autoMove(g, seatIdx)) || E.AI.choose(g, seatIdx, {});
      if (a) {
        const r = E.act(g, seatIdx, a);
        if (r.ok) {
          if (kind === 'timeout' && r.events.length) r.events[0] = Object.assign({}, r.events[0], { auto: true });
          this.setEvents(r.events);
        }
      }
    }
    if (g.phase === 'roundEnd') this.finishRound();
    this.reschedule();
    this.changed();
  };

  // ---------- har bir foydalanuvchi uchun holat ----------
  P.snapshot = function (uid) {
    const mySeat = this.seatOf(uid);
    const self = this;
    const g = this.game;
    let game = null;
    if (g) {
      game = E.viewFor(g, mySeat);
      if (!this.settings.helper) delete game.teamKnown;
    }
    return {
      id: this.id,
      group: this.groupKey,
      no: this.no,
      phase: this.phase,
      size: this.size,
      round: this.round,
      mySeat: mySeat,
      myTeam: mySeat >= 0 ? E.teamOf(mySeat) : -1,
      isHost: this.isHost(uid),
      spectator: mySeat < 0,
      spectators: this.spectators.size,
      watchers: Array.from(this.spectators.values()).slice(0, 12).map(function (w) {
        return { name: w.name, photo: w.photo || null, you: w.id === uid };
      }),
      drawBonus: this.drawBonus,
      paused: this.paused(),
      resumeAsk: this.resumeAsk,
      resumeIn: this.resumeAsk ? Math.max(0, this.resumeAt - this.now()) : 0,
      resumeId: this.resumeAsk ? this.resumeAt : 0,
      settings: Object.assign({}, this.settings),
      seats: this.seats.map(function (s, i) {
        if (!s) return null;
        return {
          name: s.name,
          photo: s.photo || null,
          bot: s.bot,
          auto: s.auto,
          online: s.bot || self.isOnline(s.id),
          host: s.id === self.hostId,
          you: s.id === uid,
          team: E.teamOf(i),
          ready: !!(s.bot || s.ready)
        };
      }),
      readyIn: this.readyAt ? Math.max(0, this.readyAt - this.now()) : 0,
      kickedOut: this.kickedOut && this.kickedOut.id === uid ? this.kickedOut.at : 0,
      readyOut: this.readyOut && this.readyOut.ids.indexOf(uid) >= 0 ? this.readyOut.at : 0,
      score: this.score.slice(),
      lose: E.MATCH_LOSE,
      edge: E.MATCH_EDGE,
      matchNo: this.matchNo,
      matchWins: this.matchWins.slice(),
      matchOver: this.matchOver,
      firstLeader: this.firstLeader,
      game: game,
      event: this.lastEvent,
      result: this.phase === 'roundEnd' ? this.lastResult : null,
      deadlineIn: this.deadline ? Math.max(0, this.deadline - this.now()) : 0,
      deadlineTotal: this.deadlineTotal,
      autoStart: !!this.lobbyTimer
    };
  };

  return { Room: Room, SEATS: SEATS };
});
