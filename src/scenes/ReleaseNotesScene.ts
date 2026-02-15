import Phaser from 'phaser';
import { RELEASE_NOTES } from '../data/releaseNotes';

export default class ReleaseNotesScene extends Phaser.Scene {
  private scrollContainer!: Phaser.GameObjects.Container;
  private scrollY: number = 0;
  private maxScrollY: number = 0;
  private isDragging: boolean = false;
  private dragStartY: number = 0;
  private dragStartScrollY: number = 0;

  constructor() {
    super('ReleaseNotesScene');
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
  }

  create() {
    this.scrollY = 0;

    // 배경
    const background = this.add.image(200, 300, 'background2');
    background.setDisplaySize(400, 600);

    // 반투명 오버레이 (더 어둡게)
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.7);

    // 타이틀 (고정)
    this.add.text(200, 35, '릴리즈 노트', {
      fontSize: '26px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(10);

    // 스크롤 영역 마스크
    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillRect(0, 70, 400, 470);
    const mask = maskShape.createGeometryMask();

    // 스크롤 컨테이너
    this.scrollContainer = this.add.container(0, 70);
    this.scrollContainer.setMask(mask);

    // 릴리즈 노트 내용 생성
    let currentY = 10;

    RELEASE_NOTES.forEach((release, index) => {
      const isLatest = index === 0;

      // 버전 + 날짜 헤더
      const versionText = this.add.text(20, currentY, release.version, {
        fontSize: '22px',
        color: '#FFD700',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 4,
      });
      this.scrollContainer.add(versionText);

      // NEW 뱃지 (최신 버전만)
      if (isLatest) {
        const badgeX = versionText.x + versionText.width + 10;
        const badgeBg = this.add.rectangle(
          badgeX, currentY + 4,
          42, 20,
          0xff3333, 1,
        ).setOrigin(0, 0);
        badgeBg.setStrokeStyle(1, 0xcc0000);
        this.scrollContainer.add(badgeBg);

        const badgeText = this.add.text(
          badgeX + 21, currentY + 5,
          'NEW',
          {
            fontSize: '12px',
            color: '#fff',
            fontStyle: 'bold',
          },
        ).setOrigin(0.5, 0);
        this.scrollContainer.add(badgeText);
      }

      const dateText = this.add.text(380, currentY + 5, release.date, {
        fontSize: '15px',
        color: '#ddd',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(1, 0);
      this.scrollContainer.add(dateText);

      currentY += 35;

      // 구분선
      const line = this.add.rectangle(200, currentY, 360, 2, 0xFFD700, 0.4);
      this.scrollContainer.add(line);
      currentY += 14;

      // 변경사항 목록
      release.changes.forEach((change) => {
        const changeText = this.add.text(35, currentY, `• ${change}`, {
          fontSize: '15px',
          color: '#fff',
          stroke: '#000',
          strokeThickness: 3,
          wordWrap: { width: 340 },
        });
        this.scrollContainer.add(changeText);
        currentY += changeText.height + 10;
      });

      // 릴리즈 간 여백
      if (index < RELEASE_NOTES.length - 1) {
        currentY += 20;
      }
    });

    // 하단 여백
    currentY += 20;

    // 스크롤 가능 범위 계산 (컨텐츠 높이 - 보이는 영역 높이)
    const visibleHeight = 470;
    this.maxScrollY = Math.max(0, currentY - visibleHeight);

    // 스크롤 입력 설정
    this.setupScrollInput();

    // 뒤로가기 버튼 (고정)
    this.createBackButton();
  }

  private setupScrollInput() {
    // 터치/마우스 드래그 스크롤
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.y > 70 && pointer.y < 540) {
        this.isDragging = true;
        this.dragStartY = pointer.y;
        this.dragStartScrollY = this.scrollY;
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return;
      const deltaY = this.dragStartY - pointer.y;
      this.scrollY = Phaser.Math.Clamp(
        this.dragStartScrollY + deltaY,
        0,
        this.maxScrollY,
      );
      this.scrollContainer.y = 70 - this.scrollY;
    });

    this.input.on('pointerup', () => {
      this.isDragging = false;
    });

    // 마우스 휠 스크롤
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      this.scrollY = Phaser.Math.Clamp(
        this.scrollY + deltaY * 0.5,
        0,
        this.maxScrollY,
      );
      this.scrollContainer.y = 70 - this.scrollY;
    });
  }

  private createBackButton() {
    const button = this.add.rectangle(200, 560, 150, 40, 0xffffff, 1).setDepth(10);
    button.setStrokeStyle(3, 0x000000);

    const text = this.add.text(200, 560, '← 뒤로가기', {
      fontSize: '18px',
      color: '#000',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);

    button.setInteractive({ useHandCursor: true });
    text.setInteractive({ useHandCursor: true });

    [button, text].forEach((element) => {
      element.on('pointerover', () => {
        button.setFillStyle(0xffff99);
      });

      element.on('pointerout', () => {
        button.setFillStyle(0xffffff);
      });

      element.on('pointerdown', () => {
        this.scene.start('ModeSelectScene');
      });
    });
  }
}
