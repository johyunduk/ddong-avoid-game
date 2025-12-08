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
2. **GameScene** → 메인 게임플레이
3. 게임 오버 → ModeSelectScene으로 복귀

두 씬 모두 `src/main.ts`에 `[ModeSelectScene, GameScene]` 순서로 등록되어 있습니다.

### 게임 설정 (main.ts)
- 캔버스: 400×600px
- 배경: #87CEEB (하늘색) - 두 씬 모두 `background.png` 에셋 사용
- 물리: 중력 없는 Arcade Physics (떨어지는 오브젝트는 명시적 Y 속도 사용)
- 월드 경계: `physics.world.setBounds(15, 0, 370, 600)` - 플레이어를 화면 안에 유지
- 스케일 모드: FIT, 자동 중앙 정렬

### 게임 모드 (types/GameMode.ts)

#### CLASSIC 모드 (완전 구현됨)
- 떨어지는 똥(💩)을 피하는 기본 모드
- 3가지 난이도: EASY, NORMAL, HARD
- 동적 난이도 증가 (10초마다 속도/생성 주기 변화)
- 난이도별 다른 배경 이미지
- 이니셜 기반 리더보드 시스템

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

**플레이어 히트박스** (`objects/Player.ts:19-20`):
- 시각적 크기: 60×80px
- 히트박스: 400×750px, 오프셋 (340, 200)
- 의도적으로 시각보다 작게 설정하여 게임플레이를 더 관대하게 만듦
- 월드 경계와 충돌

**똥 히트박스** (`objects/Poop.ts:26`):
- 시각적 크기: 40×40px
- 히트박스: 500×500px (시각보다 훨씬 큼)
- 월드 경계와 충돌하지 않음
- Y > 화면 높이 + 50일 때 자동 파괴

**충돌은 overlap을 통해 감지됩니다** (GameScene.ts:64-70), collideWorldBounds를 통해서가 아닙니다.

### 난이도 증가

- 기본 난이도: `difficultyLevel = 2`
- 10초마다 (GameScene.ts:101-106):
  - `difficultyLevel += 0.3`
  - 똥 낙하 속도 증가: `200 + (difficultyLevel * 40)` 픽셀/초
  - 생성 지연 감소: `max(400ms, 1000 - (difficultyLevel * 80))`
- 각 생성마다 -200에서 -20 Y 사이의 랜덤 X 위치에 6개의 똥 생성

### 에셋 로딩

모든 에셋은 `public/assets/`에 있습니다:
- `background.png` - 도시 배경 (두 씬에서 모두 사용)
- `front.png`, `left.png`, `right.png` - 플레이어 스프라이트 (방향별)
- `poop.png` - 떨어지는 장애물
- `poop.mp3` - 배경 음악 (0.5 볼륨으로 루프)

에셋은 씬의 `preload()` 메서드에서 로드되며 문자열 키로 참조됩니다. 동일한 에셋 키는 씬 간에 재사용 가능합니다 (Phaser에 의해 캐시됨).

### 게임 상태 관리

- 점수는 100ms마다 1씩 증가 (GameScene.ts:93-98)
- 게임 오버 상태는 `gameOver` boolean 플래그로 관리
- 게임 오버 시 물리 일시정지, 씬 재시작 시 재개
- **중요**: 오디오 중복 재생을 방지하기 위해 씬 전환 전 반드시 `this.sound.stopAll()`로 모든 소리를 중지해야 함

### 조작

- 키보드: 좌/우 화살표 키
- 터치/마우스: 화면 좌/우측 탭 (플레이어 주변 20px 데드존)
- 플레이어 속도: 300 px/초 고정

## 공통 패턴

### 새로운 게임 오브젝트 생성

```typescript
export default class NewObject extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'texture-key');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDisplaySize(width, height);
    // 히트박스: body.setSize() 및 setOffset()
  }

  update() {
    // 프레임별 로직
  }
}
```

### 데이터와 함께 씬 전환

```typescript
// 씬 A에서
this.scene.start('SceneB', { gameMode: GameMode.CLASSIC });

// 씬 B에서
init(data: { gameMode?: GameMode }) {
  this.gameMode = data.gameMode;
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
- `GameScene.hitPoop()` (204번 줄)의 주석 처리된 코드

실제 Toss SDK 통합 시:
1. `@toss/games-sdk` 설치
2. `utils/tossSDK.ts`의 모의 구현 교체
3. GameScene의 SDK 호출 주석 해제
4. Toss Developer Console에 앱 등록

**참고**: npm run dev는 개발자가 직접 실행하므로 자동 실행하지 마세요.
