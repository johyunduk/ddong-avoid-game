import Phaser from 'phaser';
import { Difficulty, GameMode, DIFFICULTIES, type DifficultyConfig } from '../types/GameMode';
import { isChristmasSeason } from '../utils/seasonChecker';
import { getSafeSelectedWallpaper, getWallpaperDef } from '../utils/wallpaper';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { getHighScore } from '../utils/localStorage';
import { bakeButton, gradientText, wireButton, type ButtonSkin } from '../utils/buttonSkin';
import { DIFFICULTY_TIER, type Tier } from '../utils/difficultyTheme';

/** 카드 한 장 (C안 — 위 반은 그 난이도의 게임 맵, 아래는 똥 개수 · 속도 · 이번 달 최고) */
interface CardSpec {
  /** 텍스처 키·점수 키로 쓰는 난이도 (PHYSICAL 포함) */
  id: Difficulty;
  name: string;
  description: string;
  poopCount: number;
  baseSpeed: number;
  /** 맵 썸네일로 쓸 게임 배경 키 */
  bgKey: string;
  tier: Tier;
  /** 오른쪽 위 뱃지 똥 — 없으면 '능력 OFF' 표시 (PHYSICAL) */
  badge?: string;
  onClick: () => void;
}

// GameScene 의 난이도별 배경과 같다 (getBackgroundKey)
const MAP_BG: Record<string, string> = {
  [Difficulty.NORMAL]: 'background3',
  [Difficulty.HARD]: 'background',
  [Difficulty.EXTREME]: 'background2',
  [Difficulty.PHYSICAL]: 'background2',
};
const BADGE: Record<string, string> = {
  [Difficulty.NORMAL]: 'poop',
  [Difficulty.HARD]: 'poop_glasses',
  [Difficulty.EXTREME]: 'poop_sunglass',
};
/** 똥 줄 칸 수 — 가장 많은 난이도(EXTREME 8개) 기준 */
const POOP_SLOTS = 8;
/** 썸네일이 카드 높이에서 차지하는 비율 */
const THUMB_RATIO = 0.52;

export default class DifficultySelectScene extends BaseScene {
  private gameMode: GameMode = GameMode.CLASSIC;

  constructor() {
    super('DifficultySelectScene');
  }

  init(data: { gameMode?: GameMode }) {
    if (data.gameMode) {
      this.gameMode = data.gameMode;
    }
  }

