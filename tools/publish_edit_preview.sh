#!/usr/bin/env bash
# Publish preview-widget/ from THIS branch (calendar-edit) to preview-edit/ on main
#   -> https://jacksonpjwilson-dev.github.io/briefing/preview-edit/   (a separate test preview; preview-widget/ and the live root are untouched)
# Only preview-edit/ changes on main. The bundled data/ snapshot (Jackson's schedule/briefing fallback) is NOT copied, and the
# manifest/title are renamed so a home-screen install can't be confused with the real preview.
# The commit carries [skip qa] because the app-qa watcher only knows the preview-widget URL; open the Bugsy issue by hand
# (see README "Calendar edit preview").
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; SITE=/workspace/briefing-site
cd "$SITE"; [ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "site clone not on main"; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "site clone has local changes; not publishing"; exit 1; }
git pull -q --rebase origin main
rm -rf preview-edit && cp -r "$HERE/preview-widget" preview-edit && rm -rf preview-edit/data
sed -i 's/"name":"MyAssistant (preview)"/"name":"MyAssistant (calendar edit preview)"/; s/"short_name":"MyAssistant"/"short_name":"MyA edit"/' preview-edit/manifest.webmanifest
sed -i 's#<title>MyAssistant · Widget home preview</title>#<title>MyAssistant · Calendar edit preview</title>#; s#content="MyAssistant">#content="MyA edit">#' preview-edit/index.html
git add preview-edit
git -c user.name=jacksonpjwilson-dev -c user.email=jacksonpjwilson-dev@users.noreply.github.com commit -qm "preview-edit: ${1:-update} (from calendar-edit $(git -C "$HERE" rev-parse --short HEAD)) [skip qa]" || { echo "no changes"; exit 0; }
git push -q origin HEAD:main && echo "Published -> https://jacksonpjwilson-dev.github.io/briefing/preview-edit/ ($(git rev-parse --short HEAD))"
