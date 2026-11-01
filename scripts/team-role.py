"""옮겨 감 — 팀 명단 · 역할 훅은 컨트롤타워(C:/Users/user/Projects/control-tower/team/)에 있다.

훅은 이제 사용자 설정(~/.claude/settings.json)에서 돈다. 이 파일은 옛 훅 설정을 들고
이미 떠 있는 세션을 위한 다리다 — 모든 자리를 한 번 다시 띄운 뒤(재편 2단계) 지운다.
"""
import runpy
import sys
from pathlib import Path

TEAM = Path(__file__).resolve().parents[2] / "control-tower" / "team"
sys.path.insert(0, str(TEAM))
runpy.run_path(str(TEAM / "team-role.py"), run_name="__main__")
