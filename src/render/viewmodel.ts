import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HeldItem, ItemId } from '../sim/types';
import { macheteModel, swimRingModel } from './itemModels';

/**
 * First-person arms and hands holding the selected item, drawn in their own pass on top of the
 * world (so they never clip into rocks or the snake). Render only: it reads the held item and is
 * told when an item is used; it holds no game rules.
 *
 * Space: the viewmodel camera sits at the origin looking down -z; x is right, y is up.
 */

/** Dark leather gloves and a field jacket: reads as real hands far better than modelled skin. */
const GLOVE = '#3a2e25';
const SLEEVE = '#39423a';
const CUFF = '#2b322c';
/** Seconds to raise the hands when an item is selected, and to lower them when it is gone. */
const RAISE = 0.22;
/** Lowered: this far below the rest pose. */
const LOWERED_Y = -0.55;

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** A tapered round segment (a cylinder whose ends differ) that can be stretched between two points. */
class Segment {
  readonly mesh: THREE.Mesh;
  private readonly dir = new THREE.Vector3();

  constructor(rStart: number, rEnd: number, mat: THREE.Material, radial = 16) {
    // Unit length along +y; the +y end is `rEnd`. Scaled to the distance between its ends in set().
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(rEnd, rStart, 1, radial, 1), mat);
  }

  set(a: THREE.Vector3, b: THREE.Vector3): void {
    this.dir.subVectors(b, a);
    const len = this.dir.length();
    this.mesh.position.copy(a).addScaledVector(this.dir, 0.5);
    this.mesh.quaternion.setFromUnitVectors(UP, this.dir.normalize());
    this.mesh.scale.set(1, Math.max(0.001, len), 1);
  }
}

const UP = v3(0, 1, 0);

/** A box rounded toward a sphere (blend 0 = box, 1 = sphere), welded so it shades smoothly. */
function roundedBox(blend: number): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(2, 2, 2, 4, 3, 4);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const g = mergeVertices(box);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const sph = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    sph.copy(v).normalize().multiplyScalar(Math.SQRT2);
    v.lerp(sph, blend).multiplyScalar(0.5);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Segment lengths of each finger (index to little) and how far each joint bends in a fist. */
const FINGERS = [
  { x: 0.027, len: [0.03, 0.021, 0.017], r: 0.0098 },
  { x: 0.009, len: [0.033, 0.023, 0.018], r: 0.01 },
  { x: -0.009, len: [0.031, 0.022, 0.017], r: 0.0096 },
  { x: -0.026, len: [0.025, 0.017, 0.015], r: 0.0088 },
];
const FIST_BEND = [1.15, 1.5, 1.05];

/**
 * A gloved hand: a rounded palm, four fingers of three bending joints each, a two-joint thumb.
 * Local space: the wrist is at +z, fingers point along -z, the back of the hand faces +y.
 */
class Hand {
  readonly group = new THREE.Group();
  /** joints[f][k]: the k-th joint of finger f. */
  private readonly joints: THREE.Group[][] = [];
  private readonly thumbJoints: THREE.Group[] = [];

  constructor(side: 1 | -1, mat: THREE.Material) {
    const palm = new THREE.Mesh(roundedBox(0.55), mat);
    palm.scale.set(0.082, 0.03, 0.092);
    this.group.add(palm);
    for (const f of FINGERS) {
      const chain: THREE.Group[] = [];
      let parent: THREE.Object3D = this.group;
      let z = -0.042;
      f.len.forEach((len, k) => {
        const joint = new THREE.Group();
        joint.position.set(k === 0 ? f.x * side : 0, k === 0 ? 0.002 : 0, z);
        const r = f.r * (1 - k * 0.1);
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - r), 4, 10), mat);
        seg.rotation.x = Math.PI / 2;
        seg.position.z = -len / 2;
        joint.add(seg);
        parent.add(joint);
        chain.push(joint);
        parent = joint;
        z = -len;
      });
      this.joints.push(chain);
    }
    // Thumb: from the side of the palm near the wrist, angled forward and across the palm.
    let parent: THREE.Object3D = this.group;
    [0.03, 0.026].forEach((len, k) => {
      const joint = new THREE.Group();
      if (k === 0) {
        joint.position.set(0.035 * side, -0.006, -0.008);
        joint.rotation.set(0.25, -0.75 * side, 0);
      } else {
        joint.position.z = -0.03;
      }
      const r = 0.0112 - k * 0.0012;
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - r, 4, 10), mat);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -len / 2;
      joint.add(seg);
      parent.add(joint);
      this.thumbJoints.push(joint);
      parent = joint;
    });
    this.setCurl(1);
  }

  /** 0 = open, 1 = fist. Each joint bends toward the palm (-y). `thumb` curls the thumb in. */
  setCurl(curl: number, thumb = curl): void {
    for (const chain of this.joints) chain.forEach((j, k) => (j.rotation.x = -FIST_BEND[k] * curl));
    this.thumbJoints[1].rotation.x = -0.6 * thumb;
  }
}

