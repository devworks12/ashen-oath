import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// ------------------------------------------------------------------ utils
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const dampAngle = (a, b, k, dt) => a + wrapA(b - a) * (1 - Math.exp(-k * dt));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
function mulberry(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const EASE = {
  lin: (t) => t,
  in: (t) => t * t,
  in3: (t) => t * t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  out3: (t) => 1 - Math.pow(1 - t, 3),
  io: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  io3: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  snap: (t) => 1 - Math.pow(1 - t, 5), // very fast release
  hold: (t) => (t < 1 ? 0 : 1),
};
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const DEBUG = location.hash === '#debug';

// segment / capsule helpers
const _tA = V3(), _tB = V3(), _tC = V3();
function closestPtSeg(p, a, b, out) {
  _tA.subVectors(b, a);
  const l2 = _tA.lengthSq();
  let t = l2 > 1e-8 ? _tB.subVectors(p, a).dot(_tA) / l2 : 0;
  t = clamp(t, 0, 1);
  return out.copy(a).addScaledVector(_tA, t);
}

// ------------------------------------------------------------------ settings (per-viewer convenience)
const SETTINGS = { quality: 'auto', shake: 1, haptics: true, music: 0.7, sfx: 0.85, seenTutorial: false, fights: 0 };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('ashenOath') || '{}')); } catch (e) {}
function saveSettings() { try { localStorage.setItem('ashenOath', JSON.stringify(SETTINGS)); } catch (e) {} }

function haptic(ms) {
  if (!SETTINGS.haptics) return;
  try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {}
}

// ------------------------------------------------------------------ renderer
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isTouch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; // soft PCF is costly on mobile GPUs
app.appendChild(renderer.domElement);
renderer.domElement.id = 'c';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 220);
camera.position.set(0, 3, 10);

// quality presets
const QUALITY = {
  // torches: how many wall torches are real point lights (each one costs every lit pixel; the halos stay either way)
  high: { scale: 1.75, shadow: 2048, bloom: true, bloomRes: 0.5, samples: 4, particles: 1.0, ash: 700, post: true, sharpen: 1, shafts: true, torches: 6, name: 'High' },
  medium: { scale: 1.25, shadow: 1024, bloom: true, bloomRes: 0.3, samples: 0, particles: 0.7, ash: 380, post: true, sharpen: 0, shafts: true, torches: 4, name: 'Medium' },
  low: { scale: 1.0, shadow: 512, bloom: false, bloomRes: 0.25, samples: 0, particles: 0.45, ash: 180, post: false, sharpen: 0, shafts: false, torches: 0, name: 'Low' },
};
let Q = QUALITY.high;
let qualityName = 'high';
function initialQuality() {
  if (SETTINGS.quality !== 'auto') return SETTINGS.quality;
  return 'high'; // phones start on High too; adaptQuality steps down if frames run long
}

// post
const composerTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerTarget);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.92);
composer.addPass(bloomPass);

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.55 },
    uSharp: { value: 1 },
    uHurt: { value: 0 },
    uFocus: { value: 0 },
    uWarm: { value: 0 },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `
  uniform sampler2D tDiffuse; uniform float uSharp,uVignette,uHurt,uFocus,uWarm,uFade,uFlash,uTime; uniform vec2 uRes; varying vec2 vUv;
  void main(){
    vec2 uv=vUv; vec4 c=texture2D(tDiffuse,uv);
    // subtle sharpen
    vec3 col=c.rgb;
    if(uSharp>0.5){ vec2 px=1.0/uRes;
      vec3 blur=(texture2D(tDiffuse,uv+vec2(px.x,0.)).rgb+texture2D(tDiffuse,uv-vec2(px.x,0.)).rgb+texture2D(tDiffuse,uv+vec2(0.,px.y)).rgb+texture2D(tDiffuse,uv-vec2(0.,px.y)).rgb)*0.25;
      col+=(c.rgb-blur)*0.22; }
    // grade: cool shadows, slightly lifted blacks, warm highlights in phase 2
    float l=dot(col,vec3(0.2126,0.7152,0.0722));
    col=mix(col, col*vec3(0.92,0.98,1.08), 0.35*(1.0-smoothstep(0.0,0.6,l)));
    col+=vec3(0.002,0.003,0.005);
    col=mix(col, col*vec3(1.08,0.97,0.9), uWarm*smoothstep(0.1,0.9,l));
    // perfect-dodge focus: desaturate periphery
    vec2 d=uv-0.5; d.x*=uRes.x/uRes.y; float r=length(d);
    col=mix(col, vec3(l)*vec3(0.9,0.97,1.08), uFocus*smoothstep(0.2,0.75,r)*0.8);
    // vignette
    float v=smoothstep(0.35,1.05,r);
    col*=1.0-v*uVignette;
    // hurt edge
    col=mix(col, col*vec3(1.05,0.4,0.35)+vec3(0.05,0.0,0.0), min(uHurt,0.6)*smoothstep(0.6,1.25,r));
    col+=vec3(1.0,0.97,0.92)*uFlash*(1.0-smoothstep(0.0,0.6,r))*0.35;
    col*=1.0-uFade;
    gl_FragColor=vec4(col,c.a);
  }`,
};
const gradePass = new ShaderPass(GradeShader);
composer.addPass(gradePass);
composer.addPass(new OutputPass());
const GRADE = gradePass.uniforms;

let usePost = true;
function applyQuality(name) {
  qualityName = name;
  Q = QUALITY[name];
  usePost = Q.post;
  bloomPass.enabled = Q.bloom;
  GRADE.uSharp.value = Q.sharpen;
  if (typeof setShafts === 'function') setShafts(Q.shafts);
  if (typeof setTorchLights === 'function') setTorchLights(Q.torches);
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) { if (rt.samples !== Q.samples) { rt.samples = Q.samples; rt.dispose(); } }
  onResize();
  if (typeof moon !== 'undefined') {
    moon.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
  }
  if (typeof VFX !== 'undefined') VFX.setQuality(Q);
}

let viewW = 1, viewH = 1;
// dynamic resolution multiplier (adjusted from measured frame intervals)
const DYN = { scale: 1, acc: 0, n: 0, t: 0, good: 0 };
function onResize() {
  viewW = window.innerWidth; viewH = window.innerHeight;
  const pr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, Q.scale) * DYN.scale);
  renderer.setPixelRatio(pr);
  renderer.setSize(viewW, viewH);
  composer.setPixelRatio(pr);
  composer.setSize(viewW, viewH);
  bloomPass.setSize(viewW * pr * Q.bloomRes * 2, viewH * pr * Q.bloomRes * 2);
  GRADE.uRes.value.set(viewW * pr, viewH * pr);
  camera.aspect = viewW / viewH;
  camera.fov = camera.aspect < 1.5 ? 60 : 52;
  camera.updateProjectionMatrix();
  // compact phones (e.g. inside an app frame): scale the whole UI with the viewport so it never crowds the scene
  UI_Z = viewH <= 420 ? clamp(Math.min(viewH / 400, viewW / 860), 0.5, 1) : 1;
  document.documentElement.style.setProperty('--z', UI_Z.toFixed(3));
  checkOrientation();
}
let UI_Z = 1;
window.addEventListener('resize', onResize);
function checkOrientation() {
  const el = document.getElementById('rotate');
  if (!el) return;
  el.hidden = !(isTouch && window.innerHeight > window.innerWidth);
}
