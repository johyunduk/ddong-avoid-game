import Phaser from 'phaser';
import { bakeButton } from '../../utils/buttonSkin';

/**
 * 게임 중 위쪽 HUD (C안 — 2026-10-07 대표 채택). 위 60px 안에서 끝낸다.
 *
 *   왼쪽  점수 알약 (보라)
 *   오른쪽 최고 알약 (금 테) — EXTREME 이면 아래 줄에 캐릭터 최고. 이번 판 시작 때 최고를 넘기면 금빛 판으로 뒤집힌다
 *   그 아래 화면 폭의 얇은 진행선 — 시작 때 최고 대비 지금 점수
 *   피버: 위 가장자리 아래 주황 알약 (「FEVER TIME」 + 남은 초). 레인보우 피버는 같은 자리 분홍-보라 알약
 *   특수똥 획득 글자는 그 바로 아래
 *
 * **성능** — 매 프레임 불리는 것은 없다. 점수가 바뀔 때만 setScore (글자는 값이 달라질 때만 setText),
 * 진행선은 Graphics 를 다시 그리지 않고 막대의 scaleX 만 바꾼다. 판은 buttonSkin 으로 한 번 굽는다.
 */

const DEPTH = 10;
/** 위 HUD 가 끝나는 y — 그 아래에 안내 · 시너지 뱃지 · 컷인을 놓는다 */
export const HUD_BOTTOM = 62;
const PILL_Y = 30, PILL_H = 40;
const BAR_Y = 58, BAR_H = 4;
const FEVER_Y = 88;
/**
 * 획득 글자 — 피버 로고 아래. FEVER 간판은 불꽃까지 높이 90 (43~133)이라 예전 자리(124)면 '+40' 을 덮는다.
 * 로고를 줄이면 간판 글자가 작아져서, 로고는 시안 크기 그대로 두고 획득 글자를 22px 내렸다
 */
const POP_Y = 146;

/**
 * 피버 로고 시트 (A안 간판형, 2026-10-07 대표 채택) — 칸 2열 10칸, 표시는 칸의 1/2.
 * 0~5 등장(20fps, 처음 두 칸 흰 글로우) → 6~9 반복(8fps). 남은 초는 게임 글자로 판 안 숫자 자리(slot)에 얹는다
 * (시트 원본·좌표: ddong-fx-work/fever-logo/sheets.json)
 */
const FEVER_LOGO = {
  fever:   { key: 'feverlogo_fever',   path: 'assets/fx/sheets/feverlogo_fever_500x180.png',   fw: 500, fh: 180, stroke: '#3a0a00' },
  rainbow: { key: 'feverlogo_rainbow', path: 'assets/fx/sheets/feverlogo_rainbow_500x148.png', fw: 500, fh: 148, stroke: '#2a0a4a' },
} as const;
const LOGO_SCALE = 0.5;
const LOGO_SLOT = { x: 0.835, y: 0.62 };

/**
 * 남은 초 숫자 시트 (v2 — 로고 결에 맞춘 불타는 숫자 · 무지개 숫자, 2026-10-08 대표 지시). 열 = 숫자 0~9, 행 = 반복 칸.
 * origin = 숫자 몸통 아래 가운데. advance = 칸 원본 기준 글자 간격 (두 자리일 때)
 * (원본 · 기준점: ddong-fx-work/fever-logo/v2/sheets.json)
 */
const FEVER_DIGITS = {
  fever:   { key: 'feverdigits_fever',   path: 'assets/fx/sheets/feverdigits_fever_88x94.png',    fw: 88,  fh: 94, rows: 2, fps: 6,  ox: 0.4545, oy: 0.9362, adv: 71.4 },
  rainbow: { key: 'feverdigits_rainbow', path: 'assets/fx/sheets/feverdigits_rainbow_108x90.png', fw: 108, fh: 90, rows: 6, fps: 10, ox: 0.4907, oy: 0.9333, adv: 84.4 },
} as const;
/**
 * 숫자 배율 — 칸 원본 대비. 0.36 이면 높이 약 34px (불꽃) · 32px (무지개) — A 판의 숫자 칸에 들어가는 크기.
 * 3·2·1 에 2.1 배로 튀면 잠깐 판 위로 솟지만 아래 획득 글자(POP_Y)와는 멀다
 */
