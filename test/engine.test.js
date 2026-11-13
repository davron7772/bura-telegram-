'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine');

// Takrorlanadigan tasodifiy sonlar
function rngFrom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Qoʻllar, ochiq koʻzir, yopiq karta va kolodaning ustki kartalari bilan koloda yasash
function deckFor(leader, hands, trumpCard, hiddenCard, stockTop) {
  stockTop = stockTop || [];
  const d = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) d.push(hands[(leader + i) % 4][r]);
  d.push(trumpCard, hiddenCard);
  const used = new Set(d.concat(stockTop));
  assert.equal(used.size, d.length + stockTop.length, 'takroriy karta');
  return d.concat(stockTop, E.makeDeck().filter((c) => !used.has(c)));
}

function cardsInPlay(st) {
  const all = [];
  for (const h of st.hands) all.push(...h);
  all.push(...st.stock);
  for (const t of st.taken) for (const x of t) all.push(x.c);
  if (st.trick && st.phase !== 'roundEnd' && st.phase !== 'lead') for (const p of st.trick.plays) all.push(...p.cards);
  return all;
}

test('koloda: 36 ta noyob karta, jami 120 ochko', () => {
  const d = E.makeDeck();
  assert.equal(d.length, 36);
  assert.equal(new Set(d).size, 36);
  assert.equal(E.sumPoints(d), 120);
});

test('urish: 10 korolni uradi; koʻzir oddiy 10 ni uradi; koʻzir korol koʻzir 10 ni urmaydi', () => {
  const T = 'D';
  assert.ok(E.beats('10H', 'KH', T), '10 korolni bosadi');
  assert.ok(!E.beats('KH', '10H', T), 'korol 10 ni bosa olmaydi');
  assert.ok(E.beats('KD', '10H', T), 'koʻzir korol oddiy 10 ni bosadi');
  assert.ok(E.beats('6D', 'AH', T), 'har qanday koʻzir oddiy kartani bosadi');
  assert.ok(!E.beats('KD', '10D', T), 'koʻzir korol koʻzir 10 ni bosa olmaydi');
  assert.ok(E.beats('10D', 'KD', T));
  assert.ok(!E.beats('AH', '6D', T), 'oddiy karta koʻzirni bosmaydi');
  assert.ok(!E.beats('AS', '6H', T), 'boshqa oddiy mast bosmaydi');
  assert.ok(E.setBeats(['AH', '6D'], ['9H', 'KH'], T));
  assert.ok(E.setBeats(['6D', 'AH', '7D', '8D'], ['KH', '9H', '6C', 'AS'], T));
  assert.ok(!E.setBeats(['QH', '6S'], ['9H', 'KH'], T));
});

test('yurish: 1 ta yoki bir xil mastdagi 2–4 ta', () => {
  assert.ok(E.isValidLead(['6H']));
  assert.ok(E.isValidLead(['6H', 'AH', '10H', 'KH']));
  assert.ok(!E.isValidLead(['6H', 'AS']));
  assert.ok(!E.isValidLead([]));
  assert.ok(!E.isValidLead(['6H', '6H']));
  assert.ok(!E.isValidLead(['ZZ']));
  assert.equal(E.legalLeads(['6H', '7H', '8H', 'AS']).length, 4 + 3 + 1);
});

test('tarqatish: 4 tadan, koloda 20 (ochiq koʻzir va yopiq karta eng oxirida)', () => {
  const st = E.newRound({ leader: 2, rng: rngFrom(1) });
  for (const h of st.hands) assert.equal(h.length, 4);
  assert.equal(st.stock.length, 20);
  assert.equal(st.stock[0], st.hiddenCard);
  assert.equal(st.stock[1], st.trumpCard);
  assert.equal(st.trump, E.suitOf(st.trumpCard));
  assert.equal(new Set(cardsInPlay(st)).size, 36);
  if (st.phase === 'lead') assert.equal(st.leader, 2, 'birinchi yurish berilgan oʻyinchida');
  const v = E.viewFor(st, 0);
  assert.equal(v.hiddenCard, null, 'yopiq karta koʻrinmaydi');
  assert.ok(!JSON.stringify(v).includes('"' + st.hiddenCard + '"') || st.hiddenCard === st.trumpCard);
});

