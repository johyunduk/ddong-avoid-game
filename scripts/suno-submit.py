#!/usr/bin/env python3
"""Suno 곡 생성 진입점 — 지금은 브라우저, 나중엔 API.

    python scripts/suno-submit.py --lyrics creative/_music/k/lyrics.md \\
        --style creative/_music/k/suno-style.md --title "초사이언" --out <디렉터리>

**왜 스크립트를 한 장 두는가**

Suno 는 아직 공개 셀프서브 API 가 없다. `platform.suno.com` 이라는 공식 개발자
콘솔이 2026-08 에 올라왔지만 큐레이션된 파트너에게만 열려 있어서, 지금 우리가
쓸 수 있는 길은 브라우저를 직접 모는 것뿐이다.

그렇다고 브라우저 조작 절차를 스킬 본문에 박아 두면, 나중에 API 가 열렸을 때
스킬·워커·심사실을 전부 고쳐야 한다. 그래서 **호출부를 이 파일 하나로 좁혀 둔다.**
API 가 열리면 `_submit_api()` 만 채우면 되고, 그 위의 구조는 한 줄도 안 바뀐다.
`comfyui-generate.py` 가 ComfyUI 에 대해 하는 역할과 같다.

**모드**

  api      SUNO_API_KEY 가 있으면 이쪽. 곡을 받아 --out 에 저장하고 0 으로 끝난다.
  browser  키가 없으면 이쪽. 입력을 검증·정규화해 출력하고 **종료 코드 2** 로 끝난다.
           2 는 "실패"가 아니라 **"여기부터는 에이전트가 브라우저로 이어받아라"** 는 뜻이다.
           composer(w8) 만 브라우저를 몬다 (CLAUDE.md 역할 규칙).

`SUNO_MODE=browser` 를 주면 키가 있어도 브라우저 모드로 강제한다.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Suno Custom Mode 입력 한도 (초과하면 조용히 잘리므로 여기서 먼저 막는다)
LIMIT_LYRICS = 5000
LIMIT_STYLE = 1000
LIMIT_TITLE = 100

EXIT_BROWSER = 2  # 실패가 아니라 인계 신호

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def read_block(path: Path, limit: int, what: str) -> str:
    if not path.exists():
        raise SystemExit(f"{what} 파일이 없습니다: {path}")
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise SystemExit(f"{what} 파일이 비어 있습니다: {path}")
    if len(text) > limit:
        raise SystemExit(
            f"{what}가 {len(text)}자로 Suno 한도({limit}자)를 넘습니다. 줄이고 다시 실행하세요."
        )
    return text


def _submit_api(payload: dict, out: Path) -> int:
    """공식 API 가 열리면 여기만 채운다.

    할 일: 생성 요청 → 완료까지 폴링 → mp3 를 out/ 에 저장 → 파일 경로 출력.
    지금은 파트너 승인 전이라 도달할 수 없다.
    """
    raise SystemExit(
        "SUNO_API_KEY 가 설정돼 있지만 API 호출부가 아직 비어 있습니다.\n"
        "platform.suno.com 파트너 승인이 나면 _submit_api() 를 구현하세요.\n"
        "그 전까지는 SUNO_MODE=browser 로 두세요."
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--lyrics", required=True, help="가사 파일 (마크다운)")
    ap.add_argument("--style", required=True, help="Suno Style 프롬프트 파일")
    ap.add_argument("--title", required=True, help="곡 제목")
    ap.add_argument("--out", default=".", help="받은 곡을 저장할 디렉터리 (api 모드)")
    ap.add_argument("--instrumental", action="store_true", help="보컬 없이")
    args = ap.parse_args()

    payload = {
        "title": args.title.strip()[:LIMIT_TITLE],
        "lyrics": read_block(Path(args.lyrics), LIMIT_LYRICS, "가사"),
        "style": read_block(Path(args.style), LIMIT_STYLE, "스타일"),
        "instrumental": bool(args.instrumental),
    }

    key = os.environ.get("SUNO_API_KEY", "").strip()
    mode = os.environ.get("SUNO_MODE", "").strip() or ("api" if key else "browser")

    if mode == "api":
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        return _submit_api(payload, out)

    # ── 브라우저 모드 ─────────────────────────────────────────────────────
    print("=== Suno 브라우저 모드 — 여기서부터 에이전트가 이어받는다 ===")
    print()
    print("suno.com → Create → **Custom** 탭에서 아래를 그대로 넣는다.")
    print("로그인이 풀려 있으면 **여기서 멈추고 사람에게 넘긴다** (CAPTCHA·로그인 대행 금지).")
    print()
    print(f"[Title]  {payload['title']}")
    print()
    print("[Styles]")
    print(payload["style"])
    print()
    print("[Lyrics]")
    print(payload["lyrics"])
    print()
    print(f"[Instrumental]  {'예' if payload['instrumental'] else '아니오'}")
    print()
    print("생성이 끝나면 **곡을 내려받지 말고** 곡마다 공유 링크를 복사해")
    print("`music-order.py --links <링크1> <링크2>` 로 올린다. 사람이 Suno 에서 듣는다.")

    meta = Path(args.out) / "suno-payload.json"
    try:
        meta.parent.mkdir(parents=True, exist_ok=True)
        meta.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n(입력 원문을 {meta} 에 남겼다 — 붙여넣기에 쓴다)")
    except OSError:
        pass

    return EXIT_BROWSER


if __name__ == "__main__":
    raise SystemExit(main())
