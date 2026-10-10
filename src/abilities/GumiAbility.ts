import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI, SpecialPoopType } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { ensureGlowDot } from '../utils/glowDot';
import { GUMI_PARAMS, GUMI_DEFERRED_SHEETS } from '../config/abilityParams';
import { burst, fxSprite, playFx, fxPickSheetKey, loadFxPickSheet } from '../utils/vfx';
import { StagedLoader } from './stagedLoader';

const HIT_R = 32;

// 꼬리 밑동 — 몸 가운데에서 아래로 (허리 뒤). 밑동은 꼬리 방향으로 TAIL_BASE_PUSH 만큼 밀어 아홉 밑동이 한 점에 겹치지 않게
const TAIL_ORIGIN_Y = 14;
const TAIL_BASE_PUSH = 9;
const SWAY_AMP      = 0.50; // 흔들림 진폭 (radians)

// ── 꼬리 ────────────────────────────────────────────────────────────────
// 원본은 꼬리 하나를 발광 점 14개로 이었다 — 9개면 **가산 스프라이트 126장을
// 매 프레임 재배치**하는 것이라 게임에서 가장 무거운 상시 비용이었다. 지금은 9장이다.
//
// v8 새 꼬리 (대표 요청) — 흰 여우 꼬리 시트(gumi_tail · 8칸 살랑임) + 같은 칸의 끝 마스크(gumi_tailtip)에 9색 틴트.
// 예전 foxtail 은 흰 깃을 통째로 틴트해 **가산**으로 그려 불꽃 · 깃털 다발로 읽혔고, 겹치면 노랗게 날아가 덤불이 됐다 → normal 블렌드.
// 흔들림은 시트에 굽지 않는다 (꼬리마다 위상 · 트레일링이 달라서) — 시트는 휘어짐 · 털결만, 큰 흔들림은 회전.
// 꼬리마다 **시작 프레임을 어긋나게** 줘서 결까지 한 박자로 놀지 않게 한다. 끝 마스크는 몸 칸을 매 프레임 따라간다
const TAIL_SHEETS = GUMI_DEFERRED_SHEETS.slice(3, 5) as readonly string[];   // [몸, 끝]
const TAIL_ORIGIN_X = 0.044;   // 칸 안 밑동 (가공 때 칸마다 맞춤 — proc_tail_sheets.py)
const TAIL_ORIGIN_YR = 0.508;
const TAIL_GROW_MS = 300;
const TRAIL_MAX  = 0.45;  // 플레이어 이동 방향 트레일링 최대 각도 (radians)

// ── 여우불 ──────────────────────────────────────────────────────────────
// 무채색 8프레임 루프. 9색으로 착색되므로 색을 굽지 않는다.
// 발광 점 + Graphics 코어 2장으로 만들던 것을 시트 한 장이 대신한다 — 게다가 타오른다.
const FOXFIRE_SHEET   = 'foxFire' as const;
const FOXFIRE_CORE    = 'foxFireCore' as const;
const FOXFIRE_FRAME_W = 128;
const FOXFIRE_WIDTH   = 28;   // 화면상 폭(px)
/** 반투명 — 배경이 비쳐야 '떠 있는 도깨비불'로 읽힌다. 심지는 조금 더 진하게 */
const FOXFIRE_ALPHA   = 0.62;
const FOXFIRE_CORE_ALPHA = 0.68;
/** 여우불은 화면 밖으로 나가면 스스로 지운다. 보험은 넉넉히 */
const FOXFIRE_LIFE_MS = 20000;


// 꼬리 depth (플레이어 depth 5보다 낮아야 몸통 뒤에 숨음)
const TAIL_DEPTH = 3;

// 오라 설정 (무적 중)
const AURA_PARTICLE_COUNT = 9;   // 공전 파티클 수 (꼬리 색상과 1:1 대응)
const AURA_BURN_RADIUS    = 50;  // 소각 판정 반경 (px)
const AURA_COLORS = [0xff4400, 0xff8800, 0xffcc00, 0xff2200, 0xffaa00, 0xff6600, 0xffee44, 0xff3300, 0xffbb00];

// 여우불 9색
const FOX_FIRE_COLORS = [
  0xff2200,  // 빨
  0xff7700,  // 주
  0xffee00,  // 노
  0x00cc44,  // 초
  0x0066ff,  // 파
  0x3300cc,  // 남
  0xaa00ff,  // 보
  0xffffff,  // 흰
  0xcccccc,  // 검(회색 대체)
];

// 꼬리 등장 순서: 빨→보→주→남→노→파→초→흰→검
const TAIL_COLORS = [
  0xff2200,  // 1번째: 빨
  0xaa00ff,  // 2번째: 보
  0xff7700,  // 3번째: 주
  0x3300cc,  // 4번째: 남
  0xffee00,  // 5번째: 노
  0x0066ff,  // 6번째: 파
  0x00cc44,  // 7번째: 초
  0xffffff,  // 8번째: 흰
  0xcccccc,  // 9번째: 검
];

