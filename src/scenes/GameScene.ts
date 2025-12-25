import Phaser from 'phaser';
import Player from '../objects/Player';
import Poop from '../objects/Poop';
import GoldPoop from '../objects/GoldPoop';
import DiamondPoop from '../objects/DiamondPoop';
import Star from '../objects/Star';
import Item from '../objects/Item';
import { GameMode, Difficulty, DIFFICULTIES, type DifficultyConfig } from '../types/GameMode';
import { FEVER_TIME_CONFIG } from '../config/feverTime';
import { POOP_CONFIG } from '../config/poop';
import { getHighScore, updateHighScore } from '../utils/localStorage';
import { submitScore, getUserInitials, setUserInitials } from '../utils/leaderboard';
import { isChristmasSeason } from '../utils/seasonChecker';

export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private poops!: Phaser.Physics.Arcade.Group;
  private goldPoops!: Phaser.Physics.Arcade.Group;
  private diamondPoops!: Phaser.Physics.Arcade.Group;
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
  private lastGoldPoopScore: number = 0; // 마지막으로 금똥이 나온 점수
  private lastDiamondPoopScore: number = 0; // 마지막으로 다이아똥이 나온 점수
  // 피버 타임 관련
  private isFeverTime: boolean = false; // 피버 타임 활성화 여부
  private feverTimeRemaining: number = 0; // 피버 타임 남은 시간 (ms)
  private feverTimeTimer!: Phaser.Time.TimerEvent; // 피버 타임 카운트다운 타이머
  private feverTimeUITexts: Phaser.GameObjects.Text[] = []; // 피버 타임 UI 텍스트 (각 글자별)
  private feverTimeColorOffset: number = 0; // 무지개 색상 회전 오프셋
  private feverTimeColorTimer!: Phaser.Time.TimerEvent; // 색상 애니메이션 타이머
  private lastFeverTimeScore: number = 0; // 마지막 피버 타임 발동 점수

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
    // 피버 타임 초기화
    this.isFeverTime = false;
    this.feverTimeRemaining = 0;
    this.lastFeverTimeScore = 0;

    // ModeSelectScene/DifficultySelectScene으로부터 게임 모드와 난이도를 받음
    if (data.gameMode) {
      this.gameMode = data.gameMode;
      // console.log('Game Mode:', this.gameMode);
    }
    if (data.difficulty) {
      this.difficulty = data.difficulty;
      // console.log('Difficulty:', this.difficulty);
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
    // 게임 모드별 필요한 에셋만 로딩 (로딩 시간 최적화)

    if (this.gameMode === GameMode.CLASSIC) {
      // === 클래식 모드 전용 에셋 ===

      // 배경 이미지 (난이도별)
      if (this.difficulty === Difficulty.EASY) {
        this.load.image('background2', 'assets/backgrounds/background2.webp');
      } else if (this.difficulty === Difficulty.NORMAL) {
        this.load.image('background3', 'assets/backgrounds/background3.webp');
      } else if (this.difficulty === Difficulty.HARD) {
        this.load.image('background', 'assets/backgrounds/background.webp');
      } else if (this.difficulty === Difficulty.EXTREME) {
        if (isChristmasSeason()) {
          this.load.image('xmas_background', 'assets/backgrounds/xmas_background.webp');
        } else {
          this.load.image('background', 'assets/backgrounds/background.webp');
        }
      }

      // 플레이어 이미지 (일반 캐릭터)
      this.load.image('front', 'assets/players/front.webp');
      this.load.image('left', 'assets/players/left.webp');
      this.load.image('right', 'assets/players/right.webp');

      // 똥 이미지
      this.load.image('poop', 'assets/poops/poop.webp');
      this.load.image('poop_glasses', 'assets/poops/poop_glasses.webp');
      this.load.image('poop_sunglass', 'assets/poops/poop_sunglass.webp');
      this.load.image('poop_sunglass2', 'assets/poops/poop_sunglass2.webp');
      this.load.image('poop_smile', 'assets/poops/poop_smile.webp');
      this.load.image('gold_poop', 'assets/poops/gold_poop.webp');
      this.load.image('diamond_poop', 'assets/poops/diamond_poop.webp');

      // 크리스마스 시즌이면 크리스마스 똥도 로드
      if (this.difficulty === Difficulty.EXTREME && isChristmasSeason()) {
        this.load.image('xmas_poop_ribbon', 'assets/poops/xmas_present_poop.webp');
        this.load.image('xmas_poop_nose', 'assets/poops/xmas_nose_poop.webp');
        this.load.image('xmas_poop_santa', 'assets/poops/xmas_santa_poop.webp');
        this.load.image('xmas_poop_rudolf', 'assets/poops/xmas_rudolf_poop.webp');
        this.load.image('xmas_poop_beard', 'assets/poops/xmas_beard_poop.webp');
      }

    } else if (this.gameMode === GameMode.ITEM) {
      // === 아이템 모드 전용 에셋 ===

      // 우주 배경
      this.load.image('space_background', 'assets/backgrounds/space_background.webp');

      // 우주비행사 플레이어
      this.load.image('astronaut_front', 'assets/players/astronaut_front.webp');
      this.load.image('astronaut_left', 'assets/players/astronaut_left.webp');
      this.load.image('astronaut_right', 'assets/players/astronaut_right.webp');

      // 별 이미지
      this.load.image('star', 'assets/stars/star.webp');
      this.load.image('star_smile', 'assets/stars/star_smile.webp');
      this.load.image('star_glasses', 'assets/stars/star_glasses.webp');
      this.load.image('star_sunglass', 'assets/stars/star_sunglass.webp');

      // 아이템 이미지
      this.load.image('hermes_shoes', 'assets/items/hermes_shoes.webp');
      this.load.image('light_saber', 'assets/items/light_saber.webp');
      this.load.image('rainbow_star', 'assets/items/rainbow_star.webp');
    }

    // BGM은 create()에서 필요한 것만 Lazy Loading (초기 로딩 속도 개선)
  }

  create() {
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

    // 배경음악 Lazy Loading 및 재생 (게임 시작 후 로딩, 초기 로딩 시간 단축)
    let bgMusicKey = 'bgMusic';
    let bgMusicPath = 'assets/bgms/poop.mp3';

    if (this.gameMode === GameMode.ITEM) {
      bgMusicKey = 'starBgMusic';
      bgMusicPath = 'assets/bgms/star_fall.mp3';
    } else if (this.difficulty === Difficulty.EXTREME && isChristmasSeason()) {
      // EXTREME 난이도 + 크리스마스 시즌: 크리스마스 BGM
      bgMusicKey = 'xmasBgMusic';
      bgMusicPath = 'assets/bgms/xmas_poop.mp3';
    }

    // BGM이 아직 로드되지 않았으면 동적 로딩
    if (!this.cache.audio.exists(bgMusicKey)) {
      this.load.audio(bgMusicKey, bgMusicPath);
      this.load.once('complete', () => {
        this.bgMusic = this.sound.add(bgMusicKey, { loop: true, volume: 0.5 });
        this.bgMusic.play();
      });
      this.load.start(); // 동적 로딩 시작
    } else {
      // 이미 로드되어 있으면 바로 재생
      this.bgMusic = this.sound.add(bgMusicKey, { loop: true, volume: 0.5 });
      this.bgMusic.play();
    }

    // 월드 바운드 설정 (플레이어가 화면 안쪽에만 머무르도록)
    this.physics.world.setBounds(15, 0, 370, 600);

    // 플레이어 생성 (난이도별 속도 적용, 게임 모드별 스프라이트)
    const playerTexturePrefix = this.gameMode === GameMode.ITEM ? 'astronaut_' : '';
    this.player = new Player(this, 200, 520, this.difficultyConfig.playerSpeed, playerTexturePrefix);

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

    // 점수 증가 타이머
    this.time.addEvent({
      delay: 100,
      callback: this.updateScore,
      callbackScope: this,
      loop: true
    });

    // 히트박스 디버그 표시, hit box visibility
    // this.physics.world.createDebugGraphic();
    // this.physics.world.drawDebug = true;
  }

  update() {
    if (!this.gameOver) {
      this.player.update();
    }
  }

  private spawnPoop() {
    if (this.gameOver) return;

    // 난이도에 따른 개수만큼 생성 (각각 다른 높이에서)
    const poopCount = this.difficultyConfig.poopCount;
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
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.gold.speedReduction;
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
      const fallSpeed = this.difficultyConfig.baseSpeed + (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement) - POOP_CONFIG.diamond.speedReduction;
      diamondPoop.body.velocity.y = fallSpeed;
      // console.log(`[다이아똥] 속도 설정 완료: ${fallSpeed}`);
    } else {
      // console.log('[다이아똥] 경고: body가 없습니다!');
    }

    // console.log(`다이아똥 생성! 점수: ${this.score}, 위치: (${x}, ${y}), depth: ${diamondPoop.depth}`);
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
    // 40점 단위로 금똥 생성 체크
    for (let score = oldScore + 1; score <= newScore; score++) {
      // 피버 타임 체크
      this.checkFeverTime(score);

      // 피버 타임 중이 아닐 때만 일반 금똥/다이아똥 생성
      if (!this.isFeverTime) {
        // 40점마다 금똥 생성 (40, 80, 120, 160, ...)
        if (score % 40 === 0 && score > this.lastGoldPoopScore) {
          this.spawnGoldPoop();
          this.lastGoldPoopScore = score;
        }

        // 100점마다 다이아똥 생성 (100, 200, 300, ...)
        if (score % 100 === 0 && score > this.lastDiamondPoopScore) {
          this.spawnDiamondPoop();
          this.lastDiamondPoopScore = score;
        }
      }
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
    _poop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    if (this.gameOver) return;

    this.gameOver = true;
    this.physics.pause();

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

  private collectGoldPoop(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _goldPoop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    if (this.gameOver) return;

    // 금똥 제거
    const goldPoop = _goldPoop as GoldPoop;
    goldPoop.destroy();

    // 점수 보너스 (20점 추가) - updateScore를 통해 건너뛴 생성 포인트도 체크
    this.updateScore(20);

    // 금똥 획득 안내 텍스트 (피버 타임 중에는 표시하지 않음)
    if (!this.isFeverTime) {
      const goldText = this.add.text(200, 100, '💰 금똥 +20점! 💰', {
        fontSize: '28px',
        color: '#FFD700',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4
      }).setOrigin(0.5);

      // 2초 후 텍스트 제거
      this.time.delayedCall(2000, () => {
        goldText.destroy();
      });
    }
  }

  private collectDiamondPoop(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    _diamondPoop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    if (this.gameOver) return;

    // 다이아똥 제거
    const diamondPoop = _diamondPoop as DiamondPoop;
    diamondPoop.destroy();

    // 점수 보너스 (40점 추가) - updateScore를 통해 건너뛴 생성 포인트도 체크
    this.updateScore(40);

    // 다이아똥 획득 안내 텍스트 (피버 타임 중에는 표시하지 않음)
    if (!this.isFeverTime) {
      const diamondText = this.add.text(200, 100, '💎 다이아똥 +40점! 💎', {
        fontSize: '32px',
        color: '#00FFFF',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4
      }).setOrigin(0.5);

      // 1초 후 텍스트 제거
      this.time.delayedCall(1000, () => {
        diamondText.destroy();
      });
    }
  }

  /**
   * 게임 오버 UI 표시 및 랭킹 시스템 연동
   */
  private async showGameOverUI(isNewRecord: boolean) {
    // 반투명 검정 배경 추가 (가독성 향상)
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.7).setDepth(200);

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
      this.showRestartButton();
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
        // 점수 제출 (검증 없이)
        const result = await submitScore(
          this.score,
          this.difficulty,
          initials
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
      this.showRestartButton();
    });

    // Enter 키로도 제출 가능
    inputElement.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitButtonText.emit('pointerdown');
      }
    });
  }

  /**
   * 재시작 버튼 표시 (다시 하기 + 메인 메뉴) - 버튼 스타일
   */
  private showRestartButton() {
    // 다시 하기 버튼 배경
    const retryButtonBg = this.add.rectangle(200, 450, 250, 70, 0x00aa00)
      .setOrigin(0.5)
      .setDepth(199)
      .setStrokeStyle(3, 0xffffff);

    // 다시 하기 버튼 텍스트
    const retryButtonText = this.add.text(200, 450, '다시 하기', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(200);

    // 다시 하기 버튼 인터랙티브 영역 (배경을 클릭 가능하게)
    retryButtonBg.setInteractive({ useHandCursor: true });

    // 메인 메뉴 버튼 배경
    const menuButtonBg = this.add.rectangle(200, 555, 250, 70, 0x555555)
      .setOrigin(0.5)
      .setDepth(199)
      .setStrokeStyle(3, 0xffffff);

    // 메인 메뉴 버튼 텍스트
    const menuButtonText = this.add.text(200, 555, '메인 메뉴', {
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
