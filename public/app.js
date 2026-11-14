/* Bura — Telegram Mini App interfeysi */
(function () {
  'use strict';

  const E = window.BuraEngine;
  const DEMO = !!window.BURA_DEMO;

  // Karta koʻrinishi (skin): "kashta" — rasmli shohlar, malikalar, valetlar; "classic" — oddiy harflar.
  // Tanlov shu qurilmada saqlanadi. Demo internetsiz ishlaydi — unda rasmlar yoʻq.
  const SKIN_ART = { JH: 'JH', KH: 'KH', QH: 'QD', JD: 'JD', QD: 'QD', KD: 'KD', JC: 'JC', QC: 'QC', KC: 'KC', JS: 'JS', QS: 'QS', KS: 'KS', AS: 'AS' };
  function loadSkin() {
    if (DEMO) return 'classic';
    try { return localStorage.getItem('bura.skin') === 'classic' ? 'classic' : 'kashta'; } catch (e) { return 'kashta'; }
  }
  let SKIN = loadSkin();
  function applySkin() {
    document.documentElement.classList.toggle('skin-kashta', SKIN === 'kashta');
    if (SKIN === 'kashta' && !applySkin.pre) {
      applySkin.pre = true; // rasmlar oldindan yuklansin — karta chiqqanda miltillamasin
      Object.keys(SKIN_ART).forEach(function (k) { if (SKIN_ART[k] === k) new Image().src = artUrl(k); });
    }
  }
  function artUrl(k) { return '/skins/kashta/' + SKIN_ART[k] + '.webp?v=1'; }
  function setSkin(on) {
    SKIN = on ? 'kashta' : 'classic';
    try { localStorage.setItem('bura.skin', SKIN); } catch (e) { /* */ }
    applySkin();
  }
  applySkin();
  const TGW = window.Telegram && window.Telegram.WebApp;
  const TG = TGW && TGW.initData ? TGW : null;
  const qs = new URLSearchParams(location.search);
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Kartadagi belgilar: Tuz, Korol, Dama, Valet
  const RANK = { A: 'T', K: 'K', Q: 'Q', J: 'J', '10': '10', '9': '9', '8': '8', '7': '7', '6': '6' };
  const RANK_NAME = { A: 'tuz', K: 'korol', Q: 'dama', J: 'valet', '10': 'oʻnlik', '9': 'toʻqqizlik', '8': 'sakkizlik', '7': 'yettilik', '6': 'oltilik' };
  const SUIT_NAME = { S: 'pika', H: 'chervi', D: 'bubna', C: 'tref' };
  const SUIT_CHAR = { S: '♠\uFE0E', H: '♥\uFE0E', D: '♦\uFE0E', C: '♣\uFE0E' };
  const POS = ['b', 'l', 't', 'r']; // men, chapdagi raqib, sherik (roʻparada), oʻngdagi raqib
  const AVATAR_BG = ['#2a2f57', '#7a2a31', '#1f4a4f', '#5b4223'];
  const GUL = '<svg class="gul" viewBox="0 0 240 150" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2">' +
    '<path d="M84 8h72l52 34v66l-52 34H84L32 108V42z"/><path d="M92 24h56l38 24v54l-38 24H92L54 102V48z"/>' +
    '<path d="M120 38l30 37-30 37-30-37z"/><path d="M120 58l14 17-14 17-14-17z" fill="currentColor"/>' +
    '<path d="M32 75H6M208 75h26M120 8V0M120 142v8M60 75l-12-10v20zM180 75l12-10v20z"/></g></svg>';

  const S = {
    newSize: (function () { try { return localStorage.getItem('bura.size') === '2' ? 2 : 4; } catch (e) { return 4; } })(),
    screen: 'loading',
    room: null,
    hall: null,   // guruh zali: { key, title, tables }
    invite: '',
    missing: false,
    selected: [],
    sheet: null,
    sheetAnim: false,
    lastEventSeq: -1,
    eventFresh: false,
    conn: DEMO ? 'open' : 'connecting',
    deadlineAt: 0,
    deadlineTotal: 0,
    seenSlots: new Set(),
    seenHand: new Set(),
    handRound: -1,
    sweeping: false,
    busy: false,
    wasMyTurn: false,
    resultShownFor: -1,
    resultClosedFor: -1,
    closingConfirm: false,
    toastT: null
  };
  let T = null; // transport: { send(obj), raw(obj) }

  // Ovozli chat (demoda yoʻq: server kerak)
  const VC = !DEMO && window.BuraVoice && window.BuraVoice.supported()
    ? window.BuraVoice.create({
      send: function (o) { if (T && T.raw) T.raw(o); },
      sendBin: function (u8) { if (T && T.bin) T.bin(u8); },
      noP2P: !!(qs.get('dev') && qs.get('nop2p')), // sinov: toʻgʻridan-toʻgʻri ulanish yoʻq — ovoz server orqali
      onChange: onVoice, toast: toast, haptic: haptic
    })
    : null;
  const VBADGE = '<i class="vb" aria-hidden="true"><svg class="on"><use href="#i-mic"/></svg><svg class="off"><use href="#i-mic-off"/></svg></i>';

  // ---------- Telegram ----------
  function initTelegram() {
    if (!TG) return;
    try { TG.ready(); TG.expand(); } catch (e) { /* */ }
    try {
      if (TG.isVersionAtLeast('6.9')) { TG.setHeaderColor('#1c1f3d'); TG.setBackgroundColor('#1c1f3d'); }
    } catch (e) { /* */ }
    try { if (TG.isVersionAtLeast('7.7')) TG.disableVerticalSwipes(); } catch (e) { /* */ }
  }
  function haptic(kind) {
    try {
      if (!TG || !TG.HapticFeedback || !TG.isVersionAtLeast('6.1')) return;
      if (kind === 'select') TG.HapticFeedback.selectionChanged();
      else if (kind === 'success' || kind === 'error' || kind === 'warning') TG.HapticFeedback.notificationOccurred(kind);
      else TG.HapticFeedback.impactOccurred(kind || 'light');
    } catch (e) { /* */ }
  }
  function setClosingConfirm(on) {
    if (!TG || S.closingConfirm === on) return;
    S.closingConfirm = on;
    try {
      if (!TG.isVersionAtLeast('6.2')) return;
      if (on) TG.enableClosingConfirmation(); else TG.disableClosingConfirmation();
    } catch (e) { /* */ }
  }

  // ---------- aloqa ----------
  function startParam() {
    const sp = TG && TG.initDataUnsafe && TG.initDataUnsafe.start_param;
    return sp || qs.get('room') || qs.get('tgWebAppStartParam') || '';
  }
  function helloMsg() {
    const where = S.screen === 'hall' && S.hall ? S.hall.key : S.room && S.room.id;
    const m = { t: 'hello', initData: TG ? TG.initData : '', room: where || startParam() };
    if (qs.get('dev')) m.dev = { id: qs.get('uid') || String(Math.floor(Math.random() * 1e6)), name: qs.get('name') || 'Mehmon' };
    return m;
  }

  function connectWS() {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    let ws = null, retry = 0, pingT = null, reconnectT = null;
    function open() {
      clearTimeout(reconnectT);
      if (ws && ws.readyState <= 1) return;
      ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer'; // server orqali ovoz kadrlari
      ws.onopen = function () {
        retry = 0;
        setConn('open');
        ws.send(JSON.stringify(helloMsg()));
        if (VC) VC.onOpen(); // ovozli chatga qayta qoʻshilish (hello dan keyin)
        clearInterval(pingT);
        pingT = setInterval(function () { if (ws.readyState === 1) ws.send('{"t":"ping"}'); }, 20000);
      };
      ws.onmessage = function (e) {
        if (typeof e.data !== 'string') { if (VC) VC.onBinary(e.data); return; }
        let m;
        try { m = JSON.parse(e.data); } catch (x) { return; }
        onMessage(m);
      };
      ws.onclose = function () {
        clearInterval(pingT);
        if (VC) VC.onClose();
        setConn('closed');
        reconnectT = setTimeout(open, Math.min(8000, 500 * Math.pow(1.7, retry++)));
      };
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && (!ws || ws.readyState > 1)) { retry = 0; open(); }
    });
    open();
    T = {
      send: function (o) {
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
        else { toast('Aloqa yoʻq. Qayta ulanmoqda…'); S.busy = false; }
      },
      raw: function (o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); },
      // ovoz kadri: aloqa sekin boʻlsa tashlab yuboriladi (kechikish yigʻilmasin)
      bin: function (u8) { if (ws && ws.readyState === 1 && ws.bufferedAmount < 65536) ws.send(u8); },
      drop: function () { if (ws) ws.close(); } // faqat sinov uchun
    };
  }

  // Demo: hammasi brauzerda, kompyuter oʻyinchilari bilan
  function connectLocal() {
    const me = { id: 'me', name: 'Siz' };
    let pushT = null;
    const room = new window.BuraRoom.Room({
      id: 'demo', turnSeconds: 60, botDelay: [750, 1300],
      onChange: function () {
        if (pushT) return;
        pushT = setTimeout(function () { pushT = null; onMessage({ t: 'state', room: room.snapshot('me'), invite: '' }); }, 0);
      }
    });
    T = {
      send: function (m) {
        if (m.t === 'ping') return;
        const err = room.dispatch('me', m);
        if (err) setTimeout(function () { onMessage({ t: 'error', msg: err }); }, 0);
      }
    };
    room.connect(me);
    room.addBot('me');
    room.addBot('me');
  }

  function setConn(c) {
    if (S.conn === c) return;
    S.conn = c;
    if (S.screen !== 'loading') render();
  }

  function send(obj, busy) {
    if (!T) return;
    if (busy) S.busy = true;
    T.send(obj);
    if (busy) renderActions();
  }

  // ---------- serverdan kelgan xabarlar ----------
  function onMessage(m) {
    if (VC && VC.onMessage(m)) return;
    if (m.t === 'state') {
      if (VC) {
        if (S.room && m.room && S.room.id !== m.room.id) VC.reset(); // boshqa stolga oʻtildi
        if (m.voice) VC.setRoster(m.voice);
      }
      setRoom(m.room, m.invite);
    }
    else if (m.t === 'stats') {
      S.stats = { list: m.list || [], me: m.me || null, min: m.min || 3 };
      if (S.sheet && S.sheet.type === 'stats') render();
    }
    else if (m.t === 'hall') {
      S.hall = m.hall; S.busy = false;
      // out — stoldan chiqib zalga oʻtdik; aks holda stol (lobbi) ichidamiz va zal shunchaki yangilandi
      if (m.out || !S.room) {
        if (VC) VC.reset();
        if (S.screen !== 'hall') { S.sheet = null; window.scrollTo(0, 0); }
        S.screen = 'hall'; S.room = null;
        setClosingConfirm(false);
      }
      if (S.screen === 'hall' || (S.room && S.room.phase === 'lobby')) render();
    }
    else if (m.t === 'closed') { S.sheet = null; toast(m.why === 'away' ? 'Stol yopildi: oʻyinchilar uzoq vaqt qaytmadi' : 'Stol yopildi: stolda oʻyinchi qolmadi'); }
    else if (m.t === 'home') { if (VC) VC.reset(); S.screen = 'home'; S.room = null; S.missing = !!m.missing; render(); }
    else if (m.t === 'auth_error') { S.screen = 'auth'; render(); }
    else if (m.t === 'error') { S.busy = false; toast(m.msg); haptic('error'); renderActions(); }
  }

  function isActor(g, s) {
    if (!g || s < 0) return false;
    return (g.phase === 'lead' && !g.trick && g.leader === s) || (g.phase === 'follow' && g.turn === s);
  }
  function posOf(r, s) {
    const base = r.mySeat >= 0 ? r.mySeat : 0;
    const n = sizeOf(r);
    return POS[((s - base + n) % n) * (4 / n)]; // 1×1 da raqib roʻparada
  }
  function sizeOf(r) { return r && r.size === 2 ? 2 : 4; }
  function duel(r) { return sizeOf(r) === 2; }
  function teamName(r, team) {
    if (duel(r)) {
      if (r.myTeam >= 0) return team === r.myTeam ? 'Siz' : 'Raqib';
      const s = r.seats && r.seats[team];
      return s ? s.name : (team + 1) + '-oʻyinchi';
    }
    if (r.myTeam < 0) return (team + 1) + '-jamoa';
    return team === r.myTeam ? 'Sizning jamoangiz' : 'Raqiblar';
  }
  // Oʻrin vazifasi: sherik / raqib / jamoa
  function seatRole(r, i, cap) {
    if (duel(r)) return r.myTeam >= 0 ? (cap ? 'Raqib oʻrni' : 'raqib oʻrni') : (i + 1) + '-oʻyinchi';
    if (r.myTeam >= 0) return i % 2 === r.myTeam ? (cap ? 'Sherigingiz oʻrni' : 'sherik oʻrni') : (cap ? 'Raqib oʻrni' : 'raqib oʻrni');
    return (i % 2 + 1) + '-jamoa';
  }

  function setRoom(room, invite) {
    const prev = S.room;
    S.room = room;
    if (invite) S.invite = invite;
    S.screen = 'room';
    S.busy = false;
    const g = room.game;

    if (room.round !== S.handRound) {
      S.handRound = room.round;
      S.seenHand = new Set();
      S.seenSlots = new Set();
      S.selected = [];
    }
    S.selected = g && g.hand ? S.selected.filter(function (c) { return g.hand.indexOf(c) >= 0; }) : [];
    S.deadlineAt = room.deadlineIn ? Date.now() + room.deadlineIn : 0;
    S.readyAt = room.readyIn ? Date.now() + room.readyIn : 0;
    // Stol egasi chiqardi
    if (room.kickedOut && room.kickedOut !== S.kickedSeen) {
      S.kickedSeen = room.kickedOut;
      toast('Stol egasi sizni oʻyindan chiqardi — siz mehmonsiz.');
    }
    // Stolga oʻtirgan kishi boshqalarni darhol eshitadi (mikrofonsiz). Oʻzi chiqib ketsa — qayta ulanmaymiz
    if (VC && room.mySeat >= 0 && VC.state.status === 'off' && S.autoListen !== room.id) {
      S.autoListen = room.id;
      VC.listen();
    }
    // «Tayyorman» vaqtida bosilmadi — mehmon rejimi
    if (room.readyOut && room.readyOut !== S.readyOutSeen) {
      S.readyOutSeen = room.readyOut;
      toast('Vaqtida «Tayyorman» bosilmadi — siz mehmonsiz. Qayta oʻtirish uchun boʻsh oʻringa bosing.');
    }
    // Hamma oʻtirdi — tayyorlikni soʻrash (tebranish bilan)
    if (room.readyIn && room.mySeat >= 0 && room.seats[room.mySeat] && !room.seats[room.mySeat].ready && !S.readyBuzz) { S.readyBuzz = true; haptic('heavy'); }
    if (!room.readyIn) S.readyBuzz = false;
    S.deadlineTotal = room.deadlineTotal || 0;

    S.eventFresh = false;
    if (room.event && room.event.seq !== S.lastEventSeq) {
      S.lastEventSeq = room.event.seq;
      S.eventFresh = true;
      onEvent(room.event, room);
    }
    const myTurn = room.phase === 'playing' && isActor(g, room.mySeat);
    if (myTurn && !S.wasMyTurn) haptic('medium');
    S.wasMyTurn = myTurn;
    setClosingConfirm(room.phase === 'playing' && room.mySeat >= 0);

    if (room.phase === 'roundEnd' && S.resultShownFor !== room.round && S.resultClosedFor !== room.round) {
      S.resultShownFor = room.round;
      S.sheet = { type: 'result' };
      S.sheetAnim = true;
    }
    if (S.sheet && S.sheet.type === 'result' && room.phase !== 'roundEnd') S.sheet = null;
    // Boʻshagan oʻrin toʻldi — stol egasiga tanlov oynasi
    if (room.resumeAsk && room.isHost && (!S.sheet || S.sheet.type !== 'resume') && S.resumeShown !== room.resumeId) {
      S.resumeShown = room.resumeId;
      S.sheet = { type: 'resume' };
      S.sheetAnim = true;
    }
    if (S.sheet && S.sheet.type === 'resume' && !room.resumeAsk) S.sheet = null;
    // Tanlangan oʻrin holati oʻzgarsa — oʻrin oynasi yangilanadi yoki yopiladi
    if (S.sheet && S.sheet.type === 'seat' && !seatSheetHTML(room, S.sheet.seat)) S.sheet = null;

    if (S.sweeping) return; // animatsiya tugagach chiziladi
    const pg = prev && prev.game;
    if (!reduceMotion && pg && pg.phase === 'trickEnd' && pg.trick && g && prev.round === room.round &&
        (g.trickNo !== pg.trickNo || g.phase === 'roundEnd')) {
      const el = document.getElementById('trick');
      if (el) {
        S.sweeping = true;
        el.classList.add('sweep', 'to-' + posOf(prev, pg.trick.winner));
        setTimeout(function () { S.sweeping = false; render(); }, 330);
        return;
      }
    }
    render();
  }

  function onEvent(ev, room) {
    const list = [ev].concat(ev.also || []);
    for (const e of list) {
      if (e.kind === 'reveal') {
        toast('Yopiq karta: ' + RANK[E.rankOf(e.card)] + ' ' + SUIT_CHAR[E.suitOf(e.card)] + (e.from !== e.to ? ' — koʻzir endi ' + SUIT_CHAR[e.to] : ' — koʻzir oʻzgarmadi'));
        haptic('warning');
      }
    }
    if (ev.kind === 'deal') {
      const note = edgeNote(room); // shans raundi haqida eslatma
      if (note) { toast(note); haptic('warning'); }
    }
    if (ev.kind === 'win' || ev.kind === 'aces') haptic(room.myTeam === ev.team ? 'success' : 'error');
    else if (ev.kind === 'bura') haptic('heavy');
    else if (ev.kind === 'beat' && ev.seat !== room.mySeat) haptic('light');
  }

  // ---------- yordamchilar ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function suitSvg(s, cls) { return '<svg class="' + (cls || '') + '" aria-hidden="true"><use href="#s-' + s + '"/></svg>'; }
  function suitInline(s) { return s ? suitSvg(s, s === 'H' || s === 'D' ? 'red' : '') : ''; }
  function iconSvg(id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  function cardName(c) { return RANK_NAME[E.rankOf(c)] + ' ' + SUIT_NAME[E.suitOf(c)]; }
  function seatName(r, s) { return r.seats[s] ? r.seats[s].name : '?'; }
  function firstLetter(name) { const ch = Array.from(String(name || '?').trim())[0] || '?'; return ch.toUpperCase(); }
  function repeat(str, n) { let o = ''; for (let i = 0; i < n; i++) o += str; return o; }

  function cardHTML(c, o) {
    o = o || {};
    const r = E.rankOf(c), s = E.suitOf(c), d = RANK[r];
    const small = o.size === 'sm' || o.size === 'xs';
    const court = r === 'K' || r === 'Q' || r === 'J';
    const red = s === 'H' || s === 'D';
    const tag = o.tag || 'div';
    const art = SKIN === 'kashta' && SKIN_ART[c] ? artUrl(c) : null;
    const cls = 'card face' + (red ? ' red' : '') + (art ? ' art' : '') + (o.size ? ' ' + o.size : '') + (o.cls ? ' ' + o.cls : '');
    let h = '<' + tag + (tag === 'button' ? ' type="button"' : '') + ' class="' + cls + '" data-c="' + c + '" aria-label="' + cardName(c) + '"' + (o.attrs || '') + '>' +
      '<span class="ix"><b>' + d + '</b>' + suitSvg(s) + '</span>' +
      '<span class="mid">' + (art ? '<img class="pic" src="' + art + '" alt="" draggable="false">' : court ? '<i class="court">' + d + '</i>' : suitSvg(s)) + '</span>';
    if (!small) h += '<span class="ix ix2"><b>' + d + '</b>' + suitSvg(s) + '</span>';
    if (o.pt) { const p = E.points(c); if (p) h += '<span class="pt">' + p + '</span>'; }
    return h + '</' + tag + '>';
  }
  function backHTML(size) { return '<div class="card back' + (size ? ' ' + size : '') + '"></div>'; }

  // Server ham aynan shu tartibdan foydalanadi: vaqt tugasa, chap tarafdagi kartalar yuriladi
  function sortHand(hand, trump) { return E.sortHand(hand, trump); }

  function btn(act, label, kind, disabled, extra) {
    return '<button type="button" class="btn ' + kind + '" data-act="' + act + '"' + (disabled ? ' disabled' : '') + (extra || '') + '>' + label + '</button>';
  }
  function linkBtn(act, label) { return '<button type="button" class="link" data-act="' + act + '">' + label + '</button>'; }

  function avatarHTML(seat, s, active, plus) {
    const voice = VC && seat && !seat.bot;
    const it = seat && seat.item && ITEMS[seat.item] ? seat.item : null;
    return '<div class="ava' + (it ? ' hasitm' : '') + '" style="--av:' + AVATAR_BG[s % AVATAR_BG.length] + '"' + (voice ? ' data-vs="' + s + '"' : '') + '><span>' + esc(firstLetter(seat && seat.name)) + '</span>' +
      (seat && seat.photo ? '<img src="' + esc(seat.photo) + '" alt="" referrerpolicy="no-referrer">' : '') +
      (active ? '<i class="ring"></i>' : '') + (voice ? VBADGE : '') +
      (plus ? '<i class="plus" aria-hidden="true">+</i>' : '') +
      (seat && seat.item && ITEMS[seat.item] ? '<i class="itm itm-' + seat.item + '" title="' + ITEMS[seat.item].name + '">' + ITEMS[seat.item].svg + '</i>' : '') + '</div>';
  }

  // Oʻyinchi oʻz oldiga qoʻyadigan narsalar (poker stolidagidek)
  const ITEMS = {
    whisky: { name: 'Viski', svg: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="43" rx="16" ry="3.6" fill="url(#g-shadow)"/> <path d="M9 12.5 L11.6 39 Q12 42 15 42 H33 Q36 42 36.4 39 L39 12.5 Z" fill="url(#g-glass)" stroke="#eef6ff" stroke-opacity=".8" stroke-width=".8"/> <path d="M10.6 24 L12.3 38.4 Q12.7 40.6 15.2 40.6 H32.8 Q35.3 40.6 35.7 38.4 L37.4 24 Z" fill="url(#g-whisky)" opacity=".95"/> <ellipse cx="24" cy="24" rx="13.4" ry="3" fill="url(#g-wtop)"/> <g><path d="M14 16.5 l7 -2 l2.6 6.4 l-7 2.2z" fill="url(#g-ice)" stroke="#fff" stroke-opacity=".7" stroke-width=".6"/><path d="M14 16.5 l2.6 6.6 l-1.6 1.4 l-2.4 -6.4z" fill="#b9d6ee" opacity=".7"/> <path d="M24.5 15.5 l6.4 1.4 l-1.2 6.6 l-6.6 -1.4z" fill="url(#g-ice)" stroke="#fff" stroke-opacity=".7" stroke-width=".6"/><path d="M23.1 22.1 l6.6 1.4 l-.4 2 l-6.6 -1.6z" fill="#b9d6ee" opacity=".6"/></g> <path d="M12.3 37.6 Q24 42 35.7 37.6 L35.4 39.6 Q24 44 12.6 39.6Z" fill="#fff" opacity=".35"/> <ellipse cx="24" cy="12.5" rx="15" ry="3.2" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.1"/> <path d="M12.2 15 L14 36" stroke="#fff" stroke-opacity=".85" stroke-width="1.6" stroke-linecap="round"/><path d="M15.4 15.6 L16.6 30" stroke="#fff" stroke-opacity=".4" stroke-width=".9" stroke-linecap="round"/></svg>' },
    cigar: { name: 'Sigara', svg: '<svg viewBox="0 0 48 48"><g class="smoke" fill="none" stroke="#e8e4dc" stroke-linecap="round"><path d="M40 20 c-3 -3 3 -5 0 -8 s3 -5 0 -8" stroke-width="1.8" opacity=".75"/><path d="M43.5 19 c-2 -2.5 2 -4 0 -6.5" stroke-width="1.3" opacity=".5"/></g> <ellipse cx="22" cy="37" rx="19" ry="3.4" fill="url(#g-shadow)"/> <g transform="rotate(-18 22 28)"><rect x="2" y="23.5" width="36" height="9" rx="4.5" fill="url(#g-cigar)"/> <path d="M4 25.2 h32" stroke="#e8b88a" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round"/> <path d="M9 23.6 q1 4.5 0 8.8 M15 23.6 q1 4.5 0 8.8 M27 23.6 q1 4.5 0 8.8" stroke="#3a1d0c" stroke-opacity=".35" stroke-width=".7" fill="none"/> <rect x="17.5" y="23.3" width="6.5" height="9.4" fill="url(#g-band)"/><rect x="19.2" y="23.3" width="3" height="9.4" fill="#b8122a"/><circle cx="20.7" cy="28" r="1.3" fill="#ffe08a"/> <rect x="36.4" y="23.5" width="3.2" height="9" rx="1.4" fill="#9a9590"/><ellipse cx="39.8" cy="28" rx="1.7" ry="4.3" fill="url(#g-ember)"/></g> <circle cx="40.8" cy="21.5" r="4" fill="#ff7a2c" opacity=".25"/></svg>' },
    cake: { name: 'Tort', svg: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="40.5" rx="21" ry="5.6" fill="url(#g-plate)" stroke="#aeb7c8" stroke-width=".6"/><ellipse cx="24" cy="40" rx="16" ry="3.8" fill="none" stroke="#e6ebf3" stroke-width="1"/> <path d="M7 22 L33 15 L41 21 L41 36 L15 41 L7 36 Z" fill="none"/> <path d="M15 26 L41 21 L41 35.5 L15 40.5 Z" fill="url(#g-sponge)"/> <path d="M7 21.5 L15 26 L15 40.5 L7 36 Z" fill="url(#g-side)"/> <path d="M15 31 L41 26.2 L41 28.8 L15 33.6 Z" fill="url(#g-cream)"/><path d="M7 26.6 L15 31 L15 33.6 L7 29.2 Z" fill="#d9c4a4"/> <path d="M7 21.5 L33 15.5 L41 21 L15 26 Z" fill="url(#g-cream)"/> <path d="M15 26 c1.6 2 3.2 2 4.8 .2 s3.2 -2 4.8 -.2 3.2 2 4.8 .2 3.2 -2 4.8 -.2 3.2 1.8 4.8 -.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/> <path d="M7 21.5 c1.2 1.6 2.6 2.4 4 2.2 s2.6 1 4 2.3" fill="none" stroke="#f3e7d2" stroke-width="2" stroke-linecap="round"/> <path d="M26 17.5 c.6 -3 2.6 -5.2 5.4 -6" stroke="#3f6e22" stroke-width="1.2" fill="none" stroke-linecap="round"/> <ellipse cx="25.4" cy="18.8" rx="3.6" ry="1.2" fill="#000" opacity=".2"/><circle cx="25.4" cy="16.4" r="3.6" fill="url(#g-cherry)"/><ellipse cx="24.3" cy="15.2" rx="1.1" ry=".8" fill="#fff" opacity=".85"/></svg>' },
    beer: { name: 'Pivo', svg: '<svg viewBox="0 0 48 48"><ellipse cx="24" cy="44" rx="10" ry="2.6" fill="url(#g-shadow)"/> <path d="M20 9 h8 v4.5 c0 3 5 5.5 5 11.5 v16 q0 3 -3 3 h-12 q-3 0 -3 -3 v-16 c0 -6 5 -8.5 5 -11.5 z" fill="url(#g-bottle)"/> <path d="M15.2 22 q8.8 -1.2 17.6 0 v1.2 q-8.8 -1.2 -17.6 0z" fill="#fff" opacity=".35"/> <path d="M15 27 h18 v9 q-9 1.6 -18 0z" fill="url(#g-label)"/><path d="M15 27 q9 -1.4 18 0" fill="none" stroke="#c9a23c" stroke-width=".8"/> <path d="M18.5 31.3 h11" stroke="#2148a3" stroke-width="1.8" stroke-linecap="round"/><path d="M20.5 34 h7" stroke="#c8102e" stroke-width="1" stroke-linecap="round"/> <rect x="19.4" y="6.6" width="9.2" height="3.4" rx="1" fill="url(#g-cap)"/><path d="M19.4 8.3 h9.2" stroke="#6a6f78" stroke-width=".5" stroke-dasharray="1 1"/> <path d="M27 8.5 a7 7 0 0 1 9.6 1.6 l-7.6 4.4 z" fill="url(#g-lime)" stroke="#3f7a14" stroke-width=".6"/><path d="M28.3 9.3 a5.2 5.2 0 0 1 6.8 1.2 l-5.6 3.2 z" fill="#efffd0" opacity=".85"/><path d="M29.8 10.8 l3 -.5 M29.6 12 l2.6 .9" stroke="#9ad44a" stroke-width=".5"/> <path d="M18 15.5 c-1.4 3 -1.8 5.4 -1.8 8.6 v15" stroke="#fff" stroke-opacity=".75" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M21.4 9.5 v4" stroke="#fff" stroke-opacity=".6" stroke-width="1" stroke-linecap="round"/></svg>' }
  };
  // Narsalar uchun gradiyentlar (hajm, yaltirash) — bir marta sahifaga qoʻshiladi
  const ITEM_DEFS = '<linearGradient id="g-glass" x1="0" x2="1"><stop offset="0" stop-color="#cfe3f5" stop-opacity=".55"/><stop offset=".18" stop-color="#fff" stop-opacity=".85"/><stop offset=".35" stop-color="#dfefff" stop-opacity=".25"/><stop offset=".8" stop-color="#bcd4ea" stop-opacity=".2"/><stop offset="1" stop-color="#9fbcd8" stop-opacity=".6"/></linearGradient> <linearGradient id="g-whisky" x1="0" x2="1"><stop offset="0" stop-color="#7a3a08"/><stop offset=".3" stop-color="#d2801e"/><stop offset=".55" stop-color="#f2a93a"/><stop offset="1" stop-color="#8a4510"/></linearGradient> <radialGradient id="g-wtop" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#d98a26"/></radialGradient> <linearGradient id="g-ice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#cfe6f7" stop-opacity=".55"/></linearGradient> <linearGradient id="g-cigar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c58a5a"/><stop offset=".3" stop-color="#8e5530"/><stop offset=".75" stop-color="#5a2f15"/><stop offset="1" stop-color="#3a1d0c"/></linearGradient> <linearGradient id="g-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#d9a028"/><stop offset="1" stop-color="#8a5a08"/></linearGradient> <radialGradient id="g-ember" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#fff2b0"/><stop offset=".4" stop-color="#ff9a3c"/><stop offset=".8" stop-color="#d23a10"/><stop offset="1" stop-color="#6a2a10"/></radialGradient> <linearGradient id="g-sponge" x1="0" x2="1"><stop offset="0" stop-color="#4a200e"/><stop offset=".5" stop-color="#7a3b1c"/><stop offset="1" stop-color="#5a2812"/></linearGradient> <linearGradient id="g-side" x1="0" x2="1"><stop offset="0" stop-color="#3a180a"/><stop offset="1" stop-color="#5e2a12"/></linearGradient> <linearGradient id="g-cream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#efdcc0"/></linearGradient> <radialGradient id="g-cherry" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".35" stop-color="#e01530"/><stop offset="1" stop-color="#6a0410"/></radialGradient> <radialGradient id="g-plate" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd6e2"/></radialGradient> <linearGradient id="g-bottle" x1="0" x2="1"><stop offset="0" stop-color="#a87a10"/><stop offset=".22" stop-color="#ffe08a"/><stop offset=".4" stop-color="#f0bd3a"/><stop offset=".85" stop-color="#c88a12"/><stop offset="1" stop-color="#7a5208"/></linearGradient> <linearGradient id="g-label" x1="0" x2="1"><stop offset="0" stop-color="#d9d2c0"/><stop offset=".3" stop-color="#fffdf6"/><stop offset="1" stop-color="#cfc6b0"/></linearGradient> <linearGradient id="g-cap" x1="0" x2="1"><stop offset="0" stop-color="#8a8f99"/><stop offset=".4" stop-color="#f4f6fa"/><stop offset="1" stop-color="#7a7f88"/></linearGradient> <radialGradient id="g-lime" cx=".4" cy=".4" r=".7"><stop offset="0" stop-color="#eaffc0"/><stop offset=".6" stop-color="#9ad44a"/><stop offset="1" stop-color="#4a8a18"/></radialGradient> <radialGradient id="g-shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>';
  (function () {
    const d = document.createElement('div');
    d.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + ITEM_DEFS + '</defs></svg>';
    document.body.appendChild(d.firstChild);
  })();
  function itemsHTML() {
    const r = S.room, me = r && r.mySeat >= 0 ? r.seats[r.mySeat] : null, cur = me && me.item;
    let h = '<h2>Oldingizga nima qoʻyasiz?</h2><p class="sub">Stoldagilarning hammasi koʻradi.</p><div class="items">';
    Object.keys(ITEMS).forEach(function (k) {
      h += '<button type="button" class="item' + (cur === k ? ' on' : '') + '" data-act="setitem" data-item="' + k + '" aria-pressed="' + (cur === k) + '">' +
        '<span class="ipic">' + ITEMS[k].svg + '</span><b>' + ITEMS[k].name + '</b></button>';
    });
    h += '</div><div class="lobby-actions">' + (cur ? btn('setitem', 'Olib qoʻyish', 'secondary') : '') + btn('close', 'Yopish', 'primary') + '</div>';
    return h;
  }

  function heroHTML(load, mini) {
    return '<div class="hero' + (load && !reduceMotion ? ' load' : '') + (mini ? ' compact' : '') + '" aria-hidden="true">' +
      backHTML('xl') + cardHTML('AS', { size: 'xl' }) + backHTML('xl') + '</div>' +
      '<h1 class="wordmark' + (mini ? ' compact' : '') + '">Bura</h1>';
  }

  // ---------- ekranlar ----------
  function render() {
    let html = '';
    if (S.screen === 'loading') html = '<div class="lobby">' + heroHTML(true) + '<p class="tag">Ulanmoqda…</p></div>';
    else if (S.screen === 'auth') html = authHTML();
    else if (S.screen === 'home') html = homeHTML();
    else if (S.screen === 'hall' && S.hall) html = hallHTML(S.hall);
    // Lobbi alohida ekran emas: stollar zali koʻrinadi, oʻzingiz stolingiz atrofida oʻtirasiz
    else if (S.room) html = S.room.phase === 'lobby' ? (S.hall ? hallHTML(S.hall) : lobbyHTML(S.room)) : tableHTML(S.room);
    syncBackButton();
    if (S.conn !== 'open' && !DEMO && S.screen !== 'loading') html += '<div class="conn">Aloqa uzildi. Qayta ulanmoqda…</div>';
    html += sheetHTML();
    app.innerHTML = html;
    afterRender();
  }

  function afterRender() {
    app.querySelectorAll('[data-key]').forEach(function (el) { S.seenSlots.add(el.getAttribute('data-key')); });
    const r = S.room, g = r && r.game;
    if (g && g.hand) g.hand.forEach(function (c) { S.seenHand.add(r.round + ':' + c); });
    app.querySelectorAll('.ava img').forEach(function (img) { img.addEventListener('error', function () { img.remove(); }); });
    S.sheetAnim = false;
    paintVoice();
    tick();
  }

  function renderActions() {
    const a = app.querySelector('.actions');
    if (a && S.room && S.room.game) a.outerHTML = actionsHTML(S.room);
  }

  function authHTML() {
    return '<div class="lobby">' + heroHTML(false) +
      '<p class="tag">Bu oʻyin Telegram ichida ishlaydi.</p>' +
      '<p class="note">Guruhdagi «Oʻyinga kirish» tugmasi orqali yoki bot menyusidan oching.</p></div>';
  }

  // Til almashtirish: UZ | RU — zal, bosh sahifa va menyuda koʻrinib turadi
  function langHTML() {
    if (!window.BuraI18n) return '';
    const l = window.BuraI18n.lang;
    return '<div class="langsw" role="group" aria-label="Tilni tanlash" data-noi18n>' +
      ['uz', 'ru'].map(function (x) {
        return '<button type="button" data-act="lang" data-l="' + x + '" aria-pressed="' + (l === x) + '"' + (l === x ? ' class="on"' : '') + '>' + x.toUpperCase() + '</button>';
      }).join('') + '</div>';
  }

  function homeHTML() {
    return '<div class="lobby"><div class="langrow">' + langHTML() + '</div>' + heroHTML(true) +
      '<p class="tag">2×2 jamoa. Kim 61 ochko yigʻadi?</p>' +
      (S.missing ? '<p class="warn">Bu stol yopilgan yoki topilmadi. Yangi stol oching.</p>' : '') +
      '<div class="lobby-actions">' + btn('create', 'Yangi stol ochish', 'primary', S.busy) + '</div>' +
      '<p class="note">Guruhda /bura deb yozsangiz, bot hamma uchun stol ochadi.</p>' +
      '<nav class="links">' + linkBtn('rules', 'Qoidalar') + '</nav></div>';
  }

  // ---------- guruh zali: guruhdagi barcha stollar (poker zali kabi) ----------
  const HALL_POS = ['s0', 's1', 's2', 's3']; // 0 — pastda, 1 — chapda, 2 — tepada, 3 — oʻngda: sheriklar roʻparama-roʻpara

  // Hamma oʻtirdi: har kim «Tayyorman» bosadi (15 soniya). Bosmagan — mehmon rejimiga oʻtadi
  function readyBarHTML(r) {
    if (!r || r.phase !== 'lobby' || !r.readyIn) return '';
    const n = r.seats.filter(function (s) { return s && s.ready; }).length;
    const me = r.mySeat >= 0 ? r.seats[r.mySeat] : null;
    const left = '<b class="rleft" data-readyleft>' + Math.ceil(r.readyIn / 1000) + '</b>';
    let h = '<div class="readybar' + (me && !me.ready ? ' ask' : '') + '" role="region" aria-label="Tayyorlik">' + left + '<div class="rtxt">';
    if (me && !me.ready) h += '<b>Hamma oʻtirdi!</b><small>Tayyorman tugmasini bosing — aks holda mehmon rejimiga oʻtasiz</small></div>' + btn('ready', 'Tayyorman', 'primary', S.busy);
    else h += '<b>' + (me ? 'Siz tayyorsiz' : 'Oʻyinchilar tayyorlanmoqda') + '</b><small>Tayyor: ' + n + '/' + sizeOf(r) + '</small></div>';
    return h + '</div>';
  }

  function isMyLobby(t) { return !!(S.room && S.room.id === t.id && t.phase === 'lobby'); }

  function hallOrder(t) { return duel(t) ? [1, 0] : [2, 1, 3, 0]; }
  function hpos(t, i) { return duel(t) ? (i === 0 ? 's0' : 's2') : HALL_POS[i]; }
  function hallSeat(t, i) {
    const s = t.seats[i];
    const room = ' data-room="' + esc(t.id) + '" data-seat="' + i + '"';
    if (isMyLobby(t) && s && !s.bot && !s.you && S.room.isHost) {
      return '<button type="button" class="hs take ' + hpos(t, i) + '" data-act="seatmenu" data-seat="' + i + '" aria-label="' + esc(s.name) + ': oʻyindan chiqarish">' +
        '<span class="hava t' + (i % 2) + (s.online ? '' : ' off') + '" style="--av:' + AVATAR_BG[i % AVATAR_BG.length] + '"><span>' + esc(firstLetter(s.name)) + '</span>' +
        (s.photo ? '<img src="' + esc(s.photo) + '" alt="" referrerpolicy="no-referrer">' : '') + '</span><small>' + esc(s.name) + '</small>' +
        (t.readyIn ? '<i class="rdy' + (s.ready ? ' ok' : '') + '">' + (s.ready ? '✓' : '…') + '</i>' : '') + '</button>';
    }
    if (isMyLobby(t) && (!s || s.bot)) {
      // oʻzim turgan stol: boʻsh oʻrin — bot/taklif/oʻtirish, bot — chiqarish
      if (!s) return '<button type="button" class="hs free ' + hpos(t, i) + '" data-act="seatmenu" data-seat="' + i + '" aria-label="Boʻsh oʻrin: ' + (i % 2 + 1) + '-jamoa">' +
        '<span class="hava empty">+</span><small>Boʻsh</small></button>';
      return '<button type="button" class="hs take ' + hpos(t, i) + '" data-act="seatmenu" data-seat="' + i + '" aria-label="' + esc(s.name) + ': bot">' +
        '<span class="hava t' + (i % 2) + '" style="--av:' + AVATAR_BG[i % AVATAR_BG.length] + '">' + iconSvg('i-bot') + '</span><small>' + esc(s.name) + '</small></button>';
    }
    if (!s) {
      if (t.phase !== 'lobby') return '<div class="hs ' + hpos(t, i) + '"><span class="hava empty"></span><small>boʻsh</small></div>';
      return '<button type="button" class="hs free ' + hpos(t, i) + '" data-act="hsit"' + room + ' aria-label="' + t.no + '-stol: ' + (i % 2 + 1) + '-jamoaga oʻtirish"' + (S.busy ? ' disabled' : '') + '>' +
        '<span class="hava empty">+</span><small>Oʻtirish</small></button>';
    }
    const inner = '<span class="hava t' + (i % 2) + (s.online ? '' : ' off') + '" style="--av:' + AVATAR_BG[i % AVATAR_BG.length] + '">' +
      (s.bot ? iconSvg('i-bot') : '<span>' + esc(firstLetter(s.name)) + '</span>' + (s.photo ? '<img src="' + esc(s.photo) + '" alt="" referrerpolicy="no-referrer">' : '')) +
      '</span><small>' + (s.you ? 'Siz' : esc(s.name)) + (s.auto ? ' · bot' : '') + '</small>' +
      (t.readyIn ? '<i class="rdy' + (s.ready ? ' ok' : '') + '" aria-label="' + (s.ready ? 'tayyor' : 'kutilmoqda') + '">' + (s.ready ? '✓' : '…') + '</i>' : '');
    if (t.phase === 'roundEnd' && (s.bot || s.auto) && t.mine < 0) {
      return '<button type="button" class="hs take ' + hpos(t, i) + '" data-act="hsit"' + room + ' aria-label="' + esc(s.name) + ' oʻrniga oʻtirish"' + (S.busy ? ' disabled' : '') + '>' + inner + '</button>';
    }
    return '<div class="hs ' + hpos(t, i) + (s.you ? ' you' : '') + '">' + inner + '</div>';
  }

  function hallStatus(t) {
    const n = t.seats.filter(Boolean).length;
    const N = sizeOf(t);
    if (t.phase === 'lobby') return n >= N ? { cls: 'go', text: t.readyIn ? 'Tayyorlik · ' + t.seats.filter(function (s) { return s && s.ready; }).length + '/' + N : 'Boshlanmoqda' } : { cls: 'wait', text: 'Odam kutmoqda · ' + n + '/' + N };
    if (t.phase === 'roundEnd') return { cls: 'pause', text: t.matchOver ? 'Match tugadi' : t.round + '-raund tugadi' };
    return { cls: 'play', text: t.round + '-raund ketmoqda' };
  }

  function hallCard(t) {
    const st = hallStatus(t);
    const room = ' data-room="' + esc(t.id) + '"';
    const free = t.phase === 'lobby' && t.seats.some(function (s) { return !s; });
    const botSeat = t.phase === 'roundEnd' ? t.seats.findIndex(function (s) { return s && (s.bot || s.auto); }) : -1;
    let action;
    if (isMyLobby(t)) {
      action = (S.room.mySeat >= 0 ? btn('share', iconSvg('i-send') + 'Taklif', 'primary sm ico', false) : btn('hsit', 'Oʻtirish', 'primary sm', S.busy, room));
    } else if (t.mine >= 0) action = btn('henter', 'Stolga qaytish', 'primary sm', S.busy, room);
    else if (free) action = btn('hsit', 'Oʻtirish', 'primary sm', S.busy, room);
    else if (botSeat >= 0) action = btn('hsit', 'Bot oʻrniga', 'primary sm', S.busy, room + ' data-seat="' + botSeat + '"');
    else action = btn('henter', 'Kuzatish', 'secondary sm', S.busy, room);
    const mid = t.phase === 'lobby'
      ? '<b>' + t.seats.filter(Boolean).length + '/' + sizeOf(t) + '</b><small>oʻrin</small>'
      : '<b>' + t.score[0] + ' : ' + t.score[1] + '</b><small>hisob</small>';
    const meta = [];
    if (t.spectators) meta.push('👀 ' + t.spectators + ' kuzatmoqda');
    if (t.voice) meta.push('🎙 ' + t.voice);
    if (isMyLobby(t)) {
      const r = S.room, need = sizeOf(t) - t.seats.filter(Boolean).length;
      meta.unshift(need > 0 ? (duel(t) ? 'Oʻyin 2 kishi toʻlganda boshlanadi' : 'Oʻyin 4 kishi toʻlganda boshlanadi') : t.readyIn ? 'Hamma oʻtirdi — «Tayyorman» bosing' : 'Hamma joyida — boshlanmoqda…');
      const tools = [];
      if (canManage(r) && need > 0) tools.push(btn('fillBots', 'Qolgan ' + need + ' oʻringa bot', 'secondary sm', S.busy));
      if (r.mySeat >= 0) tools.push(btn('leave', 'Stoldan turish', 'secondary sm', S.busy));
      return '<article class="tcard mine here">' +
        '<div class="tc-head"><b>' + t.no + '-stol · sizning stolingiz</b><span class="chip ' + st.cls + '">' + st.text + '</span></div>' +
        '<div class="felt">' + hallOrder(t).map(function (i) { return hallSeat(t, i); }).join('') + '<div class="fmid">' + mid + '</div></div>' +
        '<div class="tc-foot"><span class="meta">' + meta.join(' · ') + '</span>' + action + '</div>' +
        (tools.length ? '<div class="tc-tools">' + tools.join('') + '</div>' : '') + '</article>';
    }
    return '<article class="tcard' + (t.mine >= 0 ? ' mine' : '') + '">' +
      '<div class="tc-head"><b>' + t.no + '-stol</b><span class="chip ' + st.cls + '">' + st.text + '</span></div>' +
      '<div class="felt">' + hallOrder(t).map(function (i) { return hallSeat(t, i); }).join('') + '<div class="fmid">' + mid + '</div></div>' +
      '<div class="tc-foot"><span class="meta">' + (meta.join(' · ') || '&nbsp;') + '</span>' + action + '</div></article>';
  }

  function hallHTML(h) {
    const list = h.tables || [];
    const inRoom = !!(S.room && S.room.phase === 'lobby');
    // oʻz stolim birinchi turadi
    const sorted = inRoom ? list.filter(isMyLobby).concat(list.filter(function (t) { return !isMyLobby(t); })) : list;
    let html = '<div class="hall"><header class="hall-top"><div><h1>Oʻyin zali</h1><small>' +
      esc(h.title ? h.title + ' · ' : '') + (list.length ? list.length + ' ta stol' : 'hozircha stol yoʻq') + '</small></div>' +
      (inRoom && VC ? micHTML('') : '') + langHTML() + linkBtn('rules', 'Qoidalar') + '</header>';
    if (!list.length) html += '<p class="hall-empty">Hali hech kim oʻynamayapti. Birinchi stolni oching — boshqalar uni shu yerda koʻrib, qoʻshiladi.</p>';
    else html += '<p class="hall-hint">Istalgan stoldagi boʻsh oʻringa bosing — oʻsha jamoaga oʻtirasiz. Oʻyin ketayotgan stolni kuzatishingiz mumkin.</p>';
    html += '<div class="tables">' + sorted.map(hallCard).join('') + '</div>';
    html += '<div class="hall-actions">' + btn('hnew', '+ Yangi stol ochish', list.length ? 'secondary wide' : 'primary wide', S.busy) +
      (DEMO ? '' : '<button type="button" class="effbtn" data-act="stats"><span class="effico" aria-hidden="true">%</span><span><b>Oʻyinchilar samaradorligi</b><small>Hamma oʻyinchilarning oʻyin tahlili</small></span></button>') + '</div>';
    if (inRoom && !DEMO) html += '<div class="hall-set">' + skinToggle() + '</div>';
    if (inRoom) html += readyBarHTML(S.room);
    return html + '</div>';
  }

  // Telegram'ning «Orqaga» tugmasi guruh stolidan zalga qaytaradi (oʻyin ketayotganda koʻrsatilmaydi)
  let backBound = false;
  function syncBackButton() {
    if (!TG || !TG.BackButton) return;
    try { if (!TG.isVersionAtLeast('6.1')) return; } catch (e) { return; }
    const r = S.room;
    const show = S.screen === 'room' && !!r && !!r.group && r.phase !== 'lobby' && !(r.phase === 'playing' && r.mySeat >= 0);
    if (!backBound) {
      backBound = true;
      TG.BackButton.onClick(function () { if (S.room && S.room.group) handle('tohall', null); });
    }
    try { if (show) TG.BackButton.show(); else TG.BackButton.hide(); } catch (e) { /* */ }
  }

  function seatNote(s) {
    if (s.bot) return 'Kompyuter';
    if (!s.online) return 'Oflayn';
    if (s.host) return 'Stol egasi';
    return 'Tayyor';
  }

  function seatRow(r, i) {
    const s = r.seats[i];
    if (s) {
      const canKick = !s.you && (s.bot ? canManage(r) : r.isHost && !s.online);
      return '<li class="seat' + (s.online ? '' : ' off') + '">' + avatarHTML(s, i, false) +
        '<div class="who"><b>' + esc(s.name) + (s.you && s.name !== 'Siz' ? ' (siz)' : '') + '</b><small>' + seatNote(s) + '</small></div>' +
        (canKick ? '<button type="button" class="mini-btn" data-act="kick" data-seat="' + i + '">' + (s.bot ? 'Olib tashlash' : 'Chiqarish') + '</button>' : '') + '</li>';
    }
    // Boʻsh oʻrin: doʻstni aynan shu oʻringa taklif qilish, bot qoʻyish (stol egasi) yoki oʻzi oʻtirish
    const hint = seatRole(r, i, true);
    let b = '';
    if (!DEMO) b += '<button type="button" class="mini-btn inv" data-act="invite" data-seat="' + i + '">' + iconSvg('i-send') + 'Taklif qilish</button>';
    if (canManage(r)) b += '<button type="button" class="mini-btn" data-act="addBot" data-seat="' + i + '" aria-label="Bu oʻringa bot qoʻshish">' + iconSvg('i-bot') + 'Bot</button>';
    b += '<button type="button" class="mini-btn plain" data-act="sit" data-seat="' + i + '">Oʻtirish</button>';
    return '<li class="seat empty"><div class="seat-top"><span class="ava ghost"></span><div class="who"><b>Boʻsh oʻrin</b><small>' + hint +
      '</small></div></div><div class="seat-btns">' + b + '</div></li>';
  }

  function lobbyHTML(r) {
    const filled = r.seats.filter(Boolean).length;
    let h = '<div class="lobby">';
    if (r.group) h += '<nav class="crumbs"><button type="button" class="link" data-act="tohall">← Barcha stollar</button><b>' + r.no + '-stol</b></nav>';
    h += heroHTML(false, true) + '<p class="tag compact">' + (duel(r) ? '1×1 — bir-biringizga qarshi.' : '2×2 jamoa.') + ' Kim 61 ochko yigʻadi?</p>'; // ixcham: oʻrinlar va tugmalar birinchi ekranda koʻrinsin
    if (duel(r)) h += '<section class="team duel"><h2>1×1</h2><ul class="seats">' + seatRow(r, 0) + seatRow(r, 1) + '</ul></section>';
    else for (let t = 0; t < 2; t++) {
      h += '<section class="team' + (r.myTeam === t ? ' mine' : '') + '"><h2>' + (t + 1) + '-jamoa' + (r.myTeam === t ? '<small>siz shu jamoadasiz</small>' : '') + '</h2>' +
        '<ul class="seats">' + seatRow(r, t) + seatRow(r, t + 2) + '</ul></section>';
    }
    const need = sizeOf(r) - filled;
    h += '<p class="status">' + (r.autoStart ? 'Hamma joyida — oʻyin boshlanmoqda…'
      : need > 0 ? 'Oʻyin ' + sizeOf(r) + ' kishi toʻlganda boshlanadi — yana ' + need + ' kishi kerak.' : '') + '</p>';
    if (VC) h += '<div class="voice-row">' + micHTML('big') + '<div class="vtxt" data-vtext>' + voiceTextHTML() + '</div></div>';
    h += '<div class="lobby-actions">';
    if (!DEMO && need > 0) h += btn('share', iconSvg('i-send') + 'Doʻstlarni taklif qilish', 'primary ico');
    if (canManage(r) && need > 0) h += btn('fillBots', need === 1 ? 'Boʻsh oʻringa bot qoʻshish' : 'Qolgan ' + need + ' oʻringa bot qoʻshish', DEMO ? 'primary' : 'secondary', S.busy);
    if (r.mySeat < 0 && need === 0) h += '<p class="note">Stol toʻla. Siz tomosha qilyapsiz.</p>';
    h += '</div>';
    if (r.isHost) {
      h += '<label class="toggle"><input type="checkbox" data-act="helper"' + (r.settings.helper ? ' checked' : '') + '>' +
        '<span><b>Ochko yordamchisi</b><small>Jamoangiz olgan ochiq kartalar ochkosini koʻrsatadi</small></span></label>';
    }
    if (!DEMO) h += skinToggle();
    if (DEMO) h += '<p class="demo-note">Demo: sherigingiz va raqiblar — kompyuter. Telegramʼda stolga doʻstlaringiz oʻtiradi.</p>';
    h += '<nav class="links">' + linkBtn('rules', 'Qoidalar') + (r.mySeat >= 0 && !DEMO ? linkBtn('leave', 'Stoldan turish') : '') + '</nav></div>';
    return h;
  }

  // Match hisobi: ball yutqazgan jamoaga yoziladi — kami yaxshi. 12 ball qizil bilan belgilanadi.
  function scoreChip(r) {
    const us = r.myTeam >= 0 ? r.myTeam : 0;
    const label = r.myTeam >= 0 ? (duel(r) ? ['Siz', 'Raqib'] : ['Biz', 'Ular']) : (duel(r) ? ['1', '2'] : ['1-j.', '2-j.']);
    const num = function (t) { return '<b' + (r.score[t] >= r.edge ? ' class="edge"' : '') + '>' + r.score[t] + '</b>'; };
    return '<div class="score" aria-label="Hisob: ' + label[0] + ' ' + r.score[us] + ', ' + label[1] + ' ' + r.score[1 - us] + '. ' + r.lose + ' ballga yetgan jamoa yutqazadi">' +
      '<small>' + label[0] + '</small>' + num(us) + '<i>:</i>' + num(1 - us) + '<small>' + label[1] + '</small></div>';
  }

  // "Raqiblarga", "Sizning jamoangizga", "2-jamoaga"
  function teamTo(r, t) { return teamName(r, t) + 'ga'; }

  // 12 ballda turgan jamoa uchun har bir raund — shans
  function edgeNote(r) {
    if (r.matchOver) return '';
    const at = [0, 1].filter(function (t) { return r.score[t] >= r.edge && r.score[t] < r.lose; });
    if (!at.length) return '';
    if (at.length === 2) return (duel(r) ? 'Ikkalangiz ham ' : 'Ikkala jamoa ham ') + r.edge + ' ballda: keyingi raundda yutqazgan jamoa matchni boy beradi.';
    const t = at[0];
    if (r.myTeam < 0) return teamName(r, t) + ' ' + r.edge + ' ballda — shans: yana yutqazsa, matchni boy beradi.';
    return t === r.myTeam
      ? (duel(r) ? 'Siz ' : 'Jamoangiz ') + r.edge + ' ballda — bu shans: yutsangiz, oʻyin davom etadi, yutqazsangiz — match tugaydi.'
      : (duel(r) ? 'Raqib ' : 'Raqiblar ') + r.edge + ' ballda — keyingi raundni yutsangiz, match sizniki.';
  }

  function tableHTML(r) {
    const g = r.game;
    if (!g) return '';
    const seatAt = {};
    for (let s = 0; s < sizeOf(r); s++) seatAt[posOf(r, s)] = s;
    const plays = {};
    if (g.trick) g.trick.plays.forEach(function (p, i) { plays[p.seat] = { p: p, i: i }; });

    let h = '<header class="bar"><button type="button" class="icon" data-act="menu" aria-label="Menyu">' + iconSvg('i-menu') + '</button>' +
      '<div class="title"><b>' + (r.no ? r.no + '-stol' : 'Bura') + '</b><span>' + r.round + '-raund</span></div>' + micHTML('') + scoreChip(r) + '</header>';
    h += '<section class="field">' + GUL + '<div class="opps">' + ['l', 't', 'r'].map(function (p) { return oppHTML(r, seatAt[p], p); }).join('') + '</div>';
    h += '<div class="trick" id="trick">';
    ['l', 't', 'r'].forEach(function (p) { h += slotHTML(r, p, seatAt[p], plays); });
    h += '<div class="cell">' + deckHTML(g) + '</div>';
    h += slotHTML(r, 'b', seatAt.b, plays);
    h += '<div class="cell side">' + (g.trick && g.trick.k > 1 ? '<span class="ktag">' + g.trick.k + ' tadan</span>' : '') + watchHTML(r) + '</div>';
    h += '</div>';
    h += '<div class="event' + (S.eventFresh && !reduceMotion ? ' enter' : '') + '">' + eventHTML(r) + '</div></section>';
    h += dockHTML(r);
    return h;
  }

  // Stolni kuzatayotganlar (mehmonlar) — oʻynayotganlarga ham koʻrinib turadi
  function watchHTML(r) {
    const w = r.watchers || [];
    if (!w.length) return '';
    const names = w.map(function (x) { return x.you ? 'Siz' : x.name; });
    return '<button type="button" class="watch" data-act="watchers" aria-label="Kuzatmoqda: ' + esc(names.join(', ')) + '">' +
      '<span class="wavs">' + w.slice(0, 3).map(function (x, i) {
        return '<span class="wav" style="--av:' + AVATAR_BG[(i + 1) % AVATAR_BG.length] + '"><span>' + esc(firstLetter(x.name)) + '</span>' +
          (x.photo ? '<img src="' + esc(x.photo) + '" alt="" referrerpolicy="no-referrer">' : '') + '</span>';
      }).join('') + '</span><small>👀 ' + (w.length === 1 ? esc(names[0]) : w.length + ' kishi') + '</small></button>';
  }

  function skinToggle() {
    return '<label class="toggle"><input type="checkbox" data-act="skin"' + (SKIN === 'kashta' ? ' checked' : '') + '>' +
      '<span><b>Rasmli kartalar</b><small>Shoh, malika va valetlar kashta uslubidagi rasmlar bilan (faqat sizda)</small></span></label>';
  }

  // Stolda oʻtirgan (bot oʻynamayotgan) odam: bot qoʻsha/chiqara oladi
  function canManage(r) { return r.mySeat >= 0 && r.seats[r.mySeat] && !r.seats[r.mySeat].auto; }

  function emptySeatHTML(r, s, cls) {
    const role = seatRole(r, s, false);
    return '<button type="button" class="' + cls + ' empty" data-act="seatmenu" data-seat="' + s + '" aria-label="Boʻsh oʻrin, ' + role + '">' +
      '<div class="ava ghost"><span>+</span></div><div class="nm"><span>Boʻsh oʻrin</span></div><div class="mate">' + role + '</div></button>';
  }

  function oppHTML(r, s, p) {
    if (s === undefined) return '<div class="opp"></div>';
    if (!r.seats[s]) return emptySeatHTML(r, s, 'opp');
    const g = r.game, seat = r.seats[s];
    const active = r.phase === 'playing' && isActor(g, s);
    const partner = r.myTeam >= 0 && s % 2 === r.myTeam;
    const tap = seat.bot || seat.auto || (r.isHost && !seat.you); // botni bosib — chiqarish; stol egasi — istalgan oʻyinchini
    return '<div class="opp' + (active ? ' turn' : '') + (seat.online ? '' : ' off') + (partner ? ' partner' : '') + '">' +
      (tap ? '<button type="button" class="seat-tap" data-act="seatmenu" data-seat="' + s + '" aria-label="' + esc(seat.name) + ': bosing">' + avatarHTML(seat, s, active) + '</button>' : avatarHTML(seat, s, active)) +
      '<div class="nm">' + (seat.bot || seat.auto ? '<svg class="bi" aria-label="bot"><use href="#i-bot"/></svg>' : '') + '<span>' + esc(seat.name) + '</span></div>' +
      (partner ? '<div class="mate">sherik</div>' : '') +
      '<div class="meta"><span class="fan" aria-label="' + g.counts[s] + ' ta karta">' + repeat('<i class="mini"></i>', g.counts[s]) + '</span>' +
      '<span class="pile" aria-label="Olgan: ' + g.taken[s] + ' ta karta">' + iconSvg('i-pile') + g.taken[s] + '</span></div></div>';
  }

  function slotHTML(r, p, s, plays) {
    const g = r.game;
    let inner = '';
    if (s !== undefined && plays[s]) {
      const pl = plays[s].p, i = plays[s].i;
      const key = r.round + ':' + g.trickNo + ':' + i;
      const fresh = !S.seenSlots.has(key) && !reduceMotion;
      const cards = pl.up
        ? pl.cards.map(function (c) { return cardHTML(c, { size: 'sm' }); }).join('')
        : pl.cards
          ? pl.cards.map(function (c) { return cardHTML(c, { size: 'sm', cls: 'ghost' }); }).join('')
          : repeat(backHTML('sm'), pl.n);
      inner = '<div class="slot k' + pl.n + (g.trick.best === i ? ' best' : '') + (fresh ? ' enter-' + p : '') + '" data-key="' + key + '" aria-label="' +
        esc(seatName(r, s)) + (pl.up ? '' : ', yopiq') + '">' + cards + '</div>';
    }
    return '<div class="cell">' + inner + '</div>';
  }

  function deckHTML(g) {
    const red = g.trump === 'H' || g.trump === 'D';
    const hid = g.hiddenInStock ? '<div class="card sm back hid" aria-label="Yopiq karta"><span class="q">?</span></div>' : '';
    if (g.stock > 0) {
      return '<div class="deck-wrap"><div class="deck" aria-label="Kolodada ' + g.stock + ' ta karta">' + hid +
        (g.trumpInStock ? cardHTML(g.trumpCard, { size: 'sm', cls: 'trumpcard' }) : '') +
        (g.stock > 2 ? backHTML('sm') + '<span class="cnt">' + g.stock + '</span>' : '') +
        '</div><small>koʻzir ' + suitInline(g.trump) + '</small></div>';
    }
    const changed = g.trump !== g.firstTrump;
    return '<div class="deck-wrap"><span class="kz' + (red ? ' red' : '') + '">' + suitSvg(g.trump) + '</span><small>' +
      (changed ? 'yangi koʻzir' : 'koʻzir') + '</small></div>';
  }

  function cardText(c) { return RANK[E.rankOf(c)] + suitInline(E.suitOf(c)); }

  function eventLine(r, ev) {
    const you = ev.seat === r.mySeat;
    const nm = you ? 'Siz' : esc(seatName(r, ev.seat));
    function v(third, second) { return nm + ' ' + (you ? second : third); }
    switch (ev.kind) {
      case 'deal': return ev.round + '-raund. ' + (you ? 'Siz birinchi yurasiz' : nm + ' birinchi yuradi') + '. Koʻzir: ' + suitInline(r.game && r.game.firstTrump);
      case 'lead': return ev.k > 1 ? v(ev.k + ' ta karta bilan yurdi', ev.k + ' ta karta bilan yurdingiz') : v('yurdi', 'yurdingiz');
      case 'bura': return 'Bura! ' + v('navbatsiz yurdi', 'navbatsiz yurdingiz');
      case 'beat': return v('urdi', 'urdingiz');
      case 'discard': return v('yopiq berdi', 'yopiq berdingiz');
      case 'collect': return v(ev.count + ' ta kartani oldi', ev.count + ' ta kartani oldingiz');
      case 'reveal': return v('yopiq kartani oldi: ', 'yopiq kartani oldingiz: ') + cardText(ev.card) + (ev.from !== ev.to ? '. Koʻzir endi ' + suitInline(ev.to) : '. Koʻzir oʻzgarmadi');
      case 'win': return esc(teamName(r, ev.team)) + ' yutdi: ' + ev.points[ev.team] + ' ochko';
      case 'aces': return '4 ta tuz! ' + (ev.via === 'taken' ? esc(teamName(r, ev.team)) + ' 4 ta tuzni yigʻdi — mutlaq gʻalaba' : v('mutlaq yutdi', 'mutlaq yutdingiz'));
      case 'draw': return '60:60 — durang';
      case 'resume': return 'Oʻyin davom etmoqda';
    }
    return '';
  }

  function eventHTML(r) {
    const ev = r.event;
    if (!ev) return '';
    let t = eventLine(r, ev);
    if (ev.auto) t += ' (vaqt tugadi)';
    (ev.also || []).forEach(function (e) { if (e.kind === 'reveal' || e.kind === 'bura') t += '<span class="also">' + eventLine(r, e) + '</span>'; });
    return t;
  }

  function dockHTML(r) {
    const g = r.game, me = r.mySeat;
    const myTurn = r.phase === 'playing' && isActor(g, me);
    let h = '<section class="dock">';
    if (myTurn && S.deadlineAt) h += '<div class="mytimer"><i></i></div>';
    if (me >= 0) {
      const d = duel(r);
      let help = g.teamCards ? (d ? 'Olganingiz: ' : 'Jamoa olgan: ') + g.teamCards + ' ta karta' : (d ? 'Hali karta olmadingiz' : 'Jamoangiz hali karta olmadi');
      if (g.teamCards && g.teamKnown != null) help = (d ? 'Sizda: <b>' : 'Jamoa: <b>') + g.teamKnown + '</b> ochiq ochko' + (g.teamHidden ? ', ' + g.teamHidden + ' ta yopiq' : '');
      h += '<div class="mebar' + (myTurn ? ' turn' : '') + '"><span class="mewho"><button type="button" class="seat-tap meava" data-act="items" aria-label="Oldingizga narsa qoʻyish">' + avatarHTML(r.seats[me], me, false, true) + '</button><b>Siz</b></span><span class="help">' + help + '</span></div>';
    } else if (!r.seats[0]) {
      h += '<div class="mebar"><span><b>Boʻsh oʻrin</b> · ' + (r.myTeam >= 0 ? '' : '1-jamoa') + '</span>' +
        '<button type="button" class="mini-btn inv" data-act="sit" data-seat="0">Oʻtirish</button></div>';
    } else if (r.seats[0]) {
      // Tomoshabin uchun pastdagi oʻrin (0) — shu oʻyinchi koʻrinib tursin
      const seat = r.seats[0], turn = r.phase === 'playing' && isActor(g, 0);
      h += '<div class="mebar' + (turn ? ' turn' : '') + '"><span><b>' + esc(seat.name) + '</b>' +
        (seat.bot || seat.auto ? ' · bot' : '') + '</span><span class="help took">' + iconSvg('i-pile') + g.taken[0] + ' ta karta oldi</span></div>';
    }
    return h + handHTML(r) + actionsHTML(r) + '</section>';
  }

  function handHTML(r) {
    const g = r.game;
    if (!g.hand && !r.seats[0]) return '<div class="hand spect"></div>';
    if (!g.hand) return '<div class="hand spect' + (isActor(g, 0) ? ' myturn' : '') + '" aria-label="' + esc(r.seats[0] ? r.seats[0].name : '') + ': ' + (g.counts[0] || 0) + ' ta karta">' + repeat(backHTML(), g.counts[0] || 0) + '</div>';
    const cards = sortHand(g.hand, g.trump);
    // Navbat menda: kartalar qizil yonadi — biror kartaga bosilgach, shu navbat davomida oʻchadi
    if (!isActor(g, r.mySeat)) S.glowOff = false;
    const myTurn = isActor(g, r.mySeat) && !S.glowOff ? ' myturn' : '';
    return '<div class="hand n' + cards.length + myTurn + '" role="group" aria-label="Qoʻlingizdagi kartalar">' + cards.map(function (c, i) {
      const sel = S.selected.indexOf(c) >= 0;
      const fresh = !S.seenHand.has(r.round + ':' + c) && !reduceMotion;
      return cardHTML(c, { tag: 'button', pt: true, cls: (sel ? 'sel' : '') + (fresh ? ' enter' : ''), attrs: ' data-act="card" aria-pressed="' + sel + '" style="--i:' + i + '"' });
    }).join('') + '</div>';
  }

  function resultShort(r) {
    const res = r.result;
    if (!res) return '';
    if (res.type === 'draw') return '60:60 — durang. Keyingi raundda yutqazganga +' + (res.nextBonus || 2);
    return (res.type === 'aces' ? '4 ta tuz! ' : '') + esc(teamName(r, res.team)) + ' yutdi. ' +
      esc(teamTo(r, 1 - res.team)) + ' +' + res.award + ' ball';
  }

  function actionsFor(r) {
    const g = r.game, me = r.mySeat;
    const o = { hint: '', btns: [] };
    if (r.phase === 'roundEnd') {
      o.hint = resultShort(r);
      o.btns.push({ act: 'result', label: 'Natija', kind: 'secondary' });
      if (me >= 0 && !r.seats[me].auto) o.btns.push({ act: 'next', label: r.matchOver ? 'Yangi match' : 'Keyingi raund', kind: 'primary' });
      else if (me < 0 && r.seats.some(function (s) { return !s; })) o.btns.push({ act: 'sit', label: 'Boʻsh oʻringa oʻtirish', kind: 'primary' });
      else if (me < 0 && r.seats.some(function (s) { return s && (s.bot || s.auto); })) o.btns.push({ act: 'sit', label: 'Bot oʻrniga oʻtirish', kind: 'primary' });
      return o;
    }
    if (r.paused) {
      const free = [];
      r.seats.forEach(function (s, i) { if (!s) free.push(i + 1); });
      o.hint = 'Oʻyin toʻxtatildi: ' + free.join(', ') + '-oʻrin boʻsh. Boʻsh joyni bosing — oʻtirish, bot qoʻshish yoki doʻstni taklif qilish.';
      if (me < 0) o.btns.push({ act: 'sit', label: 'Boʻsh oʻringa oʻtirish', kind: 'primary' });
      else if (canManage(r)) {
        o.btns.push({ act: 'share', label: 'Taklif qilish', kind: 'secondary' });
        o.btns.push({ act: 'fillBots', label: 'Bot qoʻshish', kind: 'primary' });
      }
      return o;
    }
    if (r.resumeAsk) {
      if (r.isHost) {
        o.hint = 'Oʻrin toʻldi. Oʻyinni davom ettirasizmi yoki yangidan boshlaysizmi?';
        o.btns.push({ act: 'restart', label: 'Yangidan', kind: 'secondary' });
        o.btns.push({ act: 'continue', label: 'Davom ettirish', kind: 'primary' });
      } else o.hint = 'Stol egasi tanlamoqda: davom ettirish yoki yangidan boshlash…';
      return o;
    }
    if (me < 0) { o.hint = 'Siz kuzatuvchisiz. Boʻsh oʻrin boʻlsa — bosib oʻtiring; raund tugagach, bot oʻrniga ham oʻtirish mumkin.'; return o; }
    if (r.seats[me].auto) {
      o.hint = 'Siz stoldan chiqdingiz — oʻrningizda bot oʻynayapti.';
      o.btns.push({ act: 'return', label: 'Oʻyinga qaytish', kind: 'primary' });
      return o;
    }
    if (g.phase === 'lead' && !g.trick) {
      if (g.leader === me) {
        const sel = S.selected, ok = sel.length > 0 && E.isValidLead(sel);
        o.hint = ok ? (sel.length > 1 ? 'Hamma ' + sel.length + ' tadan karta tashlaydi' : '') : 'Yurish uchun karta tanlang: 1 ta yoki bir xil mastdagi 2–4 ta';
        o.btns.push({ act: 'lead', label: ok && sel.length > 1 ? sel.length + ' ta bilan yurish' : 'Yurish', kind: 'primary', disabled: !ok });
        return o;
      }
      o.hint = esc(seatName(r, g.leader)) + ' yurmoqda…';
      return o;
    }
    if (g.phase === 'follow' && g.trick) {
      if (g.turn === me) {
        const k = g.trick.k, bestPlay = g.trick.plays[g.trick.best], best = bestPlay.cards;
        const can = E.canBeatWith(g.hand, best, g.trump);
        const sel = S.selected, full = sel.length === k, beats = full && E.setBeats(sel, best, g.trump);
        const mateWins = bestPlay.seat % 2 === r.myTeam;
        if (!can) o.hint = (mateWins ? 'Sherigingiz olmoqda. ' : 'Ura olmaysiz. ') + k + ' ta kartani yopiq bering';
        else if (!full) o.hint = k + ' ta karta tanlang: urish yoki yopiq berish' + (mateWins ? ' (sherigingiz olmoqda)' : '');
        else if (!beats) o.hint = 'Bu kartalar ura olmaydi';
        o.btns.push({ act: 'discard', label: 'Yopiq berish', kind: 'secondary', disabled: !full });
        o.btns.push({ act: 'beat', label: 'Urish', kind: 'primary', disabled: !beats });
        return o;
      }
      o.hint = esc(seatName(r, g.turn)) + ' javob bermoqda…';
      return o;
    }
    if (g.phase === 'trickEnd' && g.trick) o.hint = g.trick.winner === me ? 'Kartalar sizniki!' : esc(seatName(r, g.trick.winner)) + ' oladi';
    return o;
  }

  function actionsHTML(r) {
    const a = actionsFor(r);
    return '<div class="actions"><p class="hint">' + a.hint + '</p>' + (a.btns.length ? '<div class="btns">' +
      a.btns.map(function (b) { return btn(b.act, b.label, b.kind, b.disabled || S.busy); }).join('') + '</div>' : '') + '</div>';
  }

  // ---------- ovozli chat ----------
  function onVoice(kind) { if (kind === 'talk') paintTalk(); else paintVoice(); }

  function voiceAt(seat) {
    const list = VC.state.roster;
    for (let i = 0; i < list.length; i++) if (list[i].seat === seat) return list[i];
    return null;
  }

  function micView() {
    const v = VC.state, n = v.roster.length;
    if (v.status === 'off') return { cls: 's-off', icon: 'i-mic', badge: n, label: n ? 'Ovozli chatga qoʻshilish: ' + n + ' kishi gaplashyapti' : 'Ovozli chatni yoqish' };
    if (v.status === 'joining') return { cls: 's-join', icon: 'i-mic', badge: 0, label: v.offline ? 'Ovozli chat qayta ulanmoqda' : 'Ovozli chat ulanmoqda. Bekor qilish' };
    if (v.mic === 'none') return { cls: 's-listen', icon: 'i-head', badge: 0, label: 'Siz faqat eshityapsiz. Mikrofonni yoqish' };
    if (v.mic === 'muted') return { cls: 's-mute', icon: 'i-mic-off', badge: 0, label: 'Mikrofon oʻchiq. Yoqish' };
    return { cls: 's-on', icon: 'i-mic', badge: 0, label: 'Mikrofon yoqiq. Oʻchirish' };
  }
  function micClass(size, mv) {
    const v = VC.state;
    return 'mic' + (size ? ' ' + size : '') + ' ' + mv.cls + (mv.badge ? ' has' : '') + (v.status === 'live' && v.talking.has(v.me) ? ' talk' : '');
  }
  function micInner(mv) { return iconSvg(mv.icon) + (mv.badge ? '<b class="vn">' + mv.badge + '</b>' : ''); }
  function micHTML(size) {
    if (!VC) return '';
    const mv = micView();
    return '<button type="button" class="' + micClass(size, mv) + '" data-size="' + (size || '') + '" data-act="voice" aria-label="' + esc(mv.label) + '">' + micInner(mv) + '</button>';
  }

  function nameList(a) {
    if (a.length <= 2) return a.join(' va ');
    return a.slice(0, 2).join(', ') + ' va yana ' + (a.length - 2) + ' kishi';
  }
  function voiceTextHTML() {
    const v = VC.state;
    const others = v.roster.filter(function (e) { return e.v !== v.me; }).map(function (e) { return e.name; });
    let title, sub;
    if (v.status === 'off') {
      title = 'Ovozli chat';
      sub = others.length ? nameList(others) + ' gaplashyapti — qoʻshiling' : 'Stoldagilar bilan ovozli gaplashing';
    } else if (v.status === 'joining') {
      title = v.offline ? 'Qayta ulanmoqda…' : 'Ulanmoqda…';
      sub = v.offline ? 'Aloqa tiklanishini kutyapmiz' : 'Mikrofonga ruxsat bering';
    } else {
      title = v.mic === 'none' ? 'Siz faqat eshityapsiz' : v.mic === 'muted' ? 'Mikrofoningiz oʻchiq' : 'Siz ovozli chatdasiz';
      sub = others.length ? nameList(others) + ' ham shu yerda' : 'Hozircha faqat siz';
    }
    return '<span><b>' + title + '</b><small>' + esc(sub) + '</small></span>' +
      (v.status !== 'off' ? '<button type="button" class="mini-btn" data-act="voice-leave">Chiqish</button>' : '');
  }

  function voiceRole(e) {
    const r = S.room;
    if (e.seat < 0) return 'tomoshabin';
    if (!r || r.myTeam < 0) return duel(r) ? (e.seat + 1) + '-oʻyinchi' : (e.seat % 2 + 1) + '-jamoa';
    return e.seat % 2 === r.myTeam ? 'sherigingiz' : 'raqib';
  }
  // Stolda oʻtirgan, lekin ovozli chatga qoʻshilmagan odamlar (ularni eshitmaysiz — ular ham sizni)
  function voiceAway() {
    const r = S.room, v = VC.state, list = [];
    if (!r) return list;
    r.seats.forEach(function (s, i) {
      if (!s || s.bot || s.auto || s.you) return;
      if (!v.roster.some(function (e) { return e.seat === i; })) list.push({ seat: i, name: s.name, online: s.online });
    });
    return list;
  }

  function voicePanelHTML() {
    const v = VC.state;
    let h = '';
    const away = voiceAway();
    if (v.roster.length || away.length) {
      h += '<ul class="vlist">' + v.roster.map(function (e) {
        const me = e.v === v.me;
        let note = e.mic === false ? 'faqat eshitadi' : e.muted ? 'mikrofon oʻchiq' : 'mikrofon yoqiq';
        if (!me && v.status === 'live') {
          const st = VC.peerState(e.v);
          if (st === 'ok') note += ' · toʻgʻridan-toʻgʻri';
          else if (st === 'fwd') note += ' · server orqali';
          else if (st === 'fail') note = 'ulanib boʻlmadi';
          else note = 'ulanmoqda…';
        }
        const off = v.silenced.has(e.v);
        return '<li class="vrow' + (v.talking.has(e.v) ? ' talk' : '') + '" data-vrow="' + esc(e.v) + '"><i class="vdot"></i>' +
          '<span class="vname"><b>' + esc(me ? 'Siz' : e.name) + '</b><small>' + (me ? '' : voiceRole(e) + ' · ') + note + '</small></span>' +
          (!me && v.status === 'live'
            ? '<button type="button" class="vbtn' + (off ? ' off' : '') + '" data-act="vsilence" data-v="' + esc(e.v) + '" aria-pressed="' + off + '" aria-label="' +
              esc(e.name) + (off ? ': ovozini yoqish' : ': ovozini oʻchirish') + '">' + iconSvg(off ? 'i-vol-off' : 'i-vol') + '</button>'
            : '') + '</li>';
      }).join('') + away.map(function (a) {
        return '<li class="vrow away"><i class="vdot"></i><span class="vname"><b>' + esc(a.name) + '</b><small>' +
          voiceRole({ seat: a.seat }) + ' · ' + (a.online ? 'ovozli chatga qoʻshilmagan' : 'oflayn') + '</small></span></li>';
      }).join('') + '</ul>';
    } else {
      h += '<p class="sub">Hozircha hech kim yoʻq.</p>';
    }
    h += '<div class="btns">';
    if (v.status === 'off') h += btn('voice', 'Qoʻshilish', 'primary');
    else {
      if (v.status === 'live') h += btn('voice', v.mic === 'on' ? 'Mikrofonni oʻchirish' : 'Mikrofonni yoqish', 'secondary');
      h += btn('voice-leave', 'Chiqish', 'danger');
    }
    return h + '</div>';
  }

  // Tez-tez chaqiriladi: faqat oʻzgargan joylar yangilanadi
  function setHTML(el, html) { if (el.__h !== html) { el.__h = html; el.innerHTML = html; } }
  function paintVoice() {
    if (!VC) return;
    const v = VC.state, mv = micView();
    app.querySelectorAll('.mic[data-act="voice"]').forEach(function (b) {
      const cls = micClass(b.getAttribute('data-size'), mv);
      if (b.className !== cls) b.className = cls;
      b.setAttribute('aria-label', mv.label);
      setHTML(b, micInner(mv));
    });
    app.querySelectorAll('[data-vs]').forEach(function (el) {
      const e = voiceAt(Number(el.getAttribute('data-vs')));
      el.classList.toggle('v-in', !!e);
      el.classList.toggle('v-mute', !!e && (e.muted || e.mic === false));
      el.classList.toggle('v-talk', !!e && v.talking.has(e.v));
    });
    const t = app.querySelector('[data-vtext]');
    if (t) setHTML(t, voiceTextHTML());
    const p = app.querySelector('[data-vpanel]');
    if (p) setHTML(p, voicePanelHTML());
    if (v.blocked && !S.voiceBlocked) { S.voiceBlocked = true; toast('Ovozni eshitish uchun ekranga bir marta bosing'); }
    if (!v.blocked) S.voiceBlocked = false;
    noticeVoice();
  }

  // Men ovozli chatda boʻlmasam va kimdir qoʻshilsa — bir marta eslatamiz
  function noticeVoice() {
    const v = VC.state, rid = S.room ? S.room.id : '';
    if (!rid) return;
    const known = S.voiceKnownRoom === rid ? S.voiceKnown : new Set();
    const fresh = v.roster.filter(function (e) { return e.v !== v.me && !known.has(e.v) && e.mic !== false; });
    S.voiceKnownRoom = rid;
    S.voiceKnown = new Set(v.roster.map(function (e) { return e.v; }));
    if (fresh.length && v.status === 'off' && S.screen === 'room' && !S.sheet) {
      toast(nameList(fresh.map(function (e) { return e.name; })) + ' ovozli chatda — eshitish uchun 🎙 tugmasini bosing');
    }
  }
  function paintTalk() {
    if (!VC) return;
    const v = VC.state, meTalk = v.status === 'live' && v.talking.has(v.me);
    app.querySelectorAll('.mic[data-act="voice"]').forEach(function (b) { b.classList.toggle('talk', meTalk); });
    app.querySelectorAll('[data-vs]').forEach(function (el) {
      const e = voiceAt(Number(el.getAttribute('data-vs')));
      el.classList.toggle('v-talk', !!e && v.talking.has(e.v));
    });
    app.querySelectorAll('[data-vrow]').forEach(function (el) { el.classList.toggle('talk', v.talking.has(el.getAttribute('data-vrow'))); });
  }

  // ---------- pastdan chiquvchi oynalar ----------
  function openSheet(type) { S.sheet = { type: type }; S.sheetAnim = true; render(); }

  function sheetHTML() {
    if (!S.sheet) return '';
    let body = '';
    const r = S.room;
    switch (S.sheet.type) {
      case 'rules': body = rulesHTML(); break;
      case 'menu': body = r ? menuHTML(r) : ''; break;
      case 'leave': body = '<h2>Stoldan turasizmi?</h2><p>Oʻrningiz boʻshaydi, siz kuzatuvchi boʻlib qolasiz. Oʻyin toʻxtaydi — boʻsh joyga boshqa kishi oʻtirishi yoki bot qoʻshilishi kerak. Stolda hech kim qolmasa, stol yopiladi.</p>' +
        '<div class="btns">' + btn('close', 'Qolish', 'secondary') + btn('leave-yes', 'Turish', 'danger') + '</div>'; break;
      case 'seat': body = r ? seatSheetHTML(r, S.sheet.seat) : ''; break;
      case 'resume': body = r && r.resumeAsk ? '<h2>Oʻrin toʻldi</h2><p class="sub">Oʻyinni toʻxtagan joyidan davom ettirasizmi yoki yangidan (hisob 0:0) boshlaysizmi? Tanlamasangiz, ' +
        Math.round((r.resumeIn || 30000) / 1000) + ' soniyadan keyin oʻyin davom etadi.</p><div class="lobby-actions">' +
        btn('continue', 'Davom ettirish', 'primary') + btn('restart', 'Yangidan boshlash', 'secondary') + '</div>' : ''; break;
      case 'result': body = r && r.result ? resultHTML(r) : ''; break;
      case 'create': body = createHTML(); break;
      case 'stats': body = statsHTML(); break;
      case 'items': body = itemsHTML(); break;
    }
    if (!body) return '';
    return '<div class="sheet-wrap' + (S.sheetAnim && !reduceMotion ? ' anim' : '') + '" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true">' +
      '<button type="button" class="x" data-act="close" aria-label="Yopish">×</button>' + body + '</div></div>';
  }

  // Stoldagi oʻrinni bosganda: boʻsh — oʻtirish / bot / taklif; bot — chiqarish
  function seatSheetHTML(r, i) {
    if (!(i >= 0 && i < sizeOf(r))) return '';
    const s = r.seats[i];
    const role = seatRole(r, i, true);
    let h = '', b = '';
    if (!s) {
      h = '<h2>Boʻsh oʻrin</h2><p class="sub">' + role + (r.phase === 'playing' ? '. Oʻyin toʻxtagan — oʻrin toʻlgach davom etadi.' : '') + '</p>';
      if (r.mySeat < 0 || r.phase === 'lobby') b += btn('sit-here', r.mySeat < 0 ? 'Shu oʻringa oʻtirish' : 'Shu oʻringa oʻtish', r.mySeat < 0 ? 'primary' : 'secondary', S.busy, ' data-seat="' + i + '"');
      if (canManage(r)) b += btn('bot-here', iconSvg('i-bot') + 'Bot qoʻshish', r.mySeat < 0 ? 'secondary ico' : 'primary ico', S.busy, ' data-seat="' + i + '"');
      if (!DEMO) b += btn('invite-here', iconSvg('i-send') + 'Doʻstni taklif qilish', 'secondary ico', false, ' data-seat="' + i + '"');
    } else if (s.bot || s.auto) {
      h = '<h2>' + esc(s.name) + '</h2><p class="sub">' + role + ' · ' + (s.bot ? 'bot' : 'oʻrnida bot oʻynayapti') + '</p>';
      const can = s.bot ? canManage(r) : r.isHost && !s.online;
      if (can) b += btn('kick-here', 'Stoldan chiqarish', 'danger', S.busy, ' data-seat="' + i + '"');
      else h += '<p class="note">' + (r.mySeat < 0 ? 'Botni stolda oʻtirganlar chiqara oladi.' : 'Faqat stol egasi chiqara oladi.') + '</p>';
      if (r.phase === 'playing' && can) h += '<p class="note">Chiqarilsa, oʻyin toʻxtaydi — boʻsh joyga kimdir oʻtirishi yoki yangi bot qoʻshilishi kerak.</p>';
    } else if (r.isHost && !s.you) {
      h = '<h2>' + esc(s.name) + '</h2><p class="sub">' + role + (s.online ? '' : ' · oflayn') + '</p>' +
        '<p class="note">Chiqarilgan oʻyinchi mehmon (kuzatuvchi) boʻlib qoladi.' + (r.phase === 'playing' ? ' Oʻyin toʻxtaydi — boʻsh joyga kimdir oʻtirishi yoki bot qoʻshilishi kerak.' : '') + '</p>';
      b += btn('kick-here', 'Oʻyindan chiqarish', 'danger', S.busy, ' data-seat="' + i + '"');
    } else return '';
    return h + '<div class="lobby-actions">' + b + '</div>';
  }

  // Yangi stol: botsiz (doʻstlar bilan) yoki botlar bilan
  function choiceHTML(act, icon, title, text, cls) {
    return '<button type="button" class="choice' + (cls ? ' ' + cls : '') + '" data-act="' + act + '"' + (S.busy ? ' disabled' : '') + '>' +
      '<span class="ci">' + iconSvg(icon) + '</span><span class="ct"><b>' + title + '</b><small>' + text + '</small></span></button>';
  }
  function createHTML() {
    const n = S.newSize === 2 ? 2 : 4;
    const mode = function (v, t, sub) {
      return '<button type="button" class="mode' + (n === v ? ' on' : '') + '" data-act="newsize" data-n="' + v + '" aria-pressed="' + (n === v) + '"><b>' + t + '</b><small>' + sub + '</small></button>';
    };
    return '<h2>Yangi stol</h2><p class="sub">Oʻyin turi</p><div class="modes" role="group" aria-label="Oʻyin turi">' +
      mode(4, '4 kishi', '2×2 jamoa') + mode(2, '2 kishi', 'bir-biriga qarshi') + '</div>' +
      '<p class="sub">Kim bilan oʻynaysiz?</p><div class="choices">' +
      choiceHTML('new-friends', 'i-users', 'Doʻstlar bilan', n === 2 ? 'Stol botsiz ochiladi. Doʻstingizni taklif qiling yoki bot qoʻshing. Oʻyin 2 kishi toʻlganda boshlanadi.' : 'Stol botsiz ochiladi. Doʻstlaringizni taklif qiling, kerak boʻlsa — bot qoʻshing. Oʻyin 4 kishi toʻlganda boshlanadi.') +
      choiceHTML('new-bots', 'i-bot', 'Botlar bilan', 'Boʻsh oʻrinlarga botlar oʻtiradi — oʻyin darhol boshlanadi.', 'alt') + '</div>';
  }

  function teamsHTML(r, res) {
    let h = '<div class="teams">';
    const order = r.myTeam === 1 ? [1, 0] : [0, 1];
    order.forEach(function (t) {
      const win = res && res.team === t && res.type !== 'draw';
      h += '<div class="tcol' + (win ? ' win' : '') + '"><div class="tname">' + esc(teamName(r, t)) + '</div>' +
        (res ? '<div class="tpts">' + res.points[t] + '<small> ochko</small></div>' : '') +
        '<div class="tscore' + (r.score[t] >= r.edge ? ' edge' : '') + '">' + r.score[t] + ' <small>ball</small>' +
        (res && res.type !== 'draw' && t !== res.team ? ' <em>+' + res.award + '</em>' : '') + '</div><ul>';
      for (let i = t; i < sizeOf(r); i += 2) {
        const s = r.seats[i];
        if (duel(r) && r.myTeam < 0 && !res) continue; // nomi sarlavhada
        h += '<li>' + (s ? esc(s.name) + (s.you && s.name !== 'Siz' ? ' <small>siz</small>' : '') : '—') + (res ? '<span>' + res.totals[i] + '</span>' : '') + '</li>';
      }
      h += '</ul></div>';
    });
    return h + '</div>';
  }

  function menuHTML(r) {
    // Yuqorida — bosiladigan tugmalar; pastda — oʻyin haqidagi maʼlumot
    let h = '<div class="langrow">' + langHTML() + '</div>' + readyBarHTML(r) + '<div class="lobby-actions menu-top">';
    if (r.group) h += btn('tohall', 'Barcha stollar (zal)', 'secondary');
    if (r.mySeat >= 0 && !r.seats[r.mySeat].auto && r.phase !== 'lobby') h += btn('leave', 'Stoldan turish', 'danger');
    if (r.isHost && r.phase === 'roundEnd') h += btn('lobby', 'Lobbiga qaytish (yangi match)', 'secondary');
    if (!DEMO) h += btn('share', 'Doʻstlarni chaqirish', 'secondary');
    h += btn('rules', 'Qoidalar', 'secondary') + '</div>';
    h += '<button type="button" class="effbtn" data-act="stats"><span class="effico" aria-hidden="true">%</span><span><b>Oʻyinchilar samaradorligi</b><small>Hamma oʻyinchilarning oʻyin tahlili</small></span></button>';
    h += '<h2>Hisob</h2><p class="sub">' + (r.round ? r.round + '-raund. Raundda yutqazgan jamoaga ball yoziladi; ' + r.lose + ' ballga yetgan jamoa matchni boy beradi.' : 'Oʻyin hali boshlanmadi') + '</p>' + teamsHTML(r, null);
    const note = edgeNote(r);
    if (note) h += '<p class="match edge">' + note + '</p>';
    if (r.drawBonus) h += '<p class="match">Oldingi raund durang: bu raundda yutqazgan jamoaga yana +' + r.drawBonus + ' ball qoʻshiladi.</p>';
    if (r.matchWins[0] || r.matchWins[1]) h += '<p class="sub">Yutilgan matchlar: ' + r.matchWins[r.myTeam === 1 ? 1 : 0] + ' : ' + r.matchWins[r.myTeam === 1 ? 0 : 1] + '</p>';
    if (VC) {
      h += '<h3>Ovozli chat</h3><div data-vpanel>' + voicePanelHTML() + '</div>' +
        '<p class="vnote">Ovoz imkon boʻlsa toʻgʻridan-toʻgʻri, boʻlmasa server orqali uzatiladi va yozib olinmaydi. Bir-biringizni eshitish uchun hamma 🎙 tugmasini bosishi kerak. Bir xonada oʻtirgan boʻlsangiz, quloqchin taqing — aks holda ovoz qaytadi.</p>';
    }
    if (!DEMO) h += skinToggle();
    h += '<div class="lobby-actions">' + btn('close', 'Yopish', 'primary') + '</div>';
    return h;
  }

  // Oʻyinchilar samaradorligi (server tahlili)
  function statsHTML() {
    const d = S.stats;
    let h = '<h2>Oʻyinchilar samaradorligi</h2><p class="sub">Har bir yurish tahlil qilinadi. Samaradorlik = toʻgʻri yurishlar (50%) + olingan ochko (25%) + yutilgan raundlar (25%).</p>';
    if (!d) return h + '<p class="status">Yuklanmoqda…</p>';
    const row = function (u, i) {
      const lvl = u.eff >= 70 ? 'hi' : u.eff >= 50 ? 'mid' : 'lo';
      return '<li class="eff-row' + (d.me && d.me.id === u.id ? ' me' : '') + (u.ranked ? '' : ' new') + '">' +
        '<span class="eff-n">' + (u.ranked ? i + 1 : '·') + '</span>' +
        '<span class="eff-who"><b>' + esc(u.name) + (d.me && d.me.id === u.id ? ' <i>(siz)</i>' : '') + '</b>' +
        '<small>' + u.rounds + ' raund · toʻgʻri yurish ' + u.acc + '% · yutish ' + u.win + '% · oʻrtacha ' + u.avg + ' ochko</small>' +
        '<span class="eff-bar"><span class="' + lvl + '" style="width:' + u.eff + '%"></span></span></span>' +
        '<span class="eff-p ' + lvl + '">' + (u.ranked ? u.eff + '%' : '—') + '</span></li>';
    };
    if (d.me) h += '<div class="eff-me"><span>Sizning samaradorligingiz</span><b>' + (d.me.ranked ? d.me.eff + '%' : '—') + '</b>' +
      (d.me.ranked ? '' : '<small>Reytingga kirish uchun kamida ' + d.min + ' raund oʻynang</small>') + '</div>';
    if (!d.list.length) return h + '<p class="status">Hali statistika yoʻq — bir necha raund oʻynang.</p>';
    let n = 0;
    h += '<ol class="eff-list">' + d.list.map(function (u) { return row(u, u.ranked ? n++ : 0); }).join('') + '</ol>';
    h += '<p class="note">«—» — hali ' + d.min + ' raunddan kam oʻynagan. Botlar hisoblanmaydi.</p>';
    return h + '<div class="lobby-actions">' + (S.room ? btn('menu', 'Orqaga', 'secondary') : btn('close', 'Yopish', 'primary')) + '</div>';
  }

  // Yutqazgan jamoaga nega shuncha ball yozilgani
  function lossReason(res, we) {
    if (res.type === 'aces') return '';
    const base = res.base != null ? res.base : res.award;
    if (base === 6) return we ? 'birorta ham karta ololmadingiz' : 'birorta ham karta ololmadi';
    if (base === 4) return we ? '31 ochkoga yetmadingiz' : '31 ochkoga yetmadi';
    return we ? '31 va undan koʻp ochko oldingiz' : '31 va undan koʻp ochko oldi';
  }

  function resultHTML(r) {
    const res = r.result, mine = r.myTeam >= 0;
    let title, sub = '', cards = '', big = false;
    if (res.type === 'draw') {
      title = 'Durang';
      sub = '60:60 — hech kimga ball yozilmaydi. Keyingi raundda yutqazgan jamoaga yana +' + (res.nextBonus || 2) + ' ball qoʻshib yoziladi.';
    } else {
      const ours = mine && res.team === r.myTeam;
      const lost = 1 - res.team;
      const why = lossReason(res, mine && lost === r.myTeam);
      const pen = esc(teamTo(r, lost)) + ' +' + res.award + ' ball' + (res.bonus ? ' (' + res.base + ' + ' + res.bonus + ' durang uchun)' : '') + (why ? ' — ' + why : '') + '.';
      if (res.type === 'aces') {
        big = true;
        title = '4 ta tuz!';
        cards = '<div class="reveal">' + res.cards.map(function (c) { return cardHTML(c, { size: 'xs' }); }).join('') + '</div>';
        sub = (res.via === 'taken' ? esc(teamName(r, res.team)) + ' 4 ta tuzni yigʻib oldi — mutlaq gʻalaba. '
          : esc(seatName(r, res.seat)) + ' — ' + esc(teamName(r, res.team)).toLowerCase() + ' mutlaq yutdi. ') + pen;
      } else {
        title = !mine ? esc(teamName(r, res.team)) + (duel(r) ? ' yutdi' : ' yutdi') : ours ? 'Siz yutdingiz!' : duel(r) ? 'Raqib yutdi' : 'Raqiblar yutdi';
        sub = pen;
      }
    }
    let h = '<h2' + (big ? ' class="big"' : '') + '>' + title + '</h2><p class="sub">' + sub + '</p>' + cards + teamsHTML(r, res);
    if (res.matchOver) {
      const L = res.matchLoser, n = r.score[L];
      h += '<p class="match">' + (mine
        ? (L === r.myTeam ? (duel(r) ? 'Siz ' : 'Jamoangiz ') + n + ' ballga yetdi — match boy berildi. ' : (duel(r) ? 'Raqib ' : 'Raqiblar ') + n + ' ballga yetdi — match sizniki! ')
        : esc(teamName(r, L)) + ' ' + n + ' ballga yetdi — ' + esc(teamName(r, 1 - L)) + ' matchni yutdi. ') +
        'Keyingi raund yangi match boʻlib boshlanadi.</p>';
    } else {
      const note = edgeNote(r);
      if (note) h += '<p class="match edge">' + note + '</p>';
    }
    h += '<div class="btns">';
    const me = r.mySeat;
    if (r.isHost) h += btn('lobby', 'Lobbiga', 'secondary');
    if (me >= 0 && !r.seats[me].auto) h += btn('next', res.matchOver ? 'Yangi match' : 'Keyingi raund', 'primary');
    else if (me < 0 && r.seats.some(function (s) { return s && (s.bot || s.auto); })) h += btn('sit', 'Bot oʻrniga oʻtirish', 'primary');
    else h += btn('close', 'Yopish', 'secondary');
    return h + '</div>';
  }

  function rulesHTML() {
    const pts = ['AH', '10H', 'KH', 'QH', 'JH', '9H'];
    return '<h2>Bura qoidalari</h2><p class="sub">2×2 jamoa. Sherigingiz roʻparangizda oʻtiradi, ochkolar jamoaga qoʻshiladi.</p>' +
      '<h3>Kartalar va ochkolar</h3><div class="pointrow">' + pts.map(function (c) { return '<div>' + cardHTML(c, { size: 'xs' }) + E.points(c) + '</div>'; }).join('') + '</div>' +
      '<p>36 ta karta, jami 120 ochko. Kuch tartibi: T (tuz) › 10 › K › Q › J › 9 › 8 › 7 › 6. 10 korolni bosadi, korol 10 ni bosa olmaydi.</p>' +
      '<h3>Tarqatish va koʻzir</h3><ul class="rules">' +
      '<li>Har kimga 4 tadan karta. Bitta karta koʻzir qilib ochiladi, yana bittasi yopiq turadi.</li>' +
      '<li>Kolodadan avval oddiy kartalar, keyin ochiq koʻzir, eng oxirida yopiq karta olinadi. Yopiq kartani olgan oʻyinchi uni hammaga koʻrsatadi va koʻzir masti shu kartanikiga almashadi.</li>' +
      '<li>Birinchi yurish har raundda navbat bilan keyingi oʻyinchiga oʻtadi.</li></ul>' +
      '<h3>Yurish va urish</h3><ul class="rules">' +
      '<li>Yurish: 1 ta karta yoki bir xil mastdagi 2–4 ta karta. Qolganlar ham shuncha karta tashlaydi.</li>' +
      '<li>Stoldagi eng kuchli toʻplamning har bir kartasini urgan oʻyinchi oldinga chiqadi: oʻsha mastning kattaroq kartasi yoki koʻzir bilan.</li>' +
      '<li>Oddiy 10 ni faqat koʻzir bosadi. Koʻzirni faqat kattaroq koʻzir bosadi: koʻzir korol koʻzir 10 ni bosa olmaydi.</li>' +
      '<li>Ura olmasangiz yoki xohlamasangiz, kartalar yopiq beriladi. Sherigingiz olayotgan boʻlsa, unga ochkoli karta bering.</li>' +
      '<li>Eng kuchli toʻplam egasi hamma kartalarni oladi, birinchi boʻlib kolodadan oladi va yuradi.</li></ul>' +
      '<h3>Kombinatsiyalar</h3><ul class="rules">' +
      '<li><b>Bura</b> — qoʻldagi 4 kartaning hammasi koʻzir: navbatsiz yuradi.</li>' +
      '<li><b>4 ta tuz</b> — oʻyin davomida qoʻlida 4 ta tuz yigʻilgan oʻyinchining jamoasi mutlaq gʻolib (tarqatishda bitta oʻyinchiga 4 ta tuz tushmaydi): raqib jamoa hisobi 14 boʻladi va match tugaydi.</li></ul>' +
      '<h3>Hisob</h3><ul class="rules">' +
      '<li>Kartalar tugagach jamoa ochkolari sanaladi: 61 va undan koʻp — gʻalaba. 60:60 — durang: hech kimga ball yozilmaydi, keyingi raundda yutqazgan jamoaga yana +2 ball qoʻshiladi.</li>' +
      '<li>Yurish vaqti tugasa, qoʻlingizdagi chap tarafdagi kartalar avtomatik yuriladi.</li>' +
      '<li>Raundda yutqazgan jamoaga ball yoziladi: 31 va undan koʻp ochko olgan boʻlsa — 2, 31 dan kam — 4, birorta ham karta ololmagan boʻlsa — 6.</li>' +
      '<li>Ball qancha kam boʻlsa, shuncha yaxshi: 14 va undan koʻp ball toʻplagan jamoa matchni yutqazadi.</li>' +
      '<li>Aynan 12 ballda jamoaga shans beriladi — yana oʻynaydi. Yutsa, 12 da qoladi; yana yutqazsa, matchni boy beradi.</li>' +
      '<li>Har yurishga vaqt beriladi — tugasa, avtomatik yuriladi.</li></ul>' +
      '<div class="btns">' + btn('close', 'Tushunarli', 'primary') + '</div>';
  }

  // ---------- harakatlar ----------
  function tapCard(c) {
    const r = S.room, g = r && r.game;
    if (!g || !g.hand || r.phase !== 'playing') return;
    const i = S.selected.indexOf(c);
    if (i >= 0) S.selected.splice(i, 1);
    else if (g.phase === 'follow' && g.trick) {
      S.selected.push(c);
      while (S.selected.length > g.trick.k) S.selected.shift();
    } else if (S.selected.length && E.suitOf(S.selected[0]) !== E.suitOf(c)) {
      S.selected = [c];
    } else {
      S.selected.push(c);
      while (S.selected.length > 4) S.selected.shift();
    }
    haptic('select');
    S.glowOff = true;
    const handEl = app.querySelector('.hand');
    if (handEl) handEl.classList.remove('myturn');
    app.querySelectorAll('.hand .card').forEach(function (b) {
      const on = S.selected.indexOf(b.getAttribute('data-c')) >= 0;
      b.classList.toggle('sel', on);
      b.classList.remove('enter');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderActions();
  }

  function play(type) {
    if (!S.selected.length) return;
    send({ t: 'act', action: { type: type, cards: S.selected.slice() } }, true);
    haptic(type === 'beat' ? 'heavy' : 'light');
  }

  // Taklif havolasi: aniq oʻrin uchun stol raqamiga "s<oʻrin>" qoʻshiladi — doʻstingiz aynan oʻsha joyga oʻtiradi
  function inviteLink(seat) {
    const r = S.room, link = S.invite;
    if (!link || !r || !(seat >= 0 && seat < sizeOf(r))) return link;
    return link.slice(-r.id.length) === r.id ? link + 's' + seat : link;
  }
  function share(seat) {
    const r = S.room;
    const link = inviteLink(seat);
    if (!link) { toast('Havola hali tayyor emas'); return; }
    let text = 'Bura oʻynaymizmi? 🃏 Stolga qoʻshiling!';
    if (r && seat >= 0 && r.mySeat >= 0) {
      text = seat % 2 === r.mySeat % 2 ? 'Bura oʻynaymizmi? 🃏 Sherigim boʻling — joy sizni kutyapti!' : 'Bura oʻynaymizmi? 🃏 Raqib boʻlib oʻtiring — joy sizni kutyapti!';
    }
    haptic('light');
    if (window.BuraI18n) text = window.BuraI18n.t(text);
    const url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
    try { if (TG && TG.isVersionAtLeast('6.1')) { TG.openTelegramLink(url); return; } } catch (e) { /* */ }
    if (navigator.share) { navigator.share({ title: 'Bura', url: link }).catch(function () {}); return; }
    window.open(url, '_blank');
  }

  function handle(act, el) {
    const r = S.room;
    switch (act) {
      case 'card': return tapCard(el.getAttribute('data-c'));
      case 'lead': case 'beat': case 'discard': return play(act);
      case 'menu': return openSheet('menu');
      case 'rules': return openSheet('rules');
      case 'items': return openSheet('items');
      case 'setitem': send({ t: 'item', item: el.getAttribute('data-item') || null }); S.sheet = null; return render();
      case 'stats': S.stats = null; send({ t: 'stats' }); return openSheet('stats');
      case 'result': return openSheet('result');
      case 'close':
        if (S.sheet && S.sheet.type === 'result' && r) S.resultClosedFor = r.round;
        S.sheet = null;
        return render();
      case 'leave':
        if (r && r.phase !== 'lobby' && r.mySeat >= 0) return openSheet('leave');
        S.sheet = null;
        return send({ t: 'leave' });
      case 'leave-yes': S.sheet = null; render(); return send({ t: 'leave' });
      case 'seatmenu': S.sheet = { type: 'seat', seat: Number(el.getAttribute('data-seat')) }; S.sheetAnim = true; return render();
      case 'sit-here': case 'bot-here': case 'kick-here': {
        const seat = Number(el.getAttribute('data-seat'));
        S.sheet = null; render();
        return send({ t: act === 'sit-here' ? 'sit' : act === 'bot-here' ? 'addBot' : 'kick', seat: seat }, true);
      }
      case 'invite-here': S.sheet = null; render(); return share(Number(el.getAttribute('data-seat')));
      case 'continue': case 'restart': S.sheet = null; render(); return send({ t: 'resume', mode: act }, true);
      case 'share': return share(-1);
      case 'start': return send({ t: 'start' }, true);
      case 'addBot': return send({ t: 'addBot', seat: el && el.hasAttribute('data-seat') ? Number(el.getAttribute('data-seat')) : undefined });
      case 'fillBots': return send({ t: 'fillBots' }, true);
      case 'kick': return send({ t: 'kick', seat: Number(el.getAttribute('data-seat')) });
      case 'sit': case 'return': S.sheet = null; return send({ t: 'sit', seat: el && el.hasAttribute('data-seat') ? Number(el.getAttribute('data-seat')) : undefined });
      case 'next': S.sheet = null; return send({ t: 'next' }, true);
      case 'lobby': S.sheet = null; return send({ t: 'lobby' }, true);
      case 'create': case 'hnew': return openSheet('create');
      case 'new-friends': case 'new-bots':
        S.sheet = null;
        render();
        return send({ t: 'create', bots: act === 'new-bots', size: S.newSize === 2 ? 2 : 4 }, true);
      case 'newsize':
        S.newSize = Number(el.getAttribute('data-n')) === 2 ? 2 : 4;
        try { localStorage.setItem('bura.size', String(S.newSize)); } catch (e) { /* */ }
        return render();
      case 'invite': return share(Number(el.getAttribute('data-seat')));
      case 'ready': return send({ t: 'ready' }, true);
      case 'lang':
        if (window.BuraI18n) { window.BuraI18n.set(el.getAttribute('data-l')); render(); }
        return;
      case 'watchers': {
        const w = (S.room && S.room.watchers) || [];
        if (w.length) toast('Kuzatmoqda: ' + nameList(w.map(function (x) { return x.you ? 'siz' : x.name; })));
        return;
      }
      // guruh zali
      case 'tohall': S.sheet = null; return send({ t: 'hall' }, true);
      case 'henter': return send({ t: 'join', room: el.getAttribute('data-room') }, true);
      case 'hsit': {
        const seat = el.hasAttribute('data-seat') ? Number(el.getAttribute('data-seat')) : -1;
        haptic('light');
        return send(seat >= 0 ? { t: 'join', room: el.getAttribute('data-room'), seat: seat } : { t: 'join', room: el.getAttribute('data-room') }, true);
      }
      case 'voice': if (VC) VC.toggleMic(); return;
      case 'voice-leave': if (VC) VC.leave(); return;
      case 'vsilence': if (VC) VC.silence(el.getAttribute('data-v')); return;
    }
  }

  app.addEventListener('click', function (e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const act = t.getAttribute('data-act');
    if (act === 'backdrop') {
      if (e.target !== t) return; // oynaning ichi bosilgan
      return handle('close', t);
    }
    if (act === 'helper') return; // change hodisasida
    handle(act, t);
  });
  app.addEventListener('change', function (e) {
    const t = e.target;
    if (t.matches && t.matches('input[data-act="helper"]')) send({ t: 'setting', key: 'helper', value: t.checked });
    if (t.matches && t.matches('input[data-act="skin"]')) { setSkin(t.checked); render(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.sheet) handle('close', null);
  });
  // Brauzer ovozni toʻsib qoʻysa, istalgan bosish uni ochadi
  if (VC) {
    const unlockVoice = function () { if (VC.state.blocked) VC.unlock(); };
    document.addEventListener('click', unlockVoice, true);
    document.addEventListener('touchend', unlockVoice, true);
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(S.toastT);
    S.toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  // Navbat taymeri
  function tick() {
    const r = S.room;
    if (r && r.phase === 'lobby' && S.readyAt) {
      const sec = Math.max(0, Math.ceil((S.readyAt - Date.now()) / 1000));
      app.querySelectorAll('[data-readyleft]').forEach(function (el) { if (el.textContent !== String(sec)) el.textContent = sec; });
    }
    if (!r || r.phase !== 'playing') return;
    const left = S.deadlineAt ? Math.max(0, S.deadlineAt - Date.now()) : 0;
    const p = S.deadlineAt && S.deadlineTotal ? left / S.deadlineTotal : 1;
    app.querySelectorAll('.ring, .mytimer i').forEach(function (el) { el.style.setProperty('--p', p.toFixed(3)); });
    const mt = app.querySelector('.mytimer');
    if (mt) mt.classList.toggle('urgent', S.deadlineAt > 0 && left < 6000);
  }
  setInterval(tick, 250);

  // Sinov uchun (faqat ?dev=1 yoki demo rejimida)
  if (qs.get('dev') || DEMO) window.__bura = { S: S, send: send, voice: VC, drop: function () { if (T && T.drop) T.drop(); } };

  // ---------- ishga tushirish ----------
  // Har qanday bosish ovoz chalishga ruxsat beradi (avtomatik eshitish uchun)
  document.addEventListener('pointerdown', function () { if (VC) VC.unlock(); }, true);
  initTelegram();
  if (window.BuraI18n) window.BuraI18n.start(); // rus tili tanlangan boʻlsa — ekran matnlari tarjima qilinadi
  render();
  if (DEMO) connectLocal(); else connectWS();
})();
