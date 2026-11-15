/* Labo à maquettes — analyse audio (tempo, beatbox, hauteur, notes, accords, auto-tune, wav) */
(function (root) {
  "use strict";
  const DSP = {};

  /* ---------- utilitaires ---------- */
  const median = a => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  DSP.median = median;
  DSP.midiToHz = m => 440 * Math.pow(2, (m - 69) / 12);
  DSP.hzToMidi = f => 69 + 12 * Math.log2(f / 440);
  DSP.NOTE_NAMES = ['Do', 'Do#', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si'];

  /* ---------- beatbox : détection des coups ---------- */
  DSP.detectEvents = function (x, sr) {
    const y = new Float32Array(x.length); const a = Math.exp(-2 * Math.PI * 70 / sr); let px = 0, py = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i]; py = a * (py + v - px); px = v; y[i] = py; }
    const hop = Math.round(sr * .005), win = hop * 2, nf = Math.floor((y.length - win) / hop); if (nf < 20) return [];
    const L = new Float32Array(nf); let mx = -300;
    for (let f = 0; f < nf; f++) { let s = 0; const o = f * hop; for (let j = 0; j < win; j++) s += y[o + j] * y[o + j]; L[f] = 10 * Math.log10(s / win + 1e-12); if (L[f] > mx) mx = L[f]; }
    const floor = mx - 30; const O = new Float32Array(nf); let oMax = 0;
    for (let f = 3; f < nf; f++) { const prev = (L[f - 1] + L[f - 2] + L[f - 3]) / 3; O[f] = L[f] < floor ? 0 : Math.max(0, L[f] - prev); if (O[f] > oMax) oMax = O[f]; }
    const thr = Math.max(4, oMax * .22); const ev = []; let last = -1e9;
    for (let f = 3; f < nf - 3; f++) {
      if (O[f] < thr) continue; let isMax = true; for (let d = -3; d <= 3; d++) if (O[f + d] > O[f]) isMax = false; if (!isMax) continue;
      const t = f * hop / sr; if (t - last < .09) continue;
      let pk = -300; for (let d = 0; d < 10 && f + d < nf; d++) pk = Math.max(pk, L[f + d]); if (pk < floor + 6) continue;
      const s0 = f * hop + Math.round(sr * .008), s1 = Math.min(y.length, s0 + Math.round(sr * .04)); if (s1 - s0 < 50) continue;
      let amp = 0; for (let i = s0; i < s1; i++) amp = Math.max(amp, Math.abs(y[i])); const th = amp * .06; let sg = 0, zc = 0;
      for (let i = s0; i < s1; i++) { const v = y[i]; if (v > th) { if (sg < 0) zc++; sg = 1; } else if (v < -th) { if (sg > 0) zc++; sg = -1; } }
      const hz = zc / 2 / ((s1 - s0) / sr);
      ev.push({ t, hz, type: hz < 1300 ? 'k' : 's' }); last = t;
    }
    const nz = ev.filter(e => e.type === 's');
    if (nz.length >= 2) {
      const lg = nz.map(e => Math.log(e.hz)).sort((a, b) => a - b); let c1 = lg[0], c2 = lg[lg.length - 1];
      for (let it = 0; it < 12; it++) { const m = (c1 + c2) / 2, A = lg.filter(v => v <= m), B = lg.filter(v => v > m); if (!A.length || !B.length) break; c1 = A.reduce((p, q) => p + q) / A.length; c2 = B.reduce((p, q) => p + q) / B.length; }
      if (c2 - c1 > Math.log(1.45)) { const m = (c1 + c2) / 2; nz.forEach(e => { if (Math.log(e.hz) > m) e.type = 'h'; }); }
    }
    return ev;
  };

  DSP.estimateBPM = function (times) {
    const fs = 200, N = Math.ceil((times[times.length - 1] + .6) * fs); const e = new Float32Array(N + 16);
    times.forEach(t => { const c = Math.round(t * fs); for (let d = -7; d <= 7; d++) { const i = c + d; if (i >= 0 && i < e.length) e[i] += Math.exp(-(d * d) / 18); } });
    const ac = L => { const l0 = Math.floor(L), fr = L - l0; let s = 0, n = 0; for (let i = 0; i + l0 + 1 < e.length; i++) { s += e[i] * (e[i + l0] * (1 - fr) + e[i + l0 + 1] * fr); n++; } return n ? s / n : 0; };
    let best = null, bs = -1;
    for (let b = 60; b <= 200; b += .5) {
      const L = 60 / b * fs; if (L > e.length * .75) continue;
      let s = ac(L) + (2 * L < e.length * .8 ? .5 * ac(2 * L) : 0) + .25 * ac(L / 2);
      s *= Math.exp(-.5 * Math.pow(Math.log2(b / 112) / .75, 2)); if (s > bs) { bs = s; best = b; }
    }
    return best;
  };

  /* renvoie {bpm, groove:{k,s,h,types}, evts} ; fixedBpm optionnel = garder le tempo du morceau */
  DSP.analyzeGroove = function (evts, fixedBpm) {
    evts = evts.slice().sort((a, b) => a.t - b.t); if (evts.length < 3) return null;
    const t0 = evts[0].t; let bpm = fixedBpm || DSP.estimateBPM(evts.map(e => e.t - t0)); if (!bpm) return null;
    const anchorEv = evts.find(e => e.type === 'k') || evts[0];
    let sd = 60 / bpm / 4; let idx = evts.map(e => Math.round((e.t - anchorEv.t) / sd)); const n = evts.length;
    if (n >= 4 && !fixedBpm) {
      let mx = 0, my = 0; idx.forEach((v, i) => { mx += v; my += evts[i].t; }); mx /= n; my /= n; let sxy = 0, sxx = 0;
      idx.forEach((v, i) => { sxy += (v - mx) * (evts[i].t - my); sxx += (v - mx) * (v - mx); });
      if (sxx > 0) { const s = sxy / sxx; if (Math.abs(s / sd - 1) < .08) { sd = s; bpm = 60 / (4 * sd); const b0 = my - s * mx; idx = evts.map(e => Math.round((e.t - b0) / sd)); const a = idx[evts.indexOf(anchorEv)]; idx = idx.map(v => v - a); } }
    }
    const g = { k: Array(16).fill(0), s: Array(16).fill(0), h: Array(16).fill(0) };
    evts.forEach((e, i) => { g[e.type][((idx[i] % 16) + 16) % 16] = 1; });
    g.types = ['k', 's', 'h'].filter(k => g[k].some(Boolean)).length;
    return { bpm, groove: g, evts };
  };

  /* ---------- suivi de hauteur (YIN) ---------- */
  DSP.pitchTrack = function (x, sr) {
    const ds = Math.max(1, Math.floor(sr / 16000)); const sr2 = sr / ds; const n2 = Math.floor(x.length / ds);
    const y = new Float32Array(n2);
    for (let i = 0; i < n2; i++) { let s = 0; for (let j = 0; j < ds; j++) s += x[i * ds + j]; y[i] = s / ds; }
    const W = Math.round(sr2 * .032), tauMin = Math.floor(sr2 / 1000), tauMax = Math.ceil(sr2 / 65), hop = Math.round(sr2 * .01);
    const nFr = Math.max(0, Math.floor((n2 - W - tauMax) / hop));
    const f0 = new Float32Array(nFr), rms = new Float32Array(nFr);
    const d = new Float32Array(tauMax + 2);
    for (let fi = 0; fi < nFr; fi++) {
      const s = fi * hop; let e = 0;
      for (let j = 0; j < W; j++) e += y[s + j] * y[s + j];
      rms[fi] = Math.sqrt(e / W);
      if (rms[fi] < 1e-4) continue;
      d[0] = 1; let run = 0;
      for (let tau = 1; tau <= tauMax; tau++) {
        let sum = 0; for (let j = 0; j < W; j++) { const df = y[s + j] - y[s + j + tau]; sum += df * df; }
        run += sum; d[tau] = run > 0 ? sum * tau / run : 1;
      }
      let tau = -1;
      for (let t = tauMin; t < tauMax; t++) { if (d[t] < .15) { while (t + 1 < tauMax && d[t + 1] < d[t]) t++; tau = t; break; } }
      if (tau < 0) { let mi = 1, mt = -1; for (let t = tauMin; t < tauMax; t++) if (d[t] < mi) { mi = d[t]; mt = t; } if (mi < .3) tau = mt; }
      if (tau > 0) {
        const a = d[tau - 1], b = d[tau], c = d[tau + 1]; const den = a - 2 * b + c; const sh = den !== 0 ? .5 * (a - c) / den : 0;
        f0[fi] = sr2 / (tau + Math.max(-1, Math.min(1, sh)));
      }
    }
    return { f0, rms, hop: hop / sr2 };
  };

  /* ---------- segmentation en notes ---------- */
  DSP.notesFromPitch = function (pt) {
    const { f0, rms, hop } = pt; const n = f0.length; if (!n) return [];
    let maxR = 0; for (let i = 0; i < n; i++) if (rms[i] > maxR) maxR = rms[i];
    const gate = maxR * .07;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = (f0[i] > 0 && rms[i] > gate) ? DSP.hzToMidi(f0[i]) : NaN;
    const m = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (isNaN(raw[i])) { m[i] = NaN; continue; }
      const w = []; for (let k = -2; k <= 2; k++) { const v = raw[i + k]; if (i + k >= 0 && i + k < n && !isNaN(v)) w.push(v); }
      m[i] = median(w);
    }
    const db = i => 20 * Math.log10(rms[Math.max(0, Math.min(n - 1, i))] + 1e-9);
    const segs = []; let cur = null, gap = 0, dev = 0;
    const close = end => { if (cur) { cur.end = end; segs.push(cur); } cur = null; };
    for (let i = 0; i < n; i++) {
      const v = m[i];
      if (isNaN(v)) { if (cur && ++gap > 2) close(i - gap + 1); continue; }
      gap = 0;
      if (!cur) { cur = { start: i, vals: [v] }; dev = 0; continue; }
      const ref = median(cur.vals.slice(-8));
      const onset = (db(i) - db(i - 3) > 7) && (i - cur.start > 6);
      if (Math.abs(v - ref) > .8) { dev++; if (dev >= 3) { const keep = cur.vals.splice(cur.vals.length - 2, 2); close(i - 2); cur = { start: i - 2, vals: keep.concat([v]) }; dev = 0; continue; } }
      else dev = 0;
      if (onset) { close(i); cur = { start: i, vals: [v] }; continue; }
      cur.vals.push(v);
    }
    close(n);
    return segs.filter(s => (s.end - s.start) * hop >= .06).map(s => ({ t: s.start * hop, d: (s.end - s.start) * hop, m: median(s.vals) }));
  };

  /* ---------- tonalité ---------- */
  const KMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KMIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  DSP.detectKey = function (notes) {
    const h = Array(12).fill(0); notes.forEach(n => { h[((Math.round(n.m) % 12) + 12) % 12] += n.d || 1; });
    const corr = (prof, r) => { let mx = 0, my = 0; for (let i = 0; i < 12; i++) { mx += h[i]; my += prof[i]; } mx /= 12; my /= 12; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < 12; i++) { const a = h[(i + r) % 12] - mx, b = prof[i] - my; sxy += a * b; sxx += a * a; syy += b * b; } return sxx > 0 ? sxy / Math.sqrt(sxx * syy) : 0; };
    let best = { root: 0, minor: false, score: -2 };
    for (let r = 0; r < 12; r++) { const a = corr(KMAJ, r), b = corr(KMIN, r); if (a > best.score) best = { root: r, minor: false, score: a }; if (b > best.score) best = { root: r, minor: true, score: b }; }
    const steps = best.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    best.scale = steps.map(s => (s + best.root) % 12);
    best.name = DSP.NOTE_NAMES[best.root] + (best.minor ? ' mineur' : ' majeur');
    return best;
  };
  DSP.snap = function (m, key) {
    if (!key) return Math.round(m);
    let best = Math.round(m), bd = 99;
    for (let c = Math.floor(m) - 2; c <= Math.ceil(m) + 2; c++) { if (key.scale.indexOf(((c % 12) + 12) % 12) < 0) continue; const dd = Math.abs(c - m); if (dd < bd) { bd = dd; best = c; } }
    return best;
  };

  /* notes (secondes) -> pas de double-croche */
  DSP.quantizeNotes = function (notes, stepDur, key) {
    const q = notes.map(n => { const s = Math.round(n.t / stepDur); const e = Math.round((n.t + n.d) / stepDur); return { s, l: Math.max(1, e - s), m: DSP.snap(n.m, key), v: .9 }; });
    q.sort((a, b) => a.s - b.s);
    const out = [];
    q.forEach(n => {
      const p = out[out.length - 1];
      if (p && n.s <= p.s) { if (n.l > p.l) { p.m = n.m; p.l = n.l; } return; }
      if (p && p.s + p.l > n.s) p.l = n.s - p.s;
      out.push(n);
    });
    return out.filter(n => n.l > 0);
  };

  /* voix -> notes prêtes à jouer */
  DSP.voiceToNotes = function (x, sr, stepDur, forcedKey) {
    const pt = DSP.pitchTrack(x, sr); const raw = DSP.notesFromPitch(pt);
    if (!raw.length) return { notes: [], key: null };
    const key = forcedKey || DSP.detectKey(raw);
    return { notes: DSP.quantizeNotes(raw, stepDur, key), key };
  };

  /* ---------- FFT & accords ---------- */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const ar = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, ai = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
          re[i + j + len / 2] = re[i + j] - ar; im[i + j + len / 2] = im[i + j] - ai; re[i + j] += ar; im[i + j] += ai;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  DSP.fft = fft;
  DSP.chroma = function (x, sr, s0, s1) {
    const N = sr > 30000 ? 8192 : 4096; const ch = Array(12).fill(0);
    const hopN = Math.max(N / 2, Math.floor((s1 - s0 - N) / 5) || N);
    let frames = 0;
    for (let s = s0; s + N <= s1 && frames < 6; s += hopN, frames++) {
      const re = new Float32Array(N), im = new Float32Array(N);
      for (let i = 0; i < N; i++) re[i] = x[s + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / N));
      fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const f = k * sr / N; if (f < 70 || f > 1600) continue;
        const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
        const pc = ((Math.round(DSP.hzToMidi(f)) % 12) + 12) % 12; ch[pc] += mag;
      }
    }
    return frames ? ch : null;
  };
  DSP.chordsFromAudio = function (x, sr, segDur, nSeg) {
    const out = []; let maxE = 0; const energies = [];
    for (let i = 0; i < nSeg; i++) {
      const s0 = Math.floor(i * segDur * sr), s1 = Math.min(x.length, Math.floor((i + 1) * segDur * sr));
      let e = 0; for (let j = s0; j < s1; j += 4) e += x[j] * x[j]; e = Math.sqrt(e / Math.max(1, (s1 - s0) / 4)); energies.push(e); if (e > maxE) maxE = e;
    }
    for (let i = 0; i < nSeg; i++) {
      const s0 = Math.floor(i * segDur * sr), s1 = Math.min(x.length, Math.floor((i + 1) * segDur * sr));
      if (energies[i] < maxE * .12 || s1 - s0 < 2048) { out.push(null); continue; }
      const ch = DSP.chroma(x, sr, s0, s1); if (!ch) { out.push(null); continue; }
      const mean = ch.reduce((a, b) => a + b) / 12;
      let best = null, bs = -1e9;
      for (let r = 0; r < 12; r++) for (const minor of [false, true]) {
        const tones = [r, (r + (minor ? 3 : 4)) % 12, (r + 7) % 12];
        let sc = 0; for (let p = 0; p < 12; p++) sc += (ch[p] - mean) * (tones.indexOf(p) >= 0 ? (p === r ? 1.15 : 1) : -.35);
        if (sc > bs) { bs = sc; best = { root: r, minor }; }
      }
      out.push(best);
    }
    for (let i = 0; i < out.length; i++) if (!out[i] && out[i - 1]) out[i] = out[i - 1];
    return out;
  };
  DSP.chordName = c => c ? DSP.NOTE_NAMES[c.root] + (c.minor ? 'm' : '') : '—';

  /* ---------- écoute d'une prise instrumentale : attaques + harmonie ---------- */
  /* attaques (flux spectral) : renvoie [{t, w}] avec w = force normalisée 0..1 */
  DSP.onsets = function (x, sr) {
    const N = 1024, H = 256, nF = Math.floor((x.length - N) / H); if (nF < 8) return [];
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
    let prev = new Float32Array(N / 2); const flux = new Float32Array(nF);
    const re = new Float32Array(N), im = new Float32Array(N);
    const kMax = Math.min(N / 2, Math.floor(8000 / sr * N));
    for (let f = 0; f < nF; f++) {
      const o = f * H; for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
      fft(re, im); let fl = 0; const cur = new Float32Array(N / 2);
      for (let k = 1; k < kMax; k++) { const m = Math.log(1 + 100 * Math.sqrt(re[k] * re[k] + im[k] * im[k])); cur[k] = m; const d = m - prev[k]; if (d > 0) fl += d; }
      flux[f] = fl; prev = cur;
    }
    const out = []; const W = 8; let last = -1e9, mx = 0;
    for (let f = 1; f < nF - 1; f++) {
      let s = 0, c = 0; for (let k = Math.max(0, f - W); k <= Math.min(nF - 1, f + W); k++) { s += flux[k]; c++; }
      const thr = s / c * 1.35 + 1e-3;
      if (flux[f] > thr && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1]) {
        const t = f * H / sr; if (t - last < .07) { if (out.length && flux[f] > out[out.length - 1].w) out[out.length - 1].w = flux[f]; continue; }
        out.push({ t: t + N / 2 / sr * .5, w: flux[f] }); last = t; if (flux[f] > mx) mx = flux[f];
      }
    }
    out.forEach(o => o.w = mx ? o.w / mx : 0);
    return out.filter(o => o.w > .12);
  };

  /* chroma par pics spectraux, avec chroma de basse séparé */
  function chromaPeaks(x, sr, s0, s1) {
    const N = sr > 30000 ? 8192 : 4096, H = N / 4; const ch = new Float32Array(12), bass = new Float32Array(12);
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / N);
    const re = new Float32Array(N), im = new Float32Array(N); let frames = 0;
    let start = s0; if (s1 - s0 < N) start = Math.max(0, Math.floor((s0 + s1) / 2 - N / 2));
    for (let s = start; s + N <= Math.max(s1, start + N) && s + N <= x.length && frames < 8; s += H, frames++) {
      for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      const kLo = Math.floor(55 / sr * N), kHi = Math.min(N / 2 - 2, Math.ceil(2100 / sr * N));
      const mag = new Float32Array(kHi + 2); let mx = 0;
      for (let k = kLo - 1; k <= kHi + 1; k++) { mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]); if (mag[k] > mx) mx = mag[k]; }
      if (mx < 1e-6) continue;
      let low = -1;
      for (let k = kLo; k <= kHi; k++) {
        const m = mag[k]; if (m < mx * .03 || m < mag[k - 1] || m < mag[k + 1]) continue;
        const a = mag[k - 1], b = m, c = mag[k + 1], den = a - 2 * b + c, d = den ? .5 * (a - c) / den : 0;
        const f = (k + d) * sr / N, midi = 69 + 12 * Math.log2(f / 440), r = Math.round(midi);
        const dev = Math.abs(midi - r); if (dev > .35) continue;
        const w = Math.pow(m / mx, .6) * (1 - dev);
        const pc = ((r % 12) + 12) % 12; ch[pc] += w;
        if (low < 0 && f < 330 && m > mx * .18) { low = pc; bass[pc] += 1; }
      }
    }
    return frames ? { ch, bass } : null;
  }
  const HARM = [[0, 1], [12, .6], [19, .35], [24, .25], [28, .15]];
  const TEMPL = [];
  for (let r = 0; r < 12; r++) for (const minor of [false, true]) {
    const t = new Float32Array(12); [0, minor ? 3 : 4, 7].forEach((iv, j) => HARM.forEach(([h, w]) => { t[(r + iv + h) % 12] += w * (j === 0 ? 1.1 : 1); }));
    let n = 0; for (let i = 0; i < 12; i++) n += t[i] * t[i]; n = Math.sqrt(n); for (let i = 0; i < 12; i++) t[i] /= n;
    TEMPL.push({ root: r, minor, t });
  }
  function keyFromChroma(h) {
    const corr = (prof, r) => { let mx = 0, my = 0; for (let i = 0; i < 12; i++) { mx += h[i]; my += prof[i]; } mx /= 12; my /= 12; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < 12; i++) { const a = h[(i + r) % 12] - mx, b = prof[i] - my; sxy += a * b; sxx += a * a; syy += b * b; } return sxx > 0 ? sxy / Math.sqrt(sxx * syy) : 0; };
    let best = { root: 0, minor: false, score: -2 };
    for (let r = 0; r < 12; r++) { const a = corr(KMAJ, r), b = corr(KMIN, r); if (a > best.score) best = { root: r, minor: false, score: a }; if (b > best.score) best = { root: r, minor: true, score: b }; }
    const steps = best.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    best.scale = steps.map(s => (s + best.root) % 12); best.name = DSP.NOTE_NAMES[best.root] + (best.minor ? ' mineur' : ' majeur');
    return best;
  }
  DSP.keyFromChroma = keyFromChroma;
  function diatonic(c, key) {
    if (!key) return false; const sc = key.scale; if (sc.indexOf(c.root) < 0) return false;
    const third = (c.root + (c.minor ? 3 : 4)) % 12, fifth = (c.root + 7) % 12; return sc.indexOf(third) >= 0 && sc.indexOf(fifth) >= 0;
  }
  /* accords temps par temps (Viterbi) + tonalité */
  DSP.analyzeHarmony = function (x, sr, beatDur, nBeats) {
    const obs = [], energies = []; const total = new Float32Array(12); let maxE = 0;
    for (let b = 0; b < nBeats; b++) {
      const s0 = Math.floor(b * beatDur * sr), s1 = Math.min(x.length, Math.floor((b + 1) * beatDur * sr));
      let e = 0; for (let j = s0; j < s1; j += 4) e += x[j] * x[j]; e = Math.sqrt(e / Math.max(1, (s1 - s0) / 4)); energies.push(e); if (e > maxE) maxE = e;
      const c = s1 - s0 > 1024 ? chromaPeaks(x, sr, s0, s1) : null; obs.push(c);
      if (c) for (let i = 0; i < 12; i++) total[i] += c.ch[i];
    }
    const S = TEMPL.length; // + état « pas d'accord » = S
    const run = (key) => {
    const em = obs.map((o, b) => {
      const sc = new Float32Array(S + 1);
      const silent = !o || energies[b] < maxE * .1;
      if (silent) { sc.fill(-.5); sc[S] = .5; return sc; }
      let n = 0; const v = new Float32Array(12); for (let i = 0; i < 12; i++) { v[i] = Math.log(1 + 8 * o.ch[i]); n += v[i] * v[i]; } n = Math.sqrt(n) || 1;
      let bn = 0; for (let i = 0; i < 12; i++) bn += o.bass[i]; const bassTop = bn > 0 ? o.bass.indexOf(Math.max(...o.bass)) : -1;
      for (let j = 0; j < S; j++) {
        const T = TEMPL[j]; let d = 0; for (let i = 0; i < 12; i++) d += v[i] / n * T.t[i];
        if (bn > 0) { const br = o.bass[T.root] / bn; d += .12 * br; const b3 = o.bass[(T.root + (T.minor ? 3 : 4)) % 12] / bn; d += .03 * b3; }
        if (key && diatonic(T, key)) d += .05;
        sc[j] = d;
      }
      sc[S] = .2; return sc;
    });
    const change = .05, nS = S + 1; let prev = em[0] ? Array.from(em[0]) : new Array(nS).fill(0); const back = [];
    for (let b = 1; b < em.length; b++) {
      let bi = 0; for (let j = 1; j < nS; j++) if (prev[j] > prev[bi]) bi = j;
      const cur = new Array(nS), bk = new Array(nS);
      const pen = b % 4 === 0 ? change * .4 : b % 2 === 0 ? change * 1.4 : change * 3;
      for (let j = 0; j < nS; j++) { const stay = prev[j], sw = prev[bi] - pen; if (stay >= sw) { cur[j] = stay + em[b][j]; bk[j] = j; } else { cur[j] = sw + em[b][j]; bk[j] = bi; } }
      back.push(bk); prev = cur;
    }
    let st = 0; for (let j = 1; j < nS; j++) if (prev[j] > prev[st]) st = j;
    const path = [st]; for (let b = back.length - 1; b >= 0; b--) { st = back[b][st]; path.unshift(st); }
    return path.map(j => j === S ? null : { root: TEMPL[j].root, minor: TEMPL[j].minor });
    };
    const first = run(null);
    /* tonalité = celle qui explique le plus d'accords entendus (+ bonus si le premier ou le dernier accord est la tonique) */
    let key = null, ks = -1e9; const kc = keyFromChroma(total);
    for (let r = 0; r < 12; r++) for (const minor of [false, true]) {
      const steps = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]; const k = { root: r, minor, scale: steps.map(x => (x + r) % 12) };
      let sc = 0; const got = first.filter(Boolean);
      got.forEach(c => { if (diatonic(c, k)) sc += 1; });
      if (got.length) { const f = got[0], l = got[got.length - 1]; if (f.root === r && f.minor === minor) sc += 1.5; if (l.root === r && l.minor === minor) sc += .5; }
      if (got.some(c => c.root === r && c.minor === minor)) sc += 1;
      if (kc.root === r && kc.minor === minor) sc += .3;
      if (sc > ks) { ks = sc; key = k; }
    }
    key.name = DSP.NOTE_NAMES[key.root] + (key.minor ? ' mineur' : ' majeur');
    const chords = run(key);
    return { chords, key, energies };
  };

  /* ---------- recalage automatique d'une prise sur la grille du tempo ----------
     renvoie le décalage d (s) à retirer au début : la prise arrive en retard de d */
  DSP.alignToGrid = function (x, sr, beatDur, maxBars, minD, origin) {
    minD = minD == null ? -.06 : minD; origin = origin || 0;
    const lim = Math.min(x.length, Math.floor((origin + beatDur * 4 * (maxBars || 8)) * sr) + sr);
    const on = DSP.onsets(x.subarray(0, lim), sr).filter(o => o.w > .18).map(o => ({ t: o.t - origin, w: o.w })).filter(o => o.t > minD - .05); if (on.length < 4) return null;
    const q = beatDur / 2, sig = .022;
    const score = d => { let s = 0; on.forEach(o => { const t = o.t - d; if (t < -q / 2) return; const k = Math.round(t / q), dist = t - k * q; const wgt = k % 8 === 0 ? 3 : k % 2 === 0 ? 2 : 1; s += o.w * wgt * Math.exp(-(dist * dist) / (2 * sig * sig)); }); return s; };
    /* indice fort : on commence presque toujours à jouer sur un temps fort (début de mesure) */
    const first = on.find(o => o.w > .35) || on[0], bar = beatDur * 4;
    const firstBonus = d => { const t = first.t - d; if (t < -.03) return 0; const dist = t - Math.round(t / bar) * bar; return Math.exp(-(dist * dist) / (2 * .03 * .03)); };
    const total = d => score(d) * (1 - .08 * Math.max(0, d)) * (1 + .6 * firstBonus(d));
    let best = 0, bs = total(0);
    for (let d = minD; d <= .85; d += .004) { const sc = total(d) * (d < 0 ? 1 + .25 * d : 1); if (sc > bs) { bs = sc; best = d; } }
    const s0 = total(0);
    return { d: best, gain: s0 > 0 ? bs / s0 : 9, n: on.length };
  };

  /* ---------- auto-tune (correction de hauteur granulaire) ---------- */
  DSP.autotune = function (x, sr, key) {
    const pt = DSP.pitchTrack(x, sr);
    if (!key) { const raw = DSP.notesFromPitch(pt); key = raw.length ? DSP.detectKey(raw) : null; }
    const nF = pt.f0.length; const ratio = new Float32Array(nF).fill(1);
    for (let i = 0; i < nF; i++) { const f = pt.f0[i]; if (f > 0) { const m = DSP.hzToMidi(f); const t = DSP.snap(m, key); ratio[i] = Math.pow(2, (t - m) / 12); } }
    for (let i = 1; i < nF - 1; i++) if (ratio[i] === 1 && ratio[i - 1] !== 1 && ratio[i + 1] !== 1) ratio[i] = (ratio[i - 1] + ratio[i + 1]) / 2;
    /* TD-PSOLA : repères d'analyse à chaque période, repères de synthèse à la période corrigée */
    const per = pos => { const fi = Math.min(nF - 1, Math.max(0, Math.floor(pos / sr / pt.hop))); const f = pt.f0[fi]; return f > 0 ? { P: sr / f, r: ratio[fi], v: true } : { P: Math.round(sr * .008), r: 1, v: false }; };
    const marks = []; let pos = 0;
    while (pos < x.length) {
      const q = per(pos); let p = Math.round(pos);
      if (q.v) { const w = Math.floor(q.P / 3); let best = p, bv = -1e9; for (let k = p - w; k <= p + w; k++) { if (k < 0 || k >= x.length) continue; const av = x[k]; if (av > bv) { bv = av; best = k; } } p = (marks.length && best <= marks[marks.length - 1].pos) ? p : best; }
      marks.push({ pos: p, P: q.P, r: q.r, v: q.v }); pos = p + q.P;
    }
    const out = new Float32Array(x.length), nrm = new Float32Array(x.length);
    let tOut = 0, mi = 0;
    while (tOut < x.length && marks.length) {
      while (mi + 1 < marks.length && Math.abs(marks[mi + 1].pos - tOut) < Math.abs(marks[mi].pos - tOut)) mi++;
      const mk = marks[mi]; const P = Math.round(mk.P); const c = Math.round(tOut);
      for (let j = -P; j < P; j++) {
        const o = c + j, si = mk.pos + j; if (o < 0 || o >= x.length || si < 0 || si >= x.length) continue;
        const w = .5 + .5 * Math.cos(Math.PI * j / P); out[o] += x[si] * w; nrm[o] += w;
      }
      tOut += mk.v ? mk.P / mk.r : mk.P;
    }
    for (let i = 0; i < x.length; i++) out[i] = nrm[i] > .05 ? out[i] / Math.max(1, nrm[i]) : out[i];
    return { data: out, key };
  };

  /* ---------- enveloppe (pour l'écho malin) ---------- */
  DSP.envelope = function (x, sr, rate) {
    rate = rate || 40; const step = Math.floor(sr / rate); const n = Math.ceil(x.length / step); const e = new Float32Array(n); let mx = 0;
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = i * step; j < Math.min(x.length, (i + 1) * step); j += 2) { s += x[j] * x[j]; c++; } e[i] = Math.sqrt(s / Math.max(1, c)); if (e[i] > mx) mx = e[i]; }
    if (mx > 0) for (let i = 0; i < n; i++) e[i] /= mx;
    const sm = new Float32Array(n); let v = 0; for (let i = 0; i < n; i++) { v = e[i] > v ? e[i] : v * .8 + e[i] * .2; sm[i] = v; }
    return sm;
  };

  /* ---------- WAV ---------- */
  DSP.encodeWAV = function (chs, sr) {
    const n = chs[0].length, nc = chs.length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * nc * 2, true);
    let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return buf;
  };

  root.DSP = DSP;
  if (typeof module !== 'undefined') module.exports = DSP;
})(typeof window !== 'undefined' ? window : globalThis);