// 꼬리 배치 각도 (v8): 생성 순서대로 왼 · 오 번갈아 바깥쪽으로 퍼진다. 머리 위(250~290°)는 비운다 — 9번째만 머리 뒤 270°
// (몸에 가려 끝만 보인다). 왼쪽으로 뻗는 꼬리는 위아래로 뒤집어 '위로 휜' 끝이 왼쪽에서도 위로 가게 한다
const TAIL_ANGLE_ORDER = [244, 296, 226, 314, 208, 332, 190, 350, 270]
  .map(deg => deg * Math.PI / 180);

interface FoxFire {
  img: Phaser.GameObjects.Image;
  /** 흰 심지 — 착색된 외곽 위에 가산으로 얹는다 */
  core: Phaser.GameObjects.Image;
  x: number;
  y: number;
  baseVx: number;
  speedY: number;
  phase: number;
  freq: number;
  trailTimer: number;
  color: number;
}

interface TailObj {
  img: Phaser.GameObjects.Sprite;
  /** 끝 색 — 몸과 같은 칸 · 같은 변환, 9색 틴트 */
  tip: Phaser.GameObjects.Sprite;
  baseAngle: number;
  swayPhase: number;
  swayFreq: number;
  color: number;
}

interface AuraParticle {
  img: Phaser.GameObjects.Image;
  angle: number;   // 현재 공전 각도 (radians)
  speed: number;   // 공전 속도 (rad/s, 음수=반시계)
  radius: number;  // 공전 반경 (px)
}

/**
 * 구미 (UR) — 꼬리 9개 무적(기본) / 여우불 금똥 변환(특수)
 * 수치: GUMI_PARAMS 참조
 */
/**
 * 「무지개 여우비」 (v8, 기존 능력에 더함 — 값 GUMI_PARAMS). 기본 여우비(머리 위 띠)는 대표 플레이 피드백으로 뺐다:
 * - 필살 「무지개 여우비」: 아홉 꼬리 무적이 끝나는 순간 (예전 반경 정리를 바꾼다) — 화면 전체 비 bowRainSec 동안,
 *   시작 프레임에 화면 안 일반 똥을 구미에 가까운 것부터 bowMax 개 녹이고 → 비가 그친 뒤 무지개 호 bowSec. 동시에 내지 않는다
 * - 녹는 연출(시트 4칸)만 프레임당 FX_PER_FRAME. 똥 참조는 들고 있지 않는다 (좌표만). 점수는 awardBonus (자기 보너스 — 카운터 제외)
 * - 시트 3장은 판 시작 뒤 StagedLoader. 오브젝트는 판 시작에 한 번: 빗줄기 TileSprite 1 (화면) · 무지개 Image · 녹음 Sprite 풀 MELT_POOL
 */
export class GumiAbility extends BaseAbility {
  // ── 여우비 ──
  /** 게임 시계 (delta × timeScale) — 무지개 여우비 단계. scene.time.now 는 히트스톱 동안에도 흐른다 */
  private gameMs = 0;
  /** 필살 단계 — idle · rain (화면 전체 비) · bow (무지개) — 시작 시각 bowT (gameMs) */
  private bowPhase: 'idle' | 'rain' | 'bow' = 'idle';
  private bowT = 0;
  /** 녹는 연출 대기열 — 좌표 · 넣은 게임 시각. 풀 칸이 비면 꺼내고, MELT_STALE_MS 넘게 기다린 것은 버린다 */
  private meltQueue: { x: number; y: number; t: number }[] = [];
  private rainLoader: StagedLoader | null = null;
  private rainFull: Phaser.GameObjects.TileSprite | null = null;
  private bow: Phaser.GameObjects.Image | null = null;
  private melts: Phaser.GameObjects.Sprite[] = [];
  private rainTexts = new Set<Phaser.GameObjects.Text>();

  /** 측정용 (밸런스 하네스 — 화면 · 저장 X): 여우불 발동 · 9꼬리 무적 발동 · 녹인 수 (무지개 여우비) · 무지개 여우비 발동 */
  foxFireCasts = 0;
  tailTriggers = 0;
  rainMelts = 0;
  bowCasts = 0;

  private static readonly FX_PER_FRAME = 4;
  private static readonly MELT_POOL = 30;
  /** 녹는 연출이 자리 나기를 기다리는 한도 (게임 ms) — 넘으면 그 연출은 버린다 (회수 · 점수는 이미 끝났다) */
  private static readonly MELT_STALE_MS = 600;
  private static readonly RAIN_FALL = 900;     // 빗줄기 내려가는 속도 (px/초 — 타일 스크롤)
  private static readonly RAIN_ALPHA = 0.85;
  private static readonly K = {
    rain: fxPickSheetKey(GUMI_DEFERRED_SHEETS[0]),
    melt: fxPickSheetKey(GUMI_DEFERRED_SHEETS[1]),
    bow: fxPickSheetKey(GUMI_DEFERRED_SHEETS[2]),
    tail: fxPickSheetKey(TAIL_SHEETS[0]),
    tip: fxPickSheetKey(TAIL_SHEETS[1]),
  } as const;

