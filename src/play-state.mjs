export const label=n=>({1:'A',10:'T',11:'J',12:'Q',13:'K'}[n]||String(n));
export const emptyDraft=()=>({selected:[],tokens:[],cuts:[],composite:false});
export function usedIds(draft){return new Set([...draft.selected,...draft.tokens.filter(x=>x.kind==='card').map(x=>x.card_id),...draft.cuts.flatMap(x=>x.ids)]);}
export function selectCard(draft,index){
  if(usedIds(draft).has(index))return false;
  if(draft.composite)draft.tokens.push({kind:'card',card_id:index});else draft.selected.push(index);
  return true;
}
export function appendOperator(draft,op){
  if(!draft.composite||draft.tokens.at(-1)?.kind!=='card'||!['×','^'].includes(op))return false;
  draft.tokens.push({kind:'op',op});return true;
}
export function currentNotation(hand,draft){
  const visible=draft.selected.map(i=>label(hand[i])).join('');
  const expression=draft.tokens.map(t=>t.kind==='op'?(t.op==='×'?'*':t.op):label(hand[t.card_id])).join('');
  return visible+(draft.composite?'='+expression:'');
}
export function solutionNotation(hand,draft){return [...draft.cuts.map(x=>x.notation),currentNotation(hand,draft)].filter(Boolean).join(',');}
export function playCut(hand,draft,allow57){
  if(!allow57||draft.composite||draft.selected.map(i=>hand[i]).join('')!=='57')return false;
  draft.cuts.push({ids:[...draft.selected],notation:'57'});draft.selected=[];return true;
}
