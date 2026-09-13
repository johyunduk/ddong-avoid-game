#!/usr/bin/env python3
r"""FX 시트 후보를 **실제 게임 표시 크기**로 기존 화면 위에 얹어 한 장으로 비교한다.

    C:\ComfyUI\.venv\Scripts\python.exe scripts/fx-compare.py --help

## 왜 필요한가

새 이펙트는 렌더 프로그램 안에서는 늘 근사해 보인다. 판단해야 하는 것은 그게 아니라
**플레이어 50×80 옆에 놓였을 때, 게임 배경 위에서, 기존 이펙트들과 나란히 봤을 때** 어떤가다.
그래서 이 스크립트는 수치를 추측하지 않고 저장소 코드에서 실측한 값만 쓴다 (아래 표).

## 실측 출처 (2026-09-11)

| 값 | 출처 |
|---|---|
| 플레이어 50×80 (테드는 개별 지정 없음 → 기본값) | `src/scenes/GameScene.ts:352` `playerDisplaySize ?? [50, 80]` |
| 플레이어 중심 y = H − 80 | `src/scenes/GameScene.ts:360` `new Player(this, cx, H - 80, ...)` |
| 배경은 화면에 **늘려서** 채운다 | `src/scenes/GameScene.ts:313` `setDisplaySize(W, H)` |
| 표시 배율 = `defaultScale × opts.scale` | `src/utils/vfx.ts:874` |
| 여우불 화면 폭 28px, 반경 55 링 9개 | `GumiAbility.ts:37,499` |
| 연꽃 136px (192 프레임 × 136/192) | `MugiAbility.ts:42` `LOTUS_SIZE` |
| legacyBurn 192 × 0.62 → 1.15 (최대 221px) | `LegacyAbility.ts:417` |
| K 에너지파 길이 780 · 두께 96 | `KAbility.ts:20,56` |

시트별 표시 배율은 **코드에서 직접 읽는다** — `@<fxKey>*<PARAMS>.<키>` 로 주면
파일명·프레임 수·`defaultScale` 은 `vfx.ts` 의 FX_SHEETS 에서, 곱하는 호출부 배율은
`abilityParams.ts` 에서 가져온다. 손으로 옮겨 적으면 코드가 바뀔 때 비교표가 조용히
틀려진다 (`chessCubeScale` 이 0.95 → 1.0 으로 바뀐 적이 있다). 아직 등록되지 않은
후보 파일만 `<경로>@<배율>` 로 준다.

파일명 `_WxH.png` 에서 프레임 크기를 읽는 것은 `vfx.ts` 의 `parseFrameSize` 와 같은 규칙이라,
시트가 게임에 들어갈 수 있는 이름인지도 같이 걸러진다.

## 두 가지 모드

**`--sheet`** — 시트 한 장을 그 자체로 훑는다.

    --sheet <경로>,scale=<배율>[,label=이름][,frames=N][,fps=30][,blend=add]

**`--stage`** — 시트 여러 장이 **한 연출**을 이룰 때. 시간순으로 이어 붙인 뒤
**진행도(0~100%)** 로 뽑는다. 프레임 수가 다른 후보를 비교하려면 이쪽이어야 한다 —
프레임 번호를 그대로 나열하면 40프레임짜리와 8프레임짜리는 비교가 되지 않는다.

    --stage "label=이름,fps=30,main=@<fxKey>*<PARAMS>.<키>,main=...,add=@<fxKey>*...:at=<전역프레임>"
    --stage "label=이름,fps=30,main=<경로>@<배율>[:frames=N]"        # 코드 미등록 후보

`main` 은 여러 번 줄 수 있고 준 순서대로 이어진다. `add` 는 그 위에 가산으로 얹히는
보조 레이어이며 `at` 은 전역 타임라인에서 그 시트의 0프레임이 놓이는 자리다.
`--stage` 를 주는 만큼 열이 늘어난다 — 개수 제한은 없다.

## 배경

`--bg` 를 여러 번 주면 배경마다 표가 한 벌씩 더 붙는다. 밝은 것과 어두운 것을 둘 다 보는
이유는 가산 합성이 밝은 배경에서 사라지기 때문이다 (설계 문서 §3). `backgrounds/` 를 먼저
찾고 없으면 `wallpapers/` 를 본다 (`wallpaper.ts` 의 `bgPath` 와 같은 자리).
"""
from __future__ import annotations