  /** 여우불이 바꾼 금똥의 abilityTag (v6 G0) — 주운 점수는 자기 보너스, 판정 카운터에 안 센다. 회수 · 재사용 때 지워진다 */
  private static readonly FOX_GOLD_TAG = 1;

  // ── 여우불 (특수 능력) ─────────────────────────────────────────────
  /**
   * 다음 여우불까지 쌓인 '플레이 점수' (v6 G0, 매화 v3.3 과 같은 방식) — 자기 보너스(여우불 금똥 수집)는 세지 않는다.
   * 예전 score % foxFireInterval 판정은 보너스가 배수를 넘기면 그 차례를 삼켰다
   */
  private foxProgress = 0;
  private foxFires: FoxFire[] = [];

  // ── 꼬리 스택 (기본 효과) ─────────────────────────────────────────
  private tailCount = 0;
  /** 다음 꼬리까지 쌓인 플레이 점수 (v6 G0) — 무적 중에는 세지 않고, 무적이 끝나면 0 부터 */
  private tailProgress = 0;
  private invincibleActive = false;
  private invincibleElapsed = 0;
  /** 지금 보이는 꼬리 (생성 순서) — tailPool 의 앞 tailCount 개 */
  private tails: TailObj[] = [];
  /** 꼬리 9쌍 (몸 + 끝) — 시트가 올라오면 판에 한 번 만들고 재사용한다 */
  private tailPool: TailObj[] = [];

  // ── 꼬리별 누적 효과 ──────────────────────────────────────────────
  // index % 3 === 0 (1,4,7번): 특수 똥 수집 +5점
  // index % 3 === 1 (2,5,8번): 이동 속도 +5px/s (Player에 직접 적용)
  // index % 3 === 2 (3,6,9번): 일반 똥 소환 -1개 (영구)
  private specialBonus = 0;
  private speedBonus = 0;
  private spawnReduction = 0;

  // ── 무적 오라 ─────────────────────────────────────────────────────
  private auraParticles: AuraParticle[] = [];

  // ── 플레이어 depth 설정 (꼬리가 몸통 뒤에 렌더링되도록) ──────────
  override onCreate(api: GameSceneAPI): void {
    // 씬 재시작 시 onDestroy가 호출되지 않으므로 stale 참조를 여기서 정리
    this.tails = [];
    this.tailPool = [];
    this.tailCount = 0;
    this.foxProgress = 0;
    this.tailProgress = 0;
    this.specialBonus = 0;
    this.speedBonus = 0;
    this.spawnReduction = 0;
    this.gameMs = 0;
    this.bowPhase = 'idle';
    this.meltQueue = [];
    this.melts = [];
    this.rainTexts = new Set();
    this.rainFull = null;
    this.bow = null;
    this.foxFireCasts = this.tailTriggers = this.rainMelts = this.bowCasts = 0;
    const scene = api.scene;
    this.rainLoader = new StagedLoader(
      scene,
      GUMI_DEFERRED_SHEETS.map(f => ({ key: fxPickSheetKey(f), enqueue: (sc: Phaser.Scene) => loadFxPickSheet(sc, f) })),
      250, 600,
      key => this.onRainSheet(scene, key),
    );
    for (const f of GUMI_DEFERRED_SHEETS) this.onRainSheet(scene, fxPickSheetKey(f));   // 다시 하기 — 이미 있는 시트

    api.player.setDepth(5);

    // UR 인데 첫 여우불까지 200점을 기다려야 했다 — 시작하자마자 한 번 보여준다
    this.summonFoxFires(api);
  }

  // ── 꼬리 추가 ─────────────────────────────────────────────────────
  private _addTail(api: GameSceneAPI): void {
    const { player } = api;
    const i = this.tailCount;
    this.showTail(api.scene, i, true);

    if (i % 3 === 0) {
      this.specialBonus += GUMI_PARAMS.tailSpecialBonus;
    } else if (i % 3 === 1) {
      this.speedBonus += GUMI_PARAMS.tailSpeedBonus;
      player.addPermanentSpeed(GUMI_PARAMS.tailSpeedBonus);
    } else {
      this.spawnReduction += GUMI_PARAMS.tailSpawnReduction;
    }

    this.tailCount++;

    if (this.tailCount >= GUMI_PARAMS.maxTails) {
      this._triggerInvincibility(api);
    }
  }

