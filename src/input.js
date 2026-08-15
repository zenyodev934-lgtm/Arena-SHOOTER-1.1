// Input manager — keyboard, mouse (pointer lock), and touch controls
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = {};
    this.mouse = { dx: 0, dy: 0, down: false };
    this.look = { x: 0, y: 0 };       // smoothed look delta
    this.move = { x: 0, y: 0 };       // -1..1 (strafe, forward)
    this.jumpPressed = false;
    this.shootPressed = false;
    this.reloadPressed = false;
    this.crouch = false;
    this.sprint = false;
    this.locked = false;

    this._bindKeyboard();
    this._bindMouse();
    this._bindTouch();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') this.jumpPressed = true;
      if (e.code === 'KeyR') this.reloadPressed = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  _bindMouse() {
    this.dom.addEventListener('click', () => {
      if (!this.locked) this.dom.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    this.dom.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.shootPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
  }

  _bindTouch() {
    // Left movement stick
    const stick = document.getElementById('stickLeft');
    const knob = stick.querySelector('.stick-knob');
    let stickId = null, cx = 0, cy = 0;
    const R = 50;
    const startStick = (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    };
    const moveStick = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.move.x = dx / R;
        this.move.y = -dy / R;
      }
    };
    const endStick = () => {
      stickId = null;
      knob.style.transform = 'translate(-50%,-50%)';
      this.move.x = 0; this.move.y = 0;
    };
    stick.addEventListener('touchstart', startStick, { passive: true });
    stick.addEventListener('touchmove', moveStick, { passive: true });
    stick.addEventListener('touchend', endStick);
    stick.addEventListener('touchcancel', endStick);

    // Right-side look area
    const look = document.getElementById('lookArea');
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('touchstart', (e) => {
      if (lookId !== null) return;
      const t = e.changedTouches[0];
      lookId = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: true });
    look.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        this.mouse.dx += (t.clientX - lx) * 1.6;
        this.mouse.dy += (t.clientY - ly) * 1.6;
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: true });
    const endLook = (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    };
    look.addEventListener('touchend', endLook);
    look.addEventListener('touchcancel', endLook);

    // Buttons
    document.getElementById('fireBtn').addEventListener('touchstart', (e) => {
      e.preventDefault(); this.mouse.down = true; this.shootPressed = true;
    }, { passive: false });
    document.getElementById('fireBtn').addEventListener('touchend', () => { this.mouse.down = false; });
    document.getElementById('reloadBtn').addEventListener('touchstart', (e) => {
      e.preventDefault(); this.reloadPressed = true;
    }, { passive: false });
    document.getElementById('jumpBtn').addEventListener('touchstart', (e) => {
      e.preventDefault(); this.jumpPressed = true;
    }, { passive: false });
  }

  // Called each frame — returns movement/look state, then resets per-frame flags
  sample(dt) {
    // Keyboard movement
    if (this.keys['KeyW']) this.move.y = 1;
    else if (this.keys['KeyS']) this.move.y = -1;
    else if (this.move.y !== 0 && !('ontouchstart' in window)) this.move.y = 0;

    if (this.keys['KeyD']) this.move.x = 1;
    else if (this.keys['KeyA']) this.move.x = -1;
    else if (this.move.x !== 0 && !('ontouchstart' in window)) this.move.x = 0;

    // Touch stick already sets move.x / move.y
    if (!('ontouchstart' in window)) {
      let mx = 0, my = 0;
      if (this.keys['KeyW']) my += 1;
      if (this.keys['KeyS']) my -= 1;
      if (this.keys['KeyD']) mx += 1;
      if (this.keys['KeyA']) mx -= 1;
      this.move.x = mx;
      this.move.y = my;
    }

    this.sprint = !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'];
    this.crouch = !!this.keys['ControlLeft'] || !!this.keys['ControlRight'];

    // Smooth look
    const sens = 0.0022;
    this.look.x = this.mouse.dx * sens;
    this.look.y = this.mouse.dy * sens;
    this.mouse.dx = 0; this.mouse.dy = 0;

    return {
      move: this.move,
      look: this.look,
      sprint: this.sprint,
      crouch: this.crouch,
      jump: this.jumpPressed,
      shoot: this.mouse.down,
      shootPressed: this.shootPressed,
      reload: this.reloadPressed,
    };
  }

  endFrame() {
    this.jumpPressed = false;
    this.shootPressed = false;
    this.reloadPressed = false;
  }
}
