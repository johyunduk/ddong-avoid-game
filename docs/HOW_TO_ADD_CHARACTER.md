# 신규 캐릭터 추가 가이드

새 캐릭터를 게임에 추가할 때 건드려야 하는 파일 목록과 각 단계별 작업 내용입니다.  
이 문서는 `gumi` 캐릭터 추가 작업(2026-04-21)을 기준으로 작성되었습니다.

---

## 1. 에셋 준비

### 필요한 파일 (WebP 형식)
| 파일 경로 | 설명 |
|-----------|------|
| `public/assets/players/{id}_front.webp` | 정면 스프라이트 (게임 플레이 + 카드 썸네일) |
| `public/assets/players/{id}_left.webp` | 왼쪽 이동 스프라이트 |
| `public/assets/players/{id}_right.webp` | 오른쪽 이동 스프라이트 (left를 좌우 반전) |
| `public/assets/illustrations/{id}.webp` | 캐릭터 일러스트 (선택화면 상세 패널 배경) |
| `public/assets/vids/{id}.mp4` | 캐릭터 영상 (선택화면 일러스트 탭 클릭 시 재생, 없어도 무방) |

### PNG/JPEG → WebP 변환 (ImageMagick)
```bash
# 일반 변환
magick input.png output.webp

# 좌우 반전 (right 스프라이트 생성)
magick left.png -flop right.webp
```

> **주의**: 파일명은 확장자와 무관하게 실제 포맷이 JPEG일 수도 있습니다.  
> `file` 명령어로 실제 포맷을 확인한 후 변환하세요.

---

## 2. 수정 파일 목록 (필수)

### 2-1. `src/config/abilityParams.ts`
캐릭터 능력 수치와 설명 문자열을 추가합니다.

```typescript
// ── 구미 (Gumi / SR) ──────────────────────────────────────────────────
export const GUMI_PARAMS = {
  speedBonus: 30,
  invincibleInterval: 150,
  invincibleDuration: 1500,
} as const;

export const GUMI_DESC = {
  basicEffect: `이동 속도 +${GUMI_PARAMS.speedBonus}px/s`,
  specialAbility: `${GUMI_PARAMS.invincibleInterval}점마다 ${GUMI_PARAMS.invincibleDuration / 1000}초간 무적 + 주변 똥 밀어내기`,
} as const;
```

**포인트**: `PARAMS`와 `DESC`를 분리해 수치만 바꾸면 설명 문자열이 자동 갱신됩니다.

---

### 2-2. `src/abilities/{CharId}Ability.ts` (신규 생성)
`BaseAbility`를 상속해 필요한 메서드만 오버라이드합니다.

```typescript
import { BaseAbility } from './BaseAbility';
import type { GameSceneAPI } from './types';
import { GUMI_PARAMS } from '../config/abilityParams';

export class GumiAbility extends BaseAbility {
  override getPlayerSpeedBonus(): number { return GUMI_PARAMS.speedBonus; }
  override onScoreMilestone(score: number, api: GameSceneAPI): void { /* ... */ }
  override onHitPoop(api: GameSceneAPI): boolean { /* true = 게임오버 방지 */ return false; }
  override onDestroy(_api: GameSceneAPI): void { /* 타이머/Tween 정리 */ }
}
```

**오버라이드 가능한 주요 훅**:
| 메서드 | 용도 |
|--------|------|
| `getPlayerSpeedBonus()` | 플레이어 이동속도 추가 |
| `getTickScore(base)` | 점수 증가량 조작 (예: 1.1배) |
| `getSpawnIntervals()` | 특수 똥 생성 주기 단축 |
| `onScoreMilestone(score, api)` | N점마다 특수 효과 발동 |
| `onCollectSpecial(type)` | 특수 똥 수집 추가 보너스 |
| `onHitPoop(api)` | 피격 시 true 반환 → 게임오버 방지 |
| `overrideSpawnPoop(api)` | 일반 똥 스폰 완전 대체 |
| `onAfterSpawnPoop(api)` | 스폰 후 사후 처리 |
| `onUpdate(api)` | 매 프레임 실행 (분신 추적 등) |
| `onDestroy(api)` | 씬 종료 시 정리 |

