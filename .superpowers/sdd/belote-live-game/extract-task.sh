#!/usr/bin/env bash
# Usage: extract-task.sh PLAN_FILE N  -> prints task N's section to stdout
set -euo pipefail
plan="$1"; n="$2"
awk -v n="$n" '
  /^### Task / {
    if (printing) exit
    if ($0 ~ ("^### Task " n ":")) printing = 1
  }
  printing { print }
' "$plan"
