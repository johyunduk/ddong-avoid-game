import { type Difficulty } from '../types/GameMode';
import { getCurrentUserId } from './auth';
import { supabase } from './supabase';
import { getCurrentYearMonth } from './localStorage';
import { setQuestProgressCache } from './skor';

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

export interface PrevSeasonReward {
  yearMonth: string;       // 'YYYY-MM' (직전 달)
  rank: number | null;     // null이면 해당 달 기록 없음
  skorAwarded: number;     // 0이면 100위 밖
  alreadyClaimed: boolean;
}

export interface LeaderboardResponse {
  success: boolean;
  difficulty: string;
  yearMonth: string;       // 현재 시즌 'YYYY-MM'
  season: number;          // 시즌 번호
  leaderboard: LeaderboardEntry[];
  currentUserRank: {
    rank: number;
    score: number;
  } | null;
  totalEntries: number;
  prevSeasonReward: PrevSeasonReward | null;
}

export interface ClaimRewardResponse {
  success: boolean;
  alreadyClaimed: boolean;
  rank: number | null;
  skorAwarded: number;
  newBalance?: number;
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
  collectBonusTotal?: number; // ability.onCollectSpecial + synergy.collectBonus 누계
  abilityBonusTotal?: number; // addAbilityBonus() + getTickScore 배율 초과분 누계 (레거시 불태우기, 아카이브 배율 등)
}

/**
 * 게임 세션 시작 — 서버가 start_time을 기록하여 점수 조작 방지
 */
export async function startGameSession(difficulty: Difficulty): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('game-start', {
      body: { difficulty },
    });
    if (error || !data?.sessionId) return null;
    if (data.questProgress) {
      setQuestProgressCache(data.questProgress);
    }
    return data.sessionId as string;
  } catch {
    return null;
  }
}

/**
 * 점수 제출
 */
export async function submitScore(
  score: number,
  difficulty: Difficulty,
  initials: string,
  verificationData: ScoreVerificationData,
  characterType: string = 'chibi',
  sessionId: string | null = null
): Promise<SubmitScoreResponse> {
  if (!/^[A-Z]{3}$/.test(initials)) {
    throw new Error('Invalid initials: must be 3 uppercase letters');
  }

  const { data, error } = await supabase.functions.invoke('leaderboard-submit', {
    body: {
      score,
      difficulty,
      userName: initials,
      sessionId,
      verification: verificationData,
      characterType,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to submit score');
  }

  return data as SubmitScoreResponse;
}

// 리더보드 메모리 캐시 (세션 내 30초 유지)
const _lbCache = new Map<string, { data: LeaderboardResponse; ts: number }>();
const _LB_TTL = 30_000;

/**
 * 리더보드 조회
 */
export async function getLeaderboard(
  difficulty: Difficulty,
  limit: number = 100,
  characterType?: string
): Promise<LeaderboardResponse> {
  const cacheKey = `${difficulty}:${limit}:${characterType ?? ''}`;
  const cached = _lbCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < _LB_TTL) {
    return cached.data;
  }

  const body: Record<string, unknown> = { difficulty, limit };
  if (characterType) body.characterType = characterType;

  const { data, error } = await supabase.functions.invoke('leaderboard-top', {
    body,
  });

  if (error) {
    throw new Error(error.message || 'Failed to fetch leaderboard');
  }

  _lbCache.set(cacheKey, { data: data as LeaderboardResponse, ts: Date.now() });
  return data as LeaderboardResponse;
}

// ── 시즌 보상 수령 캐시 (localStorage) ──────────────────────────────────
// 수령 완료된 시즌/난이도는 localStorage에 캐시해 불필요한 서버 조회 방지
// 보안: djb2 서명으로 변조 방지 (실제 이중 수령은 서버 UNIQUE 제약이 방어)

const _CLAIMS_KEY = 'seasonRewardClaims';
const _CLAIMS_SIG_KEY = 'seasonRewardClaimsSig';
const _CLAIMS_SALT = 'ddong-reward-\u0076\u0031';

function _djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

function _signClaims(claims: Record<string, number>): string {
  const str = Object.entries(claims)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',') + _CLAIMS_SALT;
  return _djb2(str);
}

/** 현재 달 + 직전 달 외의 오래된 캐시 항목 제거 */
function _pruneOldClaims(claims: Record<string, number>): Record<string, number> {
  const now = new Date();
  const cur = getCurrentYearMonth();
  const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prev = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const keep = new Set([cur, prev]);
  return Object.fromEntries(
    Object.entries(claims).filter(([k]) => keep.has(k.slice(0, 7)))
  );
}

