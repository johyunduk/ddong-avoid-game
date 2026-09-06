import Phaser from 'phaser';
import { isFxBloomEnabled, setFxBloomEnabled } from './settings';

/**
 * VFX 레이어 — 이펙트 재생 / 파티클 / 임팩트.
 *
 * 설계 원칙
 * 1. **에셋 우선, 절차 생성은 폴백** — 파티클은 `public/assets/fx/particles/` 의 PNG 를 쓴다.
 *    씬이 `preloadFxAssets()` 를 호출하지 않았으면 런타임 생성 텍스처로 자동 대체된다.
 *    프레임 애니메이션 이펙트(slash·shockwave·bloom)는 여전히 절차 생성이며,
 *    실제 시트가 나오면 `registerFxSheet()` 로 갈아끼운다.
 * 2. **정리 보장** — 이 모듈이 만든 스프라이트·이미터·타이머·블룸 레이어·타임스케일 변경은
 *    전부 씬별 트래커에 등록되고, 씬 `shutdown` / `destroy` 시 일괄 회수된다.
 *    (이 저장소는 메모리 누수 이력이 있어 tween/timer 를 절대 방치하지 않는다)
 * 3. **블렌드는 목적에 맞춰** — 빛나야 하는 것만 `add`. 옅은 알파로 오래 남는 잔상·예고선은
 *    `normal` 이어야 밝은 배경에서 묻히지 않는다 (`FxBlend` 참조).
 * 4. **발광은 블룸 레이어 하나로** — 가산 이펙트는 postFX 블룸이 걸린 Layer 에 모은다.
 *    오브젝트마다 postFX 를 거는 대신 화면 패스 1회로 끝내고, 가산 이펙트가 하나도 없으면
 *    블룸 컨트롤러를 떼서 평시 비용을 0 으로 만든다. WebGL 이 아니거나 설정이 꺼져 있으면 생략.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 블렌드 모드
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 이펙트 블렌드.
 *
 * **`add` 는 배경에 빛을 더한다** — 밝은 배경(background2 평균 밝기 192/255)에서는
 * 흰색에 수렴해 사라진다. 짧고 강한 섬광에는 맞지만, 옅은 알파로 오래 남아야 하는
 * 잔상·예고선에는 `normal` 을 써야 배경 위에 '자국'으로 얹힌다.
 */
export type FxBlend = 'add' | 'normal' | 'multiply' | 'screen';

function toBlendMode(blend: FxBlend): number {
  switch (blend) {
    case 'add': return Phaser.BlendModes.ADD;
    case 'multiply': return Phaser.BlendModes.MULTIPLY;
    case 'screen': return Phaser.BlendModes.SCREEN;
    default: return Phaser.BlendModes.NORMAL;
  }
}

/** 블룸 레이어에 올릴지 여부 — 빛을 더하는 블렌드만 발광 대상이다 */
function glows(blend: FxBlend): boolean {
  return blend === 'add' || blend === 'screen';
}

// ─────────────────────────────────────────────────────────────────────────────
// 파티클 텍스처 에셋
// ─────────────────────────────────────────────────────────────────────────────

const FX_ASSET_DIR = 'assets/fx/particles/';

/** 텍스처 키 → 파일명 (128×128 PNG, 알파 포함) */
const FX_PARTICLE_ASSETS: Record<string, string> = {
  // ComfyUI 생성 — 유기적, 자체 색을 가짐
  fx_smoke_1: 'smoke-puff-1.png',
  fx_smoke_2: 'smoke-puff-2.png',
  fx_wisp_1:  'energy-wisp-1.png',
  fx_wisp_2:  'energy-wisp-2.png',
  fx_ember_1: 'ember-spark-1.png',
  fx_star_1:  'star-sparkle-1.png',
  fx_star_2:  'star-sparkle-2.png',
  // 검기 — 생성물의 오로라 질감을 얕은 호로 세운 것 (512×250, scripts/fx-particle.py --beam).
  // 자체 색(흰 코어 + 주황 그라데이션)을 가지므로 착색하지 않고 일반 블렌드로 쓴다
  fx_sword_beam: 'sword-beam.png',
  // 같은 형태의 흰 하드엣지 판. 단독으로 쓰지 않고 검기 위에 얇게 얹는 코어 층이다 —
  // 애니메 이펙트는 '납작한 형태 + 늘어난 흰 선'이 있어야 작은 크기에서 형태가 읽힌다
  fx_sword_beam_core: 'sword-beam-core.png',
  // 무기 여의주 — 어두운 본체 + 속에서 타는 빛 + 흰 반사. 절차 생성(--orb)
  fx_yeoiju: 'yeoiju.png',
  // 수학 생성 — 흰색이라 setTint 로 자유롭게 착색
  fx_proc_arc:    'proc-arc.png',
  fx_proc_petal:  'proc-petal.png',
  fx_proc_glow:   'proc-glow.png',
  fx_proc_spark:  'proc-spark.png',
  fx_proc_ring:   'proc-ring.png',
  fx_proc_streak: 'proc-streak.png',
  fx_proc_shard:  'proc-shard.png',
};

const FX_SHEET_DIR = 'assets/fx/sheets/';

/**
 * 프레임 애니메이션 시트.
 * 프레임 크기는 파일명의 `_WxH` 에서 읽는다 — 시트를 추가할 때 표에 손댈 곳을 하나로 줄인다.
 * `preload: false` 인 시트는 로딩하지 않는다 (VRAM: 시트 하나가 10~20MB 급이라
 * 실제로 쓰는 것만 올린다. 쓰기 시작할 때 플래그만 켜면 된다).
 */
interface FxSheetAsset {
  fxKey: FxKey;
  file: string;
  frameCount: number;
  frameRate: number;
  defaultScale: number;
  defaultDepth: number;
  blend: FxBlend;
  maxConcurrent: number;
  preload: boolean;
}

const FX_SHEETS: FxSheetAsset[] = [
  // 똥 파괴 — 방사형 타격. 자주 터지므로 작게, 짧게, 상한을 낮게
  { fxKey: 'impactHit', file: 'impact_291x301.png', frameCount: 30, frameRate: 50,
    defaultScale: 0.24, defaultDepth: 121, blend: 'add', maxConcurrent: 6, preload: true },
  // 아래는 아직 쓰지 않는다 — VRAM 절약을 위해 로딩하지 않는다 (2.1MB / 10.7MB / 20.5MB).
  // 쓰기 시작할 때 preload 플래그만 켜면 된다.
  // itemPop: 아이템 획득 팝. '폭발처럼 보인다'는 피드백으로 사용 중단 (2025-09 w7)
  // 참격 — 형태가 프레임마다 바뀌는 유일한 이펙트. 정지 텍스처를 변형만 하는 것과
  // 다른 점이 여기다 (뻗음 → 임팩트 → 찢어짐 → 조각 → 잔재)
  { fxKey: 'swordSlash', file: 'slash_256x192.png', frameCount: 8, frameRate: 20,
    defaultScale: 0.4, defaultDepth: 122, blend: 'normal', maxConcurrent: 6, preload: true },
  // 낙뢰 — 프레임마다 경로가 다르다. 번쩍임을 코드로 흉내 낼 필요가 없어졌다
  { fxKey: 'boltGold', file: 'boltgold_160x384.png', frameCount: 8, frameRate: 22,
    defaultScale: 1, defaultDepth: 310, blend: 'normal', maxConcurrent: 4, preload: true },
  { fxKey: 'boltRed', file: 'boltred_160x384.png', frameCount: 8, frameRate: 22,
    defaultScale: 1, defaultDepth: 310, blend: 'normal', maxConcurrent: 4, preload: true },
  // 부활 연꽃 — 피어나는 과정이 프레임에 들어 있다. 9fps 로 천천히 핀다
  { fxKey: 'lotusBloom', file: 'lotus_192x192.png', frameCount: 8, frameRate: 9,
    defaultScale: 1, defaultDepth: 353, blend: 'normal', maxConcurrent: 2, preload: true },
  // 여우불 — 무채색 루프. 9색으로 착색되므로 색을 굽지 않는다
  { fxKey: 'foxFire', file: 'foxfire_128x192.png', frameCount: 8, frameRate: 14,
    defaultScale: 1, defaultDepth: 200, blend: 'normal', maxConcurrent: 16, preload: true },
  // 여우불 심지 — 같은 프레임의 가장 밝은 부분만 남긴 흰 판. 가산으로 얹어
  // '착색된 외곽 + 흰 심지' 를 만든다 (회색조를 통째로 착색하면 심지까지 물든다)
  { fxKey: 'foxFireCore', file: 'foxfirecore_128x192.png', frameCount: 8, frameRate: 14,
    defaultScale: 1, defaultDepth: 202, blend: 'add', maxConcurrent: 16, preload: true },
  // 구미호 꼬리 — 털이 살랑이는 루프. 9개가 각각 다른 색으로 착색된다
  { fxKey: 'foxTail', file: 'foxtail_256x96.png', frameCount: 8, frameRate: 10,
    defaultScale: 1, defaultDepth: 3, blend: 'add', maxConcurrent: 12, preload: true },
  // K 에너지파 — 기본 / 초사이언. 초사이언 쪽은 전기 갈래가 프레임마다 다르다
  { fxKey: 'kBeam', file: 'kbeam_512x64.png', frameCount: 6, frameRate: 18,
    defaultScale: 1, defaultDepth: 315, blend: 'normal', maxConcurrent: 6, preload: true },
  { fxKey: 'kBeamSs', file: 'kbeamss_512x64.png', frameCount: 6, frameRate: 22,
    defaultScale: 1, defaultDepth: 315, blend: 'normal', maxConcurrent: 6, preload: true },
  // 레거시(UR) 전용 불 — 색이 그림에 구워져 있어 착색하지 않는다
  { fxKey: 'legacyFlame', file: 'legacyflame_128x192.png', frameCount: 8, frameRate: 14,
    defaultScale: 1, defaultDepth: 88, blend: 'normal', maxConcurrent: 16, preload: true },
  { fxKey: 'legacyBurn', file: 'legacyburn_192x192.png', frameCount: 8, frameRate: 22,
    defaultScale: 1, defaultDepth: 200, blend: 'normal', maxConcurrent: 6, preload: true },
  { fxKey: 'itemPop', file: 'puffstars_120x109.png', frameCount: 42, frameRate: 48,
    defaultScale: 0.7, defaultDepth: 123, blend: 'normal', maxConcurrent: 4, preload: false },
  { fxKey: 'sparkleField', file: 'constellation_299x313.png', frameCount: 30, frameRate: 30,
    defaultScale: 0.5, defaultDepth: 121, blend: 'add', maxConcurrent: 3, preload: false },
  { fxKey: 'auraRing', file: 'ring_fire_421x425.png', frameCount: 30, frameRate: 30,
    defaultScale: 0.5, defaultDepth: 120, blend: 'add', maxConcurrent: 2, preload: false },
];

