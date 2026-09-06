#!/usr/bin/env python3
"""심사실 큐를 확인해 Herdr 에이전트에게 배분하는 상주 워커.

    python scripts/worker.py                 # 상주 (큐가 밀리면 90초, 비면 6분)
    python scripts/worker.py --once          # 한 번만 확인하고 종료
    python scripts/worker.py --no-clean      # 로컬 원본 정리 끄기

원칙
  · 판단이 필요한 일만 에이전트에게 보낸다. 삭제·정리는 이 스크립트가 직접 한다.
  · 대상 에이전트가 다르면 같은 주기에 **동시에** 보낸다 (builder 와 integrator 는 병렬).
  · 한 에이전트에게는 한 번에 한 건만 보낸다.

    [폰] 요청/결정/설정 → Storage 큐
            ↓ (이 워커)
    builder(w3) 컨셉·생성·제안   |   integrator(w2) 게임 반영

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
STATE_FILE = ROOT / "scripts" / ".worker-state.json"
COMFY = "http://127.0.0.1:8188"

BUILDER = "builder"        # w3 제작·Claude — 컨셉·생성·심사 업로드·능력 제안
INTEGRATOR = "integrator"  # w2 구현·Claude — 게임 반영·검증
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
    try:
        urllib.request.urlopen(f"{COMFY}/system_stats", timeout=5).read()
        return True
    except Exception:
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


# ── 할 일 수집 ────────────────────────────────────────────────────────────
def collect_jobs(env: dict, state: dict) -> list[dict]:
    """큐를 훑어 (대상 에이전트, 작업) 목록을 만든다. 실행은 하지 않는다."""
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

    listing = "\n".join(f"  - {b['batch']} : {b['label']}" for b in batches[:20])

    for r in reversed(reqs):  # 오래된 것부터
        theme = r.get("theme") or "it"
        if theme == "free":
            naming = ("이름은 **IT·개발 용어를 쓰지 않는다**. 치비·무기·구미·매화·나이트 계열로, "
                      "짧고 부르기 쉬운 한국어·일본어 어감이나 식물·동물·전통 모티프에서 딴다. "
                      "컨셉도 사이버·해커·시스템 소재를 피한다.")
        else:
            naming = "이름은 개발 용어에서 고른다 (루트·글리치·노이즈·세션·포크 계열)."

        if r.get("kind") == "auto" or not r.get("text", "").strip():
            concept = ("컨셉은 지정되지 않았다. 네가 직접 잡아라. src/utils/character.ts 의 기존 "
                       "캐릭터와 아래 '진행 중인 배치' 양쪽 모두와 이름·색·모티프가 겹치지 않게 한다. "
                       + naming)
        else:
            concept = f"요청 내용: {r['text']}"
        if listing:
            concept += "\n\n진행 중인 배치 (아직 게임 등록 전):\n" + listing

        jobs.append({
            "agent": BUILDER,
            "kind": "request",
            "id": r["id"],
            "needs_comfy": True,
            "pre": lambda rid=r["id"]: mark_request(rid, "pick"),
            "text": "\n".join([
                "심사실에 새 컨셉 요청이 들어왔다. /create-character 스킬을 따라 처리해라.",
                f"요청 id: {r['id']}",
                concept,
                "후보는 4장 생성한다. 업로드 후 PushNotification 으로 심사 링크를 알리고,",
                f"`python scripts/review-requests.py --done {r['id']} --batch <배치id>` 로 요청을 닫아라.",
                "판정은 사람에게 맡긴다.",
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
        jobs.append({
            "agent": BUILDER,
            "kind": "decision",
            "id": b["batch"],
            "needs_comfy": t == "revise",
            "state_key": "handled_batches",
            "text": "\n".join([
                f"심사 배치 `{b['batch']}` 의 결정: **{t}**",
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
def tick(env: dict, clean: bool = True) -> tuple[int, int]:
    """(보낸 작업 수, 못 보내고 남은 작업 수) 를 반환한다."""
    state = load_state()
    if clean:
        cleanup_local(env, state)

    jobs = collect_jobs(env, state)
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
    a = p.parse_args()

    env = load_env()
    log(f"워커 시작 · 생성={BUILDER} 구현={INTEGRATOR} · "
        f"주기 {a.interval or f'즉시/{INTERVAL_STUCK}/{INTERVAL_IDLE}'}초")
    if os.environ.get("HERDR_ENV") != "1":
        log("경고: Herdr 세션 밖입니다. 에이전트 전달이 실패할 수 있습니다")

    while True:
        sent = left = 0
        try:
            sent, left = tick(env, clean=not a.no_clean)
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
