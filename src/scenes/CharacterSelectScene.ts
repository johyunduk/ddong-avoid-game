import Phaser from 'phaser';
import {
  CHARACTERS,
  getVisibleCharacters,
  grantUnreleasedForTest,
  getOwnedCharacters,
  getSelectedCharacter,
  setSelectedCharacter,
  getDuplicateCount,
  getAwakeningLevel,
  getGradeImgKey,
  type CharacterDef,
} from '../utils/character';
import {
  WALLPAPERS,
  GACHA_WP_IDS,
  DEFAULT_WP_IDS,
  getOwnedWallpapers,
  getSelectedWallpaper,
  setSelectedWallpaper,
  type BackgroundDef,
} from '../utils/wallpaper';
import { syncOwnedCharacters, syncOwnedWallpapers, visibleBanners } from '../utils/gacha';
import { VideoReel, newReelMemo, type ReelMemo } from '../utils/videoReel';
import { standardPool } from '../config/banners';
import { getSynergy, type WallpaperSynergy } from '../config/synergyMap';
import {
  AWAKENING_THRESHOLDS, MAX_AWAKENING_LEVEL, MAX_DEFINED_AWAKENING_LEVEL,
  awakeningLevelOf, getAwakeningEffectText, getNextAwakening, type AwakeningGrade,
} from '../config/awakening';
import BaseScene from './BaseScene';
import { textContentHeight, textContentWidth } from '../utils/textSafety';
import { bakeButton, clipToViewport, gradientText, hitRect, MIN_TOUCH, setTouchInteractive, wireButton, type ButtonSkin } from '../utils/buttonSkin';

/**
 * 수집 화면 — 배치 두 가지를 COLLECTION_LAYOUT 하나로 고른다 (docs/ui-collection.md).
 *   'A' 가챠 카드 컬렉션 (지금, 대표 지시 2026-10-06) — 히어로 배너 + 진행 막대·등급 필터 + 일러스트 카드 3열
 *   'C' 쇼케이스 + 미리보기 — 아래 설명
 * 둘 다 같은 탭·스크롤·장착/적용·상세 패널을 쓴다. 다른 것은 위쪽(배너/쇼케이스)과 격자 모양뿐
 *
 * C안:
 *   위 = 쇼케이스: 캐릭터 탭은 고른 캐릭터의 일러스트를 크게, 배경화면 탭은 게임 화면 미리보기
 *        (배경 + 장착 캐릭터 + 똥). 이름·등급·별·한 줄 설명과 장착/적용 버튼
 *   아래 = 격자: 캐릭터는 얼굴 칩 5열, 배경화면은 썸네일 2열. 칩을 누르면 **위 쇼케이스만** 바뀐다 —
 *        장착·적용은 버튼으로 한다 (잘못 눌러 바뀌지 않게)
 *
 * 메모리: 칩·썸네일은 assets/ui/collection/ 의 작은 그림(ddong-fx-work/collection-ui/bake_ingame.py 가 굽는다).
 * 일러스트(768x1344)·배경(720x1080)은 **지금 보는 것만** 그때그때 올린다. 구운 그림이 없는 캐릭터는
 * 게임 스프라이트, 배경은 원본으로 대신한다.
 */
const COLLECTION_LAYOUT = 'A' as 'A' | 'C';
type GradeFilter = 'all' | 'UR' | 'SR' | 'R';

// 표시할 전체 배경화면 = 기본 제공 + 가챠 (wallpaper.ts WALLPAPERS 기준 자동 파생)
const AVAILABLE_WP_SET = new Set([...DEFAULT_WP_IDS, ...GACHA_WP_IDS]);

/** 등급별 칩 테두리 (위·아래 그라데이션) — 메인 화면 버튼과 같은 말씨 */
const GRADE_FRAME: Record<string, [string, string]> = {
  UR: ['#ffe58a', '#ff9f1a'],
  SR: ['#9db8ff', '#6a3cff'],
  R: ['#8ef0c0', '#1f9a64'],
};
const OTHER_FRAME: [string, string] = ['#b8b8c8', '#5a5a6a'];
/** 등급별 바깥 발광 (A안 카드·배너) */
const GRADE_GLOW: Record<string, string> = {
  UR: 'rgba(255,190,60,0.85)', SR: 'rgba(130,110,255,0.75)', R: 'rgba(70,220,150,0.7)',
};
const LOCK_FRAME: [string, string] = ['#3a3a48', '#22222c'];
const BG_DARK = 0x0a0a16;

const CHIP_COLS = 5;
const CHIP_GAP_Y = 10;
const WP_COLS = 2;
const WP_GAP = 12;

// 각성 단계 (별 개수)
const STAR_COUNT = 5;

/** 한 줄 설명 — 기본 효과 앞부분 (굵게 표시용 ** 는 뺀다) */
function shortLine(s: string, max = 44): string {
  const t = s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!t || t === '없음') return '기본 캐릭터 · 특수 능력 없음';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** 목적격 조사 — 끝 글자에 받침이 있으면 '을', 없으면 '를' (한글이 아니면 '를') */
function objectJosa(word: string): string {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '을' : '를';
}

/** 배너 아래 필터 줄(수집 진행 · 등급 칩)의 세로 가운데 — 배너 아래끝(sh)에서 */
const FILTER_ROW_DY = MIN_TOUCH / 2;

/** 캐릭터 상세 (B 탭 시트형) 탭 */
type DetailTab = 'ability' | 'awaken' | 'synergy';
const DETAIL_TAB_LABEL: Record<DetailTab, string> = { ability: '능력', awaken: '각성', synergy: '시너지' };
/**
 * 캐릭터 상세 배치 — mediaRatio = 위 영상 · 일러스트 칸 (화면 높이 비율, 시트가 그 아래), sheetOverlap = 그림을 시트 밑으로 더 깔아
 * 둥근 모서리 틈이 비지 않게, nameDy = 시트 위 이름 줄, tabH = 탭 줄 높이, buttonArea = 아래 버튼 칸 (내용 창은 그 위까지)
 */
const DETAIL = { mediaRatio: 0.55, sheetOverlap: 20, nameDy: 26, tabH: 44, buttonArea: 76, sheetColor: 0x140a2a } as const;

export default class CharacterSelectScene extends BaseScene {
  private returnScene: string = 'ModeSelectScene';
  private selectedId: string = 'chibi';
  private ownedIds: string[] = [];
  private _preSyncDupCounts: Map<string, number> = new Map();

  // 탭
  private activeTab: 'character' | 'wallpaper' = 'character';
  private ownedWpIds: string[] = [];
  private selectedWpId: string | null = null;
  private tabHi!: Phaser.GameObjects.Image;
  private tabLabels: Phaser.GameObjects.Text[] = [];
  private tabX: number[] = [];

  // 쇼케이스 (위) — 지금 보고 있는 캐릭터 / 배경화면
  private focusedId = 'chibi';
  private focusedWpId = '';
  private showcase!: Phaser.GameObjects.Container;
  private sh = 400;                 // 쇼케이스(A: 배너) 아래 끝
  private bannerTop = 98;           // A안 배너 위 끝
  private bannerMaskG: Phaser.GameObjects.Graphics | null = null;
  private gradeFilter: GradeFilter = 'all';
  private filterBox!: Phaser.GameObjects.Container;

  // 격자 (아래, 스크롤)
  private cardsContainer!: Phaser.GameObjects.Container;
  private cellPos = new Map<string, { x: number; y: number; w: number; h: number }>();
  private focusRing!: Phaser.GameObjects.Graphics;
  private equipBadge!: Phaser.GameObjects.Container;
  private countText!: Phaser.GameObjects.Text;
  private gridTop = 0;
  private gridBottom = 0;
  private scrollOffset = 0;
  /** 격자 창 (화면 좌표) — 칸이 이 밖에서는 눌리지 않는다 */
  private gridViewport = new Phaser.Geom.Rectangle();
  private maxScrollOffset = 0;
  private pointerDownY = 0;
  private pointerDownScrollY = 0;
  private hasDragged = false;
  private hasPointerDownInScene = false; // 이 씬에서 pointerdown이 발생했는지 추적 (bleed-through 방지)
  private maskGfx!: Phaser.GameObjects.Graphics;
  /**
   * 받는 중인 그림 → 기다리는 쪽(이름표 → 콜백). 같은 그림을 쇼케이스와 상세가 같이 기다릴 수 있다 —
   * 예전에는 받는 중이면 새 콜백을 버려서, 쇼케이스가 받는 사이 '능력 보기'를 누르면 상세가 끝내 안 열렸다 (리뷰 ccdc7f0a P1)
   */
  private loadingKeys = new Map<string, Map<string, { ready: () => void; fail?: () => void }>>();
  /** 이 씬이 직접 올린 큰 그림 (일러스트 · 배경화면 큰 그림) — 나갈 때 내린다. 원래 있던 키는 남긴다 */
  private ownKeys = new Set<string>();
  /** 이번 방문에서 서버 동기화 뒤 이미 한 번 재시작했다 — 다시 동기화하지 않는다 (재시작 루프 안전망) */
  private syncedThisVisit = false;

  // 캐릭터 상세 (B 탭 시트형)
  private detailPanel: Phaser.GameObjects.Container | null = null;
  private detailTab: DetailTab = 'ability';
  /** 시트 내용 창 (스크롤) · 그 마스크 · 스크롤 막대 · 스크롤 입력 풀기 */
  private detailContent: Phaser.GameObjects.Container | null = null;
  private detailMask: Phaser.GameObjects.Graphics | null = null;
  private detailThumb: Phaser.GameObjects.Rectangle | null = null;
  private detailScrollOff: (() => void) | null = null;
  /** 위 영상 (utils/videoReel — 뽑기 로비와 같이 쓴다) · 이 실행에서 못 받은 영상 · 자동재생 막힘 기록 */
  private detailReel: VideoReel | null = null;
  private videoMemo: ReelMemo = newReelMemo();
  /** 그림을 기다리는 상세 — 마지막으로 누른 캐릭터만 연다 (그사이 다른 캐릭터를 누르면 그쪽) */
  private pendingDetailId: string | null = null;

  constructor() {
    super('CharacterSelectScene');
  }

  init(data: { returnScene?: string; synced?: boolean }) {
    this.returnScene = data.returnScene ?? 'ModeSelectScene';
    this.syncedThisVisit = data.synced === true;
    this.ownKeys = new Set();   // preload 가 채운다 — create 에서 비우면 안 된다
    this.videoMemo = newReelMemo();
  }

