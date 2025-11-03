import Phaser from 'phaser';

export default class Poop extends Phaser.GameObjects.Text {
  private fallSpeed: number;

  constructor(scene: Phaser.Scene, x: number, y: number, difficulty: number = 1) {
    super(scene, x, y, '💩', {
      fontSize: '30px'
    });

    // 원점을 중앙으로 설정
    this.setOrigin(0.5);

    // 낙하 속도 (난이도에 따라 증가)
    this.fallSpeed = 200 + (difficulty * 40);

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 물리 바디가 생성된 후 설정 적용
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // 히트박스 설정
      body.setSize(20, 20);
      body.setCollideWorldBounds(false);
      body.setVelocityY(this.fallSpeed);
    }
  }

  update() {
    // 화면 밖으로 나가면 제거
    if (this.y > this.scene.cameras.main.height + 50) {
      this.destroy();
    }
  }
}
