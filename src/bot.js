import * as THREE from 'three';

// Simple humanoid bot: capsule-ish body with separate head for headshots.
// Patrols, chases player when line of sight is clear, shoots.
export class Bot {
  constructor(scene, world, position, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;

    this.health = 100;
    this.alive = true;
    this.deadTimer = 0;

    this.position = position.clone();
    this.velocity = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.speed = 2.6 + Math.random() * 1.0;

    this.state = 'patrol'; // patrol | chase | dead
    this.nextDecision = 0;
    this.patrolTarget = this._randomPatrolPoint();
    this.lastShot = 0;
    this.shootCooldown = 0.8 + Math.random() * 0.7;
    this.accuracy = 0.6;
    this.seeRange = 40;
    this.eyeHeight = 1.6;

    this.root = new THREE.Group();
    this.root.position.copy(this.position);
    this.scene.add(this.root);

    this._buildBody();

    // Collision parts
    this.headBox = new THREE.Box3();
    this.bodyBox = new THREE.Box3();
    this._refreshBoxes();
  }

  _buildBody() {
    const skin = new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.7 });
    const suit = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.05 + Math.random()*0.1, 0.3, 0.25 + Math.random()*0.15),
      roughness: 0.8
    });
    const vest = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });

    // Torso
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), suit);
    this.torso.position.y = 1.15;
    this.root.add(this.torso);

    // Vest
    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.55, 0.34), vest);
    vestMesh.position.y = 1.2;
    this.root.add(vestMesh);

    // Head
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), skin);
    this.head.position.y = 1.72;
    this.root.add(this.head);

    // Helmet
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.32), vest);
    helmet.position.y = 1.84;
    this.root.add(helmet);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.16, 0.65, 0.16);
    this.armL = new THREE.Mesh(armGeo, suit);
    this.armL.position.set(-0.38, 1.15, 0);
    this.root.add(this.armL);
    this.armR = new THREE.Mesh(armGeo, suit);
    this.armR.position.set(0.38, 1.15, 0);
    this.root.add(this.armR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    this.legL = new THREE.Mesh(legGeo, suit);
    this.legL.position.set(-0.14, 0.4, 0);
    this.root.add(this.legL);
    this.legR = new THREE.Mesh(legGeo, suit);
    this.legR.position.set(0.14, 0.4, 0);
    this.root.add(this.legR);

    // Simple gun in front
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.4 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), gunMat);
    gun.position.set(0.28, 1.1, -0.3);
    this.root.add(gun);
  }

  _randomPatrolPoint() {
    const r = 15 + Math.random() * 15;
    const a = Math.random() * Math.PI * 2;
    return new THREE.Vector3(
      this.position.x + Math.cos(a)*r,
      this.position.y,
      this.position.z + Math.sin(a)*r
    );
  }

  _refreshBoxes() {
    this.head.position.set(0, 1.72, 0);
    this.headBox.setFromCenterAndSize(
      new THREE.Vector3(this.position.x, this.position.y + 1.72, this.position.z),
      new THREE.Vector3(0.3, 0.32, 0.3)
    );
    this.bodyBox.setFromCenterAndSize(
      new THREE.Vector3(this.position.x, this.position.y + 1.05, this.position.z),
      new THREE.Vector3(0.6, 1.1, 0.4)
    );
  }

  // Raycast against the bot's head and body boxes (rough — checks if segment between ray origin and hit
  // point on the bot is close enough). Returns nearest hit info.
  raycast(origin, dir, maxDist) {
    if (!this.alive) return null;
    // Test both boxes with THREE.Ray
    const ray = new THREE.Ray(origin, dir);
    const hitHead = new THREE.Vector3();
    const hitBody = new THREE.Vector3();
    const headHit = ray.intersectBox(this.headBox, hitHead);
    const bodyHit = ray.intersectBox(this.bodyBox, hitBody);

    let point = null;
    let isHead = false;
    let d = Infinity;
    if (headHit) {
      const dh = origin.distanceTo(hitHead);
      if (dh < d) { d = dh; point = hitHead.clone(); isHead = true; }
    }
    if (bodyHit) {
      const db = origin.distanceTo(hitBody);
      if (db < d) { d = db; point = hitBody.clone(); isHead = false; }
    }
    if (!point || d > maxDist) return null;
    return { point, distance: d, bot: this, head: isHead };
  }

  takeDamage(amt, headshot) {
    if (!this.alive) return false;
    this.health -= amt * (headshot ? 4 : 1);
    if (this.head) this.head.scale.setScalar(1 + (headshot? 0.2 : 0));
    if (this.health <= 0) {
      this.die();
      return true;
    }
    // Damage makes them immediately chase
    this.state = 'chase';
    this.nextDecision = 0;
    return false;
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.deadTimer = 0;
    // Ragdoll-ish: tip over
    this.root.rotation.z = (Math.random()-0.5) * 1.8;
    this.root.position.y = 0.3;
  }

  respawn(pos) {
    this.position.copy(pos);
    this.root.position.copy(pos);
    this.root.rotation.set(0,0,0);
    this.health = 100;
    this.alive = true;
    this.state = 'patrol';
    this.deadTimer = 0;
    this.patrolTarget = this._randomPatrolPoint();
    this.head.scale.setScalar(1);
    this._refreshBoxes();
  }

  canSee(target) {
    const eye = new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    const to = new THREE.Vector3().subVectors(target, eye);
    const dist = to.length();
    if (dist > this.seeRange) return false;
    to.normalize();
    const hit = this.world.raycastLevel(eye, to, dist - 0.3);
    return !hit;
  }

  update(dt, t, playerPos) {
    if (!this.alive) {
      this.deadTimer += dt;
      return;
    }

    const targetEye = new THREE.Vector3(playerPos.x, playerPos.y + 1.6, playerPos.z);
    const eye = new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    const toPlayer = new THREE.Vector3().subVectors(targetEye, eye);
    const distPlayer = toPlayer.length();
    const canSee = this.canSee(targetEye);

    // Decide state
    if (canSee) this.state = 'chase';

    if (t > this.nextDecision) {
      this.nextDecision = t + 0.3 + Math.random() * 0.5;
      if (this.state === 'chase' && !canSee && distPlayer > 30) {
        this.state = 'patrol';
        this.patrolTarget = this._randomPatrolPoint();
      } else if (this.state === 'patrol' && Math.random() < 0.3) {
        this.patrolTarget = this._randomPatrolPoint();
      }
    }

    let moveTarget;
    if (this.state === 'chase') {
      // Strafe a bit while approaching / keeping mid range
      const ideal = 12;
      const offset = distPlayer - ideal;
      const flat = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).normalize();
      const strafeDir = new THREE.Vector3(-flat.z, 0, flat.x).multiplyScalar(Math.sin(t*1.7 + this.position.x) * 0.6);
      moveTarget = new THREE.Vector3()
        .addScaledVector(flat, Math.sign(offset) * Math.min(1, Math.abs(offset)*0.3))
        .add(strafeDir);

      // Aim at player
      this.yaw = Math.atan2(toPlayer.x, toPlayer.z);

      // Shoot
      if (canSee && t - this.lastShot > this.shootCooldown) {
        this.lastShot = t;
        this._shootAt(targetEye, distPlayer);
      }
    } else {
      moveTarget = new THREE.Vector3().subVectors(this.patrolTarget, this.position);
      moveTarget.y = 0;
      if (moveTarget.length() < 1.5) {
        this.patrolTarget = this._randomPatrolPoint();
      }
      this.yaw = Math.atan2(moveTarget.x, moveTarget.z);
    }

    if (moveTarget.lengthSq() > 0.01) moveTarget.normalize();

    // Simple ground movement
    const speed = this.state === 'chase' ? this.speed * 1.15 : this.speed * 0.6;
    const dx = moveTarget.x * speed * dt;
    const dz = moveTarget.z * speed * dt;

    // Try X
    const oldX = this.position.x, oldZ = this.position.z;
    this.position.x += dx;
    this._refreshBoxes();
    if (this.world.collidesAABB(this.bodyBox.min, this.bodyBox.max)) {
      this.position.x = oldX;
      if (this.state === 'patrol') this.patrolTarget = this._randomPatrolPoint();
    }
    this.position.z += dz;
    this._refreshBoxes();
    if (this.world.collidesAABB(this.bodyBox.min, this.bodyBox.max)) {
      this.position.z = oldZ;
      if (this.state === 'patrol') this.patrolTarget = this._randomPatrolPoint();
    }

    // Stick to floor with a downward ray
    const floorHit = this.world.raycastLevel(
      new THREE.Vector3(this.position.x, this.position.y + 2, this.position.z),
      new THREE.Vector3(0, -1, 0),
      8
    );
    if (floorHit) this.position.y = floorHit.point.y;

    // Apply transform
    this.root.position.set(this.position.x, this.position.y, this.position.z);
    this.root.rotation.y = this.yaw;

    // Animate legs / arms with walk
    if (Math.hypot(dx, dz) > 0.001) {
      const ph = t * 8;
      this.legL.rotation.x = Math.sin(ph) * 0.6;
      this.legR.rotation.x = -Math.sin(ph) * 0.6;
      this.armL.rotation.x = -Math.sin(ph) * 0.4;
      this.armR.rotation.x = Math.sin(ph) * 0.4;
    } else {
      this.legL.rotation.x *= 0.9;
      this.legR.rotation.x *= 0.9;
      this.armL.rotation.x *= 0.9;
      this.armR.rotation.x *= 0.9;
    }

    this._refreshBoxes();
  }

  _shootAt(targetEye, dist) {
    this.audio?.playBotShot();
    // Bots call into main loop via callback (wired externally):
    if (this.onShoot) {
      const origin = new THREE.Vector3(this.position.x, this.position.y + 1.4, this.position.z);
      const dir = new THREE.Vector3().subVectors(targetEye, origin).normalize();
      // Innacuracy: cone grows with distance
      const err = (1 - this.accuracy) * (dist / 30) * 0.25;
      dir.x += (Math.random()-0.5) * err;
      dir.y += (Math.random()-0.5) * err;
      dir.z += (Math.random()-0.5) * err;
      dir.normalize();
      this.onShoot(origin, dir);
    }
  }
}
