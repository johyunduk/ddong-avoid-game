import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import { type GameSceneAPI } from './types';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import {
  HEIDI_PARAMS, HEIDI_PUYO_SHEETS, HEIDI_WEAPON, HEIDI_WEAPON_SHEET,
  HEIDI_CLONE_CHARS, HEIDI_CLONE_SHEETS, HEIDI_CLONE_FIN,
  HEIDI_FX_CROW, HEIDI_FX_CLONEPOSE, HEIDI_FX_AMATERASU, HEIDI_FX_RASENGAN, HEIDI_FX_RASENBLAST,
  HEIDI_FX_SUSANOO, HEIDI_FX_SWORDWAVE, HEIDI_FX_TRIGRAM, HEIDI_FX_PALM, HEIDI_FX_CHOJISLAM, HEIDI_FX_BOMBTAG, HEIDI_FX_TAGBLAST, HEIDI_FX_CHOJIBALL, HEIDI_FX_GATE,
  HEIDI_FX_TOAD, HEIDI_FX_FIREJET, HEIDI_FX_OILJET, HEIDI_SHEET_FIX,
  type CloneFinForm,
} from '../config/abilityParams';
import { fxPickSheetKey, burst, impact as vfxImpact, fxSprite, playFx } from '../utils/vfx';

/**
 * 하이디의 타격감 — 히트스톱·섬광·펀치는 그대로, **화면 흔들림만 뺀다** (사람 판정: "화면 흔들리는 거
 * 정신없다"). 기술이 잦고 겹쳐서 흔들림이 쌓였다. `HEIDI_PARAMS.screenShake` 로 되살릴 수 있다
 */
function impact(scene: Phaser.Scene, opts: Parameters<typeof vfxImpact>[1]): void {
  vfxImpact(scene, HEIDI_PARAMS.screenShake ? opts : { ...opts, shake: undefined });
}

/** 시트별 프레임 구간 — 그림을 열어 확인한 값이다 */
// 걷기 fps 는 배회 속도에 딸린다 — 안 맞추면 **발이 바닥을 미끄러진다**.
// 105px/s 에 10fps 였으니 150px/s 면 대략 14fps 다
const PUYO_WALK   = { start: 0, end: 5, fps: 14 };
const PUYO_IDLE   = { start: 0, end: 3, fps: 5 };
const PUYO_CROUCH = { start: 0, end: 2, fps: 14 };
const PUYO_JUMP   = { start: 0, end: 2, fps: 12 };
const PUYO_KICK   = { start: 0, end: 5, fps: 14 };
const PUYO_WALL   = { start: 0, end: 2, fps: 12 };
const PUYO_THROW  = { start: 0, end: 2, fps: 16 };
const PUYO_DASH   = { start: 0, end: 2, fps: 20 };
// 인 맺기 6컷. fps 는 HEIDI_PARAMS.sealFps (등록 시점에 읽는다)
const PUYO_SEAL_FRAMES = 6;
// 땅에서 모으는 정면 6컷 (카카시 치도리). fps 는 surgeChargeMs 에서 역산
const PUYO_CHARGE_FRAMES = 6;
// 제자리 한 바퀴 6컷 (네지 회천)
const PUYO_SPIN_FRAMES = 6;

const PUYO_FRAME = 128;

/**
 * 프레임 안에서 뿌요의 **발바닥**이 있는 세로 위치 (프레임 높이 대비).
 * `scripts/build-puyo-sheet.py` 가 바닥선 y=118 로 하단 정렬해 굽는다 — 원점을 여기 두어야
 * 동작이 바뀌어도(웅크림·도약) 발이 바닥선에서 안 뜬다.
 */
const FOOT_ORIGIN_Y = 118 / PUYO_FRAME;

const DEPTH_PUYO = 6;

/**
 * 시카마루 그림자 가닥을 그릴 때 쓰는 **재사용 버퍼.** 가닥 수가 화면의 똥 수만큼이라
 * 가닥마다 매 프레임 배열을 새로 만들면 할당이 똥 수에 비례해 GC 를 부른다 (Codex 리뷰).
 * 한 프레임 안에서 가닥을 하나씩 그리므로 전역 한 벌로 충분하다
 */
const BIND_N = 24;
const bindCx = new Float64Array(BIND_N + 1);
const bindCy = new Float64Array(BIND_N + 1);
const bindCl = new Float64Array(BIND_N + 1);
const bindPts: { x: number; y: number }[] = [];
const bindBands: { x: number; y: number }[][] = [[], [], []];
/** 버퍼의 n 번째 점을 채우고 다음 칸 번호를 돌려준다 (가닥마다 클로저를 만들지 않으려고 밖에 둔다) */
function bindPut(n: number, x: number, y: number): number {
  let o = bindPts[n];
  if (!o) { o = { x: 0, y: 0 }; bindPts[n] = o; }
  o.x = x; o.y = y;
  return n + 1;
}      // 배경 위 · 플레이어 뒤. 태이와 같은 대역

/**
 * 시트 파일명의 `_WxH` 에서 **칸 가로세로비**를 읽는다.
 *
 * 조립기가 모든 시트에 같은 배율을 쓰고 가로가 긴 자세는 칸을 넓히므로,
 * 표시할 때 그 비율을 그대로 써야 개 크기가 동작마다 안 널뛴다.
 * 정사각으로 띄우면 늘어난 자세가 세로로 찌그러진다.
 */
const SHEET_REF = 128;   // 기준 칸. 이보다 큰 칸은 그만큼 크게 띄운다

/**
 * 시트 파일명의 `_WxH` 에서 **기준 칸(128) 대비 배율**을 읽는다.
 *
 * 조립기는 모든 시트의 **몸통 두께**를 맞추고, 자세가 크면 칸을 넓히거나 높인다.
 * 그러니 표시할 때도 칸 크기를 그대로 반영해야 개가 같은 크기로 보인다 —
 * 정사각으로 고정하면 늘어난 자세일수록 개가 작아진다 (실제로 그렇게 나왔다).
 */
function sheetScale(file: string): { w: number; h: number } {
  const m = /_(\d+)x(\d+)\.png$/.exec(file);
  if (!m) return { w: 1, h: 1 };
  return { w: Number(m[1]) / SHEET_REF, h: Number(m[2]) / SHEET_REF };
}

const SHEET_OF = {
  walk: 'walk', idle: 'idle', crouch: 'crouch',
  // 기본 발동 = **아랑아** (몸을 말아 옆으로 고속 회전하며 돌진). 오르기·벽 튕김·내리꽂기
  // 셋 다 회전 시트다 — 예전엔 도약·벽 짚기·날라차기 그림이었다 (사람 지시)
  jump: 'tsuga', wall: 'tsuga', kick: 'tsuga',
  // 인 맺기는 기본 뿌요 전용 — 캐릭터에겐 이 키가 없어서 sheetFor 가 기본으로 떨어진다.
  // 떨어질 때는 도약 3컷(몸을 편 자세)이 맞다
  // 변신 때 가운데로 **솟구치고**(soar) 능력 뒤 **내리꽂힌다**(fall). 둘 다 고속 이동 시트 —
  // 등을 보이고 머리가 위인 그림을 가는 방향으로 돌린다. 옆모습 도약은 좌우 둘뿐이라
  // 수직에 가까운 궤적에서 옆으로 누워 떠오르는 것처럼 보였다 (사람 제안)
  soar: 'dash',
  seal: 'seal', fall: 'dash',
  // 비뢰신 — 던질 때는 던지기, 순간이동해 공중에 떠 있을 때는 도약 자세
  blinkThrow: 'throw', blinkAir: 'jump',
  // 비뢰신 나선환 — 바닥 가운데로 순간이동해 웅크려 나선환을 모았다 내려찍는다
  rasen: 'crouch',
  // 치도리 — 웅크려 모으고(3컷 끝에서 멈춘다), 솟구칠 때는 고속 이동 시트(머리가 위)
  chargeC: 'crouch', launch: 'dash',
  // 회천 — 캐릭터 `spin` 시트를 쓴다 (play 가 키를 바꾼다). 없으면 서 있는 그림
  byakugan: 'idle', kaiten: 'idle',
  // 팔괘 64장 — 낮은 자세로 장을 번갈아 내지른다 (네지 `hakke` 시트, 없으면 서 있는 그림)
  hakke: 'idle',
  // 만화경 — 캐릭터 `eye` 시트 (play 가 키를 바꾼다). 없으면 서 있는 그림
  mangekyo: 'idle',
  // 그림자 흉내 — 캐릭터 `bind` 시트
  bindSeal: 'idle',
  // 배가술 — 캐릭터 `inflate` 시트. 구르는 동안은 본체를 숨기고 공 스프라이트가 대신한다
  inflate: 'idle', roll: 'idle',
  // 삼중라생문 — 캐릭터 `gate` 시트
  gateSummon: 'idle',
  // 가마분타 소환 — 캐릭터 `summon` 시트. 두꺼비에 타 있는 동안 본체는 숨는다
  toadSummon: 'idle',
  // 그림자 분신술 — 인을 맺는 동안은 인 시트, 펑 한 뒤로 본체는 숨고 드릴들이 대신한다
  cloneJutsu: 'seal',
} as const satisfies Record<string, keyof typeof HEIDI_PUYO_SHEETS>;

/** 뿌요 상태. 이름 그대로 `HEIDI_PUYO_SHEETS` 의 키다 */
type PuyoState =
  | 'walk' | 'idle' | 'crouch' | 'jump' | 'wall' | 'kick'
  // ── 변신 (B안 개정) ──
  | 'seal'   // 화면 가운데 공중에서 인을 맺는다
  | 'soar'   // 화면 가운데로 솟구친다 (고속 이동 시트, 가는 방향으로 회전)
  | 'fall'   // 능력을 쓰고 땅으로 떨어진다 (같은 시트, 머리가 아래)
  // ── 미나토 고유: 비뢰신 ──
  | 'blinkThrow'  // 쿠나이를 던지는 중 (땅 또는 공중)
  | 'blinkAir'    // 순간이동해 쿠나이 자리에 떠 있다
  | 'rasen'       // 마지막 — 바닥 가운데에서 나선환을 모아 내려찍는다 (비뢰신 나선환)
  // ── 카카시 고유: 치도리 (땅 판본) ──
  | 'chargeC'     // 땅에서 웅크려 치도리를 모은다
  | 'launch'      // 땅을 박차고 위로 꿰뚫는다
  // ── 네지 고유: 회천 (땅 판본) ──
  | 'byakugan'    // 정면으로 멈춰 백안
  | 'kaiten'      // 제자리에서 돌며 차크라 구로 튕겨 낸다
  | 'hakke'       // 마무리 — 발밑 팔괘 진 · 2 · 4 · 8 · 16 · 32 · 64 장 연타
  // ── 이타치 고유: 아마테라스 (땅 판본) ──
  | 'mangekyo'    // 눈을 뜨고 망토를 펼쳐 까마귀를 푼다
  // ── 시카마루 고유: 그림자 흉내 (땅 판본) ──
  | 'bindSeal'    // 쥐 인을 맺고 그림자를 뻗어 묶는다 (인 → 뻗음 → 정적 → 조르기가 한 상태)
  // ── 쵸지 고유: 육탄전차 (땅 판본) ──
  | 'inflate'     // 부풀어 공이 된다
  | 'roll'        // 공이 되어 땅을 구른다 (본체는 숨고 공 스프라이트가 대신)
  // ── 오로치마루 고유: 삼중라생문 (땅 판본) ──
  | 'gateSummon'  // 땅에 손을 짚어 문 셋을 불러낸다 (문이 가라앉을 때까지 유지)
  // ── 지라이야 고유: 화둔·가마유탄 (땅 판본) ──
  | 'toadSummon'  // 두루마리 소환 → 가마분타 머리 위에서 불길 (본체는 숨고 두꺼비 그림이 대신)
  // ── 기본 뿌요 고유: 그림자 분신술 + 강화 아랑아 ──
  | 'cloneJutsu'; // 인 → 펑 → 드릴 여덟이 화면을 누빈다 (본체는 숨는다)

/**
 * 뿌요 **한 마리분** 상태.
 *
 * 옛 그림자 분신술(여러 마리 동시)을 위해 한 마리분을 묶었던 구조다. 분신술은 걷어냈고
 * 지금은 본체 한 마리뿐이지만, 상태가 많아 묶음 그대로 둔다.
 */
interface Puyo {
  ob: Phaser.GameObjects.Sprite;
  state: PuyoState;
  dir: number;                 // 배회 방향 (-1 왼쪽 / +1 오른쪽)
  flip: boolean;               // 지금 뒤집혀 있는가 (경계에서 깜빡이지 않게 기억한다)
  stateUntil: number;          // 이 시각(scene.time.now)까지 현재 상태를 유지한다
  wallRight: boolean;          // 이번에 짚는 쪽이 오른쪽 벽인가
  wallX: number;               // 짚는 자리의 x (화면 폭이 바뀌어도 매 프레임 다시 잡는다)
  jumpT0: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  prev: { x: number; y: number };  // 지난 프레임 좌표 — 터널링 방지용 선분 판정에 쓴다
  /** 기준 표시 크기(px). 상태마다 배율이 달라도 여기서 다시 계산한다 */
  size: number;

  /** 입은 캐릭터. 본체는 없음(기본 뿌요) */
  char?: string;
  /**
   * 기술 진행용 칸 셋 — 여덟 기술이 각자 단계 시각·카운터로 빌려 쓴다
   * (예: 치도리 모은 시각, 회천 방향 전환 횟수). 기술이 시작할 때 비운다
   */
  throwAt?: number;
  chainI?: number;
  cutT0?: number;
  /** 마무리에서 **혼자 남은** 한 마리인가 */
  finisher?: boolean;
  /** 대표 기술이 이미 터졌는가 (절정 프레임에서 한 번만) */
  finFired?: boolean;
  /** 컷신에 얹은 회전하는 날. 컷신이 끝나면 회수한다 */
  disc?: Phaser.GameObjects.Image;
  /** 비뢰신 나선환 — 손에 쥔 나선환 (모으는 동안만) · 내려찍은 폭발 */
  rasenOrb?: Phaser.GameObjects.Sprite;
  rasenBlast?: Phaser.GameObjects.Sprite;
  /** 내려찍을 때 화면 끝까지 퍼지는 **푸른 파동** 고리 (매 프레임 그린다) · 지금 반경 */
  rasenWave?: Phaser.GameObjects.Graphics;
  rasenWaveR?: number;
  /** 치도리 모으기 동안 남은 전기 지짐 수 */
  zapLeft?: number;
  /** 카카시 — 몇 번째 치도리를 쏠 차례인가 (0부터) · 장전하는 발 자리(없으면 땅) · 이번 장전 길이 */
  surgeN?: number;
  surgeFoot?: { x: number; y: number };
  /** 이번 치도리에서 이미 들른 자리 (출발점 포함) — 다음 돌진은 여기서 먼 곳으로 */
  surgeSeen?: { x: number; y: number }[];
  surgeChargeMs?: number;
  /** 네지 회천의 차크라 구 (루프 시트). 원반과 같이 회수한다 */
  dome?: Phaser.GameObjects.Image;
  /** 카카시 치도리 — 앞발에 쥔 번개 구 (지직대는 루프 시트). 원반과 같이 회수한다 */
  chidori?: Phaser.GameObjects.Image;
  /**
   * 변신해서 기술을 쓰는 중인가. 기술이 끝나면 기본 뿌요로 돌아온다
   */
  summon?: boolean;
  /** 이 마무리의 형(型). 시작할 때 한 번 정하고 프레임마다 다시 안 뽑는다 */
  form?: CloneFinForm;
  /**
   * 비뢰신(미나토 고유). 착지 후 걷다가 `blinkAt` 에 시작한다 (-1 = 착지하면 잡는다).
   * `n` = 지금 몇 번째 도약, `t0` = 이번 주기의 시작, `k` = 날아가는 쿠나이
   */
  blinkAt?: number;
  blink?: {
    n: number; t0: number;
    fx: number; fy: number; tx: number; ty: number;
    /** 이번 발의 비행 시간. 벽까지 거리에 비례한다 */
    flyMs: number;
    k?: Phaser.GameObjects.Image;
    jumped: boolean;
    /** 고속 이동이 끝나 도착점에 몸이 나타났는가 */
    arrived?: boolean;
    /** 이번 비뢰신에서 **이미 들른 자리** (출발점 포함) — 다음 쿠나이는 여기서 먼 곳으로 */
    seen: { x: number; y: number }[];
  };
}

/** 날아가는 무기 하나 */
interface Weapon {
  ob: Phaser.GameObjects.Sprite;
  /**
   * `bounce` = 회천에 튕겨 나간 **똥 자신**이다 (네지).
   * 원래 똥은 그룹에서 빼고 연출용으로 다시 띄운다 — 그룹에 둔 채 날리면
   * **내가 쓴 기술에 내가 맞아 죽는다.**
   */
  kind: 'bounce';
  vx: number;
  vy: number;
  grav: number;              // 아래로 처지는 가속도(px/s²). 0 이면 곧게 난다
  prev: { x: number; y: number };  // 선분 판정 — 프레임이 밀려도 똥을 안 뚫는다
  spin: number;
  dead?: boolean;
  /** `bounce` — 앞으로 몇 개를 더 칠 수 있나 (관통 상한) */
  pierce?: number;
}

/**
 * 하이디 (SR) — 동반자 강아지 **뿌요**.
 *
 * 뿌요가 땅에서 혼자 좌우로 돌아다니다가, {@link HEIDI_PARAMS.puyoInterval}점마다 번갈아 둘 중 하나를 쓴다.
 *
 *  ① **아랑아** — 회오리 드릴이 되어 먼 쪽 벽까지 일직선으로 돌진하고, 벽을 튕겨 반대편으로
 *     내리꽂힌다 (`crouch → jump → wall → kick`, 이름은 옛 도약 시절 그대로). 하강 구간은
 *     판정이 넓다({@link HEIDI_PARAMS.puyoKickHitR}).
 *  ② **변신** — 화면 가운데로 솟구쳐 인을 맺고 닌자 여덟 또는 뿌요 자신으로 변해 고유 기술을
 *     쓴다 (첫 변신은 뿌요 고정 — 그림자 분신술). 설계는 `docs/fx-heidi-clone.md`.
 *
 * 설계 문서는 `docs/fx-heidi-puyo.md`. 선례는 K 의 태이(동반자 배회)와
 * 레드의 참새(발사 시 시트 교체·진행 방향 판단)다.
 */
/** 기폭찰 폭발 재생 칸 — 0·1칸(방사 스파이크 섬광)을 뺀다 */
const TAGBLAST_FRAMES = [2, 3, 4, 5, 6, 7] as const;
/** 나선환 폭발 재생 칸 — 1칸(부채꼴로 뻗는 섬광)을 뺀다. 0칸은 둥근 섬광이라 남긴다 */
const RASENBLAST_FRAMES = [0, 2, 3, 4, 5, 6, 7] as const;

export class HeidiAbility extends BaseAbility {
  private dead = false;
  private tracked = new Set<Phaser.GameObjects.GameObject>();

  /** 살아 있는 뿌요 전부 (지금은 본체 하나) */
  private puyos: Puyo[] = [];
  /** 본체. 배회·발동 판단은 이 녀석만 한다 */
  private main?: Puyo;
  private groundY = 0;

  /** 날아다니는 무기 전부 */
  private weapons: Weapon[] = [];
  /** 몇 번째 발동인가. {@link HEIDI_PARAMS.summonEvery} 로 나눠 변신 차례를 정한다 */
  private fireCount = 0;

  /**
   * **컷인** — 어센트류의 "화면을 통째로 쓰는" 연출.
   *
   * 세 겹이다: 암전 · 띠 위아래 검은 테 · 일러스트.
   * 셋을 따로 들고 있어야 각각 다른 타이밍으로 들어오고 나갈 수 있다.
   */
  /**
   * 컷인 동안 멈춰 둔 똥 그룹. 풀 때 **다시 훑어야** 하므로 들고 있는다.
   *
   * 물리 자체를 멈추면 안티치트에 걸린다 (GameScene [레이어 4]가
   * `physics.world.isPaused` 를 치트로 본다).
   */
  private frozen?: Phaser.Physics.Arcade.Group[];

  /**
   * 네지 회천이 이번 마무리에 **앞으로 더 없앨 수 있는 개수.**
   *
   * 총알은 마무리가 끝난 뒤에도 날아가므로 뿌요가 아니라 능력이 들고 있어야 한다.
   * 없으면 직접 8 + 총알 8 x 관통 3 = 최대 32 개가 날아가 한 판이 끝난다
   * (문서: "대표 기술이 한 판을 끝내면 안 된다").
   */
  private deflectLeft = 0;

  /** 본체가 변신 중인가 (도약 → 인 → 변신 → 능력 → 착지) */
  private transforming = false;
  /** 이번 판에 변신을 몇 번 했나 — **첫 변신은 기본 뿌요로 고정**한다 */
  private transformCount = 0;

  /**
   * 비뢰신 고속 이동의 **섬광 잔상.** 뿌요 상태와 따로 돈다 — 마지막 발 뒤에 뿌요가
   * 떨어지기 시작해도 잔상은 끝까지 걷혀야 한다
   */
  /** 이타치 까마귀 — 각자 똥 하나를 쫓아가 부딪히면 검은 불을 붙인다 */
  private crows: {
    ob: Phaser.GameObjects.Sprite; vx: number; vy: number; t0: number;
    q?: Phaser.Physics.Arcade.Sprite; tx: number; ty: number;
  }[] = [];

  /** 아마테라스 불기둥 — 제자리에서 4초 타며 닿는 똥을 태운다 */
  private fires: { flame: Phaser.GameObjects.Sprite; t0: number; x: number; y: number }[] = [];
  /** 이번 아마테라스로 더 태울 수 있는 개수 */
  private fireLeft = 0;

  /**
   * 시카마루 그림자 가닥. 발밑에서 땅을 타고 목표 똥의 x 까지 간 뒤 위로 꺾여 똥을 잡는다.
   * 잡힌 똥은 즉시 조용히 회수하고(닿아도 안 죽는다) 그 자리에 멈춘 잔상(ghost)을 둔다
   */
  private binds: {
    g: Phaser.GameObjects.Graphics; t0: number;
    q?: Phaser.Physics.Arcade.Sprite; ghost?: Phaser.GameObjects.Image;
    tx: number; ty: number; sx: number; sy: number;
    /** 잡은 순간의 잔상 표시 크기 — 조르기는 여기서 매번 다시 계산한다 (누적하면 줄어든다) */
    gw: number; gh: number;
    /** 물결 위상 (가닥마다 달라야 한 몸처럼 같이 흔들리지 않는다) */
    ph: number;
    /** 발밑 그림자 웅덩이의 가로 반지름 — 가닥은 웅덩이 **가장자리**에서 나온다 */
    pr: number;
  }[] = [];
  /** 발밑 그림자 웅덩이 */
  private bindPool?: Phaser.GameObjects.Graphics;
  /** 마지막 가닥이 닿는 시각 (인 시작 기준 ms). 가닥 수에 따라 달라서 뻗을 때 정한다 */
  private bindReachEnd = 0;
  /**
   * 시카마루 마무리 — **그림자 꿰매기 + 기폭찰.** 조르기 뒤 그림자가 바닥 전체로 번지고,
   * 바닥에서 그림자 바늘이 솟아 남은 똥을 꿰뚫으며 그 자리에 기폭찰을 붙인다.
   * 그림자가 걷히면 기폭찰이 타들어 가 가까운 것부터 연쇄로 터진다.
   * 바늘은 그래픽스 하나에 삼각형으로 그린다
   */
  private nui?: {
    t0: number; g: Phaser.GameObjects.Graphics; picked: boolean; hits: number;
    spikes: {
      bx: number; t0: number; q?: Phaser.Physics.Arcade.Sprite;
      tx: number; ty: number; hit: boolean;
    }[];
    /** 붙은 기폭찰. t0 = 타기 시작한 시각 (그림자가 걷힐 때 정한다), blast = 터진 뒤 폭발 */
    tags: { ob: Phaser.GameObjects.Image; x: number; y: number; t0: number; blast?: Phaser.GameObjects.Sprite; done: boolean }[];
    lit: boolean;
  };

  /**
   * 쵸지 육탄전차의 공. 본체(p.ob)는 숨기고 이것이 **화면 여기저기를 튕겨 다닌다** —
   * 벽·천장·바닥에서 반사되며 rollMs 동안. 회전은 매우 빠르게, 진행 방향 쪽으로
   */
  /**
   * 오로치마루 삼중라생문의 문 셋. 땅선 아래는 **마스크로 가려** 땅에서 솟는 것처럼 보인다.
   * `x0~x1` 가 그 문이 지키는 가로 구간, 윗면(`top`)이 막는 선이다
   */
  /**
   * 이타치 **스사노오** — 아마테라스가 끝나기 직전 이타치 뒤에서 솟아 토츠카 검을 **아래에서 위로**
   * 올려 벤다. 베는 순간 칼끝에서 **검기**(swordWaves)가 대각선 위로 날아간다
   */
  private susanoo?: {
    ob: Phaser.GameObjects.Sprite; t0: number; slashed: boolean; flip: boolean;
  };
  /** 까마귀를 풀었고 아직 스사노오가 안 솟았다 — 아마테라스가 끝나기 직전에 솟는다 */
  private susanooPending = false;
  /** 스사노오가 날린 검기 — 화면 밖으로 나갈 때까지 날며 경로의 똥을 벤다 */
  private swordWaves: {
    ob: Phaser.GameObjects.Sprite; vx: number; vy: number; prev: { x: number; y: number };
  }[] = [];

  private gates: {
    ob: Phaser.GameObjects.Image; x0: number; x1: number; t0: number; landed: boolean;
    /** 0 빨강 · 1 초록 · 2 파랑 — 시트에서 이 문의 컷은 kind * GATE_FRAMES 부터 */
    kind: number;
    shattered?: boolean;
  }[] = [];
  private gateMask?: Phaser.GameObjects.Graphics;

  /** 지라이야 가마분타와 불길. t0 = 떨어지기 시작한 시각 */
  private toad?: {
    ob: Phaser.GameObjects.Image;
    /** 기름 두 줄기 · 불 두 줄기 · 지라이야의 불 한 줄기 */
    oils: Phaser.GameObjects.Sprite[]; fires: Phaser.GameObjects.Sprite[];
    t0: number; x: number; landed: boolean; ignited: boolean;
    /** 기준 표시 폭 — 나타날 때 크기를 매 프레임 바꾸므로 displayWidth 를 기준으로 쓰면 안 된다 */
    w: number;
  };

  private ball?: {
    ob: Phaser.GameObjects.Sprite; vx: number; vy: number; t0: number;
    trailAt: number; spin: number;
    /** 잔상 — 반투명하게 남았다 rollTrailFadeMs 안에 사라진다 */
    trail: { ob: Phaser.GameObjects.Image; t0: number }[];
    /** 마무리 — 초배가 내려찍기. 시작 시각 · 출발 자리 · 착지했는가 · 충격파 · 지금까지 넓힌 폭 */
    slam?: {
      t0: number; fx: number; fy: number; landed: boolean;
      wave?: Phaser.GameObjects.Sprite; reach: number;
    };
  };

  /**
   * 아마테라스로 타는 똥. 원래 똥은 불이 붙는 순간 **조용히 회수**한다 (닿아도 안 죽는다) —
   * 타는 모습은 그 자리의 잔상(ghost)과 불(flame)이 맡는다
   */
  private burns: {
    ghost: Phaser.GameObjects.Image; flame?: Phaser.GameObjects.Sprite;
    t0: number; sx: number; sy: number;
  }[] = [];

  /** 치도리 모으기의 **전기 지짐** — 번개 가닥과 타 들어가는 똥 잔상 */
  private zaps: {
    g: Phaser.GameObjects.Graphics; ghost?: Phaser.GameObjects.Image;
    t0: number; sx: number; sy: number;
  }[] = [];

  /**
   * 그림자 분신술의 **드릴들.** 뿌요 상태와 따로 돈다 (본체는 숨어 있다).
   * `at` = 출발 시각 (엇갈려 나간다), `hits` = 튕긴 횟수
   */
  private drills: {
    ob: Phaser.GameObjects.Image; vx: number; vy: number; at: number;
    hits: number; prev: { x: number; y: number }; out: boolean;
    /** 아직 강아지 모습으로 자세를 잡고 있는가 (at 에 드릴로 바뀌어 튀어나간다) */
    posing: boolean;
    /** 펑 하고 나타나는 시각 (마리마다 어긋난다) · 자세 기준 크기 */
    appear: number; size: number;
  }[] = [];
  /** 이번 분신술이 앞으로 더 지울 수 있는 개수 (cloneTotal 에서 깎는다) */
  private cloneLeft = 0;

