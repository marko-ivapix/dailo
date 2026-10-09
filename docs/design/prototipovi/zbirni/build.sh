#!/bin/sh
# Join the combined prototype parts into ../dailo-prototip.html and syntax-check the script.
set -e
cd "$(dirname "$0")"
PARTS="20-core.js 30-today.js 31-inbox.js 32-tasks.js 33-calendar.js 34-habits.js 35-more.js 40-taskwin.js 41-quick.js 42-habit.js 50-library.js 51-home.js 52-tools.js 53-search-focus-habit.js"
out=../dailo-prototip.html
{
  cat 00-head.html 10-body.html
  echo '<script>'
  for f in $PARTS; do cat "$f"; done
  cat 99-tail.html
} > "$out"
dir=$(mktemp -d)
check="$dir/all.js"
for f in $PARTS; do cat "$f"; done > "$check"
node --check "$check"
rm -r "$dir"
wc -l "$out"
# The desktop prototype: the same parts plus the desktop stylesheet and script.
desk=../dailo-racunar.html
{
  awk '/<\/head>/ { print "<style>"; while ((getline line < "60-desktop.css") > 0) print line; print "</style>" } { print }' 00-head.html
  cat 10-body.html
  echo '<script>'
  for f in $PARTS 60-desktop.js; do cat "$f"; done
  cat 99-tail.html
} > "$desk"
dir=$(mktemp -d)
for f in $PARTS 60-desktop.js; do cat "$f"; done > "$dir/all.js"
node --check "$dir/all.js"
rm -r "$dir"
wc -l "$desk"
