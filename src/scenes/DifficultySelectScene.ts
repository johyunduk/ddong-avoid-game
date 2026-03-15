import Phaser from 'phaser';
import { Difficulty, GameMode, DIFFICULTIES, type DifficultyConfig } from '../types/GameMode';
import { isChristmasSeason } from '../utils/seasonChecker';
import { getSafeSelectedWallpaper, getWallpaperDef } from '../utils/wallpaper';

interface ButtonCardConfig {
  color: number;
  strokeColor?: number;
  emoji: string;
  title: string;
  description: string;
  info1: string;
  info2: string;
  onPointerDown: () => void;
}

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
    // 선택된 배경화면 미리 로딩 (GameScene 진입 전 캐싱)
    const wpId = getSafeSelectedWallpaper();
    const wpDef = wpId ? getWallpaperDef(wpId) : null;
    if (wpDef && !this.textures.exists(wpDef.bgKey)) {
      this.load.image(wpDef.bgKey, wpDef.bgPath);
    }

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

    }
  }

  create() {
    // 배경 이미지 추가
    const background = this.add.image(200, 300, 'background');
    background.setDisplaySize(400, 600);

    // 반투명 오버레이로 가독성 향상
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.4);

    // 타이틀 배경
    this.add.rectangle(200, 75, 350, 72, 0x000000, 0.7)
      .setStrokeStyle(3, 0xFFD700);

    // 타이틀
    this.add.text(200, 60, '🎮 난이도 선택 🎮', {
      fontSize: '26px',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
      padding: { top: 4 }
    }).setOrigin(0.5);

    this.add.text(200, 92, '도전할 난이도를 선택하세요', {
      fontSize: '13px',
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

    // 4번째 셀 (col=1, row=1): PHYSICAL 버튼
    this.createPureButton(startX + spacingX, startY + spacingY);

    // 뒤로가기 버튼
    const backButtonBg = this.add.rectangle(200, 560, 150, 40, 0xffffff, 1);
    backButtonBg.setStrokeStyle(3, 0x000000);

    const backButton = this.add.text(200, 560, '← 뒤로가기', {
      fontSize: '18px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // 씬 전환 직후 포인터 상태 전파 방지
    this.time.delayedCall(200, () => {
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
    });
  }

  private createDifficultyButton(difficultyConfig: DifficultyConfig, x: number, y: number) {
    this.createButtonCard(x, y, {
      color: difficultyConfig.color,
      emoji: this.getDifficultyEmoji(difficultyConfig.difficulty),
      title: difficultyConfig.name,
      description: difficultyConfig.description,
      info1: `💩 ${difficultyConfig.poopCount}개`,
      info2: `⚡ ${this.getSpeedText(difficultyConfig.baseSpeed)}`,
      onPointerDown: () => this.startGame(difficultyConfig.difficulty)
    });
  }

  private createPureButton(x: number, y: number) {
    this.createButtonCard(x, y, {
      color: 0xeeeeee,
      strokeColor: 0x888888,
      emoji: '⚡',
      title: 'PHYSICAL',
      description: '능력 없음 · 순수 실력',
      info1: '🚫 캐릭터 능력 비활성',
      info2: '📊 EXTREME 기준 난이도',
      onPointerDown: () => this.scene.start('GameScene', {
        gameMode: this.gameMode,
        difficulty: Difficulty.EXTREME,
        purePhysical: true
      })
    });
  }

  private createButtonCard(x: number, y: number, config: ButtonCardConfig) {
    const { color, strokeColor = 0x000000 } = config;

    const shadow = this.add.rectangle(x + 4, y + 4, 170, 165, 0x000000, 0.4);

    const button = this.add.rectangle(x, y, 170, 165, color, 1);
    button.setStrokeStyle(3, strokeColor);

    // 이모지: 카드 상단에서 충분한 여백 확보 (카드 상단 y-82, 이모지 중심 y-44)
    const emojiText = this.add.text(x, y - 44, config.emoji, {
      fontSize: '34px',
      padding: { top: 6 }
    }).setOrigin(0.5);

    const title = this.add.text(x, y - 10, config.title, {
      fontSize: '20px',
      color: '#000',
      fontStyle: 'bold',
      stroke: '#fff',
      strokeThickness: 2
    }).setOrigin(0.5);

    const description = this.add.text(x, y + 14, config.description, {
      fontSize: '11px',
      color: '#333',
      align: 'center'
    }).setOrigin(0.5);

    const infoBg = this.add.rectangle(x, y + 47, 154, 40, 0x000000, 0.15)
      .setStrokeStyle(1, 0x000000, 0.2);

    const info1 = this.add.text(x, y + 38, config.info1, {
      fontSize: '11px',
      color: '#111',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const info2 = this.add.text(x, y + 55, config.info2, {
      fontSize: '11px',
      color: '#111',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // 씬 전환 직후 포인터 상태 전파 방지
    this.time.delayedCall(200, () => {
      button.setInteractive({ useHandCursor: true });
      const elements = [button, emojiText, title, description, infoBg, info1, info2];

      elements.forEach(element => {
        if (element !== button) {
          element.setInteractive({ useHandCursor: true });
        }

        element.on('pointerover', () => {
          button.setFillStyle(this.lightenColor(color));
          button.setScale(1.06);
          shadow.setScale(1.06);
          emojiText.setScale(1.15);
          title.setScale(1.05);
          description.setScale(1.05);
          infoBg.setScale(1.06);
          info1.setScale(1.05);
          info2.setScale(1.05);
        });

        element.on('pointerout', () => {
          button.setFillStyle(color);
          button.setScale(1);
          shadow.setScale(1);
          emojiText.setScale(1);
          title.setScale(1);
          description.setScale(1);
          infoBg.setScale(1);
          info1.setScale(1);
          info2.setScale(1);
        });

        element.on('pointerdown', () => {
          config.onPointerDown();
        });
      });
    });
  }

  private getDifficultyEmoji(difficulty: string): string {
    switch (difficulty) {
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
