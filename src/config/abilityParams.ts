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
  synergyBurstInterval: 2000,
  synergyBurstBonus: 150,    // 매화×매화 버스트 발동 시 고정 보너스 점수
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
  basicEffect: `시작 시 보호막 ${SENTINEL_PARAMS.startShields}개 보유 (피격 흡수 시 주변 똥 전기로 제거, 제거된 똥 1개당 +10점)`,
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
  chessHeight:    72,   // 화면에 그릴 높이 (px)
  chessGroundY:   40,   // 화면 아래에서 이만큼 위가 바닥선 (플레이어 발밑과 같은 높이)
  chessStackMax:  10,   // 바닥에 이만큼 꽂히면 한꺼번에 사라진다
                        // 60점 × 10 = 600점마다 한 사이클
  chessFadeMs:    260,  // 사라지는 시간
  // ── 흡수 → 큐브 결합 타이밍 (src/config/cube-timeline.json 과 짝이다) ──
  // **늦게 떠난 말은 짧게 간다** (dur_i = chessSuckMs - delay_i). 출발만 어긋뜨리고
  // 도착은 한 시점에 모아야 시트의 결합 섬광과 맞는다. 지켜야 하는 부등식:
  //   (chessStackMax - 1) * chessFadeStep < chessSuckMs < cubeGatherMs
  //   = 9 × 28 = 252  <  500  <  600 ✓   (말 10개 기준)
  chessFadeStep:  28,   // 걷힐 때 말마다 어긋나는 **출발** 간격 (도착은 동시다)
  chessSuckMs:    500,  // 말이 몸 중앙에 닿는 시각 (= cube-timeline 의 pieceArriveMs)
  cubeGatherMs:   600,  // 시트의 결합 섬광 시각 (= cube-timeline 의 gatherMs)
  cubeShardMs:    100,  // 말이 조각으로 부서져 있는 시간 (500 → 600)
  cubeShards:     3,    // 말 하나가 부서지는 조각 수.
                        // 큐브 한 자세에서 보이는 칸이 26개라 **조각 수를 거기 맞춘다** —
                        // 조각이 칸으로 바뀌는 연출이라 수가 크게 어긋나면 전환이 안 읽힌다.
                        // 10말 × 3 = 30 ≈ 26 (말 7개 시절엔 7 × 4 = 28 이었다)
  cubeBurstMs:    1200, // 발동 후 파열까지 (= cubeForge 시트 길이 36f / 30fps)
  cubeTotalMs:    2000, // 연출 전체 길이
  cubeHitstopMs:  70,   // 파열 히트스톱. vfx 의 상한 200ms 안이고 물리는 멈추지 않는다
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
  // ── 큐브가 서는 자리 (화면 기준) ──
  // 플레이어를 따라다니지 않는다. 화면 좌표라 기기마다 같은 자리에 선다.
  // 세로 0.42 인 이유: 정확히 한가운데(0.5)면 플레이어의 회피 구역(H-80 부근)과 가깝고,
  // 더 위(0.3)면 점수 HUD 와 겹친다. 0.42 는 HUD 아래·플레이어 위의 빈 띠다
  cubeCenterX:    0.5,  // 화면 폭 대비
  cubeCenterY:    0.42, // 화면 높이 대비
  // ── 표시 배율 — 생성과 파열을 따로 잡는다 ──
  // 뭉치는 동안은 작게 두어 플레이 화면을 덜 가리고, 파열에서 제 크기로 튄다.
  // 0.72 인 이유는 182px 검수에서 한 면 3×3 이 읽히는 하한이 이 부근이기 때문이다
  // (큐브 몸통 116px → 84px, 칸 하나 약 28px).
  cubeForgeScale: 0.72, // 모임·결합·충전 (프레임 192px)
  // ── 반투명 — **표시 알파만** 건드린다. 시트에 알파를 굽지 않는다 ──
  // (구우면 원본 원화와 달라지고 되돌리기도 어렵다. verify-artwork.py 가 그걸 잡아낸다)
  //
  // 균일 알파는 **큐브 안쪽 대비를 배경과 무관하게 A배로만 줄인다** —
  //   (bg + A(x-bg)) - (bg + A(y-bg)) = A(x-y)
  // 배경이 식에서 사라지므로 밝은 배경이든 어두운 배경이든 체크 대비가 같다.
  // 시트 실측 아이보리 215 / 검은 칸 30 → 대비 186. 게임의 체스 말 스프라이트가 168 이라
  // 0.82 (대비 152) 면 같은 자리수다 → 3×3 판독이 안 무너진다
  cubeForgeAlpha: 0.82,
  // 파열은 화면 가로를 꽉 채우므로 더 옅게. **커질수록 더 옅어진다** —
  // 퍼지면서 가리는 면적이 커지니 알파로 상쇄한다
  cubeBlastAlpha:    0.72, // 파열 시작 (섬광 구간은 진해야 한다)
  cubeBlastAlphaEnd: 0.34, // 다 퍼졌을 때
  // 파열은 **화면 가로를 채운다.** 화면 폭이 기기마다 다르므로(Scale.RESIZE) 배율을
  // 상수로 박지 않고 런타임에 계산한다. 계산 기준은 프레임(256)이 아니라 **내용 폭** —
  // 프레임 안에 여백이 있으면 프레임 기준으로 맞춰도 그림이 화면에 안 닿는다.
  cubeBlastContentPx: 250, // 프레임 256 안에서 파편이 실제로 닿는 폭 (알파 bbox 실측)
  cubeBlastFillW:  1.0,    // 내용 폭이 화면 폭의 이 배 이상이 되게 한다
  cubeBlastScaleMax: 6,    // 안전 상한. 초광폭 화면에서 스프라이트가 무한정 커지지 않게
  // **정수 배율만 쓴다.** 1.76배 같은 소수 배율은 NEAREST 로도 어떤 픽셀은 2칸,
  // 어떤 픽셀은 1칸이 되어 격자가 불규칙해진다 — 픽셀 원화를 키우는 거라 치명적이다
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
  chessFireWide:  1.1,  // 불꽃 폭 (말 높이 대비)
  chessFireLong:  1.7,  // 불꽃 길이 (말 높이 대비) — 코끝에서 뒤로 뻗는다
  chessFireLead:  0.18, // 말 코끝에서 앞으로 띄우는 거리 (말 높이 대비)
  chessFireAlpha: 0.95, // 불꽃이 가장 짙을 때의 알파
  chessPoopPoints: 20,  // 낙하 경로에서 깨뜨린 똥 하나당 점수
  cubeBurstPoints: 100, // 큐브 파열 **정액** 보너스. 지운 똥 개수와 무관하다.
                        // 이 점수로 다시 낙하가 걸리지 않게 TedAbility 가 먼저
                        // lastChessScore 를 올린 뒤 준다 (smashPoops 와 같은 가드)
  chessHitRadius:  26,  // 경로 판정 반경 (px) — 말 반폭 + 똥 반폭
} as const;

