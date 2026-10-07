import Phaser from 'phaser';
import Player from '../objects/Player';

// [안티치트] 모듈 로드 시점(콘솔 스크립트 주입 이전)에 원본 함수 캡처
const _origOverlap     = Phaser.Physics.Arcade.World.prototype.overlap;
const _origIntersects  = Phaser.Physics.Arcade.World.prototype.intersects;
import Poop from '../objects/Poop';
import PoolablePoopBase from '../objects/PoolablePoopBase';
import GoldPoop from '../objects/GoldPoop';
import DiamondPoop from '../objects/DiamondPoop';
import TopazPoop from '../objects/TopazPoop';
import RainbowPoop from '../objects/RainbowPoop';
import { GameMode, Difficulty, DIFFICULTIES, DIFFICULTY_SCALING, type DifficultyConfig } from '../types/GameMode';
import { FEVER_TIME_CONFIG } from '../config/feverTime';
import { MAEHWA_PARAMS } from '../config/abilityParams';
import { POOP_CONFIG } from '../config/poop';
import { getHighScore, updateHighScore } from '../utils/localStorage';
import {
  submitScore, getUserInitials, setUserInitials, startGameSession, getLeaderboard, invalidateLeaderboardCache,
  type LeaderboardResponse,
} from '../utils/leaderboard';
import { getExtremeCharBest, updateExtremeCharBest } from '../utils/extremeCharBest';
import { submitSkor, type SkorSubmitResponse, getQuestProgressCache, setQuestProgressCache, estimateQuestRewards } from '../utils/skor';
import { CHARACTERS, getSafeSelectedCharacter, getCharacterDef, getDuplicateCount, getAwakeningLevel, getGradeImgKey } from '../utils/character';
import { getSafeSelectedWallpaper, getWallpaperDef } from '../utils/wallpaper';
import { getSynergy, type WallpaperSynergy } from '../config/synergyMap';
import { isChristmasSeason } from '../utils/seasonChecker';
import type { CharacterAbility, GameSceneAPI } from '../abilities/types';
import { getCharacterAbility } from '../abilities/index';
import { BaseAbility } from '../abilities/BaseAbility';
import { realNow } from '../utils/realTime';
import { preloadFxAssets } from '../utils/vfx';
import { ensureCharAnims } from '../utils/charAnim';
import { loadCharacterAssets } from '../utils/characterAssets';
import BaseScene from './BaseScene';
import { ACTIVE_BTN } from '../config/activeButton';
import { addBackground } from '../utils/background';
import { GameOverView, type RankValue } from './gameOver/GameOverView';
import { HudView, HUD_BOTTOM } from './hud/HudView';
import { bakeButton, bakeRadialGlow, bakeRoundedImage } from '../utils/buttonSkin';

export default class GameScene extends BaseScene {
  protected inputGuardMs = 0; // 게임플레이 씬은 즉시 입력 허용

  protected player!: Player;
  protected poops!: Phaser.Physics.Arcade.Group;
  private goldPoops!: Phaser.Physics.Arcade.Group;
  private diamondPoops!: Phaser.Physics.Arcade.Group;
  private topazPoops!: Phaser.Physics.Arcade.Group;
  private rainbowPoops!: Phaser.Physics.Arcade.Group;
  protected score: number = 0;
  /** 위 HUD (C안) — 점수·최고·진행선·피버 알약·획득 글자 */
  private hud!: HudView;
  private highScore: number = 0;
  /** 이번 판 시작 때 개인 최고 — 게임오버의 '이전 최고' (highScore 는 플레이 중 따라 오른다) */
  private highScoreAtStart: number = 0;
  /** 게임 시작 때 받아 둔 내 순위 (게임오버에서 ▲N 비교) */
  private rankBefore: Promise<{ all: RankValue; char: RankValue }> | null = null;
  private ranksAtStart: { all: RankValue; char: RankValue } | null = null;
  private gameOverView: GameOverView | null = null;
  private charHighScore: number = 0;       // HUD 표시용 (실시간 갱신)
  private charHighScoreAtStart: number = 0; // 신기록 판정용 (게임 시작 시 고정)
  protected gameOver: boolean = false;
  private spawnTimer!: Phaser.Time.TimerEvent;
  protected difficultyLevel: number = 2;
  private bgMusic!: Phaser.Sound.BaseSound;
  protected gameMode: GameMode = GameMode.CLASSIC;
  protected difficulty: Difficulty = Difficulty.HARD;  // 게임플레이 파라미터 기준
  private purePhysical: boolean = false;
  private get scoreDifficulty(): Difficulty {         // 점수/리더보드 저장 키
    return this.purePhysical ? Difficulty.PHYSICAL : this.difficulty;
  }
  protected difficultyConfig!: DifficultyConfig;
  private lastGoldPoopScore: number = 0;
  private lastDiamondPoopScore: number = 0;
  private lastTopazPoopScore: number = 0;
  // 점수 검증용 데이터
  private gameStartTime: number = 0;
  private phaserStartTime: number = 0; // 씬 시작 시 Phaser 내부 시간 (재시작 시에도 정확한 delta 계산용)
  private lastScoreTime: number = 0;        // realNow() 기반 점수용
  private lastCheatCheckTime: number = 0;   // timeScale 감지용 (realNow 기준)
  private lastPhaserCheckTime: number = 0;  // 구간 비율 감지용 Phaser 기준점
  private cheatSuspicionCount: number = 0;  // 연속 이상 탐지 횟수 (2회 연속시 차단)
  private goldCollected: number = 0;
  private diamondCollected: number = 0;
  private topazCollected: number = 0;
  private rainbowCollected: number = 0;
  private collectBonusTotal: number = 0; // ability.onCollectSpecial + synergy.collectBonus 누계
  private abilityBonusTotal: number = 0; // addAbilityBonus() + getTickScore 배율 초과분 누계
  // ── 액티브 스킬 (누르는 스킬) ─────────────────────────────────────
  /** 지금 쓸 수 있는 충전 칸 수 */
  private activeCharges: number = 0;
  /** 마지막으로 칸을 채운 점수 기준선 (화면 점수) */
  private lastChargeScore: number = 0;
  private activeBtn?: Phaser.GameObjects.Arc;
  private activeBtnLabel?: Phaser.GameObjects.Text;
  /** 테두리·링 굵기 배율 — 판 반지름 / 처음 설계 반지름 */
  private activeBtnScale = 1;
  /** 버튼 판 (발동 가능 / 흐림 두 장을 구워 두고 갈아 끼운다) */
  private activePlate?: Phaser.GameObjects.Image;
  private activePlateKeys = { on: '', off: '' };
  /** 칸 점 — 충전 칸 수만큼 */
  private activeDots?: Phaser.GameObjects.Graphics;
  private lastDotsKey = '';
  /** 꽉 찼을 때 — 금빛 후광 + READY */
  private activeHalo?: Phaser.GameObjects.Image;
  private activeReadyTag?: Phaser.GameObjects.Container;
  private activeShownFull = false;
  /** 마지막으로 버튼에 그린 발동 가능 여부 — 바뀌면 다시 그린다 (테드 소환 중 등) */
  private activeUsable = true;
  /** 다음 칸까지 차오르는 테두리 */
  private activeRing?: Phaser.GameObjects.Graphics;
  /** 마지막으로 그린 진행률(%) — 같으면 다시 그리지 않는다 */
  private lastRingPct: number = -1;
  // 피버 타임 관련
  protected isFeverTime: boolean = false; // 피버 타임 활성화 여부
  private feverTimeRemaining: number = 0; // 피버 타임 남은 시간 (ms)
  private feverTimeTimer?: Phaser.Time.TimerEvent; // 피버 타임 카운트다운 타이머
  private feverCount: number = 0;          // 피버 발동 횟수 누계 (레인보우 피버 조건 판정용)
  private isRainbowFever: boolean = false; // 레인보우 피버 활성 여부 (광부×황금광산 시너지)
  private lastClearPoopsScore: number = 0; // 마지막 전체 똥 제거 발동 점수 (매화×매화 시너지)
  // 피버 트리거 점수 캐시 — checkFeverTime O(k)→O(1) 최적화
  private nextFeverScore: number = 0;
  private feverScoreK: number = 1;
  private lastDisplayedFeverSecond: number = -1; // 이전에 표시한 초값 (변경 없으면 재계산 스킵)
  /** difficultyLevel 기반으로 현재 spawn 간격을 항상 최신값으로 계산 */
  private get currentSpawnDelay(): number {
    return Math.max(400, this.difficultyConfig.spawnDelay - (this.difficultyLevel * 80));
  }

  /**
   * 전용 플레이어 스프라이트(`assets/players/<id>_{front,left,right}.webp`)를 가진 캐릭터.
   *
   * **캐릭터 정의에서 유도한다** — 손으로 적어 두면 캐릭터를 추가할 때 빠뜨리고,
   * 빠뜨려도 조용히 치비 스프라이트로 폴백해서 아무도 모른다.
   * chibi 자신은 폴백 대상이라 목록에서 뺀다 (`getAnimSheetId` 참고).
   */
  private static readonly CHARS_WITH_SPRITES = CHARACTERS
    .filter(c => c.id !== 'chibi')
    .map(c => c.id);
  /** 특수똥 획득 글자 옆 아이콘 (똥 텍스처 키) */
  private static readonly SPECIAL_ICON: Record<string, string> = {
    gold: 'gold_poop', diamond: 'diamond_poop', topaz: 'topaz_poop', rainbow: 'rainbow_poop',
  };
  /** 레인보우 피버 변환 시 방울 터짐 효과 색상 */
  private static readonly BUBBLE_COLORS = [0xff00ff, 0x00ffff, 0xffee00, 0x00ff88, 0xff6600, 0xcc00ff];
  private selectedCharId: string = 'chibi'; // 선택된 캐릭터 ID
  private charAnimEnabled: boolean = false; // 시트 애니메이션 사용 여부 (init에서 초기화)
  private selectedCharGrade: string = '등급외'; // 선택된 캐릭터 등급
  private charAwakeLevel: number = 0; // 각성 단계 (init에서 계산, create에서 사용)
  private selectedWpId: string | null = null; // 선택된 배경화면 ID (null = 기본)
  private activeSynergy: WallpaperSynergy | null = null; // 배경화면-캐릭터 시너지
  // 서버 세션 (게임 시작 시 비동기 생성, 점수 제출 시 await)
  private sessionPromise: Promise<string | null> | null = null;
  // ── 캐릭터 능력 시스템 ────────────────────────────────────────────────
  protected ability!: CharacterAbility;
  protected abilityAPI!: GameSceneAPI;
  /** 이번 판 배경 텍스처 키 — create() 에서 정한다. 능력이 땅 팔레트(getGroundFx)를 고를 때 쓴다 */
  protected backgroundKey = 'background';
  // [디버그] 수동 충돌 영역 시각화
  private manualHitboxDebug?: Phaser.GameObjects.Graphics;

  constructor(key: string = 'GameScene') {
    super(key);
  }

