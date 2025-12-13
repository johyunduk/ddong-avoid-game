import { type Difficulty } from '../types/GameMode';

// API 기본 URL (환경에 따라 자동 감지)
const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5173'
  : import.meta.env.VITE_API_BASE_URL || 'https://ddong-avoid-game.vercel.app';

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  score: number;
  rank: number;
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
 * 사용자 ID 생성 또는 조회 (localStorage 사용)
 */
export function getUserId(): string {
  let userId = localStorage.getItem('userId');

  if (!userId) {
    // UUID v4 형식으로 생성
    userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem('userId', userId);
  }

  return userId;
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
  // 검증: 정확히 3자리, 영어 대문자만
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

/**
 * 점수 제출
 */
export async function submitScore(
  score: number,
  difficulty: Difficulty,
  initials: string,
  gameData?: {
    score: number;
    difficulty: string;
    playTime: number;
    timestamp: number;
    userId: string;
  },
  signature?: string
): Promise<SubmitScoreResponse> {
  const userId = getUserId();

  // 이니셜 검증
  if (!/^[A-Z]{3}$/.test(initials)) {
    throw new Error('Invalid initials: must be 3 uppercase letters');
  }

  // 🚧 로컬 개발 모드: Mock 데이터 반환 (Vercel Functions가 없을 때)
  if (import.meta.env.DEV) {
    console.warn('⚠️ DEV MODE: Using mock data. Deploy to Vercel to test real API.');

    // 1초 지연으로 실제 API 호출처럼 보이게
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock 응답
    return {
      success: true,
      isNewRecord: true,
      previousScore: Math.max(0, score - 100),
      newScore: score,
      rank: Math.floor(Math.random() * 100) + 1, // 랜덤 순위 1-100
    };
  }

  // 🚀 프로덕션: 실제 API 호출
  const requestBody: any = {
    userId,
    userName: initials, // 이니셜을 userName으로 전송
    score,
    difficulty,
  };

  // 게임 데이터와 서명이 있으면 포함
  if (gameData && signature) {
    requestBody.gameData = gameData;
    requestBody.signature = signature;
  }

  const response = await fetch(`${API_BASE_URL}/api/leaderboard/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit score');
  }

  return response.json();
}

/**
 * 리더보드 조회
 */
export async function getLeaderboard(
  difficulty: Difficulty,
  limit: number = 100
): Promise<LeaderboardResponse> {
  const userId = getUserId();

  // 🚧 로컬 개발 모드: Mock 데이터 반환 (Vercel Functions가 없을 때)
  if (import.meta.env.DEV) {
    console.warn('⚠️ DEV MODE: Using mock leaderboard data. Deploy to Vercel to test real API.');

    // 1초 지연으로 실제 API 호출처럼 보이게
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock 리더보드 데이터 생성
    const mockNames = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH', 'III', 'JJJ'];
    const mockLeaderboard: LeaderboardEntry[] = mockNames.slice(0, limit).map((name, index) => ({
      userId: `mock-user-${index + 1}`,
      userName: name,
      score: 1000 - (index * 50),
      rank: index + 1,
    }));

    return {
      success: true,
      difficulty,
      leaderboard: mockLeaderboard,
      currentUserRank: null,
      totalEntries: mockLeaderboard.length,
    };
  }

  // 🚀 프로덕션: 실제 API 호출
  const response = await fetch(
    `${API_BASE_URL}/api/leaderboard/top?difficulty=${difficulty}&limit=${limit}&userId=${userId}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch leaderboard');
  }

  return response.json();
}
