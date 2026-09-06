# production/ — 파이프라인 상태

캐릭터 릴리스 하나당 YAML 파일 하나. 이 파일이 **각 단계의 진행 상태에 대한 단일 진실**이며,
Herdr 의 각 에이전트(빌더/리뷰어/오퍼레이터)는 이 파일만 보고 다음 작업을 판단한다.

```
production/
├── _template.yaml      # 새 릴리스 시작 시 복사
├── spring-night-01.yaml
└── summer-pool-01.yaml
```

## 상태 값

각 단계는 아래 중 하나만 가진다.

| 상태 | 의미 |
|---|---|
| `PENDING` | 아직 시작 안 함 |
| `RUNNING` | 진행 중 |
| `WAITING_APPROVAL` | 결과물 생성 완료, 사람 승인 대기 |
| `SUCCESS` | 완료 |
| `FAILED` | 기술적 실패 (retry 3회 후) |
| `REJECTED` | 생성은 됐지만 사람이 반려 → 새 variation 생성 |
| `BLOCKED` | 사람 개입 필요 (리뷰 3회 실패 등) |

**FAILED / BLOCKED 상태에서 다음 단계로 넘어가지 않는다.**

## 사람 승인 지점 (자동화하지 않음)

1. 일러스트 최종 선택
2. 음악 최종 선택
3. 최종 공개(Publish)
