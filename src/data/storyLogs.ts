import type { StoryLog } from '../types/StoryTypes';

export const STORY_LOGS: StoryLog[] = [

  // ── SEASON 1 ────────────────────────────────────────────────
  {
    id: 'TRASH-001',
    title: '첫 번째 조각',
    season: 1,
    unlockCondition: { type: 'topaz', threshold: 10 },
    pages: [
      `[TRASH-001]\n시스템 기록 / 최초 복원 시도\n\n…이상하다.\n뭔가가 남아 있어.\n\n삭제됐는데도.\n\n잔향이 있다.\n치비가 그걸 줍고 있다.`,
    ],
  },
  {
    id: 'TRASH-002',
    title: '달리는 이유',
    season: 1,
    unlockCondition: { type: 'topaz', threshold: 20 },
    pages: [
      `[TRASH-002]\n치비의 내적 기록\n\n치비: …왜 달리지?\n\n아무도 묻지 않았는데.\n\n하지만 멈추면—\n뭔가가 쌓인다. 머리에.\n\n그러니까 달린다.`,
    ],
  },
  {
    id: 'TRASH-003',
    title: '목소리',
    season: 1,
    unlockCondition: { type: 'topaz', threshold: 30 },
    pages: [
      `[TRASH-003]\n대화 기록 #1\n\n치비: …여기는… 따뜻해.\n루트: 계속 달려. 이 공간을 유지하려면 그래야 해.\n치비: …누구야?\n루트: 나중에.`,
    ],
  },
  {
    id: 'TRASH-004',
    title: '반복',
    season: 1,
    unlockCondition: { type: 'playCount', threshold: 10 },
    pages: [
      `[TRASH-004]\n시스템 로그 / 루프 감지\n\nCYCLE COUNT: 0010\n…또 시작됐다.\n\n치비는 이전 기록을 모른다.\n그래서 괜찮다.\n\n매번 새롭게 달릴 수 있으니까.`,
    ],
  },
  {
    id: 'TRASH-005',
    title: '황금 잔해',
    season: 1,
    unlockCondition: { type: 'gold', threshold: 20 },
    pages: [
      `[TRASH-005]\n데이터 파편 #AU-20\n\n황금으로 변한 잔해들.\n삭제 직전에 압축된 데이터들이 뭉친 거다.\n\n루트: 조심해. 저건 그냥 쓸모없는 게 아니야.\n치비: …그래 보여.`,
    ],
  },
  {
    id: 'TRASH-006',
    title: '루트의 기록',
    season: 1,
    unlockCondition: { type: 'playCount', threshold: 20 },
    pages: [
      `[TRASH-006]\n루트 시스템 로그\n\n나는 해킹 도구다.\n하지만 여기선—\n그냥 안내자다.\n\n치비가 달리면\n이 공간이 조금씩 안정된다.\n\n이유는 모른다.\n그냥 그렇다.`,
    ],
  },

  // ── SEASON 2 ────────────────────────────────────────────────
  {
    id: 'LEGACY-0001',
    title: '과거의 기록',
    season: 2,
    unlockCondition: { type: 'skor', threshold: 5000 },
    pages: [
      `[LEGACY-0001]\n오래된 로그 / 복원율 34%\n\n█l█ █e█ █a█ █y ███ ███ █ere █irst.\n\n나는 먼저 왔다.\n\n그러나 나간 뒤—\n무엇이 있었는지\n기록이 █l██ed.`,
    ],
  },
  {
    id: 'LEGACY-0002',
    title: '██████',
    season: 2,
    unlockCondition: { type: 'diamond', threshold: 15 },
    pages: [
      `[LEGACY-0002]\n손상된 기록 / 복원 불가\n\n…GATE 앞까지 왔다.\n…나가면 뭐가 있지?\n\n███ ██████.\n\n█████ ██ ████.`,
    ],
  },
];
