# 메모리 누수 & 성능 수정 — 변경 전후 정리

> 작성일: 2026-03-08 | 브랜치: dev | 커밋 범위: f06e329 → c95ccb1

---

## Fix #0 — 똥 낙하 버벅임 수정 (`src/main.ts`)

**증상**: 똥이 매끄럽게 내려오지 않고 간헐적으로 끊김

### Before
```ts
// main.ts Phaser.Game config
{
  // smoothStep, fps.target, roundPixels 설정 없음 (기본값 사용)
  // smoothStep 기본값 = false → 델타타임 평균화 없음
  // fps.target 미지정 → 브라우저 리프레시율에 위임
  // roundPixels 기본값 = false → 부동소수점 좌표 그대로 렌더링
}
```

### After
```ts
{
  fps: { target: 60 },   // 60fps 고정 타겟
  smoothStep: true,      // 델타타임 지수 평균화 → 프레임 간 진동 감소
  roundPixels: true,     // 스프라이트 좌표를 정수로 반올림 → 서브픽셀 흔들림 제거
}
```

**원인 분석**: `smoothStep: false`일 때 매 프레임 델타타임이 그대로 사용되어 16ms/17ms가 교대로 들어오면 오브젝트 위치가 1px씩 진동. `roundPixels: true`가 없으면 부동소수점 좌표가 GPU 텍스처 샘플링 경계를 매 프레임 가로질러 흔들림이 시각적으로 보임.

---

## Fix #1 — 비디오 HTMLVideoElement src 누수 (`src/scenes/CharacterSelectScene.ts`)

**증상**: 캐릭터 상세 패널을 열었다 닫을 때마다 비디오 디코더 메모리가 해제되지 않음

### Before
```ts
// showCharacterDetail() 내부
const videoObj = this.add.video(200, 320, char.videoKey);
videoObj.play(true);
// ...

// hideCharacterDetail()에서
this.detailPanel?.destroy();  // ← Phaser GameObject는 destroy되지만
                               //   HTMLVideoElement.src는 여전히 남아 있음
                               //   브라우저는 비디오 리소스를 메모리에 유지
```

### After
```ts
// 클래스 프로퍼티 추가
private detailVideo: Phaser.GameObjects.Video | null = null;
private fitVideoTimers: Phaser.Time.TimerEvent[] = [];

// showCharacterDetail()에서 ref 저장
this.detailVideo = this.add.video(200, 320, char.videoKey);

// fitVideoToPanel()에서 타이머 추적
this.fitVideoTimers.push(this.time.delayedCall(100, applyContain));
this.fitVideoTimers.push(this.time.delayedCall(500, applyContain));

// hideCharacterDetail()에서 명시적 정리
for (const t of this.fitVideoTimers) t.remove();
this.fitVideoTimers = [];
if (this.detailVideo) {
  this.detailVideo.stop();
  const el: HTMLVideoElement | null = (this.detailVideo as any).video ?? null;
  if (el) { el.src = ''; }  // src 비워서 브라우저가 리소스 해제하도록 유도
  this.detailVideo = null;
}
```

**핵심**: Phaser `Video.destroy()`는 Phaser GameObject만 파괴하고 내부 `<video>` 엘리먼트의 `src`는 건드리지 않음. `el.src = ''`로 명시적으로 비워야 브라우저가 디코더 및 네트워크 리소스를 해제함.

---

## Fix #2 — Timer delayedCall 미추적 (`src/abilities/LegacyAbility.ts`)

**증상**: 레거시 캐릭터 사용 중 게임 오버 시 타이머 콜백이 계속 실행될 수 있음

### Before
```ts
// 타이머 반환값을 로컬 변수에만 저장하거나 아예 저장 안 함
api.scene.time.delayedCall(duration, () => { /* legacyEnd 처리 */ });
api.scene.time.addEvent({ delay: 100, callback: startFever, ... });
// onDestroy 메서드 없음 → 게임 오버 후에도 콜백 실행 가능
```

