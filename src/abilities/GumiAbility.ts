import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI, SpecialPoopType } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { ensureGlowDot } from '../utils/glowDot';
import { GUMI_PARAMS } from '../config/abilityParams';

const HIT_R = 18;

// 꼬리가 시작되는 Y 오프셋 (플레이어 중심 기준, 양수=아래=발 쪽)
const TAIL_ORIGIN_Y = 10;
const SWAY_AMP      = 0.28; // 흔들림 진폭 (radians)

// 꼬리 체인: 세그먼트 수, 간격, 스케일 (지렁이 파동)
const NUM_SEGS   = 14;   // 꼬리 세그먼트 수 (14 × 5px = 70px)
const STEP_DIST  = 5;    // 세그먼트 간 거리 (px)
const PHASE_STEP = 0.35; // 세그먼트마다 위상 어긋남
// 타원형: base·tip 가늘고 5~6번째 가장 두꺼움
const SEG_SCALES = [0.10, 0.20, 0.30, 0.37, 0.41, 0.42, 0.41, 0.36, 0.30, 0.22, 0.15, 0.10, 0.06, 0.03];

// 꼬리 depth (플레이어 depth 5보다 낮아야 몸통 뒤에 숨음)
const TAIL_DEPTH = 3;

// 여우불 9색
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

// 꼬리 등장 순서: 1번째=흰, 2~8번째=빨주노초파남보, 9번째=검
const TAIL_COLORS = [
  0xffffff,  // 1번째: 흰
  0xff2200,  // 2번째: 빨
  0xff7700,  // 3번째: 주
  0xffee00,  // 4번째: 노
  0x00cc44,  // 5번째: 초
  0x0066ff,  // 6번째: 파
  0x3300cc,  // 7번째: 남
  0xaa00ff,  // 8번째: 보
  0xcccccc,  // 9번째: 검
];

// 꼬리 배치 각도: TAIL_COLORS 생성 순서에 따른 시각적 위치 고정
// 최종 시각 배치(왼→오): 빨(190°) 주(210°) 노(230°) 초(250°) 파(270°) 남(290°) 보(310°) 흰(330°) 검(350°)
// 흰(1번째 생성) → 330°,  빨(2번째) → 190°,  주(3번째) → 210°, ...
const TAIL_ANGLE_ORDER = [330, 190, 210, 230, 250, 270, 290, 310, 350]
  .map(deg => deg * Math.PI / 180);

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

interface TailSegImg {
  img: Phaser.GameObjects.Image;
  baseScale: number;
}

interface TailObj {
  segs: TailSegImg[];
  baseAngle: number;
  swayPhase: number;
  swayFreq: number;
  color: number;
}

/**
 * 구미 (UR) — 꼬리 9개 무적(기본) / 여우불 금똥 변환(특수)
 * 수치: GUMI_PARAMS 참조
 */
export class GumiAbility extends BaseAbility {
  // ── 여우불 (특수 능력) ─────────────────────────────────────────────
  private lastGumiScore = 0;
  private foxFires: FoxFire[] = [];

  // ── 꼬리 스택 (기본 효과) ─────────────────────────────────────────
  private tailCount = 0;
  private lastTailScore = 0;
  private invincibleActive = false;
  private invincibleElapsed = 0;
  private tails: TailObj[] = [];

  // ── 꼬리별 누적 효과 ──────────────────────────────────────────────
  // index % 3 === 0 (1,4,7번): 특수 똥 수집 +5점
  // index % 3 === 1 (2,5,8번): 이동 속도 +5px/s (Player에 직접 적용)
  // index % 3 === 2 (3,6,9번): 일반 똥 소환 -1개 (영구)
  private specialBonus = 0;
  private speedBonus = 0;
  private spawnReduction = 0;

  // ── 디버그 텍스트 (임시) ──────────────────────────────────────────
  private debugText: Phaser.GameObjects.Text | null = null;