/** Where, in hand space, the held thing sits: the middle of a closed fist, and the thumb-index pinch. */
const FIST_HOLD = v3(0, -0.03, -0.058);
const PINCH = (side: 1 | -1) => v3(0.02 * side, -0.022, -0.072);

/** An arm: a sleeved, tapered forearm from off-screen to the wrist, and a gloved hand. */
class Arm {
  readonly hand: Hand;
  private readonly forearm: Segment;
  private readonly sleeve: Segment;
  private readonly cuff: Segment;

  constructor(
    readonly side: 1 | -1,
    group: THREE.Group,
    glove: THREE.Material,
    sleeve: THREE.Material,
    cuff: THREE.Material,
  ) {
    this.forearm = new Segment(0.04, 0.027, glove);
    this.sleeve = new Segment(0.058, 0.05, sleeve);
    this.cuff = new Segment(0.054, 0.054, cuff);
    this.hand = new Hand(side, glove);
    group.add(this.forearm.mesh, this.sleeve.mesh, this.cuff.mesh, this.hand.group);
  }

  /**
   * Put the hand so that its `hold` point (hand space) lands on `target`. The hand continues the
   * forearm's line from `elbow` (no broken wrist); `back` says roughly which way the back of the hand faces.
   */
  holdAt(elbow: THREE.Vector3, target: THREE.Vector3, back: THREE.Vector3, hold: THREE.Vector3): void {
    const zAxis = elbow.clone().sub(target).normalize();
    const yAxis = back.clone().sub(zAxis.clone().multiplyScalar(back.dot(zAxis))).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    const palm = target.clone().sub(hold.clone().applyQuaternion(q));
    const wrist = palm.clone().add(v3(0, 0, 0.044).applyQuaternion(q));
    this.hand.group.quaternion.copy(q);
    this.hand.group.position.copy(palm);
    this.forearm.set(elbow, wrist);
    // The sleeve covers most of the forearm; a cuff band finishes it.
    const sleeveEnd = elbow.clone().lerp(wrist, 0.7);
    this.sleeve.set(elbow, sleeveEnd);
    const dir = wrist.clone().sub(elbow).normalize();
    this.cuff.set(sleeveEnd.clone().addScaledVector(dir, -0.012), sleeveEnd.clone().addScaledVector(dir, 0.012));
  }

  /** Hold something in a closed fist (a handle). */
  grip(elbow: THREE.Vector3, target: THREE.Vector3, back: THREE.Vector3): void {
    this.holdAt(elbow, target, back, FIST_HOLD);
  }

  /** Hold something between thumb and index finger (a pouch). */
  pinch(elbow: THREE.Vector3, target: THREE.Vector3, back: THREE.Vector3): void {
    this.holdAt(elbow, target, back, PINCH(this.side));
  }
}

/** A slingshot sized for the hands: a forked frame with a band to a pouch the right hand holds. */
class SlingshotHeld {
  readonly group = new THREE.Group();
  /** Fork tips and the pouch, in the frame's local space. */
  readonly tipL = v3(-0.05, 0.1, 0);
  readonly tipR = v3(0.05, 0.1, 0);
  private readonly bands: THREE.Mesh[] = [];
  private readonly pouch: THREE.Mesh;

