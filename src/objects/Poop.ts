import Phaser from 'phaser';
import { type Difficulty, Difficulty as DifficultyEnum } from '../types/GameMode';
import { isChristmasSeason, CHRISTMAS_POOP_KEYS, REGULAR_POOP_KEYS } from '../utils/seasonChecker';
import { POOP_CONFIG } from '../config/poop';
import PoolablePoopBase from './PoolablePoopBase';

// 세션 시작 시 한 번만 평가 — 스폰마다 배열 생성 및 Date() 호출 방지
const AVAILABLE_TEXTURES: string[] = isChristmasSeason()
  ? [...REGULAR_POOP_KEYS, ...CHRISTMAS_POOP_KEYS]
  : [...REGULAR_POOP_KEYS];

export default class Poop extends PoolablePoopBase {
  private _displaySize: number = 0;
  private _hitboxSize: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number
  ) {
    super(scene, x, y, AVAILABLE_TEXTURES[0]);

    this.setOrigin(0.5);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const initSize = POOP_CONFIG.normal.size.normal;
    const initHitbox = POOP_CONFIG.normal.hitbox.normal;
    this.setDisplaySize(initSize, initSize);
    this._displaySize = initSize;

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      this.fitBodyToPoop(initHitbox);
      this._hitboxSize = initHitbox;
      body.setCollideWorldBounds(false);
    }

    // 풀에서 재사용될 때까지 비활성 상태로 대기
    this.setActive(false).setVisible(false);
    if (body) body.setEnable(false);
  }

  /**
   * 풀에서 꺼내 사용할 때 호출 — 텍스처·크기·위치를 재설정하고 활성화
   */
  override reinit(x: number, y: number, difficulty?: Difficulty) {
    const randomTexture = AVAILABLE_TEXTURES[
      Math.floor(Math.random() * AVAILABLE_TEXTURES.length)
    ];
    this.setTexture(randomTexture);

    const isExtreme = difficulty === DifficultyEnum.EXTREME || difficulty === DifficultyEnum.PHYSICAL;
    // 크리스마스 똥도 같은 크기 — 그림 몸통이 14종 모두 같다 (예전엔 성탄 넷만 1.4배로 키워 맞췄다)
    const displaySize = isExtreme ? POOP_CONFIG.normal.size.extreme : POOP_CONFIG.normal.size.normal;
    const hitboxSize = isExtreme ? POOP_CONFIG.normal.hitbox.extreme : POOP_CONFIG.normal.hitbox.normal;

    if (displaySize !== this._displaySize) {
      this.setDisplaySize(displaySize, displaySize);
      this._displaySize = displaySize;
    }
    this.setActive(true).setVisible(true);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.reset(x, y); // position + velocity 초기화 (내부에서 setPosition 호출)
      if (hitboxSize !== this._hitboxSize) {
        this.fitBodyToPoop(hitboxSize);
        this._hitboxSize = hitboxSize;
      }
      body.setEnable(true);
    }

    // 속도는 호출자(GameScene)가 설정
  }

  // recycle() / update() — PoolablePoopBase에서 상속
}
