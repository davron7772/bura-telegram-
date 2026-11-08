'use strict';
/*
 * Telegram Mini App initData tekshiruvi.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
const crypto = require('crypto');

function secretKey(botToken) {
  return crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
}

function checkString(params, exclude) {
  const pairs = [];
  for (const [k, v] of params) if (!exclude.includes(k)) pairs.push([k, v]);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return pairs.map(([k, v]) => k + '=' + v).join('\n');
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); } catch (_) { return false; }
}

/**
 * initData satrini tekshiradi. Toʻgʻri boʻlsa foydalanuvchi maʼlumotini qaytaradi, aks holda null.
 * maxAgeSec — maʼlumot qancha vaqtgacha amal qiladi (standart 24 soat).
 */
function validateInitData(initData, botToken, maxAgeSec) {
  if (!initData || !botToken) return null;
  maxAgeSec = maxAgeSec || 86400;
  let params;
  try { params = new URLSearchParams(initData); } catch (_) { return null; }
  const hash = params.get('hash');
  if (!hash) return null;
  const key = secretKey(botToken);
  const calc = (exclude) => crypto.createHmac('sha256', key).update(checkString(params, exclude)).digest('hex');
  // Bot API 8.0+: "signature" maydoni ham keladi — har ikki variantni tekshiramiz
  if (!safeEqualHex(calc(['hash']), hash) && !safeEqualHex(calc(['hash', 'signature']), hash)) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) { return null; }
  if (!user || !user.id) return null;
  return {
    user,
    startParam: params.get('start_param') || '',
    chatType: params.get('chat_type') || '',
    chatInstance: params.get('chat_instance') || '',
    authDate
  };
}

// Testlar uchun: initData yasash
function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const hash = crypto.createHmac('sha256', secretKey(botToken)).update(checkString(params, ['hash'])).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

module.exports = { validateInitData, signInitData };
