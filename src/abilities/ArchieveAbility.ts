import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';

/**
 * 아카이브 (SR) — 점수 1.10배 / 200점마다 +20점
 */
export class ArchieveAbility extends BaseAbility {
  private lastArchieveScore = 0;
  private isProcessingBonus = false;
  private accum = 0;

  override getTickScore(base: number): number {
    this.accum += base * 0.10;
    const bonus = Math.floor(this.accum);
    this.accum -= bonus;
    return base + bonus;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (this.isProcessingBonus) return;
    if (score % 200 === 0 && score > this.lastArchieveScore) {
      this.lastArchieveScore = score;
      this.isProcessingBonus = true;
      api.updateScore(20);
      this.isProcessingBonus = false;
    }
  }
}
