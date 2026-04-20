/**
 * 스토리 진행 상태 관리 v2
 * - 이벤트 기반 해금 조건 (topaz/gold/diamond/playCount/skor/gacha)
 * - localStorage djb2 서명으로 stats/unlocked 변조 방지
 */

import { STORY_LOGS } from '../data/storyLogs';

// localStorage 키
const UNLOCKED_KEY     = 'storyUnlocked';
const UNLOCKED_SIG_KEY = 'storyUnlockedSig';
const READ_KEY         = 'storyRead';
const STATS_KEY        = 'storyStats';
const STATS_SIG_KEY    = 'storyStatsSig';

const _SALT = 'ddong-story-\u0076\u0032';

interface StoryStats {
  topazCollected:   number;
  goldCollected:    number;
  diamondCollected: number;
  playCount:        number;
  totalSkor:        number;
  gachaPullCount:   number;
}

const _DEFAULT_STATS: StoryStats = {
  topazCollected:   0,
  goldCollected:    0,
  diamondCollected: 0,
  playCount:        0,
  totalSkor:        0,
  gachaPullCount:   0,
};

// ── djb2 해시 ──────────────────────────────────────────────────

function _djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function _signIds(ids: string[]): string {
  return _djb2([...ids].sort().join(',') + _SALT);
}

function _signStats(stats: StoryStats): string {
  const str = Object.entries(stats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',') + _SALT;
  return _djb2(str);
}

// ── Stats R/W ──────────────────────────────────────────────────

function _getStats(): StoryStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    const sig = localStorage.getItem(STATS_SIG_KEY);
    if (!raw) return { ..._DEFAULT_STATS };
    const stats: StoryStats = { ..._DEFAULT_STATS, ...(JSON.parse(raw) as Partial<StoryStats>) };
    if (sig === null) {
      // 마이그레이션: 서명 최초 발급
      _saveStats(stats);
      return stats;
    }
    if (sig !== _signStats(stats)) {
      _saveStats({ ..._DEFAULT_STATS });
      return { ..._DEFAULT_STATS };
    }
    return stats;
  } catch {
    return { ..._DEFAULT_STATS };
  }
}

function _saveStats(stats: StoryStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  localStorage.setItem(STATS_SIG_KEY, _signStats(stats));
}

// ── Unlocked IDs R/W ──────────────────────────────────────────

export function getUnlockedIds(): string[] {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    const sig = localStorage.getItem(UNLOCKED_SIG_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (sig === null) {
      _saveUnlocked(ids);
      return ids;
    }
    if (sig !== _signIds(ids)) {
      _saveUnlocked([]);
      return [];
    }
    return ids;
  } catch {
    return [];
  }
}

function _saveUnlocked(ids: string[]): void {
  localStorage.setItem(UNLOCKED_KEY, JSON.stringify(ids));
  localStorage.setItem(UNLOCKED_SIG_KEY, _signIds(ids));
}

// ── Read IDs R/W (게임플레이 미영향 → 서명 생략) ──────────────

export function getReadIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function markAsRead(id: string): void {
  const read = getReadIds();
  if (!read.includes(id)) {
    read.push(id);
    localStorage.setItem(READ_KEY, JSON.stringify(read));
  }
}

// ── 해금 체크 ──────────────────────────────────────────────────

function _checkAndUnlockLogs(stats: StoryStats): void {
  const unlocked = getUnlockedIds();
  let changed = false;

  for (const log of STORY_LOGS) {
    if (unlocked.includes(log.id)) continue;

    const { type, threshold } = log.unlockCondition;
    const current =
      type === 'topaz'     ? stats.topazCollected   :
      type === 'gold'      ? stats.goldCollected    :
      type === 'diamond'   ? stats.diamondCollected :
      type === 'playCount' ? stats.playCount        :
      type === 'skor'      ? stats.totalSkor        :
      /* gacha */            stats.gachaPullCount;

    if (current >= threshold) {
      unlocked.push(log.id);
      changed = true;
      console.log(`[Story] 새 로그 해금: ${log.id}`);
    }
  }

  if (changed) _saveUnlocked(unlocked);
}

// ── 공개 API ──────────────────────────────────────────────────

/** 게임 이벤트 발생 시 누적 및 해금 체크 */
export function recordEvent(
  type: 'topaz' | 'gold' | 'diamond' | 'playCount' | 'skor' | 'gacha',
  amount = 1,
): void {
  const stats = _getStats();
  switch (type) {
    case 'topaz':     stats.topazCollected   += amount; break;
    case 'gold':      stats.goldCollected    += amount; break;
    case 'diamond':   stats.diamondCollected += amount; break;
    case 'playCount': stats.playCount        += amount; break;
    case 'skor':      stats.totalSkor        += amount; break;
    case 'gacha':     stats.gachaPullCount   += amount; break;
  }
  _saveStats(stats);
  _checkAndUnlockLogs(stats);
}

/** 홈 화면 빨간 점 표시 여부 */
export function hasUnreadNewLogs(): boolean {
  const unlocked = getUnlockedIds();
  const read = getReadIds();
  return unlocked.some(id => !read.includes(id));
}
