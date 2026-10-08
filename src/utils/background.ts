import Phaser from 'phaser';

/**
 * 전체 화면 배경 — 모든 씬이 이 헬퍼 하나로 깐다 (기본 배경·배경화면 공통).
 *
 * 비율 유지 cover, **그림 아래를 화면 아래에 붙인다.** 화면이 그림보다 좁으면 좌우가 잘리고,
 * 넓으면 위가 잘린다. 배경 그림은 2:3 이고 플레이어 발밑(화면 아래에서 40px)에 땅이 오게
 * 그려져 있어서, 아래를 맞춰야 어느 화면비에서도 플레이어가 땅 위에 선다.
 */
export function addBackground(
  scene: Phaser.Scene,
  key: string,
  W: number = scene.scale.width,
  H: number = scene.scale.height,
): Phaser.GameObjects.Image {
  return coverBackground(scene.add.image(0, 0, key), W, H);
}

/** 이미 있는 이미지에 배경 배치를 적용한다 (텍스처를 바꿔 끼우는 씬용) */
export function coverBackground(
  img: Phaser.GameObjects.Image,
  W: number,
  H: number,
): Phaser.GameObjects.Image {
  const s = Math.max(W / img.frame.realWidth, H / img.frame.realHeight);
  return img.setOrigin(0.5, 1).setPosition(W / 2, H).setScale(s);
}

// ── 배경별 땅 재질 팔레트 ─────────────────────────────────────────────
// 착지 잔해(테드 체스 말의 밑동 더미·균열)와 착지 연기를 배경 땅에 맞춰 굽는다.
// 배경 텍스처 키(bgKey) 하나에 한 벌. 없는 키는 DEFAULT_GROUND_FX(지금 흙색)로 떨어진다.

/** 땅 재질 — 잔해 모양이 갈린다 */
export type GroundMaterial = 'soil' | 'snow' | 'concrete' | 'stone';

export interface GroundFx {
  /**
   * soil = 흙더미 + 균열 · snow = 둥근 눈 더미 + 눈 튐(균열 없음)
   * concrete = 각진 파편 + 금 간 균열 · stone = 돌 조각 + 균열
   */
  material: GroundMaterial;
  /** 더미 4톤 (0xRRGGBB) — 외곽선 · 그늘 · 바탕 · 윗면 빛. 하드 엣지라 반투명 없이 이 넷만 쓴다 */
  outline: number;
  dark: number;
  base: number;
  light: number;
  /** 균열 선 · 균열 위 가장자리 턱 (snow 는 눈 튐 그늘 · 빛으로 쓴다) */
  crack: number;
  crackEdge: number;
  /** 착지 연기 색 (smoke 프리셋 tint) */
  smoke: number;
}

/** 옛 흙색 — 팔레트가 없는 배경(gacha_background 등)은 이걸 쓴다 */
export const DEFAULT_GROUND_FX: GroundFx = {
  material: 'soil',
  outline: 0x462a22,
  dark: 0x6e4436,
  base: 0x96604c,
  light: 0xba7c60,
  crack: 0x523228,
  crackEdge: 0xc4886a,
  smoke: 0xffffff,
};

/** builder ground_fx.json 한 항목의 더미 4톤 */
interface Debris { light: number; mid: number; dark: number; outline: number }

/** ground_fx.json 항목 → GroundFx. 균열은 더미 그늘·외곽선에서 파생한다 (선 = outline, 턱 = dark) */
function fromDebris(material: GroundMaterial, d: Debris, smoke: number): GroundFx {
  return {
    material, outline: d.outline, dark: d.dark, base: d.mid, light: d.light,
    crack: d.outline, crackEdge: d.dark, smoke,
  };
}

/**
 * bgKey → 땅 팔레트. 값은 builder 의 ~/ddong-fx-work/backgrounds/ground_fx.json (v3 배경 9장) 을 옮긴 것.
 * gacha_background 는 바닥이 없어 넣지 않는다 (DEFAULT 로 떨어진다)
 */
export const GROUND_FX: Readonly<Record<string, GroundFx>> = {
  background:       fromDebris('soil',     { light: 0xeb9363, mid: 0xbd724a, dark: 0x885235, outline: 0x553321 }, 0xcf8f6c),
  background2:      fromDebris('concrete', { light: 0xefedec, mid: 0xc0bfbe, dark: 0x8a8a89, outline: 0x565656 }, 0xd2d1d0),
  background3:      fromDebris('stone',    { light: 0xc49997, mid: 0xb79296, dark: 0x77667d, outline: 0x30364d }, 0xbf9fa0),
  xmas_background:  fromDebris('snow',     { light: 0xfffefe, mid: 0xfefefe, dark: 0xcfebfc, outline: 0x90a4b0 }, 0xf4f3f3),
  wp_hanok_bg:      fromDebris('soil',     { light: 0xfdc171, mid: 0xf4af67, dark: 0xda7636, outline: 0x292829 }, 0xeeba7e),
  // 호수 C (v4) — 잔해는 흙길 위 풀 턱 색 (대표 피드백: 흙색이면 흙길에 묻힌다). lake_C_480x720 의 y 566~600 풀 픽셀에서
  // 밝기 백분위로 뽑았다: light 85~100 · mid 45~60 · dark 15~30. outline 은 가장 어두운 풀(#0C5642)을 62% 로 더 눌러 흙 위에서 또렷하게
  wp_lake_bg:       fromDebris('soil',     { light: 0xd0e72f, mid: 0x66aa3e, dark: 0x1c794e, outline: 0x073528 }, 0xa6cd8f),
  wp_maehwa_bg:     fromDebris('snow',     { light: 0xffffff, mid: 0xbab5e5, dark: 0x908cb1, outline: 0x5a586f }, 0xd5d3e8),   // 설중매 C2 (v5) — 눈 덮인 땅
  wp_gold_mine_bg:  fromDebris('soil',     { light: 0xed9b57, mid: 0xb26f44, dark: 0x4c3b33, outline: 0x1a1413 }, 0xcb9065),
  wp_fantasy_bg:    fromDebris('stone',    { light: 0xdca896, mid: 0xb094a0, dark: 0x837997, outline: 0x3f425e }, 0xc4a5a4),
};

export function getGroundFx(bgKey: string): GroundFx {
  return GROUND_FX[bgKey] ?? DEFAULT_GROUND_FX;
}
