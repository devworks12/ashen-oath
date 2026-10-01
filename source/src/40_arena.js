// ------------------------------------------------------------------ THE LAST CATHEDRAL
const ARENA_R = 14.2;           // walkable fight radius
const PILLAR_R = 16.8, WALL_R = 23, ROOF_Y = 17;
// steep enough that the pool of moonlight through the broken roof lands on the fighting ground
const MOON_DIR = V3(0.3, 1.0, 0.17).normalize();
const PILLARS = [];
let moon, hemi, fillLight, candleLights = [], bossLight, arenaUpdate, setShafts;
let torchLights = null, TORCH_K = 1; const TORCH_I = 42; // real point lights on the wall torches (flicker in arenaUpdate)
// light n of the torches, spread evenly around the wall; a little brighter when thinned out
function setTorchLights(n) {
  if (!torchLights) return;
  const len = torchLights.length; n = Math.min(n, len);
  torchLights.forEach((l, i) => { l.visible = Math.floor((i + 1) * n / len) > Math.floor(i * n / len); });
  TORCH_K = 1 + 0.6 * (1 - n / len);
}
const ARENA = { warm: 0, violet: 0 };
const _violetFog = new THREE.Color(0.05, 0.028, 0.085), _violetHemi = new THREE.Color(0.52, 0.4, 0.78);

function fluteGeo(h, r, segs = 32) {
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, segs, 6, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x), rr = Math.hypot(x, z);
    if (rr < 1e-4) continue;
    const k = 1 - 0.045 * Math.pow(Math.abs(Math.cos(a * 8)), 3);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}
