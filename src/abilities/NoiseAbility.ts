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
 *   직전 안개를 피운 자리에서 fogMinMove 이상 움직였고 fogCooldownSec 이 지났으면 안개가 핀다 (고정 · 동시 1) — 자리는
 *   **가려는 방향의 앞쪽**: 마지막 이동 방향(좌/우)으로 몸 앞 fogAhead px (화면 가장자리에서 clamp). 막 멈춰 있으면 제자리.
 *   몸 중심이 안개 타원(fogRx × fogRy) 안이면 노이즈가 반투명해지고 몸에 닿는 일반 · 특수 똥이 **그냥 지나간다**
 *   (맞지도 줍지도 않음 — GameScene 이 passesThrough 를 무적 다음 · 보호막 앞에서 묻는다). 안개당 passMax 개,
 *   다 쓰면 노이즈가 다시 또렷해진다 (= 꺼짐). 통과 개당 passPoints.
 *   fogLifeSec 뒤 안개가 뭉치고(gather) 압축돼(gustcharge) 돌풍이 위로 발사된다 — 지나가는 세로 띠(gustBand)의 일반 똥을
 *   **지나가는 그 프레임에** 지우고 점수(개당 gustPoints, 상한 gustMax). 뒤에는 늘인 꼬리 한 장, 화면 위에서 흩어짐(twistend).
 * - 특수 「서리 안개」 (자동 — 플레이 점수 frostInterval 마다. 자기 보너스(통과 · 돌풍 · 서리)는 세지 않는다, 매화 · 레드와 같은 가드):
 *   모으기 frostGatherSec (무적, 노이즈 발밑에 찬 안개) → 화면 전체에 뿌연 서리 안개가 frostFillSec 동안 차오르고,
 *   다 차는 순간 화면의 **일반 똥**을 한꺼번에 얼음 덮개에 가둬 그 자리에 멈춘다 (속도 0, 상한 frostMax · 무적은 이때까지).
 *   안개는 결이 보이게 안개 칸을 화면에 겹쳐 깔고 — 가장자리 · 위가 조금 짙고 노이즈 둘레는 옅다. 최대 알파는 낮게 (배경 밝게)
 *   → 얼린 채 frostFreezeSec 까지 · 금이 간 채 frostCrackSec →
 *   **한 프레임에** 언 똥을 전부 회수하고 점수(개당 frostPoints). 조각이 아래로 떨어지는 연출만 프레임당 FX_PER_FRAME 개씩.
 *   언 똥은 abilityTag = −발동 번호 로 가린다 (안개 통과의 +안개 번호와 겹치지 않게). 언 똥은 노이즈 몸을 그냥 지나간다
 *
 * 성능 · 정리 (센티넬 · 글리치와 같은 규칙): 시트 10장은 판 시작 뒤 StagedLoader 로 한 장씩. 오브젝트는 판 시작에 한 번 —
 * 안개 Sprite 2(뒤 · 앞) · 뭉침/압축 Sprite 1 · 돌풍 Sprite 1 · 꼬리 Sprite 1 · 흩어짐 Sprite 1 · 입자 Image 40 ·
 * 서리: 모으기 Sprite 1 · 안개 Sprite VEIL_COLS×VEIL_ROWS + 위 결 Image 3 + 엷은 바탕 Rectangle 1 · 덮개 Image frostMax · 깨짐 Sprite frostMax.
 * 똥 참조는 들고 있지 않는다 — 통과는 똥의 abilityTag 에 이번 안개 번호(1부터)를 적어 중복을 막고(회수 · 재사용 때 0 으로 지워진다), 지운 자리는 좌표로만 연출.
 * 블렌드 전부 normal. 타이머는 씬 시계 · onDestroy 에서 정리. 점수는 addAbilityBonus(→ updateScore)
 */
