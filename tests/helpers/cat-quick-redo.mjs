import crypto from 'node:crypto';
import fs from 'node:fs';
const xml = `<?xml version="1.0" encoding="UTF-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file source-language="en" target-language="zh-TW" datatype="plaintext" original="synthetic.txt"><body>${['CHECK one','other two','CHECK three','CHECK four'].map((s,i)=>`<trans-unit id="${i+1}"><source>${s}</source><target></target></trans-unit>`).join('')}</body></file></xliff>`;
async function settle(page) {
  for (let i=0;i<8;i++) {
    const id = await page.evaluate(()=>['projectWelcomeModal','fileLangModal','importConfirmedModal','metaDisplayMapModal','catGenericConfirmModal'].find(id=>{const e=document.getElementById(id);return e && !e.classList.contains('hidden')}));
    if (!id) return;
    if(id==='projectWelcomeModal') await page.locator('#btnProjectWelcomeSkip').click();
    if(id==='fileLangModal') {await page.locator('#fileLangTgtSearch').fill('繁體中文');await page.locator('#fileLangTgtList input[value="zh-TW"]').check();await page.locator('#btnFileLangConfirm').click();}
    if(id==='importConfirmedModal') await page.locator('#btnImportConfirmedConfirm').click();
    if(id==='metaDisplayMapModal') await page.locator('#btnMetaDisplayMapCancel').click();
    if(id==='catGenericConfirmModal') await page.locator('#btnCatGenericConfirmOk').click();
  }
}
async function snap(page) {return page.evaluate(()=>({rows:[...document.querySelectorAll('.grid-data-row')].map(r=>({id:r.dataset.segId,text:r.querySelector('.grid-textarea')?.innerText,status:r.dataset.status})),active:document.activeElement?.closest('.grid-data-row')?.dataset.segId}));}
/** 單機合成檔的正常介面流程；trace 僅觀察，不代補焦點或文字。 */
export async function runQuickRedoCase(browser, cfg, base, out) {
  if (!/^http:\/\/127\.0\.0\.1:\d+\/cat\/index.html$/.test(base)) throw Error('僅限本機單機 CAT');
    const ctx=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await ctx.newPage(); page.setDefaultTimeout(12000);
    const result={...cfg,errors:[]};
    page.on('pageerror',e=>result.errors.push(String(e)));
    try {
      await page.goto(base); const js=await (await page.request.get(new URL('/cat/app.js',base).href)).body();
      result.appSha256=crypto.createHash('sha256').update(js).digest('hex');
      await page.locator('[data-view="viewProjects"]').click();await page.locator('#btnCreateProjectModal').click();
      result.project=`[AI自驗] 快速重做 ${cfg.scope}-${cfg.tailPause}-${Date.now()}`;
      await page.locator('#namingModalInput').fill(result.project);await page.locator('#btnNamingModalConfirm').click();
      await page.locator('#projectWelcomeModal:not(.hidden)').waitFor();await settle(page);
      await page.locator('#btnAddFileModal').click();await page.locator('#sourceFileInput').setInputFiles({name:'[AI自驗] 快速重做.xlf',mimeType:'application/xml',buffer:Buffer.from(xml)});
      await page.locator('#fileLangModal:not(.hidden)').waitFor();await settle(page);
      await page.locator('#metaDisplayMapModal:not(.hidden)').waitFor();await settle(page);
      await page.locator('.edit-file-btn').first().waitFor();await page.locator('.edit-file-btn').first().click();await page.locator('.grid-textarea').first().waitFor();await settle(page);
      if(cfg.scope!=='off') {await page.locator('#sfModeFilter').click();if(cfg.scope==='source')await page.locator('.sf-scope-btn[data-scope="target"]').click();await page.locator('#sfInput').fill('CHECK');await page.locator('#sfInput').press('Enter');await page.waitForFunction(()=>[...document.querySelectorAll('.grid-data-row')].filter(r=>r.getBoundingClientRect().height>0).length===3);}
      result.scopes=await page.locator('.sf-scope-btn.on').evaluateAll(es=>es.map(e=>e.dataset.scope));
      await page.locator('.grid-textarea').first().click();await page.keyboard.insertText('甲');
      await page.locator('#catGenericConfirmModal:not(.hidden)').waitFor();await page.locator('#btnCatGenericConfirmOk').click();
      await page.locator('#catGenericConfirmModal:not(.hidden)').waitFor();await page.locator('#btnCatGenericConfirmOk').click();
      await page.locator('#catGenericConfirmModal').waitFor({state:'hidden'});
      await page.locator('.grid-textarea').first().click();
      await page.evaluate(()=>{window.__redoTrace=[];['keydown','input','focusin'].forEach(type=>document.addEventListener(type,e=>window.__redoTrace.push({type,key:e.key,data:e.data,text:e.target?.innerText,id:e.target?.closest?.('.grid-data-row')?.dataset.segId,at:performance.now()}),true));const orig=DBService.updateSegmentTarget.bind(DBService);DBService.updateSegmentTarget=async function(id,text,extra){window.__redoTrace.push({type:'save-start',id,text,at:performance.now()});const r=await orig(id,text,extra);window.__redoTrace.push({type:'save-end',id,text,at:performance.now()});return r;};});
      await page.keyboard.press('Control+Enter');await page.keyboard.type('abc');
      if(cfg.prefixPause)await page.waitForTimeout(cfg.prefixPause); // 刻意控制兩段輸入間隔，非等待焦點補救。
      await page.keyboard.type('-UNDO42');result.before=await snap(page);
      if(cfg.tailPause)await page.waitForTimeout(cfg.tailPause); // 對照立即與一般操作間隔。
      await page.keyboard.press('Control+z');result.undo=await snap(page);
      await page.keyboard.press('Control+y');result.redo=await snap(page);
      await page.keyboard.type('X');result.afterX=await snap(page);
      const id=result.before.active;result.targetId=id;
      result.redoComplete=result.redo.rows.find(r=>r.id===id)?.text==='abc-UNDO42';
      if(cfg.scope!=='off')await page.locator('#btnSfClearNav').click();
      await page.locator('#btnExitEditor').click();await page.locator('.edit-file-btn').first().waitFor();
      await page.locator('.edit-file-btn').first().click();await page.locator('.grid-textarea').first().waitFor();result.reopened=await snap(page);
      result.completeAfterReopen=result.reopened.rows.find(r=>r.id===id)?.text==='abc-UNDO42X';
      if (cfg.extra) {
        const target=page.locator(`.grid-data-row[data-seg-id="${id}"] .grid-textarea`);
        await target.click();await page.keyboard.press('End');
        await page.keyboard.type('NEW');await page.keyboard.press('Control+z');
        await page.keyboard.type('BRANCH');await page.keyboard.press('Control+y');
        result.branch=await snap(page);
        await page.waitForFunction(async ({id,text})=>{
          const projects=await DBService.getProjects();const files=await DBService.getFiles(projects[0].id);
          const segs=await DBService.getSegmentsByFile(files[0].id);
          return segs.find(s=>String(s.id)===id)?.targetText===text;
        },{id,text:'abc-UNDO42XBRANCH'});
        result.branchSavedWithoutBlur=true;
        await page.keyboard.press('Control+a');await page.keyboard.type('prefix');
        await page.keyboard.press('Control+z');await page.keyboard.press('Control+y');
        result.ordinary=await snap(page);
        await page.locator('.grid-data-row[data-seg-id="4"] .col-source .rt-editor').click({clickCount:2,position:{x:15,y:10}});
        result.selected=await page.evaluate(()=>window.getSelection()?.toString());
        await page.keyboard.press('Control+0');
        await page.waitForFunction(({id,text})=>document.querySelector(`.grid-data-row[data-seg-id="${id}"] .grid-textarea`)?.innerText===text,{id,text:'prefix'+result.selected});
        await page.keyboard.press('Control+z');await page.keyboard.press('Control+y');await page.keyboard.type('X');
        result.insertRedo=await snap(page);
        await page.locator('#btnExitEditor').click();await page.locator('.edit-file-btn').first().waitFor();
        await page.locator('.edit-file-btn').first().click();await page.locator('.grid-textarea').first().waitFor();
        result.insertReopened=await snap(page);
      }
      result.trace=await page.evaluate(()=>window.__redoTrace);
      result.focusCorrect=result.before.active===String(cfg.scope==='off'?2:3)&&result.undo.active===id&&result.redo.active===id&&result.afterX.active===id;
      await page.screenshot({path:out.replace(/\.json$/,`-${cfg.scope}-${cfg.tailPause}-${cfg.prefixPause}.png`)});
      console.log(JSON.stringify({scope:cfg.scope,tailPause:cfg.tailPause,prefixPause:cfg.prefixPause,redo:result.redo,complete:result.completeAfterReopen,focus:result.focusCorrect}));
    } catch(e) {result.failure=String(e);console.log(result.failure);await page.screenshot({path:out.replace(/\.json$/,`-error-${cfg.scope}-${cfg.tailPause}.png`)}).catch(()=>{});}

  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  await ctx.close();
  return result;
}
