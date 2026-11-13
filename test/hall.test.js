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

test('zal kaliti: imzo bilan, qayta ishga tushganda ham ishlaydi', () => {
  const a = new Hub({ botToken: '1:abc' });
  const key = a.groupKeyFor(-1001234567890);
  assert.match(key, /^gn[0-9a-z]+x[0-9a-f]{10}$/);
  assert.ok(key.length <= 40);
  assert.deepEqual(a.parseGroupKey(key), { chatId: -1001234567890 });
  // Bitta harfi oʻzgartirilgan kalit — rad
  const bad = key.slice(0, -1) + (key.endsWith('0') ? '1' : '0');
  assert.equal(a.parseGroupKey(bad), null);
  // Boshqa guruhning raqami bilan imzosiz kalit — rad
  assert.equal(a.parseGroupKey('gn' + (1001234567891).toString(36) + 'x0000000000'), null);
  // Server qayta ishga tushdi (yangi Hub, oʻsha token) — kalit ishlaydi, zal boʻsh
  const b = new Hub({ botToken: '1:abc' });
  const g = b.groupByKey(key);
  assert.ok(g);
  assert.equal(g.chatId, -1001234567890);
  assert.deepEqual(b.hallView(g, 'x').tables, []);
  // Boshqa token — kalit yaroqsiz
  assert.equal(new Hub({ botToken: '2:zzz' }).groupByKey(key), null);
  // Sinov guruhi faqat DEV rejimida
  assert.equal(a.parseGroupKey('gdev'), null);
  assert.deepEqual(new Hub({ devMode: true }).parseGroupKey('gdev'), { chatId: 'dev' });
});

test('zal: stollar roʻyxati, oʻtirish, yangi stol, zalga qaytish', { timeout: 20000 }, async () => {
  const srv = await startHub();
  const hub = srv.hub;
  try {
    const t1 = hub.createRoom({ group: true, chatId: -100777, title: 'Doʻstlar' });
    const key = t1.groupKey;
    assert.equal(t1.no, 1);
    assert.equal(key, hub.groupKeyFor(-100777));

    const A = await client(srv.port, '1', 'Ali');
    const B = await client(srv.port, '2', 'Vali');
    const C = await client(srv.port, '3', 'Gʻani');
    const D = await client(srv.port, '4', 'Doni');
    for (const c of [A, B, C, D]) { c.hello(key); await c.next(isHall(), 'zal'); }
    const h0 = D.msgs.find(isHall()).hall;
    assert.equal(h0.title, 'Doʻstlar');
    assert.equal(h0.tables.length, 1);
    assert.equal(h0.tables[0].no, 1);
    assert.equal(h0.tables[0].phase, 'lobby');
    assert.deepEqual(h0.tables[0].seats, [null, null, null, null]);

    // A aniq oʻringa (2-jamoa emas, 1-jamoaning 2-oʻrni — 2) oʻtiradi
    let at = D.mark();
    A.send({ t: 'join', room: t1.id, seat: 2 });
    const sa = await A.next((m) => m.t === 'state' && m.room.mySeat === 2, 'A oʻtirdi');
    assert.equal(sa.room.group, key);
    assert.equal(sa.room.no, 1);
    const hd = await D.next(isHall((h) => h.tables[0].seats[2] && h.tables[0].seats[2].name === 'Ali'), 'D koʻrdi', at);
    assert.equal(hd.hall.tables[0].mine, -1);
    assert.equal(hd.hall.tables[0].seats[2].you, false);

    // B oʻrin tanlamasdan kiradi — birinchi boʻsh oʻringa
    B.send({ t: 'join', room: t1.id });
    await B.next((m) => m.t === 'state' && m.room.mySeat === 0, 'B 0-oʻrinda');

    // Band oʻringa oʻtirib boʻlmaydi
    at = C.mark();
    C.send({ t: 'join', room: t1.id, seat: 2 });
    const busy = await C.next((m) => m.t === 'error', 'band', at);
    assert.match(busy.msg, /band/);
    // C endi 1-stolda (boʻsh oʻrinda). Zaldan yangi stol ochadi
    C.send({ t: 'hall' });
    await C.next(isHall(), 'C zalga qaytdi', at);
    at = D.mark();
    C.send({ t: 'create' });
    const sc = await C.next((m) => m.t === 'state' && m.room.no === 2, 'C 2-stolda');
    assert.equal(sc.room.group, key);
    assert.equal(sc.room.mySeat, 0);
    const h2 = await D.next(isHall((h) => h.tables.length === 2 && h.tables[1].seats[0]), '2 ta stol', at);
    assert.deepEqual(h2.hall.tables.map((t) => t.no), [1, 2]);
    assert.equal(h2.hall.tables[1].seats[0].name, 'Gʻani');
    assert.equal(h2.hall.tables[0].seats.filter(Boolean).length, 2, 'C 1-stoldagi oʻrnini boʻshatdi');

    // Tez-tez stol ochib boʻlmaydi
    C.send({ t: 'hall' });
    await C.next(isHall(), 'C zalda');
    at = C.mark();
    C.send({ t: 'create' });
    const cool = await C.next((m) => m.t === 'error', 'kutish', at);
    assert.match(cool.msg, /kuting/);

    // A lobbidan zalga qaytadi — oʻrni boʻshaydi
    at = D.mark();
    A.send({ t: 'hall' });
    const ha = await A.next(isHall(), 'A zalda');
    assert.equal(ha.hall.tables[0].mine, -1);
    await D.next(isHall((h) => !h.tables[0].seats[2]), 'A ning oʻrni boʻshadi', at);

    // Zaldagi kishi uchun "mine" va "you" belgilari
    at = B.mark();
    B.send({ t: 'hall' });
    const hb = await B.next(isHall(), 'B zalda', at);
    assert.equal(hb.hall.tables[0].mine, -1, 'lobbidan chiqqani uchun oʻrni yoʻq');

    // Yopilgan stolga kirish — xato va yangilangan zal
    const t3 = hub.createRoom({ group: true, chatId: -100777 });
    assert.equal(t3.no, 3);
    hub.removeRoom(t3);
    at = D.mark();
    D.send({ t: 'join', room: t3.id });
    const gone = await D.next((m) => m.t === 'error', 'yopilgan', at);
    assert.match(gone.msg, /yopilgan/);
    await D.next(isHall(), 'zal yangilandi', at);

    // Hech kim qolmagan eski stol zalda koʻrinmaydi
    const old = hub.createRoom({ group: true, chatId: -100777 });
    old.createdAt -= 11 * 60 * 1000;
    const g = hub.groups.get(key);
    assert.ok(!hub.hallTables(g).includes(old));
    assert.ok(hub.hallTables(g).includes(t1), 'odami bor stol koʻrinadi');

    // Notoʻgʻri kalit — "stol topilmadi"
    const X = await client(srv.port, '9', 'Yot');
    X.send({ t: 'hello', dev: { id: '9', name: 'Yot' }, room: 'gn123x0000000000' });
    const miss = await X.next((m) => m.t === 'error', 'topilmadi');
    assert.match(miss.msg, /topilmadi/);
    const pub = await X.next(isHall(), 'umumiy zal');
    assert.equal(pub.hall.key, 'gpub');

    [A, B, C, D, X].forEach((c) => c.ws.close());
  } finally {
    await srv.stop();
  }
});

