import * as THREE from 'three';

/**
 * Item models shared by the ground drop and the first-person hands. Real-world size in meters
 * (scene units); callers scale for the drop. Built in code, no files.
 */

/** A machete: rubber grip from y = -0.13 to 0, a slightly curved steel blade up to y = 0.47. */
export function macheteModel(): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: '#9aa0a3', metalness: 0.85, roughness: 0.32 });
  const edge = new THREE.MeshStandardMaterial({ color: '#cfd4d6', metalness: 0.9, roughness: 0.18 });
  const grip = new THREE.MeshStandardMaterial({ color: '#1f1c19', roughness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: '#8a6b3a', metalness: 0.7, roughness: 0.4 });

  // Blade outline: a straight spine on one side, a curved edge widening toward a clipped tip.
  const s = new THREE.Shape();
  s.moveTo(-0.018, 0);
  s.lineTo(-0.02, 0.38);
  s.quadraticCurveTo(-0.02, 0.47, 0.012, 0.47);
  s.quadraticCurveTo(0.05, 0.44, 0.048, 0.36);
  s.quadraticCurveTo(0.045, 0.14, 0.022, 0);
  s.closePath();
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.002, bevelSegments: 1, curveSegments: 10 }), steel);
  blade.position.z = -0.002;
  g.add(blade);
  // A bright honed strip along the cutting edge.
  const e = new THREE.Shape();
  e.moveTo(0.038, 0.08);
  e.quadraticCurveTo(0.046, 0.2, 0.048, 0.36);
  e.lineTo(0.043, 0.36);
  e.quadraticCurveTo(0.041, 0.2, 0.033, 0.08);
  e.closePath();
  const honed = new THREE.Mesh(new THREE.ShapeGeometry(e), edge);
  honed.position.z = 0.0042;
  g.add(honed);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.018), brass);
  g.add(guard);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.13, 12), grip);
  handle.position.y = -0.068;
  handle.scale.z = 0.75;
  g.add(handle);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 8), brass);
  pommel.position.y = -0.135;
  pommel.scale.set(1, 0.6, 0.8);
  g.add(pommel);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/**
 * A firecracker: a kraft-paper tube (never red: red means danger) with two dark bands, a clay cap and
 * a short twisted fuse. Centered on the origin, 0.1 long and 2.6 cm thick; the fuse tip is `FUSE_TIP`.
 */
export const FUSE_TIP = new THREE.Vector3(0.008, 0.082, 0);

export function firecrackerModel(): THREE.Group {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: '#b8925e', roughness: 0.8 });
  const band = new THREE.MeshStandardMaterial({ color: '#2b2a26', roughness: 0.7 });
  const clay = new THREE.MeshStandardMaterial({ color: '#8a7f70', roughness: 0.95 });
  const fuse = new THREE.MeshStandardMaterial({ color: '#d9d2c2', roughness: 0.9 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.1, 14), paper);
  g.add(tube);
  for (const y of [-0.027, 0.024]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0134, 0.0134, 0.01, 14), band);
    b.position.y = y;
    g.add(b);
  }
  for (const y of [-0.051, 0.051]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.0125, 0.003, 14), clay);
    cap.position.y = y;
    g.add(cap);
  }
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.051, 0), new THREE.Vector3(-0.003, 0.07, 0.003), FUSE_TIP);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.0022, 5), fuse));
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/**
 * A smoke bomb: a squat olive-drab can with a grey cap, a spoon lever down its side and a ring pin.
 * Centered on the origin, 0.1 tall, 6 cm across.
 */
export function smokeBombModel(): THREE.Group {
  const g = new THREE.Group();
  const can = new THREE.MeshStandardMaterial({ color: '#4c5233', roughness: 0.6, metalness: 0.3 });
  const cap = new THREE.MeshStandardMaterial({ color: '#8d9088', roughness: 0.4, metalness: 0.7 });
  const label = new THREE.MeshStandardMaterial({ color: '#d8d2bd', roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.085, 18), can);
  body.position.y = -0.008;
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0304, 0.0304, 0.016, 18), label);
  band.position.y = -0.005;
  g.add(band);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.016, 18), cap);
  top.position.y = 0.042;
  g.add(top);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.004), cap);
  lever.position.set(0.032, 0.008, 0);
  lever.rotation.z = -0.08;
  g.add(lever);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0018, 6, 18), cap);
  ring.position.set(-0.018, 0.054, 0);
  ring.rotation.y = Math.PI / 2;
  g.add(ring);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/**
 * An energy drink: a slim aluminium can, teal with a lime band (never red: red means danger), and a
 * ring pull. Centered on the origin, 0.13 tall, 5.3 cm across.
 */
