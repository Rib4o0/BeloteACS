#!/usr/bin/env bash
# Usage: review-package.sh BEFORE_DIR OUT_FILE
# Writes a unified diff of all source changes since BEFORE_DIR to OUT_FILE.
set -euo pipefail
root="/Users/Rosen/WebstormProjects/belote"
before="$1"; out="$2"
{
  echo "# Snapshot diff for this task (before -> now)"
  echo
  for p in server components app; do
    if [ -d "$before/$p" ]; then
      diff -ruN "$before/$p" "$root/$p" || true
    fi
  done
  diff -uN "$before/package.json" "$root/package.json" || true
  diff -uN "$before/tsconfig.json" "$root/tsconfig.json" || true
} > "$out"
echo "$out"
