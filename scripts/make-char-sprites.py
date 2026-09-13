#!/usr/bin/env python3
"""손그림 원본 → 게임용 정적 스프라이트 3종 (`players/<id>_{front,left,right}.webp`).

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/make-char-sprites.py \\
        --id red --front <정면.png> --left <옆모습.png> --cut

`--cut` 을 주면 `comfy-cutout.py`(BiRefNet)로 배경을 먼저 제거한다. 원본이 이미
투명하면 생략한다. 흰 배경 원본이면 `--cut --clean-white` 를 함께 준다.

## 이 스크립트가 지키는 규약

기존 27종을 실측해서 얻은 것이다.

  · 정면과 좌우가 **같은 캔버스**를 쓴다 (치비·나이트·센티넬·매화 전부 208x312)
  · 정면 인물 높이는 **242** — 캔버스의 78% 다. 발밑·머리 위에 여백이 남는다
  · 좌우는 정면의 0.89~1.04배 — 그림에서 나오는 값이라 강제하지 않는다

242 는 눈대중이 아니라 실측값이다. 치비·나이트·센티넬·매화 네 종의 정면 시트가
전부 242~251 안에 들어온다. 처음엔 275 로 잡았는데 그러면 화면에서 다른 캐릭터보다
14% 크게 나와 혼자 떠 보인다.

그래서 **정면 높이만 242 로 맞추고 옆모습에는 같은 배율을 그대로 적용**한다.
두 원본이 같은 설정으로 그려졌다면 이러면 그린 사람이 의도한 크기 관계가 남는다.

**원본이 서로 다른 생성물이면 그 전제가 깨진다.** 정면은 1024x1536 로, 달리기 줄은
2172x724 로 나오면 같은 배율을 적용했을 때 옆모습만 0.38배로 쪼그라든다. 그럴 때는
`--side-height` 로 옆모습 인물 높이를 직접 지정한다 (기존 4종 실측 관계는 정면의
0.89~1.04배이므로 242 기준 215~250 사이가 자연스럽다).

오른쪽은 기본적으로 왼쪽을 좌우 반전해서 만든다. 다만 **머리 모양·모자·장식이
좌우 비대칭인 캐릭터**는 반전하면 가르마와 장식이 반대편으로 넘어가 다른 캐릭터가
된다. 그럴 때는 `--right` 로 오른쪽 원본을 따로 준다.

세로는 발바닥을 공통 지면에 놓고, 가로는 **몸통(bbox) 중심**을 캔버스 중앙에 둔다.
히트박스가 표시 상자 한가운데에 잡히므로(Player.resize 의 setOffset) 정면 몸이
중앙에 와야 보이는 위치와 맞는 위치가 일치한다. 머리 중심으로 맞추면 코트가 한쪽으로만
뻗은 옆모습 탓에 정면 몸이 히트박스에서 밀린다.

## playerDisplaySize 를 반드시 출력값대로 넣는다

`Player.resize()` 는 `setDisplaySize(w, h)` 로 텍스처를 상자에 꽉 채운다. 비율을 안
지키므로 **캔버스 비율 ≠ 표시 비율이면 캐릭터가 가로로 찌그러진다.** 반대로 비율만
맞으면 캔버스가 넓어도 인물은 그린 크기 그대로 나온다(가로·세로가 같은 배율로 준다).
달리기 자세가 옆으로 긴 캐릭터는 캔버스가 넓어지므로 이 값이 [50, 80] 과 달라진다.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CANVAS_H = 312
FRONT_CHAR_H = 242      # 기존 4종 실측값 (치비·나이트·센티넬·매화)
GROUND_Y = 296
ALPHA = 16
MARGIN = 8
MIN_BLOB = 60

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def comfy_cut(src: Path, clean_white: bool) -> Path:
    out = Path(tempfile.gettempdir()) / f"cut_{src.stem}.png"
    cmd = [sys.executable, str(ROOT / "scripts" / "comfy-cutout.py"),
           "--in", str(src), "--out", str(out)]
    if clean_white:
        cmd.append("--clean-white")
    r = subprocess.run(cmd, cwd=ROOT, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0 or not out.exists():
        raise SystemExit(f"배경 제거 실패: {src}")
    return out


def drop_specks(im: Image.Image) -> Image.Image:
    """떨어져 나온 작은 조각을 지운다 (먼지·속도선 등 — 크기 판단에 폭을 부풀린다)."""
    a = np.array(im)
    mask = a[:, :, 3] > ALPHA
    h, w = mask.shape
    seen = np.zeros_like(mask)
    keep = np.zeros_like(mask)
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            stack, comp = [(sy, sx)], []
            seen[sy, sx] = True
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(comp) >= MIN_BLOB:
                ys, xs = zip(*comp)
                keep[np.array(ys), np.array(xs)] = True
    a[:, :, 3] = np.where(keep, a[:, :, 3], 0)
    return Image.fromarray(a)


def prepare(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] < 24:                 # 반투명 잔털은 완전히 지운다
                px[x, y] = (0, 0, 0, 0)
    im = drop_specks(im)
    box = im.getbbox()
    if box is None:
        raise SystemExit(f"{path.name}: 전부 투명합니다 — 배경 제거를 확인하세요")
    im = im.crop(box)
    print(f"{path.name}: {im.size}")
    return im


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True)
    ap.add_argument("--front", required=True)
    ap.add_argument("--left", required=True)
    ap.add_argument("--right", help="오른쪽 원본. 생략하면 왼쪽을 좌우 반전한다 "
                                    "(좌우 비대칭 캐릭터는 반드시 지정)")
    ap.add_argument("--side-height", type=int,
                    help="옆모습 인물 높이를 직접 지정 (정면과 다른 생성물일 때). "
                         "생략하면 정면과 같은 배율을 적용한다")
    ap.add_argument("--cut", action="store_true", help="ComfyUI 로 배경을 먼저 제거한다")
    ap.add_argument("--clean-white", action="store_true", help="흰 배경 원본일 때 함께 준다")
    ap.add_argument("--out", default="public/assets/players")
    a = ap.parse_args()

    srcs = {"front": Path(a.front), "left": Path(a.left)}
    if a.right:
        srcs["right"] = Path(a.right)
    for k, p in list(srcs.items()):
        if not p.exists():
            raise SystemExit(f"{k} 원본이 없습니다: {p}")
        if a.cut:
            srcs[k] = comfy_cut(p, a.clean_white)

    front, left = prepare(srcs["front"]), prepare(srcs["left"])
    right = prepare(srcs["right"]) if a.right else None

    scale = FRONT_CHAR_H / front.height
    print(f"배율 {scale:.4f} (정면 {front.height} → {FRONT_CHAR_H})")

    def scaled(im: Image.Image) -> Image.Image:
        return im.resize((max(1, round(im.width * scale)),
                          max(1, round(im.height * scale))), Image.LANCZOS)

    def to_height(im: Image.Image, h: int) -> Image.Image:
        return im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)

    fs = scaled(front)
    if a.side_height:
        ls = to_height(left, a.side_height)
        rs = to_height(right, a.side_height) if right else None
    else:
        ls = scaled(left)
        rs = scaled(right) if right else None
    print(f"정면 {fs.size} · 왼쪽 {ls.size} (옆/정면 높이비 {ls.height / fs.height:.2f})")
    if rs:
        print(f"오른쪽 {rs.size} (원본 사용 — 반전 아님)")

    W = max([fs.width, ls.width] + ([rs.width] if rs else [])) + MARGIN * 2
    disp_w = round(80 * W / CANVAS_H)
    print(f"캔버스 {W}x{CANVAS_H} · 비율 {W / CANVAS_H:.3f}")

    def place(im: Image.Image) -> Image.Image:
        canvas = Image.new("RGBA", (W, CANVAS_H), (0, 0, 0, 0))
        canvas.paste(im, (round((W - im.width) / 2), GROUND_Y - im.height), im)
        return canvas

    out_dir = ROOT / a.out
    out_dir.mkdir(parents=True, exist_ok=True)
    outs = {"front": place(fs), "left": place(ls)}
    outs["right"] = place(rs) if rs else outs["left"].transpose(Image.FLIP_LEFT_RIGHT)

    for d, im in outs.items():
        p = out_dir / f"{a.id}_{d}.webp"
        im.save(p, format="WEBP", lossless=True, method=6)   # 픽셀 아트 → 무손실
        arr = np.array(im)[:, :, 3]
        ys, xs = np.where(arr > ALPHA)
        print(f"  {p.name}: {im.size} 인물 {xs.max()-xs.min()+1}x{ys.max()-ys.min()+1} "
              f"발y={ys.max()} {p.stat().st_size // 1024}KB")

    print(f"\ncharacter.ts 에 넣을 값:")
    print(f"    playerDisplaySize: [{disp_w}, 80],")
    print(f"    cardDisplaySize: [{disp_w}, 80],")
    if disp_w == 50:
        print("  (기본값 [50, 80] 과 같으므로 생략해도 된다)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
