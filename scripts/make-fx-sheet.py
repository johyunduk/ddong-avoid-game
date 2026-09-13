#!/usr/bin/env python3
"""프레임 줄 → **불투명 스프라이트용** FX 시트.

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/make-fx-sheet.py \\
        --in <잘라낸_프레임줄.png> --frames 6 --frame-size 256x192 \\
        --anchor bottom --out public/assets/fx/sheets/trex_256x192.png

## `fx-particle.py --frames-from` 과 무엇이 다른가

`fx-particle.py` 는 **파티클·발광 이펙트**용이라 알파를 밝기에서 굽는다. 불꽃이나
에너지파에는 그게 맞지만, 티라노·로봇·참새처럼 **불투명한 캐릭터**에 쓰면 밝은 부분만
남고 전체가 반투명하게 떠 버린다(배경이 비쳐 색이 바랜다).

여기서는 잘라낸 원본의 **알파를 그대로 옮긴다.** 크기만 맞추고 위치만 정렬한다.

## 정렬

  --anchor bottom  발이 공통 지면에 닿는다. 걷기·포효처럼 땅에 선 것
  --anchor center  프레임마다 중심을 맞춘다. 날갯짓·비행처럼 떠 있는 것

배율은 **모든 프레임에 같은 값**을 쓴다. 프레임마다 맞추면 재생 중에 크기가 뛴다.
가장 큰 프레임이 캔버스에 들어가는 배율을 골라 전부에 적용한다.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ALPHA = 16

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def frame_spans(im: Image.Image, want: int) -> list[tuple[int, int]]:
    a = np.array(im)[:, :, 3] > ALPHA
    filled = a.sum(axis=0) > 0
    spans, st = [], None
    for x, v in enumerate(filled):
        if v and st is None:
            st = x
        elif not v and st is not None:
            spans.append((st, x - 1)); st = None
    if st is not None:
        spans.append((st, len(filled) - 1))
    spans = [s for s in spans if s[1] - s[0] >= 4]
    if len(spans) != want:
        raise SystemExit(
            f"프레임 {want}개를 기대했지만 {len(spans)}개를 찾았습니다: "
            f"{[e - s + 1 for s, e in spans]}\n"
            "→ 생성 단계에서 프레임 간격을 넓히거나 scripts/split-frames.py 를 먼저 쓰세요."
        )
    return spans


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True, help="배경이 제거된 프레임 줄")
    ap.add_argument("--frames", type=int, required=True)
    ap.add_argument("--frame-size", required=True, help="WxH (예: 256x192)")
    ap.add_argument("--anchor", choices=["bottom", "center"], default="bottom")
    ap.add_argument("--margin", type=float, default=0.06, help="캔버스 대비 여백 비율")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    fw, fh = (int(v) for v in a.frame_size.lower().split("x"))
    im = Image.open(a.src).convert("RGBA")
    spans = frame_spans(im, a.frames)

    # 프레임별 내용 상자
    arr = np.array(im)[:, :, 3] > ALPHA
    boxes = []
    for s, e in spans:
        sub = arr[:, s:e + 1]
        ys, xs = np.where(sub)
        boxes.append((s + int(xs.min()), int(ys.min()), s + int(xs.max()), int(ys.max())))

    # 모든 프레임에 같은 배율 — 가장 큰 것이 여백 안에 들어가도록
    avail_w, avail_h = fw * (1 - a.margin * 2), fh * (1 - a.margin * 2)
    widest = max(x1 - x0 + 1 for x0, _, x1, _ in boxes)
    tallest = max(y1 - y0 + 1 for _, y0, _, y1 in boxes)
    scale = min(avail_w / widest, avail_h / tallest)
    ground = max(y1 for _, _, _, y1 in boxes)          # 줄 전체의 공통 지면
    base_y = round(fh * (1 - a.margin))

    sheet = Image.new("RGBA", (fw * a.frames, fh), (0, 0, 0, 0))
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        part = im.crop((x0, y0, x1 + 1, y1 + 1))
        w = max(1, round(part.width * scale))
        h = max(1, round(part.height * scale))
        part = part.resize((w, h), Image.LANCZOS)
        cx = i * fw + (fw - w) // 2
        if a.anchor == "bottom":
            # 이 프레임이 지면에서 떠 있는 만큼도 같은 배율로 유지한다
            lift = round((ground - y1) * scale)
            cy = base_y - lift - h
        else:
            cy = (fh - h) // 2
        sheet.paste(part, (cx, cy), part)
        print(f"  {i}: {w}x{h}")

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"{out}  {sheet.size}  {a.frames}프레임 / {fw}x{fh}  배율 {scale:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