  // ── 플레이어 depth 설정 (꼬리가 몸통 뒤에 렌더링되도록) ──────────
  override onCreate(api: GameSceneAPI): void {
    // 씬 재시작 시 onDestroy가 호출되지 않으므로 stale 참조를 여기서 정리
    this.tails = [];
    this.tailCount = 0;
    this.specialBonus = 0;
    this.speedBonus = 0;
    this.spawnReduction = 0;
    this.debugText = null;

    api.player.setDepth(5);
    this.debugText = api.scene.add.text(8, 60, '', {
      fontSize: '11px',
      color: '#ffffaa',
      stroke: '#000000',
      strokeThickness: 3,
      lineSpacing: 2,
    }).setDepth(500).setAlpha(0.85).setVisible(false);
    this._updateDebugText();
  }

  private _updateDebugText(): void {
    if (!this.debugText) return;
    this.debugText.setText([
      `🦊 꼬리 ${this.tailCount}/${GUMI_PARAMS.maxTails}`,
      `특수+${this.specialBonus}pt  속도+${this.speedBonus}  소환-${this.spawnReduction}`,
    ]);
  }

  // ── 꼬리 추가 ─────────────────────────────────────────────────────
  private _addTail(api: GameSceneAPI): void {
    const { scene, player } = api;
    ensureGlowDot(scene);

    const i         = this.tailCount;
    const color     = TAIL_COLORS[i] ?? 0xffffff;
    const baseAngle = TAIL_ANGLE_ORDER[i] ?? (270 * Math.PI / 180);
    const originX   = player.x;
    const originY   = player.y + TAIL_ORIGIN_Y;

    const segs: TailSegImg[] = [];
    for (let s = 0; s < NUM_SEGS; s++) {
      const img = scene.add.image(
        originX + Math.cos(baseAngle) * (STEP_DIST * (s + 1)),
        originY + Math.sin(baseAngle) * (STEP_DIST * (s + 1)),
        'glow_dot',
      )
        .setDepth(TAIL_DEPTH)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(color)
        .setScale(0)
        .setAlpha(0.92);
      segs.push({ img, baseScale: SEG_SCALES[s] ?? 0.08 });
    }

    // 등장 애니메이션 (base → tip 순차)
    segs.forEach((si, idx) => {
      scene.tweens.add({
        targets: si.img,
        scale: si.baseScale,
        delay: idx * 40,
        duration: 300,
        ease: 'Back.easeOut',
      });
    });

    this.tails.push({
      segs,
      baseAngle,
      swayPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      swayFreq:  Phaser.Math.FloatBetween(1.4, 2.8),
      color,
    });

    if (i % 3 === 0) {
      this.specialBonus += GUMI_PARAMS.tailSpecialBonus;
    } else if (i % 3 === 1) {
      this.speedBonus += GUMI_PARAMS.tailSpeedBonus;
      player.addPermanentSpeed(GUMI_PARAMS.tailSpeedBonus);
    } else {
      this.spawnReduction += GUMI_PARAMS.tailSpawnReduction;
    }

    this.tailCount++;
    this._updateDebugText();

    if (this.tailCount >= GUMI_PARAMS.maxTails) {
      this._triggerInvincibility(api);
    }
  }

  // ── 꼬리 지렁이 파동 업데이트 (매 프레임) ────────────────────────
  private _updateTailPositions(api: GameSceneAPI): void {
    if (this.tails.length === 0) return;
    const { player, scene } = api;
    const time    = scene.time.now * 0.001;
    const originX = player.x;
    const originY = player.y + TAIL_ORIGIN_Y;

    for (const tail of this.tails) {
      let px = originX;
      let py = originY;

      for (let s = 0; s < tail.segs.length; s++) {
        const si = tail.segs[s];
        if (!si.img.active) continue;

        // 뿌리는 진폭 0, 끝으로 갈수록 진폭 증가 (지렁이 파동)
        const amp   = SWAY_AMP * (s / (NUM_SEGS - 1));
        const sway  = Math.sin(time * tail.swayFreq + tail.swayPhase + s * PHASE_STEP) * amp;
        const angle = tail.baseAngle + sway;

        px += Math.cos(angle) * STEP_DIST;
        py += Math.sin(angle) * STEP_DIST;
        si.img.setPosition(px, py);
      }
    }
  }

