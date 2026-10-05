import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { HACKER_PARAMS } from '../config/abilityParams';

/**
 * 루트 (SR) — 터미널 삭제
 * 수치: HACKER_PARAMS 참조
 */
export class HackerAbility extends BaseAbility {
  private lastHackerScore = 0;

  override specialPoopSpeedReduction(_type: 'gold' | 'diamond'): number {
    return HACKER_PARAMS.specialPoopSlowdown;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    // **자기 보너스로 들어온 마일스톤은 삼킨다** (레드·테드·하이디와 같은 규칙). 삭제 점수가
    // 생기면서 보너스 한 번이 발동 간격을 넘길 수 있게 됐다 — 이 줄이 없으면 발동이 연쇄로 번진다
    if (this.awarding) return;
    if (score % HACKER_PARAMS.deleteInterval === 0 && score > this.lastHackerScore) {
      this.lastHackerScore = score;
      this.removeRandomPoops(HACKER_PARAMS.deleteCount, api);
    }
  }

  private removeRandomPoops(count: number, api: GameSceneAPI): void {
    const active = api.poops
      .getChildren()
      .filter(p => (p as Phaser.GameObjects.GameObject).active) as Phaser.Physics.Arcade.Sprite[];

    active.sort(() => Math.random() - 0.5);
    const picked = active.slice(0, count);
    picked.forEach(p => {
      this.playTerminalEffect(p.x, p.y, api);
      (p as PoolablePoopBase).recycle();
    });
    this.awardBonus(api, picked.length * HACKER_PARAMS.deletePoints);
  }

  /** 초록 테두리 검정 박스 flash → 픽셀 비산 */
  private playTerminalEffect(cx: number, cy: number, api: GameSceneAPI): void {
    const scene = api.scene;
    const BOX_W = 36, BOX_H = 36;

    const box = scene.add.graphics().setDepth(110);
    box.fillStyle(0x000000, 1);
    box.fillRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H);
    box.lineStyle(2, 0x00ff41, 1);
    box.strokeRect(-BOX_W / 2, -BOX_H / 2, BOX_W, BOX_H);
    box.setPosition(cx, cy);

    scene.tweens.add({
      targets: box,
      alpha: 0,
      duration: 180,
      delay: 60,
      onComplete: () => box.destroy(),
    });

    const PIXEL_COUNT = 6;
    const GREEN = 0x00ff41;

    for (let i = 0; i < PIXEL_COUNT; i++) {
      const size  = Phaser.Math.Between(4, 9);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.FloatBetween(40, 110);
      const tx    = cx + Math.cos(angle) * speed;
      const ty    = cy + Math.sin(angle) * speed;

      const px = scene.add.graphics().setDepth(111);
      px.fillStyle(GREEN, 1);
      px.fillRect(0, 0, size, size);
      px.setPosition(cx, cy);

      scene.tweens.add({
        targets: px,
        x: tx,
        y: ty + Phaser.Math.Between(10, 30),
        alpha: 0,
        duration: Phaser.Math.Between(250, 420),
        ease: 'Quad.easeOut',
        onComplete: () => px.destroy(),
      });
    }
  }
}
