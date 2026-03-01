import Phaser from 'phaser';
import { gachaPull, type PulledCharacter } from '../utils/gacha';
import { CHARACTERS, getCharacterDef, addOwnedCharacter, type CharacterDef } from '../utils/character';
import { getSkorBalance } from '../utils/skor';

// vids/ 디렉토리에 개인 영상이 존재하는 캐릭터 목록
const CHARS_WITH_VIDS = new Set([
  'chibi', 'hacker', 'miner', 'maehwa', 'archieve', 'glitch', 'noise', 'sentinel', 'legacy',
]);

const GRADE_COLORS: Record<string, number> = {
  UR: 0xffaa00,
  SR: 0x4488ff,
  R:  0x44bb44,
  N:  0xaaaaaa,
  '등급외': 0xcccccc,
};

export default class GachaScene extends Phaser.Scene {
  private skorBalance = 0;
  private remainingSkor = 0;
  private pullResults: PulledCharacter[] = [];
  private revealIndex = 0;
  private terminalTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('GachaScene');
  }

  preload() {
    // 공통 연출 영상 (항상 필요)
    if (!this.cache.video.exists('gatcha_green')) {
      this.load.video('gatcha_green', 'assets/vids/gatcha_green.mp4');
    }
    if (!this.cache.video.exists('gatcha_red')) {
      this.load.video('gatcha_red', 'assets/vids/gatcha_red.mp4');
    }
    // 캐릭터 픽셀 이미지 (작은 webp, 전부 사전 로드)
    for (const c of CHARACTERS) {
      if (!this.textures.exists(c.imageKey)) {
        this.load.image(c.imageKey, c.imagePath);
      }
    }
  }

  create() {
    this.pullResults = [];
    this.revealIndex = 0;
    this.buildLobby();
  }

  // ═══════════════════════════════════════════════════
  // LOBBY
  // ═══════════════════════════════════════════════════

  private async buildLobby() {
    this.clearUI();
    this.add.rectangle(200, 300, 400, 600, 0x060612);
    this.drawTerminalChrome();

    this.skorBalance = await getSkorBalance();
    if (!this.scene.isActive()) return;

    await this.typeLines([
      '> KRYPT-DB  v0.9.1',
      '> AUTH: OK',
      `> SKOR: ${Math.floor(this.skorBalance)}`,
      '> STATUS: READY',
    ], 35);

    this.buildPullButtons();
  }

  private drawTerminalChrome() {
    // 터미널 패널 배경
    this.add.rectangle(200, 163, 370, 288, 0x000000)
      .setStrokeStyle(1, 0x00ff41, 0.5);
    // 타이틀 바
    this.add.text(26, 18, '● ● ●', { fontSize: '11px', color: '#00ff41' });
    this.add.text(200, 19, 'root@krypt — entity_summon', {
      fontSize: '11px', color: '#00cc33', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  private buildPullButtons() {
    this.addPullButton(200, 380, '1회 호출', '100 SKOR', 'single');
    this.addPullButton(200, 458, '10회 호출', '900 SKOR  ·  10% SAVE', 'multi');

    const back = this.add.text(200, 555, '← 돌아가기', {
      fontSize: '15px', color: '#444444', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#888888'));
    back.on('pointerout',  () => back.setColor('#444444'));
    back.on('pointerdown', () => this.scene.start('ModeSelectScene'));
  }

  private addPullButton(x: number, y: number, label: string, cost: string, type: 'single' | 'multi') {
    const btn = this.add.rectangle(x, y, 300, 58, 0x080818)
      .setStrokeStyle(1, 0x00ff41, 0.7)
      .setInteractive({ useHandCursor: true });

    this.add.text(x, y - 10, label, {
      fontSize: '20px', color: '#00ff41', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add.text(x, y + 12, cost, {
      fontSize: '12px', color: '#337733', fontFamily: 'monospace',
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x081808));
    btn.on('pointerout',  () => btn.setFillStyle(0x080818));
    btn.on('pointerdown', () => this.startPull(type));
  }

  // ═══════════════════════════════════════════════════
  // PULL FLOW
  // ═══════════════════════════════════════════════════

  private async startPull(type: 'single' | 'multi') {
    const cost = type === 'multi' ? 900 : 100;
    if (this.skorBalance < cost) {
      await this.typeLines([
        `> ERR: INSUFFICIENT SKOR`,
        `> HAVE ${Math.floor(this.skorBalance)} / NEED ${cost}`,
      ], 30);
      return;
    }

    this.clearUI();
    this.add.rectangle(200, 300, 400, 600, 0x000000);
    this.drawTerminalChrome();

    const count = type === 'multi' ? 10 : 1;

    try {
      // 터미널 애니메이션과 서버 호출을 병렬로 실행
      const [result] = await Promise.all([
        gachaPull(type),
        this.runTerminalAnimation(count),
      ]);

      if (!this.scene.isActive()) return;

      this.pullResults = result.characters;
      this.remainingSkor = result.remainingSkor;

      // 신규 캐릭터 localStorage 동기화
      result.characters.filter(c => c.isNew).forEach(c => addOwnedCharacter(c.id));

      // 캐릭터별 개인 영상 동적 로드
      await this.loadCharVideos(result.characters.map(c => c.id));

      await this.playCommonVideo(result.video);

      this.revealIndex = 0;
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

  private async runTerminalAnimation(count: number): Promise<void> {
    await this.typeLines([
      `> EXECUTE entity_summon(n=${count})`,
      '> Establishing connection...',
    ], 42);
    await this.progressBar(700);
    await this.typeLines([
      '> CONN: OK  [sec-layer bypassed]',
      '> Scanning entity pool...',
    ], 40);
    await this.progressBar(600);
    await this.typeLines([
      '> Anomaly detected in sector 7',
      '> Overriding...',
    ], 42);
    await this.progressBar(800);
    await this.typeLines([
      `> ${count} ENTR${count > 1 ? 'IES' : 'Y'} LOCKED`,
      '> EXTRACTING . . .',
    ], 48);
    await this.sleep(400);
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

  private playCommonVideo(videoType: 'green' | 'red'): Promise<void> {
    return new Promise(resolve => {
      this.clearUI();
      this.add.rectangle(200, 300, 400, 600, 0x000000);

      const key = videoType === 'red' ? 'gatcha_red' : 'gatcha_green';
      if (!this.cache.video.exists(key)) { resolve(); return; }

      const vid = this.add.video(200, 300, key);
      vid.setDisplaySize(400, 600);
      vid.play(false);
      vid.on('complete', () => { vid.destroy(); resolve(); });
      this.time.delayedCall(12000, resolve); // 12초 failsafe
    });
  }

  // ═══════════════════════════════════════════════════
  // CHARACTER REVEAL
  // ═══════════════════════════════════════════════════

  private showNextReveal() {
    if (this.revealIndex >= this.pullResults.length) {
      this.showSummary();
      return;
    }

    const pulled = this.pullResults[this.revealIndex];
    const def = getCharacterDef(pulled.id);

    this.clearUI();
    this.add.rectangle(200, 300, 400, 600, 0x000000);

    const vidKey = `vid_${pulled.id}`;
    if (this.cache.video.exists(vidKey)) {
      const vid = this.add.video(200, 300, vidKey);
      vid.setDisplaySize(400, 600);
      vid.play(false);

      let proceeded = false;
      const proceed = () => {
        if (proceeded) return;
        proceeded = true;
        this.input.off('pointerdown', proceed);
        if (vid.active) vid.destroy();
        this.showRevealCard(pulled, def);
      };

      vid.on('complete', proceed);
      this.time.delayedCall(10000, proceed); // failsafe
      this.input.once('pointerdown', proceed); // 탭으로 스킵
    } else {
      this.showRevealCard(pulled, def);
    }
  }

  private showRevealCard(pulled: PulledCharacter, def: CharacterDef) {
    const gColor = GRADE_COLORS[pulled.grade] ?? 0xffffff;

    // 배경 글로우
    const glow = this.add.circle(200, 255, 150, gColor, 0.07).setAlpha(0);
    this.tweens.add({
      targets: glow, alpha: 0.12,
      scaleX: { from: 0.3, to: 1.15 }, scaleY: { from: 0.3, to: 1.15 },
      duration: 600, ease: 'Back.easeOut',
    });

    // 캐릭터 이미지
    const img = this.add.image(200, 240, def.imageKey).setAlpha(0);
    img.setDisplaySize(165, 205);
    this.tweens.add({
      targets: img, alpha: 1, y: { from: 268, to: 240 },
      duration: 500, ease: 'Back.easeOut', delay: 150,
    });

    // 등급 라벨
    const gradeText = this.add.text(200, 388, pulled.grade, {
      fontSize: '18px', color: def.gradeColor, fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, fontFamily: 'monospace',
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: gradeText, alpha: 1, duration: 300, delay: 400 });

    // 캐릭터 이름
    const nameText = this.add.text(200, 424, def.name, {
      fontSize: '34px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({
      targets: nameText, alpha: 1, y: { from: 442, to: 424 },
      duration: 400, ease: 'Back.easeOut', delay: 500,
    });

    // NEW! 배지
    if (pulled.isNew) {
      const badge = this.add.text(325, 145, ' NEW! ', {
        fontSize: '15px', color: '#ffff00', fontStyle: 'bold',
        backgroundColor: '#cc0000', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setAlpha(0).setScale(0);
      this.tweens.add({
        targets: badge, alpha: 1, scaleX: 1, scaleY: 1,
        duration: 300, ease: 'Back.easeOut', delay: 650,
      });
    }

    // 탭 안내
    const isLast = this.revealIndex >= this.pullResults.length - 1;
    const hint = isLast
      ? 'TAP → RESULTS'
      : `TAP → NEXT  (${this.revealIndex + 1}/${this.pullResults.length})`;
    const tapHint = this.add.text(200, 562, hint, {
      fontSize: '13px', color: '#555555', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.tweens.add({
      targets: tapHint, alpha: { from: 0.3, to: 1 }, duration: 600, yoyo: true, repeat: -1,
    });

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
        this.revealIndex++;
        this.showNextReveal();
      };

      this.input.on('pointerdown', advance);

      // 10뽑기는 3.5초 자동 진행
      if (this.pullResults.length > 1) {
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
    this.add.rectangle(200, 300, 400, 600, 0x060612);

    this.add.text(200, 38, '[ EXTRACTION COMPLETE ]', {
      fontSize: '17px', color: '#00ff41', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 결과 카드 그리드
    const total = this.pullResults.length;
    const cols = Math.min(total, 5);
    const cardW = 64, cardH = 84, gapX = 8, gapY = 12;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (400 - totalW) / 2 + cardW / 2;
    const startY = total > 5 ? 130 : 175;

    this.pullResults.forEach((pulled, i) => {
      const def = getCharacterDef(pulled.id);
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      const gColorInt = parseInt(def.gradeColor.replace('#', ''), 16);

      const bg  = this.add.rectangle(x, y, cardW, cardH, 0x111122).setStrokeStyle(1, gColorInt).setAlpha(0);
      const img = this.add.image(x, y - 8, def.imageKey).setDisplaySize(cardW - 8, cardH - 22).setAlpha(0);
      const nm  = this.add.text(x, y + cardH / 2 - 10, def.name, { fontSize: '9px', color: '#cccccc' }).setOrigin(0.5).setAlpha(0);

      if (pulled.isNew) {
        this.add.text(x + cardW / 2, y - cardH / 2 + 2, 'NEW', {
          fontSize: '8px', color: '#ffff00', backgroundColor: '#aa0000', padding: { x: 2, y: 1 },
        }).setOrigin(1, 0).setAlpha(0);
      }

      this.tweens.add({ targets: [bg, img, nm], alpha: 1, duration: 200, delay: i * 60 });
    });

    // 잔여 SKOR
    const skorY = total > 5 ? 350 : 340;
    this.add.text(200, skorY, `> 잔여 SKOR: ${Math.floor(this.remainingSkor)}`, {
      fontSize: '14px', color: '#337733', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 한 번 더 / 메인으로 버튼
    const againBtn = this.add.rectangle(200, 445, 260, 52, 0x080818)
      .setStrokeStyle(1, 0x00ff41).setInteractive({ useHandCursor: true });
    this.add.text(200, 445, '> 한 번 더', {
      fontSize: '19px', color: '#00ff41', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);
    againBtn.on('pointerover', () => againBtn.setFillStyle(0x081808));
    againBtn.on('pointerout',  () => againBtn.setFillStyle(0x080818));
    againBtn.on('pointerdown', () => this.buildLobby());

    const mainBtn = this.add.rectangle(200, 525, 260, 52, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444).setInteractive({ useHandCursor: true });
    this.add.text(200, 525, '← 메인으로', {
      fontSize: '19px', color: '#888888', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);
    mainBtn.on('pointerover', () => mainBtn.setFillStyle(0x282828));
    mainBtn.on('pointerout',  () => mainBtn.setFillStyle(0x1a1a1a));
    mainBtn.on('pointerdown', () => this.scene.start('ModeSelectScene'));
  }

  // ═══════════════════════════════════════════════════
  // 터미널 헬퍼
  // ═══════════════════════════════════════════════════

  private clearUI() {
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.input.off('pointerdown');
    this.children.getAll().forEach(c => c.destroy());
    this.terminalTexts = [];
  }

  private typeLines(lines: string[], delay = 40): Promise<void> {
    return lines.reduce(
      (p, line) => p.then(() => this.typeLine(line, delay)),
      Promise.resolve()
    );
  }

  private typeLine(text: string, charDelay = 40): Promise<void> {
    return new Promise(resolve => {
      if (!this.scene.isActive()) { resolve(); return; }

      // 최대 9줄 유지 (스크롤 효과)
      if (this.terminalTexts.length >= 9) {
        this.terminalTexts.shift()?.destroy();
        this.terminalTexts.forEach((t, i) => t.setY(42 + i * 26));
      }

      const y = 42 + this.terminalTexts.length * 26;
      const t = this.add.text(24, y, '', {
        fontSize: '13px', color: '#00ff41', fontFamily: 'monospace',
      });
      this.terminalTexts.push(t);

      let i = 0;
      const ev = this.time.addEvent({
        delay: charDelay,
        repeat: text.length,
        callback: () => {
          if (!this.scene.isActive()) { ev.destroy(); resolve(); return; }
          t.setText(text.substring(0, i + 1));
          i++;
          if (i > text.length) { ev.destroy(); resolve(); }
        },
      });
    });
  }

  private progressBar(duration: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.scene.isActive()) { resolve(); return; }

      if (this.terminalTexts.length >= 9) {
        this.terminalTexts.shift()?.destroy();
        this.terminalTexts.forEach((t, i) => t.setY(42 + i * 26));
      }

      const y = 42 + this.terminalTexts.length * 26;
      const bar = this.add.text(24, y, '> [          ]  0%', {
        fontSize: '13px', color: '#00ff41', fontFamily: 'monospace',
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
          if (step >= steps) { ev.destroy(); resolve(); }
        },
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.scene.isActive()) { resolve(); return; }
      this.time.delayedCall(ms, resolve);
    });
  }
}
