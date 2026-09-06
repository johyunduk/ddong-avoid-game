#!/usr/bin/env python3
"""ComfyUI 로컬 API 로 캐릭터 일러스트 후보를 생성한다.

표준 라이브러리만 사용한다 (외부 패키지 설치 불필요).

사용 예:
    python scripts/comfyui-generate.py \
        --workflow character \
        --prompt "1girl, solo, long pink hair, summer night pool, ..." \
        --count 8 \
        --out creative/summer-pool-01/candidates

출력: <out>/01.png ... <out>/NN.png + <out>/meta.json (프롬프트/시드 기록)

워크플로는 workflows/comfyui/ 의 UI 저장본(JSON)을 그대로 쓴다.
API 포맷 변환은 실행 중인 ComfyUI 의 /object_info 를 참조해 자동 수행한다.
노드 바인딩(어느 노드의 어느 입력이 프롬프트/시드/사이즈인지)은
workflows/comfyui/bindings.json 에 정의한다.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

# Windows 콘솔(cp949)에서도 한글이 깨지지 않게
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
WORKFLOW_DIR = ROOT / "workflows" / "comfyui"
DEFAULT_SERVER = "http://127.0.0.1:8188"

# UI 위젯 값이 하나 더 붙는 입력들 (control_after_generate)
CONTROL_SUFFIX_INPUTS = {"seed", "noise_seed"}
SKIP_CLASSES = {"Note", "MarkdownNote", "Reroute", "PrimitiveNode"}


# ── HTTP ──────────────────────────────────────────────────────────────────
def _get(server: str, path: str) -> bytes:
    with urllib.request.urlopen(f"{server}{path}", timeout=30) as r:
        return r.read()


def _post_json(server: str, path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{server}{path}", data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise SystemExit(f"ComfyUI 가 요청을 거부했습니다 (HTTP {e.code}):\n{body}")


def check_server(server: str) -> None:
    try:
        _get(server, "/system_stats")
    except Exception:
        raise SystemExit(
            f"ComfyUI 서버에 연결할 수 없습니다: {server}\n"
            "ComfyUI 를 먼저 실행하거나 --server 로 주소를 지정하세요."
        )


# ── UI 워크플로 → API 포맷 변환 ─────────────────────────────────────────────
def is_api_format(graph: dict) -> bool:
    return "nodes" not in graph and all(
        isinstance(v, dict) and "class_type" in v for v in graph.values()
    )


def ui_to_api(graph: dict, object_info: dict) -> dict:
    nodes = {int(n["id"]): n for n in graph["nodes"]}
    # 링크: [link_id, origin_node, origin_slot, target_node, target_slot, type]
    links = {l[0]: l for l in graph.get("links", []) if l}

    api = {}
    for node_id, node in nodes.items():
        cls = node.get("type")
        if cls in SKIP_CLASSES:
            continue
        if node.get("mode") in (2, 4):  # mute / bypass
            continue
        info = object_info.get(cls)
        if info is None:
            raise SystemExit(
                f"ComfyUI 에 노드 타입 '{cls}' 가 없습니다 (node {node_id}). "
                "커스텀 노드가 설치되지 않았을 수 있습니다."
            )

        specs = []
        for section in ("required", "optional"):
            for name, spec in (info.get("input", {}).get(section) or {}).items():
                specs.append((name, spec))

        widget_values = node.get("widgets_values") or []
        if isinstance(widget_values, dict):  # 신형 포맷 방어
            widget_values = list(widget_values.values())
        else:
            widget_values = list(widget_values)

        inputs = {}
        wi = 0
        for name, spec in specs:
            spec_type = spec[0] if isinstance(spec, (list, tuple)) and spec else spec
            # 리스트면 콤보(위젯), 문자열이면 타입명
            is_widget = isinstance(spec_type, list) or spec_type in (
                "INT",
                "FLOAT",
                "STRING",
                "BOOLEAN",
                "COMBO",
            )
            if not is_widget:
                continue  # 연결로만 채워지는 입력
            if wi < len(widget_values):
                inputs[name] = widget_values[wi]
                wi += 1
            if name in CONTROL_SUFFIX_INPUTS and wi < len(widget_values):
                wi += 1  # control_after_generate 값 소비
        # 링크로 채워지는 입력은 위젯 값을 덮어쓴다
        for slot in node.get("inputs") or []:
            link_id = slot.get("link")
            if link_id is None or link_id not in links:
                continue
            origin_node, origin_slot = links[link_id][1], links[link_id][2]
            inputs[slot["name"]] = [str(origin_node), origin_slot]

        api[str(node_id)] = {"class_type": cls, "inputs": inputs}

    if api and all(not n["inputs"] for n in api.values()):
        raise SystemExit("워크플로 변환에 실패했습니다 (입력이 하나도 채워지지 않음).")
    return api


# ── 바인딩 패치 ────────────────────────────────────────────────────────────
def set_input(api: dict, ref: str, value) -> None:
    node_id, _, input_name = ref.partition(".")
    node = api.get(node_id)
    if node is None:
        raise SystemExit(f"바인딩이 가리키는 노드가 없습니다: {ref}")
    if input_name not in node["inputs"]:
        raise SystemExit(
            f"노드 {node_id}({node['class_type']}) 에 입력 '{input_name}' 이 없습니다. "
            f"가능한 입력: {sorted(node['inputs'])}"
        )
    node["inputs"][input_name] = value


def apply_bindings(api: dict, binding: dict, values: dict) -> None:
    for key, value in values.items():
        if value is None:
            continue
        for ref in binding.get(key, []):
            set_input(api, ref, value)
    for d in binding.get("derived", []):
        base = values.get(d["from"])
        if base is None:
            continue
        set_input(api, d["target"], int(round(base * d.get("scale", 1))))


# ── 실행 ──────────────────────────────────────────────────────────────────
def queue_prompt(server: str, api: dict, client_id: str) -> str:
    res = _post_json(server, "/prompt", {"prompt": api, "client_id": client_id})
    if "prompt_id" not in res:
        raise SystemExit(f"큐 등록 실패: {json.dumps(res, ensure_ascii=False)[:800]}")
    return res["prompt_id"]


def wait_for(server: str, prompt_id: str, timeout: float) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        hist = json.loads(_get(server, f"/history/{prompt_id}").decode("utf-8"))
        entry = hist.get(prompt_id)
        if entry:
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                msgs = json.dumps(status.get("messages", []), ensure_ascii=False)
                raise SystemExit(f"ComfyUI 실행 오류:\n{msgs[:2000]}")
            if status.get("completed") or entry.get("outputs"):
                return entry
        time.sleep(1.5)
    raise SystemExit(f"타임아웃: {prompt_id} 가 {timeout:.0f}초 안에 끝나지 않았습니다.")


def collect_images(entry: dict) -> list:
    images = []
    for out in (entry.get("outputs") or {}).values():
        images.extend(out.get("images") or [])
    return [i for i in images if i.get("type") == "output"] or images


def download(server: str, image: dict, dest: Path) -> None:
    q = urllib.parse.urlencode(
        {
            "filename": image["filename"],
            "subfolder": image.get("subfolder", ""),
            "type": image.get("type", "output"),
        }
    )
    dest.write_bytes(_get(server, f"/view?{q}"))


def main() -> int:
    p = argparse.ArgumentParser(description="ComfyUI 일러스트 후보 생성")
    p.add_argument("--workflow", default="character", help="bindings.json 의 워크플로 키")
    p.add_argument("--prompt", help="포지티브 프롬프트 (주제 부분만)")
    p.add_argument("--prompt-file", help="프롬프트를 파일에서 읽음")
    p.add_argument("--negative", help="네거티브 프롬프트 (미지정 시 기본값)")
    p.add_argument("--no-prefix", action="store_true", help="품질 프리픽스 미사용")
    p.add_argument("--count", type=int, default=8, help="모델당 생성할 후보 수 (기본 8)")
    p.add_argument(
        "--models",
        help="비교할 체크포인트 (쉼표 구분). bindings 의 models 별칭 또는 파일명. "
        "여러 개면 같은 시드·프롬프트로 모델별 후보를 함께 만든다",
    )
    p.add_argument("--seed", default="random", help="시작 시드 또는 random")
    p.add_argument("--width", type=int)
    p.add_argument("--height", type=int)
    p.add_argument("--out", required=True, help="결과 저장 디렉터리")
    p.add_argument("--server", default=DEFAULT_SERVER)
    p.add_argument("--timeout", type=float, default=900, help="장당 최대 대기 초")
    p.add_argument("--dry-run", action="store_true", help="큐에 넣지 않고 API JSON 만 출력")
    a = p.parse_args()

    if a.prompt_file:
        a.prompt = Path(a.prompt_file).read_text(encoding="utf-8").strip()
    if not a.prompt:
        p.error("--prompt 또는 --prompt-file 이 필요합니다")

    bindings = json.loads((WORKFLOW_DIR / "bindings.json").read_text(encoding="utf-8"))
    binding = bindings.get(a.workflow)
    if binding is None:
        keys = [k for k in bindings if not k.startswith("_")]
        raise SystemExit(f"알 수 없는 워크플로 '{a.workflow}'. 사용 가능: {keys}")
    defaults = binding.get("defaults", {})

    graph = json.loads((WORKFLOW_DIR / binding["workflow"]).read_text(encoding="utf-8"))

    check_server(a.server)
    if is_api_format(graph):
        api_base = graph
    else:
        object_info = json.loads(_get(a.server, "/object_info").decode("utf-8"))
        api_base = ui_to_api(graph, object_info)

    prefix = "" if a.no_prefix else defaults.get("positive_prefix", "")
    positive = prefix + a.prompt
    negative = a.negative if a.negative is not None else defaults.get("negative")
    # negative_required 의 태그는 --negative 로 덮어써도 항상 남는다
    for tag in [t.strip() for t in defaults.get("negative_required", "").split(",") if t.strip()]:
        if tag.lower() not in (negative or "").lower():
            negative = f"{tag}, {negative}" if negative else tag
    width = a.width or defaults.get("width")
    height = a.height or defaults.get("height")

    seed0 = random.randrange(2**31) if a.seed == "random" else int(a.seed)

    # 사용할 체크포인트 목록 (별칭 → 파일명)
    alias = defaults.get("models", {})
    if a.models:
        wanted = [m.strip() for m in a.models.split(",") if m.strip()]
    else:
        wanted = [""]  # 워크플로 기본값 그대로
    models = []
    for m in wanted:
        if not m:
            models.append(("기본", None))
        elif m in alias:
            models.append((m, alias[m]))
        else:
            models.append((Path(m).stem, m))

    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    client_id = str(uuid.uuid4())
    meta = {
        "workflow": a.workflow,
        "positive": positive,
        "negative": negative,
        "width": width,
        "height": height,
        "server": a.server,
        "images": [],
    }

    jobs = [(name, ckpt, seed0 + i) for name, ckpt in models for i in range(a.count)]
    for idx, (name, ckpt, seed) in enumerate(jobs):
        api = json.loads(json.dumps(api_base))  # deep copy
        values = {
            "positive": positive,
            "negative": negative,
            "seed": seed,
            "width": width,
            "height": height,
            "batch": 1,
            "filename_prefix": f"herdr/{out_dir.name}",
        }
        if ckpt:
            values["model"] = ckpt
        apply_bindings(api, binding, values)
        if a.dry_run:
            print(json.dumps(api, ensure_ascii=False, indent=2))
            return 0

        label = f" {name}" if len(models) > 1 else ""
        print(f"[{idx + 1}/{len(jobs)}]{label} seed={seed} 큐 등록...", flush=True)
        prompt_id = queue_prompt(a.server, api, client_id)
        entry = wait_for(a.server, prompt_id, a.timeout)
        images = collect_images(entry)
        if not images:
            print(f"  경고: 출력 이미지가 없습니다 (prompt_id={prompt_id})", file=sys.stderr)
            continue
        dest = out_dir / f"{idx + 1:02d}.png"
        download(a.server, images[0], dest)
        meta["images"].append({"file": dest.name, "seed": seed, "model": name})
        print(f"  -> {dest}", flush=True)

    (out_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\n완료: {len(meta['images'])}장 -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
