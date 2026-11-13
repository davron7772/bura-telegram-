/* Bura — ovozli chat.
   Har bir ishtirokchi qolganlarning har biri bilan toʻgʻridan-toʻgʻri (WebRTC) ulanadi.
   Toʻgʻridan-toʻgʻri ulanib boʻlmasa (mobil internet, qattiq NAT, TURN yoʻq), oʻsha juftlik ovozi
   server orqali uzatiladi: mikrofon → 16 kHz ADPCM → WebSocket → server → qabul qiluvchi.
   Shunda stoldagilar har doim bir-birini eshitadi. */
(function (root) {
  'use strict';

  const TALK_LOCAL = 0.025;    // mahalliy mikrofon: RMS chegarasi
  const TALK_REMOTE = 0.02;    // boshqalar: RTP audioLevel chegarasi (taxminan −34 dBov)
  const HOLD = 450;            // gapirish belgisi soʻz tugagach shuncha ms saqlanadi
  const JOIN_TIMEOUT = 12000;
  const CONNECT_TIMEOUT = 15000;
  const MAX_RESTARTS = 4;
  const POOL = 7;

  // Server orqali ovoz
  const FWD_TAG = 0xA1;        // kadrning birinchi bayti
  const FWD_RATE = 16000;      // uzatish chastotasi
  const FWD_FRAME = 640;       // 40 ms
  const FWD_LOUD = 0.012;      // shundan baland — gapiryapti (jimlik yuborilmaydi)
  const FWD_HANG = 450;        // soʻz tugagach yana shuncha ms yuboriladi
  const JITTER = 0.12;         // qabul qilishdagi bufer, s
  const MAX_LAG = 0.6;         // kechikish shundan oshsa — qayta tekislanadi
  const LOOP_TIMEOUT = 5000;
  const STAT_DELAY = 2500;

  const ADPCM = root.BuraADPCM || null;
  // voice-worklet.js ham voice.js bilan bir xil versiyada yuklansin
  const VER = (function () {
    try {
      const src = document.currentScript && document.currentScript.src;
      const q = src ? src.indexOf('?') : -1;
      return q >= 0 ? src.slice(q) : '';
    } catch (e) { return ''; }
  })();

  function noop() {}
  function rid() { return (Math.random().toString(36).slice(2, 10) + Date.now().toString(36)).slice(0, 16); }
  function stopTrack(t) { try { t.stop(); } catch (e) { /* */ } }
  function warn(what, e) { if (root.console) console.warn('[ovoz] ' + what + ':', e && (e.message || e.name || e)); }

  function supported() { return typeof root.RTCPeerConnection === 'function'; }

  // Ovozsiz qisqa WAV — iOS va Android WebView'da <audio> elementlarini bosish paytida "ochib" qoʻyish uchun
  let silentSrc = null;
  function silentUrl() {
    if (silentSrc !== null) return silentSrc;
    const n = 800, b = new Uint8Array(44 + n), dv = new DataView(b.buffer);
    const w = function (o, s) { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    w(36, 'data'); dv.setUint32(40, n, true); b.fill(128, 44);
    try { silentSrc = URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); } catch (e) { silentSrc = ''; }
    return silentSrc;
  }

  function meter(an) {
    const b = an._b || (an._b = new Uint8Array(an.fftSize));
    an.getByteTimeDomainData(b);
    let sum = 0;
    for (let i = 0; i < b.length; i++) { const x = (b[i] - 128) / 128; sum += x * x; }
    return Math.sqrt(sum / b.length);
  }

  function create(opts) {
    const send = opts.send || noop;
    const sendBin = opts.sendBin || noop;
    const noP2P = !!opts.noP2P; // faqat sinov: WebRTC ulanmaydi, ovoz server orqali
    const onChange = opts.onChange || noop;
    const toast = opts.toast || noop;
    const haptic = opts.haptic || noop;

    const V = {
      status: 'off',        // off | joining | live
      mic: 'none',          // on | muted | none (faqat eshitadi)
      roster: [],           // serverdan: [{ v, seat, name, muted, mic }]
      me: null,             // mening raqamim (vid)
      max: 6,
      talking: new Set(),   // hozir gapirayotganlar (vid)
      silenced: new Set(),  // men oʻzim uchun ovozini oʻchirganlar (vid)
      peers: new Map(),     // vid -> ulanish
      offline: false,       // server bilan aloqa uzildi, qayta ulanishni kutyapmiz
      blocked: false        // brauzer ovozni bosishsiz chalishga ruxsat bermadi
    };
    let ice = [], relay = false, fwd = false;
    let stream = null, track = null, micErr = '';
    let actx = null, localSrc = null, localAn = null;
    let joinT = null, loopT = null;
    const talkUntil = new Map();
    const pool = [];

    // ---------- <audio> elementlari ----------
    function holder() {
      let h = document.getElementById('voice-audio');
      if (!h) {
        h = document.createElement('div');
        h.id = 'voice-audio';
        h.setAttribute('aria-hidden', 'true');
        h.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden';
        document.body.appendChild(h);
      }
      return h;
    }
    function newAudio() {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      holder().appendChild(el);
      return el;
    }
    // Faqat foydalanuvchi bosgan paytda chaqiriladi: play() qilingan element keyin ham ovoz chiqara oladi
    function prime() {
      const src = silentUrl();
      while (pool.length < POOL) {
        const el = newAudio();
        if (src) {
          try { el.src = src; const p = el.play(); if (p && p.catch) p.catch(noop); } catch (e) { /* */ }
        }
        pool.push(el);
      }
    }
    function takeAudio() { return pool.length ? pool.shift() : newAudio(); }
    function releaseAudio(el) {
      if (!el) return;
      try { el.pause(); } catch (e) { /* */ }
      el.srcObject = null;
      el.removeAttribute('src');
      el.muted = false;
      if (pool.length < POOL) pool.push(el); else el.remove();
    }
    function play(p) {
      const el = p.el;
      if (!el || !el.srcObject) return;
      el.muted = V.silenced.has(p.vid);
      let pr;
      try { pr = el.play(); } catch (e) { return; }
      if (pr && pr.catch) {
        pr.catch(function (e) {
          if (e && e.name === 'NotAllowedError' && !V.blocked && V.status === 'live') { V.blocked = true; onChange(); }
        });
      }
    }
    function attach(p, ms) {
      if (!p.el) p.el = takeAudio();
      if (p.el.srcObject !== ms) {
        p.el.removeAttribute('src');
        p.el.srcObject = ms;
      }
      play(p);
      // getSynchronizationSources boʻlmasa, ovoz balandligini Web Audio orqali oʻlchaymiz
      const rx = p.rx;
      if (!(rx && typeof rx.getSynchronizationSources === 'function') && !p.an) {
        const ctx = audioCtx();
        if (ctx) {
          try {
            p.src = ctx.createMediaStreamSource(ms);
            p.an = ctx.createAnalyser();
            p.an.fftSize = 512;
            p.src.connect(p.an);
          } catch (e) { p.an = null; }
        }
      }
    }

    function audioCtx() {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      if (!actx) { try { actx = new AC(); } catch (e) { return null; } }
      if (actx.state === 'suspended') actx.resume().catch(noop);
      return actx;
    }

    // ---------- mikrofon ----------
    function getMic() {
      const md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) {
        micErr = 'Bu ilovada mikrofon ishlamaydi — siz faqat eshitasiz';
        return Promise.resolve(null);
      }
      return md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
        .then(function (s) { micErr = ''; return s; })
        .catch(function (e) {
          const n = e && e.name;
          micErr = n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError'
            ? 'Mikrofonga ruxsat berilmadi — siz faqat eshitasiz'
            : n === 'NotFoundError' || n === 'OverconstrainedError'
              ? 'Mikrofon topilmadi — siz faqat eshitasiz'
              : n === 'NotReadableError'
                ? 'Mikrofon band (boshqa ilova ishlatyapti) — siz faqat eshitasiz'
                : 'Mikrofon yoqilmadi — siz faqat eshitasiz';
          warn('mikrofon', e);
          return null;
        });
    }

    function setStream(s) {
      stream = s;
      track = s ? s.getAudioTracks()[0] || null : null;
      V.mic = track ? 'on' : 'none';
      if (localSrc) { try { localSrc.disconnect(); } catch (e) { /* */ } }
      localSrc = localAn = null;
      if (!track) return;
      track.onended = function () { // mikrofon tortib olindi (masalan, qoʻngʻiroq)
        if (stream !== s) return;
        track = null; stream = null; V.mic = 'none';
        if (V.status === 'live') send({ t: 'voice_set', mic: false, muted: false });
        toast('Mikrofon oʻchdi — siz faqat eshitasiz');
        onChange();
      };
      const ctx = audioCtx();
      if (ctx) {
        try {
          localSrc = ctx.createMediaStreamSource(s);
          localAn = ctx.createAnalyser();
          localAn.fftSize = 512;
          localSrc.connect(localAn);
          if (cap && cap.node) localSrc.connect(cap.node);
        } catch (e) { localSrc = localAn = null; }
      }
    }

    // ---------- ulanishlar ----------
    function offerer(vid) { return !!V.me && V.me < vid; } // taklifni har doim kichik raqamli tomon yuboradi

    function makePc() {
      const conf = { iceServers: noP2P ? [] : ice, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' };
      if (relay || noP2P) conf.iceTransportPolicy = 'relay';
      try { return new RTCPeerConnection(conf); } catch (e) {
        warn('ICE sozlamasi', e);
        return new RTCPeerConnection({ iceServers: [] });
      }
    }

    function newPeer(vid, sid) {
      const p = {
        vid: vid, sid: sid, pc: makePc(), el: takeAudio(), st: 'wait', restarts: 0,
        out: [], outT: null, inQ: [], retryT: null, connT: null,
        rx: null, an: null, src: null, local: false, closed: false
      };
      const pc = p.pc;
      pc.onicecandidate = function (e) {
        if (p.closed) return;
        const c = e.candidate;
        if (c && c.candidate) {
          p.out.push(c.toJSON ? c.toJSON() : { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex });
          if (!p.outT) p.outT = setTimeout(function () { flush(p); }, 120);
        } else flush(p);
      };
      pc.ontrack = function (e) {
        if (p.closed) return;
        p.rx = e.receiver || p.rx;
        attach(p, (e.streams && e.streams[0]) || new MediaStream([e.track]));
      };
      pc.oniceconnectionstatechange = function () { if (!p.closed) iceState(p); };
      if (offerer(vid)) p.connT = setTimeout(function () { if (!p.closed && p.st !== 'ok') restart(p); }, CONNECT_TIMEOUT);
      V.peers.set(vid, p);
      return p;
    }

    function flush(p) {
      clearTimeout(p.outT); p.outT = null;
      if (p.closed || !p.out.length) return;
      const c = p.out.splice(0, 30);
      send({ t: 'rtc', to: p.vid, data: { type: 'cand', sid: p.sid, c: c } });
      if (p.out.length) p.outT = setTimeout(function () { flush(p); }, 60);
    }

    function closePeer(p) {
      if (p.closed) return;
      p.closed = true;
      clearTimeout(p.outT); clearTimeout(p.retryT); clearTimeout(p.connT);
      try {
        p.pc.onicecandidate = p.pc.ontrack = p.pc.oniceconnectionstatechange = null;
        p.pc.close();
      } catch (e) { /* */ }
      if (p.src) { try { p.src.disconnect(); } catch (e) { /* */ } }
      releaseAudio(p.el); p.el = null;
      talkUntil.delete(p.vid);
      V.talking.delete(p.vid);
    }
    function dropPeer(vid) {
      const p = V.peers.get(vid);
      if (p) { closePeer(p); V.peers.delete(vid); }
    }
    function closeAll() {
      V.peers.forEach(closePeer);
      V.peers.clear();
    }

    function startOffer(vid, restarts) {
      dropPeer(vid);
      const sid = rid();
      const p = newPeer(vid, sid);
      p.restarts = restarts || 0;
      p.local = true;
      let opt;
      if (track) p.pc.addTrack(track, stream);
      else if (p.pc.addTransceiver) p.pc.addTransceiver('audio', { direction: 'recvonly' });
      else opt = { offerToReceiveAudio: true };
      p.pc.createOffer(opt)
        .then(function (o) { if (!p.closed) return p.pc.setLocalDescription(o); })
        .then(function () {
          if (p.closed) return;
          send({ t: 'rtc', to: vid, data: { type: 'offer', sid: sid, sdp: p.pc.localDescription.sdp } });
        })
        .catch(function (e) { warn('taklif', e); retryLater(p, 2000); });
      return p;
    }

    function onOffer(from, d) {
      const old = V.peers.get(from);
      if (old && old.sid === d.sid) return; // takroriy xabar
      dropPeer(from);
      const p = newPeer(from, d.sid);
      const pc = p.pc;
      pc.setRemoteDescription({ type: 'offer', sdp: d.sdp })
        .then(function () {
          if (p.closed) return;
          p.local = true;
          if (!track) return; // mikrofon yoʻq — transiver "faqat qabul" boʻlib qoladi
          const tr = pc.getTransceivers ? pc.getTransceivers().filter(function (t) {
            return t.receiver && t.receiver.track && t.receiver.track.kind === 'audio';
          })[0] : null;
          if (tr && tr.sender && tr.sender.replaceTrack) {
            tr.direction = 'sendrecv';
            return tr.sender.replaceTrack(track);
          }
          pc.addTrack(track, stream);
        })
        .then(function () { if (p.closed) return; drain(p); return pc.createAnswer(); })
        .then(function (a) { if (!p.closed && a) return pc.setLocalDescription(a); })
        .then(function () {
          if (p.closed) return;
          send({ t: 'rtc', to: from, data: { type: 'answer', sid: d.sid, sdp: pc.localDescription.sdp } });
        })
        .catch(function (e) { warn('javob', e); });
    }

    function onAnswer(from, d) {
      const p = V.peers.get(from);
      if (!p || p.sid !== d.sid || p.pc.signalingState !== 'have-local-offer') return;
      p.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp })
        .then(function () { drain(p); })
        .catch(function (e) { warn('javobni qabul qilish', e); retryLater(p, 2000); });
    }

    function onCand(from, d) {
      const p = V.peers.get(from);
      if (!p || p.sid !== d.sid) return; // eski ulanishga tegishli
      for (let i = 0; i < d.c.length; i++) p.inQ.push(d.c[i]);
      drain(p);
    }
    function drain(p) {
      if (p.closed || !p.pc.remoteDescription) return;
      const q = p.inQ.splice(0);
      q.forEach(function (c) { p.pc.addIceCandidate(c).catch(noop); });
    }

    function iceState(p) {
      const s = p.pc.iceConnectionState;
      const was = p.st;
      if (s === 'connected' || s === 'completed') {
        p.st = 'ok'; p.restarts = 0;
        clearTimeout(p.retryT); p.retryT = null;
        clearTimeout(p.connT); p.connT = null;
        if (was !== 'ok') readPath(p);
      } else if (s === 'failed') { p.st = 'fail'; retryLater(p, 1000); }
      else if (s === 'disconnected') { p.st = 'wait'; retryLater(p, 5000); }
      else if (s !== 'closed' && p.st !== 'fail') p.st = 'wait';
      if (p.st !== was) { syncFwd(); queueStat(); onChange(); }
    }
    function retryLater(p, ms) {
      if (p.closed || p.retryT || !offerer(p.vid)) return;
      p.retryT = setTimeout(function () {
        p.retryT = null;
        if (!p.closed && p.st !== 'ok') restart(p);
      }, ms);
    }
    function restart(p) {
      if (p.closed || !offerer(p.vid) || V.status !== 'live') return;
      if (p.restarts >= MAX_RESTARTS) {
        if (p.st !== 'fail') { p.st = 'fail'; queueStat(); onChange(); }
        return;
      }
      startOffer(p.vid, p.restarts + 1);
      syncFwd();
      onChange();
    }

    // ---------- roʻyxat va signallar ----------
    function entry(vid) {
      for (let i = 0; i < V.roster.length; i++) if (V.roster[i].v === vid) return V.roster[i];
      return null;
    }

    function setRoster(msg) {
      if (!msg || !Array.isArray(msg.roster)) return;
      V.roster = msg.roster;
      const me = msg.me || null;
      if (V.status === 'joining') {
        if (me && !V.offline) {
          V.status = 'live';
          V.me = me;
          clearTimeout(joinT); joinT = null;
          fwdKey = ''; statKey = '';
          startLoop();
          haptic('light');
        }
      } else if (V.status === 'live') {
        if (!me) { stop('removed'); return; }
        if (me !== V.me) { closeAll(); V.me = me; fwdKey = ''; statKey = ''; }
      }
      if (V.status === 'live') { sync(); syncFwd(); queueStat(); }
      onChange();
    }

    function sync() {
      const here = new Set();
      V.roster.forEach(function (r) {
        if (r.v === V.me) return;
        here.add(r.v);
        if (!V.peers.has(r.v) && offerer(r.v)) startOffer(r.v, 0);
      });
      V.peers.forEach(function (p, vid) { if (!here.has(vid)) dropPeer(vid); });
      rx.forEach(function (R, vid) { if (!here.has(vid)) dropRx(vid); });
      V.silenced.forEach(function (vid) { if (!here.has(vid)) V.silenced.delete(vid); });
    }

    function signal(from, d) {
      if (V.status !== 'live' || !from || !d || from === V.me) return;
      if (d.type === 'offer') onOffer(from, d);
      else if (d.type === 'answer') onAnswer(from, d);
      else if (d.type === 'cand' && Array.isArray(d.c)) onCand(from, d);
    }

    function onMessage(m) {
      switch (m.t) {
        case 'voice': setRoster(m); return true;
        case 'voice_cfg':
          ice = Array.isArray(m.ice) ? m.ice : [];
          relay = !!m.relay;
          fwd = !!m.fwd && !!ADPCM;
          if (m.max) V.max = m.max;
          return true;
        case 'voice_end': end(m.reason); return true;
        case 'rtc': signal(m.from, m.data); return true;
      }
      return false;
    }

    function end(reason) {
      if (V.status === 'off') return;
      stop(reason);
      if (reason === 'elsewhere') toast('Ovozli chat boshqa qurilmangizda ochildi');
      else if (reason === 'full') toast('Ovozli chat toʻla — bir vaqtda ' + V.max + ' kishigacha');
      else if (reason === 'noroom') toast('Avval stolga kiring');
    }

    // ---------- server orqali ovoz ----------
    // Kimga yuboramiz: roʻyxatdagi, lekin men bilan toʻgʻridan-toʻgʻri ulanmaganlarga
    let fwdTo = [], fwdKey = '';
    let cap = null;            // mikrofon namunalari: { node, sink, buf, n, st, seq, loudAt, prev }
    const rx = new Map();      // vid -> { next, gain, level, heardAt, n }
    let out = null;            // { master, dest, a, b, el, loop, t, ice, playing }
    let bufRate = FWD_RATE;    // AudioBuffer 16 kHz qabul qilmasa — kontekst chastotasida
    let dropped = 0;
    let statT = null, statKey = '';

    function linkOk(vid) { const p = V.peers.get(vid); return !!p && p.st === 'ok'; }

    // Juftlik holati (UI va diagnostika uchun): ok — toʻgʻridan, fwd — server orqali
    function linkState(vid) {
      const p = V.peers.get(vid);
      if (p && p.st === 'ok') return 'ok';
      if (fwd) return 'fwd';
      return p ? p.st : 'wait';
    }

    function syncFwd() {
      const to = [];
      if (fwd && V.status === 'live' && track) {
        V.roster.forEach(function (r) { if (r.v !== V.me && !linkOk(r.v)) to.push(r.v); });
      }
      fwdTo = to;
      const key = to.join(',');
      if (V.status === 'live' && key !== fwdKey) { fwdKey = key; send({ t: 'voice_fwd', to: to }); }
      if (to.length) ensureCapture();
    }

    function ensureCapture() {
      if (cap || !localSrc || !actx) return;
      const ctx = actx;
      const c = cap = {
        node: null, sink: null, n: 0, st: { p: 0, i: 0 }, seq: 0, loudAt: 0, prev: null,
        buf: new Float32Array(Math.max(160, Math.round(ctx.sampleRate * FWD_FRAME / FWD_RATE)))
      };
      try {
        c.sink = ctx.createGain();
        c.sink.gain.value = 0; // namuna olish tuguni ishlashi uchun chiqishga ulanadi, lekin ovoz chiqarmaydi
        c.sink.connect(ctx.destination);
      } catch (e) { cap = null; return; }
      const legacy = function () {
        if (cap !== c || c.node) return;
        try {
          const n = ctx.createScriptProcessor(2048, 1, 1);
          n.onaudioprocess = function (e) { onCapture(c, e.inputBuffer.getChannelData(0)); };
          attachCap(c, n);
        } catch (e) { warn('mikrofon (server orqali)', e); }
      };
      if (ctx.audioWorklet && typeof root.AudioWorkletNode === 'function') {
        if (!ctx.__buraCap) ctx.__buraCap = ctx.audioWorklet.addModule('/voice-worklet.js' + VER);
        ctx.__buraCap.then(function () {
          if (cap !== c) return;
          const n = new root.AudioWorkletNode(ctx, 'bura-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
          n.port.onmessage = function (e) { onCapture(c, e.data); };
          attachCap(c, n);
        }).catch(function (e) { warn('worklet', e); legacy(); });
      } else legacy();
    }
    function attachCap(c, n) {
      c.node = n;
      try {
        if (localSrc) localSrc.connect(n);
        n.connect(c.sink);
      } catch (e) { warn('mikrofon ulanishi', e); }
    }

    function onCapture(c, chunk) {
      if (cap !== c) return;
      if (!fwdTo.length || !track || !track.enabled || V.status !== 'live') { c.n = 0; c.prev = null; c.loudAt = 0; return; }
      let i = 0;
      while (i < chunk.length) {
        const k = Math.min(chunk.length - i, c.buf.length - c.n);
        c.buf.set(chunk.subarray(i, i + k), c.n);
        c.n += k; i += k;
        if (c.n === c.buf.length) { c.n = 0; fwdFrame(c); }
      }
    }
    function fwdFrame(c) {
      const pcm = ADPCM.resample(c.buf, FWD_FRAME);
      const now = Date.now();
      if (ADPCM.rms(pcm) > FWD_LOUD) c.loudAt = now;
      if (now - c.loudAt > FWD_HANG) { c.prev = pcm; return; } // jimlik yuborilmaydi
      if (c.prev) { sendFrame(c, c.prev); c.prev = null; }   // soʻz boshi kesilmasin
      sendFrame(c, pcm);
    }
    function sendFrame(c, pcm) {
      const u8 = new Uint8Array(3 + ADPCM.HEAD + FWD_FRAME / 2);
      u8[0] = FWD_TAG;
      u8[1] = c.seq & 255;
      u8[2] = (c.seq >> 8) & 255;
      c.seq = (c.seq + 1) & 0xffff;
      ADPCM.encode(pcm, c.st, u8, 3);
      sendBin(u8);
    }

    // Serverdan kelgan kadr: [0xA1][yuboruvchi vid 5 bayt][tartib raqami 2 bayt][ADPCM]
    function onBinary(data) {
      if (!ADPCM || V.status !== 'live' || !data) return;
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (u8.length < 8 + ADPCM.HEAD + 2 || u8[0] !== FWD_TAG) return;
      let vid = '';
      for (let k = 1; k < 6; k++) vid += (u8[k] < 16 ? '0' : '') + u8[k].toString(16);
      if (vid === V.me || !entry(vid) || linkOk(vid)) return; // toʻgʻridan-toʻgʻri eshityapmiz
      const ctx = audioCtx();
      if (!ctx) return;
      if (ctx.state !== 'running') {
        if (++dropped > 25 && !V.blocked) { V.blocked = true; onChange(); } // ~1 soniya — bosish kerak
        return;
      }
      dropped = 0;
      let R = rx.get(vid);
      if (!R) {
        const node = outNode();
        if (!node) return;
        R = { next: 0, gain: ctx.createGain(), level: 0, heardAt: 0, n: 0 };
        R.gain.gain.value = V.silenced.has(vid) ? 0 : 1;
        R.gain.connect(node);
        rx.set(vid, R);
        onChange();
      }
      const pcm = ADPCM.decode(u8, 8);
      R.level = ADPCM.rms(pcm);
      R.heardAt = Date.now();
      R.n++;
      const b = makeBuf(ctx, pcm);
      if (!b) return;
      const now = ctx.currentTime;
      if (R.next < now + 0.02 || R.next > now + MAX_LAG) R.next = now + JITTER;
      const src = ctx.createBufferSource();
      src.buffer = b;
      src.connect(R.gain);
      src.start(R.next);
      R.next += b.duration;
    }
    function makeBuf(ctx, pcm) {
      if (bufRate === FWD_RATE) {
        try {
          const b = ctx.createBuffer(1, pcm.length, FWD_RATE);
          b.getChannelData(0).set(pcm);
          return b;
        } catch (e) { bufRate = ctx.sampleRate; } // eski WebKit: 22050 dan past chastota yoʻq
      }
      const n = Math.round(pcm.length * bufRate / FWD_RATE);
      try {
        const b = ctx.createBuffer(1, n, bufRate);
        b.getChannelData(0).set(ADPCM.resample(pcm, n));
        return b;
      } catch (e) { return null; }
    }
    function dropRx(vid) {
      const R = rx.get(vid);
      if (!R) return;
      try { R.gain.disconnect(); } catch (e) { /* */ }
      rx.delete(vid);
    }

    // Chrome Web Audio orqali chalingan ovozni aks-sadoni oʻchirishda (AEC) hisobga olmaydi — mikrofon uni qaytarib
    // yuboradi. Shuning uchun ovoz mahalliy WebRTC halqasidan oʻtkazilib, <audio> orqali chalinadi: buni AEC koʻradi.
    // Halqa ulanguncha (yoki ulanmasa) ovoz toʻgʻridan-toʻgʻri chalinadi.
    function outNode() {
      if (out) return out.master;
      const ctx = audioCtx();
      if (!ctx) return null;
      const o = out = { master: ctx.createGain(), an: null, dest: null, a: null, b: null, el: null, loop: false, t: null, ice: false, playing: false };
      o.master.connect(ctx.destination);
      try { o.an = ctx.createAnalyser(); o.an.fftSize = 512; o.master.connect(o.an); } catch (e) { o.an = null; }
      if (ctx.createMediaStreamDestination && supported()) startEchoLoop(ctx, o);
      return o.master;
    }
    function startEchoLoop(ctx, o) {
      try {
        o.dest = ctx.createMediaStreamDestination();
        o.master.connect(o.dest);
        const a = o.a = new RTCPeerConnection();
        const b = o.b = new RTCPeerConnection();
        a.onicecandidate = function (e) { if (e.candidate) b.addIceCandidate(e.candidate).catch(noop); };
        b.onicecandidate = function (e) { if (e.candidate) a.addIceCandidate(e.candidate).catch(noop); };
        b.ontrack = function (e) {
          if (out !== o) return;
          if (!o.el) o.el = takeAudio();
          o.el.removeAttribute('src');
          o.el.srcObject = (e.streams && e.streams[0]) || new MediaStream([e.track]);
          o.el.muted = false;
          const pr = o.el.play();
          if (pr && pr.then) pr.then(function () { o.playing = true; loopReady(ctx, o); }).catch(noop);
          else { o.playing = true; loopReady(ctx, o); }
        };
        b.oniceconnectionstatechange = function () {
          if (out !== o) return;
          const st = b.iceConnectionState;
          if (st === 'connected' || st === 'completed') { o.ice = true; loopReady(ctx, o); }
          else if (st === 'failed' || st === 'closed') loopOff(o);
        };
        o.dest.stream.getAudioTracks().forEach(function (t) { a.addTrack(t, o.dest.stream); });
        a.createOffer()
          .then(function (d) { return a.setLocalDescription(d); })
          .then(function () { return b.setRemoteDescription(a.localDescription); })
          .then(function () { return b.createAnswer(); })
          .then(function (d) { return b.setLocalDescription(d); })
          .then(function () { return a.setRemoteDescription(b.localDescription); })
          .catch(function (e) { warn('ovoz halqasi', e); loopOff(o); });
        o.t = setTimeout(function () { if (!o.loop) loopOff(o); }, LOOP_TIMEOUT);
      } catch (e) { warn('ovoz halqasi', e); loopOff(o); }
    }
    function loopReady(ctx, o) {
      if (o.loop || !o.ice || !o.playing || out !== o) return;
      o.loop = true;
      clearTimeout(o.t);
      try { o.master.disconnect(ctx.destination); } catch (e) { /* */ }
    }
    function loopOff(o) {
      clearTimeout(o.t);
      if (o.loop && actx) { try { o.master.connect(actx.destination); } catch (e) { /* */ } }
      o.loop = false;
      [o.a, o.b].forEach(function (pc) {
        if (!pc) return;
        try { pc.onicecandidate = pc.ontrack = pc.oniceconnectionstatechange = null; pc.close(); } catch (e) { /* */ }
      });
      o.a = o.b = null;
      if (o.dest) { try { o.master.disconnect(o.dest); } catch (e) { /* */ } o.dest = null; }
      releaseAudio(o.el); o.el = null;
    }

    function fwdStop() {
      fwdTo = []; fwdKey = ''; statKey = '';
      clearTimeout(statT); statT = null;
      if (cap) {
        const c = cap;
        cap = null;
        if (c.node) {
          if (c.node.port) c.node.port.onmessage = null;
          c.node.onaudioprocess = null;
          try { if (localSrc) localSrc.disconnect(c.node); } catch (e) { /* */ }
          try { c.node.disconnect(); } catch (e) { /* */ }
        }
        if (c.sink) { try { c.sink.disconnect(); } catch (e) { /* */ } }
      }
      rx.forEach(function (R, vid) { dropRx(vid); });
      if (out) {
        const o = out;
        loopOff(o);
        out = null;
        try { o.master.disconnect(); } catch (e) { /* */ }
      }
      dropped = 0;
    }

    // ---------- diagnostika: kim kim bilan qanday ulangani serverga (Render loglari) ----------
    function readPath(p) {
      if (!p.pc.getStats) return;
      p.pc.getStats().then(function (rep) {
        if (p.closed) return;
        const by = {};
        let pair = null;
        rep.forEach(function (s) { by[s.id] = s; });
        rep.forEach(function (s) { if (!pair && s.type === 'transport' && s.selectedCandidatePairId) pair = by[s.selectedCandidatePairId]; });
        if (!pair) rep.forEach(function (s) { if (!pair && s.type === 'candidate-pair' && s.state === 'succeeded' && (s.nominated || s.selected)) pair = s; });
        const kind = function (c) { return c && /^(host|srflx|prflx|relay)$/.test(c.candidateType) ? c.candidateType : ''; };
        const l = kind(pair && by[pair.localCandidateId]), r = kind(pair && by[pair.remoteCandidateId]);
        p.path = l && r ? l + '/' + r : '';
        queueStat();
      }).catch(noop);
    }
    function queueStat() {
      if (statT || V.status !== 'live') return;
      statT = setTimeout(function () {
        statT = null;
        if (V.status !== 'live') return;
        const peers = V.roster.filter(function (r) { return r.v !== V.me; }).map(function (r) {
          const p = V.peers.get(r.v);
          return { v: r.v, st: linkState(r.v), path: (p && p.st === 'ok' && p.path) || '' };
        });
        const key = JSON.stringify(peers);
        if (!peers.length || key === statKey) return;
        statKey = key;
        send({ t: 'voice_stat', peers: peers });
      }, STAT_DELAY);
    }

    // ---------- kim gapiryapti ----------
    function startLoop() { if (!loopT) loopT = setInterval(sample, 140); }
    function stopLoop() {
      clearInterval(loopT); loopT = null;
      talkUntil.clear();
      V.talking.clear();
    }
    function mark(vid, on, now) {
      if (on) talkUntil.set(vid, now + HOLD);
      const t = (talkUntil.get(vid) || 0) > now;
      if (t === V.talking.has(vid)) return false;
      if (t) V.talking.add(vid); else V.talking.delete(vid);
      return true;
    }
    function remoteLevel(p) {
      const rx = p.rx || (p.pc.getReceivers && p.pc.getReceivers()[0]);
      if (rx && typeof rx.getSynchronizationSources === 'function') {
        let lv = 0;
        const ss = rx.getSynchronizationSources();
        const nowHR = root.performance && performance.timeOrigin ? performance.timeOrigin + performance.now() : 0;
        for (let i = 0; i < ss.length; i++) {
          const s = ss[i], age = nowHR && s.timestamp ? nowHR - s.timestamp : 0;
          if (age > 1500 && age < 60000) continue; // eskirgan maʼlumot
          if (typeof s.audioLevel === 'number' && s.audioLevel > lv) lv = s.audioLevel;
        }
        return lv;
      }
      return p.an ? meter(p.an) * 1.4 : 0;
    }
    function sample() {
      if (V.status !== 'live') return;
      const now = Date.now();
      let changed = false;
      if (V.me) changed = mark(V.me, !!(track && track.enabled && localAn) && meter(localAn) > TALK_LOCAL, now) || changed;
      V.roster.forEach(function (r) {
        if (r.v === V.me) return;
        const p = V.peers.get(r.v), R = rx.get(r.v);
        let lv = 0;
        if (p && p.st === 'ok') lv = remoteLevel(p);
        else if (R && now - R.heardAt < 300) lv = R.level;
        changed = mark(r.v, r.mic !== false && !r.muted && lv > TALK_REMOTE, now) || changed;
      });
      talkUntil.forEach(function (t, vid) { if (vid !== V.me && !entry(vid)) { talkUntil.delete(vid); if (V.talking.delete(vid)) changed = true; } });
      if (changed) onChange('talk');
    }

    // ---------- foydalanuvchi amallari ----------
    function sendJoin() {
      send({ t: 'voice_join', mic: !!track, muted: !!track && !track.enabled });
      clearTimeout(joinT);
      joinT = setTimeout(function () {
        if (V.status === 'joining' && !V.offline) {
          stop('timeout');
          toast('Ovozli chatga ulanib boʻlmadi. Keyinroq qayta urinib koʻring');
        }
      }, JOIN_TIMEOUT);
    }

    // Bosish paytida chaqiriladi (iOS/Android ovoz chalishga faqat shunda ruxsat beradi)
    function join() {
      if (V.status !== 'off') return;
      if (!supported()) { toast('Bu qurilmada ovozli chat ishlamaydi'); return; }
      V.status = 'joining'; V.offline = false; V.blocked = false;
      prime();
      audioCtx();
      onChange();
      getMic().then(function (s) {
        if (V.status !== 'joining') { if (s) s.getTracks().forEach(stopTrack); return; } // bekor qilindi
        setStream(s);
        if (!s) toast(micErr);
        sendJoin();
        onChange();
      });
    }

    // Mikrofonsiz qoʻshilish: stolga oʻtirgan kishi boshqalarni darhol eshitadi.
    // Mikrofon soʻralmaydi; 🎙 tugmasi bosilsa — mikrofon yoqiladi.
    function listen() {
      if (V.status !== 'off' || !supported()) return;
      V.status = 'joining'; V.offline = false; V.blocked = false;
      prime();
      audioCtx();
      setStream(null);
      sendJoin();
      onChange();
    }

    function stop(reason) {
      if (V.status === 'off') return;
      if (reason === 'user' && !V.offline) send({ t: 'voice_leave' });
      V.status = 'off'; V.offline = false; V.me = null; V.blocked = false;
      clearTimeout(joinT); joinT = null;
      closeAll();
      fwdStop();
      stopLoop();
      if (stream) stream.getTracks().forEach(stopTrack);
      setStream(null);
      if (actx && actx.state === 'running' && actx.suspend) actx.suspend().catch(noop);
      onChange();
    }

    function toggleMic() {
      unlock();
      if (V.status === 'off') return join();
      if (V.status === 'joining') return stop('user'); // bekor qilish
      if (!track) return retryMic();
      track.enabled = !track.enabled;
      V.mic = track.enabled ? 'on' : 'muted';
      if (cap) { cap.n = 0; cap.prev = null; cap.loudAt = 0; }
      if (!track.enabled) { talkUntil.delete(V.me); V.talking.delete(V.me); }
      send({ t: 'voice_set', mic: true, muted: !track.enabled });
      haptic(track.enabled ? 'light' : 'select');
      onChange();
    }

    // "Faqat eshitish" holatidan mikrofonni yoqish: ulanishlar qaytadan quriladi
    function retryMic() {
      getMic().then(function (s) {
        if (V.status !== 'live') { if (s) s.getTracks().forEach(stopTrack); return; }
        if (!s) { toast(micErr); return; }
        setStream(s);
        closeAll();
        send({ t: 'voice_leave' });
        V.status = 'joining';
        V.me = null;
        stopLoop();
        sendJoin();
        onChange();
      });
    }

    function unlock() {
      if (V.status === 'off') return;
      prime();
      if (actx && actx.state === 'suspended') actx.resume().catch(noop);
      V.peers.forEach(play);
      if (out && out.el) { const pr = out.el.play(); if (pr && pr.catch) pr.catch(noop); }
      dropped = 0;
      if (V.blocked) { V.blocked = false; onChange(); }
    }

    function silence(vid) {
      if (V.silenced.has(vid)) V.silenced.delete(vid); else V.silenced.add(vid);
      const p = V.peers.get(vid);
      if (p && p.el) p.el.muted = V.silenced.has(vid);
      const R = rx.get(vid);
      if (R) R.gain.gain.value = V.silenced.has(vid) ? 0 : 1;
      onChange();
    }

    // Server bilan aloqa uzildi: ulanishlar yopiladi, mikrofon esa saqlanadi
    function onClose() {
      if (V.status === 'off') return;
      V.offline = true;
      V.status = 'joining';
      V.me = null;
      clearTimeout(joinT); joinT = null;
      closeAll();
      fwdTo = []; fwdKey = ''; statKey = '';
      rx.forEach(function (R, vid) { dropRx(vid); });
      stopLoop();
      onChange();
    }
    // Aloqa tiklandi (hello yuborilgandan keyin chaqiriladi)
    function onOpen() {
      if (V.status === 'off' || !V.offline) return;
      V.offline = false;
      sendJoin();
      onChange();
    }

    // Ilova fonga oʻtib qaytganda ovoz konteksti toʻxtab qolishi mumkin (iOS) — qayta yoqamiz
    if (root.document && document.addEventListener) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && V.status !== 'off' && actx && actx.state !== 'running' && actx.resume) actx.resume().catch(noop);
      });
    }

    return {
      state: V,
      join: join,
      listen: listen,
      leave: function () { stop('user'); },
      reset: function () { stop('reset'); },
      toggleMic: toggleMic,
      unlock: unlock,
      silence: silence,
      onMessage: onMessage,
      onBinary: onBinary,
      setRoster: setRoster,
      onOpen: onOpen,
      onClose: onClose,
      entry: entry,
      peerState: function (vid) { return V.status === 'live' ? linkState(vid) : null; },
      // sinov uchun: server orqali qabul qilingan kadrlar
      fwdStats: function () {
        const o = {};
        rx.forEach(function (R, vid) { o[vid] = { n: R.n, level: R.level }; });
        return {
          to: fwdTo.slice(), rx: o, capture: !!(cap && cap.node), sent: cap ? cap.seq : 0,
          loop: !!(out && out.loop), loopPlaying: !!(out && out.el && out.el.srcObject && !out.el.paused),
          outLevel: out && out.an ? meter(out.an) : 0
        };
      }
    };
  }

  root.BuraVoice = { create: create, supported: supported };
})(window);
