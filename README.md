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

## Calendar editing (branch `calendar-edit`)
Test preview: https://jacksonpjwilson-dev.github.io/briefing/preview-edit/ (`?qa=1` = sample schedule, no sign-in, nothing saved
beyond the tab). Published with `tools/publish_edit_preview.sh`, which only touches `preview-edit/` on main.

- **Tap** a block in the Week view (or a row in Day by day) to change its date, start and end, delete it, or **Reset to calendar**.
  Events you added also get a title and type. Times use two 24 h selects (the iPhone time input would follow a 12 h phone setting).
- **Hold, then drag** a block to move it (touch: hold 0.4 s; moving sooner just scrolls. Mouse: drag straight away). 15 min steps,
  across days too. A ghost shows the new day and time; the page can't scroll while you drag. Every change has an Undo toast.
- **＋** adds an event (title, type, date, start, end). An end before the start means the next day (+1).
- The **Today** view, its dock icon and the Today/Week toggle are gone. Everything that opened it now opens the Week view
  (the Today widget on the Sections page stays as a glance and opens Week). The week grid has a red now-line.
- **Storage**: `briefing/{uid}/user/scheduleEdits` = `{v:1, edits:[...], updatedAt}` (owner read/write per the rules; device copy as
  the fallback). Edits are an override layer over the feed (`applyEdits` in app.js):
  `move {key,covers,src,date,start,dur}`, `delete {key,covers,src}`, `add {id,key:'add:<id>',date,start,dur,label,type}`.
  Key = source id + `@` + date. Source id = the feed's `uid` (+`/recurrenceId`) if present, else `h` + FNV-1a(type|label|start)
  (Cal's `e1, e2…` ids are positions and shift whenever the file changes). `covers` = the after-midnight piece of an overnight block.
- **Orphans** (source gone, or its start/title/type changed) aren't applied and are flagged in "Your changes" with Remove.
  If the calendar changed only the end time, the edit is kept and flagged. Edits older than 30 days are dropped on load.
- New users (no feed) use the same doc: their repeating events are the "feed" (`uid` = `u<id>`), so tapping one changes just
  that day ("Edit every repeat" opens the old series editor).
- **Cal's nightly build**: `fswrite.py edits-export` (read only) -> `/home/box/shared/schedule-edits.json`, then
  `/workspace/fullapp-shared/schedule-edits/schedule_edits.py apply data/schedule.json` (same rules, Python). It keeps the raw
  events in `editsApplied.rawEvents`, so the app un-applies before applying (no double apply) and re-runs are idempotent.
  Handoff: `/home/box/shared/crew/scopes/schedule-edits-cal.md`.
- Tests: `tools/test_calendar_qa.py` (QA mode, touch drag via CDP) and `tools/test_calendar_owner.py` (stubbed sign-in: owner feed,
  new user, orphan, JS == Python apply).
