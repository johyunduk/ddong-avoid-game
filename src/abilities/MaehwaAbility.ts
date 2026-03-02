import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';

/**
 * 매화 (SR)
 * - 기본 효과: 이동 속도 +50px/s
 * - 특수 능력: 100점마다 플레이어 위의 일반 똥 3개를 칼날 슬래시로 삭제
 *   이펙트: 가운데가 넓은 대각선 칼날 + 붉은 매화 잎 낙화
 */
export class MaehwaAbility extends BaseAbility {
  private lastMaehwaScore = 0;

  override getPlayerSpeedBonus(): number {
    return 50;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (!api.isClassicMode) return;
    if (score % 100 === 0 && score > this.lastMaehwaScore) {
      this.lastMaehwaScore = score;
      this.slashClosestPoops(3, api);
    }
  }

  private slashClosestPoops(count: number, api: GameSceneAPI): void {
    const active = api.poops
      .getChildren()
      .filter(p => {
        const sp = p as Phaser.Physics.Arcade.Sprite;
        return sp.active && sp.y < api.player.y;
      }) as Phaser.Physics.Arcade.Sprite[];

    active.sort((a, b) => {
      const da = Phaser.Math.Distance.Between(api.player.x, api.player.y, a.x, a.y);
      const db = Phaser.Math.Distance.Between(api.player.x, api.player.y, b.x, b.y);
      return da - db;
    });

    active.slice(0, count).forEach(poop => {
      this.drawSlashEffect(poop.x, poop.y, api);
      this.spawnPetals(poop.x, poop.y, api);
      poop.destroy();
    });
  }

  /** 가운데가 넓은 대각선(↗) 칼날 이펙트 */
  private drawSlashEffect(cx: number, cy: number, api: GameSceneAPI): void {
    const gfx = api.scene.add.graphics().setDepth(120);

    // 칼날: fillPoints로 ↗ 방향 마름모꼴 (끝은 뾰족, 중앙은 넓음)
    const len = 26; // 반길이
    const wid = 7;  // 중앙 최대 반폭
    // ↗ 방향 slash: (cx-len, cy+len) → (cx+len, cy-len) 축
    gfx.fillStyle(0xff3366, 0.9);
    gfx.fillPoints([
      new Phaser.Geom.Point(cx - len, cy + len),          // 좌하 끝
      new Phaser.Geom.Point(cx - wid * 0.4, cy + wid),    // 좌상 측면
      new Phaser.Geom.Point(cx + len, cy - len),          // 우상 끝
      new Phaser.Geom.Point(cx + wid * 0.4, cy - wid),    // 우하 측면
    ], true);

    // 외곽 흰색 글로우
    gfx.lineStyle(3, 0xffffff, 0.5);
    gfx.lineBetween(cx - len, cy + len, cx + len, cy - len);

    api.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 300,
      onComplete: () => gfx.destroy(),
    });
  }

  /** 붉은 매화 잎 여러 개 낙화 */
  private spawnPetals(cx: number, cy: number, api: GameSceneAPI): void {
    const PETAL_COUNT = 7;
    for (let i = 0; i < PETAL_COUNT; i++) {
      const petal = api.scene.add.graphics().setDepth(121);
      // 초기 위치: 파괴된 똥 주변 랜덤
      const startX = cx + Phaser.Math.Between(-12, 12);
      const startY = cy + Phaser.Math.Between(-12, 12);
      petal.setPosition(startX, startY);

      // 작은 타원형 꽃잎
      const petalW = Phaser.Math.Between(4, 7);
      const petalH = Phaser.Math.Between(7, 11);
      petal.fillStyle(0xff2255, 0.85 + Math.random() * 0.15);
      petal.fillEllipse(0, 0, petalW, petalH);
      petal.setAngle(Phaser.Math.Between(0, 360));

      // 바람에 날리며 낙하
      api.scene.tweens.add({
        targets: petal,
        x: startX + Phaser.Math.Between(-25, 25),
        y: startY + Phaser.Math.Between(30, 60),
        angle: petal.angle + Phaser.Math.Between(-120, 120),
        alpha: 0,
        duration: Phaser.Math.Between(400, 700),
        ease: 'Sine.easeIn',
        onComplete: () => petal.destroy(),
      });
    }
  }
}
