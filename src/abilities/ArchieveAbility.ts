import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { ARCHIEVE_PARAMS, ARCHIEVE_DEFERRED_SHEETS } from '../config/abilityParams';
import { fxPickSheetKey, loadFxPickSheet } from '../utils/vfx';
import { StagedLoader } from './stagedLoader';

/**
 * 아카이브 (SR) — 점수 배율 1.1 (생존 틱만) + 「비눗방울」 (v8 — planner proposal_v8_gumi_archive.md §2). 값은 ARCHIEVE_PARAMS
 *
 * - 기본 「비눗방울」: bubbleEverySec 마다 머리 위 반경 bubbleRadius 안 화면 안 일반 똥을 가까운 것부터 bubbleCount 개 감싼다.
 *   **감싸는 그 프레임에 판정을 뺀다** (passesThrough) — 똥은 abilityTag = BUBBLE_BASE + 판 누계 번호 로 표시하고 초속 bubbleRise 로
 *   떠오른다. 화면 위로 나가는 프레임에 '퐁' — 회수 · 점수 (개당 bubblePoints). 방울 위 번호표에 그 번호
 * - 필살 「거대 거품」: 플레이 점수 giantInterval 마다 (자기 보너스 제외 — awardBonus 가드). 거품이 giantSwellSec 부풀어
 *   화면 폭을 넘치게 (아래 가장자리 = 바닥 위 giantFloorGap) 덮는 순간 그 안 화면 안 일반 똥을 가까운 것부터 giantMax 개 담는다
 *   (판정 뺌 · abilityTag = −발동 번호 · 둥실). giantHoldSec 뒤 '퐁' — 담긴 똥을 **그 프레임에** 전부 회수 · 점수 (개당 giantPoints).
 *   부풂부터 퐁까지 아카이브는 무적
 * - 방울 · 거품 오브젝트는 매 프레임 '지금 표시가 달린 똥' 기준으로 다시 맞춘다 (참조를 프레임 넘겨 들지 않는다 —
 *   피버 등이 그 똥을 가져가면 표시가 0 으로 지워져 방울도 꺼진다)
 *
 * 성능 · 정리: 시트 3장은 판 시작 뒤 StagedLoader. 오브젝트는 판 시작에 한 번 — 방울 Sprite POOL · 퐁 Sprite POOL ·
 * 번호표 Image + Text POOL · 거대 거품 Sprite 1. 퐁 연출만 프레임당 FX_PER_FRAME. 블렌드 normal. 점수는 awardBonus
 */
export class ArchieveAbility extends BaseAbility {
  private accum = 0;

  // ── 비눗방울 ──
  private gameMs = 0;
  private lastBubbleAt = 0;
  /** 판 누계 번호 — 감싼 똥의 abilityTag = BUBBLE_BASE + 번호 (번호표에 쓴다) */
  private bubbleSerial = 0;
  /** 퐁 연출 대기열 — 좌표 · 넣은 게임 시각. 빈 칸이 나면 꺼내고 POP_STALE_MS 넘게 기다린 것은 버린다 */
  private popQueue: { x: number; y: number; t: number }[] = [];
  // ── 거대 거품 ──
  private giantProgress = 0;
  private giantPhase: 'idle' | 'swell' | 'hold' = 'idle';
  private giantT = 0;
  private giantSerial = 0;

  private loader: StagedLoader | null = null;
  private bubbles: Phaser.GameObjects.Sprite[] = [];
  private pops: Phaser.GameObjects.Sprite[] = [];
  private tags: Phaser.GameObjects.Image[] = [];
  private tagTexts: Phaser.GameObjects.Text[] = [];
  private giant: Phaser.GameObjects.Sprite | null = null;
  private texts = new Set<Phaser.GameObjects.Text>();

  /** 측정용 (밸런스 하네스 — 화면 · 저장 X): 비눗방울 발동 · 감싼 수 · 거대 거품 발동 · 담은 수 */
  bubbleCasts = 0;
  bubbleWrapped = 0;
  giantCasts = 0;
  giantHeld = 0;

