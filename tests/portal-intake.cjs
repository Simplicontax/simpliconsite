// Run with Node. PORTAL_PLAYWRIGHT_MODULE may point to a bundled Playwright installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { chromium } = require(process.env.PORTAL_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');

// Exercise the real portal DOM and handlers with an isolated profile and no backend calls.
const source = fs.readFileSync(path.join(root, 'src/portal.ts'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/if\(document\.readyState==='loading'\)[\s\S]*$/, '');
const fixture = `
  wireEvents();
  function loadFixture(id='test-client') {
    currentProfile={id,email:'test@example.test',fullName:'Test Client',phone:'',jobTitle:'',role:'client',active:true};
    showWorkspace();
  }
  globalThis.portalIntakeTest={openIntakeDialog,loadFixture,goToQuestion(id){
    intakeAnswers.hasIncome='Yes';
    setIntakeStep(activeQuestions().findIndex(q=>q.id===id));
  }};
  loadFixture();
`;
const script = ts.transpileModule(`const supabase=null;const isSupabaseConfigured=false;\n${source}\n${fixture}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None }
}).outputText;
const html = fs.readFileSync(path.join(root, 'portal.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('</body>', '<script src="/test-portal.js"></script></body>');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html');res.end(html);return; }
  if (url.pathname === '/test-portal.js') { res.setHeader('Content-Type', 'text/javascript');res.end(script);return; }
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404);res.end();return; }
  if (file.endsWith('.css'))res.setHeader('Content-Type','text/css');
  res.end(fs.readFileSync(file));
});

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true, channel: process.env.PORTAL_BROWSER_CHANNEL || 'msedge' });
    const page = await browser.newPage();
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const errors=[];page.on('pageerror', error=>errors.push(error.message));
    const url=`http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    assert.match(await page.locator('.topbar-heading h1').innerText(), /Good (morning|afternoon|evening) Test/);

    await page.evaluate(()=>portalIntakeTest.openIntakeDialog());
    await page.locator('#intakeNextButton').click();
    assert.equal(await page.locator('#intakeQuestion').innerText(),'Which tax year are you filing?');
    for (const [value, expected] of [['2025','What is your primary filing country?'],['United States','What is your filing status?'],['Single','What is your first name?']]) {
      const choice=page.locator('#intakeSlide label').filter({hasText:new RegExp(`^${value}$`)});
      await choice.click();
      await choice.locator('input').press('Enter');
      assert.equal(await page.locator('#intakeQuestion').innerText(),expected);
      assert.equal(await page.locator('#intakeDialog').evaluate(dialog=>dialog.open),true);
    }
    await page.locator('[data-intake-answer]').fill('Raghav');
    await page.locator('[data-intake-answer]').press('Enter');
    assert.equal(await page.locator('#intakeQuestion').innerText(),'What is your last name?');
    await page.locator('[data-intake-answer]').fill('Prasad');
    await page.locator('#closeIntakeButton').click();
    await page.locator('#resumeIntakeDraft').waitFor({state:'visible'});
    assert.match(await page.locator('#ticketDrafts').innerText(),/Saved drafts/);

    await page.reload();
    await page.locator('#resumeIntakeDraft').click();
    assert.equal(await page.locator('#intakeQuestion').innerText(),'What is your last name?');
    assert.equal(await page.locator('[data-intake-answer]').inputValue(),'Prasad');
    await page.locator('[data-intake-answer]').fill('Updated name');
    await page.locator('[data-intake-answer]').press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#intakeDialog').open);
    await page.locator('#resumeIntakeDraft').click();
    assert.equal(await page.locator('[data-intake-answer]').inputValue(),'Updated name');

    await page.evaluate(()=>portalIntakeTest.goToQuestion('incomeSources'));
    await page.locator('[data-income="payer"]').fill('Unfinished employer');
    await page.locator('#closeIntakeButton').click();
    await page.reload();
    await page.locator('#resumeIntakeDraft').click();
    assert.equal(await page.locator('[data-income="payer"]').inputValue(),'Unfinished employer');
    await page.locator('[data-income="type"]').selectOption('Employment');
    await page.locator('[data-income="country"]').fill('United States');
    await page.locator('[data-income="currency"]').fill('USD');
    await page.locator('[data-income="gross"]').fill('10000');
    await page.locator('#addIncomeSource').click();
    assert.equal(await page.locator('[data-remove-income]').count(),1);
    await page.locator('[data-remove-income]').click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('simplicon.intake-preview:test-client')).income.length),0);
    await page.locator('#closeIntakeButton').click();
    await page.waitForFunction(()=>!document.querySelector('#intakeDialog').open);
    await page.evaluate(()=>portalIntakeTest.loadFixture('other-client'));
    assert.equal(await page.locator('#ticketDrafts').isVisible(),false);
    await page.evaluate(()=>portalIntakeTest.loadFixture());
    await page.locator('#resumeIntakeDraft').click();

    await page.evaluate(()=>portalIntakeTest.goToQuestion('priorReturn'));
    await page.locator('#intakeSlide label').filter({hasText:/^Yes$/}).click();
    await page.locator('input[name="intake-answer"]:checked').press('Enter');
    assert.equal(await page.locator('#intakeDialog').evaluate(dialog=>dialog.open),true);
    await page.evaluate(()=>{globalThis.originalStorageSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('Storage unavailable');};});
    await page.locator('#intakeSubmitButton').click();
    assert.equal(await page.locator('#intakeDialog').evaluate(dialog=>dialog.open),true);
    assert.match(await page.locator('#intakeSaveStatus').innerText(),/Unable to save/);
    await page.evaluate(()=>{Storage.prototype.setItem=globalThis.originalStorageSetItem;});
    await page.locator('#intakeSubmitButton').click();
    await page.waitForFunction(()=>!document.querySelector('#intakeDialog').open);
    assert.equal(await page.locator('#ticketDrafts').isVisible(),false);
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('simplicon.intake-preview:test-client')));
    assert.equal(saved.status,'complete');

    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>portalIntakeTest.openIntakeDialog());
    await page.locator('#intakeSlide label').filter({hasText:/^2024$/}).click();
    await page.locator('#closeIntakeButton').click();
    await page.locator('#resumeIntakeDraft').waitFor({state:'visible'});
    const bounds=await page.locator('#resumeIntakeDraft').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391,'Draft card fits mobile width');
    assert.deepEqual(errors,[]);
    console.log('PASS: greeting spacing, Enter navigation/validation, final Enter stays open, reload/Escape recovery, unfinished income fields, user isolation, completion, and mobile draft layout.');
  } finally { await browser?.close();server.closeAllConnections();server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
