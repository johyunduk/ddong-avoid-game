#!/usr/bin/env python3
"""후보 이미지를 Supabase Storage 에 올리고 심사 링크를 만든다.

원본 PNG 는 PC 에 두고, 폰에서 보기 좋은 webp 로 줄여서 올린다.
상태(프롬프트·시드·판정)는 review/<batch>/batch.json 하나에만 둔다. 테이블 없음.

Pillow 가 필요하므로 ComfyUI venv 파이썬으로 실행한다:

    C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/review-upload.py \\
        --id summer-pool-01-r1 --dir creative/summer-pool-01/candidates \\
        --label "여름밤 수영장 · 1라운드"

.env.local 의 VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 사용한다.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import secrets
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# Windows 콘솔(cp949)에서도 한글이 깨지지 않게
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    from PIL import Image
except ImportError:
    raise SystemExit(
        "Pillow 가 필요합니다:\n"
        "  C:\\ComfyUI\\.venv\\Scripts\\python.exe scripts/review-upload.py ..."
    )

ROOT = Path(__file__).resolve().parent.parent
BUCKET = "review"
MAX_W = 900
QUALITY = 82


def load_env() -> tuple[str, str, str]:
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
    site = env.get("REVIEW_SITE_URL") or os.environ.get("REVIEW_SITE_URL", "")
    if not url or not key:
        raise SystemExit(
            ".env.local 에 VITE_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.\n"
            "  cp .env.example .env.local  후 값을 채우세요."
        )
    return url.rstrip("/"), key, site.rstrip("/")


def request(method: str, url: str, key: str, data: bytes | None = None,
            content_type: str | None = None, upsert: bool = False) -> tuple[int, bytes]:
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("apikey", key)
    if content_type:
        req.add_header("Content-Type", content_type)
    if upsert:
        req.add_header("x-upsert", "true")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def ensure_bucket(url: str, key: str) -> None:
    status, body = request("GET", f"{url}/storage/v1/bucket/{BUCKET}", key)
    if status == 200:
        return
    payload = json.dumps({"id": BUCKET, "name": BUCKET, "public": False}).encode()
    status, body = request("POST", f"{url}/storage/v1/bucket", key, payload, "application/json")
    if status not in (200, 201):
        raise SystemExit(f"버킷 생성 실패 ({status}): {body.decode('utf-8', 'replace')[:300]}")
    print(f"  버킷 '{BUCKET}' 생성됨 (비공개)")


def to_webp(path: Path) -> bytes:
    with Image.open(path) as im:
        im = im.convert("RGB")
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=QUALITY, method=5)
    return buf.getvalue()


def upload(url: str, key: str, path: str, data: bytes, content_type: str) -> None:
    status, body = request(
        "POST", f"{url}/storage/v1/object/{BUCKET}/{path}", key, data, content_type, upsert=True
    )
    if status not in (200, 201):
        raise SystemExit(f"업로드 실패 {path} ({status}): {body.decode('utf-8', 'replace')[:300]}")


def main() -> int:
    p = argparse.ArgumentParser(description="후보 업로드 + 심사 링크 생성")
    p.add_argument("--id", required=True, help="배치 id. 예: summer-pool-01-r1")
    p.add_argument("--dir", required=True, help="후보 이미지 디렉터리")
    p.add_argument("--label", help="페이지 제목 (기본: id)")
    a = p.parse_args()

    src = Path(a.dir)
    files = sorted(src.glob("*.png")) + sorted(src.glob("*.webp"))
    if not files:
        raise SystemExit(f"이미지가 없습니다: {src}")

    url, key, site = load_env()
    ensure_bucket(url, key)

    meta_src = {}
    if (src / "meta.json").exists():
        meta_src = json.loads((src / "meta.json").read_text(encoding="utf-8"))
    info = {i["file"]: i for i in meta_src.get("images", [])}

    candidates = []
    total = 0
    for f in files:
        data = to_webp(f)
        total += len(data)
        name = f.stem + ".webp"
        upload(url, key, f"{a.id}/{name}", data, "image/webp")
        print(f"  올림 {name} ({len(data) // 1024} KB)")
        src_meta = info.get(f.name, {})
        candidates.append({
            "file": name,
            "seed": src_meta.get("seed", "-"),
            "model": src_meta.get("model", ""),
            "verdict": None,
            "note": "",
        })

    token = secrets.token_hex(8)
    batch = {
        "batch": a.id,
        "label": a.label or a.id,
        "token": token,
        "dir": str(src).replace("\\", "/"),
        "prompt": meta_src.get("positive", "(기록 없음)"),
        "negative": meta_src.get("negative", ""),
        "created": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "candidates": candidates,
        "submitted": False,
        "submittedAt": None,
        "updatedAt": None,
    }
    upload(url, key, f"{a.id}/batch.json",
           json.dumps(batch, ensure_ascii=False, indent=2).encode("utf-8"),
           "application/json")

    print(f"\n{len(candidates)}장 업로드 완료 ({total // 1024} KB)")
    if site:
        print(f"심사 링크: {site}/?b={a.id}&t={token}")
    else:
        print(f"배치: {a.id}  토큰: {token}")
        print("(.env.local 에 REVIEW_SITE_URL 을 넣으면 심사 링크를 바로 만들어 줍니다)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
