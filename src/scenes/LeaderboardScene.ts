import type Phaser from 'phaser';
import { Difficulty, Difficulty as DifficultyEnum } from '../types/GameMode';
import {
  getLeaderboard,
  claimSeasonReward,
  getCachedClaimAmount,
  type LeaderboardEntry,
  type PrevSeasonReward,
} from '../utils/leaderboard';
import BaseScene from './BaseScene';

export default class LeaderboardScene extends BaseScene {
  private selectedDifficulty: Difficulty = DifficultyEnum.NORMAL;
  private leaderboardData: LeaderboardEntry[] = [];
  private leaderboardTexts: Phaser.GameObjects.Text[] = [];
  private loadingText?: Phaser.GameObjects.Text;
  private errorText?: Phaser.GameObjects.Text;
  private currentRequestId: number = 0;
  private difficultyButtons = new Map<Difficulty, Phaser.GameObjects.Rectangle>();

  // 시즌 UI 요소
  private seasonText?: Phaser.GameObjects.Text;
  private prevSeasonReward: PrevSeasonReward | null = null;

  // 보상수령 버튼 (create에서 1회 생성, updateRewardUI에서 상태 변경)
  private rewardBtnBg?: Phaser.GameObjects.Rectangle;
  private rewardBtnLabel?: Phaser.GameObjects.Text;

  constructor() {
    super('LeaderboardScene');
  }

  init() {
    const last = localStorage.getItem('lastPlayedDifficulty') as Difficulty | null;
    if (last) {
      this.selectedDifficulty = last;
    }
  }

  preload() {
    // 배경 이미지 로드 (캐시 확인으로 중복 로딩 방지)
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
  }