  constructor() {
    const wood = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.75 });
    const rubber = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6 });
    const stick = (r0: number, r1: number, a: THREE.Vector3, b: THREE.Vector3) => {
      const seg = new Segment(r0, r1, wood, 10);
      seg.set(a, b);
      this.group.add(seg.mesh);
    };
    stick(0.0125, 0.012, v3(0, -0.12, 0), v3(0, 0.025, 0));
    stick(0.012, 0.009, v3(0, 0.015, 0), this.tipL);
    stick(0.012, 0.009, v3(0, 0.015, 0), this.tipR);
    for (let i = 0; i < 2; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 1, 6), rubber);
      this.bands.push(band);
      this.group.add(band);
    }
    this.pouch = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), rubber);
    this.pouch.scale.set(1.4, 0.8, 0.8);
    this.group.add(this.pouch);
  }

  /** Stretch the band from the tips to the pouch (pouch in the frame's local space). */
  setPouch(p: THREE.Vector3): void {
    this.pouch.position.copy(p);
    [this.tipL, this.tipR].forEach((tip, i) => {
      const band = this.bands[i];
      const d = p.clone().sub(tip);
      band.position.copy(tip).addScaledVector(d, 0.5);
      band.quaternion.setFromUnitVectors(v3(0, 1, 0), d.clone().normalize());
      band.scale.set(1, d.length(), 1);
    });
  }
}

/** Per-item poses and use motions. Each returns where the hands go for a moment in the motion. */
interface ItemRig {
  readonly group: THREE.Group;
  /** Seconds the use motion takes. */
  readonly useTime: number;
  /** `t` = seconds since the last use (Infinity when idle). */
  update(t: number, left: Arm, right: Arm): void;
}

/** How far toward the fork the right hand reaches when reloading (0 = stays, 1 = all the way). */
const REACH = 0.45;

class SlingshotRig implements ItemRig {
  readonly group = new THREE.Group();
  readonly useTime = 0.5;
  private readonly sling = new SlingshotHeld();
  // Rest pose: left fist holds the frame out front, low left; right hand holds the pouch drawn back.
  private readonly framePos = v3(-0.07, -0.1, -0.56);
  private readonly frameTilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.1, 0.12));
  /** Where the pouch (and the pinching right hand) sits with the band drawn: low right, close. */
  private readonly drawn = v3(0.07, -0.15, -0.33);

  constructor() {
    this.group.add(this.sling.group);
  }

  /** Frame-local point to rig space (the space the arms are posed in). */
  private toRig(p: THREE.Vector3, kick: number): THREE.Vector3 {
    return p.clone().applyQuaternion(this.frameTilt).add(this.framePos).add(v3(0, 0, -kick * 0.015));
  }

  private toFrame(p: THREE.Vector3, kick: number): THREE.Vector3 {
    return p.clone().sub(this.framePos).sub(v3(0, 0, -kick * 0.015)).applyQuaternion(this.frameTilt.clone().invert());
  }

  update(t: number, left: Arm, right: Arm): void {
    // Release (0 to 0.06 s): the pouch snaps to the fork and the right hand opens.
    // Reload: the right hand reaches the pouch at the fork (0.12 to 0.3 s) and draws it back (to 0.5 s).
    let kick = 0;
    let open = 0;
    const atFork = this.toRig(v3(0, 0.085, 0.012), 0);
    let hand: THREE.Vector3;
    let pouch: THREE.Vector3;
    if (t < 0.06) {
      const k = easeOut(t / 0.06);
      kick = k;
      open = k;
      hand = this.drawn.clone();
      pouch = this.drawn.clone().lerp(atFork, k);
    } else if (t < 0.12) {
      kick = 1 - (t - 0.06) / 0.06;
      open = 1;
      hand = this.drawn.clone();
      pouch = atFork.clone();
    } else if (t < 0.3) {
      // The hand reaches only partway (all the way would swing the forearm across the view);
      // the pouch is then pulled from the fork into it.
      const k = easeOut((t - 0.12) / 0.18);
      open = 1 - k;
      hand = this.drawn.clone().lerp(atFork, k * REACH);
      pouch = atFork.clone();
    } else if (t < this.useTime) {
      const k = easeOut((t - 0.3) / (this.useTime - 0.3));
      hand = this.drawn.clone().lerp(atFork, REACH).lerp(this.drawn, k);
      pouch = atFork.clone().lerp(hand, Math.min(1, k * 3));
    } else {
      hand = this.drawn.clone();
      pouch = hand.clone();
    }
    const s = this.sling.group;
    s.position.copy(this.framePos).add(v3(0, 0, -kick * 0.015));
    s.quaternion.copy(this.frameTilt);
    this.sling.setPouch(this.toFrame(pouch, kick));

    // Left fist around the handle: forearm reaching forward from the bottom left, back of the hand left.
    left.grip(v3(-0.2, -0.5, -0.2), this.toRig(v3(0, -0.06, 0), kick), v3(-1, 0.15, 0.35));
    left.hand.setCurl(1);
    // Right hand pinching the pouch: forearm from the bottom right, back of the hand up and out.
    right.pinch(v3(0.4, -0.56, -0.1), hand, v3(0.5, 1, 0.3));
    right.hand.setCurl(0.62 - open * 0.45, 0.5 - open * 0.4);
  }
}

