import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { MUGI_PARAMS } from '../config/abilityParams';
import { ensureGlowDot } from '../utils/glowDot';
import { burst, fxSprite, impact, playFx } from '../utils/vfx';

interface YeoijuOrb {
  gfx: Phaser.GameObjects.Image;
  x: number;
  y: number;
}

interface OrbitOrb {
  gfx: Phaser.GameObjects.Image;
  angle: number;
  speed: number;    // rad/ms (음수 = 반시계)
  radius: number;
  tiltCos: number;  // 궤도 기울기 (작을수록 납작한 타원)
}

const HALO_Y_OFFSET = 28; // 후광 중심을 플레이어 중심보다 위로

// ── 번개 ────────────────────────────────────────────────────────────────
/**
 * 낙뢰 — **프레임 시트**다. 8프레임이 각각 다른 경로로 그려져 있어 재생만 하면
 * 지지직거린다. 색은 시트에 구워 넣었으므로(금색 / 검붉은) 착색하지 않는다.
 *
 * 이전엔 흰 줄기 세 변형을 번갈아 뽑아 가며 시작점·두께를 흔들어 네 번 쳤다.
 * 그 흉내가 통째로 필요 없어졌다.
 */
const BOLT_FRAME_H   = 384;
const BOLT_GOLD_CORE = 0xfff3a0;
const BOLT_RED_CORE  = 0xff3311;

/** 여의주 — 어두운 본체 + 불꽃 고리가 그려진 컷아웃 (192px) */
const YEOIJU_TEXTURE = 'fx_yeoiju';
const YEOIJU_SIZE    = 24;  // 원본 fillCircle 반지름 11 = 지름 22px 기준
/** 연꽃 — 부활 연출. 피어나는 과정이 들어 있는 8프레임 시트 */
const LOTUS_SHEET    = 'lotusBloom' as const;
const LOTUS_FRAME    = 192;
const LOTUS_SIZE     = 136;
/** 여의주·궤도 구슬은 오래 산다. vfx 보험 타이머는 그보다 길게 */
const PERSIST_MS     = 20 * 60 * 1000;

// 각 궤도 고유 파라미터 — 전자 궤도처럼 방향/기울기/속도 다양화
const ORBIT_CONFIGS: { speed: number; radius: number; tiltCos: number; startAngle: number }[] = [
  {  speed:  0.0050, radius: 30, tiltCos: 0.32, startAngle: 0 },
  {  speed: -0.0043, radius: 32, tiltCos: 0.58, startAngle: Math.PI * 0.7 },
  {  speed:  0.0060, radius: 29, tiltCos: 0.44, startAngle: Math.PI * 1.3 },
  {  speed: -0.0038, radius: 34, tiltCos: 0.22, startAngle: Math.PI * 0.4 },
  {  speed:  0.0048, radius: 31, tiltCos: 0.78, startAngle: Math.PI * 1.7 },
];

export class MugiAbility extends BaseAbility {
  private lastYeoijuScore    = 0;
  private yeoijuCount        = 0;
  private yeoijus: YeoijuOrb[] = [];
  private orbitOrbs: OrbitOrb[] = [];
  private normalPrefix     = 'mugi_';
  private isGoldForm       = false;
  private auraTimer        = 0;
  private revivalHaloOuter: Phaser.GameObjects.Image | null = null;
  private revivalHaloInner: Phaser.GameObjects.Image | null = null;

  // Revival state
  private revivalCharges     = 1;   // 0 or 1 (max stored)
  private totalRevivalsUsed  = 0;   // lifetime cap: 3
  private revivalChargeCount = 0;   // yeoijus collected toward recharge

  override onCreate(api: GameSceneAPI): void {
    this.lastYeoijuScore    = 0;
    this.yeoijuCount        = 0;
    this.yeoijus            = [];
    this.orbitOrbs          = [];
    this.normalPrefix       = api.player.getTexturePrefix();
    this.isGoldForm         = false;
    this.auraTimer          = 0;
    this.revivalHaloOuter   = null;
    this.revivalHaloInner   = null;
    this.revivalCharges     = 1;
    this.totalRevivalsUsed  = 0;
    this.revivalChargeCount = 0;
    ensureGlowDot(api.scene);
    this._createRevivalHalo(api);
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    const interval = this.isGoldForm ? MUGI_PARAMS.yeoijuGoldInterval : MUGI_PARAMS.yeoijuInterval;
    if (score % interval === 0 && score > this.lastYeoijuScore) {
      this.lastYeoijuScore = score;
      this._spawnYeoiju(api);
    }
  }

