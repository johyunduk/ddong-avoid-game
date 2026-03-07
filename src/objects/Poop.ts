import Phaser from 'phaser';
import { type Difficulty, Difficulty as DifficultyEnum } from '../types/GameMode';
import { isChristmasSeason, CHRISTMAS_POOP_KEYS, REGULAR_POOP_KEYS } from '../utils/seasonChecker';
import { POOP_CONFIG } from '../config/poop';

// 세션 시작 시 한 번만 평가 — 스폰마다 배열 생성 및 Date() 호출 방지
const AVAILABLE_TEXTURES: string[] = isChristmasSeason()
  ? [...REGULAR_POOP_KEYS, ...CHRISTMAS_POOP_KEYS]
  : [...REGULAR_POOP_KEYS];

// 크기를 크게 설정하는 크리스마스 똥 목록
const SPECIAL_CHRISTMAS_TEXTURES = ['xmas_poop_nose', 'xmas_poop_ribbon', 'xmas_poop_santa', 'xmas_poop_beard'];

export default class Poop extends Phaser.Physics.Arcade.Sprite {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number
  ) {
    super(scene, x, y, AVAILABLE_TEXTURES[0]);

    this.setOrigin(0.5);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDisplaySize(POOP_CONFIG.normal.size.normal, POOP_CONFIG.normal.size.normal);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(POOP_CONFIG.normal.hitbox.normal, POOP_CONFIG.normal.hitbox.normal);
      body.setCollideWorldBounds(false);
    }

    // 풀에서 재사용될 때까지 비활성 상태로 대기
    this.setActive(false).setVisible(false);
    if (body) body.setEnable(false);
  }

  /**
   * 풀에서 꺼내 사용할 때 호출 — 텍스처·크기·위치를 재설정하고 활성화
   */
  reinit(x: number, y: number, difficulty: Difficulty) {
    const randomTexture = AVAILABLE_TEXTURES[
      Math.floor(Math.random() * AVAILABLE_TEXTURES.length)
    ];
    this.setTexture(randomTexture);

    const isExtreme = difficulty === DifficultyEnum.EXTREME;
    const isSpecial = SPECIAL_CHRISTMAS_TEXTURES.includes(randomTexture);

    const displaySize = isSpecial
      ? (isExtreme ? POOP_CONFIG.normal.specialSize.extreme : POOP_CONFIG.normal.specialSize.normal)
      : (isExtreme ? POOP_CONFIG.normal.size.extreme : POOP_CONFIG.normal.size.normal);
    const hitboxSize = isExtreme ? POOP_CONFIG.normal.hitbox.extreme : POOP_CONFIG.normal.hitbox.normal;

    this.setDisplaySize(displaySize, displaySize);
    this.setActive(true).setVisible(true);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.reset(x, y); // position + velocity 초기화 (내부에서 setPosition 호출)
      body.setSize(hitboxSize, hitboxSize);
      body.setEnable(true);
    }

    // 속도는 호출자(GameScene)가 설정
  }

  update() {
    // 화면 밖으로 나가면 풀에 반환 (destroy 대신 비활성화)
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
