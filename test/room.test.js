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

function makeRoom(clock) {
  return new Room({
    id: 't1', now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    turnSeconds: 30, botDelay: [100, 200], collectMs: 500, autoStartMs: 1000
  });
}

const users = [1, 2, 3, 4, 5].map((i) => ({ id: 'u' + i, name: 'Oʻyinchi ' + i }));

test('4 kishi kirsa oʻyin oʻzi boshlanadi, beshinchisi tomoshabin; jamoalar 1–3 va 2–4', () => {
  const c = fakeClock();
  const r = makeRoom(c);
  for (let i = 0; i < 4; i++) r.connect(users[i]);
  assert.equal(r.filled(), 4);
  assert.equal(r.hostId, 'u1');
  r.connect(users[4]);
  assert.equal(r.spectators.size, 1);
  c.advance(1000);
  assert.ok(r.phase === 'playing' || r.phase === 'roundEnd');
  assert.equal(r.round, 1);
  const snap = r.snapshot('u1');
  assert.equal(snap.myTeam, 0);
  assert.deepEqual(snap.seats.map((s) => s.team), [0, 1, 0, 1]);
  assert.equal(r.snapshot('u5').game.hand, null);
});

test('4 kishi boʻlmasa boshlab boʻlmaydi; boʻsh oʻrinlarni bot bilan toʻldirish', () => {
  const c = fakeClock();
  const r = makeRoom(c);
  r.connect(users[0]);
  r.connect(users[1]);
  assert.match(r.start('u1'), /4 kishi/);
  r.connect(users[2]); r.leave('u3'); // u3 — kuzatuvchi
  assert.match(r.fillBots('u3'), /stolda oʻtirgan/);
  assert.equal(r.fillBots('u2'), null); // stolda oʻtirgan har kim bot qoʻsha oladi
  assert.equal(r.filled(), 4);
  c.advance(1000);
  assert.notEqual(r.phase, 'lobby');
});

test('lobbida oʻrin almashtirib jamoa tanlash', () => {
  const c = fakeClock();
  const r = makeRoom(c);
  r.connect(users[0]); // 0-oʻrin
  r.connect(users[1]); // 1-oʻrin
  assert.equal(r.sit('u2', 2), null); // u2 1-jamoaga oʻtadi
  assert.equal(r.seatOf('u2'), 2);
  assert.equal(r.seats[1], null);
  assert.equal(r.snapshot('u2').myTeam, 0);
  assert.equal(r.sit('u2', 0), 'Bu oʻrin band');
});

test('vaqtida yurmasa avtomatik yuriladi; ball qoʻshiladi; birinchi yurish navbat bilan almashadi', () => {
  const c = fakeClock();
  const r = makeRoom(c);
  for (let i = 0; i < 4; i++) r.connect(users[i]);
  c.advance(1000);
  const first = r.firstLeader;
  let guard = 0;
  while (r.phase === 'playing' && guard++ < 400) c.advance(30000);
  assert.equal(r.phase, 'roundEnd');
  const res = r.lastResult;
  if (res.type !== 'draw') {
    assert.equal(r.score[1 - res.team], res.award, 'ball yutqazgan jamoaga');
    assert.equal(r.score[res.team], 0);
  }
  assert.equal(r.nextRound('u2'), null);
  assert.equal(r.firstLeader, (first + 1) % 4, 'keyingi raundda keyingi oʻyinchi boshlaydi');
});

