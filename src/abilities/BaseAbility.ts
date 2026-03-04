import type { CharacterAbility, GameSceneAPI, SpecialPoopType } from './types';

/** 모든 메서드가 no-op인 기본 구현. 각 캐릭터는 이를 상속해 필요한 메서드만 오버라이드. */
export class BaseAbility implements CharacterAbility {
  /** 0~3 각성 단계 (★0 기본 ~ ★3 풀 각성) */
  protected readonly awakeningLevel: number;

  constructor(awakeningLevel = 0) {
    this.awakeningLevel = awakeningLevel;
  }

  onCreate(_api: GameSceneAPI): void {}
  getPlayerSpeedBonus(): number { return 0; }
  getTickScore(base: number): number { return base; }
  getSpawnIntervals() { return { gold: 40, diamond: 100, topaz: 180 }; }
  onScoreMilestone(_score: number, _api: GameSceneAPI): void {}
  onCollectSpecial(_type: SpecialPoopType): number { return 0; }
  specialPoopSpeedReduction(_type: 'gold' | 'diamond'): number { return 0; }
  isSpawnBlocked(): boolean { return false; }
  getSpawnCountReduction(): number { return 0; }
  overrideSpawnPoop(_api: GameSceneAPI): boolean { return false; }
  onAfterSpawnPoop(_api: GameSceneAPI): void {}
  onHitPoop(_api: GameSceneAPI): boolean { return false; }
  onUpdate(_api: GameSceneAPI): void {}
}
