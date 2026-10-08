/* 共用数据模型；保留备份版本和原有数据字段。 */
(function () {
'use strict';
const uid=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const blank=()=>({version:2,directories:[],articles:[]});
function migrateV1(old){
  const next=blank(),dims=old.dims||{},find=(key,id)=>(dims[key]||[]).find(v=>v.id===id)?.name||'';
  function make(names){let parent='',id='';for(const name of names){if(!name)continue;
    let node=next.directories.find(v=>v.parent===parent&&v.name===name);
    if(!node){node={id:uid(),name,parent};next.directories.push(node);}
    id=node.id;parent=id;
  }return id;}
  for(const s of dims.src||[])make([s.name]);
  for(const article of old.articles||[]){
    const src=find('src',article.src),big=find('big',article.big);
    const firstTopic=Array.isArray(article.topic)?article.topic[0]:article.topic;
    const topic=find('topic',firstTopic);
    const path=src||big||topic?[src||'未分类',big||(topic?'其他':''),topic]:[];
    next.articles.push({...article,id:article.id||uid(),title:String(article.title||''),body:String(article.body||''),dir:make(path)});
  }
  // Preserve unused old primary categories in the new tree as well.
  if((dims.big||[]).length){const other='未分类';for(const b of dims.big)make([other,b.name]);}
  for(const t of dims.topic||[]){const big=Object.entries(old.topicOfBig||{}).find(([,arr])=>arr?.includes(t.name))?.[0]||'其他';make(['未分类',big,t.name]);}
  return next;
}
function valid(input){
  if(input?.version===1&&Array.isArray(input.articles)&&input.dims)return migrateV1(input);
  if(input?.version!==2||!Array.isArray(input.directories)||!Array.isArray(input.articles))throw Error('文件不是文稿编辑器备份');
  const ids=new Set();for(const d of input.directories){if(!d||typeof d.id!=='string'||typeof d.name!=='string'||typeof d.parent!=='string'||ids.has(d.id))throw Error('目录数据有误');ids.add(d.id);}
  for(const d of input.directories)if(d.parent&&!ids.has(d.parent))throw Error('目录引用缺失');
  const map=new Map(input.directories.map(d=>[d.id,d]));for(const d of input.directories){let p=d,seen=new Set();while(p){if(seen.has(p.id))throw Error('目录存在循环');seen.add(p.id);if(seen.size>3)throw Error('目录不能超过三级');p=map.get(p.parent);}}
  const articles=new Set();for(const a of input.articles){if(!a||typeof a.id!=='string'||typeof a.title!=='string'||typeof a.body!=='string'||articles.has(a.id))throw Error('文稿数据有误');articles.add(a.id);if(a.dir&&!ids.has(a.dir))throw Error('文稿目录不存在');}
  return input;
}
window.EditorModel=Object.freeze({uid,blank,valid});
})();
