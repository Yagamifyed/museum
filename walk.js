// The Museum as a space you can walk through: white rooms, two works each,
// hung at something like their real size, with a wall label beside each.
// A work marked `walk: "wall"` in curation.json fills the end wall instead.
//
// Drag to look, WASD / arrows to walk, wheel to step, click a work to go to it
// (click again to open its page). The ← → buttons give a guided tour.

import * as THREE from './vendor/three.module.min.js';

const EYE = 1.6;
const ROOM = { width: 8, depth: 9, height: 4.2, door: 3 };
const WIDTH = { small: 0.9, medium: 1.5, large: 2.3 }; // metres across
const MAX_H = 2.4;
const INK = '#3a3c42';

let ctx = null; // everything built on first entry, kept for re-entry

export async function enterWalk(host, works, { onOpen, onFocus } = {}) {
  if (!ctx) ctx = await build(host, works, onOpen, onFocus);
  ctx.active = true;
  ctx.resize();
  ctx.videos.forEach((v) => v.play().catch(() => {}));
  ctx.loop();
  return { prev: () => ctx.step(-1), next: () => ctx.step(1), count: ctx.pieces.length };
}

export function leaveWalk() {
  if (!ctx) return;
  ctx.active = false;
  ctx.videos.forEach((v) => v.pause());
}

