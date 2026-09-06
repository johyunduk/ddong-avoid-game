---
name: publish
description: 완성된 SNS 콘텐츠를 비공개로 업로드하고, 사람이 "PUBLISH" 라고 답할 때까지 공개 전환을 보류한다.
---

# publish

전제: `social.status == SUCCESS`.

**처음부터 공개하지 않는다.** 항상 비공개/미등록(unlisted) 업로드 → 사람 확인 → 공개.

## 1. 산출물 점검

```
release/social/<id>/
├── youtube.mp4
├── youtube.json
├── instagram.mp4
├── instagram.json
└── thumbnail.png
```

파일이 하나라도 없으면 `/create-social` 로 돌아간다.
영상은 실제로 재생되는지(길이·오디오 유무) `ffprobe` 로 확인한다.

## 2. 업로드

업로드 자동화는 아직 구성되지 않았다 (YouTube API 자격증명 미설정).
현재는 사용자에게 파일 경로와 메타데이터를 정리해 전달하고 수동 업로드를 요청한다.

자동화를 붙일 때는 공식 API 를 쓴다 (`privacyStatus: "unlisted"` 로 시작).
브라우저 자동화는 마지막 수단이다.

`publish: { status: WAITING_APPROVAL, youtube: uploaded_unlisted, ... }`

## 3. 공개 승인

사용자가 정확히 **`PUBLISH`** 라고 답하기 전에는 공개로 바꾸지 않는다.
승인 후 공개 처리하고:

```yaml
publish: { status: SUCCESS, youtube: public, instagram: public }
phase: done
```

마지막으로 변경 사항을 커밋할지 사용자에게 묻는다 (임의로 push 하지 않는다).
