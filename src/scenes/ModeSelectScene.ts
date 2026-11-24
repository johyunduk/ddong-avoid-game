import Phaser from 'phaser';
import { GameMode, Difficulty } from '../types/GameMode';
import { getSkorBalance, getCachedSkorBalance } from '../utils/skor';
import { setBgmMuted, isFxBloomEnabled } from '../utils/settings';
import { setBloomEnabled } from '../utils/vfx';
import { getUserInitials, setUserInitials, getSeasonRewardNotices, ackSeasonRewardNotices, type SeasonRewardNotice } from '../utils/leaderboard';
import { getHighScore } from '../utils/localStorage';
import { RELEASE_NOTES } from '../data/releaseNotes';
import BaseScene from './BaseScene';
import { addBackground } from '../utils/background';
import { CHARACTERS, getCharacterDef, getSafeSelectedCharacter, type CharacterDef } from '../utils/character';
import { BANNERS, type BannerDef } from '../config/banners';
import { visibleBanners, standardGachaPool } from '../utils/gacha';
import { bakeButton, bakeRoundedImage, bakeShine, gradientText, wireButton } from '../utils/buttonSkin';

// ── 홈 (L1 큰 픽업 배너 · 7번 하늘 + 노랑 · 시작 = 클래식 그림 · 뽑기 노랑) ─────────────
// 2026-11-22 대표 시안 https://claude.ai/artifact/EzjTqGPKX2Rhkp9SS1UvJe 의 4Y.
// 화면 가득 고른 캐릭터 일러스트 → 위 [캐릭터 칩 · SKOR · 설정] · 오른쪽 [랭킹 · 노트] →
// [캐릭터 무대 | 뽑기 판] → 아래 [스토리 | 게임 시작].
// 2026-11-24 대표: 뽑기 판 위 캐릭터 묶음(말풍선 · 등급 + 이름 · 기록 + 바꾸기)을 빼고 뽑기 왼쪽에 캐릭터 버튼 —
// 시안 https://claude.ai/artifact/Fr6KdCQG3MPgszNLr3k5zg 의 D(도트 무대). 이름 · 이번 달 기록은 위 캐릭터 칩에 남는다.
// 치수는 폰 폭(fw)의 % 단위(u) — 시안의 cqw 와 같다. 넓은 화면에서는 가운데 폰 폭 기둥에만 놓는다

/** 7번 판 색 — 하늘 바탕 · 남색 글자 · 노란 뽑기 */
const C = {
  bg: '#E3F2FF', text: '#0E1E36', sub: '#5B6B86', navy: 0x0e1e36,
  pull: '#FFC21A', pullInt: 0xffc21a, onPull: '#2A1D00', pullLip: '#A87A00', acc: 0x2f8bff,
} as const;

/** 상시 판 줄기 순서 — 센티넬을 왼쪽에 (대표 2026-11-23). 여기 없는 UR 은 풀 순서대로 그 뒤에 */
const STANDARD_UR_ORDER = ['sentinel', 'legacy'];

/** 상시 뽑기에 진열하는 캐릭터 — 상시 풀의 UR (GachaScene featuredIds 와 같은 규칙, 지금 센티넬 · 레거시) */
function standardURIds(): string[] {
  const rank = (id: string) => { const i = STANDARD_UR_ORDER.indexOf(id); return i < 0 ? STANDARD_UR_ORDER.length : i; };
  return standardGachaPool().filter(c => c.grade === 'UR').map(c => c.id).sort((a, b) => rank(a) - rank(b));
}

/**
 * 배너 색 — 배지 바탕 · 「확률 UP」 · 「UR」 · 제목 뒤 비스듬한 그림자 · 넘김 점. 노란 테두리는 모든 배너 공통.
 * 시안 C(6번 스티커 글씨 + 8번 배너마다 색, 대표 2026-11-23). 여기 없는 배너는 종류로 고른다
 */
const PULL_ACCENT: Record<string, string> = { event_1: '#FF4D5E', standard: '#2F8BFF', pickup_gumi: '#F0508C', pickup_mugi: '#D6283B' };
function accentOf(b: BannerDef): string {
  return PULL_ACCENT[b.id] ?? (b.kind === 'event' ? '#FF4D5E' : b.kind === 'standard' ? '#2F8BFF' : '#F0508C');
}

/**
 * 뽑기 판 글 — GachaScene 의 배너 이름과 같은 규칙 (픽업은 픽업 UR 이름, 이벤트는 이벤트 픽업, 상시는 상시 UR).
 * sub 는 [글, 배너 색인가] 조각 — 「확률 UP」 · 「UR」 만 배너 색
 */
function pullTexts(b: BannerDef): { badge: string; title: string; sub: [string, boolean][] } {
  const name = (id: string) => getCharacterDef(id).name;
  const ups = [...(b.pickupUR ? [b.pickupUR] : []), ...b.pickupSR].map(name);
  const urs = b.kind === 'standard' ? standardURIds().map(name) : [];
  const sub: [string, boolean][] = ups.length > 0 ? [[ups.join(' · '), false], ['확률 UP', true]]
    : urs.length > 0 ? [['UR', true], [urs.join(' · '), false]] : [['캐릭터 · 배경화면 뽑기', false]];
  if (b.closesAt) {
    const days = Math.ceil((Date.parse(b.closesAt) - Date.now()) / 86400000);
    if (days > 0) sub.push([`· D-${days}`, false]);
  }
  if (b.kind === 'pickup') return { badge: 'PICK UP', title: b.pickupUR ? `${name(b.pickupUR)} 픽업` : '픽업', sub };
  if (b.kind === 'event') return { badge: 'EVENT', title: '이벤트 픽업', sub };
  return { badge: 'GACHA', title: '상시 뽑기', sub };
}

/** 배너 줄기 안 얼굴 자리 (가로 · 세로 초점 0~1) — 컬렉션 배너 그림마다 얼굴 위치가 달라서. 없는 캐릭터는 (0.55, 0.2) */
const STRIP_FOCUS: Record<string, [number, number]> = { legacy: [0.66, 0.08], sentinel: [0.5, 0.22] };

/** 이번 달 가장 높은 기록 (모든 난이도 중) — 없으면 0 */
function bestThisMonth(): number {
  return Math.max(0, ...Object.values(Difficulty).map(d => getHighScore(d)));
}

export default class ModeSelectScene extends BaseScene {
  private skorText!: Phaser.GameObjects.Text;
  private settingsPanel: Phaser.GameObjects.Container | null = null;
  /** '보상 도착' 팝업 — 떠 있는 동안 메뉴 버튼 입력을 꺼 둔다 */
  private rewardNotice: Phaser.GameObjects.Container | null = null;
  /** 메뉴 버튼들 — 설정 팝업이 떠 있는 동안 입력을 꺼 둔다 */
  private menuButtons: Phaser.GameObjects.Container[] = [];
  /** 「준비 중」 알림 글 — 겹쳐 뜨지 않게 하나만 */
  private toast: Phaser.GameObjects.Text | null = null;
  /** create 때 화면 크기 — 바뀌면 다시 그린다 (checkResize) */
  private builtW = 0;
  private builtH = 0;
  /** 다른 화면으로 넘어가는 중 (뽑기 판 눌림 트윈 포함) — 그동안 크기 바뀜으로 다시 그리지 않는다 */
  private leaving = false;
  /** 이번 실행 번호 — 잔액 · 보상 알림 응답이 늦게 와서 다시 그린(재시작한) 홈을 덮지 않게 */
  private runId = 0;
  /** 마지막으로 단추 · 판을 누른 때 — 눌림 트윈(140ms) 중에 다시 그리면 트윈이 지워져 누른 게 안 먹는다 */
  private pressedAt = -Infinity;

  constructor() {
    super('ModeSelectScene');
  }

  init() {
    // 클래스 프로퍼티는 씬 재시작 후에도 남는다 — preload 보다 먼저 비운다
    this.settingsPanel = null;
    this.rewardNotice = null;
    this.menuButtons = [];
    this.toast = null;
    this.builtW = 0;
    this.builtH = 0;
    this.leaving = false;
    this.runId++;
    this.pressedAt = -Infinity;
  }

  /** 다른 화면으로 — 넘어가기 전에 소리를 모두 끈다 (씬 전환 규칙) */
  private go(key: string, data?: object) {
    this.leaving = true;
    this.sound.stopAll();
    this.scene.start(key, data);
  }

