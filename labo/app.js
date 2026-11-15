/* Labo à maquettes — interface */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const clone = o => JSON.parse(JSON.stringify(o));
  const ROWS = Labo.DRUM_ROWS;
  const ROWNAMES = { k: 'Boum', s: 'Tchak', c: 'Clap', h: 'Tss', o: 'Tsssh', ta: 'Tom 1', tb: 'Tom 2' };
  const ROWCOL = { k: '#ef3b4a', s: '#ffd23f', c: '#ff4fa3', h: '#2fe3ff', o: '#a98bff', ta: '#ff8a3d', tb: '#ff6a3d' };

  const TYPES = {
    guitare: { name: 'Guitare', em: '🎸', color: '#ff8a3d', kind: 'audio', fx: {} },
    voix: { name: 'Voix', em: '🎤', color: '#ff4fa3', kind: 'audio', fx: { echo: true, reverb: true } },
    basse: { name: 'Basse', em: '🎸', color: '#2fe3ff', kind: 'inst', inst: 'basse', range: [33, 48], fx: {} },
    violon: { name: 'Violon', em: '🎻', color: '#a98bff', kind: 'inst', inst: 'violon', range: [64, 79], fx: { reverb: true } },
    synthe: { name: 'Synthé', em: '🎹', color: '#ffd23f', kind: 'inst', inst: 'synthe', range: [60, 74], fx: { echo: true } },
    cordes: { name: 'Cordes', em: '🎼', color: '#5ce0a0', kind: 'inst', inst: 'cordes', range: [55, 70], fx: { reverb: true } }
  };
  const INSTS = ['basse', 'violon', 'synthe', 'cordes'];
  const FXINFO = {
    echo: ['🌀', 'Écho malin', 'Calé sur ton tempo, il s\'efface quand tu chantes'],
    reverb: ['⛪', 'Réverb', 'De l\'espace autour'],
    double: ['👯', 'Doublage', 'Comme deux prises gauche-droite'],
    autotune: ['🤖', 'Auto-tune', 'Recale chaque note sur la gamme'],
    radio: ['📻', 'Radio', 'Voix de vieux poste'],
    robot: ['👾', 'Robot', 'Voix métallique'],
    lofi: ['📼', 'Lo-fi', 'Grain cassette']
  };
  const STYLES = [
    { name: '🎸 Brit Rock', bpm: 118, kit: 'rock', swing: 0, p: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' } },
    { name: '🌀 Baggy', bpm: 98, kit: 'rock', swing: 38, p: { k: 'x......x..x.....', s: '....x.......x...', h: 'xxxxxxxxxxxxxx.x', o: '..............x.', tb: '.............x..' } },
    { name: '🕺 Post-Punk Disco', bpm: 124, kit: 'rock', swing: 0, p: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xx.xxx.xxx.xxx.x', o: '..x...x...x...x.' } },
    { name: '⚡ Électro Rock', bpm: 128, kit: 'electro', swing: 0, p: { k: 'x...x...x...x...', s: '....x.......x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' } },
    { name: '🛣️ Motorik', bpm: 132, kit: 'rock', swing: 0, p: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' } },
    { name: '💥 Big Beat', bpm: 108, kit: 'electro', swing: 12, p: { k: 'x.x.......xx....', s: '....x..x.x..x..x', h: 'x.x.x.x.x.x.x.x.', c: '............x...', tb: '..............x.' } }
  ];
  const parsePat = p => { const o = {}; ROWS.forEach(r => { const s = (p[r] || '').padEnd(16, '.').slice(0, 16); o[r] = [...s].map(c => c === 'x' ? 1 : 0); }); return o; };
  function makeB(A) {
    const B = clone(A);
    if (!B.o.some(Boolean)) { B.o[14] = 1; B.h[14] = 0; }
    if (!B.k[11] && !B.k[10] && !B.k[12]) B.k[11] = 1; else if (!B.k[6] && !B.k[7]) B.k[7] = 1;
    if (B.h.filter(Boolean).length <= 8) { B.h[13] = 1; B.h[15] = 1; }
    B.c = B.c.map((v, i) => (v || B.s[i]) ? 1 : 0);
    return B;
  }
  function newProject() {
    const A = parsePat(STYLES[0].p);
    return {
      v: 1, name: 'Maquette du canapé', bpm: 110, bars: 8, loop: true, loopFrom: 0, metro: false, metroRec: true, swing: 0, kit: 'rock', style: 0,
      patterns: { A, B: makeB(A) }, drumBars: Array(8).fill('A'), cursor: 0, beatboxed: false,
      tracks: [{ id: 'drums', kind: 'drums', type: 'drums', name: 'Batterie', em: '🥁', color: '#ef3b4a', vol: .85, fx: {} }],
      clips: []
    };
  }

  /* ---------- état ---------- */
  let P = newProject(), AC = null, E = null, player = null;
  const AUD = {}; // id -> {data, sr, buf, env, tuned}
  const hist = [];

  /* ---------- stockage ---------- */
  const DB = {
    db: null,
    open() { return new Promise(res => { try { const r = indexedDB.open('labo-maquettes', 1); r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('audio'); }; r.onsuccess = () => { this.db = r.result; res(true); }; r.onerror = () => res(false); } catch (e) { res(false); } }); },
    get(st, k) { return new Promise(res => { if (!this.db) return res(null); try { const q = this.db.transaction(st).objectStore(st).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); },
    put(st, k, v) { if (!this.db) return; try { this.db.transaction(st, 'readwrite').objectStore(st).put(v, k); } catch (e) { } },
    clear(st) { if (!this.db) return; try { this.db.transaction(st, 'readwrite').objectStore(st).clear(); } catch (e) { } }
  };
  let saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => DB.put('kv', 'project', P), 350); }
  function snap() { hist.push(JSON.stringify(P)); if (hist.length > 40) hist.shift(); }
  function undo() { if (!hist.length) { toast('Rien à annuler'); return; } P = JSON.parse(hist.pop()); E.setKit(P.kit); applyTracks(); renderAll(); save(); toast('↶ Annulé'); }
  function commit(msg, undoable) { applyTracks(); renderAll(); save(); if (msg) toast(msg, undoable ? undo : null); }

  /* ---------- audio ---------- */
  function addAudio(data, sr) {
    const id = uid(); AUD[id] = { data, sr }; DB.put('audio', id, { data, sr }); return id;
  }
  function audioBuf(id) {
    const a = AUD[id]; if (!a) return null;
    if (!a.buf) { a.buf = AC.createBuffer(1, a.data.length, a.sr); a.buf.getChannelData(0).set(a.data); }
    return a.buf;
  }
  function tunedBuf(id) {
    const a = AUD[id]; if (!a) return null;
    if (!a.tuned) { const r = DSP.autotune(a.data, a.sr, P.key && P.key.scale ? P.key : null); a.tunedKey = r.key; a.tuned = AC.createBuffer(1, r.data.length, a.sr); a.tuned.getChannelData(0).set(r.data); }
    return a.tuned;
  }
  function audioEnv(id) { const a = AUD[id]; if (!a) return null; if (!a.env) a.env = DSP.envelope(a.data, a.sr, 40); return a.env; }
  const hooks = {
    buffer: (c, tr) => (tr.fx && tr.fx.autotune) ? (AUD[c.audioId] && AUD[c.audioId].tuned) || audioBuf(c.audioId) : audioBuf(c.audioId),
    env: c => audioEnv(c.audioId),
    extend: () => { P.bars += 4; for (let i = 0; i < 4; i++) P.drumBars.push(P.drumBars[P.drumBars.length - 1] === 'F' ? 'A' : (P.drumBars[P.drumBars.length - 1] || 'A')); renderTimeline(); },
    onEnd: () => updatePlayBtn()
  };
  function applyTracks() { if (!E) return; E.clickMode = P.clickMode || 'clic'; const s = P.tracks.some(t => t.solo); P.tracks.forEach(t => E.applyTrack(t, s, P.bpm)); }
  const stepDur = () => 60 / P.bpm / 4, barDur = () => 60 / P.bpm * 4;

  /* ---------- réglages de l'appareil (micro choisi, retard mesuré des écouteurs) ---------- */
  const VERSION = 17;
  const DEV = (() => { try { return JSON.parse(localStorage.getItem('labo-device') || '{}'); } catch (e) { return {}; } })();
  if (DEV.lat == null) { DEV.lat = 82; DEV.latHow = 'défaut'; }
  delete DEV.inLat; delete DEV.inHist;
  const saveDev = () => { try { localStorage.setItem('labo-device', JSON.stringify(DEV)); } catch (e) { } DB.put('kv', 'device', DEV); };

  /* ---------- micro ---------- */
  /* Capture micro sur le fil audio (AudioWorklet) : pas de trous, horodatage exact à l'échantillon près.
     Le micro est relâché après chaque prise pour que le téléphone repasse en lecture haute qualité. */
  const CAP_SRC = `class Cap extends AudioWorkletProcessor{constructor(){super();this.on=false;this.buf=new Float32Array(4096);this.n=0;this.f0=0;this.port.onmessage=e=>{const m=e.data;if(m==='start'){this.on=true;this.n=0;}else if(m==='stop'){this.flush();this.on=false;this.port.postMessage({done:true});}};}
flush(){if(this.n){this.port.postMessage({f:this.f0,d:this.buf.slice(0,this.n)});this.n=0;}}
process(inp){const ch=inp[0]&&inp[0][0];if(this.on&&ch){if(!this.n)this.f0=currentFrame;this.buf.set(ch,this.n);this.n+=ch.length;if(this.n+ch.length>this.buf.length)this.flush();}return true;}}
registerProcessor('labo-cap',Cap);`;
  const Mic = {
    stream: null, node: null, src: null, an: null, chunks: [], f0: null, peak: 0, recording: false, modCtx: null,
    async ensure() {
      if (this.stream && this.stream.active && this.node) return true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomic');
      const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
      try { this.stream = await navigator.mediaDevices.getUserMedia({ audio: DEV.micId ? { ...base, deviceId: { exact: DEV.micId } } : base }); }
      catch (e) { if (!DEV.micId) throw e; DEV.micId = null; saveDev(); this.stream = await navigator.mediaDevices.getUserMedia({ audio: base }); }
      if (AC.state !== 'running') { try { await AC.resume(); } catch (e) { } }
      this.src = AC.createMediaStreamSource(this.stream);
      this.an = AC.createAnalyser(); this.an.fftSize = 1024; this.src.connect(this.an);
      const sink = AC.createGain(); sink.gain.value = 0; sink.connect(AC.destination);
      if (AC.audioWorklet && window.AudioWorkletNode) {
        if (this.modCtx !== AC) { const url = URL.createObjectURL(new Blob([CAP_SRC], { type: 'application/javascript' })); await AC.audioWorklet.addModule(url); this.modCtx = AC; }
        this.node = new AudioWorkletNode(AC, 'labo-cap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
        this.node.port.onmessage = e => { const m = e.data; if (m.done) { if (this._done) this._done(); return; } if (this.f0 == null) this.f0 = m.f; this.chunks.push(m.d); };
      } else {
        this.node = AC.createScriptProcessor(4096, 1, 1); this.legacy = true;
        this.node.onaudioprocess = e => { if (!this.recording) return; const d = e.inputBuffer.getChannelData(0); if (this.f0 == null) this.f0 = Math.round((AC.currentTime - d.length / AC.sampleRate) * AC.sampleRate); this.chunks.push(new Float32Array(d)); };
      }
      this.src.connect(this.node); this.node.connect(sink); this.sink = sink;
      return true;
    },
    start() { this.chunks = []; this.f0 = null; this.recording = true; if (this.node && this.node.port) this.node.port.postMessage('start'); },
    async stop(keep) {
      if (this.recording && this.node && this.node.port) { await new Promise(r => { this._done = r; this.node.port.postMessage('stop'); setTimeout(r, 400); }); }
      this.recording = false;
      const n = this.chunks.reduce((a, c) => a + c.length, 0), x = new Float32Array(n); let o = 0; this.chunks.forEach(c => { x.set(c, o); o += c.length; }); this.chunks = [];
      const out = { data: x, t0: (this.f0 || 0) / AC.sampleRate, sr: AC.sampleRate };
      if (!keep) this.release();
      return out;
    },
    release() {
      try { this.src && this.src.disconnect(); this.node && this.node.disconnect(); this.sink && this.sink.disconnect(); } catch (e) { }
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      this.stream = null; this.node = null; this.src = null; this.an = null;
    },
    level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let s = 0, pk = 0; for (let i = 0; i < d.length; i++) { s += d[i] * d[i]; const v = Math.abs(d[i]); if (v > pk) pk = v; } this.peak = pk; return Math.sqrt(s / d.length); }
  };
  /* nettoyage d'une prise : enlève le continu, adoucit les bords, remonte le niveau si c'est trop faible */
  function cleanTake(x, sr) {
    let mean = 0; for (let i = 0; i < x.length; i++) mean += x[i]; mean /= Math.max(1, x.length);
    let pk = 0, clip = 0; for (let i = 0; i < x.length; i++) { x[i] -= mean; const v = Math.abs(x[i]); if (v > pk) pk = v; if (v > .985) clip++; }
    const fade = Math.min(x.length >> 1, Math.round(sr * .005)); for (let i = 0; i < fade; i++) { x[i] *= i / fade; x[x.length - 1 - i] *= i / fade; }
    const g = pk > 0 ? Math.min(4, .89 / pk) : 1; if (g > 1.05) for (let i = 0; i < x.length; i++) x[i] *= g;
    return { clipped: clip > x.length * .0005 };
  }
  async function needMic() {
    try { await Mic.ensure(); return true; }
    catch (e) { openSheet(`<div class="sh-t"><span class="em">🎙️</span>Micro refusé</div><p class="sh-p">Le labo a besoin du micro pour t'écouter. Sur iPhone : <b>Réglages › Safari › Micro › Autoriser</b> (ou touche « aA » dans la barre d'adresse › Réglages du site). Puis réessaie.</p><button class="btn full" data-close>OK</button>`); return false; }
  }

  /* ---------- toast / busy / feuilles ---------- */
  let toastT = null;
  function toast(msg, onUndo) {
    const t = $('toast'); t.innerHTML = `<span>${msg}</span>` + (onUndo ? '<button>Annuler</button>' : ''); t.hidden = false;
    if (onUndo) t.querySelector('button').onclick = () => { t.hidden = true; onUndo(); };
    clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, onUndo ? 4500 : 2800);
  }
  function busy(on, txt) { $('busy').hidden = !on; if (txt) $('busyTxt').textContent = txt; }
  const later = fn => new Promise(r => setTimeout(() => r(fn()), 40));
  let sheetClose = null;
  function openSheet(html, mount, onClose) {
    if (sheetClose) { const f = sheetClose; sheetClose = null; f(); }
    $('sheetBody').innerHTML = html; $('sheetWrap').hidden = false; document.body.classList.add('sheet-open'); $('sheetBody').scrollTop = 0;
    $('sheetBody').querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
    sheetClose = onClose || null; if (mount) mount($('sheetBody'));
  }
  function closeSheet() { $('sheetWrap').hidden = true; document.body.classList.remove('sheet-open'); if (sheetClose) { const f = sheetClose; sheetClose = null; f(); } }
  $('scrim').onclick = closeSheet;
  (function () {
    const sh = $('sheet'), body = $('sheetBody'); let y0 = null, dy = 0, fromGrab = false;
    sh.addEventListener('touchstart', e => { fromGrab = !!e.target.closest('.grabzone'); if (!fromGrab && body.scrollTop > 0) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; }, { passive: true });
    sh.addEventListener('touchmove', e => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy < 0 || (!fromGrab && e.target.closest('input[type=range],.pcells,.styles'))) { dy = 0; return; } sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sh.addEventListener('touchend', () => { if (y0 == null) return; sh.style.transition = 'transform .2s'; if (dy > 110) { sh.style.transform = 'translateY(100%)'; setTimeout(() => { closeSheet(); sh.style.transform = ''; }, 180); } else sh.style.transform = ''; y0 = null; });
  })();
  function burst(txt, el, color) {
    const r = el.getBoundingClientRect(), b = document.createElement('div'); b.className = 'burst'; b.textContent = txt; b.style.color = color;
    b.style.left = (r.left + r.width / 2) + 'px'; b.style.top = r.top + 'px'; document.body.appendChild(b);
    const dx = (Math.random() - .5) * 70;
    b.animate([{ transform: 'translate(-50%,0) scale(.6)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px),-70px) scale(1.1)`, opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => b.remove();
  }

  /* ---------- timeline ---------- */
  const HEAD = 86, BW = 60;
  function trackClips(t) { return P.clips.filter(c => c.trackId === t.id); }
  function fxLabel(t) { const f = t.fx || {}; return Object.keys(FXINFO).filter(k => f[k]).map(k => FXINFO[k][0]).join(''); }
  function renderTimeline() {
    const W = HEAD + P.bars * BW; const inner = $('tlInner'); inner.style.width = W + 'px';
    let h = `<div class="ruler"><div class="rh">🧪</div>`;
    for (let i = 0; i < P.bars; i++) h += `<div class="rcell${i === P.cursor ? ' cur' : ''}" data-act="cursor" data-bar="${i}">${i + 1}</div>`;
    h += `</div>`;
    P.tracks.forEach(t => {
      h += `<div class="trow"><button class="thd${t.mute ? ' muted' : ''}" style="--tc:${t.color}" data-act="track" data-id="${t.id}"><span class="te">${t.em}</span><span class="tn">${t.name}</span><span class="tfx">${t.mute ? '🔇 ' : ''}${t.solo ? '⭐ ' : ''}${fxLabel(t)}</span></button>`;
      if (t.kind === 'drums') {
        h += `<div class="lane drum" style="width:${P.bars * BW}px">`;
        for (let i = 0; i < P.bars; i++) { const v = P.drumBars[i] || 'A'; const cls = v === '-' ? 'vN' : 'v' + v; const lab = v === 'F' ? '🥁' : v === '-' ? '·' : v; h += `<button class="dbar ${cls}" data-act="dbar" data-bar="${i}"><i>${lab}</i></button>`; }
        h += `</div></div>`;
      } else {
        h += `<div class="lane" style="width:${P.bars * BW}px" data-act="lane" data-id="${t.id}"><div class="lane-bg">${'<i></i>'.repeat(P.bars)}</div>`;
        trackClips(t).forEach(c => {
          const w = c.lenBars * (c.loops || 1) * BW;
          h += `<button class="clip" style="--tc:${t.color};left:${c.bar * BW}px;width:${w}px" data-act="clip" data-id="${c.id}">`;
          h += c.kind === 'audio' ? `<canvas data-wave="${c.id}"></canvas>` : rollSVG(c, t);
          for (let r = 1; r < (c.loops || 1); r++) h += `<i class="rep" style="left:${r * c.lenBars * BW}px"></i>`;
          h += `<span class="cl">${c.label || t.name}${(c.loops || 1) > 1 ? ' ×' + c.loops : ''}</span></button>`;
        });
        h += `</div></div>`;
      }
    });
    h += `<div class="ph" id="ph" style="left:${HEAD + P.cursor * BW}px"></div>`;
    inner.innerHTML = h;
    inner.querySelectorAll('canvas[data-wave]').forEach(cv => drawWave(cv, P.clips.find(c => c.id === cv.dataset.wave)));
    $('barsN').textContent = P.bars; $('bpmBtn').textContent = Math.round(P.bpm) + ' BPM';
    $('tlHint').hidden = P.clips.length > 2;
  }
  function rollSVG(c, t) {
    const n = c.notes || []; if (!n.length) return '';
    const W = c.lenBars * 16, loops = c.loops || 1; let lo = 127, hi = 0; n.forEach(x => { lo = Math.min(lo, x.m); hi = Math.max(hi, x.m); }); const rng = Math.max(6, hi - lo + 2);
    let s = `<svg viewBox="0 0 ${W * loops} 40" preserveAspectRatio="none">`;
    const ins = (c.inBars || 0) * 16;
    for (let r = 0; r < loops; r++) n.forEach(x0 => { const x = { ...x0, s: x0.s - ins }; if (x.s < 0 || x.s >= W) return; const y = 34 - (x.m - lo + 1) / rng * 26; s += `<rect x="${r * W + x.s + .15}" y="${y.toFixed(1)}" width="${Math.max(.6, Math.min(x.l, W - x.s) - .3)}" height="3.4" rx="1" fill="#070a1f" opacity=".75"/>`; });
    return s + '</svg>';
  }
  function drawWave(cv, c) {
    if (!c) return; const a = AUD[c.audioId]; if (!a) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1); const repW = c.lenBars * BW, loops = c.loops || 1;
    cv.width = repW * loops * dpr; cv.height = 50 * dpr; const g = cv.getContext('2d'); g.fillStyle = 'rgba(7,10,31,.65)';
    const spb = barDur() * a.sr, base = Math.floor(((c.pre || 0) + (c.inBars || 0) * barDur()) * a.sr), total = Math.min(a.data.length, base + Math.floor(c.lenBars * spb)); const cols = Math.floor(repW * dpr / 2);
    const peaks = []; let mx = 1e-4;
    for (let i = 0; i < cols; i++) { const s0 = base + Math.floor(i / cols * c.lenBars * spb), s1 = Math.min(total, base + Math.floor((i + 1) / cols * c.lenBars * spb)); let m = 0; for (let j = s0; j < s1; j += 8) { const v = Math.abs(a.data[j]); if (v > m) m = v; } peaks.push(m); if (m > mx) mx = m; }
    for (let r = 0; r < loops; r++) peaks.forEach((m, i) => { const hh = Math.max(1, m / mx * 18 * dpr); g.fillRect(r * repW * dpr + i * 2, cv.height / 2 + 4 * dpr - hh, 1.4 * dpr, hh * 2); });
  }
  /* appui long sur un bloc : petit déclic, puis l'éditeur s'ouvre */
  let lp = null, lpFired = false;
  $('tlInner').addEventListener('pointerdown', e => {
    const el = e.target.closest('.clip'); if (!el) return; lpFired = false;
    const x0 = e.clientX, y0 = e.clientY; el.style.transition = 'transform .45s'; el.style.transform = 'scale(.96)';
    lp = { el, x0, y0, t: setTimeout(() => { lpFired = true; if (navigator.vibrate) navigator.vibrate([18, 30, 12]); el.style.transform = 'scale(1.04)'; setTimeout(() => { el.style.transform = ''; openEditor(el.dataset.id); }, 120); }, 480) };
  });
  const lpCancel = () => { if (lp) { clearTimeout(lp.t); lp.el.style.transform = ''; lp = null; } };
  $('tlInner').addEventListener('pointermove', e => { if (lp && Math.hypot(e.clientX - lp.x0, e.clientY - lp.y0) > 10) lpCancel(); });
  $('tlInner').addEventListener('pointerup', lpCancel); $('tlInner').addEventListener('pointercancel', lpCancel);
  $('tlInner').addEventListener('contextmenu', e => { if (e.target.closest('.clip')) e.preventDefault(); });
  $('tlInner').addEventListener('click', e => {
    if (lpFired) { lpFired = false; return; }
    const el = e.target.closest('[data-act]'); if (!el) return; const act = el.dataset.act;
    if (act === 'cursor') { P.cursor = +el.dataset.bar; renderTimeline(); save(); if (player.playing) play(); }
    else if (act === 'dbar') {
      const i = +el.dataset.bar, order = ['A', 'B', 'F', '-']; const cur = P.drumBars[i] || 'A';
      snap(); P.drumBars[i] = order[(order.indexOf(cur) + 1) % 4]; renderTimeline(); renderIdeas(); save();
      const nv = P.drumBars[i]; toast({ A: 'Mesure ' + (i + 1) + ' : rythme A', B: 'Mesure ' + (i + 1) + ' : variation B', F: 'Mesure ' + (i + 1) + ' : roulement 🥁', '-': 'Mesure ' + (i + 1) + ' : silence' }[nv]);
    }
    else if (act === 'track') openTrackSheet(el.dataset.id);
    else if (act === 'clip') openClipSheet(el.dataset.id);
    else if (act === 'lane') { const r = el.getBoundingClientRect(); const b = Math.floor((e.clientX - r.left) / BW); if (b >= 0 && b < P.bars) { P.cursor = b; renderTimeline(); save(); } }
  });
  $('barsMinus').onclick = () => { const minB = Math.max(1, ...P.clips.map(c => c.bar + 1)); if (P.bars <= minB) { toast('Un bloc occupe encore la fin'); return; } snap(); P.bars--; P.drumBars.length = P.bars; P.cursor = Math.min(P.cursor, P.bars - 1); commit(); };
  $('barsPlus').onclick = () => { snap(); P.bars++; P.drumBars.push(P.drumBars[P.bars - 2] === 'F' ? 'A' : (P.drumBars[P.bars - 2] || 'A')); commit(); const tl = $('tl'); tl.scrollTo({ left: tl.scrollWidth, behavior: 'smooth' }); };

  /* ---------- lecture ---------- */
  let wl = null;
  async function keepAwake(on) {
    if (!on && DEV.awake !== false) on = true; // réglage « écran toujours allumé » (activé par défaut)
    try { if (on && !wl && navigator.wakeLock && !document.hidden) { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => wl = null); } else if (!on && wl) { wl.release(); wl = null; } } catch (e) { }
  }
  /* installation sur l'écran d'accueil */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const ib = $('installBtn'); if (ib) ib.hidden = false; });
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  async function installApp(out) {
    if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === 'accepted') { toast('📲 Le Labo est sur ton écran d\'accueil'); return; } }
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    const msg = ios ? 'Dans Safari : touche <b>Partager</b> (le carré avec la flèche), puis <b>« Sur l\'écran d\'accueil »</b>.' : 'Dans Chrome : touche <b>⋮</b> en haut à droite, puis <b>« Installer l\'application »</b> (ou « Ajouter à l\'écran d\'accueil »).';
    if (out) out.innerHTML = `<div class="blk sh-p" style="margin-bottom:0">📲 ${msg}<br><br>Ensuite, ouvre le Labo depuis son icône : il s'ouvre en plein écran, comme une vraie appli.</div>`;
    else openSheet(`<div class="sh-t"><span class="em">📲</span>Installer le Labo</div><p class="sh-p">${msg}</p><p class="sh-p">Ensuite, ouvre-le depuis son icône : il s'ouvre en plein écran, comme une vraie appli.</p><button class="btn full" data-close>OK</button>`);
  }
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  function play(from) { if (AC.state !== 'running') AC.resume(); applyTracks(); player.start(from == null ? P.cursor : from, {}); updatePlayBtn(); keepAwake(true); }
  function stop() { player.stop(); updatePlayBtn(); if (!recState) keepAwake(false); }
  function updatePlayBtn() { $('playBtn').classList.toggle('on', player.playing && !player.opt.preview); $('loopBtn').classList.toggle('on', P.loop); }
  $('playBtn').onclick = () => { AC.resume(); (player.playing && !player.opt.preview) ? stop() : play(); };
  $('homeBtn').onclick = () => { P.cursor = 0; renderTimeline(); $('tl').scrollTo({ left: 0, behavior: 'smooth' }); if (player.playing) play(0); save(); };
  $('loopBtn').onclick = () => { P.loop = !P.loop; updatePlayBtn(); save(); toast(P.loop ? '🔁 Boucle activée' : 'Boucle coupée'); };
  $('undoBtn').onclick = undo;
  $('projName').oninput = e => { P.name = e.target.value; save(); };

  let lastStep = -1;
  function frame() {
    if (player && player.playing) {
      const now = AC.currentTime; let cur = null;
      while (player.vis.length && player.vis[0].t <= now) cur = player.vis.shift();
      if (cur) {
        lastStep = cur.step;
        if (cur.step % 4 === 0 && !player.opt.preview) { const pb = $('playBtn'); pb.classList.add('beat'); setTimeout(() => pb.classList.remove('beat'), 90); }
        if (player.opt.preview) gridPH(cur.step % 16);
        else {
          const ph = $('ph'); if (ph) { const x = HEAD + cur.step / 16 * BW; ph.style.left = x + 'px'; const tl = $('tl'); if (x > tl.scrollLeft + tl.clientWidth - 40 || x < tl.scrollLeft + HEAD) tl.scrollLeft = Math.max(0, x - HEAD - 20); }
        }
      }
    }
    if (recState) recFrame();
    requestAnimationFrame(frame);
  }

  /* ---------- idées ---------- */
  function has(type) { return P.tracks.some(t => t.type === type && trackClips(t).length); }
  function tracksOf(type) { return P.tracks.filter(t => t.type === type); }
  function computeIdeas() {
    const I = [];
    if (!P.beatboxed) I.push({ em: '🥁', t: 'Beatboxe ta batterie', s: 'Chante « boum tchak », le labo apprend ton groove', run: () => openBeatSheet(true) });
    if (!has('guitare')) I.push({ em: '🎸', t: 'Pose ta guitare', s: 'Joue ton riff sur la batterie, on le boucle après', run: () => openRecSheet('guitare') });
    if (has('guitare') && !has('basse')) I.push({ em: '🎸', t: 'Basse auto', s: 'Une basse qui suit tes accords et ta grosse caisse', run: autoBass });
    if (P.bars >= 4 && P.drumBars.indexOf('F') < 0) I.push({ em: '🥁', t: 'Des roulements', s: 'Un roulement toutes les 4 mesures', run: () => { snap(); for (let i = 3; i < P.bars; i += 4) if (P.drumBars[i] !== '-') P.drumBars[i] = 'F'; commit('🥁 Roulements ajoutés', true); autoplay(); } });
    if (P.bars >= 8 && P.drumBars.indexOf('B') < 0) I.push({ em: '🔥', t: 'Fais monter la sauce', s: 'Variation B plus chargée sur la 2e moitié', run: () => { snap(); for (let i = Math.floor(P.bars / 2); i < P.bars; i++) if (P.drumBars[i] === 'A') P.drumBars[i] = 'B'; commit('🔥 Variation B sur la 2e moitié', true); autoplay(); } });
    if (!has('voix')) I.push({ em: '🎤', t: 'Pose une voix', s: 'L\'écho malin se cale tout seul sur ton tempo', run: () => openRecSheet('voix') });
    if (has('guitare') && !P.drumsFromGtr) I.push({ em: '🥁', t: 'Batterie qui suit ta guitare', s: 'La grosse caisse se cale sur ton grattage', run: () => { P.drumsFromGtr = true; drumsFromGuitar(); } });
    if (has('guitare') && !has('cordes')) I.push({ em: '🎼', t: 'Cordes auto', s: 'Des nappes qui suivent tes accords', run: autoStrings });
    const vt = tracksOf('voix').find(t => trackClips(t).length);
    if (vt && !vt.fx.double) I.push({ em: '👯', t: 'Double ta voix', s: 'Plus large, plus épais, comme sur les disques', run: () => { snap(); vt.fx.double = true; commit('👯 Voix doublée', true); autoplay(); } });
    if (vt && !vt.fx.autotune) I.push({ em: '🤖', t: 'Un peu d\'auto-tune ?', s: 'Recale ta voix sur la gamme', run: () => setFx(vt, 'autotune', true) });
    if (!has('violon') && !has('synthe')) I.push({ em: '🎻', t: 'Chante un violon', s: 'Fredonne une mélodie, elle devient un violon', run: () => openRecSheet('violon') });
    if (P.clips.length && P.bars >= 8 && P.drumBars[0] !== '-') I.push({ em: '🌅', t: 'Intro sans batterie', s: 'Laisse respirer la 1re mesure', run: () => { snap(); P.drumBars[0] = '-'; commit('🌅 Intro sans batterie', true); autoplay(); } });
    if (P.bars >= 8 && P.drumBars[P.bars - 3] !== '-' && P.clips.length) I.push({ em: '✂️', t: 'Un break', s: 'Coupe la batterie juste avant la fin', run: () => { snap(); P.drumBars[P.bars - 3] = '-'; commit('✂️ Break ajouté', true); autoplay(); } });
    I.push({ em: '🎲', t: 'Surprends-moi', s: 'Une nouvelle variation de batterie', run: surprise });
    return I.slice(0, 7);
  }
  function renderIdeas() {
    const w = $('ideas'); w.innerHTML = ''; computeIdeas().forEach(it => { const b = document.createElement('button'); b.className = 'idea'; b.innerHTML = `<b><i>${it.em}</i>${it.t}</b><span>${it.s}</span>`; b.onclick = () => { AC.resume(); it.run(); }; w.appendChild(b); });
  }
  function autoplay() { if (!player.playing || player.opt.preview) play(0); }
  function surprise() {
    snap(); const A = P.patterns.A, B = makeB(A);
    const muts = [
      () => { const i = [3, 7, 9, 15][Math.floor(Math.random() * 4)]; if (!B.s[i]) B.s[i] = 1; },
      () => { const i = [3, 6, 10, 14][Math.floor(Math.random() * 4)]; B.k[i] = 1; },
      () => { B.o[6] = 1; B.h[6] = 0; },
      () => { B.ta[13] = 1; B.tb[15] = 1; },
      () => { B.h = B.h.map((v, i) => i % 2 === 0 ? 1 : (Math.random() < .3 ? 1 : 0)); },
      () => { B.c = B.c.map((v, i) => i === 4 || i === 12 || i === 15 ? 1 : 0); }
    ];
    for (let n = 0; n < 2; n++) muts[Math.floor(Math.random() * muts.length)]();
    P.patterns.B = B;
    if (P.drumBars.indexOf('B') < 0) for (let i = Math.floor(P.bars / 2); i < P.bars; i++) if (P.drumBars[i] === 'A') P.drumBars[i] = 'B';
    commit('🎲 Nouvelle variation B', true); autoplay();
  }
  function setFx(t, k, on) {
    snap(); t.fx[k] = on;
    if (k === 'autotune' && on) {
      busy(true, 'Auto-tune en cours…');
      later(() => { trackClips(t).forEach(c => { if (c.audioId) tunedBuf(c.audioId); }); busy(false); const a = trackClips(t)[0]; const key = a && AUD[a.audioId] && AUD[a.audioId].tunedKey; commit('🤖 Auto-tune' + (key ? ' en ' + key.name : ''), true); autoplay(); });
      return;
    }
    commit(FXINFO[k][0] + ' ' + FXINFO[k][1] + (on ? ' activé' : ' coupé'), true);
    if (k === 'echo' && on) { const e = Labo.smartEcho(P.bpm); toast('🌀 Écho malin : ' + e.label + ' à ' + Math.round(P.bpm) + ' BPM', undo); }
  }

  /* ---------- auto-basse / auto-cordes ---------- */
  /* ---------- écoute de la guitare : accords temps par temps, tonalité, rythme joué ---------- */
  function guitarClips() { return P.clips.filter(c => { const t = P.tracks.find(x => x.id === c.trackId); return t && t.type === 'guitare' && c.kind === 'audio'; }); }
  function listen(c) {
    const a = AUD[c.audioId]; if (!a) return null;
    const k = [P.bpm, c.nudge || 0, c.lenBars, c.inBars || 0, c.pre || 0].join('_'); if (a.listen && a.listenKey === k) return a.listen;
    const sh = Math.round(((c.pre || 0) + (c.inBars || 0) * barDur() - (c.nudge || 0) / 1000) * a.sr); let x;
    if (sh >= 0) x = a.data.subarray(sh); else { x = new Float32Array(a.data.length - sh); x.set(a.data, -sh); }
    const sd = stepDur(), n = c.lenBars * 16;
    const h = DSP.analyzeHarmony(x, a.sr, sd * 4, c.lenBars * 4);
    const steps = new Float32Array(n); DSP.onsets(x, a.sr).forEach(o => { const st = Math.round(o.t / sd); if (st >= 0 && st < n) steps[st] = Math.max(steps[st], o.w); });
    a.listen = { chords: h.chords, key: h.key, steps }; a.listenKey = k;
    P.key = { root: h.key.root, minor: h.key.minor, scale: h.key.scale, name: h.key.name };
    return a.listen;
  }
  function chordLine(L) { const out = []; L.chords.forEach((c, i) => { if (i % 2) return; const n = DSP.chordName(c); if (c && out[out.length - 1] !== n) out.push(n); }); return out; }
  const sameCh = (a, b) => a && b && a.root === b.root && a.minor === b.minor;
  function nearestOct(pc, ref, lo, hi) { let best = null; for (let m = lo; m <= hi; m++) if (((m % 12) + 12) % 12 === pc && (best == null || Math.abs(m - ref) < Math.abs(best - ref))) best = m; return best; }
  function strongThr(steps) { const v = [...steps].filter(x => x > 0).sort((a, b) => a - b); return v.length ? Math.max(.22, v[Math.floor(v.length * .35)]) : 9; }
  function bassFrom(L, n) {
    const thr = strongThr(L.steps), chAt = s => L.chords[Math.floor(s / 4)];
    const isChange = s => s % 4 === 0 && !sameCh(chAt(s), chAt(s - 1));
    const starts = [];
    for (let s = 0; s < n; s++) {
      if (!chAt(s)) continue;
      if (s % 16 === 0 || isChange(s) || L.steps[s] >= thr) { const last = starts[starts.length - 1]; if (last != null && s - last < 2 && !isChange(s)) continue; starts.push(s); }
    }
    const notes = []; let prev = 36;
    starts.forEach((s, i) => {
      const ch = chAt(s); let nx = i + 1 < starts.length ? starts[i + 1] : n;
      for (let q = s + 1; q < nx; q++) if (!chAt(q)) { nx = q; break; }
      const m = nearestOct(ch.root, prev, 28, 47); const l = Math.min(nx - s, 8);
      const nextCh = nx < n ? chAt(nx) : null;
      if (nextCh && !sameCh(nextCh, ch) && l >= 4) {
        notes.push({ s, l: l - 1, m, v: .95 });
        const tgt = nearestOct(nextCh.root, m, 28, 47); notes.push({ s: s + l - 1, l: 1, m: tgt + (tgt > m ? -1 : 1), v: .7 });
      } else notes.push({ s, l: Math.max(1, l), m, v: L.steps[s] >= thr ? .8 + .2 * L.steps[s] : .85 });
      prev = m;
    });
    return notes;
  }
  function stringsFrom(L) {
    const notes = []; let prevV = null, i = 0; const C = L.chords;
    while (i < C.length) {
      const ch = C[i]; let j = i + 1; while (j < C.length && sameCh(C[j], ch)) j++;
      if (ch) {
        const pcs = [ch.root, (ch.root + (ch.minor ? 3 : 4)) % 12, (ch.root + 7) % 12]; let best = null, bs = 1e9;
        for (let inv = 0; inv < 3; inv++) for (let base = 50; base <= 66; base++) {
          if (base % 12 !== pcs[inv]) continue; const v = [base]; for (let k = 1; k < 3; k++) { let m = v[k - 1] + 1; while (m % 12 !== pcs[(inv + k) % 3]) m++; v.push(m); }
          if (v[2] > 76) continue; const cost = prevV ? v.reduce((a, m, k) => a + Math.abs(m - prevV[k]), 0) : Math.abs(v[1] - 62);
          if (cost < bs) { bs = cost; best = v; }
        }
        if (best) { best.forEach(m => notes.push({ s: i * 4, l: (j - i) * 4, m, v: .8 })); prevV = best; }
      }
      i = j;
    }
    return notes;
  }
  function genFromGuitar(type, label) {
    const gc = guitarClips(); if (!gc.length) { toast('Enregistre d\'abord une guitare'); return; }
    busy(true, type === 'basse' ? 'J\'écoute tes accords et ton grattage…' : 'J\'écoute tes accords…');
    later(() => {
      snap(); let made = 0, line = [], keyName = '';
      gc.forEach(c => {
        const L = listen(c); if (!L || !L.chords.some(Boolean)) return;
        const notes = type === 'basse' ? bassFrom(L, c.lenBars * 16) : stringsFrom(L); if (!notes.length) return;
        line = chordLine(L); keyName = L.key.name;
        P.clips.filter(x => x.gen === c.id + type).forEach(x => P.clips.splice(P.clips.indexOf(x), 1));
        const t = trackFor(type, c.bar, c.lenBars * (c.loops || 1));
        P.clips.push({ id: uid(), kind: 'inst', trackId: t.id, bar: c.bar, lenBars: c.lenBars, loops: c.loops || 1, notes, label, gen: c.id + type }); made++;
      });
      busy(false);
      if (!made) { hist.pop(); toast('Je n\'ai pas reconnu d\'accords. Gratte un peu plus fort, près du micro.'); return; }
      commit(TYPES[type].em + ' ' + label + ' · ' + line.slice(0, 6).join(' ') + (keyName ? ' (' + keyName + ')' : ''), true); autoplay();
    });
  }
  const autoBass = () => genFromGuitar('basse', 'Basse auto');
  const autoStrings = () => genFromGuitar('cordes', 'Cordes auto');
  function drumsFromGuitar() {
    const c = guitarClips()[0]; if (!c) { toast('Enregistre d\'abord une guitare'); return; }
    busy(true, 'J\'écoute ton rythme…');
    later(() => {
      const L = listen(c); busy(false); if (!L) return;
      const acc = new Float32Array(16); for (let s = 0; s < L.steps.length; s++) acc[s % 16] += L.steps[s] / c.lenBars;
      const mx = Math.max(...acc); if (mx <= 0) { toast('Je n\'entends pas d\'attaques nettes dans ta guitare'); return; }
      snap(); const A = clone(P.patterns.A);
      A.k = Array(16).fill(0); A.k[0] = 1;
      for (let i = 0; i < 16; i++) if (acc[i] >= mx * .55 && i !== 4 && i !== 12) A.k[i] = 1;
      if (!A.s.some(Boolean)) { A.s[4] = 1; A.s[12] = 1; }
      const busy16 = [1, 3, 5, 7, 9, 11, 13, 15].filter(i => acc[i] >= mx * .35).length >= 3;
      A.h = A.h.map((v, i) => busy16 ? 1 : (i % 2 === 0 ? 1 : 0)); A.o = A.o.map(() => 0);
      P.patterns.A = A; P.patterns.B = makeB(A);
      commit('🥁 Batterie calée sur ton grattage', true); autoplay();
    });
  }
  function trackFor(type, bar, len) {
    const T = TYPES[type];
    let t = P.tracks.find(x => x.type === type && !trackClips(x).some(c => c.bar < bar + len && bar < c.bar + c.lenBars * (c.loops || 1)));
    if (!t) {
      const n = P.tracks.filter(x => x.type === type).length;
      t = { id: uid(), kind: T.kind, type, name: T.name + (n ? ' ' + (n + 1) : ''), em: T.em, color: T.color, inst: T.inst, vol: .85, fx: clone(T.fx) };
      P.tracks.push(t);
    }
    return t;
  }

  /* ---------- ajouter ---------- */
  const ADDS = [
    ['beat', '🥁', 'Atelier batterie', 'Beatbox, styles, grille'],
    ['guitare', '🎸', 'Guitare', 'Enregistre ton riff'],
    ['voix', '🎤', 'Voix', 'Avec écho malin'],
    ['basse', '🗣️', 'Chante une basse', 'Ta voix devient basse'],
    ['violon', '🎻', 'Chante un violon', 'Ta mélodie au violon'],
    ['synthe', '🎹', 'Chante un synthé', 'Lead façon années 80'],
    ['cordes', '🎼', 'Chante des cordes', 'Une nappe douce']
  ];
  $('beatBtn').onclick = () => { AC.resume(); openBeatSheet(); };
  $('recBtn').onclick = () => {
    AC.resume(); const pr = P.recPrefs || { len: 0, countIn: true }; const mode = { hp: '🎧 écouteurs', soft: '🔈 batterie douce', click: '🔔 clic' }[P.recMode || 'soft'];
    const lr = P.lastRec && P.clips.find(c => c.id === P.lastRec.clip) ? P.lastRec : null;
    let h = `<div class="sh-t"><span class="em">🔴</span>On enregistre quoi ?</div><p class="sh-p" style="font-size:12.5px;margin-bottom:10px">Touche et c'est parti, à partir de la mesure ${P.cursor + 1} · ${pr.len ? pr.len + ' mesure(s)' : 'durée libre'} · ${mode}.</p><div class="reclist">`;
    if (lr) h += `<button class="recitem" data-redo="1" style="background:var(--yellow);color:var(--ink);border-color:var(--ink)"><span class="ae">🔁</span><span><b>Refaire la dernière prise</b><small>${TYPES[lr.type].name} · mesure ${lr.bar + 1} · remplace l'ancienne</small></span></button>`;
    ADDS.filter(a => a[0] !== 'beat').forEach(([k, em, t, s2]) => { h += `<button class="recitem" data-k="${k}"><span class="ae">${em}</span><span><b>${t}</b><small>${s2}</small></span></button>`; });
    h += `</div><button class="btn ghost full" id="recSet">⚙️ Réglages des prises</button>`;
    openSheet(h, b => {
      b.querySelectorAll('[data-k]').forEach(x => x.onclick = () => quickRec(x.dataset.k));
      const rd = b.querySelector('[data-redo]'); if (rd) rd.onclick = () => quickRec(lr.type, lr.bar, lr.clip);
      b.querySelector('#recSet').onclick = () => openRecSheet((lr && lr.type) || 'guitare');
    });
  };;

  /* ---------- enregistrement ---------- */
  let recState = null;
  function openRecSheet(type) {
    const T = TYPES[type]; const sing = T.kind === 'inst';
    P.recPrefs = P.recPrefs || { len: 0, countIn: true }; let start = P.cursor, countIn = P.recPrefs.countIn !== false, len = P.recPrefs.len || 0;
    const desc = sing ? `Chante ou fredonne ta ligne (« dou dou », « na na »…). Le labo repère tes notes, les cale sur le tempo et la gamme, et les joue au ${T.name.toLowerCase()}.` :
      type === 'voix' ? 'Chante sur la batterie. L\'écho malin et la réverb sont déjà branchés, tu pourras changer les effets après.' : 'Joue ton riff sur la batterie. Tu pourras le boucler ensuite pour l\'allonger autant que tu veux.';
    openSheet(`<div class="sh-t"><span class="em">${T.em}</span>${sing ? 'Chante → ' + T.name : T.name}</div><p class="sh-p">${desc}</p>
      <div class="blk"><label>Combien de temps ?</label><div class="chips" id="rsLen">${[[0, '∞ Libre'], [1, '1 mes.'], [2, '2'], [4, '4'], [8, '8'], [16, '16']].map(([v, l]) => `<button class="chip ${v === (P.recPrefs.len || 0) ? 'on' : ''}" data-l="${v}">${l}</button>`).join('')}</div><p class="sh-p" id="rsLenTxt" style="font-size:13px;margin:10px 0 0"><b>Libre</b> : tu joues ton truc et tu appuies sur <b>Stop</b> quand tu as fini. Pas de limite.</p></div>
      <div class="blk"><div class="row"><span style="font-weight:700;font-size:14.5px">Ça démarre<small style="display:block;font-weight:500;font-size:12px;opacity:.65;margin-top:2px">Change-le pour ajouter une partie plus loin</small></span><div class="stepper" style="gap:8px"><button data-d="-1" style="width:36px;height:36px;font-size:18px">−</button><b id="rsBar" style="font-size:15px;min-width:76px"></b><button data-d="1" style="width:36px;height:36px;font-size:18px">+</button></div></div></div>
      <div class="blk"><label>Pendant la prise, j'entends…</label><div class="reclist" id="rsMode">
        <button class="recitem" data-m="hp"><span class="ae">🎧</span><span><b>Toute la batterie dans mes écouteurs</b><small>Filaires ou Bluetooth. Le son le plus propre.</small></span></button>
        <button class="recitem" data-m="soft"><span class="ae">🔈</span><span><b>La batterie, doucement, sur le haut-parleur</b><small>Pour jouer en rythme sans écouteurs. Un peu de batterie passera dans ta prise.</small></span></button>
        <button class="recitem" data-m="click"><span class="ae">🔔</span><span><b>Juste le clic</b><small>Sans écouteurs, la prise la plus propre.</small></span></button>
      </div>
        <div id="rsSync" class="row" style="margin-top:4px"></div></div>
      <div class="blk">${clickChips()}<div class="tog" style="margin-top:6px">Décompte d'une mesure<span class="sw ${countIn ? 'on' : ''}" id="rsCount"></span></div><div class="tog"><span>Métronome pendant la prise<small>Coupe-le si la batterie te suffit</small></span><span class="sw ${P.metroRec ? 'on' : ''}" id="rsMetro"></span></div></div>
      <p class="sh-p" style="font-size:12.5px">Évite les écouteurs Bluetooth : dès que le micro s'ouvre, le téléphone les passe en qualité « appel » et le son se dégrade. Et ferme les autres applis qui enregistrent (dictaphone…).</p>
      <button class="btn red full" id="rsGo" style="font-family:Bungee;font-size:18px">● C'est parti</button>`, b => {
      const upd = () => b.querySelector('#rsBar').textContent = start === 0 ? 'au début' : 'mesure ' + (start + 1);
      upd(); b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { start = Math.max(0, Math.min(P.bars - 1, start + +x.dataset.d)); upd(); });
      b.querySelectorAll('[data-l]').forEach(x => x.onclick = () => { len = +x.dataset.l; P.recPrefs.len = len; save(); b.querySelectorAll('[data-l]').forEach(y => y.classList.toggle('on', y === x)); b.querySelector('#rsLenTxt').innerHTML = len ? 'La prise s\'arrête toute seule après <b>' + len + ' mesure' + (len > 1 ? 's' : '') + '</b>, pile sur le temps. Pratique pour une boucle bien nette.' : '<b>Libre</b> : tu joues ton truc et tu appuies sur <b>Stop</b> quand tu as fini. Pas de limite.'; });
      const hpTxt = () => {
        P.recMode = P.recMode || (P.headphones ? 'hp' : 'soft'); P.headphones = P.recMode === 'hp';
        b.querySelectorAll('[data-m]').forEach(x => { const on = x.dataset.m === P.recMode; x.style.background = on ? 'var(--yellow)' : ''; x.style.color = on ? 'var(--ink)' : ''; x.style.borderColor = on ? 'var(--ink)' : ''; });
        const sy = b.querySelector('#rsSync'); sy.hidden = !P.headphones;
        sy.innerHTML = `<span style="font-size:13px;font-weight:700">⏱️ Synchro écouteurs : ${DEV.lat != null ? '<span style="color:var(--green)">' + Math.round(DEV.lat) + ' ms ✓</span>' : '<span style="color:var(--yellow)">pas encore réglée</span>'}</span><button class="btn yel" id="rsSyncBtn" style="padding:8px 12px;font-size:13px">${DEV.lat != null ? 'Refaire' : 'Régler'}</button>`;
        sy.querySelector('#rsSyncBtn').onclick = () => openSyncSheet(() => openRecSheet(type));
      };
      bindClickChips(b, () => openRecSheet(type));
      hpTxt(); b.querySelectorAll('[data-m]').forEach(x => x.onclick = () => { P.recMode = x.dataset.m; hpTxt(); save(); });
      b.querySelector('#rsCount').onclick = e => { countIn = !countIn; P.recPrefs.countIn = countIn; save(); e.target.classList.toggle('on', countIn); };
      b.querySelector('#rsMetro').onclick = e => { P.metroRec = !P.metroRec; e.target.classList.toggle('on', P.metroRec); save(); };
      b.querySelector('#rsGo').onclick = async () => { AC.resume(); if (!(await needMic())) return; closeSheet(); startRec(type, start, countIn, len); };
    });
  }
  async function quickRec(type, startBar, replace) {
    AC.resume(); if (!(await needMic())) return; closeSheet();
    const pr = P.recPrefs || { len: 0, countIn: true }; startRec(type, startBar == null ? P.cursor : startBar, pr.countIn !== false, pr.len || 0, replace);
  }
  function startRec(type, startBar, countIn, len, replace) {
    stop(); keepAwake(true); Mic.start();
    if (len) while (P.bars < startBar + len) { P.bars++; P.drumBars.push('A'); }
    const mode = P.recMode || (P.headphones ? 'hp' : 'soft');
    if (mode === 'soft') E.master.gain.setTargetAtTime(.32, AC.currentTime, .02);
    player.start(startBar, { countIn, recording: true, quiet: mode === 'click' });
    recState = { type, startBar, countIn, len, replace }; updatePlayBtn();
    $('recPanel').hidden = false; $('rpTitle').textContent = 'Prépare-toi…';
  }
  function recFrame() {
    const now = AC.currentTime, s = player.songStart, beat = stepDur() * 4;
    const cnt = $('rpCount');
    if (now < s) { const n = recState.countIn ? Math.max(1, 4 - Math.floor((now - player.countInStart) / beat)) : '…'; cnt.textContent = n; cnt.classList.remove('live'); $('rpTitle').textContent = 'Prépare-toi…'; $('rpSub').textContent = 'On démarre mesure ' + (recState.startBar + 1); }
    else {
      if (recState.len && now >= s + recState.len * barDur() + .05) { $('rpStop').click(); return; }
      const bar = Math.floor((now - s) / barDur()) + recState.startBar + 1; cnt.textContent = '● REC'; cnt.classList.add('live'); $('rpTitle').textContent = 'Mesure ' + bar; $('rpSub').textContent = recState.len ? 'Encore ' + Math.max(1, recState.startBar + recState.len - bar + 1) + ' mesure(s)' : (TYPES[recState.type].kind === 'inst' ? 'Chante ta ligne, aussi longtemps que tu veux' : 'Joue aussi longtemps que tu veux, puis Stop'); }
    const lv = Mic.level(), hot = Mic.peak > .95; const m = $('rpLevel'); m.style.width = Math.min(100, Math.sqrt(lv) * 160) + '%'; m.classList.toggle('hot', hot);
    if (hot && now >= s) $('rpSub').textContent = '⚠️ Trop fort, recule un peu';
  }
  const restoreVol = () => E.master.gain.setTargetAtTime(.9, AC.currentTime, .05);
  $('rpCancel').onclick = () => { if (!recState) return; player.stop(); restoreVol(); Mic.stop(); keepAwake(false); recState = null; $('recPanel').hidden = true; updatePlayBtn(); renderTimeline(); toast('Prise annulée'); };
  $('rpStop').onclick = async () => {
    if (!recState) return; const st = recState; recState = null; $('recPanel').hidden = true;
    const songStart = player.songStart; player.stop(); restoreVol(); updatePlayBtn(); keepAwake(false);
    const rec = await Mic.stop(); const sr = rec.sr;
    const lat = ((P.recMode === 'hp' && DEV.lat != null) ? DEV.lat / 1000 : (AC.outputLatency || .01) + (AC.baseLatency || .005) + (Mic.legacy ? .03 : .006));
    /* on garde 0,5 s de marge avant le premier temps : rien n'est jamais mangé, le calage se fait sans couper */
    const isAudio = TYPES[st.type].kind === 'audio', PRE = isAudio ? 1 : 0;
    let s0 = Math.round((songStart - rec.t0 + lat - PRE) * sr);
    let x;
    if (s0 >= 0) x = rec.data.slice(s0); else { x = new Float32Array(rec.data.length - s0); x.set(rec.data, -s0); }
    let pre = PRE, alignMsg = '', lead = 0;
    if (isAudio && P.autoAlign !== false) {
      const al = DSP.alignToGrid(x, sr, stepDur() * 4, 8, -.3, PRE);
      if (al && Math.abs(al.d) > .025 && al.gain > 1.2) { pre = Math.max(0, PRE + al.d); alignMsg = ' · recalée de ' + Math.round(al.d * 1000) + ' ms'; }
      /* garde-fou : la première note jouée n'est jamais coupée */
      const on = DSP.onsets(x.subarray(0, Math.min(x.length, Math.floor((PRE + 3) * sr))), sr).filter(o => o.w > .25 && o.t > PRE - .3);
      if (on.length && on[0].t - .02 < pre) lead = Math.min(.5, pre - Math.max(0, on[0].t - .02));
    }
    const dur = x.length / sr - pre;
    if (dur < .6) { toast('Prise trop courte, réessaie'); renderTimeline(); return; }
    const lenBars = st.len || Math.max(1, Math.round(dur / barDur()));
    x = x.slice(0, Math.min(x.length, Math.floor((pre + lenBars * barDur() + .4) * sr)));
    while (P.bars < st.startBar + lenBars) { P.bars++; P.drumBars.push('A'); }
    const T = TYPES[st.type];
    const cl = cleanTake(x, sr);
    snap();
    const audioId = addAudio(x, sr);
    if (cl.clipped) setTimeout(() => toast('⚠️ Ta prise sature un peu : éloigne le téléphone de la guitare ou chante moins près'), 3200);
    if (T.kind === 'audio') {
      let tid = null; if (st.replace) { const old = P.clips.find(c => c.id === st.replace); if (old) { tid = old.trackId; P.clips = P.clips.filter(c => c.id !== old.id); } }
      const t = tid ? P.tracks.find(x => x.id === tid) : trackFor(st.type, st.startBar, lenBars);
      P.clips.push({ id: uid(), kind: 'audio', trackId: t.id, bar: st.startBar, lenBars, loops: 1, audioId, nudge: 0, pre: +pre.toFixed(4), lead: +lead.toFixed(4) });
      P.lastRec = { type: st.type, bar: st.startBar, clip: P.clips[P.clips.length - 1].id };
      commit(T.em + ' ' + T.name + ' enregistrée · ' + lenBars + ' mesure' + (lenBars > 1 ? 's' : '') + alignMsg + (st.type === 'voix' ? ' · écho malin activé' : '') + ' · appui long pour l\'éditer', true);
      if (P.tracks.find(t => t.id === P.clips[P.clips.length - 1].trackId).fx.autotune) tunedBuf(audioId);
    } else {
      busy(true, 'J\'écoute tes notes…');
      later(() => { if (st.replace) P.clips = P.clips.filter(c => c.id !== st.replace); const r = voiceToInst(audioId, st.type, st.startBar, lenBars); busy(false); if (r) { P.lastRec = { type: st.type, bar: st.startBar, clip: P.clips[P.clips.length - 1].id }; save(); autoplay(); } });
    }
  };
  function voiceToInst(audioId, type, bar, lenBars, loops) {
    const a = AUD[audioId]; const T = TYPES[type];
    const gk = guitarClips()[0]; if (gk) listen(gk); const r = DSP.voiceToNotes(a.data, a.sr, stepDur(), P.key && P.key.scale ? P.key : null);
    let notes = r.notes.filter(n => n.s < lenBars * 16);
    if (!notes.length) { renderTimeline(); toast('Je n\'ai pas entendu de notes. Chante plus fort, des notes bien tenues.'); return false; }
    const med = DSP.median(notes.map(n => n.m)), center = (T.range[0] + T.range[1]) / 2;
    const sh = 12 * Math.round((center - med) / 12); notes = notes.map(n => ({ ...n, m: n.m + sh }));
    const t = trackFor(type, bar, lenBars * (loops || 1));
    P.clips.push({ id: uid(), kind: 'inst', trackId: t.id, bar, lenBars, loops: loops || 1, notes, src: audioId, key: r.key ? r.key.name : '' });
    commit(T.em + ' ' + T.name + ' : ' + notes.length + ' notes' + (r.key ? ' en ' + r.key.name : ''), true);
    return true;
  }

  /* ---------- synchro écouteurs ---------- */
  function openSyncSheet(back) {
    stop();
    openSheet(`<div class="sh-t"><span class="em">⏱️</span>Synchro écouteurs</div>
      <p class="sh-p">Les écouteurs (surtout en Bluetooth) ont un petit retard. Le labo le mesure une fois, puis recale toutes tes prises tout seul. À refaire si tu changes d'écouteurs.</p>
      <div class="blk"><label>Micro qui enregistre</label><div class="chips" id="syMics"><span class="sh-p" style="margin:0;font-size:13px">Touche « Choisir » pour voir les micros.</span></div><button class="btn ghost full" id="syMicBtn" style="margin-top:8px">🎙️ Choisir le micro</button>
        <p class="sh-p" style="font-size:12px;margin:8px 0 0">Prends le micro du téléphone : il enregistre bien mieux que celui des écouteurs. Selon le téléphone, les écouteurs Bluetooth peuvent quand même passer en qualité « appel » pendant la prise.</p></div>
      <div class="blk"><label>Mesure précise (conseillée)</label><p class="sh-p" style="font-size:13px">Mets tes écouteurs, puis colle un écouteur contre le bas du téléphone, là où est le micro. Le labo joue 8 clics et chronomètre le temps qu'ils mettent à revenir.</p><button class="btn yel full" id="syLoop">🔁 Lancer la mesure</button></div>
      <div class="blk"><label>Ou au rythme</label><p class="sh-p" style="font-size:13px">Écouteurs sur les oreilles : tape sur le bouton pile en même temps que chaque clic que tu entends (12 clics).</p><button class="btn full" id="syTap" style="height:84px;font-family:Bungee;font-size:18px">👆 Démarrer</button></div>
      <div id="syOut"></div>
      ${back ? '<button class="btn full" id="syBack">← Retour à l\'enregistrement</button>' : '<button class="btn full" data-close>OK</button>'}`, b => {
      const out = b.querySelector('#syOut');
      const done = (ms, how) => { DEV.lat = ms; DEV.latHow = how; saveDev(); out.innerHTML = `<div class="blk" style="background:var(--green);color:var(--ink);border-color:var(--ink)"><b>✓ Retard mesuré : ${Math.round(ms)} ms</b><br><span style="font-size:13px">Tes prises seront recalées automatiquement.</span></div>`; };
      const fail = msg => { out.innerHTML = `<div class="blk"><b>😕 ${msg}</b></div>`; };
      if (back) b.querySelector('#syBack').onclick = back;
      b.querySelector('#syMicBtn').onclick = async () => {
        if (!(await needMic())) return; Mic.release();
        const list = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
        const w = b.querySelector('#syMics'); w.innerHTML = '';
        const opts = [{ deviceId: '', label: 'Automatique' }].concat(list.filter(d => d.deviceId && d.deviceId !== 'default'));
        opts.forEach((d, i) => { const c = document.createElement('button'); c.className = 'chip' + ((DEV.micId || '') === d.deviceId ? ' on' : ''); const lb = d.label || ''; c.textContent = !d.deviceId ? 'Automatique' : /bluetooth|headset|hands-?free|airpods|buds|casque|écouteur|ecouteur|sco/i.test(lb) ? '🎧 Micro des écouteurs (déconseillé)' : /speaker|built-?in|bottom|interne|phone|téléphone|telephone|microphone$/i.test(lb) ? '📱 Micro du téléphone' + (/back|arrière|top|haut/i.test(lb) ? ' (2)' : '') : (lb || ('Micro ' + i)); c.title = lb; c.onclick = () => { DEV.micId = d.deviceId || null; saveDev(); w.querySelectorAll('.chip').forEach(y => y.classList.toggle('on', y === c)); toast('🎙️ ' + c.textContent); }; w.appendChild(c); });
      };
      b.querySelector('#syLoop').onclick = async () => {
        AC.resume(); if (!(await needMic())) return;
        out.innerHTML = '<div class="blk"><b>🔁 Mesure en cours… ne bouge pas</b></div>';
        Mic.start(); const t0 = AC.currentTime + .6, iv = .5, ticks = [];
        for (let i = 0; i < 8; i++) { const t = t0 + i * iv; ticks.push(t); const o = AC.createOscillator(), g = AC.createGain(); o.type = 'square'; o.frequency.value = 1100; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9, t + .001); g.gain.setValueAtTime(.9, t + .012); g.gain.linearRampToValueAtTime(0, t + .015); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + .03); }
        await new Promise(r => setTimeout(r, (.6 + 8 * iv + .5) * 1000));
        const rec = await Mic.stop(); const x = rec.data, sr = rec.sr; const lags = [];
        let noise = 0; for (let i = 0; i < Math.min(x.length, Math.floor(sr * .3)); i++) noise = Math.max(noise, Math.abs(x[i]));
        ticks.forEach(t => {
          const a = Math.floor((t - rec.t0) * sr), z = Math.min(x.length, a + Math.floor(sr * .45)); if (a < 0 || a >= x.length) return;
          let pk = 0; for (let i = a; i < z; i++) pk = Math.max(pk, Math.abs(x[i])); if (pk < noise * 3 || pk < .01) return;
          let pre = 0; for (let i = Math.max(0, a - Math.floor(sr * .04)); i < a; i++) pre = Math.max(pre, Math.abs(x[i])); if (pre > pk * .3) return;
          for (let i = a; i < z; i++) if (Math.abs(x[i]) > pk * .35) { lags.push((i - a) / sr * 1000); break; }
        });
        if (lags.length < 5) return fail('Je n\'ai pas entendu les clics. Monte le volume et colle bien l\'écouteur contre le micro du téléphone.');
        const med = DSP.median(lags), spread = DSP.median(lags.map(l => Math.abs(l - med)));
        if (spread > 25) return fail('Mesure pas assez stable (' + Math.round(spread) + ' ms d\'écart). Réessaie dans un coin calme.');
        done(med, 'boucle');
      };
      b.querySelector('#syTap').onclick = e => {
        AC.resume(); const btn = e.currentTarget; if (btn.dataset.on) return; btn.dataset.on = '1';
        const t0 = AC.currentTime + .8, iv = .6, n = 12, ticks = [], taps = [];
        for (let i = 0; i < n; i++) { ticks.push(t0 + i * iv); E.click(t0 + i * iv, i % 4 === 0); }
        btn.textContent = '👆 TAPE ICI'; btn.style.background = 'var(--yellow)';
        const onTap = ev => { ev.preventDefault(); taps.push(AC.currentTime); btn.animate([{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 120 }); };
        btn.addEventListener('pointerdown', onTap);
        setTimeout(() => {
          btn.removeEventListener('pointerdown', onTap); delete btn.dataset.on; btn.textContent = '👆 Recommencer'; btn.style.background = '';
          const d = taps.map(t => { let best = ticks[0]; ticks.forEach(k => { if (Math.abs(t - k) < Math.abs(t - best)) best = k; }); return (t - best) * 1000; }).slice(3).filter(v => v > -150 && v < 450);
          if (d.length < 5) return fail('Pas assez de tapes. Tape bien sur chaque clic, du début à la fin.');
          const med = DSP.median(d), spread = DSP.median(d.map(v => Math.abs(v - med)));
          if (spread > 45) return fail('Tes tapes étaient un peu irrégulières, réessaie tranquillement.');
          done(Math.max(0, med) + 15, 'rythme');
        }, (.8 + n * iv + .4) * 1000);
      };
    });
  }

  /* ---------- feuille bloc ---------- */
  function openClipSheet(id, fresh) {
    const c = P.clips.find(x => x.id === id); if (!c) return; const t = P.tracks.find(x => x.id === c.trackId);
    const T = TYPES[t.type] || {};
    const isVoice = c.kind === 'audio' && t.type === 'voix', isGtr = c.kind === 'audio' && t.type === 'guitare';
    let h = `<div class="sh-t"><span class="em">${t.em}</span>${c.label || t.name}</div>`;
    if (fresh) h += `<p class="sh-p">Bien joué ! Tu peux la boucler pour l'allonger, ou la recaler si elle traîne un peu.</p>`;
    h += `<button class="btn yel full" data-a="edit" style="font-family:Bungee;font-size:16px;margin-bottom:4px">✂️ Éditer : raccourcir, couper, effacer</button>`;
    h += `<div class="blk"><label>Boucler</label><div class="row"><div class="stepper"><button data-a="lm">−</button><b id="csLoops">×${c.loops || 1}</b><button data-a="lp">+</button></div><span class="sh-p" style="margin:0;font-size:12.5px">${c.lenBars} mesure${c.lenBars > 1 ? 's' : ''} par tour</span></div></div>`;
    h += `<div class="blk"><label>Position</label><div class="stepper"><button data-a="bm">−</button><b id="csBar">mes. ${c.bar + 1}</b><button data-a="bp">+</button></div></div>`;
    if (c.kind === 'audio') h += `<div class="blk"><label>Calage <span id="csNudge">${c.nudge || 0} ms</span></label><input type="range" min="-800" max="300" step="5" value="${c.nudge || 0}" id="csN"><div class="row" style="margin-top:8px"><span class="sh-p" style="font-size:12px;margin:0;flex:1">Vers la gauche si la prise traîne, vers la droite si elle se précipite.</span><button class="mini" data-a="auto">⏱️ Recaler tout seul</button></div></div>`;
    if (c.kind === 'audio' && t.type === 'voix' || c.src) {
      h += `<div class="blk"><label>${c.src ? 'Rejouer ta voix au…' : 'Transformer ta voix en…'}</label><div class="chips">${INSTS.map(k => `<button class="chip" data-tr="${k}">${TYPES[k].em} ${TYPES[k].name}</button>`).join('')}</div></div>`;
    }
    if (isGtr) { let heard = ''; try { const L = listen(c); if (L) heard = `<p class="sh-p" style="font-size:13px;margin:0 0 10px">J'entends : <b>${chordLine(L).join(' · ') || '—'}</b>${L.key ? ' (' + L.key.name + ')' : ''}</p>`; } catch (e) { }
      h += `<div class="blk"><label>Le labo écrit pour toi</label>${heard}<div class="chips"><button class="chip" data-a="ab">🎸 Basse auto</button><button class="chip" data-a="as">🎼 Cordes auto</button><button class="chip" data-a="ad">🥁 Batterie calée</button></div></div>`; }
    if (c.kind === 'inst') h += `<div class="blk"><label>Octave${c.key ? ' · ' + c.key : ''}</label><div class="stepper"><button data-a="om">−</button><b id="csOct">${(c.oct || 0) > 0 ? '+' : ''}${c.oct || 0}</b><button data-a="op">+</button></div></div>`;
    h += `<div class="row" style="margin-top:6px"><button class="btn ghost" data-a="dup" style="flex:1">⧉ Dupliquer après</button><button class="btn" data-a="pl" style="flex:1">▶ Écouter</button></div>` + (c.kind === 'audio' ? `<button class="btn ghost full" data-a="raw">🎧 Écouter la prise seule, sans rien</button>` : '');
    h += `<button class="danger" data-a="del">Supprimer ce bloc</button>`;
    openSheet(h, b => {
      const re = () => { renderTimeline(); save(); };
      b.querySelectorAll('[data-a]').forEach(x => x.onclick = () => {
        const a = x.dataset.a;
        if (a === 'lm' || a === 'lp') { snap(); c.loops = Math.max(1, Math.min(32, (c.loops || 1) + (a === 'lp' ? 1 : -1))); const need = c.bar + c.lenBars * c.loops; while (P.bars < need) { P.bars++; P.drumBars.push(P.drumBars[P.bars - 2] === 'F' ? 'A' : P.drumBars[P.bars - 2] || 'A'); } b.querySelector('#csLoops').textContent = '×' + c.loops; re(); renderIdeas(); }
        if (a === 'bm' || a === 'bp') { snap(); c.bar = Math.max(0, c.bar + (a === 'bp' ? 1 : -1)); const need = c.bar + c.lenBars * (c.loops || 1); while (P.bars < need) { P.bars++; P.drumBars.push('A'); } b.querySelector('#csBar').textContent = 'mes. ' + (c.bar + 1); re(); }
        if (a === 'om' || a === 'op') { snap(); c.oct = Math.max(-2, Math.min(2, (c.oct || 0) + (a === 'op' ? 1 : -1))); b.querySelector('#csOct').textContent = (c.oct > 0 ? '+' : '') + c.oct; re(); }
        if (a === 'dup') { snap(); const n = clone(c); n.id = uid(); n.bar = c.bar + c.lenBars * (c.loops || 1); const tt = trackFor(t.type, n.bar, n.lenBars * (n.loops || 1)); n.trackId = tt.id; P.clips.push(n); const need = n.bar + n.lenBars * (n.loops || 1); while (P.bars < need) { P.bars++; P.drumBars.push('A'); } closeSheet(); commit('⧉ Bloc dupliqué', true); }
        if (a === 'pl') { closeSheet(); play(c.bar); }
        if (a === 'edit') { openEditor(c.id); }
        if (a === 'auto') { const au = AUD[c.audioId]; const st0 = Math.round(((c.pre || 0) + (c.inBars || 0) * barDur() - (c.nudge || 0) / 1000) * au.sr); const org = Math.min(.35, Math.max(0, st0 / au.sr)); const al = DSP.alignToGrid(au.data.subarray(Math.max(0, st0 - Math.round(org * au.sr))), au.sr, stepDur() * 4, 8, -org, org); if (!al || al.gain < 1.05 || Math.abs(al.d) < .015) { toast('Ta prise est déjà bien calée 👌'); return; } snap(); const np = (c.pre || 0) - (c.nudge || 0) / 1000 + al.d; c.pre = Math.max(0, np); c.nudge = np < 0 ? Math.round(-np * 1000) : 0; const n = b.querySelector('#csN'); if (n) { n.value = c.nudge; b.querySelector('#csNudge').textContent = c.nudge + ' ms'; } save(); toast('⏱️ Recalée de ' + Math.round(al.d * 1000) + ' ms', undo); }
        if (a === 'raw') { stop(); const bf = audioBuf(c.audioId); if (!bf) return; if (window._raw) { try { window._raw.stop(); } catch (e) { } } const src = AC.createBufferSource(); src.buffer = bf; src.connect(AC.destination); src.start(); window._raw = src; x.textContent = '■ Arrêter'; src.onended = () => { x.textContent = '🎧 Écouter la prise seule, sans rien'; }; x.onclick = () => { try { src.stop(); } catch (e) { } }; }
        if (a === 'del') { snap(); P.clips = P.clips.filter(x => x.id !== c.id); closeSheet(); commit('Bloc supprimé', true); }
        if (a === 'ab') { closeSheet(); autoBass(); }
        if (a === 'as') { closeSheet(); autoStrings(); }
        if (a === 'ad') { closeSheet(); drumsFromGuitar(); }
      });
      const n = b.querySelector('#csN'); if (n) { n.oninput = () => { c.nudge = +n.value; b.querySelector('#csNudge').textContent = c.nudge + ' ms'; }; n.onchange = () => { save(); if (player.playing) play(); }; n.onpointerdown = () => snap(); }
      b.querySelectorAll('[data-tr]').forEach(x => x.onclick = () => {
        const type = x.dataset.tr; const src = c.src || c.audioId; closeSheet(); snap();
        busy(true, 'Je transforme ta voix…');
        later(() => {
          if (c.src) { const tt = trackFor(type, c.bar, c.lenBars * (c.loops || 1)); if (tt.id !== c.trackId) { P.clips = P.clips.filter(z => z.id !== c.id); } else P.clips = P.clips.filter(z => z.id !== c.id); }
          const ok = voiceToInst(src, type, c.bar, c.lenBars, c.loops); busy(false);
          if (ok && !c.src) { const vt = P.tracks.find(z => z.id === c.trackId); if (vt && !vt.mute) { vt.mute = true; commit(TYPES[type].em + ' ' + TYPES[type].name + ' créé · ta voix est mise en sourdine', true); } }
          if (ok) autoplay();
        });
      });
    });
  }

  /* ---------- éditeur tactile ---------- */
  /* la sélection est gardée en temps (beats) : précise au millième, sans casser la grille des mesures */
  function setSel(c, S, Eb) {
    const oldIn = c.inBars || 0, nin = Math.max(0, Math.floor(S / 4 + 1e-6)), d = nin - oldIn;
    if (d) { c.mutes = (c.mutes || []).map(([m0, m1]) => [m0 - d * 4, m1 - d * 4]).filter(m => m[1] > 0).map(m => [Math.max(0, m[0]), m[1]]); c.bar = Math.max(0, c.bar + d); }
    c.inBars = nin; c.trimA = +(S - nin * 4).toFixed(4); if (c.trimA < 1e-3) c.trimA = 0;
    c.lenBars = Math.max(1, Math.ceil((Eb - nin * 4) / 4 - 1e-6)); const tb = +(Eb - nin * 4).toFixed(4); c.trimB = tb >= c.lenBars * 4 - 1e-3 ? null : tb;
  }
  const selOf = c => { const i = (c.inBars || 0) * 4; return [i + (c.trimA || 0), i + (c.trimB != null ? c.trimB : c.lenBars * 4)]; };
  function openEditor(id) {
    const c = P.clips.find(x => x.id === id); if (!c) return; const t = P.tracks.find(x => x.id === c.trackId);
    stop(); snap();
    const bd = barDur(), beatS = bd / 4, a = c.kind === 'audio' ? AUD[c.audioId] : null;
    const pre0 = c.kind === 'audio' ? (c.pre || 0) : 0; const srcBars = c.kind === 'audio' ? Math.max(1, Math.ceil((a.data.length / a.sr - pre0) / bd - .05)) : (c.srcBars = c.srcBars || Math.max((c.inBars || 0) + c.lenBars, Math.ceil(Math.max(0, ...(c.notes || []).map(n => n.s + n.l)) / 16)));
    const SB = srcBars * 4; let vA = 0, vB = SB, tool = 'trim', cut = null, grid = P.edGrid || 1, lastBuzz = null;
    const GRIDS = [[4, 'Mesure'], [1, 'Temps'], [.5, '½ temps'], [.25, '¼'], [0, 'Libre']];
    const buzz = k => { if (k !== lastBuzz && navigator.vibrate) navigator.vibrate(6); lastBuzz = k; };
    const snapB = x => grid ? Math.round(x / grid) * grid : Math.round(x * 64) / 64;
    const lab = x => { const bar = Math.floor(x / 4 + 1e-6), bt = x - bar * 4, fr = bt % 1; const ft = fr < .02 || fr > .98 ? '' : Math.abs(fr - .5) < .02 ? '½' : Math.abs(fr - .25) < .02 ? '¼' : Math.abs(fr - .75) < .02 ? '¾' : '+'; return 'mes. ' + (bar + 1) + (bt > .02 ? ' · temps ' + (Math.floor(bt + .02) + 1) + ft : ''); };
    openSheet(`<div class="sh-t"><span class="em">✂️</span>Éditer · ${c.label || t.name}</div>
      <div class="tabs" id="edTabs"><button data-t="trim" class="on">↔️ Raccourcir</button><button data-t="cut">✂️ Couper</button><button data-t="erase">🧽 Effacer</button></div>
      <p class="sh-p" id="edHelp" style="font-size:12.5px;margin:10px 0 8px"></p>
      <div style="position:relative;border-radius:16px;overflow:hidden;border:3px solid var(--cream);background:var(--navy3)"><canvas id="edCv" style="display:block;width:100%;height:190px;touch-action:none"></canvas></div>
      <div class="row" style="margin-top:10px;gap:8px"><div class="chips" id="edGrid" style="gap:6px">${GRIDS.map(([v, l]) => `<button class="chip ${v === grid ? 'on' : ''}" data-g="${v}" style="padding:7px 10px;font-size:12.5px">${l}</button>`).join('')}</div></div>
      <div class="row" style="margin-top:10px"><div class="stepper" style="gap:8px"><button id="edZo" style="width:40px;height:40px">−</button><b style="font-size:13px;min-width:70px" id="edZ">🔍 ×1</b><button id="edZi" style="width:40px;height:40px">+</button></div><button class="mini" id="edAll">Tout voir</button></div>
      <div class="row" style="margin-top:10px"><b id="edInfo" style="font-size:14px"></b><button class="btn" id="edCut" hidden style="padding:10px 14px">✂️ Couper ici</button></div>
      <div class="row" style="margin-top:12px"><button class="btn ghost" id="edPlay" style="flex:1">▶ Écouter</button><button class="btn yel" id="edDone" style="flex:1">✓ Terminé</button></div>
      <button class="danger" id="edReset">Tout remettre comme avant</button>`, b => {
      const cv = b.querySelector('#edCv'), g = cv.getContext('2d'); const dpr = Math.min(2, window.devicePixelRatio || 1), H = 190, TOP = 20, PAD = 16;
      const W = () => cv.clientWidth;
      const xOf = x => PAD + (x - vA) / (vB - vA) * (W() - 2 * PAD), bOf = px => vA + (px - PAD) / (W() - 2 * PAD) * (vB - vA);
      const helps = { trim: 'Glisse les poignées jaunes. Pince avec deux doigts (ou 🔍 +) pour zoomer et être plus précis.', cut: 'Touche ou glisse pour placer les ciseaux, puis « Couper ici ».', erase: 'Passe le doigt sur un passage raté pour le rendre muet. Touche une zone hachurée pour la remettre. Deux doigts pour zoomer.' };
      function draw() {
        const w = W(); cv.width = w * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, H);
        const [S, Eb] = selOf(c), inB = (c.inBars || 0) * 4, pxBeat = (w - 2 * PAD) / (vB - vA);
        for (let x = Math.floor(vA * 2) / 2; x <= vB; x += .5) {
          const isBar = Math.abs(x % 4) < 1e-6, isBeat = Math.abs(x % 1) < 1e-6; if (!isBar && !(isBeat && pxBeat > 12) && !(pxBeat > 40)) continue;
          const px = xOf(x); g.fillStyle = isBar ? 'rgba(246,236,214,.28)' : isBeat ? 'rgba(246,236,214,.12)' : 'rgba(246,236,214,.06)'; g.fillRect(px, TOP, 1, H - TOP);
          if (isBar && (pxBeat * 4 > 22 || (x / 4) % 2 === 0)) { g.fillStyle = 'rgba(246,236,214,.6)'; g.font = '700 10px Space Grotesk, sans-serif'; g.fillText(String(x / 4 + 1), px + 3, 13); }
        }
        g.fillStyle = t.color; const mid = TOP + (H - TOP) / 2;
        if (a) { const cols = Math.floor(w - 2 * PAD); let mx = 1e-4; const pk = new Float32Array(cols); for (let i = 0; i < cols; i++) { const s0 = Math.floor((pre0 + (vA + i / cols * (vB - vA)) * beatS) * a.sr), s1 = Math.min(a.data.length, Math.floor((pre0 + (vA + (i + 1) / cols * (vB - vA)) * beatS) * a.sr)); const st = Math.max(1, Math.floor((s1 - s0) / 300)); let m = 0; for (let j = Math.max(0, s0); j < s1; j += st) { const v = Math.abs(a.data[j]); if (v > m) m = v; } pk[i] = m; if (m > mx) mx = m; } if (!a.edMax) { let gm = 1e-4; for (let j = 0; j < a.data.length; j += 16) gm = Math.max(gm, Math.abs(a.data[j])); a.edMax = gm; } for (let i = 0; i < cols; i++) { const hh = Math.max(.8, pk[i] / a.edMax * (H - TOP - 26) / 2); g.fillRect(PAD + i, mid - hh, 1, hh * 2); } }
        else { const ns = c.notes || []; let lo = 127, hi = 0; ns.forEach(n => { lo = Math.min(lo, n.m); hi = Math.max(hi, n.m); }); const rng = Math.max(8, hi - lo + 2); ns.forEach(n => { const x0 = xOf(n.s / 4), x1 = xOf((n.s + n.l) / 4); if (x1 < 0 || x0 > w) return; const y = H - 14 - (n.m - lo + 1) / rng * (H - TOP - 30); g.fillRect(x0, y, Math.max(3, x1 - x0 - 1), 7); }); }
        g.fillStyle = 'rgba(7,10,31,.74)'; g.fillRect(0, TOP, Math.max(0, xOf(S)), H); g.fillRect(xOf(Eb), TOP, w, H);
        (c.mutes || []).forEach(([m0, m1]) => { const x0 = xOf(inB + m0), x1 = xOf(inB + m1); g.save(); g.beginPath(); g.rect(x0, TOP, x1 - x0, H); g.clip(); g.fillStyle = 'rgba(7,10,31,.5)'; g.fillRect(x0, TOP, x1 - x0, H); g.strokeStyle = 'rgba(239,59,74,.9)'; g.lineWidth = 3; for (let k = -H; k < x1 - x0 + H; k += 12) { g.beginPath(); g.moveTo(x0 + k, TOP); g.lineTo(x0 + k + H, H + TOP); g.stroke(); } g.restore(); });
        g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.strokeRect(xOf(S) + 1.5, TOP + 1.5, xOf(Eb) - xOf(S) - 3, H - TOP - 3);
        [xOf(S), xOf(Eb)].forEach(x => { g.fillStyle = '#ffd23f'; g.fillRect(x - 10, mid - 30, 20, 60); g.fillStyle = '#070a1f'; g.fillRect(x - 4, mid - 10, 2, 20); g.fillRect(x + 2, mid - 10, 2, 20); });
        if (tool === 'cut' && cut != null) { const x = xOf(cut); g.fillStyle = '#fff'; g.fillRect(x - 1.5, TOP, 3, H); g.font = '20px sans-serif'; g.fillText('✂️', x - 11, H - 6); }
        const zoom = SB / (vB - vA); b.querySelector('#edZ').textContent = '🔍 ×' + (zoom < 10 ? zoom.toFixed(zoom % 1 ? 1 : 0) : Math.round(zoom));
        b.querySelector('#edInfo').textContent = tool === 'cut' ? (cut != null ? '✂️ ' + lab(cut) : 'Touche où couper') : 'De ' + lab(S) + ' à ' + lab(Eb) + ((c.mutes || []).length ? ' · ' + c.mutes.length + ' effacé(s)' : '');
        b.querySelector('#edCut').hidden = !(tool === 'cut' && cut != null);
        b.querySelector('#edHelp').textContent = helps[tool];
      }
      const zoomAt = (f, cx) => { const span = Math.max(.5, Math.min(SB, (vB - vA) / f)); const c0 = cx == null ? (vA + vB) / 2 : cx; let na = c0 - (c0 - vA) / (vB - vA) * span; na = Math.max(0, Math.min(SB - span, na)); vA = na; vB = na + span; draw(); };
      const pts = new Map(); let drag = null, pinch = null;
      cv.addEventListener('pointerdown', e => {
        cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(); pts.set(e.pointerId, e.clientX - r.left);
        if (pts.size === 2) { if (drag && drag.erase) { c.mutes.pop(); } const xs = [...pts.values()]; pinch = { d: Math.abs(xs[0] - xs[1]), c: bOf((xs[0] + xs[1]) / 2), vA, vB }; drag = null; draw(); return; }
        const x = e.clientX - r.left, [S, Eb] = selOf(c);
        if (tool === 'trim') { const dl = Math.abs(x - xOf(S)), dr = Math.abs(x - xOf(Eb)); if (Math.min(dl, dr) < 44) drag = { h: dl <= dr ? 'L' : 'R', x0: x, v0: dl <= dr ? S : Eb }; else drag = { pan: true, x0: x, a0: vA }; }
        else if (tool === 'cut') { const v = snapB(bOf(x)); if (v > S && v < Eb) { cut = v; buzz(v); } drag = { cut: true }; draw(); }
        else { const inB = (c.inBars || 0) * 4, v = snapB(bOf(x)) - inB; const hit = (c.mutes || []).findIndex(([m0, m1]) => v >= m0 - 1e-6 && v <= m1 + 1e-6); if (hit >= 0) { c.mutes.splice(hit, 1); buzz('del' + hit); draw(); drag = null; return; } c.mutes = c.mutes || []; const st = grid || 1 / 16; c.mutes.push([v, v + st]); drag = { erase: true, start: v }; buzz(v); draw(); }
      });
      cv.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId)) return; const r = cv.getBoundingClientRect(); pts.set(e.pointerId, e.clientX - r.left); const x = e.clientX - r.left;
        if (pinch && pts.size >= 2) { const xs = [...pts.values()], d = Math.max(10, Math.abs(xs[0] - xs[1])); const span = Math.max(.5, Math.min(SB, (pinch.vB - pinch.vA) * pinch.d / d)); let na = pinch.c - (pinch.c - pinch.vA) / (pinch.vB - pinch.vA) * span; na = Math.max(0, Math.min(SB - span, na)); vA = na; vB = na + span; draw(); return; }
        if (!drag) return; const [S, Eb] = selOf(c), dv = (x - drag.x0) / (W() - 2 * PAD) * (vB - vA);
        if (drag.h) { const minLen = grid || .25; let v = snapB(drag.v0 + dv); if (drag.h === 'L') { v = Math.max(0, Math.min(Eb - minLen, v)); if (Math.abs(v - S) > 1e-6) { setSel(c, v, Eb); buzz(v); draw(); } } else { v = Math.max(S + minLen, Math.min(SB, v)); if (Math.abs(v - Eb) > 1e-6) { setSel(c, S, v); buzz(v); draw(); } }
          if (x < 24 && vA > 0) { const sh = Math.min(vA, (vB - vA) * .02); vA -= sh; vB -= sh; drag.x0 += 0; } else if (x > W() - 24 && vB < SB) { const sh = Math.min(SB - vB, (vB - vA) * .02); vA += sh; vB += sh; } }
        else if (drag.pan) { const span = vB - vA; let na = drag.a0 - (x - drag.x0) / (W() - 2 * PAD) * span; na = Math.max(0, Math.min(SB - span, na)); vA = na; vB = na + span; draw(); }
        else if (drag.cut) { const v = snapB(bOf(x)); if (v > S && v < Eb && v !== cut) { cut = v; buzz(v); draw(); } }
        else if (drag.erase) { const inB = (c.inBars || 0) * 4, v = Math.max(0, Math.min(c.lenBars * 4, snapB(bOf(x)) - inB)); const m = c.mutes[c.mutes.length - 1], st = grid || 1 / 16; const a0 = Math.min(drag.start, v), a1 = Math.min(c.lenBars * 4, Math.max(drag.start, v) + (v >= drag.start ? st : 0)); if (m[0] !== a0 || m[1] !== a1) { m[0] = a0; m[1] = Math.max(a0 + st, a1); buzz(a0 + ':' + a1); draw(); } }
      });
      const end = e => {
        pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (pts.size) return;
        if (drag && drag.erase) { const ms = (c.mutes || []).sort((p, q) => p[0] - q[0]); const out = []; ms.forEach(m => { const l = out[out.length - 1]; if (l && m[0] <= l[1] + 1e-6) l[1] = Math.max(l[1], m[1]); else out.push(m.slice()); }); c.mutes = out; }
        drag = null; draw(); renderTimeline(); save();
      };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { tool = x.dataset.t; cut = null; b.querySelectorAll('[data-t]').forEach(y => y.classList.toggle('on', y === x)); draw(); });
      b.querySelectorAll('[data-g]').forEach(x => x.onclick = () => { grid = +x.dataset.g; P.edGrid = grid; b.querySelectorAll('[data-g]').forEach(y => y.classList.toggle('on', y === x)); if (grid && grid < 1 && SB / (vB - vA) < 2) { const [S] = selOf(c); zoomAt(SB / (vB - vA) < 1.5 ? 3 : 2, S); } draw(); save(); });
      b.querySelector('#edZi').onclick = () => { const [S, Eb] = selOf(c); zoomAt(2, tool === 'cut' && cut != null ? cut : (S + Eb) / 2); };
      b.querySelector('#edZo').onclick = () => zoomAt(.5);
      b.querySelector('#edAll').onclick = () => { vA = 0; vB = SB; draw(); };
      b.querySelector('#edCut').onclick = () => {
        if ((c.loops || 1) > 1) { toast('Remets la boucle à ×1 pour couper ce bloc'); return; }
        const [S, Eb] = selOf(c); const c2 = clone(c); c2.id = uid();
        const inB = (c.inBars || 0) * 4, k = cut - inB;
        c.mutes = (c.mutes || []).filter(m => m[0] < k).map(m => [m[0], Math.min(m[1], k)]);
        c2.mutes = (c2.mutes || []).filter(m => m[1] > k);
        setSel(c, S, cut); setSel(c2, cut, Eb); c2.loops = 1; c.loops = 1;
        P.clips.push(c2); buzz('cut'); renderTimeline(); save(); closeSheet(); toast('✂️ Coupé en deux blocs : touche celui que tu veux enlever', undo);
      };
      b.querySelector('#edPlay').onclick = () => { closeSheet(); play(c.bar); };
      b.querySelector('#edDone').onclick = () => { closeSheet(); commit(); };
      b.querySelector('#edReset').onclick = () => { c.mutes = []; setSel(c, 0, c.kind === 'audio' ? SB : (c.srcBars || c.lenBars) * 4); c.trimA = 0; c.trimB = null; cut = null; vA = 0; vB = SB; draw(); renderTimeline(); save(); };
      requestAnimationFrame(draw);
    });
  }

  /* ---------- feuille piste ---------- */
  function openTrackSheet(id) {
    const t = P.tracks.find(x => x.id === id); if (!t) return;
    let h = `<div class="sh-t"><span class="em">${t.em}</span><input class="txtin" id="tsName" value="${t.name.replace(/"/g, '&quot;')}" style="font-family:Bungee;font-size:17px"></div>`;
    h += `<div class="blk"><label>Volume</label><input type="range" min="0" max="120" value="${Math.round((t.vol == null ? .85 : t.vol) * 100)}" id="tsVol"></div>`;
    h += `<div class="blk"><div class="tog">Muet<span class="sw ${t.mute ? 'on' : ''}" data-t="mute"></span></div><div class="tog">Solo<span class="sw ${t.solo ? 'on' : ''}" data-t="solo"></span></div></div>`;
    if (t.kind === 'drums') {
      h += `<button class="btn yel full" id="tsBeat">🥁 Ouvrir l'atelier batterie</button>`;
      h += `<div class="blk"><label>Effets</label><div class="fxgrid">${['reverb', 'lofi', 'radio'].map(k => fxBtn(t, k)).join('')}</div></div>`;
    } else {
      if (t.kind === 'inst') h += `<div class="blk"><label>Instrument</label><div class="chips">${INSTS.map(k => `<button class="chip ${t.inst === k ? 'on' : ''}" data-i="${k}">${TYPES[k].em} ${TYPES[k].name}</button>`).join('')}</div></div>`;
      const keys = t.type === 'voix' ? ['echo', 'reverb', 'double', 'autotune', 'radio', 'robot', 'lofi'] : ['echo', 'reverb', 'double', 'radio', 'robot', 'lofi'];
      h += `<div class="blk"><label>Effets</label><div class="fxgrid">${keys.map(k => fxBtn(t, k)).join('')}</div></div>`;
      h += `<button class="danger" id="tsDel">Supprimer la piste</button>`;
    }
    openSheet(h, b => {
      b.querySelector('#tsName').oninput = e => { t.name = e.target.value || t.name; save(); renderTimeline(); };
      const v = b.querySelector('#tsVol'); v.oninput = () => { t.vol = v.value / 100; applyTracks(); }; v.onchange = save;
      b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { const k = x.dataset.t; t[k] = !t[k]; x.classList.toggle('on', t[k]); applyTracks(); renderTimeline(); save(); });
      b.querySelectorAll('[data-fx]').forEach(x => x.onclick = () => { const k = x.dataset.fx; const on = !t.fx[k]; x.classList.toggle('on', on); setFx(t, k, on); });
      b.querySelectorAll('[data-i]').forEach(x => x.onclick = () => { snap(); t.inst = x.dataset.i; const T = TYPES[t.inst]; t.em = T.em; t.color = T.color; b.querySelectorAll('[data-i]').forEach(y => y.classList.toggle('on', y === x)); commit(T.em + ' Rejoué au ' + T.name.toLowerCase(), true); E.note(t.inst, T.range[0] + 7, AC.currentTime + .02, .4, .9, E.chain(t).in); });
      const bb = b.querySelector('#tsBeat'); if (bb) bb.onclick = () => openBeatSheet();
      const d = b.querySelector('#tsDel'); if (d) d.onclick = () => { snap(); P.clips = P.clips.filter(c => c.trackId !== t.id); P.tracks = P.tracks.filter(x => x.id !== t.id); closeSheet(); commit('Piste supprimée', true); };
    });
  }
  function fxBtn(t, k) { const f = FXINFO[k]; return `<button class="fx ${t.fx[k] ? 'on' : ''}" data-fx="${k}"><span class="fe">${f[0]}</span><span><b>${f[1]}</b><small>${f[2]}</small></span></button>`; }

  /* ---------- atelier batterie ---------- */
  let gridCells = [], bbRec = false, bbTimer = null, taps = [], tapT = null, editVar = 'A';
  function gridPH(st) { document.querySelectorAll('.pc.ph').forEach(c => c.classList.remove('ph')); gridCells.forEach(row => row[st] && row[st].classList.add('ph')); }
  function openBeatSheet(autoMic) {
    stop(); editVar = 'A';
    const audioLocked = P.clips.some(c => c.kind === 'audio');
    const h = `<div class="sh-t"><span class="em">🥁</span>Atelier batterie</div>
      <div class="bb"><button class="target" id="bbMic"><span class="r r1"></span><span class="r r2"></span><span class="r r3">🎙️</span></button>
      <div class="bb-st" id="bbSt">Touche la cible et chante ton rythme : <b>boum</b>, <b>tchak</b>, <b>tss</b>.<small>${audioLocked ? 'Le tempo reste à ' + Math.round(P.bpm) + ' BPM pour ne pas décaler tes prises.' : 'Le labo trouve ton tempo tout seul.'}</small></div></div>
      <div class="pads"><button class="pad k" data-p="k">BOUM</button><button class="pad s" data-p="s">TCHAK</button><button class="pad h" data-p="h">TSS</button></div>
      <div class="blk"><label>Style</label><div class="styles">${STYLES.map((s, i) => `<button class="st ${P.style === i ? 'on' : ''}" data-s="${i}">${s.name}</button>`).join('')}</div>
        <div class="row" style="margin-top:10px"><div class="chips"><button class="chip ${P.kit === 'rock' ? 'on' : ''}" data-k="rock">🥁 Rock</button><button class="chip ${P.kit === 'electro' ? 'on' : ''}" data-k="electro">⚡ Électro</button></div></div>
        <label class="lbl" style="margin-top:12px">Swing</label><input type="range" min="0" max="60" value="${P.swing}" id="bbSw"></div>
      <div class="blk"><div class="row"><div class="tabs" style="flex:1"><button data-v="A" class="on">Rythme A</button><button data-v="B">Variation B</button></div><button class="btn yel" id="bbPlay" style="padding:10px 14px">▶</button></div><div class="pgrid" id="bbGrid"></div></div>
      <button class="btn full" data-close>✓ C'est bon</button>`;
    openSheet(h, b => {
      renderPGrid();
      b.querySelector('#bbMic').onclick = bbMic;
      b.querySelectorAll('[data-s]').forEach(x => x.onclick = () => { snap(); const i = +x.dataset.s, S = STYLES[i]; P.style = i; P.patterns.A = parsePat(S.p); P.patterns.B = makeB(P.patterns.A); P.kit = S.kit; E.setKit(P.kit); P.swing = S.swing; if (!P.clips.some(c => c.kind === 'audio')) P.bpm = S.bpm; b.querySelectorAll('[data-s]').forEach(y => y.classList.toggle('on', y === x)); b.querySelectorAll('[data-k]').forEach(y => y.classList.toggle('on', y.dataset.k === P.kit)); b.querySelector('#bbSw').value = P.swing; renderPGrid(); save(); preview(); });
      b.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { P.kit = x.dataset.k; E.setKit(P.kit); b.querySelectorAll('[data-k]').forEach(y => y.classList.toggle('on', y === x)); save(); if (!player.playing) { E.kick(AC.currentTime + .02, 1); E.snare(AC.currentTime + .3, 1); } });
      b.querySelector('#bbSw').oninput = e => { P.swing = +e.target.value; save(); };
      b.querySelectorAll('[data-v]').forEach(x => x.onclick = () => { editVar = x.dataset.v; b.querySelectorAll('[data-v]').forEach(y => y.classList.toggle('on', y === x)); renderPGrid(); if (player.playing) preview(); });
      b.querySelector('#bbPlay').onclick = () => { if (player.playing) { stop(); b.querySelector('#bbPlay').textContent = '▶'; } else preview(); };
      b.querySelectorAll('[data-p]').forEach(x => x.addEventListener('pointerdown', e => { e.preventDefault(); AC.resume(); const ty = x.dataset.p; if (!taps.length && player.playing) stop(); if (navigator.vibrate) navigator.vibrate(12); E.drum(ty, AC.currentTime + .005, 1); taps.push({ t: AC.currentTime, type: ty }); x.classList.add('hit'); setTimeout(() => x.classList.remove('hit'), 90); burst({ k: 'BOUM!', s: 'TCHAK!', h: 'TSS!' }[ty], x, ROWCOL[ty]); clearTimeout(tapT); tapT = setTimeout(finishTaps, 1700); }));
      if (autoMic) setTimeout(() => b.querySelector('#bbSt').innerHTML = '👉 Touche la cible, chante ton rythme 2 ou 3 fois, puis touche-la encore.<small>Ou tape-le sur les pads.</small>', 50);
    }, () => { if (bbRec) bbStop(true); stop(); gridCells = []; renderAll(); });
  }
  function preview() { applyTracks(); player.start(0, { preview: editVar }); const pb = document.getElementById('bbPlay'); if (pb) pb.textContent = '■'; }
  function renderPGrid() {
    const g = document.getElementById('bbGrid'); if (!g) return; g.innerHTML = ''; gridCells = [];
    const pat = P.patterns[editVar];
    ROWS.forEach(r => {
      const row = document.createElement('div'); row.className = 'prow';
      const l = document.createElement('button'); l.className = 'pl'; l.textContent = ROWNAMES[r]; l.style.color = ROWCOL[r]; l.onclick = () => E.drum(r, AC.currentTime + .01, 1);
      const cells = document.createElement('div'); cells.className = 'pcells'; const arr = [];
      for (let i = 0; i < 16; i++) { const c = document.createElement('button'); c.className = 'pc' + (i % 4 === 0 ? ' b' : '') + (i % 4 === 0 && i ? ' g' : '') + (pat[r][i] ? ' on' : ''); c.style.setProperty('--c', ROWCOL[r]); c.onclick = () => { pat[r][i] ^= 1; c.classList.toggle('on', !!pat[r][i]); if (pat[r][i]) E.drum(r, AC.currentTime + .01, 1); save(); }; cells.appendChild(c); arr.push(c); }
      gridCells.push(arr); row.appendChild(l); row.appendChild(cells); g.appendChild(row);
    });
  }
  function bbSay(h) { const s = document.getElementById('bbSt'); if (s) s.innerHTML = h; }
  async function bbMic() {
    AC.resume(); if (bbRec) { bbStop(); return; }
    if (!(await needMic())) return;
    stop(); Mic.start(); bbRec = true; document.getElementById('bbMic').classList.add('rec');
    bbSay('<b style="color:var(--red)">● J\'écoute…</b> chante ton rythme, puis touche la cible.');
    bbTimer = setTimeout(() => bbStop(), 12000);
  }
  async function bbStop(silent) {
    bbRec = false; clearTimeout(bbTimer); const m = document.getElementById('bbMic'); if (m) m.classList.remove('rec');
    const r = await Mic.stop(); if (silent) return;
    if (r.data.length < r.sr * 1.2) { bbSay('Un peu court ! Chante au moins 2 secondes.'); return; }
    bbSay('J\'écoute ton groove… 🎧');
    setTimeout(() => applyGroove(DSP.detectEvents(r.data, r.sr)), 30);
  }
  function finishTaps() { const t = taps; taps = []; if (t.length < 4) { bbSay('Encore quelques coups ! Il m\'en faut au moins 4.'); return; } applyGroove(t); }
  function applyGroove(evts) {
    const locked = P.clips.some(c => c.kind === 'audio');
    if (!evts || evts.length < 3) { bbSay('Je n\'ai pas assez entendu de coups 🤔<small>Plus fort, avec des « boum » et « tchak » bien détachés.</small>'); return; }
    const res = DSP.analyzeGroove(evts, locked ? P.bpm : null); if (!res) { bbSay('Tempo introuvable, réessaie en bouclant ton rythme.'); return; }
    snap();
    if (!locked) P.bpm = Math.round(res.bpm);
    const g = res.groove, A = parsePat(STYLES[P.style].p), any = a => a.some(Boolean);
    if (g.types >= 2) { if (any(g.k)) A.k = g.k.slice(); if (any(g.s)) { A.s = g.s.slice(); if (any(A.c)) A.c = g.s.slice(); } if (any(g.h)) { A.h = g.h.slice(); A.o = A.o.map((v, i) => g.h[i] ? 0 : v); } }
    P.patterns.A = A; P.patterns.B = makeB(A); P.beatboxed = true; editVar = 'A';
    document.querySelectorAll('[data-v]').forEach(y => y.classList.toggle('on', y.dataset.v === 'A'));
    const c = { k: 0, s: 0, h: 0 }; res.evts.forEach(e => c[e.type]++);
    bbSay(`<b>${Math.round(P.bpm)} BPM !</b> ${c.k} boum, ${c.s} tchak, ${c.h} tss.<small>${g.types >= 2 ? 'Ton groove est dans la grille A, la variation B est prête.' : 'J\'ai pris ton tempo. Alterne « boum » et « tchak » pour copier ton groove.'}</small>`);
    renderPGrid(); save(); preview();
  }

  const CLICKS = [['clic', '🔔 Clic'], ['perso', '🎙️ Une vraie voix'], ['fr', '🤖 Robot FR'], ['en', '🤖 Robot EN']];
  function clickChips() { return `<label class="lbl" style="margin-top:4px">Le décompte et le métronome</label><div class="chips" data-clicks>${CLICKS.map(([k, l]) => `<button class="chip ${(P.clickMode || 'clic') === k ? 'on' : ''}" data-cm="${k}">${l}</button>`).join('')}</div><button class="mini" data-vc style="margin-top:8px">🎙️ ${window.LABO_CUSTOM ? 'Changer la voix' : 'Enregistrer une voix'}</button>`; }
  /* voix de décompte perso : on enregistre (ou importe) « un, deux, trois, quatre » et on découpe en 4 */
  function splitCount(x, sr) {
    const hop = Math.round(sr * .01), n = Math.floor(x.length / hop), e = new Float32Array(n); let mx = 0;
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < hop; j++) { const v = x[i * hop + j]; s += v * v; } e[i] = Math.sqrt(s / hop); if (e[i] > mx) mx = e[i]; }
    if (mx < .003) return null;
    const thr = mx * .12; let segs = [], cur = null, gap = 0;
    for (let i = 0; i < n; i++) { if (e[i] > thr) { if (!cur) cur = { a: i, b: i, pk: 0 }; cur.b = i; cur.pk = Math.max(cur.pk, e[i]); gap = 0; } else if (cur && ++gap > 9) { segs.push(cur); cur = null; gap = 0; } }
    if (cur) segs.push(cur);
    segs = segs.filter(s => s.b - s.a >= 6);
    if (segs.length < 4) return null;
    if (segs.length > 4) segs = segs.sort((p, q) => q.pk * (q.b - q.a) - p.pk * (p.b - p.a)).slice(0, 4).sort((p, q) => p.a - q.a);
    let gmx = 0; segs.forEach(s => gmx = Math.max(gmx, s.pk));
    return segs.map(s => { const a = Math.max(0, (s.a - 2) * hop), b = Math.min(x.length, (s.b + 6) * hop); const d = x.slice(a, b); let pk = 0; d.forEach(v => pk = Math.max(pk, Math.abs(v))); const g = .9 / (pk || 1); const f = Math.round(sr * .012); for (let i = 0; i < d.length; i++) { d[i] *= g; if (i < 30) d[i] *= i / 30; if (i > d.length - f) d[i] *= (d.length - i) / f; } return d; });
  }
  /* plan B : on découpe sur les temps attendus (on sait quand tu devais parler) */
  function beatSplit(x, sr, beat, lead) {
    let gm = 0; for (let i = 0; i < x.length; i += 4) gm = Math.max(gm, Math.abs(x[i])); if (gm < .01) return null;
    const parts = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.max(0, Math.floor((lead + i * beat - .08) * sr)), z = Math.min(x.length, Math.floor((lead + (i + 1) * beat - .08) * sr)); if (z - a < sr * .1) return null;
      const w = x.slice(a, z); let pk = 0; w.forEach(v => pk = Math.max(pk, Math.abs(v))); if (pk < gm * .15) return null;
      let s0 = 0, s1 = w.length - 1; while (s0 < w.length && Math.abs(w[s0]) < pk * .08) s0++; while (s1 > s0 && Math.abs(w[s1]) < pk * .04) s1--;
      const d = w.slice(Math.max(0, s0 - Math.floor(sr * .005)), s1 + 1); const g = .9 / pk, f = Math.round(sr * .012);
      for (let k = 0; k < d.length; k++) { d[k] *= g; if (k < 30) d[k] *= k / 30; if (k > d.length - f) d[k] *= (d.length - k) / f; }
      parts.push(d);
    }
    return parts;
  }
  function setCustomCount(parts, sr) { window.LABO_CUSTOM = { sr, parts }; DB.put('kv', 'countVoice', { sr, parts }); }
  function openVoiceCountSheet(back) {
    openSheet(`<div class="sh-t"><span class="em">🎙️</span>Une vraie voix pour compter</div>
      <p class="sh-p">Tu entends d'abord 4 clics pour te caler. Ensuite, dis un mot sur chacun des 4 temps suivants : les mots s'affichent en grand et ton téléphone vibre sur chaque temps. Le labo découpe tout seul.</p>
      <div class="chips" style="margin-bottom:10px"><button class="chip ${P.countLang !== 'en' ? 'on' : ''}" data-lg="fr">🇫🇷 Un, deux…</button><button class="chip ${P.countLang === 'en' ? 'on' : ''}" data-lg="en">🇬🇧 One, two…</button></div>
      <div id="vcBig" style="display:none;text-align:center;margin:6px 0 12px;padding:18px 10px;border-radius:20px;background:var(--navy3);border:3px solid var(--cream)"><div id="vcPhase" style="font-weight:700;font-size:14px;opacity:.8"></div><div id="vcWord" style="font-family:Bungee;font-size:56px;line-height:1.1;margin-top:6px;color:var(--yellow)"></div><div id="vcDots" style="display:flex;justify-content:center;gap:10px;margin-top:10px"></div></div>
      <button class="btn red full" id="vcRec" style="font-family:Bungee;font-size:17px">● Enregistrer ma voix</button>
      <div class="blk"><label>Ou importer un fichier</label><p class="sh-p" style="font-size:13px;margin-bottom:8px">Un mémo vocal, ou une voix générée (ElevenLabs, etc.) qui dit les 4 chiffres.</p><label class="btn ghost full" style="position:relative;overflow:hidden">📁 Choisir un fichier audio<input type="file" accept="audio/*" id="vcFile" style="position:absolute;inset:0;opacity:0"></label></div>
      <div id="vcOut"></div>
      <button class="btn full" id="vcBack">${back ? '← Retour' : 'OK'}</button>`, b => {
      const out = b.querySelector('#vcOut');
      const done = (parts, sr) => {
        if (!parts) { out.innerHTML = '<div class="blk"><b>😕 Je n\'ai pas trouvé 4 mots bien séparés.</b><br><span style="font-size:13px">Laisse un vrai petit blanc entre chaque chiffre et parle bien fort.</span></div>'; return; }
        setCustomCount(parts, sr); P.clickMode = 'perso'; E.clickMode = 'perso'; E._cbp = null; save();
        out.innerHTML = '<div class="blk" style="background:var(--green);color:var(--ink);border-color:var(--ink)"><b>✓ C\'est ta voix qui compte maintenant !</b></div>';
        const t = AC.currentTime + .1, beat = Math.min(.55, 60 / P.bpm); for (let i = 0; i < 4; i++) E.click(t + i * beat, i === 0, 1, i);
      };
      b.querySelector('#vcBack').onclick = () => back ? back() : closeSheet();
      b.querySelectorAll('[data-lg]').forEach(x => x.onclick = () => { P.countLang = x.dataset.lg; b.querySelectorAll('[data-lg]').forEach(y => y.classList.toggle('on', y === x)); save(); });
      /* 4 clics pour se caler, puis tu dis « un, deux, trois, quatre » sur les 4 temps suivants
         (les mots s'affichent en grand et le téléphone vibre sur chaque temps, sans clic pour ne pas salir la prise) */
      const recBtn = b.querySelector('#vcRec'); let busyRec = false;
      recBtn.onclick = async () => {
        AC.resume(); if (busyRec) return; if (!(await needMic())) return;
        busyRec = true; recBtn.disabled = true; recBtn.style.opacity = .5;
        const big = b.querySelector('#vcBig'), ph = b.querySelector('#vcPhase'), wd = b.querySelector('#vcWord'), dots = b.querySelector('#vcDots'); big.style.display = 'block';
        dots.innerHTML = '<i></i><i></i><i></i><i></i>'; dots.querySelectorAll('i').forEach(i => { i.style.cssText = 'width:16px;height:16px;border-radius:50%;background:rgba(246,236,214,.2);display:block'; });
        const beat = 60 / 90, t0 = AC.currentTime + .4, words = (P.clickMode === 'en' || /one/i.test(P.countLang || '')) ? ['ONE', 'TWO', 'THREE', 'FOUR'] : ['UN', 'DEUX', 'TROIS', 'QUATRE'];
        const saved = E.clickMode; E.clickMode = 'clic'; for (let i = 0; i < 4; i++) E.click(t0 + i * beat, i === 0); E.clickMode = saved;
        const recAt = t0 + 3 * beat + .14, endAt = t0 + 8 * beat + .5; let started = false, last = -1;
        const tick = () => {
          const now = AC.currentTime;
          if (!started && now >= recAt) { Mic.start(); started = true; }
          const k = Math.floor((now - t0) / beat);
          if (k !== last && k >= 0 && k < 8) { last = k; const n = k % 4;
            dots.querySelectorAll('i').forEach((d, j) => d.style.background = j === n ? (k < 4 ? 'var(--cream)' : 'var(--red)') : 'rgba(246,236,214,.2)');
            if (k < 4) { ph.textContent = 'Écoute le tempo…'; wd.textContent = String(n + 1); wd.style.color = 'var(--cream)'; }
            else { ph.textContent = '🎙️ À toi, dis :'; wd.textContent = words[n]; wd.style.color = 'var(--yellow)'; if (navigator.vibrate) navigator.vibrate(35); }
            wd.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 160 });
          }
          if (now < endAt) { requestAnimationFrame(tick); return; }
          Mic.stop().then(r => { busyRec = false; recBtn.disabled = false; recBtn.style.opacity = 1; recBtn.textContent = '● Recommencer'; big.style.display = 'none'; done(splitCount(r.data, r.sr) || beatSplit(r.data, r.sr, beat, beat - .14), r.sr); });
        };
        if (k0()) requestAnimationFrame(tick);
        function k0() { ph.textContent = 'Prépare-toi…'; wd.textContent = ''; return true; }
      };
      b.querySelector('#vcFile').onchange = async e => {
        const f = e.target.files[0]; if (!f) return; out.innerHTML = '<div class="blk">🎧 J\'écoute…</div>';
        try { const ab = await new Promise((res, rej) => { f.arrayBuffer().then(buf => { const p = AC.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); }); }); const x = new Float32Array(ab.length); for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let i = 0; i < ab.length; i++) x[i] += d[i] / ab.numberOfChannels; } done(splitCount(x, ab.sampleRate), ab.sampleRate); }
        catch (err) { out.innerHTML = '<div class="blk">Je n\'arrive pas à lire ce fichier.</div>'; }
      };
    });
  }
  function bindClickChips(b, back) { const vc = b.querySelector('[data-vc]'); if (vc) vc.onclick = () => openVoiceCountSheet(back);
    b.querySelectorAll('[data-cm]').forEach(x => x.onclick = () => {
    if (x.dataset.cm === 'perso' && !window.LABO_CUSTOM) { openVoiceCountSheet(back); return; } P.clickMode = x.dataset.cm; E.clickMode = P.clickMode; b.querySelectorAll('[data-cm]').forEach(y => y.classList.toggle('on', y === x)); save(); const t = AC.currentTime + .05, beat = Math.min(.5, 60 / P.bpm); for (let i = 0; i < 4; i++) E.click(t + i * beat, i === 0, 1, i); }); }
  /* ---------- tempo & menu ---------- */
  $('bpmBtn').onclick = () => {
    const locked = P.clips.some(c => c.kind === 'audio'); let taps2 = [];
    openSheet(`<div class="sh-t"><span class="em">⏱️</span>Tempo</div>
      <div class="blk"><div class="stepper" style="justify-content:center"><button data-d="-1">−</button><b id="tpB" style="font-size:40px;min-width:110px">${Math.round(P.bpm)}</b><button data-d="1">+</button></div>
      <button class="btn yel full" id="tpTap">👆 Tape le tempo ici</button>${locked ? '<p class="sh-p" style="font-size:12.5px;margin:10px 0 0">⚠️ Tes prises audio ne suivent pas le tempo : si tu le changes, elles vont se décaler.</p>' : ''}</div>
      <div class="blk">${clickChips()}</div>
      <div class="blk"><div class="tog">Métronome pendant la lecture<span class="sw ${P.metro ? 'on' : ''}" data-t="metro"></span></div><div class="tog">Métronome pendant les prises<span class="sw ${P.metroRec ? 'on' : ''}" data-t="metroRec"></span></div><div class="tog">Lecture en boucle<span class="sw ${P.loop ? 'on' : ''}" data-t="loop"></span></div></div>
      <button class="btn full" data-close>OK</button>`, b => {
      const upd = () => { b.querySelector('#tpB').textContent = Math.round(P.bpm); renderTimeline(); applyTracks(); save(); };
      b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { P.bpm = Math.max(50, Math.min(220, Math.round(P.bpm) + +x.dataset.d)); upd(); });
      b.querySelector('#tpTap').onclick = () => { const n = performance.now(); taps2 = taps2.filter(t => n - t < 2500); taps2.push(n); E.click(AC.currentTime + .005, taps2.length === 1); if (taps2.length >= 3) { const iv = []; for (let i = 1; i < taps2.length; i++) iv.push(taps2[i] - taps2[i - 1]); P.bpm = Math.round(60000 / DSP.median(iv)); upd(); } };
      b.querySelectorAll('[data-t]').forEach(x => x.onclick = () => { const k = x.dataset.t; P[k] = !P[k]; x.classList.toggle('on', P[k]); updatePlayBtn(); save(); });
      bindClickChips(b, () => $('bpmBtn').click());
    });
  };
  $('menuBtn').onclick = () => {
    openSheet(`<div class="sh-t"><span class="em">🧪</span>Le labo <small style="font-family:Space Grotesk;font-size:13px;opacity:.6;margin-left:auto">version ${VERSION}</small></div>
      <div class="reclist">
        <button class="recitem" id="mExp"><span class="ae">💾</span><span><b>Exporter en WAV</b><small>Pour l'envoyer ou l'ouvrir dans ton logiciel</small></span></button>
        <button class="recitem" id="mNew"><span class="ae">✨</span><span><b>Nouvelle maquette</b><small>Repartir d'une page blanche</small></span></button>
        ${isStandalone() ? '' : '<button class="recitem" id="mInst"><span class="ae">📲</span><span><b>Installer l\'appli sur le téléphone</b><small>Une icône sur ton écran d\'accueil, en plein écran</small></span></button>'}
        <div class="recitem"><span class="ae">☀️</span><span style="flex:1"><b>Écran toujours allumé</b><small>${navigator.wakeLock ? 'Le téléphone ne se met pas en veille tant que le Labo est ouvert' : 'Pas disponible sur ce navigateur'}</small></span><span class="sw ${DEV.awake !== false ? 'on' : ''}" id="mAwake"></span></div>
        <button class="recitem" id="mSync"><span class="ae">⏱️</span><span><b>Synchro écouteurs & micro</b><small>${DEV.lat != null ? 'Retard réglé : ' + Math.round(DEV.lat) + ' ms' : 'Pour jouer avec des écouteurs Bluetooth'}</small></span></button>
        <button class="recitem" id="mHelp"><span class="ae">💡</span><span><b>Comment ça marche</b><small>Le labo en 30 secondes</small></span></button>
      </div><div id="mOut"></div>`, b => {
      b.querySelector('#mSync').onclick = () => openSyncSheet();
      const mi = b.querySelector('#mInst'); if (mi) mi.onclick = () => installApp(b.querySelector('#mOut'));
      b.querySelector('#mAwake').onclick = e => { DEV.awake = DEV.awake === false; saveDev(); e.target.classList.toggle('on', DEV.awake !== false); keepAwake(DEV.awake !== false); toast(DEV.awake !== false ? '☀️ L\'écran reste allumé' : '🌙 Veille normale'); };
      b.querySelector('#mExp').onclick = () => exportWav(b.querySelector('#mOut'));
      b.querySelector('#mNew').onclick = () => { b.querySelector('#mOut').innerHTML = `<div class="blk"><p class="sh-p">Tout effacer et recommencer ? Ta maquette actuelle sera perdue (pense à l'exporter avant).</p><div class="row"><button class="btn ghost" data-close style="flex:1">Non</button><button class="btn red" id="mYes" style="flex:1">Oui, on repart</button></div></div>`; b.querySelector('[data-close]').onclick = closeSheet; b.querySelector('#mYes').onclick = () => { stop(); hist.length = 0; P = newProject(); for (const k in AUD) delete AUD[k]; DB.clear('audio'); E.chains = {}; rebuildEngine(); closeSheet(); renderAll(); save(); toast('✨ Nouvelle maquette'); }; };
      b.querySelector('#mHelp').onclick = () => { b.querySelector('#mOut').innerHTML = `<div class="blk sh-p" style="margin-bottom:0">1. <b>Atelier batterie</b> : chante ton rythme, le labo trouve le tempo.<br>2. <b>🔴</b> : enregistre ta guitare ou ta voix pendant que la batterie tourne.<br>3. Touche un bloc pour le <b>boucler</b> et l'allonger.<br>4. <b>Chante une basse ou un violon</b> : le labo transforme ta voix en instrument.<br>5. Les <b>idées ✨</b> en haut ajoutent roulements, basse auto, effets… et ↶ annule tout.<br>Ta maquette est gardée sur ce téléphone, même si tu fermes la page.</div>`; };
    });
  };
  function rebuildEngine() { E = new Labo.Engine(AC); E.setKit(P.kit); E.clickMode = P.clickMode || 'clic'; player = new Labo.Player(E, () => P, hooks); applyTracks(); }
  async function exportWav(out) {
    out.innerHTML = '<p class="sh-p" style="margin-top:12px">🧪 Mixage en cours…</p>';
    stop(); await new Promise(r => setTimeout(r, 30));
    try {
      const sr = 44100, bd = barDur(), len = Math.ceil((P.bars * bd + 3) * sr);
      const off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, len, sr);
      const E2 = new Labo.Engine(off); E2.setKit(P.kit); const any = P.tracks.some(t => t.solo); P.tracks.forEach(t => E2.applyTrack(t, any, P.bpm));
      const pl = new Labo.Player(E2, () => P, hooks); pl.opt = { export: true }; pl.fromBar = 0; pl.firstBar = true;
      const sd = stepDur(); for (let s = 0; s < P.bars * 16; s++) pl.schedule(P, s, .05 + s * sd);
      const buf = await off.startRendering();
      const wav = DSP.encodeWAV([buf.getChannelData(0), buf.getChannelData(1)], sr);
      const name = (P.name || 'maquette').replace(/[^\w\-àâéèêëîïôûùç ]/gi, '').trim().replace(/\s+/g, '-') + '.wav';
      const blob = new Blob([wav], { type: 'audio/wav' }); const url = URL.createObjectURL(blob);
      out.innerHTML = `<div class="blk"><p class="sh-p" style="margin-bottom:6px">✅ ${name} est prêt (${Math.round(P.bars * bd)} s).</p><audio controls src="${url}" style="width:100%"></audio><a class="btn yel full" href="${url}" download="${name}">⬇️ Télécharger</a>${navigator.canShare ? '<button class="btn full" id="mShare">📤 Partager</button>' : ''}</div>`;
      const sb = out.querySelector('#mShare'); if (sb) sb.onclick = async () => { const f = new File([blob], name, { type: 'audio/wav' }); try { if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: P.name }); } catch (e) { } };
    } catch (e) { out.innerHTML = '<p class="sh-p">Oups, l\'export a raté : ' + e.message + '</p>'; }
  }

  function renderAll() { $('projName').value = P.name; renderTimeline(); renderIdeas(); updatePlayBtn(); }

  /* ---------- démarrage ---------- */
  $('installBtn').hidden = isStandalone() || !/Android|iP(hone|ad|od)/.test(navigator.userAgent);
  $('installBtn').onclick = () => installApp();
  $('openBtn').onclick = async () => {
    const A = window.AudioContext || window.webkitAudioContext;
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    try { AC = iOS ? new A({ latencyHint: 'interactive', sampleRate: 48000 }) : new A({ latencyHint: 'interactive' }); } catch (e) { AC = new A(); }
    AC.resume();
    AC.onstatechange = () => { if (AC.state === 'interrupted' || AC.state === 'suspended') { if (player && player.playing && !recState) stop(); } };
    $('openBtn').textContent = '…';
    await DB.open();
    const dv = await DB.get('kv', 'device'); if (dv) { if (DEV.latHow === 'défaut' && dv.lat != null) { DEV.lat = dv.lat; DEV.latHow = dv.latHow; } if (!DEV.micId && dv.micId) DEV.micId = dv.micId; if (dv.awake === false && DEV.awake == null) DEV.awake = false; } saveDev();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    const cv = await DB.get('kv', 'countVoice'); if (cv && cv.parts) window.LABO_CUSTOM = cv;
    const saved = await DB.get('kv', 'project');
    if (saved && saved.v === 1) {
      P = saved;
      for (const c of P.clips) { const ids = [c.audioId, c.src].filter(Boolean); for (const id of ids) if (!AUD[id]) { const a = await DB.get('audio', id); if (a) AUD[id] = { data: a.data, sr: a.sr }; } }
      P.clips = P.clips.filter(c => c.kind !== 'audio' || AUD[c.audioId]);
    }
    rebuildEngine();
    P.tracks.forEach(t => { if (t.fx && t.fx.autotune) trackClips(t).forEach(c => c.audioId && tunedBuf(c.audioId)); });
    $('splash').hidden = true; $('app').hidden = false; keepAwake(true);
    renderAll(); requestAnimationFrame(frame);
    if (saved) toast('🧪 Ta maquette est revenue');
  };
  document.addEventListener('visibilitychange', () => { if (!AC) return; if (document.hidden) { if (recState) $('rpStop').click(); else if (player && player.playing) stop(); } else { if (AC.state !== 'running') AC.resume(); keepAwake(true); } });
})();
