#!/usr/bin/env python3
"""Build preview-widget/data/{briefing,schedule}.json from the PUBLIC-safe briefing source.
Usage: build_snapshot.py /workspace/briefing/data-YYYY-MM-DD.json [schedule.json]
- Reuses the public site's sanitizer (site_build.strip) so it carries exactly what the public briefing shows.
- Then drops anything financial (money, loans, bank, payday, subscriptions, receipts) - stricter than the site.
"""
import json, os, re, sys
sys.path.insert(0, "/workspace/briefing")
from site_build import strip, DOLLAR  # same sanitizer as Sunny's publish

FIN = re.compile(r"\$|CA\$|\bOSAP\b|NSLSC|\bBMO\b|chequing|savings|payday|refund|subscription|renew|\bloan\b|bank|account ending|financ|receipt|invoice|budget", re.I)
def clean_list(xs, key=None):
    return [x for x in xs if not FIN.search(json.dumps(x, ensure_ascii=False))]

def main(src, sched=None):
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "preview-widget", "data")
    d = strip(json.load(open(src)))
    try: pros = sorted(json.load(open(d.get("prospects_file") or ""))["prospects"], key=lambda x: x.get("rank", 99))[:3]
    except Exception: pros = []
    b = {k: d.get(k) for k in ["date","date_label","greeting","generated","weather","aviation","shifts","overlap","movements","workout","tasks","noteworthy","focus","sixers"]}
    b["tasks"] = clean_list(b.get("tasks") or []); b["noteworthy"] = clean_list(b.get("noteworthy") or [])
    b["prospects"] = [{k: p.get(k) for k in ["rank","title","company","location","minimums","link","firstSeen"]} for p in pros]
    b["source"] = "snapshot"
    txt = json.dumps(b, ensure_ascii=False, indent=1)
    if DOLLAR.search(txt) or FIN.search(txt): sys.exit("REFUSED: financial content in snapshot")
    open(os.path.join(out, "briefing.json"), "w").write(txt)
    s = json.load(open(sched or "/workspace/schedule-site/data/schedule.json"))
    open(os.path.join(out, "schedule.json"), "w").write(json.dumps(s, ensure_ascii=False, indent=1))
    print("snapshot", b["date"], len(b["tasks"]), "tasks", len(s["events"]), "events")
if __name__ == "__main__": main(*sys.argv[1:])
