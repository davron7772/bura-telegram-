'use strict';
/* Telegram bot: /bura buyrugʻi, guruhdagi stol xabari, qoidalar. */
const crypto = require('crypto');
const { sleep, esc, displayName } = require('./util');
const { MATCH_LOSE, MATCH_EDGE } = require('./engine');

const ALLOWED_UPDATES = ['message', 'my_chat_member'];

const COMMANDS = [
  { command: 'bura', description: 'Oʻyin zali: stol tanlash yoki yangi stol' },
  { command: 'qoidalar', description: 'Oʻyin qoidalari' },
  { command: 'help', description: 'Yordam' }
];

const RULES = [
  '🃏 <b>Bura qoidalari</b>',
  '',
  '<b>Jamoalar:</b> 4 kishi, 2×2. Sherigingiz roʻparangizda oʻtiradi, ochkolar jamoaga qoʻshiladi.',
  '<b>Kartalar:</b> 36 ta. Kuch tartibi: Tuz › 10 › Korol › Dama › Valet › 9 › 8 › 7 › 6.',
  '<b>Ochkolar:</b> Tuz — 11, 10 — 10, Korol — 4, Dama — 3, Valet — 2, qolganlari — 0 (jami 120).',
  '',
  '<b>Tarqatish:</b> har kimga 4 tadan karta. Bitta karta koʻzir qilib ochiladi, yana bittasi stolda yopiq turadi. Kolodadan avval oddiy kartalar, keyin ochiq koʻzir, eng oxirida yopiq karta olinadi. Yopiq kartani olgan oʻyinchi uni hammaga koʻrsatadi va <b>koʻzir masti shu kartanikiga almashadi</b>.',
  '<b>Birinchi yurish</b> har raundda navbat bilan keyingi oʻyinchiga oʻtadi.',
  '',
  '<b>Yurish:</b> 1 ta karta yoki bir xil mastdagi 2–4 ta karta.',
  '<b>Javob:</b> har kim shuncha karta tashlaydi. Stoldagi eng kuchli toʻplamning har bir kartasini urish kerak: oʻsha mastning kattaroq kartasi yoki koʻzir bilan. 10 korolni bosadi, korol 10 ni bosa olmaydi. Oddiy 10 ni faqat koʻzir bosadi; koʻzir korol koʻzir 10 ni bosa olmaydi. Ura olmasangiz yoki xohlamasangiz, kartalar yopiq beriladi.',
  '<b>Olish:</b> eng kuchli toʻplam egasi hamma kartalarni oladi, birinchi boʻlib kolodadan oladi va yuradi.',
  '',
  '🔥 <b>Bura</b> — qoʻldagi 4 kartaning hammasi koʻzir: navbatsiz yuradi.',
  '👑 <b>4 ta tuz</b> — qoʻlida 4 ta tuz yigʻilgan oʻyinchining jamoasi mutlaq gʻolib (tarqatishda 4 ta tuz bitta oʻyinchiga tushmaydi): raqib jamoa hisobi 14 boʻladi.',
  '',
  '<b>Hisob:</b> kartalar tugagach jamoa ochkolari sanaladi. 61 va undan koʻp — gʻalaba, 60:60 — durang: hech kimga ball yozilmaydi, keyingi raundda yutqazgan jamoaga yana +2 ball qoʻshiladi. Yurish vaqti tugasa, chap tarafdagi kartalar avtomatik yuriladi. Raundda yutqazgan jamoaga ball yoziladi: 31 va undan koʻp ochko olgan boʻlsa — 2, 31 dan kam — 4, birorta ham karta ololmagan boʻlsa — 6. 14 va undan koʻp ball toʻplagan jamoa matchni yutqazadi. Aynan 12 ballda jamoaga shans beriladi — yana oʻynaydi: yutsa, 12 da qoladi, yana yutqazsa, matchni boy beradi.'
].join('\n');

const HELP = [
  '🃏 <b>Bura boti</b>',
  '',
  '/bura — oʻyin zali: guruhdagi barcha stollar',
  '/qoidalar — oʻyin qoidalari',
  '',
  'Guruhda /bura yozing va «🎮 Oʻyin zaliga kirish» tugmasini bosing. Zalda guruhdagi barcha stollar va kim qayerda oʻtirgani koʻrinadi: boʻsh oʻringa oʻtirasiz, oʻyinni kuzatasiz yoki yangi stol ochasiz. Stolda 4 kishi yigʻilsa, oʻyin oʻzi boshlanadi. 2×2 jamoa boʻlib oʻynaladi: 1 va 3-oʻrin, 2 va 4-oʻrin.',
  'Odam kam boʻlsa, stol egasi boʻsh oʻrinlarga bot qoʻshadi.',
  '',
  '🎙 Stolda ovozli chat bor: oʻyin ichidagi mikrofon tugmasini bosing — stoldagilar bilan gaplashasiz.'
].join('\n');

