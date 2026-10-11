import Phaser from 'phaser';
import {
  gachaPull, gachaExchange, syncOwnedCharacters, syncOwnedWallpapers, formatRate, GachaError,
  fetchGachaState, getCachedGachaState, visibleBanners, ratesOf, exchangeChoicesOf, standardGachaPool,
  type GachaState, type GachaStarterState, type PulledCharacter, type PulledWallpaper, type PullGuarantee,
} from '../utils/gacha';
import {
  BANNERS, DEFAULT_BANNER_ID, PULL_COUNT, getBanner, pullPrice,
  type BannerDef, type BannerRates, type GachaGrade, type PullType, type RateCell, type RateRow,
} from '../config/banners';
import { CHARACTERS, getCharacterDef, addOwnedCharacter, getOwnedCharacters, getDuplicateCount, setDuplicateCount, getGradeImgKey, getGradeColorInt, getAwakeningLevel, type CharacterDef } from '../utils/character';
import { WALLPAPERS, getWallpaperDef, addOwnedWallpaper, WP_ACCENT_INT, WP_ACCENT_HEX, type BackgroundDef } from '../utils/wallpaper';
import { getSkorBalance, getCachedSkorBalance, cacheSkorBalance } from '../utils/skor';
import { destroyVideo } from '../utils/video';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { bakeButton, bakeRadialGlow, bakeRoundedImage, gradientText, setTouchInteractive, touchArea, wireButton } from '../utils/buttonSkin';

// 개인 영상이 있는 캐릭터 — **캐릭터 정의에서 그대로 읽는다.** 영상 유무는 이미
// `videoKey`/`videoPath` 가 말하고 있어서, 목록을 따로 두면 캐릭터를 추가할 때
// 한쪽만 고치고 다른 쪽이 낡는다 (랭킹 화이트리스트가 그렇게 어긋났다).
const CHARS_WITH_VIDS = new Set(
  CHARACTERS.filter(c => c.videoKey && c.videoPath).map(c => c.id),
);

/** 뽑은 캐릭터 하나의 결과 표시 정보 — 각성 달성은 뽑기 전후 getAwakeningLevel 을 비교해 정한다 */
interface PullMeta {
  awakenUp: boolean;
  /** 뽑은 뒤 각성 단계 */
  level: number;
}

/** 배경화면 획득 카드의 청록 — 시안 A (WP_ACCENT 보라는 수집 화면 · 요약 줄 결이라 따로 둔다) */
const WP_CARD_TEAL_HEX = '#40c8ff';
const WP_CARD_TEAL = 0x40c8ff;

/** 진열이 넘어가는 간격 (ms) */
const SLIDE_MS = 3000;

// ── 픽업 배너 (정의서 ~/ddong-fx-work/gacha/banner_spec_v1.md §5) ──────────────
// 배너 정의 · 확률 · 교환 후보는 src/config/banners.ts 와 utils/gacha.ts 가 계산한다. 이 화면은 그리기만 한다 —
// 이름과 숫자(확률 · 천장 기준 · 가격 · 후보)를 손으로 적지 않는다

/** 마지막에 보던 배너 — 기기에 기억한다 */
const TAB_KEY = 'ddong_gacha_tab';
/**
 * 초보자 50번째 보장으로 골라 둔 UR (토글 값). 서버에는 다음 초보자 뽑기의 starterPick 으로 저장된다 (§3 · §6-2).
 * 뽑기 전에 화면을 나가도 고른 값이 남게 기기에 적어 둔다
 */
const STARTER_PICK_KEY = 'ddong_gacha_starter_pick';
/** 좌우 밀기 — 가로로 이만큼(px) 밀고 세로보다 가로로 더 움직였으면 이웃 배너로 */
const SWIPE_MIN = 48;

/** 결과 카드의 작은 글자 — 연출(빛 · 테두리)은 fx 몫이라 글자만 단다 */
const GUARANTEE_TAG: Record<PullGuarantee, string> = { srPlus: 'SR 확정', starterUR: '보장' };
const EXCHANGE_TAG = '교환';

/**
 * 로비 줄 — 화면 아래에서 잰 높이 (px). 니케식 (시안 ~/ddong-fx-work/dev2/mockups2/E.png):
 * 얼굴 줄 → 천장 → 확률 한 줄 → 뽑기 버튼 바로 위 큰 배너 이름 → 뽑기 버튼 → 페이지 점 → 확률 줄.
 * 본문(이벤트 카드)은 bodyTop ~ (H - bodyBottom), 가장자리 ‹ › 는 화면 높이의 arrowY 에 둔다
 */
const LOBBY = {
  faces: 268, pity: 236, pityCaption: 216, rates: 192, name: 160,
  pull: 98, pullH: 76, dots: 47, foot1: 30, foot2: 12,
  starterBadge: 270, starterLine: 238, starterNote: 206, starterToggle: 174,
  bodyTop: 72, bodyBottom: 290, arrowY: 0.38,
} as const;

/**
 * 씬 실행 번호 — init 마다 하나씩 오른다 (모듈 단위라 씬을 나갔다 들어와도 되돌아가지 않는다).
 * Phaser 는 같은 씬 인스턴스를 다시 쓰고, 서버 호출 Promise 는 씬을 나가도 취소되지 않는다. 그래서 늦게 온 응답은
 * scene.isActive() 만으로는 '이전 실행'인지 모른다 — 재진입한 뒤에는 다시 active 다 (리뷰 19dace7a 새 회귀)
 */
let runSeq = 0;

function readStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* 기억 못 해도 화면은 돈다 */ }
}

const nameOf = (id: string): string => getCharacterDef(id).name;

/** 목적격 조사 — 끝 글자에 받침이 있으면 '을', 없으면 '를' (한글이 아니면 '를': K = 케이) */
function objectJosa(word: string): string {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '을' : '를';
}

/** 탭 이름 — 픽업은 픽업 UR 이름에서 */
function bannerTitle(b: BannerDef): string {
  switch (b.kind) {
    case 'starter': return '초보자';
    case 'standard': return '상시';
    case 'pickup': return b.pickupUR ? `${nameOf(b.pickupUR)} 픽업` : '픽업';
    case 'event': return '이벤트';
  }
}

/** 뽑기 버튼 위 큰 배너 이름 */
function bannerHeadline(b: BannerDef): string {
  switch (b.kind) {
    case 'starter': return '초보자 뽑기';
    case 'standard': return '상시 뽑기';
    case 'pickup': return bannerTitle(b);
    case 'event': return '이벤트 픽업';
  }
}

/** 천장 막대 아래 글 (§5 표) */
function pityCaption(b: BannerDef): string {
  const p = b.pity;
  if (!p) return '';
  switch (p.exchange) {
    case 'pickupUR': return `${p.threshold}이면 ${b.pickupUR ? nameOf(b.pickupUR) : '픽업 UR'} 교환`;
    case 'chooseUR': return `${p.threshold}이면 상시 UR 중 1명 선택`;
    case 'chooseSR': return `${p.threshold}이면 ${exchangeChoicesOf(b).map(nameOf).join(' · ')} 중 1명 선택`;
  }
}

/** 확률 표의 등급 글자 색 — 캐릭터 정의의 등급색에서 */
function gradeHex(grade: GachaGrade | null): string {
  if (!grade) return WP_CARD_TEAL_HEX;
  return CHARACTERS.find(c => c.grade === grade)?.gradeColor ?? '#ffffff';
}

/**
 * 상시 · 초보자 탭에 진열하는 캐릭터 — 상시 풀(이벤트 셋 · chibi 제외)의 UR. **캐릭터 정의에서 유도한다.**
 * preload 가 진열 일러스트(768x1344, 장당 약 4MB)를 미리 받으므로 진열을 늘리면 텍스처 메모리가 는다.
 * 그래서 SR 까지 다 넣지 않는다 (예전 슬라이드쇼는 15장이었다)
 */
function featuredIds(): string[] {
  return standardGachaPool().filter(c => c.grade === 'UR').map(c => c.id);
}

/** 큰 일러스트를 받는 캐릭터 — 진열 + 픽업 UR (픽업 UR 은 상시 UR 이라 대개 진열과 같은 파일이다) */
function illustIds(): string[] {
  return [...new Set([...featuredIds(), ...BANNERS.flatMap(b => (b.pickupUR ? [b.pickupUR] : []))])];
}

/**
 * 수집 카드 썸네일(216x288)을 받는 캐릭터 — 픽업 SR · 이벤트 셋(배너 본문), 교환 후보 · 초보자 보장 후보(고르기 창).
 * 큰 일러스트(장당 약 4MB) 대신 이것만 쓴다
 */
function cardThumbIds(): string[] {
  return [...new Set(BANNERS.flatMap(b => [...b.pickupSR, ...exchangeChoicesOf(b), ...(b.starter?.pickFrom ?? [])]))];
}

export default class GachaScene extends BaseScene {
  private skorBalance = -1;
  private remainingSkor = 0;
  private pullResults: PulledCharacter[] = [];
  private wpResults: PulledWallpaper[] = [];
  /** 알림 판 (SKOR 부족 · 그 밖 안내) — 한 번에 하나 (연달아 누르면 쌓이지 않고 다시 뜬다) */
  private toast: Phaser.GameObjects.Container | null = null;
  /** pullResults 와 같은 순서 */
  private pullMeta: PullMeta[] = [];
  /** pullResults 와 같은 순서 — 결과 카드의 작은 글자 ('SR 확정' · '보장' · '교환'), 보통 칸은 null */
  private pullTags: (string | null)[] = [];
  /** 이 씬이 직접 올린 큰 그림 (진열 일러스트 · 배경화면 큰 그림) — 나갈 때 내린다. 원래 있던 키는 남긴다 */
  private ownKeys = new Set<string>();
  private revealItems: Array<{ kind: 'character'; data: PulledCharacter } | { kind: 'wallpaper'; data: PulledWallpaper }> = [];
  private revealItemIndex = 0;
  private terminalTexts: Phaser.GameObjects.Text[] = [];
  private terminalBaseY: number = 276;
  private terminalTextX: number = 24;
  private skipTerminal = false;
  private videoSkipResolver: (() => void) | null = null;
  private skipToSummary = false;

  // ── 배너 ──
  /** 지금 그린 탭 */
  private banner: BannerDef = BANNERS[0];
  /** 사람이 고른 탭 (누른 탭 · 기억한 탭). 그 탭이 안 보이면 기본(초보자가 남았으면 초보자, 아니면 상시)을 그린다 */
  private chosenTab: string | null = null;
  /** 결과 화면의 1회 더 · 10회 더 가 뽑는 배너 */
  private pullBanner: BannerDef = BANNERS[0];
  /** 천장 · 초보자 상태 — 캐시로 먼저 그리고, 서버 값이 그린 것과 다르면 다시 그린다. 못 읽었으면 null */
  private gstate: GachaState | null = null;
  private lobbyRates: BannerRates | null = null;
  private inLobby = false;
  /** 지금 떠 있는 로비의 잔액 글자 · 그때 그린 상태(JSON) — 서버 값이 오면 이것과 비교해 고친다 */
  private skorText: Phaser.GameObjects.Text | null = null;
  private drawnState = '';
  /**
   * 뽑기 · 교환 응답이 잔액 · 상태를 넣을 때마다 오른다. 그보다 먼저 읽기 시작한 서버 조회는 낡은 값이라 버린다.
   * (로비를 다시 그렸다고 버리지는 않는다 — 그림의 세대와 데이터의 신선도는 따로 본다)
   */
  private dataEpoch = 0;
  /** 진행 중인 잔액 · 상태 조회 수 (이 실행의 것만) — 잔액을 모를 때 뽑기를 누르면 조회가 없을 때만 새로 건다 */
  private refreshing = 0;
  /** 이 실행의 번호 (runSeq). 서버 응답을 기다린 뒤에는 isCurrent(run) 로 같은 실행인지 본다 */
  private runId = 0;
  /** 이 시각(ms, Date.now) 전에는 로비를 다시 그리지 않는다 — clearUI 가 BaseScene 의 입력 막기 타이머까지 지운다 */
  private redrawAfter = 0;
  /** 떠 있는 창 (확률 보기 · 고르기 · 확인) — 한 번에 하나 */
  private modal: { close: () => void } | null = null;

  // ── 로비 슬라이드쇼 상태 ──
  private featured: CharacterDef[] = [];
  private slideshowIndex = 0;
  private slideshowIsA = true; // true → bgA가 현재 레이어
  private slideshowBgA: Phaser.GameObjects.Image | null = null;
  private slideshowBgB: Phaser.GameObjects.Image | null = null;
  private slideshowRateText: Phaser.GameObjects.Text | null = null;
  private slideshowActive = false;
  private slideTimer: Phaser.Time.TimerEvent | null = null;
  /** 얼굴 줄 (상시 = 진열 얼굴, 픽업 = 함께 픽업 SR) */
  private faceChips: { chip: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics; color: number }[] = [];
  private faceRowSlides = false;

  constructor() {
    super('GachaScene');
  }

  init() {
    this.ownKeys = new Set();   // preload 가 채운다
    this.skorBalance = -1;
    this.chosenTab = readStore(TAB_KEY);
    this.gstate = getCachedGachaState();
    this.modal = null;
    this.inLobby = false;
    this.skorText = null;
    this.drawnState = '';
    // 새 실행 — 이전 실행이 걸어 둔 조회 · 뽑기 응답은 runId 가 달라 이 실행의 값 · 카운터를 건드리지 않는다
    this.runId = ++runSeq;
    this.dataEpoch = 0;
    this.refreshing = 0;
  }

  /** 서버 응답을 기다린 뒤 — 이 씬이 아직 그 호출을 건 실행 그대로인가 (나갔다 다시 들어왔으면 false) */
  private isCurrent(run: number): boolean {
    return run === this.runId && this.scene.isActive();
  }

  preload() {
    // 공통 연출 영상
    if (!this.cache.video.exists('gacha')) {
      this.load.video('gacha', 'assets/vids/gacha.mp4');
    }
    // 캐릭터 픽셀 이미지 (작은 webp, 전부 사전 로드)
    for (const c of CHARACTERS) {
      if (!this.textures.exists(c.imageKey)) {
        this.load.image(c.imageKey, c.imagePath);
      }
    }
    // 진열 · 픽업 UR 일러스트
    for (const id of illustIds()) {
      const def = CHARACTERS.find(c => c.id === id);
      if (def && !this.textures.exists(def.illustKey)) {
        this.ownKeys.add(def.illustKey);
        this.load.image(def.illustKey, def.illustPath);
      }
    }
    // 얼굴 줄 — 상시 UR 진열 · 픽업 SR (얼굴 파일이 없는 캐릭터는 로드 실패로 넘어가고 카드 · 스프라이트로 대신한다)
    for (const id of new Set([...featuredIds(), ...BANNERS.filter(b => b.kind === 'pickup').flatMap(b => b.pickupSR)])) {
      if (!this.textures.exists(`gacha_facesrc_${id}`)) {
        this.load.image(`gacha_facesrc_${id}`, `assets/ui/collection/face/${id}.webp`);
      }
    }
    // 배너 본문 · 고르기 창의 작은 그림 — 결과 화면과 같은 키라 결과에서 다시 받지 않는다
    for (const id of cardThumbIds()) {
      if (!this.textures.exists(`gacha_card_${id}`)) this.load.image(`gacha_card_${id}`, `assets/ui/collection/card/${id}.webp`);
    }
    for (const id of new Set(BANNERS.flatMap(b => b.pickupWP))) {
      if (!this.textures.exists(`gacha_wp_${id}`)) this.load.image(`gacha_wp_${id}`, `assets/ui/collection/wp/${id}.webp`);
    }
    // 리빌 화면 공통 배경 (이벤트 탭 배경도)
    if (!this.textures.exists('gacha_background')) {
      this.load.image('gacha_background', 'assets/backgrounds/gacha_background.webp');
    }
    // 등급 이미지
    if (!this.textures.exists('grade_r'))  this.load.image('grade_r',  'assets/character_ranks/r.png');
    if (!this.textures.exists('grade_sr')) this.load.image('grade_sr', 'assets/character_ranks/sr.png');
    if (!this.textures.exists('grade_ur')) this.load.image('grade_ur', 'assets/character_ranks/ur.png');
  }

  create() {
    super.create();

    this.pullResults = [];
    this.wpResults = [];
    this.pullMeta = [];
    this.pullTags = [];
    this.revealItems = [];
    this.revealItemIndex = 0;
    this.toast = null;
    this.redrawAfter = Date.now() + this.inputGuardMs + 100;
    this.events.once('shutdown', () => this.releaseTextures());
    this.buildLobby();
  }