  override onUpdate(api: GameSceneAPI): void {
    this._updateYeoijus(api);
    this._tickAura(api);
    this._updateOrbitOrbs(api);
    this._updateRevivalHalo(api.player.x, api.player.y);
  }

  override onHitPoop(api: GameSceneAPI): boolean {
    if (this.revivalCharges > 0 && this.totalRevivalsUsed < 3) {
      this._revive(api);
      return true;
    }
    return false;
  }

  // ── 여의주 ──────────────────────────────────────────────────────────

  private _spawnYeoiju(api: GameSceneAPI): void {
    const scene = api.scene;
    const x = Phaser.Math.Between(30, 370);

    // 원형 3D 구슬을 fillCircle 6번으로 그리던 것 → 그려진 텍스처 한 장
    const gfx = fxSprite(scene, x, -20, YEOIJU_TEXTURE, {
      scale: [YEOIJU_SIZE / 192, YEOIJU_SIZE / 192],
      alpha: 0.72,
      depth: 150,
      blend: 'normal',
      lifeMs: PERSIST_MS,
      slot: 'mugi_yeoiju',
      maxConcurrent: 12,
    });
    if (!gfx) return;

    scene.tweens.add({
      targets: gfx, alpha: 1,
      yoyo: true, repeat: -1, duration: 720, ease: 'Sine.easeInOut',
    });

    this.yeoijus.push({ gfx, x, y: -20 });
  }

  private _updateYeoijus(api: GameSceneAPI): void {
    const delta = api.scene.game.loop.delta * 0.001;
    const { player } = api;
    const fallDelta = (api.baseSpeed + api.difficultyLevel * 40) * MUGI_PARAMS.yeoijuFallFactor * delta;
    const r2 = MUGI_PARAMS.yeoijuCollectRadius ** 2;
    const remaining: YeoijuOrb[] = [];

    for (const orb of this.yeoijus) {
      orb.y += fallDelta;
      orb.gfx.setPosition(orb.x, orb.y);

      const dx = player.x - orb.x;
      const dy = player.y - orb.y;
      if (dx * dx + dy * dy < r2) {
        this._collectYeoiju(orb, api);
        continue;
      }
      if (orb.y > 660) { api.scene.tweens.killTweensOf(orb.gfx); orb.gfx.destroy(); continue; }
      remaining.push(orb);
    }
    this.yeoijus = remaining;
  }

  private _collectYeoiju(orb: YeoijuOrb, api: GameSceneAPI): void {
    this._spawnCollectEffect(orb.x, orb.y, api.scene);
    api.scene.tweens.killTweensOf(orb.gfx);
    orb.gfx.destroy();
    api.addAbilityBonus(80);

    // Revival recharge: runs regardless of gold form
    if (this.revivalCharges === 0 && this.totalRevivalsUsed < 3) {
      this.revivalChargeCount++;
      if (this.revivalChargeCount >= MUGI_PARAMS.revivalRechargeCount) {
        this.revivalCharges = 1;
        this.revivalChargeCount = 0;
        this._playRechargeGlow(api);
      }
    }

    if (this.isGoldForm) {
      this._strikeThunder(api, false);
      return;
    }

    this.yeoijuCount++;

    if (this.yeoijuCount % 10 === 0 && this.orbitOrbs.length < 5) {
      this._spawnOrbitOrb(api);
    }

    if (this.yeoijuCount >= MUGI_PARAMS.goldThreshold) {
      this._transformGold(api);
    } else {
      this._strikeRedLightning(api);
    }
  }

  // ── 기운 (아우라) 이펙트 ─────────────────────────────────────────────

  private _tickAura(api: GameSceneAPI): void {
    const level = this.isGoldForm ? 4 : Math.floor(this.yeoijuCount / 10);
    const delta = api.scene.game.loop.delta;

    // 레벨별 검은/금색 기운
    if (level > 0) {
      this.auraTimer += delta;
      const interval = Math.max(70, 400 - level * 70);
      if (this.auraTimer >= interval) {
        this.auraTimer -= interval;
        const color = this.isGoldForm ? 0xffdd00 : 0x8800ff;
        for (let i = 0; i < level; i++) {
          this._spawnAuraWisp(api.player.x, api.player.y, color, level, api.scene);
        }
      }
    }

  }

