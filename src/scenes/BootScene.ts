import Phaser from 'phaser';
import { loadGameFont } from '../utils/gameFont';
import { discardPendingLoads } from '../utils/characterAssets';

/**
 * 첫 씬 — 게임 글꼴이 올라오는 동안 '러너' 로딩 화면 (A안, 2026-10-08 대표 채택), 다 오면 메인(ModeSelectScene).
 *
 * 화면: 위에 타이틀 간판 · 땅 위에서 제자리로 달리는 치비 + 흙먼지 ·
 *   구름(0.25배) · 먼 빌딩(0.5배) · 땅 줄무늬(1배)가 왼쪽으로 흐르는 시차 스크롤 (끝없는 루프).
 *   **글자는 0개** — 글꼴이 오기 전 화면이다. 그림은 치비 걷기 6칸 · 타이틀 두 장뿐, 나머지는 전부 도형.
 *   (시안 · 좌표: ddong-fx-work/small-screens/2_boot/v2/build.py plan_A — 480x720 기준, 땅은 아래 끝에서 잰다)
 *
 * 시간
 *   - 하늘은 첫 프레임부터. 두 장은 create 에서 받기 시작하고, 늦으면 도형만으로 먼저 돈다 (preload 로 막지 않는다)
 *   - 글꼴이 REVEAL_MS 안에 오면(다시 방문 · 캐시) 러너를 안 보이고 바로 넘어간다 — 하늘만 한 번 보여서 깜빡이지 않는다
 *   - 그보다 늦으면 러너를 보이고, 보인 뒤 최소 MIN_SHOW_MS 는 둔다 (너무 빨리 끝나 깜빡이지 않게).
 *     그래서 늘어나는 시간은 글꼴이 REVEAL_MS ~ REVEAL_MS + MIN_SHOW_MS 사이에 왔을 때만, 많아야 MIN_SHOW_MS
 *   - 글꼴이 늦거나 실패해도 3초 안에 넘어간다 (loadGameFont 기본값, 시스템 글꼴)
 *
 * 게임 인스턴스는 main.ts 에서 **동기로** 만들어야 한다 (비동기로 만들면 키보드 포커스를 못 받는다).
 * 그래서 글꼴은 게임을 만든 뒤 여기서 기다린다.
 */
const CHIBI = { key: 'boot_chibi_run', path: 'assets/boot/boot_chibi_run_6x@2x.webp', fw: 128, fh: 192, frames: 6, fps: 12, scale: 0.5 } as const;
const TITLE = { key: 'boot_title', path: 'assets/boot/boot_title_240w@2x.webp', width: 300 } as const;
const RUN_ANIM = 'boot_chibi_run';
/** 땅이 흐르는 속도 px/s — 구름 0.25배 · 빌딩 0.5배 */
const SPEED = 120;
const REVEAL_MS = 150;
const MIN_SHOW_MS = 450;

export default class BootScene extends Phaser.Scene {
  private elapsed = 0;
  private revealedAt = 0;
  private gone = false;
  private world!: Phaser.GameObjects.Container;
  private clouds: { obj: Phaser.GameObjects.Graphics; x0: number }[] = [];
  private buildings: { obj: Phaser.GameObjects.Rectangle; x0: number }[] = [];
  private stripes: { obj: Phaser.GameObjects.Rectangle; x0: number }[] = [];
  private dust: Phaser.GameObjects.Arc[] = [];
  private shadow: Phaser.GameObjects.Ellipse | null = null;
  private chibi: Phaser.GameObjects.Sprite | null = null;
  private title: Phaser.GameObjects.Image | null = null;
  private groundY = 560;

  constructor() {
    super('BootScene');
  }

  init() {
    this.elapsed = 0;
    this.revealedAt = 0;
    this.gone = false;
    this.clouds = [];
    this.buildings = [];
    this.stripes = [];
    this.dust = [];
    this.shadow = null;
    this.chibi = null;
    this.title = null;
  }

