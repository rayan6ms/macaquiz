#!/usr/bin/env bash
set -euo pipefail

dry_run=false
merge=false
prefixes=("rc-" "exs-")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) dry_run=true; shift;;
    --merge) merge=true; shift;;
    --prefix) prefixes+=("$2"); shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing dependency: $1" >&2; exit 1; }; }
need_cmd jq

use_git_mv() { git rev-parse --is-inside-work-tree >/dev/null 2>&1; }

say() { echo -e "$*"; }

move_file() {
  local src="$1" dst="$2"
  if $dry_run; then
    say "DRY: mv '$src' -> '$dst'"
    return 0
  fi
  mkdir -p -- "$(dirname -- "$dst")"
  if use_git_mv; then
    git mv -f -- "$src" "$dst"
  else
    mv -f -- "$src" "$dst"
  fi
}

move_dir_contents() {
  local src_dir="$1" dst_dir="$2"

  if [[ ! -d "$src_dir" ]]; then return 0; fi
  if [[ -d "$dst_dir" && "$merge" != true ]]; then
    say "❌ Destination exists: $dst_dir (use --merge)"
    exit 1
  fi

  if $dry_run; then
    say "DRY: ensure '$dst_dir' then move contents from '$src_dir'"
    return 0
  fi

  mkdir -p "$dst_dir"
  shopt -s nullglob dotglob
  local moved_any=false
  for f in "$src_dir"/*; do
    moved_any=true
    move_file "$f" "$dst_dir/$(basename -- "$f")"
  done
  # Remove src_dir if empty
  if [[ "$moved_any" == true ]]; then
    rmdir --ignore-fail-on-non-empty "$src_dir" 2>/dev/null || true
  fi
}

strip_prefix() {
  local name="$1"
  for p in "${prefixes[@]}"; do
    if [[ "$name" == "$p"* ]]; then
      echo "${name#$p}"
      return 0
    fi
  done
  echo "$name"
}

rewrite_images_in_json_dir() {
  local json_dir="$1" old_pack="$2" new_pack="$3"
  local oldBase="/images/games/${old_pack}/"
  local newBase="/images/games/${new_pack}/"

  shopt -s nullglob
  local files=("$json_dir"/quiz-*.json)
  if [[ ${#files[@]} -eq 0 ]]; then
    say "ℹ️  No quiz JSON files in: $json_dir"
    return 0
  fi

  for f in "${files[@]}"; do
    if $dry_run; then
      say "DRY: rewrite image paths in '$f' ($oldBase -> $newBase)"
      continue
    fi
    tmp="$(mktemp)"
    jq --arg oldBase "$oldBase" --arg newBase "$newBase" '
      (.questions[]? | select(.image != null) | .image) |=
        (if startswith($oldBase) then ($newBase + (ltrimstr($oldBase))) else . end)
    ' "$f" > "$tmp"
    mv -f "$tmp" "$f"
  done
}

games_root="src/app/lib/data/games"
images_root="public/images/games"

say "➡️  Stripping prefixes from packs in: $games_root"
$dry_run && say "   MODE: dry-run"
$merge && say "   MODE: merge enabled"

mapfile -t pack_dirs < <(find "$games_root" -mindepth 1 -maxdepth 1 -type d -printf "%f\n" | sort)

for pack in "${pack_dirs[@]}"; do
  new_pack="$(strip_prefix "$pack")"
  [[ "$new_pack" != "$pack" ]] || continue

  src_dir="${games_root}/${pack}"
  dst_dir="${games_root}/${new_pack}"

  say "\n=== PACK: '$pack' -> '$new_pack' ==="
  say "➡️  Move/merge game files: $src_dir -> $dst_dir"
  move_dir_contents "$src_dir" "$dst_dir"

  # rewrite after move
  rewrite_images_in_json_dir "$dst_dir" "$pack" "$new_pack"

  src_img="${images_root}/${pack}"
  dst_img="${images_root}/${new_pack}"

  if [[ -d "$src_img" ]]; then
    say "➡️  Move/merge images: $src_img -> $dst_img"
    move_dir_contents "$src_img" "$dst_img"
  else
    say "ℹ️  No images folder for pack: $src_img (ok)"
  fi

  say "✅ Done: $pack -> $new_pack"
done

say "\n🎉 All prefix removals done."
