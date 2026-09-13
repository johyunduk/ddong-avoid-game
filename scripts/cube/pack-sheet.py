#!/usr/bin/env python3
"""PNG 시퀀스 → Phaser 격자 시트. 큐브 전용이 아니라 **범용**이다.

    PY=C:\\ComfyUI\\.venv\\Scripts\\python.exe
    $PY scripts/cube/pack-sheet.py --in build/cube/forge_body --cols 6 --frame 192x192 --name cubeforge
    $PY scripts/cube/pack-sheet.py --verify public/assets/fx/sheets/cubeforge_192x192.png
    $PY scripts/cube/pack-sheet.py --contact public/assets/fx/sheets/cubeforge_192x192.png --size 180

규칙 (vfx.ts 와 맞춰야 한다)
- 파일명은 `<이름>_<가로>x<세로>.png` — `parseFrameSize` 가 이걸 읽는다
- 한 줄로 늘어놓지 않고 **격자**로 싼다. 60프레임을 한 줄로 두면 11520px 라
  구형 모바일 GPU 의 텍스처 한계 4096 을 넘는다
- 입력 프레임은 최종 크기의 정수배(슈퍼샘플)여야 한다. 줄이는 것이 곧 안티에일리어싱이다
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent.parent
SHEET_DIR = ROOT / "public" / "assets" / "fx" / "sheets"
GPU_MAX_DIM = 4096          # 구형 모바일 GPU 의 텍스처 한 변 한계


def parse_frame(spec: str) -> tuple[int, int]:
    w, h = spec.lower().split("x")
    return int(w), int(h)


def frame_size_from_name(path: Path) -> tuple[int, int] | None:
    import re
    m = re.search(r"_(\d+)x(\d+)\.png$", path.name)
    return (int(m.group(1)), int(m.group(2))) if m else None


def vram_mb(w: int, h: int) -> float:
    return w * h * 4 / 1048576


def pack(src: Path, cols: int, fw: int, fh: int, name: str) -> Path:
    files = sorted(src.glob("*.png"))
    if not files:
        raise SystemExit(f"프레임이 없다: {src}")

    rows = (len(files) + cols - 1) // cols
    atlas = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))

    for i, f in enumerate(files):
        im = Image.open(f).convert("RGBA")
        if im.size != (fw, fh):
            if im.width % fw or im.height % fh:
                raise SystemExit(f"{f.name}: {im.size} 는 {fw}x{fh} 의 정수배가 아니다")
            im = im.resize((fw, fh), Image.LANCZOS)
        atlas.paste(im, ((i % cols) * fw, (i // cols) * fh))

    out = SHEET_DIR / f"{name}_{fw}x{fh}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(out, optimize=True)

    print(f"{out.relative_to(ROOT)}")
    print(f"  프레임 {len(files)} · 격자 {cols}×{rows} · 아틀라스 {atlas.width}×{atlas.height}")
    print(f"  VRAM {vram_mb(*atlas.size):.2f}MB · 디스크 {out.stat().st_size / 1048576:.2f}MB")
    if max(atlas.size) > GPU_MAX_DIM:
        print(f"  ✗ 아틀라스 한 변이 {GPU_MAX_DIM} 을 넘는다 — 구형 모바일에서 안 올라간다")
    return out


def verify(path: Path, expect_frames: int | None) -> int:
    size = frame_size_from_name(path)
    if not size:
        print(f"✗ 파일명에 _WxH 가 없다: {path.name} (vfx.ts 의 parseFrameSize 가 못 읽는다)")
        return 1
    fw, fh = size
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)

    cols, rows = im.width // fw, im.height // fh
    bad = []
    if im.width % fw or im.height % fh:
        bad.append("아틀라스가 프레임 크기의 정수배가 아니다")
    if max(im.size) > GPU_MAX_DIM:
        bad.append(f"한 변이 {GPU_MAX_DIM} 초과")
    if a.shape[2] != 4 or a[..., 3].max() == 255 and a[..., 3].min() == 255:
        bad.append("알파 채널이 없거나 전부 불투명하다")

    # 프레임 경계에 걸친 픽셀 — 재생 시 옆 프레임이 비어져 나온다
    spill = 0
    for r in range(rows):
        for c in range(cols):
            fr = a[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw, 3]
            edge = np.concatenate([fr[0], fr[-1], fr[:, 0], fr[:, -1]])
            spill += int((edge > 8).sum())

    used = sum(1 for r in range(rows) for c in range(cols)
               if a[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw, 3].max() > 0)

    print(f"{path.name}")
    print(f"  프레임 {fw}×{fh} · 격자 {cols}×{rows} (칸 {cols * rows}, 내용 있는 칸 {used})")
    print(f"  아틀라스 {im.width}×{im.height} · VRAM {vram_mb(*im.size):.2f}MB "
          f"· 디스크 {path.stat().st_size / 1048576:.2f}MB · 한계 {GPU_MAX_DIM} 대비 "
          f"{GPU_MAX_DIM / max(im.size):.1f}배 여유")
    print(f"  프레임 경계 알파 픽셀 {spill} (0 이어야 한다)")
    if expect_frames is not None and used != expect_frames:
        bad.append(f"내용 있는 칸 {used} ≠ 기대 {expect_frames}")
    for b in bad:
        print(f"  ✗ {b}")
    print("  ✓ PASS" if not bad else "  ✗ FAIL")
    return 0 if not bad else 1


def frames_of(path: Path) -> list[Image.Image]:
    fw, fh = frame_size_from_name(path)
    im = Image.open(path).convert("RGBA")
    cols, rows = im.width // fw, im.height // fh
    out = []
    for r in range(rows):
        for c in range(cols):
            f = im.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
            if np.asarray(f)[..., 3].max() > 0:
                out.append(f)
    return out


def contact(paths: list[Path], size: int, every: int, out: Path, bg: str,
            over: Path | None = None, over_from: int = 0) -> None:
    """**게임 표시 크기로 줄여 놓고** 읽히는지 본다. 큰 그림에서 멋진 건 소용이 없다.

    `over` 를 주면 두 번째 시트를 **같은 중심에 겹쳐서** 본다 (파열 시트 위의 파동처럼
    게임에서 실제로 겹치는 조합을 그대로 확인한다). 프레임 크기가 달라도 중앙 정렬한다.
    """
    grounds = {"dark": (26, 24, 30), "bright": (192, 192, 190), "mid": (110, 116, 108)}
    over_fr = frames_of(over) if over else []
    rowsets = []
    for p in paths:
        fr = frames_of(p)
        if over_fr:
            merged = []
            for i, f in enumerate(fr):
                n = max(f.width, over_fr[0].width)
                cell_im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
                cell_im.alpha_composite(f, ((n - f.width) // 2, (n - f.height) // 2))
                j = i - over_from
                if 0 <= j < len(over_fr):
                    o = over_fr[j]
                    cell_im.alpha_composite(o, ((n - o.width) // 2, (n - o.height) // 2))
                merged.append(cell_im)
            fr = merged
        rowsets.append([fr[i] for i in range(0, len(fr), every)])
    cols = max(len(r) for r in rowsets)
    per = len(grounds)
    W, H = cols * size, len(rowsets) * per * size
    sheet = Image.new("RGB", (W, H))
    y = 0
    for row in rowsets:
        for gname, g in grounds.items():
            band = Image.new("RGBA", (W, size), (*g, 255))
            for i, f in enumerate(row):
                band.alpha_composite(f.resize((size, size), Image.LANCZOS), (i * size, 0))
            sheet.paste(band.convert("RGB"), (0, y))
            y += size
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"{out} — {cols}컷 × {len(rowsets)}시트 × 배경 {list(grounds)} @ {size}px")


def seam(a: Path, b: Path) -> int:
    """이음새 검사 — 앞 시트의 마지막 프레임과 뒤 시트의 첫 프레임이 같은 그림이어야 한다."""
    fa, fb = frames_of(a)[-1], frames_of(b)[0]
    # 두 시트는 프레임 크기가 달라도 **픽셀당 월드 거리가 같다** (렌더가 센서를 같은 비율로
    # 늘린다). 그래서 큰 쪽을 작은 쪽 크기로 **가운데 잘라** 비교한다 — 리사이즈하면
    # 배율이 달라져 멀쩡한 이음새가 틀린 것으로 나온다
    n = min(fa.width, fb.width)

    def center(im):
        d = (im.width - n) // 2
        return im.crop((d, d, d + n, d + n))

    x = np.asarray(center(fa)).astype(float)
    y = np.asarray(center(fb)).astype(float)
    d = np.abs(x - y).mean()
    print(f"이음새 {a.name}[마지막] ↔ {b.name}[0]: 평균 채널 차 {d:.2f} (작을수록 안 튄다)")
    return 0 if d < 6.0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src")
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--frame", default="")
    ap.add_argument("--name", default="")
    ap.add_argument("--verify", default="")
    ap.add_argument("--expect", type=int, default=None)
    ap.add_argument("--contact", nargs="+", default=[])
    ap.add_argument("--size", type=int, default=180)
    ap.add_argument("--every", type=int, default=3)
    ap.add_argument("--out", default="build/cube/contact.png")
    ap.add_argument("--bg", default="dark")
    ap.add_argument("--seam", nargs=2, default=[])
    ap.add_argument("--over", default="", help="contact 에 겹쳐 볼 두 번째 시트")
    ap.add_argument("--over-from", type=int, default=0, dest="over_from",
                    help="두 번째 시트가 시작되는 프레임 인덱스")
    a = ap.parse_args()

    if a.verify:
        return verify(Path(a.verify), a.expect)
    if a.contact:
        contact([Path(p) for p in a.contact], a.size, a.every, Path(a.out), a.bg,
                Path(a.over) if a.over else None, a.over_from)
        return 0
    if a.seam:
        return seam(Path(a.seam[0]), Path(a.seam[1]))
    if not (a.src and a.frame and a.name):
        ap.error("--in / --frame / --name 이 필요하다")
    fw, fh = parse_frame(a.frame)
    pack(Path(a.src), a.cols, fw, fh, a.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
