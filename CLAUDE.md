# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소의 코드로 작업할 때 참고할 가이드를 제공합니다.

## 프로젝트 개요

Toss 인앱 통합을 위해 설계된 Phaser 3 하이퍼 캐주얼 게임("똥 피하기 게임")입니다. 플레이어는 떨어지는 장애물을 피하며 시간이 지날수록 난이도가 증가합니다.

## 개발 명령어

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (http://localhost:5173)
npm run dev

# 파일 출력 없이 타입 검사
npx tsc --noEmit

# 프로덕션 빌드 (dist/ 폴더에 출력)
npm run build

# 프로덕션 빌드 미리보기
npm run preview
```

## TypeScript 설정 제약사항

이 프로젝트는 특정 패턴을 요구하는 **엄격한 TypeScript 설정**을 사용합니다:

### verbatimModuleSyntax = true
- 타입 전용 import는 반드시 `type` 키워드를 사용해야 함
- ✅ `import { type GameModeConfig } from '../types/GameMode'`
- ❌ `import { GameModeConfig } from '../types/GameMode'`

### erasableSyntaxOnly = true
- 런타임 코드를 생성하는 TypeScript 문법 사용 금지 (enum, namespace 등 불가)
- enum 대신 `as const`와 함께 `const` 객체 사용
- ✅ `export const GameMode = { CLASSIC: 'classic' } as const`
- ❌ `export enum GameMode { CLASSIC = 'classic' }`

**변경 후 항상 `npx tsc --noEmit`을 실행하여 TypeScript 규칙 준수를 확인하세요.**

## 아키텍처

### 씬 흐름
1. **ModeSelectScene** (진입점) → 사용자가 게임 모드 선택
2. **DifficultySelectScene** → 난이도 선택 (EASY, NORMAL, HARD)
3. **GameScene** → 메인 게임플레이
4. **LeaderboardScene** → 난이도별 랭킹 조회
5. 게임 오버 → ModeSelectScene으로 복귀

씬들은 `src/main.ts`에 순서대로 등록되어 있습니다.

### 게임 설정 (main.ts)
- 캔버스: 400×600px
- 배경: 난이도/모드별 다양한 배경 이미지 사용
- 물리: 중력 없는 Arcade Physics (떨어지는 오브젝트는 명시적 Y 속도 사용)
- 월드 경계: `physics.world.setBounds(15, 0, 370, 600)` - 플레이어를 화면 안에 유지
- 스케일 모드: FIT, 자동 중앙 정렬

### 게임 모드 (types/GameMode.ts)

#### CLASSIC 모드 (완전 구현됨)
- 떨어지는 똥(💩)을 피하는 기본 모드
- 3가지 난이도: EASY, NORMAL, HARD
- 동적 난이도 증가 (10초마다 속도/생성 주기 변화)
- 난이도별 다른 배경 이미지 (background.png, background2.png, background3.png)
- 이니셜 기반 리더보드 시스템 (Firebase 연동)
- **보너스 아이템 시스템**:
  - 금똥 (🏆): 40점마다 1개 생성, 수집 시 +20점
  - 다이아똥 (💎): 100점마다 1개 생성, 수집 시 +40점
  - 40점과 100점이 겹치는 경우(200, 400 등) 둘 다 생성됨
- **크리스마스 이벤트**: 12월~1월에는 크리스마스 테마 똥 + 전용 배경 + BGM

#### ITEM 모드 (기본 구현 완료, 개선 필요)
**테마**: 우주 배경 + 우주비행사 캐릭터 + 별(☆)이 장애물

**현재 구현 상태**:
- 별이 똥 대신 떨어짐 (1.5초마다 6개 생성, 고정 속도 200px/s)
- 수집 가능한 아이템 3종:
  - `hermes_shoes`: 10초간 속도 2배 (노란색 틴트)
  - `rainbow_star`: 5초간 무적 (무지개 색상 순환)
  - `light_saber`: 미구현
- 우주 배경 + 전용 BGM (`star_fall.mp3`)
- 난이도 증가 없음 (고정 난이도)
- 아이템 획득 시 점수 +100 보너스

**현재 문제점**:
- 클래식 모드와 게임플레이가 거의 동일 (단순히 장애물 피하기만)
- 전략적 깊이나 의미있는 선택권 부족
- 아이템이 단순 스탯 버프에 불과, 상호작용 없음
- 비주얼 테마 외에 클래식 모드와 차별점 부족

**개선 방향 제안**:
1. **Risk-Reward 시스템**: Near miss 보너스, 위험 지대별 점수 배율
2. **아이템 콤보/융합**: 같은 아이템 연속 획득 시 강화 효과, 2종류 조합 시 새 능력
3. **Light Saber 공격 메커니즘**: 터치로 별 베기 → 능동적 플레이 추가
4. **Phase 시스템**: 시간별로 패턴 변화, 보스 스테이지 등장
5. **물리 기반 메커니즘**: 자석(오브젝트 끌어당김), 중력 반전, 슬로우 필드

**권장 조합**: Light Saber(공격) + 아이템 콤보 → 회피 vs 공격 선택권 제공

### 물리 & 충돌 시스템

**플레이어 히트박스** (`objects/Player.ts`):
- 시각적 크기: 60×80px
- 히트박스: 400×750px, 오프셋 (340, 200)
- 의도적으로 시각보다 작게 설정하여 게임플레이를 더 관대하게 만듦
- 월드 경계와 충돌
- 난이도별 이동 속도 차이 (EASY: 350, NORMAL: 300, HARD: 250)

**일반 똥 히트박스** (`objects/Poop.ts`):
- 시각적 크기: 40×40px
- 히트박스: 500×500px (시각보다 넉넉하게)
- 월드 경계와 충돌하지 않음
- Y > 화면 높이 + 50일 때 자동 파괴
- 5가지 일반 똥 + 5가지 크리스마스 똥 (시즌별)

**금똥/다이아똥 히트박스** (`objects/GoldPoop.ts`, `objects/DiamondPoop.ts`):
- 시각적 크기: 40×40px
- 히트박스: 450×450px (수집하기 쉽게 조금 더 넉넉)
- depth: 100 (다른 오브젝트보다 위에 렌더링)
- 낙하 속도: 일반 똥과 동일 (난이도에 따라 조정)

**충돌 감지**: `overlap`을 통해 감지 (GameScene.ts), `collideWorldBounds`가 아님.

### 점수 시스템

#### 기본 점수
- 매 100ms마다 +1점 자동 증가 (`updateScore()` 타이머)
- 실시간 최고 점수 갱신

#### 보너스 점수 (건너뛰기 방지 메커니즘)
점수가 한 번에 큰 폭으로 증가할 때 중간 생성 포인트를 건너뛰지 않도록 설계:

```typescript
// updateScore(amount) 메서드
// - oldScore부터 newScore까지 1점씩 순회하며 생성 조건 체크
// - 예: 95점 → (+20) → 115점 시, 100점 체크하여 다이아똥 생성
private checkMissedSpawnPoints(oldScore: number, newScore: number) {
  for (let score = oldScore + 1; score <= newScore; score++) {
    if (score % 40 === 0 && score > this.lastGoldPoopScore) {
      this.spawnGoldPoop();
    }
    if (score % 100 === 0 && score > this.lastDiamondPoopScore) {
      this.spawnDiamondPoop();
    }
  }
}
```

**보너스 점수**:
- 금똥 수집: +20점
- 다이아똥 수집: +40점
- 아이템 수집 (ITEM 모드): +100점

**중요**: 씬 재시작 시 `init()` 메서드에서 반드시 초기화:
```typescript
this.score = 0;
this.lastGoldPoopScore = 0;
this.lastDiamondPoopScore = 0;
```

### 난이도 시스템

난이도별 설정 (`types/GameMode.ts` - DIFFICULTIES 배열):

| 난이도 | 플레이어 속도 | 기본 낙하 속도 | 생성 주기 |
|--------|--------------|---------------|----------|
| EASY   | 350 px/s     | 180 px/s      | 1200ms   |
| NORMAL | 300 px/s     | 200 px/s      | 1000ms   |
| HARD   | 250 px/s     | 220 px/s      | 800ms    |

**동적 난이도 증가** (10초마다):
- `difficultyLevel += 0.3`
- 낙하 속도 증가: `baseSpeed + (difficultyLevel * 40)` px/s
- 생성 주기 감소: `max(400ms, spawnDelay - (difficultyLevel * 80))`
- 각 생성마다 랜덤 X 위치에 6개의 똥 생성

### 크리스마스 이벤트 시스템

**시즌 체크** (`utils/seasonChecker.ts`):
```typescript
// 12월 또는 1월이면 크리스마스 시즌
function isChristmasSeason(): boolean
```

**크리스마스 모드 적용**:
- 배경: `xmas_background.png`
- BGM: `xmas_poop.mp3` (징글벨 리믹스)
- 똥 이미지: 5가지 크리스마스 테마 똥
  - `xmas_poop_ribbon` (선물 리본)
  - `xmas_poop_nose` (루돌프 코)
  - `xmas_poop_santa` (산타 모자)
  - `xmas_poop_rudolf` (루돌프)
  - `xmas_poop_beard` (산타 수염)

### 리더보드 시스템

**구현** (`utils/leaderboard.ts`, `scenes/LeaderboardScene.ts`):
- Firebase Realtime Database 연동
- 난이도별 독립적인 랭킹 관리
- 이니셜 입력 시스템 (3자리)
- 상위 10명 표시
- 새 기록 달성 시 하이라이트 표시

**데이터 구조**:
```
leaderboard/
  ├─ easy/
  ├─ normal/
  └─ hard/
      └─ [entry_id]/
          ├─ initials: "AAA"
          ├─ score: 1234
          └─ timestamp: 1234567890
```

### 에셋 로딩

모든 에셋은 `public/assets/`에 있습니다:

**배경 이미지**:
- `background.png` - EASY 난이도 배경
- `background2.png` - NORMAL 난이도 배경
- `background3.png` - HARD 난이도 배경
- `space_background.png` - ITEM 모드 배경
- `xmas_background.png` - 크리스마스 이벤트 배경

**플레이어 스프라이트**:
- `front.png`, `left.png`, `right.png` - 일반 캐릭터
- `astronaut_front.png`, `astronaut_left.png`, `astronaut_right.png` - 우주비행사

**똥 이미지** (14개):
- 5개 일반: `poop.png`, `poop_glasses.png`, `poop_sunglass.png`, `poop_sunglass2.png`, `poop_smile.png`
- 2개 보너스: `gold_poop.png`, `diamond_poop.png`
- 5개 크리스마스: `xmas_poop_*`

**별 이미지** (ITEM 모드):
- `star.png`, `star_smile.png`, `star_glasses.png`, `star_sunglass.png`

**아이템 이미지**:
- `hermes_shoes.png`, `light_saber.png`, `rainbow_star.png`

**오디오**:
- `poop.mp3` - 기본 BGM
- `star_fall.mp3` - ITEM 모드 BGM
- `xmas_poop.mp3` - 크리스마스 BGM

에셋은 씬의 `preload()` 메서드에서 로드되며 문자열 키로 참조됩니다. 동일한 에셋 키는 씬 간에 재사용 가능합니다 (Phaser에 의해 캐시됨).

### 게임 상태 관리

**Phaser 씬 생명주기**:
```
씬 시작: init() → preload() → create() → update() (반복)
씬 재시작: shutdown() → init() → preload() → create() → update() (반복)
```

**중요**:
- `init()` 메서드에서 게임 상태 변수를 초기화해야 함 (클래스 프로퍼티는 유지됨)
- 씬 전환 전 반드시 `this.sound.stopAll()`로 모든 소리를 중지해야 함
- 게임 오버 시 물리 일시정지: `this.physics.pause()`
- 씬 재시작 시 물리 자동 재개

**초기화 필수 변수**:
```typescript
init() {
  this.score = 0;
  this.gameOver = false;
  this.difficultyLevel = 2;
  this.lastGoldPoopScore = 0;
  this.lastDiamondPoopScore = 0;
}
```

### 조작

- 키보드: 좌/우 화살표 키
- 터치/마우스: 화면 좌/우측 탭 (플레이어 주변 20px 데드존)
- 플레이어 속도: 난이도별 차등 (EASY: 350, NORMAL: 300, HARD: 250 px/s)

## 공통 패턴

### 새로운 게임 오브젝트 생성

```typescript
export default class NewObject extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'texture-key');

    // 원점을 중앙으로
    this.setOrigin(0.5);

    // 씬에 추가
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 크기 설정
    this.setDisplaySize(width, height);

    // 히트박스 설정
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setSize(hitboxWidth, hitboxHeight);
      body.setCollideWorldBounds(false);
      body.setVelocityY(fallSpeed);
    }

    // 렌더링 순서 (선택사항)
    this.setDepth(100);
  }

  update() {
    // 화면 밖으로 나가면 제거
    if (this.y > this.scene.cameras.main.height + 50) {
      this.destroy();
    }
  }
}
```

### 보너스 아이템 생성 패턴

```typescript
// 1. 그룹 생성 (create)
this.goldPoops = this.physics.add.group({
  classType: GoldPoop,
  runChildUpdate: true
});

