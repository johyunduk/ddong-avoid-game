import Phaser from 'phaser';
import { BattleChannel } from '../utils/battleChannel';
import { BattleEvent, BattleResult } from '../types/BattleTypes';
import { GameMode, Difficulty } from '../types/GameMode';
import { POOP_CONFIG } from '../config/poop';
import type Poop from '../objects/Poop';
import GameScene from './GameScene';

/** 생존 시간(ms)을 "12.3초" 또는 "1:05.0" 형식으로 변환 */
function formatSurvivalTime(ms: number): string {
  const totalSec = ms / 1000;
  if (totalSec < 60) {
    return `${totalSec.toFixed(1)}초`;
  }
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec % 60).toFixed(1).padStart(4, '0');
  return `${min}:${sec}`;
}

interface BattleInitData {
  gameMode?: string;
  difficulty?: string;
  purePhysical?: boolean;
  roomCode?: string;
  userId?: string;
  opponentId?: string;
  isRanked?: boolean;
}

/**
 * 대전 게임 씬 — GameScene을 상속하여 코드 재사용
 *
 * BattleMatchScene에서 roomCode/userId를 받아 새 채널을 직접 생성합니다.
 * (Supabase Realtime은 리스너 등록 → subscribe 순서 필수)
 */
export default class BattleGameScene extends GameScene {
  private battleChannel: BattleChannel | null = null;
  private roomCode: string = '';
  private battleUserId: string = '';
  private opponentId: string = '';
  private isRanked: boolean = false;
  private opponentScore: number = 0;
  private opponentScoreText!: Phaser.GameObjects.Text;
  private scoreUpdateTimer!: Phaser.Time.TimerEvent;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private battleFinished: boolean = false;
  private survivalMs: number = 0;
  private survivalTimerEvent!: Phaser.Time.TimerEvent;
  private survivalText!: Phaser.GameObjects.Text;

  constructor() {
    super('BattleGameScene');
  }

  init(data: BattleInitData) {
    this.roomCode = data.roomCode ?? '';
    this.battleUserId = data.userId ?? '';
    this.opponentId = data.opponentId ?? '';
    this.isRanked = data.isRanked ?? false;
    this.opponentScore = 0;
    this.survivalMs = 0;
    this.battleFinished = false;
    this.channelReady = false;

    // 부모 init 호출: EXTREME 난이도 고정, BATTLE 모드
    super.init({
      gameMode: GameMode.BATTLE,
      difficulty: Difficulty.EXTREME,
      purePhysical: false,
    });
  }