export function energyDrinkModel(): THREE.Group {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d');
  if (x) {
    x.fillStyle = '#156b74';
    x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#b8e04a';
    x.fillRect(0, 24, 128, 14);
    // A bolt, twice around the can.
    x.fillStyle = '#f2f5ea';
    for (const ox of [20, 84]) {
      x.beginPath();
      x.moveTo(ox + 10, 6);
      x.lineTo(ox, 33);
      x.lineTo(ox + 9, 33);
      x.lineTo(ox + 4, 58);
      x.lineTo(ox + 18, 26);
      x.lineTo(ox + 9, 26);
      x.closePath();
      x.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0265, 0.0265, 0.115, 24, 1, true), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.3 }));
  g.add(body);
  const alu = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.9, roughness: 0.25 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.0265, 0.01, 24), alu);
  top.position.y = 0.062;
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.0265, 0.022, 0.01, 24), alu);
  bottom.position.y = -0.062;
  const tab = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0015, 4, 12), alu);
  tab.rotation.x = Math.PI / 2;
  tab.position.set(0.006, 0.068, 0);
  g.add(top, bottom, tab);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/**
 * The mongoose's carrying cage: a small slatted wooden crate with a wire front door and the animal
 * curled up inside. About 0.28 long. `door` is the front (hinged at its bottom edge) for the release.
 */
export function mongooseCageModel(curled: THREE.Object3D): { group: THREE.Group; door: THREE.Group } {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.85 });
  const wire = new THREE.MeshStandardMaterial({ color: '#5c5a55', metalness: 0.7, roughness: 0.4 });
  const w = 0.2;
  const h = 0.16;
  const d = 0.28;
  const slab = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wood);
    m.position.set(x, y, z);
    g.add(m);
  };
  slab(w, 0.012, d, 0, -h / 2, 0);
  // Slatted top and sides (boards with gaps), so you can see the animal inside.
  for (let k = 0; k < 4; k++) slab(w * 0.17, 0.01, d, -w / 2 + w * (0.125 + k * 0.25), h / 2, 0);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) slab(0.01, h * 0.22, d, (s * w) / 2, -h / 2 + h * (0.17 + k * 0.33), 0);
  }
  slab(w, h, 0.012, 0, 0, -d / 2);
  g.add(curled);
  const door = new THREE.Group();
  door.position.set(0, -h / 2, d / 2);
  for (let k = 0; k < 6; k++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, h, 4), wire);
    bar.position.set(-w / 2 + (w * (k + 0.5)) / 6, h / 2, 0);
    door.add(bar);
  }
  g.add(door);
  // A rope handle on top.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.004, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#9c8460', roughness: 0.9 }));
  handle.rotation.y = Math.PI / 2;
  handle.position.y = h / 2 + 0.005;
  g.add(handle);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { group: g, door };
}

/**
 * A pair of ice cleats: black rubber harnesses with steel studs and a strap, one lying on the other.
 * About 0.24 long.
 */
export function iceCleatsModel(): THREE.Group {
  const g = new THREE.Group();
  const rubber = new THREE.MeshStandardMaterial({ color: '#232527', roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c3c8cc', metalness: 0.9, roughness: 0.25 });
  const strap = new THREE.MeshStandardMaterial({ color: '#3d6f8a', roughness: 0.8 });
  const one = () => {
    const c = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 24), rubber);
    frame.rotation.x = Math.PI / 2;
    frame.scale.set(0.55, 1.2, 1);
    c.add(frame);
    for (const z of [-0.07, 0, 0.07]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.012), rubber);
      bar.position.z = z;
      c.add(bar);
      for (const x of [-0.035, 0.035]) {
        const stud = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.018, 6), steel);
        stud.rotation.x = Math.PI;
        stud.position.set(x, -0.012, z);
        c.add(stud);
      }
    }
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.008, 0.025), strap);
    band.position.set(0, 0.012, -0.02);
    c.add(band);
    return c;
  };
  const a = one();
  const b = one();
  b.position.set(0.03, 0.025, 0.02);
  b.rotation.y = 0.35;
  g.add(a, b);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** A flashlight battery: a fat cell with a dark wrapper, a gold band and a brass terminal. About 6 cm long. */
export function batteryModel(): THREE.Group {
  const g = new THREE.Group();
  const wrap = new THREE.MeshStandardMaterial({ color: '#24282c', roughness: 0.45, metalness: 0.2 });
  const band = new THREE.MeshStandardMaterial({ color: '#d6a73e', roughness: 0.35, metalness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: '#c3c7cb', roughness: 0.3, metalness: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.06, 18), wrap);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0173, 0.0173, 0.016, 18), band);
  ring.position.y = 0.017;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.005, 12), metal);
  cap.position.y = 0.0325;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.002, 18), metal);
  base.position.y = -0.031;
  g.add(body, ring, cap, base);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

/** A small soft spark (the burning fuse): an additive sprite texture, white core to amber. */
export function sparkTexture(): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,250,235,1)');
    grad.addColorStop(0.25, 'rgba(255,200,110,0.8)');
    grad.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A swim ring: a striped buoy (teal and white, never red: red means danger) with a rope around it. Radius ~0.33. */
export function swimRingModel(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.TorusGeometry(0.3, 0.1, 14, 40);
  // Eight stripes around the ring, alternating colours, as vertex colours.
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const teal = new THREE.Color('#1f8a8f');
  const white = new THREE.Color('#ecefe9');
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i)) + Math.PI;
    const c = Math.floor((a / (Math.PI * 2)) * 8) % 2 ? teal : white;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const ring = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 }));
  g.add(ring);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 6, 48), new THREE.MeshStandardMaterial({ color: '#cbb994', roughness: 0.9 }));
  g.add(rope);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}
