'use strict';
/* Guruh zali: barcha stollar, kim qayerda, zaldan oʻtirish/kuzatish, yangi stol, zalga qaytish. */
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
      stop: () => new Promise((r) => { for (const w of hub.wss.clients) w.terminate(); hub.close(); server.close(r); })
    }));
  });
}

function client(port, uid, name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    const c = { ws, uid, name, msgs: [] };
    ws.on('message', (raw) => c.msgs.push(JSON.parse(raw)));
    c.send = (o) => ws.send(JSON.stringify(o));
    c.mark = () => c.msgs.length;
    c.next = async (pred, label, from) => {
      const end = Date.now() + 3000;
      while (Date.now() < end) {
        for (let i = from || 0; i < c.msgs.length; i++) if (pred(c.msgs[i])) return c.msgs[i];
        await wait(15);
      }
      throw new Error('kutish tugadi: ' + label + ' (' + name + ')');
    };
    c.hello = (room) => c.send({ t: 'hello', dev: { id: uid, name }, room });
    ws.on('open', () => resolve(c));
  });
}

const isHall = (pred) => (m) => m.t === 'hall' && (!pred || pred(m.hall));


test('guruhdosh kirsa — stolda oʻtirganlarga xabar; boʻsh oʻringa chaqirish, «Oʻtish» bossa oʻtiradi', async () => {
  const s = await startHub();
  try {
    const g = s.hub.ensureGroup(-100777, 'Bura guruhi');
    // Ali yangi stol ochadi (bo'sh o'rinlar bilan)
    const ali = await client(s.port, 'a', 'Ali'); ali.hello(g.key);
    await ali.next(isHall(), 'zal');
    ali.send({ t: 'create' });
    const a1 = await ali.next((m) => m.t === 'state' && m.room.mySeat >= 0, 'Ali stolda');
    // Vali boshqa stolda o'tiribdi
    const vali = await client(s.port, 'v', 'Vali'); vali.hello(g.key);
    await vali.next(isHall(), 'zal');
    await wait(1100); // stol ochish oraligʻi
    vali.send({ t: 'create' });
    const v1 = await vali.next((m) => m.t === 'state' && m.room.mySeat >= 0, 'Vali stolda');
    assert.notEqual(a1.room.id, v1.room.id);
    // Ali'ga xabar keldi: Vali kirdi
    const n = await ali.next((m) => m.t === 'notice' && m.kind === 'came', 'kirdi xabari');
    assert.equal(n.name, 'Vali');
    // Ali bo'sh o'ringa bosib ro'yxatni oladi
    const empty = a1.room.seats.findIndex((x) => !x);
    let k = ali.mark();
    ali.send({ t: 'invitable', seat: empty });
    const L = await ali.next((m) => m.t === 'invitable', 'roʻyxat', k);
    const vi = L.list.find((p) => p.name === 'Vali');
    assert.ok(vi && vi.seated && vi.table === v1.room.no);
    assert.equal(vi.uid, undefined); // id yuborilmaydi
    // Taklif
    k = vali.mark();
    ali.send({ t: 'invite', seat: empty, k: vi.k });
    const inv = await vali.next((m) => m.t === 'invited', 'taklif', k);
    assert.equal(inv.from, 'Ali'); assert.equal(inv.no, a1.room.no);
    // Qayta yuborish — cheklov
    k = ali.mark();
    ali.send({ t: 'invite', seat: empty, k: vi.k });
    await ali.next((m) => m.t === 'error' && /kuting/.test(m.msg), 'spam cheklovi', k);
    // Vali «Oʻtish»
    k = ali.mark();
    const kv = vali.mark();
    vali.send({ t: 'invite_reply', id: inv.id, go: true });
    await ali.next((m) => m.t === 'notice' && m.kind === 'came_in' && m.name === 'Vali', 'oʻtdi xabari', k);
    const v2 = await vali.next((m) => m.t === 'state' && m.room.id === a1.room.id && m.room.mySeat === empty, 'Vali yangi joyda', kv);
    assert.ok(v2);
    // Takrorlab javob — eskirgan
    k = vali.mark();
    vali.send({ t: 'invite_reply', id: inv.id, go: true });
    await vali.next((m) => m.t === 'error', 'eskirgan', k);
  } finally { await s.stop(); }
});

test('«Shu stolda qolish» — chaqirgan odamga xabar; begona taklifga javob berib boʻlmaydi', async () => {
  const s = await startHub();
  try {
    const g = s.hub.ensureGroup(-100778, 'G');
    const ali = await client(s.port, 'a', 'Ali'); ali.hello(g.key); await ali.next(isHall(), 'zal');
    ali.send({ t: 'create' });
    const a1 = await ali.next((m) => m.t === 'state' && m.room.mySeat >= 0, 'Ali stolda');
    const vali = await client(s.port, 'v', 'Vali'); vali.hello(g.key); await vali.next(isHall(), 'zal');
    const gani = await client(s.port, 'g', 'Gani'); gani.hello(g.key); await gani.next(isHall(), 'zal');
    const empty = a1.room.seats.findIndex((x) => !x);
    ali.send({ t: 'invitable', seat: empty });
    const L = await ali.next((m) => m.t === 'invitable', 'roʻyxat');
    ali.send({ t: 'invite', seat: empty, k: L.list.find((p) => p.name === 'Vali').k });
    const inv = await vali.next((m) => m.t === 'invited', 'taklif');
    let k = gani.mark();
    gani.send({ t: 'invite_reply', id: inv.id, go: true });
    await gani.next((m) => m.t === 'error', 'begona', k);
    k = ali.mark();
    vali.send({ t: 'invite_reply', id: inv.id, go: false });
    await ali.next((m) => m.t === 'notice' && m.kind === 'stay', 'qoldi', k);
  } finally { await s.stop(); }
});
