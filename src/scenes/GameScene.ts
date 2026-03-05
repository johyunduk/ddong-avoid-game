import Phaser from 'phaser';
import Player from '../objects/Player';
import Poop from '../objects/Poop';
import GoldPoop from '../objects/GoldPoop';
import DiamondPoop from '../objects/DiamondPoop';
import TopazPoop from '../objects/TopazPoop';
import RainbowPoop from '../objects/RainbowPoop';
import Star from '../objects/Star';
import Item from '../objects/Item';
import { GameMode, Difficulty, DIFFICULTIES, type DifficultyConfig } from '../types/GameMode';
import { FEVER_TIME_CONFIG } from '../config/feverTime';
import { POOP_CONFIG } from '../config/poop';
import { getHighScore, updateHighScore } from '../utils/localStorage';
import { submitScore, getUserInitials, setUserInitials } from '../utils/leaderboard';
import { submitSkor, type SkorSubmitResponse } from '../utils/skor';
import { getSafeSelectedCharacter, getCharacterDef, getDuplicateCount, getAwakeningLevel } from '../utils/character';
import { isChristmasSeason } from '../utils/seasonChecker';
import type { CharacterAbility, GameSceneAPI } from '../abilities/types';
import { getCharacterAbility } from '../abilities/index';
import { realNow } from '../utils/realTime';

