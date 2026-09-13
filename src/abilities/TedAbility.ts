import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { TED_PARAMS } from '../config/abilityParams';
import { fxPickSheetKey, burst, fxSprite, playFx, impact, CUBE_SHEETS } from '../utils/vfx';
import type { FxKey } from '../utils/vfx';

/** 체스 말 시트 (10프레임: 흑/백 × 폰·나이트·비숍·퀸·킹) */
export const TED_CHESS_SHEET = 'chess_96x128.png';

/** 똥(100)·플레이어보다 뒤. 연출이 플레이 화면을 가리면 안 된다 */
const CHESS_DEPTH = 5;

// ── 큐브 연출 레이어 (docs/fx-ted-cube-remake.md §3) ──────────────────────────
// 기하에 붙어 있는 것(본체·균열광·파편)만 시트로 굽고, 자세와 무관한 것(섬광·충격파·
// 불똥·연기)은 코드로 얹는다. 굽지 않으면 수치를 바꿀 때 다시 렌더할 필요가 없다.
const CUBE_DEPTH = 210;        // 본체 (시트)
const SHARD_DEPTH = 209;       // 말 → 칸 전환 조각
const RING_DEPTH = 214;        // 충전 링 · 충격파
/**
 * 큐브를 쓰는가. `vfx.ts` 의 `CUBE_VARIANT` 한 줄이 정한다 (`'none'` 이면 false).
 *
 * false 면 마무리가 **말이 직접 사방으로 퍼지는 연출**이고, 큐브 시트는 로딩조차 하지
 * 않는다. 큐브 쪽 코드(`startCore`·`lockFlash`·`chargeRings`·`shatter`·`startBlast`)는
 * 지우지 않고 남겨 뒀다 — 되살리려면 `CUBE_VARIANT` 만 바꾸면 된다.
 */
const USE_CUBE = CUBE_SHEETS.forge !== null && CUBE_SHEETS.blast !== null;

const WAVE_DEPTH = 214;        // 파열 파동. 본체(210) 위, 섬광(320) 아래

/**
 * 파열 파동 다발 — **파바방**. 한 장이 퍼지는 게 아니라 시차를 둔 여러 겹이 연달아 나간다.
 *
 * 최종 반지름은 프레임 크기가 아니라 **화면 폭 기준**이다 (`reach`). 세로보다 가로가
 * 좁은 화면이라 가로를 기준으로 잡아야 "화면을 쓸고 지나갔다" 가 성립한다.
 * `reach 0.5` 가 딱 좌우 끝에 닿는 크기다.
 *
 * 겹마다 다른 것은 **시작 지연 · 도달 반지름 · 자라는 배율 · 알파**다.
 * 자라는 배율이 속도를 정하고, 시작 배율(= 도달 ÷ 자라는 배율)이 두께를 정한다 —
 * 느리게 자라는 겹일수록 시작부터 크고 두껍다.
 */
const WAVE_VOLLEY: {
  delay: number; reach: number; grow: number; alpha: number;
}[] = [
  { delay: 0,   reach: 0.78, grow: 2.8,  alpha: 1.00 }, // 얇고 빠르게 선두, 좌우 끝을 넘어간다
  { delay: 55,  reach: 0.52, grow: 1.35, alpha: 0.97 }, // 두껍고 느리게 뒤따름
  { delay: 115, reach: 0.66, grow: 2.0,  alpha: 0.94 }, // 사이를 메운다
  { delay: 185, reach: 0.95, grow: 1.7,  alpha: 0.82 }, // 가장 크게 마지막에 훑고 지나감
];

/**
 * 파동 색조. `null` 이면 순수 흑백(기본).
 * 아주 옅은 색을 얹고 싶을 때만 쓴다 — `tint` 는 곱셈이라 흰 코어만 물들고
 * 어두운 테두리는 그대로 남는다 (흑백 기조가 깨지지 않는다).
 */
const WAVE_TINT: number | null = null;

/** 텍스처가 배율 1 에서 그리는 최대 반지름 (`drawCubeWaveFrame` 의 `w * 0.42`) */
const WAVE_UNIT_R = 160 * 0.42;const EMBER_DEPTH = 213;
const SMOKE_DEPTH = 208;       // 본체 **뒤** — 앞에 깔면 폭발을 가린다
const FLASH_DEPTH = 320;

// 결합 섬광은 화면을 덮는 흰 사각이다. **가산이 아니라 일반 블렌드**다 —
// 밝은 배경(background2 평균 192/255)에서 가산 흰색은 아무 일도 안 일어난 것처럼 보인다
const FLASH_ALPHA = 0.30;
const FLASH_FADE_MS = 120;

const GOLD = 0xffb03a;
const GOLD_PALE = 0xffd79a;
/** 조각 착색 — 시트에 구워진 칸 색과 같아야 '같은 물건'으로 읽힌다 */
const IVORY_TINT = 0xe5d4bb;
const BLACK_TINT = 0x2a2320;

/** 시트가 자기 구간을 시작하는 시각 (cubeCore 는 forge 12프레임부터 굽는다) */
const CORE_START_MS = 400;
/** 충전 링이 안으로 빨려 들어오기 시작하는 시각 */
const RING_START_MS = 700;
/** 파편이 벌어지는 최대 반경(px) — 큐브 껍질 부근에서 시트의 칸에게 넘긴다 */
const SHARD_RADIUS = 55;
/** 픽셀 판본 조각의 표시 크기. 원본이 32px 라 **정수 1:1** 이어야 흐려지지 않는다 */
const SHARD_PIXEL_PX = 32;

/** 바람선 텍스처 — vfx 의 절차 생성 파티클 (흰색이라 자유롭게 착색된다) */
const WIND_TEXTURE = 'fx_proc_streak';

/**
 * 앞쪽 불꽃은 **vfx 의 여우불 루프**를 쓴다 (`foxFire` + `foxFireCore`).
 * 정지 텍스처를 회전·확대만 하면 '판때기'로 보인다 — 여우불은 프레임마다 불꽃이
 * 흔들리는 시트라 붙여 두기만 해도 타는 것으로 읽힌다. 무채색이라 마음대로 착색되고,
 * 심지(Core)는 가산으로 얹는 전용 시트가 따로 있다 (회색조를 통째로 착색하면 심지까지 물든다).
 */
const FIRE_TINT = 0xff8a2c;

/** 시트 프레임 크기 — `scale` 이 이걸 기준으로 계산된다 (foxfire_128x192) */
const FIRE_FRAME_W = 128;
const FIRE_FRAME_H = 192;

/**
 * 시트에서 말의 **발바닥**이 있는 세로 위치 (프레임 높이 대비).
 * `scripts` 로 시트를 만들 때 여백 6% 를 두고 바닥선에 세웠다 — 원점을 여기 두어야
 * 프레임 아래 빈 칸만큼 공중에 뜨지 않고 바닥선에 정확히 꽂힌다.
 */
const FOOT_ORIGIN_Y = 0.94;

/**
 * 프레임마다의 **머리 꼭대기** 세로 위치 (프레임 높이 대비). `chess_96x128.png` 의
 * 알파 bbox 를 실측한 값이다 — `scripts/measure-chess-head.py` 로 다시 뽑을 수 있다.
 *
 * 발은 열 프레임 모두 120/128 로 같은데(그래서 {@link FOOT_ORIGIN_Y} 는 상수 하나로 됐다)
 * **머리는 폰 0.47 ~ 킹 0.05 로 0.41 만큼 벌어진다** = 표시 크기로 30px. 퍼질 때는 머리가
 * 진행 방향 앞끝이므로 이걸 상수 하나로 뭉개면 말마다 최대 30px 씩 어긋난다.
 */
export const HEAD_ORIGIN_Y = [
  0.4688, 0.3281, 0.1953, 0.1484, 0.0547,
  0.4375, 0.3125, 0.1953, 0.1484, 0.0625,
];