export const TED_DESC = {
  basicEffect:    `${TED_PARAMS.chessInterval}점마다 체스 말 하나가 하늘에서 비스듬히 날아와 바닥에 꽂힌다 — 경로상 똥 제거 (+${TED_PARAMS.chessPoopPoints}점/개)`,
  specialAbility: `말 ${TED_PARAMS.chessStackMax}개가 쌓이면 화면 한가운데로 모였다가 사방으로 퍼진다 — 퍼지는 말이 지나간 자리의 일반 똥 제거 (+${TED_PARAMS.chessPoopPoints}점/개, 발동 +${TED_PARAMS.cubeBurstPoints}점)`,
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
  sparrowPoints:   30,   // 참새가 부순 똥 하나당 점수. 25 → 30 (사람 지시).
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
  trexPoints:      25,   // 포효로 지운 똥 하나당 점수 (20 → 25)
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
  robotPoints:     30,   // 전체 삭제로 지운 똥 하나당 점수 (25 → 30)
} as const;

// ── 하이디 (SR) — 동반자 강아지 "뿌요" ──────────────────────────────────────
// 시트 목록이 여기 있는 이유는 레드와 같다: `character.ts`(데이터)와 `HeidiAbility`(행동)가
// 둘 다 봐야 하는데, 능력 파일에 두면 데이터가 행동을 import 하게 된다.
export const HEIDI_PUYO_SHEETS = {
  walk:   'puyo_walk_128x128.png',
  idle:   'puyo_idle_128x128.png',
  crouch: 'puyo_crouch_128x128.png',
  jump:   'puyo_jump_128x128.png',
  kick:   'puyo_kick_128x128.png',
  wall:   'puyo_wall_128x128.png',
} as const;
/**
 * `character.ts` 의 `extraFxSheets` 에 그대로 들어간다 (하이디를 고른 판에서만 올라간다).
 *
 * `puyo_spin_128x128.png` 는 **일부러 빠져 있다** — 회오리를 치며 도는 연출을 빼고
 * 그냥 점프로 바꿨다. 파일은 `public/assets/fx/sheets/` 에 그대로 두었고
 * (되살리려면 여기 한 줄), 안 올리는 만큼 VRAM 0.50MB 가 준다.
 */
