import {test} from 'node:test';
import assert from 'node:assert/strict';
import {syncQuestionQueue,nextQueuedQuestion} from '../src/question-queue.mjs';

const question=(order,answered=false)=>({id:`problem-${order}`,order,attempt:answered?{score:1,correct:true}:null});

test('first pass visits every question before skipped questions, then re-skips go to the tail',()=>{
  const local={index:0,skips:[]};syncQuestionQueue(local,[],5);
  assert.equal(nextQueuedQuestion(local,question(0)),1);
  assert.equal(nextQueuedQuestion(local,question(1,true)),2);
  assert.equal(nextQueuedQuestion(local,question(2)),3);
  assert.equal(nextQueuedQuestion(local,question(3,true)),4);
  assert.equal(nextQueuedQuestion(local,question(4,true)),0);
  assert.deepEqual(local.questionQueue,[0,2]);
  assert.equal(nextQueuedQuestion(local,question(0)),2);
  assert.deepEqual(local.questionQueue,[2,0]);
  assert.equal(nextQueuedQuestion(local,question(2,true)),0);
  assert.equal(nextQueuedQuestion(local,question(0,true)),undefined);
  assert.deepEqual(local.skips,[]);
});

test('queue order survives reload and answers made through the list are removed',()=>{
  let local={index:0};syncQuestionQueue(local,[],4);
  nextQueuedQuestion(local,question(0));nextQueuedQuestion(local,question(1));
  local=JSON.parse(JSON.stringify(local));syncQuestionQueue(local,[question(1,true),question(3,true)],4);
  assert.deepEqual(local.questionQueue,[2,0]);assert.deepEqual(local.skips,['problem-0']);
  assert.equal(nextQueuedQuestion(local,question(2)),0);
  assert.equal(nextQueuedQuestion(local,question(0)),2);
});

test('legacy sessions resume at their current position and prune answers as pages load',()=>{
  const local={index:4999,skips:['problem-0','problem-2']};
  syncQuestionQueue(local,[question(4999,true)],5000);
  assert.equal(local.questionQueue[0],0);
  syncQuestionQueue(local,Array.from({length:50},(_,i)=>question(i,i!==2)),5000);
  assert.equal(local.questionQueue[0],2);assert.deepEqual(local.skips,['problem-2']);
  assert.equal(local.questionQueue.length,4950);
});

test('a single remaining question can be skipped repeatedly without duplicates',()=>{
  const local={index:0};syncQuestionQueue(local,[],1);
  for(let i=0;i<3;i++)assert.equal(nextQueuedQuestion(local,question(0)),0);
  assert.deepEqual(local.questionQueue,[0]);assert.deepEqual(local.skips,['problem-0']);
  syncQuestionQueue(local,[question(0,true)],1);
  assert.deepEqual(local.questionQueue,[]);assert.deepEqual(local.skips,[]);
});
