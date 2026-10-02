import {createHash,randomBytes,randomUUID} from 'node:crypto';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export class RequestError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const ensure=(test,message,status=400)=>{if(!test)throw new RequestError(message,status);};
const table=name=>`yamano_prime.${name}`;
const one=async(db,sql,args=[]) => (await db.query(sql,args)).rows[0];
const modes=['PRIME_ONLY','COMPOSITE_ONLY','BOTH'];
const sessionColumns='id,token_hash,quiz_set_id,quiz_version_id,account_id,status,score,correct_count,wrong_count,dead_choice_count,attempted_count,total_problem_count,started_at,first_attempt_at,ended_at,counted_as_play,shuffle_seed';
export function pageParams(params){
  const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||50);
  ensure(Number.isSafeInteger(offset)&&offset>=0&&offset<=500000&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'ページ指定が不正です。');
  return {offset,limit};
}
function metadata(body){
  ensure(typeof body.title==='string'&&body.title.trim().length>=1&&body.title.trim().length<=120,'タイトルは1〜120文字です。');
  ensure(typeof (body.description??'')==='string'&&(body.description??'').length<=5000,'説明は5000文字以内です。');
  ensure(Array.isArray(body.tags??[])&&(body.tags??[]).every(x=>typeof x==='string'&&x.trim().length<=32),'タグは各32文字以内です。');
  const tags=[...new Set((body.tags??[]).map(x=>x.trim()).filter(Boolean))];
  ensure(tags.length<=5,'タグは5個までです。');
  const visibility=body.visibility??'DRAFT',default_order=body.default_order??'AUTHOR_ORDER';
  ensure(['DRAFT','UNLISTED','PUBLIC'].includes(visibility),'公開範囲が不正です。');
  ensure(['AUTHOR_ORDER','HAND_LEXICOGRAPHIC'].includes(default_order),'出題順が不正です。');
  return {title:body.title.trim(),description:body.description??'',tags,visibility,default_order};
}
export function makeService({db,rules}){
  async function owned(tx,id,user,lock=false){
    const row=await one(tx,`SELECT * FROM ${table('quiz_sets')} WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);
    ensure(row&&row.author_id===user.id,'クイズが見つかりません。',404);return row;
  }
  async function visible(tx,id,user){
    const row=await one(tx,`SELECT s.*,v.answer_mode,v.allow_57,v.problem_count,v.contains_dead,v.version_number,(SELECT count(*)::integer FROM ${table('likes')} l WHERE l.quiz_set_id=s.id) AS like_count FROM ${table('quiz_sets')} s LEFT JOIN ${table('quiz_versions')} v ON v.id=s.current_version_id WHERE s.id=$1`,[id]);
    ensure(row&&(row.visibility!=='DRAFT'||row.author_id===user?.id),'クイズが見つかりません。',404);return row;
  }
  async function session(tx,id,user,token,lock=false,includeOrder=false){
    const row=await one(tx,`SELECT ${sessionColumns}${includeOrder?',problem_order':''} FROM ${table('quiz_sessions')} WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);
    ensure(row&&((row.account_id&&row.account_id===user?.id)||(typeof token==='string'&&digest(token)===row.token_hash)),'セッションが見つかりません。',404);return row;
  }
  function summary(row){
    return {id:row.id,quiz_set_id:row.quiz_set_id,quiz_version_id:row.quiz_version_id,status:row.status,
      score:row.score,correct_count:row.correct_count,wrong_count:row.wrong_count,dead_choice_count:row.dead_choice_count,
      attempted_count:row.attempted_count,total_problem_count:row.total_problem_count,
      unanswered_count:row.total_problem_count-row.attempted_count,started_at:Number(row.started_at),ended_at:row.ended_at?Number(row.ended_at):null,shuffle_seed:row.shuffle_seed};
  }
  async function preview(body){
    ensure(modes.includes(body.answer_mode)&&typeof body.allow_57==='boolean','回答条件が不正です。');
    for(const key of ['normal_text','dead_text'])ensure(typeof (body[key]??'')==='string'&&(body[key]??'').length<=1500000,'入力は150万文字以内です。');
    ensure(['standard','sosutansaku'].includes(body.format??'standard'),'入力形式が不正です。');
    return rules.call({normal_text:body.normal_text??'',dead_text:body.dead_text??'',answer_mode:body.answer_mode,allow_57:body.allow_57,format:body.format??'standard',op:'import'});
  }
  async function insertVersion(tx,set,body,problems){
    ensure(problems.length>=1&&problems.length<=5000,'問題数は1〜5000問です。');
    const latest=await one(tx,`SELECT COALESCE(MAX(version_number),0)::integer AS n FROM ${table('quiz_versions')} WHERE quiz_set_id=$1`,[set.id]);
    const id=randomUUID(),now=Date.now();
    await tx.query(`INSERT INTO ${table('quiz_versions')}(id,quiz_set_id,version_number,answer_mode,allow_57,problem_count,contains_dead,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,set.id,latest.n+1,body.answer_mode,body.allow_57,problems.length,problems.some(p=>p.problem_kind==='CLAIMED_DEAD'),now]);
    // Batches avoid 5000 database round trips while staying below PostgreSQL parameter limits.
    for(let start=0;start<problems.length;start+=250){
      const values=[],args=[];
      for(const [i,p] of problems.slice(start,start+250).entries()){
        const fields=[randomUUID(),id,start+i,JSON.stringify(p.canonical_hand),p.canonical_hand_key,p.problem_kind,p.example_solution?JSON.stringify(p.example_solution):null];
        values.push(`(${fields.map(x=>{args.push(x);return '$'+args.length;}).join(',')})`);
      }
      await tx.query(`INSERT INTO ${table('quiz_problems')}(id,quiz_version_id,author_order,canonical_hand,canonical_hand_key,problem_kind,example_solution) VALUES ${values.join(',')}`,args);
    }
    await tx.query(`UPDATE ${table('quiz_sets')} SET current_version_id=$2,updated_at=$3 WHERE id=$1`,[set.id,id,now]);
    return {id,version_number:latest.n+1,problem_count:problems.length};
  }
  return {
    preview,
    async browse(params,user){
      const {offset,limit}=pageParams(params),args=[],where=["s.visibility='PUBLIC'","v.id IS NOT NULL"];
      const add=(sql,value)=>{args.push(value);where.push(sql.replaceAll('?',`$${args.length}`));};
      const liked=params.get('liked')||'';
      ensure(['','true','false'].includes(liked),'お気に入りの指定が不正です。');
      if(liked==='true'){
        ensure(user,'お気に入りを見るにはログインしてください。',401);
        add(`EXISTS (SELECT 1 FROM ${table('likes')} mine WHERE mine.quiz_set_id=s.id AND mine.account_id=?)`,user.id);
      }
      const q=(params.get('q')||'').trim();ensure(q.length<=120,'検索語は120文字以内です。');
      if(q)add('(s.title ILIKE ? OR s.author_name ILIKE ?)','%'+q.replace(/[\\%_]/g,'\\$&')+'%');
      if(params.get('author'))add('s.author_id=?',params.get('author'));
      if(params.get('tag'))add('s.tags @> ?::jsonb',JSON.stringify([params.get('tag')]));
      if(params.get('mode')){ensure(modes.includes(params.get('mode')),'回答条件が不正です。');add('v.answer_mode=?',params.get('mode'));}
      for(const [key,column] of [['allow_57','allow_57'],['dead','contains_dead']])if(params.has(key)&&params.get(key)!==''){ensure(['true','false'].includes(params.get(key)),'絞り込みが不正です。');add(`v.${column}=?`,params.get(key)==='true');}
      for(const [key,op] of [['min','>='],['max','<=']])if(params.get(key)){const n=Number(params.get(key));ensure(Number.isInteger(n)&&n>=1&&n<=5000,'問題数は1〜5000で指定してください。');add(`v.problem_count${op}?`,n);}
      const order={new:'s.created_at DESC',likes:'like_count DESC,s.created_at DESC',plays:'s.play_count DESC,s.created_at DESC'}[params.get('sort')||'new'];ensure(order,'並び順が不正です。');
      const base=`FROM ${table('quiz_sets')} s JOIN ${table('quiz_versions')} v ON v.id=s.current_version_id WHERE ${where.join(' AND ')}`;
      const count=await one(db,`SELECT count(*)::integer AS total ${base}`,args);
      const rows=(await db.query(`SELECT s.*,v.answer_mode,v.allow_57,v.problem_count,v.contains_dead,v.version_number,(SELECT count(*)::integer FROM ${table('likes')} l WHERE l.quiz_set_id=s.id) AS like_count ${base} ORDER BY ${order},s.id LIMIT $${args.length+1} OFFSET $${args.length+2}`,[...args,limit,offset])).rows;
      return {items:rows,total:count.total,offset,limit};
    },
    async detail(id,user){const row=await visible(db,id,user);return {...row,liked:user?!!await one(db,`SELECT 1 FROM ${table('likes')} WHERE quiz_set_id=$1 AND account_id=$2`,[id,user.id]):false};},
    async create(user,body){
      const meta=metadata(body),id=randomUUID(),now=Date.now();meta.visibility='DRAFT';
      await db.query(`INSERT INTO ${table('quiz_sets')}(id,author_id,author_name,title,description,tags,visibility,default_order,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,[id,user.id,user.name,meta.title,meta.description,JSON.stringify(meta.tags),meta.visibility,meta.default_order,now]);
      return {id};
    },
    async metadata(id,user,body){return db.transaction(async tx=>{
      const set=await owned(tx,id,user,true),meta=metadata(body);
      ensure(meta.visibility==='DRAFT'||set.current_version_id,'先に有効な問題を保存してください。');
      await tx.query(`UPDATE ${table('quiz_sets')} SET title=$2,description=$3,tags=$4,visibility=$5,default_order=$6,updated_at=$7,author_name=$8 WHERE id=$1`,[id,meta.title,meta.description,JSON.stringify(meta.tags),meta.visibility,meta.default_order,Date.now(),user.name]);return {ok:true};
    });},
    async version(id,user,body){
      await owned(db,id,user);
      const checked=await preview(body);ensure(checked.errors.length===0,'入力エラーを修正してください。');
      return db.transaction(async tx=>{const set=await owned(tx,id,user,true);ensure((body.base_version_id??null)===set.current_version_id,'別の編集でバージョンが更新されました。再読み込みしてください。',409);return {...await insertVersion(tx,set,body,checked.problems),warnings:checked.warnings};});
    },
    async authorSets(user){return {items:(await db.query(`SELECT s.*,v.version_number,v.problem_count FROM ${table('quiz_sets')} s LEFT JOIN ${table('quiz_versions')} v ON v.id=s.current_version_id WHERE author_id=$1 ORDER BY updated_at DESC`,[user.id])).rows};},
    async author(id,user,params){
      const set=await owned(db,id,user),{offset,limit}=pageParams(params);
      const versions=(await db.query(`SELECT * FROM ${table('quiz_versions')} WHERE quiz_set_id=$1 ORDER BY version_number DESC`,[id])).rows;
      const version=versions.find(v=>v.id===(params.get('version')||set.current_version_id));
      if(!version)return {set,versions,version:null,items:[],total:0,offset,limit};
      const items=(await db.query(`SELECT p.*,st.attempt_count,st.correct_count,st.dead_choice_count,d.solution AS counterexample FROM ${table('quiz_problems')} p LEFT JOIN ${table('problem_stats')} st ON st.problem_id=p.id LEFT JOIN ${table('dead_problem_disputes')} d ON d.problem_id=p.id WHERE p.quiz_version_id=$1 ORDER BY p.author_order LIMIT $2 OFFSET $3`,[version.id,limit,offset])).rows;
      const disputed=(await db.query(`SELECT p.id,p.canonical_hand,d.solution AS counterexample FROM ${table('quiz_problems')} p JOIN ${table('dead_problem_disputes')} d ON d.problem_id=p.id WHERE p.quiz_version_id=$1 ORDER BY p.author_order LIMIT 100`,[version.id])).rows;
      return {set,versions,version,items,disputed,total:version.problem_count,offset,limit};
    },
    async authorSource(id,user){
      const set=await owned(db,id,user);
      const problems=(await db.query(`SELECT canonical_hand,problem_kind,example_solution FROM ${table('quiz_problems')} WHERE quiz_version_id=$1 ORDER BY author_order`,[set.current_version_id])).rows;
      return {base_version_id:set.current_version_id,normal_text:problems.filter(p=>p.problem_kind==='NORMAL').map(p=>p.example_solution.notation).join('\n'),dead_text:problems.filter(p=>p.problem_kind==='CLAIMED_DEAD').map(p=>p.canonical_hand.map(n=>({1:'A',10:'T',11:'J',12:'Q',13:'K'}[n]||n)).join('')).join('\n')};
    },
    async correctDispute(id,problemId,user){
      const snapshot=await owned(db,id,user);
      const evidence=await one(db,`SELECT p.canonical_hand,p.canonical_hand_key,d.solution FROM ${table('quiz_problems')} p JOIN ${table('quiz_versions')} v ON v.id=p.quiz_version_id JOIN ${table('dead_problem_disputes')} d ON d.problem_id=p.id WHERE p.id=$1 AND v.quiz_set_id=$2`,[problemId,id]);
      ensure(evidence,'保存された合法手が見つかりません。',404);
      const version=await one(db,`SELECT * FROM ${table('quiz_versions')} WHERE id=$1`,[snapshot.current_version_id]);
      const checked=await rules.call({op:'validate',solution:evidence.solution.notation,hand:evidence.canonical_hand,answer_mode:version.answer_mode,allow_57:version.allow_57});
      ensure(checked.legal,'発見された手は現行版の条件では使えません。',409);
      return db.transaction(async tx=>{
        const set=await owned(tx,id,user,true);ensure(set.current_version_id===snapshot.current_version_id,'別の編集で更新されました。再読み込みしてください。',409);
        const problems=(await tx.query(`SELECT * FROM ${table('quiz_problems')} WHERE quiz_version_id=$1 ORDER BY author_order`,[set.current_version_id])).rows;
        const problem=problems.find(p=>p.canonical_hand_key===evidence.canonical_hand_key);ensure(problem?.problem_kind==='CLAIMED_DEAD','現行版に修正対象の詰み問題がありません。',409);
        problem.problem_kind='NORMAL';problem.example_solution=checked.solution;
        return insertVersion(tx,set,version,problems);
      });
    },
    async start(id,user,body){return db.transaction(async tx=>{
      const set=await visible(tx,id,user);ensure(set.current_version_id,'問題がまだありません。');ensure(body.shuffle===undefined||typeof body.shuffle==='boolean','シャッフル指定が不正です。');
      const rows=(await tx.query(`SELECT id,canonical_hand_key,author_order FROM ${table('quiz_problems')} WHERE quiz_version_id=$1 ORDER BY ${set.default_order==='HAND_LEXICOGRAPHIC'?'canonical_hand_key COLLATE "C"':'author_order'}`,[set.current_version_id])).rows;
      const seed=body.shuffle?randomBytes(16).toString('hex'):null;
      if(seed)rows.sort((a,b)=>digest(seed+a.id).localeCompare(digest(seed+b.id)));
      const sessionId=randomUUID(),secret=randomBytes(32).toString('hex');
      await tx.query(`INSERT INTO ${table('quiz_sessions')}(id,token_hash,quiz_set_id,quiz_version_id,account_id,total_problem_count,started_at,shuffle_seed,problem_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[sessionId,digest(secret),id,set.current_version_id,user?.id??null,set.problem_count,Date.now(),seed,JSON.stringify(rows.map(x=>x.id))]);
      return {id:sessionId,token:secret};
    });},
    async restore(id,user,secret,params){
      const row=await session(db,id,user,secret,false,true),{offset,limit}=pageParams(params);
      const version=await one(db,`SELECT answer_mode,allow_57,version_number,contains_dead FROM ${table('quiz_versions')} WHERE id=$1`,[row.quiz_version_id]);
      const set=await one(db,`SELECT title FROM ${table('quiz_sets')} WHERE id=$1`,[row.quiz_set_id]);
      const ids=row.problem_order.slice(offset,offset+limit);
      const items=ids.length?(await db.query(`SELECT p.id,p.canonical_hand AS hand,a.score,a.correct,a.dead_choice FROM ${table('quiz_problems')} p LEFT JOIN ${table('attempts')} a ON a.problem_id=p.id AND a.session_id=$1 WHERE p.id=ANY($2::text[])`,[id,ids])).rows:[];
      items.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
      return {session:summary(row),title:set.title,rules:version,items:items.map((p,i)=>({id:p.id,hand:p.hand,order:offset+i,attempt:p.score===null?null:{score:p.score,correct:p.correct,dead_choice:p.dead_choice}})),offset,limit};
    },
    async attempt(id,user,secret,body){
      ensure(typeof body.problem_id==='string'&&typeof body.request_id==='string'&&/^[a-zA-Z0-9-]{16,64}$/.test(body.request_id),'回答IDが不正です。');
      ensure(['move','dead'].includes(body.kind),'回答種別が不正です。');
      ensure(body.kind==='dead'||(typeof body.solution==='string'&&body.solution.length<=512),'回答は512文字以内です。');
      const answer={kind:body.kind,...(body.kind==='move'?{solution:body.solution}:{})},hash=digest(JSON.stringify(answer));
      // Validate before the DB lock; recheck status, ownership and uniqueness inside it.
      const initial=await session(db,id,user,secret);
      const problem=await one(db,`SELECT * FROM ${table('quiz_problems')} WHERE id=$1 AND quiz_version_id=$2`,[body.problem_id,initial.quiz_version_id]);ensure(problem,'対象外の問題です。',404);
      const version=await one(db,`SELECT answer_mode,allow_57 FROM ${table('quiz_versions')} WHERE id=$1`,[initial.quiz_version_id]);
      const judged=body.kind==='move'?await rules.call({op:'validate',hand:problem.canonical_hand,solution:body.solution,...version}):{legal:false};
      return db.transaction(async tx=>{
        const row=await session(tx,id,user,secret,true);
        const prior=await one(tx,`SELECT * FROM ${table('attempts')} WHERE session_id=$1 AND (problem_id=$2 OR request_id=$3)`,[id,body.problem_id,body.request_id]);
        if(prior){ensure(prior.problem_id===body.problem_id&&prior.request_id===body.request_id&&prior.request_hash===hash,'この問題にはすでに回答済みです。',409);return {score:prior.score,correct:prior.correct,session:summary(row),replayed:true};}
        ensure(row.status==='ACTIVE','このセッションは終了しています。',409);
        const deadChoice=body.kind==='dead',claimed=problem.problem_kind==='CLAIMED_DEAD',legal=judged.legal===true;
        const correct=deadChoice?claimed:legal,score=correct?1:claimed?-1:0,now=Date.now();
        await tx.query(`INSERT INTO ${table('attempts')}(session_id,problem_id,request_id,request_hash,answer,score,correct,dead_choice,legal_move,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,problem.id,body.request_id,hash,JSON.stringify(answer),score,correct,deadChoice,legal,now]);
        const updated=await one(tx,`UPDATE ${table('quiz_sessions')} SET score=score+$2,correct_count=correct_count+$3,wrong_count=wrong_count+$4,dead_choice_count=dead_choice_count+$5,attempted_count=attempted_count+1,first_attempt_at=COALESCE(first_attempt_at,$6),counted_as_play=true,status=CASE WHEN attempted_count+1=total_problem_count THEN 'ENDED' ELSE status END,ended_at=CASE WHEN attempted_count+1=total_problem_count THEN $6 ELSE ended_at END WHERE id=$1 RETURNING ${sessionColumns}`,[id,score,+correct,+!correct,+deadChoice,now]);
        await tx.query(`INSERT INTO ${table('problem_stats')}(problem_id,attempt_count,correct_count,wrong_count,dead_choice_count,legal_move_count,invalid_move_count,counterexample_count) VALUES($1,1,$2,$3,$4,$5,$6,$7) ON CONFLICT(problem_id) DO UPDATE SET attempt_count=problem_stats.attempt_count+1,correct_count=problem_stats.correct_count+$2,wrong_count=problem_stats.wrong_count+$3,dead_choice_count=problem_stats.dead_choice_count+$4,legal_move_count=problem_stats.legal_move_count+$5,invalid_move_count=problem_stats.invalid_move_count+$6,counterexample_count=problem_stats.counterexample_count+$7`,[problem.id,+correct,+!correct,+deadChoice,+legal,+(!deadChoice&&!legal),+(claimed&&legal)]);
        if(!row.counted_as_play)await tx.query(`UPDATE ${table('quiz_sets')} SET play_count=play_count+1 WHERE id=$1`,[row.quiz_set_id]);
        if(claimed&&legal){
          await tx.query(`UPDATE ${table('quiz_problems')} SET disputed=true WHERE id=$1`,[problem.id]);
          await tx.query(`INSERT INTO ${table('dead_problem_disputes')}(problem_id,session_id,solution,created_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[problem.id,id,JSON.stringify(judged.solution),now]);
        }
        return {score,correct,session:summary(updated),replayed:false};
      });
    },
    async end(id,user,secret){return db.transaction(async tx=>{
      const row=await session(tx,id,user,secret,true);
      if(row.status==='ACTIVE'){row.status='ENDED';row.ended_at=Date.now();await tx.query(`UPDATE ${table('quiz_sessions')} SET status='ENDED',ended_at=$2 WHERE id=$1`,[id,row.ended_at]);}
      return {session:summary(row)};
    });},
    async result(id,user,secret,params){
      const row=await session(db,id,user,secret,false,true);ensure(row.status==='ENDED','終了後に解答を公開します。',409);
      const {offset,limit}=pageParams(params),ids=row.problem_order.slice(offset,offset+limit);
      const items=ids.length?(await db.query(`SELECT p.id,p.canonical_hand AS hand,p.problem_kind,p.example_solution,p.disputed,a.score,a.correct,a.answer,st.attempt_count,st.correct_count,st.dead_choice_count,d.solution AS counterexample FROM ${table('quiz_problems')} p LEFT JOIN ${table('attempts')} a ON a.problem_id=p.id AND a.session_id=$1 LEFT JOIN ${table('problem_stats')} st ON st.problem_id=p.id LEFT JOIN ${table('dead_problem_disputes')} d ON d.problem_id=p.id WHERE p.id=ANY($2::text[])`,[id,ids])).rows:[];
      items.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
      return {session:summary(row),items:items.map((x,i)=>({...x,order:offset+i})),offset,limit};
    },
    async like(id,user,liked){ensure(typeof liked==='boolean','高評価の指定が不正です。');return db.transaction(async tx=>{
      await visible(tx,id,user);
      if(liked){ensure(await one(tx,`SELECT 1 FROM ${table('quiz_sessions')} WHERE quiz_set_id=$1 AND account_id=$2 AND first_attempt_at IS NOT NULL LIMIT 1`,[id,user.id]),'高評価はログインして1問以上回答した後にできます。',403);await tx.query(`INSERT INTO ${table('likes')}(account_id,quiz_set_id,created_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[user.id,id,Date.now()]);}
      else await tx.query(`DELETE FROM ${table('likes')} WHERE account_id=$1 AND quiz_set_id=$2`,[user.id,id]);return {liked};
    });},
    async history(user,params){const {offset,limit}=pageParams(params);const items=(await db.query(`SELECT ${sessionColumns.split(',').map(x=>'q.'+x).join(',')},s.title,v.version_number FROM ${table('quiz_sessions')} q JOIN ${table('quiz_sets')} s ON s.id=q.quiz_set_id JOIN ${table('quiz_versions')} v ON v.id=q.quiz_version_id WHERE q.account_id=$1 ORDER BY q.started_at DESC LIMIT $2 OFFSET $3`,[user.id,limit,offset])).rows;const count=await one(db,`SELECT count(*)::integer AS total FROM ${table('quiz_sessions')} WHERE account_id=$1`,[user.id]);return {items:items.map(x=>({...summary(x),title:x.title,version_number:x.version_number})),total:count.total,offset,limit};}
  };
}