/** A pose of the held machete in rig space: where its grip sits and how it is turned. */
interface BladePose {
  p: THREE.Vector3;
  r: THREE.Euler;
}

const lerpPose = (a: BladePose, b: BladePose, k: number): { p: THREE.Vector3; q: THREE.Quaternion } => ({
  p: a.p.clone().lerp(b.p, k),
  q: new THREE.Quaternion().setFromEuler(a.r).slerp(new THREE.Quaternion().setFromEuler(b.r), k),
});

/**
 * Machete in the right hand, blade up and forward at the lower right. A swing winds up, cuts fast
 * on the diagonal down to the lower left, and recovers. The left hand drops out of view.
 */
class MacheteRig implements ItemRig {
  readonly group = new THREE.Group();
  readonly useTime = 0.5;
  private readonly blade = macheteModel();
  private readonly rest: BladePose = { p: v3(0.16, -0.14, -0.46), r: new THREE.Euler(-0.5, 0.3, -0.42) };
  private readonly windup: BladePose = { p: v3(0.24, -0.1, -0.4), r: new THREE.Euler(0.45, 0.5, -0.95) };
  private readonly strike: BladePose = { p: v3(-0.06, -0.26, -0.56), r: new THREE.Euler(-1.35, -0.25, 0.95) };

  constructor() {
    this.group.add(this.blade);
  }

  update(t: number, left: Arm, right: Arm): void {
    let pose: { p: THREE.Vector3; q: THREE.Quaternion };
    if (t < 0.1) pose = lerpPose(this.rest, this.windup, easeOut(t / 0.1));
    else if (t < 0.2) pose = lerpPose(this.windup, this.strike, ((t - 0.1) / 0.1) ** 1.5);
    else if (t < this.useTime) pose = lerpPose(this.strike, this.rest, easeOut((t - 0.2) / (this.useTime - 0.2)));
    else pose = lerpPose(this.rest, this.rest, 0);
    this.blade.position.copy(pose.p);
    this.blade.quaternion.copy(pose.q);
    // The fist wraps the grip a little below the guard.
    const grip = v3(0, -0.06, 0).applyQuaternion(pose.q).add(pose.p);
    right.grip(v3(0.36, -0.62, -0.18).add(pose.p.clone().multiplyScalar(0.3)), grip, v3(0.7, 0.6, 0.4));
    right.hand.setCurl(1);
    left.grip(v3(-0.3, -1.1, -0.2), v3(-0.25, -0.85, -0.45), v3(-1, 0, 0.3));
    left.hand.setCurl(0.4);
  }
}

/**
 * The swim ring held in both hands in front of you. It works on its own (no use motion); in deep
 * water it sits lower and bobs with the swim.
 */
class SwimRingRig implements ItemRig {
  readonly group = new THREE.Group();
  readonly useTime = 0.01;
  private readonly ring = swimRingModel();
  /** 0 on land, 1 swimming: eased so the ring settles into the water. */
  swim = 0;
  time = 0;

  constructor() {
    this.ring.scale.setScalar(0.62);
    this.group.add(this.ring);
  }