test('toʻliq stsenariy: yopiq tashlash, olish, karta olish tartibi va koʻzir almashishi', () => {
  const hands = [
    ['6H', '7H', '8H', '9H'],
    ['6C', '7C', '8C', '9C'],
    ['JC', 'QC', 'KC', '10C'],
    ['AC', '7S', '8S', '9S']
  ];
  const top = ['AD', '6D', '8D', 'QD', 'JH', '7D', 'JD', 'KD', 'QH', 'JS', 'KS', 'AS', 'KH', 'QS', '10S', '10H', 'AH', '10D'];
  const st = E.newRound({ leader: 0, deck: deckFor(0, hands, '9D', '6S', top) });
  assert.equal(st.trump, 'D');
  assert.equal(st.phase, 'lead');
  assert.equal(st.leader, 0);

  // 1-qoʻl: 4 ta chervi bilan yurish, hech kim ura olmaydi
  assert.equal(E.act(st, 1, { type: 'lead', cards: ['6C'] }).ok, false, 'navbat 0-oʻrinda');
  assert.ok(E.act(st, 0, { type: 'lead', cards: ['6H', '7H', '8H', '9H'] }).ok);
  assert.equal(E.act(st, 1, { type: 'beat', cards: ['6C', '7C', '8C', '9C'] }).ok, false);
  assert.ok(E.act(st, 1, { type: 'discard', cards: ['6C', '7C', '8C', '9C'] }).ok);
  assert.ok(E.act(st, 2, { type: 'discard', cards: ['JC', 'QC', 'KC', '10C'] }).ok);
  // yashirin kartalar boshqalarga koʻrinmaydi
  const v3 = E.viewFor(st, 3);
  assert.equal(v3.trick.plays[1].cards, null);
  assert.ok(!JSON.stringify(v3).includes('10C'));
  assert.ok(E.act(st, 3, { type: 'discard', cards: ['AC', '7S', '8S', '9S'] }).ok);
  assert.equal(st.phase, 'trickEnd');
  assert.equal(st.trick.winner, 0);
  E.collect(st);
  assert.equal(st.taken[0].length, 16);
  assert.equal(E.teamKnown(st, 0).known, 0);
  assert.equal(E.teamKnown(st, 0).hidden, 12);
  assert.equal(E.teamPoints(st)[0], 4 + 3 + 2 + 10 + 11, 'yopiq kartalar ham hisoblanadi');
  assert.deepEqual(st.hands[0].slice().sort(), ['AD', 'JH', 'QH', 'KH'].sort(), 'olgan oʻyinchi birinchi oladi');
  assert.equal(st.stock.length, 4);

  // 2-qoʻl: koʻzir tuzi — hech kim ura olmaydi
  assert.ok(E.act(st, 0, { type: 'lead', cards: ['AD'] }).ok);
  assert.ok(E.act(st, 1, { type: 'discard', cards: ['6D'] }).ok);
  assert.ok(E.act(st, 2, { type: 'discard', cards: ['8D'] }).ok);
  assert.ok(E.act(st, 3, { type: 'discard', cards: ['QD'] }).ok);
  const evs = E.collect(st);
  assert.equal(st.stock.length, 0);
  assert.ok(st.hands[0].includes('AH'));
  assert.ok(st.hands[1].includes('10D'));
  assert.ok(st.hands[2].includes('9D'), 'ochiq koʻzir oxiridan bitta oldin olinadi');
  assert.ok(st.hands[3].includes('6S'), 'yopiq karta eng oxirida olinadi');
  const rev = evs.find((e) => e.kind === 'reveal');
  assert.ok(rev, 'reveal hodisasi');
  assert.equal(rev.seat, 3);
  assert.equal(rev.from, 'D');
  assert.equal(rev.to, 'S');
  assert.equal(st.trump, 'S', 'koʻzir masti almashdi');
  assert.equal(E.viewFor(st, 1).hiddenCard, '6S', 'ochilgan karta hammaga koʻrinadi');

  // qolgan kartalarni oxirigacha oʻynash
  let guard = 0;
  while (st.phase !== 'roundEnd' && guard++ < 50) {
    if (st.phase === 'trickEnd') { E.collect(st); continue; }
    const s = st.phase === 'lead' ? st.leader : st.turn;
    assert.ok(E.act(st, s, E.AI.choose(st, s, { rng: rngFrom(guard) })).ok);
  }
  assert.equal(st.phase, 'roundEnd');
  const r = st.result;
  assert.equal(r.points[0] + r.points[1], 120);
  if (r.type === 'win') {
    assert.ok(r.points[r.team] >= 61);
    const lp = r.points[1 - r.team];
    const took = E.teamKnown(st, 1 - r.team).cards > 0;
    assert.equal(r.award, !took ? 6 : lp < 31 ? 4 : 2);
  }
});

