# 개발 가이드

## 프로젝트 개요

똥 피하기 게임은 Phaser 3 프레임워크를 사용한 하이퍼캐주얼 웹 게임으로, Vercel 로 배포합니다.

## 아키텍처

### 디렉토리 구조

```
src/
├── main.ts              # 게임 설정 및 초기화
├── scenes/              # 게임 씬들
│   └── GameScene.ts     # 메인 게임 씬
├── objects/             # 게임 오브젝트들
│   ├── Player.ts        # 플레이어 캐릭터
│   └── Poop.ts          # 똥 장애물
├── types/               # TypeScript 타입 정의
├── utils/               # 유틸리티 함수들
└── style.css            # 글로벌 스타일
```

### 핵심 컴포넌트

#### 1. GameScene (src/scenes/GameScene.ts)

메인 게임 로직을 담당하는 씬입니다.

**주요 기능:**
- 플레이어 생성 및 관리
- 똥 생성 및 제거
- 충돌 감지
- 점수 관리
- 게임 오버 처리
- 난이도 증가

**중요 메서드:**
- `create()`: 게임 초기 설정
- `update()`: 매 프레임 업데이트
- `spawnPoop()`: 똥 생성
- `hitPoop()`: 충돌 처리
- `increaseDifficulty()`: 난이도 증가

#### 2. Player (src/objects/Player.ts)

플레이어 캐릭터 클래스입니다.

**특징:**
- Phaser.Physics.Arcade.Sprite 상속
- 키보드 및 터치 입력 처리
- 화면 경계 내 이동 제한
- 간단한 사람 모양 그래픽

**조작:**
- 키보드: 좌우 화살표 키
- 터치: 화면 좌우 터치

#### 3. Poop (src/objects/Poop.ts)

똥 장애물 클래스입니다.

**특징:**
- 위에서 아래로 떨어짐
- 난이도에 따라 속도 변화
- 화면 밖으로 나가면 자동 제거
- 갈색 소용돌이 모양

## 게임 메커니즘

### 점수 시스템

- 매 0.1초마다 1점씩 증가
- 게임 오버 시 최종 점수 표시

### 난이도 시스템

10초마다 자동으로 난이도가 증가합니다:

```typescript
private increaseDifficulty() {
  this.difficultyLevel += 0.2;

  // 생성 주기 단축 (최소 500ms)
  const newDelay = Math.max(500, 1500 - (this.difficultyLevel * 100));
  this.spawnTimer.delay = newDelay;
}
```

**난이도 영향:**
- 똥 낙하 속도: `150 + (difficulty * 30)` px/s
- 똥 생성 주기: `1500 - (difficulty * 100)` ms (최소 500ms)

### 충돌 감지

Phaser의 Arcade Physics를 사용한 overlap 감지:

```typescript
this.physics.add.overlap(
  this.player,
  this.poops,
  this.hitPoop,
  undefined,
  this
);
```

## 커스터마이징 가이드

### 1. 게임 속도 조절

`src/scenes/GameScene.ts` 수정:

```typescript
// 점수 증가 속도 (기본: 100ms)
this.time.addEvent({
  delay: 100,  // <- 이 값을 조절
  callback: this.updateScore,
  callbackScope: this,
  loop: true
});

// 똥 생성 주기 (기본: 1500ms)
this.spawnTimer = this.time.addEvent({
  delay: 1500,  // <- 이 값을 조절
  callback: this.spawnPoop,
  callbackScope: this,
  loop: true
});
```

### 2. 플레이어 속도 변경

`src/objects/Player.ts` 수정:

```typescript
export default class Player extends Phaser.Physics.Arcade.Sprite {
  private speed: number = 300;  // <- 이 값을 조절 (기본: 300)
}
```

### 3. 게임 화면 크기 변경

`src/main.ts` 수정:

```typescript
const config: Phaser.Types.Core.GameConfig = {
  width: 400,   // <- 너비 조절
  height: 600,  // <- 높이 조절
  // ...
};
```

### 4. 새로운 장애물 추가

1. `src/objects/NewObstacle.ts` 생성:

```typescript
import Phaser from 'phaser';

export default class NewObstacle extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, '');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 그래픽 생성
    this.createGraphics();

    // 물리 설정
    this.setVelocityY(200);
  }

  private createGraphics() {
    // 커스텀 그래픽 그리기
  }

  update() {
    // 업데이트 로직
  }
}
```

