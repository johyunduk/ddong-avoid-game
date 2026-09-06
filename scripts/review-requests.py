#!/usr/bin/env python3
"""심사실에서 올라온 컨셉 요청을 읽고 상태를 바꾼다.

    python scripts/review-requests.py                    # 전체 목록
    python scripts/review-requests.py --pending          # 대기 중인 것만
    python scripts/review-requests.py --pick <id>        # 처리 시작 표시
    python scripts/review-requests.py --done <id> --batch summer-pool-01-r1
    python scripts/review-requests.py --drop <id> --note "이미 비슷한 캐릭터 있음"

종료 코드: 대기 중인 요청이 있으면 0, 없으면 3 (스크립트 분기용)
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
PREFIX = "_requests"
STATE = {"pending": "대기", "picked": "처리 중", "done": "완료", "dropped": "보류"}


def load_env() -> tuple[str, str]:
    env = {}
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
        raise SystemExit(".env.local 에 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.")
    return url.rstrip("/"), key


def call(method: str, url: str, key: str, data: bytes | None = None,
         content_type: str | None = None, upsert: bool = False) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    if content_type:
        req.add_header("Content-Type", content_type)
    if upsert:
        req.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def list_requests(url: str, key: str) -> list[dict]:
    status, body = call(
        "POST", f"{url}/storage/v1/object/list/{BUCKET}", key,
        json.dumps({"prefix": f"{PREFIX}/", "limit": 200}).encode(), "application/json"
    )
    if status != 200:
        raise SystemExit(f"목록 조회 실패 ({status}): {body.decode('utf-8', 'replace')[:200]}")
    out = []
    for entry in json.loads(body):
        name = entry.get("name", "")
        if not name.endswith(".json"):
            continue
        s, b = call("GET", f"{url}/storage/v1/object/{BUCKET}/{PREFIX}/{name}", key)
        if s == 200:
            out.append(json.loads(b))
    out.sort(key=lambda r: r.get("created", ""), reverse=True)
    return out


def save(url: str, key: str, doc: dict) -> None:
    status, body = call(
        "POST", f"{url}/storage/v1/object/{BUCKET}/{PREFIX}/{doc['id']}.json", key,
        json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8"),
        "application/json", upsert=True
    )
    if status not in (200, 201):
        raise SystemExit(f"저장 실패 ({status}): {body.decode('utf-8', 'replace')[:200]}")


def main() -> int:
    p = argparse.ArgumentParser(description="컨셉 요청 조회/상태 변경")
    p.add_argument("--pending", action="store_true", help="대기 중인 것만 표시")
    p.add_argument("--json", action="store_true", help="원본 JSON 출력")
    p.add_argument("--pick", metavar="ID", help="처리 시작으로 표시")
    p.add_argument("--done", metavar="ID", help="완료로 표시")
    p.add_argument("--drop", metavar="ID", help="보류로 표시")
    p.add_argument("--batch", help="연결된 배치 id (--done 과 함께)")
    p.add_argument("--note", default="", help="메모")
    a = p.parse_args()

    url, key = load_env()

    target = a.pick or a.done or a.drop
    if target:
        items = {r["id"]: r for r in list_requests(url, key)}
        doc = items.get(target)
        if not doc:
            raise SystemExit(f"요청을 찾을 수 없습니다: {target}")
        doc["status"] = "picked" if a.pick else ("done" if a.done else "dropped")
        if a.batch:
            doc["batch"] = a.batch
        if a.note:
            doc["note"] = a.note
        save(url, key, doc)
        print(f"{doc['id']} → {STATE[doc['status']]}")
        return 0

    requests = list_requests(url, key)
    if a.pending:
        requests = [r for r in requests if r.get("status") == "pending"]

    if a.json:
        print(json.dumps(requests, ensure_ascii=False, indent=2))
    elif not requests:
        print("요청 없음")
    else:
        for r in requests:
            head = f"  [{STATE.get(r.get('status'), r.get('status'))}] {r['id']}"
            if r.get("batch"):
                head += f"  → {r['batch']}"
            print(head)
            print(f"      {r['text']}")
            if r.get("note"):
                print(f"      메모: {r['note']}")

    return 0 if any(r.get("status") == "pending" for r in requests) else 3


if __name__ == "__main__":
    sys.exit(main())
