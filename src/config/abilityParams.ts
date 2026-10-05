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
  deletePoints: 35,         // 삭제한 똥 1개당 점수 (0 → 35, 사람 지시)
  specialPoopSlowdown: 40,  // 특수 똥 낙하 속도 감소 (px/s)
} as const;

export const HACKER_DESC = {
  basicEffect: '금똥·다이아똥 낙하 속도 감소',
  specialAbility: `${HACKER_PARAMS.deleteInterval}점마다 일반 똥 ${HACKER_PARAMS.deleteCount}개 터미널 삭제 (+${HACKER_PARAMS.deletePoints}점/개)`,
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
  slashPoints: 80,          // 벤 똥 1개당 점수 (0 → 80, 사람 지시)
  awake2SpecialBonus: 5,    // ★2+ 특수 똥 수집 추가 점수
  synergyBurstInterval: 2000,
  synergyBurstBonus: 150,    // 매화×매화 버스트 발동 시 고정 보너스 점수
} as const;

export const MAEHWA_DESC = {
  basicEffect: `이동 속도 +${MAEHWA_PARAMS.speedBonus}px/s`,
  specialAbility: `${MAEHWA_PARAMS.slashInterval}점마다 위쪽 똥 ${MAEHWA_PARAMS.slashCount}개 칼로 제거 (+${MAEHWA_PARAMS.slashPoints}점/개)`,
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
  basicEffect: `시작 시 보호막 ${SENTINEL_PARAMS.startShields}개 보유 (피격 흡수 시 주변 똥 전기로 제거, 제거된 똥 1개당 +10점)`,
  specialAbility: `${SENTINEL_PARAMS.chargeInterval}점마다 보호막 1개 충전 (최대 ${SENTINEL_PARAMS.maxShields}개)`,
} as const;

// ── 나이트 (Knight / SR) ──────────────────────────────────────────────
export const KNIGHT_PARAMS = {
  beamKillBonus: 40,       // 검기로 제거한 일반 똥 1개당 추가 점수 (1 → 40, 사람 지시)
  beamInterval: 100,       // 검기 발사 점수 간격
} as const;

export const KNIGHT_DESC = {
  basicEffect: `검기로 제거한 일반 똥 1개당 +${KNIGHT_PARAMS.beamKillBonus}점`,
  specialAbility: `${KNIGHT_PARAMS.beamInterval}점마다 3방향 검기 발사 — 경로 위 일반 똥 전부 소멸`,
} as const;

// ── 구미 (Gumi / UR) ──────────────────────────────────────────────────
export const GUMI_PARAMS = {
  foxFireInterval:    200,  // 여우불 발동 점수 간격
  foxFireCount:       9,    // 여우불 수 = 소환 금똥 수
  tailInterval:       150,  // 꼬리 1개 추가 점수 간격
  maxTails:           9,    // 최대 꼬리 수 (9개 = 무적 발동)
  invincibleDuration: 3000, // 무적 지속 시간 (ms)
  zapRadius:          320,  // 무적 종료 시 똥 제거 반경
  tailSpecialBonus:   5,    // 1,4,7번 꼬리: 특수 똥 수집 추가 점수
  tailSpeedBonus:     5,    // 2,5,8번 꼬리: 이동 속도 증가 (px/s)
  tailSpawnReduction: 1,    // 3,6,9번 꼬리: 일반 똥 소환 감소 개수
} as const;

export const GUMI_DESC = {
  basicEffect:    `${GUMI_PARAMS.tailInterval}점마다 꼬리 추가 (1,4,7번: 특수 똥 +${GUMI_PARAMS.tailSpecialBonus}점 / 2,5,8번: 속도 +${GUMI_PARAMS.tailSpeedBonus} / 3,6,9번: 소환 -1개) — 9개 시 3초 무적`,
  specialAbility: `시작 시 + ${GUMI_PARAMS.foxFireInterval}점마다 여우불 ${GUMI_PARAMS.foxFireCount}개 소환 — 꼬리마다 금똥 1개`,
} as const;

