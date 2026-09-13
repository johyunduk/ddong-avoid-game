#!/usr/bin/env python3
"""테드 체스 큐브 연출의 **시간 축 단일 진실**.

렌더 스크립트(`render.py`)와 게임 코드(`TedAbility.ts`)가 같은 숫자를 봐야 한다.
여기 있는 값이 `src/config/cube-timeline.json` 으로 나가고, TS 쪽 상수는 그걸 따른다.
하네스가 둘을 대조한다 — 어긋나면 흡수와 결합이 따로 논다 (설계 문서 §6.2).

    python scripts/cube/timeline.py          # JSON 갱신 + 요약 출력

설계 문서: docs/fx-ted-cube-remake.md §4
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

FPS = 30

# ── 시트 규격 (설계 §5.1) ────────────────────────────────────────────────────
FORGE_FRAMES, FORGE_PX, FORGE_COLS = 36, 192, 6
BLAST_FRAMES, BLAST_PX, BLAST_COLS = 24, 256, 6
CORE_PX, CORE_COLS = 128, 6
CORE_FROM = 12                      # forge 프레임 12 부터 가산 코어를 따로 굽는다
CORE_FRAMES = FORGE_FRAMES - CORE_FROM

SS = 3                              # 슈퍼샘플 배율 — 이 배로 렌더해 줄인다

# ── 구간 경계 (forge 프레임 인덱스, 끝 미포함) ───────────────────────────────
F_APPROACH = (0, 8)                 # 큐브 없음. 화면의 주인공은 코드가 움직이는 진짜 말
F_COALESCE = (8, 18)                # 조각이 제자리로, 닿기 직전 감속
F_LOCK = 18                         # 결합 섬광 — 1프레임 컷
F_FREEZE = (19, 21)                 # 멈칫 2프레임. 완전 정지
F_CHARGE = (21, 33)                 # 수축하며 밝아진다
F_ANTICIPATE = (33, FORGE_FRAMES)   # 예비 압축 + 마지막 정지 프레임

# ── 구간 경계 (blast 프레임 인덱스) ──────────────────────────────────────────
B_SEAM = 0                          # forge 마지막 프레임과 같은 그림 (이음새)
B_BURST = (1, 3)                    # 2프레임. 중간 속도를 보여주지 않는다
B_EXPAND = (3, 7)
B_DECEL = (7, 14)
B_AFTERGLOW = (14, BLAST_FRAMES)


def ms(frame: float) -> float:
    return frame / FPS * 1000.0


FORGE_MS = ms(FORGE_FRAMES)                 # 1200
BLAST_MS = ms(BLAST_FRAMES)                 # 800
TOTAL_MS = FORGE_MS + BLAST_MS              # 2000

# ── 시트 ↔ 코드 계약 (설계 §6.2) ─────────────────────────────────────────────
GATHER_MS = ms(F_LOCK)                      # 600 — 결합 섬광 시각. 말은 이 전에 도착해야 한다
PIECE_ARRIVE_MS = 500                       # 말이 몸 중앙에 닿는 시각 (전부 같은 시각)
SHARD_MS = int(GATHER_MS - PIECE_ARRIVE_MS) # 100 — 말이 조각으로 부서져 있는 시간
PIECE_STAGGER_MS = 28                       # 말마다 출발이 어긋나는 간격
#   부등식: (stackMax - 1) * STAGGER < ARRIVE.  7개 기준 168 < 500 ✓
#   늦게 떠난 말은 **짧게 간다** (dur_i = ARRIVE - delay_i) — 그래야 도착이 한 점에 모인다

# 히트스톱은 파열 시각에 건다. vfx 의 HITSTOP_MAX_MS(200) 안이고,
# Clock.now 는 timeScale 을 안 보므로 rAF 안티치트에 걸리지 않는다
BURST_MS = FORGE_MS                         # 1200
HITSTOP_MS = 70

# ── 렌더 하드 홀드 ───────────────────────────────────────────────────────────
# forge 마지막 프레임(t=1166.7)과 blast 0프레임(t=1200)이 **같은 그림**이어야 한다.
# 이 시각 이후로 움직임을 완전히 멈춰 두면 둘이 자동으로 같아진다.
HOLD_FROM_MS = ms(FORGE_FRAMES - 1) - 1.0   # 1165.7


def frame_to_ms(n: int) -> float:
    """블렌더 프레임(1-base) → 재생 시각(ms). 전 구간이 하나의 타임라인이다."""
    return ms(n - 1)


#   블렌더 프레임 1..36  = forge 0..35
#   블렌더 프레임 37..60 = blast 0..23   (37 → t=1200)
BLENDER_FORGE = (1, FORGE_FRAMES)
BLENDER_BLAST = (FORGE_FRAMES + 1, FORGE_FRAMES + BLAST_FRAMES)
BLENDER_CORE = (1 + CORE_FROM, FORGE_FRAMES)


def vram_mb(px: int, cols: int, frames: int) -> float:
    rows = (frames + cols - 1) // cols
    return px * cols * px * rows * 4 / 1048576


def payload() -> dict:
    return {
        "_comment": "scripts/cube/timeline.py 가 생성한다. 직접 고치지 마라.",
        "fps": FPS,
        "totalMs": TOTAL_MS,
        "forge": {
            "frames": FORGE_FRAMES, "px": FORGE_PX, "cols": FORGE_COLS, "ms": FORGE_MS,
            "phases": {
                "approach": F_APPROACH, "coalesce": F_COALESCE, "lock": F_LOCK,
                "freeze": F_FREEZE, "charge": F_CHARGE, "anticipate": F_ANTICIPATE,
            },
        },
        "blast": {
            "frames": BLAST_FRAMES, "px": BLAST_PX, "cols": BLAST_COLS, "ms": BLAST_MS,
            "phases": {
                "seam": B_SEAM, "burst": B_BURST, "expand": B_EXPAND,
                "decel": B_DECEL, "afterglow": B_AFTERGLOW,
            },
        },
        "core": {
            "frames": CORE_FRAMES, "px": CORE_PX, "cols": CORE_COLS, "from": CORE_FROM,
        },
        "contract": {
            "gatherMs": GATHER_MS,
            "pieceArriveMs": PIECE_ARRIVE_MS,
            "shardMs": SHARD_MS,
            "pieceStaggerMs": PIECE_STAGGER_MS,
            "burstMs": BURST_MS,
            "hitstopMs": HITSTOP_MS,
        },
    }


def main() -> int:
    root = Path(__file__).resolve().parent.parent.parent
    out = root / "src" / "config" / "cube-timeline.json"
    out.write_text(json.dumps(payload(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"{out.relative_to(root)} 갱신")
    print(f"  forge {FORGE_FRAMES}f {FORGE_PX}px {FORGE_COLS}열 → "
          f"{FORGE_PX * FORGE_COLS}x{FORGE_PX * ((FORGE_FRAMES + FORGE_COLS - 1) // FORGE_COLS)} "
          f"{vram_mb(FORGE_PX, FORGE_COLS, FORGE_FRAMES):.2f}MB")
    print(f"  blast {BLAST_FRAMES}f {BLAST_PX}px {BLAST_COLS}열 → "
          f"{BLAST_PX * BLAST_COLS}x{BLAST_PX * ((BLAST_FRAMES + BLAST_COLS - 1) // BLAST_COLS)} "
          f"{vram_mb(BLAST_PX, BLAST_COLS, BLAST_FRAMES):.2f}MB")
    print(f"  core  {CORE_FRAMES}f {CORE_PX}px {CORE_COLS}열 → "
          f"{CORE_PX * CORE_COLS}x{CORE_PX * ((CORE_FRAMES + CORE_COLS - 1) // CORE_COLS)} "
          f"{vram_mb(CORE_PX, CORE_COLS, CORE_FRAMES):.2f}MB")
    total = (vram_mb(FORGE_PX, FORGE_COLS, FORGE_FRAMES)
             + vram_mb(BLAST_PX, BLAST_COLS, BLAST_FRAMES)
             + vram_mb(CORE_PX, CORE_COLS, CORE_FRAMES))
    print(f"  합계 {total:.2f}MB (설계 예산 12.56MB)")
    print(f"  박자: 모임 {GATHER_MS:.0f} / 섬광 {ms(1):.0f} / 정지 {ms(2):.0f} / "
          f"충전 {ms(F_CHARGE[1] - F_CHARGE[0]):.0f} / 압축 {ms(3):.0f} / "
          f"파열 {ms(2):.0f} / 잔광 {ms(BLAST_FRAMES - B_AFTERGLOW[0]):.0f}")
    assert (7 - 1) * PIECE_STAGGER_MS < PIECE_ARRIVE_MS, "말 출발 지연이 도착 시각을 넘는다"
    return 0


if __name__ == "__main__":
    sys.exit(main())
