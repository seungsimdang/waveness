---
name: feature-team-orchestrator
description: 신규 기능/화면 개발을 계획-구현-검증 흐름으로 진행할 때 사용한다. 초기 실행뿐 아니라 재실행, 다시 실행, 업데이트, 수정, 보완, 이전 결과 기반 개선, 특정 단계만 다시 처리하는 요청에도 사용한다.
---

# Feature Team Orchestrator

## 목적

이 Orchestrator는 이 프로젝트의 신규 기능 개발을 3개 역할로 나누어 진행한다: 계획 → 구현 → 통합 검증.

## 전제 조건

- `docs/agent-rules/project.md`의 "기획·명세 문서"에 PRD 경로가 있다. 기능 요구사항·정책(집계 기준, 판정 기준, 표기 규칙 등) 판단은 이 문서를 1차 근거로 삼는다. PRD가 없으면 사용자 요청 원문을 근거로 삼고 그 사실을 `00-input.md`에 남긴다.
- API 명세 문서의 유무와 위치는 `docs/agent-rules/project.md`를 따른다. API 엔드포인트·응답 스키마가 API 명세·PRD·사용자 요청 어디에도 명시되지 않으면 목데이터 기반으로 진행하고 그 사실을 `01-decisions.md`에 남긴다.
- `docs/agent-rules/project.md`에 참고 레퍼런스 저장소가 있으면 구현 패턴 참고용으로 사용할 수 있다. 그대로 복사하지 않고 이 프로젝트 컨벤션에 맞게 재해석하며, 직접 수정 대상이 아니다.
- Figma MCP 플러그인이 연결되어 있다. 하네스 호출 시 사용자가 이번 작업 대상 Figma 노드 링크를 직접 제공하면, `00-input.md`에 그 링크를 기록한다.
- **Figma 노드 분석은 Orchestrator(메인 세션)가 전담한다.** spec-planner·integration-reviewer는 Figma MCP를 자체 재호출하지 않고, Orchestrator가 저장한 `artifacts/feature-team/00-figma-context.md`를 Read로 읽는다.

## 실행 모드

기본 실행 모드는 Agent Team이다. 계획 단계의 판단(데이터 계층 구조, 재사용 패턴)이 구현 범위를 바꾸고, 구현 중 발견(목데이터 구조 등)이 검증 기준에 영향을 준다. 다만 오타 수정, 스타일 조정처럼 계획·검증이 불필요한 작은 작업은 단일 흐름으로 줄인다.

## 실행 모드 확인

1. `artifacts/feature-team/`에 기존 산출물(`00-input.md`~`03-review.md`)이 있는지 확인한다.
2. 없으면 초기 실행으로 진행한다.
3. 있고 사용자가 "구현만 다시", "계획은 그대로 두고" 같은 부분 수정을 요청하면 해당 단계부터 재실행한다. 이전 단계 산출물은 그대로 입력으로 재사용한다.
4. 완전히 새로운 작업(다른 기능, 다른 화면)이면 기존 산출물을 `artifacts/feature-team/archive/{YYYYMMDD-HHMMSS}/`에 보존하고 새로 시작한다.
5. 사용자 의도가 불분명하면 "이어 하기", "부분 수정", "새 작업" 중 무엇인지 먼저 확인한다.

## Agent Team 구성

| 팀원 | Agent 파일 | 역할 | 주요 산출물 |
| --- | --- | --- | --- |
| 기능 계획가 | `.codex/agents/spec-planner.toml` | 요청을 프로젝트 데이터 계층 기준 계획으로 정리, 기존 코드 패턴 재사용 확인 | `artifacts/feature-team/01-plan.md`, `01-decisions.md` |
| 구현 담당자 | `.codex/agents/implementer.toml` | 계획대로 실제 코드 작성 | 소스 파일, `artifacts/feature-team/02-implementation-notes.md` |
| 통합 검증자 | `.codex/agents/integration-reviewer.toml` | 계획·rules와 교차 검증, `tsc`/`lint` 실행, UI 변경 시 dev 서버 렌더링 확인 | `artifacts/feature-team/03-review.md` |

## Task 등록 계약