/** 프레임 번호 → 머리 원점. 모르는 프레임이면 발 원점으로 되돌린다 (그림이 안 튄다) */
function headOriginY(frame: number | string | undefined): number {
  const i = typeof frame === 'number' ? frame : Number(frame);
  return Number.isInteger(i) && i >= 0 && i < HEAD_ORIGIN_Y.length
    ? HEAD_ORIGIN_Y[i] : FOOT_ORIGIN_Y;
}

/**
 * 진행 방향 `(cos θ, sin θ)` 로 **머리가 앞서는** 회전각.
 *
 * Phaser 회전은 시계방향이고 스프라이트 로컬 위 (0,-1) 은 회전 r 에서 `(sin r, -cos r)`
 * 로 간다. `sin r = cos θ`, `-cos r = sin θ` → **r = θ + π/2**.
 * (낙하는 발이 앞이라 부호가 반대인 `-rad` 를 쓴다. 그쪽은 건드리지 않았다.)
 */
function headAheadRotation(dx: number, dy: number): number {
  let r = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) + Math.PI / 2);
  const steps = TED_PARAMS.spreadRotSteps;
  if (steps >= 2) r = Math.round(r / (Math.PI * 2 / steps)) * (Math.PI * 2 / steps);
  // 0(안 돎) 과 정방향 사이를 오가는 손잡이. Wrap 해 둔 덕에 아래로 가는 말도
  // 가까운 쪽(±π)으로 기운다 — 한 바퀴 돌아가지 않는다
  return Phaser.Math.Angle.Wrap(r) * TED_PARAMS.spreadRotFollow;
}

/**
 * 파열 표시 배율 — **화면 가로를 채우는 가장 작은 정수 배율**.
 *
 * 화면 폭이 기기마다 다르므로(`Scale.RESIZE`) 상수로 박지 않고 런타임에 구한다.
 * 기준은 프레임(256)이 아니라 **내용 폭**(알파 bbox 실측 250px) — 프레임 여백까지
 * 세면 그림이 화면에 안 닿는다.
 *
 * **정수만 쓰는 이유**: 1.76 같은 소수 배율은 NEAREST 로도 어떤 픽셀이 2칸,
 * 어떤 픽셀이 1칸이 되어 격자가 불규칙해진다. 픽셀 원화를 키우는 거라 치명적이다.
 * 올림이라 화면보다 조금 넘치는데, 파열에서는 모자란 것보다 넘치는 쪽이 낫다.
 */
function blastScale(scene: Phaser.Scene): number {
  const need = (scene.scale.width * TED_PARAMS.cubeBlastFillW) / TED_PARAMS.cubeBlastContentPx;
  return Phaser.Math.Clamp(Math.ceil(need), 1, TED_PARAMS.cubeBlastScaleMax);
}

/**
 * 큐브가 서는 자리 — **화면 좌표**다. 플레이어를 따라다니지 않는다.
 *
 * 매 프레임 다시 구하는 이유는 `Scale.RESIZE` 라 화면이 바뀔 수 있어서다.
 * 값 자체는 두 번의 곱셈이라 비용이 없다.
 */
function cubeCenter(scene: Phaser.Scene): { x: number; y: number } {
  return {
    x: scene.scale.width * TED_PARAMS.cubeCenterX,
    y: scene.scale.height * TED_PARAMS.cubeCenterY,
  };
}

/**
 * 착지 칸 계산.
 *
 * 좁은 화면에서는 고정 여백이 아까우므로 **화면 폭의 8%** 와 비교해 작은 쪽을 쓴다
 * (360px 화면에서 30 → 28.8). 칸이 말보다 좁아지는 건 어차피 못 피한다 —
 * 아래 {@link TedAbility.pickLandX} 주석의 실측 참고.
 */
function landMargin(w: number): number {
  return Math.min(TED_PARAMS.chessLandMargin, w * 0.08);
}

/** 몸 중앙으로 빨려 들어가는 말 하나. **목표가 매 프레임 움직이므로 트윈을 못 쓴다** */
interface SuckedPiece {
  ob: Phaser.GameObjects.Image;
  sx: number;
  sy: number;
  w0: number;
  h0: number;
  rot0: number;
  rot1: number;
  /** 출발 지연(ms) */
  delay: number;
  /** 이동 시간(ms). **늦게 떠난 말은 짧게 간다** → 전부 같은 시각에 도착한다 */
  dur: number;
  done: boolean;
}

/**
 * 퍼져 나가는 말 하나.
 *
 * 지난 프레임 좌표(`px`,`py`)를 들고 있는 이유는 **터널링** 때문이다 — 한 프레임에
 * 수십 px 을 움직이므로 현재 위치만 보면 똥을 뚫고 지나간다. 낙하가 쓰는
 * {@link TedAbility.smashPoops} 와 같은 **점-선분 거리 판정**을 그대로 쓴다.
 */
interface SpreadPiece {
  ob: Phaser.GameObjects.Image;
  dx: number;
  dy: number;
  dist: number;
  delay: number;
  dur: number;
  w0: number;
  h0: number;
  px: number;
  py: number;
  /** 머리가 앞서는 회전각. 한 번 정하면 날아가는 동안 안 바뀐다 */
  rot: number;
  ghosts: number;
  lastGhost: number;
  done: boolean;
}

/** 말이 부서진 조각. 벌어졌다가 큐브 껍질로 다시 빨려 들어간다 (큐브 판본 전용) */
interface Shard {
  ob: Phaser.GameObjects.Image;
  angle: number;
  scale0: number;
}

/**
 * 테드 (R) — 체스 컨셉. {@link TED_PARAMS.chessInterval}점마다 체스 말 하나가
 * 하늘에서 무작위 방향으로 **일직선**으로 날아와 화면 안 바닥에 꽂힌다.
 * 지나는 길의 일반 똥은 깨지고 개당 {@link TED_PARAMS.chessPoopPoints}점이 붙는다.
 * 꽂힌 말은 바닥에 그대로 남고, {@link TED_PARAMS.chessStackMax} 개가 모이면
 * 몸 중앙으로 빨려 들어가 큐브로 뭉쳤다가 터진다 ({@link clearBoard}).
 *
 * R등급이지만 `RGradeAbility` 를 상속하지 않는다 — 테드는 지금까지 특수 똥 +1점이
 * 없었고, 이번 요청은 연출뿐이라 기존 수치를 건드리지 않는다.
 *
 * 물리 그룹을 쓰지 않는 이유: 충돌 대상이 없어 바디가 낭비고, 경로가 직선이라
 * 트윈 하나로 끝난다. 대신 만든 스프라이트를 전부 {@link tracked} 에 담아 두고
 * {@link onDestroy} 에서 확실히 지운다 (게임 오버 시 트윈·텍스처 누수 방지).
 *
 * **속도감은 본체가 아니라 뒤에 남는 것이 만든다** — 잔상(말의 낱장)과 바람선을
 * 함께 쓴다. 둘 다 장수가 묶여 있어 낙하 한 번의 스프라이트 수가 정해져 있다
 * (본체 1 + 바람선 1 + 앞쪽 불꽃 2 + 잔상 최대 {@link TED_PARAMS.chessTrailMax}).
 */
