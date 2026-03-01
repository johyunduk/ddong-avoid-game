import Phaser from 'phaser';
import ModeSelectScene from './scenes/ModeSelectScene';
import DifficultySelectScene from './scenes/DifficultySelectScene';
import GameScene from './scenes/GameScene';
import LeaderboardScene from './scenes/LeaderboardScene';
import ReleaseNotesScene from './scenes/ReleaseNotesScene';
import CharacterSelectScene from './scenes/CharacterSelectScene';
import GachaScene from './scenes/GachaScene';
import { ensureLoggedIn } from './utils/auth';
import './style.css';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 400,
  height: 600,
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
  scene: [ModeSelectScene, DifficultySelectScene, GameScene, LeaderboardScene, ReleaseNotesScene, CharacterSelectScene, GachaScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    roundPixels: false
  },
  fps: {
    // target: 60,
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
new Phaser.Game(config);
