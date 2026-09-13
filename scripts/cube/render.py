#!/usr/bin/env python3
"""테드 체스 큐브 — Blender 헤드리스 렌더.

    blender -b -P scripts/cube/render.py -- --pass body --phase forge --out build/cube/forge_body

설계 문서: docs/fx-ted-cube-remake.md (§2 파이프라인 / §2.6 씬 구성 / §4 타임라인)
시간 축은 전부 `scripts/cube/timeline.py` 에서 온다. 여기서 시각을 새로 정하지 마라.

## 왜 3D 인가
이전 판(`scripts/make-cube-sheet.py`)은 Pillow 로 두께 없는 사각형을 칠했다.
**틈에서 빛이 새려면 틈이 실제로 있어야 하고, 조각이 두꺼워 보이려면 측면과 접촉 그림자가
있어야 한다.** 여기서는 3×3×3 루빅스 배열의 작은 정육면체 26개(가운데는 안 보이니 뺀다)가
실제 기하이고, 그 안에 발광체가 들어 있어 **칸 사이 틈으로 빛이 샌다**.

## 화풍 주의
기준 이미지(creative/_fx/ted-cube/refs/)는 실사 3D 렌더풍이고 저장소의 다른 이펙트는
애니풍 2D 다. 튄다는 걸 알고 만든다. 다만 **대리석 결·피사계심도·그레인은 게임 표시 크기
(약 180px)에서 전부 노이즈로 뭉개지므로 넣지 않는다.** 우선순위는 실루엣 > 명암 대비 >
3×3 구조 > 재질 디테일이다.
"""
from __future__ import annotations

import argparse
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector

sys.path.append(str(Path(__file__).resolve().parent))
import timeline as T  # noqa: E402

# ── 기하 (world 단위) ────────────────────────────────────────────────────────
CUBE_A = 0.80               # 큐브 바깥 반지름 (칸의 바깥면까지)
CUBIE_H = 0.245             # 작은 정육면체 반변
PITCH = CUBE_A - CUBIE_H    # 0.555 — 칸 중심 간격. 틈 = PITCH - 2*CUBIE_H = 0.065
CORE_H = 0.780              # 안쪽 발광체. 칸 바깥면(0.80)보다 살짝 안이라 틈으로만 보인다
BEVEL = 0.026

BLAST_REACH = 1.55          # 파편이 날아가는 최대 거리 (blast 프레임 반폭 2.00 안)
FLARE_LIFT = 3.2            # 섬광 판을 카메라 쪽으로 당기는 거리 (파편보다 앞)

# ── 카메라 ───────────────────────────────────────────────────────────────────
CAM_LENS = 85.0
CAM_DIST = 9.8
BASE_SENSOR = 26.0          # FORGE_PX(192) 기준. 프레임이 커지면 같은 비율로 늘려
                            # **월드 대 픽셀 비율을 고정한다** — 이음새에서 큐브 크기가 튀면 안 된다
                            # 이 값이 큐브의 화면 크기를 정한다 (26 → 192 프레임에서 약 120px)
# 모서리가 정면으로 오는 3/4. 기준 이미지 02 의 각이고, 세 면이 한 번에 보여야 3×3 이 읽힌다
CAM_DIR = Vector((1.0, -1.0, 0.62)).normalized()

# ── 색 (기준 이미지 실측, §2.6 재조정) ───────────────────────────────────────
# creative/_fx/ted-cube/refs/02_assemble.png 크롭 통계:
#   흑 칸 (27,22,18) / 아이보리 칸 밝은 면 (202,178,154) / 이음새 하이라이트 (243,233,219)
#   전체 미드톤 (118,92,68) — 금색이 1 : 0.78 : 0.57 의 앰버 비율이다
IVORY = (0.898, 0.831, 0.733)   # sRGB #E5D4BB
BLACK = (0.022, 0.018, 0.015)   # sRGB #0B0908 — 기준 이미지의 흑 칸(27,22,18)까지 내려간다
GOLD = (1.000, 0.660, 0.300)
HOT = (1.000, 0.925, 0.820)
# 섬광은 가운데만 희고 가장자리는 금색이어야 한다. 흰색을 그대로 쓰면 회색 얼룩이 된다 —
# 강한 채널은 어차피 1 에서 잘리므로 **색은 감쇠 구간에서만 보인다**
FLARE_GLOW = (1.000, 0.720, 0.380)
FLARE_RAY = (1.000, 0.780, 0.450)

