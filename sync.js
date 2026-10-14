(() => {
  'use strict';
  const CACHE='bracoffee_db_v1',META='bracoffee_sync_v2',RESCUE='bracoffee_saved_copy_v2',HISTORY='bracoffee_local_copies_v4';
  let revision=0,instanceId='',status='loading',queued=null,busy=false,latest=null,callbacks={},exclusive=false;
  const purchaseAuthorizations=new Map();
  const readMeta=()=>{try{return JSON.parse(localStorage.getItem(META)||'null');}catch{return null;}};
  const records=data=>['purchases','samples','producers','stockLots','finance','sales','customers','stockGuides','stockMovements'].reduce((sum,key)=>sum+(data?.[key]?.length||0),0);
  const meaningful=data=>records(data)>0||Boolean(data?.settings&&Object.keys(data.settings).length);
  const cache=(key,value)=>{try{localStorage.setItem(key,value);}catch(error){console.warn('Cópia local indisponível',error);}};
  const persistMeta=pending=>cache(META,JSON.stringify({revision,instanceId,pending,lastSavedAt:new Date().toISOString()}));
  function setStatus(value){status=value;callbacks.onStatus?.(value);}
  function archive(data,reason){if(!meaningful(data))return;try{const entries=JSON.parse(localStorage.getItem(HISTORY)||'[]'),encoded=JSON.stringify(data);if(entries[0]&&JSON.stringify(entries[0].data)===encoded)return;entries.unshift({at:new Date().toISOString(),revision,instanceId,reason,data});while(entries.length>4||JSON.stringify(entries).length>1000000){if(entries.length===1)return;entries.pop();}cache(HISTORY,JSON.stringify(entries));}catch{}}
  function localCopies(){try{const entries=JSON.parse(localStorage.getItem(HISTORY)||'[]'),copy=JSON.parse(localStorage.getItem(RESCUE)||'null');if(copy&&meaningful(copy)&&!entries.some(e=>JSON.stringify(e.data)===JSON.stringify(copy)))entries.push({at:'',reason:'Cópia preservada',data:copy});return entries;}catch{return [];}}
  function rescue(data){if(!meaningful(data))return;archive(data,'Antes de carregar outra base');cache(RESCUE,JSON.stringify(data));callbacks.onRescue?.();}
  function currentLocal(){try{return JSON.parse(localStorage.getItem(CACHE)||'null');}catch{return null;}}

  async function request(options={}) {
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch('/api/data'+(options.poll?'?revision='+revision+'&instanceId='+encodeURIComponent(instanceId):''),{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...options.headers},signal:controller.signal});
      if(response.status===401){location.replace('/login');throw new Error('Sessão encerrada.');}
      if(response.status===304)return null;
      const body=await response.json();
      if(response.status===409){latest=body;throw Object.assign(new Error('Dados atualizados em outro aparelho.'),{conflict:true});}
      if(!response.ok)throw Object.assign(new Error(body.error||'Não foi possível salvar.'),{invalid:response.status>=400&&response.status<500});
      return body;
    }finally{clearTimeout(timeout);}
  }
  async function flush() {
    if(busy||!queued||['conflict','blocked'].includes(status))return;
    busy=true;setStatus('saving');
    const snapshot=queued;queued=null;
    try {
      const result=await request({method:'PUT',body:JSON.stringify({baseRevision:revision,baseInstanceId:instanceId,data:JSON.parse(snapshot),purchaseAuthorizations:Array.from(purchaseAuthorizations.values()).filter(a=>a.exp>Date.now()).map(a=>a.token)})});
      revision=result.revision;instanceId=result.instanceId;persistMeta(Boolean(queued));
      setStatus(queued?'saving':'saved');
    }catch(error){
      if(!queued)queued=snapshot;persistMeta(true);
      if(error.conflict){rescue(JSON.parse(queued));setStatus('conflict');callbacks.onConflict?.();}
      else if(error.invalid){rescue(JSON.parse(queued));setStatus('blocked');callbacks.onError?.(error.message);}else setStatus('offline');
    }finally{busy=false;}
    if(queued&&status==='saving')void flush();
  }
  async function connect(local,options) {
    callbacks=options||{};const meta=readMeta();
    try {
      const remote=await request();latest=remote;
      if(meta&&((records(local)>0||meta.revision>0)&&meta.instanceId!==remote.instanceId||records(local)>0&&remote.data&&!records(remote.data))){revision=meta.revision;instanceId=meta.instanceId;rescue(local);setStatus('conflict');return local;}
      revision=remote.revision;instanceId=remote.instanceId;
      if(meta?.pending&&meta.instanceId!==instanceId&&records(remote.data)){rescue(local);setStatus('conflict');return local;}
      if(meta?.pending&&meta.instanceId===instanceId){
        if(meta.revision!==revision){rescue(local);setStatus('conflict');return local;}
        queued=JSON.stringify(local);persistMeta(true);setStatus('saving');void flush();return local;
      }
      if(!remote.data||(!records(remote.data)&&records(local))){
        queued=JSON.stringify(local);persistMeta(true);setStatus('saving');await flush();return status==='conflict'?(latest.data||local):local;
      }
      if(!meta&&records(local)&&JSON.stringify(local)!==JSON.stringify(remote.data))rescue(local);
      archive(local,'Antes da sincronização');persistMeta(false);setStatus('saved');return remote.data;
    }catch{revision=meta?.revision||0;instanceId=meta?.instanceId||'';if(meta?.pending)queued=JSON.stringify(local);setStatus('offline');return local;}
  }
  function queue(data){queued=JSON.stringify(data);cache(CACHE,queued);persistMeta(true);setStatus('saving');void flush();}
  async function refresh() {
    if(['loading','conflict','blocked'].includes(status)||busy)return;
    if(queued){await flush();return;}
    if(callbacks.isEditing?.()&&status!=='offline')return;
    try {
      const remote=await request({poll:true});
      if(busy||queued||status==='conflict')return;
      if(remote&&(remote.revision>revision||remote.instanceId!==instanceId)) {
        const existing=currentLocal();if(callbacks.isEditing?.()||((records(existing)>0||revision>0)&&remote.instanceId!==instanceId)||(records(existing)>0&&!records(remote.data))){
          try{const local=JSON.parse(localStorage.getItem(CACHE)||'null');if(local)rescue(local);}catch{}
          latest=remote;setStatus('conflict');callbacks.onConflict?.();return;
        }
        archive(existing,'Antes de atualizar deste servidor');latest=remote;revision=remote.revision;instanceId=remote.instanceId;persistMeta(false);
        if(remote.data){cache(CACHE,JSON.stringify(remote.data));callbacks.onRemote?.(remote.data);}
      }
      setStatus('saved');
    }catch{setStatus('offline');}
  }
  async function resolveConflict() {
    const remote=await request();rescue(currentLocal());if(!remote.data)throw Error('O servidor não tem uma base cadastrada. Confira o armazenamento ou restaure uma cópia antes de continuar.');latest=remote;revision=remote.revision;instanceId=remote.instanceId;queued=null;
    persistMeta(false);setStatus('saved');
    if(remote.data){cache(CACHE,JSON.stringify(remote.data));callbacks.onRemote?.(remote.data,true);}
  }
  async function commitDeletion(data,password,restoreBackup=false){
    await window.BracoffeeSync.whenIdle();
    if(busy||(!restoreBackup&&(queued||status!=='saved'))||(restoreBackup&&!['saved','blocked','conflict','offline'].includes(status)))throw Error('Aguarde a sincronização antes de continuar.');
    const priorStatus=status;busy=true;exclusive=true;setStatus('saving');
    try{
      archive(currentLocal(),restoreBackup?'Antes de restaurar backup':'Antes de excluir lote');
      const remote=restoreBackup?await request():{revision,instanceId};
      const result=await request({method:'PUT',body:JSON.stringify({baseRevision:remote.revision,baseInstanceId:remote.instanceId,data,deletePassword:password,restoreBackup})});
      revision=result.revision;instanceId=result.instanceId;queued=null;cache(CACHE,JSON.stringify(data));persistMeta(false);setStatus('saved');callbacks.onRemote?.(data);
    }catch(error){if(error.conflict){setStatus('conflict');callbacks.onConflict?.();}else setStatus(priorStatus);throw error;}finally{busy=false;exclusive=false;}
  }
  window.BracoffeeSync={connect,queue,commitDeletion,refresh,resolveConflict,localCopies,setPurchaseAuthorization:(id,action,permission)=>purchaseAuthorizations.set(id+':'+action,permission),hasPurchaseAuthorization:(id,action)=>Number(purchaseAuthorizations.get(id+':'+action)?.exp||0)>Date.now()+1000,preserveLocal:reason=>archive(currentLocal(),reason),get remoteSummary(){return latest?{changedBase:latest.instanceId!==instanceId,counts:Object.fromEntries(['purchases','stockLots','sales'].map(k=>[k,latest.data?.[k]?.length||0]))}:null;},get status(){return status;},get canWrite(){return !exclusive&&(status==='saved'||status==='saving');},get rescued(){try{return JSON.parse(localStorage.getItem(RESCUE)||'null');}catch{return null;}},async whenIdle(){for(let n=0;n<50&&(busy||queued)&&status==='saving';n++)await new Promise(r=>setTimeout(r,100));}};
  addEventListener('online',()=>void refresh());addEventListener('focus',()=>void refresh());
  setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);
})();
