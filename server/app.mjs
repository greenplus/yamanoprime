import {createServer} from 'node:http';
import {makeService,RequestError,ensure,digest} from './service.mjs';
export function createApp({db,rules,origins=[],authenticate,authAvailable=true,trustProxy=false,rateLimit=true}){
  const service=makeService({db,rules}),buckets=new Map();
  async function identify(req,required=false){
    const header=req.headers.authorization;
    if(!header){ensure(!required,'共通アカウントでログインしてください。',401);return null;}
    ensure(/^Bearer [a-f0-9]{64}$/.test(header),'認証トークンが不正です。',401);
    const token=header.slice(7);
    const user=authenticate?await authenticate(token):(await db.authQuery('SELECT p.id,p.name FROM factoring_esports.players p JOIN factoring_esports.sessions s ON p.id=s.player_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND p.login_id IS NOT NULL',[digest(token),Date.now()])).rows[0];
    ensure(user,'ログインの有効期限が切れました。',401);return {id:String(user.id),name:user.name};
  }
  function limit(req,path){
    if(!rateLimit)return;
    const ip=trustProxy?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
    const now=Date.now();
    for(const [key,b] of buckets)if(b.until<=now)buckets.delete(key);
    const kind=path==='/api/sessions'?'start':path.includes('/versions')||path==='/api/import-preview'?'import':'all';
    for(const [suffix,max] of [['all',360],...(kind==='all'?[]:[[kind,kind==='start'?20:12]])]){
      const key=ip+':'+suffix,b=buckets.get(key)||{count:0,until:now+60000};
      ensure(++b.count<=max,'操作が多すぎます。1分ほど待って再試行してください。',429);buckets.set(key,b);
    }
  }
  async function body(req){
    ensure(req.headers['content-type']?.split(';')[0]==='application/json','JSONで送信してください。',415);
    let length=0;const chunks=[];
    for await(const chunk of req){length+=chunk.length;ensure(length<=2*1024*1024,'送信内容は2MBまでです。',413);chunks.push(chunk);}
    let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RequestError('JSONの形式が不正です。');}
    ensure(value&&typeof value==='object'&&!Array.isArray(value),'オブジェクトを送信してください。');return value;
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
    const send=(status,data)=>{if(!res.headersSent){res.writeHead(status);res.end(status===204?undefined:JSON.stringify(data));}};
    try{
      const origin=req.headers.origin;ensure(!origin||origins.includes(origin),'許可されていない接続元です。',403);
      if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
      if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,X-Session-Token');return send(204);}
      const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
      limit(req,path);
      if(path==='/api/health'&&method==='GET'){
        await db.query('SELECT 1');if(authAvailable&&!authenticate)await db.authQuery('SELECT p.id,s.token_hash FROM factoring_esports.players p JOIN factoring_esports.sessions s ON p.id=s.player_id WHERE false');
        return send(200,{ok:true,authAvailable,version:'0.1.0'});
      }
      const user=await identify(req),secret=req.headers['x-session-token'],params=url.searchParams;
      const auth=()=>{ensure(user,'共通アカウントでログインしてください。',401);return user;};
      let result;
      if(path==='/api/me'&&method==='GET')result={user:auth()};
      else if(path==='/api/sets'&&method==='GET')result=await service.browse(params,user);
      else if(path==='/api/sets'&&method==='POST')result=await service.create(auth(),await body(req));
      else if(path==='/api/my/sets'&&method==='GET')result=await service.authorSets(auth());
      else if(path==='/api/my/history'&&method==='GET')result=await service.history(auth(),params);
      else if(path==='/api/import-preview'&&method==='POST'){
        auth();const checked=await service.preview(await body(req));
        result={...checked,problems:checked.problems.slice(0,50),total:checked.problems.length};
      }
      else if(path==='/api/sessions'&&method==='POST'){const b=await body(req);result=await service.start(b.quiz_set_id,user,b);}
      else {
        const set=path.match(/^\/api\/sets\/([a-zA-Z0-9-]+)(?:\/(versions|author|source|like|corrections))?$/);
        const session=path.match(/^\/api\/sessions\/([a-zA-Z0-9-]+)(?:\/(attempts|end|results))?$/);
        if(set){
          const [,id,action]=set;
          if(!action&&method==='GET')result=await service.detail(id,user);
          else if(!action&&method==='PATCH')result=await service.metadata(id,auth(),await body(req));
          else if(action==='versions'&&method==='POST')result=await service.version(id,auth(),await body(req));
          else if(action==='author'&&method==='GET')result=await service.author(id,auth(),params);
          else if(action==='source'&&method==='GET')result=await service.authorSource(id,auth());
          else if(action==='like'&&method==='POST')result=await service.like(id,auth(),(await body(req)).liked);
          else if(action==='corrections'&&method==='POST')result=await service.correctDispute(id,(await body(req)).problem_id,auth());
          else throw new RequestError('操作方法が不正です。',405);
        }else if(session){
          const [,id,action]=session;
          if(!action&&method==='GET')result=await service.restore(id,user,secret,params);
          else if(action==='attempts'&&method==='POST')result=await service.attempt(id,user,secret,await body(req));
          else if(action==='end'&&method==='POST')result=await service.end(id,user,secret);
          else if(action==='results'&&method==='GET')result=await service.result(id,user,secret,params);
          else throw new RequestError('操作方法が不正です。',405);
        }else throw new RequestError('ページが見つかりません。',404);
      }
      send(200,result);
    }catch(error){
      if(error.status===429)res.setHeader('Retry-After','60');
      if(!error.status)console.error('request-failed',error.name,error.code||'');
      send(error.status||500,{error:error.status?error.message:'処理を完了できませんでした。回答状態を確認して再試行してください。'});
    }
  });
  server.requestTimeout=70000;server.headersTimeout=15000;
  return server;
}
