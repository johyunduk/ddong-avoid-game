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
import StoryLogScene from './scenes/StoryLogScene';
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
      fixedStep: false
    }
  },
  input: {
    touch: {
      capture: false // CSS touch-action: none이 스크롤 방지 → preventDefault 불필요, 컴포지터 블로킹 제거
    }
  },
  scene: [ModeSelectScene, DifficultySelectScene, GameScene, LeaderboardScene, ReleaseNotesScene, CharacterSelectScene, GachaScene, BattleMatchScene, BattleGameScene, BattleResultScene, BattleLeaderboardScene, StoryLogScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    roundPixels: true
  },
  fps: {
    smoothStep: false // 네이티브 리프레시 레이트 사용, raw delta로 프레임 타이밍 드리프트 방지
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
