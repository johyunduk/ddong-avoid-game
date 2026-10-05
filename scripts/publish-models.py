#!/usr/bin/env python3
"""ComfyUI 체크포인트 목록을 심사실로 올린다.

    python scripts/publish-models.py

심사실은 정적 HTML + Storage 뿐이라 저장소를 읽을 방법이 없다. 그래서 어떤 체크포인트를
고를 수 있는지도 모른다. `publish-roster.py` 가 캐릭터 명단을 밀어 넣는 것과 같은 이유로,
PC 가 `workflows/comfyui/bindings.json` 을 읽어 목록을 Storage 에 밀어 넣는다.

    review/_models.json   {updated, default, models:[{alias, file}]}

**목록을 HTML 이나 edge function 에 베껴 적지 않는다.** 단일 진실은 bindings.json 이고,
체크포인트를 추가하면 거기만 고친 뒤 이 스크립트를 다시 돌린다 (upsert 라 몇 번 돌려도 같다).

표준 라이브러리만 사용한다.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BINDINGS = ROOT / "workflows" / "comfyui" / "bindings.json"
BUCKET = "review"
OBJECT = "_models.json"
WORKFLOW = "character"          # 캐릭터 일러스트를 뽑는 워크플로


def env() -> dict:
    out = {}
    for name in (".env.local", ".env"):
        f = ROOT / name
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                out.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    for k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        out.setdefault(k, os.environ.get(k, ""))
    if not out.get("VITE_SUPABASE_URL") or not out.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise SystemExit(".env.local 에 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.")
    return out


def main() -> int:
    b = json.loads(BINDINGS.read_text(encoding="utf-8"))
    d = (b.get(WORKFLOW) or {}).get("defaults") or {}
    aliases: dict = d.get("models") or {}
    default_file = d.get("model")

    models = [{"alias": a, "file": f} for a, f in sorted(aliases.items())]
    if not models:
        raise SystemExit(f"bindings.json 의 {WORKFLOW}.defaults.models 가 비어 있습니다.")

    # 기본 체크포인트의 별칭. models 에 없으면 파일명을 그대로 별칭으로 노출한다.
    default_alias = next((m["alias"] for m in models if m["file"] == default_file), None)
    if default_alias is None and default_file:
        models.insert(0, {"alias": default_file, "file": default_file})
        default_alias = default_file

    doc = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "workflow": WORKFLOW,
        "default": default_alias,
        "models": models,
    }

    e = env()
    url = e["VITE_SUPABASE_URL"].rstrip("/") + f"/storage/v1/object/{BUCKET}/{OBJECT}"
    req = urllib.request.Request(
        url, data=json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8"), method="POST"
    )
    req.add_header("Authorization", f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}")
    req.add_header("apikey", e["SUPABASE_SERVICE_ROLE_KEY"])
    req.add_header("Content-Type", "application/json")
    req.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            ok = r.status in (200, 201)
    except urllib.error.HTTPError as ex:
        raise SystemExit(f"업로드 실패 {ex.code}: {ex.read().decode('utf-8', 'replace')}")

    print(f"체크포인트 {len(models)}개 올림 (기본 {default_alias}) -> review/{OBJECT}")
    for m in models:
        mark = "*" if m["alias"] == default_alias else " "
        print(f"  {mark} {m['alias']:<10} {m['file']}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
