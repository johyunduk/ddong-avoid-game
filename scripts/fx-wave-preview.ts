/**
 * 파열 파동 검수 — **게임에 나가는 그 함수 그대로** 돌려 PNG 로 뽑는다.
 *
 *   node scripts/run-fx-wave-preview.mjs
 *
 * `drawCubeWaveFrame` 은 Canvas2D 만 쓴다. node 에는 캔버스가 없으므로 아래에
 * 필요한 만큼의 2D 컨텍스트를 직접 구현하고(방사 그라디언트 + 원 채우기),
 * 그 버퍼를 **화면 크기 캔버스**(390×640, 플레이어 위치 기준)에 합성해 내보낸다.
 *
 * **replica 가 아니라 실제 함수다.** 눈으로 보는 그림과 게임 그림이 갈라지면
 * 검수가 의미가 없다. 다발 표(`VOLLEY`)와 도달 반지름 계산도 `TedAbility` 와 같은 식이다.
 */
// @ts-nocheck
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { drawCubeWaveFrame } from '../src/utils/vfx';

// ── 최소 Canvas2D — 우리 함수가 쓰는 것만 ──────────────────────────────────
function parseColor(css) {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return [255, 255, 255, 1];
  const v = m[1].split(',').map(s => parseFloat(s));
  return [v[0] | 0, v[1] | 0, v[2] | 0, v.length > 3 ? v[3] : 1];
}

class RadialGradient {
  constructor(x0, y0, r0, x1, y1, r1) {
    this.r0 = r0; this.r1 = r1; this.cx = x1; this.cy = y1; this.stops = [];
  }
  addColorStop(p, css) { this.stops.push([p, parseColor(css)]); }
  sample(px, py) {
    const d = Math.hypot(px - this.cx, py - this.cy);
    let t = (d - this.r0) / Math.max(this.r1 - this.r0, 1e-6);
    if (t <= 0) t = 0; else if (t >= 1) t = 1;
    const st = this.stops;
    if (!st.length) return [0, 0, 0, 0];
    if (t <= st[0][0]) return st[0][1];
    for (let i = 1; i < st.length; i++) {
      if (t <= st[i][0]) {
        const [p0, c0] = st[i - 1];
        const [p1, c1] = st[i];
        const u = (t - p0) / Math.max(p1 - p0, 1e-6);
        return [c0[0] + (c1[0] - c0[0]) * u, c0[1] + (c1[1] - c0[1]) * u,
                c0[2] + (c1[2] - c0[2]) * u, c0[3] + (c1[3] - c0[3]) * u];
      }
    }
    return st[st.length - 1][1];
  }
}

class Ctx {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.buf = new Float64Array(w * h * 4);   // 프리멀티플라이 RGBA
    this.globalAlpha = 1;
    this.fillStyle = '#fff';
    this.path = null;
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { return new RadialGradient(x0, y0, r0, x1, y1, r1); }
  beginPath() { this.path = null; }
  arc(cx, cy, r) { this.path = { cx, cy, r }; }
  fill() {
    const p = this.path;
    if (!p) return;
    const g = this.fillStyle;
    const x0 = Math.max(0, Math.floor(p.cx - p.r)), x1 = Math.min(this.w, Math.ceil(p.cx + p.r));
    const y0 = Math.max(0, Math.floor(p.cy - p.r)), y1 = Math.min(this.h, Math.ceil(p.cy + p.r));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        if (Math.hypot(px - p.cx, py - p.cy) > p.r) continue;
        const c = typeof g === 'string' ? parseColor(g) : g.sample(px, py);
        const a = c[3] * this.globalAlpha;
        if (a <= 0) continue;
        const i = (y * this.w + x) * 4;
        this.buf[i] = c[0] * a + this.buf[i] * (1 - a);
        this.buf[i + 1] = c[1] * a + this.buf[i + 1] * (1 - a);
        this.buf[i + 2] = c[2] * a + this.buf[i + 2] * (1 - a);
        this.buf[i + 3] = a + this.buf[i + 3] * (1 - a);
      }
    }
  }
  save() {} restore() {} translate() {} rect() {} clip() {} stroke() {}
  moveTo() {} quadraticCurveTo() {} closePath() {}
}

