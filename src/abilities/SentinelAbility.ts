import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { SENTINEL_PARAMS } from '../config/abilityParams';
import { POOP_CONFIG } from '../config/poop';
import { playFx } from '../utils/vfx';

/**
 * 센티넬 (UR) — 보호막 + 과충전 방전 (2026-10 밸런스 개편, 값은 SENTINEL_PARAMS)
 * - 보호막: 시작 startShields 개. **게임 시간** chargeIntervalSec 마다 1개 충전 (최대 maxShields), 한 판 maxChargesPerRun 번까지.
 *   가득 찬 상태의 주기는 충전도 상한 카운트도 쓰지 않는다. 막으면 주변 똥을 지우되 점수는 blockZapPoints (0)
 * - 방전: 보호막이 가득 찼을 때만 pulseIntervalSec 마다 반경 pulseRadius 안 일반 똥을 지우고 개당 pulsePointsPerPoop.
 *   안 맞을수록 점수 — 예전(막을수록 점수 · 점수로 충전)의 고리를 뒤집었다
 * - 각성 단계별 값은 구현돼 있지 않다 (SENTINEL_PARAMS 하나)
 * - UI: 붉은 공이 허리 주변 수평 궤도 공전 + 전기 파지직 (재사용 Graphics)
 * - 방전 연출 (fx, 화풍: 오브젝트 하드 엣지 · 발광은 부드럽게 · 밝은 하늘 위에서 읽히게 normal 블렌드):
 *   가득 찬 동안 — 공이 흰 심지로 달아오르고 허리에 붉은 하드 엣지 고리 + 옅은 후광. 후광은 방전이 다가올수록 짙어진다.
 *   방전 PULSE_TELE_MS 전 — 반경 pulseRadius 자리에 옅은 고리가 먼저 떠서 범위를 예고한다.
 *   방전 — 같은 고리가 몸에서 pulseRadius 까지 퍼져 잠깐 머물고 사라진다 (바퀴살 빛줄기 없음 — 전기는 고리를 따라서만 긴다).
 *   오브젝트는 판 시작에 한 번 만든 Image 4장(후광 · 섬광 · 예고 고리 · 충격파)을 숨겼다 켰다 한다 — 방전 1회가 새로 만드는 것은
 *   점수 글자 1개뿐이고, 똥 파괴 이펙트는 impactHit(동시 6 상한)이다.
 * - **게임 동작은 한 프레임에**: 방전 순간 반경 안 똥을 그 자리에서 전부 지우고 점수도 그 자리에서 한 번에 준다
 *   (21df9a20 의 zapNearbyPoops 와 같은 동작). 지우기를 다음 프레임 이후로 미루면 그 사이 가장 가까운 똥이 먼저 플레이어에
 *   닿거나(보호막이 깎여 가득이 풀림) 바닥에 닿아, 펄스당 지운 똥이 6.3 → 5.6 으로 줄었다 (회귀 측정, d4465f48).
 * - **끊김 대책은 연출만 나눈다**: 지운 자리를 좌표로만 담아 두고 파괴 이펙트를 프레임당 PULSE_FX_PER_FRAME 개씩 그린다.
 *   똥 참조를 들고 있지 않으므로 풀 재사용과 얽히지 않는다
 */
