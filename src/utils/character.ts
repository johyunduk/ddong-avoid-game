export interface CharacterDef {
  id: string;
  name: string;
  grade: '등급외' | 'R' | 'SR' | 'UR';
  gradeColor: string;   // hex 문자열 (UI용)
  imageKey: string;     // Phaser 텍스처 키 (카드용 스프라이트)
  imagePath: string;    // public/ 기준 경로
  illustKey: string;    // Phaser 텍스처 키 (일러스트 배경용)
  illustPath: string;   // public/ 기준 경로
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'chibi',
    name: '치비',
    grade: '등급외',
    gradeColor: '#aaaaaa',
    imageKey: 'chibi_front',
    imagePath: 'assets/players/chibi_front.webp',
    illustKey: 'illust_chibi',
    illustPath: 'assets/illustrations/chibi.png',
  },
  {
    id: 'hacker',
    name: '루트',
    grade: 'SR',
    gradeColor: '#4488ff',
    imageKey: 'hacker_front',
    imagePath: 'assets/players/hacker_front.webp',
    illustKey: 'illust_hacker',
    illustPath: 'assets/illustrations/hacker.png',
  },
  {
    id: 'miner',
    name: '광부',
    grade: 'SR',
    gradeColor: '#4488ff',
    imageKey: 'miner_front',
    imagePath: 'assets/players/miner_front.webp',
    illustKey: 'illust_miner',
    illustPath: 'assets/illustrations/miner.png',
  },
  {
    id: 'maehwa',
    name: '매화',
    grade: 'SR',
    gradeColor: '#4488ff',
    imageKey: 'maehwa_front',
    imagePath: 'assets/players/maehwa_front.webp',
    illustKey: 'illust_maehwa',
    illustPath: 'assets/illustrations/maehwa.png',
  },
  {
    id: 'archieve',
    name: '아카이브',
    grade: 'SR',
    gradeColor: '#4488ff',
    imageKey: 'archieve_front',
    imagePath: 'assets/players/archieve_front.webp',
    illustKey: 'illust_archieve',
    illustPath: 'assets/illustrations/archieve.png',
  },
  {
    id: 'glitch',
    name: '글리치',
    grade: 'SR',
    gradeColor: '#4488ff',
    imageKey: 'glitch_front',
    imagePath: 'assets/players/glitch_front.webp',
    illustKey: 'illust_glitch',
    illustPath: 'assets/illustrations/glitch.png',
  },
  {
    id: 'noise',
    name: '노이즈',
    grade: 'SR',
    gradeColor: '#4488ff',
    imageKey: 'noise_front',
    imagePath: 'assets/players/noise_front.webp',
    illustKey: 'illust_noise',
    illustPath: 'assets/illustrations/noise.png',
  },
  {
    id: 'sentinel',
    name: '센티넬',
    grade: 'UR',
    gradeColor: '#ffaa00',
    imageKey: 'sentinel_front',
    imagePath: 'assets/players/sentinel_front.webp',
    illustKey: 'illust_sentinel',
    illustPath: 'assets/illustrations/sentinel.png',
  },
  {
    id: 'legacy',
    name: '레거시',
    grade: 'UR',
    gradeColor: '#ffaa00',
    imageKey: 'illust_legacy',
    imagePath: 'assets/illustrations/legacy.png',
    illustKey: 'illust_legacy',
    illustPath: 'assets/illustrations/legacy.png',
  },
];

const OWNED_KEY = 'ownedCharacters';
const SELECTED_KEY = 'selectedCharacter';

/** 보유 캐릭터 목록 반환. 항상 chibi 포함. */
export function getOwnedCharacters(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes('chibi')) list.unshift('chibi');
    return list;
  } catch {
    return ['chibi'];
  }
}

/** 캐릭터를 보유 목록에 추가 (뽑기 완료 후 호출) */
export function addOwnedCharacter(id: string): void {
  const owned = getOwnedCharacters();
  if (!owned.includes(id)) {
    owned.push(id);
    localStorage.setItem(OWNED_KEY, JSON.stringify(owned));
  }
}

/** 선택된 캐릭터 ID 반환. 없으면 'chibi'. */
export function getSelectedCharacter(): string {
  return localStorage.getItem(SELECTED_KEY) ?? 'chibi';
}

/** 선택된 캐릭터 저장 */
export function setSelectedCharacter(id: string): void {
  localStorage.setItem(SELECTED_KEY, id);
}

/** 캐릭터 정의 조회 */
export function getCharacterDef(id: string): CharacterDef {
  return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
}
