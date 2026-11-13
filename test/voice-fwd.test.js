'use strict';
/* Server orqali ovoz: WebRTC ulanmagan juftliklar uchun kadrlarni uzatish, kodek, TURN kalitlari API orqali. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');
const { Hub, FWD_TAG } = require('../src/hub');
const A = require('../src/adpcm');
const { createTurn } = require('../src/turn');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startHub(cfg) {
  const server = http.createServer();
  const hub = new Hub(Object.assign({ devMode: true, turnSeconds: 30, iceServers: [{ urls: ['stun:stun.example.org:3478'] }] }, cfg));
  hub.attach(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      hub, port: server.address().port,
      stop: () => new Promise((r) => {
        for (const ws of hub.wss.clients) ws.terminate();
        hub.close(); server.close(r);
      })
    }));
  });
}

function client(port, uid, name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const c = { ws, uid, name, msgs: [], bins: [], room: null };
    ws.on('message', (raw, bin) => {
      if (bin) { c.bins.push(Buffer.from(raw)); return; }
      const m = JSON.parse(raw);
      c.msgs.push(m);
      if (m.t === 'state') c.room = m.room;
    });
    c.send = (o) => ws.send(JSON.stringify(o));
    c.bin = (u8) => ws.send(u8, { binary: true });
    c.next = async (pred, label) => {
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        for (let i = c.msgs.length - 1; i >= 0; i--) if (pred(c.msgs[i])) return c.msgs[i];
        await wait(15);
      }
      throw new Error('kutish tugadi: ' + label + ' (' + name + ')');
    };
    ws.on('open', () => resolve(c));
  });
}

// 4 kishi bitta stolda, hammasi ovozli chatda
async function voiceTable(port) {
  const list = [];
  const names = ['Ali', 'Vali', 'Gʻani', 'Sobir'];
  for (let i = 0; i < 4; i++) {
    const c = await client(port, 'u' + i, names[i]);
    c.send({ t: 'hello', dev: { id: c.uid, name: c.name }, room: i ? list[0].room.id : undefined });
    if (!i) { await c.next((m) => m.t === 'hall', 'home'); c.send({ t: 'create', bots: false }); }
    await c.next((m) => m.t === 'state', 'stol');
    list.push(c);
  }
  for (const c of list) c.send({ t: 'voice_join', mic: true, muted: false });
  for (const c of list) {
    const cfg = await c.next((m) => m.t === 'voice_cfg', 'voice_cfg');
    assert.equal(cfg.fwd, true);
  }
  await list[0].next((m) => m.t === 'voice' && m.roster.length === 4, 'roster 4');
  for (const c of list) c.vid = (await c.next((m) => m.t === 'voice' && m.me && m.roster.length === 4, 'me')).me;
  return list;
}

function frame(seq) {
  const pcm = new Float32Array(640);
  for (let k = 0; k < 640; k++) pcm[k] = 0.4 * Math.sin(2 * Math.PI * 440 * (seq * 640 + k) / 16000);
  const u8 = new Uint8Array(3 + A.HEAD + 320);
  u8[0] = FWD_TAG; u8[1] = seq & 255; u8[2] = seq >> 8;
  A.encode(pcm, { p: 0, i: 0 }, u8, 3);
  return u8;
}

test('kodek: ADPCM sifati, kadr holati, chastota oʻzgartirish', () => {
  const st = { p: 0, i: 0 };
  let sig = 0, err = 0;
  for (let f = 0; f < 30; f++) {
    const pcm = new Float32Array(640);
    for (let k = 0; k < 640; k++) { const t = (f * 640 + k) / 16000; pcm[k] = 0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.2 * Math.sin(2 * Math.PI * 1700 * t); }
    const u = A.encode(pcm, st);
    assert.equal(u.length, A.HEAD + 320);
    const d = A.decode(u, 0);
    assert.equal(d.length, 640);
    if (f > 1) for (let k = 0; k < 640; k++) { sig += pcm[k] * pcm[k]; err += (pcm[k] - d[k]) ** 2; }
  }
  assert.ok(10 * Math.log10(sig / err) > 25, 'SNR 25 dB dan yuqori');
  // Har kadr oʻz holatini olib yuradi: oʻrtadagi kadrni alohida ochsa ham toʻgʻri chiqadi
  const s2 = { p: 0, i: 0 };
  const frames = [];
  for (let f = 0; f < 3; f++) {
    const pcm = new Float32Array(640).fill(0.3 * (f + 1));
    frames.push({ pcm, u: A.encode(pcm, s2) });
  }
  const mid = A.decode(frames[2].u, 0);
  assert.ok(Math.abs(mid[600] - 0.9) < 0.02);
  // Chastota: 48 kHz → 16 kHz va 44,1 kHz → 16 kHz
  const x = new Float32Array(1920).fill(0.25);
  assert.equal(A.resample(x, 640).length, 640);
  assert.ok(Math.abs(A.resample(new Float32Array(1764).fill(-0.5), 640)[639] + 0.5) < 1e-6);
  assert.equal(A.resample(new Float32Array(640).fill(0.1), 1920).length, 1920);
  assert.equal(A.decode(new Uint8Array(3), 0).length, 0);
});

test('server orqali ovoz: faqat tanlanganlarga, yuboruvchi raqami bilan; mikrofon oʻchiq boʻlsa — yoʻq', { timeout: 20000 }, async () => {
  const h = await startHub();
  try {
    const [a, b, c, d] = await voiceTable(h.port);
    // A hali hech kimni tanlamagan — kadr hech kimga bormaydi
    a.bin(frame(0));
    await wait(150);
    assert.equal(b.bins.length + c.bins.length + d.bins.length, 0);

    // A: B va C bilan toʻgʻridan ulanmagan → ular server orqali eshitadi; D bilan toʻgʻridan
    a.send({ t: 'voice_fwd', to: [b.vid, c.vid, 'xyz', a.vid] });
    await wait(60);
    for (let i = 1; i <= 3; i++) a.bin(frame(i));
    await wait(200);
    assert.equal(b.bins.length, 3);
    assert.equal(c.bins.length, 3);
    assert.equal(d.bins.length, 0);
    const got = b.bins[0];
    assert.equal(got[0], FWD_TAG);
    assert.equal(got.subarray(1, 6).toString('hex'), a.vid);
    assert.equal(got[6] | (got[7] << 8), 1);
    const pcm = A.decode(new Uint8Array(got), 8);
    assert.equal(pcm.length, 640);
    assert.ok(A.rms(pcm) > 0.2);

    // Notoʻgʻri kadrlar tashlanadi: boshqa belgi, juda katta, juda kichik
    const bad = frame(9); bad[0] = 0x55;
    a.bin(bad);
    a.bin(new Uint8Array(2000).fill(FWD_TAG));
    a.bin(new Uint8Array([FWD_TAG, 1, 2]));
    await wait(150);
    assert.equal(b.bins.length, 3);

    // Mikrofon oʻchirildi — server ham uzatmaydi
    a.send({ t: 'voice_set', mic: true, muted: true });
    await wait(60);
    a.bin(frame(10));
    await wait(150);
    assert.equal(b.bins.length, 3);
    a.send({ t: 'voice_set', mic: true, muted: false });
    await wait(60);
    a.bin(frame(11));
    await b.next(() => b.bins.length === 4 || null, 'yana keldi').catch(() => {});
    await wait(100);
    assert.equal(b.bins.length, 4);
    assert.equal(c.bins.length, 4);

    // Ovozli chatdan chiqqan kishiga kadr bormaydi; chiqqan kishi ham yubora olmaydi
    c.send({ t: 'voice_leave' });
    await wait(80);
    a.bin(frame(12));
    await wait(150);
    assert.equal(c.bins.length, 4);
    assert.equal(b.bins.length, 5);
    c.bin(frame(13));
    await wait(100);
    assert.equal(a.bins.length, 0);

    // Tezlik cheklovi: bir zumda 200 ta kadr — koʻpi bilan ~40 tasi oʻtadi
    const before = b.bins.length;
    for (let i = 0; i < 200; i++) a.bin(frame(100 + i));
    await wait(300);
    const passed = b.bins.length - before;
    assert.ok(passed >= 20 && passed <= 55, 'oʻtgan kadrlar: ' + passed);
    for (const x of [a, b, c, d]) x.ws.close();
  } finally { await h.stop(); }
});

test('diagnostika: ulanish turlari Render logiga oʻrin raqami bilan yoziladi (ismsiz)', { timeout: 20000 }, async () => {
  const h = await startHub();
  const logs = [];
  const orig = console.log;
  console.log = (...x) => { logs.push(x.join(' ')); };
  try {
    const [a, b, c, d] = await voiceTable(h.port);
    a.send({ t: 'voice_stat', peers: [
      { v: b.vid, st: 'fwd', path: '' },
      { v: c.vid, st: 'ok', path: 'srflx/relay' },
      { v: d.vid, st: 'wait', path: '<script>' },
      { v: 'ffffffffff', st: 'ok' }
    ] });
    await wait(150);
    const line = logs.find((l) => l.indexOf('[ovoz] stol') === 0);
    assert.ok(line, 'log yozildi');
    assert.match(line, /1-oʻrin → 2-oʻrin: server orqali, 3-oʻrin: toʻgʻridan \(srflx\/relay\), 4-oʻrin: ulanmoqda$/);
    assert.doesNotMatch(line, /Ali|Vali|script/);
    // Oʻzgarmagan holat qayta yozilmaydi
    a.send({ t: 'voice_stat', peers: [{ v: b.vid, st: 'fwd' }, { v: c.vid, st: 'ok', path: 'srflx/relay' }, { v: d.vid, st: 'wait' }] });
    await wait(150);
    assert.equal(logs.filter((l) => l.indexOf('[ovoz] stol') === 0).length, 1);
    for (const x of [a, b, c, d]) x.ws.close();
  } finally {
    console.log = orig;
    await h.stop();
  }
});

test('TURN API: Cloudflare kalitlari olinadi, 53-port tashlanadi, token logga chiqmaydi', async () => {
  const calls = [];
  const logs = [];
  const turn = createTurn({ CF_TURN_KEY_ID: 'abcdef0123456789', CF_TURN_API_TOKEN: 'sekret-token-123' }, {
    log: (m) => logs.push(m),
    fetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 201, json: async () => ({ iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u1', credential: 'c1' }
      ] }) };
    }
  });
  assert.equal(turn.name, 'Cloudflare');
  assert.equal(turn.current(), null);
  const list = await turn.refresh();
  turn.stop();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://rtc.live.cloudflare.com/v1/turn/keys/abcdef0123456789/credentials/generate-ice-servers');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer sekret-token-123');
  assert.equal(JSON.parse(calls[0].init.body).ttl, 21600);
  assert.deepEqual(list[1].urls, ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp']);
  assert.deepEqual(turn.current(), list);
  assert.ok(logs.some((l) => /olindi/.test(l)));

  // Hub: ovozli chatga qoʻshilganda STUN + TURN roʻyxati beriladi
  const hub = new Hub({ iceServers: [{ urls: ['stun:stun.example.org:3478'] }], turn: turn });
  assert.equal(hub.iceFor().length, 3);
  assert.equal(new Hub({ iceServers: [] }).iceFor().length, 0);

  // Xato: token notoʻgʻri — logda token yoʻq, roʻyxat boʻsh qoladi
  const logs2 = [];
  const t2 = createTurn({ CF_TURN_KEY_ID: 'abcdef0123456789', CF_TURN_API_TOKEN: 'sekret-token-123' }, {
    log: (m) => logs2.push(m),
    fetch: async () => { throw new Error('ulanish uzildi: Bearer sekret-token-123'); }
  });
  assert.equal(await t2.refresh(), null);
  t2.stop();
  assert.equal(t2.current(), null);
  assert.ok(logs2.length && logs2.every((l) => l.indexOf('sekret-token-123') < 0), logs2.join(' | '));
});

test('TURN API: Metered manzili, muddat va notoʻgʻri sozlamalar', async () => {
  let url = '';
  let t = 0;
  const turn = createTurn({ METERED_APP: 'bura', METERED_API_KEY: 'k&y' }, {
    now: () => t,
    fetch: async (u) => { url = u; return { ok: true, status: 200, json: async () => [{ urls: 'stun:stun.relay.metered.ca:80' }, { urls: 'turn:standard.relay.metered.ca:443', username: 'x', credential: 'y' }] }; }
  });
  await turn.refresh();
  turn.stop();
  assert.equal(url, 'https://bura.metered.live/api/v1/turn/credentials?apiKey=k%26y');
  assert.equal(turn.current().length, 2);
  t = 30 * 24 * 3600 * 1000; // Metered kalitlari muddatsiz
  assert.equal(turn.current().length, 2);

  // Cloudflare kaliti 6 soatda tugaydi — eskirgani berilmaydi
  let now = 0;
  const cf = createTurn({ CF_TURN_KEY_ID: 'abcdef0123456789', CF_TURN_API_TOKEN: 'tok-tok-tok' }, {
    now: () => now,
    fetch: async () => ({ ok: true, status: 201, json: async () => ({ iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp'], username: 'a', credential: 'b' }] }) })
  });
  await cf.refresh();
  cf.stop();
  now = 5 * 3600 * 1000;
  assert.ok(cf.current());
  now = 6 * 3600 * 1000;
  assert.equal(cf.current(), null);

  // Javobda TURN yoʻq yoki HTTP xato — roʻyxat berilmaydi
  const bad = createTurn({ METERED_APP: 'bura.metered.live', METERED_API_KEY: 'k' }, {
    log: () => {},
    fetch: async () => ({ ok: false, status: 401, json: async () => ({}) })
  });
  assert.equal(await bad.refresh(), null);
  bad.stop();
  // Sozlanmagan yoki chala sozlangan — null
  assert.equal(createTurn({}, {}), null);
  assert.equal(createTurn({ CF_TURN_KEY_ID: 'abcdef0123456789' }, { log: () => {} }), null);
  assert.equal(createTurn({ METERED_APP: 'bad host!', METERED_API_KEY: 'k' }, { log: () => {} }), null);
});
