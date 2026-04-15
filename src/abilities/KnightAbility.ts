import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { KNIGHT_PARAMS } from '../config/abilityParams';
import { ensureGlowDot } from '../utils/glowDot';

const R_OUT  = 26;
const R_IN   = 20;
const OFFSET = 12;
const STEPS  = 30;

interface WaveCfg { scale: number; speed: number; amp: number; phase: number; }

// 형상이 고정이므로 모듈 초기화 시 한 번만 계산
const BASE_PTS: Phaser.Geom.Point[] = (() => {
  const tipY = (R_OUT * R_OUT - R_IN * R_IN + OFFSET * OFFSET) / (2 * OFFSET);
  const tipX = Math.sqrt(Math.max(0, R_OUT * R_OUT - tipY * tipY));
  const outerStart = Math.atan2(tipY, tipX);
  const outerSpan  = -(2 * Math.PI - (Math.atan2(tipY, -tipX) - outerStart));
  const innerStart = Math.atan2(tipY - OFFSET, -tipX);
  const innerSpan  = 2 * Math.PI - (innerStart - Math.atan2(tipY - OFFSET, tipX));
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const a = outerStart + outerSpan * (i / STEPS);
    pts.push(new Phaser.Geom.Point(Math.cos(a) * R_OUT, Math.sin(a) * R_OUT));
  }
  for (let i = 0; i <= STEPS; i++) {
    const a = innerStart + innerSpan * (i / STEPS);
    pts.push(new Phaser.Geom.Point(Math.cos(a) * R_IN, Math.sin(a) * R_IN + OFFSET));
  }
  return pts;
})();

// 프레임당 재사용할 Point 버퍼 — new Point() 할당 없이 in-place 덮어쓰기
// JS는 단일 스레드 + tween onUpdate 순차 실행이므로 레이어별 버퍼 1개로 충분
const _bufs = {
  outer: BASE_PTS.map(() => new Phaser.Geom.Point()),
  mid:   BASE_PTS.map(() => new Phaser.Geom.Point()),
  body:  BASE_PTS.map(() => new Phaser.Geom.Point()),
};

export class KnightAbility extends BaseAbility {
  private lastBeamScore = 0;

