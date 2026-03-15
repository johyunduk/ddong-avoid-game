export interface BackgroundDef {
  id: string;
  name: string;
  thumbKey: string;   // 카드 UI 썸네일용 Phaser 텍스처 키
  thumbPath: string;  // public/ 기준 경로
  bgKey: string;      // 인게임 배경용 Phaser 텍스처 키
  bgPath: string;     // public/ 기준 경로
  description: string;
}

/** 배경화면 공통 accent color — 등급 없이 단일 색상 사용 */
export const WP_ACCENT_HEX = '#cc88ff';
export const WP_ACCENT_INT = 0xcc88ff;

/** 처음부터 무료로 제공되는 기본 배경화면 ID 목록 */
export const DEFAULT_WP_IDS = ['wp_bg_easy', 'wp_bg_normal', 'wp_bg_hard'] as const;

// 배경화면 목록 — 실제 에셋은 public/assets/wallpapers/ 폴더에 추가 필요
// 등급 없음: 모두 동일 확률 (~0.35%/종, 캐릭터 UR 수준)
export const WALLPAPERS: BackgroundDef[] = [
  // ── 기본 제공 배경 (처음부터 보유, 가챠 불필요) ───────────────────────────
  {
    id: 'wp_bg_easy',
    name: '배경 I',
    thumbKey: 'background',
    thumbPath: 'assets/backgrounds/background.webp',
    bgKey: 'background',
    bgPath: 'assets/backgrounds/background.webp',
    description: 'EASY · 기본 배경',
  },
  {
    id: 'wp_bg_normal',
    name: '배경 II',
    thumbKey: 'background3',
    thumbPath: 'assets/backgrounds/background3.webp',
    bgKey: 'background3',
    bgPath: 'assets/backgrounds/background3.webp',
    description: 'NORMAL 기본 배경',
  },
  {
    id: 'wp_bg_hard',
    name: '배경 III',
    thumbKey: 'background2',
    thumbPath: 'assets/backgrounds/background2.webp',
    bgKey: 'background2',
    bgPath: 'assets/backgrounds/background2.webp',
    description: 'HARD · EXTREME 기본 배경',
  },
  {
    id: 'wp_neon_city',
    name: '네온 도시',
    thumbKey: 'wp_neon_city_thumb',
    thumbPath: 'assets/wallpapers/neon_city_thumb.webp',
    bgKey: 'wp_neon_city_bg',
    bgPath: 'assets/wallpapers/neon_city.webp',
    description: '빛나는 네온이 가득한 사이버 도시의 밤',
  },
  {
    id: 'wp_pixel_forest',
    name: '픽셀 숲',
    thumbKey: 'wp_pixel_forest_thumb',
    thumbPath: 'assets/wallpapers/pixel_forest_thumb.webp',
    bgKey: 'wp_pixel_forest_bg',
    bgPath: 'assets/wallpapers/pixel_forest.webp',
    description: '픽셀로 이루어진 초록빛 숲의 고요한 오후',
  },
  {
    id: 'wp_static_noise',
    name: '정적 노이즈',
    thumbKey: 'wp_static_noise_thumb',
    thumbPath: 'assets/wallpapers/static_noise_thumb.webp',
    bgKey: 'wp_static_noise_bg',
    bgPath: 'assets/wallpapers/static_noise.webp',
    description: '오래된 CRT 모니터의 잡음 속 패턴',
  },
  {
    id: 'wp_cyber_grid',
    name: '사이버 그리드',
    thumbKey: 'wp_cyber_grid_thumb',
    thumbPath: 'assets/wallpapers/cyber_grid_thumb.webp',
    bgKey: 'wp_cyber_grid_bg',
    bgPath: 'assets/wallpapers/cyber_grid.webp',
    description: '무한히 펼쳐지는 사이버 공간의 격자망',
  },
  {
    id: 'wp_aurora',
    name: '오로라',
    thumbKey: 'wp_aurora_thumb',
    thumbPath: 'assets/wallpapers/aurora_thumb.webp',
    bgKey: 'wp_aurora_bg',
    bgPath: 'assets/wallpapers/aurora.webp',
    description: '밤하늘을 수놓는 신비로운 오로라 광채',
  },
  {
    id: 'wp_cosmos',
    name: '우주 공간',
    thumbKey: 'wp_cosmos_thumb',
    thumbPath: 'assets/wallpapers/cosmos_thumb.webp',
    bgKey: 'wp_cosmos_bg',
    bgPath: 'assets/wallpapers/cosmos.webp',
    description: '성운과 별빛이 흩뿌려진 광활한 우주',
  },
  {
    id: 'wp_matrix',
    name: '매트릭스',
    thumbKey: 'wp_matrix_thumb',
    thumbPath: 'assets/wallpapers/matrix_thumb.webp',
    bgKey: 'wp_matrix_bg',
    bgPath: 'assets/wallpapers/matrix.webp',
    description: '끝없이 흐르는 초록 코드의 폭포 — 세계의 이면',
  },
  {
    id: 'wp_hanok',
    name: '한옥',
    thumbKey: 'wp_hanok_thumb',
    thumbPath: 'assets/wallpapers/hanok_thumb.webp',
    bgKey: 'wp_hanok_bg',
    bgPath: 'assets/wallpapers/hanok_bg.webp',
    description: '처마 끝에 달빛이 내려앉은 고요한 한옥 마당',
  },
  {
    id: 'wp_lake',
    name: '호수',
    thumbKey: 'wp_lake_thumb',
    thumbPath: 'assets/wallpapers/lake_thumb.webp',
    bgKey: 'wp_lake_bg',
    bgPath: 'assets/wallpapers/lake_bg.webp',
    description: '잔물결 하나 없이 하늘을 담은 새벽 호수',
  },
  {
    id: 'wp_maehwa',
    name: '매화',
    thumbKey: 'wp_maehwa_thumb',
    thumbPath: 'assets/wallpapers/maehwa_thumb.webp',
    bgKey: 'wp_maehwa_bg',
    bgPath: 'assets/wallpapers/maehwa_bg.webp',
    description: '이른 봄 흰 매화가 눈처럼 흩날리는 언덕',
  },
];

