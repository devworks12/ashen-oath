// ------------------------------------------------------------------ WORLD LAYERS: arcades, torches, gate guardians, the view through the breach
// Foreground (arena props) · midground (graveyard, giant statue, dead trees, bridge) · background (castle, towers, mountains).
let worldUpdate = () => {};
const BLOBS = [];

// gothic pointed-arch frame as a single U-shaped outline (open at the bottom, no holes)
function pointedPts(W, H, n = 10) {
  const r = W * 0.85, sy = H - Math.sqrt(r * r - (r - W / 2) * (r - W / 2));
  const cL = -W / 2 + r, cR = W / 2 - r, tL = Math.acos((W / 2 - r) / r), tR = Math.acos((r - W / 2) / r);
  const pts = [[-W / 2, 0], [-W / 2, sy]];
  for (let i = 1; i <= n; i++) { const a = Math.PI + (tL - Math.PI) * i / n; pts.push([cL + Math.cos(a) * r, sy + Math.sin(a) * r]); }
  for (let i = 1; i <= n; i++) { const a = tR - tR * i / n; pts.push([cR + Math.cos(a) * r, sy + Math.sin(a) * r]); }
  pts.push([W / 2, 0]);
  return pts;
}
function gothicArchGeo(w, h, thick, depth, n = 10) {
  const o = pointedPts(w, h, n), i = pointedPts(w - thick * 2, h - thick, n).reverse();
  const sh = new THREE.Shape(); sh.moveTo(o[0][0], o[0][1]);
  for (const p of o.slice(1)) sh.lineTo(p[0], p[1]);
  for (const p of i) sh.lineTo(p[0], p[1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
function deadTreeGeo(seed, h) {
  const rnd = mulberry(seed), geos = [];
  const branch = (base, dir, len, r, depth) => {
    const end = base.clone().addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(r * 0.55, r, len, 6, 1, true);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
    g.applyQuaternion(q); g.translate(base.x, base.y, base.z);
    geos.push(g.toNonIndexed());
    if (depth <= 0) return;
    const n = depth > 2 ? 2 : 2 + (rnd() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const d = dir.clone().add(V3(rand(-0.9, 0.9) * (1 + rnd() * 0.3), rand(-0.1, 0.5), rand(-0.9, 0.9))).normalize();
      branch(end, d, len * (0.55 + rnd() * 0.25), r * 0.55, depth - 1);
    }
  };
  branch(V3(0, -0.3, 0), V3(rand(-0.15, 0.15), 1, rand(-0.15, 0.15)).normalize(), h * 0.45, h * 0.045, 4);
  return BGU.mergeGeometries(geos.map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
}
function grassTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = 4 + Math.random() * 56, h = 30 + Math.random() * 32, lean = (Math.random() - 0.5) * 16;
    g.strokeStyle = `rgba(${140 + Math.random() * 40},${150 + Math.random() * 30},${110 + Math.random() * 30},1)`; g.lineWidth = 1.5 + Math.random() * 1.5;
    g.beginPath(); g.moveTo(x, 64); g.quadraticCurveTo(x + lean * 0.3, 64 - h * 0.6, x + lean, 64 - h); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function radialTex(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, inner); r.addColorStop(1, outer); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildWorld() {
  const rr = mulberry(77), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const stone = MAT.stone, stoneDark = worldUV(stoneMaterial(0x565c66), 0, 3.0);
  const mossStone = worldUV(stoneMaterial(0x646b60, 'rock'), 0, 1.6);
  const S = new THREE.Group(); scene.add(S);
  const onWall = (a, gap = 0.55) => Math.abs(wrapA(a - Math.PI / 2)) > gap && Math.abs(wrapA(a - Math.PI)) > 0.34;

  // ---- blind arcade + pilasters + cornice: breaks up the drum wall and gives human-scale reference
  const archG = gothicArchGeo(3.8, 7.2, 0.55, 0.7, 6);
  const archAngles = []; for (let i = 0; i < 18; i++) { const a = (i + 0.5) / 18 * TAU; if (onWall(a)) archAngles.push(a); }
  const arches = new THREE.InstancedMesh(archG, stoneDark, archAngles.length);
  archAngles.forEach((a, i) => { m4.compose(V3(Math.sin(a) * (WALL_R - 0.35), 0, Math.cos(a) * (WALL_R - 0.35)), q.setFromEuler(e.set(0, a + Math.PI, 0)), V3(1, 1, 1)); arches.setMatrixAt(i, m4); });
  arches.receiveShadow = true; scene.add(arches);
  const pilG = rbox(0.9, 21, 0.9, 0.08); pilG.translate(0, 10.5, 0);
  const pilAngles = []; for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; if (onWall(a, 0.5)) pilAngles.push(a); }
  const pils = new THREE.InstancedMesh(pilG, stone, pilAngles.length);
  pilAngles.forEach((a, i) => { m4.compose(V3(Math.sin(a) * (WALL_R - 0.4), 0, Math.cos(a) * (WALL_R - 0.4)), q.setFromEuler(e.set(0, a, 0)), V3(1, 1, 1)); pils.setMatrixAt(i, m4); });
  pils.receiveShadow = true; scene.add(pils);
  const corn = new THREE.Mesh(new THREE.CylinderGeometry(WALL_R - 0.8, WALL_R - 0.8, 0.55, 72, 1, true, Math.PI / 2 + 0.45, TAU - 0.9), stoneDark);
  corn.material = worldUV(stoneMaterial(0x565c66), 0, 3.0); corn.material.side = THREE.DoubleSide; corn.position.y = 9.7; scene.add(corn);
  const cornTop = new THREE.Mesh(new THREE.RingGeometry(WALL_R - 0.85, WALL_R, 72, 1, Math.PI / 2 + 0.45, TAU - 0.9), corn.material);
  cornTop.rotation.x = -Math.PI / 2; cornTop.rotation.z = -Math.PI / 2; cornTop.position.y = 9.97; scene.add(cornTop);

  // ---- torches on the pilasters: bracket, flame, a real (unshadowed) warm point light, halo on the wall
  const torchA = pilAngles.filter((a, i) => i % 2 === 0);
  const torchPos = torchA.map((a) => V3(Math.sin(a) * (WALL_R - 1.05), 3.3, Math.cos(a) * (WALL_R - 1.05)));
  torchLights = torchA.map((a) => {
    const l = new THREE.PointLight(0xff8a3c, TORCH_I, 17, 2);
    l.position.set(Math.sin(a) * (WALL_R - 1.5), 3.6, Math.cos(a) * (WALL_R - 1.5)); scene.add(l);
    return l;
  });
  torchA.forEach((a, i) => {
    const g = new THREE.Group(); g.position.copy(torchPos[i]); g.rotation.y = a; S.add(g);
    add(g, rbox(0.12, 0.12, 0.5, 0.02), metalMat(0x3a3836, 1, null), 0, -0.15, 0.2, 0.5, 0, 0);
    add(g, lathe([[0.02, -0.25], [0.09, -0.02], [0.11, 0.05]], 10), metalMat(0x3a3836, 1, null), 0, 0, 0);
  });
  const halo = radialTex('rgb(255,170,95)', 'rgb(0,0,0)'); // additive: fade the colour itself to black
  const tf = new Float32Array(torchPos.length * 3); torchPos.forEach((p, i) => { tf[i * 3] = p.x; tf[i * 3 + 1] = p.y + 0.22; tf[i * 3 + 2] = p.z; });
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tf, 3));
  const torchU = { uTime: { value: 0 }, uPR: { value: 1 }, uH: { value: 800 } };
  const torchFlames = new THREE.Points(tg, new THREE.ShaderMaterial({
    uniforms: torchU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime,uPR,uH; varying float vF; varying float vS; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vS=position.x*1.7+position.z; vF=0.85+0.15*sin(uTime*11.0+vS)*sin(uTime*6.3+vS*2.0); gl_PointSize=uPR*uH*0.62*vF/-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform float uTime; varying float vF; varying float vS;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){ vec2 p=gl_PointCoord-0.5; p.y=-p.y; float ny=p.y+0.5;
        float w=0.23*(1.0-ny)*(0.7+0.3*n(vec2(p.x*6.0+vS,ny*4.0-uTime*5.0)));
        float fl=smoothstep(w,w*0.3,abs(p.x+sin(ny*6.0+uTime*7.0+vS)*0.05*ny))*smoothstep(1.0,0.35,ny)*smoothstep(0.0,0.08,ny);
        float core=smoothstep(0.55,0.0,ny)*smoothstep(w*0.6,0.0,abs(p.x));
        vec3 c=vec3(1.0,0.42,0.1)*fl*1.6+vec3(1.0,0.85,0.5)*core*1.4;
        gl_FragColor=vec4(c*vF,1.0); }`,
  }));
  torchFlames.frustumCulled = false; torchFlames.renderOrder = 6; scene.add(torchFlames);
  // halos on the wall + pools on the floor (one instanced additive quad mesh)
  const glowMat = new THREE.MeshBasicMaterial({ map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.55, 0.36, 0.22), fog: false });
  const glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMat, torchPos.length * 2);
  torchPos.forEach((p, i) => {
    const a = torchA[i];
    m4.compose(V3(Math.sin(a) * (WALL_R - 0.93), 3.6, Math.cos(a) * (WALL_R - 0.93)), q.setFromEuler(e.set(0, a + Math.PI, 0)), V3(2.6, 3.4, 1)); glows.setMatrixAt(i * 2, m4);
    m4.compose(V3(Math.sin(a) * (WALL_R - 2.6), 0.03, Math.cos(a) * (WALL_R - 2.6)), q.setFromEuler(e.set(-Math.PI / 2, 0, 0)), V3(4.5, 4.5, 1)); glows.setMatrixAt(i * 2 + 1, m4);
  });
  glows.renderOrder = 3; scene.add(glows);

  // ---- the sealed gate: a colossal pointed frame and two standing guardians (sense of scale)
  const gateArch = new THREE.Mesh(gothicArchGeo(13, 17.5, 1.6, 2.2, 14), stone);
  gateArch.position.set(0, 0, -21.4); S.add(gateArch);
  const statueMat = worldUV(stoneMaterial(0x7d838b, 'rock'), 0, 1.4);
  const stand = { pY: -0.02, pP: 2, cP: 4, hP: 14, sx: 0.0, sy: -0.24, sz: 0.36, syaw: 0, spit: -88, srol: 0, st: 0.6 };
  const guardian = buildStatue(statueMat, stand, 0.45, true);
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 8.4, 0, -19.6); g.rotation.y = -sx * 0.25; S.add(g);
    add(g, rbox(3.4, 1.6, 3.2, 0.08), stoneDark, 0, 0.8, 0);
    const st = guardian.clone(); st.scale.setScalar(2.35); st.position.y = 1.6; g.add(st);
  }

  // ---- beyond the breach: a colossal kneeling knight, graves, dead trees, broken swords, grass, mist
  const giant = buildStatue(mossStone, { pY: -0.42, pP: 8, cP: 16, hP: 26, sx: 0.0, sy: -0.2, sz: 0.34, syaw: 0, spit: -86, srol: 90, st: 1 }, 0.4);
  giant.scale.setScalar(5.2); giant.position.set(38, -0.3, 5); giant.rotation.y = -Math.PI / 2 - 0.35; S.add(giant);
  add(S, rbox(9, 1.2, 8, 0.2), mossStone, 38, 0.2, 5, 0, -0.35, 0);
  // graves
  const slab = new THREE.Shape(); slab.moveTo(-0.32, 0); slab.lineTo(-0.32, 0.72); slab.absarc(0, 0.72, 0.32, Math.PI, 0, true); slab.lineTo(0.32, 0); slab.closePath();
  const slabG = new THREE.ExtrudeGeometry(slab, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 6 }); slabG.translate(0, 0, -0.07);
  const crossG = BGU.mergeGeometries([rbox(0.16, 1.4, 0.14, 0.03).translate(0, 0.7, 0), rbox(0.75, 0.15, 0.13, 0.03).translate(0, 1.05, 0)].map((g) => g.toNonIndexed()));
  const graves = [];
  for (let i = 0; i < 40; i++) { const x = 24 + rr() * 22, z = -14 + rr() * 30; if (Math.hypot(x - 38, z - 5) < 6) continue; graves.push([x, z]); }
  const slabs = new THREE.InstancedMesh(slabG, mossStone, graves.length), crosses = new THREE.InstancedMesh(crossG, mossStone, 12);
  let nc = 0, ns = 0;
  graves.forEach(([x, z], i) => {
    q.setFromEuler(e.set((rr() - 0.5) * 0.35, -Math.PI / 2 + (rr() - 0.5) * 0.6, (rr() - 0.5) * 0.3));
    const s = 0.8 + rr() * 0.6;
    m4.compose(V3(x, -0.15 - rr() * 0.2, z), q, V3(s, s, s));
    if (i % 4 === 0 && nc < 12) crosses.setMatrixAt(nc++, m4); else slabs.setMatrixAt(ns++, m4);
  });
  slabs.count = ns; crosses.count = nc; scene.add(slabs, crosses);
  // dead trees
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x2e2825, roughness: 0.95, normalMap: TEX.leatherNormal, flatShading: true });
  const treeG = [];
  for (const [x, z, h, sd] of [[28, -9, 9, 3], [44, 12, 11, 7], [31, 15, 7, 11], [47, -6, 12, 19]]) { const g = deadTreeGeo(sd, h); g.rotateY(rr() * 6); g.translate(x, 0, z); treeG.push(g); }
  scene.add(new THREE.Mesh(BGU.mergeGeometries(treeG), barkMat));
  // broken swords driven into the ground (the dead who kept the oath)
  const swordG = BGU.mergeGeometries([bladeGeo(0.0, 1.0, 0.04, 0.03, 0.01, 0.12, 0.4, 5), rbox(0.24, 0.03, 0.03, 0.01).translate(0, 0, -0.02).toNonIndexed(), taper(0.2, 0.016, 0.015, 6).rotateX(-Math.PI / 2).translate(0, 0, -0.04).toNonIndexed()].map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
  swordG.rotateX(Math.PI / 2); // blade points down, grip up
  const swords = new THREE.InstancedMesh(swordG, metalMat(0x6c6862, 1, null), 22);
  for (let i = 0; i < 22; i++) {
    const out = i >= 10; const a = out ? 0 : rr() * TAU, r = ARENA_R + 1.2 + rr() * 2.2;
    const x = out ? 24 + rr() * 20 : Math.sin(a) * r, z = out ? -12 + rr() * 26 : Math.cos(a) * r;
    m4.compose(V3(x, 0.72 + rr() * 0.2, z), q.setFromEuler(e.set((rr() - 0.5) * 0.6, rr() * 6, (rr() - 0.5) * 0.6)), V3(1, 1, 1)); swords.setMatrixAt(i, m4);
  }
  swords.castShadow = false; scene.add(swords);
  // grass tufts (breach + graveyard)
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex(), alphaTest: 0.45, side: THREE.DoubleSide, color: 0x6a7058, roughness: 1 });
  const grassU = { uTime: { value: 0 } };
  grassMat.onBeforeCompile = (sh) => { sh.uniforms.uTime = grassU.uTime; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat gk=max(position.y+0.5,0.0); transformed.x+=sin(uTime*1.3+instanceMatrix[3][0]*0.7+instanceMatrix[3][2])*0.12*gk*gk;'); };
  const gqG = BGU.mergeGeometries([new THREE.PlaneGeometry(1, 1), new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2)]);
  const grass = new THREE.InstancedMesh(gqG, grassMat, 170);
  for (let i = 0; i < 170; i++) {
    const inBreach = i < 60; const a = Math.PI / 2 + (rr() - 0.5) * 0.9, r = inBreach ? 16 + rr() * 8 : 0;
    const x = inBreach ? Math.sin(a) * r : 24 + rr() * 24, z = inBreach ? Math.cos(a) * r : -14 + rr() * 30;
    const s = 0.5 + rr() * 0.6;
    m4.compose(V3(x, s * 0.45, z), q.setFromEuler(e.set(0, rr() * 3, 0)), V3(s, s * 0.9, s)); grass.setMatrixAt(i, m4);
  }
  scene.add(grass);
  // low mist over the graveyard
  const mistU = { uTime: { value: 0 } };
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: mistU, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; varying vec3 vW; float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){ vec2 p=vW.xz*0.07; float m=n(p+vec2(uTime*0.03,uTime*0.01))*0.6+n(p*2.3-vec2(uTime*0.02,0.))*0.4;
        float edge=smoothstep(22.0,30.0,vW.x); gl_FragColor=vec4(vec3(0.3,0.34,0.42),smoothstep(0.35,0.85,m)*0.38*edge); }`,
  }));
  mist.rotation.x = -Math.PI / 2; mist.position.set(60, 0.9, 0); mist.renderOrder = 4; scene.add(mist);

  // ---- background: broken bridge (mid), castle and towers (far), mountains (farthest) — aerial perspective
  const bridgeMat = new THREE.MeshBasicMaterial({ color: 0x0d1119, fog: false });
  const bG = [];
  for (let i = 0; i < 9; i++) {
    const z = -46 + i * 11; if (i === 4) continue; // the collapsed span
    bG.push(rbox(3, 26, 3.2, 0.1).translate(64, -4, z).toNonIndexed());
    if (i < 8 && i !== 3) { bG.push(gothicArchGeo(11, 9, 1.2, 3, 8).rotateY(Math.PI / 2).translate(64, 9, z + 5.5).toNonIndexed()); bG.push(rbox(3.4, 1.2, 11, 0.1).translate(64, 18.6, z + 5.5).toNonIndexed()); }
  }
  bG.push(rbox(3.4, 1.2, 4, 0.1).translate(64, 18.2, -7.5).rotateX(0.0).toNonIndexed());
  const bridge = new THREE.Mesh(BGU.mergeGeometries(bG.map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); return g; })), bridgeMat);
  scene.add(bridge);
  // castle keep with crenellations and a few lit windows
  const castleMat = new THREE.MeshBasicMaterial({ color: 0x19202c, fog: false });
  const cG = [];
  const tower = (x, z, w, h, roof) => { cG.push(new THREE.BoxGeometry(w, h, w).translate(x, h / 2 - 2, z)); for (let k = 0; k < 4; k++) for (let j = -1; j <= 1; j += 2) cG.push(new THREE.BoxGeometry(w * 0.2, 1.2, w * 0.2).translate(x + (k < 2 ? j * w * 0.4 : 0), h - 1.4, z + (k >= 2 ? j * w * 0.4 : 0))); if (roof) cG.push(new THREE.ConeGeometry(w * 0.75, w * 1.4, 4).rotateY(Math.PI / 4).translate(x, h - 2 + w * 0.7, z)); };
  tower(108, -18, 10, 34, false); tower(100, -8, 6, 46, true); tower(114, -4, 5, 40, true); tower(104, -28, 7, 28, true); tower(96, -22, 4, 24, false);
  cG.push(new THREE.BoxGeometry(24, 18, 16).translate(106, 7, -16));
  const castle = new THREE.Mesh(BGU.mergeGeometries(cG.map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); return g; })), castleMat);
  scene.add(castle);
  const winG = []; for (const [x, y, z] of [[95.9, 24, -9], [95.9, 30, -7.5], [93.9, 14, -22], [99.9, 20, -27]]) winG.push(new THREE.PlaneGeometry(0.8, 1.4).rotateY(-Math.PI / 2).translate(x, y, z));
  scene.add(new THREE.Mesh(BGU.mergeGeometries(winG), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.8, 0.35), fog: false })));
  // mountains
  const mtn = [], mp = [], segs = 60;
  for (let i = 0; i <= segs; i++) { const a = Math.PI / 2 - 1.1 + i / segs * 2.2, r = 150; const h = 18 + vnoise(i * 0.35, 3.1, 9, 1e6) * 26 + vnoise(i * 1.4, 1.3, 4, 1e6) * 8; mp.push([Math.sin(a) * r, Math.cos(a) * r, h]); }
  for (let i = 0; i < segs; i++) { const [x0, z0, h0] = mp[i], [x1, z1, h1] = mp[i + 1]; mtn.push(x0, -2, z0, x1, -2, z1, x1, h1, z1, x0, -2, z0, x1, h1, z1, x0, h0, z0); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(mtn, 3));
  scene.add(new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: 0x252d3b, fog: false, side: THREE.DoubleSide })));

  // ---- Poly Haven boulders (6k-tri glTF, instanced): fallen masonry at the breach, by broken pillars, among the graves
  if (ASSETS.boulder) {
    const bm = ASSETS.boulder, mat = bm.material;
    mat.color.set(0x7a8088);
    const spots = [[18.5, 3.5, 2.6], [17.8, -4.2, 2.1], [21, 0.5, 3.2], [19.5, 7.5, 1.6], [-15.8, 6.5, 1.8], [-6.8, 15.8, 2.0], [9.5, -14.4, 1.5], [30, -4, 2.4], [26, 11, 1.7]];
    const bi = new THREE.InstancedMesh(bm.geometry, mat, spots.length);
    spots.forEach(([x, z, s2], i) => { m4.compose(V3(x, -0.1 * s2, z), q.setFromEuler(e.set((rr() - 0.5) * 0.3, rr() * 6, (rr() - 0.5) * 0.3)), V3(s2, s2 * (0.8 + rr() * 0.4), s2)); bi.setMatrixAt(i, m4); });
    bi.castShadow = false; bi.receiveShadow = true; scene.add(bi); // perimeter props: skip the shadow pass (one instanced object would always be drawn into it)
  }

  // ---- contact shadows (soft blobs keep feet grounded even where the shadow map is coarse)
  const blobTex = radialTex('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)');
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }));
    b.rotation.x = -Math.PI / 2; b.renderOrder = 1; scene.add(b); BLOBS.push(b);
  }

  bakeStatic(S);

  worldUpdate = (t, dt) => {
    torchU.uTime.value = t; torchU.uPR.value = renderer.getPixelRatio(); torchU.uH.value = viewH / (2 * Math.tan(camera.fov * DEG / 2));
    grassU.uTime.value = t; mistU.uTime.value = t;
    glowMat.color.setRGB(0.34 + 0.05 * Math.sin(t * 9.1) * Math.sin(t * 4.7), 0.21, 0.12);
    if (Math.random() < dt * 5) { const p = torchPos[(Math.random() * torchPos.length) | 0]; VFX.embers(V3(p.x, p.y + 0.35, p.z), 1, 0.08, 1.1); }
    if (player && boss) {
      const set = (b, pos, s, vis) => { b.position.set(pos.x, 0.02, pos.z); b.scale.setScalar(s); b.visible = vis; };
      set(BLOBS[0], player.pos, 1.3, true);
      set(BLOBS[1], boss.pos, 1.9, boss.rig.root.visible && boss.rig.U.uDissolve.value < 0.5);
    }
  };
}
