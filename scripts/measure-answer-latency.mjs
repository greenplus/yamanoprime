// Usage: node scripts/measure-answer-latency.mjs <collector checkout> [--network]
// Application writes use an in-memory fixture only. Live probes are GET/OPTIONS.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/database.mjs';
import {RuleWorker} from '../server/rule-worker.mjs';
import {makeService} from '../server/service.mjs';
import {createApp} from '../server/app.mjs';

if(!process.argv[2])throw new Error('Specify the four-card collector checkout');
const collector=await import(pathToFileURL(path.resolve(process.argv[2],'lib/primes.mjs')));
const source=await fs.readFile(new URL('../tests/fixtures/four-card-937.txt',import.meta.url),'utf8');
const samples=source.trim().split(/\r?\n/).map(solution=>({solution,order:collector.parseCards(solution)}));
const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {count:values.length,median_ms:sorted[Math.floor(sorted.length/2)],p95_ms:sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))],mean_ms:values.reduce((a,b)=>a+b,0)/values.length};};
const report={at:new Date().toISOString(),node:process.version,platform:process.platform,scope:'937 four-card prime hands; local anonymous API with PGlite; production read probes only'};
let sqlCalls=0,workerMs=0;
const rawDb=await openDatabase({LOCAL_DATABASE:'memory'}),worker=new RuleWorker();
const db={...rawDb,query:(...args)=>{sqlCalls++;return rawDb.query(...args);},transaction:fn=>rawDb.transaction(tx=>fn({query:(...args)=>{sqlCalls++;return tx.query(...args);}}))};
const rules={call:async payload=>{const t=performance.now();try{return await worker.call(payload);}finally{workerMs+=performance.now()-t;}}};
const service=makeService({db,rules}),server=createApp({db,rules,rateLimit:false,authAvailable:false});
try{
  const collectorTimes=[];
  for(let pass=0;pass<3;pass++)for(const sample of samples){
    const group={id:collector.groupKey(sample.order)},t=performance.now();
    if(!collector.evaluateConstruction(group,sample.order))throw new Error('Collector rejected fixture');
    if(pass)collectorTimes.push(performance.now()-t);
  }
  report.collector_local_validation=stats(collectorTimes);
  const payload=s=>({op:'validate',solution:s.solution,hand:[...s.order].sort((a,b)=>a-b),answer_mode:'PRIME_ONLY',allow_57:false});
  let t=performance.now();await worker.call(payload(samples[0]));report.worker_startup_and_first_validation_ms=performance.now()-t;
  const workerTimes=[];
  for(const sample of samples){t=performance.now();if(!(await worker.call(payload(sample))).legal)throw new Error('Worker rejected fixture');workerTimes.push(performance.now()-t);}
  report.yamanoprime_warm_worker=stats(workerTimes);

  const author={id:'latency-probe',name:'Latency probe'},meta={title:'Local latency probe',tags:[],visibility:'PUBLIC',default_order:'AUTHOR_ORDER'};
  const set=await service.create(author,meta);await service.version(set.id,author,{normal_text:source,dead_text:'',answer_mode:'PRIME_ONLY',allow_57:false,base_version_id:null});await service.metadata(set.id,author,meta);
  const session=await service.start(set.id,null,{}),initial=await service.restore(session.id,null,session.token,new URLSearchParams());
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api/sessions/${session.id}`;
  const byHand=new Map(samples.map(s=>[collector.groupKey(s.order),s.solution]));
  const localAttempts=[];
  for(const problem of initial.items.slice(0,20)){
    sqlCalls=0;workerMs=0;t=performance.now();
    const response=await fetch(base+'/attempts',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Token':session.token},body:JSON.stringify({problem_id:problem.id,request_id:randomUUID(),kind:'move',solution:byHand.get(collector.groupKey(problem.hand))})});
    const answer=await response.json();if(!response.ok||!answer.correct)throw new Error('Answer probe failed');
    const postMs=performance.now()-t,postSql=sqlCalls,ruleMs=workerMs;
    sqlCalls=0;t=performance.now();const restore=await fetch(base,{headers:{'X-Session-Token':session.token}});await restore.json();if(!restore.ok)throw new Error('Restore probe failed');
    localAttempts.push({post_ms:postMs,restore_ms:performance.now()-t,post_sql_statements:postSql,restore_sql_statements:sqlCalls,worker_ms:ruleMs});
  }
  report.local_anonymous_flow={post:stats(localAttempts.map(x=>x.post_ms)),followup_get:stats(localAttempts.map(x=>x.restore_ms)),until_feedback:stats(localAttempts.map(x=>x.post_ms+x.restore_ms)),samples:localAttempts};

  if(process.argv.includes('--network')){
    report.production_read_probes=[];
    for(const [name,url,method] of [
      ['yamano_health','https://yamanoprime-production.up.railway.app/api/health','GET'],
      ['yamano_sets','https://yamanoprime-production.up.railway.app/api/sets','GET'],
      ['collector_health','https://primeqk4cards-production.up.railway.app/api/health','GET'],
      ['yamano_preflight','https://yamanoprime-production.up.railway.app/api/sessions/probe/attempts','OPTIONS'],
    ]){
      const samples=[];
      for(let i=0;i<5;i++){
        t=performance.now();const response=await fetch(url,{method,headers:{Origin:'https://greenplus.github.io',...(method==='OPTIONS'?{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-session-token'}:{})},signal:AbortSignal.timeout(15000)});
        await response.arrayBuffer();samples.push({ms:performance.now()-t,status:response.status});
      }
      report.production_read_probes.push({name,method,url,...stats(samples.map(x=>x.ms)),samples});
    }
  }
  const destination=new URL('../reports/answer-latency.json',import.meta.url);
  await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,local_anonymous_flow:{...report.local_anonymous_flow,samples:undefined}},null,2));
}finally{
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  await worker.close();await rawDb.close();
}
