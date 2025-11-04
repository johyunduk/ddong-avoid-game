// erasableSyntaxOnly 설정 때문에 enum 대신 const object 사용
export const GameMode = {
  CLASSIC: 'classic',
  ITEM: 'item'
} as const;

export type GameMode = typeof GameMode[keyof typeof GameMode];

export interface GameModeConfig {
  mode: GameMode;
  name: string;
  description: string;
}

export const GAME_MODES: GameModeConfig[] = [
  {
    mode: GameMode.CLASSIC,
    name: '클래식 모드',
    description: '떨어지는 똥을 피하세요!'
  },
  {
    mode: GameMode.ITEM,
    name: '아이템 모드',
    description: '아이템을 획득하여 게임을 유리하게!'
  }
];
