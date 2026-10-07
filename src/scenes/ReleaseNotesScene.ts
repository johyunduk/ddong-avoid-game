import Phaser from 'phaser';
import { RELEASE_NOTES, type ReleaseNote, type ReleaseTag } from '../data/releaseNotes';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { textContentHeight } from '../utils/textSafety';
import { bakeButton, bakeRoundedImage, clipToViewport, gradientText, wireButton } from '../utils/buttonSkin';
import { getCharacterDef, getGradeColorInt } from '../utils/character';

/**
 * 릴리스 노트 (A안) — 최신 버전은 펼친 큰 카드(그 버전 캐릭터 배너 · NEW · 분류 칩 · 줄), 지난 버전은 접힌 한 줄.
 * 접힌 줄을 누르면 그 아래로 펼친다. 펼칠 때만 내용을 만들고, 접으면 지운다.
 * 시안: ddong-fx-work/release-notes/A_*.png
 *
 * 스크롤은 장면 전체 드래그 · 휠. 칸(접힌 줄 · 더보기)은 **떼는 순간** 손가락이 거의 안 움직였을 때만 눌린 것으로 친다 —
 * 누르는 순간 반응하면 목록을 끌려고 댄 손가락이 칸을 펼쳐 버린다
 */

const CHIP: Record<ReleaseTag, [number, string]> = {
  '새 캐릭터': [0xb36bff, '#ffffff'],
  '개선': [0x2fbf71, '#ffffff'],
  '수정': [0xe8463a, '#ffffff'],
  '밸런스': [0xff9f1a, '#3a1a00'],
  '안내': [0x6a7a90, '#ffffff'],
};
/** 최신 카드에 처음부터 보이는 줄 수 — 나머지는 '더보기' */
const LATEST_LINES = 7;
/** 이만큼 넘게 움직이면 드래그 — 칸을 누른 것으로 치지 않는다 */
const TAP_SLOP = 8;
const LINE_FONT = 13;

interface Block {
  box: Phaser.GameObjects.Container;
  h: number;
}

