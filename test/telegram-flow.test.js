'use strict';
/* Bot → guruh xabari → Telegram orqali kirish (initData) → xabar yangilanishi: soxta Telegram API bilan. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { signInitData } = require('../src/auth');

const TOKEN = '999:TEST_token';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, label) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return; await wait(50); }
  throw new Error('kutish tugadi: ' + label);
}

test('bot: /bura guruhda → zal tugmasi → Telegram foydalanuvchilari stolga oʻtiradi → zal xabari yangilanadi', { timeout: 60000 }, async () => {
  const calls = [];
  let delivered = false;
  const mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const method = req.url.split('/').pop();
      const params = body ? JSON.parse(body) : {};
      calls.push({ method, params });
      const ok = (result) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };
      if (!req.url.startsWith('/bot' + TOKEN + '/')) { res.writeHead(404); return res.end('{"ok":false,"error_code":404,"description":"Not Found"}'); }
      if (method === 'getMe') return ok({ id: 999, is_bot: true, username: 'BuraSinovBot' });
      if (method === 'getUpdates') {
        if (!delivered) {
          delivered = true;
          return ok([{ update_id: 1, message: { message_id: 10, date: 0, text: '/bura@BuraSinovBot', chat: { id: -1001, type: 'supergroup', title: 'Doʻstlar' }, from: { id: 5, first_name: 'Ali' } } }]);
        }
        await wait(500);
        return ok([]);
      }
      if (method === 'sendMessage') return ok({ message_id: 77 });
      return ok(true);
    });
  });
  await new Promise((r) => mock.listen(0, r));
  const apiPort = mock.address().port;
  const port = 39000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, {
      PORT: String(port), BOT_TOKEN: TOKEN, PUBLIC_URL: 'https://bura.example.test', APP_SHORT_NAME: 'bura',
      BOT_MODE: 'polling', DEV_MODE: '0', TELEGRAM_API_ROOT: 'http://127.0.0.1:' + apiPort
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    await until(() => calls.some((c) => c.method === 'sendMessage'), 10000, 'stol xabari\n' + log);
    assert.ok(calls.some((c) => c.method === 'deleteWebhook'), 'polling oldidan webhook oʻchiriladi');
    assert.ok(calls.some((c) => c.method === 'setMyCommands'));
    const sent = calls.find((c) => c.method === 'sendMessage').params;
    assert.equal(sent.chat_id, -1001);
    const url = sent.reply_markup.inline_keyboard[0][0].url;
    const m = /^https:\/\/t\.me\/BuraSinovBot\/bura\?startapp=(g[0-9a-z]+)$/.exec(url);
    assert.ok(m, url);
    const hallKey = m[1];
    assert.match(sent.text, /1-stol/);

    // Ikki Telegram foydalanuvchisi zal havolasi orqali kiradi (haqiqiy initData imzosi bilan) va stolga oʻtiradi
    const clients = [];
    for (const [id, name] of [[5, 'Ali'], [6, 'Vali']]) {
      const initData = signInitData({
        user: JSON.stringify({ id, first_name: name }), auth_date: String(Math.floor(Date.now() / 1000)),
        start_param: hallKey, chat_type: 'supergroup', chat_instance: '123'
      }, TOKEN);
      const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
      const c = { ws, last: null, hall: null };
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.t === 'state') { c.last = msg.room; c.invite = msg.invite; }
        if (msg.t === 'hall') c.hall = msg.hall;
      });
      await new Promise((r) => ws.on('open', r));
      ws.send(JSON.stringify({ t: 'hello', initData }));
      await until(() => c.hall && c.hall.tables.length === 1, 5000, 'zal: ' + name);
      ws.send(JSON.stringify({ t: 'join', room: c.hall.tables[0].id }));
      await until(() => c.last && c.last.mySeat >= 0, 5000, 'oʻtirdi: ' + name);
      clients.push(c);
    }
    await until(() => clients.every((c) => c.last && c.last.seats.filter(Boolean).length === 2), 5000, 'ikki oʻyinchi');
    assert.equal(clients[0].last.isHost, true);
    assert.equal(clients[0].last.seats[0].name, 'Ali');
    assert.equal(clients[0].last.no, 1);
    assert.equal(clients[0].invite, 'https://t.me/BuraSinovBot/bura?startapp=' + clients[0].last.id);

    // Soxta imzo rad etiladi
    const bad = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    let badMsg = null;
    bad.on('message', (raw) => { badMsg = JSON.parse(raw); });
    await new Promise((r) => bad.on('open', r));
    bad.send(JSON.stringify({ t: 'hello', initData: 'user=%7B%22id%22%3A1%7D&auth_date=1&hash=abc', dev: { id: 1 } }));
    await until(() => badMsg, 3000, 'rad javobi');
    assert.equal(badMsg.t, 'auth_error');

    // Guruhdagi zal xabari yangilanadi
    await until(() => calls.some((c) => c.method === 'editMessageText' && /2\/4/.test(c.params.text)), 6000, 'xabar yangilanishi');
    const edit = calls.filter((c) => c.method === 'editMessageText').pop().params;
    assert.equal(edit.message_id, 77);
    assert.match(edit.text, /Ali/);
    assert.match(edit.text, /Vali/);
    clients.forEach((c) => c.ws.close());
    bad.close();
  } finally {
    srv.kill();
    mock.close();
  }
});