export class TedAbility extends BaseAbility {
  private lastChessScore = 0;
  /** 아직 **날고 있는** 말 수 — 동시 낙하 상한 판단용 (꽂힌 것은 세지 않는다) */
  private flying = 0;
  /** 바닥에 꽂혀 있는 말. {@link TED_PARAMS.chessStackMax} 개가 되면 한꺼번에 사라진다 */
  private landed: Phaser.GameObjects.Image[] = [];
  /** 아직 안 쓴 착지 칸 번호 (섞여 있다). 판이 비워지면 다시 채운다 */
  private landSlots: number[] = [];
  /** 본체·잔상·바람선 전부. 게임 오버 때 한 번에 회수한다 */
  private tracked = new Set<Phaser.GameObjects.Image>();
  /** 재생 중인 큐브. 살아 있는 동안 플레이어를 따라다닌다 (vfx 가 알아서 회수한다) */
  private cube: Phaser.GameObjects.Sprite | null = null;
  /** 가산 보강층. 본체와 같은 자리에 겹쳐 돈다 */
  private core: Phaser.GameObjects.Sprite | null = null;
  /** null 이 아니면 연출이 재생 중이다 — 겹쳐 발동하지 않는다 */
  private cubeStage: 'forge' | 'blast' | null = null;
  /** 씬이 내려간 뒤 playFx 의 onComplete 가 불려도 폭발하지 않게 하는 빗장 */
  private cancelled = false;
  /** 연출 시작 시각 (scene.time.now — Clock.now 는 timeScale 을 안 본다) */
  private cubeT0 = 0;
  /** 몸 중앙으로 빨려 들어가는 말 */
  private sucking: SuckedPiece[] = [];
  /** 말이 부서진 조각. 중심이 움직이므로 트윈이 아니라 매 프레임 다시 놓는다 (큐브 판본) */
  private shards: Shard[] = [];
  /** 중앙에 다 모여 발사를 기다리는 말 (퍼짐 판본) */
  private spreadReady: Phaser.GameObjects.Image[] = [];
  /** 사방으로 퍼지는 중인 말 */
  private spreading: SpreadPiece[] = [];
  /** 퍼짐 시작 시각 (scene.time.now) */
  private spreadT0 = 0;
  /** 시각이 되면 한 번씩 실행되는 연출 큐 (씬 타이머 대신 — 히트스톱에 멈추지 않는다) */
  private cues: { at: number; fn: (api: GameSceneAPI) => void }[] = [];

  /**
   * 큐브는 '몸 중앙'에서 뭉쳤다 터지는 연출이라 그 자리에 붙어 있어야 한다.
   * 터뜨린 좌표에 고정하면 플레이어가 피하는 동안 혼자 떨어져 남는다.
   */
  override onUpdate(api: GameSceneAPI): void {
    // 큐가 남아 있으면 계속 돈다. `cubeStage` 만 보면 시트가 먼저 끝났을 때
    // 아직 안 터진 연출(파동 겹 등)이 통째로 사라진다
    if (this.cubeStage === null && this.sucking.length === 0 && this.cues.length === 0) return;

    const now = api.scene.time.now;
    const t = now - this.cubeT0;

    // **흡수가 큐보다 먼저다.** 큐를 먼저 돌리면, 프레임이 한 번 건너뛰어
    // 490ms → 600ms 로 점프했을 때 590ms 예약(발산)이 **아직 비어 있는 spreadReady**
    // 를 발사한다. 그 뒤에야 흡수가 끝나 말이 채워지고, 다시 발사되지 않는다 —
    // 말 10개가 중앙에 박힌 채 마무리가 영구히 막힌다 (Codex 재현:
    // `stage="blast", ready=10, spreading=0` 이 3초 뒤에도 동일).
    // 흡수를 먼저 돌리면 같은 프레임에서 말이 먼저 도착해 있다
    if (this.sucking.length > 0) this.stepSuck(api, t);

    while (this.cues.length > 0 && t >= this.cues[0].at) {
      this.cues.shift()!.fn(api);
    }
    if (this.shards.length > 0) this.stepShards(api, t);
    if (this.spreading.length > 0) this.stepSpread(api, now);

    // 큐브는 **화면 중앙 고정**이라 따라다니게 할 것이 없다. 회수된 참조만 정리한다
    if (this.cube && !this.cube.active) this.cube = null;
    if (this.core && !this.core.active) this.core = null;
  }

  override onScoreMilestone(score: number, api: GameSceneAPI): void {
    if (score % TED_PARAMS.chessInterval !== 0) return;
    // **자기 보너스로 들어온 마일스톤은 삼킨다.** 기준선(lastChessScore)만으로는
    // 보너스가 다음 배수를 넘길 때 못 막는다 (Codex 재현: `last=60`·점수 100·+20 →
    // 120 에서 추가 낙하)
    if (this.awarding) return;
    if (score <= this.lastChessScore) return;
    this.lastChessScore = score;
    this.dropPiece(api);
  }