const DIGIT_SCALE = 0.36;
/** 숫자가 바뀔 때 튀기 (sheets.json countdown_pop) — 3·2·1 은 더 크게 + 흰 번쩍 + 숫자만 2px 흔들림 */
const POP = {
  normal: { from: 1.5, ms: 180 },
  last3:  { from: 2.1, ms: 260, flashMs: 90, shakePx: 2 },
} as const;

export interface HudOptions {
  /** 이번 판 시작 때 최고 (이번 시즌) */
  best: number;
  /** EXTREME 캐릭터 최고 줄 — 이름과 시작 때 값. EXTREME 이 아니면 없음 */
  char?: { name: string; best: number };
}

export class HudView {
  private readonly scene: Phaser.Scene;
  private readonly bestAtStart: number;
  private scoreValue!: Phaser.GameObjects.Text;
  private bestLabel!: Phaser.GameObjects.Text;
  private bestValue!: Phaser.GameObjects.Text;
  private charLine?: Phaser.GameObjects.Text;
  private bestPlate!: Phaser.GameObjects.Image;
  private recordPlate!: Phaser.GameObjects.Image;
  private barFill!: Phaser.GameObjects.Rectangle;
  private record = false;
  private lastScoreText = '';
  private lastBestText = '';
  private lastBarScale = -1;
  private charName = '';
  private charBest = 0;
  private fever?: {
    box: Phaser.GameObjects.Container;
    /** 남은 초 — 숫자 시트가 있으면 숫자 스프라이트 묶음, 없으면 게임 글자 */
    secs: Phaser.GameObjects.Container | Phaser.GameObjects.Text;
    lastSecs: number;
    sprite?: Phaser.GameObjects.Sprite;
    digits?: (typeof FEVER_DIGITS)['fever' | 'rainbow'];
    slot?: { x: number; y: number };
  };

  /**
   * 피버 로고 시트 올리기 — GameScene.preload 에서. 판마다 쓰는 공통 텍스처라 한 번 올리면 둔다 (캐릭터 몫이 아니다).
   * 레인보우 피버가 없는 판(시너지 없음)에는 레인보우 시트를 올리지 않는다
   */
  static preload(scene: Phaser.Scene, withRainbow: boolean) {
    for (const k of withRainbow ? ['fever', 'rainbow'] as const : ['fever'] as const) {
      const L = FEVER_LOGO[k];
      if (!scene.textures.exists(L.key)) scene.load.spritesheet(L.key, L.path, { frameWidth: L.fw, frameHeight: L.fh });
      const D = FEVER_DIGITS[k];
      if (!scene.textures.exists(D.key)) scene.load.spritesheet(D.key, D.path, { frameWidth: D.fw, frameHeight: D.fh });
    }
  }

  constructor(scene: Phaser.Scene, opts: HudOptions) {
    this.scene = scene;
    this.bestAtStart = opts.best;
    if (opts.char) { this.charName = opts.char.name; this.charBest = opts.char.best; }
    this.build(!!opts.char);
  }

