import Phaser from 'phaser';
import { GameMode, DIFFICULTIES, type Difficulty, type DifficultyConfig } from '../types/GameMode';

export default class DifficultySelectScene extends Phaser.Scene {
  private gameMode: GameMode = GameMode.CLASSIC;

  constructor() {
    super('DifficultySelectScene');
  }

  init(data: { gameMode?: GameMode }) {
    if (data.gameMode) {
      this.gameMode = data.gameMode;
    }
  }

  preload() {
    this.load.image('background', 'assets/backgrounds/background.png');
  }

  create() {
    // 배경 이미지 추가
    const background = this.add.image(200, 300, 'background');
    background.setDisplaySize(400, 600);

    // 타이틀
    this.add.text(200, 80, '난이도를 선택하세요', {
      fontSize: '24px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // 2x2 그리드로 버튼 배치
    const startX = 100;
    const startY = 200;
    const spacingX = 200;
    const spacingY = 170;

    DIFFICULTIES.forEach((difficultyConfig: DifficultyConfig, index: number) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = startX + (col * spacingX);
      const y = startY + (row * spacingY);

      this.createDifficultyButton(difficultyConfig, x, y);
    });

    // 뒤로가기 버튼
    const backButton = this.add.text(200, 560, '← 뒤로가기', {
      fontSize: '18px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    backButton.on('pointerover', () => {
      backButton.setScale(1.1);
    });

    backButton.on('pointerout', () => {
      backButton.setScale(1);
    });

    backButton.on('pointerdown', () => {
      this.scene.start('ModeSelectScene');
    });
  }

  private createDifficultyButton(difficultyConfig: DifficultyConfig, x: number, y: number) {
    const button = this.add.rectangle(x, y, 160, 130, difficultyConfig.color, 1);
    button.setStrokeStyle(4, 0x000000);

    const title = this.add.text(x, y - 30, difficultyConfig.name, {
      fontSize: '22px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const description = this.add.text(x, y + 10, difficultyConfig.description, {
      fontSize: '12px',
      color: '#333',
      align: 'center'
    }).setOrigin(0.5);

    const poopInfo = this.add.text(x, y + 35, `똥: ${difficultyConfig.poopCount}개`, {
      fontSize: '11px',
      color: '#444',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const speedInfo = this.add.text(x, y + 52, `속도: ${this.getSpeedText(difficultyConfig.baseSpeed)}`, {
      fontSize: '11px',
      color: '#444',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });
    title.setInteractive({ useHandCursor: true });
    description.setInteractive({ useHandCursor: true });
    poopInfo.setInteractive({ useHandCursor: true });
    speedInfo.setInteractive({ useHandCursor: true });

    const elements = [button, title, description, poopInfo, speedInfo];
    const originalColor = difficultyConfig.color;

    elements.forEach(element => {
      element.on('pointerover', () => {
        button.setFillStyle(this.lightenColor(originalColor));
        button.setScale(1.05);
      });

      element.on('pointerout', () => {
        button.setFillStyle(originalColor);
        button.setScale(1);
      });

      element.on('pointerdown', () => {
        this.startGame(difficultyConfig.difficulty);
      });
    });
  }

  private getSpeedText(baseSpeed: number): string {
    if (baseSpeed <= 150) return '느림';
    if (baseSpeed <= 175) return '보통';
    if (baseSpeed <= 200) return '빠름';
    return '매우 빠름';
  }

  private lightenColor(color: number): number {
    // 색상을 밝게 만들기
    const r = Math.min(255, ((color >> 16) & 0xFF) + 30);
    const g = Math.min(255, ((color >> 8) & 0xFF) + 30);
    const b = Math.min(255, (color & 0xFF) + 30);
    return (r << 16) | (g << 8) | b;
  }

  private startGame(difficulty: Difficulty) {
    this.scene.start('GameScene', {
      gameMode: this.gameMode,
      difficulty: difficulty
    });
  }
}
