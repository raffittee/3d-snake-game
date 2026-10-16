import * as THREE from 'three';

/**
 * Procedural snake skin (no texture files exist for it). Layout of the texture:
 * u runs along the body (one tile = SKIN_TILE_SEGMENTS segments), v runs around it with the
 * belly centered at v = 0.75 and the spine at v = 0.25.
 */
export const SKIN_TILE_SEGMENTS = 2;

const W = 512;
const H = 256;
/** Scales across the full circumference and along one tile. */
const ROWS = 40;
const COLS = 44;

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function rand(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface SkinTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

let cached: SkinTextures | null = null;

export function snakeSkin(): SkinTextures {
  if (cached) return cached;
  const height = new Float32Array(W * H);
  const rgb = new Uint8ClampedArray(W * H * 4);
  // Diamondback colors: olive-brown ground, near-black diamond borders and side blotches,
  // tan diamond centers, cream belly.
  const back = [88, 80, 50];
  const dark = [34, 30, 20];
  const tan = [146, 128, 82];
  const belly = [212, 198, 162];
  for (let y = 0; y < H; y++) {
    // Canvas textures are flipped on upload: canvas row 0 is v = 1.
    const v = 1 - (y + 0.5) / H;
    // Distance from the belly line (v = 0.75), wrapped around the body.
    const dBelly = Math.min(Math.abs(v - 0.75), 1 - Math.abs(v - 0.75));
    const bellyMix = 1 - smooth(0.12, 0.2, dBelly);
    const row = Math.floor(v * ROWS);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      // Staggered rows of overlapping scales; belly scales are wide plates.
      const offset = row % 2 ? 0.5 : 0;
      const cu = u * COLS + offset;
      const col = Math.floor(cu);
      const fu = cu - col;
      const fv = v * ROWS - row;
      const plate = bellyMix > 0.5;
      const hu = plate ? fv : fu;
      // Scale dome: highest near its center-back, a dark seam at the edges.
      const d = plate ? Math.abs(fv - 0.45) * 2 : Math.hypot((fu - 0.5) * 1.4, (fv - 0.55) * 1.1);
      const dome = Math.max(0, 1 - d * d);
      height[y * W + x] = plate ? 0.6 - Math.abs(hu - 0.5) * 0.8 : dome;
      // One diamond per segment along the spine: a dark border around a tan center. The pattern
      // is sampled per scale (not per pixel), so its edges follow the scales like real markings.
      const su = (col + 0.5 - offset) / COLS;
      const sv = (row + 0.5) / ROWS;
      const jitter = (rand(col * 31 + row) - 0.5) * 0.05;
      const du = (((su * SKIN_TILE_SEGMENTS) % 1) + 1) % 1 - 0.5;
      const dvRaw = sv - 0.25;
      const dv = dvRaw - Math.round(dvRaw);
      const dd = Math.abs(du) + Math.abs(dv) * 2.4 + jitter;
      const border = 1 - smooth(0.05, 0.1, Math.abs(dd - 0.4));
      const inside = 1 - smooth(0.33, 0.38, dd);
      // Side blotches between the diamonds, low on the flanks.
      const du2 = (((su * SKIN_TILE_SEGMENTS + 0.5) % 1) + 1) % 1 - 0.5;
      const side = 1 - smooth(0.07, 0.12, Math.hypot(du2 * 0.8, (Math.abs(dv) - 0.27) * 2) + jitter);
      const shade = 0.86 + dome * 0.14 + (rand(col * 7 + row * 13) - 0.5) * 0.1;
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        let top = back[c] + (tan[c] - back[c]) * inside;
        top += (dark[c] - top) * Math.max(border, side);
        rgb[i + c] = (top + (belly[c] - top) * bellyMix) * shade;
      }
      rgb[i + 3] = 255;
    }
  }
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = W;
  colorCanvas.height = H;
  const cg = colorCanvas.getContext('2d');
  if (cg) cg.putImageData(new ImageData(rgb, W, H), 0, 0);

  // Normal map from the height field (central differences, wrapping in both directions).
  const nrm = new Uint8ClampedArray(W * H * 4);
  const strength = 1.1;
  const at = (x: number, y: number) => height[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      nrm[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nrm[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nrm[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nrm[i + 3] = 255;
    }
  }
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = W;
  normalCanvas.height = H;
  const ng = normalCanvas.getContext('2d');
  if (ng) ng.putImageData(new ImageData(nrm, W, H), 0, 0);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  cached = { map, normalMap };
  return cached;
}

/** The cross-section of a cut end: skin rim, a pale fat ring, red flesh, a darker core. */
export function fleshTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, '#4a1414');
    grad.addColorStop(0.5, '#6e1f1d');
    grad.addColorStop(0.74, '#8c3a33');
    grad.addColorStop(0.8, '#cdb898');
    grad.addColorStop(0.9, '#bfa985');
    grad.addColorStop(0.93, '#3d3826');
    grad.addColorStop(1, '#3d3826');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
