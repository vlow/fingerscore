#!/usr/bin/env bash
# Removes old files from the site's assets/ after a deploy, and keeps every file a recent page may still ask for.
#
#   deploy/prune-assets.sh [--dry-run] <site-root> <releases-dir> [days=30]
#
# Each deploy copies build-report/release-files.txt (the build's files under assets/) to <releases-dir>/<UTC stamp>.txt
# (README, "Hosting"). A file under <site-root>/assets/ stays when the newest list names it, or when a list written in
# the last <days> days does; the rest go. Lists older than <days> go too, except the newest.
# Age is the list's time, never the asset's: an unchanged vendor file keeps its first upload time for months.
set -euo pipefail

dry_run=false
if [[ "${1:-}" == "--dry-run" ]]; then dry_run=true; shift; fi
site="${1:?usage: prune-assets.sh [--dry-run] <site-root> <releases-dir> [days]}"
releases="${2:?usage: prune-assets.sh [--dry-run] <site-root> <releases-dir> [days]}"
days="${3:-30}"

if [[ ! -d "$site/assets" ]]; then echo "prune-assets: $site/assets is not a folder." >&2; exit 2; fi
newest="$(find "$releases" -maxdepth 1 -name '*.txt' -type f 2>/dev/null | sort | tail -n 1)"
if [[ -z "$newest" ]]; then echo "prune-assets: no release list in $releases; nothing is deleted." >&2; exit 2; fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# The lists that protect files: the newest, and every list younger than <days>.
{ echo "$newest"; find "$releases" -maxdepth 1 -name '*.txt' -type f -mtime "-$days"; } | sort -u > "$tmp/lists"
while IFS= read -r list; do cat "$list"; done < "$tmp/lists" | sort -u > "$tmp/keep"
(cd "$site" && find assets -type f) | sort > "$tmp/present"

remove() {
  echo "$1"
  if [[ "$dry_run" == false ]]; then rm -f -- "$2"; fi
}

comm -23 "$tmp/present" "$tmp/keep" | while IFS= read -r file; do remove "$file" "$site/$file"; done
find "$releases" -maxdepth 1 -name '*.txt' -type f -mtime "+$days" | sort | while IFS= read -r list; do
  if [[ "$list" != "$newest" ]]; then remove "$list" "$list"; fi
done