  // ═══════════════════════════════════════════════════
  // LOBBY — 배너 고르기(니케식) · 본문 · 정보 · 천장 · 뽑기 버튼
  // ═══════════════════════════════════════════════════

  /** 로비를 다시 그린다. refresh 면 서버에서 잔액 · 천장 · 초보자 상태를 다시 읽는다 (배너만 넘길 때는 읽지 않는다) */
  private buildLobby(refresh = true) {
    this.clearUI();
    this.inLobby = true;
    this.drawnState = JSON.stringify(this.gstate);

    const visible = visibleBanners(this.gstate);
    const banner = this.pickBanner(visible);
    this.banner = banner;
    this.lobbyRates = ratesOf(banner);

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const showcase = banner.kind === 'standard' || banner.kind === 'starter';

    // ── 본문 뒤 — 상시 · 초보자 = 진열 일러스트, 픽업 = 픽업 UR 일러스트, 이벤트 = 뽑기 배경 ──
    if (showcase) this.buildShowcase();
    else if (banner.kind === 'pickup') this.coverIllust(this.add.image(cx, 0, getCharacterDef(banner.pickupUR ?? '').illustKey));
    else this.buildEventBackdrop();

    // ── 위·아래 어둠 — 글자와 버튼이 일러스트 위에서 읽히게 (세로 그라데이션 한 장을 늘려 쓴다) ──
    const fade = this.bakeVFade();
    this.add.image(cx, 0, fade).setOrigin(0.5, 0).setDisplaySize(W, 110).setFlipY(true).setAlpha(0.7);
    this.add.image(cx, H, fade).setOrigin(0.5, 1).setDisplaySize(W, Math.min(400, H * 0.62));

    // ── 위: 뒤로 · SKOR ──
    this.createBackButton(32, 32);
    const known = this.skorBalance >= 0 ? this.skorBalance : getCachedSkorBalance();
    this.skorText = this.createSkorPill(W - 80, 32, known !== null ? Math.floor(known).toLocaleString() : '--');

    // ── 본문 앞 — 이벤트 = 셋 나란히 (상시 · 픽업의 얼굴은 정보 블록의 얼굴 줄) ──
    if (banner.kind === 'event') this.buildEventCards(banner);

    // ── 정보 · 천장 · 뽑기 버튼 · 페이지 점 · 확률 줄 ──
    if (banner.kind === 'starter') this.buildStarterInfo(banner);
    else {
      this.buildInfo(banner);
      this.buildPity(banner);
    }
    this.buildPullButtons(banner);
    this.buildDots(visible, banner);
    this.buildRateFooter();

    // ── 배너 고르기 — 가장자리 ‹ › · 좌우 밀기 ──
    this.buildSwitcher(visible, banner);

    if (showcase) {
      this.updateSlideshowText(this.featured[0]);
      // ── 슬라이드쇼 타이머 (자동 전환) ──
      this.slideshowActive = true;
      this.restartSlideTimer();
    }

    if (refresh) void this.refreshLobby();
  }

  /** 그릴 배너 — 사람이 고른(넘긴) 배너가 보이면 그것, 아니면 초보자가 남았으면 초보자, 아니면 상시 (§5) */
  private pickBanner(visible: BannerDef[]): BannerDef {
    return visible.find(b => b.id === this.chosenTab)
      ?? visible.find(b => b.kind === 'starter')
      ?? visible.find(b => b.id === DEFAULT_BANNER_ID)
      ?? visible[0]
      ?? getBanner(DEFAULT_BANNER_ID)
      ?? BANNERS[0];
  }

  private selectBanner(id: string) {
    if (id === this.banner.id) return;
    this.chosenTab = id;
    writeStore(TAB_KEY, id);
    this.buildLobby(false);
  }

  /**
   * 서버에서 잔액 · 천장 · 초보자 상태를 읽는다.
   * **받은 값은 그린 로비와 상관없이 받아들인다** — 읽는 동안 탭을 바꿔 로비를 다시 그려도 잔액은 그대로 사람의 것이다.
   * (그림 세대가 바뀌었다고 버렸더니 skorBalance 가 -1 로 남아 모든 뽑기가 '잔액 확인 중'에 막혔다 — 리뷰 7673febc P1)
   * 버리는 것은 읽기 시작한 뒤 뽑기 · 교환 응답이 더 새 값을 넣은 경우(dataEpoch)와,
   * 씬을 나갔다 다시 들어와 다른 실행이 된 경우(runId)뿐이다.
   * 그다음 지금 떠 있는 로비를 고친다 — 잔액 글자, 상태가 그린 것과 다르면 다시 그리기 (창이 떠 있으면 다음에 그릴 때)
   */
  private async refreshLobby() {
    const run = this.runId;
    const epoch = this.dataEpoch;
    this.refreshing++;
    let balance: number | null, state: GachaState | null;
    try {
      [balance, state] = await Promise.all([
        getSkorBalance().catch((e: unknown) => { console.error('[GachaScene] 잔액 조회 실패:', e); return null; }),
        fetchGachaState().catch(() => null),
      ]);
    } finally {
      if (run === this.runId) this.refreshing--;   // 이전 실행의 조회는 새 실행의 카운터를 건드리지 않는다
    }
    if (!this.isCurrent(run) || epoch !== this.dataEpoch) return;
    if (balance !== null) {
      this.skorBalance = balance;
      cacheSkorBalance(balance);
      if (this.skorText?.active) this.skorText.setText(Math.floor(balance).toLocaleString());
    }
    if (!state) return;
    this.gstate = state;
    if (!this.inLobby || JSON.stringify(state) === this.drawnState) return;
    const wait = this.redrawAfter - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (this.isCurrent(run) && this.inLobby && !this.modal && JSON.stringify(this.gstate) !== this.drawnState) this.buildLobby(false);
  }

  /** 상시 · 초보자 본문 — 진열 일러스트 2레이어 (crossfade용). 늘이지 않고 덮어 채운다 */
  private buildShowcase() {
    const cx = this.scale.width / 2;
    this.slideshowIndex = 0;
    this.slideshowIsA = true;
    this.featured = featuredIds().map(id => getCharacterDef(id));
    const first = this.featured[0];
    // bgA: 처음엔 현재 일러스트 (alpha=1), bgB: 다음 일러스트 대기 (alpha=0)
    this.slideshowBgA = this.add.image(cx, 0, first.illustKey);
    this.slideshowBgB = this.add.image(cx, 0, first.illustKey).setAlpha(0);
    this.coverIllust(this.slideshowBgA);
    this.coverIllust(this.slideshowBgB);
  }

