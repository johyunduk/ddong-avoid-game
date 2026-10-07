import Phaser from 'phaser';
import { GameMode, GAME_MODES, type GameModeConfig } from '../types/GameMode';
import { getSkorBalance, getCachedSkorBalance, cacheSkorBalance } from '../utils/skor';
import { setBgmMuted } from '../utils/settings';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { getCharacterDef, getSafeSelectedCharacter } from '../utils/character';
import { bakeButton, bakeRadialGlow, bakeShine, gradientText, setTouchInteractive, wireButton, type ButtonSkin } from '../utils/buttonSkin';

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
    // 메뉴 버튼 면 그림 (B안) — 작은 webp 들. 캐릭터 면은 지금 고른 캐릭터 것 하나만
    const ui: [string, string][] = [
      ['menu_classic_face', 'classic_face'], ['menu_gacha_face', 'gacha_face'],
      ['menu_icon_rank', 'icon_rank'], ['menu_icon_notes', 'icon_notes'], ['menu_icon_settings', 'icon_settings'],
    ];
    const sel = getCharacterDef(getSafeSelectedCharacter());
    ui.push([`menu_charface_${sel.id}`, `charface/${sel.id}`]);
    for (const [k, f] of ui) {
      if (!this.textures.exists(k)) this.load.image(k, `assets/ui/menu/${f}.webp`);
    }
    // 면 그림이 아직 없는 캐릭터의 대신 그림 — 게임 스프라이트
    if (!this.textures.exists(sel.imageKey)) this.load.image(sel.imageKey, sel.imagePath);
    // 면 그림 파일이 없는 캐릭터(새로 들어온 캐릭터)는 로드 실패로 넘어가고 스프라이트로 대신한다
  }

  create() {
    super.create();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const yOff = (H - 600) / 2;

    addBackground(this, 'background2', W, H);

    const title = this.add.image(cx, 90 + yOff, 'title');
    title.setScale(0.4);

    this.add.text(cx, 190 + yOff, '모드를 선택하세요', {
      fontSize: '20px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // 버튼 폭 — 화면 폭에 맞추되 너무 넓어지지 않게. 아래 두 버튼은 반씩 (사이 12)
    const bw = Math.min(330, W - 40);
    const half = (bw - 12) / 2;

    // 클래식 모드 (대전 모드는 2026-10 제거)
    this.createModeButton(GAME_MODES[0], cx, 255 + yOff, bw);

    // 캐릭터 뽑기 (SKOR 잔액 포함)
    this.createGachaButton(cx, 367 + yOff, bw);

    // 하단 행: 캐릭터 선택 + 랭킹
    this.createCharacterButton(cx - (half + 12) / 2, 478 + yOff, half);
    this.createLeaderboardButton(cx + (half + 12) / 2, 478 + yOff, half);

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

  // ── 메뉴 버튼 (B안 — 일러스트를 버튼 면에) ──────────────────────────────
  // 판은 utils/buttonSkin 이 캔버스로 한 번 굽고, 버튼 면 그림은 assets/ui/menu/ (2배로 구워 절반 크기로 띄운다).
  // 면 그림은 ddong-fx-work/menu-buttons/bake_ingame.py 가 일러스트에서 만든다 — 일러스트 원본은 메뉴에 올리지 않는다

  /** 버튼 공통 — 구운 판을 컨테이너에 깔고 반응을 붙인다. 몸통 가운데가 (x, y) */
  private makeButtonBox(x: number, y: number, key: string, skin: ButtonSkin, onClick: () => void) {
    const { originY } = bakeButton(this, key, skin);
    const box = this.add.container(x, y);
    box.add(this.add.image(0, 0, key).setOrigin(0.5, originY));
    wireButton(this, box, skin.w, skin.h, onClick);
    return box;
  }

  /** 버튼 면 그림 — 몸통 안쪽(테두리 3px 안)에 맞춰 깐다 */
  private addFace(box: Phaser.GameObjects.Container, key: string, w: number, h: number) {
    if (this.textures.exists(key)) box.add(this.add.image(0, 0, key).setDisplaySize(w - 6, h - 6));
  }

  /** 클래식 — 크림 테 판, 면은 도시 위로 떨어지는 똥 배너 */
  private createModeButton(modeConfig: GameModeConfig, x: number, y: number, w: number) {
    const h = 78;
    const box = this.makeButtonBox(x, y, `btn_classic_${w}`, {
      w, h, radius: 20, top: '#fff8dc', bottom: '#ffd45e', border: '#5b3a1a', borderW: 3,
      lip: '#c98a22', lipH: 6, gloss: 0,
    }, () => this.startGame(modeConfig.mode));
    this.addFace(box, 'menu_classic_face', w, h);
    box.add(this.add.text(0, -9, modeConfig.name, {
      fontSize: '25px', color: '#5b2e0e', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 6,
    }).setOrigin(0.5));
    box.add(this.add.text(0, 21, '떨어지는 똥을 피하세요!', {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold', stroke: '#2a4a80', strokeThickness: 3,
    }).setOrigin(0.5));
  }

  /** 뽑기 — 금테 보라 판, 오른쪽 면에 치비·매화·루트·광부 일러스트, 금빛 제목, 지나가는 빛 */
  private createGachaButton(x: number, y: number, w: number) {
    const h = 112;
    const box = this.makeButtonBox(x, y, `btn_gacha_${w}`, {
      w, h, radius: 20, top: '#3a1478', bottom: '#120626', border: '#ffd34d', borderW: 3,
      lip: '#5a1e9c', lipH: 6, gloss: 0, glow: 'rgba(255,200,90,0.85)',
    }, () => this.scene.start('GachaScene'));
    this.addFace(box, 'menu_gacha_face', w, h);

    const left = -w / 2 + 22;
    const title = this.add.text(left, -24, '캐릭터 뽑기', {
      fontSize: '25px', fontStyle: 'bold', stroke: '#2a0a4a', strokeThickness: 5,
    }).setOrigin(0, 0.5);
    gradientText(title, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    box.add(title);

    const cached = getCachedSkorBalance();
    const pillW = 128;
    box.add(this.add.rectangle(left + pillW / 2, 10, pillW, 24, 0x000000, 0.55).setStrokeStyle(1, 0xffd34d, 0.8));
    this.skorText = this.add.text(left + 10, 10, cached !== null ? `💰 ${cached} SKOR` : '💰 -- SKOR', {
      fontSize: '14px', color: '#fff0c2', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    box.add(this.skorText);
    box.add(this.add.text(left, 36, '1회 100 · 10회 900', { fontSize: '12px', color: '#d9c6f0' }).setOrigin(0, 0.5));

    // 지나가는 빛 — 버튼 안에서만 보이게 마스크 (마스크는 이것 하나뿐)
    const shineKey = bakeShine(this, 'menu_shine', 70, h + 20);
    const shine = this.add.image(-w / 2 - 60, 0, shineKey).setAngle(18).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
    box.add(shine);
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff).fillRoundedRect(x - w / 2, y - h / 2, w, h, 20);
    shine.setMask(maskG.createGeometryMask());
    this.tweens.add({ targets: shine, x: w / 2 + 60, duration: 900, repeat: -1, repeatDelay: 2600, ease: 'Cubic.easeInOut' });
    this.events.once('shutdown', () => maskG.destroy());
  }

  /** 캐릭터 — 청록 판, 면에 지금 고른 캐릭터의 일러스트 얼굴 (없으면 게임 스프라이트) */
  private createCharacterButton(x: number, y: number, w: number) {
    const h = 80;
    const box = this.makeButtonBox(x, y, `btn_char_${w}`, {
      w, h, radius: 18, top: '#3ddbb3', bottom: '#0f7f78', border: '#0a3d3a', borderW: 3,
      lip: '#0a5a55', lipH: 6, gloss: 0,
    }, () => this.scene.start('CharacterSelectScene'));

    const def = getCharacterDef(getSafeSelectedCharacter());
    const faceKey = `menu_charface_${def.id}`;
    if (this.textures.exists(faceKey)) {
      this.addFace(box, faceKey, w, h);
    } else if (this.textures.exists(def.imageKey)) {
      // 면 그림이 아직 없는 캐릭터 (새로 들어온 캐릭터) — 게임 스프라이트로 대신한다
      box.add(this.add.image(-w / 2 + 34, h / 2 - 8, def.imageKey).setOrigin(0.5, 0.95).setScale(0.2));
    }
    box.add(this.add.text(w / 2 - 12, -9, '캐릭터', {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: '#0a3d3a', strokeThickness: 5,
    }).setOrigin(1, 0.5));
    box.add(this.add.text(w / 2 - 12, 16, def.name, {
      fontSize: '12px', color: '#d6fff4', fontStyle: 'bold', stroke: '#0a3d3a', strokeThickness: 3,
    }).setOrigin(1, 0.5));
  }

  /** 랭킹 — 남색 판 금테, 큰 트로피가 판 위로 튀어나오고 후광이 숨 쉰다 */
  private createLeaderboardButton(x: number, y: number, w: number) {
    const h = 80;
    const box = this.makeButtonBox(x, y, `btn_rank_${w}`, {
      w, h, radius: 18, top: '#4f8dff', bottom: '#1b3a9e', border: '#ffd34d', borderW: 3,
      lip: '#122a73', lipH: 6, gloss: 0.7,
    }, () => this.scene.start('LeaderboardScene'));

    const ix = -w / 2 + 38;
    const halo = this.add.image(ix, -10, bakeRadialGlow(this, 'menu_glow', 128)).setDisplaySize(80, 80)
      .setTint(0xffd34d).setAlpha(0.65).setBlendMode(Phaser.BlendModes.ADD);
    box.add(halo);
    this.tweens.add({ targets: halo, alpha: 0.3, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (this.textures.exists('menu_icon_rank')) box.add(this.add.image(ix, -14, 'menu_icon_rank').setDisplaySize(76, 76));

    box.add(this.add.text(w / 2 - 12, -9, '랭킹', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold', stroke: '#0e1f5c', strokeThickness: 5,
    }).setOrigin(1, 0.5));
    box.add(this.add.text(w / 2 - 12, 16, 'TOP 랭커 보기', {
      fontSize: '12px', color: '#d5e3ff', fontStyle: 'bold',
    }).setOrigin(1, 0.5));
  }

  /** 릴리즈 노트 — 양피지색 알약 버튼 + 두루마리 */
  private createReleaseNotesLink(x: number, y: number) {
    const w = 150, h = 34;
    const box = this.makeButtonBox(x, y, 'btn_notes', {
      w, h, radius: 17, top: '#fff1cf', bottom: '#e6c98e', border: '#6b4a22', borderW: 2,
      lip: '#a7814a', lipH: 4, gloss: 0.6,
    }, () => this.scene.start('ReleaseNotesScene'));
    if (this.textures.exists('menu_icon_notes')) box.add(this.add.image(-w / 2 + 13, -3, 'menu_icon_notes').setDisplaySize(40, 40));
    box.add(this.add.text(14, 0, '릴리즈 노트', { fontSize: '15px', color: '#5b3a1a', fontStyle: 'bold' }).setOrigin(0.5));
  }

  /** 설정 — 톱니만 크게 (그림자). 아이콘이 없으면 이모지 */
  private createSettingsButton(x: number, y: number) {
    const size = 44;
    const box = this.add.container(x, y).setDepth(11);
    if (this.textures.exists('menu_icon_settings')) {
      box.add(this.add.image(2, 3, 'menu_icon_settings').setDisplaySize(size, size).setTint(0x000000).setAlpha(0.4));
      box.add(this.add.image(0, 0, 'menu_icon_settings').setDisplaySize(size, size));
    } else {
      box.add(this.add.text(0, 0, '⚙️', { fontSize: '34px' }).setOrigin(0.5));
    }
    wireButton(this, box, size, size, () => this.showSettingsPanel(), true);
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

    setTouchInteractive(toggleBg);
    toggleBg.on('pointerdown', () => {
      const nowMuted = !this.sound.mute;
      this.sound.mute = nowMuted;
      setBgmMuted(nowMuted);
      applyToggleVisual(nowMuted);
    });

    // ✕ 닫기 버튼
    const closeBtn = this.add.text(W / 2 - 14, -H / 2 + 14, '✕', {
      fontSize: '16px', color: '#888888',
    }).setOrigin(0.5);
    setTouchInteractive(closeBtn);

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
