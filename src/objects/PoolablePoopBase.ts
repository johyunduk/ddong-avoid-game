import Phaser from 'phaser';
import { POOP_BODY, POOP_CONFIG } from '../config/poop';
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
  /**
   * 충돌 판정을 **몸통 기준**으로 — 폭 hitboxW(텍스처 px), 높이는 몸통 상자 비율, 자리는 몸통 가운데.
   * 캔버스 가운데가 아니라 몸통 가운데에 두므로 위로 나간 장식(모자·뿔·반짝이)은 판정에 안 들어간다.
   * 크기·오프셋은 텍스처 px 이라 표시 크기(setDisplaySize)를 바꿔도 같은 비율로 따라간다
   */
  protected fitBodyToPoop(hitboxW: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const bw = POOP_BODY.right - POOP_BODY.left;
    const bh = POOP_BODY.bottom - POOP_BODY.top;
    const w = hitboxW;
    const h = (bh * hitboxW) / bw;
    const cx = (POOP_BODY.left + POOP_BODY.right) / 2;
    const cy = (POOP_BODY.top + POOP_BODY.bottom) / 2;
    body.setSize(w, h, false);
    body.setOffset(cx - w / 2, cy - h / 2);
  }

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
