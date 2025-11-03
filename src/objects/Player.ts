import Phaser from 'phaser';

export default class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private speed: number = 300;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // 기본 텍스처는 front (정면)
    super(scene, x, y, 'front');

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 캐릭터 크기 설정
    this.setDisplaySize(60, 80);

    // 히트박스를 몸통 중심부만 (더 작게)
    this.setSize(500, 750);
    this.setOffset(285,200);

    // 물리 설정
    this.setCollideWorldBounds(true);
    this.setImmovable(true);

    // 키보드 입력
    this.cursors = scene.input.keyboard!.createCursorKeys();
  }

  update() {
    let isMoving = false;

    // 좌우 이동
    if (this.cursors.left.isDown) {
      this.setVelocityX(-this.speed);
      this.setTexture('left'); // 왼쪽 이미지
      isMoving = true;
    } else if (this.cursors.right.isDown) {
      this.setVelocityX(this.speed);
      this.setTexture('right'); // 오른쪽 이미지
      isMoving = true;
    } else {
      this.setVelocityX(0);
    }

    // 터치/마우스 입력 처리
    if (this.scene.input.activePointer.isDown) {
      const pointerX = this.scene.input.activePointer.x;
      const playerX = this.x;

      if (pointerX < playerX - 20) {
        this.setVelocityX(-this.speed);
        this.setTexture('left'); // 왼쪽 이미지
        isMoving = true;
      } else if (pointerX > playerX + 20) {
        this.setVelocityX(this.speed);
        this.setTexture('right'); // 오른쪽 이미지
        isMoving = true;
      }
    }

    // 멈춰있을 때는 정면 이미지
    if (!isMoving && this.body?.velocity.x === 0) {
      this.setTexture('front');
    }
  }
}
