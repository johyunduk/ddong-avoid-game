import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI, SpecialPoopType } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { ensureGlowDot } from '../utils/glowDot';
import { GUMI_PARAMS } from '../config/abilityParams';
import { burst, fxSprite, playFx } from '../utils/vfx';

const HIT_R = 32;

// 꼬리가 시작되는 Y 오프셋 (플레이어 중심 기준, 양수=아래=발 쪽)
const TAIL_ORIGIN_Y = 10;
const SWAY_AMP      = 0.50; // 흔들림 진폭 (radians)

// ── 꼬리 ────────────────────────────────────────────────────────────────
// 원본은 꼬리 하나를 발광 점 14개로 이었다 — 9개면 **가산 스프라이트 126장을
// 매 프레임 재배치**하는 것이라 게임에서 가장 무거운 상시 비용이었다.
// 실루엣("밑동 가늘고 중간이 가장 두껍고 끝이 뾰족")은 한 장에 구울 수 있다.
const TAIL_TEXTURE = 'fx_tail';
const TAIL_LEN     = 70;  // 표시 길이(px) — 원본 14 × 5px 과 같다
const TAIL_WIDTH   = 26;  // 표시 폭(px)
const TRAIL_MAX  = 0.45;  // 플레이어 이동 방향 트레일링 최대 각도 (radians)
/** 꼬리는 게임이 끝날 때까지 산다. vfx 보험 타이머는 그보다 길게 */
const PERSIST_MS = 20 * 60 * 1000;


// 꼬리 depth (플레이어 depth 5보다 낮아야 몸통 뒤에 숨음)
const TAIL_DEPTH = 3;

// 오라 설정 (무적 중)
const AURA_PARTICLE_COUNT = 9;   // 공전 파티클 수 (꼬리 색상과 1:1 대응)
const AURA_BURN_RADIUS    = 50;  // 소각 판정 반경 (px)
const AURA_COLORS = [0xff4400, 0xff8800, 0xffcc00, 0xff2200, 0xffaa00, 0xff6600, 0xffee44, 0xff3300, 0xffbb00];

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

// 꼬리 등장 순서: 빨→보→주→남→노→파→초→흰→검
const TAIL_COLORS = [
  0xff2200,  // 1번째: 빨
  0xaa00ff,  // 2번째: 보
  0xff7700,  // 3번째: 주
  0x3300cc,  // 4번째: 남
  0xffee00,  // 5번째: 노
  0x0066ff,  // 6번째: 파
  0x00cc44,  // 7번째: 초
  0xffffff,  // 8번째: 흰
  0xcccccc,  // 9번째: 검
];

// 꼬리 배치 각도: 생성 순서에 대응하는 시각적 위치
// 최종 시각 배치(왼→오): 흰(190°) 빨(210°) 주(230°) 노(250°) 초(270°) 파(290°) 남(310°) 보(330°) 검(350°)
const TAIL_ANGLE_ORDER = [210, 330, 230, 310, 250, 290, 270, 190, 350]
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

interface TailObj {
  img: Phaser.GameObjects.Image;
  baseAngle: number;
  swayPhase: number;
  swayFreq: number;
  color: number;
}

interface AuraParticle {
  img: Phaser.GameObjects.Image;
  angle: number;   // 현재 공전 각도 (radians)
  speed: number;   // 공전 속도 (rad/s, 음수=반시계)
  radius: number;  // 공전 반경 (px)
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

  // ── 무적 오라 ─────────────────────────────────────────────────────
  private auraParticles: AuraParticle[] = [];

  // ── 플레이어 depth 설정 (꼬리가 몸통 뒤에 렌더링되도록) ──────────
  override onCreate(api: GameSceneAPI): void {
    // 씬 재시작 시 onDestroy가 호출되지 않으므로 stale 참조를 여기서 정리
    this.tails = [];
    this.tailCount = 0;
    this.specialBonus = 0;
    this.speedBonus = 0;
    this.spawnReduction = 0;

    api.player.setDepth(5);
  }

