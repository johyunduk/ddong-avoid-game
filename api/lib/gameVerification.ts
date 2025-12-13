import crypto from 'crypto';

/**
 * 서버 사이드 게임 검증 유틸리티
 * - HMAC 서명 검증
 * - 게임 데이터 유효성 검증
 */

export interface GamePlayData {
  score: number;
  difficulty: string;
  playTime: number;
  timestamp: number;
  userId: string;
  goldPoopsCollected: number;
  diamondPoopsCollected: number;
}

/**
 * HMAC-SHA256 서명 생성 (서버용)
 */
export function generateGameSignature(
  data: GamePlayData,
  secretKey: string
): string {
  // 클라이언트와 동일한 순서로 메시지 구성
  const message = `${data.userId}|${data.score}|${data.difficulty}|${data.playTime}|${data.timestamp}|${data.goldPoopsCollected}|${data.diamondPoopsCollected}`;

  // HMAC-SHA256 서명 생성
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('hex');
}

/**
 * HMAC 서명 검증
 */
export function verifyGameSignature(
  data: GamePlayData,
  signature: string,
  secretKey: string
): boolean {
  const expectedSignature = generateGameSignature(data, secretKey);

  // 타이밍 공격 방지를 위한 constant-time 비교
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * 게임 플레이 데이터 검증
 */
export function validateGamePlayData(data: GamePlayData): {
  valid: boolean;
  reason?: string;
} {
  // 1. 점수가 음수인가?
  if (data.score < 0) {
    return { valid: false, reason: 'Score cannot be negative' };
  }

  // 2. 보너스 아이템 개수가 음수인가?
  if (data.goldPoopsCollected < 0 || data.diamondPoopsCollected < 0) {
    return { valid: false, reason: 'Bonus item count cannot be negative' };
  }

  // 3. 보너스 아이템 개수가 비정상적으로 많은가?
  const maxGoldPoops = Math.floor(data.playTime / 100 / 40) + 10;
  const maxDiamondPoops = Math.floor(data.playTime / 100 / 100) + 5;

  if (data.goldPoopsCollected > maxGoldPoops) {
    return {
      valid: false,
      reason: `Too many gold poops collected: ${data.goldPoopsCollected} (max: ${maxGoldPoops} for ${data.playTime}ms)`,
    };
  }

  if (data.diamondPoopsCollected > maxDiamondPoops) {
    return {
      valid: false,
      reason: `Too many diamond poops collected: ${data.diamondPoopsCollected} (max: ${maxDiamondPoops} for ${data.playTime}ms)`,
    };
  }

  // 4. 점수가 비정상적으로 높은가?
  const maxScorePerDifficulty: Record<string, number> = {
    easy: 10000,
    normal: 15000,
    hard: 20000,
  };

  const maxScore = maxScorePerDifficulty[data.difficulty] || 20000;
  if (data.score > maxScore) {
    return {
      valid: false,
      reason: `Score ${data.score} exceeds maximum ${maxScore} for difficulty ${data.difficulty}`,
    };
  }

  // 5. 점수와 보너스 아이템 일치 검증
  const bonusScore = (data.goldPoopsCollected * 20) + (data.diamondPoopsCollected * 40);
  const baseScore = data.score - bonusScore;
  const maxBaseScore = (data.playTime / 100) * 1.2;

  if (baseScore > maxBaseScore) {
    return {
      valid: false,
      reason: `Base score ${baseScore} too high for play time ${data.playTime}ms (max: ${maxBaseScore})`,
    };
  }

  // 6. 플레이 타임 검증 (100ms당 1점, 50% 여유)
  const minPlayTime = (data.score / 10) * 1000;
  const allowedMargin = 0.5;

  if (data.playTime < minPlayTime * allowedMargin) {
    return {
      valid: false,
      reason: `Play time ${data.playTime}ms too short for score ${data.score}`,
    };
  }

  // 7. 타임스탬프 검증 (미래 시간 불가)
  if (data.timestamp > Date.now()) {
    return { valid: false, reason: 'Timestamp is in the future' };
  }

  // 8. 타임스탬프 검증 (24시간 이내만 허용)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  if (data.timestamp < oneDayAgo) {
    return { valid: false, reason: 'Timestamp is too old (>24 hours)' };
  }

  // 9. 난이도 검증
  const validDifficulties = ['easy', 'normal', 'hard'];
  if (!validDifficulties.includes(data.difficulty)) {
    return { valid: false, reason: 'Invalid difficulty' };
  }

  return { valid: true };
}

/**
 * 환경 변수에서 서버 비밀 키 가져오기
 */
export function getServerSecretKey(): string {
  const key = process.env.GAME_SECRET_KEY;

  if (!key) {
    throw new Error('GAME_SECRET_KEY environment variable is not set');
  }

  return key;
}
