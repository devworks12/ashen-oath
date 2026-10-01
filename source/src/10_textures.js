// ------------------------------------------------------------------ procedural textures
// Tileable value-noise + fbm, generated into typed arrays and uploaded as DataTextures.
function hashI(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, s, P) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % P) + P) % P, y0 = ((yi % P) + P) % P, x1 = (x0 + 1) % P, y1 = (y0 + 1) % P;
  const a = hashI(x0, y0, s), b = hashI(x1, y0, s), c = hashI(x0, y1, s), d = hashI(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, P, oct = 4) {
  let a = 0.5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 17, P * f); n += a; a *= 0.5; f *= 2; }
  return sum / n;
}

function dataTex(data, w, h, srgb, repeat = 1) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
// normal map from height (tileable)
function heightToNormal(hgt, w, h, strength) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
      const dx = (hgt[y * w + xr] - hgt[y * w + xl]) * strength;
      const dy = (hgt[yd * w + x] - hgt[yu * w + x]) * strength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      out[i] = (nx / l * 0.5 + 0.5) * 255;
      out[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      out[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

// draw a crack polyline into a height & mask buffer
function drawCrack(hgt, mask, w, h, x, y, ang, len, rnd, depth) {
  for (let i = 0; i < len; i++) {
    ang += (rnd() - 0.5) * 0.7;
    x += Math.cos(ang); y += Math.sin(ang);
    const r = 1.2 * (1 - i / len) + 0.4;
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const d = Math.hypot(ox, oy);
      if (d > r + 1) continue;
      const px = ((Math.round(x) + ox) % w + w) % w, py = ((Math.round(y) + oy) % h + h) % h;
      const k = clamp(1 - d / (r + 1), 0, 1);
      hgt[py * w + px] -= depth * k;
      if (mask) mask[py * w + px] = Math.max(mask[py * w + px], k);
    }
    if (rnd() < 0.02 && len - i > 10) drawCrack(hgt, mask, w, h, x, y, ang + (rnd() - 0.5) * 2, (len - i) * 0.5, rnd, depth * 0.8);
  }
}

const TEX = {};

// Cathedral floor: 3x3 large slabs per tile, running bond rows, grout, chips, cracks, ash.
async function genFloor(S) {
  const rnd = mulberry(7);
  const N = S * S;
  const hgt = new Float32Array(N), col = new Uint8Array(N * 4), rough = new Uint8Array(N * 4), crackM = new Float32Array(N);
  const rows = 3, cols = 3;
  const rowOff = [0, 0.5, 0.2];
  const slabTone = [], slabTilt = [];
  for (let i = 0; i < 24; i++) { slabTone.push(rnd()); slabTilt.push([(rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.06]); }
  for (let y = 0; y < S; y++) {
    const v = y / S * rows, r = Math.floor(v), fy = v - r;
    for (let x = 0; x < S; x++) {
      let u = x / S * cols + rowOff[r];
      u = ((u % cols) + cols) % cols;
      const c = Math.floor(u), fx = u - c;
      const id = r * cols + c;
      const nx = x / S, ny = y / S;
      const n1 = fbm(nx * 8, ny * 8, 3, 8, 4);
      const n2 = fbm(nx * 32, ny * 32, 9, 32, 3);
      const edgeN = fbm(nx * 24, ny * 24, 21, 24, 2);
      // distance to slab edge in slab units, chipped by noise
      const ex = Math.min(fx, 1 - fx) * (S / cols), ey = Math.min(fy, 1 - fy) * (S / rows);
      const ed = Math.min(ex, ey) - edgeN * 5;
      const grout = 1 - smooth(clamp(ed / 3.2, 0, 1));
      const bevel = 1 - smooth(clamp(ed / 9, 0, 1));
      const i = y * S + x;
      const tilt = slabTilt[id];
      hgt[i] = 1 + (fx - 0.5) * tilt[0] + (fy - 0.5) * tilt[1] + n2 * 0.08 + n1 * 0.05 - grout * 0.55 - bevel * 0.1;
    }
    if ((y & 63) === 0) await nextFrame();
  }
  // cracks
  for (let k = 0; k < 7; k++) drawCrack(hgt, crackM, S, S, rnd() * S, rnd() * S, rnd() * TAU, 40 + rnd() * 120, rnd, 0.35);
  for (let y = 0; y < S; y++) {
    const v = y / S * rows, r = Math.floor(v), fy = v - r;
    for (let x = 0; x < S; x++) {
      let u = x / S * cols + rowOff[r];
      u = ((u % cols) + cols) % cols;
      const c = Math.floor(u), fx = u - c;
      const id = r * cols + c;
      const nx = x / S, ny = y / S;
      const i = y * S + x;
      const n1 = fbm(nx * 6, ny * 6, 41, 6, 4);
      const n3 = fbm(nx * 48, ny * 48, 77, 48, 2);
      const ash = smooth(clamp((fbm(nx * 4, ny * 4, 55, 4, 4) - 0.52) * 5, 0, 1));
      const grout = clamp((1 - hgt[i]) * 1.8, 0, 1);
      const tone = slabTone[id];
      let base = 0.33 + tone * 0.1 + (n1 - 0.5) * 0.16 + (n3 - 0.5) * 0.06;
      base *= 1 - grout * 0.55;
      base *= 1 - crackM[i] * 0.5;
      let R = base * 0.96, G = base * 0.98, B = base * 1.04;
      // warm/cool slab variance
      R += (tone - 0.5) * 0.03; B -= (tone - 0.5) * 0.02;
      // soot stains
      const soot = smooth(clamp((fbm(nx * 5, ny * 5, 91, 5, 3) - 0.6) * 4, 0, 1));
      R *= 1 - soot * 0.45; G *= 1 - soot * 0.45; B *= 1 - soot * 0.42;
      // ash dust: pale, grey
      const ashL = 0.46 + n3 * 0.08;
      R = lerp(R, ashL, ash * 0.55 + grout * 0.25); G = lerp(G, ashL * 0.99, ash * 0.55 + grout * 0.25); B = lerp(B, ashL * 0.98, ash * 0.55 + grout * 0.25);
      const o = i * 4;
      col[o] = clamp(R, 0, 1) * 255; col[o + 1] = clamp(G, 0, 1) * 255; col[o + 2] = clamp(B, 0, 1) * 255; col[o + 3] = 255;
      // roughness: worn slab centres a touch smoother (moon glints)
      const worn = smooth(clamp((n1 - 0.45) * 3, 0, 1)) * (1 - ash) * (1 - grout);
      const rr = clamp(0.88 - worn * 0.34 + ash * 0.1 + grout * 0.1 + (n3 - 0.5) * 0.08, 0.3, 1);
      rough[o] = rough[o + 1] = rough[o + 2] = rr * 255; rough[o + 3] = 255;
      hgt[i] += ash * 0.03;
    }
    if ((y & 63) === 0) await nextFrame();
  }
  const nrm = heightToNormal(hgt, S, S, S / 256 * 2.2);
  TEX.floorMap = dataTex(col, S, S, true);
  TEX.floorRough = dataTex(rough, S, S, false);
  TEX.floorNormal = dataTex(nrm, S, S, false);
}

// Wall / pillar ashlar blocks
async function genStone(S) {
  const rnd = mulberry(11);
  const N = S * S, hgt = new Float32Array(N), col = new Uint8Array(N * 4), rough = new Uint8Array(N * 4);
  const rows = 8, cols = 4;
  for (let y = 0; y < S; y++) {
    const v = y / S * rows, r = Math.floor(v), fy = v - r;
    for (let x = 0; x < S; x++) {
      let u = x / S * cols + (r % 2) * 0.5;
      u = ((u % cols) + cols) % cols;
      const c = Math.floor(u), fx = u - c;
      const nx = x / S, ny = y / S;
      const n = fbm(nx * 16, ny * 16, 5, 16, 4);
      const ex = Math.min(fx, 1 - fx) * (S / cols), ey = Math.min(fy, 1 - fy) * (S / rows);
      const ed = Math.min(ex, ey) - fbm(nx * 30, ny * 30, 8, 30, 2) * 3;
      const grout = 1 - smooth(clamp(ed / 2.5, 0, 1));
      const i = y * S + x;
      hgt[i] = n * 0.4 - grout * 0.6 + hashI(r, c, 3) * 0.1;
      const tone = 0.27 + hashI(r, c, 1) * 0.08 + (n - 0.5) * 0.14;
      const b = tone * (1 - grout * 0.5);
      const moss = fbm(nx * 3, ny * 3, 44, 3, 3);
      const o = i * 4;
      col[o] = clamp(b * 0.97, 0, 1) * 255; col[o + 1] = clamp(b * (0.98 + moss * 0.02), 0, 1) * 255; col[o + 2] = clamp(b * 1.03, 0, 1) * 255; col[o + 3] = 255;
      const rr = 0.9 + (n - 0.5) * 0.1;
      rough[o] = rough[o + 1] = rough[o + 2] = clamp(rr, 0, 1) * 255; rough[o + 3] = 255;
    }
    if ((y & 63) === 0) await nextFrame();
  }
  for (let k = 0; k < 5; k++) drawCrack(hgt, null, S, S, rnd() * S, rnd() * S, rnd() * TAU, 30 + rnd() * 60, rnd, 0.4);
  TEX.stoneMap = dataTex(col, S, S, true);
  TEX.stoneRough = dataTex(rough, S, S, false);
  TEX.stoneNormal = dataTex(heightToNormal(hgt, S, S, S / 256 * 2.5), S, S, false);
}

// Worn metal: scratches, dents, grime. Neutral albedo, tinted by material.color.
async function genMetal(S) {
  const rnd = mulberry(23);
  const N = S * S, hgt = new Float32Array(N), col = new Uint8Array(N * 4), rough = new Uint8Array(N * 4), scr = new Float32Array(N);
  // scratches
  for (let k = 0; k < 260; k++) {
    let x = rnd() * S, y = rnd() * S; const a = rnd() * TAU; const len = 6 + rnd() * rnd() * 90; const dep = 0.3 + rnd() * 0.7;
    for (let i = 0; i < len; i++) {
      x += Math.cos(a) + (rnd() - 0.5) * 0.3; y += Math.sin(a) + (rnd() - 0.5) * 0.3;
      const px = ((x | 0) % S + S) % S, py = ((y | 0) % S + S) % S;
      scr[py * S + px] = Math.max(scr[py * S + px], dep);
    }
  }
  // dents
  const dents = [];
  for (let k = 0; k < 30; k++) dents.push([rnd() * S, rnd() * S, 4 + rnd() * 18, rnd() * 0.6]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = x / S, ny = y / S, i = y * S + x;
      const n = fbm(nx * 6, ny * 6, 13, 6, 4);
      const n2 = fbm(nx * 40, ny * 40, 31, 40, 2);
      let h = n2 * 0.15 - scr[i] * 0.5;
      for (const d of dents) {
        let dx = Math.abs(x - d[0]), dy = Math.abs(y - d[1]);
        dx = Math.min(dx, S - dx); dy = Math.min(dy, S - dy);
        const r = Math.hypot(dx, dy) / d[2];
        if (r < 1) h -= d[3] * (1 - r * r) * (1 - r * r);
      }
      hgt[i] = h;
      const grime = smooth(clamp((n - 0.42) * 2.4, 0, 1));
      const rust = smooth(clamp((fbm(nx * 9, ny * 9, 71, 9, 3) - 0.66) * 6, 0, 1));
      let b = 0.84 + (n2 - 0.5) * 0.1 + scr[i] * 0.16 - grime * 0.3;
      const o = i * 4;
      col[o] = clamp(b + rust * 0.05, 0, 1) * 255;
      col[o + 1] = clamp(b - rust * 0.12, 0, 1) * 255;
      col[o + 2] = clamp(b - rust * 0.2, 0, 1) * 255;
      col[o + 3] = 255;
      const rr = clamp(0.42 + grime * 0.38 + rust * 0.3 - scr[i] * 0.22 + (n2 - 0.5) * 0.1, 0.12, 1);
      rough[o] = rough[o + 1] = rough[o + 2] = rr * 255; rough[o + 3] = 255;
    }
    if ((y & 63) === 0) await nextFrame();
  }
  TEX.metalMap = dataTex(col, S, S, true);
  TEX.metalRough = dataTex(rough, S, S, false);
  TEX.metalNormal = dataTex(heightToNormal(hgt, S, S, S / 256 * 3), S, S, false);
}

async function genLeather(S) {
  const N = S * S, hgt = new Float32Array(N), col = new Uint8Array(N * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = x / S, ny = y / S, i = y * S + x;
    const w = Math.abs(fbm(nx * 10, ny * 4, 3, 4, 4) - 0.5) * 2; // ridged wrinkles
    const n = fbm(nx * 30, ny * 30, 8, 30, 2);
    hgt[i] = (1 - w) * 0.6 + n * 0.2;
    const b = 0.8 + (n - 0.5) * 0.18 - (1 - w) * 0.14;
    const o = i * 4; col[o] = col[o + 1] = col[o + 2] = clamp(b, 0, 1) * 255; col[o + 3] = 255;
  }
  TEX.leatherMap = dataTex(col, S, S, true);
  TEX.leatherNormal = dataTex(heightToNormal(hgt, S, S, S / 256 * 3), S, S, false);
}

// Tattered cloth (alpha): torn bottom edge, burn holes, weave
async function genCloth(S) {
  const N = S * S, col = new Uint8Array(N * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = x / S, ny = y / S, i = y * S + x;
    const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.04;
    const n = fbm(nx * 8, ny * 8, 12, 8, 4);
    // bottom (ny→1) torn strips
    const strip = fbm(nx * 22, 0.5, 5, 22, 2);
    const tear = ny - (0.72 + strip * 0.3 - (fbm(nx * 6, 1.5, 9, 6, 2) * 0.12));
    const hole = fbm(nx * 5, ny * 5, 33, 5, 3);
    let a = tear > 0 ? 0 : 1;
    if (hole > 0.7 && ny > 0.25) a = 0;
    const burn = smooth(clamp((ny - 0.55) * 3 + (hole - 0.55) * 3, 0, 1));
    const b = (0.8 + (n - 0.5) * 0.25 + weave) * (1 - burn * 0.7);
    const o = i * 4; col[o] = col[o + 1] = col[o + 2] = clamp(b, 0, 1) * 255; col[o + 3] = a * 255;
  }
  TEX.clothMap = dataTex(col, S, S, true);
  TEX.clothMap.wrapS = TEX.clothMap.wrapT = THREE.ClampToEdgeWrapping;
}

// Blade: u across width (edges bright/smooth), v along length. Plus crack emissive for the boss blade.
async function genBlade(W, H) {
  const rnd = mulberry(5);
  const N = W * H, col = new Uint8Array(N * 4), rough = new Uint8Array(N * 4), em = new Uint8Array(N * 4), hgt = new Float32Array(N), cm = new Float32Array(N);
  for (let k = 0; k < 6; k++) drawCrack(hgt, cm, W, H, W * (0.3 + rnd() * 0.4), H * (0.1 + rnd() * 0.8), (rnd() - 0.5) * 2 + Math.PI / 2 * (rnd() < 0.5 ? 1 : -1), 20 + rnd() * 40, rnd, 0.3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x;
    const edge = smooth(clamp((Math.abs(u - 0.5) - 0.32) / 0.16, 0, 1));
    const n = fbm(u * 4, v * 32, 3, 32, 4), n2 = fbm(u * 16, v * 128, 7, 128, 2);
    const b = 0.68 + edge * 0.28 + (n - 0.5) * 0.2 + (n2 - 0.5) * 0.08 - cm[i] * 0.3;
    const o = i * 4;
    col[o] = col[o + 1] = col[o + 2] = clamp(b, 0, 1) * 255; col[o + 3] = 255;
    const r = clamp(0.62 - edge * 0.42 + (n - 0.5) * 0.3 + cm[i] * 0.3, 0.08, 1);
    rough[o] = rough[o + 1] = rough[o + 2] = r * 255; rough[o + 3] = 255;
    // emissive: cracks + inner seam, falls off toward tip
    const seam = Math.exp(-Math.pow((u - 0.5) / 0.05, 2)) * (0.35 + 0.65 * fbm(v * 40, 0.3, 17, 40, 2));
    const e = clamp(cm[i] * 1.4 + seam * 0.6, 0, 1) * (0.4 + 0.6 * (1 - v));
    em[o] = e * 255; em[o + 1] = e * e * 120; em[o + 2] = e * e * e * 40; em[o + 3] = 255;
  }
  const mk = (d, s) => { const t = dataTex(d, W, H, s); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
  TEX.bladeMap = mk(col, true); TEX.bladeRough = mk(rough, false); TEX.bladeEmissive = mk(em, true);
}

// Kingdom crest (gate beneath a broken crown), drawn to canvas
function drawCrest(ctx, cx, cy, s, stroke, fill) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.lineWidth = 0.05; ctx.strokeStyle = stroke; ctx.fillStyle = fill;
  // shield
  ctx.beginPath(); ctx.moveTo(-0.8, -0.7); ctx.lineTo(0.8, -0.7); ctx.lineTo(0.8, 0.1); ctx.quadraticCurveTo(0.7, 0.75, 0, 1.05); ctx.quadraticCurveTo(-0.7, 0.75, -0.8, 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
  // gate arch
  ctx.beginPath(); ctx.moveTo(-0.38, 0.55); ctx.lineTo(-0.38, -0.05); ctx.arc(0, -0.05, 0.38, Math.PI, 0); ctx.lineTo(0.38, 0.55); ctx.stroke();
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 0.13, -0.25 - (i === 0 ? 0.15 : 0.06 * (2 - Math.abs(i)))); ctx.lineTo(i * 0.13, 0.55); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-0.38, 0.2); ctx.lineTo(0.38, 0.2); ctx.stroke();
  // broken crown
  ctx.beginPath(); ctx.moveTo(-0.55, -0.85); ctx.lineTo(-0.5, -1.25); ctx.lineTo(-0.28, -1.0); ctx.lineTo(0, -1.35); ctx.lineTo(0.1, -1.05); ctx.moveTo(0.22, -1.0); ctx.lineTo(0.5, -1.22); ctx.lineTo(0.55, -0.85); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.55, -0.85); ctx.lineTo(0.55, -0.85); ctx.stroke();
  // crack across the crest
  ctx.beginPath(); ctx.moveTo(0.15, -0.7); ctx.lineTo(0.05, -0.35); ctx.lineTo(0.18, -0.05); ctx.lineTo(0.02, 0.4); ctx.lineTo(0.12, 1.0); ctx.stroke();
  ctx.restore();
}
function genBanner() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#3b1c1a'); grd.addColorStop(0.7, '#2a1413'); grd.addColorStop(1, '#120b0a');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  g.globalAlpha = 0.55; drawCrest(g, 128, 190, 70, '#9a8456', 'rgba(0,0,0,0)'); g.globalAlpha = 1;
  // trim
  g.fillStyle = '#6e5a39'; g.fillRect(0, 0, 256, 10); g.fillRect(10, 0, 5, 512); g.fillRect(241, 0, 5, 512);
  // burns & tears
  const img = g.getImageData(0, 0, 256, 512); const d = img.data;
  for (let y = 0; y < 512; y++) for (let x = 0; x < 256; x++) {
    const nx = x / 256, ny = y / 512, i = (y * 256 + x) * 4;
    const n = fbm(nx * 6, ny * 12, 3, 64, 4);
    const tearLine = 0.68 + fbm(nx * 14, 0.2, 8, 14, 2) * 0.32;
    const hole = fbm(nx * 4, ny * 8, 19, 32, 3);
    const burn = smooth(clamp((ny - tearLine + 0.18) * 5, 0, 1));
    const k = (0.75 + n * 0.5) * (1 - burn * 0.8);
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    d[i + 3] = (ny > tearLine || (hole > 0.72 && ny > 0.3)) ? 0 : 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  TEX.banner = t;
}
function genCrestDecal() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  drawCrest(g, 128, 140, 80, '#fff', 'rgba(0,0,0,0)');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  TEX.crest = t;
}
// soft sprite textures
function genSprites() {
  const mk = (fn, s = 64) => { const c = document.createElement('canvas'); c.width = c.height = s; fn(c.getContext('2d'), s); const t = new THREE.CanvasTexture(c); return t; };
  TEX.glow = mk((g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); });
}

