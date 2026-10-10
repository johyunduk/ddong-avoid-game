import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { GLITCH_PARAMS, GLITCH_DEFERRED_SHEETS } from '../config/abilityParams';
import { fxPickSheetKey, loadFxPickSheet } from '../utils/vfx';
import { StagedLoader } from './stagedLoader';

/**
 * 글리치 (SR) v2 — 디지털 화면 · 데이터가 깨진다. 값은 GLITCH_PARAMS (planner 1차 · fx 가정, v6 에서 맞춘다)
 *
 * - 기본 「압축 오류」: compressIntervalSec 마다 머리 위 기둥(± compressHalfWidth, 화면 높이 compressHeightRatio) 안 일반 똥을
 *   가까운 순 compressMax 개까지 크기 · 판정 compressScale 로 줄인다 — 지우지 않는다. 분홍 꺾쇠가 조여들고, 줄어든 똥에는
 *   분홍 외곽선이 붙어 작아도 보인다 (청록이면 하늘색 다이아똥으로 보여 분홍 — 대표 피드백). 압축된 똥이 바닥(발밑 높이)에 닿으면 가는 네온 조각으로 '틱' 흩어지고 개당 compressPoints.
 * - 특수 「얇은 틈」: riftIntervalSec 마다 화면이 얇게 찢어진 틈 3개(큰 · 중 · 작)가 랜덤 각도로 열린다.
 *   틈 중심은 화면 위쪽(riftTopY ~ 높이 × riftBottomRatio), 서로 교차하지 않고 중심끼리 riftMinGap 이상.
 *   열리는 순간 틈에 걸린 일반 똥을 **그 프레임에** 지우고 점수(개당 riftPoints, 최대 riftMax)를 그 자리에서 준다 (센티넬 23b71887 과 같은 규칙).
 *   연출(네온 윤곽 → 지글 → 네온 선 조각)만 좌표로 담아 프레임당 FX_PER_FRAME 개씩 그린다.
 *
 * 화풍 · 성능 (CLAUDE.md 이펙트 화풍): 시트 3장(GLITCH_DEFERRED_SHEETS)은 판 시작 뒤 StagedLoader 로 한 장씩.
 * 오브젝트는 판 시작에 한 번 만들어 숨겼다 켰다 한다 — 틈 Sprite 3 · 지글 Sprite 8 · 윤곽 Image 8×3 · 조각 Image 48 ·
 * 압축 외곽선 Image 10 · 꺾쇠 Graphics 1. 발동 1회가 새로 만드는 것은 점수 글자뿐. 블렌드는 전부 normal (밝은 배경)
 */
export class GlitchAbility extends BaseAbility {
  private compressTimer: Phaser.Time.TimerEvent | null = null;
  private riftTimer: Phaser.Time.TimerEvent | null = null;
  private pending: Phaser.Time.TimerEvent[] = [];
  private loader: StagedLoader | null = null;

  /** 압축된 똥 — 원래 배율 · 잡을 때 y(아래로만 떨어지므로 지금 y 가 더 위면 풀에서 다시 나온 다른 똥) · 외곽선 */
  private compressed = new Map<PoolablePoopBase, { sx: number; sy: number; y0: number; outline: Phaser.GameObjects.Image | null }>();
  /**
   * 압축 똥 외곽선 — 똥 실루엣을 사방 OUTLINE_PX 만큼 민 얇은 분홍 고리 한 장 (glitch_outline_<텍스처>_<크기> 로 구워 둔다).
   * 예전엔 실루엣을 크게 키워 뒤에 깔았는데, 똥 그림이 텍스처 가운데보다 아래에 있어 위쪽만 두껍게 보였다 (대표 피드백)
   */
  private outlinePool: Phaser.GameObjects.Image[] = [];
  private bracketG: Phaser.GameObjects.Graphics | null = null;
  /**
   * 조여드는 꺾쇠 — 대상 · 시작 시각. BRACKET_MS 동안만 다시 그린다. **연출일 뿐** — 압축은 고른 프레임에 이미 끝났다.
   * 그리는 대상도 compressed 에 아직 있는 것만 (풀 재사용 · 다른 경로로 사라진 똥은 release 가 빼므로 따라가지 않는다)
   */
  private brackets: { targets: PoolablePoopBase[]; t0: number } | null = null;

