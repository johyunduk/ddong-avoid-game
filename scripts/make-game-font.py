"""게임 기본 글꼴(DdongSans) 만들기 — Pretendard(SIL OFL 1.1)를 게임에 쓰는 글자로 줄이고 이름을 바꾼다.

    python scripts/make-game-font.py            # public/fonts/DdongSans-{Regular,Bold}.woff2 · OFL.txt
    python scripts/make-game-font.py --check    # 소스에 글꼴에 없는 글자가 있는지만 본다 (있으면 종료 코드 1)

## 왜 이름을 바꾸나
Pretendard 는 'Reserved Font Name Pretendard' 로 배포된다. OFL 에서 글자를 줄이는 것(subset)도 수정이라
수정본은 그 이름을 쓸 수 없다 → 글꼴 안 이름표(name 테이블)를 DdongSans 로 바꾼다. 라이선스 전문은 OFL.txt 로 같이 둔다.

## 무엇을 남기나
- 영어·숫자·기호 (ASCII 전부)
- 한글 완성형 2,350자 (KS X 1001) — 서버에서 오는 글자(퀘스트 이름 등)가 소스에 없어도 대개 여기 들어간다
- src/ · index.html 에 실제로 적힌 글자 전부 (캐릭터 이름 · 릴리스 노트 · 안내 문구)
새 글자를 넣었는데 글꼴에 없으면 그 글자만 시스템 글꼴로 나온다 — 그때 이 스크립트를 다시 돌린다.

필요: fonttools · brotli (pip install fonttools brotli). 원본은 jsDelivr 에서 받는다.
"""
import glob, os, sys, tempfile, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

sys.stdout.reconfigure(encoding="utf-8")   # Windows 콘솔(cp949)에서도 한글·기호 출력

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'fonts')
VERSION = 'v1.3.9'
SRC_URL = f'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@{VERSION}/packages/pretendard/dist/web/static/woff2/Pretendard-{{w}}.woff2'
LICENSE_URL = f'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@{VERSION}/LICENSE'
FAMILY = 'DdongSans'
WEIGHTS = ['Regular', 'Bold']


def wanted_text() -> str:
    chars = set(chr(c) for c in range(0x20, 0x7F))
    # KS X 1001 한글 2350자 — EUC-KR 의 B0A1..C8FE
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode('euc-kr'))
            except UnicodeDecodeError:
                pass
    files = glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True) + [os.path.join(ROOT, 'index.html')]
    for f in files:
        chars.update(open(f, encoding='utf-8').read())
    # 이모지·제어 문자는 글꼴에 없어도 된다 (이모지는 시스템 글꼴로 나온다)
    return ''.join(sorted(c for c in chars if c.isprintable() and ord(c) < 0x1F000))


def rename(font: TTFont, weight: str) -> None:
    """name 테이블에서 예약 이름(Pretendard)을 지운다 — 가족 · 전체 · PostScript · 고유 ID"""
    table = font['name']
    full, ps = f'{FAMILY} {weight}', f'{FAMILY}-{weight}'
    for rec in table.names:
        if rec.nameID in (1, 16):
            rec.string = FAMILY
        elif rec.nameID in (2, 17):
            rec.string = weight
        elif rec.nameID == 4:
            rec.string = full
        elif rec.nameID == 6:
            rec.string = ps
        elif rec.nameID == 3:
            rec.string = f'{ps};{VERSION}-subset'   # 원본 출처는 OFL.txt · 저작권 줄(nameID 0)에 남는다
    leftover = [str(r) for r in table.names if 'Pretendard' in str(r) and r.nameID not in (0, 7, 8, 9, 10, 11, 12, 13, 14)]
    assert not leftover, f'예약 이름이 남았다: {leftover}'


def build() -> None:
    os.makedirs(OUT, exist_ok=True)
    text = wanted_text()
    with tempfile.TemporaryDirectory() as tmp:
        for w in WEIGHTS:
            src = os.path.join(tmp, f'{w}.woff2')
            urllib.request.urlretrieve(SRC_URL.format(w=w), src)
            font = TTFont(src)
            opts = subset.Options()
            opts.flavor = 'woff2'
            opts.layout_features = ['*']
            opts.name_IDs = ['*']
            opts.notdef_outline = True
            s = subset.Subsetter(options=opts)
            s.populate(text=text)
            s.subset(font)
            rename(font, w)
            dst = os.path.join(OUT, f'{FAMILY}-{w}.woff2')
            font.flavor = 'woff2'
            font.save(dst)
            print(f'{dst}  {os.path.getsize(dst) // 1024} KB  ({len(font.getBestCmap())} 글자)')
    lic = urllib.request.urlopen(LICENSE_URL).read().decode('utf-8')
    note = (f'DdongSans 는 Pretendard {VERSION} (https://github.com/orioncactus/pretendard) 를 게임에 쓰는 글자로 줄이고\n'
            '예약 이름(Pretendard)을 바꾼 수정본이다. 같은 SIL Open Font License 1.1 을 따른다.\n'
            '만드는 법: scripts/make-game-font.py\n\n')
    open(os.path.join(OUT, 'OFL.txt'), 'w', encoding='utf-8').write(note + lic)


def check() -> int:
    font = TTFont(os.path.join(OUT, f'{FAMILY}-Regular.woff2'))
    have = set(chr(c) for c in font.getBestCmap())
    missing = sorted(set(wanted_text()) - have - {' '})
    # 원본 Pretendard 에도 없는 글자(일부 기호)는 어차피 시스템 글꼴 몫 — 한글만 실패로 친다
    hangul = [c for c in missing if '가' <= c <= '힣']
    if hangul:
        print('글꼴에 없는 한글:', ''.join(hangul), '→ python scripts/make-game-font.py')
        return 1
    print(f'OK — 소스의 한글이 모두 글꼴에 있다 (글꼴에 없는 기호 {len(missing)}개는 시스템 글꼴로)')
    return 0


if __name__ == '__main__':
    sys.exit(check() if '--check' in sys.argv else build())