export class NoiseAbility extends BaseAbility {
  // ── 필살 「서리 안개」 상태 ──
  /** idle · gather(모으기, 무적) · spread(막이 번지며 얼림) · crack(금 간 채 멈춤) — 단계 시작 시각은 frostT (gameMs) */
  private frost: 'idle' | 'gather' | 'spread' | 'crack' = 'idle';
  private frostT = 0;
  /** 발동 번호 — 언 똥의 abilityTag 는 −frostSerial */
  private frostSerial = 0;
  /** 다음 발동까지 쌓인 플레이 점수 (자기 보너스 제외 — 계단 없음) */
  private frostProgress = 0;
  /** 이번 발동에 언 수 · 이번 발동에 이미 얼렸는지 */
  private frozenNow = 0;
  private frozeAll = false;
  /** 깨짐 연출 대기열 (좌표 · 조각 번호만) — 프레임당 FX_PER_FRAME */
  private shardQueue: { x: number; y: number; i: number }[] = [];
  private frostGather: Phaser.GameObjects.Sprite | null = null;
  private films: Phaser.GameObjects.Image[] = [];
  private filmBody: Phaser.GameObjects.Rectangle | null = null;
  /** 화면을 덮는 서리 안개 — 안개 칸을 격자로 겹쳐 깐다 */
  private veil: Phaser.GameObjects.Sprite[] = [];
  private shells: Phaser.GameObjects.Image[] = [];
  private shards: Phaser.GameObjects.Sprite[] = [];

  // ── 기본 「흐린 발자국」 상태 ──
  /** 안개 단계 — idle(없음) · fog(피어 있음, 통과 판정) · burst(뭉침 · 압축 · 돌풍 비행 · 흩어짐) */
  private phase: 'idle' | 'fog' | 'burst' = 'idle';
  /**
   * 직전 안개 자리 · 생긴 시각 (게임 시계 gameMs) — 다음 안개 조건. scene.time.now 는 timeScale 과 무관하게 흘러
   * 히트스톱 · 느린 시간 동안에도 쿨다운이 지나 버린다 → 프레임 delta × timeScale 을 직접 쌓는다 (센티넬 측정 누계와 같은 규칙)
   */
  private gameMs = 0;
  private lastFogX = 0;
  /** 마지막 이동 방향(−1 왼쪽 · 1 오른쪽 · 0 없음) · 마지막으로 움직인 게임 시각 · 지난 프레임 x — 안개를 앞쪽에 피우는 기준 */
  private moveDir = 0;
  private lastMoveAt = -Infinity;
  private prevX = 0;
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
  /** 측정용 — 필살 사용 횟수 · 직전 발동에 언 수 · 판 누계 */
  frostUses = 0;
  frostFrozenLast = 0;
  frostFrozenTotal = 0;

