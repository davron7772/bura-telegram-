/*
 * Bura — oʻyin dvigateli (2×2 jamoa, 4 tadan karta).
 * Bir xil kod serverda (Node.js) va brauzerda (demo rejimi) ishlaydi.
 *
 * Qoidalar:
 *  - 36 ta karta. Kuch: T (tuz) > 10 > K > D > V > 9 > 8 > 7 > 6.
 *    Ochko: T=11, 10=10, K=4, D=3, V=2, qolganlari 0 (jami 120).
 *  - 4 oʻyinchi, 2×2: 1 va 3-oʻrin bir jamoa, 2 va 4-oʻrin bir jamoa (qarama-qarshi).
 *  - Har kimga 4 tadan karta. Keyingi karta ochiq koʻzir, undan keyingisi — yopiq karta.
 *    Kolodadan avval oddiy kartalar, keyin ochiq koʻzir, eng oxirida yopiq karta olinadi.
 *    Yopiq kartani olgan oʻyinchi uni hammaga koʻrsatadi va koʻzir masti shu kartanikiga almashadi.
 *  - Yurish: 1 ta karta yoki bir xil mastdagi 2–4 ta karta.
 *  - Qolganlar shuncha karta tashlaydi. Joriy eng kuchli toʻplamning HAR BIR kartasini
 *    urgan oʻyinchi (ochiq) yangi yetakchi boʻladi, aks holda kartalar yopiq beriladi.
 *    Koʻzir har qanday oddiy kartani uradi; koʻzirni faqat kattaroq koʻzir uradi.
 *  - Oxirgi yetakchi hamma kartalarni oladi, birinchi boʻlib karta oladi va yuradi.
 *  - Bura — qoʻldagi 4 kartaning hammasi koʻzir: navbatsiz yuradi.
 *  - 4 ta tuz — mutlaq gʻalaba.
 *  - Kartalar tugagach jamoa ochkolari sanaladi: 61+ — gʻalaba, 60:60 — durang.
 *    Gʻolib jamoa ball oladi: 2 (raqib 31+ ochko), 4 (raqib 31 dan kam), 6 (raqib birorta ham
 *    karta olmagan yoki 4 ta tuz). 12 ballga birinchi yetgan jamoa matchni yutadi.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BuraEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const RANKS = ['6', '7', '8', '9', 'J', 'Q', 'K', '10', 'A']; // kuchsizdan kuchliga
  const POINTS = { '6': 0, '7': 0, '8': 0, '9': 0, J: 2, Q: 3, K: 4, '10': 10, A: 11 };
  const N = 4;       // oʻyinchilar
  const HAND = 4;    // qoʻldagi kartalar
  const WIN = 61;    // raundda gʻalaba uchun jamoa ochkosi
  // Match: raundda yutqazgan jamoaga ball yoziladi (2, 4 yoki 6).
  const MATCH_LOSE = 14; // shuncha va undan koʻp ball toʻplagan jamoa matchni yutqazadi
  const MATCH_EDGE = 12; // aynan 12 ball — "shans": jamoa yana bir raund oʻynaydi
  const RANK_INDEX = {};
  RANKS.forEach(function (r, i) { RANK_INDEX[r] = i; });
  const DECK = makeDeck();
  const DECK_SET = new Set(DECK);

  // ---------- kartalar ----------
  function makeDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push(r + s);
    return d;
  }
  function rankOf(c) { return c.slice(0, -1); }
  function suitOf(c) { return c.slice(-1); }
  function strength(c) { return RANK_INDEX[rankOf(c)]; }
  function points(c) { return POINTS[rankOf(c)] || 0; }
  function sumPoints(cards) { let s = 0; for (let i = 0; i < cards.length; i++) s += points(cards[i]); return s; }
  function isCard(c) { return typeof c === 'string' && DECK_SET.has(c); }
  function teamOf(seat) { return seat % 2; }

  function shuffle(arr, rng) {
    rng = rng || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // a karta b kartani uradimi?  10 > K; koʻzir oddiy kartani uradi; koʻzirni faqat kattaroq koʻzir uradi.
  function beats(a, b, trump) {
    const sa = suitOf(a), sb = suitOf(b);
    if (sa === sb) return strength(a) > strength(b);
    return sa === trump;
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permutations(rest)) out.push([arr[i]].concat(p));
    }
    return out;
  }

  // def toʻplami att toʻplamidagi har bir kartani juftlab ura oladimi?
  function setBeats(def, att, trump) {
    if (!def.length || def.length !== att.length) return false;
    return permutations(def).some(function (p) {
      for (let i = 0; i < p.length; i++) if (!beats(p[i], att[i], trump)) return false;
      return true;
    });
  }

  function combos(arr, k) {
    const out = [];
    (function rec(start, acc) {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (let i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
    })(0, []);
    return out;
  }

  function isValidLead(cards) {
    if (!Array.isArray(cards) || cards.length < 1 || cards.length > HAND) return false;
    if (new Set(cards).size !== cards.length) return false;
    const s = isCard(cards[0]) ? suitOf(cards[0]) : null;
    return cards.every(function (c) { return isCard(c) && suitOf(c) === s; });
  }
  function legalLeads(hand) {
    const out = [];
    for (let k = 1; k <= Math.min(HAND, hand.length); k++) {
      for (const c of combos(hand, k)) if (isValidLead(c)) out.push(c);
    }
    return out;
  }
  function beatingSets(hand, att, trump) {
    if (hand.length < att.length) return [];
    return combos(hand, att.length).filter(function (c) { return setBeats(c, att, trump); });
  }
  function canBeatWith(hand, att, trump) {
    if (hand.length < att.length) return false;
    const cs = combos(hand, att.length);
    for (let i = 0; i < cs.length; i++) if (setBeats(cs[i], att, trump)) return true;
    return false;
  }

  function isBura(hand, trump) {
    return hand.length === HAND && hand.every(function (c) { return suitOf(c) === trump; });
  }
  function isFourAces(hand) {
    return hand.length === HAND && hand.every(function (c) { return rankOf(c) === 'A'; });
  }

  function nextSeat(n, s) { return (s + 1) % n; }
  function seatsFrom(n, start) { const o = []; for (let i = 0; i < n; i++) o.push((start + i) % n); return o; }
  function hasCards(hand, cards) {
    if (!Array.isArray(cards) || !cards.length) return false;
    if (new Set(cards).size !== cards.length) return false;
    return cards.every(function (c) { return isCard(c) && hand.indexOf(c) >= 0; });
  }
  function removeCards(hand, cards) {
    for (const c of cards) { const i = hand.indexOf(c); if (i >= 0) hand.splice(i, 1); }
  }

  // ---------- holat ----------
  // opts.leader — shu raundda birinchi yuradigan oʻyinchi (har raundda navbat bilan almashadi)
  function newRound(opts) {
    opts = opts || {};
    const n = N;
    const leader = (((opts.leader || 0) % n) + n) % n;
    let deck, hands, p, tries = 0;
    // Tarqatishda bitta oʻyinchiga 4 ta tuz tushmaydi — tuzlarni oʻyinchilar oʻyin davomida yigʻadi
    do {
      deck = opts.deck ? opts.deck.slice() : shuffle(DECK, opts.rng);
      hands = [];
      for (let i = 0; i < n; i++) hands.push([]);
      p = 0;
      for (let r = 0; r < HAND; r++) for (let i = 0; i < n; i++) hands[(leader + i) % n].push(deck[p++]);
    } while (!opts.deck && hands.some(isFourAces) && ++tries < 50);
    const trumpCard = deck[p++];
    const hiddenCard = deck[p++];
    const st = {
      n: n,
      firstLeader: leader,
      trump: suitOf(trumpCard),
      firstTrump: suitOf(trumpCard),
      trumpCard: trumpCard,
      hiddenCard: hiddenCard,
      hiddenRevealed: false,
      hiddenHolder: -1,
      // stock: [0] — yopiq karta (eng oxirida olinadi), [1] — ochiq koʻzir, qolgani ustida; pop() bilan olinadi
      stock: [hiddenCard, trumpCard].concat(deck.slice(p).reverse()),
      hands: hands,
      taken: hands.map(function () { return []; }),    // olingan kartalar: {c, up}
      discards: hands.map(function () { return []; }), // oʻzi yopiq bergan kartalar (faqat AI uchun)
      trick: null,
      trickNo: 0,
      phase: 'lead', // lead | follow | trickEnd | roundEnd
      leader: -1,
      turn: -1,
      result: null,
      seq: 0,
      pending: []
    };
    beginTrick(st, leader);
    return st;
  }

  function ev(st, kind, seat, data) {
    const e = { n: ++st.seq, kind: kind, seat: seat };
    if (data) for (const k in data) if (data[k] !== undefined) e[k] = data[k];
    st.pending.push(e);
    return e;
  }
  function takeEvents(st) { const e = st.pending; st.pending = []; return e; }

  function beginTrick(st, leader) {
    st.trick = null;
    st.leader = leader;
    st.turn = leader;
    st.phase = 'lead';
    const order = seatsFrom(st.n, leader);
    // Oʻyin davomida (kolodadan olib) qoʻlida 4 ta tuz yigʻilgan oʻyinchining jamoasi — mutlaq gʻolib.
    // Tarqatishda esa bitta oʻyinchiga 4 ta tuz tushmaydi (newRound).
    for (const s of order) {
      if (isFourAces(st.hands[s])) return endRound(st, { type: 'aces', seat: s, team: teamOf(s), cards: st.hands[s].slice(), via: 'hand' });
    }
    if (st.hands.every(function (h) { return h.length === 0; })) return endByPoints(st);
    // Bura: hamma kartasi koʻzir boʻlgan oʻyinchi navbatsiz yuradi
    for (const s of order) {
      if (s !== leader && isBura(st.hands[s], st.trump)) {
        st.leader = s;
        doLead(st, s, st.hands[s].slice(), 'bura');
        return;
      }
    }
  }

  function seatPoints(st, s) { return sumPoints(st.taken[s].map(function (x) { return x.c; })); }
  function teamPoints(st) {
    const t = [0, 0];
    for (let s = 0; s < st.n; s++) t[teamOf(s)] += seatPoints(st, s);
    return t;
  }
  function teamKnown(st, team) {
    let p = 0, hidden = 0, cards = 0;
    for (let s = 0; s < st.n; s++) {
      if (teamOf(s) !== team) continue;
      for (const x of st.taken[s]) { cards++; if (x.up) p += points(x.c); else hidden++; }
    }
    return { known: p, hidden: hidden, cards: cards };
  }

  function endByPoints(st) {
    const tp = teamPoints(st);
    const team = tp[0] >= WIN ? 0 : tp[1] >= WIN ? 1 : -1;
    return endRound(st, { type: team < 0 ? 'draw' : 'win', seat: -1, team: team });
  }

  // Qoʻldagi kartalar tartibi (ekranda chapdan oʻngga): mastlar, koʻzir oxirida, har mast ichida kuchsizdan kuchliga
  const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
  function sortHand(hand, trump) {
    return hand.slice().sort(function (a, b) {
      const sa = suitOf(a), sb = suitOf(b);
      const ka = sa === trump ? 10 : SUIT_ORDER[sa], kb = sb === trump ? 10 : SUIT_ORDER[sb];
      return ka - kb || strength(a) - strength(b);
    });
  }

  // Vaqt tugadi: chap tarafdagi kartalar bilan avtomatik yuriladi.
  // Birinchi yurishda — eng chapdagi bitta karta; javobda — chapdan k ta karta (urib oʻtsa — ochiq, aks holda yopiq tashlanadi)
  function autoMove(st, seat) {
    const hand = st.hands[seat];
    if (!hand || !hand.length) return null;
    const sorted = sortHand(hand, st.trump);
    if (st.phase === 'lead' && seat === st.leader && !st.trick) return { type: 'lead', cards: [sorted[0]] };
    if (st.phase === 'follow' && seat === st.turn && st.trick) {
      const cards = sorted.slice(0, st.trick.k);
      if (cards.length !== st.trick.k) return null;
      const best = st.trick.plays[st.trick.best];
      return { type: setBeats(cards, best.cards, st.trump) ? 'beat' : 'discard', cards: cards };
    }
    return null;
  }

  // Raundda yutqazgan jamoaga yoziladigan ball
  function awardFor(st, r) {
    if (r.type === 'draw') return 0;
    if (r.type === 'aces') return MATCH_LOSE; // raqib jamoaga 14 — match tugaydi
    const lose = 1 - r.team;
    if (!teamKnown(st, lose).cards) return 6;
    return r.points[lose] < 31 ? 4 : 2;
  }

  function endRound(st, r) {
    st.phase = 'roundEnd';
    st.turn = -1;
    r.points = teamPoints(st);
    r.totals = st.taken.map(function (_, s) { return seatPoints(st, s); });
    r.award = awardFor(st, r);
    st.result = r;
    ev(st, r.type, r.seat, { team: r.team, points: r.points.slice(), award: r.award, via: r.via });
  }

  function fail(msg) { return { ok: false, error: msg }; }
  function okv(st) { return { ok: true, events: takeEvents(st) }; }

  function doLead(st, seat, cards, kind) {
    removeCards(st.hands[seat], cards);
    st.trick = { k: cards.length, plays: [{ seat: seat, cards: cards.slice(), up: true }], best: 0, winner: -1 };
    st.phase = 'follow';
    st.turn = nextSeat(st.n, seat);
    ev(st, kind, seat, { k: cards.length, cards: cards.slice() });
  }

  function act(st, seat, a) {
    if (!a || typeof a.type !== 'string') return fail('Notoʻgʻri harakat');
    if (st.phase === 'roundEnd') return fail('Raund tugadi');
    const hand = st.hands[seat];
    if (!hand) return fail('Notoʻgʻri oʻrin');
    const cards = Array.isArray(a.cards) ? a.cards : [];
    switch (a.type) {
      case 'lead':
        if (st.phase !== 'lead' || st.trick || seat !== st.leader) return fail('Hozir sizning yurishingiz emas');
        if (!hasCards(hand, cards)) return fail('Bu kartalar qoʻlingizda yoʻq');
        if (!isValidLead(cards)) return fail('1 ta karta yoki bir xil mastdagi 2–4 ta karta bilan yuriladi');
        doLead(st, seat, cards, 'lead');
        return okv(st);

      case 'beat':
      case 'discard': {
        if (st.phase !== 'follow' || seat !== st.turn) return fail('Hozir sizning navbatingiz emas');
        const k = st.trick.k;
        if (cards.length !== k) return fail(k + ' ta karta tanlang');
        if (!hasCards(hand, cards)) return fail('Bu kartalar qoʻlingizda yoʻq');
        const up = a.type === 'beat';
        const best = st.trick.plays[st.trick.best];
        if (up && !setBeats(cards, best.cards, st.trump)) return fail('Bu kartalar bilan urib boʻlmaydi');
        removeCards(hand, cards);
        if (!up) for (const c of cards) st.discards[seat].push(c);
        st.trick.plays.push({ seat: seat, cards: cards.slice(), up: up });
        if (up) st.trick.best = st.trick.plays.length - 1;
        ev(st, up ? 'beat' : 'discard', seat, { k: k, cards: up ? cards.slice() : undefined });
        if (st.trick.plays.length === st.n) {
          st.phase = 'trickEnd';
          st.turn = -1;
          st.trick.winner = st.trick.plays[st.trick.best].seat;
        } else {
          st.turn = nextSeat(st.n, seat);
        }
        return okv(st);
      }
    }
    return fail('Nomaʼlum harakat');
  }

  // Yetakchi hamma kartalarni oladi, keyin hamma 4 tagacha karta oladi
  function collect(st) {
    if (st.phase !== 'trickEnd') return [];
    const t = st.trick, w = t.winner;
    let visible = 0, count = 0;
    for (const p of t.plays) {
      for (const c of p.cards) {
        st.taken[w].push({ c: c, up: p.up });
        count++;
        if (p.up) visible += points(c);
      }
    }
    ev(st, 'collect', w, { visible: visible, count: count });
    drawUp(st, w);
    st.trickNo++;
    beginTrick(st, w);
    return takeEvents(st);
  }

  function drawUp(st, from) {
    const order = seatsFrom(st.n, from);
    for (;;) {
      const need = order.filter(function (s) { return st.hands[s].length < HAND; });
      if (!need.length || st.stock.length < need.length) break; // hamma teng oladi
      for (const s of need) {
        const c = st.stock.pop();
        st.hands[s].push(c);
        if (c === st.hiddenCard) reveal(st, s);
      }
    }
  }

  // Yopiq karta ochiladi — koʻzir masti almashadi
  function reveal(st, s) {
    st.hiddenRevealed = true;
    st.hiddenHolder = s;
    const from = st.trump;
    st.trump = suitOf(st.hiddenCard);
    ev(st, 'reveal', s, { card: st.hiddenCard, from: from, to: st.trump });
  }

  // ---------- har bir oʻyinchi uchun koʻrinish (yashirin maʼlumotsiz) ----------
  function viewFor(st, me) {
    const mine = me >= 0 && me < st.n;
    const v = {
      n: st.n,
      me: mine ? me : -1,
      trump: st.trump,
      firstTrump: st.firstTrump,
      trumpCard: st.trumpCard,
      trumpInStock: st.stock.length >= 2,
      hiddenInStock: !st.hiddenRevealed,
      hiddenCard: st.hiddenRevealed ? st.hiddenCard : null,
      hiddenHolder: st.hiddenHolder,
      stock: st.stock.length,
      phase: st.phase,
      firstLeader: st.firstLeader,
      leader: st.leader,
      turn: st.turn,
      trickNo: st.trickNo,
      hand: mine ? st.hands[me].slice() : null,
      counts: st.hands.map(function (h) { return h.length; }),
      taken: st.taken.map(function (t) { return t.length; }),
      trick: null,
      result: null
    };
    if (st.trick) {
      v.trick = {
        k: st.trick.k,
        best: st.trick.best,
        winner: st.trick.winner,
        plays: st.trick.plays.map(function (p) {
          return { seat: p.seat, up: p.up, n: p.cards.length, cards: (p.up || p.seat === me) ? p.cards.slice() : null };
        })
      };
    }
    if (mine) {
      const tk = teamKnown(st, teamOf(me));
      v.teamKnown = tk.known;
      v.teamHidden = tk.hidden;
      v.teamCards = tk.cards;
    }
    if (st.phase === 'roundEnd') v.result = resultView(st);
    return v;
  }

  // Raund natijasini match hisobiga yozish: ball yutqazgan jamoaga qoʻshiladi.
  // 14+ ball — match yutqazildi. Aynan 12 ball — "shans": jamoa oʻynashda davom etadi
  // (yutsa 12 da qoladi, yana yutqazsa 14+ boʻlib matchni boy beradi).
  function addToMatch(score, winTeam, award) {
    const s = score.slice();
    const loser = winTeam === 0 || winTeam === 1 ? 1 - winTeam : -1;
    if (loser >= 0 && award > 0) s[loser] += award;
    return { score: s, loser: loser, matchLoser: loser >= 0 && s[loser] >= MATCH_LOSE ? loser : -1 };
  }

  function resultView(st) {
    const r = st.result;
    if (!r) return null;
    const o = { type: r.type, seat: r.seat, team: r.team, points: r.points.slice(), totals: r.totals.slice(), award: r.award };
    if (r.type === 'aces') { o.cards = r.cards.slice(); o.via = r.via || 'hand'; }
    return o;
  }

  // ---------- kompyuter oʻyinchisi (jamoaviy) ----------
  function unseenFor(st, me) {
    const known = new Set(st.hands[me]);
    for (const t of st.taken) for (const x of t) if (x.up) known.add(x.c);
    for (const c of st.discards[me]) known.add(c);
    if (st.trick) for (const p of st.trick.plays) if (p.up || p.seat === me) for (const c of p.cards) known.add(c);
    if (st.stock.length >= 2) known.add(st.trumpCard); // stolda ochiq turibdi
    return DECK.filter(function (c) { return !known.has(c); });
  }

  function sample(arr, k, rng) {
    const a = arr.slice();
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rng() * (a.length - i));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a.slice(0, k);
  }

  // Berilgan oʻyinchilardan kamida bittasi toʻplamni ura olishi ehtimoli (Monte-Karlo)
  function probBeatenBy(st, me, set, seats, rng, samples) {
    if (!seats.length) return 0;
    const pool = unseenFor(st, me);
    let need = 0;
    for (const o of seats) need += st.hands[o].length;
    if (need > pool.length) return 0.5;
    let hit = 0;
    for (let i = 0; i < samples; i++) {
      const sh = sample(pool, need, rng);
      let p = 0;
      for (const o of seats) {
        const h = sh.slice(p, p + st.hands[o].length);
        p += st.hands[o].length;
        if (canBeatWith(h, set, st.trump)) { hit++; break; }
      }
    }
    return hit / samples;
  }

  function trumpCost(cards, st) {
    const late = st.stock.length === 0 ? 0.35 : 1;
    let c = 0;
    for (const x of cards) if (suitOf(x) === st.trump) c += (2.5 + strength(x) * 0.6) * late;
    return c;
  }
  function keepValue(c, st) {
    return points(c) + (suitOf(c) === st.trump ? 6 + strength(c) * 0.5 : 0) + strength(c) * 0.15;
  }
  function cheapest(hand, k, st) {
    return hand.slice().sort(function (a, b) { return keepValue(a, st) - keepValue(b, st); }).slice(0, k);
  }
  // Sherik olayotgan boʻlsa — unga ochkoli kartalarni "quyish"
  function richest(hand, k, st) {
    const score = function (c) { return points(c) - (suitOf(c) === st.trump ? 50 : 0) - (rankOf(c) === 'A' ? 1.5 : 0); };
    return hand.slice().sort(function (a, b) { return score(b) - score(a); }).slice(0, k);
  }
  function laterSeats(st, me) {
    const out = [];
    const first = st.trick.plays[0].seat;
    for (let s = nextSeat(st.n, me); s !== first; s = nextSeat(st.n, s)) out.push(s);
    return out;
  }

  function aiLead(st, me, rng) {
    const opps = seatsFrom(st.n, me).slice(1).filter(function (s) { return teamOf(s) !== teamOf(me); });
    let best = null, bestVal = -Infinity;
    for (const L of legalLeads(st.hands[me])) {
      const pb = probBeatenBy(st, me, L, opps, rng, 40);
      const pts = sumPoints(L);
      const win = pts + 3 * L.length * 2.4, lose = pts + 3 * L.length * 1.4;
      const val = (1 - pb) * win - pb * lose - trumpCost(L, st) + rng() * 0.3;
      if (val > bestVal) { bestVal = val; best = L; }
    }
    return { type: 'lead', cards: best };
  }

  function aiFollow(st, me, rng) {
    const hand = st.hands[me], t = st.trick, k = t.k;
    const best = t.plays[t.best];
    const myTeam = teamOf(me);
    const later = laterSeats(st, me);
    const laterOpps = later.filter(function (s) { return teamOf(s) !== myTeam; });
    const laterMates = later.filter(function (s) { return teamOf(s) === myTeam; });
    let V = 0;
    for (const p of t.plays) V += p.up ? sumPoints(p.cards) : p.cards.length * 2.7;
    const futW = later.length * k * 2.2, futL = later.length * k * 1.4;

    let choice, bestVal;
    if (teamOf(best.seat) === myTeam) {
      const keep = 1 - probBeatenBy(st, me, best.cards, laterOpps, rng, 36);
      const D = keep >= 0.6 ? richest(hand, k, st) : cheapest(hand, k, st);
      const d = sumPoints(D);
      choice = { type: 'discard', cards: D };
      bestVal = keep * (V + d + futW) - (1 - keep) * (V + d + futL) - trumpCost(D, st) * 0.6;
    } else {
      const D = cheapest(hand, k, st);
      const d = sumPoints(D);
      const rescue = laterMates.length ? probBeatenBy(st, me, best.cards, laterMates, rng, 30) * 0.6 : 0;
      choice = { type: 'discard', cards: D };
      bestVal = rescue * (V + d + futW) - (1 - rescue) * (V + d + futL) - trumpCost(D, st) * 0.6;
    }
    for (const T of beatingSets(hand, best.cards, st.trump)) {
      const po = laterOpps.length ? probBeatenBy(st, me, T, laterOpps, rng, 36) : 0;
      const tp = sumPoints(T);
      const val = (1 - po) * (V + tp + futW) - po * (V + tp + futL) - trumpCost(T, st);
      if (val > bestVal) { bestVal = val; choice = { type: 'beat', cards: T }; }
    }
    return choice;
  }

  function aiChoose(st, me, opts) {
    opts = opts || {};
    const rng = opts.rng || Math.random;
    if (st.phase === 'lead' && !st.trick && st.leader === me && st.hands[me].length) return aiLead(st, me, rng);
    if (st.phase === 'follow' && st.turn === me) return aiFollow(st, me, rng);
    return null;
  }

  return {
    SUITS: SUITS, RANKS: RANKS, POINTS: POINTS, N: N, HAND: HAND, WIN: WIN, MATCH_LOSE: MATCH_LOSE, MATCH_EDGE: MATCH_EDGE,
    makeDeck: makeDeck, shuffle: shuffle, rankOf: rankOf, suitOf: suitOf, strength: strength,
    points: points, sumPoints: sumPoints, isCard: isCard, teamOf: teamOf,
    beats: beats, setBeats: setBeats, combos: combos, isValidLead: isValidLead, legalLeads: legalLeads,
    beatingSets: beatingSets, canBeatWith: canBeatWith, isBura: isBura, isFourAces: isFourAces,
    newRound: newRound, act: act, collect: collect, takeEvents: takeEvents,
    viewFor: viewFor, resultView: resultView, sortHand: sortHand, autoMove: autoMove, addToMatch: addToMatch, teamPoints: teamPoints, teamKnown: teamKnown, seatPoints: seatPoints,
    AI: { choose: aiChoose }
  };
});
