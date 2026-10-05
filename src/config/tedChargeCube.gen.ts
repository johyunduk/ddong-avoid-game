// 자동 생성 — 손으로 고치지 마라. ddong-fx-work/ted-ascent/charge-cube/install_gpt.py 가 쓴다
// (수순은 실제 큐브 시뮬레이션 + 불변식 검사, 시트는 ChatGPT 판 — 칸마다 기준 그림 대조를 통과한 것)
//
// 시트 칸 순서: [정지0, 수1 45°, 정지1, 수2 45°, 정지2, ...] — 수 k(0부터)의 정지 = 2(k + 1), 45° = 2k + 1
export const TED_CHARGE_CUBE = {
  white: 'chargecube_white_72x72.png',
  black: 'chargecube_black_72x72.png',
  cell: 72,
  frames: 31,
  moves: 15,
  scrambleMoves: 7,   // 앞면과 상관없는 섞기 (앞쪽)
  midFrames: 1,
  /** 45° 칸이 비어 있는 수 (0부터) — 그 수는 중간 없이 정지→정지로 넘어간다. 채우면 install_gpt.py 다시 돌림 */
  midMissing: { white: [], black: [0, 13] } as { white: readonly number[]; black: readonly number[] },
  /** 수 k 가 도는 충전 진행률 (0~1). 마지막 수 = 1 → 앞면 완성 = 충전 완료 */
  thresholds: [0.0200, 0.0667, 0.1133, 0.1600, 0.2067, 0.2533, 0.3000, 0.3423, 0.4077, 0.4862, 0.5746, 0.6711, 0.7747, 0.8845, 1.0000],
  /** 참고용 수순 (R/L/U/D/F/B, ' = 반시계) */
  sequence: "L' F L D R' D' L U U L D D D R' U'",
} as const;
