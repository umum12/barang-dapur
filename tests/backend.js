// Backend GAS asli (semua *.gs) di dalam vm, dengan Spreadsheet/Cache/Content tiruan.
const fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto');
const H=7*3600000,pad=(n,l=2)=>String(n).padStart(l,'0');
module.exports=function createBackend(gasDir){
  const sheets={},cacheStore={};let ctx;
  const mkSheet=()=>{const data=[];return{
    getLastRow:()=>data.length,getLastColumn:()=>data.reduce((m,r)=>Math.max(m,r.length),0),
    getRange:(r,c,nr=1,nc=1)=>({
      getValues(){const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++){const v=(data[r-1+i]||[])[c-1+j];row.push(v===undefined?'':v);}o.push(row);}return o;},
      setValues(v){for(let i=0;i<v.length;i++){data[r-1+i]=data[r-1+i]||[];for(let j=0;j<v[i].length;j++)data[r-1+i][c-1+j]=v[i][j];}},
      getValue(){return this.getValues()[0][0];},setValue(v){this.setValues([[v]]);}}),
    appendRow:r=>data.push(r.slice()),deleteRow:i=>data.splice(i-1,1),setFrozenRows(){},autoResizeColumns(){},_d:data};};
  const driveFiles=[]; const props={};
  const folder={getId:()=>'FOLDER1',createFile:(blob)=>{driveFiles.push(blob);return {getUrl:()=>'https://drive.google.com/file/d/'+blob.name+'/view'};}};
  const DriveApp={createFolder:()=>folder,getFolderById:()=>folder};
  const PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>{props[k]=v;}})};
  const Utilities={getUuid:()=>crypto.randomUUID(),
    base64Decode:(s)=>{if(!/^[A-Za-z0-9+/]*={0,2}$/.test(s)||s.length%4)throw new Error('Invalid base64');return Array.from(Buffer.from(s,'base64'),(x)=>x>127?x-256:x);},
    newBlob:(bytes,mime,name)=>({bytes,mime,name}),
    formatDate:(d,tz,f)=>{const x=new Date(d.getTime()+H);return f.replace('yyyy',x.getUTCFullYear()).replace('MM',pad(x.getUTCMonth()+1)).replace('dd',pad(x.getUTCDate())).replace('HH',pad(x.getUTCHours())).replace('mm',pad(x.getUTCMinutes())).replace('ss',pad(x.getUTCSeconds()));},
    parseDate:(s,tz,f)=>{const m=s.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);const CD=vm.runInContext('Date',ctx);return new CD(Date.UTC(+m[1],m[2]-1,+m[3],+m[4],+m[5])-H);}};
  const now=()=>vm.runInContext('nowMs_()',ctx);
  const CacheService={getScriptCache:()=>({get:k=>{const e=cacheStore[k];if(!e)return null;if(now()>=e.exp){delete cacheStore[k];return null;}return e.v;},put:(k,v,ttl)=>{cacheStore[k]={v:String(v),exp:now()+(ttl||600)*1000};},remove:k=>{delete cacheStore[k];}})};
  const ContentService={MimeType:{JSON:'JSON'},createTextOutput:(x)=>({_s:x,_m:null,setMimeType(m){this._m=m;return this;},getContent(){return this._s;}})};
  const HtmlService={XFrameOptionsMode:{ALLOWALL:1},createTemplateFromFile:()=>({evaluate(){const c={_html:true,setTitle(){return c;},addMetaTag(){return c;},setXFrameOptionsMode(){return c;},setFaviconUrl(){return c;}};return c;}})};
  const SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=mkSheet())})};
  const LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
  ctx=vm.createContext({Utilities,SpreadsheetApp,LockService,CacheService,ContentService,HtmlService,DriveApp,PropertiesService,console});
  for(const f of fs.readdirSync(gasDir).filter(f=>f.endsWith('.gs')))
    vm.runInContext(fs.readFileSync(path.join(gasDir,f),'utf8').replace(/^const /gm,'var ').replace(/^let /gm,'var '),ctx);
  vm.runInContext('var __off=0; nowMs_=function(){return Date.now()+__off;};',ctx);
  const fresh=()=>vm.runInContext('_ss=null;_sheetCache={};_stockMapCache=null;_logRowsCache=null;_extraHeadersChecked=false;',ctx);
  return{ctx,sheets,cacheStore,fresh,driveFiles,
    doPost(body){fresh();return vm.runInContext('doPost',ctx)({postData:{contents:body}}).getContent();},
    advance(ms){vm.runInContext('__off+='+ms,ctx);},
    eval(expr){fresh();return vm.runInContext(expr,ctx);}};
};
