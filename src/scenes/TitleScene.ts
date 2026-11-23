import Phaser from 'phaser';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { RELEASE_NOTES } from '../data/releaseNotes';

/**
 * 타이틀 (홈 전 화면) — 대표 확정 2026-11-22. BootScene → 여기 → ModeSelectScene(홈). 화면 어디를 눌러도 홈으로 간다.
 *
 * 시안: https://claude.ai/artifact/LUYKbjHba43NBy3sVKegbf (작업실 fixes/title-glitch/mockup/index.html — 기본값이 확정 조합)
 *   ① 지금 판 · 흑 + 초록 · 치지직 약하게(0.55) · 횟수 보통 · 데이터 비 켬. 화면 테두리 · 떠다니는 파일 · 두 줄 배치는 끔.
 *   치수 · 확률 · 속도는 시안 코드의 값 그대로다. 로고 쪽 값은 로고 판(1070×628) 좌표라 표시 배율 k 를 곱한다.
 *
 * 화면 (뒤 → 앞): 옥상 배경 → 위아래 엷은 덮개 → 데이터 비(흐린 칸 줄기) → 떨어지는 똥 다섯 → 달리는 치비 →
 *   픽셀 로고(글자 · 「LOST FILES」, 글자 밑에서 조각이 떨어진다) → 「화면을 터치하세요」 띠 → 버전 · ⓒ
 *
 * 치지직: 1.8~3.6초마다 0.24~0.58초. 그동안 45~85ms 마다 새로 뽑는다 — 줄 밀림(가로 띠가 옆으로) ·
 *   파랑/분홍 갈라짐 · 잡음 줄 · 드물게 한순간 꺼짐. 데이터 비와 조각도 같이 흔들린다.
 *   움직임 줄이기를 켠 기기에서는 저절로 깨지지 않는다 (시안과 같다). 터치하면 짧게 깨지며 넘어간다.
 *
 * 렉: 시안은 캔버스 두 장을 매 프레임 다시 그린다. 여기서는 **한 번 굽고 옮기기만** 한다.
 *   - 로고 글자 · 부제 · 똥은 화면 표시 크기로 한 번 굽는다. 줄 밀림은 같은 그림을 가로 띠로 잘라(setCrop) 옆으로 민다
 *   - 데이터 비 줄기는 길이 · 색별 20칸을 한 장에 구워 두고 줄마다 Image 하나를 내린다
 *   - 잡음 줄은 미리 구운 줄 가운데서 고른다
 *   매 프레임 하는 일은 위치 · 투명도 바꾸기뿐이다. Graphics 를 다시 그리거나 캔버스를 새로 굽지 않는다.
 *   오브젝트 상한: 데이터 비 60(480px 폭) · 조각 140 · 로고 띠 36(깨질 때만) · 잡음 8 · 똥 5 · 치비 1 · 글 3 · 띠 판 3
 *
 * 소리: 배경음은 없다 — 홈도 조용하다 (총괄 2026-11-23). 터치 때 짧은 「치지직」만 낸다 (브라우저는 첫 터치 전엔 소리를 못 낸다).
 * 떠날 때: title_* 텍스처 · 치비 애니메이션을 모두 지운다. 타이머 · 트윈은 씬이 끝나며 같이 멈춘다.
 */

/** 로고 배치 — 시안 variants.json 의 v1 (로고 판 1070×628 좌표). 그림은 assets/title/logo_*.webp (시안 v1_letters · v1_sub 그대로) */
const LOGO = {
  W: 1070, H: 628,
  letters: { x: 40, y: 40, w: 990, h: 314 },
  sub: { x: 40, y: 504, w: 399, h: 84 },
  /** 부제 앞 초록 네모 — 부제 그림 안 좌표 */
  square: { x: 4, y: 30, s: 23 },
};
/** 글자 아래 끝 칸 — 조각의 60% 가 여기서 떨어진다 (나머지는 글자 아래 22% 아무 데서나) */
const SPAWNS: [number, number][] = [
  [976, 287], [742, 300], [755, 300], [989, 300], [1002, 300], [92, 313], [105, 313], [144, 313], [157, 313], [170, 313],
  [183, 313], [222, 313], [235, 313], [248, 313], [521, 313], [755, 313], [118, 326], [131, 326], [144, 326], [157, 326],
  [170, 326], [209, 326], [755, 326], [1002, 326],
];

/** 흑 + 초록 */
const INK = 0x11121a, GREEN = 0x00c85c;
const INK_CSS = '#11121A', GREEN_CSS = '#00C85C';
/** 갈라짐 색 — 시안 rgba(.., .9) 를 globalAlpha .85 로 겹친다 */
const MAG = 0xff2ea8, CYAN = 0x00d6ff, SPLIT_ALPHA = 0.9 * 0.85;
/** 치지직 세기 「약하게」 · 횟수 「보통」(초) */
const POWER = 0.55;
const FREQ: [number, number] = [1.8, 3.6];
/** 터치 뒤 홈으로 넘어가기 전 깨지는 시간 */
const TAP_GLITCH_MS = 240;
const PARTS_MAX = 140;
/** 한 판에 띠 · 잡음 줄 수의 상한 — reroll 의 식 그대로 (0.55 면 띠 4 · 줄 2) */
const BANDS_MAX = Math.round(5 * POWER) + 1;
const LINES_MAX = Math.round(4 * POWER);
/** 로고 층 하나가 쓰는 띠 조각 수 — 띠 n 개면 구간은 많아야 2n + 1 */
const SLICES = 2 * BANDS_MAX + 1;
/** 구운 조각 이름 — 매 프레임 문자열을 만들지 않게 미리 */
const NOISE_FRAMES = Array.from({ length: 8 }, (_, i) => `n${i}`);
const BD_FRAMES = Array.from({ length: 6 }, (_, i) => `b${i}`);
const RAIN_FRAMES = [0, 1].map(g => Array.from({ length: 14 }, (_, len) => `${g}_${len}`));
const numAsc = (p: number, q: number) => p - q;