  // onDestroy 시 정리할 리소스 추적
  private activeTimers: Phaser.Time.TimerEvent[]       = [];
  private activeGraphics: Phaser.GameObjects.Graphics[] = [];

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % KNIGHT_PARAMS.beamInterval === 0 && score > this.lastBeamScore) {
      this.lastBeamScore = score;
      [-30, 0, 30].forEach(deg => this.fireSingleCrescent(api, deg));
    }
  }

  override onDestroy(api: GameSceneAPI): void {
    this.activeTimers.forEach(t => t.destroy());
    this.activeTimers = [];
    this.activeGraphics.forEach(g => {
      api.scene.tweens.killTweensOf(g);
      if (g.active) g.destroy();
    });
    this.activeGraphics = [];
  }

  private wavyPoints(buf: Phaser.Geom.Point[], time: number, cfg: WaveCfg): Phaser.Geom.Point[] {
    BASE_PTS.forEach((p, i) => {
      const r = Math.hypot(p.x, p.y);
      const wave = Math.sin(time * cfg.speed + i * 0.32 + cfg.phase) * cfg.amp;
      const s = r > 0.1 ? (r * cfg.scale + wave) / r : cfg.scale;
      buf[i].x = p.x * s;
      buf[i].y = p.y * s;
    });
    return buf;
  }

  private fireSingleCrescent(api: GameSceneAPI, rotationDeg: number): void {
    const scene  = api.scene;
    const px     = api.player.x;
    const py     = api.player.y - 20;
    const rotRad = rotationDeg * (Math.PI / 180);
    const dx     = Math.sin(rotRad);
    const dy     = -Math.cos(rotRad);
    const TRAVEL = py + 80;
    const duration = (TRAVEL / 520) * 1000;

    const makeGfx = (depth: number): Phaser.GameObjects.Graphics => {
      const g = scene.add.graphics().setDepth(depth).setPosition(px, py).setRotation(rotRad);
      this.activeGraphics.push(g);
      return g;
    };

    const outerGlow = makeGfx(118);
    const midGlow   = makeGfx(119);
    const body      = makeGfx(120);
    const edge      = makeGfx(121);
    const all       = [outerGlow, midGlow, body, edge];

    const particleTimer = scene.time.addEvent({
      delay: 45,
      loop: true,
      callback: () => {
        if (!body.active) return;
        const bp = BASE_PTS[Phaser.Math.Between(0, BASE_PTS.length - 1)];
        const cos = Math.cos(rotRad), sin = Math.sin(rotRad);
        const wx = body.x + bp.x * cos - bp.y * sin;
        const wy = body.y + bp.x * sin + bp.y * cos;
        this.spawnSpark(scene, wx, wy, {
          color: Phaser.Math.Between(0, 1) ? 0xff9900 : 0xffcc44,
          radius: Phaser.Math.FloatBetween(1, 3),
          tx: wx + Phaser.Math.FloatBetween(-12, 12),
          ty: wy + Phaser.Math.FloatBetween(-18, 4),
          duration: Phaser.Math.Between(180, 320),
          endScale: 0.2,
        });
      },
    });
    this.activeTimers.push(particleTimer);

    const hitSet = new Set<Phaser.Physics.Arcade.Sprite>();
    const HIT_RADIUS = R_OUT + 10;

    scene.tweens.add({
      targets: all,
      x: `+=${dx * TRAVEL}`,
      y: `+=${dy * TRAVEL}`,
      duration,
      ease: 'Linear',
      onUpdate: () => {
        const t  = scene.time.now;
        outerGlow.clear();
        outerGlow.fillStyle(0xff6600, 0.12 + Math.sin(t * 0.011) * 0.07);
        outerGlow.fillPoints(this.wavyPoints(_bufs.outer, t, { scale: 1.65, speed: 0.007, amp: 5.5, phase: 0 }), true);

        midGlow.clear();
        midGlow.fillStyle(0xff8800, 0.28 + Math.sin(t * 0.014 + 1.2) * 0.1);
        midGlow.fillPoints(this.wavyPoints(_bufs.mid, t, { scale: 1.25, speed: 0.01, amp: 3.5, phase: 1.0 }), true);

        const bodyPts = this.wavyPoints(_bufs.body, t, { scale: 1.0, speed: 0.013, amp: 2.5, phase: 2.1 });

        body.clear();
        body.fillStyle(0xffaa44, 0.92);
        body.fillPoints(bodyPts, true);

        // body와 동일 파형 → 캐시된 bodyPts 재사용
        edge.clear();
        edge.lineStyle(2, 0xffeecc, 0.9);
        edge.strokePoints(bodyPts, true);

        const cx = body.x, cy = body.y;
        (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).forEach(sp => {
          if (!sp.active || hitSet.has(sp)) return;
          if (Phaser.Math.Distance.Between(cx, cy, sp.x, sp.y) <= HIT_RADIUS) {
            hitSet.add(sp);
            for (let i = 0; i < 7; i++) {
              const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
              const dist  = Phaser.Math.Between(10, 28);
              this.spawnSpark(scene, sp.x, sp.y, {
                color: 0xffaa55,
                radius: Phaser.Math.Between(2, 5),
                tx: sp.x + Math.cos(angle) * dist,
                ty: sp.y + Math.sin(angle) * dist - 8,
                duration: Phaser.Math.Between(180, 380),
              });
            }
            (sp as PoolablePoopBase).recycle();
            api.addAbilityBonus(KNIGHT_PARAMS.beamKillBonus);
          }
        });
      },
      onComplete: () => {
        particleTimer.destroy();
        this.activeTimers = this.activeTimers.filter(t => t !== particleTimer);
        all.forEach(g => {
          this.activeGraphics = this.activeGraphics.filter(ag => ag !== g);
          g.destroy();
        });
      },
    });
  }

  private spawnSpark(
    scene: Phaser.Scene,
    x: number, y: number,
    opts: { color: number; radius: number; tx: number; ty: number; duration: number; endScale?: number },
  ): void {
    ensureGlowDot(scene);
    const initScale = opts.radius / 10;
    const img = scene.add.image(x, y, 'glow_dot')
      .setDepth(122)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(opts.color)
      .setScale(initScale);

    const tween: Phaser.Types.Tweens.TweenBuilderConfig = {
      targets: img, x: opts.tx, y: opts.ty, alpha: 0,
      duration: opts.duration, ease: 'Quad.easeOut',
      onComplete: () => img.destroy(),
    };
    if (opts.endScale !== undefined) {
      (tween as Record<string, unknown>).scale = opts.endScale * initScale;
    }
    scene.tweens.add(tween);
  }
}
