// ------------------------------------------------------------------ procedural audio: cathedral reverb, synthesized SFX, adaptive score
const AUDIO = {
  ctx: null, ready: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.9;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.master.connect(this.lp); this.lp.connect(this.comp); this.comp.connect(c.destination);
    this.sfx = c.createGain(); this.music = c.createGain();
    this.sfx.gain.value = SETTINGS.sfx; this.music.gain.value = SETTINGS.music * 0.8;
    this.rev = c.createConvolver(); this.rev.buffer = this.impulse(3.4, 2.6);
    this.revIn = c.createGain(); this.revIn.gain.value = 0.55;
    this.revIn.connect(this.rev); this.rev.connect(this.master);
    this.sfx.connect(this.master); this.sfx.connect(this.revIn);
    this.music.connect(this.master); const mr = c.createGain(); mr.gain.value = 0.6; this.music.connect(mr); mr.connect(this.revIn);
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.ready = true;
    MUSIC.init();
    this.ambience();
  },
  impulse(sec, decay) {
    const c = this.ctx, n = c.sampleRate * sec, b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) { const t = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < c.sampleRate * 0.012 ? 0.3 : 1); } }
    return b;
  },
  get t() { return this.ctx ? this.ctx.currentTime : 0; },
  env(g, t, a, peak, dec, sus = 0) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + dec); },
  noise(t, dur, type, f0, f1, q, peak, a = 0.005, out = this.sfx, pan = 0) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); this.env(g, t, a, peak, dur);
    let node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    s.connect(f); f.connect(g); node.connect(out);
    s.start(t, Math.random() * 1.5); s.stop(t + a + dur + 0.05);
  },
  tone(t, type, f0, f1, dur, peak, a = 0.004, out = this.sfx) {
    const c = this.ctx, o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = c.createGain(); this.env(g, t, a, peak, dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dur + 0.05);
  },
  metal(t, base, peak, dec, bright = 1) {
    const ratios = [1, 2.76, 5.4, 8.93, 13.3];
    ratios.forEach((r, i) => this.tone(t, 'sine', base * r * rand(0.99, 1.01), base * r * 0.995, dec * (1 - i * 0.14), peak * (i ? 0.5 * bright / i : 1)));
  },
  play(name, p = {}) {
    if (!this.ready) return;
    const t = this.t + 0.005, pan = p.pan || 0;
    switch (name) {
      case 'whoosh': { const h = p.heavy || 0; this.noise(t, 0.22 + h * 0.15, 'bandpass', 500 - h * 180, 1700 - h * 500, 1.2, 0.35 + h * 0.2, 0.06 + h * 0.03, this.sfx, pan); break; }
      case 'bossWhoosh': { this.noise(t, 0.35, 'bandpass', 260, 900, 1.0, 0.55, 0.05); this.noise(t + 0.05, 0.3, 'lowpass', 500, 160, 0.7, 0.3, 0.02); break; }
      case 'clash': this.metal(t, rand(520, 640), 0.22, 0.9, 1); this.noise(t, 0.05, 'highpass', 3000, 2000, 0.7, 0.5, 0.001); break;
      case 'block': this.metal(t, rand(380, 440), 0.18, 0.6, 0.7); this.noise(t, 0.08, 'bandpass', 1800, 800, 1, 0.45, 0.001); this.tone(t, 'sine', 120, 60, 0.15, 0.3); break;
      case 'parry':
        this.metal(t, 740, 0.3, 1.8, 1.4); this.metal(t + 0.01, 1110, 0.12, 1.4, 1);
        this.noise(t, 0.06, 'highpass', 5000, 3000, 0.7, 0.8, 0.001); this.tone(t, 'sine', 180, 50, 0.3, 0.55); break;
      case 'hitBoss': this.noise(t, 0.12, 'bandpass', 1500, 500, 0.9, 0.5, 0.001); this.metal(t, rand(300, 360), 0.09, 0.35, 0.6); this.tone(t, 'sine', 110, 50, 0.16, 0.45); break;
      case 'hitBossHeavy': this.noise(t, 0.2, 'bandpass', 1100, 300, 0.9, 0.7, 0.001); this.metal(t, rand(240, 280), 0.14, 0.6, 0.6); this.tone(t, 'sine', 90, 38, 0.3, 0.7); break;
      case 'hitPlayer': this.tone(t, 'sine', 95, 40, 0.25, 0.8); this.noise(t, 0.16, 'lowpass', 1400, 300, 0.8, 0.7, 0.001); this.metal(t, 460, 0.06, 0.25, 0.4); break;
      case 'stepBoss': this.tone(t, 'sine', 62, 38, 0.18, 0.5); this.noise(t, 0.08, 'lowpass', 700, 200, 0.7, 0.35, 0.002); this.metal(t + 0.01, rand(900, 1100), 0.018, 0.12, 0.5); break;
      case 'stepPlayer': this.noise(t, 0.06, 'bandpass', 900, 400, 1, 0.12, 0.002, this.sfx, pan); break;
      case 'armor': for (let i = 0; i < 3; i++) this.noise(t + i * rand(0.02, 0.05), 0.04, 'bandpass', rand(3500, 6000), 3000, 6, 0.06, 0.001); break;
      case 'dodge': this.noise(t, 0.2, 'bandpass', 700, 1500, 0.8, 0.28, 0.03); this.noise(t + 0.12, 0.1, 'lowpass', 900, 300, 0.7, 0.16, 0.003); break;
      case 'perfect': this.noise(t, 0.35, 'highpass', 3000, 7000, 0.7, 0.25, 0.01); this.tone(t, 'sine', 1320, 1760, 0.4, 0.12, 0.01); this.tone(t, 'sine', 660, 880, 0.5, 0.08, 0.01); break;
      case 'guardBreak': this.metal(t, 300, 0.3, 1.2, 1.2); this.tone(t, 'sine', 70, 30, 0.6, 0.8); this.noise(t, 0.3, 'lowpass', 2500, 200, 0.7, 0.6, 0.001); break;
      case 'heal':
        for (const f of [523.25, 659.25, 783.99, 1046.5]) this.tone(t, 'sine', f, f * 1.003, 1.3, 0.06, 0.25);
        this.noise(t, 0.9, 'bandpass', 2500, 5000, 2, 0.08, 0.2); break;
      case 'grabTell': {
        const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(75, t + 0.8);
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1200, t + 0.8);
        const g = c.createGain(); this.env(g, t, 0.3, 0.35, 0.6); o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 1);
        this.noise(t, 0.8, 'bandpass', 400, 2200, 3, 0.18, 0.5);
        this.tone(t + 0.55, 'sine', 1800, 1800, 0.35, 0.07, 0.01);
        break;
      }
      case 'grab': this.tone(t, 'sine', 80, 40, 0.3, 0.6); this.metal(t, 380, 0.1, 0.5, 0.5); break;
      case 'slam': this.tone(t, 'sine', 55, 26, 1.2, 1.0); this.noise(t, 0.5, 'lowpass', 1600, 120, 0.7, 0.9, 0.001); this.noise(t + 0.05, 0.9, 'bandpass', 900, 300, 0.5, 0.35, 0.02); break;
      case 'slamTell': {
        this.noise(t, 1.2, 'lowpass', 180, 2400, 1.5, 0.35, 1.05);
        this.tone(t, 'sawtooth', 40, 70, 1.25, 0.12, 1.1);
        this.noise(t, 1.2, 'bandpass', 600, 1400, 1.5, 0.2, 1.0);
        break;
      }
      case 'delayTell': for (let i = 0; i < 6; i++) this.metal(t + i * 0.09, rand(1300, 1600), 0.012, 0.08, 0.3); this.noise(t, 0.5, 'bandpass', 250, 180, 2, 0.1, 0.2); break;
      case 'fire': this.noise(t, p.dur || 1.2, 'lowpass', 1400, 600, 0.6, 0.25, 0.08); for (let i = 0; i < 10; i++) this.noise(t + rand(0, (p.dur || 1) * 0.8), 0.02, 'highpass', 3000, 2500, 0.7, rand(0.05, 0.14), 0.001); break;
      case 'transition':
        this.tone(t, 'sawtooth', 36.7, 73.4, 3.4, 0.2, 2.8); this.tone(t, 'sawtooth', 55, 110, 3.4, 0.12, 2.8);
        this.noise(t, 3.0, 'bandpass', 150, 1800, 1.5, 0.28, 2.5);
        this.noise(t + 2.75, 1.4, 'lowpass', 3000, 300, 0.6, 0.8, 0.02); this.tone(t + 2.75, 'sine', 60, 30, 1.2, 0.9); break;
      case 'plunge': this.metal(t, 260, 0.25, 1.4, 1.2); this.noise(t, 0.4, 'lowpass', 2000, 200, 0.7, 0.8, 0.001); this.tone(t, 'sine', 70, 35, 0.6, 0.8); break;
      case 'stagger': this.metal(t, 200, 0.2, 1.0, 0.8); this.tone(t, 'sine', 65, 32, 0.6, 0.8); this.noise(t, 0.3, 'lowpass', 1400, 200, 0.7, 0.5, 0.001); break;
      case 'death':
        this.tone(t, 'sine', 48, 24, 4.5, 0.7, 0.4); this.noise(t, 4.5, 'lowpass', 900, 80, 0.6, 0.45, 1.2);
        for (let i = 0; i < 40; i++) this.noise(t + 1 + rand(0, 3.5), 0.05, 'bandpass', rand(600, 2400), 400, 2, rand(0.03, 0.09), 0.002);
        break;
      case 'kneel': this.metal(t, 180, 0.22, 1.4, 0.8); this.tone(t, 'sine', 60, 30, 0.5, 0.8); this.noise(t, 0.3, 'lowpass', 1800, 150, 0.7, 0.5, 0.001); break;
      case 'finalBlow': this.metal(t, 330, 0.35, 2.2, 1.5); this.tone(t, 'sine', 50, 25, 1.4, 1.0); this.noise(t, 0.6, 'lowpass', 3000, 200, 0.7, 0.9, 0.001); break;
      case 'glint': this.tone(t, 'sine', 2637, 2600, 0.5, 0.035, 0.002); this.tone(t, 'sine', 3951, 3900, 0.3, 0.015, 0.002); break;
      case 'ui': this.tone(t, 'sine', 880, 660, 0.08, 0.08); this.metal(t, 1200, 0.015, 0.2, 0.3); break;
      case 'deny': this.tone(t, 'sine', 180, 140, 0.12, 0.12); break;
      case 'fallen': this.tone(t, 'sine', 146.8, 146.8, 3.5, 0.18, 0.6); this.tone(t, 'sine', 174.6, 174.6, 3.5, 0.12, 0.8); this.tone(t, 'sine', 73.4, 73.4, 3.5, 0.2, 0.5); break;
      case 'victory': for (const [f, d] of [[293.66, 0], [440, 0.4], [587.33, 0.8], [698.46, 1.3], [880, 1.8]]) this.tone(t + d, 'sine', f, f, 3.5 - d, 0.07, 0.3); break;
    }
  },
  // cathedral ambience: slow wind through the breach + distant fire crackle (kept well under the mix)
  ambience() {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.035;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency);
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.11; const lg2 = c.createGain(); lg2.gain.value = 0.02; lfo2.connect(lg2); lg2.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(); lfo.start(); lfo2.start();
    this.ambNext = 0;
  },
  ambTick() {
    if (!this.ready || this.t < this.ambNext) return;
    this.ambNext = this.t + rand(0.08, 0.45);
    this.noise(this.t + 0.01, 0.015, 'highpass', rand(2500, 5000), 2200, 0.7, rand(0.008, 0.025), 0.001);
    if (Math.random() < 0.08) this.noise(this.t + 0.02, 0.25, 'lowpass', 700, 300, 0.7, 0.02, 0.05);
  },
  muffle(on, dur = 0.8) {
    if (!this.ready) return;
    const f = this.lp.frequency; f.cancelScheduledValues(this.t); f.setValueAtTime(f.value, this.t);
    f.exponentialRampToValueAtTime(on ? 480 : 20000, this.t + dur);
  },
  setMuted(m) { if (this.ready) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.t, 0.05); },
  volumes() { if (!this.ready) return; this.sfx.gain.value = SETTINGS.sfx; this.music.gain.value = SETTINGS.music * 0.8; },
};

