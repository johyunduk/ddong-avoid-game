#!/usr/bin/env python3
"""피격 프레임을 **시트 안의 프레임**에서 다시 만든다.

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/refit-hit.py --id red

`slice-sheet.py --add-hit` 은 기존 정적 스프라이트로 피격 프레임을 만든다. 보통은
그게 맞다 — 정적과 생성 프레임의 그림체가 같으면 문제가 없다.

그런데 생성 프레임은 원본을 그대로 옮기지 못한다. 특히 **길게 날리는 옷자락**은
모델이 짧게 줄여 그리는 경우가 많다. 그러면 달리다 맞는 순간에만 코트가 확 길어져
튄다 (Ted: 달리기 프레임 폭 192 vs 정적 기준 피격 319).

그래서 시트 첫 프레임을 재료로 다시 만든다. `make_hit()` 은 그림을 머리/몸통/다리
세 덩어리로 잘라 위쪽만 뒤로 밀 뿐이라, 어느 프레임에서 만들어도 결과가 자연스럽다.
"""
from __future__ import annotations

import argparse
import json
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / "public" / "assets" / "sheets"
slice_sheet = SourceFileLoader("slice_sheet", str(ROOT / "scripts" / "slice-sheet.py")).load_module()

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def rebuild(cid: str, direction: str) -> None:
    jp = SHEETS / f"{cid}_{direction}.json"
    if not jp.exists():
        print(f"  {cid}_{direction}: 시트 없음 — 건너뜀")
        return
    meta = json.loads(jp.read_text(encoding="utf-8"))
    png = SHEETS / meta["image"]
    fw, fh = meta["frameWidth"], meta["frameHeight"]
    im = Image.open(png).convert("RGBA")
    frames = [im.crop((i * fw, 0, (i + 1) * fw, fh)) for i in range(im.width // fw)]
    names = meta["frames"]
    if "hit" not in names:
        print(f"  {cid}_{direction}: hit 프레임이 없음 — 건너뜀")
        return

    frames[names.index("hit")] = slice_sheet.make_hit(frames[0])

    sheet = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * fw, 0))
    if png.suffix == ".webp":
        sheet.save(png, "WEBP", lossless=True, quality=100, method=6)
    else:
        sheet.save(png)

    a = np.array(frames[names.index("hit")])[:, :, 3]
    ys, xs = np.where(a > 16)
    print(f"  {cid}_{direction}: hit 재생성 — {xs.max()-xs.min()+1}x{ys.max()-ys.min()+1}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--dirs", nargs="+", default=["front", "left", "right"])
    a = ap.parse_args()
    for d in a.dirs:
        rebuild(a.id, d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
