'use strict';
/* Doʻst va guruh taklif dasturi: tasdiqlangan doʻstlar/guruhlar uchun Telegram Premium.
   Maʼlumotlar Stats ichida saqlanadi (users[].refBy…, groups[].by…, stats.claims). */

const DAY_MS = 86400000;
const FRIEND_ROUNDS = 10;   // odamlarga qarshi (taklif qilgan odamsiz) raundlar
const FRIEND_DAYS = 2;      // kamida shuncha xil kunda
const GROUP_MEMBERS = 15;
const GROUP_PLAYERS = 4;    // kamida shuncha odam…
const GROUP_PLAYER_ROUNDS = 5; // …shuncha raunddan oʻynagan boʻlsin
const GROUP_DAYS = 7;       // bot guruhda kamida shuncha kun turgan boʻlsin
const TIERS = [
  { months: 3, stars: 1000, friends: 30, groups: 5 },
  { months: 6, stars: 1500, friends: 50, groups: 10 },
  { months: 12, stars: 2500, friends: 60, groups: 20 }
];

function tgNum(id) { const m = /^tg:(\d+)$/.exec(String(id || '')); return m ? Number(m[1]) : 0; }

function Referral(stats, opts) {
  opts = opts || {};
  this.stats = stats;
  this.onEvent = opts.onEvent || function () {}; // (type, data) — bot xabar yuboradi
  if (!Array.isArray(stats.claims)) stats.claims = [];
}
const P = Referral.prototype;

// startParam: "r123" yoki "<stol>_r123" — taklif qilganni ajratib oladi
Referral.parseStart = function (raw) {
  let ref = '', rest = [];
  String(raw || '').split('_').forEach(function (p) {
    const m = /^r(\d{1,15})$/i.exec(p);
    if (m && !ref) ref = 'tg:' + m[1]; else if (p) rest.push(p);
  });
  return { ref: ref, route: rest.join('_') };
};

// Yangi oʻyinchini taklif qilganga bogʻlash (faqat birinchi marta kirganda)
P.attach = function (user, refId, isNew) {
  const S = this.stats;
  if (!refId || !user || user.bot || refId === user.id) return false;
  if (!S.users.has(refId)) return false;
  const u = S.user(user);
  if (u.refBy || !isNew) return false;
  u.refBy = refId; u.refAt = S.now(); u.hx = 0; u.hd = 0; u.hdDay = '';
  S.save();
  this.onEvent('friend_joined', { inviter: refId, friend: u.id, name: u.name });
  return true;
};

// Raund tugadi — stats.round dan chaqiriladi
P.round = function (u, o) {
  const S = this.stats;
  // doʻst tasdiqlanishi
  if (u.refBy && !u.refOk && o.vsHuman && !(o.ids || []).includes(u.refBy)) {
    u.hx = (u.hx || 0) + 1;
    const day = S.dayKey();
    if (u.hdDay !== day) { u.hdDay = day; u.hd = (u.hd || 0) + 1; }
    if (u.hx >= FRIEND_ROUNDS && u.hd >= FRIEND_DAYS) {
      u.refOk = S.now();
      const inv = S.users.get(u.refBy);
      if (inv) {
        inv.fr = (inv.fr || 0) + 1; inv.frAll = (inv.frAll || 0) + 1;
        this.onEvent('friend_ok', { inviter: inv.id, friend: u.id, name: u.name, count: inv.fr });
      }
    }
  }
  // guruhdagi oʻyinchilar
  if (o.chatId && Number(o.chatId) < 0) {
    const g = S.groups[String(o.chatId)];
    if (g && g.by && !g.ok) {
      g.pl = g.pl || {};
      if (g.pl[u.id] != null || Object.keys(g.pl).length < 300) g.pl[u.id] = (g.pl[u.id] || 0) + 1;
    }
  }
};

// Botni guruhga kim qoʻshgani
P.groupAdded = function (chat, fromId) {
  const S = this.stats, id = String(chat.id);
  const g = S.groups[id];
  if (!g || g.by || !fromId) return;
  if (S.now() - (g.a || 0) > 120000) return; // bot bu guruhda avval ham boʻlgan — yangi qoʻshish emas
  const uid = 'tg:' + fromId;
  g.by = uid; g.byAt = S.now();
  if (!S.users.has(uid)) S.user({ id: uid, name: '' });
  S.save();
};

P.groupProgress = function (g) {
  const pl = g.pl || {};
  const players = Object.keys(pl).filter(function (k) { return pl[k] >= GROUP_PLAYER_ROUNDS && k !== g.by; }).length;
  const days = Math.floor((this.stats.now() - (g.byAt || g.a || 0)) / DAY_MS);
  return { players: players, members: typeof g.m === 'number' ? g.m : null, days: days };
};

// Tasdiqlashga tayyor guruhlar (aʼzolar sonini bot tekshiradi)
P.groupsToCheck = function () {
  const S = this.stats, self = this;
  return Object.keys(S.groups).filter(function (id) {
    const g = S.groups[id];
    if (!g.by || g.ok || !g.on) return false;
    const p = self.groupProgress(g);
    return p.players >= GROUP_PLAYERS && p.days >= GROUP_DAYS;
  });
};

