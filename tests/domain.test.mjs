import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {RuleWorker} from '../server/rule-worker.mjs';
import {emptyDraft,selectCard,playCut,usedIds,solutionNotation} from '../src/play-state.mjs';
const rules=new RuleWorker();after(()=>rules.close());
const validate=(solution,hand,answer_mode='PRIME_ONLY',allow_57=false)=>rules.call({op:'validate',solution,hand,answer_mode,allow_57});
const preview=(normal_text,dead_text='',options={})=>rules.call({op:'import',normal_text,dead_text,answer_mode:'BOTH',allow_57:true,...options});
test('author answer and different legal arrangement both pass',async()=>{for(const text of ['1117','1171'])assert.equal((await validate(text,[1,1,1,7])).legal,true);assert.equal((await validate('1711',[1,1,1,7])).legal,false);});
test('1729 is special in prime and BOTH, not composite-only',async()=>{assert.equal((await validate('1729',[1,2,7,9])).legal,true);assert.equal((await validate('1729',[1,2,7,9],'BOTH')).legal,true);assert.equal((await validate('1729',[1,2,7,9],'COMPOSITE_ONLY')).legal,false);});
test('57 one/multiple/only/suffix, with full physical consumption',async()=>{
  for(const [text,hand] of [['57,113',[1,1,3,5,7]],['57,57,113',[1,1,3,5,5,7,7]],['57',[5,7]],['57,57',[5,5,7,7]],['113,57',[1,1,3,5,7]]])assert.equal((await validate(text,hand,'PRIME_ONLY',true)).legal,true,text);
  assert.equal((await validate('57,113',[1,1,3,5,7])).legal,false);
  assert.equal((await validate('57',[5,7],'COMPOSITE_ONLY',true)).legal,false);
  assert.equal((await validate('57,9=3^2',[2,3,5,7,9],'COMPOSITE_ONLY',true)).legal,true);
  assert.equal((await validate('113',[1,1,3,5,7],'BOTH',true)).legal,false);
});
test('upstream composite legality includes separate materials and exponent grammar',async()=>{
  for(const [text,hand] of [['9=3^2',[2,3,9]],['256=2^8',[2,2,5,6,8]],['6=2*3',[2,3,6]]])assert.equal((await validate(text,hand,'COMPOSITE_ONLY')).legal,true,text);
  for(const [text,hand] of [['9',[9]],['9=9',[9,9]],['9=3*2',[2,3,9]],['9=3^1',[1,3,9]],['12=6*2',[1,2,2,6]],['4=2*2',[2,4]]])assert.equal((await validate(text,hand,'COMPOSITE_ONLY')).legal,false,text);
  assert.equal((await validate('9=3^2',[2,3,9])).legal,false);
  assert.equal((await validate('113',[1,1,3],'COMPOSITE_ONLY')).legal,false);
});
test('physical-card bounds, X/0 excluded, multiple final moves rejected',async()=>{
  for(const text of ['11111','X','0','113,127','2^1^123456789'])assert.equal((await preview(text)).errors.length,1,text);
});
test('duplicate hands warn; contradictory problem kinds block publication; line numbers survive blanks',async()=>{
  let r=await preview('1117\n\n1171\n4');assert.equal(r.problems.length,1);assert.equal(r.warnings[0].line,3);assert.equal(r.errors[0].line,4);
  r=await preview('113','131');assert.equal(r.errors[0].section,'dead');assert.match(r.errors[0].reason,/通常問題と詰み/);
  assert.equal((await preview(Array(5001).fill('113').join('\n'))).errors.length,1);
});
test('provided 素数探索 examples convert rank tokens, retain plain primes and optional 57',async()=>{
  const input='123j, [13,*,9,4,7]\n3k21\n4521, [3,*,11,*,13,7]\n4251, [3,*,13,*,10,9]\n6421\n4721\n9421\n4291, [7,*,6,13]\n42t1\n24t1, [7,*,11,*,3,13]\n42k1\n4q21\n6521\n8521\n9521\n5291, [11,*,13,*,3,7]\n25j1\n2k51, [3,*,11,*,6,4,7]';
  const result=await preview(input,'',{format:'sosutansaku'});assert.deepEqual(result.errors,[]);assert.equal(result.problems.length,18);
  assert.ok(result.problems.some(p=>p.example_solution.notation==='2K51=3*J*647'));
  assert.ok(result.problems.some(p=>p.example_solution.notation==='8521'));
  const suffix=await preview('8521,57','',{format:'sosutansaku'});assert.equal(suffix.problems[0].example_solution.notation,'57,8521');
});
test('57 reset and UI card allocation preserve all physical cards without submitting',()=>{
  let d=emptyDraft();selectCard(d,0);selectCard(d,1);assert.equal(playCut([5,7,1,1,3],d,true),true);assert.equal(d.cuts.length,1);assert.equal(usedIds(d).size,2);d=emptyDraft();assert.equal(usedIds(d).size,0);
  selectCard(d,0);assert.equal(selectCard(d,0),false);d.composite=true;assert.equal(selectCard(d,0),false);selectCard(d,2);assert.equal(solutionNotation([5,7,1,1,3],d),'5=A');
});
