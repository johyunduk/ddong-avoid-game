import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { SENTINEL_PARAMS } from '../config/abilityParams';

/**
 * 센티넬 (UR) — 보호막 + 과충전 방전 (2026-10 밸런스 개편, 값은 SENTINEL_PARAMS)
 * - 보호막: 시작 startShields 개. **게임 시간** chargeIntervalSec 마다 1개 충전 (최대 maxShields), 한 판 maxChargesPerRun 번까지.
 *   가득 찬 상태의 주기는 충전도 상한 카운트도 쓰지 않는다. 막으면 주변 똥을 지우되 점수는 blockZapPoints (0)
 * - 방전: 보호막이 가득 찼을 때만 pulseIntervalSec 마다 반경 pulseRadius 안 일반 똥을 지우고 개당 pulsePointsPerPoop.
 *   안 맞을수록 점수 — 예전(막을수록 점수 · 점수로 충전)의 고리를 뒤집었다
 * - 각성 단계별 값은 구현돼 있지 않다 (SENTINEL_PARAMS 하나)
 * - UI: 붉은 공이 허리 주변 수평 궤도 공전 + 전기 파지직 (재사용 Graphics). 가득 찬 동안 허리에 하늘색 고리 — 최소 표시, 정식 연출은 fx
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
   * 방전 횟수 · 방전으로 지운 똥 · 방전 한 번 처리 시간(ms) 최댓값 · 판 시간 · 가득 찬 시간 · 보호막 개수별(0~maxShields) 머문 시간
   */
  pulsesFired = 0;
  pulseKills = 0;
  pulseMaxMs = 0;
  aliveMs = 0;
  fullMs = 0;
  shieldMs: number[] = [];
  private lastNow = 0;
  /** 가득 찬 동안 허리에 두르는 전기 고리 (최소 표시) — 한 장을 만들어 두고 위치 · 보임만 바꾼다 */
  private fullRing: Phaser.GameObjects.Graphics | null = null;
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
    // 판마다 새 인스턴스지만(getCharacterAbility) 상태는 여기서 명시적으로 처음으로 (규칙 1)
    this.shieldCount = SENTINEL_PARAMS.startShields;
    this.chargesGiven = 0;
    this.pulsesFired = 0;
    this.pulseKills = 0;
    this.pulseMaxMs = 0;
    this.aliveMs = 0;
    this.fullMs = 0;
    this.shieldMs = new Array(SENTINEL_PARAMS.maxShields + 1).fill(0);
    this.lastNow = api.scene.time.now;
    this.fullRing = api.scene.add.graphics().setDepth(100).setVisible(false);
    this.fullRing.lineStyle(2, 0x66e0ff, 0.9).strokeEllipse(0, 0, 64, 18);
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
   * 점수는 zapNearbyPoops 의 addAbilityBonus(→ updateScore)
   */
  private pulse(api: GameSceneAPI): void {
    if (this.shieldCount < SENTINEL_PARAMS.maxShields) return;
    const t0 = performance.now();
    const n = this.zapNearbyPoops(api, SENTINEL_PARAMS.pulseRadius, SENTINEL_PARAMS.pulsePointsPerPoop);
    this.pulsesFired++;
    this.pulseKills += n;
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
    // 측정용 시간 — scene.time 이라 히트스톱 · 일시정지 동안은 안 흐른다
    const now = api.scene.time.now;
    const dt = Math.max(0, now - this.lastNow);
    this.lastNow = now;
    const full = this.shieldCount >= SENTINEL_PARAMS.maxShields;
    this.aliveMs += dt;
    if (full) this.fullMs += dt;
    this.shieldMs[Math.min(this.shieldCount, SENTINEL_PARAMS.maxShields)] += dt;
    if (this.fullRing) this.fullRing.setVisible(full).setPosition(api.player.x, api.player.y + SentinelAbility.ORBIT_WAIST_Y);

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
    this.fullRing?.destroy();
    this.fullRing = null;
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