  create() {
    super.create();

    // 대전 모드에서는 점수 / 최고 기록 표시 불필요 → 생존 시간으로 대체
    if (this.scoreText) this.scoreText.setVisible(false);
    if (this.highScoreText) this.highScoreText.setVisible(false);

    // 내 생존 시간 (좌상단)
    this.survivalText = this.add.text(10, 3, '⏱ 0.0초', {
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(10);

    // 상대 생존 시간 (우상단)
    this.opponentScoreText = this.add.text(390, 3, '상대: --', {
      fontSize: '14px',
      color: '#ff6666',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(1, 0).setDepth(10);

    // 생존 타이머 (100ms 주기)
    this.survivalTimerEvent = this.time.addEvent({
      delay: 100,
      callback: () => {
        if (!this.gameOver) {
          this.survivalMs += 100;
          if (this.survivalText?.active) {
            this.survivalText.setText(`⏱ ${formatSurvivalTime(this.survivalMs)}`);
          }
        }
      },
      loop: true,
    });

    // 연결 상태 표시
    const connectingText = this.add.text(200, 55, '⏳ 상대와 연결 중...', {
      fontSize: '13px',
      color: '#ffaa00',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    // 새 채널 생성 → 리스너 등록 → subscribe → 점수 타이머 시작
    this.initBattleChannel(connectingText);
  }

  /** 채널 연결 완료 여부 (send 호출 가드) */
  private channelReady: boolean = false;

  /**
   * 새 채널 생성 → 리스너 등록 → subscribe → 점수 타이머 시작
   */
  private async initBattleChannel(connectingText: Phaser.GameObjects.Text) {
    this.battleChannel = new BattleChannel();
    this.battleChannel.joinRoom(this.roomCode, this.battleUserId);

    // 리스너 등록 (subscribe 전 — Supabase Realtime 필수 패턴)
    this.setupBattleListeners();

    // 구독 시작
    await this.battleChannel.subscribe();
    this.channelReady = true;

    // 연결 완료 표시
    if (connectingText?.active) {
      connectingText.setText('✅ 연결 완료!');
      connectingText.setColor('#00ff00');
      this.time.delayedCall(1500, () => {
        if (connectingText.active) connectingText.destroy();
      });
    }

    // 구독 완료 후 점수 타이머 시작 (구독 전 전송 방지)
    this.scoreUpdateTimer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        if (!this.gameOver && this.battleChannel && this.channelReady) {
          this.battleChannel.sendScoreUpdate(this.survivalMs);
        }
      },
      loop: true,
    });
  }

  private setupBattleListeners() {
    if (!this.battleChannel) return;

    // 상대가 보낸 똥 수신
    this.battleChannel.onEvent(BattleEvent.SEND_POOP, (payload) => {
      if (!this.gameOver) {
        this.onReceivePoop(payload.count);
      }
    });

    // 상대 생존 시간 갱신
    this.battleChannel.onEvent(BattleEvent.SCORE_UPDATE, (payload) => {
      this.opponentScore = payload.score;
      if (this.opponentScoreText?.active) {
        this.opponentScoreText.setText(`상대: ${formatSurvivalTime(this.opponentScore)}`);
      }
    });

    // 상대 사망 → 즉시 승리
    this.battleChannel.onEvent(BattleEvent.GAME_OVER, (payload) => {
      if (!this.battleFinished) {
        this.opponentScore = payload.finalScore;
        // 패배 측이 최종 생존 시간을 표시할 수 있도록 현재 값을 한 번 더 전송
        if (this.channelReady && this.battleChannel) {
          this.battleChannel.sendScoreUpdate(this.survivalMs);
        }
        this.endBattle(BattleResult.WIN);
      }
    });

    // 상대 이탈 → 5초 대기 후 부전승
    this.battleChannel.onPresenceLeave(() => {
      if (!this.battleFinished && !this.gameOver) {
        this.showDisconnectWarning();
        this.disconnectTimer = setTimeout(() => {
          if (!this.battleFinished) {
            this.endBattle(BattleResult.DISCONNECT);
          }
        }, 5000);
      }
    });

    // 상대 재접속 시 타이머 취소
    this.battleChannel.onPresenceJoin(() => {
      if (this.disconnectTimer) {
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = null;
        this.hideDisconnectWarning();
      }
    });
  }

  /**
   * 특수 똥 수집 시 — 부모 처리 후 상대에게 똥 전송
   */
  protected handleSpecialCollected(
    poop: Phaser.Physics.Arcade.Sprite,
    type: import('../abilities/types').SpecialPoopType,
    baseScore: number,
    emoji: string,
    color: string,
    counterIncrement: () => void,
  ) {
    super.handleSpecialCollected(poop, type, baseScore, emoji, color, counterIncrement);

    // 상대에게 일반 똥 1개 전송
    if (this.battleChannel && this.channelReady && !this.gameOver) {
      this.battleChannel.sendPoop(1);

      const sendText = this.add.text(200, 150, '💩→ 상대에게 전송!', {
        fontSize: '16px',
        color: '#ff4444',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(200);
      this.tweens.add({
        targets: sendText,
        alpha: 0,
        y: 120,
        duration: 800,
        onComplete: () => sendText.destroy(),
      });
    }
  }

  /**
   * 피격 시 — 부모 처리 후 상대에게 사망 알림
   */
  protected hitPoop(
    player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    poop: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile
  ) {
    const wasGameOver = this.gameOver;
    super.hitPoop(player, poop);

    if (!wasGameOver && this.gameOver && this.battleChannel && this.channelReady) {
      this.battleChannel.sendGameOver(this.survivalMs);
      if (!this.battleFinished) {
        this.endBattle(BattleResult.LOSE);
      }
    }
  }

  /**
   * 게임오버 UI — 대전 모드에서는 endBattle()이 대신 처리
   */
  protected async showGameOverUI(_isNewRecord: boolean) {
    // 대전 모드에서는 리더보드/SKOR 제출 없이 결과 씬으로 전환
  }

  /**
   * 상대가 보낸 똥 수신 — 랜덤 위치에 일반 똥 생성 + 빨간 경고
   */
  private onReceivePoop(count: number) {
    const fallSpeed = this.difficultyConfig.baseSpeed +
      (this.difficultyLevel * POOP_CONFIG.normal.speedIncrement);

    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Between(15, 385);
      const y = Phaser.Math.Between(-100, -20);
      const poop = this.poops.get() as Poop;
      if (!poop) continue;
      poop.reinit(x, y, Difficulty.EXTREME);
      if (poop.body) {
        poop.body.velocity.y = fallSpeed * 1.2;
      }
      poop.setTint(0xff0000);
      this.time.delayedCall(300, () => {
        if (poop.active) poop.clearTint();
      });
    }

    this.showReceiveWarning();
  }

  private showReceiveWarning() {
    const border = this.add.rectangle(200, 300, 400, 600)
      .setStrokeStyle(6, 0xff0000)
      .setFillStyle(0xff0000, 0.1)
      .setDepth(150);

    this.tweens.add({
      targets: border,
      alpha: 0,
      duration: 400,
      onComplete: () => border.destroy(),
    });

    const warningText = this.add.text(200, 60, '⚠️ 공격 받음!', {
      fontSize: '18px',
      color: '#ff0000',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(200);
    this.tweens.add({
      targets: warningText,
      alpha: 0,
      y: 45,
      duration: 800,
      onComplete: () => warningText.destroy(),
    });
  }

  private disconnectWarningText: Phaser.GameObjects.Text | null = null;

  private showDisconnectWarning() {
    if (this.disconnectWarningText) return;
    this.disconnectWarningText = this.add.text(200, 200, '⚠️ 상대방 연결 끊김\n5초 후 부전승...', {
      fontSize: '18px',
      color: '#ffaa00',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5).setDepth(200);
  }

  private hideDisconnectWarning() {
    if (this.disconnectWarningText) {
      this.disconnectWarningText.destroy();
      this.disconnectWarningText = null;
    }
  }

  private endBattle(result: BattleResult) {
    if (this.battleFinished) return;
    this.battleFinished = true;

    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    this.hideDisconnectWarning();

    // 모든 결과에서 타이머 정리 (LOSE 시에도 불필요한 콜백 방지)
    if (this.scoreUpdateTimer) this.scoreUpdateTimer.remove();
    if (this.survivalTimerEvent) this.survivalTimerEvent.remove();

    if (result === BattleResult.WIN || result === BattleResult.DISCONNECT) {
      this.gameOver = true;
      this.physics.pause();
      this.sound.stopAll();
    }

    this.time.delayedCall(1000, () => {
      this.scene.start('BattleResultScene', {
        result,
        roomCode: this.roomCode,
        userId: this.battleUserId,
        opponentId: this.opponentId,
        isRanked: this.isRanked,
      });
    });
  }

  shutdown() {
    if (this.scoreUpdateTimer) this.scoreUpdateTimer.remove();
    if (this.survivalTimerEvent) this.survivalTimerEvent.remove();
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    // 동기 채널 정리 — Phaser는 shutdown()을 await하지 않으므로 비동기 destroy() 대신 즉시 제거
    if (this.battleChannel) {
      this.battleChannel.destroyImmediate();
      this.battleChannel = null;
    }
  }
}
