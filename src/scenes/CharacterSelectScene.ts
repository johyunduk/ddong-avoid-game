import Phaser from 'phaser';
import {
  CHARACTERS,
  getOwnedCharacters,
  getSelectedCharacter,
  setSelectedCharacter,
  getDuplicateCount,
  getAwakeningLevel,
  getGradeImgKey,
  type CharacterDef,
} from '../utils/character';
import {
  WALLPAPERS,
  GACHA_WP_IDS,
  DEFAULT_WP_IDS,
  getOwnedWallpapers,
  getSelectedWallpaper,
  setSelectedWallpaper,
  WP_ACCENT_INT,
  WP_ACCENT_HEX,
  type BackgroundDef,
} from '../utils/wallpaper';
import { syncOwnedCharacters, syncOwnedWallpapers } from '../utils/gacha';
import BaseScene from './BaseScene';

// ── 캐릭터 그리드 설정 ──────────────────────────────────────────────────────
const COLS = 3;
const CARD_W = 100;
const CARD_H = 120;
const GAP_X = 15;
const GAP_Y = 10;
const GRID_LEFT = (400 - (COLS * CARD_W + (COLS - 1) * GAP_X)) / 2; // 35px
const GRID_TOP = 105;

// ── 배경화면 그리드 설정 (세로 카드 3열) ────────────────────────────────────
const WP_COLS = 3;
const WP_CARD_W = 110;
const WP_CARD_H = 165;  // bgKey 비율(400×600) 반영 세로 카드
const WP_GAP_X = 15;
const WP_GAP_Y = 15;
const WP_GRID_LEFT = (400 - (WP_COLS * WP_CARD_W + (WP_COLS - 1) * WP_GAP_X)) / 2; // 20px
const WP_GRID_TOP = 105;

// 표시할 전체 배경화면 = 기본 제공 + 가챠 (wallpaper.ts WALLPAPERS 기준 자동 파생)
const AVAILABLE_WP_SET = new Set([...DEFAULT_WP_IDS, ...GACHA_WP_IDS]);

// ── 스크롤 영역 (헤더 아래 ~ 하단 버튼 위) ─────────────────────────────────
const SCROLL_TOP = 95;
const SCROLL_BOTTOM = 548;

// 각성 코어 비주얼 상수
const CORE_COUNT        = 5;
const CORE_GAP          = 10;    // 코어 간 X 간격 (px)
const CORE_Y_OFFSET     = 28;    // 카드 하단에서 코어까지의 거리 (px)
const CORE_GLOW_RADIUS  = 5.5;   // 충전된 코어 외곽 글로우 반지름
const CORE_INNER_RADIUS = 3.5;   // 코어 내부 원 반지름
const CORE_HIGHLIGHT_R  = 1.2;   // 하이라이트 스팟 반지름

export default class CharacterSelectScene extends BaseScene {
  private returnScene: string = 'ModeSelectScene';
  private selectedId: string = 'chibi';
  private ownedIds: string[] = [];
  private _preSyncDupCounts: Map<string, number> = new Map();
  private cardHighlights: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  // 탭 시스템
  private activeTab: 'character' | 'wallpaper' = 'character';
  private ownedWpIds: string[] = [];
  private selectedWpId: string | null = null;
  private charTabBtnBg!: Phaser.GameObjects.Rectangle;
  private wpTabBtnBg!: Phaser.GameObjects.Rectangle;
  private charTabLabel!: Phaser.GameObjects.Text;
  private wpTabLabel!: Phaser.GameObjects.Text;

  // 배경화면 선택 하이라이트
  private wpHighlights: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  // 스크롤
  private cardsContainer!: Phaser.GameObjects.Container;
  private scrollOffset = 0;
  private maxScrollOffset = 0;
  private pointerDownY = 0;
  private pointerDownScrollY = 0;
  private hasDragged = false;
  private hasPointerDownInScene = false; // 이 씬에서 pointerdown이 발생했는지 추적 (bleed-through 방지)

  // 동적 갱신용 ref
  private headerNameText!: Phaser.GameObjects.Text;
  private bgImage!: Phaser.GameObjects.Image;

  // 카드 그리드 공유 리소스
  private coresGfx!: Phaser.GameObjects.Graphics;
  private maskGfx!: Phaser.GameObjects.Graphics;

  // 상세 정보 패널
  private detailPanel: Phaser.GameObjects.Container | null = null;
  private infoPanel: Phaser.GameObjects.Container | null = null;
  private detailVideo: Phaser.GameObjects.Video | null = null;
  private fitVideoTimers: Phaser.Time.TimerEvent[] = [];

  constructor() {
    super('CharacterSelectScene');
  }

  init(data: { returnScene?: string }) {
    this.returnScene = data.returnScene ?? 'ModeSelectScene';
  }

  preload() {
    for (const char of CHARACTERS) {
      if (!this.textures.exists(char.imageKey)) {
        this.load.image(char.imageKey, char.imagePath);
      }
      if (!this.textures.exists(char.illustKey)) {
        this.load.image(char.illustKey, char.illustPath);
      }
      if (char.videoKey && char.videoPath && !this.cache.video.exists(char.videoKey)) {
        this.load.video(char.videoKey, char.videoPath);
      }
    }
    // 배경화면 bgKey(세로 이미지) 사전 로드 — 표시 대상 3종만
    for (const wp of WALLPAPERS.filter(w => AVAILABLE_WP_SET.has(w.id))) {
      if (!this.textures.exists(wp.bgKey)) {
        this.load.image(wp.bgKey, wp.bgPath);
      }
    }
    // 등급 이미지
    if (!this.textures.exists('grade_r'))  this.load.image('grade_r',  'assets/character_ranks/r.png');
    if (!this.textures.exists('grade_sr')) this.load.image('grade_sr', 'assets/character_ranks/sr.png');
    if (!this.textures.exists('grade_ur')) this.load.image('grade_ur', 'assets/character_ranks/ur.png');
  }

