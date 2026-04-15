/**
 * 캐릭터 능력 수치 설정 (단일 진실 공급원)
 *
 * PARAMS  — 능력 클래스에서 사용하는 숫자/비율 값
 * DESC    — PARAMS로 자동 생성되는 설명 문자열 (character.ts에서 import)
 *
 * 수치를 바꾸면 게임 로직과 캐릭터 정보 패널이 동시에 갱신됩니다.
 */

// ── 루트 (Hacker / SR) ────────────────────────────────────────────────
export const HACKER_PARAMS = {
  deleteInterval: 100,      // 터미널 삭제 점수 간격
  deleteCount: 7,           // 삭제하는 똥 개수
  specialPoopSlowdown: 40,  // 특수 똥 낙하 속도 감소 (px/s)
} as const;

export const HACKER_DESC = {
  basicEffect: '금똥·다이아똥 낙하 속도 감소',
  specialAbility: `${HACKER_PARAMS.deleteInterval}점마다 일반 똥 ${HACKER_PARAMS.deleteCount}개 터미널 삭제`,
} as const;

// ── 광부 (Miner / SR) ─────────────────────────────────────────────────
export const MINER_PARAMS = {
  specialBonus: 5,         // 특수 똥 수집 시 추가 점수
  rainbowInterval: 350,     // 무지개똥 생성 점수 간격
} as const;

export const MINER_DESC = {
  basicEffect: `특수 똥 수집 시 +${MINER_PARAMS.specialBonus}점 추가`,
  specialAbility: `${MINER_PARAMS.rainbowInterval}점마다 무지개똥 생성`,
} as const;

// ── 매화 (Maehwa / SR) ────────────────────────────────────────────────
export const MAEHWA_PARAMS = {
  speedBonus: 50,           // 이동 속도 보너스 (px/s)
  slashInterval: 100,       // 칼 베기 점수 간격
  slashCount: 3,            // 한 번에 베는 똥 개수
  awake2SpecialBonus: 5,    // ★2+ 특수 똥 수집 추가 점수
} as const;

export const MAEHWA_DESC = {
  basicEffect: `이동 속도 +${MAEHWA_PARAMS.speedBonus}px/s`,
  specialAbility: `${MAEHWA_PARAMS.slashInterval}점마다 위쪽 똥 ${MAEHWA_PARAMS.slashCount}개 칼로 제거`,
} as const;

// ── 아카이브 (Archieve / SR) ──────────────────────────────────────────
export const ARCHIEVE_PARAMS = {
  scoreMultiplierExtra: 0.10, // 점수 배율 추가분 (base의 10% → 1.1배)
  bonusInterval: 200,         // 보너스 점수 간격
  bonusScore: 20,             // 보너스 점수
} as const;

export const ARCHIEVE_DESC = {
  basicEffect: `점수 획득 속도 ${1 + ARCHIEVE_PARAMS.scoreMultiplierExtra}배`,
  specialAbility: `${ARCHIEVE_PARAMS.bonusInterval}점마다 +${ARCHIEVE_PARAMS.bonusScore}점 보너스`,
} as const;

// ── 글리치 (Glitch / SR) ──────────────────────────────────────────────
export const GLITCH_PARAMS = {
  collectInterval: 200,     // 분신 소환 점수 간격
  collectCount: 1,          // 분신이 한 번에 수집하는 특수 똥 개수
} as const;

export const GLITCH_DESC = {
  basicEffect: '잔상 분신이 특수 똥 수집',
  specialAbility: `${GLITCH_PARAMS.collectInterval}점마다 특수 똥 위치에 분신 소환`,
} as const;

// ── 노이즈 (Noise / SR) ───────────────────────────────────────────────
export const NOISE_PARAMS = {
  spawnShortening: 0.25,    // 특수 똥 생성 주기 단축 비율 (25%)
  reductionInterval: 200,   // 소환 감소 점수 간격
  reductionAmount: 2,       // 소환 감소 개수
  goldInterval: 30,         // 금똥 생성 간격 (기본 40의 75%)
  diamondInterval: 75,      // 다이아똥 생성 간격 (기본 100의 75%)
  topazInterval: 135,       // 토파즈똥 생성 간격 (기본 180의 75%)
} as const;

export const NOISE_DESC = {
  basicEffect: `특수 똥 생성 주기 ${NOISE_PARAMS.spawnShortening * 100}% 단축`,
  specialAbility: `${NOISE_PARAMS.reductionInterval}점마다 다음 소환 ${NOISE_PARAMS.reductionAmount}개 감소`,
} as const;

// ── 센티넬 (Sentinel / UR) ────────────────────────────────────────────
export const SENTINEL_PARAMS = {
  startShields: 2,          // 시작 보호막 개수
  chargeInterval: 300,      // 보호막 충전 점수 간격
  maxShields: 3,            // 최대 보호막 개수
} as const;

export const SENTINEL_DESC = {
  basicEffect: `시작 시 보호막 ${SENTINEL_PARAMS.startShields}개 보유 (피격 흡수 시 주변 똥 전기로 제거)`,
  specialAbility: `${SENTINEL_PARAMS.chargeInterval}점마다 보호막 1개 충전 (최대 ${SENTINEL_PARAMS.maxShields}개)`,
} as const;

// ── 나이트 (Knight / SR) ──────────────────────────────────────────────
export const KNIGHT_PARAMS = {
  beamKillBonus: 1,        // 검기로 제거한 일반 똥 1개당 추가 점수
  beamInterval: 100,       // 검기 발사 점수 간격
} as const;

export const KNIGHT_DESC = {
  basicEffect: `검기로 제거한 일반 똥 1개당 +${KNIGHT_PARAMS.beamKillBonus}점`,
  specialAbility: `${KNIGHT_PARAMS.beamInterval}점마다 3방향 검기 발사 — 경로 위 일반 똥 전부 소멸`,
} as const;

// ── 레거시 (Legacy / UR) ──────────────────────────────────────────────
export const LEGACY_PARAMS = {
  feverDuration: 6000,        // 시작 피버 지속 시간 (ms)
  legacyInterval: 600,        // 레거시 모드 발동 점수 간격
  legacyDuration: 6000,      // 레거시 모드 지속 시간 (ms)
  scoreExtra: 0.20,           // 레거시 모드 점수 추가분 (1.2배)
  burnChanceNormal: 0.40,     // 일반 불태우기 확률
  burnChanceLegacy: 0.90,     // 레거시 불태우기 확률
  burnCountNormal: 2,         // 일반 불태우기 개수
  burnCountLegacy: 4,         // 레거시 불태우기 개수
} as const;

export const LEGACY_DESC = {
  basicEffect: `시작 ${LEGACY_PARAMS.feverDuration / 1000}초 금똥 피버 + 황금 빗줄기 / 스폰마다 ${LEGACY_PARAMS.burnChanceNormal * 100}% 확률로 똥 ${LEGACY_PARAMS.burnCountNormal}개 불태워 소멸 (+10점)`,
  specialAbility: `${LEGACY_PARAMS.legacyInterval}점마다 ${LEGACY_PARAMS.legacyDuration / 1000}초간 레거시 모드: 점수 ${1 + LEGACY_PARAMS.scoreExtra}배 · 황금 빗줄기 강화 · 불태우기 ${LEGACY_PARAMS.burnChanceLegacy * 100}% 확률 ${LEGACY_PARAMS.burnCountLegacy}개 소멸`,
} as const;
