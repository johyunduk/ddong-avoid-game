import Phaser from 'phaser';
import { GameMode, GAME_MODES, type GameModeConfig } from '../types/GameMode';
import { getSkorBalance, getCachedSkorBalance, cacheSkorBalance } from '../utils/skor';
import { setBgmMuted, isFxBloomEnabled } from '../utils/settings';
import { setBloomEnabled } from '../utils/vfx';
import { getUserInitials, setUserInitials } from '../utils/leaderboard';
import { RELEASE_NOTES } from '../data/releaseNotes';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { getCharacterDef, getSafeSelectedCharacter } from '../utils/character';
import { bakeButton, bakeRadialGlow, bakeShine, gradientText, wireButton, type ButtonSkin } from '../utils/buttonSkin';

export default class ModeSelectScene extends BaseScene {
  private skorText!: Phaser.GameObjects.Text;
  private settingsPanel: Phaser.GameObjects.Container | null = null;
  /** 메뉴 버튼들 — 설정 팝업이 떠 있는 동안 입력을 꺼 둔다 */
  private menuButtons: Phaser.GameObjects.Container[] = [];

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
    // 설정 팝업 아이콘
    for (const n of ['sound', 'sound_off', 'fx', 'nametag', 'info']) {
      if (!this.textures.exists(`set_icon_${n}`)) this.load.image(`set_icon_${n}`, `assets/ui/settings/icon_${n}.webp`);
    }
    // 면 그림이 아직 없는 캐릭터의 대신 그림 — 게임 스프라이트
    if (!this.textures.exists(sel.imageKey)) this.load.image(sel.imageKey, sel.imagePath);
    // 면 그림 파일이 없는 캐릭터(새로 들어온 캐릭터)는 로드 실패로 넘어가고 스프라이트로 대신한다
  }

  create() {
    super.create();
    this.settingsPanel = null;   // 클래스 프로퍼티는 씬 재시작 후에도 남는다
    this.menuButtons = [];

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
    this.menuButtons.push(box);
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
    this.menuButtons.push(box);
  }

  // ── 설정 팝업 (A안) ─────────────────────────────────────────────────────
  // 나무 제목판 + 보라 판. 줄은 셋(소리 · 화면 효과 · 랭킹 이니셜)이고 줄 전체가 눌린다. 맨 아래 버전 정보 한 줄.
  // 시안: ddong-fx-work/settings/A_*.png · 아이콘은 assets/ui/settings/ (256 원본을 2배 크기로 줄인 것)

  private showSettingsPanel() {
    if (this.settingsPanel) return;

    const SW = this.scale.width, SH = this.scale.height;
    const cx = SW / 2;
    const pw = Math.min(400, SW - 24);
    const rowH = 70, rowGap = 8;
    const ph = 44 + 3 * (rowH + rowGap) + 56;
    const top = Math.round((SH - ph) / 2 + 10);      // 판 위 가장자리 (제목판이 반쯤 걸친다)
    const panelRect = new Phaser.Geom.Rectangle(cx - pw / 2, top - 26, pw, ph + 26);

    // 덮개 — 판 밖을 누르면 닫힌다. 판 안 빈자리는 덮개로 새지 않게 여기서 거른다
    const overlay = this.add.rectangle(cx, SH / 2, SW, SH, 0x000000, 0.55).setDepth(50).setInteractive();
    const panel = this.add.container(0, 0).setDepth(51);
    this.settingsPanel = panel;
    // 뒤 메뉴 버튼은 팝업이 떠 있는 동안 꺼 둔다 — 판 위를 누른 손가락이 뒤로 새지 않게
    this.menuButtons.forEach(b => b.disableInteractive());

    let initialsInput: HTMLInputElement | null = null;
    const closePanel = () => {
      initialsInput?.remove();
      initialsInput = null;
      overlay.destroy();
      panel.destroy();
      this.settingsPanel = null;
      this.menuButtons.forEach(b => { if (b.active) b.setInteractive().setScale(1); });
      this.events.off('shutdown', closePanel);
    };
    this.events.once('shutdown', closePanel);
    overlay.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!panelRect.contains(p.x, p.y)) closePanel();
    });

    // 보라 판
    const { originY } = bakeButton(this, `set_panel_${pw}x${ph}`, {
      w: pw, h: ph, radius: 22, top: '#2a1460', bottom: '#120626', border: '#d38bff', borderW: 3,
      lip: '#3a1478', lipH: 6, gloss: 0, glow: 'rgba(190,110,255,0.67)',
    });
    panel.add(this.add.image(cx, top + ph / 2, `set_panel_${pw}x${ph}`).setOrigin(0.5, originY));

    // 나무 제목판
    const plank = bakeButton(this, 'set_title_plank', {
      w: 200, h: 52, radius: 16, top: '#c98a4a', bottom: '#8a5226', border: '#3a1f0a', borderW: 3,
      lip: '#5b3416', lipH: 5, gloss: 0,
    });
    panel.add(this.add.image(cx, top, 'set_title_plank').setOrigin(0.5, plank.originY));
    const title = this.add.text(cx, top - 1, '설정', {
      fontSize: '24px', fontStyle: 'bold', stroke: '#3a1f0a', strokeThickness: 4,
    }).setOrigin(0.5);
    gradientText(title, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    panel.add(title);

    // 닫기 — 44x44 둥근 버튼, 판 오른쪽 위 모서리에 걸친다
    const close = this.add.container(cx + pw / 2 - 16, top + 6);
    const closeSkin = bakeButton(this, 'set_close', {
      w: 44, h: 44, radius: 22, top: '#f4f7fb', bottom: '#b8c2cf', border: '#2a3340', borderW: 2.5,
      lip: '#7a8594', lipH: 3, gloss: 0,
    });
    close.add(this.add.image(0, 0, 'set_close').setOrigin(0.5, closeSkin.originY));
    close.add(this.add.graphics().lineStyle(3, 0x2a3340).lineBetween(-7, -7, 7, 7).lineBetween(-7, 7, 7, -7));
    wireButton(this, close, 44, 44, closePanel);
    panel.add(close);

    const x0 = cx - pw / 2 + 16, x1 = cx + pw / 2 - 16, rw = x1 - x0;

    /** 줄 하나 — 반투명 바탕 · 아이콘 · 제목 · 설명. 줄 전체가 버튼이다. 오른쪽 조작부는 호출하는 쪽이 붙인다 */
    const makeRow = (i: number, icon: string, label: string, sub: string, onTap: () => void) => {
      const y = top + 44 + i * (rowH + rowGap) + rowH / 2;
      const row = this.add.container(cx, y);
      row.add(this.add.graphics().fillStyle(0xffffff, 0.08).fillRoundedRect(-rw / 2, -rowH / 2, rw, rowH, 14));
      const iconImg = this.add.image(-rw / 2 + 30, 0, icon).setDisplaySize(40, 40);
      row.add(iconImg);
      const t = this.add.text(-rw / 2 + 58, -10, label, { fontSize: '17px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
      const s = this.add.text(-rw / 2 + 58, 12, sub, { fontSize: '11px', color: '#b9a3d6' }).setOrigin(0, 0.5);
      row.add([t, s]);
      wireButton(this, row, rw, rowH, onTap, true);
      panel.add(row);
      return { row, iconImg, title: t, sub: s };
    };

    /** 토글 — buttonSkin 판 (ON 초록 · OFF 회색) + 흰 손잡이. 줄 안 오른쪽에 둔다 */
    const makeToggle = (row: Phaser.GameObjects.Container, on: boolean) => {
      const tw = 64, th = 36;
      const keyOf = (v: boolean) => (v ? 'set_toggle_on' : 'set_toggle_off');
      let oy = 0.5;
      for (const v of [true, false]) {
        oy = bakeButton(this, keyOf(v), {
          w: tw, h: th, radius: th / 2, top: v ? '#8dff7a' : '#5a5d68', bottom: v ? '#16a83a' : '#2a2d36',
          border: v ? '#0a3a14' : '#15161c', borderW: 2, lip: v ? '#0d6a24' : '#0d0e12', lipH: 3, gloss: 0,
        }).originY;
      }
      const tx = rw / 2 - 44;
      const bg = this.add.image(tx, 0, keyOf(on)).setOrigin(0.5, oy);
      const knob = this.add.circle(0, 0, th / 2 - 4, 0xffffff).setStrokeStyle(1.5, 0x2a2d36);
      const txt = this.add.text(0, 0, '', { fontSize: '11px', fontStyle: 'bold' }).setOrigin(0.5);
      row.add([bg, knob, txt]);
      const set = (v: boolean) => {
        bg.setTexture(keyOf(v));
        knob.setX(tx + (v ? 1 : -1) * (tw / 2 - th / 2));
        txt.setX(tx + (v ? -10 : 10)).setText(v ? 'ON' : 'OFF').setColor(v ? '#0a3a14' : '#d0d3dc');
      };
      set(on);
      return set;
    };

    // 소리 — 런타임 상태(this.sound.mute)가 단일 진실. 저장은 setBgmMuted
    const soundIcon = (muted: boolean) => (muted ? 'set_icon_sound_off' : 'set_icon_sound');
    const sound = makeRow(0, soundIcon(this.sound.mute), '소리', '배경음악 (끄면 모든 소리 꺼짐)', () => {
      const muted = !this.sound.mute;
      this.sound.mute = muted;
      setBgmMuted(muted);
      setSound(!muted);
      sound.iconImg.setTexture(soundIcon(muted)).setDisplaySize(40, 40);
    });
    const setSound = makeToggle(sound.row, !this.sound.mute);

    // 화면 효과 — 빛 번짐(블룸). setBloomEnabled 가 저장하고 떠 있는 씬에도 바로 반영한다
    const fx = makeRow(1, 'set_icon_fx', '화면 효과', '빛 번짐 — 느린 기기면 꺼 두세요', () => {
      const on = !isFxBloomEnabled();
      setBloomEnabled(on);
      setFx(on);
    });
    const setFx = makeToggle(fx.row, isFxBloomEnabled());

    // 랭킹 이니셜 — 게임오버 입력과 같은 규칙 (영어 대문자 3자, setUserInitials 가 검증)
    let editing = false;
    const ini = makeRow(2, 'set_icon_nametag', '랭킹 이니셜', '랭킹에 표시되는 3글자', () => {
      if (editing) commitInitials(); else startInitials();
    });
    const subDefault = ini.sub.text;
    const bw = 60, bx = rw / 2 - 6 - bw / 2;
    const btnSkin = bakeButton(this, 'set_ini_btn', {
      w: bw, h: 44, radius: 14, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 2,
      lip: '#a8650a', lipH: 4, gloss: 0,
    });
    const btnLabel = this.add.text(bx, 0, '변경', { fontSize: '15px', color: '#5b2e0e', fontStyle: 'bold' }).setOrigin(0.5);
    ini.row.add([this.add.image(bx, 0, 'set_ini_btn').setOrigin(0.5, btnSkin.originY), btnLabel]);
    // 글자 칸 — 제목·설명 오른쪽에 붙는다. 폭이 좁으면 칸을 줄인다
    const textRight = -rw / 2 + 58 + Math.max(ini.title.width, ini.sub.width) + 8;
    const tilesRight = bx - bw / 2 - 8;
    const tile = Math.max(20, Math.min(28, Math.floor((tilesRight - textRight - 8) / 3)));
    const tilesW = tile * 3 + 8;
    const tilesX = tilesRight - tilesW;
    const tileTexts: Phaser.GameObjects.Text[] = [];
    for (let k = 0; k < 3; k++) {
      const tx = tilesX + k * (tile + 4) + tile / 2;
      ini.row.add(this.add.rectangle(tx, 0, tile, tile, 0x000000, 0.86).setStrokeStyle(2, 0xffd700));
      const ch = this.add.text(tx, 0, '', { fontSize: `${Math.round(tile * 0.6)}px`, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      tileTexts.push(ch);
      ini.row.add(ch);
    }
    const showInitials = () => {
      const s = getUserInitials() ?? '';
      tileTexts.forEach((t, k) => t.setText(s[k] ?? '-').setColor(s[k] ? '#ffffff' : '#6a6f80'));
    };
    showInitials();
    const setSub = (msg: string, err: boolean) => ini.sub.setText(msg).setColor(err ? '#ff6b6b' : '#b9a3d6');

    // 입력은 게임오버처럼 HTML input — 글자 칸 위에 겹쳐 띄운다 (캔버스 위치·스케일에 맞춘다)
    const startInitials = () => {
      editing = true;
      btnLabel.setText('저장');
      const rect = this.game.canvas.getBoundingClientRect();
      const kx = rect.width / SW, ky = rect.height / SH;
      const m = ini.row.getWorldTransformMatrix();
      const left = rect.left + (m.tx + tilesX - 2) * kx;
      const h = Math.max(44, tile + 8);
      const topPx = rect.top + (m.ty - h / 2) * ky;
      const el = document.createElement('input');
      el.type = 'text';
      el.maxLength = 3;
      el.placeholder = 'ABC';
      el.value = getUserInitials() ?? '';
      el.autocapitalize = 'characters';
      el.style.cssText = `
        position: fixed; left: ${left}px; top: ${topPx}px;
        width: ${Math.round((tilesW + 4) * kx)}px; height: ${Math.round(h * ky)}px;
        font-size: ${Math.round(tile * 0.7 * ky)}px; text-align: center; text-transform: uppercase;
        border: ${Math.max(2, Math.round(2 * ky))}px solid #FFD700; border-radius: 6px;
        background: #000; color: #fff; font-weight: bold; letter-spacing: ${Math.round(4 * kx)}px;
        outline: none; box-sizing: border-box; padding: 0; z-index: 9999;
      `;
      el.addEventListener('input', () => { el.value = el.value.toUpperCase().replace(/[^A-Z]/g, ''); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitInitials(); });
      document.body.appendChild(el);
      el.focus();
      initialsInput = el;
      setSub('영어 대문자 3자', false);
    };
    const commitInitials = () => {
      if (!initialsInput) return;
      const v = initialsInput.value.trim().toUpperCase();
      if (v.length !== 3) { setSub('정확히 3글자를 입력하세요', true); initialsInput.focus(); return; }
      if (!setUserInitials(v)) { setSub('영어 대문자만 입력하세요', true); initialsInput.focus(); return; }
      initialsInput.remove();
      initialsInput = null;
      editing = false;
      btnLabel.setText('변경');
      setSub(subDefault, false);
      showInitials();
    };

    // 버전 정보 — 릴리스 노트 최신 버전
    const vy = top + 44 + 3 * (rowH + rowGap) + 20;
    panel.add(this.add.image(x0 + 26, vy, 'set_icon_info').setDisplaySize(28, 28));
    panel.add(this.add.text(x0 + 50, vy, '버전 정보', { fontSize: '14px', color: '#e6e8ee', fontStyle: 'bold' }).setOrigin(0, 0.5));
    panel.add(this.add.text(x1 - 20, vy, RELEASE_NOTES[0]?.version ?? '', { fontSize: '13px', color: '#c9cdd8', fontStyle: 'bold' }).setOrigin(1, 0.5));
  }

  private startGame(mode: GameMode) {
    if (mode === GameMode.CLASSIC) {
      this.scene.start('DifficultySelectScene', { gameMode: mode });
    } else {
      this.scene.start('GameScene', { gameMode: mode, difficulty: 'HARD' });
    }
  }
}