// 2. 충돌 감지 (create)
this.physics.add.overlap(
  this.player,
  this.goldPoops,
  this.collectGoldPoop as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
  undefined,
  this
);

// 3. 생성 메서드
private spawnGoldPoop() {
  const goldPoop = new GoldPoop(this, x, y);
  this.goldPoops.add(goldPoop, true);
  if (goldPoop.body) {
    goldPoop.body.velocity.y = fallSpeed;
  }
}

// 4. 수집 메서드 (updateScore 사용)
private collectGoldPoop(player, goldPoop) {
  goldPoop.destroy();
  this.updateScore(20); // 건너뛰기 방지 메커니즘 포함
}
```

### 데이터와 함께 씬 전환

```typescript
// 씬 A에서
this.scene.start('SceneB', { gameMode: GameMode.CLASSIC, difficulty: Difficulty.HARD });

// 씬 B에서
init(data: { gameMode?: GameMode; difficulty?: Difficulty }) {
  // 상태 초기화
  this.score = 0;

  // 데이터 수신
  if (data.gameMode) {
    this.gameMode = data.gameMode;
  }
  if (data.difficulty) {
    this.difficulty = data.difficulty;
  }
}
```

### 새 씬 추가하기

1. `src/scenes/`에 씬 클래스 생성
2. `main.ts` config의 씬 배열에 import 및 추가
3. `this.scene.start('SceneName')`으로 전환

## 향후 Toss SDK 통합

코드베이스에는 Toss Games SDK 통합을 위한 placeholder가 있습니다:
- `src/types/toss-sdk.d.ts`의 타입 정의
- `src/utils/tossSDK.ts`의 모의 유틸리티
- `GameScene.hitPoop()`의 주석 처리된 코드

실제 Toss SDK 통합 시:
1. `@toss/games-sdk` 설치
2. `utils/tossSDK.ts`의 모의 구현 교체
3. GameScene의 SDK 호출 주석 해제
4. Toss Developer Console에 앱 등록

**참고**: npm run dev는 개발자가 직접 실행하므로 자동 실행하지 마세요.

## 디버깅 팁

### 콘솔 로그 확인
- 금똥/다이아똥 생성 시 콘솔에 로그 출력
- 브라우저 개발자 도구 (F12) → Console 탭에서 확인

### 타입 에러 확인
```bash
npx tsc --noEmit
```

### 흔한 문제들

1. **보너스 아이템이 안 나옴**:
   - 점수가 정확히 40/100점인지 확인
   - 콘솔 로그 확인
   - `lastGoldPoopScore`/`lastDiamondPoopScore` 초기화 확인

2. **게임 재시작 시 이상함**:
   - `init()` 메서드에서 모든 상태 변수 초기화 확인
   - `this.sound.stopAll()` 호출 확인

3. **히트박스가 이상함**:
   - `body.setSize()`와 `setDisplaySize()`를 혼동하지 말 것
   - depth 설정으로 렌더링 순서 조정

4. **점수가 이상하게 증가함**:
   - `updateScore(amount)` 메서드 사용 확인
   - 직접 `this.score +=` 하면 건너뛰기 방지 안 됨
