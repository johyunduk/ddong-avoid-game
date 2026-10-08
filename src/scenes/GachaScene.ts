import Phaser from 'phaser';
import {
  gachaPull, syncOwnedCharacters, syncOwnedWallpapers, gachaPool, gachaRates, formatRate, GACHA_WP_DROP_CHANCE,
  type PulledCharacter, type PulledWallpaper,
} from '../utils/gacha';
import { CHARACTERS, getCharacterDef, addOwnedCharacter, getDuplicateCount, setDuplicateCount, getGradeImgKey, getGradeColorInt, getAwakeningLevel, type CharacterDef } from '../utils/character';
import { WALLPAPERS, getWallpaperDef, addOwnedWallpaper, WP_ACCENT_INT, WP_ACCENT_HEX, type BackgroundDef } from '../utils/wallpaper';
import { getSkorBalance, getCachedSkorBalance, cacheSkorBalance } from '../utils/skor';
import { destroyVideo } from '../utils/video';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { bakeButton, bakeRadialGlow, bakeRoundedImage, gradientText, setTouchInteractive, wireButton } from '../utils/buttonSkin';

// 개인 영상이 있는 캐릭터 — **캐릭터 정의에서 그대로 읽는다.** 영상 유무는 이미
// `videoKey`/`videoPath` 가 말하고 있어서, 목록을 따로 두면 캐릭터를 추가할 때
// 한쪽만 고치고 다른 쪽이 낡는다 (랭킹 화이트리스트가 그렇게 어긋났다).
const CHARS_WITH_VIDS = new Set(
  CHARACTERS.filter(c => c.videoKey && c.videoPath).map(c => c.id),
);

// 신규 출시 캐릭터 — 출시 때 characterId 만 바꾼다. 진열 맨 앞에 오고 NEW 표시가 붙는다
const CURRENT_BANNER = {
  characterId: 'ted',
  label: '신규 출시',
};

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

/**
 * 뽑기 화면에 진열하는 캐릭터 — 신규 출시 하나 + 뽑을 수 있는 UR 전부. **캐릭터 정의에서 유도한다.**
 * preload 가 진열 캐릭터 일러스트(768x1344, 장당 약 4MB)를 미리 받으므로 진열을 늘리면 텍스처 메모리가 는다.
 * 그래서 SR 까지 다 넣지 않는다 (예전 슬라이드쇼는 15장이었다)
 */
function featuredIds(): string[] {
  const urs = gachaPool().filter(c => c.grade === 'UR').map(c => c.id);
  return [CURRENT_BANNER.characterId, ...urs.filter(id => id !== CURRENT_BANNER.characterId)];
}

export default class GachaScene extends BaseScene {
  private skorBalance = 0;
  private remainingSkor = 0;
  private pullResults: PulledCharacter[] = [];
  private wpResults: PulledWallpaper[] = [];
  /** SKOR 부족 토스트 — 한 번에 하나만 (연달아 누르면 쌓이지 않고 다시 뜬다) */
  private skorToast: Phaser.GameObjects.Container | null = null;
  /** pullResults 와 같은 순서 */
  private pullMeta: PullMeta[] = [];
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

  // ── 로비 슬라이드쇼 상태 ──
  private featured: CharacterDef[] = [];
  private slideshowIndex = 0;
  private slideshowIsA = true; // true → bgA가 현재 레이어
  private slideshowBgA: Phaser.GameObjects.Image | null = null;
  private slideshowBgB: Phaser.GameObjects.Image | null = null;
  private slideshowGradeImg: Phaser.GameObjects.Image | null = null;
  private slideshowNameText: Phaser.GameObjects.Text | null = null;
  private slideshowRateText: Phaser.GameObjects.Text | null = null;
  private slideshowNewBadge: Phaser.GameObjects.Container | null = null;
  private slideshowActive = false;
  private slideTimer: Phaser.Time.TimerEvent | null = null;
  private railChips: { chip: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Graphics; color: number }[] = [];

  constructor() {
    super('GachaScene');
  }

