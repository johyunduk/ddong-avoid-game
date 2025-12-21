import Phaser from 'phaser';
import { POOP_CONFIG } from '../config/poop';

export default class GoldPoop extends Phaser.Physics.Arcade.Sprite {
  private fallSpeed: number = POOP_CONFIG.gold.baseSpeed;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number
  ) {
    super(scene, x, y, 'gold_poop');

    // 원점을 중앙으로 설정
    this.setOrigin(0.5);

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 금똥 크기 설정
    this.setDisplaySize(POOP_CONFIG.gold.size, POOP_CONFIG.gold.size);

    // // 노란색 틴트로 더 눈에 띄게
    // this.setTint(0xFFFF00);

    // 렌더링 우선순위를 높게 설정 (다른 오브젝트보다 위에 표시)
    this.setDepth(POOP_CONFIG.gold.depth);

    // 물리 바디가 생성된 후 설정 적용
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // 히트박스 설정 (수집하기 쉽게 조금 넉넉하게)
      body.setSize(POOP_CONFIG.gold.hitbox, POOP_CONFIG.gold.hitbox);
      body.setCollideWorldBounds(false);
      body.setVelocityY(this.fallSpeed);
    }
  }

  update() {
    // 화면 밖으로 나가면 제거
    if (this.y > this.scene.cameras.main.height + POOP_CONFIG.destroyOffset) {
      this.destroy();
    }
  }
}
