#!/usr/bin/env python3
"""테드 체스 큐브 — **원화 조립 파이프라인**.

    PY=C:\\ComfyUI\\.venv\\Scripts\\python.exe
    $PY scripts/cube/artwork.py measure creative/_fx/ted-cube/pixel-chatgpt   # 실측
    $PY scripts/cube/artwork.py spec                                          # 정렬 규격 문서 출력
    $PY scripts/cube/artwork.py build --phase forge --src <키프레임디렉터리> --out build/cube/art_forge

**그림을 그리지 않는다.** 이 스크립트가 하는 일은 composer 가 넘긴 원화를
자르고(정수), 줄이고(정수배), 옮기고(정수), 격자에 배치하는 것뿐이다.

## 왜 정수만 쓰는가
픽셀아트를 임의 배율로 리샘플하면 원화의 픽셀 격자가 깨져 '그림을 줄인 것'이 된다.
그래서 아래 넷만 쓴다 — 전부 원화 픽셀을 그대로 보존한다.

  1. 홀드      같은 그림을 여러 프레임 유지
  2. 평행이동  **정수 px**. 서브픽셀 이동 금지
  3. 정수 자르기
  4. 정수배 축소 (기본 NEAREST. `--resample box` 는 정확한 N:1 **면적 평균**)
  5. 오려내기  원화의 조각(연결 성분)을 잘라 **정수 px 로 방사 이동** (`mode: explode`)

회전은 하지 않는다. 필요하면 그 각도의 키프레임을 composer 에게 요청한다.

## 배율 정규화도 정수로 한다
composer 가 알려온 대로 원화마다 큐브가 그려진 크기가 다르다 (`03_charge` 가
`02_assemble` 의 1.3배). **임의 배율로 맞추지 않는다** — 대신 키프레임마다
**정수 축소 배율을 다르게** 골라 화면 크기를 맞춘다. 프레임 크기는 그대로고
잘라 오는 원본 영역만 배율만큼 넓어진다.

    02_assemble   큐브 464px ÷4 = 116px
    02b_firstlight 464px ÷4 = 116px
    03_charge      603px ÷5 = 120px   ← 이 한 장만 ÷5
    03b_maxcompress 480px ÷4 = 120px

÷4 로 통일하면 충전에서 큐브가 30% 튀고, ÷5 를 섞으면 편차가 ±2% 로 떨어진다.

## 규격이 왜 1024 / ÷4 인가 (실측 근거)
`02_assemble.png` 의 큐브 실루엣이 1254px 캔버스에서 **464×512** 다.
게임에서 큐브는 약 120px 이어야 하므로 축소 배율은 464/120 ≈ 3.9 → **정수 4**.
그래서 전달 캔버스를 `256×4 = 1024` 로 잡고, forge 는 `192×4 = 768` 을 가운데서 자른다.
원화는 **한 번도 확대되지 않고** 딱 한 번 정수배로 줄어든다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.append(str(Path(__file__).resolve().parent))
import timeline as T  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent.parent
HERE = Path(__file__).resolve().parent
MAP_JSON = HERE / "keyframe-map.json"
SPEC_MD = ROOT / "creative" / "_fx" / "ted-cube" / "ALIGNMENT.md"

# ── 전달 규격 ────────────────────────────────────────────────────────────────
SCALE = 4                       # 정수 축소 배율. 원화 → 게임 프레임
DELIVERY_PX = T.BLAST_PX * SCALE        # 1024 — composer 가 넘기는 캔버스
FORGE_SRC_PX = T.FORGE_PX * SCALE       # 768  — forge 프레임이 쓰는 중앙 영역
# 02_assemble 실측값. 모든 키프레임의 큐브가 여기에 맞아야 이어 붙였을 때 안 튄다
CUBE_W, CUBE_H = 464, 512
CUBE_TOL = 16
CENTER_TOL = 4


# ─────────────────────────────────────────────────────────────────────────────
# 실측
# ─────────────────────────────────────────────────────────────────────────────

def foreground(a: np.ndarray, alpha: np.ndarray | None) -> np.ndarray:
    """전경 마스크. 알파가 있으면 알파를, 없으면 모서리 색을 배경으로 보고 키잉한다."""
    if alpha is not None and alpha.min() < 250:
        return alpha > 24
    bg = np.median(np.concatenate([a[0, :20], a[-1, :20], a[:20, 0], a[:20, -1]]), axis=0)
    return np.abs(a.astype(int) - bg).sum(2) > 40


def solid_blob(mask: np.ndarray, kernel: int = 31):
    """가는 광선을 큰 커널 열림으로 지우고 남는 **가장 큰 덩어리**(= 큐브 몸통)."""
    solid = ndimage.binary_opening(mask, np.ones((kernel, kernel)))
    lab, k = ndimage.label(solid)
    if k == 0:
        return None
    sizes = ndimage.sum(solid, lab, range(1, k + 1))
    cm = lab == int(np.argmax(sizes)) + 1
    ys, xs = np.nonzero(cm)
    return int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max()), int(sizes.max())


def measure(path: Path) -> dict:
    im = Image.open(path)
    rgba = im.convert("RGBA")
    a = np.asarray(rgba)
    alpha = a[..., 3]
    has_alpha = bool(alpha.min() < 250)
    m = foreground(a[..., :3], alpha)
    ys, xs = np.nonzero(m)
    cx, cy = im.width / 2, im.height / 2
    out = {
        "file": path.name,
        "size": list(im.size),
        "mode": im.mode,
        "has_alpha": has_alpha,
        "fg_ratio": round(float(m.mean()), 4),
        "content_bbox": [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())] if len(xs) else None,
        "centroid_offset": [round(float(xs.mean() - cx), 1), round(float(ys.mean() - cy), 1)] if len(xs) else None,
    }
    blob = solid_blob(m)
    if blob:
        x0, x1, y0, y1, area = blob
        out["cube"] = {
            "size": [x1 - x0 + 1, y1 - y0 + 1],
            "center_offset": [round((x0 + x1) / 2 - cx, 1), round((y0 + y1) / 2 - cy, 1)],
            "area": area,
        }
    return out


def cmd_measure(args) -> int:
    src = Path(args.src)
    files = sorted(p for p in src.glob("*.png") if not p.name.startswith("_"))
    if not files:
        raise SystemExit(f"png 이 없다: {src}")
    print(f"{src}  ({len(files)}장)\n")
    rows = []
    for p in files:
        r = measure(p)
        rows.append(r)
        cube = r.get("cube")
        print(f"{r['file']:<22} {r['size'][0]}×{r['size'][1]} {r['mode']:<5} "
              f"알파 {'있음' if r['has_alpha'] else '**없음**'}  전경 {r['fg_ratio'] * 100:5.1f}%")
        if r["content_bbox"]:
            b = r["content_bbox"]
            print(f"{'':22} 내용 bbox [{b[0]},{b[1]}]–[{b[2]},{b[3]}] "
                  f"무게중심 오프셋 ({r['centroid_offset'][0]:+.0f}, {r['centroid_offset'][1]:+.0f})")
        if cube:
            print(f"{'':22} 큐브 덩어리 {cube['size'][0]}×{cube['size'][1]} "
                  f"중심 오프셋 ({cube['center_offset'][0]:+.0f}, {cube['center_offset'][1]:+.0f})")
        print()

    bad = [r for r in rows if not r["has_alpha"]]
    if bad:
        print(f"※ 알파가 없는 파일 {len(bad)}장 — 배경 제거가 안 된 것이다 "
              f"(조립할 때 자동 키잉으로 넘어가지만, 원화 픽셀이 살짝 깎인다)")
    sizes = {tuple(r["size"]) for r in rows}
    if len(sizes) > 1:
        print(f"※ 캔버스 크기가 제각각이다: {sizes} — 하나로 맞춰야 정렬이 성립한다")
    return 0


def cmd_spec(args) -> int:
    text = f"""# 테드 체스 큐브 — 원화 전달 규격

