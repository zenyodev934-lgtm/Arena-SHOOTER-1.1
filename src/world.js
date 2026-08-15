import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Holds the map geometry and computes collision against loaded mesh triangles.
// Also provides a fallback test arena if no model is available.
export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];       // array of { mesh, box: THREE.Box3 }
    this.triangles = null;     // {position: Float32Array of static walkable triangles}
    this.mapLoaded = false;
    this.modelRoot = null;
    this.mapSize = 0;
  }

  async loadMap(url, onProgress) {
    // Try the user-provided model. If it fails, fall back to a test arena.
    try {
      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load(url, resolve, (e) => {
          if (onProgress && e.total) onProgress(e.loaded / e.total);
        }, reject);
      });

      const root = gltf.scene;
      root.updateMatrixWorld(true);
      this.modelRoot = root;
      this.scene.add(root);

      // Build colliders from every mesh (AABB collision for speed)
      const meshBoxes = [];
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        // Make sure shadows / frustum behavior is sensible
        obj.frustumCulled = true;
        const box = new THREE.Box3().setFromObject(obj);
        if (!box.isEmpty()) {
          meshBoxes.push({ mesh: obj, box });
        }
      });
      this.colliders = meshBoxes;

      // Build aggregate triangle buffer for raycasting against all geometry
      this.triangles = this._buildTriSoup(root);

      // Determine overall size
      const overall = new THREE.Box3().setFromObject(root);
      this.mapSize = Math.max(
        overall.max.x - overall.min.x,
        overall.max.z - overall.min.z,
        overall.max.y - overall.min.y
      );

      this.mapLoaded = true;

      // Auto-place lights if model has none: add hemisphere + sun
      this._ensureLights();
      return true;
    } catch (err) {
      console.warn('Map load failed, using fallback arena:', err);
      this._buildFallbackArena();
      return false;
    }
  }

  _ensureLights() {
    // Cheap check: any existing lights?
    let hasLight = false;
    this.scene.traverse((o) => { if (o.isLight) hasLight = true; });
    if (!hasLight) {
      const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x404040, 0.85);
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xfff1d0, 1.1);
      sun.position.set(30, 60, 20);
      this.scene.add(sun);
    }
  }

  _buildTriSoup(root) {
    // Merge all non-skinned mesh positions for raycasting against static level.
    const lists = [];
    let total = 0;
    const tmp = new THREE.Matrix4();
    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const geom = obj.geometry;
      if (!geom) return;
      let pos = geom.getAttribute('position');
      if (!pos) return;
      // If indexed, expand to non-indexed
      let arr;
      if (geom.index) {
        const idx = geom.index;
        arr = new Float32Array(idx.count * 3);
        for (let i = 0; i < idx.count; i++) {
          const vi = idx.getX(i);
          arr[i*3]   = pos.getX(vi);
          arr[i*3+1] = pos.getY(vi);
          arr[i*3+2] = pos.getZ(vi);
        }
      } else {
        arr = new Float32Array(pos.array.length);
        arr.set(pos.array);
      }
      // Transform positions into world space
      obj.updateWorldMatrix(true, false);
      tmp.copy(obj.matrixWorld);
      const v = new THREE.Vector3();
      for (let i = 0; i < arr.length; i += 3) {
        v.set(arr[i], arr[i+1], arr[i+2]).applyMatrix4(tmp);
        arr[i] = v.x; arr[i+1] = v.y; arr[i+2] = v.z;
      }
      lists.push(arr);
      total += arr.length;
    });
    const merged = new Float32Array(total);
    let off = 0;
    for (const a of lists) { merged.set(a, off); off += a.length; }
    return { position: merged };
  }

  _buildFallbackArena() {
    // CS-ish grey test arena: floor + crates + walls
    const geoFloor = new THREE.PlaneGeometry(80, 80);
    const matFloor = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.9 });
    const floor = new THREE.Mesh(geoFloor, matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b6b75, roughness: 0.8 });
    const walls = [
      [0, 2, -40, 80, 4, 1],
      [0, 2,  40, 80, 4, 1],
      [-40, 2, 0, 1, 4, 80],
      [40, 2, 0, 1, 4, 80],
    ];
    for (const [x,y,z,w,h,d] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), wallMat);
      m.position.set(x,y,z);
      this.scene.add(m);
      this.colliders.push({ mesh: m, box: new THREE.Box3().setFromObject(m) });
    }

    // Random cover boxes
    for (let i = 0; i < 18; i++) {
      const w = 1 + Math.random()*2;
      const h = 1 + Math.random()*2.5;
      const d = 1 + Math.random()*2;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w,h,d),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.08,0.1,0.3+Math.random()*0.2) })
      );
      m.position.set((Math.random()-0.5)*60, h/2, (Math.random()-0.5)*60);
      this.scene.add(m);
      this.colliders.push({ mesh: m, box: new THREE.Box3().setFromObject(m) });
    }

    this.triangles = this._buildTriSoup(this.scene);
    this.mapLoaded = true;
    this.mapSize = 80;
  }

  // AABB vs all collider boxes (broad phase)
  collidesAABB(min, max) {
    for (const c of this.colliders) {
      if (c.box.intersectsBox(new THREE.Box3(min, max))) return true;
    }
    return false;
  }

  // Raycast against level triangles. Returns {point, distance, mesh} or null.
  raycastLevel(origin, direction, maxDist = 200) {
    if (!this.triangles) return null;
    const pos = this.triangles.position;
    let bestT = maxDist;
    let bestHit = null;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = direction.x, dy = direction.y, dz = direction.z;

    for (let i = 0; i < pos.length; i += 9) {
      const t = this._rayTri(
        ox, oy, oz, dx, dy, dz,
        pos[i], pos[i+1], pos[i+2],
        pos[i+3], pos[i+4], pos[i+5],
        pos[i+6], pos[i+7], pos[i+8]
      );
      if (t !== null && t < bestT && t > 0) {
        bestT = t;
        bestHit = { point: new THREE.Vector3(ox + dx*t, oy + dy*t, oz + dz*t), distance: t };
      }
    }
    return bestHit;
  }

  // Möller–Trumbore
  _rayTri(ox,oy,oz, dx,dy,dz, ax,ay,az, bx,by,bz, cx,cy,cz) {
    const EPS = 1e-7;
    const ex1 = bx-ax, ey1 = by-ay, ez1 = bz-az;
    const ex2 = cx-ax, ey2 = cy-ay, ez2 = cz-az;
    const px = dy*ez2 - dz*ey2;
    const py = dz*ex2 - dx*ez2;
    const pz = dx*ey2 - dy*ex2;
    const det = ex1*px + ey1*py + ez1*pz;
    if (Math.abs(det) < EPS) return null;
    const inv = 1/det;
    const tx = ox-ax, ty = oy-ay, tz = oz-az;
    const u = (tx*px + ty*py + tz*pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = ty*ez1 - tz*ey1;
    const qy = tz*ex1 - tx*ez1;
    const qz = tx*ey1 - ty*ex1;
    const v = (dx*qx + dy*qy + dz*qz) * inv;
    if (v < 0 || u+v > 1) return null;
    const t = (ex2*qx + ey2*qy + ez2*qz) * inv;
    return t;
  }

  // Find a reasonable spawn point on/near origin, snapped to floor
  findSpawn(preferred = new THREE.Vector3(0, 5, 8)) {
    // Raycast downward near preferred point, walk outward if blocked
    for (let r = 0; r < 30; r++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = r * 1.5;
      const x = preferred.x + Math.cos(angle) * radius;
      const z = preferred.z + Math.sin(angle) * radius;
      const hit = this.raycastLevel(
        new THREE.Vector3(x, 200, z),
        new THREE.Vector3(0,-1,0),
        500
      );
      if (hit) {
        return new THREE.Vector3(x, hit.point.y, z);
      }
    }
    return preferred.clone();
  }
}
