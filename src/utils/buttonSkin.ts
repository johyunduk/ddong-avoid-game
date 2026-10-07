import Phaser from 'phaser';

/**
 * 메뉴 버튼 겉모습 — 둥근 모서리 · 세로 그라데이션 · 아래 두께(눌리는 판) · 그림자 · 위쪽 광택.
 * 캔버스 텍스처로 **한 번 굽는다** (키가 이미 있으면 다시 굽지 않는다). 매 프레임 그리는 것은 없다.
 *
 * 텍스처 크기 = 버튼 크기 + 그림자 여백(pad). 버튼 몸통의 가운데가 텍스처 가운데보다 위에 있으니
 * 배치할 때는 bakeButton 이 돌려주는 originY 를 쓴다
 */
export interface ButtonSkin {
  w: number;
  h: number;
  radius: number;
  /** 몸통 위·아래 색 (세로 그라데이션) */
  top: string;
  bottom: string;
  /** 테두리 색·두께 */
  border: string;
  borderW: number;
  /** 아래 두께(눌리는 판) 색·높이 — 0 이면 없음 */
  lip: string;
  lipH: number;
  /** 위쪽 광택 띠 진하기 0~1 */
  gloss: number;
  /** 바깥 발광 색 (네온 테두리) — 없으면 그림자만 */
  glow?: string;
}

const PAD = 10;

/**
 * 버튼 텍스처를 굽고 (키, 텍스처 안 몸통 가운데 비율, 그림자 여백 pad) 를 돌려준다.
 * 이미지째 setInteractive 하면 그림자 여백까지 눌린다 — 몸통만 누르게 하려면 hitRect(pad, w, h) 를 쓴다
 */
export function bakeButton(scene: Phaser.Scene, key: string, s: ButtonSkin): { key: string; originY: number; pad: number } {
  const W = s.w + PAD * 2;
  const H = s.h + s.lipH + PAD * 2;
  const originY = (PAD + s.h / 2) / H;
  if (scene.textures.exists(key)) return { key, originY, pad: PAD };
  const tex = scene.textures.createCanvas(key, W, H);
  if (!tex) return { key, originY, pad: PAD };
  const ctx = tex.getContext();
  const x = PAD, y = PAD;
  // ctx.roundRect 는 오래된 모바일 웹뷰에 없다 — 직접 그린다
  const rr = (yy: number, hh: number) => {
    const r = Math.min(s.radius, hh / 2, s.w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, yy);
    ctx.arcTo(x + s.w, yy, x + s.w, yy + hh, r);
    ctx.arcTo(x + s.w, yy + hh, x, yy + hh, r);
    ctx.arcTo(x, yy + hh, x, yy, r);
    ctx.arcTo(x, yy, x + s.w, yy, r);
    ctx.closePath();
  };

  // 그림자 / 네온 발광
  ctx.save();
  ctx.shadowColor = s.glow ?? 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = s.glow ? 12 : 8;
  ctx.shadowOffsetY = s.glow ? 0 : 4;
  rr(y, s.h + s.lipH);
  ctx.fillStyle = s.lip || s.bottom;
  ctx.fill();
  ctx.restore();

  // 아래 두께 (눌리는 판)
  if (s.lipH > 0) {
    rr(y + s.lipH, s.h);
    ctx.fillStyle = s.lip;
    ctx.fill();
  }

  // 몸통 그라데이션
  const g = ctx.createLinearGradient(0, y, 0, y + s.h);
  g.addColorStop(0, s.top);
  g.addColorStop(1, s.bottom);
  rr(y, s.h);
  ctx.fillStyle = g;
  ctx.fill();

  // 위쪽 광택 — 몸통 위 절반에 흰 그라데이션
  if (s.gloss > 0) {
    ctx.save();
    rr(y, s.h);
    ctx.clip();
    const gl = ctx.createLinearGradient(0, y, 0, y + s.h * 0.55);
    gl.addColorStop(0, `rgba(255,255,255,${0.55 * s.gloss})`);
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x, y, s.w, s.h * 0.55);
    ctx.restore();
  }

  // 테두리 (몸통 + 두께를 한 덩어리로)
  ctx.lineWidth = s.borderW;
  ctx.strokeStyle = s.border;
  rr(y + s.borderW / 2, s.h + s.lipH - s.borderW);
  ctx.stroke();
  tex.refresh();
  return { key, originY, pad: PAD };
}

/** 구운 버튼 이미지의 몸통만 누르게 하는 히트 영역 (텍스처 왼쪽 위 기준) */
export function hitRect(pad: number, w: number, h: number): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(pad, pad, w, h);
}

// ── 눌리는 영역 규칙 ─────────────────────────────────────────────────────
// 아래 둘은 버튼마다 덧대지 말고 여기서 막는다. 점검 하네스(ddong-fx-work/button-audit)가
// 화면마다 버튼의 가운데·네 모서리를 실제로 눌러 확인한다.

/** 손가락으로 누르는 최소 크기 (px). 보이는 버튼이 이보다 작아도 눌리는 영역은 이만큼 */
export const MIN_TOUCH = 44;

/**
 * 보이는 크기 w×h 인 버튼의 눌리는 영역 — 모자라는 쪽만 가운데를 맞춰 MIN_TOUCH 까지 넓힌다.
 * 좌표는 **오브젝트 왼쪽 위 기준** (Phaser 가 포인터에 displayOrigin 을 더해 잰다)
 */
export function touchArea(w: number, h: number, min = MIN_TOUCH): Phaser.Geom.Rectangle {
  const tw = Math.max(w, min), th = Math.max(h, min);
  return new Phaser.Geom.Rectangle((w - tw) / 2, (h - th) / 2, tw, th);
}

