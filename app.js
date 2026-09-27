'use strict';
// Data is private to this browser and this GitHub Pages project path.
const STORAGE='wengao-blank-editor-v1:'+location.pathname.split('/')[1];
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const blank=()=>({version:2,directories:[],articles:[]});
let data=blank(),selected='',expanded=new Set(),query='',currentId=null,initialEditor='',toastTimer,editorCloseTimer;

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
try{const saved=localStorage.getItem(STORAGE);if(saved){const parsed=JSON.parse(saved);data=valid(parsed);if(parsed.version===1)localStorage.setItem(STORAGE,JSON.stringify(data));}}
catch(error){alert('本机数据读取失败：'+error.message);}
function persist(change,fromCloud=false){const before=JSON.stringify(data);change();try{localStorage.setItem(STORAGE,JSON.stringify(data));
    if(!fromCloud)window.EditorBridge?.onLocalChanged?.();return true;}
  catch(error){data=JSON.parse(before);alert('保存失败，请先导出备份并检查浏览器存储空间：'+error.message);return false;}}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
const folder=id=>data.directories.find(d=>d.id===id);
const children=parent=>data.directories.filter(d=>d.parent===parent);
function depth(id){let d=folder(id),n=0;while(d){n++;d=folder(d.parent);if(n>3)break;}return n;}
function descendants(id){const ids=new Set([id]),stack=[id];while(stack.length){const parent=stack.pop();for(const d of children(parent))if(!ids.has(d.id)){ids.add(d.id);stack.push(d.id);}}return ids;}
function dirName(id){return folder(id)?.name||'未分类';}
function closeDrawer(){$('#sidebar').classList.remove('open');$('#drawerShade').hidden=true;}
function openDrawer(){$('#sidebar').classList.add('open');$('#drawerShade').hidden=false;}
function chooseDirectory(id){selected=id;render();closeDrawer();}
function renderTree(){
  function nodes(parent,level){return children(parent).map(d=>{
    const kids=children(d.id).length,opened=expanded.has(d.id);
    return `<div class="treeNode ${selected===d.id?'selected':''}" style="padding-left:${level*17}px" data-node="${esc(d.id)}">
      <button class="twisty" data-twist="${esc(d.id)}" aria-label="${kids?(opened?'收起':'展开')+' '+d.name:'无子目录'}">${kids?(opened?'▾':'▸'):'·'}</button>
      <button class="nodeName" data-select="${esc(d.id)}" title="${esc(d.name)}">${esc(d.name)}</button>
      <span class="nodeActions">${level<2?`<button data-add="${esc(d.id)}" title="新增下一级" aria-label="在${esc(d.name)}下新增目录">＋</button>`:''}
      <button data-rename="${esc(d.id)}" title="重命名" aria-label="重命名${esc(d.name)}">✎</button>
      <button data-remove="${esc(d.id)}" title="删除" aria-label="删除${esc(d.name)}">×</button></span>
    </div>${opened?nodes(d.id,level+1):''}`;
  }).join('');}
  $('#tree').innerHTML=data.directories.length?nodes('',0):'<p class="treeEmpty">目录为空，点击上方「＋ 一级目录」开始。</p>';
  $('#allArticles').classList.toggle('active',selected==='');$('#unfiled').classList.toggle('active',selected==='unfiled');
  $('#totalCount').textContent=data.articles.length;
  $('#unfiledCount').textContent=data.articles.filter(a=>!a.dir||!folder(a.dir)).length;
}
function visibleArticles(){let items=data.articles;
  if(selected==='unfiled')items=items.filter(a=>!a.dir||!folder(a.dir));
  else if(selected){const ids=descendants(selected);items=items.filter(a=>ids.has(a.dir));}
  if(query){const q=query.toLocaleLowerCase();items=items.filter(a=>(a.title+' '+a.body).toLocaleLowerCase().includes(q));}
  return items;
}
function renderList(){const items=visibleArticles();$('#currentTitle').textContent=selected?(selected==='unfiled'?'未分类':dirName(selected)):'全部文稿';
  $('#currentCount').textContent=items.length+' 篇';
  $('#articles').innerHTML=items.length?items.map(a=>`<button class="articleCard" data-article="${esc(a.id)}"><h3>${esc(a.title||'未命名文稿')}</h3><p>${esc(a.body||'正文为空')}</p></button>`).join(''):
    `<div class="empty">${query?'没有匹配的文稿':'这里还没有文稿'}<br><button class="primaryButton" data-new>＋ 新建文稿</button></div>`;
}
function render(){renderTree();renderList();}
function modal(title,description,inner){const host=$('#modalHost');host.innerHTML=`<div class="modalShade"><div class="modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><p>${esc(description)}</p>${inner}</div></div>`;
  host.querySelector('.modalShade').onclick=e=>{if(e.target.classList.contains('modalShade'))host.innerHTML='';};return host;}
