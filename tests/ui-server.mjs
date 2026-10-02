// Local browser test harness. Not imported by the production entrypoint.
import fs from 'node:fs/promises';
import {openDatabase} from '../server/database.mjs';
import {RuleWorker} from '../server/rule-worker.mjs';
import {createApp} from '../server/app.mjs';
import {seedDemo} from '../server/seed.mjs';
import {makeService} from '../server/service.mjs';
const db=await openDatabase({LOCAL_DATABASE:'memory'}),rules=new RuleWorker();
await seedDemo(db,rules);
const service=makeService({db,rules}),user={id:'browser-author',name:'プライム研究室'};
for(const count of [937,5000]){
  const source=await fs.readFile(new URL(`./fixtures/${count===937?'four-card-937':'legal-5000'}.txt`,import.meta.url),'utf8');
  const meta={title:count===937?'4枚出し全937問':'5000問の上がり手ノート',description:count===937?'A〜Kから4枚を使う937通りの手札。あなたの知っている上がり手で、どこまで解ける？':'たっぷり考えたい人へ。数字と絵札の5〜9枚から、合法な上がり手を探そう。',tags:[count===937?'4枚出し':'上級','たっぷり'],visibility:'PUBLIC',default_order:'HAND_LEXICOGRAPHIC'};
  const {id}=await service.create(user,meta);await service.version(id,user,{normal_text:source,dead_text:'',answer_mode:'PRIME_ONLY',allow_57:false,base_version_id:null});await service.metadata(id,user,meta);
}
const server=createApp({db,rules,origins:['http://127.0.0.1:5177','http://localhost:5177'],authenticate:async token=>token==='a'.repeat(64)?user:null,authAvailable:true,rateLimit:false});
await new Promise(resolve=>server.listen(3004,'127.0.0.1',resolve));
export async function close(){await new Promise(resolve=>server.close(resolve));await Promise.all([db.close(),rules.close()]);}
console.log('UI fixture API ready on 3004');
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>void Promise.all([db.close(),rules.close()]).then(()=>process.exit(0))));
