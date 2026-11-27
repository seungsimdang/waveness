# 하네스 변경 이력

## 2026-11-27 fix(harness): Codex 종료 보고에 커밋과 일치하는 작업 트리 검사 기록 전달

> - 동일 저장소·세션에서 다른 작업 트리가 검사한 파일을 최종 커밋과 대조해 종료 보고에 별도 근거로 전달
> - 현재 작업 트리 검증 요건 및 커밋·푸시 전 검사 기준 유지

## 2026-11-27 fix(harness): Codex 검증 훅의 프로젝트 검사 명령 인식

> - 프로젝트 설정에 등록된 타입 검사 명령을 검증 기록으로 인식
> - 프로젝트에 test 스크립트가 없고 하네스 테스트가 있을 때 하네스 전체 테스트의 성공을 요구
> - 검사 실패와 입력 변경, 프로젝트 test 스크립트 미실행 차단을 회귀 검사로 확인

## 2026-11-26 fix(harness): Codex 새 승인 요청의 이전 답변 예외 제거

- Harness-Origin: `amore-box-handling-frontend@d8294787907d43bed7eb0b298538ec0c759dd3b8`

> - 원인: 직전 질문 도구 답변이 있으면 새 승인 요청도 일반 응답에서 통과
> - 해결: 현재 응답의 새 승인 요청을 질문 도구로 유도하고 완료 보고와 인용문 통과를 회귀 테스트로 검증

## 2026-11-26 fix(harness): Codex 질문 도구 응답 판정과 결정 요청 유도 훅 추가

- Harness-Origin: `amore-box-handling-frontend@542b3d1905c9828c67828c05131a38255eada1d5`

> - 확인 질문 훅이 질문 도구 응답 태그 안의 답변만 사용자 문장으로 판정하고 이전 질문 표시를 정리하도록 수정
> - 보고 전용 판정에서 질문 도구의 "청사진대로 적용" 선택지 제외
> - 일반 응답에 남긴 결정·승인 요청을 질문 도구로 유도하는 Codex Stop 훅 추가
> - 질문 도구 응답·결정 요청 훅 회귀 테스트 추가

## 2026-11-26 fix(harness): 승인 없는 스폰 전 amend 예외 제거와 판정 훅 오탐 수정

- Harness-Origin: `amore-box-handling-frontend@3326bd6292da1a1debb26e86e22109cadf10b428`

> - 격리 subagent 스폰 전 amend --no-edit를 승인 없이 허용하던 예외를 AGENTS.md·git-safety·itd-commit·feature-team-orchestrator에서 제거하고 itd-commit 승인 커밋 후 스폰으로 통일
> - 청사진 승인 판정이 본문 없는 도구 결과 항목을 사용자 답변으로 판정해 승인 직후 도구 호출만으로 승인이 무효가 되던 문제 수정
> - 확인 질문 Stop 훅이 작업 중 입력돼 아직 전달되지 않은 질문으로 턴 종료를 막던 문제 수정
> - 질문 응답 훅 차단 문구를 도구 호출 직전 텍스트가 판정에 안 보일 수 있는 실제 상황에 맞게 수정
> - 승인 판정·확인 질문 훅 회귀 테스트 추가

## 2026-11-25 fix(harness): 청사진 승인 질문에서 사용자가 볼 수 있는 청사진 강제

> - `require-blueprint-before-harness-approval.sh`가 질문 창 문구와 도구 호출이 없는 메시지의 텍스트(뒤에 사용자 항목이 기록된 것)만 화면에 보인 글로 인정. 질문 창과 같은 응답 본문, 도구 호출과 같은 message.id의 텍스트는 진행 요약으로 바뀔 수 있어 제외
> - 계획 파일 참조 `<harness-plan-file>`는 해시가 맞고 `changes[].before_sha256`의 변경 파일 경로가 화면에 보인 글에 모두 있을 때만 인정. 참조만 넣고 청사진 내용 없이 승인을 묻던 흐름과, 본문 참조를 해시 확인 없이 통과시키던 문제 수정
> - 차단 안내를 "전문을 도구 호출 없는 마지막 텍스트로 보이고 다음 메시지 뒤 질문"으로 변경, 편집 훅 안내에 계획 파일은 편집 승인용임을 추가
> - `harness_edit_approval.py`가 문자열 `toolUseResult`에서 AttributeError를 내던 문제 수정, 회귀 테스트 추가