// ── 레거시 (Legacy / UR) ──────────────────────────────────────────────
export const LEGACY_PARAMS = {
  feverDuration: 6000,        // 시작 피버 지속 시간 (ms)
  legacyInterval: 600,        // 레거시 모드 발동 점수 간격
  legacyDuration: 4000,      // 레거시 모드 지속 시간 (ms)
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

// ── 무기 (Mugi / UR) — 검붉은 여의주 & 황금 변신 ──────────────────────
export const MUGI_PARAMS = {
  yeoijuInterval:       50,   // 여의주 생성 점수 간격 (변신 전)
  yeoijuGoldInterval:   200,  // 여의주 생성 점수 간격 (변신 후)
  yeoijuCollectRadius:  40,   // 여의주 수집 반경 (px) — 버프: 28→40, 쫓는 리스크 완화
  goldThreshold:        30,   // 황금 변신 필요 여의주 수 — 버프: 50→30
  yeoijuFallFactor:     0.75, // 여의주 낙하 속도 배율 — 버프: 후반 수집 난이도 완화
  revivalRechargeCount: 20,   // 부활 재충전 필요 여의주 — 버프: goldThreshold와 분리(50→20)
} as const;

export const MUGI_DESC = {
  basicEffect:    `${MUGI_PARAMS.yeoijuInterval}점마다 검붉은 여의주 낙하 — 매 수집마다 검붉은 번개 (경로 위 똥 제거 +10점) · ${MUGI_PARAMS.goldThreshold}개 달성 시 황금 변신 (이후 여의주마다 황금 번개, 전체 삭제 +20점)`,
  specialAbility: `부활 최대 1회 보유 / 총 3회 사용 · 게임 시작 시 1회 충전 · 여의주 ${MUGI_PARAMS.revivalRechargeCount}개로 재충전 · 피격 시 연꽃 발현 후 소생 (변신 중이면 변신 해제)`,
} as const;

// ── K (아빠 / SR) — 각성 에너지파 ──────────────────────────────────────
export const K_PARAMS = {
  gmhmInterval:      200, // 에너지파 발동 점수 간격 (초사이언 전)
  gmhmIntervalSs:    150, // 에너지파 발동 점수 간격 (초사이언 후 — 더 자주)
  beamPointsPerPoop: 50,  // 빔 경로·주변 제거 똥당 보너스 점수
} as const;

export const K_DESC = {
  basicEffect:    `${K_PARAMS.gmhmInterval}점마다 태이가 대각선 에너지파 발사 — 화면 중앙 반대쪽 위로 쏴 빔 경로상 똥 제거 (+${K_PARAMS.beamPointsPerPoop}점/개)`,
  specialAbility: `피격 시 태이가 초사이언 본체로 각성·부활 (1회) — 이후 ${K_PARAMS.gmhmIntervalSs}점마다 강화 에너지파 (굵은 빔 + 주변 번개 폭발로 광역 제거)`,
} as const;

// ── 테드 (R) — 하늘에서 떨어지는 체스 말 ─────────────────────
export const TED_PARAMS = {
  chessInterval:  60,   // 체스 말 낙하 점수 간격
  chessPieces:    10,   // 시트 프레임 수 (흑/백 × 폰·나이트·비숍·퀸·킹)
  chessSpread:    35,   // 수직에서 기울일 수 있는 최대 각도(도)
  chessSpeed:     1900, // 낙하 속도 (px/s) — 꽂히는 느낌이 나려면 눈이 못 따라갈 만큼 빨라야 한다
  chessHeight:    64,   // 화면에 그릴 높이 (px). 72 -> 64 (사람 지시: "조금만 작게")
  chessGroundY:   40,   // 화면 아래에서 이만큼 위가 바닥선 (플레이어 발밑과 같은 높이)
  chessStackMax:  10,   // 바닥에 이만큼 꽂히면 한꺼번에 사라진다
  // 땅에 박힌 느낌 — 밑동을 바닥선 아래로 묻고, 앞에서 흙더미가 경계를 덮는다
  chessSinkRatio:  0.10, // 착지 뒤 말의 축을 따라 더 파고드는 깊이 (말 키 대비)
  chessMoundScale: 1.0,  // 흙더미·균열 크기 (구운 텍스처 46x12 · 96x28 기준 배율)
  chessMoundPopMs: 140,  // 흙더미가 솟는 시간 (살짝 넘쳤다 돌아온다)
  chessCrackAlpha: 0.9,  // 균열 진하기
  chessLandDecoFadeMs: 150, // 말이 걷힐 때 흙더미·균열이 꺼지는 시간
  chessLandSmoke:   4,   // 착지 흙먼지 알갱이 수 (흙더미가 생겨 6 → 4)
                        // 60점 × 10 = 600점마다 한 사이클
  chessFadeMs:    260,  // 사라지는 시간
  // ── 흡수 타이밍 ──
  // **늦게 떠난 말은 짧게 간다** (dur_i = chessSuckMs - delay_i). 출발만 어긋뜨리고
  // 도착은 한 시점에 모은다. 지켜야 하는 부등식:
  //   (chessStackMax - 1) * chessFadeStep < chessSuckMs
  //   = 9 × 28 = 252  <  500 ✓   (말 10개 기준)
  chessFadeStep:  28,   // 걷힐 때 말마다 어긋나는 **출발** 간격 (도착은 동시다)
  chessSuckMs:    500,  // 말이 화면 가운데에 닿는 시각
  spreadHitstopMs: 70,  // 퍼지는 순간 히트스톱. vfx 의 상한 200ms 안이고 물리는 멈추지 않는다
  // ── 마무리: 말이 사방으로 퍼진다 ──
  // 모인 자리에서 바로 터져 나간다. 퍼지는 말이 지나간 자리의 똥만 지워진다
  // (화면 전체를 지우지 않는다 — 말이 안 닿은 구석은 살아남는다).
  spreadHoldMs:   90,   // 다 모인 뒤 멈칫하는 시간. 이게 있어야 '모였다가' 가 읽힌다
  spreadMs:      620,   // 퍼지는 기본 시간
  // 도달 거리는 **화면 밖**이다. 중앙에서 모서리까지가 hypot(W/2, H/2) 이므로 거기에
  // 말 높이를 더하면 어느 방향으로 가도 확실히 나간다. 화면 안에서 멈추면 말이 허공에서
  // 사라지는 것처럼 보인다 (이전 0.70 × 화면 폭이 그랬다).
  spreadReachMul: 1.00, // 위 거리에 곱하는 배수. 1 = 딱 화면 밖
  spreadReachVar: 0.30, // 말마다 거리 편차. **위로만** 흔든다 — 줄이면 화면 안에서 멈춘다
  spreadCullPad:  1.20, // 화면 밖 판정 여유 (말 크기 배수). 이만큼 나가면 즉시 회수한다
  spreadDurVar:  0.18,  // 말마다 시간 편차 (±비율)
  spreadStagger:  22,   // 말마다 출발이 어긋나는 간격(ms)
  spreadAngleJit: 0.26, // 방향 흔들림(rad). 0 이면 정확한 방사형이라 기계처럼 보인다
  spreadTrailMax:  3,   // 말 하나가 남기는 잔상 장수 (낙하의 chessTrailMax 와 별도)
  spreadTrailMs:  45,   // 잔상 간격(ms)
  // 퍼질 때는 **머리가 진행 방향 앞**이다 (낙하는 발이 앞 — 그쪽은 건드리지 않는다).
  spreadRotFollow: 1.0, // 진행 방향을 따르는 정도. 1 = 정확히 머리가 앞,
                        // 0 = 회전 없음. 아래로 가는 말이 뒤집히는 게 거슬리면 낮춘다
  spreadRotSteps:  0,   // 회전 각도 양자화 단계 수 (8 = 8방향). 0 이면 연속.
                        // 말 시트는 96x128 을 54x72 로 **줄여서** 그리므로 임의 각도로
                        // 돌려도 계단이 안 생긴다 → 기본은 0 (양자화 안 함)
  // ── 말이 모이는 자리 (화면 기준) ──
  // 플레이어를 따라다니지 않는다. 화면 좌표라 기기마다 같은 자리에 선다.
  // 세로 0.42 인 이유: 정확히 한가운데(0.5)면 플레이어의 회피 구역(H-80 부근)과 가깝고,
  // 더 위(0.3)면 점수 HUD 와 겹친다. 0.42 는 HUD 아래·플레이어 위의 빈 띠다
  gatherCenterX:    0.5,  // 화면 폭 대비
  gatherCenterY:    0.42, // 화면 높이 대비
  chessMaxAlive:  5,    // 동시에 **날고 있을 수 있는** 말 수 — 메모리 상한.
                        // 낙하 간격이 40점으로 줄어 큰 보너스 한 번에 마일스톤이 여러 개
                        // 터질 수 있다. 비행이 354~432ms 라 평시엔 2개를 안 넘지만
                        // 한 프레임에 몰리는 경우를 위해 한 칸 올렸다 (말 하나가 최대 12오브젝트)
  // ── 착지 위치 분산 (층화 추출) ──
  // 매번 독립 균등 난수로 뽑으면 7개가 근처에 몰리는 조합이 자주 나온다.
  // 착지 구간을 chessStackMax 칸으로 나누고 **칸을 섞은 주머니에서 하나씩** 꺼내
  // 그 칸 안에서만 위치를 잡는다 → 7개가 반드시 서로 다른 칸에 꽂힌다.
  chessLandMargin: 30,  // 화면 좌우 여백(px). 좁은 화면에서는 폭의 8% 로 줄어든다
  chessLandJitter: 0.50,// 칸 안에서 쓰는 폭 (칸 너비 대비 0~1). 1 에 가까울수록 불규칙해지지만
                        // 이웃 칸과 붙을 수 있다 — 최소 간격은 칸너비 × (1 - 이 값)
  chessLandMinGap: 34,  // 이미 꽂힌 말과의 최소 간격(px). 이보다 가까우면 같은 칸에서 다시 뽑는다.
                        // 칸보다 크면 재시도가 절대 성공 못 하므로 코드에서 칸너비의 80% 로 깎는다
  chessLandRetry:  4,   // 다시 뽑는 횟수 상한
  chessLandYDrop:  10,  // 착지 y 를 0~이만큼 아래로 흔든다 — 칸이 말보다 좁은 화면에서
                        //  겹친 말이 '충돌'이 아니라 '앞뒤'로 읽히게 한다
  // 바람을 가르는 느낌 — 속도감은 본체가 아니라 뒤에 남는 것이 만든다
  chessTrailMs:   32,   // 잔상을 남기는 간격 — 촘촘할수록 낱장이 아니라 번짐으로 읽힌다
  chessTrailMax:  8,    // 한 번 낙하가 남길 수 있는 잔상 총 장수 — 스프라이트 상한
  chessTrailFade: 110,  // 잔상이 사라지는 시간 — 길면 지나간 자리에 말이 서 있는 것처럼 보인다
  chessTrailAlpha: 0.26,// 잔상 알파
  chessWindLen:   3.4,  // 바람선 길이 (말 높이 대비)
  chessWindWide:  0.5,  // 바람선 두께 (말 높이 대비)
  chessWindAlpha: 0.85, // 바람선이 가장 짙을 때의 알파
  // 앞쪽 불꽃 — 운석 머리에 불이 붙는 그것. vfx 의 여우불 루프를 착색해 쓴다
  // 앞 끝 공기 가르기 (TedAbility makeAirBow/stepAirBow) — 불은 메인이 아니다. 열기 점 + V자 공기 갈래, 기본 파티클만
  chessFireLead:  0.18, // 열기 점·갈래를 말 앞 끝에서 앞으로 띄우는 거리 (말 높이 대비)
  // 공기 갈래 — 진행 반대 방향에서 벌어지는 각도(도). 줄 수 = 원소 수. 말 몸통을 감싸 바깥으로 나와야 보인다
  // (좁고 짧으면 말 실루엣 안에 묻혀 안 보였다 — 말 밑에 그려 안쪽은 말이 가리고 몸통 밖으로 나온 부분만 보인다)
  chessBowAngles: [-32, 32] as readonly number[],
  chessBowLen:    1.0,  // 갈래 길이 (말 키 대비)
  chessBowWidth:   2,   // 갈래 두께 (px)
  chessBowAlpha: [0.45, 0.7] as readonly number[],     // 갈래 알파 (평소, 소닉붐 뒤) × 낙하 짙기
  chessBowBoost:   1.3, // 소닉붐 뒤 갈래 길이 배율 (1.3 이내)
  chessBowBoostMs: 120, // 소닉붐 뒤 길어지기까지
  chessBowGlow: [0.11, 0.14] as readonly number[],     // 열기 점 배율 (평소, 소닉붐 뒤) — proc-glow 192px
  chessBowGlowAlpha: [0.45, 0.75] as readonly number[], // 열기 점 알파 (평소, 소닉붐 뒤)
  chessPoopPoints: 20,  // 낙하 경로에서 깨뜨린 똥 하나당 점수
  spreadBonusPoints: 100, // 퍼짐 발동 **정액** 보너스. 지운 똥 개수와 무관하다.
                        // 이 점수로 다시 낙하가 걸리지 않게 TedAbility 가 먼저
                        // lastChessScore 를 올린 뒤 준다 (smashPoops 와 같은 가드)
  chessHitRadius:  26,  // 경로 판정 반경 (px) — 말 반폭 + 똥 반폭

  // ── 액티브 스킬 "어센트" (누르는 스킬) ──────────────────────────
  // 흑백 3x3 큐브가 층별로 돌다가 한 면이 순백/순흑으로 맞춰진다. **랜덤**이고
  // 나온 색이 뒤에 붙는 효과를 가른다. 즉시 전체 제거는 **양쪽 공통** —
  // 안 그러면 "흑 뽑으면 손해" 가 되어 슬롯머신이 된다.
  ascentChargeScore: 5000, // 충전 한 칸에 필요한 점수 (화면 점수 기준)
  ascentMaxCharges:  3,    // 쌓아 둘 수 있는 최대 칸 (메이플 어센트와 같다)
  ascentStartCharges: 1,   // 판 시작부터 한 칸 차 있다 — 첫 5,000점 전에도 한 번 쓸 수 있게
  ascentPoopPoints:  40,   // 액티브가 지운 똥 하나당 점수 (저장소 기준값)

  // ── 컷신 — 수묵 (대표 승인) ─────────────────────────────────────
  // 어둠 속 흰 눈 → 얼굴 → 눈빛 폭발 → 화선지 붓질·전신 → 와이프·소용돌이 → 섬광·각성 → 컬러 테드 → 큐브 → 걷힘.
  // 장면별 박자는 아래 TED_PARAMS.ink, 그림 자리는 TedAbility 의 TED_INK.
  // 이전 연출(corner·approach·kinesis 컷인)은 정리했다 (2026-10 출시 묶음)
  // 큐에 거는 시각 (ms, 발동부터 누적). 무적 = endMs
  ascentTiming: {
    revealMs:     2640,  // = ink.cubeAt + 4 × cubeFrameMs — 큐브 손동작 마지막 수 (확정·히트스톱·흔들림)
    effectMs:     2770,  // = revealMs + 130 — 마지막 칸에 머문 뒤, 화면이 아직 가려진 동안 효과 (화면 똥 제거)
    outMs:        2770,  // = effectMs — 같은 순간 검정·s6 가 걷히기 시작 → 게임 복귀
    endMs:        2970,  // = outMs + 200 — 다 걷힘. 여기까지 무적. 소환 큐브(summonMs)는 여기서 시작
  },

  // 수묵 (ink) — ms 는 발동부터 누적. 그림은 builder 판 (ddong-fx-work/ted-ascent/ink/prod23), 자리는 TedAbility 의 TED_INK.
  // 순서 (2.97초 — 대표 지시 2026-10-05 순서 바꿈. 시안 ddong-fx-work/ted-ascent/ink/reorder/reorder_mock.py):
  //   발동 즉시 검정(blackInMs) + 흰 눈동자 켜짐 0~60 → 그 둘레로 눈매·눈썹 그어짐 60~300 → 세트 완성·일렁임 ~400
  //   → 세트가 통째로 얼굴 두 눈 자리로 옮겨 가며 줄고 얼굴(s2 다 뜬 칸)이 어둠에서 켜짐 400~750 (세트는 녹아듦)
  //   → 눈빛 확 밝아짐 750~850 — 그 정점이 그대로 화선지 색으로 번진다 (paperAt, **흰 섬광 아님**)
  //   → 세로 붓질·튀김·전신 850~1370 → 와이프 1370~1520 (걷히며 빈 화선지) → 소용돌이 → 검정 1520~1670
  //   → 검정에서 바로 섬광·각성(sC)+먹 터짐 1670~2070 (각성 표정 0칸 100ms) → 섬광·컬러 2070~2220
  //   → 바람·큐브 2220~2770 (마지막 수 2640 · 펑·히트스톱 · 머묾 130ms) → 걷힘 2770~2970 → 게임 (소환 큐브 8초 시작)
  //   뺀 것 (대표 결정): 결과 컷(s8)·그 앞 섬광, 1-B 자세 변화(sB), 1-A 대각선 붓질(sA_stroke), 3 빨려 듦(둥근 얼굴),
  //   화선지 페이드인(paperInMs — 화선지는 이제 눈빛에서 번져 나온다)
  ink: {
    blackInMs:        80,  // 발동 즉시 게임 위로 검정이 깔리는 시간 (흰 눈동자가 같이 켜진다)
    // 2 — 흰 눈 세트 (눈동자 + s3 눈매·눈썹) — 완전 검정 위, s3 눈매 자리에서. 눈동자가 먼저 켜지고(irisOnMs)
    //     곧바로 그 둘레로 눈매·눈썹이 그어진다(eyesAt, s3 8칸). 구운 눈동자는 s3 홍채가 차는 3~6칸 동안 넘겨준다
    pupilAt:           0,
    irisOnMs:         60,
    eyesAt:           60,
    // 3 — 세트가 통째로(같은 변환) 얼굴(s2 다 뜬 칸) 두 눈 자리로 옮겨 가며 줄어들고, 그 둘레로 얼굴이 어둠에서 켜진다
    //     (곱셈 틴트 검정 → 원래 밝기). 세트는 얼굴이 밝아지는 만큼 녹아든다. 옮겨 감 = 켜짐 박자 (Sine.easeInOut)
    faceAt:          400,
    faceLitTo:       750,
    facePush:       0.05,  // 얼굴 느린 밀어 들어가기 (faceAt → paperAt)
    // 4 — 눈빛이 확 밝아짐 (pupilSurgeAt → paperAt). 그동안 각성(sC) 두 눈 자리로 살짝 맞춤 (판 차이 3~6px)
    pupilShiftAt:    750,
    pupilSurgeAt:    750,
    //   흰 눈 세트 — 눈매 8칸 박자 · 맥동
    eyesFrameMs:      30,  // 8칸 = 240ms, 이후 마지막 칸 맥동 (세트 완성 모습 100ms)
    eyesPulseMs:     160,
    //   홍채 일렁임 — 눈마다 ADD 발광 + 홍채 아지랑이 복제 (위치·배율·알파만, 필터 없음). 눈동자가 켜질 때부터
    irisGlowAlpha:  0.55,  // 평소 발광 알파 (밝아짐 때 1 까지)
    hazeAlpha:      0.30,  // 아지랑이 복제 알파
    hazeShiftPx:     1.5,  // 아지랑이 좌우 떨림 (띠 px)
    shimmerRampAt:   300,  // 세트가 완성된 뒤부터 일렁임이 세진다 → paperAt 에 shimmerAmpMax 배
    shimmerAmpMax:   2.5,
    surgeScale:      2.6,  // 4 눈빛 밝아짐 끝에 발광 크기 (평소 대비 +배)
    // ⑤→① 이음새 — 눈빛 폭발의 정점(마지막 glowToPaperMs)이 화선지 색 덮개로 번진다 (ease-in, 눈·얼굴 위).
    //   paperAt 에 덮개가 다 차고, 그 순간부터 바탕이 화선지 · 눈 세트·얼굴은 꺼진다. 흰 섬광은 ⑥ 에만 남긴다
    paperAt:         850,
    glowToPaperMs:   100,
    // 장면 1 — 화선지 위 붓질 · 먹 튀김 · 형체 · 연기 (화선지는 이미 깔려 있다)
    strokeAt:        850,  // s7 붓질 8칸 — 세로로 돌려 위에서 아래로 내리긋는 한 획 (TedAbility TED_INK.strokeRot)
    strokeFrameMs:    24,
    strokeOutMs:     110,  // 형체가 잡히는 동안 붓질이 스며 사라진다
    splashAt:       1020,  // s7 먹 튀김 6칸 — 이 순간 전신이 형체를 잡기 시작
    splashFrameMs:    36,
    formAt:  [1020, 1115, 1210] as readonly number[], // s1 형체 3단계가 바뀌는 시각
    formFadeMs:       65,
    smokeAt:        1300,  // s1 먹 연기 반복 시작 (형체 → 연기 크로스페이드) — 와이프가 덮을 때까지
    smokeFrameMs:     80,
    // 1-A — 검은 먹 덩어리가 화면을 가리며 지나감 (sA_wipe, 3·4칸이 화면 97% 를 덮는다 — 그 밑에서 전신이 빠진다).
    //       150ms 에 8칸이면 칸당 19ms 라 뭉개진다 → 6칸만(1·6칸 건너뜀) 25ms 씩
    wipeAt:         1370,
    wipeFrameMs:      25,
    wipeFrames: [0, 2, 3, 4, 5, 7] as readonly number[],
    wipeCoverFrame:    3,  // 이 시트 칸부터 전신(s1)을 감춘다
    // 장면 2 — 소용돌이가 빈 화선지를 삼켜 완전 검정. 150ms — 6칸만(1·4칸 건너뜀) 25ms 씩
    swirlAt:        1520,
    swirlFrameMs:     25,
    swirlFrames: [0, 2, 3, 5, 6, 7] as readonly number[],
    swirlGrow:       2.9,  // 소용돌이 마지막 배율 (화면을 덮는다)
    darkAt:         1590,  // 검정이 깔리기 시작 → darkAt + 80 에 완전히 덮는다 (= awakeFlashAt)
    //   ②→⑥ 이음새 — 완전 검정 위에서 곧바로 흰 섬광(코드, 20ms 에 차오름) → 각성 표정. 그 사이 얼굴은 그리지 않는다
    //     → 각성 표정 (sC_face 0칸) → 먹 터짐 1~4칸 → 0칸. sC_burst 는 섬광 순간 위에
    awakeFlashAt:   1670,  // = darkAt + 80. 흰 화면 (20ms 에 차오름)
    awakeAt:        1730,  // 각성 표정 + 끊듯이 걷힘(flashFadeMs)
    awakeHoldMs:     100,  // 0칸 유지 — 각성 표정이 읽히는 시간
    awakeLoopMs:      45,  // 1~4칸 한 바퀴 (180ms) 뒤 0칸으로 (섬광까지)
    awakeBurstMs:     40,  // sC_burst 4칸
    // 5 — 각성에서 바로 섬광 → 컬러 테드 + 먹 튀김 (중심 = 각성 얼굴 두 눈 중점)
    flashAt:        2070,
    flashMs:          50,  // 흰 화면 유지
    flashFadeMs:      30,  // 거의 끊듯이 걷힌다 — 컬러 테드 위에 회색 막이 남지 않게
    revealAt:       2120,  // = flashAt + flashMs. 섬광이 걷히는 순간 컬러 원색 100%
    revealFrameMs:    50,
    // s4 에서 쓰는 칸 — 0(흰 폭발)·1(회색 반쯤)은 탁해서 건너뛰고 컬러 2·3칸만
    revealFrames: [2, 3] as readonly number[],
    burstMs:         200,  // 진한 먹이 바깥으로 날아가 화면 밖으로 빠지는 시간 (Cubic.Out)
    burstFrom:      1.39,  // 먹 폭 (원본 폭 480 대비) 시작
    burstTo:        4.86,  // 끝 — 가운데 구멍이 화면 대각선 반보다 커진다 (480x720 에서 구멍 반지름 467 > 433)
    // 장면 6 — 살아 있는 컬러 테드 → 큐브 손동작 → 마지막 수
    windAt:         2220,
    windFrameMs:      60,  // s5 4칸 한 바퀴
    cubeAt:         2460,
    cubeFrameMs:      45,  // s6 5칸 — 마지막 칸(2640 = ascentTiming.revealMs)에 머문 뒤 걷힌다
  },

  // 어센트 효과 (결과 하나 — 대표 결정, 백/흑 분기·체인 라이트닝 삭제)
  // 컷신 뒤 머리 옆 소환 큐브가 summonMs 동안 돈다. 그동안 떨어지는 체스 말은 낙하 거리의 sonicAt 에서 소닉붐 —
  // 원뿔 증기 링 + 둥근 파장(닿은 똥 삭제, 체스 낙하와 같은 점수) → 남은 거리를 sonicSpeedMul 배 속도로
  summonMs:          8000, // 소환 큐브 유지
  summonCubeSize:      32, // 머리 옆 큐브 **몸통** 폭(px) — 충전 큐브 시트(72px 칸, 몸통 46px)를 칸 50px 로 줄여 쓴다
  // 소환 큐브는 충전 큐브와 같은 실제 수순(섞인 상태 → 앞면 검정 9/9)을 재생한다 — 이 비율 시점에 완성, 남은 동안 완성 모습
  summonSolveAt:     0.92,
  // 소환 큐브가 도는 동안 직접 떨어뜨리는 말 — 점수 마일스톤 낙하(60점 ≈ 생존 6초)와 별도.
  // 마일스톤만으로는 8초에 소닉붐이 한두 번이고, 컷신 직후 화면 똥이 다 지워진 뒤라 파장이 거의 빈 화면을 지났다
  summonFirstDropMs:  500, // 효과 발동 뒤 첫 말 (화면이 비었다가 똥이 다시 내려오기 시작할 즈음)
  summonDropEveryMs: 1000, // 그다음 간격 → 8초에 약 8개 (+ 마일스톤 낙하)
  sonicAt:            0.5, // 소닉붐 지점 (낙하 거리 비율)
  sonicSpeedMul:      1.2, // 소닉붐 뒤 속도 — 붐 순간 속도의 이 배로 남은 거리를 등속 (아주 살짝 빨라지는 정도)
  sonicRingR:         140, // 파장 최대 반경(px)
  sonicRingMs:        250, // 파장이 퍼지는 시간 (Cubic.Out)
  sonicRingBand:       18, // 판정 띠 반폭(px) — 링 선 + 똥 반폭. 매 프레임 지난 반경~지금 반경 ± 띠
  sonicRingMax:         4, // 동시 파장 상한 (넘으면 가장 오래된 것을 끝낸다)
  sonicConeMs:        140, // 원뿔 증기 링이 터지는 시간 (응결 원반·바람 줄기는 builder 충격파 시트에 들어 있다)
  sonicRimAlpha:     0.28, // 충격파 바깥 보강 겹(옅은 어두운 띠) 알파 — 밝은 구름 위 대비
  sonicTrailMs:        32, // 붐 뒤 잔상 간격 (평소 chessTrailMs 와 같게)
  sonicTrailMax:        4, // 붐 뒤 잔상 추가 장수 (붐 앞에서 낙하 몫 8장을 다 쓰므로 붐 뒤 몫)
  sonicWindLen:       1.2, // 붐 뒤 바람선 길이 배율
} as const;

export const TED_DESC = {
  basicEffect:    `${TED_PARAMS.chessInterval}점마다 체스 말 하나가 하늘에서 비스듬히 날아와 바닥에 꽂힌다 — 경로상 똥 제거 (+${TED_PARAMS.chessPoopPoints}점/개). 말 ${TED_PARAMS.chessStackMax}개가 쌓이면 화면 가운데로 모였다가 사방으로 퍼진다`,
  specialAbility: `**액티브 — 어센트.** 시작 시 ${TED_PARAMS.ascentStartCharges}칸, ${TED_PARAMS.ascentChargeScore}점마다 한 칸 충전(최대 ${TED_PARAMS.ascentMaxCharges}칸), 버튼 또는 스페이스로 발동. 수묵 컷신 동안 무적, 끝나면 화면의 똥을 모두 지우고(+${TED_PARAMS.ascentPoopPoints}점/개) 큐브가 ${TED_PARAMS.summonMs / 1000}초 동안 머리 옆을 돌며 ${TED_PARAMS.summonDropEveryMs / 1000}초마다 체스 말을 떨어뜨린다 — 그동안 떨어지는 체스 말은 낙하 도중 소닉붐을 일으켜 둥근 파장으로 주변 똥을 지우고(+${TED_PARAMS.chessPoopPoints}점/개) 남은 거리를 ${TED_PARAMS.sonicSpeedMul}배 빠르게 내리꽂는다. 큐브가 도는 동안에는 다시 발동할 수 없다`,
} as const;

// ── 레드 (Red / SR) — 참새 동료 ──────────────────────────────────
// 시트 목록이 여기 있는 이유: `character.ts`(데이터)와 `RedAbility`(행동)가 **둘 다**
// 이걸 봐야 한다. 능력 파일에 두면 데이터가 행동을 import 하게 되고, character.ts 에
// 문자열로 박으면 둘이 따로 놀다 어긋난다.
export const RED_SPARROW_SHEETS = [
  'sparrow_scarf_128x128.png',
  'sparrow_cap_128x128.png',
  'sparrow_cape_128x128.png',
  'sparrow_goggles_128x128.png',
  'sparrow_helmet_128x128.png',
] as const;
/**
 * **위를 보고 나는** 참새 — 발사돼 올라갈 때 쓴다. 궤도는 옆모습 시트 그대로다.
 *
 * 프레임이 176x144 인 이유: 전환에서 크기가 튀지 않으려면 **몸통**이 옆모습과 같아야
 * 하는데, 위에서 본 새는 날개를 좌우로 펼쳐 봉투가 163x118 이 된다 — 128 을 넘는다.
 * 화면 배율은 옆모습과 같은 0.25 를 그대로 쓰므로 프레임이 큰 만큼 그림이 커져 몸통이 맞는다.
 * 조립: `scripts/build-sparrow-up.py` (개체별 몸통 배율 0.254~0.288)
 */
export const RED_SPARROW_UP_SHEETS = [
  'sparrow_scarf_up_176x144.png',
  'sparrow_cap_up_176x144.png',
  'sparrow_cape_up_176x144.png',
  'sparrow_goggles_up_176x144.png',
  'sparrow_helmet_up_176x144.png',
] as const;
export const RED_TREX_SHEET  = 'trex_256x192.png';
export const RED_ROBOT_SHEET = 'robot_192x192.png';
/** `character.ts` 의 `extraFxSheets` 에 그대로 들어간다 (GameScene preload 가 순회 로드) */
export const RED_SHEETS: string[] = [
  ...RED_SPARROW_SHEETS, ...RED_SPARROW_UP_SHEETS, RED_TREX_SHEET, RED_ROBOT_SHEET,
];

// 참새 5마리가 머리 위 타원 궤도를 돈다. 일정 점수마다 한 마리가 위로 날아가
// 일반 똥 하나를 부수고 소모된다. **빗나가도 소모된다** — 그래서 발사 간격이 짧다.
// 다섯이 다 비면 마무리가 나온다 (티라노 광역 / 낮은 확률로 로봇 전체).
export const RED_PARAMS = {
  // ── 궤도 ──
  sparrowCount:    5,    // 동시에 도는 참새 수 = 마무리까지 필요한 발사 횟수
  sparrowFrame:    32,   // 참새 시트의 화면 표시 폭(px). 프레임 128px 기준 → 배율 0.25
                         // 24px 이면 장식이 뭉개져 5종이 구별되지 않는다 (실측: 32px 부터 구별)
  orbitRx:         52,   // 타원 가로 반경 — 머리 위를 도는 원.
                         // **최소 간격에는 영향이 없다** (아래 orbitArcEven 참고).
                         // 링 전체가 넓어 보이는 효과만 있고, 대신 플레이어가 화면
                         // 가장자리(x=23)에 붙으면 바깥쪽 참새가 그만큼 더 잘린다
  // 위상을 **각도**로 등분하면 납작한 타원의 좌우 끝에 참새가 뭉친다 —
  // 등각 최소 간격은 `1.176 x orbitRy` 이고 **orbitRx 와 무관하다** (좌우 끝의 두
  // 마리는 x 가 같고 y 만 다르다). 그래서 각도가 아니라 **호 길이**로 등분한다.
  // 46~62 어느 rx 에서도 등각 14.1px → 등호장 18.4~18.7px (+30%).
  // 부수 효과로 도는 속도도 고르게 된다 (등각이면 좌우 끝에서 느려져 머문다).
  orbitArcEven:  true,   // false 면 예전 등각 분배로 돌아간다
  orbitRy:         12,   // 세로 반경. 납작해야 '누워서 도는 원'으로 읽힌다
  // **머리 꼭대기는 표시 상자의 위가 아니다.** red_front.webp 는 캔버스 위쪽 17.3% 가
  // 빈칸이라(표시 80px 기준 13.8px), 상자 위에서 재면 참새가 그만큼 더 떠 보였다.
  // 세 자세(front/left/right) 중 **가장 작은** 여백을 쓴다 — 어느 자세에서도 안 파고든다.
  // `scripts/measure-orbit.py` 로 다시 뽑을 수 있다.
  orbitHeadInsetH: 0.17, // 표시 높이 대비 머리 위 빈칸 비율
  orbitAbove:      25,   // **머리 꼭대기**에서 궤도 중심까지(px).
                         // 아래쪽 반원의 참새가 가장 내려오는 지점이
                         //   orbitAbove - orbitRy - 참새 아래폭(11.8px)
                         // 만큼 머리 위에 남는다 → 25-12-11.8 = 1.2px 여유
  orbitMs:         2600, // 한 바퀴 도는 시간
  orbitBackScale:  0.85, // 뒤쪽 반원에서의 축소율 — 원근을 만든다 (depth 를 못 쓰는 대신)
  orbitBackAlpha:  0.82, // 뒤쪽 반원에서의 알파
  // ── 발사 ──
  sparrowInterval: 50,   // 이 점수마다 한 마리 발사
  sparrowSpeed:    620,  // 위로 날아가는 속도 (px/s)
  sparrowTurnMs:   90,   // 발사 순간 옆모습 → 위 보는 모습 교차 페이드 시간(ms).
                         // 0 이면 즉시 교체 (그러면 실루엣이 툭 바뀌는 게 보인다)
  sparrowHitR:     30,   // 똥 판정 반경(px). **그림에서 나온 값이 아니다** — 조율값이다.
                         // 실측: 서로 닿기만 해도 맞는 값이 참새 반폭 14.1 + 똥 반폭 20.0
                         // = 34.1px, **몸통**끼리 닿는 값이 옆 27.1 / 위 27.4px.
                         // 22 → 30 (사람 지시: "레드가 점수내기 어렵다").
                         // 30 은 몸통 접촉(27.4)보다 살짝 넓고 날개 끝(40.4)보다는 훨씬
                         // 좁다 — 20px 떨어진 날개 끝으로 똥을 부수는 건 그림과 안 맞는다
  sparrowPoints:   40,   // 참새가 부순 똥 하나당 점수. 30 → 40 (2026-09-27 사람 지시: "레드·하이디는 전부 40")
                         // 한 마리가 **경로의 똥을 전부** 부수므로 한 번 발사의 성과가
                         // 0/1개에서 0~여러 개가 됐다 — 점수 총량은 개수 쪽이 더 키운다
  // ── 마무리: 티라노 ──
  robotChance:     0.36, // 마무리가 로봇으로 대체될 확률. 나머지는 티라노.
                         // 0.18 → 0.36 (두 배). 세 번에 한 번꼴로 로봇이 나오므로
                         // **티라노와의 차별이 더 중요해졌다** — 아래 반경 참고
  trexFrame:       96,   // 티라노 표시 높이(px). 프레임 192px 기준 → 배율 0.5
  trexWalkMs:      900,  // 화면 밖에서 플레이어 옆까지 걸어오는 시간
  trexRoarMs:      520,  // 포효 유지 시간 (시트 4~5프레임)
  trexLeaveMs:     700,  // 포효 후 걸어나가는 시간
  // 포효 반경은 **화면 폭 비율**이다. 고정 px 는 RESIZE 스케일에서 기기마다 체감이
  // 달라진다 — 180px 이 360폭에선 화면의 36%, 430폭에선 26%를 덮었다.
  // 0.78W 면 어느 폭에서도 53~56% 로 고르다. 로봇(화면 전체 100%)과 "화면 절반 남짓 vs
  // 화면 전체" 로 갈린다 — robotChance 를 두 배로 올려 로봇이 흔해진 만큼 이 차이를
  // 남겨 둬야 한다. 실측 커버리지: 0.70W 49~51% / 0.78W 54~56% / 0.82W 56~58%
  trexRadiusW:    0.78,  // 포효 광역 반경 (화면 폭 대비)
  trexStandGap:    86,   // 티라노가 플레이어에게서 떨어져 서는 거리(px).
                         // **반경과 무관하다** — 몸이 겹치지 않게 하는 거리라서
                         // 반경을 키운다고 더 멀리 설 이유가 없다
  trexRingMs:      380,  // 파동 링이 최대 반경까지 퍼지는 시간
  trexRingDelayMs:  90,  // 둘째 겹이 늦게 출발하는 간격
  trexRingInner:  0.72,  // 둘째 겹의 최종 반경 (첫 겹 대비). 안쪽에 한 겹 더 보이게
  trexPoints:      40,   // 포효로 지운 똥 하나당 점수. 25 → 40 (2026-09-27 사람 지시: "레드·하이디는 전부 40")
  // ── 마무리: 로봇 ──
  robotFrame:      160,  // 로봇 **프레임** 표시 높이(px). 시트 192px 기준 → 배율 0.8333.
                         // 120 → 132 → 160. 프레임 안 그림이 136x169 밖에 안 되므로
                         // **보이는 크기는 113x141px** — 프레임 값의 0.88 이다.
                         // 플레이어(80px)의 1.76배, 티라노(프레임 96)의 1.67배.
                         // (플레이어의 정확히 2배로 보이게 하려면 182 여야 한다)
                         // **원점이 중앙이다** (티라노처럼 발바닥이 아니다) — 로봇은
                         // 바닥선에 서지 않고 화면 중상단(H*0.42)에 떠서 베기 때문에,
                         // 커져도 땅에 파묻히거나 뜨지 않고 위아래로 고르게 커진다.
                         // 가장 좁고 짧은 화면(320x568)에서도 예비 동작 칼끝이 y=168,
                         // 아래끝이 y=309 로 화면 안이다 (검수: robot-stage-check.py)
  robotFallMs:     420,  // 하늘에서 내려오는 시간
  robotRaiseMs:    260,  // 검을 들어올리는 예비 동작 — 짧고 강한 파열의 앤티시페이션
  robotSlashMs:    180,  // 베는 순간
  robotLeaveMs:    520,  // 베고 나서 사라지는 시간
  robotPoints:     40,   // 전체 삭제로 지운 똥 하나당 점수. 30 → 40 (2026-09-27 사람 지시: "레드·하이디는 전부 40")
} as const;

// ── 하이디 (SR) — 동반자 강아지 "뿌요" ──────────────────────────────────────
// 시트 목록이 여기 있는 이유는 레드와 같다: `character.ts`(데이터)와 `HeidiAbility`(행동)가
// 둘 다 봐야 하는데, 능력 파일에 두면 데이터가 행동을 import 하게 된다.
/**
 * **칸 크기가 동작마다 다르다.** 가로도 세로도 다르다 —
 * `scripts/build-puyo-sheet.py` 가 **모든 시트에 같은 배율**을 쓰기 때문이다.
 * 가로가 긴 자세(웅크림·도약·고속 이동)에서 개를 줄이는 대신 칸을 넓혔다.
 * 예전에는 개를 줄여서 시트마다 49~84px 로 제각각이었고, 동작이 바뀔 때마다
 * 개가 커졌다 작아졌다 했다. 표시할 때 칸 비율을 그대로 반영한다.
 */
export const HEIDI_PUYO_SHEETS = {
  walk:   'puyo_walk_128x128.png',
  idle:   'puyo_idle_128x128.png',
  crouch: 'puyo_crouch_136x128.png',
  jump:   'puyo_jump_152x128.png',
  kick:   'puyo_kick_128x128.png',
  wall:   'puyo_wall_128x128.png',
  // 벽에 붙어 **던지는** 3컷. 처음엔 `wall` 의 3번(앞발 뻗음)을 재활용했는데
  // 원래 "벽을 차고 나가는" 동작이라 **차는 걸로 읽혔다** (사람 실기 판정).
  // 뒷발은 벽에 박아 두고 앞발만 던지는 그림이라 그 혼동이 없다
  throw:  'puyo_throw_128x128.png',
  // 공중에서 **인을 맺는** 6컷 (정면). 변신 직전에 쓴다 — 합장 → 깍지 → 한 발 세움 →
  // 눈 감고 집중 → 눈 뜨며 털이 솟는다. 변신한 캐릭터는 HEIDI_CLONE_SHEETS 의 `seal` 을
  // 쓰고, 그게 없으면 sheetFor 가 이 그림으로 떨어진다
  seal:   'puyo_seal_128x128.png',
  // **아랑아** — 옆으로 누운 회오리 드릴 8컷 (끝이 오른쪽). 기본 발동의 돌진·벽 튕김·
  // 내리꽂기가 전부 이것. 코드는 드릴 끝을 가는 방향으로 겨누기만 하고, 도는 것은 그림이
  // 맡는다. 캐릭터별 색 판본은 HEIDI_CLONE_SHEETS 의 `tsuga` (scripts/tsuga-tint.py)
  tsuga:  'tsuga_160x112.png',
  // 고속 이동 전용. `kick` 을 재활용했더니 **차는 걸로 읽혔다** — 발차기는 발이 앞서고
  // 육구가 정면을 보지만, 고속 이동은 머리가 앞서고 네 다리가 뒤로 붙는다.
  // 출발 섬광 · 늘어난 잔상 · 도착 섬광이 그림 안에 들어 있다
  // 등을 보이고 머리가 위를 향한 그림이다 — 코드가 **가는 방향으로 회전**시킨다.
  // 옆모습이면 좌우 뒤집기로 방향이 둘뿐이라 대각선 이동이 어색했다
  // (레드의 '위 보는 참새' 와 같은 구조)
  dash:   'puyo_dash_128x160.png',
} as const;

/**
 * 투척 무기 3종이 든 시트 한 장. 프레임 순서 = 아래 {@link HEIDI_WEAPON} 의 값.
 *
 * `FX_PARTICLE_ASSETS`(전 캐릭터 공용 로딩)에 **안 넣었다** — 하이디를 안 고른 판에서도
 * VRAM 을 먹는다. 하이디 전용 `extraFxSheets` 로 간다 (192x64, 0.047MB).
 */
export const HEIDI_WEAPON_SHEET = 'puyo_weapon_64x64.png';

/** 시트 안 프레임 번호. 세 무기는 그림이 아니라 **하는 일**이 다르다 */
export const HEIDI_WEAPON = {
  // 시트의 0·1번(수리검·쿠나이)은 옛 분신술 것이라 안 쓴다 — 미나토 비뢰신 표식만 남았다
  marker:   2,   // 삼지창 · 안 지움. 비뢰신 순간이동의 목적지
} as const;
/**
 * `character.ts` 의 `extraFxSheets` 에 그대로 들어간다 (하이디를 고른 판에서만 올라간다).
 *
 * 아랑아는 회오리 드릴 전용 시트(`tsuga`)를 쓴다. 옛 몸 말기 회전 시트(`puyo_spin`)는
 * 쓸 데가 없어 지웠다 (2026-09-27).
 */
/**
 * **분신이 입는 캐릭터.** 분신술에서 6마리가 각자 다른 닌자로 나온다 —
 * 흰 강아지 일곱이 똑같이 붙어 있으면 누가 누군지 안 읽힌다.
 *
 * 분신이 실제로 쓰는 동작은 셋뿐이다 (`fly` 는 `dash` 시트를 같이 쓴다):
 *   fly(=dash) → perch(=wall) → throwing(=throw) → dash
 * walk·idle·crouch·jump·kick 은 **본체가 땅에서 돌아다닐 때만** 쓰므로 안 만든다.
 * 그 덕에 캐릭터당 8장이 아니라 **3장**이면 된다 (6명 = 18장, 약 3.4MB).
 *
 * 50px 에서 서로 갈리는지 먼저 확인하고 정했다 —
 * 검수본 `C:/Users/user/ddong-fx-work/heidi-puyo/_검수_일곱_게임크기.png`.
 * 색과 실루엣으로 갈린다: 긴 갈색머리 · 은발 · 검은망토 · 금발 · 상투 · 뚱뚱함.
 */
export const HEIDI_CLONE_CHARS = [
  'neji', 'kakashi', 'itachi', 'minato', 'shikamaru', 'choji',
  'orochimaru', 'jiraiya',
  // **기본 뿌요 자신** — 변신 뽑기에 들어간다 (사람 지시: "기본 뿌요는 처음에만 나오고
  // 다시 안 나온다"). 기술은 그림자 분신술 + 강화 아랑아. 캐릭터 시트가 없어 모든 동작이
  // 기본 뿌요 그림으로 나가고, 컷인만 전용 그림을 쓴다
  'puyo',
] as const;
export type HeidiCloneChar = (typeof HEIDI_CLONE_CHARS)[number];

/**
 * 캐릭터별 시트. **없는 캐릭터는 기본 뿌요 시트로 조용히 떨어진다.**
 *
 * 명단(`HEIDI_CLONE_CHARS`)이 분신 수(6)보다 많아도 된다 — 발동마다 명단을 섞어
 * 앞에서 6명을 쓴다. 명단이 길수록 판마다 나오는 조합이 달라진다.
 */
/**
 * `fin` 은 **마무리 기술 시트**(4컷: 준비-발동-절정-회수)다. 아직 안 그린 캐릭터가
 * 있으므로 선택 항목으로 둔다 - 없으면 `sheetFor()` 가 `throw` 로 떨어진다.
 */
/**
 * 캐릭터별 **대표 기술의 형(型)**. 여덟 명이 다 다른 이펙트를 그리는 대신
 * **세 가지 형에 여덟 스킨**을 입힌다 - 지우는 모양이 달라지는 것이 핵심이고,
 * 그림은 이미 각자의 `fin` 시트가 다르다.
 *
 * - `ring`  제자리에서 파동이 퍼진다 (회천 - 육탄전차 - 두꺼비 착지)
 * - `beam`  붙은 자리에서 반대편까지 한 줄 (뇌절 - 비뢰신 - 뱀)
 * - `field` 화면 전체에서 흩어진 여러 곳 (까마귀 떼 - 그림자)
 */
/**
 * 캐릭터마다 **동사가 다르다**. 처음엔 형이 셋이고 여덟이 스킨으로 나뉘었는데,
 * 그림만 다르고 하는 일이 같으니 **누가 나왔는지가 안 읽혔다.**
 *
 * 기준은 "무슨 기술이냐"가 아니라 **"똥에게 무슨 일이 일어나느냐"** 다.
 * 전체 표와 이유는 docs/fx-heidi-clone.md 의 "형(型) 여덟".
 */
export type CloneFinForm =
  | 'blink'                            // 미나토 — 걷다가 쿠나이를 던져 비뢰신 3연속
  | 'surge' | 'deflect' | 'ignite'     // 카카시 · 네지 · 이타치
  | 'bind' | 'roll' | 'gate' | 'toad'        // 시카마루 · 쵸지 · 오로치마루 · 지라이야
  | 'clone';                                // 기본 뿌요 — 그림자 분신술 + 강화 아랑아

export const HEIDI_CLONE_FIN: Record<string, CloneFinForm> = {
  minato: 'blink',
  // ── 아직 안 옮긴 일곱. 하나씩 전용 형으로 바꾼다 ──
  kakashi: 'surge',
  neji: 'deflect',
  choji: 'roll', jiraiya: 'toad',
  orochimaru: 'gate',
  puyo: 'clone',
  itachi: 'ignite', shikamaru: 'bind',
};

/**
 * `walk`~`kick` 은 **변신한 캐릭터가 뿌요로 돌아다닐 때** 쓰는 배회 동작이다.
 * 이게 없으면 걷는 순간 `sheetFor()` 가 기본 뿌요로 떨어져 정체가 사라진다.
 * 없는 키는 전부 기본 뿌요 시트로 조용히 떨어진다 — 옛 분신술 마무리(`fin`·`cut`)와
 * 미나토 밖의 던지기 시트는 쓰는 곳이 없어 뺐다 (2026-09-27, 하이디 출시 정리)
 */
export const HEIDI_CLONE_SHEETS: Record<string, {
  wall?: string; dash?: string; cutin?: string;
  /** 던지기 3컷 — 미나토 비뢰신만 쓴다 */
  throw?: string;
  walk?: string; idle?: string; crouch?: string; jump?: string; kick?: string;
  seal?: string;
  /** 네지 팔괘 64장 — 낮은 자세로 장을 번갈아 내지르는 6컷 (원본 $DDONG_FX_WORK/hakke/) */
  hakke?: string;
  /** 아랑아 회오리 드릴 8컷 — 기본 시트에 캐릭터 특징 색을 입힌 것 (scripts/tsuga-tint.py) */
  tsuga?: string;
  /** 땅에서 기술을 모으는 정면 6컷 (지금은 카카시 치도리만). 없으면 웅크림으로 떨어진다 */
  charge?: string;
  /** 제자리 한 바퀴 6컷 (정면 → 옆 → 뒤 → 옆, 지금은 네지 회천만). 루프로 돈다 */
  spin?: string;
  /** 눈을 뜨고 망토를 펼쳐 까마귀를 푸는 정면 6컷 (이타치 만화경) */
  eye?: string;
  /** 쪼그려 앉아 쥐 인(子)을 맺는 정면 6컷 (시카마루 그림자 흉내) */
  bind?: string;
  /** 숨을 들이마셔 부풀다 공으로 말리는 정면 6컷 (쵸지 배가술). 컷마다 몸이 커진다 */
  inflate?: string;
  /** 무릎 꿇고 두 손바닥으로 땅을 치는 정면 6컷 (오로치마루 삼중라생문) */
  gate?: string;
  /** 두루마리를 펼쳐 손을 짚는 정면 6컷 (지라이야 가마분타 소환) */
  summon?: string;
}> = {
  neji:       { wall: 'neji_wall_128x128.png', dash: 'neji_dash_128x136.png', cutin: 'neji_cutin_512x244.png' , walk: 'neji_walk_128x128.png', idle: 'neji_idle_128x128.png', crouch: 'neji_crouch_128x128.png', jump: 'neji_jump_136x128.png', kick: 'neji_kick_128x128.png', seal: 'neji_seal_128x128.png', spin: 'neji_spin_128x128.png', tsuga: 'neji_tsuga_160x112.png', hakke: 'neji_hakke_128x128.png' },
  kakashi:    { wall: 'kakashi_wall_128x128.png', dash: 'kakashi_dash_128x168.png', cutin: 'kakashi_cutin_512x244.png' , walk: 'kakashi_walk_128x128.png', idle: 'kakashi_idle_128x128.png', crouch: 'kakashi_crouch_136x128.png', jump: 'kakashi_jump_160x128.png', kick: 'kakashi_kick_136x128.png', seal: 'kakashi_seal_128x128.png', charge: 'kakashi_charge_128x128.png', tsuga: 'kakashi_tsuga_160x112.png' },
  itachi:     { wall: 'itachi_wall_128x128.png', dash: 'itachi_dash_128x152.png', cutin: 'itachi_cutin_512x244.png' , walk: 'itachi_walk_128x128.png', idle: 'itachi_idle_128x128.png', crouch: 'itachi_crouch_136x128.png', jump: 'itachi_jump_144x128.png', kick: 'itachi_kick_128x128.png', seal: 'itachi_seal_128x128.png', eye: 'itachi_eye_136x128.png', tsuga: 'itachi_tsuga_160x112.png' },
  minato:     { wall: 'minato_wall_128x128.png', throw: 'minato_throw_128x128.png', dash: 'minato_dash_128x152.png', cutin: 'minato_cutin_512x244.png', walk: 'minato_walk_128x128.png', idle: 'minato_idle_128x128.png', crouch: 'minato_crouch_128x128.png', jump: 'minato_jump_136x128.png', kick: 'minato_kick_128x128.png', seal: 'minato_seal_128x128.png', tsuga: 'minato_tsuga_160x112.png' },
  shikamaru:  { wall: 'shikamaru_wall_128x128.png', dash: 'shikamaru_dash_128x160.png', cutin: 'shikamaru_cutin_512x244.png' , walk: 'shikamaru_walk_136x128.png', idle: 'shikamaru_idle_128x128.png', crouch: 'shikamaru_crouch_152x128.png', jump: 'shikamaru_jump_168x128.png', kick: 'shikamaru_kick_152x128.png', seal: 'shikamaru_seal_128x128.png', bind: 'shikamaru_bind_128x128.png', tsuga: 'shikamaru_tsuga_160x112.png' },
  choji:      { wall: 'choji_wall_128x128.png', dash: 'choji_dash_128x128.png', cutin: 'choji_cutin_512x244.png' , walk: 'choji_walk_128x128.png', idle: 'choji_idle_128x128.png', crouch: 'choji_crouch_128x128.png', jump: 'choji_jump_136x128.png', kick: 'choji_kick_128x128.png', seal: 'choji_seal_128x128.png', inflate: 'choji_inflate_128x128.png', tsuga: 'choji_tsuga_160x112.png' },
  orochimaru: { wall: 'orochimaru_wall_128x128.png', dash: 'orochimaru_dash_128x136.png', cutin: 'orochimaru_cutin_512x244.png' , walk: 'orochimaru_walk_128x128.png', idle: 'orochimaru_idle_128x128.png', crouch: 'orochimaru_crouch_136x128.png', jump: 'orochimaru_jump_144x128.png', kick: 'orochimaru_kick_128x128.png', seal: 'orochimaru_seal_128x128.png', gate: 'orochimaru_gate_128x128.png', tsuga: 'orochimaru_tsuga_160x112.png' },
  // 기본 뿌요 — 그림자 분신술 컷인만 전용이다 (나머지는 기본 뿌요 시트로 떨어진다)
  puyo:       { cutin: 'puyo_cutin_512x244.png' },
  jiraiya:    { wall: 'jiraiya_wall_128x128.png', dash: 'jiraiya_dash_128x128.png', cutin: 'jiraiya_cutin_512x244.png' , walk: 'jiraiya_walk_128x128.png', idle: 'jiraiya_idle_128x128.png', crouch: 'jiraiya_crouch_128x128.png', jump: 'jiraiya_jump_152x128.png', kick: 'jiraiya_kick_128x128.png', seal: 'jiraiya_seal_128x128.png', summon: 'jiraiya_summon_176x208.png', tsuga: 'jiraiya_tsuga_160x112.png' },
};

/**
 * 캐릭터 시트 **표시 보정 배율** — 칸 안에 개가 작게 그려진 시트만 그만큼 키워 띄운다.
 * 같은 동작의 기본 뿌요 시트와 보이는 높이를 비교한 값이다 (키우기만, 최대 1.35).
 * 지라이야 떨어지는 시트가 미나토보다 29% 작게 나왔다 (사람 판정). **손으로 고치지 말고**
 * 시트를 바꾼 뒤 `scripts/heidi-sheet-fix.py` 를 다시 돌려 이 표를 통째로 갈아 끼운다.
 */
export const HEIDI_SHEET_FIX: Record<string, number> = {
  'minato_walk_128x128.png': 1.06,
  'minato_idle_128x128.png': 1.07,
  'minato_crouch_128x128.png': 1.18,
  'minato_jump_136x128.png': 1.33,
  'minato_kick_128x128.png': 1.26,
  'minato_wall_128x128.png': 1.04,
  'kakashi_crouch_136x128.png': 1.15,
  'kakashi_jump_160x128.png': 1.31,
  'kakashi_kick_136x128.png': 1.15,
  'neji_walk_128x128.png': 1.19,
  'neji_idle_128x128.png': 1.12,
  'neji_crouch_128x128.png': 1.26,
  'neji_jump_136x128.png': 1.35,
  'neji_kick_128x128.png': 1.33,
  'neji_wall_128x128.png': 1.13,
  'neji_dash_128x136.png': 1.31,
  'neji_seal_128x128.png': 1.01,
  'neji_spin_128x128.png': 1.19,
  'itachi_walk_128x128.png': 1.14,
  'itachi_idle_128x128.png': 1.01,
  'itachi_crouch_136x128.png': 1.21,
  'itachi_jump_144x128.png': 1.35,
  'itachi_kick_128x128.png': 1.30,
  'itachi_eye_136x128.png': 1.14,
  'shikamaru_jump_168x128.png': 1.16,
  'choji_walk_128x128.png': 1.04,
  'choji_crouch_128x128.png': 1.10,
  'choji_jump_136x128.png': 1.24,
  'choji_kick_128x128.png': 1.16,
  'choji_dash_128x128.png': 1.16,
  'choji_inflate_128x128.png': 1.04,
  'orochimaru_walk_128x128.png': 1.12,
  'orochimaru_idle_128x128.png': 1.06,
  'orochimaru_crouch_136x128.png': 1.23,
  'orochimaru_jump_144x128.png': 1.35,
  'orochimaru_kick_128x128.png': 1.31,
  'orochimaru_wall_128x128.png': 1.14,
  'orochimaru_dash_128x136.png': 1.14,
  'orochimaru_gate_128x128.png': 1.12,
  'jiraiya_walk_128x128.png': 1.21,
  'jiraiya_idle_128x128.png': 1.10,
  'jiraiya_crouch_128x128.png': 1.25,
  'jiraiya_jump_152x128.png': 1.27,
  'jiraiya_kick_128x128.png': 1.31,
  'jiraiya_wall_128x128.png': 1.21,
  'jiraiya_dash_128x128.png': 1.28,
  'jiraiya_seal_128x128.png': 1.01,
  'jiraiya_summon_176x208.png': 1.21,
};

/**
 * 이타치 아마테라스 — 까마귀(옆모습 날갯짓 6컷)와 검은 불(8컷 루프, 붉은 테).
 * 불 색은 사람 판정: 순수 검정은 어두운 배경에 묻혀 **붉은 테**를 둘렀다.
 * 원본 C:/Users/user/ddong-fx-work/itachi/ · 조립 scripts/fx-grid-ingest.py (0.21MB + 0.28MB)
 */
export const HEIDI_FX_CROW = 'crow_96x96.png';
/**
 * 기본 뿌요 그림자 분신술 — 분신마다 잡는 **서로 다른 자세** 한 컷씩 (왼쪽을 본다, 12컷).
 * 원본 C:/Users/user/ddong-fx-work/clone/poses*_raw.png (ChatGPT) -> scripts/clone-pose-sheet.py 가 강아지를
 * 덩어리별로 떼어 **같은 배율**로 조립한다 (컷마다 맞추면 자세별로 크기가 널뛴다)
 */
export const HEIDI_FX_CLONEPOSE = 'puyo_clonepose_128x128.png';
/**
 * 미나토 **비뢰신 나선환** — 나선환 8컷 루프 · 내려찍은 폭발 8컷 (바닥선 기준, 가산 블렌드).
 * 원본 $DDONG_FX_WORK/rasen/ (ChatGPT) — 검은 배경 그대로 두고 가산으로 겹친다
 */
export const HEIDI_FX_RASENGAN = 'rasengan_128x128.png';
export const HEIDI_FX_RASENBLAST = 'rasenblast_192x192.png';
/**
 * 이타치 **스사노오** 8컷 — 기운 · 갈비뼈 · 갑옷 · 칼 내림 · 올려 베기 시작 · **대각선 위로 올려 베기** ·
 * 칼 든 여운 · 흩어짐.
 * 오른쪽을 본다, 바닥선 기준. 원본 $DDONG_FX_WORK/susanoo/ (ChatGPT, 원작 조사 후 생성)
 */
// 256 → 384 칸 — 화면에 306px 로 **키워** 띄워 픽셀이 깨졌다 (사람 판정). 이제 줄여서 띄운다
export const HEIDI_FX_SUSANOO = 'susanoo_384x384.png';
/** 스사노오 **검기** — 오른쪽으로 날아가는 붉은 초승달 칼날 8컷 루프 (원본 $DDONG_FX_WORK/susanoo/) */
export const HEIDI_FX_SWORDWAVE = 'swordwave_256x256.png';
/**
 * 네지 마무리 **팔괘 64장** — 팔괘 진(정면 원 한 장, 코드가 납작하게 눌러 바닥에 깐다)과
 * 손바닥 타격 8컷. 원본 $DDONG_FX_WORK/hakke/ (ChatGPT, 원작 조사 후 생성)
 */
export const HEIDI_FX_TRIGRAM = 'trigram_512x512.png';
export const HEIDI_FX_PALM = 'palm_160x160.png';
/** 쵸지 마무리 **초배가 내려찍기** 충격파 8컷 (바닥선 기준, 좌우로 퍼짐). 원본 $DDONG_FX_WORK/choji-slam/ */
export const HEIDI_FX_CHOJISLAM = 'chojislam_256x128.png';
/**
 * 시카마루 마무리 **기폭찰** — 부적 4컷(멀쩡 → 타들어 감)과 **공중** 폭발 8컷(컷 가운데 기준, 사방으로 둥글게).
 * 원본 $DDONG_FX_WORK/shadow-tag/ (ChatGPT, 나선환 폭발 시트를 화풍 참조로 첨부)
 */
export const HEIDI_FX_BOMBTAG = 'bombtag_96x160.png';
export const HEIDI_FX_TAGBLAST = 'tagblast_256x256.png';
export const HEIDI_FX_AMATERASU = 'amaterasu_96x96.png';

/**
 * 쵸지 육탄전차 — 몸을 만 공 4컷 (머리띠 끝·털만 살짝 다르다). **구르는 회전은 코드가 준다** —
 * 공은 돌려도 어색하지 않다 (캐릭터를 통째로 돌리면 어색했던 것과 다르다).
 * 원본 C:/Users/user/ddong-fx-work/choji/ball_src.png · 조립 scripts/fx-grid-ingest.py (0.25MB)
 */
export const HEIDI_FX_CHOJIBALL = 'chojiball_128x128.png';

/**
 * 오로치마루 삼중라생문 — **세 문이 서로 다르다** (원작 42화 확인, 사람 지적):
 * 제1문 빨강(불꽃 가시) · 제2문 초록(뿔 모양 잎) · 제3문 파랑(갈고리 · 사슬 추).
 * 한 줄 12컷 = 문 셋 x 4컷 (멀쩡 · 금 · 크게 금 · 무너짐). 문 i 의 컷 = i*4 + 금 단계.
 * 아래 가장자리가 평평하다 (땅에 선다). 원본 C:/Users/user/ddong-fx-work/orochimaru/gate_src.png (0.87MB)
 */
export const HEIDI_FX_GATE = 'rashomon3_128x148.png';

/**
 * 지라이야 화둔·가마유탄 — 가마분타 정면 4컷 (착지 · 곰방대 · 볼 빵빵 · 입 쩍), 머리 위에
 * 강아지 지라이야가 타 있다. 입 자리 = 칸 가로 50% · 세로 65% (실측). 원본 C:/Users/user/ddong-fx-work/jiraiya/
 * 화염 줄기 — 가로 512 에 입(왼쪽 끝 · 세로 가운데)에서 오른쪽으로 뻗는 6컷 루프. 코드가 돌린다
 */
// 칸 320 — 192 로 구웠더니 화면 폭의 72% 로 띄울 때 1.6배 늘어나 뭉개졌다 (사람 판정).
// 원본 컷이 약 530px 이라 여유가 있다. VRAM 1.56MB (하이디를 고른 판에서만)
// 6컷 — 착지 · 곰방대 · 볼 빵빵 · **입에서 기름** · **머리 위 지라이야가 불을 뿜어 붙임** ·
// 입이 불타오름. 합동 기술이 그림 자체에 들어 있다 (사람 판정: 합동 느낌이 아쉽다 → 다시 그림)
export const HEIDI_FX_TOAD = 'gamabunta_256x256.png';
// 화염 줄기 — 굵고 끝이 거대한 불덩이로 부푸는 '유탄'. 기름 줄기는 전용 시트 (예전엔 불을 누렇게 칠했다)
export const HEIDI_FX_FIREJET = 'firejet_512x128.png';
export const HEIDI_FX_OILJET = 'oiljet_512x96.png';

export const HEIDI_SHEETS: string[] = [
  ...Object.values(HEIDI_PUYO_SHEETS),
  HEIDI_WEAPON_SHEET,
  HEIDI_FX_CROW,
  HEIDI_FX_CLONEPOSE,
  HEIDI_FX_RASENGAN,
  HEIDI_FX_RASENBLAST,
  HEIDI_FX_SUSANOO,
  HEIDI_FX_SWORDWAVE,
  HEIDI_FX_TRIGRAM,
  HEIDI_FX_PALM,
  HEIDI_FX_CHOJISLAM,
  HEIDI_FX_BOMBTAG,
  HEIDI_FX_TAGBLAST,
  HEIDI_FX_AMATERASU,
  HEIDI_FX_CHOJIBALL,
  HEIDI_FX_GATE,
  HEIDI_FX_TOAD,
  HEIDI_FX_FIREJET,
  HEIDI_FX_OILJET,
  // 캐릭터 시트는 **있는 것만** 올린다 — 아직 안 그린 캐릭터가 있으면 로딩이
  // "Failed to process file" 을 뱉는다. 그려진 순서대로 여기에 더한다
  ...HEIDI_CLONE_CHARS.flatMap(c => Object.values(HEIDI_CLONE_SHEETS[c] ?? {})),
];

// 뿌요는 땅에서 혼자 좌우로 돌아다니다가 일정 점수마다 **먼 쪽 화면 끝까지 도약해
// 벽을 짚고, 내려오면서 반대편까지 날라차기로 가로지른다.** 지나간 길의 일반 똥이
// 부서진다. 자세한 설계는 docs/fx-heidi-puyo.md.
export const HEIDI_PARAMS = {
  // ── 배회 ──
  puyoScale:      0.72,  // 플레이어 표시 높이 대비 (80px → 58px). 태이는 0.8 인데
                         // 뿌요는 강아지라 더 작아야 사람 옆에 선 개로 읽힌다.
                         // 0.62 에서 올렸다 (사람: "조금만 크게, 너무 많이는 말고") —
                         // 변신 후 캐릭터로 걸어 다니면서 50px 로는 누군지 안 읽혔다.
                         // 태이(0.8)보다는 작게 둬서 사람 옆 강아지 느낌은 지킨다
  puyoSpeed:      150,   // 배회 속도 px/s. 태이(130)보다 빠르다 — 다리가 짧아 느리게
                         // 잡았더니, 발동마다 도약 대기 지점까지 144px 을 걸어 돌아오는
                         // 구조가 되면서 **바닥에서 굼떠 보였다.** 종종걸음이 맞다
  puyoMargin:     36,    // 좌우 반전 여백 (화면 가장자리에서)
  puyoIdleMs:     1300,  // 가끔 멈춰 서는 시간
  puyoIdleChance: 0.30,  // 한쪽 끝에 닿을 때 idle 로 갈 확률. 걷기만 하면 기계처럼 보인다
  puyoFlipDead:   0.15,  // 좌우 뒤집기 데드존(진행 속도 비율). 방향 전환점에서 깜빡이지 않게

  // ── 발동: 웅크림 → 벽 짚기 → 날라차기 ──
  // 한 번의 발동이 세 토막이다. 가로지르기만 하면 밋밋해서, **화면 끝을 한 번 짚고**
  // 방향을 꺾는다 — 짚는 순간이 정점이자 정지점이라 되돌아오는 발차기가 세 보인다.
  puyoInterval:   60,    // 발동 간격(점)
  puyoMinRunW:    0.70,  // **발동 대기 조건.** 목표 벽까지 남은 거리가 화면 폭의 이만큼은
                         // 돼야 뛴다. 벽을 번갈아 짚다 보니 착지 직후 바로 옆 벽이 목표가
                         // 되어 **코앞으로 폴짝 뛰고 끝나는** 판이 생겼다 — 지나가는 똥이
                         // 거의 없다. 조건이 찰 때까지 배회를 계속한다 (달려가서 뛰는 모양)
  puyoCrouchMs:   220,   // **예비 동작.** 점수 도달 즉시 뛰면 도약이 가벼워 보인다.
                         // 로봇의 예비 동작이 260ms 인데 뿌요는 작고 빨라 조금 짧게 잡았다
  puyoJumpMs:     380,   // ① 아랑아 돌진 — 지금 자리에서 먼 쪽 벽까지 일직선. 560 → 380 (빠르게)
  puyoRiseH:      0.12,  // 도약 중간의 **웃자람**(화면 높이 대비). 끝점이 이미 높으므로
                         // 예전처럼 크게 잡으면 화면 위로 튀어나간다
  puyoWallH:      0.42,  // 벽을 짚는 높이 (바닥에서, 화면 높이 대비)
  puyoWallMargin: -10,   // 짚을 때 스프라이트 바깥 끝과 화면 끝 사이 간격(px).
                         // **음수면 몸 일부가 화면 밖으로 나간다** — 128칸 안에 빈 여백이
                         // 있어서 0 으로 둬도 발바닥이 벽에서 떠 보인다 (사람 판정:
                         // "좀 더 벽에 가까이 붙으면 좋겠")
  puyoWallMs:      90,   // ② 벽을 **튕기는** 틈. 260 → 90 — 회오리는 벽에 붙지 않고 튕겨 나간다
  puyoKickMs:     420,   // ③ 내리꽂기 — 벽에서 튕겨 반대편으로 대각선 하강. 520 → 420
  // 아랑아 회전
  tsugaFps:         30,   // 회오리 시트 재생 속도 (8컷이 나선 띠 한 바퀴)
  tsugaTrailEvery:  26,   // 잔상 간격(ms)
  tsugaTrailMs:    150,   // 잔상이 사라지는 시간
  tsugaTrailAlpha: 0.40,
  puyoLandW:      0.70,  // 착지점 — **짚은 벽에서** 화면 폭의 이만큼 간 자리.
                         // 가장자리(46px)에 박아 두면 끝에 처박혔다가 반대쪽 도약
                         // 대기 지점까지 한참을 걸어 돌아와야 한다. 안쪽으로 당기면
                         // 착지와 다음 대기 지점이 가까워져 되돌아 걷는 거리가 준다
  puyoKickHitR:   48,    // 하강 중 판정 반경. 뻗은 발만큼 넓다 (도약 구간은 34)
  puyoKickPoints: 40,    // 내리꽂기 구간이 지운 똥 하나당 점수. 30 → 40 (2026-09-27 사람 지시: "레드·하이디는 전부 40")

  // ── 변신 공통 ──
  // (옛 그림자 분신술에서 이어받은 값이라 이름에 clone 이 남아 있다)
  cloneRiseMs:     520,  // 변신 ① 화면 가운데로 솟구치는 시간
  cloneFinPoints:   40,  // 고유 기술이 지운 똥 하나당 점수 (기술별 값이 따로 없을 때). 18 → 40
                         // 무기(6)보다 높고 날라차기(30)보다 낮다 - 한 판을 끝내면 안 된다

  // ── 컷인 (`cutin` 일러스트가 있는 캐릭터만) ──
  // 메이플 어센트류의 "화면을 통째로 쓰는" 느낌은 그림보다 **화면 점유**에서 온다.
  // 실측: 지금 컷신이 화면의 2.9% 였고 어센트류는 60~100% 다.
  cutinMs:         900,  // 컷인이 떠 있는 시간. 이만큼 기술이 뒤로 밀린다
  cutinInMs:       140,  // 밀려 들어오는 시간
  cutinOutMs:      180,  // 빠져나가는 시간
  // **화면 위쪽에 가로 띠로 건다.** 세로 전체화면도 만들어 봤지만(9:16 8장)
  // 사람이 가로 띠 쪽을 골랐다 — 화면을 다 덮지 않으니 덜 답답하다.
  // 띠 그림은 그 세로 원본을 16:9 로 **잘라서** 만든다 (941x1672 -> 941x529).
  // 확대가 아니라 크롭이라 하드 엣지가 그대로 살고, 얼굴 높이가 캐릭터마다 달라
  // 크롭 위치는 한 명씩 맞췄다 (scripts/cutin-ingest.sh 의 TOP).
  // 띠는 **2.1:1** 이다. 16:9 로 시작했다가 "세로 사이즈 살짝만 줄여 달라"는
  // 판정에 폭은 그대로 두고 높이만 15% 깎았다 (360 화면에서 202 -> 171px)
  // **화면 틀에 붙인다** — 예전엔 판 중심을 화면 높이의 24% 에 띄워서 폰 비율마다 위아래가
  // 떠 보였다. 이제 띠 윗변을 HUD(36px) 바로 아래에 딱 붙이고, 테 두께도 판 높이에 맞춘다
  cutinTopPx:       36,  // 그림 윗변 — GameScene 의 HUD_H(점수칸) 바로 아래. 셔터가 여기서 아래로 열린다
  // ── 만화 칸 컷인 (2026-09-27, 사람 지시: "띠는 커서 불편 — 왼쪽 위에 만화 한 컷처럼") ──
  cutinPanelW:     0.52,  // 칸 폭 (화면 폭 대비). 0.45 → 0.52 (사람 지시: "조금만 키워")
  cutinPanelAspect: 0.66, // 칸 높이 / 폭
  cutinMarginX:       0,  // 화면 왼끝에서 칸까지(px). 0 — **왼변은 화면 끝에 딱 붙인다** (사람 지시)
  cutinTopGap:        0,  // 점수칸 아래에서 칸까지(px). 0 — **윗변은 점수칸 아랫선에 딱 붙인다** (사람 지시)
  cutinTiltDeg:       0,  // 칸 기울기(도). 4 → 0 — 윗변·왼변이 화면 틀과 직각으로 맞아야 한다 (사람 지시)
  cutinZigRight:      5,  // 오른변 톱니 마디 수
  cutinZigBottom:     7,  // 아랫변 톱니 마디 수
  cutinZigAmp:        6,  // 톱니 높이(px)
  cutinBorder:        6,  // 검은 테 두께(px) — 꼭짓점은 원으로 이어 뭉툭하게
  cutinRim:           3,  // 검은 테 바깥 흰 테(px) — 어느 배경에서도 칸이 읽히게
  cutinImgOver:    1.12,  // 그림을 칸 높이보다 이만큼 크게 띄운다 (가장자리 빈틈 방지)
  // 컷인 그림 속 **얼굴의 가로 위치** (그림 폭 대비) — 칸 가운데로 민다. 그림을 보고 잰 값
  cutinFaceX: {
    minato: 0.68, kakashi: 0.66, neji: 0.72, itachi: 0.66, shikamaru: 0.72,
    choji: 0.76, orochimaru: 0.72, jiraiya: 0.72, puyo: 0.50,
  } as Record<string, number>,
  screenShake:    false, // 하이디 기술의 화면 흔들림. false — "정신없다" (사람 판정). 히트스톱·섬광은 남는다
  cutinFreeze:    false, // 컷인 동안 똥을 멈추고 새 똥을 막을까. true → false (사람 지시:
                         // "컷인 때 멈추는 거 없애줘"). 무적은 유지한다 — 암전 아래로 똥이 흐르므로

  // ── 미나토 비뢰신 표식 · 섬광 ──
  chainMarkScale: 0.55,  // 표식(삼지창) 표시 배율
  // ── 임팩트 연출 (나루티밋 오의 · 드래곤볼 레전즈 피니시 문법) ──
  // 점프마다 섬광이 **세지다가 마지막에 터진다**. 넷이 똑같으면 밋밋하다.
  // 줌은 뺐다 — HUD 전용 카메라가 없어서 점수 텍스트까지 같이 커진다
  finFlashStep:   0.45,  // 중간 점프의 섬광 세기
  finFlashLast:   1.00,  // 마지막 점프의 섬광 세기
  finFlashMs:       33,  // 섬광이 떠 있는 시간(ms). 60fps 기준 2프레임
  chainMarkTint: 0xffd24a,  // 비뢰신 노랑. 원반의 파랑과 **다른 순간에** 나와야 안 섞인다

  /**
   * **실기 확인용 강제 지정.** 빈 문자열이면 평소대로 무작위다.
   *
   * 변신은 2번째 발동마다 나오고 캐릭터는 8명 중 하나라, 특정 캐릭터의 기술을
   * 보려면 평균 16번 발동해야 한다. 한 명씩 확인할 때만 켠다.
   *
   *   debugCloneChar: 'minato'   ← 확인할 때만. 확인이 끝나면 '' 로 되돌린다
   */
  debugCloneChar: '' as string,

  /**
   * **진단 로그.** 변신·기술이 어디까지 갔는지 콘솔에 찍는다 (F12 → Console).
   * "적용이 안 된 것 같다"가 반복될 때 추측 대신 데이터를 보려고 넣었다.
   * 확인이 끝나면 false 로 되돌린다.
   */
  debugFinLog: false,

  // ── 변신 주기 · 컷인 ──
  summonEvery:        2,  // 몇 번째 발동마다 변신인가. 나머지는 평소 도약·날라차기
                          // (도약은 하이디의 기본기이자 점수원이라 없애지 않고 **번갈아** 둔다)
  summonCutinMs:   1200,  // 컷인이 떠 있는 시간. 850 → 1200 — 만화 칸은 작아서 덜 거슬린다
  summonCutinInMs:  160,
  summonCutinOutMs: 220,

  // ── 변신 (B안 개정) ──
  // "이렇게 말고 뿌요가 화면 정가운데로 점프해 인을 맺고, 랜덤 캐릭터로 변신해서
  //  고유 능력을 쓴다" (사람 지시). 닌자가 **어디선가 나오는** 게 아니라 **뿌요 자신이**
  // 변한다 — 누가 무엇이 됐는지가 인과로 읽힌다.
  transformY:     0.48,  // 인을 맺는 높이 (화면 높이 대비, 위에서). 0.42 → 0.48
                         // (사람 판정: "살짝 아래로")
  sealHitR:       0.42,  // 인 맺는 동안 몸에 닿은 똥을 지우는 반경 (뿌요 크기 대비).
                         // 없으면 공중에 떠 있는 큰 뿌요를 똥이 그냥 통과했다 (사람 판정)
  travelScale:    0.55,  // 솟구치기·내리꽂기 동안 크기 (플레이어 키 대비). 고속 이동 시트는
                         // 칸이 세로로 길어(128x160) 같은 배율이면 더 커 보인다 —
                         // 사람 판정 "올라가고 내려가는 건 사이즈 줄여"
  transformScale: 1.25,  // 공중에서 커지는 배율 (플레이어 키 대비). 평소 0.62 로는 인이 안 보인다
  sealFps:           5,  // 인 맺기 6컷 속도 → 1.2초. 10(600ms)은 손이 빨라 인 모양이
                         // 안 읽혔다. 사람 판정 두 번("조금만 천천히" → "조금만 더")에 10→7→5
  sealHoldMs:      180,  // 마지막 컷(눈 뜨며 털이 솟음)에 머무는 시간. 여기서 펑 한다
  // 변신 펑 — 흰 연기가 티 나게 (사람: "아주 흰 뿌연 연기, 티 날 정도로")
  poofAlpha:      1.0,   // 연기 시작 불투명도. 공용 smoke 의 0.45 로는 배경에 묻힌다
  poofLife:       1.1,   // 수명 배율 (poof 프리셋 900~1500ms 에 곱함 → 약 1~1.65초).
                         // 사람 판정 "조금 더 길게"에 smoke×0.75(0.5~1초)에서 늘렸다
  poofCoreCount:    16,  // 몸을 덮는 짙은 뭉치
  poofCoreScale:   1.5,
  poofRingCount:    10,  // 바깥으로 튀는 고리
  poofRingSpeed:   2.6,
  landMs:          320,  // 능력을 쓰고 땅으로 떨어지는 시간

  // ── 미나토 고유: 비뢰신 3연속 (blink) ──
  // 변신해 착지한 뒤 **걸어 다니다가** 아무 방향으로 표식 쿠나이를 던지고,
  // **벽(좌·우·천장·바닥)까지** 일직선으로 날아가 꽂힌 자리로 순간이동한다.
  // 쿠나이는 돌지 않고 날아가는 방향을 본다. 지나간 선 위의 똥이 베인다.
  // 마지막(blinkCount 번째) 쿠나이는 바닥 가운데 — 비뢰신 나선환으로 끝낸다 (사람 지시)
  rasenChargeMs:    420,  // 바닥에서 웅크려 나선환을 모으는 시간
  rasenHandY:      0.55,  // 나선환 자리 — 발바닥 위로 뿌요 크기의 이만큼
  rasenOrbSize:    0.85,  // 다 모인 나선환 크기 (뿌요 크기 대비)
  rasenBlastW:     0.82,  // 폭발 돔 표시 폭 (화면 폭 대비). 0.70 → 0.82 (사람 지시: "살짝만 더 크게")
  rasenBlastMs:     700,  // 폭발 8컷 재생 시간
  rasenHoldMs:      150,  // 폭발 뒤 걷기까지
  rasenR:           175,  // 폭발 판정 최대 반경(px) — 돔이 부푸는 만큼 자란다. 150 → 175 (돔이 커진 만큼)
  // 푸른 파동 — 내려찍는 순간 화면 끝까지 퍼지는 고리. 고리가 지나간 자리의 똥이 날아간다
  rasenWaveMs:      900,  // 화면 끝까지 퍼지는 시간. 650 → 900 (사람 판정: "잘 안 보인다")
  rasenWaveW:        34,  // 고리 두께(px) — 판정도 이 두께만큼. 26 → 34
  rasenWaveTint: 0x5ab8ff,  // 가운데 하늘색 띠
  rasenWaveEdge: 0x1646b8,  // 바깥 진한 파랑 — 밝은 배경에서도 고리 윤곽이 서게
  blinkCount:        5,   // 연속 몇 번. 3 → 5 (사람 지시: "횟수 2개 늘려줘")
  blinkSpreadJitter: 60,  // 다음 자리 고를 때 섞는 무작위(px). 0 이면 늘 '들른 곳에서 가장 먼 곳' 하나로 굳는다
  blinkWalkMs:     700,   // 착지 후 걷다가 첫 쿠나이를 던지기까지
  blinkThrowMs:    150,   // 던지는 자세 → 쿠나이가 손을 떠나기까지
  blinkFlyMs:      230,   // 쿠나이가 날아가는 시간
  blinkStickMs:    110,   // 꽂힌 쿠나이가 **먼저 보이는** 틈. 이게 있어야 "저기로 가겠구나"가 읽힌다
  blinkHoldMs:     200,   // 도착해서 다음 쿠나이를 던지기 전 멈춤 (공중에서)
  blinkDistMin:    170,   // 벽까지 최소 거리. 이보다 짧은 방향은 다시 뽑는다
  blinkDistMax:    260,   // 비행 시간 환산용 기준 거리 (실제 도착은 벽)
  blinkR:           90,   // 순간이동 **선** 위 판정 반경. 점이 아니라 지나간 길을 벤다. 46 → 90
                          // (사람 지시: "카카시랑 똑같이" — surgeLegR 와 같은 값). 빛띠 폭도 따라 넓어진다
  blinkLimit:        0,   // 한 번에 지울 똥 상한 (0 = 선 위 전부)
  blinkDashMs:      70,   // **고속 이동.** 몸을 감추고 섬광선이 출발점에서 도착점까지 뻗는 시간.
                         // 순간이동(0ms)이면 "사라졌다 나타남"이고, 선이 뻗어야 "지나갔다"가 읽힌다
  blinkTrailMs:    220,   // 섬광 잔상이 걷히는 시간
  blinkTrailCore:   12,   // 잔상 가운데 밝은 심지 두께(px)
  blinkTrailAlpha: 0.45,
  // 비뢰신 색 — **노랑.** 심지를 거의 흰색(0xfff8d8)으로 두고 가산 합성했더니 흰 섬광으로
  // 읽혔다 (사람 판정: "흰색으로 보여"). 파랑 성분을 0 에 가깝게 두면 가산으로 겹쳐도
  // 빨강·초록만 차올라 끝까지 노랑이 남는다
  blinkCoreTint:  0xffd400,  // 섬광선 심지
  blinkGlowTint:  0xff9c00,  // 바깥 빛띠 (심지보다 짙은 호박색 — 가장자리가 노랑을 받쳐 준다)
  blinkFlashColor: 0xffc800, // 화면 섬광 (기본은 흰색)  // 바깥 빛띠 불투명도. 빛띠 폭 = 판정 폭(blinkR x 2) — 보이는 만큼 지운다
  blinkWallPadPx:    8,   // 쿠나이가 벽에 꽂힐 때 스프라이트 반 장만 물리는 여백(px)

  // ── 카카시 `surge` — 치도리를 모아 세로로 꿰뚫는다 ──
  // 잠수(두더지 은신)로 시작했다가 **차징으로 바꿨다.** 치도리의 정체는 이동이 아니라
  // 모으는 시간이다 ("천 마리 새 우는 소리"). 게다가 컷인이 이미 앞발에 번개를 모으고 있다.
  // 정적은 "아무 일도 안 일어남"이지만 차징은 "무언가 차오름"이라, 같은 시간에 긴장이 붙는다.
  //
  // 방향도 유일하다 — 똥은 위에서 내려오는데 카카시만 **아래에서 위로** 거슬러 올라간다.
  // 발사는 **장전 → 벽으로 돌진** 세 번 (사람 지시: "가운데서 장전, 한쪽 벽으로 치도리,
  // 장전 후 반대쪽 벽 살짝 위로, 또 장전 후 반대쪽 벽 좀 위로")
  surgeDashes:        5,  // 돌진 횟수 (장전 → 돌진). 3 → 5 (사람 판정: "2번 더 할 수 있겠다")
  // 닿을 자리 고르기 — 좌·우 벽과 천장 위 후보 중 **지금 자리에서 멀고 들른 곳과도 먼** 곳
  // (사람 판정: "좌우보다 좀 더 멀리멀리"). 예전엔 좌우 벽을 번갈아 높이만 조금씩 올렸다
  surgeFloorH:     0.22,  // 벽 위 후보의 가장 낮은 높이 — 바닥선 위 이만큼 (화면 높이 대비)
  surgeSpreadW:    0.60,  // '들른 곳과 먼' 쪽에 주는 무게 (0 이면 거리만 본다)
  surgeAimJitterPx:  60,  // 고를 때 섞는 무작위(px) — 매번 같은 길로 굳지 않게
  surgeWallPad:    0.40,  // 벽에서 몸 가운데까지 (뿌요 크기 대비) — 몸이 화면 밖으로 안 나가게
  surgeLegMs:       200,  // 한 번 돌진하는 시간
  surgeRechargeMs: 1200,  // 벽에서 다시 장전하는 시간 (첫 장전은 surgeChargeMs). 700 → 1200
                         // (사람 판정: "장전 시간이 많이 줄어든 것 같다")
  surgeRezapMax:      3,  // 재장전 동안 전기로 태우는 최대 개수
  surgeBolts:         4,  // 돌진 한 번에 겹치는 번개 줄 수 (사람 판정: "한 줄은 초라하다")
  surgeBoltGapMs:    50,  // 줄과 줄 사이 시간차
  surgeBoltJitterDeg: 5,  // 줄마다 트는 각도(±)
  surgeBoltOffPx:    12,  // 줄마다 옆으로 비키는 거리(±)
  surgeLegR:         90,  // 돌진 선 위 판정 반경. 잔상이 떠 있는 동안 계속 태운다. 52 → 90
                         // (사람 지시: "삭제 범위 많이 늘려줘"). 빛띠 폭도 이 값을 따라 넓어진다
  surgeOrb:        0.75,  // 치도리 구 최대 크기 (뿌요 크기 대비). 차징 동안 0.25 배에서 자란다
  surgeOrbStrike:  1.15,
  // 모으는 동안 **주변 똥이 전기에 타서** 없어진다 (사람 지시). 구에서 가장 가까운 똥으로
  // 번개 한 가닥이 튀고, 맞은 똥은 청백으로 번쩍였다가 까맣게 타며 쪼그라든다
  surgeZapEvery:    170,  // 몇 ms 마다 한 번 튀는가
  surgeZapR0:        80,  // 반경 — 모으기 시작 (px). 구가 자랄수록 넓어진다
  surgeZapR1:       150,  // 반경 — 다 모았을 때
  surgeZapMax:       10,  // 한 번 모으는 동안 태우는 최대 개수
  surgeZapMs:       260,  // 번개 가닥 · 타는 똥이 사라지는 시간
  surgeOrbFrontY: 0.17,  // 정면 모으기 시트에서 구 자리 — 발바닥 위로 뿌요 크기의 이만큼.
                         // 교차한 두 앞발이 칸의 y 95/128 에 있다 (발바닥 118)  // 솟구치는 순간 한 번 더 부푸는 배율
  // ── 카카시 땅 판본 (변신 → 착지 → 모으기 → 발사) ──
  // 사람 지시: "변신 후 밑에 내려와서 치도리를 2초간 모으는 연출이 필요해. 그리고 발사"
  surgeLandDelayMs: 150,  // 착지 후 모으기 시작까지 (걷지 않고 거의 바로)
  surgeChargeMs:   2000,  // 치도리를 모으는 시간
  surgeSparkEvery:  280,  // 모으는 동안 앞발에서 튀는 전기 조각 간격(ms)
  surgeTopHoldMs:   160,  // 마지막 벽에서 멈추는 틈 — 이게 있어야 "꿰뚫고 닿았다"가 읽힌다
  surgeTint:  0xbfe6ff,  // 치도리 청백. boltGold(금색) 시트를 틴트해서 쓴다

  // ── 네지 `deflect` — 회천으로 튕기고, 튕긴 똥이 또 친다 ──
  // 회천은 원래 **막는** 기술이다. 없애는 게 아니라 튕겨낸다 — 그래서 네지만
  // "똥이 그 자리에서 터지지 않고 바깥으로 날아가 화면 밖으로 사라진다".
  // 판이 지저분할수록 강해지는 유일한 놈이기도 하다.
  deflectR:        150,  // 회천 반경 — 이 안의 똥이 튕긴다
  deflectMax:        8,  // 한 번에 튕기는 최대 개수
  deflectSpeed:    520,  // 튕겨 나가는 속도(px/s)
  deflectSpin:       9,  // 날아가는 동안 회전(rad/s)
  deflectHitR:      22,  // 날아간 똥이 다른 똥을 치는 판정 반경
  deflectPierce:     3,  // 총알 하나가 최대 몇 개를 칠 수 있나. **연쇄는 1단까지** —
                         // 맞은 똥이 또 총알이 되면 똥이 많은 판에서 무한히 번진다
  deflectTotal:     16,  // 한 번의 마무리로 없앨 수 있는 총 개수 (직접 + 연쇄)
  deflectChainPts:   40,  // 연쇄로 터진 똥의 점수. 9 → 40 (직접과 같게 — 하이디는 전부 40)
                         // 문서에 "대표 기술이 한 판을 끝내면 안 된다"고 적어 뒀다
  // ── 네지 땅 판본 (변신 → 착지 → 백안 → 회천) ──
  // ── 이타치 땅 판본 (변신 → 착지 → 만화경 → 까마귀 → 아마테라스) ──
  // ── 시카마루 땅 판본 (변신 → 착지 → 쥐 인 → 그림자 → 정적 → 조르기) ──
  // 그림자는 시트 없이 **코드로 그린다** — 원래 납작한 검은 모양이라 그림이 필요 없고,
  // 뻗고 팽팽해지는 움직임을 자유롭게 줄 수 있다 (VRAM 0)
  // ── 쵸지 땅 판본 (변신 → 착지 → 배가술 → 육탄전차 → 쪼그라듦) ──
  // ── 오로치마루 땅 판본 (변신 → 착지 → 삼중라생문) ──
  // 사람 판정: 잠영다수수(뱀)는 "좀 징그럽다" → 삼중라생문으로 교체.
  // 원작은 도깨비 얼굴 문 셋이 땅에서 솟아 공격을 막는다. 게임에서는 **화면 폭을 셋으로
  // 나눠 나란히 솟고, 문 윗면에 떨어진 똥이 부서진다** — 문 아래가 몇 초 동안 지붕이 된다.
  // 다른 일곱이 전부 "지운다"인데 이것만 **"막는다"**
  // ── 지라이야 땅 판본 (변신 → 착지 → 두루마리 소환 → 가마분타 → 화둔·가마유탄) ──
  // 가마분타가 기름을 뿜고 머리 위 지라이야가 불을 붙인다 — 둘이 함께 하는 기술 (사람 선택)
  toadLandDelayMs:  200,
  // ── 기본 뿌요: 그림자 분신술 + 강화 아랑아 ──
  // 착지해 인을 맺고(컷인) 펑 — 본체가 사라지고 흰 회오리 드릴 여럿이 위쪽 부채꼴로
  // 엇갈려 튀어나가 벽·천장·바닥을 튕기며 화면을 누빈다. 다 사라지면 본체가 돌아온다
  cloneLandDelayMs: 250,  // 착지 후 인을 맺기 시작할 때까지
  cloneSealMs:      700,  // 인을 맺는 시간 (컷인이 이 사이에 뜬다) — 끝에 펑
  cloneCount:        12,  // 분신 수 (본체도 그중 하나로 사라진다). 8 → 12 (사람 판정: "적어 보인다")
  clonePoseFrames:   12,  // 자세 시트 컷 수 (puyo_clonepose — scripts/clone-pose-sheet.py). 분신마다 다른 컷
  cloneEdgeW:      0.12,  // 분신이 나타나는 가로 범위 — 화면 양끝에서 이만큼 안쪽
  cloneTopH:       0.10,  // 나타나는 세로 범위 — 점수칸 아래 이만큼부터 (화면 높이 대비)
  cloneBottomH:    0.10,  //                 — 바닥선 위 이만큼까지
  cloneMinGap:       70,  // 분신끼리 최소 간격(px) — 겹쳐 나타나지 않게
  clonePoseScale:  0.85,  // 자세 그림 표시 크기 (뿌요 크기 대비). 그림이 칸을 꽉 채워 조금 줄인다
  clonePoseMs:      650,  // 나타나 자세를 잡고 버티는 시간 (그 뒤 한 마리씩 튀어나간다)
  clonePoseJitterMs: 220, // 나타나는 박자를 마리마다 이만큼 안에서 어긋나게
  cloneAimJitterDeg: 35,  // 튀어 나가는 방향 — 화면 가운데를 향한 방향에서 이만큼 비튼다
  cloneStaggerMs:    70,  // 한 마리씩 엇갈려 출발하는 간격 — 한꺼번에 나가면 정신없다
  cloneSpeed:       640,  // 드릴 속도(px/s)
  cloneBounces:       2,  // 이만큼 튕기고, 다음 벽에 닿으면 펑 하고 사라진다
  cloneMaxMs:      2600,  // 보험 — 튕김 수를 못 채워도 이 시간이 지나면 사라진다
  cloneDrillW:     1.35,  // 드릴 표시 폭 (뿌요 크기 대비) — '강화' 라 평소 아랑아보다 크다
  cloneHitR:         40,  // 드릴 경로 판정 반경
  clonePoints:       40,  // 지운 똥 하나당 점수. 10 → 40 (하이디는 전부 40)
  cloneTotal:        36,  // 한 번의 분신술이 지울 수 있는 최대 개수 (한 판을 끝내면 안 된다)
  toadPoseMs:      1300,  // 두루마리 소환 **8컷** — 쥠 · 던짐 · 공중에서 펼쳐짐 · 활짝 · 툭 떨어짐 ·
                         // 바닥에 놓임 · 뛰어올라 · 쾅. 떨어지는 두루마리가 읽히게 느긋하게
  toadCallAt:      0.76,  // 두루마리를 **쾅 찍는** 7번째 컷에 연기 펑 · 가마분타가 떨어지기 시작
  // 소환은 **연기 펑 속에서 나타난다** (원작 口寄せ). 하늘에서 떨어지게 했더니 소환이 아니라
  // 그냥 떨어지는 것 같았다 (사람 판정). 거대한 흰 연기가 먼저 터지고, 그 속에서 부풀며 나타난다
  toadDropMs:       380,  // 연기가 터지고 가마분타가 그 속에서 나타나기까지
  toadLandMs:       220,  // 착지 찌그러짐 컷
  toadIdleMs:       320,  // 곰방대 물고 노려보는 틈
  toadInhaleMs:     450,  // 볼 빵빵 — 기름을 머금는다 (지라이야 인)
  toadW:           0.50,  // 가마분타 폭 (화면 폭 대비). 0.72 → 0.64 → 0.56 → 0.50 (사람 판정: 크다)
  toadMouthY:      0.70,  // 가마분타 입 자리 — 칸 세로 대비 (새 시트 실측: 기름이 나오는 자리)
  // **합동 기술로 읽히게** 원작 순서대로 (사람 판정: "합동으로 하는 느낌이 아니라 아쉽다"):
  //   ① 가마분타가 기름을 V 자로 뿜는다 → ② 머리 위 지라이야가 불을 훅 뿜어 입가 기름에
  //   붙인다 (이 순간 컷인 · 화면 정지) → ③ 불이 기름 줄기를 타고 바깥으로 번진다
  // 불길은 **돌지 않는다** — 예전엔 한 줄기가 부채꼴로 휩쓸어 빙글 도는 것처럼 보였다 (사람 판정)
  oilMs:            320,  // ① 기름이 뻗는 시간
  breathMs:         220,  // ② 지라이야가 불을 뿜는 컷(그림)을 보여 주는 시간
  igniteMs:         200,  // ③ 불이 기름을 타고 끝까지 번지는 시간
  fireHoldMs:      2400,  // 불길이 버티며 **천천히 쓸고 지나가는** 시간
  // **한 줄기가 천천히 쓸고 지나간다** (사람 지시: 왼쪽 45° → 오른쪽 45°).
  // 기름은 시작 각도로 뿜고, 불이 붙은 뒤 끝 각도까지 일정한 속도로 옮겨 간다.
  // 예전 부채꼴(-168° → -12°, 1.9초)은 빙글 도는 것 같았다 — 폭을 90° 로 줄이고 느리게 했다
  fireSweepFrom:   -135,  // 위에서 왼쪽으로 45°
  fireSweepTo:      -45,  // 위에서 오른쪽으로 45°
  fireLen:          620,  // 불길 길이(px) — 화면 끝까지
  fireH:            200,  // 불길 굵기(px, 표시) — 한 줄기라 140 → 200
  fireR:             84,  // 불길 판정 반경 (선분 기준) — 42 → 64 → 84 (사람 지시: "조금 더 크게")
  firePoints:        40,  // 불에 탄 똥 하나당 점수 (한도 없음). 14 → 40
  // 가마분타 몸 — **서 있는 내내** 몸에 닿는 똥이 짓눌린다 (예전엔 착지 순간 한 번뿐)
  toadBodyHalfW:  0.42,  // 판정 반폭 (가마분타 폭 대비)
  toadBodyH:      0.80,  // 판정 높이 (바닥에서, 가마분타 폭 대비 — 그림이 정사각 칸)
  toadBodyPoints:   40,  // 짓눌린 똥 하나당 점수. 14 → 40
  gateLandDelayMs:  200,
  gatePoseMs:       600,  // 땅에 손을 짚는 6컷
  gateRiseAt:      0.55,  // 이 진행도(손이 땅에 닿는 4번째 컷)에 문이 솟기 시작한다
  gateStagger:      120,  // 문 셋이 솟는 시차(ms) — 가운데 → 양옆
  gateRiseMs:       260,  // 문 하나가 다 솟는 시간
  gateHoldMs:      4000,  // 버티는 시간
  gateShatterMs:    340,  // 끝에 **박살 나 사라지는** 시간 — 터지는 컷 → 흩어지는 컷.
                         // 예전엔 땅으로 가라앉았다 (사람 판정: "그냥 박살나서 없어지는 느낌")
  gateAspect:      1.16,  // 문 높이 = 문 폭(화면 폭의 1/3) x 이것. 시트 칸 비율 (128x148) —
                         // 높이를 화면 비율로 따로 주면 문이 세로로 늘어난다. 문 윗면 = 막는 선
  gatePoints:        40,  // 문 위에서 부서진 똥 하나당 점수. 12 → 40
  rollLandDelayMs:  200,  // 착지 후 배가술까지
  inflateMs:        700,  // 배가술 6컷 — 숨 들이마심 → 부풂 → 공으로 말림
  rollBallD:        100,  // 공 지름(px). 130 → 100 (사람 판정: "사이즈 조금 줄이고")
  // 사람 지시: "회전을 엄청 빠르게 하면서 화면 여기저기 3초 동안 튕겼으면"
  // 땅 왕복 → 화면 전체를 튀어 다니는 공으로 바꿨다
  rollMs:          3000,  // 튕겨 다니는 시간
  rollSpeed:        640,  // 날아다니는 속도(px/s) — 벽·천장·바닥에서 반사된다. 430 → 640
                         // (사람 판정: "더 빠르게 벽 여기저기")
  rollSpinRate:      40,  // 회전 속도(rad/s) — 초당 약 6바퀴. 진행 방향 쪽으로 돈다
  // 마무리 — 초배가 내려찍기 (사람 지시). 튕기기 뒤 가운데 위로 솟아 거대해졌다가 쿵
  slamRiseMs:       450,  // 가운데 위로 솟으며 커지는 시간
  slamHangMs:       150,  // 꼭대기에서 멈추는 틈
  slamDropMs:       240,  // 내리꽂히는 시간
  slamWaveMs:       700,  // 충격파 8컷 · 공이 원래 크기로 줄어드는 시간
  slamBallW:       0.55,  // 거대해진 공 지름 (화면 폭 대비)
  slamTopY:        0.30,  // 솟는 높이 (화면 높이 대비, 위에서)
  slamWaveW:       1.20,  // 충격파 최대 폭 (화면 폭 대비) — 끝까지 퍼지면 화면 밖까지
  slamWaveH:       0.30,  // 충격파 판정 높이 — 바닥에서 화면 높이의 이만큼 위까지
  rollTopY:        0.12,  // 튕기는 천장 높이 (화면 높이 대비). HUD 아래
  rollTrailEvery:    32,  // 잔상 간격(ms) — 빨라진 만큼 촘촘히 (띄엄띄엄 찍히면 끊겨 보인다)
  rollPoints:        40,  // 공에 부서진 똥 하나당 점수. **한도 없음** (사람 판정). 15 → 40
  bindLandDelayMs:  200,  // 착지 후 인을 맺기까지
  bindSealMs:       600,  // 쪼그려 앉아 쥐 인을 맺는 6컷 (끝 컷에서 멈춰 끝까지 유지)
  bindMax:            0,  // 묶는 똥 수. 0 = **화면 안의 일반 똥 전부** (사람 지시).
                         // 설계표 8~10 → 12 → 전부
  // 가닥 하나가 뻗는 두 박자 (사람 지시: "처음 나가는 부분쯤만 꿈틀, 그 뒤는 직선으로 쭉 빠르게")
  bindCreepMs:      260,  // ① 발밑에서 꿈틀대며 조금 기어 나온다
  bindCreepPx:       48,  //    이때 나오는 길이(px). 가닥이 짧으면 전체의 절반까지만
  bindDashMs:       110,  // ② 나머지를 **직선으로** 쭉 — 꿈틀거림은 여기서 곧게 펴진다
  bindStaggerMs:     45,  // 가닥끼리 출발 시차 — 한꺼번에 뻗으면 한 덩어리로 보인다
  bindMinRiseH:    0.30,  // 땅에서 화면 높이의 이만큼 **위에 있는** 똥만 묶는다. 60px → 화면 30%
                         // (사람 지시: "아래쪽 똥에는 향하지 않게" — 이타치 까마귀와 같은 값)
  bindStaggerSpan:  540,  // 시차의 총합 상한. 똥이 많으면 간격을 줄여 이 안에 다 출발시킨다
                         // (40개 x 45ms = 1.8초면 정적이 오기 전에 늘어진다)
  bindHoldMs:       500,  // **정적.** 전부 묶인 뒤 아무 일도 없는 틈 — 이게 이 기술의 전부다
  bindSqueezeMs:    260,  // 조르기 — 묶인 똥이 한꺼번에 찌그러져 터지는 시간
  bindWiggle:        10,  // ① 동안 **꿈틀대는 폭(px)**. 머리 쪽으로 갈수록 커진다 —
                         // 4 → 10 (사람 판정: "좀 더 꿈틀되게"). 땅 구간은 이것의 40%
  bindWiggleLen:     42,  // 물결 한 마디 길이(px). 짧을수록 잘게 꿈틀댄다
  bindWiggleSpeed: 0.022, // 물결이 가닥을 타고 흐르는 속도 — 머리 쪽으로 기어가는 느낌
  bindStraightenMs:  70,  // ② 가 시작되면 이 시간 안에 꿈틀거림이 펴져 직선이 된다
  bindWidth:          6,  // 그림자 가닥 굵기 (땅 쪽). 올라갈수록 가늘어진다
  bindColor:   0x0a0a12,  // 그림자 색 (거의 검정, 살짝 푸른 기)
  bindPoints:        40,  // 묶어 터뜨린 똥 하나당 점수. 18 → 40
  // 마무리 — 그림자 꿰매기 (사람 지시). 조르기 뒤 그림자가 바닥 전체로 번지고 바늘이 솟는다
  nuiSpreadMs:      320,  // 그림자가 바닥 전체로 번지는 시간
  nuiRiseMs:        110,  // 바늘 하나가 솟아 똥에 닿기까지 — 짧아야 "꿰뚫는다"
  nuiStaggerMs:      30,  // 바늘끼리 시차 (하이디에게 가까운 똥부터 바깥으로)
  nuiStaggerSpan:   450,  // 시차 총합 상한
  nuiHoldMs:        300,  // 다 꿰뚫은 뒤 바늘이 서 있는 틈
  nuiFadeMs:        260,  // 바늘이 가라앉고 그림자가 걷히는 시간
  nuiMinSpikes:      10,  // 똥이 적어도 최소 이만큼은 솟는다 (빈 바늘)
  nuiW:               6,  // 바늘 밑동 반폭(px)
  nuiPoints:         40,  // 꿰뚫은 똥 하나당 점수
  // 기폭찰 (사람 지시) — 꿰뚫은 자리에 붙었다가 그림자가 걷히면 연쇄로 터진다
  tagMax:            24,  // 붙는 부적 수 상한 (넘으면 점수만) — 폭발 스프라이트 수를 묶는다
  tagSize:         0.55,  // 부적 높이 (뿌요 크기 대비)
  tagBurnMs:        300,  // 불붙어 다 타기까지 (부적 1→3 컷)
  tagChainMs:        45,  // 부적끼리 터지는 시차 — 동시 폭발을 6개 안팎으로 묶는다
  tagBlastFps:       20,  // 폭발 8컷 속도 (8/20 = 0.4초)
  tagBlastSize:     1.6,  // 폭발 크기 (플레이어 키 대비)
  tagBlastR:       0.40,  // 폭발 판정 반경 (폭발 크기 대비)
  tagBlastPoints:    40,  // 폭발에 **새로** 휘말린 똥 하나당 점수 (부적 자리 똥은 이미 꿰뚫어 셌다)
  igniteLandDelayMs: 200, // 착지 후 만화경까지
  eyeMs:            900,  // 만화경 6컷 (눈 감음 → 뜸 → 손 → 망토 펼침 → 깃털 → 가라앉음)
  eyeCrowAt:       0.62,  // 이 진행도(5번째 컷 부근, 망토가 깃털로 흩어질 때)에 까마귀가 난다
  // 스사노오 (사람 지시) — 아마테라스 끝 무렵 뒤에서 솟아 올려 베고, 칼끝에서 검기가 날아간다
  susanooBeforeEndMs: 800, // 마지막 불기둥이 꺼지기 이만큼 전에 솟는다 (사람 지시: "끝나기 0.8초 전")
  susanooMs:       1500,  // 8컷 전체 길이
  susanooW:        0.85,  // 표시 크기 (화면 폭 대비, 정사각 칸)
  susanooAlpha:    0.88,  // 반투명 차크라
  susanooSlashFrame:  5,  // 올려 베는 컷 (0부터) — 이 컷에 검기를 날린다
  susanooEdge:     0.34,  // 화면 끝에서 스사노오 가운데까지 (스사노오 크기 대비) — 반쯤 걸쳐 서게
  swordWaveSpeed:   620,  // 검기 속도(px/s)
  swordWaveW:      0.46,  // 검기 표시 크기 (화면 폭 대비)
  swordWaveHitR:   0.38,  // 판정 반경 (검기 크기 대비)
  swordWavePoints:   70,  // 검기에 베인 똥 하나당 점수 (사람 지시: 70 — 하이디 나머지는 40)
  swordWaveFromX:  0.22,  // 검기가 나오는 자리 — 스사노오 가운데에서 앞으로 (키 대비)
  swordWaveFromY:  0.62,  //                   — 바닥에서 위로 (키 대비)
  igniteCrows:       12,  // 까마귀 수. 6 → 8 → 12 (사람 지시)
  crowMinRiseH:    0.30,  // 땅에서 화면 높이의 이만큼 **위에 있는** 똥만 노린다 (사람 지시: "아래쪽 똥에는
                         // 향하지 않게"). 목표가 없는 까마귀는 위로 날다 일정 시간 뒤 그 자리에서 불을 피운다
  crowSpeed:        480,  // 까마귀 최고 속도(px/s)
  crowLaunch:       260,  // 날아오르는 첫 속도 — 부채꼴로 위로 퍼진 뒤 목표로 꺾는다
  crowTurn:        0.14,  // 목표 쪽으로 꺾는 정도 (프레임당 보간 비율)
  crowFuseMs:      1000,  // 이 안에 똥을 못 맞히면 **그 자리에서** 아마테라스가 피어난다
                         // (사람 지시: "똥을 맞지 않고 일정 시간이 지난 경우 거기서 아마테라스")
  crowScale:       0.42,
  crowTiltMax:       28,  // 까마귀 기울기 상한(도). 목표가 아래면 머리를 곤두박질쳐 보였다 —
                         // 새는 몸을 거의 수평으로 두고 난다 (사람 판정: "아래를 향하기도")
  crowSpreadX:       34,  // 까마귀가 망토에서 흩어져 나오는 가로 폭(px). 한 점에서 나오면 겹쳐서 수가 안 읽혔다  // 까마귀 표시 크기 (플레이어 키 대비)
  // 아마테라스 **불기둥** — 까마귀가 닿은 자리(또는 못 닿고 멈춘 자리)에 4초 동안 선다.
  // 그 불에 닿는 똥은 불타 없어진다 (사람 지시). 옮겨붙기(전염 1회)는 이것으로 대신했다 —
  // 4초 동안 자리를 지키는 불이 떨어지는 똥을 계속 태우므로 번지는 효과가 이미 난다
  igniteFireMs:    4000,  // 불기둥 지속
  igniteFireSize:    72,  // 불기둥 표시 크기(px)
  igniteFireR:       30,  // 불기둥 판정 반경(px) — 불 몸통 가운데 기준
  igniteFireMax:     40,  // 한 번의 아마테라스로 태우는 최대 개수 (불기둥 전부 합쳐서)
  igniteBurnMs:     650,  // 불에 닿은 똥이 까맣게 타서 사라지는 시간
  kaitenLandDelayMs: 200, // 착지 후 백안까지
  byakuganMs:       450,  // 백안 — 정면으로 멈춰 눈에 힘. 이 틈이 "이제 돈다"를 예고한다
  kaitenMs:        4000,  // 회천 — 돌면서 돔을 유지하는 시간. 1100 → 4000 (사람 지시:
                         // "좌우 왔다갔다 하면서 4초 지속")
  kaitenMoveSpeed:  170,  // 돌면서 좌우로 미끄러지는 속도(px/s). 화면 끝에서 되돌아온다
  kaitenHitR:       185,  // 회천 **판정** 반경. 구 그림(deflectR 150)보다 크게 잡는다 —
                         // 판정은 똥의 중심으로 재서, 같게 두면 구에 닿아 보이는 똥이 안 튕겼다
                         // (사람 판정: "vfx 범위보다 좁은 거 같은데, 이펙트보다 조금 더 크게")
  kaitenTotal:       30,  // 한 번의 회천으로 없앨 총량 (직접 + 연쇄). 4초라 16 으로는 1초 만에 바닥난다
  kaitenGrowMs:     160,  // 돔이 확 펼쳐지는 시간
  kaitenFadeMs:     240,  // 끝에 돔이 흩어지는 시간
  // 마무리 — 팔괘 64장 (사람 지시). 회천 뒤 발밑에 팔괘 진, 2·4·8·16·32·64 장 박자로 연타
  hakkeBeats: [2, 4, 8, 16, 32, 64],  // 박자마다 치는 수 (진 안의 똥이 모자라면 있는 만큼)
  hakkeOpenMs:      350,  // 진이 펼쳐지는 시간
  hakkeBeatMs:      260,  // 박자 간격
  hakkeHoldMs:      450,  // 마지막 박자 뒤 진이 사라지기까지
  hakkeW:          1.05,  // 진 표시 폭 (화면 폭 대비)
  hakkeSquash:     0.30,  // 진을 바닥에 눕힌 비율 (세로/가로)
  hakkeR:          0.62,  // 판정 반경 (화면 폭 대비) — 네지 몸 가운데 기준
  hakkePalmSize:   2.00,  // 손바닥 타격 크기 (뿌요 크기 대비). 1.1 → 2.0 (사람 판정: "잘 안 보인다")
  kaitenFps:         16,  // 한 바퀴 6컷을 도는 속도 (16fps = 초당 약 2.7바퀴)
  kaitenPushEvery:  180,  // 도는 동안 몇 ms 마다 돔 안의 똥을 튕기나 (새로 들어온 똥도 튕긴다)
  kaitenDomeAlpha: 0.85,
  deflectTint: 0xc9a9ff,  // 회천 연보라
  cutinDepth:      110,  // HUD(10)보다 위. HackerAbility 오버레이와 같은 대역

  // 무기
  // **처음 값이 전부 너무 느렸다** (사람 실기 판정: "수리검들 이상하게 날라가고 너무 느려").
  // 레드 참새가 620px/s 인데 수리검이 520 이었다 — *던진* 무기가 *날아가는 새*보다
  // 느리면 던진 것으로 안 읽힌다.
  // **중력.** 셋 다 직선으로 날면 자로 그은 것 같아서 "이상하게" 보인다.
  // 무거운 쪽일수록 많이 처져 세 무기의 궤적이 저절로 갈린다
  // **마리를 7로 늘렸으면 한 발은 약해야 한다.** 18발이 다 세면 한 번에 판이 끝난다 —
  // 실측으로 화면의 똥 36개 중 34개가 지워졌다. 연출은 그대로 두고 판정만 좁혔다
  wpnPoints:         6,  // 무기가 지운 똥 하나당 점수. 15 → 9 → 6.
                         // 마리가 3 → 7 이 되면서 던지는 무기가 6발 → 18발이 됐다.
                         // 개당 점수를 그대로 두면 한 번에 들어오는 점수가 3배로 뛴다
  puyoLandMarginPx: 46,  // 표식이 화면 밖에 꽂히지 않게 물리는 여백(px)

  // ── 똥 ──
  puyoHitR:       34,    // 도약 구간의 경로 판정 반경(px)
  puyoPoints:     40,    // 돌진 구간이 지운 똥 하나당 점수. 20 → 40 (2026-09-27 사람 지시: "레드·하이디는 전부 40")
} as const;

export const HEIDI_DESC = {
  basicEffect:    `강아지 뿌요가 발밑을 돌아다닌다`,
  // 캐릭터 이름은 쓰지 않는다 — 화면에 나가는 글이다. 기술도 동작으로만 적는다
  specialAbility: `${HEIDI_PARAMS.puyoInterval}점마다 발동. 번갈아 두 가지를 쓴다 — ① 뿌요가 회오리 드릴이 되어 먼 쪽 벽까지 돌진했다 **튕겨 반대편으로 내리꽂히며** 경로의 일반 똥 제거 (+${HEIDI_PARAMS.puyoPoints}점/개) ② 화면 가운데로 뛰어올라 인을 맺고 **닌자 여덟 또는 뿌요 자신으로 변신**, 고유 기술로 똥을 쓸어낸다 — 순간이동 · 번개 돌진 · 회전 방어 · 검은 불꽃 · 그림자 묶기 · 몸통 구르기 · 세 겹 문 · 두꺼비 화염 · 그림자 분신 회오리`,
} as const;

export const RED_DESC = {
  basicEffect:    `참새 ${RED_PARAMS.sparrowCount}마리가 머리 위를 돈다 — ${RED_PARAMS.sparrowInterval}점마다 한 마리가 날아올라 **지나가는 길의 일반 똥을 전부** 격추 (+${RED_PARAMS.sparrowPoints}점/개)`,
  specialAbility: `참새를 다 쓰면 티라노가 나와 포효 — 반경 화면 폭의 ${Math.round(RED_PARAMS.trexRadiusW * 100)}% 안의 일반 똥 제거 (+${RED_PARAMS.trexPoints}점/개). ${Math.round(RED_PARAMS.robotChance * 100)}% 확률로 로봇이 대신 강하해 **화면 전체** 제거 (+${RED_PARAMS.robotPoints}점/개)`,
} as const;