  create() {
    super.create();

    this.selectedId = getSelectedCharacter();
    this.ownedIds = getOwnedCharacters();
    this.ownedWpIds = getOwnedWallpapers();
    this.selectedWpId = getSelectedWallpaper();
    this.activeTab = 'character';
    this.scrollOffset = 0;
    this.hasDragged = false;
    this.hasPointerDownInScene = false;
    this.cardHighlights.clear();
    this.wpHighlights.clear();

    // 동기화 전 각성 수치 스냅샷 (동기화 후 변화 감지용)
    this._preSyncDupCounts = new Map(
      CHARACTERS
        .filter(c => this.ownedIds.includes(c.id) && c.grade !== '등급외')
        .map(c => [c.id, getDuplicateCount(c.id)])
    );

    // 서버 DB와 동기화 — 소유 목록 or 각성 수치가 바뀐 경우 씬 재시작해서 카드 갱신
    syncOwnedCharacters().then(synced => {
      if (!this.scene.isActive()) return;
      const ownedChanged = synced.length !== this.ownedIds.length ||
        synced.some(id => !this.ownedIds.includes(id));
      const awakeChanged = CHARACTERS.some(c =>
        synced.includes(c.id) && c.grade !== '등급외' &&
        getDuplicateCount(c.id) !== this._preSyncDupCounts.get(c.id)
      );
      if (ownedChanged || awakeChanged) this.scene.restart();
    }).catch(() => { /* 네트워크 오류 시 로컬 상태 유지 */ });

    // 배경화면 동기화 (비동기, UI 갱신 없이 진행 — 다음 방문 시 반영)
    syncOwnedWallpapers().then(synced => {
      if (!this.scene.isActive()) return;
      const wpChanged = synced.length !== this.ownedWpIds.length ||
        synced.some(id => !this.ownedWpIds.includes(id));
      if (wpChanged) {
        this.ownedWpIds = synced;
        if (this.activeTab === 'wallpaper') this.rebuildGrid();
      }
    }).catch(() => { /* 네트워크 오류 시 로컬 상태 유지 */ });

    const selectedDef = CHARACTERS.find(c => c.id === this.selectedId) ?? CHARACTERS[0];

    // ── 배경: 선택된 캐릭터 일러스트 ───────────────────────────────────
    this.bgImage = this.add.image(200, 300, selectedDef.illustKey);
    this.bgImage.setDisplaySize(400, 600);

    // ── 헤더 (고정, depth 10 — 스크롤 카드보다 위) ──────────────────────
    this.add.text(200, 30, '수집', {
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    // ── 탭 버튼 ────────────────────────────────────────────────────────
    const TAB_Y = 60;
    const TAB_W = 160;
    const TAB_H = 30;

    this.charTabBtnBg = this.add.rectangle(110, TAB_Y, TAB_W, TAB_H, 0x1144bb)
      .setStrokeStyle(1.5, 0x4488ff)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    this.charTabLabel = this.add.text(110, TAB_Y, '캐릭터', {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    this.wpTabBtnBg = this.add.rectangle(290, TAB_Y, TAB_W, TAB_H, 0x222222)
      .setStrokeStyle(1.5, 0x555555)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });
    this.wpTabLabel = this.add.text(290, TAB_Y, '배경화면', {
      fontSize: '14px', color: '#888888', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    this.charTabBtnBg.on('pointerup', () => {
      if (this.detailPanel) return;
      this.switchTab('character');
    });
    this.wpTabBtnBg.on('pointerup', () => {
      if (this.detailPanel) return;
      this.switchTab('wallpaper');
    });

    // 구분선
    this.add.rectangle(200, 80, 380, 1, 0x444444).setDepth(10);

    // 현재 선택 상태 표시
    this.headerNameText = this.add.text(200, 88, `현재: ${selectedDef.name}`, {
      fontSize: '13px',
      color: selectedDef.gradeColor,
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);

    // ── 스크롤 가능한 카드 컨테이너 ─────────────────────────────────────
    this.cardsContainer = this.add.container(0, 0);

    this.buildCharacterGrid();

    // 스크롤 최대 범위 계산 (buildCharacterGrid 내부에서도 설정되지만 여기서도 초기화)
    const totalRows = Math.ceil(CHARACTERS.length / COLS);
    const contentBottom = GRID_TOP + (totalRows - 1) * (CARD_H + GAP_Y) + CARD_H + 10;
    this.maxScrollOffset = Math.max(0, contentBottom - SCROLL_BOTTOM);

    // 카드 영역 마스크 (스크롤 영역 밖 숨김)
    // this.make: display list에 추가되지 않으므로 shutdown 시 직접 정리 필요
    this.maskGfx = this.make.graphics({ x: 0, y: 0 });
    this.maskGfx.fillStyle(0xffffff);
    this.maskGfx.fillRect(0, SCROLL_TOP, 400, SCROLL_BOTTOM - SCROLL_TOP);
    this.cardsContainer.setMask(this.maskGfx.createGeometryMask());

    // ── 드래그 스크롤 입력 ───────────────────────────────────────────────
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.hasPointerDownInScene = true;
      if (this.detailPanel) return; // 상세 패널 열려있으면 스크롤 무시
      if (p.y < SCROLL_TOP || p.y > SCROLL_BOTTOM) return;
      this.pointerDownY = p.y;
      this.pointerDownScrollY = this.scrollOffset;
      this.hasDragged = false;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.detailPanel) return; // 상세 패널 열려있으면 스크롤 무시
      if (!p.isDown) return;
      const dy = this.pointerDownY - p.y;
      if (Math.abs(dy) > 5) {
        this.hasDragged = true;
        this.scrollOffset = Phaser.Math.Clamp(
          this.pointerDownScrollY + dy,
          0,
          this.maxScrollOffset,
        );
        this.cardsContainer.setY(-this.scrollOffset);
      }
    });

    this.input.on('pointerup', () => {
      if (this.detailPanel) return; // 상세 패널 열려있으면 hasDragged 초기화 무시
      // card pointerup 이벤트가 먼저 발생하므로 다음 프레임에 초기화
      this.time.delayedCall(0, () => {
        this.hasDragged = false;
        this.hasPointerDownInScene = false;
      });
    });

    // 마우스 휠
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _go: unknown[], _dx: number, deltaY: number) => {
        if (this.detailPanel) return; // 상세 패널 열려있으면 휠 스크롤 무시
        this.scrollOffset = Phaser.Math.Clamp(
          this.scrollOffset + deltaY * 0.5,
          0,
          this.maxScrollOffset,
        );
        this.cardsContainer.setY(-this.scrollOffset);
      },
    );

    // ── 고정 UI ─────────────────────────────────────────────────────────
    this.createBackButton();

    // maskGfx는 display list 외부에 있으므로 씬 종료 시 직접 정리
    this.events.once('shutdown', () => { this.maskGfx.destroy(); });
  }

