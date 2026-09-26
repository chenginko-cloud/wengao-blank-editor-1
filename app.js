/* Blank editor. Data stays in this browser until exported and imported elsewhere. */
'use strict';
const KEYS=['src','big','topic','blogger','series','bucket','tag'];
const LABELS={src:'① 内容库',big:'② 主题大类',topic:'③ 细分主题',blogger:'④ 博主 / 作者',series:'⑤ 系列 / 合集',bucket:'⑥ 字数档',tag:'⑦ 热门标签'};
const STORAGE='wengao-blank-editor-v1:'+location.pathname.split('/')[1];
const fresh=()=>({version:1,dims:Object.fromEntries(KEYS.map(k=>[k,[]])),articles:[]});
let db=fresh();
try{const raw=localStorage.getItem(STORAGE);if(raw)db=validate(JSON.parse(raw));}catch(e){alert('本地数据读取失败，请检查浏览器存储：'+e.message);}
const mobile=!!document.querySelector('#list');
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('zh-CN');
const uid=()=>crypto.randomUUID?crypto.randomUUID():'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const name=(k,id)=>db.dims[k].find(v=>v.id===id)?.name||'';
const bytes=t=>Array.from(t||'').filter(c=>/\p{Script=Han}/u.test(c)).length;
const filters=Object.fromEntries(KEYS.map(k=>[k,new Set()]));
let kw='',deep=false,sort='default',page=1,per=50,limit=40,view=[],current=null,editing=false;
function validate(data){
  if(!data||data.version!==1||!data.dims||!Array.isArray(data.articles)||
     KEYS.some(k=>!Array.isArray(data.dims[k])))throw Error('不是此编辑器的数据文件');
  for(const k of KEYS)for(const v of data.dims[k])
    if(!v||typeof v.id!=='string'||typeof v.name!=='string')throw Error('筛选项格式不正确');
  for(const a of data.articles)
    if(!a||typeof a.id!=='string'||typeof a.title!=='string'||typeof a.body!=='string')throw Error('文稿格式不正确');
  return data;
}
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(db));return true;}
  catch(e){alert('保存失败：浏览器存储空间可能已满。请先导出备份。\n'+e.message);return false;}}
