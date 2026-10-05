"""팀 명단(docs/team/roster.json)대로 Herdr 워크스페이스를 맞춘다.

    python scripts/team-up.py          # 맞춘다
    python scripts/team-up.py --check  # 어긋난 것만 보고 (아무것도 안 바꾼다)

자리마다:
  1. 워크스페이스 라벨을 명단대로
  2. 이름이 이미 살아 있으면 건너뛴다
  3. 같은 종류 에이전트가 떠 있으면 이름만 붙인다 (agent rename — 세션·맥락 유지)
  4. 빈 셸 패널이 있으면 새로 띄운다 (agent start) — 역할은 SessionStart 훅이 넣는다
  5. 다른 종류가 떠 있으면 **손대지 않고** 보고한다. 끌지 말지는 사람이 정한다

세션이 이상해 보이면 고치지 말고 이 스크립트를 다시 돌린다.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "docs" / "team" / "roster.json"


def herdr(*args: str) -> tuple[int, dict | None, str]:
    p = subprocess.run(["herdr", *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    out = p.stdout if p.returncode == 0 else p.stderr
    try:
        return p.returncode, json.loads(out), out
    except Exception:
        return p.returncode, None, out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="보고만 하고 바꾸지 않는다")
    a = ap.parse_args()

    roster = json.loads(ROSTER.read_text(encoding="utf-8"))
    code, ws_list, raw = herdr("workspace", "list")
    if code != 0:
        print(f"herdr 에 붙지 못했다: {raw.strip()[:200]}")
        return 1
    labels = {w["workspace_id"]: w["label"] for w in ws_list["result"]["workspaces"]}
    problems = changes = 0

    for ws, seat in roster.items():
        if ws not in labels:
            print(f"✗ {ws}: 워크스페이스가 없다 — 사람이 만들어야 한다")
            problems += 1
            continue
        if labels[ws] != seat["label"]:
            print(f"· {ws}: 라벨 {labels[ws]} → {seat['label']}")
            changes += 1
            if not a.check:
                herdr("workspace", "rename", ws, seat["label"])

        name, kind = seat.get("name"), seat.get("kind")
        if not name or seat.get("managed") is False:
            continue

        code, got, _ = herdr("agent", "get", name)
        if code == 0:
            where = got["result"]["agent"]["pane_id"]
            ok = where.startswith(ws + ":")
            print(f"{'✓' if ok else '✗'} {ws}: {name} ({where})")
            problems += 0 if ok else 1
            continue

        _, panes, _ = herdr("pane", "list", "--workspace", ws)
        panes = panes["result"]["panes"] if panes else []
        same = [p for p in panes if p.get("agent") == kind]
        other = [p for p in panes if p.get("agent") and p.get("agent") != kind]
        shells = [p for p in panes if not p.get("agent")]

        if same:
            pid = same[0]["pane_id"]
            print(f"· {ws}: {pid} 의 {kind} → 이름 {name}")
            changes += 1
            if not a.check:
                c, _, out = herdr("agent", "rename", pid, name)
                if c != 0:
                    print(f"  ✗ {out.strip()[:200]}")
                    problems += 1
        elif shells:
            pid = shells[0]["pane_id"]
            print(f"· {ws}: {pid} 에 {kind} 시작 → 이름 {name}")
            changes += 1
            if not a.check:
                c, _, out = herdr("agent", "start", name, "--kind", kind, "--pane", pid,
                                  "--timeout", "60000")
                if c != 0:
                    print(f"  ✗ {out.strip()[:200]}")
                    problems += 1
        else:
            kinds = ", ".join(f"{p['pane_id']}={p['agent']}" for p in other) or "패널 없음"
            print(f"✗ {ws}: {kind} 자리인데 {kinds} — 끌지 말지는 사람이 정한다")
            problems += 1

    verb = "바꿀 것" if a.check else "바꾼 것"
    print(f"{verb} {changes}건 · 어긋남 {problems}건")
    return 0 if problems == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
