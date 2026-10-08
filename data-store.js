'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

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
  save(data,baseRevision,baseInstanceId) {
    if(baseInstanceId!==this.state.instanceId||!Number.isInteger(baseRevision)||baseRevision!==this.state.revision)return {status:409,state:this.state};
    if(!this.validate(data))return {status:400,error:'Dados inválidos.'};
    const previous=this.state;
    if(previous.data)fs.writeFileSync(path.join(this.backups,`version-${String(previous.revision).padStart(10,'0')}.json`),JSON.stringify(previous),{mode:0o600});
    const next={instanceId:previous.instanceId,revision:previous.revision+1,data,updatedAt:new Date().toISOString()};
    this.writeAtomic(next);this.state=next;
    const files=fs.readdirSync(this.backups).filter(name=>/^version-\d+\.json$/.test(name)).sort().reverse();
    files.slice(10).forEach(name=>{try{fs.unlinkSync(path.join(this.backups,name));}catch{}});
    return {status:200,state:{instanceId:next.instanceId,revision:next.revision,updatedAt:next.updatedAt}};
  }
}
module.exports=DataStore;