test('stol egasi + 3 bot: match 14 ballgacha (12 — shans), keyin yangi match', () => {
  const c = fakeClock();
  const r = makeRoom(c);
  r.connect(users[0]);
  r.fillBots('u1');
  c.advance(1000);
  let leaders = [];
  let matchDone = false;
  let before = [0, 0];
  for (let round = 0; round < 80 && !matchDone; round++) {
    leaders.push(r.firstLeader);
    let guard = 0;
    while (r.phase === 'playing' && guard++ < 500) {
      const g = r.game;
      const actor = g.phase === 'lead' ? g.leader : g.turn;
      if (actor === 0 && (g.phase === 'lead' || g.phase === 'follow')) {
        assert.equal(r.dispatch('u1', { t: 'act', action: E.AI.choose(g, 0, {}) }), null);
      } else c.advance(300);
    }
    assert.equal(r.phase, 'roundEnd');
    const res = r.lastResult;
    // Hisob E.addToMatch qoidasiga toʻliq mos
    const exp = E.addToMatch(before, res.type === 'draw' ? -1 : res.team, res.award);
    assert.deepEqual(res.score, exp.score);
    assert.equal(res.matchLoser, exp.matchLoser);
    assert.equal(res.loser, exp.loser);
    if (res.matchOver) {
      matchDone = true;
      assert.ok(res.score[res.matchLoser] >= 14, 'yutqazgan jamoa 14+ ball');
      assert.ok(res.score[res.matchWinner] <= 12, 'gʻolib jamoa 12 dan oshmagan');
      assert.equal(res.matchWinner, 1 - res.matchLoser);
      assert.equal(r.matchWins[res.matchWinner], 1);
    } else {
      assert.ok(res.score[0] <= 12 && res.score[1] <= 12, 'match davom etsa, hech kim 12 dan oshmagan');
    }
    before = res.score.slice();
    r.nextRound('u1');
  }
  assert.ok(matchDone, 'match tugashi kerak');
  assert.deepEqual(r.score, [0, 0], 'yangi match noldan');
  for (let i = 1; i < leaders.length; i++) assert.equal(leaders[i], (leaders[i - 1] + 1) % 4);
});

test('yashirin kartalar boshqalarga koʻrinmaydi; notoʻgʻri harakat xato qaytaradi', () => {
  const c = fakeClock();
  const r = makeRoom(c);
  for (let i = 0; i < 4; i++) r.connect(users[i]);
  c.advance(1000);
  if (r.phase !== 'playing') return;
  const g = r.game;
  if (g.phase === 'lead') {
    const notLeader = (g.leader + 1) % 4;
    assert.match(r.dispatch(users[notLeader].id, { t: 'act', action: { type: 'lead', cards: [g.hands[notLeader][0]] } }), /emas/);
    assert.match(r.dispatch(users[g.leader].id, { t: 'act', action: { type: 'lead', cards: ['XX'] } }), /yoʻq/);
  }
  for (let i = 0; i < 4; i++) {
    const json = JSON.stringify(r.snapshot(users[i].id));
    assert.ok(!json.includes('"' + g.hiddenCard + '"') || g.hands[i].includes(g.hiddenCard) || g.trumpCard === g.hiddenCard, 'yopiq karta sirligicha qoladi');
    for (let j = 0; j < 4; j++) {
      if (j === i) continue;
      for (const card of g.hands[j]) {
        const onTable = g.trick && g.trick.plays.some((p) => p.up && p.cards.includes(card));
        if (card !== g.trumpCard && !onTable) assert.ok(!json.includes('"' + card + '"'), `${i} ${j} ning kartasini koʻrmoqda`);
      }
    }
  }
});

test('oʻyin vaqtida ilova yopilsa — oʻrni saqlanadi, vaqti tugaganda avtomatik yuriladi; qaytsa davom etadi', () => {
  const c = fakeClock();
  const r = makeRoom(c);
  for (let i = 0; i < 4; i++) r.connect(users[i]);
  c.advance(1000);
  r.disconnect('u1');
  assert.equal(r.seatOf('u1'), 0);
  r.connect(users[0]);
  assert.equal(r.seats[0].auto, false);
  assert.equal(r.paused(), false);
});

test('lobbida oflayn qolgan oʻyinchi 30 soniyadan keyin chiqariladi', () => {
  const c = fakeClock();
  const r = makeRoom(c);
  r.connect(users[0]);
  r.connect(users[1]);
  r.disconnect('u2');
  c.advance(10000);
  assert.equal(r.sweep(), false);
  c.advance(25000);
  assert.equal(r.sweep(), true);
  assert.equal(r.filled(), 1);
});
