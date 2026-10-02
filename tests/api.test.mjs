import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {RuleWorker} from '../server/rule-worker.mjs';
import {createApp} from '../server/app.mjs';
let db,rules,server,base;
const author='a'.repeat(64),other='b'.repeat(64);
before(async()=>{
  db=await openDatabase({LOCAL_DATABASE:'memory'});rules=new RuleWorker();
  // Exercise the actual shared account SQL; this schema exists only in the test DB.
  await db.query('CREATE SCHEMA factoring_esports');
  await db.query('CREATE TABLE factoring_esports.players(id text PRIMARY KEY,name text,login_id text)');
  await db.query('CREATE TABLE factoring_esports.sessions(player_id text,token_hash text,expires_at bigint)');
  for(const [id,token] of [['author',author],['other',other]]){
    await db.query('INSERT INTO factoring_esports.players VALUES($1,$1,$1)',[id]);
    await db.query('INSERT INTO factoring_esports.sessions VALUES($1,$2,$3)',[id,createHash('sha256').update(token).digest('hex'),Date.now()+3600000]);
  }
  db.authQuery=(...args)=>db.query(...args);
  server=createApp({db,rules,rateLimit:false,origins:['http://localhost:5176']});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await rules.close();await db.close();});
async function request(path,{body,token,secret,method,status=200,origin}={}){
  const response=await fetch(base+'/api/'+path,{method:method||(body?'POST':'GET'),headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(secret?{'X-Session-Token':secret}:{}),...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
  const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;
}
async function createSet(options={}){
  const meta={title:'テスト '+randomUUID(),description:'説明は検索しません',tags:[' 入門 ','入門','数'],visibility:'PUBLIC',default_order:'AUTHOR_ORDER',...options};
  const {id}=await request('sets',{token:author,body:meta});
  const version=await request(`sets/${id}/versions`,{token:author,body:{answer_mode:'PRIME_ONLY',allow_57:false,normal_text:'1117\n113',dead_text:'22\n44\n137',base_version_id:null,...options}});
  await request('sets/'+id,{token:author,method:'PATCH',body:meta});return {id,version:version.id,meta};
}
async function start(set,token){const s=await request('sessions',{token,body:{quiz_set_id:set.id}});const r=await request('sessions/'+s.id,{secret:s.token});return {...s,...r};}
const answer=(s,p,kind,solution,extra={})=>request(`sessions/${s.id}/attempts`,{secret:s.token,body:{problem_id:typeof p==='number'?s.items[p].id:p,request_id:randomUUID(),kind,...(kind==='move'?{solution}:{}),...extra}});
test('shared account tokens, draft privacy, visibility and ownership',async()=>{
  assert.equal((await request('me',{token:author})).user.id,'author');
  await request('me',{status:401});await request('me',{token:'c'.repeat(64),status:401});
  const set=await createSet({visibility:'DRAFT'});
  await request('sets/'+set.id,{status:404});await request('sets/'+set.id+'/author',{token:other,status:404});
  await request('sets/'+set.id,{token:other,method:'PATCH',body:set.meta,status:404});
  await request('sessions',{body:{quiz_set_id:set.id},status:404});
  await request('sets/'+set.id,{token:author,method:'PATCH',body:{...set.meta,visibility:'UNLISTED'}});
  await request('sets/'+set.id);assert.ok(!(await request('sets')).items.some(x=>x.id===set.id));
  await start(set);await request('health',{origin:'https://attacker.invalid',status:403});
});
test('prime vertical slice, response privacy, alternate answer and one-attempt rule',async()=>{
  const set=await createSet(),s=await start(set);
  const payload=JSON.stringify(s);for(const hidden of ['example_solution','problem_kind','counterexample','disputed'])assert.ok(!payload.includes(hidden));
  await request(`sessions/${s.id}/results`,{secret:s.token,status:409});
  await request(`sessions/${s.id}`,{secret:'0'.repeat(64),status:404});
  assert.equal((await request('sets/'+set.id)).play_count,0);
  const first=await answer(s,0,'move','1171');assert.equal(first.score,1);assert.equal(first.session.score,1);
  assert.equal((await request('sets/'+set.id)).play_count,1);
  await request(`sessions/${s.id}/attempts`,{secret:s.token,body:{problem_id:s.items[0].id,request_id:randomUUID(),kind:'move',solution:'1117'},status:409});
  assert.equal((await answer(s,1,'dead')).score,0);
  assert.equal((await request('sets/'+set.id)).play_count,1);
  const restored=await request('sessions/'+s.id,{secret:s.token});assert.equal(restored.items[0].attempt.score,1);assert.equal(restored.session.attempted_count,2);
  const ended=await request(`sessions/${s.id}/end`,{secret:s.token,body:{}});assert.equal(ended.session.unanswered_count,3);
  await request(`sessions/${s.id}/attempts`,{secret:s.token,body:{problem_id:s.items[2].id,request_id:randomUUID(),kind:'dead'},status:409});
  const result=await request(`sessions/${s.id}/results`,{secret:s.token});assert.equal(result.items[0].example_solution.notation,'1117');assert.equal(result.items[2].problem_kind,'CLAIMED_DEAD');
});
test('wrong ordinary move scores zero and cannot be corrected',async()=>{
  const s=await start(await createSet({normal_text:'1117',dead_text:''}));const r=await answer(s,0,'move','1711');assert.equal(r.score,0);assert.equal(r.session.status,'ENDED');assert.equal(r.session.wrong_count,1);
  await request(`sessions/${s.id}/attempts`,{secret:s.token,status:409,body:{problem_id:s.items[0].id,request_id:randomUUID(),kind:'move',solution:'1117'}});
});
test('claimed dead score table, disputes, statistics and immutable correction version',async()=>{
  const set=await createSet({normal_text:'113',dead_text:'22\n44\n137'}),s=await start(set);
  assert.equal((await answer(s,1,'dead')).score,1);
  assert.equal((await answer(s,2,'move','44')).score,-1);
  assert.equal((await answer(s,3,'move','137')).score,1);
  assert.equal((await answer(s,0,'move','113')).session.status,'ENDED');
  let report=await request(`sets/${set.id}/author`,{token:author});assert.equal(report.disputed.length,1);assert.equal(report.disputed[0].counterexample.notation,'137');
  assert.equal(report.items[3].attempt_count,1);assert.equal(report.items[3].correct_count,1);assert.equal(report.items[1].dead_choice_count,1);
  const correction=await request(`sets/${set.id}/corrections`,{token:author,body:{problem_id:s.items[3].id}});assert.equal(correction.version_number,2);
  report=await request(`sets/${set.id}/author`,{token:author});assert.equal(report.items[3].problem_kind,'NORMAL');assert.equal(report.items[3].example_solution.notation,'137');assert.equal(report.items[3].attempt_count,null);
  const past=await request(`sessions/${s.id}/results`,{secret:s.token});assert.equal(past.session.score,2);assert.equal(past.items[3].problem_kind,'CLAIMED_DEAD');assert.equal(past.items[3].disputed,true);
});
test('parallel retries are idempotent, different requests cannot double score',async()=>{
  const set=await createSet(),s=await start(set),request_id=randomUUID(),body={problem_id:s.items[0].id,request_id,kind:'move',solution:'1117'};
  const values=await Promise.all(Array.from({length:5},()=>request(`sessions/${s.id}/attempts`,{secret:s.token,body})));
  assert.equal(values.filter(x=>!x.replayed).length,1);assert.ok(values.every(x=>x.session.score===1));
  const stats=await request(`sets/${set.id}/author`,{token:author});assert.equal(stats.items[0].attempt_count,1);assert.equal((await request('sets/'+set.id)).play_count,1);
  await request(`sessions/${s.id}/attempts`,{secret:s.token,body:{...body,solution:'1171'},status:409});
  await request(`sessions/${s.id}/attempts`,{secret:s.token,body:{...body,problem_id:s.items[1].id,solution:'113'},status:409});
  await request(`sessions/${s.id}/end`,{secret:s.token,body:{}});
  assert.equal((await request(`sessions/${s.id}/attempts`,{secret:s.token,body})).replayed,true);
});
test('play count excludes start, paging, skip and intermediate 57 UI state',async()=>{
  const set=await createSet({normal_text:'57,113',dead_text:'',allow_57:true}),s=await start(set);
  await request('sessions/'+s.id+'?offset=0',{secret:s.token});assert.equal((await request('sets/'+set.id)).play_count,0);
  assert.equal((await answer(s,0,'move','57,113')).score,1);assert.equal((await request('sets/'+set.id)).play_count,1);
});
test('version pinning, metadata edits and optimistic author editing',async()=>{
  const set=await createSet(),old=await start(set);
  await request('sets/'+set.id,{token:author,method:'PATCH',body:{...set.meta,title:'新しい名前'}});
  assert.equal((await request('sets/'+set.id)).current_version_id,set.version);
  const body={answer_mode:'PRIME_ONLY',allow_57:false,normal_text:'127',dead_text:'',base_version_id:set.version};
  const next=await request(`sets/${set.id}/versions`,{token:author,body});assert.equal(next.version_number,2);
  await request(`sets/${set.id}/versions`,{token:author,body,status:409});
  const restored=await request('sessions/'+old.id,{secret:old.token});assert.equal(restored.session.quiz_version_id,set.version);assert.equal(restored.items.length,5);
  assert.equal((await answer(old,0,'move','1117')).score,1);
  const fresh=await start(set);assert.equal(fresh.session.quiz_version_id,next.id);assert.deepEqual(fresh.items[0].hand,[1,2,7]);
});
test('likes require authenticated attempt, are unique across versions, support removal; history persists',async()=>{
  const set=await createSet();await request(`sets/${set.id}/like`,{token:author,body:{liked:true},status:403});
  const s=await start(set,author);await answer(s,0,'move','1117');
  await Promise.all(Array.from({length:4},()=>request(`sets/${set.id}/like`,{token:author,body:{liked:true}})));
  assert.equal((await request('sets/'+set.id)).like_count,1);
  await request(`sets/${set.id}/like`,{token:other,body:{liked:true},status:403});
  await request(`sets/${set.id}/like`,{token:author,body:{liked:false}});assert.equal((await request('sets/'+set.id)).like_count,0);
  const history=await request('my/history',{token:author});assert.ok(history.items.some(x=>x.id===s.id&&x.score===1&&x.quiz_version_id===set.version));
  const restored=await request('sessions/'+s.id,{token:author});assert.equal(restored.session.score,1);
});
test('shuffle is restored, numeric rank lexicographic order, list paging does not leak',async()=>{
  const set=await createSet({normal_text:'K\n2\nJ\n3',dead_text:'',default_order:'HAND_LEXICOGRAPHIC'}),s=await start(set);
  assert.deepEqual(s.items.map(x=>x.hand),[[2],[3],[11],[13]]);
  const shuffled=await request('sessions',{body:{quiz_set_id:set.id,shuffle:true}});
  const one=await request('sessions/'+shuffled.id,{secret:shuffled.token}),two=await request('sessions/'+shuffled.id,{secret:shuffled.token});
  assert.deepEqual(one.items,two.items);assert.ok(one.session.shuffle_seed);
});
test('search, tags, rule and count filters; UNLISTED not on author browse',async()=>{
  const set=await createSet({title:'限定検索タイトル',tags:['固有タグ'],normal_text:'9=3^2',dead_text:'',answer_mode:'COMPOSITE_ONLY',allow_57:true});
  let r=await request('sets?q='+encodeURIComponent('限定検索'));assert.ok(r.items.some(x=>x.id===set.id));
  r=await request('sets?tag='+encodeURIComponent('固有タグ')+'&mode=COMPOSITE_ONLY&allow_57=true&dead=false&min=1&max=1');assert.equal(r.items[0].id,set.id);
  r=await request('sets?q='+encodeURIComponent('説明は検索しません'));assert.equal(r.total,0);
  const hidden=await createSet({visibility:'UNLISTED'});r=await request('sets?author=author');assert.ok(!r.items.some(x=>x.id===hidden.id));
});
test('favorites filter uses the authenticated account and composes with filters, paging and unlike',async()=>{
  const prefix='favorites-'+randomUUID();
  const first=await createSet({title:prefix+' prime',normal_text:'113',dead_text:'',tags:['お気に入り用']}),second=await createSet({title:prefix+' other',normal_text:'127',dead_text:''}),third=await createSet({title:prefix+' composite',normal_text:'9=3^2',dead_text:'',answer_mode:'COMPOSITE_ONLY'});
  for(const [set,token,solution] of [[first,author,'113'],[second,other,'127'],[third,author,'9=3^2']]){
    const s=await start(set,token);await answer(s,0,'move',solution);await request(`sets/${set.id}/like`,{token,body:{liked:true}});
  }
  await request('sets?liked=true',{status:401});await request('sets?liked=invalid',{token:author,status:400});
  const query=`sets?liked=true&q=${encodeURIComponent(prefix)}`;
  const mine=await request(query,{token:author});assert.equal(mine.total,2);assert.deepEqual(new Set(mine.items.map(x=>x.id)),new Set([first.id,third.id]));
  const theirs=await request(query,{token:other});assert.deepEqual(theirs.items.map(x=>x.id),[second.id]);
  const spoof=await request(query+'&account_id=other',{token:author});assert.deepEqual(new Set(spoof.items.map(x=>x.id)),new Set([first.id,third.id]));
  const filtered=await request(query+'&mode=PRIME_ONLY&tag='+encodeURIComponent('お気に入り用')+'&sort=plays',{token:author});assert.equal(filtered.total,1);assert.equal(filtered.items[0].id,first.id);
  const a=await request(query+'&limit=1',{token:author}),b=await request(query+'&limit=1&offset=1',{token:author});assert.equal(a.total,2);assert.equal(b.total,2);assert.notEqual(a.items[0].id,b.items[0].id);
  await request(`sets/${first.id}/like`,{token:author,body:{liked:false}});assert.equal((await request(query,{token:author})).total,1);
  await request(`sets/${third.id}`,{token:author,method:'PATCH',body:{...third.meta,visibility:'DRAFT'}});assert.equal((await request(query,{token:author})).total,0);
});
test('import errors, max count, malformed JSON, rate and origin defenses',async()=>{
  const r=await request('import-preview',{token:author,body:{normal_text:'113\n\n4',dead_text:'',answer_mode:'PRIME_ONLY',allow_57:false}});assert.equal(r.errors[0].line,3);
  const limit=await request('import-preview',{token:author,body:{normal_text:Array(5001).fill('113').join('\n'),dead_text:'',answer_mode:'PRIME_ONLY',allow_57:false}});assert.equal(limit.total,0);assert.equal(limit.errors.length,1);
  const set=await createSet();const unrelated=await start(await createSet());const s=await start(set);
  await request(`sessions/${s.id}/attempts`,{secret:s.token,body:{problem_id:unrelated.items[0].id,request_id:randomUUID(),kind:'dead'},status:404});
  await request('sets?limit=5000',{status:400});
  const raw=await fetch(base+'/api/sets',{method:'POST',headers:{Authorization:'Bearer '+author,'Content-Type':'application/json'},body:'{'});assert.equal(raw.status,400);
  const oversize=await fetch(base+'/api/sets',{method:'POST',headers:{Authorization:'Bearer '+author,'Content-Type':'application/json'},body:JSON.stringify({title:'a'.repeat(2200000)})});assert.equal(oversize.status,413);
});
test('session summary, attempt and stats roll back together on DB failure',async()=>{
  const set=await createSet({normal_text:'113',dead_text:''}),s=await start(set);
  const original=db.transaction;
  db.transaction=fn=>original(tx=>fn({query:(sql,args)=>{if(sql.startsWith('INSERT INTO yamano_prime.problem_stats'))throw new Error('injected DB failure');return tx.query(sql,args);}}));
  await request(`sessions/${s.id}/attempts`,{secret:s.token,body:{problem_id:s.items[0].id,request_id:randomUUID(),kind:'move',solution:'113'},status:500});
  db.transaction=original;
  const restored=await request('sessions/'+s.id,{secret:s.token});assert.equal(restored.session.score,0);assert.equal(restored.session.attempted_count,0);assert.equal(restored.items[0].attempt,null);assert.equal((await request('sets/'+set.id)).play_count,0);
  assert.equal((await answer(s,0,'move','113')).score,1);
});
test('multiple disputes from an older version can each correct the current version',async()=>{
  const set=await createSet({normal_text:'113',dead_text:'137\n127'}),s=await start(set);
  await answer(s,1,'move','137');await answer(s,2,'move','127');
  await request(`sets/${set.id}/corrections`,{token:author,body:{problem_id:s.items[1].id}});
  const next=await request(`sets/${set.id}/corrections`,{token:author,body:{problem_id:s.items[2].id}});assert.equal(next.version_number,3);
  const report=await request(`sets/${set.id}/author`,{token:author});assert.ok(report.items.every(x=>x.problem_kind==='NORMAL'));
});
test('session creation rate limit blocks a burst even without any final attempts',async()=>{
  const guarded=createApp({db,rules,rateLimit:true});await new Promise(resolve=>guarded.listen(0,'127.0.0.1',resolve));
  try{const set=await createSet();let response;
    for(let i=0;i<21;i++)response=await fetch(`http://127.0.0.1:${guarded.address().port}/api/sessions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({quiz_set_id:set.id})});
    assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
  }finally{await new Promise(resolve=>guarded.close(resolve));}
});