import argparse
import math
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat
except ModuleNotFoundError:
    sys.exit("Pillow 가 없다. C:\\ComfyUI\\.venv\\Scripts\\python.exe 로 실행해라")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public" / "assets"

# ── 게임 기준 좌표계 (실측) ─────────────────────────────────────────────────
GAME_W, GAME_H = 430, 932      # 세로 모드 기준 화면. RESIZE 라 기기마다 다르다 → --game 으로 바꾼다
PLAYER_W, PLAYER_H = 50, 80    # GameScene.ts:352 기본값 (테드는 개별 지정 없음)
PLAYER_FOOT_GAP = 40           # 발밑 여백 = chessGroundY. 중심 y = H - 80
FRAME_RE = re.compile(r"_(\d+)x(\d+)\.png$", re.IGNORECASE)

# ── 셀 = 게임 화면을 1:1 픽셀로 오려낸 창 ────────────────────────────────────
CELL_W, CELL_H = 300, 360
CELL_ABOVE = 230               # 셀 위쪽에서 플레이어 중심까지
GAP = 12
MARGIN = 24
BG_PANEL = (22, 24, 30)
FG = (238, 240, 245)
DIM = (150, 156, 168)
ACCENT = (255, 201, 92)

FONT_PATH = Path("C:/Windows/Fonts/malgun.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/malgunbd.ttf")


def font(size: int, bold: bool = False):
    p = FONT_BOLD if bold else FONT_PATH
    try:
        return ImageFont.truetype(str(p), size)
    except OSError:
        return ImageFont.load_default()


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p)


# ── 시트 ────────────────────────────────────────────────────────────────────
class Sheet:
    """아틀라스 한 장 + 게임에서의 표시 배율."""

    def __init__(self, path: Path, scale: float, frames: int | None, blend: str):
        m = FRAME_RE.search(path.name)
        if not m:
            raise SystemExit(
                f"{path.name}: 프레임 크기를 읽을 수 없다. "
                "vfx.ts 가 읽는 것과 같은 `_WxH.png` 이름이어야 한다"
            )
        self.path = path
        self.scale = scale
        self.blend = blend
        self.scale_src = "직접 지정"      # 배율을 어디서 얻었는지 (--stage 가 채운다)
        self.fw, self.fh = int(m.group(1)), int(m.group(2))
        self.img = Image.open(path).convert("RGBA")
        if self.img.width % self.fw or self.img.height % self.fh:
            raise SystemExit(
                f"{path.name}: {self.img.width}x{self.img.height} 가 "
                f"프레임 {self.fw}x{self.fh} 로 나누어떨어지지 않는다"
            )
        self.cols = self.img.width // self.fw
        self.rows = self.img.height // self.fh
        self.frames = frames if frames is not None else self.cols * self.rows
        if self.frames > self.cols * self.rows:
            raise SystemExit(f"{path.name}: frames={self.frames} 인데 격자는 {self.cols*self.rows} 칸뿐이다")

    @property
    def display(self) -> tuple[int, int]:
        return (round(self.fw * self.scale), round(self.fh * self.scale))

    def frame(self, i: int) -> Image.Image:
        """i 번 프레임을 **게임 표시 크기로 축소해** 돌려준다."""
        cx, cy = i % self.cols, i // self.cols
        raw = self.img.crop((cx * self.fw, cy * self.fh, (cx + 1) * self.fw, (cy + 1) * self.fh))
        return raw if raw.size == self.display else raw.resize(self.display, Image.LANCZOS)

    def vram_mb(self) -> float:
        return self.img.width * self.img.height * 4 / (1024 * 1024)


# ── 코드에서 값을 직접 읽는다 ────────────────────────────────────────────────
# 등록된 FX 는 파일명·프레임 수·표시 배율이 전부 저장소 안에 있다. 그걸 손으로 옮겨 적으면
# 코드가 바뀔 때마다 비교표가 조용히 틀려진다 (chessCubeScale 이 0.95 → 1.0 으로 바뀐 적이 있다).
VFX_TS = ROOT / "src" / "utils" / "vfx.ts"
PARAMS_TS = ROOT / "src" / "config" / "abilityParams.ts"
FX_SHEET_DIR = ASSETS / "fx" / "sheets"


