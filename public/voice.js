/* Bura — ovozli chat.
   Har bir ishtirokchi qolganlarning har biri bilan toʻgʻridan-toʻgʻri (WebRTC) ulanadi.
   Server faqat kim qoʻshilganini aytadi va ulanish xabarlarini uzatadi — ovoz serverdan oʻtmaydi. */
(function (root) {
  'use strict';

  const TALK_LOCAL = 0.025;    // mahalliy mikrofon: RMS chegarasi
  const TALK_REMOTE = 0.02;    // boshqalar: RTP audioLevel chegarasi (taxminan −34 dBov)
  const HOLD = 450;            // gapirish belgisi soʻz tugagach shuncha ms saqlanadi
  const JOIN_TIMEOUT = 12000;
  const CONNECT_TIMEOUT = 15000;
  const MAX_RESTARTS = 4;
  const POOL = 6;

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
    let ice = [], relay = false;
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
        } catch (e) { localSrc = localAn = null; }
      }
    }

    // ---------- ulanishlar ----------
    function offerer(vid) { return !!V.me && V.me < vid; } // taklifni har doim kichik raqamli tomon yuboradi

    function makePc() {
      const conf = { iceServers: ice, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' };
      if (relay) conf.iceTransportPolicy = 'relay';
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
      } else if (s === 'failed') { p.st = 'fail'; retryLater(p, 1000); }
      else if (s === 'disconnected') { p.st = 'wait'; retryLater(p, 5000); }
      else if (s !== 'closed' && p.st !== 'fail') p.st = 'wait';
      if (p.st !== was) onChange();
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
        if (p.st !== 'fail') { p.st = 'fail'; onChange(); }
        return;
      }
      startOffer(p.vid, p.restarts + 1);
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
          startLoop();
          haptic('light');
        }
      } else if (V.status === 'live') {
        if (!me) { stop('removed'); return; }
        if (me !== V.me) { closeAll(); V.me = me; }
      }
      if (V.status === 'live') sync();
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
      V.peers.forEach(function (p) {
        const r = entry(p.vid);
        const on = p.st === 'ok' && !!r && r.mic !== false && !r.muted && remoteLevel(p) > TALK_REMOTE;
        changed = mark(p.vid, on, now) || changed;
      });
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

    function stop(reason) {
      if (V.status === 'off') return;
      if (reason === 'user' && !V.offline) send({ t: 'voice_leave' });
      V.status = 'off'; V.offline = false; V.me = null; V.blocked = false;
      clearTimeout(joinT); joinT = null;
      closeAll();
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
      if (V.blocked) { V.blocked = false; onChange(); }
    }

    function silence(vid) {
      if (V.silenced.has(vid)) V.silenced.delete(vid); else V.silenced.add(vid);
      const p = V.peers.get(vid);
      if (p && p.el) p.el.muted = V.silenced.has(vid);
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

    return {
      state: V,
      join: join,
      leave: function () { stop('user'); },
      reset: function () { stop('reset'); },
      toggleMic: toggleMic,
      unlock: unlock,
      silence: silence,
      onMessage: onMessage,
      setRoster: setRoster,
      onOpen: onOpen,
      onClose: onClose,
      entry: entry,
      peerState: function (vid) { const p = V.peers.get(vid); return p ? p.st : null; }
    };
  }

  root.BuraVoice = { create: create, supported: supported };
})(window);