  /** 이벤트 본문 뒤 — 뽑기 배경을 조금 눌러 깐다 (셋의 일러스트를 다 올리면 12MB 라 카드로 보인다) */
  private buildEventBackdrop() {
    const W = this.scale.width, H = this.scale.height;
    if (this.textures.exists('gacha_background')) addBackground(this, 'gacha_background', W, H);
    else this.add.rectangle(W / 2, H / 2, W, H, 0x150a2a);
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0618, 0.35);
  }

  /** 일러스트를 화면에 덮어 채운다 — 비율 유지, 얼굴이 잘리지 않게 위쪽(15%)을 기준으로 */
  private coverIllust(img: Phaser.GameObjects.Image) {
    const W = this.scale.width, H = this.scale.height;
    const sc = Math.max(W / img.width, H / img.height);
    img.setScale(sc).setOrigin(0.5, 0).setY(-(img.height * sc - H) * 0.15);
  }

  /**
   * 아래로 짙어지는 어둠 한 장 — 늘려 쓴다.
   * 세로를 2의 거듭제곱(256)으로 두면 WebGL 이 REPEAT 로 감싸서, 늘린 위 가장자리에 아래쪽 짙은 줄이
   * 비쳐 가로줄이 생긴다 (실기에서 확인). 그래서 250 — 2의 거듭제곱이 아니면 가장자리를 늘려 쓴다
   */
  private bakeVFade(): string {
    const key = 'gacha_vfade';
    const FH = 250;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, 4, FH);
    if (!tex) return key;
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, FH);
    g.addColorStop(0, 'rgba(6,2,16,0)');
    g.addColorStop(0.45, 'rgba(6,2,16,0.75)');
    g.addColorStop(1, 'rgba(6,2,16,0.96)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, FH);
    tex.refresh();
    return key;
  }

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

  /** SKOR 알약 — 잔액 글자를 돌려준다 */
  private createSkorPill(x: number, y: number, value: string): Phaser.GameObjects.Text {
    const w = 128, h = 30;
    const g = this.add.graphics();
    g.fillStyle(0x0a0618, 0.85).fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    g.lineStyle(1.5, 0xffd34d).strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    this.add.text(x - 46, y, '💰', { fontSize: '14px' }).setOrigin(0.5);
    this.add.text(x + w / 2 - 12, y, 'SKOR', { fontSize: '9px', color: '#d9c6f0', fontStyle: 'bold' }).setOrigin(1, 0.5);
    // 잔액은 'SKOR' 왼쪽에 오른쪽 맞춤 — 자릿수가 늘어도 겹치지 않게
    return this.add.text(x + w / 2 - 42, y, value, { fontSize: '14px', color: '#fff0c2', fontStyle: 'bold' }).setOrigin(1, 0.5);
  }

  /**
   * 배너 고르기 — 니케식 (대표 결정 2026-10-11, 시안 ~/ddong-fx-work/dev2/mockups2/E.png). 탭 줄은 없다.
   * 화면 가장자리 가운데 ‹ › (안쪽에 이웃 배너 이름 작게 — 대표 제안) · 본문을 좌우로 밀기 · 뽑기 버튼 아래 페이지 점(buildDots).
   * 순서 = visibleBanners (BANNERS 배열 순서) — 배너가 7개든 4개든 그대로 돈다. 양 끝에서는 그쪽 화살표가 없다 (돌지 않는다)
   */
  private buildSwitcher(visible: BannerDef[], cur: BannerDef) {
    const W = this.scale.width, H = this.scale.height;
    const i = visible.indexOf(cur);
    const y = Math.round(H * LOBBY.arrowY);
    for (const dir of [-1, 1] as const) {
      const nb = visible[i + dir];
      if (!nb) continue;
      const box = this.add.container(dir < 0 ? 17 : W - 17, y);
      box.add(this.add.graphics().fillStyle(0x0a0618, 0.5).fillRoundedRect(-14, -32, 28, 64, 10));
      box.add(this.add.text(0, -3, dir < 0 ? '‹' : '›', {
        fontSize: '36px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5));
      wireButton(this, box, 28, 64, () => this.stepBanner(dir), true);
      const t = this.add.text(dir < 0 ? 35 : W - 35, y, bannerTitle(nb), {
        fontSize: '11px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(dir < 0 ? 0 : 1, 0.5).setAlpha(0.9);
      // 이웃 배너의 천장 교환이 되면 이름 옆 빨간 점 (탭 줄의 점을 옮겼다)
      if (this.canExchangeOf(nb)) {
        const dx = dir < 0 ? t.x + t.width + 6 : t.x - t.width - 6;
        this.add.graphics().fillStyle(0xff5a3a).fillCircle(dx, y - 1, 4).lineStyle(1.2, 0xffffff).strokeCircle(dx, y - 1, 4);
      }
    }

    // 좌우 밀기 — 본문(위 막대 아래 ~ 얼굴 줄 위)에서, 눌리는 것이 없는 자리에서 시작한 끌기만 본다
    // (버튼 위에서 시작하면 그 버튼이 이미 눌린다 — wireButton 은 누를 때 동작한다)
    const top = 60, bottom = H - LOBBY.faces - 20;
    let start: { x: number; y: number } | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      start = !this.modal && p.y > top && p.y < bottom && this.input.hitTestPointer(p).length === 0 ? { x: p.x, y: p.y } : null;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const s = start;
      start = null;
      if (!s || this.modal) return;
      const dx = p.x - s.x, dy = p.y - s.y;
      if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.2) this.stepBanner(dx < 0 ? 1 : -1);
    });
  }

  /** 이웃 배너로 (‹ › · 밀기). 끝이면 그대로 */
  private stepBanner(dir: -1 | 1) {
    if (this.modal || !this.inLobby) return;
    const visible = visibleBanners(this.gstate);
    const next = visible[visible.indexOf(this.banner) + dir];
    if (next) this.selectBanner(next.id);
  }

  /** 페이지 점 — 뽑기 버튼 바로 아래. 지금 배너는 금빛 막대, 천장 교환이 되는 배너는 빨간 점 */
  private buildDots(visible: BannerDef[], cur: BannerDef) {
    const W = this.scale.width, y = this.scale.height - LOBBY.dots;
    const gap = 13, x0 = W / 2 - gap * (visible.length - 1) / 2;
    const g = this.add.graphics();
    visible.forEach((b, i) => {
      const x = x0 + i * gap;
      if (b === cur) g.fillStyle(0xffd34d).fillRoundedRect(x - 8, y - 3.5, 16, 7, 3.5);
      else if (this.canExchangeOf(b)) g.fillStyle(0xff5a3a).fillCircle(x, y, 3.6);
      else g.fillStyle(0xffffff, 0.55).fillCircle(x, y, 3.2);
    });
  }

  private canExchangeOf(b: BannerDef): boolean {
    return !!(b.pity && this.gstate?.pity[b.pity.track]?.canExchange);
  }

  /**
   * 얼굴 줄 (예전 오른쪽 SR 칸 대신) — 픽업 = '함께 픽업' 픽업 SR 얼굴 + 이름,
   * 상시 = '상시 UR' 진열 얼굴 (누르면 그 진열로 — 예전 오른쪽 레일). 픽업 전용 배경화면은 확률 보기 창에서 보인다
   */
  private buildFaceRow(b: BannerDef) {
    const y = this.scale.height - LOBBY.faces;
    const slides = b.kind !== 'pickup';
    const ids = slides ? this.featured.map(d => d.id) : [...b.pickupSR];
    this.faceChips = [];
    if (!ids.length) return;
    const label = this.add.text(20, y, slides ? '상시 UR' : '함께 픽업', {
      fontSize: '11px', color: '#d9c6f0', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    const d = 28;
    let x = 20 + Math.max(label.width, 52) + 8;
    ids.forEach((id, i) => {
      const def = getCharacterDef(id);
      const chip = this.add.container(x + d / 2, y);
      chip.add(this.add.graphics().fillStyle(0x0a0618, 0.9).fillCircle(0, 0, d / 2 + 2));
      chip.add(this.faceImage(id, d));
      const ring = this.add.graphics();
      chip.add(ring);
      this.faceChips.push({ chip, ring, color: getGradeColorInt(def) });
      if (slides) {
        // 히트 영역은 왼쪽 위 기준 (buttonSkin.wireButton 주석 참고) — 손가락 크기(44)로 넓힌다
        chip.setSize(d, d).setInteractive(touchArea(d, d), Phaser.Geom.Rectangle.Contains);
        if (chip.input) chip.input.cursor = 'pointer';
        chip.on('pointerdown', () => this.showSlide(i));
      }
      x += d + 6;
    });
    if (!slides) {
      this.add.text(x + 2, y, ids.map(nameOf).join(' · '), {
        fontSize: '12px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5);
    }
    this.faceRowSlides = slides;
    this.refreshFaces();
  }

  /** 얼굴 원 — 얼굴 그림(ui/collection/face)을 굽는다. 없으면 수집 카드 위쪽, 그것도 없으면 게임 스프라이트 */
  private faceImage(id: string, d: number): Phaser.GameObjects.Image {
    const def = getCharacterDef(id);
    const src = `gacha_facesrc_${id}`;
    if (this.textures.exists(src)) return this.add.image(0, 0, bakeRoundedImage(this, `gacha_face_${id}_${d}`, src, d, d, d / 2)).setDisplaySize(d, d);
    if (this.textures.exists(`gacha_card_${id}`)) {
      return this.add.image(0, 0, bakeRoundedImage(this, `gacha_facec_${id}_${d}`, `gacha_card_${id}`, d, d, d / 2, 0.12)).setDisplaySize(d, d);
    }
    const img = this.add.image(0, 0, def.imageKey);
    return img.setScale(Math.min((d - 4) / img.width, (d - 4) / img.height));
  }

  /** 얼굴 테두리 — 상시는 지금 진열만 크게 · 금테, 픽업은 등급색 */
  private refreshFaces() {
    this.faceChips.forEach(({ chip, ring, color }, i) => {
      const on = this.faceRowSlides && i === this.slideshowIndex;
      ring.clear().lineStyle(on ? 2.5 : 2, on ? 0xffd34d : color).strokeCircle(0, 0, 15);
      chip.setScale(on ? 1.15 : 1);
    });
  }

  private restartSlideTimer() {
    this.slideTimer?.remove();
    this.slideTimer = this.time.addEvent({
      delay: SLIDE_MS,
      loop: true,
      callback: this.advanceSlide,
      callbackScope: this,
    });
  }

  private advanceSlide() {
    this.showSlide((this.slideshowIndex + 1) % this.featured.length, false);
  }

  /** index 번째 진열 캐릭터로 넘긴다. 사람이 눌렀으면 자동 전환 타이머를 처음부터 다시 */
  private showSlide(index: number, byUser = true) {
    if (!this.slideshowActive || !this.scene.isActive() || this.modal) return;
    if (index === this.slideshowIndex) return;
    const nextDef = this.featured[index];

    // 현재/다음 레이어 결정
    const current  = this.slideshowIsA ? this.slideshowBgA : this.slideshowBgB;
    const incoming = this.slideshowIsA ? this.slideshowBgB : this.slideshowBgA;
    if (!current || !incoming) return;

    // 다음 일러스트를 incoming 레이어에 세팅 (일러스트마다 크기가 다를 수 있어 다시 맞춘다)
    this.tweens.killTweensOf([current, incoming]);
    incoming.setTexture(nextDef.illustKey).setAlpha(0);
    this.coverIllust(incoming);

    // 상태 + 텍스트를 일러스트 전환 시작과 동시에 즉시 교체
    this.slideshowIsA = !this.slideshowIsA;
    this.slideshowIndex = index;
    this.updateSlideshowText(nextDef);
    this.refreshFaces();
    if (byUser) this.restartSlideTimer();

    // crossfade: 현재 fade-out, 다음 fade-in
    this.tweens.add({ targets: current,  alpha: 0, duration: 600, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: incoming, alpha: 1, duration: 600, ease: 'Sine.easeInOut' });
  }

  /** 상시 — 슬라이드의 캐릭터 이름 · 한 칸 확률 (큰 이름은 배너 이름이다. 초보자는 이 줄이 없어 그림만 넘어간다) */
  private updateSlideshowText(def: CharacterDef) {
    const rates = this.lobbyRates;
    if (this.slideshowRateText?.active && rates) {
      const each = rates.entries.find(e => e.kind === 'character' && e.id === def.id)?.rate.slot ?? 0;
      const total = (rates.byGrade as Partial<Record<string, RateCell>>)[def.grade]?.slot ?? 0;
      this.slideshowRateText.setText(`${def.name} ${formatRate(each)}%  ·  ${def.grade} 전체 ${formatRate(total)}%`);
    }
  }

  /** 빨간 배지 (픽업 · 이벤트 픽업 · 초보자 전용) — x 는 왼쪽 끝 */
  private badge(x: number, y: number, label: string) {
    const t = this.add.text(0, y, label, { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const w = Math.ceil(t.width) + 26;
    t.setX(x + w / 2);
    const g = this.add.graphics();
    g.fillStyle(0xe8261a).fillRoundedRect(x, y - 12, w, 24, 12);
    g.lineStyle(1.5, 0x5a0a00).strokeRoundedRect(x, y - 12, w, 24, 12);
    this.children.bringToTop(t);
  }

  /** [확률 보기] — 그 배너의 전체 확률표 창 */
  private ratesButton(x: number, y: number, b: BannerDef) {
    const w = 84, h = 28;
    const box = this.add.container(x, y);
    box.add(this.add.graphics()
      .fillStyle(0x0a0618, 0.84).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2)
      .lineStyle(1.5, 0xd9c6f0).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2));
    box.add(this.add.text(0, 0, '확률 보기', { fontSize: '12px', color: '#f1e6ff', fontStyle: 'bold' }).setOrigin(0.5));
    wireButton(this, box, w, h, () => this.openRates(b), true);
  }

  /**
   * 작은 수집 카드 — 등급색 판 + 카드 + 등급 + 이름 띠. (x, y) 가운데의 컨테이너를 돌려준다
   * (배너 본문 · 고르기 창이 같이 쓴다)
   */
  private miniCard(x: number, y: number, w: number, h: number, id: string, glow = false): Phaser.GameObjects.Container {
    const def = getCharacterDef(id);
    const box = this.add.container(x, y);
    const frame = this.gradeFrame(def, w + 4, h + 4, 8, glow);
    box.add(this.add.image(0, 0, frame.key).setOrigin(0.5, frame.originY));
    const src = `gacha_card_${id}`;
    if (this.textures.exists(src)) {
      box.add(this.add.image(0, 0, bakeRoundedImage(this, `gacha_cardR_${id}_${w}`, src, w, h, 6, 0.15)).setDisplaySize(w, h));
    }
    const gk = getGradeImgKey(def.grade);
    const gs = Math.round(Math.max(16, w * 0.28));
    if (gk) box.add(this.add.image(-w / 2 + gs / 2 + 2, -h / 2 + gs / 2 + 2, gk).setDisplaySize(gs, gs));
    const fs = Math.max(9, Math.min(13, Math.round(w / 6)));
    const sh = Math.round(fs * 1.7);
    box.add(this.add.rectangle(0, h / 2 - sh / 2, w, sh, 0x0a0616, 0.78));
    box.add(this.add.text(0, h / 2 - sh / 2, def.name, { fontSize: `${fs}px`, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
    return box;
  }

  /** 작은 배경화면 썸네일 — 청록 테두리 (배경화면 획득 카드와 같은 결). 그린 것을 돌려준다 (확률 창 목록에 넣는다) */
  private wallpaperThumb(x: number, y: number, w: number, h: number, id: string): Phaser.GameObjects.GameObject[] {
    const out: Phaser.GameObjects.GameObject[] = [this.add.graphics()
      .fillStyle(0x06324a, 0.92).fillRoundedRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 7)
      .lineStyle(1.5, WP_CARD_TEAL).strokeRoundedRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 7)];
    const src = `gacha_wp_${id}`;
    if (this.textures.exists(src)) {
      out.push(this.add.image(x, y, bakeRoundedImage(this, `gacha_wpR_${id}_${w}`, src, w, h, 5)).setDisplaySize(w, h));
    }
    return out;
  }

  /**
   * 이벤트 본문 — 이벤트 픽업 셋을 나란히. 가장자리 ‹ › 와 그 옆 이웃 배너 이름에 걸리지 않게 화살표 줄 위에 둔다.
   * 전용 배경화면은 확률 보기 창에서 보인다
   */
  private buildEventCards(b: BannerDef) {
    const W = this.scale.width, H = this.scale.height;
    const n = Math.max(1, b.pickupSR.length), gap = 10;
    const top = LOBBY.bodyTop, bottom = Math.min(H - LOBBY.bodyBottom, Math.round(H * LOBBY.arrowY) - 40);
    const byW = Math.floor((W - 80 - gap * (n - 1)) / n);
    const byH = Math.floor((bottom - top) * 3 / 4);
    const cw = Math.max(48, Math.min(108, byW, byH));
    const ch = Math.round(cw * 4 / 3);
    const y = top + Math.max(0, (bottom - top - ch) / 2) + ch / 2;
    const x0 = W / 2 - (n * cw + (n - 1) * gap) / 2 + cw / 2;
    b.pickupSR.forEach((id, i) => this.miniCard(x0 + i * (cw + gap), y, cw, ch, id, true));
  }

  /**
   * 상시 · 픽업 · 이벤트 정보 (니케식) — 얼굴 줄, 한 칸 확률 한 줄 + [확률 보기], 뽑기 버튼 바로 위 큰 배너 이름.
   * 천장은 buildPity (얼굴 줄과 확률 줄 사이)
   */
  private buildInfo(b: BannerDef) {
    const W = this.scale.width, H = this.scale.height;
    if (b.kind !== 'event') this.buildFaceRow(b);

    const rateText = this.add.text(20, H - LOBBY.rates, this.infoRateLine(b), {
      fontSize: '12px', color: '#ffe58a', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);
    if (b.kind === 'standard') this.slideshowRateText = rateText;
    this.ratesButton(W - 16 - 42, H - LOBBY.rates, b);

    // 큰 배너 이름 — 픽업은 픽업 UR 등급 그림을 앞에
    const ny = H - LOBBY.name;
    let x = 20;
    const gk = b.kind === 'pickup' && b.pickupUR ? getGradeImgKey(getCharacterDef(b.pickupUR).grade) : null;
    if (gk) {
      this.add.image(x + 20, ny, gk).setDisplaySize(40, 40);
      x += 46;
    }
    this.add.text(x, ny, bannerHeadline(b), {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 7,
    }).setOrigin(0, 0.5);
  }

  /** 정보 블록의 확률 한 줄 — 픽업 · 이벤트는 픽업 몫. 상시는 슬라이드마다 updateSlideshowText 가 채운다 */
  private infoRateLine(b: BannerDef): string {
    const rows = this.lobbyRates?.rows ?? [];
    const pick = (grade: GachaGrade) => rows.find(r => r.kind === 'character' && r.grade === grade && r.pickup);
    const ur = pick('UR'), sr = pick('SR');
    if (b.kind === 'pickup') {
      return [ur && `픽업 UR ${formatRate(ur.each.slot)}%`, sr && `픽업 SR 각 ${formatRate(sr.each.slot)}%`].filter(Boolean).join('  ·  ');
    }
    if (b.kind === 'event' && sr) return `이벤트 픽업 SR 각 ${formatRate(sr.each.slot)}%`;
    return '';
  }

  /**
   * 천장 — '천장' 막대 'n / 기준' + 아래 글 + [교환] (기준 이상이면 빛난다).
   * 상태를 못 읽었으면 '-- / 기준' · 교환 꺼짐 (뽑기는 된다 — 응답이 채운다)
   */
  private buildPity(b: BannerDef) {
    const p = b.pity;
    if (!p) return;
    const W = this.scale.width, H = this.scale.height;
    const y = H - LOBBY.pity;
    const ps = this.gstate?.pity[p.track] ?? null;
    const bw = 68, bh = 34, bx = W - 16 - bw / 2;
    const countRight = bx - bw / 2 - 10;

    this.add.text(20, y, '천장', { fontSize: '12px', color: '#ffd34d', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0, 0.5);
    const count = this.add.text(countRight, y, `${ps ? ps.points : '--'} / ${p.threshold}`, {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 0.5);
    const x0 = 54, x1 = countRight - Math.max(count.width, 64) - 8;
    const frac = ps ? Phaser.Math.Clamp(ps.points / p.threshold, 0, 1) : 0;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55).fillRoundedRect(x0, y - 6, x1 - x0, 12, 6);
    if (frac > 0) g.fillStyle(ps?.canExchange ? 0xffd34d : 0xffb81a).fillRoundedRect(x0, y - 6, Math.max(12, (x1 - x0) * frac), 12, 6);
    g.lineStyle(1, 0x8a7ab8, 0.9).strokeRoundedRect(x0, y - 6, x1 - x0, 12, 6);
    this.add.text(x0, H - LOBBY.pityCaption, pityCaption(b), {
      fontSize: '11px', color: '#e8dcff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    this.exchangeButton(bx, y, bw, bh, b, ps?.canExchange ?? false);
  }

  private exchangeButton(x: number, y: number, w: number, h: number, b: BannerDef, on: boolean) {
    const box = this.add.container(x, y);
    if (on) {
      // 교환할 수 있다 — 금 판 뒤 빛이 숨 쉰다 (§5 '빛난다')
      const glow = this.add.image(0, 0, bakeRadialGlow(this, 'gacha_spark', 32))
        .setDisplaySize(w * 1.9, h * 2.6).setTint(0xffd34d).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.3);
      box.add(glow);
      this.tweens.add({ targets: glow, alpha: 0.95, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    const skin = bakeButton(this, `gacha_exch_${on ? 'on' : 'off'}`, on
      ? { w, h, radius: 12, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 2.5, lip: '#a8650a', lipH: 4, gloss: 0, glow: 'rgba(255,211,77,0.85)' }
      : { w, h, radius: 12, top: '#6b6480', bottom: '#3e3852', border: '#1e1a2a', borderW: 2, lip: '#28233a', lipH: 4, gloss: 0 });
    box.add(this.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
    box.add(this.add.text(0, -1, '교환', { fontSize: '15px', fontStyle: 'bold', color: on ? '#5b2e0e' : '#c9c2da' }).setOrigin(0.5));
    wireButton(this, box, w, h, () => this.onExchangeTap(b), true);
  }

  /**
   * 초보자 탭 정보 — '초보자 뽑기 n / 50 · 10회 720 SKOR (20% 할인)', 보장 문장, [레거시 | 센티넬] 토글 (§5).
   * 막대 대신 'n / 50'. 이미 UR 을 뽑았으면 토글을 흐리게 + 'UR 획득 — 보장 없이 진행'
   */
  private buildStarterInfo(b: BannerDef) {
    const W = this.scale.width, H = this.scale.height;
    const st = this.gstate?.starter;
    if (!st || !b.starter) return;
    this.badge(20, H - LOBBY.starterBadge, '초보자 전용');
    this.ratesButton(W - 16 - 42, H - LOBBY.starterBadge, b);

    const price = pullPrice(b, 'multi') ?? 0;
    this.richLine(20, H - LOBBY.starterLine, [
      ['초보자 뽑기 ', '#ffffff'], [`${st.pullsDone} / ${st.max}`, '#ffd34d'],
      ['  ·  10회 ', '#ffffff'], [`${price} SKOR`, '#ffd34d'], [` (${this.discountPct(b)}% 할인)`, '#ff9a8a'],
    ], 15, W - 40);
    this.add.text(20, H - LOBBY.starterNote, st.urHit ? 'UR 획득 — 보장 없이 진행' : `${st.max}회 안에 UR이 없으면 ${st.max}번째에 고른 UR 확정`, {
      fontSize: '12px', color: st.urHit ? '#b9a3d6' : '#ffe58a', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);
    this.buildStarterToggle(b, st, H - LOBBY.starterToggle);
  }

  /** 여러 색 글자를 한 줄로 — 폭이 maxW 를 넘으면 줄인다 */
  private richLine(x: number, y: number, parts: [string, string][], px: number, maxW: number) {
    const line = this.add.container(x, y);
    let cx = 0;
    for (const [s, color] of parts) {
      const t = this.add.text(cx, 0, s, { fontSize: `${px}px`, color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 4 }).setOrigin(0, 0.5);
      line.add(t);
      cx += t.width - 4;   // 외곽선(4)은 폭에 들어간다 — 그만큼 겹쳐 붙인다
    }
    if (cx > maxW) line.setScale(maxW / cx);
  }

  /** 50번째 보장 토글 — 누르면 기기에 적어 두고 다음 초보자 뽑기가 starterPick 으로 보낸다 */
  private buildStarterToggle(b: BannerDef, st: GachaStarterState, y: number) {
    const ids = b.starter?.pickFrom ?? [];
    const pick = this.starterPickOf(b);
    const label = this.add.text(20, y, pick || st.urHit ? `${st.max}번째 보장` : '보장 UR 고르기', {
      fontSize: '12px', color: pick || st.urHit ? '#d9c6f0' : '#ff9a8a', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    const segW = 84, segH = 32;
    let x = 20 + Math.max(label.width, 70) + 8;
    const segs: { id: string; box: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text }[] = [];
    const paint = (cur: string | null) => segs.forEach(s => {
      const on = s.id === cur;
      s.g.clear()
        .fillStyle(on ? 0xffd34d : 0x0a0618, on ? 1 : 0.82).fillRoundedRect(-segW / 2, -segH / 2, segW, segH, 10)
        .lineStyle(1.5, on ? 0x7a4a00 : 0x8a7ab8).strokeRoundedRect(-segW / 2, -segH / 2, segW, segH, 10);
      s.t.setColor(on ? '#3a1d00' : '#efe6ff');
    });
    for (const id of ids) {
      const box = this.add.container(x + segW / 2, y);
      const g = this.add.graphics();
      const t = this.add.text(0, 0, nameOf(id), { fontSize: '14px', fontStyle: 'bold' }).setOrigin(0.5);
      box.add([g, t]);
      segs.push({ id, box, g, t });
      if (!st.urHit) {
        wireButton(this, box, segW, segH, () => {
          writeStore(STARTER_PICK_KEY, id);
          paint(id);
          label.setText(`${st.max}번째 보장`).setColor('#d9c6f0');
        }, true);
      }
      x += segW + 6;
    }
    paint(pick);
    if (st.urHit) {
      segs.forEach(s => s.box.setAlpha(0.4));
      label.setAlpha(0.6);
    }
  }

  /** 초보자 보장 UR — 토글로 고른 값(기기), 없으면 서버에 저장된 값. 후보 밖이면 없음 */
  private starterPickOf(b: BannerDef): string | null {
    const from = b.starter?.pickFrom ?? [];
    const local = readStore(STARTER_PICK_KEY);
    if (local && from.includes(local)) return local;
    const server = this.gstate?.starter.pick ?? null;
    return server && from.includes(server) ? server : null;
  }

  /** 10회 할인율 (%) — 보통 배너는 1회 × 10 대비, 초보자는 상시 10회 대비 (정의서 §0: 900 의 20% 할인) */
  private discountPct(b: BannerDef): number {
    const base = b.price.single !== null ? b.price.single * 10 : (getBanner(DEFAULT_BANNER_ID)?.price.multi ?? b.price.multi);
    return Math.round((1 - b.price.multi / base) * 100);
  }

  /** 뽑기 버튼 — 1회 = 금 판, 10회 = 보라 판 금테 + 할인 리본. 1회가 없는 배너(초보자)는 10회 하나를 가운데 */
  private buildPullButtons(b: BannerDef) {
    const W = this.scale.width, H = this.scale.height;
    const gap = 10, h = LOBBY.pullH;
    const y = H - LOBBY.pull;
    if (pullPrice(b, 'single') === null) {
      this.addPullButton(W / 2, y, Math.min(260, W - 32), h, 'multi', b);
      return;
    }
    const w = Math.floor((W - 32 - gap) / 2);
    this.addPullButton(16 + w / 2, y, w, h, 'single', b);
    this.addPullButton(W - 16 - w / 2, y, w, h, 'multi', b);
  }

  private addPullButton(x: number, y: number, w: number, h: number, type: PullType, b: BannerDef) {
    const multi = type === 'multi';
    const box = this.add.container(x, y);
    const skin = bakeButton(this, `gacha_pull_${type}_${w}x${h}`, multi
      ? { w, h, radius: 18, top: '#5a24a8', bottom: '#1e0a40', border: '#ffd34d', borderW: 3, lip: '#5a1e9c', lipH: 6, gloss: 0,
          glow: 'rgba(255,200,90,0.8)' }
      : { w, h, radius: 18, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 3, lip: '#a8650a', lipH: 6, gloss: 0 });
    box.add(this.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));

    const label = this.add.text(0, -13, multi ? '10회 소환' : '1회 소환', {
      fontSize: '21px', fontStyle: 'bold',
      color: multi ? '#ffffff' : '#5b2e0e', stroke: multi ? '#2a0a4a' : '#ffffff', strokeThickness: multi ? 6 : 5,
    }).setOrigin(0.5);
    if (multi) gradientText(label, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    box.add(label);

    // 값 알약
    const pg = this.add.graphics();
    pg.fillStyle(multi ? 0x000000 : 0x5a2e0e, multi ? 0.6 : 0.85).fillRoundedRect(-52, 7, 104, 24, 12);
    if (multi) pg.lineStyle(1, 0xffd34d).strokeRoundedRect(-52, 7, 104, 24, 12);
    box.add([
      pg,
      this.add.text(6, 19, String(pullPrice(b, type) ?? ''), { fontSize: '14px', color: '#fff0c2', fontStyle: 'bold' }).setOrigin(1, 0.5),
      this.add.text(10, 19, 'SKOR', { fontSize: '10px', color: '#ffd34d', fontStyle: 'bold' }).setOrigin(0, 0.5),
    ]);

    // 10회 할인 리본
    const pct = multi ? this.discountPct(b) : 0;
    if (pct > 0) {
      const rib = bakeButton(this, 'gacha_sale_ribbon', {
        w: 64, h: 22, radius: 8, top: '#ff6a5a', bottom: '#e8261a', border: '#5a0a00', borderW: 2, lip: '#5a0a00', lipH: 3, gloss: 0,
      });
      box.add([
        this.add.image(w / 2 - 30, -h / 2 - 2, rib.key).setOrigin(0.5, rib.originY),
        this.add.text(w / 2 - 30, -h / 2 - 3, `${pct}% 할인`, { fontSize: '11px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5),
      ]);
    }

    wireButton(this, box, w, h, () => void this.startPull(b, type), true);
  }

  /** 맨 아래 — 등급 합(한 칸 기준, 배경화면 포함)과 10회 확정 한 줄 (§2: 화면 문구는 한 칸 기준) */
  private buildRateFooter() {
    const r = this.lobbyRates;
    if (!r) return;
    const W = this.scale.width, H = this.scale.height, cx = W / 2;
    const f = (c: RateCell) => formatRate(c.slot);
    this.add.text(cx, H - LOBBY.foot1,
      `UR ${f(r.byGrade.UR)}%  ·  SR ${f(r.byGrade.SR)}%  ·  R ${f(r.byGrade.R)}%  ·  배경화면 ${f(r.byGrade.WP)}%`, {
        fontSize: '11px', color: '#d9c6f0', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
    this.add.text(cx, H - LOBBY.foot2, '한 칸 기준  ·  10회 뽑기는 SR 이상 1장 확정', {
      fontSize: '10px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0.7);
  }

  private drawTerminalChrome(isUR = false) {
    const borderColor = isUR ? 0xff3333 : 0x00ff41;
    const textColor   = isUR ? '#ff3333' : '#00ff41';
    const titleColor  = isUR ? '#cc0000' : '#00cc33';
    const title       = isUR ? 'root@krypt — [EMERGENCY OVERRIDE]' : 'root@krypt — entity_summon';
    const cx = this.scale.width / 2;
    const yOff = (this.scale.height - 600) / 2;
    this.terminalBaseY = 276 + yOff;
    this.terminalTextX = cx - 176; // 박스 왼쪽 가장자리(cx-185) + 9px 패딩

    this.add.rectangle(cx, 346 + yOff, 370, 192, 0x000000)
      .setStrokeStyle(1, borderColor, 0.8);
    this.add.text(cx - 179, 260 + yOff, '● ● ●', { fontSize: '11px', color: textColor });
    this.add.text(cx, 261 + yOff, title, {
      fontSize: '11px', color: titleColor, fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  // ═══════════════════════════════════════════════════
  // 창 — 확률 보기 · 고르기 · 확인
  // ═══════════════════════════════════════════════════

  /**
   * 창 하나 — 어둡게 깐 막 + 판 + 제목 + ×. 막의 판 밖을 누르면 닫힌다. 한 번에 하나 (새로 열면 앞의 것을 닫는다).
   * 창이 건 씬 입력 · 마스크는 onClose 로 정리한다 (clearUI 도 창을 닫는다)
   */
  private openPanel(pw: number, ph: number, title: string) {
    this.modal?.close();
    const W = this.scale.width, H = this.scale.height, cx = W / 2;
    const top = Math.round((H - ph) / 2), left = Math.round(cx - pw / 2);
    const rect = new Phaser.Geom.Rectangle(left, top, pw, ph);
    const overlay = this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.62).setDepth(200).setInteractive();
    const panel = this.add.container(0, 0).setDepth(201);
    const cleanups: (() => void)[] = [];
    const handle = {
      close: () => {
        if (this.modal !== handle) return;
        this.modal = null;
        cleanups.splice(0).forEach(f => f());
        overlay.destroy();
        panel.destroy();
      },
    };
    this.modal = handle;
    overlay.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!rect.contains(p.x, p.y)) handle.close(); });

    // 판 · 제목 — '보상 도착' 판과 같은 화법
    const key = `gacha_panel_${pw}x${ph}`;
    const skin = bakeButton(this, key, {
      w: pw, h: ph, radius: 20, top: '#2a1460', bottom: '#120626', border: '#d38bff', borderW: 3,
      lip: '#3a1478', lipH: 6, gloss: 0,
    });
    panel.add(this.add.image(cx, top + ph / 2, key).setOrigin(0.5, skin.originY));
    const t = this.add.text(cx, top + 26, title, { fontSize: '18px', fontStyle: 'bold', stroke: '#2a0a4a', strokeThickness: 4 }).setOrigin(0.5);
    gradientText(t, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    panel.add(t);
    const xb = this.add.container(left + pw - 24, top + 24);
    xb.add(this.add.text(0, -1, '×', { fontSize: '24px', color: '#d9c6f0', fontStyle: 'bold' }).setOrigin(0.5));
    panel.add(xb);
    wireButton(this, xb, 32, 32, () => handle.close());

    return { panel, top, left, close: handle.close, onClose: (f: () => void) => { cleanups.push(f); } };
  }

  /** 창 안 버튼 — 금(확인) · 흰(취소) */
  private panelButton(parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number,
    kind: 'gold' | 'white', label: string, onClick: () => void) {
    const box = this.add.container(x, y);
    const skin = bakeButton(this, `gacha_pbtn_${kind}_${w}x${h}`, kind === 'gold'
      ? { w, h, radius: 14, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 3, lip: '#a8650a', lipH: 5, gloss: 0 }
      : { w, h, radius: 14, top: '#f4f7fb', bottom: '#b8c2cf', border: '#2a3340', borderW: 2.5, lip: '#7a8594', lipH: 4, gloss: 0 });
    box.add(this.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
    box.add(this.add.text(0, -1, label, { fontSize: '16px', fontStyle: 'bold', color: kind === 'gold' ? '#5b2e0e' : '#2a3340' }).setOrigin(0.5));
    parent.add(box);
    wireButton(this, box, w, h, onClick);
  }

  /** 확인 창 — 본문 + [취소] [ok]. ok 를 누르면 창을 닫고 onOk */
  private openDialog(title: string, body: string, okLabel: string, onOk: () => void) {
    const W = this.scale.width;
    const pw = Math.min(320, W - 40);
    const text = this.add.text(0, 0, body, {
      fontSize: '15px', color: '#ffffff', fontStyle: 'bold', align: 'center', lineSpacing: 5,
      wordWrap: { width: pw - 44, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);
    const ph = 56 + Math.ceil(text.height) + 22 + 46 + 22;
    const ui = this.openPanel(pw, ph, title);
    text.setPosition(W / 2, ui.top + 52);
    ui.panel.add(text);
    const bw = Math.min(124, Math.floor((pw - 52) / 2)), by = ui.top + ph - 22 - 23;
    this.panelButton(ui.panel, W / 2 - bw / 2 - 6, by, bw, 46, 'white', '취소', () => ui.close());
    this.panelButton(ui.panel, W / 2 + bw / 2 + 6, by, bw, 46, 'gold', okLabel, () => { ui.close(); onOk(); });
  }

  /** 고르기 창 — 후보 초상 · 보유 여부 · 중복 수 (§5). 고르면 창을 닫고 onPick */
  private openChooser(title: string, ids: string[], note: string | null, onPick: (id: string) => void) {
    const W = this.scale.width, cx = W / 2;
    const cols = Math.min(4, Math.max(1, ids.length)), rows = Math.ceil(ids.length / cols), gap = 10;
    const pw = Math.min(360, W - 20);
    const tw = Math.min(72, Math.floor((pw - 28 - (cols - 1) * gap) / cols)), th = Math.round(tw * 4 / 3);
    const rowH = th + 46;
    const ph = 54 + (note ? 26 : 0) + rows * rowH + 70;
    const ui = this.openPanel(pw, ph, title);
    let y = ui.top + 50;
    if (note) {
      ui.panel.add(this.add.text(cx, y + 2, note, {
        fontSize: '12px', color: '#e8dcff', fontStyle: 'bold', align: 'center', wordWrap: { width: pw - 32, useAdvancedWrap: true },
      }).setOrigin(0.5, 0));
      y += 26;
    }
    const owned = new Set(getOwnedCharacters());
    ids.forEach((id, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const rowN = Math.min(cols, ids.length - r * cols);
      const x = cx - (rowN * tw + (rowN - 1) * gap) / 2 + c * (tw + gap) + tw / 2;
      const ty = y + r * rowH + 8 + th / 2;
      const tile = this.miniCard(x, ty, tw, th, id, true);
      const dup = getDuplicateCount(id);
      const have = owned.has(id);
      tile.add(this.add.text(0, th / 2 + 15, have ? (dup > 0 ? `보유 · 중복 ${dup}` : '보유') : '미보유', {
        fontSize: '11px', color: have ? '#9fe8a8' : '#b9a3d6', fontStyle: 'bold',
      }).setOrigin(0.5));
      ui.panel.add(tile);
      wireButton(this, tile, tw, th, () => { ui.close(); onPick(id); });
    });
    this.panelButton(ui.panel, cx, ui.top + ph - 22 - 22, 124, 44, 'white', '취소', () => ui.close());
  }

  /** 초보자 마지막 10연을 보장 UR 없이 누름 — 고르기 창을 먼저 띄우고, 고르면 뽑는다 (§3) */
  private openStarterPicker(b: BannerDef, then: () => void) {
    const max = b.starter?.maxPulls ?? 0;
    this.openChooser(`${max}번째 보장 UR 고르기`, [...(b.starter?.pickFrom ?? [])],
      `${max - 1}회 안에 UR이 없으면 ${max}번째에 고른 UR이 나와요`,
      id => { writeStore(STARTER_PICK_KEY, id); then(); });
  }

  /**
   * 확률 보기 — 그 배너의 한 칸 확률표 + 등급 합, 확률 안내 문구(§7)와 그 사이의 10회 확정 칸 표 · 10회 칸당 실효 표.
   * 숫자는 모두 ratesOf(banner) (서버 추첨과 같은 bannerRates), 이름은 명단 · exchangeChoicesOf 에서 채운다
   */
  private openRates(b: BannerDef) {
    const W = this.scale.width, H = this.scale.height;
    const rates = ratesOf(b);
    const pw = Math.min(380, W - 16), ph = Math.min(H - 40, 700);
    const ui = this.openPanel(pw, ph, `확률 보기 · ${bannerTitle(b)}`);
    const vp = new Phaser.Geom.Rectangle(ui.left + 10, ui.top + 50, pw - 20, ph - 50 - 16);
    const list = this.add.container(0, vp.y).setDepth(202);
    ui.onClose(() => list.destroy());
    const x0 = vp.x + 8, x1 = vp.right - 14;   // 오른쪽 14 = 스크롤 막대 자리
    let y = 4;

    const put = (x: number, s: string, style: Phaser.Types.GameObjects.Text.TextStyle, originX = 0) => {
      const t = this.add.text(x, y, s, style).setOrigin(originX, 0);
      list.add(t);
      return t;
    };
    const heading = (s: string) => {
      y += 8;
      y += put(x0, s, { fontSize: '15px', color: '#ffd34d', fontStyle: 'bold' }).height + 2;
    };
    const para = (s: string, indent = 0, color = '#e8dcff') => {
      y += put(x0 + indent, s, {
        fontSize: '12px', color, lineSpacing: 3, wordWrap: { width: x1 - x0 - indent, useAdvancedWrap: true },
      }).height + 4;
    };
    const rule = (alpha = 0.35) => {
      list.add(this.add.graphics().lineStyle(1, 0x8a7ab8, alpha).lineBetween(x0, y, x1, y));
    };
    const idName = (r: RateRow, id: string) => (r.kind === 'wallpaper' ? getWallpaperDef(id)?.name ?? id : nameOf(id));
    const rowLabel = (r: RateRow) => {
      const head = r.kind === 'wallpaper' ? '배경화면' : r.grade ?? '';
      const peer = rates.rows.some(o => o !== r && o.kind === r.kind && o.grade === r.grade);
      if (!peer) return head;
      if (!r.pickup) return `${head} 그 외`;
      return `${head} ${r.kind === 'wallpaper' ? '전용' : b.kind === 'event' ? '이벤트 픽업' : '픽업'}`;
    };
    /** 표 — 구분(이름은 아래 작은 글자) · 종당 · 합 */
    const table = (rows: RateRow[], cell: (c: RateCell) => number) => {
      const cE = x1 - 66;
      const hs = { fontSize: '11px', color: '#b9a3d6', fontStyle: 'bold' };
      put(x0, '구분', hs); put(cE, '종당', hs, 1);
      y += put(x1, '합', hs, 1).height + 2;
      rule(0.7);
      for (const r of rows) {
        y += 4;
        const style = { fontSize: '12px', color: gradeHex(r.grade), fontStyle: 'bold' };
        const lt = put(x0, rowLabel(r), style);
        put(cE, `${formatRate(cell(r.each))}%`, { ...style, color: '#ffffff' }, 1);
        put(x1, `${formatRate(cell(r.total))}%`, { ...style, color: '#ffffff' }, 1);
        y += lt.height;
        y += put(x0, r.ids.map(id => idName(r, id)).join(' · '), {
          fontSize: '10px', color: '#b9a3d6', lineSpacing: 2, wordWrap: { width: cE - 56 - x0, useAdvancedWrap: true },
        }).height + 4;
        rule();
      }
      y += 6;
    };

    // ── 전용 배경화면 — 로비에는 오른쪽 칸이 없어(니케식) 썸네일을 여기서 보인다 ──
    if (b.pickupWP.length) {
      heading(b.kind === 'event' ? '이벤트 전용 배경화면' : '픽업 전용 배경화면');
      const gap = 8, n = b.pickupWP.length;
      const tw = Math.min(104, Math.floor((x1 - x0 - gap * (n - 1)) / n)), th = Math.round(tw * 233 / 360);
      b.pickupWP.forEach((id, k) => {
        const x = x0 + k * (tw + gap) + tw / 2;
        list.add(this.wallpaperThumb(x, y + 2 + th / 2, tw, th, id));
        list.add(this.add.text(x, y + th + 8, getWallpaperDef(id)?.name ?? id, {
          fontSize: '10px', color: '#b9a3d6', fontStyle: 'bold', align: 'center', wordWrap: { width: tw, useAdvancedWrap: true },
        }).setOrigin(0.5, 0));
      });
      y += th + 8 + 30;
    }

    // ── 한 칸 확률 ──
    heading('한 칸 확률');
    para('뽑기 한 칸마다 이 확률로 캐릭터 또는 배경화면 하나가 나와요', 0, '#b9a3d6');
    table(rates.rows, c => c.slot);
    const sum = rates.byGrade.UR.slot + rates.byGrade.SR.slot + rates.byGrade.R.slot + rates.byGrade.WP.slot;
    para(`등급 합 — UR ${formatRate(rates.byGrade.UR.slot)}% · SR ${formatRate(rates.byGrade.SR.slot)}% · R ${formatRate(rates.byGrade.R.slot)}% · 배경화면 ${formatRate(rates.byGrade.WP.slot)}% · 합 ${formatRate(sum)}%`, 0, '#ffe58a');

    // ── 확률 안내 (§7 문구 — 이름 · 숫자는 배너 정의에서 채운다) ──
    const std = BANNERS.find(x => x.kind === 'standard');
    const pick = BANNERS.find(x => x.kind === 'pickup');
    const ev = BANNERS.find(x => x.kind === 'event');
    const starter = BANNERS.find(x => x.kind === 'starter');
    const names = (x: BannerDef) => exchangeChoicesOf(x).map(nameOf).join(' · ');
    heading('확률 안내');
    para('• 표의 확률은 뽑기 한 칸마다 적용되며, 모든 칸은 서로 독립입니다. 한 칸에서는 캐릭터 또는 배경화면 중 하나만 나오며, 배경화면의 확률도 함께 표시합니다.');
    para('• 픽업 배너에서 각 등급의 확률은 상시 뽑기와 같고, 그중 절반이 픽업 캐릭터에게 배정됩니다. 배경화면 확률의 절반은 픽업 캐릭터의 전용 배경화면에 배정됩니다.');
    para('• 10회 뽑기 확정: 10회 뽑기에서 앞의 9칸에 SR 이상 캐릭터가 없으면, 10번째 칸은 SR 이상 캐릭터 중에서 아래 \'확정 칸 확률\'로 결정됩니다(배경화면은 나오지 않습니다). 1회 뽑기에는 적용되지 않습니다. 이 규칙을 포함한 10회 뽑기의 칸당 실효 확률은 아래 표와 같습니다.');
    y += 2;
    put(x0 + 10, `확정 칸 확률 (SR 이상 = 100%) — 발동 확률 ${formatRate(rates.guaranteeTrigger)}%`, { fontSize: '12px', color: '#ffd34d', fontStyle: 'bold' });
    y += 20;
    table(rates.rows.filter(r => r.kind === 'character' && (r.grade === 'UR' || r.grade === 'SR')), c => c.guarantee);
    y += put(x0 + 10, '10회 뽑기 칸당 실효 확률', { fontSize: '12px', color: '#ffd34d', fontStyle: 'bold' }).height + 2;
    table(rates.rows, c => c.multi);
    para('• 천장(교환): 뽑을 때마다 그 배너의 천장 포인트가 1씩(10회 뽑기는 10) 쌓입니다. 포인트가 기준에 이르면 아래 캐릭터 1명과 교환할 수 있으며, 교환하면 기준만큼 포인트가 차감됩니다.');
    if (std?.pity) para(`- 상시 뽑기: ${std.pity.threshold}포인트 → 상시 UR 캐릭터 중 1명 선택 (${names(std)})`, 12);
    if (pick?.pity) para(`- 픽업 뽑기: ${pick.pity.threshold}포인트 → 그 배너의 픽업 UR 캐릭터`, 12);
    if (ev?.pity) para(`- 이벤트 픽업: ${ev.pity.threshold}포인트 → 이벤트 픽업 캐릭터 중 1명 선택 (${names(ev)})`, 12);
    para('천장 포인트는 확률을 바꾸지 않으며, 원하는 캐릭터가 뽑혀도 초기화되지 않습니다. 포인트는 배너마다 따로 쌓이며 다른 배너에서 쓸 수 없습니다. 초보자 뽑기에서는 천장 포인트가 쌓이지 않습니다.', 12);
    if (starter?.starter) {
      const max = starter.starter.maxPulls;
      para(`• 초보자 뽑기: 계정당 최대 ${max}회(10회 뽑기 ${Math.round(max / PULL_COUNT.multi)}번)입니다. 초보자 뽑기 ${max - 1}회 안에 UR이 한 번도 나오지 않으면 ${max}번째 칸은 미리 선택한 UR(${starter.starter.pickFrom.map(nameOf).join(' 또는 ')})로 확정됩니다.`);
    }
    para('• 이미 보유한 캐릭터가 나오거나 교환으로 받으면 중복으로 기록되어 각성에 쓰입니다. 이미 보유한 배경화면은 추가 효과가 없습니다.');
    para('• 확률은 반올림하여 표기합니다(1% 미만은 소수 셋째 자리, 10% 미만은 둘째 자리, 그 이상은 첫째 자리). 그래서 합이 100%와 조금 다를 수 있습니다.');
    y += 8;

    // ── 세로 스크롤 — 마스크로 자르고 손가락 · 휠로 끈다 (창 안에 눌리는 칸이 없어 clipToViewport 는 필요 없다) ──
    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillRect(vp.x, vp.y, vp.width, vp.height);
    list.setMask(mask.createGeometryMask());
    ui.onClose(() => mask.destroy());
    const maxScroll = Math.max(0, y - vp.height);
    let scroll = 0;
    const thumbH = maxScroll > 0 ? Math.max(30, vp.height * vp.height / y) : 0;
    const thumb = maxScroll > 0
      ? this.add.rectangle(vp.right - 5, vp.y, 4, thumbH, 0xd9c6f0, 0.6).setOrigin(0.5, 0).setDepth(203)
      : null;
    ui.onClose(() => thumb?.destroy());
    const apply = () => {
      list.y = vp.y - scroll;
      if (thumb) thumb.y = vp.y + (vp.height - thumbH) * (scroll / maxScroll);
    };
    let drag: { y: number; s: number } | null = null;
    const down = (p: Phaser.Input.Pointer) => { drag = vp.contains(p.x, p.y) ? { y: p.y, s: scroll } : null; };
    const move = (p: Phaser.Input.Pointer) => {
      if (!drag || !p.isDown) return;
      scroll = Phaser.Math.Clamp(drag.s + (drag.y - p.y), 0, maxScroll);
      apply();
    };
    const up = () => { drag = null; };
    const wheel = (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (!vp.contains(p.x, p.y)) return;
      scroll = Phaser.Math.Clamp(scroll + dy * 0.6, 0, maxScroll);
      apply();
    };
    this.input.on('pointerdown', down);
    this.input.on('pointermove', move);
    this.input.on('pointerup', up);
    this.input.on('wheel', wheel);
    ui.onClose(() => {
      this.input.off('pointerdown', down);
      this.input.off('pointermove', move);
      this.input.off('pointerup', up);
      this.input.off('wheel', wheel);
    });
    apply();
  }

  // ═══════════════════════════════════════════════════
  // 천장 교환
  // ═══════════════════════════════════════════════════

  /** [교환] — pickupUR 은 확인 창, chooseUR · chooseSR 은 고르기 창 → 확인 창 (§5). 후보는 exchangeChoicesOf */
  private onExchangeTap(b: BannerDef) {
    const p = b.pity;
    if (!p || this.modal) return;
    const ps = this.gstate?.pity[p.track];
    if (!ps) {
      this.showToast('천장 정보를 아직 불러오지 못했어요');
      return;
    }
    if (!ps.canExchange) {
      this.showToast(`천장 포인트가 ${p.threshold} 모이면 교환할 수 있어요`);
      return;
    }
    const choices = exchangeChoicesOf(b);
    if (p.exchange === 'pickupUR') {
      if (choices[0]) this.confirmExchange(b, choices[0], undefined);
      return;
    }
    this.openChooser(p.exchange === 'chooseUR' ? '교환할 UR 고르기' : '교환할 캐릭터 고르기', choices,
      `천장 ${p.threshold}을 써서 1명을 받아요`, id => this.confirmExchange(b, id, id));
  }

  /** 확인 창 — '레거시를 받고 천장 200을 씁니다' */
  private confirmExchange(b: BannerDef, id: string, targetId: string | undefined) {
    const name = nameOf(id);
    this.openDialog('천장 교환', `${name}${objectJosa(name)} 받고\n천장 ${b.pity?.threshold ?? ''}을 씁니다`, '교환',
      () => void this.doExchange(b, targetId));
  }

  /** 교환 호출 → 결과 카드 한 장 ('교환'). 영상 · 터미널은 없다. requestId 는 '다시 시도' 때만 (같은 교환으로 처리된다) */
  private async doExchange(b: BannerDef, targetId: string | undefined, requestId?: string) {
    const run = this.runId;
    this.clearUI();
    const W = this.scale.width, H = this.scale.height;
    this.resultBackdrop(0.7);
    this.add.text(W / 2, H / 2, '교환 중...', { fontSize: '16px', color: '#ffe9a8', fontStyle: 'bold' }).setOrigin(0.5);
    try {
      const r = await gachaExchange(b.id, targetId, { requestId });
      if (!this.isCurrent(run)) return;
      this.gstate = getCachedGachaState() ?? this.gstate;
      this.dataEpoch++;   // 이 응답보다 먼저 시작한 상태 조회는 낡았다 (교환 전 천장)
      this.pullBanner = b;
      this.pullResults = [r.character];
      this.wpResults = [];
      this.pullTags = [EXCHANGE_TAG];
      this.revealItems = [];
      this.remainingSkor = Math.max(0, this.skorBalance);
      this.applyPulled();
      await this.loadResultThumbs();
      if (!this.isCurrent(run)) return;
      this.showSummary();
    } catch (e) {
      if (!this.isCurrent(run)) return;
      const err = e instanceof GachaError ? e : null;
      this.buildLobby();
      if (err?.code === 'network') {
        this.openDialog('연결이 끊겼어요', '교환 결과를 받지 못했어요.\n다시 시도하면 같은 교환의 결과를 받아요\n(천장은 한 번만 쓰여요)', '다시 시도',
          () => void this.doExchange(b, targetId, err.requestId));
        return;
      }
      this.showToast(err?.code === 'pity_short' ? '천장 포인트가 모자라요'
        : err?.code === 'pity_target' ? '고를 수 없는 캐릭터예요'
          : err?.code === 'banner_closed' ? '이 배너는 지금 열려 있지 않아요'
            : '교환에 실패했어요 — 잠시 후 다시 시도해 주세요');
    }
  }

  // ═══════════════════════════════════════════════════
  // 알림
  // ═══════════════════════════════════════════════════

  private dropToast() {
    if (!this.toast) return;
    this.tweens.killTweensOf(this.toast);
    this.toast.destroy();
    this.toast = null;
  }

  /** 알림 판을 위에서 밀어 넣고 1.8초 뒤 위로 밀며 지운다 */
  private animateToast(box: Phaser.GameObjects.Container, y: number) {
    this.toast = box;
    box.setAlpha(0).setY(y - 16);
    this.tweens.add({ targets: box, alpha: 1, y, duration: 180, ease: 'Quad.easeOut' });
    this.tweens.add({
      targets: box, alpha: 0, y: y - 30, duration: 260, delay: 1800, ease: 'Quad.easeIn',
      onComplete: () => { if (this.toast === box) this.toast = null; box.destroy(); },
    });
  }

  /** 짧은 안내 — SKOR 부족 토스트와 같은 자리 · 같은 슬롯 (교환 조건 · 거절 사유) */
  private showToast(message: string) {
    this.dropToast();
    const W = this.scale.width;
    const tw = Math.min(320, W - 24), th = 46, y = 64 + th / 2;
    const box = this.add.container(W / 2, y).setDepth(1000);
    box.add(this.add.graphics()
      .fillStyle(0x000000, 0.35).fillRoundedRect(-tw / 2 + 2, -th / 2 + 4, tw, th, 14)
      .fillStyle(0x1e1236, 0.97).fillRoundedRect(-tw / 2, -th / 2, tw, th, 14)
      .lineStyle(2, 0xd38bff).strokeRoundedRect(-tw / 2, -th / 2, tw, th, 14));
    box.add(this.add.text(0, 0, message, {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold', align: 'center', wordWrap: { width: tw - 24, useAdvancedWrap: true },
    }).setOrigin(0.5));
    this.animateToast(box, y);
  }

  /**
   * SKOR 부족 토스트 (A안 — 위쪽 알림 판). SKOR 알약 바로 아래에 짙은 빨강 판 300x58:
   * 'SKOR 이 부족해요' + 보유 N / 필요 M + 모자란 비율 막대. 1.8초 뒤 위로 밀며 사라진다.
   * 연달아 누르면 쌓이지 않고 하나만 다시 뜬다. 로비 · 뽑기 결과의 1회 더 · 10회 더 가 같이 쓴다.
   * 시안: ddong-fx-work/small-screens/3_skor_toast/A_*.png
   */
  private showSkorToast(have: number, need: number) {
    this.dropToast();
    const W = this.scale.width;
    const tw = Math.min(300, W - 24), th = 58, y = 64 + th / 2;
    const L = -tw / 2;
    const box = this.add.container(W / 2, y).setDepth(1000);
    box.add(this.add.graphics()
      .fillStyle(0x000000, 0.35).fillRoundedRect(L + 2, -th / 2 + 4, tw, th, 16)
      .fillGradientStyle(0x5a0f22, 0x5a0f22, 0x2a0612, 0x2a0612, 0.97).fillRoundedRect(L, -th / 2, tw, th, 16)
      .lineStyle(2, 0xff6b6b).strokeRoundedRect(L, -th / 2, tw, th, 16));
    box.add(this.add.text(L + 30, 0, '💰', { fontSize: '22px' }).setOrigin(0.5));
    box.add(this.add.text(L + 54, -12, 'SKOR 이 부족해요', { fontSize: '15px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5));
    const parts: [string, string, string][] = [['보유', '#ffb3b3', '12px'], [have.toLocaleString(), '#ffd34d', '14px'], ['/ 필요', '#ffb3b3', '12px'], [need.toLocaleString(), '#ffd34d', '14px']];
    let x = L + 54;
    for (const [t, c, fs] of parts) {
      const o = this.add.text(x, 13, t, { fontSize: fs, color: c, fontStyle: 'bold' }).setOrigin(0, 0.5);
      box.add(o);
      x += o.width + 6;
    }
    // 모자란 비율 막대 — 보유 / 필요
    const bw = Math.max(40, Math.min(70, tw / 2 - 14 - (x - (L + tw / 2)))), bx = tw / 2 - 14 - bw;
    const frac = Phaser.Math.Clamp(have / need, 0, 1);
    box.add(this.add.graphics()
      .fillStyle(0x000000, 0.45).fillRoundedRect(bx, 13 - 5, bw, 10, 5)
      .fillStyle(0xff8a80).fillRoundedRect(bx, 13 - 5, Math.max(frac > 0 ? 10 : 0, bw * frac), 10, 5));
    this.animateToast(box, y);
  }

  // ═══════════════════════════════════════════════════
  // PULL FLOW
  // ═══════════════════════════════════════════════════

  /**
   * 뽑기 — 영상과 서버 호출을 같이 돌리고 터미널 → 리빌 → 결과로.
   * requestId 는 'network' 오류 뒤 '다시 시도' 때만 넘긴다 (배너 서버는 같은 요청의 첫 결과를 돌려준다).
   * 배너 이전 서버는 requestId 를 몰라 다시 차감하므로 화면 문구에 '두 번 차감되지 않는다'고 적지 않는다 (gacha.ts invokeGacha)
   */
  private async startPull(banner: BannerDef, type: PullType, requestId?: string) {
    const cost = pullPrice(banner, type);
    if (cost === null || this.modal) return;
    // '다시 시도'(같은 requestId)는 새 구매가 아니라 이미 보낸 뽑기의 결과 복구다 — 아래 사전 검사(잔액 · 초보자 보장)를
    // 건너뛰고 서버에 그대로 보낸다. 서버가 이미 차감했으면 지금 잔액은 그만큼 줄어 있어 '부족'으로 막히고 만다.
    // 판단은 서버가 한다 (배너 서버는 같은 requestId 의 첫 결과를 돌려준다 — 리뷰 7673febc P2)
    const recovery = requestId !== undefined;
    if (!recovery && this.skorBalance < 0) {
      const errMsg = this.add.text(this.scale.width / 2, this.scale.height - 196, '잔액 확인 중... 잠시 후 다시 시도하세요', {
        fontSize: '13px', color: '#ffaa44',
        stroke: '#000000', strokeThickness: 3,
        backgroundColor: '#00000099',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => { if (errMsg.active) errMsg.destroy(); });
      // 조회가 실패해 잔액을 끝내 모르는 경우 — 진행 중인 조회가 없으면 다시 읽는다
      if (this.refreshing === 0) void this.refreshLobby();
      return;
    }
    if (!recovery && this.skorBalance < cost) {
      this.showSkorToast(Math.floor(this.skorBalance), cost);
      return;
    }

    let starterPick: string | undefined;
    if (banner.kind === 'starter') {
      const st = this.gstate?.starter;
      const pick = this.starterPickOf(banner);
      // 마지막 10연인데 보장 UR 을 안 골랐다 — 고르기 창을 먼저 (서버는 고른 값이 없으면 거절한다, §3)
      if (!recovery && st && !st.urHit && !pick && st.pullsDone + PULL_COUNT[type] >= st.max) {
        this.openStarterPicker(banner, () => void this.startPull(banner, type, requestId));
        return;
      }
      starterPick = pick ?? undefined;
    }

    this.pullBanner = banner;
    this.clearUI();

    const count = PULL_COUNT[type];
    const run = this.runId;

    try {
      // ① 영상(6초) + API 호출 병렬 실행 — 영상 보는 동안 응답 대기
      // API가 먼저 완료되면 videoSkipResolver가 있을 경우 영상을 즉시 스킵
      this.videoSkipResolver = null;
      this.skipToSummary = false;
      const apiPromise = gachaPull(type, { bannerId: banner.id, starterPick, requestId }).then(r => {
        // 영상이 아직 재생 중이면 스킵 버튼 표시 (씬을 나갔다 들어왔으면 새 실행의 화면이다 — 건드리지 않는다)
        if (run === this.runId && this.videoSkipResolver) {
          const resolver = this.videoSkipResolver;
          this.addSkipButton(() => {
            if (resolver === this.videoSkipResolver) {
              this.videoSkipResolver = null;
              this.skipToSummary = true; // 터미널·리빌 건너뛰고 결과로 직행
              resolver();
            }
          });
        }
        return r;
      });
      const [result] = await Promise.all([apiPromise, this.playCommonVideo()]);

      if (!this.isCurrent(run)) return;

      this.pullResults = result.characters;
      this.wpResults = result.wallpapers ?? [];
      this.pullTags = result.characters.map(c => (c.guaranteed ? GUARANTEE_TAG[c.guaranteed] : null));
      this.remainingSkor = result.remainingSkor;
      // 천장 · 초보자 — gachaPull 이 응답으로 캐시를 고쳐 둔다
      this.gstate = getCachedGachaState() ?? this.gstate;
      // 슬롯 순서 보존: 캐릭터 → 배경 순 통합 큐
      this.revealItems = [
        ...result.characters.map(c => ({ kind: 'character' as const, data: c })),
        ...(result.wallpapers ?? []).map(w => ({ kind: 'wallpaper' as const, data: w })),
      ];
      this.revealItemIndex = 0;

      this.applyPulled();
      this.skorBalance = result.remainingSkor;
      cacheSkorBalance(result.remainingSkor);
      this.dataEpoch++;   // 이 응답보다 먼저 시작한 잔액 · 상태 조회는 낡았다

      // ② 영상 스킵 시 결과 화면으로 직행
      if (this.skipToSummary) {
        this.skipToSummary = false;
        await Promise.all([this.loadWallpaperBgs(this.wpResults.map(w => w.id)), this.loadResultThumbs()]);
        if (!this.isCurrent(run)) return;
        this.showSummary();
        return;
      }

      // ② 터미널 애니메이션 (UR이면 중반부터 빨간 에러 스타일로 전환)
      const isUR = result.video === 'red'
      this.skipTerminal = false;
      this.clearUI();
      this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000);
      this.drawTerminalChrome(false); // 항상 초록으로 시작
      this.addSkipButton(() => { this.skipTerminal = true; });
      await this.runTerminalAnimation(count, isUR);
      if (!this.isCurrent(run)) return;
      this.skipTerminal = false;

      // ③ 캐릭터별 개인 영상 + 배경화면 이미지 동적 로드 → 리빌
      await Promise.all([
        this.loadCharVideos(result.characters.map(c => c.id)),
        this.loadWallpaperBgs(this.wpResults.map(w => w.id)),
        this.loadResultThumbs(),
      ]);
      if (!this.isCurrent(run)) return;

      this.showNextReveal();
    } catch (e) {
      if (!this.isCurrent(run)) return;
      this.videoSkipResolver = null;
      this.onPullError(e, banner, type, cost);
    }
  }

  /**
   * 뽑기 실패 — 로비로 돌아가 이유별로 알린다 (GachaError.code).
   * 'network' 는 뽑혔는지 모르는 상태라 같은 requestId 로 '다시 시도'를 띄운다
   */
  private onPullError(e: unknown, banner: BannerDef, type: PullType, cost: number) {
    const err = e instanceof GachaError ? e : null;
    if (!err) console.error('[GachaScene] 뽑기 실패:', e);
    // 서버가 본 잔액을 먼저 넣는다 — 로비가 그 값으로 그려지고, 로비가 새로 거는 조회는 그 뒤의 것이라 버려지지 않는다
    if (err?.code === 'insufficient_skor' && err.balance !== null) {
      this.skorBalance = err.balance;
      cacheSkorBalance(err.balance);
      this.dataEpoch++;
    }
    this.buildLobby();
    switch (err?.code) {
      case 'insufficient_skor':
        this.showSkorToast(Math.floor(err.balance ?? Math.max(0, this.skorBalance)), cost);
        return;
      case 'starter_pick_required':
        this.openStarterPicker(banner, () => void this.startPull(banner, type));
        return;
      case 'network':
        this.openDialog('연결이 끊겼어요', '뽑기 결과를 받지 못했어요.\n다시 시도하면 방금 뽑기의 결과를 받아 와요', '다시 시도',
          () => void this.startPull(banner, type, err.requestId));
        return;
      case 'banner_closed':
        this.showToast('이 배너는 지금 열려 있지 않아요');
        return;
      case 'starter_done':
        this.showToast('초보자 뽑기를 모두 사용했어요');
        return;
      default:
        this.showToast('뽑기에 실패했어요 — 잠시 후 다시 시도해 주세요');
    }
  }

  /** 받은 캐릭터 · 배경화면을 보유 · 중복에 반영하고 결과 표시 정보(각성)를 만든다 — 뽑기 · 교환이 같이 쓴다 */
  private applyPulled() {
    // ① 결과의 신규 캐릭터 즉시 저장 (sync 실패 대비 fallback)
    this.pullResults.filter(c => c.isNew).forEach(c => addOwnedCharacter(c.id));
    // ① 중복 캐릭터 각성 카운트 업데이트 — 올리기 전후 각성 단계를 비교해 '각성 달성' 을 적어 둔다
    this.pullMeta = this.pullResults.map(c => {
      if (c.isNew) return { awakenUp: false, level: 0 };
      const before = getDuplicateCount(c.id);
      setDuplicateCount(c.id, before + 1);
      const lv0 = getAwakeningLevel(c.grade, before), lv1 = getAwakeningLevel(c.grade, before + 1);
      return { awakenUp: lv1 > lv0, level: lv1 };
    });
    // ① 신규 배경화면 즉시 저장 (sync 실패 대비 fallback)
    this.wpResults.filter(w => w.isNew).forEach(w => addOwnedWallpaper(w.id));
    // ② 서버 DB 전체 동기화 (비동기, 에러 로그만)
    syncOwnedCharacters().catch(e => console.error('[GachaScene] syncOwnedCharacters 실패:', e));
    syncOwnedWallpapers().catch(e => console.error('[GachaScene] syncOwnedWallpapers 실패:', e));
  }

  private async runTerminalAnimation(count: number, isUR = false): Promise<void> {
    if (isUR) {
      const red = '#ff3333';
      // 초반: 정상처럼 초록으로 시작
      await this.typeLines([
        `> EXECUTE entity_summon(n=${count})`,
        '> Establishing connection...',
      ], 18);
      await this.progressBar(400);
      await this.typeLines([
        '> CONN: OK  [sec-layer bypassed]',
        '> Scanning entity pool...',
      ], 16);
      await this.progressBar(350);
      // 이상 감지 시점부터 빨간색으로 전환
      await this.typeLines([
        '> [WARN] Anomaly detected',
        '> [ERR]  Containment failure',
      ], 18, red);
      await this.progressBar(450, red);
      await this.typeLines([
        '> [CRIT] Unknown entity detected',
        `> [!!!]  ${count} ENTR${count > 1 ? 'IES' : 'Y'} ESCAPED CONTAINMENT`,
        '> EMERGENCY EXTRACTION . . .',
      ], 20, red);
    } else {
      await this.typeLines([
        `> EXECUTE entity_summon(n=${count})`,
        '> Establishing connection...',
      ], 18);
      await this.progressBar(400);
      await this.typeLines([
        '> CONN: OK  [sec-layer bypassed]',
        '> Scanning entity pool...',
      ], 16);
      await this.progressBar(350);
      await this.typeLines([
        '> Anomaly detected in sector 7',
        '> Overriding...',
      ], 18);
      await this.progressBar(450);
      await this.typeLines([
        `> ${count} ENTR${count > 1 ? 'IES' : 'Y'} LOCKED`,
        '> EXTRACTING . . .',
      ], 20);
    }
    await this.sleep(200);
  }

  /** 영상 원본 비율을 유지하면서 캔버스 안에 꽉 차게 (contain) */
  private fitVideoToCanvas(vid: Phaser.GameObjects.Video, canvasW: number, canvasH: number) {
    vid.setDisplaySize(canvasW, canvasH); // 초기값

    const applyContain = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el: HTMLVideoElement | null = (vid as any).video ?? null;
      const nw = el?.videoWidth  || 0;
      const nh = el?.videoHeight || 0;
      if (nw > 0 && nh > 0) {
        const scale = Math.max(canvasW / nw, canvasH / nh);
        vid.setDisplaySize(Math.round(nw * scale), Math.round(nh * scale));
      }
    };

    vid.once('play', applyContain);
    this.time.delayedCall(100, applyContain);
    this.time.delayedCall(500, applyContain);
  }

  private loadWallpaperBgs(ids: string[]): Promise<void> {
    const toLoad = ids.filter(id => {
      const def = WALLPAPERS.find(w => w.id === id);
      return def && !this.textures.exists(def.bgKey);
    });
    if (toLoad.length === 0) return Promise.resolve();

    return new Promise(resolve => {
      toLoad.forEach(id => {
        const def = WALLPAPERS.find(w => w.id === id);
        if (def) { this.ownKeys.add(def.bgKey); this.load.image(def.bgKey, def.bgPath); }
      });
      this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, resolve);
      this.load.start();
    });
  }

  /**
   * 배경화면 획득 카드 (A안 — 가로 카드). 뽑기 결과 캐릭터 카드와 같은 판 결:
   * 수집 썸네일(ui/collection/wp)을 360x233 카드로 크게 · 청록 테두리와 글로우 · 등급 자리에 '배경화면' 칩.
   * 신규 = NEW + 반짝이, 중복 = 카드를 어둡게 + '보유 중'. 배경은 그 배경화면을 어둡게 깐다.
   * 1회 뽑기의 마지막 장이면 이 카드가 곧 결과 화면이라 SKOR 알약과 1회 더 · 10회 더 · 닫기가 붙는다.
   * 시안: ddong-fx-work/small-screens/1_wallpaper_card/A_*.png
   */
  private showWallpaperRevealCard(wp: PulledWallpaper, def: BackgroundDef | undefined) {
    this.clearUI();
    const { width: W, height: H } = this.cameras.main;
    const cx = W / 2;
    const isLast = this.revealItemIndex >= this.revealItems.length - 1;
    const final = isLast && this.pullResults.length <= 1;   // 1회 뽑기의 마지막 장 = 결과 화면

    // ── 배경: 그 배경화면을 어둡게 ──
    if (def && this.textures.exists(def.bgKey)) addBackground(this, def.bgKey, W, H);
    else this.add.rectangle(cx, H / 2, W, H, 0x050515);
    this.add.rectangle(cx, H / 2, W, H, 0x0a0618, 0.55);

    // ── 카드 (360x233, 폭이 모자라면 줄인다) ──
    const cw = Math.min(360, W - 30), ch = Math.round(cw * 233 / 360);
    const btnY = H - 80;
    const cy = final ? Math.min(H * 0.35, btnY - 46 - 160 - ch / 2) : H * 0.39;
    const card = this.add.container(cx, cy);
    const frame = bakeButton(this, `gacha_wpframe_${cw}x${ch}`, {
      w: cw + 8, h: ch + 8, radius: 18, top: '#9fe8ff', bottom: WP_CARD_TEAL_HEX, border: '#06324a', borderW: 3,
      lip: '#06324a', lipH: 5, gloss: 0, glow: 'rgba(64,200,255,0.8)',
    });
    card.add(this.add.image(0, 0, frame.key).setOrigin(0.5, frame.originY));
    const src = `gacha_wp_${wp.id}`;
    if (this.textures.exists(src)) {
      const img = this.add.image(0, 0, bakeRoundedImage(this, `gacha_wpR_${wp.id}_${cw}`, src, cw, ch, 14)).setDisplaySize(cw, ch);
      if (!wp.isNew) img.setTint(0x8a8a8a);            // 중복은 어둡게
      card.add(img);
    } else if (def && this.textures.exists(def.bgKey)) {
      card.add(this.add.image(0, 0, def.bgKey).setDisplaySize(cw, ch));
    }
    // '배경화면' 칩 (등급 자리, 왼쪽 위) · NEW / 보유 중 (오른쪽 위). edge = 칩의 바깥 끝 x, side = 그 끝이 왼쪽(-1)/오른쪽(+1)
    const chip = (edge: number, side: -1 | 1, label: string, fill: number, stroke: number, color: string) => {
      const y = -ch / 2 + 23;
      const t = this.add.text(0, y, label, { fontSize: '13px', color, fontStyle: 'bold' }).setOrigin(0.5);
      const w = t.width + 26, x = edge - side * w / 2;
      t.setX(x);
      card.add(this.add.graphics().fillStyle(fill, 0.92).fillRoundedRect(x - w / 2, y - 13, w, 26, 13).lineStyle(2, stroke).strokeRoundedRect(x - w / 2, y - 13, w, 26, 13));
      card.add(t);
    };
    chip(-cw / 2 + 12, -1, '배경화면', 0x0a1a2e, WP_CARD_TEAL, '#e8f8ff');
    if (wp.isNew) card.add(this.newTag(cw / 2 - 38, -ch / 2 + 23, 54));
    else chip(cw / 2 - 12, 1, '보유 중', 0x1e1236, 0x8a7ab8, '#e6dcff');
    card.setScale(0.6).setAlpha(0);
    this.tweens.add({
      targets: card, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut',
      onComplete: () => { if (wp.isNew) this.sparkles(cx, cy, cw + 8, ch + 8, 'SR', WP_CARD_TEAL); },
    });

    // ── 이름 · 설명 · 한 줄 ──
    const nameY = cy + ch / 2 + 44;
    const name = this.add.text(cx, nameY, def?.name ?? wp.id, { fontSize: '36px', fontStyle: 'bold', stroke: '#06223a', strokeThickness: 6 }).setOrigin(0.5);
    gradientText(name, [[0, '#ffffff'], [0.55, '#bdf0ff'], [1, '#5ad1ff']]);
    const parts: Phaser.GameObjects.GameObject[] = [name];
    if (def?.description) {
      parts.push(this.add.text(cx, nameY + 38, def.description, { fontSize: '14px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5));
    }
    parts.push(this.add.text(cx, nameY + 64, wp.isNew ? '설정에서 바로 바꿀 수 있어요' : '이미 가진 배경화면이에요', {
      fontSize: '12px', color: wp.isNew ? '#9fdcff' : '#b9a3d6', fontStyle: 'bold',
    }).setOrigin(0.5));
    parts.forEach(p => (p as Phaser.GameObjects.Text).setAlpha(0));
    this.tweens.add({ targets: parts, alpha: 1, duration: 300, delay: 300 });

    // ── 1회 뽑기 결과면 버튼, 아니면 탭 진행 ──
    if (final) {
      this.resultButtons(btnY);
      return;
    }
    const hint = this.add.text(cx, H - 40, isLast ? '화면을 누르면 결과로' : `화면을 누르면 다음으로  (${this.revealItemIndex + 1}/${this.revealItems.length})`, {
      fontSize: '12px', color: '#b9a3d6',
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: { from: 0.35, to: 1 }, duration: 600, yoyo: true, repeat: -1 });

    // 10연차: 결과 화면으로 바로 건너뛰기
    if (this.revealItems.length > 1) {
      this.addSkipButton(() => {
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.input.off('pointerdown');
        this.showSummary();
      });
    }
    // 700ms 뒤 탭 진행 · 10뽑기는 3.5초 자동
    this.time.delayedCall(700, () => {
      if (!this.scene.isActive()) return;
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        this.input.off('pointerdown', advance);
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.revealItemIndex++;
        this.showNextReveal();
      };
      this.input.on('pointerdown', advance);
      if (this.revealItems.length > 1) this.time.delayedCall(3500, () => { if (this.scene.isActive()) advance(); });
    });
  }

  private loadCharVideos(ids: string[]): Promise<void> {
    const toLoad = ids.filter(
      id => CHARS_WITH_VIDS.has(id) && !this.cache.video.exists(`vid_${id}`)
    );
    if (toLoad.length === 0) return Promise.resolve();

    return new Promise(resolve => {
      toLoad.forEach(id => this.load.video(`vid_${id}`, `assets/vids/${id}.mp4`));
      this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, resolve); // 실패해도 진행
      this.load.start();
    });
  }

  private playCommonVideo(_videoType?: string): Promise<void> {
    return new Promise(resolve => {
      const { width, height } = this.cameras.main;
      this.clearUI();
      this.add.rectangle(width / 2, height / 2, width, height, 0x000000);

      const key = 'gacha';
      if (!this.cache.video.exists(key)) { resolve(); return; }

      const vid = this.add.video(width / 2, height / 2, key);
      vid.play(false);
      this.fitVideoToCanvas(vid, width, height);

      // videoSkipResolver에 저장 → API 완료 후 addSkipButton에서 호출
      const doResolve = () => {
        this.videoSkipResolver = null;
        destroyVideo(vid);
        resolve();
      };
      this.videoSkipResolver = doResolve;
      vid.on('complete', doResolve);
      this.time.delayedCall(12000, doResolve); // 12초 failsafe
      // 스킵 버튼은 API 응답 완료 후 startPull에서 추가됨
    });
  }

  // ═══════════════════════════════════════════════════
  // CHARACTER REVEAL
  // ═══════════════════════════════════════════════════

  private showNextReveal() {
    if (this.revealItemIndex >= this.revealItems.length) {
      this.showSummary();
      return;
    }

    const item = this.revealItems[this.revealItemIndex];

    // 배경화면 슬롯이면 배경 리빌 카드로 분기
    if (item.kind === 'wallpaper') {
      const def = getWallpaperDef(item.data.id);
      this.showWallpaperRevealCard(item.data, def);
      return;
    }

    const pulled = item.data;
    const def = getCharacterDef(pulled.id);

    const { width, height } = this.cameras.main;
    this.clearUI();

    const vidKey = `vid_${pulled.id}`;
    if (this.cache.video.exists(vidKey)) {
      const vid = this.add.video(width / 2, height / 2, vidKey);
      vid.play(false);
      this.fitVideoToCanvas(vid, width, height);

      let proceeded = false;
      const proceed = () => {
        if (proceeded) return;
        proceeded = true;
        this.input.off('pointerdown', proceed);
        destroyVideo(vid);
        this.revealOrFinish(pulled, def);
      };

      this.addSkipButton(() => {
        if (proceeded) return;
        proceeded = true;
        this.input.off('pointerdown', proceed);
        destroyVideo(vid);
        // 10연차: 영상 스킵 시 남은 리빌 전체 건너뛰고 결과 화면으로
        if (this.revealItems.length > 1) {
          this.showSummary();
        } else {
          this.revealOrFinish(pulled, def);
        }
      });
      vid.on('complete', proceed);
      this.time.delayedCall(10000, proceed); // failsafe
      this.input.once('pointerdown', proceed); // 탭으로 스킵
    } else {
      this.revealOrFinish(pulled, def);
    }
  }

  /** 1회 뽑기면 리빌 카드가 곧 결과 화면(버튼 포함), 아니면 슬롯 리빌 */
  private revealOrFinish(pulled: PulledCharacter, def: CharacterDef) {
    if (this.isSingleOnly()) this.showSummary();
    else this.showRevealCard(pulled, def);
  }

  // ═══════════════════════════════════════════════════
  // RESULT CARD (A안) — 수집 카드를 그대로 크게 / 10회는 등급순 5x2 + 배경화면 줄
  // 시안: ddong-fx-work/gacha-result/A_*.png
  // 강조는 테두리 글로우 · 반짝이 파티클 · 확대·흔들림 · 배경 어둡게 누르기로만 한다.
  // 방사형 빛살(바퀴살처럼 뻗는 빛줄기)은 쓰지 않는다 — 욱일기처럼 보인다 (대표 지시 2026-10-07)
  // ═══════════════════════════════════════════════════

  /**
   * 나갈 때 이 씬의 그림을 내린다 — 진열 일러스트(768x1344, 장당 약 4MB) 6장 + 배경 등 GPU 약 27MB 가
   * 씬을 나가도 남았다 (2026-10-07 측정). 진열은 풀스크린 배경이라 썸네일로 바꾸면 화질이 떨어져 내리는 쪽을 골랐다.
   * 내리는 것: 이 씬 전용 접두사 gacha_* 전부 + 이 씬이 직접 올린 일러스트(illust_*) · 배경화면 큰 그림(wp_*_bg).
   * 남기는 것: 게임 스프라이트 · 등급 그림(다른 씬과 같이 쓴다), 원래 있던 키.
   * 순서: DisplayList 의 SHUTDOWN 리스너가 부팅 때 걸려 먼저 돈다 — 여기 올 때는 이 그림을 쓰던 이미지가 이미 다 부서져 있다
   */
  private releaseTextures() {
    for (const key of this.textures.getTextureKeys()) {
      const own = this.ownKeys.has(key) && (key.startsWith('illust_') || /^wp_.+_bg$/.test(key));
      if (key.startsWith('gacha_') || own) this.textures.remove(key);
    }
    this.ownKeys.clear();
  }

  /** 1회 뽑기(배경화면 없음)면 리빌 카드가 곧 결과 화면이다 */
  private isSingleOnly(): boolean {
    return this.pullResults.length === 1 && this.wpResults.length === 0;
  }

  /** 결과에 쓰는 썸네일 — ui/collection 의 card · wp 만 (일러스트 원본은 올리지 않는다) */
  private loadResultThumbs(): Promise<void> {
    const want: [string, string][] = [
      ...this.pullResults.map(c => [`gacha_card_${c.id}`, `assets/ui/collection/card/${c.id}.webp`] as [string, string]),
      ...this.wpResults.map(w => [`gacha_wp_${w.id}`, `assets/ui/collection/wp/${w.id}.webp`] as [string, string]),
    ].filter(([k]) => !this.textures.exists(k));
    if (want.length === 0) return Promise.resolve();
    return new Promise(resolve => {
      for (const [k, p] of want) this.load.image(k, p);
      this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
      this.load.start();
    });
  }

  /** 등급색 판 — 색은 CharacterDef.gradeColor 하나에서 밝게·어둡게 뽑는다 */
  private gradeFrame(def: CharacterDef, w: number, h: number, radius: number, glow: boolean): { key: string; originY: number } {
    const base = Phaser.Display.Color.HexStringToColor(def.gradeColor);
    const hex = (c: Phaser.Display.Color) => `#${c.color.toString(16).padStart(6, '0')}`;
    const top = hex(base.clone().lighten(30));
    const border = hex(base.clone().darken(55));
    const key = `gacha_frame_${def.grade}_${w}x${h}${glow ? '_g' : ''}`;
    const r = bakeButton(this, key, {
      w, h, radius, top, bottom: def.gradeColor, border, borderW: def.grade === 'R' ? 2 : 3,
      lip: border, lipH: w > 120 ? 6 : 3, gloss: 0,
      glow: glow ? `rgba(${base.red},${base.green},${base.blue},0.86)` : undefined,
    });
    return { key: r.key, originY: r.originY };
  }

  private newTag(x: number, y: number, w: number): Phaser.GameObjects.GameObject[] {
    return [
      this.add.graphics().fillStyle(0xff3b2f).fillRoundedRect(x - w / 2, y - 10, w, 20, 10)
        .lineStyle(1.5, 0x5a0a00).strokeRoundedRect(x - w / 2, y - 10, w, 20, 10),
      this.add.text(x, y, 'NEW', { fontSize: '11px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5),
    ];
  }

  /** 중복 꼬리표 — 각성이 올랐으면 금색 '각성 ★N 달성!', 아니면 '중복 +1' */
  private dupTag(x: number, y: number, w: number, meta: PullMeta, px: number): Phaser.GameObjects.GameObject[] {
    const up = meta.awakenUp;
    const label = this.add.text(x, y, up ? `각성 ★${meta.level} 달성!` : '중복 +1', {
      fontSize: `${px}px`, color: up ? '#5a2a00' : '#d9c6f0', fontStyle: 'bold',
    }).setOrigin(0.5);
    const tw = Math.max(w, label.width + 14), th = px + 10;
    const g = this.add.graphics().fillStyle(up ? 0xffd34d : 0x140e28, up ? 1 : 0.86).fillRoundedRect(x - tw / 2, y - th / 2, tw, th, th / 2)
      .lineStyle(1.2, up ? 0x5a2a00 : 0x8a7ab8).strokeRoundedRect(x - tw / 2, y - th / 2, tw, th, th / 2);
    this.children.bringToTop(label);   // 폭을 재려고 글자를 먼저 만들었다 — 판 위로 올린다
    return [g, label];
  }

  /** 반짝이 — 카드 테두리를 따라 작은 빛 점이 떠오른다. UR 은 촘촘하게, SR 은 드문드문, R 은 없음 */
  private sparkles(cx: number, cy: number, w: number, h: number, grade: string, color: number, depth = 0) {
    if (grade !== 'UR' && grade !== 'SR') return;
    const key = bakeRadialGlow(this, 'gacha_spark', 32);
    const ur = grade === 'UR';
    const e = this.add.particles(0, 0, key, {
      emitZone: { type: 'edge', source: new Phaser.Geom.Rectangle(cx - w / 2, cy - h / 2, w, h), quantity: 48 },
      lifespan: { min: 700, max: 1300 },
      speedY: { min: -40, max: -10 },
      speedX: { min: -12, max: 12 },
      scale: { start: ur ? 0.42 : 0.3, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, color],
      blendMode: Phaser.BlendModes.ADD,
      frequency: ur ? 70 : 160,
      maxAliveParticles: ur ? 28 : 12,
    }).setDepth(depth);
    e.explode(ur ? 24 : 10);
    e.start();
  }

  /** 배경 — 뽑기 배경 + 어둡게 누르기 (높은 등급일수록 더 어둡게 눌러 카드를 띄운다) */
  private resultBackdrop(dim: number) {
    const { width: W, height: H } = this.cameras.main;
    if (this.textures.exists('gacha_background')) addBackground(this, 'gacha_background', W, H);
    else this.add.rectangle(W / 2, H / 2, W, H, 0x050510);
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, dim);
  }

  /**
   * 큰 수집 카드 (230x306 기준, k 배) — 등급색 판 + 카드 + 등급 + NEW, 아래 금빛 이름과 한 줄.
   * 확대되며 나타나고, UR 은 화면이 짧게 흔들린다. tag = 카드 아래쪽 작은 글자 ('SR 확정' · '보장' · '교환')
   */
  private drawBigCard(pulled: PulledCharacter, def: CharacterDef, meta: PullMeta, cx: number, cy: number, k: number, tag: string | null) {
    const kw = Math.round(230 * k), kh = Math.round(306 * k);
    const ur = def.grade === 'UR';
    const card = this.add.container(cx, cy);
    const frame = this.gradeFrame(def, kw + 10, kh + 10, 16, ur || def.grade === 'SR');
    card.add(this.add.image(0, 0, frame.key).setOrigin(0.5, frame.originY));
    const src = `gacha_card_${pulled.id}`;
    if (this.textures.exists(src)) {
      const key = bakeRoundedImage(this, `gacha_cardR_${pulled.id}_${kw}`, src, kw, kh, 10, 0.15);
      card.add(this.add.image(0, 0, key).setDisplaySize(kw, kh));
    } else if (this.textures.exists(def.imageKey)) {
      card.add(this.add.rectangle(0, 0, kw, kh, 0x111122));
      card.add(this.add.image(0, 0, def.imageKey).setDisplaySize(kh * 0.4, kh * 0.63));
    }
    const gk = getGradeImgKey(def.grade);
    if (gk) card.add(this.add.image(-kw / 2 + 30 * k, -kh / 2 + 30 * k, gk).setDisplaySize(56 * k, 56 * k));
    if (pulled.isNew) card.add(this.newTag(kw / 2 - 32 * k, -kh / 2 + 22 * k, 52));
    if (tag) card.add(this.tagPill(0, kh / 2 - 22 * k, tag, Math.max(11, Math.round(14 * k))));

    card.setScale(0.6).setAlpha(0);
    this.tweens.add({
      targets: card, scale: 1, alpha: 1, duration: 450, ease: 'Back.easeOut',
      onComplete: () => {
        if (ur) this.cameras.main.shake(220, 0.006);
        this.sparkles(cx, cy, kw + 10, kh + 10, def.grade, getGradeColorInt(def));
      },
    });

    const name = this.add.text(cx, cy + kh / 2 + 36, def.name, {
      fontSize: '40px', fontStyle: 'bold', stroke: '#2a0a00', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0);
    gradientText(name, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    const subY = cy + kh / 2 + 72;
    const parts: Phaser.GameObjects.GameObject[] = [name];
    if (pulled.isNew) {
      parts.push(this.add.text(cx, subY, `${def.grade} 새로운 캐릭터를 얻었어요!`, {
        fontSize: '15px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5));
    } else {
      parts.push(...this.dupTag(cx, subY, 90, meta, 13));
    }
    parts.forEach(p => (p as Phaser.GameObjects.Text).setAlpha?.(0));
    this.tweens.add({ targets: parts, alpha: 1, duration: 300, delay: 350 });
  }

  /** 결과 카드의 작은 글자 — 'SR 확정' · '보장' · '교환' (§5, 연출 없이 글자만) */
  private tagPill(x: number, y: number, label: string, px: number): Phaser.GameObjects.GameObject[] {
    const t = this.add.text(x, y, label, { fontSize: `${px}px`, color: '#ffe08a', fontStyle: 'bold' }).setOrigin(0.5);
    const tw = t.width + 12, th = px + 9;
    const g = this.add.graphics().fillStyle(0x140e28, 0.9).fillRoundedRect(x - tw / 2, y - th / 2, tw, th, th / 2)
      .lineStyle(1.2, 0xffd34d).strokeRoundedRect(x - tw / 2, y - th / 2, tw, th, th / 2);
    this.children.bringToTop(t);   // 폭을 재려고 글자를 먼저 만들었다 — 판 위로 올린다
    return [g, t];
  }

  /**
   * 아래 줄 — SKOR 알약 + 1회 더 · 10회 더 · 닫기. 폭이 모자라면 뽑기 버튼만 줄인다.
   * 뽑은 배너(pullBanner)로 다시 뽑는다 — 초보자는 1회가 없고, 50회를 다 쓰면 10회 더 도 없다 (닫으면 탭이 사라진다)
   */
  private resultButtons(y: number) {
    const W = this.scale.width, cx = W / 2;
    const b = this.pullBanner;
    const st = this.gstate?.starter;
    const single = pullPrice(b, 'single'), multi = pullPrice(b, 'multi');
    const multiLeft = b.kind !== 'starter' || (st !== undefined && st.pullsDone < st.max);
    const pulls: { w: number; kind: 'gold' | 'purple'; label: string; price: number; type: PullType }[] = [];
    if (single !== null) pulls.push({ w: 150, kind: 'gold', label: '1회 더', price: single, type: 'single' });
    if (multi !== null && multiLeft) pulls.push({ w: 170, kind: 'purple', label: '10회 더', price: multi, type: 'multi' });
    const gap = 8, h = 56;
    const closeW = pulls.length ? 56 : 140;
    const base = pulls.reduce((s, p) => s + p.w, 0);
    const fit = base ? Math.min(1, (W - 24 - pulls.length * gap - closeW) / base) : 1;
    const ws = pulls.map(p => Math.floor(p.w * fit));
    let x = cx - (ws.reduce((s, w) => s + w, 0) + pulls.length * gap + closeW) / 2;

    // SKOR 알약
    const pw = 150;
    this.add.graphics().fillStyle(0x0a0618, 0.84).fillRoundedRect(cx - pw / 2, y - 46 - 13, pw, 26, 13)
      .lineStyle(1.5, 0xffd34d).strokeRoundedRect(cx - pw / 2, y - 46 - 13, pw, 26, 13);
    this.add.text(cx, y - 46, `💰 ${Math.floor(this.remainingSkor).toLocaleString()} SKOR`, {
      fontSize: '13px', color: '#fff0c2', fontStyle: 'bold',
    }).setOrigin(0.5);

    const make = (x: number, w: number, kind: 'gold' | 'purple' | 'white', label: string, sub: string | null, onClick: () => void) => {
      const box = this.add.container(x, y);
      const skin = bakeButton(this, `gacha_res_${kind}_${w}`, kind === 'gold'
        ? { w, h, radius: 16, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 3, lip: '#a8650a', lipH: 5, gloss: 0 }
        : kind === 'purple'
          ? { w, h, radius: 16, top: '#5a24a8', bottom: '#1e0a40', border: '#ffd34d', borderW: 3, lip: '#5a1e9c', lipH: 5, gloss: 0, glow: 'rgba(255,200,90,0.6)' }
          : { w, h, radius: 16, top: '#f4f7fb', bottom: '#b8c2cf', border: '#2a3340', borderW: 2.5, lip: '#7a8594', lipH: 4, gloss: 0 });
      box.add(this.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
      const tc = kind === 'gold' ? '#5b2e0e' : kind === 'purple' ? '#ffe08a' : '#2a3340';
      const st = kind === 'gold' ? '#ffffff' : '#2a0a4a';
      if (sub) {
        box.add(this.add.text(0, -9, label, { fontSize: '17px', color: tc, fontStyle: 'bold', stroke: st, strokeThickness: 3 }).setOrigin(0.5));
        box.add(this.add.text(0, 12, sub, { fontSize: '11px', color: tc, fontStyle: 'bold' }).setOrigin(0.5));
      } else {
        box.add(this.add.text(0, 0, label, { fontSize: '16px', color: tc, fontStyle: 'bold' }).setOrigin(0.5));
      }
      wireButton(this, box, w, h, onClick, true);
    };
    pulls.forEach((p, i) => {
      make(x + ws[i] / 2, ws[i], p.kind, p.label, `${p.price} SKOR`, () => void this.startPull(b, p.type));
      x += ws[i] + gap;
    });
    make(x + closeW / 2, closeW, 'white', '닫기', null, () => this.buildLobby());
  }

  /** 슬롯 하나의 리빌 (10회 · 배경화면 섞인 뽑기) — 큰 카드 + 탭 안내. 1회 뽑기는 곧장 결과(showSummary)로 */
  private showRevealCard(pulled: PulledCharacter, def: CharacterDef) {
    this.clearUI();
    const { width: W, height: H } = this.cameras.main;
    const cx = W / 2;
    this.resultBackdrop(def.grade === 'UR' ? 0.68 : 0.58);

    const idx = this.pullResults.indexOf(pulled);
    const meta = this.pullMeta[idx] ?? { awakenUp: false, level: 0 };
    const k = Math.min(1, (H - 260) / 306);
    this.drawBigCard(pulled, def, meta, cx, 48 + 306 * k / 2 + (H - 600) / 4, k, this.pullTags[idx] ?? null);

    const isLast = this.revealItemIndex >= this.revealItems.length - 1;
    const hint = isLast ? 'TAP → RESULTS' : `TAP → NEXT  (${this.revealItemIndex + 1}/${this.revealItems.length})`;
    const tapHint = this.add.text(cx, H - 40, hint, { fontSize: '13px', color: '#9a9fb0', fontFamily: 'monospace' }).setOrigin(0.5);
    this.tweens.add({ targets: tapHint, alpha: { from: 0.3, to: 1 }, duration: 600, yoyo: true, repeat: -1 });

    // 10연차: 결과 화면으로 바로 건너뛰기
    if (this.revealItems.length > 1) {
      this.addSkipButton(() => {
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.input.off('pointerdown');
        this.showSummary();
      });
    }

    // 탭 진행 (700ms 디바운스) · 10뽑기는 3.5초 자동 진행
    this.time.delayedCall(700, () => {
      if (!this.scene.isActive()) return;
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        this.input.off('pointerdown', advance);
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.revealItemIndex++;
        this.showNextReveal();
      };
      this.input.on('pointerdown', advance);
      if (this.revealItems.length > 1) {
        this.time.delayedCall(3500, () => { if (this.scene.isActive()) advance(); });
      }
    });
  }

  // ═══════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════

  private showSummary() {
    this.clearUI();
    const { width: W, height: H } = this.cameras.main;
    const cx = W / 2;
    const btnY = H - 80;

    // 1회 뽑기 — 큰 카드 하나가 곧 결과
    if (this.isSingleOnly()) {
      const pulled = this.pullResults[0];
      const def = getCharacterDef(pulled.id);
      this.resultBackdrop(def.grade === 'UR' ? 0.68 : 0.6);
      const skorY = btnY - 46;
      const room = skorY - 30 - 40;                 // 카드 + 이름 두 줄이 들어갈 높이
      const k = Math.min(1, (room - 100) / 306);
      const blockTop = 40 + Math.max(0, (room - (306 * k + 100)) / 2);
      this.drawBigCard(pulled, def, this.pullMeta[0] ?? { awakenUp: false, level: 0 }, cx, blockTop + 306 * k / 2, k, this.pullTags[0] ?? null);
      this.resultButtons(btnY);
      return;
    }

    this.resultBackdrop(0.62);
    const title = this.add.text(cx, 40, '소환 결과', { fontSize: '26px', fontStyle: 'bold', stroke: '#2a0a4a', strokeThickness: 4 }).setOrigin(0.5);
    gradientText(title, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    const nNew = this.pullResults.filter(p => p.isNew).length;
    const counts = [`신규 ${nNew}`, `중복 ${this.pullResults.length - nNew}`];
    if (this.wpResults.length) counts.push(`배경화면 ${this.wpResults.length}`);
    this.add.text(cx, 68, counts.join(' · '), { fontSize: '13px', color: '#d9c6f0', fontStyle: 'bold' }).setOrigin(0.5);

    // ── 캐릭터 카드 — 등급순 5열 (UR → SR → R, 같은 등급은 뽑은 순서) ──
    const RANK: Record<string, number> = { UR: 0, SR: 1, R: 2 };
    const order = this.pullResults.map((p, i) => ({ p, meta: this.pullMeta[i] ?? { awakenUp: false, level: 0 }, tag: this.pullTags[i] ?? null }))
      .sort((a, b) => (RANK[a.p.grade] ?? 3) - (RANK[b.p.grade] ?? 3));
    const gx = 6, gy = 34;
    const kw = Math.min(84, Math.floor((W - 24 - 4 * gx) / 5));
    const kh = Math.round(kw * 112 / 84);
    const top = 92;
    order.forEach(({ p, meta, tag }, i) => {
      const def = getCharacterDef(p.id);
      const rowN = Math.min(5, order.length - Math.floor(i / 5) * 5);
      const rx0 = cx - (rowN * kw + (rowN - 1) * gx) / 2;
      const x = rx0 + (i % 5) * (kw + gx) + kw / 2;
      const y = top + Math.floor(i / 5) * (kh + gy) + kh / 2;
      const ur = def.grade === 'UR';
      const items: Phaser.GameObjects.GameObject[] = [];
      const frame = this.gradeFrame(def, kw + 6, kh + 6, 10, ur);
      items.push(this.add.image(x, y, frame.key).setOrigin(0.5, frame.originY));
      const src = `gacha_card_${p.id}`;
      if (this.textures.exists(src)) {
        const img = this.add.image(x, y, bakeRoundedImage(this, `gacha_cardR_${p.id}_${kw}`, src, kw, kh, 8, 0.15)).setDisplaySize(kw, kh);
        if (!p.isNew) img.setTint(0x9a9a9a);      // 중복은 어둡게
        items.push(img);
      }
      const gk = getGradeImgKey(def.grade);
      if (gk) items.push(this.add.image(x - kw / 2 + 14, y - kh / 2 + 14, gk).setDisplaySize(22, 22));
      if (p.isNew) items.push(...this.newTag(x + kw / 2 - 21, y - kh / 2 + 12, 38));
      if (tag) items.push(...this.tagPill(x, y + kh / 2 - 28, tag, 9));
      items.push(this.add.rectangle(x, y + kh / 2 - 9, kw, 18, 0x0a0616, 0.75));
      items.push(this.add.text(x, y + kh / 2 - 9, def.name, { fontSize: '11px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
      if (!p.isNew) items.push(...this.dupTag(x, y + kh / 2 + 15, kw - 4, meta, 9));
      items.forEach(o => (o as Phaser.GameObjects.Image).setAlpha(0));
      this.tweens.add({
        targets: items, alpha: 1, duration: 220, delay: i * 70,
        onStart: () => { if (ur) this.sparkles(x, y, kw + 6, kh + 6, 'UR', getGradeColorInt(def)); },
      });
    });

    // ── 배경화면 — 아래 가로 줄 ──
    const rows = Math.ceil(order.length / 5);
    let wy = top + rows * (kh + gy) + 4;
    this.wpResults.forEach((wp, i) => {
      const def = getWallpaperDef(wp.id);
      const rh = 62;
      const g = this.add.graphics().fillStyle(WP_ACCENT_INT, 0.12).fillRoundedRect(16, wy, W - 32, rh, 12)
        .lineStyle(1.5, WP_ACCENT_INT).strokeRoundedRect(16, wy, W - 32, rh, 12);
      const items: Phaser.GameObjects.GameObject[] = [g];
      const src = `gacha_wp_${wp.id}`;
      if (this.textures.exists(src)) {
        items.push(this.add.image(22, wy + 5, bakeRoundedImage(this, `gacha_wpR_${wp.id}`, src, 84, 52, 6)).setOrigin(0).setDisplaySize(84, 52));
      }
      items.push(this.add.text(118, wy + 20, '배경화면', { fontSize: '11px', color: WP_ACCENT_HEX, fontStyle: 'bold' }).setOrigin(0, 0.5));
      items.push(this.add.text(118, wy + 42, def?.name ?? wp.id, { fontSize: '17px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5));
      if (wp.isNew) items.push(...this.newTag(W - 52, wy + 31, 44));
      items.forEach(o => (o as Phaser.GameObjects.Image).setAlpha(0));
      this.tweens.add({ targets: items, alpha: 1, duration: 220, delay: (order.length + i) * 70 });
      wy += rh + 8;
    });

    this.resultButtons(btnY);
  }

  // ═══════════════════════════════════════════════════
  // 터미널 헬퍼
  // ═══════════════════════════════════════════════════

  private addSkipButton(onClick: () => void) {
    const skipX = this.scale.width - 37;
    const skipY = 28 + (this.scale.height - 600) / 2;
    // 판 하나만 눌린다 (30 → 손가락 크기 44 로 넓힌다). 누르는 즉시 처리 — 리빌의 '화면 탭 → 다음' 보다 먼저 받아야 한다
    const bg = setTouchInteractive(this.add.rectangle(skipX, skipY, 88, 30, 0x000000, 0.6));
    const txt = this.add.text(skipX, skipY, 'SKIP  ▶▶', {
      fontSize: '12px', color: '#777777', fontFamily: 'monospace',
    }).setOrigin(0.5);
    bg.on('pointerover', () => txt.setColor('#cccccc'));
    bg.on('pointerout',  () => txt.setColor('#777777'));
    bg.on('pointerdown', onClick);
  }

  private clearUI() {
    // 창이 떠 있으면 먼저 닫는다 — 창이 건 씬 입력 · 마스크를 정리한다
    this.modal?.close();
    this.modal = null;
    this.inLobby = false;
    this.slideshowActive = false;
    this.slideshowBgA = null;
    this.slideshowBgB = null;
    this.slideshowRateText = null;
    this.slideTimer = null;
    this.faceChips = [];
    this.toast = null;         // 아래에서 같이 부서진다
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.input.off('pointerdown');
    this.input.off('pointermove');
    this.input.off('pointerup');
    this.input.off('wheel');
    this.children.getAll().forEach(c => {
      // Video는 UUID 텍스처까지 함께 제거 (일반 destroy는 텍스처를 남김)
      if (c instanceof Phaser.GameObjects.Video) destroyVideo(c);
      else c.destroy();
    });
    this.terminalTexts = [];
  }

  private typeLines(lines: string[], delay = 40, color = '#00ff41'): Promise<void> {
    return lines.reduce(
      (p, line) => p.then(() => this.typeLine(line, delay, color)),
      Promise.resolve()
    );
  }

  private typeLine(text: string, charDelay = 40, color = '#00ff41'): Promise<void> {
    return new Promise(resolve => {
      if (!this.scene.isActive() || this.skipTerminal) { resolve(); return; }

      // 최대 6줄 유지 (스크롤 효과)
      if (this.terminalTexts.length >= 6) {
        this.terminalTexts.shift()?.destroy();
        this.terminalTexts.forEach((t, i) => t.setY(this.terminalBaseY + i * 22));
      }

      const y = this.terminalBaseY + this.terminalTexts.length * 22;
      const t = this.add.text(this.terminalTextX, y, '', {
        fontSize: '13px', color, fontFamily: 'monospace',
        wordWrap: { width: 352 },
      });
      this.terminalTexts.push(t);

      let i = 0;
      const ev = this.time.addEvent({
        delay: charDelay,
        repeat: text.length,
        callback: () => {
          if (!this.scene.isActive() || this.skipTerminal) { ev.destroy(); resolve(); return; }
          t.setText(text.substring(0, i + 1));
          i++;
          if (i > text.length) { ev.destroy(); resolve(); }
        },
      });
    });
  }

  private progressBar(duration: number, color = '#00ff41'): Promise<void> {
    return new Promise(resolve => {
      if (!this.scene.isActive() || this.skipTerminal) { resolve(); return; }

      if (this.terminalTexts.length >= 6) {
        this.terminalTexts.shift()?.destroy();
        this.terminalTexts.forEach((t, i) => t.setY(this.terminalBaseY + i * 22));
      }

      const y = this.terminalBaseY + this.terminalTexts.length * 22;
      const bar = this.add.text(this.terminalTextX, y, '> [          ]  0%', {
        fontSize: '13px', color, fontFamily: 'monospace',
        wordWrap: { width: 352 },
      });
      this.terminalTexts.push(bar);

      let step = 0;
      const steps = 10;
      const ev = this.time.addEvent({
        delay: duration / steps,
        repeat: steps - 1,
        callback: () => {
          step++;
          bar.setText(`> [${'█'.repeat(step)}${' '.repeat(steps - step)}] ${step * 10}%`);
          if (this.skipTerminal || step >= steps) { ev.destroy(); resolve(); }
        },
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.scene.isActive() || this.skipTerminal) { resolve(); return; }
      this.time.delayedCall(ms, resolve);
    });
  }
}
