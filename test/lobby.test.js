'use strict';
/* Yangi stol: botsiz yoki botlar bilan; aniq oʻringa taklif havolasi; oʻyin faqat 4 kishi toʻlganda boshlanadi. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const WebSocket = require('ws');
const { Hub } = require('../src/hub');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startHub(cfg) {
  const server = http.createServer();
  const hub = new Hub(Object.assign({ requireReady: false, devMode: true, turnSeconds: 30, botToken: '1:test' }, cfg));
  hub.attach(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      hub, port: server.address().port,
      stop: () => new Promise((r) => {
        for (const ws of hub.wss.clients) ws.terminate(); // xato boʻlsa ham server yopilsin
        hub.close(); server.close(r);
      })
    }));
  });
}

function client(port, uid, name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const c = { ws, uid, name, msgs: [] };
    ws.on('message', (raw, bin) => { if (!bin) c.msgs.push(JSON.parse(raw)); });
    c.send = (o) => ws.send(JSON.stringify(o));
    c.next = async (pred, label) => {
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        for (let i = c.msgs.length - 1; i >= 0; i--) if (pred(c.msgs[i])) return c.msgs[i];
        await wait(15);
      }
      throw new Error('kutish tugadi: ' + label + ' (' + name + ')');
    };
    c.last = () => { for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].t === 'state') return c.msgs[i].room; return null; };
    c.hello = (room) => c.send({ t: 'hello', dev: { id: uid, name }, room });
    ws.on('open', () => resolve(c));
  });
}

const names = (room) => room.seats.map((s) => (s ? (s.bot ? 'bot' : s.name) : null));

test('yangi stol botsiz: faqat ochgan kishi, oʻyin boshlanmaydi; botlar bilan — darhol boshlanadi', { timeout: 15000 }, async () => {
  const h = await startHub();
  try {
    const a = await client(h.port, 'a', 'Ali');
    a.hello();
    await a.next((m) => m.t === 'hall', 'bosh sahifa');
    a.send({ t: 'create', bots: false });
    const r = (await a.next((m) => m.t === 'state', 'stol')).room;
    assert.deepEqual(names(r), ['Ali', null, null, null]);
    assert.equal(r.phase, 'lobby');
    assert.equal(r.isHost, true);
    await wait(2300); // avtostart vaqti (1,8 s) oʻtdi — baribir lobbida
    assert.equal(h.hub.rooms.get(r.id).phase, 'lobby');

    // Stol egasi bitta oʻringa bot qoʻshadi — hali 2/4, boshlanmaydi
    a.send({ t: 'addBot', seat: 3 });
    await a.next((m) => m.t === 'state' && m.room.seats[3] && m.room.seats[3].bot, 'bot 3-oʻrinda');
    a.send({ t: 'start' });
    const err = await a.next((m) => m.t === 'error', 'boshlab boʻlmaydi');
    assert.match(err.msg, /4 kishi kerak/);
    // Botni olib tashlash mumkin
    a.send({ t: 'kick', seat: 3 });
    await a.next((m) => m.t === 'state' && !m.room.seats[3], 'bot olib tashlandi');

    const b = await client(h.port, 'b', 'Bek');
    b.hello();
    await b.next((m) => m.t === 'hall', 'bosh sahifa');
    b.send({ t: 'create', bots: true });
    const rb = (await b.next((m) => m.t === 'state', 'botli stol')).room;
    assert.notEqual(rb.id, r.id);
    assert.deepEqual(names(rb), ['Bek', 'bot', 'bot', 'bot']);
    await b.next((m) => m.t === 'state' && m.room.phase === 'playing', 'oʻyin boshlandi');
    a.ws.close(); b.ws.close();
  } finally { await h.stop(); }
});

test('taklif havolasi aniq oʻringa oʻtqazadi; oʻrin band boʻlsa — birinchi boʻsh joyga', { timeout: 15000 }, async () => {
  const h = await startHub();
  try {
    const a = await client(h.port, 'a', 'Ali');
    a.hello();
    await a.next((m) => m.t === 'hall', 'bosh sahifa');
    a.send({ t: 'create', bots: false });
    const r = (await a.next((m) => m.t === 'state', 'stol')).room;

    const b = await client(h.port, 'b', 'Bek');
    b.hello(r.id + 's2'); // sherik oʻrni
    const rb = (await b.next((m) => m.t === 'state', 'B stolda')).room;
    assert.equal(rb.mySeat, 2);
    assert.equal(rb.myTeam, 0);

    const c = await client(h.port, 'c', 'Cho');
    c.hello(r.id + 's2'); // band — birinchi boʻsh oʻringa
    const rc = (await c.next((m) => m.t === 'state', 'C stolda')).room;
    assert.equal(rc.mySeat, 1);

    // Notoʻgʻri oʻrin raqami — oddiy havoladek
    const d = await client(h.port, 'd', 'Dil');
    d.hello(r.id + 's9');
    const rd = (await d.next((m) => m.t === 'state', 'D stolda')).room;
    assert.equal(rd.mySeat, 3);
    assert.deepEqual(names(rd), ['Ali', 'Cho', 'Bek', 'Dil']);
    await a.next((m) => m.t === 'state' && m.room.phase === 'playing', '4 kishi — oʻyin boshlandi');
    for (const x of [a, b, c, d]) x.ws.close();
  } finally { await h.stop(); }
});

test('zalda: botsiz stol guruhga eʼlon qilinadi, botli stol — yoʻq', { timeout: 15000 }, async () => {
  const created = [];
  const h = await startHub({ onTableCreated: (room) => created.push(room.id) });
  try {
    const a = await client(h.port, 'a', 'Ali');
    a.hello('gdev');
    await a.next((m) => m.t === 'hall', 'zal');
    a.send({ t: 'create', bots: true });
    const r1 = (await a.next((m) => m.t === 'state', 'botli stol')).room;
    assert.equal(r1.group, 'gdev');
    assert.deepEqual(names(r1), ['Ali', 'bot', 'bot', 'bot']);
    assert.deepEqual(created, []);

    const b = await client(h.port, 'b', 'Bek');
    b.hello('gdev');
    await b.next((m) => m.t === 'hall', 'zal');
    b.send({ t: 'create', bots: false });
    const r2 = (await b.next((m) => m.t === 'state', 'botsiz stol')).room;
    assert.deepEqual(names(r2), ['Bek', null, null, null]);
    assert.deepEqual(created, [r2.id]);
    a.ws.close(); b.ws.close();
  } finally { await h.stop(); }
});