> `scripts/cube/artwork.py spec` 이 생성한다. 수치의 근거는 실측이다 (아래 §근거).
> 받는 쪽: w7 `연출·Claude` 의 `scripts/cube/artwork.py build`

## 1. 캔버스

| 항목 | 값 |
|---|---|
| 크기 | **{DELIVERY_PX}×{DELIVERY_PX} px** (= 게임 프레임 {T.BLAST_PX} × {SCALE}) |
| 형식 | PNG **RGBA**, 배경 완전 투명 (알파 0) |
| 파일명 | `<프레임번호 4자리>_<이름>.png` 예: `0018_lock.png` — 번호가 재생 순서다 |

**모든 키프레임이 같은 캔버스여야 한다.** 크기가 다르면 정렬이 성립하지 않는다.

## 2. 원화 픽셀

- **확대·축소하지 마라.** ChatGPT 원화의 픽셀을 그대로 둔다. 캔버스에 놓을 때
  **정수 px 평행이동만** 쓴다 (서브픽셀 이동 금지)
- 배경 제거는 **알파를 0/255 로** — 반투명 테두리를 남기지 마라. 남으면 게임에서
  하드 엣지가 흐려진다
- 색을 보정하지 마라. 밝기·채도·커브 전부 금지 (게임 쪽 검증이 색 변화를 잡아낸다)

