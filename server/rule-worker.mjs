import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function pythonExecutable() {
  if(process.env.PYTHON_BIN)return process.env.PYTHON_BIN;
  const bundled=`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`;
  return process.platform==='win32'&&existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3';
}
export class RuleWorker {
  constructor(){this.queue=Promise.resolve();this.pending=null;this.child=null;this.closed=false;this.queued=0;}
  start(){
    if(this.closed)throw new Error('Rule worker closed');
    const child=spawn(pythonExecutable(),['-u',fileURLToPath(new URL('./domain.py',import.meta.url))],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    this.child=child;
    createInterface({input:child.stdout}).on('line',line=>{if(this.child!==child)return;try{this.pending?.resolve(JSON.parse(line));}catch{this.pending?.reject(new Error('Invalid rule worker response'));}this.pending=null;});
    child.stderr.on('data',()=>{});
    const failed=()=>{if(this.child===child){this.child=null;this.pending?.reject(new Error('ルール判定が中断されました。回答は確定していません。'));this.pending=null;}};
    child.on('error',failed);child.on('exit',failed);
  }
  call(payload){
    if(this.queued>=12)return Promise.reject(Object.assign(new Error('判定が混み合っています。少し待って再送してください。'),{status:503}));
    this.queued++;
    const job=this.queue.then(async()=>{
      if(!this.child)this.start();
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.pending=null;this.child?.kill();this.child=null;reject(Object.assign(new Error('判定が時間切れになりました。回答は確定していません。'),{status:503}));},60000);
        this.pending={resolve:r=>{clearTimeout(timer);if(r.worker_error)reject(Object.assign(new Error('ルール判定に失敗しました。回答は確定していません。'),{status:503}));else resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}};
        this.child.stdin.write(JSON.stringify(payload)+'\n',error=>{if(error)this.pending?.reject(error);});
      });
    });
    this.queue=job.catch(()=>{}).finally(()=>this.queued--);return job;
  }
  async close(){await this.queue;this.closed=true;this.child?.kill();this.child=null;}
}
