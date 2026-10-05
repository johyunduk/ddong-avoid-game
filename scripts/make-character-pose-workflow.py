#!/usr/bin/env python3
"""Clone the current ComfyUI character workflow and insert OpenPose ControlNet."""

from __future__ import annotations

import copy
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
COMFY = Path(r"C:\ComfyUI")
SOURCE = COMFY / "user/default/workflows/character.json"
CONTROL_SOURCE = COMFY / "user/default/workflows/캐릭터_달리기_컨트롤넷.json"
OUTPUT = COMFY / "user/default/workflows/character-pose.json"
REPO_OUTPUT = ROOT / "workflows/comfyui/character-pose.json"


def node_by_id(workflow: dict, node_id: int) -> dict:
    return next(node for node in workflow["nodes"] if node["id"] == node_id)


def main() -> None:
    workflow = json.loads(SOURCE.read_text(encoding="utf-8"))
    controls = json.loads(CONTROL_SOURCE.read_text(encoding="utf-8"))

    positive = node_by_id(workflow, 2)
    sampler = node_by_id(workflow, 5)
    saver = node_by_id(workflow, 7)

    # Replace the direct positive-conditioning link with a ControlNet branch.
    old_link = next(inp["link"] for inp in sampler["inputs"] if inp["name"] == "positive")
    workflow["links"] = [link for link in workflow["links"] if link[0] != old_link]
    positive["outputs"][0]["links"] = [10]
    next(inp for inp in sampler["inputs"] if inp["name"] == "positive")["link"] = 13

    load_pose = copy.deepcopy(node_by_id(controls, 3))
    load_pose.update({"id": 67, "pos": [720, 760], "title": "OpenPose 뼈대 이미지"})
    load_pose["widgets_values"] = ["pose_gen/openpose_fullimage_00001_.png", "image"]
    load_pose["outputs"][0]["links"] = [11]

    loader = copy.deepcopy(node_by_id(controls, 5))
    loader.update({"id": 68, "pos": [1120, 760], "title": "OpenPose ControlNet (NOOB XL)"})
    loader["outputs"][0]["links"] = [12]

    apply_control = copy.deepcopy(node_by_id(controls, 4))
    apply_control.update({"id": 69, "pos": [1460, 680], "title": "OpenPose 적용 (강도 0.9)"})
    for inp in apply_control["inputs"]:
        if inp["name"] == "conditioning":
            inp["link"] = 10
        elif inp["name"] == "control_net":
            inp["link"] = 12
        elif inp["name"] == "image":
            inp["link"] = 11
    apply_control["widgets_values"] = [0.9]
    apply_control["outputs"][0]["links"] = [13]

    workflow["nodes"].extend([load_pose, loader, apply_control])
    workflow["links"].extend(
        [
            [10, 2, 0, 69, 0, "CONDITIONING"],
            [11, 67, 0, 69, 2, "IMAGE"],
            [12, 68, 0, 69, 1, "CONTROL_NET"],
            [13, 69, 0, 5, 1, "CONDITIONING"],
        ]
    )
    workflow["last_node_id"] = 69
    workflow["last_link_id"] = 13
    workflow["id"] = "character-pose-openpose-workflow"
    workflow["revision"] = 0
    saver["widgets_values"] = ["character/illustration/pose/il"]
    saver["title"] = "Save Pose-Controlled Character"

    serialized = json.dumps(workflow, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(serialized, encoding="utf-8")
    REPO_OUTPUT.write_text(serialized, encoding="utf-8")


if __name__ == "__main__":
    main()
