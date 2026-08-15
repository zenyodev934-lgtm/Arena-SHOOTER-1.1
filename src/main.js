import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Weapon } from './weapon.js';
import { Bot } from './bot.js';
import { Input } from './input.js';
import { AudioFX } from './audio.js';

// ----- Globals -----
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88a8c8);
scene.fog = new THREE.Fog(0x88a8c8, 60, 220);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 1000);

const audio = new AudioFX();
const input = new Input(canvas);
const world = new World(scene);

// Sky
{
  const skyGeo = new THREE.SphereGeometry(500, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x3a78c8) },
      bottom: { value: new THREE.Color(0xc0d4e8) }
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
      void main(){ float h = clamp((vP.y/500.0)*0.5+0.5, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

// Default lights (world may add its own)
scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const sun = new THREE.DirectionalLight(0xfff1d0, 0.7);
sun.position.set(40, 80, 30);
scene.add(sun);

// Player & weapon
const player = new Player(camera, world);
const weapon = new Weapon(camera, scene, audio);

// ----- Bots -----
const BOT_COUNT = 3;
const bots = [];
function spawnBots() {
  for (let i = 0; i < BOT_COUNT; i++) {
    const a = (i / BOT_COUNT) * Math.PI * 2;
    const r = 10 + Math.random() * 15;
    const pos = world.findSpawn(new THREE.Vector3(Math.cos(a)*r, 2, Math.sin(a)*r));
    const bot = new Bot(scene, world, pos, audio);
    bot.onShoot = (origin, dir) => botShoot(origin, dir, bot);
    bots.push(bot);
  }
}

// ----- HUD refs -----
const $ = (id) => document.getElementById(id);
const startBtn = $('startBtn');
const loadStatus = $('loadStatus');
const menu = $('menu');
const hpFill = $('hpFill');
const hpText = $('hpText');
const ammoCur = $('ammoCur');
const ammoRes = $('ammoRes');
const weaponName = $('weaponName');
const botCountEl = $('botCount');
const fpsEl = $('fps');
const crosshair = $('crosshair');
const hitmarker = $('hitmarker');
const vignette = $('damageVignette');
const killFeed = $('killFeed');

// ----- Map loading -----
// Looks for the user-supplied model by its original name first, then falls back.
const MAP_CANDIDATES = [
  'assets/models/free_fire_new_peak_3d_model.glb',
  'assets/models/map.glb',
  'assets/models/map.gltf',
];

async function tryLoadMap() {
  for (const url of MAP_CANDIDATES) {
    try {
      // HEAD-like probe: fetch first byte to check existence
      const res = await fetch(url, { method: 'GET', range: 'bytes=0-0' });
      if (!res.ok) continue;
      loadStatus.textContent = `📦 Loading ${url.split('/').pop()}...`;
      const ok = await world.loadMap(url, (p) => {
        loadStatus.textContent = `📦 Loading map... ${Math.round(p*100)}%`;
      });
      if (ok) return { ok: true, url };
    } catch (e) {
      console.warn('Map probe failed for', url, e);
    }
  }
  return { ok: false };
}

async function init() {
  const { ok, url } = await tryLoadMap();
  if (ok) {
    loadStatus.textContent = `✅ Map loaded: ${url.split('/').pop()} (${world.mapSize.toFixed(1)} units)`;
  } else {
    world._buildFallbackArena();
    loadStatus.textContent = '⚠️ Map model not found — using fallback arena. Drop free_fire_new_peak_3d_model.glb into assets/models/ and refresh.';
  }

  // Spawn player
  const spawn = world.findSpawn(new THREE.Vector3(0, 5, 8));
  player.position.copy(spawn);

  spawnBots();
  updateBotCount();

  startBtn.disabled = false;
}

// ----- Game state -----
let running = false;
let lastT = performance.now();
let fpsAcc = 0, fpsFrames = 0, fpsTimer = 0;

function startGame() {
  audio.init();
  menu.style.display = 'none';
  if (!('ontouchstart' in window)) {
    canvas.requestPointerLock?.();
  }
  running = true;
  lastT = performance.now();
}
startBtn.addEventListener('click', startGame);

// ----- Bot firing back -----
function botShoot(origin, dir, bot) {
  // Visual tracer from bot
  spawnBotTracer(origin, dir);
  // Check hit on player
  if (!player.alive) return;
  const eye = new THREE.Vector3(player.position.x, player.position.y + player.eyeHeight*0.9, player.position.z);
  const to = new THREE.Vector3().subVectors(eye, origin);
  const t = to.dot(dir);
  if (t < 0 || t > 60) return;
  const closest = origin.clone().addScaledVector(dir, t);
  const miss = closest.distanceTo(eye);
  if (miss < 0.6) {
    const dmg = 8 + Math.floor(Math.random() * 8);
    player.takeDamage(dmg);
    triggerDamageFX();
    if (!player.alive) onPlayerDeath();
  }
}

function spawnBotTracer(origin, dir) {
  const end = origin.clone().addScaledVector(dir, 40);
  const geom = new THREE.BufferGeometry().setFromPoints([origin, end]);
  const mat = new THREE.LineBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geom, mat);
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geom.dispose(); mat.dispose();
  }, 70);
}

