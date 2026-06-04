import Phaser from 'phaser';
import ModeSelectScene from './scenes/ModeSelectScene';
import DifficultySelectScene from './scenes/DifficultySelectScene';
import GameScene from './scenes/GameScene';
import LeaderboardScene from './scenes/LeaderboardScene';
import ReleaseNotesScene from './scenes/ReleaseNotesScene';
import CharacterSelectScene from './scenes/CharacterSelectScene';
import GachaScene from './scenes/GachaScene';
import BattleMatchScene from './scenes/BattleMatchScene';
import BattleGameScene from './scenes/BattleGameScene';
import BattleResultScene from './scenes/BattleResultScene';
import BattleLeaderboardScene from './scenes/BattleLeaderboardScene';
import { ensureLoggedIn } from './utils/auth';
import { isBgmMuted } from './utils/settings';
import './style.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-container',
  backgroundColor: '#87CEEB',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false, // 히트박스 on/off
      // 가변 타임스텝 — 매 프레임 velocity×실제 delta로 위치 적분.
      // 매 프레임 움직여 fixedStep의 "스텝 0회 프레임" 양자화 지터가 없어 실측상 가장 부드럽고,
      // 등속이라 평균 낙하 속도는 주사율과 무관(프레임 2배면 프레임당 이동량 절반).
      // (fixedStep:true는 60Hz 임계값 경계 판정으로 뚝뚝 끊김 발생.
      //  초기 배터리 버벅임의 진짜 원인은 GPU 스로틀 → 위 render.powerPreference로 해소.)
      fixedStep: false
    }
  },
  input: {
    touch: {
      capture: false // CSS touch-action: none이 스크롤 방지 → preventDefault 불필요, 컴포지터 블로킹 제거
    }
  },
  scene: [ModeSelectScene, DifficultySelectScene, GameScene, LeaderboardScene, ReleaseNotesScene, CharacterSelectScene, GachaScene, BattleMatchScene, BattleGameScene, BattleResultScene, BattleLeaderboardScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    roundPixels: true,
    // 배터리 모드에서 브라우저/OS가 WebGL 컨텍스트를 저전력 GPU·다운클럭으로 돌리는 것을 억제하는 힌트.
    // 충전 시엔 매끄럽다가 배터리에서 버벅이는 throttle 증상 완화 (배터리 소모는 소폭 증가).
    powerPreference: 'high-performance'
  },
  fps: {
    // smoothStep:false — 가변 타임스텝에 가공된 평균 delta가 아닌 raw 경과시간을 먹여
    // 매 프레임 정확히 (velocity×실제 delta)만큼 이동 → 주사율이 올라도 낙하 속도 일정.
    // (smoothStep:true는 주사율 램프업 시 평균 delta 지연으로 속도 드리프트 → 모바일 "터치 시 빨라짐" 유발.
    //  fps.limit은 60Hz에서 임계값 미달로 스텝 반토막 부작용 → 둘 다 미사용.)
    smoothStep: false
  }
};

// 로그인은 백그라운드에서 진행 (Phaser 게임 생성을 지연시키지 않음)
// ensureLoggedIn()을 await하면 캔버스가 비동기 컨텍스트에서 생성되어
// 브라우저가 키보드 포커스를 정상적으로 할당하지 않는 문제 발생
ensureLoggedIn().catch(error => {
  console.error('로그인 초기화 실패:', error);
});

// 게임 인스턴스는 동기적으로 즉시 생성 (키보드 입력 정상 동작 보장)
const game = new Phaser.Game(config);

// 저장된 뮤트 설정 복원
game.events.once('ready', () => {
  if (isBgmMuted()) game.sound.mute = true;

  // touchstart 직후 브라우저가 합성하는 mousedown을 Phaser보다 먼저 차단 (이중 pointerdown 방지)
  const TOUCH_MOUSE_DEBOUNCE_MS = 350;
  let lastTouchTime = 0;
  const canvas = game.canvas;

  canvas.addEventListener('touchstart', () => {
    lastTouchTime = performance.now();
  }, { passive: true });

  canvas.addEventListener('mousedown', (e) => {
    if (performance.now() - lastTouchTime < TOUCH_MOUSE_DEBOUNCE_MS) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
});

// 모바일 백그라운드 전환 시 BGM 일시정지/재개
// visibilitychange: Android/데스크탑 표준
// pagehide: iOS Safari가 visibilitychange를 놓치는 경우 대비
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.sound.pauseAll();
  } else {
    game.sound.resumeAll();
  }
});

window.addEventListener('pagehide', () => {
  game.sound.pauseAll();
});

window.addEventListener('pageshow', () => {
  if (!document.hidden) {
    game.sound.resumeAll();
  }
});
