// Orders refer to the session's fixed order, including when it was shuffled.
export function syncQuestionQueue(local,items,total){
  local.skips??=[];
  if(!Array.isArray(local.questionQueue)){
    // Older saved sessions resume from their current question before wrapping.
    const start=Number.isInteger(local.index)&&local.index>=0&&local.index<total?local.index:0;
    local.questionQueue=Array.from({length:total},(_,i)=>(start+i)%total);
  }
  const answered=new Set(items.filter(p=>p.attempt).map(p=>p.order));
  const answeredIds=new Set(items.filter(p=>p.attempt).map(p=>p.id));
  local.questionQueue=[...new Set(local.questionQueue)].filter(order=>Number.isInteger(order)&&order>=0&&order<total&&!answered.has(order));
  local.skips=local.skips.filter(id=>!answeredIds.has(id));
}

export function nextQueuedQuestion(local,problem){
  local.questionQueue=local.questionQueue.filter(order=>order!==problem.order);
  local.skips=local.skips.filter(id=>id!==problem.id);
  if(!problem.attempt){
    local.questionQueue.push(problem.order);
    local.skips.push(problem.id);
  }
  return local.questionQueue[0];
}
