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
  /** 이번 판 배경 텍스처 키 — 땅 재질 팔레트(utils/background getGroundFx) 조회용 */
  readonly backgroundKey: string;

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

  // ── 액티브 스킬 (누르는 스킬) ──────────────────────────────────────
  //
  // **게임의 첫 액티브 스킬은 테드지만, 틀은 캐릭터를 모른다.** 충전은 GameScene 이
  // 세고(점수), 버튼도 GameScene 이 그린다. 능력은 "얼마마다 차는가 · 몇 칸까지 ·
  // 지금 쓸 수 있는가 · 쓰면 무엇을 하는가" 넷만 답한다.
  //
  // 충전은 **화면 점수**로 센다. 스킬로 번 점수도 다음 충전에 들어가므로, 그 몫은
  // 스킬의 똥 개당 점수로 조절한다 (기본 점수로만 세던 때는 보너스가 많은 캐릭터가
  // 화면 5,000점을 넘겨도 한 칸이 안 찼다).

  /** 충전 한 칸에 필요한 점수. `0` 이면 이 캐릭터는 액티브가 없다 */
  getActiveChargeScore(): number;

  /** 쌓아 둘 수 있는 최대 칸 수 */
  getActiveMaxCharges(): number;

  /** 판을 시작할 때 이미 차 있는 칸 수 */
  getActiveStartCharges(): number;

  /** 지금 발동할 수 있는가 — 연출이 도는 중이면 false */
  canUseActive(api: GameSceneAPI): boolean;

  /** 버튼을 눌렀다. 칸은 GameScene 이 이미 차감했다 */
  onActiveSkill(api: GameSceneAPI): void;

  /**
   * 한 칸이 새로 찼다 (판 시작 때 채워 주는 칸 포함, 칸마다 한 번). 칸마다 결과를 미리 정해 두는
   * 능력(테드)이 여기서 큐에 넣는다
   */
  onActiveChargeGained(api: GameSceneAPI): void;

  /**
   * 충전 표시를 능력이 직접 그리는가. true 면 GameScene 은 가운데 숫자와 진행 링을 숨기고 원만 그린다.
   * btn = 버튼 원의 중심·반지름 (화면 좌표), s = 버튼 배율 (ACTIVE_BTN.scale — 딸린 표시도 이만큼)
   */
  createActiveChargeView(api: GameSceneAPI, btn: { x: number; y: number; r: number; s: number }): boolean;

  /**
   * 충전 상태가 바뀔 때마다 (점수 변경마다 · 발동 가능 여부가 바뀔 때) — progress = 다음 칸까지 0~1,
   * usable = 지금 누르면 발동되는가 (canUseActive). false 면 칸이 있어도 흐리게 그린다
   */
  updateActiveChargeView(api: GameSceneAPI, s: { charges: number; max: number; progress: number; usable: boolean }): void;

  /** update() 매 프레임 호출 (글리치 분신 추적 등) */
  onUpdate(api: GameSceneAPI): void;

  /** 게임 오버 시 호출 — 타이머·Tween·Graphics 등 리소스 정리 */
  onDestroy(api: GameSceneAPI): void;
}