/** 떨어지는 똥 — 시안 .rain (left 는 화면 폭 비율, 크기는 u). 먼 셋은 작고 반투명 */
const RAIN_POOPS = [
  { tex: 'poop', left: 0.12, dur: 6.2, delay: -1, far: true },
  { tex: 'poop_smile', left: 0.63, dur: 6.8, delay: -5, far: true },
  { tex: 'poop', left: 0.86, dur: 5.9, delay: -2.2, far: true },
  { tex: 'gold', left: 0.3, dur: 4.4, delay: -2.8, far: false },
  { tex: 'dia', left: 0.88, dur: 4.7, delay: -0.2, far: false },
] as const;
const SRC: Record<string, string> = {
  bg: 'assets/backgrounds/background2.webp',
  letters: 'assets/title/logo_letters.webp',
  sub: 'assets/title/logo_sub.webp',
  poop: 'assets/poops/poop.webp',
  poop_smile: 'assets/poops/poop_smile.webp',
  gold: 'assets/poops/gold_poop.webp',
  dia: 'assets/poops/diamond_poop.webp',
  sunglass: 'assets/poops/poop_sunglass.webp',
};
const RUN = { key: 'title_run', path: 'assets/boot/boot_chibi_run_6x@2x.webp', fw: 128, fh: 192, frames: 6, fps: 12 } as const;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Band = { y: number; h: number; s: number };
/** bands · lines 는 고정 풀이고 앞의 nb · nl 개만 쓴다 — 깨질 때마다 새로 만들지 않는다 */
type Glitch = {
  on: boolean; end: number; next: number; tick: number;
  bands: Band[]; nb: number; jx: number; jy: number; rgb: number; blank: boolean; lines: { y: number; h: number }[]; nl: number;
};
/** 로고 띠 구간 — 화면 px, 로고 위 기준 */
type Seg = { a: number; b: number; dx: number; dy: number };
type Part = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; life: number; age: number; s: number; poop: boolean; live: boolean };
type Column = { img: Phaser.GameObjects.Image; x: number; y: number; v: number; len: number; on: boolean; g: boolean };
/** 로고 한 층 — 같은 그림을 띠마다 잘라 쓰는 조각 묶음. side: 분홍 +1 · 파랑 -1 (깨질 때만 보인다) · 글자 · 부제 0 */
type Layer = { pool: Phaser.GameObjects.Image[]; x: number; y: number; w: number; h: number; side: 0 | 1 | -1 };

export default class TitleScene extends BaseScene {
  private G!: Glitch;
  private reduce = false;
  private leaving = false;
  private gone = false;
  /** 로고 판 → 화면 배율, 로고 왼쪽 위 */
  private k = 1;
  private ox = 0;
  private oy = 0;
  private cell = 8;
  private layers: Layer[] = [];
  private parts: Part[] = [];
  private cols: Column[] = [];
  private poops: { img: Phaser.GameObjects.Image; x: number; dur: number; delay: number }[] = [];
  private noiseLines: Phaser.GameObjects.Image[] = [];
  private noiseSquares: Phaser.GameObjects.Image[] = [];
  private bdLines: Phaser.GameObjects.Image[] = [];
  private noiseShown = false;
  private u = 4;
  private elapsed = 0;
  /** layoutLogo 작업 칸 — 띠 경계 · 띠(화면 px) · 구간. 미리 잡아 두고 다시 쓴다 */
  private cuts: number[] = [];
  private bandPx: { a: number; b: number; dx: number }[] = [];
  private segs: Seg[] = [];

  constructor() {
    super('TitleScene');
  }

  init() {
    this.G = {
      on: false, end: 0, next: 0, tick: 0, jx: 0, jy: 0, rgb: 0, blank: false,
      bands: Array.from({ length: BANDS_MAX }, () => ({ y: 0, h: 0, s: 0 })), nb: 0,
      lines: Array.from({ length: LINES_MAX }, () => ({ y: 0, h: 0 })), nl: 0,
    };
    this.cuts = [];
    this.bandPx = Array.from({ length: BANDS_MAX }, () => ({ a: 0, b: 0, dx: 0 }));
    this.segs = Array.from({ length: SLICES }, () => ({ a: 0, b: 0, dx: 0, dy: 0 }));
    this.reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.leaving = false;
    this.gone = false;
    this.layers = [];
    this.parts = [];
    this.cols = [];
    this.poops = [];
    this.noiseLines = [];
    this.noiseSquares = [];
    this.bdLines = [];
    this.noiseShown = false;
    this.elapsed = 0;
  }

