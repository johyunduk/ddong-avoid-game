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
import { syncOwnedCharacters, syncOwnedWallpapers } from '../utils/gacha';
import { destroyVideo } from '../utils/video';
import BaseScene from './BaseScene';
import { textContentHeight, textContentWidth } from '../utils/textSafety';
import { bakeButton, clipToViewport, hitRect, MIN_TOUCH, setTouchInteractive, wireButton, type ButtonSkin } from '../utils/buttonSkin';

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

/** 배너 아래 필터 줄(수집 진행 · 등급 칩)의 세로 가운데 — 배너 아래끝(sh)에서 */
const FILTER_ROW_DY = MIN_TOUCH / 2;

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
  private loadingKeys = new Set<string>();

  // 상세 정보 패널
  private detailPanel: Phaser.GameObjects.Container | null = null;
  private infoPanel: Phaser.GameObjects.Container | null = null;
  private detailVideo: Phaser.GameObjects.Video | null = null;
  private fitVideoTimers: Phaser.Time.TimerEvent[] = [];
  private illustLoadingId: string | null = null;

  constructor() {
    super('CharacterSelectScene');
  }

  init(data: { returnScene?: string }) {
    this.returnScene = data.returnScene ?? 'ModeSelectScene';
  }

  preload() {
    for (const char of CHARACTERS) {
      if (!this.textures.exists(char.imageKey)) {
        this.load.image(char.imageKey, char.imagePath);
      }
      if (char.videoKey && char.videoPath && !this.cache.video.exists(char.videoKey)) {
        this.load.video(char.videoKey, char.videoPath);
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
      this.load.image(selDef.illustKey, selDef.illustPath);
    }
    // 배경화면 — 격자는 작은 썸네일만. 큰 배경(720x1080)은 쇼케이스에서 볼 때 한 장씩
    for (const wp of WALLPAPERS.filter(w => AVAILABLE_WP_SET.has(w.id))) {
      if (!this.textures.exists(`cs_wp_${wp.id}`)) this.load.image(`cs_wp_${wp.id}`, `assets/ui/collection/wp/${wp.id}.webp`);
    }
    const selWp = WALLPAPERS.find(w => w.id === getSelectedWallpaper());
    if (selWp && !this.textures.exists(selWp.bgKey)) this.load.image(selWp.bgKey, selWp.bgPath);
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
    this.infoPanel = null;
    this.detailVideo = null;
    this.fitVideoTimers = [];
    this.illustLoadingId = null;

    // 동기화 전 각성 수치 스냅샷 (동기화 후 변화 감지용)
    this._preSyncDupCounts = new Map(
      CHARACTERS
        .filter(c => this.ownedIds.includes(c.id) && c.grade !== '등급외')
        .map(c => [c.id, getDuplicateCount(c.id)])
    );

    // 서버 DB와 동기화 — 소유 목록 or 각성 수치가 바뀐 경우 씬 재시작해서 카드 갱신
    syncOwnedCharacters().then(synced => {
      if (!this.scene.isActive()) return;
      const ownedChanged = synced.length !== this.ownedIds.length ||
        synced.some(id => !this.ownedIds.includes(id));
      const awakeChanged = CHARACTERS.some(c =>
        synced.includes(c.id) && c.grade !== '등급외' &&
        getDuplicateCount(c.id) !== this._preSyncDupCounts.get(c.id)
      );
      if (ownedChanged || awakeChanged) this.scene.restart();
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
      this.maskGfx.destroy();
      this.bannerMaskG?.destroy();
      this.bannerMaskG = null;
    });
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

  /** 텍스처를 그때그때 올린다 — 다 올라오면 onReady (이미 있으면 바로) */
  private ensureTexture(key: string, path: string, onReady: () => void): void {
    if (this.textures.exists(key)) { onReady(); return; }
    if (this.loadingKeys.has(key)) return;
    this.loadingKeys.add(key);
    this.load.image(key, path);
    this.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${key}`, () => {
      this.loadingKeys.delete(key);
      if (this.scene.isActive()) onReady();
    });
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
      });
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
      });
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
      });
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
      });
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

  private showCharacterDetail(id: string): void {
    const def = CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
    // 일러스트 온디맨드 로드 (preload에서는 선택된 캐릭터만 로드됨)
    if (!this.textures.exists(def.illustKey)) {
      if (this.illustLoadingId) return; // 이미 로딩 중이면 중복 요청 무시
      this.illustLoadingId = id;
      this.load.image(def.illustKey, def.illustPath);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.illustLoadingId = null;
        if (this.scene.isActive()) this.buildCharacterDetail(id);
      });
      this.load.start();
      return;
    }
    this.buildCharacterDetail(id);
  }

  private buildCharacterDetail(id: string): void {
    this.hideCharacterDetail();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const def = CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
    const isOwned = this.ownedIds.includes(id);
    const gradeColorInt = parseInt(def.gradeColor.replace('#', ''), 16);

    const panel = this.add.container(0, 0).setDepth(300);
    this.detailPanel = panel;

    // ── 클릭 투과 차단 레이어 (카드 목록으로 이벤트 전달 방지)
    const blocker = this.add.rectangle(cx, H / 2, W, H, 0x000000, 0).setInteractive();
    panel.add(blocker);

    // ── 일러스트 전체 화면 ───────────────────────────────────────────
    const illust = this.add.image(cx, H / 2, def.illustKey).setDisplaySize(W, H);
    panel.add(illust);

    // ── 비디오 (일러스트와 같은 위치, 처음엔 숨김) ─────────────────
    const hasVideo = !!(def.videoKey && this.cache.video.exists(def.videoKey));
    const videoObj = hasVideo
      ? this.add.video(cx, H / 2, def.videoKey!).setDisplaySize(W, H).setVisible(false)
      : null;
    if (videoObj) {
      panel.add(videoObj);
      this.detailVideo = videoObj;
    }

    // ── 하단 그라디언트 (위 투명 → 아래 짙은 어둠) ─────────────────
    // 비디오/일러스트 위, 버튼 아래에 위치하도록 여기서 추가
    const yOff = (H - 600) / 2;
    const grad = this.add.graphics();
    grad.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.78, 0.78);
    grad.fillRect(0, H - 220, W, 220);
    panel.add(grad);

    // ── ✕ 닫기 버튼 (우상단 플로팅) ────────────────────────────────
    const closeBg = this.add.circle(W - 28, 38 + yOff, 22, 0x000000, 0.55)
      .setInteractive({ useHandCursor: true });
    const closeBtn = this.add.text(W - 28, 38 + yOff, '✕', {
      fontSize: '18px', color: '#cccccc',
    }).setOrigin(0.5);
    closeBg.on('pointerover', () => { closeBg.setFillStyle(0x333333, 0.8); closeBtn.setColor('#ffffff'); });
    closeBg.on('pointerout',  () => { closeBg.setFillStyle(0x000000, 0.55); closeBtn.setColor('#cccccc'); });
    closeBg.on('pointerup',   () => this.hideCharacterDetail());
    panel.add(closeBg);
    panel.add(closeBtn);

    // ── 하단 정보 영역 ───────────────────────────────────────────────
    // 픽셀 스프라이트
    const sprite = this.add.image(38, H - 85, def.imageKey).setDisplaySize(46, 64);
    if (!isOwned) { sprite.setTint(0x222222).setAlpha(0.55); }
    panel.add(sprite);

    // 등급 배지
    const gradeImgKey2 = getGradeImgKey(def.grade);
    if (gradeImgKey2) {
      const gradeBadge = this.add.image(74, H - 108, gradeImgKey2).setDisplaySize(28, 28).setOrigin(0.5);
      panel.add(gradeBadge);
    }

    // 캐릭터 이름 (크게)
    const nameText = this.add.text(74, H - 90, def.name, {
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    });
    panel.add(nameText);

    // ── 하단 버튼 2개 (나란히) ──────────────────────────────────────
    const BTN_Y = H - 32;
    const BTN_W = 168;
    const BTN_H = 44;   // 손가락 크기 (MIN_TOUCH)

    // 📋 정보 보기 (좌)
    const infoBg = this.add.rectangle(cx - 92, BTN_Y, BTN_W, BTN_H, 0x1a1a1a)
      .setStrokeStyle(1.5, 0x555555)
      .setInteractive({ useHandCursor: true });
    infoBg.on('pointerover', () => infoBg.setFillStyle(0x2e2e2e));
    infoBg.on('pointerout',  () => infoBg.setFillStyle(0x1a1a1a));
    infoBg.on('pointerup',   () => this.showInfoPanel(def));
    const infoLabel = this.add.text(cx - 92, BTN_Y, '📋  정보 보기', {
      fontSize: '14px', color: '#cccccc', fontStyle: 'bold',
    }).setOrigin(0.5);
    panel.add(infoBg);
    panel.add(infoLabel);

    // ✔ 선택하기 / 🔒 미보유 (우)
    if (isOwned) {
      const selBg = this.add.rectangle(cx + 92, BTN_Y, BTN_W, BTN_H, 0x1144bb)
        .setStrokeStyle(2, gradeColorInt)
        .setInteractive({ useHandCursor: true });
      selBg.on('pointerover', () => selBg.setFillStyle(0x2860dd));
      selBg.on('pointerout',  () => selBg.setFillStyle(0x1144bb));
      selBg.on('pointerup',   () => this.confirmSelect(id));
      const selLabel = this.add.text(cx + 92, BTN_Y, '✔  선택하기', {
        fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);
      panel.add(selBg);
      panel.add(selLabel);
    } else {
      const lockBg = this.add.rectangle(cx + 92, BTN_Y, BTN_W, BTN_H, 0x1a1a1a)
        .setStrokeStyle(1.5, 0x444444);
      const lockLabel = this.add.text(cx + 92, BTN_Y, '🔒  미보유', {
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
        videoObj!.setVisible(true);
        videoObj!.play(false);
        this.fitVideoToPanel(videoObj!);
        // 비디오 'play' 이벤트 = 실제 재생 시작 시점 → 그때 일러스트 숨김
        // (즉시 숨기면 첫 프레임 렌더 전 갭에 카드 목록이 비침)
        videoObj!.once('play', () => {
          if (illust.active) illust.setVisible(false);
        });
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

  /** GachaScene.fitVideoToCanvas와 동일 — aspect ratio 유지하며 캔버스에 cover */
  private fitVideoToPanel(vid: Phaser.GameObjects.Video): void {
    const W = this.scale.width, H = this.scale.height;
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
    this.fitVideoTimers.push(this.time.delayedCall(100, applyContain));
    this.fitVideoTimers.push(this.time.delayedCall(500, applyContain));
  }

  private hideCharacterDetail(): void {
    // fitVideoToPanel의 pending 타이머 취소
    for (const t of this.fitVideoTimers) t.remove();
    this.fitVideoTimers = [];

    // 비디오 파괴 + 재생 시 생성된 UUID 텍스처 제거 (Phaser preDestroy가 안 지움)
    destroyVideo(this.detailVideo);
    this.detailVideo = null;

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

    // ── 각성 보너스 계산 ──────────────────────────────────────────────
    const dupCount   = getDuplicateCount(def.id);
    const awakeLevel = getAwakeningLevel(def.grade, dupCount);
    const awakeBonusLines: string[] = [];
    if (def.grade !== '등급외') {
      if (awakeLevel >= 1) {
        const spd = def.id === 'maehwa' ? 5 : def.grade === 'UR' ? 15 : def.grade === 'SR' ? 10 : 5;
        awakeBonusLines.push(`★1 각성: 이동속도 +${spd} px/s`);
      }
      if (awakeLevel >= 2) {
        if (def.id === 'maehwa') {
          awakeBonusLines.push('★2 각성: 특수 똥 수집 시 +5점');
        } else {
          const spd = def.grade === 'UR' ? 20 : def.grade === 'SR' ? 15 : 10;
          awakeBonusLines.push(`★2 각성: 이동속도 +${spd} px/s (누적)`);
        }
      }
    }
    const awakeBonusText = awakeBonusLines.join('\n');

    // 반투명 배경 (클릭 시 닫기)
    const overlay = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.80)
      .setInteractive();
    overlay.on('pointerup', () => this.hideInfoPanel());
    panel.add(overlay);

    // ── 카드 크기 계산 (텍스트 높이 선측정) ─────────────────────────
    const CARD_W = 370;
    const WRAP_W = CARD_W - 40; // 좌(15px)·우(25px) 여백 제외한 실제 텍스트 폭
    const HEADER_H = 60;  // 스프라이트+이름+구분선 영역
    const PAD_BOT  = 20;

    const btMeasure = this.add.text(0, -999, def.basicEffect,    { fontSize: '13px', wordWrap: { width: WRAP_W } });
    const stMeasure = this.add.text(0, -999, def.specialAbility, { fontSize: '13px', wordWrap: { width: WRAP_W } });
    const abMeasure = awakeBonusText
      ? this.add.text(0, -999, awakeBonusText, { fontSize: '12px', wordWrap: { width: WRAP_W } })
      : null;
    const abHeight  = abMeasure ? textContentHeight(abMeasure) + 8 : 0;
    const cardH = HEADER_H + 18 + textContentHeight(btMeasure) + abHeight + 14 + 18 + textContentHeight(stMeasure) + PAD_BOT;
    btMeasure.destroy();
    stMeasure.destroy();
    abMeasure?.destroy();

    // 화면 중앙 배치 (상하 여백 각 70px 보장)
    const _cx = this.scale.width / 2;
    const _H = this.scale.height;
    const _yOff = (_H - 600) / 2;
    const cardTop = Math.max(70 + _yOff, Math.round((_H - cardH) / 2));
    const card = this.add.rectangle(_cx, cardTop + cardH / 2, CARD_W, cardH, 0x111111)
      .setStrokeStyle(2, gradeColorInt);
    panel.add(card);

    // ── 헤더: 픽셀 스프라이트 + 등급 + 이름 ─────────────────────────
    const sprite = this.add.image(_cx - CARD_W / 2 + 37, cardTop + 24, def.imageKey).setDisplaySize(38, 52);
    panel.add(sprite);

    const gradeImgKey3 = getGradeImgKey(def.grade);
    if (gradeImgKey3) {
      const badge = this.add.image(_cx - CARD_W / 2 + 67, cardTop + 8, gradeImgKey3).setDisplaySize(24, 24).setOrigin(0.5, 0);
      panel.add(badge);
    }

    const name = this.add.text(_cx - CARD_W / 2 + 67, cardTop + 24, def.name, {
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    });
    panel.add(name);

    // ✕ 닫기 (헤더 우측)
    const closeX = _cx + CARD_W / 2 - 14;
    const closeY = cardTop + 16;
    const infoBtnBg = this.add.circle(closeX, closeY, 22, 0x000000, 0)   // 투명 — 반지름 22 = 지름 44 (MIN_TOUCH)
      .setInteractive({ useHandCursor: true });
    const closeTxt = this.add.text(closeX, closeY, '✕', {
      fontSize: '16px', color: '#999999',
    }).setOrigin(0.5);
    infoBtnBg.on('pointerover', () => closeTxt.setColor('#ffffff'));
    infoBtnBg.on('pointerout',  () => closeTxt.setColor('#999999'));
    infoBtnBg.on('pointerup',   () => this.hideInfoPanel());
    panel.add(infoBtnBg);
    panel.add(closeTxt);

    // 구분선
    panel.add(this.add.rectangle(_cx, cardTop + HEADER_H - 4, CARD_W - 20, 1, 0x444444));

    // ── 기본 효과 ─────────────────────────────────────────────────────
    const textLeft = _cx - CARD_W / 2 + 15;
    let curY = cardTop + HEADER_H + 4;

    panel.add(this.add.text(textLeft, curY, '🔷 기본 효과', {
      fontSize: '12px', color: '#88bbff', fontStyle: 'bold',
    }));
    curY += 18;

    const basicText = this.add.text(textLeft, curY, def.basicEffect, {
      fontSize: '13px', color: '#eeeeee', wordWrap: { width: WRAP_W },
    });
    panel.add(basicText);
    curY += textContentHeight(basicText);

    if (awakeBonusText) {
      curY += 8;
      panel.add(this.add.text(textLeft, curY, awakeBonusText, {
        fontSize: '12px', color: '#ffd700', wordWrap: { width: WRAP_W },
      }));
      curY += (abHeight - 8);
    }

    curY += 14;

    // ── 특수 능력 ─────────────────────────────────────────────────────
    panel.add(this.add.text(textLeft, curY, '⚡ 특수 능력', {
      fontSize: '12px', color: '#ffdd88', fontStyle: 'bold',
    }));
    curY += 18;

    panel.add(this.add.text(textLeft, curY, def.specialAbility, {
      fontSize: '13px',
      color: def.specialAbility === '없음' ? '#666666' : '#eeeeee',
      wordWrap: { width: WRAP_W },
    }));
  }

  private hideInfoPanel(): void {
    this.infoPanel?.destroy();
    this.infoPanel = null;
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
