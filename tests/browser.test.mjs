import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
let browser,vite,fixture,page;const errors=[];const metrics=[];
before(async()=>{
  fixture=await import('./ui-server.mjs');
  vite=await createServer({server:{host:'127.0.0.1',port:5177,strictPort:true,proxy:{'/api':'http://127.0.0.1:3004'}}});await vite.listen();
  const bundled=`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/`;
  const {chromium}=createRequire(bundled+'package.json')('playwright');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));
  await fs.mkdir('reports/screenshots',{recursive:true});
});
after(async()=>{await page?.close();await browser?.close();await vite?.close();await fixture?.close();await fs.writeFile('reports/browser.json',JSON.stringify({at:new Date().toISOString(),metrics,errors},null,2));});
async function home(){await page.goto('http://127.0.0.1:5177/');await page.getByRole('heading',{name:'次は、どの手札に挑む？'}).waitFor();}
async function openSet(title){await home();await page.getByRole('heading',{name:title,exact:true}).getByRole('link').click();await page.getByRole('button',{name:'プレイする →'}).waitFor();}
async function start(title){await openSet(title);await page.getByRole('button',{name:'プレイする →'}).click();await page.getByRole('heading',{name:'手札から、上がり手を見つけよう。'}).waitFor();}
async function key(text){await page.locator('#main').click({position:{x:1,y:1}});await page.keyboard.type(text);}
test('desktop and phone discovery render without horizontal overflow',async()=>{
  await home();await page.screenshot({path:'reports/screenshots/home-desktop.png',fullPage:true});
  assert.equal(await page.locator('.quiz-card').count(),6);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'reports/screenshots/home-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1440,height:1100});
});
test('card buttons, keyboard, reload, skip, list and alternate prime final answer',async()=>{
  await start('はじめの一手。4枚から見つけよう');
  await key('11');assert.equal(await page.locator('#selected .playing-card').count(),2);
  await page.reload();await page.locator('#selected .playing-card').first().waitFor();assert.equal(await page.locator('#selected .playing-card').count(),2);
  await key('71');assert.equal(await page.locator('#number-preview').innerText(),'1171');
  await page.screenshot({path:'reports/screenshots/play-desktop.png',fullPage:true});
  await page.locator('#submit').click();await page.getByText('正解！',{exact:true}).waitFor();
  await page.getByRole('button',{name:'次の問題 →',exact:true}).click();await page.getByRole('button',{name:'スキップして次へ →'}).waitFor();
  await page.getByRole('button',{name:'スキップして次へ →'}).click();await page.getByText('1 問をスキップ中').waitFor();
  await page.getByRole('button',{name:'一覧から選ぶ'}).click();assert.equal(await page.locator('[data-problem]').count(),5);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'reports/screenshots/play-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'ここで終了'}).click();await page.getByRole('button',{name:'確定する'}).click();await page.getByRole('heading',{name:'おつかれさまでした。'}).waitFor();assert.equal(await page.locator('.result-row').count(),5);
  await page.setViewportSize({width:1440,height:1100});
});
test('57 intermediate reset/reload, composite materials and result without duplicate card use',async()=>{
  await start('57から、もう一手。');
  // Lexicographic hand order puts 57,57,113 before 57,113.
  await key('57');await page.locator('#submit').click();await page.locator('.cut-history').waitFor();
  assert.equal(await page.locator('.score>span').innerText(),'0 / 5 回答');
  await page.reload();await page.locator('.cut-history').waitFor();
  await page.getByRole('button',{name:'リセット',exact:true}).click();assert.equal(await page.locator('.cut-history').count(),0);
  await start('かけ算で使い切る、合成数入門');
  // Sorted physical hand begins with 4=2^2 (2,2,4).
  await key('4');await page.getByRole('button',{name:'合成数出し',exact:true}).click();await key('2^2');
  assert.equal(await page.locator('#materials .playing-card').count(),2);assert.equal(await page.locator('#hand .playing-card').count(),0);
  await page.screenshot({path:'reports/screenshots/composite-desktop.png',fullPage:true});
  await page.locator('#submit').click();await page.getByText('正解！',{exact:true}).waitFor();
});
test('lost final response is retried with the same request without another point',async()=>{
  await start('はじめの一手。4枚から見つけよう');await key('1117');
  let intercepted;const delivered=new Promise(resolve=>intercepted=resolve);
  await page.route('**/api/sessions/*/attempts',async route=>{await route.fetch();await route.abort('failed');intercepted();},{times:1});
  await page.locator('#submit').click();await delivered;await page.waitForFunction(()=>!document.body.classList.contains('busy'));
  await page.getByRole('button',{name:'回答を確認・再送'}).click();await page.getByText('正解！',{exact:true}).waitFor();assert.equal(await page.locator('.score strong').innerText(),'1');assert.equal(await page.locator('.score>span').innerText(),'1 / 5 回答');
});
test('author import preview/publish/metadata and 5000-question paginated browser paths',async()=>{
  await page.evaluate(()=>localStorage.setItem('yp:account',JSON.stringify('a'.repeat(64))));
  await page.reload();await page.getByRole('button',{name:'プライム研究室',exact:true}).waitFor();
  await page.goto('http://127.0.0.1:5177/#/new');await page.getByRole('heading',{name:'あなたのクイズを作ろう。'}).waitFor();
  await page.locator('[name=title]').fill('ブラウザ作問テスト');await page.locator('[name=visibility]').selectOption('PUBLIC');await page.locator('[name=answer_mode]').selectOption('BOTH');await page.locator('[name=format]').selectOption('sosutansaku');
  await page.locator('[name=normal_text]').fill('8521\n25j1\n2k51, [3,*,11,*,6,4,7]');
  await page.getByRole('button',{name:'入力を検証する'}).click();await page.getByText('3 問を検証 · エラー 0 件 · 重複 0 件').waitFor();
  await page.screenshot({path:'reports/screenshots/author-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'クイズを保存',exact:true}).click();await page.getByRole('heading',{name:'クイズを育てる'}).waitFor();
  await page.locator('[name=title]').fill('ブラウザ作問・更新');await page.getByRole('button',{name:'情報だけ保存'}).click();await page.getByText('情報を保存しました。',{exact:true}).waitFor();
  for(const [title,count] of [['4枚出し全937問',937],['5000問の上がり手ノート',5000]]){
    const t=performance.now();await start(title);await page.getByRole('button',{name:'一覧から選ぶ'}).click();
    assert.equal(await page.locator('[data-problem]').count(),50);assert.ok(await page.locator('*').count()<1000);
    const listMs=Math.round(performance.now()-t),listNodes=await page.locator('*').count();await page.screenshot({path:`reports/screenshots/list-${count}.png`,fullPage:true});
    await page.getByRole('button',{name:'ここで終了'}).click();await page.getByRole('button',{name:'確定する'}).click();await page.getByRole('heading',{name:'おつかれさまでした。'}).waitFor();assert.equal(await page.locator('.result-row').count(),50);
    metrics.push({count,list_50_dom_nodes:listNodes,result_50_dom_nodes:await page.locator('*').count(),browse_start_list_ms:listMs});
  }
  assert.deepEqual(errors,[]);
});
test('favorites checkbox filters liked quizzes, survives reload and reflects unlikes',async()=>{
  const title='はじめの一手。4枚から見つけよう';
  await start(title);await key('1117');await page.locator('#submit').click();await page.getByText('正解！',{exact:true}).waitFor();
  await openSet(title);await page.getByRole('button',{name:'♡ 高評価',exact:true}).click();await page.getByRole('button',{name:'♥ 高評価を取り消す',exact:true}).waitFor();
  await home();await page.getByRole('checkbox',{name:'♡ お気に入りのみ'}).check();await page.waitForURL(/liked=true/);await page.getByText('1 件のクイズ',{exact:true}).waitFor();assert.equal(await page.locator('.quiz-card').count(),1);
  await page.locator('[name=tag]').fill('入門');await page.locator('[name=sort]').selectOption('plays');await page.getByRole('button',{name:'検索',exact:true}).click();await page.waitForURL(/sort=plays/);await page.getByRole('heading',{name:title,exact:true}).waitFor();
  await page.reload();await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'♡ お気に入りのみ'}).isChecked(),true);assert.equal(await page.locator('[name=tag]').inputValue(),'入門');
  await page.screenshot({path:'reports/screenshots/favorites-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'reports/screenshots/favorites-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('heading',{name:title,exact:true}).getByRole('link').click();await page.getByRole('button',{name:'♥ 高評価を取り消す',exact:true}).click();await page.getByRole('button',{name:'♡ 高評価',exact:true}).waitFor();
  await page.goto('http://127.0.0.1:5177/#/?liked=true');await page.getByRole('heading',{name:'条件に合うお気に入りがありません'}).waitFor();
  await page.getByRole('checkbox',{name:'♡ お気に入りのみ'}).uncheck();await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.ok(await page.locator('.quiz-card').count()>1);
  await page.setViewportSize({width:1440,height:1100});
  const guest=await browser.newPage();try{await guest.goto('http://127.0.0.1:5177/#/?liked=true');await guest.getByRole('heading',{name:'お気に入りのクイズ',exact:true}).waitFor();await guest.getByRole('button',{name:'ログインする',exact:true}).waitFor();}finally{await guest.close();}
  assert.deepEqual(errors,[]);
});
