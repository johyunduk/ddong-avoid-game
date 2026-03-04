import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';

/**
 * 노이즈 (SR) — 특수 똥 생성 25% 단축 / 200점마다 소환 -2개
 */
export class NoiseAbility extends BaseAbility {
  private pendingReduction = 0;

  override getSpawnIntervals() {
    // 기준(gold:40, diamond:100, topaz:180) 대비 25% 단축
    return { gold: 30, diamond: 75, topaz: 135 };
  }

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
