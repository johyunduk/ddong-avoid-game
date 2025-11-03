/**
 * 토스 게임 SDK 타입 정의
 *
 * 실제 토스 SDK 설치 후 @toss/games-sdk로 교체 필요
 */

export interface TossUser {
  id: string;
  name: string;
  avatar?: string;
}

export interface TossSDKConfig {
  appId: string;
}

export interface LeaderboardScore {
  score: number;
  userId: string;
}

export interface PromotionReward {
  userId: string;
  amount: number;
  reason: string;
}

export interface AdReward {
  type: string;
  amount: number;
}

export interface TossGamesSDK {
  // 로그인
  login(): Promise<TossUser>;

  // 리더보드
  leaderboard: {
    submitScore(data: LeaderboardScore): Promise<void>;
    getTopScores(limit?: number): Promise<LeaderboardScore[]>;
  };

  // 프로모션 (토스 포인트)
  promotion: {
    rewardPoints(data: PromotionReward): Promise<void>;
  };

  // 광고
  ads: {
    showRewardedAd(options: {
      onComplete: (reward: AdReward) => void;
      onSkip?: () => void;
    }): Promise<void>;
    showInterstitialAd(): Promise<void>;
  };
}

// 전역 윈도우 객체에 토스 SDK 추가
declare global {
  interface Window {
    TossGamesSDK?: new (config: TossSDKConfig) => TossGamesSDK;
  }
}
