import Phaser from 'phaser';

export default class Item extends Phaser.Physics.Arcade.Sprite {
  private fallSpeed: number;
  private static readonly ITEM_TEXTURES = [
    'hermes_shoes',
    'light_saber',
    'rainbow_star'
  ];

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // 랜덤하게 아이템 텍스처 선택
    const randomTexture = Item.ITEM_TEXTURES[
      Math.floor(Math.random() * Item.ITEM_TEXTURES.length)
    ];

    super(scene, x, y, randomTexture);

    // 원점을 중앙으로 설정
    this.setOrigin(0.5);

    // 낙하 속도 (별보다 느리게)
    this.fallSpeed = 150;

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 아이템 이미지 크기 설정
    this.setDisplaySize(40, 40);

    // 물리 바디가 생성된 후 설정 적용
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // 히트박스 설정 (아이템은 획득하기 쉽게 작게)
      body.setSize(300, 300);
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
