import Phaser from 'phaser';
import { Difficulty, Difficulty as DifficultyEnum } from '../types/GameMode';
import {
  getLeaderboard,
  claimSeasonReward,
  claimCharacterReward,
  getCachedClaimAmount,
  getCachedCharClaimAmount,
  getUserInitials,
  type LeaderboardEntry,
  type PrevSeasonReward,
} from '../utils/leaderboard';
import { CHARACTERS, getVisibleCharacters, getGradeColorInt, type CharacterDef } from '../utils/character';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { bakeButton, bakeRoundedImage, gradientText, wireButton } from '../utils/buttonSkin';
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
const FILTER_Y = 182;
/** 시상대 · 목록이 시작하는 y */
const CONTENT_TOP = 204;
/** 아래 내 순위 판 높이 · 판 가운데가 화면 아래에서 얼마나 위인지 */
const BAR_H = 66;
const BAR_FROM_BOTTOM = 46;
const ROW_H = 42;
/** 시상대 전체 높이 (왕관 ~ 1등 단 아래, 축소 1배 기준) — 화면이 낮으면 줄인다 */
const PODIUM_H = 270;
/** 메달 판 색 — 금 · 은 · 동 */
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
    // 일러스트(768×1344, 전량 로드 시 ~95MB)는 EXTREME 캐릭터 필터 오버레이에서만 쓰이므로
    // showCharSelectOverlay()에서 온디맨드 로드
    CHARACTERS.forEach(char => {
      if (!this.textures.exists(char.imageKey)) {
        this.load.image(char.imageKey, char.imagePath);
      }
    });
  }

  create() {
    super.create();

    this.events.once('shutdown', () => this.overlayCleanup?.());

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
    this.add.rectangle(x - w / 2 + 18, y, 44, 36, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.navigateSeason(-1));
    this.rightArrowBtn = this.add.text(x + w / 2 - 18, y - 2, '›', arrowStyle).setOrigin(0.5);
    this.add.rectangle(x + w / 2 - 18, y, 44, 36, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
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

  /** 캐릭터 선택 오버레이 표시 — 일러스트는 이 시점에 온디맨드 로드 */
  private showCharSelectOverlay() {
    if (this.charOverlayObjects.length > 0 || this.charOverlayLoading) return;

    const missing = CHARACTERS.filter(c => !this.textures.exists(c.illustKey));
    if (missing.length > 0) {
      this.charOverlayLoading = true;
      missing.forEach(c => this.load.image(c.illustKey, c.illustPath));
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.charOverlayLoading = false;
        if (this.scene.isActive()) this.buildCharSelectOverlay();
      });
      this.load.start();
      return;
    }
    this.buildCharSelectOverlay();
  }

  /** 캐릭터 선택 오버레이 구성 (일러스트 포트레이트 카드, 스크롤 가능) */
  private buildCharSelectOverlay() {
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

    // 도감도 사람에게 보이는 화면이다 — 미공개 캐릭터는 빼고 행수를 잡는다
    const charList = getVisibleCharacters();
    const ROWS = Math.ceil(charList.length / COLS);
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

    charList.forEach((char, i) => {
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
        5, getGradeColorInt(char), 1
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
