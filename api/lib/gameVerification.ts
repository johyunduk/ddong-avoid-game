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
  // 피버 타임 고려: 100점에서 첫 발동, 이후 1200점마다 반복 (5초간 보너스 아이템 8개 생성)

  // 일반 생성: 40점마다 금똥 1개, 100점마다 다이아똥 1개
  const normalGoldPoops = Math.floor(data.score / 40);
  const normalDiamondPoops = Math.floor(data.score / 100);

  // 피버 타임 발동 횟수 계산 (100점 첫 발동, 이후 1200점 간격)
  let feverTimeCount = 0;
  if (data.score >= 100) {
    feverTimeCount = 1 + Math.floor((data.score - 100) / 1200);
  }

  // 피버 타임당 보너스 아이템 8개 생성 (금똥/다이아똥 랜덤 조합)
  // 최악의 경우 모두 금똥 또는 모두 다이아똥일 수 있음
  const feverBonusItems = feverTimeCount * 8;

  // 최대 허용 개수 (일반 생성 + 피버 타임 생성 + 여유분 20%)
  const maxGoldPoops = Math.ceil((normalGoldPoops + feverBonusItems) * 1.2);
  const maxDiamondPoops = Math.ceil((normalDiamondPoops + feverBonusItems) * 1.2);

  if (data.goldPoopsCollected > maxGoldPoops) {
    return {
      valid: false,
      reason: `Too many gold poops collected: ${data.goldPoopsCollected} (max: ${maxGoldPoops} for score ${data.score}, fever times: ${feverTimeCount})`,
    };
  }

  if (data.diamondPoopsCollected > maxDiamondPoops) {
    return {
      valid: false,
      reason: `Too many diamond poops collected: ${data.diamondPoopsCollected} (max: ${maxDiamondPoops} for score ${data.score}, fever times: ${feverTimeCount})`,
    };
  }

  // 4. 점수가 비정상적으로 높은가?
  // 피버 타임으로 인해 보너스 점수가 크게 증가할 수 있으므로 한도 상향 조정
  const maxScorePerDifficulty: Record<string, number> = {
    easy: 20000,    // 10000 → 20000 (피버 타임 고려)
    normal: 30000,  // 15000 → 30000
    hard: 40000,    // 20000 → 40000
    extreme: 50000, // 25000 → 50000
  };

  const maxScore = maxScorePerDifficulty[data.difficulty] || 40000;
  if (data.score > maxScore) {
    return {
      valid: false,
      reason: `Score ${data.score} exceeds maximum ${maxScore} for difficulty ${data.difficulty}`,
    };
  }

  // 5. 점수와 보너스 아이템 일치 검증
  const bonusScore = (data.goldPoopsCollected * 20) + (data.diamondPoopsCollected * 40);
  const baseScore = data.score - bonusScore;

  // 피버 타임 중 일반 똥도 생성되므로 기본 점수 증가율이 높아짐
  // 100ms당 1점 + 피버 타임 고려 (5초 * 피버 횟수 * 2배 여유)
  const feverTimeDuration = feverTimeCount * 5000; // 피버 타임 총 지속 시간 (ms)
  const maxBaseScore = ((data.playTime + feverTimeDuration) / 100) * 1.5;

  if (baseScore > maxBaseScore) {
    return {
      valid: false,
      reason: `Base score ${baseScore} too high for play time ${data.playTime}ms (max: ${maxBaseScore})`,
    };
  }

  // 6. 플레이 타임 검증 (피버 타임으로 인한 보너스 점수 고려)
  // 보너스 점수를 제외한 기본 점수 기준으로 검증
  const minPlayTime = (baseScore / 10) * 1000;
  const allowedMargin = 0.3; // 30% 여유 (피버 타임 고려)

  if (data.playTime < minPlayTime * allowedMargin) {
    return {
      valid: false,
      reason: `Play time ${data.playTime}ms too short for base score ${baseScore}`,
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
  const validDifficulties = ['easy', 'normal', 'hard', 'extreme'];
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