  /**
   * 화면 크기가 create 때와 다르면 처음부터 다시 그린다 — 배치와 누르는 칸이 create 때 치수에 묶여 있다.
   * 팝업이 떠 있으면 미룬다 (이니셜 입력 중 키보드가 올라와 높이가 바뀌어도 팝업을 부수지 않게). 팝업을 닫을 때 다시 본다.
   * 넘어가는 중이면 하지 않는다 — 뽑기 판 눌림 트윈 사이에 재시작하면 트윈이 지워져 뽑기가 안 열린다
   */
  private checkResize() {
    if (this.leaving || !this.scene.isActive() || this.settingsPanel || this.rewardNotice) return;
    if (this.scale.width === this.builtW && this.scale.height === this.builtH) return;
    if (this.time.now - this.pressedAt < 300) {
      // 방금 누른 단추의 눌림 트윈이 끝나 그 동작이 돌 때까지 미룬다 (넘어가면 이 타이머는 씬과 함께 사라진다)
      this.time.delayedCall(300, () => this.checkResize());
      return;
    }
    this.scene.restart();
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    const ui: [string, string][] = [
      ['menu_classic_face', 'classic_face'], ['menu_gacha_face', 'gacha_face'], ['menu_skor', 'skor'],
      ['menu_icon_rank', 'icon_rank'], ['menu_icon_notes', 'icon_notes'], ['menu_icon_settings', 'icon_settings'],
    ];
    for (const [k, f] of ui) {
      if (!this.textures.exists(k)) this.load.image(k, `assets/ui/menu/${f}.webp`);
    }
    // 설정 팝업 아이콘
    for (const n of ['sound', 'sound_off', 'fx', 'nametag', 'info']) {
      if (!this.textures.exists(`set_icon_${n}`)) this.load.image(`set_icon_${n}`, `assets/ui/settings/icon_${n}.webp`);
    }
    // 고른 캐릭터의 일러스트(화면 바탕)와 얼굴(칩). home_* 는 홈을 떠날 때 지운다 — create 의 shutdown
    const sel = getCharacterDef(getSafeSelectedCharacter());
    if (!this.textures.exists(`home_art_${sel.id}`)) this.load.image(`home_art_${sel.id}`, sel.illustPath);
    if (!this.textures.exists(`home_face_${sel.id}`)) this.load.image(`home_face_${sel.id}`, `assets/ui/collection/face/${sel.id}.webp`);
    // 얼굴 그림이 없는 캐릭터(새로 들어온 캐릭터)의 대신 그림 — 게임 스프라이트. 로드 실패는 넘어간다
    if (!this.textures.exists(sel.imageKey)) this.load.image(sel.imageKey, sel.imagePath);
    // 뽑기 판에 깔 배너 그림 — 열린 배너의 픽업 캐릭터들 (컬렉션 배너 그림 440×292)
    for (const b of visibleBanners()) {
      for (const id of this.pullArt(b).ids) {
        if (!this.textures.exists(`home_bn_${id}`)) this.load.image(`home_bn_${id}`, `assets/ui/collection/banner/${id}.webp`);
      }
    }
  }

