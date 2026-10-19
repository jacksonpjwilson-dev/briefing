#!/usr/bin/env bash
# Publish preview-widget/ from this branch (widget-home) to main -> https://jacksonpjwilson-dev.github.io/briefing/preview-widget/
# Touches ONLY preview-widget/ on main. Sunny's publish.sh writes only index.html, archive.html and days/,
# and uses `git add -A` after a pull, so it never deletes this folder.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; SITE=/workspace/briefing-site
cd "$SITE"; [ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "site clone not on main"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "site clone has local changes; not publishing"; exit 1; }
git pull -q --rebase origin main
rm -rf preview-widget && cp -r "$HERE/preview-widget" preview-widget
git add preview-widget
git -c user.name="Daily Briefing" -c user.email="jacksonpjwilson-dev@users.noreply.github.com" commit -qm "preview-widget: ${1:-update} (from widget-home $(git -C "$HERE" rev-parse --short HEAD))" || { echo "no changes"; exit 0; }
git push -q origin HEAD:main && echo "Published -> https://jacksonpjwilson-dev.github.io/briefing/preview-widget/"
