import * as THREE from 'three';
import { snakeSkin } from './skin';

/** Head shape in head space: +z is the snout, y is up, origin on the ground at the head's cell center. */
const BACK_Z = -1.35;
const SNOUT_Z = 0.95;
const JAW_Y = 0.62;
const JAW_PIVOT_Z = -0.85;
/** Fully open jaw angle on the death camera, in radians. */
const JAW_OPEN = 0.6;
/** Head model scale: the shape above is sculpted at 1x. Snout reaches 0.95 * z = 0.998. */
const HEAD_SCALE = { x: 1.08, y: 1.4, z: 1.05 };
/** World size of one scale-relief tile on the head: small scales, the same in both directions. */
const HEAD_UV_SIZE = 0.7;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

let glowTex: THREE.CanvasTexture | null = null;

/** A soft round glow (made in code), shared by every glowing eye. */
function glowDot(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** 0 at the back of the head, 1 at the snout. */
const frac = (z: number): number => (z - BACK_Z) / (SNOUT_Z - BACK_Z);
/** Half width of the head: wide at the jaw hinge, narrow at the snout. */
const halfWidth = (f: number): number => lerp(0.9, 0.36, Math.pow(f, 1.2));
const skullHeight = (f: number): number => lerp(0.82, 0.36, f);
const jawDepth = (f: number): number => lerp(0.55, 0.28, f);

/** Map a unit hemisphere (y >= 0 or y <= 0) onto the head shape. UVs are projected from above. */
function sculpt(geo: THREE.BufferGeometry, upper: boolean): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const hz = lerp(BACK_Z, SNOUT_Z, (z + 1) / 2);
    const f = frac(hz);
    const w = halfWidth(f) * (upper ? 1 : 0.93);
    const h = upper ? skullHeight(f) : jawDepth(f);
    // A slightly flat top and a squarer cross-section read as a viper-like head.
    const sx = Math.sign(x) * Math.pow(Math.abs(x), 0.85);
    pos.setXYZ(i, sx * w, JAW_Y + y * h, hz);
    uv.setXY(i, hz / HEAD_UV_SIZE, (sx * w) / HEAD_UV_SIZE);
  }
  geo.computeVertexNormals();
  return geo;
}

export class SnakeHead {
  readonly group = new THREE.Group();
  private readonly jawPivot = new THREE.Group();
  private readonly tongue = new THREE.Group();
  private readonly fangs: THREE.Mesh[] = [];

  constructor() {
    // Yaw first, then pitch in the head's own frame (the death camera tips the snout up).
    this.group.rotation.order = 'YXZ';
    // Sized to match the tall body: wider and much taller, a little longer. Still inside the head's
    // collision box (half width 0.98, 2.3 tall).
    this.group.scale.set(HEAD_SCALE.x, HEAD_SCALE.y, HEAD_SCALE.z);
    // Real snake heads are plainer than their bodies: a dark olive top and pale lips and jaw,
    // with fine scale relief from the body's normal map.
    const normalMap = snakeSkin().normalMap;
    const headMat = new THREE.MeshStandardMaterial({ color: '#4f4a30', normalMap, roughness: 0.42, metalness: 0 });
    const jawMat = new THREE.MeshStandardMaterial({ color: '#958a68', normalMap, roughness: 0.5, metalness: 0 });
    // A real snake's mouth is pale inside; the roof a little darker. Red stays reserved for danger and blood.
    const mouthMat = new THREE.MeshStandardMaterial({ color: '#a88a82', roughness: 0.55, side: THREE.DoubleSide });
    const roofMat = new THREE.MeshStandardMaterial({ color: '#5e4642', roughness: 0.6, side: THREE.DoubleSide });

    const skull = new THREE.Mesh(sculpt(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), true), headMat);
    this.group.add(skull);

