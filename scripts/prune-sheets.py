#!/usr/bin/env python3
"""캐릭터 시트에서 안 쓰는 프레임을 걷어내고 webp 로 다시 저장한다.

게임이 실제로 재생하는 애니메이션은 방향마다 정해져 있다 (Player.updateAnimState):

    정면(front)  정지 상태만 나온다        → idle, hit
    좌/우(left/right)  이동 중에만 나온다   → walk, hit

그래서 정면 시트의 walk 나 좌우 시트의 idle 은 로드만 되고 절대 재생되지 않는다.
시트를 만들어 온 과정에서 남은 잔재라 지워도 동작이 바뀌지 않는다.

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/prune-sheets.py          # 미리보기
    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/prune-sheets.py --apply  # 실제 적용

webp 는 **무손실**로 저장한다. 픽셀 아트는 손실 압축을 하면 경계에 얼룩이 생긴다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow 필요: C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/prune-sheets.py")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent

# 방향별로 게임이 실제 재생하는 애니메이션
KEEP = {"front": ("idle", "hit"), "left": ("walk", "hit"), "right": ("walk", "hit")}


def prune(png: Path, meta: dict, keep: tuple[str, ...]) -> tuple[dict, Image.Image, list[str]]:
    """남길 애니메이션의 프레임만 모아 시트를 다시 만든다."""
    fw, fh = meta["frameWidth"], meta["frameHeight"]
    src = Image.open(png).convert("RGBA")
    names = meta.get("frames") or [f"f{i}" for i in range(src.width // fw)]
    anims = meta.get("anims", {})

    # 남길 프레임을 원래 순서대로 (중복 제거 — pingpong 은 같은 프레임을 다시 쓴다)
    used: list[int] = []
    for name in keep:
        for i in anims.get(name, {}).get("frames", []):
            if i not in used:
                used.append(i)
    used.sort()
    dropped = [names[i] for i in range(len(names)) if i not in used]

    remap = {old: new for new, old in enumerate(used)}
    sheet = Image.new("RGBA", (fw * len(used), fh), (0, 0, 0, 0))
    for new, old in enumerate(used):
        sheet.paste(src.crop((old * fw, 0, (old + 1) * fw, fh)), (new * fw, 0))

    out = {
        "image": png.with_suffix(".webp").name,
        "frameWidth": fw, "frameHeight": fh,
        "frames": [names[i] for i in used],
        "anims": {k: {**anims[k], "frames": [remap[i] for i in anims[k]["frames"]]}
                  for k in keep if k in anims},
    }
    return out, sheet, dropped


def main() -> int:
    p = argparse.ArgumentParser(description="시트 프레임 정리 + webp 변환")
    p.add_argument("--apply", action="store_true", help="실제로 파일을 바꾼다 (없으면 미리보기)")
    p.add_argument("--sheets", default="public/assets/sheets")
    a = p.parse_args()

    sheets = ROOT / a.sheets
    before = sum(f.stat().st_size for f in sheets.iterdir() if f.is_file())
    total_dropped = 0

    for meta_path in sorted(sheets.glob("*.json")):
        stem = meta_path.stem
        direction = stem.rsplit("_", 1)[-1]
        keep = KEEP.get(direction)
        if not keep:
            print(f"  건너뜀 (방향 불명): {stem}")
            continue

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        png = meta_path.with_suffix(".png")
        if not png.exists():
            print(f"  건너뜀 (png 없음): {stem}")
            continue

        out, sheet, dropped = prune(png, meta, keep)
        total_dropped += len(dropped)
        note = f"  −{len(dropped)}프레임 ({', '.join(dropped)})" if dropped else ""
        print(f"{stem:<20} {len(meta.get('frames', []))} → {len(out['frames'])}프레임{note}")

        if a.apply:
            sheet.save(png.with_suffix(".webp"), "WEBP", lossless=True, quality=100, method=6)
            meta_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
            png.unlink()

    if a.apply:
        after = sum(f.stat().st_size for f in sheets.iterdir() if f.is_file())
        print(f"\n프레임 {total_dropped}개 제거 · "
              f"{before / 1048576:.1f}MB → {after / 1048576:.1f}MB "
              f"({(1 - after / before) * 100:.0f}% 감소)")
    else:
        print(f"\n미리보기입니다. 프레임 {total_dropped}개가 제거됩니다. "
              f"적용하려면 --apply 를 붙이세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
