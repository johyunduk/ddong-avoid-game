#!/usr/bin/env python3
"""확정된 배치의 캐릭터 설정(등급·기본효과·특수능력)을 읽고 제안을 올린다.

    # 제안 올리기 (심사실에서 사람이 고를 선택지)
    python scripts/review-character.py --id kkachi-01-r1 --propose proposals.json

    # 사람이 저장한 설정 읽기
    python scripts/review-character.py --id kkachi-01-r1

제안 JSON 형식:
    {
      "grade": "SR",
      "gradeReason": "능력이 조건부라 SR 이 적당",
      "basic":   [{"title": "짧은 이름", "text": "한 줄 설명"}, ...],
      "special": [{"title": "...", "text": "..."}, ...]
    }

종료 코드: 0 = 사람이 저장 완료(confirmed), 3 = 아직 미설정
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

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "review"


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
    for k in ("VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        out.setdefault(k, os.environ.get(k, ""))
    if not out.get("VITE_SUPABASE_URL") or not out.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise SystemExit(".env.local 에 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.")
    return out


def storage(e: dict, method: str, path: str, data: bytes | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(
        f"{e['VITE_SUPABASE_URL'].rstrip('/')}/storage/v1/object/{path}", data=data, method=method
    )
    req.add_header("Authorization", f"Bearer {e['SUPABASE_SERVICE_ROLE_KEY']}")
    req.add_header("apikey", e["SUPABASE_SERVICE_ROLE_KEY"])
    if data:
        req.add_header("Content-Type", "application/json")
        req.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as ex:
        return ex.code, ex.read()


def main() -> int:
    p = argparse.ArgumentParser(description="캐릭터 설정 조회/제안 등록")
    p.add_argument("--id", required=True, help="배치 id")
    p.add_argument("--propose", metavar="FILE", help="제안 JSON 파일")
    p.add_argument("--json", action="store_true", help="원본 JSON 출력")
    a = p.parse_args()

    e = env()
    status, body = storage(e, "GET", f"{BUCKET}/{a.id}/batch.json")
    if status != 200:
        raise SystemExit(f"배치를 찾을 수 없습니다: {a.id}")
    meta = json.loads(body)

    if a.propose:
        if (meta.get("decision") or {}).get("type") != "accept":
            raise SystemExit("확정(accept)된 배치에만 제안을 올릴 수 있습니다.")
        proposals = json.loads(Path(a.propose).read_text(encoding="utf-8"))
        ch = meta.get("character") or {}
        ch["proposals"] = proposals
        ch.setdefault("confirmed", False)
        meta["character"] = ch
        st, b = storage(e, "POST", f"{BUCKET}/{a.id}/batch.json",
                        json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8"))
        if st not in (200, 201):
            raise SystemExit(f"제안 등록 실패 ({st}): {b.decode('utf-8', 'replace')[:200]}")
        n_b = len(proposals.get("basic", []))
        n_s = len(proposals.get("special", []))
        print(f"제안 등록됨: 등급 {proposals.get('grade', '-')} · 기본 {n_b}개 · 특수 {n_s}개")
        return 0

    ch = meta.get("character") or {}
    if a.json:
        print(json.dumps(ch, ensure_ascii=False, indent=2))
        return 0 if ch.get("confirmed") else 3

    print(f"{meta.get('label', a.id)}  [{'설정 완료' if ch.get('confirmed') else '미설정'}]")
    if ch.get("name"):
        print(f"  이름: {ch['name']}")
    if ch.get("grade"):
        print(f"  등급: {ch['grade']}")
    if ch.get("basicEffect"):
        print(f"  기본 효과: {ch['basicEffect']}")
    if ch.get("specialAbility"):
        print(f"  특수 능력: {ch['specialAbility']}")
    if ch.get("proposals") and not ch.get("confirmed"):
        print("  (제안은 올라가 있고, 사람의 선택을 기다리는 중)")
    if not ch:
        print("  아직 제안도 설정도 없습니다. --propose 로 선택지를 올리세요.")
    return 0 if ch.get("confirmed") else 3


if __name__ == "__main__":
    sys.exit(main())