function _loadClaimedCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(_CLAIMS_KEY);
    const sig = localStorage.getItem(_CLAIMS_SIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (sig && sig !== _signClaims(parsed)) {
      // 서명 불일치 → 변조로 판단, 초기화
      localStorage.removeItem(_CLAIMS_KEY);
      localStorage.removeItem(_CLAIMS_SIG_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function _saveClaimedCache(claims: Record<string, number>): void {
  const pruned = _pruneOldClaims(claims);
  localStorage.setItem(_CLAIMS_KEY, JSON.stringify(pruned));
  localStorage.setItem(_CLAIMS_SIG_KEY, _signClaims(pruned));
}

/**
 * 해당 달/난이도의 보상을 이미 수령했는지 localStorage에서 확인
 * @returns 수령한 SKOR 양 (없으면 null)
 */
export function getCachedClaimAmount(yearMonth: string, difficulty: string): number | null {
  const cache = _loadClaimedCache();
  const key = `${yearMonth}_${difficulty}`;
  return key in cache ? cache[key] : null;
}

// ── 캐릭터별 보상 캐시 (localStorage) ────────────────────────────────────

const _CHAR_CLAIMS_KEY = 'charRewardClaims';
const _CHAR_CLAIMS_SIG_KEY = 'charRewardClaimsSig';
const _CHAR_CLAIMS_SALT = 'ddong-char-reward-v1';

function _signCharClaims(claims: Record<string, number>): string {
  const str = Object.entries(claims)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',') + _CHAR_CLAIMS_SALT;
  return _djb2(str);
}

function _loadCharClaimedCache(): Record<string, number> {
  try {
    const raw = localStorage.getItem(_CHAR_CLAIMS_KEY);
    const sig = localStorage.getItem(_CHAR_CLAIMS_SIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (sig && sig !== _signCharClaims(parsed)) {
      localStorage.removeItem(_CHAR_CLAIMS_KEY);
      localStorage.removeItem(_CHAR_CLAIMS_SIG_KEY);
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

function _saveCharClaimedCache(claims: Record<string, number>): void {
  const now = new Date();
  const cur = getCurrentYearMonth();
  const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prev = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const keep = new Set([cur, prev]);
  const pruned = Object.fromEntries(
    Object.entries(claims).filter(([k]) => keep.has(k.slice(0, 7)))
  );
  localStorage.setItem(_CHAR_CLAIMS_KEY, JSON.stringify(pruned));
  localStorage.setItem(_CHAR_CLAIMS_SIG_KEY, _signCharClaims(pruned));
}

/**
 * 해당 달/캐릭터의 보상을 이미 수령했는지 localStorage에서 확인
 * @returns 수령한 SKOR 양 (없으면 null)
 */
export function getCachedCharClaimAmount(yearMonth: string, charId: string): number | null {
  const cache = _loadCharClaimedCache();
  const key = `${yearMonth}_${charId}`;
  return key in cache ? cache[key] : null;
}

/**
 * 직전 달 캐릭터별 보상 수령
 */
export async function claimCharacterReward(characterType: string): Promise<ClaimRewardResponse> {
  const { data, error } = await supabase.functions.invoke('claim-season-reward', {
    body: { characterType },
  });

  if (error) {
    throw new Error(error.message || 'Failed to claim character reward');
  }

  const result = data as ClaimRewardResponse;

  if (result.success && result.skorAwarded && result.skorAwarded > 0) {
    const now = new Date();
    const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevYearMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const cache = _loadCharClaimedCache();
    cache[`${prevYearMonth}_${characterType}`] = result.skorAwarded;
    _saveCharClaimedCache(cache);
  }

  return result;
}

/**
 * 직전 달 시즌 보상 수령
 */
export async function claimSeasonReward(difficulty: Difficulty): Promise<ClaimRewardResponse> {
  const { data, error } = await supabase.functions.invoke('claim-season-reward', {
    body: { difficulty },
  });

  if (error) {
    throw new Error(error.message || 'Failed to claim reward');
  }

  const result = data as ClaimRewardResponse;

  // 수령 성공(또는 이미 수령) 시 localStorage 캐시 갱신
  if (result.success && result.skorAwarded && result.skorAwarded > 0) {
    const now = new Date();
    const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevYearMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const cache = _loadClaimedCache();
    cache[`${prevYearMonth}_${difficulty}`] = result.skorAwarded;
    _saveClaimedCache(cache);
  }

  return result;
}
