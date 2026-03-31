import BaseScene from './BaseScene';
import { getFragmentCount, getUnlockedLogs, STORY_LOGS, type StoryLog } from '../utils/storyProgress';

export default class MemoryVaultScene extends BaseScene {
  constructor() {
    super('MemoryVaultScene');
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
  }

  create() {
    super.create();

    const { W, H, cx, yOff } = this.getScaleInfo();

    // 배경
    const bg = this.add.image(cx, H / 2, 'background2');
    bg.setDisplaySize(W, H);

    // 어두운 오버레이
    this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.55);

    // 타이틀
    this.add.text(cx, 44 + yOff, '📡 MEMORY VAULT', {
      fontSize: '26px',
      color: '#00ffcc',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
      padding: { top: 6 },
    }).setOrigin(0.5);

    // 파편 카운트
    const fragmentCount = getFragmentCount();
    this.add.text(cx, 80 + yOff, `수집된 데이터 파편: ${fragmentCount}개`, {
      fontSize: '15px',
      color: '#aaffee',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // 해금된 로그
    const unlockedLogs = getUnlockedLogs();

    // 스크롤 가능한 로그 목록
    this.renderLogs(unlockedLogs, fragmentCount, W, H, cx, yOff);

    // 뒤로가기 버튼
    this.createBackButton(cx, H - 60);
  }

  private renderLogs(logs: StoryLog[], fragmentCount: number, W: number, H: number, cx: number, yOff: number) {
    const contentY = 110 + yOff;
    const contentH = H - 170 - yOff;
    const padX = 20;
    const panelW = W - padX * 2;

    // 마스크 영역 (스크롤 컨테이너)
    const maskShape = this.make.graphics({});
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(padX, contentY, panelW, contentH);
    const mask = maskShape.createGeometryMask();

    const container = this.add.container(0, 0);
    container.setMask(mask);

    let itemY = contentY;
    const itemGap = 8;

    // 잠긴 로그들도 표시 (잠금 상태로)
    for (const log of STORY_LOGS) {
      const isUnlocked = logs.some(l => l.id === log.id);
      itemY = this.addLogEntry(container, log, isUnlocked, fragmentCount, padX, itemY, panelW);
      itemY += itemGap;
    }

    // 모든 로그가 잠긴 경우 안내 메시지
    if (logs.length === 0) {
      this.add.text(cx, contentY + contentH / 2, '게임을 플레이하여\n데이터 파편을 수집하세요!', {
        fontSize: '16px',
        color: '#88ccbb',
        align: 'center',
        stroke: '#000',
        strokeThickness: 3,
      }).setOrigin(0.5);
    }

    // 스크롤 지원
    const totalH = itemY - contentY;
    if (totalH > contentH) {
      let scrollY = 0;
      const maxScroll = totalH - contentH;

      this.input.on('wheel', (_pointer: unknown, _gameObjects: unknown, _deltaX: number, deltaY: number) => {
        scrollY = Phaser.Math.Clamp(scrollY + deltaY * 0.8, 0, maxScroll);
        container.setY(-scrollY);
      });
    }
  }

  private addLogEntry(
    container: Phaser.GameObjects.Container,
    log: StoryLog,
    isUnlocked: boolean,
    fragmentCount: number,
    padX: number,
    y: number,
    panelW: number,
  ): number {
    const bgColor = isUnlocked ? 0x003322 : 0x1a1a2e;
    const bgAlpha = isUnlocked ? 0.85 : 0.6;

    const phaseColors: Record<number, string> = { 1: '#00ffcc', 2: '#ff8800', 3: '#ff00cc' };
    const phaseColor = phaseColors[log.phase] ?? '#ffffff';

    if (isUnlocked) {
      // 해금된 로그: 전체 내용 표시
      const lines = log.content.split('\n');
      const entryH = 24 + lines.length * 18 + 16;

      const bg = this.add.rectangle(padX + panelW / 2, y + entryH / 2, panelW, entryH, bgColor, bgAlpha);
      container.add(bg);

      const title = this.add.text(padX + 10, y + 8, log.title, {
        fontSize: '13px',
        color: phaseColor,
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 2,
      });
      container.add(title);

      let lineY = y + 26;
      for (const line of lines) {
        const lineText = this.add.text(padX + 14, lineY, line, {
          fontSize: '12px',
          color: '#cceeee',
          stroke: '#000',
          strokeThickness: 2,
          wordWrap: { width: panelW - 28 },
        });
        container.add(lineText);
        lineY += 18;
      }

      return y + entryH;
    } else {
      // 잠긴 로그
      const entryH = 40;
      const bg = this.add.rectangle(padX + panelW / 2, y + entryH / 2, panelW, entryH, bgColor, bgAlpha);
      container.add(bg);

      const remaining = log.unlockAt - fragmentCount;
      const lockText = this.add.text(padX + 10, y + 11, `🔒 [Phase ${log.phase}] 파편 ${remaining}개 더 필요`, {
        fontSize: '12px',
        color: '#556677',
        stroke: '#000',
        strokeThickness: 2,
      });
      container.add(lockText);

      return y + entryH;
    }
  }

  private createBackButton(cx: number, y: number) {
    const btnW = 160;
    const btnH = 40;

    const bg = this.add.rectangle(cx, y, btnW, btnH, 0x334455, 1)
      .setInteractive({ useHandCursor: true });
    const label = this.add.text(cx, y, '← 메인으로', {
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x4455aa));
    bg.on('pointerout', () => bg.setFillStyle(0x334455));
    bg.on('pointerdown', () => {
      this.scene.start('ModeSelectScene');
    });

    return { bg, label };
  }
}
