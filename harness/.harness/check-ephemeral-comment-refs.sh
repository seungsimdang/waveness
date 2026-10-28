#!/bin/sh
# lint-staged 훅: 소스 및 테스트 코드가 매번 덮어써지는 산출물 또는 리뷰 라운드를 인용하지 않는지 검사

EPHEMERAL_COMMENT_REF_PATTERN='artifacts/(task-team|bug-team|archive)/|(qa-report|code-review|security-review)-[0-9]+\.md|00-input\.md|(^|[^a-zA-Z0-9_-])(api-spec|requirements|design-spec|summary)\.md([^0-9A-Za-z_]|$)|migration-audit\.md|(^|[^0-9A-Za-z])[HM][0-9]+[[:space:]]*[(（](코드리뷰|리뷰|QA)|(코드리뷰|리뷰|QA)[[:space:]]*[(（]?[[:space:]]*[HMT][0-9]+|재작업 항목|코드리뷰 재작업|리뷰 재작업|QA 리포트|수용[[:space:]]*기준|인수[[:space:]]*조건|보안리뷰 지적|리뷰 지적|리뷰어 (요청|코멘트|피드백)|T[0-9]{2}[[:space:]]*(QA|코드리뷰|리뷰)|(^|[^0-9A-Za-z-])GATE-[0-9]|(^|[^0-9A-Za-z-])SEC-[LMH]-?[0-9]|(^|[^0-9A-Za-z])(api-spec|design-spec)[[:space:]]*(\.md|§)|요구사항[[:space:]]*(항목|F0?[0-9])|명세[[:space:]]*부록|인터랙션[[:space:]]*명세[[:space:]]*[0-9]|접근성[[:space:]]*§|(//|#|\*).*[^0-9A-Za-z]F[0-9]{1,2}(-[0-9A-Za-z]+)*:[[:space:]]|(^|[^0-9A-Za-z])F[0-9]{1,2}(-[0-9]+)+([[:space:]]|:|/)|[(（]F[0-9]{1,2}(-[0-9A-Za-z]+)*[[:space:]]|(^|[^0-9A-Za-z])(NFR?|F)[0-9]+[[:space:]]*§|[(（]§[0-9]|[[:space:]]§[0-9]+\.[0-9]|(^|[^0-9A-Za-z])AC-F[0-9]|(^|[^0-9A-Za-z])SEC[[:space:]]*(Low|Mid|High)-[0-9]|Edge[[:space:]]*Case|(^|[^0-9A-Za-z])옵션[[:space:]]*[A-D]([[:space:][:punct:]]|$)|feature[[:space:]]*"[A-E]"|[(（](P[0-9]|NF[0-9])[)）]|(^|[^0-9A-Za-z])BUG[ -][0-9]{14}($|[^0-9A-Za-z])'

hits=""
for file in "$@"; do
  # lint-staged의 다른 작업(예: Biome 포매팅)과 병렬 실행돼도 항상 커밋할 index 내용을 검사
  matches=$(git show ":$file" 2>/dev/null | grep -nE "$EPHEMERAL_COMMENT_REF_PATTERN" || true)
  if [ -n "$matches" ]; then
    hits="${hits}${file}\n${matches}\n"
  fi
done

if [ -n "$hits" ]; then
  echo "✖ 차단: 다음 위치가 사이클마다 덮어써지는 산출물 파일명 또는 리뷰/QA 라운드 식별자를 주석에 인용합니다:"
  printf '%b' "$hits"
  echo "→ 파일명·라운드 번호(M5, T09 등) 대신 이유를 주석 안에 직접 서술하세요."
  exit 1
fi

exit 0
