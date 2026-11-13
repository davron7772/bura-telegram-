'use strict';
/* 60:60 durang bonusi, vaqt tugaganda chap tarafdagi kartalar, kuzatuvchilar roʻyxati */
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
        q.delete(next[0]); t = next[1].at; next[1].f();
      }
      t = end;
    }
  };
}
const users = [1, 2, 3, 4, 5, 6].map((i) => ({ id: 'u' + i, name: 'Oʻyinchi ' + i }));
function playingRoom() {
  const c = fakeClock();
  const r = new Room({ id: 't1', now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, turnSeconds: 30, botDelay: [100, 200], collectMs: 500, autoStartMs: 1000 });
  for (let i = 0; i < 4; i++) r.connect(users[i]);
  c.advance(1000);
  return { r, c };
}
// Raund natijasini qoʻlda berib, hisobga yozish
function finish(r, result) {
  r.game.phase = 'roundEnd';
  r.game.result = Object.assign({ seat: -1, totals: [0, 0, 0, 0], points: [60, 60] }, result);
  r.finishRound();
  return r.lastResult;
}

test('60:60 — hech kimga ball yozilmaydi, keyingi yutqazganga +2 qoʻshiladi (ketma-ket durang — yigʻiladi)', () => {
  const { r } = playingRoom();
  const d = finish(r, { type: 'draw', team: -1, award: 0 });
  assert.deepEqual(r.score, [0, 0]);
  assert.equal(d.award, 0);
  assert.equal(d.nextBonus, 2);
  assert.equal(r.snapshot('u1').drawBonus, 2);

  r.beginRound();
  const w = finish(r, { type: 'win', team: 0, award: 4, points: [70, 50] });
  assert.deepEqual(r.score, [0, 6]); // 4 + 2
  assert.equal(w.award, 6);
  assert.equal(w.base, 4);
  assert.equal(w.bonus, 2);
  assert.equal(r.drawBonus, 0);

  r.beginRound();
  finish(r, { type: 'draw', team: -1, award: 0 });
  r.beginRound();
  finish(r, { type: 'draw', team: -1, award: 0 });
  assert.equal(r.drawBonus, 4);
  r.beginRound();
  const w2 = finish(r, { type: 'win', team: 1, award: 2, points: [40, 80] });
  assert.equal(w2.award, 6);
  assert.deepEqual(r.score, [6, 6]);
  r.beginRound();
  finish(r, { type: 'win', team: 1, award: 2, points: [40, 80] });
  assert.deepEqual(r.score, [8, 6]); // bonus ishlatildi
});

test('durang bonusi yangi matchda nolga tushadi', () => {
  const { r } = playingRoom();
  r.score = [12, 0];
  finish(r, { type: 'draw', team: -1, award: 0 });
  r.beginRound();
  const res = finish(r, { type: 'win', team: 1, award: 2 });
  assert.equal(res.matchLoser, 0); // 12 + 2 + 2
  r.beginRound();
  assert.equal(r.drawBonus, 0);
  assert.deepEqual(r.score, [0, 0]);
});

test('vaqt tugasa: chap tarafdagi karta(lar) yuriladi', () => {
  const st = E.newRound({ leader: 0, rng: () => 0.42 });
  const leftmost = E.sortHand(st.hands[st.leader], st.trump)[0];
  assert.deepEqual(E.autoMove(st, st.leader), { type: 'lead', cards: [leftmost] });
  assert.equal(E.autoMove(st, (st.leader + 1) % 4), null);
  // Javob: chapdan k ta karta
  const lead = E.sortHand(st.hands[st.leader], st.trump).slice(0, 1);
  assert.ok(E.act(st, st.leader, { type: 'lead', cards: lead }).ok);
  const f = st.turn;
  const mv = E.autoMove(st, f);
  assert.deepEqual(mv.cards, E.sortHand(st.hands[f], st.trump).slice(0, 1));
  assert.ok(mv.type === 'beat' || mv.type === 'discard');
  assert.ok(E.act(st, f, mv).ok);
});

test('xonada: oʻyinchi vaqtni oʻtkazib yuborsa — chap tarafdagi karta tashlanadi', () => {
  const { r, c } = playingRoom();
  const g = r.game;
  const actor = g.phase === 'lead' ? g.leader : g.turn;
  const expect = E.sortHand(g.hands[actor], g.trump)[0];
  c.advance(30000);
  const played = r.lastEvent && r.lastEvent.events ? r.lastEvent.events : null;
  assert.ok(g.trick || g.phase !== 'lead');
  const first = g.trick ? g.trick.plays[0] : null;
  assert.ok(first && first.seat === actor, 'yurgan: ' + JSON.stringify(played));
  assert.deepEqual(first.cards, [expect]);
});

test('kuzatuvchilar oʻynayotganlarga koʻrinadi', () => {
  const { r } = playingRoom();
  r.connect(users[4]);
  r.connect(users[5]);
  const snap = r.snapshot('u1');
  assert.equal(snap.spectators, 2);
  assert.deepEqual(snap.watchers.map((w) => w.name), ['Oʻyinchi 5', 'Oʻyinchi 6']);
  assert.equal(r.snapshot('u5').watchers.find((w) => w.you).name, 'Oʻyinchi 5');
});