  private _spawnAuraWisp(px: number, py: number, color: number, level: number, scene: Phaser.Scene): void {
    const angle  = Math.random() * Math.PI * 2;
    const spread = 18 + level * 4;
    const ox = px + Math.cos(angle) * Phaser.Math.Between(8, spread);
    const oy = py + Math.sin(angle) * Phaser.Math.Between(8, spread * 0.6);
    const sz  = Phaser.Math.FloatBetween(3, 5 + level * 0.6);
    const glowScale = sz / 28;

    const img = scene.add.image(ox, oy, 'glow_dot')
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setScale(glowScale)
      .setAlpha(0.85);

    const tx  = ox + Phaser.Math.Between(-14, 14);
    const ty  = oy - Phaser.Math.Between(22, 44);
    const dur = Phaser.Math.Between(280, 440);

    scene.tweens.add({
      targets: img, x: tx, y: ty, alpha: 0, scale: glowScale * 0.3,
      duration: dur, ease: 'Quad.easeOut',
      onComplete: () => { if (img.active) img.destroy(); },
    });
  }

  // ── 궤도 구슬 (전자 궤도 이펙트) ────────────────────────────────────

  private _spawnOrbitOrb(api: GameSceneAPI): void {
    const cfg = ORBIT_CONFIGS[this.orbitOrbs.length];
    if (!cfg) return;

    // 여의주와 같은 텍스처를 절반 크기로 — 같은 물건이 딸려 도는 것으로 읽혀야 한다
    const size = YEOIJU_SIZE * 0.42;
    const gfx = fxSprite(api.scene, api.player.x, api.player.y, YEOIJU_TEXTURE, {
      scale: [0.001, 0.001],
      depth: 145,
      blend: 'normal',
      lifeMs: PERSIST_MS,
      slot: 'mugi_orbit',
      maxConcurrent: 6,
    });
    if (!gfx) return;

    const startX = api.player.x + Math.cos(cfg.startAngle) * cfg.radius;
    const startY = api.player.y + Math.sin(cfg.startAngle) * cfg.radius * cfg.tiltCos;
    gfx.setPosition(startX, startY);

    api.scene.tweens.add({
      targets: gfx, scaleX: size / 192, scaleY: size / 192,
      duration: 300, ease: 'Back.easeOut',
    });

    this.orbitOrbs.push({
      gfx,
      angle: cfg.startAngle,
      speed: cfg.speed,
      radius: cfg.radius,
      tiltCos: cfg.tiltCos,
    });
  }

  private _updateOrbitOrbs(api: GameSceneAPI): void {
    const delta = api.scene.game.loop.delta;
    const { player } = api;

    for (const orb of this.orbitOrbs) {
      orb.angle += orb.speed * delta;
      const x = player.x + Math.cos(orb.angle) * orb.radius;
      const y = player.y + Math.sin(orb.angle) * orb.radius * orb.tiltCos;
      orb.gfx.setPosition(x, y);
    }
  }

  private _spawnCollectEffect(x: number, y: number, scene: Phaser.Scene): void {
    // Graphics 6개를 낱개로 날리던 것 → 이미터 하나
    burst(scene, x, y, 'ember', { count: 8, tint: [0xff3333, 0xff8844], speed: 0.8, depth: 160 });
  }

  // ── 황금 변신 ────────────────────────────────────────────────────────

  private _transformGold(api: GameSceneAPI): void {
    this.isGoldForm = true;
    this.yeoijus.forEach(orb => { api.scene.tweens.killTweensOf(orb.gfx); orb.gfx.destroy(); });
    this.yeoijus = [];
    this._strikeThunder(api, true);
  }

  private _resetGoldForm(api: GameSceneAPI): void {
    this.isGoldForm = false;
    this.yeoijuCount = 0;
    api.player.setTexturePrefix(this.normalPrefix);
  }

  // ── 번개 ─────────────────────────────────────────────────────────────
  //
  // 이전엔 Graphics 하나를 4~5회 지우고 폴리라인 13줄씩(본줄기 4 + 가지 3×3) 다시 그렸다.
  // 여의주는 50점마다 떨어지므로 이 경로가 가장 자주 도는 곳이었다.
  // 지금은 갈래가 그려진 텍스처를 회전·신축해 쓴다 — 그리는 비용이 없다.
  //
  // 텍스처는 무채색이라 **착색만으로 금색/검붉은 성격이 갈린다.**

