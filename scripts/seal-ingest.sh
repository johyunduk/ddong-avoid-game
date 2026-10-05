#!/bin/bash
# 캐릭터 인 맺기 6컷 한 명분: 다운로드 회수 -> 배경 벗기기 -> 자르기 -> 굽기 -> 설치
#
#   bash scripts/seal-ingest.sh minato
#
# 기본 뿌요 인 맺기(puyo_seal)를 만든 순서를 그대로 묶었다. 다른 점은 이름뿐이다.
# 다운로드 찾기는 cutin-ingest.sh 와 같은 이유로 **금방 생긴 PNG 만** 받는다
# (확장자가 .tmp 여도 매직 바이트로 확인, 공백 든 파일명은 줄 단위로 읽는다).
set -e
FX_WORK="${DDONG_FX_WORK:-C:/Users/user/ddong-fx-work}"  # 생성 원본·작업물 (저장소 밖)
export DDONG_FX_WORK="$FX_WORK"
N="$1"
A="${2:-seal}"   # 동작 이름 (기본 seal). 예: bash scripts/seal-ingest.sh kakashi charge
[ -z "$N" ] && { echo "이름이 필요하다 (예: minato)"; exit 1; }
PY="/c/ComfyUI/.venv/Scripts/python.exe"
D=$FX_WORK/heidi-puyo
FRESH=180

SRC=""
for i in $(seq 1 20); do
  while IFS= read -r C; do
    [ -z "$C" ] && continue
    if [ "$(head -c 4 "$C" | od -An -tx1 | tr -d ' \n')" = "89504e47" ]; then SRC="$C"; break; fi
  done < <(find "$USERPROFILE/OneDrive/바탕 화면/똥" "$USERPROFILE/Downloads" -maxdepth 1 -type f \
             \( -name '*.png' -o -name '*.tmp' \) -newermt "-${FRESH} seconds" \
             -printf '%T@\t%p\n' 2>/dev/null | sort -rn | cut -f2-)
  [ -n "$SRC" ] && break
  sleep 2
done
[ -z "$SRC" ] && { echo "최근 ${FRESH}초 안에 받은 png 가 없다"; exit 1; }
echo "  집은 파일: $(basename "$SRC")"
cp "$SRC" "$D/${N}_${A}_src.png"
rm -f "$SRC"

# 불투명 회색 배경 -> 알파. **바깥에 이어진 배경색 덩어리만** 지운다 (털 속 회색은 남는다)
"$PY" - "$D/${N}_${A}_src.png" <<'PYEOF'
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
from collections import Counter
p = sys.argv[1]
a = np.array(Image.open(p).convert('RGBA'))
if not (a[..., 3] < 250).any():
    rgb = a[..., :3].astype(np.int16)
    b = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bgc = np.array(Counter(map(tuple, b)).most_common(1)[0][0])
    lab, _ = nd.label(np.abs(rgb - bgc).max(axis=2) <= 24)
    keep = set(lab[0].tolist()) | set(lab[-1].tolist()) | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    keep.discard(0)
    a[..., 3] = np.where(np.isin(lab, list(keep)), 0, 255)
    Image.fromarray(a, 'RGBA').save(p)
print('  원본', a.shape[1], 'x', a.shape[0])
PYEOF

"$PY" scripts/cut-clone-rows.py "$N" --actions "$A" --cuts 6 --tag "$A"
# build-puyo-sheet 는 섬을 cy < h/2 로 두 줄 취급해 정렬한다 — 한 줄짜리는 아래를 비워 넣는다
"$PY" - "$D/${N}${A}_v7_raw.png" <<'PYEOF'
import sys, numpy as np
from PIL import Image
p = sys.argv[1]
a = np.array(Image.open(p).convert('RGBA'))
out = np.zeros((a.shape[0] * 2, a.shape[1], 4), np.uint8); out[:a.shape[0]] = a
Image.fromarray(out, 'RGBA').save(p)
PYEOF
rm -f "$D"/sheet/puyo_${N}${A}_*.png
"$PY" scripts/build-puyo-sheet.py --action "${N}${A}" >/dev/null 2>&1
F=$(ls "$D"/sheet/puyo_${N}${A}_*.png | head -1)
WH=$(basename "$F" | sed -E 's/.*_([0-9]+x[0-9]+)\.png/\1/')
rm -f public/assets/fx/sheets/${N}_${A}_*.png
cp "$F" "public/assets/fx/sheets/${N}_${A}_${WH}.png"
"$PY" - "$N" "$WH" "$A" <<'PYEOF'
import sys
from PIL import Image
n, wh, act = sys.argv[1], sys.argv[2], sys.argv[3]
fw = int(wh.split('x')[0])
im = Image.open(f'public/assets/fx/sheets/{n}_{act}_{wh}.png')
print(f'  {n}_{act}_{wh}.png  {im.width // fw}프레임')
PYEOF