  private rifts: Phaser.GameObjects.Sprite[] = [];
  private sparks: Phaser.GameObjects.Sprite[] = [];
  /** 걸린 똥 네온 윤곽 한 벌 = [청록 그림자 · 분홍 테 · 짙은 보라 속] */
  private neon: Phaser.GameObjects.Image[][] = [];
  private bits: Phaser.GameObjects.Image[] = [];
  /** 틈에 걸려 지운 자리 — 좌표 · 텍스처 · 표시 크기만 (똥 참조 없음). 프레임당 FX_PER_FRAME 개씩 연출 */
  /** 떠 있는 점수 글자 — onDestroy 에서 트윈과 같이 지운다 (2d5b6bca 리뷰 2) */
  private texts = new Set<Phaser.GameObjects.Text>();
  /** 열려 있는 틈 — 판정 [cx, cy, 배율, 각도] · 닫히는 시각(scene.time.now) · 이번 발동 남은 상한 (틈 셋이 나눠 씀) */
  private openSlits: { r: [number, number, number, number]; until: number; budget: { left: number } }[] = [];
  private fxQueue: { x: number; y: number; key: string; frame: string | number; scale: number; disp: number }[] = [];

  /** 측정용 (밸런스 하네스) — 압축 발동 · 압축한 똥 · 압축 똥이 바닥에서 점수 받은 수 · 틈 발동 · 틈으로 지운 똥 */
  compressFired = 0;
  compressedCount = 0;
  compressLanded = 0;
  riftFired = 0;
  riftKills = 0;

  private static readonly PINK = 0xff4fa3;
  private static readonly CYAN = 0x3fe6e6;
  private static readonly INK = 0x2a1530;
  private static readonly BACK = 0x1b0b30;
  private static readonly FX_PER_FRAME = 4;
  private static readonly BRACKET_MS = 150;
  private static readonly OUTLINE_POOL = 10;
  /** 압축 똥 외곽선 — 표시 두께(px) · 칸 여백(px) · 굽는 배율 (작게 구우면 흐리다) */
  private static readonly OUTLINE_PX = 1.3;
  private static readonly OUTLINE_PAD = 3;
  private static readonly OUTLINE_RES = 3;
  static readonly OUTLINE_PREFIX = 'glitch_outline_';
  private static readonly NEON_POOL = 8;
  private static readonly BIT_POOL = 48;
  private static readonly BITS_PER_POOP = 6;
  /** 틈 시트 — 틈 길이 230px · 다 열렸을 때 반쯤 벌어진 높이 14px (배율 1). 지글 시트는 지름 44 똥 기준 */
  private static readonly RIFT_LEN = 230;
  private static readonly RIFT_HALF = 14;
  private static readonly SPARK_FOR = 44;
  /** 틈 타이밍 (ms): 예고(f0) · 유지 · 틈끼리 엇갈림 */
  private static readonly RIFT_TELE_MS = 300;
  /** 다 열린 상태 유지 (ms) — 그동안 닿는 일반 똥은 계속 걸린다 (대표 피드백: 310 → 2500) */
  private static readonly RIFT_HOLD_MS = 2500;
  /** 열림 애니 길이 (3칸 30fps) */
  private static readonly RIFT_OPEN_MS = 100;
  private static readonly RIFT_STAGGER_MS = 60;
  private static readonly KEYS = {
    rift: fxPickSheetKey('glitch_rift_256x48.png'),
    spark: fxPickSheetKey('glitch_spark_80x80.png'),
    bits: fxPickSheetKey('glitch_bits_24x24.png'),
  } as const;
  private static readonly ANIM = { open: 'glitch_rift_open', hold: 'glitch_rift_hold', close: 'glitch_rift_close', spark: 'glitch_spark' } as const;

