import Phaser from 'phaser';
import Player from '../objects/Player';
import Poop from '../objects/Poop';

export default class GameScene extends Phaser.Scene {
  private player!: Player;
  private poops!: Phaser.Physics.Arcade.Group;
  private score: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private gameOver: boolean = false;
  private spawnTimer!: Phaser.Time.TimerEvent;
  private difficultyLevel: number = 2;

  constructor() {
    super('GameScene');
  }

  preload() {
    // 이미지 로드
    this.load.image('background', 'assets/background.png');
    this.load.image('front', 'assets/front.png');
    this.load.image('left', 'assets/left.png');
    this.load.image('right', 'assets/right.png');
    this.load.image('poop', 'assets/poop.png');
  }

  create() {
    // 배경 이미지 추가
    const background = this.add.image(200, 300, 'background');
    // 배경을 화면에 맞게 조정
    background.setDisplaySize(400, 600);

    // 월드 바운드 설정 (플레이어가 화면 안쪽에만 머무르도록)
    this.physics.world.setBounds(15, 0, 370, 600);

    // 플레이어 생성
    this.player = new Player(this, 200, 520);

    // 💩 그룹 생성
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

    // 점수 텍스트
    this.scoreText = this.add.text(16, 16, '점수: 0', {
      fontSize: '24px',
      color: '#000'
    });

    // 조작 안내
    this.add.text(200, 50, '← → 키로 이동', {
      fontSize: '16px',
      color: '#000'
    }).setOrigin(0.5);

    // 💩 생성 타이머
    this.spawnTimer = this.time.addEvent({
      delay: 1000,
      callback: this.spawnPoop,
      callbackScope: this,
      loop: true
    });

    // 점수 증가 타이머
    this.time.addEvent({
      delay: 100,
      callback: this.updateScore,
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
  }

  update() {
    if (!this.gameOver) {
      this.player.update();
    }
  }

  private spawnPoop() {
    if (this.gameOver) return;

    // 한 번에 6개씩 생성 (각각 다른 높이에서)
    for (let i = 0; i < 6; i++) {
      // 💩이 화면 전체에서 생성되도록 (💩 크기 15를 고려해서 양쪽 여유)
      const x = Phaser.Math.Between(15, 385);
      const y = Phaser.Math.Between(-200, -20);
      const poop = new Poop(this, x, y, this.difficultyLevel);
      this.poops.add(poop, true);

      // 명시적으로 velocity 설정 (그룹 추가 후)
      if (poop.body) {
        const fallSpeed = 200 + (this.difficultyLevel * 40);
        poop.body.velocity.y = fallSpeed;
      }
    }
  }

  private updateScore() {
    if (!this.gameOver) {
      this.score += 1;
      this.scoreText.setText(`점수: ${this.score}`);
    }
  }

  private increaseDifficulty() {
    if (!this.gameOver) {
      this.difficultyLevel += 0.3;
      // 생성 주기 단축 (최소 400ms)
      const newDelay = Math.max(400, 1000 - (this.difficultyLevel * 80));

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

    // 게임 오버 화면
    this.add.text(200, 250, 'GAME OVER', {
      fontSize: '48px',
      color: '#ff0000'
    }).setOrigin(0.5);

    this.add.text(200, 320, `최종 점수: ${this.score}`, {
      fontSize: '24px',
      color: '#000'
    }).setOrigin(0.5);

    this.add.text(200, 370, '클릭하여 재시작', {
      fontSize: '20px',
      color: '#000'
    }).setOrigin(0.5);

    // 재시작
    this.input.once('pointerdown', () => {
      this.scene.restart();
      this.gameOver = false;
      this.score = 0;
      this.difficultyLevel = 2;
    });

    // 토스 SDK 연동 부분 (나중에 활성화)
    // this.submitScoreToToss(this.score);
  }
}