| Task | 담당 | 입력 | 출력 | 의존 | 완료 기준 | 상태 갱신 |
| --- | --- | --- | --- | --- | --- | --- |
| T01-input | Orchestrator | 사용자 요청 | `artifacts/feature-team/00-input.md` | 없음 | 목표, 범위, 사람 승인 지점 정리. 제공된 경우 Figma 노드 링크 기록 | 작성 완료 |
| T02-plan | 기능 계획가 | `00-input.md`, 기존 `src/` 코드 | `artifacts/feature-team/01-plan.md`, `01-decisions.md` | T01 | 확인 필요 항목에 사람 답변 반영, 데이터 계층 구조 계획 명시. Figma 기하 산출물이 있으면 기준 프레임·좌표계·crop 계획 포함 | 시작, 차단, 완료 |
| T03-implement | 구현 담당자 | `01-plan.md` | 소스 파일, `artifacts/feature-team/02-implementation-notes.md` | T02 | 계획대로 파일 생성/수정, 타입 검사 통과 | 시작, 차단, 완료 |
| T04-review | 통합 검증자 | `01-plan.md`, `02-implementation-notes.md`, 소스 파일 | `artifacts/feature-team/03-review.md` | T03 | 수정 필요/승인 필요 구분, `tsc`/`lint` 실행 결과 포함. UI 변경 포함 작업은 dev 서버 렌더링 확인(콘솔 에러, PRD 표기 규칙 대조) 포함. Figma 기하 산출물이 있으면 실제 가시 요소별 실측 증거 포함 | 시작, 차단, 완료 |

## Agent Team 실행 흐름

1. 사용자 요청과 사람 승인 지점을 `artifacts/feature-team/00-input.md`에 저장한다. 이전 작업 전례를 끌어와 적용할 때는 "가정"으로 쓰지 않고 "확인 필요"로 명시한다.
1-1. `00-input.md`에 Figma 노드 링크가 있으면, Orchestrator가 직접 `get_design_context`를 호출해 원문 응답 전체(코드, 스타일 힌트, Component descriptions, 스크린샷 설명 등)를 요약 없이 그대로 `artifacts/feature-team/00-figma-context.md`에 저장한다. 팀원은 이 파일을 Read로 읽어 근거로 삼으며, 자체 MCP 재호출을 전제로 지시하지 않는다.
    **시각적으로 렌더링되는 하위 섹션(카드/컴포넌트 단위)마다 예외 없이 raw 코드 블록을 그대로 보존한다 - 일부만 프롱즈 bullet로 요약하지 않는다.** Figma MCP는 Orchestrator만 호출 가능해 재호출로 복구할 수 없으므로, 한 섹션이라도 프롱즈로 뭉개면 spec-planner·implementer·integration-reviewer 전원이 그 손실(색상 변수, 고정 치수 등)을 영구히 놓친다. 저장 직후 `grep -c '```' 00-figma-context.md`로 노드 이름 개수 대비 코드 펜스 개수가 크게 모자라지 않은지 자체 확인한다.
    이어서 `get_screenshot`을 호출해 실제 Figma 노드 이미지를 받아 `artifacts/feature-team/00-figma-screenshot.png`로 저장한다(다운로드 URL은 발급 후 만료되므로 즉시 저장). integration-reviewer는 이 이미지를 자신이 dev 서버에서 찍은 스크린샷과 나란히 비교할 근거로 삼는다.
    프로젝트가 Tailwind v4를 쓰면 `tailwind.config.ts`의 `content` 설정과 무관하게 프로젝트 전체를 자동 스캔한다. Figma 원문 코드에 `bg-[var(--button\/colorbgcontainer,white)]`처럼 슬래시(`/`)가 포함된 CSS 변수 표기가 있으면 잘못된 임의값 클래스 후보로 파싱되어 빌드 전체가 깨진다(재현 테스트로 확정). 저장 직후 전역 CSS(예: `src/app/globals.css`)에 `artifacts` 디렉터리를 가리키는 `@source not` 줄이 없으면 추가해 이 디렉터리를 스캔 대상에서 제외한다.
	    Figma 원문에 범례/배지 그리드처럼 반복 요소가 묶여 있는 하위 프레임이 있으면, `get_design_context`의 코드 힌트만으로는 정확한 폭·줄바꿈 규칙이 드러나지 않을 수 있다(참고 코드가 flex-wrap처럼 보여도 실제로는 고정 px 폭이거나 강제 줄바꿈 단위일 수 있음). 이런 반복 하위 구조가 있으면 `get_metadata`로 그 프레임을 직접 조회해 자식 노드들의 x/y/width를 원문 그대로 `artifacts/feature-team/00-figma-metadata.md`에 저장한다. 팀원은 이 파일의 수치를 실제 렌더링과 대조할 근거로 삼는다.
	    절대 좌표 오버레이, 이미지 crop, `contents` 그룹, 고정 치수처럼 기하 정보가 구현 정확도에 영향을 주면 `artifacts/feature-team/00-figma-geometry.md`에 기준 프레임 노드 ID·크기, 이미지 노드·crop 값, 그룹의 `contents` 여부·실제 좌표 기준, 실제 가시 요소의 기준 위치·크기, 확정하지 못한 항목을 기록한다. 좌표계 또는 crop 기준을 확인할 수 없으면 추측으로 채우지 않고 T02의 사람 승인 필요 항목으로 넘긴다.