  preload() {
    // 선택된 배경화면 미리 로딩 (GameScene 진입 전 캐싱)
    const wpId = getSafeSelectedWallpaper();
    const wpDef = wpId ? getWallpaperDef(wpId) : null;
    if (wpDef && !this.textures.exists(wpDef.bgKey)) {
      this.load.image(wpDef.bgKey, wpDef.bgPath);
    }

    // 난이도 선택 화면 배경
    if (!this.textures.exists('background')) {
      this.load.image('background', 'assets/backgrounds/background.webp');
    }

    // 카드 썸네일 = 난이도별 게임 배경 (NORMAL=background3 · HARD=background · EXTREME/PHYSICAL=background2)
    // 게임에서 어차피 쓰는 그림이라 여기서 미리 받아 둔다
    if (!this.textures.exists('background2')) this.load.image('background2', 'assets/backgrounds/background2.webp');
    if (!this.textures.exists('background3')) this.load.image('background3', 'assets/backgrounds/background3.webp');
    // 카드 똥 줄·뱃지
    if (!this.textures.exists('poop')) this.load.image('poop', 'assets/poops/poop.webp');
    if (!this.textures.exists('poop_glasses')) this.load.image('poop_glasses', 'assets/poops/poop_glasses.webp');
    if (!this.textures.exists('poop_sunglass')) this.load.image('poop_sunglass', 'assets/poops/poop_sunglass.webp');

    // ── 게임 에셋 미리 로딩 (캐시된 항목은 건너뜀) ──
    if (this.gameMode === GameMode.CLASSIC) {
      if (isChristmasSeason() && !this.textures.exists('xmas_background')) {
        this.load.image('xmas_background', 'assets/backgrounds/xmas_background.webp');
      }

      // 플레이어
      if (!this.textures.exists('front')) this.load.image('front', 'assets/players/chibi_front.webp');
      if (!this.textures.exists('left')) this.load.image('left', 'assets/players/chibi_left.webp');
      if (!this.textures.exists('right')) this.load.image('right', 'assets/players/chibi_right.webp');

      // 똥 이미지
      if (!this.textures.exists('poop_sunglass2')) this.load.image('poop_sunglass2', 'assets/poops/poop_sunglass2.webp');
      if (!this.textures.exists('poop_smile')) this.load.image('poop_smile', 'assets/poops/poop_smile.webp');
      if (!this.textures.exists('gold_poop')) this.load.image('gold_poop', 'assets/poops/gold_poop.webp');
      if (!this.textures.exists('diamond_poop')) this.load.image('diamond_poop', 'assets/poops/diamond_poop.webp');
      if (!this.textures.exists('topaz_poop')) this.load.image('topaz_poop', 'assets/poops/topaz.webp');

      // 크리스마스 시즌 똥
      if (isChristmasSeason()) {
        if (!this.textures.exists('xmas_poop_ribbon')) this.load.image('xmas_poop_ribbon', 'assets/poops/xmas_present_poop.webp');
        if (!this.textures.exists('xmas_poop_nose')) this.load.image('xmas_poop_nose', 'assets/poops/xmas_nose_poop.webp');
        if (!this.textures.exists('xmas_poop_santa')) this.load.image('xmas_poop_santa', 'assets/poops/xmas_santa_poop.webp');
        if (!this.textures.exists('xmas_poop_rudolf')) this.load.image('xmas_poop_rudolf', 'assets/poops/xmas_rudolf_poop.webp');
        if (!this.textures.exists('xmas_poop_beard')) this.load.image('xmas_poop_beard', 'assets/poops/xmas_beard_poop.webp');
      }

      // BGM
      if (!this.cache.audio.exists('bgMusic')) this.load.audio('bgMusic', 'assets/bgms/poop.mp3');
      if (isChristmasSeason() && !this.cache.audio.exists('xmasBgMusic')) this.load.audio('xmasBgMusic', 'assets/bgms/xmas_poop.mp3');

    }
  }

  create() {
    super.create();

    const { W, H, cx, yOff } = this.getScaleInfo();

    addBackground(this, 'background', W, H);
    this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.35);

    // 뒤로 — 왼쪽 위 둥근 버튼
    this.createBackButton(32, 32);

    // 제목 — 메뉴 타이틀과 같은 결의 나무 판 + 금빛 글자
    const tw = Math.min(300, W - 120);
    const plaque = this.add.container(cx, 32 + yOff);
    const { originY } = bakeButton(this, `diff_title_${tw}`, {
      w: tw, h: 60, radius: 16, top: '#c98a4a', bottom: '#8a5226', border: '#3a1f0a', borderW: 3,
      lip: '#5b3416', lipH: 5, gloss: 0,
    });
    plaque.add(this.add.image(0, 0, `diff_title_${tw}`).setOrigin(0.5, originY));
    const title = this.add.text(0, 0, '난이도 선택', {
      fontSize: '28px', fontStyle: 'bold', stroke: '#3a1f0a', strokeThickness: 8,
    }).setOrigin(0.5);
    gradientText(title, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    plaque.add(title);

    // 2x2 카드 — NORMAL · HARD / EXTREME · PHYSICAL
    const SIDE = 16, GAP_X = 14, GAP_Y = 20;
    const cw = Math.floor((W - SIDE * 2 - GAP_X) / 2);
    const ch = 226;
    const top = 98 + yOff;
    const specs: CardSpec[] = [
      ...DIFFICULTIES.map((d: DifficultyConfig): CardSpec => ({
        id: d.difficulty, name: d.name, description: d.description, poopCount: d.poopCount, baseSpeed: d.baseSpeed,
        bgKey: MAP_BG[d.difficulty], tier: DIFFICULTY_TIER[d.difficulty], badge: BADGE[d.difficulty],
        onClick: () => this.startGame(d.difficulty),
      })),
      this.physicalSpec(),
    ];
    specs.forEach((spec, i) => {
      const x = SIDE + cw / 2 + (i % 2) * (cw + GAP_X);
      const y = top + ch / 2 + Math.floor(i / 2) * (ch + GAP_Y);
      this.createCard(spec, x, y, cw, ch);
    });
  }