  init() {
    this.ownKeys = new Set();   // preload 가 채운다
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
    // 진열 캐릭터 일러스트 + 레일 얼굴 (얼굴 파일이 없는 캐릭터는 로드 실패로 넘어가고 스프라이트로 대신한다)
    for (const id of featuredIds()) {
      const def = CHARACTERS.find(c => c.id === id);
      if (def && !this.textures.exists(def.illustKey)) {
        this.ownKeys.add(def.illustKey);
        this.load.image(def.illustKey, def.illustPath);
      }
      if (!this.textures.exists(`gacha_facesrc_${id}`)) {
        this.load.image(`gacha_facesrc_${id}`, `assets/ui/collection/face/${id}.webp`);
      }
    }
    // 리빌 화면 공통 배경
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
    this.revealItems = [];
    this.revealItemIndex = 0;
    this.skorToast = null;
    this.events.once('shutdown', () => this.releaseTextures());
    this.buildLobby();
  }

  // ═══════════════════════════════════════════════════
  // LOBBY
  // ═══════════════════════════════════════════════════

  private async buildLobby() {
    this.slideshowActive = false;
    this.clearUI();

    this.slideshowIndex = 0;
    this.slideshowIsA = true;
    this.featured = featuredIds().map(id => getCharacterDef(id));

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const first = this.featured[0];

    // ── 일러스트 배경 2레이어 (crossfade용) — 늘이지 않고 덮어 채운다 ──
    // bgA: 처음엔 현재 일러스트 (alpha=1), bgB: 다음 일러스트 대기 (alpha=0)
    this.slideshowBgA = this.add.image(cx, 0, first.illustKey);
    this.slideshowBgB = this.add.image(cx, 0, first.illustKey).setAlpha(0);
    this.coverIllust(this.slideshowBgA);
    this.coverIllust(this.slideshowBgB);

    // ── 위·아래 어둠 — 글자와 버튼이 일러스트 위에서 읽히게 (세로 그라데이션 한 장을 늘려 쓴다) ──
    const fade = this.bakeVFade();
    this.add.image(cx, 0, fade).setOrigin(0.5, 0).setDisplaySize(W, 90).setFlipY(true).setAlpha(0.7);
    this.add.image(cx, H, fade).setOrigin(0.5, 1).setDisplaySize(W, Math.min(340, H * 0.5));

    // ── 위: 뒤로 · SKOR ──
    this.createBackButton(32, 32);
    const cached = getCachedSkorBalance();
    const skorText = this.createSkorPill(W - 80, 32, cached !== null ? Math.floor(cached).toLocaleString() : '--');
    this.skorBalance = -1;

    // ── 오른쪽 얼굴 레일 — 누르면 그 캐릭터로 넘어간다 ──
    this.createRail(W - 32, 96);

    // ── 이름 블록 ──
    const ny = H - 262;
    this.slideshowNewBadge = this.add.container(70, ny - 34);
    const nb = this.add.graphics();
    nb.fillStyle(0xe8261a).fillRoundedRect(-54, -12, 108, 24, 12);
    nb.lineStyle(1.5, 0x5a0a00).strokeRoundedRect(-54, -12, 108, 24, 12);
    this.slideshowNewBadge.add([nb, this.add.text(0, 0, CURRENT_BANNER.label, {
      fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5)]);

    const gradeKey = getGradeImgKey(first.grade);
    this.slideshowGradeImg = this.add.image(42, ny + 4, gradeKey ?? 'grade_r').setDisplaySize(48, 48);
    this.slideshowNameText = this.add.text(70, ny + 4, first.name, {
      fontSize: '34px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0, 0.5);
    this.slideshowRateText = this.add.text(20, ny + 38, '', {
      fontSize: '12px', color: '#ffe58a', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0, 0.5);

    // ── 뽑기 버튼 · 확률 ──
    this.buildPullButtons();
    const rates = gachaRates();
    this.add.text(cx, H - 56,
      `UR ${formatRate(rates.byGrade.UR)}%  ·  SR ${formatRate(rates.byGrade.SR)}%  ·  R ${formatRate(rates.byGrade.R)}%`, {
        fontSize: '11px', color: '#d9c6f0', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
    this.add.text(cx, H - 30, `배경화면은 슬롯마다 ${formatRate(GACHA_WP_DROP_CHANCE * 100)}% 확률로 함께 나온다`, {
      fontSize: '10px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0.7);

    this.updateSlideshowText(first);

    // ── 슬라이드쇼 타이머 (자동 전환) ──
    this.slideshowActive = true;
    this.restartSlideTimer();

    // 서버에서 최신 잔액 가져와 갱신
    this.skorBalance = await getSkorBalance();
    if (!this.scene.isActive()) return;
    cacheSkorBalance(this.skorBalance);
    if (skorText.active) skorText.setText(Math.floor(this.skorBalance).toLocaleString());
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

  /** 오른쪽 얼굴 레일 — 진열 캐릭터 얼굴(ui/collection/face)을 원으로 구워 세로로 */
  private createRail(x: number, top: number) {
    this.railChips = [];
    this.featured.forEach((def, i) => {
      const y = top + i * 58;   // 고른 칩은 1.22배 + NEW 꼬리표 — 54 면 아래 칩에 닿는다
      const chip = this.add.container(x, y);
      const src = `gacha_facesrc_${def.id}`;
      if (this.textures.exists(src)) {
        chip.add(this.add.image(0, 0, bakeRoundedImage(this, `gacha_face_${def.id}_36`, src, 36, 36, 18)).setDisplaySize(36, 36));
      } else if (this.textures.exists(def.imageKey)) {
        // 얼굴 그림이 없는 캐릭터 — 게임 스프라이트로 대신한다
        const img = this.add.image(0, 0, def.imageKey);
        chip.add(img.setScale(Math.min(32 / img.width, 32 / img.height)));
      }
      const ring = this.add.graphics();
      chip.add(ring);
      if (def.id === CURRENT_BANNER.characterId) {
        const tag = this.add.graphics();
        tag.fillStyle(0xe8261a).fillRoundedRect(-17, 15, 34, 14, 7);
        chip.add([tag, this.add.text(0, 22, 'NEW', { fontSize: '8px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5)]);
      }
      // 히트 영역은 왼쪽 위 기준 (buttonSkin.wireButton 주석 참고)
      chip.setSize(44, 44).setInteractive(new Phaser.Geom.Rectangle(0, 0, 44, 44), Phaser.Geom.Rectangle.Contains);
      if (chip.input) chip.input.cursor = 'pointer';
      chip.on('pointerdown', () => this.showSlide(i));
      this.railChips.push({ chip, ring, color: getGradeColorInt(def) });
    });
    this.refreshRail();
  }

  /** 지금 보는 칩만 크게 · 금테 */
  private refreshRail() {
    this.railChips.forEach(({ chip, ring, color }, i) => {
      const on = i === this.slideshowIndex;
      ring.clear().lineStyle(on ? 3 : 2, on ? 0xffd34d : color).strokeCircle(0, 0, 18);
      chip.setScale(on ? 44 / 36 : 1);
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
    if (!this.slideshowActive || !this.scene.isActive()) return;
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
    this.refreshRail();
    if (byUser) this.restartSlideTimer();

    // crossfade: 현재 fade-out, 다음 fade-in
    this.tweens.add({ targets: current,  alpha: 0, duration: 600, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: incoming, alpha: 1, duration: 600, ease: 'Sine.easeInOut' });
  }

  private updateSlideshowText(def: CharacterDef) {
    const rates = gachaRates();
    this.slideshowNewBadge?.setVisible(def.id === CURRENT_BANNER.characterId);

    // 등급 이미지: 기존 Image 객체를 재사용해 GC 압박 방지 (destroy+recreate 대신 setTexture)
    const gradeKey = getGradeImgKey(def.grade);
    if (this.slideshowGradeImg?.active) {
      this.slideshowGradeImg.setVisible(!!gradeKey);
      if (gradeKey) {
        this.slideshowGradeImg.setTexture(gradeKey).setDisplaySize(48, 48).setAlpha(0);
        this.tweens.add({ targets: this.slideshowGradeImg, alpha: 1, duration: 150 });
      }
    }
    if (this.slideshowNameText?.active) {
      this.slideshowNameText.setText(def.name).setAlpha(0);
      this.tweens.add({ targets: this.slideshowNameText, alpha: 1, duration: 150 });
    }
    if (this.slideshowRateText?.active) {
      const g = def.grade as keyof typeof rates.byGrade;
      this.slideshowRateText.setText(
        `이 캐릭터 ${formatRate(rates.perChar(def.grade))}%  ·  ${def.grade} 전체 ${formatRate(rates.byGrade[g] ?? 0)}%`);
    }
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

  /** 1회 = 금 판, 10회 = 보라 판 금테 + 할인 리본 (메뉴의 뽑기 버튼과 같은 결) */
  private buildPullButtons() {
    const W = this.scale.width, H = this.scale.height;
    const gap = 10, h = 86;
    const w = Math.floor((W - 32 - gap) / 2);
    const y = H - 128;
    this.addPullButton(16 + w / 2, y, w, h, 'single');
    this.addPullButton(W - 16 - w / 2, y, w, h, 'multi');
  }

  private addPullButton(x: number, y: number, w: number, h: number, type: 'single' | 'multi') {
    const multi = type === 'multi';
    const box = this.add.container(x, y);
    const skin = bakeButton(this, `gacha_pull_${type}_${w}`, multi
      ? { w, h, radius: 18, top: '#5a24a8', bottom: '#1e0a40', border: '#ffd34d', borderW: 3, lip: '#5a1e9c', lipH: 6, gloss: 0,
          glow: 'rgba(255,200,90,0.8)' }
      : { w, h, radius: 18, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 3, lip: '#a8650a', lipH: 6, gloss: 0 });
    box.add(this.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));

    const label = this.add.text(0, -14, multi ? '10회 소환' : '1회 소환', {
      fontSize: '21px', fontStyle: 'bold',
      color: multi ? '#ffffff' : '#5b2e0e', stroke: multi ? '#2a0a4a' : '#ffffff', strokeThickness: multi ? 6 : 5,
    }).setOrigin(0.5);
    if (multi) gradientText(label, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    box.add(label);

    // 값 알약
    const pg = this.add.graphics();
    pg.fillStyle(multi ? 0x000000 : 0x5a2e0e, multi ? 0.6 : 0.85).fillRoundedRect(-52, 8, 104, 24, 12);
    if (multi) pg.lineStyle(1, 0xffd34d).strokeRoundedRect(-52, 8, 104, 24, 12);
    box.add([
      pg,
      this.add.text(6, 20, multi ? '900' : '100', { fontSize: '14px', color: '#fff0c2', fontStyle: 'bold' }).setOrigin(1, 0.5),
      this.add.text(10, 20, 'SKOR', { fontSize: '10px', color: '#ffd34d', fontStyle: 'bold' }).setOrigin(0, 0.5),
    ]);

    // 10회 할인 리본
    if (multi) {
      const rib = bakeButton(this, 'gacha_sale_ribbon', {
        w: 64, h: 22, radius: 8, top: '#ff6a5a', bottom: '#e8261a', border: '#5a0a00', borderW: 2, lip: '#5a0a00', lipH: 3, gloss: 0,
      });
      box.add([
        this.add.image(w / 2 - 30, -h / 2 - 2, rib.key).setOrigin(0.5, rib.originY),
        this.add.text(w / 2 - 30, -h / 2 - 3, '10% 할인', { fontSize: '11px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5),
      ]);
    }

    wireButton(this, box, w, h, () => this.startPull(type), true);
  }

  /**
   * SKOR 부족 토스트 (A안 — 위쪽 알림 판). SKOR 알약 바로 아래에 짙은 빨강 판 300x58:
   * 'SKOR 이 부족해요' + 보유 N / 필요 M + 모자란 비율 막대. 1.8초 뒤 위로 밀며 사라진다.
   * 연달아 누르면 쌓이지 않고 하나만 다시 뜬다. 로비 · 뽑기 결과의 1회 더 · 10회 더 가 같이 쓴다.
   * 시안: ddong-fx-work/small-screens/3_skor_toast/A_*.png
   */
  private showSkorToast(have: number, need: number) {
    if (this.skorToast) {
      this.tweens.killTweensOf(this.skorToast);
      this.skorToast.destroy();
      this.skorToast = null;
    }
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
    this.skorToast = box;

    box.setAlpha(0).setY(y - 16);
    this.tweens.add({ targets: box, alpha: 1, y, duration: 180, ease: 'Quad.easeOut' });
    this.tweens.add({
      targets: box, alpha: 0, y: y - 30, duration: 260, delay: 1800, ease: 'Quad.easeIn',
      onComplete: () => { if (this.skorToast === box) this.skorToast = null; box.destroy(); },
    });
  }

  // ═══════════════════════════════════════════════════
  // PULL FLOW
  // ═══════════════════════════════════════════════════

  private async startPull(type: 'single' | 'multi') {
    const cost = type === 'multi' ? 900 : 100;
    if (this.skorBalance < 0) {
      const errMsg = this.add.text(this.scale.width / 2, this.scale.height - 196, '잔액 확인 중... 잠시 후 다시 시도하세요', {
        fontSize: '13px', color: '#ffaa44',
        stroke: '#000000', strokeThickness: 3,
        backgroundColor: '#00000099',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => { if (errMsg.active) errMsg.destroy(); });
      return;
    }
    if (this.skorBalance < cost) {
      this.showSkorToast(Math.floor(this.skorBalance), cost);
      return;
    }

    this.clearUI();

    const count = type === 'multi' ? 10 : 1;

    try {
      // ① 영상(6초) + API 호출 병렬 실행 — 영상 보는 동안 응답 대기
      // API가 먼저 완료되면 videoSkipResolver가 있을 경우 영상을 즉시 스킵
      this.videoSkipResolver = null;
      this.skipToSummary = false;
      const apiPromise = gachaPull(type).then(r => {
        // 영상이 아직 재생 중이면 스킵 버튼 표시
        if (this.videoSkipResolver) {
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

      if (!this.scene.isActive()) return;

      this.pullResults = result.characters;
      this.wpResults = result.wallpapers ?? [];
      this.remainingSkor = result.remainingSkor;
      // 슬롯 순서 보존: 캐릭터 → 배경 순 통합 큐
      this.revealItems = [
        ...result.characters.map(c => ({ kind: 'character' as const, data: c })),
        ...(result.wallpapers ?? []).map(w => ({ kind: 'wallpaper' as const, data: w })),
      ];
      this.revealItemIndex = 0;

      // ① 결과의 신규 캐릭터 즉시 저장 (sync 실패 대비 fallback)
      result.characters.filter(c => c.isNew).forEach(c => addOwnedCharacter(c.id));
      // ① 중복 캐릭터 각성 카운트 업데이트 — 올리기 전후 각성 단계를 비교해 '각성 달성' 을 적어 둔다
      this.pullMeta = result.characters.map(c => {
        if (c.isNew) return { awakenUp: false, level: 0 };
        const before = getDuplicateCount(c.id);
        setDuplicateCount(c.id, before + 1);
        const lv0 = getAwakeningLevel(c.grade, before), lv1 = getAwakeningLevel(c.grade, before + 1);
        return { awakenUp: lv1 > lv0, level: lv1 };
      });
      this.skorBalance = result.remainingSkor;
      cacheSkorBalance(result.remainingSkor);
      // ① 신규 배경화면 즉시 저장 (sync 실패 대비 fallback)
      this.wpResults.filter(w => w.isNew).forEach(w => addOwnedWallpaper(w.id));
      // ② 서버 DB 전체 동기화 (비동기, 에러 로그만)
      syncOwnedCharacters().catch(e => console.error('[GachaScene] syncOwnedCharacters 실패:', e));
      syncOwnedWallpapers().catch(e => console.error('[GachaScene] syncOwnedWallpapers 실패:', e));

      // ② 영상 스킵 시 결과 화면으로 직행
      if (this.skipToSummary) {
        this.skipToSummary = false;
        await Promise.all([this.loadWallpaperBgs(this.wpResults.map(w => w.id)), this.loadResultThumbs()]);
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
      this.skipTerminal = false;

      // ③ 캐릭터별 개인 영상 + 배경화면 이미지 동적 로드 → 리빌
      await Promise.all([
        this.loadCharVideos(result.characters.map(c => c.id)),
        this.loadWallpaperBgs(this.wpResults.map(w => w.id)),
        this.loadResultThumbs(),
      ]);

      this.showNextReveal();
    } catch {
      if (!this.scene.isActive()) return;
      await this.typeLines([
        '> CONNECTION ERROR',
        '> Retrying in 3s...',
      ], 30);
      this.time.delayedCall(3000, () => this.buildLobby());
    }
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
   * 확대되며 나타나고, UR 은 화면이 짧게 흔들린다
   */
  private drawBigCard(pulled: PulledCharacter, def: CharacterDef, meta: PullMeta, cx: number, cy: number, k: number) {
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

  /** 아래 줄 — SKOR 알약 + 1회 더 · 10회 더 · 닫기. 폭이 모자라면 두 뽑기 버튼만 줄인다 */
  private resultButtons(y: number) {
    const W = this.scale.width, cx = W / 2;
    const gap = 8, closeW = 56, h = 56;
    const fit = Math.min(1, (W - 24 - 2 * gap - closeW) / (150 + 170));
    const w1 = Math.floor(150 * fit), w10 = Math.floor(170 * fit);
    const x0 = cx - (w1 + w10 + closeW + 2 * gap) / 2;

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
    make(x0 + w1 / 2, w1, 'gold', '1회 더', '100 SKOR', () => this.startPull('single'));
    make(x0 + w1 + gap + w10 / 2, w10, 'purple', '10회 더', '900 SKOR', () => this.startPull('multi'));
    make(x0 + w1 + w10 + 2 * gap + closeW / 2, closeW, 'white', '닫기', null, () => this.buildLobby());
  }

  /** 슬롯 하나의 리빌 (10회 · 배경화면 섞인 뽑기) — 큰 카드 + 탭 안내. 1회 뽑기는 곧장 결과(showSummary)로 */
  private showRevealCard(pulled: PulledCharacter, def: CharacterDef) {
    this.clearUI();
    const { width: W, height: H } = this.cameras.main;
    const cx = W / 2;
    this.resultBackdrop(def.grade === 'UR' ? 0.68 : 0.58);

    const meta = this.pullMeta[this.pullResults.indexOf(pulled)] ?? { awakenUp: false, level: 0 };
    const k = Math.min(1, (H - 260) / 306);
    this.drawBigCard(pulled, def, meta, cx, 48 + 306 * k / 2 + (H - 600) / 4, k);

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
      this.drawBigCard(pulled, def, this.pullMeta[0] ?? { awakenUp: false, level: 0 }, cx, blockTop + 306 * k / 2, k);
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
    const order = this.pullResults.map((p, i) => ({ p, meta: this.pullMeta[i] ?? { awakenUp: false, level: 0 } }))
      .sort((a, b) => (RANK[a.p.grade] ?? 3) - (RANK[b.p.grade] ?? 3));
    const gx = 6, gy = 34;
    const kw = Math.min(84, Math.floor((W - 24 - 4 * gx) / 5));
    const kh = Math.round(kw * 112 / 84);
    const top = 92;
    order.forEach(({ p, meta }, i) => {
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
    this.slideshowActive = false;
    this.slideshowBgA = null;
    this.slideshowBgB = null;
    this.slideshowGradeImg = null;
    this.slideshowNameText = null;
    this.slideshowRateText = null;
    this.slideshowNewBadge = null;
    this.slideTimer = null;
    this.railChips = [];
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.input.off('pointerdown');
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