KEY_E = 980.0
RIM_E = 1180.0
FILL_E = 240.0

# 프레임 밖으로 나가는 것은 **반드시 프레임 안에서 사라져야 한다** — 스프라이트 경계에서
# 잘린 조각은 게임 배경 위에 직선으로 끊긴 자국을 남긴다
# 들어올 때는 프레임 안쪽에서 사라져야 한다 — 조각 자신의 크기(반변 0.245)가 있어서
# 중심 거리가 반폭에 닿기 전에 이미 모서리가 프레임을 넘는다
EDGE_FADE_IN = (0.72, 0.95)   # 제자리(중심거리 0.96 = 반폭의 0.64)는 절대 건드리면 안 된다
EDGE_FADE_OUT = (0.95, 1.30)   # 나갈 때는 축소가 같이 걸려 더 여유가 있다


# ─────────────────────────────────────────────────────────────────────────────
# 보간
# ─────────────────────────────────────────────────────────────────────────────

def clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else (1.0 if x > 1.0 else x)


def span(t: float, a: float, b: float) -> float:
    return 0.0 if b <= a else clamp01((t - a) / (b - a))


def ease_out(u: float) -> float:
    return 1.0 - (1.0 - u) ** 3


def ease_in(u: float) -> float:
    return u * u


def ease_io(u: float) -> float:
    return u * u * (3.0 - 2.0 * u)


def lerp(a: float, b: float, u: float) -> float:
    return a + (b - a) * u


def half_world(frame_px: int, scale_sensor: bool) -> float:
    """프레임 반폭에 해당하는 월드 거리."""
    sensor = BASE_SENSOR * (frame_px / T.FORGE_PX if scale_sensor else 1.0)
    return CAM_DIST * (sensor / 2.0) / CAM_LENS


def edge_fade(r: float, half: float, band=EDGE_FADE_OUT) -> float:
    lo, hi = band[0] * half, band[1] * half
    return 1.0 - ease_io(span(r, lo, hi))


# ─────────────────────────────────────────────────────────────────────────────
# 씬 만들기
# ─────────────────────────────────────────────────────────────────────────────