  // ── 꼬리 추가 ─────────────────────────────────────────────────────
  private _addTail(api: GameSceneAPI): void {
    const { scene, player } = api;
    ensureGlowDot(scene);

    const i         = this.tailCount;
    const color     = TAIL_COLORS[i] ?? 0xffffff;
    const baseAngle = TAIL_ANGLE_ORDER[i] ?? (270 * Math.PI / 180);

    // 흰색(0xffffff)은 ADD 블렌드 시 RGB 3채널 전부 최대라 실제 크기보다 넓어 보임
    // → alpha를 낮춰 다른 색상과 시각적 균형 맞춤
    const alpha = color === 0xffffff ? 0.52 : 0.92;

    // 먼저 생성된 꼬리(빨강 등)가 나중 꼬리(흰색 등) 위에 렌더링되도록
    // index가 낮을수록(앞쪽 꼬리) depth를 높게 설정
    const segDepth = TAIL_DEPTH + (GUMI_PARAMS.maxTails - i) * 0.1;

    const sx = TAIL_LEN / 512;
    const sy = TAIL_WIDTH / 192;

    // 원점을 밑동에 둔다 — 여기가 회전축이자 몸에 붙는 지점이다
    const img = fxSprite(scene, player.x, player.y + TAIL_ORIGIN_Y, TAIL_TEXTURE, {
      rotation: baseAngle,
      scale: [sx * 0.05, sy],
      origin: [0, 0.5],
      tint: color,
      alpha,
      depth: segDepth,
      blend: 'add',
      // 블룸 레이어에 올리지 않는다 — depth 를 잃어 캐릭터 앞으로 튀어나오고,
      // 9개가 상시 살아 있으면 전체 화면 블룸 패스가 영구히 켜진다
      bloom: false,
      lifeMs: PERSIST_MS,
      slot: 'gumi_tail',
      maxConcurrent: 12,
    });
    if (img) {
      // 밑동에서 끝으로 뻗어 나온다
      scene.tweens.add({ targets: img, scaleX: sx, duration: 300, ease: 'Back.easeOut' });
      this.tails.push({
        img,
        baseAngle,
        swayPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        swayFreq:  Phaser.Math.FloatBetween(2.2, 4.2),
        color,
      });
    }

    if (i % 3 === 0) {
      this.specialBonus += GUMI_PARAMS.tailSpecialBonus;
    } else if (i % 3 === 1) {
      this.speedBonus += GUMI_PARAMS.tailSpeedBonus;
      player.addPermanentSpeed(GUMI_PARAMS.tailSpeedBonus);
    } else {
      this.spawnReduction += GUMI_PARAMS.tailSpawnReduction;
    }

    this.tailCount++;

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

    // 플레이어 속도 기반 트레일링: 오른쪽 이동 시 꼬리가 왼쪽으로 쏠림
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    const maxSpeed = 400;
    const velRatio = body ? Phaser.Math.Clamp(body.velocity.x / maxSpeed, -1, 1) : 0;
    const trailOffset = velRatio * TRAIL_MAX;

    // 좌표·각도만 갱신한다. 원본의 지렁이 파동은 **밑동을 축으로 한 흔들림**으로 대신한다 —
    // 세그먼트가 없으니 마디마다 위상을 어긋나게 줄 대상도 없다.
    for (const tail of this.tails) {
      if (!tail.img.active) continue;
      const sway = Math.sin(time * tail.swayFreq + tail.swayPhase) * SWAY_AMP;
      tail.img.setPosition(originX, originY);
      tail.img.setRotation(tail.baseAngle + sway + trailOffset);
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

    // 꼬리 확대 — 밑동을 축으로 길고 두껍게 부푼다
    this.tails.forEach(tl => {
      if (!tl.img.active) return;
      scene.tweens.add({
        targets: tl.img,
        scaleX: (TAIL_LEN * 1.45) / 512,
        scaleY: (TAIL_WIDTH * 1.45) / 192,
        duration: 320, ease: 'Back.easeOut',
      });
    });

    this._createAura(api);

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
    this._updateAura(api);
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
    this.tails.forEach(tl => {
      if (!tl.img.active) return;
      scene.tweens.add({
        targets: tl.img, alpha: 0, scaleX: 0, scaleY: 0,
        duration: 380, ease: 'Quad.easeIn',
        onComplete: () => tl.img.destroy(),
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

    this._destroyAura();
    this._spawnBreakEffect(api);
    this._zapAllPoops(api);
  }

  // ── 오라 생성 ─────────────────────────────────────────────────────
  private _createAura(api: GameSceneAPI): void {
    const { scene, player } = api;
    ensureGlowDot(scene);
    for (let i = 0; i < AURA_PARTICLE_COUNT; i++) {
      const angle  = (i / AURA_PARTICLE_COUNT) * Math.PI * 2;
      // 홀짝 번갈아 시계/반시계, 반경도 살짝 다르게
      const speed  = (i % 2 === 0 ? 3.2 : -2.4) + Phaser.Math.FloatBetween(-0.4, 0.4);
      const radius = 38 + (i % 3) * 7;
      const img = scene.add.image(
        player.x + Math.cos(angle) * radius,
        player.y + Math.sin(angle) * radius,
        'glow_dot',
      )
        .setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(AURA_COLORS[i])
        .setScale(0.38)
        .setAlpha(0.9);
      this.auraParticles.push({ img, angle, speed, radius });
    }
  }

  // ── 오라 매 프레임 업데이트 + 소각 판정 ──────────────────────────
  private _updateAura(api: GameSceneAPI): void {
    const { player, poops, scene } = api;
    const dt = scene.game.loop.delta * 0.001;
    const time = scene.time.now * 0.001;

    for (const p of this.auraParticles) {
      p.angle += p.speed * dt;
      const x = player.x + Math.cos(p.angle) * p.radius;
      const y = player.y + Math.sin(p.angle) * p.radius;
      p.img.setPosition(x, y);
      // 숨쉬는 scale 펄스
      p.img.setScale(0.30 + Math.sin(time * 6 + p.angle) * 0.10);
    }

    // 소각 판정
    const burnR2 = AURA_BURN_RADIUS * AURA_BURN_RADIUS;
    (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active
        && (p.x - player.x) ** 2 + (p.y - player.y) ** 2 <= burnR2)
      .forEach(p => {
        this._spawnBurnEffect(p.x, p.y, scene);
        (p as unknown as PoolablePoopBase).recycle();
      });
  }

  // ── 소각 이펙트 ───────────────────────────────────────────────────
  private _spawnBurnEffect(x: number, y: number, scene: Phaser.Scene): void {
    ensureGlowDot(scene);
    const burnColors = [0xff4400, 0xff8800, 0xffcc00];
    for (let i = 0; i < 7; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist  = Phaser.Math.FloatBetween(12, 26);
      const spark = scene.add.image(x, y, 'glow_dot')
        .setDepth(201)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(burnColors[i % 3])
        .setScale(Phaser.Math.FloatBetween(0.18, 0.30));
      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 14, // 위로 솟구치는 불꽃
        scale: 0,
        alpha: 0,
        duration: Phaser.Math.Between(180, 280),
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // ── 오라 제거 ─────────────────────────────────────────────────────
  private _destroyAura(): void {
    this.auraParticles.forEach(p => p.img.destroy());
    this.auraParticles = [];
  }

  // ── 무적 종료 파열 이펙트 (센티넬 방어막 파열 스타일, 황금색) ────
  private _spawnBreakEffect(api: GameSceneAPI): void {
    const { player, scene } = api;
    const cx = player.x;
    const cy = player.y;

    scene.cameras.main.flash(200, 255, 200, 50, true);

    // 확산 링 2겹 — Graphics 로 타원을 그리던 것 → 충격파 텍스처
    playFx(scene, 'shockwave', cx, cy, { scale: 2.4, tint: 0xffcc44, depth: 150 });
    scene.time.delayedCall(80, () => {
      if (!scene.sys.isActive()) return;
      playFx(scene, 'shockwave', cx, cy, { scale: 1.8, tint: 0xffcc44, depth: 150 });
    });

    // 내부 섬광
    playFx(scene, 'bloom', cx, cy, { scale: 0.9, tint: 0xffcc44, alpha: 0.8, depth: 149 });

    // 황금 파편 — Graphics 8개를 낱개로 날리던 것 → 이미터 하나
    burst(scene, cx, cy, 'shard', { count: 10, tint: [0xffcc44, 0xffee88], speed: 1.1, depth: 152 });
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

    // 황금 확산 링 2겹 — 반경(zapRadius)만큼 퍼진다. shockwave 는 128px 텍스처가
    // 지름 92px 쯤으로 그려지므로 원하는 반경에 맞춰 배율을 잡는다
    playFx(scene, 'shockwave', player.x, player.y, {
      scale: (r * 2) / 92, tint: 0xffcc44, depth: 212,
    });
    scene.time.delayedCall(80, () => {
      if (!scene.sys.isActive()) return;
      playFx(scene, 'shockwave', player.x, player.y, {
        scale: (r * 1.6) / 92, tint: 0xffee88, alpha: 0.7, depth: 212,
      });
    });

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
    this.tails.forEach(tl => tl.img.destroy());
    this.tails = [];
    this._destroyAura();
  }
}
