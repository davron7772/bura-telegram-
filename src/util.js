'use strict';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Telegram foydalanuvchisining koʻrinadigan ismi
function displayName(u) {
  if (!u) return 'Oʻyinchi';
  const raw = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Oʻyinchi';
  const clean = String(raw).replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim();
  return (clean || 'Oʻyinchi').slice(0, 24);
}

function safePhoto(url) {
  return typeof url === 'string' && /^https:\/\/t\.me\/i\/userpic\//.test(url) && url.length < 300 ? url : null;
}

// .env faylini oʻqish (qoʻshimcha kutubxonasiz)
function loadEnv(file) {
  const fs = require('fs');
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

module.exports = { sleep, esc, displayName, safePhoto, loadEnv };
