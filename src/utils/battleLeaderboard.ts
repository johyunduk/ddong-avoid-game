import { supabase } from './supabase';
import { type BattleResult } from '../types/BattleTypes';

export interface BattleRecordEntry {
  rank: number;
  userId: string;
  userName: string;
  wins: number;
  losses: number;
  disconnects: number;
  totalWins: number;
  winRate: number;
  ratingPoints: number;
  tierName: string;
  tierIcon: string;
}

export interface SubmitBattleResultResponse {
  success: boolean;
  previousRp: number;   // 클램핑 전 이전 RP (티어 변화 감지에 사용)
  ratingPoints: number;
  pointDelta: number;
  wins: number;
  losses: number;
  disconnects: number;
  friendlyWins: number;
  friendlyLosses: number;
  friendlyDisconnects: number;
  winRate: number;
  rank: number;
  tierName: string;
  tierIcon: string;
}

export interface BattleLeaderboardResponse {
  success: boolean;
  leaderboard: BattleRecordEntry[];
  currentUserRank: {
    rank: number;
    totalWins: number;
    winRate: number;
    ratingPoints: number;
    friendlyWins: number;
    friendlyLosses: number;
    friendlyDisconnects: number;
  } | null;
}

/** 세션 취득 공통 헬퍼 — 없으면 익명 로그인 후 반환 */
async function getOrCreateSession() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data: authData } = await supabase.auth.signInAnonymously();
    session = authData.session;
  }
  return session;
}

/**
 * 대전 결과를 서버에 제출
 * opponentId: 상대 유저 UUID (RP 차이 기반 변동 계산에 사용)
 */
export async function submitBattleResult(
  result: BattleResult,
  opponentId?: string,
  isRanked: boolean = true,
): Promise<SubmitBattleResultResponse> {
  const session = await getOrCreateSession();

  const { data, error } = await supabase.functions.invoke('battle-result-submit', {
    body: { result, opponentId, isRanked },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit battle result');
  }

  return data as SubmitBattleResultResponse;
}

/**
 * 배틀 리더보드 상위 N명 조회
 */
export async function getBattleLeaderboard(limit: number = 20): Promise<BattleLeaderboardResponse> {
  const session = await getOrCreateSession();

  const { data, error } = await supabase.functions.invoke('battle-leaderboard-top', {
    body: { limit },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });

  if (error) {
    throw new Error(error.message || 'Failed to fetch battle leaderboard');
  }

  return data as BattleLeaderboardResponse;
}
