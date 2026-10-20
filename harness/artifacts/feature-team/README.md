# feature-team 산출물 지도

`feature-team-orchestrator`가 실행한 기능 개발 사이클의 중간/최종 산출물이 남는 위치입니다.

| 파일 | 담당 | 내용 | 다음 단계가 읽는 방법 |
| --- | --- | --- | --- |
| `00-input.md` | Orchestrator | 사용자 요청, 범위, 사람 승인 지점 | spec-planner가 계획 근거로 읽음 |
| `00-figma-context.md` | Orchestrator | Figma 노드가 있을 때 `get_design_context` 원문 전체(요약 없음) | spec-planner·integration-reviewer가 Read로 읽음 |
| `00-figma-geometry.md` | Orchestrator | 절대 좌표·crop·`contents` 그룹·고정 치수가 구현 정확도에 영향을 줄 때의 기준 프레임과 실제 좌표 기준 | spec-planner가 계획의 기하 계약으로 읽고, integration-reviewer가 실측 기준으로 읽음 |
| `01-plan.md` | spec-planner | 프로젝트 데이터 계층 기준 구현 계획 | implementer가 그대로 따름 |
| `01-decisions.md` | spec-planner | 확인 필요 항목 + 사람 답변 | Orchestrator가 T02→T03 전환 전 확인 |
| `02-implementation-notes.md` | implementer | 생성/수정한 파일 목록, 계획 대비 차이 | integration-reviewer가 대조 근거로 읽음 |
| `03-review.md` | integration-reviewer | 통과/수정 필요/사람 승인 필요/확인 못한 부분 | Orchestrator가 위험 기반 재검증 후 사람에게 보고 |
| `improvement-log.md` | Orchestrator | 실행 회차별 발견/개선 기록 | 다음 실행이 반복 실수를 피하는 근거 |
| `archive/{YYYYMMDD-HHMMSS}/` | Orchestrator | 완전히 새로운 작업 시작 시 이전 산출물 보존 | 필요 시 과거 이력 참고 |

재실행/부분 수정 요청 시 이 디렉토리의 기존 파일을 먼저 확인한 뒤 `feature-team-orchestrator`의 "실행 모드 확인" 절차를 따릅니다.
