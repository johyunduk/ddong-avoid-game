import { type Difficulty } from '../types/GameMode';

const HIGH_SCORE_PREFIX = 'ddong_game_highscore_';

/**
 * 난이도별 최고 점수를 가져옵니다
 */
export function getHighScore(difficulty: Difficulty): number {
  const key = `${HIGH_SCORE_PREFIX}${difficulty}`;
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : 0;
}

/**
 * 난이도별 최고 점수를 저장합니다
 */
export function setHighScore(difficulty: Difficulty, score: number): void {
  const key = `${HIGH_SCORE_PREFIX}${difficulty}`;
  localStorage.setItem(key, score.toString());
}

/**
 * 현재 점수가 최고 점수인지 확인하고, 필요시 업데이트합니다
 * @returns 최고 점수 갱신 여부
 */
export function updateHighScore(difficulty: Difficulty, currentScore: number): boolean {
  const highScore = getHighScore(difficulty);
  if (currentScore > highScore) {
    setHighScore(difficulty, currentScore);
    return true;
  }
  return false;
}