## 3. 큐브 정렬 (가장 중요하다)

큐브가 들어 있는 모든 키프레임에서:

| 항목 | 목표 | 허용 |
|---|---|---|
| 큐브 실루엣 | **{CUBE_W}×{CUBE_H} px** | ±{CUBE_TOL} px |
| 큐브 중심 | **캔버스 정중앙 ({DELIVERY_PX // 2}, {DELIVERY_PX // 2})** | ±{CENTER_TOL} px |
| 각도 | `02_assemble` 의 각을 **전부 동일하게** | 변경 금지 |

각도가 바뀌어야 하는 연출은 **그 각도의 키프레임을 따로 그려서** 달라.
받는 쪽에서 회전시키지 않는다 — 픽셀아트를 임의 각도로 돌리면 뭉개진다.

## 4. 화면에 남는 범위

| 구간 | 살아남는 영역 | 이유 |
|---|---|---|
| 모임·결합·충전 (forge) | 가운데 **{FORGE_SRC_PX}×{FORGE_SRC_PX}** | 게임 프레임이 {T.FORGE_PX}px 라 여기까지만 쓴다 |
| 파열·잔광 (blast) | 캔버스 전체 **{DELIVERY_PX}×{DELIVERY_PX}** | 게임 프레임 {T.BLAST_PX}px |

바깥으로 나가는 조각은 **캔버스 안에서 사라져야** 한다. 경계에서 잘리면
게임 배경 위에 직선 자국이 남는다.

## 5. 필요한 키프레임

채택 4장이 뼈대이고, 그 사이를 원화의 **편집본**으로 메운다.
받는 쪽은 홀드 · 정수 평행이동밖에 못 하므로, **형태가 바뀌는 순간마다 키프레임이 필요하다.**

| 프레임 | 내용 | 비고 |
|---|---|---|
| 0000–0008 | 체스 말이 바깥에서 안으로 | 위치만 다른 편집본 3–4장이면 평행이동으로 메울 수 있다 |
| 0009–0013 | **체스 말이 조각으로 분해** | 형태가 바뀐다 → 2–3장 필요 |
| 0014–0017 | 조각이 3×3 자리로 | 2장 |
| 0018 | **십자형 섬광** | 1장 (1프레임짜리 컷) |
| 0019–0020 | 멈칫 (완전 정지) | `02_assemble` 홀드 |
| 0021–0032 | 이음새 충전 | 밝기 단계가 보이게 3–4장 (`03_charge` 로 수렴) |
| 0033–0035 | 예비 압축 | 1–2장 |
| 0036–0037 | **각진 파열** | `04_burst` + 직전 1장 |
| 0038–0043 | 조각 확산 | 2–3장 |
| 0044–0059 | 잔광 | 2–3장 |

총 **{T.FORGE_FRAMES + T.BLAST_FRAMES}프레임 / {T.TOTAL_MS / 1000:.1f}초 @ {T.FPS}fps**.
키프레임 수는 20장 안팎이면 충분하다 — 나머지는 홀드와 정수 평행이동으로 메운다.

## 근거 (실측)

- 채택 4장은 전부 **1254×1254 RGB**, 알파 없음 (배경이 칠해져 있다)
- `02_assemble` 의 큐브 실루엣 **464×512**, 중심이 캔버스 중심에서 (+7, −1)
- `03_charge` 의 큐브 중심은 (−20, −40) — **02 와 약 40px 어긋나 있다.**
  이대로 이어 붙이면 충전에 들어갈 때 큐브가 튄다. 정렬이 필요한 이유가 이것이다
- 축소 배율: 464 ÷ (게임 목표 약 120px) ≈ 3.9 → 정수 **{SCALE}**
- 원화의 픽셀 덩어리는 1254px 기준 약 8px → 네이티브 해상도 약 157px
"""
    SPEC_MD.parent.mkdir(parents=True, exist_ok=True)
    SPEC_MD.write_text(text, encoding="utf-8")
    print(f"{SPEC_MD.relative_to(ROOT)} 갱신 ({len(text.splitlines())}줄)")
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# 조립
# ─────────────────────────────────────────────────────────────────────────────

def key_background(im: Image.Image) -> Image.Image:
    """알파가 없는 원화의 배경을 키잉한다. **임시 수단**이다 —
    composer 가 배경을 지워 오면 이 경로를 타지 않는다."""
    a = np.asarray(im.convert("RGBA")).copy()
    rgb = a[..., :3].astype(int)
    bg = np.median(np.concatenate([rgb[0, :20], rgb[-1, :20], rgb[:20, 0], rgb[:20, -1]]), axis=0)
    d = np.abs(rgb - bg).sum(2)
    a[..., 3] = np.where(d > 40, 255, 0).astype(np.uint8)      # 0/255 만 — 반투명 테두리 금지
    return Image.fromarray(a, "RGBA")


def pad_square(im: Image.Image, size: int) -> Image.Image:
    """가운데 맞춰 **덧대기만** 한다. 자르지 않는다 — 원화를 미리 깎아 버리면
    나중에 넓은 창(큰 축소 배율)으로 봐도 이미 없는 부분은 돌아오지 않는다."""
    if im.width >= size and im.height >= size:
        return im
    n = max(size, im.width, im.height)
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    out.alpha_composite(im, ((n - im.width) // 2, (n - im.height) // 2))
    return out


def shrink(im: Image.Image, factor: int, mode: str, palette: list | None) -> Image.Image:
    """**정확히 factor:1** 축소. 두 방식 중 하나만 쓴다.

    nearest — factor 픽셀마다 하나를 고른다. 원화가 정확히 factor 배로 그려졌으면 무손실.
              격자가 안 맞으면 특징이 통째로 빠질 수 있다
    box     — factor×factor **면적 평균**. 임의 배율이 아니라 정확한 정수 면적 평균이라
              원화 격자가 어긋나 있어도 형태가 남는다. 색은 원화 색의 평균이므로
              팔레트로 되돌리지 않는다 — 되돌리면 계열 비율이 틀어진다(실측 색분포 0.45)
    """
    w, h = im.width // factor, im.height // factor
    if mode == "nearest":
        return im.resize((w, h), Image.NEAREST)

    a = np.asarray(im).astype(np.float32).reshape(h, factor, w, factor, 4)
    alpha = a[..., 3].mean(axis=(1, 3))
    # 색은 **불투명 픽셀만** 평균한다. 투명 픽셀의 RGB 가 섞이면 테두리가 탁해진다
    wgt = a[..., 3:4] / 255.0
    rgb = (a[..., :3] * wgt).sum(axis=(1, 3)) / np.maximum(wgt.sum(axis=(1, 3)), 1e-6)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(alpha >= 128, 255, 0).astype(np.uint8)   # 하드 엣지 유지
    return Image.fromarray(out, "RGBA")


def load_palette() -> list | None:
    p = HERE / "palette.json"
    if not p.exists():
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
    cols = [d["outline"], d["hot"]] + d["dark"] + d["ivory"] + d["gold"]
    seen, out = set(), []
    for c in cols:
        t = tuple(c)
        if t not in seen:
            seen.add(t)
            out.append(list(t))
    return out


def parts_of(im: Image.Image, min_px: int = 24) -> list[dict]:
    """원화를 **연결 성분으로 오려낸다**. 조각 하나하나를 따로 움직이기 위한 것이다.

    새로 그리는 게 아니라 원화 픽셀을 그대로 들어 옮긴다.
    """
    a = np.asarray(im)
    lab, k = ndimage.label(a[..., 3] > 128)
    if k == 0:
        return []
    objs = ndimage.find_objects(lab)
    cx = cy = im.width / 2
    out = []
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if w * h < min_px:
            continue
        piece = im.crop((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
        mask = Image.fromarray(((lab[sl] == i) * 255).astype(np.uint8), "L")
        cut = Image.new("RGBA", piece.size, (0, 0, 0, 0))
        cut.paste(piece, (0, 0), mask)
        px, py = sl[1].start + w / 2 - cx, sl[0].start + h / 2 - cy
        r = max((px * px + py * py) ** 0.5, 1e-6)
        out.append({"img": cut, "pos": (sl[1].start, sl[0].start),
                    "dir": (px / r, py / r), "r": r, "area": int((lab[sl] == i).sum())})
    total = sum(p["area"] for p in out) or 1
    for p in out:
        p["share"] = p["area"] / total
    return out


# 전체 면적의 이만큼을 넘는 성분은 **주요 덩어리**로 본다.
# 원화의 광선이 조각들을 하나로 이어 놓아서 큰 성분 하나가 화면의 80% 를 차지하는 경우가 있다 —
# 그걸 움직이거나 버리면 그림이 통째로 날아간다. 움직이는 것도 버리는 것도 잔해뿐이다.
MAIN_SHARE = 0.20


PARTS_CACHE: dict[int, list] = {}


def explode(src: Image.Image, step: int, scale: int, hold_r: float) -> Image.Image:
    """조각을 각자 방사 방향으로 **정수 게임 px** 만큼 옮긴다.

    이동량이 축소 배율의 배수여야 한다 — 아니면 NEAREST 가 집는 픽셀 위상이 바뀌어
    같은 조각이 프레임마다 다르게 뭉개진다. 그래서 게임 px 단위로 계산하고 배율을 곱한다.
    """
    key = id(src)
    if key not in PARTS_CACHE:
        PARTS_CACHE[key] = parts_of(src)
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    for p in PARTS_CACHE[key]:
        k = 0 if (p["r"] < hold_r or p["share"] >= MAIN_SHARE) else step
        ox = int(round(p["dir"][0] * k)) * scale
        oy = int(round(p["dir"][1] * k)) * scale
        out.alpha_composite(p["img"], (p["pos"][0] + ox, p["pos"][1] + oy))
    return out


def drop_edge_parts(src: Image.Image, window: int) -> Image.Image:
    """보이는 창을 **가로지르는 조각을 통째로 뺀다.**

    프레임 경계에서 반쯤 잘린 조각은 게임 배경 위에 직선 자국을 남긴다. 픽셀아트라
    알파로 흐릴 수도 없으니, 잘릴 조각은 아예 그리지 않는다 — 조각 하나가 통째로
    사라지는 건 픽셀 연출에서 정상이지만 반쪽으로 잘리는 건 아니다.
    원화 픽셀은 손대지 않는다 (오려내서 뺄 뿐이다).
    """
    d = (src.width - window) // 2
    lo, hi = d, d + window
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    for p in parts_of(src, min_px=1):
        x0, y0 = p["pos"]
        x1, y1 = x0 + p["img"].width, y0 + p["img"].height
        if x1 <= lo or x0 >= hi or y1 <= lo or y0 >= hi:
            continue                                    # 창 밖 — 어차피 안 보인다
        if p["share"] >= MAIN_SHARE:
            out.alpha_composite(p["img"], (x0, y0))     # 주요 덩어리는 버리지 않는다
            continue
        if x0 < lo or y0 < lo or x1 > hi or y1 > hi:
            continue                                    # 창을 가로지르는 잔해 — 통째로 뺀다
        out.alpha_composite(p["img"], (x0, y0))
    return out


def build_frame(src: Image.Image, phase: str, dx: int, dy: int,
                resample: str, scale: int, step: int = 0, hold_r: float = 0.0,
                drop_edge: bool = False) -> Image.Image:
    """전달 캔버스 → 게임 프레임. 자르기·평행이동·정수배 축소, 전부 정수다.

    `scale` 은 키프레임마다 다를 수 있다 (배율 정규화). 프레임 크기는 그대로고
    **잘라 오는 원본 영역만** 배율만큼 넓어진다.
    """
    if step:
        src = explode(src, step, scale, hold_r)
    canvas = Image.new("RGBA", src.size, (0, 0, 0, 0))
    # 정수 평행이동 — 서브픽셀 이동은 쓰지 않는다
    canvas.paste(src, (dx * scale, dy * scale))

    # 보이는 창 = 게임 프레임 × 축소 배율. 배율이 클수록 원화를 **넓게** 본다
    want = (T.FORGE_PX if phase == "forge" else T.BLAST_PX) * scale
    if drop_edge and want < canvas.width:
        canvas = drop_edge_parts(canvas, want)
    canvas = pad_square(canvas, want)
    d = (canvas.width - want) // 2
    canvas = canvas.crop((d, d, d + want, d + want))
    return shrink(canvas, scale, resample, None)


def cmd_build(args) -> int:
    if not MAP_JSON.exists():
        raise SystemExit(f"{MAP_JSON.name} 이 없다 — 키프레임 배치표를 먼저 써라")
    fmap = json.loads(MAP_JSON.read_text(encoding="utf-8"))[args.phase]
    src_dir = Path(args.src)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    palette = None

    cache: dict[str, Image.Image] = {}
    scales: set[int] = set()

    def get(name: str) -> Image.Image:
        if name not in cache:
            p = next((q for q in src_dir.glob(f"*{name}*.png")), None)
            if p is None:
                raise SystemExit(f"키프레임을 못 찾았다: {name} (in {src_dir})")
            im = Image.open(p).convert("RGBA")
            if np.asarray(im)[..., 3].min() >= 250:
                print(f"  ※ {p.name}: 알파가 없다 — 자동 키잉으로 넘어간다")
                im = key_background(im)
            cache[name] = pad_square(im, DELIVERY_PX)
        return cache[name]

    n_frames = fmap["frames"]
    used = [None] * n_frames
    for seg in fmap["timeline"]:
        a, b = seg["range"]
        sc = int(seg.get("scale", SCALE))
        if sc < 1:
            raise SystemExit(f"축소 배율은 1 이상의 정수여야 한다: {seg}")
        scales.add(sc)
        for i in range(a, b):
            u = 0.0 if b - a <= 1 else (i - a) / (b - a - 1)
            dx = int(round(seg.get("dx0", 0) + (seg.get("dx1", seg.get("dx0", 0)) - seg.get("dx0", 0)) * u))
            dy = int(round(seg.get("dy0", 0) + (seg.get("dy1", seg.get("dy0", 0)) - seg.get("dy0", 0)) * u))
            # 조각 방사 이동 — 게임 px 단위 정수
            step = int(round(seg.get("speed", 0) * (i - a)))
            used[i] = (seg["key"], dx, dy, sc, step, float(seg.get("hold_r", 0)),
                       bool(seg.get("drop_edge", False)))

    missing = [i for i, v in enumerate(used) if v is None]
    if missing:
        raise SystemExit(f"배치표가 비어 있는 프레임: {missing}")

    for i, (key, dx, dy, sc, step, hold_r, drop) in enumerate(used):
        im = build_frame(get(key), args.phase, dx, dy, args.resample, sc, step, hold_r, drop)
        im.save(out_dir / f"f{i:04d}.png")

    a = np.concatenate([np.asarray(Image.open(p))[..., 3].ravel()
                        for p in sorted(out_dir.glob("*.png"))])
    semi = int(((a > 8) & (a < 248)).sum())
    op = int((a >= 248).sum())
    print(f"[artwork] {args.phase} {n_frames}프레임 → {out_dir}  "
          f"키프레임 {len(cache)}장 · 축소 {sorted(scales)}:1 {args.resample} · "
          f"반투명 {semi}/{op} ({100 * semi / max(op, 1):.2f}%)")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("measure", help="원화 실측")
    m.add_argument("src")
    m.set_defaults(fn=cmd_measure)

    s = sub.add_parser("spec", help="정렬 규격 문서 생성")
    s.set_defaults(fn=cmd_spec)

    b = sub.add_parser("build", help="키프레임 → 게임 프레임")
    b.add_argument("--phase", choices=("forge", "blast"), required=True)
    b.add_argument("--src", required=True)
    b.add_argument("--out", required=True)
    b.add_argument("--resample", choices=("nearest", "box"), default="nearest")
    b.set_defaults(fn=cmd_build)

    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
