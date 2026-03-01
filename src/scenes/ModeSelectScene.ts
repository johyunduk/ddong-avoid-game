import Phaser from 'phaser';
import { GameMode, GAME_MODES, type GameModeConfig } from '../types/GameMode';
import { getSkorBalance, getCachedSkorBalance, cacheSkorBalance } from '../utils/skor';

export default class ModeSelectScene extends Phaser.Scene {
  private skorText!: Phaser.GameObjects.Text;

  constructor() {
    super('ModeSelectScene');
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    if (!this.textures.exists('title')) {
      this.load.image('title', 'assets/title.webp');
    }
  }

  create() {
    const background = this.add.image(200, 300, 'background2');
    background.setDisplaySize(400, 600);

    const title = this.add.image(200, 90, 'title');
    title.setScale(0.4);

    this.add.text(200, 190, '모드를 선택하세요', {
      fontSize: '20px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // 게임 모드 버튼 (클래식만)
    const startY = 260;
    GAME_MODES.forEach((modeConfig: GameModeConfig, index: number) => {
      const y = startY + (index * 120);
      this.createModeButton(modeConfig, 200, y);
    });

    // 뽑기 버튼 (SKOR 잔액 포함)
    this.createGachaButton(200, 380);

    // 하단 버튼 행: 캐릭터 선택 + 랭킹 (메인 버튼 폭 300px에 맞춰 x=50~350 내에 배치)
    this.createCharacterButton(120, 480);
    this.createLeaderboardButton(280, 480);

    // 릴리즈 노트 링크
    this.createReleaseNotesLink();

    // SKOR 잔액 비동기 로드
    this.loadSkorBalance();
  }

  private async loadSkorBalance() {
    try {
      const balance = await getSkorBalance();
      cacheSkorBalance(balance);
      if (this.skorText?.active) {
        this.skorText.setText(`💰 ${Math.floor(balance)} SKOR`);
      }
    } catch {
      // 잔액 로드 실패 시 캐시 값 유지
    }
  }

  private createModeButton(modeConfig: GameModeConfig, x: number, y: number) {
    const button = this.add.rectangle(x, y, 300, 80, 0xffffff, 1);
    button.setStrokeStyle(4, 0x000000);

    const titleText = this.add.text(x, y - 12, modeConfig.name, {
      fontSize: '24px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const description = this.add.text(x, y + 18, modeConfig.description, {
      fontSize: '14px',
      color: '#333',
      align: 'center'
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });
    titleText.setInteractive({ useHandCursor: true });
    description.setInteractive({ useHandCursor: true });

    const elements = [button, titleText, description];
    elements.forEach(element => {
      element.on('pointerover', () => button.setFillStyle(0xffff99));
      element.on('pointerout',  () => button.setFillStyle(0xffffff));
      element.on('pointerdown', () => this.startGame(modeConfig.mode));
    });
  }

  private createGachaButton(x: number, y: number) {
    const button = this.add.rectangle(x, y, 300, 90, 0x1a1a2e, 1);
    button.setStrokeStyle(3, 0x7b2fff);

    // 뽑기 타이틀
    this.add.text(x, y - 22, '🎰 캐릭터 뽑기', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // SKOR 잔액 — 캐시 값 즉시 표시
    const cached = getCachedSkorBalance();
    const initialSkorLabel = cached !== null ? `💰 ${cached} SKOR` : '💰 -- SKOR';
    this.skorText = this.add.text(x, y + 8, initialSkorLabel, {
      fontSize: '16px',
      color: '#c0a0ff',
    }).setOrigin(0.5);

    // 비용 안내
    this.add.text(x, y + 28, '1회 100 · 10회 900', {
      fontSize: '12px',
      color: '#888888',
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => {
      button.setFillStyle(0x2d1a5e);
      button.setStrokeStyle(3, 0xaa66ff);
    });
    button.on('pointerout', () => {
      button.setFillStyle(0x1a1a2e);
      button.setStrokeStyle(3, 0x7b2fff);
    });
    button.on('pointerdown', () => {
      this.scene.start('GachaScene');
    });
  }

  private createCharacterButton(x: number, y: number) {
    const button = this.add.rectangle(x, y, 140, 60, 0x2a2a2a, 1);
    button.setStrokeStyle(2, 0x888888);

    this.add.text(x, y, '🧬 캐릭터', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setFillStyle(0x444444));
    button.on('pointerout',  () => button.setFillStyle(0x2a2a2a));
    button.on('pointerdown', () => {
      this.scene.start('CharacterSelectScene');
    });
  }

  private createLeaderboardButton(x: number, y: number) {
    const button = this.add.rectangle(x, y, 140, 60, 0x4a90e2, 1);
    button.setStrokeStyle(2, 0x2e5c8a);

    this.add.text(x, y, '🏆 랭킹', {
      fontSize: '18px',
      color: '#fff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setFillStyle(0x5ba3f5));
    button.on('pointerout',  () => button.setFillStyle(0x4a90e2));
    button.on('pointerdown', () => {
      this.scene.start('LeaderboardScene');
    });
  }

  private createReleaseNotesLink() {
    const text = this.add.text(200, 565, '📋 릴리즈 노트', {
      fontSize: '15px',
      color: '#cccccc',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    text.setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor('#FFD700'));
    text.on('pointerout',  () => text.setColor('#cccccc'));
    text.on('pointerdown', () => this.scene.start('ReleaseNotesScene'));
  }

  private startGame(mode: GameMode) {
    if (mode === GameMode.CLASSIC) {
      this.scene.start('DifficultySelectScene', { gameMode: mode });
    } else {
      this.scene.start('GameScene', { gameMode: mode, difficulty: 'HARD' });
    }
  }
}