test('Bura: hamma kartasi koʻzir boʻlgan oʻyinchi navbatsiz yuradi', () => {
  const st = E.newRound({ leader: 0, deck: deckFor(0, [
    ['6H', '7H', '8H', '9S'], ['6C', '7C', '8C', '9C'], ['6D', 'JD', 'AD', '10D'], ['JC', 'QC', 'KC', '10C']
  ], '9D', '6S') });
  assert.equal(st.phase, 'follow');
  assert.equal(st.leader, 2);
  assert.equal(st.trick.plays[0].seat, 2);
  assert.equal(st.trick.k, 4);
  assert.equal(st.turn, 3);
  assert.equal(st.hands[2].length, 0);

  // yurish navbatidagi oʻyinchining burasi — oʻzi tanlaydi
  const own = E.newRound({ leader: 1, deck: deckFor(1, [
    ['6H', '7H', '8H', '9S'], ['6D', 'JD', 'AD', '10D'], ['6C', '7C', '8C', '9C'], ['JC', 'QC', 'KC', '10C']
  ], '9D', '6S') });
  assert.equal(own.phase, 'lead');
  assert.equal(own.leader, 1);
  assert.equal(own.trick, null);
});

test('4 ta tuz qoʻlda — mutlaq gʻalaba (raqibga 14)', () => {
  const st = E.newRound({ leader: 0, deck: deckFor(0, [
    ['6H', '7H', '8H', '9H'], ['AS', 'AH', 'AD', 'AC'], ['6C', '7C', '8C', '9C'], ['JC', 'QC', 'KC', '10C']
  ], '9D', '6S') });
  assert.equal(st.phase, 'roundEnd');
  assert.equal(st.result.type, 'aces');
  assert.equal(st.result.team, 1);
  assert.equal(st.result.award, 14);
});

test('4 ta tuzni yigʻgan jamoa — mutlaq gʻolib', () => {
  const st = E.newRound({ leader: 0, rng: rngFrom(5) });
  E.takeEvents(st);
  st.taken[0] = [{ c: 'AS', up: true }, { c: 'AH', up: false }];
  st.taken[2] = [{ c: 'AD', up: true }];
  st.phase = 'trickEnd';
  st.trick = { k: 1, plays: [{ seat: 1, cards: ['AC'], up: true }, { seat: 2, cards: ['7C'], up: true }], best: 1, winner: 2 };
  const evs = E.collect(st);
  assert.equal(st.phase, 'roundEnd');
  assert.equal(st.result.type, 'aces');
  assert.equal(st.result.team, 0);
  assert.equal(st.result.cards.length, 4);
  assert.equal(E.resultView(st).via, 'taken');
  assert.ok(evs.some((e) => e.kind === 'aces' && e.via === 'taken'));
});

