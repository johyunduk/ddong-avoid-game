/**
 * 피버 타임 설정
 *
 * 게임의 피버 타임 시스템 관련 모든 설정값을 관리합니다.
 * 밸런싱 조정 시 이 파일만 수정하면 됩니다.
 */

export interface FeverTimeConfig {
  /** 첫 피버 타임 발동 점수 */
  firstTriggerScore: number;
  /** 반복 간격 (점수 단위) */
  repeatInterval: number;
  /** 지속 시간 (밀리초) */
  duration: number;
  /** 피버 타임 중 일반 똥 생성 개수 */
  normalPoopCount: number;
  /** 피버 타임 중 금똥/다이아똥 생성 개수 */
  bonusPoopCount: number;
  /** 피버 타임 중 낙하 속도 배수 (1.0 = 일반 속도, 1.2 = 1.2배 빠름) */
  speedMultiplier: number;
  /** UI 관련 설정 */
  ui: {
    fontSize: string;
    color: string;
    position: { x: number; y: number };
    depth: number;
    stroke: string;
    strokeThickness: number;
  };
}

/**
 * 피버 타임 기본 설정
 *
 * @example
 * // 300점에서 첫 피버 타임 발동
 * // 이후 1600, 2900, 4200점... (1300점 간격)
 * // 4.5초간 지속
 * // 일반 똥 2개 + 금똥/다이아똥 8개 생성
 * // 낙하 속도 1.2배 빠름
 */
export const FEVER_TIME_CONFIG: FeverTimeConfig = {
  firstTriggerScore: 300,
  repeatInterval: 1300,
  duration: 4500,
  normalPoopCount: 2,
  bonusPoopCount: 8,
  speedMultiplier: 1.2, // 피버 타임 중 1.2배 빠른 속도
  ui: {
    fontSize: '32px',
    color: '#ff9900', // 주황색
    position: { x: 200, y: 120 },
    depth: 150, // 다른 UI 요소 위에 표시
    stroke: '#000000',
    strokeThickness: 4
  }
};
