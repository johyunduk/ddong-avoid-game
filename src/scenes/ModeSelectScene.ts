import Phaser from 'phaser';
import { GameMode, GAME_MODES, type GameModeConfig } from '../types/GameMode';

export default class ModeSelectScene extends Phaser.Scene {
  constructor() {
    super('ModeSelectScene');
  }

  preload() {
    // 배경 이미지 로드 (캐시 확인으로 중복 로딩 방지)
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    if (!this.textures.exists('title')) {
      this.load.image('title', 'assets/title.webp');
    }
  }

  create() {
    // 배경 이미지 추가
    const background = this.add.image(200, 300, 'background2');
    // 배경을 화면에 맞게 조정
    background.setDisplaySize(400, 600);

    // 타이틀 이미지 추가
    const title = this.add.image(200, 90, 'title');
    title.setScale(0.4); // 크기 조정

    this.add.text(200, 190, '모드를 선택하세요', {
      fontSize: '20px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);

    const startY = 250;
    const buttonSpacing = 120;

    GAME_MODES.forEach((modeConfig: GameModeConfig, index: number) => {
      const y = startY + (index * buttonSpacing);
      this.createModeButton(modeConfig, 200, y);
    });

    // 랭킹보드 버튼 추가
    this.createLeaderboardButton();

    // 릴리즈 노트 링크
    this.createReleaseNotesLink();
  }

  private createModeButton(modeConfig: GameModeConfig, x: number, y: number) {
    // 아이템 모드 비활성화 체크
    const isDisabled = modeConfig.mode === GameMode.ITEM;

    const button = this.add.rectangle(x, y, 300, 80, isDisabled ? 0xcccccc : 0xffffff, 1);
    button.setStrokeStyle(4, isDisabled ? 0x666666 : 0x000000);

    // 비활성화된 경우 텍스트 3줄, 활성화된 경우 2줄
    const title = this.add.text(x, y - 12, modeConfig.name, {
      fontSize: '24px',
      color: isDisabled ? '#666' : '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const description = this.add.text(x, y + 18, modeConfig.description, {
      fontSize: '14px',
      color: isDisabled ? '#888' : '#333',
      align: 'center'
    }).setOrigin(0.5);

    // 비활성화된 경우 인터랙션 없음
    if (isDisabled) {
      // "준비 중" 라벨 추가
      // this.add.text(x, y + 32, '준비 중', {
      //   fontSize: '12px',
      //   color: '#999',
      //   fontStyle: 'italic'
      // }).setOrigin(0.5);
      return; // 여기서 종료, 클릭 이벤트 없음
    }

    // 활성화된 버튼만 인터랙션 추가
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
  }

  private startGame(mode: GameMode) {
    // 클래식 모드일 경우 난이도 선택 화면으로 이동
    if (mode === GameMode.CLASSIC) {
      this.scene.start('DifficultySelectScene', { gameMode: mode });
    } else {
      // 아이템 모드는 바로 게임 시작 (기본 난이도 HARD)
      this.scene.start('GameScene', { gameMode: mode, difficulty: 'HARD' });
    }
  }

  private createReleaseNotesLink() {
    const text = this.add.text(200, 555, '릴리즈 노트', {
      fontSize: '14px',
      color: '#ccc',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    text.setInteractive({ useHandCursor: true });

    text.on('pointerover', () => {
      text.setColor('#fff');
    });

    text.on('pointerout', () => {
      text.setColor('#ccc');
    });

    text.on('pointerdown', () => {
      this.scene.start('ReleaseNotesScene');
    });
  }

  private createLeaderboardButton() {
    const button = this.add.rectangle(200, 495, 300, 80, 0x4a90e2, 1);
    button.setStrokeStyle(4, 0x2e5c8a);

    const text = this.add.text(200, 495, '🏆 랭킹보기 🏆', {
      fontSize: '24px',
      color: '#fff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });
    text.setInteractive({ useHandCursor: true });

    const elements = [button, text];
    elements.forEach(element => {
      element.on('pointerover', () => {
        button.setFillStyle(0x5ba3f5);
      });

      element.on('pointerout', () => {
        button.setFillStyle(0x4a90e2);
      });

      element.on('pointerdown', () => {
        this.scene.start('LeaderboardScene');
      });
    });
  }
}
