/**
 * 토스 SDK 유틸리티
 *
 * 실제 배포 시에는 @toss/games-sdk를 사용하세요
 * npm install @toss/games-sdk
 */

import type { TossGamesSDK, TossUser } from '../types/toss-sdk';

class MockTossSDK {
  private appId: string;
  private currentUser: TossUser | null = null;

  constructor(config: { appId: string }) {
    this.appId = config.appId;
    console.log('[Mock Toss SDK] Initialized with appId:', this.appId);
  }

  async login(): Promise<TossUser> {
    console.log('[Mock Toss SDK] Login called');

    // 실제로는 토스 로그인 처리
    this.currentUser = {
      id: 'test-user-' + Date.now(),
      name: '테스트 사용자',
      avatar: undefined
    };

    return this.currentUser;
  }

  leaderboard = {
    submitScore: async (data: { score: number; userId: string }) => {
      console.log('[Mock Toss SDK] Submit score:', data);

      // 실제로는 토스 서버로 점수 전송
      // 로컬스토리지에 임시 저장
      const scores = this.getLocalScores();
      scores.push({
        ...data,
        timestamp: Date.now()
      });

      // 상위 10개만 유지
      scores.sort((a: any, b: any) => b.score - a.score);
      localStorage.setItem('toss-game-scores', JSON.stringify(scores.slice(0, 10)));
    },

    getTopScores: async (limit: number = 10) => {
      console.log('[Mock Toss SDK] Get top scores, limit:', limit);

      const scores = this.getLocalScores();
      return scores.slice(0, limit).map((s: any) => ({
        score: s.score,
        userId: s.userId
      }));
    }
  };

  promotion = {
    rewardPoints: async (data: { userId: string; amount: number; reason: string }) => {
      console.log('[Mock Toss SDK] Reward points:', data);

      // 실제로는 토스 포인트 지급
      alert(`🎉 토스 포인트 ${data.amount}P 지급!\n사유: ${data.reason}`);
    }
  };

  ads = {
    showRewardedAd: async (options: {
      onComplete: (reward: any) => void;
      onSkip?: () => void;
    }) => {
      console.log('[Mock Toss SDK] Show rewarded ad');

      // 실제로는 광고 표시
      const watch = confirm('광고를 시청하시겠습니까?\n(3초 후 보상 지급)');

      if (watch) {
        // 3초 대기
        await new Promise(resolve => setTimeout(resolve, 3000));
        options.onComplete({ type: 'points', amount: 10 });
      } else if (options.onSkip) {
        options.onSkip();
      }
    },

    showInterstitialAd: async () => {
      console.log('[Mock Toss SDK] Show interstitial ad');

      // 실제로는 전면 광고 표시
      // 개발 환경에서는 스킵
    }
  };

  private getLocalScores() {
    try {
      const data = localStorage.getItem('toss-game-scores');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }
}

// SDK 인스턴스 생성 및 내보내기
let sdk: TossGamesSDK | null = null;

export function initTossSDK(appId: string): TossGamesSDK {
  // 실제 배포 시에는 아래 주석을 해제하고 사용
  // if (window.TossGamesSDK) {
  //   sdk = new window.TossGamesSDK({ appId });
  // }

  // 개발 환경에서는 Mock SDK 사용
  if (!sdk) {
    sdk = new MockTossSDK({ appId }) as any;
  }

  return sdk!;
}

export function getTossSDK(): TossGamesSDK | null {
  return sdk;
}

export function submitScore(score: number) {
  if (sdk) {
    const userId = 'current-user'; // 실제로는 로그인된 사용자 ID
    sdk.leaderboard.submitScore({ score, userId });
  }
}

export function rewardPoints(amount: number, reason: string) {
  if (sdk) {
    const userId = 'current-user'; // 실제로는 로그인된 사용자 ID
    sdk.promotion.rewardPoints({ userId, amount, reason });
  }
}
