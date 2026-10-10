import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { NOISE_PARAMS, NOISE_DEFERRED_SHEETS } from '../config/abilityParams';
import { fxPickSheetKey, loadFxPickSheet } from '../utils/vfx';
import { StagedLoader } from './stagedLoader';

/**
 * 노이즈 (SR) v4 — 통신에 잡음이 낀 것 · 안개 · 흐린 신호. 값은 NOISE_PARAMS (planner 1차, v6 는 balance)
 *
 * - 기본 「흐린 발자국」 (대표 설계):
 *   직전 안개 자리에서 fogMinMove 이상 움직였고 fogCooldownSec 이 지났으면 노이즈가 선 자리에 안개가 핀다 (고정 · 동시 1).
 *   몸 중심이 안개 타원(fogRx × fogRy) 안이면 노이즈가 반투명해지고 몸에 닿는 일반 · 특수 똥이 **그냥 지나간다**
 *   (맞지도 줍지도 않음 — GameScene 이 passesThrough 를 무적 다음 · 보호막 앞에서 묻는다). 안개당 passMax 개,
 *   다 쓰면 노이즈가 다시 또렷해진다 (= 꺼짐). 통과 개당 passPoints.
 *   fogLifeSec 뒤 안개가 뭉치고(gather) 압축돼(gustcharge) 돌풍이 위로 발사된다 — 지나가는 세로 띠(gustBand)의 일반 똥을
 *   **지나가는 그 프레임에** 지우고 점수(개당 gustPoints, 상한 gustMax). 뒤에는 늘인 꼬리 한 장, 화면 위에서 흩어짐(twistend).
 * - 특수: 옛 것 그대로 (점수 reductionInterval 배수마다 다음 소환 reductionAmount 감소) — 대표가 특수를 고르면 바꾼다
 *
 * 성능 · 정리 (센티넬 · 글리치와 같은 규칙): 시트 7장은 판 시작 뒤 StagedLoader 로 한 장씩. 오브젝트는 판 시작에 한 번 —
 * 안개 Sprite 2(뒤 · 앞) · 뭉침/압축 Sprite 1 · 돌풍 Sprite 1 · 꼬리 Sprite 1 · 흩어짐 Sprite 1 · 입자 Image 40.
 * 똥 참조는 들고 있지 않는다 — 통과는 똥에 이번 안개 번호만 적어 중복을 막고(아래 PASS_TAG), 지운 자리는 좌표로만 연출.
 * 블렌드 전부 normal. 타이머는 씬 시계 · onDestroy 에서 정리. 점수는 addAbilityBonus(→ updateScore)
 */
export class NoiseAbility extends BaseAbility {
  // ── 옛 특수 ──
  private pendingReduction = 0;

  // ── 기본 「흐린 발자국」 상태 ──
  /** 안개 단계 — idle(없음) · fog(피어 있음, 통과 판정) · burst(뭉침 · 압축 · 돌풍 비행 · 흩어짐) */
  private phase: 'idle' | 'fog' | 'burst' = 'idle';
  /**
   * 직전 안개 자리 · 생긴 시각 (게임 시계 gameMs) — 다음 안개 조건. scene.time.now 는 timeScale 과 무관하게 흘러
   * 히트스톱 · 느린 시간 동안에도 쿨다운이 지나 버린다 → 프레임 delta × timeScale 을 직접 쌓는다 (센티넬 측정 누계와 같은 규칙)
   */
  private gameMs = 0;
  private lastFogX = 0;
  private lastFogAt = -Infinity;
  /** 지금 안개 자리 · 번호 (통과 중복 표시용) · 남은 통과 수 */
  private fogX = 0;
  private fogSerial = 0;
  private passLeft = 0;
  /** 노이즈를 반투명으로 바꿔 놓았는지 — 바꾼 것만 되돌린다 */
  private ghosted = false;
  /** 돌풍 — 발사 자리 x · 촉 y (위로 줄어듦) · 이번 돌풍이 지운 수 · 비행 중인지 */
  private gustX = 0;
  private gustTip = 0;
  private gustKills = 0;
  private gustFlying = false;
  /** 발사 자리 (발밑) — 꼬리 길이 기준 */
  private gustBase = 0;
  /** 지운 자리 연출 대기열 (좌표만) — 프레임당 FX_PER_FRAME */
  private fxQueue: { x: number; y: number }[] = [];
  private pending: Phaser.Time.TimerEvent[] = [];
  private loader: StagedLoader | null = null;