## 2026-11-25 fix(harness): 메모리 요청 훅이 문자열 도구 결과에서 오류로 통과하던 문제 수정

> - `require-memory-request.sh`가 도구 거부·오류 결과처럼 `toolUseResult`가 문자열인 transcript 항목에 `.get`을 호출해 `AttributeError`로 끝나고(비차단 exit 1) 요청 없는 메모리 쓰기를 막지 못하던 문제 수정
> - `answers_of`로 `toolUseResult`·`answers`가 모두 dict일 때만 질문 창 답으로 취급, 회귀 테스트 추가

## 2026-11-25 fix(harness): 메모리 요청 판정을 이번 턴 전체 메시지로 확대 및 요약 기록 안내 추가

> - `require-memory-request.sh`가 마지막 사용자 메시지 하나만 보던 것을 이번 턴 시작 메시지·작업 중 메시지·질문 창 답 전체로 확대, 요청 뒤에 다른 작업 중 메시지가 와도 요청을 인정하고 더 뒤의 부정 표현은 요청을 취소
> - `require-answer-before-edit`(Claude·Codex)·`require-blueprint-before-harness-approval` 차단 사유에 도구 호출 앞 텍스트가 진행 요약으로 바뀌어 기록되지 않을 수 있으니 답·청사진은 도구 호출 없는 마지막 텍스트로 쓰라는 안내 추가(`thinkingDisplay: updates` 세션에서 도구 호출 앞 텍스트 52건이 요약으로 대체된 기록 확인)
> - 회귀 테스트 추가

## 2026-11-25 fix(harness): 보고 전용 판정에서 승인 지시를 실행으로 인식

> - `confirm-edit-on-report-request.sh`(Claude·Codex) 실행 키워드에 `승인`·`승인해` 추가. "청사진은 승인."처럼 청사진 키워드와 승인 지시가 함께 있는 메시지가 보고 전용으로 분류돼 그 턴 편집마다 확인 창이 뜨던 문제 수정
> - "승인이 필요한지 판단하여 보고해" 같은 판단 요청은 계속 보고 전용, 회귀 테스트 추가

## 2026-11-25 fix(harness): 확인 미룸 정규식 판정에서 지난 시점 인정 문장 제외

> - `.harness/deferred-claims-exempt-pattern.txt`에 지난 시점(처음·그때·당시·앞선 답변·이전 답변)을 밝히고 확인·검증·측정하지 않았다고 인정한 문장 예외 추가. "아니요, 처음에는 확인하지 않았습니다." 뒤에 같은 응답에서 확인 결과를 보고해도 막히던 오탐 수정
> - 정규식 단계만 건너뛰며 LLM 판정기의 확인 미룸 규칙은 그대로 적용, 시점 없는 "확인하지 않았습니다"는 계속 차단
> - Claude `judge-unverified-claims`와 Codex·Antigravity `block-unverified-claims`가 같은 예외 파일을 읽어 함께 적용, 회귀 테스트 추가

## 2026-11-24 feat(harness): 질문 훅 3종 Antigravity·Codex판 추가 및 LLM 판정기 런타임별 통일

