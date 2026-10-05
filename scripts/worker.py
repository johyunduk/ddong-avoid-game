#!/usr/bin/env python3
"""심사실 큐를 확인해 Herdr 에이전트에게 배분하는 상주 워커.

    python scripts/worker.py --queues character   # 캐릭터 라인 (w5:p1)
    python scripts/worker.py --queues music       # 음악 라인   (w5:p2)
    python scripts/worker.py                      # 둘 다 (기본, 혼자 돌릴 때)
    python scripts/worker.py --once               # 한 번만 확인하고 종료

원칙
  · 판단이 필요한 일만 에이전트에게 보낸다. 삭제·정리는 이 스크립트가 직접 한다.
  · 대상 에이전트가 다르면 같은 주기에 **동시에** 보낸다 (builder 와 integrator 는 병렬).
  · 한 에이전트에게는 한 번에 한 건만 보낸다.

    [폰] 요청/결정/설정 → Storage 큐
            ↓
    --queues character  builder(w3) 컨셉·생성·제안 | integrator(w2) 게임 반영
    --queues music      composer(w8) 가사·Suno 곡 생성

**왜 라인을 나눠 돌리는가**

tick() 은 이번 주기에 보낸 작업이 **전부 끝날 때까지 기다린다.** 그래서 한 프로세스가
두 라인을 다 맡으면, 캐릭터 생성 한 건(10분 안팎) 이 도는 동안 곡 주문이 큐에 그대로
앉아 있게 된다 — 컨셉 배치가 밀려 있으면 곡은 몇 시간씩 늦는다. 라인을 나누면
builder 가 그림을 뽑는 동안 composer 가 곡을 뽑는다.

나눠 돌릴 때는 **처리 표시 파일도 갈라진다** (STATE_FILES). save_state 가 파일 전체를
다시 쓰기 때문에, 같은 파일을 두 프로세스가 쓰면 서로의 표시를 지운다.
**같은 라인을 두 프로세스가 맡는 일은 없어야 한다** — 같은 건을 두 번 보낸다.

Herdr 세션 안에서 실행한다 (w5 `실행·워커`). 표준 라이브러리만 사용.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# 처리 표시. **큐를 나눠 돌리면 파일도 나눠야 한다** — save_state 는 파일 전체를
# 다시 쓰므로, 두 프로세스가 같은 파일을 쓰면 서로의 표시를 지운다.
STATE_FILES = {
    "all": ROOT / "scripts" / ".worker-state.json",
    "character": ROOT / "scripts" / ".worker-state.json",
    "music": ROOT / "scripts" / ".worker-state-music.json",
}
STATE_FILE = STATE_FILES["all"]  # main() 이 --queues 에 맞춰 바꾼다
# comfyui-generate.py 와 같은 규칙: COMFYUI_SERVER > 후보 포트 자동 탐지
COMFY_CANDIDATES = ["http://127.0.0.1:8188", "http://127.0.0.1:8000"]
COMFY = os.environ.get("COMFYUI_SERVER", COMFY_CANDIDATES[0]).rstrip("/")

BUILDER = "builder"        # w3 제작·Claude — 컨셉·일러스트·능력 제안
DEFAULT_IMAGER = BUILDER   # 이미지도 builder 가 뽑는다 (docs/team/builder.md)
IMAGER = DEFAULT_IMAGER    # 이미지 담당. main() 이 --imager 로 바꾼다
INTEGRATOR = "dev"         # w2 개발·Claude — 게임 반영·검증
COMPOSER = "composer"      # w8 음악·Claude — 가사·Suno·곡 후보 업로드

# **이미지 담당은 Codex 일 수도 Claude 일 수도 있다** — `--imager <에이전트>` 로 고른다.
# 둘은 지시문이 달라진다:
#   1. 슬래시 명령(`/create-character`)은 Claude 전용이다. Codex 에게 스킬을 시키려면
#      **파일 경로**를 가리켜야 한다 (마크다운이라 Codex 도 읽는다).
#   2. Codex 에는 Claude 프로젝트 메모리가 안 실린다 — 화풍 규칙을 매번 물려야 한다.
# 그래서 **종류를 묻지 말고 herdr 에게 물어본다.** 이름만 보고 추측하면(=`imager` 면
# Codex) 사람이 그 이름에 Claude 를 올리는 순간 어긋난다.
IMAGER_PREAMBLE_CODEX = [
    "먼저 `.claude/skills/create-character/SKILL.md` 를 읽고 그 절차를 그대로 따라라 "
    "(노출 기준·표현 축·화각·후보 변주 폭이 전부 거기 적혀 있다).",
    "이어서 `CLAUDE.md` 의 '이펙트 화풍' 절도 읽어라 — 이 저장소의 화풍 기준이다.",
    "규칙 전문을 이 지시문에 옮겨 적지 않는다. 베끼면 원본이 바뀔 때 낡는다.",
]
IMAGER_PREAMBLE_CLAUDE = [
    "`/create-character` 스킬의 절차를 그대로 따라라 "
    "(노출 기준·표현 축·화각·후보 변주 폭이 전부 거기 적혀 있다).",
    "규칙 전문을 이 지시문에 옮겨 적지 않는다. 베끼면 원본이 바뀔 때 낡는다.",
]


def imager_preamble() -> list[str]:
    """이미지 담당의 종류에 맞는 지시문 머리말. 종류를 모르면 Codex 쪽(경로 안내)을
    쓴다 — Claude 도 경로는 읽을 수 있으니 틀려도 덜 해롭다."""
    return IMAGER_PREAMBLE_CLAUDE if agent_kind(IMAGER) == "claude" else IMAGER_PREAMBLE_CODEX


AGENT_TIMEOUT_MS = 1_800_000  # 30분

# 작업을 하나 처리하면 곧바로 다음 것을 본다 (아래 GUARD 만큼만 숨 고른다).
# 큐가 비어 있을 때만 IDLE 만큼 잔다.
INTERVAL_GUARD = 3    # 연속 처리 사이 최소 간격
INTERVAL_STUCK = 45   # 할 일은 있는데 못 보낼 때 (에이전트 작업 중·ComfyUI 꺼짐 등)
INTERVAL_IDLE = 120   # 큐가 비었을 때

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


# ── 환경 / API ────────────────────────────────────────────────────────────
def load_env() -> dict:
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
    for k in ("VITE_SUPABASE_URL", "REVIEW_INDEX_KEY", "REVIEW_SITE_URL"):
        env.setdefault(k, os.environ.get(k, ""))
    if not env.get("VITE_SUPABASE_URL") or not env.get("REVIEW_INDEX_KEY"):
        raise SystemExit(".env.local 에 VITE_SUPABASE_URL / REVIEW_INDEX_KEY 가 필요합니다.")
    return env


def api(env: dict, query: str) -> dict:
    url = (f"{env['VITE_SUPABASE_URL'].rstrip('/')}/functions/v1/review"
           f"?{query}&k={env['REVIEW_INDEX_KEY']}")
    with urllib.request.urlopen(url, timeout=45) as r:
        return json.loads(r.read().decode("utf-8"))


def comfy_alive() -> bool:
    """살아 있는 포트를 찾으면 COMFY 를 그쪽으로 갱신한다."""
    global COMFY
    if os.environ.get("COMFYUI_SERVER"):
        candidates = [COMFY]
    else:
        candidates = [COMFY] + [c for c in COMFY_CANDIDATES if c != COMFY]
    for cand in candidates:
        try:
            urllib.request.urlopen(f"{cand}/system_stats", timeout=5).read()
            if cand != COMFY:
                log(f"ComfyUI 주소 변경: {COMFY} -> {cand}")
                COMFY = cand
            return True
        except Exception:
            continue
    return False


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def mark(state: dict, bucket: str, value: str) -> None:
    state.setdefault(bucket, [])
    if value not in state[bucket]:
        state[bucket].append(value)


# ── Herdr ────────────────────────────────────────────────────────────────
def herdr_bin() -> str:
    return os.environ.get("HERDR_BIN_PATH") or shutil.which("herdr") or "herdr"


def herdr(*args: str, timeout: int = 60) -> tuple[int, str]:
    proc = subprocess.run(
        [herdr_bin(), *args], capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=timeout,
    )
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def agent_status(name: str) -> str | None:
    code, out = herdr("agent", "get", name)
    if code != 0:
        return None
    try:
        return json.loads(out)["result"]["agent"]["agent_status"]
    except Exception:
        return None


def agent_kind(name: str) -> str | None:
    """에이전트 종류("claude"/"codex"). 없거나 못 읽으면 None."""
    code, out = herdr("agent", "get", name)
    if code != 0:
        return None
    try:
        return json.loads(out)["result"]["agent"]["agent"]
    except Exception:
        return None


def agent_free(name: str) -> bool:
    status = agent_status(name)
    if status is None:
        log(f"{name} 에이전트가 없습니다 (herdr agent start {name} --kind claude --pane <셸>)")
        return False
    if status == "blocked":
        log(f"{name} 이 승인 대기(blocked) 입니다. 사람이 봐야 하므로 건너뜁니다")
        return False
    if status == "working":
        log(f"{name} 이 작업 중입니다")
        return False
    return True


def send_to(name: str, text: str) -> bool:
    log(f"→ {name}: {text.splitlines()[0][:64]}")
    code, out = herdr(
        "agent", "prompt", name, text, "--wait", "--timeout", str(AGENT_TIMEOUT_MS),
        timeout=AGENT_TIMEOUT_MS // 1000 + 60,
    )
    if code != 0:
        log(f"✗ {name} 전달 실패: {out.strip()[:180]}")
        return False
    log(f"✓ {name} 작업 종료")
    return True


def mark_request(req_id: str, flag: str, batch: str | None = None) -> None:
    args = [sys.executable, str(ROOT / "scripts" / "review-requests.py"), f"--{flag}", req_id]
    if batch:
        args += ["--batch", batch]
    subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                   encoding="utf-8", errors="replace")


def mark_order(order_id: str, status: str, note: str | None = None) -> None:
    args = [sys.executable, str(ROOT / "scripts" / "music-order.py"), "--id", order_id,
            "--status", status]
    if note:
        args += ["--note", note]
    subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                   encoding="utf-8", errors="replace")


# ── 할 일 수집 ────────────────────────────────────────────────────────────
def _character_jobs(env: dict, state: dict) -> list[dict]:
    """컨셉 요청 · 심사 결정 · 게임 반영 · 능력 제안 → builder / integrator."""
    jobs: list[dict] = []

    # 1) 컨셉 요청
    try:
        reqs = [r for r in api(env, "requests=1").get("requests", [])
                if r.get("status") == "pending"]
    except Exception as e:
        log(f"요청 조회 실패: {e}")
        reqs = []

    try:
        batches = api(env, "list=1").get("batches", [])
    except Exception as e:
        log(f"배치 조회 실패: {e}")
        batches = []

    for r in reversed(reqs):  # 오래된 것부터
        theme = r.get("theme") or "it"
        if theme == "free":
            naming = ("이름은 **IT·개발 용어를 쓰지 않는다**. 치비·무기·구미·매화·나이트 계열로, "
                      "짧고 부르기 쉬운 한국어·일본어 어감이나 식물·동물·전통 모티프에서 딴다. "
                      "컨셉도 사이버·해커·시스템 소재를 피한다.")
        else:
            naming = "이름은 개발 용어에서 고른다 (루트·글리치·노이즈·세션·포크 계열)."

        if r.get("kind") == "auto" or not r.get("text", "").strip():
            # 중복 체크는 넣지 않는다 (2026-09-17, 사람 지시). 기존 캐릭터·진행 중인 배치와
            # 겹치는지는 사람이 후보를 보고 판단한다 — 목록도 지시문에 붙이지 않는다.
            concept = "컨셉은 지정되지 않았다. 네가 직접 잡아라. " + naming
        else:
            concept = f"요청 내용: {r['text']}"

        # 심사실에서 체크포인트를 고를 수 있다. 고르지 않았으면 아무 말도 하지 않고
        # 생성 쪽이 bindings.json 의 기본값을 쓰게 둔다.
        if r.get("model"):
            concept += ("\n\n체크포인트를 `" + r["model"] + "` 로 지정했다 — "
                        "`comfyui-generate.py --models " + r["model"] + "` 로 생성해라.")

        jobs.append({
            "agent": IMAGER,
            "kind": "request",
            "id": r["id"],
            "needs_comfy": True,
            "pre": lambda rid=r["id"]: mark_request(rid, "pick"),
            "text": "\n".join([
                "심사실에 새 컨셉 요청이 들어왔다. 후보 일러스트를 생성해라.",
                *imager_preamble(),
                f"요청 id: {r['id']}",
                concept,
                "후보는 4장 생성한다. **심사실에 올리지 않는다** — ComfyUI 출력 디렉터리에 두고,",
                "출력 경로와 파일 목록(장별 카메라·앵글·시드)을 보고한 뒤 거기서 멈춘다.",
                f"`python scripts/review-requests.py --done {r['id']}` 로 요청을 닫아라.",
                "판정은 사람이 직접 보고 말로 준다.",
            ]),
        })

    # 2) 제출된 결정
    handled = set(state.get("handled_batches", []))
    for b in reversed(batches):
        if not b.get("submitted") or b["batch"] in handled:
            continue
        d = b.get("decision") or {}
        t = d.get("type")
        if t == "reject":
            body = ["  이 컨셉은 폐기한다. `production/<id>.yaml` 에 REJECTED 와 사유를 기록해라.",
                    "  **새 컨셉을 자동으로 만들지 마라.** 새로 만드는 건 사람이 심사실 버튼으로 요청한다."]
        elif t == "revise":
            body = ["  피드백을 반영해 라운드를 올려 재생성한다 "
                    "(selected 가 있으면 그 시드 근처로, 없으면 컨셉 프롬프트부터 수정).",
                    "  라벨은 `<컨셉> · 2라운드` 처럼 라운드를 붙인다."]
        else:
            body = ["  selected 를 creative/<id>/selected.png 로 확정하고 "
                    "production/<id>.yaml 을 SUCCESS 로 갱신해라.",
                    "  능력 제안은 다음 지시에서 따로 시킨다. 여기서는 확정까지만."]
        # **한 작업이 두 가지 일을 겸한다.** revise 는 이미지를 다시 뽑는 일이고,
        # accept·reject 는 yaml 을 갱신하는 장부 일이다. 담당이 갈려야 한다.
        # 조건을 새로 쓰지 않고 needs_comfy 와 **같은 값**을 쓴다 — 따로 쓰면 둘이
        # 어긋나 'ComfyUI 를 기다리는데 정작 이미지 담당이 아닌' 상태가 난다.
        regen = t == "revise"
        jobs.append({
            "agent": IMAGER if regen else BUILDER,
            "kind": "decision",
            "id": b["batch"],
            "needs_comfy": regen,
            "state_key": "handled_batches",
            "text": "\n".join([
                f"심사 배치 `{b['batch']}` 의 결정: **{t}**",
                *(imager_preamble() if regen else []),
                f"`python scripts/review-status.py --id {b['batch']}` 로 상세와 피드백을 읽어라.",
                *body,
                "처리 결과를 PushNotification 으로 한 줄 알려라.",
            ]),
        })

    accepted = [b for b in batches if (b.get("decision") or {}).get("type") == "accept"]

    # 3) 사람이 설정을 저장한 것 → 게임 반영
    done_ch = set(state.get("handled_characters", []))
    for b in reversed(accepted):
        ch = b.get("character") or {}
        if not ch.get("confirmed") or b["batch"] in done_ch:
            continue
        jobs.append({
            "agent": INTEGRATOR,
            "kind": "integrate",
            "id": b["batch"],
            "needs_comfy": False,
            "state_key": "handled_characters",
            "text": "\n".join([
                f"배치 `{b['batch']}` 의 캐릭터 설정이 저장됐다 "
                f"({ch.get('name')} · {ch.get('grade')}).",
                f"`python scripts/review-character.py --id {b['batch']}` 로 "
                "이름·등급·기본효과·특수능력을 읽고,",
                "/integrate-character 스킬대로 게임에 반영해라 "
                "(에셋 배치 → src/utils/character.ts 등록 → abilityParams DESC → verify.ps1).",
                "끝나면 PushNotification 으로 한 줄 알려라.",
            ]),
        })

    # 4) 확정인데 능력 제안이 없는 것
    proposed = set(state.get("proposed", []))
    for b in reversed(accepted):
        ch = b.get("character") or {}
        if ch.get("hasProposals") or b["batch"] in proposed:
            continue
        jobs.append({
            "agent": BUILDER,
            "kind": "propose",
            "id": b["batch"],
            "needs_comfy": False,
            "state_key": "proposed",
            "text": "\n".join([
                f"배치 `{b['batch']}` 가 확정됐다. **캐릭터 설정 제안**을 만들어라.",
                f"`python scripts/review-status.py --id {b['batch']}` 로 선택된 후보와 컨셉을 확인하고,",
                "creative/<id>/spec.yaml · 선택된 이미지 · src/config/abilityParams.ts 의 기존 능력을 참고해",
                "  · 등급 추천 1개 + 한 줄 근거",
                "  · 기본 효과 후보 3개 (제목 + 한 줄 설명)",
                "  · 특수 능력 후보 3개 (제목 + 한 줄 설명)",
                "를 JSON 으로 만들어 다음 명령으로 올려라:",
                f"  python scripts/review-character.py --id {b['batch']} --propose <파일>",
                "능력은 실제 구현 가능한 것으로 잡고, 등급이 높을수록 강하게 잡는다.",
                "올린 뒤 PushNotification 으로 '설정 선택 대기' 를 알려라.",
            ]),
        })

    return jobs


def _music_jobs(env: dict, state: dict) -> list[dict]:
    """곡 주문 · 채택 → composer."""
    jobs: list[dict] = []

    # 5) 곡 주문 — 게임에 이미 있는 캐릭터에 테마곡을 붙인다
    #    Suno 는 공개 API 가 없어 브라우저로 몰기 때문에, 여기서 세션 상태를 미리
    #    확인할 방법이 없다. 로그인이 풀렸는지는 composer 가 현장에서 판단하고
    #    주문을 pending 으로 되돌린다 (아래 지시문 참고).
    #    채택 뒤에 할 일은 없다 — 음원을 안 받으므로 사람이 Suno 에서 가져간다.
    try:
        orders = api(env, "music=1").get("orders", [])
    except Exception as e:
        log(f"곡 주문 조회 실패: {e}")
        orders = []

    for o in reversed(orders):  # 오래된 것부터
        if o.get("status") != "pending":
            continue
        want = (o.get("note") or "").strip()
        mood = f"요청: {want}" if want else (
            "분위기 지정 없음 — **일러스트를 직접 보고** 잡아라.")
        again = ""
        d = o.get("decision") or {}
        if d.get("type") == "revise":
            again = f"이건 재작업이다. 지난 판정 피드백: {d.get('note') or '(없음)'}"

        jobs.append({
            "agent": COMPOSER,
            "kind": "music",
            "id": o["id"],
            "needs_comfy": False,
            "pre": lambda oid=o["id"]: mark_order(oid, "picked"),
            "text": "\n".join(x for x in [
                "심사실에 곡 주문이 들어왔다. /create-music 스킬을 따라 처리해라.",
                f"주문 id: {o['id']}",
                f"캐릭터: {o.get('name')} (`{o.get('character')}`) — 이미 게임에 등록된 캐릭터다.",
                mood,
                again,
                "",
                "1. `src/utils/character.ts` 에서 이 캐릭터의 `illustPath` 를 찾아 "
                "**그 이미지를 직접 열어 보고**, `src/config/abilityParams.ts` 의 설명과 "
                "등급까지 읽어 곡의 분위기를 잡아라.",
                "2. 가사와 Suno 스타일을 `creative/_music/<캐릭터id>/` 에 쓴다.",
                "3. `python scripts/suno-submit.py` 로 곡을 뽑는다. "
                "**Suno 로그인이 풀려 있으면 거기서 멈춰라** — "
                f"`python scripts/music-order.py --id {o['id']} --status pending` 으로 되돌리고 "
                "PushNotification 으로 알린 뒤 끝낸다.",
                "4. **음원은 내려받지 않는다.** 곡마다 공유 링크를 복사해 올린다: "
                f"`python scripts/music-order.py --id {o['id']} --title \"<제목>\" "
                "--links <링크1> <링크2> --labels \"<한 줄>\" \"<한 줄>\"`",
                "5. PushNotification 으로 심사 대기를 알린다. "
                "**사람이 Suno 에서 직접 듣고 고른다. 여기서 끝이다.**",
            ] if x is not None),
        })

    return jobs


def collect_jobs(env: dict, state: dict, queues: str = "all") -> list[dict]:
    """큐를 훑어 (대상 에이전트, 작업) 목록을 만든다. 실행은 하지 않는다.

    `queues` 로 담당 라인을 나눌 수 있다. tick() 은 보낸 작업이 **전부 끝날 때까지**
    기다리므로, 한 프로세스가 두 라인을 다 맡으면 캐릭터 생성 10분 동안 곡 주문이
    큐에 그대로 앉아 있게 된다. 라인을 나눠 각자 돌리면 서로를 기다리지 않는다.
    (상태 파일도 같이 갈라진다 — main() 참고. 안 그러면 서로의 표시를 덮어쓴다.)
    """
    jobs: list[dict] = []
    if queues in ("all", "music"):
        jobs += _music_jobs(env, state)
    if queues in ("all", "character"):
        jobs += _character_jobs(env, state)
    return jobs


# ── 로컬 정리 (판단 없음 → 에이전트를 거치지 않는다) ────────────────────────
def cleanup_local(env: dict, state: dict) -> None:
    """심사실에서 삭제된 배치의 로컬 원본을 치운다.

    같은 캐릭터의 다른 라운드가 남아 있으면 건드리지 않는다.
    selected.png · spec.yaml · 가사 등 산출물은 그대로 둔다.
    """
    try:
        remote = {b["batch"] for b in api(env, "list=1").get("batches", [])}
    except Exception:
        return

    known = set(state.get("known_batches", []))
    gone = known - remote
    if not gone:
        state["known_batches"] = sorted(known | remote)
        return

    live_chars = {b.rsplit("-r", 1)[0] for b in remote}
    for batch in sorted(gone):
        char = batch.rsplit("-r", 1)[0]
        if char in live_chars:
            continue
        for d in ROOT.glob(f"creative/{char}/candidates*"):
            if d.is_dir():
                size = sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
                shutil.rmtree(d, ignore_errors=True)
                log(f"로컬 정리: {d.relative_to(ROOT)} ({size // 1024 // 1024}MB) — 심사실에서 삭제된 배치")

    state["known_batches"] = sorted(remote)
    save_state(state)


# ── 한 주기 ───────────────────────────────────────────────────────────────
def tick(env: dict, clean: bool = True, queues: str = "all") -> tuple[int, int]:
    """(보낸 작업 수, 못 보내고 남은 작업 수) 를 반환한다."""
    state = load_state()
    if clean and queues != "music":
        cleanup_local(env, state)

    jobs = collect_jobs(env, state, queues)
    if not jobs:
        log("새 작업 없음")
        return 0, 0

    comfy = comfy_alive()
    picked: dict[str, dict] = {}
    for j in jobs:
        if j["agent"] in picked:
            continue                       # 에이전트당 한 건
        if j["needs_comfy"] and not comfy:
            log(f"ComfyUI 꺼짐 — {j['kind']} {j['id']} 는 다음 주기로")
            continue
        if not agent_free(j["agent"]):
            continue
        picked[j["agent"]] = j

    if not picked:
        log(f"대기 중인 작업 {len(jobs)}건 — 지금은 보낼 수 없음")
        return 0, len(jobs)

    log(f"큐 {len(jobs)}건 · 이번 주기에 {len(picked)}건 동시 실행")
    results: dict[str, bool] = {}

    def run(job: dict) -> None:
        if job.get("pre"):
            job["pre"]()
        results[job["agent"]] = send_to(job["agent"], job["text"])

    threads = [threading.Thread(target=run, args=(j,), daemon=True) for j in picked.values()]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=AGENT_TIMEOUT_MS / 1000 + 90)

    state = load_state()                   # 에이전트가 그 사이 바꿨을 수 있다
    for agent, job in picked.items():
        if results.get(agent) and job.get("state_key"):
            mark(state, job["state_key"], job["id"])
    save_state(state)

    return len(picked), len(jobs) - len(picked)


def main() -> int:
    p = argparse.ArgumentParser(description="심사실 큐 워커")
    p.add_argument("--interval", type=int,
                   help="고정 주기(초). 생략하면 자동 (처리 직후 즉시 · 유휴 120)")
    p.add_argument("--once", action="store_true", help="한 번만 확인하고 종료")
    p.add_argument("--no-clean", action="store_true", help="로컬 원본 정리 끄기")
    p.add_argument("--imager", default=DEFAULT_IMAGER, metavar="에이전트",
                   help=f"이미지(생성·재생성)를 맡을 Herdr 에이전트 이름. 기본 {DEFAULT_IMAGER}. "
                        "Claude 로 돌리려면 Claude 에이전트 이름을 준다 (예: --imager builder). "
                        "지시문은 herdr 이 보고하는 종류에 맞춰 자동으로 갈린다")
    p.add_argument("--queues", choices=["all", "character", "music"], default="all",
                   help="맡을 라인. character=컨셉·심사·반영 / music=곡 주문 "
                        "(둘로 나눠 돌리면 서로를 기다리지 않는다)")
    a = p.parse_args()

    # 큐를 나눠 돌 때는 처리 표시도 나눠 쓴다
    global STATE_FILE, IMAGER
    STATE_FILE = STATE_FILES[a.queues]
    IMAGER = a.imager

    env = load_env()
    kind = agent_kind(IMAGER) or "없음"
    who = {"all": f"이미지={IMAGER}({kind}) 제작={BUILDER} 구현={INTEGRATOR} 음악={COMPOSER}",
           "character": f"이미지={IMAGER}({kind}) 제작={BUILDER} 구현={INTEGRATOR}",
           "music": f"음악={COMPOSER}"}[a.queues]
    log(f"워커 시작 [{a.queues}] · {who} · "
        f"주기 {a.interval or f'즉시/{INTERVAL_STUCK}/{INTERVAL_IDLE}'}초")
    if os.environ.get("HERDR_ENV") != "1":
        log("경고: Herdr 세션 밖입니다. 에이전트 전달이 실패할 수 있습니다")

    while True:
        sent = left = 0
        try:
            sent, left = tick(env, clean=not a.no_clean, queues=a.queues)
        except KeyboardInterrupt:
            log("종료")
            return 0
        except Exception as e:
            log(f"오류: {type(e).__name__}: {e}")
        if a.once:
            return 0
        if a.interval:
            wait = a.interval
        elif sent:
            wait = INTERVAL_GUARD      # 방금 처리했다 → 밀린 게 있는지 곧바로 확인
        elif left:
            wait = INTERVAL_STUCK      # 할 일은 있는데 못 보냄 → 곧 다시 시도
        else:
            wait = INTERVAL_IDLE       # 큐가 비었다
        time.sleep(wait)


if __name__ == "__main__":
    sys.exit(main())