2. 팀원을 스폰하기 전 `ListAgents`로 동일 이름이 이미 떠있는지 확인한다. 스폰 프롬프트를 쓰기 전 해당 팀원의 `.codex/agents/{역할}.toml`을 Read로 먼저 확인해서, 그 파일에 이미 규정된 절차와 모순되거나 이를 무효화하는 지시를 프롬프트에 넣지 않는다. 없으면 `Agent` 도구(`subagent_type`에 팀원 Agent 파일명, `name`에 고정 팀원 이름 지정)로 스폰한다.
3. `TaskCreate`로 위 Task 등록 계약대로 작업을 등록한다. **이 실행에서 `TaskCreate`는 이 시점 한 번만 호출한다** - 앞선 단계에서 개략적 진행 목록을 별도로 만들지 않는다(동일 subject로 중복 호출 시 기존 태스크와 병합되지 않고 별개 ID로 쌓인다).
4. 팀원들은 `TaskUpdate`로 시작, 차단, 완료 상태를 갱신한다.
5. Orchestrator는 Phase 전환 전(T02→T03, T03→T04) `TaskGet`으로 누락과 지연을 확인한다. T03→T04 전환 전에는 `02-implementation-notes.md`에서 "마크업 유지"/"변경 없음" 같은 단정적 서술을 최소 1곳 골라 직접 `git diff`로 스팟체크한다 - integration-reviewer에게 전부 위임하지 않는다.
6. 팀원들은 발견, 질문, 충돌을 `SendMessage`로 공유한다.
7. T02 완료 전, Orchestrator가 `artifacts/feature-team/01-decisions.md`를 직접 열어 확인한다. `유형: 사람 승인 필요`로 표시된 항목마다 `답변:` 필드가 실제로 채워져 있는지 하나씩 확인하고, 비어 있으면 spec-planner가 "확정 완료"로 보고했더라도 그대로 믿지 않는다 - 비어 있는 항목만 골라 사람에게 질문으로 전달하고 답변을 받은 뒤에만 T03으로 넘어간다.
8. T03 시작 전, 신규 디렉토리 생성이 필요하면 정확한 경로를 사람에게 재확인한다.
8-1. T04 시작 전, UI 변경이 포함된 작업이면 dev 서버가 떠 있는지 확인하고, 떠 있지 않으면 먼저 띄운다. T04 완료 후에도 dev 서버를 임의로 끄지 않는다. 포트 충돌 등 구체적으로 꺼야 할 이유가 생기거나 사용자가 명시적으로 요청할 때만 종료한다.
8-2. 리뷰어에게 특정 우려사항을 짚어줄 때는 "이 항목만 확인"처럼 닫힌 목록으로 지시하지 않는다. "최소 다음을 포함해 표준 절차대로 확인"처럼 열린 형태로 지시한다 - 닫힌 목록은 `integration-reviewer` 명세에 이미 있는 포괄적 검증 의무(고정 치수 실측 등)를 사실상 대체해버릴 수 있다.
9. **T04 완료 후, `artifacts/feature-team/03-review.md`를 읽고 그대로 사람에게 전달하지 않는다.** 서브에이전트의 요약은 실제로 한 일이 아니라 하려던 일을 설명할 뿐이므로, 위험 기반(risk-based)으로 재검증한다:
   - 되돌리기 어렵거나 사람이 바로 다음 결정(커밋 승인 등)을 쌓을 항목 - 최우선.
   - 서술이 구체적이고 그럴듯하지만 실제로는 주관적 판단이 섞인 주장("rules와 일치", "구조가 맞다", "레이아웃이 일치") - 검증 없이 넘어가기 가장 쉽고 틀리기도 쉽다.
   - "요소 존재"와 "시각적 일치"는 별개 검증축이다. 리뷰어가 "화면이 정상 렌더링됨"이라고만 보고했다면 그것을 PRD 표기 규칙과의 "일치"로 확대 해석하지 않는다.
   - 컨테이너의 배경/테두리/그림자("요소 형태")는 텍스트 스타일과 별개 축이다 - 텍스트·아이콘 일치만으로 넘어가지 않는다.
   - 코드 주장(예: "X 파일 미변경")은 `grep`/`git status`/`git diff`로, 렌더링 주장은 실제 재현(스크린샷/콘솔 로그 재확인)으로, 타입/린트 통과 주장은 재실행으로 직접 확인한다. 구현 노트에 "마크업 유지"/"변경 없음"처럼 단정하는 문구가 있는 파일은 최우선 재검증 대상이다 - 실제로는 계획에 없는 마크업(로딩 스피너, 빈 상태 UI 등)이 추가됐는데 요약만 "유지"라고 적었을 수 있다.
   - 여러 variant가 같은 컴포넌트/헬퍼를 공유하는 구조는, 헬퍼 파라미터가 variant별로 실제로 차별화됐는지가 그 자체로 고위험 재검증 대상이다 - 복사-붙여넣기로 구조만 맞추고 파라미터를 안 바꿨을 가능성이 구조적으로 높다.
	   - 반복형 하위 구조(범례 그리드, 배지열 등)는 "개수가 맞다"와 "그 폭 비율·줄바꿈 지점이 맞다"가 별개 검증축이다. 개수만 세고 치수를 육안으로 넘겼다면 그것도 재검증 대상이다. `00-figma-metadata.md`가 있으면 그 수치와 실제 렌더링의 `getBoundingClientRect()`를 직접 대조한다.
	   - `00-figma-geometry.md`가 있으면 `03-review.md`의 "Figma 기하 실측 증거"에서 실제 가시 요소별 selector, 기준값, 실측값, 판정, 근거가 모두 남았는지 확인한다. 부모 컨테이너 측정만 남아 있거나 미측정 항목을 통과로 처리했으면 T04 완료로 인정하지 않는다.
   - 재검증한 항목 중 하나라도 `03-review.md` 내용과 다르면, 검증 범위를 넓혀 나머지 "통과" 항목도 마저 재현 확인한다.
   - 이 재검증을 마친 뒤에만 사람에게 요약 보고하고, "사람 승인 필요" 항목에 대한 확인을 받는다. "확인 못한 부분"은 "통과"와 동일한 비중으로 그대로 전달한다.