function createBot(opts) {
  const api = opts.api, hub = opts.hub, cfg = opts.cfg;
  const tables = new Map(); // roomId -> { chatId, threadId, messageId, last, timer, wait }
  let me = null;

  const bot = {};
  bot.webhookPath = '/tg/' + crypto.createHash('sha256').update('wh:' + cfg.botToken).digest('hex').slice(0, 32);
  const webhookSecret = crypto.createHash('sha256').update('secret:' + cfg.botToken).digest('hex').slice(0, 48);

  bot.username = () => (me ? me.username : null);

  bot.appLink = function (roomId) {
    if (!me) return cfg.publicUrl + '/?room=' + roomId;
    const q = roomId ? '?startapp=' + roomId : '';
    return cfg.appShortName
      ? 'https://t.me/' + me.username + '/' + cfg.appShortName + q
      : 'https://t.me/' + me.username + q;
  };
  bot.shareLink = function (roomId) {
    return 'https://t.me/share/url?url=' + encodeURIComponent(bot.appLink(roomId)) +
      '&text=' + encodeURIComponent('Bura oʻynaymizmi? 🃏 Stolga qoʻshiling!');
  };

  function send(chatId, text, extra) {
    return api.call('sendMessage', Object.assign({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true }, extra || {}));
  }

  // ---------- stol xabari ----------
  function teamNames(room, team) {
    const out = [];
    for (let i = team; i < room.seats.length; i += 2) {
      const s = room.seats[i];
      out.push(s ? (s.bot ? '🤖 ' : '') + esc(s.name) + (s.id === room.hostId ? ' 👑' : '') : '<i>boʻsh</i>');
    }
    return out.join(', ');
  }

  function resultLine(room, r) {
    switch (r.type) {
      // ball yutqazgan jamoaga yoziladi: (2 - team) — yutqazgan jamoaning raqami
      case 'win': return '🏆 ' + (r.team + 1) + '-jamoa yutdi: ' + r.points[r.team] + ' ochko (' + (2 - r.team) + '-jamoaga +' + r.award + ' ball)';
      case 'aces': {
        const s = room.seats[r.seat];
        return '👑 4 ta tuz! ' + (r.via === 'taken' ? (r.team + 1) + '-jamoa 4 ta tuzni yigʻdi' : (s ? esc(s.name) : '') + ' — ' + (r.team + 1) + '-jamoa yutdi') +
          ' (' + (2 - r.team) + '-jamoa hisobi 14 — match tugadi)';
      }
      default: return '🤝 60:60 — durang, ball yozilmadi (keyingi raundda yutqazganga +' + (r.nextBonus || 2) + ')';
    }
  }

  function tableText(room) {
    const filled = room.seats.filter(Boolean).length;
    const N = room.seats.length;
    const L = ['🃏 <b>Bura</b> — stol <code>' + room.id + '</code>', ''];
    if (room.phase === 'lobby') {
      L.push('👥 Oʻyinchilar: <b>' + filled + '/' + N + '</b>' + (N === 2 ? ' · 1×1' : ''));
      L.push((N === 2 ? '1-oʻyinchi: ' : '1-jamoa: ') + teamNames(room, 0));
      L.push((N === 2 ? '2-oʻyinchi: ' : '2-jamoa: ') + teamNames(room, 1));
      L.push('');
      L.push(filled >= N ? '⏳ Oʻyin boshlanmoqda…' : '⏳ Yana ' + (N - filled) + ' kishi kerak. ' + N + ' kishi yigʻilsa, oʻyin boshlanadi.');
    } else {
      L.push('🎲 ' + room.round + '-raund ' + (room.phase === 'playing' ? 'ketmoqda' : 'tugadi'));
      // 12 ballda turgan jamoa — shans raundida
      const edge = function (t) {
        return !room.matchOver && room.score[t] >= MATCH_EDGE && room.score[t] < MATCH_LOSE ? ' ⚠️ shans' : '';
      };
      L.push('Hisob (yutqazgan jamoaga yoziladi, ' + MATCH_LOSE + ' ballga yetgan jamoa yutqazadi):');
      L.push('1-jamoa (' + teamNames(room, 0) + ') — <b>' + room.score[0] + '</b>' + edge(0));
      L.push('2-jamoa (' + teamNames(room, 1) + ') — <b>' + room.score[1] + '</b>' + edge(1));
      const r = room.lastResult;
      if (r) {
        L.push('', 'Oxirgi raund: ' + resultLine(room, r));
        if (r.matchOver) L.push('🎉 Match: ' + (r.matchWinner + 1) + '-jamoa yutdi! (' + (r.matchLoser + 1) + '-jamoa ' + r.score[r.matchLoser] + ' ballga yetdi)');
      }
    }
    return L.join('\n');
  }

  function tableKeyboard(room, isPrivate) {
    const open = room.phase === 'lobby' && room.seats.filter(Boolean).length < room.seats.length ? '🎮 Oʻyinga kirish' : '👀 Stolni ochish';
    const rows = [[{ text: open, url: bot.appLink(room.id) }]];
    if (isPrivate) rows.push([{ text: '📨 Doʻstlarni chaqirish', url: bot.shareLink(room.id) }]);
    return { inline_keyboard: rows };
  }

  async function newTable(msg) {
    const chat = msg.chat;
    const isPrivate = chat.type === 'private';
    const room = hub.createRoom({ chatId: chat.id, title: chat.title || '' });
    const extra = { reply_markup: tableKeyboard(room, isPrivate) };
    if (msg.message_thread_id && msg.is_topic_message) extra.message_thread_id = msg.message_thread_id;
    const text = tableText(room);
    const sent = await send(chat.id, text, extra);
    tables.set(room.id, { chatId: chat.id, messageId: sent.message_id, isPrivate: isPrivate, last: text, timer: null, wait: 0 });
  }

  // ---------- guruh zali: bitta xabarda guruhdagi barcha stollar ----------
  const halls = new Map(); // groupKey -> { chatId, messageId, thread, last, timer, postedAt }

  function seatLabel(s) {
    if (!s) return '<i>boʻsh</i>';
    return (s.bot ? '🤖 ' : '') + esc(s.name) + (s.auto ? ' <i>(bot oʻynayapti)</i>' : '');
  }
  function tableLine(r) {
    const n = r.seats.filter(Boolean).length;
    let st;
    if (r.phase === 'lobby') st = n >= r.size ? '⏳ boshlanmoqda' : '⏳ odam kutilmoqda (' + n + '/' + r.size + ')';
    else st = (r.phase === 'roundEnd' ? '⏸ ' : '🎲 ') + r.round + '-raund · hisob ' + r.score[0] + ':' + r.score[1];
    const extra = r.spectators.size ? ' · 👀 ' + r.spectators.size : '';
    if (r.size === 2) return '<b>' + r.no + '-stol</b> · 1×1 · ' + st + extra + '\n' + seatLabel(r.seats[0]) + ' ⚔️ ' + seatLabel(r.seats[1]);
    return '<b>' + r.no + '-stol</b> · ' + st + extra + '\n' +
      '1-jamoa: ' + [r.seats[0], r.seats[2]].map(seatLabel).join(', ') + '\n' +
      '2-jamoa: ' + [r.seats[1], r.seats[3]].map(seatLabel).join(', ');
  }
  function hallText(g, note) {
    const list = hub.hallTables(g);
    const L = ['🃏 <b>Bura — oʻyin zali</b>'];
    if (note) L.push(note);
    L.push('');
    if (!list.length) L.push('Hozircha stol yoʻq. Tugmani bosing va birinchi stolni oching.', '');
    list.slice(0, 12).forEach(function (r) { L.push(tableLine(r), ''); });
    if (list.length > 12) L.push('…va yana ' + (list.length - 12) + ' ta stol', '');
    L.push('👉 Tugmani bosing: istalgan stolga oʻtirasiz, kuzatasiz yoki yangi stol ochasiz.');
    return L.join('\n');
  }
  function hallKeyboard(g) {
    return { inline_keyboard: [[{ text: '🎮 Oʻyin zaliga kirish', url: bot.appLink(g.key) }]] };
  }

  // Zal xabarini guruhning pastiga qayta yuborish (eskisi oʻchiriladi — guruhda bitta xabar qoladi)
  async function postHall(g, thread, note) {
    let h = halls.get(g.key);
    if (!h) { h = { chatId: g.chatId, messageId: 0, thread: null, last: '', timer: null, postedAt: 0 }; halls.set(g.key, h); }
    if (thread) h.thread = thread;
    const text = hallText(g, note);
    const extra = { reply_markup: hallKeyboard(g) };
    if (h.thread) extra.message_thread_id = h.thread;
    const old = h.messageId;
    const sent = await send(g.chatId, text, extra);
    h.messageId = sent.message_id;
    h.last = text;
    h.postedAt = Date.now();
    if (old && old !== h.messageId) api.call('deleteMessage', { chat_id: g.chatId, message_id: old }).catch(function () {});
  }

  async function groupBura(msg) {
    const chat = msg.chat;
    const g = hub.ensureGroup(chat.id, chat.title || '');
    // Boʻsh oʻrinli kutayotgan stol boʻlmasa — yangisini ochamiz
    const waiting = hub.hallTables(g).some(function (r) { return r.phase === 'lobby' && r.seats.some(function (s) { return !s; }); });
    if (!waiting) hub.createRoom({ group: true, chatId: chat.id, title: chat.title || '' });
    const thread = msg.message_thread_id && msg.is_topic_message ? msg.message_thread_id : null;
    await postHall(g, thread);
  }

  // Zal oʻzgardi — guruhdagi xabarni yangilaymiz (tez-tez emas)
  bot.onHallChange = function (g) {
    const h = halls.get(g.key);
    if (!h || !h.messageId || h.timer) return;
    h.timer = setTimeout(async function () {
      h.timer = null;
      const text = hallText(g);
      if (text === h.last) return;
      try {
        await api.call('editMessageText', {
          chat_id: h.chatId, message_id: h.messageId, text: text, parse_mode: 'HTML',
          disable_web_page_preview: true, reply_markup: hallKeyboard(g)
        });
        h.last = text;
      } catch (e) {
        if (/not modified/i.test(e.message)) { h.last = text; return; }
        if (/not found|can't be edited/i.test(e.message)) { h.messageId = 0; return; }
        if (e.retryAfter) { await sleep(e.retryAfter * 1000); bot.onHallChange(g); return; }
        console.warn('[bot] zal xabarini yangilab boʻlmadi:', e.message);
      }
    }, 2500);
  };

  // Ilovadan yangi stol ochildi — guruhga xabar beramiz (daqiqada bir martadan koʻp emas)
  bot.onTableCreated = function (room, user) {
    if (!me || !room.groupKey || room.chatId === 'dev' || room.chatId === 'public') return;
    const g = hub.groups.get(room.groupKey);
    if (!g) return;
    const h = halls.get(g.key);
    if (h && h.messageId && Date.now() - h.postedAt < 60000) return bot.onHallChange(g);
    postHall(g, null, '🆕 ' + esc(user.name) + ' ' + room.no + '-stolni ochdi — qoʻshiling!')
      .catch(function (e) { console.warn('[bot] zal xabari:', e.message); });
  };

  // Stol holati oʻzgarganda shaxsiy chatdagi xabarni yangilash (guruh stollari zal xabarida)
  bot.onRoomChange = function (room) {
    if (room.groupKey && room.groupKey !== 'gpub') return; // guruh stollari — zal xabarida
    const t = tables.get(room.id);
    if (!t || t.timer) return;
    t.timer = setTimeout(async function () {
      t.timer = null;
      const text = tableText(room);
      if (text === t.last) return;
      try {
        await api.call('editMessageText', {
          chat_id: t.chatId, message_id: t.messageId, text: text, parse_mode: 'HTML',
          disable_web_page_preview: true, reply_markup: tableKeyboard(room, t.isPrivate)
        });
        t.last = text;
      } catch (e) {
        if (/not modified/i.test(e.message)) { t.last = text; return; }
        if (/not found|can't be edited/i.test(e.message)) { tables.delete(room.id); return; }
        if (e.retryAfter) { await sleep(e.retryAfter * 1000); bot.onRoomChange(room); return; }
        console.warn('[bot] xabarni yangilab boʻlmadi:', e.message);
      }
    }, 2500);
  };
  bot.onRoomRemoved = function (room) {
    const t = tables.get(room.id);
    if (t && t.timer) clearTimeout(t.timer);
    tables.delete(room.id);
  };

  // ---------- buyruqlar ----------
  async function onUpdate(u) {
    if (u.my_chat_member) return onMember(u.my_chat_member);
    const msg = u.message;
    if (!msg || typeof msg.text !== 'string' || !me) return;
    const m = /^\/([a-z_]+)(?:@([a-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(msg.text.trim());
    if (!m) return;
    if (m[2] && m[2].toLowerCase() !== me.username.toLowerCase()) return;
    const cmd = m[1].toLowerCase();
    const isPrivate = msg.chat.type === 'private';
    const thread = msg.message_thread_id && msg.is_topic_message ? { message_thread_id: msg.message_thread_id } : {};

    if (cmd === 'start' && isPrivate) return welcome(msg);
    if (cmd === 'bura' || cmd === 'start' || cmd === 'play' || cmd === 'yangi') return isPrivate ? newTable(msg) : groupBura(msg);
    if (cmd === 'qoidalar' || cmd === 'rules') return send(msg.chat.id, RULES, thread);
    if (cmd === 'help' || cmd === 'yordam') return send(msg.chat.id, HELP, thread);
  }

  function welcome(msg) {
    const rows = [[{ text: '➕ Guruhga qoʻshish', url: 'https://t.me/' + me.username + '?startgroup=bura' }]];
    if (/^https:\/\//.test(cfg.publicUrl)) rows.push([{ text: '🎮 Ilovani ochish', web_app: { url: cfg.publicUrl + '/' } }]);
    const text = [
      'Salom, ' + esc(displayName(msg.from)) + '! 🃏',
      '',
      'Men <b>Bura</b> karta oʻyini botiman. Doʻstlaringiz bilan Telegram ichida 4 kishilik Bura oʻynashingiz mumkin.',
      '',
      '1. Meni guruhga qoʻshing',
      '2. Guruhda /bura yozing',
      '3. «🎮 Oʻyin zaliga kirish» tugmasini bosing va stol tanlang',
      '',
      'Yoki shu yerda /bura yozing va havolani doʻstlaringizga yuboring.'
    ].join('\n');
    return send(msg.chat.id, text, { reply_markup: { inline_keyboard: rows } });
  }

  function onMember(cm) {
    if (!me || !cm.new_chat_member || cm.new_chat_member.user.id !== me.id) return;
    const was = cm.old_chat_member && cm.old_chat_member.status;
    const now = cm.new_chat_member.status;
    if ((now === 'member' || now === 'administrator') && (was === 'left' || was === 'kicked') && cm.chat.type !== 'channel') {
      return send(cm.chat.id, 'Salom! 🃏 Men Bura oʻyini botiman.\nOʻyin zalini ochish uchun /bura yozing — tugmani bosib, stol tanlaysiz. 4 kishi yigʻilsa, oʻyin boshlanadi.');
    }
  }

  // ---------- ishga tushirish ----------
  bot.start = async function () {
    for (;;) {
      try { me = await api.call('getMe'); break; } catch (e) {
        if (e.code === 401 || e.code === 404) { console.error('[bot] BOT_TOKEN notoʻgʻri — bot ishga tushmadi.'); return; }
        console.error('[bot] getMe:', e.message, '— 5 soniyadan keyin qayta urinaman');
        await sleep(5000);
      }
    }
    console.log('[bot] @' + me.username + ' ishga tushdi');
    api.call('setMyCommands', { commands: COMMANDS }).catch(function (e) { console.warn('[bot]', e.message); });
    if (/^https:\/\//.test(cfg.publicUrl)) {
      api.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Bura', web_app: { url: cfg.publicUrl + '/' } } })
        .catch(function (e) { console.warn('[bot] menyu tugmasi:', e.message); });
    }
    if (cfg.botMode === 'webhook') {
      await api.call('setWebhook', { url: cfg.publicUrl + bot.webhookPath, secret_token: webhookSecret, allowed_updates: ALLOWED_UPDATES });
      console.log('[bot] webhook rejimi: ' + cfg.publicUrl + '/tg/…');
    } else {
      await api.call('deleteWebhook', {}).catch(function () {});
      console.log('[bot] polling rejimi');
      api.startPolling(onUpdate, ALLOWED_UPDATES);
    }
  };

  bot.handleWebhook = function (req, res) {
    if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) { res.writeHead(401); res.end(); return; }
    const chunks = [];
    let size = 0;
    req.on('data', function (ch) { size += ch.length; if (size > 1e6) req.destroy(); else chunks.push(ch); });
    req.on('end', function () {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
      let u;
      try { u = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { return; }
      Promise.resolve(onUpdate(u)).catch(function (e) { console.error('[bot] xato:', e.message); });
    });
  };

  bot._test = { tableText: tableText, hallText: hallText, halls: halls, onUpdate: onUpdate, setMe: function (m) { me = m; } };
  return bot;
}

module.exports = { createBot, RULES };
