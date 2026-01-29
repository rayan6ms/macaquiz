#!/usr/bin/env bash
set -euo pipefail

# Moves quizzes from one pack to another, renumbering them and rewriting JSON fields.
#
# Usage:
#   scripts/move-pack-batch.sh \
#     --src-pack <pack> --dst-pack <pack> \
#     --src-start <n> --src-end <n> \
#     [--dst-start <n|auto>] \
#     [--title-template "<string with {N}>"] \
#     [--dry-run]
#
# Examples:
#   scripts/move-pack-batch.sh --src-pack rc-maravilhas --dst-pack rc-lugares --src-start 1 --src-end 1 --dst-start auto --title-template "Racha Cuca - lugares — Jogo {N}"

dry_run=false
src_pack=""
dst_pack=""
src_start=""
src_end=""
dst_start="auto"
title_template=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src-pack) src_pack="$2"; shift 2;;
    --dst-pack) dst_pack="$2"; shift 2;;
    --src-start) src_start="$2"; shift 2;;
    --src-end) src_end="$2"; shift 2;;
    --dst-start) dst_start="$2"; shift 2;;
    --title-template) title_template="$2"; shift 2;;
    --dry-run) dry_run=true; shift;;
    *) echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

[[ -n "$src_pack" && -n "$dst_pack" && -n "$src_start" && -n "$src_end" ]] || {
  echo "Missing required args." >&2
  exit 1
}

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing dependency: $1" >&2; exit 1; }; }
need_cmd jq

use_git_mv() { git rev-parse --is-inside-work-tree >/dev/null 2>&1; }

do_mv() {
  local src="$1" dst="$2"
  if $dry_run; then
    echo "DRY: mv '$src' -> '$dst'"
    return 0
  fi
  if use_git_mv; then
    git mv -f -- "$src" "$dst"
  else
    mkdir -p -- "$(dirname -- "$dst")"
    mv -f -- "$src" "$dst"
  fi
}

max_quiz_num_in_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || { echo 0; return; }
  # find quiz-<n>.json, print max n
  ls -1 "$dir" 2>/dev/null \
    | sed -n 's/^quiz-\([0-9]\+\)\.json$/\1/p' \
    | sort -n \
    | tail -n 1 \
    | awk '{print $1+0}'
}

src_dir="src/app/lib/data/games/${src_pack}"
dst_dir="src/app/lib/data/games/${dst_pack}"

mkdir -p "$dst_dir"

if [[ "$dst_start" == "auto" ]]; then
  maxn="$(max_quiz_num_in_dir "$dst_dir")"
  dst_start=$((maxn + 1))
fi

echo "➡️  Batch move:"
echo "   SRC: $src_pack quizzes $src_start..$src_end"
echo "   DST: $dst_pack starting at quiz-$dst_start"
$dry_run && echo "   MODE: dry-run"

dst_n="$dst_start"

for src_n in $(seq "$src_start" "$src_end"); do
  src_json="${src_dir}/quiz-${src_n}.json"
  dst_json="${dst_dir}/quiz-${dst_n}.json"

  if [[ ! -f "$src_json" ]]; then
    echo "❌ Source JSON not found: $src_json" >&2
    exit 1
  fi
  if [[ -f "$dst_json" ]]; then
    echo "❌ Destination already exists: $dst_json (won't overwrite)" >&2
    exit 1
  fi

  echo "➡️  Move JSON: $src_json -> $dst_json"
  do_mv "$src_json" "$dst_json"

  # Rewrite id/title/image paths
  oldPrefix="/images/games/${src_pack}/quiz-${src_n}/"
  newPrefix="/images/games/${dst_pack}/quiz-${dst_n}/"

  if [[ -n "$title_template" ]]; then
    newTitle="${title_template//\{N\}/$dst_n}"
    title_jq="| .title = \$newTitle"
  else
    title_jq=""
    newTitle=""
  fi

  if $dry_run; then
    echo "DRY: rewrite JSON fields in $dst_json (id=quiz-$dst_n, image prefix $oldPrefix -> $newPrefix)"
  else
    tmp="$(mktemp)"
    jq \
      --arg newId "quiz-${dst_n}" \
      ${newTitle:+--arg newTitle "$newTitle"} \
      --arg oldPrefix "$oldPrefix" \
      --arg newPrefix "$newPrefix" \
      "
      .id = \$newId
      ${title_jq}
      | (.questions[]? | select(.image != null) | .image) |=
          (if startswith(\$oldPrefix) then (\$newPrefix + (ltrimstr(\$oldPrefix))) else . end)
      " "$dst_json" > "$tmp"
    mv -f "$tmp" "$dst_json"
  fi

  # Move images directory if present
  old_img_dir="public/images/games/${src_pack}/quiz-${src_n}"
  new_img_dir="public/images/games/${dst_pack}/quiz-${dst_n}"

  if [[ -d "$old_img_dir" ]]; then
    echo "➡️  Move images: $old_img_dir -> $new_img_dir"
    if $dry_run; then
      echo "DRY: ensure '$new_img_dir' then move files"
    else
      mkdir -p "$new_img_dir"
      shopt -s nullglob dotglob
      for f in "$old_img_dir"/*; do
        if use_git_mv; then
          git mv -f -- "$f" "$new_img_dir"/
        else
          mv -f -- "$f" "$new_img_dir"/
        fi
      done
      rmdir --ignore-fail-on-non-empty "$old_img_dir" 2>/dev/null || true
    fi
  else
    echo "ℹ️  No images at: $old_img_dir (ok)"
  fi

  echo "✅ Done quiz-$dst_n"
  dst_n=$((dst_n + 1))
done

echo "🎉 All done."