  create() {
    super.create();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const yOff = (H - 600) / 2;

    // 배경 이미지 추가
    const background = this.add.image(cx, H / 2, 'background2');
    background.setDisplaySize(W, H);

    // 타이틀
    this.add.text(cx, 40 + yOff, '🏆 랭킹보드 🏆', {
      fontSize: '28px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
      padding: { top: 6 },
    }).setOrigin(0.5);

    // 시즌 월 표시 (데이터 로드 후 갱신)
    this.seasonText = this.add.text(cx, 70 + yOff, '', {
      fontSize: '13px',
      color: '#aaddff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // 난이도 선택 버튼들
    this.createDifficultyButtons(cx, yOff);

    // 랭킹 표시 영역 (초기 로딩)
    this.loadingText = this.add.text(cx, H / 2, '로딩 중...', {
      fontSize: '20px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // 보상수령 버튼 (하단 왼쪽, 뒤로가기와 나란히)
    const rbY = H - 40;
    this.rewardBtnBg = this.add.rectangle(cx - 80, rbY, 150, 40, 0x555555, 1);
    this.rewardBtnBg.setStrokeStyle(3, 0x333333);
    this.rewardBtnLabel = this.add.text(cx - 80, rbY, '보상수령', {
      fontSize: '18px',
      color: '#999999',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // 뒤로가기 버튼 (하단 오른쪽)
    this.createBackButton(cx + 80, H - 40);

    // 초기 데이터 로드
    this.loadLeaderboard();
  }

  private createDifficultyButtons(cx: number, yOff: number) {
    this.difficultyButtons.forEach(btn => btn.destroy());
    this.difficultyButtons.clear();

    const difficulties: Difficulty[] = [
      DifficultyEnum.NORMAL,
      DifficultyEnum.HARD,
      DifficultyEnum.EXTREME,
      DifficultyEnum.PHYSICAL
    ];

    const buttonWidth = 70;
    const spacing = 85;
    const startX = cx - (spacing * 1.5);
    const y = 108 + yOff;

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

      this.difficultyButtons.set(difficulty, button);
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
    // 같은 난이도면 무시
    if (this.selectedDifficulty === difficulty) {
      return;
    }

    this.selectedDifficulty = difficulty;

    // 모든 버튼 스타일 재설정
    this.difficultyButtons.forEach((btn, diff) => {
      const isSelected = diff === difficulty;
      btn.setFillStyle(isSelected ? 0xffff99 : 0xffffff);
      btn.setStrokeStyle(3, isSelected ? 0xff0000 : 0x000000);
    });

    // 새로운 난이도 데이터 로드
    this.loadLeaderboard();
  }

  private async loadLeaderboard() {
    // 요청 ID 증가 (새로운 요청 시작)
    this.currentRequestId++;
    const requestId = this.currentRequestId;

    // 기존 랭킹 텍스트 제거
    this.leaderboardTexts.forEach(text => text.destroy());
    this.leaderboardTexts = [];
    this.prevSeasonReward = null;

    if (this.errorText) {
      this.errorText.destroy();
      this.errorText = undefined;
    }

    // 로딩 표시
    if (!this.loadingText) {
      this.loadingText = this.add.text(this.scale.width / 2, this.scale.height / 2, '로딩 중...', {
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

      // 응답이 도착했을 때 최신 요청인지 확인
      if (requestId !== this.currentRequestId) {
        // 이미 새로운 요청이 시작됨 - 이 응답은 무시
        return;
      }

      this.leaderboardData = response.leaderboard;

      // 시즌 텍스트 갱신
      if (this.seasonText && response.yearMonth) {
        const [y, m] = response.yearMonth.split('-');
        const daysLeft = this.calcDaysUntilMonthEnd();
        this.seasonText.setText(`${y}년 ${parseInt(m)}월 시즌  |  시즌 종료까지 D-${daysLeft}`);
      }

      // 직전 달 보상 상태 결정 (localStorage 캐시 우선)
      if (response.yearMonth) {
        const [y, m] = response.yearMonth.split('-').map(Number) as [number, number];
        const prevDate = new Date(Date.UTC(y, m - 2, 1));
        const prevYM = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
        const cached = getCachedClaimAmount(prevYM, this.selectedDifficulty);
        if (cached !== null) {
          // localStorage 캐시 히트 → 서버 응답의 prevSeasonReward 무시하고 캐시 사용
          this.prevSeasonReward = {
            yearMonth: prevYM,
            rank: response.prevSeasonReward?.rank ?? null,
            skorAwarded: cached,
            alreadyClaimed: true,
          };
        } else {
          this.prevSeasonReward = response.prevSeasonReward;
        }
      } else {
        this.prevSeasonReward = null;
      }

      if (this.loadingText) {
        this.loadingText.setVisible(false);
      }

      this.displayLeaderboard();
      this.updateRewardUI();
    } catch (error) {
      // 에러가 발생했을 때도 최신 요청인지 확인
      if (requestId !== this.currentRequestId) {
        // 이미 새로운 요청이 시작됨 - 이 에러는 무시
        return;
      }

      console.error('Failed to load leaderboard:', error);

      if (this.loadingText) {
        this.loadingText.setVisible(false);
      }

      this.errorText = this.add.text(this.scale.width / 2, this.scale.height / 2, '랭킹을 불러올 수 없습니다\n\n나중에 다시 시도해주세요', {
        fontSize: '16px',
        color: '#ff6666',
        stroke: '#000',
        strokeThickness: 3,
        align: 'center'
      }).setOrigin(0.5);
    }
  }

  private displayLeaderboard() {
    const yOff = (this.scale.height - 600) / 2;
    const cx = this.scale.width / 2;
    const startY = 163 + yOff;
    const lineHeight = 35;

    // 헤더
    const headerText = this.add.text(cx, startY, '순위    이름      점수', {
      fontSize: '16px',
      color: '#ffff00',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);
    this.leaderboardTexts.push(headerText);

    // 랭킹 데이터 표시
    if (this.leaderboardData.length === 0) {
      const noDataText = this.add.text(cx, startY + 50, '아직 랭킹이 없습니다\n\n첫 번째 플레이어가 되어보세요!', {
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
        cx,
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

  /** 이번 달 말일까지 남은 일수 */
  private calcDaysUntilMonthEnd(): number {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const diff = lastDay.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /** 보상수령 버튼 상태 갱신 */
  private updateRewardUI() {
    if (!this.rewardBtnBg || !this.rewardBtnLabel) return;

    const btn = this.rewardBtnBg;
    const label = this.rewardBtnLabel;
    const reward = this.prevSeasonReward;

    btn.removeAllListeners();
    btn.disableInteractive();

    if (!reward || reward.rank === null || reward.skorAwarded === 0) {
      // 비활성: 기록 없음 또는 100위 밖
      btn.setFillStyle(0x555555).setStrokeStyle(3, 0x333333);
      label.setText('보상수령').setColor('#999999');

    } else if (reward.alreadyClaimed) {
      // 비활성: 수령 완료 (초록)
      btn.setFillStyle(0x336633).setStrokeStyle(3, 0x224422);
      label.setText('수령완료').setColor('#88ff88');

    } else {
      // 활성: 수령 가능 (노란색)
      btn.setFillStyle(0xffcc00).setStrokeStyle(3, 0xaa8800);
      label.setText('보상수령').setColor('#000000');
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setFillStyle(0xffe566));
      btn.on('pointerout', () => btn.setFillStyle(0xffcc00));
      btn.on('pointerdown', () => this.handleClaimReward());
    }
  }

  /** 보상받기 버튼 클릭 처리 */
  private async handleClaimReward() {
    if (!this.rewardBtnBg || !this.rewardBtnLabel) return;

    // 처리 중 표시 (중복 클릭 방지)
    this.rewardBtnBg.disableInteractive();
    this.rewardBtnLabel.setText('처리중...').setColor('#aaaaaa');

    try {
      const result = await claimSeasonReward(this.selectedDifficulty);

      if (result.success && (result.skorAwarded ?? 0) > 0) {
        if (this.prevSeasonReward) {
          this.prevSeasonReward = { ...this.prevSeasonReward, alreadyClaimed: true };
        }
        this.updateRewardUI();

        // 획득 플래시 연출
        const flashText = this.add.text(
          this.scale.width / 2, this.scale.height / 2 - 60,
          `+${result.skorAwarded} SKOR 획득!`, {
            fontSize: '24px',
            color: '#ffcc00',
            fontStyle: 'bold',
            stroke: '#000',
            strokeThickness: 5,
          }
        ).setOrigin(0.5);

        this.tweens.add({
          targets: flashText,
          alpha: { from: 1, to: 0 },
          y: flashText.y - 40,
          duration: 1500,
          ease: 'Cubic.easeOut',
          onComplete: () => flashText.destroy(),
        });
      } else {
        if (this.prevSeasonReward && result.alreadyClaimed) {
          this.prevSeasonReward = { ...this.prevSeasonReward, alreadyClaimed: true };
        }
        this.updateRewardUI();
      }
    } catch {
      // 실패 시 원래 상태로 복구
      this.updateRewardUI();
    }
  }

  private createBackButton(cx: number, y: number) {
    const button = this.add.rectangle(cx, y, 150, 40, 0xffffff, 1);
    button.setStrokeStyle(3, 0x000000);

    const text = this.add.text(cx, y, '← 뒤로가기', {
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