  // ── 꼬리 지렁이 파동 업데이트 (매 프레임) ────────────────────────
  private _updateTailPositions(api: GameSceneAPI): void {
    if (this.tails.length === 0) return;
    const { player, scene } = api;
    const time    = scene.time.now * 0.001;
    const originX = player.x;
    const originY = player.y + TAIL_ORIGIN_Y;

    // 플레이어 속도 기반 트레일링: 오른쪽 이동 시 꼬리가 왼쪽으로 쏠림
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    const maxSpeed = 400;
    const velRatio = body ? Phaser.Math.Clamp(body.velocity.x / maxSpeed, -1, 1) : 0;
    const trailOffset = velRatio * TRAIL_MAX;

    // 좌표 · 각도만 갱신한다 — 밑동을 축으로 한 흔들림 + 이동 트레일링. 밑동은 그 방향으로 TAIL_BASE_PUSH 밀린다
    for (const tail of this.tails) {
      if (!tail.img.visible) continue;
      const sway = Math.sin(time * tail.swayFreq + tail.swayPhase) * SWAY_AMP;
      const r = tail.baseAngle + sway + trailOffset;
      const x = originX + Math.cos(r) * TAIL_BASE_PUSH, y = originY + Math.sin(r) * TAIL_BASE_PUSH;
      tail.img.setPosition(x, y).setRotation(r);
      tail.tip.setPosition(x, y).setRotation(r).setFrame(tail.img.frame.name);
    }
  }

  // ── 점수 마일스톤 ─────────────────────────────────────────────────
  override onScoreMilestone(_score: number, api: GameSceneAPI): void {
    // 점수 1점마다 불린다. 판정은 점수 배수가 아니라 '플레이 점수' 카운터 (v6 G0) — 자기 보너스(여우불 금똥)는 세지 않는다
    if (this.awarding) return;
    // 여우불 (특수)
    if (++this.foxProgress >= GUMI_PARAMS.foxFireInterval) {
      this.foxProgress = 0;
      this.summonFoxFires(api);
    }
    // 꼬리 추가 (기본) — 무적 중에는 세지도 않는다 (예전 '무적 중 누적 금지')
    if (!this.invincibleActive && ++this.tailProgress >= GUMI_PARAMS.tailInterval) {
      this.tailProgress = 0;
      this._addTail(api);
    }
  }

  /** 여우불이 바꾼 금똥이면 그 수집 점수는 자기 보너스 (광부 비와 같은 원칙). 하늘 금똥은 그대로 센다 */
  override isSelfBonusPoop(poop: Phaser.GameObjects.GameObject): boolean {
    return (poop as PoolablePoopBase).abilityTag === GumiAbility.FOX_GOLD_TAG;
  }