  init(data: { gameMode?: GameMode; difficulty?: Difficulty; purePhysical?: boolean }) {
    // 게임 재시작 시 점수 관련 변수 초기화
    this.score = 0;
    this.gameOver = false;
    this.difficultyLevel = 2;
    this.lastGoldPoopScore = 0;
    this.lastDiamondPoopScore = 0;
    this.lastTopazPoopScore = 0;
    this.gameStartTime = realNow();
    this.phaserStartTime = 0; // create()에서 설정
    this.lastScoreTime = realNow();
    this.goldCollected = 0;
    this.cheatSuspicionCount = 0;
    this.diamondCollected = 0;
    this.topazCollected = 0;
    this.rainbowCollected = 0;
    this.collectBonusTotal = 0;
    this.abilityBonusTotal = 0;
    // 씬 재시작 후에도 클래스 프로퍼티는 남는다 — 액티브 충전도 반드시 여기서 초기화
    this.activeCharges = 0;
    this.lastChargeScore = 0;
    this.activeBtn = undefined;
    this.activeBtnLabel = undefined;
    this.activeBtnScale = 1;
    this.activePlate = undefined;
    this.activeDots = undefined;
    this.lastDotsKey = '';
    this.activeHalo = undefined;
    this.activeReadyTag = undefined;
    this.activeShownFull = false;
    this.activeUsable = true;
    this.activeRing = undefined;
    this.lastRingPct = -1;
    this.sessionPromise = null; // 재시작 시 이전 세션 프로미스 해제
    this.rankBefore = null;
    this.ranksAtStart = null;
    this.gameOverView = null;
    // 디버그 Graphics 참조 초기화 (씬 재시작 시 이전 객체는 Phaser가 파괴하므로 참조만 해제)
    this.manualHitboxDebug = undefined;
    // 피버 타임 초기화
    this.isFeverTime = false;
    this.feverTimeRemaining = 0;
    // 지난 판 시계에 붙어 있던 타이머 — 씬이 끝나며 시계째 사라졌다. 참조를 들고 있지 않는다
    this.feverTimeTimer = undefined;
    this.feverCount = 0;
    this.isRainbowFever = false;
    this.lastClearPoopsScore = 0;
    this.nextFeverScore = FEVER_TIME_CONFIG.firstTriggerScore;
    this.feverScoreK = 1;
    this.lastDisplayedFeverSecond = -1;
    // 캐릭터 선택 화면에서 저장한 캐릭터 & 배경화면 사용
    this.selectedCharId = getSafeSelectedCharacter();
    this.selectedWpId = getSafeSelectedWallpaper();
    this.charAnimEnabled = false; // 씬 재시작 시 이전 상태가 남지 않게 초기화
    const charDef        = getCharacterDef(this.selectedCharId);
    const dupCount       = getDuplicateCount(this.selectedCharId);
    const awakeLevel     = getAwakeningLevel(charDef.grade, dupCount);
    this.selectedCharGrade = charDef.grade;
    this.charAwakeLevel    = awakeLevel;
    this.purePhysical = data.purePhysical ?? false;
    this.ability = getCharacterAbility(this.selectedCharId, awakeLevel);
    if (this.purePhysical) this.ability = new BaseAbility();
    this.activeSynergy = this.purePhysical ? null : getSynergy(this.selectedWpId, this.selectedCharId);

    // ModeSelectScene/DifficultySelectScene으로부터 게임 모드와 난이도를 받음
    if (data.gameMode) {
      this.gameMode = data.gameMode;
      // console.log('Game Mode:', this.gameMode);
    }
    if (data.difficulty) {
      this.difficulty = data.difficulty;
      localStorage.setItem('lastPlayedDifficulty', this.scoreDifficulty);
    }

    // 난이도 설정 찾기
    const config = DIFFICULTIES.find(d => d.difficulty === this.difficulty);
    if (config) {
      this.difficultyConfig = config;
    } else {
      // 기본값은 HARD
      this.difficultyConfig = DIFFICULTIES.find(d => d.difficulty === Difficulty.HARD)!;
    }
  }

