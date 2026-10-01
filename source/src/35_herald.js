// ------------------------------------------------------------------ Boss II: THE PALE HERALD (original design)
// A tall, gaunt herald in ivory robes and dark silver plate, a long crescent glaive, a halo of floating spectral
// blades behind the head and violet conjured light. Phase 2: the halo widens into a full wheel and the glaive's
// edge burns; a giant spectral crescent can be conjured over the weapon.
const HERALD_RIG = { scale: 1.3, hipH: 1.05, hipW: 0.11, thigh: 0.5, shin: 0.48, shX: 0.205, shY: 0.17, upper: 0.34, fore: 0.33, chestY: 0.36, headY: 0.33, grip: 0.3, stanceF: 0.17, bulk: 1.05 };
const VIOLET = new THREE.Color(0.62, 0.34, 1.0);

function crescentGeo(len, width, depth, bend = 0.5) {
  // a curved blade in the shape's x (length) / y (width) plane, then oriented: length → +z, width → x, depth → y
  const sh = new THREE.Shape(), N = 14, outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = u * len, belly = Math.sin(u * Math.PI) * width;
    outer.push([x, belly + bend * width * u * u]);
    inner.push([x, belly * 0.18 + bend * width * u * u * 0.9]);
  }
  sh.moveTo(0, 0); for (const p of outer) sh.lineTo(p[0], p[1]);
  for (let i = inner.length - 1; i >= 0; i--) sh.lineTo(inner[i][0], inner[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: depth * 0.6, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); g.rotateZ(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
function spectralMat(intensity = 1) {
  return new THREE.MeshBasicMaterial({ color: VIOLET.clone().multiplyScalar(intensity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}

function buildHerald() {
  const U = charUniforms(0, 'h');
  U.uRimPow.value = 2.2; U.uDisH.value = 3.0; U.uRim.value.setRGB(0.09, 0.06, 0.14);
  const rig = new Rig({ ...HERALD_RIG });
  const plate = metalMat(0x6c6e7a, 0.82, U), plate2 = metalMat(0x3b3c46, 1, U), trim = metalMat(0x9a96b8, 0.6, U, { metalness: 0.9 });
  const robe = clothMat(0xe2dccd, U), robe2 = clothMat(0x948c7c, U), leather = leatherMat(0x2e2830, U), shadow = darkMat(U);
  const { pelvis, chest, head, sword } = rig;
  const heat = [];
  const glow = (parent, geo, mat, ...a) => { const m = add(parent, geo, mat, ...a); m.castShadow = false; heat.push(m); return m; };
  // ---- long ivory robe split at the front, with a dark under-skirt and a silver-plated girdle
  add(pelvis, folds(lathe([[0.15, 0.05], [0.18, -0.12], [0.24, -0.4], [0.31, -0.72], [0.36, -0.98]], 26, 1.12, 0.95, Math.PI * 0.18, Math.PI * 1.64), 0.016, 14, 4), robe);
  add(pelvis, folds(lathe([[0.14, 0.0], [0.17, -0.2], [0.21, -0.55], [0.25, -0.86]], 20, 1.08, 0.92), 0.01, 10, 2), robe2);
  add(pelvis, new THREE.TorusGeometry(0.17, 0.028, 6, 26), trim, 0, 0.02, 0, Math.PI / 2, 0, 0, 1.12, 0.94, 1);
  for (let i = 0; i < 5; i++) add(pelvis, worn(rbox(0.06, 0.07, 0.02, 0.008), 0.002), plate, Math.sin((i - 2) * 0.42) * 0.19, -0.03, Math.cos((i - 2) * 0.42) * 0.17, -0.15, (i - 2) * 0.42, 0);
  // ---- narrow cuirass, ridged, with a tall collar of overlapping plates
  add(chest, folds(lathe([[0.14, -0.34], [0.16, -0.18], [0.19, -0.02], [0.2, 0.1], [0.17, 0.18], [0.1, 0.24]], 22, 1.1, 0.82), 0.004, 12, 3), leather);
  add(chest, worn(lathe([[0.15, -0.24], [0.19, -0.1], [0.21, 0.04], [0.2, 0.14], [0.15, 0.22], [0.09, 0.25]], 24, 1.1, 0.95, -Math.PI / 2, Math.PI), 0.004, 26, 6), plate);
  add(chest, worn(lathe([[0.15, -0.24], [0.19, -0.06], [0.2, 0.1], [0.15, 0.22]], 18, 1.1, 0.88, Math.PI / 2, Math.PI)), plate2);
  add(chest, rbox(0.018, 0.42, 0.024, 0.006), trim, 0, -0.02, 0.212, -0.06, 0, 0);
  for (let i = 0; i < 4; i++) add(chest, worn(lathe([[0.1 - i * 0.004, 0], [0.115 - i * 0.004, 0.05], [0.112 - i * 0.004, 0.08]], 18, 1, 1.05), 0.002, 30, i), i % 2 ? plate2 : plate, 0, 0.2 + i * 0.05, -0.005);
  glow(chest, new THREE.OctahedronGeometry(0.03, 0), spectralMat(1.2), 0, 0.06, 0.222, 0, 0, 0, 0.6, 1.4, 0.3); // small sigil gem on the breast
  // pauldrons: tall swept shells, mirrored, with a trim edge
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 0.21, 0.16, -0.01); g.rotation.set(0, 0, sx * -0.55); chest.add(g);
    add(g, worn(cap(0.13, 0.5, 18), 0.004, 22, 2), plate, 0, 0, 0, 0, 0, 0, 1, 0.95, 1.1);
    add(g, worn(cap(0.125, 0.36, 18), 0.003, 22, 3), plate2, sx * 0.02, -0.04, 0, 0, 0, sx * -0.2, 1, 0.8, 1.05);
    add(g, new THREE.TorusGeometry(0.13, 0.008, 4, 20, Math.PI), trim, 0, 0, 0, 0, Math.PI / 2, 0, 1, 0.95, 1.1);
    add(g, new THREE.ConeGeometry(0.03, 0.22, 5), plate2, sx * -0.02, 0.15, -0.03, -0.25, 0, sx * 0.15);
  }
  // ---- tall crested helm, narrow visor (glows), swept-back crest
  add(head, worn(lathe([[0.0, 0.34], [0.05, 0.33], [0.1, 0.27], [0.125, 0.16], [0.12, 0.04], [0.115, -0.04], [0.13, -0.08]], 22, 0.92, 1.12), 0.003, 30, 9), plate);
  add(head, rbox(0.17, 0.02, 0.05, 0.005), shadow, 0, 0.13, 0.12);
  const visor = glow(head, new THREE.PlaneGeometry(0.15, 0.014), spectralMat(2.2), 0, 0.13, 0.148);
  rig.helmGlow = visor;
  add(head, rbox(0.012, 0.2, 0.32, 0.004), trim, 0, 0.3, -0.06, 0.35, 0, 0);
  for (const sx of [-1, 1]) add(head, new THREE.ConeGeometry(0.02, 0.24, 4), plate2, sx * 0.1, 0.24, -0.06, -0.9, 0, sx * -0.35);
  // ---- long arms: robe sleeves, segmented bracers, clawed gauntlets
  for (const [up, fo] of [[rig.upR, rig.foR], [rig.upL, rig.foL]]) {
    add(up, folds(taper(0.34, 0.07, 0.06, 12), 0.006, 6, 3), robe2);
    lames(up, plate2, 0.18, 0.33, 0.075, 0.07, 3, 1, 1, 0, TAU, 14);
    add(fo, taper(0.33, 0.058, 0.05, 12), leather);
    lames(fo, plate, 0.06, 0.3, 0.066, 0.058, 5, 1, 1, 0, TAU, 14);
    add(fo, worn(cap(0.07, 0.5, 12)), plate2, 0, 0.01, 0.0, 0, 0, 0, 1, 1, 1.1);
  }
  const gaunt = (p) => {
    add(p, rbox(0.085, 0.09, 0.11, 0.02), plate2);
    for (let i = 0; i < 4; i++) add(p, new THREE.ConeGeometry(0.009, 0.07, 4), plate, -0.03 + i * 0.02, -0.02, 0.07, Math.PI / 2 + 0.4, 0, 0);
  };
  const gR = new THREE.Group(); sword.add(gR); gaunt(gR);
  gaunt(rig.gripL);
  const gF = new THREE.Group(); gF.position.y = 0.05; rig.handFreeL.add(gF); gaunt(gF);
  // conjuring glow in the free hand
  const hg = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const hs = add(gF, new THREE.SphereGeometry(0.1, 12, 8), hg, 0, 0.06, 0.02); hs.castShadow = false; rig.grabGlow = hg;
  // ---- legs: robe covers to the shin; greaves and pointed sabatons below
  for (const [th, sh, ft] of [[rig.thR, rig.shR, rig.footR], [rig.thL, rig.shL, rig.footL]]) {
    add(th, taper(0.5, 0.09, 0.07, 12), leather);
    add(sh, taper(0.48, 0.065, 0.05, 12), leather);
    add(sh, worn(lathe([[0.072, 0.04], [0.076, 0.22], [0.064, 0.42]], 14, 1, 1, -Math.PI * 0.6, Math.PI * 1.2)), plate);
    add(sh, worn(cap(0.064, 0.5, 12)), plate2, 0, 0.0, 0.03, Math.PI / 2, 0, 0, 1, 0.8, 1);
    add(ft, worn(rbox(0.09, 0.07, 0.24, 0.025), 0.003), plate2, 0, 0.04, 0.05);
    add(ft, new THREE.ConeGeometry(0.04, 0.12, 5), plate, 0, 0.035, 0.21, Math.PI / 2, 0, 0, 1, 1, 0.5);
  }
  // ---- the glaive: long dark shaft, silver ferrules, a crescent blade with a violet edge, a back hook and butt spike
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x8f8ea0, metalness: 0.9, roughness: 1, map: TEX.bladeMap, roughnessMap: TEX.bladeRough, emissive: VIOLET.clone(), emissiveIntensity: 0.25 });
  patchCharacter(bladeMat, U);
  add(sword, taper(2.0, 0.021, 0.019, 10), leather, 0, 0, 0, Math.PI / 2, 0, 0).position.z = -0.78;
  for (const z of [-0.78, -0.3, 0.32, 1.18]) add(sword, new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), trim, 0, 0, z, Math.PI / 2, 0, 0);
  add(sword, new THREE.ConeGeometry(0.03, 0.16, 6), plate, 0, 0, -0.88, -Math.PI / 2, 0, 0);
  add(sword, crescentGeo(0.78, 0.13, 0.014, 0.35), bladeMat, 0, 0, 1.18);
  add(sword, crescentGeo(0.24, 0.05, 0.012, -0.4), plate2, 0, 0, 1.16, 0, 0, Math.PI);
  const edge = glow(sword, crescentGeo(0.8, 0.15, 0.004, 0.35), spectralMat(0.9), 0, 0, 1.17); edge.scale.set(1.12, 1.6, 1);
  rig.bladeZ1 = 1.92;
  // giant conjured crescent (phase 2): hidden until summoned
  const great = new THREE.Group(); sword.add(great); great.position.z = 1.1;
  const gm = spectralMat(1.1); gm.opacity = 1;
  const g1 = add(great, crescentGeo(2.1, 0.42, 0.03, 0.35), gm); g1.castShadow = false;
  const g2 = add(great, crescentGeo(2.25, 0.5, 0.01, 0.35), spectralMat(0.45)); g2.castShadow = false;
  great.visible = false; great.scale.setScalar(0.01); rig.great = great; rig.greatMats = [gm, g2.material];
  // ---- halo: a fan of floating spectral blades behind the head (widens into a full wheel in phase 2)
  const halo = new THREE.Group(); halo.position.set(0, 0.5, -0.2); chest.add(halo);
  const hb = [], hm = spectralMat(1.0);
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(crescentGeo(0.36, 0.05, 0.004, 0.1), hm); b.castShadow = false;
    b.rotation.x = -Math.PI / 2; // blade points outward from the halo centre (in the halo's plane)
    const pivot = new THREE.Group(); pivot.add(b); b.position.z = 0; halo.add(pivot); hb.push(pivot); heat.push(b);
  }
  rig.halo = halo; rig.haloBlades = hb; rig.haloMat = hm;
  rig.heatParts = heat;
  rig.M = { blade: bladeMat, plate, plate2, gold: trim, leather, shadow, cape: null };
  rig.U = U;
  rig.root.traverse((m) => { if (m.isMesh) { if (!heat.includes(m) && m !== hs) m.castShadow = true; m.receiveShadow = true; } });
  const keep = new Set([...heat, hs, g1, g2]);
  rig.root.traverse((m) => { if (m.isMesh && (m.material === bladeMat || (m.material && m.material.blending === THREE.AdditiveBlending))) keep.add(m); });
  mergeByMaterial(rig.root, keep, sharedMats(U, [plate, plate2, trim], [leather, shadow, robe, robe2]));
  // ---- two capes: a long violet-black mantle and a split ivory tabard
  const capeMat = new THREE.MeshStandardMaterial({ color: 0x3a2346, roughness: 0.95, map: TEX.clothMap, side: THREE.DoubleSide, alphaTest: 0.5 });
  patchCharacter(capeMat, U);
  const tabMat = new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: 0.95, map: TEX.clothMap, side: THREE.DoubleSide, alphaTest: 0.5 });
  patchCharacter(tabMat, U);
  rig.capes = [
    { cloth: new Cloth(8, 13, 0.72, 1.75, capeMat, 2), w: 0.58, y: 0.26, z: -0.16, y2: 0.12, z2: -0.24, curve: 0.08 },
    { cloth: new Cloth(4, 9, 0.22, 0.95, tabMat, 2), w: 0.2, y: 0.0, z: 0.2, y2: -0.1, z2: 0.22, curve: -0.02, anchor: 'pelvis' },
  ];
  return rig;
}

