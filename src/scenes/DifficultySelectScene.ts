import Phaser from 'phaser';
import { GameMode, DIFFICULTIES, type Difficulty, type DifficultyConfig } from '../types/GameMode';
import { isChristmasSeason } from '../utils/seasonChecker';

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
    // 난이도 선택 화면 배경
    if (!this.textures.exists('background')) {
      this.load.image('background', 'assets/backgrounds/background.webp');
    }

    // ── 게임 에셋 미리 로딩 (캐시된 항목은 건너뜀) ──
    if (this.gameMode === GameMode.CLASSIC) {
      // 배경 (모든 난이도)
      if (!this.textures.exists('background2')) this.load.image('background2', 'assets/backgrounds/background2.webp');
      if (!this.textures.exists('background3')) this.load.image('background3', 'assets/backgrounds/background3.webp');
      if (isChristmasSeason() && !this.textures.exists('xmas_background')) {
        this.load.image('xmas_background', 'assets/backgrounds/xmas_background.webp');
      }

      // 플레이어
      if (!this.textures.exists('front')) this.load.image('front', 'assets/players/chibi_front.webp');
      if (!this.textures.exists('left')) this.load.image('left', 'assets/players/chibi_left.webp');
      if (!this.textures.exists('right')) this.load.image('right', 'assets/players/chibi_right.webp');

      // 똥 이미지
      if (!this.textures.exists('poop')) this.load.image('poop', 'assets/poops/poop.webp');
      if (!this.textures.exists('poop_glasses')) this.load.image('poop_glasses', 'assets/poops/poop_glasses.webp');
      if (!this.textures.exists('poop_sunglass')) this.load.image('poop_sunglass', 'assets/poops/poop_sunglass.webp');
      if (!this.textures.exists('poop_sunglass2')) this.load.image('poop_sunglass2', 'assets/poops/poop_sunglass2.webp');
      if (!this.textures.exists('poop_smile')) this.load.image('poop_smile', 'assets/poops/poop_smile.webp');
      if (!this.textures.exists('gold_poop')) this.load.image('gold_poop', 'assets/poops/gold_poop.webp');
      if (!this.textures.exists('diamond_poop')) this.load.image('diamond_poop', 'assets/poops/diamond_poop.webp');
      if (!this.textures.exists('topaz_poop')) this.load.image('topaz_poop', 'assets/poops/topaz.webp');

      // 크리스마스 시즌 똥
      if (isChristmasSeason()) {
        if (!this.textures.exists('xmas_poop_ribbon')) this.load.image('xmas_poop_ribbon', 'assets/poops/xmas_present_poop.webp');
        if (!this.textures.exists('xmas_poop_nose')) this.load.image('xmas_poop_nose', 'assets/poops/xmas_nose_poop.webp');
        if (!this.textures.exists('xmas_poop_santa')) this.load.image('xmas_poop_santa', 'assets/poops/xmas_santa_poop.webp');
        if (!this.textures.exists('xmas_poop_rudolf')) this.load.image('xmas_poop_rudolf', 'assets/poops/xmas_rudolf_poop.webp');
        if (!this.textures.exists('xmas_poop_beard')) this.load.image('xmas_poop_beard', 'assets/poops/xmas_beard_poop.webp');
      }

      // BGM
      if (!this.cache.audio.exists('bgMusic')) this.load.audio('bgMusic', 'assets/bgms/poop.mp3');
      if (isChristmasSeason() && !this.cache.audio.exists('xmasBgMusic')) this.load.audio('xmasBgMusic', 'assets/bgms/xmas_poop.mp3');

    } else if (this.gameMode === GameMode.ITEM) {
      // 우주 배경
      if (!this.textures.exists('space_background')) this.load.image('space_background', 'assets/backgrounds/space_background.webp');

      // 우주비행사 플레이어
      if (!this.textures.exists('astronaut_front')) this.load.image('astronaut_front', 'assets/players/astronaut_front.webp');
      if (!this.textures.exists('astronaut_left')) this.load.image('astronaut_left', 'assets/players/astronaut_left.webp');
      if (!this.textures.exists('astronaut_right')) this.load.image('astronaut_right', 'assets/players/astronaut_right.webp');

      // 별 이미지
      if (!this.textures.exists('star')) this.load.image('star', 'assets/stars/star.webp');
      if (!this.textures.exists('star_smile')) this.load.image('star_smile', 'assets/stars/star_smile.webp');
      if (!this.textures.exists('star_glasses')) this.load.image('star_glasses', 'assets/stars/star_glasses.webp');
      if (!this.textures.exists('star_sunglass')) this.load.image('star_sunglass', 'assets/stars/star_sunglass.webp');

      // 아이템 이미지
      if (!this.textures.exists('hermes_shoes')) this.load.image('hermes_shoes', 'assets/items/hermes_shoes.webp');
      if (!this.textures.exists('light_saber')) this.load.image('light_saber', 'assets/items/light_saber.webp');
      if (!this.textures.exists('rainbow_star')) this.load.image('rainbow_star', 'assets/items/rainbow_star.webp');

      // BGM
      if (!this.cache.audio.exists('starBgMusic')) this.load.audio('starBgMusic', 'assets/bgms/star_fall.mp3');
    }
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
