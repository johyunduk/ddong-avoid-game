import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedisClient } from '../lib/redis';

interface SubmitScoreRequest {
  userId: string;
  userName: string;
  score: number;
  difficulty: string;
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
    const { userId, userName, score, difficulty }: SubmitScoreRequest = req.body;

    // 입력 검증
    if (!userId || !userName || score === undefined || !difficulty) {
      return res.status(400).json({
        error: 'Missing required fields: userId, userName, score, difficulty'
      });
    }

    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({ error: 'Invalid score' });
    }

    const redis = getRedisClient();
    const leaderboardKey = `leaderboard:${difficulty}`;
    const userDataKey = `user:${userId}`;

    // 사용자 정보 저장 (userId -> userName 매핑)
    await redis.hset(userDataKey, {
      name: userName,
      lastScore: score,
      lastUpdated: Date.now(),
    });

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
