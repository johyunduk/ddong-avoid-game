import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import { SENTINEL_PARAMS } from '../config/abilityParams';

/**
 * 센티넬 (UR) — 보호막
 * ★0: 2개 시작 / 300점마다 충전 / 최대 3  / ★1: 2개 / 250점마다 / 최대 4
 * ★2: 3개 시작 / 200점마다 충전 / 최대 4  / ★3: 3개 / 150점마다 / 최대 5 + 흡수 시 연쇄 전기 3개 추가 제거
 * - UI: 붉은 공이 허리 주변 수평 궤도 공전 + 전기 파지직 (재사용 Graphics)
 */
export class SentinelAbility extends BaseAbility {
  private shieldCount = 0;
  private orbitDroplets: Phaser.GameObjects.Graphics[] = [];
  private orbitAngle = 0;

  // ── 전기 스파크: persistent Graphics 재사용 (동적 생성 없음) ──
  private sparkGfx: Phaser.GameObjects.Graphics | null = null;
  private sparkTween: Phaser.Tweens.Tween | null = null;
  private sparkTimer = 0;

  private static readonly ORBIT_SPEED   = 3.0;
  private static readonly ORBIT_RX      = 26;
  private static readonly ORBIT_RY      = 7;
  private static readonly ORBIT_WAIST_Y = 8;
  private static readonly RED           = 0xff2222;
  private static readonly RED_LIGHT     = 0xff6666;

