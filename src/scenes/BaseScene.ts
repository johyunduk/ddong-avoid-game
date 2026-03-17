import Phaser from 'phaser';

/**
 * 씬 전환 시 이전 포인터 이벤트가 새 씬으로 전파되는 것을 방지하는 기본 씬.
 * 모든 UI 씬은 이 클래스를 상속하여 개별 버튼마다 delayedCall을 감쌀 필요 없이
 * 씬 레벨에서 입력을 일괄 차단합니다.
 */
export default class BaseScene extends Phaser.Scene {
  /** 씬 전환 후 입력 차단 시간(ms). 0이면 즉시 허용 */
  protected inputGuardMs = 200;

  create() {
    if (this.inputGuardMs > 0) {
      this.input.enabled = false;
      this.time.delayedCall(this.inputGuardMs, () => {
        this.input.enabled = true;
      });
    }
  }
}
