/** Procedural textures for the realistic 3D view (no image files to ship). Browser only. */
import * as THREE from 'three';

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1): void {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, (img.data[i] ?? 0) + n));
    img.data[i + 1] = Math.max(0, Math.min(255, (img.data[i + 1] ?? 0) + n));
    img.data[i + 2] = Math.max(0, Math.min(255, (img.data[i + 2] ?? 0) + n));
  }
  ctx.putImageData(img, 0, 0);
}

/** Polished concrete with 60 cm tiles, sized to a floor plate of `w` × `h` map units (1 unit = 5 cm). */
export function tileFloorTexture(w: number, h: number): THREE.CanvasTexture {
  const k = 2; // pixels per map unit
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#d8d5ce';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  noise(ctx, canvas.width, canvas.height, 12, 7);
  ctx.strokeStyle = 'rgba(60, 62, 58, 0.14)';
  ctx.lineWidth = 1;
  const tile = 12 * k;
  for (let x = 0; x <= canvas.width; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Tileable carpet fibre noise; the material colour tints it per room state. */
export function carpetTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, size, 38, 11);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial shadow under the building, like a model standing on a table. */
export function groundTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(34, 48, 58, 0.16)');
  g.addColorStop(1, 'rgba(34, 48, 58, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
