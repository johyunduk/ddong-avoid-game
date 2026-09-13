"""미응답 배치를 한꺼번에 기각 처리한다.

심사실 버튼을 누르는 대신 batch.json 의 decision 을 직접 채운다.
사람이 "미응답 얘네 전부 기각 처리해줘" 라고 지시했을 때만 쓴다.

  python scripts/review-bulk-reject.py              # 대상만 보여준다 (기본: 미적용)
  python scripts/review-bulk-reject.py --apply      # 실제로 기각 처리
  python scripts/review-bulk-reject.py --apply --note "..."
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from importlib import import_module

rs = import_module("review-status".replace("-", "_")) if False else None

ROOT = __import__("pathlib").Path(__file__).resolve().parents[1]
BUCKET = "review"
NOTE = "사람 지시로 일괄 기각 (미응답 정리)"


def env() -> dict:
    import os
    out = {}
    for name in (".env.local", ".env"):
        f = ROOT / name
        if not f.exists():
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            out.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    for k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REVIEW_INDEX_KEY"):
        out.setdefault(k, os.environ.get(k, ""))
    if not out.get("VITE_SUPABASE_URL") or not out.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise SystemExit(".env.local 에 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.")
    return out


def _auth(req, e):
    req.add_header("Authorization", f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}")
    req.add_header("apikey", e["SUPABASE_SERVICE_ROLE_KEY"])
    return req


def fetch_list(e: dict) -> list:
    url = e["VITE_SUPABASE_URL"].rstrip("/")
    with urllib.request.urlopen(
        f"{url}/functions/v1/review?list=1&k={e['REVIEW_INDEX_KEY']}", timeout=30
    ) as r:
        return json.loads(r.read().decode("utf-8")).get("batches", [])


def fetch_batch(e: dict, batch: str) -> dict:
    url = e["VITE_SUPABASE_URL"].rstrip("/")
    req = _auth(urllib.request.Request(f"{url}/storage/v1/object/{BUCKET}/{batch}/batch.json"), e)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def put_batch(e: dict, batch: str, data: dict) -> None:
    url = e["VITE_SUPABASE_URL"].rstrip("/")
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/storage/v1/object/{BUCKET}/{batch}/batch.json", data=body, method="PUT"
    )
    _auth(req, e)
    req.add_header("Content-Type", "application/json")
    req.add_header("x-upsert", "true")
    with urllib.request.urlopen(req, timeout=30) as r:
        r.read()


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="미응답 배치 일괄 기각")
    ap.add_argument("--apply", action="store_true", help="실제로 기각 처리 (없으면 대상만 출력)")
    ap.add_argument("--note", default=NOTE)
    a = ap.parse_args()

    e = env()
    pending = [b for b in fetch_list(e) if not b.get("submitted")]
    if not pending:
        print("미응답 배치가 없습니다.")
        return 0

    print(f"미응답 {len(pending)}건" + ("" if a.apply else "  (--apply 없으면 적용하지 않습니다)"))
    for b in pending:
        print(f"  {b.get('batch'):<20} {b.get('label','')}")
    if not a.apply:
        return 0

    now = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    ok = 0
    for b in pending:
        name = b.get("batch")
        try:
            data = fetch_batch(e, name)
            data["submitted"] = True
            data["submittedAt"] = now
            data["updatedAt"] = now
            data["decision"] = {"type": "reject", "selected": None, "note": a.note}
            for c in data.get("candidates", []):
                c.setdefault("selected", False)
            put_batch(e, name, data)
            print(f"  기각 {name}")
            ok += 1
        except urllib.error.HTTPError as ex:
            print(f"  실패 {name} (HTTP {ex.code})")
        except Exception as ex:  # noqa: BLE001
            print(f"  실패 {name} ({ex})")
    print(f"\n{ok}/{len(pending)} 건 기각 처리")
    return 0 if ok == len(pending) else 1


if __name__ == "__main__":
    raise SystemExit(main())
