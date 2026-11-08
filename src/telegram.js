'use strict';
/* Telegram Bot API uchun kichik mijoz (qoʻshimcha kutubxonasiz, Node 18+ fetch). */
const { sleep } = require('./util');

class TelegramApi {
  constructor(token, opts) {
    opts = opts || {};
    this.base = (opts.apiRoot || 'https://api.telegram.org') + '/bot' + token + '/';
    this.offset = 0;
    this.running = false;
  }

  async call(method, params) {
    let res;
    try {
      res = await fetch(this.base + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params || {})
      });
    } catch (e) {
      const err = new Error(method + ': tarmoq xatosi (' + e.message + ')');
      err.network = true;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* boʻsh */ }
    if (!data || !data.ok) {
      const err = new Error(method + ': ' + ((data && data.description) || 'HTTP ' + res.status));
      err.code = data && data.error_code;
      err.retryAfter = data && data.parameters && data.parameters.retry_after;
      throw err;
    }
    return data.result;
  }

  async startPolling(onUpdate, allowedUpdates) {
    this.running = true;
    while (this.running) {
      try {
        const updates = await this.call('getUpdates', { offset: this.offset, timeout: 50, allowed_updates: allowedUpdates });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          Promise.resolve(onUpdate(u)).catch((e) => console.error('[bot] xabarni qayta ishlashda xato:', e.message));
        }
      } catch (e) {
        console.error('[bot] getUpdates:', e.message);
        await sleep(e.code === 409 ? 10000 : 3000);
      }
    }
  }

  stop() { this.running = false; }
}

module.exports = { TelegramApi };
