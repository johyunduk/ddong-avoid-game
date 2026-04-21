import type Player from '../objects/Player';

/** GameScene이 CharacterAbility에 노출하는 API */
export interface GameSceneAPI {
  readonly score: number;
  readonly player: Player;
  readonly difficultyLevel: number;
  readonly baseSpeed: number;

  readonly poops: Phaser.Physics.Arcade.Group;
  readonly goldPoops: Phaser.Physics.Arcade.Group;
  readonly diamondPoops: Phaser.Physics.Arcade.Group;
  readonly topazPoops: Phaser.Physics.Arcade.Group;
  readonly rainbowPoops: Phaser.Physics.Arcade.Group;

  /** Phaser.Scene — time / tweens / add / cameras / physics 접근용 */
  readonly scene: Phaser.Scene;

  updateScore(amount: number): void;
  /** 어빌리티 자체 보너스 점수 추가 — updateScore와 동일하지만 abilityBonusTotal에 누적됨 */
  addAbilityBonus(amount: number): void;
  spawnGoldPoop(): void;
  spawnGoldPoopAt(x: number, y: number): void;
  spawnDiamondPoop(): void;
  spawnTopazPoop(): void;
  spawnRainbowPoop(): void;
  /** 특수 똥 수집 전체 처리 (카운트++, 점수, 획득 텍스트) */
  collectGoldPoop(poop: Phaser.Physics.Arcade.Sprite): void;
  collectDiamondPoop(poop: Phaser.Physics.Arcade.Sprite): void;
  collectTopazPoop(poop: Phaser.Physics.Arcade.Sprite): void;
  collectRainbowPoop(poop: Phaser.Physics.Arcade.Sprite): void;
}

/** 특수 똥 타입 */
export type SpecialPoopType = 'gold' | 'diamond' | 'topaz' | 'rainbow';

/** 캐릭터 능력 인터페이스 */
export interface CharacterAbility {
  /** create() 완료 후 호출 — 스프라이트·UI 초기화 */
  onCreate(api: GameSceneAPI): void;

  /** 플레이어 속도 보너스 (Player 생성 전 GameScene에서 읽음) */
  getPlayerSpeedBonus(): number;

  /** update() 점수 계산: base(보통 1)를 받아 실제 추가할 점수 반환 */
  getTickScore(base: number): number;

  /** 금·다이아·토파즈 스폰 점수 간격 (noise는 단축) */
  getSpawnIntervals(): { gold: number; diamond: number; topaz: number };

  /** checkMissedSpawnPoints 루프에서 매 점수마다 호출 */
  onScoreMilestone(score: number, api: GameSceneAPI): void;

  /** 특수 똥 수집 시 추가 보너스 점수 반환 (없으면 0) */
  onCollectSpecial(type: SpecialPoopType): number;

  /** 금·다이아 스폰 시 낙하 속도 감소량 반환 (루트: 40) */
  specialPoopSpeedReduction(type: 'gold' | 'diamond'): number;

  /** true → 일반 똥 스폰 완전 차단 */
  isSpawnBlocked(): boolean;
  /** 다음 소환 시 줄일 똥 개수 반환 후 0으로 리셋 (노이즈 특수 능력) */
  getSpawnCountReduction(): number;

  /** true → 능력이 직접 스폰 처리 (레거시 시작 피버: 금똥만 생성) */
  overrideSpawnPoop(api: GameSceneAPI): boolean;

  /** 일반 똥 스폰 완료 후 호출 (레거시 불태우기 등 사후 처리) */
  onAfterSpawnPoop(api: GameSceneAPI): void;

  /** 피격 시 호출. true → 보호막 소모, 게임오버 방지 (센티넬) */
  onHitPoop(api: GameSceneAPI): boolean;

  /** update() 매 프레임 호출 (글리치 분신 추적 등) */
  onUpdate(api: GameSceneAPI): void;

  /** 게임 오버 시 호출 — 타이머·Tween·Graphics 등 리소스 정리 */
  onDestroy(api: GameSceneAPI): void;
}
