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

  // 상세 정보 패널
  private detailPanel: Phaser.GameObjects.Container | null = null;
  private infoPanel: Phaser.GameObjects.Container | null = null;

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
      if (char.videoKey && char.videoPath && !this.cache.video.exists(char.videoKey)) {
        this.load.video(char.videoKey, char.videoPath);
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
      this.time.delayedCall(0, () => { this.hasDragged = false; });
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
    // pointerup으로 상세 패널 열기 (드래그 스크롤과 구분)
    cardBg.on('pointerup', () => {
      if (!this.hasDragged) this.showCharacterDetail(char.id);
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

    const def = CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
    const isOwned = this.ownedIds.includes(id);
    const gradeColorInt = parseInt(def.gradeColor.replace('#', ''), 16);

    const panel = this.add.container(0, 0).setDepth(300);
    this.detailPanel = panel;

    // ── 일러스트 전체 화면 ───────────────────────────────────────────
    const illust = this.add.image(200, 300, def.illustKey).setDisplaySize(400, 600);
    panel.add(illust);

    // ── 비디오 (일러스트와 같은 위치, 처음엔 숨김) ─────────────────
    const hasVideo = !!(def.videoKey && this.cache.video.exists(def.videoKey));
    const videoObj = hasVideo
      ? this.add.video(200, 300, def.videoKey!).setDisplaySize(400, 600).setVisible(false)
      : null;
    if (videoObj) panel.add(videoObj);

    // ── 하단 그라디언트 (위 투명 → 아래 짙은 어둠) ─────────────────
    // 비디오/일러스트 위, 버튼 아래에 위치하도록 여기서 추가
    const grad = this.add.graphics();
    grad.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.78, 0.78);
    grad.fillRect(0, 380, 400, 220);
    panel.add(grad);

    // ── ✕ 닫기 버튼 (우상단 플로팅) ────────────────────────────────
    const closeBg = this.add.circle(372, 38, 18, 0x000000, 0.55);
    const closeBtn = this.add.text(372, 38, '✕', {
      fontSize: '18px', color: '#cccccc',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#cccccc'));
    closeBtn.on('pointerup',   () => this.hideCharacterDetail());
    panel.add(closeBg);
    panel.add(closeBtn);

    // ── 하단 정보 영역 ───────────────────────────────────────────────
    // 픽셀 스프라이트
    const sprite = this.add.image(38, 515, def.imageKey).setDisplaySize(46, 64);
    if (!isOwned) { sprite.setTint(0x222222).setAlpha(0.55); }
    panel.add(sprite);

    // 등급 배지
    const gradeBadge = this.add.text(74, 492, def.grade, {
      fontSize: '12px', color: def.gradeColor, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    });
    panel.add(gradeBadge);

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
        illust.setVisible(false);
        videoObj!.setVisible(true);
        videoObj!.play(false);
        this.fitVideoToPanel(videoObj!);
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
    this.time.delayedCall(100, applyContain);
    this.time.delayedCall(500, applyContain);
  }

  private hideCharacterDetail(): void {
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

    const gradeColorInt = parseInt(def.gradeColor.replace('#', ''), 16);
    const panel = this.add.container(0, 0).setDepth(400);
    this.infoPanel = panel;

    // 반투명 배경 (클릭 시 닫기)
    const overlay = this.add.rectangle(200, 300, 400, 600, 0x000000, 0.80)
      .setInteractive();
    overlay.on('pointerup', () => this.hideInfoPanel());
    panel.add(overlay);

    // ── 카드 크기 계산 (텍스트 높이 선측정) ─────────────────────────
    const B_LEFT = 30;
    const CARD_W = 370;
    const WRAP_W = CARD_W - 24;
    const HEADER_H = 60;  // 스프라이트+이름+구분선 영역
    const PAD_BOT  = 20;

    const btMeasure = this.add.text(0, -999, def.basicEffect,    { fontSize: '13px', wordWrap: { width: WRAP_W } });
    const stMeasure = this.add.text(0, -999, def.specialAbility, { fontSize: '13px', wordWrap: { width: WRAP_W } });
    const cardH = HEADER_H + 18 + btMeasure.height + 14 + 18 + stMeasure.height + PAD_BOT;
    btMeasure.destroy();
    stMeasure.destroy();

    // 화면 중앙 배치 (상하 여백 각 70px 보장)
    const cardTop = Math.max(70, Math.round((600 - cardH) / 2));
    const card = this.add.rectangle(200, cardTop + cardH / 2, CARD_W, cardH, 0x111111)
      .setStrokeStyle(2, gradeColorInt);
    panel.add(card);

    // ── 헤더: 픽셀 스프라이트 + 등급 + 이름 ─────────────────────────
    const sprite = this.add.image(52, cardTop + 24, def.imageKey).setDisplaySize(38, 52);
    panel.add(sprite);

    const badge = this.add.text(82, cardTop + 8, def.grade, {
      fontSize: '11px', color: def.gradeColor, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    });
    panel.add(badge);

    const name = this.add.text(82, cardTop + 24, def.name, {
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    });
    panel.add(name);

    // ✕ 닫기 (헤더 우측)
    const closeTxt = this.add.text(200 + CARD_W / 2 - 14, cardTop + 16, '✕', {
      fontSize: '16px', color: '#999999',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeTxt.on('pointerover', () => closeTxt.setColor('#ffffff'));
    closeTxt.on('pointerout',  () => closeTxt.setColor('#999999'));
    closeTxt.on('pointerup',   () => this.hideInfoPanel());
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
    curY += basicText.height + 14;

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