  private build(withChar: boolean) {
    const { scene } = this;
    const W = scene.scale.width;

    // 점수 알약 (왼쪽)
    const sw = Math.min(170, Math.round(W * 0.38));
    const sp = bakeButton(scene, `hud_score_${sw}`, {
      w: sw, h: PILL_H, radius: PILL_H / 2, top: '#5a24a8', bottom: '#1e0a40', border: '#c9a0ff', borderW: 2, lip: '#12062a', lipH: 3, gloss: 0,
    });
    scene.add.image(12 + sw / 2, PILL_Y, sp.key).setOrigin(0.5, sp.originY).setDepth(DEPTH);
    scene.add.text(26, PILL_Y, '점수', { fontSize: '12px', color: '#d9c6f0', fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(DEPTH + 1);
    this.scoreValue = scene.add.text(60, PILL_Y, '0', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold', stroke: '#1e0a40', strokeThickness: 4,
    }).setOrigin(0, 0.5).setDepth(DEPTH + 1);

    // 최고 알약 (오른쪽) — 평소 판 / 신기록 판 둘 다 구워 두고 보이기만 바꾼다
    const bw = 150, bx = W - 12 - bw / 2;
    const bp = bakeButton(scene, 'hud_best', {
      w: bw, h: PILL_H, radius: 16, top: '#2a2010', bottom: '#0e0a04', border: '#ffd34d', borderW: 2, lip: '#000000', lipH: 3, gloss: 0,
    });
    const rp = bakeButton(scene, 'hud_best_record', {
      w: bw, h: PILL_H, radius: 16, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 2, lip: '#a8650a', lipH: 3, gloss: 0,
      glow: 'rgba(255,200,80,0.8)',
    });
    this.bestPlate = scene.add.image(bx, PILL_Y, bp.key).setOrigin(0.5, bp.originY).setDepth(DEPTH);
    this.recordPlate = scene.add.image(bx, PILL_Y, rp.key).setOrigin(0.5, rp.originY).setDepth(DEPTH).setVisible(false);
    this.bestLabel = scene.add.text(W - 12 - bw + 14, PILL_Y, '최고', { fontSize: '12px', color: '#ffe9a8', fontStyle: 'bold' })
      .setOrigin(0, 0.5).setDepth(DEPTH + 1);
    this.bestValue = scene.add.text(W - 26, withChar ? PILL_Y - 7 : PILL_Y, '', {
      fontSize: withChar ? '17px' : '19px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(1, 0.5).setDepth(DEPTH + 1);
    if (withChar) {
      this.charLine = scene.add.text(W - 26, PILL_Y + 11, '', { fontSize: '11px', color: '#aaddff', fontStyle: 'bold' })
        .setOrigin(1, 0.5).setDepth(DEPTH + 1);
    }

    // 진행선 — 트랙 + 막대(scaleX 만 바꾼다)
    const bw2 = W - 28;
    scene.add.rectangle(14, BAR_Y, bw2, BAR_H, 0x000000, 0.4).setOrigin(0, 0.5).setDepth(DEPTH);
    this.barFill = scene.add.rectangle(14, BAR_Y, bw2, BAR_H, 0xffd34d, 1).setOrigin(0, 0.5).setDepth(DEPTH + 1).setScale(0, 1);

    this.setScore(0);
  }

  /** 점수가 바뀔 때 — 글자는 값이 달라질 때만, 진행선은 1% 단위로 바뀔 때만 */
  setScore(score: number) {
    const st = score.toLocaleString();
    if (st !== this.lastScoreText) { this.scoreValue.setText(st); this.lastScoreText = st; }

    if (!this.record && this.bestAtStart > 0 && score > this.bestAtStart) {
      // 시작 때 최고를 넘었다 — 금빛 판으로 뒤집는다
      this.record = true;
      this.bestPlate.setVisible(false);
      this.recordPlate.setVisible(true);
      this.bestLabel.setText('신기록').setColor('#5b2e0e');
      this.bestValue.setColor('#3a1d00');
      this.charLine?.setColor('#5b2e0e');
      this.scene.tweens.add({ targets: this.recordPlate, scale: { from: 1.15, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    }
    const bt = Math.max(this.bestAtStart, this.record ? score : 0).toLocaleString();
    if (bt !== this.lastBestText) { this.bestValue.setText(bt); this.lastBestText = bt; }

    if (this.charLine) {
      if (score > this.charBest) this.charBest = score;
      const ct = `${this.charName} ${this.charBest.toLocaleString()}`;
      if (ct !== this.charLine.text) this.charLine.setText(ct);
    }

    const k = this.bestAtStart > 0 ? Math.min(1, score / this.bestAtStart) : 1;
    const q = Math.round(k * 100) / 100;
    if (q !== this.lastBarScale) { this.barFill.setScale(q, 1); this.lastBarScale = q; }
  }

  // ── 피버 ────────────────────────────────────────────────────────────

  /**
   * 피버 로고 — 간판 시트가 등장(0~5) 뒤 반복(6~9)하고, 남은 초를 판 안 숫자 자리에 얹는다.
   * 애니메이션은 처음 한 번 만들어 두고(전역) 피버마다 스프라이트만 새로 만든다 — 텍스처는 판 내내 한 장
   */
  showFever(rainbow: boolean, seconds: number) {
    this.hideFever();
    const { scene } = this;
    const L = FEVER_LOGO[rainbow ? 'rainbow' : 'fever'];
    if (!scene.textures.exists(L.key)) { this.showFeverPill(rainbow, seconds); return; }   // 시트를 못 받았으면 알약으로
    const intro = `${L.key}_intro`, loop = `${L.key}_loop`;
    if (!scene.anims.exists(intro)) {
      scene.anims.create({ key: intro, frames: scene.anims.generateFrameNumbers(L.key, { start: 0, end: 5 }), frameRate: 20, repeat: 0 });
    }
    if (!scene.anims.exists(loop)) {
      scene.anims.create({ key: loop, frames: scene.anims.generateFrameNumbers(L.key, { start: 6, end: 9 }), frameRate: 8, repeat: -1 });
    }
    const cx = scene.scale.width / 2;
    const dw = L.fw * LOGO_SCALE, dh = L.fh * LOGO_SCALE;
    const box = scene.add.container(cx, FEVER_Y).setDepth(DEPTH + 2);
    const sprite = scene.add.sprite(0, 0, L.key, 0).setScale(LOGO_SCALE);
    sprite.play(intro);
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { if (sprite.active) sprite.play(loop); });
    box.add(sprite);
    // 남은 초 — 판 안 숫자 자리. 숫자 시트가 있으면 로고 결 숫자 스프라이트, 없으면 게임 글자
    const slot = { x: -dw / 2 + LOGO_SLOT.x * dw, y: -dh / 2 + LOGO_SLOT.y * dh };
    const D = FEVER_DIGITS[rainbow ? 'rainbow' : 'fever'];
    let secs: Phaser.GameObjects.Container | Phaser.GameObjects.Text;
    if (scene.textures.exists(D.key)) {
      this.ensureDigitAnims(D);
      secs = this.makeDigits(D, slot, seconds);
    } else {
      secs = scene.add.text(slot.x, slot.y, String(seconds), {
        fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: L.stroke, strokeThickness: 6,
      }).setOrigin(0.5);
    }
    box.add(secs);
    this.fever = { box, secs, lastSecs: seconds, sprite, digits: scene.textures.exists(D.key) ? D : undefined, slot };
  }

  /** 숫자마다 반복 애니메이션 (그 숫자 열의 행들) — 처음 한 번 만들어 두고 다음 피버도 쓴다 */
  private ensureDigitAnims(D: (typeof FEVER_DIGITS)['fever' | 'rainbow']) {
    const { anims } = this.scene;
    for (let d = 0; d <= 9; d++) {
      const key = `${D.key}_${d}`;
      if (anims.exists(key)) continue;
      const frames = Array.from({ length: D.rows }, (_, r) => ({ key: D.key, frame: r * 10 + d }));
      anims.create({ key, frames, frameRate: D.fps, repeat: -1 });
    }
  }

  /**
   * 숫자 묶음 — 묶음의 원점이 숫자 몸통 아래 가운데라서, 튈 때 숫자 자리에 발을 붙인 채 위로 커진다.
   * 묶음을 숫자 칸 가운데보다 몸통 높이의 절반만큼 아래에 놓는다
   */
  private makeDigits(D: (typeof FEVER_DIGITS)['fever' | 'rainbow'], slot: { x: number; y: number }, n: number) {
    const bodyH = D.fh * D.oy * DIGIT_SCALE;
    const box = this.scene.add.container(slot.x, slot.y + bodyH / 2);
    this.fillDigits(box, D, n);
    return box;
  }

  private fillDigits(box: Phaser.GameObjects.Container, D: (typeof FEVER_DIGITS)['fever' | 'rainbow'], n: number) {
    box.removeAll(true);
    const str = String(n), step = D.adv * DIGIT_SCALE;
    [...str].forEach((ch, i) => {
      const x = (i - (str.length - 1) / 2) * step;
      const sp = this.scene.add.sprite(x, 0, D.key, Number(ch)).setOrigin(D.ox, D.oy).setScale(DIGIT_SCALE);
      sp.play(`${D.key}_${ch}`);
      box.add(sp);
    });
  }

  /** 시트가 없을 때 대신 — 예전 알약 (주황 / 분홍-보라) */
  private showFeverPill(rainbow: boolean, seconds: number) {
    const { scene } = this;
    const cx = scene.scale.width / 2;
    const w = rainbow ? 236 : 200, h = 38;
    const skin = bakeButton(scene, rainbow ? 'hud_fever_rainbow' : 'hud_fever', rainbow
      ? { w, h, radius: h / 2, top: '#ff8ae6', bottom: '#7a3cff', border: '#ffffff', borderW: 2.5, lip: '#3a1a7a', lipH: 3, gloss: 0, glow: 'rgba(255,120,240,0.85)' }
      : { w, h, radius: h / 2, top: '#ffb35a', bottom: '#ff5a1a', border: '#5a1a00', borderW: 2.5, lip: '#8a2a00', lipH: 3, gloss: 0, glow: 'rgba(255,140,40,0.75)' });
    const box = scene.add.container(cx, FEVER_Y).setDepth(DEPTH + 2);
    box.add(scene.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
    box.add(scene.add.text(-22, 0, rainbow ? 'RAINBOW FEVER' : 'FEVER TIME', {
      fontSize: '18px', color: '#fff6c8', fontStyle: 'bold', stroke: rainbow ? '#3a1a7a' : '#5a1a00', strokeThickness: 5,
    }).setOrigin(0.5));
    const secs = scene.add.text(w / 2 - 32, 0, String(seconds), { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    box.add(secs);
    this.fever = { box, secs, lastSecs: seconds };
  }

  /**
   * 남은 초 — 바뀔 때만. 1.5 → 1.0 (180ms) 으로 튄다.
   * 3·2·1 은 2.1 → 1.0 (260ms) + 흰 번쩍(90ms) + 숫자만 좌우 2px 흔들림 — 화면은 흔들지 않는다
   */
  setFeverSeconds(seconds: number) {
    const f = this.fever;
    if (!f || seconds === f.lastSecs) return;
    f.lastSecs = seconds;
    const t = f.secs;
    const last3 = seconds <= 3 && seconds >= 1 && !!f.digits;
    if (t instanceof Phaser.GameObjects.Text) t.setText(String(seconds));
    else if (f.digits) this.fillDigits(t, f.digits, seconds);
    this.scene.tweens.killTweensOf(t);
    const pop = last3 ? POP.last3 : POP.normal;
    t.setScale(pop.from);
    this.scene.tweens.add({ targets: t, scale: 1, duration: pop.ms, ease: 'Back.easeOut' });
    if (last3 && t instanceof Phaser.GameObjects.Container && f.slot) {
      // 흰 번쩍 — 숫자를 통째로 흰색으로 칠하면 불꽃 번짐까지 흰 덩어리가 돼 숫자가 안 읽힌다.
      // 같은 칸을 흰색으로 더해(ADD) 얹고 90ms 동안 걷어 낸다
      for (const sp of [...t.list] as Phaser.GameObjects.Sprite[]) {
        const fl = this.scene.add.image(sp.x, sp.y, sp.texture.key, sp.frame.name).setOrigin(sp.originX, sp.originY)
          .setScale(sp.scaleX).setTintFill(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
        t.add(fl);
        this.scene.tweens.add({ targets: fl, alpha: 0, duration: POP.last3.flashMs, onComplete: () => fl.destroy() });
      }
      const x0 = f.slot.x;
      t.setX(x0);
      this.scene.tweens.add({ targets: t, x: { from: x0 - POP.last3.shakePx, to: x0 + POP.last3.shakePx }, duration: 35, yoyo: true, repeat: 2,
        onComplete: () => { if (t.active) t.setX(x0); } });
    }
  }

  /** 피버 끝 — 스프라이트 · 글자 · 트윈 정리 (텍스처와 전역 애니메이션은 다음 피버가 다시 쓴다) */
  hideFever() {
    if (!this.fever) return;
    this.scene.tweens.killTweensOf(this.fever.secs);
    this.fever.sprite?.stop();
    // 숫자 스프라이트는 묶음과 같이 부서진다 (애니메이션도 같이 멈춘다)
    this.fever.box.destroy();
    this.fever = undefined;
  }

  /** 특수똥 획득 — 피버 알약 바로 아래에 아이콘 + 점수, 떠오르며 사라진다 */
  popSpecial(textureKey: string, label: string, color: string) {
    const { scene } = this;
    const cx = scene.scale.width / 2;
    const box = scene.add.container(cx, POP_Y).setDepth(DEPTH + 2);
    const t = scene.add.text(12, 0, label, {
      fontSize: '20px', color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0, 0.5);
    box.add(t);
    if (scene.textures.exists(textureKey)) box.add(scene.add.image(-4, 0, textureKey).setDisplaySize(24, 24));
    box.setX(cx - (t.width + 16) / 2 + 8);
    scene.tweens.add({ targets: box, y: POP_Y - 14, alpha: { from: 1, to: 0 }, duration: 1000, delay: 250, ease: 'Quad.easeIn',
      onComplete: () => box.destroy() });
  }
}
