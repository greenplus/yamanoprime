import fs from 'node:fs/promises';
import {openDatabase} from '../server/database.mjs';
import {RuleWorker} from '../server/rule-worker.mjs';
import {makeService} from '../server/service.mjs';
const db=await openDatabase({LOCAL_DATABASE:'memory'}),rules=new RuleWorker(),service=makeService({db,rules});
const author={id:'benchmark',name:'Benchmark'},report={at:new Date().toISOString(),database:'PGlite in memory',results:[]};
async function measure(fn){const t=performance.now(),value=await fn();return {ms:Math.round((performance.now()-t)*10)/10,value};}
try{
  for(const count of [937,5000]){
    const source=await fs.readFile(new URL(`../tests/fixtures/${count===937?'four-card-937':'legal-5000'}.txt`,import.meta.url),'utf8');
    const body={answer_mode:'PRIME_ONLY',allow_57:false,normal_text:source,dead_text:'',base_version_id:null};
    const meta={title:`Performance ${count}`,tags:[],visibility:'PUBLIC',default_order:'AUTHOR_ORDER'};
    const preview=await measure(()=>service.preview(body));
    if(preview.value.errors.length||preview.value.problems.length!==count)throw new Error('Invalid performance fixture '+JSON.stringify(preview.value.errors));
    const set=await service.create(author,meta),publish=await measure(()=>service.version(set.id,author,body));await service.metadata(set.id,author,meta);
    const detail=await measure(()=>service.detail(set.id)),start=await measure(()=>service.start(set.id,null,{shuffle:true})),s=start.value;
    const sequential=await measure(()=>service.restore(s.id,null,s.token,new URLSearchParams('limit=1')));
    const list=await measure(()=>service.restore(s.id,null,s.token,new URLSearchParams('limit=50')));
    const restored=await measure(()=>service.restore(s.id,null,s.token,new URLSearchParams(`offset=${count-1}&limit=1`)));
    const original=preview.value.problems.find(x=>JSON.stringify(x.canonical_hand)===JSON.stringify(sequential.value.items[0].hand));
    const attempt=await measure(()=>service.attempt(s.id,null,s.token,{problem_id:sequential.value.items[0].id,request_id:crypto.randomUUID(),kind:'move',solution:original.example_solution.notation}));
    const completion=await measure(async()=>{
      const ids=(await db.query('SELECT id FROM yamano_prime.quiz_problems WHERE quiz_version_id=$1',[publish.value.id])).rows.map(x=>x.id).filter(id=>id!==sequential.value.items[0].id);
      for(let offset=0;offset<ids.length;offset+=10)await Promise.all(ids.slice(offset,offset+10).map(problem_id=>service.attempt(s.id,null,s.token,{problem_id,request_id:crypto.randomUUID(),kind:'dead'})));
      const completed=await service.restore(s.id,null,s.token,new URLSearchParams('limit=1'));
      if(completed.session.status!=='ENDED'||completed.session.attempted_count!==count||completed.session.score!==1)throw new Error('Full session persistence failed');
      return completed.session;
    });
    const result=await measure(()=>service.result(s.id,null,s.token,new URLSearchParams('limit=50')));
    report.results.push({count,import_validation_ms:preview.ms,publish_ms:publish.ms,detail_ms:detail.ms,session_start_ms:start.ms,sequential_ms:sequential.ms,list_50_ms:list.ms,restore_last_ms:restored.ms,final_attempt_ms:attempt.ms,complete_all_attempts_ms:completion.ms,stored_attempts:completion.value.attempted_count,result_50_ms:result.ms,play_payload_bytes:Buffer.byteLength(JSON.stringify(list.value)),result_payload_bytes:Buffer.byteLength(JSON.stringify(result.value)),stored_order_count:count});
  }
  await fs.mkdir(new URL('../reports/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../reports/performance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await rules.close();await db.close();}
