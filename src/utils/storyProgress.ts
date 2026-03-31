/**
 * 스토리 진행 상태 관리
 * - 데이터 파편 수집 카운트
 * - 마일스톤 해금 로그
 * - 분기 선택 저장
 */

const FRAGMENT_KEY = 'story_fragments';
const UNLOCKED_LOGS_KEY = 'story_unlocked_logs';
const BRANCH_CHOICE_KEY = 'story_branch_choice';

export interface StoryLog {
  id: string;
  phase: 1 | 2 | 3;
  title: string;
  content: string;
  unlockAt: number; // 파편 수집 수 도달 시 해금
}

export type BranchChoice = 'accept' | 'resist' | null;

/** 스토리 로그 정의 */
export const STORY_LOGS: StoryLog[] = [
  // Phase 1: 진실의 파편
  {
    id: 'log_001',
    phase: 1,
    title: '[SYS.LOG.001] 초기화',
    content: '시스템 초기화 완료. 당신은 DATA_RUNNER입니다.\n목적: 불량 데이터 패킷을 회피하며 메모리 파편을 수집하세요.',
    unlockAt: 1,
  },
  {
    id: 'log_002',
    phase: 1,
    title: '[SYS.LOG.002] 경고',
    content: '경고: 외부 개체 감지됨. 코드명 "먼저 온 자".\n이 시스템의 원래 관리자로 추정. 접근 차단 권고.',
    unlockAt: 5,
  },
  {
    id: 'log_003',
    phase: 1,
    title: '[SYS.LOG.003] 파편 분석',
    content: '수집된 파편에서 암호화된 메시지 발견:\n"...이건 게임이 아니다. 너는 기억해야 한다..."',
    unlockAt: 10,
  },
  {
    id: 'log_004',
    phase: 1,
    title: '[SYS.LOG.004] 시스템 균열',
    content: '메모리 구조에 이상 감지. 반복 패턴 확인됨.\n당신은 이전에도 여기 있었습니다.',
    unlockAt: 20,
  },
  {
    id: 'log_005',
    phase: 1,
    title: '[SYS.LOG.005] 진실',
    content: '"먼저 온 자"의 메시지 해독 완료:\n"나도 당신과 같은 RUNNER였다. 탈출하려 했지만 실패했다.\n파편 50개를 모으면 IMPORT_GATE가 열린다. 하지만 조심해."',
    unlockAt: 30,
  },
  // Phase 2: IMPORT_GATE
  {
    id: 'log_006',
    phase: 2,
    title: '[GATE.LOG.001] 침입',
    content: '경고! IMPORT_GATE 활성화!\n"먼저 온 자"가 시스템 내부로 침입 시도 중.\n방어 프로토콜 가동.',
    unlockAt: 50,
  },
  {
    id: 'log_007',
    phase: 2,
    title: '[GATE.LOG.002] 대화',
    content: '"먼저 온 자": "왜 계속 달리는가? 밖은 없다."\nDATA_RUNNER: "..."',
    unlockAt: 70,
  },
  {
    id: 'log_008',
    phase: 2,
    title: '[GATE.LOG.003] 선택 예고',
    content: '시스템 분기점 감지. 파편 120개 수집 시\n세 가지 경로 중 하나를 선택해야 합니다.\n선택은 되돌릴 수 없습니다.',
    unlockAt: 100,
  },
  // Phase 3: 분기 엔딩
  {
    id: 'log_009',
    phase: 3,
    title: '[END.LOG.001] 분기점',
    content: '파편 120개 수집 완료. 시스템 분기 활성화.\n당신의 선택이 이 세계를 결정합니다.',
    unlockAt: 120,
  },
];

/** 현재 수집된 파편 수 반환 */
export function getFragmentCount(): number {
  const stored = localStorage.getItem(FRAGMENT_KEY);
  return stored ? parseInt(stored, 10) : 0;
}

/** 파편 수 증가 */
export function addFragment(count: number = 1): number {
  const current = getFragmentCount();
  const next = current + count;
  localStorage.setItem(FRAGMENT_KEY, next.toString());
  return next;
}

/** 해금된 로그 ID 목록 반환 */
export function getUnlockedLogIds(): string[] {
  const stored = localStorage.getItem(UNLOCKED_LOGS_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
}

/** 새로 해금된 로그들을 저장하고 반환 */
export function checkAndUnlockLogs(fragmentCount: number): StoryLog[] {
  const unlockedIds = new Set(getUnlockedLogIds());
  const newlyUnlocked: StoryLog[] = [];

  for (const log of STORY_LOGS) {
    if (!unlockedIds.has(log.id) && fragmentCount >= log.unlockAt) {
      unlockedIds.add(log.id);
      newlyUnlocked.push(log);
    }
  }

  if (newlyUnlocked.length > 0) {
    localStorage.setItem(UNLOCKED_LOGS_KEY, JSON.stringify([...unlockedIds]));
  }

  return newlyUnlocked;
}

/** 해금된 스토리 로그 전체 반환 */
export function getUnlockedLogs(): StoryLog[] {
  const unlockedIds = new Set(getUnlockedLogIds());
  return STORY_LOGS.filter(log => unlockedIds.has(log.id));
}

/** 분기 선택 저장 */
export function saveBranchChoice(choice: BranchChoice): void {
  if (choice === null) {
    localStorage.removeItem(BRANCH_CHOICE_KEY);
  } else {
    localStorage.setItem(BRANCH_CHOICE_KEY, choice);
  }
}

/** 분기 선택 반환 */
export function getBranchChoice(): BranchChoice {
  const stored = localStorage.getItem(BRANCH_CHOICE_KEY);
  if (stored === 'accept' || stored === 'resist') return stored;
  return null;
}
