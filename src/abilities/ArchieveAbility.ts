import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { ARCHIEVE_PARAMS, ARCHIEVE_DEFERRED_SHEETS } from '../config/abilityParams';
import { fxPickSheetKey, loadFxPickSheet } from '../utils/vfx';
import { StagedLoader } from './stagedLoader';

/**
 * 아카이브 (SR) — 점수 배율 1.1 (생존 틱만) + v9 「날려서 맞추기」 · 「거품 분수」. 값은 ARCHIEVE_PARAMS
 *
 * - 기본 「날려서 맞추기」: shotEverySec 마다 구슬(손)에서 방울 shotCount 발이 살짝 휜 궤적으로 날아간다. 겨냥은 반경 shotRadius 안
 *   가까운 화면 안 일반 똥의 **도착 시점 자리** (그 똥의 지금 낙하 속도로 앞질러 겨냥 — 쏘는 프레임에만 읽고 참조는 안 든다).
 *   날아가는 방울이 **아무 표시 없는 일반 똥**에 닿으면 그 프레임에 감싼다 — abilityTag = BUBBLE_BASE + 판 누계 번호
 *   (번호표에 씀) · passesThrough. 겨냥 자리를 지나도록 못 맞히면 그 방향 그대로 날아가 화면 밖에서 조용히 사라진다 (빗나감).
 *   감싼 똥은 초속 bubbleRise 로 떠올라 화면 위로 나가는 프레임에 회수 · 개당 bubblePoints
 * - 필살 「거품 분수」: 플레이 점수 fountainInterval 마다 (자기 보너스 제외 — awardBonus 가드). 모으기 fountainGatherSec (무적) →
 *   바닥 전체에서 크고 작은 거품이 fountainRiseSec 동안 화면 위까지 솟구친다. 솟는 앞줄이 지나간 화면 안 일반 똥을
 *   그 프레임에 감싼다 (상한 fountainMax · abilityTag = −발동 번호) → 빠르게 위로 · 화면 위에서 '퐁' 회수 · 개당 fountainPoints.
 *   다 끝나면 정액 fountainFlatPoints. 분수 거품은 장식 Sprite 풀 FOUNTAIN_POOL (성능 상한)
 * - 큰 방울은 시트 배율 1.0 을 넘기지 않는다 — 키우면 테가 같이 굵어져 덩어리로 보였다 (v9 시안 메모). 크기 섞임은 0.35 ~ 1.0
 * - 방울 · 번호표는 매 프레임 '지금 표시가 달린 똥' 기준으로 다시 깐다 (참조를 프레임 넘겨 들지 않는다)
 *
 * 성능 · 정리: 시트 2장은 판 시작 뒤 StagedLoader. 오브젝트는 판 시작에 한 번 — 날아가는 방울 SHOT_POOL · 감싼 방울 WRAP_POOL ·
 * 번호표 Image + Text TAG_POOL · 퐁 POP_POOL · 분수 거품 FOUNTAIN_POOL. 퐁 연출만 프레임당 FX_PER_FRAME. 블렌드 normal
 */
interface Shot { spr: Phaser.GameObjects.Sprite; x0: number; y0: number; x1: number; y1: number; bend: number; t: number; dur: number; vx: number; vy: number; trailAt: number; }

export class ArchieveAbility extends BaseAbility {
  private accum = 0;

  private gameMs = 0;
  private lastShotAt = 0;
  private bubbleSerial = 0;
  private shots: Shot[] = [];
  private popQueue: { x: number; y: number; t: number }[] = [];
  // ── 거품 분수 ──
  private fountainProgress = 0;
  private fountainPhase: 'idle' | 'gather' | 'rise' | 'drain' = 'idle';
  private fountainT = 0;
  private fountainSerial = 0;
  private fountainTaken = 0;

