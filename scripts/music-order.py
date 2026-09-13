#!/usr/bin/env python3
"""심사실의 곡 주문을 읽고 갱신한다 (composer 용).

    python scripts/music-order.py --pending              # 대기 중인 주문
    python scripts/music-order.py --id <주문id>          # 주문 하나 상세
    python scripts/music-order.py --id <id> --status picked
    python scripts/music-order.py --id <id> --title "곡 제목" \\
        --links <suno링크1> <suno링크2> --labels "밝은 쪽" "차분한 쪽"

**음원 파일은 다루지 않는다.** 후보는 Suno 공유 링크로 넘기고, 사람이 Suno 에서
직접 듣는다. 브라우저 다운로드는 자주 끊기는 데다 심사에는 파일이 필요 없다.
채택된 곡을 저장소로 가져오는 것도 사람 몫이다.

주문 문서는 `review/_music/<id>.json` 하나뿐이다.
상태: pending → picked(집었음) → review(링크 올림) → done(채택) | dropped(폐기).
'revise' 판정이 나면 Edge Function 이 pending 으로 되돌리므로 워커가 다시 집는다.

.env.local 의 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 사용한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "review"
PREFIX = "_music"

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


def call(method: str, path: str, url: str, key: str,
         data: bytes | None = None, upsert: bool = False) -> tuple[int, bytes]:
    req = urllib.request.Request(f"{url}/storage/v1/object/{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if upsert:
        req.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def read_order(url: str, key: str, oid: str) -> dict:
    status, body = call("GET", f"{BUCKET}/{PREFIX}/{oid}.json", url, key)
    if status != 200:
        raise SystemExit(f"주문 {oid} 를 찾을 수 없습니다 ({status})")
    return json.loads(body.decode("utf-8"))


def write_order(url: str, key: str, order: dict) -> None:
    order["updatedAt"] = datetime.now().astimezone().isoformat()
    status, body = call(
        "POST", f"{BUCKET}/{PREFIX}/{order['id']}.json", url, key,
        json.dumps(order, ensure_ascii=False, indent=2).encode("utf-8"), upsert=True,
    )
    if status >= 300:
        raise SystemExit(f"저장 실패 ({status}): {body.decode('utf-8', 'replace')}")


def list_orders(url: str, key: str) -> list[dict]:
    req = urllib.request.Request(
        f"{url}/storage/v1/object/list/{BUCKET}",
        data=json.dumps({"prefix": PREFIX, "limit": 200}).encode("utf-8"),
        method="POST",
    )
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as r:
        entries = json.loads(r.read().decode("utf-8"))
    out = []
    for e in entries:
        if not e.get("name", "").endswith(".json"):
            continue
        try:
            out.append(read_order(url, key, e["name"][:-5]))
        except SystemExit:
            continue
    out.sort(key=lambda o: o.get("created", ""), reverse=True)
    return out


def show(o: dict) -> None:
    print(f"[{o['status']}] {o['id']}  {o.get('name')} ({o.get('character')})")
    if o.get("note"):
        print(f"  요청: {o['note']}")
    if o.get("title"):
        print(f"  제목: {o['title']}")
    for t in o.get("tracks", []):
        print(f"  · {t.get('label') or '후보'}  {t.get('url')}")
    d = o.get("decision")
    if d:
        print(f"  판정: {d['type']}  선택: {d.get('selected')}  {d.get('note', '')}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pending", action="store_true", help="대기 중(pending)인 주문만")
    ap.add_argument("--list", action="store_true", help="전체 주문")
    ap.add_argument("--id", help="주문 id")
    ap.add_argument("--status", choices=["pending", "picked", "review", "done", "dropped"])
    ap.add_argument("--title", help="곡 제목")
    ap.add_argument("--links", nargs="+", help="후보 곡의 Suno 공유 링크")
    ap.add_argument("--labels", nargs="+", help="후보별 한 줄 설명 (--links 와 같은 순서)")
    ap.add_argument("--note", help="주문에 남길 메모")
    args = ap.parse_args()

    url, key = load_env()

    if args.pending or args.list or not args.id:
        orders = list_orders(url, key)
        if args.pending:
            orders = [o for o in orders if o.get("status") == "pending"]
        if not orders:
            print("주문 없음")
            return 3 if args.pending else 0
        for o in orders:
            show(o)
        return 0

    order = read_order(url, key, args.id)

    if args.links:
        tracks = []
        for i, link in enumerate(args.links):
            if not link.startswith("http"):
                raise SystemExit(f"링크가 아닙니다: {link}")
            label = args.labels[i] if args.labels and i < len(args.labels) else ""
            tracks.append({"url": link, "label": label})
        order["tracks"] = tracks
        order["status"] = "review"

    if args.title:
        order["title"] = args.title
    if args.note:
        order["note"] = args.note
    if args.status:
        order["status"] = args.status

    if args.links or args.title or args.status or args.note:
        write_order(url, key, order)

    show(order)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
