'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateInitData, signInitData } = require('../src/auth');

const TOKEN = '123456:TEST-token_abc';
const user = JSON.stringify({ id: 777, first_name: 'Ali', last_name: 'Valiyev', username: 'ali' });

test('toʻgʻri initData qabul qilinadi', () => {
  const now = Math.floor(Date.now() / 1000);
  const data = signInitData({ user, auth_date: String(now), start_param: 'ab12cd34', chat_type: 'supergroup', chat_instance: '-123' }, TOKEN);
  const r = validateInitData(data, TOKEN);
  assert.ok(r);
  assert.equal(r.user.id, 777);
  assert.equal(r.startParam, 'ab12cd34');
  assert.equal(r.chatType, 'supergroup');
});

test('"signature" maydoni bilan ham ishlaydi', () => {
  const now = Math.floor(Date.now() / 1000);
  const data = signInitData({ user, auth_date: String(now), signature: 'abc' }, TOKEN);
  assert.ok(validateInitData(data, TOKEN));
});

test('soxta, eskirgan yoki boshqa token bilan rad etiladi', () => {
  const now = Math.floor(Date.now() / 1000);
  const good = signInitData({ user, auth_date: String(now) }, TOKEN);
  assert.equal(validateInitData(good, 'boshqa:token'), null);
  assert.equal(validateInitData(good.replace('Ali', 'Vali'), TOKEN), null);
  const old = signInitData({ user, auth_date: String(now - 3 * 86400) }, TOKEN);
  assert.equal(validateInitData(old, TOKEN), null);
  assert.equal(validateInitData('', TOKEN), null);
  assert.equal(validateInitData('hash=zz', TOKEN), null);
});
