import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';

/**
 * 루트 (SR)
 * - 기본 효과: 금·다이아똥 낙하 속도 감소 (수집하기 쉬워짐)
 * - 특수 능력: 150점마다 화면의 일반 똥 랜덤 4개 제거
 */
export class HackerAbility extends BaseAbility {
  private lastHackerScore = 0;

  override specialPoopSpeedReduction(_type: 'gold' | 'diamond'): number {
    return 40;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (!api.isClassicMode) return;
    if (score % 100 === 0 && score > this.lastHackerScore) {
      this.lastHackerScore = score;
      this.removeRandomPoops(7, api);
    }
  }

  private removeRandomPoops(count: number, api: GameSceneAPI): void {
    const active = api.poops
      .getChildren()
      .filter(p => (p as Phaser.GameObjects.GameObject).active) as Phaser.Physics.Arcade.Sprite[];

    active.sort(() => Math.random() - 0.5);
    active.slice(0, count).forEach(p => {
      (p.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.playTerminalEffect(p.x, p.y, api);
      p.destroy();
    });
  }

  /** 초록 테두리 검정 박스 flash → 픽셀 비산 */
  private playTerminalEffect(cx: number, cy: number, api: GameSceneAPI): void {
    const scene = api.scene;
    const BOX_W = 36, BOX_H = 36;

    // ── 1. 검정 박스 + 초록 테두리 ──────────────────────────────────
    const box = scene.add.graphics().setDepth(110);
    box.fillStyle(0x000000, 1);
    box.fillRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H);
    box.lineStyle(2, 0x00ff41, 1);
    box.strokeRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H);
    box.setPosition(cx, cy);

    // 짧게 flash 후 사라짐
    scene.tweens.add({
      targets: box,
      alpha: 0,
      duration: 180,
      delay: 60,
      onComplete: () => box.destroy(),
    });

    // ── 2. 초록 픽셀 파편 비산 ───────────────────────────────────────
    const PIXEL_COUNT = 10;
    const GREEN = 0x00ff41;

    for (let i = 0; i < PIXEL_COUNT; i++) {
      const size   = Phaser.Math.Between(4, 9);
      const angle  = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed  = Phaser.Math.FloatBetween(40, 110);
      const tx     = cx + Math.cos(angle) * speed;
      const ty     = cy + Math.sin(angle) * speed;

      const px = scene.add.graphics().setDepth(111);
      px.fillStyle(GREEN, 1);
      px.fillRect(0, 0, size, size);
      px.setPosition(cx, cy);

      scene.tweens.add({
        targets: px,
        x: tx,
        y: ty + Phaser.Math.Between(10, 30), // 중력감
        alpha: 0,
        duration: Phaser.Math.Between(250, 420),
        ease: 'Quad.easeOut',
        onComplete: () => px.destroy(),
      });
    }
  }
}
