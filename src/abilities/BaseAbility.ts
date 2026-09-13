import type { CharacterAbility, GameSceneAPI, SpecialPoopType } from './types';

/** 모든 메서드가 no-op인 기본 구현. 각 캐릭터는 이를 상속해 필요한 메서드만 오버라이드. */
export class BaseAbility implements CharacterAbility {
  /** 0~3 각성 단계 (★0 기본 ~ ★3 풀 각성) */
  protected readonly awakeningLevel: number;

  constructor(awakeningLevel = 0) {
    this.awakeningLevel = awakeningLevel;
  }

  /**
   * **자기 보너스를 주고 있는 중인가.** `awardBonus` 가 도는 동안만 참이다.
   *
   * `addAbilityBonus` 는 GameScene 안에서 점수를 **1점씩 순회하며** 마일스톤을
   * 부른다. 그래서 능력이 준 점수가 다음 배수를 넘기면 **그 자리에서 능력이 한 번 더
   * 터진다** — 같은 콜스택 안에서, 연출이 아직 돌고 있는 채로.
   *
   * `lastXScore += bonus` 로 기준선만 올리는 것으로는 못 막는다. 기준선을 75 로
   * 올려도 점수가 100 을 지나가면 `100 > 75` 라 통과한다 (Codex 재현:
   * 레드 `last=50`·점수 90·+25 → 100 에서 추가 발사, 테드 `last=60`·점수 100·+20 → 120
   * 에서 추가 낙하). 게다가 기준선을 올려 두면 **정상 마일스톤까지 삼킨다.**
   */
  protected awarding = false;

  /**
   * 능력이 스스로 주는 보너스. 주는 동안 {@link awarding} 을 세워 **자기 보너스로는
   * 다시 발동하지 않게** 한다. 하이디가 `walk`/`idle` 이 아니면 발동을 삼키는 것과
   * 같은 규칙이다 — 이미 연출 중이면 예약하지 않는다.
   */
  protected awardBonus(api: GameSceneAPI, amount: number): void {
    if (amount <= 0) return;
    const before = this.awarding;
    this.awarding = true;
    try {
      api.addAbilityBonus(amount);
    } finally {
      this.awarding = before;
    }
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
  onDestroy(_api: GameSceneAPI): void {}
}