// per-frame look: halo spin and bob, phase-2 wheel, conjured crescent grow/fade, hand glow
function heraldAnimate(b, dt) {
  const r = b.rig, k = b.heat, t = GAME.time;
  const n = r.haloBlades.length, spread = lerp(1.9, TAU, k), spin = t * lerp(0.25, 0.9, k);
  for (let i = 0; i < n; i++) {
    const p = r.haloBlades[i], u = n > 1 ? i / (n - 1) : 0.5;
    const vis = k > 0.5 || (i % 2 === 0 && i < 12);
    const a = k > 0.5 ? spin + i / n * TAU : -spread / 2 + u * spread + Math.sin(t * 0.8) * 0.06;
    p.rotation.set(0, 0, a); p.children[0].position.y = 0.26 + 0.12 * k + Math.sin(t * 2.2 + i) * 0.012;
    p.visible = vis && r.root.visible && b.state !== 'dead';
  }
  r.halo.position.y = 0.5 + Math.sin(t * 1.3) * 0.02;
  r.halo.scale.setScalar(1 + 0.45 * k);
  r.haloMat.color.copy(VIOLET).multiplyScalar(0.8 + 0.7 * k + 0.15 * Math.sin(t * 5));
  // conjured greatblade
  const want = b.greatOn ? 1 : 0;
  b.greatK = damp(b.greatK || 0, want, want ? 9 : 5, dt);
  r.great.visible = b.greatK > 0.02; r.great.scale.setScalar(Math.max(0.01, b.greatK));
  r.greatMats[0].opacity = b.greatK; r.greatMats[1].opacity = b.greatK * 0.6;
  if (b.greatK > 0.2 && Math.random() < dt * 40 * b.greatK) { const p = r.sword.localToWorld(_bu.tip.set(rand(-0.15, 0.15), 0, rand(1.3, 3.0))); VFX.motes(p, 1, 0.08, 0.6); }
  // hand glow while conjuring daggers
  b.handK = damp(b.handK || 0, b.conjuring ? 1 : 0, 10, dt);
  r.grabGlow.color.setRGB(0.5 * b.handK, 0.25 * b.handK, 0.9 * b.handK);
}