  private static readonly BUBBLE_BASE = 1000;
  private static readonly POOL = 8;
  private static readonly FX_PER_FRAME = 4;
  private static readonly POP_STALE_MS = 600;
  /** 거대 거품 시트 — 칸 480×560, 다 부푼 테 반지름 (가공 때 잰 값) */
  private static readonly GIANT_RX = 219;
  private static readonly GIANT_RY = 265;
  private static readonly K = {
    bubble: fxPickSheetKey(ARCHIEVE_DEFERRED_SHEETS[0]),
    tag: fxPickSheetKey(ARCHIEVE_DEFERRED_SHEETS[1]),
    giant: fxPickSheetKey(ARCHIEVE_DEFERRED_SHEETS[2]),
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
    this.lastBubbleAt = 0;
    this.bubbleSerial = 0;
    this.popQueue = [];
    this.giantProgress = 0;
    this.giantPhase = 'idle';
    this.giantSerial = 0;
    this.bubbles = []; this.pops = []; this.tags = []; this.tagTexts = [];
    this.giant = null;
    this.texts = new Set();
    this.bubbleCasts = this.bubbleWrapped = this.giantCasts = this.giantHeld = 0;
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
    const K = ArchieveAbility.K, A = scene.anims;
    if (key === K.bubble && this.bubbles.length === 0) {
      if (!A.exists('archive_bubble')) A.create({ key: 'archive_bubble', frames: A.generateFrameNumbers(key, { start: 0, end: 1 }), frameRate: 4, repeat: -1 });
      if (!A.exists('archive_bubblepop')) A.create({ key: 'archive_bubblepop', frames: A.generateFrameNumbers(key, { start: 2, end: 3 }), frameRate: 10, repeat: 0 });
      for (let i = 0; i < ArchieveAbility.POOL; i++) {
        this.bubbles.push(scene.add.sprite(0, 0, key, 0).setDepth(1.1).setVisible(false));
        this.pops.push(scene.add.sprite(0, 0, key, 2).setDepth(1.1).setVisible(false));
      }
    } else if (key === K.tag && this.tags.length === 0) {
      for (let i = 0; i < ArchieveAbility.POOL; i++) {
        this.tags.push(scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(1.2).setVisible(false));
        this.tagTexts.push(scene.add.text(0, 0, '', { fontSize: '9px', fontFamily: 'Arial Black, sans-serif', color: '#ebfffc' }).setOrigin(0.5, 0.5).setDepth(1.3).setVisible(false));
      }
    } else if (key === K.giant && !this.giant) {
      if (!A.exists('archive_giant_swell')) A.create({ key: 'archive_giant_swell', frames: A.generateFrameNumbers(key, { start: 0, end: 2 }), frameRate: 3 / ARCHIEVE_PARAMS.giantSwellSec, repeat: 0 });
      if (!A.exists('archive_giant_hold')) A.create({ key: 'archive_giant_hold', frames: A.generateFrameNumbers(key, { start: 2, end: 3 }), frameRate: 6, repeat: -1 });
      if (!A.exists('archive_giant_pop')) A.create({ key: 'archive_giant_pop', frames: A.generateFrameNumbers(key, { start: 4, end: 5 }), frameRate: 8, repeat: 0 });
      this.giant = scene.add.sprite(0, 0, key, 0).setDepth(1.4).setVisible(false);
    }
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.loader?.stop();
    this.loader = null;
    this.popQueue = [];
    this.giantPhase = 'idle';
    const all = [...this.bubbles, ...this.pops, ...this.tags, ...this.tagTexts, this.giant, ...this.texts];
    this.texts.clear();
    for (const o of all) { if (!o) continue; o.scene?.tweens.killTweensOf(o); o.destroy(); }
    this.bubbles = []; this.pops = []; this.tags = []; this.tagTexts = [];
    this.giant = null;
  }

  // ─────────────────────────────────────────────────────────────
  // 판정 — 감싼 · 담긴 똥은 노이즈 몸을 그냥 지나간다 (GameScene 이 무적 다음 · 보호막 앞에서 묻는다)
  // ─────────────────────────────────────────────────────────────

  override passesThrough(poop: Phaser.GameObjects.GameObject, _api: GameSceneAPI): boolean {
    const t = (poop as PoolablePoopBase).abilityTag;
    return this.isWrapped(t) || this.isHeld(t);
  }