def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def emissive_mat(name: str, color, strength: float) -> bpy.types.Material:
    """단색 발광. 불투명이라 알파를 쓰지 않는다 (섬광 코어·칸 사이 빛)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1.0)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def soft_flare_mat(name: str, color) -> bpy.types.Material:
    """중심에서 가장자리로 0 이 되는 **알파 감쇠** 발광.

    불투명 원을 쓸 수 없다 — 배경이 투명한 시트라 검은 테두리가 그대로 알파에 남는다.
    구형 그라디언트를 알파에 물려 가장자리에서 정확히 0 이 되게 한다.
    길쭉하게 눌러 쓰면 그대로 섬광 광선이 된다 (기준 이미지 04 의 별빛).
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.surface_render_method = 'BLENDED'   # DITHERED 는 부드러운 감쇠에서 지글거린다
    mat.use_backface_culling = False
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1.0)
    em.inputs["Strength"].default_value = 1.0

    coord = nt.nodes.new("ShaderNodeTexCoord")
    sub = nt.nodes.new("ShaderNodeVectorMath")
    sub.operation = 'SUBTRACT'
    sub.inputs[1].default_value = (0.5, 0.5, 0.5)
    scale = nt.nodes.new("ShaderNodeVectorMath")
    scale.operation = 'SCALE'
    scale.inputs["Scale"].default_value = 2.0
    # **세 번째 축을 반드시 죽인다.** 판은 두께가 0 이라 남겨 두면 그 축의 좌표가
    # 상수 -1 로 들어가 구형 거리가 어디서나 1 을 넘고, 알파가 전부 0 이 된다
    flat = nt.nodes.new("ShaderNodeVectorMath")
    flat.operation = 'MULTIPLY'
    flat.inputs[1].default_value = (1.0, 1.0, 0.0)
    grad = nt.nodes.new("ShaderNodeTexGradient")
    grad.gradient_type = 'SPHERICAL'
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = 'POWER'
    pw.inputs[1].default_value = 2.4       # 가장자리를 빠르게 0 으로

    # **양(amount) 을 알파에 곱한다.** 발광 강도만 0 으로 내리면 검은 판이 알파를 남겨
    # 일반 블렌드에서 배경을 깎는다 — 반드시 알파 자체가 0 이 돼야 한다
    amt = nt.nodes.new("ShaderNodeMath")
    amt.name = "AMT"
    amt.operation = 'MULTIPLY'
    amt.inputs[1].default_value = 1.0

    nt.links.new(coord.outputs["UV"], sub.inputs[0])
    nt.links.new(sub.outputs["Vector"], scale.inputs[0])
    nt.links.new(scale.outputs["Vector"], flat.inputs[0])
    nt.links.new(flat.outputs["Vector"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], pw.inputs[0])
    nt.links.new(pw.outputs["Value"], amt.inputs[0])
    nt.links.new(amt.outputs["Value"], mix.inputs["Fac"])
    nt.links.new(tr.outputs["BSDF"], mix.inputs[1])
    nt.links.new(em.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def stone_mat(name: str, color, rough: float) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.55
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.25
        bsdf.inputs["Coat Roughness"].default_value = 0.20
    return mat


def add_box(name: str, half: float, mat, bevel: float = 0.0) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=half * 2.0, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    if bevel > 0.0:
        m = ob.modifiers.new("bevel", 'BEVEL')
        m.width = bevel
        m.segments = 2
        m.limit_method = 'ANGLE'
    return ob


def add_plane(name: str, mat) -> bpy.types.Object:
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    # 카메라는 **자기 로컬 -Z** 를 본다. 화면을 정면으로 보는 판은 로컬 XY 평면에 있어야 한다
    # (XZ 로 눕히면 카메라에 대해 모서리로 서서 아무것도 안 보인다)
    return ob


# ─────────────────────────────────────────────────────────────────────────────
# 조각
# ─────────────────────────────────────────────────────────────────────────────

def build_cubies(mat_ivory, mat_black) -> list[dict]:
    """3×3×3 에서 가운데를 뺀 **26개**. 한 칸이 통째로 흑 또는 아이보리다.

    면을 3×3 으로 쪼갠 '타일'이 아니라 실제 정육면체라서 측면이 보이고,
    칸과 칸 사이에 진짜 틈이 생긴다. 이전 판이 '얇은 체크 타일'로 보인 이유가 여기다.
    """
    rng = random.Random(7)
    out = []
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            for k in (-1, 0, 1):
                if i == j == k == 0:
                    continue                       # 가운데는 안 보인다. 그 자리는 발광체가 쓴다
                home = Vector((i * PITCH, j * PITCH, k * PITCH))
                n = home.normalized()
                mat = mat_ivory if (i + j + k) % 2 == 0 else mat_black
                ob = add_box(f"cubie_{i}{j}{k}", CUBIE_H, mat, BEVEL)
                out.append({
                    "ob": ob,
                    "home": home,
                    "dir": n,
                    # 밖에서 빨려 들어온다. 너무 멀리 두면 `edge_fade` 때문에 이동의 대부분이
                    # 보이지 않는 곳에서 끝나고, 조각이 제자리 근처에서 '튀어나오는' 것처럼 보인다.
                    # 프레임 반폭(1.50)의 바로 바깥에서 출발해 **들어오는 길이 보이게** 한다
                    "start": n * rng.uniform(1.32, 2.15) + Vector((
                        rng.uniform(-0.30, 0.30), rng.uniform(-0.30, 0.30), rng.uniform(-0.30, 0.30))),
                    "start_rot": Euler((rng.uniform(-3, 3), rng.uniform(-3, 3), rng.uniform(-3, 3))),
                    "delay": rng.uniform(0.0, 120.0),      # 한 박자로 모이면 기계처럼 보인다
                    "speed": rng.uniform(0.72, 1.18),      # 폭발 시 거리 배수
                    "spin": Vector((rng.uniform(-7, 7), rng.uniform(-7, 7), rng.uniform(-7, 7))),
                })
    return out


def build_flare(mat_glow, mat_ray) -> list[dict]:
    """기준 이미지 04 의 별빛. 카메라 정면을 보는 판 여러 장이다.

    긴 가로/세로 광선 2장 + 대각 4장 + 가운데 둥근 발광. 축을 눌러 늘린 감쇠 원이
    그대로 광선이 된다. 작은 크기(180px)에서 가장 잘 읽히는 요소라 크게 잡는다.
    """
    #        이름      각도            길이   두께    광선?
    specs = [
        ("core",  0.0,            0.58,  0.58,  False),
        ("halo",  0.0,            1.35,  1.35,  False),
        ("ray_h", 0.0,            2.30,  0.058, True),
        ("ray_v", math.pi / 2,    2.00,  0.050, True),
        ("ray_d1", math.pi / 4,   1.30,  0.032, True),
        ("ray_d2", -math.pi / 4,  1.30,  0.032, True),
    ]
    out = []
    for name, roll, sx, sz, is_ray in specs:
        ob = add_plane(f"flare_{name}", mat_ray if is_ray else mat_glow)
        out.append({"ob": ob, "roll": roll, "sx": sx, "sz": sz})
    return out


# ─────────────────────────────────────────────────────────────────────────────
# 상태 — 시각(ms) 하나로 전부 결정된다
# ─────────────────────────────────────────────────────────────────────────────

def cube_yaw(t: float) -> float:
    """모을 땐 고정, 충전에서 가속, 압축에서 멈춘다."""
    t = min(t, T.HOLD_FROM_MS)
    if t <= 700.0:
        return 0.0          # 결합 순간은 모서리가 정면인 정자세여야 3×3 이 읽힌다
    return 2.60 * ease_io(span(t, 700.0, 1100.0))


def cube_scale(t: float) -> float:
    """**커지지 않고 작아지면서 밝아지는 게 압축이다.**"""
    t = min(t, T.HOLD_FROM_MS)
    if t < 700.0:
        return 1.0
    if t < 1100.0:
        return lerp(1.0, 0.86, ease_io(span(t, 700.0, 1100.0)))
    return lerp(0.86, 0.78, ease_in(span(t, 1100.0, T.HOLD_FROM_MS)))


def cube_jitter(t: float) -> Vector:
    """난수가 아니라 **주파수가 올라가는 사인 합**이다.

    프레임마다 난수를 새로 뽑으면 시간 방향으로 이어지지 않아 떨림이 아니라 노이즈가 된다
    (이전 판 `Random(1000 + i)` 의 실수).
    """
    th = min(t, T.HOLD_FROM_MS)
    amp = 0.055 * span(th, 720.0, T.HOLD_FROM_MS) ** 1.6
    f = 0.045 + 0.055 * span(th, 720.0, T.HOLD_FROM_MS)
    return Vector((
        amp * (math.sin(th * f) + 0.6 * math.sin(th * f * 2.7 + 1.1)),
        0.0,
        amp * (math.cos(th * f * 1.3 + 0.4) + 0.6 * math.sin(th * f * 3.1)),
    ))


def core_strength(t: float) -> float:
    """**금색을 금색으로 남기는 게 이 함수의 전부다.**

    톤매핑을 끈(Standard) 렌더라 1.0 을 넘는 채널은 그대로 잘린다. 금색(1, 0.66, 0.30)에
    강도 3 을 주면 세 채널이 모두 1 을 넘어 **흰 격자**가 된다 — 첫 시험 렌더가 그랬다.
    그래서 평상시는 1~2.6 에 묶어 두고, 정말 흰색이어야 하는 결합 섬광 한 프레임만 터뜨린다.
    """
    if t < T.GATHER_MS:                                  # 모이는 동안은 아주 약하게
        return 0.55 * span(t, 300.0, T.GATHER_MS) ** 2
    if t < T.GATHER_MS + T.ms(0.5):                      # 결합 섬광 — **정확히 1프레임**
        # 부등식을 ms(1) 로 잡으면 부동소수 때문에 두 프레임이 걸린다. 반 프레임으로 끊는다
        return 8.0                                       # 화면을 채우는 흰 섬광은 코드 레이어다(§3)

    if t < 700.0:
        return 1.10
    if t < 1100.0:
        return lerp(1.10, 2.10, ease_in(span(t, 700.0, 1100.0)))
    if t <= T.BURST_MS:
        return lerp(2.10, 3.20, span(t, 1100.0, T.HOLD_FROM_MS))
    u = span(t, T.BURST_MS, T.TOTAL_MS)
    return 3.20 * (1.0 - ease_out(u)) ** 1.2             # 파열 뒤엔 빠르게 꺼진다


def burst_ball_scale(t: float) -> float:
    if t <= T.BURST_MS:
        return 0.0
    u = span(t, T.BURST_MS, T.BURST_MS + 470.0)
    return 0.25 + 1.55 * ease_out(u)


def core_scale(t: float) -> float:
    """안쪽 발광체는 **불투명**이다.

    빛이 약한 동안 켜 두면 조각이 아직 밖에 있을 때 어두운 육각형 덩어리가 그대로
    보인다(첫 시험 렌더가 그랬다). 조각이 거의 다 들어온 뒤에야 켠다.
    """
    if t > T.BURST_MS:
        return 0.001            # 파열하면 껍질이 흩어지므로 안쪽 발광체는 즉시 끈다
    return max(0.001, span(t, 555.0, T.GATHER_MS))


def burst_ball_strength(t: float) -> float:
    """0~1 의 양. 알파에 곱해지므로 0 이면 완전히 사라진다."""
    if t <= T.BURST_MS:
        return 0.0
    u = span(t, T.BURST_MS, T.BURST_MS + 470.0)
    return (1.0 - u) ** 2.6


def halo_amount(t: float) -> float:
    """충전하며 차오르는 금빛 후광. 섬광 한 프레임에 한 번 튄다."""
    if t < T.GATHER_MS:
        return 0.0
    if t < T.GATHER_MS + T.ms(1):
        return 1.0
    if t <= T.BURST_MS:
        return 0.16 + 0.74 * ease_in(span(t, 700.0, T.HOLD_FROM_MS))
    return 0.90 * (1.0 - ease_out(span(t, T.BURST_MS, T.BURST_MS + 260.0)))


def flare_amount(t: float) -> float:
    """**2프레임에 최대.** 중간 속도를 보여주지 않는 게 타격감이다."""
    if t <= T.BURST_MS:
        return 0.0
    up = span(t, T.BURST_MS, T.BURST_MS + T.ms(1.6))
    down = span(t, T.BURST_MS + T.ms(2.4), T.BURST_MS + 320.0)
    return up * (1.0 - ease_out(down))


def cubie_state(c: dict, t: float, half_in: float, half_out: float) -> tuple[Vector, Euler, float]:
    """(로컬 위치, 회전, 스케일). 부모 엠프티가 전체 자세·수축·떨림을 맡는다.

    프레임 밖으로 나가는 조각은 `edge_fade` 로 **프레임 안에서** 0 이 된다.
    잘린 채 사라지면 스프라이트 경계에 직선 자국이 남는다.
    """
    if t <= T.BURST_MS:
        a = T.ms(T.F_COALESCE[0]) + c["delay"]
        u = ease_out(span(t, a, T.GATHER_MS))
        pos = c["start"].lerp(c["home"], u)
        rot = Euler(tuple(r * (1.0 - u) for r in c["start_rot"]))
        return pos, rot, max(edge_fade(pos.length, half_in, EDGE_FADE_IN), 0.001)

    u = span(t, T.BURST_MS, T.TOTAL_MS)
    d = BLAST_REACH * c["speed"] * (1.0 - (1.0 - u) ** 6)    # 절반 거리를 첫 100ms 에 간다
    pos = c["home"] + c["dir"] * d
    rot = Euler(tuple(s * u * 1.5 for s in c["spin"]))
    # 날아가면서 작아진다 — 큰 덩어리가 그대로 흩어지면 섬광을 가리고 화면만 지저분해진다
    shrink = 1.0 - 0.46 * ease_out(span(t, T.BURST_MS, T.BURST_MS + 210.0))
    sc = shrink * (1.0 - ease_in(span(t, T.BURST_MS + 470.0, T.TOTAL_MS)))
    return pos, rot, max(min(sc, edge_fade(pos.length, half_out)), 0.001)


# ─────────────────────────────────────────────────────────────────────────────
# 키프레임
# ─────────────────────────────────────────────────────────────────────────────

def key(ob, frame: int, loc=None, rot=None, scale=None) -> None:
    if loc is not None:
        ob.location = loc
        ob.keyframe_insert("location", frame=frame)
    if rot is not None:
        ob.rotation_euler = rot
        ob.keyframe_insert("rotation_euler", frame=frame)
    if scale is not None:
        ob.scale = scale if hasattr(scale, "__len__") else (scale, scale, scale)
        ob.keyframe_insert("scale", frame=frame)


def key_value(socket, frame: int, value) -> None:
    """노드 소켓 값에 키를 박는다 (발광 강도)."""
    socket.default_value = value
    socket.keyframe_insert("default_value", frame=frame)


def linearize_all() -> None:
    for act in bpy.data.actions:
        fcurves = []
        if hasattr(act, "layers") and len(act.layers):
            for layer in act.layers:
                for strip in layer.strips:
                    for cb in strip.channelbags:
                        fcurves.extend(cb.fcurves)
        else:
            fcurves = list(act.fcurves)
        for fc in fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'


# ─────────────────────────────────────────────────────────────────────────────
# 조립
# ─────────────────────────────────────────────────────────────────────────────

def build(frame_px: int, scale_sensor: bool) -> dict:
    reset_scene()
    scene = bpy.context.scene

    mat_ivory = stone_mat("ivory", IVORY, 0.38)
    mat_black = stone_mat("black", BLACK, 0.26)
    mat_core = emissive_mat("core", GOLD, 1.0)
    mat_ball = soft_flare_mat("ball", FLARE_GLOW)
    mat_flare = soft_flare_mat("flare", FLARE_GLOW)
    # 광선은 따로 관리한다 — 가운데 빛 덩어리와 같은 밝기로 두면 묻혀서
    # 별빛이 아니라 흰 얼룩이 된다 (기준 이미지 04 에서 가장 먼저 읽히는 게 광선이다)
    mat_ray = soft_flare_mat("flare_ray", FLARE_RAY)
    # 결합 섬광 — **틈의 빛만으로는 안 된다.** 강도를 올리면 이음새가 흰색으로 잘리는데
    # 아이보리 칸도 흰색이라 서로 묻혀 아무 일도 안 일어난 것처럼 보인다(시험 렌더에서 확인).
    # 칸 위에 얹히는 빛 덩어리가 한 프레임 있어야 '바뀌었다'가 읽힌다
    mat_lock = soft_flare_mat("lock", HOT)

    pivot = bpy.data.objects.new("pivot", None)
    scene.collection.objects.link(pivot)

    cubies = build_cubies(mat_ivory, mat_black)
    for c in cubies:
        c["ob"].parent = pivot

    core = add_box("core", CORE_H, mat_core)
    core.parent = pivot

    # 파열 순간의 빛 덩어리. 구가 아니라 **화면을 보는 감쇠 판**이다 —
    # 불투명 구를 쓰면 빛이 꺼진 뒤 검은 공이 남는다
    ball = add_plane("burst_ball", mat_ball)

    # 충전 헤일로 — 기준 이미지 03 의 큐브를 감싼 금빛. **가산 코어 시트에만** 들어간다
    # (본체 시트에 구우면 일반 블렌드로 배경을 덮는다). §5.3 에서 이 시트를 빼면 같이 빠진다
    mat_halo = soft_flare_mat("halo", GOLD)
    halo = add_plane("charge_halo", mat_halo)

    lock = add_plane("lock_flash", mat_lock)

    flare_parts = build_flare(mat_flare, mat_ray)
    flare_root = bpy.data.objects.new("flare_root", None)
    scene.collection.objects.link(flare_root)
    for p in flare_parts:
        p["ob"].parent = flare_root
    halo.parent = flare_root
    ball.parent = flare_root
    lock.parent = flare_root

    # 카메라 — 기준 이미지처럼 모서리가 정면으로 오는 3/4 각
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = CAM_LENS
    cam_data.sensor_fit = 'HORIZONTAL'
    cam_data.sensor_width = BASE_SENSOR * (frame_px / T.FORGE_PX if scale_sensor else 1.0)
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = CAM_DIR * CAM_DIST
    track = cam.constraints.new('TRACK_TO')
    track.target = pivot
    track.track_axis = 'TRACK_NEGATIVE_Z'
    track.up_axis = 'UP_Y'
    scene.camera = cam
    bpy.context.view_layer.update()
    flare_root.rotation_euler = cam.matrix_world.to_euler()   # 판이 화면을 정면으로 본다
    # **섬광은 파편 앞에 있어야 한다.** 원점에 두면 날아가는 조각들이 별빛을 가려
    # 빛이 조각 사이로 새는 얼룩이 된다. 카메라 쪽으로 당기고 그만큼 줄여
    # 화면에서의 크기는 그대로 유지한다
    flare_root.location = CAM_DIR * FLARE_LIFT
    k = (CAM_DIST - FLARE_LIFT) / CAM_DIST
    flare_root.scale = (k, k, k)
    halo.rotation_euler = Euler((0, 0, 0))                    # 부모가 이미 화면을 본다
    ball.rotation_euler = Euler((0, 0, 0))
    lock.rotation_euler = Euler((0, 0, 0))
    lock.scale = (1.55, 1.55, 1.0)

    # 조명 — 빛의 대부분은 큐브 자신이 낸다. 램프는 형태를 읽게 하는 역할이다
    def lamp(name, loc, energy, color, size):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = energy
        ld.color = color
        ld.size = size
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        scene.collection.objects.link(ob)
        c = ob.constraints.new('TRACK_TO')
        c.target = pivot
        c.track_axis = 'TRACK_NEGATIVE_Z'
        return ob

    lamp("key", (-4.2, -4.6, 5.2), KEY_E, (1.0, 0.94, 0.86), 5.0)
    # 림이 셀 수록 어두운 배경에서 검은 칸이 배경에 안 붙는다 — 실루엣이 먼저다
    lamp("rim", (5.0, 4.4, -1.8), RIM_E, (1.0, 0.76, 0.46), 6.0)
    lamp("fill", (4.6, -3.2, -3.0), FILL_E, (0.72, 0.80, 1.0), 7.0)

    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.04, 0.035, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.11
    scene.world = world

    return {"scene": scene, "pivot": pivot, "cubies": cubies, "core": core,
            "ball": ball, "flare_root": flare_root, "flare": flare_parts, "halo": halo,
            "mat_core": mat_core, "mat_ball": mat_ball, "mat_flare": mat_flare,
            "mat_halo": mat_halo, "mat_ray": mat_ray, "mat_lock": mat_lock, "lock": lock}


def animate(S: dict) -> None:
    pivot, cubies, core, ball = S["pivot"], S["cubies"], S["core"], S["ball"]
    half_in = half_world(T.FORGE_PX, True)      # 모이는 구간은 forge 프레임 안에서 벌어진다
    half_out = half_world(T.BLAST_PX, True)     # 파열은 blast 프레임 안에서 끝나야 한다
    em_core = S["mat_core"].node_tree.nodes["Emission"].inputs["Strength"]
    em_ball = S["mat_ball"].node_tree.nodes["Emission"].inputs["Strength"]
    amt_ball = S["mat_ball"].node_tree.nodes["AMT"].inputs[1]
    amt_halo = S["mat_halo"].node_tree.nodes["AMT"].inputs[1]
    amt_flare = S["mat_flare"].node_tree.nodes["AMT"].inputs[1]
    em_ray = S["mat_ray"].node_tree.nodes["Emission"].inputs["Strength"]
    em_lock = S["mat_lock"].node_tree.nodes["Emission"].inputs["Strength"]
    amt_lock = S["mat_lock"].node_tree.nodes["AMT"].inputs[1]
    amt_ray = S["mat_ray"].node_tree.nodes["AMT"].inputs[1]
    em_flare = S["mat_flare"].node_tree.nodes["Emission"].inputs["Strength"]
    em_halo = S["mat_halo"].node_tree.nodes["Emission"].inputs["Strength"]

    total = T.FORGE_FRAMES + T.BLAST_FRAMES
    for n in range(1, total + 1):
        t = T.frame_to_ms(n)

        # 파열 뒤엔 큐브 전체 변형을 풀어 둔다 — 조각이 각자 날아간다
        # 파열 뒤에도 **직전 자세를 그대로 붙들어 둔다** — 조각이 각자 날아가는 동안
        # 부모가 움직이면 blast 0프레임이 forge 마지막 프레임과 달라져 이음새가 튄다
        th = min(t, T.BURST_MS)
        key(pivot, n, loc=cube_jitter(th), rot=Euler((0.0, 0.0, cube_yaw(th))),
            scale=cube_scale(th))

        for c in cubies:
            loc, rot, sc = cubie_state(c, t, half_in, half_out)
            key(c["ob"], n, loc=loc, rot=rot, scale=sc)

        key(core, n, scale=core_scale(t))
        key_value(em_core, n, core_strength(t))

        bs = burst_ball_scale(t)
        key(ball, n, scale=(max(bs, 0.001), max(bs, 0.001), 1.0))
        key_value(em_ball, n, 12.0)
        key_value(amt_ball, n, burst_ball_strength(t))

        la = 1.0 if T.GATHER_MS <= t < T.GATHER_MS + T.ms(0.5) else 0.0
        key_value(em_lock, n, 16.0)
        key_value(amt_lock, n, la)

        ha = halo_amount(t)
        key_value(em_halo, n, 3.4)
        key_value(amt_halo, n, ha)
        hs = 1.0 + 0.55 * ha
        key(S["halo"], n, scale=(hs, hs, 1.0))

        fa = flare_amount(t)
        key_value(em_flare, n, 5.0)
        key_value(amt_flare, n, fa)
        key_value(em_ray, n, 22.0)
        key_value(amt_ray, n, fa)
        for p in S["flare"]:
            g = fa ** 0.6
            key(p["ob"], n,
                rot=Euler((0.0, 0.0, p["roll"])),
                scale=(p["sx"] * g * 1.15, p["sz"] * (0.35 + 0.65 * g), 1.0))

    linearize_all()


def configure_render(scene, frame_px: int, motion_blur: bool) -> None:
    ids = [i.identifier for i in type(scene.render).bl_rna.properties['engine'].enum_items]
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in ids else 'BLENDER_EEVEE'

    px = frame_px * T.SS                     # 축소가 곧 안티에일리어싱이다
    scene.render.resolution_x = px
    scene.render.resolution_y = px
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True     # 알파 없으면 시트로 못 쓴다
    scene.render.fps = T.FPS

    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'

    # **AgX 는 금색을 탈색시키고 섬광을 눌러 버린다.** 시트는 톤매핑하지 않은 그림이어야
    # 게임 안에서 예상대로 보인다
    try:
        scene.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    ee = scene.eevee
    ee.taa_render_samples = 64
    for attr, val in (("use_shadows", True), ("use_raytracing", True), ("use_fast_gi", True),
                      ("shadow_ray_count", 2), ("shadow_step_count", 8)):
        if hasattr(ee, attr):
            setattr(ee, attr, val)

    # 모임·충전에 걸면 칸이 뭉개져 체크가 사라진다. **파열 패스에서만** 켠다
    scene.render.use_motion_blur = motion_blur
    if motion_blur:
        scene.render.motion_blur_shutter = 0.5
        if hasattr(ee, "motion_blur_steps"):
            ee.motion_blur_steps = 2


def render_range(scene, a: int, b: int, out_dir: Path) -> None:
    # 블렌더는 상대 경로를 blend 파일 기준으로 잡는다 — 파일이 없으면 드라이브 루트로 샌다
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.frame_start = a
    scene.frame_end = b
    scene.render.filepath = str(out_dir / "f")
    bpy.ops.render.render(animation=True)


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--pass", dest="pas", choices=("body", "core"), required=True)
    ap.add_argument("--phase", choices=("forge", "blast"), required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", default="", help="디버그용 부분 렌더 (예: 18,19,36)")
    a = ap.parse_args(argv)

    if a.pas == "core" and a.phase == "blast":
        print("core 패스는 forge 구간만 굽는다 (파열의 빛은 코드 파티클이 낸다)")
        return 1

    if a.pas == "core":
        frame_px, scale_sensor = T.CORE_PX, False   # forge 와 같은 월드 범위, 절반 해상도
        rng = T.BLENDER_CORE
    elif a.phase == "forge":
        frame_px, scale_sensor = T.FORGE_PX, True
        rng = T.BLENDER_FORGE
    else:
        frame_px, scale_sensor = T.BLAST_PX, True
        rng = T.BLENDER_BLAST

    S = build(frame_px, scale_sensor)
    animate(S)
    if a.pas == "body":
        S["halo"].hide_render = True
    configure_render(S["scene"], frame_px, motion_blur=(a.phase == "blast" and a.pas == "body"))

    if a.pas == "core":
        # 칸은 그리지 않되 **가리기는 한다** — 그래야 빛이 틈에만 남는다
        for c in S["cubies"]:
            c["ob"].is_holdout = True
        S["ball"].hide_render = True
        S["core"].hide_render = False
        for p in S["flare"]:
            p["ob"].hide_render = True
        for ob in S["scene"].objects:
            if ob.type == 'LIGHT':
                ob.data.energy = 0.0
        S["scene"].world.node_tree.nodes["Background"].inputs[1].default_value = 0.0

    out = Path(a.out)
    if a.frames:
        for n in (int(x) for x in a.frames.split(",")):
            render_range(S["scene"], n, n, out)
    else:
        render_range(S["scene"], rng[0], rng[1], out)

    print(f"[render] pass={a.pas} phase={a.phase} frames={rng} {frame_px}px×{T.SS} → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
