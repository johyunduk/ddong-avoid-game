/**
 * HMAC 기반 게임 점수 검증 유틸리티
 * - Stateless 방식으로 추가 저장소 불필요
 * - 클라이언트와 서버가 같은 비밀 키로 서명 생성/검증
 */

export interface GamePlayData {
  score: number;
  difficulty: string;
  playTime: number; // 밀리초 단위
  timestamp: number; // 게임 시작 시각
  userId: string;
  goldPoopsCollected: number; // 수집한 금똥 개수
  diamondPoopsCollected: number; // 수집한 다이아똥 개수
}

/**
 * HMAC-SHA256 서명 생성 (클라이언트용)
 *
 * 주의: 이 함수는 보안이 완벽하지 않습니다.
 * 클라이언트 코드는 누구나 볼 수 있으므로, 정교한 공격자는
 * 비밀 키를 추출할 수 있습니다. 하지만 일반적인 스크립트 키디는 막을 수 있습니다.
 */
export async function generateGameSignature(
  data: GamePlayData,
  secretKey: string
): Promise<string> {
  // 서명할 메시지 구성 (순서 중요!)
  const message = `${data.userId}|${data.score}|${data.difficulty}|${data.playTime}|${data.timestamp}|${data.goldPoopsCollected}|${data.diamondPoopsCollected}`;

  // TextEncoder로 문자열을 바이트 배열로 변환
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const keyBytes = encoder.encode(secretKey);

  // HMAC-SHA256 키 생성
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // HMAC 서명 생성
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageBytes);

  // ArrayBuffer를 Hex 문자열로 변환
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureHex = signatureArray
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

  return signatureHex;
}

/**
 * 게임 플레이 데이터 검증 (기본적인 상식 체크)
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
  // 100초 플레이하면 40점마다 금똥이니까 최대 25개 정도
  const maxGoldPoops = Math.floor(data.playTime / 100 / 40) + 10; // 여유 10개
  const maxDiamondPoops = Math.floor(data.playTime / 100 / 100) + 5; // 여유 5개

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

  // 4. 점수가 비정상적으로 높은가? (난이도별 최대 점수)
  const maxScorePerDifficulty: Record<string, number> = {
    easy: 10000,    // 쉬움: 최대 10,000점
    normal: 15000,  // 보통: 최대 15,000점
    hard: 20000,    // 어려움: 최대 20,000점
  };

  const maxScore = maxScorePerDifficulty[data.difficulty] || 20000;
  if (data.score > maxScore) {
    return {
      valid: false,
      reason: `Score ${data.score} exceeds maximum ${maxScore} for difficulty ${data.difficulty}`,
    };
  }

  // 5. 점수와 보너스 아이템 일치 검증
  // 기본 점수 = 100ms당 1점
  // 보너스 점수 = 금똥 20점 + 다이아똥 40점
  const bonusScore = (data.goldPoopsCollected * 20) + (data.diamondPoopsCollected * 40);
  const baseScore = data.score - bonusScore;

  // 기본 점수가 플레이 타임과 비교해서 합리적인가?
  const maxBaseScore = (data.playTime / 100) * 1.2; // 20% 여유

  if (baseScore > maxBaseScore) {
    return {
      valid: false,
      reason: `Base score ${baseScore} too high for play time ${data.playTime}ms (max: ${maxBaseScore})`,
    };
  }

  // 6. 플레이 타임이 너무 짧은가? (1초 = 10점 가정, 최소 플레이 타임 계산)
  // 100ms당 1점이므로, 1초당 10점
  const minPlayTime = (data.score / 10) * 1000; // 밀리초
  const allowedMargin = 0.5; // 50% 여유

  if (data.playTime < minPlayTime * allowedMargin) {
    return {
      valid: false,
      reason: `Play time ${data.playTime}ms too short for score ${data.score} (min: ${minPlayTime * allowedMargin}ms)`,
    };
  }

  // 4. 타임스탬프가 미래인가?
  if (data.timestamp > Date.now()) {
    return { valid: false, reason: 'Timestamp is in the future' };
  }

  // 5. 타임스탬프가 너무 과거인가? (24시간 이내만 허용)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  if (data.timestamp < oneDayAgo) {
    return { valid: false, reason: 'Timestamp is too old (>24 hours)' };
  }

  return { valid: true };
}

/**
 * 환경 변수에서 비밀 키 가져오기
 * 주의: 클라이언트에서는 이 키가 노출될 수 있습니다.
 * 완벽한 보안을 위해서는 서버 사이드 검증이 필수입니다.
 */
export function getClientSecretKey(): string {
  // 빌드 시 주입되는 환경 변수
  // Vite는 VITE_ 접두사가 붙은 변수만 클라이언트에 노출
  const key = import.meta.env.VITE_GAME_SECRET_KEY;

  if (!key) {
    console.error('⚠️ VITE_GAME_SECRET_KEY not found in environment variables');
    // 개발 모드에서는 기본 키 사용 (절대 프로덕션에서 사용하지 말 것!)
    return import.meta.env.DEV ? 'dev-secret-key-DO-NOT-USE-IN-PRODUCTION' : '';
  }

  return key;
}