  private _strikeThunder(api: GameSceneAPI, applyGoldSprite: boolean): void {
    const { scene, player } = api;
    const tx = player.x;
    const ty = player.y;

    if (applyGoldSprite) scene.cameras.main.flash(600, 80, 70, 0, true);

    this._bolt(scene, tx, ty, true);
    playFx(scene, 'bloom', tx, ty, { scale: 1.4, tint: BOLT_GOLD_CORE, depth: 308 });
    playFx(scene, 'shockwave', tx, ty, { scale: 1.6, tint: 0xffffff, depth: 309 });
    impact(scene, { hitstop: 60, shake: { duration: 260, intensity: 0.006 } });

    scene.time.delayedCall(180, () => {
      if (!scene.sys.isActive()) return;
      // 변신 도중 부활로 isGoldForm이 해제됐을 수 있으므로 확인
      if (applyGoldSprite && this.isGoldForm) api.player.setTexturePrefix('gold_mugi_');
      this._clearPoops(api, () => true, 20);
    });
  }

  private _strikeRedLightning(api: GameSceneAPI): void {
    const { scene, player } = api;
    const tx = player.x;
    const ty = player.y;

    this._bolt(scene, tx, ty, false);
    playFx(scene, 'bloom', tx, ty, { scale: 0.8, tint: BOLT_RED_CORE, depth: 308 });
    impact(scene, { shake: { duration: 140, intensity: 0.0025 } });

    scene.time.delayedCall(180, () => {
      if (!scene.sys.isActive()) return;
      this._clearPoops(api, p => Math.abs(p.x - tx) <= 60, 10);
    });
  }

  /**
   * 하늘에서 대상으로 내리꽂는 낙뢰.
   *
   * **번쩍임이 프레임에 들어 있다.** 8프레임이 각각 다른 경로로 그려져 있어
   * 재생만 하면 지지직거린다 — 시작점·두께를 흔들고 다른 텍스처를 뽑아 가며
   * 네 번 치던 코드가 통째로 필요 없어졌다.
   */
  private _bolt(scene: Phaser.Scene, tx: number, ty: number, gold: boolean): void {
    // 시트는 프레임 위→아래가 하늘→착지점이다. 원점을 바닥에 두고 대상에 맞춘다
    const height = ty + 20;
    playFx(scene, gold ? 'boltGold' : 'boltRed', tx, ty + 8, {
      scale: height / BOLT_FRAME_H,
      alpha: gold ? 0.95 : 0.9,
      depth: 310,
      origin: [0.5, 1],
    });
  }

  // ── 공통 유틸 ────────────────────────────────────────────────────────

  private _clearPoops(
    api: GameSceneAPI,
    filter: (p: Phaser.Physics.Arcade.Sprite) => boolean,
    pointsPerPoop: number,
  ): void {
    const { poops, scene } = api;
    const targets = (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active && filter(p));

    if (targets.length === 0) return;

    // 위치를 먼저 저장한 뒤 즉시 재활용 — 피버 타임이 얼어있는 똥을
    // 특수 똥으로 변환하는 race condition을 원천 차단
    const positions = targets.map(p => ({ x: p.x, y: p.y }));
    targets.forEach(p => (p as unknown as PoolablePoopBase).recycle());

    // 타격 이펙트는 recycle() 안에서 이미 나간다. 여기서 또 깔면 대상당 이펙트가
    // 두 겹이 되는데, 황금 번개는 화면의 똥을 전부 지우므로 그 배가 그대로 부하가 된다.

    scene.time.delayedCall(450, () => {
      if (!scene.sys.isActive()) return;
      api.addAbilityBonus(positions.length * pointsPerPoop);
    });
  }

  private _revive(api: GameSceneAPI): void {
    this.revivalCharges--;
    this.totalRevivalsUsed++;

    if (this.isGoldForm) {
      this._resetGoldForm(api);
    }
    this.orbitOrbs.forEach(o => { api.scene.tweens.killTweensOf(o.gfx); o.gfx.destroy(); });
    this.orbitOrbs = [];
    this._destroyRevivalHalo();

    const { poops, scene } = api;

    // 전체 똥 즉시 제거
    (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active)
      .forEach(p => (p as unknown as PoolablePoopBase).recycle());

    // 화면 중앙으로 이동 + 연꽃 소환
    const centerX = scene.scale.width / 2;
    api.player.setX(centerX);

    api.player.setInvincibleBriefly(2500);
    this._playRevivalLotus(centerX, api.player.y, scene);
  }

