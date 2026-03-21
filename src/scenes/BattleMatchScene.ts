import Phaser from 'phaser';
import { BattleChannel } from '../utils/battleChannel';
import { BattleEvent } from '../types/BattleTypes';
import { getSafeSelectedCharacter } from '../utils/character';
import { supabase } from '../utils/supabase';
import BaseScene from './BaseScene';

/**
 * 대전 매칭 씬 — 상태별 UI 전환
 *
 * 상태: MENU → CREATE_WAITING / JOIN_INPUT → JOIN_WAITING → COUNTDOWN → BATTLE
 */
export default class BattleMatchScene extends BaseScene {
  private battleChannel: BattleChannel | null = null;
  private inputElement: HTMLInputElement | null = null;
  private isHost: boolean = false;
  private myReady: boolean = false;
  private opponentReady: boolean = false;
  private countdownStarted: boolean = false;
  private readyRetryTimer: ReturnType<typeof setInterval> | null = null;
  private userId: string = '';

  // 상태별 UI 요소를 그룹으로 관리 → 상태 전환 시 일괄 파괴
  private uiGroup: Phaser.GameObjects.GameObject[] = [];
  private uiTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('BattleMatchScene');
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
  }

  create() {
    super.create();

    // 배경 (모든 상태에서 유지)
    const bg = this.add.image(200, 300, 'background2');
    bg.setDisplaySize(400, 600);
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.6);

    // 타이틀 (모든 상태에서 유지)
    this.add.text(200, 60, '⚔️ 대전 모드', {
      fontSize: '32px',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(200, 105, 'EXTREME 난이도로 1대1 대전!', {
      fontSize: '14px',
      color: '#cccccc',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // 뒤로가기 (모든 상태에서 유지)
    const backBtn = this.add.text(200, 560, '← 메인 메뉴', {
      fontSize: '18px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
    backBtn.on('pointerout', () => backBtn.setColor('#aaaaaa'));
    backBtn.on('pointerdown', () => this.goBack());

    // 유저 ID: 즉시 임시값 사용 → 백그라운드에서 실제 ID로 교체
    // (Phaser는 async create()를 await하지 않으므로 동기 처리)
    this.userId = `anon-${Date.now()}`;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) this.userId = data.user.id;
    });

    // 초기 상태: 메뉴
    this.showMenu();
  }

  /** 현재 상태의 UI 요소 일괄 파괴 */
  private clearUI() {
    this.removeInput();
    for (const obj of this.uiGroup) {
      if (obj.active) obj.destroy();
    }
    this.uiGroup = [];
    // TimerEvent는 GameObject가 아니므로 별도 정리
    for (const timer of this.uiTimers) {
      timer.remove();
    }
    this.uiTimers = [];
  }

  /** UI 요소를 그룹에 추가 (나중에 일괄 파괴용) */
  private ui<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.uiGroup.push(obj);
    return obj;
  }

  // ─── 상태 1: 메뉴 (방 만들기 / 방 참가 선택) ─────────────────────

  private showMenu() {
    this.clearUI();

    // 방 만들기 버튼
    const createBtn = this.ui(this.add.rectangle(200, 250, 260, 70, 0xe74c3c));
    createBtn.setStrokeStyle(3, 0xffffff);
    this.ui(this.add.text(200, 250, '🏠 방 만들기', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5));
    createBtn.setInteractive({ useHandCursor: true });
    createBtn.on('pointerover', () => createBtn.setAlpha(0.8));
    createBtn.on('pointerout', () => createBtn.setAlpha(1));
    createBtn.on('pointerdown', () => this.handleCreateRoom());

    // 방 참가 버튼
    const joinBtn = this.ui(this.add.rectangle(200, 350, 260, 70, 0x3498db));
    joinBtn.setStrokeStyle(3, 0xffffff);
    this.ui(this.add.text(200, 350, '🔗 방 참가', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5));
    joinBtn.setInteractive({ useHandCursor: true });
    joinBtn.on('pointerover', () => joinBtn.setAlpha(0.8));
    joinBtn.on('pointerout', () => joinBtn.setAlpha(1));
    joinBtn.on('pointerdown', () => this.showJoinInput());
  }

  // ─── 상태 2a: 방 생성 대기 ─────────────────────────────────────

  private async handleCreateRoom() {
    if (this.battleChannel) return;
    this.isHost = true;
    this.myReady = false;
    this.opponentReady = false;
    this.countdownStarted = false;

    const code = BattleChannel.generateRoomCode();
    this.battleChannel = new BattleChannel();
    this.battleChannel.createRoom(code, this.userId);
    this.setupChannelListeners();
    await this.battleChannel.subscribe();

    this.showCreateWaiting(code);
  }

  private showCreateWaiting(code: string) {
    this.clearUI();

    this.ui(this.add.text(200, 200, '초대 코드', {
      fontSize: '16px', color: '#aaaaaa',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    this.ui(this.add.text(200, 260, code, {
      fontSize: '56px', color: '#FFD700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 6, letterSpacing: 10,
    }).setOrigin(0.5));

    this.ui(this.add.text(200, 330, '상대방에게 코드를 알려주세요', {
      fontSize: '15px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // 대기 애니메이션 점
    const dots = this.ui(this.add.text(200, 370, '대기 중', {
      fontSize: '16px', color: '#888888',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    let dotCount = 0;
    this.uiTimers.push(
      this.time.addEvent({
        delay: 500,
        loop: true,
        callback: () => {
          dotCount = (dotCount + 1) % 4;
          if (dots.active) dots.setText('대기 중' + '.'.repeat(dotCount));
        },
      })
    );
  }

  // ─── 상태 2b: 코드 입력 (방 참가) ──────────────────────────────

  private showJoinInput() {
    this.clearUI();

    this.ui(this.add.text(200, 200, '방 코드 입력', {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // Phaser 캔버스 좌표 → DOM 좌표 변환
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / 400;
    const scaleY = rect.height / 600;

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 4;
    input.placeholder = 'CODE';
    input.style.cssText = `
      position: fixed;
      left: ${rect.left + 200 * scaleX}px;
      top: ${rect.top + 270 * scaleY}px;
      transform: translateX(-50%);
      width: ${Math.round(200 * scaleX)}px;
      height: ${Math.round(55 * scaleY)}px;
      font-size: ${Math.round(30 * scaleY)}px;
      text-align: center;
      text-transform: uppercase;
      border: 3px solid #FFD700;
      border-radius: 12px;
      background: #1a1a2e;
      color: #FFD700;
      font-weight: bold;
      letter-spacing: ${Math.round(10 * scaleX)}px;
      outline: none;
      z-index: 9999;
    `;
    document.body.appendChild(input);
    input.focus();
    this.inputElement = input;

    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    // 에러 메시지 영역
    const errorText = this.ui(this.add.text(200, 330, '', {
      fontSize: '14px', color: '#ff4444',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // 참가 버튼
    const joinBtn = this.ui(this.add.rectangle(200, 390, 200, 55, 0x27ae60));
    joinBtn.setStrokeStyle(3, 0xffffff);
    this.ui(this.add.text(200, 390, '참가', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5));
    joinBtn.setInteractive({ useHandCursor: true });
    joinBtn.on('pointerover', () => joinBtn.setAlpha(0.8));
    joinBtn.on('pointerout', () => joinBtn.setAlpha(1));

    const doJoin = async () => {
      const code = input.value.trim().toUpperCase();
      if (code.length !== 4) {
        errorText.setText('4자리 코드를 입력하세요');
        return;
      }

      errorText.setText('');
      this.isHost = false;
      this.myReady = false;
      this.opponentReady = false;
      this.countdownStarted = false;
      this.battleChannel = new BattleChannel();
      this.battleChannel.joinRoom(code, this.userId);
      this.setupChannelListeners();
      await this.battleChannel.subscribe();

      this.showJoinWaiting(code);
    };

    joinBtn.on('pointerdown', doJoin);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doJoin();
    });

    // 뒤로 (메뉴로)
    const backText = this.ui(this.add.text(200, 470, '← 돌아가기', {
      fontSize: '16px', color: '#888888',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }));
    backText.on('pointerover', () => backText.setColor('#ffffff'));
    backText.on('pointerout', () => backText.setColor('#888888'));
    backText.on('pointerdown', () => this.showMenu());
  }

  // ─── 상태 3: 참가 후 대기 ──────────────────────────────────────

  private showJoinWaiting(_code: string) {
    // 구독 완료 → 즉시 ready 전송
    this.doSendReady();
  }

  // ─── 채널 이벤트 ───────────────────────────────────────────────

  private setupChannelListeners() {
    if (!this.battleChannel) return;

    // Presence join — 호스트일 때 상대 입장 UI 갱신 + 즉시 ready 전송
    this.battleChannel.onPresenceJoin(() => {
      if (this.isHost && !this.myReady) {
        this.doSendReady();
      }
    });

    this.battleChannel.onPresenceLeave(() => {
      this.opponentReady = false;
      this.ui(this.add.text(200, 420, '⚠️ 상대방이 나갔습니다', {
        fontSize: '16px', color: '#ff4444',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5));
    });

    // READY 수신 = 상대가 확실히 존재 + 준비 완료
    // Presence join보다 READY가 먼저 올 수 있으므로, 여기서도 자신의 ready를 보냄
    this.battleChannel.onEvent(BattleEvent.READY, () => {
      this.opponentReady = true;
      // 아직 내 ready를 안 보냈으면 즉시 보냄 (Presence 이벤트 누락 대비)
      if (!this.myReady) {
        this.doSendReady();
      }
      this.checkBothReady();
    });

    this.battleChannel.onEvent(BattleEvent.GAME_START, () => {
      if (!this.countdownStarted) {
        this.countdownStarted = true;
        this.showCountdown();
      }
    });
  }

  /** ready 전송 (UI 상태와 분리 — 어디서든 호출 가능) */
  private doSendReady() {
    if (!this.battleChannel || this.myReady) return;
    this.myReady = true;
    const charId = getSafeSelectedCharacter();
    this.battleChannel.sendReady(charId);

    // UI 갱신: 현재 화면 정리 → 대기 화면
    this.clearUI();
    this.ui(this.add.text(200, 270, '✅ 준비 완료!', {
      fontSize: '24px', color: '#00ff00', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));
    this.ui(this.add.text(200, 320, '상대를 기다리는 중...', {
      fontSize: '16px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // READY를 주기적으로 재전송 — 네트워크/타이밍 이슈로 상대가 수신 못했을 때 대비
    // setInterval 사용 (Phaser 타이머는 백그라운드 탭에서 멈추므로)
    this.clearReadyRetry();
    this.readyRetryTimer = setInterval(() => {
      if (this.countdownStarted || !this.battleChannel) {
        this.clearReadyRetry();
        return;
      }
      this.battleChannel.sendReady(charId);
    }, 1500);

    this.checkBothReady();
  }

  private clearReadyRetry() {
    if (this.readyRetryTimer) {
      clearInterval(this.readyRetryTimer);
      this.readyRetryTimer = null;
    }
  }

  private checkBothReady() {
    if (this.myReady && this.opponentReady && this.isHost && !this.countdownStarted) {
      this.countdownStarted = true;
      this.battleChannel?.sendGameStart(Date.now());
      this.showCountdown();
    }
  }

  // ─── 상태 4: 카운트다운 ────────────────────────────────────────

  private showCountdown() {
    this.clearUI();

    let count = 3;
    const countText = this.ui(this.add.text(200, 280, `${count}`, {
      fontSize: '90px', color: '#ff4444', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5));

    const timer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        count--;
        if (count > 0) {
          (countText as Phaser.GameObjects.Text).setText(`${count}`);
        } else {
          (countText as Phaser.GameObjects.Text).setText('GO!');
          (countText as Phaser.GameObjects.Text).setColor('#00ff00');
          timer.remove();
          this.time.delayedCall(500, () => this.goToBattle());
        }
      },
      repeat: 2,
    });
  }

  // ─── 씬 전환 ──────────────────────────────────────────────────

  private goToBattle() {
    this.clearReadyRetry();
    const roomCode = this.battleChannel?.code ?? '';
    const userId = this.userId;

    // 동기식 채널 제거: supabase.channel()이 싱글턴이므로
    // removeChannel을 먼저 호출해야 BattleGameScene에서 새 채널 생성 가능
    if (this.battleChannel) {
      this.battleChannel.destroyImmediate();
      this.battleChannel = null;
    }

    this.scene.start('BattleGameScene', { roomCode, userId });
  }

  private removeInput() {
    if (this.inputElement) {
      this.inputElement.remove();
      this.inputElement = null;
    }
  }

  private async goBack() {
    this.clearReadyRetry();
    this.removeInput();
    if (this.battleChannel) {
      await this.battleChannel.destroy();
      this.battleChannel = null;
    }
    this.scene.start('ModeSelectScene');
  }

  shutdown() {
    this.clearReadyRetry();
    this.removeInput();
    if (this.battleChannel) {
      this.battleChannel.destroyImmediate();
      this.battleChannel = null;
    }
  }
}