  preload() {
    // VFX 파티클 텍스처 (이미 캐시에 있으면 건너뜀)
    preloadFxAssets(this);
    // 판 캐릭터 에셋 (스프라이트 · 시트 · 능력 그림 · 얼굴 칩) — 이전 판과 다른 캐릭터면 이전 몫을 먼저 내린다 (utils/characterAssets).
    // 난이도 화면이 미리 받아 둔 것은 건너뛴다
    loadCharacterAssets(this, this.selectedCharId);

    // 선택된 배경화면 조건부 로딩 (DifficultySelectScene에서 미리 로드 안 된 경우 fallback)
    const wpDef = this.selectedWpId ? getWallpaperDef(this.selectedWpId) : null;
    if (wpDef && !this.textures.exists(wpDef.bgKey)) {
      this.load.image(wpDef.bgKey, wpDef.bgPath);
    }

    // DifficultySelectScene에서 미리 로딩됨. 캐시에 없을 경우에만 fallback 로딩.

    if (this.difficulty === Difficulty.NORMAL && !this.textures.exists('background3')) {
      this.load.image('background3', 'assets/backgrounds/background3.webp');
    } else if (this.difficulty === Difficulty.HARD && !this.textures.exists('background')) {
      this.load.image('background', 'assets/backgrounds/background.webp');
    } else if (this.difficulty === Difficulty.EXTREME && !this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    if (this.difficulty === Difficulty.EXTREME && isChristmasSeason() && !this.textures.exists('xmas_background')) {
      this.load.image('xmas_background', 'assets/backgrounds/xmas_background.webp');
    }

    if (!this.textures.exists('poop')) this.load.image('poop', 'assets/poops/poop.webp');
    if (!this.textures.exists('poop_glasses')) this.load.image('poop_glasses', 'assets/poops/poop_glasses.webp');
    if (!this.textures.exists('poop_sunglass')) this.load.image('poop_sunglass', 'assets/poops/poop_sunglass.webp');
    if (!this.textures.exists('poop_sunglass2')) this.load.image('poop_sunglass2', 'assets/poops/poop_sunglass2.webp');
    if (!this.textures.exists('poop_smile')) this.load.image('poop_smile', 'assets/poops/poop_smile.webp');
    if (!this.textures.exists('gold_poop')) this.load.image('gold_poop', 'assets/poops/gold_poop.webp');
    if (!this.textures.exists('diamond_poop')) this.load.image('diamond_poop', 'assets/poops/diamond_poop.webp');
    if (!this.textures.exists('topaz_poop')) this.load.image('topaz_poop', 'assets/poops/topaz.webp');
    if (!this.textures.exists('rainbow_poop')) this.load.image('rainbow_poop', 'assets/poops/rainbow_poop.webp');
    // 피버 로고 시트 (공통 — 판마다 쓴다). 레인보우는 그 시너지가 있는 판에만
    HudView.preload(this, this.activeSynergy?.rainbowFever === true);
    // 게임오버 캐릭터 칩의 등급 글자 (작은 png 한 장)
    {
      const g = getCharacterDef(getSafeSelectedCharacter()).grade;
      const gk = getGradeImgKey(g);
      if (gk && !this.textures.exists(gk)) this.load.image(gk, `assets/character_ranks/${g.toLowerCase()}.png`);
    }

    if (this.difficulty === Difficulty.EXTREME && isChristmasSeason()) {
      if (!this.textures.exists('xmas_poop_ribbon')) this.load.image('xmas_poop_ribbon', 'assets/poops/xmas_present_poop.webp');
      if (!this.textures.exists('xmas_poop_nose')) this.load.image('xmas_poop_nose', 'assets/poops/xmas_nose_poop.webp');
      if (!this.textures.exists('xmas_poop_santa')) this.load.image('xmas_poop_santa', 'assets/poops/xmas_santa_poop.webp');
      if (!this.textures.exists('xmas_poop_rudolf')) this.load.image('xmas_poop_rudolf', 'assets/poops/xmas_rudolf_poop.webp');
      if (!this.textures.exists('xmas_poop_beard')) this.load.image('xmas_poop_beard', 'assets/poops/xmas_beard_poop.webp');
    }

    // BGM
    if (this.difficulty === Difficulty.EXTREME && isChristmasSeason()) {
      if (!this.cache.audio.exists('xmasBgMusic')) this.load.audio('xmasBgMusic', 'assets/bgms/xmas_poop.mp3');
    } else {
      if (!this.cache.audio.exists('bgMusic')) this.load.audio('bgMusic', 'assets/bgms/poop.mp3');
    }
  }

  /** 시트 조회용 캐릭터 id — 전용 스프라이트가 없는 캐릭터는 치비로 폴백한다 */
  private getAnimSheetId(): string {
    return GameScene.CHARS_WITH_SPRITES.includes(this.selectedCharId)
      ? this.selectedCharId
      : 'chibi';
  }

  private getDefaultBackgroundKey(): string {
    if (this.difficulty === Difficulty.NORMAL) return 'background3';
    if (this.difficulty === Difficulty.EXTREME) {
      return isChristmasSeason() ? 'xmas_background' : 'background2';
    }
    return 'background'; // EASY / HARD
  }

  create() {
    super.create();

    // 키보드 이벤트 수신을 위해 캔버스 포커스 설정
    const canvas = this.game.canvas;
    canvas.setAttribute('tabindex', '0');
    canvas.focus();

    // Phaser 내부 시간 기준점 기록 (씬 재시작 시에도 정확한 delta 계산)
    this.phaserStartTime = this.time.now;
    // rAF 체크 두 기준점을 동시에 설정 — preload 시간 불일치 방지
    this.resetCheatCheckpoints();

    this.highScore = getHighScore(this.scoreDifficulty);
    this.highScoreAtStart = this.highScore;
    this.charHighScore = this.scoreDifficulty === Difficulty.EXTREME
      ? getExtremeCharBest(this.selectedCharId)
      : 0;
    this.charHighScoreAtStart = this.charHighScore;

    // 배경 이미지: 선택된 배경화면 우선, 없으면 난이도별 기본
    const wpDefForBg = this.selectedWpId ? getWallpaperDef(this.selectedWpId) : null;
    const backgroundKey = (wpDefForBg && this.textures.exists(wpDefForBg.bgKey))
      ? wpDefForBg.bgKey
      : this.getDefaultBackgroundKey();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    this.backgroundKey = backgroundKey;
    addBackground(this, backgroundKey, W, H);

    // BGM 키 결정 (preload에서 이미 로드됨)
    let bgMusicKey = 'bgMusic';
    if (this.difficulty === Difficulty.EXTREME && isChristmasSeason()) {
      bgMusicKey = 'xmasBgMusic';
    }

    // 이전 bgMusic 인스턴스가 있으면 전역 SoundManager에서 제거
    if (this.bgMusic) {
      this.bgMusic.destroy();
    }

    // BGM 재생 (preload에서 이미 로드 완료됨)
    this.bgMusic = this.sound.add(bgMusicKey, { loop: true, volume: 0.5 });
    this.bgMusic.play();

    // 월드 바운드 설정 (플레이어가 화면 안쪽에만 머무르도록)
    this.physics.world.setBounds(15, 0, W - 30, H);

    // 플레이어 생성 (난이도별 속도 적용, 게임 모드별 스프라이트)
    const CHARS_WITH_SPRITES = GameScene.CHARS_WITH_SPRITES;
    let playerTexturePrefix = '';
    if (CHARS_WITH_SPRITES.includes(this.selectedCharId)) {
      playerTexturePrefix = `${this.selectedCharId}_`;
    }
    // 등급 각성 패시브: ★1 R+5/SR+10/UR+15, ★2 R+10/SR+15/UR+20
    // 매화 예외: ★1 +5, ★2+ 속도 패시브 없음 (대신 특수똥 수집 +5pt)
    const _gs = (r: number, sr: number, ur: number) =>
      this.selectedCharGrade === 'UR' ? ur
      : this.selectedCharGrade === 'SR' ? sr
      : this.selectedCharGrade === 'R'  ? r
      : 0;
    const gradeAwakeSpeed = this.selectedCharId === 'maehwa'
      ? (this.charAwakeLevel >= 1 ? 5 : 0)
      : this.charAwakeLevel >= 2 ? _gs(10, 15, 20)
      : this.charAwakeLevel >= 1 ? _gs(5, 10, 15)
      : 0;
    const [playerW, playerH] = getCharacterDef(this.selectedCharId).playerDisplaySize ?? [50, 80];
    // 시트가 다 준비된 경우에만 애니메이션 모드 — 아니면 기존 정적 텍스처로 동작한다
    const animSheetId = this.getAnimSheetId();
    this.charAnimEnabled = ensureCharAnims(this, animSheetId);
    // 동반자 시트도 애니메이션을 등록해 둔다 (능력 쪽에서 anims.exists 로 확인하고 쓴다)
    for (const id of getCharacterDef(this.selectedCharId).extraSheets ?? []) {
      ensureCharAnims(this, id);
    }
    this.player = new Player(this, cx, H - 80, this.difficultyConfig.playerSpeed + this.ability.getPlayerSpeedBonus() + gradeAwakeSpeed + (this.activeSynergy?.speedBonus ?? 0), playerTexturePrefix, playerW, playerH, this.charAnimEnabled ? animSheetId : null);

    // 💩 그룹 생성 (Object Pool: maxSize로 상한 설정)
    this.poops = this.physics.add.group({
      classType: Poop,
      runChildUpdate: true,
      maxSize: 60,
    });

    // 금똥 그룹 생성
    this.goldPoops = this.physics.add.group({
      classType: GoldPoop,
      runChildUpdate: true,
      maxSize: 20,
    });

    // 다이아똥 그룹 생성
    this.diamondPoops = this.physics.add.group({
      classType: DiamondPoop,
      runChildUpdate: true,
      maxSize: 20,
    });

    // 토파즈똥 그룹 생성
    this.topazPoops = this.physics.add.group({
      classType: TopazPoop,
      runChildUpdate: true,
      maxSize: 10,
    });

    // 무지개똥 그룹 생성 (레인보우 피버 시 최대 30개 동시 활성 가능)
    this.rainbowPoops = this.physics.add.group({
      classType: RainbowPoop,
      runChildUpdate: true,
      maxSize: 30,
    });

    // 풀 사전 할당 — create() 시점에 오브젝트를 미리 생성해 게임 중 런타임 생성 히치 방지
    const prewarm = (group: Phaser.Physics.Arcade.Group, count: number) => {
      for (let i = 0; i < count; i++) {
        const obj = group.get(0, -200) as Phaser.Physics.Arcade.Sprite;
        if (obj) {
          obj.setActive(false).setVisible(false);
          const body = obj.body as Phaser.Physics.Arcade.Body;
          if (body) body.setEnable(false);
        }
      }
    };
    prewarm(this.poops, 36);        // 스폰당 최대 6개 × 여유
    prewarm(this.goldPoops, 5);
    prewarm(this.diamondPoops, 5);
    prewarm(this.topazPoops, 4);
    prewarm(this.rainbowPoops, 4);

    // 충돌 감지
    this.physics.add.overlap(
      this.player,
      this.poops,
      this.hitPoop as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // 금똥 충돌 감지 (수집)
    this.physics.add.overlap(
      this.player,
      this.goldPoops,
      this.collectGoldPoop as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // 다이아똥 충돌 감지 (수집)
    this.physics.add.overlap(
      this.player,
      this.diamondPoops,
      this.collectDiamondPoop as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // 토파즈똥 충돌 감지 (수집)
    this.physics.add.overlap(
      this.player,
      this.topazPoops,
      this.collectTopazPoop as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // 무지개똥 충돌 감지 (수집)
    this.physics.add.overlap(
      this.player,
      this.rainbowPoops,
      this.collectRainbowPoop as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // 위 HUD (C안) — 점수 · 최고(+ EXTREME 캐릭터 최고) · 진행선. 위 60px 안에서 끝난다
    this.hud = new HudView(this, {
      best: this.highScoreAtStart,
      char: this.scoreDifficulty === Difficulty.EXTREME
        ? { name: getCharacterDef(this.selectedCharId).name, best: this.charHighScoreAtStart } : undefined,
    });

    // 조작 안내 (3초 후 자동으로 페이드아웃)
    const hintText = this.add.text(cx, HUD_BOTTOM + 24, '← → 키로 이동', {
      fontSize: '15px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setAlpha(0.85).setDepth(10);
    this.time.delayedCall(2500, () => {
      this.tweens.add({ targets: hintText, alpha: 0, duration: 700, ease: 'Linear' });
    });

    // 💩 생성 타이머 (난이도별 초기 주기 사용)
    this.spawnTimer = this.time.addEvent({
      delay: this.difficultyConfig.spawnDelay,
      callback: this.spawnPoop,
      callbackScope: this,
      loop: true
    });

    // 점수 증가는 update()에서 Date.now() 기반으로 처리 (timeScale 조작 무력화)
    // 난이도는 점수 기반으로 증가 (checkMissedSpawnPoints에서 처리)

    // ── 캐릭터 능력 초기화 (모든 그룹 생성 완료 후) ─────────────────────
    this.abilityAPI = this.buildAPI();
    this.ability.onCreate(this.abilityAPI);

    // 액티브 스킬 버튼 — 능력이 액티브를 가진 캐릭터에서만 생긴다
    this.createActiveSkillButton();

    // 시너지 뱃지 (배경화면-캐릭터 조합 일치 시 게임 시작 직후 표시)
    if (this.activeSynergy) {
      const badge = this.add.text(cx, HUD_BOTTOM + 2, `✦ ${this.activeSynergy.label}`, {
        fontSize: '12px',
        color: '#FFD700',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5, 0).setDepth(10).setAlpha(0);

      this.tweens.add({
        targets: badge,
        alpha: { from: 0, to: 1 },
        duration: 400,
        onComplete: () => {
          this.time.delayedCall(3000, () => {
            this.tweens.add({ targets: badge, alpha: 0, duration: 600,
              onComplete: () => { badge.destroy(); } });
          });
        }
      });
    }

    // 서버 세션 비동기 시작 — 게임과 병렬 실행, 점수 제출 시 await
    this.sessionPromise = startGameSession(this.scoreDifficulty);
    // 내 순위 (게임오버 순위 변화용) — 게임과 병렬, 실패해도 무시
    this.rankBefore = this.fetchMyRanks();

    // 탭 전환 시 기준점 리셋 — 숨김/복귀 양방향으로 처리
    // 숨김 시: 기준점만 리셋 (lastScoreTime 보존 → 숨기기 직전 이월분 유지)
    // 복귀 시: lastScoreTime도 리셋 (숨김 동안 누적 시간을 점수에 반영하지 않음)
    const onVisibilityChange = () => {
      if (!this.gameOver) {
        if (!document.hidden) {
          this.lastScoreTime = realNow();
        }
        this.resetCheatCheckpoints();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    });

    // 히트박스 디버그 표시, hit box visibility
    // this.physics.world.createDebugGraphic();
    // this.physics.world.drawDebug = true;
  }

  update() {
    if (!this.gameOver) {
      this.player.update();

      // 탭 숨김 중엔 모든 게임 로직 차단 (rAF throttle로 인한 오탐 및 타이밍 레이스 방지)
      if (document.hidden) return;

      // [안티치트 레이어 3] Phaser 내부 함수 변조 감지
      // 모듈 로드 시 캡처한 원본과 다르면 콘솔 치트가 prototype을 덮어쓴 것
      if (
        Phaser.Physics.Arcade.World.prototype.overlap    !== _origOverlap ||
        Phaser.Physics.Arcade.World.prototype.intersects !== _origIntersects
      ) {
        this.handleCheatDetected();
        return;
      }

      // [안티치트 레이어 4] 물리 엔진 강제 일시정지 감지
      // 치트 shield 루프가 setInterval로 physics.world.pause()를 반복 호출할 때 차단
      if (this.physics.world.isPaused) {
        this.handleCheatDetected();
        return;
      }

      // [안티치트 레이어 5] 수동 AABB 충돌 감지
      // physics.overlap이 변조되거나 body가 비활성화되어도 스프라이트 좌표로 직접 계산
      this.checkManualPoopCollision();
      if (this.gameOver) return;

      // realNow(): 모듈 로드 시점에 캡처한 원본 Date.now — 콘솔 조작 무효
      const now = realNow();

      // 레이어 1: realNow() 기반 점수 계산 (Date.now 조작 무력화)
      const elapsed = now - this.lastScoreTime;
      if (elapsed >= 100) {
        const points = Math.floor(elapsed / 100);
        this.lastScoreTime = now - (elapsed % 100); // 나머지 시간 이월
        const tickResult = this.ability.getTickScore(points);
        this.abilityBonusTotal += tickResult - points; // 배율 초과분 누적
        this.updateScore(tickResult);
      }

      // 캐릭터 능력 프레임 업데이트 (글리치 분신 추적 등)
      this.ability.onUpdate(this.abilityAPI);
      // 발동 가능 여부는 점수와 무관하게 바뀐다 (연출·소환이 끝날 때) — 바뀐 프레임에만 버튼을 다시 그린다
      if (this.activeBtn && this.ability.canUseActive(this.abilityAPI) !== this.activeUsable) this.refreshActiveBtn();

      // 레이어 2: rAF 조작 감지 (5초마다 구간 비율 체크)
      // realNow vs Phaser time 비교 — Date.now·performance.now 동시 조작도 감지
      if (now - this.lastCheatCheckTime >= 5000) {
        const realInterval = now - this.lastCheatCheckTime;
        const phaserInterval = this.time.now - this.lastPhaserCheckTime;
        const ratio = phaserInterval / realInterval;

        // 정상 범위: 0.70 ~ 1.30 (모바일 OS 스로틀 허용)
        // ratio < 0.70: rAF 슬로우 조작 (slow-motion 치트)
        // ratio > 1.30: rAF 패스트 조작 (fast-forward 치트)
        // 연속 2회 이상 탐지시에만 차단 (일시적 OS 스로틀 오탐 방지)
        if (ratio < 0.70 || ratio > 1.30) {
          this.cheatSuspicionCount++;
          console.warn('[Anti-cheat] rAF 이상 감지:', ratio.toFixed(2), `(${this.cheatSuspicionCount}회 연속)`);
          if (this.cheatSuspicionCount >= 2) {
            this.handleCheatDetected();
            return;
          }
        } else {
          this.cheatSuspicionCount = 0; // 정상 구간 → 연속 카운터 초기화
        }
        // 기준점 갱신은 정상/이상 구분 없이 항상 수행
        this.resetCheatCheckpoints();
      }
    }
  }

  /** Ability 시스템에 게임 상태를 노출하는 API 객체 생성 */
  private buildAPI(): GameSceneAPI {
    const self = this;
    return {
      get score()           { return self.score; },
      get player()          { return self.player; },
      get difficultyLevel() { return self.difficultyLevel; },
      get baseSpeed()       { return self.difficultyConfig.baseSpeed; },
      get poops()           { return self.poops; },
      get goldPoops()       { return self.goldPoops; },
      get diamondPoops()    { return self.diamondPoops; },
      get topazPoops()      { return self.topazPoops; },
      get rainbowPoops()    { return self.rainbowPoops; },
      get scene()           { return self as unknown as Phaser.Scene; },
      get backgroundKey()   { return self.backgroundKey; },
      updateScore:    (n) => self.updateScore(n),
      addAbilityBonus: (n) => { self.abilityBonusTotal += n; self.updateScore(n); },
      spawnGoldPoop:    () => self.spawnGoldPoop(),
      spawnGoldPoopAt:  (x, y) => self.spawnGoldPoop(x, y),
      spawnDiamondPoop: () => self.spawnDiamondPoop(),
      spawnTopazPoop:   () => self.spawnTopazPoop(),
      spawnRainbowPoop: () => self.spawnRainbowPoop(),
      collectGoldPoop:    (p) => self.handleGoldCollected(p),
      collectDiamondPoop: (p) => self.handleDiamondCollected(p),
      collectTopazPoop:   (p) => self.handleTopazCollected(p),
      collectRainbowPoop: (p) => self.handleRainbowCollected(p),
    };
  }

  /** rAF 조작 감지용 두 기준점을 현재 시각으로 동시 갱신 */
  private resetCheatCheckpoints() {
    this.lastCheatCheckTime = realNow();
    this.lastPhaserCheckTime = this.time.now;
  }

  /**
   * [안티치트 레이어 5] 수동 AABB 충돌 감지
   * Layer 3(prototype 변조)·Layer 4(physics pause)를 통과한 후에도 실행.
   * _origIntersects: 모듈 로드 시 캡처한 원본 함수 — prototype 변조 우회 불가.
   * body bounds를 직접 비교하므로 body.enable=false 치트도 차단.
   * - 정상 상태에서 hitPoop 이중 호출되어도 gameOver 가드로 안전하게 무시됨
   */
  private checkManualPoopCollision() {
    if (this.gameOver) return;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    if (!playerBody) return;

    // [디버그] physics debug 활성화 시 플레이어 body 영역을 빨간 테두리로 표시 (보라 박스와 일치해야 함)
    if (this.physics.world.drawDebug) {
      if (!this.manualHitboxDebug) {
        this.manualHitboxDebug = this.add.graphics().setDepth(9999);
      }
      this.manualHitboxDebug.clear();
      this.manualHitboxDebug.lineStyle(2, 0xff0000, 1);
      this.manualHitboxDebug.strokeRect(playerBody.x, playerBody.y, playerBody.width, playerBody.height);
    }

    for (const obj of this.poops.getChildren()) {
      const poop = obj as Phaser.Physics.Arcade.Sprite;
      if (!poop.active || !poop.visible) continue;
      const poopBody = poop.body as Phaser.Physics.Arcade.Body;
      if (!poopBody) continue;
      if (_origIntersects.call(this.physics.world, playerBody, poopBody)) {
        this.hitPoop(
          this.player as unknown as Phaser.Types.Physics.Arcade.GameObjectWithBody,
          poop as unknown as Phaser.Types.Physics.Arcade.GameObjectWithBody
        );
        return;
      }
    }
  }

  private handleCheatDetected() {
    this.gameOver = true;
    this.ability.onDestroy(this.abilityAPI);
    this.clearFeverTimeUI();
    this.spawnTimer.remove();
    this.physics.pause();
    this.sound.stopAll();

    const _W = this.scale.width;
    const _H = this.scale.height;
    const _cx = _W / 2;
    this.add.rectangle(_cx, _H / 2, _W, _H, 0x000000, 0.8).setDepth(500);
    this.add.text(_cx, _H / 2, '⚠️ 비정상적인 플레이가\n감지되었습니다', {
      fontSize: '22px',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setDepth(501);

    // SceneManager.prototype.stop 변조 대비: 네이티브 setTimeout으로 강제 새로고침
    // shutdown 이벤트 시 취소 → scene.start()가 정상 작동하면 reload 불필요
    const reloadTimer = window.setTimeout(() => window.location.reload(), 3500);
    this.events.once('shutdown', () => window.clearTimeout(reloadTimer));

    this.time.delayedCall(3000, () => {
      this.scene.start('ModeSelectScene');
    });
  }

  protected spawnPoop() {
    if (this.gameOver) return;
    if (this.ability.isSpawnBlocked()) return;                    // 노이즈 차단
    if (this.ability.overrideSpawnPoop(this.abilityAPI)) return;  // 레거시 금똥 피버

    // 난이도에 따른 개수만큼 생성 (노이즈 특수 능력 + 서브클래스 추가 감소 가능)
    const reduction = this.ability.getSpawnCountReduction();
    const poopCount = Math.max(1, this.difficultyConfig.poopCount - reduction);
    const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement);
    for (let i = 0; i < poopCount; i++) {
      // 💩이 화면 전체에서 생성되도록 (💩 크기 15를 고려해서 양쪽 여유)
      const x = Phaser.Math.Between(15, this.scale.width - 15);
      const y = Phaser.Math.Between(-200, -20);
      const poop = this.poops.get() as Poop;
      if (!poop) continue;
      poop.reinit(x, y, this.difficulty);
      if (poop.body) {
        poop.body.velocity.y = fallSpeed;
      }
    }

    this.ability.onAfterSpawnPoop(this.abilityAPI);
  }

  private spawnGoldPoop(atX?: number, atY?: number) {
    if (this.gameOver) return;

    const x = atX ?? Phaser.Math.Between(50, this.scale.width - 50);
    const y = atY ?? -50;
    const goldPoop = this.goldPoops.get() as GoldPoop;
    if (!goldPoop) return;
    goldPoop.reinit(x, y);

    if (goldPoop.body) {
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.gold.speedReduction - this.ability.specialPoopSpeedReduction('gold');
      goldPoop.body.velocity.y = fallSpeed;
    }

    // console.log(`금똥 생성! 점수: ${this.score}, 위치: (${x}, ${y}), depth: ${goldPoop.depth}`);
  }

  private spawnDiamondPoop() {
    // console.log('[다이아똥] spawnDiamondPoop 메서드 호출됨');
    if (this.gameOver) {
      // console.log('[다이아똥] 게임 오버 상태라 생성 안 함');
      return;
    }

    // 다이아똥 1개를 화면 중앙 상단에서 생성 (더 잘 보이도록)
    const x = Phaser.Math.Between(50, this.scale.width - 50);
    const y = -50;
    const diamondPoop = this.diamondPoops.get() as DiamondPoop;
    if (!diamondPoop) return;
    diamondPoop.reinit(x, y);

    if (diamondPoop.body) {
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.diamond.speedReduction - this.ability.specialPoopSpeedReduction('diamond');
      diamondPoop.body.velocity.y = fallSpeed;
    }

    // console.log(`다이아똥 생성! 점수: ${this.score}, 위치: (${x}, ${y}), depth: ${diamondPoop.depth}`);
  }

  private spawnTopazPoop() {
    if (this.gameOver) return;

    const x = Phaser.Math.Between(50, this.scale.width - 50);
    const y = -50;
    const topazPoop = this.topazPoops.get() as TopazPoop;
    if (!topazPoop) return;
    topazPoop.reinit(x, y);

    if (topazPoop.body) {
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.topaz.speedReduction;
      topazPoop.body.velocity.y = fallSpeed;
    }
  }

  private spawnRainbowPoop() {
    if (this.gameOver) return;

    const x = Phaser.Math.Between(50, this.scale.width - 50);
    const y = -50;
    const rainbowPoop = this.rainbowPoops.get() as RainbowPoop;
    if (!rainbowPoop) return;
    rainbowPoop.reinit(x, y);

    if (rainbowPoop.body) {
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.rainbow.speedReduction;
      rainbowPoop.body.velocity.y = fallSpeed;
    }
  }

  protected handleSpecialCollected(
    poop: Phaser.Physics.Arcade.Sprite,
    type: import('../abilities/types').SpecialPoopType,
    baseScore: number,
    _emoji: string,
    color: string,
    counterIncrement: () => void,
  ) {
    if (this.gameOver) return;
    // 획득은 파괴가 아니다 — 타격 이펙트도, 별도 획득 연출도 넣지 않는다
    (poop as PoolablePoopBase).recycle(true);
    counterIncrement();
    const bonus = this.ability.onCollectSpecial(type) + (this.activeSynergy?.collectBonus ?? 0);
    const total = baseScore + bonus;
    this.collectBonusTotal += bonus;
    this.updateScore(total);
    // 피버 알약 바로 아래 — 피버 중에도 겹치지 않으니 띄운다
    const suffix = bonus > 0 ? ` (+${bonus})` : '';
    this.hud.popSpecial(GameScene.SPECIAL_ICON[type] ?? '', `+${total}${suffix}`, color);
  }

  private handleTopazCollected(poop: Phaser.Physics.Arcade.Sprite) {
    this.handleSpecialCollected(poop, 'topaz', 80, '⭐', '#FFC300', () => { this.topazCollected++; });
  }

  private collectTopazPoop(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _topazPoop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    this.handleTopazCollected(_topazPoop as TopazPoop);
  }

  private handleRainbowCollected(poop: Phaser.Physics.Arcade.Sprite) {
    this.handleSpecialCollected(poop, 'rainbow', 90, '🌈', '#FF00FF', () => { this.rainbowCollected++; });
  }

  private collectRainbowPoop(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _rainbowPoop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    this.handleRainbowCollected(_rainbowPoop as RainbowPoop);
  }

  /**
   * 점수를 증가시키고 보너스 아이템 생성을 체크합니다.
   * @param amount 증가할 점수 (기본값: 1)
   */
  protected updateScore(amount: number = 1) {
    if (!this.gameOver) {
      const oldScore = this.score;
      this.score += amount;
      // 실시간으로 최고 점수 갱신
      if (this.score > this.highScore) this.highScore = this.score;
      if (this.scoreDifficulty === Difficulty.EXTREME && this.score > this.charHighScore) this.charHighScore = this.score;
      this.hud.setScore(this.score);

      // 점수 증가 범위 내에서 건너뛴 생성 포인트를 확인
      this.checkMissedSpawnPoints(oldScore, this.score);

      // 액티브 충전 (기본 점수 기준)
      this.checkActiveCharge();
    }
  }

  /**
   * 액티브 스킬 충전 — **화면에 보이는 점수**로 센다.
   *
   * 한때 능력 보너스를 뺀 "기본 점수"로 셌다. 스킬로 번 점수가 다음 충전으로
   * 되돌아오는 걸 막으려던 건데, 기본 점수는 생존 10점/초가 대부분이라 테드처럼
   * 보너스를 많이 버는 캐릭터는 **화면에 5,000점이 떠도 한 칸이 안 찼다.**
   * 사람이 정한 기준은 "5,000점마다 한 칸"이고 그건 화면 점수다.
   * 스킬 점수가 충전에 되돌아오는 몫은 스킬의 똥 개당 점수로 조절한다.
   */
  private checkActiveCharge(): void {
    const step = this.ability.getActiveChargeScore();
    if (step <= 0) return;                       // 액티브 없는 캐릭터
    const max = this.ability.getActiveMaxCharges();
    while (this.score - this.lastChargeScore >= step) {
      this.lastChargeScore += step;
      if (this.activeCharges < max) {
        this.activeCharges++;
        this.ability.onActiveChargeGained(this.abilityAPI);
      }
      // 꽉 찼으면 기준선만 넘긴다 — 쌓아 두지 않는다 (쓰면 바로 다시 차는 것 방지)
    }
    this.refreshActiveBtn();
  }

  /** 버튼 눌림 — 칸을 먼저 깎고 능력에 넘긴다 */
  private useActiveSkill(): void {
    if (this.gameOver || this.activeCharges <= 0) return;
    if (!this.ability.canUseActive(this.abilityAPI)) return;   // 연출 중이면 삼킨다
    this.activeCharges--;
    // 능력이 먼저 칸을 꺼내 쓴다 (테드는 결과 큐에서 뺀다) — 그 뒤에 버튼을 다시 그려야 맞다
    this.ability.onActiveSkill(this.abilityAPI);
    this.refreshActiveBtn();
  }

  /** 남은 칸 수와 다음 칸까지의 진행을 버튼에 반영. 0칸이거나 지금 발동할 수 없으면(canUseActive) 흐리게 */
  private refreshActiveBtn(): void {
    if (!this.activeBtn || !this.activeBtnLabel) return;
    const usable = this.ability.canUseActive(this.abilityAPI);
    this.activeUsable = usable;
    const ready = this.activeCharges > 0 && usable;
    const plateKey = ready ? this.activePlateKeys.on : this.activePlateKeys.off;
    if (this.activePlate && this.activePlate.texture.key !== plateKey) this.activePlate.setTexture(plateKey);
    const label = String(this.activeCharges);
    if (this.activeBtnLabel.text !== label) this.activeBtnLabel.setText(label);
    this.activeBtnLabel.setColor(ready ? '#ffd166' : '#555a63');
    this.drawActiveRing();
    const step = this.ability.getActiveChargeScore();
    const max = this.ability.getActiveMaxCharges();
    this.drawActiveDots(max);
    this.setActiveFull(this.activeCharges >= max && usable);
    this.ability.updateActiveChargeView(this.abilityAPI, {
      charges: this.activeCharges, max, usable,
      progress: this.activeCharges >= max ? 1 : Phaser.Math.Clamp((this.score - this.lastChargeScore) / step, 0, 1),
    });
  }

  /** 칸 점 — 판 아래에 최대 칸 수만큼, 찬 칸은 금색. 칸 수가 바뀔 때만 다시 그린다 */
  private drawActiveDots(max: number): void {
    const g = this.activeDots, btn = this.activeBtn;
    if (!g || !btn) return;
    const key = `${this.activeCharges}/${max}`;
    if (key === this.lastDotsKey) return;
    this.lastDotsKey = key;
    g.clear();
    const gap = 12, y = btn.y + btn.radius + 12, x0 = btn.x - ((max - 1) * gap) / 2;
    for (let i = 0; i < max; i++) {
      const on = i < this.activeCharges;
      g.fillStyle(on ? 0xffd166 : 0x15161c, on ? 1 : 0.8).fillCircle(x0 + i * gap, y, 4);
      g.lineStyle(1, on ? 0x7a4a00 : 0x3a3d45).strokeCircle(x0 + i * gap, y, 4);
    }
  }

  /** 꽉 찼을 때 — 금빛 후광이 숨 쉬고 READY 꼬리표. 상태가 바뀔 때만 */
  private setActiveFull(full: boolean): void {
    if (full === this.activeShownFull || !this.activeHalo || !this.activeReadyTag) return;
    this.activeShownFull = full;
    this.tweens.killTweensOf(this.activeHalo);
    this.activeReadyTag.setVisible(full);
    if (full) {
      this.activeHalo.setAlpha(0.55);
      this.tweens.add({ targets: this.activeHalo, alpha: 0.9, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      this.activeHalo.setAlpha(0);
    }
  }

  /**
   * 다음 칸까지 차오르는 테두리.
   *
   * 칸 수만 보이면 0 → 1 이 되기 전까지 진행이 안 보여 "안 차는 건지 아직인 건지"
   * 알 수 없다 (실제로 그렇게 버그 신고가 들어왔다). 점수가 오를 때마다 불리지만
   * **1% 단위로 바뀔 때만** 다시 그린다 — 초당 10번 Graphics 를 비우고 그릴 필요가 없다.
   */
  private drawActiveRing(): void {
    const ring = this.activeRing;
    const btn = this.activeBtn;
    if (!ring || !btn) return;
    const step = this.ability.getActiveChargeScore();
    const max = this.ability.getActiveMaxCharges();
    const frac = this.activeCharges >= max
      ? 1
      : Phaser.Math.Clamp((this.score - this.lastChargeScore) / step, 0, 1);
    const pct = Math.floor(frac * 100);
    if (pct === this.lastRingPct) return;
    this.lastRingPct = pct;

    const s = this.activeBtnScale;
    const R = btn.radius + 6 * s;
    ring.clear();
    ring.lineStyle(4 * s, 0x2a2d36, 0.8).strokeCircle(btn.x, btn.y, R);  // 빈 트랙
    if (frac <= 0) return;
    const start = -Math.PI / 2;                                           // 12시에서 시작
    ring.lineStyle(4 * s, 0xffd166, 1);
    ring.beginPath();
    ring.arc(btn.x, btn.y, R, start, start + Math.PI * 2 * frac, false);
    ring.strokePath();
  }

  /**
   * 액티브 스킬 버튼 — 오른쪽 아래 원형.
   *
   * 이동이 `scene.input` 을 우회해 캔버스 DOM 으로 좌/우를 가르기 때문에, 버튼 자리를
   * Player 에게 알려 **이동 판정에서 빼야 한다.** 안 그러면 버튼을 누를 때마다
   * 오른쪽으로 걷는다.
   */
  private createActiveSkillButton(): void {
    if (this.ability.getActiveChargeScore() <= 0) return;      // 액티브 없는 캐릭터
    // 시작 칸 — init() 에서 0 으로 돌린 뒤 여기서 채운다 (재시작해도 다시 채워진다)
    this.activeCharges = Math.min(this.ability.getActiveStartCharges(), this.ability.getActiveMaxCharges());
    for (let i = 0; i < this.activeCharges; i++) this.ability.onActiveChargeGained(this.abilityAPI);
    const { width: W, height: H } = this.scale;
    // 크기·자리·터치 영역은 ACTIVE_BTN 한 곳에서 (모든 캐릭터 공통)
    const R = ACTIVE_BTN.radius;
    const cx = W - ACTIVE_BTN.centerFromRight;
    const cy = H - ACTIVE_BTN.centerFromBottom;
    const s = R / ACTIVE_BTN.baseRadius;                // 테두리·링 굵기 배율
    this.activeBtnScale = s;

    // 금빛 후광 — 꽉 찼을 때만 숨 쉰다 (부드러운 원형 빛 · 빛살 없음)
    this.activeHalo = this.add.image(cx, cy, bakeRadialGlow(this, 'hud_active_halo', 128))
      .setDisplaySize(R * 3.4, R * 3.4).setTint(0xffc94a).setAlpha(0).setDepth(10.5).setScrollFactor(0);

    // 판 — 발동 가능 / 흐림 두 장을 한 번 굽는다
    const on = bakeButton(this, `hud_active_on_${R}`, {
      w: R * 2, h: R * 2, radius: R, top: '#2f3a78', bottom: '#121633', border: '#ffd166', borderW: 3, lip: '#0a0c1e', lipH: 3, gloss: 0.3,
    });
    const off = bakeButton(this, `hud_active_off_${R}`, {
      w: R * 2, h: R * 2, radius: R, top: '#2a2c34', bottom: '#121318', border: '#3a3d45', borderW: 3, lip: '#08090c', lipH: 3, gloss: 0,
    });
    this.activePlateKeys = { on: on.key, off: off.key };
    this.activePlate = this.add.image(cx, cy, on.key).setOrigin(0.5, on.originY).setDepth(11).setScrollFactor(0);
    // 눌리는 원 — 판과 같은 크기 (투명). 링·진행 표시는 이 원의 중심·반지름을 기준으로 그린다
    this.activeBtn = this.add.circle(cx, cy, R, 0x000000, 0).setDepth(11.2).setScrollFactor(0);
    this.activeBtnLabel = this.add.text(cx, cy, '0', {
      fontSize: '24px', color: '#ffd166', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(12).setScrollFactor(0);

    this.activeRing = this.add.graphics().setDepth(12).setScrollFactor(0);
    // 능력이 충전 표시를 직접 그리면(테드의 충전 큐브) 숫자와 진행 링은 능력 몫 — 판은 그대로.
    // 큐브 배율은 판과 따로 (ACTIVE_BTN.viewScale) — 판을 키워도 큐브는 판 안에 들어간다
    if (this.ability.createActiveChargeView(this.abilityAPI, { x: cx, y: cy, r: R, s: ACTIVE_BTN.viewScale })) {
      this.activeBtnLabel.setVisible(false);
      this.activeRing.setVisible(false);
    }

    // 칸 점 (판 아래) · 얼굴 칩 (왼쪽 위) · Space 키캡 (PC, 왼쪽 아래) · READY 꼬리표 (위)
    this.activeDots = this.add.graphics().setDepth(12).setScrollFactor(0);
    const faceSrc = `hud_facesrc_${this.selectedCharId}`;
    if (this.textures.exists(faceSrc)) {
      const fx = cx - R * 0.78, fy = cy - R * 0.78;
      this.add.image(fx, fy, bakeRoundedImage(this, `hud_face_${this.selectedCharId}_22`, faceSrc, 22, 22, 11))
        .setDisplaySize(22, 22).setDepth(12.6).setScrollFactor(0);
      this.add.circle(fx, fy, 11).setStrokeStyle(1.5, 0xffffff).setDepth(12.7).setScrollFactor(0);
    }
    if (this.sys.game.device.os.desktop) {
      const kx = cx - R - 4, ky = cy + R * 0.8;
      this.add.graphics().setDepth(12.6).setScrollFactor(0)
        .fillStyle(0xffffff, 0.94).fillRoundedRect(kx - 21, ky - 9, 42, 18, 9)
        .lineStyle(1.5, 0x121633).strokeRoundedRect(kx - 21, ky - 9, 42, 18, 9);
      this.add.text(kx, ky, 'Space', { fontSize: '10px', color: '#121633', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(12.7).setScrollFactor(0);
    }
    const tag = this.add.container(cx, cy - R - 16).setDepth(12.6).setScrollFactor(0).setVisible(false);
    const tagSkin = bakeButton(this, 'hud_active_ready', {
      w: 64, h: 22, radius: 11, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 2, lip: '#a8650a', lipH: 2, gloss: 0,
    });
    tag.add(this.add.image(0, 0, tagSkin.key).setOrigin(0.5, tagSkin.originY));
    tag.add(this.add.text(0, 0, 'READY', { fontSize: '12px', color: '#5b2e0e', fontStyle: 'bold' }).setOrigin(0.5));
    this.activeReadyTag = tag;

    // 눌리는 영역 = 보이는 판 (지름 60, 하한 44). 원의 로컬 좌표는 왼쪽 위가 0 이라 중심이 (R, R)
    const hitR = Math.max(R, ACTIVE_BTN.hitRadius);
    this.activeBtn.setInteractive({
      hitArea: new Phaser.Geom.Circle(R, R, hitR),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });
    this.activeBtn.on('pointerup', () => this.useActiveSkill());

    // 버튼 자리를 이동 판정에서 뺀다 — 보이는 원이 아니라 **눌리는 영역** 기준
    const ex = hitR + ACTIVE_BTN.exclusionPad;
    this.player.setInputExclusion(new Phaser.Geom.Rectangle(cx - ex, cy - ex, ex * 2, ex * 2));

    // PC — 스페이스로도 발동한다. 이동 키와 같은 방식(창 레벨 · 캡처 단계)으로 받는다:
    // 외부 스크립트(Vercel 프리뷰 툴바 등)가 키를 가로채도 먼저 받는다 (Player 참고)
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      // 게임 오버 후 이니셜 입력칸 등에 스페이스를 치는 경우 — 건드리지 않는다
      const t = e.target as HTMLElement | null;
      if (this.gameOver || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return;
      e.preventDefault();                                     // 페이지 스크롤 방지
      this.useActiveSkill();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    // 재시작·종료 때 반드시 떼야 한다 — 남으면 다음 판에 한 번 누를 때 두 번 발동한다
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey, { capture: true }));

    this.refreshActiveBtn();
  }

  /**
   * 점수가 증가하는 동안 건너뛴 생성 포인트를 확인하고 생성
   * @param oldScore 이전 점수
   * @param newScore 새 점수
   */
  private checkMissedSpawnPoints(oldScore: number, newScore: number) {
    // 캐릭터별 스폰 간격 (노이즈는 단축)
    const intervals = this.ability.getSpawnIntervals();

    /**
     * 한 번의 점수 증가로 만들 수 있는 특수 똥 총량.
     *
     * 이 루프는 점수를 1점씩 훑으며 놓친 생성 지점을 메운다 — 1점씩 오르는 동안에는
     * 아무 문제가 없다. 문제는 **능력 보너스가 점수를 한 번에 수백 점 올릴 때**다.
     * 예를 들어 K 의 에너지파는 지운 똥 1개당 50점을 한 번에 준다. +1100 이면 이 루프가
     * 금똥 27 · 다이아 11 · 토파즈 6 을 **한 프레임에** 쏟아내고, 그 순간 물리 바디가
     * 40개 넘게 늘어나며 눈에 보이는 끊김이 생긴다.
     * 예산을 넘긴 몫은 생성하지 않고 마커(lastGoldPoopScore 등)만 앞으로 넘긴다 —
     * 다음 프레임에 밀려 터지지 않게(밀리면 같은 문제가 이월될 뿐이다).
     */
    let budget = 3;

    for (let score = oldScore + 1; score <= newScore; score++) {
      // 피버 타임 체크
      this.checkFeverTime(score);

      // 피버 타임 중이 아닐 때만 일반 금똥/다이아똥/토파즈똥 생성.
      // **예산을 넘긴 몫은 생성하지 않고 마커만 넘긴다** — 아래 주석 참조.
      if (!this.isFeverTime) {
        if (score % intervals.gold === 0 && score > this.lastGoldPoopScore) {
          if (budget > 0) { this.spawnGoldPoop(); budget--; }
          this.lastGoldPoopScore = score;
        }

        if (score % intervals.diamond === 0 && score > this.lastDiamondPoopScore) {
          if (budget > 0) { this.spawnDiamondPoop(); budget--; }
          this.lastDiamondPoopScore = score;
        }

        if (score % intervals.topaz === 0 && score > this.lastTopazPoopScore) {
          if (budget > 0) { this.spawnTopazPoop(); budget--; }
          this.lastTopazPoopScore = score;
        }
      }

      // 점수 기반 난이도 증가
      if (score % DIFFICULTY_SCALING.scoreInterval === 0) this.increaseDifficulty();

      // 매화×매화 시너지: 설정된 간격마다 화면의 모든 똥 제거
      if (
        this.activeSynergy?.clearPoops === true &&
        score % MAEHWA_PARAMS.synergyBurstInterval === 0 &&
        score > this.lastClearPoopsScore
      ) {
        this.lastClearPoopsScore = score;
        this.clearAllPoopsWithEffect();
      }

      // 캐릭터 능력 마일스톤 (광부 무지개똥, 루트 똥 제거, 매화 슬래시 등)
      this.ability.onScoreMilestone(score, this.abilityAPI);
    }
  }

  /** spawnTimer를 현재 난이도 delay로 교체하는 헬퍼 */
  private resetSpawnTimer(callback: () => void) {
    this.spawnTimer.remove();
    this.spawnTimer = this.time.addEvent({
      delay: this.currentSpawnDelay,
      callback,
      callbackScope: this,
      loop: true
    });
  }

  private increaseDifficulty() {
    this.difficultyLevel += DIFFICULTY_SCALING.levelIncrement;
    this.resetSpawnTimer(
      this.isFeverTime
        ? (this.isRainbowFever ? this.spawnRainbowFeverPoop : this.spawnFeverPoop)
        : this.spawnPoop
    );
  }

  /**
   * 피버 타임 발동 조건 체크 (O(1) — nextFeverScore 캐시 활용)
   * checkMissedSpawnPoints에서 매 점수마다 호출되므로 while 루프 대신 캐시값 비교
   */
  private checkFeverTime(score: number) {
    if (score < this.nextFeverScore) return;

    this.startFeverTime();

    // 다음 피버 트리거 점수 계산: gap(k) = baseInterval + floor((k-1)/intervalIncreaseEvery) * intervalIncrement
    const { baseInterval, intervalIncrement, intervalIncreaseEvery } = FEVER_TIME_CONFIG;
    const gap = baseInterval + Math.floor((this.feverScoreK - 1) / intervalIncreaseEvery) * intervalIncrement;
    this.nextFeverScore += gap;
    this.feverScoreK++;
  }

  /**
   * 피버 타임 시작 (기존 똥을 보너스 아이템으로 변환)
   */
  private startFeverTime() {
    if (this.gameOver) return;

    this.isFeverTime = true;
    this.feverTimeRemaining = FEVER_TIME_CONFIG.duration;
    this.lastDisplayedFeverSecond = -1; // 다음 updateFeverTime에서 반드시 렌더링하도록 초기화

    // 레인보우 피버: 시너지에 rainbowFever 플래그가 있고 2번째 피버부터 4회마다 (2, 6, 10...)
    this.feverCount++;
    const isRainbowFeverNow =
      this.activeSynergy?.rainbowFever === true &&
      this.feverCount >= 2 &&
      (this.feverCount - 2) % 4 === 0;
    this.isRainbowFever = isRainbowFeverNow;

    // 기존 화면 위 똥들 처리
    if (isRainbowFeverNow) {
      // 레인보우 피버: 모든 기존 똥(일반+금+다이아)을 무지개똥으로 변환
      const positions: Array<{ x: number; y: number; velocity: number }> = [];

      this.poops.children.entries.forEach((poop) => {
        const s = poop as Poop;
        if (!s.active) return;
        const body = s.body as Phaser.Physics.Arcade.Body;
        if (!body) return;
        positions.push({ x: s.x, y: s.y, velocity: body.velocity.y });
        s.recycle(true); // 피버 변환 — 버블 연출이 따로 있다
      });
      [this.goldPoops, this.diamondPoops].forEach((group) => {
        group.children.entries.forEach((item) => {
          const s = item as PoolablePoopBase;
          if (!s.active) return;
          const body = s.body as Phaser.Physics.Arcade.Body;
          if (!body) return;
          positions.push({ x: s.x, y: s.y, velocity: body.velocity.y });
          s.recycle(true); // 피버 변환
        });
      });

      positions.forEach((pos) => {
        for (let b = 0; b < 7; b++) {
          const r = Phaser.Math.Between(3, 7);
          const startX = pos.x + Phaser.Math.Between(-10, 10);
          const bubble = this.add.circle(startX, pos.y, r, GameScene.BUBBLE_COLORS[b % GameScene.BUBBLE_COLORS.length], 0.9).setDepth(200);
          this.tweens.add({
            targets: bubble,
            x: startX + Phaser.Math.Between(-18, 18),
            y: pos.y - Phaser.Math.Between(28, 55),
            alpha: 0,
            scaleX: 0.2,
            scaleY: 0.2,
            duration: Phaser.Math.Between(280, 480),
            ease: 'Sine.easeOut',
            delay: b * 20,
            onComplete: () => bubble.destroy(),
          });
        }

        const rp = this.rainbowPoops.get() as RainbowPoop;
        if (!rp) return;
        rp.reinit(pos.x, pos.y);
        if (rp.body) {
          rp.body.velocity.y = pos.velocity * FEVER_TIME_CONFIG.speedMultiplier;
        }
      });
    } else {
      // 일반 피버: 기존 일반 똥 → 금똥/다이아똥 변환
      if (this.poops) {
        const poopPositions: Array<{ x: number; y: number; velocity: number }> = [];

        this.poops.children.entries.forEach((poop) => {
          const poopSprite = poop as Poop;
          if (!poopSprite.active) return;
          const body = poopSprite.body as Phaser.Physics.Arcade.Body;
          if (!body) return;
          poopPositions.push({ x: poopSprite.x, y: poopSprite.y, velocity: body.velocity.y });
          poopSprite.recycle(true); // 피버 변환
        });

        poopPositions.forEach((pos) => {
          const isGold = Math.random() < 0.5;
          if (isGold) {
            const goldPoop = this.goldPoops.get() as GoldPoop;
            if (goldPoop) {
              goldPoop.reinit(pos.x, pos.y);
              if (goldPoop.body) {
                goldPoop.body.velocity.y = pos.velocity * FEVER_TIME_CONFIG.speedMultiplier;
              }
            }
          } else {
            const diamondPoop = this.diamondPoops.get() as DiamondPoop;
            if (diamondPoop) {
              diamondPoop.reinit(pos.x, pos.y);
              if (diamondPoop.body) {
                diamondPoop.body.velocity.y = pos.velocity * FEVER_TIME_CONFIG.speedMultiplier;
              }
            }
          }
        });
      }

      // 기존 금똥/다이아똥 속도만 증가
      [this.goldPoops, this.diamondPoops].forEach((group) => {
        group.children.entries.forEach((item) => {
          const s = item as PoolablePoopBase;
          if (s.body) s.body.velocity.y *= FEVER_TIME_CONFIG.speedMultiplier;
        });
      });
    }

    // spawnTimer를 피버 타임 생성 패턴으로 교체
    this.resetSpawnTimer(isRainbowFeverNow ? this.spawnRainbowFeverPoop : this.spawnFeverPoop);

    // 피버 알약 — 위 HUD 바로 아래 (가운데 무지개 글자 대신)
    this.hud.showFever(isRainbowFeverNow, Math.ceil(FEVER_TIME_CONFIG.duration / 1000));

    // 카운트다운 타이머
    if (this.feverTimeTimer) {
      this.feverTimeTimer.remove();
    }
    this.feverTimeTimer = this.time.addEvent({
      delay: 100,
      callback: this.updateFeverTime,
      callbackScope: this,
      loop: true
    });
  }

  /**
   * 피버 타임 카운트다운 업데이트
   * 초(second) 값이 실제로 변경될 때만 텍스트/위치를 재계산해 setText 오버헤드 최소화
   */
  private updateFeverTime() {
    this.feverTimeRemaining -= 100;

    if (this.feverTimeRemaining <= 0) {
      this.endFeverTime();
      return;
    }

    const secondsRemaining = Math.ceil(this.feverTimeRemaining / 1000);
    if (secondsRemaining === this.lastDisplayedFeverSecond) return; // 초 변화 없으면 스킵
    this.lastDisplayedFeverSecond = secondsRemaining;
    this.hud.setFeverSeconds(secondsRemaining);
  }

  /** 피버 타임 UI/타이머 정리 (spawnTimer 재설정 없음). 비활성 상태면 no-op. */
  private clearFeverTimeUI() {
    if (!this.isFeverTime) return;
    this.isFeverTime = false;
    this.isRainbowFever = false;
    this.feverTimeTimer?.remove();
    this.hud.hideFever();
  }

  private endFeverTime() {
    this.clearFeverTimeUI();

    // 일반 생성 패턴으로 복구
    this.resetSpawnTimer(this.spawnPoop);
  }

  /**
   * 피버 타임 생성 패턴 (설정 기반, 속도 증가)
   */
  private spawnFeverPoop() {
    if (this.gameOver) return;

    const baseFallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement);

    // 1. 일반 똥 생성 (피버 타임 속도 배수 적용)
    const normalFallSpeed = baseFallSpeed * FEVER_TIME_CONFIG.speedMultiplier;
    for (let i = 0; i < FEVER_TIME_CONFIG.normalPoopCount; i++) {
      const x = Phaser.Math.Between(15, this.scale.width - 15);
      const y = Phaser.Math.Between(-200, -20);
      const poop = this.poops.get() as Poop;
      if (!poop) continue;
      poop.reinit(x, y, this.difficulty);
      if (poop.body) {
        poop.body.velocity.y = normalFallSpeed;
      }
    }

    // 2. 금똥/다이아똥 랜덤 생성 (피버 타임 속도 배수 적용)
    for (let i = 0; i < FEVER_TIME_CONFIG.bonusPoopCount; i++) {
      const x = Phaser.Math.Between(50, this.scale.width - 50);
      const y = Phaser.Math.Between(-200, -50);

      // 50% 확률로 금똥 또는 다이아똥 결정
      const isGold = Math.random() < 0.5;

      if (isGold) {
        const goldPoop = this.goldPoops.get() as GoldPoop;
        if (goldPoop) {
          goldPoop.reinit(x, y);
          if (goldPoop.body) {
            goldPoop.body.velocity.y = (baseFallSpeed - POOP_CONFIG.gold.speedReduction) * FEVER_TIME_CONFIG.speedMultiplier;
          }
        }
      } else {
        const diamondPoop = this.diamondPoops.get() as DiamondPoop;
        if (diamondPoop) {
          diamondPoop.reinit(x, y);
          if (diamondPoop.body) {
            diamondPoop.body.velocity.y = (baseFallSpeed - POOP_CONFIG.diamond.speedReduction) * FEVER_TIME_CONFIG.speedMultiplier;
          }
        }
      }
    }

    this.ability.onAfterSpawnPoop(this.abilityAPI);
  }

  /**
   * 레인보우 피버 생성 패턴 — 무지개똥만 소환 (광부×황금광산 시너지)
   */
  private spawnRainbowFeverPoop() {
    if (this.gameOver) return;

    const baseFallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement);
    const fallSpeed = baseFallSpeed * FEVER_TIME_CONFIG.speedMultiplier;
    const totalCount = FEVER_TIME_CONFIG.normalPoopCount + FEVER_TIME_CONFIG.bonusPoopCount;

    for (let i = 0; i < totalCount; i++) {
      const x = Phaser.Math.Between(50, this.scale.width - 50);
      const y = Phaser.Math.Between(-200, -20);
      const rp = this.rainbowPoops.get() as RainbowPoop;
      if (!rp) continue;
      rp.reinit(x, y);
      if (rp.body) {
        rp.body.velocity.y = fallSpeed;
      }
    }
  }

  /**
   * 매화×매화 시너지: 화면의 모든 똥 제거 + 매화 꽃잎 폭발 이펙트
   */
  private clearAllPoopsWithEffect(): void {
    if (this.gameOver) return;

    // 모든 그룹의 활성 오브젝트 수집 (위치 기록 후 제거)
    const positions: Array<{ x: number; y: number }> = [];

    const collectGroup = (group: Phaser.Physics.Arcade.Group, handler: (sp: Phaser.Physics.Arcade.Sprite) => void) => {
      [...group.children.entries].forEach(obj => {
        const sp = obj as Phaser.Physics.Arcade.Sprite;
        if (sp.active) { positions.push({ x: sp.x, y: sp.y }); handler(sp); }
      });
    };

    // 모든 똥 recycle (점수는 개별이 아닌 고정 보너스로 일괄 지급)
    // 매화 시너지 버스트는 자체 연출(spawnMaehwaBurst)이 있으므로 타격 이펙트는 생략
    const recycleAll = (sp: Phaser.Physics.Arcade.Sprite) => (sp as unknown as PoolablePoopBase).recycle(true);
    collectGroup(this.poops, recycleAll);
    collectGroup(this.goldPoops, recycleAll);
    collectGroup(this.diamondPoops, recycleAll);
    collectGroup(this.topazPoops, recycleAll);

    this.updateScore(MAEHWA_PARAMS.synergyBurstBonus);

    const effectPositions = positions.length > 0 ? positions : [{ x: 200, y: 300 }];
    effectPositions.forEach(pos => this.spawnMaehwaBurst(pos.x, pos.y));
    this.spawnMaehwaStorm();

    // 화면 전체 분홍빛 플래시 — setScrollFactor(0)으로 카메라 독립, 오브젝트 alpha로 fade 제어
    const flash = this.add.graphics().setDepth(200).setAlpha(0.3).setScrollFactor(0);
    flash.fillStyle(0xff6699, 1);
    flash.fillRect(0, 0, this.scale.width, this.scale.height);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 500,
      ease: 'Quad.easeIn',
      onComplete: () => flash.destroy(),
    });
  }

  /** 매화 꽃잎 폭발 — 한 지점에서 칼날 이펙트 + 꽃잎 여러 장 사방으로 비산 */
  private spawnMaehwaBurst(cx: number, cy: number): void {
    // 칼날 이펙트 (↗ 방향 마름모꼴)
    const slash = this.add.graphics().setDepth(195);
    const len = 26, wid = 7;
    slash.fillStyle(0xff3366, 0.9);
    slash.fillPoints([
      new Phaser.Geom.Point(cx - len, cy + len),
      new Phaser.Geom.Point(cx - wid * 0.4, cy + wid),
      new Phaser.Geom.Point(cx + len, cy - len),
      new Phaser.Geom.Point(cx + wid * 0.4, cy - wid),
    ], true);
    slash.lineStyle(3, 0xffffff, 0.5);
    slash.lineBetween(cx - len, cy + len, cx + len, cy - len);
    this.tweens.add({ targets: slash, alpha: 0, duration: 300, onComplete: () => slash.destroy() });

    const COUNT = 10;
    for (let i = 0; i < COUNT; i++) {
      const petal = this.add.graphics().setDepth(190);
      petal.setPosition(cx, cy);
      const w = Phaser.Math.Between(4, 8);
      const h = Phaser.Math.Between(7, 12);
      petal.fillStyle(0xff3377, 0.9);
      petal.fillEllipse(0, 0, w, h);
      petal.setAngle(Phaser.Math.Between(0, 360));

      const angle = Phaser.Math.Between(0, 360);
      const dist  = Phaser.Math.Between(40, 90);
      this.tweens.add({
        targets: petal,
        x: cx + Math.cos(Phaser.Math.DegToRad(angle)) * dist,
        y: cy + Math.sin(Phaser.Math.DegToRad(angle)) * dist + Phaser.Math.Between(20, 50),
        angle: petal.angle + Phaser.Math.Between(-180, 180),
        alpha: 0,
        duration: Phaser.Math.Between(500, 900),
        ease: 'Quad.easeOut',
        onComplete: () => petal.destroy(),
      });
    }
  }

  /**
   * 꽃잎 눈보라 — 위에서 바람에 날려 쏟아지는 폭풍 이펙트
   * 단일 Graphics 객체 사용: 55개 개별 객체(55 draw call/frame) → 1개(1 draw call/frame)
   */
  private spawnMaehwaStorm(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const COUNT = 55;
    const DURATION = 2200;

    const gfx = this.add.graphics().setDepth(194);

    const petals = Array.from({ length: COUNT }, () => ({
      startX:     Phaser.Math.Between(-30, W + 30),
      startY:     Phaser.Math.Between(-120, -5),
      fallSpeed:  0.35 + Math.random() * 0.65,
      windDrift:  Phaser.Math.Between(30, 80),
      wobbleFreq: 1.5 + Math.random() * 2.5,
      wobbleAmp:  12 + Math.random() * 22,
      wobblePhase: Math.random() * Math.PI * 2,
      delay:      Math.random() * 0.35,
      size:       Phaser.Math.Between(3, 8) as number,
      color:      (Math.random() > 0.45 ? 0xff3377 : 0xff99bb) as number,
      baseAlpha:  0.65 + Math.random() * 0.35,
    }));

    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: DURATION,
      onUpdate: (tween) => {
        const g = tween.getValue() ?? 0;
        gfx.clear();
        for (const p of petals) {
          const t = Math.max(0, (g - p.delay) / (1 - p.delay));
          const ft = Math.min(t * p.fallSpeed, 1);
          const sinW = Math.sin(ft * Math.PI * 2 * p.wobbleFreq + p.wobblePhase);
          const x = p.startX + ft * p.windDrift + sinW * p.wobbleAmp;
          const y = p.startY + ft * (H + 140);
          const alpha = (ft > 0.78 ? 1 - (ft - 0.78) / 0.22 : 1) * p.baseAlpha;
          if (alpha <= 0) continue;
          gfx.fillStyle(p.color, alpha);
          gfx.fillEllipse(x, y, p.size, Math.round(p.size * 1.7));
        }
      },
      onComplete: () => gfx.destroy(),
    });
  }

  protected hitPoop(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    poop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    if (this.gameOver) return;
    if (this.player.getIsInvincible()) return;

    // 센티넬: 보호막이 있으면 게임오버 대신 보호막 소모 + 똥 반환
    if (this.ability.onHitPoop(this.abilityAPI)) {
      this.player.playHitAnim();
      (poop as unknown as PoolablePoopBase).recycle();
      return;
    }

    this.player.playHitAnim();
    this.gameOver = true;
    this.manualHitboxDebug?.clear();
    this.ability.onDestroy(this.abilityAPI);
    this.clearFeverTimeUI();
    this.spawnTimer.remove();
    this.physics.pause();

    // 점수 검증 데이터 로그
    const gameEndTime = realNow();
    const playDuration = gameEndTime - this.gameStartTime;
    const bonusScore = this.goldCollected * 20 + this.diamondCollected * 40 + this.topazCollected * 80 + this.rainbowCollected * 90;
    const timeScore = Math.floor(playDuration / 100); // 100ms당 1점
    const expectedScore = timeScore + bonusScore;
    const phaserTime = this.time.now - this.phaserStartTime; // 이번 게임의 Phaser 경과 시간
    const timeRatio = phaserTime / playDuration;
    console.log('[점수 검증 데이터]', {
      최종점수: this.score,
      시간점수: timeScore,
      보너스점수: bonusScore,
      예상점수: expectedScore,
      점수차이: this.score - expectedScore,
      현실시간: `${(playDuration / 1000).toFixed(1)}초`,
      Phaser시간: `${(phaserTime / 1000).toFixed(1)}초`,
      시간비율: timeRatio.toFixed(2),
      금똥: this.goldCollected,
      다이아똥: this.diamondCollected,
      토파즈똥: this.topazCollected,
      무지개똥: this.rainbowCollected,
    });

    const isNewRecord = updateHighScore(this.scoreDifficulty, this.score);
    const isCharNewRecord = this.scoreDifficulty === Difficulty.EXTREME
      && this.score > this.charHighScoreAtStart;

    // 게임 오버 UI 표시 (비동기 처리)
    this.showGameOverUI(isNewRecord, isCharNewRecord);
  }

  private handleGoldCollected(poop: Phaser.Physics.Arcade.Sprite) {
    this.handleSpecialCollected(poop, 'gold', 20, '💰', '#FFD700', () => { this.goldCollected++; });
  }

  private collectGoldPoop(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _goldPoop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    this.handleGoldCollected(_goldPoop as GoldPoop);
  }

  private handleDiamondCollected(poop: Phaser.Physics.Arcade.Sprite) {
    this.handleSpecialCollected(poop, 'diamond', 40, '💎', '#00FFFF', () => { this.diamondCollected++; });
  }

  private collectDiamondPoop(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _diamondPoop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    this.handleDiamondCollected(_diamondPoop as DiamondPoop);
  }

  /**
   * 게임 오버 UI 표시 및 랭킹 시스템 연동
   */
  /**
   * 게임 시작 때 내 순위를 받아 둔다 — 게임오버에서 등록 뒤 순위와 비교해 ▲N 을 보인다.
   * 서버를 고치지 않고 지금 있는 leaderboard-top 조회의 currentUserRank 를 쓴다.
   * 결과: number = 순위, null = 이번 시즌 기록 없음, undefined = 조회 실패 (칩에 '-')
   */
  private fetchMyRanks(): Promise<{ all: RankValue; char: RankValue }> {
    const diff = this.scoreDifficulty;
    const mine = (p: Promise<LeaderboardResponse>): Promise<RankValue> =>
      p.then(r => r.currentUserRank?.rank ?? null).catch(() => undefined);
    return Promise.all([
      mine(getLeaderboard(diff, 1)),
      // 캐릭터 순위는 EXTREME 에만 있다 (leaderboard-top 의 characterType 조회)
      diff === Difficulty.EXTREME ? mine(getLeaderboard(diff, 1, this.selectedCharId)) : Promise.resolve(undefined),
    ]).then(([all, char]) => ({ all, char }));
  }

  /** 늦으면 기다리지 않는다 — 화면을 막지 않고 칩에 '-' */
  private withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([p, new Promise<T>(res => this.time.delayedCall(ms, () => res(fallback)))]);
  }

  protected async showGameOverUI(isNewRecord: boolean, isCharNewRecord: boolean = false) {
    const view = new GameOverView(this, {
      score: this.score,
      isNewRecord,
      prevBest: this.highScoreAtStart,
      charId: this.selectedCharId,
      charBest: this.scoreDifficulty === Difficulty.EXTREME ? this.charHighScoreAtStart : null,
      collected: { gold: this.goldCollected, diamond: this.diamondCollected, topaz: this.topazCollected, rainbow: this.rainbowCollected },
      desktop: this.sys.game.device.os.desktop,
    }, {
      onRetry: () => this.restartGame(),
      onMenu: () => this.goToMenu(),
      onSubmitInitials: (initials) => this.registerScore(view, initials),
    });
    this.gameOverView = view;
    this.armRestartKey();

    // SKOR 정산 (백그라운드, 모든 모드)
    this.submitSkorOnGameOver(view);

    // 순위 칩 — 게임 시작 때 받아 둔 순위
    const before = await this.withTimeout(this.rankBefore ?? Promise.resolve({ all: undefined, char: undefined }), 3000,
      { all: undefined, char: undefined } as { all: RankValue; char: RankValue });
    if (!this.scene.isActive() || this.gameOverView !== view) return;
    this.ranksAtStart = before;

    if (isNewRecord) {
      // 신기록 — 등록해야 순위가 바뀐다. 그 전까지는 지금 순위
      view.setRank('all', before.all, undefined, '등록하면 갱신');
      if (this.scoreDifficulty === Difficulty.EXTREME) view.setRank('char', before.char, undefined, isCharNewRecord ? '등록하면 갱신' : undefined);
      view.prefillInitials(getUserInitials());
      return;
    }

    // 개인 최고를 못 넘었으면 전체 순위는 그대로 (서버는 이번 시즌 최고만 둔다)
    view.setRank('all', before.all, before.all);
    if (this.scoreDifficulty !== Difficulty.EXTREME) return;
    view.setRank('char', before.char, before.char);
    // EXTREME 비신기록: 캐릭터 최고 갱신 시 저장된 이니셜로 조용히 제출하고 캐릭터 순위만 다시 받는다
    if (isCharNewRecord) {
      const savedInitials = getUserInitials();
      if (savedInitials) {
        await this.submitScoreForCharRanking(savedInitials);
        await this.refreshCharRank(view);
      }
    }
  }

  /** 등록 뒤 캐릭터 순위 다시 받기 (캐시를 비우고) */
  private async refreshCharRank(view: GameOverView) {
    if (this.scoreDifficulty !== Difficulty.EXTREME) return;
    invalidateLeaderboardCache();
    const after = await this.withTimeout(
      getLeaderboard(this.scoreDifficulty, 1, this.selectedCharId).then(r => r.currentUserRank?.rank ?? null).catch(() => undefined as RankValue),
      4000, undefined as RankValue);
    if (!this.scene.isActive() || this.gameOverView !== view) return;
    view.setRank('char', after, this.ranksAtStart?.char);
  }

  /** 신기록 — 이니셜로 랭킹 등록 (검증은 GameOverView 가 마쳤다) */
  private async registerScore(view: GameOverView, initials: string) {
    setUserInitials(initials);
    try {
      const sessionId = await this.sessionPromise;
      const result = await submitScore(
        this.score,
        this.scoreDifficulty,
        initials,
        {
          gameStartTime: this.gameStartTime,
          gameEndTime: realNow(),
          goldCollected: this.goldCollected,
          diamondCollected: this.diamondCollected,
          topazCollected: this.topazCollected,
          rainbowCollected: this.rainbowCollected,
          collectBonusTotal: this.collectBonusTotal,
          abilityBonusTotal: this.abilityBonusTotal,
        },
        this.selectedCharId,
        sessionId
      );
      if (this.scoreDifficulty === Difficulty.EXTREME) updateExtremeCharBest(this.selectedCharId, this.score);
      if (!this.scene.isActive() || this.gameOverView !== view) return;
      view.setRank('all', result.rank ?? undefined, this.ranksAtStart?.all);
      view.showRegistered(result.rank !== null ? `${initials} · 전체 ${result.rank}위 등록` : `${initials} 등록 완료`, true);
      await this.refreshCharRank(view);
    } catch (error) {
      console.error('Failed to submit score:', error);
      if (this.scene.isActive() && this.gameOverView === view) view.showRegistered('랭킹 등록 실패', false);
    }
  }

  private async submitScoreForCharRanking(initials: string) {
    try {
      const sessionId = await this.sessionPromise;
      await submitScore(
        this.score,
        this.scoreDifficulty,
        initials,
        {
          gameStartTime: this.gameStartTime,
          gameEndTime: realNow(),
          goldCollected: this.goldCollected,
          diamondCollected: this.diamondCollected,
          topazCollected: this.topazCollected,
          rainbowCollected: this.rainbowCollected,
          collectBonusTotal: this.collectBonusTotal,
          abilityBonusTotal: this.abilityBonusTotal,
        },
        this.selectedCharId,
        sessionId
      );
      updateExtremeCharBest(this.selectedCharId, this.score);
    } catch {
      // 캐릭터 랭킹 제출 실패 시 UX 영향 없이 무시
    }
  }

  // 서버 getBracketCap과 동일 — 낙관적 UI 계산용 (서버 응답 전 예상값 표시)
  private getSkorBracketCap(score: number): number {
    if (score < 500)  return 20;
    if (score < 1000) return 45;
    if (score < 1500) return 80;
    if (score < 2000) return 115;
    if (score < 3000) return 160;
    if (score < 5000) return 215;
    return 280;
  }

  /**
   * 게임오버 시 SKOR 정제 수익 제출 — 결과는 SKOR 칩 한 자리에서 '정산 중' → 낙관 값 → 서버 값 순서로 바뀐다
   */
  private async submitSkorOnGameOver(view: GameOverView) {
    const sessionData = {
      goldCollected: this.goldCollected,
      diamondCollected: this.diamondCollected,
      topazCollected: this.topazCollected,
      rainbowCollected: this.rainbowCollected,
    };
    view.setSkor('…', '정산 중', '#c9c9d6');

    // ── 낙관적 UI: 서버 응답 전에 예상 SKOR 즉시 계산 ──
    const rawSkor =
      sessionData.goldCollected * 0.5 +
      sessionData.diamondCollected * 1.5 +
      sessionData.topazCollected * 3.5 +
      sessionData.rainbowCollected * 10.0;
    const estimatedSkor = Math.floor(Math.min(rawSkor, this.getSkorBracketCap(this.score)));

    // floor 후 0이면 API 호출 없이 즉시 종료 (퀘스트 진행도도 없음)
    if (estimatedSkor <= 0) {
      view.setSkor('+0', '아이템 없음', '#888888');
      return;
    }

    // ── 낙관적 퀘스트 계산: 캐시된 누적값으로 즉시 표시 ──
    const questCache = getQuestProgressCache();
    const estimatedQuests = questCache ? estimateQuestRewards(questCache, sessionData) : [];
    const estimatedQuestSkor = estimatedQuests.reduce((s, r) => s + r.reward, 0);
    const optimisticTotal = estimatedSkor + estimatedQuestSkor;
    view.setSkor(`+${optimisticTotal}`, estimatedQuestSkor > 0 ? `퀘스트 +${estimatedQuestSkor} 포함` : '');

    // ── 백그라운드 API 호출: 실제 결과로 보정 ──
    try {
      const result: SkorSubmitResponse = await submitSkor({
        score: this.score,
        ...sessionData,
      });

      if (!this.scene.isActive()) return;

      if (result.questProgressAfter) {
        setQuestProgressCache(result.questProgressAfter);
      }

      if (result.weeklyCapRemaining <= 0 && result.totalSkorAdded === 0) {
        view.setSkor('0', '주간 한도 도달', '#888888');
        return;
      }

      const questSkor = result.questRewards.reduce((s, r) => s + r.reward, 0);
      view.setSkor(`+${result.totalSkorAdded}`, questSkor > 0 ? `퀘스트 +${questSkor} 포함` : '');
    } catch {
      // 실패해도 낙관적으로 보여준 숫자 유지 (정제 결과는 서버에서 처리됨)
    }
  }

  /** 게임 오버 뒤 스페이스가 재시작으로 받아지기까지의 유예 (ms) — 게임오버 화면이 뜬 시점부터 */
  private static readonly RESTART_KEY_ARM_MS = 400;

  /** 다시 하기 — 버튼·스페이스가 같이 쓴다 */
  private restartGame(): void {
    this.gameOverView?.destroy();
    this.sound.stopAll();
    if (this.player) this.player.cleanupEffects();
    this.scene.restart({ gameMode: this.gameMode, difficulty: this.difficulty, purePhysical: this.purePhysical });
  }

  private goToMenu(): void {
    this.gameOverView?.destroy();
    this.sound.stopAll();
    if (this.player) this.player.cleanupEffects();
    this.scene.start('ModeSelectScene');
  }

  /**
   * PC — 스페이스로도 다시 하기. 액티브 스페이스와 같은 방식(창 레벨 · 캡처 단계)으로 받는다.
   * **게임오버 화면이 뜬 뒤에만** 리스너가 생기고, 그래도 RESTART_KEY_ARM_MS 동안은 무시한다 —
   * 죽기 직전 액티브를 쓰려고 연타하던 스페이스가 그대로 재시작이 되지 않게
   */
  private armRestartKey(): void {
    const armedAt = realNow() + GameScene.RESTART_KEY_ARM_MS;
    const onRestartKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;   // 이니셜 입력 중
      if (!this.gameOver || realNow() < armedAt) return;
      e.preventDefault();                                     // 페이지 스크롤 방지
      window.removeEventListener('keydown', onRestartKey, { capture: true });   // 한 번만
      this.restartGame();
    };
    window.addEventListener('keydown', onRestartKey, { capture: true });
    // 재시작·메인 메뉴로 나갈 때 떼야 한다 — 남으면 다음 판 진행 중 스페이스가 재시작이 된다
    this.events.once('shutdown', () => window.removeEventListener('keydown', onRestartKey, { capture: true }));
  }
}
