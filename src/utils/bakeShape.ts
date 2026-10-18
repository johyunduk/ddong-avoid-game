import Phaser from 'phaser';

/**
 * 모양(둥근 사각 · 원)을 캔버스 텍스처로 **한 번 굽는다** — 키가 이미 있으면 다시 굽지 않는다.
 *
 * Phaser Graphics 는 결과를 캐시하지 않고 매 프레임 다시 그린다 — WebGL 에서는 호마다 점 약 100개를 새로 만들고
 * 채우기는 Earcut 을 돌린다 (둥근 사각 하나 = 점 약 400개). 카드 · 칩처럼 화면에 많이 깔리는 모양은 여기서 구워
 * Image 로 띄운다 (2026-10-18 렉 점검).
 *
 * 2배로 굽는다 — 띄울 때 setDisplaySize 로 1배 크기에 맞춘다 (roundPixels 라 위치는 정수로 붙는다)
 */
const R = 2;

/** w×h (1배) 칸에 draw 로 그려 2배 텍스처로 굽는다 */
export function bakeShape(
  scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void,
): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * R), Math.ceil(h * R));
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.scale(R, R);
  draw(ctx);
  tex.refresh();
  return key;
}

/** 0xRRGGBB + 알파 → 캔버스 색 */
export function cssColor(color: number, alpha = 1): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}

/** 둥근 사각 경로 — Graphics.fillRoundedRect 와 같은 모양 (반지름은 짧은 변의 절반까지) */
export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 채우기 · 테 — 둘 중 하나만 있어도 된다. 알파 · 두께 기본값은 Graphics 와 같다 (1 · 1) */
export interface ShapeStyle {
  fill?: number;
  fillAlpha?: number;
  line?: number;
  lineAlpha?: number;
  lineWidth?: number;
}

const lineOf = (s: ShapeStyle) => (s.line !== undefined ? (s.lineWidth ?? 1) : 0);
const styleTag = (s: ShapeStyle) => {
  const hex = (c: number | undefined) => (c === undefined ? '-' : c.toString(16));
  return `f${hex(s.fill)}_${s.fillAlpha ?? 1}_l${hex(s.line)}_${s.lineAlpha ?? 1}_${lineOf(s)}`;
};
/** 지금 경로를 채우고 테를 두른다 (Graphics 처럼 채우기 먼저) */
function paint(ctx: CanvasRenderingContext2D, s: ShapeStyle): void {
  if (s.fill !== undefined) {
    ctx.fillStyle = cssColor(s.fill, s.fillAlpha ?? 1);
    ctx.fill();
  }
  if (s.line !== undefined) {
    ctx.lineWidth = lineOf(s);
    ctx.strokeStyle = cssColor(s.line, s.lineAlpha ?? 1);
    ctx.stroke();
  }
}

/**
 * 둥근 사각을 굽는다 — 키는 prefix 와 모양 값으로 만든다 (prefix 로 씬이 나갈 때 내릴지 정한다).
 * 테는 경로 가운데에 걸쳐 lineWidth/2 만큼 밖으로 나가므로 pad 만큼 둘러 굽는다 —
 * 띄울 그림의 크기는 dw × dh(정수 — 2배 텍스처와 정확히 반), 모양의 왼쪽 위는 그림 왼쪽 위에서 (pad, pad)
 */
export function bakeRoundRect(
  scene: Phaser.Scene, prefix: string, w: number, h: number, r: number, s: ShapeStyle,
): { key: string; pad: number; dw: number; dh: number } {
  const pad = Math.ceil(lineOf(s) / 2);
  const dw = Math.ceil(w) + pad * 2, dh = Math.ceil(h) + pad * 2;
  const key = `${prefix}_rr_${w}x${h}_r${r}_${styleTag(s)}`;
  bakeShape(scene, key, dw, dh, ctx => {
    roundRectPath(ctx, pad, pad, w, h, r);
    paint(ctx, s);
  });
  return { key, pad, dw, dh };
}

/** 구운 둥근 사각을 띄운다 — (x, y) 는 모양의 왼쪽 위 (Graphics.fillRoundedRect 의 x · y 와 같다) */
export function addRoundRect(
  scene: Phaser.Scene, prefix: string, x: number, y: number, w: number, h: number, r: number, s: ShapeStyle,
): Phaser.GameObjects.Image {
  const b = bakeRoundRect(scene, prefix, w, h, r, s);
  return scene.add.image(x - b.pad, y - b.pad, b.key).setOrigin(0).setDisplaySize(b.dw, b.dh);
}

/** 원을 굽는다 — 그림은 size × size (정수), 원의 가운데가 그림 가운데. 띄울 때 origin 0.5 · setDisplaySize(size, size) */
export function bakeCircle(scene: Phaser.Scene, prefix: string, r: number, s: ShapeStyle): { key: string; size: number } {
  const size = Math.ceil(2 * r + lineOf(s));
  const key = `${prefix}_ci_${r}_${styleTag(s)}`;
  bakeShape(scene, key, size, size, ctx => {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    paint(ctx, s);
  });
  return { key, size };
}

/** 구운 원을 띄운다 — (x, y) 는 원의 가운데 (Graphics.fillCircle 과 같다) */
export function addCircle(scene: Phaser.Scene, prefix: string, x: number, y: number, r: number, s: ShapeStyle): Phaser.GameObjects.Image {
  const b = bakeCircle(scene, prefix, r, s);
  return scene.add.image(x, y, b.key).setDisplaySize(b.size, b.size);
}
