'use strict';
/* Stoldan turish, boʻsh oʻringa oʻtirish, botni chiqarish, davom/yangidan tanlovi, boʻsh stolni yopish */
const test = require('node:test');
const assert = require('node:assert/strict');
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
const U = [1, 2, 3, 4, 5].map((i) => ({ id: 'u' + i, name: 'Oʻyinchi ' + i }));
function setup(humans) {
  const c = fakeClock();
  const closed = [];
  const r = new Room({ id: 't', now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, turnSeconds: 30, botDelay: [100, 200], collectMs: 500, autoStartMs: 1000, onEmpty: (room, why) => closed.push(why) });
  for (let i = 0; i < humans; i++) r.connect(U[i]);
  if (humans < 4) r.fillBots('u1');
  c.advance(1000);
  return { r, c, closed };
}

test('oʻyin oʻrtasida turish: oʻrin boʻshaydi, kuzatuvchi boʻladi, oʻyin toʻxtaydi', () => {
  const { r, c } = setup(4);
  assert.equal(r.phase, 'playing');
  assert.equal(r.leave('u2'), null);
  assert.equal(r.seats[1], null);
  assert.ok(r.spectators.has('u2'));
  assert.equal(r.paused(), true);
  assert.equal(r.timer, null);
  const before = JSON.stringify(r.game);
  c.advance(120000);
  assert.equal(JSON.stringify(r.game), before, 'toʻxtagan oʻyin oʻzgarmaydi');
  assert.match(r.act('u1', { type: 'lead', cards: [r.game.hands[0][0]] }), /toʻxtatilgan/);
  const snap = r.snapshot('u2');
  assert.equal(snap.paused, true);
  assert.equal(snap.mySeat, -1);
});

test('kuzatuvchi boʻsh oʻringa oʻtiradi → stol egasi davom ettirish yoki yangidan boshlashni tanlaydi', () => {
  const { r, c } = setup(4);
  r.connect(U[4]); // kuzatuvchi
  const round = r.round, hand = r.game.hands[1].slice();
  r.leave('u2');
  assert.equal(r.sit('u5', 1), null);
  assert.equal(r.seatOf('u5'), 1);
  assert.equal(r.resumeAsk, true);
  assert.equal(r.snapshot('u1').resumeAsk, true);
  assert.match(r.resume('u5', 'continue'), /stol egasi/);
  assert.equal(r.resume('u1', 'continue'), null);
  assert.equal(r.resumeAsk, false);
  assert.equal(r.round, round);
  assert.deepEqual(r.game.hands[1], hand, 'yangi oʻtirgan kishi oʻsha kartalarni oladi');
  assert.ok(r.timer, 'oʻyin davom etmoqda');

  // Yana: yangidan boshlash — hisob 0:0, 1-raund
  r.score = [6, 4];
  r.leave('u3');
  r.addBot('u1', 2);
  assert.equal(r.resumeAsk, true);
  r.resume('u1', 'restart');
  assert.deepEqual(r.score, [0, 0]);
  assert.equal(r.round, 1);
  assert.equal(r.phase, 'playing');
  // Tanlanmasa — 30 soniyadan keyin oʻzi davom etadi
  r.leave('u4');
  r.sit('u3', 3);
  c.advance(30000);
  assert.equal(r.resumeAsk, false);
});

test('botni bosib chiqarish: oʻyin oʻrtasida ham; oʻrniga bot yoki odam', () => {
  const { r } = setup(2); // u1, u2 + 2 bot
  const botSeat = r.seats.findIndex((s) => s && s.bot);
  r.connect(U[2]); // kuzatuvchi
  assert.match(r.kick('u3', botSeat), /stolda oʻtirgan/);
  assert.equal(r.kick('u2', botSeat), null);
  assert.equal(r.seats[botSeat], null);
  assert.equal(r.paused(), true);
  assert.equal(r.sit('u3', botSeat), null);
  assert.equal(r.resumeAsk, true);
});

test('raund oxirida boʻsh oʻrin boʻlsa — keyingi raund boshlanmaydi', () => {
  const { r } = setup(4);
  r.phase = 'roundEnd';
  r.leave('u4');
  assert.match(r.nextRound('u1'), /Boʻsh oʻrin/);
  r.addBot('u1', 3);
  assert.equal(r.resumeAsk, false);
  assert.equal(r.nextRound('u1'), null);
});

test('hamma odam turib ketsa — stol yopiladi; bitta faol odam qolsa — yopilmaydi', () => {
  const { r, c, closed } = setup(2); // 2 odam + 2 bot
  r.leave('u1');
  c.advance(10000);
  assert.deepEqual(closed, [], 'u2 hali stolda');
  r.leave('u2');
  c.advance(3000);
  assert.deepEqual(closed, ['empty']);
});

test('hamma odam oflayn boʻlsa — 90 soniyadan keyin yopiladi; qaytib kelsa — yopilmaydi', () => {
  const { r, c, closed } = setup(2);
  r.disconnect('u1');
  r.disconnect('u2');
  c.advance(60000);
  r.connect(U[1]);
  c.advance(120000);
  assert.deepEqual(closed, []);
  r.disconnect('u2');
  c.advance(91000);
  assert.deepEqual(closed, ['away']);
});

test('lobbida botsiz boʻsh stol darhol yopilmaydi (zal oʻzi tozalaydi)', () => {
  const c = fakeClock();
  const closed = [];
  const r = new Room({ id: 't', now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, onEmpty: (x, w) => closed.push(w) });
  r.connect(U[0]);
  r.leave('u1');
  c.advance(10000);
  assert.deepEqual(closed, []);
});