  /** PHYSICAL — EXTREME 규칙 그대로, 캐릭터 능력만 끈다. 점수는 PHYSICAL 키로 따로 쌓인다 */
  private physicalSpec(): CardSpec {
    const ext = DIFFICULTIES.find(d => d.difficulty === Difficulty.EXTREME) ?? DIFFICULTIES[DIFFICULTIES.length - 1];
    return {
      id: Difficulty.PHYSICAL, name: 'PHYSICAL', description: '능력 없음 · 순수 실력',
      poopCount: ext.poopCount, baseSpeed: ext.baseSpeed,
      bgKey: MAP_BG[Difficulty.PHYSICAL], tier: DIFFICULTY_TIER[Difficulty.PHYSICAL],
      onClick: () => {
        this.sound.stopAll();
        this.scene.start('GameScene', { gameMode: this.gameMode, difficulty: Difficulty.EXTREME, purePhysical: true });
      },
    };
  }

  private createCard(spec: CardSpec, x: number, y: number, w: number, h: number) {
    const [top, mid, ink] = spec.tier;
    const box = this.add.container(x, y);

    // 판 — EXTREME 만 붉게 빛난다
    const skin: ButtonSkin = {
      w, h, radius: 18, top, bottom: mid, border: mid, borderW: 4, lip: ink, lipH: 6, gloss: 0,
      glow: spec.id === Difficulty.EXTREME ? 'rgba(255,80,40,0.85)' : undefined,
    };
    const cardKey = `diff_card_${spec.id}_${w}x${h}`;
    const { originY } = bakeButton(this, cardKey, skin);
    box.add(this.add.image(0, 0, cardKey).setOrigin(0.5, originY));

    // 면 — 위는 맵 썸네일, 아래는 크림색 (한 장으로 굽는다)
    const fw = w - 8, fh = h - 8;
    const faceKey = this.bakeCardFace(`diff_face_${spec.id}_${fw}x${fh}`, spec.bgKey, fw, fh, spec.id === Difficulty.PHYSICAL);
    box.add(this.add.image(0, 0, faceKey).setDisplaySize(fw, fh));

    // 오른쪽 위 — 뱃지 똥 / 왼쪽 위 — 능력 OFF (PHYSICAL)
    if (spec.badge) {
      if (this.textures.exists(spec.badge)) box.add(this.add.image(w / 2 - 30, -h / 2 + 34, spec.badge).setDisplaySize(40, 40));
    } else {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 0.92).fillRoundedRect(-w / 2 + 10, -h / 2 + 12, 72, 22, 11);
      g.lineStyle(1.5, 0x2a3340).strokeRoundedRect(-w / 2 + 10, -h / 2 + 12, 72, 22, 11);
      box.add(g);
      box.add(this.add.text(-w / 2 + 46, -h / 2 + 23, '능력 OFF', {
        fontSize: '11px', color: '#2a3340', fontStyle: 'bold',
      }).setOrigin(0.5));
    }

    // 이름 띠 — 맵과 판 사이에 걸친다
    const ty = -h / 2 + h * THUMB_RATIO;
    const rw = w - 30;
    const rib = bakeButton(this, `diff_rib_${spec.id}_${rw}`, {
      w: rw, h: 34, radius: 12, top, bottom: mid, border: ink, borderW: 3, lip: ink, lipH: 4, gloss: 0,
    });
    box.add(this.add.image(0, ty, rib.key).setOrigin(0.5, rib.originY));
    box.add(this.add.text(0, ty - 1, spec.name, {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold', stroke: ink, strokeThickness: 6,
    }).setOrigin(0.5));

    // 아래 — 설명 · 똥 줄 · 속도 · 이번 달 최고
    const label = { fontSize: '11px', color: '#4a3a2a', fontStyle: 'bold' };
    box.add(this.add.text(0, ty + 30, spec.description, label).setOrigin(0.5));

