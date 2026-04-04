import { type Difficulty } from '../types/GameMode';

const HIGH_SCORE_PREFIX = 'ddong_game_highscore_';
const HIGH_SCORE_SEASON_PREFIX = 'ddong_game_highscore_season_';

/** 서버 시즌 기준(UTC)과 일치하도록 UTC 연월 반환 */
export function getCurrentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 난이도별 최고 점수를 가져옵니다.
 * 저장된 시즌이 현재 달과 다르면 0을 반환합니다.
 */
export function getHighScore(difficulty: Difficulty): number {
  const seasonKey = `${HIGH_SCORE_SEASON_PREFIX}${difficulty}`;
  const storedSeason = localStorage.getItem(seasonKey);
  if (storedSeason !== getCurrentYearMonth()) {
    return 0;
  }
  const key = `${HIGH_SCORE_PREFIX}${difficulty}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : 0;
}

/**
 * 난이도별 최고 점수를 저장합니다
 */
export function setHighScore(difficulty: Difficulty, score: number, yearMonth: string = getCurrentYearMonth()): void {
  const key = `${HIGH_SCORE_PREFIX}${difficulty}`;
  const seasonKey = `${HIGH_SCORE_SEASON_PREFIX}${difficulty}`;
  localStorage.setItem(key, score.toString());
  localStorage.setItem(seasonKey, yearMonth);
}

/**
 * 현재 점수가 최고 점수인지 확인하고, 필요시 업데이트합니다
 * @returns 최고 점수 갱신 여부
 */
export function updateHighScore(difficulty: Difficulty, currentScore: number): boolean {
  const ym = getCurrentYearMonth();
  const stored = localStorage.getItem(`${HIGH_SCORE_SEASON_PREFIX}${difficulty}`);
  const highScore = stored === ym
    ? (parseInt(localStorage.getItem(`${HIGH_SCORE_PREFIX}${difficulty}`) ?? '0', 10) || 0)
    : 0;
  if (currentScore > highScore) {
    setHighScore(difficulty, currentScore, ym);
    return true;
  }
  return false;
}
