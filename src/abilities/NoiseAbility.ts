import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';

/**
 * 노이즈 (SR)
 * - 기본 효과: 특수 똥 생성 주기 단축 (금 40→30점, 다이아 100→75점, 토파즈 180→135점)
 * - 특수 능력: 200점마다 다음 똥 소환 시 2개 적게 소환 (최소 1개)
 */
export class NoiseAbility extends BaseAbility {
  private pendingReduction = 0;

  override getSpawnIntervals() {
    return { gold: 30, diamond: 75, topaz: 135 };
  }

  /** 다음 소환 시 줄일 개수 반환 후 즉시 리셋 (소비형 카운터) */
  override getSpawnCountReduction(): number {
    const r = this.pendingReduction;
    this.pendingReduction = 0;
    return r;
  }

  override onScoreMilestone(score: number, _api: GameSceneAPI): void {
    if (score % 200 === 0) {
      this.pendingReduction = 2;
    }
  }
}
