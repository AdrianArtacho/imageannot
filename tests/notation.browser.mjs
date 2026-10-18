/** Optional browser checks: npm install --no-save --package-lock=false playwright
 * npx playwright install chromium && node tests/notation.browser.mjs
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.IMAGEANNOT_TEST_PORT || 8141);
const baseURL = process.env.IMAGEANNOT_TEST_URL || `http://127.0.0.1:${port}/`;
const server = process.env.IMAGEANNOT_TEST_URL ? null : spawn('python3', ['-m','http.server',String(port),'--bind','127.0.0.1'], { cwd: root, stdio: 'pipe' });
let browser, page;
async function draw(x, y, x2=x, y2=y) {
  await page.locator('#overlay').scrollIntoViewIfNeeded();
  const b = await page.locator('#overlay').boundingBox();
  await page.mouse.move(b.x+b.width*x,b.y+b.height*y); await page.mouse.down();
  await page.mouse.move(b.x+b.width*x2,b.y+b.height*y2,{steps:5}); await page.mouse.up();
}
async function label(tool, text, raw=true) {
  await page.locator('#tool-select').selectOption(tool);
  await page.locator('#text-input').fill(text);
  await page.locator('#raw-latex').setChecked(raw);
}
try {
  for(let i=0;i<100;i++) {
    try { if((await fetch(baseURL)).ok) break; } catch {}
    if(i===99) throw Error('Server did not start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser = await chromium.launch({ headless: true,
    ...(process.env.IMAGEANNOT_CHROMIUM_PATH ? {executablePath:process.env.IMAGEANNOT_CHROMIUM_PATH} : {}) });
  page = await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__copied=[];
    Object.defineProperty(navigator,'clipboard',{ configurable:true,value:{writeText:async value=>window.__copied.push(value)} });
  });
  await page.goto(baseURL);
  await page.locator('#demo-button').click();
  await page.waitForFunction(()=>document.querySelector('#source-image').naturalWidth>0);
  await page.locator('#auto-copy').uncheck();
  await label('textfrag','V7',false);
  await page.locator('#text-input').evaluate(el=>{el.focus();el.setSelectionRange(1,2);});
  await page.locator('[data-notation=msup]').click();
  assert.equal(await page.locator('#text-input').inputValue(),String.raw`V\msup{7}`);
  assert.equal(await page.locator('#raw-latex').isChecked(),true);
  assert.equal(await page.locator('#notation-preview sup').textContent(),'7');
  await draw(.18,.17);
  assert.equal(await page.locator('#overlay .annotation-label sup').textContent(),'7');
  assert.ok((await page.locator('#latex-output').inputValue()).endsWith(String.raw`{V\msup{7}}`));
  console.log('PASS: selection toolbar, automatic raw mode, formatted canvas and original export');

  const stacked=String.raw`\textbf{V\msupsub{\msharp 6}{4}}`;
  await page.locator('#text-input').fill(stacked);
  const figures=await page.locator('#overlay .music-supsub > span').evaluateAll(nodes=>nodes.map(n=>{
    const r=n.getBoundingClientRect();return {x:r.x,y:r.y,text:n.textContent};
  }));
  assert.equal(figures.length,2);
  assert.equal(figures[0].text,'♯6'); assert.equal(figures[1].text,'4');
  assert.ok(Math.abs(figures[0].x-figures[1].x)<1); assert.ok(figures[0].y<figures[1].y);
  await page.locator('#text-input').press('Tab');
  await page.locator('#undo-button').click();
  assert.equal(await page.locator('#text-input').inputValue(),String.raw`V\msup{7}`);
  await page.locator('#text-input').fill(stacked); await page.locator('#text-input').press('Tab');
  console.log('PASS: live nested figures align, edit and undo preserve source');

  await label('textfrag','VII',false);
  await page.locator('#text-input').evaluate(el=>{el.focus();el.setSelectionRange(0,0);});
  await page.locator('[data-notation=mflat]').click();
  assert.equal(await page.locator('#text-input').inputValue(),String.raw`\mflat{}VII`);
  await draw(.47,.17);
  await label('markerfragdark',String.raw`ii\msup{\mhalfdim 7}`);
  await draw(.8,.17);
  const marker=page.locator('#overlay g[data-id="3"]');
  assert.equal(await marker.locator('sup').textContent(),'ø7');
  assert.ok(Number(await marker.locator('circle').getAttribute('r'))<60,'Circle should fit rendered label, not raw source length');
  await label('markerfrag','3',false);
  await page.locator('#text-input').evaluate(el=>{el.focus();el.select();});
  await page.locator('[data-notation=mdegree]').click();
  await draw(.25,.57);
  assert.equal(await page.locator('#overlay .music-hat').count(),1);
  await label('parafrag',String.raw`A\mnatural{}, C\msub{4}, V\msup{7}\mto{}I`);
  await page.locator('#font-size-input').selectOption('Large');
  await draw(.1,.8,.85,.96);
  assert.equal(await page.locator('#overlay .annotation-label sub').textContent(),'4');
  assert.ok((await page.locator('#overlay .annotation-label').last().textContent()).includes('A♮'));
  console.log('PASS: both markers and paragraph labels, accidentals, hat, font size and fitted marker');

  const original=await page.locator('#latex-output').inputValue();
  await page.locator('#zoom-select').selectOption('150');
  assert.equal(await page.locator('#latex-output').inputValue(),original);
  await page.locator('#zoom-select').selectOption('fit');
  await page.locator('#output-mode').selectOption('block');
  const block=await page.locator('#latex-output').inputValue();
  assert.ok(block.includes(stacked)); assert.ok(block.includes(String.raw`\mflat{}VII`));
  assert.ok(!block.includes('<sup>') && !block.includes('music-supsub'));
  await page.locator('#copy-button').click();
  assert.equal(await page.evaluate(()=>window.__copied.at(-1)),block);
  const [download] = await Promise.all([page.waitForEvent('download'),page.locator('#download-button').click()]);
  const chunks=[]; for await(const chunk of await download.createReadStream()) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(),block+'\n');
  console.log('PASS: zoom-invariant coordinates, full block, clipboard and .tex source preservation');

  // Inspect a representative desktop result, showing the text field and canvas.
  await page.locator('.annotation-select').first().click();
  await page.locator('.workspace').scrollIntoViewIfNeeded();
  await mkdir(path.join(root,'test-results'),{recursive:true});
  await page.screenshot({path:path.join(root,'test-results/notation-desktop.png'),fullPage:true});
  await page.locator('#text-input').fill(String.raw`V\msup{7`);
  assert.equal(await page.locator('#notation-warning').isVisible(),true);
  await page.locator('#text-input').fill(String.raw`\unsupported{stuff}`);
  assert.ok((await page.locator('#notation-warning').textContent()).includes('unchanged'));
  await page.locator('#text-input').fill(String.raw`\textbf{<img src=x onerror="window.__xss=1">}`);
  assert.equal(await page.locator('#notation-preview img, #overlay .annotation-label img').count(),0);
  assert.equal(await page.evaluate(()=>window.__xss),undefined);
  await page.locator('#text-input').fill(stacked); await page.locator('#text-input').press('Tab');
  console.log('PASS: incomplete or unsupported notation is visible and HTML is never executed');

  for(const width of [320,375,768]) {
    await page.setViewportSize({width,height:900});
    const dims=await page.evaluate(()=>({page:document.documentElement.scrollWidth,view:document.documentElement.clientWidth}));
    assert.ok(dims.page<=dims.view+1,`Horizontal overflow at ${width}px: ${JSON.stringify(dims)}`);
  }
  await page.setViewportSize({width:375,height:900});
  await page.locator('[data-field=text]').screenshot({path:path.join(root,'test-results/notation-mobile.png')});
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile widths and no browser errors');
  console.log('All music-notation browser checks passed.');
} catch(error) {
  if(page) {
    await mkdir(path.join(root,'test-results'),{recursive:true});
    await page.screenshot({path:path.join(root,'test-results/notation-failure.png'),fullPage:true});
  }
  throw error;
} finally { await browser?.close(); server?.kill(); }
