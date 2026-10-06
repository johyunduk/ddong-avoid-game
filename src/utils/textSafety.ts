import Phaser from 'phaser';

/**
 * 글자 윗부분·그림자가 Text 텍스처 경계에서 잘리는 문제를 **한 곳에서** 막는다.
 *
 * Phaser 는 줄 높이를 `testString`('|MÉqgy') 의 잉크 상자로 잰다 (MeasureText). 그런데
 *   - 한글·이모지·굵은 글자는 그 상자보다 위아래로 넘친다. 기본 글꼴(Courier, 한글은 대체 글꼴)에서
 *     위로 최대 0.15em, monospace 는 아래로 0.19em (Edge 실측 — ddong-fx-work/text-clip/measure.html).
 *     휴대폰 글꼴은 더 넘칠 수 있다
 *   - 그림자(shadowOffset·blur)는 텍스처 크기에 아예 안 들어간다 (외곽선 stroke 는 들어간다)
 * 텍스처 경계 = 줄 상자라서 넘친 잉크가 잘린다 — 첫 줄 위 · 마지막 줄 아래 · 그림자 쪽.
 *
 * 처방 (모든 Text 공통, main.ts 에서 게임을 만들기 전에 installTextSafety 한 번):
 *   1. 그려지기 직전(updateText) 글자 크기에 비례한 **최소 여백**을 텍스처에 보장한다 —
 *      위·아래 ceil(0.2em)+1, 그림자는 그 방향으로 offset+blur. 사람이 준 padding 이 더 크면 그 값
 *   2. 그렇게 **더한 몫만큼 표시 원점을 보정**한다 (updateDisplayOrigin) — 텍스처만 넓어지고
 *      글자는 화면에서 원래 자리에 그대로 있다. origin(0,0)·(0.5)·(1) 어느 쪽이든 배치가 안 바뀐다
 * 각 씬에서 `padding: { top: N }` 를 덧대던 것은 이걸로 대신한다 (위만 덧대면 가운데 정렬 글자가 아래로 밀렸다).
 * fixedWidth/fixedHeight 를 준 축은 건드리지 않는다 (글자 영역이 줄어든다)
 */
const V_EM = 0.2;

type Pad = { left: number; right: number; top: number; bottom: number };

/** 이 스타일에 필요한 최소 여백 (px) */
export function textSafePadding(style: Phaser.GameObjects.TextStyle): Pad {
  const px = typeof style.fontSize === 'number' ? style.fontSize : parseFloat(String(style.fontSize)) || 16;
  const v = Math.ceil(px * V_EM) + 1;
  const pad: Pad = { left: 0, right: 0, top: v, bottom: v };
  if ((style.shadowFill || style.shadowStroke) && style.shadowColor) {
    const blur = Math.ceil(style.shadowBlur || 0);
    const sx = style.shadowOffsetX || 0;
    const sy = style.shadowOffsetY || 0;
    pad.left = Math.ceil(Math.max(0, -sx)) + blur;
    pad.right = Math.ceil(Math.max(0, sx)) + blur;
    pad.top += Math.ceil(Math.max(0, -sy)) + blur;
    pad.bottom += Math.ceil(Math.max(0, sy)) + blur;
  }
  // 기울임은 마지막 글자 꼬리가 오른쪽으로 나간다
  if (/italic|oblique/i.test(style.fontStyle || '')) pad.right = Math.max(pad.right, Math.ceil(px * 0.15));
  if (style.fixedWidth > 0) { pad.left = 0; pad.right = 0; }
  if (style.fixedHeight > 0) { pad.top = 0; pad.bottom = 0; }
  return pad;
}

/** Text 마다 붙여 두는 값 — 사람이 준 padding · 그 위에 더한 몫 */
interface SafeText extends Phaser.GameObjects.Text {
  __userPad?: Pad;
  __autoPad?: Pad;
}

let installed = false;

export function installTextSafety(): void {
  if (installed) return;
  installed = true;
  const proto = Phaser.GameObjects.Text.prototype as unknown as {
    updateText: (this: SafeText) => Phaser.GameObjects.Text;
    setPadding: (this: SafeText, ...a: unknown[]) => Phaser.GameObjects.Text;
    updateDisplayOrigin: (this: SafeText) => Phaser.GameObjects.Text;
  };

  const updateText = proto.updateText;
  proto.updateText = function (this: SafeText) {
    // 처음 그릴 때의 padding 이 사람이 준 값이다 (생성자가 style.padding 을 넣은 뒤 updateText 를 부른다)
    const p0 = this.padding;
    const user = this.__userPad
      ?? (this.__userPad = { left: p0.left ?? 0, right: p0.right ?? 0, top: p0.top ?? 0, bottom: p0.bottom ?? 0 });
    const need = textSafePadding(this.style);
    const p = this.padding;
    p.left = Math.max(user.left, need.left);
    p.right = Math.max(user.right, need.right);
    p.top = Math.max(user.top, need.top);
    p.bottom = Math.max(user.bottom, need.bottom);
    this.__autoPad = { left: p.left - user.left, right: p.right - user.right, top: p.top - user.top, bottom: p.bottom - user.bottom };
    return updateText.call(this);
  };

  // 사람이 나중에 padding 을 바꾸면 그게 새 기준이다
  const setPadding = proto.setPadding;
  proto.setPadding = function (this: SafeText, ...a: unknown[]) {
    this.__userPad = undefined;
    this.padding.left = this.padding.right = this.padding.top = this.padding.bottom = 0;
    return setPadding.apply(this, a);
  };

  // 더한 여백만큼 원점을 옮겨 글자의 화면 자리를 그대로 둔다:
  //   원래 원점 = origin × (크기 − 더한 몫) 이고, 글자는 텍스처 안에서 '더한 앞쪽 몫' 만큼 밀려 그려진다
  const updateDisplayOrigin = proto.updateDisplayOrigin;
  proto.updateDisplayOrigin = function (this: SafeText) {
    updateDisplayOrigin.call(this);
    const a = this.__autoPad;
    if (a) {
      const self = this as unknown as { _displayOriginX: number; _displayOriginY: number };
      self._displayOriginX += a.left - this.originX * (a.left + a.right);
      self._displayOriginY += a.top - this.originY * (a.top + a.bottom);
    }
    return this;
  };
}

/**
 * 글자 상자 크기 — 여백(installTextSafety 가 더한 몫)을 뺀 원래 height/width.
 * 글자를 쌓거나 나란히 놓을 때는 text.height/width 대신 이걸 쓴다 (더한 여백만큼 벌어지지 않게)
 */
export function textContentHeight(t: Phaser.GameObjects.Text): number {
  const a = (t as SafeText).__autoPad;
  return t.height - (a ? a.top + a.bottom : 0);
}

export function textContentWidth(t: Phaser.GameObjects.Text): number {
  const a = (t as SafeText).__autoPad;
  return t.width - (a ? a.left + a.right : 0);
}
