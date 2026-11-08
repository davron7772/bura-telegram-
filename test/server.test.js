'use strict';
/* Toʻliq tekshiruv: haqiqiy server + 4 ta WebSocket mijoz bitta raund oʻynaydi. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const E = require('../src/engine');

const PORT = 38000 + Math.floor(Math.random() * 1000);

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: Object.assign({}, process.env, { PORT: String(PORT), DEV_MODE: '1', BOT_TOKEN: '', PUBLIC_URL: '' }),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; if (out.includes('ishga tushdi')) resolve(p); });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (code) => reject(new Error('server chiqdi: ' + code + '\n' + out)));
    setTimeout(() => reject(new Error('server ishga tushmadi\n' + out)), 5000);
  });
}

function client(uid, name) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
    const c = { ws, uid, name, room: null, invite: null, msgs: [], errors: [] };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      c.msgs.push(m);
      if (m.t === 'state') { c.room = m.room; c.invite = m.invite; }
      if (m.t === 'error') c.errors.push(m.msg);
    });
    c.send = (o) => ws.send(JSON.stringify(o));
    ws.on('open', () => resolve(c));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await wait(40); }
  throw new Error('kutish tugadi: ' + label);
}

// Juda oddiy oʻyinchi: ura olsa uradi, boʻlmasa yopiq tashlaydi
function play(c) {
  const r = c.room;
  if (!r || r.phase !== 'playing' || !r.game) return;
  const g = r.game, me = r.mySeat;
  if (g.phase === 'lead' && !g.trick && g.leader === me) {
    if (c.pending === 'lead' + g.trickNo) return;
    c.pending = 'lead' + g.trickNo;
    return c.send({ t: 'act', action: { type: 'lead', cards: [g.hand[0]] } });
  }
  if (g.phase === 'follow' && g.turn === me) {
    const key = 'f' + g.trickNo + ':' + g.trick.plays.length;
    if (c.pending === key) return;
    c.pending = key;
    const best = g.trick.plays[g.trick.best].cards;
    const beat = E.beatingSets(g.hand, best, g.trump)[0];
    if (beat) return c.send({ t: 'act', action: { type: 'beat', cards: beat } });
    return c.send({ t: 'act', action: { type: 'discard', cards: g.hand.slice(0, g.trick.k) } });
  }
}

test('server: 4 kishi bitta stolda toʻliq raund oʻynaydi', { timeout: 90000 }, async () => {
  const srv = await startServer();
  try {
    // ruxsatsiz kirish rad etiladi
    const anon = await client('x', 'x');
    anon.send({ t: 'hello', initData: 'user=%7B%7D&hash=00' });
    await until(() => anon.msgs.some((m) => m.t === 'auth_error'), 2000, 'auth_error');
    anon.ws.close();

    const A = await client('1', 'Ali');
    A.send({ t: 'hello', dev: { id: '1', name: 'Ali' } });
    await until(() => A.msgs.some((m) => m.t === 'home'), 2000, 'home');
    A.send({ t: 'create' });
    await until(() => A.room, 2000, 'stol yaratildi');
    const id = A.room.id;
    assert.match(id, /^[a-f0-9]{8}$/);
    assert.ok(A.invite.includes(id));
    assert.equal(A.room.isHost, true);

    const others = [];
    for (const [uid, name] of [['2', 'Vali'], ['3', 'Gʻani'], ['4', 'Sobir']]) {
      const c = await client(uid, name);
      c.send({ t: 'hello', dev: { id: uid, name }, room: id });
      others.push(c);
    }
    const all = [A].concat(others);
    await until(() => all.every((c) => c.room && c.room.seats.filter(Boolean).length === 4), 3000, '4 oʻrin');
    assert.deepEqual(A.room.seats.map((s) => s.team), [0, 1, 0, 1]);
    // Boshlanishdan oldin begona buyruq xato qaytaradi
    others[0].send({ t: 'addBot' });
    await until(() => others[0].errors.length > 0, 2000, 'xato xabari');

    await until(() => all.every((c) => c.room.phase !== 'lobby'), 5000, 'oʻyin boshlandi');
    const timer = setInterval(() => all.forEach(play), 50);
    try {
      await until(() => all.every((c) => c.room.phase === 'roundEnd'), 60000, 'raund tugadi');
    } finally { clearInterval(timer); }

    // Yashirin maʼlumot sizib chiqmagan
    for (const c of all) {
      for (const m of c.msgs) {
        if (m.t !== 'state' || !m.room.game) continue;
        const g = m.room.game;
        assert.equal(g.me, m.room.mySeat);
        if (g.trick) for (const p of g.trick.plays) if (!p.up && p.seat !== g.me) assert.equal(p.cards, null);
        assert.ok(!('hands' in g) && !('stock' in g && Array.isArray(g.stock)));
        if (g.hiddenInStock) assert.equal(g.hiddenCard, null, 'yopiq karta oldindan koʻrinmaydi');
      }
    }
    const res = A.room.result;
    assert.ok(res && res.type);
    if (res.type !== 'aces') assert.equal(res.points[0] + res.points[1], 120);
    if (res.type === 'win' || res.type === 'aces') assert.equal(A.room.score[res.team], res.award);

    // Keyingi raund
    others[1].send({ t: 'next' });
    await until(() => all.every((c) => c.room.round === 2), 3000, '2-raund');
    all.forEach((c) => c.ws.close());
  } finally {
    srv.kill();
  }
});