  private isWrapped(tag: number): boolean { return tag > ArchieveAbility.BUBBLE_BASE; }
  private isHeld(tag: number): boolean { return this.giantPhase === 'hold' && tag === -this.giantSerial; }

  // ─────────────────────────────────────────────────────────────
  // 매 프레임
  // ─────────────────────────────────────────────────────────────

  override onUpdate(api: GameSceneAPI): void {
    this.loader?.step();
    const scene = api.scene, clock = scene.time;
    this.gameMs += clock.paused ? 0 : scene.game.loop.delta * clock.timeScale;
    const P = ARCHIEVE_PARAMS;
    if (this.bubbles.length > 0 && this.gameMs - this.lastBubbleAt >= P.bubbleEverySec * 1000) {
      this.lastBubbleAt = this.gameMs;
      this.castBubbles(api);
    }
    this.syncBubbles(api);
    this.stepGiant(api);
    // 빈 칸을 먼저 찾고 꺼낸다 (구미 2df5ed78 리뷰와 같은 규칙) — 오래 기다린 것만 버린다
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
  // 기본 「비눗방울」
  // ─────────────────────────────────────────────────────────────

  private castBubbles(api: GameSceneAPI): void {
    const P = ARCHIEVE_PARAMS, H = api.scene.cameras.main.height;
    const hx = api.player.x, hy = api.player.y - 40;
    const cand: { p: PoolablePoopBase; d: number }[] = [];
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || p.y < -20 || p.y > H || p.abilityTag !== 0) continue;   // 이미 표시가 달린 똥(다른 방울 · 거품)은 건너뛴다
      const d = (p.x - hx) ** 2 + (p.y - hy) ** 2;
      if (d <= P.bubbleRadius * P.bubbleRadius) cand.push({ p, d });
    }
    if (cand.length === 0) return;
    cand.sort((a, b) => a.d - b.d);
    this.bubbleCasts++;
    for (const { p } of cand.slice(0, P.bubbleCount)) {
      p.abilityTag = ArchieveAbility.BUBBLE_BASE + (++this.bubbleSerial);   // 이 프레임부터 판정 없음 (passesThrough)
      this.bubbleWrapped++;
    }
  }

  /**
   * 감싼 똥 — 위로 떠오르게 (속도를 매 프레임 다시 넣는다), 화면 위로 나가는 프레임에 '퐁' · 회수 · 점수.
   * 방울 · 번호표는 지금 표시가 달린 똥 기준으로 다시 깐다 (남는 칸은 끈다)
   */
  private syncBubbles(api: GameSceneAPI): void {
    const P = ARCHIEVE_PARAMS;
    let i = 0, popped = 0;
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || !this.isWrapped(p.abilityTag)) continue;
      if (p.y < -30) {
        this.popQueue.push({ x: p.x, y: 12, t: this.gameMs });
        p.recycle(true);
        popped++;
        continue;
      }
      (p.body as Phaser.Physics.Arcade.Body).setVelocity(0, -P.bubbleRise);
      if (i < this.bubbles.length) {
        const b = this.bubbles[i];
        if (!b.visible) b.setVisible(true).play('archive_bubble');
        b.setPosition(p.x, p.y);
        this.tags[i]?.setPosition(p.x, p.y - 27).setVisible(true);
        this.tagTexts[i]?.setText(String((p.abilityTag - ArchieveAbility.BUBBLE_BASE) % 100).padStart(2, '0')).setPosition(p.x, p.y - 38).setVisible(true);
      }
      i++;
    }
    for (let k = i; k < this.bubbles.length; k++) {
      if (this.bubbles[k].visible) { this.bubbles[k].anims.stop(); this.bubbles[k].setVisible(false); }
      this.tags[k]?.setVisible(false); this.tagTexts[k]?.setVisible(false);
    }
    if (popped > 0) this.award(api, popped * P.bubblePoints, api.player.x, 60);
  }

  // ─────────────────────────────────────────────────────────────
  // 필살 「거대 거품」
  // ─────────────────────────────────────────────────────────────

  override onScoreMilestone(_score: number, api: GameSceneAPI): void {
    // 점수 1점마다 불린다. 자기 보너스는 세지 않는다 (awardBonus 가 awarding 을 세운다).
    // 카운터라 보너스가 배수를 넘겨도 삼켜지지 않고, 진행 중에 차면 끝난 뒤 첫 점수에 나간다
    if (this.awarding) return;
    const P = ARCHIEVE_PARAMS;
    if (this.giantProgress < P.giantInterval) this.giantProgress++;
    if (this.giantProgress < P.giantInterval || this.giantPhase !== 'idle' || !this.giant) return;
    this.giantProgress = 0;
    this.startGiant(api);
  }

  /** 거품 중심 — 아카이브 머리 위 x, 아래 가장자리가 바닥 위 giantFloorGap */
  private giantCenter(api: GameSceneAPI): { x: number; y: number } {
    return { x: api.player.x, y: api.player.y + 38 - ARCHIEVE_PARAMS.giantFloorGap - ArchieveAbility.GIANT_RY };
  }

  private startGiant(api: GameSceneAPI): void {
    const P = ARCHIEVE_PARAMS, g = this.giant!;
    this.giantPhase = 'swell';
    this.giantT = this.gameMs;
    this.giantSerial++;
    this.giantCasts++;
    api.player.setInvincibleBriefly((P.giantSwellSec + P.giantHoldSec) * 1000 + 100);   // 부풂부터 퐁까지 (+ 여유 한두 프레임)
    const c = this.giantCenter(api);
    api.scene.tweens.killTweensOf(g);
    g.setPosition(c.x, c.y).setAlpha(1).setVisible(true).play('archive_giant_swell');
  }

  private stepGiant(api: GameSceneAPI): void {
    if (this.giantPhase === 'idle' || !this.giant) return;
    const P = ARCHIEVE_PARAMS, g = this.giant, t = this.gameMs - this.giantT;
    if (this.giantPhase === 'swell') {
      if (t < P.giantSwellSec * 1000) return;
      // 다 부풀었다 — 안의 화면 안 일반 똥을 가까운 것부터 giantMax 개 담는다 (판정 뺌)
      this.giantPhase = 'hold';
      this.giantT = this.gameMs;
      g.play('archive_giant_hold');
      const H = api.scene.cameras.main.height, rx = ArchieveAbility.GIANT_RX, ry = ArchieveAbility.GIANT_RY;
      const cand: { p: PoolablePoopBase; d: number }[] = [];
      for (const obj of api.poops.getChildren()) {
        const p = obj as PoolablePoopBase;
        if (!p.active || p.y < -20 || p.y > H || this.isWrapped(p.abilityTag)) continue;
        const dx = (p.x - g.x) / rx, dy = (p.y - g.y) / ry;
        if (dx * dx + dy * dy <= 1) cand.push({ p, d: (p.x - api.player.x) ** 2 + (p.y - api.player.y) ** 2 });
      }
      cand.sort((a, b) => a.d - b.d);
      for (const { p } of cand.slice(0, P.giantMax)) p.abilityTag = -this.giantSerial;
      return;
    }
    // hold — 담긴 똥은 둥실 (아주 느리게 위로), 시간이 되면 '퐁'
    let n = 0, popNow = t >= P.giantHoldSec * 1000;
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || p.abilityTag !== -this.giantSerial) continue;
      if (popNow) { p.recycle(true); n++; }
      else (p.body as Phaser.Physics.Arcade.Body).setVelocity(0, -20);
    }
    if (!popNow) return;
    this.giantPhase = 'idle';
    this.giantHeld += n;
    // 발동당 정액 + 개당 — 한 번에 awardBonus (자기 보너스라 거대 거품 카운터에 안 들어간다, v6 A′)
    this.award(api, P.giantFlatPoints + n * P.giantPoints, g.x, Math.max(120, g.y - 60));
    g.play('archive_giant_pop');
    g.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => g.setVisible(false));
  }

  /** 점수 — awardBonus(→ addAbilityBonus → updateScore, 규칙 3 · 자기 보너스로는 거대 거품 카운터가 차지 않음) + '+N' 글자 */
  private award(api: GameSceneAPI, pts: number, x: number, y: number): void {
    this.awardBonus(api, pts);
    const txt = api.scene.add.text(x, y, `+${pts}`, {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff', stroke: '#1e7a8c', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);
    this.texts.add(txt);
    api.scene.tweens.add({ targets: txt, y: y - 40, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => { this.texts.delete(txt); txt.destroy(); } });
  }
}
