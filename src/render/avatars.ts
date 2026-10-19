import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BALANCE } from '../config/balance';
import type { PlayerState, World } from '../sim/types';


interface Avatar {
  group: THREE.Group;
  body: THREE.Group;
  legs: [THREE.Object3D, THREE.Object3D];
  arms: [THREE.Object3D, THREE.Object3D];
  egg: THREE.Mesh;
  tag: THREE.Sprite;
  tagText: string;
  phase: number;
  lastX: number;
  lastZ: number;
  down: number;
}

/**
 * A person, about 1.78 tall, built in code: an explorer in walking boots, trousers with a belt, a
 * field jacket in the player's color (collar, pockets), gloves, a backpack, and a head with a face
 * and a cap. Feet at y 0, facing -z (yaw 0). Legs and arms hang from hip and shoulder pivots so
 * they can swing. Roughness and colors are kept matte and muted, like the rest of the arena.
 */
function personModel(color: string): Omit<Avatar, 'tag' | 'tagText' | 'phase' | 'lastX' | 'lastZ' | 'down'> {
  // The token is a UI color; cloth under the sun reads better a little darker and greyer.
  const jacketColor = new THREE.Color(color).lerp(new THREE.Color('#6b6a60'), 0.3).multiplyScalar(0.85);
  const jacket = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.88 });
  const jacketDark = new THREE.MeshStandardMaterial({ color: jacketColor.clone().multiplyScalar(0.72), roughness: 0.9 });
  const trousers = new THREE.MeshStandardMaterial({ color: '#43443d', roughness: 0.92 });
  const boots = new THREE.MeshStandardMaterial({ color: '#3a2c1f', roughness: 0.75 });
  const sole = new THREE.MeshStandardMaterial({ color: '#1e1a16', roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: '#b98b6c', roughness: 0.62 });
  const glove = new THREE.MeshStandardMaterial({ color: '#5a4430', roughness: 0.8 });
  const canvas = new THREE.MeshStandardMaterial({ color: '#6a6a55', roughness: 0.95 });
  const leather = new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: '#2b2119', roughness: 0.85 });
  const eye = new THREE.MeshStandardMaterial({ color: '#15110e', roughness: 0.3 });
  const cap = new THREE.MeshStandardMaterial({ color: jacketColor.clone().multiplyScalar(0.55), roughness: 0.9 });
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.1, 0.9, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.36, 4, 12), trousers);
    thigh.position.y = -0.22;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.34, 4, 12), trousers);
    shin.position.y = -0.58;
    const boot = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.13, 0.27, 3, 0.04), boots);
    boot.position.set(0, -0.83, -0.04);
    const bootSole = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.03, 0.28, 2, 0.012), sole);
    bootSole.position.set(0, -0.885, -0.04);
    hip.add(thigh, shin, boot, bootSole);
    body.add(hip);
    legs.push(hip);
  }
  const hips = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.18, 0.2, 3, 0.07), trousers);
  hips.position.y = 0.93;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.045, 18), leather);
  belt.scale.z = 0.62;
  belt.position.y = 1.02;
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.3, 6, 16), jacket);
  chest.scale.set(1.05, 1, 0.66);
  chest.position.y = 1.24;
  // Jacket hem, chest pockets and collar: enough shape to read as clothing, not a capsule.
  const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.1, 18), jacketDark);
  hem.scale.z = 0.66;
  hem.position.y = 1.07;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 18), jacketDark);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.47;
  body.add(hips, belt, chest, hem, collar);
  for (const s of [-1, 1]) {
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.09, 0.025, 2, 0.01), jacketDark);
    pocket.position.set(s * 0.085, 1.3, -0.118);
    body.add(pocket);
  }
  // Backpack with its straps.
  const pack = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.38, 0.16, 3, 0.05), canvas);
  pack.position.set(0, 1.24, 0.19);
  const flap = new THREE.Mesh(new RoundedBoxGeometry(0.31, 0.12, 0.17, 2, 0.04), leather);
  flap.position.set(0, 1.4, 0.19);
  body.add(pack, flap);
  for (const s of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.012), leather);
    strap.position.set(s * 0.1, 1.27, -0.115);
    body.add(strap);
  }
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.235, 1.4, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.26, 4, 12), jacket);
    upper.position.y = -0.17;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.24, 4, 12), jacket);
    fore.position.y = -0.45;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), jacketDark);
    cuff.position.y = -0.6;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), glove);
    hand.scale.set(0.9, 1.15, 0.75);
    hand.position.y = -0.68;
    shoulder.add(upper, fore, cuff, hand);
    body.add(shoulder);
    arms.push(shoulder);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.1, 12), skin);
  neck.position.y = 1.52;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), skin);
  head.scale.set(0.9, 1.1, 1);
  head.position.y = 1.65;
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), skin);
  jaw.scale.set(1, 0.8, 0.95);
  jaw.position.set(0, 1.59, -0.02);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045, 8), skin);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 1.64, -0.11);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.104, 16, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), hair);
  back.rotation.x = -0.5;
  back.position.set(0, 1.66, 0.01);
  body.add(neck, head, jaw, nose, back);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), eye);
    e.position.set(s * 0.036, 1.67, -0.092);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), skin);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(s * 0.095, 1.65, 0.005);
    body.add(e, ear);
  }
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.112, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap);
  crown.scale.set(0.95, 0.8, 1.02);
  crown.position.y = 1.7;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.014, 18, 1, false, Math.PI * 0.2, Math.PI * 0.6), cap);
  brim.position.set(0, 1.7, -0.075);
  brim.scale.set(1, 1, 1.45);
  body.add(crown, brim);
  // The snake's egg, held in front (Hot Egg): pale, glowing faintly so the carrier stands out.
  const egg = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#efe6cf', roughness: 0.4, emissive: '#d9b46a', emissiveIntensity: 0.35 }),
  );
  egg.scale.set(0.85, 1.15, 0.85);
  egg.position.set(0, 0.98, -0.32);
  egg.visible = false;
  body.add(egg);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { group, body, legs: legs as [THREE.Object3D, THREE.Object3D], arms: arms as [THREE.Object3D, THREE.Object3D], egg };
}