  private static readonly FX_PER_FRAME = 4;
  private static readonly MOTE_POOL = 40;
  private static readonly GHOST_ALPHA = 0.4;
  /** 똥에 적는 '이번 안개에서 이미 통과함' 표시 — 안개 번호. 풀에서 다시 나온 똥은 화면 위에서 나와 같은 안개(1.6초) 안에 몸까지 못 온다 */
  /** 연출 (ms · px) — 표시 크기는 시안(gust_preview_v3)과 같다 */
  private static readonly FOG_DISPLAY_W = 96;
  /** 이동 판정 — 프레임당 이만큼(px) 넘게 움직이면 방향 갱신 · 마지막 이동에서 이만큼(ms, 게임 시간) 안이면 '움직이는 중' */
  private static readonly MOVE_EPS = 0.5;
  private static readonly MOVING_MS = 150;
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
    film: fxPickSheetKey(NOISE_DEFERRED_SHEETS[7]),
    shell: fxPickSheetKey(NOISE_DEFERRED_SHEETS[8]),
    shard: fxPickSheetKey(NOISE_DEFERRED_SHEETS[9]),
  } as const;
  /** 서리 연출 — 시안(frost_preview) 값. 막 칸 182×163 · 알파 0.85, 몸 #E2F2FF 0.16 · 깨짐 원점 = 덮개 가운데 */
  private static readonly FROST = {
    filmW: 182, filmH: 163, filmAlpha: 0.6, bodyColor: 0xe2f2ff, bodyAlpha: 0.1,
    /** 안개 격자 — 칸(152×209) 을 veilScale 배로 cols × rows 겹쳐 깜. 알파 = base + edge·가장자리 + top·위쪽, 노이즈 둘레 nearR 안은 nearK 배 */
    veilCols: 4, veilRows: 5, veilScale: 1.6, veilBase: 0.16, veilEdge: 0.12, veilTop: 0.12, nearR: 170, nearK: 0.35,
    tint: 0xdcefff, shardFps: 16, shardOriginX: 0.5, shardOriginY: 0.401, fadeMs: 400, crackAlpha: 0.5, invMarginMs: 100,
  } as const;
  private static readonly ANIM = {
    fogIn: 'noise_fog_in', fogLoop: 'noise_fog_loop', gather: 'noise_gather', charge: 'noise_gustcharge',
    gust: 'noise_gust', tail: 'noise_gusttail', top: 'noise_twistend', shatter: 'noise_iceshatter',
  } as const;

  // ─────────────────────────────────────────────────────────────
  // 수명
  // ─────────────────────────────────────────────────────────────

  override onCreate(api: GameSceneAPI): void {
    // 판마다 새 인스턴스지만 상태는 여기서 명시적으로 처음으로 (규칙 1)
    this.frost = 'idle';
    this.frostT = 0;
    this.frostSerial = 0;
    this.frostProgress = 0;
    this.frozenNow = 0;
    this.shardQueue = [];
    this.frostGather = null;
    this.filmBody = null;
    this.films = [];
    this.veil = [];
    this.frozeAll = false;
    this.shells = [];
    this.shards = [];
    this.frostUses = 0;
    this.frostFrozenLast = 0;
    this.frostFrozenTotal = 0;
    this.phase = 'idle';
    this.lastFogX = api.player.x;
    this.moveDir = 0;
    this.lastMoveAt = -Infinity;
    this.prevX = api.player.x;
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
    } else if (key === K.film && this.films.length === 0) {
      const F = NoiseAbility.FROST, cam = scene.cameras.main;
      const n = Math.ceil(cam.width / F.filmW) + 1;
      // 위 가장자리 결 — 윗선이 아래로 늘어지게 뒤집어 화면 위에 건다 (위쪽이 조금 짙게)
      for (let i = 0; i < n; i++) this.films.push(scene.add.image(i * F.filmW, 0, key, i % 4).setOrigin(0, 0).setFlipY(true).setDepth(4).setVisible(false));
      this.filmBody = scene.add.rectangle(0, 0, cam.width, cam.height, F.bodyColor, F.bodyAlpha).setOrigin(0, 0).setDepth(3.9).setVisible(false);
    } else if (key === K.shell && this.shells.length === 0) {
      for (let i = 0; i < NOISE_PARAMS.frostMax; i++) this.shells.push(scene.add.image(0, 0, key, i % 3).setDepth(4.5).setVisible(false));
    } else if (key === K.shard && this.shards.length === 0) {
      anim(A.shatter, [1, 2, 3, 4], NoiseAbility.FROST.shardFps, 0);
      const F = NoiseAbility.FROST;
      for (let i = 0; i < NOISE_PARAMS.frostMax; i++) this.shards.push(scene.add.sprite(0, 0, key, 0).setOrigin(F.shardOriginX, F.shardOriginY).setDepth(5.4).setVisible(false));
    }
    if (key === K.fog && this.veil.length === 0) {
      const F = NoiseAbility.FROST, cam = scene.cameras.main;
      for (let r = 0; r < F.veilRows; r++) {
        for (let c = 0; c < F.veilCols; c++) {
          const x = (c + 0.5) * cam.width / F.veilCols + (r % 2 ? 24 : -24), y = (r + 0.5) * cam.height / F.veilRows;
          this.veil.push(scene.add.sprite(x, y, key, 2 + (r * F.veilCols + c) % 4).setScale(F.veilScale).setFlipX((r + c) % 2 === 1)
            .setTint(F.tint).setDepth(3.95).setVisible(false));
        }
      }
    }
    if (key === K.gather && !this.frostGather) {
      this.frostGather = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setDepth(5).setTint(NoiseAbility.FROST.tint).setVisible(false);
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
    this.frost = 'idle';
    this.shardQueue = [];
    const all = [this.fogBack, this.fogFront, this.burstSpr, this.gust, this.tail, this.top, ...this.motes, ...this.texts,
      this.frostGather, this.filmBody, ...this.films, ...this.veil, ...this.shells, ...this.shards];
    this.texts.clear();
    for (const o of all) { if (!o) continue; o.scene?.tweens.killTweensOf(o); o.destroy(); }
    this.fogBack = this.fogFront = this.burstSpr = this.gust = this.tail = this.top = null;
    this.frostGather = null;
    this.filmBody = null;
    this.motes = [];
    this.films = [];
    this.veil = [];
    this.shells = [];
    this.shards = [];
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
    const p = poop as PoolablePoopBase;
    if (this.isFrozen(p)) return true;   // 얼어 멈춘 똥 — 노이즈 몸을 그냥 지나간다 (안개 태그로 덮어쓰지도 않음)
    if (!this.inFog(api)) return false;
    if (p.abilityTag === this.fogSerial) return true;   // 이번 안개에서 이미 지나가는 중 — 다시 세지 않는다
    if (this.passLeft <= 0) return false;
    p.abilityTag = this.fogSerial;
    this.passLeft--;
    this.passes++;
    this.awardBonus(api, NOISE_PARAMS.passPoints);
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
    const dx = api.player.x - this.prevX;
    if (Math.abs(dx) > NoiseAbility.MOVE_EPS) { this.moveDir = Math.sign(dx); this.lastMoveAt = now; }
    this.prevX = api.player.x;
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
    if (this.frost !== 'idle') this.stepFrost(api);
    this.drainFx(api);
    this.drainShards(api);
  }

  private spawnFog(api: GameSceneAPI): void {
    const scene = api.scene, base = api.player.y + 44, W = scene.cameras.main.width, half = NoiseAbility.FOG_DISPLAY_W / 2;
    // 가려는 방향의 앞쪽 — 방금(MOVING_MS 안) 움직이고 있었으면 그 방향으로 fogAhead, 아니면 제자리. 화면 밖으로 안 나가게
    const moving = this.gameMs - this.lastMoveAt <= NoiseAbility.MOVING_MS;
    const x = Phaser.Math.Clamp(api.player.x + (moving ? this.moveDir * NOISE_PARAMS.fogAhead : 0), half, W - half);
    this.phase = 'fog';
    this.fogX = x;
    this.lastFogX = api.player.x;   // 다음 안개 조건(fogMinMove)은 피운 자리가 아니라 그때 노이즈 자리에서 잰다
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
      if (this.isFrozen(p)) continue;   // 언 똥은 서리 안개가 깬다 (덮개만 허공에 남지 않게)
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
  // 특수 「서리 안개」 — 플레이 점수 frostInterval 마다 자동
  // ─────────────────────────────────────────────────────────────

  override onScoreMilestone(_score: number, api: GameSceneAPI): void {
    // GameScene 은 점수 1점마다 부른다. 자기 보너스로 들어온 점수는 세지 않는다 (awardBonus 가 awarding 을 세운다).
    // 배수가 아니라 카운터라 보너스가 배수를 넘겨도 삼켜지지 않는다. 발동 중에 차면 끝난 뒤 첫 점수에 나간다
    if (this.awarding) return;
    if (this.frostProgress < NOISE_PARAMS.frostInterval) this.frostProgress++;
    if (this.frostProgress < NOISE_PARAMS.frostInterval || this.frost !== 'idle') return;
    this.frostProgress = 0;
    this.startFrost(api);
  }

  private startFrost(api: GameSceneAPI): void {
    const P = NOISE_PARAMS;
    this.frost = 'gather';
    this.frostT = this.gameMs;
    this.frostSerial++;
    this.frozenNow = 0;
    this.frozeAll = false;
    this.frostUses++;
    // 무적은 모으기 + 안개가 차서 똥이 얼 때까지 (+ 여유 한두 프레임 — 물리 겹침이 얼리기보다 먼저 돈다)
    api.player.setInvincibleBriefly((P.frostGatherSec + P.frostFillSec) * 1000 + NoiseAbility.FROST.invMarginMs);
    const g = this.frostGather, x = api.player.x, base = api.player.y + 44;
    if (g) {
      api.scene.tweens.killTweensOf(g);
      g.setPosition(x, base).setScale(150 / 128).setAlpha(0.9).setVisible(true);
      g.play({ key: NoiseAbility.ANIM.gather, frameRate: 4 / P.frostGatherSec });
    }
    this.puff(api.scene, x, base - 30, 12, 60, NoiseAbility.FROST.tint);
  }

  /** 언 똥인가 — 이번 발동이 얼린 것 (회수 · 재사용이면 abilityTag 가 0 으로 지워져 아니다) */
  private isFrozen(p: PoolablePoopBase): boolean {
    return (this.frost === 'spread' || this.frost === 'crack') && p.abilityTag === -this.frostSerial;
  }

  private stepFrost(api: GameSceneAPI): void {
    const P = NOISE_PARAMS, scene = api.scene;
    const t = this.gameMs - this.frostT;
    if (this.frost === 'gather') {
      if (t < P.frostGatherSec * 1000) return;
      this.frost = 'spread';
      this.frostT = this.gameMs;
      const g = this.frostGather;
      if (g) scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => { g.anims.stop(); g.setVisible(false); } });
      this.showVeil(api);
      return;
    }
    if (this.frost === 'spread') {
      if (!this.frozeAll && t >= P.frostFillSec * 1000) {   // 안개가 다 찼다 — 화면의 일반 똥을 한꺼번에
        this.frozeAll = true;
        this.freezeOnScreen(api);
      }
      if (t >= (P.frostFillSec + P.frostFreezeSec) * 1000) {   // 언 채 frostFreezeSec 뒤 금이 간다 (멈춤 합계 = freeze + crack)
        this.frost = 'crack';
        this.frostT = this.gameMs;
      }
    }
    this.syncFrozen(api);
    if (this.frost === 'crack' && this.gameMs - this.frostT >= P.frostCrackSec * 1000) this.shatterAll(api);
  }

  /**
   * 매 프레임 — 지금 언 표시가 달린 똥만 기준으로 덮개(· 금 간 덮개)를 다시 깐다. 다른 경로(피버 변환 등)가 언 똥을
   * 회수하면 태그가 0 으로 지워져 여기서 빠지고, 그 칸의 덮개도 꺼진다 (허공에 남지 않음 · 상한도 실제 수).
   * 언 똥 속도는 다시 0 으로 (피버 등이 속도를 넣어도). 똥 참조는 프레임을 넘겨 들지 않는다
   */
  private syncFrozen(api: GameSceneAPI): void {
    const crack = this.frost === 'crack', F = NoiseAbility.FROST;
    let i = 0;
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || !this.isFrozen(p)) continue;
      (p.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.shells[i]?.setPosition(p.x, p.y).setVisible(true);
      const sh = this.shards[i];
      // 금 간 단계 — 덮개 위에 깨짐 f0 을 엷게 (f0 은 속이 차 있어 그대로 덮으면 똥이 가려진다)
      if (sh) { if (crack) sh.setFrame(0).setPosition(p.x, p.y).setFlipX(i % 2 === 1).setAlpha(F.crackAlpha).setVisible(true); else sh.setVisible(false); }
      i++;
    }
    for (let k = i; k < this.shells.length; k++) { this.shells[k].setVisible(false); this.shards[k]?.setVisible(false); }
    this.frozenNow = i;
  }

  /**
   * 서리 안개가 화면에 차오른다 (frostFillSec) — 칸마다 목표 알파로 페이드 인. 가장자리 · 위가 짙고 노이즈 둘레는 옅다.
   * 안개 칸은 제 반복(fogLoop)으로 천천히 일렁인다
   */
  private showVeil(api: GameSceneAPI): void {
    const F = NoiseAbility.FROST, scene = api.scene, cam = scene.cameras.main;
    const dur = NOISE_PARAMS.frostFillSec * 1000, px = api.player.x, py = api.player.y;
    this.veilUnderPoops(api);
    for (const v of this.veil) {
      const edge = Math.abs(v.x - cam.width / 2) / (cam.width / 2), top = 1 - v.y / cam.height;
      let a = F.veilBase + F.veilEdge * edge + F.veilTop * top;
      if (Math.hypot(v.x - px, v.y - py) < F.nearR) a *= F.nearK;
      scene.tweens.killTweensOf(v);
      v.setAlpha(0).setVisible(true).play(NoiseAbility.ANIM.fogLoop);
      scene.tweens.add({ targets: v, alpha: a, duration: dur, ease: 'Sine.easeOut' });
    }
    for (const f of this.films) {
      scene.tweens.killTweensOf(f);
      f.setAlpha(0).setVisible(true);
      scene.tweens.add({ targets: f, alpha: F.filmAlpha, duration: dur, ease: 'Sine.easeOut' });
    }
    const body = this.filmBody;
    if (body) {
      scene.tweens.killTweensOf(body);
      body.setAlpha(0).setVisible(true);
      scene.tweens.add({ targets: body, alpha: 1, duration: dur, ease: 'Sine.easeOut' });
    }
  }

  /**
   * 안개는 배경 바로 위 · 똥 아래에 — 똥이 안개에 묻히지 않게 (배경 밝게 원칙). 일반 똥 · 노이즈는 깊이 0 이라
   * 깊이로는 못 가르고 표시 순서로 배경 이미지 바로 위에 옮긴다. 깊이는 배경과 같은 0
   */
  private veilUnderPoops(api: GameSceneAPI): void {
    const scene = api.scene;
    const bg = scene.children.list.find(o => o instanceof Phaser.GameObjects.Image && o.texture.key === api.backgroundKey);
    if (!bg) return;
    const objs = [this.filmBody, ...this.veil, ...this.films].filter((o): o is NonNullable<typeof o> => !!o);
    let below: Phaser.GameObjects.GameObject = bg;
    for (const o of objs) { o.setDepth(0); scene.children.moveAbove(o as Phaser.GameObjects.GameObject, below); below = o; }
  }

  /**
   * 화면 안(보이는) 일반 똥을 한꺼번에 얼린다 — 속도 0 · 표시 −발동 번호 · 덮개. 상한 frostMax 를 넘으면 노이즈에 가까운 것부터
   * (화면 아래 0~50px 의 안 보이는 똥은 회수 전이라 활성이지만 고르지 않는다). 후보 배열은 이 함수 안에서만 쓰고 버린다
   */
  private freezeOnScreen(api: GameSceneAPI): void {
    const P = NOISE_PARAMS, cam = api.scene.cameras.main, px = api.player.x, py = api.player.y;
    const cand: { p: PoolablePoopBase; d: number }[] = [];
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || p.y < -20 || p.y > cam.height || p.abilityTag === -this.frostSerial) continue;
      cand.push({ p, d: (p.x - px) ** 2 + (p.y - py) ** 2 });
    }
    cand.sort((a, b) => a.d - b.d);
    for (const { p } of cand) {
      if (this.frozenNow >= P.frostMax) break;
      p.abilityTag = -this.frostSerial;
      (p.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.shells[this.frozenNow]?.setFrame(this.frozenNow % 3).setPosition(p.x, p.y).setFlipX(this.frozenNow % 2 === 1).setAlpha(1).setVisible(true);
      this.frozenNow++;
    }
  }

  /** 쨍 — 언 똥을 **이 프레임에** 전부 회수 · 점수. 조각 연출만 대기열로 나눈다 */
  private shatterAll(api: GameSceneAPI): void {
    const P = NOISE_PARAMS, F = NoiseAbility.FROST, scene = api.scene;
    let n = 0, sy = 0;
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || !this.isFrozen(p)) continue;
      sy += p.y; n++;
      p.recycle(true);
    }
    this.shards.forEach((sh, i) => { if (sh.visible) this.shardQueue.push({ x: sh.x, y: sh.y, i }); });
    this.shells.forEach(s => s.setVisible(false));
    this.frost = 'idle';
    this.frozenNow = 0;
    this.frostFrozenLast = n;
    this.frostFrozenTotal += n;
    if (n > 0 && P.frostPoints > 0) this.award(api, n * P.frostPoints, scene.cameras.main.width / 2, Math.max(120, sy / n - 60));
    for (const f of this.films) scene.tweens.add({ targets: f, alpha: 0, duration: F.fadeMs, onComplete: () => f.setVisible(false) });
    for (const v of this.veil) { scene.tweens.killTweensOf(v); scene.tweens.add({ targets: v, alpha: 0, duration: F.fadeMs, onComplete: () => { v.anims.stop(); v.setVisible(false); } }); }
    const body = this.filmBody;
    if (body) scene.tweens.add({ targets: body, alpha: 0, duration: F.fadeMs, onComplete: () => body.setVisible(false) });
  }

  /** 깨짐 조각 — 프레임당 FX_PER_FRAME 개씩 f1~f4 재생 · 서리 가루 */
  private drainShards(api: GameSceneAPI): void {
    for (let k = 0; k < NoiseAbility.FX_PER_FRAME && this.shardQueue.length > 0; k++) {
      const q = this.shardQueue.shift()!;
      const sh = this.shards[q.i];
      if (!sh) continue;
      sh.setAlpha(1).play(NoiseAbility.ANIM.shatter);
      sh.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sh.setVisible(false));
      this.puff(api.scene, q.x, q.y + 20, 3, 30, NoiseAbility.FROST.tint);
    }
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

  private puff(scene: Phaser.Scene, x: number, y: number, n: number, spread: number, tint = 0xffffff): void {
    for (let i = 0; i < n; i++) {
      const m = this.motes.find(o => !o.visible);
      if (!m) return;
      const a = Math.random() * Math.PI * 2, d = spread * (0.4 + Math.random() * 0.6);
      m.setFrame(i % 4).setPosition(x, y).setScale(0.5 + Math.random() * 0.5).setTint(tint).setAlpha(1).setVisible(true);
      scene.tweens.add({
        targets: m, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6 - 18, alpha: 0,
        duration: 380, ease: 'Quad.easeOut', onComplete: () => m.setVisible(false),
      });
    }
  }

  /** 점수 — awardBonus(→ addAbilityBonus → updateScore, 규칙 3 · 자기 보너스로는 서리가 차지 않음) + '+N' 글자 */
  private award(api: GameSceneAPI, pts: number, x: number, y: number): void {
    this.awardBonus(api, pts);
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
