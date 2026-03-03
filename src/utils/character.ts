export interface CharacterDef {
  id: string;
  name: string;
  grade: '등급외' | 'R' | 'SR' | 'UR';
  gradeColor: string;   // hex 문자열 (UI용)
  imageKey: string;     // Phaser 텍스처 키 (카드용 스프라이트)
  imagePath: string;    // public/ 기준 경로
  illustKey: string;    // Phaser 텍스처 키 (일러스트 배경용)
  illustPath: string;   // public/ 기준 경로
  videoKey?: string;    // Phaser 비디오 키 (선택, 있으면 일러스트 클릭 시 재생)
  videoPath?: string;   // public/ 기준 경로 (선택)
  basicEffect: string;  // 기본 효과 설명 (상세 팝업용)
  specialAbility: string; // 특수 능력 설명 (없으면 '없음')
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
    videoKey: 'vid_chibi',
    videoPath: 'assets/vids/chibi.mp4',
    basicEffect: '없음',
    specialAbility: '없음',
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
    videoKey: 'vid_hacker',
    videoPath: 'assets/vids/hacker.mp4',
    basicEffect: '금똥·다이아똥 낙하 속도 감소',
    specialAbility: '100점마다 일반 똥 7개\n터미널 삭제',
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
    videoKey: 'vid_miner',
    videoPath: 'assets/vids/miner.mp4',
    basicEffect: '특수 똥 수집 시 +10점 추가',
    specialAbility: '200점마다 무지개똥 생성',
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
    videoKey: 'vid_maehwa',
    videoPath: 'assets/vids/maehwa.mp4',
    basicEffect: '이동 속도 +50px/s',
    specialAbility: '100점마다 위쪽 똥 3개\n칼로 제거',
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
    videoKey: 'vid_archieve',
    videoPath: 'assets/vids/archieve.mp4',
    basicEffect: '점수 획득 속도 1.1배',
    specialAbility: '200점마다 +20점 보너스',
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
    videoKey: 'vid_glitch',
    videoPath: 'assets/vids/glitch.mp4',
    basicEffect: '잔상 분신이 특수 똥 수집',
    specialAbility: '200점마다 특수 똥 위치에\n분신 소환',
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
    videoKey: 'vid_noise',
    videoPath: 'assets/vids/noise.mp4',
    basicEffect: '특수 똥 생성 주기 25% 단축',
    specialAbility: '200점마다 다음 소환\n2개 감소',
  },
  // ── R등급 ──────────────────────────────────────────────────────────────
  {
    id: 'log',
    name: '로그',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'log_front',
    imagePath: 'assets/players/log_front.webp',
    illustKey: 'illust_log',
    illustPath: 'assets/illustrations/log.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'swap',
    name: '스왑',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'swap_front',
    imagePath: 'assets/players/swap_front.webp',
    illustKey: 'illust_swap',
    illustPath: 'assets/illustrations/swap.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'sum',
    name: '섬',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'sum_front',
    imagePath: 'assets/players/sum_front.webp',
    illustKey: 'illust_sum',
    illustPath: 'assets/illustrations/sum.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'fork',
    name: '포크',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'fork_front',
    imagePath: 'assets/players/fork_front.webp',
    illustKey: 'illust_fork',
    illustPath: 'assets/illustrations/fork.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'seed',
    name: '시드',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'seed_front',
    imagePath: 'assets/players/seed_front.webp',
    illustKey: 'illust_seed',
    illustPath: 'assets/illustrations/seed.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'session',
    name: '세션',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'session_front',
    imagePath: 'assets/players/session_front.webp',
    illustKey: 'illust_session',
    illustPath: 'assets/illustrations/session.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'branch',
    name: '브랜치',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'branch_front',
    imagePath: 'assets/players/branch_front.webp',
    illustKey: 'illust_branch',
    illustPath: 'assets/illustrations/branch.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'hook',
    name: '훅',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'hook_front',
    imagePath: 'assets/players/hook_front.webp',
    illustKey: 'illust_hook',
    illustPath: 'assets/illustrations/hook.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'socket',
    name: '소켓',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'socket_front',
    imagePath: 'assets/players/socket_front.webp',
    illustKey: 'illust_socket',
    illustPath: 'assets/illustrations/socket.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  {
    id: 'index',
    name: '인덱스',
    grade: 'R',
    gradeColor: '#44cc88',
    imageKey: 'index_front',
    imagePath: 'assets/players/index_front.webp',
    illustKey: 'illust_index',
    illustPath: 'assets/illustrations/index.png',
    basicEffect: '특수 똥 수집 시 +1점 추가',
    specialAbility: '없음',
  },
  // ── UR등급 ─────────────────────────────────────────────────────────────
  {
    id: 'sentinel',
    name: '센티넬',
    grade: 'UR',
    gradeColor: '#ffaa00',
    imageKey: 'sentinel_front',
    imagePath: 'assets/players/sentinel_front.webp',
    illustKey: 'illust_sentinel',
    illustPath: 'assets/illustrations/sentinel.png',
    videoKey: 'vid_sentinel',
    videoPath: 'assets/vids/sentinel.mp4',
    basicEffect: '시작 시 보호막 1개 보유',
    specialAbility: '300점마다 보호막 충전\n(최대 3개)',
  },
  {
    id: 'legacy',
    name: '레거시',
    grade: 'UR',
    gradeColor: '#ffaa00',
    imageKey: 'legacy_front',
    imagePath: 'assets/players/legacy_front.webp',
    illustKey: 'illust_legacy',
    illustPath: 'assets/illustrations/legacy.png',
    videoKey: 'vid_legacy',
    videoPath: 'assets/vids/legacy.mp4',
    basicEffect: '시작 6초간 금똥 피버 타임',
    specialAbility: '500점마다 점수 1.2배\n모드 10초 발동',
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
