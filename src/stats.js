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
};

P.serialize = function () {
  return JSON.stringify({ v: 1, users: Array.from(this.users.values()) });
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
    u = { id: id, name: '', photo: '', rounds: 0, wins: 0, draws: 0, points: 0, fair: 0, good: 0, moves: 0, auto: 0, at: 0 };
    this.users.set(id, u);
  }
  if (who.name) u.name = String(who.name).slice(0, 64);
  if (who.photo) u.photo = String(who.photo).slice(0, 512);
  u.at = this.now();
  return u;
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
  u.rounds++;
  if (o.draw) u.draws++;
  else if (o.won) u.wins++;
  u.points += o.points || 0;
  u.fair += 120 / (o.n || 4); // oʻrtacha ulush (4 kishida 30, 2 kishida 60)
  this.save();
};

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
    acc: u.moves ? Math.round((u.good / u.moves) * 100) : 0,
    win: u.rounds ? Math.round(((u.wins + u.draws * 0.5) / u.rounds) * 100) : 0,
    avg: u.rounds ? Math.round(u.points / u.rounds) : 0,
    moves: u.moves,
    ranked: u.rounds >= MIN_ROUNDS
  };
};

// Reyting: yetarli raund oʻynaganlar samaradorlik boʻyicha, keyin qolganlar
P.list = function (limit) {
  const all = Array.from(this.users.values()).filter(function (u) { return u.rounds > 0 || u.moves > 0; }).map(this.view, this);
  all.sort(function (a, b) {
    if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
    return b.eff - a.eff || b.rounds - a.rounds;
  });
  return all.slice(0, limit || 100);
};

P.me = function (id) {
  const u = this.users.get(String(id));
  return u ? this.view(u) : null;
};

module.exports = { Stats: Stats, judge: judge, effOf: effOf, MIN_ROUNDS: MIN_ROUNDS };

// Xona uchun: yurishni tahlil qilib yozish
Stats.prototype.check = function (st, seat, a, auto, who) {
  if (!who || who.bot) return;
  this.move(who, judge(st, seat, a, auto), auto);
};