    const lx = -w / 2 + 16;
    box.add(this.add.text(lx, ty + 54, '똥', label).setOrigin(0, 0.5));
    if (this.textures.exists('poop')) {
      // 카드가 좁은 화면에서는 아이콘을 줄인다
      const px = Math.min(14, Math.floor((w - 32 - 18 - (POOP_SLOTS - 1)) / POOP_SLOTS));
      for (let i = 0; i < POOP_SLOTS; i++) {
        box.add(this.add.image(lx + 18 + px / 2 + i * (px + 1), ty + 54, 'poop')
          .setDisplaySize(px, px).setAlpha(i < spec.poopCount ? 1 : 0.22));
      }
    }

    box.add(this.add.text(lx, ty + 77, '속도', label).setOrigin(0, 0.5));
    box.add(this.speedGauge(lx + 32, ty + 77, this.getSpeedLevel(spec.baseSpeed), mid));

    const best = getHighScore(spec.id);
    box.add(this.add.text(w / 2 - 14, ty + 77, `최고 ${best > 0 ? best.toLocaleString() : '—'}`, label).setOrigin(1, 0.5));

    wireButton(this, box, w, h, spec.onClick);
  }

  /**
   * 카드 면을 캔버스 텍스처로 한 번 굽는다 — 위 THUMB_RATIO 는 게임 배경을 스카이라인 쪽으로 잘라 넣고,
   * 아래는 크림색. 둥근 모서리는 캔버스에서 자르니 마스크가 없다. 2배로 굽고 절반 크기로 띄운다
   */
  private bakeCardFace(key: string, srcKey: string, w: number, h: number, gray: boolean): string {
    if (this.textures.exists(key)) return key;
    const R = 2;
    const tex = this.textures.createCanvas(key, w * R, h * R);
    if (!tex) return key;
    const ctx = tex.getContext();
    ctx.scale(R, R);

    // 둥근 모서리 — ctx.roundRect 는 오래된 웹뷰에 없다
    const r = 14;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.clip();

    const th = Math.round(h * THUMB_RATIO);
    if (this.textures.exists(srcKey)) {
      const src = this.textures.get(srcKey).getSourceImage() as HTMLImageElement;
      // 덮어 채우기 — 세로는 스카이라인(아래 70% 지점)에 맞춘다
      const sc = Math.max(w / src.width, th / src.height);
      const sw = w / sc, sh = th / sc;
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) * 0.7, sw, sh, 0, 0, w, th);
      if (gray) {
        const img = ctx.getImageData(0, 0, w * R, th * R);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(img, 0, 0);
      }
    }
    const g = ctx.createLinearGradient(0, th, 0, h);
    g.addColorStop(0, '#fffaf0');
    g.addColorStop(1, '#f2e6d0');
    ctx.fillStyle = g;
    ctx.fillRect(0, th, w, h - th);
    tex.refresh();
    return key;
  }

  /** 속도 = 4칸 막대, 오를수록 높아진다. (x, y) = 왼쪽 · 세로 가운데 */
  private speedGauge(x: number, y: number, level: number, color: string): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const bw = 11, bh = 12, gap = 3;
    const fill = Phaser.Display.Color.HexStringToColor(color).color;
    for (let i = 0; i < 4; i++) {
      const hh = bh * (0.45 + 0.55 * (i + 1) / 4);
      const bx = x + i * (bw + gap), by = y + bh / 2 - hh;
      g.fillStyle(i < level ? fill : 0x000000, i < level ? 1 : 0.12).fillRoundedRect(bx, by, bw, hh, 2);
      g.lineStyle(1, 0x000000, 0.6).strokeRoundedRect(bx, by, bw, hh, 2);
    }
    return g;
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

  /** baseSpeed → 속도 막대 칸 수 (1~4) */
  private getSpeedLevel(baseSpeed: number): number {
    if (baseSpeed <= 125) return 1;
    if (baseSpeed <= 150) return 2;
    if (baseSpeed <= 200) return 3;
    return 4;
  }

  private startGame(difficulty: Difficulty) {
    this.sound.stopAll();
    this.scene.start('GameScene', {
      gameMode: this.gameMode,
      difficulty: difficulty
    });
  }
}
