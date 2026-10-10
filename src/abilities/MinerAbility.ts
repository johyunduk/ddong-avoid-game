import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI, SpecialPoopType } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { MINER_PARAMS, MINER_DEFERRED_SHEETS } from '../config/abilityParams';
import { fxPickSheetKey, loadFxPickSheet } from '../utils/vfx';
import { StagedLoader } from './stagedLoader';

/**
 * 광부 (SR) — 「발파」. 값은 MINER_PARAMS (planner proposal_v7b §1 정정본)
 *
 * - 기본 「작은 발파」: smallEverySec 마다 작은 다이너마이트를 머리 위로 던진다. x 는 머리 위 ±smallAimX 안에서
 *   폭발 반경에 일반 똥이 가장 많이 드는 쪽, smallHeight 위에서 smallFuseSec 뒤 '퍽' — 반경 smallRadius 안의
 *   화면 안 일반 똥을 **그 프레임에** 최대 smallMax 개 회수 (개당 smallPoints). 연기는 폭발 시트 smallScale 배
 * - 필살 「대발파」: 플레이 점수 bigInterval 마다 (자기 보너스 제외 — awardBonus 가드, 노이즈 서리와 같은 카운터).
 *   모으기 bigGatherSec (무적) 동안 다이너마이트 묶음이 머리 위 bigHeight 로 날아가 '쾅' — 반경 bigRadius 안
 *   화면 안 일반 똥 최대 bigMax 개를 그 프레임에 회수 (개당 bigPoints), 연기 bigScale 배.
 *   이어서 **게임의 실제 특수 똥** 비 — 금 rainGold · 다이아 rainDiamond · 무지개 rainRainbow 를 폭발점 ±rainSpread
 *   부채꼴로 rainSpawnSec 에 나눠 뿌리고, 떨어지는 속도는 rainSpeed 배 (받으면 원래 규칙대로 수집)
 * - 특수 똥 수집 보너스 +specialBonus (그대로). 옛 무지개똥 생성은 없앴다 — 무지개는 대발파 비가 맡는다
 *
 * 성능 · 정리 (노이즈 · 글리치와 같은 규칙): 시트 2장은 판 시작 뒤 StagedLoader. 오브젝트는 판 시작에 한 번 —
 * 다이너마이트 Image 2 (작은 것 · 묶음) · 폭발 Sprite 2 · 바위 Image ROCK_POOL. 다이너마이트 그림은 코드로 한 번 굽는다
 * (miner_dynamite — characterTextures 해제 접두사). 회수는 같은 프레임, 바위 연출만 프레임당 FX_PER_FRAME.
 * 똥 참조는 들고 있지 않는다 — 폭발 자리는 좌표로만, 비로 뿌린 특수 똥은 만든 그 자리에서만 만진다.
 * 타이머는 씬 시계 (히트스톱 · 일시정지와 같이 멈춤) · onDestroy 에서 정리. 점수는 awardBonus(→ addAbilityBonus → updateScore)
 */
export class MinerAbility extends BaseAbility {
  /** 게임 시계 (delta × timeScale) — 작은 발파 주기. scene.time.now 는 히트스톱 동안에도 흐른다 */
  private gameMs = 0;
  private lastSmallAt = 0;
  /** 다음 대발파까지 쌓인 플레이 점수 (자기 보너스 제외 — 계단 없음) */
  private bigProgress = 0;
  /** 대발파 진행 중 (모으기 ~ 비 다 뿌릴 때까지) — 그동안 작은 발파 · 다음 대발파를 미룬다 */
  private bigActive = false;
  private fxQueue: { x: number; y: number }[] = [];
  private pending: Phaser.Time.TimerEvent[] = [];
  private loader: StagedLoader | null = null;
  private texts = new Set<Phaser.GameObjects.Text>();

  private stickSmall: Phaser.GameObjects.Image | null = null;
  private stickBig: Phaser.GameObjects.Image | null = null;
  private blastSmall: Phaser.GameObjects.Sprite | null = null;
  private blastBig: Phaser.GameObjects.Sprite | null = null;
  private rocks: Phaser.GameObjects.Image[] = [];

