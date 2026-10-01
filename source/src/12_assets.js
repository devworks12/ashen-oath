// ------------------------------------------------------------------ external CC0 assets (Poly Haven), bundled with the page
// Every file is served next to the page (relative URLs); nothing is fetched from third parties at runtime.
// Any asset that fails to load falls back to the procedural texture of the same role.
const ASSET_BASE = 'assets/';
const ASSETS = { have: {}, boulder: null, hdr: null };

function loadTex(name, srgb) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(ASSET_BASE + name, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      resolve(t);
    }, undefined, () => reject(new Error(name)));
  });
}
async function loadSurface(id) {
  const [map, normal, arm] = await Promise.all([loadTex(id + '_Diffuse.webp', true), loadTex(id + '_nor_gl.webp', false), loadTex(id + '_arm.webp', false)]);
  return { map, normal, arm };
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

async function loadAssets(progress) {
  progress(0.03, 'Unsealing the cathedral');
  const ids = ['monastery_stone_floor', 'medieval_blocks_03', 'rusty_metal_03', 'boulder_01'];
  const res = await Promise.allSettled([
    ...ids.map((id) => withTimeout(loadSurface(id), 20000)),
    // boulder mesh (Poly Haven glTF geometry repacked as base64 JSON) and the night HDRI (RGBE, base64 text)
    withTimeout(fetch(ASSET_BASE + 'boulder_mesh.json').then((r) => { if (!r.ok) throw new Error('mesh'); return r.json(); }), 20000),
    withTimeout(fetch(ASSET_BASE + 'moonless_golf_hdr.txt').then((r) => { if (!r.ok) throw new Error('hdr'); return r.text(); }), 20000),
    // the Ashen Knight's armour, modelled in Blender (blender/build_ashen_knight.py -> export_game)
    withTimeout(fetch(ASSET_BASE + 'ashen_knight.json').then((r) => { if (!r.ok) throw new Error('knight'); return r.json(); }), 20000),
  ]);
  const [floor, blocks, metal, rock, gltf, hdr, knight] = res.map((r) => (r.status === 'fulfilled' ? r.value : null));
  if (knight) { try { ASSETS.knight = parseKnight(knight); ASSETS.have.knight = true; } catch (e) { console.warn('[assets] knight', e); } }
  if (floor) { TEX.floorMap = floor.map; TEX.floorNormal = floor.normal; TEX.floorRough = floor.arm; TEX.floorARM = floor.arm; ASSETS.have.floor = true; }
  if (blocks) { TEX.stoneMap = blocks.map; TEX.stoneNormal = blocks.normal; TEX.stoneRough = blocks.arm; TEX.stoneARM = blocks.arm; ASSETS.have.blocks = true; }
  if (metal) {
    try {
      const img = metal.map.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
      for (let i = 0; i < a.length; i += 4) { const l = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11; a[i] = l + (a[i] - l) * 0.3; a[i + 1] = l + (a[i + 1] - l) * 0.3; a[i + 2] = l + (a[i + 2] - l) * 0.3 + 3; }
      g.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = metal.map.anisotropy;
      metal.map.dispose(); metal.map = t;
    } catch (e) { /* keep the original albedo */ }
    for (const t of [metal.map, metal.normal, metal.arm]) t.repeat.set(2, 2);
    TEX.metalMap = metal.map; TEX.metalNormal = metal.normal; TEX.metalRough = metal.arm; TEX.metalARM = metal.arm; ASSETS.have.metal = true;
  }
  if (rock) { TEX.rockMap = rock.map; TEX.rockNormal = rock.normal; TEX.rockARM = rock.arm; ASSETS.have.rock = true; }
  const b64 = (str) => { const bin = atob(str), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  if (gltf && rock) {
    try {
      const buf = b64(gltf.data), nv = gltf.vertices, ni = gltf.indices;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 0, nv * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf, nv * 12, nv * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf, nv * 24, nv * 2), 2));
      geo.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, nv * 32, ni), 1));
      geo.computeBoundingSphere();
      const gl = (t) => { const c = t.clone(); c.flipY = false; c.needsUpdate = true; return c; }; // glTF UV convention
      const arm = gl(rock.arm);
      const mat = new THREE.MeshStandardMaterial({ map: gl(rock.map), normalMap: gl(rock.normal), roughnessMap: arm, aoMap: arm, aoMapIntensity: 0.9, metalness: 0, roughness: 1 });
      ASSETS.boulder = new THREE.Mesh(geo, mat); ASSETS.have.boulder = true;
    } catch (e) { console.warn('[assets] boulder', e); }
  }
  if (hdr) {
    try {
      const d = new RGBELoader().setDataType(THREE.HalfFloatType).parse(b64(hdr));
      const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
      t.colorSpace = THREE.LinearSRGBColorSpace; t.flipY = true; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
      t.mapping = THREE.EquirectangularReflectionMapping; ASSETS.hdr = t; ASSETS.have.hdr = true;
    } catch (e) { console.warn('[assets] hdr', e); }
  }
  const failed = res.filter((r) => r.status === 'rejected').length;
  if (failed) console.warn('[assets] ' + failed + ' asset group(s) unavailable, using procedural fallback');
  return ASSETS.have;
}

// Replace a material's UVs with world-space projection (no stretching on scaled boxes / tall pillars).
// mode 0: per-face dominant-axis planar projection. mode 1: cylindrical (u from the mesh UV, v from world height).
function worldUV(mat, mode, tile, uRepeat = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: 1 / tile }; sh.uniforms.uURep = { value: uRepeat };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTile, uURep;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        {
          vec4 wpA = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            wpA = instanceMatrix * wpA;
          #endif
          wpA = modelMatrix * wpA;
          vec2 tuv;
          ${mode === 1 ? 'tuv = vec2(uv.x * uURep, wpA.y * uTile);' : `
          vec3 nA = normal;
          #ifdef USE_INSTANCING
            nA = mat3(instanceMatrix) * nA;
          #endif
          nA = abs(normalize(mat3(modelMatrix) * nA));
          tuv = (nA.y > max(nA.x, nA.z) ? wpA.xz : (nA.x > nA.z ? vec2(wpA.z, wpA.y) : wpA.xy)) * uTile;`}
          #ifdef USE_MAP
            vMapUv = tuv;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = tuv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = tuv;
          #endif
          #ifdef USE_AOMAP
            vAoMapUv = tuv;
          #endif
        }`);
  };
  mat.customProgramCacheKey = () => 'wuv' + mode;
  return mat;
}
// stone material from the loaded surface (or the procedural fallback)
function stoneMaterial(color, kind = 'blocks') {
  const rock = kind === 'rock' && TEX.rockMap;
  const m = new THREE.MeshStandardMaterial({
    map: rock ? TEX.rockMap : TEX.stoneMap, normalMap: rock ? TEX.rockNormal : TEX.stoneNormal,
    roughnessMap: rock ? TEX.rockARM : TEX.stoneRough, roughness: 1, metalness: 0, color,
  });
  const arm = rock ? TEX.rockARM : TEX.stoneARM;
  if (arm) { m.aoMap = arm; m.aoMapIntensity = 0.85; }
  return m;
}