function change(fn){const before=JSON.stringify(db);fn();if(!save()){db=JSON.parse(before);return false;}render();return true;}
function note(t){const el=$(mobile?'#toast':'#hint');el.textContent=t;el.classList.add('on');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('on'),2200);}
function selected(a,k){const val=a[k];return Array.isArray(val)?val:[val||''];}
function passes(a,except){
  for(const k of KEYS)if(k!==except&&filters[k].size&&!selected(a,k).some(id=>filters[k].has(id)))return false;
  if(kw){const hay=[a.title,a.summary,...KEYS.flatMap(k=>selected(a,k).map(id=>name(k,id))),...(deep?[a.body]:[])].join(' ').toLowerCase();
    if(!hay.includes(kw.toLowerCase()))return false;}
  return true;
}
function result(){view=db.articles.map((_,i)=>i).filter(i=>passes(db.articles[i]));
  if(sort==='han-')view.sort((a,b)=>bytes(db.articles[b].body)-bytes(db.articles[a].body));
  if(sort==='han+')view.sort((a,b)=>bytes(db.articles[a].body)-bytes(db.articles[b].body));
  if(sort==='title')view.sort((a,b)=>db.articles[a].title.localeCompare(db.articles[b].title,'zh-CN'));
  if(sort==='src')view.sort((a,b)=>name('src',db.articles[a].src).localeCompare(name('src',db.articles[b].src),'zh-CN'));
}
function clearFilters(){KEYS.forEach(k=>filters[k].clear());kw='';$('#kw').value='';deep=false;$('#deep').checked=false;page=1;limit=40;render();note('已清空筛选');}
function renderFilters(){const host=$('#filters');host.innerHTML=KEYS.map(k=>{
  const values=db.dims[k].filter(v=>{
    if(k==='topic'&&filters.big.size&&v.parent&&!filters.big.has(v.parent))return false;
    if(k==='blogger'&&filters.src.size&&v.parent&&!filters.src.has(v.parent))return false;
    return true;
  });
  let options=values.map(v=>{const count=db.articles.filter(a=>passes(a,k)&&selected(a,k).includes(v.id)).length;
    return `<button class="chip ${filters[k].has(v.id)?'sel':''} ${count?'':'zero'}" data-key="${k}" data-id="${esc(v.id)}"><span>${esc(v.name)}</span><span class="n">${count}</span></button>`;}).join('');
  if(!options)options='<span class="emptyNote">暂无选项，点「编辑筛选页」添加</span>';
  return `<div class="grp ${filters[k].size?'on':''}"><h3><span>${LABELS[k]}</span><span class="clr" data-clear="${k}">清除</span></h3><div class="chips ${['topic','blogger','tag'].includes(k)?'subchips':''}">${options}</div></div>`;
}).join('');
  host.querySelectorAll('[data-key]').forEach(el=>el.onclick=()=>{const k=el.dataset.key,id=el.dataset.id;
    filters[k].has(id)?filters[k].delete(id):filters[k].add(id);
    if(k==='big'||k==='src'){const child=k==='big'?'topic':'blogger';for(const v of db.dims[child])if(v.parent&&!filters[k].has(v.parent))filters[child].delete(v.id);}
    page=1;limit=40;render();});
  host.querySelectorAll('[data-clear]').forEach(el=>el.onclick=()=>{filters[el.dataset.clear].clear();page=1;limit=40;render();});
}
function badges(a){return [name('big',a.big),...(a.topic||[]).map(id=>name('topic',id))].filter(Boolean).map(t=>`<span class="bdg soft">${esc(t)}</span>`).join('');}
function metadata(a){return [name('src',a.src),name('blogger',a.blogger),name('series',a.series),`${fmt(bytes(a.body))} 字`,name('bucket',a.bucket)].filter(Boolean).map(esc).join(' · ');}
function row(a,i){const summary=a.summary?`<div class="s">${esc(a.summary)}</div>`:'';
  if(mobile)return `<button class="it" data-id="${esc(a.id)}"><div class="t">${esc(a.title)}</div><div class="m">${badges(a)}<span>${metadata(a)}</span></div>${summary}</button>`;
  return `<div class="row" data-id="${esc(a.id)}"><div class="no">${i+1}</div><div class="bd"><div class="t">${esc(a.title)}</div><div class="m">${badges(a)}<span>${metadata(a)}</span></div>${summary}</div></div>`;
}
function render(){result();renderFilters();
  const total=view.length;
  if(mobile){const indices=view.slice(0,limit);$('#list').innerHTML=`<div class="stat">共 <b>${fmt(total)}</b> 篇 · 本机浏览器保存</div>`+
      (total?indices.map((v,i)=>row(db.articles[v],i)).join('')+(total>limit?'<button class="more" id="more">继续加载</button>':''):
      `<div class="empty">${kw||KEYS.some(k=>filters[k].size)?'没有符合条件的文稿':'尚无文稿'}<br><button class="action" id="emptyNew">＋ 新建第一篇文稿</button></div>`);
    $('#btnN').textContent=fmt(total);$('#applyN').textContent=fmt(total);
    const active=KEYS.filter(k=>filters[k].size).length+(kw?1:0);
    $('#btnTx').textContent=active?`已选 ${active} 组条件`:'筛选与检索';$('#openD').classList.toggle('on',!!active);
    $('#more')?.addEventListener('click',()=>{limit+=40;render();});
  }else{const pages=Math.max(1,Math.ceil(total/per));page=Math.min(page,pages);const offset=(page-1)*per;
    $('#listwrap').innerHTML=total?view.slice(offset,offset+per).map((v,i)=>row(db.articles[v],offset+i)).join('')+
      `<div class="pager"><button id="prevPage" ${page<=1?'disabled':''}>‹</button><span>${page} / ${pages}</span><button id="nextPage" ${page>=pages?'disabled':''}>›</button></div>`:
      `<div class="empty">${kw||KEYS.some(k=>filters[k].size)?'没有符合条件的文稿':'尚无文稿'}<br><button class="action" id="emptyNew">＋ 新建第一篇文稿</button></div>`;
    $('#hitN').textContent=$('#resN').textContent=fmt(total);$('#resP').textContent=page;$('#resT').textContent=pages;
    $('#brandSub').innerHTML=`<b>${fmt(db.articles.length)}</b> 篇 · <b>${fmt(db.articles.reduce((n,a)=>n+bytes(a.body),0))}</b> 字<br>本机浏览器保存 · 可导入 / 导出`;
    $('#crumbs').innerHTML=KEYS.flatMap(k=>[...filters[k]].map(id=>`<button class="cr" data-clear-one="${k}" data-id="${esc(id)}">${esc(name(k,id))} ×</button>`)).join('')+(kw?`<button class="cr" id="kwCrumb">${esc(kw)} ×</button>`:'');
    $('#crumbs').querySelectorAll('[data-clear-one]').forEach(el=>el.onclick=()=>{filters[el.dataset.clearOne].delete(el.dataset.id);render();});
    $('#kwCrumb')?.addEventListener('click',()=>{kw='';$('#kw').value='';render();});
    $('#prevPage')?.addEventListener('click',()=>{page--;render();$('#listwrap').scrollTop=0;});
    $('#nextPage')?.addEventListener('click',()=>{page++;render();$('#listwrap').scrollTop=0;});
  }
  (mobile?$('#list'):$('#listwrap')).querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openArticle(el.dataset.id));
  $('#emptyNew')?.addEventListener('click',()=>editArticle());
}
function openArticle(id){current=id;editing=false;const a=db.articles.find(v=>v.id===id);if(!a)return;
  const art=`<div class="art" style="${mobile?'':'font-size:'+fontSize+'px'}"><h1>${esc(a.title)}</h1><div class="meta">${badges(a)}<span>${metadata(a)}</span></div>`+
    (a.body?a.body.split(/\n{2,}/).map(p=>`<p>${esc(p.trim()).replace(/\n/g,'<br>')}</p>`).join(''):'<p class="placeholder">正文为空，点击「编辑」开始写作。</p>')+'</div>';
  $('#rbody').innerHTML=art;$('#rbody').scrollTop=0;
  $('#reader').classList.add('open');if(mobile)document.body.classList.add('locked','reading');else document.body.style.overflow='hidden';
  const pos=view.findIndex(i=>db.articles[i]?.id===id);$('#rPrev').disabled=pos<=0;$('#rNext').disabled=pos<0||pos>=view.length-1;
}
let fontSize=17.5;
function closeReader(){if(editing)return;$('#reader').classList.remove('open');if(mobile)document.body.classList.remove('locked','reading');else document.body.style.overflow='';}
function step(n){if(editing)return;const pos=view.findIndex(i=>db.articles[i]?.id===current);const idx=view[pos+n];if(idx!==undefined)openArticle(db.articles[idx].id);}
function overlay(title,description,html){const el=document.createElement('div');el.className='editorOverlay';el.innerHTML=`<div class="editorPanel" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><p>${esc(description)}</p>${html}</div>`;document.body.appendChild(el);el.addEventListener('click',e=>{if(e.target===el&&!editing)el.remove();});return el;}
function closeOverlay(el){el.remove();editing=false;}
function opts(k,val){return `<option value="">未设置</option>`+db.dims[k].map(v=>`<option value="${esc(v.id)}" ${v.id===val?'selected':''}>${esc(v.name)}</option>`).join('');}
function checks(k,chosen){return db.dims[k].length?db.dims[k].map(v=>`<label><input type="checkbox" value="${esc(v.id)}" ${chosen?.includes(v.id)?'checked':''}>${esc(v.name)}</label>`).join(''):'<span class="emptyNote">暂无选项，可先到「编辑筛选页」添加</span>';}
function editArticle(id){const a=id?db.articles.find(v=>v.id===id):null;editing=true;
  const el=overlay(a?'编辑文稿':'新建文稿','正文和分类保存到当前浏览器；可以在「导入 / 导出」中备份。',
    `<form id="articleForm"><label>标题 *</label><input name="title" type="text" required value="${esc(a?.title||'')}"><label>摘要</label><textarea name="summary">${esc(a?.summary||'')}</textarea>`+
    `<div class="two">${['src','big','blogger','series','bucket'].map(k=>`<div><label>${LABELS[k]}</label><select name="${k}">${opts(k,a?.[k])}</select></div>`).join('')}</div>`+
    `<label>${LABELS.topic}</label><div class="checks" id="topicChecks">${checks('topic',a?.topic)}</div><label>${LABELS.tag}</label><div class="checks" id="tagChecks">${checks('tag',a?.tag)}</div>`+
    `<label>正文 *</label><textarea class="bodyField" name="body" required>${esc(a?.body||'')}</textarea><div class="buttons"><button type="button" class="action secondary" id="cancelEdit">取消</button><button class="action" type="submit">保存文稿</button></div></form>`);
  el.querySelector('input[name=title]').focus();
  el.querySelector('#cancelEdit').onclick=()=>closeOverlay(el);
  el.querySelector('#articleForm').onsubmit=e=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form),title=String(f.get('title')).trim(),body=String(f.get('body')).trim();
    if(!title||!body){alert('请填写标题和正文');return;}
    const obj={id:a?.id||uid(),title,body,summary:String(f.get('summary')).trim(),
      ...Object.fromEntries(['src','big','blogger','series','bucket'].map(k=>[k,String(f.get(k)||'')])),
      topic:[...el.querySelectorAll('#topicChecks input:checked')].map(c=>c.value),tag:[...el.querySelectorAll('#tagChecks input:checked')].map(c=>c.value)};
    if(!change(()=>{if(a)Object.assign(a,obj);else db.articles.unshift(obj);})){return;}
    closeOverlay(el);if(mobile)document.body.classList.remove('drawn');openArticle(obj.id);note('已保存文稿');
  };
}
function manage(){const el=overlay('编辑筛选页','增删和重命名七组筛选项。细分主题可关联主题大类，作者可关联内容库。',
  `<div id="groups"></div><div class="buttons"><button class="action secondary" id="doneManage">完成</button></div>`);
  el.querySelector('#doneManage').onclick=()=>el.remove();
  const display=()=>{el.querySelector('#groups').innerHTML=KEYS.map(k=>`<section class="groupRow" data-group="${k}"><h3>${LABELS[k]} · ${db.dims[k].length} 项</h3>`+
    (db.dims[k].length?db.dims[k].map(v=>`<div class="entry" data-entry="${esc(v.id)}"><input type="text" value="${esc(v.name)}" aria-label="名称">`+
      (['topic','blogger'].includes(k)?`<select aria-label="所属${k==='topic'?'主题大类':'内容库'}">${opts(k==='topic'?'big':'src',v.parent)}</select>`:'')+
      `<button data-rename>保存</button><button data-remove>删除</button></div>`).join(''):'<p class="emptyNote">暂无筛选项</p>')+
    `<div class="addRow"><input type="text" placeholder="新增${LABELS[k].slice(2)}" aria-label="新增选项"><button class="action" data-add>添加</button></div></section>`).join('');
    el.querySelectorAll('[data-group]').forEach(section=>{const k=section.dataset.group;
      section.querySelector('[data-add]').onclick=()=>{const input=section.querySelector('.addRow input'),name=input.value.trim();if(!name)return;
        if(db.dims[k].some(v=>v.name===name)){alert('该名称已存在');return;}
        if(change(()=>db.dims[k].push({id:uid(),name,parent:''})))display();};
      section.querySelector('.addRow input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();section.querySelector('[data-add]').click();}};
      section.querySelectorAll('[data-entry]').forEach(row=>{const id=row.dataset.entry;
        row.querySelector('[data-rename]').onclick=()=>{const title=row.querySelector('input').value.trim();if(!title){alert('名称不能为空');return;}
          if(db.dims[k].some(v=>v.id!==id&&v.name===title)){alert('该名称已存在');return;}
          if(change(()=>{const v=db.dims[k].find(v=>v.id===id);v.name=title;v.parent=row.querySelector('select')?.value||'';}))display();};
        row.querySelector('[data-remove]').onclick=()=>{if(!confirm('确定删除该筛选项？文稿会保留，但会清除此项归类。'))return;
          if(change(()=>{db.dims[k]=db.dims[k].filter(v=>v.id!==id);filters[k].delete(id);
            for(const a of db.articles){if(['topic','tag'].includes(k))a[k]=(a[k]||[]).filter(x=>x!==id);else if(a[k]===id)a[k]='';}
            if(k==='big'||k==='src')for(const v of db.dims[k==='big'?'topic':'blogger'])if(v.parent===id)v.parent='';
          }))display();};
      });
    });
  };display();
}
function backup(){const el=overlay('导入 / 导出','两个项目彼此独立，内容只保存在当前浏览器。导出 JSON 可作备份，也可导入另一个项目。',
  '<div class="buttons"><button class="action" id="exportData">导出 JSON</button><label class="action secondary" for="importData" style="margin:0;font-weight:normal">导入 JSON</label><input id="importData" type="file" accept="application/json,.json" hidden><button class="action secondary" id="closeBackup">关闭</button></div>');
  el.querySelector('#closeBackup').onclick=()=>el.remove();
  el.querySelector('#exportData').onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='文稿编辑器备份-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  el.querySelector('#importData').onchange=async e=>{const file=e.target.files[0];if(!file)return;
    try{const incoming=validate(JSON.parse(await file.text()));if(!confirm('导入会覆盖此项目在当前浏览器的所有文稿和筛选项。确定继续？'))return;
      const old=db;db=incoming;if(!save()){db=old;return;}
      KEYS.forEach(k=>filters[k].clear());kw='';$('#kw').value='';page=1;limit=40;render();el.remove();closeReader();note('导入成功');
    }catch(err){alert('导入失败：'+err.message);}};
}
$('#newArticle').onclick=()=>editArticle();$('#manageFilters').onclick=manage;$('#backup').onclick=backup;
$('#resetAll').onclick=clearFilters;
$('#kw').oninput=e=>{kw=e.target.value.trim();page=1;limit=40;render();};
$('#deep').onchange=e=>{deep=e.target.checked;render();};
$('#sort').onchange=e=>{sort=e.target.value;page=1;limit=40;render();};
if(!mobile)$('#per').onchange=e=>{per=+e.target.value;page=1;render();};
$('#rClose').onclick=closeReader;$('#rPrev').onclick=()=>step(-1);$('#rNext').onclick=()=>step(1);
$('#rEdit').onclick=()=>editArticle(current);
$('#rDelete').onclick=()=>{const a=db.articles.find(v=>v.id===current);if(!a||!confirm(`确定删除《${a.title}》？`))return;
  if(change(()=>{db.articles=db.articles.filter(v=>v.id!==current);}))closeReader();};