  /**
   * 부활 — 발밑에서 연꽃이 피어오른다.
   *
   * **피어나는 과정이 프레임에 들어 있다** (봉오리 → 벌어짐 → 만개 → 빛으로 흩어짐).
   * 정지 그림 한 장을 키워서 '피는 것처럼' 보이게 하던 것과 다르다 — 꽃잎이 실제로 벌어진다.
   * 원점을 꽃 바닥에 두고 발밑에 앉힌다.
   */
  private _playRevivalLotus(px: number, py: number, scene: Phaser.Scene): void {
    const cx = px;
    const cy = py + 38;   // 플레이어 발 바닥

    playFx(scene, LOTUS_SHEET, cx, cy + 6, {
      scale: LOTUS_SIZE / LOTUS_FRAME,
      origin: [0.5, 0.92],
      depth: 353,
    });

    // 금빛 기운 — 꽃이 필 때 바닥에서 위로 흩어진다
    playFx(scene, 'bloom', cx, cy - 34, { scale: 1.1, tint: 0xffe082, depth: 352 });
    burst(scene, cx, cy, 'sparkle', {
      count: 14, tint: [0xffd700, 0xfff3b0], speed: 0.6,
      angle: { min: -125, max: -55 }, gravityY: -120, depth: 354,
    });
  }

  private _createRevivalHalo(api: GameSceneAPI): void {
    const { scene, player } = api;
    player.setDepth(5);
    const hy = player.y - HALO_Y_OFFSET;

    this.revivalHaloOuter = scene.add.image(player.x, hy, 'glow_dot')
      .setDepth(3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffffff)
      .setScale(1.5)
      .setAlpha(0.35);

    this.revivalHaloInner = scene.add.image(player.x, hy, 'glow_dot')
      .setDepth(4)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffeedd)
      .setScale(0.75)
      .setAlpha(0.65);

    scene.tweens.add({
      targets: this.revivalHaloOuter,
      alpha: { from: 0.2, to: 0.50 },
      scale: { from: 1.3, to: 1.7 },
      yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: this.revivalHaloInner,
      alpha: { from: 0.45, to: 0.80 },
      yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut',
    });
  }

  private _updateRevivalHalo(px: number, py: number): void {
    const hy = py - HALO_Y_OFFSET;
    this.revivalHaloOuter?.setPosition(px, hy);
    this.revivalHaloInner?.setPosition(px, hy);
  }

  private _destroyRevivalHalo(): void {
    // repeat:-1 트윈이 destroy된 이미지를 계속 참조하지 않도록 먼저 kill
    if (this.revivalHaloOuter) {
      this.revivalHaloOuter.scene.tweens.killTweensOf(this.revivalHaloOuter);
      this.revivalHaloOuter.destroy();
    }
    if (this.revivalHaloInner) {
      this.revivalHaloInner.scene.tweens.killTweensOf(this.revivalHaloInner);
      this.revivalHaloInner.destroy();
    }
    this.revivalHaloOuter = null;
    this.revivalHaloInner = null;
  }

  private _playRechargeGlow(api: GameSceneAPI): void {
    const { scene, player } = api;
    playFx(scene, 'shockwave', player.x, player.y, { scale: 0.85, tint: 0xff88cc, depth: 320 });
    if (!this.revivalHaloOuter) {
      this._createRevivalHalo(api);
    }
  }

  // ── 정리 ─────────────────────────────────────────────────────────────

  override onDestroy(api: GameSceneAPI): void {
    this.yeoijus.forEach(orb => { api.scene.tweens.killTweensOf(orb.gfx); orb.gfx.destroy(); });
    this.yeoijus = [];
    this.orbitOrbs.forEach(o => { api.scene.tweens.killTweensOf(o.gfx); o.gfx.destroy(); });
    this.orbitOrbs = [];
    this._destroyRevivalHalo();
    if (this.isGoldForm) {
      api.player.setTexturePrefix(this.normalPrefix);
      this.isGoldForm = false;
    }
  }
}