test('zal: oʻyin ketayotgan stolni kuzatish, raund oxirida bot oʻrniga oʻtirish', { timeout: 20000 }, async () => {
  const srv = await startHub();
  const hub = srv.hub;
  try {
    const t = hub.createRoom({ group: true, chatId: -100888, title: 'Oila' });
    const A = await client(srv.port, '1', 'Ali');
    A.hello(t.groupKey);
    await A.next(isHall(), 'zal');
    A.send({ t: 'join', room: t.id });
    await A.next((m) => m.t === 'state' && m.room.mySeat === 0, 'A oʻtirdi');
    A.send({ t: 'fillBots' });
    await A.next((m) => m.t === 'state' && m.room.phase === 'playing', 'oʻyin boshlandi');

    const W = await client(srv.port, '5', 'Kuzatuvchi');
    W.hello(t.groupKey);
    const hw = await W.next(isHall((h) => h.tables[0] && h.tables[0].phase === 'playing'), 'zalda oʻyin');
    const tv = hw.hall.tables[0];
    assert.equal(tv.seats.filter((s) => s && s.bot).length, 3);
    assert.equal(tv.round, 1);
    // Kuzatish
    let at = W.mark();
    W.send({ t: 'join', room: t.id });
    const sw = await W.next((m) => m.t === 'state', 'kuzatuvchi', at);
    assert.equal(sw.room.spectator, true);
    // Oʻyin paytida bot oʻrniga oʻtirib boʻlmaydi
    W.send({ t: 'join', room: t.id, seat: 1 });
    const wait1 = await W.next((m) => m.t === 'error', 'raundni kuting', at);
    assert.match(wait1.msg, /Raund tugashini kuting/);
    // Raund oxirida — mumkin
    t.phase = 'roundEnd';
    at = W.mark();
    W.send({ t: 'join', room: t.id, seat: 1 });
    const sat = await W.next((m) => m.t === 'state' && m.room.mySeat === 1, 'bot oʻrniga', at);
    assert.equal(sat.room.seats[1].name, 'Kuzatuvchi');
    [A, W].forEach((c) => c.ws.close());
  } finally {
    await srv.stop();
  }
});
