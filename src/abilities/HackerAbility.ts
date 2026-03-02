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
    if (score % 150 === 0 && score > this.lastHackerScore) {
      this.lastHackerScore = score;
      this.removeRandomPoops(4, api);
    }
  }

  private removeRandomPoops(count: number, api: GameSceneAPI): void {
    const active = api.poops
      .getChildren()
      .filter(p => (p as Phaser.GameObjects.GameObject).active) as Phaser.Physics.Arcade.Sprite[];
    // 랜덤 셔플 후 앞 N개 터미널 붕괴 연출로 제거
    active.sort(() => Math.random() - 0.5);
    active.slice(0, count).forEach(p => {
      // 물리 정지 (애니메이션 중 계속 떨어지지 않도록)
      (p.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      p.setTint(0x00ff41); // 터미널 초록색
      api.scene.tweens.add({
        targets: p,
        alpha: 0,
        scaleY: 0.05, // 세로로 납작해지며 사라짐
        duration: 250,
        ease: 'Power2',
        onComplete: () => { if (p.active) p.destroy(); },
      });
    });
  }
}