  private loader: StagedLoader | null = null;
  private shotPool: Phaser.GameObjects.Sprite[] = [];
  private wraps: Phaser.GameObjects.Sprite[] = [];
  private pops: Phaser.GameObjects.Sprite[] = [];
  private tags: Phaser.GameObjects.Image[] = [];
  private tagTexts: Phaser.GameObjects.Text[] = [];
  private foam: Phaser.GameObjects.Sprite[] = [];
  /** 발사 연출 — 구슬 반짝(방울이 부풀며 사라짐) 1 · 날아가는 방울 뒤 작은 방울 자국 TRAIL_POOL */
  private flash: Phaser.GameObjects.Sprite | null = null;
  private trail: Phaser.GameObjects.Sprite[] = [];
  private texts = new Set<Phaser.GameObjects.Text>();

  /** 측정용 (밸런스 하네스 — 화면 · 저장 X): 발사 · 맞힘 · 빗나감 · 분수 발동 · 분수로 담은 수 */
  shotsFired = 0;
  shotsHit = 0;
  shotsMissed = 0;
  fountainCasts = 0;
  fountainHeld = 0;

  private static readonly BUBBLE_BASE = 1000;
  private static readonly SHOT_POOL = 8;
  private static readonly WRAP_POOL = 36;
  private static readonly TAG_POOL = 8;
  private static readonly POP_POOL = 12;
  private static readonly FOUNTAIN_POOL = 44;
  private static readonly FX_PER_FRAME = 4;
  private static readonly POP_STALE_MS = 600;
  private static readonly HIT_R = 30;          // 날아가는 방울이 똥에 닿는 거리
  // 대표 '거품 4개 날리는 게 안 보인다' (v9-2): 방울을 키우고(0.75 → 1.0) 구슬 반짝 · 방울 자국을 더한다
  private static readonly SHOT_SCALE = 1.0;
  private static readonly TRAIL_POOL = 24;
  private static readonly TRAIL_EVERY_MS = 45;
  private static readonly HAND_DX = 16;        // 구슬(손) — 몸 가운데에서
  private static readonly HAND_DY = -18;
  private static readonly K = {
    bubble: fxPickSheetKey(ARCHIEVE_DEFERRED_SHEETS[0]),
    tag: fxPickSheetKey(ARCHIEVE_DEFERRED_SHEETS[1]),
  } as const;

  override getTickScore(base: number): number {
    this.accum += base * ARCHIEVE_PARAMS.scoreMultiplierExtra;
    const bonus = Math.floor(this.accum);
    this.accum -= bonus;
    return base + bonus;
  }

  // ─────────────────────────────────────────────────────────────
  // 수명
  // ─────────────────────────────────────────────────────────────

  override onCreate(api: GameSceneAPI): void {
    // 판마다 새 인스턴스지만 상태는 여기서 명시적으로 처음으로 (규칙 1)
    this.accum = 0;
    this.gameMs = 0;
    this.lastShotAt = 0;
    this.bubbleSerial = 0;
    this.shots = [];
    this.popQueue = [];
    this.fountainProgress = 0;
    this.fountainPhase = 'idle';
    this.fountainSerial = 0;
    this.fountainTaken = 0;
    this.shotPool = []; this.wraps = []; this.pops = []; this.tags = []; this.tagTexts = []; this.foam = [];
    this.flash = null; this.trail = [];
    this.texts = new Set();
    this.shotsFired = this.shotsHit = this.shotsMissed = this.fountainCasts = this.fountainHeld = 0;
    const scene = api.scene;
    this.loader = new StagedLoader(
      scene,
      ARCHIEVE_DEFERRED_SHEETS.map(f => ({ key: fxPickSheetKey(f), enqueue: (sc: Phaser.Scene) => loadFxPickSheet(sc, f) })),
      250, 600,
      key => this.onSheetLoaded(scene, key),
    );
    for (const f of ARCHIEVE_DEFERRED_SHEETS) this.onSheetLoaded(scene, fxPickSheetKey(f));   // 다시 하기 — 이미 있는 시트
  }

