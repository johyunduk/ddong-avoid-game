import Phaser from 'phaser';
import { loadGameFont } from '../utils/gameFont';

/**
 * 첫 씬 — 게임 글꼴이 올라온 뒤 메인(ModeSelectScene)을 연다. 글자를 하나도 그리지 않는다.
 *
 * 게임 인스턴스는 main.ts 에서 **동기로** 만들어야 한다 (비동기로 만들면 키보드 포커스를 못 받는다).
 * 그래서 글꼴은 게임을 만든 뒤 여기서 기다린다. 늦거나 실패해도 3초 안에 넘어간다 (시스템 글꼴)
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    loadGameFont().finally(() => {
      if (this.scene.isActive()) this.scene.start('ModeSelectScene');
    });
  }
}
