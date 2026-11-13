'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBot } = require('../src/bot');
const { Hub } = require('../src/hub');

function fakeApi() {
  const calls = [];
  let id = 41;
  return {
    calls,
    call: async (method, params) => {
      calls.push({ method, params });
      if (method === 'sendMessage') return { message_id: ++id };
      if (method === 'getMe') return { id: 99, username: 'BuraTestBot' };
      return true;
    }
  };
}

const CFG = { botToken: '1:x', publicUrl: 'https://bura.example.com', appShortName: 'bura', botMode: 'polling' };
const group = (text, extra) => ({ update_id: 1, message: Object.assign({ message_id: 5, text, chat: { id: -100123, type: 'supergroup', title: 'Doʻstlar' }, from: { id: 7, first_name: 'Ali' } }, extra || {}) });

test('guruhda /bura — zal xabari: guruhdagi barcha stollar va zal havolasi', async () => {
  const api = fakeApi();
  const hub = new Hub({ turnSeconds: 30, botToken: '1:x' });
  const bot = createBot({ api, hub, cfg: CFG });
  bot._test.setMe({ id: 99, username: 'BuraTestBot' });
  await bot._test.onUpdate(group('/bura@BuraTestBot'));
  const sent = api.calls.find((c) => c.method === 'sendMessage');
  assert.ok(sent, 'xabar yuborilmadi');
  assert.equal(sent.params.chat_id, -100123);
  const room = Array.from(hub.rooms.values())[0];
  assert.ok(room);
  assert.equal(room.chatId, -100123);
  assert.equal(room.no, 1);
  assert.equal(room.groupKey, hub.groupKeyFor(-100123));
  const url = sent.params.reply_markup.inline_keyboard[0][0].url;
  assert.equal(url, 'https://t.me/BuraTestBot/bura?startapp=' + room.groupKey);
  assert.match(sent.params.text, /oʻyin zali/);
  assert.match(sent.params.text, /1-stol/);
  assert.match(sent.params.text, /0\/4/);

  // Stol hali kutyapti — yangi stol ochilmaydi, zal xabari pastga qayta yuboriladi, eskisi oʻchadi
  await bot._test.onUpdate(group('/bura'));
  assert.equal(hub.rooms.size, 1);
  const sends = api.calls.filter((c) => c.method === 'sendMessage');
  assert.equal(sends.length, 2);
  const del = api.calls.find((c) => c.method === 'deleteMessage');
  assert.deepEqual(del && del.params, { chat_id: -100123, message_id: 42 });
  assert.equal(bot._test.halls.get(room.groupKey).messageId, 43);

  // Stol toʻldi — /bura yangi stol ochadi
  ['Ali', 'Vali', 'Gʻani', 'Doni'].forEach((n, i) => room.connect({ id: 'tg:' + (i + 1), name: n }));
  await bot._test.onUpdate(group('/bura'));
  assert.equal(hub.rooms.size, 2);
  const t2 = Array.from(hub.rooms.values()).find((r) => r !== room);
  assert.equal(t2.no, 2);
  assert.equal(t2.groupKey, room.groupKey);
  const last = api.calls.filter((c) => c.method === 'sendMessage').pop().params.text;
  assert.match(last, /1-stol/);
  assert.match(last, /2-stol/);
  assert.match(last, /1-jamoa: Ali, Gʻani/);
  assert.match(last, /2-jamoa: Vali, Doni/);

  // Ismlar HTML sifatida ekranlanadi
  t2.connect({ id: 'tg:9', name: 'X <b>' });
  assert.match(bot._test.hallText(hub.groups.get(room.groupKey)), /X &lt;b&gt;/);

  // Boshqa botga yuborilgan buyruq eʼtiborsiz qoldiriladi
  await bot._test.onUpdate({ update_id: 2, message: { message_id: 6, text: '/bura@OtherBot', chat: { id: -1, type: 'group' }, from: { id: 7 } } });
  assert.equal(hub.rooms.size, 2);

  // Qoidalar
  await bot._test.onUpdate({ update_id: 3, message: { message_id: 7, text: '/qoidalar', chat: { id: -1, type: 'group' }, from: { id: 7 } } });
  assert.ok(api.calls.some((c) => c.method === 'sendMessage' && /Bura qoidalari/.test(c.params.text)));
  hub.close();
});

test('shaxsiy chatda /bura — alohida stol va doʻstlarni chaqirish tugmasi', async () => {
  const api = fakeApi();
  const hub = new Hub({ turnSeconds: 30, botToken: '1:x' });
  const bot = createBot({ api, hub, cfg: CFG });
  bot._test.setMe({ id: 99, username: 'BuraTestBot' });
  await bot._test.onUpdate({ update_id: 1, message: { message_id: 5, text: '/bura', chat: { id: 7, type: 'private' }, from: { id: 7, first_name: 'Ali' } } });
  const room = Array.from(hub.rooms.values())[0];
  assert.equal(room.groupKey, 'gpub'); // shaxsiy chatdan ochilgan stol — umumiy zalda
  const sent = api.calls.find((c) => c.method === 'sendMessage').params;
  assert.equal(sent.reply_markup.inline_keyboard[0][0].url, 'https://t.me/BuraTestBot/bura?startapp=' + room.id);
  assert.match(sent.reply_markup.inline_keyboard[1][0].url, /^https:\/\/t\.me\/share\/url/);
  assert.match(sent.text, /0\/4/);
  room.connect({ id: 'tg:7', name: 'Ali <b>' });
  const text = bot._test.tableText(room);
  assert.match(text, /1\/4/);
  assert.match(text, /Ali &lt;b&gt;/, 'HTML ekranlanishi kerak');
  hub.close();
});

test('APP_SHORT_NAME boʻlmasa — asosiy Mini App havolasi', () => {
  const bot = createBot({ api: fakeApi(), hub: new Hub({}), cfg: { botToken: '1:x', publicUrl: '', appShortName: '', botMode: 'polling' } });
  bot._test.setMe({ id: 99, username: 'BuraTestBot' });
  assert.equal(bot.appLink('abc12345'), 'https://t.me/BuraTestBot?startapp=abc12345');
});