// ── PNG 쓰기 (의존성 없이) ─────────────────────────────────────────────────
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_T[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePng(path, w, h, rgb, ch = 3) {
  const raw = Buffer.alloc((w * ch + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      for (let c = 0; c < ch; c++) raw[o++] = rgb[i + c];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

// ── 게임 쪽과 같은 값 ───────────────────────────────────────────────────────
const PX = 160;          // FX_REGISTRY.cubeWave 프레임 크기
const FRAMES = 9;
const FPS = 30;
const UNIT_R = PX * 0.42;                       // 배율 1 에서의 최대 반지름
const VOLLEY = [                                // TedAbility 의 WAVE_VOLLEY 와 같은 표
  { delay: 0, reach: 0.78, grow: 2.8, alpha: 1.00 },
  { delay: 55, reach: 0.52, grow: 1.35, alpha: 0.97 },
  { delay: 115, reach: 0.66, grow: 2.0, alpha: 0.94 },
  { delay: 185, reach: 0.95, grow: 1.7, alpha: 0.82 },
];

const SCREEN_W = 390, SCREEN_H = 640;           // 대표 모바일 세로 화면
const PLAYER = { x: 195, y: 560 };              // GameScene 의 플레이어 위치(H - 80)

function bake(px) {
  return Array.from({ length: FRAMES }, (_, i) => {
    const ctx = new Ctx(px, px);
    drawCubeWaveFrame(ctx, FRAMES > 1 ? i / (FRAMES - 1) : 0, px, px);
    return ctx.buf;
  });
}
const CACHE = bake(PX);

/** 화면 한 장. `tint` 는 Phaser setTint 와 같은 곱셈이다 */
function screen(tMs, bg, tint, cache = CACHE, px = PX) {
  const out = new Uint8Array(SCREEN_W * SCREEN_H * 3);
  for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
    out[i * 3] = bg[0]; out[i * 3 + 1] = bg[1]; out[i * 3 + 2] = bg[2];
  }
  const tr = tint ? ((tint >> 16) & 255) / 255 : 1;
  const tg = tint ? ((tint >> 8) & 255) / 255 : 1;
  const tb = tint ? (tint & 255) / 255 : 1;
  const unit = px * 0.42;

  for (const v of VOLLEY) {
    const local = tMs - v.delay;
    if (local < 0) continue;
    const fi = Math.floor((local / 1000) * FPS);
    if (fi >= FRAMES) continue;
    const src = cache[fi];
    const finalScale = (v.reach * SCREEN_W) / unit;
    const start = finalScale / v.grow;
    const p = Math.min(1, (local / 1000) * FPS / (FRAMES - 1));
    const e = 1 - (1 - p) * (1 - p);            // playFx 의 Quad.easeOut
    const s = start * (1 + (v.grow - 1) * e);
    const size = px * s;
    const ox = PLAYER.x - size / 2, oy = PLAYER.y - size / 2;
    const x0 = Math.max(0, Math.floor(ox)), x1 = Math.min(SCREEN_W, Math.ceil(ox + size));
    const y0 = Math.max(0, Math.floor(oy)), y1 = Math.min(SCREEN_H, Math.ceil(oy + size));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const sx = Math.floor((x - ox) / s), sy = Math.floor((y - oy) / s);
        if (sx < 0 || sy < 0 || sx >= px || sy >= px) continue;
        const si = (sy * px + sx) * 4;
        const a = src[si + 3] * v.alpha;
        if (a <= 0.002) continue;
        const di = (y * SCREEN_W + x) * 3;
        out[di] = Math.round(src[si] * v.alpha * tr + out[di] * (1 - a));
        out[di + 1] = Math.round(src[si + 1] * v.alpha * tg + out[di + 1] * (1 - a));
        out[di + 2] = Math.round(src[si + 2] * v.alpha * tb + out[di + 2] * (1 - a));
      }
    }
  }
  return out;
}

function downscale(src, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh * 3);
  const kx = sw / dw, ky = sh / dh;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = Math.floor(y * ky); j < Math.min(sh, Math.ceil((y + 1) * ky)); j++) {
        for (let i = Math.floor(x * kx); i < Math.min(sw, Math.ceil((x + 1) * kx)); i++) {
          const s = (j * sw + i) * 3;
          r += src[s]; g += src[s + 1]; b += src[s + 2]; n++;
        }
      }
      const d = (y * dw + x) * 3;
      out[d] = r / n; out[d + 1] = g / n; out[d + 2] = b / n;
    }
  }
  return out;
}