P.groupMembers = function (id, count) {
  const S = this.stats, g = S.groups[String(id)];
  if (!g) return;
  if (typeof count === 'number') g.m = count;
  if (!g.by || g.ok || !g.on) return S.save();
  const p = this.groupProgress(g);
  if (p.players >= GROUP_PLAYERS && p.days >= GROUP_DAYS && g.m >= GROUP_MEMBERS) {
    g.ok = S.now();
    const u = S.users.get(g.by);
    if (u) {
      u.gr = (u.gr || 0) + 1; u.grAll = (u.grAll || 0) + 1;
      this.onEvent('group_ok', { inviter: u.id, title: g.t || '', count: u.gr });
    }
  }
  S.save();
};

// Oʻyinchi uchun koʻrinish
P.view = function (uid, link) {
  const S = this.stats, self = this, u = S.users.get(String(uid)) || {};
  const friends = [];
  for (const f of S.users.values()) {
    if (f.refBy !== u.id || !u.id) continue;
    friends.push({ name: f.name || 'Oʻyinchi', ok: !!f.refOk, rounds: Math.min(f.hx || 0, FRIEND_ROUNDS), days: Math.min(f.hd || 0, FRIEND_DAYS), at: f.refAt || 0 });
  }
  friends.sort(function (a, b) { return (a.ok - b.ok) || b.at - a.at; });
  const groups = [];
  Object.keys(S.groups).forEach(function (id) {
    const g = S.groups[id];
    if (!u.id || g.by !== u.id) return;
    const p = self.groupProgress(g);
    groups.push({ title: g.t || 'Guruh', ok: !!g.ok, on: !!g.on, players: Math.min(p.players, GROUP_PLAYERS),
      members: p.members, days: Math.min(p.days, GROUP_DAYS) });
  });
  groups.sort(function (a, b) { return a.ok - b.ok; });
  const claims = S.claims.filter(function (c) { return c.uid === u.id; }).slice(-5)
    .map(function (c) { return { months: c.months, kind: c.kind, status: c.status, at: c.at }; });
  return {
    link: link || '', fr: u.fr || 0, gr: u.gr || 0, frAll: u.frAll || 0, grAll: u.grAll || 0,
    friends: friends.slice(0, 60), groups: groups.slice(0, 40), claims: claims, tiers: TIERS,
    rules: { friendRounds: FRIEND_ROUNDS, friendDays: FRIEND_DAYS, groupMembers: GROUP_MEMBERS,
      groupPlayers: GROUP_PLAYERS, groupRounds: GROUP_PLAYER_ROUNDS, groupDays: GROUP_DAYS },
    pending: claims.some(function (c) { return c.status === 'pending'; })
  };
};

// Sovgʻani soʻrash: balans darhol yechiladi (rad etilsa qaytariladi)
P.claim = function (uid, kind, months) {
  const S = this.stats, u = S.users.get(String(uid));
  const t = TIERS.find(function (x) { return x.months === Number(months); });
  if (!u || !t || (kind !== 'friends' && kind !== 'groups')) return { error: 'Notoʻgʻri soʻrov' };
  if (!tgNum(u.id)) return { error: 'Faqat Telegram orqali' };
  if (S.claims.some(function (c) { return c.uid === u.id && c.status === 'pending'; })) return { error: 'Oldingi soʻrovingiz hali koʻrib chiqilmoqda' };
  const need = kind === 'friends' ? t.friends : t.groups, key = kind === 'friends' ? 'fr' : 'gr';
  if ((u[key] || 0) < need) return { error: 'Shart hali bajarilmagan' };
  u[key] -= need;
  const c = { id: S.now().toString(36) + Math.random().toString(36).slice(2, 6), uid: u.id, name: u.name || '', kind: kind,
    need: need, months: t.months, stars: t.stars, at: S.now(), status: 'pending' };
  S.claims.push(c);
  if (S.claims.length > 500) S.claims.splice(0, S.claims.length - 500);
  S.save(); if (S.flush) S.flush();
  this.onEvent('claim', c);
  return { claim: c };
};

P.findClaim = function (id) { return this.stats.claims.find(function (c) { return c.id === id; }) || null; };

P.resolve = function (id, ok, err) {
  const S = this.stats, c = this.findClaim(id);
  if (!c || c.status !== 'pending') return null;
  if (ok) { c.status = 'sent'; c.doneAt = S.now(); }
  else {
    c.status = err ? 'failed' : 'rejected'; c.doneAt = S.now(); if (err) c.err = String(err).slice(0, 200);
    const u = S.users.get(c.uid);
    if (u) { const key = c.kind === 'friends' ? 'fr' : 'gr'; u[key] = (u[key] || 0) + c.need; } // balans qaytadi
  }
  S.save(); if (S.flush) S.flush();
  return c;
};

// Egasi uchun qisqa hisobot
P.summary = function () {
  const S = this.stats;
  let invited = 0, okF = 0;
  for (const u of S.users.values()) if (u.refBy) { invited++; if (u.refOk) okF++; }
  let gBy = 0, gOk = 0;
  Object.keys(S.groups).forEach(function (id) { const g = S.groups[id]; if (g.by) { gBy++; if (g.ok) gOk++; } });
  return { invited: invited, okFriends: okF, groupsBy: gBy, okGroups: gOk,
    pending: S.claims.filter(function (c) { return c.status === 'pending'; }).length,
    sent: S.claims.filter(function (c) { return c.status === 'sent'; }).length };
};

module.exports = { Referral: Referral, TIERS: TIERS, tgNum: tgNum };
