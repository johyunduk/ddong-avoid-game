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
// 등급 없음: 뽑기 가능한 종은 모두 같은 확률 — 슬롯당 GACHA_WP_DROP_CHANCE(3.5%) ÷ 종 수 (12종이면 종당 약 0.29%)
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
    description: '물레방아 도는 섬 마을과 빨간 돛배가 떠 있는 맑은 호수',
  },
  {
    id: 'wp_maehwa',
    name: '매화',
    thumbKey: 'wp_maehwa_thumb',
    thumbPath: 'assets/wallpapers/maehwa_thumb.webp',
    bgKey: 'wp_maehwa_bg',
    bgPath: 'assets/wallpapers/maehwa_bg.webp',
    description: '눈 덮인 한옥 마을, 해 질 녘에 핀 붉은 매화',
  },
  {
    id: 'wp_gold_mine',
    name: '황금 광산',
    thumbKey: 'wp_gold_mine_thumb',
    thumbPath: 'assets/wallpapers/gold_mine_thumb.webp',
    bgKey: 'wp_gold_mine_bg',
    bgPath: 'assets/wallpapers/gold_mine_bg.webp',
    description: '반짝이는 금맥이 흐르는 지하 광산',
  },
  {
    id: 'wp_fantasy',
    name: '판타지 왕국',
    thumbKey: 'wp_fantasy_thumb',
    thumbPath: 'assets/wallpapers/fantasy_thumb.webp',
    bgKey: 'wp_fantasy_bg',
    bgPath: 'assets/wallpapers/fantasy_bg.webp',
    description: '깃발 휘날리는 성채 앞 기사들의 진영',
  },
  // ── SR 캐릭터 배경화면 일곱 장 (2026-10-09) — 원본: ddong-fx-work/backgrounds/new/_bundle/bundle.json ──
  {
    id: 'wp_ted',
    name: '체스 광장',
    thumbKey: 'wp_ted_thumb',
    thumbPath: 'assets/wallpapers/ted_thumb.webp',
    bgKey: 'wp_ted_bg',
    bgPath: 'assets/wallpapers/ted_bg.webp',
    description: '새벽 안개 속, 거대한 말들이 잠든 흑백의 광장',
  },
  {
    id: 'wp_heidi',
    name: '마을 큰길',
    thumbKey: 'wp_heidi_thumb',
    thumbPath: 'assets/wallpapers/heidi_thumb.webp',
    bgKey: 'wp_heidi_bg',
    bgPath: 'assets/wallpapers/heidi_bg.webp',
    description: '등불이 걸린 큰길 끝, 발바닥 문이 기다리는 봄 아침',
  },
  {
    id: 'wp_red',
    name: '고철 차고',
    thumbKey: 'wp_red_thumb',
    thumbPath: 'assets/wallpapers/red_thumb.webp',
    bgKey: 'wp_red_bg',
    bgPath: 'assets/wallpapers/red_bg.webp',
    description: '비 갠 오후, 레드가 로봇을 고치는 고철 정비장',
  },
  {
    id: 'wp_k',
    name: '무대 위에서',
    thumbKey: 'wp_k_thumb',
    thumbPath: 'assets/wallpapers/k_thumb.webp',
    bgKey: 'wp_k_bg',
    bgPath: 'assets/wallpapers/k_bg.webp',
    description: '네 기둥 사이 흰 무대 위, 흐린 하늘 아래 결전 직전',
  },
  {
    id: 'wp_hacker',
    name: '겨울 아침 옥탑',
    thumbKey: 'wp_hacker_thumb',
    thumbPath: 'assets/wallpapers/hacker_thumb.webp',
    bgKey: 'wp_hacker_bg',
    bgPath: 'assets/wallpapers/hacker_bg.webp',
    description: '서리 내린 맑은 겨울 아침, 불 꺼진 서버 방',
  },
  {
    id: 'wp_glitch',
    name: '복숭아빛 오락실',
    thumbKey: 'wp_glitch_thumb',
    thumbPath: 'assets/wallpapers/glitch_thumb.webp',
    bgKey: 'wp_glitch_bg',
    bgPath: 'assets/wallpapers/glitch_bg.webp',
    description: '해 지기 직전, 복숭아빛 하늘에 네온이 켜지는 거리',
  },
  {
    id: 'wp_noise',
    name: '안개 숲 오솔길',
    thumbKey: 'wp_noise_thumb',
    thumbPath: 'assets/wallpapers/noise_thumb.webp',
    bgKey: 'wp_noise_bg',
    bgPath: 'assets/wallpapers/noise_bg.webp',
    description: '연보라 안개 속, 빈 마을로 이어지는 조용한 숲길',
  },
];

/** 가챠로 획득 가능한 배경화면 ID — WALLPAPERS에서 자동 파생, 직접 수정 불필요 */
export const GACHA_WP_IDS: string[] = WALLPAPERS
  .filter(w => !(DEFAULT_WP_IDS as readonly string[]).includes(w.id))
  .map(w => w.id);

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
