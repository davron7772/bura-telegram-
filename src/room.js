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
    this.now = o.now || function () { return Date.now(); };
    this.setTimer = o.setTimeout || function (f, ms) { return setTimeout(f, ms); };
    this.clearTimer = o.clearTimeout || function (h) { clearTimeout(h); };
    this.rng = o.rng || Math.random;
    this.turnMs = (o.turnSeconds || 30) * 1000;
    this.offlineMs = o.offlineMs || 8000;
    this.botDelay = o.botDelay || [900, 1500];
    this.collectMs = o.collectMs != null ? o.collectMs : 1900;
    this.autoStartMs = o.autoStartMs != null ? o.autoStartMs : 1800;
    this.onChange = o.onChange || function () {};
    this.onRoundEnd = o.onRoundEnd || function () {};

    this.seats = [null, null, null, null]; // {id, name, photo, bot, auto, offlineSince}; 0 va 2 — 1-jamoa, 1 va 3 — 2-jamoa
    this.spectators = new Map();
    this.online = new Map();
    this.hostId = null;
    this.phase = 'lobby'; // lobby | playing | roundEnd
    this.game = null;
    this.round = 0;
    this.firstLeader = -1;
    this.score = [0, 0];      // match ballari
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
    this.lastActive = this.now();
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
  P.changed = function () { this.touch(); if (!this.destroyed) this.onChange(this); };
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
      const h = this.seats.find(function (s) { return s && !s.bot && !s.auto; });
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
  P.connect = function (user) {
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
      this.addHuman(user, this.firstFree());
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
    this.seats[idx] = { id: user.id, name: user.name, photo: user.photo || null, bot: false, auto: false, offlineSince: 0 };
    this.spectators.delete(user.id);
    if (!this.hostId) this.hostId = user.id;
    this.checkAutoStart();
  };

  // Lobbida uzoq vaqt oflayn boʻlganlarni chiqarish
  P.sweep = function () {
    if (this.phase !== 'lobby') return false;
    const now = this.now();
    let ch = false;
    for (let i = 0; i < SEATS; i++) {
      const s = this.seats[i];
      if (s && !s.bot && !this.isOnline(s.id) && s.offlineSince && now - s.offlineSince >= 30000) { this.seats[i] = null; ch = true; }
    }
    if (ch) { this.fixHost(); this.clearLobbyTimer(); this.changed(); }
    return ch;
  };

  P.isIdle = function (maxIdleMs) { return this.onlineCount() === 0 && this.now() - this.lastActive > maxIdleMs; };

  P.destroy = function () {
    this.destroyed = true;
    if (this.timer) this.clearTimer(this.timer);
    if (this.lobbyTimer) this.clearTimer(this.lobbyTimer);
    this.timer = this.lobbyTimer = null;
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
      case 'act': return this.act(uid, m.action);
      case 'next': return this.nextRound(uid);
      case 'lobby': return this.backToLobby(uid);
      case 'setting': return this.setSetting(uid, m.key, m.value);
    }
    return 'Nomaʼlum buyruq';
  };

  P.sit = function (uid, seatIdx) {
    const idx = typeof seatIdx === 'number' && seatIdx >= 0 && seatIdx < SEATS ? seatIdx : -1;
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
      this.seats[t] = { id: user.id, name: user.name, photo: user.photo || null, bot: false, auto: false, offlineSince: 0 };
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
    if (this.phase === 'lobby') {
      this.seats[i] = null;
      if (this.isOnline(uid)) this.spectators.set(uid, { id: uid, name: s.name, photo: s.photo });
      this.fixHost();
      this.clearLobbyTimer();
    } else {
      s.auto = true; // oʻrniga kompyuter oʻynaydi
      this.fixHost();
      this.reschedule();
    }
    this.changed();
    return null;
  };

  P.addBot = function (uid, seatIdx) {
    if (this.phase !== 'lobby') return 'Botni faqat lobbida qoʻshish mumkin';
    if (!this.isHost(uid)) return 'Faqat stol egasi bot qoʻsha oladi';
    const t = typeof seatIdx === 'number' && seatIdx >= 0 && seatIdx < SEATS && !this.seats[seatIdx] ? seatIdx : this.firstFree();
    if (t < 0) return 'Boʻsh oʻrin yoʻq';
    this.seats[t] = this.makeBot();
    this.checkAutoStart();
    this.changed();
    return null;
  };

  P.fillBots = function (uid) {
    if (this.phase !== 'lobby') return 'Faqat lobbida mumkin';
    if (!this.isHost(uid)) return 'Faqat stol egasi';
    if (this.firstFree() < 0) return 'Boʻsh oʻrin yoʻq';
    for (let i = 0; i < SEATS; i++) if (!this.seats[i]) this.seats[i] = this.makeBot();
    this.checkAutoStart();
    this.changed();
    return null;
  };

  P.kick = function (uid, idx) {
    if (this.phase !== 'lobby') return 'Faqat lobbida mumkin';
    if (!this.isHost(uid)) return 'Faqat stol egasi';
    const s = this.seats[idx];
    if (!s) return 'Oʻrin topilmadi';
    if (!s.bot && this.isOnline(s.id)) return 'Onlayn oʻyinchini chiqarib boʻlmaydi';
    this.seats[idx] = null;
    this.fixHost();
    this.clearLobbyTimer();
    this.changed();
    return null;
  };

  P.checkAutoStart = function () {
    if (this.phase !== 'lobby' || this.filled() < SEATS || this.lobbyTimer) return;
    const self = this;
    this.lobbyTimer = this.setTimer(function () {
      self.lobbyTimer = null;
      if (self.phase === 'lobby' && self.filled() === SEATS && !self.destroyed) {
        self.beginRound();
        self.changed();
      }
    }, this.autoStartMs);
  };
  P.clearLobbyTimer = function () { if (this.lobbyTimer) { this.clearTimer(this.lobbyTimer); this.lobbyTimer = null; } };

  P.start = function (uid) {
    if (this.phase !== 'lobby') return 'Oʻyin allaqachon boshlangan';
    if (!this.isHost(uid)) return 'Faqat stol egasi boshlay oladi';
    if (this.filled() < SEATS) return '4 kishi kerak — boʻsh oʻrinlarga bot qoʻshing';
    this.beginRound();
    this.changed();
    return null;
  };

  P.beginRound = function () {
    this.clearLobbyTimer();
    if (this.matchOver) { this.score = [0, 0]; this.matchOver = false; this.matchNo++; }
    // birinchi yurish har raundda navbat bilan almashadi
    this.firstLeader = this.firstLeader < 0 ? Math.floor(this.rng() * SEATS) : (this.firstLeader + 1) % SEATS;
    this.phase = 'playing';
    this.round++;
    this.lastResult = null;
    this.game = E.newRound({ leader: this.firstLeader, rng: this.rng });
    const evs = E.takeEvents(this.game);
    this.setEvents([{ n: 0, kind: 'deal', seat: this.firstLeader, round: this.round }].concat(evs));
    if (this.game.phase === 'roundEnd') this.finishRound();
    this.reschedule();
  };

  P.act = function (uid, action) {
    if (this.phase !== 'playing' || !this.game) return 'Oʻyin ketmayapti';
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
    if (r.team >= 0 && r.award) this.score[r.team] += r.award;
    let matchWinner = -1;
    if (this.score[0] >= E.MATCH || this.score[1] >= E.MATCH) {
      matchWinner = this.score[0] >= E.MATCH ? 0 : 1;
      this.matchOver = true;
      this.matchWins[matchWinner]++;
    }
    this.phase = 'roundEnd';
    this.lastResult = Object.assign({}, E.resultView(this.game), {
      round: this.round,
      score: this.score.slice(),
      matchOver: this.matchOver,
      matchWinner: matchWinner,
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
    this.beginRound();
    this.changed();
    return null;
  };

  P.backToLobby = function (uid) {
    if (this.phase !== 'roundEnd') return 'Faqat raund oxirida mumkin';
    if (!this.isHost(uid)) return 'Faqat stol egasi';
    for (let i = 0; i < SEATS; i++) {
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
    if (this.destroyed || this.phase !== 'playing' || !this.game) return;
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
      const a = E.AI.choose(g, seatIdx, {});
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
      phase: this.phase,
      round: this.round,
      mySeat: mySeat,
      myTeam: mySeat >= 0 ? E.teamOf(mySeat) : -1,
      isHost: this.isHost(uid),
      spectator: mySeat < 0,
      spectators: this.spectators.size,
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
          team: E.teamOf(i)
        };
      }),
      score: this.score.slice(),
      target: E.MATCH,
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
