import { Difficulty } from '../types/GameMode';

/** 판 위 · 판 아래(테두리) · 진한 색(두께·글자 테) */
export type Tier = [string, string, string];

/**
 * 난이도별 판 색 — 난이도 선택 카드와 랭킹 탭이 같이 쓴다.
 * 옛 버튼 색(금 · 주황 · 빨강 · 회색)을 그라데이션으로 편 것
 */
export const DIFFICULTY_TIER: Record<Difficulty, Tier> = {
  [Difficulty.NORMAL]: ['#ffe9a0', '#ffc21a', '#7a4a00'],
  [Difficulty.HARD]: ['#ffc48a', '#ff7a00', '#6a2a00'],
  [Difficulty.EXTREME]: ['#ff9a7a', '#e8261a', '#4a0800'],
  [Difficulty.PHYSICAL]: ['#eef2f7', '#9aa6b5', '#2a3340'],
};
