#!/usr/bin/env python3
"""Capture 393x852 @3x screenshots of the widget app. Usage: capture.py BASE_URL OUT_DIR"""
import asyncio, sys, os
from playwright.async_api import async_playwright
BASE, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
# iPhone safe areas + status bar (Chromium doesn't emulate env(safe-area-inset-*))
SB = """(()=>{const r=document.documentElement.style;r.setProperty('--sat','54px');r.setProperty('--sab','34px');
const b=document.createElement('div');b.id='sbar';b.style.cssText='position:fixed;top:0;left:0;right:0;height:54px;z-index:99999;display:flex;align-items:center;justify-content:space-between;padding:6px 34px 0 46px;font:600 17px Inter,system-ui;pointer-events:none;color:var(--text)';
b.innerHTML='<span>9:41</span><span style="display:flex;gap:6px;align-items:center"><svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5" width="3" height="7" rx="1" fill="currentColor"/><rect x="10" y="2.5" width="3" height="9.5" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg><svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor"/></svg></span>';document.body.appendChild(b)})()"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--disable-dev-shm-usage"])
    ctx = await b.new_context(viewport={"width":393,"height":852}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)+" @ "+pg.url+" "+(e.stack or "")[:300]))
    async def go(q="", theme=None):
      await pg.goto(BASE+q, wait_until="networkidle"); await pg.wait_for_timeout(600)
      if theme: await pg.evaluate("t=>{localStorage.setItem('dbw:theme',t)}", theme); await pg.reload(wait_until="networkidle"); await pg.wait_for_timeout(600)
      await pg.evaluate(SB); await pg.wait_for_timeout(300)
    async def shot(n): await pg.wait_for_timeout(250); await pg.screenshot(path=f"{OUT}/{n}.png"); print("shot", n)
    await pg.goto(BASE, wait_until="networkidle"); await pg.evaluate("sessionStorage.clear();localStorage.clear()")
    await go(); await shot("01-briefing")
    await pg.click('[data-pg="1"]'); await pg.wait_for_timeout(600); await shot("02-sections-today")
    await pg.click('[data-pg="2"]'); await pg.wait_for_timeout(600); await shot("03-plan-week")
    for i,(sec,view) in enumerate([("schedule","today"),("schedule","week"),("weather",""),("aviation",""),("work",""),("day",""),("reminders",""),("inbox",""),("more",""),("settings","")]):
      await go(f"?open={sec}&view={view}"); await shot(f"{10+i:02d}-detail-{sec}{'-'+view if view else ''}")
    # zoom-open mid animation from a briefing line + home-bar swipe mid-gesture
    await pg.evaluate("sessionStorage.setItem('dbw:pg',0)"); await go()
    await pg.click('.ri[data-open="weather"]'); await pg.wait_for_timeout(150); await shot("20-zoom-open")
    await pg.wait_for_timeout(600)
    hb = await pg.locator('.homebar').bounding_box(); x=hb['x']+hb['width']/2; y=hb['y']+hb['height']-6
    await pg.mouse.move(x,y); await pg.mouse.down(); await pg.mouse.move(x,y-200,steps=8); await shot("21-swipe-up-close")
    await pg.mouse.move(x,y-320,steps=4); await pg.mouse.up(); await pg.wait_for_timeout(600)
    print("closed:", await pg.evaluate("!document.querySelector('#ov')"))
    for t in ["runway","daylight","paper"]:
      await pg.evaluate("sessionStorage.setItem('dbw:pg',0)"); await go("", t); await shot(f"30-colourway-{t}")
    print("errors", errs); await ctx.close(); await b.close()
asyncio.run(main())
