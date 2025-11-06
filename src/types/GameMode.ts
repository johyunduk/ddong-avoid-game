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

// 난이도 타입 정의
export const Difficulty = {
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard',
  EXTREME: 'extreme'
} as const;

export type Difficulty = typeof Difficulty[keyof typeof Difficulty];

export interface DifficultyConfig {
  difficulty: Difficulty;
  name: string;
  description: string;
  poopCount: number;
  baseSpeed: number;
  spawnDelay: number; // 초기 똥 생성 주기 (ms)
  color: number;
}

export const DIFFICULTIES: DifficultyConfig[] = [
  {
    difficulty: Difficulty.EASY,
    name: 'EASY',
    description: '천천히 시작해보세요',
    poopCount: 4,
    baseSpeed: 125,
    spawnDelay: 1500, // 1.5초마다 생성
    color: 0x90EE90
  },
  {
    difficulty: Difficulty.NORMAL,
    name: 'NORMAL',
    description: '적당한 난이도',
    poopCount: 5,
    baseSpeed: 150,
    spawnDelay: 1200, // 1.2초마다 생성
    color: 0xFFD700
  },
  {
    difficulty: Difficulty.HARD,
    name: 'HARD',
    description: '진짜 게임은 이제부터!',
    poopCount: 6,
    baseSpeed: 200,
    spawnDelay: 1000, // 1초마다 생성 (기존과 동일)
    color: 0xFF8C00
  },
  {
    difficulty: Difficulty.EXTREME,
    name: 'EXTREME',
    description: '극한의 도전!',
    poopCount: 8,
    baseSpeed: 250,
    spawnDelay: 800, // 0.8초마다 생성
    color: 0xFF4500
  }
];
