'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const root=__dirname,storage='wengao-blank-editor-v1:wengao-blank-editor-1';
let checks=0;
function check(name,condition){assert.ok(condition,name);checks++;console.log('PASS '+name);}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await sleep(10);}throw Error('条件等待超时');}
const sample=()=>({version:2,directories:[{id:'root',name:'一级 "引号" O\'Reilly <角括号>',parent:''},{id:'chapter',name:'二级 "章节" O\'Reilly',parent:'root'},{id:'section',name:'三级目录',parent:'chapter'},{id:'other',name:'另一门课',parent:''}],articles:[{id:'a',title:'保留 "引号" O\'Reilly',body:'正文第一行\n\n错题与自学\n<script>不是代码</script>',dir:'section',extra:'保留扩展字段'},{id:'b',title:'未分类文稿',body:'另一个正文',dir:''}]});
class Assets extends ResourceLoader{fetch(url){return Promise.resolve(fs.readFileSync(path.join(root,new URL(url).pathname.split('/').pop())));}}
async function create({mobile=false,seed=sample(),failStorage=false}={}){
 const errors=[],alerts=[],downloads=[],options={confirm:true,failStorage};
 const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/CSS/.test(e.message))errors.push(e.message);});
 const dom=new JSDOM(fs.readFileSync(path.join(root,mobile?'mobile.html':'desktop.html'),'utf8'),{url:'https://example.test/wengao-blank-editor-1/'+(mobile?'mobile.html?mode=mobile':'desktop.html?mode=desktop'),runScripts:'dangerously',resources:new Assets(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  Object.defineProperty(w,'innerWidth',{value:mobile?390:1280});w.matchMedia=q=>({matches:q.includes('reduced-motion')?false:mobile&&q.includes('max-width')});
  w.alert=m=>alerts.push(m);w.confirm=()=>options.confirm;
  w.fetch=()=>{throw Error('测试不允许真实网络请求');};
  w.localStorage.setItem(storage,JSON.stringify(seed));
  const original=w.Storage.prototype.setItem;
  w.Storage.prototype.setItem=function(k,v){if(options.failStorage&&k===storage)throw Error('模拟存储空间不足');return original.call(this,k,v);};
  w.URL.createObjectURL=blob=>{downloads.push(blob);return 'blob:mock';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};
 }});
 await until(()=>dom.window.EditorBridge?.onLocalChanged);
 const w=dom.window,$=id=>w.document.getElementById(id),saved=()=>JSON.parse(w.localStorage.getItem(storage));
 return {w,$,saved,dom,alerts,errors,options,downloads};
}
function input(t,id,value){t.$(id).value=value;t.$(id).dispatchEvent(new t.w.Event('input',{bubbles:true}));}
function submit(t,id){t.$(id).dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true}));}
function touch(t,target,x,y,dx,dy=0){const start=new t.w.Event('touchstart',{bubbles:true});Object.defineProperty(start,'touches',{value:[{clientX:x,clientY:y}]});target.dispatchEvent(start);const end=new t.w.Event('touchend',{bubbles:true,cancelable:true});Object.defineProperty(end,'changedTouches',{value:[{clientX:x+dx,clientY:y+dy}]});target.dispatchEvent(end);}
(async()=>{
 const t=await create();
 try{
  check('原有数据及扩展字段继续读取',JSON.stringify(t.w.EditorBridge.getData())===JSON.stringify(sample()));
  check('一级与二级目录可见、三级按需展开',!!t.w.document.querySelector('[data-node="chapter"]')&&!t.w.document.querySelector('[data-node="section"]'));
  check('目录名称中的单双引号原样显示',t.w.document.querySelector('[data-select="root"]').textContent===sample().directories[0].name);
  check('目录按钮属性完整转义',t.w.document.querySelector('[data-twist="chapter"]').getAttribute('aria-label')==='展开 '+sample().directories[1].name);
  check('文稿标题中的单双引号原样显示',t.w.document.querySelector('[data-article="a"] h3').textContent===sample().articles[0].title);
  t.w.document.querySelector('[data-twist="chapter"]').click();check('三级目录展开',!!t.w.document.querySelector('[data-node="section"]'));
  t.w.document.querySelector('[data-select="root"]').click();check('目录筛选包含子目录文稿',t.$('articles').querySelectorAll('[data-article]').length===1);
  t.$('allArticles').click();input(t,'search','错题');check('正文搜索保留',t.$('articles').querySelectorAll('[data-article]').length===1);
  input(t,'search','不存在的词');check('无匹配结果',t.$('articles').querySelectorAll('[data-article]').length===0);
  input(t,'search','');
  t.w.document.querySelector('[data-article="a"]').click();check('点击文稿先只读，正文不作为 HTML 执行',!t.$('reader').hidden&&t.$('editor').hidden&&t.$('readBody').textContent===sample().articles[0].body&&!t.$('readBody').querySelector('script'));
  t.$('editFromReader').click();check('从阅读页进入编辑页',!t.$('editor').hidden&&t.$('titleInput').value===sample().articles[0].title);
  input(t,'bodyInput','修改正文\n\n保留空行、中文与 emoji 🌱');
  t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));
  check('Ctrl+S 保存并同步只读视图',t.saved().articles[0].body===t.$('bodyInput').value&&t.$('readBody').textContent===t.$('bodyInput').value);
  check('已有文稿扩展字段保存后保留',t.saved().articles[0].extra==='保留扩展字段');
  input(t,'bodyInput','未保存修改');t.options.confirm=false;t.$('backEditor').click();check('取消放弃修改仍留在编辑页',!t.$('editor').hidden);
  t.options.confirm=true;t.$('backEditor').click();check('确认放弃修改返回只读页',t.$('editor').hidden&&!t.$('reader').hidden&&t.saved().articles[0].body!=='未保存修改');
  t.$('backReader').click();t.$('newArticle').click();t.$('saveArticle').click();check('空标题不创建文稿',t.saved().articles.length===sample().articles.length);
  input(t,'titleInput','新文稿');input(t,'bodyInput','新正文');t.$('saveArticle').click();check('新文稿保存',t.saved().articles[0].title==='新文稿');t.$('backEditor').click();
  t.w.document.querySelector('[data-rename="root"]').click();input(t,'directoryName','重命名后的目录');submit(t,'directoryForm');check('目录重命名不改变所属关系',t.saved().directories.find(d=>d.id==='root').name==='重命名后的目录'&&t.saved().articles.find(a=>a.id==='a').dir==='section');
  t.w.document.querySelector('[data-remove="root"]').click();check('删除目录保留文稿并移到未分类',!t.saved().directories.some(d=>['root','chapter','section'].includes(d.id))&&t.saved().articles.find(a=>a.id==='a').dir==='');
  t.$('backupButton').click();t.$('exportData').click();check('导出保留完整本机数据',t.downloads.length===1&&t.downloads[0].type==='application/json');
  const incoming={version:2,directories:[],articles:[{id:'imported',title:'导入文稿',body:'完整正文\n\n尾段',dir:''}]};
  Object.defineProperty(t.$('importData'),'files',{value:[{text:async()=>JSON.stringify(incoming)}]});
  await t.$('importData').onchange({target:t.$('importData')});check('导入备份覆盖并显示正确数据',JSON.stringify(t.saved())===JSON.stringify(incoming)&&t.$('articles').textContent.includes('导入文稿'));
  t.w.document.querySelector('[data-article="imported"]').click();t.$('editFromReader').click();t.$('deleteArticle').click();check('删除文稿返回列表',t.saved().articles.length===0&&t.$('reader').hidden&&t.$('editor').hidden);
  t.$('newArticle').click();input(t,'titleInput','通知故障时仍保存');t.w.EditorBridge.onLocalChanged=()=>{throw Error('模拟同步通知故障');};t.$('saveArticle').click();
  check('同步通知异常不回滚已保存的本机文稿',JSON.stringify(t.saved())===JSON.stringify(t.w.EditorBridge.getData())&&t.saved().articles[0].title==='通知故障时仍保存');
  t.options.failStorage=true;input(t,'bodyInput','不应写入');const before=t.w.EditorBridge.getData();t.$('saveArticle').click();check('存储失败保持内存和持久数据一致',JSON.stringify(t.w.EditorBridge.getData())===JSON.stringify(before)&&JSON.stringify(t.saved())===JSON.stringify(before));
  check('脚本无运行错误',t.errors.length===0);
 }finally{t.dom.window.close();}
 const mobile=await create({mobile:true});
 try{
  touch(mobile,mobile.$('articles'),150,300,100);check('手机列表右滑打开目录',mobile.$('sidebar').classList.contains('open'));
  touch(mobile,mobile.$('tree'),250,300,-100);check('手机目录左滑返回列表',!mobile.$('sidebar').classList.contains('open'));
  touch(mobile,mobile.$('articles'),150,300,12,100);check('纵向滑动不误开目录',!mobile.$('sidebar').classList.contains('open'));
  mobile.w.document.querySelector('[data-article="a"]').click();touch(mobile,mobile.$('readerBody'),150,300,100);check('阅读页中部滑动不返回',!mobile.$('reader').hidden);
  touch(mobile,mobile.$('readerBody'),8,300,100);check('阅读页边缘右滑返回',mobile.$('reader').hidden);
  mobile.$('newArticle').click();input(mobile,'titleInput','未保存');mobile.options.confirm=false;touch(mobile,mobile.$('editor'),8,300,100);check('编辑页边缘返回可取消',!mobile.$('editor').hidden);
  mobile.options.confirm=true;touch(mobile,mobile.$('editor'),8,300,100);await sleep(250);check('编辑页确认后返回列表',mobile.$('editor').hidden);
 }finally{mobile.dom.window.close();}
 const model=await create({seed:{version:1,dims:{src:[{id:'s',name:'原始来源'}],big:[{id:'b',name:'原始大类'}],topic:[{id:'t',name:'原始主题'}]},articles:[{id:'old',title:'旧文稿',body:'旧正文',src:'s',big:'b',topic:['t']}]}});
 try{
  check('旧版备份迁移保留正文和三级目录',model.saved().version===2&&model.saved().articles[0].body==='旧正文'&&model.w.EditorModel.valid(model.saved()));
  for(const [name,value] of [
   ['重复目录',{version:2,directories:[{id:'a',name:'a',parent:''},{id:'a',name:'b',parent:''}],articles:[]}],
   ['循环目录',{version:2,directories:[{id:'a',name:'a',parent:'b'},{id:'b',name:'b',parent:'a'}],articles:[]}],
   ['超三级目录',{version:2,directories:[{id:'a',name:'a',parent:''},{id:'b',name:'b',parent:'a'},{id:'c',name:'c',parent:'b'},{id:'d',name:'d',parent:'c'}],articles:[]}],
   ['缺失目录',{version:2,directories:[],articles:[{id:'a',title:'a',body:'b',dir:'missing'}]}]]){
    let rejected=false;try{model.w.EditorModel.valid(value);}catch(_){rejected=true;}check('备份校验拒绝'+name,rejected);
  }
 }finally{model.dom.window.close();}
 const route=fs.readFileSync(path.join(root,'route.js'),'utf8');
 for(const c of [{width:819,target:'mobile'},{width:820,target:'desktop'},{width:1280,ua:'iPhone',target:'mobile'},{width:1280,ua:'Macintosh',touch:5,target:'mobile'},{width:390,query:'?mode=desktop&rev=sync-5',target:'desktop'},{width:1280,query:'?v=mobile&rev=sync-5',target:'mobile'}]){
  let replaced;const query=c.query||'?rev=sync-5';vm.runInNewContext(route,{URL,URLSearchParams,innerWidth:c.width,navigator:{userAgent:c.ua||'',maxTouchPoints:c.touch||0},screen:{width:c.width,height:900},matchMedia:()=>({matches:false}),location:{protocol:'https:',pathname:'/wengao-blank-editor-1/index.html',href:'https://example.test/wengao-blank-editor-1/index.html'+query+'#keep',search:query,hash:'#keep',replace:u=>{replaced=u;}}});
  check('设备入口保留参数锚点 '+JSON.stringify(c),replaced==='https://example.test/wengao-blank-editor-1/'+c.target+'.html'+query+'#keep');
 }
 console.log('All '+checks+' editor checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
