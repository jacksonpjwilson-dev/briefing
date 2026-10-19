#!/usr/bin/env python3
"""Week view + tapped-block popover at 390x844 @3x. Usage: capture_week.py BASE_URL OUT_DIR [prefix]"""
import asyncio, sys, os
from playwright.async_api import async_playwright
BASE, OUT = sys.argv[1], sys.argv[2]; PFX = sys.argv[3] if len(sys.argv)>3 else ""; os.makedirs(OUT, exist_ok=True)
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--disable-dev-shm-usage"])
    ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append("pageerror: "+str(e)))
    pg.on("console", lambda m: errs.append(f"console.{m.type}: {m.text}") if m.type in ("error","warning") else None)
    await pg.goto(BASE+"?open=schedule&view=week", wait_until="networkidle"); await pg.wait_for_timeout(800)
    await pg.evaluate("document.documentElement.style.setProperty('--sat','54px');document.documentElement.style.setProperty('--sab','34px')")
    await pg.evaluate("document.querySelector('.wg').scrollIntoView({block:'start'});document.querySelector('.ovb').scrollTop-=60")
    await pg.wait_for_timeout(300); await pg.screenshot(path=f"{OUT}/{PFX}01-week-grid.png")
    info = await pg.evaluate("""[...document.querySelectorAll('.wg [data-wkb]')].map(i=>({id:i.dataset.wkb,h:i.offsetHeight,w:i.offsetWidth,t:i.innerText.replace(/\\n/g,' | '),ov:i.scrollWidth>i.clientWidth+1}))""")
    for x in info: print(x)
    print("axis:", await pg.evaluate("[...document.querySelectorAll('.wg .ax span')].map(s=>s.textContent).join(' ')"))
    # tap a Chartright block (prefer one crossing midnight)
    tgt = await pg.evaluate("""(()=>{const a=[...document.querySelectorAll('.wg [data-wkb]')];const c=a.filter(i=>i.style.background.includes('chartright'));return (c.find(i=>i.innerText.includes('↓'))||c[0]||a[0]).dataset.wkb})()""")
    await pg.tap(f'.wg [data-wkb="{tgt}"]'); await pg.wait_for_timeout(400)
    print("popover:", await pg.evaluate("document.querySelector('.wkp')?.innerText"))
    await pg.screenshot(path=f"{OUT}/{PFX}02-block-popover.png")
    await pg.tap('.wkp .done'); await pg.wait_for_timeout(200); print("closed:", await pg.evaluate("!document.querySelector('.wkpop')"))
    # continuation part on next day
    t2 = await pg.evaluate("""(()=>{const a=[...document.querySelectorAll('.wg [data-wkb]')].filter(i=>i.style.background.includes('chartright')&&/↑|…/.test(i.innerText));return a[0]?.dataset.wkb})()""")
    if t2:
      await pg.tap(f'.wg [data-wkb="{t2}"]'); await pg.wait_for_timeout(400)
      print("popover2:", await pg.evaluate("document.querySelector('.wkp')?.innerText")); await pg.screenshot(path=f"{OUT}/{PFX}03-continuation-popover.png")
      await pg.tap('.wkp .done')
    await pg.evaluate("[...document.querySelectorAll('.card h3')].find(h=>h.textContent.includes('Day by day')).scrollIntoView({block:'start'})")
    await pg.wait_for_timeout(300); await pg.screenshot(path=f"{OUT}/{PFX}04-day-by-day.png")
    print("errors", errs); await ctx.close(); await b.close()
asyncio.run(main())
