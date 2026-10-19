# Daily Briefing · widget home (branch `widget-home`)

One app that combines the **Daily Briefing** and the **Smart Schedule** (Cal's combined schedule) in the Logbook v2 widget-home style:
swipe pager (no scrolling on home), dock, widgets that zoom open into full detail screens, swipe up from the home bar to close, six colourways, iPhone safe areas.

Live preview: https://jacksonpjwilson-dev.github.io/briefing/preview-widget/ (the main briefing at /briefing/ is untouched).

## How it's built
- `preview-widget/app.js`: one shared `STORE` with two slices:
  - **briefing**: parsed at runtime from the live public briefing (`../index.html`, which Sunny publishes each morning), so the app updates on its own; falls back to `data/briefing.json`.
  - **schedule**: `/schedule/data/schedule.json` (Cal's combined schedule), falling back to `data/schedule.json`.
- **Sections** (Schedule today/week, Weather, Aviation, Work, Day, Reminders, Inbox, More) each own a model built from their slice, plus `widget()`, `summary()` and `detail()`.
- The **Briefing** page (home, page 1) is built only from section `summary()` output. Each line shows a "from …" source label and opens that section's detail screen.
- No money or financial info: anything matching the `FIN` filter is dropped. Times are Ontario, 24 h. The inbox thread list is labelled **SAMPLE DATA** because the inbox summary isn't public.

## Tools
- `tools/build_snapshot.py data-YYYY-MM-DD.json`: refreshes the fallback snapshot, using the same sanitizer as the public site plus the money filter.
- `tools/publish_preview.sh "message"`: copies `preview-widget/` to `main` and pushes. Only that folder changes.
- `tools/capture.py BASE_URL OUT_DIR`: takes 393×852 @3x screenshots.
