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
