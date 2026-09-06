import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { LEGACY_PARAMS } from '../config/abilityParams';
import { beam, burst, fxSprite, impact, playFx } from '../utils/vfx';

/**
 * 레거시 (UR) — 피버 + 레거시 모드
 * ★0: 6초 피버 / 불태우기 30%/2개(일반) 60%/4개(레거시) / 500점마다 / 10초 / 1.2배
 * ★1: 8초 / 35%/2개 65%/4개 / 450점마다 / 10초 / 1.25배
 * ★2: 10초 / 40%/3개 70%/4개 / 400점마다 / 12초 / 1.30배
 * ★3: 12초 / 45%/3개 75%/4개 / 350점마다 / 15초 / 1.35배 + 모드 종료 직후 3초 미니 피버
 */

export class LegacyAbility extends BaseAbility {
  private startFeverActive = false;
  private legacyModeActive = false;
  private accum           = 0;
  private lastLegacyScore = 0;

  private legacyTopGlow?:       Phaser.GameObjects.Image;
  private legacyPulseTween?:    Phaser.Tweens.Tween;
  private legacyRainTimer?:     Phaser.Time.TimerEvent;
  private legacyEndTimer?:      Phaser.Time.TimerEvent;
  private startFeverTimer?:     Phaser.Time.TimerEvent;
  private startFeverEndTimer?:  Phaser.Time.TimerEvent;

  // A: 상시 불꽃 오라
  private oraTimer = 0;
  private static readonly ORA_INTERVAL_NORMAL = 180;
  private static readonly ORA_INTERVAL_LEGACY =  95;

  // D: 빗줄기 색상
  private static readonly RAIN_COLS_FEVER  = [0xff8800, 0xffaa00, 0xffcc00, 0xffee00];
  private static readonly RAIN_COLS_LEGACY = [0xff5500, 0xff8800, 0xffaa00, 0xffcc00];

  // ─────────────────────────────────────────────────────────────────
  // 생명주기
  // ─────────────────────────────────────────────────────────────────

  override onCreate(api: GameSceneAPI): void {
    this.startFeverActive = true;
    this.startFeverRain(api);
    this.startFeverEndTimer = api.scene.time.delayedCall(LEGACY_PARAMS.feverDuration, () => {
      this.startFeverActive = false;
    });
  }

  override onUpdate(api: GameSceneAPI): void {
    const delta = api.scene.game.loop.delta;
    this.oraTimer += delta;
    const interval = this.legacyModeActive
      ? LegacyAbility.ORA_INTERVAL_LEGACY
      : LegacyAbility.ORA_INTERVAL_NORMAL;
    if (this.oraTimer >= interval) {
      this.oraTimer -= interval;
      this.spawnOraFlame(api);
    }
  }

  override getTickScore(base: number): number {
    if (!this.legacyModeActive) return base;
    this.accum += base * LEGACY_PARAMS.scoreExtra;
    const bonus = Math.floor(this.accum);
    this.accum -= bonus;
    return base + bonus;
  }

  override overrideSpawnPoop(api: GameSceneAPI): boolean {
    if (this.startFeverActive) {
      api.spawnGoldPoop();
      api.spawnGoldPoop();
      return true;
    }
    return false;
  }

