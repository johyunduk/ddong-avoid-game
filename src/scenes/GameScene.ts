import Phaser from 'phaser';
import Player from '../objects/Player';

// [안티치트] 모듈 로드 시점(콘솔 스크립트 주입 이전)에 원본 함수 캡처
const _origOverlap     = Phaser.Physics.Arcade.World.prototype.overlap;
const _origIntersects  = Phaser.Physics.Arcade.World.prototype.intersects;
import Poop from '../objects/Poop';
import GoldPoop from '../objects/GoldPoop';
import DiamondPoop from '../objects/DiamondPoop';
import TopazPoop from '../objects/TopazPoop';
import RainbowPoop from '../objects/RainbowPoop';
import { GameMode, Difficulty, DIFFICULTIES, DIFFICULTY_SCALING, type DifficultyConfig } from '../types/GameMode';
import { FEVER_TIME_CONFIG } from '../config/feverTime';
import { POOP_CONFIG } from '../config/poop';
import { getHighScore, updateHighScore } from '../utils/localStorage';
import { submitScore, getUserInitials, setUserInitials, startGameSession } from '../utils/leaderboard';
import { submitSkor, type SkorSubmitResponse } from '../utils/skor';
import { getSafeSelectedCharacter, getCharacterDef, getDuplicateCount, getAwakeningLevel } from '../utils/character';
import { isChristmasSeason } from '../utils/seasonChecker';
import type { CharacterAbility, GameSceneAPI } from '../abilities/types';
import { getCharacterAbility } from '../abilities/index';
import { BaseAbility } from '../abilities/BaseAbility';
import { realNow } from '../utils/realTime';

