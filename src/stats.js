'use strict';
// Oʻyinchilar samaradorligi: har bir yurish tahlil qilinadi (toʻgʻri / xato),
// raund natijalari va olingan ochkolar yigʻiladi. Faqat odamlar hisoblanadi (botlar emas).
//
// Samaradorlik (0–100%) = 50% toʻgʻri yurishlar ulushi
//                       + 25% olingan ochko (oʻrtacha ulushga nisbatan; oʻrtacha = 50%)
//                       + 25% yutilgan raundlar ulushi

const fs = require('fs');
const path = require('path');
const E = require('./engine');

const MIN_ROUNDS = 3; // reytingda koʻrinish uchun

// Yurish oldidan holatni tahlil qilish. Natija: true — toʻgʻri, false — xato, null — baholanmaydi
function judge(st, seat, a, auto) {
  if (auto) return false; // vaqt tugadi — kompyuter yurdi
  if (!a || !st) return null;
  if (a.type === 'lead') return true;
  if (a.type !== 'beat' && a.type !== 'discard') return null;
  const t = st.trick;
  if (!t || st.phase !== 'follow' || st.turn !== seat) return null;
  const best = t.plays[t.best];
  const partner = E.teamOf(best.seat) === E.teamOf(seat) && best.seat !== seat;
  let stake = 0;
  t.plays.forEach(function (p) { stake += E.sumPoints(p.cards); });
  const mine = E.sumPoints(a.cards);
  const trumps = a.cards.filter(function (c) { return E.suitOf(c) === st.trump; }).length;
  if (a.type === 'beat') {
    if (!partner) return true;
    // sherikni urish: koʻzir sarflash — isrof
    return trumps > 0 ? false : null;
  }
  // tashlash
  if (partner) return true; // sherik olayapti — tashlash (ochko berish) toʻgʻri
  const could = E.canBeatWith(st.hands[seat], best.cards, st.trump);
  if (could && stake + mine >= 10) return false; // urib olish mumkin edi
  if (mine >= 10) return false; // tuz/oʻnlikni raqibga berib yubordi
  return true;
}

function Stats(opts) {
  opts = opts || {};
  this.file = opts.file || null;
  this.now = opts.now || Date.now;
  this.users = new Map();
  this.daily = {};   // 'YYYY-MM-DD' (Toshkent) -> { u: [id...], v, r, ms }
  this.groups = {};  // chatId -> { t: nom, a: qoʻshilgan, s: oxirgi faollik, on }
  this.owner = '';   // /statistika koʻra oladigan yagona foydalanuvchi
  this.timer = null;
  this.remote = opts.remote || null;   // Yandex Disk (read/write)
  this.remoteMs = opts.remoteMs || 30000;
  this.remoteOk = !this.remote;        // masofadagi fayl oʻqilmaguncha unga yozmaymiz (ustidan yozib yubormaslik uchun)
  this.rtimer = null;
  this.dirty = false;
  this.load();
}
const P = Stats.prototype;

P.load = function () {
  if (!this.file) return;
  let data;
  try { data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) { return; }
  if (data && Array.isArray(data.users)) {
    for (const u of data.users) if (u && u.id) this.users.set(String(u.id), u);
  }
  if (data && data.daily && typeof data.daily === 'object') this.daily = data.daily;
  if (data && data.groups && typeof data.groups === 'object') this.groups = data.groups;
  if (data && data.owner) this.owner = String(data.owner);
};

P.serialize = function () {
  return JSON.stringify({ v: 2, owner: this.owner, users: Array.from(this.users.values()), daily: this.daily, groups: this.groups });
};

// Masofadagi fayldan yuklash: koʻproq oʻynalgan yozuv ustun
P.loadRemote = async function () {
  if (!this.remote) return;
  const text = await this.remote.read();
  if (text) {
    const data = JSON.parse(text);
    for (const u of (data && data.users) || []) {
      if (!u || !u.id) continue;
      const id = String(u.id), cur = this.users.get(id);
      if (!cur || (u.rounds + u.moves) >= (cur.rounds + cur.moves)) this.users.set(id, u);
    }
  }
  this.remoteOk = true;
};

P.pushRemote = async function () {
  if (!this.remote) return;
  if (!this.remoteOk) await this.loadRemote();
  this.dirty = false;
  await this.remote.write(this.serialize());
};

P.scheduleRemote = function () {
  if (!this.remote || this.rtimer) return;
  const self = this;
  this.rtimer = setTimeout(function () {
    self.rtimer = null;
    self.pushRemote().catch(function (e) { self.dirty = true; console.error('[stats]', e.message); self.scheduleRemote(); });
  }, this.remoteMs);
  if (this.rtimer.unref) this.rtimer.unref();
};

// Toʻxtashdan oldin: kutilayotgan oʻzgarishlarni darhol yozish
P.flushRemote = async function () {
  if (!this.remote || !this.dirty) return;
  if (this.rtimer) { clearTimeout(this.rtimer); this.rtimer = null; }
  await this.pushRemote();
};