  /** 아랑아 잔상 — 도는 공 그림을 반투명하게 남겼다 금방 지운다 */
  private tsugaTrail: { ob: Phaser.GameObjects.Image; t0: number }[] = [];
  private tsugaTrailAt = 0;

  private trails: {
    glow: Phaser.GameObjects.Image; core: Phaser.GameObjects.Image;
    t0: number; len: number; glowH: number; coreH: number;
    /** 선분 — 떠 있는 동안 이 위의 똥을 계속 지운다 (r = 판정 반경, pts = 개당 점수) */
    sx: number; sy: number; ang: number; r: number; pts: number;
  }[] = [];

  /**
   * **만화 칸 컷인** — 왼쪽 위 작은 칸 하나. 그림 · 칸 모양 마스크 · 테두리 세 겹이
   * 같은 자리(x, y = 칸 왼쪽 위)에서 같이 움직인다. 칸 모양은 시작할 때 한 번 뽑는다
   */
  private cutin?: {
    t0: number;
    img: Phaser.GameObjects.Image;
    border: Phaser.GameObjects.Graphics;
    maskG: Phaser.GameObjects.Graphics;
    x: number; y: number; pw: number;
    /** 그림의 칸 안 자리 (칸 왼쪽 위 기준) */
    ix: number; iy: number;
    ms: number;
    inMs: number;
    outMs: number;
  };


  /** 발동 판단 — 개별 뿌요가 아니라 **능력 전체**의 상태다 */
  private lastWallRight?: boolean;  // 지난번에 짚은 쪽. 없으면 아직 한 번도 안 뛰었다
  private pending = false;       // 점수는 찼는데 **거리가 모자라** 아직 안 뛴 상태

  /** 같은 점수로 두 번 발동하지 않게 하는 기준선 */
  private lastFireScore = 0;

  // ── 생성 · 정리 ───────────────────────────────────────────────────
  override onCreate(api: GameSceneAPI): void {
    const { scene, player } = api;
    this.dead = false;
    this.transformCount = 0;
    // **판마다 처음부터 기본 뿌요로 시작한다.** 능력 객체는 씬을 다시 시작해도
    // 살아 있으므로, 안 지우면 지난 판에 남은 캐릭터가 다음 판까지 따라온다
    // (CLAUDE.md 의 1번 불변 규칙 — 재시작 시 상태 변수 초기화)
    this.cutin = undefined;
    this.frozen = undefined;   // 지난 판 기록이 남으면 엉뚱한 그룹을 건드린다
    this.deflectLeft = 0;
    this.transforming = false;
    this.registerAnims(scene);

    const key = fxPickSheetKey(HEIDI_PUYO_SHEETS.walk);
    if (!scene.textures.exists(key)) return;   // 시트가 안 올라왔으면 조용히 없던 일로

    this.groundY = player.y + player.displayHeight / 2;
    this.main = this.spawn(api, scene.scale.width / 2, this.groundY);
    if (this.main) this.play(this.main, 'walk');
  }

  /**
   * 뿌요 한 마리를 띄운다. 본체도 분신도 같은 길로 만든다.
   *
   * **텍스처는 한 장을 공유한다** — 개를 여럿 띄워도 VRAM 은 안 는다.
   */
  private spawn(api: GameSceneAPI, x: number, y: number): Puyo | undefined {
    const { scene, player } = api;
    const key = fxPickSheetKey(HEIDI_PUYO_SHEETS.walk);
    if (!scene.textures.exists(key)) return undefined;
    const h = player.displayHeight * HEIDI_PARAMS.puyoScale;
    const ob = scene.add.sprite(x, y, key)
      .setDepth(DEPTH_PUYO)
      .setOrigin(0.5, FOOT_ORIGIN_Y)          // 발이 바닥선에 꽂힌다
      .setDisplaySize(h, h);
    this.track(ob);
    const p: Puyo = {
      ob, state: 'walk', dir: -1, flip: false, stateUntil: 0,
      wallRight: false, wallX: 0, jumpT0: 0,
      from: { x, y }, to: { x, y }, prev: { x, y }, size: h,
    };
    this.puyos.push(p);
    return p;
  }

  /**
   * 추적 목록에 넣고 **누가 파괴하든** 목록에서 빠지게 한다.
   * (레드에서 보험 타이머가 먼저 파괴한 오브젝트가 목록에 남아 샜다 — 같은 실수를 막는다)
   */
  private track<T extends Phaser.GameObjects.GameObject>(ob: T): T {
    this.tracked.add(ob);
    ob.once(Phaser.GameObjects.Events.DESTROY, () => this.tracked.delete(ob));
    return ob;
  }

  override onDestroy(_api: GameSceneAPI): void {
    this.dead = true;
    for (const ob of this.tracked) ob.destroy();
    this.tracked.clear();
    this.puyos = [];
    this.weapons = [];
    this.main = undefined;
    this.transforming = false;
    this.trails = [];   // 오브젝트는 tracked 가 이미 부쉈다
    this.tsugaTrail = [];
    this.zaps = [];
    this.crows = [];
    this.burns = [];
    this.fires = [];
    this.binds = [];
    this.bindPool = undefined;   // 오브젝트는 tracked 가 이미 부쉈다
    this.nui = undefined;
    this.ball = undefined;
    this.gates = [];
    this.susanoo = undefined;
    this.susanooPending = false;
    this.swordWaves = [];
    this.gateMask = undefined;
    this.toad = undefined;
    this.drills = [];
    this.thawPoops();   // 컷인 도중에 게임 오버가 나도 똥이 멈춘 채로 안 남는다
    this.cutin = undefined;   // 오브젝트는 tracked 가 이미 부쉈다
  }

  /**
   * 컷인이 떠 있는 동안은 **똥이 안 내려오고 맞아도 안 죽는다.**
   *
   * 히트스톱(`time.timeScale = 0`)으로 멈추지 않는다 — 그러면 `scene.time.now` 가
   * 서고 컷신 자신의 타이밍까지 얼어붙는다. 스폰 차단 + 무적이 같은 효과를 내면서
   * 시간은 계속 간다.
   */
  override isSpawnBlocked(): boolean { return !!this.cutin && HEIDI_PARAMS.cutinFreeze; }
  // 컷인 중 무적은 없앴다 — 칸이 화면 왼쪽 위만 가려서 똥이 다 보인다 (만화 칸 판본)

  // ── 매 프레임 ─────────────────────────────────────────────────────
  override onUpdate(api: GameSceneAPI): void {
    if (this.dead) return;
    const { scene, player } = api;
    const now = scene.time.now;
    this.groundY = player.y + player.displayHeight / 2;

    for (const p of this.puyos) {
      if (!p.ob.active) continue;
      this.stepPuyo(api, p, now);
    }
    if (this.weapons.length > 0) this.stepWeapons(api);
    // 컷인은 **기술 단계와 따로** 시간을 센다 — 기술이 컷인보다 먼저 끝나 걷기로 넘어가면
    // 아무도 컷인을 안 넘겨서 화면에 영영 남았다 (이타치 만화경이 컷인 1.2초보다 짧다)
    if (this.cutin) this.stepCutin(scene, now);
    if (this.trails.length > 0) this.stepTrails(api, now);
    if (this.tsugaTrail.length > 0) this.stepTsugaTrail(now);
    if (this.zaps.length > 0) this.stepZaps(now);
    if (this.crows.length > 0) this.stepCrows(api, now);
    if (this.burns.length > 0) this.stepBurns(now);
    if (this.fires.length > 0) this.stepFires(api, now);
    // 스사노오는 **아마테라스가 끝나기 susanooBeforeEndMs 전**에 솟는다 (사람 판정: "너무 빨리 나온다").
    // 까마귀가 다 불을 붙인 뒤(더 생길 불이 없을 때), 가장 늦게 꺼지는 불기둥을 기준으로 잰다
    if (this.susanooPending && this.crows.length === 0) {
      const P = HEIDI_PARAMS;
      const end = this.fires.reduce((m, f) => Math.max(m, f.t0 + P.igniteFireMs), 0);
      if (this.fires.length === 0 || end - now <= P.susanooBeforeEndMs) {
        this.susanooPending = false;
        if (this.main?.ob.active) this.startSusanoo(api, this.main, now);
      }
    }
    if (this.susanoo) this.stepSusanoo(api, now);
    if (this.swordWaves.length > 0) this.stepSwordWaves(api);
    // 파괴된 놈을 걷어낸다
    if (this.puyos.some(p => !p.ob.active)) {
      this.puyos = this.puyos.filter(p => p.ob.active);
      if (this.main && !this.main.ob.active) this.main = undefined;
    }
  }

  /** 뿌요 한 마리의 한 프레임 */
  private stepPuyo(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const puyo = p.ob;

    if (p.state === 'soar')  { this.stepRise(api, p, now); return; }
    if (p.state === 'seal')  { this.stepSeal(api, p, now);  return; }
    if (p.state === 'fall')  { this.stepFall(api, p, now);  return; }
    if (p.state === 'blinkThrow' || p.state === 'blinkAir') { this.stepBlink(api, p, now); return; }
    if (p.state === 'rasen') { this.stepRasen(api, p, now); return; }
    if (p.state === 'chargeC') { this.stepCharge(api, p, now); return; }
    if (p.state === 'launch')  { this.stepLaunch(api, p, now); return; }
    if (p.state === 'byakugan' || p.state === 'kaiten') { this.stepKaiten(api, p, now); return; }
    if (p.state === 'hakke') { this.stepHakke(api, p, now); return; }
    if (p.state === 'mangekyo') { this.stepMangekyo(api, p, now); return; }
    if (p.state === 'bindSeal') { this.stepBind(api, p, now); return; }
    if (p.state === 'inflate' || p.state === 'roll') { this.stepRoll(api, p, now); return; }
    if (p.state === 'gateSummon') { this.stepGate(api, p, now); return; }
    if (p.state === 'toadSummon') { this.stepToad(api, p, now); return; }
    if (p.state === 'cloneJutsu') { this.stepClone(api, p, now); return; }
    if (p.state === 'jump' || p.state === 'kick') { this.stepJump(api, p, now); return; }

    // 벽에 붙어 있는 동안 — 접촉 → 웅크림 → 차기의 3컷이 여기서 돈다.
    // 바닥선이 매 프레임 바뀌므로 자리를 다시 잡아 준다 (땅에 내려놓지 않는다)
    if (p.state === 'wall') {
      this.spinTsuga(api, p, now);
      puyo.setPosition(p.wallX, this.groundY - scene.scale.height * HEIDI_PARAMS.puyoWallH);
      if (now >= p.stateUntil) this.startKick(api, p, now);
      return;
    }

    // 웅크림 → 점프. 예비 동작이 있어야 도약이 무겁게 읽힌다
    if (p.state === 'crouch') {
      if (now >= p.stateUntil) {
        // 번갈아 쓴다 — summonEvery 번째 발동은 변신, 나머지는 평소 도약·날라차기.
        // **첫 발동부터 변신이다** (60 · 180 · 300 …). fireCount 는 여기 오기 전에
        // 이미 1 이 되어 있다 — `% 2 === 0` 으로 두면 첫 변신이 120점에야 나왔다
        if ((this.fireCount - 1) % HEIDI_PARAMS.summonEvery === 0 && !this.transforming) {
          this.startTransform(api, p, now);
        } else this.startJump(api, p, now);
      }
      puyo.y = this.groundY;
      return;
    }
    if (p.state === 'idle') {
      puyo.y = this.groundY;
      // 뛸 차례인데 멈춰 서 있으면 대기가 길어진다 — 바로 걷기로 돌아간다
      if ((this.pending && p === this.main) || now >= p.stateUntil) this.play(p, 'walk');
      return;
    }

    // 비뢰신 예약 — 착지 후 조금 걷다가 쿠나이를 던진다
    // (`blinkAt` 은 땅에서 쓰는 능력 공용 예약이다 — 미나토 비뢰신 · 카카시 치도리)
    if (p.blinkAt !== undefined && p.blinkAt >= 0 && now >= p.blinkAt) {
      if (p.form === 'surge') this.startCharge(api, p, now);
      else if (p.form === 'deflect') this.startKaiten(api, p, now);
      else if (p.form === 'ignite') this.startMangekyo(api, p, now);
      else if (p.form === 'bind') this.startBind(api, p, now);
      else if (p.form === 'roll') this.startInflate(api, p, now);
      else if (p.form === 'gate') this.startGate(api, p, now);
      else if (p.form === 'toad') this.startToad(api, p, now);
      else if (p.form === 'clone') this.startClone(api, p, now);
      else this.startBlink(api, p, now);
      return;
    }

    // 배회 — 화면 가장자리(여백 안쪽)에 닿으면 방향을 반전하고 가끔 멈춰 선다
    const W = scene.scale.width;
    const isMain = p === this.main;

    // 뛸 차례인데 목표 벽이 코앞이면 **반대쪽으로 물러선다.** 가만히 배회하게 두면
    // 하필 벽 쪽으로 걸어가다 되짚어 오느라 대기가 두 배로 길어진다.
    // 물러섰다 달려가 뛰는 모양이 되어 도약도 무거워진다
    if (isMain && this.pending && !this.runwayOk(W, puyo.x, puyo.displayWidth / 2)) {
      p.dir = this.nextWallRight(W, puyo.x) ? -1 : 1;
    }

    const dt = scene.game.loop.delta / 1000;
    const half = puyo.displayWidth / 2;
    const minX = HEIDI_PARAMS.puyoMargin + half;
    const maxX = W - HEIDI_PARAMS.puyoMargin - half;
    const step = HEIDI_PARAMS.puyoSpeed * dt * p.dir;
    // 화면 밖에서 걸어 들어오는 중이면 아직 가두지 않는다 (들어올 때까지 자유롭게)
    const entering = puyo.x < minX ? p.dir > 0 : (puyo.x > maxX ? p.dir < 0 : false);
    puyo.x = entering ? puyo.x + step : Phaser.Math.Clamp(puyo.x + step, minX, maxX);
    puyo.y = this.groundY;

    if (!entering && ((puyo.x <= minX && p.dir < 0) || (puyo.x >= maxX && p.dir > 0))) {
      p.dir = -p.dir;
      // 뛸 차례면 멈춰 서지 않는다
      if (!(isMain && this.pending) && Math.random() < HEIDI_PARAMS.puyoIdleChance) {
        this.play(p, 'idle', now + HEIDI_PARAMS.puyoIdleMs);
      }
    }
    // **가는 방향**으로 뒤집는다 (있는 자리가 아니라 — 참새에서 겪은 것과 같다).
    // 방향 전환점에서는 속도가 0 을 지나므로 데드존 안에서는 직전 방향을 유지한다
    if (Math.abs(step) > HEIDI_PARAMS.puyoFlipDead) p.flip = p.dir > 0;
    puyo.setFlipX(p.flip);

    // 점수가 찼으면 **목표 벽이 충분히 멀어질 때까지 걷다가** 웅크린다
    // 비뢰신이 예약돼 있으면 **다음 발동은 그 뒤로 미룬다** (겹치면 공중에서 웅크린다)
    if (isMain && this.pending && p.blinkAt === undefined && this.runwayOk(W, puyo.x, half)) {
      this.pending = false;
      // **발동 수는 여기서 센다.** 마일스톤에서 세면 안 된다 — 점수가 찬 뒤 도약
      // 지점까지 걸어가는 1초 사이에 다음 마일스톤이 들어오면 발동은 하나인데
      // 카운터만 두 번 올라간다. 난도가 올라 초당 점수가 커질수록 자주 벌어지고,
      // 그렇게 건너뛴 배수만큼 **변신이 통째로 증발한다**
      // (실측: 초당 90점에서 실제 발동 19회에 fireCount 가 29 까지 갔다).
      this.fireCount++;
      this.play(p, 'crouch', now + HEIDI_PARAMS.puyoCrouchMs);
    }
  }

  /**
   * 이번에 짚을 벽이 **충분히 먼가.**
   *
   * 번갈아 짚게 하고 나니, 날라차기가 내려놓은 자리 바로 옆이 다음 목표가 되는 판이
   * 생겼다 — 코앞으로 폴짝 뛰고 끝나서 경로에 똥이 거의 없다. 똥을 쓸어내는 것이
   * 이 능력의 본체이므로, 거리가 찰 때까지 **발동을 미룬다.**
   * 뿌요는 좌우 끝에서 방향을 되짚으므로 한 번 가로지르는 사이에 반드시 충족된다.
   */
  private runwayOk(W: number, x: number, half: number): boolean {
    const toRight = this.nextWallRight(W, x);
    const dist = toRight ? W - x : x;
    // **못 채우는 조건이면 영영 안 뛴다.** 뿌요는 배회 여백(puyoMargin) 안쪽까지만
    // 물러설 수 있으므로, 요구치를 그 한계 아래로 잘라 둔다.
    // 화면이 좁거나 여백이 커지면 W * puyoMinRunW 가 손 닿는 범위를 넘길 수 있다
    const reach = W - HEIDI_PARAMS.puyoMargin - half - 1;
    return dist >= Math.min(W * HEIDI_PARAMS.puyoMinRunW, reach);
  }

  /** 이번에 짚을 벽. 첫 발동만 먼 쪽이고, 그다음부터는 직전의 반대쪽이다 */
  private nextWallRight(W: number, x: number): boolean {
    if (this.lastWallRight !== undefined) return !this.lastWallRight;
    const dir = this.main?.dir ?? -1;
    return x === W - x ? dir > 0 : x < W - x;
  }

  // ── 발동 ──────────────────────────────────────────────────────────
  override onScoreMilestone(score: number, _api: GameSceneAPI): void {
    if (score % HEIDI_PARAMS.puyoInterval !== 0) return;
    // **자기 보너스로 들어온 마일스톤은 삼킨다** (레드·테드와 같은 규칙). 기술이 끝나
    // 걷는 동안에도 까마귀·불기둥 같은 기술 잔여물이 점수를 준다 — 이 줄이 없으면 그 점수가
    // 다음 발동을 예약했다 (Codex 리뷰)
    if (this.awarding) return;
    if (score <= this.lastFireScore) return;    // 재진입 가드
    this.lastFireScore = score;
    const main = this.main;
    if (this.dead || !main || !main.ob.active) return;
    // 이미 웅크렸거나 뛰고 있으면 삼킨다 — 한 번에 여러 마리로 갈라지면 안 된다
    if (main.state !== 'walk' && main.state !== 'idle') return;
    if (this.pending) return;                   // 이미 예약돼 있다 — 두 번 세지 않는다
    // **바로 뛰지 않는다.** 목표 벽이 코앞이면 지나갈 똥이 없다 — 예약만 걸고,
    // 거리가 차는 순간 onUpdate 의 배회 갈래에서 웅크린다
    this.pending = true;
  }

  /**
   * ① 도약 시작 — **양쪽 벽을 번갈아** 짚는다.
   *
   * 처음 한 번만 "지금 자리에서 먼 쪽"으로 간다 (왼쪽까지 `puyo.x`, 오른쪽까지
   * `W - puyo.x` 중 긴 쪽 = `puyo.x < W / 2` 면 오른쪽). 그다음부터는 **직전에 짚은
   * 벽의 반대쪽**이다.
   *
   * 매번 먼 쪽을 고르면 **같은 벽에만 붙는다.** 날라차기가 벽 반대편 끝까지 날아가
   * 착지하므로, 착지 자리에서 먼 쪽은 언제나 **방금 찼던 그 벽**이다. 두 규칙이 서로를
   * 물어 한쪽으로 고정된다 — 실제로 그렇게 나왔고, 그래서 먼 쪽 규칙을 접었다.
   */
  private startJump(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const puyo = p.ob;

    const W = scene.scale.width;
    const toRight = this.nextWallRight(W, puyo.x);
    this.lastWallRight = toRight;
    // 짚는 자리 — 발바닥이 화면 끝에 닿아 보이도록 **스프라이트 바깥 끝**을 기준으로 잡는다.
    // 중심을 기준으로 잡으면 몸 절반만큼 안쪽에서 허공을 짚는다
    const half = puyo.displayWidth / 2;
    const m = HEIDI_PARAMS.puyoWallMargin;
    p.wallRight = toRight;
    p.wallX = toRight ? W - m - half : m + half;

    p.jumpT0 = now;
    p.flip = toRight;
    puyo.setFlipX(p.flip);
    this.play(p, 'jump');
    // 돌려야 하므로 원점을 몸 가운데로 (보이는 자리는 그대로). 착지할 때 발로 되돌린다
    this.centerOrigin(p, true);
    p.from = { x: puyo.x, y: puyo.y };
    p.to = { x: p.wallX, y: this.groundY - scene.scale.height * HEIDI_PARAMS.puyoWallH };
    p.prev = { x: p.from.x, y: p.from.y };

    burst(scene, puyo.x, this.groundY, 'smoke', {
      count: 6, scale: 0.55, speed: 0.7, depth: DEPTH_PUYO - 1, blend: 'normal',
    });
  }

  /**
   * ② 벽 짚기 — 궤적의 정점에서 한 번 멈춘다.
   *
   * 멈추는 구간이 있어야 되돌아 내려오는 발차기가 "튕겨 나왔다"로 읽힌다.
   * 시트가 안 올라왔으면 {@link play} 가 조용히 넘어가고, 자세만 유지한 채 시간을 센다.
   */
  private startCling(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const puyo = p.ob;
    puyo.setPosition(p.wallX, p.to.y);
    this.play(p, 'wall', now + HEIDI_PARAMS.puyoWallMs);
    // 벽을 **튕기는** 순간 — 먼지와 바람 조각은 벽 쪽에서 터져야 한다
    const wx = p.wallRight ? scene.scale.width : 0;
    burst(scene, wx, p.to.y, 'smoke', {
      count: 5, scale: 0.5, speed: 0.7, depth: DEPTH_PUYO - 1, blend: 'normal',
    });
    burst(scene, wx, p.to.y, 'streak', {
      count: 6, scale: 0.6, speed: 1.2, depth: DEPTH_PUYO + 1, blend: 'add', lifespan: 0.3,
    });
    impact(scene, { hitstop: 40, shake: { duration: 140, intensity: 0.004 } });
  }

  /**
   * ③ 날라차기 — 벽을 밀고 **반대편 바닥까지** 대각선으로 내려온다.
   *
   * 여기서부터 판정이 넓어지고 점수가 오른다 ({@link smashPoops} 가 상태를 보고 가른다).
   */
  private startKick(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const puyo = p.ob;
    const W = scene.scale.width;
    const half = puyo.displayWidth / 2;
    // 착지는 **짚은 벽에서 화면 폭의 puyoLandW 만큼** 간 자리다.
    // 반대쪽 끝까지 날아가 박히면 다음 대기 지점까지 한참을 걸어 돌아온다
    const landX = p.wallRight ? W * (1 - HEIDI_PARAMS.puyoLandW)
      : W * HEIDI_PARAMS.puyoLandW;
    p.from = { x: puyo.x, y: puyo.y };
    // 원점이 몸 가운데라 착지 자리도 몸 가운데 높이로 잡는다 (발은 바닥선에 닿는다)
    const off = puyo.displayHeight * (FOOT_ORIGIN_Y - 0.5);
    p.to = { x: Phaser.Math.Clamp(landX, half, W - half), y: this.groundY - off };
    p.prev = { x: p.from.x, y: p.from.y };
    p.jumpT0 = now;
    p.flip = !p.wallRight;          // 가는 방향(벽 반대쪽)을 본다
    puyo.setFlipX(p.flip);
    this.play(p, 'kick');
    impact(scene, { hitstop: 50, shake: { duration: 160, intensity: 0.005 } });
  }