  override onCreate(api: GameSceneAPI): void {
    // 판마다 새 인스턴스지만 상태는 여기서 명시적으로 처음으로 (규칙 1)
    this.compressed = new Map();
    this.openSlits = [];
    this.texts = new Set();
    this.pending = [];
    this.fxQueue = [];
    this.brackets = null;
    this.outlinePool = [];
    this.rifts = [];
    this.sparks = [];
    this.neon = [];
    this.bits = [];
    this.compressFired = 0;
    this.compressedCount = 0;
    this.compressLanded = 0;
    this.riftFired = 0;
    this.riftKills = 0;
    const scene = api.scene;
    this.bracketG = scene.add.graphics().setDepth(6);
    for (let i = 0; i < GlitchAbility.OUTLINE_POOL; i++) this.outlinePool.push(scene.add.image(0, 0, '__DEFAULT').setVisible(false));
    for (let i = 0; i < GlitchAbility.NEON_POOL; i++) {
      this.neon.push([0, 1, 2].map(k => scene.add.image(0, 0, '__DEFAULT').setDepth(5.3 + k * 0.05).setVisible(false)));
    }
    this.loader = new StagedLoader(
      scene,
      GLITCH_DEFERRED_SHEETS.map(f => ({ key: fxPickSheetKey(f), enqueue: (sc: Phaser.Scene) => loadFxPickSheet(sc, f) })),
      250, 600,
      key => this.onSheetLoaded(scene, key),
    );
    for (const f of GLITCH_DEFERRED_SHEETS) this.onSheetLoaded(scene, fxPickSheetKey(f));   // 다시 하기 — 이미 있는 시트
    this.compressTimer = scene.time.addEvent({ delay: GLITCH_PARAMS.compressIntervalSec * 1000, loop: true, callback: () => this.compress(api) });
    this.riftTimer = scene.time.addEvent({ delay: GLITCH_PARAMS.riftIntervalSec * 1000, loop: true, callback: () => this.openRifts(api) });
  }

