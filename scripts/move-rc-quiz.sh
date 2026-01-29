#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/move-rc-quiz.sh "<src_json>" "<old_pack>" "<old_quiz_num>" "<dst_pack>" "<dst_quiz_num>"

src_json="${1:?src_json missing}"
old_pack="${2:?old_pack missing (e.g. rc-astronomia)}"
old_quiz_num="${3:?old_quiz_num missing (e.g. 1)}"
dst_pack="${4:?dst_pack missing (e.g. rc-universo)}"
dst_quiz_num="${5:?dst_quiz_num missing (e.g. 4)}"

dst_dir="src/app/lib/data/games/${dst_pack}"
dst_json="${dst_dir}/quiz-${dst_quiz_num}.json"

old_img_dir="public/images/games/${old_pack}/quiz-${old_quiz_num}"
dst_img_dir="public/images/games/${dst_pack}/quiz-${dst_quiz_num}"

use_git_mv() { git rev-parse --is-inside-work-tree >/dev/null 2>&1; }

do_mv() {
  local src="$1" dst="$2"
  if use_git_mv; then
    git mv -f -- "$src" "$dst"
  else
    mkdir -p -- "$(dirname -- "$dst")"
    mv -f -- "$src" "$dst"
  fi
}

echo "➡️  Moving JSON:"
echo "   from: $src_json"
echo "     to: $dst_json"

mkdir -p "$dst_dir"

# Move/rename JSON file into destination folder/name
if [[ "$src_json" != "$dst_json" ]]; then
  if [[ ! -f "$src_json" ]]; then
    echo "❌ Source JSON not found: $src_json" >&2
    exit 1
  fi
  do_mv "$src_json" "$dst_json"
else
  echo "ℹ️  Source and destination JSON paths are the same; skipping move."
fi

echo "➡️  Rewriting JSON fields (id/title/image paths)..."

tmp="$(mktemp)"
jq \
  --arg newId "quiz-${dst_quiz_num}" \
  --arg newTitle "Racha Cuca - universo — Jogo ${dst_quiz_num}" \
  --arg oldPrefix "/images/games/${old_pack}/quiz-${old_quiz_num}/" \
  --arg newPrefix "/images/games/${dst_pack}/quiz-${dst_quiz_num}/" \
  '
  .id = $newId
  | .title = $newTitle
  | (.questions[]? | select(.image != null) | .image) |=
      (if startswith($oldPrefix) then ($newPrefix + (ltrimstr($oldPrefix))) else . end)
  ' "$dst_json" > "$tmp"
mv -f "$tmp" "$dst_json"

echo "➡️  Moving images (if exist):"
echo "   from: $old_img_dir"
echo "     to: $dst_img_dir"

if [[ -d "$old_img_dir" ]]; then
  mkdir -p "public/images/games/${dst_pack}"
  mkdir -p "$dst_img_dir"

  # move files one-by-one to allow merge
  shopt -s nullglob dotglob
  moved_any=false
  for f in "$old_img_dir"/*; do
    moved_any=true
    if use_git_mv; then
      git mv -f -- "$f" "$dst_img_dir"/
    else
      mv -f -- "$f" "$dst_img_dir"/
    fi
  done

  if [[ "$moved_any" == true ]]; then
    rmdir --ignore-fail-on-non-empty "$old_img_dir" 2>/dev/null || true
  fi
else
  echo "ℹ️  No image folder found at: $old_img_dir (ok)"
fi

echo "✅ DONE:"
echo "   JSON:   $dst_json"
echo "   Images: $dst_img_dir"
