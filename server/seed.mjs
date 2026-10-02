import {makeService} from './service.mjs';
export async function seedDemo(db,rules){
  if((await db.query("SELECT 1 FROM yamano_prime.quiz_sets WHERE author_id='yamano-demo' LIMIT 1")).rows.length)return;
  const service=makeService({db,rules}),user={id:'yamano-demo',name:'YamanoPrime'};
  const sets=[
    {title:'はじめの一手。4枚から見つけよう',description:'まずは5問から。数字を入れ替えると、別の素数が見つかるかもしれません。',tags:['入門','4枚出し'],answer_mode:'PRIME_ONLY',allow_57:false,normal_text:'1117\n1129\n1447\n1451\n1481',dead_text:''},
    {title:'57から、もう一手。',description:'57を出して、残った手札で上がろう。57を何度も使う手札もあります。',tags:['57','特殊出し'],answer_mode:'PRIME_ONLY',allow_57:true,normal_text:'57,113\n57,57,113\n57\n57,57\n1729',dead_text:''},
    {title:'かけ算で使い切る、合成数入門',description:'見せ札と素因数の材料を分けて考える4問。合成数出しボタンから、材料札を選んでみよう。',tags:['合成数','入門'],answer_mode:'COMPOSITE_ONLY',allow_57:false,normal_text:'9=3^2\n6=2*3\n4=2^2\n256=2^8',dead_text:''},
    {title:'上がれる？ それとも詰み？',description:'解がある手札と、作者が詰みとして登録した手札が混ざっています。最後までよく考えて。',tags:['詰み','見極め'],answer_mode:'BOTH',allow_57:false,normal_text:'113\n9=3^2\n1729',dead_text:'22\n44\n88'},
  ];
  for(const s of sets){const {id}=await service.create(user,s);await service.version(id,user,{...s,base_version_id:null});await service.metadata(id,user,{...s,visibility:'PUBLIC',default_order:'HAND_LEXICOGRAPHIC'});}
}
