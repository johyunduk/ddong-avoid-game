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

export default class CharacterSelectScene extends Phaser.Scene {
  private selectedId: string = 'chibi';
  private ownedIds: string[] = [];
  private cardHighlights: Map<string, Phaser.GameObjects.Rectangle> = new Map();

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
    this.cardHighlights.clear();

    const selectedDef = CHARACTERS.find(c => c.id === this.selectedId) ?? CHARACTERS[0];

    // 배경: 선택된 캐릭터 일러스트를 화면 가득 채우고 어둡게 처리
    const bgImg = this.add.image(200, 300, selectedDef.illustKey);
    bgImg.setDisplaySize(400, 600);

    // 헤더
    this.add.text(200, 40, '캐릭터 선택', {
      fontSize: '26px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // 선택 중인 캐릭터 표시
    this.add.text(200, 80, `현재: ${selectedDef.name}`, {
      fontSize: '16px',
      color: selectedDef.gradeColor,
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(200, 108, '수집한 캐릭터를 선택하세요', {
      fontSize: '13px',
      color: '#888888',
    }).setOrigin(0.5);

    // 캐릭터 카드 그리드
    CHARACTERS.forEach((char, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = GRID_LEFT + col * (CARD_W + GAP_X) + CARD_W / 2;
      const y = GRID_TOP + row * (CARD_H + GAP_Y) + CARD_H / 2;
      this.createCharacterCard(char, x, y);
    });

    // 뒤로 가기
    this.createBackButton();
  }

  private createCharacterCard(char: CharacterDef, x: number, y: number) {
    const isOwned = this.ownedIds.includes(char.id);
    const isSelected = this.selectedId === char.id;

    const gradeColorInt = parseInt(char.gradeColor.replace('#', ''), 16);

    // 카드 배경
    const cardBg = this.add.rectangle(x, y, CARD_W, CARD_H, 0x222222);
    cardBg.setStrokeStyle(2, isOwned ? gradeColorInt : 0x444444);

    // 선택 하이라이트 (선택됐으면 밝은 테두리)
    const highlight = this.add.rectangle(x, y, CARD_W, CARD_H, 0, 0);
    highlight.setStrokeStyle(3, 0xffffff);
    highlight.setVisible(isSelected);
    this.cardHighlights.set(char.id, highlight);

    // 캐릭터 이미지
    const img = this.add.image(x, y - 12, char.imageKey);
    img.setDisplaySize(70, 85);

    if (!isOwned) {
      // 미보유: 실루엣 처리
      img.setTint(0x000000);
      img.setAlpha(0.6);
      // 자물쇠 아이콘
      this.add.text(x, y - 12, '🔒', {
        fontSize: '22px',
      }).setOrigin(0.5);
    }

    // 등급 배지
    this.add.text(x + CARD_W / 2 - 2, y - CARD_H / 2 + 2, char.grade, {
      fontSize: '9px',
      color: char.gradeColor,
      fontStyle: 'bold',
      backgroundColor: '#000000cc',
      padding: { x: 3, y: 1 },
    }).setOrigin(1, 0);

    // 캐릭터 이름
    this.add.text(x, y + CARD_H / 2 - 16, char.name, {
      fontSize: '12px',
      color: isOwned ? '#ffffff' : '#555555',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 보유 캐릭터만 클릭 가능
    if (isOwned) {
      cardBg.setInteractive({ useHandCursor: true });

      cardBg.on('pointerover', () => {
        if (this.selectedId !== char.id) {
          cardBg.setFillStyle(0x333333);
        }
      });
      cardBg.on('pointerout', () => {
        if (this.selectedId !== char.id) {
          cardBg.setFillStyle(0x222222);
        }
      });
      cardBg.on('pointerdown', () => {
        this.selectCharacter(char.id);
      });
    }
  }

  private selectCharacter(id: string) {
    // 이전 선택 하이라이트 제거
    const prev = this.cardHighlights.get(this.selectedId);
    if (prev) prev.setVisible(false);

    // 새 선택 적용
    this.selectedId = id;
    setSelectedCharacter(id);

    const next = this.cardHighlights.get(id);
    if (next) next.setVisible(true);

    // 헤더 "현재:" 텍스트 갱신을 위해 씬 재시작
    // (Phaser text 오브젝트를 직접 업데이트하려면 ref가 필요하므로 간단히 재시작)
    this.scene.restart();
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
