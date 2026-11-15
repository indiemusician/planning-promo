/* Labo à maquettes — moteur son : batterie, instruments, effets, lecteur multipiste */
(function (root) {
  "use strict";

  const DRUM_ROWS = ['k', 's', 'c', 'h', 'o', 'ta', 'tb'];
  const FILLS = [
    { s: 'x.x.xxxx', ta: '........', tb: '........' },
    { s: 'x.x.x...', ta: '....xx..', tb: '......xx' },
    { s: 'xxxx....', ta: '....xx..', tb: '......xx' },
    { s: '..x.x.xx', ta: 'x.......', tb: '.x......' }
  ];
  function makeFill(base, n) {
    const f = {}; DRUM_ROWS.forEach(r => f[r] = (base[r] || Array(16).fill(0)).slice());
    const T = FILLS[((n % FILLS.length) + FILLS.length) % FILLS.length];
    for (let i = 8; i < 16; i++) {
      f.s[i] = T.s[i - 8] === 'x' ? 1 : 0; f.ta[i] = T.ta[i - 8] === 'x' ? 1 : 0; f.tb[i] = T.tb[i - 8] === 'x' ? 1 : 0;
      f.c[i] = 0; if (i >= 12) { f.h[i] = 0; f.o[i] = 0; f.k[i] = 0; }
    }
    return f;
  }

  function curve(k) { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } return c; }
  function crushCurve(levels) { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round(Math.tanh(1.5 * x) * levels) / levels; } return c; }
  function makeIR(ac, sec, pow) {
    const len = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const a = b.getChannelData(c); for (let i = 0; i < len; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, pow); }
    return b;
  }
  function smartEcho(bpm) {
    const beat = 60 / bpm; let t = beat * .75, label = 'croche pointée';
    if (t > .5) { t = beat * .5; label = 'croche'; }
    return { time: t, fb: t > .38 ? .3 : .38, label };
  }

  class Engine {
    constructor(ac) {
      this.ac = ac; this.kit = 'rock';
      this.out = ac.createGain();
      /* compresseur doux (lent, il ne module pas les graves) + écrêtage tout en douceur à la fin : plus de grésillement */
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 2.5; comp.attack.value = .012; comp.release.value = .3;
      const pre = ac.createGain(); pre.gain.value = .8;
      const soft = ac.createWaveShaper(); const sc = new Float32Array(4096); for (let i = 0; i < 4096; i++) { const v = i / 4095 * 2 - 1; sc[i] = Math.abs(v) < .7 ? v : Math.sign(v) * (.7 + .3 * Math.tanh((Math.abs(v) - .7) / .3)); } soft.curve = sc;
      this.master = ac.createGain(); this.master.gain.value = .9;
      this.out.connect(pre); pre.connect(comp); comp.connect(soft); soft.connect(this.master); this.master.connect(ac.destination);
      const len = ac.sampleRate * 2; this.noise = ac.createBuffer(1, len, ac.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.revIn = ac.createGain(); const conv = ac.createConvolver(); conv.buffer = makeIR(ac, 1.6, 3); const revOut = ac.createGain(); revOut.gain.value = .8;
      this.revIn.connect(conv); conv.connect(revOut); revOut.connect(this.out);
      this.roomIn = ac.createGain(); const room = ac.createConvolver(); room.buffer = makeIR(ac, .6, 4); this.roomIn.connect(room); room.connect(this.out);
      this.drumDrive = ac.createWaveShaper(); this.drumDrive.oversample = 'none';
      this.drumIn = ac.createGain(); this.drumIn.connect(this.drumDrive);
      this.drumRoom = ac.createGain(); this.drumIn.connect(this.drumRoom); this.drumRoom.connect(this.roomIn);
      this.chains = {}; this.openG = null; this.setKit('rock');
    }
    setKit(k) { this.kit = k; this.drumDrive.curve = curve(k === 'electro' ? 2.8 : 1.4); this.drumRoom.gain.value = k === 'electro' ? .06 : .22; }
    /* chaîne de piste à la demande : un effet n'existe (et ne consomme) que s'il est allumé */
    chain(track) {
      if (this.chains[track.id]) return this.chains[track.id];
      const ac = this.ac, c = { fx: {}, key: '' };
      c.in = ac.createGain(); c.post = ac.createGain(); c.vol = ac.createGain();
      c.pan = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain();
      c.in.connect(c.post); c.post.connect(c.vol); c.vol.connect(c.pan); c.pan.connect(this.out);
      this.chains[track.id] = c; return c;
    }
    buildSeries(c, fx) {
      const ac = this.ac, key = ['radio', 'robot', 'lofi'].filter(k => fx[k]).join(',');
      if (key === c.key) return; c.key = key;
      try { c.in.disconnect(); } catch (e) { }
      (c.series || []).forEach(n => { try { n.disconnect(); if (n.stop) n.stop(); } catch (e) { } }); c.series = [];
      let node = c.in; const keep = n => { c.series.push(n); return n; };
      if (fx.radio) { const hp = keep(ac.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = 520; const lp = keep(ac.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 3200; const pk = keep(ac.createBiquadFilter()); pk.type = 'peaking'; pk.frequency.value = 1600; pk.gain.value = 6; const sh = keep(ac.createWaveShaper()); sh.curve = curve(4); const g = keep(ac.createGain()); g.gain.value = .6; node.connect(hp); hp.connect(lp); lp.connect(pk); pk.connect(sh); sh.connect(g); node = g; }
      if (fx.robot) { const g = keep(ac.createGain()); g.gain.value = 0; const o = keep(ac.createOscillator()); o.frequency.value = 52; o.connect(g.gain); o.start(); const og = keep(ac.createGain()); og.gain.value = 1.5; node.connect(g); g.connect(og); node = og; }
      if (fx.lofi) { const sh = keep(ac.createWaveShaper()); sh.curve = crushCurve(10); const lp = keep(ac.createBiquadFilter()); lp.type = 'lowpass'; lp.frequency.value = 2600; const hp = keep(ac.createBiquadFilter()); hp.type = 'highpass'; hp.frequency.value = 180; const g = keep(ac.createGain()); g.gain.value = .85; node.connect(sh); sh.connect(lp); lp.connect(hp); hp.connect(g); node = g; }
      node.connect(c.post);
    }
    setSend(c, name, on, build) {
      if (on && !c.fx[name]) c.fx[name] = build();
      else if (!on && c.fx[name]) { c.fx[name].forEach(n => { try { n.disconnect(); if (n.stop) n.stop(); } catch (e) { } }); delete c.fx[name]; }
    }
    applyTrack(track, anySolo, bpm) {
      const c = this.chain(track), fx = track.fx || {}, t = this.ac.currentTime, ac = this.ac;
      this.buildSeries(c, fx);
      const e = smartEcho(bpm);
      this.setSend(c, 'echo', !!fx.echo, () => {
        const send = ac.createGain(); send.gain.value = .8; const dl = ac.createDelay(2); const fhp = ac.createBiquadFilter(); fhp.type = 'highpass'; fhp.frequency.value = 380; const flp = ac.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 3400; const fb = ac.createGain(); const outg = ac.createGain(); outg.gain.value = .6;
        c.post.connect(send); send.connect(dl); dl.connect(fhp); fhp.connect(flp); flp.connect(fb); fb.connect(dl); flp.connect(outg); outg.connect(c.vol);
        c.echoSend = send; c.delay = dl; c.fb = fb; return [send, dl, fhp, flp, fb, outg];
      });
      if (c.fx.echo) { c.delay.delayTime.setTargetAtTime(e.time, t, .02); c.fb.gain.value = e.fb; } else c.echoSend = null;
      c.echoOn = !!fx.echo;
      this.setSend(c, 'double', !!fx.double, () => {
        const nodes = [], dbl = ac.createGain(); nodes.push(dbl); c.post.connect(dbl);
        [[.021, .55, -.75], [.033, .75, .75]].forEach(([dt, rate, p]) => {
          const dl = ac.createDelay(.1); dl.delayTime.value = dt; const lfo = ac.createOscillator(); lfo.frequency.value = rate; const lg = ac.createGain(); lg.gain.value = .0025; lfo.connect(lg); lg.connect(dl.delayTime); lfo.start();
          const pn = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain(); if (pn.pan) pn.pan.value = p; const g = ac.createGain(); g.gain.value = .6;
          dbl.connect(dl); dl.connect(g); g.connect(pn); pn.connect(c.vol); nodes.push(dl, lfo, lg, pn, g);
        });
        return nodes;
      });
      this.setSend(c, 'rev', !!fx.reverb, () => { const g = ac.createGain(); g.gain.value = .45; c.post.connect(g); g.connect(this.revIn); return [g]; });
      const audible = !track.mute && (!anySolo || track.solo);
      c.vol.gain.setTargetAtTime(audible ? (track.vol == null ? .9 : track.vol) : 0, t, .02);
      if (c.pan.pan) c.pan.pan.value = track.pan || 0;
      if (track.kind === 'drums') this.drumDrive.connect(c.in);
    }
    duck(track, env, when, off, dur) {
      const c = this.chain(track); if (!c.echoOn || !c.echoSend || !env || env.length < 2) return;
      const rate = 40; const i0 = Math.floor(off * rate), n = Math.max(2, Math.floor(dur * rate));
      const cv = new Float32Array(n); for (let i = 0; i < n; i++) { const v = env[Math.min(env.length - 1, i0 + i)] || 0; cv[i] = .12 + .88 * Math.pow(1 - Math.min(1, v * 1.4), 2); }
      try { c.ducking = true; c.echoSend.gain.cancelScheduledValues(when); c.echoSend.gain.setValueCurveAtTime(cv, when, Math.max(.05, dur - .01)); c.echoSend.gain.setValueAtTime(.8, when + dur); } catch (e) { }
    }
    resetDucks() { Object.values(this.chains).forEach(c => { c.ducking = false; if (!c.echoSend) return; try { c.echoSend.gain.cancelScheduledValues(0); c.echoSend.gain.value = .8; } catch (e) { } }); }

    /* ---------- batterie ---------- */
    env(g, t, peak, dec, att) { att = att || .001; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + att); g.gain.exponentialRampToValueAtTime(.0001, t + dec); }
    nz(t, dur) { const s = this.ac.createBufferSource(); s.buffer = this.noise; s.start(t, Math.random() * .9); s.stop(t + dur + .05); return s; }
    kick(t, v) {
      const ac = this.ac, el = this.kit === 'electro', o = ac.createOscillator(), g = ac.createGain();
      o.frequency.setValueAtTime(el ? 165 : 118, t); o.frequency.exponentialRampToValueAtTime(el ? 43 : 52, t + (el ? .09 : .12));
      this.env(g, t, 1.05 * v, el ? .62 : .42); o.connect(g); g.connect(this.drumIn); o.start(t); o.stop(t + .7);
      const n = this.nz(t, .025), f = ac.createBiquadFilter(), ng = ac.createGain(); f.type = 'highpass'; f.frequency.value = el ? 3200 : 1600;
      this.env(ng, t, (el ? .22 : .38) * v, .02); n.connect(f); f.connect(ng); ng.connect(this.drumIn);
    }
    snare(t, v) {
      const ac = this.ac, el = this.kit === 'electro', n = this.nz(t, .3), f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = el ? 'highpass' : 'bandpass'; f.frequency.value = el ? 1500 : 2700; f.Q.value = .6;
      this.env(g, t, .8 * v, el ? .17 : .25); n.connect(f); f.connect(g); g.connect(this.drumIn);
      const o = ac.createOscillator(), og = ac.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(el ? 245 : 205, t); o.frequency.exponentialRampToValueAtTime(el ? 160 : 172, t + .08);
      this.env(og, t, .6 * v, .12); o.connect(og); og.connect(this.drumIn); o.start(t); o.stop(t + .2);
    }
    clap(t, v) {
      const ac = this.ac, n = this.nz(t, .35), f = ac.createBiquadFilter(), g = ac.createGain(); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 1.1;
      g.gain.setValueAtTime(.0001, t);
      [0, .011, .022].forEach(d => { g.gain.setValueAtTime(.9 * v, t + d + .0005); g.gain.exponentialRampToValueAtTime(.1 * v, t + d + .009); });
      g.gain.setValueAtTime(.7 * v, t + .032); g.gain.exponentialRampToValueAtTime(.0001, t + .27); n.connect(f); f.connect(g); g.connect(this.drumIn);
    }
    hat(t, open, v) {
      const ac = this.ac, el = this.kit === 'electro';
      if (this.openG) { try { this.openG.gain.cancelScheduledValues(t); this.openG.gain.setTargetAtTime(.0001, t, .008); } catch (e) { } this.openG = null; }
      const g = ac.createGain(), hp = ac.createBiquadFilter(), pk = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = el ? 8000 : 7000; pk.type = 'peaking'; pk.frequency.value = el ? 10500 : 9000; pk.Q.value = 1.2; pk.gain.value = 6;
      const dur = open ? .38 : .05; this.nz(t, dur).connect(hp); hp.connect(pk); pk.connect(g); g.connect(this.drumIn); this.env(g, t, (open ? .34 : .4) * v, dur);
      if (open) this.openG = g;
    }
    tom(t, v, hi) {
      const ac = this.ac, o = ac.createOscillator(), g = ac.createGain(); const f = hi ? 200 : 120;
      o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + .25);
      this.env(g, t, .85 * v, .45); o.connect(g); g.connect(this.drumIn); o.start(t); o.stop(t + .5);
      const n = this.nz(t, .05), ng = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; this.env(ng, t, .2 * v, .05); n.connect(lp); lp.connect(ng); ng.connect(this.drumIn);
    }
    crash(t, v) {
      const ac = this.ac, g = ac.createGain(), hp = ac.createBiquadFilter(), pk = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200; pk.type = 'peaking'; pk.frequency.value = 6500; pk.Q.value = .8; pk.gain.value = 5;
      this.nz(t, 1.5).connect(hp); hp.connect(pk); pk.connect(g); g.connect(this.drumIn); this.env(g, t, .3 * v, 1.5, .003);
    }
    click(t, accent, vol, n) {
      const bufs = this.clickMode && this.clickMode !== 'clic' ? this.countBufs(this.clickMode) : null;
      if (bufs) { const s = this.ac.createBufferSource(); s.buffer = bufs[((n || 0) % 4 + 4) % 4]; const g = this.ac.createGain(); g.gain.value = (vol == null ? 1 : vol) * (accent ? 1 : .8); s.connect(g); g.connect(this.out); s.start(Math.max(t, this.ac.currentTime)); return; }
      const ac = this.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = accent ? 1900 : 1250;
      this.env(g, t, (accent ? .35 : .22) * (vol == null ? 1 : vol), .04); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + .06);
    }
    drum(row, t, v) {
      switch (row) {
        case 'k': return this.kick(t, v); case 's': return this.snare(t, v); case 'c': return this.clap(t, v);
        case 'h': return this.hat(t, false, v); case 'o': return this.hat(t, true, v);
        case 'ta': return this.tom(t, v, true); case 'tb': return this.tom(t, v, false); case 'cr': return this.crash(t, v);
      }
    }

    /* ---------- instruments ---------- */
    note(inst, midi, t, dur, vel, dest) {
      const ac = this.ac, f = 440 * Math.pow(2, (midi - 69) / 12), nodes = [];
      const amp = ac.createGain(); amp.connect(dest);
      const osc = (type, fr, det) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = fr; if (det) o.detune.value = det; o.start(t); nodes.push(o); return o; };
      let rel = .1, end;
      if (inst === 'basse') {
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5; lp.frequency.setValueAtTime(1100, t); lp.frequency.exponentialRampToValueAtTime(260, t + .25); lp.connect(amp);
        osc('sawtooth', f).connect(lp); const sub = osc('sine', f); const sg = ac.createGain(); sg.gain.value = .6; sub.connect(sg); sg.connect(amp);
        amp.gain.setValueAtTime(.0001, t); amp.gain.exponentialRampToValueAtTime(.45 * vel, t + .008); amp.gain.setTargetAtTime(.32 * vel, t + .05, .2); rel = .08;
      } else if (inst === 'violon') {
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400; const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1100; pk.gain.value = 4;
        lp.connect(pk); pk.connect(amp);
        const lfo = ac.createOscillator(); lfo.frequency.value = 5.6; const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(14, t + .35); lfo.connect(lg); lfo.start(t); nodes.push(lfo);
        [-6, 6].forEach(d => { const o = osc('sawtooth', f, d); lg.connect(o.detune); o.connect(lp); });
        amp.gain.setValueAtTime(.0001, t); amp.gain.exponentialRampToValueAtTime(.16 * vel, t + .09); rel = .25;
      } else if (inst === 'cordes') {
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2300; lp.connect(amp);
        [-9, 0, 9].forEach(d => osc('sawtooth', f, d).connect(lp));
        amp.gain.setValueAtTime(.0001, t); amp.gain.exponentialRampToValueAtTime(.08 * vel, t + .3); rel = .5;
      } else {
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(1300, t + .3); lp.connect(amp);
        osc('square', f).connect(lp); osc('sawtooth', f, 7).connect(lp);
        amp.gain.setValueAtTime(.0001, t); amp.gain.exponentialRampToValueAtTime(.14 * vel, t + .01); amp.gain.setTargetAtTime(.1 * vel, t + .05, .3); rel = .15;
      }
      end = t + Math.max(dur, inst === 'cordes' ? .32 : inst === 'violon' ? .1 : .02);
      amp.gain.setTargetAtTime(.0001, end, rel / 3);
      nodes.forEach(n => n.stop(end + rel * 2));
      return nodes;
    }
  }

  /* ---------- lecteur ---------- */
  class Player {
    constructor(E, get, hooks) { this.E = E; this.get = get; this.h = hooks || {}; this.playing = false; this.src = []; this.vis = []; this.timer = null; }
    stepDur() { return 60 / this.get().bpm / 4; }
    barDur() { return this.stepDur() * 16; }
    start(fromBar, opt) {
      this.stop(true); opt = opt || {}; this.opt = opt; const ac = this.E.ac, p = this.get();
      this.fromBar = fromBar || 0; this.step = this.fromBar * 16; this.firstBar = true; this.endAt = 0;
      let t0 = ac.currentTime + .1;
      if (opt.countIn) { const beat = this.stepDur() * 4; for (let i = 0; i < 4; i++) this.E.click(t0 + i * beat, i === 0, 1, i); this.countInStart = t0; t0 += beat * 4; }
      this.songStart = t0; this.nextTime = t0; this.playing = true; this.early = new Set();
      const anySolo = p.tracks.some(t => t.solo); p.tracks.forEach(t => this.E.applyTrack(t, anySolo, p.bpm));
      this.tick(); this.timer = setInterval(() => this.tick(), 25);
    }
    tick() {
      if (!this.playing) return; const ac = this.E.ac, p = this.get();
      while (!this.endAt && this.nextTime < ac.currentTime + .15) {
        this.schedule(p, this.step, this.nextTime); this.vis.push({ step: this.step, t: this.nextTime });
        this.nextTime += this.stepDur(); this.step++;
        if (this.opt.preview) continue;
        if (this.step >= p.bars * 16) {
          if (this.opt.recording && this.h.extend) this.h.extend();
          else if (p.loop) { this.step = (p.loopFrom || 0) * 16; }
          else this.endAt = this.nextTime;
        }
      }
      /* les blocs qui démarrent un poil avant la mesure (première note gardée) sont programmés plus tôt */
      if (!this.opt.preview && !this.endAt && this.step % 16 !== 0) {
        const toBar = 16 - (this.step % 16), bt = this.nextTime + toBar * this.stepDur(); let b = (this.step + toBar) / 16;
        if (b >= p.bars) b = (p.loop && !this.opt.recording) ? (p.loopFrom || 0) : -1;
        const key = Math.round(bt * 100);
        if (b >= 0 && bt - .6 < ac.currentTime + .15 && !this.early.has(key)) { this.early.add(key); this.bar(p, b, bt, false); }
      }
      if (this.endAt && ac.currentTime > this.endAt + .2) { this.stop(); if (this.h.onEnd) this.h.onEnd(); }
    }
    schedule(p, s, t) {
      const E = this.E, st = s % 16;
      if (this.opt.preview) { const pat = p.patterns[this.opt.preview] || p.patterns.A; this.drums(p, pat, st, t, false); return; }
      const bar = Math.floor(s / 16);
      if (!this.opt.export && !this.opt.quiet && (p.metro || (this.opt.recording && p.metroRec)) && st % 4 === 0) E.click(t, st === 0, 1, st / 4);
      if (this.opt.quiet) { if (st % 4 === 0) E.click(t, st === 0, .45, st / 4); return; }
      const v = p.drumBars[bar] || 'A';
      if (v !== '-') {
        const prev = bar > 0 ? p.drumBars[bar - 1] : null;
        if (st === 0 && prev && (prev === 'F' || (prev !== v && prev !== '-' && v !== 'F'))) E.crash(t, 1);
        const pat = v === 'F' ? makeFill(p.patterns.A, bar) : (p.patterns[v] || p.patterns.A);
        this.drums(p, pat, st, t, v === 'F');
      }
      if (st === 0) { if (!this.early || !this.early.has(Math.round(t * 100))) this.bar(p, bar, t, this.firstBar && bar === this.fromBar); this.firstBar = false; }
    }
    drums(p, pat, st, t, fill) {
      const tt = st % 2 === 1 ? t + (p.swing || 0) / 100 * this.stepDur() * .66 : t;
      DRUM_ROWS.forEach(r => {
        if (!pat[r] || !pat[r][st]) return;
        let v = 1; if (r === 'h') v = st % 4 === 0 ? 1 : .65; if (fill && st >= 8 && (r === 's' || r === 'ta' || r === 'tb')) v = .55 + .45 * (st - 8) / 7;
        this.E.drum(r, tt, v);
      });
    }
    bar(p, bar, t, isStart) {
      const bd = this.barDur();
      p.clips.forEach(c => {
        const tr = p.tracks.find(x => x.id === c.trackId); if (!tr) return;
        for (let r = 0; r < (c.loops || 1); r++) {
          const sb = c.bar + r * c.lenBars;
          if (sb === bar) this.clip(p, c, tr, t, 0);
          else if (isStart && sb < bar && bar < sb + c.lenBars) this.clip(p, c, tr, t, (bar - sb) * bd);
        }
      });
    }
    clip(p, c, tr, t, offset) {
      const E = this.E, ac = E.ac, rep = c.lenBars * this.barDur(), dest = E.chain(tr).in;
      if (c.kind === 'audio') {
        const buf = this.h.buffer && this.h.buffer(c, tr); if (!buf) return;
        const cin = (c.pre || 0) + (c.inBars || 0) * this.barDur();
        let when = t + (c.nudge || 0) / 1000, off = offset;
        if (when < t && offset === 0) { off += t - when; when = t; }
        let lead = 0; if (offset === 0 && c.lead > 0 && !(c.trimA > 0) && !(c.inBars > 0)) { lead = Math.min(c.lead, cin + off); when -= lead; off -= lead; }
        if (when < ac.currentTime) { off += ac.currentTime - when; lead = Math.max(0, lead - (ac.currentTime - when)); when = ac.currentTime; }
        if (cin + off < 0) { when -= cin + off; off = -cin; }
        const dur = Math.min(buf.duration - cin - off, rep - offset + lead); if (dur <= .02) return;
        const s = ac.createBufferSource(); s.buffer = buf; const g = ac.createGain(); const gv = c.gain == null ? 1 : c.gain; g.gain.value = gv;
        const beat = this.barDur() / 4;
        Labo.allMutes(c).forEach(([a, b]) => {
          const st = Math.max(when, when + a * beat - off), en = Math.min(when + dur, when + b * beat - off); if (en <= st + .005) return;
          g.gain.setValueAtTime(gv, st); g.gain.linearRampToValueAtTime(0, st + .008); g.gain.setValueAtTime(0, Math.max(st + .008, en - .008)); g.gain.linearRampToValueAtTime(gv, en);
        });
        g.gain.setValueAtTime(gv, when + dur - .015); g.gain.linearRampToValueAtTime(0, when + dur);
        s.connect(g); g.connect(dest); s.start(when, cin + off, dur); this.src.push(s);
        if (tr.fx && tr.fx.echo && this.h.env) E.duck(tr, this.h.env(c), when, cin + off, dur);
      } else if (c.kind === 'inst') {
        const sd = this.stepDur();
        const ins = (c.inBars || 0) * 16, mutes = Labo.allMutes(c);
        (c.notes || []).forEach(n => {
          const sr = n.s - ins; if (sr < 0) return; if (mutes.some(([a, b]) => sr / 4 >= a && sr / 4 < b)) return;
          const ns = sr * sd; if (ns >= rep || ns < offset) return;
          const dur = Math.max(.05, Math.min(n.l * sd, rep - ns) * .94);
          const nodes = E.note(tr.inst || 'synthe', n.m + (c.oct || 0) * 12, t + ns - offset, dur, n.v || .9, dest);
          this.src.push.apply(this.src, nodes);
        });
      }
    }
    stop(silent) {
      clearInterval(this.timer); this.timer = null; const now = this.E.ac.currentTime;
      this.src.forEach(s => { try { s.stop(now + .01); } catch (e) { } }); this.src = []; this.vis = [];
      if (this.playing) this.E.resetDucks();
      this.playing = false; this.endAt = 0;
    }
    timeOfBar(b) { return this.songStart + (b - this.fromBar) * this.barDur(); }
  }

  /* zones muettes d'un bloc (en temps) : effacements + début/fin raccourcis au temps près */
  function allMutes(c) { const m = (c.mutes || []).map(x => x.slice()); if (c.trimA > 0) m.push([0, c.trimA]); if (c.trimB != null && c.trimB < c.lenBars * 4) m.push([c.trimB, c.lenBars * 4]); return m.sort((x, y) => x[0] - y[0]); }
  root.Labo = { Engine, Player, makeFill, smartEcho, DRUM_ROWS, curve, allMutes };
})(window);
