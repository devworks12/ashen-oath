// ------------------------------------------------------------------ geometry helpers
let SEGM = 1; // segment multiplier (statues / LOD build at lower density)
const sg = (n) => Math.max(4, Math.round(n * SEGM));
function lathe(pts, segs = 20, sx = 1, sz = 1, phiStart = 0, phiLen = TAU) {
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), sg(segs), phiStart, phiLen);
  g.scale(sx, 1, sz);
  return g;
}
function taper(len, r0, r1, segs = 12, y0 = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, len, sg(segs), 1, false);
  g.translate(0, len / 2 + y0, 0);
  return g;
}
function rbox(w, h, d, r = 0.01, s = 2) { return new RoundedBoxGeometry(w, h, d, SEGM < 1 ? 1 : s, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)); }
function cap(r, thetaLen = 0.5, segs = 14) { return new THREE.SphereGeometry(r, sg(segs), sg(8), 0, TAU, 0, Math.PI * thetaLen); }
function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
// hammered / dented surface: displace along the normal with position-based noise (seam-safe)
function worn(g, amp = 0.004, f = 38, seed = 1) {
  const p = g.attributes.position; if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = (vnoise(x * f + z * f * 0.7, y * f, seed, 1e6) - 0.5) * 2 + (vnoise(x * f * 3.1, y * f * 2.7 + z * f * 3, seed + 5, 1e6) - 0.5) * 0.6;
    p.setXYZ(i, x + n.getX(i) * k * amp, y + n.getY(i) * k * amp, z + n.getZ(i) * k * amp);
  }
  g.computeVertexNormals();
  return g;
}
// cloth folds: vertical ripples around a lathe (mantles, skirts)
function folds(g, amp = 0.012, count = 9, seed = 2) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const k = 1 + (Math.sin(a * count + vnoise(a * 2, y * 4, seed, 1e6) * 3) * amp + (vnoise(a * 5, y * 9, seed + 1, 1e6) - 0.5) * amp) / Math.max(r, 0.05);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}
// overlapping articulated lames (segmented plate)
function lames(parent, mat, y0, y1, r0, r1, n, sx = 1, sz = 1, phi = 0, phiLen = TAU, segs = 14) {
  const h = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const a = y0 + h * i, r = lerp(r0, r1, i / Math.max(1, n - 1));
    add(parent, worn(lathe([[r * 0.97, a], [r * 1.04, a + h * 0.25], [r, a + h * 1.12]], segs, sx, sz, phi, phiLen), 0.0025, 30, i + 3), mat);
  }
}
// chain of alternating links along a polyline
function chainGeo(pts, link = 0.022, wire = 0.005) {
  const geos = [], tmp = new THREE.Object3D();
  const base = new THREE.TorusGeometry(link, wire, 4, 8); base.scale(1, 1.6, 1);
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], d = b.clone().sub(a), L = d.length(), n = Math.max(1, Math.floor(L / (link * 2.2)));
    for (let j = 0; j < n; j++) {
      tmp.position.copy(a).addScaledVector(d, (j + 0.5) / n);
      tmp.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
      tmp.rotateY((k++ % 2) * Math.PI / 2);
      tmp.updateMatrix();
      geos.push(base.clone().applyMatrix4(tmp.matrix).toNonIndexed());
    }
  }
  return BGU.mergeGeometries(geos.map((g) => { g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
}
// faceted blade with fuller and chipped edges; blade along +Z from z0 to z1, half-width w, thickness t
function bladeGeo(z0, z1, w0, w1, t, tipLen, chips = 0, seed = 3) {
  const st = 22, ring = [[-1, 0], [-0.62, 0.55], [-0.28, 1], [0, 0.45], [0.28, 1], [0.62, 0.55], [1, 0], [0.62, -0.55], [0.28, -1], [0, -0.45], [-0.28, -1], [-0.62, -0.55]];
  const pos = [], uv = [], rnd = mulberry(seed);
  const stations = [];
  const notch = []; for (let i = 0; i <= st; i++) notch.push([1 - (rnd() < chips ? rnd() * 0.22 : 0), 1 - (rnd() < chips ? rnd() * 0.22 : 0)]);
  for (let i = 0; i <= st; i++) {
    const v = i / st; const z = lerp(z0, z1 - tipLen, v); const w = lerp(w0, w1, v);
    stations.push([z, w, t * (1 - v * 0.35), notch[i], v < 0.08 ? 0 : 1]);
  }
  stations.push([z1, 0.002, 0.002, [1, 1], 1]);
  const P = (S, r) => { const side = r[0] < 0 ? S[3][0] : S[3][1]; const fuller = r[0] === 0 ? (S[4] ? 1 : 2.1) : 1; return [r[0] * S[1] * (Math.abs(r[0]) > 0.9 ? side : 1), r[1] * S[2] * fuller, S[0]]; };
  const Q = (S, r) => [r[0] * 0.5 + 0.5, (S[0] - z0) / (z1 - z0)];
  for (let i = 0; i < stations.length - 1; i++) {
    const A = stations[i], B = stations[i + 1];
    for (let j = 0; j < ring.length; j++) {
      const r0 = ring[j], r1 = ring[(j + 1) % ring.length];
      const a = P(A, r0), b = P(A, r1), c = P(B, r1), d = P(B, r0);
      pos.push(...a, ...c, ...b, ...a, ...d, ...c);
      uv.push(...Q(A, r0), ...Q(B, r1), ...Q(A, r1), ...Q(A, r0), ...Q(B, r0), ...Q(B, r1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// hood: open-fronted cowl with a drooping peak at the back
function hoodGeo(r) {
  const g = new THREE.SphereGeometry(r, 22, 16, Math.PI / 2 + 0.66, TAU - 1.32, 0, Math.PI * 0.78);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z < 0) { const k = -z / r; z -= k * k * r * 0.55 * Math.max(0, y / r + 0.3); y -= k * k * r * 0.25; }
    if (y < -r * 0.3) { x *= 1.12; z *= 1.08; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return folds(g, 0.006, 11, 7);
}
function crestShape(s) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.8 * s, 0.7 * s); sh.lineTo(0.8 * s, 0.7 * s); sh.lineTo(0.8 * s, -0.1 * s);
  sh.quadraticCurveTo(0.7 * s, -0.75 * s, 0, -1.05 * s); sh.quadraticCurveTo(-0.7 * s, -0.75 * s, -0.8 * s, -0.1 * s); sh.closePath();
  return sh;
}
function halfCrest(s, side) {
  // split shield along a jagged crack
  const sh = new THREE.Shape();
  const crack = [[0.15, 0.7], [0.05, 0.35], [0.18, 0.05], [0.02, -0.4], [0.12, -1.0]];
  if (side < 0) {
    sh.moveTo(-0.8 * s, 0.7 * s); for (const c of crack) sh.lineTo(c[0] * s, c[1] * s);
    sh.quadraticCurveTo(-0.7 * s, -0.75 * s, -0.8 * s, -0.1 * s); sh.closePath();
  } else {
    sh.moveTo(0.8 * s, 0.7 * s); for (const c of crack) sh.lineTo(c[0] * s, c[1] * s);
    sh.quadraticCurveTo(0.7 * s, -0.75 * s, 0.8 * s, -0.1 * s); sh.closePath();
  }
  return new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 6 });
}

// ------------------------------------------------------------------ Player: the nameless ash warrior
function buildPlayer() {
  const U = charUniforms(0, 'p'); U.uRim.value.setRGB(0.09, 0.13, 0.21);
  U.uRimPow.value = 2.6;
  const rig = new Rig({ scale: 1 });
  const iron = metalMat(0x74787f, 0.95, U), dark = metalMat(0x4a4c50, 1, U), silver = metalMat(0xa2a7ae, 0.78, U), brass = metalMat(0x8a7650, 0.8, U);
  const leather = leatherMat(0x6a5242, U), leather2 = leatherMat(0x40342b, U);
  const cloth = clothMat(0x44474e, U), accent = clothMat(0x47515e, U);
  const shadow = darkMat(U);
  const { pelvis, chest, head, sword } = rig;
  // ---- hips: layered skirt, belt + buckle + pouches, articulated tassets
  add(pelvis, folds(lathe([[0.15, 0.06], [0.168, -0.04], [0.19, -0.2], [0.215, -0.34]], 22, 1.12, 0.9), 0.008, 9, 3), cloth);
  add(pelvis, new THREE.SphereGeometry(0.14, 12, 8), cloth, 0, -0.07, 0, 0, 0, 0, 1.15, 0.8, 0.9);
  add(pelvis, new THREE.TorusGeometry(0.168, 0.024, 6, 24), leather, 0, 0.02, 0, Math.PI / 2, 0, 0, 1.12, 0.92, 1);
  add(pelvis, new THREE.TorusGeometry(0.17, 0.01, 4, 24), leather2, 0, -0.012, 0, Math.PI / 2 + 0.08, 0, 0, 1.13, 0.93, 1);
  add(pelvis, rbox(0.055, 0.05, 0.02, 0.008), brass, 0, 0.02, 0.16);
  add(pelvis, rbox(0.07, 0.08, 0.045, 0.015), leather, -0.15, -0.02, -0.07, 0, 0.9, 0);
  add(pelvis, rbox(0.055, 0.065, 0.04, 0.012), leather2, 0.14, -0.02, -0.09, 0, -0.8, 0);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) add(pelvis, worn(rbox(0.13 - i * 0.01, 0.06, 0.016, 0.006), 0.002, 40, i), i === 2 ? dark : iron, sx * 0.1, -0.06 - i * 0.05, 0.13 + i * 0.006, -0.2 - i * 0.04, sx * 0.35, sx * -0.12);
    add(pelvis, worn(rbox(0.11, 0.15, 0.016, 0.006)), dark, sx * 0.175, -0.1, 0.0, 0, sx * 1.45, sx * -0.18);
  }
  // ---- torso: gambeson, dented breastplate with ridge, backplate, faulds, gorget, bandolier
  add(chest, folds(lathe([[0.14, -0.34], [0.16, -0.2], [0.19, -0.05], [0.205, 0.08], [0.19, 0.15], [0.13, 0.22], [0.06, 0.25]], 22, 1.15, 0.8), 0.004, 14, 4), leather2);
  add(chest, worn(lathe([[0.155, -0.2], [0.2, -0.08], [0.224, 0.04], [0.216, 0.13], [0.168, 0.2], [0.1, 0.23]], 22, 1.14, 0.92, -Math.PI / 2, Math.PI), 0.005, 30, 8), iron);
  add(chest, worn(lathe([[0.15, -0.2], [0.195, -0.06], [0.21, 0.1], [0.16, 0.2]], 16, 1.13, 0.86, Math.PI / 2, Math.PI), 0.004), dark);
  add(chest, rbox(0.016, 0.33, 0.022, 0.006), silver, 0, 0.0, 0.205, -0.1, 0, 0);
  add(chest, new THREE.TorusGeometry(0.14, 0.009, 4, 18, Math.PI), silver, 0, 0.2, 0.03, -Math.PI / 2 + 0.25, 0, 0, 1.2, 1, 1);
  lames(chest, iron, -0.3, -0.19, 0.19, 0.172, 2, 1.14, 0.9, -Math.PI / 2, Math.PI);
  lames(chest, dark, 0.16, 0.29, 0.1, 0.085, 3, 1, 1);
  const band = add(chest, new THREE.TorusGeometry(0.235, 0.013, 5, 30, Math.PI * 1.15), leather, 0, 0.0, 0.0, 0, 0, 0.72, 1.1, 1, 0.9);
  band.rotation.set(0.1, 0, 0.75);
  add(chest, rbox(0.035, 0.03, 0.012, 0.004), brass, -0.12, 0.08, 0.2, 0, 0, 0.75);
  // mantle with folds (cold accent) + scarf wrapping the lower face
  add(chest, folds(lathe([[0.075, 0.31], [0.12, 0.25], [0.21, 0.16], [0.25, 0.08], [0.26, 0.02], [0.24, -0.02]], 26, 1.08, 0.86), 0.012, 13, 9), accent);
  // left pauldron: three lames + rondel; right: leather spaulder
  const lp = new THREE.Group(); lp.position.set(0.21, 0.15, 0); lp.rotation.set(0, 0, -0.5); chest.add(lp);
  add(lp, worn(cap(0.108, 0.5, 18)), iron, 0, 0, 0, 0, 0, 0, 1, 0.8, 1.05);
  add(lp, worn(cap(0.104, 0.36, 18), 0.003, 30, 2), dark, 0.0, -0.035, 0, 0, 0, 0.18, 1, 0.66, 1);
  add(lp, worn(cap(0.1, 0.3, 18), 0.003, 30, 3), iron, 0.012, -0.065, 0, 0, 0, 0.32, 1, 0.55, 1);
  add(lp, new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16), silver, 0.03, 0.02, 0.1, Math.PI / 2, 0, 0);
  const rs = new THREE.Group(); rs.position.set(-0.2, 0.15, 0); rs.rotation.set(0, 0, 0.55); chest.add(rs);
  add(rs, cap(0.098, 0.42, 16), leather, 0, 0, 0, 0, 0, 0, 1, 0.7, 1.05);
  add(rs, cap(0.092, 0.3, 16), leather2, 0, -0.03, 0, 0, 0, -0.2, 1, 0.55, 1);
  // ---- head: skull in shadow, brow-ridged half-helm with nasal, hood, face wrap
  add(head, new THREE.SphereGeometry(0.098, 14, 10), shadow, 0, 0.1, 0.01);
  add(head, worn(cap(0.113, 0.52, 20), 0.002), iron, 0, 0.11, 0, -0.15, 0, 0, 1, 1.02, 1.08);
  add(head, new THREE.TorusGeometry(0.11, 0.008, 4, 18, Math.PI * 0.9), silver, 0, 0.115, 0.012, Math.PI / 2 - 0.2, 0, Math.PI * 0.05, 1, 1.08, 1);
  add(head, rbox(0.02, 0.09, 0.02, 0.006), dark, 0, 0.1, 0.118, -0.1, 0, 0);
  add(head, hoodGeo(0.142), accent, 0, 0.1, -0.012, 0, 0, 0, 1, 1.1, 1.04);
  add(head, folds(lathe([[0.085, -0.02], [0.1, 0.03], [0.1, 0.07], [0.092, 0.09]], 18, 1, 1.12), 0.004, 7, 2), accent, 0, 0.0, 0.01);
  add(head, folds(taper(0.2, 0.13, 0.07, 14), 0.008, 7, 5), accent, 0, -0.1, -0.07, 0.4, 0, 0);
  // ---- arms: sleeves, couters, segmented vambraces
  for (const [up, fo, sgn] of [[rig.upR, rig.foR, -1], [rig.upL, rig.foL, 1]]) {
    add(up, folds(taper(0.31, 0.07, 0.056, 14), 0.004, 6, 3), leather2);
    if (sgn > 0) lames(up, iron, 0.02, 0.18, 0.074, 0.068, 3);
    else add(up, new THREE.TorusGeometry(0.066, 0.008, 4, 14), leather, 0, 0.16, 0, Math.PI / 2, 0, 0);
    add(fo, taper(0.3, 0.056, 0.047, 12), leather2);
    lames(fo, sgn > 0 ? iron : dark, 0.07, 0.27, 0.064, 0.056, 4);
    add(fo, worn(cap(0.055, 0.5, 12)), sgn > 0 ? silver : leather, 0, 0.01, 0.012, 0.3, 0, 0, 1, 0.9, 1.1);
    if (sgn > 0) add(fo, new THREE.ConeGeometry(0.03, 0.05, 5), iron, 0.035, 0.01, 0.04, 0, 0, -1.2, 1, 1, 0.3);
  }
  const glove = (parent) => {
    add(parent, rbox(0.082, 0.085, 0.1, 0.022), leather, 0, 0, 0.0);
    add(parent, lathe([[0.042, 0.0], [0.052, 0.04], [0.06, 0.07]], 12, 1, 1), leather2, 0, 0, -0.03, -Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) add(parent, rbox(0.088, 0.018, 0.028, 0.006), dark, 0, 0.042, 0.03 - i * 0.026, 0.12, 0, 0);
  };
  const gR = new THREE.Group(); sword.add(gR); glove(gR);
  glove(rig.gripL);
  const gF = new THREE.Group(); gF.position.y = 0.04; rig.handFreeL.add(gF); glove(gF);
  // ---- legs: wrapped trousers, cuisses, winged poleyns, greaves with straps, cuffed boots
  for (const [th, sh, ft, sx] of [[rig.thR, rig.shR, rig.footR, -1], [rig.thL, rig.shL, rig.footL, 1]]) {
    add(th, folds(taper(0.45, 0.092, 0.068, 14), 0.005, 7, 4), cloth);
    add(th, worn(lathe([[0.097, 0.12], [0.1, 0.26], [0.084, 0.4]], 12, 1, 1, -Math.PI * 0.45, Math.PI * 0.9)), leather);
    for (const y of [0.16, 0.34]) add(th, new THREE.TorusGeometry(0.093 - y * 0.05, 0.007, 4, 14), leather2, 0, y, 0, Math.PI / 2, 0, 0);
    add(sh, taper(0.44, 0.066, 0.052, 12), cloth);
    add(sh, worn(cap(0.06, 0.5, 14)), iron, 0, 0.0, 0.036, Math.PI / 2, 0, 0, 1, 0.8, 1);
    add(sh, worn(cap(0.05, 0.5, 10)), dark, sx * -0.045, 0.0, 0.015, 0, 0, sx * Math.PI / 2, 0.4, 0.8, 1);
    add(sh, worn(lathe([[0.068, 0.07], [0.071, 0.2], [0.06, 0.34]], 14, 1, 1, -Math.PI / 2, Math.PI)), dark);
    for (const y of [0.14, 0.28]) add(sh, new THREE.TorusGeometry(0.066, 0.006, 4, 14), leather2, 0, y, 0, Math.PI / 2, 0, 0);
    add(ft, rbox(0.1, 0.08, 0.25, 0.03), leather2, 0, 0.045, 0.05);
    add(ft, rbox(0.108, 0.022, 0.265, 0.008), dark, 0, 0.011, 0.05);
    add(ft, folds(lathe([[0.058, 0.06], [0.062, 0.14], [0.074, 0.2], [0.072, 0.22]], 14), 0.006, 6, 6), leather2);
    add(ft, new THREE.TorusGeometry(0.06, 0.006, 4, 14), leather, 0, 0.1, 0, Math.PI / 2, 0, 0);
  }
  // ---- greatsword: chipped fuller blade, ricasso, forward-swept quillons, wrapped grip, wheel pommel
  const blade = new THREE.MeshStandardMaterial({ color: 0xd2d7de, metalness: 0.92, roughness: 1, map: TEX.bladeMap, roughnessMap: TEX.bladeRough });
  patchCharacter(blade, U);
  add(sword, bladeGeo(0.04, 1.2, 0.05, 0.036, 0.011, 0.15, 0.18, 11), blade);
  add(sword, worn(rbox(0.1, 0.04, 0.045, 0.012)), dark, 0, 0, 0.03);
  for (const q of [-1, 1]) add(sword, taper(0.13, 0.016, 0.009, 8), dark, q * 0.045, 0, 0.03, Math.PI / 2 - 0.25, 0, q * -Math.PI / 2 + q * 0.15);
  add(sword, taper(0.25, 0.019, 0.017, 10), leather, 0, 0, 0, -Math.PI / 2, 0, 0).position.z = 0.02;
  for (let i = 0; i < 7; i++) add(sword, new THREE.TorusGeometry(0.019, 0.004, 4, 10), leather2, 0, 0, -0.02 - i * 0.03, 0, 0, 0, 1, 1, 1).rotation.set(0.25, 0, 0);
  add(sword, lathe([[0.0, -0.02], [0.03, -0.015], [0.038, 0], [0.03, 0.015], [0, 0.02]], 14), dark, 0, 0, -0.255, 0, 0, Math.PI / 2);
  // ---- cloak + tattered tabard (verlet)
  const capeMat = new THREE.MeshStandardMaterial({ color: 0x3f4b5a, roughness: 0.95, map: TEX.clothMap, side: THREE.DoubleSide, alphaTest: 0.5 });
  patchCharacter(capeMat, U);
  const tabMat = new THREE.MeshStandardMaterial({ color: 0x4a525c, roughness: 0.95, map: TEX.clothMap, side: THREE.DoubleSide, alphaTest: 0.5 });
  patchCharacter(tabMat, U);
  rig.capes = [
    { cloth: new Cloth(5, 8, 0.4, 0.74, capeMat, 2), w: 0.36, y: 0.2, z: -0.13, y2: 0.08, z2: -0.19, curve: 0.06 },
    { cloth: new Cloth(3, 5, 0.17, 0.42, tabMat, 2), w: 0.15, y: -0.02, z: 0.175, y2: -0.1, z2: 0.19, curve: -0.02, anchor: 'pelvis' },
  ];
  rig.U = U;
  rig.root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  mergeByMaterial(rig.root, new Set(), sharedMats(U, [iron, dark, silver, brass], [leather, leather2, cloth, accent, shadow]));
  return rig;
}

