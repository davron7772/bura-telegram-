'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine');
const { Room } = require('../src/room');

function fakeClock() {
  let t = 1000, id = 0;
  const q = new Map();
  return {
    now: () => t,
    setTimeout: (f, ms) => { const h = ++id; q.set(h, { at: t + ms, f }); return h; },
    clearTimeout: (h) => { q.delete(h); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [h, x] of q) if (x.at <= end && (!next || x.at < next[1].at)) next = [h, x];
        if (!next) break;
        q.delete(next[0]);
        t = next[1].at;
        next[1].f();
      }
      t = end;
    }
  };
}

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Stats, judge } = require('../src/stats');

const st = (o) => Object.assign({ phase: 'follow', trump: 'S', turn: 1 }, o);

test('tahlil: raqib olayotganda urish mumkin edi, lekin tashladi — xato', () => {
  const s = st({ trick: { best: 0, plays: [{ seat: 0, cards: ['10H'] }] }, hands: [[], ['AH', '6C', '7D', '8C']] });
  assert.equal(judge(s, 1, { type: 'discard', cards: ['6C'] }), false);
  assert.equal(judge(s, 1, { type: 'beat', cards: ['AH'] }), true);
});
test('tahlil: sherik olayotganda ochko tashlash — toʻgʻri, sherikni koʻzir bilan urish — xato', () => {
  const s = st({ turn: 2, trick: { best: 0, plays: [{ seat: 0, cards: ['AH'] }, { seat: 1, cards: ['6C'] }] }, hands: [[], [], ['10D', '6S', '7C', '8C']] });
  assert.equal(judge(s, 2, { type: 'discard', cards: ['10D'] }), true);
  assert.equal(judge(s, 2, { type: 'beat', cards: ['6S'] }), false);
});
test('tahlil: tuzni raqibga berish — xato; vaqt tugasa — xato; yurish boshlash — toʻgʻri', () => {
  const s = st({ trick: { best: 0, plays: [{ seat: 0, cards: ['AS'] }] }, hands: [[], ['AH', '6C', '7D', '8C']] });
  assert.equal(judge(s, 1, { type: 'discard', cards: ['AH'] }), false);
  assert.equal(judge(s, 1, { type: 'discard', cards: ['6C'] }), true);
  assert.equal(judge(s, 1, { type: 'discard', cards: ['6C'] }, true), false);
  assert.equal(judge(st({ phase: 'lead' }), 0, { type: 'lead', cards: ['6C'] }), true);
});

test('statistika: oʻyinda yigʻiladi, botlar hisoblanmaydi, faylga saqlanadi', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bura-')), 'stats.json');
  const stats = new Stats({ file });
  const c = fakeClock();
  const r = new Room({ id: 'x', stats, now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, turnSeconds: 1, botDelay: [10, 20], collectMs: 20, autoStartMs: 50 });
  r.connect({ id: 'a', name: 'Ali' });
  r.fillBots('a');
  r.disconnect('a');
  let rounds = 0;
  for (let k = 0; k < 5000 && rounds < 3; k++) {
    c.advance(500);
    if (r.phase === 'roundEnd') { rounds++; r.connect({ id: 'a', name: 'Ali' }); r.dispatch('a', { t: 'next' }); r.disconnect('a'); }
  }
  const me = stats.me('a');
  assert.ok(me && me.rounds === 3, JSON.stringify(me));
  assert.ok(me.moves > 0);
  assert.equal(stats.list().length, 1); // botlar yoʻq
  assert.ok(me.eff >= 0 && me.eff <= 100);
  stats.flush();
  const again = new Stats({ file });
  assert.equal(again.me('a').rounds, 3);
  assert.equal(again.list()[0].ranked, true);
});

test('Yandex Disk: avval oʻqiydi, keyin yozadi; 404 — yangi fayl', async () => {
  const { YaDisk } = require('../src/yadisk');
  let stored = null; const calls = [];
  const fakeFetch = async (url, init) => {
    init = init || {};
    calls.push((init.method || 'GET') + ' ' + url.split('?')[0]);
    const json = (o, st) => ({ ok: (st || 200) < 400, status: st || 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (url.includes('/resources/download')) return stored == null ? json({}, 404) : json({ href: 'https://dl/x' });
    if (url.includes('/resources/upload')) { assert.equal(init.headers.Authorization, 'OAuth T'); return json({ href: 'https://up/x' }); }
    if (url === 'https://dl/x') return { ok: true, status: 200, text: async () => stored };
    if (url === 'https://up/x') { stored = init.body; return { ok: true, status: 201 }; }
    throw new Error('kutilmagan ' + url);
  };
  const s1 = new Stats({ remote: new YaDisk({ token: 'T', fetch: fakeFetch }), remoteMs: 10 });
  await s1.loadRemote();
  s1.round({ id: 'a', name: 'Ali' }, { won: true, points: 70, n: 4 });
  await s1.flushRemote();
  assert.ok(stored && JSON.parse(stored).users[0].id === 'a');
  const s2 = new Stats({ remote: new YaDisk({ token: 'T', fetch: fakeFetch }) });
  await s2.loadRemote();
  assert.equal(s2.me('a').rounds, 1);
  // oʻqilmaguncha yozmaydi: pushRemote avval loadRemote qiladi
  const s3 = new Stats({ remote: new YaDisk({ token: 'T', fetch: fakeFetch }) });
  s3.round({ id: 'b', name: 'Vali' }, { won: false, points: 20, n: 4 });
  await s3.flushRemote();
  const users = JSON.parse(stored).users.map((u) => u.id).sort();
  assert.deepEqual(users, ['a', 'b']);
  clearTimeout(s1.rtimer); clearTimeout(s3.rtimer);
});

test('tashriflar: kirishlar, kunlar va oʻynalgan vaqt', () => {
  let now = Date.UTC(2026, 10, 14, 10);
  const s = new Stats({ now: () => now });
  s.visit({ id: 'a', name: 'Ali' }); s.visit({ id: 'a', name: 'Ali' });
  for (let k = 0; k < 10; k++) s.online({ id: 'a' }, 3 * 60000, true);
  s.online({ id: 'a' }, 60 * 60000, false); // 5 daqiqadan oshgani kesiladi
  now += 24 * 3600000; s.visit({ id: 'a', name: 'Ali' }); s.visit({ id: 'b', name: 'Vali' });
  const t = s.total();
  assert.equal(t.players, 2); assert.equal(t.visits, 4);
  const a = s.users.get('a');
  assert.equal(a.days, 2); assert.equal(a.playMs, 30 * 60000); assert.equal(a.appMs, 35 * 60000);
});
