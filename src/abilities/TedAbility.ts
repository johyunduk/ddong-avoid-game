import Phaser from 'phaser';
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import { getGroundFx, type GroundFx } from '../utils/background';
import type PoolablePoopBase from '../objects/PoolablePoopBase';
import { TED_PARAMS } from '../config/abilityParams';
import { TED_CHARGE_CUBE } from '../config/tedChargeCube.gen';
import { fxPickSheetKey, burst, fxSprite, playFx, impact } from '../utils/vfx';


/** 액티브 연출 레이어 — 말(5)·똥(0) 위, 화면 섬광(320) 아래 */
const ASCENT_DEPTH = 212;
/** `proc-ring.png` 에서 밝은 선이 있는 **지름**(px). 링 배율을 이걸로 나눠야
 *  보이는 링과 지워지는 범위가 맞는다 (레드 포효에서 짚은 함정) */
const RING_ART_D = 174.8;

/**
 * 밑동 더미 · 균열 텍스처 — 판 시작 때 코드로 **한 번** 굽는다 (말마다 그리지 않는다).
 * 이번 판 배경의 땅 팔레트(utils/background getGroundFx)로 굽는다 — 4톤 하드 엣지 (반투명 가장자리 없음),
 * 화면 1:1 크기. 재질(material)마다 모양이 갈린다:
 *   soil     흙더미(가운데가 솟은 흙 덩이 + 튄 알갱이) + 들쭉날쭉한 균열
 *   snow     둥근 눈 더미 + 균열 대신 옆으로 튄 눈 덩이
 *   concrete 각진 파편 + 곧게 금 간 균열 (곁가지)
 *   stone    돌 조각 몇 개 + 균열
 * 더미는 바닥선이 LAND_MOUND_ORIGIN_Y 에 온다 — 말이 기울어 잘린 경계가 바닥선 위아래로 어긋나도
 * 덮이게 아래로도 조금 내려온다. 텍스처 키에 팔레트가 들어가서 같은 팔레트면 판이 바뀌어도 다시 굽지 않는다
 */
const LAND_MOUND_KEY = 'ted_land_mound';
const LAND_CRACK_KEY = 'ted_land_crack';
const LAND_MOUND_W = 46;
const LAND_MOUND_H = 12;
const LAND_MOUND_ORIGIN_Y = 0.7;       // 더미 안에서 바닥선 높이 (위 8px 솟고 아래 3px 덮는다 —
                                       // 바닥선 자르기는 마스크가 하니 더미는 이음매만 덮으면 된다)
const LAND_CRACK_W = 96;
const LAND_CRACK_H = 28;
const LAND_CRACK_ORIGIN_Y = 0.1;

/** 이번 판 착지 잔해 — 구운 텍스처 키 둘 + 착지 연기 색 */
interface LandFx { mound: string; crack: string; smoke: number }

type RGB = readonly [number, number, number];
type Put = (x: number, y: number, c: RGB) => void;
const rgb = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** 캔버스 텍스처 하나를 픽셀 단위로 굽는다 — draw 가 put 으로 불투명 픽셀만 찍는다 */
function bakePixels(scene: Phaser.Scene, key: string, W: number, H: number, draw: (put: Put) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, W, H);
  if (!tex) return;
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, H);
  draw((x, y, c) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

/**
 * 조각 마스크를 4톤으로 칠한다 (snow·concrete·stone 더미 공용). part = 그 픽셀의 조각 번호(-1 = 빈칸).
 * 위·옆이 빈칸이거나 **다른 조각**이면 외곽선 (겹친 파편·돌이 한 덩이로 뭉개지지 않게),
 * 윗면 한 줄 빛, 바닥선(G) 아래는 그늘. grain > 0 이면 바탕에 그늘 알갱이를 섞는다
 */
function shadeMask(
  put: Put, W: number, H: number, G: number,
  part: (x: number, y: number) => number, pal: GroundFx, grain: number, seed: number,
): void {
  const OUT = rgb(pal.outline), DARK = rgb(pal.dark), BASE = rgb(pal.base), LIGHT = rgb(pal.light);
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const id = part(x, y);
      if (id < 0) continue;
      let c = BASE;
      if (part(x, y - 1) !== id || part(x - 1, y) !== id || part(x + 1, y) !== id) c = OUT;
      else if (part(x, y - 2) !== id) c = LIGHT;
      else if (y >= G) c = DARK;
      else if (grain > 0 && rnd() < grain) c = DARK;
      put(x, y, c);
    }
  }
}

function bakeMound(scene: Phaser.Scene, key: string, pal: GroundFx): void {
  const W = LAND_MOUND_W, H = LAND_MOUND_H, G = Math.round(H * LAND_MOUND_ORIGIN_Y);
  const OUT = rgb(pal.outline), DARK = rgb(pal.dark), BASE = rgb(pal.base), LIGHT = rgb(pal.light);
  const u = (x: number) => (x - W / 2) / (W / 2);
  bakePixels(scene, key, W, H, (put) => {
    if (pal.material === 'soil') {
      // 윗선 — 가운데 둥근 봉우리 두 개 + 계단진 가장자리 (정수 높이라 하드 엣지)
      const top = (x: number) => {
        const v = u(x);
        const hump = Math.max(0, 1 - v * v) * 6 + Math.max(0, 1 - ((v + 0.3) / 0.35) ** 2) * 1.5
          + Math.max(0, 1 - ((v - 0.35) / 0.3) ** 2) * 1;
        return G - Math.round(hump);
      };
      const bottom = (x: number) => G + Math.round(Math.max(0, 1 - u(x) ** 2) * 3);
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let x = 2; x < W - 2; x++) {
        const t = top(x), b = bottom(x);
        if (b - t < 2) continue;
        for (let y = t; y <= b; y++) {
          let c = BASE;
          if (y === t || x === 2 || x === W - 3) c = OUT;      // 윗선만 외곽선 — 아랫면은 흙에 녹아든다
          else if (y - t <= 1) c = LIGHT;                       // 윗면 빛
          else if (y >= G) c = DARK;                            // 바닥선부터 아래는 그늘
          else if (rnd() < 0.08) c = DARK;                      // 흙 알갱이
          put(x, y, c);
        }
      }
      // 좌우로 튄 흙 알갱이 (2x2 덩이)
      for (const [cx, cy] of [[1, G - 2], [6, G - 4], [W - 4, G - 2], [W - 9, G - 4]]) {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) put(cx + dx, cy + dy, dy === 0 ? LIGHT : DARK);
        put(cx - 1, cy, OUT); put(cx + 2, cy + 1, OUT);
      }
      return;
    }
    if (pal.material === 'snow') {
      // 둥근 눈 더미 — 봉우리 하나, 둥근 어깨. 알갱이 없이 매끈하게
      const inside = (x: number, y: number) => {
        if (x < 3 || x > W - 4) return -1;
        const v = u(x);
        const t = G - Math.round(Math.max(0, 1 - v * v) ** 1.3 * 7.5);   // 끝이 얇아지는 둥근 봉우리 (판처럼 안 보이게)
        const b = G + Math.round(Math.max(0, 1 - v * v) * 3);
        return b - t >= 2 && y >= t && y <= b ? 0 : -1;
      };
      shadeMask(put, W, H, G, inside, pal, 0, 3);
      // 옆에 떨어진 작은 눈 뭉치
      for (const [cx, cy] of [[0, G - 1], [W - 2, G - 1]]) {
        put(cx, cy, LIGHT); put(cx + 1, cy, LIGHT); put(cx, cy + 1, BASE); put(cx + 1, cy + 1, BASE);
      }
      return;
    }
    if (pal.material === 'concrete') {
      // 각진 파편 — 기울어진 평행사변형 판들, 바닥은 G+1 에 앉는다. [가운데 x, 폭, 높이, 기울기(px/줄)]
      const shards: readonly (readonly [number, number, number, number])[] = [
        [23, 11, 7, 0.5], [12, 8, 5, -0.9], [34, 9, 4, 1.0], [4, 4, 3, 0], [42, 3, 2, 0],
      ];
      const inside = (x: number, y: number) => shards.findIndex(([cx, w, h, k]) => {
        const row = G + 1 - y;                      // 바닥에서 몇 줄 위인가
        if (row < 0 || row >= h) return false;
        const l = Math.round(cx - w / 2 + k * row);
        return x >= l && x < l + w;
      });
      shadeMask(put, W, H, G, inside, pal, 0.05, 13);
      return;
    }
    // stone — 돌 조각 몇 개 (각진 덩이). [가운데 x, 가운데 y, 반폭, 반높이]
    const rocks: readonly (readonly [number, number, number, number])[] = [
      [22, G - 2, 7, 4.5], [13, G - 1, 4.5, 3], [31, G - 1, 5, 3.2], [6, G, 2.5, 2], [39, G, 3, 2],
    ];
    const inside = (x: number, y: number) => rocks.findIndex(([cx, cy, rx, ry]) => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      return Math.abs(dx) + dx * dx * 0.4 + dy * dy < 1.2;     // 마름모에 가까운 각진 덩이
    });
    shadeMask(put, W, H, G, inside, pal, 0.06, 17);
  });
}

function bakeCrack(scene: Phaser.Scene, key: string, pal: GroundFx): void {
  const W = LAND_CRACK_W, H = LAND_CRACK_H, G = Math.round(H * LAND_CRACK_ORIGIN_Y);
  const CR = rgb(pal.crack), EDGE = rgb(pal.crackEdge);
  bakePixels(scene, key, W, H, (put) => {
    let seed = pal.material === 'stone' ? 23 : 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    if (pal.material === 'snow') {
      // 균열 대신 눈 튐 — 가운데에서 옆으로 흩어진 눈 덩이 (멀수록 땅에 가깝고 작다). 땅 면이라 세로로 눌린다
      for (let i = 0; i < 26; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const d = 6 + rnd() * 40;
        const x = W / 2 + side * d;
        const y = G + 1 + rnd() * (11 - d * 0.18);
        put(x, y, EDGE); put(x + 1, y, EDGE); put(x, y + 1, CR);
        if (d < 22 && rnd() < 0.6) { put(x + 1, y + 1, CR); put(x - 1, y, EDGE); put(x - 1, y + 1, CR); }
      }
      return;
    }
    // 가운데에서 6갈래 — 옆으로 길게, 아래로 짧게. 한 칸씩 걸으며 방향을 튼다 (concrete 는 덜 틀고 곁가지)
    const jitter = pal.material === 'concrete' ? 0.3 : 0.9;
    const walk = (x: number, y: number, a: number, len: number, root: boolean) => {
      for (let i = 0; i < len; i++) {
        a += (rnd() - 0.5) * jitter;
        a = Phaser.Math.Clamp(a, 0.02, Math.PI - 0.02);   // 아래쪽 반원 안에서만
        x += Math.cos(a); y += Math.sin(a) * 0.55;          // 땅 면이라 세로로 눌린다
        put(x, y, CR);
        if (root && i < len * 0.6) put(x, y + 1, CR);       // 뿌리 쪽은 굵게
        put(x, y - 1, EDGE);                                // 위 가장자리 밝은 턱
        if (pal.material === 'concrete' && root && i === Math.round(len * 0.45)) {
          walk(x, y, a + (rnd() < 0.5 ? -0.7 : 0.7), Math.round(len * 0.4), false);   // 곁가지
        }
      }
    };
    for (const [ang, len] of [[0.08, 40], [0.45, 26], [1.2, 18], [Math.PI - 0.08, 40], [Math.PI - 0.5, 24], [Math.PI - 1.25, 16]]) {
      walk(W / 2, G + 1, ang, len, true);
    }
  });
}

/** 이번 판 배경 땅 팔레트로 더미·균열을 굽는다 (판 시작 한 번 — 같은 팔레트면 이미 구운 것을 쓴다) */
function bakeLandDecoTextures(scene: Phaser.Scene, bgKey: string): LandFx {
  const pal = getGroundFx(bgKey);
  const sig = [pal.material, pal.outline, pal.dark, pal.base, pal.light, pal.crack, pal.crackEdge]
    .map(v => (typeof v === 'number' ? v.toString(16) : v)).join('_');
  const mound = `${LAND_MOUND_KEY}_${sig}`;
  const crack = `${LAND_CRACK_KEY}_${sig}`;
  bakeMound(scene, mound, pal);
  bakeCrack(scene, crack, pal);
  return { mound, crack, smoke: pal.smoke };
}

/** 충전 큐브 — 한 수가 도는 시간(45° 칸 한 장을 이만큼), 결과 링 간격(버튼 테두리에서 한 링씩), 링 연출 시간 */
const CHARGE_TURN_MS = 90;
const CHARGE_RING_GAP = 6;
const CHARGE_RING_MS = 200;
/** 충전 큐브 시트 한 칸(72px) 안에서 큐브 몸통이 차지하는 폭 (실측 46px) — 소환 큐브 크기를 몸통 폭으로 맞출 때 */
const CHARGE_BODY_RATIO = 46 / 72;
/** 가득 찬 뒤 큰 큐브가 통째로 천천히 도는 속도 (rad/ms) — 큐브 전체 회전이라 앞면 9/9 가 그대로다 */
const CHARGE_IDLE_SPIN = (Math.PI * 2) / 9000;
/** 다 찬 칸 링 색 — 결과색이 없어져 중립 한 가지 (밝은 하늘·어두운 배경 어디서나 읽히는 연한 금빛) */
const CHARGE_RING_COLOR = 0xf2e6c4;
/** 발동할 수 없는 동안(소환 중) 충전 표시 알파 */
const CHARGE_DIM_ALPHA = 0.4;

/** 충전 링 한 자리 — filled 가 아니면 빈 트랙. fromR ≥ 0 이면 그 자리 번호에서 옮겨 오는 중, fill0 ≥ 0 이면 차오르는 중 */
interface ChargeRingSlot { filled: boolean; t0: number; fromR: number; fill0: number }

/** 소닉붐 파장 하나 — 퍼지는 동안 매 프레임 링 배율·알파와 반경 띠 판정 (prevR → 지금 반경) */
interface SonicWave {
  x: number; y: number; t0: number; prevR: number;
  /** builder B 시트 — 원반 → 링 → 옅어짐 */
  ring: Phaser.GameObjects.Sprite | null;
  /** 바깥 보강 겹 (옅은 어두운 띠) */
  rim: Phaser.GameObjects.Image | null;
}