  create() {
    const { width: W, height: H } = this.scale;
    // 하늘 — 첫 프레임부터
    this.add.graphics().fillGradientStyle(0x7ec8ff, 0x7ec8ff, 0xd8f2ff, 0xd8f2ff, 1).fillRect(0, 0, W, H);
    this.world = this.add.container(0, 0).setVisible(false);
    this.buildWorld(W, H);

    // 두 장 — 막지 않고 받는다. 오는 대로 얹는다
    this.load.spritesheet(CHIBI.key, CHIBI.path, { frameWidth: CHIBI.fw, frameHeight: CHIBI.fh });
    this.load.image(TITLE.key, TITLE.path);
    this.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}spritesheet-${CHIBI.key}`, () => this.addChibi());
    this.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${TITLE.key}`, () => this.addTitle());
    this.load.start();

    this.time.delayedCall(REVEAL_MS, () => {
      if (this.gone) return;
      this.revealedAt = this.time.now;
      this.world.setVisible(true);
    });
    loadGameFont().finally(() => {
      if (this.gone || !this.scene.isActive()) return;
      if (!this.revealedAt) { this.leave(); return; }
      const wait = Math.max(0, this.revealedAt + MIN_SHOW_MS - this.time.now);
      this.time.delayedCall(wait, () => this.leave());
    });
  }

  /** 구름 · 먼 빌딩 · 땅 · 줄무늬 · 그림자 · 흙먼지 — 전부 도형 */
  private buildWorld(W: number, H: number) {
    const ky = H / 720;
    this.groundY = H - 160;
    const g = this.groundY;
    for (const [x0, y0, w] of [[60, 140, 90], [330, 200, 110], [200, 90, 70]] as const) {
      const c = this.add.graphics();
      c.fillStyle(0xffffff, 0.92);
      c.fillRoundedRect(0, 0, w, 22, 11);
      c.fillRoundedRect(w * 0.2, -14, w * 0.45, 26, 11);
      c.fillRoundedRect(w * 0.5, -8, w * 0.35, 20, 10);
      c.setY(y0 * ky);
      this.clouds.push({ obj: c, x0 });
    }
    const nb = Math.ceil((W + 80) / 58) + 1;
    for (let i = 0; i < nb; i++) {
      const bw = 34 + (i * 13) % 26, bh = 60 + (i * 37) % 90;
      this.buildings.push({ obj: this.add.rectangle(0, g, bw, bh, 0x96c4ec).setOrigin(0, 1), x0: i * 58 });
    }
    const ground = this.add.graphics();
    ground.fillStyle(0x7abe5a).fillRect(0, g, W, H - g);
    ground.fillStyle(0xa0dc6e).fillRect(0, g, W, 6);
    ground.fillStyle(0xb07850).fillRect(0, g + 40, W, H - g - 40);
    const ns = Math.ceil((W + 48) / 48) + 1;
    for (let i = 0; i < ns; i++) {
      this.stripes.push({ obj: this.add.rectangle(0, g + 50, 22, 6, 0x8c5c3c).setOrigin(0, 0), x0: i * 48 });
    }
    // 그림자 · 흙먼지는 치비가 올라온 뒤에 보인다 (치비 없이 그림자만 달리면 어색하다)
    this.shadow = this.add.ellipse(W / 2, g + 6, 46, 8, 0x1e3250, 0.7).setVisible(false);
    for (let i = 0; i < 3; i++) this.dust.push(this.add.circle(0, 0, 3, 0xffffff, 0.6).setVisible(false));
    this.world.add([...this.clouds.map(c => c.obj), ...this.buildings.map(b => b.obj), ground, ...this.stripes.map(s => s.obj), this.shadow, ...this.dust]);
  }

  private addChibi() {
    if (this.gone || !this.textures.exists(CHIBI.key)) return;
    if (!this.anims.exists(RUN_ANIM)) {
      this.anims.create({ key: RUN_ANIM, frames: this.anims.generateFrameNumbers(CHIBI.key, { start: 0, end: CHIBI.frames - 1 }), frameRate: CHIBI.fps, repeat: -1 });
    }
    this.chibi = this.add.sprite(this.scale.width / 2, this.groundY + 8, CHIBI.key, 0).setOrigin(0.5, 1).setScale(CHIBI.scale);
    this.chibi.play(RUN_ANIM);
    this.shadow?.setVisible(true);
    this.dust.forEach(d => d.setVisible(true));
    this.world.add(this.chibi);
  }

  private addTitle() {
    if (this.gone || !this.textures.exists(TITLE.key)) return;
    const { width: W, height: H } = this.scale;
    const w = Math.min(TITLE.width, W - 40);
    this.title = this.add.image(W / 2, H * (250 / 720), TITLE.key);
    this.title.setScale(w / this.title.width);
    this.world.add(this.title);
  }

  update(_time: number, delta: number) {
    if (this.gone) return;
    const t = (this.elapsed += delta / 1000);
    const W = this.scale.width;
    for (const c of this.clouds) c.obj.setX(Phaser.Math.Wrap(c.x0 - t * SPEED * 0.25, -120, W + 20));
    for (const b of this.buildings) b.obj.setX(Phaser.Math.Wrap(b.x0 - t * SPEED * 0.5, -60, W + 20));
    for (const s of this.stripes) s.obj.setX(Phaser.Math.Wrap(s.x0 - t * SPEED, -48, W));
    // 흙먼지 — 발뒤에서 피어올라 뒤로 흩어진다
    const fx = W / 2 - 18, fy = this.groundY + 6;
    this.dust.forEach((d, i) => {
      const ph = (t * 3 + i / 3) % 1;
      d.setPosition(fx - ph * 30, fy - 4 - ph * 6).setRadius(3 + ph * 7).setAlpha(0.95 * (1 - ph * ph));
    });
    // 걸음마다 살짝 튀는 몸
    if (this.chibi) this.chibi.y = this.groundY + 8 - Math.abs(Math.sin(t * 4 * Math.PI)) * 3;
  }

  /**
   * 메인으로. 아직 받는 중인 두 장은 끊고(늦게 와서 텍스처로 되살아나지 않게),
   * **그림을 먼저 부수고 텍스처를 나중에 지운다** — 화면에 남은 그림이 지운 텍스처를 그리다 렌더러가 멈추지 않게
   */
  private leave() {
    if (this.gone) return;
    this.gone = true;
    discardPendingLoads(this);
    this.chibi?.destroy();
    this.title?.destroy();
    this.chibi = null;
    this.title = null;
    this.anims.remove(RUN_ANIM);
    for (const k of [CHIBI.key, TITLE.key]) if (this.textures.exists(k)) this.textures.remove(k);
    this.scene.start('ModeSelectScene');
  }
}
