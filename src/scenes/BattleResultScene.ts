import { BattleResult, BattleEvent } from '../types/BattleTypes';
import { submitBattleResult, type SubmitBattleResultResponse } from '../utils/battleLeaderboard';
import { getBattleTier, getTierIndex } from '../utils/battleTier';
import { BattleChannel } from '../utils/battleChannel';
import BaseScene from './BaseScene';

interface BattleResultData {
  result: BattleResult;
  roomCode: string;
  userId?: string;
  opponentId?: string;
}

/**
 * 대전 결과 씬
 * - 승리/패배/연결끊김 표시
 * - RP 변동 + 티어 표시
 * - 재도전: 양쪽 모두 요청 시 BattleMatchScene 자동 복귀
 * - 상대 재도전 의사 / 이탈 실시간 알림
 */
export default class BattleResultScene extends BaseScene {
  private result: BattleResult = BattleResult.WIN;
  private roomCode: string = '';
  private userId: string = '';
  private opponentId: string = '';
  private resultSubmitted: boolean = false;

  // RP UI
  private tierText?: Phaser.GameObjects.Text;
  private rpDeltaText?: Phaser.GameObjects.Text;
  private currentRpText?: Phaser.GameObjects.Text;

  // 재도전 채널
  private rematchChannel: BattleChannel | null = null;
  private myRematchRequested: boolean = false;
  private opponentRematchRequested: boolean = false;
  private rematchTransitioning: boolean = false;
  private opponentLeftHandled: boolean = false;

  // 재도전 UI
  private rematchBtn!: Phaser.GameObjects.Rectangle;
  private rematchBtnLabel!: Phaser.GameObjects.Text;
  private rematchStatusText!: Phaser.GameObjects.Text;

  constructor() {
    super('BattleResultScene');
  }