### After
```ts
// 클래스 프로퍼티로 타이머 추적
private legacyEndTimer?:      Phaser.Time.TimerEvent;
private startFeverTimer?:     Phaser.Time.TimerEvent;
private startFeverEndTimer?:  Phaser.Time.TimerEvent;
// (legacyRainTimer, legacyPulseTween, legacyTopGlow 도 기존에 있던 것)

// delayedCall 반환값 저장
this.legacyEndTimer = api.scene.time.delayedCall(duration, () => { ... });
this.startFeverTimer = api.scene.time.addEvent({ ... });

// onDestroy에서 일괄 취소
override onDestroy(_api: GameSceneAPI): void {
  this.startFeverEndTimer?.remove();
  this.startFeverTimer?.remove();
  this.legacyEndTimer?.remove();
  this.legacyRainTimer?.remove();
  this.legacyPulseTween?.stop();
  this.legacyTopGlow?.destroy();
}
```

**함께 변경**: `BaseAbility` + `CharacterAbility` 인터페이스에 `onDestroy(api: GameSceneAPI): void` 추가, `GameScene.ts` 3곳(hitPoop/hitStar/handleCheatDetected)에서 `this.ability.onDestroy(this.abilityAPI)` 호출.

---

## Fix #3 — 각성 코어 Graphics 객체 누적 (`src/scenes/CharacterSelectScene.ts`)

**증상**: CharacterSelectScene 진입 시 최대 19장 × (각성 레벨별 코어) 개수만큼 Graphics 객체가 생성되어 WebGL 버퍼 낭비

### Before
```ts
// createCharacterCard() 내부 — 카드마다 별도 Graphics 생성
CHARACTERS.forEach(char => {
  // ...카드 배경, 텍스트 생성...
  for (let i = 0; i < awakeningLevel; i++) {
    const coreGfx = this.add.graphics();  // ← 카드당 1개씩 새 Graphics
    coreGfx.fillStyle(0xffcc44);
    coreGfx.fillCircle(x, y, CORE_GLOW_RADIUS);
    // ...
  }
});
// 19캐릭터 × 최대 5코어 = 최대 95개 Graphics 객체
```

### After
```ts
// 클래스 프로퍼티로 단일 Graphics
private coresGfx!: Phaser.GameObjects.Graphics;

// create()에서 1회만 생성
this.coresGfx = this.add.graphics();
this.cardsContainer.add(this.coresGfx);

// createCharacterCard()에서 공유 Graphics에 직접 그림
// (새 Graphics 객체 생성 없음)
CHARACTERS.forEach(char => {
  this.createCharacterCard(char, x, y);  // 내부에서 this.coresGfx 에 그림
});
// 전체 카드를 통틀어 Graphics 객체 1개
```

**효과**: 씬 진입 시 Graphics 객체 수 최대 95개 → 1개. WebGL의 객체당 버퍼 할당 비용 대폭 감소.

---

## Fix #4 — SentinelAbility onDestroy 미구현 (`src/abilities/SentinelAbility.ts`)

**증상**: 센티넬 캐릭터로 게임 오버 시 orbiting 방울 Graphics 및 spark Tween이 정리되지 않음

### Before
```ts
export class SentinelAbility extends BaseAbility {
  private sparkGfx: Phaser.GameObjects.Graphics | null = null;
  private sparkTween: Phaser.Tweens.Tween | null = null;
  private orbitDroplets: Phaser.GameObjects.Graphics[] = [];

  // onDestroy 없음 → 게임 오버 시 위 3가지 모두 누수
}
```

### After
```ts
override onDestroy(_api: GameSceneAPI): void {
  this.sparkTween?.stop();                               // 진행 중인 tween 중단
  this.sparkGfx?.destroy();                             // spark Graphics 제거
  this.orbitDroplets.forEach(drop => drop.destroy());   // 공전 방울 전부 제거
}
```

---

## Fix #5 — Mask Graphics 누수 (`src/scenes/CharacterSelectScene.ts`, `src/scenes/ReleaseNotesScene.ts`)

**증상**: `this.make.graphics()`로 생성한 GeometryMask용 Graphics가 씬 종료 시 자동으로 파괴되지 않음

