import asyncio, json, sys, os
from playwright.async_api import async_playwright
BASE=os.environ.get('BASE','http://localhost:3100')
ok=[];bad=[]
def check(name,cond,extra=''):
    (ok if cond else bad).append(name); print(('PASS ' if cond else 'FAIL ')+name+(' '+str(extra) if extra and not cond else ''))
async def newpage(b,uid,w=1280,h=900):
    ctx=await b.new_context(viewport={'width':w,'height':h}); await ctx.add_cookies([{'name':'uid','value':str(uid),'url':BASE}])
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:asyncio.ensure_future(d.accept()))
    return pg,errs,ctx
async def toast_text(pg):
    await pg.wait_for_timeout(400); return await pg.inner_text('#toast')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        # reset data
        pg,errs,c=await newpage(b,7); await pg.goto(BASE); await pg.request.post(BASE+'/api/reset-sample-data'); await c.close()

        # 0. login picker works
        ctx=await b.new_context(viewport={'width':1280,'height':800}); pg=await ctx.new_page(); await pg.goto(BASE+'/#/')
        await pg.wait_for_selector('button.who-btn'); n=await pg.locator('button.who-btn').count(); check('login picker lists 7 people',n==7,n)
        await pg.locator('button.who-btn',has_text='Temple president').click(); await pg.wait_for_selector('text=Review queue')
        check('president lands on review queue',await pg.locator('h1').inner_text()=='Review queue'); await ctx.close()

        # 1. mentor submits Priya (ready) from the mentor file
        pg,errs,c=await newpage(b,3,390,900); await pg.goto(BASE+'/#/candidates'); await pg.wait_for_selector('.cardlink')
        await pg.locator('.cardlink',has_text='Priya Ghosh').click(); await pg.wait_for_selector('#m-ready')
        await pg.fill('#m-ready','Steady practice, serves regularly. Ready.'); await pg.click('[data-act=mentor-submit]')
        t=await toast_text(pg); check('mentor submit toast','Submitted' in t,t); check('no page errors (mentor)',not errs,errs); await c.close()

        # 2. president queue shows Priya; approve
        pg,errs,c=await newpage(b,5); await pg.goto(BASE+'/#/queue'); await pg.wait_for_selector('table')
        check('queue now has 6 waiting',(await pg.locator('.tile .n').first.inner_text())=='6')
        await pg.locator('tr',has_text='Priya Ghosh').locator('a',has_text='Review').click(); await pg.wait_for_selector('#decide-btn')
        check('approve is enabled when everything is met',await pg.locator('input[value=approve]').is_enabled())
        await pg.click('#decide-btn'); t=await toast_text(pg); check('approve toast','Approved' in t,t)
        r=await pg.request.get(BASE+'/api/candidates/2/letter'); check('letter pdf served',r.status==200 and r.headers['content-type'].startswith('application/pdf'),r.status)
        check('no page errors (president)',not errs,errs)

        # 3. Debashis cannot be approved; committee records exceptions; then approvable
        await pg.goto(BASE+'/#/candidate/10'); await pg.wait_for_selector('#decide-btn')
        check('approve disabled for Debashis',await pg.locator('input[value=approve]').is_disabled())
        r=await pg.request.post(BASE+'/api/candidates/10/recommendation',data=json.dumps({'decision':'approve'}),headers={'content-type':'application/json'})
        check('server also refuses approval (409)',r.status==409,r.status); await c.close()
        pg,errs,c=await newpage(b,6); await pg.goto(BASE+'/#/candidate/10'); await pg.wait_for_selector('[data-act=exception]')
        for rid in ['R-3','R-4']:
            await pg.fill(f'#exc-{rid}','Sample exception: confirmed by the committee in person'); await pg.click(f'[data-act=exception][data-rule={rid}]'); await pg.wait_for_timeout(500)
        check('no page errors (committee)',not errs,errs); await c.close()
        pg,errs,c=await newpage(b,5); await pg.goto(BASE+'/#/candidate/10'); await pg.wait_for_selector('#decide-btn')
        check('approve now enabled after exceptions',await pg.locator('input[value=approve]').is_enabled())
        check('exception chip shown',await pg.locator('.chip.exception').count()==2)
        await c.close()

        # 4. committee records guru answer for Priya, admin plans ceremony
        pg,errs,c=await newpage(b,6); await pg.goto(BASE+'/#/candidate/2'); await pg.wait_for_selector('#g-resp')
        await pg.select_option('#g-resp','accepted'); await pg.click('[data-act=guru-answer]'); t=await toast_text(pg); check('guru answer recorded','answer recorded' in t,t); await c.close()
        pg,errs,c=await newpage(b,7); await pg.goto(BASE+'/#/ceremonies'); await pg.wait_for_selector('#cer-pool')
        await pg.fill('#cer-date','2026-11-01'); await pg.click('[data-act=cer-save]'); await pg.wait_for_selector('#cer-pool')
        opts=await pg.locator('#cer-pool option').all_inner_texts(); check('Priya is in the attach list',any('Priya' in o for o in opts),opts)
        await pg.select_option('#cer-pool',label='Priya Ghosh'); await pg.click('[data-act=cer-attach]'); await pg.wait_for_selector('tr:has-text("Priya Ghosh")')
        # mark everyone present, name them, try to complete without a name first
        boxes=pg.locator('input[data-act=cer-present]'); n=await boxes.count()
        for i in range(n):
            await boxes.nth(0).check() if i==0 else None
        await pg.wait_for_timeout(500)
        # present all three one by one
        for name in ['Isha Banerjee','Pallab Sarkar','Priya Ghosh']:
            row=pg.locator('tr',has_text=name); cb=row.locator('input[data-act=cer-present]')
            if not await cb.is_checked(): await cb.check(); await pg.wait_for_timeout(500)
        await pg.fill('tr:has-text("Isha Banerjee") input[data-act=cer-name]','Sample name Isha')
        await pg.fill('tr:has-text("Pallab Sarkar") input[data-act=cer-name]','Sample name Pallab')
        # leave Priya's name blank on purpose
        await pg.click('[data-act=cer-complete]'); t=await toast_text(pg); check('cannot complete without every spiritual name','Priya' in t,t)
        await pg.fill('tr:has-text("Priya Ghosh") input[data-act=cer-name]','Sample name Priya'); await pg.click('[data-act=cer-complete]'); t=await toast_text(pg)
        check('ceremony completed, 3 register entries','3 register entries' in t,t)
        await pg.goto(BASE+'/#/register'); await pg.wait_for_selector('table'); rows=await pg.locator('tbody tr').count(); check('register now has 8 entries',rows==8,rows)
        await pg.fill('#rq','Priya'); await pg.wait_for_timeout(700); rows=await pg.locator('tbody tr').count(); check('register search finds Priya',rows==1,rows)
        csv=await pg.request.get(BASE+'/api/register.csv'); check('register csv',csv.status==200 and 'Sample name Priya' in await csv.text())
        check('no page errors (admin)',not errs,errs); await c.close()

        # 5. rule set floor enforced
        pg,errs,c=await newpage(b,7); await pg.goto(BASE+'/#/rulesets/3'); await pg.wait_for_selector('#rs-shelter_months')
        await pg.fill('#rs-shelter_months','3'); await pg.dispatch_event('#rs-shelter_months','change')
        check('below-floor badge',await pg.locator('#rsb-shelter_months').inner_text()=='Below floor' or 'Below floor' in await pg.locator('#rsb-shelter_months').inner_text())
        await pg.click('[data-act=rs-save]'); t=await toast_text(pg); check('server rejects below-floor save','GBC baseline needs at least 6' in t,t)
        await pg.fill('#rs-shelter_months','9'); await pg.fill('#rs-note','Sample: shelter raised to 9'); await pg.click('[data-act=rs-publish]'); t=await toast_text(pg); check('publish v2',"Version 2 published" in t,t)
        await c.close()

        # 6. candidate uploads certificate -> R-4 met (Kavya has course complete + cert; use Ananya: course=1, cert missing)
        pg,errs,c=await newpage(b,1,390,900); await pg.goto(BASE+'/#/path'); await pg.wait_for_selector('.next')
        txt=await pg.inner_text('.next'); check('Ananya next step is the certificate','Disciples Course certificate' in txt,txt)
        open('/tmp/cert.txt','w').write('sample certificate')
        async with pg.expect_file_chooser() as fc: await pg.click('[data-act=pick-file]')
        f=await fc.value; await f.set_files('/tmp/cert.txt'); t=await toast_text(pg); check('upload toast','Uploaded' in t,t)
        await pg.wait_for_timeout(500); body=await pg.inner_text('.body'); check('R-4 now met for Ananya','Certificate on file' in body,body[:300])
        check('next step moved on to the exam','examination' in (await pg.inner_text('.next')).lower(),await pg.inner_text('.next'))
        # language switch
        await pg.click('[data-act=lang][data-lang=bn]'); await pg.wait_for_timeout(300); check('Bengali labels',await pg.locator('text=আমার পথ').count()>0)
        # access control: candidate cannot read another file
        r=await pg.request.get(BASE+'/api/candidates/10'); check('candidate cannot open another file (404)',r.status==404,r.status)
        r=await pg.request.post(BASE+'/api/candidates/1/recommendation',data='{}',headers={'content-type':'application/json'}); check('candidate cannot recommend (403)',r.status==403,r.status)
        check('no page errors (candidate)',not errs,errs); await c.close()

        # 7. package export logs missing documents
        pg,errs,c=await newpage(b,6); r=await pg.request.get(BASE+'/api/candidates/10/package?log=1'); check('package pdf',r.status==200 and r.headers['content-type'].startswith('application/pdf'))
        d=await (await pg.request.get(BASE+'/api/candidates/10')).json(); check('export logged in audit',any(t['action']=='package_exported' for t in d['timeline']))
        await c.close()
        await b.close()
    print(f'\n{len(ok)} passed, {len(bad)} failed'); sys.exit(1 if bad else 0)
asyncio.run(main())
