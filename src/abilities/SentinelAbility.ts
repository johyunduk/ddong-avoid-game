import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';

/**
 * 센티넬 (UR)
 * - 기본 효과: 게임 시작 시 보호막 1개 보유 (피격 시 게임오버 대신 보호막 소멸)
 * - 특수 능력: 300점마다 보호막 1개 충전 (최대 3개), 화면 좌상단에 🛡️ UI 표시
 */
export class SentinelAbility extends BaseAbility {
  private shieldCount = 0;
  private shieldIcons: Phaser.GameObjects.Text[] = [];

  override onCreate(api: GameSceneAPI): void {
    this.shieldCount = 1;
    this.updateShieldUI(api);
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % 300 === 0) {
      this.shieldCount = Math.min(this.shieldCount + 1, 3);
      this.updateShieldUI(api);
    }
  }

  override onHitPoop(api: GameSceneAPI): boolean {
    if (this.shieldCount > 0) {
      this.shieldCount--;
      this.updateShieldUI(api);
      // 빨간 flash 연출
      api.scene.cameras.main.flash(200, 255, 0, 0, true);
      return true; // 게임오버 방지
    }
    return false;
  }

  private updateShieldUI(api: GameSceneAPI): void {
    this.shieldIcons.forEach(t => t.destroy());
    this.shieldIcons = [];
    for (let i = 0; i < this.shieldCount; i++) {
      const icon = api.scene.add
        .text(10 + i * 28, 34, '🛡️', { fontSize: '20px' })
        .setDepth(200);
      this.shieldIcons.push(icon);
    }
  }
}
