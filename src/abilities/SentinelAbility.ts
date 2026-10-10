import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { SENTINEL_PARAMS, SENTINEL_DEFERRED_SHEETS } from '../config/abilityParams';
import { POOP_CONFIG } from '../config/poop';
import { playFx, fxPickSheetKey, loadFxPickSheet } from '../utils/vfx';
import { StagedLoader } from './stagedLoader';

/**
 * 센티넬 (UR) — 보호막 + 과충전 방전 (2026-10 밸런스 개편, 값은 SENTINEL_PARAMS)
 * - 보호막: 시작 startShields 개. **게임 시간** chargeIntervalSec 마다 1개 충전 (최대 maxShields), 한 판 maxChargesPerRun 번까지.
 *   가득 찬 상태의 주기는 충전도 상한 카운트도 쓰지 않는다. 막으면 주변 똥을 지우되 점수는 blockZapPoints (0)
 * - 방전: 보호막이 가득 찼을 때만 pulseIntervalSec 마다 반경 pulseRadius 안 일반 똥을 지우고 개당 pulsePointsPerPoop.
 *   안 맞을수록 점수 — 예전(막을수록 점수 · 점수로 충전)의 고리를 뒤집었다
 * - 각성 단계별 값은 구현돼 있지 않다 (SENTINEL_PARAMS 하나)
 * - UI: 붉은 공이 허리 주변 수평 궤도 공전 + 전기 파지직 (재사용 Graphics)
 * - 방전 연출 (fx, v2 C 「방패 돔 붕괴」 — 시트 SENTINEL_DEFERRED_SHEETS, 주문서 ddong-fx-work/sentinel-pulse/v2/sheet_spec_C.md):
 *   가득 찬 동안 — 작은 육각 방패 돔이 몸을 덮고(4칸 반복), 공이 흰 심지로 달아오른다.
 *   방전 WARN1_MS 전 — 돔 칸이 전부 켜짐, WARN2_MS 전 — 금이 감.
 *   방전 — 큰 돔이 작은 돔 크기에서 반경 pulseRadius 까지 GROW_MS 에 부풀고 HOLD_MS 머문 뒤 깨짐 5칸 + 파편 풀.
 *   바퀴살 빛줄기 없음 · 블렌드는 전부 normal (발광은 시트에 구웠다). 시트는 판 시작 뒤 StagedLoader 로 한 장씩.
 *   오브젝트는 판 시작에 한 번: Sprite 2 (작은 돔 · 큰 돔) · 파편 Image SHARD_COUNT — 방전 1회가 새로 만드는 것은
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
  /** 보유 중 초당 보너스 타이머 (v6 B⁗) — 같은 규칙: scene.time 1초 루프(히트스톱 · 일시정지와 같이 멈춤), onCreate 에서 걸고 onDestroy 에서 뗀다 */
  private holdTimer: Phaser.Time.TimerEvent | null = null;
  /** 초당 보너스 표시 — 작은 '+N' 하나를 만들어 두고 매초 글자 · 위치만 바꿔 깜빡인다 (매초 생성 없음) */
  private holdText: Phaser.GameObjects.Text | null = null;
  private holdTween: Phaser.Tweens.Tween | null = null;
  /**
   * 측정용 누계 (밸런스 하네스가 읽는다 — 화면 · 저장에는 안 쓴다):
   * 방전 횟수 · 방전으로 지운 똥 · 방전이 쓴 한 프레임 처리 시간(ms) 최댓값 · 판 시간(게임 시계 — 히트스톱 제외) · 가득 찬 시간 · 보호막 개수별(0~maxShields) 머문 시간
   */
  pulsesFired = 0;
  pulseKills = 0;
  /** 측정용 — 약한 방전(보호막 1개 이상 · 가득 아님) 횟수 · 지운 똥. 위 pulsesFired · pulseKills 는 가득 방전만 센다 (v6 B″) */
  weakPulsesFired = 0;
  weakPulseKills = 0;
  /** 측정용 — 초당 보너스 지급 횟수 · 그 점수 합 (v6 B⁗) */
  holdTicks = 0;
  holdPoints = 0;
  /** performance.now 로 잰다 — 실시간 판에서만 뜻이 있다 (빨리 감기 하네스는 performance.now 가 가상 시계라 늘 0) */
  pulseMaxMs = 0;
  /** 측정용 — 자리가 끝내 안 나서 그리지 못하고 버린 방전 파괴 이펙트 수 (판 도중에만 센다 — 게임오버 때 남은 큐는 onDestroy 가 세지 않고 버린다) */
  pulseFxDropped = 0;
  aliveMs = 0;
  fullMs = 0;
  shieldMs: number[] = [];
  /** 방패 돔 — 작은 돔(가득 찬 동안) · 큰 돔(방전) · 파편 풀. 시트가 올라오면 onSheetLoaded 가 만든다 */
  private smallDome: Phaser.GameObjects.Sprite | null = null;
  private bigDome: Phaser.GameObjects.Sprite | null = null;
  private shards: Phaser.GameObjects.Image[] = [];
  private domeLoader: StagedLoader | null = null;
  /**
   * 방전 뒤 작은 돔을 숨겨 두는 동안 true — 씬 시계 타이머(domeBackTimer)가 DOME_BACK_MS 뒤 푼다.
   * scene.time.now 로 재면 히트스톱 · 일시정지(timeScale)와 어긋난다 (now 는 배율과 무관하게 흐른다)
   */
  private domeHidden = false;
  private domeBackTimer: Phaser.Time.TimerEvent | null = null;
  /** 큰 돔이 반경에 머무는 HOLD_MS 타이머 — 들고 있다가 다음 방전 · onDestroy 에서 뗀다 (0ab5f2a8 리뷰 2) */
  private domeHoldTimer: Phaser.Time.TimerEvent | null = null;
  /** 공을 달아오른 모습으로 그렸는지 — 가득 참이 바뀐 프레임에만 다시 그린다 */
  private dropletsHot = false;
  /** 방전으로 지운 자리 (거리순, 좌표 · 지운 시각만) — 파괴 이펙트를 프레임당 PULSE_FX_PER_FRAME 개씩 그린다. 게임 동작과 무관 */
  private zapFxQueue: { x: number; y: number; t: number }[] = [];
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
  /**
   * 파괴 이펙트를 기다려 주는 최대 시간 (ms). impactHit 은 동시 6개 상한이라(약 600ms 재생) 대상이 많으면 자리가 날 때까지
   * 대기열에 남긴다 — 그래도 이만큼 지나면 지운 순간과 너무 벌어져 버린다
   */
  private static readonly PULSE_FX_MAX_WAIT_MS = 900;
  /** 예고 — 방전 전 ms: 칸이 전부 켜짐(작은 돔 f4) · 금이 감(f5) */
  private static readonly WARN1_MS = 450;
  private static readonly WARN2_MS = 200;
  /** 큰 돔: 부풀기 · 반경에 머물기 (그 뒤 깨짐 5칸 30fps ≈ 167ms) · 작은 돔이 다시 나타나는 시각 (방전 기준 ms) */
  private static readonly GROW_MS = 170;
  private static readonly HOLD_MS = 30;
  private static readonly DOME_BACK_MS = 600;
  /** 파편 풀 크기(동시 상한) · 떨어지는 시간 */
  private static readonly SHARD_COUNT = 12;
  private static readonly SHARD_MS = 450;
  /** 시트 나눠 올리기 — 판 시작 뒤 첫 장까지 · 장 사이 (ms). 첫 방전은 가득 찬 뒤라 그 전에 다 올라온다 */
  private static readonly SHEET_START_MS = 600;
  private static readonly SHEET_GAP_MS = 250;
  /**
   * 시트 기하 (ddong-fx-work/sentinel-pulse/v2/proc_sheets.py 가 맞춘 값) — 원 중심 = 칸 안 (ox, oy) 비율,
   * 텍스처 반지름 r, 밑변은 원 중심 아래 base px. 표시: 작은 돔 반지름 72px (발밑에서 머리 위까지),
   * 큰 돔 반지름 = pulseRadius. 둘 다 밑변을 발밑(플레이어 중심 + 38)에 둔다 → dy = 38 − base × 배율
   */
  private static readonly DOME = {
    small: { key: fxPickSheetKey('sentinel_dome_220x144.png'), idleAnim: 'sentinel_dome_idle', ox: 110 / 220, oy: 108 / 144, r: 100, scale: 0.72, alpha: 0.9, dy: 38 - 33 * 0.72 },
    big: { key: fxPickSheetKey('sentinel_domebreak_480x263.png'), breakAnim: 'sentinel_dome_break', ox: 240 / 480, oy: 240 / 263, r: 200, scale: SENTINEL_PARAMS.pulseRadius / 200, alpha: 0.85, dy: 38 - 20 * (SENTINEL_PARAMS.pulseRadius / 200) },
    shard: { key: fxPickSheetKey('sentinel_shard_48x48.png') },
  } as const;

  override onCreate(api: GameSceneAPI): void {
    // 판마다 새 인스턴스지만(getCharacterAbility) 상태는 여기서 명시적으로 처음으로 (규칙 1)
    this.shieldCount = SENTINEL_PARAMS.startShields;
    this.chargesGiven = 0;
    this.pulsesFired = 0;
    this.pulseKills = 0;
    this.weakPulsesFired = 0;
    this.weakPulseKills = 0;
    this.holdTicks = 0;
    this.holdPoints = 0;
    this.holdTween = null;
    this.pulseMaxMs = 0;
    this.pulseFxDropped = 0;
    this.aliveMs = 0;
    this.fullMs = 0;
    this.shieldMs = new Array(SENTINEL_PARAMS.maxShields + 1).fill(0);
    this.dropletsHot = false;
    this.zapFxQueue = [];
    this.domeHidden = false;
    this.domeBackTimer = null;
    this.domeHoldTimer = null;
    this.createPulseVisuals(api.scene);
    // 판당 충전이 0 이면 타이머 자체를 걸지 않는다 (v6 B‴) — 시작 보호막만 쓴다
    this.chargeTimer = SENTINEL_PARAMS.maxChargesPerRun > 0
      ? api.scene.time.addEvent({ delay: SENTINEL_PARAMS.chargeIntervalSec * 1000, loop: true, callback: () => this.tryCharge(api) })
      : null;
    this.pulseTimer = api.scene.time.addEvent({
      delay: SENTINEL_PARAMS.pulseIntervalSec * 1000, loop: true, callback: () => this.pulse(api),
    });
    this.holdTimer = api.scene.time.addEvent({ delay: 1000, loop: true, callback: () => this.holdBonusTick(api) });
    this.holdText = api.scene.add.text(0, 0, '', {
      fontSize: '13px', fontFamily: 'Arial Black, sans-serif', color: '#ffd0d0', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(199).setAlpha(0);
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
   * 과충전 방전 — 보호막이 가득 찼으면 센 방전(pulseRadius · pulsePointsPerPoop),
   * 가득은 아니지만 1개 이상이면 약한 방전(weakPulseRadius · weakPulsePointsPerPoop, v6 B″).
   * 보호막 0 이면 그 주기는 건너뛴다 (횟수에도 안 넣는다). 둘 다 같은 규칙이다 —
   * 반경 안 일반 똥을 **이 프레임에** 전부 지우고(이펙트 없이) 점수를 한 번에 addAbilityBonus(→ updateScore).
   * 파괴 이펙트만 좌표로 담아 drainZapFx 가 프레임마다 나눠 그린다.
   * pulseMaxMs = 방전이 쓴 **한 프레임** 처리 시간의 최댓값 (지우기 프레임 · 이펙트 프레임 각각)
   */
  private pulse(api: GameSceneAPI): void {
    if (this.shieldCount <= 0) return;
    const full = this.shieldCount >= SENTINEL_PARAMS.maxShields;
    const radius = full ? SENTINEL_PARAMS.pulseRadius : SENTINEL_PARAMS.weakPulseRadius;
    const perPoop = full ? SENTINEL_PARAMS.pulsePointsPerPoop : SENTINEL_PARAMS.weakPulsePointsPerPoop;
    const t0 = performance.now();
    const cx = api.player.x;
    const cy = api.player.y;
    const r2 = radius * radius;
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
      if (p.y >= -POOP_CONFIG.destroyOffset && p.y <= camH) this.zapFxQueue.push({ x: p.x, y: p.y, t: api.scene.time.now });
      p.recycle(true);
    }
    const n = found.length;
    if (n > 0) {
      const bonus = n * perPoop;
      if (full) this.pulseKills += n; else this.weakPulseKills += n;
      if (bonus > 0) {
        api.addAbilityBonus(bonus);
        this.showZapBonusText(api, bonus);
      }
    }
    if (full) this.pulsesFired++; else this.weakPulsesFired++;
    this.playPulseEffect(api, cx, cy, radius);
    this.pulseMaxMs = Math.max(this.pulseMaxMs, performance.now() - t0);
  }

  /**
   * 보유 중 초당 보너스 (v6 B⁗) — 지금 보호막 개수로 고른 점수를 awardBonus(→ addAbilityBonus → updateScore) 로 한 번.
   * 표시는 미리 만든 작은 글자 하나를 플레이어 오른쪽 위에 잠깐 띄운다
   */
  private holdBonusTick(api: GameSceneAPI): void {
    const table = SENTINEL_PARAMS.holdBonusPerSec;
    const amount = table[Math.min(this.shieldCount, table.length - 1)];
    if (amount <= 0) return;
    this.awardBonus(api, amount);
    this.holdTicks++;
    this.holdPoints += amount;
    const txt = this.holdText;
    if (!txt?.active) return;
    this.holdTween?.stop();
    txt.setText(`+${amount}`).setPosition(api.player.x + 24, api.player.y - 44).setAlpha(1);
    this.holdTween = api.scene.tweens.add({ targets: txt, alpha: 0, y: txt.y - 10, delay: 250, duration: 400, ease: 'Quad.easeIn' });
  }

  /**
   * 방전 파괴 이펙트를 이번 프레임 몫(PULSE_FX_PER_FRAME)만 그린다 — 좌표만 쓰므로 똥 · 점수와 무관.
   * impactHit 동시 상한에 걸리면(playFx 가 null) 그 좌표는 버리지 않고 다음 프레임에 다시 — 대상이 많아도 연출이 빠지지 않게.
   * 지운 지 PULSE_FX_MAX_WAIT_MS 가 지난 좌표만 버린다
   */
  private drainZapFx(api: GameSceneAPI): void {
    if (this.zapFxQueue.length === 0) return;
    const t0 = performance.now();
    const now = api.scene.time.now;
    while (this.zapFxQueue.length > 0 && now - this.zapFxQueue[0].t > SentinelAbility.PULSE_FX_MAX_WAIT_MS) { this.zapFxQueue.shift(); this.pulseFxDropped++; }
    for (let i = 0; i < SentinelAbility.PULSE_FX_PER_FRAME && this.zapFxQueue.length > 0; i++) {
      const { x, y } = this.zapFxQueue[0];
      if (!playFx(api.scene, 'impactHit', x, y)) break;   // 상한 — 자리가 날 때까지 남겨 둔다
      this.zapFxQueue.shift();
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
    this.domeLoader?.step();
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
    this.holdTimer?.remove();
    this.holdTimer = null;
    this.holdTween?.stop();
    this.holdTween = null;
    this.holdText?.destroy();
    this.holdText = null;
    this.pulseTimer?.remove();
    this.pulseTimer = null;
    this.zapFxQueue = [];
    this.domeLoader?.stop();
    this.domeLoader = null;
    this.domeBackTimer?.remove();
    this.domeBackTimer = null;
    this.domeHoldTimer?.remove();
    this.domeHoldTimer = null;
    for (const o of [this.smallDome, this.bigDome, ...this.shards]) {
      if (!o) continue;
      o.scene?.tweens.killTweensOf(o);
      o.destroy();
    }
    this.smallDome = null;
    this.bigDome = null;
    this.shards = [];
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
  // 방전 연출 — 방패 돔 (v2 C) : 가득 찬 동안 작은 돔 · 예고 · 부풀어 깨짐 · 파편
  // ─────────────────────────────────────────────────────────────

  /**
   * 판 시작에 한 번 — 시트 3장을 StagedLoader 로 한 장씩 올리고(판 시작 한 프레임에 몰지 않게),
   * 올라오는 대로 재사용할 Sprite 2장 · 파편 Image 풀을 숨긴 채 만든다. 시트가 아직 없으면 그 연출만 건너뛴다
   */
  private createPulseVisuals(scene: Phaser.Scene): void {
    this.domeLoader?.stop();
    this.domeLoader = new StagedLoader(
      scene,
      SENTINEL_DEFERRED_SHEETS.map(f => ({ key: fxPickSheetKey(f), enqueue: (sc: Phaser.Scene) => loadFxPickSheet(sc, f) })),
      SentinelAbility.SHEET_GAP_MS, SentinelAbility.SHEET_START_MS,
      key => this.onSheetLoaded(scene, key),
    );
    // 다시 하기 — 이미 올라와 있는 시트는 로더가 건너뛰므로 여기서 바로 만든다
    for (const f of SENTINEL_DEFERRED_SHEETS) this.onSheetLoaded(scene, fxPickSheetKey(f));
  }

  /** 시트 한 장이 올라왔다 — 애니메이션을 등록하고 그 시트를 쓰는 오브젝트를 만든다 (이미 있으면 건너뛴다) */
  private onSheetLoaded(scene: Phaser.Scene, key: string): void {
    if (!scene.textures.exists(key)) return;
    const D = SentinelAbility.DOME;
    if (key === D.small.key) {
      if (!scene.anims.exists(D.small.idleAnim)) {
        scene.anims.create({ key: D.small.idleAnim, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
      }
      this.smallDome ??= scene.add.sprite(0, 0, key, 0).setOrigin(D.small.ox, D.small.oy).setScale(D.small.scale).setDepth(95).setVisible(false);
    } else if (key === D.big.key) {
      if (!scene.anims.exists(D.big.breakAnim)) {
        scene.anims.create({ key: D.big.breakAnim, frames: scene.anims.generateFrameNumbers(key, { start: 1, end: 5 }), frameRate: 30, repeat: 0 });
      }
      this.bigDome ??= scene.add.sprite(0, 0, key, 0).setOrigin(D.big.ox, D.big.oy).setDepth(150).setVisible(false);
    } else if (key === D.shard.key && this.shards.length === 0) {
      for (let i = 0; i < SentinelAbility.SHARD_COUNT; i++) this.shards.push(scene.add.image(0, 0, key, i % 4).setDepth(151).setVisible(false));
    }
  }

  /**
   * 매 프레임 — 가득 찬 동안 작은 돔을 발밑에 붙이고, 다음 방전까지 남은 시간으로 예고 칸을 고른다.
   * 오브젝트를 만들지 않는다 (위치 · 칸 · 보임만)
   */
  private updateFullIndicator(api: GameSceneAPI, full: boolean): void {
    if (full !== this.dropletsHot) {
      this.dropletsHot = full;
      this.orbitDroplets.forEach(d => d.active && this.drawDroplet(d, full));
    }
    const dome = this.smallDome;
    if (!dome) return;
    const D = SentinelAbility.DOME;
    // 가득이 아니거나 방전 직후(큰 돔이 깨지는 동안) — 숨긴다
    if (!full || this.domeHidden) {
      if (dome.visible && !full) { api.scene.tweens.killTweensOf(dome); dome.anims.stop(); dome.setVisible(false); }
      return;
    }
    dome.setPosition(api.player.x, api.player.y + D.small.dy);
    if (!dome.visible) { dome.setVisible(true).setAlpha(0); api.scene.tweens.add({ targets: dome, alpha: D.small.alpha, duration: 200 }); }
    const delay = SENTINEL_PARAMS.pulseIntervalSec * 1000;
    const remain = this.pulseTimer ? this.pulseTimer.getRemaining() : delay;
    const want = remain <= SentinelAbility.WARN2_MS ? 5 : remain <= SentinelAbility.WARN1_MS ? 4 : -1;
    if (want >= 0) {
      if (dome.anims.isPlaying || Number(dome.frame.name) !== want) { dome.anims.stop(); dome.setFrame(want); }
    } else if (!dome.anims.isPlaying) {
      dome.play(D.small.idleAnim);
    }
  }

  /**
   * 방전 한 번 — 작은 돔을 숨기고 큰 돔을 작은 돔 크기에서 반경까지 부풀렸다(GROW) 잠깐 머물고(HOLD) 깨짐 5칸을 재생한다.
   * 깨지는 순간 파편 풀을 돔 위쪽 테두리에서 흩뿌린다. 재사용 Sprite 2 · Image 풀에 트윈만 건다
   */
  /**
   * 큰 돔이 반경 radius 까지 부풀었다 깨진다. 약한 방전은 같은 시트 · 같은 동작을 반경 비율로 줄여 쓴다 (새 그림 없음, v6 B″)
   */
  private playPulseEffect(api: GameSceneAPI, cx: number, _cy: number, radius: number): void {
    const scene = api.scene;
    const D = SentinelAbility.DOME;
    const scale = radius / D.big.r;
    const big = this.bigDome;
    this.domeHidden = true;
    this.domeBackTimer?.remove();
    this.domeBackTimer = scene.time.delayedCall(SentinelAbility.DOME_BACK_MS, () => { this.domeHidden = false; this.domeBackTimer = null; });
    if (this.smallDome) { scene.tweens.killTweensOf(this.smallDome); this.smallDome.anims.stop(); this.smallDome.setVisible(false); }
    if (!big) return;   // 시트가 아직 안 올라옴 — 게임 동작(지우기 · 점수)은 이미 끝났다
    const x = cx, y = api.player.y + 38 - 20 * scale;   // DOME.big.dy 와 같은 식 — 반경에 따라 바닥선을 맞춘다
    scene.tweens.killTweensOf(big);
    this.domeHoldTimer?.remove();
    this.domeHoldTimer = null;
    big.anims.stop();
    big.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    big.setFrame(0).setPosition(x, y).setAlpha(D.big.alpha).setVisible(true).setScale(D.small.scale * D.small.r / D.big.r);
    scene.tweens.add({
      targets: big, scale, duration: SentinelAbility.GROW_MS, ease: 'Expo.easeOut',
      onComplete: () => {
        // 반경에 HOLD_MS 머문다 — 범위가 읽히는 순간. 시계는 씬 시계(히트스톱 · 일시정지와 같이 멈춤)
        this.domeHoldTimer = scene.time.delayedCall(SentinelAbility.HOLD_MS, () => {
          this.domeHoldTimer = null;
          if (!big.active || !big.visible) return;
          big.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => big.setVisible(false));
          big.play(D.big.breakAnim);
          this.throwShards(scene, x, y, radius);
        });
      },
    });
  }

  /** 파편 — 돔 위쪽 테두리(반경 pulseRadius)에서 바깥으로 조금 밀리며 떨어진다. 풀을 돌려 쓴다 (동시 SHARD_COUNT) */
  private throwShards(scene: Phaser.Scene, x: number, y: number, R: number): void {
    const n = this.shards.length;
    this.shards.forEach((s, i) => {
      scene.tweens.killTweensOf(s);
      const a = Math.PI + ((i + 0.5) / n) * Math.PI + Phaser.Math.FloatBetween(-0.12, 0.12);
      const k = Phaser.Math.FloatBetween(0.82, 0.98);
      const sx = x + Math.cos(a) * R * k, sy = y + Math.sin(a) * R * k;
      s.setFrame(i % 4).setPosition(sx, sy).setScale(Phaser.Math.FloatBetween(0.5, 0.85))
        .setRotation(Phaser.Math.FloatBetween(0, 6.28)).setAlpha(1).setVisible(true);
      scene.tweens.add({ targets: s, x: sx + Math.cos(a) * Phaser.Math.FloatBetween(14, 34), duration: SentinelAbility.SHARD_MS, ease: 'Quad.easeOut' });
      scene.tweens.add({
        targets: s, y: sy + Phaser.Math.FloatBetween(60, 120), rotation: s.rotation + Phaser.Math.FloatBetween(-2, 2), alpha: 0,
        duration: SentinelAbility.SHARD_MS, ease: 'Quad.easeIn', onComplete: () => s.setVisible(false),
      });
    });
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
