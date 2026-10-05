#!/bin/bash
# 캐릭터 한 명의 **배회 동작 5종** (walk·idle·crouch·jump·kick) 을 굽고 설치한다.
#
#   bash scripts/make-walk-sheets.sh neji A 1791605   # walk 6 + kick 6  (두 줄)
#   bash scripts/make-walk-sheets.sh neji B 1234567   # idle 4 / crouch 3 / jump 3 (세 줄)
#
# 분신 마무리(fin)와 같은 길이다 — 다운로드는 Chrome 이 .tmp 로 떨구고 이름을 못 바꾸는
# 일이 있어 **바이트 크기로** 찾는다.
set -e
FX_WORK="${DDONG_FX_WORK:-C:/Users/user/ddong-fx-work}"  # 생성 원본·작업물 (저장소 밖)
export DDONG_FX_WORK="$FX_WORK"
N="$1"; PART="$2"; SZ="$3"
PY="/c/ComfyUI/.venv/Scripts/python.exe"
case "$PART" in
  A) ACTS="walk,kick";        CUTS="6,6" ;;
  B) ACTS="idle,crouch,jump"; CUTS="4,3,3" ;;
  *) echo "PART 는 A 나 B 다"; exit 1 ;;
esac
SRC=""
for i in $(seq 1 20); do
  SRC=$(find "$USERPROFILE/Downloads" "$USERPROFILE/OneDrive/바탕 화면/똥" -maxdepth 1 -type f -size "${SZ}c" 2>/dev/null | head -1)
  [ -n "$SRC" ] && break
  sleep 2
done
[ -z "$SRC" ] && { echo "다운로드를 못 찾았다 ($SZ 바이트)"; exit 1; }
cp "$SRC" "$FX_WORK/heidi-puyo/${N}_${PART}_src.png"
rm -f "$SRC"
"$PY" scripts/cut-clone-rows.py "$N" --actions "$ACTS" --cuts "$CUTS" --tag "$PART"
for a in ${ACTS//,/ }; do
  rm -f $FX_WORK/heidi-puyo/sheet/puyo_${N}${a}_*.png
  "$PY" scripts/build-puyo-sheet.py --action "${N}${a}" >/dev/null 2>&1 || { echo "  ** ${a} 굽기 실패"; continue; }
  F=$(ls $FX_WORK/heidi-puyo/sheet/puyo_${N}${a}_*.png 2>/dev/null | head -1)
  [ -z "$F" ] && { echo "  ** ${a} 결과 없음"; continue; }
  WH=$(basename "$F" | sed -E 's/.*_([0-9]+x[0-9]+)\.png/\1/')
  rm -f public/assets/fx/sheets/${N}_${a}_*.png
  cp "$F" "public/assets/fx/sheets/${N}_${a}_${WH}.png"
  "$PY" - "$N" "$a" "$WH" <<'PYEOF'
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
n, a, wh = sys.argv[1], sys.argv[2], sys.argv[3]
fw, fh = map(int, wh.split('x'))
arr = np.array(Image.open(f'public/assets/fx/sheets/{n}_{a}_{wh}.png').convert('RGBA'))
cnt = arr.shape[1] // fw
g = [float(nd.distance_transform_edt(arr[:, i*fw:(i+1)*fw][..., 3] > 16).max()) for i in range(cnt)]
print(f'  {n}_{a}_{wh}.png  {cnt}프레임  두께 {np.median(g):.1f}')
PYEOF
done
