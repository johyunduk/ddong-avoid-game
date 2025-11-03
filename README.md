# 똥 피하기 게임 🎮

토스 인앱 게임용 하이퍼캐주얼 똥 피하기 게임입니다.

![Game Preview](https://via.placeholder.com/400x600?text=Ddong+Avoid+Game)

## 게임 소개

떨어지는 똥을 피하며 최고 점수를 달성하세요!

### 특징

- 🎯 **간단한 조작**: 좌우 화살표 키 또는 터치로 이동
- 📱 **모바일 최적화**: 반응형 디자인으로 모든 기기 지원
- 🏆 **점수 시스템**: 시간이 지날수록 점수 증가
- 📈 **난이도 증가**: 시간이 지날수록 똥이 빠르게 떨어짐
- 🎮 **토스 연동 준비**: 토스 SDK 연동 구조 포함

## 기술 스택

- **프레임워크**: Phaser 3
- **빌드 도구**: Vite
- **언어**: TypeScript
- **물리 엔진**: Arcade Physics

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

### 3. 프로덕션 빌드

```bash
npm run build
```

빌드된 파일은 `dist` 폴더에 생성됩니다.

## 프로젝트 구조

```
ddong-avoid-game/
├── src/
│   ├── main.ts              # 게임 진입점
│   ├── scenes/
│   │   └── GameScene.ts     # 메인 게임 씬
│   ├── objects/
│   │   ├── Player.ts        # 플레이어 캐릭터
│   │   └── Poop.ts          # 똥 장애물
│   ├── types/
│   │   └── toss-sdk.d.ts    # 토스 SDK 타입 정의
│   ├── utils/
│   │   └── tossSDK.ts       # 토스 SDK 유틸리티
│   └── style.css            # 스타일시트
├── index.html               # HTML 템플릿
├── package.json
└── README.md
```

## 게임 플레이

### 조작법

- **PC**: 좌우 화살표 키 (← →)
- **모바일**: 화면 좌우 터치

### 게임 규칙

1. 떨어지는 똥을 피하세요
2. 시간이 지날수록 점수가 증가합니다
3. 똥에 맞으면 게임 오버!
4. 게임 오버 후 화면 클릭으로 재시작

### 난이도

- 10초마다 똥의 낙하 속도 증가
- 10초마다 똥 생성 주기 단축
- 최고 점수에 도전하세요!

## 토스 SDK 연동

이 게임은 토스 앱인토스 플랫폼 연동을 위한 구조를 포함하고 있습니다.

### 개발 환경

현재는 Mock SDK를 사용하여 개발 환경에서 테스트할 수 있습니다.

```typescript
import { initTossSDK, submitScore } from './utils/tossSDK';

// SDK 초기화
const sdk = initTossSDK('YOUR_APP_ID');

// 점수 제출
submitScore(1000);
```

### 실제 배포

실제 토스 앱에 배포할 때는 다음 단계를 따르세요:

#### 1. 토스 SDK 설치

```bash
npm install @toss/games-sdk
```

#### 2. SDK 초기화 (src/utils/tossSDK.ts 수정)

```typescript
import { TossGamesSDK } from '@toss/games-sdk';

// Mock SDK 주석 처리하고 실제 SDK 사용
if (window.TossGamesSDK) {
  sdk = new window.TossGamesSDK({ appId });
}
```

#### 3. 토스 개발자 콘솔 등록

- URL: https://developers-apps-in-toss.toss.im/
- 앱 등록 및 앱 ID 발급

#### 4. 필수 연동 항목

- [x] 게임 로그인
- [x] 리더보드
- [x] 토스 포인트 리워드
- [ ] 광고 (선택)

## 개발 가이드

### 새로운 기능 추가

#### 1. 새로운 장애물 추가

`src/objects/` 폴더에 새 클래스 생성:

```typescript
export default class NewObstacle extends Phaser.Physics.Arcade.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'texture-key');
    // 구현...
  }
}
```

#### 2. 새로운 씬 추가

`src/scenes/` 폴더에 새 씬 생성 후 `main.ts`에 등록:

```typescript
import MenuScene from './scenes/MenuScene';

const config = {
  scene: [MenuScene, GameScene]
};
```

### 디버그 모드

`src/main.ts`에서 디버그 모드 활성화:

```typescript
physics: {
  default: 'arcade',
  arcade: {
    debug: true  // 충돌 박스 표시
  }
}
```

## 성능 최적화

- 화면 밖 객체는 자동으로 제거됩니다
- 60 FPS 유지를 목표로 최적화되었습니다
- 모바일 기기에서도 부드러운 플레이 가능

## 배포

### Netlify / Vercel 배포

1. GitHub 저장소에 푸시
2. Netlify/Vercel에서 프로젝트 import
3. 빌드 명령어: `npm run build`
4. 배포 디렉토리: `dist`

### 토스 앱인토스 배포

1. 프로덕션 빌드 생성
2. 토스 개발자 콘솔에서 앱 등록
3. 빌드 파일 업로드 또는 호스팅 URL 제공
4. 검수 요청

## 라이선스

MIT License

## 개발자

- 개발: [Your Name]
- 연락처: [Your Email]

## 참고 자료

- [Phaser 3 공식 문서](https://phaser.io/phaser3)
- [토스 앱인토스 가이드](https://developers-apps-in-toss.toss.im/)
- [Vite 문서](https://vitejs.dev/)

---

**즐거운 게임 되세요!** 🎮✨
