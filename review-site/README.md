# review-site

일러스트 후보 심사 페이지. **게임과 분리된 별도 Vercel 프로젝트**로 배포한다
(게임 사이트에 두면 플레이어에게 경로가 노출되므로).

정적 파일 한 장뿐이라 빌드가 없다. 데이터는 전부 Supabase Edge Function
(`supabase/functions/review`) 에서 가져온다.

## 배포

```bash
cd review-site
npx vercel --prod
```

첫 배포 때 프로젝트 이름을 물으면 `ddong-review` 등으로 만든다.
배포 후 나온 주소를 프로젝트 루트 `.env.local` 에 적어야 심사 링크가 완성된다.

```
REVIEW_SITE_URL=https://ddong-review.vercel.app
```

## 접근 제어

`?b=<배치>&t=<토큰>` 의 토큰(16자리 랜덤)이 유일한 열쇠다. 링크를 아는 사람은
누구나 열람·판정할 수 있다. 더 조이려면 함수에 PIN(`REVIEW_PIN` 시크릿)을
추가하는 방법이 있다.

`Referrer-Policy: no-referrer` 로 토큰이 외부 요청의 리퍼러에 실려나가지 않게 막았고,
`X-Robots-Tag` 로 색인을 막았다.