test('koʻp marta toʻliq simulyatsiya: kartalar yoʻqolmaydi, yopiq karta oxirida ochiladi, hisob toʻgʻri', () => {
  const kinds = {}, awards = {};
  let buras = 0, changes = 0;
  for (let g = 0; g < 1500; g++) {
    const rng = rngFrom(777 + g);
    const st = E.newRound({ leader: g % 4, rng });
    let steps = 0;
    const check = () => {
      if (st.phase === 'roundEnd') return;
      const all = cardsInPlay(st);
      assert.equal(all.length, 36);
      assert.equal(new Set(all).size, 36);
      assert.equal(st.hiddenRevealed, st.stock.length === 0, 'yopiq karta faqat koloda tugaganda ochiladi');
      if (st.hiddenRevealed) assert.equal(st.trump, E.suitOf(st.hiddenCard));
    };
    for (const e of E.takeEvents(st)) if (e.kind === 'bura') buras++;
    while (st.phase !== 'roundEnd') {
      assert.ok(++steps < 300, 'cheksiz oʻyin');
      if (st.phase === 'trickEnd') {
        for (const e of E.collect(st)) { if (e.kind === 'bura') buras++; if (e.kind === 'reveal' && e.from !== e.to) changes++; }
        check();
        continue;
      }
      if (st.phase === 'lead') assert.equal(new Set(st.hands.map((h) => h.length)).size, 1, 'qoʻllar teng');
      const seat = st.phase === 'lead' ? st.leader : st.turn;
      const r = E.act(st, seat, E.AI.choose(st, seat, { rng }));
      assert.ok(r.ok, r.error);
      for (const e of r.events) if (e.kind === 'bura') buras++;
      check();
    }
    const res = st.result;
    kinds[res.type] = (kinds[res.type] || 0) + 1;
    awards[res.award] = (awards[res.award] || 0) + 1;
    if (res.type === 'win' || res.type === 'draw') assert.equal(res.points[0] + res.points[1], 120);
    if (res.type === 'draw') assert.deepEqual(res.points, [60, 60]);
    if (res.type === 'win') assert.ok(res.points[res.team] >= 61);
  }
  assert.ok(kinds.win > 1000, JSON.stringify(kinds));
  assert.ok(buras > 0 && changes > 0, 'bura va koʻzir almashishi uchrashi kerak');
  assert.ok(awards[2] && awards[4], JSON.stringify(awards));
});

test('match hisobi: ball yutqazgan jamoaga, 12 — shans, 14+ — yutqazish', () => {
  const m = (score, win, award) => E.addToMatch(score, win, award);
  assert.equal(E.MATCH_LOSE, 14);
  assert.equal(E.MATCH_EDGE, 12);

  assert.deepEqual(m([0, 0], 0, 2), { score: [0, 2], loser: 1, matchLoser: -1 }, 'gʻolibga emas, yutqazganga');
  assert.deepEqual(m([4, 6], -1, 0), { score: [4, 6], loser: -1, matchLoser: -1 }, 'durang — ball yoʻq');

  // Aynan 12 — shans: match tugamaydi
  assert.deepEqual(m([10, 0], 1, 2), { score: [12, 0], loser: 0, matchLoser: -1 });
  assert.deepEqual(m([6, 2], 1, 6), { score: [12, 2], loser: 0, matchLoser: -1 });
  // 12 dagi jamoa yutsa — 12 da qoladi, oʻyin davom etadi
  assert.deepEqual(m([12, 2], 0, 6), { score: [12, 8], loser: 1, matchLoser: -1 });
  // 12 dagi jamoa yana yutqazsa — 14+, match tugadi
  assert.deepEqual(m([12, 8], 1, 2), { score: [14, 8], loser: 0, matchLoser: 0 });
  assert.deepEqual(m([12, 8], 1, 6), { score: [18, 8], loser: 0, matchLoser: 0 });
  // 12 ni "sakrab oʻtsa" ham — yutqazdi
  assert.deepEqual(m([10, 0], 1, 4), { score: [14, 0], loser: 0, matchLoser: 0 });
  assert.deepEqual(m([0, 8], 0, 6), { score: [0, 14], loser: 1, matchLoser: 1 });
  // Ikkalasi 12 da — keyingi yutqazgan matchni boy beradi
  assert.deepEqual(m([12, 12], 0, 2), { score: [12, 14], loser: 1, matchLoser: 1 });

  const orig = [12, 2];
  m(orig, 1, 2);
  assert.deepEqual(orig, [12, 2], 'kiruvchi massiv oʻzgarmaydi');
});
