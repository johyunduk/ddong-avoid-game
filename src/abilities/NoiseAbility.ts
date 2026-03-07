import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import { NOISE_PARAMS } from '../config/abilityParams';

/**
 * 노이즈 (SR) — 특수 똥 생성 주기 단축 / 점수마다 소환 감소
 * 수치: NOISE_PARAMS 참조
 */
export class NoiseAbility extends BaseAbility {
  private pendingReduction = 0;

  override getSpawnIntervals() {
    return {
      gold: NOISE_PARAMS.goldInterval,
      diamond: NOISE_PARAMS.diamondInterval,
      topaz: NOISE_PARAMS.topazInterval,
    };
  }

  override getSpawnCountReduction(): number {
    const r = this.pendingReduction;
    this.pendingReduction = 0;
    return r;
  }

  override onScoreMilestone(score: number, _api: GameSceneAPI): void {
    if (score % NOISE_PARAMS.reductionInterval === 0) {
      this.pendingReduction = NOISE_PARAMS.reductionAmount;
    }
  }
}