function editDirectory(parent='',existing=null){const isRename=!!existing,level=parent?depth(parent)+1:1;
  const host=modal(isRename?'重命名目录':`新建${['','一级','二级','三级'][level]}目录`,isRename?'修改名称后，文稿会继续留在原目录。':`目录最多三级${parent?' · 上级：'+dirName(parent):''}`,
    `<form id="directoryForm"><input id="directoryName" type="text" maxlength="80" required placeholder="目录名称" value="${esc(existing?.name||'')}"><div class="modalActions"><button type="button" class="subtleButton" id="cancelDirectory">取消</button><button class="primaryButton" type="submit">保存目录</button></div></form>`);
  $('#directoryName').focus();$('#directoryName').select();$('#cancelDirectory').onclick=()=>host.innerHTML='';
  $('#directoryForm').onsubmit=e=>{e.preventDefault();const name=$('#directoryName').value.trim();if(!name)return;
    if(data.directories.some(d=>d.parent===(existing?.parent??parent)&&d.name===name&&d.id!==existing?.id)){alert('同级目录已有此名称');return;}
    let id=existing?.id;if(persist(()=>{if(existing)folder(id).name=name;else{id=uid();data.directories.push({id,name,parent});}})){
      if(parent)expanded.add(parent);host.innerHTML='';selected=id;render();toast(isRename?'目录已重命名':'目录已创建');}
  };
}
function removeDirectory(id){const d=folder(id);if(!d)return;const affected=descendants(id),count=data.articles.filter(a=>affected.has(a.dir)).length;
  if(!confirm(`删除目录「${d.name}」及其子目录？${count?'其中 '+count+' 篇文稿会移至「未分类」，不会删除。':''}`))return;
  if(persist(()=>{data.directories=data.directories.filter(v=>!affected.has(v.id));for(const a of data.articles)if(affected.has(a.dir))a.dir='';})){
    for(const v of affected)expanded.delete(v);if(affected.has(selected))selected='';render();toast('目录已删除，文稿已保留');}
}
$('#tree').onclick=e=>{const action=e.target.closest('button');if(!action)return;
  if(action.dataset.twist){const id=action.dataset.twist;expanded.has(id)?expanded.delete(id):expanded.add(id);renderTree();}
  if(action.dataset.select!==undefined)chooseDirectory(action.dataset.select);
  if(action.dataset.add)editDirectory(action.dataset.add);
  if(action.dataset.rename)editDirectory('',folder(action.dataset.rename));
  if(action.dataset.remove)removeDirectory(action.dataset.remove);
};
$('#articles').onclick=e=>{const row=e.target.closest('[data-article]');if(row)openEditor(row.dataset.article);else if(e.target.closest('[data-new]'))openEditor();};
$('#addRoot').onclick=()=>editDirectory();$('#allArticles').onclick=()=>chooseDirectory('');$('#unfiled').onclick=()=>chooseDirectory('unfiled');
$('#openDrawer').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#drawerShade').onclick=closeDrawer;
$('#search').oninput=e=>{query=e.target.value.trim();renderList();};
$('#newArticle').onclick=()=>openEditor();
function directoryOptions(chosen){function walk(parent,level){return children(parent).map(d=>`<option value="${esc(d.id)}" ${d.id===chosen?'selected':''}>${'　'.repeat(level)}${esc(d.name)}</option>`+walk(d.id,level+1)).join('');}
  return `<option value="" ${chosen?'':'selected'}>未分类</option>`+walk('',0);
}
function editorState(){return JSON.stringify({title:$('#titleInput').value,body:$('#bodyInput').value,dir:$('#directorySelect').value});}
function openEditor(id=null){const a=id?data.articles.find(item=>item.id===id):null;if(id&&!a)return;
  clearTimeout(editorCloseTimer);$('#editor').classList.remove('leaving');
  currentId=a?.id||null;$('#editor').hidden=false;$('#titleInput').value=a?.title||'';$('#bodyInput').value=a?.body||'';
  const dir=a?.dir||(selected&&selected!=='unfiled'?selected:'');$('#directorySelect').innerHTML=directoryOptions(dir);
  $('#deleteArticle').hidden=!a;initialEditor=editorState();document.body.style.overflow='hidden';
  $('#titleInput').focus();
}
function closeEditor(force=false){if(!force&&editorState()!==initialEditor&&!confirm('修改尚未保存，确定返回目录吗？'))return;
  const finish=()=>{$('#editor').hidden=true;$('#editor').classList.remove('leaving');document.body.style.overflow='';currentId=null;render();window.EditorBridge?.onEditorClosed?.();};
  if((document.body.classList.contains('mobilePage')||matchMedia('(max-width:800px)').matches)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    $('#editor').classList.add('leaving');clearTimeout(editorCloseTimer);editorCloseTimer=setTimeout(finish,220);
  }else finish();}
