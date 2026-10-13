import Phaser from 'phaser';
import { Difficulty, Difficulty as DifficultyEnum } from '../types/GameMode';
import {
  getLeaderboard,
  claimSeasonReward,
  claimCharacterReward,
  getCachedClaimAmount,
  getCachedCharClaimAmount,
  getUserInitials,
  getExtremeCharSummary,
  type ExtremeCharSummaryResponse,
  type LeaderboardEntry,
  type PrevSeasonReward,
} from '../utils/leaderboard';
import { CHARACTERS, getVisibleCharacters, getOwnedCharacters, getGradeImgKey, type CharacterDef } from '../utils/character';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { bakeButton, bakeRoundedImage, clipToViewport, gradientText, setTouchInteractive, wireButton } from '../utils/buttonSkin';
import { DIFFICULTY_TIER, type Tier } from '../utils/difficultyTheme';

// ── 배치 (A안 — 시상대 + 목록 + 아래 고정 내 순위) ─────────────────────────
// 위 고정 영역(뒤로 · 제목 · 시즌 · 탭 · 캐릭터 필터)은 화면 위에 붙는다. 그 아래가 시상대와 목록
const TABS: Difficulty[] = [DifficultyEnum.NORMAL, DifficultyEnum.HARD, DifficultyEnum.EXTREME, DifficultyEnum.PHYSICAL];
const TAB_LABEL: Record<Difficulty, string> = {
  [DifficultyEnum.NORMAL]: 'NORMAL', [DifficultyEnum.HARD]: 'HARD',
  [DifficultyEnum.EXTREME]: 'EXTREME', [DifficultyEnum.PHYSICAL]: 'PHYSICAL',
};
const SEASON_Y = 104;
const TAB_Y = 146;
// 탭 아래 — 탭과 칩의 눌리는 영역(각 MIN_TOUCH 44)이 겹치지 않는 자리 (탭 146 + 22 = 168 ≤ 칩 190 - 22)
const FILTER_Y = 190;
/** 시상대 · 목록이 시작하는 y */
const CONTENT_TOP = 214;
/** 아래 내 순위 판 높이 · 판 가운데가 화면 아래에서 얼마나 위인지 */
const BAR_H = 66;
const BAR_FROM_BOTTOM = 46;
const ROW_H = 42;
/** 시상대 전체 높이 (왕관 ~ 1등 단 아래, 축소 1배 기준) — 화면이 낮으면 줄인다 */
const PODIUM_H = 270;
/** 메달 판 색 — 금 · 은 · 동 */
/** 캐릭터 선택 시트 (A안) 색 */
const SHEET = { bg: 0x120a24, line: 0x3a2f6a, dim: '#a99fd0', gold: '#ffd34d', goldInt: 0xffd34d };
/** 캐릭터 선택 시트를 열 때 캐릭터별 요약(내 순위 · 보상권)을 기다리는 최대 시간 — 넘으면 그 줄 없이 연다 */
const SUMMARY_WAIT_MS = 1500;
/** 캐릭터 선택 시트의 칸 순서 — 높은 등급부터 */
const GRADE_ORDER: CharacterDef['grade'][] = ['UR', 'SR', 'R', '등급외'];
const MEDAL: Record<number, Tier> = {
  1: ['#fff3a8', '#ffc21a', '#7a4a00'],
  2: ['#f4f7fb', '#b8c2cf', '#3a4450'],
  3: ['#ffd2a8', '#c8763a', '#4a2408'],
};

export default class LeaderboardScene extends BaseScene {
  private selectedDifficulty: Difficulty = DifficultyEnum.NORMAL;
  private leaderboardData: LeaderboardEntry[] = [];
  private leaderboardTexts: Phaser.GameObjects.GameObject[] = [];
  private loadingText?: Phaser.GameObjects.Text;
  private errorText?: Phaser.GameObjects.Text;
  private currentRequestId: number = 0;
  /** 난이도 탭 — 고른 탭(on)과 안 고른 탭(off)을 둘 다 만들어 두고 보이기만 바꾼다 */
  private difficultyTabs = new Map<Difficulty, { on: Phaser.GameObjects.Container; off: Phaser.GameObjects.Container }>();

  // EXTREME 캐릭터 필터
  private selectedCharFilter: string | null = null;
  private charFilterObjects: Phaser.GameObjects.GameObject[] = [];
  private charOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private charOverlayLoading = false;
  /** 시트 열기 차례 — 씬을 다시 열면 올린다. 늦게 온 썸네일 · 요약이 다음 실행에 시트를 띄우지 않게 */
  private overlayOpenSeq = 0;
  private overlayCleanup?: () => void;

  // 시즌 UI 요소
  private seasonText?: Phaser.GameObjects.Text;
  private seasonBadge?: Phaser.GameObjects.Graphics;
  private seasonBadgeText?: Phaser.GameObjects.Text;
  private prevSeasonReward: PrevSeasonReward | null = null;
  private viewingYearMonth: string | null = null; // null = 현재 시즌
  private leftArrowBtn?: Phaser.GameObjects.Text;
  private rightArrowBtn?: Phaser.GameObjects.Text;

  /** 응답의 내 순위 (보고 있는 시즌 · 난이도 · 캐릭터 필터 기준) */
  private myRank: { rank: number; score: number } | null = null;
  /** 한 번 받으려 한 카드·얼굴 그림 — 파일이 없는 캐릭터(새로 들어온 캐릭터)를 다시 받지 않는다 */
  private triedTextures = new Set<string>();