### Before
```ts
// CharacterSelectScene — shutdown 핸들러에서 불필요한 optional chaining
private maskGfx!: Phaser.GameObjects.Graphics;
// ...
this.events.once('shutdown', () => { this.maskGfx?.destroy(); });
//                                               ^ '!' 선언과 모순

// ReleaseNotesScene — 아예 추적하지 않음
const maskShape = this.make.graphics({ x: 0, y: 0 });  // 로컬 변수
maskShape.fillRect(0, 70, 400, 470);
const mask = maskShape.createGeometryMask();
this.scrollContainer.setMask(mask);
// shutdown 핸들러 없음 → maskShape 누수
```

### After
```ts
// CharacterSelectScene — optional chaining 제거
this.events.once('shutdown', () => { this.maskGfx.destroy(); });

// ReleaseNotesScene — 클래스 프로퍼티 승격 + shutdown 핸들러 추가
private maskShape!: Phaser.GameObjects.Graphics;
// ...
this.maskShape = this.make.graphics({ x: 0, y: 0 });
this.maskShape.fillRect(0, 70, 400, 470);
const mask = this.maskShape.createGeometryMask();
this.scrollContainer.setMask(mask);
this.events.once('shutdown', () => { this.maskShape.destroy(); });
```

**핵심**: `this.make.graphics()`는 display list에 추가되지 않음 → 씬 shutdown 시 Phaser의 자동 파괴 대상이 아님. `this.add.graphics()`와 달리 반드시 수동으로 `destroy()` 해야 함.

---

## Fix #6 — GlitchAbility ghost 스프라이트 & 타이머 누수 (`src/abilities/GlitchAbility.ts`)

**증상**: 글리치 캐릭터 사용 중 게임 오버 시 분신 스프라이트가 정리되지 않고, 분신 이동 공격의 delayedCall이 게임 오버 후에도 실행됨

### Before
```ts
export class GlitchAbility extends BaseAbility {
  private ghost?: Phaser.Physics.Arcade.Sprite;
  // onDestroy 없음 → ghost 스프라이트 누수

  private collectSpecialWithGhost(api, count) {
    targets.forEach(target => {
      const attackGhost = api.scene.add.image(...);
      api.scene.time.delayedCall(1000, () => {  // 반환값 미저장
        attackGhost.destroy();
        // 수집 로직...
      });
      // timer 추적 안 함 → 게임 오버 후 1초 뒤 콜백 실행 가능
    });
  }
}
```

### After
```ts
export class GlitchAbility extends BaseAbility {
  private ghost?: Phaser.Physics.Arcade.Sprite;
  private attackTimers: Phaser.Time.TimerEvent[] = [];  // 타이머 추적 추가

  override onDestroy(_api: GameSceneAPI): void {
    this.ghost?.destroy();                              // 분신 스프라이트 정리
    this.attackTimers.forEach(t => t.remove());         // 진행 중 타이머 취소
  }

  private collectSpecialWithGhost(api, count) {
    targets.forEach(target => {
      const attackGhost = api.scene.add.image(...);
      const timer = api.scene.time.delayedCall(1000, () => {
        attackGhost.destroy();
        // 수집 로직...
      });
      this.attackTimers.push(timer);  // 타이머 추적
    });
  }
}
```

---

## 수정 요약

| # | 파일 | 수정 내용 | 효과 |
|---|------|-----------|------|
| 0 | `main.ts` | smoothStep, fps.target, roundPixels | 낙하 오브젝트 버벅임 제거 |
| 1 | `CharacterSelectScene.ts` | 비디오 el.src 명시 해제, fitVideoTimers 추적 | 비디오 디코더 메모리 누수 방지 |
| 2 | `LegacyAbility.ts` + `BaseAbility.ts` + `GameScene.ts` | onDestroy 훅 추가, 타이머 3개 추적 | 게임 오버 후 타이머 콜백 차단 |
| 3 | `CharacterSelectScene.ts` | 각성 코어 Graphics 95개 → 1개 | WebGL 버퍼 할당 대폭 감소 |
| 4 | `SentinelAbility.ts` | onDestroy 구현 | spark/orbitDroplets 누수 방지 |
| 5 | `CharacterSelectScene.ts` + `ReleaseNotesScene.ts` | make.graphics() shutdown 정리 | GeometryMask Graphics 누수 방지 |
| 6 | `GlitchAbility.ts` | onDestroy 구현, attackTimers 추적 | ghost 스프라이트 + 타이머 누수 방지 |
