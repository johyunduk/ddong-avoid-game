import type Phaser from 'phaser';
import { supabase } from '../utils/supabase';
import { getBattleLeaderboard, type BattleRecordEntry } from '../utils/battleLeaderboard';
import { getBattleTier, preloadTierImages } from '../utils/battleTier';
import BaseScene from './BaseScene';

export default class BattleLeaderboardScene extends BaseScene {
  private leaderboardEntries: BattleRecordEntry[] = [];
  private leaderboardTexts: Phaser.GameObjects.GameObject[] = [];
  private loadingText?: Phaser.GameObjects.Text;
  private currentUserRank: {
    rank: number;
    totalWins: number;
    winRate: number;
    ratingPoints: number;
    friendlyWins: number;
    friendlyLosses: number;
    friendlyDisconnects: number;
  } | null = null;
  private currentUserId: string | null = null;

  constructor() {
    super('BattleLeaderboardScene');
  }

  preload() {
    if (!this.textures.exists('background2')) {
      this.load.image('background2', 'assets/backgrounds/background2.webp');
    }
    preloadTierImages(this);
  }

  create() {
    super.create();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const yOff = (H - 600) / 2;

    // 배경
    const bg = this.add.image(cx, H / 2, 'background2');
    bg.setDisplaySize(W, H);
    this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.75);

