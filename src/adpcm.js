/* Bura — server orqali ovoz uchun oddiy kodek (IMA ADPCM, 4 bit) va chastota oʻzgartirish.
   Ham brauzerda (window.BuraADPCM), ham Node'da (testlar) ishlaydi.

   Kadr: [bashorat int16 LE][qadam indeksi][0][har bayt — 2 ta namuna (avval kichik yarmi)]
   Har kadr oʻz holatini oʻzi bilan olib yuradi — bitta kadr yoʻqolsa, keyingilari buzilmaydi. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BuraADPCM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STEPS = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
    130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060,
    1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
    7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
  ];
  const IDX = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
  const HEAD = 4;

  function clampIdx(i) { return i < 0 ? 0 : i > 88 ? 88 : i; }

  // pcm: Float32Array (−1…1). st: { p, i } — kodlovchi holati (kadrdan kadrga saqlanadi)
  function encode(pcm, st, out, off) {
    const n = pcm.length;
    off = off || 0;
    out = out || new Uint8Array(off + HEAD + ((n + 1) >> 1));
    let p = st.p | 0, i = clampIdx(st.i | 0);
    out[off] = p & 255;
    out[off + 1] = (p >> 8) & 255;
    out[off + 2] = i;
    out[off + 3] = 0;
    let o = off + HEAD, lo = -1;
    for (let k = 0; k < n; k++) {
      let x = pcm[k];
      x = x >= 1 ? 32767 : x <= -1 ? -32768 : Math.round(x * 32767);
      const step = STEPS[i];
      let diff = x - p, code = 0;
      if (diff < 0) { code = 8; diff = -diff; }
      let delta = step >> 3;
      if (diff >= step) { code |= 4; diff -= step; delta += step; }
      if (diff >= (step >> 1)) { code |= 2; diff -= step >> 1; delta += step >> 1; }
      if (diff >= (step >> 2)) { code |= 1; delta += step >> 2; }
      p = code & 8 ? p - delta : p + delta;
      if (p > 32767) p = 32767; else if (p < -32768) p = -32768;
      i = clampIdx(i + IDX[code]);
      if (lo < 0) lo = code;
      else { out[o++] = lo | (code << 4); lo = -1; }
    }
    if (lo >= 0) out[o++] = lo;
    st.p = p;
    st.i = i;
    return out;
  }

  // u8[off…] — bitta kadr. Natija: Float32Array (namunalar soni = 2 × maʼlumot baytlari)
  function decode(u8, off) {
    off = off || 0;
    const len = u8.length - off - HEAD;
    if (len <= 0) return new Float32Array(0);
    const out = new Float32Array(len * 2);
    let p = u8[off] | (u8[off + 1] << 8);
    if (p & 0x8000) p -= 0x10000;
    let i = clampIdx(u8[off + 2]);
    let o = 0;
    for (let k = off + HEAD; k < u8.length; k++) {
      const b = u8[k];
      for (let h = 0; h < 2; h++) {
        const code = h ? b >> 4 : b & 15;
        const step = STEPS[i];
        let delta = step >> 3;
        if (code & 4) delta += step;
        if (code & 2) delta += step >> 1;
        if (code & 1) delta += step >> 2;
        p = code & 8 ? p - delta : p + delta;
        if (p > 32767) p = 32767; else if (p < -32768) p = -32768;
        i = clampIdx(i + IDX[code]);
        out[o++] = p / 32768;
      }
    }
    return out;
  }

  // Chastotani oʻzgartirish: n ta namunaga. Kamaytirishda — oraliq oʻrtachasi (oddiy past chastota filtri),
  // oshirishda — chiziqli oraliq qiymat.
  function resample(src, n) {
    const dst = new Float32Array(n);
    const m = src.length;
    if (!m || !n) return dst;
    if (m === n) { dst.set(src); return dst; }
    const ratio = m / n;
    if (ratio < 1) {
      for (let k = 0; k < n; k++) {
        const x = k * ratio, j = Math.floor(x), f = x - j;
        const a = src[j], b = j + 1 < m ? src[j + 1] : a;
        dst[k] = a + (b - a) * f;
      }
      return dst;
    }
    for (let k = 0; k < n; k++) {
      const a = Math.floor(k * ratio);
      const b = Math.min(m, Math.max(a + 1, Math.floor((k + 1) * ratio)));
      let sum = 0;
      for (let j = a; j < b; j++) sum += src[j];
      dst[k] = sum / (b - a);
    }
    return dst;
  }

  function rms(x) {
    let s = 0;
    for (let k = 0; k < x.length; k++) s += x[k] * x[k];
    return x.length ? Math.sqrt(s / x.length) : 0;
  }

  return { encode: encode, decode: decode, resample: resample, rms: rms, HEAD: HEAD };
});
