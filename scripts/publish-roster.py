#!/usr/bin/env python3
"""게임에 등록된 캐릭터 명단을 심사실로 올린다.

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/publish-roster.py

심사실의 '곡 주문' 탭은 **어떤 캐릭터가 게임에 들어가 있는지 모른다.**
(정적 HTML + Storage 뿐이라 저장소를 읽을 방법이 없다)
그래서 PC 가 `src/utils/character.ts` 를 읽어 명단을 Storage 에 밀어 넣는다.

    review/_roster/roster.json   {updated, characters:[{id,name,grade,illust}]}
    review/_roster/<id>.webp     일러스트 썸네일 (가로 320px)

썸네일을 따로 굽는 이유: 원본 일러스트는 합쳐서 6.6MB 라 폰에서 명단 한 장
띄우는 데 그대로 쓸 수 없다. 캐릭터를 고르는 게 목적이라 작아도 된다.

캐릭터를 새로 등록했으면 다시 돌린다 (upsert 라 몇 번 돌려도 같다).
Pillow 가 필요하므로 ComfyUI venv 파이썬으로 실행한다.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "utils" / "character.ts"
PUBLIC = ROOT / "public"
BUCKET = "review"
PREFIX = "_roster"
THUMB_W = 320

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_env() -> tuple[str, str]:
    env: dict[str, str] = {}
    for name in (".env.local", ".env"):
        f = ROOT / name
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    url = env.get("VITE_SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL", "")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit(".env.local 에 VITE_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.")
    return url.rstrip("/"), key


def upload(url: str, key: str, path: str, data: bytes, content_type: str) -> None:
    req = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}/{path}", data=data, method="POST"
    )
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    req.add_header("Content-Type", content_type)
    req.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(req, timeout=120):
            pass
    except urllib.error.HTTPError as e:
        raise SystemExit(f"업로드 실패 {path}: {e.code} {e.read().decode('utf-8', 'replace')}")


# ── character.ts 읽기 ─────────────────────────────────────────────────────
# 이 파일은 손으로 쓰는 리터럴 배열이라 형태가 일정하다. 항목 단위로 잘라
# 필요한 네 필드만 뽑는다 (TS 를 실행하지 않는다 — 파이썬만으로 끝낸다).
FIELD = {
    "id": re.compile(r"\bid:\s*'([^']+)'"),
    "name": re.compile(r"\bname:\s*'([^']+)'"),
    "grade": re.compile(r"\bgrade:\s*'([^']+)'"),
    "illustPath": re.compile(r"\billustPath:\s*'([^']+)'"),
}


def read_characters() -> list[dict]:
    text = SRC.read_text(encoding="utf-8")
    start = text.index("export const CHARACTERS")
    body = text[start:]

    out: list[dict] = []
    # `id:` 로 시작하는 지점마다 다음 `id:` 전까지를 한 항목으로 본다
    marks = [m.start() for m in re.finditer(r"^\s*id:\s*'", body, re.M)]
    for i, pos in enumerate(marks):
        chunk = body[pos: marks[i + 1] if i + 1 < len(marks) else len(body)]
        item = {}
        for field, rx in FIELD.items():
            m = rx.search(chunk)
            if m:
                item[field] = m.group(1)
        if item.get("id") and item.get("name"):
            out.append(item)
    if not out:
        raise SystemExit("character.ts 에서 캐릭터를 하나도 읽지 못했습니다 — 형식이 바뀌었는지 확인하세요.")
    return out


def make_thumb(path: Path) -> bytes | None:
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit(
            "Pillow 가 필요합니다. ComfyUI venv 파이썬으로 실행하세요:\n"
            "  C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/publish-roster.py"
        )
    if not path.exists():
        return None
    im = Image.open(path).convert("RGBA")
    if im.width > THUMB_W:
        im = im.resize((THUMB_W, round(im.height * THUMB_W / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="WEBP", quality=82, method=4)
    return buf.getvalue()


def main() -> int:
    url, key = load_env()
    chars = read_characters()

    roster = []
    missing = []
    for c in chars:
        entry = {"id": c["id"], "name": c["name"], "grade": c.get("grade", "")}
        illust = c.get("illustPath")
        if illust:
            thumb = make_thumb(PUBLIC / illust)
            if thumb:
                fname = f"{c['id']}.webp"
                upload(url, key, f"{PREFIX}/{fname}", thumb, "image/webp")
                entry["illust"] = fname
            else:
                missing.append(f"{c['id']} ({illust})")
        roster.append(entry)

    doc = {"updated": datetime.now().astimezone().isoformat(), "characters": roster}
    upload(
        url, key, f"{PREFIX}/roster.json",
        json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8"),
        "application/json",
    )

    print(f"명단 {len(roster)}명 업로드 완료")
    if missing:
        print("일러스트 없음: " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
