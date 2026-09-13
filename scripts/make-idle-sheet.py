#!/usr/bin/env python3
"""정면 숨쉬기 시트를 **원본 스프라이트에서 직접** 만든다 (생성 모델을 안 쓴다).

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/make-idle-sheet.py --id heidi

## 왜 생성하지 않는가

숨쉬기는 "몇 픽셀 위아래로만 움직이고 자세는 그대로"인 동작이다. 그럴 거면 모델에게
다시 그리게 할 이유가 없다. GPT Image 는 그림을 복제하지 않고 **다시 그리기 때문에**,
프레임마다 엠블럼·목걸이·버클이 미묘하게 달라지고 4fps 로 왕복하면 깜빡임으로 보인다.
(`slice-sheet.py` 의 `make_hit()` 이 피격 프레임을 원본에서 만드는 것과 같은 이유다 —
커밋 dcd42f10: "생성형 모델은 한 프레임짜리 피격을 시켜도 자세를 크게 바꿔버린다")

여기서 만든 프레임은 **원본 픽셀 그대로**라 깜빡임이 0 이다.

## 어떻게 움직이는가

발을 지면에 고정한 채 세로로 살짝 늘였다 줄인다 (squash & stretch). 가로는 반대로
아주 조금 줄여 부피를 지킨다 — 그래야 부풀지 않고 '숨쉰다'로 읽힌다.

세로 배율이 왜 이 값인가: 표시 크기가 높이 80 이고 캔버스가 312 이므로 화면에서는
0.256 배로 줄어든다. 캔버스에서 10px 움직여야 화면에서 2.5px 다. 인물 높이 275 기준
4% 가 11px 이라 이 정도가 되어야 눈에 보인다.

**리샘플은 NEAREST 로 한다.** 픽셀 아트를 LANCZOS 로 늘이면 경계가 뭉개진다.
NEAREST 는 줄을 복제할 뿐이라 선이 살아 있다.

프레임 구성은 기존 27종과 같다: idle 4장(왕복 재생) + hit 1장.
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
PLAYERS = ROOT / "public" / "assets" / "players"
SHEETS = ROOT / "public" / "assets" / "sheets"
slice_sheet = SourceFileLoader("slice_sheet", str(ROOT / "scripts" / "slice-sheet.py")).load_module()

ALPHA = 16
# 1 → 2 → 3 → 2 로 왕복 재생되므로 4장은 단조 증가면 된다
STRETCH = [1.000, 1.015, 1.032, 1.015]

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def breathe(src: Image.Image, sy: float) -> Image.Image:
    """발을 고정한 채 세로 sy 배, 가로는 그 반대로 살짝 줄인다."""
    a = np.array(src)[:, :, 3]
    ys, xs = np.where(a > ALPHA)
    if len(ys) == 0:
        return src.copy()
    top, bot = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())

    body = src.crop((x0, top, x1 + 1, bot + 1))
    sx = 1.0 / (sy ** 0.5)                      # 부피 보존 — 늘어난 만큼 가늘어진다
    nw = max(1, round(body.width * sx))
    nh = max(1, round(body.height * sy))
    body = body.resize((nw, nh), Image.NEAREST)  # 픽셀 아트는 NEAREST

    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    cx = (x0 + x1 + 1) / 2
    out.paste(body, (round(cx - nw / 2), bot + 1 - nh), body)   # 발끝(bot)을 유지
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--frame-rate", type=int, default=4)
    a = ap.parse_args()

    ref = PLAYERS / f"{a.id}_front.webp"
    if not ref.exists():
        raise SystemExit(f"정적 스프라이트가 없습니다: {ref}")
    base = Image.open(ref).convert("RGBA")

    frames = [breathe(base, s) for s in STRETCH]
    frames.append(slice_sheet.make_hit(frames[0]))
    names = ["idle-1", "idle-2", "idle-3", "idle-4", "hit"]

    fw, fh = base.size
    sheet = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * fw, 0))

    SHEETS.mkdir(parents=True, exist_ok=True)
    out = SHEETS / f"{a.id}_front.webp"
    sheet.save(out, "WEBP", lossless=True, quality=100, method=6)
    (SHEETS / f"{a.id}_front.json").write_text(json.dumps({
        "image": out.name,
        "frameWidth": fw, "frameHeight": fh,
        "frames": names,
        "anims": {
            "idle": {"frames": [0, 1, 2, 3, 2, 1], "frameRate": a.frame_rate, "repeat": -1},
            "hit": {"frames": [4], "frameRate": 1, "repeat": 0},
        },
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    for i, f in enumerate(frames):
        arr = np.array(f)[:, :, 3]
        ys, xs = np.where(arr > ALPHA)
        print(f"  {names[i]}: {xs.max()-xs.min()+1}x{ys.max()-ys.min()+1} 정수리 y={ys.min()}")
    print(f"{out.name}  {fw}x{fh} × {len(frames)}프레임  {out.stat().st_size // 1024}KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