    // 타이틀
    this.add.text(cx, 40 + yOff, '⚔️ 배틀 전적', {
      fontSize: '28px',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    // 내 전적 영역 (로드 후 채워짐)
    this.loadingText = this.add.text(cx, H / 2, '로딩 중...', {
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // 뒤로가기
    const backBtn = this.add.text(cx, H - 35, '← 대전 모드', {
      fontSize: '18px',
      color: '#aaaaaa',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on('pointerover', () => backBtn.setColor('#ffffff'));
    backBtn.on('pointerout', () => backBtn.setColor('#aaaaaa'));
    backBtn.on('pointerdown', () => this.scene.start('BattleMatchScene'));

    // currentUserId를 먼저 확인한 뒤 리더보드 로드 (race condition 방지)
    supabase.auth.getUser()
      .then(({ data }) => {
        if (data.user?.id) this.currentUserId = data.user.id;
        return this.loadLeaderboard();
      })
      .catch(() => this.loadLeaderboard());
  }

  private async loadLeaderboard() {
    try {
      const response = await getBattleLeaderboard(20);
      this.leaderboardEntries = response.leaderboard;
      this.currentUserRank = response.currentUserRank;

      if (this.loadingText) {
        this.loadingText.setVisible(false);
      }

      this.displayLeaderboard();
    } catch (error) {
      console.error('Failed to load battle leaderboard:', error);

      if (this.loadingText) {
        this.loadingText.setVisible(false);
      }

      this.add.text(this.scale.width / 2, this.scale.height / 2, '전적을 불러올 수 없습니다\n나중에 다시 시도해주세요', {
        fontSize: '16px',
        color: '#ff6666',
        stroke: '#000',
        strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5);
    }
  }

  private displayLeaderboard() {
    // 기존 객체 제거
    for (const obj of this.leaderboardTexts) {
      if (obj.active) obj.destroy();
    }
    this.leaderboardTexts = [];

    const cx = this.scale.width / 2;
    const yOff = (this.scale.height - 600) / 2;

    // 컬럼 X 위치 (캔버스 400px 기준)
    const COL_RANK   = 28;   // right-align
    const COL_NAME   = 44;   // left-align
    const COL_TIER_IMG  = 148;  // image center
    const COL_TIER_NAME = 162;  // left-align
    const COL_RP     = 258;  // right-align
    const COL_RATE   = 362;  // right-align

    const txtStyle = (color: string) => ({
      fontSize: '13px', color, fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 3,
    });

    // 내 전적 요약
    if (this.currentUserRank) {
      const { winRate, rank, ratingPoints, friendlyWins, friendlyLosses, friendlyDisconnects } = this.currentUserRank;
      const myEntry = this.leaderboardEntries.find(e => e.userId === this.currentUserId);
      const wins = myEntry?.wins ?? 0;
      const losses = myEntry?.losses ?? 0;
      const disconnects = myEntry?.disconnects ?? 0;
      const myTier = getBattleTier(ratingPoints);

      // 티어 이미지 (좌측 소형)
      const myTierImg = this.add.image(13, 78 + yOff, myTier.imgKey).setDisplaySize(20, 20);
      this.leaderboardTexts.push(myTierImg);

      // 랭크 전적
      const rankSummary = this.add.text(
        cx, 78 + yOff,
        `${myTier.name} | ${ratingPoints} RP | 랭크: ${wins}승 ${disconnects}부 ${losses}패 | ${winRate}% (${rank}위)`,
        { fontSize: '11px', color: '#FFD700', stroke: '#000', strokeThickness: 3 },
      ).setOrigin(0.5);
      this.leaderboardTexts.push(rankSummary);

      // 친선전 전적
      const fw = friendlyWins ?? 0;
      const fl = friendlyLosses ?? 0;
      const fd = friendlyDisconnects ?? 0;
      const friendlySummary = this.add.text(
        cx, 97 + yOff,
        `친선전: ${fw}승 ${fd}부 ${fl}패`,
        { fontSize: '11px', color: '#88ccff', stroke: '#000', strokeThickness: 3 },
      ).setOrigin(0.5);
      this.leaderboardTexts.push(friendlySummary);
    }

    // 구분선
    const divider = this.add.rectangle(cx, 115 + yOff, 360, 2, 0x555555);
    this.leaderboardTexts.push(divider);

    // 헤더
    const headerStyle = { fontSize: '13px', color: '#ffff00', fontStyle: 'bold', fontFamily: 'monospace', stroke: '#000', strokeThickness: 3 };
    this.leaderboardTexts.push(this.add.text(COL_RANK,      133 + yOff, '순위', headerStyle).setOrigin(1, 0.5));
    this.leaderboardTexts.push(this.add.text(COL_NAME,      133 + yOff, '이름', headerStyle).setOrigin(0, 0.5));
    this.leaderboardTexts.push(this.add.text(COL_TIER_IMG,  133 + yOff, '티어', headerStyle).setOrigin(0.5, 0.5));
    this.leaderboardTexts.push(this.add.text(COL_RP,        133 + yOff, 'RP',   headerStyle).setOrigin(1, 0.5));
    this.leaderboardTexts.push(this.add.text(COL_RATE,      133 + yOff, '승률', headerStyle).setOrigin(1, 0.5));

    if (this.leaderboardEntries.length === 0) {
      const noData = this.add.text(cx, this.scale.height / 2, '아직 대전 기록이 없습니다\n첫 번째 플레이어가 되어보세요!', {
        fontSize: '16px', color: '#cccccc', stroke: '#000', strokeThickness: 3, align: 'center',
      }).setOrigin(0.5);
      this.leaderboardTexts.push(noData);
      return;
    }

    const startY = 160 + yOff;
    const lineH = 31;

    this.leaderboardEntries.forEach((entry, index) => {
      const y = startY + index * lineH;
      const isMe = entry.userId === this.currentUserId;
      const tier = getBattleTier(entry.ratingPoints);

      // 현재 유저 행 하이라이트
      if (isMe) {
        this.leaderboardTexts.push(this.add.rectangle(cx, y, 380, 28, 0x8B6914, 0.5));
      }

      // 순위 색상
      let color = '#ffffff';
      if (entry.rank === 1) color = '#FFD700';
      else if (entry.rank === 2) color = '#C0C0C0';
      else if (entry.rank === 3) color = '#CD7F32';
      else if (isMe) color = '#FFD700';

      this.leaderboardTexts.push(
        this.add.text(COL_RANK, y, `${entry.rank}`, txtStyle(color)).setOrigin(1, 0.5),
      );
      this.leaderboardTexts.push(
        this.add.text(COL_NAME, y, entry.userName, txtStyle(color)).setOrigin(0, 0.5),
      );
      // 티어 이미지
      this.leaderboardTexts.push(
        this.add.image(COL_TIER_IMG, y, tier.imgKey).setDisplaySize(20, 20),
      );
      this.leaderboardTexts.push(
        this.add.text(COL_TIER_NAME, y, tier.name, txtStyle(tier.color)).setOrigin(0, 0.5),
      );
      this.leaderboardTexts.push(
        this.add.text(COL_RP, y, `${entry.ratingPoints}`, txtStyle(color)).setOrigin(1, 0.5),
      );
      this.leaderboardTexts.push(
        this.add.text(COL_RATE, y, `${entry.winRate}%`, txtStyle(color)).setOrigin(1, 0.5),
      );
    });
  }
}
