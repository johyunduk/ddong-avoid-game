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
    specialAbility: '100점마다 일반 똥 7개 터미널 삭제',
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
    specialAbility: '100점마다 위쪽 똥 3개 칼로 제거',
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
    specialAbility: '200점마다 특수 똥 위치에 분신 소환',
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
    specialAbility: '200점마다 다음 소환 2개 감소',
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
    basicEffect: '시작 시 보호막 2개 보유 (피격 흡수 시 주변 똥 전기로 제거)',
    specialAbility: '300점마다 보호막 1개 충전 (최대 3개)',
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
    basicEffect: '시작 6초 금똥 피버 + 황금 빗줄기 / 스폰마다 30% 확률로 똥 2개 불태워 소멸 (+10점)',
    specialAbility: '500점마다 10초간 레거시 모드: 점수 1.2배 · 황금 빗줄기 강화 · 불태우기 60% 확률 4개 소멸',
  },
];

/** duplicate_count → 각성 단계 계산 (모든 등급 최대 ★5) */
export function getAwakeningLevel(grade: string, duplicateCount: number): number {
  if (grade === 'R') {
    if (duplicateCount >= 100) return 5;
    if (duplicateCount >= 75)  return 4;
    if (duplicateCount >= 50)  return 3;
    if (duplicateCount >= 25)  return 2;
    if (duplicateCount >= 10)  return 1;
  } else if (grade === 'SR') {
    if (duplicateCount >= 40) return 5;
    if (duplicateCount >= 25) return 4;
    if (duplicateCount >= 15) return 3;
    if (duplicateCount >= 7)  return 2;
    if (duplicateCount >= 3)  return 1;
  } else if (grade === 'UR') {
    if (duplicateCount >= 10) return 5;
    if (duplicateCount >= 6)  return 4;
    if (duplicateCount >= 4)  return 3;
    if (duplicateCount >= 2)  return 2;
    if (duplicateCount >= 1)  return 1;
  }
  return 0;
}

const DUPES_KEY     = 'duplicateCounts';
const DUPES_SIG_KEY = 'duplicateCountsSig';
const _DUPES_SALT   = 'ddong-dupes-\u0076\u0032';

/** djb2 해시 — key:value 쌍을 정렬 후 직렬화해 서명 */
function _signDupes(map: Record<string, number>): string {
  const str = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',') + _DUPES_SALT;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function _saveDupes(map: Record<string, number>): void {
  localStorage.setItem(DUPES_KEY, JSON.stringify(map));
  localStorage.setItem(DUPES_SIG_KEY, _signDupes(map));
}

/** 캐릭터별 중복 획득 횟수 반환. 서명 불일치 시 변조로 판단해 전체 초기화. */
export function getDuplicateCount(id: string): number {
  try {
    const raw = localStorage.getItem(DUPES_KEY);
    const sig = localStorage.getItem(DUPES_SIG_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};

    if (sig === null) {
      // 서명 미존재 → 기존 데이터 마이그레이션: 신뢰하고 서명 최초 발급
      _saveDupes(map);
      return map[id] ?? 0;
    }

    // 서명 불일치 → 변조로 판단, 전체 초기화
    if (sig !== _signDupes(map)) {
      _saveDupes({});
      return 0;
    }

    return map[id] ?? 0;
  } catch {
    return 0;
  }
}

/** 캐릭터별 중복 획득 횟수 저장 (뽑기 완료 후 호출) */
export function setDuplicateCount(id: string, count: number): void {
  try {
    const raw = localStorage.getItem(DUPES_KEY);
    const sig = localStorage.getItem(DUPES_SIG_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};

    // 변조된 상태에서 쓰기 시도 → 기존 맵 무시하고 새로 시작
    if (sig !== null && sig !== _signDupes(map)) {
      _saveDupes({ [id]: count });
      return;
    }

    map[id] = count;
    _saveDupes(map);
  } catch { /* ignore */ }
}

const OWNED_KEY = 'ownedCharacters';
const OWNED_SIG_KEY = 'ownedCharactersSig';
const SELECTED_KEY = 'selectedCharacter';
const _SIG_SALT = 'ddong-v2-\u0073\u006b\u006f\u0072';

/** djb2 해시 → base36 문자열 (무결성 서명용) */
function _sign(list: string[]): string {
  const str = [...list].sort().join(',') + _SIG_SALT;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** 보유 목록과 서명을 함께 저장 (내부 전용) */
function _saveOwned(list: string[]): void {
  localStorage.setItem(OWNED_KEY, JSON.stringify(list));
  localStorage.setItem(OWNED_SIG_KEY, _sign(list));
}

/** 보유 캐릭터 목록 반환. 서명 불일치 시 변조로 판단하여 초기화. */
export function getOwnedCharacters(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_KEY);
    const sig = localStorage.getItem(OWNED_SIG_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes('chibi')) list.unshift('chibi');

    if (sig === null) {
      // 서명 미존재 → 기존 데이터 마이그레이션: 목록을 신뢰하고 서명 최초 발급
      _saveOwned(list);
      return list;
    }

    // 서명 존재하지만 불일치 → 변조로 판단, chibi만 남김
    if (sig !== _sign(list)) {
      _saveOwned(['chibi']);
      return ['chibi'];
    }

    return list;
  } catch {
    return ['chibi'];
  }
}

/** 서버 동기화 등 외부에서 목록 전체를 덮어쓸 때 사용 (서명 함께 갱신) */
export function setOwnedCharacters(list: string[]): void {
  if (!list.includes('chibi')) list.unshift('chibi');
  _saveOwned(list);
}

/** 캐릭터를 보유 목록에 추가 (뽑기 완료 후 호출) */
export function addOwnedCharacter(id: string): void {
  const owned = getOwnedCharacters();
  if (!owned.includes(id)) {
    owned.push(id);
    _saveOwned(owned);
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

/** 소유 목록과 교차 검증하여 안전한 캐릭터 ID 반환. 미보유면 'chibi'로 강제 초기화. */
export function getSafeSelectedCharacter(): string {
  const selected = getSelectedCharacter();
  const owned = getOwnedCharacters();
  if (owned.includes(selected)) return selected;
  // 변조 감지 → chibi로 강제 초기화
  setSelectedCharacter('chibi');
  return 'chibi';
}

/** 캐릭터 정의 조회 */
export function getCharacterDef(id: string): CharacterDef {
  return CHARACTERS.find(c => c.id === id) ?? CHARACTERS[0];
}
