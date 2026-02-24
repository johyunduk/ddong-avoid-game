import Phaser from 'phaser';
import ModeSelectScene from './scenes/ModeSelectScene';
import DifficultySelectScene from './scenes/DifficultySelectScene';
import GameScene from './scenes/GameScene';
import LeaderboardScene from './scenes/LeaderboardScene';
import ReleaseNotesScene from './scenes/ReleaseNotesScene';
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
      debug: false,
      fixedStep: false
    }
  },
  scene: [ModeSelectScene, DifficultySelectScene, GameScene, LeaderboardScene, ReleaseNotesScene],
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

async function init() {
  try {
    await ensureLoggedIn();
  } catch (error) {
    // 로그인 실패해도 게임은 실행 (오프라인 환경 대비)
    console.error('로그인 초기화 실패:', error);
  }
  new Phaser.Game(config);
}

init();
