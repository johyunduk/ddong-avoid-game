import Phaser from 'phaser';
import { type Difficulty, Difficulty as DifficultyEnum } from '../types/GameMode';
import { isChristmasSeason, CHRISTMAS_POOP_KEYS, REGULAR_POOP_KEYS } from '../utils/seasonChecker';

export default class Poop extends Phaser.Physics.Arcade.Sprite {
  private fallSpeed: number;

  /**
   * 사용 가능한 똥 텍스처 배열 반환
   * 크리스마스 시즌(12/1 ~ 1/31)에는 xmas 똥들도 포함
   */
  private static getAvailableTextures(): string[] {
    if (isChristmasSeason()) {
      // 크리스마스 시즌: 일반 똥 + 크리스마스 똥
      return [...REGULAR_POOP_KEYS, ...CHRISTMAS_POOP_KEYS];
    }
    // 일반 시즌: 일반 똥만
    return [...REGULAR_POOP_KEYS];
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    difficultyLevel: number = 1,
    difficulty: Difficulty = DifficultyEnum.HARD
  ) {
    // 랜덤하게 똥 텍스처 선택 (시즌에 따라)
    const availableTextures = Poop.getAvailableTextures();
    const randomTexture = availableTextures[
      Math.floor(Math.random() * availableTextures.length)
    ];

    super(scene, x, y, randomTexture);

    // 원점을 중앙으로 설정
    this.setOrigin(0.5);

    // 낙하 속도 (난이도에 따라 증가)
    this.fallSpeed = 200 + (difficultyLevel * 40);

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // EXTREME 모드일 때 똥 크기를 줄임
    const isExtreme = difficulty === DifficultyEnum.EXTREME;
    let displaySize = isExtreme ? 38 : 40;
    const hitboxSize = isExtreme ? 470 : 500;

    // 특정 크리스마스 똥만 크기를 크게 설정 (코 & 리본)
    const isSpecialChristmasPoop = ['xmas_poop_nose', 'xmas_poop_ribbon', 'xmas_poop_santa', 'xmas_poop_beard'].includes(randomTexture);
    if (isSpecialChristmasPoop) {
      displaySize = isExtreme ? 52 : 56;
    }

    // 똥 이미지 크기 설정
    this.setDisplaySize(displaySize, displaySize);

    // 물리 바디가 생성된 후 설정 적용
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      // 히트박스 설정
      body.setSize(hitboxSize, hitboxSize);
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
