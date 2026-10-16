#!/usr/bin/env bash
# Usage: snapshot.sh DEST_DIR  -> copies reviewable source into DEST_DIR
# Copies all files (not just TS) so non-source files do not appear as "new"
# in the review diff. Excludes build/dependency dirs.
set -euo pipefail
root="/Users/Rosen/WebstormProjects/belote"
dest="$1"
rm -rf "$dest"
mkdir -p "$dest"
for p in server components app; do
  if [ -d "$root/$p" ]; then
    mkdir -p "$dest/$p"
    rsync -a --exclude='node_modules' --exclude='.next' "$root/$p/" "$dest/$p/"
  fi
done
cp "$root/package.json" "$dest/package.json" 2>/dev/null || true
cp "$root/tsconfig.json" "$dest/tsconfig.json" 2>/dev/null || true