/** 파일명 `..._291x301.png` 에서 프레임 크기를 읽는다 */
function parseFrameSize(file: string): { w: number; h: number } | null {
  const m = /_(\d+)x(\d+)\.png$/.exec(file);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/**
 * 파티클 텍스처와 이펙트 시트를 로드한다. 씬 `preload()` 에서 호출.
 * 이미 캐시에 있으면 건너뛴다 (GameScene 의 기존 조건부 로딩 패턴과 동일).
 */
export function preloadFxAssets(scene: Phaser.Scene): void {
  for (const key of Object.keys(FX_PARTICLE_ASSETS)) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, FX_ASSET_DIR + FX_PARTICLE_ASSETS[key]);
    }
  }

  for (const sheet of FX_SHEETS) {
    if (!sheet.preload) continue;
    const size = parseFrameSize(sheet.file);
    if (!size) continue;

    const textureKey = `fxsheet_${sheet.fxKey}`;
    if (!scene.textures.exists(textureKey)) {
      scene.load.spritesheet(textureKey, FX_SHEET_DIR + sheet.file, {
        frameWidth: size.w,
        frameHeight: size.h,
      });
    }
    // 절차적 생성 대신 실제 시트를 쓰도록 레지스트리 교체
    registerFxSheet(sheet.fxKey, {
      textureKey,
      frameWidth: size.w,
      frameHeight: size.h,
      frameCount: sheet.frameCount,
      frameRate: sheet.frameRate,
      defaultScale: sheet.defaultScale,
      defaultDepth: sheet.defaultDepth,
      blend: sheet.blend,
      maxConcurrent: sheet.maxConcurrent,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FX 레지스트리
// ─────────────────────────────────────────────────────────────────────────────

/** 등록된 이펙트 키 */
export type FxKey =
  | 'slash' | 'shockwave' | 'bloom'      // 절차 생성 (폴백 겸용)
  | 'impactHit' | 'itemPop'              // 시트 — 똥 파괴 / 아이템 획득
  | 'sparkleField' | 'auraRing'          // 시트 — 아직 미사용(로딩 안 함)
  | 'swordSlash'                         // 시트 — 참격 (프레임마다 형태가 바뀐다)
  | 'boltGold' | 'boltRed'               // 시트 — 낙뢰 (번쩍임이 프레임에 들어 있다)
  | 'lotusBloom'                         // 시트 — 부활 연꽃 (봉오리 → 만개 → 흩어짐)
  | 'foxFire' | 'foxFireCore'            // 시트 — 여우불 (착색 외곽 + 흰 심지 두 겹)
  | 'foxTail'                            // 시트 — 구미호 꼬리 (털이 살랑이는 루프)
  | 'kBeam' | 'kBeamSs'                  // 시트 — K 에너지파 (기본 / 초사이언, 전기 포함)
  | 'legacyFlame' | 'legacyBurn';        // 시트 — 레거시 불꽃 / 소각 폭발

/** 프레임 하나를 캔버스에 그리는 함수. t 는 0(첫 프레임) ~ 1(마지막) 정규화 진행도 */
type FrameDrawer = (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => void;

interface FxDefinition {
  /** 텍스처 키 — 실제 시트를 preload 로 이미 올려두면 절차적 생성을 건너뛴다 */
  textureKey: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frameRate: number;
  defaultScale: number;
  defaultDepth: number;
  /** 가산 블렌드 여부 — true 면 블룸 레이어에 올라간다 */
  blend: FxBlend;
  /** 동시 재생 상한. 초과분은 조용히 무시된다 (똥이 한꺼번에 터져도 화면이 무너지지 않게) */
  maxConcurrent: number;
  /** 절차적 프레임 생성기. 외부 시트로 교체되면 사용되지 않는다 */
  draw?: FrameDrawer;
}

const FX_REGISTRY: Record<FxKey, FxDefinition> = {
  // 대각선 칼날 — 중앙이 두껍고 끝이 뾰족한 초승달, 뻗었다가 얇아지며 소멸
  slash: {
    textureKey: 'fx_slash',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 6,
    frameRate: 30,
    defaultScale: 1,
    defaultDepth: 122,
    blend: 'add',
    maxConcurrent: 8,
    draw: drawSlashFrame,
  },
  // 퍼지는 충격파 링
  shockwave: {
    textureKey: 'fx_shockwave',
    frameWidth: 128,
    frameHeight: 128,
    frameCount: 8,
    frameRate: 34,
    defaultScale: 1,
    defaultDepth: 121,
    blend: 'add',
    maxConcurrent: 6,
    draw: drawShockwaveFrame,
  },
  // 짧고 강한 발광 — 임팩트 순간의 화이트 플래시
  bloom: {
    textureKey: 'fx_bloom',
    frameWidth: 96,
    frameHeight: 96,
    frameCount: 5,
    frameRate: 40,
    defaultScale: 1,
    defaultDepth: 123,
    blend: 'add',
    maxConcurrent: 6,
    draw: drawBloomFrame,
  },
  // ── 시트 기반 (preloadFxAssets 에서 registerFxSheet 로 실제 값이 채워진다) ──
  // draw 가 없으므로 시트가 로드되기 전에는 playFx 가 조용히 null 을 반환한다
  impactHit: {
    textureKey: 'fxsheet_impactHit',
    frameWidth: 291, frameHeight: 301, frameCount: 30, frameRate: 50,
    defaultScale: 0.24, defaultDepth: 121, blend: 'add', maxConcurrent: 6,
  },
  itemPop: {
    textureKey: 'fxsheet_itemPop',
    frameWidth: 120, frameHeight: 109, frameCount: 42, frameRate: 48,
    defaultScale: 0.7, defaultDepth: 123, blend: 'normal', maxConcurrent: 4,
  },
  sparkleField: {
    textureKey: 'fxsheet_sparkleField',
    frameWidth: 299, frameHeight: 313, frameCount: 30, frameRate: 30,
    defaultScale: 0.5, defaultDepth: 121, blend: 'add', maxConcurrent: 3,
  },
  auraRing: {
    textureKey: 'fxsheet_auraRing',
    frameWidth: 421, frameHeight: 425, frameCount: 30, frameRate: 30,
    defaultScale: 0.5, defaultDepth: 120, blend: 'add', maxConcurrent: 2,
  },
  swordSlash: {
    textureKey: 'fxsheet_swordSlash',
    frameWidth: 256, frameHeight: 192, frameCount: 8, frameRate: 20,
    defaultScale: 0.4, defaultDepth: 122, blend: 'normal', maxConcurrent: 6,
  },
  boltGold: {
    textureKey: 'fxsheet_boltGold',
    frameWidth: 160, frameHeight: 384, frameCount: 8, frameRate: 22,
    defaultScale: 1, defaultDepth: 310, blend: 'normal', maxConcurrent: 4,
  },
  boltRed: {
    textureKey: 'fxsheet_boltRed',
    frameWidth: 160, frameHeight: 384, frameCount: 8, frameRate: 22,
    defaultScale: 1, defaultDepth: 310, blend: 'normal', maxConcurrent: 4,
  },
  lotusBloom: {
    textureKey: 'fxsheet_lotusBloom',
    frameWidth: 192, frameHeight: 192, frameCount: 8, frameRate: 9,
    defaultScale: 1, defaultDepth: 353, blend: 'normal', maxConcurrent: 2,
  },
  foxFire: {
    textureKey: 'fxsheet_foxFire',
    frameWidth: 128, frameHeight: 192, frameCount: 8, frameRate: 14,
    defaultScale: 1, defaultDepth: 200, blend: 'normal', maxConcurrent: 16,
  },
  foxFireCore: {
    textureKey: 'fxsheet_foxFireCore',
    frameWidth: 128, frameHeight: 192, frameCount: 8, frameRate: 14,
    defaultScale: 1, defaultDepth: 202, blend: 'add', maxConcurrent: 16,
  },
  foxTail: {
    textureKey: 'fxsheet_foxTail',
    frameWidth: 256, frameHeight: 96, frameCount: 8, frameRate: 10,
    defaultScale: 1, defaultDepth: 3, blend: 'add', maxConcurrent: 12,
  },
  kBeam: {
    textureKey: 'fxsheet_kBeam',
    frameWidth: 512, frameHeight: 64, frameCount: 6, frameRate: 18,
    defaultScale: 1, defaultDepth: 315, blend: 'normal', maxConcurrent: 6,
  },
  kBeamSs: {
    textureKey: 'fxsheet_kBeamSs',
    frameWidth: 512, frameHeight: 64, frameCount: 6, frameRate: 22,
    defaultScale: 1, defaultDepth: 315, blend: 'normal', maxConcurrent: 6,
  },
  legacyFlame: {
    textureKey: 'fxsheet_legacyFlame',
    frameWidth: 128, frameHeight: 192, frameCount: 8, frameRate: 14,
    defaultScale: 1, defaultDepth: 88, blend: 'normal', maxConcurrent: 16,
  },
  legacyBurn: {
    textureKey: 'fxsheet_legacyBurn',
    frameWidth: 192, frameHeight: 192, frameCount: 8, frameRate: 22,
    defaultScale: 1, defaultDepth: 200, blend: 'normal', maxConcurrent: 6,
  },
};

/**
 * 절차적 텍스처 대신 실제 스프라이트 시트를 쓰도록 레지스트리를 교체한다.
 * 시트는 호출 전에 씬 preload 등에서 `this.load.spritesheet(textureKey, ...)` 로 올라와 있어야 한다.
 * (호출부 코드는 변경 불필요 — playFx(key) 그대로)
 */
export function registerFxSheet(
  key: FxKey,
  cfg: {
    textureKey: string;
    frameWidth: number;
    frameHeight: number;
    frameCount: number;
    frameRate?: number;
    defaultScale?: number;
    defaultDepth?: number;
    blend?: FxBlend;
    maxConcurrent?: number;
  },
): void {
  const prev = FX_REGISTRY[key];
  FX_REGISTRY[key] = {
    textureKey: cfg.textureKey,
    frameWidth: cfg.frameWidth,
    frameHeight: cfg.frameHeight,
    frameCount: cfg.frameCount,
    frameRate: cfg.frameRate ?? prev.frameRate,
    defaultScale: cfg.defaultScale ?? prev.defaultScale,
    defaultDepth: cfg.defaultDepth ?? prev.defaultDepth,
    blend: cfg.blend ?? prev.blend,
    maxConcurrent: cfg.maxConcurrent ?? prev.maxConcurrent,
    // draw 없음 → 절차적 생성을 시도하지 않는다
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 씬별 리소스 트래커
// ─────────────────────────────────────────────────────────────────────────────

interface SceneFxState {
  /** Sprite 는 Image 를 상속하므로 sweep(Image)·playFx(Sprite) 를 함께 담는다 */
  sprites: Set<Phaser.GameObjects.Image>;
  /** 이펙트 키별 현재 재생 수 — maxConcurrent 상한 판정용 */
  active: Map<string, number>;
  emitters: Set<Phaser.GameObjects.Particles.ParticleEmitter>;
  /**
   * 리소스 회수 타이머. 씬 Clock 이 아니라 window.setTimeout 을 쓴다 —
   * 히트스톱(time.timeScale = 0) 동안 씬 타이머는 멈추므로 회수가 밀리기 때문.
   */
  timeouts: Set<number>;
  /** shutdown/destroy 리스너 해제용 (씬 재시작마다 리스너가 쌓이지 않게) */
  detach: (() => void) | null;
  /** 가산 이펙트를 모으는 블룸 레이어 (WebGL + 설정 ON 일 때만 생성) */
  bloomLayer: Phaser.GameObjects.Layer | null;
  /** 레이어에 살아 있는 가산 오브젝트 수 — 0 이면 블룸 컨트롤러를 뗀다 */
  bloomRefs: number;
  /** 진행 중인 히트스톱 복구 핸들 (실시간 setTimeout — 타임스케일 영향 밖) */
  hitstopHandle: number | null;
  /** 히트스톱 이전 원본 타임스케일 */
  saved: { time: number; tweens: number; anims: number; physics: number } | null;
}

const SCENE_STATE = new WeakMap<Phaser.Scene, SceneFxState>();
/** 블룸 레이어를 가진 씬 — 설정 토글을 즉시 반영하려면 순회가 필요하다 */
const BLOOM_SCENES = new Set<Phaser.Scene>();
/** punch 대상의 원본 스케일 — 연속 펀치가 누적 축소되지 않도록 보관 */
const BASE_SCALE = new WeakMap<object, { x: number; y: number }>();
/** 진행 중인 펀치 트윈 — 대상의 다른 트윈(무적 점멸 등)을 죽이지 않고 이것만 교체한다 */
const PUNCH_TWEEN = new WeakMap<object, Phaser.Tweens.Tween>();

function getState(scene: Phaser.Scene): SceneFxState {
  let st = SCENE_STATE.get(scene);
  if (st) return st;

  st = {
    sprites: new Set(),
    active: new Map(),
    emitters: new Set(),
    timeouts: new Set(),
    detach: null,
    bloomLayer: null,
    bloomRefs: 0,
    hitstopHandle: null,
    saved: null,
  };
  SCENE_STATE.set(scene, st);

  // 씬이 내려갈 때 이 모듈이 만든 모든 것을 회수한다
  const cleanup = () => clearSceneFx(scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  st.detach = () => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
  };

  return st;
}

/** 씬의 모든 VFX 리소스를 즉시 파기하고 타임스케일을 원복한다 */
export function clearSceneFx(scene: Phaser.Scene): void {
  const st = SCENE_STATE.get(scene);
  if (!st) return;

  st.sprites.forEach(s => {
    scene.tweens.killTweensOf(s);
    if (s.scene) s.destroy();
  });
  st.sprites.clear();
  st.active.clear();

  st.emitters.forEach(e => {
    if (e.scene) e.destroy();
  });
  st.emitters.clear();

  st.timeouts.forEach(id => window.clearTimeout(id));
  st.timeouts.clear();

  if (st.bloomLayer) {
    if (st.bloomLayer.scene) {
      st.bloomLayer.postFX?.clear();
      st.bloomLayer.destroy();
    }
    st.bloomLayer = null;
  }
  st.bloomRefs = 0;
  BLOOM_SCENES.delete(scene);

  releaseHitstop(scene);
  st.detach?.();
  st.detach = null;
  SCENE_STATE.delete(scene);
}

/**
 * 누수 계측용 스냅샷. 이펙트가 모두 끝나면 전부 0 으로 돌아와야 한다.
 * (scripts/fx-leak-check 및 개발용 HUD 에서 사용)
 */
export function getFxStats(scene: Phaser.Scene): {
  sprites: number;
  emitters: number;
  timeouts: number;
  bloomRefs: number;
  bloomChildren: number;
  activeSlots: number;
} {
  const st = SCENE_STATE.get(scene);
  if (!st) return { sprites: 0, emitters: 0, timeouts: 0, bloomRefs: 0, bloomChildren: 0, activeSlots: 0 };
  return {
    sprites: st.sprites.size,
    emitters: st.emitters.size,
    timeouts: st.timeouts.size,
    bloomRefs: st.bloomRefs,
    bloomChildren: st.bloomLayer?.list.length ?? 0,
    activeSlots: [...st.active.values()].reduce((a, b) => a + b, 0),
  };
}

/** 동시 재생 상한 확보. 실패하면 이펙트를 만들지 않는다 */
function acquireSlot(st: SceneFxState, key: string, max: number): boolean {
  const cur = st.active.get(key) ?? 0;
  if (cur >= max) return false;
  st.active.set(key, cur + 1);
  return true;
}

function releaseSlot(st: SceneFxState, key: string): void {
  const cur = st.active.get(key) ?? 0;
  if (cur <= 1) st.active.delete(key);
  else st.active.set(key, cur - 1);
}

/** 씬 파기 후 남은 참조로 작업하지 않도록 하는 가드 */
function isLive(scene: Phaser.Scene): boolean {
  return !!scene && !!scene.sys && !!scene.sys.displayList;
}

/**
 * 정리 예약. **씬 Clock 이 아니라 실시간 타이머**를 쓴다.
 * 히트스톱은 `time.timeScale` 을 0 으로 만들기 때문에 delayedCall 로 잡으면
 * 회수가 그만큼 밀리고, 히트스톱이 겹치면 회수 자체가 뒤로 계속 쌓인다.
 */
function trackedTimeout(scene: Phaser.Scene, ms: number, fn: () => void): number {
  const st = getState(scene);
  const id = window.setTimeout(() => {
    st.timeouts.delete(id);
    fn();
  }, ms);
  st.timeouts.add(id);
  return id;
}

/**
 * 보험 타이머 취소. **오래 사는 이펙트에는 필수다** —
 * 대상이 먼저 파기돼도 타이머를 놔두면 그 시간만큼 장부에 남는다
 * (수 분짜리 보험이면 그대로 누수로 쌓인다).
 */
function cancelTrackedTimeout(scene: Phaser.Scene, id: number): void {
  const st = SCENE_STATE.get(scene);
  if (!st || !st.timeouts.delete(id)) return;
  window.clearTimeout(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// 블룸 (postFX)
// ─────────────────────────────────────────────────────────────────────────────

/** 가산 이펙트가 모이는 레이어의 depth — 게임플레이 위, UI(190+) 아래 */
const BLOOM_LAYER_DEPTH = 122;
/** 모바일 고려: steps 를 낮게 유지하고 강도도 절제한다 */
const BLOOM_PARAMS = {
  color: 0xffffff,
  offsetX: 1,
  offsetY: 1,
  blurStrength: 0.85,
  strength: 0.9,
  steps: 4,
} as const;

/** 세션 내 상태 — 저사양 기기에서 런타임으로 끌 수 있다 */
let bloomEnabled: boolean = isFxBloomEnabled();

/** 현재 블룸 사용 여부 */
export function isBloomEnabled(): boolean {
  return bloomEnabled;
}

/**
 * 블룸 on/off 스위치. 설정에 저장되고, 이미 떠 있는 씬에도 즉시 반영된다.
 * (저사양 기기 / 옵션 메뉴에서 호출)
 */
export function setBloomEnabled(on: boolean): void {
  bloomEnabled = on;
  setFxBloomEnabled(on);
  BLOOM_SCENES.forEach(scene => {
    const st = SCENE_STATE.get(scene);
    if (!st?.bloomLayer || !st.bloomLayer.scene) return;
    if (!on) st.bloomLayer.postFX?.clear();
    else if (st.bloomRefs > 0) applyBloomController(st.bloomLayer);
  });
}

function applyBloomController(layer: Phaser.GameObjects.Layer): void {
  const fx = layer.postFX;
  if (!fx || fx.list.length > 0) return;
  fx.addBloom(
    BLOOM_PARAMS.color,
    BLOOM_PARAMS.offsetX,
    BLOOM_PARAMS.offsetY,
    BLOOM_PARAMS.blurStrength,
    BLOOM_PARAMS.strength,
    BLOOM_PARAMS.steps,
  );
}

/** WebGL 이고 설정이 켜져 있을 때만 블룸 레이어를 만든다 */
function getBloomLayer(scene: Phaser.Scene): Phaser.GameObjects.Layer | null {
  if (!bloomEnabled) return null;
  if (scene.game.renderer.type !== Phaser.WEBGL) return null;

  const st = getState(scene);
  if (st.bloomLayer && st.bloomLayer.scene) return st.bloomLayer;

  const layer = scene.add.layer().setDepth(BLOOM_LAYER_DEPTH);
  st.bloomLayer = layer;
  BLOOM_SCENES.add(scene);
  return layer;
}

/**
 * 가산 오브젝트를 블룸 레이어로 옮기고, 살아 있는 동안만 블룸 컨트롤러를 유지한다.
 * 마지막 가산 오브젝트가 사라지면 postFX 를 떼서 평시 렌더 비용을 없앤다.
 */
function attachBloom(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject): void {
  const layer = getBloomLayer(scene);
  if (!layer) return;

  const st = getState(scene);
  layer.add(obj);
  st.bloomRefs++;
  applyBloomController(layer);

  obj.once(Phaser.GameObjects.Events.DESTROY, () => {
    const cur = SCENE_STATE.get(scene);
    if (!cur) return;
    cur.bloomRefs = Math.max(0, cur.bloomRefs - 1);
    if (cur.bloomRefs === 0 && cur.bloomLayer?.scene) cur.bloomLayer.postFX?.clear();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 절차적 텍스처 생성
// ─────────────────────────────────────────────────────────────────────────────

/** 프레임들을 가로로 이어붙인 캔버스 텍스처를 만들고 프레임 인덱스를 등록한다 */
function ensureFxTexture(scene: Phaser.Scene, def: FxDefinition): boolean {
  if (scene.textures.exists(def.textureKey)) return true;
  if (!def.draw) return false; // 외부 시트로 등록됐는데 아직 로드되지 않음

  const draw = def.draw;
  const { frameWidth: fw, frameHeight: fh, frameCount: n } = def;
  const tex = scene.textures.createCanvas(def.textureKey, fw * n, fh);
  if (!tex) return false;

  const ctx = tex.getContext();
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.translate(i * fw, 0);
    ctx.beginPath();
    ctx.rect(0, 0, fw, fh);
    ctx.clip();
    draw(ctx, n > 1 ? i / (n - 1) : 0, fw, fh);
    ctx.restore();
    tex.add(i, 0, i * fw, 0, fw, fh);
  }
  tex.refresh();
  return true;
}

/** 레지스트리 정의로 애니메이션을 1회만 생성 (AnimationManager 는 전역) */
function ensureFxAnim(scene: Phaser.Scene, key: FxKey, def: FxDefinition): string | null {
  const animKey = `fx_anim_${key}_${def.textureKey}`;
  if (scene.anims.exists(animKey)) return animKey;
  if (!ensureFxTexture(scene, def)) return null;

  const frames: Phaser.Types.Animations.AnimationFrame[] = [];
  for (let i = 0; i < def.frameCount; i++) frames.push({ key: def.textureKey, frame: i });

  scene.anims.create({ key: animKey, frames, frameRate: def.frameRate, repeat: 0 });
  return animKey;
}

function drawSlashFrame(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  // 앞부분에서 빠르게 뻗고, 뒤로 갈수록 얇아지며 사라진다
  const grow = Math.min(1, t * 2.4);
  const len = w * 0.46 * (0.5 + 0.5 * grow);
  const wid = h * 0.15 * (1 - t * 0.8);
  const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;

  ctx.globalAlpha = Math.max(0, alpha);

  // 칼날 본체 — 중앙이 두꺼운 렌즈 형태
  const grad = ctx.createLinearGradient(cx - len, cy, cx + len, cy);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - len, cy);
  ctx.quadraticCurveTo(cx, cy - wid, cx + len, cy);
  ctx.quadraticCurveTo(cx, cy + wid, cx - len, cy);
  ctx.closePath();
  ctx.fill();

  // 코어 — 얇고 강한 흰 선
  ctx.globalAlpha = Math.max(0, alpha) * 0.9;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = Math.max(1, h * 0.022 * (1 - t * 0.6));
  ctx.beginPath();
  ctx.moveTo(cx - len * 0.96, cy);
  ctx.lineTo(cx + len * 0.96, cy);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawShockwaveFrame(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const eased = 1 - Math.pow(1 - t, 3); // Cubic.easeOut
  const r = (w * 0.46) * (0.12 + 0.88 * eased);
  const lw = Math.max(1, w * 0.09 * (1 - t) + 1);
  const alpha = Math.pow(1 - t, 1.6);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // 안쪽 잔광 링
  ctx.globalAlpha = alpha * 0.45;
  ctx.lineWidth = lw * 2.2;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1, r - lw), 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawBloomFrame(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  const r = (w * 0.5) * (0.35 + 0.65 * Math.min(1, t * 1.8));
  const alpha = Math.pow(1 - t, 1.4);

  ctx.globalAlpha = alpha;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // 십자 플레어
  ctx.globalAlpha = alpha * 0.8;
  const armW = Math.max(1, h * 0.035 * (1 - t));
  const armL = r * 1.5;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(cx - armL, cy - armW / 2, armL * 2, armW);
  ctx.fillRect(cx - armW / 2, cy - armL, armW, armL * 2);
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// playFx — 이펙트 스프라이트 재생
// ─────────────────────────────────────────────────────────────────────────────

export interface PlayFxOptions {
  /** 블렌드 오버라이드 (기본: 레지스트리 정의) */
  blend?: FxBlend;
  /** 기본 스케일에 곱해지는 배율 */
  scale?: number;
  /** 라디안 */
  rotation?: number;
  /** 표시 원점 [x, y]. 낙뢰처럼 **한쪽 끝을 대상에 맞춰야** 하는 시트에 쓴다 */
  origin?: [number, number];
  depth?: number;
  tint?: number;
  alpha?: number;
  /** 재생 중 스케일 성장(1 = 변화 없음) */
  scaleTo?: number;
  /** 재생이 끝나거나 정리될 때 1회 호출 */
  onComplete?: () => void;
}

/**
 * 등록된 이펙트를 (x, y) 에 1회 재생한다. 재생 완료 시 스프라이트는 자동 파기된다.
 * 텍스처가 준비되지 않았으면 null 을 반환하고 아무것도 그리지 않는다.
 */
export function playFx(
  scene: Phaser.Scene,
  key: FxKey,
  x: number,
  y: number,
  opts: PlayFxOptions = {},
): Phaser.GameObjects.Sprite | null {
  if (!isLive(scene)) return null;

  const def = FX_REGISTRY[key];
  const animKey = ensureFxAnim(scene, key, def);
  if (!animKey) return null;

  const st = getState(scene);
  if (!acquireSlot(st, key, def.maxConcurrent)) return null;
  const scale = def.defaultScale * (opts.scale ?? 1);

  const sprite = scene.add.sprite(x, y, def.textureKey, 0)
    .setDepth(opts.depth ?? def.defaultDepth)
    .setScale(scale)
    .setRotation(opts.rotation ?? 0)
    .setAlpha(opts.alpha ?? 1);
  if (opts.origin) sprite.setOrigin(opts.origin[0], opts.origin[1]);

  const blend = opts.blend ?? def.blend;
  sprite.setBlendMode(toBlendMode(blend));
  if (opts.tint !== undefined) sprite.setTint(opts.tint);

  st.sprites.add(sprite);
  if (glows(blend)) attachBloom(scene, sprite);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    releaseSlot(st, key);
    st.sprites.delete(sprite);
    scene.tweens.killTweensOf(sprite);
    if (sprite.scene) sprite.destroy();
    opts.onComplete?.();
  };

  sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, finish);
  sprite.once(Phaser.GameObjects.Events.DESTROY, () => {
    // 외부(clearSceneFx 등)에서 먼저 파기된 경우에도 콜백/추적을 정리
    if (finished) return;
    finished = true;
    releaseSlot(st, key);
    st.sprites.delete(sprite);
    opts.onComplete?.();
  });

  if (opts.scaleTo !== undefined && opts.scaleTo !== 1) {
    const durationMs = (def.frameCount / def.frameRate) * 1000;
    scene.tweens.add({
      targets: sprite,
      scale: scale * opts.scaleTo,
      duration: durationMs,
      ease: 'Quad.easeOut',
    });
  }

  sprite.play(animKey);

  // 보험: ANIMATION_COMPLETE 가 유실되거나(텍스처 교체·씬 정지 등) 히트스톱으로 늦어져도
  // 실시간 기준으로 반드시 회수한다.
  const lifeMs = (def.frameCount / def.frameRate) * 1000;
  trackedTimeout(scene, lifeMs + 400, finish);

  return sprite;
}

// ─────────────────────────────────────────────────────────────────────────────
// sweep — 한 장짜리 궤적 텍스처를 쓸어내듯 재생
// ─────────────────────────────────────────────────────────────────────────────

export interface SweepOptions {
  /** 궤적 방향 (라디안). 텍스처의 긴 축이 이 방향으로 눕는다 */
  rotation?: number;
  /** 길이 배율 (텍스처 실측 폭 기준) */
  length?: number;
  /** 두께 배율. 낮출수록 아크가 세로로 눌려 직선에 가까워진다 */
  thickness?: number;
  /** 칼이 지나가는 시간(ms) — 짧을수록 빠르게 스친다 */
  duration?: number;
  tint?: number;
  alpha?: number;
  depth?: number;
  /** 칼날 본체 블렌드 (기본 add — 빛나야 맞다) */
  blend?: FxBlend;
  /** 궤적 텍스처 키 (기본: proc-arc) */
  texture?: string;
  maxConcurrent?: number;
  /**
   * 칼이 지나간 경로에 남는 잔상. 이게 '베였다'는 느낌을 만든다.
   * 생략하면 잔상 없이 칼날만 지나간다.
   */
  trail?: {
    /** 잔상 알파 (기본 0.42). 일반 블렌드라 낮아도 잘 읽힌다 */
    alpha?: number;
    /** 사라지기 전 머무는 시간(ms, 기본 150) */
    hold?: number;
    /** 사라지는 데 걸리는 시간(ms, 기본 350) */
    fade?: number;
    /** 외곽 색 */
    tint?: number;
    /** 코어 색. 생략하면 외곽과 같은 색을 쓴다 (흰색을 강제하지 않는다) */
    coreTint?: number;
    /**
     * 잔상 블렌드 (기본 normal).
     * 가산으로 두면 밝은 배경에서 묻혀 보이지 않는다 — 잔상은 배경 위에 얹히는 자국이다.
     */
    blend?: FxBlend;
  };
}

const SWEEP_SLOT = 'sweep';
const SWEEP_DEFAULT_TEXTURE = 'fx_proc_arc';
/**
 * 동시에 살아 있을 수 있는 베기 **세트** 수.
 * 매화 1회 발동 = 대상 3 × (예고 + 베기) = 6세트가 스태거로 겹치고,
 * 다음 볼리와도 겹칠 수 있어 넉넉히 잡는다. (세트 하나는 최대 3장)
 */
const SWEEP_MAX_UNITS = 16;

/** 잔상 누락을 계측하기 위한 카운터 — 요청 수와 생성 수가 같아야 한다 */
const fxCounters = {
  sweepRequested: 0,
  sweepCreated: 0,
  trailRequested: 0,
  trailCreated: 0,
};

export function getFxCounters(): typeof fxCounters {
  return { ...fxCounters };
}

export function resetFxCounters(): void {
  fxCounters.sweepRequested = 0;
  fxCounters.sweepCreated = 0;
  fxCounters.trailRequested = 0;
  fxCounters.trailCreated = 0;
}

/**
 * 오브젝트 하나의 트윈 정리·파기·완료 통지를 한 번만 돌게 묶는다.
 * 슬롯 반환은 호출자(세트 단위)가 맡는다 — 낱장이 아니라 세트가 자원 단위이기 때문.
 */
function trackDisposable(
  scene: Phaser.Scene,
  st: SceneFxState,
  obj: Phaser.GameObjects.Image,
  onFinish: () => void,
): () => void {
  st.sprites.add(obj);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    st.sprites.delete(obj);
    scene.tweens.killTweensOf(obj);
    if (obj.scene) obj.destroy();
    onFinish();
  };
  obj.once(Phaser.GameObjects.Events.DESTROY, () => {
    if (finished) return;
    finished = true;
    st.sprites.delete(obj);
    // 무한 반복 트윈(일렁임)이 파괴된 오브젝트 위에 남지 않도록 여기서도 끊는다
    scene.tweens.killTweensOf(obj);
    onFinish();
  });
  return finish;
}

/**
 * 궤적 텍스처를 **빠르게 스치듯** 지나가게 하고, 지나간 경로에 잔상을 남긴다.
 *
 *  - 칼날: 길이를 뻗으며 80~120ms 안에 지나간다
 *  - 잔상: 붉은 외곽 + 흰 코어 2겹으로 경로에 남아 hold 후 fade 로 사라진다
 *
 * **칼날과 잔상은 한 세트**로, 슬롯도 하나만 잡는다 — 상한에 걸리면 세트 전체를
 * 만들지 않는다. '칼날은 나왔는데 잔상만 없는' 상태는 나오지 않는다.
 *
 * `thickness` 를 낮추면 아크가 세로로 눌려 직선 베기에 가까워진다.
 * 텍스처가 없으면 절차 생성 slash 로 폴백한다.
 */
export function sweep(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: SweepOptions = {},
): Phaser.GameObjects.Image | null {
  if (!isLive(scene)) return null;

  const textureKey = opts.texture ?? SWEEP_DEFAULT_TEXTURE;
  if (!scene.textures.exists(textureKey)) {
    return playFx(scene, 'slash', x, y, {
      rotation: opts.rotation,
      scale: opts.length,
      tint: opts.tint,
      alpha: opts.alpha,
      depth: opts.depth,
    });
  }

  const st = getState(scene);
  fxCounters.sweepRequested++;
  if (opts.trail) fxCounters.trailRequested++;

  // 세트 단위로 슬롯 하나 — 여기서 막히면 칼날도 잔상도 만들지 않는다
  if (!acquireSlot(st, SWEEP_SLOT, opts.maxConcurrent ?? SWEEP_MAX_UNITS)) return null;

  const length = opts.length ?? 1;
  const thickness = opts.thickness ?? 1;
  const duration = opts.duration ?? 100;
  const bladeBlend = opts.blend ?? 'add';
  const trailBlend = opts.trail?.blend ?? 'normal';
  const rotation = opts.rotation ?? 0;
  const depth = opts.depth ?? 122;
  const bladeLength = length * 1.05;

  // 세트 안의 모든 장이 끝나야 슬롯을 돌려준다
  let pending = 0;
  let released = false;
  const partDone = () => {
    pending--;
    if (pending <= 0 && !released) {
      released = true;
      releaseSlot(st, SWEEP_SLOT);
    }
  };

  /** 잔상 한 겹 */
  const addTrailLayer = (alpha: number, thick: number, tint: number, dz: number) => {
    const trail = opts.trail!;
    const hold = trail.hold ?? 150;
    const fade = trail.fade ?? 350;

    const img = scene.add.image(x, y, textureKey)
      .setDepth(depth + dz)
      .setRotation(rotation)
      .setAlpha(alpha)
      .setScale(bladeLength, thick) // 길이는 칼날과 같게 — '지나간 길'이 읽혀야 한다
      .setTint(tint);

    img.setBlendMode(toBlendMode(trailBlend));

    pending++;
    const done = trackDisposable(scene, st, img, partDone);
    if (glows(trailBlend)) attachBloom(scene, img);

    scene.tweens.add({
      targets: img,
      alpha: 0,
      scaleY: thick * 0.45,
      duration: fade,
      delay: hold,
      ease: 'Quad.easeIn',
      onComplete: done,
    });
    trackedTimeout(scene, hold + fade + 500, done);
  };

  // ── 잔상: 붉은 외곽(굵고 옅게) + 흰 코어(가늘고 진하게) ──
  if (opts.trail) {
    const baseAlpha = opts.trail.alpha ?? 0.42;
    const outerTint = opts.trail.tint ?? opts.tint ?? 0xffffff;
    addTrailLayer(baseAlpha * 0.85, thickness * 0.55, outerTint, -2);
    addTrailLayer(baseAlpha, thickness * 0.22, opts.trail.coreTint ?? outerTint, -1);
    fxCounters.trailCreated++;
  }

  // ── 칼날: 짧고 빠르게 지나간다 ──
  const blade = scene.add.image(x, y, textureKey)
    .setDepth(depth)
    .setRotation(rotation)
    .setAlpha(opts.alpha ?? 1)
    .setScale(length * 0.5, thickness * 1.15);

  blade.setBlendMode(toBlendMode(bladeBlend));
  if (opts.tint !== undefined) blade.setTint(opts.tint);

  pending++;
  const finishBlade = trackDisposable(scene, st, blade, partDone);
  if (glows(bladeBlend)) attachBloom(scene, blade);

  scene.tweens.add({
    targets: blade,
    scaleX: bladeLength,
    scaleY: thickness * 0.8,
    alpha: 0,
    duration,
    ease: 'Quad.easeOut',
    onComplete: finishBlade,
  });

  // 보험: 히트스톱으로 트윈이 늦어져도 실시간 기준으로 반드시 회수
  trackedTimeout(scene, duration + 500, finishBlade);

  fxCounters.sweepCreated++;
  return blade;
}

// ─────────────────────────────────────────────────────────────────────────────
// beam — 한 점에서 뻗어나가 머무르다 사라지는 광선
// ─────────────────────────────────────────────────────────────────────────────

export interface BeamOptions {
  /** 발사 방향 (라디안). 0 = 오른쪽 */
  angle: number;
  /** 다 뻗었을 때의 길이(px) */
  length: number;
  /** 광선 두께(px). 층 배율이 여기에 곱해진다 */
  thickness: number;
  texture?: string;
  /**
   * 정지 텍스처 대신 **프레임 시트**를 재생한다.
   *
   * 광선의 각도·길이·두께는 코드가 잡고, 시트는 **빔 자체의 요동**(플라즈마 난류,
   * 주변 전기)만 맡는다. 길이는 `scaleX` 로 늘리므로 시트 프레임은 셀 폭을 꽉 채워야 한다.
   * `layers` 는 시트를 쓸 때도 유효하다 — 같은 시트를 두께만 달리해 겹칠 수 있다.
   */
  sheet?: FxKey;
  /** 뻗는 시간 / 머무는 시간 / 사라지는 시간(ms) */
  extendMs?: number;
  holdMs?: number;
  fadeMs?: number;
  tint?: number;
  alpha?: number;
  depth?: number;
  blend?: FxBlend;
  /**
   * 겹 층. 검기와 같은 규칙 — 넓고 옅은 외곽 → 본체 → 얇은 흰 코어.
   * `scale` 은 두께 배율이고, 길이는 모든 층이 같다.
   */
  layers?: { thickness: number; texture?: string; tint?: number; alpha: number; dz: number }[];
  /** 살아 있는 동안의 미세한 흔들림 (두께 방향) */
  waver?: { thickness?: number; periodMs?: number };
  /**
   * 텍스처를 세로로 뒤집는다. 같은 번개 텍스처로 **다른 모양처럼** 보이게 할 때 쓴다 —
   * 낙뢰는 같은 그림이 반복되면 '깜빡임'이 아니라 '한 줄기가 흐려지는 것'으로 읽힌다.
   */
  flipY?: boolean;
  /**
   * 사라지는 방식.
   * - `fade`    : 통째로 옅어진다 (기본)
   * - `retract` : **꼬리가 머리를 쫓아가며 짧아진다.** 발사점부터 훑듯이 사라지고
   *               끝은 제자리에 남아 화면 밖으로 빠져나간 것처럼 읽힌다.
   */
  dissipate?: 'fade' | 'retract';
  maxConcurrent?: number;
}

const BEAM_SLOT = 'beam';
const BEAM_MAX_UNITS = 4;

/**
 * 손끝 같은 **한 점에서 뻗어나가는** 광선. projectile 과 달리 원점이 고정이고 길이가 자란다.
 *
 * 원점을 `[0, 0.5]` 로 두어 이미지의 왼쪽 끝이 발사점이 된다 — 가운데를 축으로 두면
 * 광선이 손 뒤쪽으로도 자란다. 길이는 `scaleX`, 두께는 `scaleY` 로 만든다.
 */
export function beam(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: BeamOptions,
): Phaser.GameObjects.Image | null {
  if (!isLive(scene)) return null;

  const textureKey = opts.texture ?? SWEEP_DEFAULT_TEXTURE;
  const sheetDef = opts.sheet ? FX_REGISTRY[opts.sheet] : null;
  const sheetAnim = opts.sheet && sheetDef ? ensureFxAnim(scene, opts.sheet, sheetDef) : null;
  if (opts.sheet && !sheetAnim) return null;                 // 시트가 아직 안 올라옴
  if (!sheetDef && !scene.textures.exists(textureKey)) return null;

  const st = getState(scene);
  if (!acquireSlot(st, BEAM_SLOT, opts.maxConcurrent ?? BEAM_MAX_UNITS)) return null;

  const extendMs = opts.extendMs ?? 150;
  const holdMs = opts.holdMs ?? 120;
  const fadeMs = opts.fadeMs ?? 220;
  const depth = opts.depth ?? 122;
  const blend = opts.blend ?? 'normal';
  const total = extendMs + holdMs + fadeMs;

  let pending = 0;
  let released = false;
  const partDone = () => {
    pending--;
    if (pending <= 0 && !released) {
      released = true;
      releaseSlot(st, BEAM_SLOT);
    }
  };

  /** 길이·두께를 px 로 지정받으므로 **층마다 자기 텍스처의 원본 크기**로 배율을 낸다 */
  const sizeOf = (key: string): { w: number; h: number } => {
    // 시트는 프레임 크기가 곧 기준 크기다 (텍스처 전체가 아니라)
    if (sheetDef) return { w: sheetDef.frameWidth, h: sheetDef.frameHeight };
    const src = scene.textures.get(key)?.getSourceImage() as { width?: number; height?: number } | undefined;
    return { w: src?.width || 1, h: src?.height || 1 };
  };

  const addLayer = (
    thickness: number, tint: number | undefined, alpha: number, dz: number, tex: string,
    phase: number,
  ): Phaser.GameObjects.Image => {
    const { w: texW, h: texH } = sizeOf(tex);
    const full = opts.length / texW;
    const sy = (thickness / texH) * (opts.flipY ? -1 : 1);

    const img: Phaser.GameObjects.Image = sheetDef && sheetAnim
      ? scene.add.sprite(x, y, sheetDef.textureKey, 0)
      : scene.add.image(x, y, tex);
    img
      .setOrigin(0, 0.5)
      .setDepth(depth + dz)
      .setRotation(opts.angle)
      .setAlpha(alpha)
      .setScale(full * 0.05, sy);
    img.setBlendMode(toBlendMode(blend));
    if (tint !== undefined) img.setTint(tint);
    if (sheetDef && sheetAnim) {
      const sp = img as Phaser.GameObjects.Sprite;
      sp.play({ key: sheetAnim, repeat: -1 });
      // 겹 층끼리 같은 프레임이면 결이 겹쳐 한 장처럼 보인다 — 위상을 어긋나게 준다
      sp.anims.setProgress(((dz + 2) * 0.27) % 1);
    }

    pending++;
    const done = trackDisposable(scene, st, img, partDone);
    if (glows(blend)) attachBloom(scene, img);

    // 뻗음 → (유지) → 사라짐
    scene.tweens.add({
      targets: img, scaleX: full, duration: extendMs, ease: 'Quart.easeOut',
    });
    if (opts.dissipate === 'retract') {
      // 원점을 진행 방향으로 밀면서 같은 양만큼 길이를 줄인다 → **끝은 고정, 꼬리만 전진**.
      // (원점이 [0, 0.5] 라 x·y 가 곧 꼬리 위치다)
      scene.tweens.add({
        targets: img,
        x: x + Math.cos(opts.angle) * opts.length,
        y: y + Math.sin(opts.angle) * opts.length,
        scaleX: 0,
        duration: fadeMs, delay: extendMs + holdMs, ease: 'Sine.easeIn',
        onComplete: done,
      });
    } else {
      scene.tweens.add({
        targets: img, alpha: 0, duration: fadeMs, delay: extendMs + holdMs, ease: 'Quad.easeIn',
        onComplete: done,
      });
    }

    const wv = opts.waver;
    if (wv?.thickness) {
      scene.tweens.add({
        targets: img, scaleY: sy * (1 + wv.thickness),
        duration: (wv.periodMs ?? 220) / 2, delay: extendMs + phase,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }

    trackedTimeout(scene, total + 500, done);
    return img;
  };

  for (const [i, L] of (opts.layers ?? []).entries()) {
    addLayer(opts.thickness * L.thickness, L.tint, L.alpha, L.dz, L.texture ?? textureKey, (i + 1) * 45);
  }
  return addLayer(opts.thickness, opts.tint, opts.alpha ?? 1, 0, textureKey, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// fxSprite — 호출부가 직접 연출하는 추적 스프라이트
// ─────────────────────────────────────────────────────────────────────────────

export interface FxSpriteOptions {
  rotation?: number;
  /** 표시 배율 [가로, 세로] */
  scale?: [number, number];
  /** 표시 원점 [x, y]. 한쪽 끝을 축으로 자라거나 회전시킬 때 쓴다 */
  origin?: [number, number];
  tint?: number;
  alpha?: number;
  depth?: number;
  blend?: FxBlend;
  /**
   * 정지 텍스처 대신 **프레임 시트를 반복 재생**한다.
   *
   * playFx 는 한 번 재생하고 스스로 사라지지만, 여우불처럼 **호출부가 들고 다니며
   * 계속 움직이는** 이펙트는 살아 있는 동안 계속 돌아야 한다.
   * `scale` 은 시트의 프레임 크기 기준이 된다.
   */
  sheet?: FxKey;
  /**
   * 시트 재생을 시작할 지점 (0~1). 같은 루프를 여러 개 띄울 때 **위상을 어긋나게** 한다 —
   * 구미호 꼬리 9개가 한 박자로 살랑이면 부채가 통째로 펄럭이는 것처럼 보인다.
   */
  sheetStart?: number;
  /**
   * 블룸 레이어에 올릴지 (기본 **false**).
   *
   * 블룸 레이어는 depth 가 고정(122)이라, 여기 올라가면 **오브젝트가 지정한 depth 를 잃는다** —
   * 캐릭터 뒤에 있어야 할 꼬리가 앞으로 튀어나오는 식이다. 게다가 하나라도 살아 있으면
   * 전체 화면 블룸 패스가 계속 돌기 때문에 **오래 사는 이펙트는 절대 올리면 안 된다.**
   * 짧게 번쩍이고 사라지는 것만 켠다.
   */
  bloom?: boolean;
  /**
   * 보험 수명(ms). **필수** — 이 시간이 지나면 호출부 트윈이 어긋나도 무조건 회수된다.
   * 히트스톱으로 트윈이 밀려도 회수가 밀리지 않도록 실시간 타이머로 잰다.
   */
  lifeMs: number;
  slot?: string;
  maxConcurrent?: number;
}

const FX_SPRITE_SLOT = 'fxsprite';
const FX_SPRITE_MAX_UNITS = 12;

/**
 * 트윈을 **호출부가 직접 거는** 이펙트 스프라이트.
 *
 * playFx·sweep·projectile 로 표현되지 않는 일회성 연출(칼에 맺히는 오러 등)을 위해 열어 둔다.
 * 씬 트래커에 등록되므로 shutdown 시 스프라이트와 **거기 걸린 트윈까지** 함께 회수되고,
 * `lifeMs` 보험 타이머가 어떤 경우에도 마지막에 정리한다.
 * 호출부는 연출이 끝나면 `destroy()` 를 불러 먼저 반납해도 된다.
 */
export function fxSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  texture: string,
  opts: FxSpriteOptions,
): Phaser.GameObjects.Image | null {
  if (!isLive(scene)) return null;

  const sheetDef = opts.sheet ? FX_REGISTRY[opts.sheet] : null;
  const sheetAnim = opts.sheet && sheetDef ? ensureFxAnim(scene, opts.sheet, sheetDef) : null;
  if (opts.sheet && !sheetAnim) return null;   // 시트가 아직 안 올라옴
  if (!sheetDef && !scene.textures.exists(texture)) return null;

  const st = getState(scene);
  const slot = opts.slot ?? FX_SPRITE_SLOT;
  if (!acquireSlot(st, slot, opts.maxConcurrent ?? FX_SPRITE_MAX_UNITS)) return null;

  const [sx, sy] = opts.scale ?? [1, 1];
  const blend = opts.blend ?? 'normal';

  const img: Phaser.GameObjects.Image = sheetDef && sheetAnim
    ? scene.add.sprite(x, y, sheetDef.textureKey, 0)
    : scene.add.image(x, y, texture);
  img
    .setDepth(opts.depth ?? 122)
    .setRotation(opts.rotation ?? 0)
    .setAlpha(opts.alpha ?? 1)
    .setScale(sx, sy);
  if (opts.origin) img.setOrigin(opts.origin[0], opts.origin[1]);
  img.setBlendMode(toBlendMode(blend));
  if (opts.tint !== undefined) img.setTint(opts.tint);
  // 살아 있는 동안 계속 돈다 — 회수는 lifeMs 와 호출부의 destroy 가 맡는다
  if (sheetDef && sheetAnim) {
    const sp = img as Phaser.GameObjects.Sprite;
    sp.play({ key: sheetAnim, repeat: -1 });
    if (opts.sheetStart !== undefined) sp.anims.setProgress(opts.sheetStart);
  }

  let insurance = -1;
  const done = trackDisposable(scene, st, img, () => {
    // 먼저 끝났으면 보험 타이머를 거둔다 (lifeMs 가 분 단위인 상시 이펙트가 있다)
    if (insurance >= 0) cancelTrackedTimeout(scene, insurance);
    releaseSlot(st, slot);
  });
  if (opts.bloom && glows(blend)) attachBloom(scene, img);
  insurance = trackedTimeout(scene, opts.lifeMs, done);

  return img;
}

// ─────────────────────────────────────────────────────────────────────────────
// projectile — 날아가는 이펙트 (검기 · 에너지파 · 여우불)
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectileOptions {
  /** 도착점 (월드 좌표) */
  to: { x: number; y: number };
  /** 비행 시간(ms) */
  duration: number;
  /** 본체 텍스처 키 (기본: proc-arc) */
  texture?: string;
  /**
   * 정지 텍스처 대신 **프레임 시트**를 재생한다.
   *
   * 재생 시간은 비행 시간에 맞춰진다 — 검기가 날아가는 동안 형태가 뻗었다가 찢어지고
   * 조각으로 흩어진다. 정지 텍스처를 변형만 하는 것과 다른 점이 여기다.
   * `scale` 은 시트의 **프레임 크기** 기준이 되고, `layers` 는 무시한다(그림이 이미 다 있다).
   */
  sheet?: FxKey;
  /** 텍스처 회전(라디안) */
  rotation?: number;
  /** 표시 배율 [가로, 세로] */
  scale?: [number, number];
  /**
   * 표시 원점 [x, y].
   * 텍스처의 그려진 영역이 이미지 한가운데에 있지 않으면 **보이는 위치와 판정 좌표가 어긋난다**.
   * (proc-arc 는 위쪽에 치우쳐 있어 y 원점을 0.13 쯤으로 당겨야 아크 중심이 좌표에 온다)
   */
  origin?: [number, number];
  tint?: number;
  alpha?: number;
  depth?: number;
  /** 본체 블렌드 (기본 add — 검기·에너지는 빛나야 맞다) */
  blend?: FxBlend;
  /**
   * 지나간 자리에 남는 잔상. **속도감은 전적으로 이게 만든다.**
   * 비행이 길어져도 스프라이트가 불어나지 않도록 `max` 로 총 장수를 묶는다.
   */
  afterimage?: {
    /** 남기는 간격(ms, 기본 70) */
    interval?: number;
    /** 사라지는 시간(ms, 기본 260) */
    fade?: number;
    alpha?: number;
    tint?: number;
    /** 한 발이 남길 수 있는 총 장수 (기본 12) */
    max?: number;
    /** 잔상 블렌드 (기본: 본체와 동일) */
    blend?: FxBlend;
  };
  /**
   * 겹쳐 그릴 층. 실무 관행대로 **넓고 옅은 외곽 → 본체 → 얇은 흰 코어** 순으로 쌓는다.
   * 한 겹짜리 이펙트는 크기가 작아지면 납작하게 보여 형태가 읽히지 않는다.
   * 층은 본체 좌표를 매 프레임 따라간다.
   */
  layers?: {
    /** 본체 배율에 곱해지는 [가로, 세로] */
    scale: [number, number];
    texture?: string;
    tint?: number;
    alpha: number;
    /** 본체 depth 기준 오프셋 (음수 = 뒤) */
    dz: number;
  }[];
  /**
   * 비행하면서 가늘어지는 정도 (1 = 유지, 0.5 = 세로 절반까지).
   * 알파만 빼면 '흐려지는 그림'이고, 가늘어져야 '흩어지는 기운'으로 읽힌다.
   */
  thinTo?: number;
  /**
   * 일렁임 — 비행 중 미세하게 흔들린다. 정지 텍스처가 '판때기'로 보이지 않게 하는 장치다.
   * **세로 배율은 `thinTo` 가 쓰고 있으므로 회전과 가로 늘어남에만 건다** —
   * 같은 속성에 트윈을 둘 걸면 서로 덮어쓴다.
   */
  waver?: { rotation?: number; stretch?: number; periodMs?: number };
  /**
   * 발사 순간의 뻗음. 처음엔 눌려 있다가 제 크기로 늘어난다 —
   * **처음부터 제 크기로 나타나면 '날아가는 물체'로 읽히고, 뻗어야 '뿜어져 나온 것'으로 읽힌다.**
   */
  launch?: { fromScale: number; ms: number };
  /** 비행 중 매 프레임 호출 — 경로 판정용. 현재 좌표가 들어온다 */
  onStep?: (x: number, y: number) => void;
  /** 도착(또는 강제 회수) 시 정확히 1회 호출 */
  onComplete?: () => void;
  maxConcurrent?: number;
}

const PROJECTILE_SLOT = 'projectile';
/** 동시에 날 수 있는 발 수. 나이트 1회 발동 = 3발이고 볼리가 겹칠 수 있어 여유를 둔다 */
const PROJECTILE_MAX_UNITS = 9;

/**
 * 이펙트 하나를 (x, y) → `to` 로 **날려 보낸다**.
 *
 *  - 본체: 등속으로 이동하며 매 프레임 `onStep` 으로 현재 좌표를 알려준다 (경로 판정)
 *  - 잔상: 일정 간격으로 지나간 자리에 낱장을 떨어뜨리고 알파를 빼며 지운다
 *
 * **본체와 잔상은 한 세트**로 슬롯 하나만 잡는다 — 상한에 걸리면 아무것도 만들지 않고
 * `onComplete` 를 즉시 호출한다. 호출부의 정리 로직이 건너뛰어지지 않게 하기 위함이다.
 */
export function projectile(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: ProjectileOptions,
): Phaser.GameObjects.Image | null {
  const bail = () => {
    opts.onComplete?.();
    return null;
  };
  if (!isLive(scene)) return bail();

  const textureKey = opts.texture ?? SWEEP_DEFAULT_TEXTURE;
  if (!scene.textures.exists(textureKey)) return bail();

  const sheetDef = opts.sheet ? FX_REGISTRY[opts.sheet] : null;
  const sheetAnim = opts.sheet && sheetDef ? ensureFxAnim(scene, opts.sheet, sheetDef) : null;
  if (opts.sheet && !sheetAnim) return bail(); // 시트가 아직 안 올라옴

  const st = getState(scene);
  if (!acquireSlot(st, PROJECTILE_SLOT, opts.maxConcurrent ?? PROJECTILE_MAX_UNITS)) return bail();

  const [sx, sy] = opts.scale ?? [1, 1];
  const depth = opts.depth ?? 122;
  const rotation = opts.rotation ?? 0;
  const blend = opts.blend ?? 'add';

  // 세트 안의 본체·잔상이 모두 끝나야 슬롯을 돌려준다
  let pending = 0;
  let released = false;
  const partDone = () => {
    pending--;
    if (pending <= 0 && !released) {
      released = true;
      releaseSlot(st, PROJECTILE_SLOT);
    }
  };

  const ai = opts.afterimage;
  const aiInterval = ai?.interval ?? 70;
  const aiFade = ai?.fade ?? 260;
  const aiMax = ai?.max ?? 12;
  const aiBlend = ai?.blend ?? blend;
  let aiLeft = ai ? aiMax : 0;

  const dropAfterimage = (ax: number, ay: number): void => {
    // 본체의 **현재** 배율을 물려받는다 — 뻗음·가늘어짐을 겪은 모양이 그대로 꼬리가 된다
    const cx = body.scaleX;
    const cy = body.scaleY;
    const img = scene.add.image(ax, ay, textureKey)
      .setDepth(depth - 2)
      .setRotation(rotation)
      .setAlpha(ai?.alpha ?? 0.4)
      .setScale(cx, cy);
    if (opts.origin) img.setOrigin(opts.origin[0], opts.origin[1]);
    img.setBlendMode(toBlendMode(aiBlend));
    img.setTint(ai?.tint ?? opts.tint ?? 0xffffff);

    pending++;
    const done = trackDisposable(scene, st, img, partDone);
    if (glows(aiBlend)) attachBloom(scene, img);

    // 뒤로 갈수록 잦아들며 얇아진다 — **옅어지는 복사본이 아니라 가늘어지는 꼬리**여야
    // '지나간 길'로 읽힌다 (알파만 빼면 그냥 흐린 그림이 겹쳐 보인다)
    scene.tweens.add({
      targets: img,
      alpha: 0,
      scaleX: cx * 0.82,
      scaleY: cy * 0.3,
      duration: aiFade,
      ease: 'Quad.easeIn',
      onComplete: done,
    });
    trackedTimeout(scene, aiFade + 500, done);
  };

  const body: Phaser.GameObjects.Image = sheetDef && sheetAnim
    ? scene.add.sprite(x, y, sheetDef.textureKey, 0)
    : scene.add.image(x, y, textureKey);
  body
    .setDepth(depth)
    .setRotation(rotation)
    .setAlpha(opts.alpha ?? 1)
    .setScale(sx, sy);
  if (opts.origin) body.setOrigin(opts.origin[0], opts.origin[1]);
  body.setBlendMode(toBlendMode(blend));
  if (opts.tint !== undefined) body.setTint(opts.tint);

  if (sheetDef && sheetAnim) {
    // 프레임 수를 비행 시간에 나눠 재생한다 — 도착할 때 마지막 프레임(잔재)이 되도록
    (body as Phaser.GameObjects.Sprite).play({
      key: sheetAnim,
      frameRate: Math.max(1, sheetDef.frameCount / (opts.duration / 1000)),
    });
  }

  const launchMs = opts.launch?.ms ?? 0;
  const fromScale = opts.launch?.fromScale ?? 1;

  /**
   * 발사 뻗음 → 비행 중 가늘어짐. **두 트윈이 같은 scaleY 를 두고 겹치지 않도록**
   * 얇아지는 쪽은 뻗음이 끝난 뒤부터 시작한다.
   */
  const shapeOverLife = (img: Phaser.GameObjects.Image, bx: number, by: number, phase = 0): void => {
    if (opts.launch) {
      img.setScale(bx * fromScale, by * fromScale);
      scene.tweens.add({
        targets: img, scaleX: bx, scaleY: by,
        duration: launchMs, ease: 'Quad.easeOut',
      });
    }
    if (opts.thinTo !== undefined) {
      scene.tweens.add({
        targets: img, scaleY: by * opts.thinTo,
        duration: Math.max(1, opts.duration - launchMs),
        delay: launchMs,
        ease: 'Quad.easeIn',
      });
    }

    const wv = opts.waver;
    if (!wv) return;
    const half = (wv.periodMs ?? 300) / 2;
    // 층마다 위상을 어긋나게 준다 — 같은 박자로 흔들리면 통째로 움직여 일렁임이 안 보인다
    if (wv.rotation) {
      scene.tweens.add({
        targets: img, rotation: rotation + wv.rotation,
        duration: half, delay: launchMs + phase, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
    if (wv.stretch) {
      scene.tweens.add({
        targets: img, scaleX: bx * (1 + wv.stretch),
        duration: half * 0.78, delay: launchMs + phase * 1.4, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  };

  // ── 겹 층 — 본체를 따라다니며 같은 형태 변화를 겪는다 ──
  // 시트는 그림이 이미 다 들어 있으므로 층을 쌓지 않는다
  const extras: Phaser.GameObjects.Image[] = [];
  for (const L of (sheetDef ? [] : opts.layers ?? [])) {
    const lx = sx * L.scale[0];
    const ly = sy * L.scale[1];
    const img = scene.add.image(x, y, L.texture ?? textureKey)
      .setDepth(depth + L.dz)
      .setRotation(rotation)
      .setAlpha(L.alpha)
      .setScale(lx, ly);
    if (opts.origin) img.setOrigin(opts.origin[0], opts.origin[1]);
    img.setBlendMode(toBlendMode(blend));
    if (L.tint !== undefined) img.setTint(L.tint);

    pending++;
    const doneLayer = trackDisposable(scene, st, img, partDone);
    if (glows(blend)) attachBloom(scene, img);
    shapeOverLife(img, lx, ly, (extras.length + 1) * 70);
    trackedTimeout(scene, opts.duration + 500, doneLayer);
    extras.push(img);
  }

  shapeOverLife(body, sx, sy);

  pending++;
  let notified = false;
  const finishBody = trackDisposable(scene, st, body, () => {
    partDone();
    if (notified) return;
    notified = true;
    opts.onComplete?.();
  });
  if (glows(blend)) attachBloom(scene, body);

  let lastDrop = 0;
  scene.tweens.add({
    targets: body,
    x: opts.to.x,
    y: opts.to.y,
    duration: opts.duration,
    ease: 'Linear',
    onUpdate: (tw: Phaser.Tweens.Tween) => {
      if (!body.active) return;
      for (const e of extras) { e.x = body.x; e.y = body.y; }
      opts.onStep?.(body.x, body.y);
      if (aiLeft <= 0) return;
      // 잔상 간격은 씬 시간 기준 — 히트스톱으로 본체가 멈추면 잔상도 함께 멈춘다
      const elapsed = (tw?.progress ?? 0) * opts.duration;
      if (elapsed - lastDrop < aiInterval) return;
      lastDrop = elapsed;
      aiLeft--;
      dropAfterimage(body.x, body.y);
    },
    onComplete: finishBody,
  });

  // 보험: 히트스톱으로 트윈이 늦어져도 실시간 기준으로 반드시 회수
  trackedTimeout(scene, opts.duration + 500, finishBody);

  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// burst — 파티클 프리셋
// ─────────────────────────────────────────────────────────────────────────────

/** 불티 / 파편 / 반짝임 / 연기 / 기운 / 섬광선 */
export type BurstPreset = 'ember' | 'shard' | 'sparkle' | 'smoke' | 'wisp' | 'streak';

export interface BurstOptions {
  count?: number;
  /** 블렌드 오버라이드 (기본: 프리셋 정의) */
  blend?: FxBlend;
  /** 착색 가능한 레이어에만 적용된다 (자체 색을 가진 텍스처는 원색 유지) */
  tint?: number | number[];
  /** 프리셋 기본 스케일에 곱해지는 배율 */
  scale?: number;
  /** 프리셋 기본 속도에 곱해지는 배율 */
  speed?: number;
  depth?: number;
  gravityY?: number;
  /** 방출 각도 범위(도). 생략 시 전방위 */
  angle?: { min: number; max: number };
  /** 수명 배율 */
  lifespan?: number;
}

/** 에셋이 없을 때 쓰는 런타임 생성 폴백 텍스처 */
type ProcTexture = 'fx_p_dot' | 'fx_p_shard' | 'fx_p_star';

interface BurstLayerDef {
  /** 에셋 텍스처 키 */
  texture: string;
  /** 에셋이 로드되지 않았을 때 쓸 런타임 생성 텍스처 */
  fallback: ProcTexture;
  /** 이 레이어가 가져갈 파티클 비율 (프리셋 내 합 = 1) */
  ratio: number;
  /** 프리셋 스케일에 곱해지는 레이어 배율 */
  scaleMul: number;
  /** 흰색·회색 계열이라 tint 를 먹여도 탁해지지 않는가 */
  tintable: boolean;
}

interface BurstPresetDef {
  layers: BurstLayerDef[];
  blend: FxBlend;
  count: number;
  speed: { min: number; max: number };
  lifespanMs: { min: number; max: number };
  /** 128px 에셋 기준 스케일 */
  scale: { start: number; end: number };
  gravityY: number;
  depth: number;
  tint: number;
  rotate?: { min: number; max: number };
  alpha?: { start: number; end: number };
}

/** 폴백 텍스처는 32/16px 라 128px 에셋과 같은 크기가 되려면 더 크게 그려야 한다 */
const PROC_FALLBACK_SCALE: Record<ProcTexture, number> = {
  fx_p_dot: 4,
  fx_p_shard: 8,
  fx_p_star: 4,
};

const BURST_PRESETS: Record<BurstPreset, BurstPresetDef> = {
  // 불티 — 유기적 스파크 + 수학 스파크를 섞어 결이 살아 있게
  ember: {
    layers: [
      { texture: 'fx_ember_1',    fallback: 'fx_p_dot', ratio: 0.55, scaleMul: 1,    tintable: true },
      { texture: 'fx_proc_spark', fallback: 'fx_p_dot', ratio: 0.45, scaleMul: 0.85, tintable: true },
    ],
    blend: 'add',
    count: 14,
    speed: { min: 60, max: 210 },
    lifespanMs: { min: 320, max: 680 },
    scale: { start: 0.42, end: 0 },
    gravityY: 240,
    depth: 121,
    tint: 0xffaa33,
  },
  // 파편 — 각진 조각이 회전하며 떨어진다
  shard: {
    layers: [
      { texture: 'fx_proc_shard', fallback: 'fx_p_shard', ratio: 1, scaleMul: 1, tintable: true },
    ],
    blend: 'normal',
    count: 10,
    speed: { min: 130, max: 340 },
    lifespanMs: { min: 280, max: 560 },
    scale: { start: 0.34, end: 0.05 },
    gravityY: 520,
    depth: 121,
    tint: 0xffffff,
    rotate: { min: -360, max: 360 },
  },
  // 반짝임 — 별빛 2종 + 소프트 글로우
  sparkle: {
    layers: [
      { texture: 'fx_star_1',    fallback: 'fx_p_star', ratio: 0.4, scaleMul: 1,    tintable: true },
      { texture: 'fx_star_2',    fallback: 'fx_p_star', ratio: 0.3, scaleMul: 0.85, tintable: true },
      { texture: 'fx_proc_glow', fallback: 'fx_p_dot',  ratio: 0.3, scaleMul: 0.7,  tintable: true },
    ],
    blend: 'add',
    count: 12,
    speed: { min: 20, max: 110 },
    lifespanMs: { min: 480, max: 950 },
    scale: { start: 0.38, end: 0 },
    gravityY: -30,
    depth: 122,
    tint: 0xffffff,
    alpha: { start: 1, end: 0 },
  },
  // 연기 — 느리게 퍼지는 덩어리. 가산이 아니라 화면을 하얗게 만들지 않는다
  smoke: {
    layers: [
      { texture: 'fx_smoke_1', fallback: 'fx_p_dot', ratio: 0.5, scaleMul: 1,   tintable: true },
      { texture: 'fx_smoke_2', fallback: 'fx_p_dot', ratio: 0.5, scaleMul: 1.1, tintable: true },
    ],
    blend: 'normal',
    count: 5,
    speed: { min: 12, max: 55 },
    lifespanMs: { min: 700, max: 1300 },
    scale: { start: 0.35, end: 0.9 },
    gravityY: -20,
    depth: 119,
    tint: 0xffffff,
    alpha: { start: 0.45, end: 0 },
    rotate: { min: -40, max: 40 },
  },
  // 기운 — 유기적 에너지 가닥. 자체 색(청록)을 살린다
  wisp: {
    layers: [
      { texture: 'fx_wisp_1', fallback: 'fx_p_dot', ratio: 0.5, scaleMul: 1,    tintable: false },
      { texture: 'fx_wisp_2', fallback: 'fx_p_dot', ratio: 0.5, scaleMul: 0.85, tintable: false },
    ],
    blend: 'add',
    count: 8,
    speed: { min: 30, max: 130 },
    lifespanMs: { min: 450, max: 900 },
    scale: { start: 0.45, end: 0.05 },
    gravityY: -60,
    depth: 121,
    tint: 0xffffff,
  },
  // 섬광선 — 가늘고 길게 뻗는 선. 베기·돌진의 방향감을 만든다
  streak: {
    layers: [
      { texture: 'fx_proc_streak', fallback: 'fx_p_dot', ratio: 1, scaleMul: 1, tintable: true },
    ],
    blend: 'add',
    count: 8,
    speed: { min: 180, max: 420 },
    lifespanMs: { min: 200, max: 400 },
    scale: { start: 0.5, end: 0.05 },
    gravityY: 0,
    depth: 122,
    tint: 0xffffff,
  },
};

/** 파티클 폴백 텍스처를 최초 1회만 생성 (에셋 미preload·로드 실패 대비) */
function ensureProcTexture(scene: Phaser.Scene, key: ProcTexture): boolean {
  if (scene.textures.exists(key)) return true;

  const size = key === 'fx_p_shard' ? 16 : 32;
  const tex = scene.textures.createCanvas(key, size, size);
  if (!tex) return false;
  const ctx = tex.getContext();
  const c = size / 2;

  if (key === 'fx_p_dot') {
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else if (key === 'fx_p_shard') {
    // 각진 파편 — 마름모
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.beginPath();
    ctx.moveTo(c, 1);
    ctx.lineTo(size - 3, c);
    ctx.lineTo(c, size - 1);
    ctx.lineTo(3, c);
    ctx.closePath();
    ctx.fill();
  } else {
    // 4갈래 반짝임
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c * 0.45);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const armW = size * 0.09;
    ctx.beginPath();
    ctx.moveTo(c, 0); ctx.lineTo(c + armW, c); ctx.lineTo(c, size); ctx.lineTo(c - armW, c);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, c); ctx.lineTo(c, c - armW); ctx.lineTo(size, c); ctx.lineTo(c, c + armW);
    ctx.closePath(); ctx.fill();
  }

  tex.refresh();
  return true;
}

/** 에셋 텍스처가 있으면 그것을, 없으면 폴백을 쓴다 (스케일 보정 포함) */
function resolveLayerTexture(
  scene: Phaser.Scene,
  layer: BurstLayerDef,
): { key: string; scaleMul: number; tintable: boolean } | null {
  if (scene.textures.exists(layer.texture)) {
    return { key: layer.texture, scaleMul: layer.scaleMul, tintable: layer.tintable };
  }
  if (!ensureProcTexture(scene, layer.fallback)) return null;
  return {
    key: layer.fallback,
    scaleMul: layer.scaleMul * PROC_FALLBACK_SCALE[layer.fallback],
    tintable: true, // 폴백은 항상 흰색이라 착색 가능
  };
}

/**
 * (x, y) 에서 파티클을 1회 폭발시킨다. 마지막 파티클이 죽으면 이미터는 자동 파기된다.
 * 여러 텍스처를 섞는 프리셋은 레이어마다 이미터가 하나씩 생기고, 전부 배열로 반환된다.
 */
/**
 * 화면에 동시에 살아 있을 수 있는 파티클 이미터 총량.
 *
 * 스프라이트는 슬롯으로 묶여 있었지만 **이미터에는 상한이 없었다.** burst 는 프리셋
 * 레이어마다 이미터를 하나씩 만들기 때문에, 한 프레임에 여러 대상을 처리하는 능력이
 * 순식간에 수십 개를 띄운다 — 레거시가 똥 4마리를 동시에 태우면 불티(2층)+연기(2층)로
 * 한 번에 16개가 생기고, 연기 수명이 1.3초라 다음 소각이 겹치며 40개를 넘겼다.
 * 이미터는 각자 렌더 패스와 파티클 풀을 갖는 무거운 오브젝트다.
 */
const EMITTER_MAX = 14;

export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  preset: BurstPreset,
  opts: BurstOptions = {},
): Phaser.GameObjects.Particles.ParticleEmitter[] {
  if (!isLive(scene)) return [];

  const def = BURST_PRESETS[preset];
  const st = getState(scene);
  const speedMul = opts.speed ?? 1;
  const lifeMul = opts.lifespan ?? 1;
  const scaleMul = opts.scale ?? 1;
  const lifeMax = def.lifespanMs.max * lifeMul;
  const totalCount = opts.count ?? def.count;
  const created: Phaser.GameObjects.Particles.ParticleEmitter[] = [];

  for (const layerDef of def.layers) {
    // 상한을 넘으면 조용히 건너뛴다. 몇 겹 빠지는 것보다 프레임이 무너지는 편이 나쁘다
    if (st.emitters.size >= EMITTER_MAX) break;
    const resolved = resolveLayerTexture(scene, layerDef);
    if (!resolved) continue;

    const count = Math.max(1, Math.round(totalCount * layerDef.ratio));
    const s = scaleMul * resolved.scaleMul;

    const config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      speed: { min: def.speed.min * speedMul, max: def.speed.max * speedMul },
      lifespan: { min: def.lifespanMs.min * lifeMul, max: lifeMax },
      scale: { start: def.scale.start * s, end: def.scale.end * s },
      gravityY: opts.gravityY ?? def.gravityY,
      angle: opts.angle ?? { min: 0, max: 360 },
      blendMode: toBlendMode(opts.blend ?? def.blend),
      emitting: false,
    };
    // 자체 색을 가진 텍스처에 tint 를 곱하면 탁해지므로 착색 가능한 레이어에만 적용
    if (resolved.tintable) config.tint = opts.tint ?? def.tint;
    if (def.rotate) config.rotate = def.rotate;
    if (def.alpha) config.alpha = def.alpha;

    const emitter = scene.add.particles(x, y, resolved.key, config).setDepth(opts.depth ?? def.depth);
    st.emitters.add(emitter);
    if (glows(opts.blend ?? def.blend)) attachBloom(scene, emitter);

    emitter.explode(count);
    created.push(emitter);

    // 최대 수명 + 여유 후 회수 (실시간 기준이라 히트스톱과 무관하게 반드시 돈다)
    trackedTimeout(scene, lifeMax + 120, () => {
      st.emitters.delete(emitter);
      if (emitter.scene) emitter.destroy();
    });
  }

  return created;
}

// ─────────────────────────────────────────────────────────────────────────────
// petalFall — 낙엽처럼 흩날리며 지는 낙하 연출
// ─────────────────────────────────────────────────────────────────────────────

export interface PetalFallOptions {
  count?: number;
  /** 꽃잎 텍스처 (기본: proc-petal) */
  texture?: string;
  /** 색. 배열이면 꽃잎마다 무작위로 고른다 */
  tint?: number | number[];
  /** 꽃잎 크기 범위 */
  scale?: { min: number; max: number };
  /** 시작 위치 산포 (px) */
  spread?: { x: number; y: number };
  /** 낙하 거리 (px) */
  fall?: { min: number; max: number };
  /** 좌우 흔들림 진폭 (px) */
  sway?: { min: number; max: number };
  /** 낙하 시간 (ms) */
  duration?: { min: number; max: number };
  depth?: number;
}

const PETAL_SLOT = 'petal';
/** 화면에 동시에 떠 있을 수 있는 꽃잎 총량 */
const PETAL_MAX = 60;
const PETAL_DEFAULT_TEXTURE = 'fx_proc_petal';

/**
 * 꽃잎이 **아래로 지면서 좌우로 흔들리는** 낙하 연출.
 *
 * 파티클 이미터(방사형 폭발)로는 이 움직임이 나오지 않아 낱장 트윈으로 만든다.
 *  - 세로: 아래로 가속(Sine.easeIn) — 중력
 *  - 가로: yoyo 반복 트윈 — 좌우 스웨이
 *  - 회전: 느린 텀블링
 * 크기는 작게 유지한다. 주인공은 칼날 궤적이고 꽃잎은 잔향이다.
 */
export function petalFall(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: PetalFallOptions = {},
): void {
  if (!isLive(scene)) return;

  const textureKey = opts.texture ?? PETAL_DEFAULT_TEXTURE;
  if (!scene.textures.exists(textureKey)) return;

  const st = getState(scene);
  const count = opts.count ?? 9;
  const scaleR = opts.scale ?? { min: 0.055, max: 0.095 };
  const spread = opts.spread ?? { x: 10, y: 8 };
  const fallR = opts.fall ?? { min: 60, max: 120 };
  const swayR = opts.sway ?? { min: 8, max: 20 };
  const durR = opts.duration ?? { min: 900, max: 1700 };
  const depth = opts.depth ?? 120;
  const tints = Array.isArray(opts.tint) ? opts.tint : opts.tint !== undefined ? [opts.tint] : null;

  for (let i = 0; i < count; i++) {
    if (!acquireSlot(st, PETAL_SLOT, PETAL_MAX)) return;

    const px = x + Phaser.Math.Between(-spread.x, spread.x);
    const py = y + Phaser.Math.Between(-spread.y, spread.y);
    const duration = Phaser.Math.Between(durR.min, durR.max);
    const swayAmp = Phaser.Math.Between(swayR.min, swayR.max) * (Math.random() < 0.5 ? -1 : 1);

    const petal = scene.add.image(px, py, textureKey)
      .setDepth(depth)
      .setScale(Phaser.Math.FloatBetween(scaleR.min, scaleR.max))
      .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2))
      .setAlpha(Phaser.Math.FloatBetween(0.8, 1));

    if (tints) petal.setTint(tints[Phaser.Math.Between(0, tints.length - 1)]);

    st.sprites.add(petal);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      releaseSlot(st, PETAL_SLOT);
      st.sprites.delete(petal);
      scene.tweens.killTweensOf(petal);
      if (petal.scene) petal.destroy();
    };
    petal.once(Phaser.GameObjects.Events.DESTROY, () => {
      if (finished) return;
      finished = true;
      releaseSlot(st, PETAL_SLOT);
      st.sprites.delete(petal);
    });

    // 세로: 중력처럼 가속하며 내려가고, 지는 동안 옅어진다
    scene.tweens.add({
      targets: petal,
      y: py + Phaser.Math.Between(fallR.min, fallR.max),
      alpha: 0,
      scale: petal.scale * 0.7,
      angle: petal.angle + Phaser.Math.Between(-150, 150),
      duration,
      delay: i * 25,
      ease: 'Sine.easeIn',
      onComplete: finish,
    });

    // 가로: 좌우로 흔들리며 떨어진다
    scene.tweens.add({
      targets: petal,
      x: px + swayAmp,
      duration: Math.round(duration / 3),
      delay: i * 25,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 보험: 히트스톱으로 트윈이 늦어져도 실시간 기준으로 반드시 회수
    trackedTimeout(scene, duration + i * 25 + 700, finish);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// impact — 히트스톱 + 카메라 셰이크 + 스케일 펀치
// ─────────────────────────────────────────────────────────────────────────────

/** 스케일 펀치를 받을 수 있는 최소 인터페이스 */
export interface PunchTarget {
  scaleX: number;
  scaleY: number;
}

/** 펀치 중 월드 히트박스를 고정하기 위해 필요한 Arcade Body 의 최소 형태 */
interface ArcadeBodyLike {
  sourceWidth: number;
  sourceHeight: number;
  offset: { x: number; y: number };
  setSize(width: number, height: number, center?: boolean): unknown;
  setOffset(x: number, y: number): unknown;
}

/**
 * 대상이 Arcade Body 를 가지면, 펀치로 커진 스케일만큼 소스 크기·오프셋을 줄여
 * **월드 히트박스를 원래대로 고정**한다. 연출이 판정을 바꾸면 안 되기 때문이다.
 */
function makeBodyCompensator(target: PunchTarget, base: { x: number; y: number }): (() => void) | null {
  const body = (target as { body?: unknown }).body as ArcadeBodyLike | undefined;
  if (!body || typeof body.setSize !== 'function' || typeof body.sourceWidth !== 'number') return null;

  const worldW = body.sourceWidth * base.x;
  const worldH = body.sourceHeight * base.y;
  const worldOffX = body.offset.x * base.x;
  const worldOffY = body.offset.y * base.y;

  return () => {
    const sx = target.scaleX || base.x;
    const sy = target.scaleY || base.y;
    body.setSize(worldW / sx, worldH / sy, false);
    body.setOffset(worldOffX / sx, worldOffY / sy);
  };
}

export interface ImpactOptions {
  /** 히트스톱 지속 시간(ms). 0/미지정이면 생략. 안전을 위해 200ms 로 제한 */
  hitstop?: number;
  /** 카메라 셰이크. intensity 는 Phaser 기준 화면 비율(0.005 ≈ 약한 흔들림) */
  shake?: { duration?: number; intensity?: number };
  /** 대상 스케일 펀치 */
  punch?: { target: PunchTarget; amount?: number; duration?: number };
}

const HITSTOP_MAX_MS = 200;

/** 저장해둔 타임스케일을 즉시 원복 */
function releaseHitstop(scene: Phaser.Scene): void {
  const st = SCENE_STATE.get(scene);
  if (!st) return;
  if (st.hitstopHandle !== null) {
    window.clearTimeout(st.hitstopHandle);
    st.hitstopHandle = null;
  }
  if (!st.saved) return;

  if (isLive(scene)) {
    scene.time.timeScale = st.saved.time;
    scene.tweens.timeScale = st.saved.tweens;
    scene.anims.globalTimeScale = st.saved.anims;
    if (scene.physics && scene.physics.world) scene.physics.world.timeScale = st.saved.physics;
  }
  st.saved = null;
}

/**
 * 히트스톱 — 시간 흐름을 아주 짧게 멈춰 타격감을 만든다.
 *
 * `Phaser.Time.Clock.now` 는 timeScale 의 영향을 받지 않으므로
 * GameScene 의 rAF 비율 기반 안티치트에는 영향이 없다. 다만 복구는 타임스케일 밖에서
 * 일어나야 하므로 씬 타이머가 아닌 `window.setTimeout` 을 쓴다.
 */
function applyHitstop(scene: Phaser.Scene, ms: number): void {
  const st = getState(scene);
  const duration = Phaser.Math.Clamp(ms, 0, HITSTOP_MAX_MS);
  if (duration <= 0) return;

  // 이미 히트스톱 중이면 원본 스케일은 유지한 채 시간만 연장
  if (!st.saved) {
    st.saved = {
      time: scene.time.timeScale,
      tweens: scene.tweens.timeScale,
      anims: scene.anims.globalTimeScale,
      physics: scene.physics?.world ? scene.physics.world.timeScale : 1,
    };
  }
  if (st.hitstopHandle !== null) window.clearTimeout(st.hitstopHandle);

  scene.time.timeScale = 0;
  scene.tweens.timeScale = 0;
  scene.anims.globalTimeScale = 0;
  // Arcade 는 timeScale 이 클수록 느려진다 (msPerFrame = frameTime * timeScale)
  if (scene.physics && scene.physics.world) scene.physics.world.timeScale = 1e6;

  st.hitstopHandle = window.setTimeout(() => {
    const cur = SCENE_STATE.get(scene);
    if (cur) cur.hitstopHandle = null;
    releaseHitstop(scene);
  }, duration);
}

/** 대상 스케일을 튕겼다가 원래 값으로 되돌린다 */
function applyPunch(
  scene: Phaser.Scene,
  target: PunchTarget,
  amount: number,
  duration: number,
): void {
  // 연속 호출로 스케일이 누적되지 않도록 최초 스케일을 기억한다
  let base = BASE_SCALE.get(target);
  if (!base) {
    base = { x: target.scaleX, y: target.scaleY };
    BASE_SCALE.set(target, base);
  }
  PUNCH_TWEEN.get(target)?.remove();
  PUNCH_TWEEN.delete(target);

  const compensate = makeBodyCompensator(target, base);

  target.scaleX = base.x * amount;
  target.scaleY = base.y * amount;
  compensate?.();

  const tween = scene.tweens.add({
    targets: target,
    scaleX: base.x,
    scaleY: base.y,
    duration,
    ease: 'Back.easeOut',
    onUpdate: compensate ?? undefined,
    onComplete: () => {
      target.scaleX = base.x;
      target.scaleY = base.y;
      compensate?.();
      PUNCH_TWEEN.delete(target);
    },
  });
  PUNCH_TWEEN.set(target, tween);
}

/**
 * 히트스톱 · 카메라 셰이크 · 스케일 펀치를 한 번에 거는 임팩트 유틸.
 * 필요한 항목만 넘기면 된다.
 */
export function impact(scene: Phaser.Scene, opts: ImpactOptions): void {
  if (!isLive(scene)) return;

  if (opts.shake) {
    scene.cameras.main?.shake(opts.shake.duration ?? 90, opts.shake.intensity ?? 0.004, true);
  }
  if (opts.punch) {
    applyPunch(scene, opts.punch.target, opts.punch.amount ?? 1.16, opts.punch.duration ?? 220);
  }
  if (opts.hitstop) {
    applyHitstop(scene, opts.hitstop);
  }
}
