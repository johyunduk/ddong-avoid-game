import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';

/**
 * 레거시 (UR)
 * - 기본 효과: 게임 시작 시 6초간 금똥만 나오는 피버타임으로 시작
 * - 특수 능력: 500점마다 레거시 모드 10초 발동 — 점수 1.2배 + 황금빛 화면 overlay
 */
export class LegacyAbility extends BaseAbility {
  private startFeverActive = false;
  private legacyModeActive = false;
  private accum = 0;      // 소수점 점수 누적 (1.2배 구현용)
  private lastLegacyScore = 0;
  private legacyOverlay?: Phaser.GameObjects.Rectangle;

  override onCreate(api: GameSceneAPI): void {
    this.startFeverActive = true;
    api.scene.time.delayedCall(6000, () => {
      this.startFeverActive = false;
    });
  }

  override getTickScore(base: number): number {
    if (!this.legacyModeActive) return base;
    // 1.2배: 0.2 차이를 accum에 누적해 정수로 변환
    this.accum += base * 0.2;
    const bonus = Math.floor(this.accum);
    this.accum -= bonus;
    return base + bonus;
  }

  /** 시작 피버 중에는 일반 스폰 대신 금똥만 생성 */
  override overrideSpawnPoop(api: GameSceneAPI): boolean {
    if (this.startFeverActive) {
      api.spawnGoldPoop();
      return true;
    }
    return false;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % 500 === 0 && score > this.lastLegacyScore) {
      this.lastLegacyScore = score;
      this.activateLegacyMode(api);
    }
  }

  private activateLegacyMode(api: GameSceneAPI): void {
    if (this.legacyModeActive) return;
    this.legacyModeActive = true;
    this.accum = 0;

    // 황금빛 overlay 연출
    this.legacyOverlay = api.scene.add
      .rectangle(200, 300, 400, 600, 0xffaa00, 0.15)
      .setDepth(150);

    api.scene.time.delayedCall(10000, () => {
      this.legacyModeActive = false;
      this.legacyOverlay?.destroy();
      this.legacyOverlay = undefined;
    });
  }
}
