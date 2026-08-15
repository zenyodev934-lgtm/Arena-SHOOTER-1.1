import * as THREE from 'three';

// Hitscan weapon with muzzle flash, tracer, recoil, reload.
// For now uses a procedurally-built placeholder gun. Later we can swap in a .glb model.
export class Weapon {
  constructor(camera, scene, audio) {
    this.camera = camera;
    this.scene = scene;
    this.audio = audio;

    this.name = 'AK-47';
    this.damage = 25;
    this.headMult = 4;
    this.fireRate = 0.10;   // seconds per shot
    this.magSize = 30;
    this.reserve = 90;
    this.ammo = this.magSize;
    this.reloadTime = 2.0;
    this.spread = 0.008;
    this.range = 200;

    this.lastFire = -999;
    this.reloading = false;
    this.reloadEnd = 0;
    this.recoil = 0;

    this.root = new THREE.Group();
    this.camera.add(this.root);
    this.scene.add(this.root);  // note: added to scene, but parented to camera for transform
    this._buildPlaceholder();

    // Muzzle flash
    this.flash = new THREE.PointLight(0xffaa33, 0, 8, 2);
    this.flash.position.set(0.25, -0.18, -1.1);
    this.root.add(this.flash);
    this.flashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0 })
    );
    this.flashMesh.position.copy(this.flash.position);
    this.root.add(this.flashMesh);

    // Tracer pool
    this.tracers = [];
    for (let i = 0; i < 12; i++) {
      const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0 });
      const line = new THREE.Line(geom, mat);
      line.userData.life = 0;
      this.scene.add(line);
      this.tracers.push(line);
    }
    this._tracerIdx = 0;

    // Impact spark pool
    this.sparks = [];
    for (let i = 0; i < 40; i++) {
      const g = new THREE.SphereGeometry(0.03, 4, 4);
      const m = new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0 });
      const s = new THREE.Mesh(g, m);
      s.userData.vel = new THREE.Vector3();
      s.userData.life = 0;
      this.scene.add(s);
      this.sparks.push(s);
    }
  }

  _buildPlaceholder() {
    // Simple stylized rifle: body + barrel + magazine + sight
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.5, metalness: 0.4 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3a1a, roughness: 0.7 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.55), bodyMat);
    body.position.set(0, 0, -0.25);
    this.root.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.55, 12), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.78);
    this.root.add(barrel);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.13), woodMat);
    mag.position.set(0, -0.17, -0.18);
    mag.rotation.x = -0.15;
    this.root.add(mag);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), woodMat);
    grip.position.set(0, -0.15, 0.02);
    grip.rotation.x = 0.3;
    this.root.add(grip);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.25), woodMat);
    stock.position.set(0, -0.01, 0.18);
    this.root.add(stock);

    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), metalMat);
    sight.position.set(0, 0.10, -0.2);
    this.root.add(sight);

    // Position in view
    this.root.position.set(0.22, -0.22, -0.45);
  }

  canFire(t) {
    if (this.reloading) return false;
    if (this.ammo <= 0) return false;
    return t - this.lastFire >= this.fireRate;
  }

  startReload(t) {
    if (this.reloading) return;
    if (this.ammo >= this.magSize || this.reserve <= 0) return;
    this.reloading = true;
    this.reloadEnd = t + this.reloadTime;
    this.audio?.playReload();
  }

  finishReload() {
    const needed = this.magSize - this.ammo;
    const take = Math.min(needed, this.reserve);
    this.ammo += take;
    this.reserve -= take;
    this.reloading = false;
  }

  // Returns hit info for the game to apply damage: {point, normal, bot, headshot}
  fire(t, getRay, bots = [], world) {
    if (!this.canFire(t)) return null;
    this.lastFire = t;
    this.ammo--;
    this.recoil = Math.min(1.2, this.recoil + 0.4);
    this.audio?.playShot();

    const { origin, direction } = getRay();
    // Apply spread
    const sp = this.spread;
    const d = direction.clone();
    d.x += (Math.random()-0.5) * sp;
    d.y += (Math.random()-0.5) * sp;
    d.z += (Math.random()-0.5) * sp;
    d.normalize();

    // Check world
    const worldHit = world.raycastLevel(origin, d, this.range);
    // Check bots
    let bestBot = null;
    let bestBotT = worldHit ? worldHit.distance : this.range;
    for (const b of bots) {
      if (!b.alive) continue;
      const r = b.raycast(origin, d, bestBotT);
      if (r) { bestBot = r; bestBotT = r.distance; }
    }

    let endPoint;
    if (bestBot) {
      endPoint = bestBot.point;
    } else if (worldHit) {
      endPoint = worldHit.point;
      this._spawnSparks(worldHit.point);
    } else {
      endPoint = origin.clone().addScaledVector(d, this.range);
    }

    this._spawnTracer(this._muzzleWorld(), endPoint);
    this._flash();

    if (this.ammo === 0) this.startReload(t);

    return {
      hitBot: bestBot ? bestBot.bot : null,
      headshot: bestBot ? bestBot.head : false,
      point: endPoint,
    };
  }

  _muzzleWorld() {
    const v = new THREE.Vector3();
    this.flashMesh.getWorldPosition(v);
    return v;
  }

  _spawnTracer(from, to) {
    const line = this.tracers[this._tracerIdx];
    this._tracerIdx = (this._tracerIdx + 1) % this.tracers.length;
    const arr = line.geometry.attributes.position.array;
    arr[0] = from.x; arr[1] = from.y; arr[2] = from.z;
    arr[3] = to.x; arr[4] = to.y; arr[5] = to.z;
    line.geometry.attributes.position.needsUpdate = true;
    line.material.opacity = 1;
    line.userData.life = 0.08;
  }

  _spawnSparks(at) {
    for (let i = 0; i < 4; i++) {
      const s = this.sparks[Math.floor(Math.random()*this.sparks.length)];
      s.position.copy(at);
      s.material.opacity = 1;
      s.userData.life = 0.35 + Math.random()*0.2;
      s.userData.vel.set(
        (Math.random()-0.5)*4,
        Math.random()*3 + 1,
        (Math.random()-0.5)*4
      );
    }
  }

  _flash() {
    this.flash.intensity = 6;
    this.flashMesh.material.opacity = 1;
    this.flashMesh.scale.setScalar(0.8 + Math.random()*0.6);
  }

  update(dt, t) {
    // Reload
    if (this.reloading && t >= this.reloadEnd) this.finishReload();

    // Recoil / view kick recovery + gun kick
    this.recoil = Math.max(0, this.recoil - dt * 4);
    const kick = this.recoil * 0.06;
    const sway = Math.sin(t * 3) * 0.005;
    this.root.position.set(0.22, -0.22 - kick*0.4, -0.45 + kick);
    this.root.rotation.set(-kick, sway, 0);

    // Flash decay
    this.flash.intensity *= Math.max(0, 1 - dt*20);
    this.flashMesh.material.opacity *= Math.max(0, 1 - dt*25);

    // Tracers fade
    for (const line of this.tracers) {
      if (line.userData.life > 0) {
        line.userData.life -= dt;
        line.material.opacity = Math.max(0, line.userData.life / 0.08);
      }
    }
    // Sparks
    for (const s of this.sparks) {
      if (s.userData.life > 0) {
        s.userData.life -= dt;
        s.userData.vel.y -= 9.8 * dt;
        s.position.addScaledVector(s.userData.vel, dt);
        s.material.opacity = Math.max(0, s.userData.life * 2);
      }
    }
  }

  applyRecoilToPlayer(player) {
    if (this.recoil > 0.1) {
      player.pitch += 0.012 * this.recoil;
    }
  }
}