  /**
   * **아랑아** 한 프레임 — 회오리 드릴의 끝을 **가는 방향으로 겨누고**, 지나간 자리에
   * 잔상을 남긴다. 도는 것은 시트(나선 띠 8컷)가 맡는다 — 방향이 있는 그림이라 스프라이트를
   * 통째로 돌리면 드릴이 뒤로 가는 순간이 생긴다. 벽을 튕기는 동안은 벽 반대쪽을 본다
   */
  private spinTsuga(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const ang = p.state === 'wall' ? (p.wallRight ? Math.PI : 0)
      : Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x);
    p.ob.setFlipX(false).setRotation(ang);
    if (now < this.tsugaTrailAt) return;
    this.tsugaTrailAt = now + P.tsugaTrailEvery;
    const ob = p.ob;
    const ghost = this.track(api.scene.add.image(ob.x, ob.y, ob.texture.key, ob.frame.name)
      .setDisplaySize(ob.displayWidth, ob.displayHeight).setRotation(ob.rotation)
      .setFlipX(ob.flipX).setDepth(DEPTH_PUYO - 1).setAlpha(P.tsugaTrailAlpha));
    this.tsugaTrail.push({ ob: ghost, t0: now });
  }

  private stepTsugaTrail(now: number): void {
    const P = HEIDI_PARAMS;
    for (const t of this.tsugaTrail) {
      const k = (now - t.t0) / P.tsugaTrailMs;
      if (k >= 1) this.discard(t.ob);
      else t.ob.setAlpha(P.tsugaTrailAlpha * (1 - k));
    }
    this.tsugaTrail = this.tsugaTrail.filter(t => t.ob.active);
  }

  /**
   * 도약·하강 한 프레임.
   *
   * 도약은 끝점이 이미 높으므로 **끝점까지 선형 + 중간 웃자람**으로 그린다.
   * 예전처럼 바닥 기준 포물선을 쓰면 벽에 닿는 높이를 맞출 수가 없다.
   * 하강은 `u²` 로 가속한다 — 차고 내려오는 동작은 끝이 빨라야 한다.
   */
  private stepJump(api: GameSceneAPI, p: Puyo, now: number): void {
    const puyo = p.ob;
    const { scene } = api;

    const rising = p.state === 'jump';
    const dur = rising ? HEIDI_PARAMS.puyoJumpMs : HEIDI_PARAMS.puyoKickMs;
    const u = Phaser.Math.Clamp((now - p.jumpT0) / dur, 0, 1);
    // **일직선 돌진** — 회오리가 곧게 꽂혀야 한다 (예전 도약은 위로 휜 아치였다).
    // 오르기는 등속, 내리꽂기는 끝으로 갈수록 빨라진다
    const x = Phaser.Math.Linear(p.from.x, p.to.x, u);
    const y = Phaser.Math.Linear(p.from.y, p.to.y, rising ? u : u * u);
    puyo.setPosition(x, y);
    this.spinTsuga(api, p, now);

    this.smashPoops(api, p, p.prev.x, p.prev.y, x, y);
    p.prev = { x, y };
    if (u < 1) return;

    if (rising) { this.startCling(api, p, now); return; }

    // 착지 — 회전을 풀고 원점을 발로 되돌린다
    puyo.setRotation(0);
    this.centerOrigin(p, false);
    puyo.setPosition(x, this.groundY);
    burst(scene, x, this.groundY, 'smoke', {
      count: 7, scale: 0.6, speed: 0.8, depth: DEPTH_PUYO - 1, blend: 'normal',
    });
    impact(scene, { shake: { duration: 180, intensity: 0.005 } });
    // 착지 자리는 화면 끝 근처다 — **안쪽으로**(방금 찼던 벽 쪽으로) 걸어 들어가야
    // 한 걸음 만에 가장자리에 부딪혀 방향을 뒤집지 않는다
    p.dir = p.wallRight ? 1 : -1;
    this.play(p, 'walk');
  }

  // ── 변신 ──────────────────────────────────────────────────────────
  //
  // summonEvery 번째 발동에서 평소 도약 대신 나간다. 설계는 docs/fx-heidi-clone.md.
  // soar(가운데로) → seal(인) → 펑 → fall(착지) → 걷다가 고유 기술

  /**
   * **변신 ① — 화면 가운데로 뛰어오른다.**
   *
   * 닌자가 어디선가 나오는 게 아니라 **뿌요 자신이** 변한다. 누가 무엇이 됐는지가
   * 인과로 읽혀야 해서, 모두의 시선이 모이는 화면 가운데로 올라가 거기서 인을 맺는다.
   *
   * **지난 변신은 풀지 않는다** — 미나토로 걷던 뿌요는 미나토인 채로 뛰어올라 인을 맺고,
   * 펑 하는 순간 다음 캐릭터로 바뀐다 (사람 판정: "바뀐 뿌요가 인을 맺지 않고 있어").
   * 그 캐릭터의 인 맺기 시트가 없으면 sheetFor 가 기본 뿌요 그림으로 떨어진다.
   */
  private startTransform(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene, player } = api;
    const W = scene.scale.width;
    const H = scene.scale.height;
    const P = HEIDI_PARAMS;
    this.transforming = true;

    // 솟구치는 동안은 작게, 인을 맺을 때 커진다 (startSeal)
    p.size = player.displayHeight * P.travelScale;
    p.from = { x: p.ob.x, y: this.groundY };
    p.to = { x: W / 2, y: H * P.transformY };
    p.prev = { x: p.from.x, y: p.from.y };
    p.jumpT0 = now;
    this.play(p, 'soar');
    // 등을 보이는 시트라 뒤집지 않고 돌린다. 회전축은 몸 가운데
    p.flip = false;
    p.ob.setFlipX(false);
    this.centerOrigin(p, true);
    p.from = { x: p.ob.x, y: p.ob.y };
    p.prev = { x: p.from.x, y: p.from.y };
    p.ob.setRotation(Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x) + Math.PI / 2);
    burst(scene, p.ob.x, this.groundY, 'smoke', {
      count: 6, scale: 0.55, speed: 0.7, depth: DEPTH_PUYO - 1, blend: 'normal',
    });
    if (P.debugFinLog) console.log('[하이디] 변신 1 도약');
  }

  /** 변신 ② — 공중에 떠서 인을 맺는다 (정면 6컷) */
  private startSeal(api: GameSceneAPI, p: Puyo, now: number): void {
    p.ob.setPosition(p.to.x, p.to.y);
    p.ob.setRotation(0);
    // 여기서 커진다 — 평소 크기로는 공중에서 인이 안 보인다
    p.size = api.player.displayHeight * HEIDI_PARAMS.transformScale;
    const ms = (PUYO_SEAL_FRAMES / HEIDI_PARAMS.sealFps) * 1000;
    this.play(p, 'seal', now + ms + HEIDI_PARAMS.sealHoldMs);
    // 솟구칠 때 가운데로 옮긴 원점을 발로 되돌린다 — **보이는 자리는 그대로**.
    // 인 맺기 이후(연기·능력·낙하)는 전부 발 원점 기준으로 짜여 있다
    this.centerOrigin(p, false);
    p.to = { x: p.ob.x, y: p.ob.y };
    p.ob.setFlipX(false);      // 정면 그림이라 뒤집지 않는다
    p.ob.setRotation(0);
    if (HEIDI_PARAMS.debugFinLog) console.log('[하이디] 변신 2 인 맺기');
  }

  /**
   * 변신 ③ — 인을 다 맺으면 **펑.** 연기와 섬광 속에서 캐릭터로 바뀌고 곧바로 능력을 쓴다.
   *
   * 능력은 소환과 같은 **압축 판본**이다 (p.summon). 앞에 도약과 인 맺기로 1초 넘게
   * 쌓았으니 능력까지 길면 늘어진다.
   */
  private stepSeal(api: GameSceneAPI, p: Puyo, now: number): void {
    this.holdPerch(p, api.scene);
    // 인 맺는 몸에 닿은 똥은 부서진다 — 공중에 크게 떠 있는데 똥이 통과하면 어색하다
    const bodyY = p.ob.y - p.size * 0.45;
    this.hitPoops(api, p.ob.x, bodyY, p.ob.x, bodyY,
      p.size * HEIDI_PARAMS.sealHitR, 0, HEIDI_PARAMS.puyoPoints);
    if (now < p.stateUntil) return;
    const { scene } = api;
    const P = HEIDI_PARAMS;

    const forced = P.debugCloneChar;
    // 랜덤 — 단 **방금 변신했던 캐릭터는 빼고** 뽑는다. 8명 중 1/8 로 같은 게 연달아 나오면
    // 기술이 안 바뀐 것처럼 보인다
    const pool = HEIDI_CLONE_CHARS.filter(c => c !== p.char);
    // **첫 변신은 기본 뿌요 고정** (사람 지시) — 판의 첫 기술로 그림자 분신술을 보여 준다.
    // 그다음부터 무작위 (방금 캐릭터는 빼고)
    const first = this.transformCount === 0;
    this.transformCount++;
    const who = (forced && (HEIDI_CLONE_CHARS as readonly string[]).includes(forced))
      ? forced
      : first ? 'puyo'
      : pool[Math.floor(Math.random() * pool.length)];

    // **펑 — 흰 연기가 티 나게.** 공용 smoke 는 하늘색 에셋이라 아무리 짙게 해도 희지 않아서
    // 흰 구름을 직접 그린 'poof' 프리셋을 쓴다. 두 겹으로 나눈다:
    // 몸을 덮는 짙은 뭉치(바뀌는 순간을 가린다) + 바깥으로 튀는 고리(펑의 박자)
    const cy = p.ob.y - p.size * 0.35;
    burst(scene, p.ob.x, cy, 'poof', {
      count: P.poofCoreCount, scale: P.poofCoreScale, speed: 0.8,
      alpha: P.poofAlpha, lifespan: P.poofLife, depth: DEPTH_PUYO + 1, blend: 'normal',
      gravityY: -30,
    });
    burst(scene, p.ob.x, cy, 'poof', {
      count: P.poofRingCount, scale: P.poofCoreScale * 0.6, speed: P.poofRingSpeed,
      alpha: P.poofAlpha * 0.85, lifespan: P.poofLife * 0.6, depth: DEPTH_PUYO + 1,
      blend: 'normal',
    });
    impact(scene, { flash: { alpha: 0.55, ms: P.finFlashMs } });

    p.char = who;
    p.form = HEIDI_CLONE_FIN[who] ?? 'clone';
    p.summon = true;
    p.finisher = true;
    p.finFired = false;
    if (P.debugFinLog) console.log('[하이디] 변신 3 펑 ->', who, '· form =', p.form);
    // 여덟 기술 전부 **땅에서 쓴다** — 공중에서 바로 쏘지 않고 먼저 내려가 걷다가 쓴다
    this.startFall(api, p, now);
    p.blinkAt = -1;    // 착지하면 stepFall 이 실제 시각으로 바꾼다
  }

  /**
   * **미나토 — 비뢰신 3연속.** 걷다가 아무 방향으로 표식 쿠나이를 던지고, 꽂힌 자리로
   * 순간이동한다. 거기서 또 던지고 또 뛴다.
   *
   * 한 주기 (시간 하나에서 전부 뽑는다 — 트윈 없음):
   *   0            던지는 자세
   *   throwMs      쿠나이가 손을 떠난다
   *   +flyMs       꽂힌다
   *   +stickMs     **순간이동** — 지나간 선 위 똥이 베인다
   *   +holdMs      다음 주기 (마지막이면 떨어진다)
   *
   * 판정은 점이 아니라 **출발점→도착점 선분**이다. 방향이 무작위라 도착점에만 판정을
   * 두면 허공을 벤 판이 많다 — 순간이동은 그 사이를 "지나간" 것으로 읽힌다.
   */
  private startBlink(api: GameSceneAPI, p: Puyo, now: number): void {
    p.blinkAt = undefined;
    // 첫 던지기 전에 컷인 — 누가 무엇을 하는지 먼저 알린다 (짧은 판본)
    const P = HEIDI_PARAMS;
    const lead = this.startCutin(api, p, now, P.summonCutinMs,
      P.summonCutinInMs, P.summonCutinOutMs) ? P.summonCutinMs : 0;
    p.blink = {
      n: 0, t0: now + lead, fx: 0, fy: 0, tx: 0, ty: 0, flyMs: P.blinkFlyMs, jumped: false,
      seen: [{ x: p.ob.x, y: p.ob.y - p.size * 0.45 }],
    };
    this.aimBlink(api, p);
    this.play(p, 'blinkThrow');
    if (lead > 0) p.ob.anims.pause(p.ob.anims.currentAnim?.frames[0]);
    if (P.debugFinLog) console.log('[하이디] 비뢰신 시작');
  }

  /**
   * 다음 쿠나이가 꽂힐 자리 — 무작위 방향으로 쏴 **좌·우·천장·바닥 벽까지**.
   * 땅에서는 위쪽 반원만 (땅에 박히면 제자리 점프가 된다).
   */
  private aimBlink(api: GameSceneAPI, p: Puyo): void {
    const b = p.blink;
    if (!b) return;
    const W = api.scene.scale.width;
    const P = HEIDI_PARAMS;
    // 손 높이에서 던진다 — 발 원점이라 몸통 가운데로 올린다
    const fx = p.ob.x;
    const fy = p.ob.y - p.size * 0.45;
    const onGround = b.n === 0;
    // **마지막 쿠나이는 바닥 한가운데** (사람 지시: 비뢰신 나선환) — 거기로 순간이동해 내려찍는다
    if (b.n + 1 >= P.blinkCount) {
      b.fx = fx; b.fy = fy; b.tx = W / 2; b.ty = this.groundY;
      const d = Math.hypot(b.tx - fx, b.ty - fy);
      b.flyMs = Math.max(160, d / ((P.blinkDistMin + P.blinkDistMax) / 2) * P.blinkFlyMs);
      b.jumped = false;
      if (Math.abs(b.tx - fx) > 4) p.ob.setFlipX(b.tx > fx);
      return;
    }
    // 쿠나이는 **화면 벽면**에 꽂힌다. 착지 여백(puyoLandMarginPx)·HUD 20% 를
    // 벽에 쓰면 공중에 떠 있는 것처럼 보인다. 스프라이트 원점이 중앙이라
    // 반 장만 물린다 — 그 이상은 벽을 뚫고 나간다
    const pad = P.blinkWallPadPx;
    const x0 = pad, x1 = W - pad;
    const y0 = pad, y1 = this.groundY;
    const minT = P.blinkDistMin;
    // **여러 후보 중 이미 들른 자리에서 가장 먼 곳**을 고른다. 예전엔 충분히 먼 첫 후보를
    // 바로 골라서, 먼 모서리 쪽으로 몰리고 비슷한 자리를 또 갔다 (사람 판정:
    // "비슷한 곳으로 가는 게 많다"). 약간의 무작위를 더해 매번 같은 답이 나오지 않게 한다
    let best = { x: W / 2, y: (y0 + y1) / 2, t: 0 };
    let bestScore = -Infinity;
    const spread = (x: number, y: number) => {
      let d = Infinity;
      for (const q of b.seen) d = Math.min(d, Math.hypot(x - q.x, y - q.y));
      return d + Math.random() * P.blinkSpreadJitter;
    };
    for (let i = 0; i < 48; i++) {
      const a = onGround
        ? Phaser.Math.FloatBetween(-Math.PI * 0.85, -Math.PI * 0.15)
        : Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let t = Infinity;
      if (dx < -1e-4) t = Math.min(t, (x0 - fx) / dx);
      if (dx >  1e-4) t = Math.min(t, (x1 - fx) / dx);
      if (dy < -1e-4) t = Math.min(t, (y0 - fy) / dy);
      if (dy >  1e-4) t = Math.min(t, (y1 - fy) / dy);
      if (!Number.isFinite(t) || t < 8) continue;
      const x = Phaser.Math.Clamp(fx + dx * t, x0, x1);
      const y = Phaser.Math.Clamp(fy + dy * t, y0, y1);
      // 너무 짧은 던지기는 후보에서 뺀다 (하나도 없으면 가장 긴 것으로 떨어진다)
      const score = t >= minT ? spread(x, y) : -1e6 + t;
      if (score > bestScore) { bestScore = score; best = { x, y, t }; }
    }
    b.fx = fx; b.fy = fy; b.tx = best.x; b.ty = best.y;
    b.seen.push({ x: best.x, y: best.y });
    const dist = Math.hypot(best.x - fx, best.y - fy);
    const ref = (P.blinkDistMin + P.blinkDistMax) / 2;
    b.flyMs = Math.max(160, dist / ref * P.blinkFlyMs);
    b.jumped = false;
    // 던지는 쪽을 본다 (그림이 왼쪽을 보므로 오른쪽이면 뒤집는다)
    if (Math.abs(b.tx - fx) > 4) p.ob.setFlipX(b.tx > fx);
  }

  private stepBlink(api: GameSceneAPI, p: Puyo, now: number): void {
    const b = p.blink;
    const P = HEIDI_PARAMS;
    const W = api.scene.scale.width;
    if (!b) { this.play(p, 'walk'); return; }
    if (b.n === 0 && !b.jumped) p.ob.y = this.groundY;   // 첫 발은 땅에서 던진다
    if (this.cutin) {
      this.stepCutin(api.scene, now);
      if (now < b.t0) return;
    }
    if (p.ob.anims.isPaused) p.ob.anims.resume();

    const e = now - b.t0;
    const release = P.blinkThrowMs;
    const flyMs = b.flyMs;
    const jump = release + flyMs + P.blinkStickMs;
    const next = jump + P.blinkHoldMs;

    // 쿠나이 — 손을 떠나면 생긴다. 날끝은 처음부터 날아가는 방향을 보고, 돌지 않는다
    if (e >= release && !b.k && !b.jumped) {
      const tex = fxPickSheetKey(HEIDI_WEAPON_SHEET);
      if (api.scene.textures.exists(tex)) {
        const face = Math.atan2(b.ty - b.fy, b.tx - b.fx) + Math.PI / 2;
        b.k = this.track(api.scene.add.image(b.fx, b.fy, tex, HEIDI_WEAPON.marker)
          .setDepth(DEPTH_PUYO + 1).setScale(P.chainMarkScale).setTint(P.chainMarkTint)
          .setRotation(face));
      }
    }
    if (b.k?.active && !b.jumped) {
      const k = Phaser.Math.Clamp((e - release) / flyMs, 0, 1);
      b.k.setPosition(b.fx + (b.tx - b.fx) * k, b.fy + (b.ty - b.fy) * k);
    }

    // 고속 이동 — **몸은 감추고 섬광선만** 출발점에서 도착점으로 뻗는다 (사람 지시:
    // "본체가 보인다기보다 섬광 같은 잔상이 일직선으로"). 선이 지나간 폭의 똥이 지워진다
    if (e >= jump && !b.jumped) {
      b.jumped = true;
      if (b.k) { this.discard(b.k); b.k = undefined; }
      p.ob.setVisible(false);
      playFx(api.scene, 'bloom', b.fx, b.fy, { scale: 0.5, tint: P.blinkCoreTint, depth: DEPTH_PUYO + 2 });
      this.startTrail(api.scene, b.fx, b.fy, b.tx, b.ty, now,
        P.blinkCoreTint, P.blinkGlowTint, P.blinkR, P.cloneFinPoints);
      this.hitPoops(api, b.fx, b.fy, b.tx, b.ty, P.blinkR, P.blinkLimit, P.cloneFinPoints);
      // 집중선은 뺐다 — 노란 방사선이 화면을 덮어 섬광선이 묻혔다 (사람 판정). 방사형 빛살은 이제 게임 전체 금지
    }

    // 도착 — 선 끝에 몸이 나타난다
    if (e >= jump + P.blinkDashMs && b.jumped && !b.arrived) {
      b.arrived = true;
      // 쿠나이는 벽에 꽂혀 있고, 캐릭터만 화면 안으로 민다
      const land = P.puyoLandMarginPx;
      p.ob.setPosition(
        Phaser.Math.Clamp(b.tx, land, W - land),
        Phaser.Math.Clamp(b.ty + p.size * 0.45, land, this.groundY),
      );
      p.ob.setVisible(true);
      const last = b.n + 1 >= P.blinkCount;
      if (last) {
        // **비뢰신 나선환** — 바닥 가운데에 나타나 웅크리고, 손에 나선환이 생긴다
        p.ob.setPosition(W / 2, this.groundY);
        playFx(api.scene, 'bloom', W / 2, this.groundY - p.size * 0.4,
          { scale: 0.75, tint: P.blinkCoreTint, depth: DEPTH_PUYO + 2 });
        impact(api.scene, { flash: { color: P.blinkFlashColor, alpha: P.finFlashStep, ms: P.finFlashMs } });
        this.startRasen(api, p, now);
        return;
      }
      this.play(p, 'blinkAir');
      playFx(api.scene, 'bloom', b.tx, b.ty, { scale: 0.75, tint: P.blinkCoreTint, depth: DEPTH_PUYO + 2 });
      if (last) {
        burst(api.scene, b.tx, b.ty, 'streak', {
          count: 12, scale: 1.2, speed: 2.0, depth: DEPTH_PUYO + 2, blend: 'add',
          tint: P.blinkCoreTint, lifespan: 0.45,
        });
        impact(api.scene, {
          hitstop: 70, shake: { duration: 200, intensity: 0.008 },
          flash: { color: P.blinkFlashColor, alpha: P.finFlashLast, ms: P.finFlashMs },
        });
      } else {
        impact(api.scene, { flash: { color: P.blinkFlashColor, alpha: P.finFlashStep, ms: P.finFlashMs } });
      }
      if (P.debugFinLog) console.log('[하이디] 비뢰신', b.n + 1, '/', P.blinkCount);
    }

    if (e < next + P.blinkDashMs) return;
    b.n++;
    b.arrived = false;
    if (b.n >= P.blinkCount) {
      p.blink = undefined;
      this.dropCutin();
      this.startFall(api, p, now);
      return;
    }
    // 공중에서 다음 쿠나이
    b.t0 = now;
    this.aimBlink(api, p);
    this.play(p, 'blinkThrow');
  }

  /**
   * 고속 이동의 섬광선 하나. 두 겹이다 — 판정 폭만큼의 옅은 빛띠(보이는 만큼 지운다는 약속)
   * 와 가운데 밝은 심지. `proc-streak` 는 가로로 누운 192px 에 빛이 가운데 30px 만 차 있어서
   * 표시 높이를 그 비율로 늘려 잡는다.
   */
  /**
   * **비뢰신 나선환** — 마지막 쿠나이 자리(바닥 가운데)에서 웅크려 나선환을 모으고(rasenChargeMs),
   * 바닥에 내려찍는다. 파란 돔이 부풀며(rasenblast 8컷) 반경이 자라는 만큼 똥을 날린다.
   * 원작의 "표식으로 순간이동해 바로 나선환을 박는" 연결을 그대로 옮겼다
   */
  private startRasen(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    this.play(p, 'rasen');
    p.ob.setFlipX(false);
    p.cutT0 = now;               // 모으기 시작
    p.throwAt = 0;               // 내려찍은 시각 (0 = 아직)
    p.chainI = 0;                // 폭발로 지금까지 넓힌 반경(px)
    const key = fxPickSheetKey(HEIDI_FX_RASENGAN);
    if (scene.textures.exists(key)) {
      const orb = this.track(scene.add.sprite(p.ob.x, this.groundY - p.size * P.rasenHandY, key, 0)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_PUYO + 2).setDisplaySize(1, 1));
      const anim = this.animKey(HEIDI_FX_RASENGAN);
      if (scene.anims.exists(anim)) orb.play({ key: anim }, true);
      p.rasenOrb = orb;
    }
    if (P.debugFinLog) console.log('[하이디] 비뢰신 나선환');
  }

  private stepRasen(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    if (this.cutin) this.stepCutin(scene, now);
    p.ob.y = this.groundY;
    const e = now - (p.cutT0 ?? now);
    const orb = p.rasenOrb;
    const full = p.size * P.rasenOrbSize;

    // ① 모으기 — 손 위에서 나선환이 커진다 (끝으로 갈수록 떨린다)
    if (!p.throwAt) {
      const k = Phaser.Math.Clamp(e / P.rasenChargeMs, 0, 1);
      const shiver = k > 0.7 ? 1 + 0.05 * Math.sin(now * 0.1) : 1;
      const d = full * (0.3 + 0.7 * Math.sqrt(k)) * shiver;
      orb?.setPosition(p.ob.x, this.groundY - p.size * P.rasenHandY).setDisplaySize(d, d);
      if (k < 1) return;
      // ② 내려찍기
      p.throwAt = now;
      if (orb) { this.discard(orb); p.rasenOrb = undefined; }
      const bkey = fxPickSheetKey(HEIDI_FX_RASENBLAST);
      if (scene.textures.exists(bkey)) {
        const w = scene.scale.width * P.rasenBlastW;
        const blast = this.track(scene.add.sprite(p.ob.x, this.groundY + 4, bkey, 0).setOrigin(0.5, 1)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_PUYO + 2).setDisplaySize(w, w));
        const anim = this.animKey(HEIDI_FX_RASENBLAST);
        if (scene.anims.exists(anim)) blast.play({ key: anim }, true);
        p.rasenBlast = blast;       // 기술이 끝날 때 같이 치운다 (재생 완료를 기다리지 않는다)
      }
      // 푸른 파동 — 내려찍은 자리에서 화면 끝까지 퍼지는 고리 (사람 지시: "파동에 닿은 똥 사라지게")
      // **일반 블렌드**로 그린다 — 가산이면 밝은 하늘 배경에서 흰색으로 날아가 안 보였다 (사람 판정)
      p.rasenWave = this.track(scene.add.graphics().setDepth(DEPTH_PUYO + 2));
      p.rasenWaveR = 0;
      impact(scene, {
        hitstop: 90, shake: { duration: 320, intensity: 0.014 },
        flash: { color: 0xbfe6ff, alpha: P.finFlashLast, ms: P.finFlashMs },
      });
      burst(scene, p.ob.x, this.groundY, 'smoke', {
        count: 8, scale: 0.9, speed: 1.4, depth: DEPTH_PUYO, blend: 'normal', angle: { min: 180, max: 360 },
      });
      if (P.debugFinLog) console.log('[하이디] 나선환 쾅');
      return;
    }
    // ③ 폭발 — 돔이 부푸는 만큼 반경이 자라며 똥을 날린다 (한 번 지나간 반경은 다시 안 훑는다)
    const k = Phaser.Math.Clamp((now - p.throwAt) / (P.rasenBlastMs * 0.6), 0, 1);
    const r = P.rasenR * (1 - (1 - k) * (1 - k));
    const cy = this.groundY - P.rasenR * 0.35;
    if (r > (p.chainI ?? 0)) {
      p.chainI = r;
      this.hitPoops(api, p.ob.x, cy, p.ob.x, cy, r, 0, P.cloneFinPoints);
    }
    // 파동 — 반경이 퍼지며 **이번 프레임에 새로 훑은 고리 구간**의 똥을 날린다
    const wave = p.rasenWave;
    if (wave?.active) {
      const W = scene.scale.width;
      const reach = Math.max(Math.hypot(p.ob.x, this.groundY), Math.hypot(W - p.ob.x, this.groundY));
      const kw = Phaser.Math.Clamp((now - p.throwAt) / P.rasenWaveMs, 0, 1);
      const wr = reach * (1 - (1 - kw) * (1 - kw));
      const from = p.rasenWaveR ?? 0;
      const fade = 1 - kw * kw * kw;          // 끝 무렵에만 흐려진다
      wave.clear();
      if (kw < 1) {
        // 세 겹 — 진한 파랑 테두리(어느 배경에서도 윤곽) · 하늘색 띠 · 흰 심
        const cx = p.ob.x, cy = this.groundY;
        wave.lineStyle(P.rasenWaveW, P.rasenWaveEdge, 0.85 * fade).strokeCircle(cx, cy, wr);
        wave.lineStyle(P.rasenWaveW * 0.65, P.rasenWaveTint, 0.95 * fade).strokeCircle(cx, cy, wr);
        wave.lineStyle(P.rasenWaveW * 0.22, 0xffffff, fade).strokeCircle(cx, cy, wr);
      }
      if (wr > from) {
        let n = 0;
        const lo = Math.max(0, from - P.rasenWaveW / 2), hi = wr + P.rasenWaveW / 2;
        for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
          if (!q.active) continue;
          const d = Math.hypot(q.x - p.ob.x, q.y - this.groundY);
          if (d < lo || d > hi) continue;
          (q as unknown as PoolablePoopBase).recycle();
          n++;
        }
        if (n > 0) this.awardBonus(api, n * P.cloneFinPoints);
        p.rasenWaveR = wr;
      }
    }
    if (now - p.throwAt < Math.max(P.rasenBlastMs + P.rasenHoldMs, P.rasenWaveMs)) return;
    // ④ 끝 — 폭발·파동을 치우고 그 자리에서 걷는다
    if (p.rasenBlast) { this.discard(p.rasenBlast); p.rasenBlast = undefined; }
    if (p.rasenWave) { this.discard(p.rasenWave); p.rasenWave = undefined; }
    p.blink = undefined;
    this.dropCutin();
    this.play(p, 'walk');
  }

  private startTrail(
    scene: Phaser.Scene, sx: number, sy: number, tx: number, ty: number, now: number,
    coreTint: number, glowTint: number, r: number, pts: number,
  ): void {
    const key = 'fx_proc_streak';
    if (!scene.textures.exists(key)) return;
    const P = HEIDI_PARAMS;
    const len = Math.hypot(tx - sx, ty - sy);
    if (len < 4) return;
    const ang = Math.atan2(ty - sy, tx - sx);
    const fill = 192 / 30;   // 텍스처 높이 / 빛이 찬 높이
    const mk = (tint: number, alpha: number) => this.track(scene.add.image(sx, sy, key)
      .setOrigin(0, 0.5).setRotation(ang).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint).setAlpha(alpha).setDepth(DEPTH_PUYO + 2).setDisplaySize(1, 1));
    const glowH = r * 2 * fill;
    const coreH = P.blinkTrailCore * fill;
    this.trails.push({
      glow: mk(glowTint, P.blinkTrailAlpha),
      core: mk(coreTint, 1),
      t0: now, len, glowH, coreH, sx, sy, ang, r, pts,
    });
  }

  /**
   * 잔상 한 프레임 — 뻗고(blinkDashMs), 가늘어지며 걷힌다(blinkTrailMs).
   *
   * **떠 있는 동안 선 위의 똥을 계속 지운다.** 예전엔 출발 순간 한 번만 훑어서, 빛줄기가
   * 남아 있는 0.3초 사이 그 위로 떨어져 들어온 똥이 그대로 통과했다 (사람 판정:
   * "지나가는 길에 있는 똥이 삭제가 안 된다"). 빛이 반쯤 걷히면 판정도 끝낸다
   */
  private stepTrails(api: GameSceneAPI, now: number): void {
    const P = HEIDI_PARAMS;
    const fill = 192 / 188;  // 텍스처 폭 / 빛이 찬 폭
    for (const t of this.trails) {
      if (!t.glow.active || !t.core.active) continue;
      const e = now - t.t0;
      const grow = Phaser.Math.Clamp(e / P.blinkDashMs, 0, 1);
      const f = Phaser.Math.Clamp((e - P.blinkDashMs) / P.blinkTrailMs, 0, 1);
      const fade = Math.pow(1 - f, 1.5);
      const w = t.len * grow * fill;
      if (t.pts > 0 && f < 0.5) {
        const reach = t.len * grow;
        this.hitPoops(api, t.sx, t.sy, t.sx + Math.cos(t.ang) * reach, t.sy + Math.sin(t.ang) * reach,
          t.r, 0, t.pts);
      }
      t.glow.setDisplaySize(Math.max(1, w), t.glowH * (1 - 0.5 * f)).setAlpha(P.blinkTrailAlpha * fade);
      t.core.setDisplaySize(Math.max(1, w), t.coreH * (1 - 0.7 * f)).setAlpha(fade);
      if (f >= 1) { this.discard(t.glow); this.discard(t.core); }
    }
    this.trails = this.trails.filter(t => t.glow.active && t.core.active);
  }

  /**
   * **카카시 — 치도리 (땅 판본).** 착지한 자리에서 웅크려 2초 모았다가, 땅을 박차고
   * 위로 일직선으로 꿰뚫는다. 세로 기둥 판정은 공중 판본(stepSurge)과 같다.
   *
   *   0 ~ chargeMs    웅크림 · 앞발의 구가 자란다 · 전기 조각이 튄다 · 흔들림이 커진다
   *   chargeMs        발사 — 기둥 + 판정 + 히트스톱, 몸은 위로 솟구친다 (launchMs)
   *   + topHoldMs     꼭대기에서 멈춤 → 떨어진다
   */
  private startCharge(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    p.blinkAt = undefined;
    // 컷인은 모으기 시작과 함께 — 판이 걷혀도 계속 모으고 있으니 기술이 잘리지 않는다
    this.startCutin(api, p, now, P.summonCutinMs, P.summonCutinInMs, P.summonCutinOutMs);
    p.jumpT0 = now;
    p.throwAt = now;                 // 다음 전기 조각 시각
    p.chainI = 0;                    // 흔들림 단계
    p.cutT0 = now + P.surgeZapEvery; // 다음 전기 지짐 시각
    p.zapLeft = P.surgeZapMax;     // 남은 지짐 수
    p.surgeN = 0;
    p.surgeFoot = undefined;         // 첫 장전은 땅에서
    p.surgeSeen = [{ x: p.ob.x, y: this.groundY - p.size * 0.45 }];
    p.surgeChargeMs = P.surgeChargeMs;
    p.ob.y = this.groundY;
    this.play(p, 'chargeC', now + P.surgeChargeMs);
    const legs = P.surgeDashes;
    p.chidori = fxSprite(api.scene, p.ob.x, p.ob.y, '', {
      sheet: 'chidori', blend: 'add', depth: DEPTH_PUYO + 2, scale: [0.01, 0.01],
      lifeMs: P.surgeChargeMs + (legs - 1) * P.surgeRechargeMs + legs * P.surgeLegMs
        + P.surgeTopHoldMs + 1500,
    }) ?? undefined;
    if (P.debugFinLog) console.log('[하이디] 치도리 모으기');
  }

  /**
   * **네지 — 회천 (땅 판본).** 착지한 자리에서 백안으로 한 박자 멈췄다가, 제자리에서 돌며
   * 차크라 구를 펼친다. 구 안의 똥은 바깥으로 튕겨 나가고(deflectPoops), 튕긴 똥이 다른
   * 똥을 치면 그것도 터진다. 도는 동안 **새로 떨어져 들어온 똥도** 튕긴다.
   *
   *   0 ~ byakuganMs     정면으로 멈춤 · 눈에 빛 · 짧은 컷인
   *   + growMs           구가 확 펼쳐지며 첫 튕김
   *   ~ kaitenMs         돌며 pushEvery 마다 튕김 (총량 deflectTotal)
   *   끝 fadeMs          구가 흩어진다 → 걷는다
   */
  private startKaiten(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    p.blinkAt = undefined;
    this.startCutin(api, p, now, P.summonCutinMs, P.summonCutinInMs, P.summonCutinOutMs);
    p.ob.y = this.groundY;
    p.ob.setFlipX(false);
    this.play(p, 'byakugan', now + P.byakuganMs);
    p.ob.anims.pause(p.ob.anims.currentAnim?.frames[0]);   // 정면 컷에서 멈춘다
    // 백안 — 눈높이에 옅은 빛. 정면 그림이라 눈은 머리 가운데다
    playFx(api.scene, 'bloom', p.ob.x, p.ob.y - p.size * 0.62, {
      scale: 0.35, scaleTo: 0.9, tint: 0xeae4ff, depth: DEPTH_PUYO + 2,
    });
    if (P.debugFinLog) console.log('[하이디] 백안');
  }

  private stepKaiten(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    if (this.cutin) this.stepCutin(scene, now);
    p.ob.y = this.groundY;
    // 도는 동안 **좌우로 미끄러진다** — 화면 끝(여백 안쪽)에 닿으면 되돌아온다
    if (p.state === 'kaiten' && now - p.jumpT0 < P.kaitenMs - P.kaitenFadeMs) {
      const W = scene.scale.width;
      const half = p.size * 0.4;
      const minX = P.puyoMargin + half, maxX = W - P.puyoMargin - half;
      let x = p.ob.x + p.dir * P.kaitenMoveSpeed * (scene.game.loop.delta / 1000);
      if (x <= minX) { x = minX; p.dir = 1; }
      if (x >= maxX) { x = maxX; p.dir = -1; }
      p.ob.x = x;
    }
    const cx = p.ob.x;
    const cy = p.ob.y - p.size * 0.45;          // 몸 가운데 — 구도 판정도 여기가 중심

    if (p.state === 'byakugan') {
      if (now < p.stateUntil) return;
      // 회천 시작
      this.play(p, 'kaiten', now + P.kaitenMs);
      p.ob.setFlipX(false);
      p.jumpT0 = now;
      p.throwAt = now + P.kaitenGrowMs;          // 첫 튕김 = 구가 다 펼쳐진 순간
      p.chainI = 0;                              // 튕김 횟수
      // 넓은 쪽으로 먼저 미끄러진다
      p.dir = p.ob.x < scene.scale.width / 2 ? 1 : -1;
      p.dome = fxSprite(scene, cx, cy, '', {
        sheet: 'kaiten', blend: 'add', depth: DEPTH_PUYO + 2, scale: [0.01, 0.01],
        lifeMs: P.kaitenMs + 1000,
      }) ?? undefined;
      impact(scene, { shake: { duration: 180, intensity: 0.004 } });
      if (P.debugFinLog) console.log('[하이디] 회천');
      return;
    }

    // 구 — 확 펼쳐지고, 유지되고, 끝에 흩어지며 조금 더 커진다
    const e = now - p.jumpT0;
    const dome = p.dome;
    if (dome?.active) {
      const full = P.deflectR * 2 * (96 / 87);   // 시트의 구 반지름이 칸 반폭의 87/96
      const grow = Phaser.Math.Clamp(e / P.kaitenGrowMs, 0, 1);
      const out = Phaser.Math.Clamp((e - (P.kaitenMs - P.kaitenFadeMs)) / P.kaitenFadeMs, 0, 1);
      const g = (0.3 + 0.7 * (1 - (1 - grow) * (1 - grow))) * (1 + 0.15 * out);
      dome.setPosition(cx, cy).setDisplaySize(full * g, full * g)
        .setAlpha(P.kaitenDomeAlpha * (1 - out));
    }

    // 튕김 — 첫 번째만 총량을 채운다. 흩어지는 동안에는 안 튕긴다
    if (now >= (p.throwAt ?? Infinity) && e < P.kaitenMs - P.kaitenFadeMs) {
      const first = (p.chainI ?? 0) === 0;
      p.chainI = (p.chainI ?? 0) + 1;
      p.throwAt = now + P.kaitenPushEvery;
      this.deflectPoops(api, p, { x: cx, y: cy }, first, P.kaitenTotal, P.kaitenHitR);
      if (first) impact(scene, { hitstop: 50, shake: { duration: 200, intensity: 0.006 } });
    }

    if (now < p.stateUntil) return;
    this.dropDisc(p);                            // 구 회수 (원반과 같은 길)
    p.ob.anims.timeScale = 1;
    this.startHakke(api, p, now);                // 마무리 — 팔괘 64장
  }

  /**
   * **네지 마무리 — 팔괘 64장** (사람 지시). 회천이 끝나면 발밑에 팔괘 진이 크게 펼쳐지고,
   * 2 · 4 · 8 · 16 · 32 · 64 장 박자로 진 안의 똥을 **가까운 것부터** 손바닥으로 친다.
   * 박자마다 친 수가 늘어 연타가 점점 빨라지는 것처럼 읽힌다 (원작의 "팔괘 2장 · 4장 …")
   */
  private startHakke(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    this.play(p, 'hakke');
    p.cutT0 = now;            // 시작
    p.chainI = 0;             // 지금까지 친 박자 수
    const key = fxPickSheetKey(HEIDI_FX_TRIGRAM);
    if (scene.textures.exists(key)) {
      const d = scene.scale.width * P.hakkeW;
      p.dome = this.track(scene.add.image(p.ob.x, this.groundY, key)
        .setDisplaySize(d, d * P.hakkeSquash).setAlpha(0).setDepth(0));
      // 진은 바닥에 깔린다 — 하이디 뒤로
      scene.children.moveBelow(p.dome as Phaser.GameObjects.GameObject, api.player as Phaser.GameObjects.GameObject);
    }
    if (P.debugFinLog) console.log('[하이디] 팔괘 64장');
  }

  private stepHakke(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    p.ob.y = this.groundY;
    const e = now - (p.cutT0 ?? now);
    const total = P.hakkeBeats.length;
    const endAt = P.hakkeOpenMs + total * P.hakkeBeatMs + P.hakkeHoldMs;
    // 진 — 펼쳐지며 나타났다가 끝에 사라진다
    const dome = p.dome;
    if (dome?.active) {
      const open = Math.min(1, e / P.hakkeOpenMs);
      const fade = Math.min(1, (endAt - e) / 250);
      const d = scene.scale.width * P.hakkeW * (0.6 + 0.4 * open);
      dome.setDisplaySize(d, d * P.hakkeSquash).setPosition(p.ob.x, this.groundY)
        .setAlpha(Math.max(0, Math.min(open, fade)) * 0.95).setRotation(0);
    }
    // 박자 — 2 · 4 · 8 · 16 · 32 · 64
    const beat = Math.floor((e - P.hakkeOpenMs) / P.hakkeBeatMs);
    if (e >= P.hakkeOpenMs && beat >= (p.chainI ?? 0) && (p.chainI ?? 0) < total) {
      const i = p.chainI ?? 0;
      p.chainI = i + 1;
      this.hakkeBeat(api, p, P.hakkeBeats[i], i + 1 >= total, i % 2 === 0 ? -1 : 1);
    }
    if (e < endAt) return;
    this.dropDisc(p);
    this.play(p, 'walk');
  }

  /**
   * 한 박자 — 진 반경 안의 일반 똥을 가까운 것부터 n 개 손바닥으로 친다.
   * **박자마다 좌우를 번갈아** 친다 (사람 판정: "한쪽만 때린다") — 그쪽을 보고, 그쪽 똥부터.
   * 그쪽에 모자라면 반대쪽에서 채운다
   */
  private hakkeBeat(api: GameSceneAPI, p: Puyo, n: number, last: boolean, side: number): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    const cx = p.ob.x, cy = this.groundY - p.size * 0.5;
    const R = scene.scale.width * P.hakkeR;
    p.ob.setFlipX(side > 0);                     // 그림이 왼쪽을 본다 — 오른쪽 박자엔 뒤집는다
    const near = (a: Phaser.Physics.Arcade.Sprite, b: Phaser.Physics.Arcade.Sprite) =>
      Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy);
    const inRange = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(q => q.active && Math.hypot(q.x - cx, q.y - cy) <= R);
    const mine = inRange.filter(q => (q.x - cx) * side >= 0).sort(near);
    const other = inRange.filter(q => (q.x - cx) * side < 0).sort(near);
    const list = [...mine, ...other].slice(0, n);
    const key = fxPickSheetKey(HEIDI_FX_PALM);
    const anim = this.animKey(HEIDI_FX_PALM);
    for (const q of list) {
      if (scene.textures.exists(key)) {
        const s = p.size * P.hakkePalmSize;
        const fx = this.track(scene.add.sprite(q.x, q.y, key, 0).setDisplaySize(s, s).setDepth(DEPTH_PUYO + 2));
        if (scene.anims.exists(anim)) fx.play({ key: anim }, true);
        scene.time.delayedCall(560, () => this.discard(fx));   // 8컷 · 16fps = 0.5초
      }
      (q as unknown as PoolablePoopBase).recycle(true);
    }
    if (list.length > 0) this.awardBonus(api, list.length * P.cloneFinPoints);
    impact(scene, { hitstop: last ? 70 : 25, flash: last ? { color: P.deflectTint, alpha: 0.4, ms: P.finFlashMs } : undefined });
  }

  /**
   * **이타치 — 아마테라스 (땅 판본).** 착지한 자리에서 만화경을 뜨고 망토를 펼치면
   * 깃털이 흩어지며 까마귀 6마리가 난다. 까마귀는 각자 다른 똥을 쫓아가 부딪히고,
   * 부딪힌 자리에 **검은 불기둥**이 4초 서서 닿는 똥을 태운다. 못 맞힌 까마귀도 1초 뒤
   * 그 자리에서 불기둥이 된다.
   *
   * 다른 캐릭터는 순간에 지우는데 이타치만 **붙여 놓고 나중에 사라진다** —
   * 리듬이 달라 누가 나왔는지가 바로 읽힌다 (docs/fx-heidi-clone.md "시간축이 다른 둘").
   */
  private startMangekyo(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    p.blinkAt = undefined;
    this.startCutin(api, p, now, P.summonCutinMs, P.summonCutinInMs, P.summonCutinOutMs);
    p.ob.y = this.groundY;
    p.ob.setFlipX(false);
    this.play(p, 'mangekyo', now + P.eyeMs);
    p.jumpT0 = now;
    p.chainI = 0;                                  // 0 = 아직 눈 안 뜸, 1 = 떴음, 2 = 까마귀 풀림
    if (P.debugFinLog) console.log('[하이디] 만화경');
  }

  private stepMangekyo(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    if (this.cutin) this.stepCutin(scene, now);
    p.ob.y = this.groundY;
    const k = (now - p.jumpT0) / P.eyeMs;
    // 눈을 뜨는 순간(2번째 컷) — 눈높이에 붉은 빛 한 번
    if ((p.chainI ?? 0) === 0 && k >= 1 / 6) {
      p.chainI = 1;
      playFx(scene, 'bloom', p.ob.x, p.ob.y - p.size * 0.6, {
        scale: 0.3, scaleTo: 0.8, tint: 0xff2a2a, depth: DEPTH_PUYO + 2,
      });
    }
    // 망토가 깃털로 흩어질 때 까마귀가 난다 — 스사노오는 아마테라스 끝 무렵에 예약
    if ((p.chainI ?? 0) === 1 && k >= P.eyeCrowAt) {
      p.chainI = 2;
      this.releaseCrows(api, p, now);
      this.susanooPending = true;
    }
    if (now < p.stateUntil) return;
    this.play(p, 'walk');
  }

  /** 까마귀를 푼다 — 목표는 **서로 먼 똥부터** (한 덩어리에 몰리면 불이 한 점에 겹친다) */
  private releaseCrows(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene, player } = api;
    const P = HEIDI_PARAMS;
    const tex = fxPickSheetKey(HEIDI_FX_CROW);
    if (!scene.textures.exists(tex)) return;
    // 아래쪽(땅 가까이) 똥은 노리지 않는다 — 까마귀가 곤두박질치고 불이 플레이어 발밑에서 핀다
    const lowY = this.groundY - scene.scale.height * P.crowMinRiseH;
    const pool = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(q => q.active && q.y < lowY);
    const picked: Phaser.Physics.Arcade.Sprite[] = [];
    while (picked.length < P.igniteCrows && pool.length > 0) {
      let best = 0, bestD = -1;
      for (let i = 0; i < pool.length; i++) {
        let d = Infinity;
        for (const o of picked) d = Math.min(d, Math.hypot(pool[i].x - o.x, pool[i].y - o.y));
        if (picked.length === 0) d = -pool[i].y;   // 첫 마리는 가장 아래(가장 위험한) 똥
        if (d > bestD) { bestD = d; best = i; }
      }
      picked.push(pool.splice(best, 1)[0]);
    }
    const cx = p.ob.x, cy = p.ob.y - p.size * 0.5;
    const size = player.displayHeight * P.crowScale;
    const n = P.igniteCrows;
    this.fireLeft = P.igniteFireMax;
    for (let i = 0; i < n; i++) {
      // 부채꼴로 위로 퍼진다 (-160° ~ -20°)
      const a = Phaser.Math.DegToRad(-160 + (140 * (i + 0.5)) / n);
      // 망토 폭만큼 좌우로 흩어서 나온다 — 한 점에서 나오면 여덟이 겹쳐 수가 안 읽힌다
      const sx = cx + P.crowSpreadX * ((i + 0.5) / n * 2 - 1);
      const ob = this.track(scene.add.sprite(sx, cy - Math.abs(Math.sin(a)) * 6, tex, 0)
        .setDepth(DEPTH_PUYO + 2));
      ob.setDisplaySize(size, size);
      const anim = this.animKey(HEIDI_FX_CROW);
      if (scene.anims.exists(anim)) ob.play({ key: anim, startFrame: i % 6 }, true);
      const q = picked[i];
      this.crows.push({
        ob, t0: now, q,
        vx: Math.cos(a) * P.crowLaunch, vy: Math.sin(a) * P.crowLaunch,
        // 목표가 없으면 위로 날아가 사라진다
        tx: q ? q.x : cx + Math.cos(a) * 600, ty: q ? q.y : -80,
      });
    }
    burst(scene, cx, cy, 'shard', {
      count: 8, scale: 0.5, speed: 0.9, depth: DEPTH_PUYO + 1, blend: 'normal', tint: 0x181420,
    });
    if (P.debugFinLog) console.log('[하이디] 까마귀', n, '· 목표', picked.length);
  }

  private stepCrows(api: GameSceneAPI, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    const dt = scene.game.loop.delta / 1000;
    for (const c of this.crows) {
      if (!c.ob.active) continue;
      if (c.q && !c.q.active) c.q = undefined;       // 누가 먼저 지웠으면 마지막 자리로
      if (c.q) { c.tx = c.q.x; c.ty = c.q.y; }
      const dx = c.tx - c.ob.x, dy = c.ty - c.ob.y;
      const d = Math.hypot(dx, dy);
      // 목표 쪽으로 꺾는다 — 처음엔 부채꼴로 퍼지고, 점점 목표로 휜다
      const sp = Math.min(P.crowSpeed, P.crowLaunch + (now - c.t0) * 0.9);
      const t = Math.min(1, P.crowTurn * dt * 60);
      c.vx += ((dx / Math.max(1, d)) * sp - c.vx) * t;
      c.vy += ((dy / Math.max(1, d)) * sp - c.vy) * t;
      c.ob.x += c.vx * dt;
      c.ob.y += c.vy * dt;
      // 그림은 오른쪽을 본다. 왼쪽으로 가면 뒤집고, 기울기는 진행 방향을 따른다
      const left = c.vx < 0;
      c.ob.setFlipX(left);
      // 기울기는 상한까지만 — 목표가 바로 아래여도 머리를 곤두박질치지 않는다
      const tilt = Phaser.Math.Clamp(Math.atan2(c.vy, Math.abs(c.vx)),
        -Phaser.Math.DegToRad(P.crowTiltMax), Phaser.Math.DegToRad(P.crowTiltMax));
      c.ob.setRotation(tilt * (left ? -1 : 1));

      // 맞혔다 → 그 똥을 태우고 그 자리에 불기둥.
      // 못 맞히고 시간이 다 됐다 → **까마귀가 있던 자리에** 불기둥 (화면 안으로 당겨서)
      const hit = !!c.q && d < 16;
      if (hit || now - c.t0 > P.crowFuseMs) {
        const W = scene.scale.width, H = scene.scale.height;
        const fx = Phaser.Math.Clamp(c.ob.x, 20, W - 20);
        const fy = Phaser.Math.Clamp(c.ob.y, H * 0.12, this.groundY - 10);
        if (hit && c.q) this.ignite(api, c.q, now);
        this.startFire(scene, fx, fy, now);
        if (P.debugFinLog) {
          console.log('[하이디] 아마테라스 불기둥', hit ? '(적중)' : '(시간 초과)',
            Math.round(fx), Math.round(fy), '· 까마귀 남음', this.crows.filter(o => o.ob.active).length - 1);
        }
        burst(scene, fx, fy, 'shard', {
          count: 5, scale: 0.4, speed: 0.7, depth: DEPTH_PUYO + 1, blend: 'normal', tint: 0x181420,
        });
        this.discard(c.ob);
      }
    }
    this.crows = this.crows.filter(c => c.ob.active);
  }

  /**
   * 불기둥 하나. 몸통 가운데가 (x, y) 에 오도록 세운다 — 공중이어도 그 자리에서 탄다
   * (까마귀가 못 맞히고 멈춘 자리가 공중일 수 있다. 떨어지는 똥이 거기로 들어와 탄다)
   */
  private startFire(scene: Phaser.Scene, x: number, y: number, now: number): void {
    const P = HEIDI_PARAMS;
    const tex = fxPickSheetKey(HEIDI_FX_AMATERASU);
    if (!scene.textures.exists(tex)) {
      if (P.debugFinLog) console.warn('[하이디] 아마테라스 텍스처 없음:', tex);
      return;
    }
    const s = P.igniteFireSize;
    const flame = this.track(scene.add.sprite(x, y + s * 0.45, tex, 0)
      .setOrigin(0.5, 0.97).setDepth(DEPTH_PUYO + 2).setAlpha(0).setDisplaySize(s, s));
    const anim = this.animKey(HEIDI_FX_AMATERASU);
    if (scene.anims.exists(anim)) flame.play({ key: anim, startFrame: Phaser.Math.Between(0, 7) }, true);
    this.fires.push({ flame, t0: now, x, y });
  }

  /** 불기둥 한 프레임 — 피어나고, 4초 타며 닿는 똥을 태우고, 사그라든다 */
  private stepFires(api: GameSceneAPI, now: number): void {
    const P = HEIDI_PARAMS;
    const r2 = P.igniteFireR * P.igniteFireR;
    for (const f of this.fires) {
      if (!f.flame.active) continue;
      const e = now - f.t0;
      const fadeIn = Math.min(1, e / 150);
      const fadeOut = Math.max(0, Math.min(1, (P.igniteFireMs - e) / 400));
      f.flame.setAlpha(Math.min(fadeIn, fadeOut));
      // 사그라드는 동안(마지막 0.4초)은 태우지 않는다 — 보이지도 않는 불에 타면 억울하다
      if (fadeOut >= 1 && this.fireLeft > 0) {
        for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
          if (!q.active) continue;
          if ((q.x - f.x) ** 2 + (q.y - f.y) ** 2 > r2) continue;
          this.ignite(api, q, now);
          if (--this.fireLeft <= 0) break;
        }
      }
      if (e >= P.igniteFireMs) this.discard(f.flame);
    }
    this.fires = this.fires.filter(f => f.flame.active);
  }

  /** 똥 하나에 검은 불을 붙인다. 원래 똥은 즉시 조용히 회수 — 타는 건 잔상이다 */
  private ignite(api: GameSceneAPI, q: Phaser.Physics.Arcade.Sprite, now: number): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    const x = q.x, y = q.y, h = q.displayHeight;
    const ghost = this.track(scene.add.image(x, y, q.texture.key, q.frame.name)
      .setDisplaySize(q.displayWidth, q.displayHeight).setRotation(q.rotation)
      .setDepth(DEPTH_PUYO + 1).setTint(0x3a2430));
    let flame: Phaser.GameObjects.Sprite | undefined;
    const tex = fxPickSheetKey(HEIDI_FX_AMATERASU);
    if (scene.textures.exists(tex)) {
      flame = this.track(scene.add.sprite(x, y + h * 0.5, tex, 0)
        .setOrigin(0.5, 0.97).setDepth(DEPTH_PUYO + 2).setAlpha(0));
      const fh = h * 1.6;             // 타는 똥 위의 작은 불 (불기둥보다 작게)
      flame.setDisplaySize(fh, fh);
      const anim = this.animKey(HEIDI_FX_AMATERASU);
      if (scene.anims.exists(anim)) flame.play({ key: anim, startFrame: Phaser.Math.Between(0, 7) }, true);
    }
    this.burns.push({ ghost, flame, t0: now, sx: ghost.scaleX, sy: ghost.scaleY });
    (q as unknown as PoolablePoopBase).recycle(true);
    this.awardBonus(api, P.cloneFinPoints);
  }

  /**
   * 타는 똥 한 프레임 — 불이 확 붙고, 똥은 까맣게 쪼그라들어 재가 된다.
   * 옮겨붙기(설계표의 "전염 1회")는 불기둥(stepFires)이 대신한다 — 4초 동안 자리를 지키며
   * 닿는 똥을 계속 태우므로 번지는 효과가 이미 난다
   */
  private stepBurns(now: number): void {
    const P = HEIDI_PARAMS;
    for (const b of this.burns) {
      if (!b.ghost.active) continue;
      const e = Phaser.Math.Clamp((now - b.t0) / P.igniteBurnMs, 0, 1);
      if (b.flame?.active) {
        const fin = e < 0.08 ? e / 0.08 : e > 0.75 ? (1 - e) / 0.25 : 1;
        b.flame.setAlpha(fin);
      }
      // 똥은 점점 까매지고 0.5 부터 쪼그라든다
      const shrink = e < 0.5 ? 1 : 1 - 0.7 * ((e - 0.5) / 0.5);
      b.ghost.setScale(b.sx * shrink, b.sy * shrink).setAlpha(e < 0.7 ? 1 : 1 - (e - 0.7) / 0.3);
      if (e >= 0.3) b.ghost.setTint(0x120c10);
      if (e >= 1) {
        this.discard(b.ghost);
        if (b.flame?.active) this.discard(b.flame);
      }
    }
    this.burns = this.burns.filter(b => b.ghost.active);
  }

  /**
   * **시카마루 — 그림자 흉내 (땅 판본).** 착지한 자리에서 쪼그려 쥐 인을 맺으면 발밑
   * 그림자에서 가닥 12개가 땅을 타고 뻗어, 위로 꺾여 똥을 하나씩 잡는다. 잡힌 똥은
   * 그 자리에 **뚝 멈춘다.** 전부 묶이면 0.5초 정적 — 그리고 한꺼번에 조여 터진다.
   *
   * 다른 일곱이 "순간에 지우는" 동안 시카마루만 **멈춤 → 정적 → 동시 소멸**의 박자다
   * (docs/fx-heidi-clone.md "시간축이 다른 둘").
   *
   *   0 ~ sealMs              쥐 인
   *   sealMs ~ +reach         가닥이 시차를 두고 뻗어 잡는다
   *   ~ +holdMs               정적
   *   squeeze                 조르기 → 끝
   */
  private startBind(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    p.blinkAt = undefined;
    this.startCutin(api, p, now, P.summonCutinMs, P.summonCutinInMs, P.summonCutinOutMs);
    p.ob.y = this.groundY;
    p.ob.setFlipX(false);
    this.play(p, 'bindSeal');
    p.jumpT0 = now;
    p.chainI = 0;                                   // 0 인 · 1 뻗음 · 2 정적 · 3 조르기
    this.bindPool = this.track(scene.add.graphics().setDepth(DEPTH_PUYO - 1));
    if (P.debugFinLog) console.log('[하이디] 그림자 흉내');
  }

  /**
   * 가닥 목표 — **화면 안의 일반 똥 전부** (bindMax 가 0 이 아니면 가장 아래부터 그 수만큼).
   * 단 땅 가까이 **이미 떨어져 내려온 똥은 뺀다** (bindMinRiseH — 화면 높이 대비)
   */
  private spawnBinds(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    const W = scene.scale.width;
    let pool = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
      .filter(q => q.active && q.y > 0 && q.y < this.groundY - scene.scale.height * P.bindMinRiseH
        && q.x > 0 && q.x < W)
      .sort((a, b) => b.y - a.y);
    if (P.bindMax > 0) pool = pool.slice(0, P.bindMax);
    // 많으면 간격을 줄여 총 시차가 bindStaggerSpan 을 넘지 않게
    const gap = pool.length > 1
      ? Math.min(P.bindStaggerMs, P.bindStaggerSpan / (pool.length - 1)) : 0;
    this.bindReachEnd = P.bindSealMs + P.bindCreepMs + P.bindDashMs + gap * Math.max(0, pool.length - 1);
    pool.forEach((q, i) => {
      this.binds.push({
        g: this.track(scene.add.graphics().setDepth(DEPTH_PUYO - 1)),
        t0: now + i * gap, q, tx: q.x, ty: q.y,
        sx: p.ob.x, sy: this.groundY, gw: 0, gh: 0, ph: Math.random() * Math.PI * 2,
        pr: p.size * 0.75 * 0.85,
      });
    });
    if (P.debugFinLog) console.log('[하이디] 그림자 가닥', pool.length);
  }

  private stepBind(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    if (this.cutin) this.stepCutin(scene, now);
    p.ob.y = this.groundY;
    if (this.nui) { this.stepNui(api, p, now); return; }
    const e = now - p.jumpT0;
    // 뻗기 전엔 아직 가닥 수를 모른다 — 최소 길이로 두고 뻗을 때 확정한다
    const reachEnd = (p.chainI ?? 0) === 0
      ? P.bindSealMs + P.bindCreepMs + P.bindDashMs : this.bindReachEnd;
    const squeezeAt = reachEnd + P.bindHoldMs;

    // 발밑 그림자 웅덩이 — 인을 맺는 동안 번지고, 조르기 뒤 걷힌다
    if (this.bindPool?.active) {
      const grow = Phaser.Math.Clamp(e / P.bindSealMs, 0, 1);
      const fade = e < squeezeAt ? 1 : Math.max(0, 1 - (e - squeezeAt) / P.bindSqueezeMs);
      this.bindPool.clear().fillStyle(P.bindColor, 0.75 * fade)
        .fillEllipse(p.ob.x, this.groundY - 2, p.size * (0.6 + 0.9 * grow), p.size * 0.22);
    }

    if ((p.chainI ?? 0) === 0 && e >= P.bindSealMs) {
      p.chainI = 1;
      this.spawnBinds(api, p, now);
    }
    if ((p.chainI ?? 0) === 1 && e >= reachEnd) p.chainI = 2;
    if ((p.chainI ?? 0) === 2 && e >= squeezeAt) {
      p.chainI = 3;
      this.squeezeBinds(api);
    }

    this.drawBinds(api, now, e >= squeezeAt ? (e - squeezeAt) / P.bindSqueezeMs : -1);

    if (e < squeezeAt + P.bindSqueezeMs) return;
    for (const b of this.binds) {
      if (b.g.active) this.discard(b.g);
      if (b.ghost?.active) this.discard(b.ghost);
    }
    this.binds = [];
    // 마무리 — 그림자 꿰매기 (사람 지시). 웅덩이는 그대로 두고 바닥 전체로 번진다
    this.nui = {
      t0: now, g: this.track(scene.add.graphics().setDepth(DEPTH_PUYO - 1)),
      picked: false, hits: 0, spikes: [], tags: [], lit: false,
    };
    if (P.debugFinLog) console.log('[하이디] 그림자 꿰매기');
  }

  /**
   * **시카마루 마무리 — 그림자 꿰매기.**
   *
   *   0 ~ nuiSpreadMs      발밑 그림자가 좌우로 번져 바닥 전체를 덮는다
   *   이후                 화면 안의 일반 똥마다(묶기가 빼 둔 **바닥 가까운 똥** 포함) 바로 아래에서
   *                        그림자 바늘이 솟아 꿰뚫는다 — 하이디에게 가까운 것부터 바깥으로
   *   끝                   바늘이 가라앉고 그림자가 걷힌다
   */
  /** 꿰뚫은 자리에 기폭찰을 붙인다 (tagMax 장까지 — 넘으면 점수만) */
  private stickTag(scene: Phaser.Scene, p: Puyo, x: number, y: number): void {
    const N = this.nui!;
    const P = HEIDI_PARAMS;
    if (N.tags.length >= P.tagMax) return;
    const key = fxPickSheetKey(HEIDI_FX_BOMBTAG);
    if (!scene.textures.exists(key)) return;
    const h = p.size * P.tagSize;
    const ob = this.track(scene.add.image(x, y, key, 0)
      .setDisplaySize(h * 96 / 160, h).setDepth(DEPTH_PUYO + 1)
      .setRotation((Math.random() - 0.5) * 0.5));
    N.tags.push({ ob, x, y, t0: Infinity, done: false });
  }

  /**
   * 기폭찰 — 불이 붙으면 tagBurnMs 동안 1→3 컷으로 타들어 가고, 다 타면 폭발한다.
   * 폭발 반경 안의 **남은** 똥을 날린다. 아직 남은 부적·폭발이 있으면 true
   */
  private stepTags(api: GameSceneAPI, now: number): boolean {
    const N = this.nui!;
    const P = HEIDI_PARAMS;
    const { scene } = api;
    let left = false;
    let n = 0;
    for (const t of N.tags) {
      if (t.done) continue;
      left = true;
      if (t.blast) {
        if (!t.blast.active) t.done = true;
        continue;
      }
      const el = now - t.t0;
      if (el < 0) continue;
      if (el < P.tagBurnMs) {
        t.ob.setFrame(1 + Math.min(2, Math.floor(el / P.tagBurnMs * 3)));
        continue;
      }
      // 폭발
      this.discard(t.ob);
      const key = fxPickSheetKey(HEIDI_FX_TAGBLAST);
      const d = api.player.displayHeight * P.tagBlastSize;
      if (scene.textures.exists(key)) {
        const b = this.track(scene.add.sprite(t.x, t.y, key, TAGBLAST_FRAMES[0]).setOrigin(0.5, 0.5)
          .setDisplaySize(d, d).setDepth(DEPTH_PUYO + 2));
        // 빠진 섬광 칸 대신 — 둥근 빛이 한 번 번진다 (bloom 의 십자 플레어도 피해 순수 글로우)
        //   폭발(6칸 0.3초)보다 짧게 끝나 폭발과 함께 확실히 걷힌다 — 기술 끝에 남지 않는다
        if (scene.textures.exists('fx_proc_glow')) {
          const fl = this.track(scene.add.image(t.x, t.y, 'fx_proc_glow').setTint(0xffd27a).setAlpha(0.9)
            .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH_PUYO + 2).setScale((d / 192) * 0.5));
          scene.tweens.add({
            targets: fl, scaleX: (d / 192) * 1.1, scaleY: (d / 192) * 1.1, alpha: 0, duration: 160,
            ease: 'Quad.easeOut', onComplete: () => this.discard(fl),
          });
        }
        const anim = this.animKey(HEIDI_FX_TAGBLAST);
        if (scene.anims.exists(anim)) {
          b.play({ key: anim }, true);
          b.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.discard(b));
        } else scene.time.delayedCall(400, () => this.discard(b));
        t.blast = b;
      } else t.done = true;
      const r = d * P.tagBlastR;
      for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
        if (!q.active) continue;
        if ((q.x - t.x) ** 2 + (q.y - t.y) ** 2 > r * r) continue;
        (q as unknown as PoolablePoopBase).recycle(true);
        n++;
      }
    }
    if (n > 0) this.awardBonus(api, n * P.tagBlastPoints);
    return left;
  }

  private stepNui(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    const N = this.nui!;
    const W = scene.scale.width, H = scene.scale.height;
    const gy = this.groundY;
    const e = now - N.t0;
    if (!N.picked && e >= P.nuiSpreadMs) {
      N.picked = true;
      const px = p.ob.x;
      const list = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[])
        .filter(q => q.active && q.y > 0 && q.y < gy && q.x > 0 && q.x < W)
        .sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px));
      const gap = list.length > 1
        ? Math.min(P.nuiStaggerMs, P.nuiStaggerSpan / (list.length - 1)) : 0;
      list.forEach((q, i) => N.spikes.push({
        bx: q.x, t0: now + i * gap, q, tx: q.x, ty: q.y, hit: false,
      }));
      // 똥이 적어도 바닥이 비어 보이지 않게 — 빈 바늘을 흩뿌린다
      for (let i = list.length; i < P.nuiMinSpikes; i++) {
        const x = W * (0.04 + 0.92 * Math.random());
        N.spikes.push({
          bx: x, t0: now + Math.random() * P.nuiStaggerSpan * 0.5,
          tx: x + (Math.random() - 0.5) * 20, ty: gy - H * (0.06 + 0.12 * Math.random()), hit: true,
        });
      }
    }
    // 바닥 그림자 — 좌우로 번진다
    const last = N.spikes.reduce((m, sp) => Math.max(m, sp.t0), N.t0 + P.nuiSpreadMs);
    const endAt = last - N.t0 + P.nuiRiseMs + P.nuiHoldMs + P.nuiFadeMs;
    const fade = Phaser.Math.Clamp((endAt - e) / P.nuiFadeMs, 0, 1);
    // 그림자가 걷히기 시작하면 기폭찰에 불이 붙는다 — 하이디에게 가까운 것부터
    if (N.picked && !N.lit && e >= endAt - P.nuiFadeMs) {
      N.lit = true;
      const px = p.ob.x;
      N.tags.sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px))
        .forEach((t, i) => { t.t0 = now + i * P.tagChainMs; });
    }
    const tagsLeft = this.stepTags(api, now);
    if (this.bindPool?.active) {
      const k = Phaser.Math.Clamp(e / P.nuiSpreadMs, 0, 1), u = 1 - (1 - k) * (1 - k);
      const x0 = p.ob.x * (1 - u), x1 = p.ob.x + (W - p.ob.x) * u;
      const h = p.size * 0.22;
      this.bindPool.clear().fillStyle(P.bindColor, 0.75 * fade)
        .fillEllipse(p.ob.x, gy - 2, p.size * 1.5, h)
        .fillRect(x0, gy - 2 - h * 0.3, x1 - x0, h * 0.6);
    }
    // 바늘 — 솟아서 꿰뚫고, 끝에 가라앉는다
    const g = N.g.clear();
    let n = 0;
    for (const sp of N.spikes) {
      const el = now - sp.t0;
      if (el < 0) continue;
      if (!sp.hit && sp.q?.active) { sp.tx = sp.q.x; sp.ty = sp.q.y; }
      const k = Math.min(1, el / P.nuiRiseMs);
      if (k >= 1 && !sp.hit) {
        sp.hit = true;
        const q = sp.q;
        if (q?.active) {
          burst(scene, q.x, q.y, 'shard', {
            count: 4, scale: 0.4, speed: 0.9, depth: DEPTH_PUYO + 1, blend: 'normal', tint: 0x20202c,
          });
          this.stickTag(scene, p, q.x, q.y);
          (q as unknown as PoolablePoopBase).recycle(true);
          n++;
        }
        sp.q = undefined;
      }
      const u = (1 - (1 - k) * (1 - k)) * fade;
      const tipX = sp.bx + (sp.tx - sp.bx) * u, tipY = gy + (sp.ty - gy) * u;
      const w = P.nuiW * (0.6 + 0.4 * fade);
      g.fillStyle(P.bindColor, 0.92).fillTriangle(sp.bx - w, gy, sp.bx + w, gy, tipX, tipY);
    }
    if (n > 0) {
      N.hits += n;
      this.awardBonus(api, n * P.nuiPoints);
    }
    if (e < endAt || tagsLeft) return;
    if (N.g.active) this.discard(N.g);
    this.nui = undefined;
    if (this.bindPool?.active) this.discard(this.bindPool);
    this.bindPool = undefined;
    this.play(p, 'walk');
  }

  /**
   * 가닥을 그린다. 발밑 → 땅을 타고 목표 x → 위로 꺾여 목표까지. 진행도만큼만 그린다.
   * 잡으면 그 똥을 조용히 회수하고 **멈춘 잔상**을 남긴다. squeeze(0~1)는 조르기 진행도
   */
  private drawBinds(api: GameSceneAPI, now: number, squeeze: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    for (const b of this.binds) {
      if (!b.g.active) continue;
      // 아직 안 잡았으면 목표는 떨어지는 똥을 따라간다
      if (!b.ghost && b.q?.active) { b.tx = b.q.x; b.ty = b.q.y; }
      const el = now - b.t0;
      const k = Phaser.Math.Clamp(el / (P.bindCreepMs + P.bindDashMs), 0, 1);
      if (k >= 1 && !b.ghost && b.q) {
        const q = b.q;
        if (q.active) {
          b.ghost = this.track(scene.add.image(q.x, q.y, q.texture.key, q.frame.name)
            .setDisplaySize(q.displayWidth, q.displayHeight).setRotation(q.rotation)
            .setDepth(DEPTH_PUYO + 1).setTint(0x4a4a60));
          b.gw = q.displayWidth; b.gh = q.displayHeight;
          (q as unknown as PoolablePoopBase).recycle(true);
        }
        b.q = undefined;
      }
      // **곡선 길.** 예전엔 땅을 타다 직각으로 꺾여 올라갔다 (사람 판정: 개선해 달라).
      // 이제 웅덩이 가장자리에서 땅을 따라 나오다(시작 접선 수평) 똥 아래에서 위로
      // 휘어 올라가는(끝 접선 수직) 3차 베지어다. 길이를 알아야 "몇 px 뻗었나"를 그리므로
      // 곡선을 24점으로 떠서 누적 길이를 잰다
      const dxs = b.tx - b.sx;
      const x0 = b.sx + Phaser.Math.Clamp(dxs, -b.pr, b.pr);
      const y0 = b.sy - 1;
      const rise = Math.max(0, y0 - b.ty);
      const c1x = x0 + (b.tx - x0) * 0.6, c1y = y0;             // 땅을 따라 나온다
      const c2x = b.tx, c2y = y0 - rise * 0.35;                 // 똥 아래에서 위로 선다
      const N = BIND_N;
      const cx = bindCx, cy = bindCy, cl = bindCl;
      cl[0] = 0;
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        cx[i] = u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b.tx;
        cy[i] = u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * b.ty;
        if (i > 0) cl[i] = cl[i - 1] + Math.hypot(cx[i] - cx[i - 1], cy[i] - cy[i - 1]);
      }
      const total = Math.max(1, cl[N]);
      // ① 꿈틀대며 조금 → ② 직선으로 나머지를 빠르게 (등속 — 감속하면 "쭉"이 안 산다)
      const creep = Math.min(P.bindCreepPx, total * 0.5);
      const k1 = Phaser.Math.Clamp(el / P.bindCreepMs, 0, 1);
      const k2 = Phaser.Math.Clamp((el - P.bindCreepMs) / P.bindDashMs, 0, 1);
      const len = el < P.bindCreepMs
        ? creep * (1 - (1 - k1) * (1 - k1))
        : creep + (total - creep) * k2;
      const alpha = squeeze < 0 ? 0.92 : 0.92 * Math.max(0, 1 - squeeze);
      b.g.clear();
      if (len <= 0 || alpha <= 0) continue;
      // **처음만 꿈틀댄다.** 곡선 길을 6px 마디로 나눠, 길을 따라 흐르는 물결로
      // 길의 **법선 방향**으로 흔든다. 흔들림은 뿌리에서 0, 머리로 갈수록 커지고
      // (뱀 머리처럼), ② 직선 구간이 시작되면 bindStraightenMs 안에 펴진다
      const straighten = Math.max(0, 1 - Math.max(0, el - P.bindCreepMs) / P.bindStraightenMs);
      const amp = P.bindWiggle * straighten;
      const seg = 6;
      let ci = 0;
      // 점을 모았다가 **굵기 3단**으로 나눠 그린다 — 마디마다 선을 따로 그으면 가닥 40개일 때
      // 프레임당 수천 번이 된다 (모바일에서 무겁다)
      // 점 객체는 버퍼에서 꺼내 다시 쓴다 (n = 이번 가닥의 점 수)
      let n = bindPut(0, x0, y0);
      for (let d = seg; d <= len + seg - 0.01; d += seg) {
        const s = Math.min(d, len);
        while (ci < N - 1 && cl[ci + 1] < s) ci++;
        const f = (s - cl[ci]) / Math.max(1e-6, cl[ci + 1] - cl[ci]);
        const bx = cx[ci] + (cx[ci + 1] - cx[ci]) * f;
        const by = cy[ci] + (cy[ci + 1] - cy[ci]) * f;
        // 법선 = 접선을 90° 돌린 것
        const tx = cx[ci + 1] - cx[ci], ty = cy[ci + 1] - cy[ci];
        const tl = Math.max(1e-6, Math.hypot(tx, ty));
        const head = Math.min(1, s / 60) * (0.5 + 0.5 * (s / Math.max(1, len)));
        const wave = Math.sin(s / P.bindWiggleLen * Math.PI * 2 - now * P.bindWiggleSpeed + b.ph);
        const off = wave * amp * head;
        n = bindPut(n, bx - (ty / tl) * off, by + (tx / tl) * off);
      }
      const bands = bindBands.length;
      const per = Math.ceil((n - 1) / bands);
      for (let i = 0; i < bands; i++) {
        const part = bindBands[i];
        part.length = 0;
        for (let j = i * per, end = Math.min(n, (i + 1) * per + 1); j < end; j++) part.push(bindPts[j]);
        if (part.length < 2) break;
        const w = Math.max(2, P.bindWidth * (1 - 0.6 * ((i + 0.5) / bands)));
        b.g.lineStyle(w, P.bindColor, alpha).strokePoints(part);
      }
      // 잡은 똥을 감은 고리
      if (b.ghost) {
        b.g.lineStyle(3, P.bindColor, alpha).strokeCircle(b.tx, b.ty,
          Math.max(6, b.ghost.displayWidth * 0.45 * (squeeze < 0 ? 1 : 1 - 0.6 * squeeze)));
      }
    }
    // 조르기 — 잡힌 똥이 옆으로 퍼지며 납작하게 찌그러져 사라진다
    if (squeeze >= 0) {
      const k = Math.min(1, squeeze);
      for (const b of this.binds) {
        const gh = b.ghost;
        if (!gh?.active) continue;
        gh.setDisplaySize(Math.max(1, b.gw * (1 + 0.35 * k)), Math.max(1, b.gh * (1 - 0.8 * k)))
          .setAlpha(1 - k);
      }
    }
  }

  /** 조르기 — 잡힌 똥 전부가 **한 박자에** 터진다 */
  private squeezeBinds(api: GameSceneAPI): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    let n = 0;
    for (const b of this.binds) {
      if (!b.ghost?.active) continue;
      n++;
      burst(scene, b.tx, b.ty, 'shard', {
        count: 5, scale: 0.45, speed: 0.9, depth: DEPTH_PUYO + 1, blend: 'normal', tint: 0x20202c,
      });
    }
    if (n > 0) {
      this.awardBonus(api, n * P.bindPoints);
      impact(scene, { hitstop: 70, shake: { duration: 220, intensity: 0.008 } });
    }
    if (P.debugFinLog) console.log('[하이디] 그림자 목 조르기', n);
  }

  /**
   * **쵸지 — 육탄전차 (땅 판본).** 착지한 자리에서 숨을 들이마셔 부풀다 공으로 말리고,
   * 거대한 공이 되어 땅을 한 번 왕복하며 **닿는 똥을 전부** 부순다 (한도 없음).
   *
   *   0 ~ inflateMs        배가술 — 컷마다 커지고, 표시 크기도 공 지름에 맞춰 키운다
   *   이후                 공 스프라이트로 바꿔 가운데 → 가까운 끝 → 반대 끝 → 가운데
   *   끝                   흰 연기 펑 → 원래 크기 쵸지로 걷는다
   */
  private startInflate(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    p.blinkAt = undefined;
    this.startCutin(api, p, now, P.summonCutinMs, P.summonCutinInMs, P.summonCutinOutMs);
    p.ob.y = this.groundY;
    p.ob.setFlipX(false);
    p.jumpT0 = now;
    this.play(p, 'inflate', now + P.inflateMs);
    if (P.debugFinLog) console.log('[하이디] 배가술');
  }

  /**
   * 배가술 끝 컷(공)의 지름은 칸의 약 48% 다 (choji_inflate 6번째 컷 실측 61x66 / 128).
   * 부푸는 동안 표시 크기를 그 비율로 키워, 공으로 바뀌는 순간 **같은 크기**가 되게 한다
   */
  private static readonly INFLATE_BALL_RATIO = 0.48;

  private stepRoll(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene, player } = api;
    if (this.cutin) this.stepCutin(scene, now);

    if (p.state === 'inflate') {
      p.ob.y = this.groundY;
      const k = Phaser.Math.Clamp((now - p.jumpT0) / P.inflateMs, 0, 1);
      const walk = player.displayHeight * P.puyoScale;
      const big = P.rollBallD / HeidiAbility.INFLATE_BALL_RATIO;
      p.size = walk + (big - walk) * (k * k);
      const file = this.sheetFor(p, SHEET_OF.inflate, 'inflate');
      const sc = sheetScale(file);
      const fix = HEIDI_SHEET_FIX[file] ?? 1;
      p.ob.setDisplaySize(p.size * sc.w * fix, p.size * sc.h * fix);
      if (now < p.stateUntil) return;
      this.startBall(api, p, now);
      return;
    }

    const b = this.ball;
    if (!b?.ob.active) { this.endRoll(api, p); return; }
    if (b.slam) { this.stepSlam(api, p, now); return; }
    const r = P.rollBallD / 2;
    const dt = scene.game.loop.delta / 1000;
    const W = scene.scale.width, H = scene.scale.height;
    const minX = r, maxX = W - r, minY = H * P.rollTopY + r, maxY = this.groundY - r;
    b.ob.x += b.vx * dt;
    b.ob.y += b.vy * dt;
    // 반사 — 어느 면에 닿았는지에 따라 속도 한 축을 뒤집는다
    let hitWall = false;
    if (b.ob.x < minX) { b.ob.x = minX; b.vx = Math.abs(b.vx); hitWall = true; }
    if (b.ob.x > maxX) { b.ob.x = maxX; b.vx = -Math.abs(b.vx); hitWall = true; }
    if (b.ob.y < minY) { b.ob.y = minY; b.vy = Math.abs(b.vy); hitWall = true; }
    if (b.ob.y > maxY) { b.ob.y = maxY; b.vy = -Math.abs(b.vy); hitWall = true; }
    if (hitWall) {
      impact(scene, { shake: { duration: 120, intensity: 0.005 } });
      burst(scene, b.ob.x, b.ob.y, 'smoke', {
        count: 4, scale: 0.55, speed: 0.8, depth: DEPTH_PUYO + 1, blend: 'normal',
      });
    }
    // 매우 빠르게 — 가로로 가는 쪽으로 돈다
    b.spin += Math.sign(b.vx || 1) * P.rollSpinRate * dt;
    b.ob.setRotation(b.spin);
    p.ob.x = b.ob.x;                                 // 본체도 같이 옮겨 둔다 (끝나면 그 자리)

    // 닿는 똥 전부 — 한도 없음. 공 반지름 + 똥 반지름쯤
    let n = 0;
    for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!q.active) continue;
      const reach = r + q.displayWidth * 0.4;
      if ((q.x - b.ob.x) ** 2 + (q.y - b.ob.y) ** 2 > reach * reach) continue;
      (q as unknown as PoolablePoopBase).recycle();   // 부서지는 이펙트는 똥 쪽이 낸다
      n++;
    }
    if (n > 0) this.awardBonus(api, n * P.rollPoints);

    // 잔상 — 공 그림을 반투명하게 남겼다 금방 지운다 (빠르게 날아다니는 느낌)
    if (now >= b.trailAt) {
      b.trailAt = now + P.rollTrailEvery;
      const ghost = this.track(scene.add.image(b.ob.x, b.ob.y, b.ob.texture.key, b.ob.frame.name)
        .setDisplaySize(b.ob.displayWidth, b.ob.displayHeight).setRotation(b.spin)
        .setDepth(DEPTH_PUYO - 1).setAlpha(0.35));
      b.trail.push({ ob: ghost, t0: now });
    }
    for (const t of b.trail) {
      const k = (now - t.t0) / 140;
      if (k >= 1) this.discard(t.ob);
      else t.ob.setAlpha(0.35 * (1 - k));
    }
    b.trail = b.trail.filter(t => t.ob.active);

    if (now - b.t0 < P.rollMs) return;
    // 마무리 — 초배가 내려찍기 (사람 지시). 공이 가운데 위로 솟으며 커졌다가 쿵
    b.slam = { t0: now, fx: b.ob.x, fy: b.ob.y, landed: false, reach: 0 };
  }

  /**
   * **쵸지 마무리 — 초배가 내려찍기.** 튕기기가 끝나면 공이 화면 가운데 위로 솟으며
   * 거대하게 부풀고(slamRiseMs), 잠깐 멈췄다가(slamHangMs) 바닥에 내리꽂힌다(slamDropMs).
   * 착지 자리에서 흙먼지 충격파가 좌우로 퍼지며 **앞선이 지나간 바닥 쪽** 똥을 날린다
   */
  private stepSlam(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    const b = this.ball!;
    const S = b.slam!;
    const W = scene.scale.width, H = scene.scale.height;
    const e = now - S.t0;
    const small = P.rollBallD / 0.85;
    const giant = W * P.slamBallW / 0.85;
    const tx = W / 2, topY = H * P.slamTopY;
    const tRise = P.slamRiseMs, tHang = tRise + P.slamHangMs, tDrop = tHang + P.slamDropMs;
    const tEnd = tDrop + P.slamWaveMs;
    if (e < tRise) {
      const k = e / tRise, u = 1 - (1 - k) * (1 - k);
      b.ob.setPosition(S.fx + (tx - S.fx) * u, S.fy + (topY - S.fy) * u);
      const d = small + (giant - small) * u;
      b.ob.setDisplaySize(d, d);
      b.spin += P.rollSpinRate * (1 - k) * scene.game.loop.delta / 1000;
      b.ob.setRotation(b.spin);
    } else if (e < tHang) {
      b.ob.setPosition(tx, topY).setDisplaySize(giant, giant);
    } else if (e < tDrop) {
      const k = (e - tHang) / P.slamDropMs;
      const land = this.groundY - (giant * 0.85) / 2;
      b.ob.setPosition(tx, topY + (land - topY) * k * k).setDisplaySize(giant, giant);
    } else {
      if (!S.landed) {
        S.landed = true;
        impact(scene, { hitstop: 100, flash: { color: 0xffb060, alpha: P.finFlashLast * 0.6, ms: P.finFlashMs } });
        const key = fxPickSheetKey(HEIDI_FX_CHOJISLAM);
        if (scene.textures.exists(key)) {
          const wave = this.track(scene.add.sprite(tx, this.groundY + 6, key, 0).setOrigin(0.5, 1)
            .setDepth(DEPTH_PUYO + 2));
          const anim = this.animKey(HEIDI_FX_CHOJISLAM);
          if (scene.anims.exists(anim)) wave.play({ key: anim }, true);
          S.wave = wave;
        }
        burst(scene, tx, this.groundY, 'smoke', {
          count: 12, scale: 1.2, speed: 1.6, depth: DEPTH_PUYO + 1, blend: 'normal', angle: { min: 180, max: 360 },
        });
      }
      const k = Math.min(1, (e - tDrop) / P.slamWaveMs);
      // 공 — 착지하며 납작하게 찌그러졌다가 줄어든다
      const d = giant * (1 - k) + small * k;
      b.ob.setPosition(tx, this.groundY - d * 0.85 * (1 - 0.3 * (1 - k)) / 2)
        .setDisplaySize(d * (1 + 0.25 * (1 - k)), d * (1 - 0.25 * (1 - k)));
      // 충격파 — 가로로 퍼지며 커진다 (그림 컷끼리 폭 차이가 작아 코드로 넓힌다)
      const grow = 1 - (1 - k) * (1 - k);
      const ww = W * P.slamWaveW * (0.45 + 0.55 * grow);
      S.wave?.setDisplaySize(ww, ww / 2);
      // 판정 — 앞선(반폭)이 새로 지나간 좌우 띠의 바닥 쪽 똥
      const reach = ww / 2;
      if (reach > S.reach) {
        const top = this.groundY - H * P.slamWaveH;
        let n = 0;
        for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
          if (!q.active || q.y < top) continue;
          if (Math.abs(q.x - tx) > reach) continue;
          (q as unknown as PoolablePoopBase).recycle();
          n++;
        }
        if (n > 0) this.awardBonus(api, n * P.rollPoints);
        S.reach = reach;
      }
    }
    // 공이 지나간 경로의 똥도 부순다 (솟고 떨어지는 동안)
    if (!S.landed) {
      const r = b.ob.displayWidth * 0.85 / 2;
      let n = 0;
      for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
        if (!q.active) continue;
        if ((q.x - b.ob.x) ** 2 + (q.y - b.ob.y) ** 2 > r * r) continue;
        (q as unknown as PoolablePoopBase).recycle();
        n++;
      }
      if (n > 0) this.awardBonus(api, n * P.rollPoints);
    }
    p.ob.x = b.ob.x;
    if (e < tEnd) return;
    if (S.wave?.active) this.discard(S.wave);
    this.endRoll(api, p);
  }

  /** 본체를 숨기고 공으로 바꾼다. 넓은 쪽 위로 비스듬히 튀어 오르며 시작한다 */
  private startBall(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    const tex = fxPickSheetKey(HEIDI_FX_CHOJIBALL);
    if (!scene.textures.exists(tex)) { this.endRoll(api, p); return; }
    const W = scene.scale.width;
    const r = P.rollBallD / 2;
    const x0 = p.ob.x;
    // 첫 방향 — 넓은 쪽 위로 비스듬히 튀어 오른다
    const side = x0 < W / 2 ? 1 : -1;
    const a = Phaser.Math.DegToRad(Phaser.Math.FloatBetween(35, 60));
    const vx = side * Math.cos(a) * P.rollSpeed, vy = -Math.sin(a) * P.rollSpeed;
    // 공 그림은 칸의 약 85% 가 공이다 — 표시 크기를 그만큼 크게
    const ob = this.track(scene.add.sprite(x0, this.groundY - r, tex, 0)
      .setDepth(DEPTH_PUYO).setDisplaySize(P.rollBallD / 0.85, P.rollBallD / 0.85));
    const anim = this.animKey(HEIDI_FX_CHOJIBALL);
    if (scene.anims.exists(anim)) ob.play(anim, true);
    this.ball = { ob, vx, vy, t0: now, trailAt: now, spin: 0, trail: [] };
    p.ob.setVisible(false);
    p.state = 'roll';
    impact(scene, { shake: { duration: 200, intensity: 0.006 } });
    if (P.debugFinLog) console.log('[하이디] 육탄전차');
  }

  /** 튕기기 끝 — 그 자리에서 흰 연기 펑, 바로 아래 땅에 원래 크기 쵸지로 내려서 걷는다 */
  private endRoll(api: GameSceneAPI, p: Puyo): void {
    const P = HEIDI_PARAMS;
    const b = this.ball;
    const x = b?.ob.x ?? p.ob.x;
    const y = b?.ob.y ?? this.groundY - P.rollBallD * 0.4;
    if (b?.ob.active) this.discard(b.ob);
    for (const t of b?.trail ?? []) if (t.ob.active) this.discard(t.ob);
    this.ball = undefined;
    burst(api.scene, x, y, 'poof', {
      count: 12, scale: 1.1, speed: 0.8, alpha: 1, lifespan: 0.7, depth: DEPTH_PUYO + 1, blend: 'normal',
    });
    p.ob.setVisible(true);
    p.ob.setPosition(x, this.groundY);
    p.size = api.player.displayHeight * P.puyoScale;
    this.play(p, 'walk');
  }

  /**
   * **오로치마루 — 삼중라생문 (땅 판본).** 착지한 자리에서 무릎 꿇고 땅을 치면 화면 폭을
   * 셋으로 나눈 자리에 도깨비 얼굴 문이 가운데부터 차례로 솟는다. 4초 동안 **문 윗면에
   * 떨어진 똥이 부서진다** — 문 아래가 지붕처럼 보호된다. 버티는 동안 금이 가고, 끝에 무너져 가라앉는다.
   */
  private startGate(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    p.blinkAt = undefined;
    this.startCutin(api, p, now, P.summonCutinMs, P.summonCutinInMs, P.summonCutinOutMs);
    p.ob.y = this.groundY;
    p.ob.setFlipX(false);
    p.jumpT0 = now;
    p.chainI = 0;                                  // 0 = 아직 안 부름 · 1 = 불렀음
    this.play(p, 'gateSummon');
    if (P.debugFinLog) console.log('[하이디] 삼중라생문');
  }

  private stepGate(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    if (this.cutin) this.stepCutin(scene, now);
    p.ob.y = this.groundY;
    if ((p.chainI ?? 0) === 0 && (now - p.jumpT0) / P.gatePoseMs >= P.gateRiseAt) {
      p.chainI = 1;
      this.raiseGates(api, now);
    }
    if (this.gates.length > 0) this.stepGates(api, now);
    if ((p.chainI ?? 0) === 1 && this.gates.length === 0) this.play(p, 'walk');
  }

  private raiseGates(api: GameSceneAPI, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    const tex = fxPickSheetKey(HEIDI_FX_GATE);
    if (!scene.textures.exists(tex)) return;
    const W = scene.scale.width;
    // 땅선 위만 보이게 — 문이 땅 속에서 올라오는 것처럼
    this.gateMask = this.track(scene.make.graphics({}, false));
    this.gateMask.fillStyle(0xffffff).fillRect(0, 0, W, this.groundY);
    const mask = this.gateMask.createGeometryMask();
    const gw = W / 3;
    const gh = gw * P.gateAspect;
    // 가운데 → 왼쪽 → 오른쪽 순으로 솟는다. 솟는 순서대로 제1(빨강)·제2(초록)·제3(파랑)문
    [1, 0, 2].forEach((col, order) => {
      const ob = this.track(scene.add.image(gw * (col + 0.5), this.groundY + gh, tex,
        order * HeidiAbility.GATE_FRAMES)
        .setOrigin(0.5, 1).setDisplaySize(gw * 0.98, gh).setDepth(0)
        .setMask(mask));
      // **플레이어 뒤, 배경 앞.** 플레이어와 배경이 둘 다 깊이 0 이라 깊이로는 끼울 수 없다 —
      // 같은 깊이는 표시 목록 순서로 그려지므로 플레이어 **바로 아래로 옮긴다**.
      // 예전엔 DEPTH_PUYO-1(5)이라 문이 하이디를 가렸다 (사람 판정)
      scene.children.moveBelow(ob as Phaser.GameObjects.GameObject, api.player as Phaser.GameObjects.GameObject);
      this.gates.push({ ob, x0: gw * col, x1: gw * (col + 1), t0: now + order * P.gateStagger, landed: false, kind: order });
    });
  }

  /** 문 하나의 컷 수 — 멀쩡 · 금 · 크게 금 · 쪼개짐 · 터짐 · 흩어짐 */
  private static readonly GATE_FRAMES = 6;
  /** 파편 색 — 문마다 제 색으로 튄다 */
  private static readonly GATE_DEBRIS = [0x8c2a24, 0x3d6a30, 0x34457e];

  /** 박살 — 그림의 터지는 컷에 **코드 파편**을 얹는다. 문 조각 · 먼지 · 흔들림 */
  private shatterGate(api: GameSceneAPI, g: { x0: number; x1: number; kind: number }): void {
    const { scene } = api;
    const gh = scene.scale.width / 3 * HEIDI_PARAMS.gateAspect;
    const cx = (g.x0 + g.x1) / 2, cy = this.groundY - gh * 0.5;
    burst(scene, cx, cy, 'shard', {
      count: 14, scale: 1.1, speed: 1.6, depth: DEPTH_PUYO + 1, blend: 'normal',
      tint: HeidiAbility.GATE_DEBRIS[g.kind],
    });
    burst(scene, cx, cy, 'shard', {
      count: 8, scale: 0.8, speed: 1.3, depth: DEPTH_PUYO + 1, blend: 'normal', tint: 0x2a2a30,
    });
    burst(scene, cx, this.groundY - gh * 0.3, 'smoke', {
      count: 8, scale: 0.9, speed: 1.1, depth: DEPTH_PUYO, blend: 'normal',
    });
    impact(scene, { hitstop: 40, shake: { duration: 220, intensity: 0.009 } });
  }

  private stepGates(api: GameSceneAPI, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    const gh = scene.scale.width / 3 * P.gateAspect;
    for (const g of this.gates) {
      const e = now - g.t0;
      if (e < 0) continue;
      const hold = P.gateRiseMs + P.gateHoldMs;
      // 솟기 → 버티기 → **박살**. 솟을 때 쿵, 끝에 터져 흩어진다 (가라앉지 않는다)
      const k = Math.min(1, e / P.gateRiseMs);
      const lift = 1 - (1 - k) * (1 - k) * (1 - k);
      if (e >= P.gateRiseMs && !g.landed) {
        g.landed = true;
        impact(scene, { shake: { duration: 180, intensity: 0.007 } });
        burst(scene, (g.x0 + g.x1) / 2, this.groundY - 6, 'smoke', {
          count: 6, scale: 0.7, speed: 0.9, depth: DEPTH_PUYO, blend: 'normal',
        });
      }
      g.ob.y = this.groundY + gh * (1 - lift);
      // 금 — 버티는 시간의 35% · 65% · 88% 에 한 단계씩. 끝나면 터지는 컷 → 흩어지는 컷
      const hk = (e - P.gateRiseMs) / P.gateHoldMs;
      const base = g.kind * HeidiAbility.GATE_FRAMES;
      if (e < hold) {
        g.ob.setFrame(base + (hk >= 0.88 ? 3 : hk >= 0.65 ? 2 : hk >= 0.35 ? 1 : 0));
      } else {
        const s = (e - hold) / P.gateShatterMs;
        if (!g.shattered) { g.shattered = true; this.shatterGate(api, g); }
        g.ob.setFrame(base + (s < 0.45 ? 4 : 5)).setAlpha(s < 0.45 ? 1 : Math.max(0, 1 - (s - 0.45) / 0.55));
      }

      // 막기 — 다 솟은 뒤 박살 나기 전까지, 윗면에 닿은 똥을 부순다
      if (lift >= 1 && e < hold) {
        const top = g.ob.y - gh;
        let n = 0;
        for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
          if (!q.active || q.x < g.x0 || q.x > g.x1) continue;
          if (q.y + q.displayHeight * 0.4 < top) continue;
          (q as unknown as PoolablePoopBase).recycle();   // 부서지는 이펙트는 똥 쪽이 낸다
          n++;
        }
        if (n > 0) this.awardBonus(api, n * P.gatePoints);
      }
      if (e >= hold + P.gateShatterMs) this.discard(g.ob);
    }
    this.gates = this.gates.filter(g => g.ob.active);
    if (this.gates.length === 0 && this.gateMask?.active) {
      this.discard(this.gateMask);
      this.gateMask = undefined;
    }
  }

  /**
   * **지라이야 — 화둔·가마유탄 (땅 판본).** 두루마리를 펼쳐 손을 짚으면 가마분타가
   * 거대한 흰 연기 펑 속에서 나타난다. 지라이야는 그 머리 위로 올라타고(그림 안에 있다), 가마분타가
   * 볼을 빵빵하게 부풀렸다가 입을 쩍 벌려 **기름을 V 자로 뿜고, 머리 위 지라이야가 불을
   * 뿜어 붙인다** — 불이 기름 줄기를 타고 번져 두 줄기 불길이 된다. 닿는 똥은 전부 탄다.
   * 끝나면 흰 연기 펑과 함께 사라진다.
   *
   *   떨어짐 → 착지 → 노려봄 → 머금기 → 기름 oilMs → 지라이야 불 breathMs
   *   → 점화(컷인) igniteMs → 불길 fireHoldMs → 펑
   */
  /**
   * **기본 뿌요 — 그림자 분신술 + 강화 아랑아.** 착지한 자리에서 인을 맺고(컷인),
   * 펑 하고 여덟 마리 흰 회오리 드릴이 되어 위쪽 부채꼴로 엇갈려 튀어나간다.
   * 드릴은 벽·천장·바닥을 cloneBounces 번 튕기고 그다음 벽에서 펑 하고 사라진다.
   * 다 사라지면 본체가 원래 자리에 다시 나타난다.
   */
  private startClone(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    p.blinkAt = undefined;
    p.ob.y = this.groundY;
    this.startCutin(api, p, now, P.summonCutinMs, P.summonCutinInMs, P.summonCutinOutMs);
    this.play(p, 'cloneJutsu', now + P.cloneSealMs);
    p.finFired = false;                           // 펑 했는가
    this.drills = [];
    this.cloneLeft = P.cloneTotal;
    if (P.debugFinLog) console.log('[하이디] 그림자 분신술');
  }

  private stepClone(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    if (this.cutin) this.stepCutin(scene, now);
    if (now < p.stateUntil) { p.ob.y = this.groundY; return; }

    // ① 펑 — 본체가 숨고 드릴 여덟이 나온다
    if (!p.finFired) {
      p.finFired = true;
      const key = fxPickSheetKey(HEIDI_PUYO_SHEETS.tsuga);
      if (!scene.textures.exists(key)) { this.endClone(api, p); return; }
      p.ob.setVisible(false);
      const W0 = scene.scale.width;
      const H0 = scene.scale.height;
      const n = P.cloneCount;
      impact(scene, { hitstop: 50, shake: { duration: 200, intensity: 0.006 } });
      // **분신이 화면 곳곳에 먼저 보인다** (사람 판정: "바닥 말고 곳곳에, 각자 자세를 잡고
      // 나서 아랑아"). 여덟이 서로 다른 자세 한 컷으로 펑 하고 나타나 잠깐 버틴다.
      // 자리는 서로 cloneMinGap 이상 떨어지게 뽑는다. 나타나는 박자와 튀어 나가는 순서는 섞는다
      const poseKey = fxPickSheetKey(HEIDI_FX_CLONEPOSE);
      const x0 = W0 * P.cloneEdgeW, x1 = W0 * (1 - P.cloneEdgeW);
      const y0 = P.cutinTopPx + H0 * P.cloneTopH, y1 = this.groundY - H0 * P.cloneBottomH;
      const spots: { x: number; y: number }[] = [];
      for (let tries = 0; spots.length < n && tries < 400; tries++) {
        const c = { x: Phaser.Math.FloatBetween(x0, x1), y: Phaser.Math.FloatBetween(y0, y1) };
        if (spots.every(q => Math.hypot(q.x - c.x, q.y - c.y) >= P.cloneMinGap)) spots.push(c);
      }
      while (spots.length < n) spots.push({ x: Phaser.Math.FloatBetween(x0, x1), y: Phaser.Math.FloatBetween(y0, y1) });
      const cx = W0 / 2, cy = (y0 + y1) / 2;
      const size = p.size * P.clonePoseScale;
      const order = Phaser.Utils.Array.Shuffle([...Array(n).keys()]);
      const poses = Phaser.Utils.Array.Shuffle([...Array(P.clonePoseFrames).keys()]);
      for (let i = 0; i < n; i++) {
        const { x, y } = spots[i];
        // 화면 반대편 쪽으로 — 가운데를 향한 방향을 조금 비튼다 (가로지르며 많이 쓸게)
        const toC = Math.hypot(cx - x, cy - y) > 30
          ? Math.atan2(cy - y, cx - x) : Phaser.Math.FloatBetween(-Math.PI, Math.PI);
        const a = toC + Phaser.Math.DegToRad(Phaser.Math.FloatBetween(-P.cloneAimJitterDeg, P.cloneAimJitterDeg));
        const ob = this.track(scene.add.image(x, y, poseKey, poses[i % P.clonePoseFrames]));
        ob.setDepth(DEPTH_PUYO + 1).setDisplaySize(size, size).setVisible(false)
          .setFlipX(Math.cos(a) > 0);             // 그림이 왼쪽을 본다 — 오른쪽으로 갈 놈은 뒤집는다
        this.drills.push({
          ob, vx: Math.cos(a) * P.cloneSpeed, vy: Math.sin(a) * P.cloneSpeed,
          at: now + P.clonePoseMs + order[i] * P.cloneStaggerMs, hits: 0,
          prev: { x, y }, out: false, posing: true,
          appear: now + Phaser.Math.Between(0, P.clonePoseJitterMs), size,
        });
      }
      return;
    }

    // ② 드릴 — 튕기며 누비다 사라진다
    const dt = scene.game.loop.delta / 1000;
    const W = scene.scale.width;
    const top = P.cutinTopPx;
    for (const d of this.drills) {
      if (d.out || !d.ob.active) continue;
      if (d.posing) {
        // 펑 하고 나타난다 — 처음 0.12초는 조금 커졌다 제자리로 (튀어나온 느낌)
        if (now < d.appear) continue;
        if (!d.ob.visible) {
          d.ob.setVisible(true);
          burst(scene, d.ob.x, d.ob.y, 'poof', {
            count: 4, scale: 0.8, speed: 0.7, alpha: 1, lifespan: 0.5, depth: DEPTH_PUYO + 2, blend: 'normal',
          });
        }
        const e = now - d.appear;
        const pop = e < 120 ? 1.25 - 0.25 * (e / 120) : 1 + 0.03 * Math.sin(e * 0.02);
        d.ob.setDisplaySize(d.size * pop, d.size * pop);
        if (now < d.at) continue;
        // 자세를 풀고 **회오리 드릴로** 튀어나간다 (Image 라 텍스처만 바꾸고 루프는 직접 돌린다)
        d.posing = false;
        const tKey = fxPickSheetKey(HEIDI_PUYO_SHEETS.tsuga);
        const w = p.size * P.cloneDrillW;
        d.ob.setTexture(tKey, 0).setFlipX(false)
          .setDisplaySize(w, w * (112 / 160)).setRotation(Math.atan2(d.vy, d.vx));
        d.at = now;
        burst(scene, d.ob.x, d.ob.y, 'streak', {
          count: 5, scale: 0.6, speed: 1.2, depth: DEPTH_PUYO + 1, blend: 'add', lifespan: 0.3,
        });
      }
      // 회오리 루프 — 이미지라 컷을 직접 넘긴다
      d.ob.setFrame(Math.floor((now - d.at) / (1000 / P.tsugaFps)) % 8);
      if (now - d.at > P.cloneMaxMs) { this.popDrill(api, d); continue; }
      let x = d.ob.x + d.vx * dt;
      let y = d.ob.y + d.vy * dt;
      const half = d.ob.displayWidth * 0.3;
      let bounced = false;
      if (x < half)          { x = half;          d.vx = Math.abs(d.vx);  bounced = true; }
      if (x > W - half)      { x = W - half;      d.vx = -Math.abs(d.vx); bounced = true; }
      if (y < top + half)    { y = top + half;    d.vy = Math.abs(d.vy);  bounced = true; }
      if (y > this.groundY - half * 0.6) { y = this.groundY - half * 0.6; d.vy = -Math.abs(d.vy); bounced = true; }
      d.ob.setPosition(x, y).setRotation(Math.atan2(d.vy, d.vx));
      // 판정 — 지나간 선분. 총량(cloneLeft)이 떨어지면 더 안 지운다
      if (this.cloneLeft > 0) {
        const got = this.hitPoops(api, d.prev.x, d.prev.y, x, y, P.cloneHitR, this.cloneLeft, P.clonePoints);
        this.cloneLeft -= got;
      }
      d.prev = { x, y };
      // 잔상 (평소 아랑아와 같은 목록 — 드릴이 여덟이라 간격을 두 배로)
      if (now >= this.tsugaTrailAt) {
        this.tsugaTrailAt = now + P.tsugaTrailEvery * 2;
        const g = this.track(scene.add.image(x, y, d.ob.texture.key, d.ob.frame.name)
          .setDisplaySize(d.ob.displayWidth, d.ob.displayHeight).setRotation(d.ob.rotation)
          .setDepth(DEPTH_PUYO).setAlpha(P.tsugaTrailAlpha));
        this.tsugaTrail.push({ ob: g, t0: now });
      }
      if (bounced) {
        d.hits++;
        if (d.hits > P.cloneBounces) { this.popDrill(api, d); continue; }
        burst(scene, x, y, 'streak', {
          count: 4, scale: 0.5, speed: 1.0, depth: DEPTH_PUYO + 1, blend: 'add', lifespan: 0.25,
        });
      }
    }
    if (this.drills.every(d => d.out || !d.ob.active)) this.endClone(api, p);
  }

  /** 드릴 하나가 펑 하고 사라진다 */
  private popDrill(api: GameSceneAPI, d: { ob: Phaser.GameObjects.Image; out: boolean }): void {
    d.out = true;
    burst(api.scene, d.ob.x, d.ob.y, 'poof', {
      count: 5, scale: 0.7, speed: 0.7, alpha: 1, lifespan: 0.45, depth: DEPTH_PUYO + 1, blend: 'normal',
    });
    this.discard(d.ob);
  }

  /** 분신술 끝 — 본체가 원래 자리에 펑 하고 나타나 걷는다 */
  private endClone(api: GameSceneAPI, p: Puyo): void {
    for (const d of this.drills) if (!d.out && d.ob.active) this.discard(d.ob);
    this.drills = [];
    p.ob.setVisible(true).setRotation(0);
    p.ob.y = this.groundY;
    burst(api.scene, p.ob.x, this.groundY - p.size * 0.4, 'poof', {
      count: 8, scale: 0.9, speed: 0.8, alpha: 1, lifespan: 0.5, depth: DEPTH_PUYO + 1, blend: 'normal',
    });
    this.dropCutin();
    p.form = undefined;
    this.play(p, 'walk');
  }

  /**
   * **스사노오** — 이타치 바로 뒤로 붉은 반투명 전사가 솟는다. 8컷을 susanooMs 에 한 번 펼치고
   * 올려 베는 컷(susanooSlashFrame)에 칼끝에서 검기를 날린다. 화면 가운데 쪽을 향해 벤다
   */
  private startSusanoo(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    const key = fxPickSheetKey(HEIDI_FX_SUSANOO);
    if (!scene.textures.exists(key)) return;
    const W = scene.scale.width;
    const size = W * P.susanooW;
    // **화면 끝에 선다** — 이타치가 있는 쪽 끝 (사람 지시: "양 끝으로"). 반대편을 향해 벤다
    const flip = p.ob.x > W / 2;                 // 오른쪽 끝에 서면 왼쪽을 본다
    const x = flip ? W - size * P.susanooEdge : size * P.susanooEdge;
    const ob = this.track(scene.add.sprite(x, this.groundY + 6, key, 0).setOrigin(0.5, 1)
      .setDisplaySize(size, size).setFlipX(flip).setAlpha(0).setDepth(0));
    // 하이디 뒤에 선다 (라생문과 같은 길)
    scene.children.moveBelow(ob as Phaser.GameObjects.GameObject, api.player as Phaser.GameObjects.GameObject);
    this.susanoo = { ob, t0: now, slashed: false, flip };
    if (P.debugFinLog) console.log('[하이디] 스사노오');
  }

  private stepSusanoo(api: GameSceneAPI, now: number): void {
    const S = this.susanoo;
    if (!S) return;
    const { scene } = api;
    const P = HEIDI_PARAMS;
    if (!S.ob.active) { this.susanoo = undefined; return; }
    const e = now - S.t0;
    const frame = Math.min(7, Math.floor(e / (P.susanooMs / 8)));
    S.ob.setFrame(frame);
    const fadeIn = Math.min(1, e / 250);
    const fadeOut = frame === 7 ? Math.max(0, 1 - (e - P.susanooMs * 7 / 8) / (P.susanooMs / 8)) : 1;
    S.ob.setAlpha(P.susanooAlpha * fadeIn * fadeOut);
    if (!S.slashed && frame >= P.susanooSlashFrame) {
      S.slashed = true;
      this.fireSwordWave(api, S);
      impact(scene, { hitstop: 80, flash: { color: 0xff3040, alpha: P.finFlashLast * 0.5, ms: P.finFlashMs } });
    }
    if (e < P.susanooMs) return;
    this.discard(S.ob);
    this.susanoo = undefined;
  }

  /** 검기 발사 — 칼끝(스사노오 어깨 위 앞쪽)에서 대각선 위로. 화면 가운데 쪽을 향한다 */
  private fireSwordWave(api: GameSceneAPI, S: { ob: Phaser.GameObjects.Sprite; flip: boolean }): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    const key = fxPickSheetKey(HEIDI_FX_SWORDWAVE);
    if (!scene.textures.exists(key)) return;
    const dir = S.flip ? -1 : 1;
    const h = S.ob.displayHeight;
    const x = S.ob.x + dir * h * P.swordWaveFromX;
    const y = this.groundY - h * P.swordWaveFromY;
    // **정반대편 위쪽 모서리**를 겨눈다 (사람 지시) — 화면을 대각선으로 끝까지 가로지른다
    const tx = S.flip ? 0 : scene.scale.width, ty = P.cutinTopPx;
    const a = Math.atan2(ty - y, tx - x);
    const sz = scene.scale.width * P.swordWaveW;
    const ob = this.track(scene.add.sprite(x, y, key, 0).setDisplaySize(sz, sz)
      .setRotation(a).setDepth(DEPTH_PUYO + 2));
    const anim = this.animKey(HEIDI_FX_SWORDWAVE);
    if (scene.anims.exists(anim)) ob.play({ key: anim }, true);
    this.swordWaves.push({
      ob, vx: Math.cos(a) * P.swordWaveSpeed, vy: Math.sin(a) * P.swordWaveSpeed, prev: { x, y },
    });
    burst(scene, x, y, 'ember', { count: 14, scale: 0.9, speed: 1.6, depth: DEPTH_PUYO + 2 });
  }

  private stepSwordWaves(api: GameSceneAPI): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    const dt = scene.game.loop.delta / 1000;
    const W = scene.scale.width, H = scene.scale.height;
    for (const w of this.swordWaves) {
      if (!w.ob.active) continue;
      const x = w.ob.x + w.vx * dt, y = w.ob.y + w.vy * dt;
      w.ob.setPosition(x, y);
      // 초승달 앞쪽 날이 지나간 선분을 벤다 (판정 반경 = 칼날 반 높이쯤)
      this.hitPoops(api, w.prev.x, w.prev.y, x, y, w.ob.displayHeight * P.swordWaveHitR, 0, P.swordWavePoints);
      w.prev = { x, y };
      const m = w.ob.displayWidth;
      if (x < -m || x > W + m || y < -m || y > H + m) this.discard(w.ob);
    }
    this.swordWaves = this.swordWaves.filter(w => w.ob.active);
  }

  private startToad(_api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    p.blinkAt = undefined;
    // 컷인은 여기서 띄우지 않는다 — **지라이야가 불을 붙이는 순간**으로 옮겼다 (합동의 한 박자)
    p.ob.y = this.groundY;
    p.ob.setFlipX(false);
    p.jumpT0 = now;
    p.chainI = 0;                                  // 0 = 아직 안 부름 · 1 = 불렀음
    this.play(p, 'toadSummon');
    if (P.debugFinLog) console.log('[하이디] 가마분타 소환');
  }

  private stepToad(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    if (this.cutin) this.stepCutin(scene, now);
    if (p.ob.visible) p.ob.y = this.groundY;
    if ((p.chainI ?? 0) === 0 && (now - p.jumpT0) / P.toadPoseMs >= P.toadCallAt) {
      p.chainI = 1;
      this.callToad(api, p, now);
      if (!this.toad) { this.play(p, 'walk'); return; }   // 그림이 없으면 조용히 끝
    }
    if (this.toad) this.stepToadBody(api, p, now);
  }

  private callToad(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const tex = fxPickSheetKey(HEIDI_FX_TOAD);
    if (!scene.textures.exists(tex)) return;
    const W = scene.scale.width;
    const w = W * HEIDI_PARAMS.toadW;
    const ob = this.track(scene.add.image(W / 2, this.groundY, tex, 0)
      .setOrigin(0.5, 1).setDisplaySize(w, w).setDepth(0).setAlpha(0));
    // 하이디(플레이어) 뒤, 배경 앞 — 라생문과 같은 이유로 깊이가 아니라 표시 순서로 끼운다
    scene.children.moveBelow(ob as Phaser.GameObjects.GameObject, api.player as Phaser.GameObjects.GameObject);
    this.toad = { ob, oils: [], fires: [], t0: now, x: W / 2, w, landed: false, ignited: false };
    // 두루마리를 **쾅** 찍는 순간 — 흙먼지 · 흔들림 · 흰 연기 펑 (소환의 신호)
    impact(scene, { hitstop: 40, shake: { duration: 180, intensity: 0.008 } });
    burst(scene, p.ob.x, this.groundY - 4, 'smoke', {
      count: 8, scale: 0.8, speed: 1.2, depth: DEPTH_PUYO, blend: 'normal',
      angle: { min: 180, max: 360 },
    });
    burst(scene, p.ob.x, this.groundY - 20, 'poof', {
      count: 12, scale: 1.1, speed: 0.9, alpha: 1, lifespan: 0.6, depth: DEPTH_PUYO + 1, blend: 'normal',
    });
    // **소환 연기** — 가마분타가 설 자리에 거대한 흰 연기가 펑. 그 속에서 나타난다
    for (const [dx, dy, sc] of [[0, 0.45, 2.6], [-0.28, 0.25, 1.9], [0.28, 0.25, 1.9], [0, 0.8, 2.0]]) {
      burst(scene, W / 2 + w * dx, this.groundY - w * dy, 'poof', {
        count: 14, scale: sc, speed: 1.1, alpha: 1, lifespan: 1.1, depth: DEPTH_PUYO + 1, blend: 'normal',
      });
    }
    impact(scene, { flash: { color: 0xffffff, alpha: 0.45, ms: HEIDI_PARAMS.finFlashMs } });
  }

  private stepToadBody(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    const t = this.toad;
    if (!t?.ob.active) return;
    // **기준 폭을 쓴다.** 예전엔 displayWidth 를 읽었는데, 나타나는 동안 크기를 줄여 두면
    // 다음 프레임이 그 줄어든 폭을 기준으로 또 줄여 가마분타가 0 으로 쪼그라들었다 (사람 판정: 사라짐)
    const w = t.w;
    const e = now - t.t0;
    const tLand = P.toadDropMs;
    const tIdle = tLand + P.toadLandMs;
    const tInhale = tIdle + P.toadIdleMs;
    const tFire = tInhale + P.toadInhaleMs;
    const tBreath = tFire + P.oilMs;
    const tIgnite = tBreath + P.breathMs;
    const tEnd = tIgnite + P.igniteMs + P.fireHoldMs;

    if (e < tLand) {
      // 연기 속에서 나타난다 — 처음 40% 는 연기뿐, 이후 납작하게 부풀며 드러난다 (착지 컷)
      const k = Math.max(0, (e - tLand * 0.4) / (tLand * 0.6));
      const pop = k < 1 ? 0.6 + 0.5 * Math.sin(k * Math.PI * 0.5) : 1;
      t.ob.setFrame(0).setY(this.groundY).setAlpha(Math.min(1, k * 1.6))
        .setDisplaySize(w * (0.7 + 0.35 * k), w * pop);
      return;
    }
    t.ob.setY(this.groundY).setAlpha(1).setDisplaySize(w, w);
    if (!t.landed) {
      t.landed = true;
      // 쿵 — 몸 아래 똥은 짓눌린다. 지라이야는 머리 위로 올라탄다 (그림 안의 지라이야)
      p.ob.setVisible(false);
      p.ob.x = t.x;
      impact(scene, { hitstop: 60, shake: { duration: 260, intensity: 0.012 } });
      burst(scene, t.x, this.groundY - 6, 'smoke', {
        count: 10, scale: 1.1, speed: 1.2, depth: DEPTH_PUYO, blend: 'normal',
      });
    }
    // **몸에 닿는 똥은 서 있는 내내 짓눌린다.** 예전엔 착지하는 순간 한 번만 지워서,
    // 4초 넘게 서 있는 동안 몸 위로 떨어진 똥이 그대로 통과했다 (사람 판정)
    {
      let n = 0;
      for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
        if (!q.active || Math.abs(q.x - t.x) > w * P.toadBodyHalfW
          || q.y < this.groundY - w * P.toadBodyH) continue;
        (q as unknown as PoolablePoopBase).recycle();
        n++;
      }
      if (n > 0) this.awardBonus(api, n * P.toadBodyPoints);
    }
    // 컷: 착지 · 곰방대 · 볼 빵빵 · 기름 · 지라이야 불 · 불타는 입
    t.ob.setFrame(e < tIdle ? 0 : e < tInhale ? 1 : e < tFire ? 2
      : e < tBreath ? 3 : e < tIgnite ? 4 : 5);

    // 화둔·가마유탄 — ① 기름 V 자 → ② 지라이야가 불을 뿜어 붙임(그림 5번째 컷)
    //                 → ③ 불이 기름을 타고 번져 V 자 불길
    const mx = t.x, my = this.groundY - w * (1 - P.toadMouthY);
    const jet = (file: string, deg: number, fire: boolean, frames: number) => {
      const key = fxPickSheetKey(file);
      const sp = this.track(scene.add.sprite(mx, my, key, 0).setOrigin(0.02, 0.5)
        .setRotation(Phaser.Math.DegToRad(deg)).setDepth(DEPTH_PUYO + 2).setDisplaySize(1, 1));
      if (fire) sp.setBlendMode(Phaser.BlendModes.ADD);
      const anim = this.animKey(file);
      if (scene.anims.exists(anim)) sp.play({ key: anim, startFrame: Phaser.Math.Between(0, frames - 1) }, true);
      return sp;
    };
    const ready = scene.textures.exists(fxPickSheetKey(HEIDI_FX_FIREJET))
      && scene.textures.exists(fxPickSheetKey(HEIDI_FX_OILJET));
    if (e >= tFire && e < tEnd && ready) {
      // ① 기름
      if (t.oils.length === 0) {
        t.oils = [jet(HEIDI_FX_OILJET, P.fireSweepFrom, false, 4)];
      }
      const ko = Math.min(1, (e - tFire) / P.oilMs);
      const oilLen = P.fireLen * (1 - (1 - ko) * (1 - ko));
      // ③ 점화 — 컷인 · 섬광 · 흔들림, 불이 기름을 타고 번진다
      if (e >= tIgnite && !t.ignited) {
        t.ignited = true;
        this.startCutin(api, p, now, P.summonCutinMs, P.summonCutinInMs, P.summonCutinOutMs);
        impact(scene, {
          hitstop: 50, shake: { duration: P.igniteMs + P.fireHoldMs, intensity: 0.005 },
          flash: { color: 0xffa040, alpha: 0.5, ms: P.finFlashMs },
        });
        burst(scene, mx, my, 'ember', { count: 14, scale: 0.9, speed: 1.4, depth: DEPTH_PUYO + 3 });
        t.fires = [jet(HEIDI_FX_FIREJET, P.fireSweepFrom, true, 6)];
      }
      // 불이 붙은 뒤 왼쪽 45° → 오른쪽 45° 로 **일정한 속도로** 천천히 옮겨 간다
      const ks = t.ignited ? Phaser.Math.Clamp((e - tIgnite) / (P.igniteMs + P.fireHoldMs), 0, 1) : 0;
      const aimDeg = P.fireSweepFrom + (P.fireSweepTo - P.fireSweepFrom) * ks;
      t.fires.forEach(f => f.setRotation(Phaser.Math.DegToRad(aimDeg)));
      const kf = t.ignited ? Math.min(1, (e - tIgnite) / P.igniteMs) : 0;
      const fireLen = P.fireLen * kf;
      const fadeOut = Math.min(1, (tEnd - e) / 250);
      // 불이 번진 앞쪽은 기름을 가린다 — 기름은 불보다 짧아지며 사라진다
      t.oils.forEach(o => o.setDisplaySize(Math.max(1, oilLen), P.fireH * 0.6)
        .setAlpha(1 - kf));
      t.fires.forEach(f => f.setDisplaySize(Math.max(1, fireLen), P.fireH).setAlpha(fadeOut));
      // 판정 — 불이 번진 만큼만
      if (fireLen > 0) {
        const r = Phaser.Math.DegToRad(aimDeg);
        this.hitPoops(api, mx, my, mx + Math.cos(r) * fireLen, my + Math.sin(r) * fireLen,
          P.fireR, 0, P.firePoints);
      }
    }
    if (e < tEnd) return;
    // 끝 — 흰 연기 펑, 가마분타가 사라지고 지라이야가 땅에 내려선다
    for (const o of [...t.oils, ...t.fires]) if (o.active) this.discard(o);
    burst(scene, t.x, this.groundY - w * 0.5, 'poof', {
      count: 16, scale: 1.6, speed: 1.0, alpha: 1, lifespan: 0.8, depth: DEPTH_PUYO + 1, blend: 'normal',
    });
    this.discard(t.ob);
    this.toad = undefined;
    p.ob.setVisible(true).setPosition(t.x, this.groundY);
    this.play(p, 'walk');
  }

  /** 치도리 구의 자리 — 앞발 (그림이 왼쪽을 보므로 뒤집히면 오른쪽) */
  private placeOrb(p: Puyo, g: number, alpha = 1): void {
    const orb = p.chidori;
    if (!orb?.active) return;
    const d = p.size * HEIDI_PARAMS.surgeOrb * g;
    // 정면 시트면 교차한 두 앞발 사이(가운데 아래), 옆모습 웅크림이면 앞발 쪽
    const front = !!HEIDI_CLONE_SHEETS[p.char ?? '']?.charge;
    if (front) {
      p.ob.setFlipX(false);
      // 천장에 거꾸로 매달리면 구도 발 아래(= 화면 아래쪽)로 뒤집힌다
      const up = p.ob.flipY ? 1 : -1;
      orb.setPosition(p.ob.x, p.ob.y + up * p.size * HEIDI_PARAMS.surgeOrbFrontY);
    } else {
      const dirX = p.ob.flipX ? 1 : -1;
      orb.setPosition(p.ob.x + dirX * p.size * 0.32, p.ob.y - p.size * 0.3);
    }
    orb.setDisplaySize(d, d).setAlpha(alpha);
  }

  private stepCharge(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const { scene } = api;
    if (this.cutin) this.stepCutin(scene, now);
    // 첫 장전은 땅, 다음부터는 치도리가 닿은 벽 자리에서 (공중)
    if (p.surgeFoot) p.ob.setPosition(p.surgeFoot.x, p.surgeFoot.y);
    else p.ob.y = this.groundY;
    const k = Phaser.Math.Clamp((now - p.jumpT0) / (p.surgeChargeMs ?? P.surgeChargeMs), 0, 1);
    // 자라는 모양: 처음엔 빠르게 붙고 끝으로 갈수록 꽉 찬다. 마지막 15% 는 떨린다
    const shiver = k > 0.85 ? 1 + 0.06 * Math.sin(now * 0.09) : 1;
    this.placeOrb(p, (0.25 + 0.75 * Math.sqrt(k)) * shiver);

    // 전기 조각 — 앞발에서 짧게 튄다 (streak 는 이미터 1개라 상한에 여유가 있다)
    if (now >= (p.throwAt ?? 0) && p.chidori?.active) {
      p.throwAt = now + P.surgeSparkEvery;
      burst(scene, p.chidori.x, p.chidori.y, 'streak', {
        count: 4 + Math.round(4 * k), scale: 0.45 + 0.35 * k, speed: 0.6 + 0.6 * k,
        depth: DEPTH_PUYO + 2, blend: 'add', tint: P.surgeTint, lifespan: 0.35,
      });
    }
    // 전기 지짐 — 반경 안 가장 가까운 똥 하나를 태운다
    if (now >= (p.cutT0 ?? 0) && (p.zapLeft ?? 0) > 0 && p.chidori?.active) {
      p.cutT0 = now + P.surgeZapEvery;
      const r = P.surgeZapR0 + (P.surgeZapR1 - P.surgeZapR0) * k;
      if (this.zapNearest(api, p.chidori.x, p.chidori.y, r, now)) p.zapLeft = (p.zapLeft ?? 1) - 1;
    }

    // 흔들림이 세 단계로 커진다 — 소리가 차오르는 대신
    const stage = k >= 0.66 ? 2 : k >= 0.33 ? 1 : 0;
    if ((p.chainI ?? 0) <= stage) {
      p.chainI = stage + 1;
      impact(scene, { shake: { duration: 650, intensity: 0.0015 + 0.0015 * stage } });
    }
    if (now < p.stateUntil) return;
    this.startLaunch(api, p, now);
  }

  /**
   * (x, y) 반경 r 안에서 **가장 가까운 일반 똥** 하나를 번개로 태운다. 태웠으면 true.
   *
   * 똥은 즉시 조용히 회수한다(판정·충돌에서 빠진다) — 타는 모습은 그 자리에 띄운
   * 잔상이 맡는다. 회수를 늦추면 타는 동안 플레이어가 닿아 죽는다
   * (네지 회천에서 정한 "무해화" 원칙과 같다).
   */
  private zapNearest(api: GameSceneAPI, x: number, y: number, r: number, now: number): boolean {
    const { scene } = api;
    let best: Phaser.Physics.Arcade.Sprite | undefined;
    let bestD = r * r;
    for (const q of api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!q.active) continue;
      const d = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y);
      if (d <= bestD) { bestD = d; best = q; }
    }
    if (!best) return false;
    const qx = best.x, qy = best.y;
    const ghost = this.track(scene.add.image(qx, qy, best.texture.key, best.frame.name)
      .setScale(best.scaleX, best.scaleY).setRotation(best.rotation)
      .setDepth(DEPTH_PUYO + 1).setTintFill(0xdff4ff));
    (best as unknown as PoolablePoopBase).recycle(true);
    this.awardBonus(api, HEIDI_PARAMS.cloneFinPoints);

    // 번개 가닥 — 구에서 똥까지 지그재그. 굵은 파랑 번짐 + 가는 흰 심지
    const g = this.track(scene.add.graphics().setDepth(DEPTH_PUYO + 2)
      .setBlendMode(Phaser.BlendModes.ADD));
    const n = 7;
    const dx = qx - x, dy = qy - y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len, ny = dx / len;
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const j = i === 0 || i === n ? 0 : Phaser.Math.FloatBetween(-1, 1) * Math.min(14, len * 0.12);
      pts.push(new Phaser.Math.Vector2(x + dx * t + nx * j, y + dy * t + ny * j));
    }
    // 7 / 2.5 에서 줄였다 (사람 판정: "조금만 얇게")
    g.lineStyle(4.5, 0x2f8cff, 0.55).strokePoints(pts);
    g.lineStyle(1.5, 0xeaf8ff, 1).strokePoints(pts);
    this.zaps.push({ g, ghost, t0: now, sx: best.scaleX, sy: best.scaleY });
    playFx(scene, 'bloom', qx, qy, { scale: 0.45, tint: HEIDI_PARAMS.surgeTint, depth: DEPTH_PUYO + 2 });
    return true;
  }

  /** 지짐 한 프레임 — 가닥은 깜빡이며 꺼지고, 똥은 번쩍 → 까맣게 타며 쪼그라든다 */
  private stepZaps(now: number): void {
    const ms = HEIDI_PARAMS.surgeZapMs;
    for (const z of this.zaps) {
      const e = Phaser.Math.Clamp((now - z.t0) / ms, 0, 1);
      if (z.g.active) z.g.setAlpha(e < 0.5 ? (Math.floor(now / 40) % 2 ? 1 : 0.55) : 2 * (1 - e));
      const gh = z.ghost;
      if (gh?.active) {
        if (e < 0.25) gh.setTintFill(0xdff4ff);            // 감전 — 청백 섬광
        else { gh.clearTint(); gh.setTint(0x1c2230); }     // 탄다 — 새까맣게
        const s = 1 - 0.55 * Math.max(0, (e - 0.25) / 0.75);
        gh.setScale(z.sx * s, z.sy * s).setAlpha(1 - Math.max(0, (e - 0.5) / 0.5));
      }
      if (e >= 1) {
        if (z.g.active) this.discard(z.g);
        if (gh?.active) this.discard(gh);
      }
    }
    this.zaps = this.zaps.filter(z => z.g.active);
  }

  /**
   * 치도리 — **장전 → 벽으로 돌진**을 세 번 (사람 지시: "가운데서 장전, 왼쪽이나 오른쪽 벽으로
   * 치도리, 장전 후 반대쪽 벽 살짝 위로, 또 장전 후 반대쪽 벽 좀 위로").
   *
   *   땅(가운데)에서 장전 surgeChargeMs → 좌·우 벽이나 천장의 먼 자리로 돌진
   *   벽에서 재장전 surgeRechargeMs    → 반대쪽 벽 [1] 높이로
   *   벽에서 재장전                    → 반대쪽 벽 [2] 높이로 → 잠깐 멈춤 → 착지
   *
   * 돌진마다 선을 따라 번개가 서고, 청백 섬광 잔상이 떠 있는 동안 선 위의 똥이 탄다
   * (비뢰신과 같은 잔상 판정)
   */
  private startLaunch(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    const W = scene.scale.width;
    const H = scene.scale.height;
    const n = p.surgeN ?? 0;
    if (n === 0) this.dropCutin();
    // 천장에 매달려 있었다면 먼저 바로 세운다 — 원점을 몸 가운데로 옮기며 보이는 자리는 그대로
    if (p.ob.flipY) {
      const off = p.ob.displayHeight * (FOOT_ORIGIN_Y - 0.5);
      p.ob.setFlipY(false).setOrigin(0.5, 0.5);
      p.ob.y += off;
    }
    this.play(p, 'launch');
    p.ob.setFlipX(false);
    this.centerOrigin(p, true);
    // 출발 = 몸 가운데. **닿을 자리는 좌·우 벽과 천장 위에서 고른다** — 지금 자리에서 멀고
    // 이미 들른 자리와도 먼 곳 (사람 판정: "좌우보다 좀 더 멀리멀리"). 예전엔 좌우 벽을
    // 번갈아 치며 높이만 조금씩 올라 거의 수평으로 짧게 갔다. 바닥 쪽은 안 간다 (끝에 착지한다)
    const fx = p.ob.x, fy = p.ob.y;
    const pad = p.size * P.surgeWallPad;
    const top = P.cutinTopPx + pad;
    const low = this.groundY - H * P.surgeFloorH;
    const seen = p.surgeSeen ?? [];
    let tx = W - pad, ty = (top + low) / 2, bestScore = -Infinity;
    for (let i = 0; i < 60; i++) {
      const side = Phaser.Math.Between(0, 2);            // 0 왼벽 · 1 오른벽 · 2 천장
      const cx = side === 0 ? pad : side === 1 ? W - pad : Phaser.Math.FloatBetween(pad, W - pad);
      const cy = side === 2 ? top : Phaser.Math.FloatBetween(top, low);
      let near = Infinity;
      for (const q of seen) near = Math.min(near, Math.hypot(cx - q.x, cy - q.y));
      const score = Math.hypot(cx - fx, cy - fy) + P.surgeSpreadW * near
        + Math.random() * P.surgeAimJitterPx;
      if (score > bestScore) { bestScore = score; tx = cx; ty = cy; }
    }
    seen.push({ x: tx, y: ty });
    p.surgeSeen = seen;
    p.from = { x: fx, y: fy };
    p.to = { x: tx, y: ty };
    p.cutT0 = now;
    p.finFired = false;                         // 이번 돌진이 벽에 닿았는가
    const ang = Math.atan2(ty - fy, tx - fx);
    p.ob.setRotation(ang + Math.PI / 2);        // 머리가 가는 쪽

    // 번개 — 선분을 따라 세운다 (세로 낙뢰 시트를 눕혀 길이에 맞춘다).
    // **여러 줄을 시간차로 겹친다** (사람 판정: "한 줄은 초라하다"). 줄마다 각도·옆 자리·굵기를
    // 조금씩 틀어 한 덩어리 번개 다발로 읽히게 한다. 첫 줄이 가장 밝고 뒤로 갈수록 옅다
    const len = Math.hypot(tx - fx, ty - fy);
    const nx = -Math.sin(ang), ny = Math.cos(ang);    // 선분의 옆 방향
    for (let k = 0; k < P.surgeBolts; k++) {
      const fire = () => {
        if (this.dead) return;
        const j = k === 0 ? 0 : Phaser.Math.FloatBetween(-1, 1);
        const off = k === 0 ? 0 : Phaser.Math.FloatBetween(-P.surgeBoltOffPx, P.surgeBoltOffPx);
        playFx(scene, 'boltBlue', fx + nx * off, fy + ny * off, {
          origin: [0.5, 1],
          scale: (len / 384) * 1.1 * (k === 0 ? 1 : Phaser.Math.FloatBetween(0.85, 1.1)),
          rotation: ang + Math.PI / 2 + Phaser.Math.DegToRad(j * P.surgeBoltJitterDeg),
          depth: DEPTH_PUYO + 2, alpha: k === 0 ? 1 : 0.75,
        });
      };
      if (k === 0) fire();
      else scene.time.delayedCall(k * P.surgeBoltGapMs, fire);
    }
    this.startTrail(scene, fx, fy, tx, ty, now, 0xffffff, P.surgeTint, P.surgeLegR, P.cloneFinPoints);
    const last = n + 1 >= P.surgeDashes;
    impact(scene, last
      ? { hitstop: 80, shake: { duration: 240, intensity: 0.010 },
          flash: { color: P.surgeTint, alpha: 0.6, ms: P.finFlashMs } }
      : { hitstop: 50, shake: { duration: 160, intensity: 0.006 },
          flash: { color: P.surgeTint, alpha: 0.35, ms: P.finFlashMs } });
    if (P.debugFinLog) console.log('[하이디] 치도리', n + 1, '/', P.surgeDashes);
  }

  private stepLaunch(api: GameSceneAPI, p: Puyo, now: number): void {
    const P = HEIDI_PARAMS;
    const e = now - (p.cutT0 ?? now);
    const k = Phaser.Math.Clamp(e / P.surgeLegMs, 0, 1);
    const ease = 1 - (1 - k) * (1 - k);          // 빠르게 튀어 나가 감속
    p.ob.setPosition(p.from.x + (p.to.x - p.from.x) * ease, p.from.y + (p.to.y - p.from.y) * ease);
    // 구는 **머리 앞**에 붙어 간다
    const orb = p.chidori;
    if (orb?.active) {
      const d = p.size * P.surgeOrb * P.surgeOrbStrike;
      const a = p.ob.rotation - Math.PI / 2;
      const r = p.ob.displayHeight * 0.45;
      orb.setPosition(p.ob.x + Math.cos(a) * r, p.ob.y + Math.sin(a) * r).setDisplaySize(d, d);
    }
    if (k < 1) return;
    const n = p.surgeN ?? 0;
    const last = n + 1 >= P.surgeDashes;
    if (!last) {
      // 벽에 닿았다 — 그 자리에 붙어 **재장전**
      this.centerOrigin(p, false);
      p.ob.setRotation(0);
      p.surgeFoot = { x: p.ob.x, y: p.ob.y };
      // **천장이면 거꾸로 매달린다** (사람 지시) — 그림을 위아래로 뒤집고 원점을 뒤집힌 발에
      // 맞춰 발바닥을 천장선에 붙인다. 뒤집힌 그림의 발은 칸 위쪽(1 - FOOT_ORIGIN_Y)에 있다
      const ceilY = HEIDI_PARAMS.cutinTopPx + p.size * HEIDI_PARAMS.surgeWallPad;
      if (p.to.y <= ceilY + 1) {
        p.ob.setFlipY(true).setOrigin(0.5, 1 - FOOT_ORIGIN_Y);
        p.surgeFoot = { x: p.ob.x, y: HEIDI_PARAMS.cutinTopPx };
      }
      p.surgeN = n + 1;
      burst(api.scene, p.to.x, p.to.y, 'streak', {
        count: 8, scale: 0.8, speed: 1.4, depth: DEPTH_PUYO + 2, blend: 'add',
        tint: P.surgeTint, lifespan: 0.35,
      });
      p.jumpT0 = now;
      p.throwAt = now;
      p.chainI = 0;
      p.cutT0 = now + P.surgeZapEvery;
      p.zapLeft = P.surgeRezapMax;
      p.surgeChargeMs = P.surgeRechargeMs;
      this.play(p, 'chargeC', now + P.surgeRechargeMs);
      return;
    }
    // 마지막 — 벽에서 잠깐 멈췄다가 착지
    if (!p.finFired) {
      p.finFired = true;
      burst(api.scene, p.to.x, p.to.y, 'streak', {
        count: 12, scale: 1.1, speed: 2.0, depth: DEPTH_PUYO + 2, blend: 'add',
        tint: P.surgeTint, lifespan: 0.45,
      });
    }
    if (e < P.surgeLegMs + P.surgeTopHoldMs) return;
    p.surgeFoot = undefined;
    this.dropDisc(p);                           // 구 회수 (원반과 같은 길)
    this.startFall(api, p, now);
  }

  /** 변신 ④ — 능력을 쓰고 땅으로 떨어진다. **변신은 유지한다** (그 캐릭터로 걸어 다닌다) */
  private startFall(api: GameSceneAPI, p: Puyo, now: number): void {
    const W = api.scene.scale.width;
    p.ob.anims.timeScale = 1;          // 소환 압축으로 빨라진 재생 속도를 되돌린다
    p.summon = false;
    p.finisher = false;
    p.size = api.player.displayHeight * HEIDI_PARAMS.travelScale;
    const half = api.player.displayHeight * HEIDI_PARAMS.puyoScale / 2;
    p.from = { x: p.ob.x, y: p.ob.y };
    p.to = {
      x: Phaser.Math.Clamp(p.ob.x, HEIDI_PARAMS.puyoMargin + half,
        W - HEIDI_PARAMS.puyoMargin - half),
      y: this.groundY,
    };
    p.jumpT0 = now;
    this.play(p, 'fall');
    // 고속 이동 시트 — 뒤집지 않고 머리를 떨어지는 쪽으로 돌린다. 회전축은 몸 가운데
    p.ob.setFlipX(false);
    this.centerOrigin(p, true);
    p.from = { x: p.ob.x, y: p.ob.y };
    p.prev = { x: p.from.x, y: p.from.y };
    // 도착점(몸 가운데 기준)을 여기서 확정하고 **각도도 한 번만** 정한다 — 일직선으로 꽂힌다
    p.to = { x: p.to.x, y: this.groundY - p.ob.displayHeight * (FOOT_ORIGIN_Y - 0.5) };
    p.ob.setRotation(Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x) + Math.PI / 2);
  }

  /**
   * 원점을 몸 가운데(회전용) ↔ 발바닥(땅에 서는 용)으로 바꾼다. **보이는 자리는 그대로 둔다** —
   * 원점만 바꾸면 그림이 반 장 튄다. 가운데 원점일 때 좌표 = 몸 가운데.
   */
  private centerOrigin(p: Puyo, center: boolean): void {
    const off = p.ob.displayHeight * (FOOT_ORIGIN_Y - 0.5);
    const isCenter = p.ob.originY === 0.5;
    if (center === isCenter) return;
    p.ob.setOrigin(0.5, center ? 0.5 : FOOT_ORIGIN_Y);
    p.ob.y += center ? -off : off;
  }

  private stepFall(api: GameSceneAPI, p: Puyo, now: number): void {
    const k = Phaser.Math.Clamp((now - p.jumpT0) / HEIDI_PARAMS.landMs, 0, 1);
    const e = k * k;                    // 떨어질수록 빨라진다
    // **일직선.** x·y 에 같은 진행도를 써야 휘지 않는다 (예전엔 x 등속·y 가속이라 휘었다)
    const x = p.from.x + (p.to.x - p.from.x) * e;
    const y = p.from.y + (p.to.y - p.from.y) * e;
    p.ob.setPosition(x, y);
    p.prev = { x, y };
    if (k < 1) return;
    p.ob.setRotation(0);
    this.centerOrigin(p, false);
    p.ob.y = this.groundY;
    p.ob.setFlipX(p.dir > 0);
    p.size = api.player.displayHeight * HEIDI_PARAMS.puyoScale;   // 걷는 크기로
    burst(api.scene, p.ob.x, this.groundY, 'smoke', {
      count: 5, scale: 0.45, speed: 0.6, depth: DEPTH_PUYO - 1, blend: 'normal',
    });
    this.transforming = false;
    this.play(p, 'walk');
    if (p.blinkAt === -1) {
      p.blinkAt = now + (p.form === 'surge' ? HEIDI_PARAMS.surgeLandDelayMs
        : p.form === 'deflect' ? HEIDI_PARAMS.kaitenLandDelayMs
        : p.form === 'ignite' ? HEIDI_PARAMS.igniteLandDelayMs
        : p.form === 'bind' ? HEIDI_PARAMS.bindLandDelayMs
        : p.form === 'roll' ? HEIDI_PARAMS.rollLandDelayMs
        : p.form === 'gate' ? HEIDI_PARAMS.gateLandDelayMs
        : p.form === 'toad' ? HEIDI_PARAMS.toadLandDelayMs
        : p.form === 'clone' ? HEIDI_PARAMS.cloneLandDelayMs
        : HEIDI_PARAMS.blinkWalkMs);
    }
    if (HEIDI_PARAMS.debugFinLog) console.log('[하이디] 변신 4 착지 ·', p.char, '로 걷는다');
  }

  private stepRise(api: GameSceneAPI, p: Puyo, now: number): void {
    const { scene } = api;
    const u = Phaser.Math.Clamp((now - p.jumpT0) / HEIDI_PARAMS.cloneRiseMs, 0, 1);
    const x = Phaser.Math.Linear(p.from.x, p.to.x, u);
    // 솟구치기는 **일직선**이다. 포물선으로 휘면 매 프레임 각도가 바뀌어 빙글 도는 것처럼
    // 보였다 (사람 판정). 각도는 출발 때 한 번만 정한다 (startTransform)
    const arc = p.state === 'soar' ? 0
      : scene.scale.height * HEIDI_PARAMS.puyoRiseH * 4 * u * (1 - u);
    const y = Phaser.Math.Linear(p.from.y, p.to.y, u) - arc;
    p.ob.setPosition(x, y);
    this.smashPoops(api, p, p.prev.x, p.prev.y, x, y);
    p.prev = { x, y };
    if (u >= 1) this.startSeal(api, p, now);
  }

  /** 날아가는 무기 — 이동 · 명중 · 회수 */
  private stepWeapons(api: GameSceneAPI): void {
    const { scene } = api;
    const dt = scene.game.loop.delta / 1000;
    const W = scene.scale.width;
    const H = scene.scale.height;

    for (const w of this.weapons) {
      if (w.dead || !w.ob.active) continue;
      if (w.vx === 0 && w.vy === 0) continue;        // 꽂힌 표식은 가만히 있는다

      w.prev = { x: w.ob.x, y: w.ob.y };
      if (w.grav) w.vy += w.grav * dt;
      w.ob.x += w.vx * dt;
      w.ob.y += w.vy * dt;
      // 회전하지 않는 날붙이는 **가는 방향**을 본다 — 중력으로 처지는 동안 코가 같이 숙는다
      if (w.spin) w.ob.rotation += w.spin * dt;
      else w.ob.setRotation(Math.atan2(w.vy, w.vx) + Math.PI / 2);

      // 남은 무기는 회천이 튕겨 낸 똥 하나뿐이다
      this.stepBounce(api, w);
      // **바깥 검사를 건너뛰면 안 된다** — 튕긴 똥은 화면 밖까지 날아가는 게 정상이라,
      // 여기서 안 죽이면 회수가 안 돼 계속 남는다
      if (w.ob.x < -40 || w.ob.x > W + 40 || w.ob.y < -40 || w.ob.y > H + 40) w.dead = true;
    }

    for (const w of this.weapons) if (w.dead && w.ob.active) this.discard(w.ob);
    this.weapons = this.weapons.filter(w => !w.dead && w.ob.active);
  }


  /**
   * 붙은 자리를 매 프레임 다시 잡는다.
   *
   * 바닥선이 프레임마다 바뀌므로 벽에 붙은 놈은 따라 움직여야 한다 (천장은 절대 좌표).
   * 던지기·대기·기술·소멸이 전부 붙은 채로 도는 상태라 한 곳으로 모았다.
   */
  private holdPerch(p: Puyo, _scene: Phaser.Scene): void {
    if (p.to) p.ob.setPosition(p.to.x, p.to.y);
  }

  /**
   * 회천 반경 안의 똥을 **총알로 바꿔** 바깥으로 날린다.
   *
   * 원래 똥은 `recycle(true)` 로 조용히 회수한다 — 그룹에 둔 채 날리면
   * 플레이어와의 overlap 이 살아 있어서 **자기 기술에 자기가 죽는다.**
   * 대신 같은 자리에 연출용 스프라이트를 띄우고 판정은 우리가 직접 한다
   * (하이디 무기가 이미 그 길이다).
   */
  private deflectPoops(
    api: GameSceneAPI, p: Puyo, at?: { x: number; y: number }, first = true,
    total: number = HEIDI_PARAMS.deflectTotal,
    r: number = HEIDI_PARAMS.deflectR,
  ): void {
    const { scene } = api;
    const P = HEIDI_PARAMS;
    const cx = at?.x ?? p.ob.x;
    const cy = at?.y ?? p.ob.y;
    let n = 0;
    // 회천(땅 판본)은 도는 동안 여러 번 부른다 — 총량은 **처음 한 번만** 채운다
    if (first) this.deflectLeft = total;
    if (this.deflectLeft <= 0) return;

    for (const ob of (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice()) {
      if (!ob.active) continue;
      const dx = ob.x - cx;
      const dy = ob.y - cy;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;

      // 연출용 스프라이트 — **원래 똥과 같은 텍스처**를 써야 "저게 아까 그 똥"으로 읽힌다
      const shot = scene.add.sprite(ob.x, ob.y, ob.texture.key, ob.frame.name)
        .setDepth(DEPTH_PUYO + 1)
        .setDisplaySize(ob.displayWidth, ob.displayHeight)
        .setTint(P.deflectTint);      // 연보라 오러 = "이건 이제 내 편"이라는 표시
      this.track(shot);

      // 중심에서 바깥으로. 똥이 정확히 중심에 겹쳐 있으면 방향이 없으니 위로 보낸다
      const a = d > 1 ? Math.atan2(dy, dx) : -Math.PI / 2;
      this.weapons.push({
        ob: shot, kind: 'bounce',
        vx: Math.cos(a) * P.deflectSpeed,
        vy: Math.sin(a) * P.deflectSpeed,
        grav: 0, spin: P.deflectSpin,
        prev: { x: ob.x, y: ob.y },
        pierce: P.deflectPierce,
      });

      (ob as unknown as PoolablePoopBase).recycle(true);   // 터뜨리지 않는다 — 날아간 것이다
      n++;
      if (n >= P.deflectMax || n >= this.deflectLeft) break;
    }

    if (n > 0) this.awardBonus(api, n * P.cloneFinPoints);
    this.deflectLeft = Math.max(0, this.deflectLeft - n);
  }

  /**
   * 튕겨 나간 똥 한 발. 지나간 선분 위의 똥을 친다.
   *
   * **맞은 똥은 총알이 되지 않는다 (연쇄 1단).** 되면 똥이 많은 판에서 무한히 번진다.
   */
  private stepBounce(api: GameSceneAPI, w: Weapon): void {
    // 관통 상한과 **총량 상한** 중 작은 쪽. 총량을 다 쓰면 총알은 그냥 날아만 간다
    const limit = Math.min(w.pierce ?? 1, this.deflectLeft);
    if (limit <= 0) return;
    const hit = this.hitPoops(api, w.prev.x, w.prev.y, w.ob.x, w.ob.y,
      HEIDI_PARAMS.deflectHitR, limit, HEIDI_PARAMS.deflectChainPts);
    if (hit > 0) {
      this.deflectLeft -= hit;
      burst(api.scene, w.ob.x, w.ob.y, 'shard', {
        count: 4, speed: 0.8, scale: 0.45, depth: DEPTH_PUYO, blend: 'normal',
      });
      w.pierce = (w.pierce ?? 1) - hit;
      if ((w.pierce ?? 0) <= 0) w.dead = true;   // 다 쓴 총알은 멈춘다
    }
  }

  /**
   * **컷인을 올린다** — 암전 · 레터박스 · 일러스트 세 겹.
   *
   * 어센트류의 정체는 이펙트가 아니라 **화면 점유**다. 기존 컷신은 화면의 2.9% 만
   * 썼다 (360x640 에서 개+원반이 111px). 같은 그림을 그대로 두고도 뒤를 덮는 것만으로
   * 체감이 갈린다 — 사람 판정: "메이플 어센트 쓰는 느낌이 아닌데?"
   *
   * 일러스트가 없는 캐릭터는 여기 안 들어온다. 미나토만 `cutin` 을 갖고 있고
   * 나머지 일곱은 지금까지대로 4컷을 돈다.
   */
  /**
   * 만화 칸 모양 — 윗변·왼변은 곧게, **오른변·아랫변은 지그재그**, 통째로 조금 기운다.
   * 좌표는 칸 왼쪽 위(0, 0) 기준. 톱니 높이는 매번 조금씩 달라 손으로 오린 느낌이 난다
   */
  private mangaPanel(pw: number, ph: number): { x: number; y: number }[] {
    const P = HEIDI_PARAMS;
    const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }, { x: pw, y: 0 }];
    const jag = () => P.cutinZigAmp * Phaser.Math.FloatBetween(0.5, 1);
    // 오른변 (위 → 아래) — 안쪽·바깥쪽으로 번갈아
    for (let k = 1; k < P.cutinZigRight; k++) {
      pts.push({ x: pw + (k % 2 ? -jag() : jag() * 0.4), y: ph * k / P.cutinZigRight });
    }
    pts.push({ x: pw, y: ph });
    // 아랫변 (오른쪽 → 왼쪽)
    for (let k = 1; k < P.cutinZigBottom; k++) {
      pts.push({ x: pw * (1 - k / P.cutinZigBottom), y: ph + (k % 2 ? -jag() : jag() * 0.4) });
    }
    pts.push({ x: 0, y: ph });
    // 칸 가운데를 축으로 기울인다
    const a = Phaser.Math.DegToRad(P.cutinTiltDeg);
    const cx = pw / 2, cy = ph / 2, c = Math.cos(a), sn = Math.sin(a);
    return pts.map(q => ({
      x: cx + (q.x - cx) * c - (q.y - cy) * sn,
      y: cy + (q.x - cx) * sn + (q.y - cy) * c,
    }));
  }

  private startCutin(
    api: GameSceneAPI, p: Puyo, now: number,
    ms: number = HEIDI_PARAMS.cutinMs,
    inMs: number = HEIDI_PARAMS.cutinInMs,
    outMs: number = HEIDI_PARAMS.cutinOutMs,
  ): boolean {
    const { scene } = api;
    const file = HEIDI_CLONE_SHEETS[p.char ?? '']?.cutin;
    if (!file) return false;
    const tex = fxPickSheetKey(file);
    if (!scene.textures.exists(tex)) return false;

    const P = HEIDI_PARAMS;
    const W = scene.scale.width;
    const D = P.cutinDepth;
    // **만화 칸 한 컷** (사람 지시: "크기 때문에 불편 — 왼쪽 위에 만화 한 컷처럼, 반듯한 칸 말고
    // 테두리는 뭉툭한 검은 칸, 선은 지그재그"). 화면 전체 암전·무적은 없앴다 — 칸이 작다
    const pw = W * P.cutinPanelW;
    const ph = pw * P.cutinPanelAspect;
    // 테두리는 선 가운데가 칸 가장자리에 온다 — 반 두께만큼 들여야 **바깥 끝이** 화면 왼끝·점수칸
    // 아랫선에 딱 닿는다 (사람 지시: "윗변과 왼변은 직각으로 딱 맞게")
    const edge = (P.cutinBorder + P.cutinRim * 2) / 2;
    const x = P.cutinMarginX + edge, y = P.cutinTopPx + P.cutinTopGap + edge;
    const poly = this.mangaPanel(pw, ph);

    // 그림 — 칸보다 조금 크게 띄우고 **얼굴이 칸 가운데** 오게 민다. 칸 밖은 마스크가 자른다
    const img = scene.add.image(0, 0, tex).setScrollFactor(0).setDepth(D);
    const ih = ph * P.cutinImgOver;
    const iw = ih * (img.width / img.height);
    img.setDisplaySize(iw, ih);
    const face = P.cutinFaceX[p.char ?? ''] ?? 0.5;
    const ix = Phaser.Math.Clamp(pw / 2 - (face - 0.5) * iw, pw - iw / 2, iw / 2);
    const iy = ph / 2;

    const maskG = this.track(scene.make.graphics({}, false));
    maskG.fillStyle(0xffffff, 1).fillPoints(poly, true, true);
    img.setMask(maskG.createGeometryMask());

    // 테두리 — 흰 테 위에 굵은 검은 선. 꼭짓점마다 원을 찍어 모서리를 뭉툭하게 만든다
    const border = scene.add.graphics().setScrollFactor(0).setDepth(D + 1);
    const ring = (w: number, c: number) => {
      border.lineStyle(w, c, 1).strokePoints(poly, true, true);
      border.fillStyle(c, 1);
      for (const q of poly) border.fillCircle(q.x, q.y, w / 2);
    };
    ring(P.cutinBorder + P.cutinRim * 2, 0xffffff);
    ring(P.cutinBorder, 0x000000);

    this.track(img);
    this.track(border);
    this.cutin = { t0: now, img, border, maskG, x, y, pw, ix, iy, ms, inMs, outMs };
    this.stepCutin(scene, now);   // 첫 프레임부터 화면 밖 자리에서 시작한다

    // **가릴 거면 멈춘다.** 컷인 900ms 동안 똥이 180px(화면의 28%) 내려가므로,
    // 안 멈추면 걷혔을 때 **보던 화면이 아니다** (사람 실기 판정).
    //
    // 처음엔 `physics.world.pause()` 를 썼다가 **안티치트에 걸렸다** —
    // GameScene.ts 의 [레이어 4] 가 `physics.world.isPaused` 를 치트로 본다
    // (치트 shield 루프가 물리를 반복 정지시키는 수법이라서). 방어를 우회할 게 아니라
    // **물리를 안 멈추고 같은 결과를 내야 한다.**
    //
    // 그래서 **똥의 속도만 0 으로 눕혀 두고 원래 값을 기억**한다. 물리는 계속 돌고
    // (`isPaused` 는 false), 화면만 정지한 것처럼 보인다
    if (HEIDI_PARAMS.cutinFreeze) this.freezePoops(api);
    return true;
  }

  /**
   * 컷인 동안 똥을 세운다 — **`body.moves` 를 끈다. 속도는 건드리지 않는다.**
   *
   * 처음엔 속도를 0 으로 눕혔다가 **특수똥이 영영 멈추는 버그**를 만들었다.
   * 피버는 화면의 똥을 **속도째 복사**해서 무지개똥으로 되살리는데
   * (GameScene.ts:1041 · :1077), 눕혀 둔 0 을 그대로 복사하면
   * `0 x 배수 = 0` 짜리 무지개똥이 태어난다. 원래 똥은 recycle 돼서 복구 목록에서도
   * 빠지므로 되살릴 방법이 없다. 마무리가 점수를 주니 컷인 중 피버는 충분히 일어난다.
   *
   * `moves = false` 는 물리가 그 바디를 안 굴릴 뿐 **속도 값은 그대로 남는다** —
   * 피버가 읽어도 진짜 속도가 읽힌다. `physics.world.isPaused` 도 안 건드리니
   * 안티치트에도 안 걸린다.
   *
   * **특수똥 네 그룹도 같이 멈춘다.** 일반 똥만 멈추면 컷인 뒤에 금똥만 순간이동한 꼴이 된다.
   */
  private freezePoops(api: GameSceneAPI): void {
    this.frozen = [api.poops, api.goldPoops, api.diamondPoops,
                   api.topazPoops, api.rainbowPoops];
    this.setPoopsMoving(false);
  }

  /**
   * 다시 떨어뜨린다. **빠뜨리면 화면의 똥이 영영 멈춘다.**
   *
   * 기억해 둔 개체 목록이 아니라 **그룹을 다시 훑는다** — 그 사이 회수됐다가
   * 풀에서 재사용된 놈은 `moves` 가 꺼진 채로 되살아나기 때문이다
   * (`Body.reset()` 은 위치와 속도만 되돌리고 `moves` 는 안 건드린다).
   */
  private thawPoops(): void {
    this.setPoopsMoving(true);
    this.frozen = undefined;
  }

  private setPoopsMoving(moving: boolean): void {
    for (const g of this.frozen ?? []) {
      for (const ob of g.getChildren()) {
        const b = (ob as Phaser.Physics.Arcade.Sprite).body as Phaser.Physics.Arcade.Body | null;
        if (b) b.moves = moving;
      }
    }
  }

  /**
   * 컷인 한 프레임. 원반과 같이 **시간 하나에서 전부 뽑는다** — 트윈을 걸지 않는다.
   *
   *   들어옴  cutinInMs   옆에서 밀려오며 나타난다
   *   머묾    나머지      아주 천천히 반대로 흐른다 (정지 사진으로 안 보이게)
   *   나감    cutinOutMs  반대쪽으로 빠지며 사라진다
   */
  private stepCutin(scene: Phaser.Scene, now: number): void {
    const c = this.cutin;
    if (!c) return;
    if (!c.img.active) { this.cutin = undefined; return; }

    const { ms, inMs, outMs } = c;
    const e = now - c.t0;
    if (e >= ms) { this.dropCutin(); return; }
    const k = e < inMs ? e / inMs
      : e > ms - outMs ? (ms - e) / outMs
      : 1;
    const ease = k * k * (3 - 2 * k);        // smoothstep — 딱딱한 등속을 피한다

    void ease;
    // 들어올 때는 왼쪽 밖에서 **툭 튀어 들어와 살짝 넘쳤다 제자리** (ease-out-back),
    // 나갈 때는 왼쪽으로 빨려 나간다
    const out = c.x + c.pw + 40;
    let dx: number;
    if (e < inMs) {
      const u = e / inMs - 1;
      const back = 1 + 2.4 * u * u * u + 1.4 * u * u;
      dx = -out * (1 - back);
    } else if (e > ms - outMs) {
      const u = (e - (ms - outMs)) / outMs;
      dx = -out * u * u;
    } else dx = 0;
    const px = c.x + dx, py = c.y;
    c.border.setPosition(px, py);
    c.maskG.setPosition(px, py);
    c.img.setPosition(px + c.ix, py + c.iy);
    void scene;
  }

  /** 컷인을 걷는다. 세 겹을 한꺼번에 반납한다 */
  private dropCutin(): void {
    const c = this.cutin;
    if (!c) return;
    this.cutin = undefined;
    c.img.clearMask();
    for (const ob of [c.img, c.border, c.maskG]) this.discard(ob);
    this.thawPoops();
  }

  /** 원반을 먼저 반납한다. 보험 타이머가 있지만 화면에 남는 시간이 아깝다 */
  private dropDisc(p: Puyo): void {
    p.disc?.destroy();
    p.disc = undefined;
    p.chidori?.destroy();
    p.chidori = undefined;
    p.dome?.destroy();
    p.dome = undefined;
  }

  /**
   * 선분 위의 **일반 똥**을 지우고 개수를 돌려준다.
   *
   * `limit` 이 1 이면 첫 하나만 (수리검). 0 이면 전부 (폭발·고속 이동).
   * 점 판정으로 하면 프레임이 밀릴 때 똥을 뚫고 지나간다 — 참새에서 두 번 겪었다.
   */
  private hitPoops(
    api: GameSceneAPI, ax: number, ay: number, bx: number, by: number,
    r: number, limit: number, points: number = HEIDI_PARAMS.wpnPoints,
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const r2 = r * r;
    const list = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice();
    let n = 0;
    for (const q of list) {
      if (!q.active) continue;
      const rx = q.x - ax;
      const ry = q.y - ay;
      const t = len2 > 0 ? Math.min(1, Math.max(0, (rx * dx + ry * dy) / len2)) : 0;
      const px = rx - t * dx;
      const py = ry - t * dy;
      if (px * px + py * py > r2) continue;
      (q as unknown as PoolablePoopBase).recycle();
      n++;
      if (limit > 0 && n >= limit) break;
    }
    if (n > 0) this.awardBonus(api, n * points);
    return n;
  }

  private discard(ob: Phaser.GameObjects.GameObject): void {
    this.tracked.delete(ob);
    ob.destroy();
  }

  // ── 똥 ────────────────────────────────────────────────────────────
  /**
   * 점프 선분 위의 **일반 똥**을 부수고 개수만큼 점수를 준다.
   *
   * 지난 프레임 좌표와 잇는 **점-선분 거리 판정**이다 — 한 프레임에 수십 px 을
   * 움직이므로 현재 위치만 보면 똥을 뚫고 지나간다 (테드 낙하와 같은 구조).
   *
   * 금·다이아·토파즈·무지개는 건드리지 않는다 — `api.poops` 가 일반 똥 전용 그룹이라
   * 구조적으로 닿지 않는다. 그건 플레이어가 먹어야 하는 보너스라 없애면 뺏는 것이 된다.
   */
  private smashPoops(
    api: GameSceneAPI, p: Puyo, ax: number, ay: number, bx: number, by: number,
  ): void {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // 내려오는 날라차기는 뻗은 발만큼 판정이 넓다
    const r = p.state === 'kick' ? HEIDI_PARAMS.puyoKickHitR : HEIDI_PARAMS.puyoHitR;
    const r2 = r * r;

    const hit = (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter(p => {
      if (!p.active) return false;
      const rx = p.x - ax;
      const ry = p.y - ay;
      const t = len2 > 0 ? Math.min(1, Math.max(0, (rx * dx + ry * dy) / len2)) : 0;
      const px = rx - t * dx;
      const py = ry - t * dy;
      return px * px + py * py <= r2;
    });
    if (hit.length === 0) return;

    // 타격 이펙트는 recycle() 안에서 이미 나간다 — 여기서 또 깔면 상한만 잡아먹는다
    for (const p of hit) (p as unknown as PoolablePoopBase).recycle();

    // **빗장이 먼저다** — awardBonus 가 주는 동안 자기 보너스로 들어온 마일스톤을
    // 삼킨다. 예전에는 `lastFireScore += bonus` 로 기준선을 올렸는데, 그러면
    // 올린 만큼 **정상 마일스톤까지 삼켰다** (레드·테드에서 같은 결함을 고쳤다)
    this.awardBonus(api, hit.length
      * (p.state === 'kick' ? HEIDI_PARAMS.puyoKickPoints : HEIDI_PARAMS.puyoPoints));
  }

  // ── 보조 ──────────────────────────────────────────────────────────
  /** 상태 전환 = 시트 교체. 표시 크기는 텍스처가 바뀌어도 유지돼야 한다 */
  private play(p: Puyo, state: PuyoState, until = 0): void {
    const puyo = p.ob;
    p.state = state;
    p.stateUntil = until;

    // 기술 상태는 **캐릭터 시트 쪽 키가 다르다** — 전용 정면 시트가 있으면 그것,
    // 없으면 SHEET_OF 의 기본 동작으로 떨어진다
    const finKey = state === 'jump' || state === 'wall' || state === 'kick' ? 'tsuga'
      : state === 'chargeC' ? 'charge'
      : state === 'byakugan' || state === 'kaiten' ? 'spin'
      : state === 'hakke' ? 'hakke'
      : state === 'mangekyo' ? 'eye'
      : state === 'bindSeal' ? 'bind'
      : state === 'inflate' ? 'inflate'
      : state === 'gateSummon' ? 'gate'
      : state === 'toadSummon' ? 'summon'
      : SHEET_OF[state];
    const sheet = this.sheetFor(p, SHEET_OF[state], finKey);
    const anim = this.animKey(sheet);
    if (!puyo.scene.anims.exists(anim)) return;
    puyo.play({ key: anim }, true);
    // **기준 크기에서 다시 계산한다.** 직전 표시 크기를 물려받으면 배율이 곱해져 쌓인다.
    // 칸이 커진 만큼 크게 띄운다 — 그래야 개가 동작마다 같은 크기로 보인다
    const k = sheetScale(sheet);
    // 칸 안에 작게 그려진 캐릭터 시트는 키워 띄운다 (HEIDI_SHEET_FIX — 실측 표)
    const fix = HEIDI_SHEET_FIX[sheet] ?? 1;
    puyo.setDisplaySize(p.size * k.w * fix, p.size * k.h * fix);
  }

  /**
   * 이 뿌요가 쓸 시트. **캐릭터 것이 있으면 그것, 없으면 기본 뿌요**로 떨어진다.
   *
   * 조용히 떨어지는 것이 중요하다 — 캐릭터 시트를 한 장씩 그려 넣는 동안에도
   * 게임이 돌아야 한다. 없는 시트를 참조하면 능력이 통째로 죽는다.
   */
  private sheetFor(
    p: Puyo, key: keyof typeof HEIDI_PUYO_SHEETS, cloneKey: string = key,
  ): string {
    const base = HEIDI_PUYO_SHEETS[key];
    if (!p.char) return base;
    const set = HEIDI_CLONE_SHEETS[p.char];
    if (!set) return base;
    const file = (set as Record<string, string | undefined>)[cloneKey];
    if (!file) return base;
    const anim = this.animKey(file);
    return p.ob.scene.anims.exists(anim) ? file : base;
  }

  private animKey(sheet: string): string {
    return `heidi_${sheet.replace(/_\d+x\d+\.png$/, '')}`;
  }

  /**
   * `loadFxPickSheet` 는 텍스처만 올리고 애니메이션은 만들지 않는다.
   * 루프가 필요한 쪽은 여기서 직접 등록한다 (레드와 같은 길).
   */
  private registerAnims(scene: Phaser.Scene): void {
    const def = (
      sheet: string,
      span: { start: number; end: number; fps: number; frames?: readonly number[] },
      repeat: number,
    ) => {
      const texKey = fxPickSheetKey(sheet);
      if (!scene.textures.exists(texKey)) return;
      const key = this.animKey(sheet);
      if (scene.anims.exists(key)) return;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(texKey,
          span.frames ? { frames: [...span.frames] } : { start: span.start, end: span.end }),
        frameRate: span.fps,
        repeat,
      });
    };
    def(HEIDI_PUYO_SHEETS.walk,   PUYO_WALK,   -1);
    def(HEIDI_PUYO_SHEETS.idle,   PUYO_IDLE,   -1);
    def(HEIDI_PUYO_SHEETS.crouch, PUYO_CROUCH,  0);
    def(HEIDI_PUYO_SHEETS.jump,   PUYO_JUMP,    0);
    def(HEIDI_PUYO_SHEETS.kick,   PUYO_KICK,    0);
    def(HEIDI_PUYO_SHEETS.wall,   PUYO_WALL,    0);
    def(HEIDI_PUYO_SHEETS.throw,  PUYO_THROW,   0);
    def(HEIDI_PUYO_SHEETS.dash,   PUYO_DASH,    0);
    // 아마테라스 — 까마귀 날갯짓, 검은 불 (둘 다 루프)
    def(HEIDI_FX_RASENGAN,   { start: 0, end: 7, fps: 20 }, -1);
    def(HEIDI_FX_SWORDWAVE,  { start: 0, end: 7, fps: 18 }, -1);
    // 폭발 시트 0·1칸(tagblast)·1칸(rasenblast)은 바퀴살처럼 뻗는 섬광이라 건너뛴다
    // (방사형 빛살 금지 — 대표 지시 2026-10-07). 시트는 그대로 두고 재생 칸만 뺀다
    def(HEIDI_FX_TAGBLAST,   { start: 0, end: 7, fps: HEIDI_PARAMS.tagBlastFps, frames: TAGBLAST_FRAMES }, 0);
    def(HEIDI_FX_CHOJISLAM,  { start: 0, end: 7, fps: 8 / (HEIDI_PARAMS.slamWaveMs / 1000) }, 0);
    def(HEIDI_FX_PALM,       { start: 0, end: 7, fps: 16 }, 0);   // 22 → 16 — 너무 빨라 안 보였다
    def(HEIDI_FX_RASENBLAST, {
      start: 0, end: 7, fps: RASENBLAST_FRAMES.length / (HEIDI_PARAMS.rasenBlastMs / 1000), frames: RASENBLAST_FRAMES,
    }, 0);
    def(HEIDI_FX_CROW,      { start: 0, end: 5, fps: 14 }, -1);
    def(HEIDI_FX_AMATERASU, { start: 0, end: 7, fps: 14 }, -1);
    def(HEIDI_FX_CHOJIBALL, { start: 0, end: 3, fps: 8 }, -1);
    // 라생문은 금 가는 컷을 코드가 시간으로 고른다 — 애니메이션을 등록하지 않는다
    // 가마분타도 컷을 코드가 고른다. 화염 줄기만 루프
    def(HEIDI_FX_FIREJET, { start: 0, end: 5, fps: 16 }, -1);
    def(HEIDI_FX_OILJET,  { start: 0, end: 3, fps: 12 }, -1);
    def(HEIDI_PUYO_SHEETS.tsuga,
      { start: 0, end: 7, fps: HEIDI_PARAMS.tsugaFps }, -1);
    def(HEIDI_PUYO_SHEETS.seal,
      { start: 0, end: PUYO_SEAL_FRAMES - 1, fps: HEIDI_PARAMS.sealFps }, 0);
    // 캐릭터 시트 — **텍스처가 올라온 것만** 등록된다 (def 안에서 걸러진다).
    // 아직 안 그린 캐릭터는 자동으로 기본 뿌요로 떨어진다
    for (const c of HEIDI_CLONE_CHARS) {
      const set = HEIDI_CLONE_SHEETS[c];
      if (!set) continue;
      if (set.wall) def(set.wall,  PUYO_WALL,  0);
      if (set.throw) def(set.throw, PUYO_THROW, 0);
      if (set.dash) def(set.dash,  PUYO_DASH,  0);
      // 배회 동작 — 변신한 캐릭터가 뿌요로 돌아다닐 때 쓴다
      if (set.walk)   def(set.walk,   PUYO_WALK,   -1);
      if (set.tsuga)  def(set.tsuga,  { start: 0, end: 7, fps: HEIDI_PARAMS.tsugaFps }, -1);
      if (set.hakke)  def(set.hakke,  { start: 0, end: 5, fps: 12 }, -1);   // 팔괘 64장 연타 (루프)
      if (set.idle)   def(set.idle,   PUYO_IDLE,   -1);
      if (set.crouch) def(set.crouch, PUYO_CROUCH,  0);
      if (set.jump)   def(set.jump,   PUYO_JUMP,    0);
      if (set.kick)   def(set.kick,   PUYO_KICK,    0);
      // 인 맺기 — 변신한 채로 다음 변신의 인을 맺는다. 기본 뿌요와 같은 6컷·같은 속도
      if (set.seal) {
        def(set.seal, { start: 0, end: PUYO_SEAL_FRAMES - 1, fps: HEIDI_PARAMS.sealFps }, 0);
      }
      // 모으기 6컷은 **모으는 시간 전체에 한 번 펼친다** — 털이 컷마다 더 솟으므로
      // 구가 자라는 것과 박자가 맞는다. fps 를 chargeMs 에서 역산한다
      // 만화경 6컷 — eyeMs 에 한 번 펼친다
      // 쥐 인 6컷 — bindSealMs 에 한 번 펼치고 끝 컷에서 멈춘다
      // 배가술 6컷 — inflateMs 에 한 번 펼치고 끝(공) 컷에서 멈춘다
      // 땅 짚기 6컷 — gatePoseMs 에 한 번 펼치고 끝 컷에서 멈춘다
      // 두루마리 소환 8컷 — toadPoseMs 에 한 번 펼치고 끝 컷에서 멈춘다. 두루마리가 개와 떨어져
      // 날아서 칸이 크다 (176x208, 발바닥은 칸의 118/128 자리 — 다른 시트와 같다)
      if (set.summon) {
        def(set.summon, { start: 0, end: 7, fps: 8 / (HEIDI_PARAMS.toadPoseMs / 1000) }, 0);
      }
      if (set.gate) {
        def(set.gate, { start: 0, end: 5, fps: 6 / (HEIDI_PARAMS.gatePoseMs / 1000) }, 0);
      }
      if (set.inflate) {
        def(set.inflate, { start: 0, end: 5, fps: 6 / (HEIDI_PARAMS.inflateMs / 1000) }, 0);
      }
      if (set.bind) {
        def(set.bind, { start: 0, end: 5, fps: 6 / (HEIDI_PARAMS.bindSealMs / 1000) }, 0);
      }
      if (set.eye) {
        def(set.eye, { start: 0, end: 5, fps: 6 / (HEIDI_PARAMS.eyeMs / 1000) }, 0);
      }
      // 회천 한 바퀴 — 계속 돈다
      if (set.spin) {
        def(set.spin, { start: 0, end: PUYO_SPIN_FRAMES - 1, fps: HEIDI_PARAMS.kaitenFps }, -1);
      }
      if (set.charge) {
        def(set.charge, {
          start: 0, end: PUYO_CHARGE_FRAMES - 1,
          fps: PUYO_CHARGE_FRAMES / (HEIDI_PARAMS.surgeChargeMs / 1000),
        }, 0);
      }
    }
  }
}
