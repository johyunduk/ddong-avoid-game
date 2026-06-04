# Session Context

## User Prompts

### Prompt 1

요즘 llm wiki 라는게 자주 보이는데 뭔지 자세히 알려줘.

### Prompt 2

안드레 카파시라는 사람이 제안한거라던데 모르겠으면 웹 서치를 해 임마

### Prompt 3

사용을 어떻게 하는건데?

### Prompt 4

현재 나는 옵시디언을 쓰고 있고 지금 이 프로젝트를 저렇게 llm wiki로 관리하고 싶은데 어떻게 하면 되는건지 자세히 알려줘.

### Prompt 5

이것들은 원래 자동으로 적용을 하는게 아니라 내가 지시를 해야 하는건가?

### Prompt 6

[Request interrupted by user for tool use]

### Prompt 7

ingest 해달라고만 말하면 되는건가?

### Prompt 8

CLAUDE.md 에 추가하고 싶어. 근데 그 전에 최신 버전으로 CLAUDE.md 를 수정하고 싶어. 근데 최근에 웹에서 보면 CLAUDE.md 를 너무 길게 하는것도 좋지 않다고 들었어. 웹서치해서 현재 내 CLAUDE.md 의 문제점을 파악하고 나서 알려줘.

### Prompt 9

진행해줘.

### Prompt 10

현재 이 프로젝트의 내용과 위키에서의 내용과 다른 부분이 있나?

### Prompt 11

배틀 시스템이랑 캐릭터 수 ingest해줘

### Prompt 12

근데 지금 구조가 llm wiki 에 맞는 구조인가?

### Prompt 13

재편 해줘.

### Prompt 14

일단 이거 깃 푸시부터 하자

### Prompt 15

그 일러스트 같은거나 캐릭터별 노래(추가 예정) 이런거를 관리하면서 sns 같은데서 관리를 해보려고 해. 인스타나 유튜브에서. 어떻게 생각해?

### Prompt 16

구체적으로 기획해봐.

### Prompt 17

일단 이 기획 문서로 작성하고 ingest 도 해줘

### Prompt 18

여기서 추가나 수정하면 좋을게 뭐가 있을까? 그리고 노래나 일러스트 공개 순서는 무조건 치비일거야. 게임의 주인공이니까

### Prompt 19

해줘 ingest 도 하고

### Prompt 20

사업 방향성 이런것도 작성해줄 수 있나?

### Prompt 21

지금 근데 llm wiki 가 안드레 카파시가 말한 방법론을 잘 따르고 있나?

### Prompt 22

제대로 해줘.

### Prompt 23

This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

Summary:
1. Primary Request and Intent:
   The user is working on a Phaser 3 hyper-casual game ("똥 피하기 게임") and had several interconnected requests:
   1. Learn about Andrej Karpathy's LLM Wiki concept and how to use it
   2. Apply LLM Wiki to their project using Obsidian as the wiki layer
   3. Refactor CLAUDE.md from 430 lines to ~...

### Prompt 24

유튜브나 인스타그램 사업자 등록 없이 수익화가 가능한가?

### Prompt 25

2026년 최신화 해서 다시 알려줘봐. 그리고 유튜브에 올릴거는 suno ai 를 통해 제작한 노래에 이 프로젝트의 일러스트를 사용하여 영상만든거를 올릴거거든

### Prompt 26

유료야.

### Prompt 27

위키 업데이트 해줘

### Prompt 28

# Karpathy LLM Wiki — Claude Code 설정 가이드

## 기존 프로젝트에 추가하는 방법

기존 프로젝트 코드나 노트는 **그대로 두면 됩니다.** 새로운 `raw/`와 `wiki/` 폴더를 추가하고, 기존 파일들을 점진적으로 소화(ingest)시키면 됩니다.

### 폴더 구조 (기존 프로젝트 기준)

