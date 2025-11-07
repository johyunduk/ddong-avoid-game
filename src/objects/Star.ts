import Phaser from 'phaser';

export default class Star extends Phaser.Physics.Arcade.Sprite {
  private fallSpeed: number;
  private static readonly STAR_TEXTURES = [
    'star',
    'star_smile',
    'star_glasses',
    'star_sunglass'
  ];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // 랜덤하게 별 텍스처 선택
    const randomTexture = Star.STAR_TEXTURES[
      Math.floor(Math.random() * Star.STAR_TEXTURES.length)
    ];

    super(scene, x, y, randomTexture);

    // 원점을 중앙으로 설정
    this.setOrigin(0.5);

    // 낙하 속도 (아이템 모드는 고정 속도)
    this.fallSpeed = 200;

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 별 이미지 크기 설정
    this.setDisplaySize(40, 40);

    // 물리 바디가 생성된 후 설정 적용
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // 히트박스 설정
      body.setSize(500, 500);
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