export const HEIDI_SHEETS: string[] = Object.values(HEIDI_PUYO_SHEETS);

// 뿌요는 땅에서 혼자 좌우로 돌아다니다가 일정 점수마다 **먼 쪽 화면 끝까지 도약해
// 벽을 짚고, 내려오면서 반대편까지 날라차기로 가로지른다.** 지나간 길의 일반 똥이
// 부서진다. 자세한 설계는 docs/fx-heidi-puyo.md.
export const HEIDI_PARAMS = {
  // ── 배회 ──
  puyoScale:      0.62,  // 플레이어 표시 높이 대비 (80px → 50px). 태이는 0.8 인데
                         // 뿌요는 강아지라 더 작아야 사람 옆에 선 개로 읽힌다
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
  puyoJumpMs:     560,   // ① 도약 — 지금 자리에서 먼 쪽 화면 끝까지
  puyoRiseH:      0.12,  // 도약 중간의 **웃자람**(화면 높이 대비). 끝점이 이미 높으므로
                         // 예전처럼 크게 잡으면 화면 위로 튀어나간다
  puyoWallH:      0.42,  // 벽을 짚는 높이 (바닥에서, 화면 높이 대비)
  puyoWallMargin: 6,     // 짚을 때 스프라이트 바깥 끝과 화면 끝 사이 간격(px)
  puyoWallMs:     260,   // ② 벽에 붙어 버티는 시간. 접촉 → 웅크림 → 차기의 3컷이 여기서 돈다
  puyoKickMs:     520,   // ③ 날라차기 — 벽을 밀고 반대편으로 대각선 하강
  puyoLandW:      0.70,  // 착지점 — **짚은 벽에서** 화면 폭의 이만큼 간 자리.
                         // 가장자리(46px)에 박아 두면 끝에 처박혔다가 반대쪽 도약
                         // 대기 지점까지 한참을 걸어 돌아와야 한다. 안쪽으로 당기면
                         // 착지와 다음 대기 지점이 가까워져 되돌아 걷는 거리가 준다
  puyoKickHitR:   48,    // 하강 중 판정 반경. 뻗은 발만큼 넓다 (도약 구간은 34)
  puyoKickPoints: 30,    // 하강 중 지운 똥 하나당 점수 (도약 구간은 20)

  // ── 똥 ──
  puyoHitR:       34,    // 도약 구간의 경로 판정 반경(px)
  puyoPoints:     20,    // 도약 구간이 지운 똥 하나당 점수 (테드 낙하와 같은 값)
} as const;

export const HEIDI_DESC = {
  basicEffect:    `강아지 뿌요가 발밑을 돌아다닌다`,
  specialAbility: `${HEIDI_PARAMS.puyoInterval}점마다 뿌요가 웅크렸다 먼 쪽 화면 끝까지 도약 — 경로의 일반 똥 제거 (+${HEIDI_PARAMS.puyoPoints}점/개). 화면을 짚고 **날라차기로 반대편까지 하강**하며 더 넓게 쓸어낸다 (+${HEIDI_PARAMS.puyoKickPoints}점/개)`,
} as const;

export const RED_DESC = {
  basicEffect:    `참새 ${RED_PARAMS.sparrowCount}마리가 머리 위를 돈다 — ${RED_PARAMS.sparrowInterval}점마다 한 마리가 날아올라 **지나가는 길의 일반 똥을 전부** 격추 (+${RED_PARAMS.sparrowPoints}점/개)`,
  specialAbility: `참새를 다 쓰면 티라노가 나와 포효 — 반경 화면 폭의 ${Math.round(RED_PARAMS.trexRadiusW * 100)}% 안의 일반 똥 제거 (+${RED_PARAMS.trexPoints}점/개). ${Math.round(RED_PARAMS.robotChance * 100)}% 확률로 로봇이 대신 강하해 **화면 전체** 제거 (+${RED_PARAMS.robotPoints}점/개)`,
} as const;
