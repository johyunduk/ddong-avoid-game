import Phaser from 'phaser';
import { getCharacterDef, getGradeImgKey } from '../../utils/character';
import { bakeButton, gradientText, wireButton } from '../../utils/buttonSkin';

/**
 * 게임오버 화면 (B안 — 2026-10-07 대표 채택). 그리기만 맡는다 — 점수 등록 · SKOR 정산 · 순위 조회는 GameScene 이 하고
 * 결과를 setRank / setSkor / showRegistered 로 넘긴다.
 *
 * 구성 (위에서 아래로)
 *   위 65% = 플레이한 캐릭터 일러스트 (원본은 크롭 한 장으로 구운 뒤 놓는다) · GAME OVER 알약 · 캐릭터 칩
 *   점수(64px) · 최고 줄 / 신기록이면 색종이 + NEW RECORD 리본
 *   보라 시트에 칩 셋: 전체 순위 · 캐릭터 순위 · SKOR
 *   특수똥 4종 개수 줄
 *   신기록: 이니셜 입력 줄 + 다시 하기(큰 버튼) · 메인 메뉴는 왼쪽 위 작은 버튼
 *   일반:   다시 하기(더 큰 버튼) + 메인 메뉴
 *
 * 높이는 실기 720 기준 시안 좌표를 위·아래 끝에서 잰 거리로 옮겼다 (화면 높이가 달라도 아래 버튼이 바닥에 붙는다).
 * 방사형 빛살은 쓰지 않는다 (게임 전체 금지 — 신기록 강조는 색종이 · 리본 · 글로우로).
 */

export interface GameOverInfo {
  score: number;
  isNewRecord: boolean;
  /** 이번 판 전 개인 최고 (이번 시즌) */
  prevBest: number;
  charId: string;
  /** EXTREME 캐릭터별 최고 (이번 판 전). EXTREME 이 아니면 null — 캐릭터 순위가 없다 */
  charBest: number | null;
  collected: { gold: number; diamond: number; topaz: number; rainbow: number };
  /** 키보드가 있는 환경 — 다시 하기 안에 Space 키캡을 보인다 */
  desktop: boolean;
}

export interface GameOverHandlers {
  onRetry: () => void;
  onMenu: () => void;
  /** 이니셜 3자를 검증한 뒤 부른다. 등록 결과는 showRegistered 로 돌려준다 */
  onSubmitInitials: (initials: string) => void;
}

/** 순위 칩 값 — undefined = 조회 실패/늦음('-'), null = 이번 시즌 기록 없음 */
export type RankValue = number | null | undefined;

const DEPTH = 200;
/** 일러스트가 차지하는 화면 위쪽 비율 */
const ART_RATIO = 0.65;
/** 일러스트 크롭 텍스처 — 한 장만 쓰고 씬이 끝나면 지운다 */
const ART_KEY = 'gameover_art';
const SPECIALS: [keyof GameOverInfo['collected'], string][] = [
  ['gold', 'gold_poop'], ['diamond', 'diamond_poop'], ['topaz', 'topaz_poop'], ['rainbow', 'rainbow_poop'],
];

/** 게임 화면 그대로 둔 위에 그린다. 화면 전체를 덮는 막이 아래 게임 입력을 막는다 */
export class GameOverView {
  private readonly scene: Phaser.Scene;
  private readonly info: GameOverInfo;
  private readonly handlers: GameOverHandlers;
  private readonly W: number;
  private readonly H: number;
  private readonly cx: number;
  private chips: { value: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text }[] = [];
  private input: HTMLInputElement | null = null;
  private initialsRow: Phaser.GameObjects.GameObject[] = [];
  private initialsError: Phaser.GameObjects.Text | null = null;
  private submitting = false;
  /** 신기록 화면 왼쪽 위 '메뉴' — 등록을 마치면 없애고 아래 줄로 옮긴다 */
  private topMenu: Phaser.GameObjects.Container | null = null;
  /** 씬이 끝났다 — 늦게 도착한 일러스트가 다음 판 화면에 그려지지 않게 */
  private dead = false;
  /** 일러스트 크롭을 띄운 이미지 — 텍스처를 지우기 **전에** 먼저 부순다 (destroy 참고) */
  private artImage: Phaser.GameObjects.Image | null = null;