def fx_from_code(fx_key: str) -> tuple[Path, int, float]:
    """`vfx.ts` 의 FX_SHEETS 에서 (파일, 프레임 수, defaultScale) 을 읽는다."""
    src = VFX_TS.read_text(encoding="utf-8")
    m = re.search(
        rf"fxKey:\s*'{re.escape(fx_key)}'\s*,\s*file:\s*'([^']+)'\s*,\s*"
        rf"frameCount:\s*(\d+)\s*,\s*frameRate:\s*[\d.]+\s*,\s*defaultScale:\s*([\d.]+)",
        src)
    if not m:
        raise SystemExit(f"vfx.ts 의 FX_SHEETS 에서 '{fx_key}' 를 못 찾았다")
    return FX_SHEET_DIR / m.group(1), int(m.group(2)), float(m.group(3))


def param_from_code(dotted: str) -> float:
    """`TED_PARAMS.chessCubeScale` 같은 표기를 `abilityParams.ts` 에서 읽는다."""
    if "." not in dotted:
        raise SystemExit(f"'{dotted}' 는 <PARAMS>.<키> 형식이어야 한다")
    obj, key = dotted.split(".", 1)
    src = PARAMS_TS.read_text(encoding="utf-8")
    block = re.search(rf"export const {re.escape(obj)}\s*=\s*\{{(.*?)\n\}}", src, re.S)
    if not block:
        raise SystemExit(f"abilityParams.ts 에서 {obj} 를 못 찾았다")
    m = re.search(rf"\b{re.escape(key)}\s*:\s*([\d.]+)", block.group(1))
    if not m:
        raise SystemExit(f"{obj} 안에서 '{key}' 를 못 찾았다")
    return float(m.group(1))


def _load_scaled(token: str, what: str, blend: str) -> tuple[Sheet, dict[str, str]]:
    """시트 하나를 읽는다. 두 가지 표기를 받는다.

    `@<fxKey>[*<PARAMS>.<키>]`  — **코드에서 읽는다.** 파일·프레임 수·`defaultScale` 은
        `vfx.ts` 의 FX_SHEETS 에서, 곱하는 호출부 배율은 `abilityParams.ts` 에서 온다.
        등록된 FX 는 항상 이쪽을 써라 — 값을 옮겨 적을 일이 없어진다.
    `<경로>@<배율>`             — 아직 코드에 등록되지 않은 후보 파일용.
    """
    bits = token.split(":")
    head, opts = bits[0], {}
    for b in bits[1:]:
        if "=" not in b:
            raise SystemExit(f"{what}: '{b}' 는 key=value 가 아니다")
        k, v = b.split("=", 1)
        opts[k.strip()] = v.strip()

    if head.startswith("@"):
        expr = head[1:]
        fx_key, _, param = expr.partition("*")
        path, frames, scale = fx_from_code(fx_key.strip())
        src = f"vfx.ts defaultScale {scale:g}"
        if param:
            mul = param_from_code(param.strip())
            scale *= mul
            src += f" × {param.strip()} {mul:g}"
        if not path.exists():
            raise SystemExit(f"vfx.ts 는 '{path.name}' 를 가리키는데 파일이 없다: {path}")
        sheet = Sheet(path, scale, int(opts.get("frames", frames)), blend)
        sheet.scale_src = src
        return sheet, opts

    if "@" not in head:
        raise SystemExit(f"{what}: 표시 배율이 없다 — '경로@배율' 또는 '@<fxKey>' 로 줘라")
    ps, ss = head.rsplit("@", 1)
    p = Path(ps)
    path = p if p.is_absolute() else ROOT / p
    if not path.exists():
        raise SystemExit(f"시트가 없다: {path}")
    sheet = Sheet(path, float(ss), int(opts["frames"]) if "frames" in opts else None, blend)
    sheet.scale_src = "직접 지정 (코드 미등록)"
    return sheet, opts


# ── 스테이지 = 시트 여러 장이 이루는 하나의 연출 ─────────────────────────────
class Stage:
    def __init__(self, label: str, fps: float, mains: list[Sheet], adds: list[tuple[Sheet, int]]):
        if not mains:
            raise SystemExit(f"'{label}': main= 시트가 최소 하나는 있어야 한다")
        self.label = label
        self.fps = fps
        self.mains = mains
        self.adds = adds
        self.total = sum(s.frames for s in mains)

    def locate(self, gi: int) -> tuple[Sheet, int]:
        """전역 프레임 번호 → (시트, 그 시트 안의 프레임 번호)"""
        for s in self.mains:
            if gi < s.frames:
                return s, gi
            gi -= s.frames
        return self.mains[-1], self.mains[-1].frames - 1

    def sheets(self) -> list[Sheet]:
        return [*self.mains, *(s for s, _ in self.adds)]

    def vram_mb(self) -> float:
        return sum(s.vram_mb() for s in self.sheets())