export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private poops!: Phaser.Physics.Arcade.Group;
  private goldPoops!: Phaser.Physics.Arcade.Group;
  private diamondPoops!: Phaser.Physics.Arcade.Group;
  private topazPoops!: Phaser.Physics.Arcade.Group;
  private rainbowPoops!: Phaser.Physics.Arcade.Group;
  private score: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private highScore: number = 0;
  private highScoreText!: Phaser.GameObjects.Text;
  private gameOver: boolean = false;
  private spawnTimer!: Phaser.Time.TimerEvent;
  private difficultyLevel: number = 2;
  private bgMusic!: Phaser.Sound.BaseSound;
  private gameMode: GameMode = GameMode.CLASSIC;
  private difficulty: Difficulty = Difficulty.HARD;  // 게임플레이 파라미터 기준
  private purePhysical: boolean = false;
  private get scoreDifficulty(): Difficulty {         // 점수/리더보드 저장 키
    return this.purePhysical ? Difficulty.PHYSICAL : this.difficulty;
  }
  private difficultyConfig!: DifficultyConfig;
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
  // 피버 타임 관련
  private isFeverTime: boolean = false; // 피버 타임 활성화 여부
  private feverTimeRemaining: number = 0; // 피버 타임 남은 시간 (ms)
  private feverTimeTimer?: Phaser.Time.TimerEvent; // 피버 타임 카운트다운 타이머
  private feverTimeUITexts: Phaser.GameObjects.Text[] = []; // 피버 타임 UI 텍스트 (각 글자별)
  private feverTimeColorOffset: number = 0; // 무지개 색상 회전 오프셋
  private feverTimeColorTimer?: Phaser.Time.TimerEvent; // 색상 애니메이션 타이머
  private lastFeverTimeScore: number = 0; // 마지막 피버 타임 발동 점수
  /** difficultyLevel 기반으로 현재 spawn 간격을 항상 최신값으로 계산 */
  private get currentSpawnDelay(): number {
    return Math.max(400, this.difficultyConfig.spawnDelay - (this.difficultyLevel * 80));
  }

  private static readonly CHARS_WITH_SPRITES = ['miner', 'maehwa', 'hacker', 'archieve', 'glitch', 'noise', 'sentinel', 'legacy', 'log', 'swap', 'sum', 'fork', 'seed', 'session', 'branch', 'hook', 'socket', 'index'];
  private static readonly RAINBOW_COLORS = [
    '#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3',
  ];
  private selectedCharId: string = 'chibi'; // 선택된 캐릭터 ID
  private selectedCharGrade: string = '등급외'; // 선택된 캐릭터 등급
  private charAwakeLevel: number = 0; // 각성 단계 (init에서 계산, create에서 사용)
  // 서버 세션 (게임 시작 시 비동기 생성, 점수 제출 시 await)
  private sessionPromise: Promise<string | null> | null = null;
  // ── 캐릭터 능력 시스템 ────────────────────────────────────────────────
  private ability!: CharacterAbility;
  private abilityAPI!: GameSceneAPI;

  constructor() {
    super('GameScene');
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
    this.sessionPromise = null; // 재시작 시 이전 세션 프로미스 해제
    // 피버 타임 초기화
    this.isFeverTime = false;
    this.feverTimeRemaining = 0;
    this.lastFeverTimeScore = 0;
    // 캐릭터 선택 화면에서 저장한 캐릭터를 사용
    this.selectedCharId = getSafeSelectedCharacter();
    const charDef        = getCharacterDef(this.selectedCharId);
    const dupCount       = getDuplicateCount(this.selectedCharId);
    const awakeLevel     = getAwakeningLevel(charDef.grade, dupCount);
    this.selectedCharGrade = charDef.grade;
    this.charAwakeLevel    = awakeLevel;
    this.purePhysical = data.purePhysical ?? false;
    this.ability = getCharacterAbility(this.selectedCharId, awakeLevel);
    if (this.purePhysical) this.ability = new BaseAbility();

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

    // Player assets
    const CHARS_WITH_SPRITES = GameScene.CHARS_WITH_SPRITES;
    if (CHARS_WITH_SPRITES.includes(this.selectedCharId)) {
      const p = `${this.selectedCharId}_`;
      if (!this.textures.exists(`${p}front`)) this.load.image(`${p}front`, `assets/players/${p}front.webp`);
      if (!this.textures.exists(`${p}left`)) this.load.image(`${p}left`, `assets/players/${p}left.webp`);
      if (!this.textures.exists(`${p}right`)) this.load.image(`${p}right`, `assets/players/${p}right.webp`);
    } else {
      // chibi (기본) 또는 플레이어 스프라이트가 없는 UR 캐릭터 → 치비로 fallback
      if (!this.textures.exists('front')) this.load.image('front', 'assets/players/chibi_front.webp');
      if (!this.textures.exists('left')) this.load.image('left', 'assets/players/chibi_left.webp');
      if (!this.textures.exists('right')) this.load.image('right', 'assets/players/chibi_right.webp');
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

  create() {
    // 키보드 이벤트 수신을 위해 캔버스 포커스 설정
    const canvas = this.game.canvas;
    canvas.setAttribute('tabindex', '0');
    canvas.focus();

    // Phaser 내부 시간 기준점 기록 (씬 재시작 시에도 정확한 delta 계산)
    this.phaserStartTime = this.time.now;
    // rAF 체크 두 기준점을 동시에 설정 — preload 시간 불일치 방지
    this.resetCheatCheckpoints();

    // 난이도별 최고 점수 로드
    this.highScore = getHighScore(this.scoreDifficulty);

    // 난이도별 배경 이미지 선택
    let backgroundKey = 'background';
    if (this.difficulty === Difficulty.NORMAL) {
      backgroundKey = 'background3';
    } else if (this.difficulty === Difficulty.HARD) {
      backgroundKey = 'background';
    } else if (this.difficulty === Difficulty.EXTREME) {
      // EXTREME 난이도: 크리스마스 시즌(12/1 ~ 1/31)이면 특별 배경
      if (isChristmasSeason()) {
        backgroundKey = 'xmas_background';
      } else {
        backgroundKey = 'background2';
      }
    }

    // 배경 이미지 추가
    const background = this.add.image(200, 300, backgroundKey);
    background.setDisplaySize(400, 600);

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
    this.physics.world.setBounds(15, 0, 370, 600);

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
    this.player = new Player(this, 200, 520, this.difficultyConfig.playerSpeed + this.ability.getPlayerSpeedBonus() + gradeAwakeSpeed, playerTexturePrefix);

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

    // 무지개똥 그룹 생성
    this.rainbowPoops = this.physics.add.group({
      classType: RainbowPoop,
      runChildUpdate: true,
      maxSize: 10,
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

    // HUD 배경 패널 (반투명 다크 바)
    const HUD_H = 36;
    const hudBg = this.add.graphics();
    hudBg.fillStyle(0x000000, 0.28);
    hudBg.fillRect(0, 0, 400, HUD_H);
    hudBg.setDepth(9);

    const hudTextY = Math.round(HUD_H / 2) - 11; // 18px 폰트 수직 중앙

    // 점수 텍스트 (왼쪽 위)
    this.scoreText = this.add.text(16, hudTextY, '점수: 0', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setDepth(10);

    // 최고 점수 텍스트 (오른쪽 위)
    this.highScoreText = this.add.text(384, hudTextY, `최고: ${this.highScore}`, {
      fontSize: '18px',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(1, 0).setDepth(10);

    // 조작 안내 (3초 후 자동으로 페이드아웃)
    const hintText = this.add.text(200, 58, '← → 키로 이동', {
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

    // 서버 세션 비동기 시작 — 게임과 병렬 실행, 점수 제출 시 await
    this.sessionPromise = startGameSession(this.scoreDifficulty);

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
        this.updateScore(this.ability.getTickScore(points));
      }

      // 캐릭터 능력 프레임 업데이트 (글리치 분신 추적 등)
      this.ability.onUpdate(this.abilityAPI);

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
      updateScore:    (n) => self.updateScore(n),
      spawnGoldPoop:    () => self.spawnGoldPoop(),
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
   * prototype은 그대로지만 body.enable=false 또는 body.setSize(0,0)으로
   * physics.overlap 콜백을 무력화하는 치트를 스프라이트 좌표 직접 계산으로 차단.
   * - 플레이어 히트박스: 20×40px (display 50×80 의 중앙)
   * - 똥 히트박스: display 40×40px 기준
   * - 겹침 임계: 반폭합 30px, 반높이합 40px
   * - 정상 상태에서 hitPoop 이중 호출되어도 gameOver 가드로 안전하게 무시됨
   */
  private checkManualPoopCollision() {
    if (this.gameOver) return;
    const px = this.player.x;
    const py = this.player.y;
    const HIT_X = 30;
    const HIT_Y = 40;

    for (const obj of this.poops.getChildren()) {
      const poop = obj as Phaser.Physics.Arcade.Sprite;
      if (!poop.active || !poop.visible) continue;
      if (Math.abs(poop.x - px) < HIT_X && Math.abs(poop.y - py) < HIT_Y) {
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

    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.8).setDepth(500);
    this.add.text(200, 280, '⚠️ 비정상적인 플레이가\n감지되었습니다', {
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

  private spawnPoop() {
    if (this.gameOver) return;
    if (this.ability.isSpawnBlocked()) return;                    // 노이즈 차단
    if (this.ability.overrideSpawnPoop(this.abilityAPI)) return;  // 레거시 금똥 피버

    // 난이도에 따른 개수만큼 생성 (노이즈 특수 능력으로 일회성 감소 가능)
    const reduction = this.ability.getSpawnCountReduction();
    const poopCount = Math.max(1, this.difficultyConfig.poopCount - reduction);
    const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement);
    for (let i = 0; i < poopCount; i++) {
      // 💩이 화면 전체에서 생성되도록 (💩 크기 15를 고려해서 양쪽 여유)
      const x = Phaser.Math.Between(15, 385);
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

  private spawnGoldPoop() {
    if (this.gameOver) return;

    // 금똥 1개를 화면 중앙 상단에서 생성 (더 잘 보이도록)
    const x = Phaser.Math.Between(50, 350);
    const y = -50;
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
    const x = Phaser.Math.Between(50, 350);
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

    const x = Phaser.Math.Between(50, 350);
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

    const x = Phaser.Math.Between(50, 350);
    const y = -50;
    const rainbowPoop = this.rainbowPoops.get() as RainbowPoop;
    if (!rainbowPoop) return;
    rainbowPoop.reinit(x, y);

    if (rainbowPoop.body) {
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.rainbow.speedReduction;
      rainbowPoop.body.velocity.y = fallSpeed;
    }
  }

  private handleSpecialCollected(
    poop: Phaser.Physics.Arcade.Sprite,
    type: import('../abilities/types').SpecialPoopType,
    baseScore: number,
    emoji: string,
    color: string,
    counterIncrement: () => void,
  ) {
    if (this.gameOver) return;
    poop.destroy();
    counterIncrement();
    const bonus = this.ability.onCollectSpecial(type);
    const total = baseScore + bonus;
    this.updateScore(total);
    if (!this.isFeverTime) {
      const suffix = bonus > 0 ? ` (+${bonus})` : '';
      const t = this.add.text(200, 100, `${emoji} +${total}점!${suffix} ${emoji}`, {
        fontSize: '28px', color, fontStyle: 'bold',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.time.delayedCall(1000, () => t.destroy());
    }
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
  private updateScore(amount: number = 1) {
    if (!this.gameOver) {
      const oldScore = this.score;
      this.score += amount;
      this.scoreText.setText(`점수: ${this.score}`);

      // 실시간으로 최고 점수 갱신
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.highScoreText.setText(`최고: ${this.highScore}`);
      }

      // 점수 증가 범위 내에서 건너뛴 생성 포인트를 확인
      this.checkMissedSpawnPoints(oldScore, this.score);
    }
  }

  /**
   * 점수가 증가하는 동안 건너뛴 생성 포인트를 확인하고 생성
   * @param oldScore 이전 점수
   * @param newScore 새 점수
   */
  private checkMissedSpawnPoints(oldScore: number, newScore: number) {
    // 캐릭터별 스폰 간격 (노이즈는 단축)
    const intervals = this.ability.getSpawnIntervals();

    for (let score = oldScore + 1; score <= newScore; score++) {
      // 피버 타임 체크
      this.checkFeverTime(score);

      // 피버 타임 중이 아닐 때만 일반 금똥/다이아똥/토파즈똥 생성
      if (!this.isFeverTime) {
        if (score % intervals.gold === 0 && score > this.lastGoldPoopScore) {
          this.spawnGoldPoop();
          this.lastGoldPoopScore = score;
        }

        if (score % intervals.diamond === 0 && score > this.lastDiamondPoopScore) {
          this.spawnDiamondPoop();
          this.lastDiamondPoopScore = score;
        }

        if (score % intervals.topaz === 0 && score > this.lastTopazPoopScore) {
          this.spawnTopazPoop();
          this.lastTopazPoopScore = score;
        }
      }

      // 점수 기반 난이도 증가
      if (score % DIFFICULTY_SCALING.scoreInterval === 0) this.increaseDifficulty();

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
    this.resetSpawnTimer(this.isFeverTime ? this.spawnFeverPoop : this.spawnPoop);
  }

  /**
   * 피버 타임 발동 조건 체크 (설정 기반)
   */
  private checkFeverTime(score: number) {
    if (score < FEVER_TIME_CONFIG.firstTriggerScore) return;

    // 첫 피버 타임 또는 반복 간격 체크
    let nextFeverScore: number;
    const secondTrigger = FEVER_TIME_CONFIG.firstTriggerScore + FEVER_TIME_CONFIG.repeatInterval;

    if (score < secondTrigger) {
      nextFeverScore = FEVER_TIME_CONFIG.firstTriggerScore;
    } else {
      const feverIndex = Math.floor((score - FEVER_TIME_CONFIG.firstTriggerScore) / FEVER_TIME_CONFIG.repeatInterval);
      nextFeverScore = FEVER_TIME_CONFIG.firstTriggerScore + feverIndex * FEVER_TIME_CONFIG.repeatInterval;
    }

    if (score >= nextFeverScore && this.lastFeverTimeScore < nextFeverScore) {
      this.startFeverTime();
      this.lastFeverTimeScore = nextFeverScore;
    }
  }

  /**
   * 피버 타임 시작 (기존 똥을 보너스 아이템으로 변환)
   */
  private startFeverTime() {
    if (this.gameOver) return;

    this.isFeverTime = true;
    this.feverTimeRemaining = FEVER_TIME_CONFIG.duration;

    // 기존 일반 똥들을 금똥/다이아똥으로 변환
    if (this.poops) {
      const poopPositions: Array<{ x: number; y: number; velocity: number }> = [];

      // 모든 똥의 위치와 속도 저장 후 풀에 반환 (비활성화)
      this.poops.children.entries.forEach((poop) => {
        const poopSprite = poop as Poop;
        if (!poopSprite.active) return;
        const body = poopSprite.body as Phaser.Physics.Arcade.Body;
        if (!body) return;
        poopPositions.push({ x: poopSprite.x, y: poopSprite.y, velocity: body.velocity.y });
        poopSprite.setActive(false).setVisible(false);
        body.setVelocity(0, 0);
        body.setEnable(false);
      });

      // 같은 위치에 금똥/다이아똥 생성 (50:50 확률)
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
    if (this.goldPoops) {
      this.goldPoops.children.entries.forEach((goldPoop) => {
        const goldPoopSprite = goldPoop as GoldPoop;
        if (goldPoopSprite.body) {
          goldPoopSprite.body.velocity.y *= FEVER_TIME_CONFIG.speedMultiplier;
        }
      });
    }
    if (this.diamondPoops) {
      this.diamondPoops.children.entries.forEach((diamondPoop) => {
        const diamondPoopSprite = diamondPoop as DiamondPoop;
        if (diamondPoopSprite.body) {
          diamondPoopSprite.body.velocity.y *= FEVER_TIME_CONFIG.speedMultiplier;
        }
      });
    }

    // spawnTimer를 피버 타임 생성 패턴으로 교체
    this.resetSpawnTimer(this.spawnFeverPoop);

    // UI 텍스트 생성 (각 글자별로 개별 Text 객체 생성)
    // 기존 텍스트 제거
    this.feverTimeUITexts.forEach((text) => text.destroy());
    this.feverTimeUITexts = [];
    this.feverTimeColorOffset = 0;

    const initialSeconds = Math.ceil(FEVER_TIME_CONFIG.duration / 1000);
    const fullText = `FEVER TIME ${initialSeconds}초`;

    // 각 글자별로 Text 객체 생성 (x=0에 먼저 배치 후 width 합산해 재정렬)
    const colors = GameScene.RAINBOW_COLORS;
    for (let i = 0; i < fullText.length; i++) {
      const charText = this.add.text(
        0,
        FEVER_TIME_CONFIG.ui.position.y,
        fullText[i],
        {
          fontSize: FEVER_TIME_CONFIG.ui.fontSize,
          color: colors[i % colors.length],
          fontStyle: 'bold',
          stroke: FEVER_TIME_CONFIG.ui.stroke,
          strokeThickness: FEVER_TIME_CONFIG.ui.strokeThickness
        }
      ).setOrigin(0, 0.5).setDepth(FEVER_TIME_CONFIG.ui.depth);
      this.feverTimeUITexts.push(charText);
    }

    // 생성된 Text 객체의 width를 합산해 중앙 정렬
    const totalWidth = this.feverTimeUITexts.reduce((sum, t) => sum + t.width, 0);
    let currentX = FEVER_TIME_CONFIG.ui.position.x - totalWidth / 2;
    for (const charText of this.feverTimeUITexts) {
      charText.setX(currentX);
      currentX += charText.width;
    }



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

    // 색상 애니메이션 타이머 (0.2초마다 색상 한 칸 이동)
    if (this.feverTimeColorTimer) {
      this.feverTimeColorTimer.remove();
    }
    this.feverTimeColorTimer = this.time.addEvent({
      delay: 200,
      callback: this.updateFeverTimeColors,
      callbackScope: this,
      loop: true
    });
  }

  /**
   * 피버 타임 카운트다운 업데이트
   */
  private updateFeverTime() {
    this.feverTimeRemaining -= 100; // 0.1초씩 감소

    const secondsRemaining = Math.ceil(this.feverTimeRemaining / 1000);
    const newText = `FEVER TIME ${secondsRemaining}초`;

    // 각 글자의 텍스트 내용 업데이트
    for (let i = 0; i < this.feverTimeUITexts.length; i++) {
      if (i < newText.length) {
        this.feverTimeUITexts[i].setText(newText[i]);
      }
    }

    // 텍스트 길이가 변경된 경우 (초 카운트 변경) 위치 재조정
    if (this.feverTimeUITexts.length > 0) {
      // setText() 후 width가 즉시 갱신되므로 별도 측정 객체 불필요
      const totalWidth = this.feverTimeUITexts.reduce((sum, t) => sum + t.width, 0);
      let currentX = FEVER_TIME_CONFIG.ui.position.x - totalWidth / 2;
      for (let i = 0; i < this.feverTimeUITexts.length && i < newText.length; i++) {
        this.feverTimeUITexts[i].setX(currentX);
        currentX += this.feverTimeUITexts[i].width;
      }
    }

    // 시간이 다 떨어지면 피버 타임 종료
    if (this.feverTimeRemaining <= 0) {
      this.endFeverTime();
    }
  }

  /**
   * 피버 타임 색상 애니메이션 업데이트
   */
  private updateFeverTimeColors() {
    const colors = GameScene.RAINBOW_COLORS;
    this.feverTimeColorOffset = (this.feverTimeColorOffset - 1 + colors.length) % colors.length;
    for (let i = 0; i < this.feverTimeUITexts.length; i++) {
      this.feverTimeUITexts[i].setColor(colors[(i + this.feverTimeColorOffset) % colors.length]);
    }
  }

  /**
   * 피버 타임 종료
   */
  /** 피버 타임 UI/타이머 정리 (spawnTimer 재설정 없음). 비활성 상태면 no-op. */
  private clearFeverTimeUI() {
    if (!this.isFeverTime) return;
    this.isFeverTime = false;
    this.feverTimeTimer?.remove();
    this.feverTimeColorTimer?.remove();
    this.feverTimeUITexts.forEach(t => t.destroy());
    this.feverTimeUITexts = [];
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
      const x = Phaser.Math.Between(15, 385);
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
      const x = Phaser.Math.Between(50, 350);
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

  private hitPoop(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    poop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    if (this.gameOver) return;
    if (this.player.getIsInvincible()) return;

    // 센티넬: 보호막이 있으면 게임오버 대신 보호막 소모 + 똥 제거
    if (this.ability.onHitPoop(this.abilityAPI)) {
      (poop as Phaser.Physics.Arcade.Sprite).destroy();
      return;
    }

    this.gameOver = true;
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

    // 최고 점수 업데이트 및 갱신 여부 확인
    const isNewRecord = updateHighScore(this.scoreDifficulty, this.score);

    // 게임 오버 UI 표시 (비동기 처리)
    this.showGameOverUI(isNewRecord);
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
  private async showGameOverUI(isNewRecord: boolean) {
    // 반투명 검정 배경 추가 (가독성 향상)
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.7).setDepth(200);

    // SKOR 제출 (백그라운드, 모든 모드에서 실행)
    // 새 기록 시: 이니셜 입력 영역(y≈380) 아래에 배치 / 일반 시: 개인최고(y≈320) 아래에 배치
    const skorStatusY = isNewRecord ? 418 : 380;
    const skorStatusText = this.add.text(200, skorStatusY, '💰 SKOR 정제 중...', {
      fontSize: '16px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(200);

    this.submitSkorOnGameOver(skorStatusText);

    if (isNewRecord) {
      // === 새 기록 달성 시: 상단에 배치 ===
      // 게임 오버 타이틀
      this.add.text(200, 80, 'GAME OVER', {
        fontSize: '48px',
        color: '#ff0000',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(200);

      // 최종 점수
      this.add.text(200, 150, `점수: ${this.score}`, {
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(200);

      // 새 기록 메시지
      this.add.text(200, 200, '🎉 개인 신기록 🎉', {
        fontSize: '28px',
        color: '#FFD700',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(200);

      // 이니셜 입력 UI 표시
      this.showInitialInputUI();
    } else {
      // === 새 기록 미달성 시: 중앙에 배치 ===
      // 게임 오버 타이틀
      this.add.text(200, 180, 'GAME OVER', {
        fontSize: '48px',
        color: '#ff0000',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6
      }).setOrigin(0.5).setDepth(200);

      // 최종 점수
      this.add.text(200, 260, `점수: ${this.score}`, {
        fontSize: '32px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(200);

      // 로컬 최고 점수
      this.add.text(200, 320, `개인 최고: ${this.highScore}`, {
        fontSize: '24px',
        color: '#FFD700',
        stroke: '#000000',
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(200);

      // 재시작 안내
      this.showRestartButton(false);
    }
  }

  /**
   * 이니셜 입력 UI 표시
   */
  private showInitialInputUI() {
    // 안내 텍스트
    this.add.text(200, 250, '이니셜 입력 (영어 대문자 3자)', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(200);

    // HTML input 엘리먼트 생성
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.maxLength = 3;
    inputElement.placeholder = 'ABC';

    // 캔버스 실제 위치·스케일에 맞춰 input 좌표 계산
    // (Phaser FIT 스케일 모드에서 캔버스가 이동/축소될 수 있으므로 DOM 좌표계와 동기화)
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const gameW = this.game.config.width as number;   // 400
    const gameH = this.game.config.height as number;  // 600
    const scaleX = rect.width / gameW;
    const scaleY = rect.height / gameH;
    // 게임 좌표 (200, 285) → viewport 픽셀 좌표로 변환
    const screenLeft = rect.left + 200 * scaleX;
    const screenTop  = rect.top  + 285 * scaleY;

    inputElement.style.cssText = `
      position: fixed;
      left: ${screenLeft}px;
      top: ${screenTop}px;
      transform: translateX(-50%);
      width: ${Math.round(130 * scaleX)}px;
      height: ${Math.round(44 * scaleY)}px;
      font-size: ${Math.round(22 * scaleY)}px;
      text-align: center;
      text-transform: uppercase;
      border: ${Math.max(2, Math.round(3 * scaleY))}px solid #FFD700;
      border-radius: 8px;
      background: #000;
      color: #fff;
      font-weight: bold;
      letter-spacing: ${Math.round(6 * scaleX)}px;
      outline: none;
      box-sizing: border-box;
      z-index: 9999;
    `;

    // 기존 이니셜이 있으면 미리 채우기
    const existingInitials = getUserInitials();
    if (existingInitials) {
      inputElement.value = existingInitials;
    }

    document.body.appendChild(inputElement);
    inputElement.focus();

    // 대문자만 입력되도록
    inputElement.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      target.value = target.value.toUpperCase().replace(/[^A-Z]/g, '');
    });

    // 제출 버튼 텍스트
    const submitButtonText = this.add.text(200, 375, '랭킹 등록', {
      fontSize: '24px',
      color: '#00ff00',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
      padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setInteractive().setDepth(200);

    // 에러 메시지 영역
    let errorText: Phaser.GameObjects.Text | null = null;

    // 제출 버튼 클릭
    submitButtonText.on('pointerdown', async () => {
      const initials = inputElement.value.trim().toUpperCase();

      // 검증
      if (initials.length !== 3) {
        if (errorText) errorText.destroy();
        errorText = this.add.text(200, 420, '정확히 3글자를 입력하세요', {
          fontSize: '16px',
          color: '#ff0000',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3
        }).setOrigin(0.5).setDepth(200);
        return;
      }

      if (!/^[A-Z]{3}$/.test(initials)) {
        if (errorText) errorText.destroy();
        errorText = this.add.text(200, 420, '영어 대문자만 입력하세요', {
          fontSize: '16px',
          color: '#ff0000',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3
        }).setOrigin(0.5).setDepth(200);
        return;
      }

      // 이니셜 저장
      setUserInitials(initials);

      // input 제거
      document.body.removeChild(inputElement);
      submitButtonText.destroy();
      if (errorText) errorText.destroy();

      // 랭킹 제출
      const submittingText = this.add.text(200, 300, '랭킹 제출 중...', {
        fontSize: '18px',
        color: '#ffff00',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(200);

      try {
        // 캐릭터 타입 결정 (이미 init()에서 검증된 값 사용)
        const characterType = this.selectedCharId;

        // 세션이 완료될 때까지 대기 (대부분 이미 완료되어 있음)
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
          },
          characterType,
          sessionId
        );

        submittingText.destroy();

        // 순위 표시
        if (result.rank !== null) {
          this.add.text(200, 340, `🏆 전체 ${result.rank}위! 🏆`, {
            fontSize: '24px',
            color: '#FFD700',
            fontStyle: 'bold',
            stroke: '#000',
            strokeThickness: 3
          }).setOrigin(0.5).setDepth(200);
        }

        // 이니셜 표시
        this.add.text(200, 380, `${initials}`, {
          fontSize: '20px',
          color: '#00ff00',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3,
          letterSpacing: 4
        }).setOrigin(0.5).setDepth(200);

      } catch (error) {
        console.error('Failed to submit score:', error);
        submittingText.setText('❌ 랭킹 제출 실패');
        submittingText.setColor('#ff0000');
      }

      // 재시작 버튼 표시
      this.showRestartButton(true);
    });

    // Enter 키로도 제출 가능
    inputElement.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitButtonText.emit('pointerdown');
      }
    });
  }

  /**
   * 게임오버 시 SKOR 정제 수익 제출 및 화면 표시
   */
  /** 점수 브래킷별 게임당 SKOR 상한 (서버와 동일) */
  private getSkorBracketCap(score: number): number {
    if (score < 1000) return 40;
    if (score < 2000) return 70;
    if (score < 3000) return 90;
    return 110;
  }

  private async submitSkorOnGameOver(statusText: Phaser.GameObjects.Text) {
    // ── 낙관적 UI: 서버 응답 전에 예상 SKOR 즉시 계산 ──
    const rawSkor =
      this.goldCollected * 0.5 +
      this.diamondCollected * 1.5 +
      this.topazCollected * 3.5 +
      this.rainbowCollected * 10.0;
    const estimatedSkor = Math.floor(Math.min(rawSkor, this.getSkorBracketCap(this.score)));

    // floor 후 0이면 API 호출 없이 즉시 종료 (퀘스트 진행도도 없음)
    if (estimatedSkor <= 0) {
      statusText.setText('💰 +0 SKOR (아이템 없음)');
      statusText.setColor('#888888');
      return;
    }

    statusText.setText(`💰 +${estimatedSkor} SKOR 획득!`);
    statusText.setColor('#FFD700');

    // ── 백그라운드 API 호출: 실제 결과로 보정 ──
    try {
      const result: SkorSubmitResponse = await submitSkor({
        score: this.score,
        goldCollected: this.goldCollected,
        diamondCollected: this.diamondCollected,
        topazCollected: this.topazCollected,
        rainbowCollected: this.rainbowCollected,
      });

      if (!this.scene.isActive()) return;

      // 주간 캡 소진 또는 실제값이 예상과 다른 경우만 갱신
      if (result.weeklyCapRemaining <= 0 && result.totalSkorAdded === 0) {
        statusText.setText(`💰 주간 한도 도달 (SKOR 없음)`);
        statusText.setColor('#888888');
      } else if (result.totalSkorAdded !== estimatedSkor) {
        statusText.setText(`💰 +${result.totalSkorAdded} SKOR 획득!`);
      }

      // 퀘스트 달성 시 추가 알림 (항상 표시)
      if (result.questRewards.length > 0) {
        const questLabels: Record<string, string> = {
          gold: '금똥', diamond: '다이아', topaz: '토파즈', rainbow: '무지개',
        };
        const questText = result.questRewards
          .map(r => `${questLabels[r.quest] ?? r.quest} 퀘스트 +${r.reward}`)
          .join(' / ');
        this.add.text(200, statusText.y + 23, `🎯 ${questText}`, {
          fontSize: '13px',
          color: '#88ff88',
          stroke: '#000',
          strokeThickness: 2,
        }).setOrigin(0.5).setDepth(200);
      }
    } catch {
      // 실패해도 낙관적으로 보여준 숫자 유지 (정제 결과는 서버에서 처리됨)
    }
  }

  /**
   * 재시작 버튼 표시 (다시 하기 + 메인 메뉴) - 버튼 스타일
   * @param isNewRecord 새 기록 달성 여부 (SKOR 텍스트 위치에 따라 버튼 y 조정)
   */
  private showRestartButton(isNewRecord = false) {
    // 새 기록 시: SKOR 텍스트(y≈418) + 퀘스트(y≈441) 아래 배치
    // 일반 시: SKOR 텍스트(y≈380) + 퀘스트(y≈403) 아래 배치
    const retryY = isNewRecord ? 470 : 455;
    const menuY  = isNewRecord ? 548 : 535;

    // 다시 하기 버튼 배경
    const retryButtonBg = this.add.rectangle(200, retryY, 250, 70, 0x00aa00)
      .setOrigin(0.5)
      .setDepth(199)
      .setStrokeStyle(3, 0xffffff);

    // 다시 하기 버튼 텍스트
    const retryButtonText = this.add.text(200, retryY, '다시 하기', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(200);

    // 다시 하기 버튼 인터랙티브 영역 (배경을 클릭 가능하게)
    retryButtonBg.setInteractive({ useHandCursor: true });

    // 메인 메뉴 버튼 배경
    const menuButtonBg = this.add.rectangle(200, menuY, 250, 70, 0x555555)
      .setOrigin(0.5)
      .setDepth(199)
      .setStrokeStyle(3, 0xffffff);

    // 메인 메뉴 버튼 텍스트
    const menuButtonText = this.add.text(200, menuY, '메인 메뉴', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(200);

    // 메인 메뉴 버튼 인터랙티브 영역
    menuButtonBg.setInteractive({ useHandCursor: true });

    // 호버 효과 - 다시 하기 버튼
    retryButtonBg.on('pointerover', () => {
      retryButtonBg.setFillStyle(0x00ff00);
      retryButtonBg.setScale(1.05);
      retryButtonText.setScale(1.05);
    });
    retryButtonBg.on('pointerout', () => {
      retryButtonBg.setFillStyle(0x00aa00);
      retryButtonBg.setScale(1);
      retryButtonText.setScale(1);
    });

    // 호버 효과 - 메인 메뉴 버튼
    menuButtonBg.on('pointerover', () => {
      menuButtonBg.setFillStyle(0x777777);
      menuButtonBg.setScale(1.05);
      menuButtonText.setScale(1.05);
    });
    menuButtonBg.on('pointerout', () => {
      menuButtonBg.setFillStyle(0x555555);
      menuButtonBg.setScale(1);
      menuButtonText.setScale(1);
    });

    // 0.5초 지연 후 클릭 이벤트 활성화 (의도치 않은 즉시 클릭 방지)
    this.time.delayedCall(500, () => {
      // 다시 하기 버튼 클릭
      retryButtonBg.on('pointerdown', () => {
        // HTML input이 남아있으면 제거
        const existingInput = document.querySelector('input');
        if (existingInput) {
          document.body.removeChild(existingInput);
        }

        // 모든 사운드 정리
        this.sound.stopAll();
        // 플레이어 효과 정리
        if (this.player) {
          this.player.cleanupEffects();
        }

        // 같은 게임 모드와 난이도로 재시작
        this.scene.restart({ gameMode: this.gameMode, difficulty: this.difficulty, purePhysical: this.purePhysical });
      });

      // 메인 메뉴 버튼 클릭
      menuButtonBg.on('pointerdown', () => {
        // HTML input이 남아있으면 제거
        const existingInput = document.querySelector('input');
        if (existingInput) {
          document.body.removeChild(existingInput);
        }

        // 모든 사운드 정리
        this.sound.stopAll();
        // 플레이어 효과 정리
        if (this.player) {
          this.player.cleanupEffects();
        }

        // 모드 선택 씬으로 돌아가기
        this.scene.start('ModeSelectScene');
      });
    });
  }
}
