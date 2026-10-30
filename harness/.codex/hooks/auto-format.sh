#!/bin/sh
# PostToolUse에서 편집한 파일만 공용 Biome·문장 간격 수정기로 전달
exec node "$(dirname "$0")/../../.harness/auto-format.mjs"
