import Phaser from 'phaser';
import {
  gachaPull, syncOwnedCharacters, syncOwnedWallpapers, gachaPool, gachaRates, formatRate, GACHA_WP_DROP_CHANCE,
  type PulledCharacter, type PulledWallpaper,
} from '../utils/gacha';
import { CHARACTERS, getCharacterDef, addOwnedCharacter, getDuplicateCount, setDuplicateCount, getGradeImgKey, getGradeColorInt, type CharacterDef } from '../utils/character';
import { WALLPAPERS, getWallpaperDef, addOwnedWallpaper, WP_ACCENT_INT, WP_ACCENT_HEX, type BackgroundDef } from '../utils/wallpaper';
import { getSkorBalance, getCachedSkorBalance, cacheSkorBalance } from '../utils/skor';
import { destroyVideo } from '../utils/video';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { bakeButton, bakeRoundedImage, gradientText, wireButton } from '../utils/buttonSkin';

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
    this.revealItems = [];
    this.revealItemIndex = 0;
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
      const errMsg = this.add.text(this.scale.width / 2, this.scale.height - 196, `SKOR 부족  (보유 ${Math.floor(this.skorBalance)} / 필요 ${cost})`, {
        fontSize: '13px', color: '#ff5555',
        stroke: '#000000', strokeThickness: 3,
        backgroundColor: '#00000099',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5);
      this.time.delayedCall(2200, () => { if (errMsg.active) errMsg.destroy(); });
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
      // ① 중복 캐릭터 각성 카운트 업데이트
      result.characters.filter(c => !c.isNew).forEach(c => {
        setDuplicateCount(c.id, getDuplicateCount(c.id) + 1);
      });
      // ① 신규 배경화면 즉시 저장 (sync 실패 대비 fallback)
      this.wpResults.filter(w => w.isNew).forEach(w => addOwnedWallpaper(w.id));
      // ② 서버 DB 전체 동기화 (비동기, 에러 로그만)
      syncOwnedCharacters().catch(e => console.error('[GachaScene] syncOwnedCharacters 실패:', e));
      syncOwnedWallpapers().catch(e => console.error('[GachaScene] syncOwnedWallpapers 실패:', e));

      // ② 영상 스킵 시 결과 화면으로 직행
      if (this.skipToSummary) {
        this.skipToSummary = false;
        await this.loadWallpaperBgs(this.wpResults.map(w => w.id));
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
        if (def) this.load.image(def.bgKey, def.bgPath);
      });
      this.load.once(Phaser.Loader.Events.COMPLETE, resolve);
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, resolve);
      this.load.start();
    });
  }

  private showWallpaperRevealCard(wp: PulledWallpaper, def: BackgroundDef | undefined) {
    this.clearUI();

    const wpName = def?.name ?? wp.id;

    const { width: _W, height: _H } = this.cameras.main;
    const _cx = _W / 2;
    const _yOff = (_H - 600) / 2;

    // ── 배경: 실제 배경화면 이미지 (있으면) 또는 단색 ──
    if (def && this.textures.exists(def.bgKey)) {
      addBackground(this, def.bgKey, _W, _H);
    } else {
      this.add.rectangle(_cx, _H / 2, _W, _H, 0x050515);
    }
    // 어두운 오버레이
    this.add.rectangle(_cx, _H / 2, _W, _H, 0x000000, 0.5);

    // 보라 헤이즈
    this.add.circle(_cx, 260 + _yOff, 220, WP_ACCENT_INT, 0.10);
    this.add.circle(_cx, 260 + _yOff, 120, WP_ACCENT_INT, 0.07);

    // ── 상단 타이틀 ──
    const title = this.add.text(_cx, 60 + _yOff, '배경화면 획득!', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, duration: 300, delay: 100 });

    // ── WALLPAPER 배지 ──
    const badge = this.add.text(_cx, 100 + _yOff, 'WALLPAPER', {
      fontSize: '13px', color: WP_ACCENT_HEX, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
      fontFamily: 'monospace', letterSpacing: 4,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: badge, alpha: 1, duration: 300, delay: 250 });

    // ── 배경화면 이름 ──
    const nameText = this.add.text(_cx, 500 + _yOff, wpName, {
      fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: nameText, alpha: 1, y: { from: 520 + _yOff, to: 500 + _yOff },
      duration: 400, ease: 'Back.easeOut', delay: 400,
    });

    // ── 설명 ──
    if (def?.description) {
      const desc = this.add.text(_cx, 544 + _yOff, def.description, {
        fontSize: '13px', color: '#cccccc',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: desc, alpha: 1, duration: 300, delay: 550 });
    }

    // ── NEW! 배지 ──
    if (wp.isNew) {
      const newBadge = this.add.text(_W - 75, 145 + _yOff, ' NEW! ', {
        fontSize: '15px', color: '#ffff00', fontStyle: 'bold',
        backgroundColor: '#cc0000', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setAlpha(0).setScale(0);
      this.tweens.add({
        targets: newBadge, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 300, ease: 'Back.easeOut', delay: 650,
      });
    }

    // ── 탭 안내 ──
    const isLast = this.revealItemIndex >= this.revealItems.length - 1;
    const hint = isLast ? 'TAP → RESULTS' : `TAP → NEXT  (${this.revealItemIndex + 1}/${this.revealItems.length})`;
    const tapHint = this.add.text(_cx, 576 + _yOff, hint, {
      fontSize: '13px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: tapHint, alpha: { from: 0.3, to: 1 }, duration: 600, yoyo: true, repeat: -1,
    });

    // 10연차: 결과 화면으로 바로 건너뛰기
    if (this.revealItems.length > 1) {
      this.addSkipButton(() => {
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.input.off('pointerdown');
        this.showSummary();
      });
    }

    // 700ms 후 탭 진행
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

      // 10뽑기는 3.5초 자동 진행
      if (this.revealItems.length > 1) {
        this.time.delayedCall(3500, () => {
          if (this.scene.isActive()) advance();
        });
      }
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
        this.showRevealCard(pulled, def);
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
          this.showRevealCard(pulled, def);
        }
      });
      vid.on('complete', proceed);
      this.time.delayedCall(10000, proceed); // failsafe
      this.input.once('pointerdown', proceed); // 탭으로 스킵
    } else {
      this.showRevealCard(pulled, def);
    }
  }

  private showRevealCard(pulled: PulledCharacter, def: CharacterDef) {
    // 영상 페이즈의 스킵 버튼 등 잔여 오브젝트 제거
    this.clearUI();

    const gColor = getGradeColorInt(def);

    const { width: W, height: H } = this.cameras.main;
    const cx = W / 2;
    const yOff = (H - 600) / 2;

    // ── 배경: 사이버 우주 이미지 + 등급 컬러 헤이즈 ──
    if (this.textures.exists('gacha_background')) {
      addBackground(this, 'gacha_background', W, H);
    } else {
      this.add.rectangle(cx, H / 2, W, H, 0x050510);
    }
    // 어두운 오버레이 (가독성 확보)
    this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.5);
    // 등급 컬러 헤이즈 (중앙 중심 방사)
    this.add.circle(cx, 260 + yOff, 200, gColor, 0.08);
    this.add.circle(cx, 260 + yOff, 120, gColor, 0.06);

    // 배경 글로우 (캐릭터 뒤 빛)
    const glow = this.add.circle(cx, 255 + yOff, 150, gColor, 0.0).setAlpha(0);
    this.tweens.add({
      targets: glow, alpha: 1,
      scaleX: { from: 0.3, to: 1.3 }, scaleY: { from: 0.3, to: 1.3 },
      duration: 600, ease: 'Back.easeOut',
    });

    // 캐릭터 이미지
    const img = this.add.image(cx, 240 + yOff, def.imageKey).setAlpha(0);
    img.setDisplaySize(130, 205);
    this.tweens.add({
      targets: img, alpha: 1, y: { from: 268 + yOff, to: 240 + yOff },
      duration: 500, ease: 'Back.easeOut', delay: 150,
    });

    // 등급 라벨
    const revealGradeKey = getGradeImgKey(pulled.grade);
    if (revealGradeKey) {
      const gradeImg = this.add.image(cx, 388 + yOff, revealGradeKey).setDisplaySize(52, 52).setOrigin(0.5).setAlpha(0);
      this.tweens.add({ targets: gradeImg, alpha: 1, duration: 300, delay: 400 });
    }

    // 캐릭터 이름
    const nameText = this.add.text(cx, 424 + yOff, def.name, {
      fontSize: '34px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: nameText, alpha: 1, y: { from: 442 + yOff, to: 424 + yOff },
      duration: 400, ease: 'Back.easeOut', delay: 500,
    });

    // NEW! 배지
    if (pulled.isNew) {
      const badge = this.add.text(W - 75, 145 + yOff, ' NEW! ', {
        fontSize: '15px', color: '#ffff00', fontStyle: 'bold',
        backgroundColor: '#cc0000', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setAlpha(0).setScale(0);
      this.tweens.add({
        targets: badge, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 300, ease: 'Back.easeOut', delay: 650,
      });
    }

    // 탭 안내
    const isLast = this.revealItemIndex >= this.revealItems.length - 1;
    const hint = isLast
      ? 'TAP → RESULTS'
      : `TAP → NEXT  (${this.revealItemIndex + 1}/${this.revealItems.length})`;
    const tapHint = this.add.text(cx, 562 + yOff, hint, {
      fontSize: '13px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: tapHint, alpha: { from: 0.3, to: 1 }, duration: 600, yoyo: true, repeat: -1,
    });

    // 10연차: 결과 화면으로 바로 건너뛰기 (영상 유무와 무관하게 항상 표시)
    if (this.revealItems.length > 1) {
      this.addSkipButton(() => {
        this.tweens.killAll();
        this.time.removeAllEvents();
        this.input.off('pointerdown');
        this.showSummary();
      });
    }

    // 탭 진행 (700ms 디바운스)
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

      // 10뽑기는 3.5초 자동 진행
      if (this.revealItems.length > 1) {
        this.time.delayedCall(3500, () => {
          if (this.scene.isActive()) advance();
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════

  private showSummary() {
    this.clearUI();
    const { width: _W, height: _H } = this.cameras.main;
    const _cx = _W / 2;
    const _yOff = (_H - 600) / 2;
    if (this.textures.exists('gacha_background')) {
      addBackground(this, 'gacha_background', _W, _H);
    } else {
      this.add.rectangle(_cx, _H / 2, _W, _H, 0x060612);
    }
    this.add.rectangle(_cx, _H / 2, _W, _H, 0x000000, 0.55);

    this.add.text(_cx, 38 + _yOff, '[ EXTRACTION COMPLETE ]', {
      fontSize: '17px', color: '#00ff41', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // ── 캐릭터 + 배경화면 통합 그리드 ───────────────────────────────
    const charCount = this.pullResults.length;
    const wpCount = this.wpResults.length;
    const total = charCount + wpCount;
    const cols = Math.min(total, 5);
    const cardW = 64, cardH = 84, gapX = 8, gapY = 12;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (_W - totalW) / 2 + cardW / 2;
    const startY = (total > 5 ? 130 : 175) + _yOff;

    // 캐릭터 카드
    this.pullResults.forEach((pulled, i) => {
      const def = getCharacterDef(pulled.id);
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const gColorInt = parseInt(def.gradeColor.replace('#', ''), 16);

      const bg  = this.add.rectangle(x, y, cardW, cardH, 0x111122).setStrokeStyle(1, gColorInt).setAlpha(0);
      const img = this.add.image(x, y - 8, def.imageKey).setDisplaySize(cardW - 19, cardH - 22).setAlpha(0);
      const nm  = this.add.text(x, y + cardH / 2 - 10, def.name, { fontSize: '9px', color: '#cccccc' }).setOrigin(0.5).setAlpha(0);

      const charTargets: Phaser.GameObjects.GameObject[] = [bg, img, nm];
      if (pulled.isNew) {
        const newBadge = this.add.text(x + cardW / 2, y - cardH / 2 + 2, 'NEW', {
          fontSize: '8px', color: '#ffff00', backgroundColor: '#aa0000', padding: { x: 2, y: 1 },
        }).setOrigin(1, 0).setAlpha(0);
        charTargets.push(newBadge);
      }

      this.tweens.add({ targets: charTargets, alpha: 1, duration: 200, delay: i * 60 });
    });

    // 배경화면 카드 (캐릭터 뒤에 이어서 배치)
    this.wpResults.forEach((wp, i) => {
      const globalIndex = charCount + i;
      const col = globalIndex % 5;
      const row = Math.floor(globalIndex / 5);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const wpDef = getWallpaperDef(wp.id);

      const bg = this.add.rectangle(x, y, cardW, cardH, 0x0d0d1a)
        .setStrokeStyle(1.5, WP_ACCENT_INT).setAlpha(0);

      // 썸네일 (bgKey로 미리 로드된 이미지 사용)
      if (wpDef && this.textures.exists(wpDef.bgKey)) {
        const thumb = this.add.image(x, y - 8, wpDef.bgKey)
          .setDisplaySize(cardW - 4, cardH - 22).setAlpha(0);
        this.tweens.add({ targets: thumb, alpha: 1, duration: 200, delay: globalIndex * 60 });
      }

      // WP 배지 (우상단)
      const wpBadge = this.add.text(x + cardW / 2, y - cardH / 2 + 2, 'WP', {
        fontSize: '8px', color: WP_ACCENT_HEX, backgroundColor: '#000000cc',
        padding: { x: 2, y: 1 },
      }).setOrigin(1, 0).setAlpha(0);

      const nm = this.add.text(x, y + cardH / 2 - 10, wpDef?.name ?? wp.id, {
        fontSize: '9px', color: WP_ACCENT_HEX,
      }).setOrigin(0.5).setAlpha(0);

      const wpTargets: Phaser.GameObjects.GameObject[] = [bg, nm, wpBadge];
      if (wp.isNew) {
        const newBadge = this.add.text(x - cardW / 2, y - cardH / 2 + 2, 'NEW', {
          fontSize: '8px', color: '#ffff00', backgroundColor: '#aa0000', padding: { x: 2, y: 1 },
        }).setOrigin(0, 0).setAlpha(0);
        wpTargets.push(newBadge);
      }

      this.tweens.add({ targets: wpTargets, alpha: 1, duration: 200, delay: globalIndex * 60 });
    });

    // 그리드 하단 계산
    const totalRows = Math.ceil(total / 5);
    const gridBottom = startY + (totalRows - 1) * (cardH + gapY) + cardH / 2;

    // 잔여 SKOR
    const skorY = gridBottom + 20;
    this.add.text(_cx, skorY, `잔여 SKOR: ${Math.floor(this.remainingSkor)}`, {
      fontSize: '14px', color: '#00ff41', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 1회 / 10회 다시뽑기 (한 줄) + 메인으로 버튼
    const pullRowY = Math.min(skorY + 42, 458 + _yOff);
    const mainBtnY = Math.min(pullRowY + 54, 520 + _yOff);
    const btnW = 122;
    const gap = 8;
    const singleX = _cx - btnW / 2 - gap / 2;
    const multiX  = _cx + btnW / 2 + gap / 2;

    const single = this.add.rectangle(singleX, pullRowY, btnW, 44, 0x000000, 0.72)
      .setStrokeStyle(1.5, 0xddaa00).setInteractive({ useHandCursor: true });
    this.add.text(singleX, pullRowY - 7, '1회 뽑기', {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(singleX, pullRowY + 9, '100 SKOR', {
      fontSize: '10px', color: '#ddaa00',
    }).setOrigin(0.5);
    single.on('pointerover', () => single.setStrokeStyle(2.5, 0xddaa00));
    single.on('pointerout',  () => single.setStrokeStyle(1.5, 0xddaa00));
    single.on('pointerdown', () => this.startPull('single'));

    const multi = this.add.rectangle(multiX, pullRowY, btnW, 44, 0x000000, 0.72)
      .setStrokeStyle(1.5, 0x7b2fff).setInteractive({ useHandCursor: true });
    this.add.text(multiX, pullRowY - 7, '10회 뽑기', {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(multiX, pullRowY + 9, '900 SKOR', {
      fontSize: '10px', color: '#aa88ff',
    }).setOrigin(0.5);
    multi.on('pointerover', () => multi.setStrokeStyle(2.5, 0x7b2fff));
    multi.on('pointerout',  () => multi.setStrokeStyle(1.5, 0x7b2fff));
    multi.on('pointerdown', () => this.startPull('multi'));

    const mainBtn = this.add.rectangle(_cx, mainBtnY, 260, 40, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444).setInteractive({ useHandCursor: true });
    this.add.text(_cx, mainBtnY, '메인으로', {
      fontSize: '16px', color: '#888888', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);
    mainBtn.on('pointerover', () => mainBtn.setFillStyle(0x282828));
    mainBtn.on('pointerout',  () => mainBtn.setFillStyle(0x1a1a1a));
    mainBtn.on('pointerdown', () => this.scene.start('ModeSelectScene'));
  }

  // ═══════════════════════════════════════════════════
  // 터미널 헬퍼
  // ═══════════════════════════════════════════════════

  private addSkipButton(onClick: () => void) {
    const skipX = this.scale.width - 37;
    const skipY = 28 + (this.scale.height - 600) / 2;
    this.add.rectangle(skipX, skipY, 88, 30, 0x000000, 0.6)
      .setInteractive()
      .on('pointerdown', onClick);
    const txt = this.add.text(skipX, skipY, 'SKIP  ▶▶', {
      fontSize: '12px', color: '#777777', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    txt.on('pointerover', () => txt.setColor('#cccccc'));
    txt.on('pointerout',  () => txt.setColor('#777777'));
    txt.on('pointerdown', onClick);
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
