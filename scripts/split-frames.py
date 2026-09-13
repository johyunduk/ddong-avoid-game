#!/usr/bin/env python3
"""붙어버린 프레임 줄에 빈 열을 넣어 준다 (`slice-sheet.py` 앞단계).

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/split-frames.py \\
        --in <프레임줄.png> --out <결과.png> --frames 6

`slice-sheet.py` 는 **세로로 완전히 빈 열**을 경계로 프레임을 나눈다. 생성물은
팔·다리·옷자락이 옆 프레임에 닿는 경우가 잦아 두 프레임이 한 덩어리로 잡힌다.
slice-sheet 에도 `split_wide()` 가 있지만, 그건 **붙은 게 하나일 때** 쓸 수 있다 —
프레임 폭의 중앙값으로 판단하는데 절반이 붙어 버리면 중앙값 자체가 두 배가 되어
"넓은 구간이 없다"고 판단하고 멈춘다 (6프레임이 4덩어리로 잡힌 경우가 그것이다).

**먼저 생성 쪽을 고쳐라 — 이건 마지막 수단이다.**

프레임이 붙는 진짜 원인은 생성 단계에서 프레임끼리 겹쳐 그려진 것이다. 옷자락이
옆 칸을 침범하면 **어디를 잘라도 그림을 관통한다** (Ted 코트가 세로로 잘리고 조각이
떨어져 나왔다). 프롬프트에 "각 프레임은 완전히 분리된 섬이어야 하고, 캐릭터를 더
작게 그려서 좌우에 넓은 흰 여백을 남겨라"를 넣으면 6프레임이 편차 4% 로 깔끔하게
갈린다. 그게 정답이고, 이 스크립트는 그래도 살짝 붙었을 때만 쓴다.

여기서는 **프레임 수를 알고 있다**는 사실을 쓴다. 균등 분할 지점 주변만 뒤져
세로 알파 합이 가장 작은 열을 찾고, 거기에 얇은 투명 띠를 넣는다. 균등 분할을
그대로 자르지 않고 주변을 뒤지는 이유는, 생성물의 프레임 간격이 조금씩 어긋나
정확히 n등분 지점에서 자르면 캐릭터를 관통하기 때문이다.
"""
from __future__ import annotations

import argparse
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ALPHA = 16
GUTTER = 6          # 넣을 빈 띠의 폭


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--frames", type=int, required=True)
    ap.add_argument("--search", type=float, default=0.35,
                    help="균등 분할 지점 주변 탐색 폭 (프레임 폭 대비 비율)")
    a = ap.parse_args()

    im = Image.open(a.src).convert("RGBA")
    arr = np.array(im)
    al = arr[:, :, 3]

    xs = np.where((al > ALPHA).sum(axis=0) > 0)[0]
    if len(xs) == 0:
        raise SystemExit("내용이 없습니다")
    x0, x1 = int(xs.min()), int(xs.max())
    span = x1 - x0 + 1
    fw = span / a.frames
    reach = max(4, int(fw * a.search))

    colsum = al.astype(int).sum(axis=0)
    cuts = []
    for i in range(1, a.frames):
        guess = x0 + round(fw * i)
        lo, hi = max(x0 + 1, guess - reach), min(x1 - 1, guess + reach)
        window = colsum[lo:hi + 1]
        best = lo + int(np.argmin(window))
        cuts.append(best)
        print(f"  경계 {i}: 예상 {guess} → {best} (알파합 {int(colsum[best])})")

    for c in cuts:
        lo, hi = max(0, c - GUTTER // 2), min(arr.shape[1], c + GUTTER // 2 + 1)
        arr[:, lo:hi, 3] = 0

    out = Image.fromarray(arr)
    out.save(a.dst)

    # 확인 — 이제 몇 덩어리로 갈리는가
    al2 = np.array(out)[:, :, 3] > ALPHA
    filled = al2.sum(axis=0) > 0
    spans, st = [], None
    for x, v in enumerate(filled):
        if v and st is None:
            st = x
        elif not v and st is not None:
            spans.append((st, x - 1)); st = None
    if st is not None:
        spans.append((st, len(filled) - 1))
    spans = [s for s in spans if s[1] - s[0] >= 4]
    print(f"{a.dst}: {len(spans)}덩어리 {[e - s + 1 for s, e in spans]}")
    if len(spans) != a.frames:
        print(f"경고: {a.frames}개를 기대했지만 {len(spans)}개입니다 — --search 를 조정해 보세요")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
