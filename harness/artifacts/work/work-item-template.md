# <work-id>

필요한 파일만 `artifacts/work/<work-id>/`에 만든다. 모든 파일을 매번 만들지 않는다.

## 목차

- [STATUS.md](#statusmd)
- [HANDOFF.md](#handoffmd)

## STATUS.md

```md
# Status: <work-id>

- 마지막 갱신: <ISO 8601 또는 날짜>
- 이전 담당: Claude | Codex | 세션 이름
- 다음 담당: Claude | Codex | 사람 승인 대기
- 현재 단계: 분석 | 구현 | 검토 | 검증 | 완료
- 상태: 진행 가능 | 차단됨 | 사람 승인 대기 | 완료

## 완료된 일

## 차단 또는 주의 사항

## 다음 행동
1.
```

## HANDOFF.md

```md
# Handoff: <work-id>

## 먼저 읽을 순서
1. `artifacts/work/<work-id>/STATUS.md`
2.

## 핵심 결정

## 변경 파일

## 검증 결과
| 명령 | 결과 | 실행 여부 | 비고 |
| --- | --- | --- | --- |

## 참조 산출물
- `artifacts/feature-team/...`: <핵심 결론>

## 미해결 항목과 사람 승인

## 다음 담당자가 할 일
1.
```
