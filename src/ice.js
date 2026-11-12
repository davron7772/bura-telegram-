'use strict';
/*
 * Ovozli chat uchun STUN/TURN serverlar roʻyxati (.env dan).
 *
 *  ICE_SERVERS      — toʻliq roʻyxat JSON koʻrinishida (masalan, Metered sahifasidagi iceServers massivi)
 *  STUN_URLS        — vergul bilan ajratilgan stun: manzillar (berilmasa — Google va Cloudflare)
 *  TURN_URLS        — vergul bilan ajratilgan turn:/turns: manzillar
 *  TURN_USERNAME, TURN_CREDENTIAL — TURN login va paroli
 *  (Vaqtinchalik TURN kalitlarini API orqali olish — src/turn.js)
 */

const DEFAULT_STUN = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
const URL_RE = /^(stun|turns?):[^\s"'<>\\]+$/i;
const PORT53_RE = /:53(\?|$)/; // 53-port (DNS) — baʼzi brauzerlar toʻsadi, ulanishni sekinlashtiradi
const MAX_SERVERS = 8;

function splitList(v) {
  return String(v == null ? '' : v).split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

// Brauzer RTCPeerConnection notoʻgʻri manzilda xato beradi — shuning uchun hammasini shu yerda tekshiramiz
function cleanServer(s) {
  if (!s || typeof s !== 'object') return null;
  const raw = Array.isArray(s.urls) ? s.urls : [s.urls != null ? s.urls : s.url];
  const urls = raw
    .filter((u) => typeof u === 'string')
    .map((u) => u.trim())
    .filter((u) => u.length <= 256 && URL_RE.test(u) && !PORT53_RE.test(u))
    .slice(0, 8);
  if (!urls.length) return null;
  const out = { urls: urls };
  if (s.username != null && String(s.username) !== '') out.username = String(s.username).slice(0, 256);
  if (s.credential != null && String(s.credential) !== '') out.credential = String(s.credential).slice(0, 256);
  if (urls.some((u) => /^turns?:/i.test(u)) && (!out.username || !out.credential)) {
    return { error: 'TURN server uchun username va credential kerak — eʼtiborsiz qoldirildi' };
  }
  return out;
}

function parseIceServers(env, warn) {
  env = env || {};
  warn = warn || function () {};
  const out = [];
  const add = (s) => {
    const c = cleanServer(s);
    if (!c) return;
    if (c.error) { warn(c.error); return; }
    if (out.length < MAX_SERVERS) out.push(c);
  };

  const json = String(env.ICE_SERVERS || '').trim();
  if (json) {
    let v = null;
    try { v = JSON.parse(json); } catch (_) { warn('ICE_SERVERS: JSON notoʻgʻri — eʼtiborsiz qoldirildi'); }
    if (v && !Array.isArray(v) && Array.isArray(v.iceServers)) v = v.iceServers;
    if (v) (Array.isArray(v) ? v : [v]).forEach(add);
  }
  if (!out.length) {
    const stun = env.STUN_URLS != null ? splitList(env.STUN_URLS) : DEFAULT_STUN;
    if (stun.length) add({ urls: stun });
    const turn = splitList(env.TURN_URLS || env.TURN_URL);
    if (turn.length) add({ urls: turn, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  }
  return out;
}

function hasTurn(list) {
  return (list || []).some((s) => s.urls.some((u) => /^turns?:/i.test(u)));
}

// Tashqi manbadan (TURN API) kelgan roʻyxatni tekshirish
function cleanList(v, warn) {
  warn = warn || function () {};
  if (v && !Array.isArray(v) && v.iceServers) v = v.iceServers;
  const out = [];
  (Array.isArray(v) ? v : v ? [v] : []).forEach((x) => {
    const c = cleanServer(x);
    if (!c) return;
    if (c.error) { warn(c.error); return; }
    if (out.length < MAX_SERVERS) out.push(c);
  });
  return out;
}

module.exports = { parseIceServers, hasTurn, cleanList, DEFAULT_STUN };