> - `.harness/judge_command.py` 추가: 판정기를 런타임별 하나로 고정(Claude haiku, Codex gpt-6-luna, Antigravity gemini-4-hydrogen-medium, effort 모두 medium), `harness_edit_approval.py`의 claude→codex→agy 폴백 제거
> - `require-answer-before-edit`·`require-feasibility-verdict`·`block-unverified-claims`·`harness_edit_approval.py`가 공용 판정기 사용, Codex가 `.claude` 사본을 등록한 훅은 `~/.codex/sessions` transcript 위치로 Codex 판별
> - Antigravity 어댑터에 `HARNESS_RUNTIME=antigravity`·`pre-tool-ask`(ask_question) 추가, `require-answer-before-edit`·`require-source-before-best-practice-edit`·`block-reask-after-free-text-answer`가 Antigravity transcript(USER_INPUT·PLANNER_RESPONSE·GENERIC)를 해석하고 `.agents/hooks.json`에 등록
> - `block-reask-after-free-text-answer` Codex판 추가(`request_user_input_async` 질문과 `send_user_message_question_reply` 답 해석), Stop 이벤트로 Stop 모드 판별
> - `require-answer-before-edit` 1회 차단 표시를 질문별 해시로 바꿔 작업 중 메시지 뒤 같은 질문 재차단 방지, 출력 리다이렉트 판정이 `2>/dev/null;`처럼 구분자가 붙은 `/dev/null`을 쓰기로 오판하던 문제 수정
> - 회귀 테스트 추가 및 `docs/agent-harness/README.md` 런타임 배치 갱신

## 2026-11-24 fix(harness): 답변 요구 턴 질문 창 차단 및 한화 공용 동기화 충돌 해결

- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@751788f0b190b04ef275fdebaf96488079da64d1`
- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@a23c6864338034769d4829548102d4af72f870e0`
- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@f49b751e4773b35024d908896359d584e0260554`

> - `require-answer-before-edit.sh`를 `AskUserQuestion` PreToolUse에도 연결하고 답변 요구 지시("확인하고 다시 답변해", "설명해")를 판정 대상으로 포함
> - `~하고 보고해` 같은 작업 뒤 결과 보고 지시는 미답변 질문 판정 및 `block-reask-after-free-text-answer.sh` 예외에서 제외
> - 회귀 테스트 갱신 및 이미 반영된 `751788f` 이력 정리

## 2026-11-24 fix(harness): 작업 중 보낸 확인 질문의 판정 훅 오탐 수정

- Harness-Origin: `kcl-monitoring-frontend@42f0db569e023d169922382586ff18e35d8918b0`

> - require-feasibility-verdict.sh가 작업 중 메시지(queued_command 첨부)를 턴 경계로 인정하도록 Claude·Codex판 함께 수정
> - 작업 중 질문 뒤 첫 응답 판정과 에이전트 보고 제외 회귀 테스트 추가

## 2026-11-24 feat(harness): 수동 동기화의 통합 브랜치 가드와 자동 커밋·push 추가

> - `bin/harness.mjs`의 연결 프로젝트 `pull`·`receive`가 통합 브랜치 여부를 확인해 비통합 브랜치 실행을 차단하고, 충돌이 없으면 자동 `Harness-Scope: sync` 커밋 및 `origin` push까지 수행하도록 개선
> - `bin/harness.mjs`의 수동 `push`도 허브가 `main`일 때만 허용하고 커밋 뒤 `origin/main`까지 push하도록 개선(`--allow-branch`·`--no-commit`·`--no-push` 옵션 및 서버 자동화용 `HARNESS_PREPARE_ONLY=1` 유지)

## 2026-11-20 chore(harness): harness_edit_approval.py 양방향 동기화 편입 및 LLM 판정기 통일

> - `.harness/upstream-paths` 및 `bin/harness.test.mjs`에 `.harness/harness_edit_approval.py`를 추가해 `seungness`와 양방향 동기화하도록 전환
> - `seungness`의 `codex exec` 기반 의미 판정기·`plan_file` 해시 검증과 최신 훅·회귀 테스트를 동기화 반영

## 2026-11-19 feat(harness): Antigravity 역할 카드 네이티브 Markdown 전환, swarm 검증 훅 추가 및 effort medium 통일

> - `.agents/agents/*.json`을 Antigravity 네이티브 `.agents/agents/{role}.md`(`model: inherit`, `swarm_model: gemini-4-hydrogen-medium`, `subagent: true`, `tools:`, `integration-reviewer` `inheritMcp: true`, Claude·Codex 동일 본문)로 전환
> - `prior-art-researcher`의 Claude `effort`·Codex `model_reasoning_effort`·Antigravity `swarm_model`을 모두 `medium`으로 통일
> - `.agents/hooks.json` 및 `antigravity-hook-adapter.mjs`에 `PreToolUse(matcher: "swarm")` 훅을 추가하고 `check-agent-harness-sync.sh`·`spec.test.mjs`·`bin/harness.mjs`·`bin/harness-automation.mjs`를 3자 기준으로 갱신

## 2026-11-05 fix(harness): 한화 공용 역할 지침 동기화 충돌 해결

- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@d94a44ecc24c8204049e75b2e92f7defdd73387d`
- 구현·검증 역할 정리 내용의 기존 반영 확인 및 원본 커밋 재적용 방지
- worktree 설치·커밋 금지와 범위 밖 조건·Figma 차이 보고 지침 보존

## 2026-11-04 chore(harness): Stop 훅 오탐 수정(기획서 인용 판정, 미확인 단정 판정)

- Harness-Origin: `seojin-camshaft-monitoring-frontend@bd2fa7d9d29b5dd6d000c85f89b65fd47c683447`

> - 기획서 인용 훅의 줄번호 인용을 대소문자 무관으로 통과시키고, 코드 펜스 안의 줄과 백틱·큰따옴표 인용 안에서만 언급한 줄은 판정에서 제외
> - 미확인 단정 판정 훅에 이번 턴의 앞선 텍스트(6,000자 상한)와 직전 3개 사용자 턴 도구 기록(기존 24,000자 상한 유지)을 넘기고, 앞선 턴 사용자 메시지는 미응답 판정에서 제외
> - 판정 지시에 도구 기록·사용자 메시지에 없는 세션 정보를 반박 근거로 쓰지 않는 규칙 추가
> - Codex 원인 판정 훅에도 이번 턴의 앞선 텍스트를 넘겨 질문 창 직전 설명을 판정에 반영
> - 세 훅의 오탐 회귀 테스트 추가

## 2026-11-04 chore(harness): 선언한 다음 단계 미실행 차단 훅 추가와 feature-team 검증 절차 보완

- Harness-Origin: `seojin-camshaft-monitoring-frontend@8173a4860519b839e88623e3346fc24b013eb380`

> - 마지막 문단의 대기 조건 없는 실행 서술을 1회 차단하는 Stop 훅 추가(Claude·Codex)
> - 재질문 훅에 stop 모드 추가, 차단이 풀렸는데 질문을 다음 메시지로 미루는 응답 1회 차단
> - integration-reviewer 보고서에 Figma와 다름 칸, 페이지별 스크린샷 대조, 범위 밖 조건 렌더링 추가와 수정 요청은 Orchestrator에게만 전달
> - implementer 소스 수정은 Orchestrator 지시로만 하고 파일 삭제 전 알림
> - orchestrator 진행표에 결정 질문 근거로 화면 스크린샷 변형 확인, 재검증 시 페이지별 대조, TaskStop 후 재개 처리 추가
> - 신규·변경 훅 등록과 판정 회귀 테스트 추가

## 2026-11-04 chore(harness): 결정 질문 질문 창 강제 훅 추가

- Harness-Origin: `seojin-camshaft-monitoring-frontend@9af437661db3143c71279e2ec37d3f2b0bb42ffb`

> - 질문 창 답변 없이 결정 요청 질문을 텍스트로 쓴 응답을 1회 차단하는 Stop 훅 추가, 재질문 훅에 막힌 호출은 질문 창 사용으로 세지 않음
> - 직접 입력 답변 판정은 재질문 훅 단독 책임으로 두고, 재질문 훅 안내에 같은 응답의 텍스트 결정 질문 금지 문구 추가
> - 신규 훅 Stop 등록과 판정 회귀 테스트 추가

## 2026-11-03 fix(harness): 쓰기 가능 subagent 격리 강제와 격리 결과 회수 절차 추가

- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@5d5c085df47612bc393fbd9482823b75971d9bd7`

> - 파일을 고칠 수 있는 subagent를 정의 tools 기준으로 판별해 isolation worktree 없이 스폰 차단
> - 메인 작업 트리에 미커밋 변경이 있으면 격리 스폰도 차단하고 작업 커밋 amend 안내 (subagent worktree 경로 제외)
> - 스폰 직전 작업 커밋 amend --no-edit와 회수 후 worktree 정리를 고위험 행동 승인 예외로 명시
> - 격리 subagent의 worktree 안 커밋 금지, 설치 선행, 별도 포트 사용 규칙을 구현·검증 역할에 추가
> - 격리 결과 회수와 worktree 정리 절차를 git 안전 수칙과 Claude 오케스트레이터에 추가, Codex는 쓰기 담당 동시 실행 금지
> - 1 branch 1 commit 판단에서 공용 하네스 커밋 제외
> - 런타임 훅 회귀 테스트 갱신

## 2026-11-03 fix(harness): 판정 훅의 확인 미룸 보고 차단과 질문 창 직접 입력 처리 강화

- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@7141b1402b887e8584ea9e232975b56ad80bb22e`

> - 도구로 확인할 수 있는 사항을 미룬 보고를 Claude·Codex 판정 훅에서 문구 검사로 차단
> - 미룸 문구를 공용 패턴 파일로 분리해 두 판정 훅의 규칙 어긋남 방지
> - Claude 판정 기준에 확인 미룸 항목을 추가하고 미검증 표시 면제 축소
> - 질문 창 직접 입력을 미응답 질문 판정 대상에 포함
> - 질문 창 직접 입력 후 응답 종료까지 수정·위임·재질문 차단 (subagent 제외)
> - 프로젝트 훅이 루트 시작 세션에서만 로드되는 제약을 하네스 문서에 명시
> - 런타임 훅 회귀 테스트 추가

## 2026-11-03 chore(harness): 선례 조사 역할 effort 상향

- Harness-Origin: `seojin-camshaft-monitoring-frontend@e449bdc228b22e89e95df2ba59fcf9ff36af156a`

> - 선례 조사 역할(Claude·Codex판)의 추론 effort를 medium에서 high로 상향해 레퍼런스 근거 조사 깊이 보강

## 2026-11-03 manualMerge 저장소 병합 차단 훅 추가

- 허브 등록에서 `manualMerge: true`로 지정한 저장소의 PR 병합을 Claude·Codex Bash에서 예외 없이 차단. 저장소를 변수로 넘겨 판정할 수 없는 병합도 차단
- 사용자는 GitHub 화면이나 터미널 `! gh pr merge`로 직접 병합. 허브 등록 파일을 찾지 못하면 통과

## 2026-11-03 Tailwind IntelliSense 린트 공용 검사 추가

- 설치된 Tailwind 디자인 시스템으로 IntelliSense의 v4 린트(canonical 표기·CSS 충돌·차단 클래스·CSS 지시문·테마 경로)를 스테이징 파일 기준으로 커밋에서 차단. Tailwind 미설치·v3·API 없음은 사유만 출력하고 통과.
- Claude·Codex 편집 후 자동 수정에 표기 수정 연결. 저장 시 수정은 1초 제한을 넘어 연결하지 않음.
- `sync.md`의 Tailwind 검사 소유 문구를 공용 IntelliSense 린트와 프로젝트 소유 Tailwind 규칙으로 구분.

## 2026-10-30 fix(harness): 커밋 전 Biome 검사 옵션 중복 전달 방지

- Harness-Origin: `hkmold-monitoring-frontend@5206be4cb0ae7e8e335808d339544c7b7ee4da69`

> - Claude·Codex 커밋 훅의 Biome 옵션 중복 전달 제거
> - 중복 옵션 방지 및 경고 차단 유지 회귀 테스트 추가

## 2026-10-30 Biome·저장·에이전트 편집 후 자동 수정 동기화

- Harness-Origin: `seungness@f96cf4e06d05a0dd0cd2bb9d0c6a0a11a8e11635`
- 문장 간격 검사기·버퍼 수정기·VS Code/Cursor 확장과 공용 lint 진입점을 기존 3-way 동기화 대상에 추가. 훅 등록은 공유 항목만 병합하고 회사 전용 훅·설정 보존.
- 검사기와 중첩 에디터 경로의 수신·환류·반복 동기화 회귀 검사 보강. 커밋·CI는 검사 전용 유지.

## 2026-10-29 PR 기반 하네스 자동 업데이트

- 세션 시작은 업데이트 PR·원격 반영 필요 여부 안내만 수행, 현재 체크아웃 변경 없음
- 서버 격리 체크아웃에서 프로젝트 및 허브 간 PR 생성, 변경 범위와 CI 성공 확인 후 자동 병합
- 신규 연결 등록·원격 반영 검증 추가, generic 변경은 origin 통합 브랜치에서 회수

## 2026-10-29 동기화 훅의 Node.js 실행 경로 보정

- PATH에 node가 없으면 Homebrew 기본 경로를 추가하고 자식 커밋 훅에도 전달. 여전히 없으면 세션 화면 또는 동기화 로그에 실패 표시.
- 기존 PATH 유지, 경로 보정, Node.js 부재의 회귀 검사 추가.
- 받기를 막던 스캐폴딩 스킬의 명세 형식 등록 누락과 Biome 2.2에서 지원하지 않는 검사 설정 수정.

## 2026-10-28 chore(harness): 가능 여부 판정 훅 임시 파일 권한 제한

- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@2b18642837af9a10812d906777c4b47f344f7154`

> - 사용자 입력이 저장되는 임시 디렉터리와 파일의 접근 권한 제한

## 2026-10-28 받기 커밋 실패 시 받은 파일 되돌림

- 자동 받기의 프로젝트 커밋이 pre-commit 등으로 실패하면 받은 파일과 `.harness/lock.json`을 HEAD로 되돌림. seungness 훅 받기(`upstream`)도 같은 방식으로 `harness/`와 `.harness/upstream.json`을 되돌림. 스테이징된 채로 남아 이후 동기화가 미커밋 변경 때문에 계속 건너뛰던 문제 해결. 원인을 고치면 다음 실행에서 다시 받음.

## 2026-10-28 에이전트 커밋의 lint 경고 차단 훅 추가

- Claude·Codex PreToolUse(Bash)에 `block-lint-warnings-on-commit.sh` 등록. 프로젝트 lint 스크립트 설정과 무관하게 linter 설정 파일로 명령을 정하고 경고도 실패로 처리하는 옵션을 붙여 실행.
- 지원 범위는 저장소 루트의 Biome·ESLint flat config. 그 밖의 linter와 실행 파일이 없는 경우는 통과. 사람이 직접 하는 커밋은 막지 못해 프로젝트 pre-commit 훅과 함께 사용.

## 2026-10-28 공용 lint 회귀 검사 배포

- 포트폴리오 lint 테스트에서 명세 필수 절·팀 통신, 런타임 훅·Codex 어댑터, 인덱스 기반 소스·문서 검사, Biome 한글 테스트 제목 검사와 검사기를 `.harness/`로 분리.
- 기존 `.harness/` 동기화 경로를 사용하고 연결 프로젝트 commit-msg에서 공용 테스트 전체 실행. 주석 검사기의 프로젝트 소유 파일이 없는 경우 공용 검사기로 대체.
- 프로젝트별 모델 이름·작성자·스택·앱 경로는 강제하지 않으며 Biome 미설치 검사는 사유와 함께 건너뜀.

## 2026-10-27 Codex 역할 모델·effort를 Claude 기준으로 정렬

- 대상: `.codex/agents/spec-planner.toml`, `implementer.toml`, `integration-reviewer.toml`
- 내용: Claude의 Sonnet 역할에 대응하는 Codex 모델을 `gpt-6.1-terra`로, effort를 Claude와 같은 `medium`으로 변경. Haiku 역할인 `prior-art-researcher`는 기존 `gpt-6-luna`·`medium` 유지.

## 2026-10-21 feat/ITD-7525 공용 PR 생성 스킬 추가

- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@fd6d12063261a82e7237f57d2aaba45f984f7a62`

> - 대표 커밋과 전체 브랜치 변경을 대조하는 PR 작성 절차 추가
> - 본인 Assignee와 기존 라벨 설정 및 중복 생성 방지 절차 추가
> - Claude·Codex의 PR 스킬 호출 안내 추가

## 2026-10-20 feat/ITD-7509 공용 구현·검증 지침 정리

- Harness-Origin: `HanwhaAdvancedMaterials-monitoring-frontend@be7c5eb27300c8ac4fcf51681bcc4843777419d3`

> - 구현·검증 역할의 중복 지침과 절차 번호 정리
> - hover 검증·서버 종료·실측 근거 기록 지침 보완
> - Claude·Codex 검증자 역할 본문 일치

## 2026-10-20 미검증 주장 판정 훅의 긴 출력 잘림 오탐 수정

- 대상: `.claude/hooks/judge-unverified-claims.sh`
- 경위: 도구 결과를 앞 1500자만 판정 모델에 넘겨, 응답이 인용한 줄이 그 뒤에 있으면 근거 없음으로 차단했다(예: 2827자 grep 결과의 1395자부터 시작한 줄).
- 내용: 1500자를 넘는 결과는 앞부분에 더해, 응답에 나온 파일명·백틱 표기가 든 뒷부분 줄(줄당 400자, 합계 3000자)을 생략 표시와 함께 넘긴다. 판정 기준은 그대로 둔다.

## 2026-10-20 기획서 인용 점검 훅의 경로 언급 오탐 수정

- 대상: `.claude/hooks/check-prd-claim-citation.sh`
- 내용: 줄번호 없는 파일 경로(`src/docs/PRD.md` 등)로만 기획서를 언급한 줄까지 근거 누락으로 차단하던 오탐을 제외했다. 경로를 쓰면서 내용을 주장하는 줄도 함께 빠지는 한계가 있다.

## 2026-10-20 허브 저장소에도 하네스 적용

- 대상: waveness 루트 `.claude/settings.json`·`.codex/hooks.json`·`AGENTS.md`·`CLAUDE.md`, `bin/hub-hooks.mjs`, `.codex/hooks/check-agent-harness-sync.sh`
- 내용: 허브 루트 훅 등록을 `harness/` 등록에서 생성하고 `CLAUDE_PROJECT_DIR`을 `harness/`로 넘겨 프로젝트와 같은 경로로 동작하게 했다. main에서 작업하는 허브 특성상 `check-branch-guard`와 동작하지 않는 `.harness/sync.sh`만 뺐다. Codex판 하네스 짝 점검 훅이 `CLAUDE_PROJECT_DIR`을 우선하도록 Claude판·`block-comment-line-wrap.sh`와 맞췄다.

## 2026-10-20 Feature Team 4역할 재구성과 세 프로젝트 범용 규칙 반영

- 대상: `AGENTS.md`, `CLAUDE.md`, `.claude/agents/*`·`.codex/agents/*`(prior-art-researcher 추가), `feature-team-orchestrator`(Claude·Codex), `artifacts/feature-team/README.md`, `check-review-findings-relayed.sh`, `docs/agent-rules/branch-strategy.md`
- 경위: 초기 구성은 hkmold 하네스만 일반화했고, samsungshi·trinione의 오케스트레이터·역할은 내용을 확인하지 않은 채 프로젝트 전용으로 보고 제외했다. 실제로는 두 프로젝트에 사고에서 나온 범용 규칙이 있어 세 프로젝트의 연결 전 하네스(samsungshi `7b23188^`, trinione `cf31d35^`, hkmold `bd02f2e^`)를 모두 읽고 다시 반영했다.
- 역할 구성: samsungshi·trinione의 4역할(선례 조사-명세 분석-구현-검증)로 맞췄다. hkmold가 3역할로 줄인 기록상 이유("외부 레퍼런스 저장소가 없음", hkmold improvement-log 2026-09-15)는 지금 해당하지 않는다. 선례 조사는 `project.md`에 참고 레퍼런스 저장소가 있을 때만 실행한다. spec-analyst의 규칙은 spec-planner로 합쳤다. 산출물 번호는 00-input, 01-prior-art, 02-plan·02-decisions, 03-implementation-notes, 04-review.
- 옮긴 범용 규칙: 사람 승인 항목 질문 전 현황 보고(PRD·레퍼런스·API 명세·현재 코드), 답변란을 Orchestrator가 채우지 않음, 근거 인용 시 명시 규정/침묵/상반 구분, 선례 배제도 사람 승인, 기술 방식 질문에 조사된 선례를 선택지로 포함, `ListAgents`의 in-process 팀원 미표시와 접미사 분기, 실행 방식 전환 별도 승인, 재검증 원칙(사용 여부와 정확성 구분, 가역성 아닌 확신도, 리뷰어 자기평가 불신, 항상 통과하는 테스트 금지), 도구 미연결 즉시 알림, Figma 시각 값은 노드 근거로만, 반복 콘텐츠 카드 경계 확인, 라이브러리 override 기본 클래스 전수 대조, 축 눈금 포맷, breakpoint 실제 값 기준 실측, gap/padding과 오버플로·채움 검사 분리, 소스 주석에 산출물·결정 ID 금지, 인용 범위 스코프, 불만·재촉 신호 해석, 직접 질문 우선 답변, 청사진 게이트 예외 엄격 해석, SendMessage와 fork 구분, 긴급 중지.
- Figma MCP는 백그라운드 팀원에게 상속되지 않는다는 hkmold 재현 결과를 유지해, 두 프로젝트 역할에 있던 팀원의 Figma 직접 조회 절차는 Orchestrator가 원문을 저장하고 팀원이 요청하는 방식으로 바꿨다.
- Codex 역할 toml에 `model = "gpt-6-luna"`를 명시했다. hkmold 원본 형식을 따르느라 빠져 있었고, Codex 서브에이전트 문서는 `model`을 선택 필드로 둔다.
- 프로젝트 전용으로 남긴 것: 각 프로젝트의 PRD 정책 값, 레퍼런스 경로, 차트 라이브러리 등 결정 사항은 프로젝트 `docs/agent-rules/project.md`에 둔다.

## 2026-10-20 초기 구성

- 대상: 전체 하네스, waveness `bin/harness.mjs`(프로젝트 동기화·seungness 훅 동기화), `skills/waveness-connect`, `templates/project.md`
- 내용: samsungshi-scaffolding-frontend·trinione_monitoring_frontend·hkmold-monitoring-frontend의 `.claude`·`.codex`에서 공통 규칙과 Feature Team(spec-planner·implementer·integration-reviewer), 스킬(feature-team-orchestrator·itd-commit·finding-validity-gate·coderabbit-triage)을 가져와 Claude·Codex 짝으로 구성했다. 프로젝트 이름·PRD 경로·참고 레퍼런스 저장소·검증 명령은 프로젝트 소유 `docs/agent-rules/project.md`를 가리키게 바꿨다. 훅·`.harness/`·인계 계약·harness-lab·cross-agent-handoff는 seungness 구조를 따랐다.
- 훅: 같은 이름의 훅(git-safety-guard·enforce-commit-msg-style·block-attribution-trailers·block-em-dash-in-source·require-korean-response)은 seungness판을 쓴다. hkmold의 check-unverified-hedge·remind-why-root-cause·require-answer-before-tools·block-unscoped-process-kill은 seungness의 judge-unverified-claims·require-why-explanation·git-safety-guard와 기능이 겹쳐 넣지 않았다. 프런트엔드 전용 훅 7개는 seungness로 올리지 않는다(`.harness/upstream-paths`).
- 제외: new-project-scaffold 스킬, 스택 규칙 문서(nextjs·react-query·tailwind·project-structure, 프로젝트마다 타입명·경로가 달라 프로젝트 소유로 둠). 오케스트레이터·역할 제외 판단은 위 재구성 항목에서 바로잡았다.
