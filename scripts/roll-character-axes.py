"""새 캐릭터 축을 제비뽑기로 정한다.

## 왜 필요한가
builder(나) 가 컨셉을 직접 고르면 계속 같은 자리로 수렴한다. 실측 결과 —
  최근 10건의 시대·문화가 전부 전통·농촌·자연
  최근 12배치에서 cowboy shot 35회 / three-quarter view 24회 / 부감 2회 / 전신 0회
  프롬프트 첫 줄(스타일 선언)이 12건 중 10건 글자까지 동일
  상징물이 활·북채·갈퀴·삿대·비·피리 — '긴 막대를 손에 든 사람' 6연속
2026-09-06 에 같은 지적을 받고 memory 에 규칙을 적어뒀는데도 다시 돌아왔다.
사람이 "전부 다 랜덤으로 안 되냐" 고 물어서 만들었다. 고르는 주체를 바꾸는 게 답이다.

## 무엇을 하나
  1) 진행 중·완료된 spec.yaml 과 로스터에서 **최근에 쓴 값**을 읽어 제외 목록을 만든다
  2) 시대·문화 / 장르 / 역할 / 모티프 / 톤 / 색 / 성별 / 상징물 형태 / **무기** / 카메라 세트를 굴린다
     무기는 필수가 아니다 — 장르에 어울릴 때만 나오고 전체의 40% 남짓이다
  3) 카메라도 굴린다 — 이게 화면 단조로움의 직접 원인이었다

## 2026-09-12 범위 축소 (사용자 지시)
"일러스트 제작 이거 좀 컨셉 범위를 좁히는 게 좋을 것 같다",
"게임에 어울리는 듯한 컨셉들만 좀 추려줄 수 있나", "상징물 형태를 안전한 것만".
기준은 **게임 로스터**다. 나이트(갑옷)·매화(검)·구미(요괴)·K(에너지파)·광부(곡괭이)는
그림 한 장에서 '무엇을 하는 능력인가' 가 읽힌다. 반면 내가 뽑아 온 사서·등대지기·
잠수부·정비공·기계공학자·선원은 **생활 직업**이라 능력으로 이어지지 않았다.
그래서 세 풀을 줄였다:
  시대·문화  생활 공간(학교·도서관·항구·유원지·경기장·우주 정거장 등) 삭제
  역할       생활 직업 전부 삭제, 능력이 보이는 역할만
  상징물     실패율이 높은 네 형태 삭제, 검증된 세 형태만
  장르       '일상'·'스포츠' 삭제

사용:
  python scripts/roll-character-axes.py            # 한 벌
  python scripts/roll-character-axes.py --n 3      # 세 벌 뽑아 고르기
  python scripts/roll-character-axes.py --seed 7   # 재현
"""
from __future__ import annotations

import argparse
import glob
import sys
import os
import random
import re

RECENT = 6          # 최근 몇 건까지 같은 값을 막을지
BUCKET_BAN = 3      # 시대·문화 "계열"은 이만큼 연속으로 못 쓴다

# (이름, 계열). 계열까지 봐야 '전통 공방'과 '전통 사냥터'가 같은 편향임을 잡는다.
ERA = [
    # 2026-09-12 축소: "게임에 어울리는 컨셉만" 지시로 **생활 공간을 전부 뺐다.**
    # 뺀 것 - 학교 / 도서관 / 항구 창고 / 유원지 / 경기장 / 온천 마을 / 달리는 기차 /
    #         밤 시장 / 지하 광산 / 극지 관측소 / 농촌 들판 / 전통 공방 / 늪지 마을 /
    #         우주 정거장 / 달 기지 / 심해 기지 (전부 '직업 생활인' 을 부른다)
    # 남긴 것 - 로스터(나이트·매화·구미·K·루트)가 실제로 서 있는 무대들
    ("서양 중세 성채", "판타지"), ("마도 도시", "판타지"), ("고대 유적", "판타지"),
    ("공중에 뜬 섬", "판타지"), ("북유럽 설원", "판타지"), ("용의 둥지", "판타지"),
    ("한국 전통 산사", "전통"), ("조선 저잣거리", "전통"), ("요괴가 도는 밤길", "전통"),
    ("중화풍 강호", "전통"), ("무림 객잔", "전통"),
    ("근미래 도시", "미래"), ("폐허가 된 도시", "미래"), ("무너진 성벽 도시", "미래"),
    # 2026-09-12: "네온 뒷골목" 삭제 - 컨셉 요청이 매번 "사이버 소재를 피한다" 고 못 박는다
    ("현대 도시의 이면", "현대"), ("퇴마 사무소", "현대"),
    ("화산 기슭", "자연"), ("사막 대상로", "자연"), ("깊은 숲속", "자연"),
    ("떠돌이 서커스", "판타지"),
]
ERA_BUCKET = {n: b for n, b in ERA}