def parse_stage(spec: str) -> Stage:
    label, fps = "stage", 30.0
    mains: list[Sheet] = []
    adds: list[tuple[Sheet, int]] = []
    for part in spec.split(","):
        if "=" not in part:
            raise SystemExit(f"--stage 항목은 key=value 다: '{part}'")
        k, v = part.split("=", 1)
        k, v = k.strip(), v.strip()
        if k == "label":
            label = v
        elif k == "fps":
            fps = float(v)
        elif k == "main":
            mains.append(_load_scaled(v, "main", "normal")[0])
        elif k == "add":
            s, opts = _load_scaled(v, "add", "add")
            adds.append((s, int(opts.get("at", 0))))
        else:
            raise SystemExit(f"--stage 에 모르는 키: '{k}' (label/fps/main/add)")
    return Stage(label, fps, mains, adds)


def parse_sheet(spec: str) -> Stage:
    """`--sheet` 를 main 하나짜리 스테이지로 바꾼다."""
    parts = spec.split(",")
    opts: dict[str, str] = {}
    for q in parts[1:]:
        if "=" not in q:
            raise SystemExit(f"옵션 형식은 key=value 다: '{q}'")
        k, v = q.split("=", 1)
        opts[k.strip()] = v.strip()
    if "scale" not in opts:
        raise SystemExit(f"{parts[0]}: scale= 을 줘라 (코드에서 읽은 표시 배율)")
    token = f"{parts[0]}@{opts['scale']}"
    if "frames" in opts:
        token += f":frames={opts['frames']}"
    sheet = _load_scaled(token, "--sheet", opts.get("blend", "normal"))[0]
    return Stage(opts.get("label", sheet.path.stem), float(opts.get("fps", 30)), [sheet], [])


# ── 합성 ────────────────────────────────────────────────────────────────────
def paste_fx(base: Image.Image, fx: Image.Image, cx: int, cy: int, blend: str) -> None:
    """fx 를 (cx, cy) 중심으로 얹는다. blend='add' 면 가산.

    셀 밖으로 나가는 부분은 잘라낸다 — 게임에서도 화면 밖은 안 보인다
    (K 에너지파처럼 길이가 화면보다 긴 것이 있다).
    """
    x, y = cx - fx.width // 2, cy - fx.height // 2
    lx, ly = max(0, -x), max(0, -y)
    rx, ry = min(fx.width, base.width - x), min(fx.height, base.height - y)
    if rx <= lx or ry <= ly:
        return
    if (lx, ly, rx, ry) != (0, 0, fx.width, fx.height):
        fx = fx.crop((lx, ly, rx, ry))
        x, y = x + lx, y + ly

    if blend != "add":
        base.alpha_composite(fx, (x, y))
        return
    region = base.crop((x, y, x + fx.width, y + fx.height))
    # 알파를 곱한 RGB 를 배경에 더한다 (Phaser 의 ADD 와 같은 결과)
    premul = Image.composite(fx.convert("RGB"), Image.new("RGB", fx.size, (0, 0, 0)),
                             fx.getchannel("A"))
    added = ImageChops.add(region.convert("RGB"), premul)
    base.paste(added.convert("RGBA"), (x, y))


def silhouette(fx: Image.Image, thresh: int = 24) -> tuple[int, int]:
    """**화면에서 실제로 뭔가 보이는 범위.** 프레임 크기가 아니라 이걸 비교해야 한다 —
    후보마다 프레임 안 여백이 달라서, 같은 192px 프레임에 120px 큐브가 들어있기도 하다."""
    box = fx.getchannel("A").point(lambda v: 255 if v >= thresh else 0).getbbox()
    return (0, 0) if box is None else (box[2] - box[0], box[3] - box[1])


