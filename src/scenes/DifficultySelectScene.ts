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

    // 반투명 오버레이로 가독성 향상
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.4);

    // 타이틀 배경
    this.add.rectangle(200, 70, 350, 60, 0x000000, 0.7)
      .setStrokeStyle(3, 0xFFD700);

    // 타이틀
    this.add.text(200, 55, '🎮 난이도 선택 🎮', {
      fontSize: '28px',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5
    }).setOrigin(0.5);

    this.add.text(200, 82, '도전할 난이도를 선택하세요', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // 2x2 그리드로 버튼 배치
    const startX = 100;
    const startY = 210;
    const spacingX = 200;
    const spacingY = 180;

    DIFFICULTIES.forEach((difficultyConfig: DifficultyConfig, index: number) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = startX + (col * spacingX);
      const y = startY + (row * spacingY);

      this.createDifficultyButton(difficultyConfig, x, y);
    });

    // 뒤로가기 버튼
    const backButtonBg = this.add.rectangle(200, 560, 150, 40, 0xffffff, 1);
    backButtonBg.setStrokeStyle(3, 0x000000);

    const backButton = this.add.text(200, 560, '← 뒤로가기', {
      fontSize: '18px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    backButtonBg.setInteractive({ useHandCursor: true });
    backButton.setInteractive({ useHandCursor: true });

    const backElements = [backButtonBg, backButton];
    backElements.forEach(element => {
      element.on('pointerover', () => {
        backButtonBg.setFillStyle(0xffff99);
        backButton.setScale(1.05);
      });

      element.on('pointerout', () => {
        backButtonBg.setFillStyle(0xffffff);
        backButton.setScale(1);
      });

      element.on('pointerdown', () => {
        this.scene.start('ModeSelectScene');
      });
    });
  }

  private createDifficultyButton(difficultyConfig: DifficultyConfig, x: number, y: number) {
    // 그림자 효과
    const shadow = this.add.rectangle(x + 3, y + 3, 170, 150, 0x000000, 0.5);

    // 카드 배경
    const button = this.add.rectangle(x, y, 170, 150, difficultyConfig.color, 1);
    button.setStrokeStyle(4, 0x000000);

    // 내부 테두리 (깊이감)
    const innerBorder = this.add.rectangle(x, y, 160, 140, difficultyConfig.color, 0)
      .setStrokeStyle(2, this.darkenColor(difficultyConfig.color));

    // 난이도 이모지
    const emoji = this.getDifficultyEmoji(difficultyConfig.difficulty);
    const emojiText = this.add.text(x, y - 48, emoji, {
      fontSize: '32px'
    }).setOrigin(0.5);

    // 난이도 이름
    const title = this.add.text(x, y - 15, difficultyConfig.name, {
      fontSize: '20px',
      color: '#000',
      fontStyle: 'bold',
      stroke: '#fff',
      strokeThickness: 2
    }).setOrigin(0.5);

    // 설명
    const description = this.add.text(x, y + 10, difficultyConfig.description, {
      fontSize: '11px',
      color: '#222',
      align: 'center'
    }).setOrigin(0.5);

    // 정보 박스
    const infoBg = this.add.rectangle(x, y + 42, 150, 38, 0xffffff, 0.8);

    const poopInfo = this.add.text(x, y + 34, `💩 ${difficultyConfig.poopCount}개`, {
      fontSize: '11px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const speedInfo = this.add.text(x, y + 50, `⚡ ${this.getSpeedText(difficultyConfig.baseSpeed)}`, {
      fontSize: '11px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });
    const elements = [button, innerBorder, emojiText, title, description, infoBg, poopInfo, speedInfo];
    const originalColor = difficultyConfig.color;

    elements.forEach(element => {
      if (element !== button) {
        element.setInteractive({ useHandCursor: true });
      }

      element.on('pointerover', () => {
        button.setFillStyle(this.lightenColor(originalColor));
        button.setScale(1.08);
        shadow.setScale(1.08);
        innerBorder.setScale(1.08);
        emojiText.setScale(1.1);
        title.setScale(1.05);
        description.setScale(1.05);
        infoBg.setScale(1.08);
        poopInfo.setScale(1.05);
        speedInfo.setScale(1.05);
      });

      element.on('pointerout', () => {
        button.setFillStyle(originalColor);
        button.setScale(1);
        shadow.setScale(1);
        innerBorder.setScale(1);
        emojiText.setScale(1);
        title.setScale(1);
        description.setScale(1);
        infoBg.setScale(1);
        poopInfo.setScale(1);
        speedInfo.setScale(1);
      });

      element.on('pointerdown', () => {
        this.startGame(difficultyConfig.difficulty);
      });
    });
  }

  private getDifficultyEmoji(difficulty: string): string {
    switch (difficulty) {
      case 'easy': return '😊';
      case 'normal': return '😐';
      case 'hard': return '😰';
      case 'extreme': return '💀';
      default: return '🎮';
    }
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

  private darkenColor(color: number): number {
    // 색상을 어둡게 만들기
    const r = Math.max(0, ((color >> 16) & 0xFF) - 40);
    const g = Math.max(0, ((color >> 8) & 0xFF) - 40);
    const b = Math.max(0, (color & 0xFF) - 40);
    return (r << 16) | (g << 8) | b;
  }

  private startGame(difficulty: Difficulty) {
    this.scene.start('GameScene', {
      gameMode: this.gameMode,
      difficulty: difficulty
    });
  }
}