  private onSheetLoaded(scene: Phaser.Scene, key: string): void {
    if (!scene.textures.exists(key)) return;
    const K = ArchieveAbility.K, A = scene.anims, C = ArchieveAbility;
    if (key === K.bubble && this.wraps.length === 0) {
      if (!A.exists('archive_bubble')) A.create({ key: 'archive_bubble', frames: A.generateFrameNumbers(key, { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
      if (!A.exists('archive_bubblepop')) A.create({ key: 'archive_bubblepop', frames: A.generateFrameNumbers(key, { start: 2, end: 3 }), frameRate: 10, repeat: 0 });
      for (let i = 0; i < C.SHOT_POOL; i++) this.shotPool.push(scene.add.sprite(0, 0, key, 0).setScale(C.SHOT_SCALE).setDepth(1.15).setVisible(false));
      for (let i = 0; i < C.WRAP_POOL; i++) this.wraps.push(scene.add.sprite(0, 0, key, 0).setDepth(1.1).setVisible(false));
      for (let i = 0; i < C.POP_POOL; i++) this.pops.push(scene.add.sprite(0, 0, key, 2).setDepth(1.1).setVisible(false));
      for (let i = 0; i < C.FOUNTAIN_POOL; i++) this.foam.push(scene.add.sprite(0, 0, key, i % 2).setDepth(1.05).setVisible(false));
      this.flash = scene.add.sprite(0, 0, key, 0).setDepth(6).setVisible(false);
      for (let i = 0; i < C.TRAIL_POOL; i++) this.trail.push(scene.add.sprite(0, 0, key, i % 2).setDepth(1.14).setVisible(false));
    } else if (key === K.tag && this.tags.length === 0) {
      for (let i = 0; i < C.TAG_POOL; i++) {
        this.tags.push(scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(1.2).setVisible(false));
        this.tagTexts.push(scene.add.text(0, 0, '', { fontSize: '9px', fontFamily: 'Arial Black, sans-serif', color: '#ebfffc' }).setOrigin(0.5, 0.5).setDepth(1.3).setVisible(false));
      }
    }
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.loader?.stop();
    this.loader = null;
    this.popQueue = [];
    this.shots = [];
    this.fountainPhase = 'idle';
    const all = [...this.shotPool, ...this.wraps, ...this.pops, ...this.tags, ...this.tagTexts, ...this.foam, ...this.trail, ...(this.flash ? [this.flash] : []), ...this.texts];
    this.texts.clear();
    for (const o of all) { o.scene?.tweens.killTweensOf(o); o.destroy(); }
    this.shotPool = []; this.wraps = []; this.pops = []; this.tags = []; this.tagTexts = []; this.foam = [];
    this.flash = null; this.trail = [];
  }

  // ─────────────────────────────────────────────────────────────
  // 판정 — 감싼 똥은 아카이브 몸을 그냥 지나간다 (GameScene 이 무적 다음 · 보호막 앞에서 묻는다)
  // ─────────────────────────────────────────────────────────────

  override passesThrough(poop: Phaser.GameObjects.GameObject, _api: GameSceneAPI): boolean {
    const t = (poop as PoolablePoopBase).abilityTag;
    return this.isWrapped(t) || this.isFountain(t);
  }

  private isWrapped(tag: number): boolean { return tag > ArchieveAbility.BUBBLE_BASE; }
  private isFountain(tag: number): boolean { return tag < 0 && tag === -this.fountainSerial; }

  // ─────────────────────────────────────────────────────────────
  // 매 프레임
  // ─────────────────────────────────────────────────────────────

  override onUpdate(api: GameSceneAPI): void {
    this.loader?.step();
    const scene = api.scene, clock = scene.time;
    const dt = clock.paused ? 0 : scene.game.loop.delta * clock.timeScale;
    this.gameMs += dt;
    const P = ARCHIEVE_PARAMS;
    if (this.shotPool.length > 0 && this.fountainPhase === 'idle' && this.gameMs - this.lastShotAt >= P.shotEverySec * 1000) {
      this.lastShotAt = this.gameMs;
      this.fire(api);
    }
    this.flyShots(api, dt);
    this.stepFountain(api);
    this.syncWrapped(api);
    while (this.popQueue.length > 0 && this.gameMs - this.popQueue[0].t > ArchieveAbility.POP_STALE_MS) this.popQueue.shift();
    for (let i = 0; i < ArchieveAbility.FX_PER_FRAME && this.popQueue.length > 0; i++) {
      const s = this.pops.find(o => !o.visible);
      if (!s) break;
      const q = this.popQueue.shift()!;
      s.setPosition(q.x, q.y).setAlpha(1).setVisible(true).play('archive_bubblepop');
      s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.setVisible(false));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 기본 「날려서 맞추기」
  // ─────────────────────────────────────────────────────────────

  private hand(api: GameSceneAPI): { x: number; y: number } {
    return { x: api.player.x + ArchieveAbility.HAND_DX, y: api.player.y + ArchieveAbility.HAND_DY };
  }

  /** 반경 안 가까운 화면 안 일반 똥을 shotCount 개 골라 **도착 시점 자리**로 쏜다 (낙하 속도는 이 프레임에만 읽는다) */
  private fire(api: GameSceneAPI): void {
    const P = ARCHIEVE_PARAMS, h = this.hand(api);
    const cand: { x: number; y: number; vy: number; d: number }[] = [];
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      // 구슬보다 위 · 화면 안만 — 아래 똥은 방울이 닿기 전에 화면 밖으로 떨어져 빗나갔다 (실플레이 30초 27발 중 12발)
      if (!p.active || p.y < -20 || p.y > h.y - 30 || p.abilityTag !== 0) continue;
      const d = (p.x - h.x) ** 2 + (p.y - h.y) ** 2;
      if (d <= P.shotRadius * P.shotRadius) cand.push({ x: p.x, y: p.y, vy: (p.body as Phaser.Physics.Arcade.Body).velocity.y, d });
    }
    if (cand.length === 0) return;
    cand.sort((a, b) => a.d - b.d);
    this.flashOrb(api, h);
    cand.slice(0, P.shotCount).forEach((c, i) => {
      const spr = this.shotPool.find(s => !s.visible);
      if (!spr) return;
      // 앞질러 겨냥 — 비행 시간 t 동안 똥이 떨어질 자리 (두 번 다듬음)
      const tx = c.x;
      let ty = c.y;
      for (let k = 0; k < 2; k++) ty = c.y + c.vy * (Math.hypot(tx - h.x, ty - h.y) / P.shotSpeed);
      const dist = Math.hypot(tx - h.x, ty - h.y);
      const dur = Math.max(0.12, dist / P.shotSpeed);
      const bend = (i % 2 ? 1 : -1) * P.shotBend * Math.min(1, dist / 200);
      spr.setPosition(h.x, h.y).setScale(0.3).setAlpha(1).setVisible(true).play('archive_bubble');
      api.scene.tweens.killTweensOf(spr);
      api.scene.tweens.add({ targets: spr, scale: ArchieveAbility.SHOT_SCALE, duration: 140, ease: 'Back.easeOut' });   // 구슬에서 '퐁' 튀어나옴
      this.shots.push({ spr, x0: h.x, y0: h.y, x1: tx, y1: ty, bend, t: 0, dur: dur * 1000, vx: (tx - h.x) / dur, vy: (ty - h.y) / dur, trailAt: 0 });
      this.shotsFired++;
    });
  }

  /** 구슬 반짝 — 방울이 손에서 부풀며 옅어진다 (빛살 X) */
  private flashOrb(api: GameSceneAPI, h: { x: number; y: number }): void {
    const f = this.flash;
    if (!f) return;
    api.scene.tweens.killTweensOf(f);
    f.setPosition(h.x, h.y).setScale(0.4).setAlpha(0.95).setVisible(true);
    api.scene.tweens.add({ targets: f, scale: 1.25, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => f.setVisible(false) });
  }

  /** 날아가는 방울 뒤 작은 방울 자국 — 방울마다 TRAIL_EVERY_MS 쯤에 하나 (시각은 방울마다 — 하나로 두면 첫 방울에만 붙었다, 577fb2cf 리뷰) */
  private dropTrail(api: GameSceneAPI, s: Shot, x: number, y: number): void {
    if (s.t - s.trailAt < ArchieveAbility.TRAIL_EVERY_MS) return;
    s.trailAt = s.t;
    const d = this.trail.find(o => !o.visible);
    if (!d) return;
    d.setPosition(x + Phaser.Math.FloatBetween(-4, 4), y + Phaser.Math.FloatBetween(-4, 4)).setScale(Phaser.Math.FloatBetween(0.22, 0.32)).setAlpha(0.8).setVisible(true);
    api.scene.tweens.add({ targets: d, alpha: 0, y: d.y - 10, duration: 360, onComplete: () => d.setVisible(false) });
  }

  /** 날아가는 방울 — 휜 궤적을 따라가며, 표시 없는 일반 똥에 닿으면 그 프레임에 감싼다. 겨냥 자리를 지나면 곧게 계속 · 화면 밖에서 빗나감 */
  private flyShots(api: GameSceneAPI, dt: number): void {
    if (this.shots.length === 0) return;
    const cam = api.scene.cameras.main, R2 = ArchieveAbility.HIT_R ** 2;
    const poops = api.poops.getChildren() as unknown as PoolablePoopBase[];
    this.shots = this.shots.filter(s => {
      s.t += dt;
      let x: number, y: number;
      if (s.t <= s.dur) {
        const k = s.t / s.dur, nx = -(s.y1 - s.y0), ny = s.x1 - s.x0, nl = Math.hypot(nx, ny) || 1;
        const off = s.bend * Math.sin(Math.PI * k);
        x = s.x0 + (s.x1 - s.x0) * k + nx / nl * off; y = s.y0 + (s.y1 - s.y0) * k + ny / nl * off;
      } else {
        const extra = (s.t - s.dur) / 1000;
        x = s.x1 + s.vx * extra; y = s.y1 + s.vy * extra;
      }
      s.spr.setPosition(x, y);
      // 화면 밖이면 먼저 빗나감 — 위 밖에서 대기 중인 똥(y < −20)을 잡아 바로 퐁 · 점수가 되던 것 (5763c85a 리뷰)
      if (x < -40 || x > cam.width + 40 || y < -40 || y > cam.height + 40) {
        this.shotsMissed++;
        s.spr.anims.stop(); s.spr.setVisible(false);
        return false;
      }
      this.dropTrail(api, s, x, y);
      for (const p of poops) {
        if (!p.active || p.abilityTag !== 0 || p.y < -20 || p.y > cam.height) continue;
        if ((p.x - x) ** 2 + (p.y - y) ** 2 > R2) continue;
        p.abilityTag = ArchieveAbility.BUBBLE_BASE + (++this.bubbleSerial);   // 이 프레임부터 판정 없음
        this.shotsHit++;
        s.spr.anims.stop(); s.spr.setVisible(false);
        return false;
      }
      return true;
    });
  }

  /**
   * 감싼 똥 (기본 · 분수) — 위로 떠오르게 (속도를 매 프레임 다시 넣는다), 화면 위로 나가는 프레임에 '퐁' · 회수 · 점수.
   * 방울 · 번호표는 지금 표시가 달린 똥 기준으로 다시 깐다 (남는 칸은 끈다). 번호표는 기본(날려서 맞춘) 방울에만
   */
  private syncWrapped(api: GameSceneAPI): void {
    const P = ARCHIEVE_PARAMS;
    let w = 0, tg = 0, popped = 0, fPopped = 0;
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active) continue;
      const basic = this.isWrapped(p.abilityTag), fountain = this.isFountain(p.abilityTag);
      if (!basic && !fountain) continue;
      if (p.y < -30) {
        this.popQueue.push({ x: p.x, y: 12, t: this.gameMs });
        p.recycle(true);
        if (basic) popped++; else fPopped++;
        continue;
      }
      (p.body as Phaser.Physics.Arcade.Body).setVelocity(0, -(basic ? P.bubbleRise : P.fountainRiseSpeed));
      const b = this.wraps[w];
      if (b) {
        if (!b.visible) b.setVisible(true).play('archive_bubble');
        b.setPosition(p.x, p.y);
        w++;
      }
      if (basic && tg < this.tags.length) {
        this.tags[tg].setPosition(p.x, p.y - 27).setVisible(true);
        this.tagTexts[tg]?.setText(String((p.abilityTag - ArchieveAbility.BUBBLE_BASE) % 100).padStart(2, '0')).setPosition(p.x, p.y - 38).setVisible(true);
        tg++;
      }
    }
    for (let k = w; k < this.wraps.length; k++) if (this.wraps[k].visible) { this.wraps[k].anims.stop(); this.wraps[k].setVisible(false); }
    for (let k = tg; k < this.tags.length; k++) { this.tags[k].setVisible(false); this.tagTexts[k]?.setVisible(false); }
    if (popped > 0) this.award(api, popped * P.bubblePoints, api.player.x, 60);
    if (fPopped > 0) { this.fountainHeld += fPopped; this.award(api, fPopped * P.fountainPoints, api.scene.cameras.main.width / 2, 70); }
  }

  // ─────────────────────────────────────────────────────────────
  // 필살 「거품 분수」
  // ─────────────────────────────────────────────────────────────

  override onScoreMilestone(_score: number, api: GameSceneAPI): void {
    // 점수 1점마다 불린다. 자기 보너스는 세지 않는다 (awardBonus 가 awarding 을 세운다).
    // 카운터라 보너스가 배수를 넘겨도 삼켜지지 않고, 진행 중에 차면 끝난 뒤 첫 점수에 나간다
    if (this.awarding) return;
    const P = ARCHIEVE_PARAMS;
    if (this.fountainProgress < P.fountainInterval) this.fountainProgress++;
    if (this.fountainProgress < P.fountainInterval || this.fountainPhase !== 'idle' || this.foam.length === 0) return;
    this.fountainProgress = 0;
    this.startFountain(api);
  }

  private startFountain(api: GameSceneAPI): void {
    const P = ARCHIEVE_PARAMS, scene = api.scene, cam = scene.cameras.main;
    this.fountainPhase = 'gather';
    this.fountainT = this.gameMs;
    this.fountainSerial++;
    this.fountainTaken = 0;
    this.fountainCasts++;
    api.player.setInvincibleBriefly((P.fountainGatherSec + P.fountainRiseSec) * 1000 + 100);   // 모으기 + 솟구침 (+ 여유)
    // 모으기 — 바닥에 작은 거품이 고인다 (분수 풀의 앞 12개)
    const floorY = api.player.y + 30;
    this.foam.slice(0, 12).forEach((f, i) => {
      scene.tweens.killTweensOf(f);
      f.setPosition(Phaser.Math.FloatBetween(16, cam.width - 16), floorY + Phaser.Math.FloatBetween(-6, 10))
        .setScale(0).setAlpha(0.85).setVisible(true);
      scene.tweens.add({ targets: f, scale: Phaser.Math.FloatBetween(0.3, 0.5), duration: 200 + i * 25, ease: 'Back.easeOut' });
    });
  }

  private stepFountain(api: GameSceneAPI): void {
    if (this.fountainPhase === 'idle') return;
    const P = ARCHIEVE_PARAMS, cam = api.scene.cameras.main;
    const t = this.gameMs - this.fountainT, floorY = api.player.y + 40;
    if (this.fountainPhase === 'gather') {
      if (t < P.fountainGatherSec * 1000) return;
      this.fountainPhase = 'rise';
      this.fountainT = this.gameMs;
      this.launchFoam(api, floorY);
      return;
    }
    if (this.fountainPhase === 'rise') {
      // 솟는 앞줄 — 바닥에서 화면 위까지 fountainRiseSec. 앞줄이 지나간 화면 안 일반 똥을 이 프레임에 감싼다 (아래부터 · 상한)
      const k = Math.min(1, t / (P.fountainRiseSec * 1000));
      const front = floorY - (floorY + 20) * k;
      if (this.fountainTaken < P.fountainMax) {
        const cand: { p: PoolablePoopBase; y: number }[] = [];
        for (const obj of api.poops.getChildren()) {
          const p = obj as PoolablePoopBase;
          if (!p.active || p.abilityTag !== 0 || p.y < front || p.y < -20 || p.y > cam.height) continue;
          cand.push({ p, y: p.y });
        }
        cand.sort((a, b) => b.y - a.y);
        for (const { p } of cand.slice(0, P.fountainMax - this.fountainTaken)) { p.abilityTag = -this.fountainSerial; this.fountainTaken++; }
      }
      if (k >= 1) { this.fountainPhase = 'drain'; this.fountainT = this.gameMs; }
      return;
    }
    // drain — 감싼 똥이 다 퐁 할 때까지 (넉넉히 3초), 끝나면 정액
    let left = 0;
    for (const obj of api.poops.getChildren()) { const p = obj as PoolablePoopBase; if (p.active && this.isFountain(p.abilityTag)) left++; }
    if (left === 0 || t > 3000) {
      if (left > 0) {   // 3초 안에 못 올라간 대상 — 태그를 남기지 않고 이 프레임에 회수 · 점수로 마무리 (5763c85a 리뷰)
        let n = 0;
        for (const obj of api.poops.getChildren()) {
          const p = obj as PoolablePoopBase;
          if (!p.active || !this.isFountain(p.abilityTag)) continue;
          this.popQueue.push({ x: p.x, y: Math.max(12, p.y), t: this.gameMs });
          p.recycle(true); n++;
        }
        this.fountainHeld += n;
        if (n > 0) this.award(api, n * P.fountainPoints, cam.width / 2, 70);
      }
      this.fountainPhase = 'idle';
      this.lastShotAt = this.gameMs;   // 분수 뒤 기본 사격은 주기를 새로 센다
      this.award(api, P.fountainFlatPoints, cam.width / 2, 260);
    }
  }

  /** 분수 거품 — 풀 전부를 바닥 전체에서 솟구치게 (크기 0.35 ~ 1.0 섞임, 위쪽은 성기게). 위로 갈수록 옅어지며 사라짐 */
  private launchFoam(api: GameSceneAPI, floorY: number): void {
    const P = ARCHIEVE_PARAMS, scene = api.scene, cam = scene.cameras.main, rise = P.fountainRiseSec * 1000;
    const sizes = [0.35, 0.35, 0.5, 0.5, 0.7, 0.7, 0.85, 1.0];
    this.foam.forEach((f, i) => {
      scene.tweens.killTweensOf(f);
      const x = Phaser.Math.FloatBetween(-10, cam.width + 10);
      const topY = -40 + Math.pow(Math.random(), 0.6) * floorY * 0.9;
      const s = sizes[i % sizes.length];
      const delay = Math.random() * rise * 0.35;
      f.setFrame(i % 2).setPosition(x, floorY + Phaser.Math.FloatBetween(0, 30)).setScale(s).setAlpha(0).setVisible(true);
      scene.tweens.add({ targets: f, alpha: 0.9, duration: 120, delay });
      scene.tweens.add({ targets: f, y: topY, x: x + Phaser.Math.FloatBetween(-24, 24), duration: rise * (0.75 + Math.random() * 0.4), delay, ease: 'Quad.easeOut' });
      scene.tweens.add({ targets: f, alpha: 0, duration: 380, delay: delay + rise + 300 + Math.random() * 400, onComplete: () => f.setVisible(false) });
    });
  }

  /** 점수 — awardBonus(→ addAbilityBonus → updateScore, 규칙 3 · 자기 보너스로는 분수 카운터가 차지 않음) + '+N' 글자 */
  private award(api: GameSceneAPI, pts: number, x: number, y: number): void {
    this.awardBonus(api, pts);
    const txt = api.scene.add.text(x, y, `+${pts}`, {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff', stroke: '#1e7a8c', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);
    this.texts.add(txt);
    api.scene.tweens.add({ targets: txt, y: y - 40, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => { this.texts.delete(txt); txt.destroy(); } });
  }
}
