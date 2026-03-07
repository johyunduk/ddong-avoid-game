import Phaser from 'phaser';
import { POOP_CONFIG } from '../config/poop';

/**
 * Object Pool 지원 똥 오브젝트의 공통 베이스 클래스
 * GoldPoop, DiamondPoop, TopazPoop, RainbowPoop에서 상속
 *
 * - reinit(x, y): 풀에서 꺼낼 때 위치·활성화 재설정 (속도는 호출자가 설정)
 * - update(): 화면 밖으로 나가면 destroy 대신 비활성화하여 풀에 반환
 */
export default class PoolablePoopBase extends Phaser.Physics.Arcade.Sprite {
  reinit(x: number, y: number) {
    this.setActive(true).setVisible(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.reset(x, y); // position + velocity 초기화 (내부에서 setPosition 호출)
      body.setEnable(true);
    }
    // 속도는 호출자(GameScene)가 설정
  }

  update() {
    if (this.y > this.scene.cameras.main.height + POOP_CONFIG.destroyOffset) {
      this.setActive(false).setVisible(false);
      const body = this.body as Phaser.Physics.Arcade.Body;
      if (body) {
        body.setVelocity(0, 0);
        body.setEnable(false);
      }
    }
  }
}