function newChargeView() {
  return {
    btn: null as { x: number; y: number; r: number; s: number } | null,
    big: null as Phaser.GameObjects.Sprite | null,
    glow: null as Phaser.GameObjects.Arc | null,
    rings: null as Phaser.GameObjects.Graphics | null,
    ringsBusy: false,
    dim: false,      // 발동할 수 없는 동안 (소환 중) — 큐브·링·발광을 흐리게
    charges: 0,
    slots: [0, 1].map((): ChargeRingSlot => ({ filled: false, t0: -1e9, fromR: -1, fill0: -1 })),
    move: -1, animFrom: -1, animT0: -1, maxed: false, maxT0: -1,
  };
}

/** 어센트(수묵) 박자표 — 장면별 박자는 TED_PARAMS.ink */
function ascentTiming() {
  return TED_PARAMS.ascentTiming;
}

/** 체스 말 시트 (10프레임: 흑/백 × 폰·나이트·비숍·퀸·킹) */
export const TED_CHESS_SHEET = 'chess_96x128.png';

/** 수묵 안전 영역 한 칸 (원본 좌표) */
type InkRect = { x: number; y: number; w: number; h: number };

/**
 * 수묵 컷신 그림 — builder 판, 원본 ddong-fx-work/ted-ascent/ink/prod.
 * 텍스처 키는 character.ts 의 extraSpriteSheets 와 같다. 박자는 TED_PARAMS.ink.
 * 화면 가득 그림(s1·s2·s4·s5·s6)은 390x844 로 그려져 화면을 덮게(cover) 늘린다
 */
const TED_INK = {
  form: 'ted_ink_s1_form',      // 3칸 RGBA — 형체가 잡히는 단계
  smoke: 'ted_ink_s1_smoke',    // 4칸 RGBA — 먹 연기 꿈틀 반복
  /** 10칸 RGB — 덮개가 올라가며 눈을 뜬다 (open.json). 한 변 2048 때문에 두 장: 0~7칸 face_0 (4x2) · 8~9칸 face_1 (2x1) */
  face: ['ted_ink_s2_face_0', 'ted_ink_s2_face_1'] as readonly string[],
  facePerSheet: 8,
  /**
   * 쓰는 칸은 다 뜬 칸(9) 하나뿐 — 감았다 뜨는 동작(0~8칸·open.json)은 대표 결정으로 뺐다.
   * 시트에서 빼면 face_0 통째(10.55MB) + face_1 의 8칸(1.32MB) 절약 — 빼는 건 대표 결정 후 (정리 목록)
   */
  faceOpenFrame: 9,
  wipe: 'ted_ink_sA_wipe',      // 8칸 RGBA — 1-A 검은 먹 덩어리가 화면을 가리며 지나감 (3·4칸 = 화면 97%)
  awake: 'ted_ink_sC_face',     // 5칸 RGB — 2-C 0 = 각성 표정, 1~4 = 먹 터짐 (s2 와 같은 바탕)
  awakeBurst: 'ted_ink_sC_burst', // 4칸 RGBA — 2-C 섬광 순간 퍼지는 먹 터짐
  eyes: 'ted_ink_s3_eyes',      // 8칸 RGB 480x234 — 검정 위 흰 눈매 (더하기 합성, **화면 폭에 맞춘다**)
  reveal: 'ted_ink_s4_reveal',  // 4칸 RGB — 흰 폭발 → 풀컬러
  wind: 'ted_ink_s5_wind',      // 4칸 RGB (검정 배경) — 바람 반복
  cube: 'ted_ink_s6_cube',      // 5칸 RGB (검정 배경) — 큐브 손동작
  stroke: 'ted_ink_s7_stroke',  // 8칸 RGBA 384x512 — 붓질 (가로로 그려진 시트를 세로로 돌려 쓴다)
  splash: 'ted_ink_s7_splash',  // 6칸 RGBA 512x512 — 먹 튀김
  swirl: 'ted_ink_s7_swirl',    // 8칸 RGBA 384x512 — 먹 소용돌이
  /**
   * 안전 영역 — 칸마다 **반드시 보여야 할 곳** (원본 480x720 좌표). 화면을 덮게(cover) 늘렸을 때 이 영역이
   * 화면 밖으로 나가면, 들어올 때까지만 배율을 줄인다 (남는 곳은 그림 바탕색 — 검정 / 화선지).
   * 키 = 텍스처 키, 값 = 모든 칸 공통 영역 또는 칸별 배열 (null = 장식 칸, 잘려도 된다).
   * 폰(360x800)에서 보이는 폭 = 원본 x 78~402 — s4~s6 큐브 왼쪽 끝(약 104)까지 여유 약 26(화면 29px)
   */
  safe: {
    ted_ink_s1_form: { x: 90, y: 25, w: 300, h: 665 },     // 전신 (머리~발, 큐브 든 손)
    ted_ink_s1_smoke: { x: 90, y: 25, w: 300, h: 665 },
    ted_ink_sC_face: { x: 160, y: 210, w: 200, h: 210 },   // 두 눈 + 입
    ted_ink_s2_face_0: { x: 160, y: 150, w: 230, h: 320 }, // 두 눈 + 얼굴
    ted_ink_s2_face_1: { x: 160, y: 150, w: 230, h: 320 },
    ted_ink_s4_reveal: { x: 100, y: 30, w: 280, h: 270 },  // 큐브·손·머리
    ted_ink_s5_wind: { x: 100, y: 30, w: 280, h: 270 },
    ted_ink_s6_cube: { x: 100, y: 30, w: 280, h: 270 },
  } as Record<string, InkRect | readonly (InkRect | null)[]>,
  paper: 0xeee9df,              // 화선지 (s1_paper 는 한 색이라 텍스처 대신 사각형)
  // 2:3 판 (builder prod23) — 원본 1024x1536 전체를 480x720 으로. 옛 390x844 판 좌표 → 이 판 = (73.6 + 0.8533x, 0.8533y)
  artW: 480,
  artH: 720,
  faceEyeMid: { x: 265.3, y: 264.5 },  // s2 두 눈의 중점 — 실측
  awakeEyeMid: { x: 260.4, y: 258.2 }, // sC 두 눈의 중점 (얼굴 원점) — 실측. s2 와 5px 남짓 다르다 (섬광이 가린다)
  /** sC 두 눈 (실측) — 흰 눈 세트가 섬광 전에 맞춰 가는 자리 · 먹 튀김 중심은 그 중점(awakeEyeMid) */
  awakeEyes: [{ x: 184.6, y: 273.5 }, { x: 336.2, y: 242.8 }] as readonly { x: number; y: number }[],
  /** s2 다 뜬 칸 두 눈 (실측) — 흰 눈 세트가 옮겨 가 겹치는 자리 (얼굴이 그 둘레로 켜진다) */
  faceEyes: [{ x: 187.5, y: 280.9 }, { x: 343.0, y: 248.0 }] as readonly { x: number; y: number }[],
  /** 눈 사이 기준점 (원본 좌표) — 빨려 든 점 = 흰 눈매 띠의 기준점 (s4 폭발 중심과 같다) */
  anchor: { x: 240, y: 331.7 },
  eyesW: 480,
  eyesH: 234,
  // s3 띠 안의 기준점 (layout.json: 띠 위 y 192 + 139.7 = 331.7). 원래 미간 흰 점 자리 — 점은 시트에서 지웠다
  // (반지름 31px 원을 검정으로. 24~36px 고리가 원래 0 이라 눈매 선은 그대로 — 바깥 차이 0px 확인)
  eyesDot: { x: 240, y: 139.7 },
  /** s3 띠 안 두 홍채 중심 (builder s3_eyes23.py 의 PUP) — 일렁임 발광·아지랑이 자리. 섬광·먹 튀김은 두 점의 중점 */
  iris: [{ x: 114.8, y: 121.9 }, { x: 372.7, y: 118.1 }] as readonly { x: number; y: number }[],
  /**
   * 아지랑이 복제 — 다 그려진 눈매(s3 7칸)에서 홍채 둘레를 **가장자리가 부드럽게** 잘라 판 시작 때 한 장씩 굽는다.
   * 그냥 잘라 더하면(setCrop) 사각형 테두리가 그대로 보인다
   */
  irisHazeKey: 'ted_ink_iris_haze',
  irisHazeFrame: 7,
  irisCrop: { w: 64, h: 56 },     // 굽는 크기 (띠 px) — 타원 알파가 가운데 45% 까지 불투명, 끝에서 0
  irisGlowD: 70,                  // 홍채 발광 지름 (띠 px) — 홍채 반지름 약 22
  /**
   * 흰 눈동자 — s3 7칸에서 홍채·동공만 둥글게 떼어 판 시작 때 한 장씩 굽는다 (56x56, 반지름 18 까지 불투명 → 27 에서 0).
   * 눈매 선보다 먼저 켜지고, s3 홍채가 차오르는 3~6칸 동안 넘겨준다
   */
  irisCoreKey: 'ted_ink_iris_core',
  irisCoreSize: 56,
  irisCoreR: [18, 27] as readonly number[],
  // s7 먹 이펙트 — 크기는 원본 px (화면 배율을 곱한다), 높이는 원본 높이 비율
  // 붓질 — 가로 시트(왼→오, 주축 −1°)를 +90° 돌려 위→아래 한 획. 획 길이 350/384 칸 → 칸 폭 840 이면 766 (> 높이 720,
  // 굵기도 같이 2.2배). 획 가운데가 칸 가운데에서 (−16, −19) 칸 px 비켜 있어, 돌린 뒤 (+42, −35) 만큼 빼서
  // 획 가운데가 원본 (240, 360) 에 오게 놓는다
  strokeX: 198, strokeY: 395 / 720, strokeW: 840, strokeRot: Math.PI / 2,
  splashW: 433,                   // 장면 1 먹 튀김 폭 (장면 5 는 구운 진한 먹 — TED_PARAMS.ink.burst*)
  swirlY: 0.45, swirlW: 333,      // 소용돌이 중심 높이·시작 폭
  /**
   * 진한 먹 — 장면 5 에서 바깥으로 날아가며 걷히는 먹 튀김. s7 splash 2칸(가장 진한 칸)을 판 시작 때 한 번
   * 알파를 세우고(반투명 회색 없이 검정 먹) 가운데를 비워 굽는다 — 커질수록 가운데 구멍도 커져 테드가 드러난다
   */
  burstKey: 'ted_ink_burst',
  burstFrame: 2,
  burstHole: [0.14, 0.2] as readonly number[], // 칸 폭 대비 — 여기서 비어 있다가 여기부터 먹
  burstAlphaFrom: 40,  // 원본 알파 이 값 이하는 버린다 (번진 회색)
  burstAlphaGain: 3,   // 그 위는 이 배로 세워 거의 1 로
};

/** Sine.easeInOut (0~1) */
function ease01(u: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * u);
}

/** s2 얼굴 n번 칸 → (시트 키, 시트 안 칸) */
function inkFaceFrame(n: number): { key: string; frame: number } {
  const per = TED_INK.facePerSheet;
  return { key: TED_INK.face[Math.floor(n / per)], frame: n % per };
}

/** 똥(100)·플레이어보다 뒤. 연출이 플레이 화면을 가리면 안 된다 */
const CHESS_DEPTH = 5;

// ── 퍼짐 연출 레이어 ──────────────────────────────────────────────────────────
// 기하에 붙어 있지 않은 것(섬광·파동)은 코드로 얹는다.
const WAVE_DEPTH = 214;        // 퍼짐 파동. 섬광(320) 아래

/**
 * 퍼짐 파동 다발 — **파바방**. 한 장이 퍼지는 게 아니라 시차를 둔 여러 겹이 연달아 나간다.
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
const WAVE_UNIT_R = 160 * 0.42;
const FLASH_DEPTH = 320;

// 결합 섬광은 화면을 덮는 흰 사각이다. **가산이 아니라 일반 블렌드**다 —
// 밝은 배경(background2 평균 192/255)에서 가산 흰색은 아무 일도 안 일어난 것처럼 보인다
const FLASH_ALPHA = 0.30;
const FLASH_FADE_MS = 120;

/** 바람선 텍스처 — vfx 의 절차 생성 파티클 (흰색이라 자유롭게 착색된다) */
const WIND_TEXTURE = 'fx_proc_streak';
/**
 * proc-streak(192px) 안의 선 — 가운데 줄에 반치폭 약 14px 의 부드러운 선, 가로로는 157px.
 * 표시 두께·길이를 px 로 주려면 이 비로 나눠야 한다 (텍스처 높이를 2px 로 줄이면 선이 0.1px 가 되어 안 보인다)
 */
const STREAK_TEX = 192;
const STREAK_LINE_W = 14;
const STREAK_LINE_LEN = 157;

/**
 * 소닉붐 충격파 — builder chess-fx B 시트 (`sonicboom_256x256.png`, 6칸, 정면 원형, 중심 128,128).
 * 응결 원반 → 얇은 링(안쪽 투명)·바람 줄기 → 옅어짐. 마지막 칸 링 반지름이 칸 안에서 108px —
 * sonicRingR 에 맞춰 한 배율로 놓고 sonicRingMs 동안 6칸을 재생하면 링이 판정 반경을 ±10px 안으로 따라간다
 */
export const TED_SONIC_SHEET = 'sonicboom_256x256.png';
const SONIC = { frames: 6, ringR: 108 };

/**
 * 앞 끝 공기 가르기 한 벌 — 작고 밝은 열기 점(proc-glow) + 앞 끝에서 양옆 뒤로 갈라지는 얇은 공기 갈래(V자, proc-streak).
 * 불은 메인이 아니다 (대표 결정 — reentry 불꽃 시트는 뺐다). 평소엔 은은하게, 소닉붐 뒤(boostT0 ≥ 0)엔 갈래가 조금 길고 진하게
 */
interface AirBow {
  glow: Phaser.GameObjects.Image | null;
  lines: Phaser.GameObjects.Image[];
  boostT0: number;
}

/**
 * 소닉붐 바깥 보강 겹 — 아주 옅은 어두운 얇은 띠. 밝은 구름 위에서 시트 링의 대비가 약해 판 시작 때 한 번 굽는다.
 * 텍스처 안 띠 반지름 SONIC_RIM_EDGE — 판정 반경을 따라간다
 */
const SONIC_RIM_KEY = 'ted_sonic_rim';
const SONIC_RIM_TEX = 256;
const SONIC_RIM_EDGE = 116;

function bakeSonicRimTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SONIC_RIM_KEY)) return;
  const n = SONIC_RIM_TEX;
  const tex = scene.textures.createCanvas(SONIC_RIM_KEY, n, n);
  if (!tex) return;
  const ctx = tex.getContext();
  const r1 = n / 2 - 1;
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, r1);
  const at = (px: number) => px / r1;
  g.addColorStop(0, 'rgba(24,34,52,0)');
  g.addColorStop(at(SONIC_RIM_EDGE + 1), 'rgba(24,34,52,0)');
  g.addColorStop(at(SONIC_RIM_EDGE + 3), 'rgba(24,34,52,1)');
  g.addColorStop(at(SONIC_RIM_EDGE + 8), 'rgba(24,34,52,0)');
  g.addColorStop(1, 'rgba(24,34,52,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  tex.refresh();
}

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
 * 말이 모이는 자리 — **화면 좌표**다. 플레이어를 따라다니지 않는다.
 *
 * 매 프레임 다시 구하는 이유는 `Scale.RESIZE` 라 화면이 바뀔 수 있어서다.
 * 값 자체는 두 번의 곱셈이라 비용이 없다.
 */
function gatherCenter(scene: Phaser.Scene): { x: number; y: number } {
  return {
    x: scene.scale.width * TED_PARAMS.gatherCenterX,
    y: scene.scale.height * TED_PARAMS.gatherCenterY,
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

/**
 * 테드 (R) — 체스 컨셉. {@link TED_PARAMS.chessInterval}점마다 체스 말 하나가
 * 하늘에서 무작위 방향으로 **일직선**으로 날아와 화면 안 바닥에 꽂힌다.
 * 지나는 길의 일반 똥은 깨지고 개당 {@link TED_PARAMS.chessPoopPoints}점이 붙는다.
 * 꽂힌 말은 바닥에 그대로 남고, {@link TED_PARAMS.chessStackMax} 개가 모이면
 * 화면 가운데로 빨려 들어가 모였다가 사방으로 퍼진다 ({@link clearBoard}).
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
  /** 꽂힌 말마다 밑동 흙더미·균열과 그 말의 바닥선 y — 말과 같이 생기고 같이 사라진다 */
  /** 이번 판 착지 잔해 텍스처·연기 색 — onCreate 에서 배경 땅 팔레트로 굽는다 */
  private landFx: LandFx | null = null;
  private landDeco = new Map<Phaser.GameObjects.Image, { mound: Phaser.GameObjects.Image; crack: Phaser.GameObjects.Image; groundY: number }>();
  /**
   * 꽂힌 말의 **바닥선 아래를 가리는** 공용 마스크 — 말마다 "자기 바닥선 위" 사각형을 합친 모양.
   * 말이 비스듬히 박혀 있어 텍스처 사각형 자르기(setCrop)로는 바닥선을 따라 자를 수 없다.
   * 말이 꽂히거나 걷힐 때만 다시 그린다 (매 프레임 아님)
   */
  private groundMaskG: Phaser.GameObjects.Graphics | null = null;
  private groundMask: Phaser.Display.Masks.GeometryMask | null = null;
  /** 아직 안 쓴 착지 칸 번호 (섞여 있다). 판이 비워지면 다시 채운다 */
  private landSlots: number[] = [];
  /** 본체·잔상·바람선 전부. 게임 오버 때 한 번에 회수한다 */
  private tracked = new Set<Phaser.GameObjects.Image>();
  /** null 이 아니면 연출이 재생 중이다 — 겹쳐 발동하지 않는다 */
  private stage: 'gather' | 'spread' | null = null;
  /** 씬이 내려간 뒤 playFx 의 onComplete 가 불려도 폭발하지 않게 하는 빗장 */
  private cancelled = false;
  /** 연출 시작 시각 (scene.time.now — Clock.now 는 timeScale 을 안 본다) */
  private gatherT0 = 0;
  /** 몸 중앙으로 빨려 들어가는 말 */
  private sucking: SuckedPiece[] = [];
  /** 중앙에 다 모여 발사를 기다리는 말 */
  private spreadReady: Phaser.GameObjects.Image[] = [];
  /** 사방으로 퍼지는 중인 말 */
  private spreading: SpreadPiece[] = [];
  /** 퍼짐 시작 시각 (scene.time.now) */
  private spreadT0 = 0;
  /** 시각이 되면 한 번씩 실행되는 연출 큐 (씬 타이머 대신 — 히트스톱에 멈추지 않는다) */
  private cues: { at: number; fn: (api: GameSceneAPI) => void }[] = [];

  // ── 액티브 스킬 "어센트" ─────────────────────────────────────────
  /** 컷신 시작 시각 (scene.time.now) */
  private ascentT0 = 0;
  /** 컷신 큐. 비어 있지 않으면 연출이 도는 중이다 */
  private ascentCues: { at: number; fn: (api: GameSceneAPI) => void }[] = [];
  /** 이 시각까지 무적 (컷신 동안) */
  private ascentInvincibleUntil = 0;
  /** 소환 큐브가 머리 옆을 도는 끝 시각 (0 = 없음). 도는 동안 떨어지는 말이 소닉붐을 일으킨다 */
  private summonUntil = 0;
  /** 소환 큐브가 나온 시각 — 수순 재생의 기준 */
  private summonT0 = 0;
  /** 소환 큐브가 다음 말을 떨어뜨리는 시각 (summonDropEveryMs 박자) */
  private nextSummonDropAt = 0;
  /** 퍼지는 중인 소닉붐 파장 (상한 sonicRingMax) */
  private sonicWaves: SonicWave[] = [];
  /** 충전 큐브 표시 — 큰 큐브·발광·작은 큐브, 지나간 수(move)·도는 동작 시작 시각 */
  private cv: {
    btn: { x: number; y: number; r: number; s: number } | null;
    big: Phaser.GameObjects.Sprite | null; glow: Phaser.GameObjects.Arc | null;
    rings: Phaser.GameObjects.Graphics | null; ringsBusy: boolean; dim: boolean; charges: number;
    slots: ChargeRingSlot[];
    move: number; animFrom: number; animT0: number; maxed: boolean; maxT0: number;
  } = newChargeView();
  /** ink — 수묵 컷신 오브젝트. 배치·칸·밝기는 매 프레임 layoutInk 가 시각으로 정한다 (트윈 없음) */
  private ink: {
    paper: Phaser.GameObjects.Rectangle; dark: Phaser.GameObjects.Rectangle; flash: Phaser.GameObjects.Rectangle;
    /** ⑤→① 이음새 — 눈빛 폭발 정점이 번지는 화선지 색 덮개 (눈 세트·얼굴 위) */
    paperCover: Phaser.GameObjects.Rectangle;
    form: Phaser.GameObjects.Sprite; smoke: Phaser.GameObjects.Sprite; stroke: Phaser.GameObjects.Sprite;
    splash: Phaser.GameObjects.Sprite; swirl: Phaser.GameObjects.Sprite; main: Phaser.GameObjects.Sprite;
    eyes: Phaser.GameObjects.Sprite;
    /** 장면 4 홍채 일렁임 — 눈마다 발광 한 장 + 홍채만 잘라 낸 아지랑이 복제 한 장 */
    irisGlow: Phaser.GameObjects.Image[]; irisHaze: Phaser.GameObjects.Image[];
    wipe: Phaser.GameObjects.Sprite;
    awakeBurst: Phaser.GameObjects.Sprite;
    irisCore: Phaser.GameObjects.Image[]; burst: Phaser.GameObjects.Image;
    /** 무대 양옆 커튼 · 결과 ①② 뒤 화선지 바탕 */
    curtainL: Phaser.GameObjects.Rectangle; curtainR: Phaser.GameObjects.Rectangle;
  } | null = null;
  /** 머리 옆에서 도는 소환 큐브 */
  private summonCube: Phaser.GameObjects.Sprite | null = null;
  /** 액티브가 만든 오브젝트 — Image 가 아닌 것도 있어 따로 담는다 */
  private trackedAny = new Set<Phaser.GameObjects.GameObject>();

  /** 모임 → 퍼짐 연출 + 액티브 컷신·소환을 진행한다 */
  override onUpdate(api: GameSceneAPI): void {
    const nowAll = api.scene.time.now;
    if (this.cv.big && (this.cv.animT0 >= 0 || this.cv.maxed || this.cv.ringsBusy)) this.stepChargeCube(nowAll);

    // ── 액티브 컷신 큐 (모임/퍼짐과 독립적으로 돈다) ────────────────
    if (this.ascentCues.length > 0) {
      const ta = nowAll - this.ascentT0;
      while (this.ascentCues.length > 0 && ta >= this.ascentCues[0].at) {
        this.ascentCues.shift()!.fn(api);
      }
    }
    if (this.ink) this.layoutInk(api, nowAll - this.ascentT0);
    // ⬛ 흑 소환 — 큐브가 따라다니며 체인 라이트닝
    if (this.summonUntil > 0) this.stepSummon(api, nowAll);
    // 소닉붐 파장 — 체스 말 연출(stage)과 따로 돈다
    if (this.sonicWaves.length > 0) this.stepSonicWaves(api, nowAll);

    // 큐가 남아 있으면 계속 돈다. `stage` 만 보면 말이 먼저 다 나갔을 때
    // 아직 안 터진 연출(파동 겹 등)이 통째로 사라진다
    if (this.stage === null && this.sucking.length === 0 && this.cues.length === 0) return;

    const now = api.scene.time.now;
    const t = now - this.gatherT0;

    // **흡수가 큐보다 먼저다.** 큐를 먼저 돌리면, 프레임이 한 번 건너뛰어
    // 490ms → 600ms 로 점프했을 때 590ms 예약(발산)이 **아직 비어 있는 spreadReady**
    // 를 발사한다. 그 뒤에야 흡수가 끝나 말이 채워지고, 다시 발사되지 않는다 —
    // 말 10개가 중앙에 박힌 채 마무리가 영구히 막힌다 (Codex 재현:
    // `stage="spread", ready=10, spreading=0` 이 3초 뒤에도 동일).
    // 흡수를 먼저 돌리면 같은 프레임에서 말이 먼저 도착해 있다
    if (this.sucking.length > 0) this.stepSuck(api, t);

    while (this.cues.length > 0 && t >= this.cues[0].at) {
      this.cues.shift()!.fn(api);
    }
    if (this.spreading.length > 0) this.stepSpread(api, now);
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
    const bow = this.makeAirBow(scene, startX, startY);

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
    const P = TED_PARAMS;
    const duration = (dist / P.chessSpeed) * 1000;
    let ghosts = P.chessTrailMax;
    let lastGhostAt = scene.time.now;
    let prevX = startX;
    let prevY = startY;
    const windW = wind.displayWidth;

    // 매 프레임 — 선분 판정 · 바람선·불꽃 따라오기 · 잔상. heat = 짙기 (0~1), trailMs = 잔상 간격
    const follow = (heat: number, trailMs: number) => {
      if (!piece.active) return;
      // 지난 프레임부터 지금까지의 **선분**으로 판정한다. 1900px/s 면 한 프레임에
      // 30px 넘게 움직여서 현재 위치만 보면 똥을 뚫고 지나간다 (터널링)
      this.smashPoops(api, prevX, prevY, piece.x, piece.y);
      prevX = piece.x;
      prevY = piece.y;
      // 바람선은 본체를 따라오되, 가속에 맞춰 짙어진다 — 처음부터 진하면 '판때기'다
      wind.setPosition(piece.x, piece.y).setAlpha(P.chessWindAlpha * Math.min(1, heat));
      // 진입 불꽃 — 앞 끝에 붙어 빨라질수록 짙어진다. 소닉붐 뒤엔 크게 타오르고 불티가 뒤로 흩어진다
      this.stepAirBow(scene, bow, piece.x + leadX, piece.y + leadY, rad, h, heat);
      if (ghosts <= 0) return;
      const now = scene.time.now;
      if (now - lastGhostAt < trailMs) return;
      lastGhostAt = now;
      ghosts--;
      this.dropGhost(scene, piece, key, frame, rot);
    };

    // 소환 큐브가 도는 동안 떨어지는 말 — 낙하 거리의 sonicAt 에서 소닉붐 → 남은 거리를 sonicSpeedMul 배로
    if (this.summonUntil > scene.time.now) {
      const midX = startX + (landX - startX) * P.sonicAt;
      const midY = startY + (landY - startY) * P.sonicAt;
      // Quad.easeIn 으로 전체 거리를 duration 에 가는 곡선과 같은 시각에 붐 지점에 닿는다 (√sonicAt)
      const t1 = duration * Math.sqrt(P.sonicAt);
      // 붐 순간 속도 (Quad.easeIn 끝 속도 = 2 × 거리 / 시간) × 배율로 남은 거리를 등속
      const vBoom = (2 * dist * P.sonicAt) / t1;
      const t2 = (dist * (1 - P.sonicAt)) / (vBoom * P.sonicSpeedMul);
      scene.tweens.add({
        targets: piece, x: midX, y: midY, duration: t1, ease: 'Quad.easeIn',
        onUpdate: (tw: Phaser.Tweens.Tween) => follow(tw.progress * P.sonicAt * 2, P.chessTrailMs),
        onComplete: () => {
          if (!piece.active) return;
          this.sonicBoom(api, piece, midX, midY, rot);
          bow.boostT0 = scene.time.now;                  // 여기서부터 갈래가 조금 길고 진하게
          // 가속 구간 — 바람선 길게, 잔상 촘촘하게 (상한만큼 더)
          wind.setDisplaySize(windW * P.sonicWindLen, wind.displayHeight);
          ghosts += P.sonicTrailMax;
          scene.tweens.add({
            targets: piece, x: landX, y: landY, duration: t2, ease: 'Linear',
            onUpdate: () => follow(1, P.sonicTrailMs),
            onComplete: () => this.land(scene, piece, wind, bow, landX, landY, api),
          });
        },
      });
      return;
    }

    scene.tweens.add({
      targets: piece,
      x: landX,
      y: landY,
      duration,
      ease: 'Quad.easeIn',                      // 가속해서 내리꽂는다
      onUpdate: (tw: Phaser.Tweens.Tween) => follow(tw.progress, P.chessTrailMs),
      onComplete: () => this.land(scene, piece, wind, bow, landX, landY, api),
    });
  }

  /** 앞 끝 공기 가르기 — 열기 점 하나 + V자 공기 갈래 (chessBowAngles 수만큼). 필터·시트 없음 */
  private makeAirBow(scene: Phaser.Scene, x: number, y: number): AirBow {
    const P = TED_PARAMS;
    const glow = fxSprite(scene, x, y, 'fx_proc_glow', {
      scale: [P.chessBowGlow[0], P.chessBowGlow[0]], alpha: 0, depth: CHESS_DEPTH + 1, blend: 'add', tint: 0xfff0dc,
      lifeMs: 4000, slot: 'tedBowGlow', maxConcurrent: P.chessMaxAlive + 2,
    });
    if (glow) this.tracked.add(glow);
    // 선은 앞 끝에서 뒤로 뻗는다 — 원점을 왼쪽 끝(앞 끝)에 둔다. 말 밑(말이 안쪽을 가리고 몸통 밖으로 나온 갈래만 보인다)
    const lines = P.chessBowAngles.map(() => {
      const ln = scene.add.image(x, y, WIND_TEXTURE).setOrigin(0, 0.5).setDepth(CHESS_DEPTH - 0.3)
        .setTint(0xf6f9ff).setAlpha(0);
      this.tracked.add(ln);
      return ln;
    });
    return { glow, lines, boostT0: -1 };
  }

  /**
   * 공기 가르기 한 프레임 — 위치·회전·크기·알파만 (필터 없음).
   * heat = 낙하 진행에 따른 짙기(0~1), boost = 소닉붐 뒤 0→1 (chessBowBoostMs) — 갈래 길이 ×chessBowBoost 이내
   */
  private stepAirBow(scene: Phaser.Scene, bow: AirBow, nx: number, ny: number, rad: number, h: number, heat: number): void {
    const P = TED_PARAMS;
    const now = scene.time.now;
    const k = bow.boostT0 >= 0 ? Math.min(1, (now - bow.boostT0) / P.chessBowBoostMs) : 0;
    const lerp = (a: number, b: number) => a + (b - a) * k;
    const hot = Math.min(1, heat);
    bow.glow?.setPosition(nx, ny).setScale(lerp(P.chessBowGlow[0], P.chessBowGlow[1]))
      .setAlpha(lerp(P.chessBowGlowAlpha[0], P.chessBowGlowAlpha[1]) * hot);
    // 진행 반대 방향 각도 (화면) — 진행 벡터 (sin rad, cos rad) 의 반대
    const back = Math.atan2(-Math.cos(rad), -Math.sin(rad));
    const len = h * P.chessBowLen * lerp(1, P.chessBowBoost);
    const a = lerp(P.chessBowAlpha[0], P.chessBowAlpha[1]) * hot;
    bow.lines.forEach((ln, i) => {
      const wob = 1 + 0.08 * Math.sin(now / 41 + i * 2.1);   // 바람 너울 — 길이만 살짝
      ln.setPosition(nx, ny).setRotation(back + Phaser.Math.DegToRad(P.chessBowAngles[i]))
        .setDisplaySize((len * wob * STREAK_TEX) / STREAK_LINE_LEN, (P.chessBowWidth * STREAK_TEX) / STREAK_LINE_W).setAlpha(a);
    });
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
   * **좁은 화면에서는 칸이 말보다 훨씬 좁다.** 말 폭은 `chessHeight × 0.75` 인데
   * 말 10개 기준 칸너비는 폭 360 에서 30px, 390 에서 33px, 430 에서 37px 다 —
   * 10개를 안 겹치게 세우려면 `말 폭 × 10 + 여백` 이 필요하고, 그런 세로 화면은 없다.
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
  /**
   * 소닉붐 — 말 둘레로 원뿔형 증기 링(진행 방향에 눕힌 타원 두 겹)이 터지고, 그 지점에서 둥근 파장이 퍼진다.
   * 파장은 텍스처 한 장(proc-ring)을 stepSonicWaves 가 매 프레임 배율·알파로 키우고, 닿은 똥을 지운다
   */
  private sonicBoom(api: GameSceneAPI, piece: Phaser.GameObjects.Image, x: number, y: number, rot: number): void {
    const { scene } = api;
    const P = TED_PARAMS;
    const h = piece.displayHeight;
    // 원뿔 — 말 몸통 둘레(앞쪽 작은 링 · 뒤쪽 큰 링). 로컬 x = 진행에 수직이라 x 로 넓고 y 로 납작하게
    const back = (k: number) => ({ x: x - Math.sin(-rot) * h * k, y: y - Math.cos(-rot) * h * k });
    [{ k: 0.45, w: 0.9, a: 0.95 }, { k: 0.85, w: 1.5, a: 0.7 }].forEach((c, i) => {
      const p = back(c.k);
      const s0 = (h * c.w) / RING_ART_D;
      const cone = fxSprite(scene, p.x, p.y, 'fx_proc_ring', {
        rotation: rot, scale: [s0, s0 * 0.32], alpha: c.a * 0.8, depth: CHESS_DEPTH + 1, blend: 'normal', tint: 0xffffff,
        lifeMs: P.sonicConeMs + 60, slot: 'tedSonicCone', maxConcurrent: P.sonicRingMax * 2,
      });
      if (!cone) return;
      this.trackedAny.add(cone);
      scene.tweens.add({
        targets: cone, scaleX: s0 * (1.9 + i * 0.4), scaleY: s0 * 0.32 * (1.6 + i * 0.3), alpha: 0,
        duration: P.sonicConeMs, ease: 'Cubic.easeOut', onComplete: () => this.discardAny(cone),
      });
    });
    // 순간 섬광 — 붐 지점에 작은 흰 빛 한 번
    const flash = fxSprite(scene, x, y, 'fx_proc_glow', {
      scale: [0.35, 0.35], alpha: 0.9, depth: CHESS_DEPTH + 1, blend: 'add', tint: 0xffffff,
      lifeMs: 160, slot: 'tedSonicFlash', maxConcurrent: P.sonicRingMax,
    });
    if (flash) {
      this.trackedAny.add(flash);
      scene.tweens.add({ targets: flash, scale: 0.7, alpha: 0, duration: 120, onComplete: () => this.discardAny(flash) });
    }
    // 둥근 파장 — 상한을 넘으면 가장 오래된 것부터 끝낸다
    if (this.sonicWaves.length >= P.sonicRingMax) this.endSonicWave(this.sonicWaves.shift()!);
    // 충격파 — builder B 시트 (응결 원반 → 얇은 링·바람 줄기 → 옅어짐). 칸은 stepSonicWaves 가 시각으로 고른다
    const sheetKey = fxPickSheetKey(TED_SONIC_SHEET);
    const ring = scene.textures.exists(sheetKey)
      ? scene.add.sprite(x, y, sheetKey, 0).setDepth(CHESS_DEPTH + 0.5).setScale(P.sonicRingR / SONIC.ringR)
      : null;
    // 바깥 보강 겹 — 아주 옅은 어두운 띠 (밝은 구름 위 대비)
    const rim = scene.textures.exists(SONIC_RIM_KEY)
      ? scene.add.image(x, y, SONIC_RIM_KEY).setDepth(CHESS_DEPTH + 0.45).setAlpha(0)
      : null;
    for (const o of [ring, rim]) if (o) this.trackedAny.add(o);
    this.sonicWaves.push({ x, y, t0: scene.time.now, prevR: 0, ring, rim });
    impact(scene, { shake: { duration: 70, intensity: 0.003 } });
  }

  /** 파장 진행 — 링을 키우며 흐리고, 이번 프레임에 쓸고 지나간 반경 띠(prevR − 띠 ~ r + 띠) 안의 똥을 지운다 */
  private stepSonicWaves(api: GameSceneAPI, now: number): void {
    const P = TED_PARAMS;
    for (const w of this.sonicWaves.slice()) {
      const u = Math.min(1, (now - w.t0) / P.sonicRingMs);
      const r = P.sonicRingR * (1 - (1 - u) ** 3);     // Cubic.Out
      // 시트 6칸을 sonicRingMs 동안 — 링 반지름이 판정 반경을 따라간다 (한 배율)
      w.ring?.setFrame(Math.min(SONIC.frames - 1, Math.floor(u * SONIC.frames)));
      // 보강 겹 — 링이 생기는 칸(2~)부터 판정 반경에, 옅게
      w.rim?.setScale(r / SONIC_RIM_EDGE).setAlpha(u >= 2 / SONIC.frames ? P.sonicRimAlpha * (1 - u) : 0);
      // 판정 — 거리 비교만 (반경 띠). 한 프레임에 크게 퍼져도 지나친 구간 전체를 본다
      const lo = Math.max(0, w.prevR - P.sonicRingBand);
      const hi = r + P.sonicRingBand;
      let n = 0;
      for (const p of (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice()) {
        if (!p.active) continue;
        const d = Math.hypot(p.x - w.x, p.y - w.y);
        if (d < lo || d > hi) continue;
        (p as unknown as PoolablePoopBase).recycle();   // 특수 똥 처리는 체스 낙하(smashPoops)와 같다
        n++;
      }
      if (n > 0) this.awardBonus(api, n * P.chessPoopPoints);
      w.prevR = r;
      if (u >= 1) {
        this.endSonicWave(w);
        this.sonicWaves.splice(this.sonicWaves.indexOf(w), 1);
      }
    }
  }

  private endSonicWave(w: SonicWave): void {
    if (w.ring) this.discardAny(w.ring);
    if (w.rim) this.discardAny(w.rim);
    w.ring = null;
    w.rim = null;
  }

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
    bow: AirBow,
    x: number,
    y: number,
    api: GameSceneAPI,
  ): void {
    if (!piece.active) return;

    // 공기 갈래·열기 점은 흙더미에 닿으며 짧게 사라진다 (작은 김 한 줌)
    for (const f of [bow.glow, ...bow.lines]) {
      if (!f) continue;
      scene.tweens.add({
        targets: f, alpha: 0, scaleX: f.scaleX * 0.4, duration: 90, ease: 'Quad.easeOut',
        onComplete: () => this.discard(f),
      });
    }
    burst(scene, x, y - piece.displayHeight * 0.1, 'smoke', {
      count: 1, scale: 0.25, depth: CHESS_DEPTH + 1, tint: this.landFx?.smoke,
    });

    scene.tweens.add({
      targets: wind,
      alpha: 0,
      displayHeight: wind.displayHeight * 2.4,  // 부딪히며 옆으로 퍼진다 (두께가 세로 축이다)
      duration: 150,
      onComplete: () => this.discard(wind),
    });

    // 흙더미가 솟으므로 흙먼지는 줄인다 (6 → chessLandSmoke)
    burst(scene, x, y, 'smoke', {
      count: TED_PARAMS.chessLandSmoke, scale: 0.5, depth: CHESS_DEPTH + 1, tint: this.landFx?.smoke,
    });

    const h = piece.displayHeight;
    scene.tweens.add({
      targets: piece,
      displayHeight: h * 0.88,                  // 박히는 순간의 눌림
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    // 땅에 박힌다 — 진행 방향(말의 축)으로 키의 sinkRatio 만큼 더 파고든다.
    // 바닥선 아래는 공용 마스크가 가리고, 잘린 경계는 앞의 흙더미가 덮는다
    const sink = h * TED_PARAMS.chessSinkRatio;
    scene.tweens.add({
      targets: piece,
      x: x - Math.sin(piece.rotation) * sink,
      y: y + Math.cos(piece.rotation) * sink,
      duration: 60,
      ease: 'Quad.easeOut',
    });
    this.addLandDeco(scene, piece, x, y);

    // 꽂힌 말은 그대로 바닥에 남는다. 다 차면 한꺼번에 걷어낸다
    this.flying--;
    this.landed.push(piece);
    if (this.landed.length >= TED_PARAMS.chessStackMax) this.clearBoard(api);
  }

  // ── 땅에 박힌 느낌 — 밑동 흙더미 + 균열 ──────────────────────────────
  // 텍스처는 판 시작 때 배경 땅 팔레트로 한 번 굽는다 (bakeLandDecoTextures). 말마다 이미지 두 장 (더미·균열),
  // 꽂힌 말 상한(chessStackMax)만큼만 존재한다

  /** 착지 — 균열은 말 뒤 땅에, 흙더미는 말 앞에서 솟아오른다 */
  private addLandDeco(scene: Phaser.Scene, piece: Phaser.GameObjects.Image, x: number, y: number): void {
    const P = TED_PARAMS;
    const fx = this.landFx;
    if (!fx || !scene.textures.exists(fx.mound)) return;
    const crack = scene.add.image(x, y, fx.crack).setOrigin(0.5, LAND_CRACK_ORIGIN_Y)
      .setDepth(CHESS_DEPTH - 0.5).setAlpha(0).setScale(0.6 * P.chessMoundScale, P.chessMoundScale);
    const mound = scene.add.image(x, y, fx.mound).setOrigin(0.5, LAND_MOUND_ORIGIN_Y)
      .setDepth(CHESS_DEPTH + 0.5).setScale(P.chessMoundScale * 0.3);
    this.tracked.add(crack);
    this.tracked.add(mound);
    scene.tweens.add({ targets: crack, alpha: P.chessCrackAlpha, scaleX: P.chessMoundScale, duration: 90, ease: 'Cubic.easeOut' });
    // 솟아오르는 짧은 팝 — 조금 넘쳤다 돌아온다
    scene.tweens.add({ targets: mound, scale: P.chessMoundScale, duration: P.chessMoundPopMs, ease: 'Back.easeOut' });
    this.landDeco.set(piece, { mound, crack, groundY: y });
    // 바닥선 아래를 가린다
    this.ensureGroundMask(scene);
    if (this.groundMask) piece.setMask(this.groundMask);
    this.redrawGroundMask(piece);
  }

  /** 말이 걷힐 때 — 흙더미·균열이 짧게 꺼진다 */
  private fadeLandDeco(scene: Phaser.Scene, piece: Phaser.GameObjects.Image): void {
    const d = this.landDeco.get(piece);
    if (!d) return;
    this.landDeco.delete(piece);
    for (const o of [d.mound, d.crack]) {
      scene.tweens.killTweensOf(o);
      scene.tweens.add({
        targets: o, alpha: 0, scaleY: o.scaleY * 0.6, duration: TED_PARAMS.chessLandDecoFadeMs,
        onComplete: () => this.discard(o),
      });
    }
  }

  private ensureGroundMask(scene: Phaser.Scene): void {
    if (this.groundMaskG) return;
    // 화면에 그리지 않는 그래픽 — 마스크 모양으로만 쓴다
    this.groundMaskG = scene.make.graphics({}, false);
    this.groundMask = this.groundMaskG.createGeometryMask();
  }

  /**
   * 마스크 = 꽂힌 말마다 "그 말의 바닥선 위" 사각형의 합. 말이 기울어 있어 가로 폭을 키만큼 넉넉히 잡는다.
   * `extra` 는 아직 landed 에 들어가기 전인 방금 꽂힌 말
   */
  private redrawGroundMask(extra?: Phaser.GameObjects.Image): void {
    const g = this.groundMaskG;
    if (!g) return;
    g.clear();
    g.fillStyle(0xffffff, 1);
    const pieces = extra ? [...this.landed, extra] : this.landed;
    for (const p of pieces) {
      const d = this.landDeco.get(p);
      if (!d) continue;
      const half = TED_PARAMS.chessHeight;
      g.fillRect(p.x - half, -2000, half * 2, d.groundY + 2000);
    }
  }

  /**
   * 꽂힌 말이 다 차면 — **화면 가운데로 빨려 들어가 모였다가 사방으로 퍼진다.**
   *
   * 출발만 어긋뜨리고 **도착은 한 시점에 모은다** (dur = chessSuckMs - delay) —
   * 제각각 도착하면 '모였다' 가 안 읽힌다. 다 모이면 spreadHoldMs 멈칫한 뒤 {@link startSpread}.
   *
   * 시간은 씬 타이머가 아니라 `scene.time.now` 기준 경과로 잰다 — `Clock.now` 는
   * `timeScale` 을 보지 않아 히트스톱에도 연출이 밀리지 않는다.
   */
  private clearBoard(api: GameSceneAPI): void {
    const { scene } = api;
    const board = this.landed;
    this.landed = [];
    // 흙더미·균열은 제자리에 남기지 않는다 — 말이 빨려 나가는 동안 짧게 꺼진다.
    // 말은 마스크를 풀어야 바닥선 아래로도 날아간다
    for (const p of board) {
      this.fadeLandDeco(scene, p);
      p.clearMask();
    }
    this.redrawGroundMask();
    // 판이 비었으니 주머니도 새로 — 상한(chessMaxAlive)에 걸려 건너뛴 낙하가 있으면
    // 남은 칸이 어긋난 채로 다음 판에 넘어간다
    this.landSlots = [];

    // 이미 재생 중이면 이번 판은 조용히 걷어낸다. 큐에 쌓아 두면 엉뚱한 시점에 터진다
    if (this.stage !== null) {
      for (const p of board) this.discard(p);
      return;
    }

    this.cancelled = false;
    this.stage = 'gather';
    this.gatherT0 = scene.time.now;

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

    // 다 모이면 잠깐 멈췄다가 사방으로 터져 나간다
    this.cues = [{
      at: TED_PARAMS.chessSuckMs + TED_PARAMS.spreadHoldMs,
      fn: (a: GameSceneAPI) => this.startSpread(a),
    }];
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



  /** 흡수 — 목표가 매 프레임 움직이므로 트윈이 아니라 직접 보간한다 */
  private stepSuck(api: GameSceneAPI, t: number): void {
    const c = gatherCenter(api.scene);
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
      // 말을 버리지 않는다. 중앙에 세워 두고 발사를 기다린다.
      // **원점을 발에서 머리로 옮긴다** — 퍼질 때는 머리가 진행 방향 앞끝이라
      // 회전축도 판정 끝점도 거기여야 한다 (자세한 이유는 HEAD_ORIGIN_Y 주석)
      p.ob.setOrigin(0.5, headOriginY(p.ob.frame?.name));
      p.ob.setPosition(c.x, c.y).setRotation(0).setAlpha(1);
      p.ob.setDisplaySize(p.w0 * 0.34, p.h0 * 0.34);
      this.spreadReady.push(p.ob);
    }
    if (!alive) this.sucking = [];
  }




  /**
   * 마무리 — **모인 말이 사방으로 퍼진다.**
   *
   * 모였다가 바로 터져 나가고, **퍼지는 말이 지나간 자리의 똥만** 지워진다 (화면 전체를 쓸지 않는다).
   */
  private startSpread(api: GameSceneAPI): void {
    if (this.cancelled || this.stage !== 'gather') return;
    const { scene } = api;
    if (!scene.scene || !scene.scene.isActive()) { this.stage = null; return; }

    const t = scene.time.now - this.gatherT0;
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

    this.stage = 'spread';
    this.spreadT0 = scene.time.now;
    const c = gatherCenter(scene);

    impact(scene, {
      hitstop: TED_PARAMS.spreadHitstopMs,
      shake: { duration: 260, intensity: 0.006 },
    });
    this.lockFlash(api);                       // 터져 나가는 순간의 섬광

    // 파동은 **말보다 짧다** (최대 화면 폭 0.95 vs 말은 모서리 밖). 말이 파동을
    // 앞지르는데, 그대로 뒀다 — 파동은 9프레임 30fps = 300ms 만에 알파가 0 이 되고
    // 말은 그 뒤로도 300ms 를 더 날아간다. 둘이 같이 보이는 구간에서는 여전히 파동이
    // 앞서므로 앞지르는 장면 자체가 화면에 없다. 파동을 화면 밖까지 키우면 보이지도
    // 않는 곳을 덧그리는 오버드로만 늘어난다
    // **실제로 터진 시각 기준**이다. 예약 시각으로 잡으면 발사가 밀렸을 때
    // 파동이 이미 지난 시각에 걸려 한 프레임에 다 쏟아진다
    for (const v of WAVE_VOLLEY) {
      this.cues.push({ at: t + v.delay, fn: (a: GameSceneAPI) => this.waveLayer(a, v) });
    }
    this.cues.sort((x, y) => x.at - y.at);

    // 발동 정액 보너스. **빗장이 먼저다** — addAbilityBonus 는 점수를 1씩 올리며
    // 마일스톤을 호출하므로 그냥 주면 그 자리에서 다음 낙하가 연쇄로 걸린다
    this.awardBonus(api, TED_PARAMS.spreadBonusPoints);

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
    const c = gatherCenter(api.scene);
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
      this.stage = null;
    }
  }

  /** 파동 한 겹. 중심은 말이 모이는 **화면 중앙**이다 */
  private waveLayer(api: GameSceneAPI, v: typeof WAVE_VOLLEY[number]): void {
    if (this.cancelled) return;
    // 도달 반지름을 화면 폭에서 역산한다. 프레임 크기에 묶으면 기기마다 범위가 달라진다
    const finalScale = (v.reach * api.scene.scale.width) / WAVE_UNIT_R;
    const c = gatherCenter(api.scene);
    playFx(api.scene, 'cubeWave', c.x, c.y, {
      depth: WAVE_DEPTH,
      scale: finalScale / v.grow,
      scaleTo: v.grow,
      alpha: v.alpha,
      blend: 'normal',
      ...(WAVE_TINT !== null ? { tint: WAVE_TINT } : {}),
    });
  }

  // ══ 액티브 스킬 "어센트" ═══════════════════════════════════════════
  //
  // 흑백 3x3 큐브가 층별로 돌다가 한 면이 순백/순흑으로 맞춰진다. **랜덤**이고
  // 나온 색이 뒤에 붙는 효과를 가른다.
  //
  // 즉시 전체 제거는 **양쪽 공통**이다 — 뒤에 붙는 것만 갈린다. 안 그러면
  // "흑을 뽑으면 손해" 가 되어 스킬이 슬롯머신이 된다.
  //
  // 컷신은 씬 타이머가 아니라 {@link ascentCues} + `scene.time.now` 로 돈다.
  // 히트스톱이 씬 타이머를 멈추기 때문에, 타이머로 짜면 박자가 밀린다
  // (모임→퍼짐 연출이 같은 이유로 큐를 쓴다).

  /**
   * 컷신 동안 무적. **물리는 멈추지 않는다** — 안티치트가 프레임 간격을 보기 때문에
   * 시간을 멈추면 부정 탐지에 걸린다. 보이는 것만 멈추고 피격만 무시한다.
   */
  override onHitPoop(api: GameSceneAPI): boolean {
    return api.scene.time.now < this.ascentInvincibleUntil;
  }

  override getActiveChargeScore(): number { return TED_PARAMS.ascentChargeScore; }
  override getActiveMaxCharges(): number { return TED_PARAMS.ascentMaxCharges; }
  override getActiveStartCharges(): number { return TED_PARAMS.ascentStartCharges; }

  /** 컷신 큐가 남아 있거나 소환(summonMs) 중이면 다시 누를 수 없다 (대표 결정 — 소환 중 재발동 금지) */
  override canUseActive(api: GameSceneAPI): boolean {
    return !this.cancelled && this.ascentCues.length === 0 && !(this.summonUntil > api.scene.time.now);
  }

  override onActiveSkill(api: GameSceneAPI): void {
    const { scene } = api;
    this.ascentT0 = scene.time.now;

    const T = ascentTiming();
    // 장면 1~6 은 layoutInk 가 시각으로 그린다. 큐에는 확정(revealMs)·효과(effectMs)·끝·소환만 건다
    const q: { at: number; fn: (a: GameSceneAPI) => void }[] = [
      { at: T.revealMs, fn: (a) => this.ascentReveal(a) },
      { at: T.effectMs, fn: (a) => this.ascentEffect(a) },
      { at: T.endMs, fn: () => this.inkEnd() },
      // 소환 큐브·8초 카운트·낙하 박자·수순 재생은 **컷신이 다 걷힌 순간(endMs)부터** — 효과(똥 제거)는 걷히기 직전 그대로.
      // 같은 시각의 inkEnd 보다 뒤에 넣는다 (Array.prototype.sort 는 안정 정렬이라 넣은 순서대로 돈다)
      { at: T.endMs, fn: (a) => this.startSummon(a) },
    ];
    // 끝 큐가 남아 있는 동안은 다시 누를 수 없다 (canUseActive)
    q.sort((x, y) => x.at - y.at);
    this.ascentCues = q;

    // 컷신 동안 무적 = 전체 길이 — 물리는 멈추지 않는다 (안티치트)
    this.ascentInvincibleUntil = scene.time.now + T.endMs;

    this.inkIn(api);
    this.layoutInk(api, 0);
  }

  // ── 충전 큐브 (액티브 충전 게이지) ─────────────────────────────────
  // 결과가 하나라 큐브는 **흑 경로 하나로 고정** — 실제 면 회전으로 앞면이 검게 맞춰진다 (소환 큐브와 같은 색).
  // 수순·진행률 문턱은 tedChargeCube.gen.ts (charge_cube.py 가 시뮬레이션·불변식 검사 후 생성).
  //   큰 큐브 = 지금 채우는 칸 (진행률은 큐브가 보여 준다 — 진행 링은 쓰지 않는다)
  //   버튼 둘레 링 두 개 = 다 찬 칸 수 (중립색 한 가지). 안쪽 = 먼저 찬 칸(다음 발동), 바깥 = 두 번째
  //   칸이 가득(max)이면 채우는 칸이 없다 — 큰 큐브는 완성 모습 + 발광 맥동

  override createActiveChargeView(api: GameSceneAPI, btn: { x: number; y: number; r: number; s: number }): boolean {
    const { scene } = api;
    const C = TED_CHARGE_CUBE;
    // 흑 경로 하나 — 흑 시트만 본다. (백 시트 로드를 뺀 뒤에도 둘 다 요구해 false → GameScene 이 숫자 표시로 떨어졌었다)
    if (!scene.textures.exists(fxPickSheetKey(C.black))) return false;
    const cv = this.cv;
    cv.btn = btn;
    // 버튼 배율(btn.s)을 큐브·링·발광에 똑같이 곱한다 — 72px 시트를 그대로 줄여 그린다 (0.5 → 36px)
    const sc = btn.s;
    cv.glow = scene.add.circle(btn.x, btn.y, btn.r + (CHARGE_RING_GAP * 2 + 6) * sc).setStrokeStyle(4 * sc, 0xffffff, 1)
      .setDepth(11.5).setScrollFactor(0).setVisible(false);
    cv.rings = scene.add.graphics().setDepth(12).setScrollFactor(0);
    cv.big = scene.add.sprite(btn.x, btn.y - sc, fxPickSheetKey(C.black), 0).setScale(sc).setDepth(12.5).setScrollFactor(0);
    this.trackedAny.add(cv.glow);
    this.trackedAny.add(cv.rings);
    this.trackedAny.add(cv.big);
    return true;
  }

  override updateActiveChargeView(api: GameSceneAPI, st: { charges: number; max: number; progress: number; usable: boolean }): void {
    const cv = this.cv;
    if (!cv.big || !cv.btn) return;
    const C = TED_CHARGE_CUBE;
    const maxed = st.charges >= st.max;
    // 큰 큐브 — 채우는 칸 (가득이면 완성 모습). 흑 경로 하나
    const key = fxPickSheetKey(C.black);
    let move = -1;                                        // 지나간 마지막 수 (0부터), -1 = 아직 시작 전
    if (maxed) move = C.moves - 1;
    else for (let k = 0; k < C.moves; k++) if (st.progress >= C.thresholds[k]) move = k;
    const now = api.scene.time.now;
    if (cv.big.texture.key !== key || move < cv.move) {
      // 다른 칸으로 넘어갔다 (새 칸 시작·발동) — 도는 동작 없이 그 수의 정지 모습으로
      cv.big.setTexture(key);
      cv.animFrom = -1;
      cv.animT0 = -1;
    } else if (move > cv.move) {
      cv.animFrom = cv.move;                              // 이 사이의 수를 차례로 45ms 씩 돌린다
      cv.animT0 = now;
    }
    cv.move = move;
    // 링 두 개 — 안쪽 = 먼저 찬 칸(다음 발동), 바깥 = 두 번째로 찬 칸. 가득이면 셋째 칸은 큰 큐브에 있다
    const next = [st.charges >= 1, st.charges >= 2];
    const fired = st.charges < cv.charges;                 // 발동 — 바깥 칸이 안쪽으로 당겨진다
    next.forEach((on, i) => {
      const slot = cv.slots[i];
      if (on === slot.filled && !fired) return;
      if (fired && i === 0 && on && cv.slots[1].filled) {
        slot.fromR = 1;                                   // 바깥 자리에서 안쪽으로 줄어든다
        slot.fill0 = -1;
      } else {
        slot.fromR = -1;
        slot.fill0 = on ? now : -1;                       // 새로 찬 칸 — 한 번 짧게 차오른다
      }
      slot.filled = on;
      slot.t0 = now;
    });
    cv.charges = st.charges;
    if (maxed && !cv.maxed) cv.maxT0 = now;               // 가득 — 이때부터 통째로 천천히 돈다
    cv.maxed = maxed;
    this.drawChargeRings(now);
    cv.glow!.setVisible(maxed).setStrokeStyle(4 * cv.btn.s, CHARGE_RING_COLOR, 1);
    cv.dim = !st.usable;
    const a = cv.dim ? CHARGE_DIM_ALPHA : 1;
    cv.big.setAlpha(a);
    cv.rings?.setAlpha(a);
    this.stepChargeCube(now);
  }

  /**
   * 충전 링 두 개 — 다 찬 칸 = 중립색 한 가지(CHARGE_RING_COLOR) / 빈 칸 = 회색 트랙.
   * 새로 찬 칸은 12시부터 CHARGE_RING_MS 동안 한 바퀴 차오르고, 발동 때 바깥 칸은 안쪽 자리로 줄어든다.
   * 연출 중에만 매 프레임 다시 그린다 (onUpdate)
   */
  private drawChargeRings(now: number): boolean {
    const cv = this.cv;
    const g = cv.rings;
    if (!g || !cv.btn) return false;
    const { x, y, r, s: sc } = cv.btn;
    const radius = (i: number) => r + CHARGE_RING_GAP * sc * (i + 1);
    g.clear();
    let busy = false;
    cv.slots.forEach((slot, i) => {
      const t = Phaser.Math.Clamp((now - slot.t0) / CHARGE_RING_MS, 0, 1);
      if (t < 1) busy = true;
      const e = Phaser.Math.Easing.Cubic.Out(t);
      const R = slot.fromR >= 0 ? Phaser.Math.Linear(radius(slot.fromR), radius(i), e) : radius(i);
      g.lineStyle(4 * sc, 0x2a2d36, 0.8).strokeCircle(x, y, radius(i));     // 빈 트랙
      if (!slot.filled) return;
      const sweep = slot.fill0 >= 0 ? Math.PI * 2 * e : Math.PI * 2;
      const a0 = -Math.PI / 2;
      const arc = (w: number, col: number) => {
        g.lineStyle(w, col, 1);
        g.beginPath();
        g.arc(x, y, R, a0, a0 + sweep, false);
        g.strokePath();
      };
      arc(4 * sc, CHARGE_RING_COLOR);
    });
    return busy;
  }

  /** 큰 큐브 프레임 — 지나간 수가 늘었으면 그 수들을 차례로 (한 수 = 45° 칸 한 장 × CHARGE_TURN_MS) 돌린다 */
  private stepChargeCube(now: number): void {
    const cv = this.cv;
    if (!cv.big) return;
    const C = TED_CHARGE_CUBE;
    const rest = (k: number) => (k < 0 ? 0 : (k + 1) * (C.midFrames + 1));
    let f = rest(cv.move);
    if (cv.animT0 >= 0 && cv.animFrom < cv.move) {
      const per = CHARGE_TURN_MS;                         // 한 수 = 정지 → 45° (이 시간) → 정지
      const e = now - cv.animT0;
      const k = cv.animFrom + 1 + Math.floor(e / per);    // 지금 도는 수
      // 45° 칸이 빈 수(midMissing)는 중간 없이 그 수의 정지로 — 빈 칸은 절대 띄우지 않는다
      const missing = (C.midMissing.black as readonly number[]).includes(k);
      if (k <= cv.move) f = missing ? rest(k) : 1 + k * (C.midFrames + 1) + Math.min(C.midFrames - 1, Math.floor((e % per) / (per / C.midFrames)));
      else cv.animT0 = -1;                               // 다 돌았다
    }
    cv.big.setFrame(f);
    // 가득이면 맞춰진 큐브가 **통째로** 천천히 돈다 (층 회전 없이 전체 회전 — 앞면 9/9 유지, 규칙 위반 없음)
    cv.big.setRotation(cv.maxed ? (now - cv.maxT0) * CHARGE_IDLE_SPIN : 0);
    if (cv.maxed && cv.glow) cv.glow.setAlpha((0.45 + 0.4 * Math.sin(now / 160)) * (cv.dim ? CHARGE_DIM_ALPHA : 1));
    cv.ringsBusy = this.drawChargeRings(now);
  }

  /** 판 시작 — 착지 잔해·소닉붐 테두리·수묵 텍스처를 미리 굽는다 (발동 프레임에 굽지 않게) */
  override onCreate(api: GameSceneAPI): void {
    super.onCreate(api);
    this.landFx = bakeLandDecoTextures(api.scene, api.backgroundKey);
    bakeSonicRimTexture(api.scene);
    this.bakeInkTextures(api.scene);
  }

  // ── 수묵 (ink) ─────────────────────────────────────────────────
  // 순서 (대표 지시 2026-10-05) — 박자는 TED_PARAMS.ink 머리 주석
  // 검정 위 흰 눈 세트 → 얼굴이 켜지며 세트가 녹아듦 → 눈빛 폭발이 화선지로 번짐 (paperCover)
  // → 화선지 붓질·먹 튀김·형체·연기 → 와이프 → 소용돌이가 삼켜 검정 → 섬광·각성
  // → 섬광·풀컬러 테드 → 바람 → 큐브 손동작 (확정·효과는 ascentReveal·ascentEffect) → 걷힘
  // 오브젝트 12개를 발동 때 한 번 만들고, 매 프레임 **칸·위치·알파만** 바꾼다 (필터·트윈·생성 없음).
  // 박자를 시각(ta)으로 계산하므로 프레임이 건너뛰어도 박자가 밀리지 않는다

  private inkIn(api: GameSceneAPI): void {
    const { scene } = api;
    const { width: W, height: H } = scene.scale;
    const D = ASCENT_DEPTH + 2;
    const rect = (color: number, depth: number) => {
      const r = scene.add.rectangle(W / 2, H / 2, W, H, color, 1).setDepth(depth).setScrollFactor(0).setAlpha(0);
      this.trackedAny.add(r);
      return r;
    };
    const spr = (key: string, depth: number) => {
      const o = scene.add.sprite(W / 2, H / 2, scene.textures.exists(key) ? key : '__DEFAULT', 0)
        .setDepth(depth).setScrollFactor(0).setVisible(false);
      this.trackedAny.add(o);
      return o;
    };
    const S = TED_INK;
    const irisGlow = S.iris.map(() => {
      const g = scene.add.image(W / 2, H / 2, 'fx_proc_glow').setDepth(D + 0.52).setScrollFactor(0)
        .setBlendMode(Phaser.BlendModes.ADD).setTint(0xe1eeff).setVisible(false);
      this.trackedAny.add(g);
      return g;
    });
    const irisHaze = S.iris.map((_, i) => {
      const key = `${S.irisHazeKey}_${i}`;
      const h = scene.add.image(W / 2, H / 2, scene.textures.exists(key) ? key : '__DEFAULT').setDepth(D + 0.51)
        .setScrollFactor(0).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.trackedAny.add(h);
      return h;
    });
    const img = (key: string, depth: number) => {
      const o = scene.add.image(W / 2, H / 2, scene.textures.exists(key) ? key : '__DEFAULT')
        .setDepth(depth).setScrollFactor(0).setVisible(false);
      this.trackedAny.add(o);
      return o;
    };
    const irisCore = S.iris.map((_, i) => img(`${S.irisCoreKey}_${i}`, D + 0.505).setBlendMode(Phaser.BlendModes.ADD));
    this.ink = {
      irisCore,
      burst: img(S.burstKey, D + 0.6),
      paper: rect(S.paper, D),
      form: spr(S.form, D + 0.1),
      smoke: spr(S.smoke, D + 0.1),
      stroke: spr(S.stroke, D + 0.2),
      wipe: spr(S.wipe, D + 0.25),
      awakeBurst: spr(S.awakeBurst, D + 0.6),
      swirl: spr(S.swirl, D + 0.3),
      dark: rect(0x000000, D + 0.35),
      main: spr(S.face[0], D + 0.4),
      eyes: spr(S.eyes, D + 0.5).setBlendMode(Phaser.BlendModes.ADD),
      irisGlow,
      irisHaze,
      splash: spr(S.splash, D + 0.6),
      paperCover: rect(S.paper, D + 0.65),
      flash: rect(0xffffff, D + 0.7),
      curtainL: rect(S.paper, D + 0.9).setVisible(false),
      curtainR: rect(S.paper, D + 0.9).setVisible(false),
    };
  }

  /** 판 시작 — 둥근 얼굴·진한 먹을 캔버스에 한 번 굽는다 (발동 프레임에 굽지 않게). 매 프레임 마스크·필터는 없다 */
  private bakeInkTextures(scene: Phaser.Scene): void {
    const S = TED_INK;
    const cut = (key: string, frame: number) => {
      if (!scene.textures.exists(key)) return null;
      const tex = scene.textures.get(key);
      const fr = tex.get(frame);
      return { src: tex.getSourceImage() as CanvasImageSource, fr };
    };
    // 홍채 아지랑이 — 눈마다 홍채 둘레를 부드러운 타원 알파로 (64x56 두 장)
    const eye7 = cut(S.eyes, S.irisHazeFrame);
    S.iris.forEach((p, i) => {
      const key = `${S.irisHazeKey}_${i}`;
      if (!eye7 || scene.textures.exists(key)) return;
      const { w, h } = S.irisCrop;
      const tex = scene.textures.createCanvas(key, w, h);
      if (!tex) return;
      const ctx = tex.getContext();
      ctx.drawImage(eye7.src, eye7.fr.cutX + p.x - w / 2, eye7.fr.cutY + p.y - h / 2, w, h, 0, 0, w, h);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(1, h / w);
      const g = ctx.createRadialGradient(0, 0, (w / 2) * 0.45, 0, 0, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-w / 2, -w / 2, w, w);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      tex.refresh();
    });
    // 흰 눈동자 — 홍채·동공만 둥글게 (두 장)
    S.iris.forEach((p, i) => {
      const key = `${S.irisCoreKey}_${i}`;
      if (!eye7 || scene.textures.exists(key)) return;
      const n = S.irisCoreSize;
      const tex = scene.textures.createCanvas(key, n, n);
      if (!tex) return;
      const ctx = tex.getContext();
      ctx.drawImage(eye7.src, eye7.fr.cutX + p.x - n / 2, eye7.fr.cutY + p.y - n / 2, n, n, 0, 0, n, n);
      ctx.globalCompositeOperation = 'destination-in';
      const g = ctx.createRadialGradient(n / 2, n / 2, S.irisCoreR[0], n / 2, n / 2, S.irisCoreR[1]);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, n, n);
      ctx.globalCompositeOperation = 'source-over';
      tex.refresh();
    });
    // 진한 먹 — 알파를 세우고 색은 검정, 가운데 구멍
    const sp = cut(S.splash, S.burstFrame);
    if (sp && !scene.textures.exists(S.burstKey)) {
      const n = sp.fr.cutWidth;
      const tex = scene.textures.createCanvas(S.burstKey, n, n);
      if (tex) {
        const ctx = tex.getContext();
        ctx.drawImage(sp.src, sp.fr.cutX, sp.fr.cutY, n, n, 0, 0, n, n);
        const id = ctx.getImageData(0, 0, n, n);
        const d = id.data;
        const [h0, h1] = S.burstHole;
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const i = (y * n + x) * 4;
            const r = Math.hypot(x - n / 2, y - n / 2) / n;
            const hole = r <= h0 ? 0 : r >= h1 ? 1 : (r - h0) / (h1 - h0);
            const a = Math.min(255, Math.max(0, (d[i + 3] - S.burstAlphaFrom) * S.burstAlphaGain));
            d[i] = 8; d[i + 1] = 8; d[i + 2] = 10;
            d[i + 3] = Math.round(a * hole);
          }
        }
        ctx.putImageData(id, 0, 0);
        tex.refresh();
      }
    }
  }

  /** 한 오브젝트의 텍스처·칸을 바꾼다 (바뀔 때만). 텍스처가 없으면 감춘다 */
  private inkFrame(o: Phaser.GameObjects.Sprite, key: string, frame: number): boolean {
    if (!o.scene.textures.exists(key)) { o.setVisible(false); return false; }
    if (o.texture.key !== key) o.setTexture(key, frame);
    else if (String(o.frame.name) !== String(frame)) o.setFrame(frame);
    o.setVisible(true);
    return true;
  }

  /**
   * 무대 — 게임 캔버스 전체 (그림은 2:3 이라 PC 480x720 은 꽉 차고, 폰은 cover 로 양옆만 잘린다).
   * 캔버스가 2:3 보다 넓어질 때만 가운데 2:3 띠로 제한하고 양옆을 커튼(장면 1 화선지 → 검정)이 덮는다 —
   * 지금 게임은 PC 최대 480x720(style.css) 이라 생기지 않는다
   */
  private inkStage(W: number, H: number) {
    const S = TED_INK;
    const ar = S.artW / S.artH;
    if (W / H <= ar) return { x: 0, y: 0, w: W, h: H };
    const w = H * ar;
    return { x: (W - w) / 2, y: 0, w, h: H };
  }

  /**
   * 그림 배율 — 무대를 덮되(cover), 그 칸의 안전 영역(TED_INK.safe)이 무대 밖으로 나가면 들어올 때까지만 줄인다.
   * 그림은 무대 가운데에 놓인다 (안전 영역 = 원본 좌표).
   * mul — 움직임 확대(밀어 들어가기·펑·휩쓸기 여유). cover 에 곱하되 **안전 한도는 넘지 않는다**
   * padX/padY — 패닝 폭 (무대 px). 그만큼 무대를 좁혀 한도를 잡는다
   */
  private inkFit(key: string, frame: number, sw: number, sh: number, mul = 1, padX = 0, padY = 0): number {
    const S = TED_INK;
    const cover = Math.max(sw / S.artW, sh / S.artH);
    const entry = S.safe[key];
    const r = Array.isArray(entry) ? entry[frame] : entry;
    if (!r) return cover * mul;
    const cx = S.artW / 2;
    const cy = S.artH / 2;
    const fx = (sw / 2 - padX) / Math.max(cx - r.x, r.x + r.w - cx, 1);
    const fy = (sh / 2 - padY) / Math.max(cy - r.y, r.y + r.h - cy, 1);
    return Math.min(cover * mul, fx, fy);
  }

  /** 사각형을 이 자리·크기로 (크기가 바뀔 때만 다시 만든다) */
  private inkRect(r: Phaser.GameObjects.Rectangle, x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    if (r.width !== w || r.height !== h) r.setSize(w, h);
    return r.setPosition(x + w / 2, y + h / 2);
  }

  private layoutInk(api: GameSceneAPI, ta: number): void {
    const ink = this.ink!;
    const { width: W, height: H } = api.scene.scale;
    const S = TED_INK;
    const K = TED_PARAMS.ink;
    const T = ascentTiming();
    const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const span = (a: number, b: number) => c01((ta - a) / Math.max(1, b - a));
    const step = (t0: number, ms: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor((ta - t0) / ms)));
    const loop = (t0: number, ms: number, n: number) => Math.max(0, Math.floor((ta - t0) / ms)) % n;
    // 무대 — 모든 좌표는 무대 기준 (원점 st.x, st.y · 크기 sw, sh)
    const st = this.inkStage(W, H);
    const sw = st.w;
    const sh = st.h;
    const mx = st.x + sw / 2;                         // 무대 가운데
    const my = st.y + sh / 2;
    const fullDark = K.darkAt + 80;
    const outA = 1 - span(T.outMs, T.endMs);          // 마지막 걷힘
    const cov = Math.max(sw / S.artW, sh / S.artH);  // 화면 덮는 배율 (장식·빛 점 자리)
    const ax = (x: number) => mx + (x - S.artW / 2) * cov;   // 원본 좌표 → 화면
    const ay = (y: number) => my + (y - S.artH / 2) * cov;
    const anchorX = ax(S.anchor.x);
    const anchorY = ay(S.anchor.y);
    // 흰 눈매 띠 배율 (fit-width)
    const ek = sw / S.eyesW;

    // ── 바탕 — 검정(흰 눈·얼굴) → 화선지(장면 1·와이프·소용돌이) → 검정(각성~큐브) → 걷힘. 화면 전체
    const paperOn = ta >= K.paperAt && ta < fullDark;
    this.inkRect(ink.paper, 0, 0, W, H).setAlpha(paperOn ? 1 : 0);
    this.inkRect(ink.dark, 0, 0, W, H).setAlpha(ta < K.paperAt ? span(0, K.blackInMs) : span(K.darkAt, fullDark) * outA);
    // ⑤→① 이음새 — 눈빛 폭발 정점이 화선지 색으로 번지는 덮개 (눈 세트·얼굴 위, ease-in). 흰 섬광이 아니다
    const coverU = ta < K.paperAt ? span(K.paperAt - K.glowToPaperMs, K.paperAt) : 0;
    this.inkRect(ink.paperCover, 0, 0, W, H).setAlpha(coverU * coverU);
    // 커튼 — 무대 양옆. 모든 층 위라 소용돌이·먹·패닝이 무대 밖으로 번지지 않는다
    const side = st.x;
    if (side > 0.5) {
      const p = Phaser.Display.Color.IntegerToColor(S.paper);
      // 검정 → (덮개만큼) 화선지 → 화선지 → (darkAt) 검정
      const k = ta < K.paperAt ? coverU * coverU : paperOn ? 1 - span(K.darkAt, fullDark) : 0;
      const col = Phaser.Display.Color.GetColor(Math.round(p.red * k), Math.round(p.green * k), Math.round(p.blue * k));
      const a = ta < K.paperAt ? span(0, K.blackInMs) : paperOn ? 1 : outA;
      this.inkRect(ink.curtainL, 0, 0, side, H).setFillStyle(col, 1).setAlpha(a).setVisible(true);
      this.inkRect(ink.curtainR, W - side, 0, side, H).setFillStyle(col, 1).setAlpha(a).setVisible(true);
    } else {
      ink.curtainL.setVisible(false);
      ink.curtainR.setVisible(false);
    }

    // ── 장면 1 — 붓질 · 형체 · 연기
    const strokeOn = ta >= K.strokeAt && ta < K.splashAt + K.strokeOutMs;
    if (strokeOn && this.inkFrame(ink.stroke, S.stroke, step(K.strokeAt, K.strokeFrameMs, 8))) {
      ink.stroke.setPosition(ax(S.strokeX), ay(S.artH * S.strokeY)).setRotation(S.strokeRot)
        .setScale((cov * S.strokeW) / 384).setAlpha(1 - span(K.splashAt, K.splashAt + K.strokeOutMs));
    } else ink.stroke.setVisible(false);

    const formEnd = K.smokeAt + K.formFadeMs;
    if (ta >= K.formAt[0] && ta < formEnd) {
      let f = 0;
      K.formAt.forEach((at, i) => { if (ta >= at) f = i; });
      if (this.inkFrame(ink.form, S.form, f)) {
        ink.form.setPosition(mx, my).setScale(this.inkFit(S.form, f, sw, sh))
          .setAlpha(span(K.formAt[0], K.formAt[0] + K.formFadeMs) * (1 - span(K.smokeAt, formEnd)));
      }
    } else ink.form.setVisible(false);
    const smokeF = loop(K.smokeAt, K.smokeFrameMs, 4);
    // 와이프·소용돌이는 시트 칸을 건너뛰며 재생한다 (wipeFrames·swirlFrames) — 박자를 줄여도 칸이 뭉개지지 않게
    const wipeN = K.wipeFrames.length;
    const wipeCover = K.wipeAt + K.wipeFrames.indexOf(K.wipeCoverFrame) * K.wipeFrameMs;   // 이 뒤로 전신은 와이프 밑에서 빠진다
    if (ta >= K.smokeAt && ta < wipeCover && this.inkFrame(ink.smoke, S.smoke, smokeF)) {
      ink.smoke.setPosition(mx, my).setScale(this.inkFit(S.smoke, smokeF, sw, sh)).setAlpha(span(K.smokeAt, formEnd));
    } else ink.smoke.setVisible(false);

    // ── 1-A — 어두운 와이프 → 대각선 붓질 (둘 다 화면 덮는 투명 그림)
    if (ta >= K.wipeAt && ta < K.wipeAt + wipeN * K.wipeFrameMs
      && this.inkFrame(ink.wipe, S.wipe, K.wipeFrames[step(K.wipeAt, K.wipeFrameMs, wipeN)])) {
      ink.wipe.setPosition(mx, my).setScale(cov).setAlpha(1);
    } else ink.wipe.setVisible(false);

    // ── 먹 튀김 — 장면 1(형체가 잡힐 때)
    const splashMs = 6 * K.splashFrameMs;
    if (ta >= K.splashAt && ta < K.splashAt + splashMs) {
      if (this.inkFrame(ink.splash, S.splash, step(K.splashAt, K.splashFrameMs, 6))) {
        ink.splash.setPosition(mx, my).setScale((cov * S.splashW) / 512).setAlpha(1);
      }
    } else ink.splash.setVisible(false);
    // 장면 5 — 진한 검정 먹이 바깥으로 날아가며 걷힌다 (알파 1 고정, 커지는 것만으로 무대 밖으로 빠진다)
    if (ta >= K.revealAt && ta < K.revealAt + K.burstMs && ink.burst.texture.key === S.burstKey) {
      const u = span(K.revealAt, K.revealAt + K.burstMs);
      const e = 1 - (1 - u) * (1 - u) * (1 - u);
      // 중심 = 각성 얼굴 두 눈 중점 (섬광이 각성 얼굴에서 바로 온다)
      const sCFit = this.inkFit(S.awake, 0, sw, sh);
      ink.burst.setVisible(true).setPosition(mx + (S.awakeEyeMid.x - S.artW / 2) * sCFit, my + (S.awakeEyeMid.y - S.artH / 2) * sCFit)
        .setAlpha(1).setRotation(0.25 * e)
        .setScale((cov * S.artW * (K.burstFrom + (K.burstTo - K.burstFrom) * e)) / ink.burst.width);
    } else ink.burst.setVisible(false);

    // ── 장면 2 — 소용돌이가 삼킨다 (검정이 다 덮으면 감춘다)
    if (ta >= K.swirlAt && ta < fullDark
      && this.inkFrame(ink.swirl, S.swirl, K.swirlFrames[step(K.swirlAt, K.swirlFrameMs, K.swirlFrames.length)])) {
      const u = span(K.swirlAt, fullDark);
      const sc = ((cov * S.swirlW) / 384) * (1 + (K.swirlGrow - 1) * u * u * u);
      ink.swirl.setPosition(mx, ay(S.artH * S.swirlY)).setScale(sc).setRotation(u * 1.2).setAlpha(1);
    } else ink.swirl.setVisible(false);

    // ── 무대 가득 그림 (main) — 얼굴(장면 2·3) · s4 · s5 · s6 · 결과
    const m = ink.main;
    // 3 — 얼굴(s2 다 뜬 칸 하나)이 눈동자 둘레로 어둠에서 켜짐 (화선지 덮개가 다 찰 때까지) · 각성(sC) — 섬광 밑에서 켜져 꺼짐까지
    const faceLit = ease01(span(K.faceAt, K.faceLitTo));
    const faceC = ta >= K.faceAt && ta < K.paperAt;
    const faceB = ta >= K.awakeAt && ta < K.revealAt;     // 각성 — 섬광이 덮어 컬러로 넘어갈 때까지
    if (faceC || faceB) {
      let ff: { key: string; frame: number };
      let eye: { x: number; y: number };
      let v: number;
      let push = 1;
      if (faceC) {
        ff = inkFaceFrame(S.faceOpenFrame);
        eye = S.faceEyeMid;
        v = Math.round(255 * faceLit);                // 곱셈 틴트(필터 아님) 검정 → 원래 밝기
        push = 1 + K.facePush * span(K.faceAt, K.paperAt);
      } else {
        // 각성 — 0칸 유지 → 먹 터짐 1~4칸 한 바퀴 → 0칸 → 섬광
        const t = ta - K.awakeAt - K.awakeHoldMs;
        ff = { key: S.awake, frame: t >= 0 && t < 4 * K.awakeLoopMs ? 1 + Math.floor(t / K.awakeLoopMs) : 0 };
        eye = S.awakeEyeMid;
        v = 255;
      }
      if (this.inkFrame(m, ff.key, ff.frame)) {
        const fit = this.inkFit(ff.key, ff.frame, sw, sh, push);   // 밀어 들어가기 포함 — 안전 한도 안에서
        m.setOrigin(eye.x / S.artW, eye.y / S.artH)
          .setPosition(mx + (eye.x - S.artW / 2) * fit, my + (eye.y - S.artH / 2) * fit)
          .setScale(fit).setRotation(0).setTint(Phaser.Display.Color.GetColor(v, v, v)).setAlpha(1);
      }
    } else if (ta >= K.revealAt) {
      // s4 → s5 반복 → s6 큐브 손동작 (마지막 칸에 머문 뒤 검정과 함께 걷힘). 원점은 무대 가운데, 틴트 없음
      let key: string;
      let f: number;
      if (ta < K.windAt) { key = S.reveal; f = K.revealFrames[step(K.revealAt, K.revealFrameMs, K.revealFrames.length)]; }
      else if (ta < K.cubeAt) { key = S.wind; f = loop(K.windAt, K.windFrameMs, 4); }
      else { key = S.cube; f = step(K.cubeAt, K.cubeFrameMs, 5); }
      if (this.inkFrame(m, key, f)) {
        // 마지막 수(= ascentTiming.revealMs) — 펑 (1.06 → 1, 120ms). 히트스톱·흔들림은 같은 박자의 ascentReveal. 안전 한도 안에서
        const hit = T.revealMs;
        const sc = ta >= hit ? this.inkFit(key, f, sw, sh, 1 + 0.06 * (1 - span(hit, hit + 120))) : this.inkFit(key, f, sw, sh);
        m.setOrigin(0.5).setPosition(mx, my).setScale(sc).setRotation(0).clearTint().setAlpha(outA);
      }
    } else m.setVisible(false);

    // ── 2-C — 각성 순간 퍼지는 먹 터짐 (투명, 화면 덮게)
    if (ta >= K.awakeAt && ta < K.awakeAt + 4 * K.awakeBurstMs
      && this.inkFrame(ink.awakeBurst, S.awakeBurst, step(K.awakeAt, K.awakeBurstMs, 4))) {
      ink.awakeBurst.setPosition(mx, my).setScale(cov).setAlpha(1);
    } else ink.awakeBurst.setVisible(false);

    // ── 장면 4 — 흰 눈동자가 먼저: 꺼지는 얼굴의 두 눈 자리에서 켜져 → s3 눈 자리로 옮겨 가며 커지고 →
    //    그 둘레로 눈매가 그어진다(s3 8칸, 이후 맥동). 일렁임은 눈동자가 켜질 때부터 → 두 눈이 확 밝아짐 → 섬광
    // ── 흰 눈 세트 (눈동자 + s3 눈매·눈썹) — 한 세트로 움직인다
    //    2 검정 위 s3 자리에서 눈동자가 켜지고 → 그 둘레로 눈매·눈썹이 그어짐 → 일렁임
    //    3 세트가 통째로(두 점 닮음 변환: 중점 이동·배율·기울기) 얼굴 두 눈 자리로 옮겨 가며 줄고, 얼굴이 켜지는 만큼 녹아듦
    //    4 눈빛이 확 밝아짐(그동안 각성 얼굴 두 눈 자리로 살짝 맞춤) → 그 정점이 화선지로 번짐 (paperAt 에 꺼짐)
    const setOn = ta >= K.pupilAt && ta < K.paperAt;
    if (setOn) {
      const ef = step(K.eyesAt, K.eyesFrameMs, 8);
      const drawn = K.eyesAt + 8 * K.eyesFrameMs;
      const pulse = ta >= drawn ? Math.sin(((ta - drawn) / K.eyesPulseMs) * Math.PI * 2) : 0;
      const es = ek * (1 + 0.02 * pulse);             // fit-width — cover 로 늘리면 폰에서 바깥 눈꼬리가 잘린다
      const lerp = (p: { x: number; y: number }, q: { x: number; y: number }, u: number) =>
        ({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u });
      const toScreen = (e: { x: number; y: number }, k: number) => ({ x: mx + (e.x - S.artW / 2) * k, y: my + (e.y - S.artH / 2) * k });
      // 출발 — s3 두 홍채 (화면) / 도착 — 얼굴 두 눈 (s2 다 뜬 칸 → 4 동안 각성 sC)
      const from = S.iris.map((p) => ({ x: anchorX + (p.x - S.eyesDot.x) * es, y: anchorY + (p.y - S.eyesDot.y) * es }));
      const s2Face = inkFaceFrame(S.faceOpenFrame);
      const s2Fit = this.inkFit(s2Face.key, s2Face.frame, sw, sh, 1 + K.facePush * span(K.faceAt, K.paperAt));
      const sCFit = this.inkFit(S.awake, 0, sw, sh);
      const shiftU = ease01(span(K.pupilShiftAt, K.paperAt));
      const to = [0, 1].map((i) => lerp(toScreen(S.faceEyes[i], s2Fit), toScreen(S.awakeEyes[i], sCFit), shiftU));
      // 두 점 닮음 변환 — 세트 전체(눈매 띠·눈동자·발광·아지랑이)에 같은 변환을 건다
      const mu = faceLit;                              // 옮겨 감 = 얼굴 켜짐 박자
      const m0 = lerp(from[0], from[1], 0.5);
      const m1 = lerp(to[0], to[1], 0.5);
      const g0 = Math.hypot(from[1].x - from[0].x, from[1].y - from[0].y);
      const g1 = Math.hypot(to[1].x - to[0].x, to[1].y - to[0].y);
      const r1 = Math.atan2(to[1].y - to[0].y, to[1].x - to[0].x) - Math.atan2(from[1].y - from[0].y, from[1].x - from[0].x);
      const k = 1 + (g1 / g0 - 1) * mu;
      const rot = r1 * mu;
      const mm = lerp(m0, m1, mu);
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const xf = (p: { x: number; y: number }) => {
        const dx = p.x - m0.x;
        const dy = p.y - m0.y;
        return { x: mm.x + k * (dx * cr - dy * sr), y: mm.y + k * (dx * sr + dy * cr) };
      };
      const gin = span(K.pupilAt, K.pupilAt + K.irisOnMs);
      const surge = span(K.pupilSurgeAt, K.paperAt) ** 2;        // 4 — 확 밝아짐 (점점 빨라진다)
      const melt = faceLit;                                      // 3 — 얼굴이 켜지는 만큼 녹아듦
      const setA = Math.min(1, 1 - 0.9 * melt + surge);
      // 눈매·눈썹 (s3 띠) — 기준점(띠 안 eyesDot)을 같은 변환으로
      if (ta >= K.eyesAt && this.inkFrame(ink.eyes, S.eyes, ef)) {
        const ap = xf({ x: anchorX, y: anchorY });
        ink.eyes.setOrigin(S.eyesDot.x / S.eyesW, S.eyesDot.y / S.eyesH).setPosition(ap.x, ap.y)
          .setScale(es * k).setRotation(rot).setAlpha(Math.min(1, (0.85 + 0.15 * pulse) * setA + surge));
      } else ink.eyes.setVisible(false);
      // 구운 눈동자는 s3 홍채가 차오르는 3~6칸 동안 넘겨준다 (같은 그림이라 겹쳐도 튀지 않는다)
      const handoff = 1 - span(K.eyesAt + 3 * K.eyesFrameMs, K.eyesAt + 6 * K.eyesFrameMs);
      // 일렁임 — 사인 두 개를 다른 주기로 더해 밝기·크기가 물결처럼 (±5~8%). 섬광 전까지 점점 세진다
      const amp = 1 + (K.shimmerAmpMax - 1) * span(K.shimmerRampAt, K.paperAt);
      const TAU = Math.PI * 2;
      S.iris.forEach((_, i) => {
        const ph = i * 1.7;                           // 두 눈의 위상을 어긋나게 — 같이 흔들리면 통째로 깜빡여 보인다
        const ip = xf(from[i]);
        const isc = es * k;
        const core = ink.irisCore[i];
        if (core.texture.key === `${S.irisCoreKey}_${i}`) {
          core.setVisible(true).setPosition(ip.x, ip.y).setScale(isc).setAlpha(Math.min(1, gin * handoff * setA + surge * handoff));
        } else core.setVisible(false);
        const size = 1 + amp * (0.04 * Math.sin((ta / 170) * TAU + ph) + 0.03 * Math.sin((ta / 97) * TAU + ph * 2.3));
        const lum = 1 + amp * (0.05 * Math.sin((ta / 130) * TAU + ph * 1.3) + 0.03 * Math.sin((ta / 71) * TAU + ph * 0.7));
        ink.irisGlow[i].setVisible(gin > 0).setPosition(ip.x, ip.y)
          .setScale(((S.irisGlowD * isc) / 192) * size * (1 + K.surgeScale * surge))
          .setAlpha(Math.min(1, gin * (K.irisGlowAlpha * lum * setA + surge)));
        // 아지랑이 — 부드럽게 구운 홍채 복제를 1~2px 좌우로 떨게 (알파 낮게)
        const h = ink.irisHaze[i];
        if (gin > 0 && h.texture.key === `${S.irisHazeKey}_${i}`) {
          const shift = K.hazeShiftPx * ek * k * amp * (0.7 * Math.sin((ta / 53) * TAU + ph) + 0.3 * Math.sin((ta / 31) * TAU + ph * 1.9));
          h.setVisible(true).setPosition(ip.x + shift * cr, ip.y + shift * sr).setScale(isc).setRotation(rot)
            .setAlpha(Math.min(1, gin * K.hazeAlpha * setA * (1 + surge)));
        } else h.setVisible(false);
      });
    } else {
      ink.eyes.setVisible(false);
      for (const o of [...ink.irisCore, ...ink.irisGlow, ...ink.irisHaze]) o.setVisible(false);
    }
    // 섬광 (무대만) — 장면 5 흰 화면 (유지 후 끊듯이 걷힘)
    const flashOut = K.flashAt + K.flashMs;
    let fl = 0;
    if (ta >= K.flashAt && ta < flashOut) fl = span(K.flashAt, K.flashAt + 20);
    else if (ta >= flashOut) fl = 1 - span(flashOut, flashOut + K.flashFadeMs);   // 거의 끊듯이 — 회색 막이 남지 않게
    // 각성 섬광 — ②→⑥ 이음새: 소용돌이가 만든 완전 검정(= darkAt + 80) 위에서 곧바로 → 각성 표정. 장면 5 와 같은 끊듯이 걷힘
    if (ta >= K.awakeFlashAt && ta < K.awakeAt) fl = Math.max(fl, span(K.awakeFlashAt, K.awakeFlashAt + 20));
    else if (ta >= K.awakeAt && ta < K.awakeAt + K.flashFadeMs) fl = Math.max(fl, 1 - span(K.awakeAt, K.awakeAt + K.flashFadeMs));
    this.inkRect(ink.flash, st.x, st.y, sw, sh).setAlpha(fl);
  }

  /** 끝 — 남은 오브젝트를 걷는다 (걷힘은 layoutInk 가 outMs → endMs 에 이미 마쳤다) */
  private inkEnd(): void {
    const ink = this.ink;
    if (!ink) return;
    for (const o of Object.values(ink).flat()) this.discardAny(o);   // 홍채 발광·아지랑이는 배열
    this.ink = null;
  }

  // ── 확정 · 효과 · 소환 ─────────────────────────────────────────

  /**
   * 확정 — 큐브 손동작 마지막 수(revealMs)의 펑: 히트스톱 + 흔들림.
   * 일렁임(백·흑 헤이즈)은 뺐다 (대표 지시) — 수묵엔 큐브 스프라이트가 없어 화면 한가운데에 생기고,
   * 걷힌 직후 게임 화면 가운데에 1초 남짓 남았다
   */
  private ascentReveal(api: GameSceneAPI): void {
    impact(api.scene, { hitstop: 70, shake: { duration: 140, intensity: 0.006 } });
  }

  /** 효과 발동 — 화면 전체 똥 제거 (걷히기 직전, 화면이 아직 가려진 동안). 소환 큐브는 걷힌 뒤 startSummon */
  private ascentEffect(api: GameSceneAPI): void {
    // 반경 무한 = 화면 전체. 조용히(recycle(true)) 걷는다 — 수십 개가 한꺼번에
    // 사라지는데 개마다 타격 이펙트를 깔면 상한만 먹고 화면이 하얘진다
    const n = this.clearPoopsInRadius(api, 0, 0, Infinity);
    if (n > 0) this.awardBonus(api, n * TED_PARAMS.ascentPoopPoints);
  }

  /** 소환 시작 — 컷신이 다 걷힌 순간(endMs 큐). 여기부터 summonMs (큐브 등장·첫 말·수순 재생 모두 이 기준) */
  private startSummon(api: GameSceneAPI): void {
    const now = api.scene.time.now;
    this.summonT0 = now;
    this.summonUntil = now + TED_PARAMS.summonMs;
    this.nextSummonDropAt = now + TED_PARAMS.summonFirstDropMs;
  }

  /**
   * 소환 큐브 — 머리 옆을 돌며 **충전 큐브와 같은 실제 수순**(흑 경로: 섞인 상태 → 앞면 검정 9/9)을 summonMs 에 걸쳐
   * 재생한다. 진행률 문턱도 충전 큐브와 같아 앞쪽 섞기 수는 촤라락, 앞면이 차는 수는 느려진다.
   * summonSolveAt 에 완성되고 남은 동안 완성 모습으로 돈다. 시트·칸 번호는 tedChargeCube.gen.ts 그대로
   */
  private stepSummon(api: GameSceneAPI, now: number): void {
    const { scene, player } = api;
    const C = TED_CHARGE_CUBE;
    const P = TED_PARAMS;
    if (now >= this.summonUntil) {
      if (this.summonCube) { this.discardAny(this.summonCube); this.summonCube = null; }
      // 0 으로 돌려야 onUpdate 가 더 부르지 않는다 (안 그러면 게임 끝까지 매 프레임 헛돈다)
      this.summonUntil = 0;
      return;
    }
    // 머리 옆에서 도는 큐브 — 레드 참새와 같은 자리·같은 기법. 몸통 폭 summonCubeSize
    if (!this.summonCube) {
      const c = scene.add.sprite(player.x, player.y, fxPickSheetKey(C.black), 0)
        .setScale(P.summonCubeSize / (C.cell * CHARGE_BODY_RATIO)).setDepth(ASCENT_DEPTH);
      this.trackedAny.add(c);
      this.summonCube = c;
    }
    const headTop = player.y - player.displayHeight * 0.33;
    // 공전 각도는 **흐르는 시각**에서 얻는다. 종료 시각(미래)으로 재면 값이 음수에서
    // 0 으로 올라와 도는 방향이 거꾸로 된다
    const a = now / 700;
    this.summonCube.setPosition(player.x + Math.cos(a) * 46, headTop - 22 + Math.sin(a) * 12);

    // 수순 — 지난 수 중 마지막 수 k. 그 수가 지나간 직후 CHARGE_TURN_MS 동안은 45° 칸 (빈 칸인 수는 정지 칸)
    const solveMs = P.summonMs * P.summonSolveAt;
    const u = (now - this.summonT0) / solveMs;
    let move = -1;
    for (let k = 0; k < C.moves; k++) if (u >= C.thresholds[k]) move = k;
    let f = move < 0 ? 0 : (move + 1) * (C.midFrames + 1);
    if (move >= 0) {
      const since = now - (this.summonT0 + C.thresholds[move] * solveMs);
      const missing = (C.midMissing.black as readonly number[]).includes(move);
      if (since < CHARGE_TURN_MS && !missing) f = 1 + move * (C.midFrames + 1);
    }
    this.summonCube.setFrame(f);

    // 소환 큐브가 직접 말을 떨어뜨린다 — 점수 마일스톤(생존 10점/초 → 60점 = 6초에 하나)만으로는
    // 8초에 소닉붐이 한두 번뿐이라 효과가 안 보였다. 동시 상한(chessMaxAlive)은 dropPiece 가 지킨다
    if (now >= this.nextSummonDropAt) {
      this.nextSummonDropAt = now + P.summonDropEveryMs;
      this.dropPiece(api);
    }
  }

  /**
   * 반경 안의 일반 똥을 조용히 걷는다. `r = Infinity` 면 **화면 전체**다.
   * (`Infinity` 도 비교로 그냥 통과하지만, 의도를 드러내려고 분기를 남긴다)
   */
  private clearPoopsInRadius(api: GameSceneAPI, cx: number, cy: number, r: number): number {
    const all = !Number.isFinite(r);
    const r2 = r * r;
    let n = 0;
    for (const p of (api.poops.getChildren() as Phaser.Physics.Arcade.Sprite[]).slice()) {
      if (!p.active) continue;
      const dx = p.x - cx, dy = p.y - cy;
      if (!all && dx * dx + dy * dy > r2) continue;
      (p as unknown as PoolablePoopBase).recycle(true);
      n++;
    }
    return n;
  }

  /** 액티브가 만든 것들은 Image 가 아닌 것도 있어 따로 담는다 */
  private discardAny(obj: Phaser.GameObjects.GameObject): void {
    this.trackedAny.delete(obj);
    obj.destroy();
  }

  private discard(obj: Phaser.GameObjects.Image): void {
    this.tracked.delete(obj);
    obj.destroy();
  }

  override onDestroy(api: GameSceneAPI): void {
    // 빗장 먼저 — 아래에서 시트를 파기하면 playFx 의 onComplete 가 불리고,
    // 그게 startBlast 를 타면 이미 내려간 씬에 폭발을 그린다
    this.cancelled = true;
    this.stage = null;
    this.cues = [];
    // 액티브 — 큐를 비우지 않으면 씬이 내려간 뒤에도 컷신이 이어진다
    this.ascentCues = [];
    this.ascentInvincibleUntil = 0;
    this.summonUntil = 0;
    this.summonCube = null;
    this.sonicWaves = [];                               // 링 이미지는 trackedAny 로 아래에서 파기된다
    this.cv = newChargeView();
    this.landDeco.clear();                              // 이미지는 tracked 로 아래에서 파기된다
    this.groundMask?.destroy();
    this.groundMaskG?.destroy();
    this.groundMask = null;
    this.groundMaskG = null;
    this.ink = null;                                    // 오브젝트는 trackedAny 로 아래에서 파기된다
    for (const obj of this.trackedAny) {
      api.scene.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.trackedAny.clear();

    for (const obj of this.tracked) {
      api.scene.tweens.killTweensOf(obj);
      obj.destroy();
    }
    this.tracked.clear();
    for (const p of this.sucking) p.ob.destroy();
    this.sucking = [];
    for (const ob of this.spreadReady) ob.destroy();
    this.spreadReady = [];
    for (const sp of this.spreading) sp.ob.destroy();
    this.spreading = [];
    this.landed = [];
    this.landSlots = [];   // 씬 재시작에 주머니가 남으면 다음 판이 한쪽으로 쏠린다
    this.flying = 0;
  }
}
