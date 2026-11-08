'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBot } = require('../src/bot');
const { Hub } = require('../src/hub');

function fakeApi() {
  const calls = [];
  return {
    calls,
    call: async (method, params) => {
      calls.push({ method, params });
      if (method === 'sendMessage') return { message_id: 42 };
      if (method === 'getMe') return { id: 99, username: 'BuraTestBot' };
      return true;
    }
  };
}

test('guruhda /bura — stol ochiladi va Mini App havolasi yuboriladi', async () => {
  const api = fakeApi();
  const hub = new Hub({ turnSeconds: 30 });
  const bot = createBot({ api, hub, cfg: { botToken: '1:x', publicUrl: 'https://bura.example.com', appShortName: 'bura', botMode: 'polling' } });
  bot._test.setMe({ id: 99, username: 'BuraTestBot' });
  await bot._test.onUpdate({ update_id: 1, message: { message_id: 5, text: '/bura@BuraTestBot', chat: { id: -100123, type: 'supergroup', title: 'Doʻstlar' }, from: { id: 7, first_name: 'Ali' } } });
  const sent = api.calls.find((c) => c.method === 'sendMessage');
  assert.ok(sent, 'xabar yuborilmadi');
  assert.equal(sent.params.chat_id, -100123);
  const room = Array.from(hub.rooms.values())[0];
  assert.ok(room);
  assert.equal(room.chatId, -100123);
  const url = sent.params.reply_markup.inline_keyboard[0][0].url;
  assert.equal(url, 'https://t.me/BuraTestBot/bura?startapp=' + room.id);
  assert.match(sent.params.text, /0\/4/);

  // Boshqa botga yuborilgan buyruq eʼtiborsiz qoldiriladi
  await bot._test.onUpdate({ update_id: 2, message: { message_id: 6, text: '/bura@OtherBot', chat: { id: -1, type: 'group' }, from: { id: 7 } } });
  assert.equal(hub.rooms.size, 1);

  // Qoidalar
  await bot._test.onUpdate({ update_id: 3, message: { message_id: 7, text: '/qoidalar', chat: { id: -1, type: 'group' }, from: { id: 7 } } });
  assert.ok(api.calls.some((c) => c.method === 'sendMessage' && /Bura qoidalari/.test(c.params.text)));

  // Xabar matni oʻyinchilar bilan yangilanadi
  room.connect({ id: 'tg:7', name: 'Ali <b>' });
  const text = bot._test.tableText(room);
  assert.match(text, /1\/4/);
  assert.match(text, /Ali &lt;b&gt;/, 'HTML ekranlanishi kerak');
  hub.close();
  room.destroy();
});

test('APP_SHORT_NAME boʻlmasa — asosiy Mini App havolasi', () => {
  const bot = createBot({ api: fakeApi(), hub: new Hub({}), cfg: { botToken: '1:x', publicUrl: '', appShortName: '', botMode: 'polling' } });
  bot._test.setMe({ id: 99, username: 'BuraTestBot' });
  assert.equal(bot.appLink('abc12345'), 'https://t.me/BuraTestBot?startapp=abc12345');
});
