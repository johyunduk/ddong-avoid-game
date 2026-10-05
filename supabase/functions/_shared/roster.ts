// 이 파일은 생성된 것이다. 손으로 고치지 마라.
//   생성: node scripts/gen-roster.mjs
//   정본: src/utils/character.ts 의 CHARACTERS
//   검사: scripts/check-roster.mjs (verify.ps1 에 물려 있다)
//
// Edge Function 은 Deno 라 src/ 를 번들에 넣지 못한다. 그래서 서버가 캐릭터 명단을
// 알아야 할 때는 이 사본을 읽는다. 예전에는 명단을 손으로 베껴 뒀고, 그게 어긋나
// red·ted·heidi 로 플레이해도 랭킹에 chibi 로 저장됐다.

/** 게임에 등록된 캐릭터 id 전체 (26종) */
export const CHARACTER_IDS: readonly string[] = [
  'chibi',
  'mugi',
  'gumi',
  'sentinel',
  'legacy',
  'ted',
  'heidi',
  'red',
  'k',
  'knight',
  'hacker',
  'miner',
  'maehwa',
  'archieve',
  'glitch',
  'noise',
  'log',
  'swap',
  'sum',
  'fork',
  'seed',
  'session',
  'branch',
  'hook',
  'socket',
  'index',
];

/** id → 등급 */
export const CHARACTER_GRADES: Readonly<Record<string, string>> = {
  chibi:      'R',
  mugi:       'UR',
  gumi:       'UR',
  sentinel:   'UR',
  legacy:     'UR',
  ted:        'SR',
  heidi:      'SR',
  red:        'SR',
  k:          'SR',
  knight:     'SR',
  hacker:     'SR',
  miner:      'SR',
  maehwa:     'SR',
  archieve:   'SR',
  glitch:     'SR',
  noise:      'SR',
  log:        'R',
  swap:       'R',
  sum:        'R',
  fork:       'R',
  seed:       'R',
  session:    'R',
  branch:     'R',
  hook:       'R',
  socket:     'R',
  index:      'R',
};

/** 저장 허용 여부 — 모르는 id 는 거른다 */
export function isKnownCharacter(id: unknown): id is string {
  return typeof id === 'string' && CHARACTER_IDS.includes(id);
}