10. `artifacts/feature-team/improvement-log.md`를 갱신한다.
11. 작업 종료 시 이번 실행에서 스폰한 모든 팀원을 `TaskStop`으로 정리한다. `SendMessage`로 마무리를 알리는 것만으로는 종료되지 않는다.
12. T01~T04 사이클이 끝난 뒤 Orchestrator가 직접 소스를 후속 수정할 때도, 배치·간격 분배처럼 여러 해석이 가능한 시각적 결정은 Figma 스크린샷(`00-figma-screenshot.png` 또는 재조회 스크린샷)과 대조하기 전에는 "완료"로 보고하지 않는다. 수치(예: 높이)가 맞았다는 것과 그 수치 안의 배치 방식이 맞았다는 것은 별개 검증축이다.

## 사람 승인 지점

- `artifacts/feature-team/01-decisions.md`의 확인 필요 항목 (API 통신 방식, 신규 디렉토리 위치 등)
- 신규 디렉토리 생성 위치
- `artifacts/feature-team/03-review.md`의 "사람 승인 필요" 항목
- git commit/push, 파일 삭제 (`AGENTS.md` "고위험 행동 차단" 그대로 적용)

## 실패 처리

- 입력이 부족하면 바로 진행하지 말고 빠진 정보를 질문한다.
- 팀원 1명이 실패하면 태스크 자체(계획 불일치 등) 문제인지 도구/환경 문제인지 먼저 분류한다.
  - 태스크 문제면 `TaskGet`으로 상태 확인 후 `SendMessage`로 재시도/재할당 지시.
  - 도구/환경 문제로 판단되면, 판단이 추정임을 먼저 사용자에게 보고하고 확인받은 뒤에만 실행 방식을 바꾼다.
- 재시도가 동일 원인으로 다시 실패하면, 관측된 실패 사유를 추측 없이 그대로 사용자에게 전달한다.
