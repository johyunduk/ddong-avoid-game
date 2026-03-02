import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';

/**
 * 아카이브 (SR)
 * - 기본 효과: 점수 획득 속도 1.1배 (소수점 누적으로 정수 변환)
 * - 특수 능력: 200점마다 20점 보너스 추가
 */
export class ArchieveAbility extends BaseAbility {
  private lastArchieveScore = 0;
  private isProcessingBonus = false; // 재귀 방지 플래그
  private accum = 0; // 0.2 소수점 누적

  override getTickScore(base: number): number {
    this.accum += base * 0.1;
    const bonus = Math.floor(this.accum);
    this.accum -= bonus;
    return base + bonus;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    // 보너스로 인한 점수 증가가 다시 이 함수를 트리거하지 않도록 차단
    if (this.isProcessingBonus) return;
    if (score % 200 === 0 && score > this.lastArchieveScore) {
      this.lastArchieveScore = score;
      this.isProcessingBonus = true;
      api.updateScore(20);
      this.isProcessingBonus = false;
    }
  }
}