// ------------------------------------------------------------------ Boss: THE ASHEN KNIGHT
function buildBossMats(U, stone) {
  if (stone) { const s = stone; return { plate: s, plate2: s, gold: s, chain: s, leather: s, shadow: s, blade: s, cape: null, glow: null, heat: null }; }
  // blackened, ash-dusted steel; tarnished bronze trim
  const K = ASSETS.knight;
  const plate = metalMat(K ? 0x46433e : 0x8c877e, 0.9, U), plate2 = metalMat(K ? 0x2c2a27 : 0x5f5a53, 1, U), gold = metalMat(K ? 0x6e5838 : 0xb89a5c, 0.72, U, { metalness: 0.9 });
  const chain = metalMat(K ? 0x363431 : 0x57544f, 1, U); chain.normalScale.set(2, 2);
  const leather = leatherMat(K ? 0x2b221c : 0x3a2e27, U);
  const shadow = darkMat(U);
  const blade = new THREE.MeshStandardMaterial({ color: 0x7d7872, metalness: 0.9, roughness: 1, map: TEX.bladeMap, roughnessMap: TEX.bladeRough, emissiveMap: TEX.bladeEmissive, emissive: new THREE.Color(0xff5a1e), emissiveIntensity: 0 });
  patchCharacter(blade, U);
  const cape = new THREE.MeshStandardMaterial({ color: K ? 0x2c2624 : 0x4d2621, roughness: 0.96, map: TEX.clothMap, side: THREE.DoubleSide, alphaTest: 0.5 });
  patchCharacter(cape, U);
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.45, 0.12) });
  const heat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
  return { plate, plate2, gold, chain, leather, shadow, blade, cape, glow, heat };
}
function dressBoss(rig, M) {
  const { pelvis, chest, head, sword } = rig;
  const heatParts = [];
  const H = (g, x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1, parent) => { if (!M.heat) return; const m = add(parent, g, M.heat, x, y, z, rx, ry, rz, sx, sy, sz); m.castShadow = false; heatParts.push(m); };
  const W = (g, a = 0.006, f = 26, sd = 1) => worn(g, a, f, sd);
  // ---- hips: mail skirt, heavy belt with a hanging chain, articulated tassets
  add(pelvis, folds(lathe([[0.17, 0.07], [0.19, -0.05], [0.225, -0.25], [0.255, -0.46]], 26, 1.1, 0.95), 0.01, 12, 5), M.chain);
  add(pelvis, new THREE.SphereGeometry(0.16, 12, 8), M.leather, 0, -0.07, 0, 0, 0, 0, 1.15, 0.8, 0.9);
  add(pelvis, new THREE.TorusGeometry(0.195, 0.034, 6, 26), M.leather, 0, 0.03, 0, Math.PI / 2, 0, 0, 1.12, 0.95, 1);
  add(pelvis, W(rbox(0.1, 0.08, 0.03, 0.012), 0.003), M.gold, 0, 0.03, 0.21);
  add(pelvis, chainGeo([V3(0.2, 0.02, 0.1), V3(0.23, -0.12, 0.12), V3(0.2, -0.24, 0.1), V3(0.12, -0.2, 0.19), V3(0.04, -0.06, 0.22)], 0.02, 0.005), M.chain);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) add(pelvis, W(rbox(0.17 - i * 0.012, 0.09, 0.022, 0.01), 0.004, 26, i), i === 1 ? M.plate2 : M.plate, sx * 0.115, -0.07 - i * 0.075, 0.17 + i * 0.008, -0.12 - i * 0.05, sx * 0.3, sx * -0.1);
    for (let i = 0; i < 2; i++) add(pelvis, W(rbox(0.16, 0.14, 0.022, 0.01), 0.004, 26, i + 5), M.plate2, sx * (0.225 + i * 0.01), -0.1 - i * 0.12, 0.0, 0, sx * 1.5, sx * -0.14);
  }
  H(new THREE.TorusGeometry(0.2, 0.012, 5, 22), 0, -0.02, 0, Math.PI / 2, 0, 0, 1.1, 0.95, 1, pelvis);
  // ---- cuirass: dented breastplate with medial ridge, plackart lames, gold trim, cracked crest
  add(chest, folds(lathe([[0.17, -0.35], [0.2, -0.2], [0.24, -0.04], [0.26, 0.09], [0.24, 0.17], [0.16, 0.25], [0.08, 0.28]], 24, 1.18, 0.86), 0.004, 12, 3), M.leather);
  add(chest, W(lathe([[0.19, -0.24], [0.245, -0.1], [0.272, 0.04], [0.264, 0.15], [0.2, 0.23], [0.12, 0.27]], 26, 1.18, 0.97, -Math.PI / 2, Math.PI), 0.007, 22, 9), M.plate);
  add(chest, W(lathe([[0.19, -0.24], [0.24, -0.06], [0.255, 0.12], [0.19, 0.24]], 18, 1.17, 0.9, Math.PI / 2, Math.PI)), M.plate2);
  add(chest, rbox(0.02, 0.4, 0.03, 0.008), M.plate2, 0, -0.02, 0.262, -0.08, 0, 0);
  lames(chest, M.plate2, -0.36, -0.2, 0.232, 0.25, 3, 1.18, 0.98, -Math.PI / 2, Math.PI, 20);
  add(chest, new THREE.TorusGeometry(0.125, 0.012, 5, 20, Math.PI), M.gold, 0, 0.255, 0.02, -Math.PI / 2 + 0.35, 0, 0, 1.2, 1, 1);
  const cr = new THREE.Group(); cr.position.set(0, 0.03, 0.262); cr.rotation.x = -0.12; chest.add(cr);
  add(cr, halfCrest(0.1, -1), M.gold, -0.004, 0, 0, 0, 0, 0.03);
  add(cr, halfCrest(0.1, 1), M.gold, 0.008, -0.01, 0.002, 0, 0, -0.07);
  H(rbox(0.004, 0.2, 0.01, 0.001), 0.012, -0.01, 0.018, 0, 0, 0.1, 1, 1, 1, cr);
  // gorget lames
  lames(chest, M.plate2, 0.2, 0.34, 0.128, 0.104, 3, 1, 1, 0, TAU, 18);
  H(new THREE.TorusGeometry(0.105, 0.008, 5, 18), 0, 0.33, 0, Math.PI / 2, 0, 0, 1, 1, 1, chest);
  // ---- LEFT: great pauldron — layered lames, haute-piece, spikes (signature silhouette)
  const lp = new THREE.Group(); lp.position.set(0.25, 0.17, -0.01); lp.rotation.set(0.05, 0, -0.42); chest.add(lp);
  add(lp, W(cap(0.19, 0.5, 20), 0.006, 20, 2), M.plate, 0, 0.02, 0, 0, 0, 0, 1.05, 0.5, 1.15);
  add(lp, W(cap(0.18, 0.4, 20), 0.005, 20, 3), M.plate2, 0.03, -0.03, 0, 0, 0, 0.22, 1.02, 0.5, 1.1);
  add(lp, W(cap(0.168, 0.35, 20), 0.005, 20, 4), M.plate, 0.06, -0.07, 0, 0, 0, 0.4, 1, 0.48, 1.05);
  add(lp, W(cap(0.155, 0.3, 20), 0.005, 20, 5), M.plate2, 0.085, -0.105, 0, 0, 0, 0.55, 1, 0.45, 1.02);
  add(lp, new THREE.TorusGeometry(0.19, 0.01, 4, 20, Math.PI), M.gold, 0, 0.02, 0, 0, Math.PI / 2, 0, 1.05, 0.5, 1.15);
  add(lp, W(rbox(0.025, 0.21, 0.27, 0.012), 0.004), M.plate2, -0.07, 0.145, 0, 0, 0, 0.5);
  add(lp, rbox(0.012, 0.03, 0.21, 0.004), M.gold, -0.108, 0.232, 0, 0, 0, 0.5);
  for (const [z, h] of [[-0.09, 0.07], [0, 0.1], [0.09, 0.06]]) add(lp, new THREE.ConeGeometry(0.016, h, 5), M.plate2, 0.045, 0.1 + h / 2, z, 0, 0, -0.6);
  // right: smaller, battle-damaged
  const rp = new THREE.Group(); rp.position.set(-0.24, 0.16, 0); rp.rotation.set(0, 0, 0.5); chest.add(rp);
  add(rp, W(cap(0.13, 0.5, 16), 0.008, 18, 7), M.plate2, 0, 0, 0, 0, 0, 0, 1, 0.75, 1.1);
  add(rp, W(cap(0.122, 0.33, 16)), M.plate, 0, -0.04, 0, 0, 0, -0.2, 1, 0.6, 1.05);
  add(rp, W(cap(0.115, 0.27, 16)), M.plate2, -0.01, -0.07, 0, 0, 0, -0.35, 1, 0.5, 1.02);
  // ---- great helm: flared skirt, brow band, riveted cross, breaths, broken crown
  add(head, W(lathe([[0.0, 0.25], [0.09, 0.245], [0.132, 0.222], [0.144, 0.14], [0.142, 0.03], [0.137, -0.05], [0.15, -0.085], [0.155, -0.1]], 24, 1, 1.08), 0.003, 30, 11), M.plate);
  add(head, new THREE.TorusGeometry(0.145, 0.01, 4, 24), M.plate2, 0, 0.16, 0, Math.PI / 2, 0, 0, 1, 1.08, 1);
  add(head, rbox(0.2, 0.024, 0.06, 0.006), M.shadow, 0, 0.115, 0.13, 0, 0, 0);
  add(head, rbox(0.022, 0.1, 0.04, 0.006), M.shadow, 0, 0.05, 0.14);
  add(head, rbox(0.014, 0.17, 0.03, 0.004), M.plate2, 0, 0.17, 0.15, -0.25, 0, 0);
  for (let i = 0; i < 5; i++) add(head, rbox(0.035, 0.006, 0.02, 0.002), M.shadow, 0.05 * (i % 2 ? 1 : -1) * (1 + (i >> 1) * 0.6), 0.02 - i * 0.012, 0.14, 0, 0, 0);
  for (let i = 0; i < 8; i++) { const a = -1.1 + i * 0.31; add(head, new THREE.SphereGeometry(0.006, 5, 4), M.gold, Math.sin(a) * 0.146, 0.16, Math.cos(a) * 0.157); }
  if (M.glow) {
    const ember = add(head, new THREE.PlaneGeometry(0.16, 0.03), M.glow, 0, 0.115, 0.1); ember.castShadow = false; rig.helmGlow = ember;
  }
  H(rbox(0.004, 0.09, 0.004, 0.001), 0.07, 0.17, 0.12, 0.2, 0.3, 0.3, 1, 1, 1, head);
  H(rbox(0.004, 0.07, 0.004, 0.001), -0.09, 0.08, 0.11, -0.2, -0.4, -0.5, 1, 1, 1, head);
  H(new THREE.TorusGeometry(0.14, 0.006, 4, 22), 0, -0.06, 0, Math.PI / 2, 0, 0, 1, 1.08, 1, head);
  const crown = new THREE.Group(); crown.position.y = 0.24; head.add(crown);
  add(crown, W(new THREE.TorusGeometry(0.128, 0.015, 6, 28, TAU * 0.78), 0.002), M.gold, 0, 0, 0, Math.PI / 2, 0, 0.9, 1, 1.08, 1);
  const spikes = [[0, 0.13], [0.8, 0.07], [1.6, 0.1], [2.4, 0.035], [3.3, 0.11], [4.1, 0.05], [4.6, 0.08]];
  for (const [a, h] of spikes) { const sp = add(crown, new THREE.ConeGeometry(0.017, h, 5), M.gold, Math.sin(a) * 0.128, h / 2, Math.cos(a) * 0.128 * 1.08, 0, 0, (a - 2) * 0.05); if (h < 0.05) sp.rotation.x = 0.45; }
  // ---- arms: rerebrace lames, fan couters, segmented vambraces
  for (const [up, fo, sgn] of [[rig.upR, rig.foR, -1], [rig.upL, rig.foL, 1]]) {
    add(up, taper(0.33, 0.078, 0.062, 12), M.leather);
    lames(up, M.plate2, 0.03, 0.29, 0.094, 0.082, 4, 1, 1, 0, TAU, 14);
    add(fo, taper(0.32, 0.062, 0.052, 12), M.leather);
    lames(fo, M.plate, 0.08, 0.3, 0.071, 0.062, 4, 1, 1, 0, TAU, 14);
    add(fo, W(cap(0.078, 0.5, 14), 0.004), M.plate2, 0, 0.0, 0.0, 0, 0, 0, 1, 1, 1.1);
    add(fo, W(cap(0.07, 0.5, 10), 0.004), M.plate, sgn * 0.05, 0.0, 0.02, 0, 0, sgn * Math.PI / 2, 0.35, 0.9, 1);
    add(fo, new THREE.ConeGeometry(0.03, 0.09, 4), M.plate2, 0, 0.01, 0.07, Math.PI / 2 + 0.3, 0, 0);
    H(new THREE.TorusGeometry(0.068, 0.006, 4, 16), 0, 0.02, 0, Math.PI / 2, 0, 0, 1, 1, 1, fo);
  }
  const gaunt = (p) => {
    add(p, rbox(0.1, 0.11, 0.12, 0.022), M.plate2);
    add(p, lathe([[0.05, 0.0], [0.064, 0.05], [0.078, 0.09]], 12), M.plate, 0, 0, -0.035, -Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) add(p, rbox(0.108, 0.022, 0.034, 0.006), M.plate, 0, 0.052, 0.035 - i * 0.03, 0.12, 0, 0);
    add(p, rbox(0.1, 0.03, 0.05, 0.01), M.plate2, 0, -0.03, 0.06, 0.4, 0, 0);
  };
  const gR = new THREE.Group(); sword.add(gR); gaunt(gR);
  gaunt(rig.gripL);
  const gF = new THREE.Group(); gF.position.y = 0.05; rig.handFreeL.add(gF); gaunt(gF);
  if (M.glow) {
    const hg = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s2 = add(gF, new THREE.SphereGeometry(0.11, 12, 8), hg, 0, 0.06, 0); s2.castShadow = false; rig.grabGlow = hg;
  }
  // ---- legs: cuisses with lames, winged poleyns, greaves, pointed sabatons
  for (const [th, sh, ft, sx] of [[rig.thR, rig.shR, rig.footR, -1], [rig.thL, rig.shL, rig.footL, 1]]) {
    add(th, taper(0.45, 0.11, 0.085, 12), M.leather);
    add(th, W(lathe([[0.12, 0.1], [0.118, 0.3], [0.096, 0.44]], 16, 1, 1, -Math.PI * 0.6, Math.PI * 1.2)), M.plate2);
    lames(th, M.plate, 0.34, 0.44, 0.1, 0.094, 2, 1, 1, -Math.PI * 0.6, Math.PI * 1.2, 12);
    add(sh, taper(0.44, 0.078, 0.062, 12), M.leather);
    add(sh, W(cap(0.078, 0.5, 14)), M.plate, 0, 0.0, 0.03, Math.PI / 2, 0, 0, 1, 0.85, 1);
    add(sh, W(cap(0.07, 0.5, 10)), M.plate2, sx * -0.06, 0.0, 0.015, 0, 0, sx * Math.PI / 2, 0.4, 0.9, 1);
    add(sh, W(lathe([[0.086, 0.06], [0.09, 0.2], [0.074, 0.38]], 16)), M.plate);
    add(ft, W(rbox(0.12, 0.1, 0.27, 0.03), 0.004), M.plate2, 0, 0.05, 0.05);
    for (let i = 0; i < 3; i++) add(ft, rbox(0.125, 0.03, 0.05, 0.01), M.plate, 0, 0.09 - i * 0.012, 0.08 + i * 0.045, 0.3, 0, 0);
    add(ft, taper(0.2, 0.08, 0.072, 12, 0.05), M.plate);
    add(ft, new THREE.ConeGeometry(0.05, 0.12, 6), M.plate, 0, 0.04, 0.21, Math.PI / 2, 0, 0, 1, 1, 0.6);
  }
  // ---- greatsword: notched fuller blade (~25% longer than the player's), crest-disc guard, wrapped grip, ring pommel
  add(sword, bladeGeo(0.06, 1.12, 0.075, 0.05, 0.014, 0.17, 0.3, 21), M.blade);
  add(sword, W(rbox(0.42, 0.045, 0.05, 0.012), 0.003), M.plate2, 0, 0, 0.045);
  for (const q of [-1, 1]) add(sword, new THREE.ConeGeometry(0.022, 0.09, 5), M.plate2, q * 0.225, 0, 0.0, -Math.PI / 2 - 0.4, 0, q * 0.4);
  add(sword, new THREE.CylinderGeometry(0.045, 0.045, 0.02, 16), M.gold, 0, 0, 0.05, 0, 0, Math.PI / 2);
  add(sword, taper(0.3, 0.024, 0.022, 10), M.leather, 0, 0, 0, -Math.PI / 2, 0, 0).position.z = 0.02;
  for (let i = 0; i < 8; i++) add(sword, new THREE.TorusGeometry(0.024, 0.004, 4, 10), M.leather, 0, 0, -0.02 - i * 0.034).rotation.set(0.25, 0, 0);
  add(sword, new THREE.TorusGeometry(0.045, 0.012, 6, 16), M.gold, 0, 0, -0.32, 0, Math.PI / 2, 0);
  add(sword, rbox(0.06, 0.004, 0.09, 0.002), M.gold, 0, 0.016, 0.14);
  rig.heatParts = heatParts;
  rig.root.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; } });
}
// Blender-built armour (assets/ashen_knight.json): meshes in rig-group-local space, one per (group, material role).
// Normals come from Blender (sharp edges kept); UVs are box-projected here (the blade gets its own u-across / v-along layout).
function parseKnight(d) {
  const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const [z0, z1, w0, w1, tip] = d.blade;
  const lods = d.lods.map((l) => l.meshes.map((m) => {
    const pos = new Float32Array(b64(m.v)), n8 = new Int8Array(b64(m.n)), idx = m.i32 ? new Uint32Array(b64(m.i)) : new Uint16Array(b64(m.i));
    const nv = pos.length / 3, nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    for (let i = 0; i < nv; i++) {
      const nx = n8[i * 3] / 127, ny = n8[i * 3 + 1] / 127, nz = n8[i * 3 + 2] / 127, l = Math.hypot(nx, ny, nz) || 1;
      nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (m.m === 'blade') {
        const w = lerp(w0, w1, clamp((z - z0) / (z1 - tip - z0), 0, 1));
        uv[i * 2] = clamp(0.5 + x / (2 * w), 0, 1); uv[i * 2 + 1] = clamp((z - z0) / (z1 - z0), 0, 1);
      } else {
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), k = 2.6;
        if (ax >= ay && ax >= az) { uv[i * 2] = z * k; uv[i * 2 + 1] = y * k; } else if (ay >= az) { uv[i * 2] = x * k; uv[i * 2 + 1] = z * k; } else { uv[i * 2] = x * k; uv[i * 2 + 1] = y * k; }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    return { g: m.g, m: m.m, geo };
  }));
  return { rig: d.rig, blade: d.blade, lods };
}
function dressKnight(rig, M, lod) {
  const heatParts = [];
  for (const d of ASSETS.knight.lods[lod]) {
    const mat = M[d.m], parent = rig[d.g];
    if (!mat || !parent) continue;
    const m = new THREE.Mesh(d.geo, mat);
    m.castShadow = d.m !== 'glow' && d.m !== 'heat'; m.receiveShadow = true;
    parent.add(m);
    if (d.m === 'heat') heatParts.push(m); else if (d.m === 'glow') rig.helmGlow = m;
  }
  if (M.glow) {
    const hg = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const s2 = add(rig.handFreeL, new THREE.SphereGeometry(0.11, 12, 8), hg, 0, 0.11, 0); s2.castShadow = false; rig.grabGlow = hg;
  }
  rig.heatParts = heatParts;
}
const OLD_BOSS_RIG = { scale: 1.3, shX: 0.245, shY: 0.17, upper: 0.33, fore: 0.32, hipW: 0.13, grip: 0.14, stanceF: 0.16, chestY: 0.34, headY: 0.34 };
function buildBoss() {
  const U = charUniforms(0, 'b');
  U.uRimPow.value = 2.4; U.uDisH.value = 2.8;
  U.uRim.value.setRGB(0.05, 0.06, 0.085); // faint cold rim: the silhouette still reads in the dark
  const K = ASSETS.knight;
  const rig = new Rig({ ...(K ? K.rig : OLD_BOSS_RIG), bulk: 1.3 });
  const M = buildBossMats(U);
  if (K) dressKnight(rig, M, 0); else dressBoss(rig, M);
  rig.bladeZ1 = K ? K.blade[1] - 0.04 : 1.12; // hit sweep follows the modelled blade
  rig.M = M; rig.U = U;
  const keep = new Set(rig.heatParts); if (rig.helmGlow) keep.add(rig.helmGlow);
  rig.root.traverse((m) => { if (m.isMesh && m.material === M.glow) keep.add(m); if (m.isMesh && m.material && m.material.blending === THREE.AdditiveBlending) keep.add(m); });
  mergeByMaterial(rig.root, keep, sharedMats(U, [M.plate, M.plate2, M.gold, M.chain], [M.leather, M.shadow]));
  // blackened steel: keep the sky from washing the plates out to pale blue
  if (K) rig.root.traverse((m) => { if (m.isMesh && m.material.isMeshStandardMaterial) m.material.envMapIntensity = 0.5; });
  const tabMat = new THREE.MeshStandardMaterial({ map: TEX.banner, roughness: 0.95, side: THREE.DoubleSide, alphaTest: 0.5, color: K ? 0x7a5049 : 0xd8c4b8 });
  patchCharacter(tabMat, U);
  rig.capes = K ? [
    // long torn cape over the broad back, blood-dark loincloth over the faulds
    { cloth: new Cloth(8, 12, 0.8, 1.5, M.cape, 2), w: 0.66, y: 0.26, z: -0.2, y2: 0.1, z2: -0.28, curve: 0.08 },
    { cloth: new Cloth(4, 8, 0.26, 0.86, tabMat, 2, false), w: 0.25, y: 0.0, z: 0.25, y2: -0.1, z2: 0.28, curve: -0.02, anchor: 'pelvis' },
  ] : [
    { cloth: new Cloth(7, 10, 0.72, 1.3, M.cape, 2), w: 0.62, y: 0.24, z: -0.16, y2: 0.1, z2: -0.24, curve: 0.08 },
    { cloth: new Cloth(4, 7, 0.26, 0.72, tabMat, 2, false), w: 0.24, y: 0.0, z: 0.215, y2: -0.1, z2: 0.235, curve: -0.02, anchor: 'pelvis' },
  ];
  return rig;
}
// stone statue of a kneeling knight (merged to one draw call)
function buildStatue(stoneMat, pose, lod = 0.5, standing = false) {
  SEGM = lod;
  const K = ASSETS.knight;
  const rig = new Rig(K ? { ...K.rig } : { scale: 1.3, shX: 0.245, upper: 0.33, fore: 0.32, hipW: 0.13, grip: 0.14, stanceF: 0.16, chestY: 0.34, headY: 0.34 });
  if (K) dressKnight(rig, buildBossMats(null, stoneMat), 1); else dressBoss(rig, buildBossMats(null, stoneMat));
  rig.anim.play(clip([[0, pose]]), 0);
  if (standing) { rig.feet[0].pos.set(0.2, 0, 0.08); rig.feet[1].pos.set(-0.2, 0, -0.06); } else { rig.feet[0].pos.set(0.17, 0, 0.35); rig.feet[1].pos.set(-0.17, 0, -0.55); }
  rig.feet[0].yaw = rig.feet[1].yaw = 0;
  rig.update(0.0001);
  rig.root.updateMatrixWorld(true);
  const geos = [];
  rig.root.traverse((m) => {
    if (!m.isMesh || !m.visible) return;
    let vis = true; let o = m; while (o) { if (!o.visible) vis = false; o = o.parent; }
    if (!vis) return;
    let g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    geos.push(g);
  });
  SEGM = 1;
  const merged = BGU.mergeGeometries(geos, false);
  const mesh = new THREE.Mesh(merged, stoneMat);
  mesh.castShadow = false; mesh.receiveShadow = true;
  return mesh;
}

// Collapse sibling meshes into as few draw calls as possible (per bone group). Materials listed in `shared`
// are folded into one metal and one non-metal material with baked vertex colours. Referenced parts stay separate.
function mergeByMaterial(root, keep, shared) {
  const groups = [];
  root.traverse((o) => { if (!o.isMesh) groups.push(o); });
  for (const g of groups) {
    const buckets = new Map();
    for (const c of g.children) {
      if (!c.isMesh || keep.has(c) || c.children.length) continue;
      const target = (shared && shared.get(c.material)) || c.material;
      if (!buckets.has(target)) buckets.set(target, []);
      buckets.get(target).push(c);
    }
    for (const [mat, list] of buckets) {
      if (list.length < 2 && !mat.vertexColors) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        let geo = m.geometry.clone().applyMatrix4(m.matrix);
        if (geo.index) geo = geo.toNonIndexed();
        for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        if (mat.vertexColors) {
          const c = m.material.color, n = geo.attributes.position.count, a = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
          geo.setAttribute('color', new THREE.Float32BufferAttribute(a, 3));
        }
        return geo;
      });
      const merged = BGU.mergeGeometries(geos, false);
      if (!merged) continue;
      for (const m of list) g.remove(m);
      const mm = new THREE.Mesh(merged, mat); mm.castShadow = list[0].castShadow; mm.receiveShadow = true;
      g.add(mm);
    }
  }
}
function sharedMats(U, metals, softs) {
  const metal = metalMat(0xffffff, 0.9, U); metal.vertexColors = true;
  const soft = leatherMat(0xffffff, U); soft.vertexColors = true; soft.roughness = 0.85;
  const m = new Map();
  for (const x of metals) m.set(x, metal);
  for (const x of softs) m.set(x, soft);
  return m;
}
