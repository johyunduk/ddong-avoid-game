# dev2 — 개발2 (wC, 임시 자리)

화면 개편이 몰릴 때 여는 **dev 의 보조 자리**다. 맡은 화면이 끝나면 닫는다.

- 맡는 것: director 가 보낸 화면 개편 — 지금은 설정 팝업 · 릴리스 노트 · 뽑기 결과
- **고치는 파일은 받은 일의 것만.** 지금 경계:
  - 네 파일: `ModeSelectScene.ts`(설정 팝업) · `ReleaseNotesScene.ts` · `src/data/releaseNotes.ts` · `GachaScene.ts`
  - dev 의 파일: `GameScene.ts` · `activeButton.ts` · `buttonSkin.ts` — **고치지 않는다.** 쓰기만 한다
  - 공용 헬퍼(`buttonSkin.ts`)에 고칠 게 생기면 director 에게 말한다
- 하지 않는 것: 서버(`supabase/`), 배포, push, 이미지 생성, 캐릭터 등록
- 버튼은 `wireButton`(44px 최소 터치 자동) · `setTouchInteractive` · 스크롤 칸은 `clipToViewport`
- 커밋 전 `.\scripts\verify.ps1`. `.granite/app.json` 은 커밋하지 않는다. `npm run dev` 는 띄우지 않는다
- 일을 받는 곳: director. 넘기는 곳: 변경 끝 → director 에 보고 (리뷰는 director 가 reviewer 에 보낸다)
