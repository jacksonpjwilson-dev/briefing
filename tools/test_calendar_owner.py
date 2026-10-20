#!/usr/bin/env python3
"""Owner + new-user modes with a stubbed JWAUTH (in-memory Firestore in localStorage), plus a JS<->Python apply cross-check.
Usage: test_owner.py BASE_URL OUT_DIR"""
import asyncio, sys, os, json, subprocess, shutil
from playwright.async_api import async_playwright
BASE, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
SE = "/workspace/fullapp-shared/schedule-edits/schedule_edits.py"
FAIL=[]
def ok(c,msg):
    print(("PASS " if c else "FAIL ")+msg)
    if not c: FAIL.append(msg)
STUB = r"""(function(){const L=()=>JSON.parse(localStorage.getItem('__FS')||'{}'),S=o=>localStorage.setItem('__FS',JSON.stringify(o));const U=JSON.parse(localStorage.getItem('__U')||'null');
window.JWAUTH={ready:()=>Promise.resolve(U),getDoc:async p=>L()[p]||null,setDoc:async(p,d)=>{const o=L();o[p]=JSON.parse(JSON.stringify(d));S(o);window.__writes=(window.__writes||[]).concat([p])},
getCol:async p=>{const o=L(),r={};for(const k in o)if(k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/'))r[k.slice(p.length+1)]=o[k];return r},
denied:()=>false,signOut:async()=>{},gate:()=>{},css:()=>{},init:()=>Promise.resolve(),errMsg:e=>String(e)}})();"""
SCHED = json.load(open("/workspace/schedule-site/data/schedule.json"))
BRIEF = json.load(open("/workspace/briefing-widget/preview-widget/data/briefing.json")); BRIEF["date"]="2026-10-20"; BRIEF["date_label"]="Tuesday, October 20, 2026"
norm = lambda evs: sorted((e["date"],e["start"],e["end"],e["type"],e["label"]) for e in evs)
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--disable-dev-shm-usage"])
    async def newctx(fs, user):
      ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
      await ctx.route("**/jwauth.js*", lambda r: r.fulfill(body=STUB, content_type="application/javascript"))
      await ctx.add_init_script("(([fs,u])=>{if(!localStorage.getItem('__FS'))localStorage.setItem('__FS',JSON.stringify(fs));localStorage.setItem('__U',JSON.stringify(u))})(%s)" % json.dumps([fs,user]))
      pg = await ctx.new_page(); errs=[]
      pg.on("pageerror", lambda e: errs.append("pageerror: "+str(e))); pg.on("console", lambda m: errs.append("console: "+m.text) if m.type=="error" else None)
      return ctx, pg, errs
    async def shot(pg,n): await pg.wait_for_timeout(250); await pg.screenshot(path=f"{OUT}/{n}.png"); print("  shot", n)
    async def tapblk(pg, cond):
      i = await pg.evaluate("c=>{const i=[...document.querySelectorAll('.wg [data-wkb]')].find(i=>eval(c));if(!i)return null;i.scrollIntoView({block:'center'});return i.dataset.wkb}", cond)
      await pg.tap(f'.wg [data-wkb="{i}"]'); await pg.wait_for_timeout(300); return i
    U={"uid":"U1","email":"owner@test","displayName":"Owner"}
    fs={"briefing/U1/feed/briefing":{"date":"2026-10-20","data":BRIEF},"briefing/U1/feed/schedule":{"data":SCHED}}
    # ===== OWNER =====
    ctx,pg,errs = await newctx(fs,U)
    await pg.goto(BASE+"?open=schedule&view=week", wait_until="networkidle"); await pg.wait_for_timeout(800)
    ok(await pg.evaluate("__DBW.MODE.kind")=="owner" and await pg.evaluate("__DBW.MODE.feed"), "owner mode from the feed")
    await pg.evaluate("document.querySelector('.wg').scrollIntoView({block:'start'});document.querySelector('.ovb').scrollTop-=70"); await shot(pg,"20-owner-week-real-feed")
    # overnight Chartright shift Tue 15:00 -> Wed 01:30: move to 16:00-02:30
    await tapblk(pg, "i.style.background.includes('--chartright')&&i.innerText.includes('15:00')")
    await shot(pg,"21-owner-edit-chartright")
    await pg.select_option('#es_s [data-p=h]','16'); await pg.select_option('#es_e [data-p=h]','02'); await pg.select_option('#es_e [data-p=m]','30'); await pg.tap('#es_ok'); await pg.wait_for_timeout(400)
    # delete Thu workout
    await tapblk(pg, "i.style.background.includes('--workout')&&i.closest('.col').dataset.d==String(Math.round(Date.UTC(2026,9,22)/864e5))")
    await pg.tap('#es_del'); await pg.wait_for_timeout(400)
    # add an event Fri 23 09:00-10:00 type work
    await pg.tap('.fab'); await pg.wait_for_timeout(300); await pg.fill('#es_l','Dentist'); await pg.fill('#es_d','2026-10-24')
    await pg.select_option('#es_s [data-p=h]','12'); await pg.select_option('#es_e [data-p=h]','13'); await pg.tap('#es_ok'); await pg.wait_for_timeout(400)
    # move a sleep that crosses midnight (Wed 20:00 -> Thu 02:30) to 21:00 by sheet
    await tapblk(pg, "i.style.background.includes('--sleep')&&i.innerText.includes('20:00')")
    await pg.select_option('#es_s [data-p=h]','21'); await pg.tap('#es_ok'); await pg.wait_for_timeout(400)
    FS = await pg.evaluate("JSON.parse(localStorage.getItem('__FS'))"); doc = FS.get("briefing/U1/user/scheduleEdits")
    ok(doc and len(doc["edits"])==4, f"4 edits written to briefing/U1/user/scheduleEdits: {[ (x['op'],x['key']) for x in (doc or {}).get('edits',[])]}")
    ok("briefing/U1/user/scheduleEdits" in (await pg.evaluate("window.__writes||[]")), "the app wrote the Firestore doc (not just the device)")
    js_events = await pg.evaluate("__DBW.STORE.schedule.events")
    await pg.evaluate("document.querySelector('.wg').scrollIntoView({block:'start'});document.querySelector('.ovb').scrollTop-=70"); await shot(pg,"22-owner-week-after-edits")
    # ---- Python apply on the same raw schedule must give the same events ----
    json.dump({"edits":doc["edits"]}, open("/tmp/ce-edits.json","w"))
    shutil.copy("/workspace/schedule-site/data/schedule.json","/tmp/ce-sched.json")
    r = subprocess.run(["python3",SE,"apply","/tmp/ce-sched.json","--edits","/tmp/ce-edits.json","--report","/tmp/ce-report.json"],capture_output=True,text=True); print("  py:", r.stdout.strip(), r.stderr.strip())
    applied = json.load(open("/tmp/ce-sched.json"))
    ok(norm(applied["events"])==norm(js_events), "Python apply == app (same events after edits)")
    if norm(applied["events"])!=norm(js_events):
      a,bb=set(norm(applied["events"])),set(norm(js_events)); print("  only py:",sorted(a-bb)[:6]); print("  only js:",sorted(bb-a)[:6])
    r2 = subprocess.run(["python3",SE,"apply","/tmp/ce-sched.json","--edits","/tmp/ce-edits.json","--report","/tmp/ce-report.json"],capture_output=True,text=True)
    ok(norm(json.load(open("/tmp/ce-sched.json"))["events"])==norm(applied["events"]), "Python apply is idempotent (re-run on an applied file)")
    await ctx.close()
    # ---- feed that already has edits applied (Cal's step ran before fswrite) -> no double apply ----
    fs2=dict(fs); fs2["briefing/U1/feed/schedule"]={"data":applied}; fs2["briefing/U1/user/scheduleEdits"]=doc
    ctx,pg,errs2 = await newctx(fs2,U); await pg.goto(BASE+"?open=schedule&view=week", wait_until="networkidle"); await pg.wait_for_timeout(800)
    ok(norm(await pg.evaluate("__DBW.STORE.schedule.events"))==norm(js_events) and await pg.evaluate("__DBW.EDITS.orphans.length")==0, "already-applied feed: same result, no orphans (no double apply)")
    # ---- orphan: an edit whose source event is gone ----
    bad=dict(doc); bad["edits"]=doc["edits"]+[{"op":"delete","key":"hzzzzzz@2026-10-22","covers":[],"src":{"date":"2026-10-22","start":"07:00","end":"08:00","dur":60,"type":"event","label":"Old calendar event"}}]
    await pg.evaluate("d=>{const o=JSON.parse(localStorage.getItem('__FS'));o['briefing/U1/user/scheduleEdits']=d;localStorage.setItem('__FS',JSON.stringify(o))}", bad)
    await pg.reload(wait_until="networkidle"); await pg.wait_for_timeout(800)
    ok(await pg.evaluate("__DBW.EDITS.orphans.length")==1, "orphan detected in the app")
    await pg.evaluate("[...document.querySelectorAll('.card h3')].find(h=>h.textContent.startsWith('Your changes')).scrollIntoView({block:'start'});document.querySelector('.ovb').scrollTop-=60")
    ok(await pg.evaluate("document.querySelector('.li.chg.orphan')?.innerText.includes('No longer in your calendar')"), "orphan flagged in Your changes with Remove")
    await shot(pg,"23-owner-orphan-flagged")
    json.dump({"edits":bad["edits"]}, open("/tmp/ce-edits2.json","w")); shutil.copy("/workspace/schedule-site/data/schedule.json","/tmp/ce-sched2.json")
    r = subprocess.run(["python3",SE,"apply","/tmp/ce-sched2.json","--edits","/tmp/ce-edits2.json","--report","/tmp/ce-report2.json"],capture_output=True,text=True); print("  py:", r.stdout.strip())
    rep=json.load(open("/tmp/ce-report2.json")); ok(len(rep["orphans"])==1 and len(rep["applied"])==4, "Python drops the orphan and reports it")
    await pg.click('.li.chg.orphan [data-ereset]'); await pg.wait_for_timeout(400)
    ok(await pg.evaluate("__DBW.EDITS.list.length")==4, "Remove clears the orphan")
    errs += errs2; await ctx.close()
    # ===== NEW USER (no feed): template events + the same edits doc =====
    U2={"uid":"N1","email":"new@test","displayName":"New"}
    fs3={"briefing/N1/user/profile":{"name":"Sam","onboarded":True,"sections":["schedule","reminders"],"city":None,"icao":""},
         "briefing/N1/user/schedule":{"events":[{"id":"w1","label":"Work","type":"work","date":"2026-10-19","start":"09:00","end":"17:00","repeat":"weekdays","notes":""},{"id":"s1","label":"Sleep","type":"sleep","date":"2026-10-19","start":"23:00","end":"07:00","repeat":"daily","notes":""}]}}
    ctx,pg,errs3 = await newctx(fs3,U2); await pg.goto(BASE+"?open=schedule&view=week", wait_until="networkidle"); await pg.wait_for_timeout(800)
    ok(await pg.evaluate("__DBW.MODE.kind")=="user", "new user mode")
    dock = await pg.evaluate("[...document.querySelectorAll('.dock button')].map(b=>b.getAttribute('aria-label'))"); ok("Today" not in dock, f"new user dock has no Today: {dock}")
    await tapblk(pg, "i.style.background.includes('--work')")
    ok(await pg.is_visible('#es_series'), "repeating event: sheet says this day only + Edit every repeat")
    await shot(pg,"24-user-edit-occurrence")
    await pg.select_option('#es_s [data-p=h]','10'); await pg.tap('#es_ok'); await pg.wait_for_timeout(400)
    await pg.tap('.fab'); await pg.wait_for_timeout(300); await pg.fill('#es_l','Class'); await pg.tap('#es_ok'); await pg.wait_for_timeout(400)
    FS = await pg.evaluate("JSON.parse(localStorage.getItem('__FS'))"); d=FS.get("briefing/N1/user/scheduleEdits")
    ok(d and [x["op"] for x in d["edits"]]==["move","add"] and d["edits"][0]["key"].startswith("uw1@"), f"new user's edits in the same scheduleEdits doc: {d and [(x['op'],x['key']) for x in d['edits']]}")
    ok(await pg.evaluate("document.querySelectorAll('.wg [data-wkb].ed').length")>=2, "new user's edited/added blocks marked")
    await pg.evaluate("document.querySelector('.wg').scrollIntoView({block:'start'});document.querySelector('.ovb').scrollTop-=70"); await shot(pg,"25-user-week-after-edits")
    errs += errs3; await ctx.close()
    ok(not errs, f"no JS/console errors: {errs}")
    print("RESULT", "ALL PASS" if not FAIL else f"{len(FAIL)} FAIL: {FAIL}")
    await b.close()
asyncio.run(main())
