/**
 * 각성 — 단계 기준(장 수)과 단계별 패시브 (단일 진실 공급원)
 *
 * 게임(GameScene)의 이동 속도와 화면(캐릭터 정보)의 문구가 이 파일 하나에서 나온다.
 * 단계 계산은 src/utils/character.ts 의 getAwakeningLevel 이 아래 AWAKENING_THRESHOLDS 를 읽어서 한다.
 *
 * 효과가 정해진 단계는 ★1 · ★2 뿐이다. ★3~★5 는 별(단계)만 있고 효과가 아직 없다 —
 * 효과 함수는 정의된 단계만 돌려주고 없는 단계를 지어내지 않는다 (시너지 각성 연동은 정식 출시 때).
 */
import { MAEHWA_PARAMS } from './abilityParams';

export type AwakeningGrade = 'R' | 'SR' | 'UR';

/** 최고 각성 단계 (별 개수) */
export const MAX_AWAKENING_LEVEL = 5;

/**
 * ★n 에 필요한 누적 중복 장 수 — [★1, ★2, ★3, ★4, ★5]. 등급외(chibi 등)는 각성이 없다
 */
export const AWAKENING_THRESHOLDS: Readonly<Record<AwakeningGrade, readonly number[]>> = {
  R:  [10, 25, 50, 75, 100],
  SR: [3, 7, 15, 25, 40],
  UR: [1, 2, 4, 6, 10],
};

/**
 * 등급 각성 패시브 — 이동 속도 (px/s). 단계의 값이 '그 단계의 총량'이다 (★2 는 ★1 에 더하지 않고 바꾼다).
 * ★3 이상은 ★2 값을 그대로 쓴다 (★3~★5 효과는 아직 없다)
 */
export const AWAKENING_SPEED: Readonly<Record<1 | 2, Readonly<Record<AwakeningGrade, number>>>> = {
  1: { R: 5,  SR: 10, UR: 15 },
  2: { R: 10, SR: 15, UR: 20 },
};

/**
 * 매화 예외 — ★1 은 이동 속도 +5 로 같고, ★2 부터는 속도가 더 붙지 않고 특수 똥 수집 점수가 붙는다
 * (점수는 MaehwaAbility 가 MAEHWA_PARAMS.awake2SpecialBonus 로 준다)
 */
const MAEHWA_ID = 'maehwa';
const MAEHWA_SPEED = 5;

/** 효과가 정해진 마지막 단계 */
export const MAX_DEFINED_AWAKENING_LEVEL = 2;

function asGrade(grade: string): AwakeningGrade | null {
  return grade === 'R' || grade === 'SR' || grade === 'UR' ? grade : null;
}

/** 이 단계에서 붙는 이동 속도 총량 (px/s). 각성 전 · 등급외는 0 */
export function getAwakeningSpeedBonus(charId: string, grade: string, level: number): number {
  const g = asGrade(grade);
  if (!g || level < 1) return 0;
  if (charId === MAEHWA_ID) return MAEHWA_SPEED;
  return AWAKENING_SPEED[level >= 2 ? 2 : 1][g];
}

/**
 * ★level 에서 새로 붙는 효과 문구 — 정의된 단계(★1 · ★2)만. 그 밖(★0 · ★3~★5 · 등급외)은 null.
 * '★n 각성:' 머리는 붙이지 않는다 (화면이 고른다 — 붙인 줄은 getAwakeningEffectLines)
 */
export function getAwakeningEffectText(charId: string, grade: string, level: number): string | null {
  const g = asGrade(grade);
  if (!g || level < 1 || level > MAX_DEFINED_AWAKENING_LEVEL) return null;
  if (level === 1) return `이동속도 +${getAwakeningSpeedBonus(charId, grade, 1)} px/s`;
  // 매화 ★2 는 속도를 바꾸지 않고 점수를 더한다 — ★1 의 이동속도는 그대로 남는다
  if (charId === MAEHWA_ID) return `특수 똥 수집 시 +${MAEHWA_PARAMS.awake2SpecialBonus}점`;
  // ★2 속도는 ★1 에 더하지 않고 바꾼다 (합계 = ★2 값) — '누적'으로 쓰면 더하기로 읽힌다
  return `이동속도 +${AWAKENING_SPEED[2][g]} px/s (★1 의 +${AWAKENING_SPEED[1][g]} 대신)`;
}

/** 지금 단계까지 받은 효과를 '★n 각성: …' 줄로 — 정의된 단계만 (캐릭터 정보 카드의 각성 보너스 칸) */
export function getAwakeningEffectLines(charId: string, grade: string, level: number): string[] {
  const lines: string[] = [];
  for (let n = 1; n <= Math.min(level, MAX_DEFINED_AWAKENING_LEVEL); n++) {
    const text = getAwakeningEffectText(charId, grade, n);
    if (text) lines.push(`★${n} 각성: ${text}`);
  }
  return lines;
}

/** 중복 장 수 → 각성 단계 (★0~★5). src/utils/character.ts 의 getAwakeningLevel 이 이걸 부른다 */
export function awakeningLevelOf(grade: string, duplicateCount: number): number {
  const g = asGrade(grade);
  if (!g) return 0;
  return AWAKENING_THRESHOLDS[g].filter(need => duplicateCount >= need).length;
}

/**
 * 다음 각성까지 — 다음 단계와 남은 장 수. ★5 이거나 등급외면 null.
 * 다음 단계에 효과가 정해져 있는지는 getAwakeningEffectText(…, level) 이 null 인지로 본다
 */
export function getNextAwakening(grade: string, duplicateCount: number): { level: number; remaining: number } | null {
  const g = asGrade(grade);
  if (!g) return null;
  const level = awakeningLevelOf(g, duplicateCount);
  if (level >= MAX_AWAKENING_LEVEL) return null;
  return { level: level + 1, remaining: AWAKENING_THRESHOLDS[g][level] - duplicateCount };
}
