import Phaser from 'phaser';
import { Difficulty, Difficulty as DifficultyEnum } from '../types/GameMode';
import { getLeaderboard, type LeaderboardEntry } from '../utils/leaderboard';

export default class LeaderboardScene extends Phaser.Scene {
  private selectedDifficulty: Difficulty = DifficultyEnum.NORMAL;
  private leaderboardData: LeaderboardEntry[] = [];
  private leaderboardTexts: Phaser.GameObjects.Text[] = [];
  private loadingText?: Phaser.GameObjects.Text;
  private errorText?: Phaser.GameObjects.Text;

  constructor() {
    super('LeaderboardScene');
  }

  preload() {
    // 배경 이미지 로드
    this.load.image('background2', 'assets/backgrounds/background2.png');
  }

  create() {
    // 배경 이미지 추가
    const background = this.add.image(200, 300, 'background2');
    background.setDisplaySize(400, 600);

    // 타이틀
    this.add.text(200, 40, '🏆 랭킹보드 🏆', {
      fontSize: '28px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5
    }).setOrigin(0.5);

    // 난이도 선택 버튼들
    this.createDifficultyButtons();

    // 랭킹 표시 영역 (초기 로딩)
    this.loadingText = this.add.text(200, 300, '로딩 중...', {
      fontSize: '20px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // 뒤로가기 버튼
    this.createBackButton();

    // 초기 데이터 로드
    this.loadLeaderboard();
  }

  private createDifficultyButtons() {
    const difficulties: Difficulty[] = [
      DifficultyEnum.EASY,
      DifficultyEnum.NORMAL,
      DifficultyEnum.HARD,
      DifficultyEnum.EXTREME
    ];

    const buttonWidth = 80;
    const spacing = 90;
    const startX = 200 - (spacing * 1.5);
    const y = 95;

    difficulties.forEach((difficulty, index) => {
      const x = startX + (index * spacing);
      const isSelected = difficulty === this.selectedDifficulty;

      const button = this.add.rectangle(
        x,
        y,
        buttonWidth,
        35,
        isSelected ? 0xffff99 : 0xffffff,
        1
      );
      button.setStrokeStyle(3, isSelected ? 0xff0000 : 0x000000);

      this.add.text(x, y, difficulty, {
        fontSize: '12px',
        color: '#000',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      button.setInteractive({ useHandCursor: true });

      button.on('pointerover', () => {
        if (difficulty !== this.selectedDifficulty) {
          button.setFillStyle(0xffffcc);
        }
      });

      button.on('pointerout', () => {
        if (difficulty !== this.selectedDifficulty) {
          button.setFillStyle(0xffffff);
        }
      });

      button.on('pointerdown', () => {
        this.selectDifficulty(difficulty);
      });
    });
  }

  private selectDifficulty(difficulty: Difficulty) {
    this.selectedDifficulty = difficulty;

    // 모든 버튼 스타일 재설정
    this.children.list.forEach((child) => {
      if (child instanceof Phaser.GameObjects.Rectangle && child.y === 95) {
        const index = Math.floor((child.x - 20) / 90);
        const difficulties = [DifficultyEnum.EASY, DifficultyEnum.NORMAL, DifficultyEnum.HARD, DifficultyEnum.EXTREME];
        const isSelected = difficulties[index] === difficulty;

        child.setFillStyle(isSelected ? 0xffff99 : 0xffffff);
        child.setStrokeStyle(3, isSelected ? 0xff0000 : 0x000000);
      }
    });

    // 새로운 난이도 데이터 로드
    this.loadLeaderboard();
  }

  private async loadLeaderboard() {
    // 기존 랭킹 텍스트 제거
    this.leaderboardTexts.forEach(text => text.destroy());
    this.leaderboardTexts = [];

    if (this.errorText) {
      this.errorText.destroy();
      this.errorText = undefined;
    }

    // 로딩 표시
    if (!this.loadingText) {
      this.loadingText = this.add.text(200, 300, '로딩 중...', {
        fontSize: '20px',
        color: '#fff',
        stroke: '#000',
        strokeThickness: 3
      }).setOrigin(0.5);
    } else {
      this.loadingText.setVisible(true);
    }

    try {
      const response = await getLeaderboard(this.selectedDifficulty, 10);
      this.leaderboardData = response.leaderboard;

      if (this.loadingText) {
        this.loadingText.setVisible(false);
      }

      this.displayLeaderboard();
    } catch (error) {
      console.error('Failed to load leaderboard:', error);

      if (this.loadingText) {
        this.loadingText.setVisible(false);
      }

      this.errorText = this.add.text(200, 300, '랭킹을 불러올 수 없습니다\n\n나중에 다시 시도해주세요', {
        fontSize: '16px',
        color: '#ff6666',
        stroke: '#000',
        strokeThickness: 3,
        align: 'center'
      }).setOrigin(0.5);
    }
  }

  private displayLeaderboard() {
    const startY = 150;
    const lineHeight = 35;

    // 헤더
    const headerText = this.add.text(200, startY, '순위    이름      점수', {
      fontSize: '16px',
      color: '#ffff00',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);
    this.leaderboardTexts.push(headerText);

    // 랭킹 데이터 표시
    if (this.leaderboardData.length === 0) {
      const noDataText = this.add.text(200, startY + 50, '아직 랭킹이 없습니다\n\n첫 번째 플레이어가 되어보세요!', {
        fontSize: '18px',
        color: '#ccc',
        stroke: '#000',
        strokeThickness: 3,
        align: 'center'
      }).setOrigin(0.5);
      this.leaderboardTexts.push(noDataText);
      return;
    }

    this.leaderboardData.forEach((entry, index) => {
      const y = startY + 30 + (index * lineHeight);

      // 순위별 색상
      let color = '#ffffff';
      if (entry.rank === 1) color = '#FFD700'; // 금색
      else if (entry.rank === 2) color = '#C0C0C0'; // 은색
      else if (entry.rank === 3) color = '#CD7F32'; // 동색


      const rankText = `${entry.rank}`.padEnd(8, ' ');
      const nameText = entry.userName.padEnd(8, ' ');
      const scoreText = entry.score.toString().padStart(6, ' ');

      const text = this.add.text(
        200,
        y,
        `${rankText}${nameText}${scoreText}`,
        {
          fontSize: '16px',
          color: color,
          fontFamily: 'monospace',
          stroke: '#000',
          strokeThickness: 3
        }
      ).setOrigin(0.5);

      this.leaderboardTexts.push(text);
    });
  }

  private createBackButton() {
    const button = this.add.rectangle(200, 560, 150, 40, 0xffffff, 1);
    button.setStrokeStyle(3, 0x000000);

    const text = this.add.text(200, 560, '← 뒤로가기', {
      fontSize: '18px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    const elements = [button, text];
    elements.forEach(element => {
      element.on('pointerover', () => {
        button.setFillStyle(0xffff99);
      });

      element.on('pointerout', () => {
        button.setFillStyle(0xffffff);
      });

      element.on('pointerdown', () => {
        this.scene.start('ModeSelectScene');
      });
    });
  }
}