// ── localStorage 서명 (djb2, character.ts 패턴과 동일) ──────────────────────

const OWNED_WP_KEY     = 'ownedWallpapers';
const OWNED_WP_SIG_KEY = 'ownedWallpapersSig';
const SELECTED_WP_KEY  = 'selectedWallpaper';
const _WP_SALT         = 'ddong-wp-\u0076\u0031';

function _signWpList(list: string[]): string {
  const str = [...list].sort().join(',') + _WP_SALT;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function _saveOwnedWp(list: string[]): void {
  localStorage.setItem(OWNED_WP_KEY, JSON.stringify(list));
  localStorage.setItem(OWNED_WP_SIG_KEY, _signWpList(list));
}

/** 보유 배경화면 목록 반환. 서명 불일치 시 변조로 판단하여 빈 배열로 초기화. */
export function getOwnedWallpapers(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_WP_KEY);
    const sig = localStorage.getItem(OWNED_WP_SIG_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];

    if (sig === null) {
      // 서명 미존재 → 기존 데이터 마이그레이션: 신뢰 후 서명 최초 발급
      _saveOwnedWp(list);
    } else if (sig !== _signWpList(list)) {
      // 서명 불일치 → 변조로 판단, 빈 배열로 초기화
      _saveOwnedWp([]);
      list.length = 0;
    }

    // 기본 배경은 항상 보유 (서명 저장 데이터에는 포함 안 됨, 읽기 시점에만 병합)
    for (const id of DEFAULT_WP_IDS) {
      if (!list.includes(id)) list.push(id);
    }
    return list;
  } catch (e) {
    console.error('[getOwnedWallpapers] JSON 파싱 실패:', e);
    return [...DEFAULT_WP_IDS];
  }
}

/** 서버 동기화 등 외부에서 목록 전체를 덮어쓸 때 사용 (서명 함께 갱신) */
export function setOwnedWallpapers(list: string[]): void {
  _saveOwnedWp(list);
}

/** 배경화면을 보유 목록에 추가 (가챠 완료 직후 호출) */
export function addOwnedWallpaper(id: string): void {
  const owned = getOwnedWallpapers();
  if (!owned.includes(id)) {
    owned.push(id);
    _saveOwnedWp(owned);
  }
}

/** 선택된 배경화면 ID 반환. 없으면 null (기본 배경 사용). */
export function getSelectedWallpaper(): string | null {
  return localStorage.getItem(SELECTED_WP_KEY);
}

/** 배경화면 선택 저장. null 전달 시 선택 해제. */
export function setSelectedWallpaper(id: string | null): void {
  if (id === null) {
    localStorage.removeItem(SELECTED_WP_KEY);
  } else {
    localStorage.setItem(SELECTED_WP_KEY, id);
  }
}

/**
 * 보유 목록과 교차 검증하여 안전한 배경화면 ID 반환.
 * 미보유 배경이 선택되어 있으면 null로 강제 초기화 (변조 방지).
 */
export function getSafeSelectedWallpaper(): string | null {
  const selected = getSelectedWallpaper();
  if (!selected) return null;
  const owned = getOwnedWallpapers();
  if (owned.includes(selected)) return selected;
  // 변조 감지 → null로 강제 초기화
  setSelectedWallpaper(null);
  return null;
}

/** 배경화면 정의 조회. 없으면 undefined. */
export function getWallpaperDef(id: string): BackgroundDef | undefined {
  return WALLPAPERS.find(w => w.id === id);
}
