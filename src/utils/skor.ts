import { supabase } from './supabase';

export interface SkorSubmitData {
  score: number;
  goldCollected: number;
  diamondCollected: number;
  topazCollected: number;
  rainbowCollected: number;
}

export interface QuestProgressCache {
  gold_total: number;
  diamond_total: number;
  topaz_total: number;
  rainbow_total: number;
}

export interface SkorSubmitResponse {
  success: boolean;
  skorEarned: number;
  bracketCap: number;
  questRewards: { quest: string; reward: number }[];
  totalSkorAdded: number;
  remainingBalance: number;
  weeklyCapRemaining: number;
  questProgressAfter?: QuestProgressCache;
}

const QUEST_PROGRESS_CACHE_KEY = 'questProgressCache';

const QUESTS = [
  { key: 'gold',    interval: 50, reward: 10 },
  { key: 'diamond', interval: 25, reward: 15 },
  { key: 'topaz',   interval: 12, reward: 20 },
  { key: 'rainbow', interval: 8,  reward: 35 },
] as const;

export function getQuestProgressCache(): QuestProgressCache | null {
  const raw = localStorage.getItem(QUEST_PROGRESS_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as QuestProgressCache;
  } catch {
    return null;
  }
}

export function setQuestProgressCache(progress: QuestProgressCache): void {
  localStorage.setItem(QUEST_PROGRESS_CACHE_KEY, JSON.stringify(progress));
}

export const QUEST_LABELS: Record<string, string> = {
  gold: '금똥', diamond: '다이아', topaz: '토파즈', rainbow: '무지개',
};

export function formatQuestRewardText(quests: { quest: string; reward: number }[]): string {
  return quests.map(r => `${QUEST_LABELS[r.quest] ?? r.quest} 퀘스트 +${r.reward}`).join(' / ');
}

/** 캐시된 누적값 + 이번 게임 수집량으로 예상 퀘스트 보상 계산 */
export function estimateQuestRewards(
  cached: QuestProgressCache,
  session: { goldCollected: number; diamondCollected: number; topazCollected: number; rainbowCollected: number },
): { quest: string; reward: number }[] {
  const results: { quest: string; reward: number }[] = [];
  const totals: Record<string, number> = {
    gold:    cached.gold_total,
    diamond: cached.diamond_total,
    topaz:   cached.topaz_total,
    rainbow: cached.rainbow_total,
  };
  const additions: Record<string, number> = {
    gold:    session.goldCollected,
    diamond: session.diamondCollected,
    topaz:   session.topazCollected,
    rainbow: session.rainbowCollected,
  };

  for (const q of QUESTS) {
    const prev = totals[q.key] ?? 0;
    const next = prev + (additions[q.key] ?? 0);
    const achieved = Math.floor(next / q.interval) - Math.floor(prev / q.interval);
    if (achieved > 0) results.push({ quest: q.key, reward: achieved * q.reward });
  }
  return results;
}

/**
 * 게임오버 시 SKOR 정제 수익을 서버에 제출
 */
export async function submitSkor(data: SkorSubmitData): Promise<SkorSubmitResponse> {
  // getSession()은 만료된 access token을 refresh token으로 자동 갱신함
  let { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // 세션이 아예 없으면 익명 로그인 재시도
    const { data: authData } = await supabase.auth.signInAnonymously();
    session = authData.session;
  }

  // access_token을 헤더에 명시적으로 주입 (SDK 자동 주입이 누락되는 엣지케이스 방어)
  const { data: result, error } = await supabase.functions.invoke('skor-submit', {
    body: data,
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit skor');
  }

  return result as SkorSubmitResponse;
}

const SKOR_BALANCE_CACHE_KEY = 'skorBalanceCache';

/** 마지막으로 알고 있는 SKOR 잔액을 로컬에서 즉시 반환 (없으면 null) */
export function getCachedSkorBalance(): number | null {
  const raw = localStorage.getItem(SKOR_BALANCE_CACHE_KEY);
  return raw !== null ? Number(raw) : null;
}

/** SKOR 잔액을 로컬에 캐싱 */
export function cacheSkorBalance(balance: number): void {
  localStorage.setItem(SKOR_BALANCE_CACHE_KEY, String(Math.floor(balance)));
}

/**
 * 현재 SKOR 잔액 조회 (DB) 후 캐시 갱신
 * 행이 없는 유저(신규)는 서버가 웰컴 보너스로 행을 만든 뒤 그 잔액을 돌려준다 — get_skor_balance RPC
 * (보너스 값은 supabase/migrations/20261011000001_skor_welcome_server.sql 한 곳. 클라이언트는 user_skor 에 쓰지 않는다)
 */
export async function getSkorBalance(): Promise<number> {
  // 세션 확보 (없으면 익명 로그인) — submitSkor와 동일한 패턴
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await supabase.auth.signInAnonymously();
  }

  const { data, error } = await supabase.rpc('get_skor_balance');
  if (error) {
    throw new Error(error.message || 'Failed to load skor balance');
  }

  const balance = Number(data);
  cacheSkorBalance(balance);
  return balance;
}