  // ── 그리드 빌더 ─────────────────────────────────────────────────────────

  private buildCharacterGrid() {
    this.cardHighlights.clear();
    this.coresGfx = this.add.graphics();
    CHARACTERS.forEach((char, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = GRID_LEFT + col * (CARD_W + GAP_X) + CARD_W / 2;
      const y = GRID_TOP + row * (CARD_H + GAP_Y) + CARD_H / 2;
      this.createCharacterCard(char, x, y);
    });
    this.cardsContainer.add(this.coresGfx);

    const totalRows = Math.ceil(CHARACTERS.length / COLS);
    const contentBottom = GRID_TOP + (totalRows - 1) * (CARD_H + GAP_Y) + CARD_H + 10;
    this.maxScrollOffset = Math.max(0, contentBottom - SCROLL_BOTTOM);
  }

  private buildWallpaperGrid() {
    this.wpHighlights.clear();
    // ownedWpIds: create() 초기화 + sync callback에서 직접 갱신
    // selectedWpId: applyWallpaper()가 항상 동기 업데이트 → 재조회 불필요

    const availableWps = WALLPAPERS.filter(w => AVAILABLE_WP_SET.has(w.id));
    availableWps.forEach((wp, index) => {
      const col = index % WP_COLS;
      const row = Math.floor(index / WP_COLS);
      const x = WP_GRID_LEFT + col * (WP_CARD_W + WP_GAP_X) + WP_CARD_W / 2;
      const y = WP_GRID_TOP + row * (WP_CARD_H + WP_GAP_Y) + WP_CARD_H / 2;
      this.createWallpaperCard(wp, x, y);
    });

    const totalRows = Math.ceil(availableWps.length / WP_COLS);
    const contentBottom = WP_GRID_TOP + (totalRows - 1) * (WP_CARD_H + WP_GAP_Y) + WP_CARD_H + 10;
    this.maxScrollOffset = Math.max(0, contentBottom - SCROLL_BOTTOM);
  }

  private switchTab(tab: 'character' | 'wallpaper') {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.scrollOffset = 0;
    this.hasDragged = false;
    this.cardsContainer.setY(0);
    this.updateBgForTab();

    // 컨테이너 내 카드 오브젝트 전부 제거
    this.cardsContainer.removeAll(true);
    this.cardHighlights.clear();
    this.wpHighlights.clear();

    // 탭 버튼 스타일 갱신
    if (tab === 'character') {
      this.charTabBtnBg.setFillStyle(0x1144bb).setStrokeStyle(1.5, 0x4488ff);
      this.charTabLabel.setColor('#ffffff');
      this.wpTabBtnBg.setFillStyle(0x222222).setStrokeStyle(1.5, 0x555555);
      this.wpTabLabel.setColor('#888888');

      this.buildCharacterGrid();

      // 헤더 텍스트 갱신
      const def = CHARACTERS.find(c => c.id === this.selectedId) ?? CHARACTERS[0];
      this.headerNameText.setText(`현재: ${def.name}`).setColor(def.gradeColor);
    } else {
      this.wpTabBtnBg.setFillStyle(0x1144bb).setStrokeStyle(1.5, 0x4488ff);
      this.wpTabLabel.setColor('#ffffff');
      this.charTabBtnBg.setFillStyle(0x222222).setStrokeStyle(1.5, 0x555555);
      this.charTabLabel.setColor('#888888');

      this.buildWallpaperGrid();

      // 헤더 텍스트 갱신
      const selWpDef = this.selectedWpId
        ? WALLPAPERS.find(w => w.id === this.selectedWpId)
        : null;
      this.headerNameText
        .setText(`배경: ${selWpDef?.name ?? '기본'}`)
        .setColor(this.selectedWpId ? WP_ACCENT_HEX : '#888888');
    }
  }

  /** 현재 탭에 맞게 배경 이미지 업데이트 */
  private updateBgForTab() {
    if (this.activeTab === 'character') {
      const def = CHARACTERS.find(c => c.id === this.selectedId) ?? CHARACTERS[0];
      this.bgImage.setTexture(def.illustKey).setDisplaySize(400, 600).setAlpha(1).clearTint();
    } else {
      const wpDef = this.selectedWpId
        ? WALLPAPERS.find(w => w.id === this.selectedWpId)
        : null;
      if (wpDef && this.textures.exists(wpDef.bgKey)) {
        this.bgImage.setTexture(wpDef.bgKey).setDisplaySize(400, 600).setAlpha(1).clearTint();
      } else {
        // 선택 배경 없음 → 캐릭터 일러스트를 어둡게 처리
        const def = CHARACTERS.find(c => c.id === this.selectedId) ?? CHARACTERS[0];
        this.bgImage.setTexture(def.illustKey).setDisplaySize(400, 600).setAlpha(0.2);
      }
    }
  }

