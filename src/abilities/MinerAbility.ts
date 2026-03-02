import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI, SpecialPoopType } from './types';

/**
 * 광부 (SR)
 * - 기본 효과: 특수 똥 수집 시 +10점
 * - 특수 능력: 200점마다 무지개똥 생성
 */
export class MinerAbility extends BaseAbility {
  private lastRainbowScore = 0;

  override onCollectSpecial(_type: SpecialPoopType): number {
    return 10;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % 200 === 0 && score > this.lastRainbowScore) {
      this.lastRainbowScore = score;
      api.spawnRainbowPoop();
    }
  }
}
