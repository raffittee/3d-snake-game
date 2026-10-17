import * as THREE from 'three';
import type { World } from '../sim/types';

const FUR = '#7a6a55';
const DARK = '#3b3229';

/**
 * A mongoose (about 0.9 long, nose to tail tip), built in code: a long low body, a pointed head
 * with small round ears, four short legs and a long bushy tail. Faces +z. Returns the parts the
 * run animation moves.
 */
export function mongooseModel(): { group: THREE.Group; body: THREE.Group; legs: THREE.Mesh[]; tail: THREE.Mesh; head: THREE.Group } {
  const fur = new THREE.MeshStandardMaterial({ color: FUR, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.9 });
  const eye = new THREE.MeshStandardMaterial({ color: '#0c0b09', roughness: 0.25 });
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.32, 6, 12), fur);
  torso.rotation.x = Math.PI / 2;
  torso.position.y = 0.17;
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.21, 0.27);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), fur);
  skull.scale.set(1, 0.9, 1.15);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 10), fur);
  snout.rotation.x = Math.PI / 2;
  snout.position.z = 0.09;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), dark);
  nose.position.z = 0.15;
  head.add(skull, snout, nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), dark);
    ear.scale.set(1, 0.8, 0.5);
    ear.position.set(s * 0.045, 0.05, -0.01);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), eye);
    e.position.set(s * 0.04, 0.02, 0.05);
    head.add(ear, e);
  }
  body.add(head);
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[-0.05, 0.14], [0.05, 0.14], [-0.05, -0.14], [0.05, -0.14]]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 4, 6), dark);
    leg.geometry.translate(0, -0.07, 0);
    leg.position.set(x, 0.14, z);
    legs.push(leg);
    body.add(leg);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 10), fur);
  tail.geometry.translate(0, 0.21, 0);
  tail.rotation.x = -Math.PI / 2 - 0.35;
  tail.position.set(0, 0.17, -0.22);
  body.add(tail);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return { group, body, legs, tail, head };
}

/**
 * Every mongoose in the world: a bounding run toward its snake, then a darting fight around the
 * head (it hops side to side and lunges). Reads world.mongooses; keeps no rules.
 */
export class MongooseViews {
  readonly group = new THREE.Group();
  private readonly views = new Map<number, ReturnType<typeof mongooseModel> & { last: THREE.Vector2; yaw: number }>();

  update(world: World, dt: number, now: number): void {
    const live = new Set<number>();
    const t = now / 1000;
    for (const m of world.mongooses) {
      live.add(m.id);
      let v = this.views.get(m.id);
      if (!v) {
        v = { ...mongooseModel(), last: new THREE.Vector2(m.x, m.z), yaw: 0 };
        v.group.scale.setScalar(1.6);
        this.views.set(m.id, v);
        this.group.add(v.group);
      }
      const dx = m.x - v.last.x;
      const dz = m.z - v.last.y;
      const speed = Math.hypot(dx, dz) / Math.max(1e-4, dt);
      v.last.set(m.x, m.z);
      const foe = m.fighting ? world.snakes.find((s) => s.id === m.targetId) : undefined;
      const fighting = !!foe;
      // Face where it runs, or the snake's head while it fights.
      const want = foe ? Math.atan2(foe.pos[0].x - m.x, foe.pos[0].z - m.z) : speed > 0.5 ? Math.atan2(dx, dz) : v.yaw;
      v.yaw += Math.atan2(Math.sin(want - v.yaw), Math.cos(want - v.yaw)) * Math.min(1, dt * 12);
      v.group.rotation.y = v.yaw;
      let x = m.x;
      let z = m.z;
      let hop = 0;
      if (fighting) {
        // Dart side to side and lunge at the head.
        const side = Math.sin(t * 9 + m.id) * 0.5;
        x += Math.cos(v.yaw) * side;
        z -= Math.sin(v.yaw) * side;
        hop = Math.abs(Math.sin(t * 9 + m.id)) * 0.12;
        v.head.position.z = 0.27 + Math.max(0, Math.sin(t * 13)) * 0.05;
      } else {
        v.head.position.z = 0.27;
      }
      const run = speed > 0.5 ? 1 : 0;
      const gait = t * 22;
      v.legs.forEach((leg, i) => (leg.rotation.x = run * Math.sin(gait + (i < 2 ? 0 : Math.PI)) * 0.9));
      v.body.position.y = run * Math.abs(Math.sin(gait)) * 0.04 + hop;
      v.tail.rotation.x = -Math.PI / 2 - 0.35 + Math.sin(t * (fighting ? 14 : 6)) * 0.15;
      v.group.position.set(x, 0, z);
    }
    for (const [id, v] of this.views) {
      if (live.has(id)) continue;
      this.group.remove(v.group);
      this.views.delete(id);
    }
  }
}
