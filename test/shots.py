import asyncio, sys
from playwright.async_api import async_playwright
BASE='http://localhost:3100'
# uid: 1 Ananya, 3 Mohan, 5 president, 6 committee, 7 admin
S=[(1,'path',390,900,'candidate-path'),(1,'documents',390,900,'candidate-documents'),(3,'candidates',390,900,'mentor-list'),
 (5,'queue',1280,800,'president-queue'),(5,'candidate/10',1280,1000,'president-file'),(7,'rulesets',1280,1000,'admin-rulesets'),
 (7,'ceremonies',1280,900,'admin-ceremonies'),(7,'register',1280,700,'admin-register'),(6,'candidate/10',1280,1100,'committee-file'),(3,'candidate/1',390,1100,'mentor-file')]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for uid,route,w,h,name in S:
            ctx=await b.new_context(viewport={'width':w,'height':h})
            await ctx.add_cookies([{'name':'uid','value':str(uid),'url':BASE}])
            pg=await ctx.new_page()
            errs=[]
            pg.on('pageerror',lambda e:errs.append(str(e)))
            pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'tunnel' not in m.text.lower() and 'ERR_' not in m.text else None)
            await pg.goto(f'{BASE}/#/{route}'); await pg.wait_for_timeout(900)
            await pg.screenshot(path=f'shots/{name}.png',full_page=True)
            print(name,errs[:3])
            await ctx.close()
        await b.close()
asyncio.run(main())
