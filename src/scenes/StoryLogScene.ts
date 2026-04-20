import Phaser from 'phaser';
import { STORY_LOGS } from '../data/storyLogs';
import type { StoryLog } from '../types/StoryTypes';
import { getUnlockedIds, getReadIds, markAsRead } from '../utils/storyProgress';
import BaseScene from './BaseScene';

const SCROLL_TOP    = 95;
const SCROLL_BOTTOM = 548;
const ROW_H         = 72;
const ROW_GAP       = 6;

const COND_LABEL: Record<string, string> = {
  topaz:     '토파즈',
  gold:      '금똥',
  diamond:   '다이아',
  playCount: '플레이',
  skor:      'SKOR',
  gacha:     '뽑기',
};

export default class StoryLogScene extends BaseScene {
  private scrollOffset = 0;
  private maxScrollOffset = 0;
  private rowContainer!: Phaser.GameObjects.Container;
  private maskGfx!: Phaser.GameObjects.Graphics;
  private pointerDownY = 0;
  private pointerDownScrollY = 0;
  private hasDragged = false;
  private viewerContainer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('StoryLogScene');
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
  }

  create() {
    super.create();

    const { W, H, cx, yOff } = this.getScaleInfo();
    this.scrollOffset = 0;

    // 배경
    this.add.rectangle(cx, H / 2, W, H, 0x080812);

    // 헤더
    this._drawHeader(cx, yOff, W);

    // 스크롤 컨테이너 (yOff에 위치 — 내부 좌표는 600px 기준)
    this.rowContainer = this.add.container(0, yOff);
    this._buildLogList(W, H, yOff);

    // 마스크 (스크롤 영역 밖 숨김)
    this.maskGfx = this.make.graphics({ x: 0, y: 0 });
    this.maskGfx.fillStyle(0xffffff);
    this.maskGfx.fillRect(
      0,
      SCROLL_TOP + yOff,
      W,
      H - (600 - SCROLL_BOTTOM) - SCROLL_TOP - yOff,
    );
    this.rowContainer.setMask(this.maskGfx.createGeometryMask());

    // 스크롤 입력
    this._setupScrollInput(yOff, H);

    // 뒤로가기 버튼
    this._createBackButton(cx, H - 27);

    this.events.once('shutdown', () => {
      if (this.maskGfx?.active) this.maskGfx.destroy();
    });
  }

  // ── 헤더 ──────────────────────────────────────────────────────

  private _drawHeader(cx: number, yOff: number, W: number) {
    this.add.rectangle(cx, 40 + yOff, W, 48, 0x000000, 0.8);
    this.add.rectangle(cx, 64 + yOff, W, 1, 0x00ff41, 0.2);

    this.add.text(cx, 34 + yOff, '기록 로그 아카이브', {
      fontSize: '14px',
      color: '#00ff41',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const unread = getUnlockedIds().filter(id => !getReadIds().includes(id));
    if (unread.length > 0) {
      this.add.circle(cx + 82, 28 + yOff, 10, 0xff4444);
      this.add.text(cx + 82, 28 + yOff, String(unread.length), {
        fontSize: '10px', color: '#fff', fontStyle: 'bold',
      }).setOrigin(0.5);
    }
  }

  // ── 목록 빌드 ─────────────────────────────────────────────────

  private _buildLogList(W: number, H: number, yOff: number) {
    this.rowContainer.removeAll(true);

    const cx = W / 2;
    const unlocked = getUnlockedIds();
    const read = getReadIds();

    let y = SCROLL_TOP + 10;
    let currentSeason = 0;

    for (const log of STORY_LOGS) {
      if (log.season !== currentSeason) {
        currentSeason = log.season;
        const label = this.add.text(16, y, `— SEASON ${currentSeason} —`, {
          fontSize: '9px',
          color: '#00ff4166',
          fontFamily: 'monospace',
        });
        this.rowContainer.add(label);
        y += 24;
      }

      const isUnlocked = unlocked.includes(log.id);
      const isNew = isUnlocked && !read.includes(log.id);

      this._createLogRow(cx, y, log, isUnlocked, isNew, W);
      y += ROW_H + ROW_GAP;
    }

    const scrollBottom = H - (600 - SCROLL_BOTTOM);
    this.maxScrollOffset = Math.max(0, yOff + y - scrollBottom);
    this.scrollOffset = Math.min(this.scrollOffset, this.maxScrollOffset);
    this.rowContainer.setY(yOff - this.scrollOffset);
  }

  // ── 로그 행 생성 ──────────────────────────────────────────────

  private _createLogRow(
    cx: number,
    y: number,
    log: StoryLog,
    isUnlocked: boolean,
    isNew: boolean,
    W: number,
  ) {
    const alpha = isUnlocked ? 1 : 0.4;

    const bg = this.add.rectangle(cx, y + ROW_H / 2, W - 24, ROW_H, 0x0d0d1e)
      .setStrokeStyle(1, isNew ? 0x00ff41 : 0xffffff, isNew ? 0.27 : 0.08)
      .setAlpha(alpha);
    this.rowContainer.add(bg);

    // 아이콘
    const iconStr = isUnlocked ? (isNew ? '📋' : '📄') : '🔒';
    this.rowContainer.add(
      this.add.text(24, y + ROW_H / 2, iconStr, { fontSize: '18px' })
        .setOrigin(0, 0.5).setAlpha(alpha),
    );

    // 로그 ID
    const idText = this.add.text(48, y + ROW_H / 2 - 12, `[${log.id}]`, {
      fontSize: '9px',
      color: isUnlocked ? '#00ff41' : '#444444',
      fontFamily: 'monospace',
    }).setAlpha(alpha);
    this.rowContainer.add(idText);

    // NEW 뱃지
    if (isNew) {
      const bx = 48 + idText.width + 18;
      const by = y + ROW_H / 2 - 12;
      const newBg = this.add.rectangle(bx, by, 28, 14, 0xff4444);
      const newTxt = this.add.text(bx, by, 'NEW', {
        fontSize: '8px', color: '#fff', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.rowContainer.add(newBg);
      this.rowContainer.add(newTxt);
    }

    // 제목 또는 ?????
    this.rowContainer.add(
      this.add.text(48, y + ROW_H / 2 + 2,
        isUnlocked ? log.title : '?????', {
          fontSize: '13px',
          color: isUnlocked ? '#cccccc' : '#333333',
          fontStyle: 'bold',
        },
      ).setAlpha(alpha),
    );

    // 잠금 조건 (미해금만 표시)
    if (!isUnlocked) {
      const condLabel = COND_LABEL[log.unlockCondition.type] ?? log.unlockCondition.type;
      this.rowContainer.add(
        this.add.text(48, y + ROW_H / 2 + 20,
          `해금 조건: ${condLabel} × ${log.unlockCondition.threshold}`, {
            fontSize: '10px', color: '#555555',
          },
        ),
      );
    }

    // 화살표 (해금된 항목만)
    if (isUnlocked) {
      this.rowContainer.add(
        this.add.text(W - 20, y + ROW_H / 2, '▶', {
          fontSize: '12px', color: '#00ff41',
        }).setOrigin(1, 0.5).setAlpha(0.4),
      );
    }

    // 클릭 이벤트 (해금된 항목만)
    if (isUnlocked) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        if (!this.viewerContainer) bg.setFillStyle(0x001a08);
      });
      bg.on('pointerout', () => {
        if (!this.viewerContainer) bg.setFillStyle(0x0d0d1e);
      });
      bg.on('pointerup', () => {
        if (!this.hasDragged && !this.viewerContainer) this._openLogViewer(log);
      });
    }
  }

  // ── 로그 뷰어 (인라인 오버레이) ───────────────────────────────

  private _openLogViewer(log: StoryLog) {
    markAsRead(log.id);

    const { W, H, cx } = this.getScaleInfo();
    let currentPage = 0;

    // 반투명 배경 오버레이 (클릭 차단)
    const overlay = this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.88)
      .setDepth(200)
      .setInteractive();

    const panelW = W - 32;
    const panelH = Math.min(480, H - 80);

    const panel = this.add.container(cx, H / 2).setDepth(201);
    this.viewerContainer = panel;

    // 패널 배경
    const panelBg = this.add.rectangle(0, 0, panelW, panelH, 0x06060f);
    panelBg.setStrokeStyle(2, 0x00ff41, 0.7);
    panel.add(panelBg);

    // 헤더: 로그 ID
    panel.add(
      this.add.text(0, -panelH / 2 + 16, `[${log.id}]`, {
        fontSize: '10px', color: '#00ff41', fontFamily: 'monospace',
      }).setOrigin(0.5),
    );

    // 헤더: 제목
    panel.add(
      this.add.text(0, -panelH / 2 + 33, log.title, {
        fontSize: '14px', color: '#cccccc', fontStyle: 'bold',
      }).setOrigin(0.5),
    );

    // 구분선
    panel.add(
      this.add.rectangle(0, -panelH / 2 + 50, panelW - 20, 1, 0x00ff41, 0.2),
    );

    // 닫기 버튼
    const closeBtn = this.add.text(panelW / 2 - 16, -panelH / 2 + 14, '✕', {
      fontSize: '16px', color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#888888'));
    panel.add(closeBtn);

    // 페이지 내비게이션 (여러 페이지일 때)
    const prevBtn = this.add.text(-panelW / 2 + 20, panelH / 2 - 24, '◀', {
      fontSize: '14px', color: '#00ff41',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

    const nextBtn = this.add.text(panelW / 2 - 20, panelH / 2 - 24, '▶', {
      fontSize: '14px', color: '#00ff41',
    }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });

    const pageIndicator = this.add.text(0, panelH / 2 - 24, '', {
      fontSize: '11px', color: '#555555',
    }).setOrigin(0.5);

    panel.add(prevBtn);
    panel.add(nextBtn);
    panel.add(pageIndicator);

    // 콘텐츠 영역
    const contentTop = -panelH / 2 + 60;
    const contentH = panelH - 60 - 44;
    const contentMidY = contentTop + contentH / 2;

    let pageTexts: Phaser.GameObjects.Text[] = [];

    const renderPage = (pageIdx: number) => {
      pageTexts.forEach(t => t.destroy());
      pageTexts = [];

      const t = this.add.text(0, contentMidY,
        log.pages[pageIdx] ?? '', {
          fontSize: '13px',
          color: '#aaaaaa',
          fontFamily: 'monospace',
          wordWrap: { width: panelW - 32 },
          align: 'left',
          lineSpacing: 6,
        },
      ).setOrigin(0.5);
      panel.add(t);
      pageTexts.push(t);

      if (log.pages.length > 1) {
        pageIndicator.setText(`${pageIdx + 1} / ${log.pages.length}`);
        prevBtn.setAlpha(pageIdx > 0 ? 1 : 0.2);
        nextBtn.setAlpha(pageIdx < log.pages.length - 1 ? 1 : 0.2);
      } else {
        pageIndicator.setText('');
        prevBtn.setAlpha(0);
        nextBtn.setAlpha(0);
      }
    };

    renderPage(0);

    prevBtn.on('pointerdown', () => {
      if (currentPage > 0) renderPage(--currentPage);
    });
    nextBtn.on('pointerdown', () => {
      if (currentPage < log.pages.length - 1) renderPage(++currentPage);
    });

    const closeViewer = () => {
      overlay.destroy();
      panel.destroy();
      this.viewerContainer = null;
      // 목록 리빌드 (읽음 처리로 NEW 뱃지 제거)
      const { W: w, H: h, yOff } = this.getScaleInfo();
      this._buildLogList(w, h, yOff);
    };

    closeBtn.on('pointerdown', closeViewer);
    overlay.on('pointerdown', closeViewer);
  }

  // ── 스크롤 입력 ───────────────────────────────────────────────

  private _setupScrollInput(yOff: number, H: number) {
    const scrollTop    = SCROLL_TOP + yOff;
    const scrollBottom = H - (600 - SCROLL_BOTTOM);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.viewerContainer) return;
      if (p.y < scrollTop || p.y > scrollBottom) return;
      this.pointerDownY = p.y;
      this.pointerDownScrollY = this.scrollOffset;
      this.hasDragged = false;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.viewerContainer) return;
      if (!p.isDown) return;
      const dy = this.pointerDownY - p.y;
      if (Math.abs(dy) > 5) {
        this.hasDragged = true;
        this.scrollOffset = Phaser.Math.Clamp(
          this.pointerDownScrollY + dy, 0, this.maxScrollOffset,
        );
        this.rowContainer.setY(yOff - this.scrollOffset);
      }
    });

    this.input.on('pointerup', () => {
      this.time.delayedCall(0, () => { this.hasDragged = false; });
    });

    this.input.on('wheel', (
      _p: unknown, _go: unknown, _dx: number, dy: number,
    ) => {
      if (this.viewerContainer) return;
      this.scrollOffset = Phaser.Math.Clamp(
        this.scrollOffset + dy * 0.5, 0, this.maxScrollOffset,
      );
      this.rowContainer.setY(yOff - this.scrollOffset);
    });
  }

  // ── 뒤로가기 버튼 ─────────────────────────────────────────────

  private _createBackButton(cx: number, y: number) {
    const btn = this.add.rectangle(cx, y, 200, 50, 0x333333)
      .setStrokeStyle(1, 0x444444)
      .setDepth(10)
      .setInteractive({ useHandCursor: true });

    this.add.text(cx, y, '← 돌아가기', {
      fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(11);

    btn.on('pointerover', () => btn.setFillStyle(0x555555));
    btn.on('pointerout',  () => btn.setFillStyle(0x333333));
    btn.on('pointerdown', () => this.scene.start('ModeSelectScene'));
  }
}
