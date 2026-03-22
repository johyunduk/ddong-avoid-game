/**
 * ⚠️ BATTLE_TIERS / TIER_NAMES / TIER_ICONS 수정 시
 * 아래 두 Edge Function에도 동일하게 반영해야 함 (Deno 환경에서 로컬 TS 공유 불가):
 *   - supabase/functions/battle-result-submit/index.ts  (TIERS, TIER_NAMES, TIER_ICONS)
 *   - supabase/functions/battle-leaderboard-top/index.ts (TIER_MINS, TIER_NAMES, TIER_ICONS)
 */
export interface BattleTierDef {
  name: string;
  icon: string;
  minRp: number;
  maxRp: number;
  color: string; // hex 색상 (UI 표시용)
}

/**
 * 배틀 티어 구간 정의 (RP 오름차순)
 * 신규 유저 시작 RP: 1000 (🟡 레거시 구간 하단)
 */
export const BATTLE_TIERS: readonly BattleTierDef[] = [
  { name: '알파',   icon: '🔴', minRp: 0,    maxRp: 499,      color: '#CC3333' },
  { name: '베타',   icon: '🟠', minRp: 500,  maxRp: 999,      color: '#CC7700' },
  { name: '레거시', icon: '🟡', minRp: 1000, maxRp: 1499,     color: '#CCCC00' },
  { name: '마스터', icon: '💎', minRp: 1500, maxRp: 1999,     color: '#00BFFF' },
  { name: '갓',     icon: '👑', minRp: 2000, maxRp: Infinity, color: '#FF4500' },
] as const;

/** RP로 티어 인덱스 반환 (0~5) */
export function getTierIndex(rp: number): number {
  for (let i = BATTLE_TIERS.length - 1; i >= 0; i--) {
    if (rp >= BATTLE_TIERS[i].minRp) return i;
  }
  return 0;
}

/** RP로 티어 정의 반환 */
export function getBattleTier(rp: number): BattleTierDef {
  return BATTLE_TIERS[getTierIndex(rp)];
}

/**
 * 대전 결과 + 양측 RP로 포인트 변동량 계산
 *
 * tierDiff = 상대 티어 인덱스 - 내 티어 인덱스
 * 양수: 상대가 더 높은 티어 (이기면 많이 획득, 지면 적게 잃음)
 * 음수: 상대가 더 낮은 티어 (이겨도 적게 획득, 지면 많이 잃음)
 */
export function calcPointDelta(
  result: 'win' | 'lose' | 'disconnect',
  myRp: number,
  opponentRp: number,
): number {
  if (result === 'disconnect') return 20;

  const myTier = getTierIndex(myRp);
  const opponentTier = getTierIndex(opponentRp);
  const tierDiff = opponentTier - myTier;

  if (result === 'win') {
    if (tierDiff >= 2)  return 35;
    if (tierDiff === 1) return 30;
    if (tierDiff === 0) return 25;
    if (tierDiff === -1) return 20;
    return 15; // tierDiff <= -2
  } else {
    // lose
    if (tierDiff >= 2)  return -10;
    if (tierDiff === 1) return -15;
    if (tierDiff === 0) return -20;
    if (tierDiff === -1) return -25;
    return -30; // tierDiff <= -2
  }
}
