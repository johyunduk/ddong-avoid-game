import type Phaser from 'phaser';
import { Difficulty, Difficulty as DifficultyEnum } from '../types/GameMode';
import {
  getLeaderboard,
  claimSeasonReward,
  claimCharacterReward,
  getCachedClaimAmount,
  getCachedCharClaimAmount,
  type LeaderboardEntry,
  type PrevSeasonReward,
} from '../utils/leaderboard';
import { CHARACTERS } from '../utils/character';
import BaseScene from './BaseScene';

export default class LeaderboardScene extends BaseScene {
  private selectedDifficulty: Difficulty = DifficultyEnum.NORMAL;
  private leaderboardData: LeaderboardEntry[] = [];
  private leaderboardTexts: Phaser.GameObjects.GameObject[] = [];
  private loadingText?: Phaser.GameObjects.Text;
  private errorText?: Phaser.GameObjects.Text;
  private currentRequestId: number = 0;
  private difficultyButtons = new Map<Difficulty, Phaser.GameObjects.Rectangle>();

  // EXTREME 캐릭터 필터
  private selectedCharFilter: string | null = null;
  private charFilterObjects: Phaser.GameObjects.GameObject[] = [];
  private charOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private overlayCleanup?: () => void;

  // 시즌 UI 요소
  private seasonText?: Phaser.GameObjects.Text;
  private prevSeasonReward: PrevSeasonReward | null = null;
  private viewingYearMonth: string | null = null; // null = 현재 시즌
  private leftArrowBtn?: Phaser.GameObjects.Text;
  private rightArrowBtn?: Phaser.GameObjects.Text;

  // 보상수령 버튼 (create에서 1회 생성, updateRewardUI에서 상태 변경)
  private rewardBtnBg?: Phaser.GameObjects.Rectangle;
  private rewardBtnLabel?: Phaser.GameObjects.Text;

  constructor() {
    super('LeaderboardScene');
  }

  init() {
    const last = localStorage.getItem('lastPlayedDifficulty') as Difficulty | null;
    if (last) {
      this.selectedDifficulty = last;
    }
    this.viewingYearMonth = null;
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    // 캐릭터 아이콘 (랭킹 표시용) + 일러스트 (캐릭터 선택 오버레이용)
    CHARACTERS.forEach(char => {
      if (!this.textures.exists(char.imageKey)) {
        this.load.image(char.imageKey, char.imagePath);
      }
      if (!this.textures.exists(char.illustKey)) {
        this.load.image(char.illustKey, char.illustPath);
      }
    });
  }