  constructor(scene: Phaser.Scene, info: GameOverInfo, handlers: GameOverHandlers) {
    this.scene = scene;
    this.info = info;
    this.handlers = handlers;
    this.W = scene.scale.width;
    this.H = scene.scale.height;
    this.cx = this.W / 2;
    scene.events.once('shutdown', () => this.destroy());
    this.build();
  }

  // ── 그리기 ──────────────────────────────────────────────────────────

  private build() {
    const { scene, W, H, cx, info } = this;
    // 게임 화면을 어둡게 누르고 아래 입력을 막는다
    scene.add.rectangle(cx, H / 2, W, H, 0x0a0616, 0.85).setDepth(DEPTH).setInteractive();
    this.buildArt();

    // 위: GAME OVER 알약 · 캐릭터 칩
    const pillG = scene.add.graphics().setDepth(DEPTH + 2);
    pillG.fillStyle(0x0a0616, 0.82).fillRoundedRect(13, 13, 210, 42, 21);
    pillG.lineStyle(2, 0xff3b2f).strokeRoundedRect(13, 13, 210, 42, 21);
    const title = scene.add.text(118, 34, 'GAME OVER', {
      fontSize: '24px', fontStyle: 'bold', stroke: '#1a0404', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(DEPTH + 3);
    gradientText(title, [[0, '#ffb3a8'], [0.45, '#ff3b2f'], [1, '#9a0a0a']]);

    const def = getCharacterDef(info.charId);
    const chipW = 140, chipX = W - 12 - chipW;
    pillG.fillStyle(0x0a0616, 0.78).fillRoundedRect(chipX, 16, chipW, 36, 18);
    pillG.lineStyle(1.5, Phaser.Display.Color.HexStringToColor(def.gradeColor).color).strokeRoundedRect(chipX, 16, chipW, 36, 18);
    const gradeKey = getGradeImgKey(def.grade);
    if (gradeKey && scene.textures.exists(gradeKey)) {
      scene.add.image(chipX + 22, 34, gradeKey).setDisplaySize(24, 24).setDepth(DEPTH + 3);
    }
    scene.add.text(chipX + 40, 34, `${def.name} 플레이`, {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(DEPTH + 3);

    // 신기록 — 색종이 + 리본 (빛살 없음)
    if (info.isNewRecord) {
      this.confetti();
      this.ribbon(cx, H - 420, 230);
    }

    // 점수 + 최고 줄
    const score = scene.add.text(cx, H - 358, info.score.toLocaleString(), {
      fontSize: '64px', fontStyle: 'bold', stroke: '#140a24', strokeThickness: 12,
    }).setOrigin(0.5).setDepth(DEPTH + 3);
    gradientText(score, [[0, '#ffffff'], [0.6, '#ffe08a'], [1, '#ffb01a']]);
    scene.add.text(cx, H - 312, this.bestLine(def.name), {
      fontSize: info.isNewRecord ? '13px' : '14px', color: '#ffe9a8', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH + 3);

    // 보라 시트 + 칩 셋
    this.sheet(def.name);
    this.specials(H - 158);

    if (info.isNewRecord) {
      this.buildInitialsRow(H - 90);
      this.retryButton(H - 32, W - 60, 56);
      // 메인 메뉴 — 등록 전에는 아래가 이니셜 줄로 차니 왼쪽 위 작은 버튼. 등록하면 아래 결과 줄 오른쪽으로 옮긴다 (showRegistered)
      this.topMenu = this.menuButton(44, 84, 64, 30, '메뉴', 13);
    } else {
      this.retryButton(H - 96, W - 40, 92);
      this.menuButton(cx, H - 28, 180, 38, '메인 메뉴', 18);
    }
  }

  private bestLine(charName: string): string {
    const { info } = this;
    const fmt = (n: number) => n.toLocaleString();
    if (info.isNewRecord) {
      // 기록이 없던 판은 '0' 대신 '첫 기록'
      const charPart = info.charBest === null ? ''
        : info.charBest > 0 ? `  ·  ${charName} 최고 ${fmt(info.charBest)}${info.score > info.charBest ? ` → ${fmt(info.score)}` : ''}`
        : `  ·  ${charName} 첫 기록`;
      return `${info.prevBest > 0 ? `이전 최고 ${fmt(info.prevBest)}` : '이번 시즌 첫 기록'}${charPart}`;
    }
    const charPart = info.charBest !== null ? `   ·   ${charName} 최고 ${fmt(Math.max(info.charBest, info.score))}` : '';
    return `개인 최고 ${fmt(info.prevBest)}${charPart}`;
  }

  /**
   * 일러스트 — 원본(768x1344, GPU 약 4MB)을 화면 위 65% 크기로 크롭해 캔버스 한 장에 굽고, 원본은 이 씬이 받은 것이면 바로 지운다.
   * 아래쪽은 같은 캔버스에서 어둠으로 풀어 둔다 (덮개 오브젝트를 따로 두지 않는다)
   */
  private buildArt() {
    const { scene } = this;
    const def = getCharacterDef(this.info.charId);
    const place = () => {
      if (this.dead || !scene.textures.exists(def.illustKey)) return;
      this.bakeArt(def.illustKey);
      if (loadedHere) scene.textures.remove(def.illustKey);
      this.artImage = scene.add.image(this.cx, 0, ART_KEY).setOrigin(0.5, 0)
        .setDisplaySize(this.W, Math.round(this.H * ART_RATIO)).setDepth(DEPTH + 1);
    };
    const loadedHere = !scene.textures.exists(def.illustKey);
    if (!loadedHere) { place(); return; }
    scene.load.image(def.illustKey, def.illustPath);
    scene.load.once(`${Phaser.Loader.Events.FILE_KEY_COMPLETE}image-${def.illustKey}`, place);
    scene.load.start();
  }

  private bakeArt(srcKey: string) {
    const { scene, W } = this;
    if (scene.textures.exists(ART_KEY)) scene.textures.remove(ART_KEY);
    const h = Math.round(this.H * ART_RATIO);
    const R = Math.min(2, window.devicePixelRatio || 1);
    const tex = scene.textures.createCanvas(ART_KEY, Math.round(W * R), Math.round(h * R));
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.scale(R, R);
    const src = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement;
    // 덮어 채우기 — 얼굴이 위에 오게 세로 초점 12%
    const sc = Math.max(W / src.width, h / src.height);
    const sw = W / sc, sh = h / sc;
    ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) * 0.12, sw, sh, 0, 0, W, h);
    // 아래 55% 부터 어둠으로 풀린다 (점수가 얹히는 자리)
    const g = ctx.createLinearGradient(0, h * 0.45, 0, h * 0.95);
    g.addColorStop(0, 'rgba(10,6,22,0)');
    g.addColorStop(1, 'rgba(10,6,22,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.45, W, h * 0.55 + 1);
    tex.refresh();
  }

  /** 색종이 — 작은 사각형 30장이 한 번 흩날려 내려앉는다 */
  private confetti() {
    const { scene, W, H } = this;
    const colors = [0xffd34d, 0xff6a5a, 0x5ad1ff, 0xb36bff, 0x7dff9a];
    const rng = new Phaser.Math.RandomDataGenerator(['gameover']);
    for (let i = 0; i < 30; i++) {
      const x = rng.between(10, W - 10), y = rng.between(70, H - 420);
      const r = scene.add.rectangle(x, y - 60, rng.between(4, 8), rng.between(8, 13), colors[i % colors.length])
        .setAngle(rng.between(0, 180)).setDepth(DEPTH + 2).setAlpha(0);
      scene.tweens.add({
        targets: r, y, alpha: 1, angle: r.angle + rng.between(90, 270),
        duration: rng.between(700, 1300), delay: rng.between(0, 400), ease: 'Cubic.easeOut',
      });
    }
  }

  /** NEW RECORD 리본 — 양끝 꼬리 + 금 판 */
  private ribbon(x: number, y: number, w: number) {
    const { scene } = this;
    const h = 34;
    const tails = scene.add.graphics().setDepth(DEPTH + 2);
    for (const sgn of [-1, 1]) {
      const tx = x + sgn * (w / 2 - 6);
      const pts = [
        new Phaser.Math.Vector2(tx, y - h / 2 + 8), new Phaser.Math.Vector2(tx + sgn * 30, y - h / 2 + 8),
        new Phaser.Math.Vector2(tx + sgn * 20, y + 4), new Phaser.Math.Vector2(tx + sgn * 30, y + h / 2 + 8),
        new Phaser.Math.Vector2(tx, y + h / 2 + 8),
      ];
      tails.fillStyle(0xc98a22).fillPoints(pts, true);
      tails.lineStyle(1.5, 0x7a4a00).strokePoints(pts, true);
    }
    const skin = bakeButton(scene, `go_ribbon_${w}`, {
      w, h, radius: 8, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 3, lip: '#a8650a', lipH: 4, gloss: 0,
      glow: 'rgba(255,200,80,0.7)',
    });
    scene.add.image(x, y, skin.key).setOrigin(0.5, skin.originY).setDepth(DEPTH + 3);
    const label = scene.add.text(x, y - 1, 'NEW RECORD', {
      fontSize: '22px', color: '#5b2e0e', fontStyle: 'bold', stroke: '#ffffff', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH + 4);
    // 리본만 살짝 커졌다 돌아온다 — 신기록 강조
    label.setScale(0.6);
    scene.tweens.add({ targets: label, scale: 1, duration: 420, ease: 'Back.easeOut' });
  }

  /** 보라 시트 + 칩 셋 — 전체 순위 · 캐릭터 순위 · SKOR. 값은 처음엔 '…', 결과가 오면 갈아 끼운다 */
  private sheet(charName: string) {
    const { scene, W, H } = this;
    const top = H - 288, bottom = H - 172;
    const g = scene.add.graphics().setDepth(DEPTH + 2);
    g.fillStyle(0x140c28, 0.92).fillRoundedRect(14, top, W - 28, bottom - top, 18);
    g.lineStyle(2, 0x6a3cff).strokeRoundedRect(14, top, W - 28, bottom - top, 18);
    const cw = (W - 28 - 16) / 3;
    const labels = ['전체 순위', `${charName} 순위`, 'SKOR'];
    labels.forEach((label, i) => {
      const x0 = 22 + i * (cw + 8), xm = x0 + (cw - 8) / 2;
      g.fillStyle(0xffffff, 0.07).fillRoundedRect(x0, top + 10, cw - 8, bottom - top - 20, 12);
      scene.add.text(xm, top + 28, label, { fontSize: '12px', color: '#b9a3d6', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(DEPTH + 3);
      const value = scene.add.text(xm, top + 60, '…', {
        fontSize: '28px', fontStyle: 'bold', stroke: '#140a24', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(DEPTH + 3);
      gradientText(value, i < 2 ? [[0, '#ffffff'], [1, '#ffe08a']] : [[0, '#fff3a8'], [1, '#ffb81a']]);
      const sub = scene.add.text(xm, top + 90, '', { fontSize: '12px', color: '#c9c9d6', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(DEPTH + 3);
      this.chips.push({ value, sub });
    });
    // 캐릭터 순위는 EXTREME 에만 있다
    if (this.info.charBest === null) {
      this.chips[1].value.setText('-');
      this.chips[1].sub.setText('EXTREME 전용');
    }
  }

  /** 특수똥 4종 개수 — 이번 판에 주운 것 */
  private specials(y: number) {
    const { scene, cx } = this;
    const gap = 66, x0 = cx - gap * 1.5 - 10;
    SPECIALS.forEach(([k, key], i) => {
      const x = x0 + i * gap;
      if (scene.textures.exists(key)) scene.add.image(x, y, key).setDisplaySize(20, 20).setDepth(DEPTH + 3);
      scene.add.text(x + 12, y + 4, `×${this.info.collected[k]}`, {
        fontSize: '12px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5).setDepth(DEPTH + 3);
    });
  }

  // ── 버튼 ────────────────────────────────────────────────────────────

  /** 다시 하기 — 초록 판 + (PC) Space 키캡. 스페이스 재시작은 GameScene 이 그대로 받는다 */
  private retryButton(y: number, w: number, h: number) {
    const { scene, cx } = this;
    const box = scene.add.container(cx, y).setDepth(DEPTH + 5);
    const skin = bakeButton(scene, `go_retry_${w}x${h}`, {
      w, h, radius: 22, top: '#8dff7a', bottom: '#16a83a', border: '#0a3a14', borderW: 3, lip: '#0d6a24', lipH: 7, gloss: 0,
      glow: 'rgba(120,255,120,0.6)',
    });
    box.add(scene.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
    box.add(scene.add.text(this.info.desktop ? -30 : 0, -2, '다시 하기', {
      fontSize: h > 70 ? '32px' : '28px', color: '#ffffff', fontStyle: 'bold', stroke: '#0a3a14', strokeThickness: 8,
    }).setOrigin(0.5));
    if (this.info.desktop) {
      const kx = w / 2 - 62;
      const key = scene.add.graphics();
      key.fillStyle(0xffffff, 0.92).fillRoundedRect(kx - 37, -15, 74, 30, 15);
      key.lineStyle(2, 0x0a3a14).strokeRoundedRect(kx - 37, -15, 74, 30, 15);
      box.add([key, scene.add.text(kx, 0, 'Space', { fontSize: '15px', color: '#0a3a14', fontStyle: 'bold' }).setOrigin(0.5)]);
    }
    wireButton(scene, box, w, h, () => this.handlers.onRetry());
  }

  private menuButton(x: number, y: number, w: number, h: number, label: string, px: number): Phaser.GameObjects.Container {
    const { scene } = this;
    const box = scene.add.container(x, y).setDepth(DEPTH + 5);
    const skin = bakeButton(scene, `go_menu_${w}x${h}`, {
      w, h, radius: Math.min(16, h / 2), top: '#f4f7fb', bottom: '#b8c2cf', border: '#2a3340', borderW: 2.5,
      lip: '#7a8594', lipH: 4, gloss: 0,
    });
    box.add(scene.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
    box.add(scene.add.text(0, 0, label, { fontSize: `${px}px`, color: '#2a3340', fontStyle: 'bold' }).setOrigin(0.5));
    wireButton(scene, box, w, h, () => this.handlers.onMenu());
    return box;
  }

  // ── 이니셜 입력 (신기록) ─────────────────────────────────────────────

  /**
   * 이니셜 3자 + 랭킹 등록. 입력칸은 HTML input (모바일 키보드) — 캔버스 위치·배율에 맞춰 띄운다.
   * 규칙은 예전과 같다: 영어 대문자 3자, 저장된 이니셜이 있으면 미리 채움, Enter 로도 등록
   */
  private buildInitialsRow(y: number) {
    const { scene, cx } = this;
    const fieldW = 126, btnW = 112;
    const x0 = cx - (fieldW + 10 + btnW) / 2;

    const label = scene.add.text(cx, y - 36, '이니셜 입력 (영어 대문자 3자)', {
      fontSize: '13px', color: '#ffffff', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH + 3);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 3;
    input.placeholder = 'ABC';
    input.autocapitalize = 'characters';
    const rect = scene.game.canvas.getBoundingClientRect();
    const sx = rect.width / this.W, sy = rect.height / this.H;
    input.style.cssText = `
      position: fixed; left: ${rect.left + x0 * sx}px; top: ${rect.top + (y - 22) * sy}px;
      width: ${Math.round(fieldW * sx)}px; height: ${Math.round(44 * sy)}px;
      font-size: ${Math.round(24 * sy)}px; text-align: center; text-transform: uppercase;
      letter-spacing: ${Math.round(14 * sx)}px; padding-left: ${Math.round(14 * sx)}px;
      border: ${Math.max(2, Math.round(2.5 * sy))}px solid #FFD700; border-radius: 8px;
      background: #000; color: #fff; font-weight: bold; outline: none; box-sizing: border-box; z-index: 9999;
    `;
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.trySubmit(); });
    document.body.appendChild(input);
    this.input = input;

    const bx = x0 + fieldW + 10 + btnW / 2;
    const box = scene.add.container(bx, y).setDepth(DEPTH + 5);
    const skin = bakeButton(scene, 'go_submit', {
      w: btnW, h: 44, radius: 14, top: '#7dff9a', bottom: '#1fae4a', border: '#0a3a18', borderW: 3, lip: '#0f6a2c', lipH: 5, gloss: 0,
    });
    box.add(scene.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
    box.add(scene.add.text(0, 0, '랭킹 등록', { fontSize: '17px', color: '#ffffff', fontStyle: 'bold', stroke: '#0a3a18', strokeThickness: 5 }).setOrigin(0.5));
    wireButton(scene, box, btnW, 44, () => this.trySubmit(), true);

    this.initialsRow = [label, box];
  }

  /** 저장된 이니셜로 채우고 입력칸에 초점 */
  prefillInitials(initials: string | null) {
    if (!this.input) return;
    if (initials) this.input.value = initials;
    this.input.focus();
  }

  private trySubmit() {
    if (!this.input || this.submitting) return;
    const initials = this.input.value.trim().toUpperCase();
    const err = initials.length !== 3 ? '정확히 3글자를 입력하세요' : !/^[A-Z]{3}$/.test(initials) ? '영어 대문자만 입력하세요' : null;
    this.initialsError?.destroy();
    this.initialsError = null;
    if (err) {
      this.initialsError = this.scene.add.text(this.cx, this.H - 126 + 18, err, {
        fontSize: '13px', color: '#ff5a4a', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(DEPTH + 6);
      return;
    }
    this.submitting = true;
    this.removeInput();
    this.initialsRow.forEach(o => o.destroy());
    this.initialsRow = [this.scene.add.text(this.cx, this.H - 90, '랭킹 등록 중…', {
      fontSize: '16px', color: '#ffe08a', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH + 3)];
    this.handlers.onSubmitInitials(initials);
  }

  /**
   * 등록 결과 — 이니셜 줄 자리에 결과 한 줄 + 오른쪽에 '메인 메뉴' 알약 (실패여도 같다).
   * 왼쪽 위 '메뉴' 는 없앤다 — 일반 화면과 같은 아래쪽 동선 (다시 하기 바로 위)
   */
  showRegistered(text: string, ok: boolean) {
    const { W, H } = this;
    this.initialsRow.forEach(o => o.destroy());
    this.topMenu?.destroy();
    this.topMenu = null;
    const menuW = 120, menuX = W - 30 - menuW / 2;
    const textX = (20 + (menuX - menuW / 2 - 10)) / 2;   // 왼쪽 끝 ~ 알약 왼쪽 사이 가운데
    this.initialsRow = [
      this.scene.add.text(textX, H - 90, text, {
        fontSize: '16px', color: ok ? '#7dff9a' : '#ff5a4a', fontStyle: 'bold', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(DEPTH + 3),
      this.menuButton(menuX, H - 90, menuW, 44, '메인 메뉴', 16),
    ];
  }

  // ── 값 갈아 끼우기 ───────────────────────────────────────────────────

  /** 순위 칩 — after 가 지금 순위, before 는 게임 시작 때 순위 (변화 ▲N/▼N) */
  setRank(kind: 'all' | 'char', after: RankValue, before?: RankValue, note?: string) {
    const chip = this.chips[kind === 'all' ? 0 : 1];
    if (!chip || !chip.value.active) return;
    chip.value.setText(typeof after === 'number' ? `${after}위` : '-');
    let sub = note ?? '', color = '#c9c9d6';
    if (!note) {
      if (after === null) sub = '기록 없음';
      else if (typeof after === 'number') {
        if (before === null) { sub = 'NEW'; color = '#7dff9a'; }
        else if (typeof before === 'number' && after < before) { sub = `▲${before - after}`; color = '#3ddb7a'; }
        else if (typeof before === 'number' && after > before) { sub = `▼${after - before}`; color = '#ff6a5a'; }
        else if (typeof before === 'number') sub = '–';
      }
    }
    chip.sub.setText(sub).setColor(color);
  }

  /** SKOR 칩 — '정산 중' → 낙관 값 → 서버 값 순서로 같은 자리에서 바뀐다 */
  setSkor(value: string, sub: string, subColor = '#7dff9a') {
    const chip = this.chips[2];
    if (!chip || !chip.value.active) return;
    chip.value.setText(value);
    chip.sub.setText(sub).setColor(subColor);
  }

  private removeInput() {
    if (this.input && this.input.parentNode) this.input.parentNode.removeChild(this.input);
    this.input = null;
  }

  /**
   * 씬을 떠날 때 — HTML 입력칸과 크롭 텍스처를 치운다. 메인 메뉴 · 다시 하기 · shutdown 에서 부른다 (두 번 불러도 된다).
   *
   * **이미지를 먼저 부수고 텍스처를 지운다.** 버튼은 프레임 안(입력 처리)에서 불리고 씬 전환은 다음 단계에야
   * 일어나서, 그 사이 같은 프레임의 렌더가 한 번 더 돈다. 텍스처만 지우면 화면에 남은 이미지가 사라진 텍스처를 그리려다
   * 'glTexture' null 로 렌더러가 터지고 게임 루프가 멈춘다 — 메인 메뉴 · 다시 하기가 안 넘어가던 원인 (2026-10-07).
   * 스페이스 재시작만 됐던 건 키 이벤트가 프레임 밖에서 와서 전환이 렌더보다 먼저 처리됐기 때문
   */
  destroy() {
    this.dead = true;
    this.removeInput();
    this.artImage?.destroy();
    this.artImage = null;
    if (this.scene.textures.exists(ART_KEY)) this.scene.textures.remove(ART_KEY);
  }
}