export class SentinelAbility extends BaseAbility {
  private shieldCount = 0;
  /** 이번 판에 충전된 횟수 — maxChargesPerRun 까지 */
  private chargesGiven = 0;
  /** 충전 타이머 — 씬 시계(scene.time)에 건다: 히트스톱(timeScale 0) · 일시정지 동안 멈추고, 씬이 끝나면 시계째 사라진다 */
  private chargeTimer: Phaser.Time.TimerEvent | null = null;
  /** 방전 타이머 — 충전 타이머와 같은 규칙: scene.time, onCreate 에서 만들고 onDestroy 에서 뗀다 */
  private pulseTimer: Phaser.Time.TimerEvent | null = null;
  /**
   * 측정용 누계 (밸런스 하네스가 읽는다 — 화면 · 저장에는 안 쓴다):
   * 방전 횟수 · 방전으로 지운 똥 · 방전이 쓴 한 프레임 처리 시간(ms) 최댓값 · 판 시간(게임 시계 — 히트스톱 제외) · 가득 찬 시간 · 보호막 개수별(0~maxShields) 머문 시간
   */
  pulsesFired = 0;
  pulseKills = 0;
  pulseMaxMs = 0;
  aliveMs = 0;
  fullMs = 0;
  shieldMs: number[] = [];
  /** 가득 찬 동안 허리에 두르는 고리 — 한 장을 만들어 두고 위치 · 보임만 바꾼다 */
  private fullRing: Phaser.GameObjects.Graphics | null = null;
  /** 가득 찬 동안의 후광 · 방전 섬광 · 범위 예고 고리 · 충격파 — 판 시작에 한 번 만들고 보임만 바꾼다 */
  private fullHalo: Phaser.GameObjects.Image | null = null;
  private pulseFlash: Phaser.GameObjects.Image | null = null;
  private teleRing: Phaser.GameObjects.Image | null = null;
  private shockRing: Phaser.GameObjects.Image | null = null;
  /** 공을 달아오른 모습으로 그렸는지 — 가득 참이 바뀐 프레임에만 다시 그린다 */
  private dropletsHot = false;
  /** 방전으로 지운 자리 (거리순, 좌표만) — 파괴 이펙트를 프레임당 PULSE_FX_PER_FRAME 개씩 그린다. 게임 동작과 무관 */
  private zapFxQueue: { x: number; y: number }[] = [];
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

  /** 방전 파괴 이펙트를 한 프레임에 그리는 상한 (측정에서 방전 프레임 끊김 후보가 펄스 없는 판의 약 4배) — 지우기 자체는 한 프레임 */
  private static readonly PULSE_FX_PER_FRAME = 4;
  /** 범위 예고 고리가 뜨는 시간 (방전 전 ms) */
  private static readonly PULSE_TELE_MS = 450;
  /** 충격파: 몸에서 반경까지 퍼지는 시간 · 반경에 머무는 시간 · 사라지는 시간 (ms) */
  private static readonly SHOCK_GROW_MS = 170;
  private static readonly SHOCK_HOLD_MS = 110;
  private static readonly SHOCK_FADE_MS = 200;
  private static readonly RING_KEY = 'sentinel_pulse_ring';
  private static readonly GLOW_KEY = 'sentinel_pulse_glow';
  /** 고리 텍스처 바깥 여백 (발광 · 전기가 반경 밖으로 나가는 폭) */
  private static readonly RING_PAD = 18;
  private static readonly GLOW_TEX = 128;

  override onCreate(api: GameSceneAPI): void {
    // 판마다 새 인스턴스지만(getCharacterAbility) 상태는 여기서 명시적으로 처음으로 (규칙 1)
    this.shieldCount = SENTINEL_PARAMS.startShields;
    this.chargesGiven = 0;
    this.pulsesFired = 0;
    this.pulseKills = 0;
    this.pulseMaxMs = 0;
    this.aliveMs = 0;
    this.fullMs = 0;
    this.shieldMs = new Array(SENTINEL_PARAMS.maxShields + 1).fill(0);
    this.dropletsHot = false;
    this.zapFxQueue = [];
    this.createPulseVisuals(api.scene);
    this.chargeTimer = api.scene.time.addEvent({
      delay: SENTINEL_PARAMS.chargeIntervalSec * 1000, loop: true, callback: () => this.tryCharge(api),
    });
    this.pulseTimer = api.scene.time.addEvent({
      delay: SENTINEL_PARAMS.pulseIntervalSec * 1000, loop: true, callback: () => this.pulse(api),
    });
    this.spawnDroplets(api, SENTINEL_PARAMS.startShields);
    this.sparkGfx = api.scene.add.graphics().setDepth(96).setAlpha(0);
  }