async function generateTextures(progress, have = {}) {
  const big = !isTouch;
  // procedural textures are only generated for roles the bundled CC0 assets did not cover
  progress(0.3, 'Laying the stone');
  if (!have.floor) await genFloor(big ? 1024 : 768);
  progress(0.45, 'Raising the pillars');
  if (!have.blocks || !have.rock) { const keep = have.blocks ? { m: TEX.stoneMap, n: TEX.stoneNormal, r: TEX.stoneRough } : null; await genStone(512); if (!have.rock) { TEX.rockMap = TEX.stoneMap; TEX.rockNormal = TEX.stoneNormal; TEX.rockARM = TEX.stoneRough; } if (keep) { TEX.stoneMap = keep.m; TEX.stoneNormal = keep.n; TEX.stoneRough = keep.r; } }
  progress(0.55, 'Forging iron');
  if (!have.metal) await genMetal(512);
  progress(0.65, 'Tanning leather');
  await genLeather(256);
  await genCloth(256);
  progress(0.75, 'Tempering blades');
  await genBlade(64, 512);
  genBanner(); genCrestDecal(); genSprites();
  // macro variation noise (world-space, breaks floor tiling)
  const M = 256, md = new Uint8Array(M * M * 4);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { const n = fbm(x / M * 4, y / M * 4, 99, 4, 5); const n2 = fbm(x / M * 12, y / M * 12, 5, 12, 3); const o = (y * M + x) * 4; md[o] = n * 255; md[o + 1] = n2 * 255; md[o + 2] = 0; md[o + 3] = 255; }
  TEX.macro = dataTex(md, M, M, false);
  progress(0.85, 'Gathering ash');
}