/** A name tag: the name on a dark translucent pill, drawn to a canvas. */
function makeTag(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(1.2, 0.3, 1);
  sprite.position.y = 2.1;
  sprite.renderOrder = 5;
  drawTag(sprite, text, color);
  return sprite;
}

function drawTag(sprite: THREE.Sprite, text: string, color: string): void {
  const tex = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
  const canvas = tex.image as HTMLCanvasElement;
  const g = canvas.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.font = '600 30px "Inter Variable", Inter, system-ui, sans-serif';
  const w = Math.min(canvas.width - 8, g.measureText(text).width + 40);
  const x = (canvas.width - w) / 2;
  g.fillStyle = 'rgba(12, 16, 14, 0.62)';
  g.beginPath();
  g.roundRect(x, 10, w, 44, 22);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x + 20, 32, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f1efe7';
  g.textBaseline = 'middle';
  g.fillText(text, x + 34, 33, w - 44);
  tex.needsUpdate = true;
}

/**
 * Everyone else in a multiplayer match, drawn as a person: walking (legs and arms swing with their
 * speed), lying on the ground when downed, holding the egg in Hot Egg, with a name tag above (it
 * shows what they carry to the nest, and a mic when they talk). Players steering a snake, out of
 * the round or escaped are not drawn. Your own player never is (you are the camera).
 */
export class AvatarViews {
  readonly group = new THREE.Group();
  /** Jacket colors by player id (the --player-N CSS tokens). */
  constructor(private readonly colors: string[]) {}
  private color(id: number): string {
    return this.colors[id % this.colors.length] || '#c8973a';
  }
  private avatars = new Map<number, Avatar>();
  /** Name tags over snakes that players steer (Snake and Players, Infection), by player id. */
  private snakeTags = new Map<number, { tag: THREE.Sprite; text: string }>();
  /** Names by player id, and who is talking (player ids). Set by the game layer. */
  names: string[] = [];
  talking = new Set<number>();

