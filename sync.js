/* Encrypted GitHub Gist sync for editor 1. Never include credentials in this file. */
'use strict';
(()=>{
const GIST_ID='dbef1ae074ad15f515509926277af398';
const GIST_FILE='editor-sync.json';
const OWNER='chenginko-cloud';
const bridge=window.EditorBridge;
const metaKey=bridge.storageKey+':sync-meta-v1';
const rememberedKey=bridge.storageKey+':gist-token-remembered';
const button=document.querySelector('#syncButton');
const $=selector=>document.querySelector(selector);
let token='',connected=false,working=false,queued=false,conflict=null,timer=null;
let meta={revision:0,updateId:'',dirty:false};
try{meta={...meta,...JSON.parse(localStorage.getItem(metaKey)||'{}')};}catch(_){}
try{token=localStorage.getItem(rememberedKey)||'';}catch(_){}
const isEmpty=value=>!value.directories.length&&!value.articles.length;
function keepMeta(){try{localStorage.setItem(metaKey,JSON.stringify(meta));}catch(error){setStatus('error','同步状态无法保存');}}
function setStatus(state,label){button.dataset.state=state;button.textContent='☁ '+label;button.setAttribute('aria-label','跨设备同步：'+label);}
function schedule(ms=900){clearTimeout(timer);timer=setTimeout(()=>synchronize(),ms);}
function saveToken(value,remember){token=value;
  try{if(remember)localStorage.setItem(rememberedKey,value);
    else localStorage.removeItem(rememberedKey);}catch(error){setStatus('error','本机无法记住凭证');}}
function clearToken(){token='';connected=false;conflict=null;clearTimeout(timer);
  try{localStorage.removeItem(rememberedKey);}catch(_){}
  setStatus('off','未连接');}
async function github(path,method='GET',body,credential=token){
  const response=await fetch('https://api.github.com'+path,{
    method,cache:'no-store',headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+credential,
      'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})});
  if(!response.ok){if(response.status===401||response.status===403)throw Error('GitHub 凭证无效、无权访问，或接口已限流（HTTP '+response.status+'）');
    throw Error('GitHub 请求失败（HTTP '+response.status+'）');}
  return response.json();
}
async function readRemote(){const gist=await github('/gists/'+GIST_ID),file=gist.files?.[GIST_FILE];
  if(!file)throw Error('云端数据文件不存在');
  let content=file.content;
  if(file.truncated){if(!file.raw_url?.startsWith('https://gist.githubusercontent.com/'))throw Error('云端文件地址异常');
    const response=await fetch(file.raw_url,{cache:'no-store'});if(!response.ok)throw Error('云端大文件读取失败');content=await response.text();}
  const envelope=JSON.parse(content);
  if(envelope.format!=='wengao-sync-v1'||!Number.isSafeInteger(envelope.revision)||envelope.revision<0||
     (envelope.payload!==null&&typeof envelope.payload!=='object'))throw Error('云端数据格式不符');
  return envelope;
}
function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
function unbase64(value){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function derive(salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(token),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function pack(value){let bytes=new TextEncoder().encode(JSON.stringify(value)),compression='none';
  if(typeof CompressionStream!=='undefined'){bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());compression='gzip';}
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await derive(salt),bytes));
  return {compression,salt:base64(salt),iv:base64(iv),ciphertext:base64(encrypted)};
}
async function unpack(payload){try{const salt=unbase64(payload.salt),iv=unbase64(payload.iv),cipher=unbase64(payload.ciphertext);
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv},await derive(salt),cipher);
    let stream=new Blob([clear]).stream();
    if(payload.compression==='gzip'){if(typeof DecompressionStream==='undefined')throw Error('此浏览器无法解压云端文稿');stream=stream.pipeThrough(new DecompressionStream('gzip'));}
    else if(payload.compression!=='none')throw Error('未知的数据压缩格式');
    return JSON.parse(await new Response(stream).text());
  }catch(error){throw Error('无法解密云端文稿。请使用创建同步时的同一枚 Gist Token。'+(error.message||''));}}
function backupBeforeReplace(){const local=bridge.getData();if(isEmpty(local))return true;
  try{localStorage.setItem(bridge.storageKey+':backup-before-cloud-'+Date.now(),JSON.stringify(local));return true;}
  catch(error){alert('无法为本机数据生成恢复备份。请先通过「导入 / 导出」下载 JSON。');return false;}}
function applyRemote(remote,value){if(bridge.isEditorOpen()){setStatus('pending','编辑中，稍后同步');return false;}
  if(!backupBeforeReplace())return false;
  if(!bridge.applyCloud(value))return false;
  meta={revision:remote.revision,updateId:remote.updateId||'',dirty:false};keepMeta();conflict=null;
  setStatus('synced','已同步');return true;
}
function hasChangedSince(snapshot){return JSON.stringify(bridge.getData())!==snapshot;}
async function upload(base){if(bridge.isEditorDirty()){setStatus('pending','保存编辑后同步');return;}
  const current=await readRemote();
  if(current.revision!==base.revision||(current.updateId||'')!==(base.updateId||''))return markConflict(current);
  const snapshot=JSON.stringify(bridge.getData());
  const next={format:'wengao-sync-v1',revision:current.revision+1,updateId:crypto.randomUUID(),payload:await pack(JSON.parse(snapshot))};
  const content=JSON.stringify(next);
  if(new TextEncoder().encode(content).length>900000)throw Error('同步文件超过 900 KB，请先导出 JSON 备份；本机数据仍在。');
  await github('/gists/'+GIST_ID,'PATCH',{files:{[GIST_FILE]:{content}}});
  const verified=await readRemote();
  if(verified.updateId!==next.updateId)return markConflict(verified);
  meta={revision:next.revision,updateId:next.updateId,dirty:hasChangedSince(snapshot)};keepMeta();conflict=null;
  setStatus(meta.dirty?'pending':'synced',meta.dirty?'待同步':'已同步');if(meta.dirty)schedule(1200);
}
function markConflict(remote){conflict=remote;meta.dirty=true;keepMeta();setStatus('conflict','版本冲突，点此处理');}
async function reconcile(remote,interactive=false){
  if(!remote.payload){if(meta.updateId)return markConflict(remote);await upload(remote);return;}
  if(!meta.updateId){const cloud=await unpack(remote.payload),local=bridge.getData();
    if(isEmpty(local)||JSON.stringify(local)===JSON.stringify(cloud)){applyRemote(remote,cloud);return;}
    markConflict(remote);if(interactive)showConflict();return;}
  if(remote.updateId===meta.updateId){meta.revision=remote.revision;keepMeta();
    if(meta.dirty)await upload(remote);else setStatus('synced','已同步');return;}
  if(meta.dirty||remote.revision<=meta.revision){markConflict(remote);if(interactive)showConflict();return;}
  const cloud=await unpack(remote.payload);applyRemote(remote,cloud);
}
async function synchronize(interactive=false){if(!token||!connected)return;
  if(working){queued=true;return;}working=true;setStatus('working','同步中…');
  try{await reconcile(await readRemote(),interactive);}
  catch(error){setStatus('error','同步失败，点此重试');if(interactive)alert(error.message||String(error));}
  finally{working=false;if(queued){queued=false;schedule(200);}}
}
function createModal(title,description,html){const host=$('#modalHost');host.innerHTML=`<div class="modalShade"><div class="modal" role="dialog" aria-modal="true"><h2>${title}</h2><p>${description}</p>${html}</div></div>`;
  host.querySelector('.modalShade').onclick=e=>{if(e.target.classList.contains('modalShade'))host.innerHTML='';};return host;}
function showConnect(message=''){const host=createModal('连接跨设备同步','在每台设备输入你提供的部署凭证文件中的「Gist Token」。凭证不会写进公开网页代码。',
  `<form id="syncForm" class="syncForm"><input id="syncToken" type="password" autocomplete="off" placeholder="粘贴 Gist Token（不要使用仓库 Token）" required>
   <label><input id="rememberToken" type="checkbox">在此设备记住凭证（仅限私人设备）</label>
   <div class="syncHelp"><strong>同步方式：</strong>文稿在浏览器中用此凭证加密，再存入 GitHub Gist。默认只在当前页面使用凭证，重新打开需再输入。勾选记住后，同一 GitHub Pages 域名下的页面也可能读取已保存的凭证。</div>
   <div id="syncError" class="syncError"></div>
   <div class="modalActions"><button type="button" class="subtleButton" id="cancelSync">取消</button><button type="submit" class="primaryButton" id="connectSync">连接同步</button></div></form>`);
  $('#syncError').textContent=message;$('#syncToken').focus();$('#cancelSync').onclick=()=>host.innerHTML='';
  $('#syncForm').onsubmit=async e=>{e.preventDefault();const value=$('#syncToken').value.trim(),remember=$('#rememberToken').checked;
    $('#connectSync').disabled=true;$('#syncError').textContent='正在验证凭证…';
    try{const user=await github('/user','GET',undefined,value);
      if(user.login?.toLowerCase()!==OWNER)throw Error('此 Gist Token 不属于预期的 GitHub 账号');
      saveToken(value,remember);connected=true;host.innerHTML='';await synchronize(true);
    }catch(error){if(host.querySelector('#syncError')){$('#syncError').textContent=error.message||String(error);$('#connectSync').disabled=false;}
      setStatus('error','连接失败，点此重试');}
  };
}
function downloadLocal(){const blob=new Blob([JSON.stringify(bridge.getData(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='同步冲突前本机备份-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function showConflict(){if(!conflict)return synchronize(true);
  const host=createModal('发现两个版本','云端和本机都有不同修改。请选择保留的版本；操作前建议先下载本机备份。',
  `<div class="syncStatus">本机：${bridge.getData().articles.length} 篇文稿 · 云端版本：${conflict.revision}</div>
   <div id="syncError" class="syncError"></div><div class="modalActions"><button class="subtleButton" id="saveConflictBackup">下载本机备份</button>
   <button class="subtleButton" id="useCloud">使用云端</button><button class="primaryButton" id="useLocal">用本机覆盖云端</button><button class="subtleButton" id="cancelConflict">稍后处理</button></div>`);
  $('#saveConflictBackup').onclick=downloadLocal;$('#cancelConflict').onclick=()=>host.innerHTML='';
  $('#useCloud').onclick=async()=>{try{const newest=await readRemote();
      if(newest.updateId!==conflict.updateId)throw Error('云端又有新版本，请重新检查冲突');
      const cloud=newest.payload?await unpack(newest.payload):{version:2,directories:[],articles:[]};if(applyRemote(newest,cloud))host.innerHTML='';
    }catch(error){$('#syncError').textContent=error.message||String(error);}};
  $('#useLocal').onclick=async()=>{try{working=true;setStatus('working','同步中…');await upload(conflict);
      if(!conflict)host.innerHTML='';else $('#syncError').textContent='云端又有更新，请重新检查冲突';
    }catch(error){$('#syncError').textContent=error.message||String(error);setStatus('error','同步失败，点此重试');}finally{working=false;}};
}
function showConnected(){const host=createModal('跨设备同步','页面打开期间会定期检查云端版本，并在保存文稿或修改目录后上传。',
  `<div class="syncStatus">当前状态：${button.textContent}</div><div id="syncError" class="syncError"></div>
   <div class="modalActions"><button id="syncNow" class="primaryButton">立即检查同步</button><button id="replaceToken" class="subtleButton">更换凭证</button>
   <button id="disconnect" class="subtleButton">断开此设备</button><button id="closeSync" class="subtleButton">关闭</button></div>`);
  $('#closeSync').onclick=()=>host.innerHTML='';$('#syncNow').onclick=async()=>{host.innerHTML='';await synchronize(true);};
  $('#replaceToken').onclick=()=>showConnect();$('#disconnect').onclick=()=>{clearToken();host.innerHTML='';};
}
button.onclick=()=>{if(conflict)showConflict();else if(!token||!connected)showConnect();else showConnected();};
bridge.onLocalChanged=()=>{meta.dirty=true;keepMeta();setStatus(token?'pending':'off',token?'待同步':'未连接');if(connected)schedule();};
bridge.onEditorClosed=()=>{if(connected)schedule(200);};
window.addEventListener('online',()=>{if(connected)schedule(100);});
window.addEventListener('focus',()=>{if(connected)schedule(100);});
setInterval(()=>{if(connected&&!document.hidden)synchronize();},30000);
if(token){setStatus('working','连接中…');(async()=>{try{const user=await github('/user');
    if(user.login?.toLowerCase()!==OWNER)throw Error('凭证账号不正确');connected=true;await synchronize();}
    catch(error){setStatus('error','连接失败，点此重试');}})();}
else setStatus('off','未连接');
})();