  /** 측정용 (밸런스 하네스) — 작은 발파 횟수 · 지운 수 / 대발파 횟수 · 지운 수 / 비로 뿌린 특수 똥 수 */
  smallBlasts = 0;
  smallKills = 0;
  bigBlasts = 0;
  bigKills = 0;
  rainSpawned = 0;

  private static readonly FX_PER_FRAME = 4;
  private static readonly ROCK_POOL = 24;
  /** 폭발 재생 속도 — 시트 칸 256, 원점 = 칸 가운데 (가공 때 안내 원 가운데를 칸 가운데로 옮김) */
  private static readonly BLAST_FPS = 14;
  static readonly DYNAMITE_KEY = 'miner_dynamite';
  private static readonly K = {
    blast: fxPickSheetKey(MINER_DEFERRED_SHEETS[0]),
    rock: fxPickSheetKey(MINER_DEFERRED_SHEETS[1]),
  } as const;
  private static readonly ANIM_BLAST = 'miner_blast';

  override onCollectSpecial(_type: SpecialPoopType): number {
    return MINER_PARAMS.specialBonus;
  }

  // ─────────────────────────────────────────────────────────────
  // 수명
  // ─────────────────────────────────────────────────────────────

  override onCreate(api: GameSceneAPI): void {
    // 판마다 새 인스턴스지만 상태는 여기서 명시적으로 처음으로 (규칙 1)
    this.gameMs = 0;
    this.lastSmallAt = 0;
    this.bigProgress = 0;
    this.bigActive = false;
    this.fxQueue = [];
    this.pending = [];
    this.texts = new Set();
    this.rocks = [];
    this.stickSmall = this.stickBig = this.blastSmall = this.blastBig = null;
    this.smallBlasts = this.smallKills = this.bigBlasts = this.bigKills = this.rainSpawned = 0;
    const scene = api.scene;
    MinerAbility.bakeDynamite(scene);
    this.stickSmall = scene.add.image(0, 0, MinerAbility.DYNAMITE_KEY).setDepth(5.5).setVisible(false);
    this.stickBig = scene.add.image(0, 0, MinerAbility.DYNAMITE_KEY).setDepth(5.5).setVisible(false);
    this.loader = new StagedLoader(
      scene,
      MINER_DEFERRED_SHEETS.map(f => ({ key: fxPickSheetKey(f), enqueue: (sc: Phaser.Scene) => loadFxPickSheet(sc, f) })),
      250, 600,
      key => this.onSheetLoaded(scene, key),
    );
    for (const f of MINER_DEFERRED_SHEETS) this.onSheetLoaded(scene, fxPickSheetKey(f));   // 다시 하기 — 이미 있는 시트
  }