def resolve_bg(key: str) -> Path:
    """배경 키 → 파일. backgrounds/ 를 먼저 보고 wallpapers/ 를 본다 (wallpaper.ts 의 bgPath)."""
    for cand in (ASSETS / "backgrounds" / f"{key}.webp", ASSETS / "wallpapers" / f"{key}.webp"):
        if cand.exists():
            return cand
    raise SystemExit(f"배경 '{key}' 를 backgrounds/ 에서도 wallpapers/ 에서도 못 찾았다")


def make_backdrop(bg_path: Path) -> Image.Image:
    """게임과 같은 방식으로 배경을 화면 크기에 늘린 뒤, 플레이어 주변 셀만큼 오려낸다."""
    full = Image.open(bg_path).convert("RGBA").resize((GAME_W, GAME_H), Image.LANCZOS)
    px, py = GAME_W // 2, GAME_H - 80            # 플레이어 중심 (GameScene.ts:360)
    box = (px - CELL_W // 2, py - CELL_ABOVE, px + CELL_W // 2, py - CELL_ABOVE + CELL_H)
    crop = full.crop(box)
    return crop if crop.size == (CELL_W, CELL_H) else crop.resize((CELL_W, CELL_H), Image.LANCZOS)


def load_player(char_id: str) -> Image.Image:
    p = ASSETS / "players" / f"{char_id}_front.webp"
    if not p.exists():
        raise SystemExit(f"플레이어 스프라이트가 없다: {p}")
    return Image.open(p).convert("RGBA").resize((PLAYER_W, PLAYER_H), Image.LANCZOS)


class Cell:
    """셀 안의 좌표 — 플레이어 중심이 기준점이다."""
    PX = CELL_W // 2
    PY = CELL_ABOVE


def build_cell(backdrop: Image.Image, player: Image.Image, draw_fx, caption: str,
               sub: str = "", accent: bool = False) -> Image.Image:
    cell = backdrop.copy()
    cell.alpha_composite(player, (Cell.PX - PLAYER_W // 2, Cell.PY - PLAYER_H // 2))
    draw_fx(cell)
    d = ImageDraw.Draw(cell)
    d.rectangle([0, 0, CELL_W - 1, CELL_H - 1], outline=(70, 74, 84))
    if caption:
        d.rectangle([0, CELL_H - 34, CELL_W, CELL_H], fill=(0, 0, 0, 175))
        d.text((8, CELL_H - 31), caption, font=font(14, True), fill=ACCENT if accent else FG)
        if sub:
            d.text((8, CELL_H - 16), sub, font=font(12), fill=DIM)
    return cell


# ── 기존 이펙트 (전부 코드 실측값) ───────────────────────────────────────────
def _ref_frame(name: str, idx: int, disp: tuple[int, int]) -> Image.Image:
    s = Sheet(ASSETS / "fx" / "sheets" / name, 1.0, None, "normal")
    cx, cy = idx % s.cols, idx // s.cols
    raw = s.img.crop((cx * s.fw, cy * s.fh, (cx + 1) * s.fw, (cy + 1) * s.fh))
    return raw.resize(disp, Image.LANCZOS)


def ref_foxfire(c: Image.Image) -> None:
    """여우불 — 반경 55 링 9개, 화면 폭 28px (GumiAbility.ts:37,499)"""
    w = 28
    h = round(192 * (w / 128))
    fr = _ref_frame("foxfire_128x192.png", 3, (w, h))
    core = _ref_frame("foxfirecore_128x192.png", 3, (w, h))
    for i in range(9):
        a = (i / 9) * math.tau
        x, y = Cell.PX + round(math.cos(a) * 55), Cell.PY + round(math.sin(a) * 55)
        paste_fx(c, fr, x, y, "normal")
        paste_fx(c, core, x, y, "add")


def ref_lotus(c: Image.Image) -> None:
    """부활 연꽃 — 136px (MugiAbility.ts:42)"""
    paste_fx(c, _ref_frame("lotus_192x192.png", 5, (136, 136)), Cell.PX, Cell.PY + 6, "normal")


def ref_legacyburn(c: Image.Image) -> None:
    """레거시 불태우기 — 192 × scaleTo 1.15 (LegacyAbility.ts:417)"""
    paste_fx(c, _ref_frame("legacyburn_192x192.png", 4, (221, 221)), Cell.PX, Cell.PY, "normal")


def ref_kbeam(c: Image.Image) -> None:
    """K 에너지파 — 780×96. 셀 밖으로 나가는 게 실제 모습이다 (KAbility.ts:20,56)"""
    paste_fx(c, _ref_frame("kbeam_512x64.png", 2, (780, 96)), Cell.PX + 390, Cell.PY, "normal")


REFERENCES = [
    ("플레이어만", f"{PLAYER_W}×{PLAYER_H} · 기준선", lambda c: None),
    ("여우불 ×9", "28×42 · r=55 링", ref_foxfire),
    ("부활 연꽃", "136×136", ref_lotus),
    ("레거시 불태우기", "221×221 (scaleTo 1.15)", ref_legacyburn),
    ("K 에너지파", "780×96 · 셀 밖으로 뻗는다", ref_kbeam),
]
# 후보 줄 끝에 붙여 화풍을 바로 옆에서 대조하는 것들
INLINE_REFS = ["여우불 ×9", "부활 연꽃"]


def reference_cells(backdrop: Image.Image, player: Image.Image,
                    only: list[str] | None = None) -> list[Image.Image]:
    return [build_cell(backdrop, player, fn, f"[기존] {name}", sub)
            for name, sub, fn in REFERENCES if only is None or name in only]


# ── 스테이지 한 단 ──────────────────────────────────────────────────────────
def stage_cells(stage: Stage, backdrop: Image.Image, player: Image.Image,
                n: int) -> list[Image.Image]:
    """진행도 0~100% 를 n 등분해 뽑는다. **프레임 수가 다른 후보를 맞추는 유일한 방법**이다."""
    cells = []
    for i in range(n):
        p = 0.0 if n == 1 else i / (n - 1)
        gi = round(p * (stage.total - 1))
        sheet, li = stage.locate(gi)
        main = sheet.frame(li)
        overlays = [(s.frame(gi - at), s.blend) for s, at in stage.adds if at <= gi < at + s.frames]

        def draw(c: Image.Image, m=main, ov=overlays) -> None:
            paste_fx(c, m, Cell.PX, Cell.PY, "normal")
            for img, bl in ov:
                paste_fx(c, img, Cell.PX, Cell.PY, bl)

        sw, sh = silhouette(main)
        tag = "" if len(stage.mains) == 1 else f" · {sheet.path.stem}"
        cells.append(build_cell(
            backdrop, player, draw,
            f"{p*100:.0f}%   f{gi}/{stage.total - 1}  ({gi / stage.fps * 1000:.0f}ms)",
            f"실루엣 {sw}×{sh}px · 프레임 {sheet.fw}×{sheet.fh}×{sheet.scale:g}{tag}",
            accent=True))
    return cells


def row_strip(title: str, sub: str, cells: list[Image.Image], width: int) -> Image.Image:
    head = 48 if cells else 40
    strip = Image.new("RGBA", (width, head + (CELL_H + GAP if cells else 0)), BG_PANEL)
    d = ImageDraw.Draw(strip)
    d.text((MARGIN, 9), title, font=font(20, True), fill=FG)
    if sub:
        d.text((MARGIN, 31 if cells else 22), sub, font=font(13), fill=DIM)
    x = MARGIN
    for c in cells:
        strip.paste(c, (x, head))
        x += CELL_W + GAP
    return strip


def main() -> None:
    global GAME_W, GAME_H

    ap = argparse.ArgumentParser(description="FX 시트를 게임 표시 크기로 비교")
    ap.add_argument("--stage", action="append", default=[], metavar="SPEC",
                    help="label=..,fps=..,main=경로@배율[:frames=N],add=경로@배율:at=N — 여러 번 가능")
    ap.add_argument("--sheet", action="append", default=[], metavar="SPEC",
                    help="경로,scale=..[,label=..][,frames=..][,fps=..][,blend=add]")
    ap.add_argument("--out", required=True, help="비교 이미지 경로 (.png)")
    ap.add_argument("--bg", action="append", default=[],
                    help="배경 키 (여러 번 가능, 기본 background2). backgrounds/ → wallpapers/ 순으로 찾는다")
    ap.add_argument("--char", default="ted", help="플레이어 스프라이트 (assets/players/<id>_front.webp)")
    ap.add_argument("--steps", type=int, default=5, help="진행도 표본 수 (기본 5 = 0/25/50/75/100%%)")
    ap.add_argument("--game", default=f"{GAME_W}x{GAME_H}", help="기준 화면 크기 (RESIZE 라 기기마다 다르다)")
    ap.add_argument("--title", default="FX 비교 — 실제 게임 표시 크기")
    ap.add_argument("--no-reference", action="store_true", help="기존 이펙트 단을 빼고 낸다")
    ap.add_argument("--no-inline-reference", action="store_true", help="후보 줄 끝의 기존 이펙트를 빼고 낸다")
    a = ap.parse_args()

    if not a.stage and not a.sheet and a.no_reference:
        raise SystemExit("보여줄 것이 없다 — --stage/--sheet 를 주거나 --no-reference 를 빼라")
    if a.steps < 1:
        raise SystemExit("--steps 는 1 이상이어야 한다")

    try:
        GAME_W, GAME_H = (int(v) for v in a.game.lower().split("x"))
    except ValueError:
        raise SystemExit(f"--game 은 430x932 형식이다: '{a.game}'")

    stages = [parse_stage(s) for s in a.stage] + [parse_sheet(s) for s in a.sheet]
    bg_keys = a.bg or ["background2"]
    player = load_player(a.char)

    n_inline = 0 if a.no_inline_reference else len(INLINE_REFS)
    cols = max([a.steps + n_inline] + ([len(REFERENCES)] if not a.no_reference else []))
    width = MARGIN * 2 + cols * CELL_W + (cols - 1) * GAP

    strips: list[Image.Image] = []
    for key in bg_keys:
        path = resolve_bg(key)
        backdrop = make_backdrop(path)
        lum = ImageStat.Stat(backdrop.convert("L")).mean[0]
        strips.append(row_strip(f"■ 배경 {key} — 셀 평균 밝기 {lum:.0f}/255",
                                rel(path), [], width))

        inline = reference_cells(backdrop, player, INLINE_REFS) if n_inline else []
        for st in stages:
            desc = " + ".join(f"{s.path.stem} {s.frames}f" for s in st.mains)
            if st.adds:
                desc += " + " + " + ".join(f"{s.path.stem} {s.frames}f(add@{at})"
                                           for s, at in st.adds)
            sub = (f"{desc}  ·  전체 {st.total}프레임 @{st.fps:g}fps "
                   f"= {st.total / st.fps * 1000:.0f}ms  ·  RGBA {st.vram_mb():.2f}MB")
            strips.append(row_strip(st.label, sub,
                                    stage_cells(st, backdrop, player, a.steps) + inline, width))

        if not a.no_reference:
            strips.append(row_strip(
                "기존 이펙트 — 같은 배경 · 같은 플레이어",
                "전부 코드에서 실측한 표시 크기다 (출처는 이 스크립트 상단 표)",
                reference_cells(backdrop, player), width))

    title_h = 66
    out = Image.new("RGBA", (width, title_h + sum(s.height for s in strips) + MARGIN), BG_PANEL)
    d = ImageDraw.Draw(out)
    d.text((MARGIN, 16), a.title, font=font(26, True), fill=FG)
    d.text((MARGIN, 47),
           f"캐릭터 {a.char} · 화면 {GAME_W}×{GAME_H} · 플레이어 {PLAYER_W}×{PLAYER_H} "
           f"(발밑 {PLAYER_FOOT_GAP}px) · 셀은 1:1 픽셀 · 열은 연출 진행도",
           font=font(13), fill=DIM)
    y = title_h
    for s in strips:
        out.paste(s, (0, y))
        y += s.height

    dest = Path(a.out)
    if not dest.is_absolute():
        dest = ROOT / dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.convert("RGB").save(dest, "PNG")

    print(f"→ {rel(dest)}  ({out.width}×{out.height})")
    for st in stages:
        print(f"   {st.label}: {st.total}프레임 @{st.fps:g}fps "
              f"= {st.total / st.fps * 1000:.0f}ms · RGBA 합 {st.vram_mb():.2f}MB")
        for s in st.sheets():
            over = "  !! 4096 초과" if max(s.img.width, s.img.height) > 4096 else ""
            dw, dh = s.display
            print(f"      {s.path.name:28s} 아틀라스 {s.img.width}×{s.img.height} "
                  f"· {s.vram_mb():5.2f}MB · 화면 {dw}×{dh}px "
                  f"(배율 {s.scale:g} ← {s.scale_src}){over}")


if __name__ == "__main__":
    main()