GENRE = [
    # 2026-09-12 축소: '일상'·'스포츠' 를 뺐다 - 둘이 생활 직업 쪽으로 컨셉을 끌고 갔다.
    "하이 판타지", "다크 판타지", "무협", "신화·설화", "요괴·괴담", "마도과학",
    "스팀펑크", "호러 한 스푼", "느와르", "동화·그림책", "탐험·모험", "코미디",
]
ROLE = [
    # 2026-09-12 축소: 사서·등대지기·잠수부·정비공 같은 **생활 직업을 전부 뺐다.**
    # 로스터는 기사(나이트)·검객(매화)·요괴(구미)·초능력자(K)·광부(곡괭이)처럼
    # 그림 한 장에서 '무엇을 하는 능력인가' 가 읽히는 캐릭터들이다.
    "기사", "검객", "궁수", "창잡이", "권법가", "도적", "암살자", "현상금 사냥꾼",
    "마법사", "주술사", "무녀", "퇴마사", "연금술사", "소환사", "정령술사",
    "요괴", "여우", "도깨비", "용의 아이", "괴도", "광대 검사", "무희 자객",
    "기계 기사", "사냥꾼", "방랑 무사", "수호자", "파수꾼", "약사 무인",
    # 2026-09-13: "총사" 삭제 - 무기 풀에서 총기를 뺀 것과 모순이었다(등급 때문에 총기·유혈 없음)
]
MOTIF = [
    # 2026-09-12: **동물 이름을 전부 뺐다.** 소품·의상·배경 어디에 넣어도
    # 그 동물이 인물에게 옮겨 붙는다 - maengkkong(개구리 머리가 얼굴로),
    # goyo(벽 장식 사슴 뿔이 머리에), dasom(털 망토에서 늑대 귀와 꼬리가 자람).
    # 세 번 다 네거티브(frog/deer/wolf, animal ears, tail)로 막히지 않았다.
    "불", "물", "바람", "번개", "얼음", "빛", "그림자", "쇠", "돌", "유리",
    "종이", "실", "거울", "시계", "지도", "씨앗", "뼈", "연기", "거품", "자석",
    "매듭", "먼지", "소리", "향", "열쇠", "사슬", "등불", "재", "서리", "메아리",
]
TONE = [
    "조용하고 단단함", "장난기 많음", "사납고 거침", "우아하고 차가움", "뻔뻔함",
    "명랑하고 시끄러움", "냉소적", "느긋함", "겁 많지만 끝은 함", "수다스러움",
    "무뚝뚝함", "과장이 심함", "다정함", "집요함", "덜렁댐",
]
# 상징물을 '형태'로 굴린다 — 계속 긴 막대만 나온 게 문제였다
SYMBOL_FORM = [
    # 2026-09-12 축소: 사용자 지시 "상징물 형태를 안전한 것만".
    # 뺀 것 - 동물 동반(방울 6패스·창포 5패스) / 떠 있는 것(3회 실패) /
    #         몸에서 나오는 현상(송골·해무 실패) / 탈것·큰 기물(그늘 실패) /
    #         손에 드는 작은 것(지남 쇠침·고요 도장이 다른 물건으로 렌더)
    ("손에 드는 긴 것", "가장 안정적. 나루 삿대·차돌 갈고리 장대가 한 패스에 잡혔다"),
    ("입는 것 자체", "가장 안정적. salgeum-01 은 두 패스 - 상징이 옷이면 손을 떠날 수가 없다"),
    ("두 손으로 다루는 동작", "도래·설피(펼친 지도)에서 통했다. 크고 평평하게 잡는다"),
]

# ── 무기 ───────────────────────────────────────────────────────────
# 필수가 아니다. 장르에 어울릴 때만, 그리고 절반쯤만 나온다.
# 로스터가 이미 쓰는 것은 뺐다 — 검(나이트 검기)·칼(매화)·활(깍지)·곡괭이(광부)·여의주(무기).
# 게임물 등급 때문에 **총기와 유혈은 넣지 않는다.** 근접·투척·전통 무기만 쓴다.
# 2026-09-13: 0.45 -> 0.70 으로 올렸다. 사람 지시 — "무기 같은 게 필수가 된 느낌".
# 무기 축만으로는 절반만 풀린다. SYMBOL_FORM 셋 중 둘이 손에 드는 형태라
# 무기가 없어도 손엔 뭔가 들린다 (여시 열쇠 막대·심지 등불·쇠북 나팔).
WEAPON_NONE = 0.70          # 기본적으로 이 확률은 '무기 없음'
WEAPON_NONE_CALM = 0.90     # 아래 장르는 무기가 없는 편이 자연스럽다
CALM_GENRES = {"코미디", "동화·그림책"}   # 2026-09-12: 일상·스포츠 삭제에 맞춰 정리

