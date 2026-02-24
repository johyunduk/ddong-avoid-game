# Session Context

## User Prompts

### Prompt 1

야 이 프로젝트에서 문제가 있어. 브라우저에서 실행을 할 수 있다보니 브라우저의 소스를 수정해서 시간과 속도를 느리게 만들수 있더라고..

### Prompt 2

백엔드 서버가 있으면 막을 방법이 더 있어지나?

### Prompt 3

그러면 어차피 가챠 시스템을 도입할 예정이어서 안그래도 사용자 식별을 위해 로그인 기능이나 뭐 그런게 필요할 거 같았는데 이 때 firebase vs supabase 를 비교해줘. 현재 내 프로젝트에 더 적합한걸 골라줘. 그리고 일단 시작은 프리티어로 시작하고 싶어 무료로.

### Prompt 4

일단은 supabase 부터 시작하자. 브랜지는 내가 feature/supabase 로 설정해뒀어. 일단 뭐 부터 구현할지 계획을 알려줘봐.

### Prompt 5

일단 이 구현 계획 ~/Documents/Obsidian 에 파라 구조에 맞게 이 내용을 작성해줘.

### Prompt 6

익명로그인 말야. 이거 나중에 앱인토스와도 연동이 쉬울까?

### Prompt 7

그러면 일단은 토스 연동은 한동안은 할 생각이 없는데 그럼 어떻게 하는게 가장 좋을까? 하지만 연동 고려는 하면서 말야

### Prompt 8

그러면 페이즈 1 어떻게 해야 하는지 먼저 알려줘

### Prompt 9

프로젝트 생성시 security 에서 체크박스 두개 뭐를 선택해서 해야하나?

### Prompt 10

Enable Data API
Autogenerate a RESTful API for your public schema. Recommended if using a client library like supabase-js.

Enable automatic RLS
Create an event trigger that automatically enables Row Level Security on all new tables in the public schema.

### Prompt 11

복사해 뒀어. 프로젝트는 생성중이고

### Prompt 12

VITE_SUPABASE_ANON_KEY 이게 publishable api key 인가?

### Prompt 13

다 넣은거 같아. 프로젝트는 생성됐고

### Prompt 14

근데 백엔드 코드도 여기에 생성이 되는건가 아니면 supabase 에서 서버리스로 처리할건가?

### Prompt 15

진행전에 Vercel Api Route 가 뭔지 설명해줘.

### Prompt 16

이해는 됐는데 supabase의 서버리스를 사용안하고 verel api route 를 사용하는 이유는 뭐지?

### Prompt 17

나중에 인증이 들어간다고 하더라도? 그게 소셜 인증이던 토스 인증이던?

### Prompt 18

근데 앱인토스는 vercel 이 필요가 없어지지 않나?

### Prompt 19

너가 웹서치 해서 알아봐줘.

### Prompt 20

그러면 vercel api route 를 없애는게 나중엔 좋은거 아닌가? supabase 만 쓰면 그것만 신경쓰면 되는데 vercel 까지 신경써야 하는거 아닌가?

### Prompt 21

방향 바꿔보자

### Prompt 22

페이즈 2 진행하자

### Prompt 23

메뉴명이나 그런게 너가 알고 있는거랑 다른거 같은데 최신화좀 해줘

### Prompt 24

Anonymous users will use the authenticated role when signing in
As a result, anonymous users will be subjected to RLS policies that apply to the public and authenticated roles. We strongly advise reviewing your RLS policies to ensure that access to your data is restricted where required. 1번 체크하니까 이게 뜨는데 그냥 넘어가면 되나

### Prompt 25

아직 DDL 다시 줘봐

### Prompt 26

Run 했어

### Prompt 27

로컬에서 실행해 봤는데 signup response 가 422 {code: "anonymous_provider_disabled", message: "Anonymous sign-ins are disabled"}
code
: 
"anonymous_provider_disabled"
message
: 
"Anonymous sign-ins are disabled" 이렇게 오는데

### Prompt 28

아 내가 저장을 안했었네. 200 응답 왔어. 그러면 테이블 데이터가 쌓인걸 어떻게 볼 수 있지?

### Prompt 29

생겼어

### Prompt 30

자 phase3 시작하자

### Prompt 31

둘 다 완료했어

### Prompt 32

ebkffyzjjfzegrwvrzqw

### Prompt 33

This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

Analysis:
Let me chronologically analyze this conversation to create a thorough summary.

1. **Initial Problem**: User reported that the browser-based game can be cheated by modifying browser source to slow down time and speed.

2. **Anti-cheat Discussion**: Analyzed existing code (GameScene.ts, gameVerification.ts, leaderboard.ts). Found that g...

### Prompt 34

일단 phase4 진행을 하기 전에 랭킹보드를 들어갔을 때 로컬에서 실행한 경우 아무 내용이나 나오게 구현되어 있나?

### Prompt 35

로컬에서 실행해도 mock 데이터가 아니게 처리해줘

### Prompt 36

리더보드 들어갔을 때 {code: 401, message: "Invalid JWT"}
code
: 
401
message
: 
"Invalid JWT" 이 에러가 나네 401 코드로. https://ebkffyzjjfzegrwvrzqw.supabase.co/functions/v1/leaderboard-top 이걸 호출하는듯

### Prompt 37

https://ebkffyzjjfzegrwvrzqw.supabase.co/functions/v1/leaderboard-submit 랭킹 제출 시 401에러가 뜨네. 
{code: 401, message: "Invalid JWT"}
code
: 
401
message
: 
"Invalid JWT"

### Prompt 38

[Request interrupted by user for tool use]

### Prompt 39

아니 근데 점수 조회는 인증이 없어도 된다지만 점수 등록은 나라는걸 알아야 하지 않나?

### Prompt 40

저렇게 해도 디비에 그러면 사용자 식별이 된다는건가?

### Prompt 41

오 점수 등록이 됐어. 근데 랭킹 보는 화면 들어갈 때 내가 마지막으로 플레이한 난이도가 기본으로 설정되서 조회할 수 있나?

### Prompt 42

일단 git add . 은 해뒀어. 커밋하고 푸시해줘.

