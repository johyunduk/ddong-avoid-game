import Phaser from 'phaser';
import { BattleChannel } from '../utils/battleChannel';
import { BattleEvent, type ReadyPayload } from '../types/BattleTypes';
import {
  getSafeSelectedCharacter,
  getOwnedCharacters,
  getCharacterDef,
  getGradeImgKey,
  type CharacterDef,
} from '../utils/character';
import { supabase } from '../utils/supabase';
import {
  getAuthUserId,
  findOrCreateMatch,
  pollMatchStatus,
  cancelMatchmaking,
  type MatchResult,
} from '../utils/matchmaking';
import { getBattleTier, preloadTierImages } from '../utils/battleTier';
import { getMyRating, getCachedMyRating, setCachedMyRating, clearCachedMyRating } from '../utils/battleLeaderboard';
import BaseScene from './BaseScene';

/**
 * 대전 매칭 씬 — 상태별 UI 전환
 *
 * 상태: MENU → CREATE_WAITING / JOIN_INPUT → READY_BUTTON → COUNTDOWN → BATTLE
 */
export default class BattleMatchScene extends BaseScene {
  private battleChannel: BattleChannel | null = null;
  private inputElement: HTMLInputElement | null = null;
  private isHost: boolean = false;
  private myReady: boolean = false;
  private opponentReady: boolean = false;
  private countdownStarted: boolean = false;
  private readyButtonShown: boolean = false;
  private readyRetryTimer: ReturnType<typeof setInterval> | null = null;
  private userId: string = '';
  private opponentUserId: string = '';
  private autoRematch: { code: string; isHost: boolean; userId: string } | null = null;

  // 랭크 매칭
  private isRanked: boolean = false;
  private isMatchmaking: boolean = false;
  private rankMatchPollTimer: ReturnType<typeof setInterval> | null = null;

  // 상대 캐릭터 (READY 수신 후 채워짐)
  private opponentCharId: string = '';
  private opponentCharImg: Phaser.GameObjects.Image | null = null;
  private opponentCharNameTxt: Phaser.GameObjects.Text | null = null;
  private opponentCharGradeTxt: Phaser.GameObjects.Text | null = null;
  private opponentCharGradeImg: Phaser.GameObjects.Image | null = null;
  private opponentCharPlaceholder: Phaser.GameObjects.Text | null = null;

  // 상태별 UI 요소를 그룹으로 관리 → 상태 전환 시 일괄 파괴
  private uiGroup: Phaser.GameObjects.GameObject[] = [];
  private uiTimers: Phaser.Time.TimerEvent[] = [];

