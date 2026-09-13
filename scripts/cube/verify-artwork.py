#!/usr/bin/env python3
"""게임 시트 프레임이 **원본 ChatGPT 원화와 같은 그림인지** 수치로 검증한다.

    PY=C:\\ComfyUI\\.venv\\Scripts\\python.exe
    $PY scripts/cube/verify-artwork.py --sheet public/assets/fx/sheets/cubeartforge_192x192.png \\
        --phase forge --refs creative/_fx/ted-cube/pixel-chatgpt --out build/cube/verify_forge.png

## 무엇을 재는가

이 검사는 "예쁜가"를 보지 않는다. **원화를 그대로 넣었는가**만 본다.
정렬·크기 보정으로 생기는 차이는 허용하고, **형태와 색이 바뀌면 잡아낸다.**

| 지표 | 정의 | 합격선 |
|---|---|---|
| `IoU` | 두 실루엣(알파 마스크)의 교집합/합집합. 최적 정수 오프셋으로 맞춘 뒤 | ≥ 0.80 |
| `NCC` | 밝기의 정규화 상호상관. 형태가 다르면 떨어진다 | ≥ 0.85 |
| `색적중` | 내 프레임의 불투명 픽셀 중, **원화에 실제로 있는 색**(8단계 격자 ±1칸)인 비율 | ≥ 0.90 |
| `색분포` | 아이보리/암부/금 세 계열의 픽셀 비율 차이 (L1) | ≤ 0.20 |

## 두 단계로 나눠 본다

원화가 게임에 들어오기까지 손이 두 번 간다. **어디서 달라졌는지 섞이면 안 된다.**

    A. 배경 제거   composer 의 `*_cut.png`  vs  원본 4장
       → 불투명 픽셀의 RGB 가 **한 채널도 안 바뀌었는지** (최대 차 0 이어야 한다)
    B. 조립        게임 시트 프레임        vs  `*_cut.png`
       → 형태·색이 그대로인지 (아래 표)

A 를 건너뛰고 시트를 원본과 바로 비교하면 배경 제거 임계값 차이가 색 변화로 잘못 잡힌다
(실측: composer 는 내 키잉보다 어두운 픽셀을 25% 더 남겼고, 그 탓에 색분포가 0.30 으로 나왔다).

## 어떻게 맞추는가

1. 양쪽에서 전경(알파 또는 배경 키잉)을 뽑고 **내용 bbox 로 자른다** — 캔버스 여백을 지운다
2. 원화 쪽을 내 프레임 쪽 크기에 맞춘다. **이건 측정용 리샘플이지 에셋 생산이 아니다**
   (에셋은 `artwork.py` 가 정수배로만 만든다)
3. ±4px 범위에서 IoU 가 가장 높은 정수 오프셋을 찾아 그 값으로 지표를 낸다

## 왜 이 검사가 필요한가

이전 판(`scripts/cube/pixel.py`)은 채택 원화에서 **팔레트만 뽑고 그림은 코드로 새로 그렸다.**
색은 맞고 형태는 다르다 — `색적중` 은 높은데 `IoU`·`NCC` 가 낮게 나온다.
그 구분을 사람 눈이 아니라 숫자로 하려고 만든 도구다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.append(str(Path(__file__).resolve().parent))
import timeline as T  # noqa: E402
import artwork as A  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
MAP_JSON = HERE / "keyframe-map.json"

PASS_IOU = 0.80
PASS_NCC = 0.85
PASS_HIT = 0.90
PASS_DIST = 0.20
SEARCH = 4          # 정수 오프셋 탐색 반경(px)


# ─────────────────────────────────────────────────────────────────────────────

def to_rgba(im: Image.Image) -> np.ndarray:
    """알파가 없으면 모서리 색을 배경으로 보고 키잉한다 (0/255)."""
    a = np.asarray(im.convert("RGBA")).copy()
    if a[..., 3].min() < 250:
        return a
    rgb = a[..., :3].astype(int)
    bg = np.median(np.concatenate([rgb[0, :20], rgb[-1, :20], rgb[:20, 0], rgb[:20, -1]]), axis=0)
    a[..., 3] = np.where(np.abs(rgb - bg).sum(2) > 40, 255, 0).astype(np.uint8)
    return a


def crop_content(a: np.ndarray) -> np.ndarray:
    ys, xs = np.nonzero(a[..., 3] > 24)
    if len(xs) == 0:
        return a
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def family(rgb: np.ndarray) -> np.ndarray:
    """픽셀을 아이보리(0) / 암부(1) / 금(2) 세 계열로 나눈다."""
    mx = rgb.max(-1).astype(float)
    mn = rgb.min(-1).astype(float)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = rgb.astype(float) @ np.array([0.299, 0.587, 0.114])
    out = np.where(sat > 0.30, 2, np.where(lum < 110, 1, 0))
    return out


def color_grid(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """원화에 **실제로 존재하는 색**의 3차원 점유 격자 (8단계, 32³).

    '자주 쓰인 24색' 이 아니라 '원화에 있는 색 전부' 를 기준으로 삼는다 —
    대표색만 보면 원화에서 그대로 가져온 픽셀도 탈락한다(첫 판이 그랬다).
    한 칸 부풀려서 ΔRGB 약 24 의 허용 오차를 준다.
    """
    g = np.zeros((32, 32, 32), bool)
    q = rgb[mask] // 8
    if len(q):
        g[q[:, 0], q[:, 1], q[:, 2]] = True
    for ax in (0, 1, 2):
        g |= np.roll(g, 1, axis=ax) | np.roll(g, -1, axis=ax)
    return g


def align(ma: np.ndarray, mb: np.ndarray) -> tuple[int, int, float]:
    """±SEARCH 안에서 IoU 가 가장 높은 정수 오프셋."""
    best = (0, 0, -1.0)
    for dy in range(-SEARCH, SEARCH + 1):
        for dx in range(-SEARCH, SEARCH + 1):
            b = np.roll(np.roll(mb, dy, axis=0), dx, axis=1)
            inter = (ma & b).sum()
            union = (ma | b).sum()
            iou = inter / union if union else 0.0
            if iou > best[2]:
                best = (dx, dy, float(iou))
    return best


def center_crop(a: np.ndarray, px: int) -> np.ndarray:
    if px <= 0 or px >= min(a.shape[:2]):
        return a
    dy = (a.shape[0] - px) // 2
    dx = (a.shape[1] - px) // 2
    return a[dy:dy + px, dx:dx + px]


def compare(ref_im: Image.Image, mine_im: Image.Image, crop: int = 0,
            ref_resample: str = "nearest") -> dict:
    # `crop` 을 주면 원화를 **조립 파이프라인과 같은 중앙 영역으로 잘라** 비교한다.
    # 이러면 "잘라낸 탓"과 "다시 그린 탓"이 분리된다 — 전자는 허용, 후자는 실패다
    ref = crop_content(center_crop(to_rgba(ref_im), crop))
    mine = crop_content(to_rgba(mine_im))
    h, w = mine.shape[:2]
    # 측정용 리샘플 — 에셋 생산이 아니다 (에셋은 artwork.py 가 정수배로만 만든다)
    # **원화 쪽도 시트와 같은 방식으로 줄인다.** BOX 로 줄이면 알파가 섞여 경계의
    # 검은 외곽선이 마스크에서 빠지고, 하드 알파인 시트만 상대적으로 어두워 보인다 —
    # 실제 색이 바뀐 게 아니라 비교 방식이 만든 차이다 (실측 색분포 0.29 → 0.07)
    filt = Image.NEAREST if ref_resample == "nearest" else Image.BOX
    ref_r = np.asarray(Image.fromarray(ref, "RGBA").resize((w, h), filt))

    ma = ref_r[..., 3] > 128
    mb = mine[..., 3] > 128
    dx, dy, iou = align(ma, mb)
    mb = np.roll(np.roll(mb, dy, axis=0), dx, axis=1)
    mine_s = np.roll(np.roll(mine, dy, axis=0), dx, axis=1)

    la = (ref_r[..., :3].astype(float) @ np.array([0.299, 0.587, 0.114])) * ma
    lb = (mine_s[..., :3].astype(float) @ np.array([0.299, 0.587, 0.114])) * mb
    za, zb = la - la.mean(), lb - lb.mean()
    ncc = float((za * zb).sum() / (np.sqrt((za ** 2).sum() * (zb ** 2).sum()) + 1e-9))

    grid = color_grid(ref_r[..., :3], ma)
    px = mine_s[..., :3][mb]
    if len(px):
        q = px // 8
        hit = float(grid[q[:, 0], q[:, 1], q[:, 2]].mean())
    else:
        hit = 0.0

    fa = family(ref_r[..., :3])[ma]
    fb = family(mine_s[..., :3])[mb]
    ha = np.array([(fa == i).mean() for i in range(3)]) if len(fa) else np.zeros(3)
    hb = np.array([(fb == i).mean() for i in range(3)]) if len(fb) else np.zeros(3)
    dist = float(np.abs(ha - hb).sum())

    return {"iou": iou, "ncc": ncc, "hit": hit, "dist": dist, "offset": [dx, dy],
            "fam_ref": [round(float(v), 3) for v in ha],
            "fam_mine": [round(float(v), 3) for v in hb],
            "_ref": ref_r, "_mine": mine_s}


def cut_diff(orig: Path, cut: Path) -> dict:
    """배경 제거가 **원화 픽셀을 건드렸는지**. 둘 다 불투명한 자리의 RGB 최대 차."""
    a = np.asarray(Image.open(orig).convert("RGBA")).astype(int)
    b = np.asarray(Image.open(cut).convert("RGBA")).astype(int)
    if a.shape != b.shape:
        return {"rgb_max": -1, "both": 0}
    m = b[..., 3] > 250
    if not m.any():
        return {"rgb_max": -1, "both": 0}
    return {"rgb_max": int(np.abs(a[..., :3][m] - b[..., :3][m]).max()), "both": int(m.sum())}


def sheet_frames(path: Path) -> list[Image.Image]:
    import re
    m = re.search(r"_(\d+)x(\d+)\.png$", path.name)
    if not m:
        raise SystemExit(f"파일명에 _WxH 가 없다: {path.name}")
    fw, fh = int(m.group(1)), int(m.group(2))
    im = Image.open(path).convert("RGBA")
    out = []
    for r in range(im.height // fh):
        for c in range(im.width // fw):
            f = im.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
            out.append(f)
    return out


def overlay(rows: list[tuple[str, dict]], out: Path, cell: int = 192) -> None:
    """원화 | 내 프레임 | 차이 를 나란히. 눈으로도 확인할 수 있게 남긴다."""
    grid = Image.new("RGB", (cell * 3, cell * len(rows)), (18, 18, 22))
    for i, (_, r) in enumerate(rows):
        for j, key in enumerate(("_ref", "_mine")):
            a = r[key]
            im = Image.fromarray(a, "RGBA").resize((cell, cell), Image.NEAREST)
            bg = Image.new("RGBA", (cell, cell), (18, 18, 22, 255))
            bg.alpha_composite(im)
            grid.paste(bg.convert("RGB"), (j * cell, i * cell))
        d = np.abs(r["_ref"][..., :3].astype(int) - r["_mine"][..., :3].astype(int)).sum(2)
        d = (np.clip(d, 0, 255)).astype(np.uint8)
        dm = Image.fromarray(d, "L").resize((cell, cell), Image.NEAREST).convert("RGB")
        grid.paste(dm, (2 * cell, i * cell))
    out.parent.mkdir(parents=True, exist_ok=True)
    grid.save(out)


def side_by_side(items: list, out: Path, cell: int = 182) -> None:
    """원본 원화와 게임 시트의 해당 프레임을 **나란히**. 사람이 눈으로 대조할 판이다.

    위 줄이 원본(캔버스 그대로 축소), 아래 줄이 게임 시트 프레임을 실제 표시 크기로 줄인 것.
    """
    from PIL import ImageDraw
    n = len(items)
    pad, head = 8, 18
    W = n * (cell + pad) + pad
    H = head + (cell + pad) * 2 + pad + head
    grid = Image.new("RGB", (W, H), (18, 18, 22))
    d = ImageDraw.Draw(grid)
    d.text((pad, 3), "ORIGINAL ChatGPT artwork", fill=(200, 200, 200))
    d.text((pad, head + cell + pad + 3), "GAME SHEET frame (182px)", fill=(200, 200, 200))
    for i, (name, ref_im, frame_im) in enumerate(items):
        x = pad + i * (cell + pad)
        for row, im in enumerate((ref_im, frame_im)):
            bg = Image.new("RGBA", (cell, cell), (26, 28, 34, 255))
            r = im.convert("RGBA")
            fit = r.resize((cell, cell), Image.NEAREST if row else Image.BOX)
            bg.alpha_composite(fit)
            grid.paste(bg.convert("RGB"), (x, head + row * (cell + pad)))
        d.text((x, head + 2 * (cell + pad) + 2), name, fill=(230, 200, 120))
    out.parent.mkdir(parents=True, exist_ok=True)
    grid.save(out)
    print(f"나란히 비교: {out}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", help="검사할 격자 시트")
    ap.add_argument("--frames", help="시트 대신 프레임 디렉터리")
    ap.add_argument("--phase", choices=("forge", "blast"), required=True)
    ap.add_argument("--refs", default="creative/_fx/ted-cube/pixel-chatgpt")
    ap.add_argument("--out", default="")
    ap.add_argument("--compare", default="", help="원본 | 게임 시트 나란히 비교 이미지")
    ap.add_argument("--ref-resample", choices=("nearest", "box"), default="nearest",
                    dest="ref_resample",
                    help="원화를 비교 크기로 줄일 때 쓸 방식. 시트와 같은 방식이어야 공정하다")
    ap.add_argument("--crop", type=int, default=-1,
                    help="원화를 이 크기로 중앙 자른 뒤 비교. 생략하면 조립이 실제로 쓰는 "
                         "영역(forge 768 / blast 1024)을 자동으로 쓴다. 0 이면 자르지 않는다")
    a = ap.parse_args()
    if a.crop < 0:
        # 조립이 쓰는 영역과 맞춰야 '잘라낸 탓'과 '다시 그린 탓'이 분리된다
        a.crop = A.FORGE_SRC_PX if a.phase == "forge" else A.DELIVERY_PX

    pairs = json.loads(MAP_JSON.read_text(encoding="utf-8"))[a.phase]["verify"]
    if a.sheet:
        frames = sheet_frames(Path(a.sheet))
        label = Path(a.sheet).name
    else:
        files = sorted(Path(a.frames).glob("*.png"))
        frames = [Image.open(p).convert("RGBA") for p in files]
        label = str(a.frames)

    refs = Path(a.refs)
    rows, cuts, side, ok = [], [], [], True
    print(f"{label}  ↔  {refs}\n")
    print(f"{'구간':<10}{'프레임':>5}  {'IoU':>6} {'NCC':>6} {'색적중':>7} {'색분포':>7} "
          f"{'오프셋':>9}  판정")
    for p in pairs:
        idx = p["frame"]
        if idx >= len(frames):
            print(f"  프레임 {idx} 가 시트에 없다")
            ok = False
            continue
        ref_path = next((q for q in refs.glob(f"{p['ref']}*.png")), None)
        if ref_path is None:
            print(f"  원화를 못 찾았다: {p['ref']}")
            ok = False
            continue
        kf = refs / "keyframes"
        cut_path = next((q for q in kf.glob(f"{p['ref']}*_cut.png")), None) if kf.is_dir() else None
        if cut_path is not None:
            d = cut_diff(ref_path, cut_path)
            cuts.append((p["ref"], cut_path.name, d))
            ok &= d["rgb_max"] == 0
        base = Image.open(cut_path if cut_path else ref_path)
        r = compare(base, frames[idx], a.crop, a.ref_resample)
        good = (r["iou"] >= PASS_IOU and r["ncc"] >= PASS_NCC
                and r["hit"] >= PASS_HIT and r["dist"] <= PASS_DIST)
        ok &= good
        rows.append((p["name"], r))
        side.append((p["name"], Image.open(cut_path if cut_path else ref_path), frames[idx]))
        print(f"{p['name']:<10}{idx:>5}  {r['iou']:>6.3f} {r['ncc']:>6.3f} "
              f"{r['hit']:>7.3f} {r['dist']:>7.3f} {str(r['offset']):>9}  "
              f"{'PASS' if good else 'FAIL'}")

    if cuts:
        print("")
        print("[A] 배경 제거가 원화 픽셀을 바꿨는가 (불투명 픽셀 RGB 최대 차, 0 이어야 한다)")
        for name, fn, d in cuts:
            print(f"  {name:<14} {fn:<28} 최대 차 {d['rgb_max']}  "
                  f"겹치는 불투명 {d['both']:,}px  {'OK' if d['rgb_max'] == 0 else '**변경됨**'}")
    print("")
    print(f"[B] 합격선: IoU >= {PASS_IOU} · NCC >= {PASS_NCC} · 색적중 >= {PASS_HIT} · 색분포 <= {PASS_DIST}")
    for name, r in rows:
        print(f"  {name:<10} 계열 비율 원화 {r['fam_ref']} → 시트 {r['fam_mine']} "
              f"(아이보리/암부/금)")
    if a.compare:
        side_by_side(side, Path(a.compare))
    if a.out:
        overlay(rows, Path(a.out))
        print(f"\n오버레이 (원화 | 시트 | 차이): {a.out}")
    print("\n" + ("✓ 전부 PASS" if ok else "✗ FAIL 있음"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