  override onCreate(api: GameSceneAPI): void {
    this.shieldCount = SENTINEL_PARAMS.startShields;
    this.spawnDroplets(api, SENTINEL_PARAMS.startShields);
    this.sparkGfx = api.scene.add.graphics().setDepth(96).setAlpha(0);
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % SENTINEL_PARAMS.chargeInterval === 0 && this.shieldCount < SENTINEL_PARAMS.maxShields) {
      this.shieldCount++;
      this.playShieldChargeEffect(api);
      this.spawnDroplets(api, 1);
    }
  }

  override onHitPoop(api: GameSceneAPI): boolean {
    if (this.shieldCount > 0) {
      this.shieldCount--;
      this.scatterDroplets(api, 1);
      this.playShieldBreakEffect(api);
      this.zapNearbyPoops(api, 320);
      return true;
    }
    return false;
  }

  override onUpdate(api: GameSceneAPI): void {
    if (this.orbitDroplets.length === 0) return;

    const delta  = api.scene.game.loop.delta / 1000;
    const deltMs = api.scene.game.loop.delta;
    this.orbitAngle += SentinelAbility.ORBIT_SPEED * delta;

    const cx    = api.player.x;
    const cy    = api.player.y + SentinelAbility.ORBIT_WAIST_Y;
    const total = this.orbitDroplets.length;
    const RX    = SentinelAbility.ORBIT_RX;
    const RY    = SentinelAbility.ORBIT_RY;

    this.orbitDroplets.forEach((drop, i) => {
      if (!drop.active) return;
      const angle = this.orbitAngle + (i / total) * Math.PI * 2;
      const sinA  = Math.sin(angle);

      drop.setPosition(cx + Math.cos(angle) * RX, cy + sinA * RY);

      const t = (sinA + 1) / 2;
      drop.setScale(0.55 + 0.55 * t);
      drop.setAlpha(0.35 + 0.65 * t);
      drop.setDepth(sinA > 0 ? 101 : 89);
    });

    // 전기 파지직: 250ms마다 persistent sparkGfx를 clear+redraw
    this.sparkTimer += deltMs;
    if (this.sparkTimer >= 250) {
      this.sparkTimer = 0;
      this.redrawSparks(api);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 리소스 정리 (게임 오버 시 GameScene에서 호출)
  // ─────────────────────────────────────────────────────────────

  override onDestroy(_api: GameSceneAPI): void {
    this.sparkTween?.stop();
    this.sparkGfx?.destroy();
    this.orbitDroplets.forEach(drop => drop.destroy());
  }

  // ─────────────────────────────────────────────────────────────
  // 전기 스파크 (재사용 Graphics)
  // ─────────────────────────────────────────────────────────────

  /** persistent sparkGfx를 clear 후 몸+공 스파크를 새로 그리고 alpha tween */
  private redrawSparks(api: GameSceneAPI): void {
    const g = this.sparkGfx;
    if (!g?.active) return;

    g.clear();
    g.setAlpha(1);
    this.sparkTween?.stop();

    // 몸 주변 스파크 (굵게)
    const ba    = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const br    = Phaser.Math.FloatBetween(18, 34);
    this.drawSparkLine(g, api.player.x + Math.cos(ba) * br, api.player.y + Math.sin(ba) * br * 0.6, 2.5, 10);

    // 공 주변 스파크 (가늘게, 40% 확률 per droplet)
    this.orbitDroplets.forEach(drop => {
      if (drop.active && drop.alpha > 0.5 && Math.random() < 0.4) {
        this.drawSparkLine(g, drop.x, drop.y, 1, 7);
      }
    });

    this.sparkTween = api.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
    });
  }

  /** 전달받은 Graphics에 지그재그 라인을 직접 그림 (새 객체 생성 없음) */
  private drawSparkLine(g: Phaser.GameObjects.Graphics, ox: number, oy: number, thickness: number, segLen: number): void {
    const color = Math.random() < 0.6 ? 0xff3333 : 0xff7744;
    g.lineStyle(thickness, color, 1);
    g.beginPath();
    let px = ox + Phaser.Math.Between(-5, 5);
    let py = oy + Phaser.Math.Between(-5, 5);
    g.moveTo(px, py);
    const segs = Phaser.Math.Between(2, 4);
    for (let j = 0; j < segs; j++) {
      px += Phaser.Math.Between(-segLen, segLen);
      py += Phaser.Math.Between(-segLen, segLen);
      g.lineTo(px, py);
    }
    g.strokePath();
  }

  // ─────────────────────────────────────────────────────────────
  // 방울 관리
  // ─────────────────────────────────────────────────────────────

  private spawnDroplets(api: GameSceneAPI, count: number): void {
    const scene = api.scene;
    for (let i = 0; i < count; i++) {
      const g = scene.add.graphics().setDepth(95);
      this.drawDroplet(g);
      g.setPosition(api.player.x, api.player.y + SentinelAbility.ORBIT_WAIST_Y);
      g.setAlpha(0);
      this.orbitDroplets.push(g);
      scene.tweens.add({ targets: g, alpha: 1, scaleX: 1, scaleY: 1, duration: 350, delay: i * 50, ease: 'Back.easeOut' });
    }
  }

  private scatterDroplets(api: GameSceneAPI, count: number): void {
    const scene   = api.scene;
    const removed = this.orbitDroplets.splice(0, count);
    removed.forEach(drop => {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist  = Phaser.Math.FloatBetween(30, 55);
      scene.tweens.add({
        targets: drop,
        x: drop.x + Math.cos(angle) * dist,
        y: drop.y + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: 120, ease: 'Quad.easeIn',
        onComplete: () => drop.destroy(),
      });
    });
  }

  private drawDroplet(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    g.fillStyle(SentinelAbility.RED, 0.22);
    g.fillCircle(0, 0, 15);
    g.fillStyle(SentinelAbility.RED, 0.4);
    g.fillCircle(0, 0, 10);
    g.fillStyle(SentinelAbility.RED, 0.95);
    g.fillCircle(0, 0, 7);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(-2, -2.5, 2.5);
  }

  // ─────────────────────────────────────────────────────────────
  // 파장 범위 내 똥 제거
  // ─────────────────────────────────────────────────────────────

  private zapNearbyPoops(api: GameSceneAPI, radius: number): void {
    const cx = api.player.x;
    const cy = api.player.y;
    const r2 = radius * radius;

    const targets = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active && (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r2);

    if (targets.length === 0) return;

    // 위치 저장 후 일괄 제거
    const positions = targets.map(p => ({ x: p.x, y: p.y }));
    targets.forEach(p => p.destroy());

    // 단일 Graphics에 모든 위치 그리기 → 3회 redraw로 지글 효과
    const zapG = api.scene.add.graphics().setDepth(155);
    let frame   = 0;

    const drawZapFrame = () => {
      zapG.clear();
      positions.forEach(pos => {
        zapG.fillStyle(SentinelAbility.RED, 0.55 - frame * 0.12);
        zapG.fillCircle(pos.x, pos.y, 10);
        const sparks = Phaser.Math.Between(2, 3);
        for (let i = 0; i < sparks; i++) {
          this.drawSparkLine(
            zapG,
            pos.x + Phaser.Math.Between(-8, 8),
            pos.y + Phaser.Math.Between(-8, 8),
            Phaser.Math.FloatBetween(1.5, 2.5),
            10
          );
        }
      });
      frame++;
    };

    drawZapFrame();

    // 60ms, 120ms 후 redraw, 200ms 후 fade+destroy
    [60, 120].forEach(delay => {
      api.scene.time.delayedCall(delay, () => {
        if (!api.scene.sys.isActive() || !zapG.active) return;
        drawZapFrame();
      });
    });

    api.scene.time.delayedCall(180, () => {
      if (!api.scene.sys.isActive() || !zapG.active) return;
      api.scene.tweens.add({
        targets: zapG, alpha: 0, duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => zapG.destroy(),
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 이펙트
  // ─────────────────────────────────────────────────────────────

  private playShieldBreakEffect(api: GameSceneAPI): void {
    const scene = api.scene;
    const cx    = api.player.x;
    const cy    = api.player.y;

    scene.cameras.main.flash(200, 255, 40, 40, true);

    [{ delay: 0, maxScale: 4.3 }, { delay: 80, maxScale: 3.4 }].forEach(({ delay, maxScale }) => {
      const ring = scene.add.graphics().setDepth(150);
      ring.lineStyle(2.5, SentinelAbility.RED_LIGHT, 0.9);
      ring.strokeEllipse(0, 0, 74, 98);
      ring.setPosition(cx, cy);
      scene.tweens.add({
        targets: ring, scaleX: maxScale, scaleY: maxScale, alpha: 0,
        duration: 500, delay, ease: 'Quad.easeOut',
        onComplete: () => ring.destroy(),
      });
    });

    const fill = scene.add.graphics().setDepth(149);
    fill.fillStyle(SentinelAbility.RED, 0.28);
    fill.fillEllipse(0, 0, 74, 98);
    fill.setPosition(cx, cy);
    scene.tweens.add({
      targets: fill, alpha: 0, duration: 180, ease: 'Quad.easeOut',
      onComplete: () => fill.destroy(),
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const speed = Phaser.Math.FloatBetween(40, 95);
      const w = Phaser.Math.Between(5, 12);
      const h = Phaser.Math.Between(2, 5);
      const shard = scene.add.graphics().setDepth(152);
      shard.fillStyle(SentinelAbility.RED, 1);
      shard.fillRect(-w / 2, -h / 2, w, h);
      shard.setPosition(cx, cy);
      shard.setRotation(angle);
      scene.tweens.add({
        targets: shard,
        x: cx + Math.cos(angle) * speed, y: cy + Math.sin(angle) * speed,
        alpha: 0, rotation: angle + Phaser.Math.FloatBetween(-1, 1),
        duration: Phaser.Math.Between(270, 440), ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  private playShieldChargeEffect(api: GameSceneAPI): void {
    const scene = api.scene;
    const cx    = api.player.x;
    const cy    = api.player.y;

    const ring = scene.add.graphics().setDepth(150);
    ring.lineStyle(2, SentinelAbility.RED_LIGHT, 1);
    ring.strokeEllipse(0, 0, 74, 98);
    ring.setPosition(cx, cy);
    ring.setScale(1.9);
    ring.setAlpha(0);

    scene.tweens.add({
      targets: ring, scaleX: 1, scaleY: 1, alpha: 1,
      duration: 210, ease: 'Quad.easeIn',
      onComplete: () => {
        scene.tweens.add({ targets: ring, alpha: 0, duration: 160, onComplete: () => ring.destroy() });
      },
    });

    for (let i = 0; i < 5; i++) {
      const ox  = Phaser.Math.FloatBetween(-22, 22);
      const dot = scene.add.graphics().setDepth(151);
      dot.fillStyle(SentinelAbility.RED_LIGHT, 1);
      dot.fillCircle(0, 0, Phaser.Math.Between(2, 4));
      dot.setPosition(cx + ox, cy + 18);
      scene.tweens.add({
        targets: dot, y: cy - Phaser.Math.Between(28, 56), alpha: 0,
        duration: Phaser.Math.Between(340, 530), delay: i * 40, ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }
}
