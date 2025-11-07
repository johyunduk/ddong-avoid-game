import Phaser from 'phaser';
import Player from '../objects/Player';
import Poop from '../objects/Poop';
import Star from '../objects/Star';
import Item from '../objects/Item';
import { GameMode, Difficulty, DIFFICULTIES, type DifficultyConfig } from '../types/GameMode';
import { getHighScore, updateHighScore } from '../utils/localStorage';

export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private poops!: Phaser.Physics.Arcade.Group;
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

  constructor() {
    super('GameScene');
  }

  init(data: { gameMode?: GameMode; difficulty?: Difficulty }) {
    // ModeSelectScene/DifficultySelectScene으로부터 게임 모드와 난이도를 받음
    if (data.gameMode) {
      this.gameMode = data.gameMode;
      console.log('Game Mode:', this.gameMode);
    }
    if (data.difficulty) {
      this.difficulty = data.difficulty;
      console.log('Difficulty:', this.difficulty);
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
    // 배경 이미지 로드 (난이도별 + 아이템 모드)
    this.load.image('background', 'assets/backgrounds/background.png');
    this.load.image('background2', 'assets/backgrounds/background2.png');
    this.load.image('background3', 'assets/backgrounds/background3.png');
    this.load.image('space_background', 'assets/backgrounds/space_background.png');

    // 플레이어 이미지 로드
    this.load.image('front', 'assets/players/front.png');
    this.load.image('left', 'assets/players/left.png');
    this.load.image('right', 'assets/players/right.png');

    // 우주비행사 이미지 로드 (아이템 모드용)
    this.load.image('astronaut_front', 'assets/players/astronaut_front.png');
    this.load.image('astronaut_left', 'assets/players/astronaut_left.png');
    this.load.image('astronaut_right', 'assets/players/astronaut_right.png');

    // 다양한 똥 이미지 로드
    this.load.image('poop', 'assets/poops/poop.png');
    this.load.image('poop_glasses', 'assets/poops/poop_glasses.png');
    this.load.image('poop_sunglass', 'assets/poops/poop_sunglass.png');
    this.load.image('poop_sunglass2', 'assets/poops/poop_sunglass2.png');
    this.load.image('poop_smile', 'assets/poops/poop_smile.png');

    // 별 이미지 로드 (아이템 모드용)
    this.load.image('star', 'assets/stars/star.png');
    this.load.image('star_smile', 'assets/stars/star_smile.png');
    this.load.image('star_glasses', 'assets/stars/star_glasses.png');
    this.load.image('star_sunglass', 'assets/stars/star_sunglass.png');

    // 아이템 이미지 로드
    this.load.image('hermes_shoes', 'assets/items/hermes_shoes.png');
    this.load.image('light_saber', 'assets/items/light_saber.png');
    this.load.image('rainbow_star', 'assets/items/rainbow_star.png');

    // 오디오 로드
    this.load.audio('bgMusic', 'assets/bgms/poop.mp3');
    this.load.audio('starBgMusic', 'assets/bgms/star_fall.mp3');
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

    // 배경음악 재생 (무한 반복, 게임 모드별 BGM)
    const bgMusicKey = this.gameMode === GameMode.ITEM ? 'starBgMusic' : 'bgMusic';
    this.bgMusic = this.sound.add(bgMusicKey, { loop: true, volume: 0.5 });
    this.bgMusic.play();

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

      // 충돌 감지
      this.physics.add.overlap(
        this.player,
        this.poops,
        this.hitPoop as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
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

  private updateScore() {
    if (!this.gameOver) {
      this.score += 1;
      this.scoreText.setText(`점수: ${this.score}`);

      // 실시간으로 최고 점수 갱신
      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.highScoreText.setText(`최고: ${this.highScore}`);
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
        callback: this.spawnPoop,
        callbackScope: this,
        loop: true
      });
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

    // 게임 오버 화면
    this.add.text(200, 200, 'GAME OVER', {
      fontSize: '48px',
      color: '#ff0000',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    // 새 기록 메시지
    if (isNewRecord) {
      this.add.text(200, 270, '🎉 NEW RECORD! 🎉', {
        fontSize: '28px',
        color: '#FFD700',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4
      }).setOrigin(0.5);
    }

    // 최종 점수
    this.add.text(200, isNewRecord ? 320 : 290, `최종 점수: ${this.score}`, {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // 최고 점수 표시
    this.add.text(200, isNewRecord ? 355 : 325, `최고 점수: ${this.highScore}`, {
      fontSize: '20px',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.add.text(200, isNewRecord ? 410 : 380, '클릭하여 모드 선택으로', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // 재시작 - 모드 선택 씬으로 돌아가기
    this.input.once('pointerdown', () => {
      // 모든 사운드 정리
      this.sound.stopAll();
      // 플레이어 효과 정리
      this.player.cleanupEffects();
      this.gameOver = false;
      this.score = 0;
      this.difficultyLevel = 2;
      this.scene.start('ModeSelectScene');
    });

    // 토스 SDK 연동 부분 (나중에 활성화)
    // this.submitScoreToToss(this.score);
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

    // 게임 오버 화면
    this.add.text(200, 200, 'GAME OVER', {
      fontSize: '48px',
      color: '#ff0000',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5);

    // 새 기록 메시지
    if (isNewRecord) {
      this.add.text(200, 270, '🎉 NEW RECORD! 🎉', {
        fontSize: '28px',
        color: '#FFD700',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4
      }).setOrigin(0.5);
    }

    // 최종 점수
    this.add.text(200, isNewRecord ? 320 : 290, `최종 점수: ${this.score}`, {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // 최고 점수 표시
    this.add.text(200, isNewRecord ? 355 : 325, `최고 점수: ${this.highScore}`, {
      fontSize: '20px',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.add.text(200, isNewRecord ? 410 : 380, '클릭하여 모드 선택으로', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // 재시작 - 모드 선택 씬으로 돌아가기
    this.input.once('pointerdown', () => {
      // 모든 사운드 정리
      this.sound.stopAll();
      // 플레이어 효과 정리
      this.player.cleanupEffects();
      this.gameOver = false;
      this.score = 0;
      this.difficultyLevel = 2;
      this.scene.start('ModeSelectScene');
    });
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

    // 점수 보너스 (100점 추가)
    this.score += 100;
    this.scoreText.setText(`점수: ${this.score}`);

    // 실시간으로 최고 점수 갱신
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.highScoreText.setText(`최고: ${this.highScore}`);
    }

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
}