  private dropPiece(api: GameSceneAPI): void {
    const scene = api.scene;
    const key = fxPickSheetKey(TED_CHESS_SHEET);
    if (!scene.textures.exists(key)) return;    // 테드가 아닌 캐릭터로 재진입한 경우
    if (this.flying >= TED_PARAMS.chessMaxAlive) return;

    const { width: W, height: H } = scene.scale;
    const frame = Phaser.Math.Between(0, TED_PARAMS.chessPieces - 1);
    const h = TED_PARAMS.chessHeight;

    // 착지 지점을 먼저 정하고 경로를 거꾸로 뻗어 시작점을 잡는다.
    // 시작 위치는 무작위여도 **끝나는 곳은 반드시 화면 안 바닥**이어야 한다.
    const landX = this.pickLandX(W);
    const landY = H - TED_PARAMS.chessGroundY
      + Phaser.Math.Between(0, TED_PARAMS.chessLandYDrop);

    const rad = Phaser.Math.DegToRad(
      Phaser.Math.FloatBetween(-TED_PARAMS.chessSpread, TED_PARAMS.chessSpread),
    );
    const dist = (landY + h) / Math.cos(rad);
    const startX = landX - Math.sin(rad) * dist;
    const startY = landY - Math.cos(rad) * dist;

    // 진행 방향으로 세운다. 부호가 반대인 이유: Phaser 회전은 시계방향이라 로컬 '아래'
    // (말의 발) 가 (-sin r, cos r) 로 간다 — 이게 진행 벡터 (sin rad, cos rad) 와
    // 같으려면 r = -rad 여야 한다. rad 를 그대로 주면 반대로 기운다
    const rot = -rad;

    // 바람선 — 본체 뒤로 길게 늘어져 따라온다.
    // `proc-streak` 은 **가로로 누운** 선이라 긴 축이 x 다. 그래서 회전을 진행 각도에서
    // 90도 틀고 가로·세로를 바꿔 넣는다 (진행 각도 그대로 주면 선을 옆으로 뭉갠 꼴이
    // 되어 아무것도 안 보인다). 원점을 왼쪽 끝에 둬서 진행 방향의 **반대쪽**으로만 뻗는다
    const wind = scene.add.image(startX, startY, WIND_TEXTURE)
      .setDepth(CHESS_DEPTH - 1)
      .setOrigin(0, 0.5)
      .setDisplaySize(h * TED_PARAMS.chessWindLen, h * TED_PARAMS.chessWindWide)
      .setRotation(rot - Math.PI / 2)
      .setAlpha(0);
    this.tracked.add(wind);

    // 앞쪽 불꽃 — 운석 머리처럼 코끝에서 붙어 뒤로 흘러간다.
    // 불꽃은 로컬 위로 뻗으므로 원점을 아래 끝에 두고 회전을 `rot` 로 주면
    // 뿌리는 코끝, 혀는 진행 반대쪽으로 간다 (말과 같은 각도인 게 우연이 아니다 —
    // 말은 '아래'가 앞, 불꽃은 '위'가 뒤라 둘 다 rot 에서 맞아떨어진다)
    const fire = this.makeFire(scene, startX, startY, rot, h);

    const piece = scene.add.image(startX, startY, key, frame)
      .setDepth(CHESS_DEPTH)
      .setOrigin(0.5, FOOT_ORIGIN_Y)
      .setDisplaySize(h * 0.75, h)
      .setRotation(rot);
    this.tracked.add(piece);
    this.flying++;

    // 말의 코끝(= 원점, 발이 앞선다)에서 진행 방향으로 조금 띄운다
    const leadX = Math.sin(rad) * h * TED_PARAMS.chessFireLead;
    const leadY = Math.cos(rad) * h * TED_PARAMS.chessFireLead;

    const duration = (dist / TED_PARAMS.chessSpeed) * 1000;
    let ghosts = TED_PARAMS.chessTrailMax;
    let lastGhost = 0;
    let prevX = startX;
    let prevY = startY;

    scene.tweens.add({
      targets: piece,
      x: landX,
      y: landY,
      duration,
      ease: 'Quad.easeIn',                      // 가속해서 내리꽂는다
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        if (!piece.active) return;
        // 지난 프레임부터 지금까지의 **선분**으로 판정한다. 1900px/s 면 한 프레임에
        // 30px 넘게 움직여서 현재 위치만 보면 똥을 뚫고 지나간다 (터널링)
        this.smashPoops(api, prevX, prevY, piece.x, piece.y);
        prevX = piece.x;
        prevY = piece.y;
        // 바람선은 본체를 따라오되, 가속에 맞춰 짙어진다 — 처음부터 진하면 '판때기'다
        wind.setPosition(piece.x, piece.y).setAlpha(TED_PARAMS.chessWindAlpha * tw.progress);
        // 불꽃도 같이 짙어진다 — 빨라질수록 앞에서 타는 공기가 두꺼워진다
        const fireA = TED_PARAMS.chessFireAlpha * tw.progress;
        for (let i = 0; i < fire.length; i++) {
          fire[i].setPosition(piece.x + leadX, piece.y + leadY).setAlpha(i === 0 ? fireA : fireA * 0.8);
        }
        if (ghosts <= 0) return;
        const elapsed = tw.progress * duration;
        if (elapsed - lastGhost < TED_PARAMS.chessTrailMs) return;
        lastGhost = elapsed;
        ghosts--;
        this.dropGhost(scene, piece, key, frame, rot);
      },
      onComplete: () => this.land(scene, piece, wind, fire, landX, landY, api),
    });
  }

  /**
   * 앞쪽 불꽃 — 착색된 외곽(`foxFire`) + 흰 심지(`foxFireCore`) 두 겹.
   * 말보다 앞(위 depth)에 그려야 '앞에서 타고 있다'로 읽힌다.
   * 시트가 아직 안 올라왔거나 vfx 동시 상한에 걸리면 `null` 이 오므로 그건 빼고 쓴다.
   */
  private makeFire(
    scene: Phaser.Scene,
    x: number,
    y: number,
    rotation: number,
    h: number,
  ): Phaser.GameObjects.Image[] {
    const sx = (h * TED_PARAMS.chessFireWide) / FIRE_FRAME_W;
    const sy = (h * TED_PARAMS.chessFireLong) / FIRE_FRAME_H;
    const lifeMs = 4000;                        // 보험 — 착지에서 먼저 반납한다

    const layers = [
      fxSprite(scene, x, y, '', {
        sheet: 'foxFire', tint: FIRE_TINT, blend: 'normal',
        depth: CHESS_DEPTH + 1, origin: [0.5, 1], rotation,
        scale: [sx, sy], alpha: 0, lifeMs,
      }),
      fxSprite(scene, x, y, '', {
        sheet: 'foxFireCore', blend: 'add',
        depth: CHESS_DEPTH + 2, origin: [0.5, 1], rotation,
        scale: [sx * 0.62, sy * 0.72], alpha: 0, lifeMs,
        sheetStart: 0.5,                        // 심지는 위상을 어긋나게 — 한 박자로 뛰면 판때기다
      }),
    ];

    const live = layers.filter((l): l is Phaser.GameObjects.Image => l !== null);
    for (const l of live) this.tracked.add(l);
    return live;
  }

  /**
   * 착지 x — **층화 추출**. 칸을 섞은 주머니에서 하나 꺼내 그 칸 안에서만 뽑는다.
   *
   * 매번 독립 균등 난수로 뽑으면 7개가 근처에 몰리는 조합이 확률적으로 자주 나온다
   * (난수가 고르게 퍼진다는 건 착각이다). 주머니 방식은 **서로 다른 칸**을 보장하면서도
   * 칸 안에서는 매번 다른 자리에 꽂힌다.
   *
   * 보장되는 최소 간격 = 칸너비 × (1 − {@link TED_PARAMS.chessLandJitter}).
   * 거기에 안전망으로 이미 꽂힌 말과 {@link TED_PARAMS.chessLandMinGap} 보다 가까우면
   * 같은 칸 안에서 몇 번 다시 뽑는다.
   *
   * **좁은 화면에서는 칸이 말보다 훨씬 좁다.** 말 폭은 `chessHeight × 0.75 = 54px` 인데
   * 말 10개 기준 칸너비는 폭 360 에서 30px, 390 에서 33px, 430 에서 37px 다 —
   * 10개를 안 겹치게 세우려면 `54 × 10 + 여백 = 600px` 이 필요하고, 그런 세로 화면은 없다.
   * 그래서 겹침 자체는 못 없앤다. 대신 (1) 중심이 몰리는 것을 막고
   * (2) {@link TED_PARAMS.chessLandYDrop} 으로 착지 높이를 조금씩 달리해
   * 겹친 말이 '충돌' 이 아니라 '앞뒤' 로 읽히게 한다.
   * 말은 depth 5 라 똥(100)·플레이어보다 뒤에 깔린다 — 빽빽해져도 플레이를 가리지 않는다.
   */
  private pickLandX(w: number): number {
    const margin = landMargin(w);
    const slots = Math.max(1, TED_PARAMS.chessStackMax);
    const span = Math.max(1, w - margin * 2);
    const cell = span / slots;
    const center = margin + cell * (this.nextLandSlot(slots) + 0.5);
    const half = cell * 0.5 * TED_PARAMS.chessLandJitter;

    // 최소 간격이 칸보다 크면 재시도가 절대 성공하지 못한다 — 칸에 맞춰 깎는다
    const minGap = Math.min(TED_PARAMS.chessLandMinGap, cell * 0.8);
    let x = center + Phaser.Math.FloatBetween(-half, half);
    for (let i = 0; i < TED_PARAMS.chessLandRetry && this.tooClose(x, minGap); i++) {
      x = center + Phaser.Math.FloatBetween(-half, half);
    }
    return Phaser.Math.Clamp(x, margin, w - margin);
  }

  private tooClose(x: number, minGap: number): boolean {
    for (const p of this.landed) {
      if (Math.abs(p.x - x) < minGap) return true;
    }
    return false;
  }

  /** 섞인 주머니에서 칸 하나. 비면 다시 채워 섞는다 */
  private nextLandSlot(slots: number): number {
    if (this.landSlots.length === 0) this.refillLandSlots(slots);
    return this.landSlots.pop() ?? 0;
  }

  private refillLandSlots(slots: number): void {
    this.landSlots = Array.from({ length: slots }, (_, i) => i);
    for (let i = this.landSlots.length - 1; i > 0; i--) {   // Fisher-Yates
      const j = Phaser.Math.Between(0, i);
      const t = this.landSlots[i];
      this.landSlots[i] = this.landSlots[j];
      this.landSlots[j] = t;
    }
  }

  /**
   * 낙하 선분 위의 **일반 똥**을 깨고 개수만큼 점수를 준다.
   *
   * 금·다이아·토파즈·무지개는 건드리지 않는다 — 그건 플레이어가 먹어야 하는 보너스라
   * 없애면 도와주는 게 아니라 뺏는 것이 된다 (K 의 에너지파도 같은 이유로 일반 똥만 친다).
   */
  private smashPoops(
    api: GameSceneAPI,
    ax: number, ay: number,
    bx: number, by: number,
  ): void {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const r2 = TED_PARAMS.chessHitRadius * TED_PARAMS.chessHitRadius;

    const targets = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(p => {
        if (!p.active) return false;
        const rx = p.x - ax;
        const ry = p.y - ay;
        // 선분 위로 투영해 0~1 로 자른 뒤 그 지점까지의 거리를 본다
        const t = len2 > 0 ? Math.min(1, Math.max(0, (rx * dx + ry * dy) / len2)) : 0;
        const px = rx - t * dx;
        const py = ry - t * dy;
        return px * px + py * py <= r2;
      });
    if (targets.length === 0) return;

    // 타격 이펙트는 recycle() 안에서 이미 나간다 — 여기서 또 깔면 상한만 잡아먹는다
    for (const p of targets) (p as unknown as PoolablePoopBase).recycle();

    // **점수는 그대로 주되, 그 점수로는 다시 발동하지 않는다** —
    // awardBonus 가 주는 동안 빗장을 걸어 마일스톤을 삼킨다
    this.awardBonus(api, targets.length * TED_PARAMS.chessPoopPoints);
  }

  /** 지나간 자리에 남는 말 낱장 — 알파를 빼며 지운다 */
  private dropGhost(
    scene: Phaser.Scene,
    piece: Phaser.GameObjects.Image,
    key: string,
    frame: number | string,
    rot: number,
    /** 원점 세로. 낙하는 발(기본), 퍼짐은 머리 — 본체와 어긋나면 잔상이 밀린다 */
    originY: number = FOOT_ORIGIN_Y,
  ): void {
    const ghost = scene.add.image(piece.x, piece.y, key, frame)
      .setDepth(CHESS_DEPTH - 1)
      .setOrigin(0.5, originY)
      .setDisplaySize(piece.displayWidth, piece.displayHeight)
      .setRotation(rot)
      .setAlpha(TED_PARAMS.chessTrailAlpha);
    this.tracked.add(ghost);

    scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: TED_PARAMS.chessTrailFade,
      onComplete: () => this.discard(ghost),
    });
  }

  /** 착지 — 바람선이 터지듯 흩어지고, 흙먼지 한 번, 짧게 눌렸다 펴진 뒤 사라진다 */
  private land(
    scene: Phaser.Scene,
    piece: Phaser.GameObjects.Image,
    wind: Phaser.GameObjects.Image,
    fire: Phaser.GameObjects.Image[],
    x: number,
    y: number,
    api: GameSceneAPI,
  ): void {
    if (!piece.active) return;

    // 불꽃은 바닥에 부딪히며 옆으로 터져 나간다
    for (const f of fire) {
      scene.tweens.add({
        targets: f,
        alpha: 0,
        scaleX: f.scaleX * 1.9,
        scaleY: f.scaleY * 0.5,
        duration: 150,
        onComplete: () => this.discard(f),
      });
    }

    scene.tweens.add({
      targets: wind,
      alpha: 0,
      displayHeight: wind.displayHeight * 2.4,  // 부딪히며 옆으로 퍼진다 (두께가 세로 축이다)
      duration: 150,
      onComplete: () => this.discard(wind),
    });

    burst(scene, x, y, 'smoke', { count: 6, scale: 0.5, depth: CHESS_DEPTH + 1 });

    const h = piece.displayHeight;
    scene.tweens.add({
      targets: piece,
      displayHeight: h * 0.88,                  // 박히는 순간의 눌림
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    // 꽂힌 말은 그대로 바닥에 남는다. 다 차면 한꺼번에 걷어낸다
    this.flying--;
    this.landed.push(piece);
    if (this.landed.length >= TED_PARAMS.chessStackMax) this.clearBoard(api);
  }

  /**
   * 꽂힌 말이 다 차면 — **몸 중앙으로 빨려 들어가 큐브가 되었다가 터진다.**
   *
   * 흡수 → 조각 → 3×3 결합 → 충전 → 파열이 **한 동작**이어야 한다. 끊기는 지점이
   * 셋 있었고 셋 다 여기서 막는다 (docs/fx-ted-cube-remake.md §6):
   *
   * 1. 말의 목적지를 발동 순간 좌표로 박으면 이동 중 발동했을 때 큐브와 갈라진다
   *    → 트윈을 버리고 {@link stepSuck} 에서 **매 프레임 현재 플레이어 좌표로 보간**한다
   * 2. 말의 도착과 시트의 결합 섬광이 어긋나면 결합이 먼저 끝나고 말이 나중에 온다
   *    → 출발만 어긋뜨리고 **도착은 한 시점에 모은다** (dur = chessSuckMs - delay)
   * 3. 말 7개가 어떻게 3×3 이 되는가
   *    → 도착한 말이 {@link TED_PARAMS.cubeShards} 조각으로 부서진다.
   *      7 × 4 = 28 ≈ 큐브 한 자세에서 보이는 칸 26. 섬광이 그 위를 덮으며 큐브가 된다
   *
   * 시간은 씬 타이머가 아니라 `scene.time.now` 기준 경과로 잰다 — `Clock.now` 는
   * `timeScale` 을 보지 않아 파열의 히트스톱에도 연출이 밀리지 않는다.
   */
  private clearBoard(api: GameSceneAPI): void {
    const { scene } = api;
    const board = this.landed;
    this.landed = [];
    // 판이 비었으니 주머니도 새로 — 상한(chessMaxAlive)에 걸려 건너뛴 낙하가 있으면
    // 남은 칸이 어긋난 채로 다음 판에 넘어간다
    this.landSlots = [];

    // 이미 재생 중이면 이번 판은 조용히 걷어낸다. 큐에 쌓아 두면 엉뚱한 시점에 터진다
    if (this.cubeStage !== null) {
      for (const p of board) this.discard(p);
      return;
    }

    this.cancelled = false;
    this.cubeStage = 'forge';
    this.cubeT0 = scene.time.now;

    // **재생을 걸기 전에 상태를 다 세운다.** playFx 의 onComplete 가 (테스트 스텁처럼)
    // 동기로 불리면 startBlast 가 먼저 돌아 버리는데, 그 뒤에 여기서 cues 를 덮으면
    // 파열 연출이 통째로 사라진다
    this.sucking = board.map((ob, i) => {
      const delay = i * TED_PARAMS.chessFadeStep;
      return {
        ob,
        sx: ob.x,
        sy: ob.y,
        w0: ob.displayWidth,
        h0: ob.displayHeight,
        rot0: ob.rotation,
        rot1: ob.rotation + Phaser.Math.FloatBetween(-2, 2),
        delay,
        dur: Math.max(80, TED_PARAMS.chessSuckMs - delay),
        done: false,
      };
    });

    if (!USE_CUBE) {
      // 퍼짐 판본 — 다 모이면 잠깐 멈췄다가 사방으로 터져 나간다
      this.cues = [{
        at: TED_PARAMS.chessSuckMs + TED_PARAMS.spreadHoldMs,
        fn: (a: GameSceneAPI) => this.startSpread(a),
      }];
      return;
    }

    this.cues = [
      { at: CORE_START_MS, fn: (a: GameSceneAPI) => this.startCore(a) },
      { at: TED_PARAMS.cubeGatherMs, fn: (a: GameSceneAPI) => this.lockFlash(a) },
      { at: RING_START_MS, fn: (a: GameSceneAPI) => this.chargeRings(a) },
    ];

    const c = cubeCenter(scene);
    this.cube = playFx(scene, CUBE_SHEETS.forge as FxKey, c.x, c.y, {
      scale: TED_PARAMS.cubeForgeScale,
      alpha: TED_PARAMS.cubeForgeAlpha,
      depth: CUBE_DEPTH,
      onComplete: () => { this.cube = null; this.startBlast(api); },
    });
    // 시트를 못 올린 경우(다른 캐릭터로 재진입 등) 말만 조용히 걷어내고 끝낸다
    if (!this.cube && this.cubeStage === 'forge') {
      this.cubeStage = null;
      this.cues = [];
      for (const p of this.sucking) this.discard(p.ob);
      this.sucking = [];
    }
  }

  /** 가산 보강층 — 본체 시트의 12프레임 시점에 맞춰 얹는다 (픽셀 판본에는 없다) */
  private startCore(api: GameSceneAPI): void {
    if (this.cubeStage !== 'forge' || !CUBE_SHEETS.core) return;
    const c = cubeCenter(api.scene);
    this.core = playFx(api.scene, CUBE_SHEETS.core, c.x, c.y, {
      scale: TED_PARAMS.cubeForgeScale,
      alpha: TED_PARAMS.cubeForgeAlpha,
      onComplete: () => { this.core = null; },
    });
  }

  /**
   * 결합 섬광 — 화면을 한 번 덮는다. **일반 블렌드**여야 밝은 배경에서도 컷으로 읽힌다
   * (가산 흰색은 밝은 배경 위에서 아무 일도 일어나지 않는다).
   */
  private lockFlash(api: GameSceneAPI): void {
    const { scene } = api;
    const { width: W, height: H } = scene.scale;
    const rect = scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, FLASH_ALPHA)
      .setDepth(FLASH_DEPTH)
      .setScrollFactor(0);
    scene.tweens.add({
      targets: rect,
      alpha: 0,
      duration: FLASH_FADE_MS,
      onComplete: () => rect.destroy(),
    });
    // 아주 약하게 — 결합은 예고지 타격이 아니다
    impact(scene, { shake: { duration: 80, intensity: 0.002 } });
  }

  /**
   * 충전 링 — 기준 이미지 03 의 동심원. **밖에서 안으로 빨려 들어온다** (충전이다).
   * 시트에 굽지 않는 이유는 프레임 밖까지 뻗기 때문이다.
   */
  private chargeRings(api: GameSceneAPI): void {
    if (this.cubeStage !== 'forge' || !CUBE_SHEETS.softFx) return;
    const { scene } = api;
    const c = cubeCenter(scene);
    const life = TED_PARAMS.cubeBurstMs - RING_START_MS + 200;

    for (let i = 0; i < 2; i++) {
      const from = 2.6 + i * 0.9;
      const ring = fxSprite(scene, c.x, c.y, 'fx_proc_ring', {
        depth: RING_DEPTH,
        blend: 'add',
        tint: GOLD,
        alpha: 0,
        scale: [from, from],
        lifeMs: life,
        slot: 'tedRing',
        maxConcurrent: 2,
      });
      if (!ring) continue;
      this.tracked.add(ring);
      scene.tweens.add({
        targets: ring, alpha: 0.42, duration: 140, delay: i * 110,
      });
      scene.tweens.add({
        targets: ring,
        scaleX: 0.9,
        scaleY: 0.9,
        rotation: (i === 0 ? 1 : -1) * 1.2,
        duration: life - 260,
        delay: i * 110,
        ease: 'Quad.easeIn',
        onComplete: () => this.discard(ring),
      });
    }
  }

  /**
   * 말 → 큐브 칸. 매 프레임 현재 중심을 기준으로 다시 놓는다 (중심이 움직인다).
   *
   * 조각 그림은 판본을 따른다 — 픽셀 판본에서는 시트와 **같은 팔레트로 그린 칸 한 장**을
   * 1:1 로 띄운다. `proc-shard` 는 알파가 부드러워서 하드 엣지 옆에 붙으면 튄다.
   * 장수(말 × cubeShards)와 시각은 판본과 무관하게 그대로다.
   */
  private shatter(api: GameSceneAPI, x: number, y: number, size: number): void {
    const { scene } = api;
    const n = TED_PARAMS.cubeShards;
    const pixel = !CUBE_SHEETS.softFx;
    for (let i = 0; i < n; i++) {
      const ivory = i % 2 === 0;
      const key = pixel
        ? (ivory ? 'fx_px_cubie_ivory' : 'fx_px_cubie_dark')
        : 'fx_proc_shard';
      const px = pixel ? SHARD_PIXEL_PX : size * 0.42;   // 픽셀은 정수 1:1 로 띄운다
      const ob = scene.add.image(x, y, key)
        .setDepth(SHARD_DEPTH)
        .setAlpha(TED_PARAMS.cubeForgeAlpha)     // 큐브와 같은 반투명도
        .setDisplaySize(px, px);
      if (!pixel) ob.setTint(ivory ? IVORY_TINT : BLACK_TINT);
      this.tracked.add(ob);
      this.shards.push({
        ob,
        angle: (i / n) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.4, 0.4),
        scale0: ob.scaleX,
      });
    }
  }

  /** 흡수 — 목표가 매 프레임 움직이므로 트윈이 아니라 직접 보간한다 */
  private stepSuck(api: GameSceneAPI, t: number): void {
    const c = cubeCenter(api.scene);
    let alive = false;

    for (const p of this.sucking) {
      if (p.done) continue;
      const u = Phaser.Math.Clamp((t - p.delay) / p.dur, 0, 1);
      const k = u * u;                                 // Quad.easeIn — 가속해서 빨려 든다
      p.ob.setPosition(
        Phaser.Math.Linear(p.sx, c.x, k),
        Phaser.Math.Linear(p.sy, c.y, k),
      );
      p.ob.setDisplaySize(p.w0 * (1 - 0.8 * k), p.h0 * (1 - 0.8 * k));
      p.ob.setRotation(Phaser.Math.Linear(p.rot0, p.rot1, k));
      p.ob.setAlpha(1 - 0.85 * k);

      if (u < 1) { alive = true; continue; }
      p.done = true;
      if (USE_CUBE) {
        this.shatter(api, c.x, c.y, p.h0);             // 말이 조각으로 부서진다 (큐브 판본)
        this.discard(p.ob);
      } else {
        // 퍼짐 판본 — 말을 버리지 않는다. 중앙에 세워 두고 발사를 기다린다.
        // **원점을 발에서 머리로 옮긴다** — 퍼질 때는 머리가 진행 방향 앞끝이라
        // 회전축도 판정 끝점도 거기여야 한다 (자세한 이유는 HEAD_ORIGIN_Y 주석)
        p.ob.setOrigin(0.5, headOriginY(p.ob.frame?.name));
        p.ob.setPosition(c.x, c.y).setRotation(0).setAlpha(1);
        p.ob.setDisplaySize(p.w0 * 0.34, p.h0 * 0.34);
        this.spreadReady.push(p.ob);
      }
    }
    if (!alive) this.sucking = [];
  }

  /** 조각이 살짝 벌어졌다가 큐브 껍질로 다시 빨려 들어간다 (500 → 600ms) */
  private stepShards(api: GameSceneAPI, t: number): void {
    const u = Phaser.Math.Clamp(
      (t - TED_PARAMS.chessSuckMs) / TED_PARAMS.cubeShardMs, 0, 1);
    if (u >= 1) {
      for (const sh of this.shards) this.discard(sh.ob);
      this.shards = [];
      return;
    }
    const r = SHARD_RADIUS * Math.sin(u * Math.PI);    // 벌어졌다 다시 모인다
    const c = cubeCenter(api.scene);
    for (const sh of this.shards) {
      sh.ob.setPosition(c.x + Math.cos(sh.angle) * r, c.y + Math.sin(sh.angle) * r);
      // 픽셀 판본은 **회전시키지 않는다** — 임의 각도 회전이 하드 엣지를 뭉갠다.
      // 크기도 단계로만 줄인다
      if (CUBE_SHEETS.softFx) {
        sh.ob.setScale(sh.scale0 * (1 - u * 0.85));
        sh.ob.setRotation(sh.angle + u * 3.0);
      } else {
        const steps = 3;
        sh.ob.setScale(sh.scale0 * (1 - Math.round(u * steps) / steps * 0.66));
      }
    }
  }

  /**
   * 파열 — `cubeForge` 재생이 끝나는 순간에 붙는다. 시각을 따로 재지 않는 이유는
   * **시트와 한 프레임도 어긋나면 안 되기 때문**이다 (`cubeBlast` 0프레임이
   * `cubeForge` 마지막 프레임의 복제라 이음새가 안 보인다).
   *
   * `onComplete` 는 씬이 내려가며 강제 파기될 때도 불린다 — 빗장 두 개를 확인한다.
   */
  private startBlast(api: GameSceneAPI): void {
    if (this.cancelled || this.cubeStage !== 'forge') return;
    const { scene } = api;
    if (!scene.scene || !scene.scene.isActive()) { this.cubeStage = null; return; }
    const c = cubeCenter(scene);

    this.cubeStage = 'blast';
    if (this.core) { this.core.destroy(); this.core = null; }

    // 히트스톱 70ms — vfx 의 상한 200ms 안이고, Clock.now 는 timeScale 을 보지 않아
    // GameScene 의 rAF 비율 안티치트에 잡히지 않는다. **물리는 절대 멈추지 않는다**
    impact(scene, {
      hitstop: TED_PARAMS.cubeHitstopMs,
      shake: { duration: 260, intensity: 0.006 },
    });

    // **파열에서 크기가 크게 튄다** — forge 0.72 → blast (화면을 채우는 정수 배율).
    // 예비 압축(시트 안에서 큐브가 116 → 96px 로 줄어든다) 다음에 오는 한 프레임짜리
    // 확대라 '팡' 으로 읽힌다. 히트스톱·셰이크가 같은 프레임에 겹친다
    this.cube = playFx(scene, CUBE_SHEETS.blast as FxKey, c.x, c.y, {
      scale: blastScale(scene),
      alpha: TED_PARAMS.cubeBlastAlpha,
      depth: CUBE_DEPTH,
      onComplete: () => { this.cube = null; this.cubeStage = null; },
    });
    if (!this.cube) this.cubeStage = null;
    else {
      // **커질수록 옅어진다.** 다 퍼지면 화면 가로를 넘으므로 그 구간에서
      // 플레이(똥·플레이어)가 비쳐야 한다. playFx 가 회수할 때 트윈도 같이 정리된다
      scene.tweens.add({
        targets: this.cube,
        alpha: TED_PARAMS.cubeBlastAlphaEnd,
        duration: TED_PARAMS.cubeTotalMs - TED_PARAMS.cubeBurstMs,
        ease: 'Quad.easeIn',
      });
    }

    // 파열 파동 다발 — 시차를 둬야 '파바방' 이 된다. 한 장만 퍼지면 그냥 링 하나다.
    // 씬 타이머가 아니라 연출 큐로 미룬다 (Clock.now 는 히트스톱에 안 멈춘다)
    if (CUBE_SHEETS.wave) {
      // 덮어쓰지 않고 **덧붙인다** — 남아 있는 큐가 있으면 같이 시각순으로 돈다
      for (const v of WAVE_VOLLEY) {
        this.cues.push({
          at: TED_PARAMS.cubeBurstMs + v.delay,
          fn: (a: GameSceneAPI) => this.waveLayer(a, v),
        });
      }
      this.cues.sort((p, q) => p.at - q.at);
    }

    // **화면의 일반 똥을 전부 걷어낸다.** 파동이 지나간 자리가 비는 것이 연출이다
    this.clearNormalPoops(api);

    // 파열 정액 보너스. **빗장이 먼저다** — `addAbilityBonus` 는 GameScene 안에서
    // 점수를 1씩 올리며 마일스톤을 호출하므로, 그냥 주면 낙하 간격(40점) 때문에
    // 그 자리에서 말이 2~3개 즉시 떨어지고 그 말이 또 똥을 깨는 연쇄가 생긴다
    this.awardBonus(api, TED_PARAMS.cubeBurstPoints);

    // 부드러운 레이어는 판본이 정한다. 픽셀 판본에서는 방사 광선·별빛이 시트 안에
    // 각진 형태로 이미 그려져 있어서, 여기에 그라데이션 파티클을 더하면 화풍만 깨진다
    if (!CUBE_SHEETS.softFx) return;

    // 충격파 — 짧고 강해서 가산이 맞는 유일한 경우다
    const wave = fxSprite(scene, c.x, c.y, 'fx_proc_ring', {
      depth: RING_DEPTH,
      blend: 'add',
      tint: GOLD_PALE,
      alpha: 0.85,
      scale: [0.25, 0.25],
      lifeMs: 400,
      slot: 'tedWave',
      maxConcurrent: 1,
    });
    if (wave) {
      this.tracked.add(wave);
      scene.tweens.add({
        targets: wave,
        scaleX: 3.0,
        scaleY: 3.0,
        alpha: 0,
        duration: 220,
        ease: 'Quad.easeOut',
        onComplete: () => this.discard(wave),
      });
    }

    burst(scene, c.x, c.y, 'ember',
      { count: 14, scale: 0.6, speed: 1.5, depth: EMBER_DEPTH, tint: [GOLD, GOLD_PALE] });
    // 연기는 본체 **뒤**에서 퍼져야 부피가 생긴다. 앞에 깔면 폭발을 가린다
    burst(scene, c.x, c.y, 'smoke',
      { count: 8, scale: 0.8, speed: 0.7, depth: SMOKE_DEPTH, lifespan: 1.6 });
  }

  /**
   * 파열 순간 화면의 **일반 똥을 전부 반납한다.**
   *
   * `api.poops` 는 일반 똥 전용 그룹이다 — 금·다이아·토파즈·무지개는 각자 다른 그룹이라
   * 여기서 건드릴 수 없다. 그건 플레이어가 먹어야 하는 보너스라 없애면 뺏는 것이 된다
   * (체스 말 낙하 {@link smashPoops} 도 같은 이유로 이 그룹만 친다).
   *
   * **점수는 여기서 주지 않는다** — 정액 보너스는 {@link startBlast} 가 가드와 함께 준다.
   * 지운 개수에 비례해 주지 않는 이유는 한 번에 60개까지 지울 수 있어서다 (개당이면
   * 1800점이 한 프레임에 들어온다).
   *
   * `recycle(true)` 로 **조용히** 반납하는 게 핵심이다. 그냥 `recycle()` 하면 똥마다
   * 타격 이펙트가 한 번씩 나가는데, 풀 상한이 60이라 최악의 경우 한 프레임에 60번이다.
   * `maxConcurrent` 가 6에서 막아 주긴 하지만 그 전에 슬롯 경쟁과 스프라이트 생성 비용이
   * 한 프레임에 몰린다 (KAbility 의 빔에도 같은 주석이 있다).
   * 사라지는 연출은 파동 하나가 맡는다.
   *
   * 거리 판정으로 파동에 닿는 것만 지우지 않는 이유: 파동의 최대 반지름이 화면 좌표로
   * 약 150px 라 세로 640 화면의 11% 밖에 덮지 못한다. 대부분의 똥이 살아남아 기능이
   * 성립하지 않는다. 한 번에 걷어내고 파동은 연출로 둔다.
   */
  private clearNormalPoops(api: GameSceneAPI): number {
    // 반납이 그룹 배열을 건드려도 안전하도록 먼저 복사한다
    const list = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice();
    let n = 0;
    for (const p of list) {
      if (!p.active) continue;
      (p as unknown as PoolablePoopBase).recycle(true);
      n++;
    }
    return n;
  }

  /**
   * 마무리 — **모인 말이 사방으로 퍼진다.**
   *
   * 큐브로 뭉치지도, 충전하지도 않는다. 모였다가 바로 터져 나가고,
   * **퍼지는 말이 지나간 자리의 똥만** 지워진다 (화면 전체를 쓸지 않는다).
   */
  private startSpread(api: GameSceneAPI): void {
    if (this.cancelled || this.cubeStage !== 'forge') return;
    const { scene } = api;
    if (!scene.scene || !scene.scene.isActive()) { this.cubeStage = null; return; }

    const t = scene.time.now - this.cubeT0;
    // **빈 채로 발사하지 않는다.** 순서를 고쳐도 프레임이 크게 건너뛰면 흡수가
    // 아직 남아 있을 수 있다. 그때는 발사를 다음 프레임으로 미룬다 —
    // 한 번 비워서 쏘면 말이 중앙에 영원히 남는다
    if (this.spreadReady.length === 0 && this.sucking.length > 0) {
      // **반드시 미래 시각으로** 다시 건다. `at: t` 로 넣으면 지금 돌고 있는
      // 큐 배수 루프(`t >= cues[0].at`)가 곧바로 다시 집어 무한 루프가 된다
      this.cues.push({ at: t + 16, fn: (a: GameSceneAPI) => this.startSpread(a) });
      this.cues.sort((x, y) => x.at - y.at);
      return;
    }

    this.cubeStage = 'blast';
    this.spreadT0 = scene.time.now;
    const c = cubeCenter(scene);

    impact(scene, {
      hitstop: TED_PARAMS.cubeHitstopMs,
      shake: { duration: 260, intensity: 0.006 },
    });
    this.lockFlash(api);                       // 터져 나가는 순간의 섬광

    // 파동은 **말보다 짧다** (최대 화면 폭 0.95 vs 말은 모서리 밖). 말이 파동을
    // 앞지르는데, 그대로 뒀다 — 파동은 9프레임 30fps = 300ms 만에 알파가 0 이 되고
    // 말은 그 뒤로도 300ms 를 더 날아간다. 둘이 같이 보이는 구간에서는 여전히 파동이
    // 앞서므로 앞지르는 장면 자체가 화면에 없다. 파동을 화면 밖까지 키우면 보이지도
    // 않는 곳을 덧그리는 오버드로만 늘어난다
    if (CUBE_SHEETS.wave) {
      // **실제로 터진 시각 기준**이다. 예약 시각으로 잡으면 발사가 밀렸을 때
      // 파동이 이미 지난 시각에 걸려 한 프레임에 다 쏟아진다
      const at = t;
      for (const v of WAVE_VOLLEY) {
        this.cues.push({ at: at + v.delay, fn: (a: GameSceneAPI) => this.waveLayer(a, v) });
      }
      this.cues.sort((x, y) => x.at - y.at);
    }

    // 발동 정액 보너스. **빗장이 먼저다** — addAbilityBonus 는 점수를 1씩 올리며
    // 마일스톤을 호출하므로 그냥 주면 그 자리에서 다음 낙하가 연쇄로 걸린다
    this.awardBonus(api, TED_PARAMS.cubeBurstPoints);

    const n = Math.max(1, this.spreadReady.length);
    // 화면 모서리까지 + 말 하나. 어느 방향으로 가도 화면 밖으로 나간다
    const reach = (Math.hypot(scene.scale.width / 2, scene.scale.height / 2)
      + TED_PARAMS.chessHeight) * TED_PARAMS.spreadReachMul;
    this.spreading = this.spreadReady.map((ob, i) => {
      // 방향을 고르게 나눈 뒤 흔든다. 흔들지 않으면 정확한 방사형이라 도형처럼 보인다
      const ang = (i / n) * Math.PI * 2
        + Phaser.Math.FloatBetween(-TED_PARAMS.spreadAngleJit, TED_PARAMS.spreadAngleJit);
      const v = TED_PARAMS.spreadReachVar;
      const dv = TED_PARAMS.spreadDurVar;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const rot = headAheadRotation(dx, dy);
      ob.setRotation(rot);                     // 멈칫하는 동안 조준하듯 돌아선다
      return {
        ob,
        dx,
        dy,
        // **위로만** 흔든다. 아래로 흔들면 그 말은 화면 안에서 멈춰 허공에서 사라진다
        dist: reach * Phaser.Math.FloatBetween(1, 1 + v),
        delay: i * TED_PARAMS.spreadStagger,
        dur: TED_PARAMS.spreadMs * Phaser.Math.FloatBetween(1 - dv, 1 + dv),
        w0: TED_PARAMS.chessHeight * 0.75,
        h0: TED_PARAMS.chessHeight,
        px: c.x,
        py: c.y,
        rot,
        ghosts: TED_PARAMS.spreadTrailMax,
        lastGhost: 0,
        done: false,
      };
    });
    this.spreadReady = [];
  }

  /**
   * 퍼지는 말 한 프레임.
   *
   * **초반에 확 나가고 끝에서 잦아든다** — `1 - (1-u)^4`. 등속이면 밋밋하다.
   * 이동 선분 위의 똥을 {@link smashPoops} 로 깬다 (터널링 방지).
   */
  private stepSpread(api: GameSceneAPI, now: number): void {
    const c = cubeCenter(api.scene);
    const t = now - this.spreadT0;
    let alive = false;

    for (const p of this.spreading) {
      if (p.done) continue;
      const u = Phaser.Math.Clamp((t - p.delay) / p.dur, 0, 1);
      if (u <= 0) { alive = true; continue; }
      const k = 1 - Math.pow(1 - u, 4);
      const x = c.x + p.dx * p.dist * k;
      const y = c.y + p.dy * p.dist * k;

      this.smashPoops(api, p.px, p.py, x, y);
      p.px = x;
      p.py = y;

      // 출발하며 제 크기를 되찾는다. **끝에서 줄이거나 흐리게 하지 않는다** —
      // 화면 밖으로 나가 버리므로 사라지는 연출이 따로 필요 없다
      const grow = 0.34 + 0.66 * Math.min(1, u * 4);
      p.ob.setPosition(x, y);
      p.ob.setDisplaySize(p.w0 * grow, p.h0 * grow);

      // 잔상 — 속도감은 본체가 아니라 뒤에 남는 것이 만든다 (낙하와 같은 자산을 쓴다)
      if (p.ghosts > 0 && t - p.lastGhost >= TED_PARAMS.spreadTrailMs) {
        p.lastGhost = t;
        p.ghosts--;
        // 텍스처 키를 객체에서 읽되, 없으면 체스 시트로 되돌린다 (스텁·재진입 안전)
        const tex = p.ob.texture?.key ?? fxPickSheetKey(TED_CHESS_SHEET);
        this.dropGhost(api.scene, p.ob, tex, p.ob.frame?.name ?? 0, p.rot,
          headOriginY(p.ob.frame?.name));
      }

      // 화면 밖으로 나가면 **거기서 끝낸다.** 안 보이는 말을 계속 옮기고 똥까지
      // 훑는 것은 낭비다 (말 10개 × 똥 60개 = 프레임당 600회 판정이 여기서 줄어든다)
      const pad = Math.max(p.w0, p.h0) * TED_PARAMS.spreadCullPad;
      const out = x < -pad || y < -pad
        || x > api.scene.scale.width + pad || y > api.scene.scale.height + pad;
      if (u < 1 && !out) { alive = true; continue; }
      p.done = true;
      this.discard(p.ob);
    }
    if (!alive) {
      this.spreading = [];
      this.cubeStage = null;
    }
  }

  /** 파동 한 겹. 중심은 큐브와 같은 **화면 중앙**이다 */
  private waveLayer(api: GameSceneAPI, v: typeof WAVE_VOLLEY[number]): void {
    if (this.cancelled || !CUBE_SHEETS.wave) return;
    // 도달 반지름을 화면 폭에서 역산한다. 프레임 크기에 묶으면 기기마다 범위가 달라진다
    const finalScale = (v.reach * api.scene.scale.width) / WAVE_UNIT_R;
    const c = cubeCenter(api.scene);
    playFx(api.scene, CUBE_SHEETS.wave, c.x, c.y, {
      depth: WAVE_DEPTH,
      scale: finalScale / v.grow,
      scaleTo: v.grow,
      alpha: v.alpha,
      blend: 'normal',
      ...(WAVE_TINT !== null ? { tint: WAVE_TINT } : {}),
    });
  }

  private discard(obj: Phaser.GameObjects.Image): void {
    this.tracked.delete(obj);
    obj.destroy();
  }

  override onDestroy(api: GameSceneAPI): void {
    // 빗장 먼저 — 아래에서 시트를 파기하면 playFx 의 onComplete 가 불리고,
    // 그게 startBlast 를 타면 이미 내려간 씬에 폭발을 그린다
    this.cancelled = true;
    this.cubeStage = null;
    this.cues = [];

    for (const obj of this.tracked) {
      api.scene.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.tracked.clear();
    for (const p of this.sucking) p.ob.destroy();
    this.sucking = [];
    for (const sh of this.shards) sh.ob.destroy();
    this.shards = [];
    for (const ob of this.spreadReady) ob.destroy();
    this.spreadReady = [];
    for (const sp of this.spreading) sp.ob.destroy();
    this.spreading = [];
    this.landed = [];
    this.landSlots = [];   // 씬 재시작에 주머니가 남으면 다음 판이 한쪽으로 쏠린다
    this.flying = 0;
    this.cube = null;      // 시트 스프라이트는 vfx 의 씬 트래커가 회수한다
    this.core = null;
  }
}
