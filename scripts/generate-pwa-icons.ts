import { crc32, deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

type Rgba = [number, number, number, number];
type Point = [number, number];

const SAGE: Rgba = [80, 109, 72, 255];
const CREAM: Rgba = [250, 249, 246, 255];

interface IconSpec {
  file: string;
  size: number;
  maskable: boolean;
}

// "any": rounded sage tile on transparent. maskable/apple: full-bleed sage
// with the glyph inside the 80% safe zone (per maskable spec).
const ICONS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true }
];

const SAMPLES = 3;

function crc32u32(data: Buffer): number {
  return crc32(data) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32u32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([head, typeBuf, data, crcBuf]);
}

function pngBytes(size: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// The rounded sage tile for "any" icons: inset 9%, corner radius 22%.
function inTile(u: number, v: number): boolean {
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;
  const r = 0.22;
  const ex = Math.min(Math.max(u, r), 1 - r);
  const ey = Math.min(Math.max(v, r), 1 - r);
  const dx = u - ex;
  const dy = v - ey;
  return dx * dx + dy * dy <= r * r;
}

function inRoundedRect(u: number, v: number, cx: number, cy: number, w: number, h: number, r: number): boolean {
  const rx = Math.min(Math.max(u, cx - w / 2 + r), cx + w / 2 - r);
  const ry = Math.min(Math.max(v, cy - h / 2 + r), cy + h / 2 - r);
  const dx = u - rx;
  const dy = v - ry;
  return dx * dx + dy * dy <= r * r;
}

function inTriangle(u: number, v: number, a: Point, b: Point, c: Point): boolean {
  const d1 = (u - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (v - b[1]);
  const d2 = (u - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (v - c[1]);
  const d3 = (u - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (v - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// Bubbles and dots are authored in content space [0.1, 0.9] so the same glyph
// sits inside the maskable safe zone; "any" tiles are just smaller but share
// the identical geometry.
function inBubble(u: number, v: number): boolean {
  const body = inRoundedRect(u, v, 0.5, 0.44, 0.56, 0.36, 0.08);
  const tail = inTriangle(
    u, v,
    [0.3, 0.62], [0.47, 0.62], [0.34, 0.8]
  );
  return body || tail;
}

function inDot(u: number, v: number): boolean {
  const dots: Array<[number, number]> = [
    [0.42, 0.4], [0.52, 0.4], [0.62, 0.4]
  ];
  return dots.some(([dx, dy]) => {
    const ex = u - dx;
    const ey = v - dy;
    return ex * ex + ey * ey <= 0.032 * 0.032;
  });
}

// The glyph color at a content-space point: sage dots on a cream bubble.
function glyphColor(u: number, v: number): Rgba {
  return inDot(u, v) ? SAGE : inBubble(u, v) ? CREAM : SAGE;
}

function sampleColor(u: number, v: number, spec: IconSpec): Rgba {
  if (spec.maskable) {
    const cu = 0.1 + u * 0.8;
    const cv = 0.1 + v * 0.8;
    return glyphColor(cu, cv);
  }
  if (!inTile(u, v)) return [0, 0, 0, 0];
  const c = glyphColor(u, v);
  return c === SAGE ? SAGE : CREAM;
}

function renderIcon(spec: IconSpec): Buffer {
  const n = spec.size;
  const out = Buffer.alloc(n * n * 4);
  const step = 1 / n;
  const sub = 1 / SAMPLES;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const acc: Rgba = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const u = (x + (sx + 0.5) / SAMPLES) * step;
          const v = (y + (sy + 0.5) / SAMPLES) * step;
          const c = sampleColor(u, v, spec);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
          acc[3] += c[3];
        }
      }
      const denom = SAMPLES * SAMPLES;
      const i = (y * n + x) * 4;
      out[i] = Math.round(acc[0] / denom);
      out[i + 1] = Math.round(acc[1] / denom);
      out[i + 2] = Math.round(acc[2] / denom);
      out[i + 3] = Math.round(acc[3] / denom);
    }
  }
  return pngBytes(n, out);
}

const outDir = join(process.cwd(), 'public');
mkdirSync(outDir, { recursive: true });
for (const spec of ICONS) {
  writeFileSync(join(outDir, spec.file), renderIcon(spec));
  console.log(`wrote ${spec.file}`);
}