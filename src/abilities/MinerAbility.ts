import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI, SpecialPoopType } from './types';

/**
 * 광부 (SR) — 무지개똥 + 수집 보너스
 * 특수 똥 수집 시 +10점 / 200점마다 무지개똥 스폰
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
