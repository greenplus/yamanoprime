import pg from 'pg';
import fs from 'node:fs/promises';
export async function openDatabase(env=process.env) {
  const schema=await fs.readFile(new URL('./schema.sql',import.meta.url),'utf8');
  if(env.LOCAL_DATABASE) {
    if(env.NODE_ENV==='production')throw new Error('LOCAL_DATABASE cannot be used in production');
    const {PGlite}=await import('@electric-sql/pglite');
    if(env.LOCAL_DATABASE!=='memory')await fs.mkdir(env.LOCAL_DATABASE,{recursive:true});
    const db=new PGlite(env.LOCAL_DATABASE==='memory'?undefined:env.LOCAL_DATABASE);
    await db.exec(schema);
    let tail=Promise.resolve();
    const serial=fn=>{const job=tail.then(fn);tail=job.catch(()=>{});return job;};
    return {query:(...args)=>serial(()=>db.query(...args)),authQuery:async()=>({rows:[]}),
      transaction:fn=>serial(()=>db.transaction(fn)),close:()=>serial(()=>db.close())};
  }
  if(!env.DATABASE_URL)throw new Error('DATABASE_URL or LOCAL_DATABASE is required');
  const pool=new pg.Pool({connectionString:env.DATABASE_URL,max:8,options:'-c statement_timeout=15000 -c idle_in_transaction_session_timeout=15000'});
  const authPool=new pg.Pool({connectionString:env.AUTH_DATABASE_URL||env.DATABASE_URL,max:3,options:'-c default_transaction_read_only=on -c statement_timeout=10000'});
  await pool.query(schema);
  return {query:(...args)=>pool.query(...args),authQuery:(...args)=>authPool.query(...args),
    async transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}},
    async close(){await Promise.all([pool.end(),authPool.end()]);}};
}
