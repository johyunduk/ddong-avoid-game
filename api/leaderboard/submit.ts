import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedisClient } from '../lib/redis';
import {
  verifyGameSignature,
  validateGamePlayData,
  getServerSecretKey,
  type GamePlayData
} from '../lib/gameVerification';

interface SubmitScoreRequest {
  userId: string;
  userName: string;
  score: number;
  difficulty: string;
  gameData?: GamePlayData;
  signature?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, userName, score, difficulty, gameData, signature }: SubmitScoreRequest = req.body;

    // 입력 검증
    if (!userId || !userName || score === undefined || !difficulty) {
      return res.status(400).json({
        error: 'Missing required fields: userId, userName, score, difficulty'
      });
    }

    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Invalid score' });
    }

    // HMAC 서명 검증 (gameData와 signature가 모두 있을 때만)
    if (gameData && signature) {
      try {
        const secretKey = getServerSecretKey();

        // 1. 게임 플레이 데이터 검증
        const validation = validateGamePlayData(gameData);
        if (!validation.valid) {
          console.error(`[Security] Invalid game data: ${validation.reason}`);
          return res.status(400).json({
            error: 'Invalid game play data',
            details: validation.reason
          });
        }

        // 2. HMAC 서명 검증
        const isValid = verifyGameSignature(gameData, signature, secretKey);
        if (!isValid) {
          console.error('[Security] HMAC signature verification failed');
          return res.status(403).json({
            error: 'Invalid signature - score manipulation detected'
          });
        }

        // 3. 점수 일치 검증
        if (gameData.score !== score) {
          console.error('[Security] Score mismatch between gameData and request');
          return res.status(400).json({
            error: 'Score mismatch'
          });
        }

        // 4. userId 일치 검증
        if (gameData.userId !== userId) {
          console.error('[Security] UserId mismatch');
          return res.status(400).json({
            error: 'User ID mismatch'
          });
        }

        console.log(`[Security] Score verified: ${score} points for user ${userId}`);
      } catch (error) {
        console.error('[Security] Verification error:', error);
        return res.status(500).json({
          error: 'Verification failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    } else {
      // 서명이 없는 경우 경고 로그 (하위 호환성을 위해 허용하지만 로깅)
      console.warn(`[Security] Score submitted without signature verification: userId=${userId}, score=${score}`);
    }

    const redis = getRedisClient();
    const leaderboardKey = `leaderboard:${difficulty}`;
    const userDataKey = `user:${userId}`;

    // 사용자 정보 및 게임 통계 저장
    const userData: Record<string, any> = {
      name: userName,
      lastScore: score,
      lastUpdated: Date.now(),
    };

    // 게임 데이터가 있으면 통계도 함께 저장
    if (gameData) {
      userData.lastPlayTime = gameData.playTime;
      userData.lastGoldPoops = gameData.goldPoopsCollected;
      userData.lastDiamondPoops = gameData.diamondPoopsCollected;
      userData.lastTimestamp = gameData.timestamp;
    }

    await redis.hset(userDataKey, userData);

    // 기존 점수 조회
    const existingScore = await redis.zscore(leaderboardKey, userId);

    // 더 높은 점수만 업데이트
    if (existingScore === null || score > existingScore) {
      await redis.zadd(leaderboardKey, {
        score,
        member: userId,
      });

      // 새로운 순위 조회
      const rank = await redis.zrevrank(leaderboardKey, userId);

      return res.status(200).json({
        success: true,
        isNewRecord: existingScore === null || score > existingScore,
        previousScore: existingScore,
        newScore: score,
        rank: rank !== null ? rank + 1 : null, // 0-based를 1-based로 변환
      });
    } else {
      // 기존 점수가 더 높음
      const rank = await redis.zrevrank(leaderboardKey, userId);

      return res.status(200).json({
        success: true,
        isNewRecord: false,
        previousScore: existingScore,
        newScore: score,
        rank: rank !== null ? rank + 1 : null,
        message: 'Score not updated (existing score is higher)',
      });
    }
  } catch (error) {
    console.error('Error submitting score:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
