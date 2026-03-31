import type Phaser from 'phaser';
import { GameMode, GAME_MODES, type GameModeConfig } from '../types/GameMode';
import { getSkorBalance, getCachedSkorBalance, cacheSkorBalance } from '../utils/skor';
import { setBgmMuted } from '../utils/settings';
import { getFragmentCount } from '../utils/storyProgress';
import BaseScene from './BaseScene';

export default class ModeSelectScene extends BaseScene {
  private skorText!: Phaser.GameObjects.Text;
  private settingsPanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('ModeSelectScene');
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    if (!this.textures.exists('title')) {
      this.load.image('title', 'assets/title.webp');
    }
  }

  create() {
    super.create();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const yOff = (H - 600) / 2;

    const background = this.add.image(cx, H / 2, 'background2');
    background.setDisplaySize(W, H);

    const title = this.add.image(cx, 90 + yOff, 'title');
    title.setScale(0.4);

    this.add.text(cx, 190 + yOff, '모드를 선택하세요', {
      fontSize: '20px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // 클래식 + 대전 모드 버튼 (같은 줄, 캐릭터/랭킹 버튼과 동일 크기)
    this.createModeButton(GAME_MODES[0], cx - 80, 250 + yOff);
    this.createBattleButton(cx + 80, 250 + yOff);

    // 뽑기 버튼 (SKOR 잔액 포함)
    this.createGachaButton(cx, 345 + yOff);

    // 하단 버튼 행: 캐릭터 선택 + 랭킹
    this.createCharacterButton(cx - 80, 435 + yOff);
    this.createLeaderboardButton(cx + 80, 435 + yOff);

    // MEMORY VAULT 버튼
    this.createMemoryVaultButton(cx, 520 + yOff);

    // 릴리즈 노트 링크
    this.createReleaseNotesLink(cx, H - 80);

    // 설정 버튼 (우하단)
    this.createSettingsButton(W - 26, H - 26);

    // SKOR 잔액 비동기 로드
    this.loadSkorBalance();
  }

  private async loadSkorBalance() {
    try {
      const balance = await getSkorBalance();
      cacheSkorBalance(balance);
      if (this.skorText?.active) {
        this.skorText.setText(`💰 ${Math.floor(balance)} SKOR`);
      }
    } catch {
      // 잔액 로드 실패 시 캐시 값 유지
    }
  }

  private createModeButton(modeConfig: GameModeConfig, x: number, y: number) {
    const button = this.add.rectangle(x, y, 140, 70, 0xffffff, 1);
    button.setStrokeStyle(3, 0x000000);

    const titleText = this.add.text(x, y, modeConfig.name, {
      fontSize: '18px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });
    titleText.setInteractive({ useHandCursor: true });

    [button, titleText].forEach(element => {
      element.on('pointerover', () => button.setFillStyle(0xffff99));
      element.on('pointerout',  () => button.setFillStyle(0xffffff));
      element.on('pointerdown', () => this.startGame(modeConfig.mode));
    });
  }

  private createBattleButton(x: number, y: number) {
    const button = this.add.rectangle(x, y, 140, 70, 0xe74c3c, 1);
    button.setStrokeStyle(3, 0xc0392b);

    const titleText = this.add.text(x, y, '⚔️ 대전 모드', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
      padding: { top: 4 },
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });
    titleText.setInteractive({ useHandCursor: true });

    [button, titleText].forEach(el => {
      el.on('pointerover', () => {
        button.setFillStyle(0xff6b6b);
        button.setStrokeStyle(3, 0xff4444);
      });
      el.on('pointerout', () => {
        button.setFillStyle(0xe74c3c);
        button.setStrokeStyle(3, 0xc0392b);
      });
      el.on('pointerdown', () => {
        this.scene.start('BattleMatchScene');
      });
    });
  }

  private createGachaButton(x: number, y: number) {
    const button = this.add.rectangle(x, y, 300, 75, 0x1a1a2e, 1);
    button.setStrokeStyle(3, 0x7b2fff);

    // 뽑기 타이틀
    this.add.text(x, y - 22, '🎰 캐릭터 뽑기', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
      padding: { top: 4 },
    }).setOrigin(0.5);

    // SKOR 잔액 — 캐시 값 즉시 표시
    const cached = getCachedSkorBalance();
    const initialSkorLabel = cached !== null ? `💰 ${cached} SKOR` : '💰 -- SKOR';
    this.skorText = this.add.text(x, y + 8, initialSkorLabel, {
      fontSize: '16px',
      color: '#c0a0ff',
      padding: { top: 3 },
    }).setOrigin(0.5);

    // 비용 안내
    this.add.text(x, y + 28, '1회 100 · 10회 900', {
      fontSize: '12px',
      color: '#888888',
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => {
      button.setFillStyle(0x2d1a5e);
      button.setStrokeStyle(3, 0xaa66ff);
    });
    button.on('pointerout', () => {
      button.setFillStyle(0x1a1a2e);
      button.setStrokeStyle(3, 0x7b2fff);
    });
    button.on('pointerdown', () => {
      this.scene.start('GachaScene');
    });
  }

  private createCharacterButton(x: number, y: number) {
    const button = this.add.rectangle(x, y, 140, 70, 0x2a2a2a, 1);
    button.setStrokeStyle(2, 0x888888);

    this.add.text(x, y, '🧬 캐릭터', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
      padding: { top: 4 },
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setFillStyle(0x444444));
    button.on('pointerout',  () => button.setFillStyle(0x2a2a2a));
    button.on('pointerdown', () => {
      this.scene.start('CharacterSelectScene');
    });
  }

  private createLeaderboardButton(x: number, y: number) {
    const button = this.add.rectangle(x, y, 140, 70, 0x4a90e2, 1);
    button.setStrokeStyle(2, 0x2e5c8a);

    this.add.text(x, y, '🏆 랭킹', {
      fontSize: '18px',
      color: '#fff',
      fontStyle: 'bold',
      padding: { top: 4 },
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setFillStyle(0x5ba3f5));
    button.on('pointerout',  () => button.setFillStyle(0x4a90e2));
    button.on('pointerdown', () => {
      this.scene.start('LeaderboardScene');
    });
  }

  private createMemoryVaultButton(x: number, y: number) {
    const fragmentCount = getFragmentCount();
    const button = this.add.rectangle(x, y, 300, 46, 0x001a22, 1);
    button.setStrokeStyle(2, 0x00ffcc);

    this.add.text(x, y, `📡 MEMORY VAULT  (파편 ${fragmentCount}개)`, {
      fontSize: '15px',
      color: '#00ffcc',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
      padding: { top: 3 },
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });
    button.on('pointerover', () => {
      button.setFillStyle(0x003322);
      button.setStrokeStyle(2, 0x44ffdd);
    });
    button.on('pointerout', () => {
      button.setFillStyle(0x001a22);
      button.setStrokeStyle(2, 0x00ffcc);
    });
    button.on('pointerdown', () => {
      this.scene.start('MemoryVaultScene');
    });
  }

  private createReleaseNotesLink(x: number, y: number) {
    const text = this.add.text(x, y, '📋 릴리즈 노트', {
      fontSize: '15px',
      color: '#cccccc',
      stroke: '#000',
      strokeThickness: 3,
      padding: { top: 3 },
    }).setOrigin(0.5);

    text.setInteractive({ useHandCursor: true });
    text.on('pointerover', () => text.setColor('#FFD700'));
    text.on('pointerout',  () => text.setColor('#cccccc'));
    text.on('pointerdown', () => this.scene.start('ReleaseNotesScene'));
  }

  private createSettingsButton(x: number, y: number) {
    const btn = this.add.text(x, y, '⚙️', {
      fontSize: '34px',
      padding: { top: 6 },
    }).setOrigin(0.5).setDepth(11).setInteractive({ useHandCursor: true });

    // 이모지 바운딩 박스 중심에 원 정렬
    const bg = this.add.circle(btn.x, btn.y - btn.height * 0.08, 22, 0x000000, 0.45).setDepth(10);

    btn.on('pointerover', () => { btn.setScale(1.15); bg.setAlpha(0.65); });
    btn.on('pointerout',  () => { btn.setScale(1);    bg.setAlpha(0.45); });
    btn.on('pointerdown', () => this.showSettingsPanel());
  }

  private showSettingsPanel() {
    if (this.settingsPanel) return;

    const W = 280, H = 140;
    const cx = this.scale.width / 2, cy = this.scale.height / 2;

    // 반투명 배경 (터치 차단)
    const overlay = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.5)
      .setDepth(50).setInteractive();

    // 패널 카드
    const card = this.add.rectangle(0, 0, W, H, 0x1e1e2e, 1);
    card.setStrokeStyle(2, 0x888888);

    // 제목
    const title = this.add.text(0, -H / 2 + 22, '설정', {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    // 구분선
    const line = this.add.rectangle(0, -H / 2 + 38, W - 20, 1, 0x555555);

    // BGM 행 레이블
    const label = this.add.text(-W / 2 + 20, 10, '🔊 BGM', {
      fontSize: '16px', color: '#cccccc',
    }).setOrigin(0, 0.5);

    // 토글 버튼 — 런타임 상태를 단일 진실 원천으로 사용
    const muted = this.sound.mute;
    const toggleBg = this.add.rectangle(W / 2 - 36, 10, 54, 28, muted ? 0x555555 : 0x4caf50);
    toggleBg.setStrokeStyle(1, 0x888888);
    const toggleKnob = this.add.circle(muted ? W / 2 - 50 : W / 2 - 22, 10, 11, 0xffffff);
    const toggleLabel = this.add.text(W / 2 - 36, 10, muted ? 'OFF' : 'ON', {
      fontSize: '11px', color: muted ? '#aaaaaa' : '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const applyToggleVisual = (isMuted: boolean) => {
      toggleBg.setFillStyle(isMuted ? 0x555555 : 0x4caf50);
      toggleKnob.setX(isMuted ? W / 2 - 50 : W / 2 - 22);
      toggleLabel.setText(isMuted ? 'OFF' : 'ON');
      toggleLabel.setColor(isMuted ? '#aaaaaa' : '#ffffff');
    };

    const closePanel = () => {
      overlay.destroy();
      this.settingsPanel?.destroy();
      this.settingsPanel = null;
    };

    toggleBg.setInteractive({ useHandCursor: true });
    toggleBg.on('pointerdown', () => {
      const nowMuted = !this.sound.mute;
      this.sound.mute = nowMuted;
      setBgmMuted(nowMuted);
      applyToggleVisual(nowMuted);
    });

    // ✕ 닫기 버튼
    const closeBtn = this.add.text(W / 2 - 14, -H / 2 + 14, '✕', {
      fontSize: '16px', color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#888888'));
    closeBtn.on('pointerdown', closePanel);

    overlay.on('pointerdown', closePanel);

    this.settingsPanel = this.add.container(cx, cy, [
      card, title, line, label, toggleBg, toggleKnob, toggleLabel, closeBtn,
    ]).setDepth(51);
  }

  private startGame(mode: GameMode) {
    if (mode === GameMode.CLASSIC) {
      this.scene.start('DifficultySelectScene', { gameMode: mode });
    } else {
      this.scene.start('GameScene', { gameMode: mode, difficulty: 'HARD' });
    }
  }
}
