(() => {
  'use strict';
  const CACHE='bracoffee_db_v1',META='bracoffee_sync_v2',RESCUE='bracoffee_saved_copy_v2';
  let revision=0,instanceId='',status='loading',queued=null,busy=false,latest=null,callbacks={};
  const readMeta=()=>{try{return JSON.parse(localStorage.getItem(META)||'null');}catch{return null;}};
  const records=data=>['purchases','samples','producers','stockLots','finance','sales'].reduce((sum,key)=>sum+(data?.[key]?.length||0),0);
  const cache=(key,value)=>{try{localStorage.setItem(key,value);}catch(error){console.warn('Cópia local indisponível',error);}};
  const persistMeta=pending=>cache(META,JSON.stringify({revision,instanceId,pending,lastSavedAt:new Date().toISOString()}));
  function setStatus(value){status=value;callbacks.onStatus?.(value);}
  function rescue(data){cache(RESCUE,JSON.stringify(data));callbacks.onRescue?.();}
  async function request(options={}) {
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch('/api/data'+(options.poll?'?revision='+revision+'&instanceId='+encodeURIComponent(instanceId):''),{credentials:'same-origin',cache:'no-store',...options,headers:{'Content-Type':'application/json',...options.headers},signal:controller.signal});
      if(response.status===401){location.replace('/login');throw new Error('Sessão encerrada.');}
      if(response.status===304)return null;
      const body=await response.json();
      if(response.status===409){latest=body;throw Object.assign(new Error('Dados atualizados em outro aparelho.'),{conflict:true});}
      if(!response.ok)throw new Error(body.error||'Não foi possível salvar.');
      return body;
    }finally{clearTimeout(timeout);}
  }
  async function flush() {
    if(busy||!queued||status==='conflict')return;
    busy=true;setStatus('saving');
    const snapshot=queued;queued=null;
    try {
      const result=await request({method:'PUT',body:JSON.stringify({baseRevision:revision,baseInstanceId:instanceId,data:JSON.parse(snapshot)})});
      revision=result.revision;instanceId=result.instanceId;persistMeta(Boolean(queued));
      setStatus(queued?'saving':'saved');
    }catch(error){
      if(!queued)queued=snapshot;persistMeta(true);
      if(error.conflict){rescue(JSON.parse(queued));setStatus('conflict');callbacks.onConflict?.();}
      else setStatus('offline');
    }finally{busy=false;}
    if(queued&&status==='saving')void flush();
  }
  async function connect(local,options) {
    callbacks=options||{};const meta=readMeta();
    try {
      const remote=await request();latest=remote;revision=remote.revision;instanceId=remote.instanceId;
      if(meta?.pending&&meta.instanceId!==instanceId&&records(remote.data)){rescue(local);setStatus('conflict');return local;}
      if(meta?.pending&&meta.instanceId===instanceId){
        if(meta.revision!==revision){rescue(local);setStatus('conflict');return local;}
        queued=JSON.stringify(local);persistMeta(true);setStatus('saving');void flush();return local;
      }
      if(!remote.data||(!records(remote.data)&&records(local))){
        queued=JSON.stringify(local);persistMeta(true);setStatus('saving');await flush();return status==='conflict'?(latest.data||local):local;
      }
      if(!meta&&records(local)&&JSON.stringify(local)!==JSON.stringify(remote.data))rescue(local);
      persistMeta(false);setStatus('saved');return remote.data;
    }catch{revision=meta?.revision||0;instanceId=meta?.instanceId||'';if(meta?.pending)queued=JSON.stringify(local);setStatus('offline');return local;}
  }
  function queue(data){queued=JSON.stringify(data);cache(CACHE,queued);persistMeta(true);setStatus('saving');void flush();}
  async function refresh() {
    if(status==='loading'||status==='conflict'||busy)return;
    if(queued){await flush();return;}
    if(callbacks.isEditing?.()&&status!=='offline')return;
    try {
      const remote=await request({poll:true});
      if(busy||queued||status==='conflict')return;
      if(remote&&(remote.revision>revision||remote.instanceId!==instanceId)) {
        if(callbacks.isEditing?.()){
          try{const local=JSON.parse(localStorage.getItem(CACHE)||'null');if(local)rescue(local);}catch{}
          latest=remote;setStatus('conflict');callbacks.onConflict?.();return;
        }
        latest=remote;revision=remote.revision;instanceId=remote.instanceId;persistMeta(false);
        if(remote.data){cache(CACHE,JSON.stringify(remote.data));callbacks.onRemote?.(remote.data);}
      }
      setStatus('saved');
    }catch{setStatus('offline');}
  }
  async function resolveConflict() {
    const remote=await request();latest=remote;revision=remote.revision;instanceId=remote.instanceId;queued=null;
    persistMeta(false);setStatus('saved');
    if(remote.data){cache(CACHE,JSON.stringify(remote.data));callbacks.onRemote?.(remote.data,true);}
  }
  window.BracoffeeSync={connect,queue,refresh,resolveConflict,get status(){return status;},get canWrite(){return status==='saved'||status==='saving';},get rescued(){try{return JSON.parse(localStorage.getItem(RESCUE)||'null');}catch{return null;}},async whenIdle(){for(let n=0;n<50&&(busy||queued)&&status==='saving';n++)await new Promise(r=>setTimeout(r,100));}};
  addEventListener('online',()=>void refresh());addEventListener('focus',()=>void refresh());
  setInterval(()=>{if(document.visibilityState==='visible')void refresh();},15000);
})();
