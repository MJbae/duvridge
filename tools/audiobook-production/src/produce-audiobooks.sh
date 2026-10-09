#!/bin/bash
# 회차를 순서대로 대본 → 녹음 → 조립까지 돌린다. 받아쓰기 검수와 재녹음은 하지 않는다(사용자 결정, 2026-10-09).
# usage: src/produce-audiobooks.sh [회차ID ...]   (생략하면 프롤로그~외전 26편 전부)
# 이미 만든 녹음은 캐시를 쓰므로 중간에 끊겨도 다시 돌리면 이어서 진행된다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${MEMOIR_CONTENT_ROOT:-$ROOT/../../content/books/bae-byunghee}"
cd "$ROOT"

if [ $# -gt 0 ]; then
  EPISODES="$*"
else
  EPISODES="prolog $(for i in $(seq 1 23); do printf 'ep%02d ' "$i"; done)epilog side"
fi

# shellcheck disable=SC2086
python3 -I src/build_narration_script.py "$SITE/manuscript.md" "$SITE/illustrations/manifest.json" $EPISODES --out narration-scripts

for e in $EPISODES; do
  echo "=== $e"
  python3 -I src/generate_narration_clips.py "narration-scripts/$e.json"
  python3 -I src/assemble_audiobook.py "narration-scripts/$e.json"
done

