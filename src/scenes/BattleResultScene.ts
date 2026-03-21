import { BattleResult } from '../types/BattleTypes';
import BaseScene from './BaseScene';

interface BattleResultData {
  result: BattleResult;
  myScore: number;
  opponentScore: number;
  roomCode: string;
}

/**
 * 대전 결과 씬
 * - 승리/패배/연결끊김 표시
 * - 양쪽 점수 비교
 * - 재대전 / 메인 메뉴 선택
 */
export default class BattleResultScene extends BaseScene {
  private result: BattleResult = BattleResult.WIN;
  private myScore: number = 0;
  private opponentScore: number = 0;

  constructor() {
    super('BattleResultScene');
  }

  init(data: BattleResultData) {
    this.result = data.result ?? BattleResult.WIN;
    this.myScore = data.myScore ?? 0;
    this.opponentScore = data.opponentScore ?? 0;
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

    this.add.text(200, 100, resultText, {
      fontSize: '36px',
      color: titleColor,
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // 점수 비교
    this.add.text(200, 200, '내 점수', {
      fontSize: '16px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(200, 240, `${this.myScore}`, {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(200, 300, 'VS', {
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

    this.add.text(200, 380, `${this.opponentScore}`, {
      fontSize: '48px',
      color: '#ff6666',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    // 재대전 버튼
    const rematchBtn = this.add.rectangle(200, 470, 250, 60, 0xe74c3c);
    rematchBtn.setStrokeStyle(3, 0xffffff);
    this.add.text(200, 470, '⚔️ 재대전', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    rematchBtn.setInteractive({ useHandCursor: true });
    rematchBtn.on('pointerover', () => rematchBtn.setAlpha(0.8));
    rematchBtn.on('pointerout', () => rematchBtn.setAlpha(1));
    rematchBtn.on('pointerdown', () => {
      this.scene.start('BattleMatchScene');
    });

    // 메인 메뉴 버튼
    const menuBtn = this.add.rectangle(200, 545, 250, 60, 0x555555);
    menuBtn.setStrokeStyle(3, 0xffffff);
    this.add.text(200, 545, '메인 메뉴', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    menuBtn.setInteractive({ useHandCursor: true });
    menuBtn.on('pointerover', () => menuBtn.setAlpha(0.8));
    menuBtn.on('pointerout', () => menuBtn.setAlpha(1));
    menuBtn.on('pointerdown', () => {
      this.scene.start('ModeSelectScene');
    });
  }
}