// Generative score: one theme in D minor. Phase 1 = drone, pad, sparse bell motif. Phase 2 adds drums, choir, low brass.
const MUSIC = {
  on: false, phase: 1, bar: 0, next: 0, bus: null, BAR: 4.0,
  chords: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]], // Dm Bb Gm A (midi)
  motif: [[74, 0], [77, 1], [76, 1.5], [69, 2.5], [74, 8], [72, 9], [70, 9.5], [69, 10.5]],
  init() {
    const c = AUDIO.ctx;
    this.bus = c.createGain(); this.bus.gain.value = 0; this.bus.connect(AUDIO.music);
    this.p2 = c.createGain(); this.p2.gain.value = 0; this.p2.connect(this.bus);
    // drone
    this.drone = [];
    for (const [f, d] of [[36.71, -6], [36.71, 7], [55.0, 3]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 180; fl.Q.value = 0.8;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + Math.random() * 0.05; const lg = c.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(fl.frequency);
      const g = c.createGain(); g.gain.value = 0.05;
      o.connect(fl); fl.connect(g); g.connect(this.bus); o.start(); lfo.start();
      this.drone.push(fl);
    }
  },
  mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  start(phase = 1) {
    if (!AUDIO.ready) return;
    this.on = true; this.phase = phase; this.bar = 0; this.next = AUDIO.t + 0.1;
    const g = this.bus.gain; g.cancelScheduledValues(AUDIO.t); g.setValueAtTime(g.value, AUDIO.t); g.linearRampToValueAtTime(1, AUDIO.t + 2.5);
    this.setPhase(phase, 0.1);
  },
  setPhase(p, fade = 2) {
    this.phase = p; if (!AUDIO.ready) return;
    const g = this.p2.gain; g.cancelScheduledValues(AUDIO.t); g.setValueAtTime(g.value, AUDIO.t); g.linearRampToValueAtTime(p === 2 ? 1 : 0, AUDIO.t + fade);
    for (const f of this.drone) f.frequency.setTargetAtTime(p === 2 ? 320 : 180, AUDIO.t, 1);
  },
  stop(fade = 0.3) {
    this.on = false; if (!AUDIO.ready) return;
    const g = this.bus.gain; g.cancelScheduledValues(AUDIO.t); g.setValueAtTime(g.value, AUDIO.t); g.linearRampToValueAtTime(0, AUDIO.t + fade);
  },
  pad(t, notes, dur, out, vol = 0.03) {
    const c = AUDIO.ctx;
    for (const n of notes) for (const d of [-8, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.mtof(n); o.detune.value = d;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 1.4); g.gain.setValueAtTime(vol, t + dur - 1.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
      o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.7);
    }
  },
  bell(t, m, vol, out) {
    const c = AUDIO.ctx, f = this.mtof(m);
    const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
    car.frequency.value = f; mod.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + 2.5);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    car.start(t); mod.start(t); car.stop(t + 3.1); mod.stop(t + 3.1);
  },
  drum(t, vol) {
    const c = AUDIO.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(this.p2); o.start(t); o.stop(t + 0.65);
    AUDIO.noise(t, 0.12, 'lowpass', 900, 200, 0.7, vol * 0.5, 0.001, this.p2);
  },
  choir(t, notes, dur) {
    const c = AUDIO.ctx;
    for (const n of notes) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.mtof(n + 12);
      const vib = c.createOscillator(); vib.frequency.value = 5.2; const vg = c.createGain(); vg.gain.value = 4; vib.connect(vg); vg.connect(o.detune);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.016, t + 1.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
      for (const [ff, q] of [[700, 6], [1150, 8]]) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q; o.connect(bp); bp.connect(g); }
      g.connect(this.p2); o.start(t); vib.start(t); o.stop(t + dur + 0.5); vib.stop(t + dur + 0.5);
    }
  },
  brass(t, m, dur) {
    const c = AUDIO.ctx;
    for (const d of [-5, 5]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.mtof(m); o.detune.value = d;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2; f.frequency.setValueAtTime(150, t); f.frequency.linearRampToValueAtTime(700, t + 0.35); f.frequency.linearRampToValueAtTime(260, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 0.12); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(this.p2); o.start(t); o.stop(t + dur + 0.05);
    }
  },
  update() {
    AUDIO.ambTick();
    if (!this.on || !AUDIO.ready) return;
    while (this.next < AUDIO.t + 0.3) {
      const t = this.next, B = this.BAR, ch = this.chords[this.bar % 4];
      this.pad(t, ch, B, this.bus, this.phase === 2 ? 0.024 : 0.03);
      // motif (every other 4-bar cycle in phase 1, always in phase 2)
      const cyc = Math.floor(this.bar / 4);
      if (this.phase === 2 || cyc % 2 === 1) for (const [m, beat] of this.motif) { const bb = beat - (this.bar % 4) * 4; if (bb >= 0 && bb < 4) this.bell(t + bb * (B / 4), m, 0.05, this.bus); }
      if (this.phase === 2) {
        const beats = [0, 1.5, 2, 3, 3.5];
        for (const b of beats) this.drum(t + b * (B / 4), b === 0 ? 0.55 : 0.32);
        if (this.bar % 2 === 0) this.choir(t, ch, B * 2);
        this.brass(t, ch[0] - 12, B * 0.45); this.brass(t + B * 0.5, ch[0] - 12, B * 0.3);
      }
      this.bar++; this.next += B;
    }
  },
};