    // Lower jaw hinges near the back of the head.
    const jaw = new THREE.Mesh(sculpt(new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), false), jawMat);
    jaw.position.set(0, -JAW_Y, -JAW_PIVOT_Z);
    this.jawPivot.position.set(0, JAW_Y, JAW_PIVOT_Z);
    this.jawPivot.add(jaw);
    this.group.add(this.jawPivot);

    // Mouth lining: the roof under the skull and the floor on top of the jaw, seen when it opens.
    // The jaw rim is the hemisphere's equator mapped through sculpt(): its half width at f is
    // halfWidth(f) * sqrt(1 - zu^2)^0.85 (zu = 2f - 1). Stay just inside it.
    const rim = (f: number): number => halfWidth(f) * Math.pow(Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)), 0.85) * 0.9;
    const outline = new THREE.Shape();
    const steps = 20;
    for (let k = 0; k <= steps; k++) {
      const f = 0.04 + (k / steps) * 0.92;
      // Shape space is (x, y); it is laid flat below with y = -z.
      if (k === 0) outline.moveTo(rim(f), -lerp(BACK_Z, SNOUT_Z, f));
      else outline.lineTo(rim(f), -lerp(BACK_Z, SNOUT_Z, f));
    }
    for (let k = steps; k >= 0; k--) {
      const f = 0.04 + (k / steps) * 0.92;
      outline.lineTo(-rim(f), -lerp(BACK_Z, SNOUT_Z, f));
    }
    const liningGeo = new THREE.ShapeGeometry(outline);
    const lining = (y: number, mat: THREE.Material): THREE.Mesh => {
      const m = new THREE.Mesh(liningGeo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      return m;
    };
    this.group.add(lining(JAW_Y + 0.005, roofMat));
    const floor = lining(JAW_Y - 0.005, mouthMat);
    floor.position.y -= JAW_Y;
    floor.position.z -= JAW_PIVOT_Z;
    this.jawPivot.add(floor);

    // Fangs: folded away while the mouth is shut, they show when the jaw drops.
    const fangMat = new THREE.MeshStandardMaterial({ color: '#efe9dc', roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.32, 8), fangMat);
      fang.rotation.x = Math.PI;
      fang.position.set(sx * 0.2, JAW_Y - 0.12, SNOUT_Z - 0.32);
      fang.visible = false;
      this.fangs.push(fang);
      this.group.add(fang);
    }

    // Eyes: glossy amber with a vertical slit pupil, set on the sides near the front.
    // Dark with a little gloss. Bright, mirror-like eyes read as cartoonish.
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#3a2a0b', roughness: 0.45, metalness: 0, envMapIntensity: 0.4 });
    this.eyeMat = eyeMat;
    const pupilMat = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.2 });
    const nostrilMat = new THREE.MeshStandardMaterial({ color: '#1f1c12', roughness: 0.8 });
    const ez = lerp(BACK_Z, SNOUT_Z, 0.66);
    const ef = frac(ez);
    for (const sx of [-1, 1]) {
      // Set into the head so only a dome shows under the brow.
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.088, 20, 14), eyeMat);
      eye.position.set(sx * halfWidth(ef) * 0.86, JAW_Y + skullHeight(ef) * 0.42, ez);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), pupilMat);
      pupil.scale.set(0.012, 0.075, 0.024);
      pupil.position.set(sx * 0.092, 0, 0.012);
      eye.add(pupil);
      this.group.add(eye);
      this.eyes.push(eye);
      // Nostrils: small, dark and right at the tip of the snout.
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), nostrilMat);
      nostril.position.set(sx * 0.09, JAW_Y + skullHeight(0.97) * 0.45, SNOUT_Z - 0.04);
      this.group.add(nostril);
    }

    // Forked tongue: a stem and two tips, dark so red stays reserved for danger and blood.
    const tongueMat = new THREE.MeshStandardMaterial({ color: '#2b1517', roughness: 0.5 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.5, 6), tongueMat);
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 0.25;
    this.tongue.add(stem);
    for (const sx of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.022, 0.26, 5), tongueMat);
      tip.rotation.set(Math.PI / 2, 0, 0);
      tip.rotation.y = sx * 0.35;
      tip.position.set(sx * 0.045, 0, 0.6);
      this.tongue.add(tip);
    }
    this.tongue.position.set(0, JAW_Y - 0.02, SNOUT_Z - 0.2);
    this.group.add(this.tongue);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  private eyeMat: THREE.MeshStandardMaterial | null = null;
  private readonly eyes: THREE.Mesh[] = [];
  private eyeGlows: THREE.Sprite[] = [];

  /**
   * Eyes that glow in the dark (Dark cave): a sickly green, `k` 0..1 (0 = plain dark eyes). Each eye
   * also gets a soft halo, so the pair reads from across the cave when nothing else can be seen.
   */
  setEyeGlow(k: number): void {
    if (!this.eyeMat) return;
    this.eyeMat.emissive.setRGB(0.45 * k, 1.0 * k, 0.25 * k);
    this.eyeMat.emissiveIntensity = 2.2;
    if (k > 0 && !this.eyeGlows.length) {
      const mat = new THREE.SpriteMaterial({ map: glowDot(), color: '#9cff7a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      this.eyeGlows = this.eyes.map((eye) => {
        const s = new THREE.Sprite(mat);
        s.scale.setScalar(3.5);
        eye.add(s);
        return s;
      });
    }
    for (const s of this.eyeGlows) {
      s.visible = k > 0;
      s.material.opacity = 0.75 * k;
    }
  }

  /** 0 closed, 1 fully open. */
  setJaw(k: number): void {
    this.jawPivot.rotation.x = JAW_OPEN * Math.min(1, Math.max(0, k));
    for (const f of this.fangs) f.visible = k > 0.25;
  }

  /** Flick the tongue in and out; `now` in milliseconds, or null to keep it in. */
  flick(now: number | null): void {
    if (now === null) {
      this.tongue.visible = false;
      return;
    }
    const out = Math.max(0, Math.sin(now * 0.012));
    this.tongue.scale.set(1, 1, 0.05 + out);
    this.tongue.visible = out > 0.02;
  }
}