  // ── 점수 마일스톤 ─────────────────────────────────────────────────
  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    // 여우불 (특수)
    if (score % GUMI_PARAMS.foxFireInterval === 0 && score > this.lastGumiScore) {
      this.lastGumiScore = score;
      this.summonFoxFires(api);
    }
    // 꼬리 추가 (기본) — 무적 중 누적 금지
    if (score % GUMI_PARAMS.tailInterval === 0 && score > this.lastTailScore && !this.invincibleActive) {
      this.lastTailScore = score;
      this._addTail(api);
    }
  }

  // ── 무적 발동 ─────────────────────────────────────────────────────
  private _triggerInvincibility(api: GameSceneAPI): void {
    const { player, scene } = api;
    this.invincibleActive  = true;
    this.invincibleElapsed = 0;

    // 꼬리 확대
    this.tails.forEach(t => {
      t.segs.forEach(si => {
        scene.tweens.add({
          targets: si.img,
          scale: si.baseScale * 1.5,
          duration: 320,
          ease: 'Back.easeOut',
        });
      });
    });

    // 9색 버스트
    ensureGlowDot(scene);
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const spark = scene.add.image(player.x, player.y, 'glow_dot')
        .setDepth(210)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(FOX_FIRE_COLORS[i])
        .setScale(0.6);
      scene.tweens.add({
        targets: spark,
        x: player.x + Math.cos(angle) * 65,
        y: player.y + Math.sin(angle) * 65,
        scale: 0, alpha: 0, duration: 520,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // ── 무적 카운트다운 ───────────────────────────────────────────────
  private _updateInvincibility(api: GameSceneAPI): void {
    this.invincibleElapsed += api.scene.game.loop.delta;
    if (this.invincibleElapsed >= GUMI_PARAMS.invincibleDuration) {
      this._endInvincibility(api);
    }
  }

  // ── 무적 종료 ─────────────────────────────────────────────────────
  private _endInvincibility(api: GameSceneAPI): void {
    const { player, scene } = api;

    this.invincibleActive = false;
    player.setAlpha(1);

    // 꼬리 사라짐
    this.tails.forEach(t => {
      t.segs.forEach(si => {
        scene.tweens.add({
          targets: si.img, alpha: 0, scale: 0,
          duration: 380, ease: 'Quad.easeIn',
          onComplete: () => si.img.destroy(),
        });
      });
    });
    this.tails       = [];
    this.tailCount   = 0;
    this.lastTailScore = api.score; // 무적 중 지나친 마일스톤 역추적 방지

    // 꼬리별 누적 효과 초기화 — speedBonus는 원복 후 초기화
    const speedToRemove = this.speedBonus;
    this.specialBonus   = 0;
    this.speedBonus     = 0;
    this.spawnReduction = 0;
    player.addPermanentSpeed(-speedToRemove);
    this._updateDebugText();

    this._spawnBreakEffect(api);
    this._zapAllPoops(api);
  }

  // ── 무적 종료 파열 이펙트 (센티넬 방어막 파열 스타일, 황금색) ────
  private _spawnBreakEffect(api: GameSceneAPI): void {
    const { player, scene } = api;
    const cx = player.x;
    const cy = player.y;

    scene.cameras.main.flash(200, 255, 200, 50, true);

    // 확산 링 2겹
    [{ delay: 0, maxScale: 4.3 }, { delay: 80, maxScale: 3.4 }].forEach(({ delay, maxScale }) => {
      const ring = scene.add.graphics().setDepth(150);
      ring.lineStyle(2.5, 0xffcc44, 0.9);
      ring.strokeEllipse(0, 0, 74, 98);
      ring.setPosition(cx, cy);
      scene.tweens.add({
        targets: ring, scaleX: maxScale, scaleY: maxScale, alpha: 0,
        duration: 500, delay, ease: 'Quad.easeOut',
        onComplete: () => ring.destroy(),
      });
    });

    // 내부 섬광
    const fill = scene.add.graphics().setDepth(149);
    fill.fillStyle(0xffcc44, 0.25);
    fill.fillEllipse(0, 0, 74, 98);
    fill.setPosition(cx, cy);
    scene.tweens.add({
      targets: fill, alpha: 0, duration: 180, ease: 'Quad.easeOut',
      onComplete: () => fill.destroy(),
    });

    // 황금 파편 8개
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const speed = Phaser.Math.FloatBetween(40, 95);
      const w     = Phaser.Math.Between(5, 12);
      const h     = Phaser.Math.Between(2, 5);
      const shard = scene.add.graphics().setDepth(152);
      shard.fillStyle(0xffcc44, 1);
      shard.fillRect(-w / 2, -h / 2, w, h);
      shard.setPosition(cx, cy);
      shard.setRotation(angle);
      scene.tweens.add({
        targets: shard,
        x: cx + Math.cos(angle) * speed,
        y: cy + Math.sin(angle) * speed,
        alpha: 0, rotation: angle + Phaser.Math.FloatBetween(-1, 1),
        duration: Phaser.Math.Between(270, 440), ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  // ── 반경 내 똥 전부 제거 ──────────────────────────────────────────
  private _zapAllPoops(api: GameSceneAPI): void {
    const { player, poops, scene } = api;
    const r  = GUMI_PARAMS.zapRadius;
    const r2 = r * r;

    (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active && (p.x - player.x) ** 2 + (p.y - player.y) ** 2 <= r2)
      .forEach(p => (p as unknown as PoolablePoopBase).recycle());

    ensureGlowDot(scene);

    // 황금 확산 링 2겹
    for (let i = 0; i < 2; i++) {
      const ring = scene.add.graphics().setDepth(212);
      ring.lineStyle(3 - i, 0xffcc44, 0.9 - i * 0.3);
      ring.strokeCircle(0, 0, 20);
      ring.setPosition(player.x, player.y);
      scene.tweens.add({
        targets: ring, scaleX: r / 20, scaleY: r / 20, alpha: 0,
        delay: i * 80, duration: 560, ease: 'Quad.easeOut',
        onComplete: () => ring.destroy(),
      });
    }

    // 중앙 섬광
    const flash = scene.add.image(player.x, player.y, 'glow_dot')
      .setDepth(213)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffee88)
      .setScale(1.8);
    scene.tweens.add({
      targets: flash, scale: 0, alpha: 0, duration: 460,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  // ── 특수 똥 수집 보너스 (1,4,7번 꼬리) ──────────────────────────
  override onCollectSpecial(_type: SpecialPoopType): number {
    return this.specialBonus;
  }

  // ── 일반 똥 소환 감소 (3,6,9번 꼬리) — 영구 감소이므로 리셋 없음 ──
  override getSpawnCountReduction(): number {
    return this.spawnReduction;
  }

  // ── 피격: 무적 중이면 게임오버 방지 ──────────────────────────────
  override onHitPoop(_api: GameSceneAPI): boolean {
    return this.invincibleActive;
  }

  // ── 여우불 소환 ───────────────────────────────────────────────────
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

  // ── 매 프레임 ─────────────────────────────────────────────────────
  override onUpdate(api: GameSceneAPI): void {
    this._updateTailPositions(api);
    if (this.invincibleActive) this._updateInvincibility(api);

    if (this.foxFires.length === 0) return;

    const { scene } = api;
    const activePoops = api.poops.getChildren().filter(
      p => (p as Phaser.Physics.Arcade.Sprite).active,
    ) as Phaser.Physics.Arcade.Sprite[];

    const remaining: FoxFire[] = [];

    for (const fire of this.foxFires) {
      fire.trailTimer++;
      fire.x += fire.baseVx + Math.sin(fire.phase + fire.trailTimer * fire.freq) * 6;
      fire.y -= fire.speedY;
      fire.img.setPosition(fire.x, fire.y);
      fire.core.setPosition(fire.x, fire.y);

      if (fire.trailTimer % 3 === 0) {
        const trail = scene.add.image(fire.x, fire.y, 'glow_dot')
          .setDepth(199)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(fire.color)
          .setScale(0.22);
        scene.tweens.add({
          targets: trail, scale: 0, alpha: 0, duration: 200,
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
        scale: 0, alpha: 0, duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  override onDestroy(api: GameSceneAPI): void {
    if (this.invincibleActive) {
      api.player.setAlpha(1);
    }
    api.player.setDepth(0); // player depth 원복
    this.foxFires.forEach(f => { f.img.destroy(); f.core.destroy(); });
    this.foxFires = [];
    this.tails.forEach(t => t.segs.forEach(si => si.img.destroy()));
    this.tails = [];
    this.debugText?.destroy();
    this.debugText = null;
  }
}
