---
name: create-music
description: 일러스트 분위기에 맞춰 곡 제목·가사·Suno Style 프롬프트를 쓰고, Suno 로 곡을 뽑아 공유 링크를 심사실에 올린 뒤 사람의 채택을 기다린다.
---

# create-music

담당: **composer (w8 음악·Claude)**. 게임 코드는 건드리지 않는다.

들어오는 길이 두 가지다.

| | 신규 캐릭터 | 심사실 곡 주문 |
|---|---|---|
| 계기 | `/release-character` 가 일러스트 승인 후 부름 | 폰에서 캐릭터를 골라 주문 |
| 전제 | `production/<id>.yaml` 의 `illustration.status == SUCCESS` | 이미 게임에 등록된 캐릭터 |
| 작업 폴더 | `creative/<id>/` | `creative/_music/<캐릭터id>/` |
| 결과 | `creative/<id>/song.mp3` | 심사실에 Suno 링크 → 사람이 채택 |

주문 id 를 받았으면 아래로 간다. 못 받았으면 신규 캐릭터 경로다.

```bash
python scripts/music-order.py --pending          # 대기 중인 주문
python scripts/music-order.py --id <주문id>      # 상세
```

## 1. 분위기 잡기 — **일러스트를 직접 본다**

곡의 분위기는 설정 문서가 아니라 **그림**에서 나온다. 반드시 이미지를 열어서 본다.

- 신규: `creative/<id>/spec.yaml` + `creative/<id>/selected.png`
- 기존: `src/utils/character.ts` 에서 `illustPath` 를 찾아 그 파일을 열고,
  `src/config/abilityParams.ts` 의 `<ID>_DESC` 와 등급까지 읽는다

색온도·표정·자세·배경이 장르와 템포를 정한다. 등급이 높을수록 곡도 세게 간다.

## 2. 가사 / 스타일 작성

```bash
mkdir -p creative/_music/<캐릭터id>          # 기존 캐릭터일 때
cp creative/_template/lyrics.md      creative/_music/<캐릭터id>/lyrics.md
cp creative/_template/suno-style.md  creative/_music/<캐릭터id>/suno-style.md
```

- 가사는 한국어. 캐릭터의 성격·배경과 톤이 맞아야 한다.
- 구조 태그(`[Verse]`, `[Chorus]` …)를 유지하고 2분 내외로 쓴다.
- Style 프롬프트는 200자 내외 (genre / mood / vocal / bpm / instruments).
- 게임 BGM 으로도 쓰이므로 **루프해도 어색하지 않은** 구성을 노린다.

신규 캐릭터 경로면 `production/<id>.yaml` 에 `music.status: RUNNING`, `music.title` 을 기록한다.

## 3. Suno 실행

호출은 **반드시 이 스크립트를 거친다.** 절차를 여기 본문에 박아 두지 않는 이유는
나중에 공식 API 가 열렸을 때 이 파일을 안 고치기 위해서다 (스크립트 주석 참고).

```bash
python scripts/suno-submit.py \
  --lyrics creative/_music/<캐릭터id>/lyrics.md \
  --style  creative/_music/<캐릭터id>/suno-style.md \
  --title  "<곡 제목>" --out creative/_music/<캐릭터id>
```

- **종료 코드 0** — API 모드. 곡이 `--out` 에 저장됐다. 4번으로 간다.
- **종료 코드 2** — 브라우저 모드. 출력된 Title / Styles / Lyrics 를 그대로 들고
  Chrome 으로 `suno.com` → Create → **Custom** 에 넣는다.
  곡이 나오면 **내려받지 말고 곡마다 공유 링크를 복사한다.**

브라우저를 모는 것은 composer 뿐이다 (`CLAUDE.md` 역할 규칙).

### 로그인이 풀려 있으면 거기서 멈춘다

로그인·CAPTCHA·결제는 **사람 몫이다. 대신 하지 않는다.** 주문을 되돌리고 알린 뒤 끝낸다.

```bash
python scripts/music-order.py --id <주문id> --status pending --note "Suno 로그인 필요"
```

## 4. 후보 링크 올리기 (자동 채택 금지)

**음원 파일은 다루지 않는다.** 심사에는 파일이 필요 없고, 브라우저 다운로드는 자주 끊긴다.

```bash
python scripts/music-order.py --id <주문id> --title "<곡 제목>" \
  --links <suno링크1> <suno링크2> --labels "밝은 쪽" "차분한 쪽"
```

주문이 `review` 로 바뀌고, 폰의 심사실에 **Suno 에서 듣기 ↗** 링크가 뜬다.
`PushNotification` 으로 한 줄 알리고 **거기서 끝낸다.**
사람이 Suno 에서 직접 듣고 고른다 — 채택 뒤 composer 가 할 일은 없다.

신규 캐릭터 경로면 `music.status: WAITING_APPROVAL` 로 두고 물어본 뒤 멈춘다.

## 5. 채택된 곡

곡 파일을 저장소로 가져오는 것은 **사람 몫이다.** 워커도 다시 부르지 않는다.
게임 BGM 으로 넣을지도 사람이 따로 결정한다 — 코드는 건드리지 않는다.

신규 캐릭터 경로면 받은 파일을 `creative/<id>/song.mp3` 로 두고
`music: { status: SUCCESS, selected: <파일명> }`, `phase: game` 으로 갱신한다.
마음에 안 들면 `REJECTED` → `attempts` 증가 → 가사/스타일을 고쳐 재생성.

## 다음

신규 캐릭터: `/integrate-character`