  update(_t: number, left: Arm, right: Arm): void {
    const bob = Math.sin(this.time * 3.2) * 0.012 * this.swim;
    const y = -0.24 - this.swim * 0.08 + bob;
    this.ring.position.set(0, y, -0.5);
    // Tipped toward you so you see the hole; flatter when you float in it.
    this.ring.rotation.set(-1.15 - this.swim * 0.3, 0, 0);
    const r = 0.19;
    left.grip(v3(-0.32, -0.6, -0.2), v3(-r, y + 0.02, -0.5), v3(-0.6, 0.6, 0.4));
    right.grip(v3(0.32, -0.6, -0.2), v3(r, y + 0.02, -0.5), v3(0.6, 0.6, 0.4));
    left.hand.setCurl(0.85);
    right.hand.setCurl(0.85);
  }
}

const RIGS: Record<ItemId, () => ItemRig> = { slingshot: () => new SlingshotRig(), machete: () => new MacheteRig(), swimRing: () => new SwimRingRig() };

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  private readonly root = new THREE.Group();
  private readonly left: Arm;
  private readonly right: Arm;
  private rig: ItemRig | null = null;
  private rigItem: ItemId | null = null;
  /** 0 lowered, 1 raised. */
  private raise = 0;
  private sinceUse = Infinity;
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;

  constructor() {
    const skin = new THREE.MeshStandardMaterial({ color: GLOVE, roughness: 0.55, metalness: 0 });
    const sleeve = new THREE.MeshStandardMaterial({ color: SLEEVE, roughness: 0.9, metalness: 0 });
    const cuff = new THREE.MeshStandardMaterial({ color: CUFF, roughness: 0.9, metalness: 0 });
    this.left = new Arm(-1, this.root, skin, sleeve, cuff);
    this.right = new Arm(1, this.root, skin, sleeve, cuff);
    this.scene.add(this.root);
    // Soft key light from above-right plus fill; the image-based light comes from the main scene.
    const key = new THREE.DirectionalLight('#fff1dc', 1.6);
    key.position.set(0.6, 1, 0.4);
    this.scene.add(key, new THREE.HemisphereLight('#cfdcea', '#4f5a3a', 0.6));
    this.root.visible = false;
  }

  /** Play the selected item's use motion. */
  playUse(): void {
    this.sinceUse = 0;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * `held` = the selected slot's item or null. `bob` = the walk bob phase, `moving` whether to bob,
   * yaw/pitch to sway the hands against fast turns.
   */
  update(held: HeldItem | null, visible: boolean, dt: number, bob: number, moving: boolean, yaw: number, pitch: number, reducedMotion: boolean, swimming = false): void {
    const want = held && visible ? held.item : null;
    if (want !== this.rigItem) {
      // Lower first, then swap the model and raise again.
      this.raise = Math.max(0, this.raise - dt / RAISE);
      if (this.raise === 0) {
        if (this.rig) this.root.remove(this.rig.group);
        this.rig = want ? RIGS[want]() : null;
        if (this.rig) this.root.add(this.rig.group);
        this.rigItem = want;
        this.sinceUse = Infinity;
      }
    } else if (want) {
      this.raise = Math.min(1, this.raise + dt / RAISE);
    }
    this.root.visible = this.raise > 0 && !!this.rig;
    if (!this.rig || !this.root.visible) return;

    // Sway: the hands lag a little behind fast turns, and bob with the walk.
    const dyaw = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw));
    const dpitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    const k = clamp01(dt * 10);
    this.swayX += (clamp01(Math.abs(dyaw) * 4) * Math.sign(dyaw) * 0.035 - this.swayX) * k;
    this.swayY += (clamp01(Math.abs(dpitch) * 4) * Math.sign(dpitch) * -0.03 - this.swayY) * k;
    const bobAmt = reducedMotion || !moving ? 0 : 1;
    const bx = Math.sin(bob * 0.5) * 0.008 * bobAmt;
    const by = Math.abs(Math.cos(bob * 0.5)) * 0.01 * bobAmt;
    this.root.position.set(this.swayX + bx, (1 - easeOut(this.raise)) * LOWERED_Y + this.swayY - by, 0);

    this.sinceUse += dt;
    if (this.rig instanceof SwimRingRig) {
      this.rig.time += dt;
      this.rig.swim += ((swimming ? 1 : 0) - this.rig.swim) * Math.min(1, dt * 4);
    }
    this.rig.update(this.sinceUse < this.rig.useTime ? this.sinceUse : Infinity, this.left, this.right);
  }
}