export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private poops!: Phaser.Physics.Arcade.Group;
  private goldPoops!: Phaser.Physics.Arcade.Group;
  private diamondPoops!: Phaser.Physics.Arcade.Group;
  private topazPoops!: Phaser.Physics.Arcade.Group;
  private rainbowPoops!: Phaser.Physics.Arcade.Group;
  private stars!: Phaser.Physics.Arcade.Group;
  private items!: Phaser.Physics.Arcade.Group;
  private score: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private highScore: number = 0;
  private highScoreText!: Phaser.GameObjects.Text;
  private gameOver: boolean = false;
  private spawnTimer!: Phaser.Time.TimerEvent;
  private difficultyLevel: number = 2;
  private bgMusic!: Phaser.Sound.BaseSound;
  private gameMode: GameMode = GameMode.CLASSIC;
  private difficulty: Difficulty = Difficulty.HARD;
  private difficultyConfig!: DifficultyConfig;
  private lastGoldPoopScore: number = 0;
  private lastDiamondPoopScore: number = 0;
  private lastTopazPoopScore: number = 0;
  private feverTopazTimer!: Phaser.Time.TimerEvent;
  // 점수 검증용 데이터
  private gameStartTime: number = 0;
  private phaserStartTime: number = 0; // 씬 시작 시 Phaser 내부 시간 (재시작 시에도 정확한 delta 계산용)
  private lastScoreTime: number = 0;        // realNow() 기반 점수용
  private lastCheatCheckTime: number = 0;   // timeScale 감지용 (realNow 기준)
  private lastPhaserCheckTime: number = 0;  // 구간 비율 감지용 Phaser 기준점
  private goldCollected: number = 0;
  private diamondCollected: number = 0;
  private topazCollected: number = 0;
  private rainbowCollected: number = 0;
  // 피버 타임 관련
  private isFeverTime: boolean = false; // 피버 타임 활성화 여부
  private feverTimeRemaining: number = 0; // 피버 타임 남은 시간 (ms)
  private feverTimeTimer!: Phaser.Time.TimerEvent; // 피버 타임 카운트다운 타이머
  private feverTimeUITexts: Phaser.GameObjects.Text[] = []; // 피버 타임 UI 텍스트 (각 글자별)
  private feverTimeColorOffset: number = 0; // 무지개 색상 회전 오프셋
  private feverTimeColorTimer!: Phaser.Time.TimerEvent; // 색상 애니메이션 타이머
  private lastFeverTimeScore: number = 0; // 마지막 피버 타임 발동 점수
  private selectedCharId: string = 'chibi'; // 선택된 캐릭터 ID
  private selectedCharGrade: string = '등급외'; // 선택된 캐릭터 등급
  private charAwakeLevel: number = 0; // 각성 단계 (init에서 계산, create에서 사용)
  // ── 캐릭터 능력 시스템 ────────────────────────────────────────────────
  private ability!: CharacterAbility;
  private abilityAPI!: GameSceneAPI;

  constructor() {
    super('GameScene');
  }

  init(data: { gameMode?: GameMode; difficulty?: Difficulty }) {
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
    this.lastCheatCheckTime = realNow();
    this.goldCollected = 0;
    this.diamondCollected = 0;
    this.topazCollected = 0;
    this.rainbowCollected = 0;
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
    this.ability = getCharacterAbility(this.selectedCharId, awakeLevel);

    // ModeSelectScene/DifficultySelectScene으로부터 게임 모드와 난이도를 받음
    if (data.gameMode) {
      this.gameMode = data.gameMode;
      // console.log('Game Mode:', this.gameMode);
    }
    if (data.difficulty) {
      this.difficulty = data.difficulty;
      // console.log('Difficulty:', this.difficulty);
      localStorage.setItem('lastPlayedDifficulty', data.difficulty);
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

    if (this.gameMode === GameMode.CLASSIC) {
      if (this.difficulty === Difficulty.EASY && !this.textures.exists('background2')) {
        this.load.image('background2', 'assets/backgrounds/background2.webp');
      } else if (this.difficulty === Difficulty.NORMAL && !this.textures.exists('background3')) {
        this.load.image('background3', 'assets/backgrounds/background3.webp');
      } else if ((this.difficulty === Difficulty.HARD || this.difficulty === Difficulty.EXTREME) && !this.textures.exists('background')) {
        this.load.image('background', 'assets/backgrounds/background.webp');
      }
      if (this.difficulty === Difficulty.EXTREME && isChristmasSeason() && !this.textures.exists('xmas_background')) {
        this.load.image('xmas_background', 'assets/backgrounds/xmas_background.webp');
      }

      // Player assets for Classic mode
      const CHARS_WITH_SPRITES = ['miner', 'maehwa', 'hacker', 'archieve', 'glitch', 'noise', 'sentinel', 'legacy', 'log', 'swap', 'sum', 'fork', 'seed', 'session', 'branch', 'hook', 'socket', 'index'];
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

    } else if (this.gameMode === GameMode.ITEM) {
      if (!this.textures.exists('space_background')) this.load.image('space_background', 'assets/backgrounds/space_background.webp');
      if (!this.textures.exists('astronaut_front')) this.load.image('astronaut_front', 'assets/players/astronaut_front.webp');
      if (!this.textures.exists('astronaut_left')) this.load.image('astronaut_left', 'assets/players/astronaut_left.webp');
      if (!this.textures.exists('astronaut_right')) this.load.image('astronaut_right', 'assets/players/astronaut_right.webp');
      if (!this.textures.exists('star')) this.load.image('star', 'assets/stars/star.webp');
      if (!this.textures.exists('star_smile')) this.load.image('star_smile', 'assets/stars/star_smile.webp');
      if (!this.textures.exists('star_glasses')) this.load.image('star_glasses', 'assets/stars/star_glasses.webp');
      if (!this.textures.exists('star_sunglass')) this.load.image('star_sunglass', 'assets/stars/star_sunglass.webp');
      if (!this.textures.exists('hermes_shoes')) this.load.image('hermes_shoes', 'assets/items/hermes_shoes.webp');
      if (!this.textures.exists('light_saber')) this.load.image('light_saber', 'assets/items/light_saber.webp');
      if (!this.textures.exists('rainbow_star')) this.load.image('rainbow_star', 'assets/items/rainbow_star.webp');
    }

    // BGM
    if (this.gameMode === GameMode.ITEM) {
      if (!this.cache.audio.exists('starBgMusic')) this.load.audio('starBgMusic', 'assets/bgms/star_fall.mp3');
    } else if (this.difficulty === Difficulty.EXTREME && isChristmasSeason()) {
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
    this.lastPhaserCheckTime = this.time.now;

    // 난이도별 최고 점수 로드
    this.highScore = getHighScore(this.difficulty);

    // 게임 모드와 난이도별 배경 이미지 선택
    let backgroundKey = 'background';
    if (this.gameMode === GameMode.ITEM) {
      // 아이템 모드는 우주 배경 사용
      backgroundKey = 'space_background';
    } else {
      // 클래식 모드는 난이도별 배경
      if (this.difficulty === Difficulty.EASY) {
        backgroundKey = 'background2';
      } else if (this.difficulty === Difficulty.NORMAL) {
        backgroundKey = 'background3';
      } else if (this.difficulty === Difficulty.HARD) {
        backgroundKey = 'background';
      } else if (this.difficulty === Difficulty.EXTREME) {
        // EXTREME 난이도: 크리스마스 시즌(12/1 ~ 1/31)이면 특별 배경
        if (isChristmasSeason()) {
          backgroundKey = 'xmas_background';
        } else {
          backgroundKey = 'background';
        }
      }
    }

    // 배경 이미지 추가
    const background = this.add.image(200, 300, backgroundKey);
    // 배경을 화면에 맞게 조정 (우주 배경은 확대)
    if (this.gameMode === GameMode.ITEM) {
      background.setDisplaySize(600, 900); // 우주 배경 확대
    } else {
      background.setDisplaySize(400, 600);
    }

    // BGM 키 결정 (preload에서 이미 로드됨)
    let bgMusicKey = 'bgMusic';
    if (this.gameMode === GameMode.ITEM) {
      bgMusicKey = 'starBgMusic';
    } else if (this.difficulty === Difficulty.EXTREME && isChristmasSeason()) {
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
    const CHARS_WITH_SPRITES = ['miner', 'maehwa', 'hacker', 'archieve', 'glitch', 'noise', 'sentinel', 'legacy', 'log', 'swap', 'sum', 'fork', 'seed', 'session', 'branch', 'hook', 'socket', 'index'];
    let playerTexturePrefix = '';
    if (this.gameMode === GameMode.ITEM) {
      playerTexturePrefix = 'astronaut_';
    } else if (this.gameMode === GameMode.CLASSIC && CHARS_WITH_SPRITES.includes(this.selectedCharId)) {
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

    if (this.gameMode === GameMode.CLASSIC) {
      // 클래식 모드: 💩 그룹 생성
      this.poops = this.physics.add.group({
        classType: Poop,
        runChildUpdate: true
      });

      // 금똥 그룹 생성
      this.goldPoops = this.physics.add.group({
        classType: GoldPoop,
        runChildUpdate: true
      });

      // 다이아똥 그룹 생성
      this.diamondPoops = this.physics.add.group({
        classType: DiamondPoop,
        runChildUpdate: true
      });

      // 토파즈똥 그룹 생성
      this.topazPoops = this.physics.add.group({
        classType: TopazPoop,
        runChildUpdate: true
      });

      // 무지개똥 그룹 생성
      this.rainbowPoops = this.physics.add.group({
        classType: RainbowPoop,
        runChildUpdate: true
      });

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
    } else {
      // 아이템 모드: 별과 아이템 그룹 생성
      this.stars = this.physics.add.group({
        classType: Star,
        runChildUpdate: true
      });

      this.items = this.physics.add.group({
        classType: Item,
        runChildUpdate: true
      });

      // 별 충돌 감지 (피해야 함)
      this.physics.add.overlap(
        this.player,
        this.stars,
        this.hitStar as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this
      );

      // 아이템 충돌 감지 (획득)
      this.physics.add.overlap(
        this.player,
        this.items,
        this.collectItem as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
        undefined,
        this
      );
    }

    // 점수 텍스트 (왼쪽 위)
    this.scoreText = this.add.text(16, 16, '점수: 0', {
      fontSize: '24px',
      color: '#000',
      fontStyle: 'bold'
    });

    // 최고 점수 텍스트 (오른쪽 위)
    this.highScoreText = this.add.text(384, 16, `최고: ${this.highScore}`, {
      fontSize: '20px',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 2
    }).setOrigin(1, 0);

    // 조작 안내
    this.add.text(200, 50, '← → 키로 이동', {
      fontSize: '16px',
      color: this.gameMode === GameMode.ITEM ? '#fff' : '#000'
    }).setOrigin(0.5);

    if (this.gameMode === GameMode.CLASSIC) {
      // 클래식 모드: 💩 생성 타이머 (난이도별 초기 주기 사용)
      this.spawnTimer = this.time.addEvent({
        delay: this.difficultyConfig.spawnDelay,
        callback: this.spawnPoop,
        callbackScope: this,
        loop: true
      });

      // 난이도 증가 타이머
      this.time.addEvent({
        delay: 10000, // 10초마다
        callback: this.increaseDifficulty,
        callbackScope: this,
        loop: true
      });
    } else {
      // 아이템 모드: 별 생성 타이머 (고정 주기)
      this.spawnTimer = this.time.addEvent({
        delay: 1500,
        callback: this.spawnStars,
        callbackScope: this,
        loop: true
      });

      // 아이템 생성 타이머 (별보다 느리게)
      this.time.addEvent({
        delay: 3000,
        callback: this.spawnItem,
        callbackScope: this,
        loop: true
      });
    }

    // 점수 증가는 update()에서 Date.now() 기반으로 처리 (timeScale 조작 무력화)

    // ── 캐릭터 능력 초기화 (모든 그룹 생성 완료 후) ─────────────────────
    this.abilityAPI = this.buildAPI();
    this.ability.onCreate(this.abilityAPI);

    // 히트박스 디버그 표시, hit box visibility
    // this.physics.world.createDebugGraphic();
    // this.physics.world.drawDebug = true;
  }

  update() {
    if (!this.gameOver) {
      this.player.update();

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

        // 정상 범위: 0.85 ~ 1.15 (브라우저 rAF 지연·탭 전환 허용)
        // ratio < 0.85: rAF 슬로우 조작 (slow-motion 치트)
        // ratio > 1.15: rAF 패스트 조작 (fast-forward 치트)
        if (ratio < 0.85 || ratio > 1.15) {
          console.warn('[Anti-cheat] rAF 조작 감지:', ratio.toFixed(2));
          this.handleCheatDetected();
          return;
        }
        this.lastCheatCheckTime = now;
        this.lastPhaserCheckTime = this.time.now;
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
      get isClassicMode()   { return self.gameMode === GameMode.CLASSIC; },
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

  private handleCheatDetected() {
    this.gameOver = true;
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
    for (let i = 0; i < poopCount; i++) {
      // 💩이 화면 전체에서 생성되도록 (💩 크기 15를 고려해서 양쪽 여유)
      const x = Phaser.Math.Between(15, 385);
      const y = Phaser.Math.Between(-200, -20);
      const poop = new Poop(this, x, y, this.difficultyLevel, this.difficulty);
      this.poops.add(poop, true);

      // 명시적으로 velocity 설정 (그룹 추가 후)
      if (poop.body) {
        // 난이도 기본 속도 + 시간에 따른 증가
        const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * 40);
        poop.body.velocity.y = fallSpeed;
      }
    }

    this.ability.onAfterSpawnPoop(this.abilityAPI);
  }

  private spawnStars() {
    if (this.gameOver) return;

    // 별 6개를 랜덤 위치에 생성
    const starCount = 6;
    for (let i = 0; i < starCount; i++) {
      const x = Phaser.Math.Between(15, 385);
      const y = Phaser.Math.Between(-200, -20);
      const star = new Star(this, x, y);
      this.stars.add(star, true);

      // 명시적으로 velocity 설정 (그룹 추가 후)
      if (star.body) {
        star.body.velocity.y = 200;
      }
    }
  }

  private spawnItem() {
    if (this.gameOver) return;

    // 아이템 1개를 랜덤 위치에 생성
    const x = Phaser.Math.Between(15, 385);
    const y = -50;
    const item = new Item(this, x, y);
    this.items.add(item, true);

    // 명시적으로 velocity 설정 (그룹 추가 후)
    if (item.body) {
      item.body.velocity.y = 150;
    }
  }

  private spawnGoldPoop() {
    if (this.gameOver) return;

    // 금똥 1개를 화면 중앙 상단에서 생성 (더 잘 보이도록)
    const x = Phaser.Math.Between(50, 350);
    const y = -50; // 화면에 더 가깝게 시작
    const goldPoop = new GoldPoop(this, x, y);
    this.goldPoops.add(goldPoop, true);

    // 일반 똥보다 느린 속도로 설정 (난이도에 따라, 설정 기반)
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
    const y = -50; // 화면에 더 가깝게 시작
    // console.log(`[다이아똥] DiamondPoop 객체 생성 시도: x=${x}, y=${y}`);
    const diamondPoop = new DiamondPoop(this, x, y);
    // console.log(`[다이아똥] DiamondPoop 객체 생성 완료: visible=${diamondPoop.visible}, alpha=${diamondPoop.alpha}`);

    this.diamondPoops.add(diamondPoop, true);
    // console.log(`[다이아똥] diamondPoops 그룹에 추가 완료. 그룹 크기: ${this.diamondPoops.getLength()}`);

    // 일반 똥보다 느린 속도로 설정 (난이도에 따라, 설정 기반)
    if (diamondPoop.body) {
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.diamond.speedReduction - this.ability.specialPoopSpeedReduction('diamond');
      diamondPoop.body.velocity.y = fallSpeed;
      // console.log(`[다이아똥] 속도 설정 완료: ${fallSpeed}`);
    } else {
      // console.log('[다이아똥] 경고: body가 없습니다!');
    }

    // console.log(`다이아똥 생성! 점수: ${this.score}, 위치: (${x}, ${y}), depth: ${diamondPoop.depth}`);
  }

  private spawnTopazPoop() {
    if (this.gameOver) return;

    const x = Phaser.Math.Between(50, 350);
    const y = -50;
    const topazPoop = new TopazPoop(this, x, y);
    this.topazPoops.add(topazPoop, true);

    if (topazPoop.body) {
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.topaz.speedReduction;
      topazPoop.body.velocity.y = fallSpeed;
    }
  }

  private spawnRainbowPoop() {
    if (this.gameOver) return;

    const x = Phaser.Math.Between(50, 350);
    const y = -50;
    const rainbowPoop = new RainbowPoop(this, x, y);
    this.rainbowPoops.add(rainbowPoop, true);

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
    this.handleSpecialCollected(poop, 'rainbow', 100, '🌈', '#FF00FF', () => { this.rainbowCollected++; });
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

      // 클래식 모드에서만 금똥과 다이아똥 생성 체크
      if (this.gameMode === GameMode.CLASSIC) {
        // 점수 증가 범위 내에서 건너뛴 생성 포인트를 확인
        this.checkMissedSpawnPoints(oldScore, this.score);
      }
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

      // 캐릭터 능력 마일스톤 (광부 무지개똥, 루트 똥 제거, 매화 슬래시 등)
      this.ability.onScoreMilestone(score, this.abilityAPI);
    }
  }

  private increaseDifficulty() {
    if (!this.gameOver) {
      this.difficultyLevel += 0.3;
      // 생성 주기 단축 (최소 400ms, 초기 spawnDelay 기준으로 감소)
      const newDelay = Math.max(400, this.difficultyConfig.spawnDelay - (this.difficultyLevel * 80));

      // 기존 타이머 제거하고 새로 생성
      this.spawnTimer.remove();
      this.spawnTimer = this.time.addEvent({
        delay: newDelay,
        callback: this.isFeverTime ? this.spawnFeverPoop : this.spawnPoop,
        callbackScope: this,
        loop: true
      });
    }
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

      // 모든 똥의 위치와 속도 저장
      this.poops.children.entries.forEach((poop) => {
        const poopSprite = poop as Poop;
        if (poopSprite.body) {
          poopPositions.push({
            x: poopSprite.x,
            y: poopSprite.y,
            velocity: poopSprite.body.velocity.y
          });
        }
      });

      // 기존 똥들 제거
      this.poops.clear(true, true);

      // 같은 위치에 금똥/다이아똥 생성 (50:50 확률)
      poopPositions.forEach((pos) => {
        const isGold = Math.random() < 0.5;

        if (isGold) {
          const goldPoop = new GoldPoop(this, pos.x, pos.y);
          this.goldPoops.add(goldPoop, true);
          if (goldPoop.body) {
            goldPoop.body.velocity.y = pos.velocity * FEVER_TIME_CONFIG.speedMultiplier;
          }
        } else {
          const diamondPoop = new DiamondPoop(this, pos.x, pos.y);
          this.diamondPoops.add(diamondPoop, true);
          if (diamondPoop.body) {
            diamondPoop.body.velocity.y = pos.velocity * FEVER_TIME_CONFIG.speedMultiplier;
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
    this.spawnTimer.remove();
    this.spawnTimer = this.time.addEvent({
      delay: this.difficultyConfig.spawnDelay,
      callback: this.spawnFeverPoop,
      callbackScope: this,
      loop: true
    });

    // UI 텍스트 생성 (각 글자별로 개별 Text 객체 생성)
    // 기존 텍스트 제거
    this.feverTimeUITexts.forEach((text) => text.destroy());
    this.feverTimeUITexts = [];
    this.feverTimeColorOffset = 0;

    const initialSeconds = Math.ceil(FEVER_TIME_CONFIG.duration / 1000);
    const fullText = `FEVER TIME ${initialSeconds}초`;

    // 무지개 색상 배열 (빨강, 주황, 노랑, 초록, 파랑, 남색, 보라)
    const rainbowColors = [
      '#ff0000', // 빨강
      '#ff7f00', // 주황
      '#ffff00', // 노랑
      '#00ff00', // 초록
      '#0000ff', // 파랑
      '#4b0082', // 남색
      '#9400d3'  // 보라
    ];

    // 글자 크기 측정을 위한 임시 텍스트
    const tempText = this.add.text(0, 0, fullText, {
      fontSize: FEVER_TIME_CONFIG.ui.fontSize,
      fontStyle: 'bold'
    });
    const totalWidth = tempText.width;
    tempText.destroy();

    // 각 글자의 시작 X 위치 계산
    const startX = FEVER_TIME_CONFIG.ui.position.x - totalWidth / 2;
    let currentX = startX;

    // 각 글자별로 Text 객체 생성
    for (let i = 0; i < fullText.length; i++) {
      const char = fullText[i];
      const colorIndex = i % rainbowColors.length;

      const charText = this.add.text(
        currentX,
        FEVER_TIME_CONFIG.ui.position.y,
        char,
        {
          fontSize: FEVER_TIME_CONFIG.ui.fontSize,
          color: rainbowColors[colorIndex],
          fontStyle: 'bold',
          stroke: FEVER_TIME_CONFIG.ui.stroke,
          strokeThickness: FEVER_TIME_CONFIG.ui.strokeThickness
        }
      ).setOrigin(0, 0.5).setDepth(FEVER_TIME_CONFIG.ui.depth);

      this.feverTimeUITexts.push(charText);
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
      const tempText = this.add.text(0, 0, newText, {
        fontSize: FEVER_TIME_CONFIG.ui.fontSize,
        fontStyle: 'bold'
      });
      const totalWidth = tempText.width;
      tempText.destroy();

      const startX = FEVER_TIME_CONFIG.ui.position.x - totalWidth / 2;
      let currentX = startX;

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
    // 무지개 색상 배열 (빨강, 주황, 노랑, 초록, 파랑, 남색, 보라)
    const rainbowColors = [
      '#ff0000', // 빨강
      '#ff7f00', // 주황
      '#ffff00', // 노랑
      '#00ff00', // 초록
      '#0000ff', // 파랑
      '#4b0082', // 남색
      '#9400d3'  // 보라
    ];

    // 색상 오프셋을 감소시켜 반대 방향으로 이동 (오른쪽에서 왼쪽으로)
    this.feverTimeColorOffset = (this.feverTimeColorOffset - 1 + rainbowColors.length) % rainbowColors.length;

    // 각 글자의 색상 업데이트
    for (let i = 0; i < this.feverTimeUITexts.length; i++) {
      const colorIndex = (i + this.feverTimeColorOffset) % rainbowColors.length;
      this.feverTimeUITexts[i].setColor(rainbowColors[colorIndex]);
    }
  }

  /**
   * 피버 타임 종료
   */
  private endFeverTime() {
    this.isFeverTime = false;

    // 타이머 제거
    if (this.feverTimeTimer) {
      this.feverTimeTimer.remove();
    }

    // 색상 애니메이션 타이머 제거
    if (this.feverTimeColorTimer) {
      this.feverTimeColorTimer.remove();
    }

    // 토파즈 타이머 제거
    if (this.feverTopazTimer) {
      this.feverTopazTimer.remove();
    }

    // UI 제거 (모든 글자 Text 객체)
    this.feverTimeUITexts.forEach((text) => text.destroy());
    this.feverTimeUITexts = [];

    // 일반 생성 패턴으로 복구
    this.spawnTimer.remove();
    this.spawnTimer = this.time.addEvent({
      delay: this.difficultyConfig.spawnDelay,
      callback: this.spawnPoop,
      callbackScope: this,
      loop: true
    });
  }

  /**
   * 피버 타임 생성 패턴 (설정 기반, 속도 증가)
   */
  private spawnFeverPoop() {
    if (this.gameOver) return;

    // 1. 일반 똥 생성 (피버 타임 속도 배수 적용)
    for (let i = 0; i < FEVER_TIME_CONFIG.normalPoopCount; i++) {
      const x = Phaser.Math.Between(15, 385);
      const y = Phaser.Math.Between(-200, -20);
      const poop = new Poop(this, x, y, this.difficultyLevel, this.difficulty);
      this.poops.add(poop, true);

      if (poop.body) {
        const baseFallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement);
        const fallSpeed = baseFallSpeed * FEVER_TIME_CONFIG.speedMultiplier;
        poop.body.velocity.y = fallSpeed;
      }
    }

    // 2. 금똥/다이아똥 랜덤 생성 (피버 타임 속도 배수 적용)
    for (let i = 0; i < FEVER_TIME_CONFIG.bonusPoopCount; i++) {
      const x = Phaser.Math.Between(50, 350);
      const y = Phaser.Math.Between(-200, -50);

      // 50% 확률로 금똥 또는 다이아똥 결정
      const isGold = Math.random() < 0.5;

      if (isGold) {
        const goldPoop = new GoldPoop(this, x, y);
        this.goldPoops.add(goldPoop, true);
        if (goldPoop.body) {
          const baseFallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.gold.speedReduction;
          const fallSpeed = baseFallSpeed * FEVER_TIME_CONFIG.speedMultiplier;
          goldPoop.body.velocity.y = fallSpeed;
        }
      } else {
        const diamondPoop = new DiamondPoop(this, x, y);
        this.diamondPoops.add(diamondPoop, true);
        if (diamondPoop.body) {
          const baseFallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.diamond.speedReduction;
          const fallSpeed = baseFallSpeed * FEVER_TIME_CONFIG.speedMultiplier;
          diamondPoop.body.velocity.y = fallSpeed;
        }
      }
    }
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
    this.physics.pause();

    // 점수 검증 데이터 로그
    const gameEndTime = realNow();
    const playDuration = gameEndTime - this.gameStartTime;
    const bonusScore = this.goldCollected * 20 + this.diamondCollected * 40 + this.topazCollected * 80 + this.rainbowCollected * 100;
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
    const isNewRecord = updateHighScore(this.difficulty, this.score);

    // 게임 오버 UI 표시 (비동기 처리)
    this.showGameOverUI(isNewRecord);
  }

  private hitStar(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _star: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    if (this.gameOver) return;

    // 무적 상태면 충돌 무시
    if (this.player.getIsInvincible()) {
      // 별 제거만 하고 게임 오버 처리 안함
      const star = _star as Star;
      star.destroy();
      return;
    }

    this.gameOver = true;
    this.physics.pause();

    // 최고 점수 업데이트 및 갱신 여부 확인
    const isNewRecord = updateHighScore(this.difficulty, this.score);

    // 게임 오버 UI 표시 (비동기 처리)
    this.showGameOverUI(isNewRecord);
  }

  private collectItem(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _item: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    if (this.gameOver) return;

    // 아이템 제거
    const item = _item as Item;
    const itemTexture = item.texture.key;
    item.destroy();

    // 점수 보너스 (100점 추가) - updateScore를 통해 건너뛴 생성 포인트도 체크
    this.updateScore(100);

    // 아이템 종류에 따라 효과 적용
    if (itemTexture === 'hermes_shoes') {
      // 헤르메스 신발: 10초간 속도 2배 증가
      this.player.activateSpeedBoost(10000);

      // 효과 안내 텍스트
      const boostText = this.add.text(200, 100, '⚡ 속도 증가! ⚡', {
        fontSize: '24px',
        color: '#ffff00',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4
      }).setOrigin(0.5);

      // 2초 후 텍스트 제거
      this.time.delayedCall(2000, () => {
        boostText.destroy();
      });
    } else if (itemTexture === 'rainbow_star') {
      // 무지개 별: 5초간 무적
      this.player.activateInvincibility(5000);

      // 효과 안내 텍스트
      const invincibleText = this.add.text(200, 100, '⭐ 무적! ⭐', {
        fontSize: '24px',
        color: '#00ffff',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4
      }).setOrigin(0.5);

      // 2초 후 텍스트 제거
      this.time.delayedCall(2000, () => {
        invincibleText.destroy();
      });
    }
    // light_saber는 나중에 구현
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
    inputElement.style.cssText = `
      position: absolute;
      left: 50%;
      top: 315px;
      transform: translateX(-50%);
      width: 120px;
      height: 40px;
      font-size: 24px;
      text-align: center;
      text-transform: uppercase;
      border: 3px solid #FFD700;
      border-radius: 8px;
      background: #000;
      color: #fff;
      font-weight: bold;
      letter-spacing: 8px;
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
    const submitButtonText = this.add.text(200, 360, '랭킹 등록', {
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
        errorText = this.add.text(200, 410, '정확히 3글자를 입력하세요', {
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
        errorText = this.add.text(200, 410, '영어 대문자만 입력하세요', {
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

        const result = await submitScore(
          this.score,
          this.difficulty,
          initials,
          {
            gameStartTime: this.gameStartTime,
            gameEndTime: realNow(),
            goldCollected: this.goldCollected,
            diamondCollected: this.diamondCollected,
            topazCollected: this.topazCollected,
            rainbowCollected: this.rainbowCollected,
          },
          characterType
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
        this.scene.restart({ gameMode: this.gameMode, difficulty: this.difficulty });
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