```
your-project/
├── src/                  ← 기존 코드 (손대지 않음)
├── docs/                 ← 기존 문서 (손대지 않음)...

### Prompt 29

해줘.

### Prompt 30

내가 캐릭터별로 노래 만들어서 앨범이나 뭐 그런식으로 한다고 말 했었나?

### Prompt 31

그냥 캐릭터별로 많아지면 묶거나 하겠지만 지금은 앨범까지는 크게 생각은 없어. 그러면 캐릭터별 노래에 대한 분위기, 장르 이런거 정리를 좀 하고 싶은데.

### Prompt 32

일단 치비, 루트 각각 나눠줘. 그리고 이미지보고 분위기 파악해서 컨셉잡아줘봐. 그리고 구미랑 무기가 빠진거 같아.

### Prompt 33

아 그리고 참고할 만한 가수나 노래가 있어. 일단 치비는 가수 넬의 기억을 걷는 시간 느낌을 참고하면 좋을거 같아.

### Prompt 34

일단 너가 어울리는거로 추천해서 넣어줘봐.

### Prompt 35

루트는 일단 랩 관련이면 좋겠는데

### Prompt 36

일단은 이거로 하자

### Prompt 37

캐릭터 스타일 프롬프트랑 가사 작성을 요청하려고 하는데 전문적인 느낌으로 만들고 싶은데 에이전트나 스킬을 만들어줄 수 있나?

### Prompt 38

치비 수노 스타일 프롬프트랑 가사 작성해줘.

### Prompt 39

이렇게 작성된 것들 문서에 별도 캐릭터별 디렉토리 만들어서 작성해줘. 그리고 스킬에도 다음부턴 그렇게 저장하도록 작성해주고.

### Prompt 40

이렇게 작성된 것들 문서에 별도 캐릭터별 디렉토리 만들어서 작성해줘. 그리고 스킬에도 다음부턴 그렇게 저장하도록 작성해주고. 아 그리고 이거 각각 복사하기 쉽게 작성해줘.

### Prompt 41

이거 근데 최신 버전 기준이지? 현재 나는 suno ai v5.5 pro 야

### Prompt 42

컨셉은 가지지만 게임과 너무 연관될 필요가 없어. 오히려 대중적인 느낌이어야 해.

### Prompt 43

## Suno Custom Mode Tags 이거 따로 작성하지 말고 가사에 넣어서 처리해줘. 그리고 장르별 가사 작성법 그런거 웹서치 및 학습해서 잘 좀 써줘. 대한민국 기준으로 말야. 그렇게해서 치비꺼 완전히 새롭게 다시 써줘.

### Prompt 44

이런 학습한 내용도 어디 써놨니? 이거는 캐릭터별이 아니라 장르별디렉토리에 작성해둬.

### Prompt 45

This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.

Summary:
1. Primary Request and Intent:
   The conversation covered multiple topics building on a previous session about a Phaser 3 game ("똥피하기"):
   - Complete the LLM Wiki with IMPORT_GATE concept page and INDEX update
   - Research YouTube/Instagram monetization without Korean business registration
   - Research Suno AI v5.5 usage for...

### Prompt 46

랩 장르도 학습 및 분석해서 작성하고 루트꺼 스타일프롬프트랑 가사 작성해줘.

### Prompt 47

캐릭터별 이것도 파일만 있는게 아니라 캐릭터별로 디렉토리가되서 거기에 하나씩 추가하는 방향으로 해줘. 그리고나서 루트는 dark synthwave, cyberpunk pop, confident female rap & vocals, cool and smirking tone, glitchy electronic beats, pulsing bassline, neon atmosphere, distorted synth leads, hi-hat patterns, mysterious and sharp, fast tempo, 128 BPM, midnight hacker aesthetic, blue and amber color palette 이런 느낌의 방향으로도 하나 작...

### Prompt 48

루트는 여자야.

### Prompt 49

그리고 모든 캐릭터들 가사 작성할 떄 게임의 내용과는 연결짓지 말이줘.

### Prompt 50

루트 저 다크에 트랩 섞은 느낌으로 하나 만들어줘봐. 트랩 장르도 분석해서 작성하고.

### Prompt 51

가사가 너무 짧아서 느린 느낌이 나는데? 랩 가사 어떻게 쓰는지 배워와.

### Prompt 52

치비 딘 스타일로도 하나 만들어줘.

### Prompt 53

치비와 루트 같이 듀엣으로 딘, 헤이즈 and july 같은 노래도 만들어줘.