  override onAfterSpawnPoop(api: GameSceneAPI): void {
    const chance = this.legacyModeActive ? LEGACY_PARAMS.burnChanceLegacy : LEGACY_PARAMS.burnChanceNormal;
    const count  = this.legacyModeActive ? LEGACY_PARAMS.burnCountLegacy  : LEGACY_PARAMS.burnCountNormal;
    if (Math.random() < chance) {
      this.burnRandomPoops(api, count);
    }
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % LEGACY_PARAMS.legacyInterval === 0 && score > this.lastLegacyScore) {
      this.lastLegacyScore = score;
      this.activateLegacyMode(api);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // A: 상시 불꽃 오라 — 불꽃 프레임 시트
  // ─────────────────────────────────────────────────────────────────

  private spawnOraFlame(api: GameSceneAPI): void {
    const scene = api.scene;
    const px    = api.player.x;
    const py    = api.player.y;
    const leg   = this.legacyModeActive;
    // 발광 점 2~7개를 뿌리던 것을 **불꽃 시트 1~3장**으로 바꿨다.
    // 점은 개수로 불처럼 보이게 해야 해서 수가 불어나지만, 시트는 한 장이 이미 불이다.
    const count   = leg ? 2 : 1;
    const size    = leg ? Phaser.Math.FloatBetween(0.30, 0.46)
                        : Phaser.Math.FloatBetween(0.22, 0.34);
    const riseMin = leg ? 26  : 18;
    const riseMax = leg ? 52  : 34;
    const lifeMin = leg ? 340 : 260;
    const lifeMax = leg ? 560 : 440;

    for (let i = 0; i < count; i++) {
      const x = px + Phaser.Math.Between(-11, 11);
      const y = py + Phaser.Math.Between(10, 24);
      const s = size * Phaser.Math.FloatBetween(0.82, 1.18);
      const life = Phaser.Math.Between(lifeMin, lifeMax);

      // 착색하지 않는다 — 색(붉은 겉 → 주황 → 황금 → 흰 심지)이 시트에 구워져 있다.
      // 통째로 tint 를 걸면 그 계조가 한 색으로 눌려 '불'이 아니라 '주황 도형'이 된다.
      // 레거시 모드에서는 밝기만 올려 더 뜨겁게 보이게 한다
      const img = fxSprite(scene, x, y, 'fx_proc_glow', {
        sheet: 'legacyFlame',
        sheetStart: Math.random(),
        scale: [s, s],
        origin: [0.5, 0.92],   // 밑동이 좌표에 오도록
        alpha: 0,
        blend: 'normal',
        depth: 88,
        lifeMs: life + 200,
        slot: 'legacy_ora',
        maxConcurrent: leg ? 10 : 5,
      });
      if (!img) continue;

      scene.tweens.add({
        targets: img, alpha: leg ? 0.9 : 0.72,
        duration: life * 0.25, ease: 'Quad.easeOut',
      });
      scene.tweens.add({
        targets:  img,
        y:        y - Phaser.Math.Between(riseMin, riseMax),
        x:        x + Phaser.Math.Between(-5, 5),
        scaleX:   s * 0.35, scaleY: s * 0.5,
        alpha:    0,
        duration: life,
        ease:     'Quad.easeOut',
        onComplete: () => img.destroy(),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // B: 화염 추적선
  // ─────────────────────────────────────────────────────────────────

  private drawFireTrail(
    scene: Phaser.Scene,
    fromX: number, fromY: number,
    toList: { x: number; y: number }[],
  ): void {
    // 대상마다 Graphics 선 두 줄을 긋던 것을 beam 한 발로 바꿨다.
    // 층(넓은 주황 외곽 + 얇은 흰 코어)은 beam 이 좌표를 따라가며 관리한다
    for (const { x, y } of toList) {
      const dx = x - fromX;
      const dy = y - fromY;
      beam(scene, fromX, fromY, {
        angle: Math.atan2(dy, dx),
        length: Math.hypot(dx, dy),
        thickness: 9,
        texture: 'fx_proc_streak',
        tint: 0xff6600,
        alpha: 0.55,
        blend: 'normal',
        depth: 195,
        extendMs: 45, holdMs: 40, fadeMs: 190,
        dissipate: 'retract',
        layers: [{ thickness: 0.32, tint: 0xffee88, alpha: 0.8, dz: 1 }],
        maxConcurrent: 6,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // C: 레거시 모드 활성화
  // ─────────────────────────────────────────────────────────────────

  private activateLegacyMode(api: GameSceneAPI): void {
    if (this.legacyModeActive) return;
    this.legacyModeActive = true;
    this.accum = 0;

    const scene = api.scene;
    const cx    = api.player.x;
    const cy    = api.player.y;

    // ─ 화면 플래시 — 오버레이 Graphics 대신 카메라 플래시 ────────
    scene.cameras.main?.flash(220, 255, 238, 0, false);
    impact(scene, { shake: { duration: 180, intensity: 0.006 } });

    // ─ 팽창하는 불 고리 2개 ──────────────────────────────────────
    playFx(scene, 'auraRing', cx, cy, {
      scale: 0.42, scaleTo: 2.4, alpha: 0.95, tint: 0xffee00, depth: 155,
    });
    scene.time.delayedCall(80, () => {
      playFx(scene, 'auraRing', cx, cy, {
        scale: 0.34, scaleTo: 1.9, alpha: 0.7, tint: 0xffaa00, depth: 155,
      });
    });

    // ─ 발밑 섬광 ─────────────────────────────────────────────────
    playFx(scene, 'bloom', cx, cy, { scale: 0.8, alpha: 0.85, tint: 0xffaa00, depth: 154 });

    // ─ 사방으로 뻗는 빛줄기 ──────────────────────────────────────
    // 원본은 fillRect 로 그린 가늘고 긴 막대 8개였다. burst('shard') 로 옮겼더니
    // 텍스처가 각진 삼각형이라 '터지는 빛'이 아니라 '노란 삼각형'으로 읽혔다 —
    // 가로로 늘린 streak 을 직접 뿌려 원래 성격을 되돌린다
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const len = Phaser.Math.FloatBetween(46, 96);
      const img = fxSprite(scene, cx, cy, 'fx_proc_streak', {
        rotation: ang,
        scale: [0.06, 0.05],
        origin: [0, 0.5],
        tint: i % 2 === 0 ? 0xffee00 : 0xffaa00,
        alpha: 0.95,
        blend: 'normal',
        depth: 156,
        lifeMs: 700,
        slot: 'legacy_shard',
        maxConcurrent: 10,
      });
      if (!img) continue;
      scene.tweens.add({
        targets: img,
        x: cx + Math.cos(ang) * len,
        y: cy + Math.sin(ang) * len,
        scaleX: 0.015, alpha: 0,
        duration: Phaser.Math.Between(280, 440),
        ease: 'Quad.easeOut',
        onComplete: () => img.destroy(),
      });
    }

    // ─ 상단 노란빛 ───────────────────────────────────────────────
    // 그라데이션 Graphics 대신 방사형 글로우를 화면 위쪽 밖에 걸쳐 놓는다 —
    // 아래로 부드럽게 사라지는 돔이 직선 그라데이션보다 자연스럽다
    this.legacyTopGlow = fxSprite(scene, scene.scale.width / 2, 0, 'fx_proc_glow', {
      scale: [(scene.scale.width * 1.5) / 192, (scene.scale.height * 0.9) / 192],
      tint: 0xffee00,
      alpha: 0.28,
      blend: 'normal',
      depth: 148,
      lifeMs: LEGACY_PARAMS.legacyDuration + 1500,
      slot: 'legacy_topglow',
      maxConcurrent: 1,
    }) ?? undefined;

    if (this.legacyTopGlow) {
      this.legacyPulseTween = scene.tweens.add({
        targets: [this.legacyTopGlow], alpha: 0.5,
        duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    // ─ 레거시 모드 황금 빗줄기 (repeat: -1, 10초 후 remove로 정리) ─
    this.legacyRainTimer = scene.time.addEvent({
      delay: 120,
      repeat: -1,
      callback: () => { this.spawnRainStar(scene, LegacyAbility.RAIN_COLS_LEGACY, 0.75, 1.00, 3); },
    });

    // 레거시 모드 종료
    this.legacyEndTimer = scene.time.delayedCall(LEGACY_PARAMS.legacyDuration, () => {
      this.legacyModeActive = false;
      this.legacyRainTimer?.remove();
      this.legacyRainTimer = undefined;
      this.legacyPulseTween?.stop();
      this.legacyPulseTween = undefined;
      scene.tweens.add({
        targets: [this.legacyTopGlow], alpha: 0, duration: 400, ease: 'Quad.easeOut',
        onComplete: () => {
          this.legacyTopGlow?.destroy();
          this.legacyTopGlow = undefined;
        },
      });

    });
  }

  // ─────────────────────────────────────────────────────────────────
  // D: 황금 빗줄기 — 단일 Graphics 배치 방식
  // ─────────────────────────────────────────────────────────────────

  private startFeverRain(api: GameSceneAPI): void {
    const scene  = api.scene;
    const REPEAT = Math.floor(LEGACY_PARAMS.feverDuration / 140) - 1;

    this.startFeverTimer = scene.time.addEvent({
      delay: 140,
      repeat: REPEAT,
      callback: () => { this.spawnRainStar(scene, LegacyAbility.RAIN_COLS_FEVER, 0.60, 0.90, 2); },
    });
  }

  /**
   * 황금 빗줄기 한 묶음.
   *
   * 원래는 단일 Graphics 에 별 데이터를 모아 두고 **매 프레임 clear → 전량 재드로우** 했다.
   * 드로우콜은 1개였지만 별 한 개당 8각 다각형 채움 + 원 채움이라, 60개가 떠 있으면
   * 매 프레임 120번을 다시 그린다. 스프라이트로 바꾸면 그리기는 GPU 가 맡고
   * 이동·회전·소멸은 트윈이 맡아 **onUpdate 에서 할 일이 사라진다.**
   */
  private spawnRainStar(
    scene: Phaser.Scene,
    cols: readonly number[],
    aMin: number,
    aMax: number,
    count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const s        = Phaser.Math.FloatBetween(2.5, 5.5);
      const alpha    = Phaser.Math.FloatBetween(aMin, aMax);
      const duration = Phaser.Math.Between(2200, 3600);
      const x        = Phaser.Math.Between(10, scene.scale.width - 10);
      const scale    = (s * 3.4) / 96;   // star-sparkle 은 96px 텍스처

      const img = fxSprite(scene, x, -15, 'fx_star_1', {
        scale: [scale, scale],
        rotation: Phaser.Math.DegToRad(Phaser.Math.Between(0, 360)),
        tint: Phaser.Utils.Array.GetRandom(cols as number[]) as number,
        alpha,
        blend: 'normal',
        depth: 85,
        lifeMs: duration + 400,
        slot: 'legacy_rain',
        maxConcurrent: 32,
      });
      if (!img) continue;

      scene.tweens.add({
        targets:  img,
        x:        x + Phaser.Math.Between(-25, 25),
        y:        Phaser.Math.Between(435, 585),
        rotation: img.rotation + Phaser.Math.FloatBetween(1.5, 3.0),
        alpha:    0,
        duration,
        ease:     'Linear',
        onComplete: () => img.destroy(),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 불태우기 로직
  // ─────────────────────────────────────────────────────────────────

  private burnRandomPoops(api: GameSceneAPI, count: number): void {
    const visible = api.poops.getChildren().filter(
      c => c.active && (c as Phaser.Physics.Arcade.Sprite).y > -10,
    ) as Phaser.Physics.Arcade.Sprite[];

    if (visible.length === 0) return;

    // Partial Fisher-Yates: count개만 앞으로 뽑아내고 나머지 순회 생략
    const pool = visible.slice();
    const take = Math.min(count, pool.length);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const targets = pool.slice(0, take);

    this.drawFireTrail(
      api.scene,
      api.player.x, api.player.y,
      targets.map(p => ({ x: p.x, y: p.y })),
    );

    for (const poop of targets) {
      if (!poop.active) continue;
      this.playBurnEffect(api.scene, poop.x, poop.y);
      (poop as PoolablePoopBase).recycle();
      api.addAbilityBonus(10);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 리소스 정리 (게임 오버 시 GameScene에서 호출)
  // ─────────────────────────────────────────────────────────────────

  override onDestroy(_api: GameSceneAPI): void {
    this.startFeverEndTimer?.remove();
    this.startFeverTimer?.remove();
    this.legacyEndTimer?.remove();
    this.legacyRainTimer?.remove();
    this.legacyPulseTween?.stop();
    this.legacyTopGlow?.destroy();
    this.legacyTopGlow = undefined;
  }

  // ─────────────────────────────────────────────────────────────────
  // 불꽃 소멸 이펙트
  // ─────────────────────────────────────────────────────────────────

  /**
   * 똥 하나가 불타 사라지는 연출.
   *
   * 원래는 한 번에 Graphics 를 14개(섬광 1 + 불꽃 6 + 불티 5 + 연기 2) 만들었다.
   * 불태우기는 한 번에 최대 4개까지 터지므로 **56개**가 동시에 생기고, 각각이
   * 다각형을 두세 번 채운다. 이 캐릭터가 렉의 주범이던 이유가 여기다.
   * 지금은 시트 2장 + 이미터 2개로 끝난다.
   */
  private playBurnEffect(scene: Phaser.Scene, cx: number, cy: number): void {
    // 폭발 전 과정(섬광 → 부풀기 → 찢어짐 → 잔불)이 시트 8프레임에 다 들어 있다.
    // 예전에는 이 단계를 Graphics 14개와 트윈 체인으로 흉내 냈다
    playFx(scene, 'legacyBurn', cx, cy, {
      scale: 0.62, scaleTo: 1.15, alpha: 0.95, depth: 201,
    });

    // 시트가 담지 못하는 것 둘 — 사방으로 튀는 불티와 뒤에 남는 연기.
    // 프리셋 기본값은 가산이지만 일반 합성으로 내린다. 밝은 하늘 위에서 가산 불티는
    // 주황을 잃고 흰 점이 되고, 살아 있는 동안 전체 화면 블룸 패스를 붙잡는다 —
    // 한 번에 4마리가 타므로 그 값이 그대로 4배가 된다
    // 연기는 뺐다 — 밝은 하늘에서 거의 읽히지 않으면서 이미터만 2개 더 쓴다.
    // 시트 마지막 프레임들이 이미 잔불로 흩어지므로 뒷맛은 그쪽이 맡는다
    burst(scene, cx, cy, 'ember', {
      count: 6, tint: [0xff5500, 0xff8800, 0xffbb00],
      speed: 1.1, gravityY: -30, depth: 202, blend: 'normal',
    });
  }
}