export default class ReleaseNotesScene extends BaseScene {
  private list!: Phaser.GameObjects.Container;
  private blocks: Block[] = [];
  private viewport!: Phaser.Geom.Rectangle;
  private scrollY = 0;
  private maxScrollY = 0;
  private dragging = false;
  private dragMoved = false;
  private dragStartY = 0;
  private dragStartScrollY = 0;
  private pressed: Phaser.GameObjects.GameObject | null = null;
  private latestExpanded = false;
  private openVersions = new Set<string>();
  private thumb!: Phaser.GameObjects.Rectangle;
  private track!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('ReleaseNotesScene');
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    // 최신 버전 배너 + 모든 버전의 캐릭터 얼굴 — ui/collection 썸네일만 쓴다 (일러스트 원본은 올리지 않는다)
    for (const id of RELEASE_NOTES[0]?.characters ?? []) {
      if (!this.textures.exists(`rn_banner_${id}`)) this.load.image(`rn_banner_${id}`, `assets/ui/collection/banner/${id}.webp`);
    }
    for (const id of new Set(RELEASE_NOTES.flatMap(n => n.characters))) {
      if (!this.textures.exists(`rn_face_${id}`)) this.load.image(`rn_face_${id}`, `assets/ui/collection/face/${id}.webp`);
    }
  }

  create() {
    super.create();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const top = 76, bottom = H - 10;

    this.scrollY = 0;
    this.maxScrollY = 0;
    this.dragging = false;
    this.dragMoved = false;
    this.pressed = null;
    this.blocks = [];
    this.latestExpanded = false;
    this.openVersions = new Set();
    this.viewport = new Phaser.Geom.Rectangle(0, top, W, bottom - top);

    addBackground(this, 'background2', W, H);
    this.add.rectangle(cx, H / 2, W, H, 0x0a0616, 0.69);

    // 목록 — 마스크 안에서 움직인다
    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillRect(0, top, W, bottom - top);
    this.events.once('shutdown', () => maskShape.destroy());
    this.list = this.add.container(0, top);
    this.list.setMask(maskShape.createGeometryMask());

    this.blocks.push(this.buildLatest());
    for (const note of RELEASE_NOTES.slice(1)) this.blocks.push(this.buildOlder(note));

    // 스크롤 막대
    this.track = this.add.rectangle(W - 6, (top + bottom) / 2, 4, bottom - top - 8, 0xffffff, 0.16).setDepth(10);
    this.thumb = this.add.rectangle(W - 6, top + 4, 4, 30, 0xffd34d, 0.86).setOrigin(0.5, 0).setDepth(10);

    this.relayout();
    this.setupScrollInput();
    this.createHeader(cx);
  }

  // ── 머리 ──────────────────────────────────────────────────────────────

  private createHeader(cx: number) {
    const pw = Math.min(230, this.scale.width - 150);
    const plank = bakeButton(this, `rn_plank_${pw}`, {
      w: pw, h: 52, radius: 16, top: '#c98a4a', bottom: '#8a5226', border: '#3a1f0a', borderW: 3,
      lip: '#5b3416', lipH: 5, gloss: 0,
    });
    this.add.image(cx, 38, plank.key).setOrigin(0.5, plank.originY).setDepth(10);
    const title = this.add.text(cx, 37, '릴리즈 노트', {
      fontSize: '24px', fontStyle: 'bold', stroke: '#3a1f0a', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);
    gradientText(title, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);

    // 뒤로가기 — 왼쪽 위 둥근 버튼
    const back = this.add.container(34, 38).setDepth(11);
    const skin = bakeButton(this, 'rn_back', {
      w: 44, h: 44, radius: 22, top: '#ffffff', bottom: '#dfe6ee', border: '#2a3340', borderW: 3,
      lip: '#9aa6b5', lipH: 4, gloss: 0,
    });
    back.add(this.add.image(0, 0, 'rn_back').setOrigin(0.5, skin.originY));
    back.add(this.add.text(0, -1, '←', { fontSize: '24px', color: '#2a3340', fontStyle: 'bold' }).setOrigin(0.5));
    wireButton(this, back, 44, 44, () => this.scene.start('ModeSelectScene'));
  }

  // ── 최신 버전 — 펼친 큰 카드 ─────────────────────────────────────────

  private buildLatest(): Block {
    const note = RELEASE_NOTES[0];
    const W = this.scale.width;
    const cw = W - 24;
    const box = this.add.container(12, 0);
    this.list.add(box);

    const chars = note.characters.filter(id => this.textures.exists(`rn_banner_${id}`)).slice(0, 2);
    let y = 10;
    if (chars.length) {
      const bw = (cw - 6 * (chars.length + 1)) / chars.length;
      chars.forEach((id, i) => {
        const bx = 6 + i * (bw + 6);
        const key = bakeRoundedImage(this, `rn_bannerR_${id}_${Math.round(bw)}`, `rn_banner_${id}`, bw, 92, 12, 0.35);
        box.add(this.add.image(bx, y, key).setOrigin(0).setDisplaySize(bw, 92));
        const def = getCharacterDef(id);
        const label = this.add.text(0, 0, `${def.grade} ${def.name}`, { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
        const lw = label.width + 22;
        const px = bx + 8 + lw / 2, py = y + 78;
        box.add(this.add.graphics()
          .fillStyle(0x0a0616, 0.82).fillRoundedRect(px - lw / 2, py - 11, lw, 22, 11)
          .lineStyle(1.5, getGradeColorInt(def)).strokeRoundedRect(px - lw / 2, py - 11, lw, 22, 11));
        box.add(label.setPosition(px, py));
      });
      y += 92 + 20;
    } else {
      y += 16;
    }

    const ver = this.add.text(16, y, note.version, { fontSize: '24px', fontStyle: 'bold', stroke: '#2a0a4a', strokeThickness: 3 }).setOrigin(0, 0.5);
    gradientText(ver, [[0, '#fff7c2'], [1, '#ffb01a']]);
    const nx = 16 + ver.width + 30;
    box.add([ver, this.add.graphics().fillStyle(0xff3b2f).fillRoundedRect(nx - 23, y - 11, 46, 22, 11)
      .lineStyle(1.5, 0x5a0a00).strokeRoundedRect(nx - 23, y - 11, 46, 22, 11),
    this.add.text(nx, y, 'NEW', { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5),
    this.add.text(cw - 16, y, note.date, { fontSize: '13px', color: '#d9c6f0', fontStyle: 'bold' }).setOrigin(1, 0.5)]);
    y += 20;

    // 줄 — 접혀 있으면 앞 LATEST_LINES 줄을 2줄로 자르고, 더보기를 누르면 전부 다 보인다
    const shown = this.latestExpanded ? note.changes : note.changes.slice(0, LATEST_LINES);
    for (const ch of shown) y += this.addChangeLine(box, 22, y, cw - 34, ch.tag, ch.text, this.latestExpanded ? 0 : 2);

    const rest = note.changes.length - LATEST_LINES;
    if (rest > 0) {
      y += 6;
      const more = this.add.container(cw / 2, y + 14);
      more.add(this.add.graphics().fillStyle(0xffffff, 0.12).fillRoundedRect(-75, -14, 150, 28, 14)
        .lineStyle(1, 0xffd34d).strokeRoundedRect(-75, -14, 150, 28, 14));
      more.add(this.add.text(-8, 0, this.latestExpanded ? '접기' : `더보기 · ${rest}줄`, { fontSize: '12px', color: '#ffe08a', fontStyle: 'bold' }).setOrigin(0.5));
      more.add(this.chevron(50, 0, 5, this.latestExpanded ? -90 : 90));
      this.makeTappable(more, 150, 44, () => {
        this.latestExpanded = !this.latestExpanded;
        this.rebuildLatest();
      });
      box.add(more);
      y += 28;
    }
    y = Math.round(y + 18);

    const skin = bakeButton(this, `rn_latest_${cw}x${y}`, {
      w: cw, h: y, radius: 18, top: '#3a1478', bottom: '#120626', border: '#ffd34d', borderW: 3,
      lip: '#5a1e9c', lipH: 6, gloss: 0, glow: 'rgba(255,200,90,0.63)',
    });
    box.addAt(this.add.image(cw / 2, y / 2, skin.key).setOrigin(0.5, skin.originY), 0);
    return { box, h: y + 6 };
  }

  private rebuildLatest() {
    const old = this.blocks[0];
    const keepScroll = this.scrollY;
    old.box.destroy();
    this.blocks[0] = this.buildLatest();
    this.relayout(keepScroll);
  }

  // ── 지난 버전 — 접힌 한 줄, 누르면 아래로 펼친다 ────────────────────

  private buildOlder(note: ReleaseNote): Block {
    const W = this.scale.width;
    const cw = W - 24, rh = 58;
    const open = this.openVersions.has(note.version);
    const box = this.add.container(12, 0);
    this.list.add(box);

    const row = this.add.container(cw / 2, rh / 2);
    const skin = bakeButton(this, `rn_row_${cw}${open ? '_open' : ''}`, {
      w: cw, h: rh, radius: 14, top: '#2a1a4a', bottom: '#160c2a', border: open ? '#ffd34d' : '#6a4a9a', borderW: 2,
      lip: '#0e0820', lipH: 4, gloss: 0,
    });
    row.add(this.add.image(0, 0, skin.key).setOrigin(0.5, skin.originY));
    const L = -cw / 2;
    row.add(this.add.text(L + 14, -10, note.version, { fontSize: '17px', color: '#ffd34d', fontStyle: 'bold' }).setOrigin(0, 0.5));
    row.add(this.add.text(L + 14, 12, note.date, { fontSize: '11px', color: '#b9a3d6' }).setOrigin(0, 0.5));

    let x = L + 100;
    for (const id of note.characters.slice(0, 2)) {
      if (!this.textures.exists(`rn_face_${id}`)) continue;
      const key = bakeRoundedImage(this, `rn_faceR_${id}`, `rn_face_${id}`, 34, 34, 17);
      row.add(this.add.image(x + 17, 0, key).setDisplaySize(34, 34));
      row.add(this.add.circle(x + 17, 0, 17).setStrokeStyle(2, getGradeColorInt(getCharacterDef(id))));
      x += 38;
    }
    const summaryW = cw / 2 - 40 - (x + 6);
    const summary = this.add.text(x + 6, -8, '', { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
    summary.setText(this.fitOneLine(summary, note.changes[0]?.text ?? '', summaryW));
    row.add(summary);
    row.add(this.add.text(x + 6, 12, `${note.changes.length}줄`, { fontSize: '11px', color: '#9a8ab8' }).setOrigin(0, 0.5));
    row.add(this.chevron(cw / 2 - 20, 0, 7, open ? 90 : 0));
    this.makeTappable(row, cw, rh, () => this.toggleOlder(note));
    box.add(row);

    let h = rh;
    if (open) {
      // 펼친 내용 — 이때만 만든다
      let y = rh + 10;
      const body = this.add.container(0, 0);
      for (const ch of note.changes) y += this.addChangeLine(body, 14, y, cw - 26, ch.tag, ch.text, 0);
      y += 4;
      body.addAt(this.add.graphics().fillStyle(0x140c26, 0.92).fillRoundedRect(0, rh + 2, cw, y - rh - 2, 12)
        .lineStyle(1, 0x6a4a9a).strokeRoundedRect(0, rh + 2, cw, y - rh - 2, 12), 0);
      box.add(body);
      h = y;
    }
    return { box, h: h + 8 };
  }

  private toggleOlder(note: ReleaseNote) {
    const i = RELEASE_NOTES.indexOf(note);
    if (i < 1) return;
    if (this.openVersions.has(note.version)) this.openVersions.delete(note.version);
    else this.openVersions.add(note.version);
    const keepScroll = this.scrollY;
    this.blocks[i].box.destroy();
    this.blocks[i] = this.buildOlder(note);
    this.relayout(keepScroll);
  }

  // ── 공통 조각 ─────────────────────────────────────────────────────────

  /** 분류 칩 + 글. maxLines 가 0 이 아니면 그 줄 수로 자르고 '…'. 쓴 높이를 돌려준다 */
  private addChangeLine(box: Phaser.GameObjects.Container, x: number, y: number, maxW: number, tag: ReleaseTag, text: string, maxLines: number): number {
    const [bg, fg] = CHIP[tag];
    const chipLabel = this.add.text(0, 0, tag, { fontSize: '10px', color: fg, fontStyle: 'bold' }).setOrigin(0.5);
    const chipW = chipLabel.width + 12;
    const chipY = y + LINE_FONT * 0.65;
    box.add(this.add.graphics().fillStyle(bg).fillRoundedRect(x, chipY - 9, chipW, 18, 9));
    box.add(chipLabel.setPosition(x + chipW / 2, chipY));

    const tx = x + chipW + 6, tw = maxW - chipW - 6;
    const t = this.add.text(tx, y, '', {
      fontSize: `${LINE_FONT}px`, color: '#ffffff', lineSpacing: 3, wordWrap: { width: tw, useAdvancedWrap: true },
    });
    let lines = t.getWrappedText(text);
    if (maxLines > 0 && lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = this.fitOneLine(t, lines[maxLines - 1] + '…', tw, true);
    }
    t.setText(lines.join('\n'));
    box.add(t);
    return Math.max(textContentHeight(t), 18) + 8;
  }

  /** 한 줄에 들어가게 뒤를 자르고 '…' 를 붙인다 (force 면 이미 '…' 가 붙은 글이다) */
  private fitOneLine(t: Phaser.GameObjects.Text, s: string, maxW: number, force = false): string {
    const ww = t.style.wordWrapWidth, adv = t.style.wordWrapUseAdvanced;
    t.setWordWrapWidth(null);
    let out = s;
    t.setText(out);
    if (!force && t.width <= maxW) { t.setWordWrapWidth(ww, adv); return out; }
    let body = force ? s.slice(0, -1) : s;
    do {
      body = body.slice(0, -1);
      out = body.trimEnd() + '…';
      t.setText(out);
    } while (t.width > maxW && body.length > 1);
    t.setWordWrapWidth(ww, adv);
    return out;
  }

  /** '>' 꺾쇠 — angle 90 이면 아래를 본다 */
  private chevron(x: number, y: number, size: number, angle: number) {
    return this.add.graphics({ x, y }).lineStyle(2.5, 0xffd34d)
      .beginPath().moveTo(-size / 2, -size).lineTo(size / 2, 0).lineTo(-size / 2, size).strokePath()
      .setAngle(angle);
  }

  /**
   * 스크롤 칸 버튼 — 보이는 창 안에서만 눌리고(clipToViewport), 같은 칸에서 떼고 손가락이 거의 안 움직였을 때만 동작
   * w×h = 눌리는 크기 (컨테이너 가운데 기준)
   */
  private makeTappable(box: Phaser.GameObjects.Container, w: number, h: number, onTap: () => void) {
    box.setSize(w, h);
    box.setInteractive(clipToViewport(new Phaser.Geom.Rectangle(0, 0, w, h), this.viewport));
    box.on('pointerdown', () => { this.pressed = box; });
    box.on('pointerup', () => {
      if (this.pressed !== box || this.dragMoved) return;
      this.pressed = null;
      onTap();
    });
  }

  // ── 배치 · 스크롤 ─────────────────────────────────────────────────────

  private relayout(keepScroll = 0) {
    let y = 8;
    this.blocks.forEach((b, i) => {
      b.box.setY(y);
      y += b.h + (i === 0 ? 6 : 0);
    });
    const viewH = this.viewport.height;
    this.maxScrollY = Math.max(0, y + 12 - viewH);
    this.setScroll(keepScroll);
  }

  private setScroll(v: number) {
    this.scrollY = Phaser.Math.Clamp(v, 0, this.maxScrollY);
    this.list.y = this.viewport.y - this.scrollY;
    const viewH = this.viewport.height - 8;
    const contentH = this.maxScrollY + this.viewport.height;
    const th = Math.max(30, viewH * this.viewport.height / contentH);
    this.thumb.height = th;
    this.thumb.y = this.viewport.y + 4 + (this.maxScrollY ? (viewH - th) * this.scrollY / this.maxScrollY : 0);
    this.thumb.setVisible(this.maxScrollY > 0);
    this.track.setVisible(this.maxScrollY > 0);
  }

  private setupScrollInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragMoved = false;
      if (!this.viewport.contains(p.x, p.y)) return;
      this.dragging = true;
      this.dragStartY = p.y;
      this.dragStartScrollY = this.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const dy = this.dragStartY - p.y;
      if (Math.abs(dy) > TAP_SLOP) this.dragMoved = true;
      if (this.dragMoved) this.setScroll(this.dragStartScrollY + dy);
    });
    this.input.on('pointerup', () => {
      this.dragging = false;
      this.pressed = null;   // 칸의 pointerup 이 이것보다 먼저 처리된다
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      this.setScroll(this.scrollY + dy * 0.5);
    });
  }
}
