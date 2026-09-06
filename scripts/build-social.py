#!/usr/bin/env python3
"""승인된 일러스트 + 음악 + 게임플레이 캡처로 SNS 세로 영상을 만든다.

템플릿 (기본 30초, 1080x1920):
    0~3초    캐릭터 일러스트
    3~8초    캐릭터 이름 / 소개
    8~25초   게임 플레이
    25~30초  로고 / CTA

사용 예:
    python scripts/build-social.py \
        --id summer-pool-01 \
        --illust creative/summer-pool-01/selected.png \
        --gameplay creative/summer-pool-01/gameplay.mp4 \
        --music creative/summer-pool-01/song.mp3 \
        --name "여름밤" --tagline "UR · 물보라 회피" \
        --preset youtube

출력: release/social/<id>/{youtube|instagram}.mp4 + thumbnail.png

ffmpeg 이 PATH 에 있어야 한다 (winget install Gyan.FFmpeg 등).
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
W, H = 1080, 1920
FPS = 30
FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/malgun.ttf"),
    Path("C:/Windows/Fonts/malgunbd.ttf"),
    Path("/System/Library/Fonts/AppleSDGothicNeo.ttc"),
    Path("/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
]
PRESETS = {
    # 이름: (총길이, 인트로, 소개, 아웃트로) — 게임플레이는 나머지
    "youtube": (30.0, 3.0, 5.0, 5.0),
    "instagram": (25.0, 3.0, 4.0, 4.0),
}


def need_ffmpeg() -> None:
    for exe in ("ffmpeg", "ffprobe"):
        if shutil.which(exe) is None:
            raise SystemExit(
                f"{exe} 를 찾을 수 없습니다. PATH 에 ffmpeg 를 추가한 뒤 다시 실행하세요.\n"
                "  Windows: winget install Gyan.FFmpeg"
            )


def run(args: list) -> None:
    proc = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        tail = "\n".join((proc.stderr or "").splitlines()[-25:])
        raise SystemExit(f"ffmpeg 실패:\n{' '.join(str(a) for a in args)}\n\n{tail}")


def font_path() -> str:
    for f in FONT_CANDIDATES:
        if f.exists():
            # ffmpeg 필터 문법에서 드라이브 콜론은 이스케이프가 필요하다
            return str(f).replace("\\", "/").replace(":", "\\:")
    raise SystemExit("한글 폰트를 찾지 못했습니다. FONT_CANDIDATES 에 경로를 추가하세요.")


def esc_path(p: Path) -> str:
    return str(p.resolve()).replace("\\", "/").replace(":", "\\:")


def encode(inputs: list, vf: str, duration: float, out: Path, loop_image: bool) -> None:
    args = ["ffmpeg", "-y"]
    for src in inputs:
        if loop_image:
            args += ["-loop", "1", "-t", f"{duration}", "-i", str(src)]
        else:
            args += ["-i", str(src)]
    args += [
        "-t", f"{duration}",
        "-filter_complex", vf,
        "-map", "[v]",
        "-an",
        "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        str(out),
    ]
    run(args)


def fit_filter(label_in: str, label_out: str) -> str:
    """원본 비율을 유지하며 1080x1920 안에 넣고, 남는 곳은 블러 배경으로 채운다."""
    return (
        f"[{label_in}]split=2[bg][fg];"
        f"[bg]scale={W}:{H}:force_original_aspect_ratio=increase,"
        f"crop={W}:{H},boxblur=40:2,eq=brightness=-0.12[bgb];"
        f"[fg]scale={W}:{H}:force_original_aspect_ratio=decrease[fgs];"
        f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2[{label_out}]"
    )


def drawtext(label_in: str, label_out: str, textfile: Path, y: str, size: int,
             start: float, font: str, color: str = "white") -> str:
    return (
        f"[{label_in}]drawtext=fontfile='{font}':textfile='{esc_path(textfile)}':"
        f"fontsize={size}:fontcolor={color}:borderw=6:bordercolor=black@0.75:"
        f"x=(w-text_w)/2:y={y}:enable='gte(t,{start})'[{label_out}]"
    )


def main() -> int:
    p = argparse.ArgumentParser(description="SNS 세로 영상 생성")
    p.add_argument("--id", required=True, help="캐릭터 id (production/<id>.yaml)")
    p.add_argument("--illust", required=True, help="승인된 일러스트 이미지")
    p.add_argument("--gameplay", required=True, help="게임플레이 캡처 영상")
    p.add_argument("--music", required=True, help="승인된 음악 (mp3/wav)")
    p.add_argument("--name", required=True, help="캐릭터 이름")
    p.add_argument("--tagline", default="", help="한 줄 소개")
    p.add_argument("--cta", default="지금 플레이하기", help="아웃트로 문구")
    p.add_argument("--logo", default="public/poop_sunglass_600x600.png")
    p.add_argument("--preset", choices=sorted(PRESETS), default="youtube")
    p.add_argument("--out", help="출력 디렉터리 (기본 release/social/<id>)")
    a = p.parse_args()

    need_ffmpeg()
    font = font_path()
    total, intro, intro_text, outro = PRESETS[a.preset]
    play = total - intro - intro_text - outro
    hero = intro + intro_text  # 일러스트 구간 전체 길이

    out_dir = Path(a.out) if a.out else ROOT / "release" / "social" / a.id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_video = out_dir / f"{a.preset}.mp4"

    for f in (a.illust, a.gameplay, a.music):
        if not Path(f).exists():
            raise SystemExit(f"입력 파일이 없습니다: {f}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        name_txt = tmp / "name.txt"
        name_txt.write_text(a.name, encoding="utf-8")
        tag_txt = tmp / "tag.txt"
        tag_txt.write_text(a.tagline or " ", encoding="utf-8")
        cta_txt = tmp / "cta.txt"
        cta_txt.write_text(a.cta, encoding="utf-8")

        # 1) 일러스트 (느린 줌) + intro 초 뒤 이름/소개 등장
        seg1 = tmp / "seg1.mp4"
        zoom = (
            f"[0:v]scale={W * 2}:-2,"
            f"zoompan=z='min(zoom+0.0006,1.15)':d={int(hero * FPS)}:"
            f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS}[z];"
        )
        chain = zoom + drawtext("z", "t1", name_txt, "h*0.72", 108, intro, font)
        chain += ";" + drawtext("t1", "t2", tag_txt, "h*0.72+140", 52, intro + 0.4, font, "#ffd766")
        chain += ";[t2]fade=t=out:st=%.2f:d=0.4[v]" % (hero - 0.4)
        encode([a.illust], chain, hero, seg1, loop_image=True)

        # 2) 게임플레이
        seg2 = tmp / "seg2.mp4"
        gp = fit_filter("0:v", "g") + f";[g]fade=t=in:st=0:d=0.3,fade=t=out:st={play - 0.4:.2f}:d=0.4[v]"
        encode([a.gameplay], gp, play, seg2, loop_image=False)

        # 3) 로고 + CTA
        seg3 = tmp / "seg3.mp4"
        logo = Path(a.logo)
        if logo.exists():
            l3 = (
                f"color=c=black:s={W}x{H}:d={outro}[bgc];"
                f"[1:v]scale={int(W * 0.5)}:-1[lg];"
                f"[bgc][lg]overlay=(W-w)/2:(H-h)/2-160[o];"
            )
            l3 += drawtext("o", "t1", cta_txt, "h*0.62", 84, 0, font)
            l3 += f";[t1]fade=t=in:st=0:d=0.4[v]"
            args = [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={FPS}:d={outro}",
                "-loop", "1", "-t", f"{outro}", "-i", str(logo),
                "-t", f"{outro}", "-filter_complex", l3, "-map", "[v]", "-an",
                "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-pix_fmt", "yuv420p", str(seg3),
            ]
            run(args)
        else:
            chain = f"color=c=black:s={W}x{H}:d={outro}[bgc];"
            chain += drawtext("bgc", "v", cta_txt, "(h-text_h)/2", 84, 0, font)
            run([
                "ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=black:s={W}x{H}:r={FPS}:d={outro}",
                "-t", f"{outro}", "-filter_complex", chain, "-map", "[v]", "-an",
                "-r", str(FPS), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-pix_fmt", "yuv420p", str(seg3),
            ])

        # 4) 이어붙이고 음악 얹기
        listfile = tmp / "concat.txt"
        listfile.write_text(
            "".join(f"file '{s.as_posix()}'\n" for s in (seg1, seg2, seg3)), encoding="utf-8"
        )
        silent = tmp / "silent.mp4"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile), "-c", "copy", str(silent)])

        run([
            "ffmpeg", "-y",
            "-i", str(silent),
            "-i", str(a.music),
            "-filter_complex",
            f"[1:a]atrim=0:{total},afade=t=in:st=0:d=0.5,"
            f"afade=t=out:st={total - 1.5:.2f}:d=1.5,aresample=48000[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest", str(out_video),
        ])

    # 썸네일
    thumb = out_dir / "thumbnail.png"
    run([
        "ffmpeg", "-y", "-i", str(a.illust),
        "-filter_complex", fit_filter("0:v", "v"),
        "-map", "[v]", "-frames:v", "1", str(thumb),
    ])

    print(f"완료:\n  {out_video}\n  {thumb}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