$('#backEditor').onclick=()=>closeEditor();
$('#saveArticle').onclick=()=>{const title=$('#titleInput').value.trim(),body=$('#bodyInput').value,dir=$('#directorySelect').value;
  if(!title){$('#titleInput').focus();toast('请先填写标题');return;}
  if(!persist(()=>{const a=data.articles.find(item=>item.id===currentId);if(a){a.title=title;a.body=body;a.dir=dir;}
    else{currentId=uid();data.articles.unshift({id:currentId,title,body,dir});}}))return;
  initialEditor=editorState();$('#deleteArticle').hidden=false;render();toast('已保存');
};
$('#deleteArticle').onclick=()=>{const a=data.articles.find(item=>item.id===currentId);if(!a||!confirm(`确定删除《${a.title}》？此操作无法撤销。`))return;
  if(persist(()=>{data.articles=data.articles.filter(item=>item.id!==currentId);})){initialEditor=editorState();closeEditor(true);toast('文稿已删除');}
};
function backups(){const host=modal('导入 / 导出','可用 JSON 文件备份或迁移文稿。导入会覆盖此项目的本机数据，并在连接时同步到其他设备。',
  '<div class="modalActions"><button class="primaryButton" id="exportData">导出 JSON</button><label class="subtleButton fileLabel" for="importData">导入 JSON</label><input type="file" accept=".json,application/json" id="importData"><button class="subtleButton" id="closeBackup">关闭</button></div>');
  $('#closeBackup').onclick=()=>host.innerHTML='';
  $('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='文稿目录备份-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  $('#importData').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;
    try{const incoming=valid(JSON.parse(await file.text()));if(!confirm('导入将覆盖当前项目在本机的所有文稿和目录。确定继续？'))return;
      if(!persist(()=>{data=incoming;}))return;selected='';query='';$('#search').value='';expanded=new Set();host.innerHTML='';render();toast('导入完成');
    }catch(error){alert('导入失败：'+error.message);}
  };
}
$('#backupButton').onclick=backups;
window.EditorBridge={storageKey:STORAGE,getData:()=>JSON.parse(JSON.stringify(data)),
  isEditorOpen:()=>!$('#editor').hidden,
  isEditorDirty:()=>!$('#editor').hidden&&editorState()!==initialEditor,
  applyCloud:incoming=>{const replacement=valid(JSON.parse(JSON.stringify(incoming)));
    if(!persist(()=>{data=replacement;},true))return false;
    selected='';query='';$('#search').value='';expanded=new Set();render();return true;},
  onLocalChanged:null,onEditorClosed:null};
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!$('#editor').hidden){e.preventDefault();$('#saveArticle').click();}
  if(e.key==='Escape'){if(!$('#modalHost .modalShade')&& !$('#editor').hidden)closeEditor();else if($('#modalHost .modalShade'))$('#modalHost').innerHTML='';else closeDrawer();}
});
// Restore the original mobile page gestures without blocking vertical scrolling.
// The editor gesture starts at the edge so selecting and moving the cursor in the text stays natural.
let pageSwipe=null;
document.addEventListener('touchstart',e=>{
  pageSwipe=null;
  if(e.touches.length!==1||!(document.body.classList.contains('mobilePage')||matchMedia('(max-width:800px)').matches)||$('#modalHost .modalShade'))return;
  const touch=e.touches[0],view=!$('#editor').hidden?'editor':$('#sidebar').classList.contains('open')?'directory':'list';
  if(view==='editor'&&(touch.clientX>32||$('#editor').classList.contains('leaving')))return;
  if(e.target.closest('input,textarea,select,[contenteditable="true"]')&&view!=='editor')return;
  pageSwipe={x:touch.clientX,y:touch.clientY,view};
},{passive:true});
document.addEventListener('touchend',e=>{
  if(!pageSwipe||!e.changedTouches.length)return;
  const {x,y,view}=pageSwipe,touch=e.changedTouches[0];pageSwipe=null;
  const dx=touch.clientX-x,dy=touch.clientY-y;
  if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.25||$('#modalHost .modalShade'))return;
  if(view==='directory'&&dx<0&&$('#sidebar').classList.contains('open')){e.preventDefault();closeDrawer();}
  else if(view==='list'&&dx>0&&$('#editor').hidden&&!$('#sidebar').classList.contains('open')){e.preventDefault();openDrawer();}
  else if(view==='editor'&&dx>0&&!$('#editor').hidden){e.preventDefault();closeEditor();}
},{passive:false});
document.addEventListener('touchcancel',()=>{pageSwipe=null;},{passive:true});
render();
