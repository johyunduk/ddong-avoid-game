import Phaser from 'phaser';
import { GameMode, GAME_MODES, type GameModeConfig } from '../types/GameMode';

export default class ModeSelectScene extends Phaser.Scene {
  constructor() {
    super('ModeSelectScene');
  }

  preload() {
    // 배경 이미지 로드
    this.load.image('background', 'assets/background.png');
    this.load.image('title', 'assets/title.png');
  }

  create() {
    // 배경 이미지 추가
    const background = this.add.image(200, 300, 'background');
    // 배경을 화면에 맞게 조정
    background.setDisplaySize(400, 600);

    // 타이틀 이미지 추가
    const title = this.add.image(200, 90, 'title');
    title.setScale(0.4); // 크기 조정

    this.add.text(200, 180, '모드를 선택하세요', {
      fontSize: '20px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);

    const startY = 360;
    const buttonSpacing = 150;

    GAME_MODES.forEach((modeConfig: GameModeConfig, index: number) => {
      const y = startY + (index * buttonSpacing);
      this.createModeButton(modeConfig, 200, y);
    });
  }

  private createModeButton(modeConfig: GameModeConfig, x: number, y: number) {
    const isDisabled = modeConfig.mode === GameMode.ITEM;

    const button = this.add.rectangle(x, y, 300, 100, isDisabled ? 0x999999 : 0xffffff, 1);
    button.setStrokeStyle(4, isDisabled ? 0x666666 : 0x000000);

    const title = this.add.text(x, y - 20, modeConfig.name, {
      fontSize: '24px',
      color: isDisabled ? '#666' : '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const description = this.add.text(x, y + 15, modeConfig.description, {
      fontSize: '14px',
      color: isDisabled ? '#888' : '#333',
      align: 'center'
    }).setOrigin(0.5);

    if (!isDisabled) {
      button.setInteractive({ useHandCursor: true });
      title.setInteractive({ useHandCursor: true });
      description.setInteractive({ useHandCursor: true });

      const elements = [button, title, description];
      elements.forEach(element => {
        element.on('pointerover', () => {
          button.setFillStyle(0xffff99);
        });

        element.on('pointerout', () => {
          button.setFillStyle(0xffffff);
        });

        element.on('pointerdown', () => {
          this.startGame(modeConfig.mode);
        });
      });
    } else {
      this.add.text(x, y + 40, '(준비 중)', {
        fontSize: '12px',
        color: '#999'
      }).setOrigin(0.5);
    }
  }

  private startGame(mode: GameMode) {
    this.scene.start('GameScene', { gameMode: mode });
  }
}
