export interface WallpaperSynergy {
  label: string;        // UI 뱃지 텍스트
  speedBonus: number;   // 이동 속도 추가 (px/s)
  collectBonus: number; // 특수 똥 수집마다 추가 점수
  rainbowFever?: boolean; // true → 특정 피버마다 레인보우 피버로 교체
  clearPoops?: boolean;   // true → 일정 점수 간격마다 화면의 모든 똥 제거
}

// 모든 시너지의 고정 보너스 값
const SYNERGY_BONUSES = { speedBonus: 5, collectBonus: 2 } as const;

// 'wallpaperId:characterId' → WallpaperSynergy
export const SYNERGY_MAP: Record<string, WallpaperSynergy> = {
  'wp_gold_mine:miner': { label: '황금 광산 × 광부', ...SYNERGY_BONUSES, rainbowFever: true },
  'wp_hanok:maehwa':    { label: '한옥 × 매화',      ...SYNERGY_BONUSES },
  'wp_lake:archieve':   { label: '호수 × 아카이브',  ...SYNERGY_BONUSES },
  'wp_maehwa:maehwa':   { label: '매화 × 매화',      ...SYNERGY_BONUSES, clearPoops: true },
  'wp_fantasy:knight':  { label: '판타지 왕국 × 나이트', ...SYNERGY_BONUSES },
  // SR 캐릭터 배경화면 (2026-10-09) — 대표 결정: 기본 시너지만, 특별 효과 없음
  'wp_ted:ted':         { label: '체스 광장 × 테드',       ...SYNERGY_BONUSES },
  'wp_heidi:heidi':     { label: '마을 큰길 × 하이디',     ...SYNERGY_BONUSES },
  'wp_red:red':         { label: '고철 차고 × 레드',       ...SYNERGY_BONUSES },
  'wp_k:k':             { label: '무대 위에서 × K',        ...SYNERGY_BONUSES },
  'wp_hacker:hacker':   { label: '겨울 아침 옥탑 × 루트',  ...SYNERGY_BONUSES },
  'wp_glitch:glitch':   { label: '복숭아빛 오락실 × 글리치', ...SYNERGY_BONUSES },
  'wp_noise:noise':     { label: '안개 숲 오솔길 × 노이즈', ...SYNERGY_BONUSES },
  // 추후 새 배경화면 추가 시 여기에만 항목 추가
};

// 치비: 배경화면 종류 무관, 배경화면이 선택된 경우 항상 발동
const CHIBI_SYNERGY: WallpaperSynergy = {
  label: '치비의 적응력',
  ...SYNERGY_BONUSES,
};

export function getSynergy(wpId: string | null, characterId: string): WallpaperSynergy | null {
  if (!wpId) return null;
  if (characterId === 'chibi') return CHIBI_SYNERGY;
  return SYNERGY_MAP[`${wpId}:${characterId}`] ?? null;
}