---

### 2-3. `src/abilities/index.ts`
import 추가 + switch 분기 추가.

```typescript
import { GumiAbility } from './GumiAbility';

// switch 분기
case 'gumi': return new GumiAbility(awakeningLevel);
```

---

### 2-4. `src/utils/character.ts`
`CHARACTERS` 배열에 캐릭터 정의를 추가합니다.

```typescript
import { GUMI_DESC } from '../config/abilityParams';

// CHARACTERS 배열 안에 추가 (등급 순서: UR → SR → R)
{
  id: 'gumi',
  name: '구미',
  grade: 'SR',
  gradeColor: '#4488ff',
  imageKey: 'gumi_front',
  imagePath: 'assets/players/gumi_front.webp',
  illustKey: 'illust_gumi',
  illustPath: 'assets/illustrations/gumi.webp',
  videoKey: 'vid_gumi',          // 영상 없으면 이 두 줄 제거
  videoPath: 'assets/vids/gumi.mp4',
  basicEffect: GUMI_DESC.basicEffect,
  specialAbility: GUMI_DESC.specialAbility,
},
```

**등급별 gradeColor**:
- R: `#44cc88`
- SR: `#4488ff`
- UR: `#ffaa00`

---

### 2-5. `src/scenes/GameScene.ts`
`CHARS_WITH_SPRITES` 배열에 캐릭터 id를 추가합니다.

```typescript
private static readonly CHARS_WITH_SPRITES = [
  // ... 기존 목록 ...
  'gumi',  // ← 여기 추가
];
```

이 목록에 없으면 게임 중 치비 스프라이트로 fallback됩니다.

---

## 3. 수정 파일 목록 (서버/가챠)

### 3-1. `supabase/functions/gacha-pull/index.ts`
뽑기 풀에 캐릭터를 추가하고 SR 가중치를 재계산합니다.

```typescript
// SR 종수가 늘어날 때마다 재계산
const SR_W = 19.3 / 8;  // 8종이면 ≈ 2.413%

const POOL = [
  // ...
  { id: 'gumi', grade: 'SR', weight: SR_W },
  // ...
];
```

**배포 명령어** (변경 후 반드시 실행):
```bash
supabase functions deploy gacha-pull --no-verify-jwt
```

---

## 4. 자동 처리 (별도 작업 불필요)

| 항목 | 이유 |
|------|------|
| 캐릭터 선택 화면 표시 | `CharacterSelectScene.preload()`이 `CHARACTERS` 배열을 순회해 자동 로드 |
| 가챠 결과 화면 카드 표시 | `GachaScene`도 동일 패턴 |
| 각성 시스템 | `getAwakeningLevel(grade, count)` 함수가 등급 기반으로 처리 |
| 보유 목록 저장 | `addOwnedCharacter(id)` 함수가 id만으로 처리 |
| 서버 DB 동기화 | `syncOwnedCharacters()`이 서버 `user_characters` 테이블 기반으로 동기화 |

---

## 5. 체크리스트

```
[ ] public/assets/players/{id}_front.webp
[ ] public/assets/players/{id}_left.webp
[ ] public/assets/players/{id}_right.webp   ← left를 좌우 반전
[ ] public/assets/illustrations/{id}.webp
[ ] public/assets/vids/{id}.mp4             ← 선택사항
[ ] src/config/abilityParams.ts             ← PARAMS + DESC 추가
[ ] src/abilities/{CharId}Ability.ts        ← 신규 생성
[ ] src/abilities/index.ts                  ← import + case 추가
[ ] src/utils/character.ts                  ← CHARACTERS 배열 + import
[ ] src/scenes/GameScene.ts                 ← CHARS_WITH_SPRITES 배열
[ ] supabase/functions/gacha-pull/index.ts  ← POOL + SR_W 재계산
[ ] npx tsc --noEmit                        ← 타입 에러 확인
[ ] supabase functions deploy gacha-pull --no-verify-jwt
```
