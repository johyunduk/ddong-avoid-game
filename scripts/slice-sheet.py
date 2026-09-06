#!/usr/bin/env python3
"""생성형 모델이 한 줄로 뽑아준 프레임 이미지를 게임용 스프라이트 시트로 조립한다.

ChatGPT(GPT Image)에 "한 줄에 N프레임, 투명 배경" 으로 요청하면 프레임마다 캐릭터
크기와 위치가 조금씩 다르게 나온다. 그대로 쓰면 재생할 때 캐릭터가 덜덜 떨린다.
이 스크립트가 하는 일은 **자르고 정렬하는 것**이다.

    투명 열(column)로 프레임 분리
    → 발(=알파 bbox 하단)의 세로 위치는 원본 그대로 유지 (공중 프레임의 뜬 느낌 보존)
    → 머리(상단 30%)의 가로 중심을 맞춰 좌우 흔들림 제거
    → 기존 정적 스프라이트와 같은 캔버스·발높이·머리중심으로 재배치

기존 시트(idle·hit)가 있으면 그 프레임을 그대로 가져와 붙이므로, 달리기만 새로
만들어도 시트 하나가 완성된다.

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/slice-sheet.py \\
        --raw <다운로드한.png> --id chibi --dir left --frames 6

--dir left 로 만들면 --mirror 로 right 도 같이 나온다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow + numpy 필요: C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/slice-sheet.py ...")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
ALPHA = 16          # 이 값 이하는 배경으로 본다
MIN_GAP = 4         # 프레임 사이로 인정할 최소 빈 열 폭


def alpha_of(im: Image.Image) -> "np.ndarray":
    return np.array(im.convert("RGBA"))[:, :, 3]


def split_columns(a: "np.ndarray") -> list[tuple[int, int]]:
    """세로로 완전히 빈 열을 경계로 프레임 구간을 찾는다."""
    filled = (a > ALPHA).sum(axis=0) > 0
    spans, start = [], None
    for x, v in enumerate(filled):
        if v and start is None:
            start = x
        elif not v and start is not None:
            spans.append((start, x - 1))
            start = None
    if start is not None:
        spans.append((start, len(filled) - 1))
    # 잡티(아주 좁은 조각)는 버린다
    return [s for s in spans if s[1] - s[0] >= MIN_GAP]


def split_wide(spans: list[tuple[int, int]], want: int) -> list[tuple[int, int]]:
    """붙어버린 프레임을 나눈다.

    팔이 옆 프레임에 닿으면 빈 열이 없어 두 프레임이 한 덩어리로 잡힌다. 폭이 다른
    프레임의 중앙값보다 훨씬 넓은 구간은, 그 안에서 **세로로 가장 비어 있는 열**을
    찾아 거기서 자른다(완전히 비어 있지 않아도 된다).
    """
    while len(spans) < want:
        widths = sorted(s[1] - s[0] + 1 for s in spans)
        typical = widths[len(widths) // 2]
        i = max(range(len(spans)), key=lambda k: spans[k][1] - spans[k][0])
        s, e = spans[i]
        if (e - s + 1) < typical * 1.5:
            break        # 더 나눌 만큼 넓은 구간이 없다
        n = round((e - s + 1) / typical)
        step = (e - s + 1) / max(n, 2)
        cuts = [s + round(step * k) for k in range(1, max(n, 2))]
        parts, prev = [], s
        for c in cuts:
            parts.append((prev, c - 1))
            prev = c
        parts.append((prev, e))
        spans = spans[:i] + parts + spans[i + 1:]
    return spans


def head_width(a: "np.ndarray", span: tuple[int, int]) -> int:
    """머리 폭 = 상단 35% 안에서 가장 넓은 가로줄.

    크기를 맞출 때 전체 높이를 쓰면 안 된다. 달리는 자세는 웅크려서 짧고, 생성물은
    원본보다 머리 비중이 큰 경우가 많다. 치비는 머리가 시선을 지배하므로 **머리 폭**을
    맞춰야 원본과 같은 크기로 보인다.
    """
    s, e = span
    sub = a[:, s:e + 1]
    ys, _ = np.where(sub > ALPHA)
    top, bot = int(ys.min()), int(ys.max())
    best = 0
    for y in range(top, top + int((bot - top + 1) * 0.35)):
        xs = np.where(sub[y] > ALPHA)[0]
        if len(xs):
            best = max(best, int(xs.max() - xs.min() + 1))
    return best


def anchors(a: "np.ndarray", span: tuple[int, int]) -> tuple[int, int, float]:
    """(정수리, 발, 머리 가로중심) — 좌표는 원본 이미지 기준."""
    s, e = span
    sub = a[:, s:e + 1]
    ys, _ = np.where(sub > ALPHA)
    top, bot = int(ys.min()), int(ys.max())
    head_cut = top + int((bot - top) * 0.30)
    _, hx = np.where(sub[top:head_cut + 1] > ALPHA)
    return top, bot, s + float(hx.mean())


def place(src: Image.Image, span: tuple[int, int], a: "np.ndarray",
          scale: float, ground_src: int, canvas: tuple[int, int],
          ground_dst: int, head_dst: float) -> Image.Image:
    """한 프레임을 캔버스에 정렬해 배치한다.

    세로는 **원본 시트 안의 지면(ground_src)** 을 기준으로 잰다. 프레임별 bbox 하단이
    아니라 공통 지면을 쓰기 때문에, 공중에 뜬 프레임은 뜬 채로 남는다.
    """
    top, bot, head_cx = anchors(a, span)
    part = src.crop((span[0], top, span[1] + 1, bot + 1))
    w = max(1, round(part.width * scale))
    h = max(1, round(part.height * scale))
    part = part.resize((w, h), Image.LANCZOS)

    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    # 지면에서 이 프레임 발까지의 거리도 같은 배율로 줄여 유지한다
    foot_gap = round((ground_src - bot) * scale)
    y = ground_dst - foot_gap - h
    x = round(head_dst - (head_cx - span[0]) * scale)
    out.paste(part, (x, y), part)
    return out


def make_hit(src: Image.Image) -> Image.Image:
    """피격 프레임 — 상체가 뒤로 젖혀지고 살짝 주저앉는다.

    생성형 모델은 한 프레임짜리 피격을 시켜도 자세를 크게 바꿔버려 시트가 흔들린다.
    피격은 짧게 스쳐 지나가므로 원본을 부위별로 밀어 만드는 편이 안정적이다.
    """
    a = alpha_of(src)
    ys, xs = np.where(a > ALPHA)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    h = y1 - y0 + 1
    head_end = y0 + int(h * 0.45)
    legs = y0 + int(h * 0.68)
    dx, dy = round(h * 0.03), round(h * 0.02)

    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    for box, mx, my in (((x0, y0, x1 + 1, head_end), -dx, dy),
                        ((x0, head_end, x1 + 1, legs), -dx // 2, dy // 2),
                        ((x0, legs, x1 + 1, y1 + 1), 0, 0)):
        part = src.crop(box)
        out.paste(part, (box[0] + mx, box[1] + my), part)
    return out


def frames_of_sheet(png: Path, meta: dict) -> list[Image.Image]:
    im = Image.open(png).convert("RGBA")
    fw, fh = meta["frameWidth"], meta["frameHeight"]
    n = im.width // fw
    return [im.crop((i * fw, 0, (i + 1) * fw, fh)) for i in range(n)]


def main() -> int:
    p = argparse.ArgumentParser(description="생성된 프레임 줄 → 게임용 시트")
    p.add_argument("--raw", required=True, help="한 줄로 배열된 원본 PNG")
    p.add_argument("--id", required=True, help="캐릭터 id (chibi 등)")
    p.add_argument("--dir", required=True, choices=["front", "left", "right"])
    p.add_argument("--frames", type=int, help="기대 프레임 수 (검증용)")
    p.add_argument("--anim", default="walk", help="이 프레임들이 채울 애니메이션 이름")
    p.add_argument("--frame-rate", type=int, default=12)
    p.add_argument("--pingpong", action="store_true",
                   help="1→N→1 로 왕복 재생 (숨쉬기처럼 되돌아와야 하는 동작)")
    p.add_argument("--scale", type=float, help="배율 (생략하면 캔버스에 맞춰 자동)")
    p.add_argument("--sheets", default="public/assets/sheets")
    p.add_argument("--players", default="public/assets/players")
    p.add_argument("--mirror", action="store_true", help="좌우 반전본도 반대 방향으로 저장")
    p.add_argument("--add-hit", action="store_true",
                   help="hit 애니메이션이 없으면 기준 스프라이트로 피격 프레임을 만들어 붙인다")
    a = p.parse_args()

    raw = Path(a.raw)
    if not raw.exists():
        raise SystemExit(f"원본이 없습니다: {raw}")
    sheets = ROOT / a.sheets
    players = ROOT / a.players

    src = Image.open(raw).convert("RGBA")
    arr = alpha_of(src)
    spans = split_columns(arr)
    if a.frames and len(spans) < a.frames:
        spans = split_wide(spans, a.frames)
        print(f"붙은 프레임을 나눴습니다 → {len(spans)}개")
    if a.frames and len(spans) != a.frames:
        raise SystemExit(f"프레임 {a.frames}개를 기대했지만 {len(spans)}개를 찾았습니다: {spans}")
    print(f"프레임 {len(spans)}개 발견")

    # 기존 정적 스프라이트가 캔버스·발높이·머리중심의 기준이다
    ref_path = players / f"{a.id}_{a.dir}.webp"
    if not ref_path.exists():
        raise SystemExit(f"기준 스프라이트가 없습니다: {ref_path}")
    ref = Image.open(ref_path).convert("RGBA")
    ref_a = alpha_of(ref)
    ref_top, ref_bot, ref_head = anchors(ref_a, (0, ref.width - 1))
    canvas = ref.size
    print(f"기준 {ref_path.name}: 캔버스 {canvas} 발 y={ref_bot} 머리중심 x={ref_head:.1f}")

    tops = [anchors(arr, s)[0] for s in spans]
    bots = [anchors(arr, s)[1] for s in spans]
    ground = max(bots)                       # 가장 낮은 발 = 지면
    reach = ground - min(tops)               # 지면부터 최고 정수리까지

    if a.scale:
        scale = a.scale
    else:
        # 기본은 머리 폭 맞추기 — 원본과 같은 크기로 보이게 하는 기준
        scale = head_width(ref_a, (0, ref.width - 1)) / head_width(arr, spans[0])
        # 그래도 캔버스를 넘치면 줄인다
        scale = min(scale, (ref_bot - ref_top) / reach)
        for s in spans:
            top, bot, hcx = anchors(arr, s)
            left = hcx - s[0]
            right = s[1] - hcx
            scale = min(scale, (ref_head - 1) / max(left, 1),
                        (canvas[0] - ref_head - 1) / max(right, 1))
    print(f"배율 {scale:.3f} (지면 {ground}, 최대 높이 {reach})")

    new_frames = [place(src, s, arr, scale, ground, canvas, ref_bot, ref_head)
                  for s in spans]

    # 기존 시트가 있으면 그 프레임을 유지하고 대상 애니메이션만 갈아끼운다
    out_png = sheets / f"{a.id}_{a.dir}.png"
    out_json = sheets / f"{a.id}_{a.dir}.json"
    if out_json.exists():
        meta = json.loads(out_json.read_text(encoding="utf-8"))
        old = frames_of_sheet(out_png, meta)
        names = list(meta.get("frames", [f"f{i}" for i in range(len(old))]))
        anims = dict(meta.get("anims", {}))
        replaced = set(anims.get(a.anim, {}).get("frames", []))
        keep = [(n, im) for i, (n, im) in enumerate(zip(names, old)) if i not in replaced]
    else:
        keep, anims = [], {}

    combined = keep + [(f"{a.anim}-{i + 1}", im) for i, im in enumerate(new_frames)]
    # 대상 애니메이션은 뒤에 붙였으므로 인덱스가 연속이다
    order = list(range(len(keep), len(combined)))
    if a.pingpong and len(order) > 2:
        order = order + order[-2:0:-1]   # 끝과 처음은 한 번씩만
    anims[a.anim] = {"frames": order, "frameRate": a.frame_rate,
                     "repeat": -1 if a.anim != "hit" else 0}
    # 남은 애니메이션의 프레임 번호를 새 순서에 맞춰 다시 매긴다
    index_of = {n: i for i, (n, _) in enumerate(combined)}
    for name, d in list(anims.items()):
        if name == a.anim:
            continue
        old_names = [names[i] for i in d["frames"] if i < len(names)]
        d["frames"] = [index_of[n] for n in old_names if n in index_of]
        if not d["frames"]:
            anims.pop(name)

    if a.add_hit and "hit" not in anims:
        combined.append(("hit", make_hit(ref)))
        anims["hit"] = {"frames": [len(combined) - 1], "frameRate": 1, "repeat": 0}

    def save(frames: list[tuple[str, Image.Image]], direction: str, flip: bool) -> None:
        fw, fh = canvas
        sheet = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
        for i, (_, im) in enumerate(frames):
            sheet.paste(im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im, (i * fw, 0))
        sheets.mkdir(parents=True, exist_ok=True)
        sheet.save(sheets / f"{a.id}_{direction}.png")
        (sheets / f"{a.id}_{direction}.json").write_text(json.dumps({
            "image": f"{a.id}_{direction}.png",
            "frameWidth": fw, "frameHeight": fh,
            "frames": [n for n, _ in frames],
            "anims": anims,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {a.id}_{direction}.png  {fw}x{fh} × {len(frames)}프레임"
              + ("  (좌우 반전)" if flip else ""))

    save(combined, a.dir, False)
    if a.mirror:
        opposite = {"left": "right", "right": "left"}.get(a.dir)
        if not opposite:
            raise SystemExit("--mirror 는 left/right 에서만 씁니다")
        save(combined, opposite, True)

    print(f"\nanims: " + ", ".join(f"{k}={v['frames']}" for k, v in anims.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
