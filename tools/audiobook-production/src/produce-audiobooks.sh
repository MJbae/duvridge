#!/bin/bash
# 회차를 순서대로 대본 → 녹음·검수 → 조립까지 돌린다.
# usage: src/produce-audiobooks.sh [회차ID ...]   (생략하면 프롤로그~외전 26편 전부)
# 이미 만든 녹음은 캐시를 쓰므로 중간에 끊겨도 다시 돌리면 이어서 진행된다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE="${MEMOIR_CONTENT_ROOT:-$ROOT/../../packages/memoir-content}"
cd "$ROOT"

if [ $# -gt 0 ]; then
  EPISODES="$*"
else
  EPISODES="prolog $(for i in $(seq 1 23); do printf 'ep%02d ' "$i"; done)epilog side"
fi

# shellcheck disable=SC2086
python3 -I src/build_narration_script.py "$SITE/배병희_자서전.md" "$SITE/content/episode-illustrations.json" $EPISODES --out narration-scripts

for e in $EPISODES; do
  echo "=== $e"
  python3 -I src/generate_narration_clips.py "narration-scripts/$e.json"
  python3 -I src/assemble_audiobook.py "narration-scripts/$e.json"
done

echo
echo "=== 사람이 들어 봐야 할 줄 (받아쓰기 검수 실패)"
python3 -I src/list_narration_review_items.py $EPISODES
