import Phaser from 'phaser';

export default class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private speed: number = 300;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, '');

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 텍스처가 없으면 생성
    if (!scene.textures.exists('player')) {
      this.createPlayerGraphics();
    }

    // 텍스처 적용
    this.setTexture('player');
    this.setDisplaySize(30, 45);

    // 히트박스를 몸통 중심부만 (더 작게)
    this.setSize(16, 28);
    this.setOffset(7, 10);

    // 물리 설정
    this.setCollideWorldBounds(true);
    this.setImmovable(true);

    // 키보드 입력
    this.cursors = scene.input.keyboard!.createCursorKeys();
  }

  private createPlayerGraphics() {
    const graphics = this.scene.make.graphics({ x: 0, y: 0 });

    // 부드러운 2D 스타일 플레이어

    // 그림자 (뒤쪽에 어두운 원형)
    graphics.fillStyle(0x000000, 0.15);
    graphics.fillCircle(15, 42, 8);

    // 머리 (부드러운 원형)
    graphics.fillStyle(0xffdbac, 1);
    graphics.fillCircle(15, 10, 8);

    // 머리 하이라이트
    graphics.fillStyle(0xffeacc, 0.6);
    graphics.fillCircle(12, 8, 3);

    // 눈
    graphics.fillStyle(0x000000, 1);
    graphics.fillCircle(12, 10, 1.5);
    graphics.fillCircle(18, 10, 1.5);

    // 입 (작은 미소)
    graphics.lineStyle(1, 0x000000, 0.5);
    graphics.beginPath();
    graphics.arc(15, 11, 3, 0, Math.PI, false);
    graphics.strokePath();

    // 몸통 (둥근 사각형)
    graphics.fillStyle(0x4169e1, 1);
    graphics.fillRoundedRect(8, 16, 14, 14, 3);

    // 몸통 하이라이트
    graphics.fillStyle(0x6fa3ff, 0.4);
    graphics.fillRoundedRect(9, 17, 6, 6, 2);

    // 몸통 그림자
    graphics.fillStyle(0x2854b8, 0.3);
    graphics.fillRoundedRect(8, 25, 14, 5, 3);

    // 팔 (둥근 형태)
    graphics.fillStyle(0x4169e1, 1);
    graphics.fillRoundedRect(4, 18, 4, 10, 2);
    graphics.fillRoundedRect(22, 18, 4, 10, 2);

    // 다리 (둥근 형태)
    graphics.fillStyle(0x2c2c2c, 1);
    graphics.fillRoundedRect(9, 30, 5, 10, 2);
    graphics.fillRoundedRect(16, 30, 5, 10, 2);

    // 신발 (타원형)
    graphics.fillStyle(0x000000, 1);
    graphics.fillEllipse(11, 40, 4, 2);
    graphics.fillEllipse(18, 40, 4, 2);

    graphics.generateTexture('player', 30, 45);
    graphics.destroy();
  }

  update() {
    // 좌우 이동
    if (this.cursors.left.isDown) {
      this.setVelocityX(-this.speed);
    } else if (this.cursors.right.isDown) {
      this.setVelocityX(this.speed);
    } else {
      this.setVelocityX(0);
    }

    // 터치/마우스 입력 처리
    if (this.scene.input.activePointer.isDown) {
      const pointerX = this.scene.input.activePointer.x;
      const playerX = this.x;

      if (pointerX < playerX - 20) {
        this.setVelocityX(-this.speed);
      } else if (pointerX > playerX + 20) {
        this.setVelocityX(this.speed);
      }
    }
  }
}
