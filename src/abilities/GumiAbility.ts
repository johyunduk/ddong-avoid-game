import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI, SpecialPoopType } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { ensureGlowDot } from '../utils/glowDot';
import { GUMI_PARAMS } from '../config/abilityParams';

const HIT_R = 18;

// 빨주노초파남보흰회 (검정은 ADD에서 안 보여 밝은 회색으로 대체)
const FOX_FIRE_COLORS = [
  0xff2200,  // 빨
  0xff7700,  // 주
  0xffee00,  // 노
  0x00cc44,  // 초
  0x0066ff,  // 파
  0x3300cc,  // 남
  0xaa00ff,  // 보
  0xffffff,  // 흰
  0xcccccc,  // 검(회색 대체)
];

interface FoxFire {
  img: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  baseVx: number;
  speedY: number;
  phase: number;
  freq: number;
  trailTimer: number;
  color: number;
}

/**
 * 구미 (UR) — 구미호의 황금 친화력 / 여우불 9개로 닿은 똥을 금똥으로 변환
 * 수치: GUMI_PARAMS 참조
 */
export class GumiAbility extends BaseAbility {
  private lastGumiScore = 0;
  private foxFires: FoxFire[] = [];

  override onCollectSpecial(type: SpecialPoopType): number {
    return (type === 'gold' || type === 'diamond') ? GUMI_PARAMS.collectBonus : 0;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % GUMI_PARAMS.foxFireInterval === 0 && score > this.lastGumiScore) {
      this.lastGumiScore = score;
      this.summonFoxFires(api);
    }
  }

  private summonFoxFires(api: GameSceneAPI): void {
    const { scene, player } = api;
    const N = GUMI_PARAMS.foxFireCount;
    ensureGlowDot(scene);

    for (let i = 0; i < N; i++) {
      const ringAngle = (i / N) * Math.PI * 2;
      const x = player.x + Math.cos(ringAngle) * 55;
      const y = player.y + Math.sin(ringAngle) * 55;
      const color = FOX_FIRE_COLORS[i];

      const img = scene.add.image(x, y, 'glow_dot')
        .setDepth(200)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setScale(0.45);

      const core = scene.add.graphics().setDepth(202);
      core.fillStyle(0xffffff, 1);
      core.fillCircle(0, 0, 5);
      core.fillStyle(color, 0.85);
      core.fillCircle(0, 0, 3.5);
      core.setPosition(x, y);

      this.foxFires.push({
        img, core, x, y, color,
        baseVx:     Phaser.Math.FloatBetween(-3.5, 3.5),
        speedY:     Phaser.Math.FloatBetween(4.5, 7.5),
        phase:      Phaser.Math.FloatBetween(0, Math.PI * 2),
        freq:       Phaser.Math.FloatBetween(0.07, 0.17),
        trailTimer: 0,
      });
    }
  }

  override onUpdate(api: GameSceneAPI): void {
    if (this.foxFires.length === 0) return;

    const { scene } = api;
    const activePoops = api.poops.getChildren().filter(
      p => (p as Phaser.Physics.Arcade.Sprite).active
    ) as Phaser.Physics.Arcade.Sprite[];

    const remaining: FoxFire[] = [];

    for (const fire of this.foxFires) {
      fire.trailTimer++;
      fire.x += fire.baseVx + Math.sin(fire.phase + fire.trailTimer * fire.freq) * 6;
      fire.y -= fire.speedY;
      fire.img.setPosition(fire.x, fire.y);
      fire.core.setPosition(fire.x, fire.y);

      // 3프레임마다 빛 꼬리 잔상
      if (fire.trailTimer % 3 === 0) {
        const trail = scene.add.image(fire.x, fire.y, 'glow_dot')
          .setDepth(199)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(fire.color)
          .setScale(0.22);
        scene.tweens.add({
          targets: trail,
          scale: 0,
          alpha: 0,
          duration: 200,
          ease: 'Quad.easeOut',
          onComplete: () => trail.destroy(),
        });
      }

      if (fire.y < -30 || fire.x < -30 || fire.x > 430) {
        fire.img.destroy();
        fire.core.destroy();
        continue;
      }

      let hit = false;
      for (const poop of activePoops) {
        const dx = fire.x - poop.x;
        const dy = fire.y - poop.y;
        if (dx * dx + dy * dy < HIT_R * HIT_R) {
          const px = poop.x;
          const py = poop.y;
          (poop as unknown as PoolablePoopBase).recycle();
          api.spawnGoldPoopAt(px, py);
          this.spawnHitFlash(px, py, scene);
          fire.img.destroy();
          fire.core.destroy();
          hit = true;
          break;
        }
      }

      if (!hit) remaining.push(fire);
    }

    this.foxFires = remaining;
  }

  private spawnHitFlash(x: number, y: number, scene: Phaser.Scene): void {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spark = scene.add.image(x, y, 'glow_dot')
        .setDepth(201)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffd700)
        .setScale(0.3);
      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 25,
        y: y + Math.sin(angle) * 25,
        scale: 0,
        alpha: 0,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.foxFires.forEach(f => { f.img.destroy(); f.core.destroy(); });
    this.foxFires = [];
  }
}