const SHOTS = [0, 60, 120, 180, 260, 360];
const DARK = [26, 24, 30], BRIGHT = [192, 192, 190];
const VARIANTS = [
  { name: 'mono', tint: null },
  { name: 'cool', tint: 0xcfe0ff },
  { name: 'gold', tint: 0xffe7bb },
];

const CW = 176, CH = Math.round((SCREEN_H / SCREEN_W) * CW);
const rows = [];
for (const v of VARIANTS) for (const bg of [DARK, BRIGHT]) rows.push({ v, bg });

const W = CW * SHOTS.length, H = CH * rows.length;
const sheet = new Uint8Array(W * H * 3);
rows.forEach((row, ri) => {
  SHOTS.forEach((t, si) => {
    const cell = downscale(screen(t, row.bg, row.v.tint), SCREEN_W, SCREEN_H, CW, CH);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const s = (y * CW + x) * 3;
        const d = ((ri * CH + y) * W + si * CW + x) * 3;
        sheet[d] = cell[s]; sheet[d + 1] = cell[s + 1]; sheet[d + 2] = cell[s + 2];
      }
    }
  });
});
mkdirSync('build/cube', { recursive: true });
writePng('build/cube/wave_check.png', W, H, sheet);

// ── 텍스처를 키우는 게 이득인지 실측 ────────────────────────────────────────
// 같은 화면 크기를 160 텍스처와 256 텍스처로 각각 만들어 차이를 잰다
const BIG = 256;
const bigCache = bake(BIG);
const a = screen(140, DARK, null);
const b = screen(140, DARK, null, bigCache, BIG);
let sum = 0, max = 0;
for (let i = 0; i < a.length; i++) {
  const d = Math.abs(a[i] - b[i]);
  sum += d; if (d > max) max = d;
}

// 파동 프레임을 **투명 PNG 로** 따로 덤프한다 — 파이썬 검수에서 큐브 시트 위에 겹쳐
// '반투명 두 겹이 포개지면 탁해지는가' 를 실제 그림으로 확인하기 위해서다
mkdirSync('build/cube/wave_frames', { recursive: true });
for (let i = 0; i < FRAMES; i++) {
  const src = CACHE[i];
  const out = new Uint8Array(PX * PX * 4);
  for (let j = 0; j < PX * PX; j++) {
    const a = Math.min(1, src[j * 4 + 3]);
    out[j * 4 + 3] = Math.round(a * 255);
    for (let c = 0; c < 3; c++) {           // 프리멀티플라이 → 스트레이트
      out[j * 4 + c] = a > 0.003 ? Math.min(255, Math.round(src[j * 4 + c] / a)) : 0;
    }
  }
  writePng(`build/cube/wave_frames/w${String(i).padStart(2, '0')}.png`, PX, PX, out, 4);
}

const maxReach = Math.max(...VOLLEY.map(v => v.reach));
console.log(`파동 검수: build/cube/wave_check.png`);
console.log(`  ${SHOTS.join('/')}ms × 배경 2종 × ${VARIANTS.map(v => v.name).join('/')} `
  + `(화면 ${SCREEN_W}×${SCREEN_H}, 플레이어 ${PLAYER.x},${PLAYER.y})`);
console.log(`  겹 ${VOLLEY.length}장 · 최대 도달 반지름 화면 폭의 ${(maxReach * 100).toFixed(0)}% `
  + `= ${Math.round(maxReach * SCREEN_W)}px (지름 ${Math.round(maxReach * SCREEN_W * 2)}px, 화면 폭 ${SCREEN_W})`);
console.log(`  텍스처 ${PX}×${PX} × ${FRAMES}프레임 = ${((PX * FRAMES * PX * 4) / 1048576).toFixed(2)}MB `
  + `(절차 생성, 다운로드 0)`);
console.log(`  ${BIG}px 텍스처로 키웠을 때: ${((BIG * FRAMES * BIG * 4) / 1048576).toFixed(2)}MB `
  + `(+${(((BIG * FRAMES * BIG - PX * FRAMES * PX) * 4) / 1048576).toFixed(2)}MB) · `
  + `같은 화면에서 평균 차 ${(sum / a.length).toFixed(2)} / 최대 ${max} (0~255)`);
