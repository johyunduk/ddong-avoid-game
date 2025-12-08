/**
 * 크리스마스 시즌 체크 유틸리티
 * 12월 1일 ~ 1월 31일 사이인지 확인
 */

export function isChristmasSeason(): boolean {
  const now = new Date();
  const month = now.getMonth() + 1; // 0-based, so add 1

  // 12월 또는 1월이면 크리스마스 시즌
  return month === 12 || month === 1;
}

/**
 * 크리스마스 테마 똥 이미지 키 목록
 */
export const CHRISTMAS_POOP_KEYS = [
  'xmas_poop_ribbon',
  'xmas_poop_nose',
  'xmas_poop_santa',
  'xmas_poop_rudolf',
  'xmas_poop_beard'
] as const;

/**
 * 일반 똥 이미지 키 목록
 */
export const REGULAR_POOP_KEYS = [
  'poop',
  'poop_glasses',
  'poop_sunglass',
  'poop_sunglass2',
  'poop_smile'
] as const;
