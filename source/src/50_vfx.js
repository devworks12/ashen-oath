// ------------------------------------------------------------------ VFX: pooled particles, sparks, sword trails, shockwave rings, ambient ash
class ParticlePool {
  constructor(cap, additive) {
    this.cap = cap; this.n = 0;
    this.P = new Float32Array(cap * 3); this.V = new Float32Array(cap * 3);
    this.C0 = new Float32Array(cap * 3); this.C1 = new Float32Array(cap * 3);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.s1 = new Float32Array(cap); this.a0 = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.kind = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.BufferAttribute(new Float32Array(cap * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('col', this.aC); g.setAttribute('sz', this.aS);
    g.setDrawRange(0, 0);
    this.U = { uPR: { value: 1 }, uH: { value: 800 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.U, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 col; attribute vec2 sz; uniform float uPR,uH; varying vec4 vC; varying float vK;
        void main(){ vC=col; vK=sz.y; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(sz.x*uH*uPR/-mv.z, 256.0); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec4 vC; varying float vK;
        void main(){ vec2 p=gl_PointCoord-0.5; float d=length(p)*2.0; if(d>1.0) discard;
          float a = vK<0.5 ? (1.0-d*d)*(1.0-d) : (vK<1.5 ? smoothstep(1.0,0.0,d)*smoothstep(1.0,0.2,d) : smoothstep(1.0,0.55,d));
          vec3 c=vC.rgb; if(vK>0.5&&vK<1.5) c+=vec3(0.6,0.5,0.35)*smoothstep(0.45,0.0,d)*vC.a;
          gl_FragColor=vec4(c, a*vC.a); }`,
    });
    this.points = new THREE.Points(g, mat); this.points.frustumCulled = false; this.points.renderOrder = 8;
    this.geo = g; this.budget = 1;
    scene.add(this.points);
  }
  // kind: 0 soft smoke, 1 fire/ember glow, 2 hard ash flake
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, grav = 0, drag = 0, kind = 0) {
    if (this.n >= this.cap * this.budget) return;
    const i = this.n++, k = i * 3;
    this.P[k] = x; this.P[k + 1] = y; this.P[k + 2] = z; this.V[k] = vx; this.V[k + 1] = vy; this.V[k + 2] = vz;
    this.C0[k] = c0[0]; this.C0[k + 1] = c0[1]; this.C0[k + 2] = c0[2]; this.C1[k] = c1[0]; this.C1[k + 1] = c1[1]; this.C1[k + 2] = c1[2];
    this.life[i] = 0; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.grav[i] = grav; this.drag[i] = drag; this.kind[i] = kind;
  }
  update(dt) {
    const P = this.P, V = this.V;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) { this.kill(i); i--; continue; }
      const k = i * 3, dr = Math.exp(-this.drag[i] * dt);
      V[k] *= dr; V[k + 1] = V[k + 1] * dr - this.grav[i] * dt; V[k + 2] *= dr;
      P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
      if (P[k + 1] < 0.01) { P[k + 1] = 0.01; V[k + 1] *= -0.2; V[k] *= 0.6; V[k + 2] *= 0.6; }
    }
    const aP = this.aP.array, aC = this.aC.array, aS = this.aS.array;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3, t = this.life[i] / this.max[i];
      aP[k] = P[k]; aP[k + 1] = P[k + 1]; aP[k + 2] = P[k + 2];
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t);
      aC[i * 4] = lerp(this.C0[k], this.C1[k], t); aC[i * 4 + 1] = lerp(this.C0[k + 1], this.C1[k + 1], t); aC[i * 4 + 2] = lerp(this.C0[k + 2], this.C1[k + 2], t); aC[i * 4 + 3] = this.a0[i] * fade;
      aS[i * 2] = lerp(this.s0[i], this.s1[i], t); aS[i * 2 + 1] = this.kind[i];
    }
    this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = true;
    this.aP.clearUpdateRanges(); this.aC.clearUpdateRanges(); this.aS.clearUpdateRanges();
    this.aP.addUpdateRange(0, this.n * 3); this.aC.addUpdateRange(0, this.n * 4); this.aS.addUpdateRange(0, this.n * 2);
    this.geo.setDrawRange(0, this.n);
    this.U.uPR.value = renderer.getPixelRatio(); this.U.uH.value = viewH / (2 * Math.tan(camera.fov * DEG / 2));
  }
  kill(i) {
    const j = --this.n; if (i === j) return;
    const k = i * 3, l = j * 3;
    for (const A of [this.P, this.V, this.C0, this.C1]) { A[k] = A[l]; A[k + 1] = A[l + 1]; A[k + 2] = A[l + 2]; }
    for (const A of [this.life, this.max, this.s0, this.s1, this.a0, this.grav, this.drag, this.kind]) A[i] = A[j];
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

class Sparks {
  constructor(cap) {
    this.cap = cap; this.n = 0;
    this.P = new Float32Array(cap * 3); this.V = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(new Float32Array(cap * 6), 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(new Float32Array(cap * 6), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('color', this.aC);
    this.geo = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 9;
    scene.add(this.lines);
  }
  emit(p, dir, n, speed, spread, hot = 1) {
    for (let j = 0; j < n && this.n < this.cap; j++) {
      const i = this.n++, k = i * 3;
      const v = V3(dir.x + rand(-spread, spread), dir.y + rand(-spread, spread) + 0.3, dir.z + rand(-spread, spread)).normalize().multiplyScalar(speed * rand(0.4, 1.2));
      this.P[k] = p.x; this.P[k + 1] = p.y; this.P[k + 2] = p.z; this.V[k] = v.x; this.V[k + 1] = v.y; this.V[k + 2] = v.z;
      this.life[i] = 0; this.max[i] = rand(0.15, 0.45) * hot;
    }
  }
  update(dt) {
    const P = this.P, V = this.V, a = this.aP.array, c = this.aC.array;
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt;
      if (this.life[i] > this.max[i]) {
        const j = --this.n; const k = i * 3, l = j * 3;
        for (let q = 0; q < 3; q++) { P[k + q] = P[l + q]; V[k + q] = V[l + q]; }
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; i--; continue;
      }
      const k = i * 3;
      V[k + 1] -= 9.8 * dt; V[k] *= 0.985; V[k + 2] *= 0.985;
      P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
      if (P[k + 1] < 0.02) { P[k + 1] = 0.02; V[k + 1] *= -0.35; }
    }
    for (let i = 0; i < this.n; i++) {
      const k = i * 3, o = i * 6, t = 1 - this.life[i] / this.max[i];
      a[o] = P[k]; a[o + 1] = P[k + 1]; a[o + 2] = P[k + 2];
      a[o + 3] = P[k] - V[k] * 0.025; a[o + 4] = P[k + 1] - V[k + 1] * 0.025; a[o + 5] = P[k + 2] - V[k + 2] * 0.025;
      const b = t * t * 3;
      c[o] = b * 1.0; c[o + 1] = b * 0.62; c[o + 2] = b * 0.28; c[o + 3] = 0; c[o + 4] = 0; c[o + 5] = 0;
    }
    this.aP.needsUpdate = this.aC.needsUpdate = true;
    this.geo.setDrawRange(0, this.n * 2);
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// thin sword trail ribbon: samples (base, tip) and fades by age
class Trail {
  constructor(color, maxSeg = 20) {
    this.max = maxSeg; this.samples = []; this.on = false; this.life = 0.16;
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(new Float32Array(maxSeg * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.BufferAttribute(new Float32Array(maxSeg * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('ab', this.aA);
    const idx = []; for (let i = 0; i < maxSeg - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.U = { uC: { value: new THREE.Color(color) }, uI: { value: 1 } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.U, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec2 ab; varying vec2 vA; void main(){ vA=ab; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 uC; uniform float uI; varying vec2 vA; void main(){ float a=vA.x*vA.x*smoothstep(0.0,0.9,vA.y)*(0.5+0.5*vA.y); gl_FragColor=vec4(uC*a*uI,1.0);} `,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.geo = g;
    scene.add(this.mesh);
  }
  push(base, tip, t) {
    if (!this.on) return;
    this.samples.unshift({ b: base.clone(), t: tip.clone(), time: t });
    if (this.samples.length > this.max) this.samples.pop();
  }
  update(now) {
    while (this.samples.length && now - this.samples[this.samples.length - 1].time > this.life) this.samples.pop();
    const n = this.samples.length, p = this.aP.array, a = this.aA.array;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i], age = 1 - (now - s.time) / this.life;
      p.set([s.b.x, s.b.y, s.b.z, s.t.x, s.t.y, s.t.z], i * 6);
      a.set([age, 0, age, 1], i * 4);
    }
    this.aP.needsUpdate = this.aA.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }
  clear() { this.samples.length = 0; this.geo.setDrawRange(0, 0); }
}

const VFX = {
  add: null, norm: null, sparks: null, rings: [], flashes: [], hazards: [],
  init() {
    this.add = new ParticlePool(1400, true);
    this.norm = new ParticlePool(1100, false);
    this.sparks = new Sparks(260);
    // shockwave rings
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 72, 1), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uA: { value: 0 }, uR: { value: 1 }, uC: { value: new THREE.Color(1.0, 0.38, 0.1) } },
        vertexShader: `varying float vR; void main(){ vR=length(position.xy); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: `uniform float uA; uniform vec3 uC; varying float vR; void main(){ float e=1.0-abs(vR-0.95)*20.0; gl_FragColor=vec4(uC*uA*(0.4+0.6*e),1.0);} `,
      }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 6; scene.add(m);
      this.rings.push({ m, t: 1, dur: 1, r0: 0, r1: 1, w: 0.6, active: false, cb: null });
    }
    // flash sprites
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false; s.renderOrder = 10; scene.add(s); this.flashes.push({ s, t: 1, dur: 0.12, size: 1, col: new THREE.Color() });
    }
    // ambient ash (GPU-animated)
    const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = rand(-18, 18); pos[i * 3 + 1] = rand(0, 12); pos[i * 3 + 2] = rand(-18, 18); seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.ashU = { uTime: { value: 0 }, uPR: { value: 1 }, uWarm: { value: 0 }, uCam: { value: V3() }, uH: { value: 800 } };
    this.ash = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.ashU, transparent: true, depthWrite: false,
      vertexShader: `attribute float seed; uniform float uTime,uPR,uWarm,uH; uniform vec3 uCam; varying float vA; varying float vW;
        void main(){ vec3 p=position; float t=uTime*(0.12+seed*0.12);
          p.x+=sin(t*1.3+seed*20.0)*1.5+uTime*0.12; p.z+=cos(t*1.1+seed*13.0)*1.5; p.y=mod(p.y - uTime*(0.12+seed*0.15) , 12.0);
          p.xz=uCam.xz+mod(p.xz-uCam.xz+18.0,36.0)-18.0;
          vec4 mv=modelViewMatrix*vec4(p,1.0); float d=-mv.z;
          vA=smoothstep(0.5,2.5,d)*smoothstep(26.0,12.0,d)*(0.35+0.65*seed); vW=step(0.72,seed)*uWarm;
          gl_PointSize=uPR*uH*(0.018+seed*0.02)/d; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; varying float vW; void main(){ vec2 p=gl_PointCoord-0.5; float d=length(p)*2.0; if(d>1.0) discard; float a=smoothstep(1.0,0.3,d)*vA;
        vec3 c=mix(vec3(0.62,0.64,0.68),vec3(1.6,0.6,0.2),vW); gl_FragColor=vec4(c,a*0.55); }`,
    }));
    this.ash.frustumCulled = false; this.ash.renderOrder = 4; scene.add(this.ash);
    this.setQuality(Q);
  },
  setQuality(q) {
    if (!this.add) return;
    this.add.budget = this.norm.budget = q.particles;
    this.ash.geometry.setDrawRange(0, q.ash);
  },
  update(dt, t) {
    this.add.update(dt); this.norm.update(dt); this.sparks.update(dt);
    this.ashU.uTime.value = t; this.ashU.uPR.value = renderer.getPixelRatio(); this.ashU.uCam.value.copy(camera.position); this.ashU.uWarm.value = ARENA.warm;
    this.ashU.uH.value = viewH / (2 * Math.tan(camera.fov * DEG / 2));
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt; const k = r.t / r.dur;
      if (k >= 1) { r.active = false; r.m.visible = false; continue; }
      const rad = lerp(r.r0, r.r1, EASE.out(k));
      r.m.scale.setScalar(rad); r.m.material.uniforms.uA.value = (1 - k) * (1 - k) * 1.5;
      r.rad = rad;
      if (r.cb) r.cb(rad, k);
    }
    for (const f of this.flashes) {
      if (!f.s.visible) continue;
      f.t += dt; const k = f.t / f.dur;
      if (k >= 1) { f.s.visible = false; continue; }
      f.s.scale.setScalar(f.size * (0.6 + k * 0.8)); f.s.material.opacity = (1 - k) * (1 - k);
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]; h.t += dt;
      if (h.t > h.dur) { this.hazards.splice(i, 1); continue; }
      const k = 1 - h.t / h.dur;
      const n = Math.ceil(dt * 90 * Q.particles);
      for (let j = 0; j < n; j++) {
        const u = Math.random(), x = lerp(h.a.x, h.b.x, u) + rand(-0.25, 0.25), z = lerp(h.a.z, h.b.z, u) + rand(-0.25, 0.25);
        this.add.emit(x, 0.05, z, rand(-0.2, 0.2), rand(1.2, 2.6) * k, rand(-0.2, 0.2), rand(0.35, 0.7), rand(0.35, 0.6) * k + 0.1, 0.05, [2.4, 0.9, 0.25], [0.8, 0.12, 0.02], 0.8, -0.6, 1.5, 1);
      }
      if (Math.random() < dt * 20) this.norm.emit(lerp(h.a.x, h.b.x, Math.random()), 0.4, lerp(h.a.z, h.b.z, Math.random()), 0, rand(0.6, 1.2), 0, 1.4, 0.4, 1.4, [0.1, 0.09, 0.09], [0.05, 0.05, 0.05], 0.45, -0.2, 0.6, 0);
    }
  },
  flash(p, size, color, dur = 0.12) {
    const f = this.flashes.find((f) => !f.s.visible) || this.flashes[0];
    f.s.position.copy(p); f.s.material.color.set(color); f.size = size; f.t = 0; f.dur = dur; f.s.visible = true;
  },
  ring(p, r0, r1, dur, cb, col) {
    const r = this.rings.find((r) => !r.active) || this.rings[0];
    r.m.material.uniforms.uC.value.setRGB(...(col || [1.0, 0.38, 0.1]));
    r.m.position.set(p.x, 0.06, p.z); r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1; r.active = true; r.m.visible = true; r.cb = cb; r.rad = r0;
  },
  dust(p, n, spread = 0.5, up = 1) {
    for (let i = 0; i < n; i++) this.norm.emit(p.x + rand(-spread, spread), p.y + rand(0, 0.2), p.z + rand(-spread, spread), rand(-1, 1) * 1.2, rand(0.3, 1.2) * up, rand(-1, 1) * 1.2, rand(0.7, 1.4), rand(0.18, 0.35), rand(0.7, 1.3), [0.33, 0.32, 0.31], [0.22, 0.22, 0.23], 0.5, 0.2, 2.2, 0);
  },
  ashBurst(p, n, speed = 1.5) {
    for (let i = 0; i < n; i++) this.norm.emit(p.x, p.y, p.z, rand(-1, 1) * speed, rand(-0.3, 1) * speed, rand(-1, 1) * speed, rand(0.6, 1.3), 0.05, 0.03, [0.55, 0.55, 0.56], [0.3, 0.3, 0.3], 0.9, 1.5, 1.5, 2);
  },
  embers(p, n, spread = 0.2, up = 1.2) {
    for (let i = 0; i < n; i++) this.add.emit(p.x + rand(-spread, spread), p.y + rand(-spread, spread), p.z + rand(-spread, spread), rand(-0.4, 0.4), rand(0.3, 1) * up, rand(-0.4, 0.4), rand(0.5, 1.2), rand(0.03, 0.06), 0.01, [2.5, 1.0, 0.3], [1.2, 0.2, 0.02], 1, -0.35, 1.2, 1);
  },
  // violet conjured-light particles (Boss II)
  motes(p, n, spread = 0.2, up = 1.0) {
    for (let i = 0; i < n; i++) this.add.emit(p.x + rand(-spread, spread), p.y + rand(-spread, spread), p.z + rand(-spread, spread), rand(-0.4, 0.4), rand(0.2, 1) * up, rand(-0.4, 0.4), rand(0.4, 1.0), rand(0.03, 0.065), 0.01, [1.5, 0.9, 2.8], [0.35, 0.12, 0.8], 1, -0.25, 1.4, 1);
  },
  glint(p) {
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; this.add.emit(p.x, p.y, p.z, Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0, 0.18, 0.05, 0.005, [2.2, 2.3, 2.6], [0.6, 0.7, 1.0], 1, 0, 6, 1); }
  },
  fireLine(a, b, dur) { this.hazards.push({ a: a.clone(), b: b.clone(), dur, t: 0, tick: 0 }); },
  clear() { this.add.clear(); this.norm.clear(); this.sparks.clear(); this.hazards.length = 0; for (const r of this.rings) { r.active = false; r.m.visible = false; } for (const f of this.flashes) f.s.visible = false; },
};