  /**
   * 시간 충전 — 점수 마일스톤이 아니다. 막아서 번 점수 · 피버 점수가 충전을 앞당기던 고리를 끊는다.
   * 가득 차 있으면 그 주기는 버린다 (상한 카운트도 안 쓴다). 한 판 maxChargesPerRun 번에서 멈춘다
   */
  private tryCharge(api: GameSceneAPI): void {
    if (this.chargesGiven >= SENTINEL_PARAMS.maxChargesPerRun) { this.chargeTimer?.remove(); this.chargeTimer = null; return; }
    if (this.shieldCount >= SENTINEL_PARAMS.maxShields) return;
    this.shieldCount++;
    this.chargesGiven++;
    this.playShieldChargeEffect(api);
    this.spawnDroplets(api, 1);
  }

  /**
   * 과충전 방전 — 보호막이 가득 찼을 때만. 아니면 그 주기는 건너뛴다 (횟수에도 안 넣는다).
   * 반경 안 일반 똥을 **이 프레임에** 전부 지우고(이펙트 없이) 점수를 한 번에 addAbilityBonus(→ updateScore).
   * 파괴 이펙트만 좌표로 담아 drainZapFx 가 프레임마다 나눠 그린다.
   * pulseMaxMs = 방전이 쓴 **한 프레임** 처리 시간의 최댓값 (지우기 프레임 · 이펙트 프레임 각각)
   */
  private pulse(api: GameSceneAPI): void {
    if (this.shieldCount < SENTINEL_PARAMS.maxShields) return;
    const t0 = performance.now();
    const cx = api.player.x;
    const cy = api.player.y;
    const r2 = SENTINEL_PARAMS.pulseRadius * SENTINEL_PARAMS.pulseRadius;
    const found: { p: PoolablePoopBase; d2: number }[] = [];
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active) continue;
      const d2 = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d2 <= r2) found.push({ p, d2 });
    }
    found.sort((a, b) => a.d2 - b.d2);
    const camH = api.scene.cameras.main.height;
    for (const { p } of found) {
      // 파괴 이펙트는 recycle() 이 그리는 조건(화면 안)과 같을 때만 좌표로 담는다 — 그리기는 drainZapFx 가 나눠서
      if (p.y >= -POOP_CONFIG.destroyOffset && p.y <= camH) this.zapFxQueue.push({ x: p.x, y: p.y });
      p.recycle(true);
    }
    const n = found.length;
    if (n > 0) {
      const bonus = n * SENTINEL_PARAMS.pulsePointsPerPoop;
      this.pulseKills += n;
      if (bonus > 0) {
        api.addAbilityBonus(bonus);
        this.showZapBonusText(api, bonus);
      }
    }
    this.pulsesFired++;
    this.playPulseEffect(api, cx, cy);
    this.pulseMaxMs = Math.max(this.pulseMaxMs, performance.now() - t0);
  }

  /** 방전 파괴 이펙트를 이번 프레임 몫(PULSE_FX_PER_FRAME)만 그린다 — 좌표만 쓰므로 똥 · 점수와 무관 */
  private drainZapFx(api: GameSceneAPI): void {
    if (this.zapFxQueue.length === 0) return;
    const t0 = performance.now();
    for (let i = 0; i < SentinelAbility.PULSE_FX_PER_FRAME && this.zapFxQueue.length > 0; i++) {
      const { x, y } = this.zapFxQueue.shift()!;
      playFx(api.scene, 'impactHit', x, y);
    }
    this.pulseMaxMs = Math.max(this.pulseMaxMs, performance.now() - t0);
  }

  override onHitPoop(api: GameSceneAPI): boolean {
    if (this.shieldCount > 0) {
      this.shieldCount--;
      this.scatterDroplets(api, 1);
      this.playShieldBreakEffect(api);
      this.zapNearbyPoops(api, SENTINEL_PARAMS.blockZapRadius, SENTINEL_PARAMS.blockZapPoints);
      return true;
    }
    return false;
  }

  override onUpdate(api: GameSceneAPI): void {
    // 측정용 시간 — 프레임 delta × scene.time.timeScale. scene.time.now 는 timeScale 과 무관하게 흘러서
    // (Clock.update 가 now 를 먼저 갱신하고 배율은 TimerEvent 에만 건다) 히트스톱(timeScale 0) 구간이 섞였다 (묶음 리뷰 2번).
    // 이제 충전 · 방전 타이머와 같은 시계로 잰다 — 히트스톱 · 시계 일시정지 동안은 안 흐른다
    const clock = api.scene.time;
    const dt = clock.paused ? 0 : api.scene.game.loop.delta * clock.timeScale;
    const full = this.shieldCount >= SENTINEL_PARAMS.maxShields;
    this.aliveMs += dt;
    if (full) this.fullMs += dt;
    this.shieldMs[Math.min(this.shieldCount, SENTINEL_PARAMS.maxShields)] += dt;
    this.drainZapFx(api);
    this.updateFullIndicator(api, full);

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
    this.chargeTimer?.remove();
    this.chargeTimer = null;
    this.pulseTimer?.remove();
    this.pulseTimer = null;
    this.zapFxQueue = [];
    for (const o of [this.fullRing, this.fullHalo, this.pulseFlash, this.teleRing, this.shockRing]) {
      if (!o) continue;
      o.scene?.tweens.killTweensOf(o);
      o.destroy();
    }
    this.fullRing = null;
    this.fullHalo = null;
    this.pulseFlash = null;
    this.teleRing = null;
    this.shockRing = null;
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

  /** hot: 가득 찬 동안 — 하이라이트 대신 가운데 흰 심지 (달아오름) */
  private drawDroplet(g: Phaser.GameObjects.Graphics, hot = this.dropletsHot): void {
    g.clear();
    g.fillStyle(SentinelAbility.RED, hot ? 0.3 : 0.22);
    g.fillCircle(0, 0, 15);
    g.fillStyle(SentinelAbility.RED, 0.4);
    g.fillCircle(0, 0, 10);
    g.fillStyle(SentinelAbility.RED, 0.95);
    g.fillCircle(0, 0, 7);
    if (hot) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(0, 0, 3.5);
    } else {
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(-2, -2.5, 2.5);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 방전 연출 — 가득 참 표시 · 범위 예고 · 충격파
  // ─────────────────────────────────────────────────────────────

  /** 판 시작에 한 번 — 텍스처를 굽고 재사용할 오브젝트를 숨긴 채 만든다 */
  private createPulseVisuals(scene: Phaser.Scene): void {
    SentinelAbility.bakeTextures(scene);

    // 허리 고리 — 진홍 띠 + 흰 심지 (하드 엣지). 한 번 그리고 위치 · 보임만 바꾼다
    this.fullRing = scene.add.graphics().setDepth(100).setVisible(false);
    this.fullRing.lineStyle(4, 0xc4101f, 1).strokeEllipse(0, 0, 64, 18);
    this.fullRing.lineStyle(1.5, 0xfff3f3, 1).strokeEllipse(0, 0, 64, 18);

    const glowScale = 96 / SentinelAbility.GLOW_TEX;
    this.fullHalo = scene.add.image(0, 0, SentinelAbility.GLOW_KEY).setDepth(88).setScale(glowScale).setVisible(false);
    this.pulseFlash = scene.add.image(0, 0, SentinelAbility.GLOW_KEY).setDepth(88).setVisible(false);
    this.teleRing = scene.add.image(0, 0, SentinelAbility.RING_KEY).setDepth(90).setVisible(false);
    this.shockRing = scene.add.image(0, 0, SentinelAbility.RING_KEY).setDepth(150).setVisible(false);
  }

  /**
   * 텍스처 두 장 — 키가 있으면 건너뛴다 (다시 하기). 배율 1 에서 고리 반지름 = pulseRadius.
   * 고리: 안쪽 여운(부드럽게) → 겹친 발광 획 → 밝은 하늘 대비용 어두운 얇은 테 → 진홍 하드 띠 + 흰 심지
   *       → 띠를 따라 기는 전기 (원주 방향으로만 꺾인다 — 바깥으로 뻗는 줄기 없음)
   */
  private static bakeTextures(scene: Phaser.Scene): void {
    const R = Math.round(SENTINEL_PARAMS.pulseRadius);
    if (!scene.textures.exists(SentinelAbility.RING_KEY)) {
      const n = (R + SentinelAbility.RING_PAD) * 2;
      const tex = scene.textures.createCanvas(SentinelAbility.RING_KEY, n, n);
      if (tex) {
        const ctx = tex.getContext();
        const c = n / 2;
        const circle = (r: number) => { ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); };
        const wake = ctx.createRadialGradient(c, c, 0, c, c, R - 3);
        wake.addColorStop(0, 'rgba(255,60,80,0)');
        wake.addColorStop(0.55, 'rgba(255,60,80,0)');
        wake.addColorStop(0.9, 'rgba(255,60,80,0.10)');
        wake.addColorStop(1, 'rgba(255,60,80,0.22)');
        ctx.fillStyle = wake;
        circle(R - 3);
        ctx.fill();
        for (const [lw, a] of [[30, 0.06], [20, 0.09], [12, 0.14]] as const) {
          ctx.strokeStyle = `rgba(255,74,90,${a})`;
          ctx.lineWidth = lw;
          circle(R);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(80,8,24,0.6)';
        ctx.lineWidth = 2;
        circle(R + 4.5);
        ctx.stroke();
        ctx.strokeStyle = '#e8202e';
        ctx.lineWidth = 6;
        circle(R);
        ctx.stroke();
        ctx.strokeStyle = '#fff3f3';
        ctx.lineWidth = 2.5;
        circle(R);
        ctx.stroke();
        // 전기 — 고정 시드라 판마다 같은 모양 (한 번 굽는 텍스처)
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        ctx.lineJoin = 'miter';
        for (let k = 0; k < 9; k++) {
          const a0 = (k / 9) * Math.PI * 2 + rnd() * 0.4;
          const span = 0.22 + rnd() * 0.18;
          const segs = 6;
          const pts: [number, number][] = [];
          for (let s = 0; s <= segs; s++) {
            const a = a0 + (span * s) / segs;
            const rr = R + (s === 0 || s === segs ? 0 : (rnd() - 0.5) * 12);
            pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
          }
          for (const [col, lw] of [['#c4101f', 3.5], ['#ffffff', 1.4]] as const) {
            ctx.strokeStyle = col;
            ctx.lineWidth = lw;
            ctx.beginPath();
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
        }
        tex.refresh();
      }
    }
    if (!scene.textures.exists(SentinelAbility.GLOW_KEY)) {
      const n = SentinelAbility.GLOW_TEX;
      const tex = scene.textures.createCanvas(SentinelAbility.GLOW_KEY, n, n);
      if (tex) {
        const ctx = tex.getContext();
        const c = n / 2;
        const g = ctx.createRadialGradient(c, c, 0, c, c, c);
        g.addColorStop(0, 'rgba(255,240,240,0.9)');
        g.addColorStop(0.18, 'rgba(255,90,100,0.55)');
        g.addColorStop(0.5, 'rgba(255,60,80,0.18)');
        g.addColorStop(1, 'rgba(255,60,80,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, n, n);
        tex.refresh();
      }
    }
  }

  /**
   * 매 프레임 — 가득 찬 동안의 표시. 다음 방전까지 남은 시간으로 후광을 짙게 하고, 마지막 PULSE_TELE_MS 동안 범위 예고 고리.
   * 오브젝트를 만들지 않는다 (위치 · 알파 · 보임만)
   */
  private updateFullIndicator(api: GameSceneAPI, full: boolean): void {
    if (full !== this.dropletsHot) {
      this.dropletsHot = full;
      this.orbitDroplets.forEach(d => d.active && this.drawDroplet(d, full));
    }
    const x = api.player.x;
    const y = api.player.y;
    this.fullRing?.setVisible(full).setPosition(x, y + SentinelAbility.ORBIT_WAIST_Y);
    const halo = this.fullHalo;
    const tele = this.teleRing;
    if (!full) {
      halo?.setVisible(false);
      tele?.setVisible(false);
      return;
    }
    const delay = SENTINEL_PARAMS.pulseIntervalSec * 1000;
    const remain = this.pulseTimer ? this.pulseTimer.getRemaining() : delay;
    const near = 1 - Phaser.Math.Clamp(remain / delay, 0, 1);   // 0 = 방금 방전 · 1 = 곧 방전
    if (halo) {
      const beat = 0.5 + 0.5 * Math.sin(api.scene.time.now * (0.006 + 0.012 * near));
      halo.setVisible(true).setPosition(x, y + SentinelAbility.ORBIT_WAIST_Y).setAlpha(0.18 + 0.3 * near + 0.12 * beat);
    }
    if (tele) {
      const tm = SentinelAbility.PULSE_TELE_MS;
      if (remain <= tm) {
        const k = 1 - remain / tm;
        tele.setVisible(true).setPosition(x, y).setScale(1.06 - 0.06 * k).setAlpha(0.32 * k);
      } else {
        tele.setVisible(false);
      }
    }
  }

  /** 방전 한 번 — 섬광 + 충격파 고리가 몸에서 반경까지 퍼져 잠깐 머문다. 재사용 Image 두 장에 트윈만 건다 */
  private playPulseEffect(api: GameSceneAPI, cx: number, cy: number): void {
    const scene = api.scene;
    this.teleRing?.setVisible(false);

    const flash = this.pulseFlash;
    if (flash) {
      scene.tweens.killTweensOf(flash);
      const s0 = 70 / SentinelAbility.GLOW_TEX;
      flash.setVisible(true).setPosition(cx, cy).setScale(s0).setAlpha(0.95);
      scene.tweens.add({
        targets: flash, scale: s0 * 2.4, alpha: 0, duration: 160, ease: 'Quad.easeOut',
        onComplete: () => flash.setVisible(false),
      });
    }

    const ring = this.shockRing;
    if (ring) {
      scene.tweens.killTweensOf(ring);
      ring.setVisible(true).setPosition(cx, cy).setScale(0.12).setAlpha(1);
      scene.tweens.chain({
        targets: ring,
        tweens: [
          { scale: 1, duration: SentinelAbility.SHOCK_GROW_MS, ease: 'Expo.easeOut' },
          { alpha: 0, scale: 1.03, duration: SentinelAbility.SHOCK_FADE_MS, delay: SentinelAbility.SHOCK_HOLD_MS, ease: 'Quad.easeIn' },
        ],
        onComplete: () => ring.setVisible(false),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 파장 범위 내 똥 제거
  // ─────────────────────────────────────────────────────────────

  /** 반경 안 일반 똥을 지우고 개당 pointsPerPoop 점 — 막기 · 방전 펄스가 같이 쓴다. 지운 개수를 돌려준다 */
  private zapNearbyPoops(api: GameSceneAPI, radius: number, pointsPerPoop: number): number {
    const cx = api.player.x;
    const cy = api.player.y;
    const r2 = radius * radius;

    const targets = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active && (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r2);

    if (targets.length === 0) return 0;

    const positions = targets.map(p => ({ x: p.x, y: p.y }));
    targets.forEach(p => (p as PoolablePoopBase).recycle());

    // 점수 (막기 0 · 방전 40) — 0 이면 점수도 '+0' 글자도 없다. 똥은 그대로 지운다
    const bonus = targets.length * pointsPerPoop;
    if (bonus > 0) {
      api.addAbilityBonus(bonus);
      this.showZapBonusText(api, bonus);
    }

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
    return targets.length;
  }

  // ─────────────────────────────────────────────────────────────
  // 이펙트
  // ─────────────────────────────────────────────────────────────

  private showZapBonusText(api: GameSceneAPI, bonus: number): void {
    const scene = api.scene;
    const txt = scene.add.text(api.player.x, api.player.y - 40, `+${bonus}`, {
      fontSize: '20px',
      fontFamily: 'Arial Black, sans-serif',
      color: '#ff6666',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);

    scene.tweens.add({
      targets: txt,
      y: txt.y - 50,
      alpha: 0,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

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
