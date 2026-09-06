---
name: create-music
description: 승인된 일러스트와 Creative Spec 으로 곡 제목·가사·Suno Style 프롬프트를 쓰고, Suno 입력 안내 후 사람의 곡 선택을 기다린다.
---

# create-music

전제: `production/<id>.yaml` 의 `illustration.status == SUCCESS`. 아니면 멈춘다.

## 1. 가사 / 스타일 작성

`creative/<id>/spec.yaml` 과 `creative/<id>/selected.png` 를 읽고:

```bash
cp creative/_template/lyrics.md creative/<id>/lyrics.md
cp creative/_template/suno-style.md creative/<id>/suno-style.md
```

- 가사는 한국어. 캐릭터 `backstory` 와 톤이 맞아야 한다.
- 구조 태그(`[Verse]`, `[Chorus]` …)를 유지하고 2분 내외로 쓴다.
- Style 프롬프트는 `music:` 섹션(genre/mood/vocal/bpm/instruments)에서 파생한다. 200자 내외.
- 게임 BGM 으로도 쓰이므로 **루프해도 어색하지 않은** 구성을 노린다.

`music.status: RUNNING`, `music.title` 기록.

## 2. Suno 실행

Suno 는 공개 API 가 없으므로 브라우저 자동화(Ego Lite) 또는 사람이 직접 입력한다.
자동화가 없으면 아래를 그대로 안내한다.

```
Suno → Create → Custom Mode
  Lyrics : creative/<id>/lyrics.md 내용
  Style  : creative/<id>/suno-style.md 의 Style 블록
  Title  : suno-style.md 의 Title
```

## 3. 사람 승인 (자동 선택 금지)

`music.status: WAITING_APPROVAL` 로 바꾸고 **어느 곡을 쓸지 물어보고 멈춘다.**

받은 파일을 `creative/<id>/song.mp3` 로 두고
`music: { status: SUCCESS, selected: <파일명> }`, `phase: game` 으로 갱신한다.

마음에 안 들면 `REJECTED` → `attempts` 증가 → 가사/스타일을 고쳐 재생성.

## 다음

`/integrate-character`