  private onSheetLoaded(scene: Phaser.Scene, key: string): void {
    if (!scene.textures.exists(key)) return;
    const K = MinerAbility.K;
    if (key === K.blast && !this.blastSmall) {
      if (!scene.anims.exists(MinerAbility.ANIM_BLAST)) {
        scene.anims.create({ key: MinerAbility.ANIM_BLAST, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 5 }), frameRate: MinerAbility.BLAST_FPS, repeat: 0 });
      }
      this.blastSmall = scene.add.sprite(0, 0, key, 0).setDepth(5.6).setVisible(false);
      this.blastBig = scene.add.sprite(0, 0, key, 0).setDepth(5.6).setVisible(false);
    } else if (key === K.rock && this.rocks.length === 0) {
      for (let i = 0; i < MinerAbility.ROCK_POOL; i++) this.rocks.push(scene.add.image(0, 0, key, i % 4).setDepth(5.7).setVisible(false));
    }
  }

  /** 다이너마이트 한 자루 (빨간 막대 · 끈 · 심지) — 코드로 한 번 굽는다. 묶음은 같은 그림을 키워 쓴다 */
  private static bakeDynamite(scene: Phaser.Scene): void {
    const key = MinerAbility.DYNAMITE_KEY;
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3a1d14, 1).fillRoundedRect(4, 9, 16, 26, 3);                  // 테두리
    g.fillStyle(0xd63a30, 1).fillRoundedRect(6, 11, 12, 22, 2);                 // 막대
    g.fillStyle(0xfa8270, 1).fillRect(8, 13, 2, 18);                            // 밝은 면
    g.fillStyle(0x7a5032, 1).fillRect(4, 19, 16, 4);                            // 묶은 끈
    g.lineStyle(2, 0x3c3228, 1).beginPath().moveTo(12, 10).lineTo(14, 5).lineTo(17, 2).strokePath();   // 심지
    g.generateTexture(key, 24, 36);
    g.destroy();
  }

  override onDestroy(api: GameSceneAPI): void {
    this.pending.forEach(t => t.remove());
    this.pending = [];
    this.loader?.stop();
    this.loader = null;
    this.fxQueue = [];
    this.bigActive = false;
    const all = [this.stickSmall, this.stickBig, this.blastSmall, this.blastBig, ...this.rocks, ...this.texts];
    this.texts.clear();
    for (const o of all) { if (!o) continue; o.scene?.tweens.killTweensOf(o); o.destroy(); }
    this.stickSmall = this.stickBig = this.blastSmall = this.blastBig = null;
    this.rocks = [];
    void api;
  }

  // ─────────────────────────────────────────────────────────────
  // 매 프레임 — 작은 발파 주기 · 바위 연출
  // ─────────────────────────────────────────────────────────────

  override onUpdate(api: GameSceneAPI): void {
    this.loader?.step();
    const clock = api.scene.time;
    this.gameMs += clock.paused ? 0 : api.scene.game.loop.delta * clock.timeScale;
    if (!this.bigActive && this.gameMs - this.lastSmallAt >= MINER_PARAMS.smallEverySec * 1000) {
      this.lastSmallAt = this.gameMs;
      this.throwSmall(api);
    }
    for (let i = 0; i < MinerAbility.FX_PER_FRAME && this.fxQueue.length > 0; i++) {
      const f = this.fxQueue.shift()!;
      this.flingRock(api.scene, f.x, f.y, 70 + Math.random() * 60);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 기본 「작은 발파」
  // ─────────────────────────────────────────────────────────────

  private throwSmall(api: GameSceneAPI): void {
    const P = MINER_PARAMS;
    const by = api.player.y - P.smallHeight;
    // 머리 위 ±smallAimX 안에서 반경에 일반 똥이 가장 많이 드는 x (같으면 가운데)
    let bx = api.player.x, best = -1;
    for (const dx of [0, -P.smallAimX, P.smallAimX, -P.smallAimX / 2, P.smallAimX / 2]) {
      const n = this.countIn(api, api.player.x + dx, by, P.smallRadius);
      if (n > best) { best = n; bx = api.player.x + dx; }
    }
    this.smallBlasts++;
    this.fly(api, this.stickSmall, 1, bx, by, P.smallFuseSec * 1000, () => {
      const n = this.blast(api, bx, by, P.smallRadius, P.smallMax, P.smallPoints, this.blastSmall, P.smallScale, 3);
      this.smallKills += n;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 필살 「대발파」 + 특수 똥 비
  // ─────────────────────────────────────────────────────────────

  override onScoreMilestone(_score: number, api: GameSceneAPI): void {
    // 점수 1점마다 불린다. 자기 보너스는 세지 않는다 (awardBonus 가 awarding 을 세운다).
    // 카운터라 보너스가 배수를 넘겨도 삼켜지지 않고, 진행 중에 차면 끝난 뒤 첫 점수에 나간다
    if (this.awarding) return;
    if (this.bigProgress < MINER_PARAMS.bigInterval) this.bigProgress++;
    if (this.bigProgress < MINER_PARAMS.bigInterval || this.bigActive) return;
    this.bigProgress = 0;
    this.startBig(api);
  }

  private startBig(api: GameSceneAPI): void {
    const P = MINER_PARAMS;
    this.bigActive = true;
    this.bigBlasts++;
    // 무적 — 모으기 동안 (+ 여유 한두 프레임: 물리 겹침이 폭발 회수보다 먼저 돈다)
    api.player.setInvincibleBriefly(P.bigGatherSec * 1000 + 100);
    const bx = Phaser.Math.Clamp(api.player.x, P.bigRadius * 0.4, api.scene.cameras.main.width - P.bigRadius * 0.4);
    const by = api.player.y - P.bigHeight;
    this.fly(api, this.stickBig, 1.7, bx, by, P.bigGatherSec * 1000, () => {
      this.bigKills += this.blast(api, bx, by, P.bigRadius, P.bigMax, P.bigPoints, this.blastBig, P.bigScale, 12);
      api.scene.cameras.main.shake(180, 0.006);
      this.rain(api, bx, by);
    });
  }

  /** 특수 똥 비 — 금 · 다이아 · 무지개를 섞어 rainSpawnSec 에 나눠 뿌린다. 폭발점 ±rainSpread 부채꼴 · 속도 rainSpeed 배 */
  private rain(api: GameSceneAPI, bx: number, by: number): void {
    const P = MINER_PARAMS, W = api.scene.cameras.main.width;
    const kinds: SpecialPoopType[] = [
      ...Array<SpecialPoopType>(P.rainGold).fill('gold'),
      ...Array<SpecialPoopType>(P.rainDiamond).fill('diamond'),
      ...Array<SpecialPoopType>(P.rainRainbow).fill('rainbow'),
    ];
    Phaser.Utils.Array.Shuffle(kinds);
    const step = (P.rainSpawnSec * 1000) / Math.max(1, kinds.length);
    kinds.forEach((kind, i) => this.later(api, i * step, () => {
      // 퍼짐 — 부채꼴: 끝 쪽일수록 멀리. 도착 x 를 화면 안으로
      const t = kinds.length > 1 ? i / (kinds.length - 1) : 0.5;
      const off = (t * 2 - 1) * P.rainSpread * (0.7 + Math.random() * 0.3) * (i % 2 ? 1 : -1);
      const tx = Phaser.Math.Clamp(bx + off, 30, W - 30);
      this.spawnRain(api, kind, bx + (tx - bx) * 0.2, by + Math.random() * 30 - 15, (tx - bx) * 0.8 / P.rainFallSec);
      if (i === kinds.length - 1) this.bigActive = false;
    }));
    if (kinds.length === 0) this.bigActive = false;
  }

  /** 특수 똥 하나 — GameScene 의 원래 생성 경로로 만들고, 만든 그 자리에서 위치 · 속도만 바꾼다 (참조를 들고 있지 않음) */
  private spawnRain(api: GameSceneAPI, kind: SpecialPoopType, x: number, y: number, vx: number): void {
    const group = kind === 'gold' ? api.goldPoops : kind === 'diamond' ? api.diamondPoops : api.rainbowPoops;
    const before = new Set(group.getChildren().filter(o => o.active));
    if (kind === 'gold') api.spawnGoldPoopAt(x, y);
    else if (kind === 'diamond') api.spawnDiamondPoop();
    else api.spawnRainbowPoop();
    const p = group.getChildren().find(o => o.active && !before.has(o)) as PoolablePoopBase | undefined;
    if (!p) return;
    const body = p.body as Phaser.Physics.Arcade.Body;
    const vy = body.velocity.y * MINER_PARAMS.rainSpeed;
    body.reset(x, y);
    body.setVelocity(vx, vy);
    this.rainSpawned++;
  }

  // ─────────────────────────────────────────────────────────────
  // 공용 — 던지기 · 폭발
  // ─────────────────────────────────────────────────────────────

  /** 다이너마이트가 광부 손에서 (bx, by) 로 빙글 돌며 날아가 ms 뒤 onBoom */
  private fly(api: GameSceneAPI, stick: Phaser.GameObjects.Image | null, scale: number, bx: number, by: number, ms: number, onBoom: () => void): void {
    const scene = api.scene, sx = api.player.x + 10, sy = api.player.y - 20;
    if (stick) {
      scene.tweens.killTweensOf(stick);
      stick.setPosition(sx, sy).setScale(scale).setAngle(0).setAlpha(1).setVisible(true);
      scene.tweens.add({ targets: stick, x: bx, y: by, angle: 540, duration: ms, ease: 'Quad.easeOut' });
    }
    this.later(api, ms, () => { stick?.setVisible(false); onBoom(); });
  }

  /** 반경 안 화면 안 일반 똥 수 (던질 x 고르기) */
  private countIn(api: GameSceneAPI, x: number, y: number, r: number): number {
    const H = api.scene.cameras.main.height;
    let n = 0;
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (p.active && p.y >= -20 && p.y <= H && (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) n++;
    }
    return n;
  }

  /**
   * 폭발 — 반경 r 안 화면 안 **일반 똥**을 폭발점에 가까운 것부터 최대 max 개, **이 프레임에** 회수하고 점수.
   * 후보 배열은 이 함수 안에서만 쓰고 버린다. 연기 시트 scale 배 · 바위는 폭발점에서 rocks 개 + 지운 자리마다 하나 (대기열)
   */
  private blast(api: GameSceneAPI, x: number, y: number, r: number, max: number, pts: number,
    spr: Phaser.GameObjects.Sprite | null, scale: number, rocks: number): number {
    const H = api.scene.cameras.main.height;
    const cand: { p: PoolablePoopBase; d: number }[] = [];
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || p.y < -20 || p.y > H) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d <= r * r) cand.push({ p, d });
    }
    cand.sort((a, b) => a.d - b.d);
    let n = 0;
    for (const { p } of cand) {
      if (n >= max) break;
      this.fxQueue.push({ x: p.x, y: p.y });
      p.recycle(true);
      n++;
    }
    if (spr) {
      api.scene.tweens.killTweensOf(spr);
      spr.setPosition(x, y).setScale(scale).setAlpha(1).setVisible(true);   // 시트 칸 256 기준 배율 (작은 0.45 → 115px · 큰 1.6 → 410px)
      spr.play(MinerAbility.ANIM_BLAST);
      spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => spr.setVisible(false));
    }
    for (let i = 0; i < rocks; i++) this.flingRock(api.scene, x, y, (60 + Math.random() * 70) * Math.max(1, scale * 0.8));
    if (n > 0) this.award(api, n * pts, x, Math.max(80, y - 40));
    return n;
  }

  /** 바위 조각 하나 — 위로 튀었다가 떨어지며 회전 · 사라짐 (풀) */
  private flingRock(scene: Phaser.Scene, x: number, y: number, spread: number): void {
    const r = this.rocks.find(o => !o.visible);
    if (!r) return;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;   // 위쪽 반원 쪽으로 (떨어지는 결)
    const dx = Math.cos(a) * spread, up = Math.sin(a) * spread * 0.7;
    r.setFrame(Math.floor(Math.random() * 4)).setPosition(x, y).setScale(0.6 + Math.random() * 0.5).setAngle(Math.random() * 360).setAlpha(1).setVisible(true);
    scene.tweens.add({ targets: r, x: x + dx, duration: 620, ease: 'Linear' });
    scene.tweens.add({ targets: r, y: y + up, duration: 220, ease: 'Quad.easeOut', yoyo: false,
      onComplete: () => scene.tweens.add({ targets: r, y: y + up + 160, alpha: 0, duration: 400, ease: 'Quad.easeIn', onComplete: () => r.setVisible(false) }) });
    scene.tweens.add({ targets: r, angle: r.angle + (Math.random() < 0.5 ? -1 : 1) * 360, duration: 620 });
  }

  /** 점수 — awardBonus(→ addAbilityBonus → updateScore, 규칙 3 · 자기 보너스로는 대발파가 차지 않음) + '+N' 글자 */
  private award(api: GameSceneAPI, pts: number, x: number, y: number): void {
    this.awardBonus(api, pts);
    const txt = api.scene.add.text(x, y, `+${pts}`, {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff', stroke: '#5a3812', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);
    this.texts.add(txt);
    api.scene.tweens.add({ targets: txt, y: y - 40, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => { this.texts.delete(txt); txt.destroy(); } });
  }

  /** 예약 타이머 — 씬 시계 (히트스톱 · 일시정지와 같이 멈춤), onDestroy 에서 전부 뗀다 */
  private later(api: GameSceneAPI, ms: number, fn: () => void): void {
    const t = api.scene.time.delayedCall(ms, () => {
      const i = this.pending.indexOf(t);
      if (i >= 0) this.pending.splice(i, 1);
      fn();
    });
    this.pending.push(t);
  }
}
