import { type Difficulty } from '../types/GameMode';
import { getCurrentUserId } from './auth';
import { supabase } from './supabase';

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  score: number;
  rank: number;
  characterType?: string;
}

export interface SubmitScoreResponse {
  success: boolean;
  isNewRecord: boolean;
  previousScore: number | null;
  newScore: number;
  rank: number | null;
  message?: string;
}

export interface LeaderboardResponse {
  success: boolean;
  difficulty: string;
  leaderboard: LeaderboardEntry[];
  currentUserRank: {
    rank: number;
    score: number;
  } | null;
  totalEntries: number;
}

/**
 * 사용자 ID 조회 (Supabase Auth 기반)
 */
export async function getUserId(): Promise<string> {
  return getCurrentUserId();
}

/**
 * 사용자 이니셜 조회
 */
export function getUserInitials(): string | null {
  return localStorage.getItem('userInitials');
}

/**
 * 사용자 이니셜 저장
 * @param initials 3자리 영어 대문자 (예: "ABC")
 */
export function setUserInitials(initials: string): boolean {
  const validation = /^[A-Z]{3}$/;
  if (!validation.test(initials)) {
    return false;
  }

  localStorage.setItem('userInitials', initials);
  return true;
}

/**
 * 이니셜이 설정되어 있는지 확인
 */
export function hasUserInitials(): boolean {
  const initials = getUserInitials();
  return initials !== null && /^[A-Z]{3}$/.test(initials);
}

export interface ScoreVerificationData {
  gameStartTime: number;
  gameEndTime: number;
  goldCollected: number;
  diamondCollected: number;
  topazCollected: number;
  rainbowCollected: number;
}

/**
 * 점수 제출
 */
export async function submitScore(
  score: number,
  difficulty: Difficulty,
  initials: string,
  verificationData: ScoreVerificationData,
  characterType: string = 'chibi'
): Promise<SubmitScoreResponse> {
  if (!/^[A-Z]{3}$/.test(initials)) {
    throw new Error('Invalid initials: must be 3 uppercase letters');
  }

  const { data, error } = await supabase.functions.invoke('leaderboard-submit', {
    body: {
      score,
      difficulty,
      userName: initials,
      verification: verificationData,
      characterType,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit score');
  }

  return data as SubmitScoreResponse;
}

/**
 * 리더보드 조회
 */
export async function getLeaderboard(
  difficulty: Difficulty,
  limit: number = 100
): Promise<LeaderboardResponse> {
  const { data, error } = await supabase.functions.invoke('leaderboard-top', {
    body: { difficulty, limit },
  });

  if (error) {
    throw new Error(error.message || 'Failed to fetch leaderboard');
  }

  return data as LeaderboardResponse;
}
