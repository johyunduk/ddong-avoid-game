#!/bin/bash
# 컷인 일러스트 한 명분: 다운로드 회수 -> 16:9 크롭 -> 512x288 설치
#
#   bash scripts/cutin-ingest.sh neji
#
# 컷인은 **배경까지 그려진 판 한 장**이라 알파가 필요 없다 (캐릭터 시트처럼 섬을
# 떼어낼 것도, 파티클처럼 밝기를 알파로 구울 것도 없다). 자르고 줄이면 끝이다.
#
# 인자를 하나만 받는다 — 바이트 크기 대신 **가장 최근 파일**을 집는다.
# 컷인은 한 번에 한 장씩 뽑으므로 헷갈릴 일이 없다.
set -e
FX_WORK="${DDONG_FX_WORK:-C:/Users/user/ddong-fx-work}"  # 생성 원본·작업물 (저장소 밖)
export DDONG_FX_WORK="$FX_WORK"
N="$1"
[ -z "$N" ] && { echo "이름이 필요하다 (예: neji)"; exit 1; }
PY="/c/ComfyUI/.venv/Scripts/python.exe"
DL="$USERPROFILE/OneDrive/바탕 화면/똥"

# **"가장 최근 파일"만으로 고르면 안 된다.** 다운로드가 늦게 떨어지면 폴더에 남아 있던
# 며칠 전 파일을 집는다 — 실제로 이타치 자리에 옛 카카시 시트가, 쵸지 자리에 테드
# 큐브가 들어갔다. 옛 fin-ingest.sh 가 바이트 크기로 찾던 것도 같은 이유다.
# 여기서는 **금방 생긴 것만** 받는다: 2분 이내 + 없으면 기다린다.
FRESH=180        # 이 초 안에 생긴 파일만 후보
# **두 폴더를 다 본다. 확장자도 믿지 않는다.**
# Chrome 이 받은 것을 `.tmp` 로 떨구고 이름을 못 바꾸는 일이 있다 (옛 fin-ingest.sh 에도
# 같은 주석이 있다). 실제로 여기서 겪었다 — Downloads 에 .tmp 로 남아 있었다.
# 그래서 확장자 대신 **PNG 매직 바이트**로 확인한다.
SRC=""
for i in $(seq 1 20); do
  # **줄 단위로 읽는다.** `for x in $(find ...)` 는 공백이 든 파일명을 토막 낸다
  # (Chrome 이 붙이는 "ChatGPT Image 2026년 ... .png" 가 정확히 그렇다).
  while IFS= read -r CAND; do
    [ -z "$CAND" ] && continue
    # 89 50 4E 47 = PNG
    if [ "$(head -c 4 "$CAND" | od -An -tx1 | tr -d ' 
')" = "89504e47" ]; then
      SRC="$CAND"; break
    fi
  done < <(find "$DL" "$USERPROFILE/Downloads" -maxdepth 1 -type f              \( -name '*.png' -o -name '*.tmp' \) -newermt "-${FRESH} seconds"              -printf '%T@	%p
' 2>/dev/null | sort -rn | cut -f2-)
  [ -n "$SRC" ] && break
  sleep 2
done
[ -z "$SRC" ] && { echo "최근 ${FRESH}초 안에 받은 png 가 없다 — 저장 버튼을 눌렀는지 확인해라"; exit 1; }
echo "  집은 파일: $(basename "$SRC")"

mkdir -p $FX_WORK/cutin
cp "$SRC" "$FX_WORK/cutin/${N}_cutin_src.png"
rm -f "$SRC"

"$PY" - "$N" <<'PYEOF'
import sys, os
from PIL import Image

# 띠를 떼어낼 세로 위치 (원본 높이 대비). 얼굴이 가운데 오도록 눈으로 맞춘 값이다
TOP = {'minato': 0.18, 'neji': 0.20, 'kakashi': 0.15, 'itachi': 0.09,
       'shikamaru': 0.13, 'choji': 0.15, 'orochimaru': 0.13, 'jiraiya': 0.15}

n = sys.argv[1]
im = Image.open(f'{os.environ['DDONG_FX_WORK']}/cutin/{n}_cutin_src.png').convert('RGB')
w, h = im.size
# 폭은 그대로 두고 **높이만** 떼어낸다. 16:9 로 시작했다가 사람 판정
# ("세로 사이즈 살짝만 줄여 달라")에 2.1:1 로 15% 깎았다
bh = int(w / 2.1)
# TOP 은 16:9 창의 윗변 기준이라, 그 창의 **중심**을 유지한 채 높이만 줄인다
old_bh = int(w * 9 / 16)
y0 = max(0, min(h - old_bh, int(h * TOP.get(n, 0.15))))
y = max(0, min(h - bh, (y0 + old_bh // 2) - bh // 2))
out = f'public/assets/fx/sheets/{n}_cutin_512x244.png'
im.crop((0, y, w, y + bh)).resize((512, 244), Image.LANCZOS).convert('RGBA').save(out)
print(f'  {n}_cutin_512x244.png  원본 {w}x{h}  크롭 y={y} (top {TOP.get(n, 0.15)})  '
      f'{os.path.getsize(out) / 1024:.0f}KB  VRAM {512 * 244 * 4 / 1024 / 1024:.2f}MB')
PYEOF
