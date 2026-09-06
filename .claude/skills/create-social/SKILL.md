---
name: create-social
description: 캐릭터 일러스트·음악·게임플레이 캡처로 유튜브 쇼츠/인스타 릴스 영상과 썸네일을 만들고 SNS 문구(제목·설명·해시태그)를 작성한다.
---

# create-social

전제: `review.status == SUCCESS`.

## 1. 게임플레이 캡처

자동 캡처는 없다. 없으면 사용자에게 요청한다.

```
필요: 해당 캐릭터로 플레이한 20초 이상 화면 녹화
저장: creative/<id>/gameplay.mp4
```

## 2. 영상 생성

```bash
python scripts/build-social.py --id <id> \
  --illust creative/<id>/selected.png \
  --gameplay creative/<id>/gameplay.mp4 \
  --music creative/<id>/song.mp3 \
  --name "<캐릭터 이름>" --tagline "<등급 · 한 줄 소개>" \
  --preset youtube

python scripts/build-social.py --id <id> ... --preset instagram
```

템플릿: 0~3초 일러스트 / 3~8초 이름·소개 / 8~25초 플레이 / 25~30초 로고·CTA.
매번 새로 구성하지 말고 이 템플릿에서 소재만 교체한다.

ffmpeg 가 없으면 스크립트가 알려준다 → `winget install Gyan.FFmpeg`.

## 3. 메타데이터 작성

`release/social/<id>/youtube.json`

```json
{ "title": "", "description": "", "tags": [], "hashtags": [], "categoryId": "20", "privacyStatus": "unlisted" }
```

`release/social/<id>/instagram.json`

```json
{ "caption": "", "hashtags": [] }
```

- 제목은 40자 이내, 캐릭터 이름과 게임명("똥 피하기")을 포함한다.
- 설명은 `spec.yaml` 의 `backstory` 를 2~3문장으로 다듬어 쓴다.
- 해시태그는 게임/장르/캐릭터 3종을 섞되 15개를 넘기지 않는다.

`social.status: SUCCESS`, `phase: publish`.

## 다음

`/publish`
