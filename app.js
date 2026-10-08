(function () {
'use strict';
// Data is private to this browser and this GitHub Pages project path.
const STORAGE='wengao-blank-editor-v1:'+location.pathname.split('/')[1];
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const {uid,blank,valid}=window.EditorModel;
let data=blank(),selected='',expanded=new Set(),query='',currentId=null,readerId=null,editorReturnToReader=false,initialEditor='',toastTimer,editorCloseTimer;

try{const saved=localStorage.getItem(STORAGE);if(saved){const parsed=JSON.parse(saved);data=valid(parsed);if(parsed.version===1)localStorage.setItem(STORAGE,JSON.stringify(data));}}
catch(error){alert('本机数据读取失败：'+error.message);}
function persist(change,fromCloud=false){const before=JSON.stringify(data);
  try{change();localStorage.setItem(STORAGE,JSON.stringify(data));}
  catch(error){data=JSON.parse(before);alert('保存失败，请先导出备份并检查浏览器存储空间：'+error.message);return false;}
  // 通知同步失败时，本机已经保存的数据仍应保持一致。
  if(!fromCloud){try{window.EditorBridge?.onLocalChanged?.();}catch(error){toast('本机已保存，同步通知失败，请重试同步');}}
  return true;}
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
    // First-level folders stay expanded so the second level is always visible.
    const kids=children(d.id).length,opened=level===0||expanded.has(d.id);
    return `<div class="treeNode ${selected===d.id?'selected':''}" style="padding-left:${level*17}px" data-node="${esc(d.id)}">
      ${level===0?`<span class="twisty" aria-hidden="true">${kids?'▾':'·'}</span>`:`<button class="twisty" data-twist="${esc(d.id)}" aria-label="${kids?(opened?'收起':'展开')+' '+esc(d.name):'无子目录'}">${kids?(opened?'▾':'▸'):'·'}</button>`}
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
$('#articles').onclick=e=>{const row=e.target.closest('[data-article]');if(row)openReader(row.dataset.article);else if(e.target.closest('[data-new]'))openEditor();};
$('#addRoot').onclick=()=>editDirectory();$('#allArticles').onclick=()=>chooseDirectory('');$('#unfiled').onclick=()=>chooseDirectory('unfiled');
$('#openDrawer').onclick=openDrawer;$('#closeDrawer').onclick=closeDrawer;$('#drawerShade').onclick=closeDrawer;
$('#search').oninput=e=>{query=e.target.value.trim();renderList();};
$('#newArticle').onclick=()=>openEditor();
function renderReader(){const a=data.articles.find(item=>item.id===readerId);if(!a){closeReader();return;}
  $('#readTitle').textContent=a.title||'未命名文稿';$('#readBody').textContent=a.body||'';}
function openReader(id){if(!data.articles.some(item=>item.id===id))return;
  readerId=id;renderReader();$('#reader').hidden=false;$('#readerBody').scrollTop=0;document.body.style.overflow='hidden';
  $('#backReader').focus();}
function closeReader(){$('#reader').hidden=true;readerId=null;document.body.style.overflow='';}
$('#backReader').onclick=closeReader;
$('#editFromReader').onclick=()=>{if(readerId)openEditor(readerId,true);};
function directoryOptions(chosen){function walk(parent,level){return children(parent).map(d=>`<option value="${esc(d.id)}" ${d.id===chosen?'selected':''}>${'　'.repeat(level)}${esc(d.name)}</option>`+walk(d.id,level+1)).join('');}
  return `<option value="" ${chosen?'':'selected'}>未分类</option>`+walk('',0);
}
function editorState(){return JSON.stringify({title:$('#titleInput').value,body:$('#bodyInput').value,dir:$('#directorySelect').value});}
function openEditor(id=null,fromReader=false){const a=id?data.articles.find(item=>item.id===id):null;if(id&&!a)return;
  clearTimeout(editorCloseTimer);$('#editor').classList.remove('leaving');
  editorReturnToReader=fromReader;currentId=a?.id||null;$('#editor').hidden=false;$('#titleInput').value=a?.title||'';$('#bodyInput').value=a?.body||'';
  const dir=a?.dir||(selected&&selected!=='unfiled'?selected:'');$('#directorySelect').innerHTML=directoryOptions(dir);
  $('#deleteArticle').hidden=!a;initialEditor=editorState();document.body.style.overflow='hidden';
  $('#titleInput').focus();
}
function closeEditor(force=false){if(!force&&editorState()!==initialEditor&&!confirm('修改尚未保存，确定返回吗？'))return;
  const finish=()=>{$('#editor').hidden=true;$('#editor').classList.remove('leaving');currentId=null;render();
    if(editorReturnToReader&&!$('#reader').hidden){
      if(data.articles.some(item=>item.id===readerId))renderReader();else closeReader();
    }
    editorReturnToReader=false;document.body.style.overflow=$('#reader').hidden?'':'hidden';window.EditorBridge?.onEditorClosed?.();};
  if((document.body.classList.contains('mobilePage')||matchMedia('(max-width:800px)').matches)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    $('#editor').classList.add('leaving');clearTimeout(editorCloseTimer);editorCloseTimer=setTimeout(finish,220);
  }else finish();}
$('#backEditor').onclick=()=>closeEditor();
$('#saveArticle').onclick=()=>{const title=$('#titleInput').value.trim(),body=$('#bodyInput').value,dir=$('#directorySelect').value;
  if(!title){$('#titleInput').focus();toast('请先填写标题');return;}
  if(!persist(()=>{const a=data.articles.find(item=>item.id===currentId);if(a){a.title=title;a.body=body;a.dir=dir;}
    else{currentId=uid();data.articles.unshift({id:currentId,title,body,dir});}}))return;
  initialEditor=editorState();$('#deleteArticle').hidden=false;render();if(editorReturnToReader)renderReader();toast('已保存');
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
    selected='';query='';$('#search').value='';expanded=new Set();render();if(!$('#reader').hidden)renderReader();return true;},
  onLocalChanged:null,onEditorClosed:null};
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&!$('#editor').hidden){e.preventDefault();$('#saveArticle').click();}
  if(e.key==='Escape'){if($('#modalHost .modalShade'))$('#modalHost').innerHTML='';else if(!$('#editor').hidden)closeEditor();else if(!$('#reader').hidden)closeReader();else closeDrawer();}
});
// Restore the original mobile page gestures without blocking vertical scrolling.
// The editor gesture starts at the edge so selecting and moving the cursor in the text stays natural.
let pageSwipe=null;
document.addEventListener('touchstart',e=>{
  pageSwipe=null;
  if(e.touches.length!==1||!(document.body.classList.contains('mobilePage')||matchMedia('(max-width:800px)').matches)||$('#modalHost .modalShade'))return;
  const touch=e.touches[0],view=!$('#editor').hidden?'editor':!$('#reader').hidden?'reader':$('#sidebar').classList.contains('open')?'directory':'list';
  if((view==='editor'||view==='reader')&&touch.clientX>32)return;
  if(view==='editor'&&$('#editor').classList.contains('leaving'))return;
  if(e.target.closest('input,textarea,select,[contenteditable="true"]')&&view!=='editor')return;
  pageSwipe={x:touch.clientX,y:touch.clientY,view};
},{passive:true});
document.addEventListener('touchend',e=>{
  if(!pageSwipe||!e.changedTouches.length)return;
  const {x,y,view}=pageSwipe,touch=e.changedTouches[0];pageSwipe=null;
  const dx=touch.clientX-x,dy=touch.clientY-y;
  if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.25||$('#modalHost .modalShade'))return;
  if(view==='directory'&&dx<0&&$('#sidebar').classList.contains('open')){e.preventDefault();closeDrawer();}
  else if(view==='list'&&dx>0&&$('#editor').hidden&&$('#reader').hidden&&!$('#sidebar').classList.contains('open')){e.preventDefault();openDrawer();}
  else if(view==='reader'&&dx>0&&$('#editor').hidden&&!$('#reader').hidden){e.preventDefault();closeReader();}
  else if(view==='editor'&&dx>0&&!$('#editor').hidden){e.preventDefault();closeEditor();}
},{passive:false});
document.addEventListener('touchcancel',()=>{pageSwipe=null;},{passive:true});
render();

})();
