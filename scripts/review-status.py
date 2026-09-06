#!/usr/bin/env python3
"""심사 배치의 결정 상태를 읽는다.

    python scripts/review-status.py --list                 # 전체 배치 (중복 컨셉 확인용)
    python scripts/review-status.py --id garbage-collector-01-r1
    python scripts/review-status.py --id <배치> --json

심사 결과는 배치 단위 결정 하나다.
    accept  이 컨셉으로 확정 (selected = 쓸 후보 1장)
    revise  다시 — selected 가 있으면 그 장 기준, 없으면 컨셉째
    reject  컨셉 폐기

종료 코드: 0 = 제출됨, 3 = 아직 심사 중 (스크립트 분기용)
표준 라이브러리만 사용한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Windows 콘솔(cp949)에서도 한글이 깨지지 않게
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "review"
DEC = {"accept": "확정", "revise": "수정", "reject": "기각"}


def env() -> dict:
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


def fetch_batch(e: dict, batch: str) -> dict:
    url = e["VITE_SUPABASE_URL"].rstrip("/")
    req = urllib.request.Request(f"{url}/storage/v1/object/{BUCKET}/{batch}/batch.json")
    req.add_header("Authorization", f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}")
    req.add_header("apikey", e["SUPABASE_SERVICE_ROLE_KEY"])
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as ex:
        if ex.code in (400, 404):
            raise SystemExit(f"배치를 찾을 수 없습니다: {batch}")
        raise SystemExit(f"조회 실패 (HTTP {ex.code})")


def fetch_list(e: dict) -> list:
    if not e.get("REVIEW_INDEX_KEY"):
        raise SystemExit(".env.local 에 REVIEW_INDEX_KEY 가 필요합니다.")
    url = e["VITE_SUPABASE_URL"].rstrip("/")
    with urllib.request.urlopen(
        f"{url}/functions/v1/review?list=1&k={e['REVIEW_INDEX_KEY']}", timeout=30
    ) as r:
        return json.loads(r.read().decode("utf-8")).get("batches", [])


def state_of(b: dict) -> str:
    if not b.get("submitted"):
        return "미응답"
    d = b.get("decision") or {}
    return DEC.get(d.get("type"), "제출됨")


def main() -> int:
    p = argparse.ArgumentParser(description="심사 결정 조회")
    p.add_argument("--id", help="배치 id (--list 면 생략)")
    p.add_argument("--list", action="store_true",
                   help="전체 배치 목록. 진행 중인 배치까지 보이므로 컨셉 중복 확인에 쓴다")
    p.add_argument("--json", action="store_true", help="원본 JSON 출력")
    a = p.parse_args()

    e = env()

    if a.list:
        rows = fetch_list(e)
        if a.json:
            print(json.dumps(rows, ensure_ascii=False, indent=2))
            return 0
        if not rows:
            print("배치 없음")
        for b in rows:
            line = f"  [{state_of(b)}] {b['batch']:<24} {b['label']}  ({b['total']}장)"
            d = b.get("decision") or {}
            if d.get("selected"):
                line += f"  → {d['selected']}"
            print(line)
            if d.get("note"):
                print(f"      “{d['note']}”")
        return 0

    if not a.id:
        raise SystemExit("--id 또는 --list 가 필요합니다.")

    meta = fetch_batch(e, a.id)
    if a.json:
        print(json.dumps(meta, ensure_ascii=False, indent=2))
        return 0 if meta.get("submitted") else 3

    d = meta.get("decision") or {}
    print(f"{meta.get('label', a.id)}  [{state_of(meta)}]")
    if meta.get("updatedAt"):
        print(f"마지막 갱신: {meta['updatedAt']}")
    if d:
        print()
        print(f"  결정: {DEC.get(d.get('type'), d.get('type'))}")
        if d.get("selected"):
            print(f"  선택: {d['selected']}")
        if d.get("note"):
            print(f"  피드백: {d['note']}")
    print()
    for c in meta.get("candidates", []):
        mark = "★" if c.get("selected") else " "
        extra = f"  {c['model']}" if c.get("model") else ""
        print(f"  {mark} {c['file']:<12} seed {c.get('seed', '-')}{extra}")

    return 0 if meta.get("submitted") else 3


if __name__ == "__main__":
    sys.exit(main())
