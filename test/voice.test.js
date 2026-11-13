'use strict';
/* Ovozli chat: server tomoni (roʻyxat, signal uzatish, cheklovlar) va ICE sozlamalari. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');
const { Hub, cleanSignal, VOICE_MAX } = require('../src/hub');
const { parseIceServers, hasTurn, DEFAULT_STUN } = require('../src/ice');

const ICE = [{ urls: ['stun:stun.example.org:3478'] }];
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n';

function startHub() {
  const server = http.createServer();
  const hub = new Hub({ devMode: true, turnSeconds: 30, iceServers: ICE });
  hub.attach(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      hub, port: server.address().port,
      stop: () => new Promise((r) => { for (const w of hub.wss.clients) w.terminate(); hub.close(); server.close(r); })
    }));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function client(port, uid, name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const c = { ws, uid, name, msgs: [], room: null };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      c.msgs.push(m);
      if (m.t === 'state') c.room = m.room;
    });
    c.send = (o) => ws.send(JSON.stringify(o));
    // shartga mos keladigan xabarni kutish (from — shu indeksdan keyingi xabarlar)
    c.next = async (pred, label, from) => {
      const start = from == null ? 0 : from;
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        for (let i = start; i < c.msgs.length; i++) if (pred(c.msgs[i])) return c.msgs[i];
        await wait(15);
      }
      throw new Error('kutish tugadi: ' + label + ' (' + name + ')');
    };
    c.mark = () => c.msgs.length;
    c.lastVoice = () => {
      for (let i = c.msgs.length - 1; i >= 0; i--) {
        const m = c.msgs[i];
        if (m.t === 'voice') return m;
        if (m.t === 'state' && m.voice) return m.voice;
      }
      return null;
    };
    ws.on('open', () => resolve(c));
  });
}

async function hello(c, room) {
  const at = c.mark();
  c.send({ t: 'hello', dev: { id: c.uid, name: c.name }, room: room });
  await c.next((m) => m.t === (room ? 'state' : 'hall'), 'hello', at);
}

async function table(port, n) {
  const A = await client(port, '1', 'Ali');
  await hello(A, null);
  A.send({ t: 'create' });
  await A.next((m) => m.t === 'state', 'stol');
  const list = [A];
  const names = ['Vali', 'Gʻani', 'Sobir', 'Doni', 'Eldor', 'Farrux', 'Jasur'];
  for (let i = 1; i < n; i++) {
    const c = await client(port, String(i + 1), names[i - 1]);
    await hello(c, A.room.id);
    list.push(c);
  }
  return list;
}

test('ovoz: qoʻshilish, roʻyxat, signal uzatish va chiqish', { timeout: 20000 }, async () => {
  const srv = await startHub();
  try {
    const [A, B, C] = await table(srv.port, 3);

    let at = A.mark();
    A.send({ t: 'voice_join', mic: true });
    const cfg = await A.next((m) => m.t === 'voice_cfg', 'voice_cfg', at);
    assert.deepEqual(cfg.ice, ICE);
    assert.equal(cfg.relay, false);
    assert.equal(cfg.max, VOICE_MAX);
    const va = await A.next((m) => m.t === 'voice' && m.me, 'A roʻyxati', at);
    assert.equal(va.roster.length, 1);
    assert.deepEqual(va.roster[0], { v: va.me, seat: 0, name: 'Ali', muted: false, mic: true });
    const aVid = va.me;
    const vb0 = await B.next((m) => m.t === 'voice' && m.roster.length === 1, 'B koʻradi');
    assert.equal(vb0.me, null, 'qoʻshilmagan kishi uchun me = null');

    at = B.mark();
    B.send({ t: 'voice_join', mic: false, muted: true });
    const vb = await B.next((m) => m.t === 'voice' && m.me, 'B qoʻshildi', at);
    assert.equal(vb.roster.length, 2);
    assert.deepEqual(vb.roster.map((e) => e.seat), [0, 1], 'qoʻshilish tartibida');
    assert.equal(vb.roster[1].mic, false);
    assert.equal(vb.roster[1].muted, false, 'mikrofonsiz kishi "oʻchiq" hisoblanmaydi');
    const bVid = vb.me;
    assert.notEqual(aVid, bVid);

    // Taklif faqat kerakli maydonlar bilan uzatiladi
    at = B.mark();
    A.send({ t: 'rtc', to: bVid, data: { type: 'offer', sid: 'abc123', sdp: SDP, extra: 'x' } });
    const off = await B.next((m) => m.t === 'rtc', 'offer', at);
    assert.equal(off.from, aVid);
    assert.deepEqual(off.data, { type: 'offer', sid: 'abc123', sdp: SDP });

    // Nomzodlar: notoʻgʻrisi tashlab yuboriladi
    at = A.mark();
    B.send({ t: 'rtc', to: aVid, data: { type: 'cand', sid: 'abc123', c: [
      { candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host', sdpMid: '0', sdpMLineIndex: 0, junk: 1 },
      { candidate: 'candidate:2 1 udp 1 192.0.2.2 1 typ host' }
    ] } });
    const cand = await A.next((m) => m.t === 'rtc', 'cand', at);
    assert.equal(cand.from, bVid);
    assert.deepEqual(cand.data.c, [{ candidate: 'candidate:1 1 udp 2122260223 192.0.2.1 54400 typ host', sdpMid: '0', sdpMLineIndex: 0 }]);

    // Notoʻgʻri yoki begona signal hech kimga yetmaydi
    const atA = A.mark(), atB = B.mark(), atC = C.mark();
    A.send({ t: 'rtc', to: bVid, data: { type: 'offer', sid: 'bad sid!', sdp: SDP } });
    A.send({ t: 'rtc', to: bVid, data: { type: 'offer', sid: 'x1', sdp: 'salom' } });
    A.send({ t: 'rtc', to: bVid, data: { type: 'bye', sid: 'x1' } });
    C.send({ t: 'rtc', to: aVid, data: { type: 'offer', sid: 'x2', sdp: SDP } }); // C ovozli chatda emas
    A.send({ t: 'rtc', to: 'nobody', data: { type: 'offer', sid: 'x3', sdp: SDP } });
    await wait(250);
    assert.ok(!A.msgs.slice(atA).some((m) => m.t === 'rtc' || m.t === 'error'));
    assert.ok(!B.msgs.slice(atB).some((m) => m.t === 'rtc'));
    assert.ok(!C.msgs.slice(atC).some((m) => m.t === 'rtc' || m.t === 'error'));

    // Ovozli chatdan chiqqan kishiga signal yetmaydi
    at = C.mark();
    C.send({ t: 'voice_join', mic: true });
    const cVid = (await C.next((m) => m.t === 'voice' && m.me, 'C qoʻshildi', at)).me;
    C.send({ t: 'voice_leave' });
    await C.next((m) => m.t === 'voice' && !m.me && m.roster.length === 2, 'C chiqdi', at);
    const atC2 = C.mark();
    A.send({ t: 'rtc', to: cVid, data: { type: 'offer', sid: 'x4', sdp: SDP } });
    await wait(200);
    assert.ok(!C.msgs.slice(atC2).some((m) => m.t === 'rtc'));

    // Mikrofon oʻchirildi
    at = C.mark();
    A.send({ t: 'voice_set', muted: true });
    const vm = await C.next((m) => m.t === 'voice' && m.roster[0] && m.roster[0].muted, 'muted', at);
    assert.equal(vm.roster[0].v, aVid);
    // Mikrofonsiz kishi "muted" boʻla olmaydi
    at = C.mark();
    B.send({ t: 'voice_set', muted: true });
    const vm2 = await C.next((m) => m.t === 'voice', 'B muted', at);
    assert.equal(vm2.roster[1].muted, false);

    // Oʻrindan turgan kishi roʻyxatda tomoshabin (-1) boʻlib qoladi
    at = C.mark();
    B.send({ t: 'leave' });
    const sl = await C.next((m) => m.t === 'state' && m.voice.roster.length === 2 && m.voice.roster[1].seat === -1, 'tomoshabin', at);
    assert.equal(sl.voice.roster[1].v, bVid);

    // Yangi kelgan kishi holat xabarida roʻyxatni oladi
    const D = await client(srv.port, '4', 'Sobir');
    await hello(D, A.room.id);
    const sd = D.msgs.filter((m) => m.t === 'state').pop();
    assert.equal(sd.voice.me, null);
    assert.deepEqual(sd.voice.roster.map((e) => e.v), [aVid, bVid]);
    assert.deepEqual(sd.voice.roster.map((e) => e.seat), [0, -1]);
    assert.equal(sd.room.mySeat, 1, 'D boʻshagan oʻringa oʻtirdi');

    // A uzildi — qolganlar roʻyxatdan oʻchganini koʻradi
    at = B.mark();
    A.ws.close();
    const vg = await B.next((m) => (m.t === 'voice' || (m.t === 'state' && m.voice)) && (m.roster || m.voice.roster).length === 1, 'A chiqdi', at);
    assert.equal((vg.roster || vg.voice.roster)[0].v, bVid);

    at = D.mark();
    B.send({ t: 'voice_leave' });
    const ve = await D.next((m) => m.t === 'voice' && m.roster.length === 0, 'boʻsh', at);
    assert.equal(ve.me, null);
    [B, C, D].forEach((c) => c.ws.close());
  } finally {
    await srv.stop();
  }
});

test('ovoz: ikkinchi qurilma, 6 kishilik chegara, stolsiz qoʻshilish', { timeout: 20000 }, async () => {
  const srv = await startHub();
  try {
    const list = await table(srv.port, VOICE_MAX + 1);
    const A = list[0];

    // Xuddi shu foydalanuvchi ikkinchi qurilmadan
    const A2 = await client(srv.port, '1', 'Ali');
    await hello(A2, A.room.id);
    A.send({ t: 'voice_join', mic: true });
    await A.next((m) => m.t === 'voice' && m.me, 'A1');
    let at = A.mark();
    A2.send({ t: 'voice_join', mic: true });
    const end = await A.next((m) => m.t === 'voice_end', 'elsewhere', at);
    assert.equal(end.reason, 'elsewhere');
    const v2 = await A2.next((m) => m.t === 'voice' && m.me, 'A2');
    assert.equal(v2.roster.length, 1);
    assert.equal(v2.roster[0].v, v2.me);

    // Chegara: A2 + yana 5 kishi = 6, yettinchisi sigʻmaydi
    for (let i = 1; i < VOICE_MAX; i++) {
      list[i].send({ t: 'voice_join', mic: true });
      await list[i].next((m) => m.t === 'voice' && m.me, 'qoʻshildi ' + i);
    }
    const last = list[VOICE_MAX];
    at = last.mark();
    last.send({ t: 'voice_join', mic: true });
    const full = await last.next((m) => m.t === 'voice_end', 'full', at);
    assert.equal(full.reason, 'full');
    assert.equal(last.lastVoice().roster.length, VOICE_MAX);
    // Kimdir chiqsa, joy ochiladi
    list[1].send({ t: 'voice_leave' });
    await last.next((m) => m.t === 'voice' && m.roster.length === VOICE_MAX - 1, 'joy ochildi');
    at = last.mark();
    last.send({ t: 'voice_join', mic: true });
    await last.next((m) => m.t === 'voice' && m.me, 'endi sigʻdi', at);

    // Stolsiz
    const X = await client(srv.port, '99', 'Yolgʻiz');
    await hello(X, null);
    at = X.mark();
    X.send({ t: 'voice_join' });
    X.send({ t: 'rtc', to: 'abc', data: { type: 'offer', sid: 'a', sdp: SDP } });
    X.send({ t: 'voice_set', muted: true });
    const nr = await X.next((m) => m.t === 'voice_end', 'noroom', at);
    assert.equal(nr.reason, 'noroom');
    await wait(150);
    assert.ok(!X.msgs.slice(at).some((m) => m.t === 'error'), 'ovoz xabarlari uchun xato chiqmaydi');

    list.concat([A2, X]).forEach((c) => c.ws.close());
  } finally {
    await srv.stop();
  }
});

test('ovoz: signal xabarini tozalash', () => {
  assert.equal(cleanSignal(null), null);
  assert.equal(cleanSignal({ type: 'offer', sdp: SDP }), null, 'sid kerak');
  assert.equal(cleanSignal({ type: 'offer', sid: 'a', sdp: 'v=0\r\n' + 'x'.repeat(20001) }), null, 'juda katta');
  assert.equal(cleanSignal({ type: 'cand', sid: 'a', c: new Array(41).fill({ candidate: 'c', sdpMid: '0' }) }), null);
  assert.equal(cleanSignal({ type: 'cand', sid: 'a', c: [{ candidate: 'c' }] }), null, 'sdpMid ham, sdpMLineIndex ham yoʻq');
  assert.deepEqual(cleanSignal({ type: 'answer', sid: 'Zz9', sdp: SDP, to: 'x' }), { type: 'answer', sid: 'Zz9', sdp: SDP });
  assert.deepEqual(cleanSignal({ type: 'cand', sid: 'a', c: [{ candidate: 'c', sdpMLineIndex: 0, usernameFragment: 'u' }] }),
    { type: 'cand', sid: 'a', c: [{ candidate: 'c', sdpMLineIndex: 0, usernameFragment: 'u' }] });
});

test('ICE sozlamalari: STUN, TURN va JSON', () => {
  const warns = [];
  const w = (m) => warns.push(m);

  assert.deepEqual(parseIceServers({}), [{ urls: DEFAULT_STUN }]);
  assert.deepEqual(parseIceServers({ STUN_URLS: '' }), [], 'boʻsh qiymat STUN ni oʻchiradi');

  // TURN parolsiz boʻlsa, brauzer xato beradi — tashlab yuboriladi
  assert.deepEqual(parseIceServers({ TURN_URLS: 'turn:t.example.com:3478' }, w), [{ urls: DEFAULT_STUN }]);
  assert.equal(warns.length, 1);

  const t = parseIceServers({
    STUN_URLS: 'stun:a.example.com:3478',
    TURN_URLS: 'turn:t.example.com:80, turn:t.example.com:443?transport=tcp,turns:t.example.com:443?transport=tcp, http://yomon',
    TURN_USERNAME: 'user', TURN_CREDENTIAL: 'pass'
  });
  assert.deepEqual(t, [
    { urls: ['stun:a.example.com:3478'] },
    { urls: ['turn:t.example.com:80', 'turn:t.example.com:443?transport=tcp', 'turns:t.example.com:443?transport=tcp'], username: 'user', credential: 'pass' }
  ]);
  assert.equal(hasTurn(t), true);
  assert.equal(hasTurn(parseIceServers({})), false);

  // Metered sahifasidan koʻchirilgan massiv
  const json = JSON.stringify([
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username: 'u1', credential: 'c1' },
    { urls: 'turn:global.relay.metered.ca:443', username: 'u1' },
    { urls: 'javascript:alert(1)' },
    'salom'
  ]);
  warns.length = 0;
  assert.deepEqual(parseIceServers({ ICE_SERVERS: json }, w), [
    { urls: ['stun:stun.relay.metered.ca:80'] },
    { urls: ['turn:global.relay.metered.ca:80'], username: 'u1', credential: 'c1' }
  ]);
  assert.equal(warns.length, 1);
  assert.deepEqual(parseIceServers({ ICE_SERVERS: JSON.stringify({ iceServers: [{ urls: ['stun:x.example.com'] }] }) }), [{ urls: ['stun:x.example.com'] }]);

  // JSON buzuq — oddiy sozlamalarga qaytiladi
  warns.length = 0;
  assert.deepEqual(parseIceServers({ ICE_SERVERS: '[{urls:', STUN_URLS: 'stun:b.example.com' }, w), [{ urls: ['stun:b.example.com'] }]);
  assert.equal(warns.length, 1);
});