  /** 서버 동기화 후 현재 탭을 내용 갱신 */
  private rebuildGrid() {
    this.cardsContainer.removeAll(true);
    this.cardHighlights.clear();
    this.wpHighlights.clear();
    if (this.activeTab === 'character') {
      this.buildCharacterGrid();
    } else {
      this.buildWallpaperGrid();
    }
  }

  // ── 배경화면 카드 ────────────────────────────────────────────────────────

  private createWallpaperCard(wp: BackgroundDef, x: number, y: number) {
    const isOwned = this.ownedWpIds.includes(wp.id);
    const isSelected = this.selectedWpId === wp.id;

    // 카드 배경
    const cardBg = this.add.rectangle(x, y, WP_CARD_W, WP_CARD_H, 0x1a1a2e);
    cardBg.setStrokeStyle(2, isOwned ? WP_ACCENT_INT : 0x333333);
    this.cardsContainer.add(cardBg);

    // 선택 하이라이트 (흰 테두리)
    const highlight = this.add.rectangle(x, y, WP_CARD_W, WP_CARD_H, 0, 0);
    highlight.setStrokeStyle(3, 0xffffff);
    highlight.setVisible(isSelected);
    this.wpHighlights.set(wp.id, highlight);
    this.cardsContainer.add(highlight);

    // 세로 이미지 (bgKey) — 카드 상단을 채우는 portrait 썸네일
    if (this.textures.exists(wp.bgKey)) {
      const thumb = this.add.image(x, y - 11, wp.bgKey)
        .setDisplaySize(WP_CARD_W - 4, WP_CARD_H - 22);
      if (!isOwned) { thumb.setTint(0x000000); thumb.setAlpha(0.5); }
      this.cardsContainer.add(thumb);
    }

    // 미보유 자물쇠
    if (!isOwned) {
      const lock = this.add.text(x, y - 8, '🔒', { fontSize: '20px' }).setOrigin(0.5);
      this.cardsContainer.add(lock);
    }

    // WP 배지 (우상단) — 기본 배경은 '기본', 가챠 배경은 'WP'
    const isDefault = (DEFAULT_WP_IDS as readonly string[]).includes(wp.id);
    const badgeText  = isDefault ? '기본' : 'WP';
    const badgeColor = isDefault ? '#aaaaaa' : WP_ACCENT_HEX;
    const badge = this.add.text(x + WP_CARD_W / 2 - 2, y - WP_CARD_H / 2 + 2, badgeText, {
      fontSize: '9px', color: badgeColor, fontStyle: 'bold',
      backgroundColor: '#000000cc', padding: { x: 3, y: 1 },
    }).setOrigin(1, 0);
    this.cardsContainer.add(badge);

    // 하단 반투명 바 + 이름
    const barY = y + WP_CARD_H / 2 - 11;
    const bar = this.add.rectangle(x, barY, WP_CARD_W, 22, 0x000000, 0.75);
    this.cardsContainer.add(bar);
    const nameText = this.add.text(x, barY, wp.name, {
      fontSize: '11px',
      color: isOwned ? WP_ACCENT_HEX : '#444444',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.cardsContainer.add(nameText);

    // 클릭 이벤트
    cardBg.setInteractive({ useHandCursor: isOwned });
    if (isOwned) {
      cardBg.on('pointerover', () => cardBg.setFillStyle(0x252540));
      cardBg.on('pointerout',  () => cardBg.setFillStyle(0x1a1a2e));
    }
    cardBg.on('pointerup', () => {
      if (!this.hasDragged && this.hasPointerDownInScene) this.showWallpaperDetail(wp);
    });
  }

  // ── 배경화면 상세 오버레이 ──────────────────────────────────────────────

  private showWallpaperDetail(def: BackgroundDef): void {
    this.hideCharacterDetail();

    // 패널 열기 직후 고스트 mouseup 방지
    this.input.enabled = false;
    this.time.delayedCall(150, () => { this.input.enabled = true; });

    const isOwned = this.ownedWpIds.includes(def.id);
    const isSelected = this.selectedWpId === def.id;

    const panel = this.add.container(0, 0).setDepth(300);
    this.detailPanel = panel;

    // 클릭 차단
    const blocker = this.add.rectangle(200, 300, 400, 600, 0x000000, 0).setInteractive();
    panel.add(blocker);

    // 배경화면 전체화면 미리보기
    if (this.textures.exists(def.bgKey)) {
      const bg = this.add.image(200, 300, def.bgKey).setDisplaySize(400, 600);
      panel.add(bg);
    } else {
      const fallback = this.add.rectangle(200, 300, 400, 600, 0x050515);
      const hint = this.add.text(200, 300, '이미지 없음\n(에셋 추가 필요)', {
        fontSize: '16px', color: '#666666', align: 'center',
      }).setOrigin(0.5);
      panel.add(fallback);
      panel.add(hint);
    }

    // 하단 그라디언트 오버레이
    const grad = this.add.graphics();
    grad.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.8, 0.8);
    grad.fillRect(0, 380, 400, 220);
    panel.add(grad);

    // ✕ 닫기 버튼
    const closeBg = this.add.circle(372, 38, 22, 0x000000, 0.55)
      .setInteractive({ useHandCursor: true });
    const closeBtn = this.add.text(372, 38, '✕', { fontSize: '18px', color: '#cccccc' }).setOrigin(0.5);
    closeBg.on('pointerover', () => { closeBg.setFillStyle(0x333333, 0.8); closeBtn.setColor('#ffffff'); });
    closeBg.on('pointerout',  () => { closeBg.setFillStyle(0x000000, 0.55); closeBtn.setColor('#cccccc'); });
    closeBg.on('pointerup',   () => this.hideCharacterDetail());
    panel.add(closeBg);
    panel.add(closeBtn);

    // 이름
    panel.add(this.add.text(24, 450, def.name, {
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }));
    panel.add(this.add.text(24, 494, def.description, {
      fontSize: '12px', color: '#aaaaaa',
      stroke: '#000000', strokeThickness: 3,
      wordWrap: { width: 350 },
    }));

    // ── 버튼 2개 ──
    const BTN_Y = 562;
    const BTN_W = 168;
    const BTN_H = 42;

    if (isOwned) {
      if (!isSelected) {
        // [적용하기]
        const applyBg = this.add.rectangle(108, BTN_Y, BTN_W, BTN_H, 0x115511)
          .setStrokeStyle(2, WP_ACCENT_INT)
          .setInteractive({ useHandCursor: true });
        applyBg.on('pointerover', () => applyBg.setFillStyle(0x226622));
        applyBg.on('pointerout',  () => applyBg.setFillStyle(0x115511));
        applyBg.on('pointerup',   () => this.applyWallpaper(def.id));
        panel.add(applyBg);
        panel.add(this.add.text(108, BTN_Y, '✔  적용하기', {
          fontSize: '14px', color: '#88ff88', fontStyle: 'bold',
        }).setOrigin(0.5));
      } else {
        // [해제]
        const removeBg = this.add.rectangle(108, BTN_Y, BTN_W, BTN_H, 0x331111)
          .setStrokeStyle(2, 0x884444)
          .setInteractive({ useHandCursor: true });
        removeBg.on('pointerover', () => removeBg.setFillStyle(0x442222));
        removeBg.on('pointerout',  () => removeBg.setFillStyle(0x331111));
        removeBg.on('pointerup',   () => this.applyWallpaper(null));
        panel.add(removeBg);
        panel.add(this.add.text(108, BTN_Y, '✕  해제', {
          fontSize: '14px', color: '#ff8888', fontStyle: 'bold',
        }).setOrigin(0.5));
      }
    } else {
      const lockBg = this.add.rectangle(108, BTN_Y, BTN_W, BTN_H, 0x1a1a1a)
        .setStrokeStyle(1.5, 0x444444);
      panel.add(lockBg);
      panel.add(this.add.text(108, BTN_Y, '🔒  미보유', {
        fontSize: '14px', color: '#555555',
      }).setOrigin(0.5));
    }

    // [닫기] 버튼 (우측)
    const closeBtnBg = this.add.rectangle(292, BTN_Y, BTN_W, BTN_H, 0x1a1a1a)
      .setStrokeStyle(1.5, 0x555555)
      .setInteractive({ useHandCursor: true });
    closeBtnBg.on('pointerover', () => closeBtnBg.setFillStyle(0x2e2e2e));
    closeBtnBg.on('pointerout',  () => closeBtnBg.setFillStyle(0x1a1a1a));
    closeBtnBg.on('pointerup',   () => this.hideCharacterDetail());
    panel.add(closeBtnBg);
    panel.add(this.add.text(292, BTN_Y, '닫기', {
      fontSize: '14px', color: '#cccccc', fontStyle: 'bold',
    }).setOrigin(0.5));
  }

  private applyWallpaper(id: string | null) {
    setSelectedWallpaper(id);
    this.selectedWpId = id;

    // 하이라이트 갱신
    this.wpHighlights.forEach((rect, wpId) => {
      rect.setVisible(wpId === id);
    });

    // 헤더 텍스트 갱신
    const def = id ? WALLPAPERS.find(w => w.id === id) : null;
    this.headerNameText
      .setText(`배경: ${def?.name ?? '기본'}`)
      .setColor(id ? WP_ACCENT_HEX : '#888888');

    // 배경 이미지 즉시 반영
    this.updateBgForTab();

    this.hideCharacterDetail();
  }

  private createCharacterCard(char: CharacterDef, x: number, y: number) {
    const isOwned = this.ownedIds.includes(char.id);
    const isSelected = this.selectedId === char.id;
    const gradeColorInt = parseInt(char.gradeColor.replace('#', ''), 16);

    // 카드 배경
    const cardBg = this.add.rectangle(x, y, CARD_W, CARD_H, 0x222222);
    cardBg.setStrokeStyle(2, isOwned ? gradeColorInt : 0x444444);
    this.cardsContainer.add(cardBg);

    // 선택 하이라이트
    const highlight = this.add.rectangle(x, y, CARD_W, CARD_H, 0, 0);
    highlight.setStrokeStyle(3, 0xffffff);
    highlight.setVisible(isSelected);
    this.cardHighlights.set(char.id, highlight);
    this.cardsContainer.add(highlight);

    // 캐릭터 이미지
    const img = this.add.image(x, y - 12, char.imageKey);
    img.setDisplaySize(58, 85);
    this.cardsContainer.add(img);

    if (!isOwned) {
      img.setTint(0x000000);
      img.setAlpha(0.6);
      const lock = this.add.text(x, y - 12, '🔒', { fontSize: '22px' }).setOrigin(0.5);
      this.cardsContainer.add(lock);
    }

    // 등급 배지
    const gradeImgKey = getGradeImgKey(char.grade);
    if (gradeImgKey) {
      const badge = this.add.image(x - CARD_W / 2 + 2, y - CARD_H / 2 + 2, gradeImgKey)
        .setDisplaySize(26, 26).setOrigin(0, 0).setDepth(5);
      this.cardsContainer.add(badge);
    }

    // 각성 코어 (등급외 제외, 보유 캐릭터만) — 공유 coresGfx에 직접 그림
    if (isOwned && char.grade !== '등급외') {
      const dupCount   = getDuplicateCount(char.id);
      const awakeLevel = getAwakeningLevel(char.grade, dupCount);
      const coreY      = y + CARD_H / 2 - CORE_Y_OFFSET;

      for (let i = 0; i < CORE_COUNT; i++) {
        const cx = x + (i - 2) * CORE_GAP;
        if (i < awakeLevel) {
          // 충전된 코어: 외곽 글로우 + 내부 밝은 원
          this.coresGfx.fillStyle(gradeColorInt, 0.25);
          this.coresGfx.fillCircle(cx, coreY, CORE_GLOW_RADIUS);
          this.coresGfx.fillStyle(gradeColorInt, 1);
          this.coresGfx.fillCircle(cx, coreY, CORE_INNER_RADIUS);
          this.coresGfx.fillStyle(0xffffff, 0.55);
          this.coresGfx.fillCircle(cx - 1, coreY - 1, CORE_HIGHLIGHT_R);
        } else {
          // 빈 코어: 어두운 원 + 얇은 테두리
          this.coresGfx.fillStyle(0x111111, 1);
          this.coresGfx.fillCircle(cx, coreY, CORE_INNER_RADIUS);
          this.coresGfx.lineStyle(1, gradeColorInt, 0.35);
          this.coresGfx.strokeCircle(cx, coreY, CORE_INNER_RADIUS);
        }
      }
    }

    // 캐릭터 이름
    const nameText = this.add.text(x, y + CARD_H / 2 - 16, char.name, {
      fontSize: '12px',
      color: isOwned ? '#ffffff' : '#555555',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.cardsContainer.add(nameText);

    // 모든 카드 클릭 가능 (탭 → 상세 패널 열기)
    cardBg.setInteractive({ useHandCursor: isOwned });

    if (isOwned) {
      cardBg.on('pointerover', () => {
        if (this.selectedId !== char.id) cardBg.setFillStyle(0x333333);
      });
      cardBg.on('pointerout', () => {
        if (this.selectedId !== char.id) cardBg.setFillStyle(0x222222);
      });
    }
    // pointerup으로 상세 패널 열기 (드래그 스크롤과 구분, 이전 씬 bleed-through 방지)
    cardBg.on('pointerup', () => {
      if (!this.hasDragged && this.hasPointerDownInScene) this.showCharacterDetail(char.id);
    });
  }

  private selectCharacter(id: string) {
    // 이전 선택 하이라이트 제거
    const prev = this.cardHighlights.get(this.selectedId);
    if (prev) prev.setVisible(false);

    this.selectedId = id;
    setSelectedCharacter(id);

    const next = this.cardHighlights.get(id);
    if (next) next.setVisible(true);

    // 헤더 직접 갱신 (씬 재시작 없이)
    const def = CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
    this.headerNameText.setText(`현재: ${def.name}`);
    this.headerNameText.setColor(def.gradeColor);
    this.bgImage.setTexture(def.illustKey);
  }

  private showCharacterDetail(id: string): void {
    this.hideCharacterDetail();

    // 패널 열기 직후 고스트 mouseup 방지 (터치 → 마우스 에뮬레이션 bleed-through)
    this.input.enabled = false;
    this.time.delayedCall(150, () => { this.input.enabled = true; });

    const def = CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
    const isOwned = this.ownedIds.includes(id);
    const gradeColorInt = parseInt(def.gradeColor.replace('#', ''), 16);

    const panel = this.add.container(0, 0).setDepth(300);
    this.detailPanel = panel;

    // ── 클릭 투과 차단 레이어 (카드 목록으로 이벤트 전달 방지)
    const blocker = this.add.rectangle(200, 300, 400, 600, 0x000000, 0).setInteractive();
    panel.add(blocker);

    // ── 일러스트 전체 화면 ───────────────────────────────────────────
    const illust = this.add.image(200, 300, def.illustKey).setDisplaySize(400, 600);
    panel.add(illust);

    // ── 비디오 (일러스트와 같은 위치, 처음엔 숨김) ─────────────────
    const hasVideo = !!(def.videoKey && this.cache.video.exists(def.videoKey));
    const videoObj = hasVideo
      ? this.add.video(200, 300, def.videoKey!).setDisplaySize(400, 600).setVisible(false)
      : null;
    if (videoObj) {
      panel.add(videoObj);
      this.detailVideo = videoObj;
    }

    // ── 하단 그라디언트 (위 투명 → 아래 짙은 어둠) ─────────────────
    // 비디오/일러스트 위, 버튼 아래에 위치하도록 여기서 추가
    const grad = this.add.graphics();
    grad.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.78, 0.78);
    grad.fillRect(0, 380, 400, 220);
    panel.add(grad);

    // ── ✕ 닫기 버튼 (우상단 플로팅) ────────────────────────────────
    const closeBg = this.add.circle(372, 38, 22, 0x000000, 0.55)
      .setInteractive({ useHandCursor: true });
    const closeBtn = this.add.text(372, 38, '✕', {
      fontSize: '18px', color: '#cccccc',
    }).setOrigin(0.5);
    closeBg.on('pointerover', () => { closeBg.setFillStyle(0x333333, 0.8); closeBtn.setColor('#ffffff'); });
    closeBg.on('pointerout',  () => { closeBg.setFillStyle(0x000000, 0.55); closeBtn.setColor('#cccccc'); });
    closeBg.on('pointerup',   () => this.hideCharacterDetail());
    panel.add(closeBg);
    panel.add(closeBtn);

    // ── 하단 정보 영역 ───────────────────────────────────────────────
    // 픽셀 스프라이트
    const sprite = this.add.image(38, 515, def.imageKey).setDisplaySize(46, 64);
    if (!isOwned) { sprite.setTint(0x222222).setAlpha(0.55); }
    panel.add(sprite);

    // 등급 배지
    const gradeImgKey2 = getGradeImgKey(def.grade);
    if (gradeImgKey2) {
      const gradeBadge = this.add.image(74, 492, gradeImgKey2).setDisplaySize(28, 28).setOrigin(0.5);
      panel.add(gradeBadge);
    }

    // 캐릭터 이름 (크게)
    const nameText = this.add.text(74, 510, def.name, {
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    });
    panel.add(nameText);

    // ── 하단 버튼 2개 (나란히) ──────────────────────────────────────
    const BTN_Y = 568;
    const BTN_W = 168;
    const BTN_H = 42;

    // 📋 정보 보기 (좌)
    const infoBg = this.add.rectangle(108, BTN_Y, BTN_W, BTN_H, 0x1a1a1a)
      .setStrokeStyle(1.5, 0x555555)
      .setInteractive({ useHandCursor: true });
    infoBg.on('pointerover', () => infoBg.setFillStyle(0x2e2e2e));
    infoBg.on('pointerout',  () => infoBg.setFillStyle(0x1a1a1a));
    infoBg.on('pointerup',   () => this.showInfoPanel(def));
    const infoLabel = this.add.text(108, BTN_Y, '📋  정보 보기', {
      fontSize: '14px', color: '#cccccc', fontStyle: 'bold',
    }).setOrigin(0.5);
    panel.add(infoBg);
    panel.add(infoLabel);

    // ✔ 선택하기 / 🔒 미보유 (우)
    if (isOwned) {
      const selBg = this.add.rectangle(292, BTN_Y, BTN_W, BTN_H, 0x1144bb)
        .setStrokeStyle(2, gradeColorInt)
        .setInteractive({ useHandCursor: true });
      selBg.on('pointerover', () => selBg.setFillStyle(0x2860dd));
      selBg.on('pointerout',  () => selBg.setFillStyle(0x1144bb));
      selBg.on('pointerup',   () => this.confirmSelect(id));
      const selLabel = this.add.text(292, BTN_Y, '✔  선택하기', {
        fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
      panel.add(selBg);
      panel.add(selLabel);
    } else {
      const lockBg = this.add.rectangle(292, BTN_Y, BTN_W, BTN_H, 0x1a1a1a)
        .setStrokeStyle(1.5, 0x444444);
      const lockLabel = this.add.text(292, BTN_Y, '🔒  미보유', {
        fontSize: '14px', color: '#555555',
      }).setOrigin(0.5);
      panel.add(lockBg);
      panel.add(lockLabel);
    }

    // ── 비디오 인터랙션 (비디오가 있는 캐릭터만) ────────────────────
    if (hasVideo && videoObj) {
      // 일러스트 탭 → 비디오 재생 (가챠와 동일한 fitVideo 방식)
      // active 체크: ✕ 탭 시 패널 파괴 직후 이 핸들러가 동시에 발화하는 경우 방지
      const startVideo = () => {
        if (!illust.active || !videoObj?.active) return;
        videoObj!.setVisible(true);
        videoObj!.play(false);
        this.fitVideoToPanel(videoObj!);
        // 비디오 'play' 이벤트 = 실제 재생 시작 시점 → 그때 일러스트 숨김
        // (즉시 숨기면 첫 프레임 렌더 전 갭에 카드 목록이 비침)
        videoObj!.once('play', () => {
          if (illust.active) illust.setVisible(false);
        });
      };
      illust.setInteractive({ useHandCursor: true });
      illust.on('pointerup', startVideo);

      // 비디오 탭 또는 재생 완료 → 일러스트로 복귀
      const stopVideo = () => {
        videoObj!.stop();
        videoObj!.setVisible(false);
        illust.setVisible(true);
      };
      videoObj.setInteractive({ useHandCursor: true });
      videoObj.on('pointerup', stopVideo);
      videoObj.on('complete', stopVideo);
    }
  }

  /** GachaScene.fitVideoToCanvas와 동일 — aspect ratio 유지하며 400×600 캔버스에 cover */
  private fitVideoToPanel(vid: Phaser.GameObjects.Video): void {
    const W = 400, H = 600;
    vid.setDisplaySize(W, H);

    const applyContain = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el: HTMLVideoElement | null = (vid as any).video ?? null;
      const nw = el?.videoWidth  || 0;
      const nh = el?.videoHeight || 0;
      if (nw > 0 && nh > 0) {
        const scale = Math.max(W / nw, H / nh);
        vid.setDisplaySize(Math.round(nw * scale), Math.round(nh * scale));
      }
    };

    vid.once('play', applyContain);
    this.fitVideoTimers.push(this.time.delayedCall(100, applyContain));
    this.fitVideoTimers.push(this.time.delayedCall(500, applyContain));
  }

  private hideCharacterDetail(): void {
    // fitVideoToPanel의 pending 타이머 취소
    for (const t of this.fitVideoTimers) t.remove();
    this.fitVideoTimers = [];

    // 비디오 명시 정지 및 HTMLVideoElement src 해제
    if (this.detailVideo) {
      this.detailVideo.stop();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el: HTMLVideoElement | null = (this.detailVideo as any).video ?? null;
      if (el) { el.src = ''; }
      this.detailVideo = null;
    }

    this.hideInfoPanel();
    this.detailPanel?.destroy();
    this.detailPanel = null;
  }

  private confirmSelect(id: string): void {
    this.selectCharacter(id);
    this.hideCharacterDetail();
  }

  private showInfoPanel(def: CharacterDef): void {
    this.hideInfoPanel();

    // 패널 열기 직후 고스트 mouseup 방지
    this.input.enabled = false;
    this.time.delayedCall(150, () => { this.input.enabled = true; });

    const gradeColorInt = parseInt(def.gradeColor.replace('#', ''), 16);
    const panel = this.add.container(0, 0).setDepth(400);
    this.infoPanel = panel;

    // ── 각성 보너스 계산 ──────────────────────────────────────────────
    const dupCount   = getDuplicateCount(def.id);
    const awakeLevel = getAwakeningLevel(def.grade, dupCount);
    const awakeBonusLines: string[] = [];
    if (def.grade !== '등급외') {
      if (awakeLevel >= 1) {
        const spd = def.id === 'maehwa' ? 5 : def.grade === 'UR' ? 15 : def.grade === 'SR' ? 10 : 5;
        awakeBonusLines.push(`★1 각성: 이동속도 +${spd} px/s`);
      }
      if (awakeLevel >= 2) {
        if (def.id === 'maehwa') {
          awakeBonusLines.push('★2 각성: 특수 똥 수집 시 +5점');
        } else {
          const spd = def.grade === 'UR' ? 20 : def.grade === 'SR' ? 15 : 10;
          awakeBonusLines.push(`★2 각성: 이동속도 +${spd} px/s (누적)`);
        }
      }
    }
    const awakeBonusText = awakeBonusLines.join('\n');

    // 반투명 배경 (클릭 시 닫기)
    const overlay = this.add.rectangle(200, 300, 400, 600, 0x000000, 0.80)
      .setInteractive();
    overlay.on('pointerup', () => this.hideInfoPanel());
    panel.add(overlay);

    // ── 카드 크기 계산 (텍스트 높이 선측정) ─────────────────────────
    const B_LEFT = 30;
    const CARD_W = 370;
    const WRAP_W = CARD_W - 40; // 좌(15px)·우(25px) 여백 제외한 실제 텍스트 폭
    const HEADER_H = 60;  // 스프라이트+이름+구분선 영역
    const PAD_BOT  = 20;

    const btMeasure = this.add.text(0, -999, def.basicEffect,    { fontSize: '13px', wordWrap: { width: WRAP_W } });
    const stMeasure = this.add.text(0, -999, def.specialAbility, { fontSize: '13px', wordWrap: { width: WRAP_W } });
    const abMeasure = awakeBonusText
      ? this.add.text(0, -999, awakeBonusText, { fontSize: '12px', wordWrap: { width: WRAP_W } })
      : null;
    const abHeight  = abMeasure ? abMeasure.height + 8 : 0;
    const cardH = HEADER_H + 18 + btMeasure.height + abHeight + 14 + 18 + stMeasure.height + PAD_BOT;
    btMeasure.destroy();
    stMeasure.destroy();
    abMeasure?.destroy();

    // 화면 중앙 배치 (상하 여백 각 70px 보장)
    const cardTop = Math.max(70, Math.round((600 - cardH) / 2));
    const card = this.add.rectangle(200, cardTop + cardH / 2, CARD_W, cardH, 0x111111)
      .setStrokeStyle(2, gradeColorInt);
    panel.add(card);

    // ── 헤더: 픽셀 스프라이트 + 등급 + 이름 ─────────────────────────
    const sprite = this.add.image(52, cardTop + 24, def.imageKey).setDisplaySize(38, 52);
    panel.add(sprite);

    const gradeImgKey3 = getGradeImgKey(def.grade);
    if (gradeImgKey3) {
      const badge = this.add.image(82, cardTop + 8, gradeImgKey3).setDisplaySize(24, 24).setOrigin(0.5, 0);
      panel.add(badge);
    }

    const name = this.add.text(82, cardTop + 24, def.name, {
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    });
    panel.add(name);

    // ✕ 닫기 (헤더 우측)
    const closeX = 200 + CARD_W / 2 - 14;
    const closeY = cardTop + 16;
    const infoBtnBg = this.add.circle(closeX, closeY, 18, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    const closeTxt = this.add.text(closeX, closeY, '✕', {
      fontSize: '16px', color: '#999999',
    }).setOrigin(0.5);
    infoBtnBg.on('pointerover', () => closeTxt.setColor('#ffffff'));
    infoBtnBg.on('pointerout',  () => closeTxt.setColor('#999999'));
    infoBtnBg.on('pointerup',   () => this.hideInfoPanel());
    panel.add(infoBtnBg);
    panel.add(closeTxt);

    // 구분선
    panel.add(this.add.rectangle(200, cardTop + HEADER_H - 4, CARD_W - 20, 1, 0x444444));

    // ── 기본 효과 ─────────────────────────────────────────────────────
    let curY = cardTop + HEADER_H + 4;

    panel.add(this.add.text(B_LEFT, curY, '🔷 기본 효과', {
      fontSize: '12px', color: '#88bbff', fontStyle: 'bold',
    }));
    curY += 18;

    const basicText = this.add.text(B_LEFT, curY, def.basicEffect, {
      fontSize: '13px', color: '#eeeeee', wordWrap: { width: WRAP_W },
    });
    panel.add(basicText);
    curY += basicText.height;

    if (awakeBonusText) {
      curY += 8;
      panel.add(this.add.text(B_LEFT, curY, awakeBonusText, {
        fontSize: '12px', color: '#ffd700', wordWrap: { width: WRAP_W },
      }));
      curY += (abHeight - 8);
    }

    curY += 14;

    // ── 특수 능력 ─────────────────────────────────────────────────────
    panel.add(this.add.text(B_LEFT, curY, '⚡ 특수 능력', {
      fontSize: '12px', color: '#ffdd88', fontStyle: 'bold',
    }));
    curY += 18;

    panel.add(this.add.text(B_LEFT, curY, def.specialAbility, {
      fontSize: '13px',
      color: def.specialAbility === '없음' ? '#666666' : '#eeeeee',
      wordWrap: { width: WRAP_W },
    }));
  }

  private hideInfoPanel(): void {
    this.infoPanel?.destroy();
    this.infoPanel = null;
  }

  private createBackButton() {
    const btn = this.add.rectangle(200, 573, 200, 50, 0x333333).setDepth(10);
    btn.setStrokeStyle(2, 0x888888);

    this.add.text(200, 573, '← 돌아가기', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setFillStyle(0x555555));
    btn.on('pointerout',  () => btn.setFillStyle(0x333333));
    btn.on('pointerdown', () => this.scene.start(this.returnScene));
  }
}
