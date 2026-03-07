import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI, SpecialPoopType } from './types';
import { MINER_PARAMS } from '../config/abilityParams';

/**
 * 광부 (SR) — 무지개똥 + 수집 보너스
 * 수치: MINER_PARAMS 참조
 */
export class MinerAbility extends BaseAbility {
  private lastRainbowScore = 0;

  override onCollectSpecial(_type: SpecialPoopType): number {
    return MINER_PARAMS.specialBonus;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % MINER_PARAMS.rainbowInterval === 0 && score > this.lastRainbowScore) {
      this.lastRainbowScore = score;
      api.spawnRainbowPoop();
    }
  }
}