  update(world: World, me: number, dt: number): void {
    const seen = new Set<number>();
    for (const p of world.players) {
      if (p.id === me || p.out || p.snakeId !== null) continue;
      seen.add(p.id);
      let a = this.avatars.get(p.id);
      if (!a) {
        a = { ...personModel(this.color(p.id)), tag: makeTag('', this.color(p.id)), tagText: '', phase: 0, lastX: p.x, lastZ: p.z, down: 0 };
        a.group.add(a.tag);
        this.group.add(a.group);
        this.avatars.set(p.id, a);
      }
      this.pose(a, p, world, dt);
    }
    for (const [id, a] of this.avatars) {
      if (seen.has(id)) continue;
      this.group.remove(a.group);
      disposeGroup(a.group);
      this.avatars.delete(id);
    }
    // A steered snake carries its pilot's name over its head (not your own: you know which one is you).
    const piloted = new Set<number>();
    for (const s of world.snakes) {
      if (s.pilot === null || s.pilot === me) continue;
      piloted.add(s.pilot);
      let t = this.snakeTags.get(s.pilot);
      if (!t) {
        t = { tag: makeTag('', this.color(s.pilot)), text: '' };
        this.group.add(t.tag);
        this.snakeTags.set(s.pilot, t);
      }
      const text = this.names[s.pilot] ?? `Player ${s.pilot + 1}`;
      if (text !== t.text) {
        t.text = text;
        drawTag(t.tag, text, this.color(s.pilot));
      }
      t.tag.position.set(s.pos[0].x, BALANCE.snake.headHeight + 1.1, s.pos[0].z);
    }
    for (const [id, t] of this.snakeTags) {
      if (piloted.has(id)) continue;
      this.group.remove(t.tag);
      disposeGroup(t.tag);
      this.snakeTags.delete(id);
    }
  }

  private pose(a: Avatar, p: PlayerState, world: World, dt: number): void {
    const speed = dt > 0 ? Math.hypot(p.x - a.lastX, p.z - a.lastZ) / dt : 0;
    a.lastX = p.x;
    a.lastZ = p.z;
    a.group.position.set(p.x, p.y, p.z);
    a.group.rotation.y = p.yaw;
    // Downed: eases over onto the ground.
    a.down += ((p.down > 0 ? 1 : 0) - a.down) * Math.min(1, dt * 6);
    a.body.rotation.x = -a.down * (Math.PI / 2 - 0.08);
    a.body.position.y = a.down * 0.18;
    a.body.position.z = a.down * 0.85;
    // Walk cycle: stride with speed; arms swing opposite.
    const moving = speed > 0.4 && p.down <= 0;
    a.phase += dt * Math.min(12, speed * 2.4);
    const swing = moving ? Math.min(0.75, 0.18 + speed * 0.08) : 0;
    const s = Math.sin(a.phase) * swing;
    a.legs[0].rotation.x += (s - a.legs[0].rotation.x) * Math.min(1, dt * 14);
    a.legs[1].rotation.x += (-s - a.legs[1].rotation.x) * Math.min(1, dt * 14);
    // Holding the egg: both forearms forward and in, cradling it.
    const holding = p.egg;
    const k = Math.min(1, dt * 14);
    a.arms[0].rotation.x += ((holding ? -0.75 : -s * 0.8) - a.arms[0].rotation.x) * k;
    a.arms[1].rotation.x += ((holding ? -0.75 : s * 0.8) - a.arms[1].rotation.x) * k;
    a.arms[0].rotation.z += ((holding ? 0.32 : 0) - a.arms[0].rotation.z) * k;
    a.arms[1].rotation.z += ((holding ? -0.32 : 0) - a.arms[1].rotation.z) * k;
    a.egg.visible = holding;
    // In the dark cave you only see someone by your light (or theirs), like the snake.
    a.group.visible = true;
    const name = this.names[p.id] ?? `Player ${p.id + 1}`;
    const extra = [p.carrying > 0 ? `· ${p.carrying}` : '', this.talking.has(p.id) ? '· mic' : '', p.down > 0 && world.match?.mode === 'classic' ? '· help!' : ''].filter(Boolean).join(' ');
    const text = extra ? `${name} ${extra}` : name;
    if (text !== a.tagText) {
      a.tagText = text;
      drawTag(a.tag, text, this.color(p.id));
    }
    a.tag.position.y = p.down > 0 ? 0.9 : BALANCE.player.eyeHeight + 0.5;
  }

  clear(): void {
    for (const a of this.avatars.values()) {
      this.group.remove(a.group);
      disposeGroup(a.group);
    }
    this.avatars.clear();
    for (const t of this.snakeTags.values()) {
      this.group.remove(t.tag);
      disposeGroup(t.tag);
    }
    this.snakeTags.clear();
  }
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        (m as THREE.SpriteMaterial).map?.dispose();
        m.dispose();
      }
    }
  });
}
