'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const credential='test-credential-with-no-real-access',root=__dirname,storage='wengao-blank-editor-v1:wengao-blank-editor-1';
const empty=()=>({version:2,directories:[],articles:[]});
const article=title=>({version:2,directories:[],articles:[{id:'a',title,body:'正文\n\n中文 🌱 与空行',dir:''}]});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await wait(10);}throw Error('同步测试等待超时');}
function gate(){let release;return {promise:new Promise(r=>{release=r;}),release:()=>release()};}
const b64=bytes=>Buffer.from(bytes).toString('base64');
async function key(token,salt){const material=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(token),'PBKDF2',false,['deriveKey']);return webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encrypt(value,token=credential){const salt=webcrypto.getRandomValues(new Uint8Array(16)),iv=webcrypto.getRandomValues(new Uint8Array(12)),ciphertext=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},await key(token,salt),new TextEncoder().encode(JSON.stringify(value)));return {compression:'none',salt:b64(salt),iv:b64(iv),ciphertext:b64(ciphertext)};}
async function decrypt(payload){const salt=Buffer.from(payload.salt,'base64'),iv=Buffer.from(payload.iv,'base64'),cipher=Buffer.from(payload.ciphertext,'base64');const clear=await webcrypto.subtle.decrypt({name:'AES-GCM',iv},await key(credential,salt),cipher);let stream=new Blob([clear]).stream();if(payload.compression==='gzip')stream=stream.pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(stream).text());}
let checks=0;
function check(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
class Assets extends ResourceLoader{fetch(url){const name=new URL(url).pathname.split('/').pop();let source=fs.readFileSync(path.join(root,name));if(name==='sync.js'&&process.env.BASELINE_SYNC_SOURCE)source=fs.readFileSync(process.env.BASELINE_SYNC_SOURCE);if(name==='sync.js')source=Buffer.from(source.toString().replace(/\}\)\(\);\s*$/,`window.__syncTest={pack,unpack,synchronize,clearToken,showConnect,get state(){return {connected,working,meta:{...meta},conflict};}};\n})();`));return Promise.resolve(source);}}
async function create({seed=empty(),remote={format:'wengao-sync-v1',revision:0,updateId:'',payload:null},meta,remember=true}={}){
 const mock={remote,patches:[],calls:[],readGate:null,encryptGate:null,decryptGate:null,fail:false},errors=[],alerts=[];
 const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/CSS/.test(e.message))errors.push(e.message);});
 const dom=new JSDOM(fs.readFileSync(path.join(root,'desktop.html'),'utf8'),{url:'https://example.test/wengao-blank-editor-1/desktop.html?mode=desktop',resources:new Assets(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.matchMedia=()=>({matches:false});w.alert=m=>alerts.push(m);w.confirm=()=>true;
  Object.assign(w,{Blob,Response,TextEncoder,CompressionStream,DecompressionStream});
  const proxy={...webcrypto,randomUUID:()=>webcrypto.randomUUID(),getRandomValues:a=>webcrypto.getRandomValues(a),subtle:{importKey:(...a)=>webcrypto.subtle.importKey(...a),deriveKey:(...a)=>webcrypto.subtle.deriveKey(...a),encrypt:async(...a)=>{const result=await webcrypto.subtle.encrypt(...a);if(mock.encryptGate){mock.encryptStarted=true;await mock.encryptGate.promise;}return result;},decrypt:async(...a)=>{const result=await webcrypto.subtle.decrypt(...a);if(mock.decryptGate){mock.decryptStarted=true;await mock.decryptGate.promise;}return result;}}};
  Object.defineProperty(w,'crypto',{value:proxy});
  w.localStorage.setItem(storage,JSON.stringify(seed));if(meta)w.localStorage.setItem(storage+':sync-meta-v1',JSON.stringify(meta));if(remember)w.localStorage.setItem(storage+':gist-token-remembered',credential);
  w.fetch=async(url,options={})=>{
   mock.calls.push({url,method:options.method||'GET'});
   assert.ok(String(url).startsWith('https://api.github.com/'),'禁止测试调用非模拟的网络地址');
   assert.equal(options.headers.Authorization,'Bearer '+credential);
   if(mock.fail)return new Response('{}',{status:503});
   if(url.endsWith('/user'))return new Response(JSON.stringify({login:'chenginko-cloud'}));
   if(options.method==='PATCH'){
    const body=JSON.parse(options.body);mock.patches.push(body);mock.remote=JSON.parse(body.files['editor-sync.json'].content);
   }else if(mock.readGate){mock.readStarted=true;await mock.readGate.promise;}
   return new Response(JSON.stringify({files:{'editor-sync.json':{content:JSON.stringify(mock.remote)}}}));
  };
 }});
 const w=dom.window,$=id=>w.document.getElementById(id);
 await until(()=>w.__syncTest&&(remember?$('syncButton').dataset.state==='synced'||$('syncButton').dataset.state==='conflict':$('syncButton').dataset.state==='off'));
 return {dom,w,$,mock,alerts,errors,h:w.__syncTest};
}
function localEdit(t,title){t.$('newArticle').click();t.$('titleInput').value=title;t.$('bodyInput').value='刚保存的本机正文';t.$('saveArticle').click();t.$('backEditor').click();}
async function base(){return create({seed:article('本机原文'),remote:{format:'wengao-sync-v1',revision:1,updateId:'base',payload:await encrypt(article('本机原文'))},meta:{revision:1,updateId:'base',dirty:false}});}
(async()=>{
 const t=await create();
 try{
  check('首次连接空云端仍按原格式上传加密数据',t.mock.patches.length===1&&t.mock.remote.format==='wengao-sync-v1'&&t.mock.remote.revision===1);
  check('上传密文与旧协议可互相解密',JSON.stringify(await decrypt(t.mock.remote.payload))===JSON.stringify(empty()));
  const packed=await t.h.pack(article('包含引号 O\'Reilly 和中文'));
  check('加密压缩往返保留全文',JSON.stringify(await decrypt(packed))===JSON.stringify(article('包含引号 O\'Reilly 和中文')));
  const old=await encrypt(article('旧版未压缩数据'));
  check('可解密旧版未压缩云端数据',JSON.stringify(await t.h.unpack(old))===JSON.stringify(article('旧版未压缩数据')));
  check('请求上传内容不包含明文',!JSON.stringify(t.mock.patches).includes('正文'));
  t.mock.fail=true;await t.h.synchronize();check('网络失败不改变本机文稿',JSON.stringify(t.w.EditorBridge.getData())===JSON.stringify(empty())&&t.$('syncButton').dataset.state==='error');
  t.mock.fail=false;await t.h.synchronize();check('网络恢复可继续同步',t.$('syncButton').dataset.state==='synced');
 }finally{t.dom.window.close();}
 const download=await base();
 try{
  download.mock.remote={format:'wengao-sync-v1',revision:2,updateId:'cloud',payload:await encrypt(article('云端新版'))};
  await download.h.synchronize();check('正常云端更新仍下载到本机',download.w.EditorBridge.getData().articles[0].title==='云端新版');
  check('替换前保留恢复备份',[...Array(download.w.localStorage.length)].some((_,i)=>download.w.localStorage.key(i).includes(':backup-before-cloud-')));
  check('正常下载不反向上传',download.mock.patches.length===0);
 }finally{download.dom.window.close();}
 const race=await base();
 try{
  race.mock.remote={format:'wengao-sync-v1',revision:2,updateId:'cloud',payload:await encrypt(article('云端新版'))};race.mock.decryptGate=gate();
  const pending=race.h.synchronize();await until(()=>race.mock.decryptStarted);localEdit(race,'刚保存的本机版本');race.mock.decryptGate.release();await pending;
  check('解密期间本机修改不被云端覆盖',race.w.EditorBridge.getData().articles.some(a=>a.title==='刚保存的本机版本'));
  check('解密期间双端修改进入原有冲突处理',race.$('syncButton').dataset.state==='conflict'&&race.mock.patches.length===0);
 }finally{race.dom.window.close();}
 const disconnect=await base();
 try{
  disconnect.mock.remote={format:'wengao-sync-v1',revision:2,updateId:'cloud',payload:await encrypt(article('不应应用的云端'))};disconnect.mock.readGate=gate();
  const pending=disconnect.h.synchronize();await until(()=>disconnect.mock.readStarted);disconnect.$('syncButton').click();disconnect.$('disconnect').click();disconnect.mock.readGate.release();await pending;
  check('断开后晚到读取不改变文稿',disconnect.w.EditorBridge.getData().articles[0].title==='本机原文');
  check('断开后状态和凭证清理保持正确',disconnect.$('syncButton').dataset.state==='off'&&!disconnect.h.state.connected&&!disconnect.w.localStorage.getItem(storage+':gist-token-remembered'));
 }finally{disconnect.dom.window.close();}
 const upload=await base();
 try{
  localEdit(upload,'本机新增');upload.mock.encryptGate=gate();const pending=upload.h.synchronize();await until(()=>upload.mock.encryptStarted);
  upload.$('syncButton').click();upload.$('disconnect').click();upload.mock.encryptGate.release();await pending;
  check('断开后未发出的上传被取消',upload.mock.patches.length===0&&upload.$('syncButton').dataset.state==='off');
  check('取消上传仍保留本机保存数据',upload.w.EditorBridge.getData().articles.some(a=>a.title==='本机新增'));
 }finally{upload.dom.window.close();}
 const dormant=await create({remember:false});
 try{
  check('未连接同步时不访问云端',dormant.mock.calls.length===0);
  dormant.$('syncButton').click();dormant.$('syncToken').value=credential;
  // 模拟连接验证请求在用户取消后才返回。
  const original=dormant.w.fetch,verifyGate=gate();dormant.w.fetch=async(...args)=>{if(args[0].endsWith('/user'))await verifyGate.promise;return original(...args);};
  const form=dormant.$('syncForm');const pending=form.onsubmit({preventDefault(){},currentTarget:form});dormant.$('cancelSync').click();verifyGate.release();await pending;
  check('取消连接后晚到验证不自动连接或上传',!dormant.h.state.connected&&dormant.mock.patches.length===0);
 }finally{dormant.dom.window.close();}
 console.log('All '+checks+' synchronization checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