  init(data: BattleResultData) {
    this.result = data.result ?? BattleResult.WIN;
    this.roomCode = data.roomCode ?? '';
    this.userId = data.userId ?? '';
    this.opponentId = data.opponentId ?? '';
    this.resultSubmitted = false;
    this.myRematchRequested = false;
    this.opponentRematchRequested = false;
    this.rematchTransitioning = false;
    this.opponentLeftHandled = false;
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

    // 결과 텍스트
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

    this.currentRpText = this.add.text(200, 183, '', {
      fontSize: '13px',
      color: '#888888',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // 재도전 상태 텍스트 (상대 의사 / 이탈 알림)
    this.rematchStatusText = this.add.text(200, 250, '', {
      fontSize: '14px',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
      align: 'center',
    }).setOrigin(0.5);

    // 재대전 버튼
    this.rematchBtn = this.add.rectangle(200, 310, 250, 50, 0xe74c3c);
    this.rematchBtn.setStrokeStyle(3, 0xffffff);
    this.rematchBtnLabel = this.add.text(200, 310, '⚔️ 재대전', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.rematchBtn.setInteractive({ useHandCursor: true });
    this.rematchBtn.on('pointerover', () => {
      if (!this.myRematchRequested) this.rematchBtn.setAlpha(0.8);
    });
    this.rematchBtn.on('pointerout', () => this.rematchBtn.setAlpha(1));
    this.rematchBtn.on('pointerdown', () => this.handleRematchClick());

    // 전적 보기 버튼
    const rankBtn = this.add.rectangle(200, 380, 250, 50, 0x27ae60);
    rankBtn.setStrokeStyle(3, 0xffffff);
    this.add.text(200, 380, '🏆 전적 보기', {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    rankBtn.setInteractive({ useHandCursor: true });
    rankBtn.on('pointerover', () => rankBtn.setAlpha(0.8));
    rankBtn.on('pointerout', () => rankBtn.setAlpha(1));
    rankBtn.on('pointerdown', () => this.navigateAway('BattleLeaderboardScene'));

    // 메인 메뉴 텍스트 링크
    const menuLink = this.add.text(200, 450, '메인 메뉴', {
      fontSize: '16px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    menuLink.on('pointerover', () => menuLink.setColor('#ffffff'));
    menuLink.on('pointerout', () => menuLink.setColor('#aaaaaa'));
    menuLink.on('pointerdown', () => this.navigateAway('ModeSelectScene'));

    // 전적 제출
    if (!this.resultSubmitted) {
      this.resultSubmitted = true;
      submitBattleResult(this.result, this.opponentId)
        .then((res) => this.showRpResult(res))
        .catch((err) => {
          console.warn('Battle result submit failed:', err);
          if (this.tierText?.active) this.tierText.setText('전적 기록 실패');
        });
    }

    // 재도전 채널 연결 (roomCode가 있을 때만)
    if (this.roomCode) {
      this.initRematchChannel();
    }
  }

  /** 제출 응답 수신 후 RP/티어 UI 업데이트 */
  private showRpResult(res: SubmitBattleResultResponse) {
    if (!this.tierText?.active || !this.rpDeltaText?.active) return;

    const oldTierIdx = getTierIndex(res.previousRp);
    const newTierIdx = getTierIndex(res.ratingPoints);
    const newTier = getBattleTier(res.ratingPoints);

    if (newTierIdx > oldTierIdx) {
      const oldTier = getBattleTier(res.previousRp);
      this.tierText.setText(`${oldTier.icon} ${oldTier.name}  →  ${newTier.icon} ${newTier.name}`);
      this.tierText.setColor('#FFD700');
    } else {
      this.tierText.setText(`${newTier.icon} ${newTier.name}  |  ${res.ratingPoints} RP`);
      this.tierText.setColor('#cccccc');
    }

    const deltaStr = res.pointDelta >= 0 ? `+${res.pointDelta} RP` : `${res.pointDelta} RP`;
    this.rpDeltaText.setText(deltaStr);
    this.rpDeltaText.setColor(res.pointDelta >= 0 ? '#00ff88' : '#ff4444');

    if (this.currentRpText?.active) {
      this.currentRpText.setText(`현재 ${res.ratingPoints} RP`);
    }
  }

  // ─── 재도전 채널 ────────────────────────────────────────────────

  private async initRematchChannel() {
    this.rematchChannel = new BattleChannel();
    this.rematchChannel.joinResult(this.roomCode, this.userId);

    // subscribe 전에 리스너 등록
    this.rematchChannel.onEvent(BattleEvent.REMATCH_REQUEST, () => {
      this.onOpponentRematchRequest();
    });

    // RESULT_LEAVE: 상대가 의도적으로 내비게이션 시 즉시 알림 (Broadcast 기반)
    this.rematchChannel.onEvent(BattleEvent.RESULT_LEAVE, () => {
      this.onOpponentLeft();
    });

    // Presence leave: 브라우저 종료 등 예기치 않은 이탈 fallback
    this.rematchChannel.onPresenceLeave(() => {
      this.onOpponentLeft();
    });

    await this.rematchChannel.subscribe();
  }

  /** 재대전 버튼 클릭 */
  private handleRematchClick() {
    if (this.myRematchRequested || this.rematchTransitioning) return;
    this.myRematchRequested = true;

    // 버튼 → 대기 상태
    this.rematchBtn.setFillStyle(0x555555);
    this.rematchBtn.removeInteractive();
    this.rematchBtnLabel.setText('⏳ 상대 대기 중...');

    // 상대에게 재도전 의사 전송
    if (this.rematchChannel) {
      this.rematchChannel.sendRematchRequest();
    }

    // 상대도 이미 요청해놨으면 바로 전환
    this.checkBothRematch();
  }

  /** 상대가 재도전 요청을 보냈을 때 */
  private onOpponentRematchRequest() {
    if (this.rematchTransitioning) return;
    this.opponentRematchRequested = true;

    // 내가 아직 안 눌렀다면 → 강조 알림
    if (!this.myRematchRequested) {
      if (this.rematchStatusText?.active) {
        this.rematchStatusText.setText('⚔️ 상대가 재도전을 원합니다!');
        this.rematchStatusText.setColor('#FFD700');
      }
      // 버튼 펄스 애니메이션
      this.tweens.add({
        targets: this.rematchBtn,
        scaleX: 1.06,
        scaleY: 1.06,
        duration: 280,
        yoyo: true,
        repeat: -1,
      });
    }

    this.checkBothRematch();
  }

  /** 상대가 채널에서 이탈했을 때 (RESULT_LEAVE broadcast + Presence leave 양쪽에서 호출될 수 있음) */
  private onOpponentLeft() {
    if (this.rematchTransitioning || this.opponentRematchRequested || this.opponentLeftHandled) return;
    this.opponentLeftHandled = true;

    if (this.rematchStatusText?.active) {
      this.rematchStatusText.setText('😢 상대가 나갔습니다');
      this.rematchStatusText.setColor('#ff6666');
    }

    // 재대전 버튼 비활성화
    this.tweens.killTweensOf(this.rematchBtn);
    this.rematchBtn.setFillStyle(0x333333);
    this.rematchBtn.removeInteractive();
    if (!this.myRematchRequested) {
      this.rematchBtnLabel.setText('재도전 불가');
    }
  }

  /** 양쪽 모두 재도전 의사 확인 시 BattleMatchScene으로 전환 */
  private checkBothRematch() {
    if (!this.myRematchRequested || !this.opponentRematchRequested) return;
    if (this.rematchTransitioning) return;
    this.rematchTransitioning = true;

    this.tweens.killTweensOf(this.rematchBtn);

    if (this.rematchStatusText?.active) {
      this.rematchStatusText.setText('🔄 재대전 시작!');
      this.rematchStatusText.setColor('#00ff88');
    }

    // 호스트 결정: userId 사전순 비교 (양쪽에서 동일하게 계산)
    const isHost = this.userId < this.opponentId;

    this.time.delayedCall(700, () => {
      if (this.rematchChannel) {
        this.rematchChannel.destroyImmediate();
        this.rematchChannel = null;
      }
      this.scene.start('BattleMatchScene', {
        autoRematch: { code: this.roomCode, isHost, userId: this.userId },
      });
    });
  }

  /**
   * 재도전 외 내비게이션 시 상대에게 이탈 broadcast 전송 후 씬 전환
   * Presence leave는 WebSocket 타임아웃에 의존하므로 신뢰성 낮음 →
   * 의도적 이탈은 Broadcast로 즉시 알림
   */
  private navigateAway(targetScene: string) {
    if (this.rematchChannel) {
      this.rematchChannel.sendResultLeave();
      this.rematchChannel.destroyImmediate();
      this.rematchChannel = null;
    }
    this.scene.start(targetScene);
  }

  shutdown() {
    if (this.rematchChannel) {
      this.rematchChannel.destroyImmediate();
      this.rematchChannel = null;
    }
  }
}
