'use strict';
// Read-only diagnostic. Never creates, replaces or deletes a database.
const fs=require('node:fs'),path=require('node:path');
const directory=path.resolve(process.argv[2]||process.env.DATA_DIR||'/app/data');
const counts=data=>Object.fromEntries(['purchases','stockLots','sales','finance','stockGuides','producers','samples'].map(k=>[k,Array.isArray(data?.[k])?data[k].length:0]));
function inspect(file){try{const s=JSON.parse(fs.readFileSync(file,'utf8'));return {name:path.basename(file),readable:true,revision:s.revision,updatedAt:s.updatedAt,counts:counts(s.data)};}catch(e){return {name:path.basename(file),readable:false,error:e.code||'JSON inválido'};}}
const backups=path.join(directory,'backups');
console.log(JSON.stringify({directory,primary:inspect(path.join(directory,'bracoffee.json')),copies:fs.existsSync(backups)?fs.readdirSync(backups).filter(n=>/^(version-|daily-|manual-).*\.json$/.test(n)).map(n=>inspect(path.join(backups,n))):[]},null,2));