function rockGeo(seed, detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const r = mulberry(seed), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = V3(p.getX(i), p.getY(i), p.getZ(i));
    const k = 0.75 + 0.35 * vnoise(v.x * 2 + 5, v.y * 2 + v.z * 1.7, seed, 1000) + (r() - 0.5) * 0.08;
    v.multiplyScalar(k); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function windowTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  const path = () => { g.beginPath(); g.moveTo(10, 256); g.lineTo(10, 90); g.quadraticCurveTo(12, 20, 64, 4); g.quadraticCurveTo(116, 20, 118, 90); g.lineTo(118, 256); g.closePath(); };
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, 'rgba(150,175,215,0.95)'); grd.addColorStop(1, 'rgba(60,80,120,0.7)');
  path(); g.fillStyle = grd; g.fill();
  g.strokeStyle = 'rgba(0,0,0,1)'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(64, 20); g.lineTo(64, 256); g.moveTo(10, 150); g.lineTo(118, 150); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.arc(64, 78, 26, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(37, 150); g.lineTo(37, 256); g.moveTo(91, 150); g.lineTo(91, 256); g.stroke();
  // broken panes
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) { g.beginPath(); const x = 15 + Math.random() * 95, y = 100 + Math.random() * 150; g.moveTo(x, y); g.lineTo(x + 18, y + 6); g.lineTo(x + 5, y + 20); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildArena() {
  // ---------- lights
  // night, indoors: the moon only reaches the floor through the broken roof (the roof casts shadows);
  // everything else lives on a low ambient, the wall torches and the candles
  hemi = new THREE.HemisphereLight(0x6f82a8, 0x1a1512, 0.3);
  scene.add(hemi);
  moon = new THREE.DirectionalLight(0xbfd0f2, 3.6);
  moon.position.copy(MOON_DIR).multiplyScalar(30);
  moon.castShadow = true;
  moon.shadow.mapSize.set(Q.shadow, Q.shadow);
  const sc = moon.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 80;
  moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.035;
  scene.add(moon, moon.target);
  fillLight = new THREE.DirectionalLight(0x44506a, 0.25);
  fillLight.position.set(-0.6, 0.35, -0.7).multiplyScalar(20);
  scene.add(fillLight);
  for (const p of [[0.2, 1.7, -17.6]]) {
    const l = new THREE.PointLight(0xff9448, 8, 12, 2); l.position.set(...p); scene.add(l); candleLights.push(l);
  }
  bossLight = new THREE.PointLight(0xff5a1c, 0, 8, 2);
  scene.add(bossLight);
  scene.fog = new THREE.FogExp2(0x07090d, 0.024);
  // image-based lighting so the metals read as metal (cool moonlit room, a bright window band, faint candle warmth)
  {
    const envScene = new THREE.Scene();
    const envMat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { uMoon: { value: MOON_DIR.clone() } },
      vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vD; uniform vec3 uMoon; void main(){ vec3 d=normalize(vD);
        vec3 c=mix(vec3(0.05,0.045,0.045),vec3(0.16,0.18,0.23),smoothstep(-0.3,0.15,d.y));
        c=mix(c,vec3(0.3,0.36,0.48),smoothstep(0.2,0.9,d.y));
        c+=vec3(1.4,1.55,1.9)*pow(max(dot(d,uMoon),0.0),24.0);
        c+=vec3(0.35,0.42,0.6)*smoothstep(0.25,0.3,d.y)*smoothstep(0.55,0.5,d.y)*step(0.6,fract(atan(d.z,d.x)*1.6));
        c+=vec3(0.26,0.13,0.04)*pow(max(dot(d,normalize(vec3(0.0,0.05,-1.0))),0.0),8.0);
        gl_FragColor=vec4(c,1.0);} ` });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
    if (ASSETS.hdr) {
      // Poly Haven "moonless golf" night HDRI supplies realistic sky/ground variation; the moon, window and candle lobes are layered on top additively
      const hm = new THREE.Mesh(new THREE.SphereGeometry(9.5, 48, 24), new THREE.MeshBasicMaterial({ map: ASSETS.hdr, side: THREE.BackSide, color: new THREE.Color(0.9, 0.95, 1.1) }));
      envMat.blending = THREE.AdditiveBlending; envMat.transparent = true; envMat.depthWrite = false; envMat.depthTest = false; envScene.children[0].renderOrder = 2;
      envScene.add(hm);
    }
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.03).texture;
    scene.environmentIntensity = ASSETS.hdr ? 0.45 : 0.6;
    pm.dispose();
  }
  scene.background = new THREE.Color(0x0b0e14);

  // ---------- sky dome with moon
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMoon: { value: MOON_DIR.clone() }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `varying vec3 vD; uniform vec3 uMoon; uniform float uTime;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){ vec3 d=normalize(vD); float y=clamp(d.y,0.,1.);
        vec3 c=mix(vec3(0.085,0.11,0.16),vec3(0.018,0.024,0.04),pow(y,0.55));
        float m=dot(d,uMoon); c+=vec3(0.55,0.62,0.78)*pow(max(m,0.),220.)*0.9+vec3(0.2,0.25,0.35)*pow(max(m,0.),12.)*0.35;
        c+=vec3(2.4,2.5,2.6)*smoothstep(0.99955,0.9997,m);
        vec2 uv=d.xz/(d.y+0.35)*3.0; float cl=n(uv+uTime*0.01)*0.6+n(uv*2.3)*0.4; c=mix(c,c*0.55+vec3(0.05,0.06,0.08)*pow(max(m,0.),6.),smoothstep(0.55,0.8,cl)*0.8);
        float s=step(0.9975,h(floor(d.xz/(d.y+0.4)*260.)))*smoothstep(0.1,0.5,d.y); c+=vec3(s)*0.35;
        gl_FragColor=vec4(c,1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

  // ---------- floor
  const floorMat = new THREE.MeshStandardMaterial({ map: TEX.floorMap, roughnessMap: TEX.floorRough, normalMap: TEX.floorNormal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, metalness: 0, color: 0x9fa2a8 });
  if (TEX.floorARM) { floorMat.aoMap = TEX.floorARM; floorMat.aoMapIntensity = 0.9; floorMat.normalScale.set(0.9, 0.9); floorMat.color.set(0x858b95); }
  const rep = ASSETS.have.floor ? 64 / 3.2 : 64 / 6; // Poly Haven monastery floor: ~3.2 m per tile
  for (const t of new Set([TEX.floorMap, TEX.floorRough, TEX.floorNormal])) t.repeat.set(rep, rep);
  floorMat.onBeforeCompile = (sh) => {
    sh.uniforms.tMacro = { value: TEX.macro };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPf;').replace('#include <project_vertex>', '#include <project_vertex>\nvWPf=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tMacro; varying vec3 vWPf;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec4 mac=texture2D(tMacro,vWPf.xz/41.0); vec4 mac2=texture2D(tMacro,vWPf.xz/13.0+0.37);
        diffuseColor.rgb*=mix(0.78,1.16,mac.r);
        float ashm=smoothstep(0.52,0.78,mac2.g*0.6+mac.g*0.4);
        float rr=length(vWPf.xz); float edge=smoothstep(${(ARENA_R - 0.6).toFixed(1)},${(ARENA_R + 1.8).toFixed(1)},rr);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.24,0.235,0.23),ashm*0.35+edge*0.15);
        diffuseColor.rgb*=1.0-edge*0.12;
        // moss creeping in from the breach and along the walls (gathers in the dark joints)
        float brch=smoothstep(13.0,23.0,vWPf.x)*smoothstep(13.0,3.0,abs(vWPf.z));
        float mossN=smoothstep(0.42,0.72,mac2.r*0.7+mac.g*0.3);
        float moss=clamp(brch*0.95+smoothstep(16.5,22.0,rr)*0.55,0.0,1.0)*mossN;
        float crev=1.0-smoothstep(0.1,0.28,dot(diffuseColor.rgb,vec3(0.333)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.07,0.085,0.05),moss*(0.3+0.7*crev));
        // rain-wet stone under the broken roof: darker, glossier, catches the moon
        float wet=smoothstep(7.8,3.2,rr+(mac.r-0.5)*5.0);
        diffuseColor.rgb*=1.0-wet*0.28;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=clamp(roughnessFactor+ashm*0.25+moss*0.1,0.0,1.0);
        roughnessFactor=mix(roughnessFactor,0.34,wet*0.75);`);
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const S = new THREE.Group(); scene.add(S); // static decor, baked into a few draw calls at the end
  // ---------- stone material for architecture
  // architecture: Poly Haven "medieval blocks" projected in world space (blocks keep a constant real-world size)
  const stone = worldUV(stoneMaterial(0x8a939e), 0, 3.0);
  const stoneDark = worldUV(stoneMaterial(0x5b626c), 0, 3.0);
  const rockMat = worldUV(stoneMaterial(0x6e747c, 'rock'), 0, 1.6);
  MAT.stoneDark = stoneDark; MAT.rock = rockMat;
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x55534f, roughness: 1, metalness: 0, normalMap: TEX.leatherNormal, normalScale: new THREE.Vector2(0.4, 0.4) });
  MAT.stone = stone; MAT.ash = ashMat;

  // walls with a collapsed breach to the east
  const wallGeo = new THREE.CylinderGeometry(WALL_R, WALL_R, 22, 72, 1, true, Math.PI / 2 + 0.42, TAU - 0.84);
  const wallMat = worldUV(stoneMaterial(0x7a828d), 1, 3.0, (TAU - 0.84) * WALL_R / 3.0);
  wallMat.side = THREE.BackSide;
  const wall = new THREE.Mesh(wallGeo, wallMat); wall.position.y = 11; wall.receiveShadow = true; scene.add(wall);
  // breach: jagged broken blocks along the edges
  const rockG = [rockGeo(3), rockGeo(8), rockGeo(13)];
  const rubble = [];
  const rr = mulberry(42);
  // stepped, broken wall stubs flanking the breach
  const stubs = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 2 + side * (0.42 - k * 0.075), h = 19 - k * 4.2 - rr() * 2;
      const g = rbox(2.4, h, 1.6, 0.15);
      g.translate(0, h / 2, 0);
      const m = new THREE.Mesh(g, stoneDark); m.position.set(Math.sin(a) * (WALL_R + 0.3), 0, Math.cos(a) * (WALL_R + 0.3)); m.rotation.y = a + (rr() - 0.5) * 0.15;
      m.receiveShadow = true; stubs.push(m); S.add(m);
      rubble.push({ x: Math.sin(a) * (WALL_R - 1), y: 0, z: Math.cos(a) * (WALL_R - 1), s: 0.9 + rr() * 0.9 });
    }
  }
  for (let k = 0; k < 26; k++) { const a = Math.PI / 2 + (rr() - 0.5) * 0.9, r = WALL_R - 3 + rr() * 6; rubble.push({ x: Math.sin(a) * r, y: rr() * 0.4, z: Math.cos(a) * r, s: 0.4 + rr() * 1.3 }); }
  // arena edge debris ring (marks the boundary)
  for (let k = 0; k < 70; k++) { const a = rr() * TAU, r = ARENA_R + 0.9 + rr() * 1.8; rubble.push({ x: Math.sin(a) * r, y: 0, z: Math.cos(a) * r, s: 0.12 + rr() * rr() * 0.5 }); }

  // pillars
  const shaftG = fluteGeo(1, 0.78), baseG = lathe([[0.0, 0], [1.25, 0], [1.25, 0.35], [1.05, 0.5], [0.98, 0.9], [0.82, 1.05]], 24), capG = lathe([[0.8, 0], [0.95, 0.3], [1.3, 0.8], [1.3, 1.1], [0.0, 1.1]], 24);
  const N = 14;
  const pillarMat = worldUV(stoneMaterial(0x8a939e), 1, 2.6, 2);
  const shafts = new THREE.InstancedMesh(shaftG, pillarMat, N), bases = new THREE.InstancedMesh(baseG, stoneDark, N), caps = new THREE.InstancedMesh(capG, stoneDark, N);
  const m4 = new THREE.Matrix4();
  let capN = 0;
  for (let i = 0; i < N; i++) {
    const a = (i + 0.5) / N * TAU;
    const x = Math.sin(a) * PILLAR_R, z = Math.cos(a) * PILLAR_R;
    const broken = [2, 5, 9, 11].includes(i) || (Math.abs(wrapA(a - Math.PI / 2)) < 0.4);
    const h = broken ? 2.5 + rr() * 6 : ROOF_Y - 2.1;
    PILLARS.push({ x, z, r: 1.15 });
    m4.compose(V3(x, 1.0, z), new THREE.Quaternion(), V3(1, h, 1)); shafts.setMatrixAt(i, m4);
    m4.compose(V3(x, 0, z), new THREE.Quaternion(), V3(1, 1, 1)); bases.setMatrixAt(i, m4);
    if (!broken) { m4.compose(V3(x, 1 + h, z), new THREE.Quaternion(), V3(1, 1, 1)); caps.setMatrixAt(capN++, m4); }
    else { for (let k = 0; k < 5; k++) rubble.push({ x: x + (rr() - 0.5) * 3.5, y: 0, z: z + (rr() - 0.5) * 3.5, s: 0.35 + rr() * 0.8 }); rubble.push({ x, y: h + 1, z, s: 0.95 }); }
  }
  caps.count = capN;
  for (const m of [shafts, bases, caps]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  // rubble instances
  for (let gi = 0; gi < 3; gi++) {
    const list = rubble.filter((_, i) => i % 3 === gi);
    const im = new THREE.InstancedMesh(rockG[gi], rockMat, list.length);
    list.forEach((r, i) => {
      m4.compose(V3(r.x, r.y + r.s * 0.3, r.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rr() * 3, rr() * 3, rr() * 3)), V3(r.s, r.s * (0.6 + rr() * 0.5), r.s * (0.8 + rr() * 0.4)));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }

  // roof: broken ring with a jagged opening + fallen ribs
  const roofG = new THREE.RingGeometry(8, WALL_R + 0.5, 64, 4);
  { const p = roofG.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y); if (r < 9) { const a = Math.atan2(y, x); const k = 7.5 + vnoise(a * 3 + 10, 0.5, 5, 1000) * 5; p.setXY(i, x / r * k, y / r * k); } } }
  const roofMat = worldUV(stoneMaterial(0x3f444b), 0, 3.0); roofMat.side = THREE.DoubleSide;
  const roof = new THREE.Mesh(roofG, roofMat); roof.rotation.x = Math.PI / 2; roof.position.y = ROOF_Y + 1; roof.castShadow = true; scene.add(roof);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU + 0.2, len = 5 + rr() * 6;
    const rib = new THREE.Mesh(rbox(0.7, 0.9, len, 0.1), stoneDark);
    rib.position.set(Math.sin(a) * (WALL_R - len / 2 - 1), ROOF_Y + 0.3, Math.cos(a) * (WALL_R - len / 2 - 1));
    rib.rotation.set(0, a, 0); rib.rotateX(-0.12); S.add(rib);
  }

  // gothic windows (cold moonlight glass)
  const wt = windowTex();
  const winMat = new THREE.MeshBasicMaterial({ map: wt, transparent: true, depthWrite: false, fog: true, color: new THREE.Color(0.42, 0.5, 0.66) });
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU + 0.31;
    if (Math.abs(wrapA(a - Math.PI / 2)) < 0.6 || Math.abs(wrapA(a - Math.PI)) < 0.25) continue;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 7.5), winMat);
    w.position.set(Math.sin(a) * (WALL_R - 0.05), 11.5, Math.cos(a) * (WALL_R - 0.05)); w.lookAt(0, 11.5, 0); S.add(w);
  }
  // banners
  const bannerMat = new THREE.MeshStandardMaterial({ map: TEX.banner, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.95 });
  const bannerU = { uTime: { value: 0 } };
  bannerMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = bannerU.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
      float k=clamp((2.5-position.y)/5.0,0.0,1.0); transformed.z+=sin(uTime*0.9+position.y*0.8+modelMatrix[3][0])*0.18*k*k; transformed.x+=sin(uTime*0.6+position.y*1.3)*0.05*k;`);
  };
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.0;
    if (Math.abs(wrapA(a - Math.PI / 2)) < 0.7) continue;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 5, 4, 10), bannerMat);
    b.position.set(Math.sin(a) * (WALL_R - 0.5), 9.2, Math.cos(a) * (WALL_R - 0.5)); b.lookAt(0, 9.2, 0);
    b.castShadow = false; scene.add(b);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 6), stoneDark); rod.rotation.z = Math.PI / 2; rod.position.copy(b.position); rod.position.y += 2.55; rod.lookAt(0, rod.position.y, 0); rod.rotateY(Math.PI / 2); rod.rotateZ(Math.PI / 2); S.add(rod);
  }

  // the sealed gate (north)
  const gate = new THREE.Group(); gate.position.set(0, 0, -21.6); S.add(gate);
  const gm = metalMat(0x2a2a2c, 1, null);
  add(gate, rbox(3.6, 11, 0.5, 0.05), gm, -1.85, 5.5, 0);
  add(gate, rbox(3.6, 11, 0.5, 0.05), gm, 1.85, 5.5, 0.05, 0, 0.02, 0);
  for (let y = 1; y < 11; y += 1.6) add(gate, rbox(7.4, 0.18, 0.62, 0.04), metalMat(0x3b3a38, 0.9, null), 0, y, 0);
  add(gate, rbox(1.4, 12.5, 1.4, 0.1), stone, -4.4, 6.25, 0.3); add(gate, rbox(1.4, 12.5, 1.4, 0.1), stone, 4.4, 6.25, 0.3);
  add(gate, rbox(10.5, 1.6, 1.6, 0.1), stone, 0, 12.8, 0.3);
  const crestMat = new THREE.MeshStandardMaterial({ color: 0x8a7446, metalness: 0.8, roughness: 0.5, alphaMap: TEX.crest, transparent: true, depthWrite: false });
  add(gate, new THREE.PlaneGeometry(3.2, 3.2), crestMat, 0, 7.4, 0.32);
  for (let i = 0; i < 3; i++) add(gate, rbox(12 - i * 1.5, 0.35, 2.4 - i * 0.6, 0.05), stoneDark, 0, 0.17 + i * 0.35, 1.6 - i * 0.3);
  // broken altar
  const altar = new THREE.Group(); altar.position.set(0, 0, -18.3); S.add(altar);
  add(altar, rbox(4.6, 1.1, 1.5, 0.08), stone, 0, 0.55, 0);
  add(altar, rbox(2.3, 0.3, 1.7, 0.05), stoneDark, -1.2, 1.25, 0, 0, 0, 0.06);
  add(altar, rbox(2.0, 0.3, 1.6, 0.05), stoneDark, 1.5, 0.9, 0.5, 0.2, 0.3, -0.45);
  // sarcophagi
  for (const [x, z, ry] of [[-11.2, -15.8, 0.62], [11.8, -15.1, -0.66], [-19.2, 3.8, 1.5]]) {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; S.add(s);
    add(s, rbox(1.2, 0.9, 2.4, 0.06), stone, 0, 0.45, 0);
    add(s, rbox(1.3, 0.22, 2.5, 0.08), stoneDark, 0.15, 0.95, 0.2, 0.05, 0.25, 0.08);
  }
  // pews (half-destroyed)
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a211c, roughness: 0.9, map: TEX.leatherMap });
  const pewGeo = BGU.mergeGeometries([rbox(2.6, 0.08, 0.5, 0.02).translate(0, 0.45, 0), rbox(2.6, 0.5, 0.06, 0.02).translate(0, 0.75, -0.22), rbox(0.08, 0.45, 0.45, 0.02).translate(-1.2, 0.22, 0), rbox(0.08, 0.45, 0.45, 0.02).translate(1.2, 0.22, 0)].map((g) => g.toNonIndexed()));
  const pewList = [];
  for (let row = 0; row < 4; row++) for (const side of [-1, 1]) {
    const a = Math.PI + side * (0.55 + row * 0.12), r = 19.3;
    pewList.push([Math.sin(a) * r, Math.cos(a) * r, a, row === 2 && side > 0]);
  }
  for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + (k - 1.5) * 0.18, r = 19.5; pewList.push([Math.sin(a) * r, Math.cos(a) * r, a, k === 1]); }
  const pews = new THREE.InstancedMesh(pewGeo, woodMat, pewList.length);
  pewList.forEach((p, i) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p[3] ? 1.3 : 0, p[2] + (rr() - 0.5) * 0.3, p[3] ? 0.2 : (rr() - 0.5) * 0.1));
    m4.compose(V3(p[0], p[3] ? 0.3 : 0, p[1]), q, V3(1, 1, 1)); pews.setMatrixAt(i, m4);
  });
  pews.castShadow = true; pews.receiveShadow = true; scene.add(pews);

  // ash drifts
  const ashG = rockGeo(77, 2); ashG.scale(1, 0.18, 1);
  const ashList = [];
  for (let k = 0; k < 34; k++) { const a = rr() * TAU, r = ARENA_R + 1 + rr() * 7.5; ashList.push([Math.sin(a) * r, Math.cos(a) * r, 0.6 + rr() * 1.8]); }
  const ashIM = new THREE.InstancedMesh(ashG, ashMat, ashList.length);
  ashList.forEach((p, i) => { m4.compose(V3(p[0], -0.04, p[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rr() * 6, 0)), V3(p[2], p[2], p[2] * (0.7 + rr() * 0.5))); ashIM.setMatrixAt(i, m4); });
  ashIM.receiveShadow = true; scene.add(ashIM);

  // kneeling knight statues (same crest, same armour as the Warden)
  const statueMat = worldUV(stoneMaterial(0x7d838b, 'rock'), 0, 1.4);
  const kneel = { pY: -0.42, pP: 8, cP: 12, hP: 20, sx: 0.0, sy: -0.2, sz: 0.34, syaw: 0, spit: -86, srol: 90, st: 1 };
  const statue = buildStatue(statueMat, kneel);
  for (const a of [0.6, -0.6, Math.PI - 0.55, Math.PI + 0.55]) {
    const g = new THREE.Group(); g.position.set(Math.sin(a) * 19.6, 0, Math.cos(a) * 19.6); g.rotation.y = a + Math.PI; S.add(g);
    add(g, rbox(2.4, 1.0, 2.4, 0.06), stoneDark, 0, 0.5, 0);
    const s = statue.clone(); s.position.y = 1.0; g.add(s);
  }

  // candles (instanced wax + flame points)
  const candles = [];
  const addCandles = (cx, cy, cz, n, spread) => { for (let i = 0; i < n; i++) candles.push([cx + (rr() - 0.5) * spread, cy, cz + (rr() - 0.5) * spread * 0.5, 0.12 + rr() * 0.28]); };
  addCandles(-1.6, 1.1, -18.1, 7, 1.6); addCandles(1.4, 1.1, -18.2, 5, 1.4); addCandles(-0.3, 0.0, -16.9, 6, 3);
  for (const a of [0.6, -0.6, Math.PI - 0.55, Math.PI + 0.55]) addCandles(Math.sin(a) * 18.1, 0, Math.cos(a) * 18.1, 4, 1.2);
  // votive clusters at the pillar feet along the nave (warm accents against the moonlight)
  for (let i = 0; i < 14; i++) { const a2 = (i + 0.5) / 14 * TAU; if (Math.abs(wrapA(a2 - Math.PI / 2)) < 0.5) continue; const r2 = PILLAR_R - 1.35; addCandles(Math.sin(a2) * r2, 0, Math.cos(a2) * r2, 5, 1.1); }
  const waxMat = new THREE.MeshStandardMaterial({ color: 0xbfb49c, roughness: 0.6, emissive: 0x2a1406 });
  const cim = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.04, 1, 8).translate(0, 0.5, 0), waxMat, candles.length);
  candles.forEach((c, i) => { m4.compose(V3(c[0], c[1], c[2]), new THREE.Quaternion(), V3(1, c[3], 1)); cim.setMatrixAt(i, m4); });
  scene.add(cim);
  const fpos = new Float32Array(candles.length * 3), fseed = new Float32Array(candles.length);
  candles.forEach((c, i) => { fpos[i * 3] = c[0]; fpos[i * 3 + 1] = c[1] + c[3] + 0.05; fpos[i * 3 + 2] = c[2]; fseed[i] = rr() * 10; });
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3)); fg.setAttribute('seed', new THREE.BufferAttribute(fseed, 1));
  const flameU = { uTime: { value: 0 }, uPR: { value: 1 } };
  const flames = new THREE.Points(fg, new THREE.ShaderMaterial({
    uniforms: flameU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float uTime,uPR; varying float vF; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vF=0.8+0.2*sin(uTime*13.0+seed*7.0)*sin(uTime*7.3+seed); gl_PointSize=uPR*55.0*vF/-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vF; void main(){ vec2 p=gl_PointCoord-0.5; p.y*=0.6; p.y+=0.1; float d=length(p*vec2(2.2,1.0)); float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(vec3(1.0,0.55,0.18)*a*vF*1.6+vec3(1.0,0.9,0.7)*smoothstep(0.18,0.0,d)*0.9,1.0); }`,
  }));
  flames.frustumCulled = false; scene.add(flames);

  // moonlight shafts through the broken roof
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false,
    uniforms: { uTime: { value: 0 }, uI: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; vY=uv.y; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform float uTime,uI; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vP;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
      void main(){ float edge=pow(abs(dot(vN,vV)),2.0); float fade=smoothstep(0.0,0.35,vY)*smoothstep(1.0,0.75,vY);
        float nn=0.65+0.35*n(vec2(vP.x*0.6+vP.z*0.4+uTime*0.05,vP.y*0.3-uTime*0.1));
        gl_FragColor=vec4(vec3(0.42,0.5,0.66)*edge*fade*nn*0.075*uI,1.0); }`,
  });
  const shafts2 = [];
  for (const [x, z, r0, r1] of [[0.5, 0.5, 3.8, 4.6], [-2.4, 2.2, 1.6, 2.0], [2.8, -2.6, 1.9, 2.3]]) {
    const len = ROOF_Y / MOON_DIR.y;
    const g = new THREE.CylinderGeometry(r0, r1, len, 24, 1, true); g.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(g, shaftMat);
    m.position.set(x + MOON_DIR.x * len, ROOF_Y + 0.5, z + MOON_DIR.z * len);
    m.position.set(x + MOON_DIR.x / MOON_DIR.y * ROOF_Y, ROOF_Y, z + MOON_DIR.z / MOON_DIR.y * ROOF_Y);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), MOON_DIR);
    m.renderOrder = 5; m.frustumCulled = false; scene.add(m); shafts2.push(m);
  }
  setShafts = (on) => { for (const m of shafts2) m.visible = on; };
  setShafts(Q.shafts);
  // distant ruined city beyond the breach
  const cityMat = new THREE.MeshBasicMaterial({ color: 0x0f141d, fog: false });
  const towerG = BGU.mergeGeometries([new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed(), new THREE.ConeGeometry(0.75, 0.35, 4).translate(0, 1.17, 0).rotateY(Math.PI / 4).toNonIndexed()].map((g) => { g.deleteAttribute('uv'); return g; }));
  const towers = new THREE.InstancedMesh(towerG, cityMat, 26);
  for (let i = 0; i < 26; i++) {
    const a = Math.PI / 2 + (rr() - 0.5) * 1.1, r = 55 + rr() * 50, h = 10 + rr() * rr() * 45, w = 3 + rr() * 6;
    m4.compose(V3(Math.sin(a) * r, -2, Math.cos(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rr() * 3, (rr() - 0.5) * (h > 30 ? 0.12 : 0.02))), V3(w, h, w)); towers.setMatrixAt(i, m4);
  }
  scene.add(towers);
  const hills = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 8, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x0c1017, side: THREE.BackSide, fog: false }));
  hills.position.y = -1; scene.add(hills);

  bakeStatic(S);
  arenaUpdate = (t, dt) => {
    skyMat.uniforms.uTime.value = t; bannerU.uTime.value = t; flameU.uTime.value = t; shaftMat.uniforms.uTime.value = t;
    flameU.uPR.value = renderer.getPixelRatio();
    const f = 0.82 + 0.1 * Math.sin(t * 11.7) * Math.sin(t * 4.3) + 0.08 * Math.sin(t * 23.1);
    candleLights.forEach((l) => { l.intensity = (8 + ARENA.warm * 2) * f; });
    shaftMat.uniforms.uI.value = 1 - ARENA.warm * 0.35;
    hemi.color.setRGB(lerp(0.44, 0.5, ARENA.warm), lerp(0.51, 0.4, ARENA.warm), lerp(0.66, 0.4, ARENA.warm));
    scene.fog.color.setRGB(lerp(0.026, 0.05, ARENA.warm), lerp(0.032, 0.03, ARENA.warm), lerp(0.048, 0.03, ARENA.warm));
    if (ARENA.violet > 0) { const v = ARENA.violet; scene.fog.color.lerp(_violetFog, v); hemi.color.lerp(_violetHemi, v * 0.6); }
    if (torchLights) torchLights.forEach((l, i) => { const s = i * 1.7; l.intensity = TORCH_I * TORCH_K * (0.84 + 0.1 * Math.sin(t * 9.3 + s) * Math.sin(t * 3.7 + s * 2) + 0.06 * Math.sin(t * 21 + s)) * (1 + ARENA.warm * 0.3); });
  };
}
function shadowFollow(center) {
  const d = 30;
  moon.target.position.set(center.x, 0, center.z);
  moon.position.set(center.x + MOON_DIR.x * d, MOON_DIR.y * d, center.z + MOON_DIR.z * d);
}

function bakeStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh) return;
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(m);
  });
  for (const [mat, list] of buckets) {
    const geos = list.map((m) => {
      let g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      return g;
    });
    const merged = BGU.mergeGeometries(geos, false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = list.some((m) => m.castShadow); mesh.receiveShadow = true;
    if (mat.transparent) mesh.renderOrder = 2;
    scene.add(mesh);
  }
  scene.remove(group);
}
