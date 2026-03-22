import { supabase } from './supabase';
import { ensureLoggedIn, getCurrentUserId } from './auth';

export interface MatchResult {
  status: 'waiting' | 'matched';
  roomCode: string | null;
  isHost: boolean | null;
  opponentId: string | null;
}

type QueueRow = {
  status: string;
  room_code: string | null;
  is_host: boolean | null;
  opponent_id: string | null;
};

function rowToMatchResult(row: QueueRow): MatchResult {
  return {
    status: row.status as 'waiting' | 'matched',
    roomCode: row.room_code,
    isHost: row.is_host,
    opponentId: row.opponent_id,
  };
}

/** 인증된 userId 획득 (세션 없으면 익명 로그인 후 반환) */
export async function getAuthUserId(): Promise<string> {
  await ensureLoggedIn();
  return getCurrentUserId();
}

/** 랭크 매치 참가 또는 즉시 매칭 시도 (원자적 RPC) */
export async function findOrCreateMatch(userId: string): Promise<MatchResult> {
  const { data, error } = await supabase.rpc('find_or_create_match', { p_user_id: userId });
  if (error) throw error;
  return rowToMatchResult((data as QueueRow[])[0]);
}

/** 매칭 상태 폴링 — 본인 row 조회 */
export async function pollMatchStatus(userId: string): Promise<MatchResult | null> {
  const { data } = await supabase
    .from('matchmaking_queue')
    .select('status, room_code, is_host, opponent_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return rowToMatchResult(data as QueueRow);
}

/** 매치메이킹 취소 — 대기열에서 본인 제거 */
export async function cancelMatchmaking(userId: string): Promise<void> {
  await supabase.from('matchmaking_queue').delete().eq('user_id', userId);
}