// ------------------------------------------------------------------ materials
const MAT = {};
function patchCharacter(mat, U) {
  // fresnel rim + dissolve-to-ash for characters
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = U.uRim; sh.uniforms.uRimPow = U.uRimPow; sh.uniforms.uHit = U.uHit; sh.uniforms.uDissolve = U.uDissolve; sh.uniforms.uDisH = U.uDisH; sh.uniforms.uDisY = U.uDisY;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <project_vertex>', '#include <project_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uRim; uniform float uRimPow,uDissolve,uDisH,uDisY,uHit; varying vec3 vWP;
      float h3(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float n3(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float disV=0.0;
      if(uDissolve>0.0){ disV=0.55*clamp((vWP.y-uDisY)/uDisH,0.0,1.0)+0.45*(n3(vWP*6.0)*0.6+n3(vWP*17.0)*0.4); if(disV>1.0-uDissolve) discard; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float rimF=pow(1.0-clamp(dot(normal,normalize(vViewPosition)),0.0,1.0),uRimPow); totalEmissiveRadiance+=uRim*rimF+vec3(1.0,0.9,0.8)*uHit*(0.35+0.65*rimF);
        if(uDissolve>0.0){ float e=smoothstep(1.0-uDissolve-0.09,1.0-uDissolve,disV); totalEmissiveRadiance+=vec3(3.2,1.1,0.3)*e; } }`);
  };
  mat.customProgramCacheKey = () => 'charmat' + (U.key || '');
  return mat;
}
function charUniforms(rimColor, key) {
  return { uHit: { value: 0 }, uRim: { value: new THREE.Color(rimColor) }, uRimPow: { value: 3.0 }, uDissolve: { value: 0 }, uDisH: { value: 3.0 }, uDisY: { value: 0 }, key };
}
function metalMat(color, rough = 1, U, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: rough, map: TEX.metalMap, roughnessMap: TEX.metalRough, normalMap: TEX.metalNormal, normalScale: new THREE.Vector2(0.8, 0.8), ...extra });
  if (TEX.metalARM) { m.metalnessMap = TEX.metalARM; m.metalness = Math.min(1, m.metalness * 1.1); m.aoMap = TEX.metalARM; m.aoMapIntensity = 0.7; m.normalScale.set(0.55, 0.55); }
  return U ? patchCharacter(m, U) : m;
}
function leatherMat(color, U) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.72, map: TEX.leatherMap, normalMap: TEX.leatherNormal, normalScale: new THREE.Vector2(0.9, 0.9) });
  return U ? patchCharacter(m, U) : m;
}
function clothMat(color, U, alpha = false) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.95, map: TEX.clothMap, side: THREE.DoubleSide, alphaTest: alpha ? 0.5 : 0 });
  if (!alpha) { m.map = TEX.leatherMap; }
  return U ? patchCharacter(m, U) : m;
}
function darkMat(U) {
  const m = new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 1, metalness: 0 });
  return U ? patchCharacter(m, U) : m;
}
