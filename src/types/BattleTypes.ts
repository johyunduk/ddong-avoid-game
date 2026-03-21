/**
 * 1대1 대전 모드 타입 정의
 */

// 대전 결과
export const BattleResult = {
  WIN: 'win',
  LOSE: 'lose',
  DISCONNECT: 'disconnect',
} as const;
export type BattleResult = typeof BattleResult[keyof typeof BattleResult];

// ── Broadcast 이벤트 Payload 타입 ──

export interface ReadyPayload {
  userId: string;
  characterId: string;
}

export interface GameStartPayload {
  timestamp: number;
}

export interface SendPoopPayload {
  count: number;
}

export interface ScoreUpdatePayload {
  score: number;
}

export interface GameOverPayload {
  userId: string;
  finalScore: number;
}

// Broadcast 이벤트 이름
export const BattleEvent = {
  READY: 'ready',
  GAME_START: 'game-start',
  SEND_POOP: 'send-poop',
  SCORE_UPDATE: 'score-update',
  GAME_OVER: 'game-over',
} as const;
export type BattleEvent = typeof BattleEvent[keyof typeof BattleEvent];
