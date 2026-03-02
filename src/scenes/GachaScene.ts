import Phaser from 'phaser';
import { gachaPull, type PulledCharacter } from '../utils/gacha';
import { CHARACTERS, getCharacterDef, addOwnedCharacter, type CharacterDef } from '../utils/character';
import { getSkorBalance, getCachedSkorBalance, cacheSkorBalance } from '../utils/skor';

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

// 현재 픽업 배너 설정 — 출시 캐릭터 변경 시 characterId만 수정
const CURRENT_BANNER = {
  characterId: 'legacy',
  label: '신규 출시',
};

// 로비 슬라이드쇼 순서: UR 우선(sentinel → legacy), 이후 SR 순
const SLIDESHOW_IDS = ['sentinel', 'legacy', 'hacker', 'miner', 'maehwa', 'archieve', 'glitch', 'noise'];

export default class GachaScene extends Phaser.Scene {
  private skorBalance = 0;
  private remainingSkor = 0;
  private pullResults: PulledCharacter[] = [];
  private revealIndex = 0;
  private terminalTexts: Phaser.GameObjects.Text[] = [];
  private skipTerminal = false;

  // ── 로비 슬라이드쇼 상태 ──
  private slideshowIndex = 0;
  private slideshowIsA = true; // true → bgA가 현재 레이어
  private slideshowBgA: Phaser.GameObjects.Image | null = null;
  private slideshowBgB: Phaser.GameObjects.Image | null = null;
  private slideshowGradeText: Phaser.GameObjects.Text | null = null;
  private slideshowNameText: Phaser.GameObjects.Text | null = null;
  private slideshowBadgeBox: Phaser.GameObjects.Rectangle | null = null;
  private slideshowBadgeTxt: Phaser.GameObjects.Text | null = null;
  private slideshowActive = false;

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
    // 슬라이드쇼 캐릭터 일러스트 전체 사전 로드
    for (const id of SLIDESHOW_IDS) {
      const def = CHARACTERS.find(c => c.id === id);
      if (def && !this.textures.exists(def.illustKey)) {
        this.load.image(def.illustKey, def.illustPath);
      }
    }
    // 리빌 화면 공통 배경
    if (!this.textures.exists('gacha_background')) {
      this.load.image('gacha_background', 'assets/backgrounds/gacha_background.webp');
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
    this.slideshowActive = false;
    this.clearUI();

    this.slideshowIndex = 0;
    this.slideshowIsA = true;

    const currentDef = getCharacterDef(SLIDESHOW_IDS[0]);
    const gradeColorInt = parseInt(currentDef.gradeColor.replace('#', ''), 16);

    // ── 일러스트 배경 2레이어 (crossfade용) ──
    // bgA: 처음엔 현재 일러스트 (alpha=1), bgB: 다음 일러스트 대기 (alpha=0)
    this.slideshowBgA = this.add.image(200, 300, currentDef.illustKey).setDisplaySize(400, 600);
    this.slideshowBgB = this.add.image(200, 300, currentDef.illustKey).setDisplaySize(400, 600).setAlpha(0);

    // ── 하단 버튼 영역 그라데이션 ──
    const gradSteps = 14;
    for (let i = 0; i < gradSteps; i++) {
      this.add.rectangle(200, 600 - i * 22, 400, 22, 0x000000, (gradSteps - i) * 0.052);
    }

    // ── 상단: 배너 배지 (슬라이드마다 등급 색상 업데이트) ──
    this.slideshowBadgeBox = this.add.rectangle(200, 36, 140, 30, 0x000000, 0.75)
      .setStrokeStyle(1.5, gradeColorInt);
    this.slideshowBadgeTxt = this.add.text(200, 36, `✦  ${CURRENT_BANNER.label}  ✦`, {
      fontSize: '13px', color: currentDef.gradeColor, fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // ── 캐릭터 등급 + 이름 — SKOR 잔액(y=408) 바로 위, 겹침 없도록 배치 ──
    // grade(13px ≈ 16px high) y=344 → 336~352
    // name (28px ≈ 34px high) y=374 → 357~391
    // SKOR(15px)              y=408 → 399~417  (gap ≈ 8px)
    this.slideshowGradeText = this.add.text(200, 344, currentDef.grade, {
      fontSize: '13px', color: currentDef.gradeColor, fontStyle: 'bold',
      letterSpacing: 6, stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5);

    this.slideshowNameText = this.add.text(200, 374, currentDef.name, {
      fontSize: '28px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5);

    // ── SKOR 잔액 ──
    const cached = getCachedSkorBalance();
    const initialText = cached !== null ? `💰  ${cached} SKOR` : '💰  -- SKOR';
    const skorText = this.add.text(200, 408, initialText, {
      fontSize: '15px', color: '#aaaaaa',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    this.skorBalance = -1;

    // ── 뽑기 버튼 ──
    this.buildPullButtons(true);

    // ── 슬라이드쇼 타이머 (2초마다 자동 전환) ──
    this.slideshowActive = true;
    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: this.advanceSlide,
      callbackScope: this,
    });

    // 서버에서 최신 잔액 가져와 갱신
    this.skorBalance = await getSkorBalance();
    if (!this.scene.isActive()) return;
    cacheSkorBalance(this.skorBalance);
    skorText.setText(`💰  ${Math.floor(this.skorBalance)} SKOR`);
  }

  private advanceSlide() {
    if (!this.slideshowActive || !this.scene.isActive()) return;

    const nextIndex = (this.slideshowIndex + 1) % SLIDESHOW_IDS.length;
    const nextDef = getCharacterDef(SLIDESHOW_IDS[nextIndex]);

    // 현재/다음 레이어 결정
    const current  = this.slideshowIsA ? this.slideshowBgA : this.slideshowBgB;
    const incoming = this.slideshowIsA ? this.slideshowBgB : this.slideshowBgA;
    if (!current || !incoming) return;

    // 다음 일러스트를 incoming 레이어에 세팅
    incoming.setTexture(nextDef.illustKey).setAlpha(0);

    // 상태 + 텍스트를 일러스트 전환 시작과 동시에 즉시 교체
    this.slideshowIsA = !this.slideshowIsA;
    this.slideshowIndex = nextIndex;
    this.updateSlideshowText(nextDef);

    // crossfade: 현재 fade-out, 다음 fade-in
    this.tweens.add({ targets: current,  alpha: 0, duration: 600, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: incoming, alpha: 1, duration: 600, ease: 'Sine.easeInOut' });
  }

  private updateSlideshowText(def: ReturnType<typeof getCharacterDef>) {
    const gradeColorInt = parseInt(def.gradeColor.replace('#', ''), 16);

    // 배지 색상 즉시 교체
    this.slideshowBadgeBox?.setStrokeStyle(1.5, gradeColorInt);
    this.slideshowBadgeTxt?.setColor(def.gradeColor);

    // 등급·이름: 즉시 텍스트 교체 후 짧게 fade-in (150ms)
    if (this.slideshowGradeText?.active) {
      this.slideshowGradeText.setText(def.grade).setColor(def.gradeColor).setAlpha(0);
      this.tweens.add({ targets: this.slideshowGradeText, alpha: 1, duration: 150 });
    }
    if (this.slideshowNameText?.active) {
      this.slideshowNameText.setText(def.name).setAlpha(0);
      this.tweens.add({ targets: this.slideshowNameText, alpha: 1, duration: 150 });
    }
  }

  private drawTerminalChrome(isUR = false) {
    const borderColor = isUR ? 0xff3333 : 0x00ff41;
    const textColor   = isUR ? '#ff3333' : '#00ff41';
    const titleColor  = isUR ? '#cc0000' : '#00cc33';
    const title       = isUR ? 'root@krypt — [EMERGENCY OVERRIDE]' : 'root@krypt — entity_summon';

    this.add.rectangle(200, 342, 370, 172, 0x000000)
      .setStrokeStyle(1, borderColor, 0.8);
    this.add.text(26, 260, '● ● ●', { fontSize: '11px', color: textColor });
    this.add.text(200, 261, title, {
      fontSize: '11px', color: titleColor, fontFamily: 'monospace',
    }).setOrigin(0.5);
  }

  private buildPullButtons(_fromLobby = false) {
    this.addPullButton(200, 448, '1회 소환', '100 SKOR', 'single');
    this.addPullButton(200, 516, '10회 소환', '900 SKOR  ·  10% 절약', 'multi');

    const back = this.add.text(200, 572, '← 돌아가기', {
      fontSize: '14px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#cccccc'));
    back.on('pointerout',  () => back.setColor('#ffffff'));
    back.on('pointerdown', () => this.scene.start('ModeSelectScene'));
  }

  private addPullButton(x: number, y: number, label: string, cost: string, type: 'single' | 'multi') {
    const accentColor = type === 'single' ? 0xddaa00 : 0x7b2fff;
    const accentHex   = type === 'single' ? '#ddaa00' : '#aa88ff';

    const btn = this.add.rectangle(x, y, 310, 52, 0x000000, 0.72)
      .setStrokeStyle(1.5, accentColor)
      .setInteractive({ useHandCursor: true });

    this.add.text(x, y - 9, label, {
      fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(x, y + 13, cost, {
      fontSize: '12px', color: accentHex,
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setStrokeStyle(2.5, accentColor));
    btn.on('pointerout',  () => btn.setStrokeStyle(1.5, accentColor));
    btn.on('pointerdown', () => this.startPull(type));
  }

  // ═══════════════════════════════════════════════════
  // PULL FLOW
  // ═══════════════════════════════════════════════════

  private async startPull(type: 'single' | 'multi') {
    const cost = type === 'multi' ? 900 : 100;
    if (this.skorBalance < 0) {
      const errMsg = this.add.text(200, 370, '잔액 확인 중... 잠시 후 다시 시도하세요', {
        fontSize: '13px', color: '#ffaa44',
        stroke: '#000000', strokeThickness: 3,
        backgroundColor: '#00000099',
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => { if (errMsg.active) errMsg.destroy(); });
      return;
    }
    if (this.skorBalance < cost) {
      const errMsg = this.add.text(200, 370, `SKOR 부족  (보유 ${Math.floor(this.skorBalance)} / 필요 ${cost})`, {
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
      const [result] = await Promise.all([
        gachaPull(type),
        this.playCommonVideo(),
      ]);

      if (!this.scene.isActive()) return;

      this.pullResults = result.characters;
      this.remainingSkor = result.remainingSkor;

      // 신규 캐릭터 localStorage 동기화
      result.characters.filter(c => c.isNew).forEach(c => addOwnedCharacter(c.id));

      // ② 터미널 애니메이션 (UR이면 중반부터 빨간 에러 스타일로 전환)
      const isUR = result.video === 'red'
      this.skipTerminal = false;
      this.clearUI();
      this.add.rectangle(200, 300, 400, 600, 0x000000);
      this.drawTerminalChrome(false); // 항상 초록으로 시작
      this.addSkipButton(() => { this.skipTerminal = true; });
      await this.runTerminalAnimation(count, isUR);
      this.skipTerminal = false;

      // ③ 캐릭터별 개인 영상 동적 로드 → 리빌
      await this.loadCharVideos(result.characters.map(c => c.id));

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
        if (vid.active) vid.destroy();
        this.showRevealCard(pulled, def);
      };

      this.addSkipButton(() => {
        if (proceeded) return;
        proceeded = true;
        this.input.off('pointerdown', proceed);
        if (vid.active) vid.destroy();
        // 10연차: 영상 스킵 시 남은 리빌 전체 건너뛰고 결과 화면으로
        if (this.pullResults.length > 1) {
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
    const gColor = GRADE_COLORS[pulled.grade] ?? 0xffffff;

    // ── 배경: 사이버 우주 이미지 + 등급 컬러 헤이즈 ──
    if (this.textures.exists('gacha_background')) {
      const bg = this.add.image(200, 300, 'gacha_background');
      bg.setDisplaySize(400, 600);
    } else {
      this.add.rectangle(200, 300, 400, 600, 0x050510);
    }
    // 어두운 오버레이 (가독성 확보)
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.5);
    // 등급 컬러 헤이즈 (중앙 중심 방사)
    this.add.circle(200, 260, 200, gColor, 0.08);
    this.add.circle(200, 260, 120, gColor, 0.06);

    // 배경 글로우 (캐릭터 뒤 빛)
    const glow = this.add.circle(200, 255, 150, gColor, 0.0).setAlpha(0);
    this.tweens.add({
      targets: glow, alpha: 1,
      scaleX: { from: 0.3, to: 1.3 }, scaleY: { from: 0.3, to: 1.3 },
      duration: 600, ease: 'Back.easeOut',
    });

    // 캐릭터 이미지
    const img = this.add.image(200, 240, def.imageKey).setAlpha(0);
    img.setDisplaySize(130, 205);
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

    // 10연차: 결과 화면으로 바로 건너뛰기 (영상 유무와 무관하게 항상 표시)
    if (this.pullResults.length > 1) {
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
    if (this.textures.exists('gacha_background')) {
      this.add.image(200, 300, 'gacha_background').setDisplaySize(400, 600);
    } else {
      this.add.rectangle(200, 300, 400, 600, 0x060612);
    }
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.55);

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
      const img = this.add.image(x, y - 8, def.imageKey).setDisplaySize(cardW - 19, cardH - 22).setAlpha(0);
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
    this.add.text(200, skorY, `잔여 SKOR: ${Math.floor(this.remainingSkor)}`, {
      fontSize: '14px', color: '#00ff41', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // 한 번 더 / 메인으로 버튼
    const againBtn = this.add.rectangle(200, 445, 260, 52, 0x080818)
      .setStrokeStyle(1, 0x00ff41).setInteractive({ useHandCursor: true });
    this.add.text(200, 445, '한 번 더', {
      fontSize: '19px', color: '#00ff41', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);
    againBtn.on('pointerover', () => againBtn.setFillStyle(0x081808));
    againBtn.on('pointerout',  () => againBtn.setFillStyle(0x080818));
    againBtn.on('pointerdown', () => this.buildLobby());

    const mainBtn = this.add.rectangle(200, 525, 260, 52, 0x1a1a1a)
      .setStrokeStyle(1, 0x444444).setInteractive({ useHandCursor: true });
    this.add.text(200, 525, '메인으로', {
      fontSize: '19px', color: '#888888', fontStyle: 'bold', fontFamily: 'monospace',
    }).setOrigin(0.5);
    mainBtn.on('pointerover', () => mainBtn.setFillStyle(0x282828));
    mainBtn.on('pointerout',  () => mainBtn.setFillStyle(0x1a1a1a));
    mainBtn.on('pointerdown', () => this.scene.start('ModeSelectScene'));
  }

  // ═══════════════════════════════════════════════════
  // 터미널 헬퍼
  // ═══════════════════════════════════════════════════

  private addSkipButton(onClick: () => void) {
    this.add.rectangle(363, 28, 88, 30, 0x000000, 0.6)
      .setInteractive()
      .on('pointerdown', onClick);
    const txt = this.add.text(363, 28, 'SKIP  ▶▶', {
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
    this.slideshowGradeText = null;
    this.slideshowNameText = null;
    this.slideshowBadgeBox = null;
    this.slideshowBadgeTxt = null;
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.input.off('pointerdown');
    this.children.getAll().forEach(c => c.destroy());
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
        this.terminalTexts.forEach((t, i) => t.setY(276 + i * 22));
      }

      const y = 276 + this.terminalTexts.length * 22;
      const t = this.add.text(24, y, '', {
        fontSize: '13px', color, fontFamily: 'monospace',
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
        this.terminalTexts.forEach((t, i) => t.setY(276 + i * 22));
      }

      const y = 276 + this.terminalTexts.length * 22;
      const bar = this.add.text(24, y, '> [          ]  0%', {
        fontSize: '13px', color, fontFamily: 'monospace',
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