  private fogBack: Phaser.GameObjects.Sprite | null = null;
  private fogFront: Phaser.GameObjects.Sprite | null = null;
  private burstSpr: Phaser.GameObjects.Sprite | null = null;
  private gust: Phaser.GameObjects.Sprite | null = null;
  private tail: Phaser.GameObjects.Sprite | null = null;
  private top: Phaser.GameObjects.Sprite | null = null;
  private motes: Phaser.GameObjects.Image[] = [];

  /** 측정용 (밸런스 하네스) — 안개 수 · 통과 수 · 돌풍 수 · 돌풍으로 지운 똥 */
  fogsMade = 0;
  passes = 0;
  gustsFired = 0;
  gustKillsTotal = 0;

  private static readonly FX_PER_FRAME = 4;
  private static readonly MOTE_POOL = 40;
  private static readonly GHOST_ALPHA = 0.4;
  /** 똥에 적는 '이번 안개에서 이미 통과함' 표시 — 안개 번호. 풀에서 다시 나온 똥은 화면 위에서 나와 같은 안개(1.6초) 안에 몸까지 못 온다 */
  private static readonly PASS_TAG = '__noisePassFog';
  /** 연출 (ms · px) — 표시 크기는 시안(gust_preview_v3)과 같다 */
  private static readonly FOG_DISPLAY_W = 96;
  private static readonly GATHER_MS = 200;
  private static readonly CHARGE_MS = 150;
  private static readonly GUST_W = 56;
  private static readonly TAIL_MAX = 300;
  private static readonly TAIL_OVER = 75;
  private static readonly TOP_MS = 330;
  private static readonly K = {
    fog: fxPickSheetKey(NOISE_DEFERRED_SHEETS[0]),
    gather: fxPickSheetKey(NOISE_DEFERRED_SHEETS[1]),
    charge: fxPickSheetKey(NOISE_DEFERRED_SHEETS[2]),
    gust: fxPickSheetKey(NOISE_DEFERRED_SHEETS[3]),
    tail: fxPickSheetKey(NOISE_DEFERRED_SHEETS[4]),
    top: fxPickSheetKey(NOISE_DEFERRED_SHEETS[5]),
    mote: fxPickSheetKey(NOISE_DEFERRED_SHEETS[6]),
  } as const;
  private static readonly ANIM = {
    fogIn: 'noise_fog_in', fogLoop: 'noise_fog_loop', gather: 'noise_gather', charge: 'noise_gustcharge',
    gust: 'noise_gust', tail: 'noise_gusttail', top: 'noise_twistend',
  } as const;

  // ─────────────────────────────────────────────────────────────
  // 옛 특수 — 소환 감소
  // ─────────────────────────────────────────────────────────────

  override getSpawnCountReduction(): number {
    const r = this.pendingReduction;
    this.pendingReduction = 0;
    return r;
  }