/** Rectangle · Text · Zone 처럼 크기를 가진 오브젝트를 MIN_TOUCH 이상으로 눌리게 한다 */
export function setTouchInteractive<T extends Phaser.GameObjects.GameObject & { width: number; height: number }>(go: T): T {
  go.setInteractive({ hitArea: touchArea(go.width, go.height), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
  return go;
}

type Placed = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform
  & { displayOriginX: number; displayOriginY: number };

/**
 * 스크롤 목록 칸의 입력 설정 — area 중 **보이는 창(viewport, 화면 좌표) 안에 있는 부분만** 눌린다.
 *
 * Phaser 마스크는 그리기만 자르고 입력은 자르지 않는다. 그래서 목록을 내리면 창 밖으로 밀려나
 * 안 보이는 칸이 그 자리의 다른 버튼 위를 덮고 입력을 가로챈다 — 수집 화면 배너의
 * [장착] 버튼이 목록을 스크롤한 뒤로 안 눌리던 원인이다 (2026-10-07).
 */
export function clipToViewport(area: Phaser.Geom.Rectangle, viewport: Phaser.Geom.Rectangle): Phaser.Types.Input.InputConfiguration {
  const p = new Phaser.Math.Vector2();
  return {
    hitArea: area,
    useHandCursor: true,
    hitAreaCallback: (a: Phaser.Geom.Rectangle, x: number, y: number, go: Phaser.GameObjects.GameObject) => {
      if (!Phaser.Geom.Rectangle.Contains(a, x, y)) return false;
      const g = go as Placed;
      g.getWorldTransformMatrix().transformPoint(x - g.displayOriginX, y - g.displayOriginY, p);
      return Phaser.Geom.Rectangle.Contains(viewport, p.x, p.y);
    },
  };
}

/** 부드러운 원형 빛 (무대 조명·후광) — 흰색으로 굽고 tint 로 색을 준다 */
export function bakeRadialGlow(scene: Phaser.Scene, key: string, size: number): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return key;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.refresh();
  return key;
}

/**
 * 그림을 w×h 에 덮어 채워 자르고 둥근 모서리로 잘라 **한 번 굽는다** (radius ≥ 짧은 변/2 면 원).
 * 2배로 굽으니 setDisplaySize(w, h) 로 띄운다. 마스크 없이 둥글게 보이게 하는 용도.
 * focusY = 세로 초점 (0 위 ~ 1 아래). srcKey 가 없으면 굽지 않는다 — 호출하는 쪽이 대신 그림을 고른다
 */
export function bakeRoundedImage(
  scene: Phaser.Scene, key: string, srcKey: string, w: number, h: number, radius: number, focusY = 0.5,
): string {
  if (scene.textures.exists(key) || !scene.textures.exists(srcKey)) return key;
  const R = 2;
  const tex = scene.textures.createCanvas(key, Math.round(w * R), Math.round(h * R));
  if (!tex) return key;
  const ctx = tex.getContext();
  ctx.scale(R, R);
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
  ctx.clip();
  const src = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;
  const sc = Math.max(w / src.width, h / src.height);
  const sw = w / sc, sh = h / sc;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) * focusY, sw, sh, 0, 0, w, h);
  tex.refresh();
  return key;
}

/** 버튼 위를 지나가는 빛 띠 (비스듬한 흰 그라데이션) */
export function bakeShine(scene: Phaser.Scene, key: string, w: number, h: number): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return key;
}

/** 글자에 세로 그라데이션 채우기 (금빛 제목 등) */
export function gradientText(t: Phaser.GameObjects.Text, stops: [number, string][]): Phaser.GameObjects.Text {
  const g = t.context.createLinearGradient(0, 0, 0, t.height);
  for (const [at, c] of stops) g.addColorStop(at, c);
  return t.setFill(g);
}

/**
 * 버튼 반응 — 올리면 살짝 커지고, 누르면 눌렸다가 동작. 컨테이너 통째로 움직인다.
 * w·h = 몸통 크기 (컨테이너 가운데 기준). repeatable 이면 씬을 떠나지 않는 버튼이라 다시 누를 수 있다
 */
export function wireButton(
  scene: Phaser.Scene, box: Phaser.GameObjects.Container, w: number, h: number, onClick: () => void,
  repeatable = false,
): void {
  box.setSize(w, h);
  // 히트 영역은 **왼쪽 위 기준**이다 — Phaser 가 포인터 좌표에 displayOrigin(= 크기의 절반)을 더해서 잰다.
  // (-w/2, -h/2) 로 주면 눌리는 자리가 보이는 버튼보다 반 칸 왼쪽 위로 밀린다 (실기에서 짚인 버그)
  // 작은 버튼(필터 칩 · 배너의 장착 버튼 등)도 손가락 크기만큼은 눌리게 넓힌다 (touchArea)
  box.setInteractive(touchArea(w, h), Phaser.Geom.Rectangle.Contains);
  if (box.input) box.input.cursor = 'pointer';
  let busy = false;
  const to = (s: number, d = 90) => scene.tweens.add({ targets: box, scale: s, duration: d, ease: 'Quad.easeOut' });
  box.on('pointerover', () => { if (!busy) to(1.03); });
  box.on('pointerout', () => { if (!busy) to(1); });
  box.on('pointerdown', () => {
    if (busy) return;
    busy = true;
    scene.tweens.add({
      targets: box, scale: 0.96, duration: 70, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => { if (repeatable) busy = false; onClick(); },
    });
  });
}
