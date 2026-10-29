# 하네스 자동 업데이트 구현

- 승인: 2026-10-29, PR 생성·검사·자동 병합 및 세션 시작 안내 구조
- 대상: seungness·waveness 동기화 도구, 배포 템플릿, GitHub Actions
- 실행: 기존 3-way 병합을 재사용하는 단일 구현 흐름

## 작업 목록

- [x] 세션 시작·기존 자동 진입점을 읽기 전용 안내로 변경
- [x] 별도 체크아웃에서 프로젝트·허브 PR 생성 및 중복 방지
- [x] 변경 범위·최신 SHA·필수 CI 검사 후 자동 병합
- [x] 워크플로·등록 프로젝트·운영 문서 구성
- [x] 정상·충돌·반복·실패 로컬 검증 및 인증 등록 사항 정리
- [x] 메시지 승인 후 커밋·push·Actions 인증 등록·실제 실행 검증

## 산출물 계약

- `bin/harness-automation.mjs`: 상태 조회·PR 전달·검사 후 병합
- `bin/harness-automation.test.mjs`: 경계 조건 및 읽기 전용 회귀 검사
- `.github/workflows/`: 허브 CI 및 정기 동기화
- `templates/harness-verify.yml`: 연결 프로젝트 CI
- `.harness/projects.json`: 허브가 관리하는 원격 프로젝트와 통합 브랜치
- `harness/docs/agent-harness/sync.md`: 운영 방식·인증·실패 처리
- 이 문서: 진행 및 미검증 항목

## 검증 기준

- 세션 시작 전후 HEAD·인덱스·작업 파일 불변
- 충돌 또는 제외 경로 변경은 자동 병합 불가
- 동일 source/base로 PR 중복 생성 금지
- 검사 누락·진행 중·실패·오래된 SHA는 병합 불가
- 인증 실패는 안내하고 작업 저장소는 보존

## 검증 결과

- waveness 전체 검사: 76개 중 73 통과, 3 건너뜀, 실패 0
- seungness 전체 검사: 66개 중 64 통과, 2 건너뜀, 실패 0
- 기존 건너뜀은 명시된 훅 회귀 사례와 Biome 미설치 사례
- YAML 문법·JavaScript 구문·변경 공백 검사 통과
- GitHub 원격의 10개 프로젝트 통합 브랜치·lock 확인
- 실제 개인·회사 계정으로 읽기 전용 업데이트 안내 실행 확인
- PR 생성·중복 방지·병합 조건 검사는 임시 Git 원격과 GitHub 응답 픽스처 사용
- 실제 원격 PR 생성·CI·자동 병합과 Actions secret 등록 결과는 아래 실행 결과에 기록

## 원격 적용 범위

- 두 허브 main에 각각 `feat(sync): 하네스 업데이트를 PR 검사 후 자동 병합으로 전환`
- 두 허브 Actions에 개인 계정 `HARNESS_SYNC_TOKEN` 등록
- waveness Actions에 회사 계정 `HARNESS_PROJECT_TOKEN` 추가 등록
- 기존 GitHub CLI 인증을 사용할 경우 저장소 전용으로 권한이 제한된 토큰이 아님
- 프로젝트 generic 변경은 origin 통합 브랜치에 push된 것만 회수, 작업 브랜치·로컬 미전송 변경은 보존
- 신규 연결은 register → 양쪽 커밋·push → verify-connection 성공까지 완료 조건에 포함

## 실제 실행 결과 및 병합 정책 보완

- 두 허브에 지정된 Actions secret 등록 및 일반 push 완료
- 기존 10개 연결 프로젝트에 실제 업데이트 PR 생성 확인
- niffy·candanta·salmal·한화·트리니온에서 검사 후 자동 병합 확인
- HK Mold #22 → main, 삼성중공업 #23 → develop: 사용자 개별 요청으로 수동 병합 완료. 서식·import 정렬 검사 실패 10건은 남은 상태
- civilator: Biome Grit 호환 검사 실패, globber-dashboard: 프로젝트 역할 명세·Vitest의 node:test 수집 실패, 포트폴리오: 프로젝트 도구 권한 계약 불일치로 자동 병합 보류
- 자동 커밋은 인증된 GitHub 계정의 noreply 주소 사용, 기존 프로젝트 모델·effort 선택 보존
- 사용자 추가 지시: 개인 프로젝트는 Vercel 연동 여부와 관계없이 검사 후 자동 병합 유지, 회사 Vercel 연동 프로젝트는 PR 생성·검사까지만 자동 실행
- 회사 Vercel 연동은 검사·상태에서 감지해 차단, 확인된 트리니온은 등록의 manualMerge로도 명시적 차단
- 정책 반영 중 두 허브 Harness Sync를 일시 비활성화. 새 정책 push 뒤에만 재활성화
- 제한 전 트리니온 develop 병합의 GitHub 배포 기록은 Preview / success로 확인