WEAPON = [
    # (이름, 어울리는 장르 — 빈 튜플이면 아무 장르나, 메모)
    ("장창", ("무협", "하이 판타지", "신화·설화"), "길어서 가장 잘 잡힌다"),
    ("삼지창", ("신화·설화", "하이 판타지"), "길고 끝 모양이 뚜렷하다"),
    ("전투용 도끼", ("하이 판타지", "탐험·모험"), "실루엣이 강하다"),
    ("큰 망치", ("하이 판타지", "스팀펑크"), "무겁게 들린 자세가 나온다"),
    ("사슬낫", ("무협", "호러 한 스푼"), "사슬이 몸에 감기지 않게 주의"),
    ("쌍절곤", ("무협",), "두 손 동작으로 쓰면 잘 잡힌다"),
    ("쇠부채", ("무협", "신화·설화"), "펼친 상태로 그려야 읽힌다"),
    ("채찍", ("탐험·모험", "무협"), "몸에 감기지 않게 — 늘어뜨린 상태로"),
    ("작살", ("탐험·모험", "마도과학"), "길어서 안정적"),
    ("방패", ("하이 판타지", "신화·설화"), "무늬를 크게 넣어야 읽힌다"),
    ("지팡이", ("하이 판타지", "신화·설화", "무협"), "가장 무난하다"),
    ("쇠지팡이", ("느와르", "스팀펑크"), "신사용 지팡이 — 무기로도 읽힌다"),
    ("투척용 단검 여러 자루", ("무협", "느와르"), "벨트에 꽂힌 상태로"),
    ("편곤(쇠도리깨)", ("무협", "신화·설화"), "사슬 부분이 짧아야 안전하다"),
    ("큰 렌치", ("스팀펑크", "마도과학"), "기계 기사와 맞는다"),
    ("표창 한 줌", ("무협",), "손에 펼쳐 든 상태로"),
    ("나무 목검", ("동화·그림책", "코미디", "스포츠"), "진짜 무기가 아니라 소품처럼"),
    ("긴 우산", ("느와르", "일상"), "무기처럼 들고 다니는 우산"),
]


def pick_weapon(rnd: random.Random, genre: str) -> tuple[str, str] | None:
    """장르에 어울리는 무기를 고른다. 자주 None 을 돌려준다 — 무기는 필수가 아니다."""
    none_rate = WEAPON_NONE_CALM if genre in CALM_GENRES else WEAPON_NONE
    if rnd.random() < none_rate:
        return None
    cand = [w for w in WEAPON if not w[1] or genre in w[1]]
    if not cand:
        return None
    name, _, note = rnd.choice(cand)
    return name, note

CAMERA = [
    ("정면 3/4 · 눈높이", "three-quarter view, eye level"),
    ("완전 측면", "(from side:1.3), full profile"),
    ("앙각", "(from below:1.3), low angle"),
    ("부감", "(from above:1.3), high angle"),
    ("더치 앵글", "dutch angle, tilted"),
]
FRAMING = [
    ("카우보이 샷", "(cowboy shot:1.3), thigh up"),
    ("전신", "(full body:1.2)"),
    ("상반신", "(upper body:1.2)"),
    ("무릎 위 · 앉기", "(cowboy shot:1.3), sitting"),
]
HUE = [
    "진홍", "주황", "호박", "노랑", "라임", "초록", "청록", "하늘", "남색", "보라",
    "자주", "분홍", "적갈", "베이지", "회색", "검정", "흰색", "구릿빛", "은빛", "금빛",
]


def used_values() -> dict[str, set[str]]:
    """최근 배치에서 쓴 값을 모은다. 여기 있는 건 다시 안 뽑는다."""
    used = {"era": set(), "role": set(), "tone": set(), "hue": set(), "sex": [], "bucket": []}
    specs = sorted(glob.glob("creative/*/spec.yaml"), key=os.path.getmtime)[-RECENT:]
    for p in specs:
        s = open(p, encoding="utf-8").read()
        for key, field in (("era", "시대_문화"), ("role", "역할"), ("tone", "톤")):
            m = re.search(rf"^\s*{field}:\s*(.+)$", s, re.M)
            if m:
                v = m.group(1).split("#")[0].strip()
                used[key].add(v)
                if key == "era":
                    # 옛 spec 의 표기를 계열 표에 맞춰본다
                    for name, b in ERA:
                        if name in v or v in name:
                            used["bucket"].append(b)
                            break
                    else:
                        used["bucket"].append("전통" if "전통" in v or "농촌" in v or "산" in v else "기타")
        m = re.search(r"^\s*palette:\s*(.+)$", s, re.M)
        if m:
            for h in HUE:
                if h in m.group(1):
                    used["hue"].add(h)
        used["sex"].append("1girl" if re.search(r"1girl|female focus", s) else "1boy")
    return used