  // 보상수령 버튼 (create에서 1회 생성, updateRewardUI에서 상태 변경) — 아래 내 순위 판 오른쪽
  private rewardBtnG?: Phaser.GameObjects.Graphics;
  private rewardBtnHit?: Phaser.GameObjects.Zone;
  private rewardBtnLabel?: Phaser.GameObjects.Text;
  private rewardBtnRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    super('LeaderboardScene');
  }

  init() {
    const last = localStorage.getItem('lastPlayedDifficulty') as Difficulty | null;
    if (last) {
      this.selectedDifficulty = last;
    }
    this.viewingYearMonth = null;
    // 씬 인스턴스 재사용 대비 stale 상태 리셋 (로딩 중 이탈 시 오버레이가 영영 안 열리는 것 방지)
    this.charOverlayObjects = [];
    this.charOverlayLoading = false;
    this.overlayOpenSeq++;
    this.leaderboardTexts = [];
    this.charFilterObjects = [];
    this.difficultyTabs.clear();
    this.myRank = null;
    this.triedTextures.clear();
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    // 캐릭터 스프라이트 — 카드·얼굴 그림이 없는 캐릭터의 대신 그림
    // 시상대 카드(ui/collection/card)와 목록 얼굴(ui/collection/face)은 랭킹이 오면 보이는 캐릭터 것만 받는다.
    // EXTREME 캐릭터 고르기 시트는 시상대와 같은 카드 썸네일(rank_cardsrc_*)과 등급 배지를 showCharSelectOverlay()에서 온디맨드 로드
    CHARACTERS.forEach(char => {
      if (!this.textures.exists(char.imageKey)) {
        this.load.image(char.imageKey, char.imagePath);
      }
    });
  }

  create() {
    super.create();

    this.events.once('shutdown', () => {
      this.overlayCleanup?.();
      this.overlayCleanup = undefined;
      // 열려 있던 시트 — 화면 목록의 것은 DisplayList 가 이미 부쉈지만, 목록 밖에서 만든 마스크 그래픽은 여기서 부숴야 한다
      // (destroy 는 이미 부서진 것에는 아무것도 안 한다)
      this.charOverlayObjects.forEach(o => o.destroy());
      this.charOverlayObjects = [];
      this.cancelCharSelectOpen();
      // 카드 썸네일(시상대 · 캐릭터 고르기)은 이 씬에서만 쓴다 — 나갈 때 내린다.
      // DisplayList 의 SHUTDOWN 리스너가 부팅 때 걸려 먼저 돌아서, 여기 올 때는 이 그림을 쓰던 이미지가 이미 다 부서져 있다
      for (const key of this.textures.getTextureKeys()) {
        if (key.startsWith('rank_cardsrc_') || key.startsWith('rank_card_')) this.textures.remove(key);
      }
    });

    const { W, H, cx } = this.getScaleInfo();

    addBackground(this, 'background2', W, H);
    this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.2);

    // 뒤로 — 왼쪽 위 둥근 버튼 (난이도 화면과 같다)
    this.createBackButton(32, 32);

    // 제목 — 메뉴 · 난이도 화면과 같은 나무 판 + 금빛 글자
    const tw = Math.min(220, W - 140);
    const plaque = this.add.container(cx, 56);
    const title = bakeButton(this, `rank_title_${tw}`, {
      w: tw, h: 52, radius: 16, top: '#c98a4a', bottom: '#8a5226', border: '#3a1f0a', borderW: 3,
      lip: '#5b3416', lipH: 5, gloss: 0,
    });
    plaque.add(this.add.image(0, 0, title.key).setOrigin(0.5, title.originY));
    const titleText = this.add.text(0, 0, '랭킹', {
      fontSize: '26px', fontStyle: 'bold', stroke: '#3a1f0a', strokeThickness: 8,
    }).setOrigin(0.5);
    gradientText(titleText, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    plaque.add(titleText);

    // 시즌 줄 (‹ 2026년 10월 시즌 D-25 ›)
    this.createSeasonBar(cx, SEASON_Y, Math.min(270, W - 40));

    // 난이도 탭
    this.createDifficultyButtons();

    // 랭킹 표시 영역 (초기 로딩)
    this.loadingText = this.add.text(cx, (CONTENT_TOP + H - BAR_FROM_BOTTOM - BAR_H / 2) / 2, '로딩 중...', {
      fontSize: '20px',
      color: '#fff',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5);

    // 아래 고정 — 내 순위 + 보상수령
    this.createMyRankBar();

    // 초기 데이터 로드
    this.loadLeaderboard();
  }

  /** 시즌 줄 — 어두운 알약 위에 ‹ 시즌 이름 · D-day 뱃지 › */
  private createSeasonBar(x: number, y: number, w: number) {
    const g = this.add.graphics();
    g.fillStyle(0x0a0814, 0.75).fillRoundedRect(x - w / 2, y - 15, w, 30, 15);
    g.lineStyle(1.5, 0xffd34d).strokeRoundedRect(x - w / 2, y - 15, w, 30, 15);

    const arrowStyle = { fontSize: '24px', color: '#ffd34d', fontStyle: 'bold' };
    // 화살표: 글자 + 투명 히트박스
    this.leftArrowBtn = this.add.text(x - w / 2 + 18, y - 2, '‹', arrowStyle).setOrigin(0.5);
    setTouchInteractive(this.add.rectangle(x - w / 2 + 18, y, 44, 36, 0xffffff, 0))
      .on('pointerdown', () => this.navigateSeason(-1));
    this.rightArrowBtn = this.add.text(x + w / 2 - 18, y - 2, '›', arrowStyle).setOrigin(0.5);
    setTouchInteractive(this.add.rectangle(x + w / 2 - 18, y, 44, 36, 0xffffff, 0))
      .on('pointerdown', () => this.navigateSeason(1));

    this.seasonText = this.add.text(x + 2, y, '', {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(1, 0.5);
    this.seasonBadge = this.add.graphics();
    this.seasonBadgeText = this.add.text(x + 42, y, '', {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  /** 시즌 이름 · 뱃지 갱신. 지금 시즌이면 빨간 D-day, 지난 시즌이면 회색 '종료' */
  private updateSeasonLabel(yearMonth: string, isCurrentSeason: boolean) {
    if (!this.seasonText || !this.seasonBadge || !this.seasonBadgeText) return;
    const [y, m] = yearMonth.split('-');
    this.seasonText.setText(`${y}년 ${parseInt(m)}월 시즌`);
    const bx = this.seasonBadgeText.x, by = this.seasonBadgeText.y;
    this.seasonBadge.clear()
      .fillStyle(isCurrentSeason ? 0xe8261a : 0x5a6575)
      .fillRoundedRect(bx - 32, by - 10, 64, 20, 10);
    this.seasonBadgeText.setText(isCurrentSeason ? `D-${this.calcDaysUntilMonthEnd()}` : '종료');
  }

  /** 난이도 탭 — 난이도 선택 카드와 같은 색. 고른 탭만 색이 차고 솟는다 */
  private createDifficultyButtons() {
    const { W } = this.getScaleInfo();
    const gap = 6;
    const tw = Math.floor((W - 32 - gap * 3) / 4);

    TABS.forEach((difficulty, i) => {
      const x = 16 + tw / 2 + i * (tw + gap);
      const [top, mid, ink] = DIFFICULTY_TIER[difficulty];

      const on = this.add.container(x, TAB_Y - 2);
      const onSkin = bakeButton(this, `rank_tab_on_${difficulty}_${tw}`, {
        w: tw, h: 34, radius: 12, top, bottom: mid, border: ink, borderW: 3, lip: ink, lipH: 4, gloss: 0,
      });
      on.add(this.add.image(0, 0, onSkin.key).setOrigin(0.5, onSkin.originY));
      on.add(this.add.text(0, -1, TAB_LABEL[difficulty], {
        fontSize: '12px', color: '#ffffff', fontStyle: 'bold', stroke: ink, strokeThickness: 5,
      }).setOrigin(0.5));

      const off = this.add.container(x, TAB_Y);
      const offSkin = bakeButton(this, `rank_tab_off_${tw}`, {
        w: tw, h: 30, radius: 12, top: '#fffaf0', bottom: '#e8dcc6', border: '#6a5a48', borderW: 2,
        lip: '#b5a68e', lipH: 3, gloss: 0,
      });
      off.add(this.add.image(0, 0, offSkin.key).setOrigin(0.5, offSkin.originY));
      off.add(this.add.text(0, -1, TAB_LABEL[difficulty], {
        fontSize: '11px', color: '#6a5a48', fontStyle: 'bold',
      }).setOrigin(0.5));
      wireButton(this, off, tw, 30, () => this.selectDifficulty(difficulty), true);

      this.difficultyTabs.set(difficulty, { on, off });
    });
    this.refreshTabs();
  }

  private refreshTabs() {
    this.difficultyTabs.forEach(({ on, off }, difficulty) => {
      const selected = difficulty === this.selectedDifficulty;
      on.setVisible(selected);
      off.setVisible(!selected).setScale(1);
    });
  }

  private selectDifficulty(difficulty: Difficulty) {
    if (this.selectedDifficulty === difficulty) return;

    this.selectedDifficulty = difficulty;

    // 난이도 전환 시 캐릭터 필터 초기화
    this.selectedCharFilter = null;
    this.charFilterObjects.forEach(o => o.destroy());
    this.charFilterObjects = [];

    this.refreshTabs();

    this.loadLeaderboard();
  }

  /** 아래 고정 판 — 왼쪽 내 순위(displayLeaderboard 가 채운다), 오른쪽 보상수령 */
  private createMyRankBar() {
    const { W, H, cx } = this.getScaleInfo();
    const bw = W - 24;
    const y = H - BAR_FROM_BOTTOM;
    const bar = bakeButton(this, `rank_bar_${bw}`, {
      w: bw, h: BAR_H, radius: 18, top: '#3ddbb3', bottom: '#0f7f78', border: '#0a3d3a', borderW: 3,
      lip: '#0a5a55', lipH: 6, gloss: 0,
    });
    this.add.image(cx, y, bar.key).setOrigin(0.5, bar.originY);

    const rw = 108, rh = 40;
    this.rewardBtnRect = { x: cx + bw / 2 - 14 - rw / 2, y, w: rw, h: rh };
    this.rewardBtnG = this.add.graphics();
    this.rewardBtnHit = this.add.zone(this.rewardBtnRect.x, y, rw, rh);
    this.rewardBtnLabel = this.add.text(this.rewardBtnRect.x, y, '보상수령', {
      fontSize: '15px', color: '#c7ced8', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.paintRewardButton(0x5a6575, 0x3a4450, '보상수령', '#c7ced8');
  }

  private async loadLeaderboard() {
    // 난이도 · 시즌 · 캐릭터 필터가 바뀌었다 — 받는 중인 시트 열기는 이전 화면의 것이라 버린다
    this.cancelCharSelectOpen();
    // 요청 ID 증가 (새로운 요청 시작)
    this.currentRequestId++;
    const requestId = this.currentRequestId;

    // 기존 랭킹 텍스트 제거
    this.leaderboardTexts.forEach(text => text.destroy());
    this.leaderboardTexts = [];
    this.prevSeasonReward = null;
    this.myRank = null;

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
      this.myRank = response.currentUserRank ?? null;

      // 시즌 이름 갱신 — viewingYearMonth 우선 (response는 항상 현재 달 반환)
      const displayYM = this.viewingYearMonth ?? response.yearMonth;
      if (displayYM) this.updateSeasonLabel(displayYM, this.viewingYearMonth === null);

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

  /** 랭킹 줄의 캐릭터 정의 — 모르는 id 는 첫 캐릭터로 */
  private charOf(entry: LeaderboardEntry): CharacterDef {
    return CHARACTERS.find(c => c.id === (entry.characterType ?? 'chibi')) ?? CHARACTERS[0];
  }

  /**
   * 시상대(1~3위) + 목록(4위부터) + 아래 내 순위. 다시 부르면 처음부터 다시 그린다.
   * 카드·얼굴 그림이 아직 없으면 보이는 캐릭터 것만 받고, 다 받은 뒤 다시 그린다
   */
  private displayLeaderboard() {
    this.leaderboardTexts.forEach(o => o.destroy());
    this.leaderboardTexts = [];

    const { W, H, cx } = this.getScaleInfo();
    const data = this.leaderboardData;
    const bottom = H - BAR_FROM_BOTTOM - BAR_H / 2 - 12;

    // 화면이 낮으면 시상대를 줄여 목록 자리를 낸다 (5줄 몫을 남기고, 시상대는 0.6배까지만)
    const k = Phaser.Math.Clamp((bottom - CONTENT_TOP - 5 * ROW_H - 12) / PODIUM_H, 0.6, 1);
    const base = CONTENT_TOP + Math.round(22 * k) + Math.round(142 * k) + 34;   // 단 윗면 = 카드 아래 + 이름 자리
    const rowsTop = base + Math.round(76 * k) + 12;
    const maxRows = Math.max(0, Math.floor((bottom - rowsTop) / ROW_H));
    const podium = data.slice(0, 3);
    const rest = data.slice(3, 3 + maxRows);

    // ── 필요한 그림 받기 ─────────────────────────────────
    const want = new Map<string, string>();
    podium.forEach(e => { const id = this.charOf(e).id; want.set(`rank_cardsrc_${id}`, `assets/ui/collection/card/${id}.webp`); });
    rest.forEach(e => { const id = this.charOf(e).id; want.set(`rank_facesrc_${id}`, `assets/ui/collection/face/${id}.webp`); });
    const missing = [...want].filter(([key]) => !this.textures.exists(key) && !this.triedTextures.has(key));
    if (missing.length > 0) {
      const requestId = this.currentRequestId;
      this.loadingText?.setVisible(true);
      missing.forEach(([key, path]) => { this.triedTextures.add(key); this.load.image(key, path); });
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (!this.scene.isActive() || requestId !== this.currentRequestId) return;
        this.loadingText?.setVisible(false);
        this.displayLeaderboard();
      });
      this.load.start();
      return;
    }

    this.renderMyRank();

    // ── 데이터 없음 ──────────────────────────────────────
    if (data.length === 0) {
      this.leaderboardTexts.push(this.add.text(cx, (CONTENT_TOP + bottom) / 2,
        '아직 랭킹이 없습니다\n\n첫 번째 플레이어가 되어보세요!',
        { fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 4, align: 'center', fontStyle: 'bold' }
      ).setOrigin(0.5));
      return;
    }

    // ── 시상대 — 2 · 1 · 3 ───────────────────────────────
    const slots: [number, number][] = [[1, -1], [0, 0], [2, 1]];   // [순서, 왼쪽(-1)·가운데·오른쪽]
    for (const [idx, dir] of slots) {
      const place = idx + 1;
      const big = idx === 0;
      const [mt, mm, mi] = MEDAL[place];
      const cw = Math.round((big ? 108 : 92) * k), ch = Math.round((big ? 142 : 120) * k);
      const ph = Math.round([76, 52, 38][idx] * k);
      // 옆 단 사이 6px — 1등 단 반폭 + 2·3등 단 반폭 + 틈 (카드가 줄면 같이 좁힌다)
      const x = cx + dir * Math.round(100 * k + 20);
      const entry = podium[idx];

      // 단
      const step = bakeButton(this, `rank_step_${place}_${cw + 14}x${ph}`, {
        w: cw + 14, h: ph, radius: 8, top: mt, bottom: mm, border: mi, borderW: 3, lip: mi, lipH: 5, gloss: 0,
      });
      this.leaderboardTexts.push(
        this.add.image(x, base + ph / 2, step.key).setOrigin(0.5, step.originY),
        this.add.text(x, base + ph / 2 - 2, String(entry?.rank ?? place), {
          fontSize: big ? '26px' : '22px', color: '#ffffff', fontStyle: 'bold', stroke: mi, strokeThickness: 6,
        }).setOrigin(0.5),
      );

      // 카드 — 메달 색 테 + 일러스트 카드 (1등만 빛난다)
      const cy = base - 34 - ch / 2;
      const frame = bakeButton(this, `rank_cardframe_${place}_${cw}x${ch}`, {
        w: cw, h: ch, radius: 14, top: mt, bottom: mm, border: mm, borderW: 3, lip: mi, lipH: 4, gloss: 0,
        glow: big ? 'rgba(255,200,80,0.85)' : undefined,
      });
      this.leaderboardTexts.push(this.add.image(x, cy, frame.key).setOrigin(0.5, frame.originY));

      if (entry) {
        const def = this.charOf(entry);
        const src = `rank_cardsrc_${def.id}`;
        if (this.textures.exists(src)) {
          const key = bakeRoundedImage(this, `rank_card_${def.id}_${cw - 6}x${ch - 6}`, src, cw - 6, ch - 6, 11, 0.2);
          this.leaderboardTexts.push(this.add.image(x, cy, key).setDisplaySize(cw - 6, ch - 6));
        } else if (this.textures.exists(def.imageKey)) {
          // 카드 그림이 없는 캐릭터 — 게임 스프라이트로 대신한다
          const img = this.add.image(x, cy, def.imageKey);
          img.setScale(Math.min((cw - 16) / img.width, (ch - 16) / img.height));
          this.leaderboardTexts.push(img);
        }
        this.leaderboardTexts.push(
          this.add.text(x, base - 24, entry.userName, {
            fontSize: '15px', color: '#ffffff', fontStyle: 'bold', stroke: mi, strokeThickness: 6,
          }).setOrigin(0.5),
          this.add.text(x, base - 8, entry.score.toLocaleString(), {
            fontSize: '12px', color: mt, fontStyle: 'bold', stroke: '#000', strokeThickness: 5,
          }).setOrigin(0.5),
        );
      } else {
        this.leaderboardTexts.push(this.add.text(x, cy, '—', {
          fontSize: '24px', color: mi, fontStyle: 'bold',
        }).setOrigin(0.5));
      }

      if (big) {
        this.leaderboardTexts.push(this.add.text(x, cy - ch / 2 - 6, '👑', { fontSize: `${Math.round(28 * k)}px` }).setOrigin(0.5));
      }
    }

    // ── 4위부터 ──────────────────────────────────────────
    const rowsG = this.add.graphics();
    this.leaderboardTexts.push(rowsG);
    let y = rowsTop + ROW_H / 2;
    for (const entry of rest) {
      rowsG.fillStyle(0xfffaf0, 0.93).fillRoundedRect(16, y - ROW_H / 2 + 3, W - 32, ROW_H - 6, 12);
      rowsG.lineStyle(1.5, 0xc9b89a).strokeRoundedRect(16, y - ROW_H / 2 + 3, W - 32, ROW_H - 6, 12);

      const def = this.charOf(entry);
      const src = `rank_facesrc_${def.id}`;
      if (this.textures.exists(src)) {
        const key = bakeRoundedImage(this, `rank_face_${def.id}_30`, src, 30, 30, 15);
        this.leaderboardTexts.push(this.add.image(74, y, key).setDisplaySize(30, 30));
      } else if (this.textures.exists(def.imageKey)) {
        const img = this.add.image(74, y, def.imageKey);
        img.setScale(Math.min(28 / img.width, 28 / img.height));
        this.leaderboardTexts.push(img);
      }
      rowsG.lineStyle(1.5, 0xc9b89a).strokeCircle(74, y, 15);

      const ink = { fontStyle: 'bold', color: '#3a2a1a' };
      this.leaderboardTexts.push(
        this.add.text(40, y, String(entry.rank), { ...ink, fontSize: '16px', color: '#7a6a58' }).setOrigin(0.5),
        this.add.text(98, y, entry.userName, { ...ink, fontSize: '15px' }).setOrigin(0, 0.5),
        this.add.text(W - 30, y, entry.score.toLocaleString(), { ...ink, fontSize: '15px' }).setOrigin(1, 0.5),
      );
      y += ROW_H;
    }
    // 화면에 못 실은 줄이 남았으면 이어진다는 표시
    if (data.length > 3 + rest.length) {
      this.leaderboardTexts.push(this.add.text(cx, y - ROW_H / 2 + 8, '· · ·', {
        fontSize: '14px', color: '#ffffff', fontStyle: 'bold', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5));
    }
  }

  /** 아래 판 왼쪽 — 내 순위 · 이니셜 · 점수 (응답의 currentUserRank) */
  private renderMyRank() {
    const { W, H } = this.getScaleInfo();
    const L = 12 + 16;
    const y = H - BAR_FROM_BOTTOM;
    const stroke = { stroke: '#0a3d3a', fontStyle: 'bold' };

    if (!this.myRank) {
      this.leaderboardTexts.push(
        this.add.text(L, y - 9, this.viewingYearMonth === null ? '이번 시즌 기록 없음' : '이 시즌 기록 없음', {
          ...stroke, fontSize: '15px', color: '#ffffff', strokeThickness: 4,
        }).setOrigin(0, 0.5),
        this.add.text(L, y + 13, '한 판 하면 여기에 내 순위가 떠요', {
          fontSize: '11px', color: '#d6fff4', fontStyle: 'bold',
        }).setOrigin(0, 0.5),
      );
      return;
    }

    const label = this.add.text(L, y - 19, '내 순위', { fontSize: '10px', color: '#d6fff4', fontStyle: 'bold' }).setOrigin(0, 0.5);
    const rank = this.add.text(L, y + 5, `${this.myRank.rank}위`, {
      ...stroke, fontSize: '24px', color: '#ffffff', strokeThickness: 6,
    }).setOrigin(0, 0.5);
    const rx = Math.min(L + rank.width + 14, W / 2);
    this.leaderboardTexts.push(
      label, rank,
      this.add.text(rx, y - 9, getUserInitials() ?? '나', {
        ...stroke, fontSize: '16px', color: '#ffffff', strokeThickness: 5,
      }).setOrigin(0, 0.5),
      this.add.text(rx, y + 13, `${this.myRank.score.toLocaleString()}점`, {
        ...stroke, fontSize: '14px', color: '#fff7c2', strokeThickness: 5,
      }).setOrigin(0, 0.5),
    );
  }

  /** EXTREME 선택 시 캐릭터 필터 칩 */
  private updateCharFilterRow() {
    this.charFilterObjects.forEach(o => o.destroy());
    this.charFilterObjects = [];

    if (this.selectedDifficulty !== DifficultyEnum.EXTREME) return;

    const { cx } = this.getScaleInfo();
    const selectedName = this.selectedCharFilter === null
      ? '전체'
      : (CHARACTERS.find(c => c.id === this.selectedCharFilter)?.name ?? this.selectedCharFilter);

    const w = 170, h = 26;
    const chip = this.add.container(cx, FILTER_Y);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(1.5, 0x2a3340).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    chip.add(g);
    chip.add(this.add.text(-6, 0, `캐릭터: ${selectedName}`, {
      fontSize: '12px', color: '#2a3340', fontStyle: 'bold',
    }).setOrigin(0.5));
    chip.add(this.add.text(w / 2 - 16, 0, '▼', { fontSize: '9px', color: '#2a3340' }).setOrigin(0.5));
    wireButton(this, chip, w, h, () => this.showCharSelectOverlay(), true);

    this.charFilterObjects.push(chip);
  }

  /**
   * 캐릭터 선택 시트 열기 — 카드 썸네일(ui/collection/card, 216x288)과 등급 배지는 이 시점에 온디맨드 로드.
   * 예전에는 일러스트 원본(768x1344) 26장을 올려 GPU 79MB 가 씬을 나가도 남았다 (2026-10-07 측정).
   * 캐릭터별 내 순위 · 보상권은 요약 한 번(getExtremeCharSummary)으로 같이 받는다 — 실패하거나 SUMMARY_WAIT_MS 를 넘기면 그 줄 없이 연다
   */
  private showCharSelectOverlay() {
    if (this.charOverlayObjects.length > 0 || this.charOverlayLoading) return;
    this.charOverlayLoading = true;
    const seq = ++this.overlayOpenSeq;
    const ym = this.viewingYearMonth;

    const summary = Promise.race([
      getExtremeCharSummary(ym ?? undefined).catch(() => null),
      new Promise<null>(resolve => setTimeout(() => resolve(null), SUMMARY_WAIT_MS)),
    ]);

    const textures = new Promise<void>(resolve => {
      const want: [string, string][] = getVisibleCharacters().map(c => [`rank_cardsrc_${c.id}`, `assets/ui/collection/card/${c.id}.webp`]);
      for (const g of ['ur', 'sr', 'r']) want.push([`grade_${g}`, `assets/character_ranks/${g}.png`]);
      const missing = want.filter(([key]) => !this.textures.exists(key) && !this.triedTextures.has(key));
      missing.forEach(([key, path]) => { this.triedTextures.add(key); this.load.image(key, path); });
      // 버려진 열기가 걸어 둔 받기가 아직 돌고 있으면 그것도 기다린다 (안 기다리면 그 카드만 게임 스프라이트로 열린다)
      const stillLoading = this.load.isLoading() && want.some(([key]) => !this.textures.exists(key));
      if (missing.length === 0 && !stillLoading) { resolve(); return; }
      this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      if (missing.length > 0) this.load.start();
    });

    void Promise.all([summary, textures]).then(([s]) => {
      // 기다리는 사이 난이도 · 시즌 · 필터가 바뀌었거나 씬이 닫혔으면 이 열기는 버려졌다 (cancelCharSelectOpen)
      if (seq !== this.overlayOpenSeq || !this.scene.isActive() || this.selectedDifficulty !== DifficultyEnum.EXTREME) return;
      this.charOverlayLoading = false;
      this.buildCharSelectOverlay(s);
    });
  }

  /** 받는 중인 시트 열기를 버린다 — 늦게 온 썸네일 · 요약이 다른 화면 위에 이전 시트를 띄우지 않게 */
  private cancelCharSelectOpen() {
    this.overlayOpenSeq++;
    this.charOverlayLoading = false;
  }

  /**
   * 캐릭터 선택 시트 (A안) — 화면을 덮고 UR · SR · R 칸으로 나눈다. 같은 등급 안에서는 보유 먼저, 미보유는 흐리게.
   * 자리는 실제 화면 높이 기준이다 (예전 오버레이는 600 높이 기준 yOff 로 띄웠고, 360 폭에서 카드가 화면 끝에 붙었다).
   * summary 가 있으면 카드 아래에 내 순위 줄 — 기록이 있으면 'N위', 이번 달 보상 자리면 'N위 · 보상권', 보유했는데 기록이 없으면 '기록 없음'.
   * summary 가 없으면(요청 실패 · 늦음) 그 줄을 통째로 뺀다 — 가짜 값이나 빈 칸을 띄우지 않는다
   */
  private buildCharSelectOverlay(summary: ExtremeCharSummaryResponse | null) {
    if (this.charOverlayObjects.length > 0) return;

    const { W, H, cx } = this.getScaleInfo();
    const DEPTH = 500;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.charOverlayObjects.push(o); return o; };

    // 시트 — 뒤 랭킹을 덮고 입력을 흡수한다
    keep(this.add.rectangle(cx, H / 2, W, H, SHEET.bg, 1).setDepth(DEPTH).setInteractive());

    // 오버레이가 열린 시각을 기록해 200ms 이내 입력은 모두 무시한다.
    // (칩 pointerdown → 시트 생성 → 같은 손가락 pointerup 이 카드·버튼에 전달되는 고스트 클릭 방지)
    const openedAt = Date.now();
    const OPEN_DEBOUNCE = 200;
    const fresh = () => Date.now() - openedAt < OPEN_DEBOUNCE;

    const scroll = { y: 0, startY: 0, startScrollY: 0, active: false, hasDragged: false };

    // 머리 — 제목 · 보는 시즌 · 닫기
    keep(this.add.text(16, 26, '캐릭터별 랭킹', { fontSize: '19px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0, 0.5).setDepth(DEPTH + 2));
    const season = this.seasonText?.text;
    keep(this.add.text(16, 48, season ? `EXTREME · ${season}` : 'EXTREME', { fontSize: '12px', color: SHEET.dim })
      .setOrigin(0, 0.5).setDepth(DEPTH + 2));

    const close = keep(this.add.container(W - 16 - 29, 30).setDepth(DEPTH + 2));
    const closeSkin = bakeButton(this, 'rank_sheet_close', {
      w: 58, h: 32, radius: 11, top: '#5a5478', bottom: '#38334f', border: '#17131f', borderW: 2, lip: '#17131f', lipH: 3, gloss: 0,
    });
    close.add(this.add.image(0, 0, closeSkin.key).setOrigin(0.5, closeSkin.originY));
    close.add(this.add.text(0, -1, '닫기', { fontSize: '14px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    wireButton(this, close, 58, 32, () => { if (!fresh()) this.hideCharSelectOverlay(); }, true);

    // "전체 랭킹" 줄 — 지금 보고 있으면 파란 판
    const allSel = this.selectedCharFilter === null;
    const rw = W - 24, ry = 90;
    const all = keep(this.add.container(cx, ry).setDepth(DEPTH + 2));
    const allSkin = bakeButton(this, `rank_sheet_all_${allSel ? 'on' : 'off'}_${rw}`, allSel
      ? { w: rw, h: 42, radius: 13, top: '#4f6ad6', bottom: '#2d3f9c', border: '#b3c8ff', borderW: 2, lip: '#1c2766', lipH: 4, gloss: 0 }
      : { w: rw, h: 42, radius: 13, top: '#2c2650', bottom: '#211c3d', border: '#4a4280', borderW: 2, lip: '#141029', lipH: 4, gloss: 0 });
    all.add(this.add.image(0, 0, allSkin.key).setOrigin(0.5, allSkin.originY));
    all.add(this.add.text(-rw / 2 + 16, -1, '전체 랭킹', { fontSize: '15px', fontStyle: 'bold', color: allSel ? '#ffffff' : '#c8c0e8' })
      .setOrigin(0, 0.5));
    if (allSel) all.add(this.add.text(rw / 2 - 16, -1, '보는 중', { fontSize: '12px', fontStyle: 'bold', color: SHEET.gold }).setOrigin(1, 0.5));
    wireButton(this, all, rw, 42, () => {
      if (fresh()) return;
      this.hideCharSelectOverlay();
      if (this.selectedCharFilter !== null) {
        this.selectedCharFilter = null;
        this.loadLeaderboard();
      }
    }, true);

    // 스크롤 창 — 전체 랭킹 줄 아래부터 화면 끝까지
    const SCROLL_TOP = ry + 32;
    const viewH = H - SCROLL_TOP;
    const scrollView = new Phaser.Geom.Rectangle(0, SCROLL_TOP, W, viewH);
    const maskGfx = keep(this.make.graphics({}, false));
    maskGfx.fillStyle(0xffffff).fillRect(0, SCROLL_TOP, W, viewH);
    const box = keep(this.add.container(0, 0).setDepth(DEPTH + 1));
    box.setMask(maskGfx.createGeometryMask());

    // 4열 — 좌우 여백 SIDE 를 두고 화면 폭에 맞춰 카드 폭을 정한다
    const COLS = 4, SIDE = 12, GAP = 8;
    const cw = Math.floor((W - SIDE * 2 - GAP * (COLS - 1)) / COLS);
    const ch = Math.round(cw * 1.18);
    const showRank = summary !== null;
    const rowH = ch + 30 + (showRank ? 20 : 0);   // 카드 + 이름 (+ 내 순위)
    const mine = new Map((summary?.characters ?? []).map(c => [c.characterType, c]));
    // 보상권은 이번 달만 — 지난 시즌의 rewardEligible 은 '그 달 지급 대상이었나'라 뜻이 다르다
    const isCurrent = this.viewingYearMonth === null;

    const owned = new Set(getOwnedCharacters());
    const visible = getVisibleCharacters();
    let y = SCROLL_TOP + 8;
    for (const grade of GRADE_ORDER) {
      // 같은 등급 안에서는 보유 먼저 (sort 는 안정 정렬 — 나머지는 등록 순 그대로)
      const list = visible.filter(c => c.grade === grade).sort((a, b) => Number(owned.has(b.id)) - Number(owned.has(a.id)));
      if (list.length === 0) continue;

      // 칸 머리 — 등급 배지 · 등급 · 인원 · 보유 수
      const hy = y + 12;
      const badge = getGradeImgKey(grade);
      let tx = SIDE;
      if (badge && this.textures.exists(badge)) {
        box.add(this.add.image(SIDE + 12, hy, badge).setDisplaySize(24, 24));
        tx = SIDE + 30;
      }
      const label = this.add.text(tx, hy, grade, { fontSize: '15px', fontStyle: 'bold', color: list[0].gradeColor }).setOrigin(0, 0.5);
      box.add([
        label,
        this.add.text(tx + label.width + 8, hy, `${list.length}명 · 보유 ${list.filter(c => owned.has(c.id)).length}`, {
          fontSize: '12px', color: SHEET.dim,
        }).setOrigin(0, 0.5),
        this.add.rectangle(SIDE, hy + 16, W - SIDE * 2, 1, SHEET.line).setOrigin(0, 0.5),
      ]);
      y += 34;

      list.forEach((char, i) => {
        const x = SIDE + (i % COLS) * (cw + GAP);
        const top = y + Math.floor(i / COLS) * rowH;
        const own = owned.has(char.id);
        const isSel = this.selectedCharFilter === char.id;

        const base = this.add.graphics();
        base.fillStyle(0x0a0a18, 1).fillRoundedRect(x, top, cw, ch, 10);
        box.add(base);

        // 카드 썸네일 (3:4 → 칸 비율에 맞게 위쪽을 살려 둥글게 굽는다). 없으면 게임 스프라이트
        const src = `rank_cardsrc_${char.id}`;
        let art: Phaser.GameObjects.Image;
        if (this.textures.exists(src)) {
          const key = bakeRoundedImage(this, `rank_card_${char.id}_${cw}x${ch}`, src, cw, ch, 10, 0.2);
          art = this.add.image(x, top, key).setOrigin(0).setDisplaySize(cw, ch);
        } else {
          art = this.add.image(x + cw / 2, top + ch / 2, char.imageKey);
          art.setScale(Math.min((cw - 16) / art.width, (ch - 16) / art.height));
        }
        if (!own) art.setTint(0x6a6680).setAlpha(0.5);
        box.add(art);

        const edge = this.add.graphics();
        edge.lineStyle(isSel ? 3 : 1.5, isSel ? SHEET.goldInt : SHEET.line).strokeRoundedRect(x, top, cw, ch, 10);
        box.add(edge);

        const gk = getGradeImgKey(char.grade);
        if (gk && this.textures.exists(gk)) box.add(this.add.image(x + 13, top + 13, gk).setDisplaySize(22, 22));

        if (!own) {
          const t = this.add.text(x + cw / 2, top + ch - 14, '미보유', { fontSize: '11px', fontStyle: 'bold', color: '#e0dcef' }).setOrigin(0.5);
          const pill = this.add.graphics();
          pill.fillStyle(0x000000, 0.6).fillRoundedRect(x + cw / 2 - t.width / 2 - 7, top + ch - 23, t.width + 14, 18, 9);
          box.add([pill, t]);
        }

        const name = this.add.text(x + cw / 2, top + ch + 13, char.name, {
          fontSize: '13px', fontStyle: 'bold', color: isSel ? SHEET.gold : own ? '#ffffff' : '#8a84a0',
        }).setOrigin(0.5);
        if (name.width > cw) name.setScale(cw / name.width);
        box.add(name);

        if (showRank) {
          const s = mine.get(char.id);
          const ly = top + ch + 32;
          if (s?.myRank != null) {
            const reward = isCurrent && s.rewardEligible;
            const t = this.add.text(x + cw / 2, ly, reward ? `${s.myRank}위 · 보상권` : `${s.myRank}위`, {
              fontSize: '12px', fontStyle: 'bold', color: reward ? '#3a2400' : '#ffffff',
            }).setOrigin(0.5);
            if (t.width + 14 > cw) t.setScale((cw - 14) / t.width);
            const pw = t.displayWidth + 14;
            const pill = this.add.graphics();
            pill.fillStyle(reward ? SHEET.goldInt : 0x2e2558, 1).fillRoundedRect(x + (cw - pw) / 2, ly - 9, pw, 18, 9);
            box.add([pill, t]);
          } else if (own) {
            box.add(this.add.text(x + cw / 2, ly, '기록 없음', { fontSize: '12px', color: SHEET.dim }).setOrigin(0.5));
          }
        }

        // 눌리는 자리 = 카드 + 이름 (+ 내 순위). 스크롤 창 밖으로 밀려난 카드는 눌리지 않게 (마스크는 입력을 자르지 않는다)
        const hitH = rowH - 6;
        const hit = this.add.zone(x, top, cw, hitH).setOrigin(0);
        hit.setInteractive(clipToViewport(new Phaser.Geom.Rectangle(0, 0, cw, hitH), scrollView));
        hit.on('pointerup', (ptr: Phaser.Input.Pointer) => {
          if (fresh() || scroll.hasDragged) return;
          if (ptr.y < SCROLL_TOP) return;
          this.hideCharSelectOverlay();
          if (this.selectedCharFilter !== char.id) {
            this.selectedCharFilter = char.id;
            this.loadLeaderboard();
          }
        });
        box.add(hit);
      });
      y += Math.ceil(list.length / COLS) * rowH + 4;
    }

    // 아래 여백 — 맨 끝 줄이 바닥 흐림에 덮이지 않게
    const contentH = y + 32 - SCROLL_TOP;
    const maxScroll = Math.max(0, contentH - viewH);

    // 더 있다는 표시 — 바닥 흐림 · 오른쪽 스크롤 막대
    let thumb: Phaser.GameObjects.Rectangle | null = null;
    const trackH = viewH - 12;
    if (maxScroll > 0) {
      const fade = keep(this.add.graphics().setDepth(DEPTH + 2));
      fade.fillGradientStyle(SHEET.bg, SHEET.bg, SHEET.bg, SHEET.bg, 0, 0, 1, 1).fillRect(0, H - 32, W, 32);
      keep(this.add.rectangle(W - 5, SCROLL_TOP + 4, 3, trackH, 0xffffff, 0.12).setOrigin(0.5, 0).setDepth(DEPTH + 3));
      thumb = keep(this.add.rectangle(W - 5, SCROLL_TOP + 4, 3, Math.max(30, trackH * viewH / contentH), 0xffffff, 0.55)
        .setOrigin(0.5, 0).setDepth(DEPTH + 3));
    }
    const scrollTo = (v: number) => {
      scroll.y = Phaser.Math.Clamp(v, 0, maxScroll);
      box.y = -scroll.y;
      if (thumb) thumb.y = SCROLL_TOP + 4 + (trackH - thumb.height) * (scroll.y / maxScroll);
    };

    // 씬 레벨 드래그 핸들러 (스크롤)
    const onDown = (ptr: Phaser.Input.Pointer) => {
      if (ptr.y < SCROLL_TOP) return;
      scroll.startY = ptr.y;
      scroll.startScrollY = scroll.y;
      scroll.active = true;
      scroll.hasDragged = false;
    };
    const onMove = (ptr: Phaser.Input.Pointer) => {
      if (!scroll.active || !ptr.isDown) return;
      const delta = scroll.startY - ptr.y;
      if (Math.abs(delta) > 6) scroll.hasDragged = true;
      scrollTo(scroll.startScrollY + delta);
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

  /** 캐릭터 선택 시트 닫기 */
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
      this.leftArrowBtn.setColor(canGoBack ? '#ffd34d' : '#5a5a66');
    }
    if (this.rightArrowBtn) {
      const canGoForward = viewingYM < currentYM;
      this.rightArrowBtn.setColor(canGoForward ? '#ffd34d' : '#5a5a66');
    }
  }

  /** 이번 달 말일까지 남은 일수 */
  private calcDaysUntilMonthEnd(): number {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const diff = lastDay.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  /** 보상수령 버튼을 다시 칠한다. onClick 이 있을 때만 눌린다 */
  private paintRewardButton(fill: number, stroke: number, label: string, color: string, onClick?: () => void) {
    if (!this.rewardBtnG || !this.rewardBtnHit || !this.rewardBtnLabel) return;
    const { x, y, w, h } = this.rewardBtnRect;
    this.rewardBtnG.clear()
      .fillStyle(0x000000, 0.25).fillRoundedRect(x - w / 2, y - h / 2 + 3, w, h, 12)
      .fillStyle(fill).fillRoundedRect(x - w / 2, y - h / 2, w, h, 12)
      .lineStyle(2.5, stroke).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    this.rewardBtnLabel.setText(label).setColor(color);
    this.rewardBtnHit.removeAllListeners();
    this.rewardBtnHit.disableInteractive();
    if (onClick) {
      this.rewardBtnHit.setInteractive({ useHandCursor: true });
      this.rewardBtnHit.on('pointerdown', onClick);
    }
  }

  /** 보상수령 버튼 상태 갱신 */
  private updateRewardUI() {
    const OFF: [number, number, string] = [0x5a6575, 0x3a4450, '#c7ced8'];
    const DONE: [number, number, string] = [0x2f8a4a, 0x1a4a2a, '#c8ffd0'];
    const READY: [number, number, string] = [0xffc21a, 0x7a4a00, '#4a2a00'];

    // 과거 시즌 조회 중이면 보상 버튼 비활성
    if (this.viewingYearMonth !== null) {
      this.paintRewardButton(0x2a3340, 0x1a2028, '현재 시즌만', '#8892a0');
      return;
    }

    const reward = this.prevSeasonReward;
    const charMode = this.selectedCharFilter !== null;

    if (!reward || reward.rank === null || reward.skorAwarded === 0) {
      // 비활성: 기록 없음 또는 100위 밖
      this.paintRewardButton(OFF[0], OFF[1], charMode ? '보상없음' : '보상수령', OFF[2]);
    } else if (reward.alreadyClaimed) {
      // 비활성: 수령 완료
      this.paintRewardButton(DONE[0], DONE[1], '수령완료', DONE[2]);
    } else {
      // 활성: 수령 가능
      this.paintRewardButton(READY[0], READY[1], charMode ? '캐릭터 보상' : '보상수령', READY[2],
        () => (charMode ? this.handleClaimCharReward() : this.handleClaimReward()));
    }
  }

  /** 보상받기 버튼 클릭 처리 */
  private async handleClaimReward() {
    if (!this.rewardBtnHit || !this.rewardBtnLabel) return;

    // 처리 중 표시 (중복 클릭 방지)
    this.rewardBtnHit.disableInteractive();
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
    if (!this.rewardBtnHit || !this.rewardBtnLabel || !this.selectedCharFilter) return;

    this.rewardBtnHit.disableInteractive();
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

  /** 뒤로 — 왼쪽 위 둥근 버튼 (난이도 화면과 같은 판) */
  private createBackButton(x: number, y: number) {
    const size = 44;
    const box = this.add.container(x, y);
    const { originY } = bakeButton(this, 'diff_back', {
      w: size, h: size, radius: size / 2, top: '#ffffff', bottom: '#dfe6ee', border: '#2a3340', borderW: 3,
      lip: '#9aa6b5', lipH: 4, gloss: 0,
    });
    box.add(this.add.image(0, 0, 'diff_back').setOrigin(0.5, originY));
    box.add(this.add.text(0, -1, '←', { fontSize: '24px', color: '#2a3340', fontStyle: 'bold' }).setOrigin(0.5));
    wireButton(this, box, size, size, () => {
      this.sound.stopAll();
      this.scene.start('ModeSelectScene');
    });
  }
}
