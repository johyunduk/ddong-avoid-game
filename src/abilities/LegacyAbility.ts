import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import { LEGACY_PARAMS } from '../config/abilityParams';

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

  private legacyTopGlow?:       Phaser.GameObjects.Graphics;
  private legacyPulseTween?:    Phaser.Tweens.Tween;
  private legacyRainTimer?:     Phaser.Time.TimerEvent;
  private legacyEndTimer?:      Phaser.Time.TimerEvent; // activateLegacyMode 종료 delayedCall
  private startFeverTimer?:     Phaser.Time.TimerEvent; // startFeverRain addEvent
  private startFeverEndTimer?:  Phaser.Time.TimerEvent; // onCreate 피버 종료 delayedCall

  // A: 상시 불꽃 오라
  private oraTimer = 0;
  private static readonly ORA_INTERVAL_NORMAL = 180; // ms
  private static readonly ORA_INTERVAL_LEGACY =  80; // ms
  private static readonly ORA_COLS_NORMAL = [0xff3300, 0xff6600, 0xffaa00];
  private static readonly ORA_COLS_LEGACY = [0xffaa00, 0xffcc00, 0xffee44, 0xffffff];

  // D: 빗줄기 색상
  private static readonly RAIN_COLS_FEVER  = [0xff8800, 0xffaa00, 0xffcc00, 0xffee00];
  private static readonly RAIN_COLS_LEGACY = [0xff5500, 0xff8800, 0xffaa00, 0xffcc00];

  // ── 불꽃 물방울 다각형 좌표 ─────────────────────────────────────────
  private static flamePts(w: number, h: number) {
    return [
      { x:  0,         y: -h        },
      { x:  w * 0.55,  y: -h * 0.1  },
      { x:  w * 0.75,  y:  h * 0.35 },
      { x:  w * 0.3,   y:  h        },
      { x: -w * 0.3,   y:  h        },
      { x: -w * 0.75,  y:  h * 0.35 },
      { x: -w * 0.55,  y: -h * 0.1  },
    ];
  }

  // ── 8각 별 좌표 (빗줄기 공용) ────────────────────────────────────────
  private static starPts(s: number) {
    return [
      { x:  0,       y: -s       }, { x:  s * 0.4, y: -s * 0.4 },
      { x:  s,       y:  0       }, { x:  s * 0.4, y:  s * 0.4 },
      { x:  0,       y:  s       }, { x: -s * 0.4, y:  s * 0.4 },
      { x: -s,       y:  0       }, { x: -s * 0.4, y: -s * 0.4 },
    ];
  }

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
  // A: 상시 불꽃 오라
  // ─────────────────────────────────────────────────────────────────

  private spawnOraFlame(api: GameSceneAPI): void {
    const scene = api.scene;
    const px    = api.player.x;
    const py    = api.player.y;
    const leg   = this.legacyModeActive;
    const cols  = leg ? LegacyAbility.ORA_COLS_LEGACY : LegacyAbility.ORA_COLS_NORMAL;
    const count = leg ? Phaser.Math.Between(5, 7) : Phaser.Math.Between(2, 3);
    const rMax  = leg ? 2.2  : 1.6;
    const aMax  = leg ? 0.90 : 0.70;
    const riseMin = leg ? 20  : 14;
    const riseMax = leg ? 42  : 28;
    const lifeMin = leg ? 280 : 180;
    const lifeMax = leg ? 520 : 380;

    for (let i = 0; i < count; i++) {
      const gfx = scene.add.graphics();
      const r   = Phaser.Math.FloatBetween(0.8, rMax);
      const col = Phaser.Utils.Array.GetRandom(cols) as number;
      const a   = Phaser.Math.FloatBetween(0.50, aMax);

      gfx.fillStyle(col, a);
      gfx.fillCircle(0, 0, r);
      gfx.setPosition(
        px + Phaser.Math.Between(-10, 10),
        py + Phaser.Math.Between(10, 24),
      );
      gfx.setDepth(88);

      scene.tweens.add({
        targets:  gfx,
        y:        gfx.y - Phaser.Math.Between(riseMin, riseMax),
        x:        gfx.x + Phaser.Math.Between(-4, 4),
        alpha:    0,
        scaleX:   0.15,
        scaleY:   0.15,
        duration: Phaser.Math.Between(lifeMin, lifeMax),
        ease:     'Quad.easeOut',
        onComplete: () => { gfx.destroy(); },
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
    if (toList.length === 0) return;

    const gfx = scene.add.graphics();
    gfx.setDepth(195);

    for (const { x, y } of toList) {
      gfx.lineStyle(3.5, 0xff6600, 0.50);
      gfx.beginPath(); gfx.moveTo(fromX, fromY); gfx.lineTo(x, y); gfx.strokePath();
      gfx.lineStyle(1.5, 0xffee00, 0.75);
      gfx.beginPath(); gfx.moveTo(fromX, fromY); gfx.lineTo(x, y); gfx.strokePath();
    }

    scene.tweens.add({
      targets: gfx, alpha: 0, duration: 200, ease: 'Quad.easeOut',
      onComplete: () => { gfx.destroy(); },
    });
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

    // ─ 반투명 플래시 ──────────────────────────────────────────────
    const flashOverlay = scene.add.graphics().setDepth(200);
    flashOverlay.fillStyle(0xffee00, 1);
    flashOverlay.fillRect(0, 0, 400, 600);
    flashOverlay.setAlpha(0.38);
    scene.tweens.add({
      targets: flashOverlay, alpha: 0, duration: 220, ease: 'Quad.easeOut',
      onComplete: () => { flashOverlay.destroy(); },
    });

    // ─ 팽창 링 2개 ───────────────────────────────────────────────
    [{ delay: 0, maxScale: 4.3 }, { delay: 80, maxScale: 3.4 }].forEach(({ delay, maxScale }) => {
      const ring = scene.add.graphics().setDepth(155);
      ring.lineStyle(2.5, 0xffee00, 0.9);
      ring.strokeEllipse(0, 0, 74, 98);
      ring.setPosition(cx, cy);
      scene.tweens.add({
        targets: ring, scaleX: maxScale, scaleY: maxScale, alpha: 0,
        duration: 500, delay, ease: 'Quad.easeOut',
        onComplete: () => { ring.destroy(); },
      });
    });

    // ─ 채움 타원 ─────────────────────────────────────────────────
    const fill = scene.add.graphics().setDepth(154);
    fill.fillStyle(0xffaa00, 0.28);
    fill.fillEllipse(0, 0, 74, 98);
    fill.setPosition(cx, cy);
    scene.tweens.add({
      targets: fill, alpha: 0, duration: 180, ease: 'Quad.easeOut',
      onComplete: () => { fill.destroy(); },
    });

    // ─ 파편 8개 ──────────────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const speed = Phaser.Math.FloatBetween(40, 95);
      const sw    = Phaser.Math.Between(5, 12);
      const sh    = Phaser.Math.Between(2, 5);
      const shard = scene.add.graphics().setDepth(156);
      shard.fillStyle(0xffee00, 1);
      shard.fillRect(-sw / 2, -sh / 2, sw, sh);
      shard.setPosition(cx, cy).setRotation(angle);
      scene.tweens.add({
        targets: shard,
        x: cx + Math.cos(angle) * speed, y: cy + Math.sin(angle) * speed,
        alpha: 0, rotation: angle + Phaser.Math.FloatBetween(-1, 1),
        duration: Phaser.Math.Between(270, 440), ease: 'Quad.easeOut',
        onComplete: () => { shard.destroy(); },
      });
    }

    // ─ 화면 전체 불꽃 폭발 (20개) ────────────────────────────────
    const BURST_COLS = [0xff2200, 0xff6600, 0xffaa00, 0xffdd00, 0xffff88];
    for (let i = 0; i < 20; i++) {
      const gfx = scene.add.graphics();
      const w   = Phaser.Math.Between(4, 10);
      const h   = Phaser.Math.Between(10, 22);
      const col = Phaser.Utils.Array.GetRandom(BURST_COLS) as number;

      gfx.fillStyle(col, Phaser.Math.FloatBetween(0.22, 0.50));
      gfx.fillPoints(LegacyAbility.flamePts(w, h), true);
      gfx.fillStyle(0xffee88, Phaser.Math.FloatBetween(0.28, 0.55));
      gfx.fillPoints(LegacyAbility.flamePts(w * 0.4, h * 0.5), true);

      gfx.setPosition(Phaser.Math.Between(20, 380), Phaser.Math.Between(40, 560));
      gfx.setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(-180, 180)));
      gfx.setDepth(158).setAlpha(0);

      scene.tweens.add({
        targets: gfx, alpha: 1,
        scaleX: Phaser.Math.FloatBetween(1.2, 1.9),
        scaleY: Phaser.Math.FloatBetween(1.2, 1.9),
        duration: 140, delay: Phaser.Math.Between(0, 280), ease: 'Quad.easeOut',
        onComplete: () => {
          scene.tweens.add({
            targets: gfx, alpha: 0, y: gfx.y - Phaser.Math.Between(20, 50),
            duration: Phaser.Math.Between(380, 650), ease: 'Quad.easeIn',
            onComplete: () => { gfx.destroy(); },
          });
        },
      });
    }

    // ─ 상단 노란빛 그라데이션 ────────────────────────────────────
    this.legacyTopGlow = scene.add.graphics();
    this.legacyTopGlow.fillGradientStyle(0xffee00, 0xffee00, 0xffee00, 0xffee00, 0.28, 0.28, 0, 0);
    this.legacyTopGlow.fillRect(0, 0, 400, 220);
    this.legacyTopGlow.setDepth(148);

    this.legacyPulseTween = scene.tweens.add({
      targets: [this.legacyTopGlow], alpha: 0.55,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

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
  // D: 황금 빗줄기
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

  /** 빗줄기 별 1개 생성 — startFeverRain / legacyRainTimer 공용 */
  private spawnRainStar(
    scene: Phaser.Scene,
    cols: readonly number[],
    aMin: number,
    aMax: number,
    count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const gfx = scene.add.graphics();
      const s   = Phaser.Math.FloatBetween(2.5, 5.5);
      const col = Phaser.Utils.Array.GetRandom(cols as number[]) as number;

      gfx.fillStyle(col, Phaser.Math.FloatBetween(aMin, aMax));
      gfx.fillPoints(LegacyAbility.starPts(s), true);
      gfx.fillStyle(0xffffff, aMax > 0.85 ? 0.65 : 0.50); // 레거시 모드는 하이라이트도 강하게
      gfx.fillCircle(0, 0, s * 0.32);

      gfx.setPosition(Phaser.Math.Between(10, 390), -15);
      gfx.setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(0, 360)));
      gfx.setDepth(85);

      scene.tweens.add({
        targets:  gfx,
        y:        gfx.y + Phaser.Math.Between(450, 600),
        x:        gfx.x + Phaser.Math.Between(-25, 25),
        rotation: gfx.rotation + Phaser.Math.FloatBetween(1.5, 3.0),
        alpha:    0,
        duration: Phaser.Math.Between(2200, 3600),
        ease:     'Linear',
        onComplete: () => { gfx.destroy(); },
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
      poop.destroy();
      api.updateScore(10);
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
  }

  // ─────────────────────────────────────────────────────────────────
  // 불꽃 소멸 이펙트
  // ─────────────────────────────────────────────────────────────────

  private playBurnEffect(scene: Phaser.Scene, cx: number, cy: number): void {
    const flash = scene.add.graphics();
    flash.fillStyle(0xff7700, 0.60); flash.fillCircle(0, 0, 17);
    flash.fillStyle(0xffee88, 0.45); flash.fillCircle(0, 0, 9);
    flash.setPosition(cx, cy).setDepth(202);
    scene.tweens.add({
      targets: flash, scaleX: 2.8, scaleY: 2.8, alpha: 0,
      duration: 190, ease: 'Quad.easeOut',
      onComplete: () => { flash.destroy(); },
    });

    for (let i = 0; i < 10; i++) {
      const gfx = scene.add.graphics();
      const w   = Phaser.Math.Between(5, 11);
      const h   = Phaser.Math.Between(14, 27);

      gfx.fillStyle(0xaa1100, 0.25); gfx.fillPoints(LegacyAbility.flamePts(w,        h       ), true);
      gfx.fillStyle(0xff4400, 0.48); gfx.fillPoints(LegacyAbility.flamePts(w * 0.70, h * 0.76), true);
      gfx.fillStyle(0xffcc00, 0.68); gfx.fillPoints(LegacyAbility.flamePts(w * 0.40, h * 0.50), true);

      gfx.setPosition(
        cx + Phaser.Math.Between(-15, 15),
        cy + Phaser.Math.Between(-10, 10),
      );
      gfx.setRotation(Phaser.Math.DegToRad(Phaser.Math.Between(-28, 28)));
      gfx.setDepth(200);

      const rise = Phaser.Math.Between(48, 88);
      const dur  = Phaser.Math.Between(500, 900);

      scene.tweens.add({
        targets: gfx, y: gfx.y - rise * 0.38, scaleX: 1.45, scaleY: 1.45,
        duration: dur * 0.35, ease: 'Quad.easeOut',
        onComplete: () => {
          scene.tweens.add({
            targets: gfx, y: gfx.y - rise * 0.62, scaleX: 0, scaleY: 0, alpha: 0,
            duration: dur * 0.65, ease: 'Quad.easeIn',
            onComplete: () => { gfx.destroy(); },
          });
        },
      });
    }

    const EMBER_COLS = [0xff5500, 0xff8800, 0xffbb00];
    for (let i = 0; i < 8; i++) {
      const gfx = scene.add.graphics();
      const s   = Phaser.Math.Between(2, 5);
      const col = Phaser.Utils.Array.GetRandom(EMBER_COLS) as number;

      gfx.fillStyle(col, 0.18);
      gfx.fillPoints([{ x: 0, y: -s * 1.9 }, { x: s * 1.9, y: 0 }, { x: 0, y: s * 1.9 }, { x: -s * 1.9, y: 0 }], true);
      gfx.fillStyle(0xffee88, 0.65);
      gfx.fillPoints([{ x: 0, y: -s }, { x: s, y: 0 }, { x: 0, y: s }, { x: -s, y: 0 }], true);

      gfx.setPosition(
        cx + Phaser.Math.Between(-18, 18),
        cy + Phaser.Math.Between(-18, 18),
      ).setDepth(201);

      const rad  = Phaser.Math.DegToRad(Phaser.Math.Between(185, 355));
      const dist = Phaser.Math.Between(28, 65);

      scene.tweens.add({
        targets: gfx,
        x: gfx.x + Math.cos(rad) * dist,
        y: gfx.y + Math.sin(rad) * dist - Phaser.Math.Between(18, 40),
        rotation: Phaser.Math.DegToRad(Phaser.Math.Between(200, 400)),
        alpha: 0, scaleX: 0, scaleY: 0,
        duration: Phaser.Math.Between(650, 1050),
        delay:    Phaser.Math.Between(0, 220),
        ease:     'Sine.easeOut',
        onComplete: () => { gfx.destroy(); },
      });
    }

    for (let i = 0; i < 4; i++) {
      const gfx = scene.add.graphics();
      gfx.fillStyle(0x331100, 0.28);
      gfx.fillCircle(0, 0, Phaser.Math.Between(6, 13));
      gfx.setPosition(
        cx + Phaser.Math.Between(-12, 12),
        cy + Phaser.Math.Between(-10, 4),
      ).setDepth(199);

      scene.tweens.add({
        targets: gfx,
        y:       gfx.y - Phaser.Math.Between(45, 85),
        x:       gfx.x + Phaser.Math.Between(-14, 14),
        scaleX:  2.4, scaleY: 2.4, alpha: 0,
        duration: Phaser.Math.Between(850, 1350),
        delay:    Phaser.Math.Between(80, 380),
        ease:     'Sine.easeOut',
        onComplete: () => { gfx.destroy(); },
      });
    }
  }
}