  // 내 랭크 뱃지 (showMenu 안에서 생성 → uiGroup에 포함)
  private cachedMyRp: number | null = null;
  private cachedMyRank: number | null = null;
  private rankBadgeImg: Phaser.GameObjects.Image | null = null;
  private rankBadgeNameTxt: Phaser.GameObjects.Text | null = null;
  private rankBadgeRpTxt: Phaser.GameObjects.Text | null = null;
  private rankBadgeRankTxt: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('BattleMatchScene');
  }

  init(data: { autoRematch?: { code: string; isHost: boolean; userId: string } }) {
    this.autoRematch = data.autoRematch ?? null;
    this.isRanked = false;
    this.isMatchmaking = false;
    this.opponentCharId = '';
    this.opponentCharImg = null;
    this.opponentCharNameTxt = null;
    this.opponentCharGradeTxt = null;
    this.opponentCharGradeImg = null;
    this.opponentCharPlaceholder = null;
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    // 보유 캐릭터 front 이미지 사전 로드 (Phaser 캐시에 있으면 중복 로드 없음)
    for (const id of getOwnedCharacters()) {
      const def = getCharacterDef(id);
      if (!this.textures.exists(def.imageKey)) {
        this.load.image(def.imageKey, def.imagePath);
      }
    }
    preloadTierImages(this);
    if (!this.textures.exists('grade_r'))  this.load.image('grade_r',  'assets/character_ranks/r.png');
    if (!this.textures.exists('grade_sr')) this.load.image('grade_sr', 'assets/character_ranks/sr.png');
    if (!this.textures.exists('grade_ur')) this.load.image('grade_ur', 'assets/character_ranks/ur.png');
  }

  create() {
    super.create();

    // 배경 (모든 상태에서 유지)
    const bg = this.add.image(200, 300, 'background2');
    bg.setDisplaySize(400, 600);
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.6);

    // 타이틀 (모든 상태에서 유지)
    this.add.text(200, 45, '⚔️ 대전 모드', {
      fontSize: '34px',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(200, 85, 'EXTREME 난이도로 1대1 대전!', {
      fontSize: '15px',
      color: '#dddddd',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // 뒤로가기 (모든 상태에서 유지)
    const backBtn = this.add.text(200, 562, '← 메인 메뉴', {
      fontSize: '18px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
    backBtn.on('pointerout', () => backBtn.setColor('#aaaaaa'));
    backBtn.on('pointerdown', () => this.goBack());

    // 유저 ID: 재도전이면 전달받은 ID 사용, 아니면 비동기 조회
    if (this.autoRematch?.userId) {
      this.userId = this.autoRematch.userId;
    } else {
      this.userId = `anon-${Date.now()}`;
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.id) this.userId = data.user.id;
      });
    }

    // 내 랭크 비동기 조회 (비크리티컬 — 실패해도 무시)
    this.fetchMyRating();

    // 초기 상태: 재도전이면 자동 참가, 아니면 메뉴
    if (this.autoRematch) {
      this.handleAutoRematch(this.autoRematch.code, this.autoRematch.isHost);
    } else {
      this.showMenu();
    }
  }

  /** 현재 상태의 UI 요소 일괄 파괴 */
  private clearUI() {
    this.removeInput();
    for (const obj of this.uiGroup) {
      if (obj.active) obj.destroy();
    }
    this.uiGroup = [];
    // TimerEvent는 GameObject가 아니므로 별도 정리
    for (const timer of this.uiTimers) {
      timer.remove();
    }
    this.uiTimers = [];
  }

  /** UI 요소를 그룹에 추가 (나중에 일괄 파괴용) */
  private ui<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.uiGroup.push(obj);
    return obj;
  }

  // ─── 상태 1: 메뉴 (방 만들기 / 방 참가 선택) ─────────────────────

  private showMenu() {
    this.clearUI();

    // ── 정보 카드 (캐릭터 좌측 | 랭크 우측) ──────────────────────
    const def = getCharacterDef(getSafeSelectedCharacter());
    const stars = def.grade === 'UR' ? '★★★'
      : def.grade === 'SR' ? '★★'
      : def.grade === 'R'  ? '★'
      : def.grade;

    this.ui(this.add.rectangle(200, 200, 374, 190, 0x0d1b2a, 0.9)
      .setStrokeStyle(1, 0x334466));

    // 구분선
    const divGfx = this.add.graphics();
    divGfx.lineStyle(1, 0x334466, 0.8);
    divGfx.lineBetween(203, 110, 203, 290);
    this.ui(divGfx);

    // 캐릭터 이미지
    if (this.textures.exists(def.imageKey)) {
      this.ui(this.add.image(62, 200, def.imageKey).setDisplaySize(68, 96));
    }
    this.ui(this.add.text(95, 162, def.name, {
      fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5));
    this.ui(this.add.text(95, 190, stars, {
      fontSize: '15px', color: def.gradeColor,
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5));
    const menuGradeKey = getGradeImgKey(def.grade);
    if (menuGradeKey) {
      this.ui(this.add.image(95, 215, menuGradeKey).setDisplaySize(30, 30).setOrigin(0, 0.5));
    }

    // 랭크 뱃지 (우측)
    this.ui(this.add.text(295, 117, '내 랭크', {
      fontSize: '12px', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5));
    this.rankBadgeImg = this.ui(
      this.add.image(248, 200, 'rank_alpha').setDisplaySize(74, 74).setAlpha(0),
    );
    this.rankBadgeNameTxt = this.ui(this.add.text(288, 162, '---', {
      fontSize: '15px', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5));
    this.rankBadgeRpTxt = this.ui(this.add.text(288, 184, '···', {
      fontSize: '14px', color: '#bbbbbb', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5));
    this.rankBadgeRankTxt = this.ui(this.add.text(288, 207, '', {
      fontSize: '13px', color: '#999999', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5));

    // 캐시된 데이터가 있으면 즉시 반영
    if (this.cachedMyRp !== null) {
      this.updateRankBadge(this.cachedMyRp, this.cachedMyRank);
    }

    // ── 1행: 캐릭터 선택 | 전적 보기 (좌우 나란히) ──────────────
    const charBtn = this.ui(this.add.rectangle(100, 328, 175, 48, 0x1a3a5c));
    charBtn.setStrokeStyle(2, 0x4499dd);
    this.ui(this.add.text(100, 328, '👤 캐릭터 선택', {
      fontSize: '15px', color: '#aaddff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    charBtn.setInteractive({ useHandCursor: true });
    charBtn.on('pointerover', () => charBtn.setFillStyle(0x254d70));
    charBtn.on('pointerout', () => charBtn.setFillStyle(0x1a3a5c));
    charBtn.on('pointerdown', () => {
      this.scene.start('CharacterSelectScene', { returnScene: 'BattleMatchScene' });
    });

    const recordBtn = this.ui(this.add.rectangle(300, 328, 175, 48, 0x1a2a1a));
    recordBtn.setStrokeStyle(2, 0x44aa44);
    this.ui(this.add.text(300, 328, '🏆 전적 보기', {
      fontSize: '15px', color: '#88ee88', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    recordBtn.setInteractive({ useHandCursor: true });
    recordBtn.on('pointerover', () => recordBtn.setFillStyle(0x254d25));
    recordBtn.on('pointerout', () => recordBtn.setFillStyle(0x1a2a1a));
    recordBtn.on('pointerdown', () => this.scene.start('BattleLeaderboardScene'));

    // ── 2행: 랭크 매칭 (전체 너비) ───────────────────────────────
    const rankedBtn = this.ui(this.add.rectangle(200, 392, 374, 56, 0x7a5c00));
    rankedBtn.setStrokeStyle(2, 0xFFD700);
    this.ui(this.add.text(200, 392, '🎖️ 랭크 매칭', {
      fontSize: '22px', color: '#FFD700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));
    rankedBtn.setInteractive({ useHandCursor: true });
    rankedBtn.on('pointerover', () => rankedBtn.setFillStyle(0xa07a00));
    rankedBtn.on('pointerout', () => rankedBtn.setFillStyle(0x7a5c00));
    rankedBtn.on('pointerdown', () => this.startRankedMatchmaking());

    // ── 친선전 버튼 (좌우 나란히) ─────────────────────────────────
    this.ui(this.add.text(200, 462, '─── 친선전 (RP 없음) ───', {
      fontSize: '15px', color: '#cccccc',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    const createBtn = this.ui(this.add.rectangle(100, 500, 175, 48, 0xc0392b));
    createBtn.setStrokeStyle(2, 0xffffff);
    this.ui(this.add.text(100, 500, '🏠 방 만들기', {
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    createBtn.setInteractive({ useHandCursor: true });
    createBtn.on('pointerover', () => createBtn.setFillStyle(0xe74c3c));
    createBtn.on('pointerout', () => createBtn.setFillStyle(0xc0392b));
    createBtn.on('pointerdown', () => this.handleCreateRoom());

    const joinBtn = this.ui(this.add.rectangle(300, 500, 175, 48, 0x2471a3));
    joinBtn.setStrokeStyle(2, 0xffffff);
    this.ui(this.add.text(300, 500, '🔗 방 참가', {
      fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    joinBtn.setInteractive({ useHandCursor: true });
    joinBtn.on('pointerover', () => joinBtn.setFillStyle(0x3498db));
    joinBtn.on('pointerout', () => joinBtn.setFillStyle(0x2471a3));
    joinBtn.on('pointerdown', () => this.showJoinInput());
  }

  /** 내 RP/티어 조회 — localStorage 캐시로 즉시 표시 후 API 응답으로 갱신 */
  private async fetchMyRating() {
    // 1) 캐시 즉시 반영
    const cached = getCachedMyRating();
    if (cached) {
      this.cachedMyRp = cached.rp;
      this.cachedMyRank = cached.rank;
      this.updateRankBadge(cached.rp, cached.rank);
    }

    // 2) API 호출 후 캐시 갱신 + UI 업데이트
    try {
      const stats = await getMyRating();
      if (stats) {
        this.cachedMyRp = stats.ratingPoints;
        this.cachedMyRank = stats.rank;
        setCachedMyRating(stats.ratingPoints, stats.rank);
        this.updateRankBadge(stats.ratingPoints, stats.rank);
      } else {
        // 전적 없음: 캐시 삭제 + 배지 숨김
        clearCachedMyRating();
        this.cachedMyRp = null;
        this.cachedMyRank = null;
        this.rankBadgeImg?.setAlpha(0);
        this.rankBadgeNameTxt?.setText('---').setColor('#aaaaaa');
        this.rankBadgeRpTxt?.setText('첫 게임 도전!').setColor('#aaaaaa');
        this.rankBadgeRankTxt?.setText('');
      }
    } catch {
      // 비크리티컬 — 캐시값 그대로 유지
    }
  }

  /** 메뉴 내 랭크 뱃지 UI 갱신 */
  private updateRankBadge(rp: number, rank: number | null) {
    const tier = getBattleTier(rp);
    if (this.rankBadgeImg?.active) {
      this.rankBadgeImg.setTexture(tier.imgKey).setDisplaySize(74, 74).setAlpha(1);
    }
    if (this.rankBadgeNameTxt?.active) {
      this.rankBadgeNameTxt.setText(tier.name).setColor(tier.color);
    }
    if (this.rankBadgeRpTxt?.active) {
      this.rankBadgeRpTxt.setText(`${rp} RP`).setColor('#dddddd');
    }
    if (this.rankBadgeRankTxt?.active) {
      this.rankBadgeRankTxt.setText(rank !== null ? `(${rank}위)` : '첫 게임 도전!').setColor('#aaaaaa');
    }
  }

  // ─── 랭크 매칭 ─────────────────────────────────────────────────

  private async startRankedMatchmaking() {
    if (this.isMatchmaking || this.battleChannel) return;
    this.isMatchmaking = true;

    try {
      // 인증 보장 (익명 로그인 포함)
      this.userId = await getAuthUserId();
    } catch {
      this.isMatchmaking = false;
      return;
    }

    this.showRankedWaiting();

    let result: MatchResult;
    try {
      result = await findOrCreateMatch(this.userId);
    } catch {
      this.isMatchmaking = false;
      this.showMenu();
      return;
    }

    if (result.status === 'matched') {
      this.onRankedMatchFound(result);
      return;
    }

    // 대기 중 — 2초마다 폴링
    this.rankMatchPollTimer = setInterval(async () => {
      try {
        const poll = await pollMatchStatus(this.userId);
        if (poll?.status === 'matched') {
          this.clearRankedPoll();
          this.onRankedMatchFound(poll);
        }
      } catch {
        // 네트워크 오류 시 계속 재시도
      }
    }, 2000);
  }

  private showRankedWaiting() {
    this.clearUI();

    this.ui(this.add.text(200, 225, '🎖️ 랭크 매칭 중...', {
      fontSize: '26px', color: '#FFD700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5));

    const subText = this.ui(this.add.text(200, 278, '상대를 찾고 있습니다', {
      fontSize: '16px', color: '#cccccc',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    let elapsed = 0;
    const elapsedText = this.ui(this.add.text(200, 315, '0초 경과', {
      fontSize: '15px', color: '#999999',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    this.uiTimers.push(this.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        elapsed++;
        if (!elapsedText.active) return;
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        const timeStr = m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}초`;
        (elapsedText as Phaser.GameObjects.Text).setText(`${timeStr} 경과`);

        // 1분 초과 시 안내 메시지
        if (elapsed === 60 && subText.active) {
          (subText as Phaser.GameObjects.Text)
            .setText('현재 대기 중인 상대가 없습니다\n계속 기다리거나 취소해주세요')
            .setColor('#ff9944')
            .setAlign('center');
        }
      },
    }));

    // 취소 버튼
    const cancelBtn = this.ui(this.add.rectangle(200, 410, 220, 54, 0x444444));
    cancelBtn.setStrokeStyle(2, 0xaaaaaa);
    this.ui(this.add.text(200, 410, '취소', {
      fontSize: '20px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    cancelBtn.setInteractive({ useHandCursor: true });
    cancelBtn.on('pointerover', () => cancelBtn.setFillStyle(0x666666));
    cancelBtn.on('pointerout', () => cancelBtn.setFillStyle(0x444444));
    cancelBtn.on('pointerdown', () => this.cancelRankedMatchmaking());
  }

  private async cancelRankedMatchmaking() {
    this.clearRankedPoll();
    this.isMatchmaking = false;
    await cancelMatchmaking(this.userId).catch(() => {});
    this.showMenu();
  }

  private clearRankedPoll() {
    if (this.rankMatchPollTimer) {
      clearInterval(this.rankMatchPollTimer);
      this.rankMatchPollTimer = null;
    }
  }

  private async onRankedMatchFound(match: MatchResult) {
    if (!match.roomCode || match.isHost === null || !match.opponentId) return;
    this.isRanked = true;
    this.isMatchmaking = false;

    // 대기열에서 제거 (fire-and-forget)
    cancelMatchmaking(this.userId).catch(() => {});

    await this.handleRankedJoin(match.roomCode, match.isHost, match.opponentId);
  }

  private async handleRankedJoin(roomCode: string, asHost: boolean, opponentId: string) {
    if (this.battleChannel) return;
    this.opponentUserId = opponentId;
    this.resetMatchState(asHost);

    this.clearUI();
    this.ui(this.add.text(200, 290, '✅ 매칭 완료!', {
      fontSize: '24px', color: '#00ff88', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));

    await this.initChannel(roomCode, asHost);
    this.time.delayedCall(800, () => this.showReadyButton());
  }

  // ─── 공통 상태 리셋 + 채널 초기화 ──────────────────────────────

  /** handleCreateRoom / doJoin / handleAutoRematch 공통 초기화 */
  private resetMatchState(asHost: boolean) {
    this.isHost = asHost;
    this.myReady = false;
    this.opponentReady = false;
    this.countdownStarted = false;
    this.readyButtonShown = false;
  }

  /** 채널 생성 → 리스너 등록 → 구독 → 캐릭터 알림 (4곳 공통 흐름) */
  private async initChannel(code: string, asHost: boolean): Promise<void> {
    this.battleChannel = new BattleChannel();
    if (asHost) {
      this.battleChannel.createRoom(code, this.userId);
    } else {
      this.battleChannel.joinRoom(code, this.userId);
    }
    this.setupChannelListeners();
    await this.battleChannel.subscribe();
    // subscribe 대기 중 뒤로 가기 / shutdown으로 채널이 해제됐을 수 있음
    if (!this.battleChannel) return;
    this.battleChannel.sendCharAnnounce(getSafeSelectedCharacter());
  }

  // ─── 재도전 자동 입장 ─────────────────────────────────────────

  private async handleAutoRematch(code: string, isHost: boolean) {
    if (this.battleChannel) return;
    this.resetMatchState(isHost);

    // 재도전 중 안내 UI
    this.clearUI();
    this.ui(this.add.text(200, 290, '🔄 재도전 연결 중...', {
      fontSize: '20px', color: '#00ff88', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));

    await this.initChannel(code, isHost);
    this.showReadyButton();
  }

  // ─── 상태 2a: 방 생성 대기 ─────────────────────────────────────

  private async handleCreateRoom() {
    if (this.battleChannel) return;
    this.resetMatchState(true);

    const code = BattleChannel.generateRoomCode();
    // showCreateWaiting을 먼저 호출해야 함:
    // await initChannel 대기 중 onPresenceJoin이 발화해 showReadyButton()이 실행될 수 있는데,
    // 그 뒤에 showCreateWaiting → clearUI()가 오면 ready UI가 파괴되고 호스트가 대기 화면에 stuck됨
    this.showCreateWaiting(code);
    await this.initChannel(code, true);
  }

  private showCreateWaiting(code: string) {
    this.clearUI();

    this.ui(this.add.text(200, 200, '초대 코드', {
      fontSize: '16px', color: '#aaaaaa',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    this.ui(this.add.text(200, 260, code, {
      fontSize: '56px', color: '#FFD700', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 6, letterSpacing: 10,
    }).setOrigin(0.5));

    this.ui(this.add.text(200, 330, '상대방에게 코드를 알려주세요', {
      fontSize: '15px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // 대기 애니메이션 점
    const dots = this.ui(this.add.text(200, 370, '대기 중', {
      fontSize: '16px', color: '#888888',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    let dotCount = 0;
    this.uiTimers.push(
      this.time.addEvent({
        delay: 500,
        loop: true,
        callback: () => {
          dotCount = (dotCount + 1) % 4;
          if (dots.active) dots.setText('대기 중' + '.'.repeat(dotCount));
        },
      })
    );
  }

  // ─── 상태 2b: 코드 입력 (방 참가) ──────────────────────────────

  private showJoinInput() {
    this.clearUI();

    this.ui(this.add.text(200, 200, '방 코드 입력', {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // Phaser 캔버스 좌표 → DOM 좌표 변환
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / 400;
    const scaleY = rect.height / 600;

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 4;
    input.placeholder = 'CODE';
    input.style.cssText = `
      position: fixed;
      left: ${rect.left + 200 * scaleX}px;
      top: ${rect.top + 270 * scaleY}px;
      transform: translateX(-50%);
      width: ${Math.round(200 * scaleX)}px;
      height: ${Math.round(55 * scaleY)}px;
      font-size: ${Math.round(30 * scaleY)}px;
      text-align: center;
      text-transform: uppercase;
      border: 3px solid #FFD700;
      border-radius: 12px;
      background: #1a1a2e;
      color: #FFD700;
      font-weight: bold;
      letter-spacing: ${Math.round(10 * scaleX)}px;
      outline: none;
      z-index: 9999;
    `;
    document.body.appendChild(input);
    input.focus();
    this.inputElement = input;

    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    // 에러 메시지 영역
    const errorText = this.ui(this.add.text(200, 330, '', {
      fontSize: '14px', color: '#ff4444',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // 참가 버튼
    const joinBtn = this.ui(this.add.rectangle(200, 390, 220, 55, 0x1e8449));
    joinBtn.setStrokeStyle(3, 0xffffff);
    this.ui(this.add.text(200, 390, '참가하기', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    joinBtn.setInteractive({ useHandCursor: true });
    joinBtn.on('pointerover', () => joinBtn.setAlpha(0.8));
    joinBtn.on('pointerout', () => joinBtn.setAlpha(1));

    const doJoin = async () => {
      if (this.battleChannel) return; // 이미 연결 시도 중 (중복 클릭 방지)

      const code = input.value.trim().toUpperCase();
      if (code.length !== 4) {
        errorText.setText('4자리 코드를 입력하세요');
        return;
      }

      errorText.setColor('#00ff88').setText('⏳ 연결 중...');
      joinBtn.disableInteractive();
      this.resetMatchState(false);
      await this.initChannel(code, false);
      if (!this.battleChannel) return; // subscribe 대기 중 뒤로 가기
      this.showReadyButton();
    };

    joinBtn.on('pointerdown', doJoin);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doJoin();
    });

    // 뒤로 (메뉴로)
    const backText = this.ui(this.add.text(200, 470, '← 돌아가기', {
      fontSize: '16px', color: '#aaaaaa',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }));
    backText.on('pointerover', () => (backText as Phaser.GameObjects.Text).setColor('#ffffff'));
    backText.on('pointerout', () => (backText as Phaser.GameObjects.Text).setColor('#aaaaaa'));
    backText.on('pointerdown', () => this.showMenu());
  }

  // ─── 상태 3: 준비완료 버튼 ──────────────────────────────────────

  private showReadyButton() {
    if (this.readyButtonShown) return;
    this.readyButtonShown = true;
    this.clearUI();

    const myDef = getCharacterDef(getSafeSelectedCharacter());

    // 모드 배지
    const modeLabel = this.isRanked ? '🎖️ 랭크 매칭' : '🏠 친선전';
    const modeLabelColor = this.isRanked ? '#FFD700' : '#aaaaaa';
    this.ui(this.add.text(200, 155, modeLabel, {
      fontSize: '14px', color: modeLabelColor,
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    this.ui(this.add.text(200, 180, '상대방과 연결되었습니다!', {
      fontSize: '18px', color: '#00ff88', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // ── VS 레이블 ─────────────────────────────────────────────────
    this.ui(this.add.text(96, 215, '나', {
      fontSize: '15px', color: '#aaaaaa', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    this.ui(this.add.text(200, 213, 'VS', {
      fontSize: '22px', color: '#ff4444', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5));
    this.ui(this.add.text(304, 215, '상대', {
      fontSize: '15px', color: '#aaaaaa', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // ── 내 캐릭터 (왼쪽) ─────────────────────────────────────────
    this.ui(this.add.rectangle(96, 280, 92, 104, 0x000033, 0.7)
      .setStrokeStyle(2, 0x4466ff));
    if (this.textures.exists(myDef.imageKey)) {
      this.ui(this.add.image(96, 280, myDef.imageKey).setDisplaySize(60, 86));
    }
    this.ui(this.add.text(96, 342, myDef.name, {
      fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    const myGradeKey = getGradeImgKey(myDef.grade);
    if (myGradeKey) {
      this.ui(this.add.image(96, 362, myGradeKey).setDisplaySize(28, 28).setOrigin(0.5));
    }

    // ── 상대 캐릭터 (오른쪽) ─────────────────────────────────────
    this.ui(this.add.rectangle(304, 280, 92, 104, 0x330000, 0.7)
      .setStrokeStyle(2, 0xff4444));

    // 항상 플레이스홀더 먼저 생성 — updateOpponentCharDisplay가 이 객체를 기준으로 업데이트
    this.opponentCharPlaceholder = this.ui(this.add.text(304, 280, '?', {
      fontSize: '42px', color: '#555555', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));
    this.opponentCharNameTxt = this.ui(this.add.text(304, 342, '대기 중...', {
      fontSize: '14px', color: '#666666', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5));
    this.opponentCharGradeTxt = this.ui(this.add.text(304, 362, '', {
      fontSize: '13px', color: '#666666',
    }).setOrigin(0.5));
    // grade image will be set in updateOpponentCharDisplay

    // 이미 캐릭터를 알고 있으면 즉시 표시
    if (this.opponentCharId) {
      this.showOpponentCharacter(this.opponentCharId);
    }

    // ── 준비 버튼 ─────────────────────────────────────────────────
    this.ui(this.add.text(200, 400, '캐릭터를 확인하고 준비하세요', {
      fontSize: '13px', color: '#bbbbbb', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5));

    const readyBtn = this.ui(this.add.rectangle(200, 440, 270, 64, 0x1e8449));
    readyBtn.setStrokeStyle(3, 0xffffff);
    this.ui(this.add.text(200, 440, '✅ 준비완료', {
      fontSize: '24px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));
    readyBtn.setInteractive({ useHandCursor: true });
    readyBtn.on('pointerover', () => readyBtn.setFillStyle(0x27ae60));
    readyBtn.on('pointerout', () => readyBtn.setFillStyle(0x1e8449));
    readyBtn.on('pointerdown', () => this.doSendReady());
  }

  /** 상대 캐릭터 정보 표시 (READY 수신 시 또는 ready 화면 진입 시 호출) */
  private showOpponentCharacter(charId: string) {
    try {
      const def = getCharacterDef(charId);
      if (this.textures.exists(def.imageKey)) {
        this.updateOpponentCharDisplay(def);
      } else {
        this.load.image(def.imageKey, def.imagePath);
        this.load.once('complete', () => {
          if (this.scene.isActive()) this.updateOpponentCharDisplay(def);
        });
        this.load.start();
      }
    } catch {
      // 알 수 없는 캐릭터 ID 무시
    }
  }

  private updateOpponentCharDisplay(def: CharacterDef) {
    // 플레이스홀더 제거
    if (this.opponentCharPlaceholder?.active) {
      this.opponentCharPlaceholder.destroy();
      this.opponentCharPlaceholder = null;
    }
    // 이미지
    if (this.opponentCharImg?.active) {
      this.opponentCharImg.setTexture(def.imageKey).setDisplaySize(58, 82);
    } else if (this.opponentCharNameTxt?.active) {
      // 아직 이미지가 없고 UI는 살아있음 → 새로 생성
      this.opponentCharImg = this.add.image(304, 280, def.imageKey).setDisplaySize(58, 82);
      this.uiGroup.push(this.opponentCharImg);
    }
    // 이름 / 등급
    if (this.opponentCharNameTxt?.active) this.opponentCharNameTxt.setText(def.name).setColor('#ffffff');
    if (this.opponentCharGradeTxt?.active) this.opponentCharGradeTxt.setText('');
    // 등급 이미지 — 기존 이미지 교체
    if (this.opponentCharGradeImg?.active) {
      this.opponentCharGradeImg.destroy();
      this.opponentCharGradeImg = null;
    }
    const oppGradeKey = getGradeImgKey(def.grade);
    if (oppGradeKey && this.opponentCharNameTxt?.active) {
      this.opponentCharGradeImg = this.add.image(304, 362, oppGradeKey).setDisplaySize(28, 28).setOrigin(0.5);
      this.uiGroup.push(this.opponentCharGradeImg);
    }
  }

  // ─── 채널 이벤트 ───────────────────────────────────────────────

  private setupChannelListeners() {
    if (!this.battleChannel) return;

    // Presence join — 상대 입장 감지 → 내 캐릭터 재알림 + 호스트는 준비 버튼 표시
    this.battleChannel.onPresenceJoin(() => {
      // 늦게 접속한 상대가 내 캐릭터를 모를 수 있으므로 재전송
      this.battleChannel?.sendCharAnnounce(getSafeSelectedCharacter());
      if (this.isHost) this.showReadyButton();
    });

    this.battleChannel.onPresenceLeave(() => {
      this.opponentReady = false;
      this.ui(this.add.text(200, 420, '⚠️ 상대방이 나갔습니다', {
        fontSize: '16px', color: '#ff4444',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5));
    });

    // CHAR_ANNOUNCE: 채널 연결 직후 상대 캐릭터 자동 수신
    this.battleChannel.onEvent(BattleEvent.CHAR_ANNOUNCE, (payload) => {
      if (payload.characterId && payload.characterId !== this.opponentCharId) {
        this.opponentCharId = payload.characterId;
        if (this.readyButtonShown) this.showOpponentCharacter(payload.characterId);
      }
    });

    // READY 수신 = 상대 준비 완료 + 캐릭터 정보
    this.battleChannel.onEvent(BattleEvent.READY, (payload: ReadyPayload) => {
      this.opponentReady = true;
      if (payload.userId) this.opponentUserId = payload.userId;
      if (payload.characterId) {
        this.opponentCharId = payload.characterId;
        if (this.readyButtonShown) this.showOpponentCharacter(payload.characterId);
      }
      if (this.isHost) this.showReadyButton();
      this.checkBothReady();
    });

    this.battleChannel.onEvent(BattleEvent.GAME_START, () => {
      if (!this.countdownStarted) {
        this.countdownStarted = true;
        this.showCountdown();
      }
    });
  }

  /** ready 전송 (준비완료 버튼에서 호출) */
  private doSendReady() {
    if (!this.battleChannel || this.myReady) return;
    this.myReady = true;
    const charId = getSafeSelectedCharacter();
    this.battleChannel.sendReady(charId);

    // UI 갱신: 상대 대기 화면
    this.clearUI();
    this.ui(this.add.text(200, 270, '✅ 준비 완료!', {
      fontSize: '24px', color: '#00ff00', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5));
    this.ui(this.add.text(200, 320, '상대를 기다리는 중...', {
      fontSize: '16px', color: '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5));

    // READY를 주기적으로 재전송 — 네트워크/타이밍 이슈로 상대가 수신 못했을 때 대비
    // setInterval 사용 (Phaser 타이머는 백그라운드 탭에서 멈추므로)
    this.clearReadyRetry();
    this.readyRetryTimer = setInterval(() => {
      if (this.countdownStarted || !this.battleChannel) {
        this.clearReadyRetry();
        return;
      }
      this.battleChannel.sendReady(charId);
    }, 1500);

    this.checkBothReady();
  }

  private clearReadyRetry() {
    if (this.readyRetryTimer) {
      clearInterval(this.readyRetryTimer);
      this.readyRetryTimer = null;
    }
  }

  private checkBothReady() {
    if (this.myReady && this.opponentReady && this.isHost && !this.countdownStarted) {
      this.countdownStarted = true;
      this.battleChannel?.sendGameStart(Date.now());
      this.showCountdown();
    }
  }

  // ─── 상태 4: 카운트다운 ────────────────────────────────────────

  private showCountdown() {
    this.clearUI();

    let count = 3;
    const countText = this.ui(this.add.text(200, 280, `${count}`, {
      fontSize: '90px', color: '#ff4444', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5));

    const timer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        count--;
        if (count > 0) {
          (countText as Phaser.GameObjects.Text).setText(`${count}`);
        } else {
          (countText as Phaser.GameObjects.Text).setText('GO!');
          (countText as Phaser.GameObjects.Text).setColor('#00ff00');
          timer.remove();
          this.time.delayedCall(500, () => this.goToBattle());
        }
      },
      repeat: 2,
    });
  }

  // ─── 씬 전환 ──────────────────────────────────────────────────

  private goToBattle() {
    this.clearReadyRetry();
    const roomCode = this.battleChannel?.code ?? '';
    const userId = this.userId;

    // 동기식 채널 제거: supabase.channel()이 싱글턴이므로
    // removeChannel을 먼저 호출해야 BattleGameScene에서 새 채널 생성 가능
    if (this.battleChannel) {
      this.battleChannel.destroyImmediate();
      this.battleChannel = null;
    }

    this.scene.start('BattleGameScene', { roomCode, userId, opponentId: this.opponentUserId, isRanked: this.isRanked });
  }

  private removeInput() {
    if (this.inputElement) {
      this.inputElement.remove();
      this.inputElement = null;
    }
  }

  private async goBack() {
    this.clearReadyRetry();
    this.clearRankedPoll();
    this.removeInput();
    if (this.isMatchmaking) {
      this.isMatchmaking = false;
      cancelMatchmaking(this.userId).catch(() => {});
    }
    if (this.battleChannel) {
      await this.battleChannel.destroy();
      this.battleChannel = null;
    }
    this.scene.start('ModeSelectScene');
  }

  shutdown() {
    this.clearReadyRetry();
    this.clearRankedPoll();
    this.removeInput();
    if (this.isMatchmaking) {
      this.isMatchmaking = false;
      cancelMatchmaking(this.userId).catch(() => {});
    }
    if (this.battleChannel) {
      this.battleChannel.destroyImmediate();
      this.battleChannel = null;
    }
  }
}
