import { BattleResult } from '../types/BattleTypes';
import { submitBattleResult, type SubmitBattleResultResponse } from '../utils/battleLeaderboard';
import { getBattleTier, getTierIndex } from '../utils/battleTier';
import BaseScene from './BaseScene';

interface BattleResultData {
  result: BattleResult;
  myScore: number;
  opponentScore: number;
  roomCode: string;
  opponentId?: string;
}

/**
 * 대전 결과 씬
 * - 승리/패배/연결끊김 표시
 * - 양쪽 점수 비교
 * - RP 변동 + 티어 표시
 * - 재대전 / 메인 메뉴 선택
 */
export default class BattleResultScene extends BaseScene {
  private result: BattleResult = BattleResult.WIN;
  private myScore: number = 0;
  private opponentScore: number = 0;
  private opponentId: string = '';
  private resultSubmitted: boolean = false;

  // RP UI 텍스트 (제출 후 업데이트)
  private tierText?: Phaser.GameObjects.Text;
  private rpDeltaText?: Phaser.GameObjects.Text;

  constructor() {
    super('BattleResultScene');
  }

  init(data: BattleResultData) {
    this.result = data.result ?? BattleResult.WIN;
    this.myScore = data.myScore ?? 0;
    this.opponentScore = data.opponentScore ?? 0;
    this.opponentId = data.opponentId ?? '';
    this.resultSubmitted = false;
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
  }

  create() {
    super.create();

    // 배경
    const bg = this.add.image(200, 300, 'background2');
    bg.setDisplaySize(400, 600);
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.75);

    // 결과에 따른 표시
    const isWin = this.result === BattleResult.WIN || this.result === BattleResult.DISCONNECT;

    const resultText = this.result === BattleResult.WIN ? '🏆 승리! 🏆'
      : this.result === BattleResult.DISCONNECT ? '🏆 부전승 🏆'
      : '💀 패배... 💀';
    const titleColor = isWin ? '#FFD700' : '#ff4444';

    this.add.text(200, 85, resultText, {
      fontSize: '36px',
      color: titleColor,
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // 티어/RP 영역 (전적 제출 후 채워짐)
    this.tierText = this.add.text(200, 130, '전적 기록 중...', {
      fontSize: '15px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.rpDeltaText = this.add.text(200, 155, '', {
      fontSize: '18px',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // 점수 비교
    this.add.text(200, 210, '내 점수', {
      fontSize: '16px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(200, 248, `${this.myScore}`, {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(200, 305, 'VS', {
      fontSize: '24px',
      color: '#888888',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(200, 340, '상대 점수', {
      fontSize: '16px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(200, 378, `${this.opponentScore}`, {
      fontSize: '48px',
      color: '#ff6666',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    // 재대전 버튼
    const rematchBtn = this.add.rectangle(200, 447, 250, 50, 0xe74c3c);
    rematchBtn.setStrokeStyle(3, 0xffffff);
    this.add.text(200, 447, '⚔️ 재대전', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    rematchBtn.setInteractive({ useHandCursor: true });
    rematchBtn.on('pointerover', () => rematchBtn.setAlpha(0.8));
    rematchBtn.on('pointerout', () => rematchBtn.setAlpha(1));
    rematchBtn.on('pointerdown', () => {
      this.scene.start('BattleMatchScene');
    });

    // 전적 보기 버튼
    const rankBtn = this.add.rectangle(200, 507, 250, 50, 0x27ae60);
    rankBtn.setStrokeStyle(3, 0xffffff);
    this.add.text(200, 507, '🏆 전적 보기', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    rankBtn.setInteractive({ useHandCursor: true });
    rankBtn.on('pointerover', () => rankBtn.setAlpha(0.8));
    rankBtn.on('pointerout', () => rankBtn.setAlpha(1));
    rankBtn.on('pointerdown', () => {
      this.scene.start('BattleLeaderboardScene');
    });

    // 메인 메뉴 텍스트 링크
    const menuLink = this.add.text(200, 562, '메인 메뉴', {
      fontSize: '16px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    menuLink.on('pointerover', () => menuLink.setColor('#ffffff'));
    menuLink.on('pointerout', () => menuLink.setColor('#aaaaaa'));
    menuLink.on('pointerdown', () => {
      this.scene.start('ModeSelectScene');
    });

    // 전적 제출 (중복 방지)
    if (!this.resultSubmitted) {
      this.resultSubmitted = true;
      submitBattleResult(this.result, this.opponentId)
        .then((res) => this.showRpResult(res))
        .catch((err) => {
          console.warn('Battle result submit failed:', err);
          if (this.tierText?.active) this.tierText.setText('전적 기록 실패');
        });
    }
  }

  /** 제출 응답 수신 후 RP/티어 UI 업데이트 */
  private showRpResult(res: SubmitBattleResultResponse) {
    if (!this.tierText?.active || !this.rpDeltaText?.active) return;

    // previousRp: 서버가 반환한 실제 이전 RP (클라이언트 역산 시 하한선 0 클램핑 오류 방지)
    const oldTierIdx = getTierIndex(res.previousRp);
    const newTierIdx = getTierIndex(res.ratingPoints);
    const newTier = getBattleTier(res.ratingPoints);

    // 티어 변화 표시
    if (newTierIdx > oldTierIdx) {
      // 티어 상승
      const oldTier = getBattleTier(res.previousRp);
      this.tierText.setText(
        `${oldTier.icon} ${oldTier.name}  →  ${newTier.icon} ${newTier.name}`,
      );
      this.tierText.setColor('#FFD700');
    } else {
      this.tierText.setText(`${newTier.icon} ${newTier.name}  |  ${res.ratingPoints} RP`);
      this.tierText.setColor('#cccccc');
    }

    // RP 변동량
    const deltaStr = res.pointDelta >= 0 ? `+${res.pointDelta} RP` : `${res.pointDelta} RP`;
    this.rpDeltaText.setText(deltaStr);
    this.rpDeltaText.setColor(res.pointDelta >= 0 ? '#00ff88' : '#ff4444');
  }
}
