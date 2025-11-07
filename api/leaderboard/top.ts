import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRedisClient } from '../lib/redis';

interface LeaderboardEntry {
  userId: string;
  userName: string;
  score: number;
  rank: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { difficulty, limit = '100', userId } = req.query;

    if (!difficulty || typeof difficulty !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid difficulty parameter' });
    }

    const topN = parseInt(limit as string, 10);
    if (isNaN(topN) || topN < 1 || topN > 1000) {
      return res.status(400).json({ error: 'Invalid limit parameter (must be 1-1000)' });
    }

    const redis = getRedisClient();
    const leaderboardKey = `leaderboard:${difficulty}`;

    // 상위 N명 조회 (점수 높은 순)
    const topScores = await redis.zrange(leaderboardKey, 0, topN - 1, {
      rev: true,
      withScores: true,
    });

    // 사용자 이름 조회를 위한 userId 목록
    const userIds: string[] = [];
    const scores: number[] = [];

    for (let i = 0; i < topScores.length; i += 2) {
      userIds.push(topScores[i] as string);
      scores.push(topScores[i + 1] as number);
    }

    // 사용자 정보 일괄 조회
    const userDataPromises = userIds.map(async (id) => {
      const userData = await redis.hgetall(`user:${id}`);
      return userData?.name || `User ${id.slice(0, 8)}`;
    });

    const userNames = await Promise.all(userDataPromises);

    // 리더보드 엔트리 생성
    const leaderboard: LeaderboardEntry[] = userIds.map((id, index) => ({
      userId: id,
      userName: userNames[index] as string,
      score: scores[index],
      rank: index + 1,
    }));

    // 특정 유저 순위 조회 (옵션)
    let currentUserRank: { rank: number; score: number } | null = null;
    if (userId && typeof userId === 'string') {
      const userScore = await redis.zscore(leaderboardKey, userId);
      const rank = await redis.zrevrank(leaderboardKey, userId);

      if (userScore !== null && rank !== null) {
        currentUserRank = {
          rank: rank + 1,
          score: userScore,
        };
      }
    }

    return res.status(200).json({
      success: true,
      difficulty,
      leaderboard,
      currentUserRank,
      totalEntries: await redis.zcard(leaderboardKey),
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
