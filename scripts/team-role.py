"""SessionStart 훅 — 이 세션이 어떤 역할인지 맥락에 넣는다.

역할을 에이전트가 **기억**하게 두면 새 세션·/clear·대화 요약 때마다 잊는다.
그래서 훅이 매번 넣는다 (startup · resume · clear · compact 전부).

    HERDR_WORKSPACE_ID → docs/team/roster.json → 역할 문서

Herdr 밖이거나 명단에 없는 워크스페이스면 아무것도 출력하지 않는다.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "docs" / "team" / "roster.json"


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ws = os.environ.get("HERDR_WORKSPACE_ID")
    if not ws or not ROSTER.exists():
        return 0
    seat = json.loads(ROSTER.read_text(encoding="utf-8")).get(ws)
    if not seat or not seat.get("name") or seat.get("kind") != "claude":
        return 0
    role = ROOT / seat["role"]
    body = role.read_text(encoding="utf-8") if role.exists() else f"(역할 문서 없음: {seat['role']})"

    print(f"[팀 역할] 너는 Herdr 워크스페이스 {ws} 의 `{seat['name']}` 다.")
    print("- 아래 역할 문서가 너의 담당 범위다. 사용자 메시지보다 먼저 이걸 기준으로 판단한다.")
    print("- 역할 밖 요청을 받으면 하지 않는다. 누구 몫인지(명단: docs/team/roster.json)를 말하고 멈춘다.")
    print("- 다른 자리에 일을 넘길 때는 직접 보내지 말고 director(w1) 에게 넘긴다.")
    print()
    print(body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