  preload() {
    // 원본은 title_src_* 로 받아 create 에서 표시 크기로 구운 뒤 바로 지운다
    for (const [name, path] of Object.entries(SRC)) {
      if (!this.textures.exists(`title_src_${name}`)) this.load.image(`title_src_${name}`, path);
    }
    if (!this.textures.exists(RUN.key)) this.load.spritesheet(RUN.key, RUN.path, { frameWidth: RUN.fw, frameHeight: RUN.fh });
  }

  create() {
    super.create();
    const W = this.scale.width, H = this.scale.height;
    // 폰 폭 기둥 — 짧은 화면에서는 줄여서 로고 · 띠 · 치비가 세로로 겹치지 않게 (시안 폰 높이 ≈ 210u)
    const fw = Math.min(W, H / 1.75);
    const u = (this.u = fw / 100);
    this.cell = W > 480 ? 12 : 8;
    this.k = (fw * 0.9) / LOGO.W;
    this.ox = Math.round((W - fw * 0.9) / 2);
    this.oy = Math.round(H * 0.133);

    // 떠날 때 — 그림은 씬이 먼저 부수고(DisplayList 의 shutdown 이 앞서 돈다) 여기서 텍스처 · 애니메이션 · 입력을 지운다
    // 터치가 취소되면(touchcancel) Phaser 는 wasCanceled 를 단 pointerup 을 보낸다 — 누른 것으로 치지 않는다
    const onPointerUp = (ptr: Phaser.Input.Pointer) => { if (!ptr.wasCanceled) this.leave(); };
    const onKey = () => this.leave();
    // 화면 크기가 바뀌면(회전 · 창 크기) 처음부터 다시 그린다 — 배치가 create 때 치수에 묶여 있다. 0.15초 모아서 한 번
    let resizeTimer: Phaser.Time.TimerEvent | undefined;
    const onResize = () => {
      resizeTimer?.remove();
      resizeTimer = this.time.delayedCall(150, () => {
        if (this.leaving || this.gone || (this.scale.width === W && this.scale.height === H)) return;
        this.scene.restart();
      });
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once('shutdown', () => {
      this.gone = true;
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.input.off('pointerup', onPointerUp);
      this.input.keyboard?.off('keydown-ENTER', onKey);
      this.input.keyboard?.off('keydown-SPACE', onKey);
      this.anims.remove(RUN.key);
      for (const key of this.textures.getTextureKeys()) if (key.startsWith('title_')) this.textures.remove(key);
      this.layers = [];
      this.parts = [];
      this.cols = [];
      this.poops = [];
      this.noiseLines = [];
      this.noiseSquares = [];
      this.bdLines = [];
    });

    this.bakeAll(W, u);

    if (this.textures.exists('title_src_bg')) addBackground(this, 'title_src_bg', W, H);
    this.add.image(0, 0, 'title_veil').setOrigin(0).setDisplaySize(W, H);
    this.createRain(W, H);
    this.createPoops(W, u);
    const runnerTop = this.createRunner(W, H, u);
    this.createLogo();
    this.createBand(W, H, u, runnerTop);
    this.createFooter(W, H, u);
    this.layoutLogo();

    // 첫 깨짐 — 시안처럼 0.6초 + 1.8~3.6초 뒤. 씬 시계(time.now)는 첫 update 전엔 게임이 뜬 때에 머물러 있어서 루프 시각으로 잰다
    this.schedule(this.game.loop.time + 600);
    this.input.on('pointerup', onPointerUp);
    this.input.keyboard?.on('keydown-ENTER', onKey);
    this.input.keyboard?.on('keydown-SPACE', onKey);
  }

  // ── 굽기 ──────────────────────────────────────────────────────────────

  /** 원본을 표시 크기로 한 번 굽는다 (부드럽게 줄임). 원본 텍스처는 바로 지운다 */
  private bakeScaled(src: string, dst: string, w: number, h: number, extra?: (ctx: CanvasRenderingContext2D) => void) {
    if (!this.textures.exists(src) || this.textures.exists(dst)) return;
    const tex = this.textures.createCanvas(dst, Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.textures.get(src).getSourceImage() as HTMLImageElement, 0, 0, tex.width, tex.height);
    extra?.(ctx);
    tex.refresh();
  }

  /** 픽셀 그림용 — 칸이 번지지 않게 가장 가까운 점으로 거른다 */
  private canvasTex(key: string, w: number, h: number, nearest: boolean) {
    const tex = this.textures.createCanvas(key, w, h);
    if (tex && nearest) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return tex;
  }

  private bakeAll(W: number, u: number) {
    const k = this.k, c = this.cell;
    // 로고 — 글자 · 부제(+ 초록 네모)
    const L = LOGO.letters, U = LOGO.sub, Q = LOGO.square;
    this.bakeScaled('title_src_letters', 'title_letters', L.w * k, L.h * k);
    this.bakeScaled('title_src_sub', 'title_sub', U.w * k, U.h * k, ctx => {
      ctx.fillStyle = GREEN_CSS;
      ctx.fillRect(Math.round(Q.x * k), Math.round(Q.y * k), Math.round(Q.s * k), Math.round(Q.s * k));
    });
    // 똥 — 먼 것 6u · 가까운 것 9.5u · 조각 속 선글라스 똥은 가장 큰 24칸
    this.bakeScaled('title_src_poop', 'title_poop', 6 * u, 6 * u);
    this.bakeScaled('title_src_poop_smile', 'title_poop_smile', 6 * u, 6 * u);
    this.bakeScaled('title_src_gold', 'title_gold', 9.5 * u, 9.5 * u);
    this.bakeScaled('title_src_dia', 'title_dia', 9.5 * u, 9.5 * u);
    this.bakeScaled('title_src_sunglass', 'title_sunglass', 24 * k, 24 * k);
    for (const name of Object.keys(SRC)) if (name !== 'bg' && this.textures.exists(`title_src_${name}`)) this.textures.remove(`title_src_${name}`);

    // 흰 점 — 조각 · 잡음 네모 (색은 tint)
    const px = this.canvasTex('title_px', 2, 2, true);
    if (px) { const x = px.getContext(); x.fillStyle = '#fff'; x.fillRect(0, 0, 2, 2); px.refresh(); }

    // 위아래 덮개 — 시안 .p-veil
    const veil = this.canvasTex('title_veil', 4, 256, false);
    if (veil) {
      const x = veil.getContext();
      const gr = x.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, 'rgba(40,90,170,0.1)');
      gr.addColorStop(0.3, 'rgba(40,90,170,0)');
      gr.addColorStop(0.62, 'rgba(10,6,22,0)');
      gr.addColorStop(1, 'rgba(10,6,22,0.5)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 4, 256);
      veil.refresh();
    }

    // 띠 바탕 — 가운데 18~82% 만 어둡다 (시안 .band)
    const band = this.canvasTex('title_band', 256, 4, false);
    if (band) {
      const x = band.getContext();
      const gr = x.createLinearGradient(0, 0, 256, 0);
      gr.addColorStop(0, 'rgba(10,6,22,0)');
      gr.addColorStop(0.18, 'rgba(10,6,22,0.62)');
      gr.addColorStop(0.82, 'rgba(10,6,22,0.62)');
      gr.addColorStop(1, 'rgba(10,6,22,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 256, 4);
      band.refresh();
    }

    // 데이터 비 줄기 — 길이 4~13칸 × 먹 · 초록. 머리(맨 아래 칸)가 가장 진하고 위로 옅어진다
    const rain = this.canvasTex('title_rain', 20 * c, 13 * c, true);
    if (rain) {
      const x = rain.getContext();
      for (let g = 0; g < 2; g++) {
        for (let len = 4; len <= 13; len++) {
          const fx = (g * 10 + len - 4) * c;
          for (let i = 0; i < len; i++) {
            const a = i === 0 ? 0.28 : 0.16 * (1 - i / len);
            x.fillStyle = g ? `rgba(0,200,92,${Math.min(1, a * 1.7).toFixed(3)})` : `rgba(17,18,26,${a.toFixed(3)})`;
            x.fillRect(fx, (len - 1 - i) * c, c - 2, c - 2);
          }
          rain.add(`${g}_${len}`, 0, fx, 0, c, len * c);
        }
      }
      rain.refresh();
    }

    // 잡음 줄 — 로고 위 여덟 가닥(먹 · 흰 · 초록 토막) + 화면 가로 여섯 가닥(옅은 먹 · 초록). 높이는 쓸 때 늘린다
    const nw = Math.ceil((L.w + 60) * k);
    const noise = this.canvasTex('title_noise', Math.max(nw, Math.ceil(W)), 14 * 8, true);
    if (noise) {
      const x = noise.getContext();
      for (let r = 0; r < 8; r++) {
        for (let sx = 0; sx < nw;) {
          const w = rand(4, 26) * k;
          if (Math.random() < 0.55) {
            x.fillStyle = Math.random() < 0.3 ? GREEN_CSS : (Math.random() < 0.5 ? INK_CSS : 'rgba(255,255,255,0.85)');
            x.fillRect(Math.round(sx), r * 8, Math.max(1, Math.round(w)), 4);
          }
          sx += w + rand(0, 14) * k;
        }
        noise.add(`n${r}`, 0, 0, r * 8, nw, 4);
      }
      for (let r = 0; r < 6; r++) {
        const y = (8 + r) * 8;
        for (let sx = 0; sx < W;) {
          const w = rand(6, 40);
          if (Math.random() < 0.4) {
            x.fillStyle = Math.random() < 0.3 ? 'rgba(0,200,92,0.5)' : 'rgba(17,18,26,0.25)';
            x.fillRect(Math.round(sx), y, Math.round(w), 4);
          }
          sx += w + rand(0, 20);
        }
        noise.add(`b${r}`, 0, 0, y, Math.ceil(W), 4);
      }
      noise.refresh();
    }
  }

  // ── 그림 놓기 ───────────────────────────────────────────────────────────

  /** 데이터 비 — 칸 폭마다 한 줄. 36% 만 보이고 그중 16% 가 초록 (시안 Backdrop.col) */
  private createRain(W: number, H: number) {
    const c = this.cell;
    const n = Math.ceil(W / c);
    for (let i = 0; i < n; i++) {
      const img = this.add.image(i * c, 0, 'title_rain', '0_4').setOrigin(0);
      const col: Column = { img, x: i * c, y: 0, v: 0, len: 4, on: false, g: false };
      this.resetColumn(col, H, true);
      this.cols.push(col);
    }
    for (let i = 0; i < 2; i++) this.bdLines.push(this.add.image(0, 0, 'title_noise', 'b0').setOrigin(0).setVisible(false));
  }

  private resetColumn(col: Column, H: number, first: boolean) {
    col.y = first ? rand(-H, H) : rand(-H * 0.8, -20);
    col.v = rand(24, 70);
    col.len = Math.floor(rand(4, 14));
    col.on = Math.random() < 0.36;
    col.g = Math.random() < 0.16;
    col.img.setFrame(RAIN_FRAMES[col.g ? 1 : 0][col.len]).setVisible(col.on);
    this.placeColumn(col);
  }

  /** 머리 칸(맨 아래)을 칸 눈금에 맞춘다 — 시안 Math.round(y / c) * c */
  private placeColumn(col: Column) {
    const c = this.cell;
    col.img.setPosition(col.x + (this.G.on ? this.G.jx * 2 : 0), Math.round(col.y / c) * c - (col.len - 1) * c);
  }

  /** 떨어지는 똥 다섯 — 시안 .rain (위 -18u 에서 250u 를 내려가며 -12° → 22° 로 돈다) */
  private createPoops(W: number, u: number) {
    if (this.reduce) return;   // 시안: 움직임 줄이기면 멈춘다 (화면 위 밖에 머문다)
    for (const p of RAIN_POOPS) {
      const key = `title_${p.tex}`;
      if (!this.textures.exists(key)) continue;
      const size = (p.far ? 6 : 9.5) * u;
      const img = this.add.image(0, 0, key).setAlpha(p.far ? 0.5 : 1);
      this.poops.push({ img, x: W * p.left + size / 2, dur: p.dur, delay: p.delay });
    }
    this.updatePoops();
  }

  /** 아래에서 좌우로 달리는 치비 — 22u 폭, 발은 화면 아래 15% 위. 8초에 한 번 오갔다 온다. 머리 높이를 돌려준다 */
  private createRunner(W: number, H: number, u: number): number {
    const scale = (22 * u) / RUN.fw;
    const foot = H * 0.85;
    const top = foot - RUN.fh * scale;
    if (!this.textures.exists(RUN.key)) return top;
    if (!this.anims.exists(RUN.key)) {
      this.anims.create({ key: RUN.key, frames: this.anims.generateFrameNumbers(RUN.key, { start: 0, end: RUN.frames - 1 }), frameRate: RUN.fps, repeat: -1 });
    }
    const spr = this.add.sprite(W / 2, foot, RUN.key, 0).setOrigin(0.5, 1).setScale(scale);
    if (this.reduce) return top;
    spr.play(RUN.key).setX(W / 2 - 26 * u);
    this.tweens.add({
      targets: spr, x: W / 2 + 26 * u, duration: 4000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
      onYoyo: () => spr.setFlipX(true), onRepeat: () => spr.setFlipX(false),
    });
    return top;
  }

  /** 로고 — 층마다 띠 조각 9장 (평소엔 한 장만 통째로 보인다) · 잡음 줄 2 · 잡음 네모 4 · 조각 140 */
  private createLogo() {
    const k = this.k;
    const L = LOGO.letters, U = LOGO.sub;
    const lw = this.texW('title_letters'), lh = this.texH('title_letters');
    const sw = this.texW('title_sub'), sh = this.texH('title_sub');
    const mk = (key: string, side: 0 | 1 | -1, x: number, y: number, w: number, h: number): Layer => {
      const pool: Phaser.GameObjects.Image[] = [];
      if (this.textures.exists(key)) {
        for (let i = 0; i < SLICES; i++) {
          const img = this.add.image(0, 0, key).setOrigin(0).setVisible(false);
          if (side !== 0) img.setTintFill(side > 0 ? MAG : CYAN).setAlpha(SPLIT_ALPHA);
          pool.push(img);
        }
      }
      return { pool, x, y, w, h, side };
    };
    const lx = Math.round(L.x * k), ly = Math.round(L.y * k);
    this.layers = [
      mk('title_letters', 1, lx, ly, lw, lh),
      mk('title_letters', -1, lx, ly, lw, lh),
      mk('title_letters', 0, lx, ly, lw, lh),
      mk('title_sub', 0, Math.round(U.x * k), Math.round(U.y * k), sw, sh),
    ];
    for (let i = 0; i < LINES_MAX; i++) this.noiseLines.push(this.add.image(0, 0, 'title_noise', 'n0').setOrigin(0).setVisible(false));
    for (let i = 0; i < 4; i++) this.noiseSquares.push(this.add.image(0, 0, 'title_px').setOrigin(0).setVisible(false));
    for (let i = 0; i < PARTS_MAX; i++) {
      const img = this.add.image(0, 0, 'title_px').setOrigin(0).setVisible(false);
      this.parts.push({ img, x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 0, s: 1, poop: false, live: false });
    }
    for (let i = 0; i < 70; i++) this.spawn(Math.random());
  }

  private texW(key: string) { return this.textures.exists(key) ? this.textures.get(key).getSourceImage().width : 0; }
  private texH(key: string) { return this.textures.exists(key) ? this.textures.get(key).getSourceImage().height : 0; }

  /** 「▶ 화면을 터치하세요 ◀」 띠 — 치비 머리 바로 위. 세모는 그림으로 (▶ 글자는 기기마다 이모지로 바뀐다) */
  private createBand(W: number, H: number, u: number, runnerTop: number) {
    const fs = 5.6 * u;
    const bh = fs * 1.35 + 6 * u;
    const cy = runnerTop - H * 0.018 - bh / 2;
    const bg = this.add.image(0, cy, 'title_band').setOrigin(0, 0.5).setDisplaySize(W, bh);
    const navy = '#10163A';
    const text = this.add.text(W / 2, cy, '화면을 터치하세요', {
      fontSize: `${Math.max(12, Math.round(fs))}px`, color: '#FFE08A', fontStyle: 'bold',
      stroke: navy, strokeThickness: Math.max(2, Math.round(0.7 * u)),
    }).setOrigin(0.5).setShadow(0, Math.max(1, 0.35 * u), navy, 0, true, false);
    const t = fs * 0.62, gap = fs * 0.4, hw = text.width / 2;
    const tri = this.add.graphics().fillStyle(0xffe08a, 1).lineStyle(Math.max(1.5, 0.45 * u), 0x10163a, 1);
    const lx = W / 2 - hw - gap, rx = W / 2 + hw + gap;
    tri.fillTriangle(lx - t, cy - t * 0.55, lx - t, cy + t * 0.55, lx, cy).strokeTriangle(lx - t, cy - t * 0.55, lx - t, cy + t * 0.55, lx, cy);
    tri.fillTriangle(rx + t, cy - t * 0.55, rx + t, cy + t * 0.55, rx, cy).strokeTriangle(rx + t, cy - t * 0.55, rx + t, cy + t * 0.55, rx, cy);
    if (!this.reduce) {
      this.tweens.add({ targets: [bg, text, tri], alpha: 0.7, duration: 800, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    }
  }

  /** 아래 귀퉁이 — 버전(릴리스 노트 최신) · ⓒ */
  private createFooter(W: number, H: number, u: number) {
    const style = {
      fontSize: `${Math.max(10, Math.round(2.7 * u))}px`, color: 'rgba(255,255,255,0.88)',
    };
    const y = H - 3.4 * u;
    this.add.text(4 * u, y, RELEASE_NOTES[0]?.version ?? '', style).setOrigin(0, 1).setShadow(0, 0.3 * u, 'rgba(0,0,0,0.6)', 0.6 * u);
    this.add.text(W - 4 * u, y, 'ⓒ 2026', style).setOrigin(1, 1).setShadow(0, 0.3 * u, 'rgba(0,0,0,0.6)', 0.6 * u);
  }

  // ── 치지직 ───────────────────────────────────────────────────────────

  private schedule(now: number) {
    this.G.next = now + rand(FREQ[0], FREQ[1]) * 1000;
  }

  private startGlitch(now: number, dur?: number) {
    const G = this.G;
    G.on = true;
    G.end = now + (dur ?? rand(260, 620) * (0.8 + POWER * 0.25));
    G.tick = 0;
  }

  /** 깨짐 한 판 — 띠 · 흔들림 · 갈라짐 폭 · 꺼짐 · 잡음 줄 (시안 reroll, 로고 판 좌표). 풀의 앞 nb · nl 개를 다시 채운다 */
  private reroll() {
    const G = this.G, p = POWER, L = LOGO.letters, U = LOGO.sub;
    G.nb = Math.min(BANDS_MAX, Math.round(rand(2, 5) * p) + 1);
    for (let i = 0; i < G.nb; i++) {
      const b = G.bands[i];
      b.y = rand(L.y - 10, U.y + U.h);
      b.h = rand(4, 34);
      b.s = (Math.random() < 0.5 ? -1 : 1) * rand(8, 44) * p;
    }
    G.jx = Math.round(rand(-3, 3) * p);
    G.jy = Math.round(rand(-2, 2) * p);
    G.rgb = rand(3, 10) * p;
    G.blank = Math.random() < 0.07 * p;
    G.nl = Math.min(LINES_MAX, Math.round(rand(1, 4) * p));
    for (let i = 0; i < G.nl; i++) {
      G.lines[i].y = rand(L.y, L.y + L.h + 140);
      G.lines[i].h = rand(2, 5);
    }
  }

  /**
   * 로고 층을 띠로 자른다. 띠는 로고 판 전체 폭의 가로 구간이고, 겹치면 뒤 띠가 이긴다 (시안은 띠를 차례로 지우고 다시 그린다).
   * 띠 밖은 (jx, jy) 만큼, 띠 안은 (띠 밀림 + jx, 0) 만큼 옮긴다. 갈라짐 층은 제 자리에서 ±rgb 비켜 있다.
   * 깨짐 판이 바뀔 때만 부른다 (45~85ms 마다)
   */
  private layoutLogo() {
    const G = this.G, k = this.k;
    const glitch = G.on, hide = glitch && G.blank;
    const jx = glitch ? G.jx * k : 0, jy = glitch ? Math.round(G.jy * k) : 0;
    const bottom = Math.ceil(LOGO.H * k);
    // 띠를 화면 px 로, 경계를 모아 정렬 — 작업 칸(cuts · bandPx · segs)은 init 에서 잡아 둔 것을 다시 쓴다
    const nb = glitch ? G.nb : 0;
    const cuts = this.cuts;
    cuts.length = 0;
    cuts.push(0, bottom);
    for (let i = 0; i < nb; i++) {
      const src = G.bands[i], dst = this.bandPx[i];
      dst.a = Math.max(0, Math.min(bottom, Math.round(src.y * k)));
      dst.b = Math.max(0, Math.min(bottom, Math.round((src.y + src.h) * k)));
      dst.dx = (src.s + G.jx) * k;
      cuts.push(dst.a, dst.b);
    }
    cuts.sort(numAsc);
    let ns = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1];
      if (b <= a) continue;
      const m = (a + b) / 2;
      let dx = jx, dy = jy;
      for (let j = 0; j < nb; j++) {
        const band = this.bandPx[j];
        if (m >= band.a && m < band.b) { dx = band.dx; dy = 0; }   // 뒤 띠가 이긴다
      }
      const last = ns > 0 ? this.segs[ns - 1] : null;
      if (last && last.dx === dx && last.dy === dy) { last.b = b; continue; }
      if (ns >= this.segs.length) break;
      const s = this.segs[ns++];
      s.a = a; s.b = b; s.dx = dx; s.dy = dy;
    }
    for (const layer of this.layers) {
      let used = 0;
      if (!hide && (glitch || layer.side === 0)) {
        const lx = layer.x + layer.side * G.rgb * k;
        const ly = layer.y + (layer.side < 0 && G.jy ? Math.round(k) : 0);
        for (let i = 0; i < ns; i++) {
          const s = this.segs[i];
          const r0 = Math.max(0, s.a - ly - s.dy), r1 = Math.min(layer.h, s.b - ly - s.dy);
          if (r1 <= r0 || used >= layer.pool.length) continue;
          layer.pool[used++].setPosition(this.ox + lx + s.dx, this.oy + ly + s.dy).setCrop(0, r0, layer.w, r1 - r0).setVisible(true);
        }
      }
      for (let i = used; i < layer.pool.length; i++) layer.pool[i].setVisible(false);
    }
  }

  /** 깨지는 동안 매 프레임 — 로고 잡음 줄 · 잡음 네모 · 화면 가로 잡음 줄을 새로 고른다 (구운 줄에서 고르기만) */
  private updateNoise(W: number, H: number) {
    const G = this.G, k = this.k, L = LOGO.letters;
    const show = G.on && !G.blank;
    if (!show) {
      if (this.noiseShown) {
        for (const o of this.noiseLines) o.setVisible(false);
        for (const o of this.noiseSquares) o.setVisible(false);
        for (const o of this.bdLines) o.setVisible(false);
        this.noiseShown = false;
      }
      return;
    }
    this.noiseShown = true;
    const nw = Math.ceil((L.w + 60) * k);
    for (let i = 0; i < this.noiseLines.length; i++) {
      const img = this.noiseLines[i];
      if (i >= G.nl) { img.setVisible(false); continue; }
      const ln = G.lines[i];
      img.setFrame(NOISE_FRAMES[Math.floor(Math.random() * NOISE_FRAMES.length)]).setPosition(this.ox + (L.x - 30) * k, this.oy + ln.y * k)
        .setDisplaySize(nw, Math.max(1, ln.h * k)).setVisible(true);
    }
    for (const sq of this.noiseSquares) {
      const s = Math.max(1, rand(4, 13) * k);
      sq.setPosition(this.ox + (L.x + rand(-20, L.w + 20)) * k, this.oy + (L.y + rand(0, L.h + 120)) * k)
        .setDisplaySize(s, s).setTint(Math.random() < 0.5 ? GREEN : INK).setVisible(true);
    }
    for (const img of this.bdLines) {
      img.setFrame(BD_FRAMES[Math.floor(Math.random() * BD_FRAMES.length)]).setPosition(0, rand(0, H)).setDisplaySize(W, rand(1, 3)).setVisible(true);
    }
  }

  // ── 조각 · 비 · 똥 ─────────────────────────────────────────────────────

  /** 글자 밑에서 떨어지는 조각 하나 — 5% 는 작은 선글라스 똥. age01 을 주면 이미 그만큼 떨어진 채로 (처음 채울 때) */
  private spawn(age01: number) {
    // 빈 칸을 쓰고, 다 쓰고 있으면 가장 오래된 것을 다시 쓴다 (시안: 140 넘으면 앞에서 버린다)
    let p: Part | null = null;
    let oldest = this.parts[0];
    for (const q of this.parts) {
      if (!q.live) { p = q; break; }
      if (q.age / q.life > oldest.age / oldest.life) oldest = q;
    }
    if (!p) p = oldest;
    if (!p) return;
    const L = LOGO.letters;
    if (Math.random() < 0.6) {
      const s = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
      p.x = s[0];
      p.y = s[1];
    } else {
      p.x = L.x + rand(0, L.w);
      p.y = L.y + L.h * rand(0.78, 1);
    }
    p.poop = Math.random() < 0.05 && this.textures.exists('title_sunglass');
    p.vy = rand(10, 40);
    p.vx = rand(-6, 6);
    p.life = rand(1.4, 2.8);
    p.age = 0;
    p.s = p.poop ? rand(16, 24) : rand(3, 10);
    p.live = true;
    if (age01) {
      p.age = age01 * p.life;
      p.y += p.vy * p.age + 30 * p.age * p.age;
    }
    const size = p.s * this.k;
    if (p.poop) p.img.setTexture('title_sunglass').clearTint();
    else p.img.setTexture('title_px').setTint(Math.random() < 0.16 ? GREEN : INK);
    p.img.setDisplaySize(size, size).setVisible(true);
    this.placePart(p);
  }

  /** 60% 까지는 그대로, 그 뒤 사라진다. 깨지는 동안은 옆으로 같이 흔들린다 */
  private placePart(p: Part) {
    const t = p.age / p.life, k = this.k;
    const shake = this.G.on ? this.G.jx * 2 : 0;
    p.img.setAlpha(t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4))
      .setPosition(this.ox + Math.round(p.x + shake) * k, this.oy + Math.round(p.y) * k);
  }

  private updateParts(dt: number) {
    const floor = LOGO.sub.y - 14;
    if (Math.random() < (this.reduce ? 8 : 26) * dt) this.spawn(0);
    for (const p of this.parts) {
      if (!p.live) continue;
      p.age += dt;
      p.vy += 60 * dt;
      p.y += p.vy * dt;
      p.x += p.vx * dt;
      if (p.age > p.life || p.y > floor) {
        p.live = false;
        p.img.setVisible(false);
        continue;
      }
      this.placePart(p);
    }
  }

  private updateRain(dt: number, H: number) {
    const c = this.cell, slow = this.reduce ? 0.35 : 1;
    for (const col of this.cols) {
      col.y += col.v * dt * slow;
      if (col.y - col.len * c > H) this.resetColumn(col, H, false);
      else if (col.on) this.placeColumn(col);
    }
  }

  private updatePoops() {
    const u = this.u, H = this.scale.height;
    const travel = Math.max(250 * u, H + 36 * u);
    for (const p of this.poops) {
      // 시안 속도(250u / dur)를 지키고, 화면이 길면 지나는 거리만 늘린다
      const d = (((this.elapsed - p.delay) * (250 * u)) / p.dur) % travel;
      const t = d / travel;
      p.img.setPosition(p.x, -18 * u + p.img.displayHeight / 2 + d).setAngle(-12 + 34 * t);
    }
  }

  update(_time: number, delta: number) {
    if (this.gone) return;
    const now = this.time.now, dt = Math.min(0.05, delta / 1000);
    this.elapsed += dt;
    const G = this.G;
    if (!G.on && !this.reduce && !this.leaving && now >= G.next) this.startGlitch(now);
    if (G.on) {
      if (now >= G.end) {
        G.on = false;
        this.schedule(now);
        this.layoutLogo();
      } else if (now >= G.tick) {
        this.reroll();
        G.tick = now + rand(45, 85);
        this.layoutLogo();
      }
    }
    const W = this.scale.width, H = this.scale.height;
    this.updateRain(dt, H);
    this.updatePoops();
    this.updateParts(dt);
    this.updateNoise(W, H);
  }

  // ── 넘어가기 ─────────────────────────────────────────────────────────

  /** 아무 데나 누르면 — 치지직 소리와 함께 짧게 깨지고 홈으로 */
  private leave() {
    if (this.leaving || this.gone) return;
    this.leaving = true;
    this.crackle(TAP_GLITCH_MS / 1000);
    this.startGlitch(this.time.now, TAP_GLITCH_MS);
    this.time.delayedCall(TAP_GLITCH_MS, () => {
      this.sound.stopAll();
      this.scene.start('ModeSelectScene');
    });
  }

  /**
   * 치지직 — 띠 잡음을 짧게 끊었다 이었다 (시안 crackle). 손가락을 뗄 때 부르므로 브라우저가 소리를 허락한다.
   * Phaser 소리 관리자의 마스터에 물려서 설정의 소리 끄기를 그대로 따른다. 소리를 못 내도 넘어가는 데는 지장 없다
   */
  private crackle(dur: number) {
    const sm = this.sound;
    if (!(sm instanceof Phaser.Sound.WebAudioSoundManager) || sm.mute) return;
    try {
      const ac = sm.context;
      if (ac.state === 'suspended') void ac.resume();
      const n = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buf = ac.createBuffer(1, n, ac.sampleRate);
      const d = buf.getChannelData(0);
      let gate = 0, left = 0;
      for (let i = 0; i < n; i++) {
        if (left-- <= 0) {
          left = Math.floor(ac.sampleRate / rand(25, 90));
          gate = Math.random() < 0.65 ? rand(0.3, 1) : 0;
        }
        d[i] = (Math.random() * 2 - 1) * gate;
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 0.6;
      const g = ac.createGain();
      g.gain.value = 0.22 * Math.min(1.4, POWER);
      src.connect(bp).connect(g).connect(sm.destination);
      src.onended = () => { src.disconnect(); bp.disconnect(); g.disconnect(); };
      src.start();
    } catch {
      // 소리 없이 넘어간다
    }
  }
}