  create() {
    super.create();

    this.events.once('shutdown', () => this.overlayCleanup?.());

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const yOff = (H - 600) / 2;

    // 배경 이미지 추가
    const background = this.add.image(cx, H / 2, 'background2');
    background.setDisplaySize(W, H);

    // 타이틀
    this.add.text(cx, 40 + yOff, '🏆 랭킹보드 🏆', {
      fontSize: '28px',
      color: '#fff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
      padding: { top: 6 },
    }).setOrigin(0.5);

    // 시즌 탐색 UI (◀ 시즌텍스트 ▶)
    const arrowY = 70 + yOff;
    const arrowStyle = {
      fontSize: '18px',
      color: '#aaddff',
      stroke: '#000',
      strokeThickness: 3,
    };

    // 왼쪽 화살표: 텍스트 + 투명 히트박스 Rectangle
    this.leftArrowBtn = this.add.text(cx - 145, arrowY, '◀', arrowStyle).setOrigin(0.5);
    const leftHit = this.add.rectangle(cx - 145, arrowY, 44, 36, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    leftHit.on('pointerdown', () => this.navigateSeason(-1));

    this.seasonText = this.add.text(cx, arrowY, '', {
      fontSize: '13px',
      color: '#aaddff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // 오른쪽 화살표: 텍스트 + 투명 히트박스 Rectangle
    this.rightArrowBtn = this.add.text(cx + 145, arrowY, '▶', arrowStyle).setOrigin(0.5);
    const rightHit = this.add.rectangle(cx + 145, arrowY, 44, 36, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    rightHit.on('pointerdown', () => this.navigateSeason(1));

    // 난이도 선택 버튼들
    this.createDifficultyButtons(cx, yOff);

    // 랭킹 표시 영역 (초기 로딩)
    this.loadingText = this.add.text(cx, H / 2, '로딩 중...', {
      fontSize: '20px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // 보상수령 버튼 (하단 왼쪽, 뒤로가기와 나란히)
    const rbY = H - 40;
    this.rewardBtnBg = this.add.rectangle(cx - 80, rbY, 150, 40, 0x555555, 1);
    this.rewardBtnBg.setStrokeStyle(3, 0x333333);
    this.rewardBtnLabel = this.add.text(cx - 80, rbY, '보상수령', {
      fontSize: '18px',
      color: '#999999',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // 뒤로가기 버튼 (하단 오른쪽)
    this.createBackButton(cx + 80, H - 40);

    // 초기 데이터 로드
    this.loadLeaderboard();
  }

  private createDifficultyButtons(cx: number, yOff: number) {
    this.difficultyButtons.forEach(btn => btn.destroy());
    this.difficultyButtons.clear();

    const difficulties: Difficulty[] = [
      DifficultyEnum.NORMAL,
      DifficultyEnum.HARD,
      DifficultyEnum.EXTREME,
      DifficultyEnum.PHYSICAL
    ];

    const buttonWidth = 70;
    const spacing = 85;
    const startX = cx - (spacing * 1.5);
    const y = 108 + yOff;

    difficulties.forEach((difficulty, index) => {
      const x = startX + (index * spacing);
      const isSelected = difficulty === this.selectedDifficulty;

      const button = this.add.rectangle(
        x,
        y,
        buttonWidth,
        35,
        isSelected ? 0xffff99 : 0xffffff,
        1
      );
      button.setStrokeStyle(3, isSelected ? 0xff0000 : 0x000000);

      this.add.text(x, y, difficulty, {
        fontSize: '12px',
        color: '#000',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      this.difficultyButtons.set(difficulty, button);
      button.setInteractive({ useHandCursor: true });

      button.on('pointerover', () => {
        if (difficulty !== this.selectedDifficulty) {
          button.setFillStyle(0xffffcc);
        }
      });

      button.on('pointerout', () => {
        if (difficulty !== this.selectedDifficulty) {
          button.setFillStyle(0xffffff);
        }
      });

      button.on('pointerdown', () => {
        this.selectDifficulty(difficulty);
      });
    });
  }

  private selectDifficulty(difficulty: Difficulty) {
    if (this.selectedDifficulty === difficulty) return;

    this.selectedDifficulty = difficulty;

    // 난이도 전환 시 캐릭터 필터 초기화
    this.selectedCharFilter = null;
    this.charFilterObjects.forEach(o => o.destroy());
    this.charFilterObjects = [];

    this.difficultyButtons.forEach((btn, diff) => {
      const isSelected = diff === difficulty;
      btn.setFillStyle(isSelected ? 0xffff99 : 0xffffff);
      btn.setStrokeStyle(3, isSelected ? 0xff0000 : 0x000000);
    });

    this.loadLeaderboard();
  }

  private async loadLeaderboard() {
    // 요청 ID 증가 (새로운 요청 시작)
    this.currentRequestId++;
    const requestId = this.currentRequestId;

    // 기존 랭킹 텍스트 제거
    this.leaderboardTexts.forEach(text => text.destroy());
    this.leaderboardTexts = [];
    this.prevSeasonReward = null;

    if (this.errorText) {
      this.errorText.destroy();
      this.errorText = undefined;
    }

    // 로딩 표시
    if (!this.loadingText) {
      this.loadingText = this.add.text(this.scale.width / 2, this.scale.height / 2, '로딩 중...', {
        fontSize: '20px',
        color: '#fff',
        stroke: '#000',
        strokeThickness: 3
      }).setOrigin(0.5);
    } else {
      this.loadingText.setVisible(true);
    }

    try {
      const response = await getLeaderboard(
        this.selectedDifficulty,
        10,
        this.selectedCharFilter ?? undefined,
        this.viewingYearMonth ?? undefined
      );

      if (requestId !== this.currentRequestId) return;

      this.leaderboardData = response.leaderboard;

      // 시즌 텍스트 갱신 — viewingYearMonth 우선 (response는 항상 현재 달 반환)
      if (this.seasonText) {
        const displayYM = this.viewingYearMonth ?? response.yearMonth;
        if (displayYM) {
          const [y, m] = displayYM.split('-');
          const isCurrentSeason = this.viewingYearMonth === null;
          if (isCurrentSeason) {
            const daysLeft = this.calcDaysUntilMonthEnd();
            this.seasonText.setText(`${y}년 ${parseInt(m)}월 시즌  |  시즌 종료까지 D-${daysLeft}`);
          } else {
            this.seasonText.setText(`${y}년 ${parseInt(m)}월 시즌  |  종료된 시즌`);
          }
        }
      }

      // 화살표 활성/비활성 업데이트
      this.updateArrowStates();

      // 직전 달 보상 상태 결정 (localStorage 캐시 우선)
      if (response.yearMonth) {
        const [y, m] = response.yearMonth.split('-').map(Number) as [number, number];
        const prevDate = new Date(Date.UTC(y, m - 2, 1));
        const prevYM = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;

        if (this.selectedCharFilter !== null) {
          const cached = getCachedCharClaimAmount(prevYM, this.selectedCharFilter);
          if (cached !== null) {
            this.prevSeasonReward = {
              yearMonth: prevYM,
              rank: response.prevSeasonReward?.rank ?? null,
              skorAwarded: cached,
              alreadyClaimed: true,
            };
          } else {
            this.prevSeasonReward = response.prevSeasonReward;
          }
        } else {
          const cached = getCachedClaimAmount(prevYM, this.selectedDifficulty);
          if (cached !== null) {
            this.prevSeasonReward = {
              yearMonth: prevYM,
              rank: response.prevSeasonReward?.rank ?? null,
              skorAwarded: cached,
              alreadyClaimed: true,
            };
          } else {
            this.prevSeasonReward = response.prevSeasonReward;
          }
        }
      } else {
        this.prevSeasonReward = null;
      }

      if (this.loadingText) {
        this.loadingText.setVisible(false);
      }

      this.displayLeaderboard();
      this.updateCharFilterRow();
      this.updateRewardUI();
    } catch (error) {
      // 에러가 발생했을 때도 최신 요청인지 확인
      if (requestId !== this.currentRequestId) {
        // 이미 새로운 요청이 시작됨 - 이 에러는 무시
        return;
      }

      console.error('Failed to load leaderboard:', error);

      if (this.loadingText) {
        this.loadingText.setVisible(false);
      }

      this.errorText = this.add.text(this.scale.width / 2, this.scale.height / 2, '랭킹을 불러올 수 없습니다\n\n나중에 다시 시도해주세요', {
        fontSize: '16px',
        color: '#ff6666',
        stroke: '#000',
        strokeThickness: 3,
        align: 'center'
      }).setOrigin(0.5);
    }
  }

  private displayLeaderboard() {
    const W = this.scale.width;
    const H = this.scale.height;
    const yOff = (H - 600) / 2;
    const startY = (this.selectedDifficulty === DifficultyEnum.EXTREME ? 170 : 130) + yOff;
    const ROW_H = 36;
    // 버튼 영역 상단 기준으로 표시 가능한 최대 행 수 계산
    const BUTTON_TOP = H - 62;
    const HEADER_H = 38;
    const maxRows = Math.floor((BUTTON_TOP - startY - HEADER_H) / ROW_H);
    const displayData = this.leaderboardData.slice(0, maxRows);
    const PAD = 48;
    const ROW_W = W - PAD * 2;
    const LEFT = PAD;
    const CX = W / 2;

    // 컬럼 x 좌표 (모두 W 기준 비율 계산)
    // [순위 50px] [아이콘 44px] [← 이름 중앙 정렬 →] [점수 110px]
    const COL_RANK       = LEFT + 40;
    const COL_ICON       = LEFT + 72;
    const ICON_R         = LEFT + 89;
    const SCORE_L        = LEFT + ROW_W - 110;
    const COL_NAME       = (ICON_R + SCORE_L) / 2;
    const COL_SCORE      = LEFT + ROW_W - 6;

    // ── 헤더 ────────────────────────────────────────────
    const headerY = startY + 16;
    const headerStyle = {
      fontSize: '13px',
      color: '#aaddff',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    };
    this.leaderboardTexts.push(
      this.add.text(COL_RANK, headerY, '순위', headerStyle).setOrigin(1, 0.5),
      this.add.text(COL_NAME, headerY, '이름', headerStyle).setOrigin(0.5, 0.5),
      this.add.text(COL_SCORE, headerY, '점수', headerStyle).setOrigin(1, 0.5),
    );
    const divider = this.add.rectangle(CX, headerY + 11, ROW_W, 1, 0xaaddff, 0.5);
    this.leaderboardTexts.push(divider);

    // ── 데이터 없음 ──────────────────────────────────────
    if (this.leaderboardData.length === 0) {
      const noDataText = this.add.text(
        CX, startY + 80,
        '아직 랭킹이 없습니다\n\n첫 번째 플레이어가 되어보세요!',
        { fontSize: '18px', color: '#ccc', stroke: '#000', strokeThickness: 3, align: 'center' }
      ).setOrigin(0.5);
      this.leaderboardTexts.push(noDataText);
      return;
    }

    // ── 각 행 ────────────────────────────────────────────
    displayData.forEach((entry, index) => {
      const rowY = startY + HEADER_H + index * ROW_H;
      const cy = rowY + ROW_H / 2;

      // 행 배경
      const bgColor =
        entry.rank === 1 ? 0x4a3a00 :
        entry.rank === 2 ? 0x2a2a35 :
        entry.rank === 3 ? 0x3a2010 :
        index % 2 === 0  ? 0x0a0a18 : 0x121220;
      const bgAlpha = entry.rank <= 3 ? 0.85 : 0.55;
      const bg = this.add.rectangle(CX, cy, ROW_W, ROW_H - 2, bgColor, bgAlpha);
      this.leaderboardTexts.push(bg);

      // 상위 3위 왼쪽 테두리 강조
      if (entry.rank <= 3) {
        const accentColor = entry.rank === 1 ? 0xFFD700 : entry.rank === 2 ? 0xC0C0C0 : 0xCD7F32;
        const accent = this.add.rectangle(LEFT + 1, cy, 3, ROW_H - 2, accentColor, 1);
        this.leaderboardTexts.push(accent);
      }

      // 순위 색상
      const rankColor =
        entry.rank === 1 ? '#FFD700' :
        entry.rank === 2 ? '#C0C0C0' :
        entry.rank === 3 ? '#CD7F32' : '#aaaaaa';

      // 순위 (숫자만)
      this.leaderboardTexts.push(
        this.add.text(COL_RANK, cy, `${entry.rank}`, {
          fontSize: '15px',
          color: rankColor,
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3,
        }).setOrigin(1, 0.5)
      );

      // 캐릭터 아이콘
      const charDef = CHARACTERS.find(c => c.id === (entry.characterType ?? 'chibi')) ?? CHARACTERS[0];
      this.leaderboardTexts.push(
        this.add.image(COL_ICON, cy, charDef.imageKey).setDisplaySize(30, 30).setOrigin(0.5)
      );

      // 이름
      this.leaderboardTexts.push(
        this.add.text(COL_NAME, cy, entry.userName, {
          fontSize: '15px',
          color: entry.rank <= 3 ? '#ffffff' : '#dddddd',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3,
        }).setOrigin(0.5, 0.5)
      );

      // 점수
      this.leaderboardTexts.push(
        this.add.text(COL_SCORE, cy, entry.score.toLocaleString(), {
          fontSize: '15px',
          color: entry.rank <= 3 ? rankColor : '#ffffff',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3,
        }).setOrigin(1, 0.5)
      );
    });
  }

  /** EXTREME 선택 시 캐릭터 필터 드롭다운 버튼 렌더 */
  private updateCharFilterRow() {
    this.charFilterObjects.forEach(o => o.destroy());
    this.charFilterObjects = [];

    if (this.selectedDifficulty !== DifficultyEnum.EXTREME) return;

    const W = this.scale.width;
    const yOff = (this.scale.height - 600) / 2;
    const cy = 145 + yOff;
    const cx = W / 2;

    const selectedName = this.selectedCharFilter === null
      ? '전체'
      : (CHARACTERS.find(c => c.id === this.selectedCharFilter)?.name ?? this.selectedCharFilter);
    const label = `👤 ${selectedName}  ▼`;

    const btn = this.add.rectangle(cx, cy, 180, 28, 0x1a1a3a, 1);
    btn.setStrokeStyle(2, 0x5566aa);
    const txt = this.add.text(cx, cy, label, {
      fontSize: '12px', color: '#aaccff', fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setFillStyle(0x2a2a5a));
    btn.on('pointerout',  () => btn.setFillStyle(0x1a1a3a));
    btn.on('pointerdown', () => this.showCharSelectOverlay());

    this.charFilterObjects.push(btn, txt);
  }

  /** 캐릭터 선택 오버레이 표시 (일러스트 포트레이트 카드, 스크롤 가능) */
  private showCharSelectOverlay() {
    if (this.charOverlayObjects.length > 0) return;

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const yOff = (H - 600) / 2;
    const DEPTH = 500;

    // 반투명 배경 (이벤트 흡수)
    const bg = this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.92)
      .setDepth(DEPTH).setInteractive();
    this.charOverlayObjects.push(bg);

    // 타이틀
    this.charOverlayObjects.push(
      this.add.text(cx, 38 + yOff, '캐릭터 선택', {
        fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(DEPTH + 1)
    );

    // 오버레이가 열린 시각을 기록해 200ms 이내 pointerup은 모두 무시한다.
    // (드롭다운 pointerdown → 오버레이 생성 → 같은 손가락 pointerup이 카드·버튼에 전달되는 고스트 클릭 방지)
    // Phaser 이벤트 순서에 의존하는 readyForInput 패턴을 대체한다.
    const openedAt = Date.now();
    const OPEN_DEBOUNCE = 200;

    const scroll = { y: 0, startY: 0, startScrollY: 0, active: false, hasDragged: false };

    // "전체 랭킹" 버튼
    const allSel = this.selectedCharFilter === null;
    const allBg = this.add.rectangle(cx, 68 + yOff, 160, 30,
      allSel ? 0x334488 : 0x222233, 1).setDepth(DEPTH + 1);
    allBg.setStrokeStyle(2, allSel ? 0xaaccff : 0x444466);
    const allTxt = this.add.text(cx, 68 + yOff, '전체 랭킹', {
      fontSize: '13px', color: allSel ? '#ffffff' : '#8899bb', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH + 2);
    allBg.setInteractive({ useHandCursor: true });
    allBg.on('pointerup', () => {
      if (Date.now() - openedAt < OPEN_DEBOUNCE || scroll.hasDragged) return;
      this.hideCharSelectOverlay();
      if (this.selectedCharFilter !== null) {
        this.selectedCharFilter = null;
        this.loadLeaderboard();
      }
    });
    this.charOverlayObjects.push(allBg, allTxt);

    // 닫기 버튼 (하단 고정) — 스크롤 영역 밖이므로 hasDragged 체크 불필요
    const closeY = H - 24;
    const closeBg = this.add.rectangle(cx, closeY, 100, 30, 0x333333, 1)
      .setDepth(DEPTH + 3).setStrokeStyle(2, 0x666666);
    const closeTxt = this.add.text(cx, closeY, '✕ 닫기', {
      fontSize: '13px', color: '#cccccc', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(DEPTH + 4);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerup', () => {
      if (Date.now() - openedAt < OPEN_DEBOUNCE) return;
      this.hideCharSelectOverlay();
    });
    this.charOverlayObjects.push(closeBg, closeTxt);

    // 스크롤 영역 정의
    const SCROLL_TOP = 90 + yOff;
    const SCROLL_BOTTOM = H - 46;
    const scrollAreaH = SCROLL_BOTTOM - SCROLL_TOP;

    // 카드 크기 (4열 포트레이트)
    const COLS = 4;
    const CELL_W = 90;
    const CELL_H = 112;
    const CARD_W = 84;
    const CARD_H = 106;
    const gridLeft = (W - COLS * CELL_W) / 2; // = 20px

    const ROWS = Math.ceil(CHARACTERS.length / COLS);
    const totalGridH = ROWS * CELL_H;
    const maxScroll = Math.max(0, totalGridH - scrollAreaH);

    // GeometryMask — 스크롤 뷰포트 클리핑
    const maskGfx = this.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(0, SCROLL_TOP, W, scrollAreaH);
    const mask = maskGfx.createGeometryMask();
    this.charOverlayObjects.push(maskGfx);

    // 카드 컨테이너 (container.y = -scroll.y 로 스크롤)
    const cardContainer = this.add.container(0, 0).setDepth(DEPTH + 1);
    cardContainer.setMask(mask);
    this.charOverlayObjects.push(cardContainer);

    const gradeColor: Record<string, number> = {
      '등급외': 0x888888, R: 0x4488ff, SR: 0xcc55ff, UR: 0xffcc00,
    };

    CHARACTERS.forEach((char, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const lx = gridLeft + col * CELL_W + CELL_W / 2;
      const ly = SCROLL_TOP + row * CELL_H + CELL_H / 2;
      const isSel = this.selectedCharFilter === char.id;

      // 카드 배경
      const cardBg = this.add.rectangle(lx, ly, CARD_W, CARD_H, 0x0a0a18, 1);
      cardBg.setStrokeStyle(isSel ? 3 : 1, isSel ? 0xaaccff : 0x222240);

      // 일러스트 이미지 (카드 꽉 채움)
      const illust = this.add.image(lx, ly, char.illustKey)
        .setDisplaySize(CARD_W, CARD_H).setOrigin(0.5);
      if (!isSel) illust.setAlpha(0.75);

      // 하단 그라디언트 (이름 가독성)
      const grad = this.add.graphics();
      grad.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.88, 0.88);
      grad.fillRect(lx - CARD_W / 2, ly + CARD_H / 2 - 30, CARD_W, 30);

      // 이름 텍스트
      const nameTxt = this.add.text(lx, ly + CARD_H / 2 - 5, char.name, {
        fontSize: '9px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 1);

      // 등급 뱃지 (우상단 원)
      const dot = this.add.circle(
        lx + CARD_W / 2 - 8, ly - CARD_H / 2 + 8,
        5, gradeColor[char.grade] ?? 0x888888, 1
      );

      // 선택 시 하이라이트 오버레이
      if (isSel) {
        const sel = this.add.rectangle(lx, ly, CARD_W, CARD_H, 0x5588ff, 0.18);
        cardContainer.add(sel);
      }

      cardContainer.add([cardBg, illust, grad, nameTxt, dot]);

      cardBg.setInteractive({ useHandCursor: true });
      cardBg.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        if (Date.now() - openedAt < OPEN_DEBOUNCE || scroll.hasDragged) return;
        if (ptr.y < SCROLL_TOP || ptr.y > SCROLL_BOTTOM) return;
        this.hideCharSelectOverlay();
        if (this.selectedCharFilter !== char.id) {
          this.selectedCharFilter = char.id;
          this.loadLeaderboard();
        }
      });
    });

    // 씬 레벨 드래그 핸들러 (스크롤)
    const onDown = (ptr: Phaser.Input.Pointer) => {
      if (ptr.y < SCROLL_TOP || ptr.y > SCROLL_BOTTOM) return;
      scroll.startY = ptr.y;
      scroll.startScrollY = scroll.y;
      scroll.active = true;
      scroll.hasDragged = false;
    };
    const onMove = (ptr: Phaser.Input.Pointer) => {
      if (!scroll.active || !ptr.isDown) return;
      const delta = scroll.startY - ptr.y;
      if (Math.abs(delta) > 6) scroll.hasDragged = true;
      scroll.y = Math.max(0, Math.min(maxScroll, scroll.startScrollY + delta));
      cardContainer.y = -scroll.y;
    };
    const onUp = () => {
      scroll.active = false;
      scroll.hasDragged = false;
    };

    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);

    this.overlayCleanup = () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup', onUp);
    };
  }

  /** 캐릭터 선택 오버레이 숨김 */
  private hideCharSelectOverlay() {
    this.overlayCleanup?.();
    this.overlayCleanup = undefined;
    this.charOverlayObjects.forEach(o => o.destroy());
    this.charOverlayObjects = [];
    this.updateCharFilterRow();
  }

  /** 클라이언트 기준 현재 'YYYY-MM' */
  private getClientCurrentYM(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /** 시즌 탐색 (delta: -1 = 이전달, +1 = 다음달) */
  private navigateSeason(delta: number) {
    const currentYM = this.getClientCurrentYM();
    const viewingYM = this.viewingYearMonth ?? currentYM;
    const [y, m] = viewingYM.split('-').map(Number) as [number, number];
    const date = new Date(Date.UTC(y, m - 1 + delta, 1));
    const newYM = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

    if (newYM < '2026-01' || newYM > currentYM) return;

    this.viewingYearMonth = newYM === currentYM ? null : newYM;

    // 난이도 전환 시와 동일하게 캐릭터 필터 유지하고 리로드
    this.selectedCharFilter = null;
    this.charFilterObjects.forEach(o => o.destroy());
    this.charFilterObjects = [];

    this.loadLeaderboard();
  }

  /** 화살표 버튼 활성/비활성 색상 갱신 */
  private updateArrowStates() {
    const currentYM = this.getClientCurrentYM();
    const viewingYM = this.viewingYearMonth ?? currentYM;

    if (this.leftArrowBtn) {
      const canGoBack = viewingYM > '2026-01';
      this.leftArrowBtn.setColor(canGoBack ? '#aaddff' : '#444455');
    }
    if (this.rightArrowBtn) {
      const canGoForward = viewingYM < currentYM;
      this.rightArrowBtn.setColor(canGoForward ? '#aaddff' : '#444455');
    }
  }

  /** 이번 달 말일까지 남은 일수 */
  private calcDaysUntilMonthEnd(): number {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const diff = lastDay.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /** 보상수령 버튼 상태 갱신 */
  private updateRewardUI() {
    if (!this.rewardBtnBg || !this.rewardBtnLabel) return;

    const btn = this.rewardBtnBg;
    const label = this.rewardBtnLabel;

    // 과거 시즌 조회 중이면 보상 버튼 비활성
    if (this.viewingYearMonth !== null) {
      btn.removeAllListeners();
      btn.disableInteractive();
      btn.setFillStyle(0x333333).setStrokeStyle(3, 0x222222);
      label.setText('현재 시즌만').setColor('#555555');
      return;
    }

    const reward = this.prevSeasonReward;

    // 캐릭터 필터 활성: 캐릭터별 보상 UI
    if (this.selectedCharFilter !== null) {
      btn.removeAllListeners();
      btn.disableInteractive();

      if (!reward || reward.rank === null || reward.skorAwarded === 0) {
        btn.setFillStyle(0x555555).setStrokeStyle(3, 0x333333);
        label.setText('보상없음').setColor('#999999');
      } else if (reward.alreadyClaimed) {
        btn.setFillStyle(0x336633).setStrokeStyle(3, 0x224422);
        label.setText('수령완료').setColor('#88ff88');
      } else {
        btn.setFillStyle(0xffcc00).setStrokeStyle(3, 0xaa8800);
        label.setText('캐릭터 보상').setColor('#000000');
        btn.setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setFillStyle(0xffe566));
        btn.on('pointerout', () => btn.setFillStyle(0xffcc00));
        btn.on('pointerdown', () => this.handleClaimCharReward());
      }
      return;
    }

    btn.removeAllListeners();
    btn.disableInteractive();

    if (!reward || reward.rank === null || reward.skorAwarded === 0) {
      // 비활성: 기록 없음 또는 100위 밖
      btn.setFillStyle(0x555555).setStrokeStyle(3, 0x333333);
      label.setText('보상수령').setColor('#999999');

    } else if (reward.alreadyClaimed) {
      // 비활성: 수령 완료 (초록)
      btn.setFillStyle(0x336633).setStrokeStyle(3, 0x224422);
      label.setText('수령완료').setColor('#88ff88');

    } else {
      // 활성: 수령 가능 (노란색)
      btn.setFillStyle(0xffcc00).setStrokeStyle(3, 0xaa8800);
      label.setText('보상수령').setColor('#000000');
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setFillStyle(0xffe566));
      btn.on('pointerout', () => btn.setFillStyle(0xffcc00));
      btn.on('pointerdown', () => this.handleClaimReward());
    }
  }

  /** 보상받기 버튼 클릭 처리 */
  private async handleClaimReward() {
    if (!this.rewardBtnBg || !this.rewardBtnLabel) return;

    // 처리 중 표시 (중복 클릭 방지)
    this.rewardBtnBg.disableInteractive();
    this.rewardBtnLabel.setText('처리중...').setColor('#aaaaaa');

    try {
      const result = await claimSeasonReward(this.selectedDifficulty);

      if (result.success && (result.skorAwarded ?? 0) > 0) {
        if (this.prevSeasonReward) {
          this.prevSeasonReward = { ...this.prevSeasonReward, alreadyClaimed: true };
        }
        this.updateRewardUI();

        // 획득 플래시 연출
        const flashText = this.add.text(
          this.scale.width / 2, this.scale.height / 2 - 60,
          `+${result.skorAwarded} SKOR 획득!`, {
            fontSize: '24px',
            color: '#ffcc00',
            fontStyle: 'bold',
            stroke: '#000',
            strokeThickness: 5,
          }
        ).setOrigin(0.5);

        this.tweens.add({
          targets: flashText,
          alpha: { from: 1, to: 0 },
          y: flashText.y - 40,
          duration: 1500,
          ease: 'Cubic.easeOut',
          onComplete: () => flashText.destroy(),
        });
      } else {
        if (this.prevSeasonReward && result.alreadyClaimed) {
          this.prevSeasonReward = { ...this.prevSeasonReward, alreadyClaimed: true };
        }
        this.updateRewardUI();
      }
    } catch {
      // 실패 시 원래 상태로 복구
      this.updateRewardUI();
    }
  }

  /** 캐릭터 보상 버튼 클릭 처리 */
  private async handleClaimCharReward() {
    if (!this.rewardBtnBg || !this.rewardBtnLabel || !this.selectedCharFilter) return;

    this.rewardBtnBg.disableInteractive();
    this.rewardBtnLabel.setText('처리중...').setColor('#aaaaaa');

    try {
      const result = await claimCharacterReward(this.selectedCharFilter);

      if (result.success && (result.skorAwarded ?? 0) > 0) {
        if (this.prevSeasonReward) {
          this.prevSeasonReward = { ...this.prevSeasonReward, alreadyClaimed: true };
        }
        this.updateRewardUI();

        const flashText = this.add.text(
          this.scale.width / 2, this.scale.height / 2 - 60,
          `+${result.skorAwarded} SKOR 획득!`, {
            fontSize: '24px',
            color: '#ffcc00',
            fontStyle: 'bold',
            stroke: '#000',
            strokeThickness: 5,
          }
        ).setOrigin(0.5);

        this.tweens.add({
          targets: flashText,
          alpha: { from: 1, to: 0 },
          y: flashText.y - 40,
          duration: 1500,
          ease: 'Cubic.easeOut',
          onComplete: () => flashText.destroy(),
        });
      } else {
        if (this.prevSeasonReward && result.alreadyClaimed) {
          this.prevSeasonReward = { ...this.prevSeasonReward, alreadyClaimed: true };
        }
        this.updateRewardUI();
      }
    } catch {
      this.updateRewardUI();
    }
  }

  private createBackButton(cx: number, y: number) {
    const button = this.add.rectangle(cx, y, 150, 40, 0xffffff, 1);
    button.setStrokeStyle(3, 0x000000);

    const text = this.add.text(cx, y, '← 뒤로가기', {
      fontSize: '18px',
      color: '#000',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    button.setInteractive({ useHandCursor: true });

    const elements = [button, text];
    elements.forEach(element => {
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