  create() {
    super.create();

    const W = this.scale.width;
    const H = this.scale.height;
    this.builtW = W;
    this.builtH = H;
    // 회전 · 창 크기 — 0.15초 모아서 한 번 본다
    let resizeTimer: Phaser.Time.TimerEvent | undefined;
    const onResize = () => {
      resizeTimer?.remove();
      resizeTimer = this.time.delayedCall(150, () => this.checkResize());
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once('shutdown', () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
    const def = getCharacterDef(getSafeSelectedCharacter());

    // 폰 폭 기둥 — 짧은 화면에서는 폭을 줄여 세로로 다 들어가게 (시안 폰 높이 ≈ 199u)
    const fw = Math.min(W, 460, H / 1.55);
    const x0 = (W - fw) / 2;
    const u = fw / 100;
    const g = 4.4 * u;
    const L = { W, H, x0, fw, u, g };

    this.addArt(def, W, H);
    // 홈에서 불러오거나 구운 텍스처(home_*)는 홈을 떠날 때 모두 지운다 — 일러스트 · 배너 그림 · 구운 판이 게임 중에 남지 않게
    this.events.once('shutdown', () => {
      for (const key of this.textures.getTextureKeys()) if (key.startsWith('home_')) this.textures.remove(key);
    });

    this.createTopBar(def, L);
    this.createRail(L);

    // 아래부터 쌓는다: [스토리 | 시작] → [캐릭터 무대 | 뽑기 판]
    const lastH = 17 * u, lastTop = H - g - lastH;
    const pullH = 36 * u, pullTop = lastTop - 3 * u - pullH;
    const inner = fw - g * 2, gap = 2.6 * u;
    const stageW = 26 * u;
    this.createCharStage(def, x0 + g, pullTop, stageW, pullH, u);
    this.createPullCard(x0 + g + stageW + gap, pullTop, inner - stageW - gap, pullH, u);
    const storyW = (inner - gap) / 2.35;
    this.createStoryCard(x0 + g, lastTop, storyW, lastH, u);
    this.createStartButton(x0 + g + storyW + gap, lastTop, inner - storyW - gap, lastH, u);

    // SKOR 잔액 비동기 로드
    this.loadSkorBalance();
  }

  // ── 바탕 ──────────────────────────────────────────────────────────────

  /** 고른 캐릭터 일러스트를 화면 가득 (위 10% 쪽에 초점) + 위는 살짝, 아래는 하늘색으로 덮는 그라데이션 */
  private addArt(def: CharacterDef, W: number, H: number) {
    const key = `home_art_${def.id}`;
    if (this.textures.exists(key)) {
      const img = this.add.image(W / 2, 0, key).setOrigin(0.5, 0);
      const s = Math.max(W / img.width, H / img.height);
      img.setScale(s).setY(-(img.height * s - H) * 0.1);
    } else {
      addBackground(this, 'background2', W, H);   // 일러스트를 못 불러오면 옥상 배경
    }
    const fadeKey = 'home_fade_sky';
    if (!this.textures.exists(fadeKey)) {
      const tex = this.textures.createCanvas(fadeKey, 4, 512);
      if (tex) {
        const ctx = tex.getContext();
        const gr = ctx.createLinearGradient(0, 0, 0, 512);
        gr.addColorStop(0, 'rgba(227,242,255,0.45)');
        gr.addColorStop(0.15, 'rgba(227,242,255,0)');
        gr.addColorStop(0.48, 'rgba(227,242,255,0)');
        gr.addColorStop(0.76, 'rgba(227,242,255,0.92)');
        gr.addColorStop(1, 'rgba(227,242,255,1)');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, 4, 512);
        tex.refresh();
      }
    }
    this.add.image(0, 0, fadeKey).setOrigin(0).setDisplaySize(W, H);
  }

  private async loadSkorBalance() {
    const run = this.runId;
    try {
      // 캐시는 getSkorBalance 가 쓴다 (겹친 조회 중 마지막으로 시작한 것만)
      const balance = await getSkorBalance();
      // 그 사이 홈이 다시 그려졌으면(재시작) 새 실행이 제 응답으로 채운다 — 늦게 온 이 값으로 덮지 않는다
      if (run === this.runId && this.skorText?.active) {
        this.skorText.setText(Math.floor(balance).toLocaleString());
      }
    } catch {
      // 잔액 로드 실패 시 캐시 값 유지
    }
    // 잔액 조회가 세션을 확보한 뒤에 — 월초 자동 지급된 시즌 보상 알림
    if (run === this.runId) await this.showSeasonRewardNotices(run);
  }

  /**
   * '보상 도착' — 월초에 서버가 자동 지급한 시즌 보상 중 아직 안 보여 준 것.
   * 잔액에는 이미 들어가 있다. 한 장에 5줄씩 넘기며, 닫을 때 그 장에 띄운 것만 본 것으로 돌려준다.
   * 닫기 전에 씬을 떠나면 남은 것은 다음 접속 때 다시 띄운다
   */
  private async showSeasonRewardNotices(run: number) {
    const notices = await getSeasonRewardNotices();
    if (run !== this.runId || this.leaving) return;   // 다시 그린 홈은 제 실행이 따로 띄운다
    if (notices.length === 0 || !this.scene.isActive() || this.settingsPanel || this.rewardNotice) return;
    this.menuButtons.forEach(b => b.disableInteractive());
    const total = notices.reduce((s, n) => s + Number(n.skor_awarded), 0);
    this.openRewardNoticePage(notices, total);
  }

  /** 알림 한 장 — 5줄까지. 남으면 버튼이 '다음'이 되고 닫으면 다음 장을 연다. 마지막 장을 닫으면 메뉴 입력을 되살린다 */
  private openRewardNoticePage(notices: SeasonRewardNotice[], total: number) {
    const SW = this.scale.width, SH = this.scale.height;
    const cx = SW / 2;
    const PAGE = 5;
    const page = notices.slice(0, PAGE);
    const rest = notices.slice(PAGE);
    const pw = Math.min(340, SW - 32);
    const rowH = 32, rowGap = 6;
    const listH = page.length * (rowH + rowGap);
    const ph = 76 + listH + 40 + 66;
    const top = Math.round((SH - ph) / 2 + 10);
    const panelRect = new Phaser.Geom.Rectangle(cx - pw / 2, top - 26, pw, ph + 26);

    const overlay = this.add.rectangle(cx, SH / 2, SW, SH, 0x000000, 0.55).setDepth(60).setInteractive();
    const panel = this.add.container(0, 0).setDepth(61);
    this.rewardNotice = panel;

    const teardown = () => {
      overlay.destroy();
      panel.destroy();
      this.rewardNotice = null;
      this.events.off('shutdown', teardown);
    };
    this.events.once('shutdown', teardown);
    const close = () => {
      if (this.rewardNotice !== panel) return;
      teardown();
      void ackSeasonRewardNotices(page.map(n => n.id));
      if (rest.length > 0) {
        this.openRewardNoticePage(rest, total);
        return;
      }
      this.menuButtons.forEach(b => { if (b.active) b.setInteractive().setScale(1); });
      this.checkResize();   // 떠 있는 동안 화면 크기가 바뀌었으면 이제 다시 그린다
    };
    overlay.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!panelRect.contains(p.x, p.y)) close();
    });

    // 판 · 제목판 — 설정 팝업과 같은 화법
    const panelKey = `reward_panel_${pw}x${ph}`;
    const { originY } = bakeButton(this, panelKey, {
      w: pw, h: ph, radius: 22, top: '#2a1460', bottom: '#120626', border: '#d38bff', borderW: 3,
      lip: '#3a1478', lipH: 6, gloss: 0, glow: 'rgba(190,110,255,0.67)',
    });
    panel.add(this.add.image(cx, top + ph / 2, panelKey).setOrigin(0.5, originY));
    const plank = bakeButton(this, 'reward_title_plank', {
      w: 200, h: 52, radius: 16, top: '#c98a4a', bottom: '#8a5226', border: '#3a1f0a', borderW: 3,
      lip: '#5b3416', lipH: 5, gloss: 0,
    });
    panel.add(this.add.image(cx, top, 'reward_title_plank').setOrigin(0.5, plank.originY));
    const title = this.add.text(cx, top - 1, '보상 도착', {
      fontSize: '24px', fontStyle: 'bold', stroke: '#3a1f0a', strokeThickness: 4,
    }).setOrigin(0.5);
    gradientText(title, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    panel.add(title);
    panel.add(this.add.text(cx, top + 44, 'EXTREME 캐릭터 시즌 보상이 들어왔어요', {
      fontSize: '13px', color: '#e6d7ff',
    }).setOrigin(0.5));

    // 줄마다: '9월 · 테드 1위' · '+5,000'
    const x0 = cx - pw / 2 + 16, rw = pw - 32;
    page.forEach((n, i) => {
      const y = top + 76 + i * (rowH + rowGap) + rowH / 2;
      const month = Number(n.year_month.split('-')[1]);
      const name = CHARACTERS.find(c => c.id === n.character_type)?.name ?? n.character_type;
      panel.add(this.add.graphics().fillStyle(0xffffff, 0.08).fillRoundedRect(x0, y - rowH / 2, rw, rowH, 10));
      panel.add(this.add.text(x0 + 12, y, `${month}월 · ${name} ${n.rank}위`, {
        fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5));
      panel.add(this.add.text(x0 + rw - 12, y, `+${Number(n.skor_awarded).toLocaleString()}`, {
        fontSize: '16px', color: '#ffd34d', fontStyle: 'bold',
      }).setOrigin(1, 0.5));
    });
    // 합계는 모든 장을 합친 값 (잔액에 들어간 총액)
    panel.add(this.add.text(cx, top + 76 + listH + 18, `합계 +${total.toLocaleString()} SKOR`, {
      fontSize: '18px', color: '#ffd34d', fontStyle: 'bold', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    const okW = 170, okH = 46;
    const ok = this.add.container(cx, top + ph - 40);
    const okSkin = bakeButton(this, 'reward_ok_btn', {
      w: okW, h: okH, radius: 14, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 2,
      lip: '#a8650a', lipH: 4, gloss: 0,
    });
    ok.add(this.add.image(0, 0, 'reward_ok_btn').setOrigin(0.5, okSkin.originY));
    ok.add(this.add.text(0, 0, rest.length > 0 ? `다음 (${rest.length}개 더)` : '확인', {
      fontSize: '17px', color: '#5b2e0e', fontStyle: 'bold',
    }).setOrigin(0.5));
    wireButton(this, ok, okW, okH, close);
    panel.add(ok);
  }

  // ── 홈 판들 ────────────────────────────────────────────────────────────
  // 판 · 그림이 든 단추는 캔버스로 한 번 굽는다(utils/buttonSkin 과 같은 방식). 키에 크기를 넣어 화면 크기가 바뀌면 새로 굽는다

  /** 누르는 칸 — (x, y) 가 왼쪽 위, 컨테이너 가운데가 칸 가운데. 팝업이 뜨면 menuButtons 로 입력을 끈다 */
  private makeBox(x: number, y: number, w: number, h: number, onClick: () => void, repeatable = false) {
    const box = this.add.container(x + w / 2, y + h / 2).setDepth(5);
    wireButton(this, box, w, h, onClick, repeatable);
    box.on('pointerdown', () => { this.pressedAt = this.time.now; });   // checkResize 가 눌림 트윈 동안 미룬다
    this.menuButtons.push(box);
    return box;
  }

  /** 반투명 흰 알약 · 동그라미 (유리판) — 가운데 기준 */
  private glass(w: number, h: number, r: number) {
    return this.add.graphics()
      .fillStyle(0xffffff, 0.84).fillRoundedRect(-w / 2, -h / 2, w, h, r)
      .lineStyle(1, C.navy, 0.1).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  }

  /** 글자 크기 — u 단위, 너무 작아지지 않게 10px 바닥 */
  private fs(n: number, u: number) {
    return `${Math.max(10, Math.round(n * u))}px`;
  }

  /** 위 줄 — 왼쪽 캐릭터 칩(얼굴 · 이름 · 이번 달 최고) · 오른쪽 SKOR · 설정 */
  private createTopBar(def: CharacterDef, L: { x0: number; fw: number; u: number; g: number }) {
    const { x0, fw, u, g } = L;
    const h = 9.6 * u, face = 8 * u;
    const best = bestThisMonth();

    const name = this.add.text(0, 0, def.name, { fontSize: this.fs(3.3, u), color: C.text, fontStyle: 'bold' }).setOrigin(0, 0.5);
    const sub = this.add.text(0, 0, best > 0 ? `최고 ${best.toLocaleString()}` : '이번 달 기록 없음', {
      fontSize: this.fs(2.5, u), color: C.sub,
    }).setOrigin(0, 0.5);
    const cw = 0.8 * u + face + 1.8 * u + Math.max(name.width, sub.width) + 3 * u;
    const chip = this.makeBox(x0 + g, g, cw, h, () => this.go('CharacterSelectScene'));
    chip.add(this.glass(cw, h, h / 2));
    const fx = -cw / 2 + 0.8 * u + face / 2;
    const faceKey = `home_face_${def.id}`;
    if (this.textures.exists(faceKey)) {
      const k = bakeRoundedImage(this, `home_facec_${def.id}_${Math.round(face)}`, faceKey, face, face, face / 2, 0.3);
      chip.add(this.add.image(fx, 0, k).setDisplaySize(face, face));
    } else if (this.textures.exists(def.imageKey)) {
      const spr = this.add.image(fx, face / 2, def.imageKey).setOrigin(0.5, 1);
      chip.add(spr.setScale(face / spr.height));
    }
    const tx = fx + face / 2 + 1.8 * u;
    chip.add(name.setPosition(tx, -1.3 * u));
    chip.add(sub.setPosition(tx, 2 * u));

    // 설정 — 오른쪽 끝 동그라미
    const sx = x0 + fw - g - h;
    const set = this.makeBox(sx, g, h, h, () => this.showSettingsPanel(), true);
    set.add(this.glass(h, h, h / 2));
    if (this.textures.exists('menu_icon_settings')) set.add(this.add.image(0, 0, 'menu_icon_settings').setDisplaySize(6 * u, 6 * u));
    else set.add(this.add.text(0, 0, '⚙️', { fontSize: this.fs(5, u) }).setOrigin(0.5));

    // SKOR — 설정 왼쪽 알약. 글자 칸은 여섯 자리 폭을 잡아 둬서 잔액이 늦게 와도 판이 안 움직인다
    const cached = getCachedSkorBalance();
    this.skorText = this.add.text(0, 0, '000,000', { fontSize: this.fs(3.4, u), color: C.text, fontStyle: 'bold' }).setOrigin(1, 0.5);
    const tw = this.skorText.width;
    this.skorText.setText(cached !== null ? Math.floor(cached).toLocaleString() : '--');
    const icon = 4.8 * u, pw = 1.4 * u + icon + 1.2 * u + tw + 3 * u;
    const coin = this.add.container(sx - 1.6 * u - pw / 2, g + h / 2).setDepth(5);
    coin.add(this.glass(pw, 8.4 * u, 4.2 * u));
    if (this.textures.exists('menu_skor')) coin.add(this.add.image(-pw / 2 + 1.4 * u + icon / 2, 0, 'menu_skor').setDisplaySize(icon, icon));
    coin.add(this.skorText.setPosition(pw / 2 - 3 * u, 0));
  }

  /** 오른쪽 줄 — 랭킹 · 노트(릴리즈 노트). 동그라미 아이콘 + 아래 이름 */
  private createRail(L: { x0: number; fw: number; u: number; g: number }) {
    const { x0, fw, u, g } = L;
    const d = 9.6 * u, x = x0 + fw - g - d;
    const items: [string, string, () => void][] = [
      ['menu_icon_rank', '랭킹', () => this.go('LeaderboardScene')],
      ['menu_icon_notes', '노트', () => this.go('ReleaseNotesScene')],
    ];
    items.forEach(([icon, label, go], i) => {
      const y = g + 13 * u + i * 16 * u;
      const box = this.makeBox(x, y, d, d, go);
      box.add(this.glass(d, d, d / 2));
      if (this.textures.exists(icon)) box.add(this.add.image(0, 0, icon).setDisplaySize(6 * u, 6 * u));
      box.add(this.add.text(0, d / 2 + 2 * u, label, {
        fontSize: this.fs(2.6, u), color: C.text, fontStyle: 'bold', stroke: '#ffffff', strokeThickness: Math.max(2, 0.6 * u),
      }).setOrigin(0.5));
    });
  }

  /**
   * 캐릭터 무대 — 뽑기 판 왼쪽. 옥상 스테이지(background2) 위에 고른 캐릭터의 게임 속 도트 그림이 서서 들썩이고,
   * 위에 「캐릭터」, 아래 가장자리에 등급 · 이름표. 누르면 캐릭터 고르기 (대표 2026-11-24 시안 D).
   * 테두리 · 아래 턱은 게임 시작 단추와 같은 남색 — 아래 줄 [스토리 | 시작] 과 짝이 맞게
   */
  private createCharStage(def: CharacterDef, x: number, y: number, w: number, h: number, u: number) {
    const bw = Math.max(2, 0.6 * u), lip = 1.4 * u, r = 3.4 * u, P = 6;
    const key = this.bakeStage(`home_stage_${Math.round(w)}x${Math.round(h)}`, w, h, r, bw, lip, P);
    const box = this.makeBox(x, y, w, h, () => this.go('CharacterSelectScene'));
    const texH = h + P * 2 + bw * 2 + lip;
    box.add(this.add.image(0, 0, key).setDisplaySize(w + P * 2 + bw * 2, texH).setOrigin(0.5, (P + bw + h / 2) / texH));

    // 발밑 그림자 + 도트 캐릭터(앞모습). 키 19u 에 맞추되 넓은 그림은 폭 20u 를 넘지 않게
    const footY = h / 2 - 3.6 * u;
    box.add(this.add.ellipse(0, footY, 10 * u, 1.8 * u, C.navy, 0.28));
    if (this.textures.exists(def.imageKey)) {
      const spr = this.add.image(0, footY + 0.4 * u, def.imageKey).setOrigin(0.5, 1);
      spr.setScale(Math.min(19 * u / spr.height, 20 * u / spr.width));
      box.add(spr);
      // 들썩임 — 0.45초마다 0.7u 위아래로 뚝뚝 (도트 걷기 느낌, 부드러운 트윈이 아니라)
      const y0 = spr.y;
      this.time.addEvent({ delay: 450, loop: true, callback: () => spr.setY(spr.y === y0 ? y0 - 0.7 * u : y0) });
    }

    // 「캐릭터」 — 게임 시작과 같은 흰 글자 + 남색 외곽선 · 아래 그림자
    box.add(this.add.text(0, -h / 2 + 4.6 * u, '캐릭터', {
      fontSize: this.fs(4.2, u), color: '#ffffff', fontStyle: 'bold', stroke: '#0e1e36', strokeThickness: Math.max(3, 0.8 * u),
    }).setOrigin(0.5).setShadow(0, 0.7 * u, '#0e1e36', 0, true, false));

    // 등급 · 이름표 — 아래 가장자리에 걸친 흰 알약(남색 테). 아래 턱을 덮고 아래 줄과는 띄운다
    const nameT = this.add.text(0, 0, def.name, { fontSize: this.fs(2.8, u), color: C.text, fontStyle: 'bold' }).setOrigin(0, 0.5);
    const gradeT = this.add.text(0, 0, def.grade, { fontSize: this.fs(2.2, u), color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const gw = gradeT.width + 2.2 * u, gh = 3.4 * u;
    const th = gh + 1.2 * u, tw = 0.6 * u + gw + 0.9 * u + nameT.width + 1.8 * u;
    const ty = h / 2 - 0.6 * u, tx = -tw / 2;
    const gc = Phaser.Display.Color.HexStringToColor(def.gradeColor).color;
    box.add(this.add.graphics()
      .fillStyle(0xffffff, 1).fillRoundedRect(tx, ty - th / 2, tw, th, th / 2)
      .lineStyle(Math.max(1.5, 0.5 * u), C.navy, 1).strokeRoundedRect(tx, ty - th / 2, tw, th, th / 2)
      .fillStyle(gc, 1).fillRoundedRect(tx + 0.6 * u, ty - gh / 2, gw, gh, gh / 2));
    box.add(gradeT.setPosition(tx + 0.6 * u + gw / 2, ty));
    box.add(nameT.setPosition(tx + 0.6 * u + gw + 0.9 * u, ty));
  }

  /** 캐릭터 무대 그림 — 옥상 스테이지 아래쪽(도시 · 옥상 바닥)을 면에, 남색 테두리 + 아래 턱. 시작 단추 굽기와 같은 꼴 */
  private bakeStage(key: string, w: number, h: number, r: number, bw: number, lip: number, P: number): string {
    if (this.textures.exists(key)) return key;
    const R = 2;
    const TW = w + P * 2 + bw * 2, TH = h + P * 2 + bw * 2 + lip;
    const tex = this.textures.createCanvas(key, Math.round(TW * R), Math.round(TH * R));
    if (!tex) return key;
    const ctx = tex.getContext();
    ctx.scale(R, R);
    const bx = P + bw, by = P + bw;
    const rr = (x: number, y: number, ww: number, hh: number, rad: number) => {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, rad);
      ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
      ctx.arcTo(x, y + hh, x, y, rad);
      ctx.arcTo(x, y, x + ww, y, rad);
      ctx.closePath();
    };
    // 아래 턱 + 테두리 (남색 덩어리)
    ctx.fillStyle = '#0e1e36';
    rr(bx - bw, by - bw + lip, w + bw * 2, h + bw * 2, r + bw);
    ctx.fill();
    rr(bx - bw, by - bw, w + bw * 2, h + bw * 2, r + bw);
    ctx.fill();
    // 면 — 스테이지 그림을 무대 폭의 1.7배로 키워 아래 가운데를 보인다 (옥상 바닥이 발밑에 오게)
    ctx.save();
    rr(bx, by, w, h, r);
    ctx.clip();
    ctx.fillStyle = '#8fd0ff';
    ctx.fillRect(bx, by, w, h);
    if (this.textures.exists('background2')) {
      const src = this.textures.get('background2').getSourceImage() as HTMLImageElement;
      const sc = w * 1.7 / src.width;
      const sw = w / sc, sh = Math.min(src.height, h / sc);
      ctx.drawImage(src, (src.width - sw) / 2, src.height - sh, sw, sh, bx, by + h - sh * sc, w, sh * sc);
    }
    ctx.restore();
    tex.refresh();
    return key;
  }

  /**
   * 넓은 뽑기 판 — 열린 배너를 **모두** 차례로 돌려 보인다(3.5초마다, 순서는 뽑기 화면과 같은 banners.ts 배열 순서).
   * 판마다 제 그림(픽업 = 픽업 UR 배너 그림, 이벤트 = 픽업 SR 넷을 세로 줄기로, 상시 = 메뉴 뽑기 그림)과 글.
   * 누르면 그때 보이던 배너로 뽑기 화면을 연다. 좌우로 밀면 앞 · 뒤 배너로 넘어가고(끝 다음은 처음), 자동 넘김은 다시 3.5초부터.
   * 밀기와 누르기를 가르려고 wireButton 대신 손가락을 뗄 때 판정한다. 노란 테두리 · 빛 번짐 · 지나가는 빛은 판 공통
   */
  private createPullCard(x: number, top: number, w: number, h: number, u: number) {
    const r = 3.4 * u;
    // 판이 좁으면(왼쪽 캐릭터 무대 몫만큼) 글씨 · 여백을 줄이고 그림 줄기를 오른쪽으로 — 폭 78u 에서 1, 0.8 아래로는 안 줄인다
    const tk = Phaser.Math.Clamp(w / (78 * u), 0.8, 1);
    const open = visibleBanners();
    const list = open.length > 0 ? open : [BANNERS[0]];
    let idx = 0;
    const box = this.add.container(x + w / 2, top + h / 2).setDepth(5).setSize(w, h);
    box.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    if (box.input) box.input.cursor = 'pointer';
    this.menuButtons.push(box);

    const slides = list.map((b, i) => {
      const slide = this.add.container(0, 0).setAlpha(i === 0 ? 1 : 0);
      this.fillPullSlide(slide, b, w, h, r, u, tk);
      box.add(slide);
      return slide;
    });

    // 지나가는 빛 — 판 안에서만 (마스크)
    const shine = this.add.image(-w / 2 - 12 * u, 0, bakeShine(this, 'home_shine', 70, 240))
      .setDisplaySize(16 * u, h * 1.4).setAngle(18).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
    box.add(shine);
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff).fillRoundedRect(x, top, w, h, r);
    shine.setMask(maskG.createGeometryMask());
    this.tweens.add({ targets: shine, x: w / 2 + 12 * u, duration: 1000, repeat: -1, repeatDelay: 1800, ease: 'Cubic.easeInOut' });
    this.events.once('shutdown', () => maskG.destroy());

    // 누르기 · 밀기 — 누른 자리에서 8px 넘게 움직이면 밀기. 판 폭 12% 넘게 밀고 떼면 넘기고, 덜 밀면 제자리로.
    // 누르고 있는 동안은 자동 넘김을 멈춘다 — 손가락 아래서 판이 바뀌지 않게
    let downX: number | null = null, dragging = false, opening = false;
    let timer: Phaser.Time.TimerEvent | undefined;
    /** 지금 보이는 판 — 넘김(280ms) 중이면 idx 는 이미 들어오는 판이라, 더 진하게 보이는 판을 고른다 */
    const shownNow = () => {
      let s = idx;
      for (let i = 0; i < slides.length; i++) if (slides[i].alpha > slides[s].alpha) s = i;
      return s;
    };
    /** 손가락을 댄 순간 보이던 판 — 떼기 전에 넘김이 계속돼 다른 판이 진해져도 이것을 연다 */
    let pressedShown = 0;
    const openGacha = () => {
      if (opening) return;
      opening = true;
      this.leaving = true;   // 눌림 트윈 사이에 크기 바뀜으로 재시작하지 않게
      // 눌림 트윈(140ms) 끝에서 읽지 않는다 — 그 사이 자동 넘김이 idx 를 바꿀 수 있다
      const bannerId = list[pressedShown].id;
      timer?.remove();
      this.tweens.add({
        targets: box, scale: 0.96, duration: 70, yoyo: true, ease: 'Quad.easeOut',
        onComplete: () => this.go('GachaScene', { bannerId }),
      });
    };
    const release = () => {
      downX = null;
      dragging = false;
      if (timer) timer.paused = false;
    };
    const settle = () => this.tweens.add({ targets: slides[idx], x: 0, duration: 160, ease: 'Quad.easeOut' });
    box.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      downX = ptr.x;
      dragging = false;
      pressedShown = shownNow();
      this.pressedAt = this.time.now;
      if (timer) timer.paused = true;
    });
    const onMove = (ptr: Phaser.Input.Pointer) => {
      if (downX === null || !ptr.isDown || list.length < 2) return;
      const dx = ptr.x - downX;
      if (Math.abs(dx) > 8) dragging = true;
      if (dragging) slides[idx].setX(dx * 0.6);
    };
    // 누름을 버린다(뽑기를 열지 않는다) — 끌던 판은 제자리로
    const discard = () => {
      if (downX === null) return;
      const wasDrag = dragging;
      release();
      if (wasDrag) settle();
    };
    const onUp = (ptr: Phaser.Input.Pointer) => {
      if (downX === null) return;
      // 터치가 취소되면(touchcancel) Phaser 는 wasCanceled 를 단 pointerup 을 보낸다 — 누른 것으로 치지 않는다
      if (ptr.wasCanceled) { discard(); return; }
      const dx = ptr.x - downX, wasDrag = dragging;
      release();
      if (!wasDrag) { openGacha(); return; }
      if (Math.abs(dx) > w * 0.12) turn(dx < 0 ? 1 : -1);
      else settle();
    };
    // 캔버스 밖에서 떼면 Phaser 는 pointerup 대신 pointerupoutside 를 보낸다 — 버린다.
    // 안 버리면 남은 downX 때문에 다음 아무 데나 누른 것이 뽑기를 연다
    const onUpOutside = () => discard();
    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);
    this.input.on('pointerupoutside', onUpOutside);
    this.events.once('shutdown', () => {
      this.input.off('pointermove', onMove);
      this.input.off('pointerup', onUp);
      this.input.off('pointerupoutside', onUpOutside);
    });

    if (list.length < 2) return;
    // 점 — 판 왼쪽 아래. 지금 판은 노란 긴 알약
    const dots = this.add.graphics();
    box.add(dots);
    const dy = h / 2 - 2.8 * u, d = 1.4 * u, lx = -w / 2 + 4 * tk * u;
    const drawDots = () => {
      dots.clear();
      let x = lx;
      list.forEach((_, i) => {
        const dw = i === idx ? 4 * u : d;
        const on = Phaser.Display.Color.HexStringToColor(accentOf(list[idx])).color;
        dots.fillStyle(i === idx ? on : C.navy, i === idx ? 1 : 0.22).fillRoundedRect(x, dy - d / 2, dw, d, d / 2);
        x += dw + 1 * u;
      });
    };
    drawDots();
    /** dir 쪽 이웃 배너로 — 지금 판은 반대쪽으로 비키며 흐려지고, 새 판은 dir 쪽에서 들어온다 */
    const turn = (dir: 1 | -1) => {
      const prev = slides[idx];
      idx = (idx + dir + slides.length) % slides.length;
      const next = slides[idx];
      this.tweens.killTweensOf([prev, next]);
      this.tweens.add({ targets: prev, x: -dir * w * 0.18, alpha: 0, duration: 280, ease: 'Quad.easeOut' });
      next.setX(dir * w * 0.18).setAlpha(0);
      this.tweens.add({ targets: next, x: 0, alpha: 1, duration: 280, ease: 'Quad.easeOut' });
      drawDots();
      timer?.remove();
      timer = this.time.addEvent({ delay: 3500, loop: true, callback: () => turn(1) });
    };
    timer = this.time.addEvent({ delay: 3500, loop: true, callback: () => turn(1) });
  }

  /**
   * 뽑기 판 한 장 — 구운 판 그림 + 배지 · 제목 · 설명. 값 단추(1회 · 10회)는 두지 않는다 — 값은 뽑기 화면에서 본다
   * (대표 2026-11-23 「1회 10회 버튼은 저기에 없어도 될 듯」). 판 어디를 눌러도 뽑기 화면이다
   */
  private fillPullSlide(slide: Phaser.GameObjects.Container, b: BannerDef, w: number, h: number, r: number, u: number, tk: number) {
    const P = 18;
    const key = this.bakePullCard(`home_pull_${b.id}_${Math.round(w)}x${Math.round(h)}`, b, w, h, r, P, Math.max(2.5, 0.7 * u), tk < 1);
    slide.add(this.add.image(0, 0, key).setDisplaySize(w + P * 2, h + P * 2));

    // 글 — 왼쪽, 위에서 아래로 배지 · 제목 · 설명. 줄 칸 높이(u)를 정해 두고 판 가운데(점 자리만큼 위)에 묶어 놓는다
    // (Text 높이는 textSafety 여백이 붙어 실제 글자보다 커서, 그 높이로 쌓으면 판 밖으로 샌다)
    const txt = pullTexts(b);
    const acc = accentOf(b), navy = '#0e1e36';
    // 글 치수는 모두 tk 배 (판이 좁으면 0.8 까지) — u 대신 k 로 잰다
    const k = u * tk;
    const lx = -w / 2 + 4 * k;
    const bh = 4.2 * k, titleH = 9 * k, subH = 3.8 * k;
    let y = -(bh + 1.6 * k + titleH + 0.8 * k + subH) / 2 - 1.4 * u;
    // 배지 — 배너 색 바탕 흰 글자
    const badgeT = this.add.text(0, 0, txt.badge, { fontSize: this.fs(2.8, k), color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const bw = badgeT.width + 4 * k;
    slide.add(this.add.graphics().fillStyle(Phaser.Display.Color.HexStringToColor(acc).color, 1).fillRoundedRect(lx, y, bw, bh, bh / 2));
    slide.add(badgeT.setPosition(lx + bw / 2, y + bh / 2));
    y += bh + 1.6 * k;
    // 제목 — 흰 글자 + 남색 외곽선(「게임 시작」과 같은 결). 뒤에 남색 두께(아래)와 배너 색 그림자(오른쪽 아래)를
    // 같은 글자 두 장으로 깐다 — Text 그림자는 하나뿐이라. 외곽선은 가운데에 그려져 바깥으로 절반(0.45u)만 보인다
    const ty = y + titleH / 2, st = Math.max(3, 0.9 * k);
    const titleStyle = (fill: string, stroke: string) => ({ fontSize: this.fs(8, k), color: fill, fontStyle: 'bold', stroke, strokeThickness: st });
    slide.add(this.add.text(lx + 0.9 * k, ty + 1.5 * k, txt.title, titleStyle(acc, acc)).setOrigin(0, 0.5));
    slide.add(this.add.text(lx + 0.3 * k, ty + 0.9 * k, txt.title, titleStyle(navy, navy)).setOrigin(0, 0.5));
    slide.add(this.add.text(lx, ty, txt.title, titleStyle('#ffffff', navy)).setOrigin(0, 0.5));
    y += titleH + 0.8 * k;
    // 설명 — 남색, 「확률 UP」 · 「UR」 만 배너 색. 그림 위로 걸려도 읽히게 옅은 흰 테
    let sx = lx;
    for (const [t, isAcc] of txt.sub) {
      const part = this.add.text(sx, y + subH / 2, t, {
        fontSize: this.fs(3, k), color: isAcc ? acc : navy, fontStyle: 'bold', stroke: '#ffffff', strokeThickness: Math.max(2, 0.5 * u),
      }).setOrigin(0, 0.5);
      slide.add(part);
      sx += part.width + 0.4 * k;
    }
  }

  /** 배너마다 판 오른쪽에 깔 그림 — 픽업 = 픽업 UR 하나, 이벤트 = 픽업 SR 들 · 상시 = 상시 UR 들을 세로 줄기로 (없으면 메뉴 뽑기 그림) */
  private pullArt(b: BannerDef): { ids: string[]; strips: boolean } {
    if (b.kind === 'pickup' && b.pickupUR) return { ids: [b.pickupUR], strips: false };
    if (b.kind === 'event' && b.pickupSR.length > 0) return { ids: b.pickupSR.slice(0, 4), strips: true };
    if (b.kind === 'standard') {
      const urs = standardURIds().slice(0, 4);
      if (urs.length > 0) return { ids: urs, strips: true };
    }
    return { ids: [], strips: false };
  }

  /** 뽑기 판 그림 — 흰 판 · 오른쪽에 배너 그림 · 왼쪽 흰 덮개 · 노란 테두리 + 빛 번짐. 한 번 굽는다 */
  private bakePullCard(key: string, b: BannerDef, w: number, h: number, r: number, P: number, bw: number, narrow: boolean): string {
    if (this.textures.exists(key)) return key;
    const R = 2;
    const tex = this.textures.createCanvas(key, Math.round((w + P * 2) * R), Math.round((h + P * 2) * R));
    if (!tex) return key;
    const ctx = tex.getContext();
    ctx.scale(R, R);
    ctx.translate(P, P);
    const rr = (inset: number) => {
      const x = inset, y = inset, ww = w - inset * 2, hh = h - inset * 2, rad = Math.max(0, r - inset);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, rad);
      ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
      ctx.arcTo(x, y + hh, x, y, rad);
      ctx.arcTo(x, y, x + ww, y, rad);
      ctx.closePath();
    };
    /** 그림을 (dx, dy, dw, dh) 칸에 덮어 채운다 — fx · fy 는 가로 · 세로 초점 */
    const cover = (srcKey: string, dx: number, dy: number, dw: number, dh: number, fx: number, fy: number) => {
      if (!this.textures.exists(srcKey)) return false;
      const src = this.textures.get(srcKey).getSourceImage() as HTMLImageElement;
      const sc = Math.max(dw / src.width, dh / src.height);
      const sw = dw / sc, sh = dh / sc;
      ctx.drawImage(src, (src.width - sw) * fx, (src.height - sh) * fy, sw, sh, dx, dy, dw, dh);
      return true;
    };
    // 빛 번짐
    ctx.save();
    ctx.shadowColor = 'rgba(255,194,26,0.75)';
    ctx.shadowBlur = 16;
    rr(0);
    ctx.fillStyle = C.pull;
    ctx.fill();
    ctx.restore();
    // 판 + 그림
    ctx.save();
    rr(0);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const art = this.pullArt(b);
    if (art.strips) {
      // 비스듬한 세로 줄기 — 판 오른쪽(폭 30% 부터, 좁은 판은 제목과 덜 겹치게 38% 부터)을 그림 수만큼 나눈다. 줄기 사이는 흰 선
      const x0 = w * (narrow ? 0.38 : 0.3), n = art.ids.length, sw = (w - x0) / n, k = w * 0.035;
      for (let i = 0; i < n; i++) {
        const a = x0 + i * sw, z = i === n - 1 ? w + k * 2 : a + sw;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(a + k, 0); ctx.lineTo(z + k, 0); ctx.lineTo(z - k, h); ctx.lineTo(a - k, h);
        ctx.closePath();
        ctx.clip();
        const [fx, fy] = STRIP_FOCUS[art.ids[i]] ?? [0.55, 0.2];
        cover(`home_bn_${art.ids[i]}`, a - k, 0, z - a + k * 2, h, fx, fy);
        ctx.restore();
        if (i > 0) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(a + k, 0); ctx.lineTo(a - k, h); ctx.stroke();
        }
      }
    } else if (art.ids.length === 1 && this.textures.exists(`home_bn_${art.ids[0]}`)) {
      // 픽업 그림 — 판 높이의 1.2배로(자르면 위 30% · 아래 70%) 오른쪽에 붙인다. 폭에 맞춰 채우면 위아래가 크게 잘려
      // 확대돼 보였다(대표 11-23). 그림 왼쪽 끝 24% 는 투명하게 풀어 흰 판에 녹인다 — 따로 구운 뒤 붙인다
      const src = this.textures.get(`home_bn_${art.ids[0]}`).getSourceImage() as HTMLImageElement;
      const dh = h * 1.2, dw = dh * src.width / src.height, dx = w - dw, dy = -(dh - h) * 0.3;
      const tmp = document.createElement('canvas');
      tmp.width = Math.ceil(dw * R);
      tmp.height = Math.ceil(dh * R);
      const tc = tmp.getContext('2d');
      if (tc) {
        tc.scale(R, R);
        tc.drawImage(src, 0, 0, dw, dh);
        tc.globalCompositeOperation = 'destination-in';
        const m = tc.createLinearGradient(0, 0, dw * 0.24, 0);
        m.addColorStop(0, 'rgba(0,0,0,0)');
        m.addColorStop(1, 'rgba(0,0,0,1)');
        tc.fillStyle = m;
        tc.fillRect(0, 0, dw, dh);
        ctx.drawImage(tmp, dx, dy, dw, dh);
      }
    } else {
      cover('menu_gacha_face', 0, 0, w, h, 0.75, 0.28);
    }
    // 왼쪽 흰 덮개 — 10% 까지 흰색, 24% 에 0.6, 42% 에 사라진다 (대표 11-23 「흰 부분 너무 넓다」 → 시안 「좁게」).
    // 좁은 판은 글이 판 폭에서 차지하는 몫이 커서 14% · 32% · 52% 로
    const fade = ctx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(narrow ? 0.14 : 0.1, 'rgba(255,255,255,1)');
    fade.addColorStop(narrow ? 0.32 : 0.24, 'rgba(255,255,255,0.6)');
    fade.addColorStop(narrow ? 0.52 : 0.42, 'rgba(255,255,255,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    // 테두리
    ctx.lineWidth = bw;
    ctx.strokeStyle = C.pull;
    rr(bw / 2);
    ctx.stroke();
    tex.refresh();
    return key;
  }

  /** 스토리 칸 — 스토리는 아직 게임에 없다. 자리만 잡고 「곧 열려요」, 누르면 준비 중 알림 */
  private createStoryCard(x: number, y: number, w: number, h: number, u: number) {
    const box = this.makeBox(x, y, w, h, () => this.showToast('스토리는 준비 중이에요', u), true);
    const r = 3.4 * u, px = 3 * u;
    box.add(this.add.graphics()
      .fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r)
      .lineStyle(1, C.navy, 0.1).strokeRoundedRect(-w / 2, -h / 2, w, h, r)
      .fillStyle(C.acc, 1).fillCircle(-w / 2 + px + 0.8 * u, -3.6 * u, 0.8 * u)
      .fillStyle(0xd6e4f5, 1).fillRoundedRect(-w / 2 + px, 4 * u, w - px * 2, 1.6 * u, 0.8 * u));
    box.add(this.add.text(-w / 2 + px + 2.6 * u, -3.6 * u, '스토리', { fontSize: this.fs(2.6, u), color: C.sub }).setOrigin(0, 0.5));
    box.add(this.add.text(-w / 2 + px, 0, '곧 열려요', { fontSize: this.fs(4.6, u), color: C.text, fontStyle: 'bold' }).setOrigin(0, 0.5));
  }

  /** 게임 시작 — 클래식 그림(하늘 · 도시 · 똥 무리)을 단추 면에, 남색 테두리 · 아래 턱, 흰 글자 + 남색 외곽선 */
  private createStartButton(x: number, y: number, w: number, h: number, u: number) {
    const bw = Math.max(2, 0.6 * u), lip = 1.4 * u, r = 3.4 * u, P = 6;
    const key = this.bakeStart(`home_start_${Math.round(w)}x${Math.round(h)}`, w, h, r, bw, lip, P);
    const box = this.makeBox(x, y, w, h, () => this.startGame(GameMode.CLASSIC));
    const texH = h + P * 2 + bw * 2 + lip;
    box.add(this.add.image(0, 0, key).setDisplaySize(w + P * 2 + bw * 2, texH).setOrigin(0.5, (P + bw + h / 2) / texH));

    const shine = this.add.image(-w / 2 - 10 * u, 0, bakeShine(this, 'home_shine', 70, 240))
      .setDisplaySize(12 * u, h * 1.5).setAngle(18).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.6);
    box.add(shine);
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff).fillRoundedRect(x, y, w, h, r);
    shine.setMask(maskG.createGeometryMask());
    this.tweens.add({ targets: shine, x: w / 2 + 10 * u, duration: 1100, repeat: -1, repeatDelay: 2200, ease: 'Cubic.easeInOut' });
    this.events.once('shutdown', () => maskG.destroy());

    const label = this.add.text(0, 0, '게임 시작', {
      fontSize: this.fs(6.8, u), color: '#ffffff', fontStyle: 'bold', stroke: '#0e1e36', strokeThickness: Math.max(3, 0.9 * u),
    }).setOrigin(0.5).setShadow(0, 0.8 * u, '#0e1e36', 0, true, false);
    const t = 3.4 * u, gap = 2 * u;
    const total = label.width + gap + t;
    label.setX(-total / 2 + label.width / 2);
    const tx = -total / 2 + label.width + gap;
    const tri = this.add.graphics()
      .fillStyle(0xffffff, 1).fillTriangle(tx, -2.2 * u, tx, 2.2 * u, tx + t, 0)
      .lineStyle(Math.max(1.5, 0.45 * u), C.navy, 1).strokeTriangle(tx, -2.2 * u, tx, 2.2 * u, tx + t, 0);
    box.add([label, tri]);
  }

  /** 시작 단추 그림 — 클래식 면 그림의 양끝 똥 무리만 이어 3:1 로, 가운데 어둡게, 남색 테두리 + 아래 턱 */
  private bakeStart(key: string, w: number, h: number, r: number, bw: number, lip: number, P: number): string {
    if (this.textures.exists(key)) return key;
    const R = 2;
    const TW = w + P * 2 + bw * 2, TH = h + P * 2 + bw * 2 + lip;
    const tex = this.textures.createCanvas(key, Math.round(TW * R), Math.round(TH * R));
    if (!tex) return key;
    const ctx = tex.getContext();
    ctx.scale(R, R);
    const bx = P + bw, by = P + bw;
    const rr = (x: number, y: number, ww: number, hh: number, rad: number) => {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, rad);
      ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
      ctx.arcTo(x, y + hh, x, y, rad);
      ctx.arcTo(x, y, x + ww, y, rad);
      ctx.closePath();
    };
    // 아래 턱 + 테두리 (남색 덩어리)
    ctx.fillStyle = '#0e1e36';
    rr(bx - bw, by - bw + lip, w + bw * 2, h + bw * 2, r + bw);
    ctx.fill();
    rr(bx - bw, by - bw, w + bw * 2, h + bw * 2, r + bw);
    ctx.fill();
    // 면 그림
    ctx.save();
    rr(bx, by, w, h, r);
    ctx.clip();
    ctx.fillStyle = '#3bb6ff';
    ctx.fillRect(bx, by, w, h);
    if (this.textures.exists('menu_classic_face')) {
      const src = this.textures.get('menu_classic_face').getSourceImage() as HTMLImageElement;
      const b = Math.round(src.height * 10 / 144);          // 원본 테두리 두께 (648×144 기준 10)
      const ih = src.height - b * 2, half = Math.round(ih * 1.5);
      ctx.drawImage(src, b, b, half, ih, bx, by, w / 2, h);
      ctx.drawImage(src, src.width - b - half, b, half, ih, bx + w / 2, by, w / 2, h);
    }
    const vg = ctx.createRadialGradient(bx + w / 2, by + h * 0.55, 0, bx + w / 2, by + h * 0.55, w * 0.42);
    vg.addColorStop(0, 'rgba(14,30,54,0.35)');
    vg.addColorStop(1, 'rgba(14,30,54,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(bx, by, w, h);
    ctx.restore();
    tex.refresh();
    return key;
  }

  /** 잠깐 뜨는 알림 글 (준비 중 등) — 하나만 */
  private showToast(msg: string, u: number) {
    this.toast?.destroy();
    const t = this.add.text(this.scale.width / 2, this.scale.height * 0.42, msg, {
      fontSize: this.fs(3.4, u), color: '#ffffff', fontStyle: 'bold', backgroundColor: 'rgba(14,30,54,0.88)',
      padding: { x: Math.round(4 * u), y: Math.round(2 * u) },
    }).setOrigin(0.5).setDepth(40).setAlpha(0);
    this.toast = t;
    this.tweens.add({
      targets: t, alpha: 1, duration: 140, yoyo: true, hold: 1200,
      onComplete: () => { t.destroy(); if (this.toast === t) this.toast = null; },
    });
  }


  // ── 설정 팝업 (A안) ─────────────────────────────────────────────────────
  // 나무 제목판 + 보라 판. 줄은 셋(소리 · 화면 효과 · 랭킹 이니셜)이고 줄 전체가 눌린다. 맨 아래 버전 정보 한 줄.
  // 시안: ddong-fx-work/settings/A_*.png · 아이콘은 assets/ui/settings/ (256 원본을 2배 크기로 줄인 것)

  private showSettingsPanel() {
    if (this.settingsPanel) return;

    const SW = this.scale.width, SH = this.scale.height;
    const cx = SW / 2;
    const pw = Math.min(400, SW - 24);
    const rowH = 70, rowGap = 8;
    const ph = 44 + 3 * (rowH + rowGap) + 56;
    const top = Math.round((SH - ph) / 2 + 10);      // 판 위 가장자리 (제목판이 반쯤 걸친다)
    const panelRect = new Phaser.Geom.Rectangle(cx - pw / 2, top - 26, pw, ph + 26);

    // 덮개 — 판 밖을 누르면 닫힌다. 판 안 빈자리는 덮개로 새지 않게 여기서 거른다
    const overlay = this.add.rectangle(cx, SH / 2, SW, SH, 0x000000, 0.55).setDepth(50).setInteractive();
    const panel = this.add.container(0, 0).setDepth(51);
    this.settingsPanel = panel;
    // 뒤 메뉴 버튼은 팝업이 떠 있는 동안 꺼 둔다 — 판 위를 누른 손가락이 뒤로 새지 않게
    this.menuButtons.forEach(b => b.disableInteractive());

    let initialsInput: HTMLInputElement | null = null;
    const closePanel = () => {
      initialsInput?.remove();
      initialsInput = null;
      overlay.destroy();
      panel.destroy();
      this.settingsPanel = null;
      this.menuButtons.forEach(b => { if (b.active) b.setInteractive().setScale(1); });
      this.events.off('shutdown', closePanel);
      this.checkResize();   // 떠 있는 동안 화면 크기가 바뀌었으면 이제 다시 그린다 (씬이 끝나는 중이면 안 한다)
    };
    this.events.once('shutdown', closePanel);
    overlay.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!panelRect.contains(p.x, p.y)) closePanel();
    });

    // 보라 판
    const { originY } = bakeButton(this, `set_panel_${pw}x${ph}`, {
      w: pw, h: ph, radius: 22, top: '#2a1460', bottom: '#120626', border: '#d38bff', borderW: 3,
      lip: '#3a1478', lipH: 6, gloss: 0, glow: 'rgba(190,110,255,0.67)',
    });
    panel.add(this.add.image(cx, top + ph / 2, `set_panel_${pw}x${ph}`).setOrigin(0.5, originY));

    // 나무 제목판
    const plank = bakeButton(this, 'set_title_plank', {
      w: 200, h: 52, radius: 16, top: '#c98a4a', bottom: '#8a5226', border: '#3a1f0a', borderW: 3,
      lip: '#5b3416', lipH: 5, gloss: 0,
    });
    panel.add(this.add.image(cx, top, 'set_title_plank').setOrigin(0.5, plank.originY));
    const title = this.add.text(cx, top - 1, '설정', {
      fontSize: '24px', fontStyle: 'bold', stroke: '#3a1f0a', strokeThickness: 4,
    }).setOrigin(0.5);
    gradientText(title, [[0, '#fff7c2'], [0.5, '#ffd34d'], [1, '#ff9f1a']]);
    panel.add(title);

    // 닫기 — 44x44 둥근 버튼, 판 오른쪽 위 모서리에 걸친다
    const close = this.add.container(cx + pw / 2 - 16, top + 6);
    const closeSkin = bakeButton(this, 'set_close', {
      w: 44, h: 44, radius: 22, top: '#f4f7fb', bottom: '#b8c2cf', border: '#2a3340', borderW: 2.5,
      lip: '#7a8594', lipH: 3, gloss: 0,
    });
    close.add(this.add.image(0, 0, 'set_close').setOrigin(0.5, closeSkin.originY));
    close.add(this.add.graphics().lineStyle(3, 0x2a3340).lineBetween(-7, -7, 7, 7).lineBetween(-7, 7, 7, -7));
    wireButton(this, close, 44, 44, closePanel);
    panel.add(close);

    const x0 = cx - pw / 2 + 16, x1 = cx + pw / 2 - 16, rw = x1 - x0;

    /** 줄 하나 — 반투명 바탕 · 아이콘 · 제목 · 설명. 줄 전체가 버튼이다. 오른쪽 조작부는 호출하는 쪽이 붙인다 */
    const makeRow = (i: number, icon: string, label: string, sub: string, onTap: () => void) => {
      const y = top + 44 + i * (rowH + rowGap) + rowH / 2;
      const row = this.add.container(cx, y);
      row.add(this.add.graphics().fillStyle(0xffffff, 0.08).fillRoundedRect(-rw / 2, -rowH / 2, rw, rowH, 14));
      const iconImg = this.add.image(-rw / 2 + 30, 0, icon).setDisplaySize(40, 40);
      row.add(iconImg);
      const t = this.add.text(-rw / 2 + 58, -10, label, { fontSize: '17px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0, 0.5);
      const s = this.add.text(-rw / 2 + 58, 12, sub, { fontSize: '11px', color: '#b9a3d6' }).setOrigin(0, 0.5);
      row.add([t, s]);
      wireButton(this, row, rw, rowH, onTap, true);
      panel.add(row);
      return { row, iconImg, title: t, sub: s };
    };

    /** 토글 — buttonSkin 판 (ON 초록 · OFF 회색) + 흰 손잡이. 줄 안 오른쪽에 둔다 */
    const makeToggle = (row: Phaser.GameObjects.Container, on: boolean) => {
      const tw = 64, th = 36;
      const keyOf = (v: boolean) => (v ? 'set_toggle_on' : 'set_toggle_off');
      let oy = 0.5;
      for (const v of [true, false]) {
        oy = bakeButton(this, keyOf(v), {
          w: tw, h: th, radius: th / 2, top: v ? '#8dff7a' : '#5a5d68', bottom: v ? '#16a83a' : '#2a2d36',
          border: v ? '#0a3a14' : '#15161c', borderW: 2, lip: v ? '#0d6a24' : '#0d0e12', lipH: 3, gloss: 0,
        }).originY;
      }
      const tx = rw / 2 - 44;
      const bg = this.add.image(tx, 0, keyOf(on)).setOrigin(0.5, oy);
      const knob = this.add.circle(0, 0, th / 2 - 4, 0xffffff).setStrokeStyle(1.5, 0x2a2d36);
      const txt = this.add.text(0, 0, '', { fontSize: '11px', fontStyle: 'bold' }).setOrigin(0.5);
      row.add([bg, knob, txt]);
      const set = (v: boolean) => {
        bg.setTexture(keyOf(v));
        knob.setX(tx + (v ? 1 : -1) * (tw / 2 - th / 2));
        txt.setX(tx + (v ? -10 : 10)).setText(v ? 'ON' : 'OFF').setColor(v ? '#0a3a14' : '#d0d3dc');
      };
      set(on);
      return set;
    };

    // 소리 — 런타임 상태(this.sound.mute)가 단일 진실. 저장은 setBgmMuted
    const soundIcon = (muted: boolean) => (muted ? 'set_icon_sound_off' : 'set_icon_sound');
    const sound = makeRow(0, soundIcon(this.sound.mute), '소리', '배경음악 (끄면 모든 소리 꺼짐)', () => {
      const muted = !this.sound.mute;
      this.sound.mute = muted;
      setBgmMuted(muted);
      setSound(!muted);
      sound.iconImg.setTexture(soundIcon(muted)).setDisplaySize(40, 40);
    });
    const setSound = makeToggle(sound.row, !this.sound.mute);

    // 화면 효과 — 빛 번짐(블룸). setBloomEnabled 가 저장하고 떠 있는 씬에도 바로 반영한다
    const fx = makeRow(1, 'set_icon_fx', '화면 효과', '빛 번짐 — 느린 기기면 꺼 두세요', () => {
      const on = !isFxBloomEnabled();
      setBloomEnabled(on);
      setFx(on);
    });
    const setFx = makeToggle(fx.row, isFxBloomEnabled());

    // 랭킹 이니셜 — 게임오버 입력과 같은 규칙 (영어 대문자 3자, setUserInitials 가 검증)
    let editing = false;
    const ini = makeRow(2, 'set_icon_nametag', '랭킹 이니셜', '랭킹에 표시되는 3글자', () => {
      if (editing) commitInitials(); else startInitials();
    });
    const subDefault = ini.sub.text;
    const bw = 60, bx = rw / 2 - 6 - bw / 2;
    const btnSkin = bakeButton(this, 'set_ini_btn', {
      w: bw, h: 44, radius: 14, top: '#fff3a8', bottom: '#ffb81a', border: '#7a4a00', borderW: 2,
      lip: '#a8650a', lipH: 4, gloss: 0,
    });
    const btnLabel = this.add.text(bx, 0, '변경', { fontSize: '15px', color: '#5b2e0e', fontStyle: 'bold' }).setOrigin(0.5);
    ini.row.add([this.add.image(bx, 0, 'set_ini_btn').setOrigin(0.5, btnSkin.originY), btnLabel]);
    // 글자 칸 — 제목·설명 오른쪽에 붙는다. 폭이 좁으면 칸을 줄인다
    const textRight = -rw / 2 + 58 + Math.max(ini.title.width, ini.sub.width) + 8;
    const tilesRight = bx - bw / 2 - 8;
    const tile = Math.max(20, Math.min(28, Math.floor((tilesRight - textRight - 8) / 3)));
    const tilesW = tile * 3 + 8;
    const tilesX = tilesRight - tilesW;
    const tileTexts: Phaser.GameObjects.Text[] = [];
    for (let k = 0; k < 3; k++) {
      const tx = tilesX + k * (tile + 4) + tile / 2;
      ini.row.add(this.add.rectangle(tx, 0, tile, tile, 0x000000, 0.86).setStrokeStyle(2, 0xffd700));
      const ch = this.add.text(tx, 0, '', { fontSize: `${Math.round(tile * 0.6)}px`, color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      tileTexts.push(ch);
      ini.row.add(ch);
    }
    const showInitials = () => {
      const s = getUserInitials() ?? '';
      tileTexts.forEach((t, k) => t.setText(s[k] ?? '-').setColor(s[k] ? '#ffffff' : '#6a6f80'));
    };
    showInitials();
    const setSub = (msg: string, err: boolean) => ini.sub.setText(msg).setColor(err ? '#ff6b6b' : '#b9a3d6');

    // 입력은 게임오버처럼 HTML input — 글자 칸 위에 겹쳐 띄운다 (캔버스 위치·스케일에 맞춘다)
    const startInitials = () => {
      editing = true;
      btnLabel.setText('저장');
      const rect = this.game.canvas.getBoundingClientRect();
      const kx = rect.width / SW, ky = rect.height / SH;
      const m = ini.row.getWorldTransformMatrix();
      const left = rect.left + (m.tx + tilesX - 2) * kx;
      const h = Math.max(44, tile + 8);
      const topPx = rect.top + (m.ty - h / 2) * ky;
      const el = document.createElement('input');
      el.type = 'text';
      el.maxLength = 3;
      el.placeholder = 'ABC';
      el.value = getUserInitials() ?? '';
      el.autocapitalize = 'characters';
      el.style.cssText = `
        position: fixed; left: ${left}px; top: ${topPx}px;
        width: ${Math.round((tilesW + 4) * kx)}px; height: ${Math.round(h * ky)}px;
        font-size: ${Math.round(tile * 0.7 * ky)}px; text-align: center; text-transform: uppercase;
        border: ${Math.max(2, Math.round(2 * ky))}px solid #FFD700; border-radius: 6px;
        background: #000; color: #fff; font-weight: bold; letter-spacing: ${Math.round(4 * kx)}px;
        outline: none; box-sizing: border-box; padding: 0; z-index: 9999;
      `;
      el.addEventListener('input', () => { el.value = el.value.toUpperCase().replace(/[^A-Z]/g, ''); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitInitials(); });
      document.body.appendChild(el);
      el.focus();
      initialsInput = el;
      setSub('영어 대문자 3자', false);
    };
    const commitInitials = () => {
      if (!initialsInput) return;
      const v = initialsInput.value.trim().toUpperCase();
      if (v.length !== 3) { setSub('정확히 3글자를 입력하세요', true); initialsInput.focus(); return; }
      if (!setUserInitials(v)) { setSub('영어 대문자만 입력하세요', true); initialsInput.focus(); return; }
      initialsInput.remove();
      initialsInput = null;
      editing = false;
      btnLabel.setText('변경');
      setSub(subDefault, false);
      showInitials();
    };

    // 버전 정보 — 릴리스 노트 최신 버전
    const vy = top + 44 + 3 * (rowH + rowGap) + 20;
    panel.add(this.add.image(x0 + 26, vy, 'set_icon_info').setDisplaySize(28, 28));
    panel.add(this.add.text(x0 + 50, vy, '버전 정보', { fontSize: '14px', color: '#e6e8ee', fontStyle: 'bold' }).setOrigin(0, 0.5));
    panel.add(this.add.text(x1 - 20, vy, RELEASE_NOTES[0]?.version ?? '', { fontSize: '13px', color: '#c9cdd8', fontStyle: 'bold' }).setOrigin(1, 0.5));
  }

  private startGame(mode: GameMode) {
    if (mode === GameMode.CLASSIC) {
      this.go('DifficultySelectScene', { gameMode: mode });
    } else {
      this.go('GameScene', { gameMode: mode, difficulty: 'HARD' });
    }
  }
}