  override onScoreMilestone(score: number, _api: GameSceneAPI): void {
    if (score % NOISE_PARAMS.reductionInterval === 0) {
      this.pendingReduction = NOISE_PARAMS.reductionAmount;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 수명
  // ─────────────────────────────────────────────────────────────

  override onCreate(api: GameSceneAPI): void {
    // 판마다 새 인스턴스지만 상태는 여기서 명시적으로 처음으로 (규칙 1)
    this.pendingReduction = 0;
    this.phase = 'idle';
    this.lastFogX = api.player.x;
    this.lastFogAt = -Infinity;
    this.gameMs = 0;
    this.fogSerial = 0;
    this.passLeft = 0;
    this.ghosted = false;
    this.gustFlying = false;
    this.gustKills = 0;
    this.fxQueue = [];
    this.pending = [];
    this.motes = [];
    this.texts = new Set();
    this.fogsMade = 0;
    this.passes = 0;
    this.gustsFired = 0;
    this.gustKillsTotal = 0;
    const scene = api.scene;
    this.loader = new StagedLoader(
      scene,
      NOISE_DEFERRED_SHEETS.map(f => ({ key: fxPickSheetKey(f), enqueue: (sc: Phaser.Scene) => loadFxPickSheet(sc, f) })),
      250, 600,
      key => this.onSheetLoaded(scene, api, key),
    );
    for (const f of NOISE_DEFERRED_SHEETS) this.onSheetLoaded(scene, api, fxPickSheetKey(f));   // 다시 하기 — 이미 있는 시트
  }

  /** 시트 한 장이 올라왔다 — 애니메이션 · 그 시트를 쓰는 오브젝트를 만든다 (이미 있으면 건너뛴다) */
  private onSheetLoaded(scene: Phaser.Scene, api: GameSceneAPI, key: string): void {
    if (!scene.textures.exists(key)) return;
    const K = NoiseAbility.K, A = NoiseAbility.ANIM;
    const anim = (k: string, frames: number[], rate: number, repeat: number) => {
      if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: frames.map(frame => ({ key, frame })), frameRate: rate, repeat });
    };
    if (key === K.fog && !this.fogBack) {
      anim(A.fogIn, [0, 1], 13, 0);
      anim(A.fogLoop, [2, 3, 4, 5], 6, -1);
      this.fogBack = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setVisible(false);
      this.fogFront = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setAlpha(0.45).setVisible(false);
      // 뒤 안개는 노이즈 아래, 앞 안개는 위 — 안개 '속'에 들어가 있는 것처럼
      scene.children.moveBelow(this.fogBack as Phaser.GameObjects.GameObject, api.player as unknown as Phaser.GameObjects.GameObject);
    } else if (key === K.gather && !this.burstSpr) {
      // 뭉침 · 압축은 같은 Sprite 하나로 차례로 (텍스처만 바꿔 낀다)
      anim(A.gather, [0, 1, 2, 3], 20, 0);
      this.burstSpr = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setDepth(5).setVisible(false);
    } else if (key === K.charge) {
      anim(A.charge, [0, 1, 2], 20, 0);
    } else if (key === K.gust && !this.gust) {
      anim(A.gust, [0, 1, 2, 3, 4, 5], 18, -1);
      this.gust = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 0).setDepth(5.2).setVisible(false);
    } else if (key === K.tail && !this.tail) {
      anim(A.tail, [0, 1, 2, 3, 4, 5], 18, -1);
      this.tail = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 0).setDepth(5.1).setVisible(false);
    } else if (key === K.top && !this.top) {
      anim(A.top, [0, 1, 2, 3], 12, 0);
      this.top = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setDepth(5.2).setVisible(false);
    } else if (key === K.mote && this.motes.length === 0) {
      for (let i = 0; i < NoiseAbility.MOTE_POOL; i++) this.motes.push(scene.add.image(0, 0, key, i % 4).setDepth(5.3).setVisible(false));
    }
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.pending.forEach(t => t.remove());
    this.pending = [];
    this.loader?.stop();
    this.loader = null;
    this.fxQueue = [];
    this.phase = 'idle';
    this.gustFlying = false;
    if (this.ghosted) { _api.player.setAlpha(1); this.ghosted = false; }   // 반투명으로 끝난 판이면 되돌린다
    const all = [this.fogBack, this.fogFront, this.burstSpr, this.gust, this.tail, this.top, ...this.motes, ...this.texts];
    this.texts.clear();
    for (const o of all) { if (!o) continue; o.scene?.tweens.killTweensOf(o); o.destroy(); }
    this.fogBack = this.fogFront = this.burstSpr = this.gust = this.tail = this.top = null;
    this.motes = [];
  }

  // ─────────────────────────────────────────────────────────────
  // 통과 — GameScene 이 맞음 · 수집 직전에 묻는다
  // ─────────────────────────────────────────────────────────────

  /** 몸 중심이 지금 안개 타원 안인가 (통과가 남아 있을 때만 의미) */
  private inFog(api: GameSceneAPI): boolean {
    if (this.phase !== 'fog') return false;
    const P = NOISE_PARAMS, cy = api.player.y + 40 - P.fogRy;
    const dx = (api.player.x - this.fogX) / P.fogRx, dy = (api.player.y - cy) / P.fogRy;
    return dx * dx + dy * dy <= 1;
  }

  override passesThrough(poop: Phaser.GameObjects.GameObject, api: GameSceneAPI): boolean {
    if (!this.inFog(api)) return false;
    const tagged = poop as unknown as Record<string, number | undefined>;
    if (tagged[NoiseAbility.PASS_TAG] === this.fogSerial) return true;   // 이번 안개에서 이미 지나가는 중 — 다시 세지 않는다
    if (this.passLeft <= 0) return false;
    tagged[NoiseAbility.PASS_TAG] = this.fogSerial;
    this.passLeft--;
    this.passes++;
    if (NOISE_PARAMS.passPoints > 0) api.addAbilityBonus(NOISE_PARAMS.passPoints);
    return true;
  }

  // ─────────────────────────────────────────────────────────────
  // 매 프레임
  // ─────────────────────────────────────────────────────────────

  override onUpdate(api: GameSceneAPI): void {
    this.loader?.step();
    const clock = api.scene.time;
    this.gameMs += clock.paused ? 0 : api.scene.game.loop.delta * clock.timeScale;
    const now = this.gameMs;
    if (this.phase === 'idle' && this.fogBack
      && Math.abs(api.player.x - this.lastFogX) >= NOISE_PARAMS.fogMinMove
      && now - this.lastFogAt >= NOISE_PARAMS.fogCooldownSec * 1000) {
      this.spawnFog(api);
    }
    // 안개 속 노이즈 — 반투명 (통과가 남아 있는 동안만)
    const ghost = this.inFog(api) && this.passLeft > 0;
    if (ghost !== this.ghosted) { api.player.setAlpha(ghost ? NoiseAbility.GHOST_ALPHA : 1); this.ghosted = ghost; }
    if (this.fogFront?.visible && this.passLeft <= 0) this.fogFront.setAlpha(0.25);
    if (this.gustFlying) this.flyGust(api);
    this.drainFx(api);
  }

  private spawnFog(api: GameSceneAPI): void {
    const scene = api.scene, x = api.player.x, base = api.player.y + 44;
    this.phase = 'fog';
    this.fogX = x;
    this.lastFogX = x;
    this.lastFogAt = this.gameMs;
    this.fogSerial++;
    this.passLeft = NOISE_PARAMS.passMax;
    this.fogsMade++;
    const s = NoiseAbility.FOG_DISPLAY_W / 152;
    for (const f of [this.fogBack, this.fogFront]) {
      if (!f) continue;
      scene.tweens.killTweensOf(f);
      f.setPosition(x, base).setScale(s).setVisible(true);
      f.play(NoiseAbility.ANIM.fogIn);
      f.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => f.play(NoiseAbility.ANIM.fogLoop));
    }
    this.fogFront?.setAlpha(0.45);
    this.later(api, NOISE_PARAMS.fogLifeSec * 1000, () => this.burst(api));
  }

  /** 안개가 끝났다 — 뭉침 → 압축 → 돌풍 발사 */
  private burst(api: GameSceneAPI): void {
    this.phase = 'burst';
    for (const f of [this.fogBack, this.fogFront]) { f?.anims.stop(); f?.setVisible(false); }
    const x = this.fogX, base = api.player.y + 44, b = this.burstSpr;
    if (b) {
      b.setTexture(NoiseAbility.K.gather, 0).setPosition(x, base).setScale(70 / 128).setAlpha(1).setVisible(true);
      b.play(NoiseAbility.ANIM.gather);
    }
    this.later(api, NoiseAbility.GATHER_MS, () => {
      if (b && api.scene.textures.exists(NoiseAbility.K.charge)) {
        b.setTexture(NoiseAbility.K.charge, 0).setScale(70 / 104).setPosition(x, base);
        b.play(NoiseAbility.ANIM.charge);
      }
    });
    this.later(api, NoiseAbility.GATHER_MS + NoiseAbility.CHARGE_MS, () => {
      b?.anims.stop(); b?.setVisible(false);
      this.launch(api, x, base);
    });
  }

  private launch(api: GameSceneAPI, x: number, base: number): void {
    this.gustX = x;
    this.gustKills = 0;
    this.gustsFired++;
    const g = this.gust, s = NoiseAbility.GUST_W / 92;
    const h = 299 * s;
    this.gustTip = base - h;
    this.gustFlying = true;
    this.gustBase = base;
    if (g) { g.setPosition(x, this.gustTip).setScale(s).setAlpha(1).setVisible(true); g.play(NoiseAbility.ANIM.gust); }
    if (this.tail) { this.tail.setPosition(x, this.gustTip + h - NoiseAbility.TAIL_OVER).setScale(s, 0.01).setAlpha(1).setVisible(true); this.tail.play(NoiseAbility.ANIM.tail); }
    this.cut(api, base);   // 발사 프레임 — 몸통이 덮은 높이까지
  }


  /** 돌풍 비행 한 프레임 — 위로 올리고, 이번 프레임에 지나간 높이의 띠를 지운다. 꼬리를 늘린다 */
  private flyGust(api: GameSceneAPI): void {
    const scene = api.scene;
    const dt = scene.time.paused ? 0 : scene.game.loop.delta * scene.time.timeScale / 1000;
    const prevTip = this.gustTip;
    this.gustTip -= NOISE_PARAMS.gustSpeed * dt;
    this.cut(api, prevTip);
    const s = NoiseAbility.GUST_W / 92, h = 299 * s;
    this.gust?.setY(this.gustTip);
    if (this.tail) {
      const top = this.gustTip + h - NoiseAbility.TAIL_OVER;
      const len = Math.max(1, Math.min(NoiseAbility.TAIL_MAX, this.gustBase - top));
      this.tail.setY(top).setScale(s, len / 192);
    }
    if (this.gustTip + h < 0) this.finishGust(api);
  }

  /** 띠(gustBand)에서 촉이 지금 지나간 높이 [gustTip, below] 의 일반 똥을 이 프레임에 지운다 — 상한 gustMax */
  private cut(api: GameSceneAPI, below: number): void {
    const P = NOISE_PARAMS;
    if (this.gustKills >= P.gustMax) return;
    let n = 0;
    for (const obj of api.poops.getChildren()) {
      if (this.gustKills + n >= P.gustMax) break;
      const p = obj as PoolablePoopBase;
      if (!p.active || Math.abs(p.x - this.gustX) > P.gustBand / 2) continue;
      if (p.y < this.gustTip || p.y > below) continue;
      this.fxQueue.push({ x: p.x, y: p.y });
      p.recycle(true);
      n++;
    }
    if (n > 0) {
      this.gustKills += n;
      this.gustKillsTotal += n;
      if (P.gustPoints > 0) this.award(api, n * P.gustPoints, this.gustX, Math.max(60, this.gustTip + 40));
    }
  }

  private finishGust(api: GameSceneAPI): void {
    this.gustFlying = false;
    const scene = api.scene;
    this.gust?.anims.stop(); this.gust?.setVisible(false);
    if (this.top) {
      this.top.setPosition(this.gustX, 340).setScale(90 / 144).setAlpha(0.9).setVisible(true);
      this.top.play(NoiseAbility.ANIM.top);
      scene.tweens.add({ targets: this.top, alpha: 0, delay: NoiseAbility.TOP_MS - 120, duration: 120, onComplete: () => this.top?.setVisible(false) });
    }
    if (this.tail) scene.tweens.add({ targets: this.tail, alpha: 0, duration: 300, onComplete: () => { this.tail?.anims.stop(); this.tail?.setVisible(false); } });
    this.puff(scene, this.gustX, 120, 10, 40);
    this.phase = 'idle';
  }

  // ─────────────────────────────────────────────────────────────
  // 연출 도우미
  // ─────────────────────────────────────────────────────────────

  /** 지운 자리 — 안개 입자로 풀림. 프레임당 FX_PER_FRAME */
  private drainFx(api: GameSceneAPI): void {
    for (let i = 0; i < NoiseAbility.FX_PER_FRAME && this.fxQueue.length > 0; i++) {
      const f = this.fxQueue.shift()!;
      this.puff(api.scene, f.x, f.y, 8, 26);
    }
  }

  private puff(scene: Phaser.Scene, x: number, y: number, n: number, spread: number): void {
    for (let i = 0; i < n; i++) {
      const m = this.motes.find(o => !o.visible);
      if (!m) return;
      const a = Math.random() * Math.PI * 2, d = spread * (0.4 + Math.random() * 0.6);
      m.setFrame(i % 4).setPosition(x, y).setScale(0.5 + Math.random() * 0.5).setAlpha(1).setVisible(true);
      scene.tweens.add({
        targets: m, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6 - 18, alpha: 0,
        duration: 380, ease: 'Quad.easeOut', onComplete: () => m.setVisible(false),
      });
    }
  }

  /** 점수 — addAbilityBonus(→ updateScore, 규칙 3) + '+N' 글자 */
  private award(api: GameSceneAPI, pts: number, x: number, y: number): void {
    api.addAbilityBonus(pts);
    const txt = api.scene.add.text(x, y, `+${pts}`, {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff', stroke: '#3a305c', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);
    this.texts.add(txt);
    api.scene.tweens.add({ targets: txt, y: y - 40, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => { this.texts.delete(txt); txt.destroy(); } });
  }

  private texts = new Set<Phaser.GameObjects.Text>();

  /** 예약 타이머 — 씬 시계(히트스톱 · 일시정지와 같이 멈춤), onDestroy 에서 전부 뗀다 */
  private later(api: GameSceneAPI, ms: number, fn: () => void): void {
    const t = api.scene.time.delayedCall(ms, () => {
      const i = this.pending.indexOf(t);
      if (i >= 0) this.pending.splice(i, 1);
      fn();
    });
    this.pending.push(t);
  }
}