  preload() {
    for (const char of CHARACTERS) {
      if (!this.textures.exists(char.imageKey)) {
        this.load.image(char.imageKey, char.imagePath);
      }
      // 격자 그림 — C안 얼굴 칩(128px) / A안 카드(216x288). 없는 캐릭터는 로드 실패로 넘어가고 스프라이트로 대신한다
      const [gk, gf] = COLLECTION_LAYOUT === 'A' ? [`cs_card_${char.id}`, 'card'] : [`cs_face_${char.id}`, 'face'];
      if (!this.textures.exists(gk)) this.load.image(gk, `assets/ui/collection/${gf}/${char.id}.webp`);
    }
    // 일러스트(768×1344, 디코드 시 각 4MB+)는 쇼케이스에 처음 뜨는 "현재 선택 캐릭터"만 사전 로드.
    // 나머지는 칩을 눌러 볼 때 온디맨드 로드 (전량 로드 시 텍스처 메모리 ~95MB 상주)
    const selDef = CHARACTERS.find(c => c.id === getSelectedCharacter()) ?? CHARACTERS[0];
    if (COLLECTION_LAYOUT === 'A') {
      // A안 배너는 일러스트 원본 대신 구운 가로 크롭 (장착 캐릭터 것만 먼저)
      if (!this.textures.exists(`cs_banner_${selDef.id}`)) this.load.image(`cs_banner_${selDef.id}`, `assets/ui/collection/banner/${selDef.id}.webp`);
    } else if (!this.textures.exists(selDef.illustKey)) {
      this.ownKeys.add(selDef.illustKey);
      this.load.image(selDef.illustKey, selDef.illustPath);
    }
    // 배경화면 — 격자는 작은 썸네일만. 큰 배경(720x1080)은 쇼케이스에서 볼 때 한 장씩
    for (const wp of WALLPAPERS.filter(w => AVAILABLE_WP_SET.has(w.id))) {
      if (!this.textures.exists(`cs_wp_${wp.id}`)) this.load.image(`cs_wp_${wp.id}`, `assets/ui/collection/wp/${wp.id}.webp`);
    }
    const selWp = WALLPAPERS.find(w => w.id === getSelectedWallpaper());
    if (selWp && !this.textures.exists(selWp.bgKey)) { this.ownKeys.add(selWp.bgKey); this.load.image(selWp.bgKey, selWp.bgPath); }
    // 배경화면 미리보기의 똥
    if (!this.textures.exists('poop_smile')) this.load.image('poop_smile', 'assets/poops/poop_smile.webp');
    // 등급 이미지
    if (!this.textures.exists('grade_r'))  this.load.image('grade_r',  'assets/character_ranks/r.png');
    if (!this.textures.exists('grade_sr')) this.load.image('grade_sr', 'assets/character_ranks/sr.png');
    if (!this.textures.exists('grade_ur')) this.load.image('grade_ur', 'assets/character_ranks/ur.png');
  }

  create() {
    super.create();

    this.selectedId = getSelectedCharacter();
    // 미공개 캐릭터를 실기에서 확인하려면 보유 상태여야 한다 (카드의 '선택'이 보유로 갈린다).
    // 테스트 스위치가 꺼져 있으면 아무 일도 안 한다
    grantUnreleasedForTest();
    this.ownedIds = getOwnedCharacters();
    this.ownedWpIds = getOwnedWallpapers();
    this.selectedWpId = getSelectedWallpaper();
    this.activeTab = 'character';
    this.focusedId = this.selectedId;
    const wps = WALLPAPERS.filter(w => AVAILABLE_WP_SET.has(w.id));
    this.focusedWpId = this.selectedWpId ?? wps[0]?.id ?? '';
    this.scrollOffset = 0;
    this.gradeFilter = 'all';
    this.bannerMaskG = null;
    this.hasDragged = false;
    this.hasPointerDownInScene = false;
    this.cellPos.clear();
    this.tabLabels = [];
    this.loadingKeys.clear();
    // 씬 인스턴스 재사용 대비 stale 참조 리셋 (상세 패널 연 채로 씬 이탈 시 스크롤 가드가 막히는 것 방지)
    this.detailPanel = null;
    this.detailContent = null;
    this.detailMask = null;
    this.detailThumb = null;
    this.detailScrollOff = null;
    this.detailReel = null;
    this.pendingDetailId = null;

    // 동기화 전 각성 수치 스냅샷 (동기화 후 변화 감지용)
    this._preSyncDupCounts = new Map(
      CHARACTERS
        .filter(c => this.ownedIds.includes(c.id) && c.grade !== '등급외')
        .map(c => [c.id, getDuplicateCount(c.id)])
    );

    // 서버 DB와 동기화 — 소유 목록 or 각성 수치가 바뀐 경우 씬 재시작해서 카드 갱신.
    // 재시작은 방문당 한 번만 — 재시작한 판(synced)에서는 다시 동기화하지 않는다.
    // 동기화가 매번 '바뀜'을 내면 재시작이 끝없이 돌고 그동안 BaseScene 입력 가드가 계속 다시 걸려 버튼이 안 눌린다
    if (!this.syncedThisVisit) syncOwnedCharacters().then(synced => {
      if (!this.scene.isActive()) return;
      const ownedChanged = synced.length !== this.ownedIds.length ||
        synced.some(id => !this.ownedIds.includes(id));
      const awakeChanged = CHARACTERS.some(c =>
        synced.includes(c.id) && c.grade !== '등급외' &&
        getDuplicateCount(c.id) !== this._preSyncDupCounts.get(c.id)
      );
      if (ownedChanged || awakeChanged) this.scene.restart({ returnScene: this.returnScene, synced: true });
    }).catch(() => { /* 네트워크 오류 시 로컬 상태 유지 */ });

    // 배경화면 동기화 (비동기, UI 갱신 없이 진행 — 다음 방문 시 반영)
    syncOwnedWallpapers().then(synced => {
      if (!this.scene.isActive()) return;
      const wpChanged = synced.length !== this.ownedWpIds.length ||
        synced.some(id => !this.ownedWpIds.includes(id));
      if (wpChanged) {
        this.ownedWpIds = synced;
        if (this.activeTab === 'wallpaper') { this.rebuildGrid(); this.renderShowcase(); }
      }
    }).catch(() => { /* 네트워크 오류 시 로컬 상태 유지 */ });

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    // C: 쇼케이스는 화면 위 절반 (작은 화면에서도 300 이상) / A: 탭 아래 배너 (130~160)
    // 격자는 그 아래 진행 줄 다음 ~ 돌아가기 버튼 위
    this.bannerTop = 98;
    this.sh = COLLECTION_LAYOUT === 'A'
      ? this.bannerTop + Math.round(Phaser.Math.Clamp(H * 0.18, 130, 160))
      : Math.round(Phaser.Math.Clamp(H * 0.5, 300, 460));
    // 배너(sh) 와 격자 사이 = 필터 줄. 칩의 눌리는 영역(가운데 ± MIN_TOUCH/2)이 배너 버튼과도,
    // 격자 창(gridTop - 6)과도 겹치지 않게 띄운다 — 겹치면 위에 그린 쪽이 입력을 가로챈다
    this.gridTop = this.sh + FILTER_ROW_DY + MIN_TOUCH / 2 + 6;
    this.gridBottom = H - 74;

    this.add.rectangle(cx, H / 2, W, H, BG_DARK).setDepth(-10);
    if (COLLECTION_LAYOUT === 'A' && this.textures.exists('background2')) {
      // A안 바탕 — 메인 화면 배경을 어둡게 (카드가 떠 보이게)
      this.add.image(cx, H, 'background2').setOrigin(0.5, 1).setScale(Math.max(W / 720, H / 1080)).setTint(0x3a3a58).setDepth(-9);
    }
    this.showcase = this.add.container(0, 0).setDepth(1);
    this.filterBox = this.add.container(0, 0).setDepth(6);

    // 헤더 — C안은 쇼케이스 위라 위쪽을 어둡게 깐다 (글자가 일러스트에 묻히지 않게)
    if (COLLECTION_LAYOUT === 'C') this.add.image(cx, 0, this.bakeFade('cs_topfade', W, 110, 0.8, 0)).setOrigin(0.5, 0).setDepth(9);
    this.add.text(cx, 30, '수집', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);
    this.createTabs(cx, 68);

    this.countText = this.add.text(16, this.sh + FILTER_ROW_DY, '', {
      fontSize: '13px', color: '#ffd34d', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(5);

    // ── 스크롤 격자 ─────────────────────────────────────────────────────
    this.cardsContainer = this.add.container(0, 0).setDepth(5);
    // this.make: display list에 추가되지 않으므로 shutdown 시 직접 정리 필요
    this.maskGfx = this.make.graphics({ x: 0, y: 0 });
    this.maskGfx.fillStyle(0xffffff);
    this.maskGfx.fillRect(0, this.gridTop - 6, W, this.gridBottom - this.gridTop + 6);
    this.cardsContainer.setMask(this.maskGfx.createGeometryMask());
    // 마스크와 같은 창 — 칸의 입력도 이 안에서만 받는다 (마스크는 입력을 자르지 않는다 · clipToViewport)
    this.gridViewport = new Phaser.Geom.Rectangle(0, this.gridTop - 6, W, this.gridBottom - this.gridTop + 6);

    this.buildCharacterGrid();
    this.renderShowcase();

    // ── 드래그 스크롤 입력 ───────────────────────────────────────────────
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.hasPointerDownInScene = true;
      if (this.detailPanel) return; // 상세 패널 열려있으면 스크롤 무시
      if (p.y < this.gridTop - 6 || p.y > this.gridBottom) return;
      this.pointerDownY = p.y;
      this.pointerDownScrollY = this.scrollOffset;
      this.hasDragged = false;
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.detailPanel) return; // 상세 패널 열려있으면 스크롤 무시
      if (!p.isDown) return;
      if (this.pointerDownY < this.gridTop - 6 || this.pointerDownY > this.gridBottom) return;
      const dy = this.pointerDownY - p.y;
      if (Math.abs(dy) > 5) {
        this.hasDragged = true;
        this.scrollOffset = Phaser.Math.Clamp(this.pointerDownScrollY + dy, 0, this.maxScrollOffset);
        this.cardsContainer.setY(-this.scrollOffset);
      }
    });

    this.input.on('pointerup', () => {
      if (this.detailPanel) return; // 상세 패널 열려있으면 hasDragged 초기화 무시
      // card pointerup 이벤트가 먼저 발생하므로 다음 프레임에 초기화
      this.time.delayedCall(0, () => {
        this.hasDragged = false;
        this.hasPointerDownInScene = false;
      });
    });