async function build(host, works, onOpen, onFocus) {
  await Promise.all([
    document.fonts.load('48px "Hedvig Letters Serif"'),
    document.fonts.load('24px Inter'),
  ]).catch(() => {});

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f6f6f4');
  scene.fog = new THREE.Fog('#f6f6f4', 18, 60);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 120);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xe4e2dc, 3.1));
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(2, 8, 3);
  scene.add(sun);

  // ── rooms ──
  const wall = new THREE.MeshLambertMaterial({ color: '#fbfbfa' });
  const floorMat = new THREE.MeshLambertMaterial({ color: '#dedcd6' });
  const ceilMat = new THREE.MeshBasicMaterial({ color: '#f0f0ee' });

  const hung = works.filter((w) => w.museum?.walk !== 'wall');
  const big = works.find((w) => w.museum?.walk === 'wall');
  const rooms = Math.max(1, Math.ceil(hung.length / 2) + (big ? 1 : 0));
  const length = rooms * ROOM.depth;
  const z0 = 0; // entrance; rooms run towards -z

  const plane = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const floor = plane(ROOM.width, length + 2, floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, z0 - length / 2);
  const ceil = plane(ROOM.width, length + 2, ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOM.height, z0 - length / 2);
  scene.add(floor, ceil);
  for (const side of [-1, 1]) {
    const w = plane(length + 2, ROOM.height, wall);
    w.rotation.y = -side * Math.PI / 2;
    w.position.set(side * ROOM.width / 2, ROOM.height / 2, z0 - length / 2);
    scene.add(w);
  }
  const back = plane(ROOM.width, ROOM.height, wall);
  back.position.set(0, ROOM.height / 2, z0 - length);
  const front = plane(ROOM.width, ROOM.height, wall);
  front.rotation.y = Math.PI; front.position.set(0, ROOM.height / 2, z0 + 1);
  scene.add(back, front);

  // partitions between rooms, each with a doorway in the middle
  const partitions = [];
  const side = (ROOM.width - ROOM.door) / 2;
  for (let r = 1; r < rooms; r++) {
    const z = z0 - r * ROOM.depth;
    partitions.push(z);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(side, ROOM.height, 0.24), wall);
      p.position.set(s * (ROOM.door / 2 + side / 2), ROOM.height / 2, z);
      scene.add(p);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(ROOM.door, ROOM.height - 3.1, 0.24), wall);
    lintel.position.set(0, 3.1 + (ROOM.height - 3.1) / 2, z);
    scene.add(lintel);
  }

  // soft shadow behind each frame, drawn once
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.13)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();

  // ── works ──
  const loader = new THREE.TextureLoader();
  const videos = [];
  const pieces = [];
  const clickable = [];

  const texture = (w) => {
    if (w.motion?.src) {
      const v = Object.assign(document.createElement('video'), { src: w.motion.src, muted: true, loop: true, playsInline: true, preload: 'auto' });
      v.setAttribute('playsinline', '');
      videos.push(v);
      const t = new THREE.VideoTexture(v);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    const t = loader.load(w.media.src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (w.pixelated) { t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    return t;
  };

  const label = (w, n, total) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 320;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 640, 320);
    g.fillStyle = 'rgba(58,60,66,0.5)'; g.font = '22px Inter';
    g.fillText(`${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, 32, 52);
    g.fillStyle = INK; g.font = '44px "Hedvig Letters Serif"';
    wrap(g, w.title, 32, 120, 576, 48, 2);
    g.font = '26px Inter'; g.fillText(w.artist || w.collection || '', 32, 236);
    g.fillStyle = 'rgba(58,60,66,0.5)'; g.font = '22px Inter';
    g.fillText(({ tezos: 'Tezos', ethereum: 'Ethereum', solana: 'Solana', bitcoin: 'Bitcoin' })[w.chain] + (w.editions === 1 ? ', 1 of 1' : w.editions ? `, edition of ${w.editions}` : ''), 32, 280);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.18), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  };

  const hang = (w, { pos, normal, width, maxH, n, total }) => {
    const ar = w.media.w && w.media.h ? w.media.w / w.media.h : 1;
    let wd = width, ht = wd / ar;
    if (ht > maxH) { ht = maxH; wd = ht * ar; }
    const group = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.06, ht + 0.06, 0.04), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(wd, ht), new THREE.MeshBasicMaterial({ map: texture(w), toneMapped: false }));
    art.position.z = 0.021;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(wd * 1.18 + 0.3, ht * 1.18 + 0.3), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.position.set(0.04, -0.06, -0.019);
    group.add(shadow, frame, art);
    const tag = label(w, n, total);
    tag.position.set(wd / 2 + 0.36, -Math.min(ht / 2, 0.45) + 0.09, 0.005);
    if (wd / 2 + 0.6 < 3.2) group.add(tag);
    group.position.copy(pos);
    group.lookAt(pos.clone().add(normal));
    scene.add(group);
    art.userData.index = pieces.length;
    clickable.push(art);
    pieces.push({ work: w, pos: pos.clone(), normal: normal.clone(), width: wd, height: ht });
  };

  const total = works.length;
  let n = 0;
  hung.forEach((w, i) => {
    const room = Math.floor(i / 2);
    const s = i % 2 === 0 ? -1 : 1; // left wall, then right wall
    const z = z0 - room * ROOM.depth - ROOM.depth / 2;
    const width = WIDTH[w.museum?.size] || WIDTH.medium;
    hang(w, { pos: new THREE.Vector3(s * (ROOM.width / 2 - 0.03), EYE, z), normal: new THREE.Vector3(-s, 0, 0), width, maxH: MAX_H, n: ++n, total });
  });
  if (big) {
    hang(big, { pos: new THREE.Vector3(0, 2.15, z0 - length + 0.03), normal: new THREE.Vector3(0, 0, 1), width: ROOM.width - 1.6, maxH: 3.5, n: ++n, total });
  }

  // ── camera & movement ──
  const view = { yaw: 0, pitch: -0.02 };
  const pos = new THREE.Vector3(0, EYE, z0 - 0.5);
  let tween = null;
  let focused = -1;
  const keys = new Set();

  const inside = (p) => {
    p.x = Math.max(-ROOM.width / 2 + 0.6, Math.min(ROOM.width / 2 - 0.6, p.x));
    p.z = Math.min(z0 + 0.4, Math.max(z0 - length + 0.8, p.z));
  };
  // only cross a partition through its doorway
  const blocked = (from, to) => partitions.some((z) => (from.z - z) * (to.z - z) <= 0 && Math.abs(to.x) > ROOM.door / 2 - 0.35);

  function focus(i) {
    const p = pieces[(i + pieces.length) % pieces.length];
    focused = pieces.indexOf(p);
    const dist = Math.max(2.1, Math.max(p.width, p.height) * 1.35);
    const to = p.pos.clone().add(p.normal.clone().multiplyScalar(dist)); to.y = EYE;
    inside(to);
    const dir = p.pos.clone().sub(to);
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.atan2(p.pos.y - EYE, Math.hypot(dir.x, dir.z)) * 0.8;
    let dy = yaw - view.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    tween = { t: 0, from: pos.clone(), to, yaw0: view.yaw, yaw1: view.yaw + dy, pitch0: view.pitch, pitch1: pitch };
    onFocus?.(focused, p.work, pieces.length);
  }

  // look: drag; click: go to / open a work
  const el = renderer.domElement;
  let drag = null;
  el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    view.yaw += dx * 0.0042; view.pitch = Math.max(-0.7, Math.min(0.7, view.pitch + dy * 0.0036));
    tween = null;
  });
  el.addEventListener('pointerup', (e) => {
    if (drag && drag.moved < 6) pick(e);
    drag = null;
  });
  el.addEventListener('wheel', (e) => { e.preventDefault(); walk(-Math.sign(e.deltaY) * 0.9, 0); }, { passive: false });
  addEventListener('keydown', (e) => { if (ctx?.active && !e.metaKey && !e.ctrlKey) keys.add(e.key.toLowerCase()); });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = el.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(clickable)[0];
    if (!hit) return;
    const i = hit.object.userData.index;
    if (i === focused && !tween && hit.distance < 6) onOpen?.(pieces[i].work);
    else focus(i);
  }

  function walk(forward, strafe) {
    const next = pos.clone();
    next.x += -Math.sin(view.yaw) * forward + Math.cos(view.yaw) * strafe;
    next.z += -Math.cos(view.yaw) * forward - Math.sin(view.yaw) * strafe;
    inside(next);
    if (!blocked(pos, next)) pos.copy(next);
    tween = null;
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let last = performance.now();
  function frame(now) {
    if (!ctx.active) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const speed = 3.2 * dt;
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const s = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const turn = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
    if (f || s) walk(f * speed, s * speed);
    if (turn) { view.yaw += turn * 1.6 * dt; tween = null; }
    if (tween) {
      tween.t = Math.min(1, tween.t + dt / 1.3);
      const k = ease(tween.t);
      pos.lerpVectors(tween.from, tween.to, k);
      view.yaw = tween.yaw0 + (tween.yaw1 - tween.yaw0) * k;
      view.pitch = tween.pitch0 + (tween.pitch1 - tween.pitch0) * k;
      if (tween.t === 1) tween = null;
    }
    camera.position.copy(pos);
    camera.rotation.set(view.pitch, view.yaw, 0, 'YXZ');
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.fov = camera.aspect < 0.8 ? 78 : 58; // portrait phones need a wider view
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', () => ctx?.active && resize());

  return {
    active: false, videos, pieces, resize,
    loop: () => { last = performance.now(); requestAnimationFrame(frame); },
    step: (d) => focus(focused < 0 ? (d > 0 ? 0 : pieces.length - 1) : focused + d),
  };
}

function wrap(g, text, x, y, max, lh, lines) {
  const words = String(text).split(/\s+/);
  let line = '', row = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > max && line) {
      if (row === lines - 1) { g.fillText(line + '…', x, y + row * lh); return; }
      g.fillText(line, x, y + row * lh); line = word; row++;
    } else line = test;
  }
  g.fillText(line, x, y + row * lh);
}
