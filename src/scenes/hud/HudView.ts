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
const POP_Y = 124;

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
  private fever?: { box: Phaser.GameObjects.Container; secs: Phaser.GameObjects.Text; lastSecs: number };

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

  /** 피버 알약 — 주황(FEVER TIME) / 분홍-보라(RAINBOW FEVER), 오른쪽에 남은 초 */
  showFever(rainbow: boolean, seconds: number) {
    this.hideFever();
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
    const badge = scene.add.graphics();
    badge.fillStyle(0x140a04, 0.85).fillRoundedRect(w / 2 - 54, -12, 44, 24, 12);
    box.add(badge);
    const secs = scene.add.text(w / 2 - 32, 0, `${seconds}초`, { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    box.add(secs);
    box.setScale(0.7);
    scene.tweens.add({ targets: box, scale: 1, duration: 220, ease: 'Back.easeOut' });
    // 레인보우는 숨 쉬듯 커졌다 작아진다 — 같은 자리라도 한눈에 갈린다
    if (rainbow) scene.tweens.add({ targets: box, scale: 1.06, duration: 320, yoyo: true, repeat: -1, delay: 240, ease: 'Sine.easeInOut' });
    this.fever = { box, secs, lastSecs: seconds };
  }

  /** 남은 초 — 바뀔 때만 */
  setFeverSeconds(seconds: number) {
    if (!this.fever || seconds === this.fever.lastSecs) return;
    this.fever.lastSecs = seconds;
    this.fever.secs.setText(`${seconds}초`);
  }

  hideFever() {
    if (!this.fever) return;
    this.scene.tweens.killTweensOf(this.fever.box);
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
