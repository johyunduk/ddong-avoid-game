export interface UnlockCondition {
  type: 'topaz' | 'gold' | 'diamond' | 'playCount' | 'skor' | 'gacha';
  threshold: number;
}

export interface StoryLog {
  id: string;
  title: string;
  season: number;
  unlockCondition: UnlockCondition;
  pages: string[];
}