def near(value: str, pool: set[str]) -> bool:
    """부분 문자열로도 겹침을 잡는다 — '전통 공방' 과 '공방' 을 같은 것으로 본다."""
    return any(v and (v in value or value in v) for v in pool)


def roll(rnd: random.Random, used: dict) -> dict:
    def pick(pool, blocked):
        cand = [x for x in pool if not near(x if isinstance(x, str) else x[0], blocked)]
        return rnd.choice(cand or pool)

    # 성별은 최근에 많이 나온 쪽의 반대로 기운다
    sexes = used["sex"]
    sex = "1boy" if sexes.count("1girl") > sexes.count("1boy") else "1girl"
    if rnd.random() < 0.25:                      # 가끔은 그냥 뒤집는다
        sex = "1girl" if sex == "1boy" else "1boy"

    # 후면 3/4 는 풀에서 뺐다 (2026-09-12).
    # 1차 판단은 "손에 든 상징물일 때만 위험하다" 였는데, 상징물이 '입는 것'(털 망토)인
    # dasom-01 에서도 같은 결과가 나왔다 - 등이 화면 중앙이고 상의가 찢어진 형태로 렌더됐다.
    # 지금까지 후면이 나온 배치는 전부 폐기했다: bangul(수달 융합) / jinam(상징물이 등에 박힘)
    # / changpo(엉덩이 중심) / dasom(맨등). 예외를 두지 않는다.
    symbol = rnd.choice(SYMBOL_FORM)
    cam_pool = [c for c in CAMERA if c[0] != "후면 3/4"]
    cams = rnd.sample(cam_pool, 4)
    frames = [FRAMING[0], rnd.choice(FRAMING[1:]), FRAMING[0], rnd.choice(FRAMING[1:])]
    rnd.shuffle(frames)
    hues = rnd.sample([h for h in HUE if h not in used["hue"]] or HUE, 2)

    # 최근 BUCKET_BAN 건이 같은 계열이면 그 계열을 통째로 막는다
    recent_b = used["bucket"][-BUCKET_BAN:]
    banned = {recent_b[0]} if len(recent_b) >= BUCKET_BAN and len(set(recent_b)) == 1 else set()
    era_pool = [n for n, b in ERA if b not in banned and not near(n, used["era"])] or [n for n, _ in ERA]
    era = rnd.choice(era_pool)

    genre = rnd.choice(GENRE)
    weapon = pick_weapon(rnd, genre)

    return {
        "시대·문화": f"{era} [{ERA_BUCKET[era]}]",
        "장르·질감": genre,
        "무기": weapon,
        "역할": pick(ROLE, used["role"]),
        "모티프": rnd.choice(MOTIF),
        "톤": pick(TONE, used["tone"]),
        "성별": sex,
        "상징물 형태": symbol,
        "주색·보조색": hues,
        "카메라 4장": list(zip(cams, frames)),
    }


def main() -> None:
    # 윈도우 콘솔 기본이 cp949 라 한국어·기호가 깨진다
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=1)
    ap.add_argument("--seed", type=int, default=None)
    a = ap.parse_args()
    rnd = random.Random(a.seed)
    used = used_values()

    print(f"최근 {RECENT}건에서 쓴 값 (제외 대상)")
    print(f"  시대·문화 {sorted(used['era'])}")
    print(f"  역할      {sorted(used['role'])}")
    print(f"  색        {sorted(used['hue'])}")
    print(f"  성별      {used['sex']}")
    for n in range(a.n):
        r = roll(rnd, used)
        print(f"\n─── 뽑기 {n + 1} ───")
        for k in ("시대·문화", "장르·질감", "역할", "모티프", "톤", "성별"):
            print(f"  {k:9} {r[k]}")
        form, note = r["상징물 형태"]
        print(f"  {'상징물':9} {form}  / {note}")
        if r["무기"]:
            wname, wnote = r["무기"]
            print(f"  {'무기':9} {wname}  / {wnote}")
        else:
            print(f"  {'무기':9} 없음")
        print(f"  {'색':9} {r['주색·보조색'][0]} + {r['주색·보조색'][1]}")
        print("  카메라 4장")
        for i, ((cam, cq), (fr, fq)) in enumerate(r["카메라 4장"], 1):
            print(f"    {i}. {cam} + {fr}  ->  {cq}, {fq}")


if __name__ == "__main__":
    main()