$('#rCopy').onclick=async()=>{const a=db.articles.find(v=>v.id===current);if(!a)return;
  try{await navigator.clipboard.writeText(a.body);note('已复制正文');}catch(e){note('复制失败，请检查剪贴板权限');}};
if(!mobile){$('#rFontA').onclick=()=>{fontSize=Math.min(25,fontSize+1);openArticle(current);};
  $('#rFontB').onclick=()=>{fontSize=Math.max(14,fontSize-1);openArticle(current);};
  $('#reader').onclick=e=>{if(e.target.id==='reader')closeReader();};
}else{
  const openD=()=>document.body.classList.add('drawn'),closeD=()=>document.body.classList.remove('drawn');
  $('#openD').onclick=openD;$('#closeD').onclick=closeD;$('#scrim').onclick=closeD;$('#applyD').onclick=closeD;
  $('#swapv').style.display='inline-block';$('#swapv').onclick=()=>location.href='index.html?v=desktop';
  function swipe(el,direction,fn){let start=null;el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){start={x:e.clientX,y:e.clientY};try{el.setPointerCapture(e.pointerId);}catch(_){}}});
    el.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;
      if(Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx))start=null;
      else if(dx*direction>65&&Math.abs(dx)>Math.abs(dy)*1.2){start=null;fn();}});
    el.addEventListener('pointerup',()=>start=null);el.addEventListener('pointercancel',()=>start=null);
  }
  swipe($('#filterEdge'),1,()=>{if(!document.body.classList.contains('reading'))openD();});
  swipe($('#drawerEdge'),-1,closeD);swipe($('#edge'),1,closeReader);
}
document.addEventListener('keydown',e=>{if($('.editorOverlay'))return;
  if(e.key==='Escape'){if($('#reader').classList.contains('open'))closeReader();else if(mobile)document.body.classList.remove('drawn');}
  else if(e.key==='/'&&document.activeElement!==$('#kw')){e.preventDefault();$('#kw').focus();}
  else if($('#reader').classList.contains('open')){if(e.key==='ArrowLeft')step(-1);if(e.key==='ArrowRight')step(1);}
});
if(!mobile)$('#swapv').style.display='inline-block';
render();