  /** 시트 한 장이 올라왔다 — 애니메이션 · 그 시트를 쓰는 오브젝트를 만든다 (이미 있으면 건너뛴다) */
  private onSheetLoaded(scene: Phaser.Scene, key: string): void {
    if (!scene.textures.exists(key)) return;
    const K = GlitchAbility.KEYS, A = GlitchAbility.ANIM;
    const anim = (k: string, frames: number[], rate: number, repeat: number) => {
      if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: frames.map(frame => ({ key, frame })), frameRate: rate, repeat });
    };
    if (key === K.rift && this.rifts.length === 0) {
      anim(A.open, [1, 2, 3], 30, 0);
      anim(A.hold, [3, 4], 12, -1);
      anim(A.close, [5, 6, 7], 20, 0);
      for (let i = 0; i < 3; i++) this.rifts.push(scene.add.sprite(0, 0, key, 0).setDepth(5).setVisible(false));
    } else if (key === K.spark && this.sparks.length === 0) {
      anim(A.spark, [0, 1, 2, 3], 24, -1);
      for (let i = 0; i < GlitchAbility.NEON_POOL; i++) this.sparks.push(scene.add.sprite(0, 0, key, 0).setDepth(5.6).setVisible(false));
    } else if (key === K.bits && this.bits.length === 0) {
      for (let i = 0; i < GlitchAbility.BIT_POOL; i++) this.bits.push(scene.add.image(0, 0, key, i % 4).setDepth(5.7).setVisible(false));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 기본 「압축 오류」
  // ─────────────────────────────────────────────────────────────

  /**
   * 똥 텍스처 · 표시 크기마다 얇은 분홍 고리를 한 번 굽는다 — 실루엣을 16 방향으로 OUTLINE_PX 씩 밀어 칠하고 가운데(원래 실루엣)를 파낸다.
   * 사방 두께가 같고 발광 없음. 키 = glitch_outline_<텍스처>_<크기> (characterTextures 해제 접두사)
   */
  private static bakeOutline(scene: Phaser.Scene, p: PoolablePoopBase): string | null {
    const D = Math.round(p.displayWidth), R = GlitchAbility.OUTLINE_RES, pad = GlitchAbility.OUTLINE_PAD;
    const key = `${GlitchAbility.OUTLINE_PREFIX}${p.texture.key}_${D}`;
    if (scene.textures.exists(key)) return key;
    const n = (D + pad * 2) * R;
    const tex = scene.textures.createCanvas(key, n, n);
    if (!tex) return null;
    const ctx = tex.getContext();
    const src = p.texture.getSourceImage() as CanvasImageSource;
    const off = pad * R, size = D * R, w = GlitchAbility.OUTLINE_PX * R;
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; ctx.drawImage(src, off + Math.cos(a) * w, off + Math.sin(a) * w, size, size); }
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#FF4FA3';
    ctx.fillRect(0, 0, n, n);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(src, off, off, size, size);
    tex.refresh();
    return key;
  }

  private compress(api: GameSceneAPI): void {
    const P = GLITCH_PARAMS;
    const px = api.player.x, head = api.player.y - 40;
    const top = head - api.scene.cameras.main.height * P.compressHeightRatio;
    const found: { p: PoolablePoopBase; d2: number }[] = [];
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || this.compressed.has(p)) continue;
      if (Math.abs(p.x - px) > P.compressHalfWidth || p.y < top || p.y > head) continue;
      found.push({ p, d2: (p.x - px) ** 2 + (p.y - head) ** 2 });
    }
    if (found.length === 0) return;
    found.sort((a, b) => a.d2 - b.d2);
    const targets = found.slice(0, P.compressMax).map(f => f.p);
    this.compressFired++;
    // **고른 프레임에 압축한다** (2d5b6bca 리뷰 1) — 예고 동안 똥 참조만 들고 있다가 줄이면, 그 사이 풀로 돌아가 다시 나온
    // 다른 똥(기둥 밖일 수도)을 줄였다. 센티넬 23b71887 과 같은 규칙: 게임 동작은 그 자리에서, 꺾쇠는 연출로만
    this.brackets = { targets, t0: api.scene.time.now };
    this.later(api, GlitchAbility.BRACKET_MS, () => { this.brackets = null; this.bracketG?.clear(); });
    for (const p of targets) {
      const outline = this.outlinePool.find(o => !o.visible) ?? null;
      this.compressed.set(p, { sx: p.scaleX, sy: p.scaleY, y0: p.y, outline });
      p.setScale(p.scaleX * P.compressScale, p.scaleY * P.compressScale).setDepth(1);
      if (outline) {
        const key = GlitchAbility.bakeOutline(api.scene, p);
        const pad = GlitchAbility.OUTLINE_PAD * 2;
        if (key) outline.setTexture(key).setDisplaySize(p.displayWidth + pad, p.displayHeight + pad).setDepth(0.9).setPosition(p.x, p.y).setVisible(true);
      }
      this.compressedCount++;
    }
  }

  /** 꺾쇠 — 압축된 똥마다 네 귀퉁이, 26 → 9px 로 조여든다 (분홍 2px + 진한 테). 조이는 동안만 다시 그린다 */
  private drawBrackets(now: number): void {
    const g = this.bracketG, b = this.brackets;
    if (!g || !b) return;
    const k = Phaser.Math.Clamp((now - b.t0) / GlitchAbility.BRACKET_MS, 0, 1);
    const half = 26 - 17 * k, L = Math.max(5, half * 0.45);
    g.clear();
    for (const p of b.targets) {
      if (!p.active || !this.compressed.has(p)) continue;   // 점수가 피버를 열어 같은 프레임에 회수된 똥 — 꺾쇠를 그리지 않는다
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const cx = p.x + sx * half, cy = p.y + sy * half;
        for (const [c, w] of [[GlitchAbility.INK, 4], [GlitchAbility.PINK, 2]] as const) {
          g.lineStyle(w, c, 1).beginPath().moveTo(cx - sx * L, cy).lineTo(cx, cy).lineTo(cx, cy - sy * L).strokePath();
        }
      }
    }
  }

  /** 압축된 똥 따라가기 — 바닥에 닿으면 점수 + 조각, 사라졌거나(다른 경로) 풀에서 다시 나왔으면 원래 크기로 되돌린다 */
  private updateCompressed(api: GameSceneAPI): void {
    if (this.compressed.size === 0) return;
    const ground = api.player.y + 38;
    let landed = 0;
    for (const [p, c] of this.compressed) {
      const reused = p.active && p.y < c.y0 - 1;
      if (!p.active || reused) { this.release(p, c); continue; }
      if (p.y >= ground) {
        this.scatterBits(api.scene, p.x, ground - 4, 3, 0.7);
        p.recycle(true);
        this.release(p, c);
        landed++;
        continue;
      }
      c.outline?.setPosition(p.x, p.y);
    }
    if (landed > 0) {
      this.compressLanded += landed;
      this.award(api, landed * GLITCH_PARAMS.compressPoints, api.player.x, ground - 60);
    }
  }

  private release(p: PoolablePoopBase, c: { sx: number; sy: number; outline: Phaser.GameObjects.Image | null }): void {
    p.setScale(c.sx, c.sy).setDepth(0);
    c.outline?.setVisible(false);
    this.compressed.delete(p);
  }

  // ─────────────────────────────────────────────────────────────
  // 특수 「얇은 틈」
  // ─────────────────────────────────────────────────────────────

  /** 같은 규칙으로 틈 3개 뽑기 — [cx, cy, 배율, 각도]. 화면 밖 6px 넘거나 · 교차 · 가까우면 다시 */
  private layout(api: GameSceneAPI): [number, number, number, number][] {
    const P = GLITCH_PARAMS, W = api.scene.cameras.main.width, H = api.scene.cameras.main.height;
    const out: [number, number, number, number][] = [];
    const ends = ([cx, cy, s, a]: [number, number, number, number]): number[][] => {
      const h = GlitchAbility.RIFT_LEN * s / 2;
      return [[cx - Math.cos(a) * h, cy - Math.sin(a) * h], [cx + Math.cos(a) * h, cy + Math.sin(a) * h]];
    };
    const d = (p: number[], q: number[], r: number[]) => (r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0]);
    const cross = (a: number[][], b: number[][]) => d(a[0], a[1], b[0]) * d(a[0], a[1], b[1]) < 0 && d(b[0], b[1], a[0]) * d(b[0], b[1], a[1]) < 0;
    for (const s of P.riftScales) {
      for (let tries = 0; tries < 300; tries++) {
        const r: [number, number, number, number] = [30 + Math.random() * (W - 60), P.riftTopY + Math.random() * (H * P.riftBottomRatio - P.riftTopY), s, Math.random() * Math.PI];
        const e = ends(r);
        if (e.some(([x, y]) => x < -6 || x > W + 6 || y < P.riftTopY - 20)) continue;
        if (out.some(o => Math.hypot(o[0] - r[0], o[1] - r[1]) < P.riftMinGap || cross(ends(o), e))) continue;
        out.push(r);
        break;
      }
    }
    return out;
  }

  private openRifts(api: GameSceneAPI): void {
    const lay = this.layout(api);
    if (lay.length === 0) return;
    this.riftFired++;
    const budget = { left: GLITCH_PARAMS.riftMax as number };
    lay.forEach((r, i) => {
      const spr = this.rifts[i];
      const t0 = i * GlitchAbility.RIFT_STAGGER_MS;
      this.later(api, t0, () => {
        if (!spr) return;
        api.scene.tweens.killTweensOf(spr);
        spr.anims.stop();
        spr.setFrame(0).setPosition(r[0], r[1]).setRotation(r[3]).setScale(r[2]).setAlpha(1).setVisible(true);
      });
      this.later(api, t0 + GlitchAbility.RIFT_TELE_MS, () => {
        // 열린 동안(열림 + 유지) 매 프레임 updateSlits 가 걸린 똥을 지운다 — 여는 순간은 여기서 바로
        this.openSlits.push({ r, until: api.scene.time.now + GlitchAbility.RIFT_OPEN_MS + GlitchAbility.RIFT_HOLD_MS, budget });
        budget.left -= this.cutRift(api, r, budget.left);
        if (!spr) return;
        spr.play(GlitchAbility.ANIM.open);
        spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.play(GlitchAbility.ANIM.hold));
      });
      this.later(api, t0 + GlitchAbility.RIFT_TELE_MS + GlitchAbility.RIFT_OPEN_MS + GlitchAbility.RIFT_HOLD_MS, () => {
        if (!spr) return;
        spr.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
        spr.play(GlitchAbility.ANIM.close);
        api.scene.tweens.add({ targets: spr, alpha: 0, delay: 150, duration: 150, onComplete: () => spr.setVisible(false) });
      });
    });
  }

  /** 열린 틈마다 이번 프레임에 걸린 일반 똥을 지운다 (닫힐 시각이 지나면 뺀다). 씬 시계 기준 */
  private updateSlits(api: GameSceneAPI): void {
    if (this.openSlits.length === 0) return;
    const now = api.scene.time.now;
    this.openSlits = this.openSlits.filter(sl => now < sl.until);
    for (const sl of this.openSlits) if (sl.budget.left > 0) sl.budget.left -= this.cutRift(api, sl.r, sl.budget.left);
  }

  /** 틈에 걸린 일반 똥을 이 프레임에 지우고 점수. 연출은 좌표만 담는다. 지운 수를 돌려준다 */
  private cutRift(api: GameSceneAPI, [cx, cy, s, a]: [number, number, number, number], budget: number): number {
    if (budget <= 0) return 0;
    const halfL = GlitchAbility.RIFT_LEN * s / 2, halfV = GlitchAbility.RIFT_HALF * s + 18;
    const c = Math.cos(a), sn = Math.sin(a);
    let n = 0;
    for (const obj of api.poops.getChildren()) {
      if (n >= budget) break;
      const p = obj as PoolablePoopBase;
      if (!p.active) continue;
      const dx = p.x - cx, dy = p.y - cy, u = dx * c + dy * sn, v = -dx * sn + dy * c;
      if (Math.abs(u) > halfL || Math.abs(v) > halfV) continue;
      const comp = this.compressed.get(p);
      if (comp) this.release(p, comp);
      this.fxQueue.push({ x: p.x, y: p.y, key: p.texture.key, frame: p.frame.name, scale: p.scaleX, disp: p.displayWidth });
      p.recycle(true);
      n++;
    }
    if (n > 0) {
      this.riftKills += n;
      this.award(api, n * GLITCH_PARAMS.riftPoints, cx, cy - 26);
    }
    return n;
  }

  /** 걸린 똥 연출 — 네온 윤곽(청록 그림자 · 분홍 테 · 짙은 보라 속) + 지글 → 140ms 뒤 네온 선 조각. 프레임당 FX_PER_FRAME */
  private drainFx(api: GameSceneAPI): void {
    const scene = api.scene;
    for (let i = 0; i < GlitchAbility.FX_PER_FRAME && this.fxQueue.length > 0; i++) {
      const slot = this.neon.findIndex(set => !set[1].visible);
      if (slot < 0) break;   // 풀이 다 찼다 — 다음 프레임에
      const f = this.fxQueue.shift()!;
      const [shadow, rim, inner] = this.neon[slot];
      shadow.setTexture(f.key, f.frame).setTintFill(GlitchAbility.CYAN).setPosition(f.x + 2, f.y - 1).setScale(f.scale * 1.2).setAlpha(0.9).setVisible(true);
      rim.setTexture(f.key, f.frame).setTintFill(GlitchAbility.PINK).setPosition(f.x, f.y).setScale(f.scale * 1.2).setAlpha(1).setVisible(true);
      inner.setTexture(f.key, f.frame).setTintFill(GlitchAbility.BACK).setPosition(f.x, f.y).setScale(f.scale * 0.98).setAlpha(0.85).setVisible(true);
      const spark = this.sparks[slot];
      spark?.setPosition(f.x, f.y).setScale(f.disp / GlitchAbility.SPARK_FOR).setVisible(true).play(GlitchAbility.ANIM.spark);
      this.later(api, 140, () => {
        [shadow, rim, inner].forEach(o => o.setVisible(false));
        spark?.stop().setVisible(false);
        this.scatterBits(scene, f.x, f.y, GlitchAbility.BITS_PER_POOP, 1);
      });
    }
  }

  /** 네온 선 조각 n 개 — 무작위 방향 · 회전 · 약한 낙하 (고른 바퀴살 아님). 풀이 비면 그만큼 건너뛴다 */
  private scatterBits(scene: Phaser.Scene, x: number, y: number, n: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const b = this.bits.find(o => !o.visible);
      if (!b) return;
      const ang = Math.random() * Math.PI * 2, d = 20 + Math.random() * 26;
      b.setFrame(Math.floor(Math.random() * 4)).setPosition(x, y).setRotation(Math.random() * 6.28).setScale(size * (0.8 + Math.random() * 0.4)).setAlpha(1).setVisible(true);
      scene.tweens.add({
        targets: b, x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d + 14, rotation: b.rotation + (Math.random() - 0.5) * 3, alpha: 0,
        duration: 350, ease: 'Quad.easeOut', onComplete: () => b.setVisible(false),
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 공통
  // ─────────────────────────────────────────────────────────────

  /** 점수 — addAbilityBonus(→ updateScore, 규칙 3) + '+N' 글자 */
  private award(api: GameSceneAPI, pts: number, x: number, y: number): void {
    if (pts <= 0) return;
    api.addAbilityBonus(pts);
    const txt = api.scene.add.text(x, y, `+${pts}`, {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#ff8ac4', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);
    this.texts.add(txt);
    api.scene.tweens.add({ targets: txt, y: y - 40, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => { this.texts.delete(txt); txt.destroy(); } });
  }

  /** 예약 타이머 — 씬 시계(히트스톱 · 일시정지와 같이 멈춤), onDestroy 에서 전부 뗀다 */
  private later(api: GameSceneAPI, ms: number, fn: () => void): void {
    const t = api.scene.time.delayedCall(ms, () => {
      const i = this.pending.indexOf(t);
      if (i >= 0) this.pending.splice(i, 1);
      fn();
    });
    this.pending.push(t);
  }

  override onUpdate(api: GameSceneAPI): void {
    this.loader?.step();
    // 압축 상태를 먼저 정리한다 — 회수 · 재사용된 똥이 compressed 에서 빠진 뒤 꺾쇠를 그려야 그 똥에 한 프레임 남지 않는다 (fa1353b1 리뷰)
    this.updateCompressed(api);
    this.updateSlits(api);
    if (this.brackets) this.drawBrackets(api.scene.time.now);
    this.drainFx(api);
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.compressTimer?.remove();
    this.riftTimer?.remove();
    this.compressTimer = null;
    this.riftTimer = null;
    this.pending.forEach(t => t.remove());
    this.pending = [];
    this.loader?.stop();
    this.loader = null;
    // 압축된 똥은 원래 크기로 — 판이 끝나도 풀의 똥은 다음 판에 다시 쓰인다
    for (const [p, c] of this.compressed) this.release(p, c);
    this.fxQueue = [];
    this.openSlits = [];
    this.brackets = null;
    const all: Phaser.GameObjects.GameObject[] = [
      ...this.texts,
      ...(this.bracketG ? [this.bracketG] : []), ...this.outlinePool, ...this.rifts, ...this.sparks, ...this.neon.flat(), ...this.bits,
    ];
    for (const o of all) { o.scene?.tweens.killTweensOf(o); o.destroy(); }
    this.texts.clear();
    this.bracketG = null;
    this.outlinePool = [];
    this.rifts = [];
    this.sparks = [];
    this.neon = [];
    this.bits = [];
  }
}