  // ── 무적 발동 ─────────────────────────────────────────────────────
  private _triggerInvincibility(api: GameSceneAPI): void {
    const { player, scene } = api;
    this.invincibleActive  = true;
    this.invincibleElapsed = 0;
    this.tailTriggers++;

    // 꼬리 확대 — 밑동을 축으로 길고 두껍게 부푼다
    this.tails.forEach(tl => {
      scene.tweens.killTweensOf([tl.img, tl.tip]);
      scene.tweens.add({ targets: [tl.img, tl.tip], scaleX: 1.45, scaleY: 1.45, duration: 320, ease: 'Back.easeOut' });
    });

    this._createAura(api);

    // 9색 버스트
    ensureGlowDot(scene);
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const spark = scene.add.image(player.x, player.y, 'glow_dot')
        .setDepth(210)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(FOX_FIRE_COLORS[i])
        .setScale(0.6);
      scene.tweens.add({
        targets: spark,
        x: player.x + Math.cos(angle) * 65,
        y: player.y + Math.sin(angle) * 65,
        scale: 0, alpha: 0, duration: 520,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // ── 무적 카운트다운 ───────────────────────────────────────────────
  private _updateInvincibility(api: GameSceneAPI): void {
    // 게임 시간으로 센다 (히트스톱 · 일시정지에 멈춤) — 무적 끝이 무지개 여우비 회수 · 득점을 부르므로 비 단계 시계와 맞춘다
    const clock = api.scene.time;
    this.invincibleElapsed += clock.paused ? 0 : api.scene.game.loop.delta * clock.timeScale;
    this._updateAura(api);
    if (this.invincibleElapsed >= GUMI_PARAMS.invincibleDuration) {
      this._endInvincibility(api);
    }
  }

  // ── 무적 종료 ─────────────────────────────────────────────────────
  private _endInvincibility(api: GameSceneAPI): void {
    const { player, scene } = api;

    this.invincibleActive = false;
    player.setAlpha(1);

    // 꼬리 사라짐
    this.tails.forEach(tl => {
      scene.tweens.killTweensOf([tl.img, tl.tip]);
      scene.tweens.add({
        targets: [tl.img, tl.tip], alpha: 0, scaleX: 0, scaleY: 0,
        duration: 380, ease: 'Quad.easeIn',
        onComplete: () => { tl.img.anims.stop(); tl.img.setVisible(false); tl.tip.setVisible(false); },
      });
    });
    this.tails       = [];
    this.tailCount   = 0;
    this.tailProgress = 0; // 무적이 끝나면 꼬리 카운터는 0 부터

    // 꼬리별 누적 효과 초기화 — speedBonus는 원복 후 초기화
    const speedToRemove = this.speedBonus;
    this.specialBonus   = 0;
    this.speedBonus     = 0;
    this.spawnReduction = 0;
    player.addPermanentSpeed(-speedToRemove);

    this._destroyAura();
    this._spawnBreakEffect(api);
    this._startBowRain(api);   // 예전 반경 320 정리 → 무지개 여우비 (v8)
  }

  // ── 오라 생성 ─────────────────────────────────────────────────────
  private _createAura(api: GameSceneAPI): void {
    const { scene, player } = api;
    ensureGlowDot(scene);
    for (let i = 0; i < AURA_PARTICLE_COUNT; i++) {
      const angle  = (i / AURA_PARTICLE_COUNT) * Math.PI * 2;
      // 홀짝 번갈아 시계/반시계, 반경도 살짝 다르게
      const speed  = (i % 2 === 0 ? 3.2 : -2.4) + Phaser.Math.FloatBetween(-0.4, 0.4);
      const radius = 38 + (i % 3) * 7;
      const img = scene.add.image(
        player.x + Math.cos(angle) * radius,
        player.y + Math.sin(angle) * radius,
        'glow_dot',
      )
        .setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(AURA_COLORS[i])
        .setScale(0.38)
        .setAlpha(0.9);
      this.auraParticles.push({ img, angle, speed, radius });
    }
  }

  // ── 오라 매 프레임 업데이트 + 소각 판정 ──────────────────────────
  private _updateAura(api: GameSceneAPI): void {
    const { player, poops, scene } = api;
    const dt = scene.game.loop.delta * 0.001;
    const time = scene.time.now * 0.001;

    for (const p of this.auraParticles) {
      p.angle += p.speed * dt;
      const x = player.x + Math.cos(p.angle) * p.radius;
      const y = player.y + Math.sin(p.angle) * p.radius;
      p.img.setPosition(x, y);
      // 숨쉬는 scale 펄스
      p.img.setScale(0.30 + Math.sin(time * 6 + p.angle) * 0.10);
    }

    // 소각 판정
    const burnR2 = AURA_BURN_RADIUS * AURA_BURN_RADIUS;
    (poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => p.active
        && (p.x - player.x) ** 2 + (p.y - player.y) ** 2 <= burnR2)
      .forEach(p => {
        this._spawnBurnEffect(p.x, p.y, scene);
        (p as unknown as PoolablePoopBase).recycle();
      });
  }

  // ── 소각 이펙트 ───────────────────────────────────────────────────
  private _spawnBurnEffect(x: number, y: number, scene: Phaser.Scene): void {
    ensureGlowDot(scene);
    const burnColors = [0xff4400, 0xff8800, 0xffcc00];
    for (let i = 0; i < 7; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist  = Phaser.Math.FloatBetween(12, 26);
      const spark = scene.add.image(x, y, 'glow_dot')
        .setDepth(201)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(burnColors[i % 3])
        .setScale(Phaser.Math.FloatBetween(0.18, 0.30));
      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 14, // 위로 솟구치는 불꽃
        scale: 0,
        alpha: 0,
        duration: Phaser.Math.Between(180, 280),
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  // ── 오라 제거 ─────────────────────────────────────────────────────
  private _destroyAura(): void {
    this.auraParticles.forEach(p => p.img.destroy());
    this.auraParticles = [];
  }

  // ── 무적 종료 파열 이펙트 (센티넬 방어막 파열 스타일, 황금색) ────
  private _spawnBreakEffect(api: GameSceneAPI): void {
    const { player, scene } = api;
    const cx = player.x;
    const cy = player.y;

    scene.cameras.main.flash(200, 255, 200, 50, true);

    // 확산 링 2겹 — Graphics 로 타원을 그리던 것 → 충격파 텍스처
    playFx(scene, 'shockwave', cx, cy, { scale: 2.4, tint: 0xffcc44, depth: 150 });
    scene.time.delayedCall(80, () => {
      if (!scene.sys.isActive()) return;
      playFx(scene, 'shockwave', cx, cy, { scale: 1.8, tint: 0xffcc44, depth: 150 });
    });

    // 내부 섬광
    playFx(scene, 'bloom', cx, cy, { scale: 0.9, tint: 0xffcc44, alpha: 0.8, depth: 149 });

    // 황금 파편 — Graphics 8개를 낱개로 날리던 것 → 이미터 하나
    burst(scene, cx, cy, 'shard', { count: 10, tint: [0xffcc44, 0xffee88], speed: 1.1, depth: 152 });
  }

  // ── 특수 똥 수집 보너스 (1,4,7번 꼬리) ──────────────────────────
  override onCollectSpecial(_type: SpecialPoopType): number {
    return this.specialBonus;
  }

  // ── 일반 똥 소환 감소 (3,6,9번 꼬리) — 영구 감소이므로 리셋 없음 ──
  override getSpawnCountReduction(): number {
    return this.spawnReduction;
  }

  // ── 피격: 무적 중이면 게임오버 방지 ──────────────────────────────
  override onHitPoop(_api: GameSceneAPI): boolean {
    return this.invincibleActive;
  }

  // ── 여우불 소환 ───────────────────────────────────────────────────
  private summonFoxFires(api: GameSceneAPI): void {
    const { scene, player } = api;
    const N = GUMI_PARAMS.foxFireCount;
    this.foxFireCasts++;

    for (let i = 0; i < N; i++) {
      const ringAngle = (i / N) * Math.PI * 2;
      const x = player.x + Math.cos(ringAngle) * 55;
      const y = player.y + Math.sin(ringAngle) * 55;
      const color = FOX_FIRE_COLORS[i];

      // 회색조 시트를 통째로 착색하면 **심지까지 물들어** 단색 덩어리가 된다.
      // 원본처럼 착색된 반투명 외곽 + 흰 심지 두 겹으로 쌓는다.
      const scale = FOXFIRE_WIDTH / FOXFIRE_FRAME_W;
      const img = fxSprite(scene, x, y, '', {
        sheet: FOXFIRE_SHEET,
        scale: [scale, scale],
        tint: color,
        alpha: FOXFIRE_ALPHA,
        depth: 200,
        blend: 'normal',
        lifeMs: FOXFIRE_LIFE_MS,
        slot: 'gumi_foxfire',
        maxConcurrent: 14,
      });
      if (!img) continue;

      // 심지는 가산 — 밝은 하늘 위에서 흰색으로 포화돼 '속에서 타는 빛'이 된다
      const core = fxSprite(scene, x, y, '', {
        sheet: FOXFIRE_CORE,
        scale: [scale, scale],
        alpha: FOXFIRE_CORE_ALPHA,
        depth: 202,
        blend: 'add',
        lifeMs: FOXFIRE_LIFE_MS,
        slot: 'gumi_foxfire_core',
        maxConcurrent: 14,
      });
      if (!core) { img.destroy(); continue; }

      this.foxFires.push({
        img, core, x, y, color,
        baseVx:     Phaser.Math.FloatBetween(-3.5, 3.5),
        speedY:     Phaser.Math.FloatBetween(4.5, 7.5),
        phase:      Phaser.Math.FloatBetween(0, Math.PI * 2),
        freq:       Phaser.Math.FloatBetween(0.07, 0.17),
        trailTimer: 0,
      });
    }
  }

  // ── 매 프레임 ─────────────────────────────────────────────────────
  override onUpdate(api: GameSceneAPI): void {
    this._updateTailPositions(api);
    if (this.invincibleActive) this._updateInvincibility(api);
    this._updateRain(api);

    if (this.foxFires.length === 0) return;

    const { scene } = api;
    const activePoops = api.poops.getChildren().filter(
      p => (p as Phaser.Physics.Arcade.Sprite).active,
    ) as Phaser.Physics.Arcade.Sprite[];

    const remaining: FoxFire[] = [];

    for (const fire of this.foxFires) {
      fire.trailTimer++;
      fire.x += fire.baseVx + Math.sin(fire.phase + fire.trailTimer * fire.freq) * 6;
      fire.y -= fire.speedY;
      fire.img.setPosition(fire.x, fire.y);
      fire.core.setPosition(fire.x, fire.y);

      // 자취는 남기지 않는다 — 불꽃이 프레임마다 타오르므로 발광 점을 덧대면 지저분해진다

      if (fire.y < -30 || fire.x < -30 || fire.x > 430) {
        fire.img.destroy();
        fire.core.destroy();
        continue;
      }

      let hit = false;
      for (const poop of activePoops) {
        const dx = fire.x - poop.x;
        const dy = fire.y - poop.y;
        if (dx * dx + dy * dy < HIT_R * HIT_R) {
          const px = poop.x;
          const py = poop.y;
          (poop as unknown as PoolablePoopBase).recycle();
          // 만든 금똥에 표시 — 그 자리에서만 찾고 참조는 들고 있지 않는다 (광부 비와 같은 방식)
          const before = new Set(api.goldPoops.getChildren().filter(o => o.active));
          api.spawnGoldPoopAt(px, py);
          const gold = api.goldPoops.getChildren().find(o => o.active && !before.has(o)) as PoolablePoopBase | undefined;
          if (gold) gold.abilityTag = GumiAbility.FOX_GOLD_TAG;
          this.spawnHitFlash(px, py, scene);
          fire.img.destroy();
          fire.core.destroy();
          hit = true;
          break;
        }
      }

      if (!hit) remaining.push(fire);
    }

    this.foxFires = remaining;
  }

  private spawnHitFlash(x: number, y: number, scene: Phaser.Scene): void {
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spark = scene.add.image(x, y, 'glow_dot')
        .setDepth(201)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffd700)
        .setScale(0.3);
      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 25,
        y: y + Math.sin(angle) * 25,
        scale: 0, alpha: 0, duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  override onDestroy(api: GameSceneAPI): void {
    if (this.invincibleActive) {
      api.player.setAlpha(1);
    }
    api.player.setDepth(0); // player depth 원복
    this.foxFires.forEach(f => { f.img.destroy(); f.core.destroy(); });
    this.foxFires = [];
    this.tailPool.forEach(tl => { tl.img.scene?.tweens.killTweensOf([tl.img, tl.tip]); tl.img.destroy(); tl.tip.destroy(); });
    this.tailPool = [];
    this.tails = [];
    this._destroyAura();
    this.rainLoader?.stop();
    this.rainLoader = null;
    this.meltQueue = [];
    this.bowPhase = 'idle';
    const all = [this.rainFull, this.bow, ...this.melts, ...this.rainTexts];
    this.rainTexts.clear();
    for (const o of all) { if (!o) continue; o.scene?.tweens.killTweensOf(o); o.destroy(); }
    this.rainFull = null;
    this.bow = null;
    this.melts = [];
  }

  // ─────────────────────────────────────────────────────────────
  // 여우비 (v8)
  // ─────────────────────────────────────────────────────────────

  /** 시트 한 장이 올라왔다 — 그 시트를 쓰는 오브젝트를 판에 한 번 만든다 */
  private onRainSheet(scene: Phaser.Scene, key: string): void {
    if (!scene.textures.exists(key)) return;
    const K = GumiAbility.K, cam = scene.cameras.main;
    if (key === K.rain && !this.rainFull) {
      this.rainFull = scene.add.tileSprite(0, 0, cam.width, cam.height, key, 2).setOrigin(0, 0).setDepth(6).setAlpha(GumiAbility.RAIN_ALPHA).setVisible(false);
    } else if ((key === K.tail || key === K.tip) && this.tailPool.length === 0 && scene.textures.exists(K.tail) && scene.textures.exists(K.tip)) {
      this.buildTails(scene);
      for (let i = 0; i < this.tailCount; i++) this.showTail(scene, i, false);
    } else if (key === K.melt && this.melts.length === 0) {
      if (!scene.anims.exists('gumi_melt')) scene.anims.create({ key: 'gumi_melt', frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 3 }), frameRate: 13, repeat: 0 });
      for (let i = 0; i < GumiAbility.MELT_POOL; i++) this.melts.push(scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 27 / 96).setDepth(6.3).setVisible(false));
    } else if (key === K.bow && !this.bow) {
      this.bow = scene.add.image(cam.width / 2, 0, key).setOrigin(0.5, 1).setDepth(5.9).setVisible(false);
    }
  }

  /** 꼬리 9쌍 — 몸 Sprite (살랑임 반복) + 끝 Sprite (몸 칸을 따라감 · 9색 틴트). 블렌드 normal */
  private buildTails(scene: Phaser.Scene): void {
    const K = GumiAbility.K;
    if (!scene.anims.exists('gumi_tail')) scene.anims.create({ key: 'gumi_tail', frames: scene.anims.generateFrameNumbers(K.tail, { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    for (let i = 0; i < GUMI_PARAMS.maxTails; i++) {
      const ang = TAIL_ANGLE_ORDER[i] ?? Math.PI * 1.5;
      const left = Math.cos(ang) < -0.05;   // 왼쪽으로 뻗는 꼬리는 위아래 뒤집기 — 시트의 '위로 휜' 끝이 왼쪽에서도 위로
      const oy = left ? 1 - TAIL_ORIGIN_YR : TAIL_ORIGIN_YR;
      // 겹침 — 바깥 꼬리 먼저, 가운데(270°)에 가까울수록 위. 모두 몸(depth 5) 뒤
      const depth = TAIL_DEPTH + (1 - Math.abs(Phaser.Math.Angle.Wrap(ang - Math.PI * 1.5)) / Math.PI) * 0.5;
      const img = scene.add.sprite(0, 0, K.tail, 0).setOrigin(TAIL_ORIGIN_X, oy).setFlipY(left).setDepth(depth).setVisible(false);
      const tip = scene.add.sprite(0, 0, K.tip, 0).setOrigin(TAIL_ORIGIN_X, oy).setFlipY(left).setDepth(depth + 0.005)
        .setTint(TAIL_COLORS[i] ?? 0xffffff).setVisible(false);
      this.tailPool.push({ img, tip, baseAngle: ang, swayPhase: Phaser.Math.FloatBetween(0, Math.PI * 2), swayFreq: Phaser.Math.FloatBetween(2.2, 4.2), color: TAIL_COLORS[i] ?? 0xffffff });
    }
  }

  /** i 번째 꼬리를 보이게 — grow 면 밑동에서 끝으로 뻗어 나온다 (무적 중이면 1.45배) */
  private showTail(scene: Phaser.Scene, i: number, grow: boolean): void {
    const tl = this.tailPool[i];
    if (!tl || this.tails.includes(tl)) return;
    const k = this.invincibleActive ? 1.45 : 1;
    scene.tweens.killTweensOf([tl.img, tl.tip]);
    for (const o of [tl.img, tl.tip]) o.setAlpha(1).setScale(grow ? 0.05 : k, k).setVisible(true);
    tl.img.play('gumi_tail');
    tl.img.anims.setProgress(Math.random());
    if (grow) scene.tweens.add({ targets: [tl.img, tl.tip], scaleX: k, duration: TAIL_GROW_MS, ease: 'Back.easeOut' });
    this.tails.push(tl);
  }

  private _updateRain(api: GameSceneAPI): void {
    this.rainLoader?.step();
    const scene = api.scene, clock = scene.time;
    const dt = clock.paused ? 0 : scene.game.loop.delta * clock.timeScale;
    this.gameMs += dt;
    const P = GUMI_PARAMS, now = this.gameMs;
    // 필살 — 비 → 그침 → 무지개
    if (this.bowPhase === 'rain') {
      if (this.rainFull) this.rainFull.tilePositionY -= GumiAbility.RAIN_FALL * dt / 1000;
      if (now - this.bowT >= P.bowRainSec * 1000) {
        this.bowPhase = 'bow'; this.bowT = now;
        const f = this.rainFull;
        if (f) scene.tweens.add({ targets: f, alpha: 0, duration: 120, onComplete: () => f.setVisible(false) });   // 비가 '뚝'
        const b = this.bow;
        if (b) {
          scene.tweens.killTweensOf(b);
          b.setPosition(scene.cameras.main.width / 2, scene.cameras.main.height * 0.56).setAlpha(0).setVisible(true);
          scene.tweens.add({ targets: b, alpha: 0.9, duration: 150 });
        }
      }
    } else if (this.bowPhase === 'bow' && now - this.bowT >= P.bowSec * 1000) {
      this.bowPhase = 'idle';
      const b = this.bow;
      if (b) scene.tweens.add({ targets: b, alpha: 0, duration: 250, onComplete: () => b.setVisible(false) });
    }
    // 녹는 연출 — 프레임당 FX_PER_FRAME
    // 빈 칸을 먼저 찾고 꺼낸다 — 시트가 아직 안 왔거나 풀이 다 차 있으면 남겨 둔다 (센티넬 drainZapFx 와 같은 규칙)
    while (this.meltQueue.length > 0 && now - this.meltQueue[0].t > GumiAbility.MELT_STALE_MS) this.meltQueue.shift();
    for (let i = 0; i < GumiAbility.FX_PER_FRAME && this.meltQueue.length > 0; i++) {
      const m = this.melts.find(o => !o.visible);
      if (!m) break;
      const q = this.meltQueue.shift()!;
      m.setPosition(q.x, q.y).setAlpha(1).setVisible(true).play('gumi_melt');
      m.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => m.setVisible(false));
    }
  }

  /** 조건에 맞는 화면 안 일반 똥을 **이 프레임에** 최대 max 개 녹여 회수 — 녹는 연출은 대기열로. 후보 배열은 함수 안에서만 */
  private meltWhere(api: GameSceneAPI, ok: (p: PoolablePoopBase) => boolean, max: number, nearX?: number, nearY?: number): number {
    const H = api.scene.cameras.main.height;
    const cand: { p: PoolablePoopBase; d: number }[] = [];
    for (const obj of api.poops.getChildren()) {
      const p = obj as PoolablePoopBase;
      if (!p.active || p.y < -20 || p.y > H || !ok(p)) continue;
      cand.push({ p, d: nearX === undefined ? 0 : (p.x - nearX) ** 2 + (p.y - (nearY ?? 0)) ** 2 });
    }
    if (nearX !== undefined) cand.sort((a, b) => a.d - b.d);
    let n = 0;
    for (const { p } of cand) {
      if (n >= max) break;
      this.meltQueue.push({ x: p.x, y: p.y, t: this.gameMs });
      p.recycle(true);
      n++;
    }
    this.rainMelts += n;
    return n;
  }

  /** 무지개 여우비 — 화면 전체 비를 켜고, 이 프레임에 화면 안 일반 똥을 구미에 가까운 것부터 bowMax 개 녹인다 */
  private _startBowRain(api: GameSceneAPI): void {
    const P = GUMI_PARAMS;
    this.bowPhase = 'rain'; this.bowT = this.gameMs; this.bowCasts++;
    const f = this.rainFull;
    if (f) { api.scene.tweens.killTweensOf(f); f.setAlpha(GumiAbility.RAIN_ALPHA).setVisible(true); }
    const n = this.meltWhere(api, () => true, P.bowMax, api.player.x, api.player.y);
    if (n > 0) this.award(api, n * P.bowPoints, api.scene.cameras.main.width / 2, 260);
  }

  /** 점수 — awardBonus(→ addAbilityBonus → updateScore, 규칙 3 · 자기 보너스로는 여우불 · 꼬리가 차지 않음) + '+N' 글자 */
  private award(api: GameSceneAPI, pts: number, x: number, y: number): void {
    this.awardBonus(api, pts);
    const txt = api.scene.add.text(x, y, `+${pts}`, {
      fontSize: '20px', fontFamily: 'Arial Black, sans-serif', color: '#ffffff', stroke: '#b8860b', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);
    this.rainTexts.add(txt);
    api.scene.tweens.add({ targets: txt, y: y - 40, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => { this.rainTexts.delete(txt); txt.destroy(); } });
  }
}
