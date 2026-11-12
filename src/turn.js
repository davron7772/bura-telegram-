'use strict';
/*
 * TURN kalitlarini API orqali olish (ixtiyoriy, ovoz sifati va kechikish uchun).
 * Kalitlar serverda olinadi, keshda saqlanadi va ovozli chatga qoʻshilganlarga beriladi.
 * Maxfiy token brauzerga hech qachon yuborilmaydi va logga yozilmaydi.
 *
 *  Cloudflare Realtime TURN (oyiga 1000 GB bepul):  CF_TURN_KEY_ID, CF_TURN_API_TOKEN
 *  Metered / Open Relay (oyiga 20 GB bepul):         METERED_APP (masalan: bura yoki bura.metered.live), METERED_API_KEY
 */
const { cleanList, hasTurn } = require('./ice');

const CF_TTL = 6 * 3600;  // Cloudflare kalitlari 6 soat amal qiladi, 3 soatda yangilanadi
const TIMEOUT_MS = 6000;

function createTurn(env, opts) {
  env = env || {};
  opts = opts || {};
  const doFetch = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  const now = opts.now || Date.now;
  const cfId = String(env.CF_TURN_KEY_ID || '').trim();
  const cfTok = String(env.CF_TURN_API_TOKEN || '').trim();
  const mApp = String(env.METERED_APP || '').trim();
  const mKey = String(env.METERED_API_KEY || '').trim();
  const secrets = [cfTok, mKey].filter((x) => x.length >= 4);
  // Xato matnida maxfiy qiymat boʻlsa ham logga chiqmasin
  const log = function (m) {
    let t = String(m);
    secrets.forEach((x) => { t = t.split(x).join('***'); });
    (opts.log || function () {})(t);
  };

  let src = null;
  if (cfId || cfTok) {
    if (!cfId || !cfTok) log('Cloudflare TURN uchun CF_TURN_KEY_ID va CF_TURN_API_TOKEN ikkalasi ham kerak');
    else if (!/^[A-Za-z0-9_-]{8,128}$/.test(cfId)) log('CF_TURN_KEY_ID notoʻgʻri koʻrinishda');
    else {
      src = {
        name: 'Cloudflare',
        url: 'https://rtc.live.cloudflare.com/v1/turn/keys/' + cfId + '/credentials/generate-ice-servers',
        init: () => ({ method: 'POST', headers: { authorization: 'Bearer ' + cfTok, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: CF_TTL }) }),
        life: CF_TTL * 1000,
        every: CF_TTL * 1000 / 2
      };
    }
  }
  if (!src && (mApp || mKey)) {
    const host = mApp.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').toLowerCase();
    const full = host.indexOf('.') >= 0 ? host : host + '.metered.live';
    if (!mApp || !mKey) log('Metered TURN uchun METERED_APP va METERED_API_KEY ikkalasi ham kerak');
    else if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(full)) log('METERED_APP notoʻgʻri koʻrinishda');
    else {
      src = {
        name: 'Metered',
        url: 'https://' + full + '/api/v1/turn/credentials?apiKey=' + encodeURIComponent(mKey),
        init: () => ({ method: 'GET', headers: { accept: 'application/json' } }),
        life: 0, // muddatsiz
        every: 6 * 3600 * 1000
      };
    }
  }
  if (!src) return null;
  if (!doFetch) { log('TURN API uchun Node 18+ kerak (fetch yoʻq)'); return null; }

  let list = null, gotAt = 0, timer = null, busy = null, fails = 0, stopped = false;

  function current() {
    if (!list) return null;
    if (src.life && now() - gotAt > src.life - 60000) return null; // muddati tugagan kalitni bermaymiz
    return list;
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(refresh, ms);
    if (timer.unref) timer.unref();
  }

  function refresh() {
    if (busy) return busy;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const to = setTimeout(() => { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    const init = src.init();
    if (ctl) init.signal = ctl.signal;
    busy = Promise.resolve()
      .then(() => doFetch(src.url, init))
      .then((res) => {
        if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '?') + (res && (res.status === 401 || res.status === 403) ? ' — kalit notoʻgʻri' : ''));
        return res.json();
      })
      .then((json) => {
        const got = cleanList(json, log);
        if (!hasTurn(got)) throw new Error('javobda TURN server yoʻq');
        const first = !list;
        list = got;
        gotAt = now();
        fails = 0;
        if (first) log('TURN kalitlari olindi (' + src.name + ')');
        schedule(src.every);
        return list;
      })
      .catch((e) => {
        fails++;
        log('TURN kalitlarini olib boʻlmadi (' + src.name + '): ' + (e && e.name === 'AbortError' ? 'javob kelmadi' : (e && e.message) || e));
        schedule(Math.min(10 * 60000, 30000 * Math.pow(2, Math.min(fails - 1, 5))));
        return null;
      })
      .then((r) => { clearTimeout(to); busy = null; return r; });
    return busy;
  }

  return {
    name: src.name,
    current: current,
    refresh: refresh,
    start: function () { stopped = false; return refresh(); },
    stop: function () { stopped = true; clearTimeout(timer); }
  };
}

module.exports = { createTurn };