2. `GameScene.ts`에서 사용:

```typescript
import NewObstacle from '../objects/NewObstacle';

// create() 메서드에서
this.newObstacles = this.physics.add.group({
  classType: NewObstacle,
  runChildUpdate: true
});

// 충돌 감지 추가
this.physics.add.overlap(
  this.player,
  this.newObstacles,
  this.hitObstacle,
  undefined,
  this
);
```

## 성능 최적화

### 1. 객체 풀링

현재는 Phaser Group을 사용하여 자동 관리:

```typescript
this.poops = this.physics.add.group({
  classType: Poop,
  runChildUpdate: true
});
```

### 2. 화면 밖 객체 제거

`Poop.ts`에서 자동 제거:

```typescript
update() {
  if (this.y > this.scene.cameras.main.height + 50) {
    this.destroy();
  }
}
```

### 3. 텍스처 재사용

그래픽을 한 번만 생성하고 재사용:

```typescript
private createPlayerGraphics() {
  // ...
  graphics.generateTexture('player', 30, 45);
  graphics.destroy();

  this.setTexture('player');
}
```

## 디버깅

### 디버그 모드 활성화

`src/main.ts`:

```typescript
physics: {
  default: 'arcade',
  arcade: {
    gravity: { y: 0, x: 0 },
    debug: true  // 충돌 박스 표시
  }
}
```

## 테스트

### 로컬 테스트

```bash
npm run dev
```

브라우저 개발자 도구에서:
- 콘솔 확인
- 네트워크 탭 확인
- 성능 프로파일링

### 모바일 테스트

1. **로컬 네트워크에서 접근:**

```bash
npm run dev -- --host
```

2. **모바일 기기에서 접속:**
   - 같은 WiFi 네트워크 연결
   - `http://<PC-IP>:5173` 접속

3. **터치 이벤트 테스트:**
   - 화면 좌우 터치로 이동 확인
   - 게임 오버 후 터치로 재시작 확인

## 빌드 및 배포

### 프로덕션 빌드

```bash
npm run build
```

빌드된 파일은 `dist/web/` 폴더에 생성됩니다. 위치는 `vite.config.ts` 의 `build.outDir` 가 정하고,
Vercel 은 `vercel.json` 의 `outputDirectory` 를 내보낸다 — 둘이 어긋나면 운영 사이트가 빈 화면으로 배포된다.

### 빌드 최적화

`vite.config.ts` 의 `build` 에 옵션을 더한다 (`outDir` 는 그대로 둔다):

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/web',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true  // 콘솔 로그 제거
      }
    }
  }
});
```

### 배포 체크리스트

- [ ] 프로덕션 빌드 생성
- [ ] 성능 테스트 (60 FPS 유지)
- [ ] 모바일 기기 테스트

## 추가 기능 아이디어

### 1. 파워업 아이템

```typescript
class PowerUp extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, type) {
    super(scene, x, y, '');
    this.type = type; // 'shield', 'slow', 'points'
  }
}
```

### 2. 사운드 효과

```typescript
// preload()에서
this.load.audio('bgm', 'assets/bgm.mp3');
this.load.audio('hit', 'assets/hit.mp3');

// create()에서
this.bgm = this.sound.add('bgm', { loop: true });
this.bgm.play();

// 충돌 시
this.sound.play('hit');
```

### 3. 멀티플레이어

Socket.io를 사용한 실시간 대전:

```typescript
import io from 'socket.io-client';

const socket = io('https://your-server.com');

socket.on('player-move', (data) => {
  // 상대방 위치 업데이트
});
```

## 문제 해결

### 일반적인 문제

1. **게임이 로드되지 않음**
   - 브라우저 콘솔에서 에러 확인
   - Phaser 버전 확인
   - 의존성 재설치: `rm -rf node_modules && npm install`

2. **터치 이벤트 작동 안함**
   - 모바일 기기에서 테스트
   - 터치 영역 확인
   - `user-scalable=no` 메타 태그 확인

3. **성능 저하**
   - 디버그 모드 끄기
   - 객체 수 제한
   - 프레임 레이트 모니터링

## 참고 자료

- [Phaser 3 공식 문서](https://phaser.io/phaser3)
- [Phaser 3 예제](https://phaser.io/examples)
- [TypeScript 핸드북](https://www.typescriptlang.org/docs/)

## 기여 가이드

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

**Happy Coding!** 🚀
