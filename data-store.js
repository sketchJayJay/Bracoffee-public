'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const Commercial=require('./commercial-core');

class DataStore {
  constructor(directory) {
    this.directory=directory;
    this.file=path.join(directory,'bracoffee.json');
    this.backups=path.join(directory,'backups');
    fs.mkdirSync(this.backups,{recursive:true});
    if(fs.existsSync(this.file)) {
      this.state=JSON.parse(fs.readFileSync(this.file,'utf8'));
      if(!Number.isInteger(this.state.revision)||!this.state.instanceId)throw new Error('Arquivo de dados inválido. Restaure uma cópia válida antes de iniciar.');
    } else {
      if(fs.readdirSync(this.backups).some(n=>/^(version-|daily-|manual-).*\.json$/.test(n)))throw Error('Base principal ausente, mas existem cópias de segurança. Preserve o volume e restaure uma cópia antes de iniciar.');
      this.state={instanceId:crypto.randomUUID(),revision:0,data:null,updatedAt:null};
      this.writeAtomic(this.state);
    }
  }
  read(){return this.state;}
  validate(data) {
    return data&&typeof data==='object'&&!Array.isArray(data)&&data.settings&&typeof data.settings==='object'&&['purchases','stockLots','producers','samples','finance','sales'].every(key=>Array.isArray(data[key]));
  }
  writeAtomic(state) {
    const temporary=this.file+'.tmp';
    const fd=fs.openSync(temporary,'w',0o600);
    try{fs.writeFileSync(fd,JSON.stringify(state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,this.file);
  }
  counts(data){return Object.fromEntries(['purchases','stockLots','sales','finance','stockGuides','producers'].map(k=>[k,(data?.[k]||[]).length]));}
  listBackups(){return fs.readdirSync(this.backups).filter(n=>/^(version-\d+|daily-\d{4}-\d{2}-\d{2}|manual-\d+-\d+)\.json$/.test(n)).map(name=>{try{const s=JSON.parse(fs.readFileSync(path.join(this.backups,name),'utf8'));return {name,revision:s.revision,updatedAt:s.updatedAt,createdAt:fs.statSync(path.join(this.backups,name)).mtime.toISOString(),kind:name.startsWith('daily-')?'daily':name.startsWith('manual-')?'manual':'version',counts:this.counts(s.data)};}catch{return null;}}).filter(Boolean).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
  readBackup(name){if(!/^(version-\d+|daily-\d{4}-\d{2}-\d{2}|manual-\d+-\d+)\.json$/.test(name))throw Error('Cópia inválida.');const s=JSON.parse(fs.readFileSync(path.join(this.backups,name),'utf8'));if(!this.validate(s.data))throw Error('Dados inválidos na cópia.');return s;}
  makeBackup(){if(!this.state.data)throw Error('Ainda não há dados para copiar.');const name='manual-'+Date.now()+'-'+this.state.revision+'.json';fs.writeFileSync(path.join(this.backups,name),JSON.stringify(this.state),{mode:0o600});this.prune('manual-',10);return {name,revision:this.state.revision,updatedAt:this.state.updatedAt};}
  prune(prefix,limit){fs.readdirSync(this.backups).filter(n=>n.startsWith(prefix)&&n.endsWith('.json')).sort().reverse().slice(limit).forEach(n=>{try{fs.unlinkSync(path.join(this.backups,n));}catch{}});}
  save(data,baseRevision,baseInstanceId,options={}) {
    if(baseInstanceId!==this.state.instanceId||!Number.isInteger(baseRevision)||baseRevision!==this.state.revision)return {status:409,state:this.state};
    if(!this.validate(data))return {status:400,error:'Dados inválidos.'};
    const issues=Commercial.audit(data);if(issues.length)return {status:400,error:issues.join(' ')};
    const previous=this.state;
    const keys=['purchases','stockLots','sales','finance','samples','producers','customers','stockGuides'];
    const total=d=>keys.reduce((n,k)=>n+(d?.[k]?.length||0),0);
    if(total(previous.data)>0&&total(data)===0&&!options.allowReset)return {status:400,error:'Uma base com registros não pode ser substituída por uma base vazia sem restauração autorizada.'};
    if(previous.data){const day=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),daily=path.join(this.backups,'daily-'+day+'.json');if(!fs.existsSync(daily))fs.writeFileSync(daily,JSON.stringify(previous),{mode:0o600});this.prune('daily-',30);}

    if(previous.data)fs.writeFileSync(path.join(this.backups,`version-${String(previous.revision).padStart(10,'0')}.json`),JSON.stringify(previous),{mode:0o600});
    const next={instanceId:previous.instanceId,revision:previous.revision+1,data,updatedAt:new Date().toISOString()};
    this.writeAtomic(next);this.state=next;
    const files=fs.readdirSync(this.backups).filter(name=>/^version-\d+\.json$/.test(name)).sort().reverse();
    files.slice(10).forEach(name=>{try{fs.unlinkSync(path.join(this.backups,name));}catch{}});
    return {status:200,state:{instanceId:next.instanceId,revision:next.revision,updatedAt:next.updatedAt}};
  }
}
module.exports=DataStore;
