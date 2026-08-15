import * as THREE from 'three';

// First-person player controller with gravity, jump, crouch, sprint, and AABB collision
export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;

    this.position = new THREE.Vector3(0, 2, 8);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.radius = 0.35;
    this.standHeight = 1.7;
    this.crouchHeight = 1.1;
    this.eyeHeight = this.standHeight;
    this.speed = 5.2;
    this.sprintMul = 1.55;
    this.crouchMul = 0.45;
    this.jumpSpeed = 6.0;
    this.gravity = 18.0;
    this.onGround = false;

    this.health = 100;
    this.maxHealth = 100;
    this.alive = true;

    // View bob
    this.bob = 0;
    this.bobAmt = 0;
  }

  getForward(out = new THREE.Vector3()) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }
  getRight(out = new THREE.Vector3()) {
    out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out;
  }
  getAimDirection(out = new THREE.Vector3()) {
    out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    return out.normalize();
  }

  takeDamage(amt) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amt);
    if (this.health <= 0) {
      this.alive = false;
    }
  }

  respawn(pos) {
    this.position.copy(pos);
    this.velocity.set(0,0,0);
    this.health = this.maxHealth;
    this.alive = true;
  }

  update(dt, input) {
    if (!this.alive) return;

    // Look
    this.yaw -= input.look.x;
    this.pitch -= input.look.y;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));

    // Crouch + eye height smoothing
    const targetEye = input.crouch ? this.crouchHeight : this.standHeight;
    this.eyeHeight += (targetEye - this.eyeHeight) * Math.min(1, dt * 12);

    // Movement
    let spd = this.speed;
    if (input.sprint && !input.crouch && input.move.y > 0.1) spd *= this.sprintMul;
    if (input.crouch) spd *= this.crouchMul;

    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    wish.addScaledVector(fwd, input.move.y);
    wish.addScaledVector(right, input.move.x);
    if (wish.lengthSq() > 1) wish.normalize();
    wish.multiplyScalar(spd);

    this.velocity.x = wish.x;
    this.velocity.z = wish.z;

    // Jump + gravity
    if (input.jump && this.onGround && !input.crouch) {
      this.velocity.y = this.jumpSpeed;
      this.onGround = false;
    }
    this.velocity.y -= this.gravity * dt;

    // Integrate with collision (axis separated)
    this._moveAxis('x', this.velocity.x * dt);
    this._moveAxis('z', this.velocity.z * dt);
    this.onGround = false;
    this._moveAxis('y', this.velocity.y * dt);

    // View bob
    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround && hSpeed > 0.5) {
      this.bob += dt * hSpeed * 1.6;
      this.bobAmt += (1 - this.bobAmt) * Math.min(1, dt * 8);
    } else {
      this.bobAmt += (0 - this.bobAmt) * Math.min(1, dt * 6);
    }
    const bobY = Math.sin(this.bob * 2) * 0.04 * this.bobAmt;
    const bobX = Math.cos(this.bob) * 0.025 * this.bobAmt;

    // Apply to camera
    this.camera.position.set(
      this.position.x + bobX,
      this.position.y + this.eyeHeight + bobY,
      this.position.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  _moveAxis(axis, delta) {
    if (delta === 0) return;
    const half = this.radius;
    const old = this.position[axis];
    this.position[axis] = old + delta;

    // Build AABB around player
    const min = new THREE.Vector3(
      this.position.x - half,
      this.position.y,
      this.position.z - half
    );
    const max = new THREE.Vector3(
      this.position.x + half,
      this.position.y + this.eyeHeight,
      this.position.z + half
    );

    const hit = this.world.collidesAABB(min, max);
    if (hit) {
      this.position[axis] = old;
      if (axis === 'y' && delta < 0) this.onGround = true;
      if (axis === 'y') this.velocity.y = 0;
    }
  }
}
