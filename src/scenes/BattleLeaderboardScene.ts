import type Phaser from 'phaser';
import { supabase } from '../utils/supabase';
import { getBattleLeaderboard, type BattleRecordEntry } from '../utils/battleLeaderboard';
import { getBattleTier } from '../utils/battleTier';
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
  }

  create() {
    super.create();

    // 배경
    const bg = this.add.image(200, 300, 'background2');
    bg.setDisplaySize(400, 600);
    this.add.rectangle(200, 300, 400, 600, 0x000000, 0.75);

    // 타이틀
    this.add.text(200, 40, '⚔️ 배틀 전적', {
      fontSize: '28px',
      color: '#ff4444',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    // 내 전적 영역 (로드 후 채워짐)
    this.loadingText = this.add.text(200, 300, '로딩 중...', {
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    // 뒤로가기
    const backBtn = this.add.text(200, 565, '← 대전 모드', {
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

      this.add.text(200, 300, '전적을 불러올 수 없습니다\n나중에 다시 시도해주세요', {
        fontSize: '16px',
        color: '#ff6666',
        stroke: '#000',
        strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5);
    }
  }

  private displayLeaderboard() {
    // 기존 텍스트 제거
    for (const obj of this.leaderboardTexts) {
      if (obj.active) obj.destroy();
    }
    this.leaderboardTexts = [];

    // 내 전적 요약
    if (this.currentUserRank) {
      const { winRate, rank, ratingPoints, friendlyWins, friendlyLosses, friendlyDisconnects } = this.currentUserRank;
      const myEntry = this.leaderboardEntries.find(e => e.userId === this.currentUserId);
      const wins = myEntry?.wins ?? 0;
      const losses = myEntry?.losses ?? 0;
      const disconnects = myEntry?.disconnects ?? 0;
      const myTier = getBattleTier(ratingPoints);

      // 랭크 전적
      const rankSummary = this.add.text(
        200, 78,
        `${myTier.icon} ${myTier.name} | ${ratingPoints} RP | 랭크: ${wins}승 ${disconnects}부 ${losses}패 | ${winRate}% (${rank}위)`,
        { fontSize: '11px', color: '#FFD700', stroke: '#000', strokeThickness: 3 },
      ).setOrigin(0.5);
      this.leaderboardTexts.push(rankSummary);

      // 친선전 전적
      const fw = friendlyWins ?? 0;
      const fl = friendlyLosses ?? 0;
      const fd = friendlyDisconnects ?? 0;
      const friendlySummary = this.add.text(
        200, 97,
        `친선전: ${fw}승 ${fd}부 ${fl}패`,
        { fontSize: '11px', color: '#88ccff', stroke: '#000', strokeThickness: 3 },
      ).setOrigin(0.5);
      this.leaderboardTexts.push(friendlySummary);
    }

    // 구분선
    const divider = this.add.rectangle(200, 115, 360, 2, 0x555555);
    this.leaderboardTexts.push(divider);

    // 헤더
    const header = this.add.text(200, 133, '순위  이름   티어      RP    승률', {
      fontSize: '13px',
      color: '#ffff00',
      fontStyle: 'bold',
      fontFamily: 'monospace',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.leaderboardTexts.push(header);

    if (this.leaderboardEntries.length === 0) {
      const noData = this.add.text(200, 300, '아직 대전 기록이 없습니다\n첫 번째 플레이어가 되어보세요!', {
        fontSize: '16px',
        color: '#cccccc',
        stroke: '#000',
        strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5);
      this.leaderboardTexts.push(noData);
      return;
    }

    const startY = 160;
    const lineH = 31;

    this.leaderboardEntries.forEach((entry, index) => {
      const y = startY + index * lineH;
      const isMe = entry.userId === this.currentUserId;
      const tier = getBattleTier(entry.ratingPoints);

      // 현재 유저 행 하이라이트
      if (isMe) {
        const highlight = this.add.rectangle(200, y, 380, 28, 0x8B6914, 0.5);
        this.leaderboardTexts.push(highlight);
      }

      // 순위 색상
      let color = '#ffffff';
      if (entry.rank === 1) color = '#FFD700';
      else if (entry.rank === 2) color = '#C0C0C0';
      else if (entry.rank === 3) color = '#CD7F32';
      else if (isMe) color = '#FFD700';

      const rankStr = `${entry.rank}`.padStart(2, ' ');
      const nameStr = entry.userName.padEnd(5, ' ');
      const tierStr = `${tier.icon}${tier.name}`.padEnd(7, ' ');
      const rpStr = `${entry.ratingPoints}`.padStart(4, ' ');
      const rateStr = `${entry.winRate}%`.padStart(5, ' ');

      const text = this.add.text(
        200, y,
        `${rankStr}  ${nameStr}  ${tierStr}  ${rpStr}  ${rateStr}`,
        {
          fontSize: '13px',
          color,
          fontFamily: 'monospace',
          stroke: '#000',
          strokeThickness: 3,
        },
      ).setOrigin(0.5);
      this.leaderboardTexts.push(text);
    });
  }
}