    // 마우스 휠
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _go: unknown[], _dx: number, deltaY: number) => {
        if (this.detailPanel) return; // 상세 패널 열려있으면 휠 스크롤 무시
        this.scrollOffset = Phaser.Math.Clamp(this.scrollOffset + deltaY * 0.5, 0, this.maxScrollOffset);
        this.cardsContainer.setY(-this.scrollOffset);
      },
    );

    // ── 고정 UI ─────────────────────────────────────────────────────────
    this.createBackButton();

    // maskGfx는 display list 외부에 있으므로 씬 종료 시 직접 정리
    this.events.once('shutdown', () => {
      this.hideCharacterDetail();   // 영상 텍스처(UUID 키) · 시트 마스크까지
      this.maskGfx.destroy();
      this.bannerMaskG?.destroy();
      this.bannerMaskG = null;
      this.releaseTextures();
    });
  }

  /**
   * 나갈 때 이 씬의 그림을 내린다 — 첫 방문에 GPU 약 32MB 가 올라가 씬을 나가도 남았다 (2026-10-07 측정).
   * 내리는 것: 이 씬 전용 접두사 cs_* 전부(카드 · 얼굴 · 배너 · 배경화면 썸네일과 그걸 구운 것 · 판)
   *          + 이 씬이 직접 올린 일러스트(illust_*) · 배경화면 큰 그림(wp_*_bg).
   * 남기는 것: 게임 스프라이트(*_front 등 — 메뉴 · 게임 · 뽑기와 같이 쓴다), 맵 배경(background*), 원래 있던 키.
   * 순서: DisplayList 의 SHUTDOWN 리스너는 부팅 때 걸려 create 에서 건 이 리스너보다 먼저 돈다 — 여기 올 때는
   * 이 그림들을 쓰던 이미지가 이미 다 부서져 있다 (지운 텍스처를 쓰는 오브젝트가 남으면 glTexture null 로 터진다)
   */
  private releaseTextures(): void {
    for (const key of this.textures.getTextureKeys()) {
      const own = this.ownKeys.has(key) && (key.startsWith('illust_') || /^wp_.+_bg$/.test(key));
      if (key.startsWith('cs_') || own) this.textures.remove(key);
    }
    this.ownKeys.clear();
  }

  // ── 공용 그림 굽기 ──────────────────────────────────────────────────────

  /** 세로 그라데이션 (검정 알파 a0 → a1) — 한 번 굽는다 */
  private bakeFade(key: string, w: number, h: number, a0: number, a1: number, color = '10,10,22'): string {
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, Math.ceil(w), Math.ceil(h));
    if (!tex) return key;
    const ctx = tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(${color},${a0})`);
    g.addColorStop(1, `rgba(${color},${a1})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
    return key;
  }

  /** 정사각·가로 그림을 둥근 모서리로 잘라 굽는다 (칩·썸네일마다 한 번) — 마스크를 칩마다 두지 않으려고 */
  private bakeRounded(srcKey: string, key: string, w: number, h: number, r: number): string | null {
    if (this.textures.exists(key)) return key;
    if (!this.textures.exists(srcKey)) return null;
    const src = this.textures.get(srcKey).getSourceImage() as CanvasImageSource;
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return null;
    const ctx = tex.getContext();
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(src, 0, 0, w, h);
    tex.refresh();
    return key;
  }

  /**
   * 텍스처를 그때그때 올린다 — 다 올라오면 onReady (이미 있으면 바로), 못 받으면 onFail.
   * 이미 받는 중이면 기다림만 더한다. tag 가 같은 기다림은 나중 것으로 바꾼다 (같은 칩을 여러 번 눌러도 한 번 다시 그린다)
   */
  private ensureTexture(key: string, path: string, onReady: () => void, onFail?: () => void, tag = 'default'): void {
    if (this.textures.exists(key)) { onReady(); return; }
    const waiting = this.loadingKeys.get(key);
    if (waiting) {
      waiting.set(tag, { ready: onReady, fail: onFail });
      return;
    }
    const waiters = new Map([[tag, { ready: onReady, fail: onFail }]]);
    this.loadingKeys.set(key, waiters);
    this.ownKeys.add(key);
    const done = (ok: boolean) => {
      this.load.off(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${key}`, onDone);
      this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      if (this.loadingKeys.get(key) !== waiters) return;   // 씬을 다시 연 뒤의 늦은 소식
      this.loadingKeys.delete(key);
      if (!this.scene.isActive()) return;
      for (const w of waiters.values()) (ok ? w.ready : w.fail)?.();
    };
    const onDone = () => done(true);
    const onError = (file: Phaser.Loader.File) => { if (file.key === key) done(false); };
    this.load.image(key, path);
    this.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${key}`, onDone);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    this.load.start();
  }

  /** 판 버튼 (메인 화면과 같은 판) — 몸통 가운데 (x, y). 씬에 남는 버튼이라 다시 누를 수 있다 */
  private skinButton(
    parent: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number,
    colors: [string, string, string], label: string, labelColor: string, onClick: (() => void) | null,
  ): void {
    const key = `cs_btn_${colors.join('')}_${w}x${h}`.replace(/#/g, '');
    const skin: ButtonSkin = {
      w, h, radius: h / 2, top: colors[0], bottom: colors[1], border: colors[2], borderW: 1.5,
      lip: '', lipH: 0, gloss: 0.5,
    };
    const { originY } = bakeButton(this, key, skin);
    const box = this.add.container(x, y);
    box.add(this.add.image(0, 0, key).setOrigin(0.5, originY));
    box.add(this.add.text(0, 0, label, { fontSize: `${Math.round(h * 0.42)}px`, color: labelColor, fontStyle: 'bold' }).setOrigin(0.5));
    if (onClick) wireButton(this, box, w, h, onClick, true);
    parent.add(box);
  }

  // ── 탭 ─────────────────────────────────────────────────────────────────

  private createTabs(cx: number, y: number) {
    const w = 280, h = 38, half = (w - 8) / 2;
    const track = bakeButton(this, 'cs_tab_track', {
      w, h, radius: 19, top: '#141428', bottom: '#0b0b18', border: '#3a3a66', borderW: 1.5, lip: '', lipH: 0, gloss: 0,
    });
    this.add.image(cx, y, track.key).setOrigin(0.5, track.originY).setDepth(10);
    const hi = bakeButton(this, 'cs_tab_hi', {
      w: half, h: 30, radius: 15, top: '#ffe58a', bottom: '#ffb02e', border: '#fff1b8', borderW: 1, lip: '', lipH: 0, gloss: 0.5,
    });
    this.tabX = [cx - half / 2, cx + half / 2];
    this.tabHi = this.add.image(this.tabX[0], y, hi.key).setOrigin(0.5, hi.originY).setDepth(10);
    (['character', 'wallpaper'] as const).forEach((tab, i) => {
      const label = this.add.text(this.tabX[i], y, i === 0 ? '캐릭터' : '배경화면', {
        fontSize: '15px', color: i === 0 ? '#3a1d00' : '#9a9ac0', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(11);
      this.tabLabels.push(label);
      const zone = setTouchInteractive(this.add.zone(this.tabX[i], y, half, h)).setDepth(12);
      zone.on('pointerup', () => {
        if (this.detailPanel) return;
        this.switchTab(tab);
      });
    });
  }

  private switchTab(tab: 'character' | 'wallpaper') {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.scrollOffset = 0;
    this.hasDragged = false;
    this.cardsContainer.setY(0);
    const i = tab === 'character' ? 0 : 1;
    this.tweens.add({ targets: this.tabHi, x: this.tabX[i], duration: 140, ease: 'Quad.easeOut' });
    this.tabLabels.forEach((t, k) => t.setColor(k === i ? '#3a1d00' : '#9a9ac0'));
    this.rebuildGrid();
    this.renderShowcase();
  }

  /** 서버 동기화·장착·적용 뒤 — 지금 탭의 격자를 다시 그린다 (스크롤 자리는 그대로) */
  private rebuildGrid() {
    this.cardsContainer.removeAll(true);
    this.cellPos.clear();
    if (this.activeTab === 'character') this.buildCharacterGrid();
    else this.buildWallpaperGrid();
    this.scrollOffset = Math.min(this.scrollOffset, this.maxScrollOffset);
    this.cardsContainer.setY(-this.scrollOffset);
  }

  // ── 격자 ───────────────────────────────────────────────────────────────

  /** 공용 — 고른 칸 흰 테두리 · 장착(사용 중) 금 배지. 격자를 그린 뒤 위에 얹는다 */
  private addGridMarks() {
    this.focusRing = this.add.graphics();
    this.cardsContainer.add(this.focusRing);
    const badge = this.add.container(0, 0);
    badge.add(this.add.circle(0, 0, 10, 0xffc94a).setStrokeStyle(2, 0x3a1d00));
    badge.add(this.add.text(0, 0, '✓', { fontSize: '12px', color: '#3a1d00', fontStyle: 'bold' }).setOrigin(0.5));
    this.equipBadge = badge;
    this.cardsContainer.add(badge);
    this.updateGridMarks();
  }

  private updateGridMarks() {
    const focusId = this.activeTab === 'character' ? this.focusedId : this.focusedWpId;
    const equipId = this.activeTab === 'character' ? this.selectedId : this.selectedWpId;
    this.focusRing.clear();
    const f = this.cellPos.get(focusId);
    if (f) {
      this.focusRing.lineStyle(3, 0xffffff, 1);
      this.focusRing.strokeRoundedRect(f.x - f.w / 2 - 2, f.y - f.h / 2 - 2, f.w + 4, f.h + 4, 16);
    }
    const e = equipId ? this.cellPos.get(equipId) : undefined;
    this.equipBadge.setVisible(!!e);
    if (e) this.equipBadge.setPosition(e.x + e.w / 2 - 6, e.y - e.h / 2 + 6);
  }

  /** 칸 누름 — 드래그였거나 스크롤 영역 밖(마스크로 가려진 칸)이면 무시 */
  private onCellTap(p: Phaser.Input.Pointer, fn: () => void) {
    if (this.hasDragged || !this.hasPointerDownInScene || this.detailPanel) return;
    if (p.y < this.gridTop - 6 || p.y > this.gridBottom) return;
    fn();
  }

  private buildCharacterGrid() {
    if (COLLECTION_LAYOUT === 'A') { this.buildCharacterCardsA(); return; }
    const W = this.scale.width;
    // 보유한 캐릭터를 앞으로 (명단 순서는 유지)
    const visible = getVisibleCharacters();
    const order = [...visible.filter(c => this.ownedIds.includes(c.id)), ...visible.filter(c => !this.ownedIds.includes(c.id))];
    const sz = Math.floor(Math.min(64, (W - 32 - (CHIP_COLS - 1) * 9) / CHIP_COLS));
    const gapX = (W - 32 - CHIP_COLS * sz) / (CHIP_COLS - 1);
    order.forEach((def, i) => {
      const col = i % CHIP_COLS, row = Math.floor(i / CHIP_COLS);
      this.createChip(def, 16 + col * (sz + gapX) + sz / 2, this.gridTop + row * (sz + CHIP_GAP_Y) + sz / 2, sz);
    });
    this.addGridMarks();
    const owned = order.filter(c => this.ownedIds.includes(c.id)).length;
    this.countText.setText(`수집 ${owned}/${order.length}`);
    const rows = Math.ceil(order.length / CHIP_COLS);
    const contentBottom = this.gridTop + rows * (sz + CHIP_GAP_Y) + 8;
    this.maxScrollOffset = Math.max(0, contentBottom - this.gridBottom);
  }

  private createChip(def: CharacterDef, x: number, y: number, sz: number) {
    const owned = this.ownedIds.includes(def.id);
    const [top, bottom] = owned ? (GRADE_FRAME[def.grade] ?? OTHER_FRAME) : LOCK_FRAME;
    const frameKey = `cs_chip_${top}${bottom}_${sz}`.replace(/#/g, '');
    const { originY, pad } = bakeButton(this, frameKey, {
      w: sz, h: sz, radius: 14, top, bottom, border: bottom, borderW: 1, lip: '', lipH: 0, gloss: 0.4,
    });
    const frame = this.add.image(x, y, frameKey).setOrigin(0.5, originY);
    this.cardsContainer.add(frame);

    const face = this.bakeRounded(`cs_face_${def.id}`, `cs_rface_${def.id}`, 128, 128, 26);
    if (face) {
      const img = this.add.image(x, y, face).setDisplaySize(sz - 6, sz - 6);
      if (!owned) img.setTint(0x5a5a70);   // 누군지는 보이게 — 흐리게만
      this.cardsContainer.add(img);
    } else if (this.textures.exists(def.imageKey)) {
      // 얼굴 칩이 아직 없는 캐릭터 — 게임 스프라이트
      const img = this.add.image(x, y + 2, def.imageKey);
      img.setScale((sz - 10) / img.height);
      if (!owned) img.setTint(0x000000).setAlpha(0.6);
      this.cardsContainer.add(img);
    }
    if (!owned) this.cardsContainer.add(this.add.text(x, y, '🔒', { fontSize: '16px' }).setOrigin(0.5));
    const gradeKey = getGradeImgKey(def.grade);
    if (gradeKey && this.textures.exists(gradeKey)) {
      this.cardsContainer.add(this.add.image(x - sz / 2 + 10, y - sz / 2 + 10, gradeKey).setDisplaySize(20, 20));
    }

    this.cellPos.set(def.id, { x, y, w: sz, h: sz });
    // 몸통만 누르게 — 이미지째로 하면 그림자 여백까지 눌려 옆 칩과 겹친다
    frame.setInteractive(clipToViewport(hitRect(pad, sz, sz), this.gridViewport));
    frame.on('pointerup', (p: Phaser.Input.Pointer) => this.onCellTap(p, () => this.focusCharacter(def.id)));
  }

  private buildWallpaperGrid() {
    if (COLLECTION_LAYOUT === 'A') { this.buildWallpaperCardsA(); return; }
    const W = this.scale.width;
    const wps = WALLPAPERS.filter(w => AVAILABLE_WP_SET.has(w.id));
    const tw = Math.floor((W - 32 - WP_GAP) / WP_COLS);
    const th = Math.round(tw * 220 / 340);
    wps.forEach((wp, i) => {
      const col = i % WP_COLS, row = Math.floor(i / WP_COLS);
      this.createWallpaperCard(wp, 16 + col * (tw + WP_GAP) + tw / 2, this.gridTop + row * (th + WP_GAP) + th / 2, tw, th);
    });
    this.addGridMarks();
    const owned = wps.filter(w => this.ownedWpIds.includes(w.id)).length;
    this.countText.setText(`배경 ${owned}/${wps.length}`);
    const rows = Math.ceil(wps.length / WP_COLS);
    const contentBottom = this.gridTop + rows * (th + WP_GAP) + 8;
    this.maxScrollOffset = Math.max(0, contentBottom - this.gridBottom);
  }

  private createWallpaperCard(wp: BackgroundDef, x: number, y: number, tw: number, th: number) {
    const owned = this.ownedWpIds.includes(wp.id);
    const used = this.selectedWpId === wp.id;
    const [top, bottom] = used ? GRADE_FRAME.UR : owned ? ['#e6c8ff', '#8a4fe0'] as [string, string] : LOCK_FRAME;
    const frameKey = `cs_wpf_${top}${bottom}_${tw}x${th}`.replace(/#/g, '');
    const { originY, pad } = bakeButton(this, frameKey, {
      w: tw, h: th, radius: 14, top, bottom, border: bottom, borderW: 1, lip: '', lipH: 0, gloss: 0.3,
    });
    const frame = this.add.image(x, y, frameKey).setOrigin(0.5, originY);
    this.cardsContainer.add(frame);

    const thumb = this.bakeRounded(`cs_wp_${wp.id}`, `cs_rwp_${wp.id}`, 340, 220, 26);
    if (thumb) {
      const img = this.add.image(x, y, thumb).setDisplaySize(tw - 6, th - 6);
      if (!owned) img.setTint(0x30303c);
      this.cardsContainer.add(img);
    }
    this.cardsContainer.add(this.add.text(x - tw / 2 + 10, y + th / 2 - 14, wp.name, {
      fontSize: '13px', color: owned ? '#ffffff' : '#9a9aaa', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5));
    if (!owned) this.cardsContainer.add(this.add.text(x, y - 6, '🔒', { fontSize: '18px' }).setOrigin(0.5));

    this.cellPos.set(wp.id, { x, y, w: tw, h: th });
    frame.setInteractive(clipToViewport(hitRect(pad, tw, th), this.gridViewport));
    frame.on('pointerup', (p: Phaser.Input.Pointer) => this.onCellTap(p, () => this.focusWallpaper(wp.id)));
  }

  // ── 쇼케이스 ───────────────────────────────────────────────────────────

  private focusCharacter(id: string) {
    this.focusedId = id;
    this.updateGridMarks();
    this.renderShowcase();
  }

  private focusWallpaper(id: string) {
    this.focusedWpId = id;
    this.updateGridMarks();
    this.renderShowcase();
  }

  private renderShowcase() {
    this.showcase.removeAll(true);
    this.bannerMaskG?.destroy();
    this.bannerMaskG = null;
    if (COLLECTION_LAYOUT === 'A') {
      if (this.activeTab === 'character') this.renderCharacterBannerA();
      else this.renderWallpaperBannerA();
      return;
    }
    if (this.activeTab === 'character') this.renderCharacterShowcase();
    else this.renderWallpaperShowcase();
  }

  private renderCharacterShowcase() {
    const W = this.scale.width, sh = this.sh;
    const def = CHARACTERS.find(c => c.id === this.focusedId) ?? CHARACTERS[0];
    const owned = this.ownedIds.includes(def.id);

    // 일러스트 — 화면 폭에 맞춰 위에서부터, 쇼케이스 아래로는 잘라 낸다
    if (this.textures.exists(def.illustKey)) {
      const img = this.add.image(W / 2, 0, def.illustKey).setOrigin(0.5, 0);
      const s = W / img.width;
      img.setScale(s).setY(-img.displayHeight * 0.03);
      img.setCrop(0, 0, img.width, (sh - img.y) / s);
      if (!owned) img.setTint(0x34344a);
      this.showcase.add(img);
    } else {
      // 처음 보는 캐릭터 — 올라오는 동안 스프라이트를 크게
      if (this.textures.exists(def.imageKey)) {
        const sp = this.add.image(W / 2, sh - 90, def.imageKey).setOrigin(0.5, 1);
        sp.setScale((sh * 0.55) / sp.height);
        if (!owned) sp.setTint(0x000000).setAlpha(0.6);
        this.showcase.add(sp);
      }
      this.ensureTexture(def.illustKey, def.illustPath, () => {
        if (this.activeTab === 'character' && this.focusedId === def.id) this.renderShowcase();
      }, undefined, 'showcase');
    }
    this.showcase.add(this.add.image(W / 2, sh, this.bakeFade('cs_fade_char', W, 190, 0, 1)).setOrigin(0.5, 1));

    // 이름 · 등급 · 별 · 한 줄 설명
    const gradeKey = getGradeImgKey(def.grade);
    let nx = 20;
    if (gradeKey && this.textures.exists(gradeKey)) {
      this.showcase.add(this.add.image(36, sh - 104, gradeKey).setDisplaySize(34, 34));
      nx = 58;
    }
    this.showcase.add(this.add.text(nx, sh - 104, owned ? def.name : def.name, {
      fontSize: '30px', color: owned ? '#ffffff' : '#c8c8d8', fontStyle: 'bold', stroke: '#1a0d40', strokeThickness: 5,
    }).setOrigin(0, 0.5));
    if (owned && def.grade !== '등급외') {
      const lv = getAwakeningLevel(def.grade, getDuplicateCount(def.id));
      for (let i = 0; i < STAR_COUNT; i++) {
        this.showcase.add(this.add.text(22 + i * 16, sh - 72, '★', {
          fontSize: '15px', color: i < lv ? '#ffd34d' : '#3a3a50', stroke: '#1a1000', strokeThickness: i < lv ? 2 : 0,
        }).setOrigin(0.5));
      }
    }
    this.showcase.add(this.add.text(20, sh - 46, owned ? shortLine(def.basicEffect) : '뽑기에서 얻을 수 있는 캐릭터', {
      fontSize: '12px', color: owned ? '#d0d0ec' : '#a99fd0', wordWrap: { width: W - 160 }, lineSpacing: 2,
    }).setOrigin(0, 0.5));

    // 버튼 — 장착(장착 중) / 뽑기 · 상세 보기
    const bx = W - 20 - 54;
    if (!owned) {
      this.skinButton(this.showcase, bx, sh - 98, 108, 36, ['#d8c8ff', '#7a4dff', '#efe6ff'], '🔒 뽑기', '#ffffff',
        () => this.scene.start('GachaScene'));
    } else if (this.selectedId === def.id) {
      this.skinButton(this.showcase, bx, sh - 98, 108, 36, ['#ffe58a', '#ffb02e', '#fff1b8'], '✓ 장착 중', '#3a1d00', null);
    } else {
      this.skinButton(this.showcase, bx, sh - 98, 108, 36, ['#4f8dff', '#1b3a9e', '#9dc0ff'], '장착', '#ffffff',
        () => this.selectCharacter(def.id));
    }
    this.skinButton(this.showcase, bx, sh - 56, 108, 30, ['#2c2c50', '#161630', '#6a6aa0'], '상세 보기', '#ffffff',
      () => this.showCharacterDetail(def.id));
  }

  private renderWallpaperShowcase() {
    const W = this.scale.width, sh = this.sh;
    const wp = WALLPAPERS.find(w => w.id === this.focusedWpId);
    if (!wp) return;
    const owned = this.ownedWpIds.includes(wp.id);
    const used = this.selectedWpId === wp.id;
    const picBottom = sh - 64;          // 그림 아래 — 그 밑은 이름·설명

    if (this.textures.exists(wp.bgKey)) {
      // 게임 화면처럼 — 폭에 맞추고 아래(땅)를 그림 바닥에 붙인다
      const img = this.add.image(W / 2, picBottom, wp.bgKey).setOrigin(0.5, 1);
      const s = W / img.width;
      img.setScale(s);
      if (!owned) img.setTint(0x30303c);
      this.showcase.add(img);
      // 장착 캐릭터가 땅에 선다 — 배경은 화면 아래 40px(480x720 기준)에 땅이 오게 그려져 있다
      const ground = picBottom - img.height * s * (40 / 720);
      const me = CHARACTERS.find(c => c.id === this.selectedId) ?? CHARACTERS[0];
      if (owned && this.textures.exists(me.imageKey)) {
        const [pw, ph] = me.playerDisplaySize ?? [50, 80];
        const k = (img.height * s) / 720;
        this.showcase.add(this.add.image(W / 2, ground, me.imageKey).setOrigin(0.5, 1).setDisplaySize(pw * k, ph * k));
      }
      if (owned && this.textures.exists('poop_smile')) {
        for (const [px, py] of [[0.18, 0.34], [0.78, 0.46], [0.5, 0.26]]) {
          this.showcase.add(this.add.image(W * px, picBottom * py, 'poop_smile').setDisplaySize(34, 34));
        }
      }
      if (!owned) {
        this.showcase.add(this.add.text(W / 2, picBottom * 0.55, '🔒', { fontSize: '40px' }).setOrigin(0.5));
      }
    } else {
      this.ensureTexture(wp.bgKey, wp.bgPath, () => {
        if (this.activeTab === 'wallpaper' && this.focusedWpId === wp.id) this.renderShowcase();
      }, undefined, 'showcase');
    }
    this.showcase.add(this.add.image(W / 2, picBottom + 2, this.bakeFade('cs_fade_wp', W, 90, 0, 1)).setOrigin(0.5, 1));
    this.showcase.add(this.add.rectangle(W / 2, picBottom + 2, W, 66, BG_DARK).setOrigin(0.5, 0));

    // 미리보기 표시
    const tag = this.add.text(16, 104, '게임 화면 미리보기', {
      fontSize: '11px', color: '#ffe9a8', backgroundColor: '#00000099', padding: { x: 8, y: 4 },
    }).setOrigin(0, 0.5);
    this.showcase.add(tag);

    this.showcase.add(this.add.text(20, sh - 44, wp.name, {
      fontSize: '26px', color: owned ? '#ffffff' : '#c8c8d8', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5));
    this.showcase.add(this.add.text(20, sh - 18, owned ? wp.description : '뽑기에서 얻을 수 있는 배경화면', {
      fontSize: '12px', color: owned ? '#d0d0ec' : '#a99fd0', wordWrap: { width: W - 160 },
    }).setOrigin(0, 0.5));

    const bx = W - 20 - 54;
    if (!owned) {
      this.skinButton(this.showcase, bx, sh - 40, 108, 36, ['#d8c8ff', '#7a4dff', '#efe6ff'], '🔒 뽑기', '#ffffff',
        () => this.scene.start('GachaScene'));
    } else if (used) {
      this.skinButton(this.showcase, bx, sh - 46, 108, 32, ['#ffe58a', '#ffb02e', '#fff1b8'], '✓ 사용 중', '#3a1d00', null);
      this.skinButton(this.showcase, bx, sh - 12, 108, 24, ['#2c2c50', '#161630', '#6a6aa0'], '기본으로', '#ffffff',
        () => this.applyWallpaper(null));
    } else {
      this.skinButton(this.showcase, bx, sh - 40, 108, 36, ['#e6c8ff', '#8a4fe0', '#f2e6ff'], '적용', '#ffffff',
        () => this.applyWallpaper(wp.id));
    }
  }

  // ══ A안 — 가챠 카드 컬렉션 ═══════════════════════════════════════════════
  // 위 = 히어로 배너 (캐릭터: 일러스트 + 이름·장착 상태·별·버튼 / 배경: 게임 화면 미리보기)
  // 가운데 = 수집 진행 막대 + 등급 필터 / 아래 = 일러스트 카드 3열 · 배경 카드 2열

  /** 진행 막대 · 등급 필터 (캐릭터 탭만 필터) — 탭·필터가 바뀔 때마다 다시 그린다 */
  private renderFilterRowA(owned: number, total: number) {
    this.filterBox.removeAll(true);
    const W = this.scale.width, y = this.sh + FILTER_ROW_DY;
    const label = this.activeTab === 'character' ? `수집 ${owned}/${total}` : `배경 ${owned}/${total}`;
    this.countText.setText(label).setPosition(16, y);
    const bx = 16 + textContentWidth(this.countText) + 10;
    const bw = this.activeTab === 'character' ? Math.max(40, W - 16 - 196 - bx) : Math.max(60, W - 16 - bx);
    this.filterBox.add(this.add.rectangle(bx, y, bw, 8, 0x1a1a30).setOrigin(0, 0.5).setStrokeStyle(1, 0x3a3a66));
    this.filterBox.add(this.add.rectangle(bx, y, Math.max(4, bw * owned / Math.max(1, total)), 8, 0xffc94a).setOrigin(0, 0.5));
    if (this.activeTab !== 'character') return;
    // 칩 폭은 모두 MIN_TOUCH(44) — 더 좁으면 넓힌 눌리는 영역이 옆 칩을 덮는다
    const chips: [GradeFilter, string, number][] = [['all', '전체', 44], ['UR', 'UR', 44], ['SR', 'SR', 44], ['R', 'R', 44]];
    let x = W - 16;
    for (let i = chips.length - 1; i >= 0; i--) {
      const [f, text, w] = chips[i];
      x -= w;
      const on = this.gradeFilter === f;
      this.skinButton(this.filterBox, x + w / 2, y, w, 22,
        on ? ['#ffe58a', '#ffb02e', '#fff1b8'] : ['#22223a', '#16162a', '#44446a'], text, on ? '#3a1d00' : '#a0a0c8',
        on ? null : () => { this.gradeFilter = f; this.scrollOffset = 0; this.rebuildGrid(); });
      x -= 6;
    }
  }

  /** 캐릭터 히어로 배너 — 고른 캐릭터 (처음엔 장착 캐릭터) */
  private renderCharacterBannerA() {
    const W = this.scale.width, x0 = 16, y0 = this.bannerTop, w = W - 32, h = this.sh - this.bannerTop;
    const def = CHARACTERS.find(c => c.id === this.focusedId) ?? CHARACTERS[0];
    const owned = this.ownedIds.includes(def.id);
    const equipped = this.selectedId === def.id;
    const frame = owned ? (GRADE_FRAME[def.grade] ?? OTHER_FRAME) : LOCK_FRAME;
    const fkey = `cs_bannerA_${frame[0]}_${w}x${h}`.replace(/#/g, '');
    const { originY } = bakeButton(this, fkey, {
      w, h, radius: 18, top: '#2a1a5e', bottom: '#120b2e', border: frame[0], borderW: 2, lip: '', lipH: 0, gloss: 0,
      glow: owned ? GRADE_GLOW[def.grade] : undefined,
    });
    this.showcase.add(this.add.image(W / 2, y0 + h / 2, fkey).setOrigin(0.5, originY));

    // 오른쪽 일러스트 (왼쪽으로 풀리는 크롭, 둥근 모서리로 굽는다)
    const art = this.bakeRounded(`cs_banner_${def.id}`, `cs_rbanner_${def.id}`, 440, 292, 36);
    if (art) {
      const ah = h - 6, aw = ah * 440 / 292;
      const img = this.add.image(x0 + w - 3, y0 + h / 2, art).setOrigin(1, 0.5).setDisplaySize(aw, ah);
      if (!owned) img.setTint(0x55556a);
      this.showcase.add(img);
    } else {
      this.ensureTexture(`cs_banner_${def.id}`, `assets/ui/collection/banner/${def.id}.webp`, () => {
        if (this.activeTab === 'character' && this.focusedId === def.id) this.renderShowcase();
      }, undefined, 'showcase');
    }

    const gradeKey = getGradeImgKey(def.grade);
    if (gradeKey && this.textures.exists(gradeKey)) this.showcase.add(this.add.image(x0 + 24, y0 + 24, gradeKey).setDisplaySize(30, 30));
    this.showcase.add(this.add.text(x0 + 14, y0 + 60, def.name, {
      fontSize: '28px', color: owned ? '#ffffff' : '#c8c8d8', fontStyle: 'bold', stroke: '#1a0d40', strokeThickness: 5,
    }).setOrigin(0, 0.5));
    this.showcase.add(this.add.text(x0 + 16, y0 + 88,
      equipped ? '장착 중' : owned ? '보유' : '미보유 · 뽑기에서 획득', {
        fontSize: '12px', color: equipped ? '#ffd34d' : owned ? '#bfe9ff' : '#a99fd0', fontStyle: 'bold',
      }).setOrigin(0, 0.5));
    if (owned && def.grade !== '등급외') {
      const lv = getAwakeningLevel(def.grade, getDuplicateCount(def.id));
      for (let i = 0; i < STAR_COUNT; i++) {
        this.showcase.add(this.add.text(x0 + 22 + i * 15, y0 + 108, '★', {
          fontSize: '13px', color: i < lv ? '#ffd34d' : '#3a3a50', stroke: '#1a1000', strokeThickness: i < lv ? 2 : 0,
        }).setOrigin(0.5));
      }
    }
    // 버튼 — [장착 | 🔒 뽑기] [능력 보기]
    const by = y0 + h - 22;
    let bx = x0 + 14;
    if (owned && !equipped) {
      this.skinButton(this.showcase, bx + 30, by, 60, 26, ['#4f8dff', '#1b3a9e', '#9dc0ff'], '장착', '#ffffff',
        () => this.selectCharacter(def.id));
      bx += 66;
    } else if (!owned) {
      this.skinButton(this.showcase, bx + 36, by, 72, 26, ['#d8c8ff', '#7a4dff', '#efe6ff'], '🔒 뽑기', '#ffffff',
        () => this.scene.start('GachaScene'));
      bx += 78;
    }
    this.skinButton(this.showcase, bx + 42, by, 84, 26, ['#ffe58a', '#ffb02e', '#fff1b8'], '능력 보기', '#3a1d00',
      () => this.showCharacterDetail(def.id));
  }

  /** 배경화면 배너 — 고른 배경으로 게임 화면 미리보기 (배경 + 장착 캐릭터) */
  private renderWallpaperBannerA() {
    const W = this.scale.width, x0 = 16, y0 = this.bannerTop, w = W - 32, h = this.sh - this.bannerTop;
    const wp = WALLPAPERS.find(v => v.id === this.focusedWpId);
    if (!wp) return;
    const owned = this.ownedWpIds.includes(wp.id);
    const used = this.selectedWpId === wp.id;
    const fkey = `cs_bannerA_wp_${used ? 'used' : 'idle'}_${w}x${h}`;
    const { originY } = bakeButton(this, fkey, {
      w, h, radius: 18, top: '#1a1a30', bottom: '#1a1a30', border: used ? '#ffd34d' : '#cc88ff', borderW: 2,
      lip: '', lipH: 0, gloss: 0, glow: used ? 'rgba(255,190,60,0.85)' : undefined,
    });
    this.showcase.add(this.add.image(W / 2, y0 + h / 2, fkey).setOrigin(0.5, originY));

    if (this.textures.exists(wp.bgKey)) {
      // 폭에 맞추고 아래(땅)를 배너 바닥보다 조금 내려 풍경을 더 보인다 (발은 배너 안) — 마스크는 이것 하나
      const sink = 18;
      const img = this.add.image(W / 2, y0 + h - 3 + sink, wp.bgKey).setOrigin(0.5, 1);
      const s = (w - 6) / img.width;
      img.setScale(s);
      if (!owned) img.setTint(0x30303c);
      this.bannerMaskG?.destroy();
      this.bannerMaskG = this.make.graphics({}, false);
      this.bannerMaskG.fillStyle(0xffffff).fillRoundedRect(x0 + 3, y0 + 3, w - 6, h - 6, 15);
      img.setMask(this.bannerMaskG.createGeometryMask());
      this.showcase.add(img);
      const me = CHARACTERS.find(c => c.id === this.selectedId) ?? CHARACTERS[0];
      if (owned && this.textures.exists(me.imageKey)) {
        const k = (img.height * s) / 720;
        const [pw, ph] = me.playerDisplaySize ?? [50, 80];
        this.showcase.add(this.add.image(W / 2, y0 + h - 3 + sink - img.height * s * (40 / 720), me.imageKey)
          .setOrigin(0.5, 1).setDisplaySize(pw * k, ph * k));
      }
      if (!owned) this.showcase.add(this.add.text(W / 2, y0 + h / 2, '🔒', { fontSize: '30px' }).setOrigin(0.5));
    } else {
      this.ensureTexture(wp.bgKey, wp.bgPath, () => {
        if (this.activeTab === 'wallpaper' && this.focusedWpId === wp.id) this.renderShowcase();
      }, undefined, 'showcase');
    }
    this.showcase.add(this.add.text(x0 + 12, y0 + 18, `${used ? '사용 중' : '미리보기'} · ${wp.name}`, {
      fontSize: '12px', color: '#ffe9a8', fontStyle: 'bold', backgroundColor: '#00000099', padding: { x: 8, y: 4 },
    }).setOrigin(0, 0.5));
    const bx = x0 + w - 12 - 40;
    if (!owned) {
      this.skinButton(this.showcase, bx, y0 + 20, 80, 26, ['#d8c8ff', '#7a4dff', '#efe6ff'], '🔒 뽑기', '#ffffff',
        () => this.scene.start('GachaScene'));
    } else if (used) {
      this.skinButton(this.showcase, bx, y0 + 20, 80, 26, ['#2c2c50', '#161630', '#6a6aa0'], '기본으로', '#ffffff',
        () => this.applyWallpaper(null));
    } else {
      this.skinButton(this.showcase, bx, y0 + 20, 80, 26, ['#e6c8ff', '#8a4fe0', '#f2e6ff'], '적용', '#ffffff',
        () => this.applyWallpaper(wp.id));
    }
  }

  private buildCharacterCardsA() {
    const W = this.scale.width;
    const visible = getVisibleCharacters().filter(c => this.gradeFilter === 'all' || c.grade === this.gradeFilter);
    const order = [...visible.filter(c => this.ownedIds.includes(c.id)), ...visible.filter(c => !this.ownedIds.includes(c.id))];
    const gap = 9;
    const cw = Math.floor((W - 32 - gap * 2) / 3);
    const artH = Math.round((cw - 6) * 4 / 3);
    const ch = artH + 30;
    const cores = this.add.graphics();
    order.forEach((def, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      this.createCardA(def, 16 + col * (cw + gap) + cw / 2, this.gridTop + row * (ch + gap) + ch / 2, cw, ch, artH, cores);
    });
    this.cardsContainer.add(cores);
    this.addGridMarks();
    const all = getVisibleCharacters();
    this.renderFilterRowA(all.filter(c => this.ownedIds.includes(c.id)).length, all.length);
    const rows = Math.ceil(order.length / 3);
    this.maxScrollOffset = Math.max(0, this.gridTop + rows * (ch + gap) + 8 - this.gridBottom);
  }

  private createCardA(def: CharacterDef, x: number, y: number, cw: number, ch: number, artH: number, cores: Phaser.GameObjects.Graphics) {
    const owned = this.ownedIds.includes(def.id);
    const [top, bottom] = owned ? (GRADE_FRAME[def.grade] ?? OTHER_FRAME) : LOCK_FRAME;
    const key = `cs_cardA_${top}${bottom}_${cw}x${ch}`.replace(/#/g, '');
    const { originY, pad } = bakeButton(this, key, {
      w: cw, h: ch, radius: 12, top, bottom, border: owned ? top : '#4a4a5a', borderW: 2, lip: '', lipH: 0, gloss: 0.3,
      glow: owned && def.grade === 'UR' ? GRADE_GLOW.UR : undefined,
    });
    const frame = this.add.image(x, y, key).setOrigin(0.5, originY);
    this.cardsContainer.add(frame);

    const artTop = y - ch / 2 + 3;
    const art = this.bakeRounded(`cs_card_${def.id}`, `cs_rcard_${def.id}`, 216, 288, 22);
    if (art) {
      const img = this.add.image(x, artTop, art).setOrigin(0.5, 0).setDisplaySize(cw - 6, artH);
      if (!owned) img.setTint(0x5a5a70);
      this.cardsContainer.add(img);
    } else if (this.textures.exists(def.imageKey)) {
      const img = this.add.image(x, artTop + artH - 4, def.imageKey).setOrigin(0.5, 1);
      img.setScale((artH - 10) / img.height);
      if (!owned) img.setTint(0x000000).setAlpha(0.6);
      this.cardsContainer.add(img);
    }
    if (!owned) this.cardsContainer.add(this.add.text(x, artTop + artH / 2, '🔒', { fontSize: '22px' }).setOrigin(0.5));
    const gradeKey = getGradeImgKey(def.grade);
    if (gradeKey && this.textures.exists(gradeKey)) {
      this.cardsContainer.add(this.add.image(x - cw / 2 + 14, artTop + 11, gradeKey).setDisplaySize(22, 22));
    }
    this.cardsContainer.add(this.add.text(x, y + ch / 2 - (owned ? 18 : 14), def.name, {
      fontSize: '13px', color: owned ? '#1a1030' : '#8a8a9a', fontStyle: 'bold',
    }).setOrigin(0.5));
    // 각성 코어 — 보유 캐릭터만 (등급외 제외)
    if (owned && def.grade !== '등급외') {
      const lv = getAwakeningLevel(def.grade, getDuplicateCount(def.id));
      const cy = y + ch / 2 - 6;
      const col = Phaser.Display.Color.HexStringToColor(bottom).color;
      for (let i = 0; i < STAR_COUNT; i++) {
        const cx = x + (i - 2) * 8;
        if (i < lv) {
          cores.fillStyle(col, 1).fillCircle(cx, cy, 2.6);
        } else {
          cores.fillStyle(0x141420, 1).fillCircle(cx, cy, 2.6);
          cores.lineStyle(1, col, 0.5).strokeCircle(cx, cy, 2.6);
        }
      }
    }

    this.cellPos.set(def.id, { x, y, w: cw, h: ch });
    frame.setInteractive(clipToViewport(hitRect(pad, cw, ch), this.gridViewport));
    frame.on('pointerup', (p: Phaser.Input.Pointer) => this.onCellTap(p, () => this.focusCharacter(def.id)));
  }

  private buildWallpaperCardsA() {
    const W = this.scale.width;
    const wps = WALLPAPERS.filter(w => AVAILABLE_WP_SET.has(w.id));
    const cw = Math.floor((W - 32 - WP_GAP) / 2);
    const thumbH = Math.round((cw - 6) * 220 / 340);
    const ch = thumbH + 30;
    wps.forEach((wp, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      this.createWallpaperCardA(wp, 16 + col * (cw + WP_GAP) + cw / 2, this.gridTop + row * (ch + WP_GAP) + ch / 2, cw, ch, thumbH);
    });
    this.addGridMarks();
    this.renderFilterRowA(wps.filter(w => this.ownedWpIds.includes(w.id)).length, wps.length);
    const rows = Math.ceil(wps.length / 2);
    this.maxScrollOffset = Math.max(0, this.gridTop + rows * (ch + WP_GAP) + 8 - this.gridBottom);
  }

  private createWallpaperCardA(wp: BackgroundDef, x: number, y: number, cw: number, ch: number, thumbH: number) {
    const owned = this.ownedWpIds.includes(wp.id);
    const used = this.selectedWpId === wp.id;
    const border = used ? '#ffd34d' : owned ? '#cc88ff' : '#4a4a5a';
    const key = `cs_wpA_${border}_${cw}x${ch}`.replace(/#/g, '');
    const { originY, pad } = bakeButton(this, key, {
      w: cw, h: ch, radius: 14, top: '#2a2a40', bottom: '#14141f', border, borderW: used ? 2.5 : 1.5, lip: '', lipH: 0, gloss: 0,
      glow: used ? 'rgba(255,190,60,0.85)' : undefined,
    });
    const frame = this.add.image(x, y, key).setOrigin(0.5, originY);
    this.cardsContainer.add(frame);
    const thumb = this.bakeRounded(`cs_wp_${wp.id}`, `cs_rwp_${wp.id}`, 340, 220, 26);
    if (thumb) {
      const img = this.add.image(x, y - ch / 2 + 3, thumb).setOrigin(0.5, 0).setDisplaySize(cw - 6, thumbH);
      if (!owned) img.setTint(0x30303c);
      this.cardsContainer.add(img);
    }
    if (!owned) {
      this.cardsContainer.add(this.add.text(x, y - ch / 2 + 3 + thumbH / 2 - 6, '🔒', { fontSize: '18px' }).setOrigin(0.5));
      this.cardsContainer.add(this.add.text(x, y - ch / 2 + 3 + thumbH / 2 + 16, '뽑기에서 획득', {
        fontSize: '10px', color: '#c9b6ff', fontStyle: 'bold',
      }).setOrigin(0.5));
    }
    const ny = y + ch / 2 - 14;
    this.cardsContainer.add(this.add.text(x - cw / 2 + 12, ny, wp.name, {
      fontSize: '13px', color: owned ? '#ffffff' : '#7a7a8a', fontStyle: 'bold',
    }).setOrigin(0, 0.5));
    if (owned && !used) {
      this.cardsContainer.add(this.add.text(x + cw / 2 - 12, ny, '적용', { fontSize: '11px', color: '#cc88ff', fontStyle: 'bold' }).setOrigin(1, 0.5));
    }
    this.cellPos.set(wp.id, { x, y, w: cw, h: ch });
    frame.setInteractive(clipToViewport(hitRect(pad, cw, ch), this.gridViewport));
    frame.on('pointerup', (p: Phaser.Input.Pointer) => this.onCellTap(p, () => this.focusWallpaper(wp.id)));
  }

  // ── 장착 · 적용 ────────────────────────────────────────────────────────

  private applyWallpaper(id: string | null) {
    setSelectedWallpaper(id);
    this.selectedWpId = id;
    if (this.activeTab === 'wallpaper') {
      this.rebuildGrid();
      this.renderShowcase();
    }
  }

  private selectCharacter(id: string) {
    this.selectedId = id;
    setSelectedCharacter(id);
    if (this.activeTab === 'character') {
      this.updateGridMarks();
      this.renderShowcase();
    }
  }

  // ══ 캐릭터 상세 — B 탭 시트형 (대표 결정 2026-10-12, 시안 ~/ddong-fx-work/dev2/mockups3/B_*.png) ══════════
  // 위 = 캐릭터 영상 무음 반복 (utils/videoReel — 뽑기 로비와 같은 규칙), 못 틀면 일러스트. 둘 다 비율 유지 화면 덮기
  // 아래 = 시트: 이름 · 탭 [능력 · 각성 · 시너지] · 내용(넘치면 시트 안 스크롤) · 버튼 [장착] / [뽑기로]
  // 각성 수치는 config/awakening, 시너지는 config/synergyMap, 얻는 곳은 config/banners — 화면에 숫자를 베끼지 않는다

  /**
   * '능력 보기' — 일러스트를 그때 올리고(한 번 누르면 열린다) 능력 탭으로 연다. 쇼케이스가 같은 그림을 받는 중이어도
   * 그 받기에 기다림을 붙인다. 기다리는 사이 다른 캐릭터를 누르면 그쪽을 연다. 그림을 못 받아도 상세는 연다 (게임 스프라이트로)
   */
  private showCharacterDetail(id: string): void {
    const def = CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
    if (this.textures.exists(def.illustKey)) {
      this.pendingDetailId = null;
      this.buildCharacterDetail(id, 'ability');
      return;
    }
    this.pendingDetailId = id;
    const open = () => {
      if (this.pendingDetailId !== id) return;
      this.pendingDetailId = null;
      this.buildCharacterDetail(id, 'ability');
    };
    this.ensureTexture(def.illustKey, def.illustPath, open, open, `detail_${id}`);
  }

  /** 상세 화면을 그린다 (탭을 바꾸면 탭 줄 · 내용만 다시 그린다 — showDetailTab) */
  private buildCharacterDetail(id: string, tab: DetailTab): void {
    this.hideCharacterDetail();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const def = CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
    const owned = this.ownedIds.includes(id);
    const equipped = owned && this.selectedId === id;

    const panel = this.add.container(0, 0).setDepth(300);
    this.detailPanel = panel;

    // 바탕 · 아래 목록으로 입력이 새지 않게 막는다
    panel.add(this.add.rectangle(cx, H / 2, W, H, BG_DARK).setInteractive());

    // ── 위 — 일러스트를 깔고 그 위에서 영상 반복 (비율 유지 화면 덮기 · 늘이지 않는다) ──
    const mediaH = Math.round(H * DETAIL.mediaRatio);
    const area = { x: 0, y: 0, w: W, h: mediaH + DETAIL.sheetOverlap, focusY: 0.15 };
    let illust: Phaser.GameObjects.Image;
    if (this.textures.exists(def.illustKey)) {
      illust = this.add.image(cx, 0, def.illustKey).setOrigin(0.5, 0);
      const sc = Math.max(area.w / illust.width, area.h / illust.height);
      illust.setScale(sc).setY(area.y - (illust.height * sc - area.h) * area.focusY);
    } else {
      // 일러스트를 못 받았다 — 게임 스프라이트를 칸 안에 비율대로 (늘이지 않는다). 영상이 오면 그 위를 덮는다
      illust = this.add.image(cx, area.h * 0.55, def.imageKey).setOrigin(0.5, 0.5);
      illust.setScale(Math.min(area.w * 0.5 / illust.width, area.h * 0.6 / illust.height));
    }
    panel.add(illust);
    this.detailReel = new VideoReel(this, {
      ids: [def.id], anchor: illust, area, memo: this.videoMemo,
      canPlay: () => this.detailPanel === panel,
    }).start();

    // 위 · 아래 어둠 — ← 와 이름이 그림 위에서 읽히게
    panel.add(this.add.image(cx, 0, this.bakeFade('cs_dfade_top', W, 90, 0.6, 0)).setOrigin(0.5, 0));
    panel.add(this.add.image(cx, mediaH + 2, this.bakeFade('cs_dfade_bot', W, 130, 0, 0.92)).setOrigin(0.5, 1));

    // ← 닫기 (왼쪽 위) — 뽑기 화면 · 난이도 화면과 같은 판
    const back = this.add.container(32, 32);
    const backSkin = bakeButton(this, 'diff_back', {
      w: 44, h: 44, radius: 22, top: '#ffffff', bottom: '#dfe6ee', border: '#2a3340', borderW: 3, lip: '#9aa6b5', lipH: 4, gloss: 0,
    });
    back.add(this.add.image(0, 0, 'diff_back').setOrigin(0.5, backSkin.originY));
    back.add(this.add.text(0, -1, '←', { fontSize: '24px', color: '#2a3340', fontStyle: 'bold' }).setOrigin(0.5));
    panel.add(back);
    wireButton(this, back, 44, 44, () => this.hideCharacterDetail());

    // ── 이름 줄 — 등급 배지 · 이름 · 상태 꼬리표 (장착 중 / 미보유) ──
    const ny = mediaH - DETAIL.nameDy;
    let nx = 18;
    const gradeKey = getGradeImgKey(def.grade);
    if (gradeKey && this.textures.exists(gradeKey)) {
      panel.add(this.add.image(nx + 18, ny, gradeKey).setDisplaySize(36, 36));
      nx += 42;
    }
    const nameText = this.add.text(nx, ny, def.name, {
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0, 0.5);
    panel.add(nameText);
    if (equipped || !owned) {
      const tag = this.add.text(nx + textContentWidth(nameText) + 8, ny + 1, equipped ? '장착 중' : '미보유', {
        fontSize: '12px', color: equipped ? '#3a1d00' : '#e8dcff', fontStyle: 'bold',
        backgroundColor: equipped ? '#ffd34d' : '#2a1d4acc', padding: { x: 8, y: 3 },
      }).setOrigin(0, 0.5);
      panel.add(tag);
    }

    // ── 시트 ──
    const sheetTop = mediaH;
    const g = this.add.graphics();
    g.fillStyle(DETAIL.sheetColor, 1).fillRoundedRect(0, sheetTop - 6, W, H - sheetTop + 6, { tl: 18, tr: 18, bl: 0, br: 0 });
    g.lineStyle(1.5, 0x8a7ab8, 0.7).strokeRoundedRect(0, sheetTop - 6, W, H - sheetTop + 6, { tl: 18, tr: 18, bl: 0, br: 0 });
    panel.add(g);

    panel.add(this.add.rectangle(W / 2, sheetTop + DETAIL.tabH, W - 32, 1, 0x8a7ab8, 0.35));
    const showTab = this.detailTabsOf(def).includes(tab) ? tab : 'ability';

    // ── 버튼 — 보유 = [장착] (장착 중이면 그 상태), 미보유 = [뽑기로] + 어느 뽑기에서 나오는지 ──
    this.buildDetailButton(panel, def, owned, equipped);

    this.showDetailTab(def, showTab);
  }

  /** 이 캐릭터에 보일 탭 — 각성이 없는 등급(등급외)이면 각성 탭을, 시너지 짝이 없으면 시너지 탭을 숨긴다 */
  private detailTabsOf(def: CharacterDef): DetailTab[] {
    const tabs: DetailTab[] = ['ability'];
    if (getNextAwakening(def.grade, 0)) tabs.push('awaken');
    if (this.synergyOf(def).length) tabs.push('synergy');
    return tabs;
  }

  /** 탭을 보인다 — 탭 줄(글자 · 밑줄 · 눌리는 칸)과 내용 창만 다시 그린다. 영상 · 이름 · 버튼은 그대로 */
  private showDetailTab(def: CharacterDef, tab: DetailTab): void {
    const panel = this.detailPanel;
    if (!panel) return;
    for (const o of [...panel.list]) if (o.getData('detailTabRow')) o.destroy();
    const W = this.scale.width, H = this.scale.height;
    const sheetTop = Math.round(H * DETAIL.mediaRatio);
    const tabs = this.detailTabsOf(def);
    const tw = (W - 32) / tabs.length;
    const tabY = sheetTop + DETAIL.tabH / 2 - 2;
    tabs.forEach((t, i) => {
      const on = t === tab, tx = 16 + i * tw + tw / 2;
      const row: Phaser.GameObjects.GameObject[] = [
        this.add.text(tx, tabY, DETAIL_TAB_LABEL[t], { fontSize: '15px', color: on ? '#ffd34d' : '#b9a3d6', fontStyle: 'bold' }).setOrigin(0.5),
      ];
      if (on) row.push(this.add.graphics().fillStyle(0xffd34d).fillRoundedRect(tx - 24, tabY + 14, 48, 3, 1.5));
      else {
        const zone = setTouchInteractive(this.add.zone(tx, tabY, tw, DETAIL.tabH));
        zone.on('pointerup', () => this.showDetailTab(def, t));
        row.push(zone);
      }
      for (const o of row) panel.add(o.setData('detailTabRow', true));
    });
    this.renderDetailContent(def, tab);
  }

  /** 시트 내용 창 — 넘치면 시트 안에서 끌어 · 휠로 스크롤 */
  private renderDetailContent(def: CharacterDef, tab: DetailTab): void {
    this.detailTab = tab;
    this.dropDetailContent();
    const W = this.scale.width, H = this.scale.height;
    const sheetTop = Math.round(H * DETAIL.mediaRatio);
    const top = sheetTop + DETAIL.tabH + 8, bottom = H - DETAIL.buttonArea;
    const vp = new Phaser.Geom.Rectangle(0, top, W, Math.max(40, bottom - top));
    const content = this.add.container(0, vp.y).setDepth(301);
    this.detailContent = content;

    const x = 18, w = W - 36 - 8;   // 오른쪽 8 = 스크롤 막대 자리
    let y = 0;
    const heading = (s: string, color: string) => {
      const t = this.add.text(x, y, s, { fontSize: '12px', color, fontStyle: 'bold' });
      content.add(t);
      y += textContentHeight(t) + 4;
    };
    const body = (s: string, color = '#eeeeee', indent = 0) => {
      const t = this.add.text(x + indent, y, s, { fontSize: '13px', color, lineSpacing: 3, wordWrap: { width: w - indent, useAdvancedWrap: true } });
      content.add(t);
      y += textContentHeight(t);
      return t;
    };

    if (tab === 'ability') {
      // 능력 문구의 ** (굵게 표시) 는 뺀다 — 한 줄 설명(shortLine)과 같다
      const plain = (t: string) => t.replace(/\*\*/g, '');
      heading('기본 효과', '#88bbff');
      body(plain(def.basicEffect));
      y += 14;
      heading('특수 능력', '#ffdd88');
      body(plain(def.specialAbility), def.specialAbility === '없음' ? '#8a7ab8' : '#eeeeee');
    } else if (tab === 'awaken') {
      this.renderAwakening(content, def, x, w, () => y, v => { y = v; });
    } else {
      this.renderSynergy(content, def, x, w, () => y, v => { y = v; });
    }
    y += 8;

    // ── 시트 안 스크롤 — 마스크로 자르고 손가락 · 휠로 끈다 (내용에 눌리는 칸이 없어 clipToViewport 는 필요 없다) ──
    const mask = this.make.graphics({ x: 0, y: 0 });
    mask.fillRect(vp.x, vp.y, vp.width, vp.height);
    content.setMask(mask.createGeometryMask());
    this.detailMask = mask;
    const maxScroll = Math.max(0, y - vp.height);
    let scroll = 0;
    const thumbH = maxScroll > 0 ? Math.max(24, vp.height * vp.height / y) : 0;
    const thumb = maxScroll > 0 ? this.add.rectangle(W - 6, vp.y, 3, thumbH, 0xd9c6f0, 0.6).setOrigin(0.5, 0).setDepth(302) : null;
    this.detailThumb = thumb;
    const apply = () => {
      content.y = vp.y - scroll;
      if (thumb) thumb.y = vp.y + (vp.height - thumbH) * (scroll / maxScroll);
    };
    let drag: { y: number; s: number } | null = null;
    const down = (p: Phaser.Input.Pointer) => { drag = maxScroll > 0 && vp.contains(p.x, p.y) ? { y: p.y, s: scroll } : null; };
    const move = (p: Phaser.Input.Pointer) => {
      if (!drag || !p.isDown) return;
      scroll = Phaser.Math.Clamp(drag.s + (drag.y - p.y), 0, maxScroll);
      apply();
    };
    const up = () => { drag = null; };
    const wheel = (p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      if (maxScroll <= 0 || !vp.contains(p.x, p.y)) return;
      scroll = Phaser.Math.Clamp(scroll + dy * 0.5, 0, maxScroll);
      apply();
    };
    this.input.on('pointerdown', down);
    this.input.on('pointermove', move);
    this.input.on('pointerup', up);
    this.input.on('wheel', wheel);
    this.detailScrollOff = () => {
      this.input.off('pointerdown', down);
      this.input.off('pointermove', move);
      this.input.off('pointerup', up);
      this.input.off('wheel', wheel);
    };
    apply();
  }

  /** 각성 탭 — 지금 ★ · 다음 각성까지 남은 장 수 · 효과가 정해진 단계만 (config/awakening) */
  private renderAwakening(content: Phaser.GameObjects.Container, def: CharacterDef, x: number, w: number,
    getY: () => number, setY: (v: number) => void): void {
    const owned = this.ownedIds.includes(def.id);
    const dup = owned ? getDuplicateCount(def.id) : 0;
    const level = owned ? awakeningLevelOf(def.grade, dup) : 0;
    const next = getNextAwakening(def.grade, dup);
    const thresholds = AWAKENING_THRESHOLDS[def.grade as AwakeningGrade] ?? [];
    let y = getY();

    // ★ 줄
    const stars = this.add.text(x, y, '★'.repeat(level) + '☆'.repeat(MAX_AWAKENING_LEVEL - level), {
      fontSize: '18px', color: '#ffd34d', fontStyle: 'bold',
    });
    content.add(stars);
    const tail = !owned
      ? `얻으면 ★0 · ★1 은 중복 ${thresholds[0] ?? 0}장`
      : next ? `다음 ★${next.level} 까지 ${next.remaining}장` : '최대 각성';
    content.add(this.add.text(x + textContentWidth(stars) + 10, y + 3, tail, { fontSize: '13px', color: '#e8dcff', fontStyle: 'bold' }));
    y += textContentHeight(stars) + 6;
    content.add(this.add.text(x, y, owned ? `중복 ${dup}장 보유` : '아직 없는 캐릭터예요 — 뽑으면 ★0 부터', {
      fontSize: '11px', color: '#b9a3d6',
    }));
    y += 24;

    // 효과가 정해진 단계만 — 효과가 없는 단계(★3~★5)는 줄을 만들지 않는다
    for (let n = 1; n <= MAX_DEFINED_AWAKENING_LEVEL; n++) {
      const text = getAwakeningEffectText(def.id, def.grade, n);
      if (!text) continue;
      const got = level >= n;
      const star = this.add.text(x, y, `★${n}`, { fontSize: '14px', color: got ? '#ffd34d' : '#8a7ab8', fontStyle: 'bold' });
      const need = this.add.text(x + 34, y + 2, `중복 ${thresholds[n - 1] ?? 0}장`, { fontSize: '11px', color: '#b9a3d6', fontStyle: 'bold' });
      const t = this.add.text(x + 100, y, text, {
        fontSize: '13px', color: got ? '#ffffff' : '#cfc4e8', wordWrap: { width: w - 100, useAdvancedWrap: true },
      });
      content.add([star, need, t]);
      y += Math.max(textContentHeight(star), textContentHeight(t)) + 10;
    }
    setY(y);
  }

  /** 이 캐릭터의 시너지 — 배경화면마다 getSynergy (config/synergyMap). 모든 배경화면에 붙으면(치비) 한 줄로 */
  private synergyOf(def: CharacterDef): { wp: BackgroundDef | null; syn: WallpaperSynergy }[] {
    const wps = WALLPAPERS.filter(w => AVAILABLE_WP_SET.has(w.id));
    const hits = wps.map(w => ({ wp: w, syn: getSynergy(w.id, def.id) })).filter((h): h is { wp: BackgroundDef; syn: WallpaperSynergy } => !!h.syn);
    if (hits.length && hits.length === wps.length) return [{ wp: null, syn: hits[0].syn }];
    return hits;
  }

  /** 시너지 탭 — 배경화면 썸네일 · 짝 이름 · 효과 · 보유 여부 */
  private renderSynergy(content: Phaser.GameObjects.Container, def: CharacterDef, x: number, w: number,
    getY: () => number, setY: (v: number) => void): void {
    let y = getY();
    const tw = 96, th = Math.round(tw * 220 / 340);
    for (const { wp, syn } of this.synergyOf(def)) {
      const effect = [
        `이동속도 +${syn.speedBonus}`,
        `특수 똥 +${syn.collectBonus}점`,
        ...(syn.rainbowFever ? ['피버가 가끔 레인보우 피버로'] : []),
        ...(syn.clearPoops ? ['일정 점수마다 화면의 똥 전부 제거'] : []),
      ].join(' · ');
      let tx = x;
      if (wp) {
        const key = this.bakeRounded(`cs_wp_${wp.id}`, `cs_dsyn_${wp.id}`, tw, th, 8);
        if (key) content.add(this.add.image(x, y, key).setOrigin(0, 0));
        tx = x + tw + 10;
      }
      const label = this.add.text(tx, y, syn.label, {
        fontSize: '14px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: w - (tx - x), useAdvancedWrap: true },
      });
      content.add(label);
      let ly = y + textContentHeight(label) + 2;
      // 조사는 붙여 쓰고, 받침에 따라 을/를
      const how = wp ? `배경화면 '${wp.name}'${objectJosa(wp.name)} 쓰면 ${effect}` : `어떤 배경화면이든 쓰면 ${effect}`;
      const ht = this.add.text(tx, ly, how, {
        fontSize: '12px', color: '#cfc4e8', lineSpacing: 2, wordWrap: { width: w - (tx - x), useAdvancedWrap: true },
      });
      content.add(ht);
      ly += textContentHeight(ht) + 2;
      if (wp) {
        const have = this.ownedWpIds.includes(wp.id);
        content.add(this.add.text(tx, ly, have ? '배경화면 보유' : '배경화면 미보유', {
          fontSize: '11px', color: have ? '#9fe8a8' : '#b9a3d6', fontStyle: 'bold',
        }));
        ly += 16;
      }
      y = Math.max(y + (wp ? th : 0), ly) + 12;
    }
    setY(y);
  }

  /** 어느 뽑기에서 나오는지 — 지금 열린 배너(visibleBanners) 순서대로. 상시 풀이면 '상시' */
  private whereToPull(def: CharacterDef): string[] {
    const inStandard = standardPool(CHARACTERS).some(c => c.id === def.id);
    return visibleBanners().flatMap(b => {
      if (b.kind === 'standard') return inStandard ? ['상시'] : [];
      if (b.pickupUR !== def.id && !b.pickupSR.includes(def.id)) return [];
      if (b.kind === 'event') return ['이벤트 픽업'];
      const ur = b.pickupUR ? CHARACTERS.find(c => c.id === b.pickupUR) : null;
      return [ur ? `${ur.name} 픽업` : '픽업'];
    });
  }

  /** 아래 버튼 — [장착] (장착 중이면 그 상태) / [뽑기로] + 얻는 곳 한 줄 → 뽑기 화면 */
  private buildDetailButton(panel: Phaser.GameObjects.Container, def: CharacterDef, owned: boolean, equipped: boolean): void {
    const W = this.scale.width, H = this.scale.height;
    const w = W - 32, h = 52, y = H - DETAIL.buttonArea / 2;
    const box = this.add.container(W / 2, y);
    if (owned) {
      const skin = bakeButton(this, `cs_dbtn_${equipped ? 'on' : 'equip'}_${w}`, equipped
        ? { w, h, radius: 16, top: '#5a4a2a', bottom: '#3a2e14', border: '#ffd34d', borderW: 2, lip: '#2a2010', lipH: 4, gloss: 0 }
        : { w, h, radius: 16, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 3, lip: '#a8650a', lipH: 5, gloss: 0 });
      box.add(this.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
      box.add(this.add.text(0, -1, equipped ? '장착 중' : '장착', {
        fontSize: '19px', fontStyle: 'bold', color: equipped ? '#ffd34d' : '#5b2e0e', stroke: equipped ? '#000000' : '#ffffff', strokeThickness: equipped ? 3 : 4,
      }).setOrigin(0.5));
      panel.add(box);
      if (!equipped) {
        wireButton(this, box, w, h, () => {
          this.selectCharacter(def.id);
          this.buildCharacterDetail(def.id, this.detailTab);   // '장착 중' 으로 다시 그린다
        });
      }
      return;
    }
    const where = this.whereToPull(def);
    const skin = bakeButton(this, `cs_dbtn_pull_${where.length ? 'on' : 'off'}_${w}`, where.length
      ? { w, h, radius: 16, top: '#5a24a8', bottom: '#1e0a40', border: '#ffd34d', borderW: 3, lip: '#5a1e9c', lipH: 5, gloss: 0, glow: 'rgba(255,200,90,0.6)' }
      : { w, h, radius: 16, top: '#4a4458', bottom: '#2a2638', border: '#6a6488', borderW: 2, lip: '#1e1a2a', lipH: 4, gloss: 0 });
    box.add(this.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
    const label = this.add.text(0, -9, '뽑기로', {
      fontSize: '19px', fontStyle: 'bold', color: '#ffffff', stroke: '#2a0a4a', strokeThickness: 4,
    }).setOrigin(0.5);
    if (where.length) gradientText(label, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    box.add(label);
    box.add(this.add.text(0, 13, where.length ? `${where.join(' · ')}에서 나와요` : '지금 열린 뽑기에는 없어요', {
      fontSize: '11px', color: '#e8dcff', fontStyle: 'bold',
    }).setOrigin(0.5));
    panel.add(box);
    if (where.length) {
      wireButton(this, box, w, h, () => {
        this.hideCharacterDetail();   // 영상 · 받던 것까지 내리고 나간다 (shutdown 에서는 요소가 먼저 떨어져 받던 것을 못 끊는다)
        this.scene.start('GachaScene');
      });
    }
  }

  /** 시트 내용 창을 내린다 (스크롤 입력 · 마스크까지) */
  private dropDetailContent(): void {
    this.detailScrollOff?.();
    this.detailScrollOff = null;
    this.detailContent?.destroy();
    this.detailContent = null;
    this.detailMask?.destroy();   // 마스크 그래픽은 화면 목록 밖이라 따로 지운다
    this.detailMask = null;
    this.detailThumb?.destroy();
    this.detailThumb = null;
  }

  /** 상세를 닫는다 — 영상은 받던 것까지 끊고 내린다 (utils/videoReel). 일러스트는 나갈 때 releaseTextures 가 내린다 */
  private hideCharacterDetail(): void {
    this.detailReel?.destroy();
    this.detailReel = null;
    this.dropDetailContent();
    this.detailPanel?.destroy();
    this.detailPanel = null;
  }


  /** 돌아가기 — 메인 화면 버튼과 같은 판 */
  private createBackButton() {
    const W = this.scale.width, H = this.scale.height;
    const { originY } = bakeButton(this, 'cs_back', {
      w: 200, h: 44, radius: 22, top: '#4a4a70', bottom: '#24243c', border: '#8a8ab8', borderW: 2,
      lip: '#16162a', lipH: 4, gloss: 0.5,
    });
    const box = this.add.container(W / 2, H - 40).setDepth(10);
    box.add(this.add.image(0, 0, 'cs_back').setOrigin(0.5, originY));
    box.add(this.add.text(0, 0, '← 돌아가기', { fontSize: '17px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5));
    wireButton(this, box, 200, 44, () => this.scene.start(this.returnScene));
  }
}