P.save = function () {
  this.dirty = true;
  this.scheduleRemote();
  if (!this.file || this.timer) return;
  const self = this;
  this.timer = setTimeout(function () {
    self.timer = null;
    self.flush();
  }, 3000);
  if (this.timer.unref) this.timer.unref();
};

P.flush = function () {
  if (!this.file) return;
  try {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, this.serialize());
    fs.renameSync(tmp, this.file);
  } catch (e) { console.error('[stats] saqlab boʻlmadi:', e.message); }
};

P.user = function (who) {
  const id = String(who.id);
  let u = this.users.get(id);
  if (!u) {
    u = { id: id, name: '', photo: '', rounds: 0, wins: 0, draws: 0, points: 0, fair: 0, good: 0, moves: 0, auto: 0, at: 0,
      first: this.now(), visits: 0, days: 0, day: '', appMs: 0, playMs: 0 };
    this.users.set(id, u);
  }
  if (who.name) u.name = String(who.name).slice(0, 64);
  if (who.photo) u.photo = String(who.photo).slice(0, 512);
  u.at = this.now();
  return u;
};

// Ilovaga kirish (har bir ulanish)
P.visit = function (who) {
  if (!who || who.bot) return;
  const u = this.user(who);
  if (!u.first) u.first = this.now();
  u.visits = (u.visits || 0) + 1;
  const day = this.dayKey();
  if (u.day !== day) { u.day = day; u.days = (u.days || 0) + 1; }
  const d = this.today();
  d.v++;
  if (d.u.indexOf(u.id) < 0) d.u.push(u.id);
  this.save();
};

// ---------- kunlik va guruh statistikasi ----------
const DAY_MS = 86400000, KEEP_DAYS = 400;
P.dayKey = function (t) {
  return new Date((t == null ? this.now() : t) + 5 * 3600 * 1000).toISOString().slice(0, 10); // Toshkent vaqti
};
P.today = function () {
  const k = this.dayKey();
  let d = this.daily[k];
  if (!d) {
    d = this.daily[k] = { u: [], v: 0, r: 0, ms: 0 };
    const keys = Object.keys(this.daily).sort();
    while (keys.length > KEEP_DAYS) delete this.daily[keys.shift()];
  }
  return d;
};
// Stolda bitta raund tugadi (stol boʻyicha bir marta)
P.tableRound = function () { this.today().r++; this.save(); };

P.group = function (chat, on) {
  if (!chat || chat.id == null) return;
  const id = String(chat.id);
  let g = this.groups[id];
  if (!g) g = this.groups[id] = { t: '', a: this.now(), s: 0, on: true };
  if (chat.title) g.t = String(chat.title).slice(0, 80);
  if (on === false) g.on = false;
  else {
    g.on = true;
    const t = this.now();
    if (t - (g.s || 0) < 60000 && !chat.title) return; // tez-tez yozmaslik
    g.s = t;
  }
  this.save();
};

// Davr boʻyicha: oxirgi `days` kun (bugun ham kiradi)
P.period = function (days) {
  const set = new Set(), from = this.dayKey(this.now() - (days - 1) * DAY_MS);
  let v = 0, r = 0, ms = 0;
  for (const k in this.daily) {
    if (k < from) continue;
    const d = this.daily[k];
    d.u.forEach(function (id) { set.add(id); });
    v += d.v || 0; r += d.r || 0; ms += d.ms || 0;
  }
  let fresh = 0;
  for (const u of this.users.values()) if (u.first && this.dayKey(u.first) >= from) fresh++;
  return { users: set.size, visits: v, rounds: r, playH: Math.round(ms / 360000) / 10, fresh: fresh };
};

P.report = function () {
  const self = this, now = this.now();
  const gs = Object.keys(this.groups).map(function (k) { return self.groups[k]; });
  const active = gs.filter(function (g) { return g.on; });
  return {
    today: this.period(1), week: this.period(7), month: this.period(30),
    total: this.total(),
    groups: active.length,
    groupsLeft: gs.length - active.length,
    groups7: active.filter(function (g) { return g.s && now - g.s < 7 * DAY_MS; }).length,
    groupList: Object.keys(this.groups).map(function (id) { return Object.assign({ id: id }, self.groups[id]); })
      .sort(function (a, b) { return (b.on - a.on) || (b.s || 0) - (a.s || 0); }),
    top: this.list(100).filter(function (u) { return u.rounds > 0; })
      .sort(function (a, b) { return b.rounds - a.rounds; }).slice(0, 5)
  };
};

// Ilovada oʻtkazilgan vaqt; seated — stolda oʻtirib oʻynagan vaqt
P.online = function (who, ms, seated) {
  if (!who || who.bot || !(ms > 0)) return;
  ms = Math.min(ms, 5 * 60 * 1000); // uzilish/uyqu boʻlsa — ortiqcha hisoblamaymiz
  const u = this.users.get(String(who.id));
  if (!u) return;
  u.appMs = (u.appMs || 0) + ms;
  if (seated) { u.playMs = (u.playMs || 0) + ms; this.today().ms += ms; }
  this.save();
};

