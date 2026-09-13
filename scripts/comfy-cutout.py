#!/usr/bin/env python3
"""ComfyUI 로 배경을 제거한다 (캐릭터 스프라이트·프레임 줄용).

    python scripts/comfy-cutout.py --in <입력.png> --out <출력.png>
    python scripts/comfy-cutout.py --in a.png --out b.png --model BiRefNet-HR-matting

**왜 rembg 대신 ComfyUI 인가**

`rembg` 는 u2net 으로 자른다. 실루엣은 잡지만 **머리카락 삐침과 얇은 코트 자락에서
가장자리를 뭉갠다.** ComfyUI 쪽에는 BiRefNet 계열이 들어와 있고, 그중

    BiRefNet_toonout      만화·애니 그림 전용으로 학습된 것
    BiRefNet-HR-matting   고해상 매팅 — 가는 선과 반투명 경계에 강하다

가 이 프로젝트의 치비 스프라이트에 맞는다. 첫 실행 때 가중치를 내려받는다.

배경은 항상 알파로 뺀다(`background=Alpha`). 흰 배경 그림이라도 밝기로 자르지
않으므로 **흰 셔츠·흰 운동화가 같이 날아가지 않는다** — 그게 이 경로를 쓰는 이유다.

`--clean-white` 는 그 위에 한 겹 더 얹는다. BiRefNet 은 배경에 아주 옅은 알파를
남기는데, 프레임 줄에서는 그 haze 가 프레임 사이를 이어 버려 `slice-sheet.py` 의
빈 열 분리가 깨진다(6프레임이 4덩어리로 잡혔다). 그래서 **원본에서 흰색을 타고
테두리부터 흘려보낸(flood fill) 영역만** 알파 0 으로 못박는다. 윤곽 안쪽은 테두리와
끊겨 있어 닿지 않으므로, 흰 셔츠와 운동화는 그대로 남고 가장자리 품질도 유지된다.

ComfyUI 가 떠 있어야 한다 (`COMFYUI_SERVER`, 기본 127.0.0.1:8000).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANDIDATES = ["http://127.0.0.1:8000", "http://127.0.0.1:8188"]
COMFY_HOME = Path(os.environ.get("COMFYUI_HOME", r"C:\ComfyUI"))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def server() -> str:
    env = os.environ.get("COMFYUI_SERVER")
    for url in ([env] if env else []) + CANDIDATES:
        if not url:
            continue
        try:
            urllib.request.urlopen(f"{url.rstrip('/')}/system_stats", timeout=3).read()
            return url.rstrip("/")
        except Exception:
            continue
    raise SystemExit("ComfyUI 에 연결할 수 없습니다. 켜져 있는지 확인하세요.")


def post(url: str, path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{url}{path}", data=json.dumps(payload).encode("utf-8"), method="POST"
    )
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"요청 실패 ({e.code}): {e.read().decode('utf-8', 'replace')[:500]}")


def clean_white(cut_path: Path, orig_path: Path, out_path: Path, thr: int) -> None:
    """원본의 흰 배경을 테두리에서 흘려보내 그 영역만 알파 0 으로 만든다."""
    from collections import deque

    import numpy as np
    from PIL import Image

    cut = Image.open(cut_path).convert("RGBA")
    orig = Image.open(orig_path).convert("RGB").resize(cut.size, Image.NEAREST)
    rgb = np.array(orig).astype(int)
    h, w = rgb.shape[:2]
    light = (rgb.min(axis=2) >= thr) & (rgb.max(axis=2) - rgb.min(axis=2) <= 12)

    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if light[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if light[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))

    arr = np.array(cut)
    before = int((arr[:, :, 3] > 16).sum())
    arr[:, :, 3] = np.where(bg, 0, arr[:, :, 3])
    after = int((arr[:, :, 3] > 16).sum())
    Image.fromarray(arr).save(out_path)
    print(f"흰 배경 정리: {before - after}px 제거")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--model", default="BiRefNet_toonout",
                    help="BiRefNet_toonout(기본) · BiRefNet-HR-matting · BiRefNet-matting …")
    ap.add_argument("--mask-offset", type=int, default=0,
                    help="마스크 경계 확장/축소. 흰 테두리가 남으면 -1~-2")
    ap.add_argument("--refine", action="store_true",
                    help="전경 색 재추정 — 반투명 경계의 배경색 번짐을 줄인다")
    ap.add_argument("--clean-white", action="store_true",
                    help="원본의 흰 배경을 플러드필로 확실히 끊는다 (프레임 줄에 필요)")
    ap.add_argument("--white-thr", type=int, default=236)
    ap.add_argument("--timeout", type=int, default=300)
    a = ap.parse_args()

    src = Path(a.src)
    if not src.exists():
        raise SystemExit(f"입력이 없습니다: {src}")

    url = server()

    # LoadImage 는 ComfyUI 의 input 폴더에서만 읽는다
    stem = f"cutout_{uuid.uuid4().hex[:8]}"
    staged = COMFY_HOME / "input" / f"{stem}.png"
    staged.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, staged)

    graph = {
        "1": {"class_type": "LoadImage",
              "inputs": {"image": staged.name, "upload": "image"}},
        "2": {"class_type": "BiRefNetRMBG",
              "inputs": {"image": ["1", 0], "model": a.model,
                         "background": "Alpha", "mask_offset": a.mask_offset,
                         "mask_blur": 0, "invert_output": False,
                         "refine_foreground": bool(a.refine)}},
        "3": {"class_type": "SaveImage",
              "inputs": {"images": ["2", 0], "filename_prefix": stem}},
    }

    res = post(url, "/prompt", {"prompt": graph, "client_id": stem})
    pid = res.get("prompt_id")
    if not pid:
        raise SystemExit(f"실행 id 를 못 받았습니다: {res}")
    print(f"ComfyUI 실행 {pid} · 모델 {a.model}")

    deadline = time.time() + a.timeout
    outputs = None
    while time.time() < deadline:
        with urllib.request.urlopen(f"{url}/history/{pid}", timeout=30) as r:
            hist = json.loads(r.read().decode("utf-8"))
        if pid in hist:
            entry = hist[pid]
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                raise SystemExit(f"ComfyUI 오류: {json.dumps(st, ensure_ascii=False)[:600]}")
            outputs = entry.get("outputs", {})
            if outputs:
                break
        time.sleep(1.5)
    if not outputs:
        raise SystemExit("시간 안에 끝나지 않았습니다 (가중치 다운로드 중일 수 있습니다)")

    images = []
    for node in outputs.values():
        images += node.get("images", [])
    if not images:
        raise SystemExit(f"결과 이미지가 없습니다: {outputs}")

    info = images[0]
    produced = COMFY_HOME / "output" / info.get("subfolder", "") / info["filename"]
    if not produced.exists():
        raise SystemExit(f"결과 파일을 못 찾았습니다: {produced}")

    dst = Path(a.dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if a.clean_white:
        clean_white(produced, src, dst, a.white_thr)
    else:
        shutil.copyfile(produced, dst)
    staged.unlink(missing_ok=True)
    print(f"저장: {dst} ({dst.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
