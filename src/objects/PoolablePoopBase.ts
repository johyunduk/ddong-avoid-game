import Phaser from 'phaser';
import { POOP_CONFIG } from '../config/poop';
import { playFx } from '../utils/vfx';

/**
 * Object Pool 지원 똥 오브젝트의 공통 베이스 클래스
 * GoldPoop, DiamondPoop, TopazPoop, RainbowPoop에서 상속
 *
 * - reinit(x, y): 풀에서 꺼낼 때 위치·활성화 재설정 (속도는 호출자가 설정)
 * - update(): 화면 밖으로 나가면 destroy 대신 비활성화하여 풀에 반환
 * - recycle(): 화면 안에서 사라지면 = 파괴 → 타격 이펙트를 재생한다
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

  /**
   * 풀에 반환 (destroy 대신 비활성화).
   * @param silent 타격 이펙트를 생략한다 — 획득·피버 변환처럼 별도 연출이 있는 경우
   */
  recycle(silent: boolean = false) {
    if (!silent && this.active) this.playDestroyFx();
    this.setActive(false).setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.setEnable(false);
    }
  }

  /** 화면 안에서 사라졌을 때만 타격 이펙트 — 아래로 흘러나간 회수는 '파괴'가 아니다 */
  private playDestroyFx() {
    const scene = this.scene;
    if (!scene) return;
    const cam = scene.cameras.main;
    if (!cam || this.y < -POOP_CONFIG.destroyOffset || this.y > cam.height) return;
    playFx(scene, 'impactHit', this.x, this.y);
  }

  update() {
    if (!this.active) return;
    if (this.y > this.scene.cameras.main.height + POOP_CONFIG.destroyOffset) {
      this.recycle();
    }
  }
}