// Umumiy koʻrsatkichlar
P.total = function () {
  let t = { players: 0, visits: 0, rounds: 0, appH: 0, playH: 0, since: 0 };
  for (const u of this.users.values()) {
    t.players++;
    t.visits += u.visits || 0;
    t.rounds += u.rounds || 0;
    t.appH += (u.appMs || 0) / 3600000;
    t.playH += (u.playMs || 0) / 3600000;
    if (u.first && (!t.since || u.first < t.since)) t.since = u.first;
  }
  t.appH = Math.round(t.appH * 10) / 10;
  t.playH = Math.round(t.playH * 10) / 10;
  return t;
};

// Bitta yurish
P.move = function (who, verdict, auto) {
  if (!who || who.bot || verdict == null) return;
  const u = this.user(who);
  u.moves++;
  if (verdict) u.good++;
  if (auto) u.auto++;
  this.save();
};

// Raund tugadi: won — true/false, draw — true; points — olgan ochkosi; n — oʻyinchilar soni
P.round = function (who, o) {
  if (!who || who.bot) return;
  const u = this.user(who);
  if (u.xp == null) u.xp = u.rounds; // eski yozuvlar: hammasi odamlar bilan deb olinadi
  u.rounds++;
  u.xp += o.vsBot ? 0.5 : 1;          // faqat botlarga qarshi raund — yarim tajriba
  if (o.draw) u.draws++;
  else if (o.won) u.wins++;
  u.points += o.points || 0;
  u.fair += 120 / (o.n || 4); // oʻrtacha ulush (4 kishida 30, 2 kishida 60)
  this.save();
};

// ---------- reyting ----------
// Mahorat (0–100): toʻgʻri yurishlar 50% + yutish 30% + olingan ochko 20%.
// Kam oʻynaganning natijasi tasodifiy boʻlishi mumkin, shuning uchun u oʻrtacha
// darajaga (50) tortiladi: PRIOR_ROUNDS raund oʻynagandagina oʻz natijasi yarim kuchga kiradi.
// Tajriba: har raund ball qoʻshadi (botlarga qarshi — yarmi), lekin oʻsishi sekinlashadi.
// Reyting = mahorat × 10 + tajriba.
const PRIOR_ROUNDS = 20, PRIOR = 50;
function rawSkill(u) {
  const q = u.moves ? u.good / u.moves : 0.5;
  const win = u.rounds ? (u.wins + u.draws * 0.5) / u.rounds : 0.5;
  const pts = u.fair ? Math.min(1, (u.points / u.fair) * 0.5) : 0.5;
  return (q * 0.5 + win * 0.3 + pts * 0.2) * 100;
}
function skillOf(u) {
  const n = u.rounds || 0;
  return (rawSkill(u) * n + PRIOR * PRIOR_ROUNDS) / (n + PRIOR_ROUNDS);
}
function xpOf(u) {
  const r = u.xp != null ? u.xp : (u.rounds || 0);
  return Math.round(150 * Math.log(1 + r / 10));
}
function ratingOf(u) { return Math.round(skillOf(u) * 10) + xpOf(u); }

function effOf(u) {
  const q = u.moves ? u.good / u.moves : 0;
  const pts = u.fair ? Math.min(1, (u.points / u.fair) * 0.5) : 0;
  const win = u.rounds ? (u.wins + u.draws * 0.5) / u.rounds : 0;
  return Math.round((q * 0.5 + pts * 0.25 + win * 0.25) * 100);
}

P.view = function (u) {
  return {
    id: u.id,
    name: u.name || 'Oʻyinchi',
    photo: u.photo || '',
    rounds: u.rounds,
    eff: effOf(u),
    skill: Math.round(skillOf(u)),
    xp: xpOf(u),
    rating: ratingOf(u),
    acc: u.moves ? Math.round((u.good / u.moves) * 100) : 0,
    win: u.rounds ? Math.round(((u.wins + u.draws * 0.5) / u.rounds) * 100) : 0,
    avg: u.rounds ? Math.round(u.points / u.rounds) : 0,
    moves: u.moves,
    visits: u.visits || 0,
    days: u.days || 0,
    playH: Math.round(((u.playMs || 0) / 3600000) * 10) / 10,
    ranked: u.rounds >= MIN_ROUNDS
  };
};

// Reyting: yetarli raund oʻynaganlar samaradorlik boʻyicha, keyin qolganlar
P.list = function (limit) {
  const all = Array.from(this.users.values()).filter(function (u) { return u.rounds > 0 || u.moves > 0; }).map(this.view, this);
  all.sort(function (a, b) {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    return b.rating - a.rating || b.rounds - a.rounds;
  });
  return all.slice(0, limit || 100);
};

P.me = function (id) {
  const u = this.users.get(String(id));
  return u ? this.view(u) : null;
};

module.exports = { Stats: Stats, judge: judge, effOf: effOf, skillOf: skillOf, xpOf: xpOf, ratingOf: ratingOf, MIN_ROUNDS: MIN_ROUNDS };

// Xona uchun: yurishni tahlil qilib yozish
Stats.prototype.check = function (st, seat, a, auto, who) {
  if (!who || who.bot) return;
  this.move(who, judge(st, seat, a, auto), auto);
};
