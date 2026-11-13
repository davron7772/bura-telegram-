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

// 2 kishilik (1×1) rejim: 2 ta oʻrin, raqib qarama-qarshi, toʻliq raundlar oʻynaladi
test('1×1: 2 ta oʻrin, 2 kishi kirgach boshlanadi, uchinchisi kuzatuvchi', () => {
  const c = fakeClock();
  const r = new Room({ id: 'd', size: 2, now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, turnSeconds: 30, botDelay: [50, 80], collectMs: 100, autoStartMs: 200 });
  r.connect({ id: 'a', name: 'A' });
  r.connect({ id: 'b', name: 'B' });
  r.connect({ id: 'c', name: 'C' });
  assert.equal(r.seats.length, 2);
  assert.equal(r.snapshot('c').mySeat, -1);
  c.advance(300);
  assert.equal(r.phase, 'playing');
  assert.equal(r.game.n, 2);
  assert.equal(r.game.hands.length, 2);
  assert.equal(r.game.stock.length, 36 - 8);
  const s = r.snapshot('a');
  assert.equal(s.size, 2);
  assert.notEqual(s.myTeam, r.snapshot('b').myTeam);
});

test('1×1: botga qarshi bir necha raund oxirigacha oʻynaladi, kartalar yoʻqolmaydi', () => {
  const c = fakeClock();
  const r = new Room({ id: 'd2', size: 2, now: c.now, setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, turnSeconds: 1, botDelay: [10, 20], collectMs: 20, autoStartMs: 50 });
  r.connect({ id: 'a', name: 'A' });
  r.fillBots('a');
  r.disconnect('a'); // odam oflayn — oʻrniga avtomatik yuriladi
  let rounds = 0;
  for (let k = 0; k < 4000 && rounds < 6; k++) {
    c.advance(500);
    if (r.phase === 'roundEnd') {
      const res = r.lastResult;
      assert.ok(res && ['win', 'draw', 'aces'].includes(res.type));
      if (res.type !== 'aces') assert.equal(res.points[0] + res.points[1], 120);
      rounds++;
      r.connect({ id: 'a', name: 'A' });
      assert.equal(r.dispatch('a', { t: 'next' }), null);
      r.disconnect('a');
    }
  }
  assert.ok(rounds >= 3, 'raundlar: ' + rounds);
});
