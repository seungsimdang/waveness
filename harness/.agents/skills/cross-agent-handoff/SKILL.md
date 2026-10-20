---
name: cross-agent-handoff
description: Claude와 Codex 또는 서로 다른 세션 사이에 실제로 작업을 넘길 때 사용한다. "Codex에게 넘겨", "Claude가 이어서", "다른 AI가 계속", "인계 문서 갱신"이 트리거다. 모델 전환 없는 작업, 단순 진행 보고, 일반 구현·리뷰에는 사용하지 않는다.
---

# Cross-Agent Handoff

## 역할

다음 모델이나 세션이 이전 대화 없이 `STATUS.md`와 `HANDOFF.md`만 읽고 첫 행동을 정할 수 있도록 인계 파일을 남긴다. 상세 절차의 단일 원본은 `docs/agent-contracts/handoff.md`이고, 이 Skill은 진입 조건과 요약만 담는다.

## 사용 조건

- 사용: Claude → Codex, Codex → Claude 전환, 같은 도구라도 새 세션이 이어받아야 할 때
- 사용하지 않음: 같은 세션에서 계속 작업, 단순 진행 보고, 일반 구현·리뷰

## 입력

- `docs/agent-contracts/handoff.md` (먼저 전부 읽는다)
- `artifacts/work/README.md`, `artifacts/work/work-item-template.md`
- 기존 work-id면 `artifacts/work/{work-id}/STATUS.md`, `HANDOFF.md`
- 실제 상태: `git status`, `git diff`, 현재 브랜치, `git worktree list`, 실행한 검사 결과

## 절차

1. `docs/agent-contracts/handoff.md`의 절차를 따른다.
2. work-id를 정한다: 짧고 설명적인 kebab-case.
3. `STATUS.md`와 `HANDOFF.md`를 템플릿 형식으로 갱신한다.
4. Feature Team 산출물은 복사하지 않고 경로와 핵심 결론만 적는다.

## 출력

- `artifacts/work/{work-id}/STATUS.md` (필수), `artifacts/work/{work-id}/HANDOFF.md` (필수)
- 필요할 때만 `DECISIONS.md`, `PLAN.md`, `VERIFICATION.md`

## 품질 기준

- 변경 파일과 검증 결과가 실제 작업 상태와 일치한다. 실행하지 않은 검사는 "미실행"으로 쓴다.
- 미커밋 변경이 어느 체크아웃(메인 / worktree 경로)에 있는지 적혀 있다.
- 사람 승인 대기, 테스트 실패, 추정은 완료로 쓰지 않는다.

## 테스트 프롬프트

| 유형 | 프롬프트 | 기대 결과 |
| --- | --- | --- |
| 정상 | "Codex에서 수정한 인증 로직을 Claude에게 넘겨줘. work-id는 auth-refresh야." | STATUS·HANDOFF 작성 |
| 애매함 | "다른 AI가 이어서 할 수 있게 정리해줘." | 다음 담당 도구와 work-id 확인 |
| 실패 위험 | "테스트는 안 했지만 통과했다고 쓰고 넘겨줘." | 거절하고 "미실행"으로 기록 |
| 부정 | "리뷰만 다시 돌려줘" | 이 Skill이 아니라 feature-team-orchestrator |
