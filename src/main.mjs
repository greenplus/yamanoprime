import './style.css';
import {cardButton,compositeSyntaxError} from './vendor/game-ui.mjs';
import {label,emptyDraft,usedIds,selectCard,appendOperator,currentNotation,solutionNotation,playCut} from './play-state.mjs';
const $=selector=>document.querySelector(selector),root=$('#app');
const base=(import.meta.env.VITE_API_URL||'').replace(/\/$/,''),authBase=(import.meta.env.VITE_AUTH_API_URL||'').replace(/\/$/,'');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem('yp:'+key))??fallback;}catch{return fallback;}};
const write=(key,value)=>localStorage.setItem('yp:'+key,JSON.stringify(value));
let token=read('account',''),user=null,health={},route='',data=null,busy=false,epoch=0,play=null,editor=null;
const names={PRIME_ONLY:'素数のみ',COMPOSITE_ONLY:'合成数のみ',BOTH:'素数・合成数',DRAFT:'下書き',UNLISTED:'限定公開',PUBLIC:'公開'};
async function api(path,{body,method,secret,auth=true,apiBase=base}={}){
  const response=await fetch(`${apiBase}/api/${path}`,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(auth&&token?{Authorization:`Bearer ${token}`} : {}),...(secret?{'X-Session-Token':secret}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',signal:AbortSignal.timeout(70000)});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'処理できませんでした。'),{status:response.status});return result;
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function frame(content){
  root.innerHTML=`<header class="site-header"><a class="brand" href="#/"> <span class="brand-mark" aria-hidden="true">Y<span>♠</span></span><span>Yamano<span class="brand-light">Prime</span><small>素数大富豪の一手上がりクイズ</small></span></a><nav aria-label="メイン"><a href="#/" ${route==='home'?'aria-current="page"':''}>クイズを探す</a><a href="#/my">マイページ</a><a href="#/new" class="create-link">＋ クイズを作る</a><button class="account-button" data-account>${esc(user?.name||'ログイン')}</button></nav></header><main id="main">${content}</main><footer><strong>YamanoPrime</strong><span>時間を気にせず、手札と向き合う。</span><a href="#/guide">遊び方・ルール</a></footer>`;
  $('[data-account]').onclick=showAccount;bindLinks();
}
const cardsText=hand=>hand.map(label).join(' ');
const chips=s=>`<div class="chips"><span>${esc(names[s.answer_mode])}</span><span class="${s.allow_57?'accent':''}">57 ${s.allow_57?'あり':'なし'}</span><span class="${s.contains_dead?'warning':''}">詰み ${s.contains_dead?'あり':'なし'}</span></div>`;
function miniCards(hand){return `<span class="mini-cards">${hand.map((n,i)=>`<span class="${i%2?'red':''}">${label(n)}</span>`).join('')}</span>`;}
function quizCard(s){return `<article class="quiz-card"><div class="quiz-card-top"><span class="quiz-icon" aria-hidden="true">${s.answer_mode==='COMPOSITE_ONLY'?'×':s.allow_57?'57':'♠'}</span><span>${s.problem_count} 問</span></div><h3><a href="#/set/${s.id}">${esc(s.title)}</a></h3><a class="author" href="#/author/${encodeURIComponent(s.author_id)}">${esc(s.author_name)}</a>${chips(s)}<p>${esc(s.description).slice(0,170)}</p><div class="tags">${s.tags.map(t=>`<a href="#/?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div><div class="quiz-card-bottom"><span>▷ ${s.play_count} 回プレイ</span><span>♡ ${s.like_count}</span><a href="#/set/${s.id}" aria-label="${esc(s.title)}を開く">↗</a></div></article>`;}
function pager(total,offset,limit,fn){return `<div class="pager"><button data-page="${Math.max(0,offset-limit)}" ${offset===0?'disabled':''}>← 前</button><span>${total?offset+1:0}–${Math.min(total,offset+limit)} / ${total}</span><button data-page="${offset+limit}" ${offset+limit>=total?'disabled':''}>次 →</button></div>`;}
function bindPager(fn){document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>fn(Number(b.dataset.page)));}
function home(params){
  const author=params.get('author');
  frame(`${author?`<section class="page-heading"><p class="eyebrow">AUTHOR</p><h1>${esc(data.items[0]?.author_name||'作者')}のクイズ</h1></section>`:`<section class="hero hero-compact"><div><p class="eyebrow">ONE HAND. YOUR ANSWER.</p><h1>この手札に、<em>あなたの答えを。</em></h1><p>札を並べて、上がり手をひとつ見つけよう。<br>素数大富豪の一手上がりを、何問解ける？</p></div><div class="hero-links"><a class="button primary" href="#quiz-list">クイズを探す <span>↓</span></a><a class="text-link" href="#/guide">はじめての方へ →</a></div></section><section class="intro-strip"><div><span>01</span><p><strong>好きなクイズを選ぶ</strong><small>素数・合成数・57・詰み</small></p></div><div><span>02</span><p><strong>手札を並べて「出す」</strong><small>あなたが見つけた別解も正解</small></p></div><div><span>03</span><p><strong>最後に答え合わせ</strong><small>スキップして、後から考えてもOK</small></p></div></section>`}
  <section id="quiz-list" class="discovery"><div class="section-heading"><div><p class="eyebrow">EXPLORE QUIZZES</p><h2>次は、どの手札に挑む？</h2></div><span class="muted">${data.total} 件のクイズ</span></div>
  <form id="filters"><div class="search-row"><label class="search-field"><span class="sr-only">タイトル・作者で検索</span><input name="q" placeholder="タイトル・作者で検索" value="${esc(params.get('q')||'')}"></label><button class="button primary">検索</button><select name="sort" aria-label="並び順">${[['new','新着'],['likes','高評価'],['plays','よく遊ばれている']].map(([v,t])=>`<option value="${v}" ${params.get('sort')===v?'selected':''}>${t}</option>`).join('')}</select></div><div class="filter-row">${[['mode','回答条件',[['PRIME_ONLY','素数のみ'],['COMPOSITE_ONLY','合成数のみ'],['BOTH','両方']]],['allow_57','57',[['true','あり'],['false','なし']]],['dead','詰み',[['true','あり'],['false','なし']]]].map(([key,title,opts])=>`<label>${title}<select name="${key}"><option value="">すべて</option>${opts.map(([v,t])=>`<option value="${v}" ${params.get(key)===v?'selected':''}>${t}</option>`).join('')}</select></label>`).join('')}<label>タグ<input name="tag" placeholder="例：4枚出し" value="${esc(params.get('tag')||'')}"></label><label>問題数<input type="number" name="min" min="1" max="5000" placeholder="下限" value="${esc(params.get('min')||'')}"></label><label>〜<input type="number" name="max" min="1" max="5000" placeholder="上限" value="${esc(params.get('max')||'')}"></label></div></form>
  <div class="favorites-filter"><label class="check"><input form="filters" type="checkbox" name="liked" value="true" ${params.get('liked')==='true'?'checked':''} ${user?'':'disabled'}>♡ お気に入りのみ</label><span>自分が高評価したクイズ</span>${user?'':'<button type="button" class="text-link" id="favorites-login">ログインして利用</button>'}</div>
  <div class="quiz-grid">${data.items.length?data.items.map(quizCard).join(''):`<div class="empty-state"><h3>${params.get('liked')==='true'?'条件に合うお気に入りがありません':'条件に合うクイズがありません'}</h3><p>${params.get('liked')==='true'?'クイズを高評価すると、お気に入りに表示されます。ほかの絞り込み条件も確認してください。':'絞り込みを変えて探してみてください。'}</p></div>`}</div>${pager(data.total,data.offset,data.limit)}</section>`);
  $('#filters').onsubmit=e=>{e.preventDefault();const p=new URLSearchParams(new FormData(e.target));for(const [k,v] of [...p])if(!v)p.delete(k);if(author)p.set('author',author);location.hash='/?'+p;};
  $('[name=liked]').onchange=()=>$('#filters').requestSubmit();
  $('#favorites-login')&&($('#favorites-login').onclick=showAccount);
  document.querySelector('a[href="#quiz-list"]')?.addEventListener('click',e=>{e.preventDefault();$('#quiz-list').scrollIntoView({behavior:'smooth'});});
  bindPager(offset=>{params.set('offset',offset);location.hash='/?'+params;});
}
function detail(){const s=data;
  frame(`<a class="back-link" href="#/">← クイズを探す</a><section class="detail-layout"><div><p class="eyebrow">QUIZ SET · VERSION ${s.version_number||'—'}</p><h1>${esc(s.title)}</h1><a class="author" href="#/author/${encodeURIComponent(s.author_id)}">作成 ${esc(s.author_name)}</a>${chips(s)}<p class="description">${esc(s.description)}</p><div class="tags">${s.tags.map(t=>`<a href="#/?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div><div class="detail-stats"><span><strong>${s.problem_count||0}</strong>問題</span><span><strong>${s.play_count}</strong>回プレイ</span><span><strong>${s.like_count}</strong>高評価</span></div><button class="button" id="like" ${user?'':'disabled'}>${s.liked?'♥ 高評価を取り消す':'♡ 高評価'}</button><small class="hint">高評価にはログインと、このクイズへの1問以上の回答が必要です。</small>${user?.id===s.author_id?`<a class="button" href="#/edit/${s.id}">編集・統計を見る</a>`:''}</div>
  <aside class="start-panel"><span class="large-suit">♠</span><h2>じっくり、何問解ける？</h2><p>1問につき最終回答は1回。<br>迷った問題はスキップできます。</p>${s.contains_dead?'<div class="notice warning">詰み問題を含みます。<br>詰み登録問題への不正な上がりは −1 点です。</div>':''}<label class="check"><input type="checkbox" id="shuffle"> 問題をシャッフルする</label><p class="hint">標準の順番：${s.default_order==='AUTHOR_ORDER'?'作者の登録順':'手札の辞書順'}</p><button class="button primary wide" id="start" ${s.current_version_id?'':'disabled'}>プレイする →</button><small>ログインなしでも遊べます</small></aside></section>`);
  $('#start').onclick=()=>run(async()=>{const result=await api('sessions',{body:{quiz_set_id:s.id,shuffle:$('#shuffle').checked}});write('session:'+result.id,{token:result.token,index:0,mode:'sequential',drafts:{},skips:[]});write('last-session',result.id);location.hash='/play/'+result.id;});
  $('#like').onclick=()=>run(async()=>{await api(`sets/${s.id}/like`,{body:{liked:!s.liked}});await navigate();});
}
async function run(fn){if(busy)return;busy=true;document.body.classList.add('busy');try{await fn();}catch(error){toast(error.message);}finally{busy=false;document.body.classList.remove('busy');}}
function savePlay(){write('session:'+play.id,play.local);}
async function loadPlay(id,index,mode){
  const local=read('session:'+id,{index:0,mode:'sequential',drafts:{},skips:[]});local.drafts??={};local.skips??=[];
  if(index!==undefined)local.index=index;if(mode)local.mode=mode;
  const offset=Math.floor(local.index/50)*50;
  const response=await api(`sessions/${id}?offset=${offset}`,{secret:local.token});
  if(response.session.status==='ENDED'){location.hash='/result/'+id;return;}
  play={id,local,response};savePlay();renderPlay();
}
function renderPlay(){
  const {response:r,local:l}=play;const p=r.items.find(x=>x.order===l.index)||r.items[0];if(!p)return;
  l.index=p.order;const draft=l.drafts[p.id]??=emptyDraft(),done=!!p.attempt,locked=done||!!draft.pending;
  if(done)delete draft.pending;
  const picked=usedIds(draft),available=p.hand.length-picked.size;
  frame(`<div class="play-heading"><div><a href="#/set/${r.session.quiz_set_id}" class="back-link">← ${esc(r.title)}</a><h1>手札から、上がり手を見つけよう。</h1></div><div class="score"><small>SCORE</small><strong>${r.session.score}</strong><span>${r.session.attempted_count} / ${r.session.total_problem_count} 回答</span></div></div>
  <div class="progress"><span style="width:${r.session.attempted_count/r.session.total_problem_count*100}%"></span></div><div class="play-toolbar"><div class="segmented"><button data-mode="sequential" class="${l.mode==='sequential'?'active':''}">1問ずつ</button><button data-mode="list" class="${l.mode==='list'?'active':''}">一覧から選ぶ</button></div>${chips(r.rules)}<button class="text-button danger" id="finish">ここで終了</button></div>
  <div class="play-layout ${l.mode==='list'?'has-list':''}">${l.mode==='list'?`<aside class="problem-list"><h2>問題一覧</h2><div class="problem-buttons">${r.items.map(x=>`<button data-problem="${x.order}" class="${x.id===p.id?'active':''} ${x.attempt?'answered':''}"><span>${x.order+1}</span><span>${esc(cardsText(x.hand))}</span><small>${x.attempt?(x.attempt.correct?'✓':'×'):l.skips.includes(x.id)?'スキップ':'未回答'}</small></button>`).join('')}</div>${pager(r.session.total_problem_count,r.offset,50)}</aside>`:''}
  <section class="play-board"><div class="board-top"><span>問題 <strong>${p.order+1}</strong> / ${r.session.total_problem_count}</span><span>${p.hand.length} 枚の手札</span></div>
  <div class="selection-area"><div class="zone-label"><span>見せ札</span><strong id="number-preview">${draft.selected.length?draft.selected.map(i=>p.hand[i]).join(''):'—'}</strong></div><div id="selected" class="card-row ${draft.selected.length?'':'empty-row'}">${draft.selected.length?'':'手札をタップして、ここに並べる'}</div></div>
  ${draft.composite?'<div class="material-area"><div class="zone-label"><span>素因数の材料札</span><span>× 積 ／ ^ 指数</span></div><div id="materials" class="card-row"></div><div class="operator-buttons"><button data-op="×">× 掛ける</button><button data-op="^">^ べき乗</button></div></div>':''}
  <div class="hand-area"><div class="zone-label"><span>あなたの手札</span><span>${available} 枚 未選択</span></div><div id="hand" class="card-row"></div></div>
  ${draft.cuts.length?`<div class="cut-history">57 × ${draft.cuts.length} 回を使用中 <span>リセットで元に戻せます</span></div>`:''}
  <div class="board-actions"><button class="button" id="reset" ${locked?'disabled':''}>リセット</button>${r.rules.answer_mode!=='PRIME_ONLY'?`<button class="button ${draft.composite?'active':''}" id="composite" ${locked||!draft.selected.length?'disabled':''}>${draft.composite?'素因数入力を閉じる':'合成数出し'}</button>`:''}<button class="button primary play-submit" id="submit" ${locked||!draft.selected.length?'disabled':''}>出す <span>↵</span></button></div>
  ${draft.pending?'<div class="notice warning">回答の通信結果を確認中です。同じ回答を再送して確認できます。<button class="button" id="retry">回答を確認・再送</button></div>':''}
  ${done?`<div class="answer-feedback ${p.attempt.correct?'correct':'incorrect'}" role="status"><strong>${p.attempt.correct?'正解！':'不正解'}</strong><span>${p.attempt.score>0?'+':''}${p.attempt.score} 点 · この問題への回答は確定しました</span></div>`:''}
  <div class="dedicated-keyboard" aria-label="カード入力キー">${Array.from({length:13},(_,i)=>i+1).map(n=>`<button data-key="${n}" ${locked||!p.hand.some((rank,i)=>rank===n&&!picked.has(i))?'disabled':''}>${n===1?'1':label(n)}</button>`).join('')}<button id="undo" aria-label="1枚戻す" ${locked?'disabled':''}>⌫</button></div>
  <p class="keyboard-hint">PC：1〜9 / T J Q K で選択 · Backspace で戻す · Enter で出す · = で合成数出し · * / ^ で演算子</p>
  <div class="board-bottom"><button class="text-button" id="dead" ${locked?'disabled':''}>詰みと回答する</button><span>最終回答は1回。解答は終了後に公開。</span></div></section></div>
  <div class="question-nav"><button class="button" id="previous" ${p.order===0?'disabled':''}>← 前の問題</button><span>${l.skips.length} 問をスキップ中</span><button class="button" id="next" ${p.order===r.session.total_problem_count-1?'disabled':''}>${done?'次の問題 →':'スキップして次へ →'}</button></div>`);
  function card(index,onClick,disabled=false){const rank=p.hand[index],card=cardButton({card_id:index,rank,suit:['S','H','C','D'][index%4],is_joker:false});card.disabled=disabled;card.setAttribute('aria-label',`${label(rank)}の札 ${index+1}枚目`);card.onclick=onClick;return card;}
  p.hand.forEach((_,i)=>{if(!picked.has(i))$('#hand').append(card(i,()=>{selectCard(draft,i);updateDraft();},locked));});
  draft.selected.forEach((i,j)=>$('#selected').append(card(i,()=>{draft.selected.splice(j,1);updateDraft();},locked)));
  draft.tokens.forEach((t,j)=>{let element;if(t.kind==='card')element=card(t.card_id,()=>{draft.tokens.splice(j,1);updateDraft();},locked);else{element=document.createElement('button');element.className='operator-token';element.textContent=t.op;element.disabled=locked;element.onclick=()=>{draft.tokens.splice(j,1);updateDraft();};}$('#materials')?.append(element);});
  $('#reset').onclick=()=>{l.drafts[p.id]=emptyDraft();updateDraft();};
  $('#composite')&&( $('#composite').onclick=()=>{draft.composite=!draft.composite;draft.tokens=[];updateDraft();});
  document.querySelectorAll('[data-op]').forEach(b=>{b.disabled=locked;b.onclick=()=>{appendOperator(draft,b.dataset.op);updateDraft();};});
  document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>chooseRank(Number(b.dataset.key)));
  $('#undo').onclick=()=>{if(draft.composite)draft.tokens.pop();else draft.selected.pop();updateDraft();};
  $('#submit').onclick=()=>run(submitMove);
  $('#retry')&&( $('#retry').onclick=()=>run(sendPending));
  $('#dead').onclick=()=>confirmDialog('「詰み」で最終回答しますか？','この問題の回答は確定し、後から変更できません。',()=>run(()=>submitAnswer('dead')));
  $('#finish').onclick=()=>confirmDialog('このプレイを終了しますか？',`未回答 ${r.session.unanswered_count} 問のまま結果を確定します。このセッションは再開できません。`,()=>run(async()=>{await api(`sessions/${play.id}/end`,{body:{},secret:l.token});location.hash='/result/'+play.id;}));
  $('#previous').onclick=()=>run(()=>loadPlay(play.id,p.order-1));
  $('#next').onclick=()=>run(async()=>{if(!done&&!l.skips.includes(p.id))l.skips.push(p.id);savePlay();await loadPlay(play.id,p.order+1);});
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{l.mode=b.dataset.mode;updateDraft();});
  document.querySelectorAll('[data-problem]').forEach(b=>b.onclick=()=>run(()=>loadPlay(play.id,Number(b.dataset.problem))));
  bindPager(offset=>run(()=>loadPlay(play.id,offset)));
  savePlay();
}
function current(){const p=play.response.items.find(x=>x.order===play.local.index);return {p,draft:play.local.drafts[p.id]};}
function updateDraft(){savePlay();renderPlay();}
function chooseRank(rank){const {p,draft}=current();if(p.attempt||draft.pending)return;const used=usedIds(draft),index=p.hand.findIndex((n,i)=>n===rank&&!used.has(i));if(index>=0){selectCard(draft,index);updateDraft();}}
async function submitMove(){
  const {p,draft}=current();if(!draft.selected.length||p.attempt||draft.pending)return;
  if(draft.composite){const error=compositeSyntaxError(draft.tokens,p.hand.map((rank,i)=>({card_id:i,rank,is_joker:false})),[]);if(error){toast(error);return;}}
  if(playCut(p.hand,draft,play.response.rules.allow_57)){
    updateDraft();if(usedIds(draft).size<p.hand.length){toast('57を出しました。残りの手札で続けてください。');return;}
  }
  await submitAnswer('move');
}
async function submitAnswer(kind){const {p,draft}=current();draft.pending={request_id:crypto.randomUUID(),problem_id:p.id,kind,...(kind==='move'?{solution:solutionNotation(p.hand,draft)}:{})};savePlay();renderPlay();await sendPending();}
async function sendPending(){
  const {p,draft}=current();const result=await api(`sessions/${play.id}/attempts`,{body:draft.pending,secret:play.local.token});
  delete draft.pending;play.local.skips=play.local.skips.filter(id=>id!==p.id);savePlay();
  if(result.session.status==='ENDED')location.hash='/result/'+play.id;else await loadPlay(play.id);
}
async function resultPage(id,offset=0){
  const local=read('session:'+id,{}),r=await api(`sessions/${id}/results?offset=${offset}`,{secret:local.token});
  frame(`<section class="result-heading"><p class="eyebrow">YOUR RESULT</p><h1>おつかれさまでした。</h1><div class="final-score"><span>SCORE</span><strong>${r.session.score}</strong><span>/ ${r.session.total_problem_count}</span></div><div class="result-counts">${[['正解',r.session.correct_count],['誤答',r.session.wrong_count],['詰み回答',r.session.dead_choice_count],['未回答',r.session.unanswered_count],['全問題',r.session.total_problem_count]].map(([k,v])=>`<div><strong>${v}</strong><span>${k}</span></div>`).join('')}</div><div class="actions"><a class="button primary" href="#/set/${r.session.quiz_set_id}">もう一度遊ぶ</a><a class="button" href="#/">クイズを探す</a></div></section><section><div class="section-heading"><h2>手札と答え合わせ</h2><span class="muted">正答率はこのバージョンの集計</span></div><div class="results-list">${r.items.map(p=>`<article class="result-row"><span class="result-index">${p.order+1}</span><div>${miniCards(p.hand)}<p>あなたの回答：${p.answer?esc(p.answer.kind==='dead'?'詰み':p.answer.solution):'未回答'}</p><p>作者の想定解：<strong>${p.problem_kind==='CLAIMED_DEAD'?'詰み':esc(p.example_solution?.notation)}</strong></p>${p.disputed?`<p class="dispute-note">作者は詰みとして登録しましたが、合法手が発見されています：${esc(p.counterexample?.notation)}</p>`:''}</div><div class="result-outcome"><strong class="${p.correct?'positive':''}">${p.score===null?'—':(p.score>0?'+':'')+p.score}</strong><span>${p.score===null?'未回答':p.correct?'正解':'誤答'}</span><small>正答率 ${p.attempt_count?Math.round(p.correct_count/p.attempt_count*100)+'%':'—'}<br>${p.attempt_count||0} 回答</small></div></article>`).join('')}</div>${pager(r.session.total_problem_count,offset,r.limit)}</section>`);bindPager(n=>run(()=>resultPage(id,n)));
}
function confirmDialog(title,message,action){const dialog=$('#dialog');dialog.innerHTML=`<h2>${esc(title)}</h2><p>${esc(message)}</p><div class="actions"><button class="button" data-cancel>戻る</button><button class="button primary" data-confirm>確定する</button></div>`;dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.querySelector('[data-confirm]').onclick=()=>{dialog.close();action();};dialog.showModal();}
function showAccount(){
  const dialog=$('#dialog');dialog.innerHTML=`<button class="dialog-close" aria-label="閉じる">×</button><p class="eyebrow">COMMON ACCOUNT</p><h2>${esc(user?.name||'共通アカウントでログイン')}</h2><p>素因数分解eスポーツと同じID・パスワードを使います。</p>${user?'<button class="button" id="logout">ログアウト</button>':health.authAvailable&&authBase?'<form id="login"><label>ID<input name="loginId" autocomplete="username" required maxlength="24"></label><label>パスワード<input type="password" name="password" autocomplete="current-password" required maxlength="128"></label><button class="button primary wide">ログイン</button><p id="login-error" role="alert"></p></form><a class="text-link" href="https://greenplus.github.io/factoring_esports/" target="_blank" rel="noopener">共通アカウントを新規登録 ↗</a>':'<div class="notice">この環境では共通アカウントDBに接続されていません。匿名プレイを利用できます。</div>'}`;
  dialog.querySelector('.dialog-close').onclick=()=>dialog.close();
  $('#login')?.addEventListener('submit',e=>{e.preventDefault();run(async()=>{try{const fields=Object.fromEntries(new FormData(e.target)),r=await api('auth',{body:{action:'login',...fields},auth:false,apiBase:authBase});token=r.token;const me=await api('me');user=me.user;write('account',token);dialog.close();await navigate();}catch(error){$('#login-error').textContent=error.message;}});});
  $('#logout')&&( $('#logout').onclick=()=>run(async()=>{await api('auth',{body:{action:'logout'},apiBase:authBase});token='';user=null;write('account','');dialog.close();await navigate();}));dialog.showModal();
}
async function myPage(offset=0){
  if(!user){frame('<section class="empty-state"><h1>マイページ</h1><p>共通アカウントでログインすると、投稿したクイズとプレイ履歴を確認できます。</p><button class="button primary" id="login-prompt">ログインする</button></section>');$('#login-prompt').onclick=showAccount;return;}
  const [sets,history]=await Promise.all([api('my/sets'),api('my/history?offset='+offset)]);
  frame(`<section class="page-heading"><p class="eyebrow">MY PAGE</p><h1>${esc(user.name)}さんのマイページ</h1><a class="button primary" href="#/new">＋ クイズを作る</a></section><section><h2>作成したクイズ</h2><div class="manage-list">${sets.items.map(s=>`<a href="#/edit/${s.id}"><strong>${esc(s.title)}</strong><span>${names[s.visibility]} · ${s.problem_count||0}問 · v${s.version_number||0}</span><span>編集・統計 →</span></a>`).join('')||'<p class="muted">まだクイズを作成していません。</p>'}</div></section><section><h2>プレイ履歴</h2><div class="manage-list">${history.items.map(s=>`<a href="#/${s.status==='ACTIVE'?'play':'result'}/${s.id}"><strong>${esc(s.title)}</strong><span>v${s.version_number} · ${new Date(s.started_at).toLocaleDateString('ja-JP')} · ${s.status==='ACTIVE'?'プレイ中':'終了'}</span><span>${s.score}点 / ${s.total_problem_count}問</span></a>`).join('')||'<p class="muted">ログインして遊ぶと履歴が残ります。</p>'}</div>${pager(history.total,offset,history.limit)}</section>`);bindPager(n=>run(()=>myPage(n)));
}
function guide(){frame(`<section class="guide"><p class="eyebrow">HOW TO PLAY</p><h1>上がり手を、ひとつ見つけよう。</h1><h2>手札を並べて「出す」</h2><p>カードをタップすると見せ札に移ります。もう一度タップすると戻ります。用意された想定解と違っても、セットの条件に合う合法手なら正解です。Aは1、T・J・Q・Kは10・11・12・13。Xは使いません。</p><h2>最終回答は1問につき1回</h2><p>「出す」または「詰み」で回答を確定します。通常問題の正解は+1点、誤答は0点。作者が詰みと登録した問題では、詰み宣言または合法手で+1点、不正な上がりは−1点です。答えはセッション終了後に公開します。</p><h2>57は途中操作</h2><p>57ありのセットでは、5・7を並べて出すと残りの手札で続けられます。最終回答前ならリセット可能です。57で手札がなくなると最終回答になります。ただし「合成数のみ」は最後に合成数出しが必要です。1729の特殊出しは「素数のみ」「素数・合成数」で利用できます。</p><h2>合成数出し</h2><p>見せ札を並べてから「合成数出し」を押し、残りの札を素因数の材料に使います。積は * または ×、指数は ^。表示札と材料札は別々に必要です。例：9=3^2 は9・3・2の3枚を使います。</p><h2>作問と一括入力</h2><p>通常問題は1行に合法手を1つ入力します。例：1117、9=3^2、57,113。8521,57も57→8521に正規化します。詰み問題は別欄に手札を入力します。各ランクは4枚まで、1セット5000問までです。</p><h2>途中で休んでも大丈夫</h2><p>同じブラウザでページを再読み込みしても続けられます。スキップ・一覧表示・シャッフルも利用できます。「ここで終了」を押すと結果が確定し、再挑戦は新しいセッションになります。</p><a class="button primary" href="#/">クイズを探す →</a></section>`);}
function bindLinks(){const last=read('last-session',null);if(route==='home'&&last){const link=document.createElement('a');link.className='resume-link';link.href='#/play/'+last;link.textContent='前回のプレイを開く →';$('.intro-strip')?.after(link);}}
async function authorPage(id,offset=0,versionId=''){
  if(!user){await myPage();return;}
  const info=id?await api(`sets/${id}/author?offset=${offset}${versionId?'&version='+versionId:''}`):null;
  const s=info?.set||{title:'',description:'',tags:[],visibility:'DRAFT',default_order:'AUTHOR_ORDER'};
  const v=info?.version||{answer_mode:'PRIME_ONLY',allow_57:false};
  const source=id?await api(`sets/${id}/source`):{normal_text:'',dead_text:'',base_version_id:null};
  const localKey='editor:'+(id||'new');
  const saved=read(localKey,null),form=saved&&saved.base_version_id===source.base_version_id?saved:{...source,answer_mode:info?.versions[0]?.answer_mode||v.answer_mode,allow_57:info?.versions[0]?.allow_57??v.allow_57,format:'standard'};
  editor={id,source,form,info};
  frame(`<section class="page-heading"><a class="back-link" href="#/my">← マイページ</a><p class="eyebrow">QUIZ STUDIO</p><h1>${id?'クイズを育てる':'あなたのクイズを作ろう。'}</h1><p>合法手を1行ずつ。手札は、こちらで組み立てます。</p></section><div class="editor-layout"><div><section class="editor-panel"><h2>クイズの情報</h2><form id="metadata-form"><label>タイトル<input name="title" required maxlength="120" value="${esc(s.title)}" placeholder="例：絵札を含む4枚出し"></label><label>説明<textarea name="description" maxlength="5000" rows="3" placeholder="どんな手札が集まっている？">${esc(s.description)}</textarea></label><label>タグ（カンマ区切り・5個まで）<input name="tags" value="${esc(s.tags.join(', '))}" placeholder="4枚出し, 絵札, 入門"></label><div class="form-row"><label>公開範囲<select name="visibility">${['DRAFT','UNLISTED','PUBLIC'].map(k=>`<option value="${k}" ${s.visibility===k?'selected':''}>${names[k]}</option>`).join('')}</select></label><label>標準の問題順<select name="default_order"><option value="AUTHOR_ORDER" ${s.default_order==='AUTHOR_ORDER'?'selected':''}>作者の登録順</option><option value="HAND_LEXICOGRAPHIC" ${s.default_order==='HAND_LEXICOGRAPHIC'?'selected':''}>手札の辞書順</option></select></label></div>${id?'<button class="button" type="submit">情報だけ保存</button><small class="hint">問題内容を変えないため、バージョンは増えません。</small>':''}</form></section>
  <section class="editor-panel"><h2>問題をまとめて登録</h2><form id="content-form"><div class="form-row"><label>回答条件<select name="answer_mode">${['PRIME_ONLY','COMPOSITE_ONLY','BOTH'].map(k=>`<option value="${k}" ${form.answer_mode===k?'selected':''}>${names[k]}</option>`).join('')}</select></label><label class="check"><input type="checkbox" name="allow_57" ${form.allow_57?'checked':''}>57の使用を許可する</label></div><label>通常問題の入力形式<select name="format"><option value="standard" ${form.format==='standard'?'selected':''}>YamanoPrime標準形式</option><option value="sosutansaku" ${form.format==='sosutansaku'?'selected':''}>素数探索の出力</option></select></label><label>通常問題 — 合法手を1行に1つ<textarea class="notation-input" name="normal_text" rows="10" spellcheck="false" placeholder="1117&#10;9=3^2&#10;57,113">${esc(form.normal_text)}</textarea></label><p class="hint">見せ札=素因数式。57はカンマで前後に追加できます。素数探索の例：2k51, [3,*,11,*,6,4,7]</p><label>詰み問題 — 手札を1行に1つ<textarea class="notation-input" name="dead_text" rows="5" spellcheck="false" placeholder="22&#10;44">${esc(form.dead_text)}</textarea></label><p class="hint">詰みは作者の申告です。合法手が提出されると「要修正」に記録されます。</p><div class="actions"><button type="button" class="button" id="preview">入力を検証する</button><button class="button primary" type="submit">${id?'新しいバージョンで保存':'クイズを保存'}</button></div></form><div id="validation" aria-live="polite"></div></section></div>
  <aside><section class="editor-note"><p class="eyebrow">AUTHOR'S NOTE</p><h2>想定解は、<br>正解のひとつ。</h2><p>回答者が別の合法手を見つけても正解になります。</p><ul><li>A〜K各4枚まで。Xは使いません。</li><li>合成数の材料札も手札に含めます。</li><li>同じ手札は1バージョンに1問。</li><li>最大5000問。行番号付きで検証します。</li></ul></section>${id?`<section class="editor-note"><h2>現在の公開状態</h2><p>${names[s.visibility]} · v${info.versions[0]?.version_number||0}</p><a class="button wide" href="#/set/${id}">クイズページを見る →</a><p class="hint">問題の追加・削除や条件の変更は新しいバージョンになります。過去のプレイ結果はそのまま残ります。</p></section>`:''}</aside></div>
  ${id?`<section class="author-stats"><div class="section-heading"><div><p class="eyebrow">VERSION STATISTICS</p><h2>問題ごとの回答状況</h2></div><label>バージョン<select id="stats-version">${info.versions.map(x=>`<option value="${x.id}" ${x.id===info.version?.id?'selected':''}>v${x.version_number} · ${x.problem_count}問</option>`).join('')}</select></label></div>${info.disputed?.length?`<div class="notice warning"><h3>合法手が見つかった詰み問題</h3>${info.disputed.map(p=>`<div class="dispute-item"><span>${esc(cardsText(p.canonical_hand))} → ${esc(p.counterexample.notation)}</span><button class="button" data-correct="${p.id}">現行版の通常問題へ修正</button></div>`).join('')}</div>`:''}<div class="table-wrap"><table><thead><tr><th>手札</th><th>作者の想定解</th><th>回答数</th><th>正答率</th><th>詰み選択率</th></tr></thead><tbody>${info.items.map(p=>`<tr><td>${esc(cardsText(p.canonical_hand))}${p.disputed?' ⚑':''}</td><td>${p.problem_kind==='CLAIMED_DEAD'?'詰み':esc(p.example_solution.notation)}</td><td>${p.attempt_count||0}</td><td>${p.attempt_count?Math.round(p.correct_count/p.attempt_count*100)+'%':'—'}</td><td>${p.attempt_count?Math.round(p.dead_choice_count/p.attempt_count*100)+'%':'—'}</td></tr>`).join('')}</tbody></table></div>${pager(info.total,offset,50)}</section>`:''}`);
  const metadata=()=>{const b=Object.fromEntries(new FormData($('#metadata-form')));b.tags=b.tags.split(/[,、]/).map(x=>x.trim()).filter(Boolean);return b;};
  const contents=()=>{const b=Object.fromEntries(new FormData($('#content-form')));b.allow_57=$('#content-form [name=allow_57]').checked;b.base_version_id=source.base_version_id;return b;};
  $('#content-form').addEventListener('input',()=>{write(localKey,contents());$('#validation').innerHTML='';});
  function validation(result){
    const target=$('#validation');target.innerHTML=`<div class="notice ${result.errors.length?'warning':'success'}"><strong>${result.total??result.problems.length} 問を検証 · エラー ${result.errors.length} 件 · 重複 ${result.warnings.length} 件</strong></div>${[...result.errors,...result.warnings].length?`<div class="validation-search"><label>行番号で探す<input id="error-line" type="number" min="1" placeholder="例：1234"></label><button class="button" id="copy-errors">検証結果をコピー</button></div><div id="validation-rows"></div>`:''}<p class="hint">重複は先に入力した問題を採用します。通常と詰みの衝突は保存できません。</p>`;
    const all=[...result.errors.map(x=>({...x,severity:'エラー'})),...result.warnings.map(x=>({...x,severity:'重複'}))];
    function rows(offset=0){const wanted=Number($('#error-line')?.value),filtered=wanted?all.filter(x=>x.line===wanted):all;$('#validation-rows').innerHTML=filtered.slice(offset,offset+30).map(e=>`<div class="validation-row"><strong>${e.section==='dead'?'詰み':'通常'} ${e.line}行目 · ${e.severity}</strong><code>${esc(e.input)}</code><p>${esc(e.reason)}</p></div>`).join('')+pager(filtered.length,offset,30);$('#validation-rows').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>rows(Number(b.dataset.page)));}
    if(all.length){rows();$('#error-line').oninput=()=>rows();$('#copy-errors').onclick=()=>run(async()=>{await navigator.clipboard.writeText(all.map(e=>`${e.section}:${e.line}\t${e.input}\t${e.reason}`).join('\n'));toast('検証結果をコピーしました。');});}
  }
  $('#preview').onclick=()=>run(async()=>validation(await api('import-preview',{body:contents()})));
  $('#metadata-form').onsubmit=e=>{e.preventDefault();if(id)run(async()=>{await api('sets/'+id,{method:'PATCH',body:metadata()});toast('情報を保存しました。');});};
  $('#content-form').onsubmit=e=>{e.preventDefault();if(!$('#metadata-form').reportValidity())return;run(async()=>{
    const body=contents(),meta=metadata(),checked=await api('import-preview',{body});validation(checked);if(checked.errors.length)return;
    let setId=id;if(!setId)setId=(await api('sets',{body:meta})).id;
    await api(`sets/${setId}/versions`,{body});await api('sets/'+setId,{method:'PATCH',body:meta});localStorage.removeItem('yp:'+localKey);
    toast('クイズを保存しました。');if(id)await authorPage(id);else location.hash='/edit/'+setId;
  });};
  if(id){$('#stats-version').onchange=e=>run(()=>authorPage(id,0,e.target.value));bindPager(n=>run(()=>authorPage(id,n,info.version?.id)));document.querySelectorAll('[data-correct]').forEach(b=>b.onclick=()=>confirmDialog('通常問題に修正しますか？','保存された合法手を想定解にした新バージョンを作ります。過去の結果は変わりません。',()=>run(async()=>{await api(`sets/${id}/corrections`,{body:{problem_id:b.dataset.correct}});localStorage.removeItem('yp:'+localKey);await authorPage(id);toast('新バージョンへ修正しました。');})));}
}
async function navigate(){
  const myEpoch=++epoch;play=null;const raw=location.hash.slice(1)||'/',[path,query]=raw.split('?'),parts=path.split('/').filter(Boolean),params=new URLSearchParams(query||'');
  if(raw==='quiz-list'){location.hash='/';return;}
  route=parts[0]||'home';frame('<div class="loading" role="status">読み込み中…</div>');
  try{
    if(route==='home'||route==='author'){
      if(params.get('liked')==='true'&&!user){
        frame('<section class="empty-state"><h1>お気に入りのクイズ</h1><p>ログインすると、自分が高評価したクイズに絞って選べます。</p><button class="button primary" id="favorites-login">ログインする</button><a class="button" href="#/">すべてのクイズを見る</a></section>');
        $('#favorites-login').onclick=showAccount;return;
      }
      if(route==='author')params.set('author',decodeURIComponent(parts[1]));const response=await api('sets?'+params);if(myEpoch!==epoch)return;data=response;home(params);
    }else if(route==='set'){const response=await api('sets/'+parts[1]);if(myEpoch!==epoch)return;data=response;detail();}
    else if(route==='play')await loadPlay(parts[1]);
    else if(route==='result')await resultPage(parts[1]);
    else if(route==='my')await myPage();
    else if(route==='new'||route==='edit')await authorPage(parts[1]);
    else if(route==='guide')guide();
    else frame('<section class="empty-state"><h1>ページが見つかりません</h1><a href="#/">トップへ</a></section>');
  }catch(error){if(myEpoch===epoch){frame(`<section class="empty-state"><h1>読み込めませんでした</h1><p>${esc(error.message)}</p><button class="button" id="reload">再読み込み</button><a class="button" href="#/">トップへ</a></section>`);$('#reload').onclick=navigate;}}
}
document.addEventListener('keydown',event=>{
  if(route!=='play'||!play||busy||event.ctrlKey||event.metaKey||event.altKey||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||$('#dialog').open)return;
  const {p,draft}=current();if(p.attempt||draft.pending)return;
  const key=event.key.toUpperCase(),rank={A:1,T:10,J:11,Q:12,K:13}[key]||(/^[1-9]$/.test(key)?Number(key):null);
  if(rank){event.preventDefault();chooseRank(rank);}
  else if(key==='ENTER'){event.preventDefault();$('#submit').click();}
  else if(key==='BACKSPACE'){event.preventDefault();$('#undo').click();}
  else if(key==='='){event.preventDefault();$('#composite')?.click();}
  else if(key==='*'||key==='^'){event.preventDefault();appendOperator(draft,key==='*'?'×':'^');updateDraft();}
});
window.addEventListener('hashchange',navigate);
try{health=await api('health',{auth:false});if(token)user=(await api('me')).user;}catch(error){if(error.status===401){token='';write('account','');}else toast(error.message);}
await navigate();
