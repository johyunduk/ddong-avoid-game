import Phaser from 'phaser';
import {
  CHARACTERS,
  getOwnedCharacters,
  getSelectedCharacter,
  setSelectedCharacter,
  type CharacterDef,
} from '../utils/character';

// 그리드 설정
const COLS = 3;
const CARD_W = 100;
const CARD_H = 120;
const GAP_X = 15;
const GAP_Y = 10;
const GRID_LEFT = (400 - (COLS * CARD_W + (COLS - 1) * GAP_X)) / 2; // 35px
const GRID_TOP = 145;

// 스크롤 영역 (헤더 아래 ~ 하단 버튼 위)
const SCROLL_TOP = 128;
const SCROLL_BOTTOM = 548;

export default class CharacterSelectScene extends Phaser.Scene {
  private selectedId: string = 'chibi';
  private ownedIds: string[] = [];
  private cardHighlights: Map<string, Phaser.GameObjects.Rectangle> = new Map();

  // 스크롤
  private cardsContainer!: Phaser.GameObjects.Container;
  private scrollOffset = 0;
  private maxScrollOffset = 0;
  private pointerDownY = 0;
  private pointerDownScrollY = 0;
  private hasDragged = false;

  // 동적 갱신용 ref
  private headerNameText!: Phaser.GameObjects.Text;
  private bgImage!: Phaser.GameObjects.Image;

  constructor() {
    super('CharacterSelectScene');
  }

  preload() {
    for (const char of CHARACTERS) {
      if (!this.textures.exists(char.imageKey)) {
        this.load.image(char.imageKey, char.imagePath);
      }
      if (!this.textures.exists(char.illustKey)) {
        this.load.image(char.illustKey, char.illustPath);
      }
    }
  }

  create() {
    this.selectedId = getSelectedCharacter();
    this.ownedIds = getOwnedCharacters();
    this.scrollOffset = 0;
    this.hasDragged = false;
    this.cardHighlights.clear();

    const selectedDef = CHARACTERS.find(c => c.id === this.selectedId) ?? CHARACTERS[0];

    // ── 배경: 선택된 캐릭터 일러스트 ───────────────────────────────────
    this.bgImage = this.add.image(200, 300, selectedDef.illustKey);
    this.bgImage.setDisplaySize(400, 600);

    // ── 헤더 (고정) ─────────────────────────────────────────────────────
    this.add.text(200, 40, '캐릭터 선택', {
      fontSize: '26px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.headerNameText = this.add.text(200, 80, `현재: ${selectedDef.name}`, {
      fontSize: '16px',
      color: selectedDef.gradeColor,
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(200, 108, '수집한 캐릭터를 선택하세요', {
      fontSize: '13px',
      color: '#888888',
    }).setOrigin(0.5);

    // ── 스크롤 가능한 카드 컨테이너 ─────────────────────────────────────
    this.cardsContainer = this.add.container(0, 0);

    CHARACTERS.forEach((char, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = GRID_LEFT + col * (CARD_W + GAP_X) + CARD_W / 2;
      const y = GRID_TOP + row * (CARD_H + GAP_Y) + CARD_H / 2;
      this.createCharacterCard(char, x, y);
    });

    // 스크롤 최대 범위 계산
    const totalRows = Math.ceil(CHARACTERS.length / COLS);
    const contentBottom = GRID_TOP + (totalRows - 1) * (CARD_H + GAP_Y) + CARD_H + 10;
    this.maxScrollOffset = Math.max(0, contentBottom - SCROLL_BOTTOM);

    // 카드 영역 마스크 (스크롤 영역 밖 숨김)
    const maskGfx = this.make.graphics({ x: 0, y: 0 });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(0, SCROLL_TOP, 400, SCROLL_BOTTOM - SCROLL_TOP);
    this.cardsContainer.setMask(maskGfx.createGeometryMask());

    // ── 드래그 스크롤 입력 ───────────────────────────────────────────────
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < SCROLL_TOP || p.y > SCROLL_BOTTOM) return;
      this.pointerDownY = p.y;
      this.pointerDownScrollY = this.scrollOffset;
      this.hasDragged = false;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
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
      // card pointerup 이벤트가 먼저 발생하므로 다음 프레임에 초기화
      this.time.delayedCall(0, () => { this.hasDragged = false; });
    });

    // 마우스 휠
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _go: unknown[], _dx: number, deltaY: number) => {
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
    const badge = this.add.text(x + CARD_W / 2 - 2, y - CARD_H / 2 + 2, char.grade, {
      fontSize: '9px',
      color: char.gradeColor,
      fontStyle: 'bold',
      backgroundColor: '#000000cc',
      padding: { x: 3, y: 1 },
    }).setOrigin(1, 0);
    this.cardsContainer.add(badge);

    // 캐릭터 이름
    const nameText = this.add.text(x, y + CARD_H / 2 - 16, char.name, {
      fontSize: '12px',
      color: isOwned ? '#ffffff' : '#555555',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.cardsContainer.add(nameText);

    // 보유 캐릭터만 클릭 가능
    if (isOwned) {
      cardBg.setInteractive({ useHandCursor: true });

      cardBg.on('pointerover', () => {
        if (this.selectedId !== char.id) cardBg.setFillStyle(0x333333);
      });
      cardBg.on('pointerout', () => {
        if (this.selectedId !== char.id) cardBg.setFillStyle(0x222222);
      });
      // pointerup으로 선택 (드래그 스크롤과 구분)
      cardBg.on('pointerup', () => {
        if (!this.hasDragged) this.selectCharacter(char.id);
      });
    }
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

  private createBackButton() {
    const btn = this.add.rectangle(200, 573, 200, 50, 0x333333);
    btn.setStrokeStyle(2, 0x888888);

    this.add.text(200, 573, '← 돌아가기', {
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setFillStyle(0x555555));
    btn.on('pointerout',  () => btn.setFillStyle(0x333333));
    btn.on('pointerdown', () => this.scene.start('ModeSelectScene'));
  }
}
