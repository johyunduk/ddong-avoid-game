import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import { ARCHIEVE_PARAMS } from '../config/abilityParams';

/**
 * 아카이브 (SR) — 점수 배율 / 점수마다 보너스
 * 수치: ARCHIEVE_PARAMS 참조
 */
export class ArchieveAbility extends BaseAbility {
  private lastArchieveScore = 0;
  private isProcessingBonus = false;
  private accum = 0;

  override getTickScore(base: number): number {
    this.accum += base * ARCHIEVE_PARAMS.scoreMultiplierExtra;
    const bonus = Math.floor(this.accum);
    this.accum -= bonus;
    return base + bonus;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (this.isProcessingBonus) return;
    if (score % ARCHIEVE_PARAMS.bonusInterval === 0 && score > this.lastArchieveScore) {
      this.lastArchieveScore = score;
      this.isProcessingBonus = true;
      api.addAbilityBonus(ARCHIEVE_PARAMS.bonusScore);
      this.isProcessingBonus = false;
    }
  }
}