// ----- Hit / damage feedback -----
function triggerHitmarker(headshot) {
  hitmarker.style.animation = 'none';
  void hitmarker.offsetWidth;
  hitmarker.classList.add('show');
  hitmarker.style.borderColor = headshot ? '#ff4444' : '#ffffff';
  setTimeout(() => hitmarker.classList.remove('show'), 250);
}
function triggerDamageFX() {
  vignette.classList.add('hit');
  audio.playHurt();
  setTimeout(() => vignette.classList.remove('hit'), 180);
}
function addKill(text, headshot = false) {
  const el = document.createElement('div');
  el.className = 'kill-item';
  el.innerHTML = (headshot ? '🎯 ' : '💀 ') + text;
  killFeed.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
function updateBotCount() {
  const alive = bots.filter(b => b.alive).length;
  botCountEl.textContent = alive;
  if (alive === 0) {
    setTimeout(() => {
      addKill('🏆 ALL BOTS DOWN — respawning...', false);
      respawnAllBots();
    }, 500);
  }
}
function respawnAllBots() {
  for (const b of bots) {
    const a = Math.random() * Math.PI * 2;
    const r = 15 + Math.random() * 20;
    b.respawn(world.findSpawn(new THREE.Vector3(Math.cos(a)*r, 2, Math.sin(a)*r)));
  }
  updateBotCount();
}
function onPlayerDeath() {
  addKill('☠️ You were eliminated. Respawning...');
  setTimeout(() => {
    const spawn = world.findSpawn(new THREE.Vector3(0, 5, 8));
    player.respawn(spawn);
  }, 1800);
}

// ----- Main loop -----
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.05) dt = 0.05; // clamp big stalls
  const t = now / 1000;

  if (running) {
    const frame = input.sample(dt);

    if (player.alive) {
      player.update(dt, frame);

      // Fire
      const wantFire = frame.shoot || frame.shootPressed;
      if (wantFire) {
        if (weapon.canFire(t)) {
          const result = weapon.fire(t, () => {
            const origin = new THREE.Vector3();
            camera.getWorldPosition(origin);
            const direction = player.getAimDirection();
            return { origin, direction };
          }, bots, world);

          if (result?.hitBot) {
            const killed = result.hitBot.takeDamage(weapon.damage, result.headshot);
            if (killed) {
              audio.playKill();
              addKill(`You dropped a bot${result.headshot ? ' — HEADSHOT!' : ''}`, result.headshot);
              updateBotCount();
            } else {
              audio.playHit();
            }
            triggerHitmarker(result.headshot);
          } else {
            triggerHitmarker(false);
          }
        } else if (weapon.ammo === 0 && !weapon.reloading) {
          weapon.startReload(t);
        }
      }

      // Reload key
      if (frame.reload) weapon.startReload(t);
    }

    weapon.update(dt, t);
    weapon.applyRecoilToPlayer(player);

    // Bots
    for (const b of bots) b.update(dt, t, player.position);

    // HUD
    hpFill.style.width = `${(player.health / player.maxHealth) * 100}%`;
    hpText.textContent = Math.ceil(player.health);
    ammoCur.textContent = weapon.ammo;
    ammoRes.textContent = weapon.reserve;
    weaponName.textContent = weapon.name + (weapon.reloading ? ' (RELOADING...)' : '');

    // Crosshair spread with movement
    const moveAmt = Math.hypot(player.velocity.x, player.velocity.z) / 8;
    const spread = 6 + moveAmt * 14 + weapon.recoil * 8;
    crosshair.style.transform = `translate(-50%,-50%) scale(${1 + moveAmt*0.3 + weapon.recoil*0.2})`;
    crosshair.style.setProperty('--gap', spread+'px');

    // FPS
    fpsFrames++;
    fpsAcc += dt;
    fpsTimer += dt;
    if (fpsTimer > 0.5) {
      fpsEl.textContent = Math.round(fpsFrames / fpsAcc);
      fpsAcc = 0; fpsFrames = 0; fpsTimer = 0;
    }

    input.endFrame();
  }

  renderer.render(scene, camera);
}

// ----- Resize -----
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----- Go -----
init().catch((e) => {
  console.error(e);
  loadStatus.textContent = '❌ Error: ' + e.message;
});
loop();
