'use strict';
// Yandex Disk — statistika faylini doimiy saqlash (ilova papkasi: Приложения/<ilova nomi>/).
// Token: Render → Environment → YANDEX_DISK_TOKEN (OAuth, «cloud_api:disk.app_folder» ruxsati).

const API = 'https://cloud-api.yandex.net/v1/disk/resources';

function YaDisk(opts) {
  this.token = opts.token;
  this.path = opts.path || 'app:/bura-stats.json';
  this.fetch = opts.fetch || globalThis.fetch;
  this.timeoutMs = opts.timeoutMs || 15000;
}

YaDisk.prototype.req = async function (url, init) {
  const ctl = new AbortController();
  const t = setTimeout(function () { ctl.abort(); }, this.timeoutMs);
  try { return await this.fetch(url, Object.assign({ signal: ctl.signal }, init)); }
  finally { clearTimeout(t); }
};

YaDisk.prototype.auth = function () { return { Authorization: 'OAuth ' + this.token }; };

// Fayl matni yoki null (hali yoʻq boʻlsa)
YaDisk.prototype.read = async function () {
  const r = await this.req(API + '/download?path=' + encodeURIComponent(this.path), { headers: this.auth() });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Yandex Disk: oʻqib boʻlmadi (' + r.status + ')');
  const { href } = await r.json();
  const f = await this.req(href);
  if (!f.ok) throw new Error('Yandex Disk: yuklab olib boʻlmadi (' + f.status + ')');
  return await f.text();
};

YaDisk.prototype.write = async function (text) {
  const r = await this.req(API + '/upload?overwrite=true&path=' + encodeURIComponent(this.path), { headers: this.auth() });
  if (!r.ok) throw new Error('Yandex Disk: yozish manzili olinmadi (' + r.status + ')');
  const { href } = await r.json();
  const u = await this.req(href, { method: 'PUT', body: text, headers: { 'Content-Type': 'application/json' } });
  if (!u.ok) throw new Error('Yandex Disk: yozib boʻlmadi (' + u.status + ')');
};

module.exports = { YaDisk: YaDisk };
