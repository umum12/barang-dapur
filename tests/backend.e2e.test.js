// Tes backend GAS (kode asli di vm + Spreadsheet/Cache tiruan): transaksi, edit/hapus, koreksi, riwayat, laporan, gateway/token.
const fs=require('fs'),vm=require('vm');
const H=7*3600000;
const pad=(n,l=2)=>String(n).padStart(l,'0');
var ctx;const Utilities={
  getUuid:()=>require('crypto').randomUUID(),
  formatDate:(d,tz,f)=>{const x=new Date(d.getTime()+H);return f.replace('yyyy',x.getUTCFullYear()).replace('MM',pad(x.getUTCMonth()+1)).replace('dd',pad(x.getUTCDate())).replace('HH',pad(x.getUTCHours())).replace('mm',pad(x.getUTCMinutes())).replace('ss',pad(x.getUTCSeconds()));},
  parseDate:(s,tz,f)=>{const m=s.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);const CD=vm.runInContext('Date',ctx);return new CD(Date.UTC(+m[1],m[2]-1,+m[3],+m[4],+m[5])-H);}
};
function makeSheet(){const data=[];let reads=0;return{get _reads(){return reads;},
  getLastRow:()=>data.length,getLastColumn:()=>data.reduce((m,r)=>Math.max(m,r.length),0),
  getRange:(r,c,nr=1,nc=1)=>({
    getValues(){if(r===2&&nc>=13)reads++;const o=[];for(let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++){const v=(data[r-1+i]||[])[c-1+j];row.push(v===undefined?'':v);}o.push(row);}return o;},
    setValues(v){for(let i=0;i<v.length;i++){data[r-1+i]=data[r-1+i]||[];for(let j=0;j<v[i].length;j++)data[r-1+i][c-1+j]=v[i][j];}},
    getValue(){return this.getValues()[0][0];},setValue(v){this.setValues([[v]]);}}),
  appendRow:r=>data.push(r.slice()),deleteRow:i=>data.splice(i-1,1),setFrozenRows(){},autoResizeColumns(){},_d:data};}

const cacheStore={};
const CacheService={getScriptCache:()=>({
  get:k=>{const e=cacheStore[k];if(!e)return null;if(vm.runInContext('nowMs_()',ctx)>=e.exp){delete cacheStore[k];return null;}return e.v;},
  put:(k,v,ttl)=>{cacheStore[k]={v:String(v),exp:vm.runInContext('nowMs_()',ctx)+(ttl||600)*1000};},
  remove:k=>{delete cacheStore[k];}})};
const ContentService={MimeType:{JSON:'JSON'},createTextOutput:(x)=>({_s:x,_m:null,setMimeType(m){this._m=m;return this;},getContent(){return this._s;}})};
const HtmlService={XFrameOptionsMode:{ALLOWALL:1},createTemplateFromFile:()=>({evaluate(){const c={_html:true,_favicon:null,setTitle(){return c;},addMetaTag(){return c;},setXFrameOptionsMode(){return c;},setFaviconUrl(u){c._favicon=u;return c;}};return c;}})};
const sheets={};
const SpreadsheetApp={getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=makeSheet())})};
const LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
ctx={Utilities,SpreadsheetApp,LockService,CacheService,ContentService,HtmlService,console};vm.createContext(ctx);
const GASDIR=require('path').resolve(__dirname,'..','gas');
for(const f of fs.readdirSync(GASDIR).filter(f=>f.endsWith('.gs')))
  vm.runInContext(fs.readFileSync(GASDIR+'/'+f,'utf8').replace(/^const /gm,'var ').replace(/^let /gm,'var '),ctx);
const call=(fn,arg)=>vm.runInContext(`${fn}(${JSON.stringify(arg)})`,ctx);
vm.runInContext('var __off=0; nowMs_=function(){return Date.now()+__off;};',ctx);
const advance=(ms)=>vm.runInContext('__off+='+ms,ctx);
const alignWindow=()=>{const n=vm.runInContext('nowMs_()',ctx);advance(600000-(n%600000));};
// tiap panggilan = "eksekusi baru": reset cache per-eksekusi
const fresh=()=>vm.runInContext('_ss=null;_sheetCache={};_stockMapCache=null;_logRowsCache=null;_extraHeadersChecked=false;',ctx);
const run=(fn,arg)=>{fresh();const r=call(fn,arg);
 if(r&&r.ok&&r.recent===undefined&&fn!=='getRiwayat'){fresh();r.recent=call('getRiwayat',typeof arg==='string'?arg:arg.accessCode).recent;}
 return r;};
const raw=(fn,arg)=>{fresh();return call(fn,arg);};
const stock=()=>{fresh();const s=vm.runInContext('getStocks_()',ctx);const o={};s.forEach(x=>o[x.key]=x.stock);return o;};
let pass=0,failn=0;
const t=(name,cond,extra='')=>{console.log((cond?'PASS':'FAIL').padEnd(5),name,extra);cond?pass++:failn++;};
const iso=(ms)=>{const x=new Date(Date.now()+ms+H);return x.toISOString().slice(0,16);};

run('getDashboard','ADMIN');
let r=run('submitTransaction',{accessCode:'EDO',items:[{key:'kopi',qty:3},{key:'gula',qty:2}],note:'a'});
t('AMBIL awal',r.ok&&stock().kopi===17&&stock().gula===18);
const id=r.recent[0].txId;

r=run('editTransaction',{accessCode:'EDO',txId:id,items:[{key:'kopi',qty:5},{key:'spons',qty:1}],note:'a',txTime:''});
t('edit item: kopi 3->5, gula dihapus, spons ditambah',r.ok&&stock().kopi===15&&stock().gula===20&&stock().spons===19,JSON.stringify(stock()));
t('baris log terbarui + audit', r.recent[0].itemsText.includes('Kopi -5')&&r.recent[0].edited&&r.recent[0].editInfo.includes('sebelum'), r.recent[0].itemsText);

r=run('editTransaction',{accessCode:'ADT',txId:id,items:[{key:'kopi',qty:1}],note:'',txTime:''});
t('non-pemilik ditolak',!r.ok,r.message);
r=run('editTransaction',{accessCode:'DEMO',txId:id,items:[{key:'kopi',qty:1}],note:'',txTime:''});
t('DEMO ditolak',!r.ok,r.message);
r=run('editTransaction',{accessCode:'EDO',txId:id,items:[{key:'kopi',qty:5},{key:'spons',qty:1}],note:'a',txTime:''});
t('tanpa perubahan ditolak',!r.ok&&r.message==='Tidak ada perubahan.',r.message);
r=run('editTransaction',{accessCode:'ADMIN',txId:id,items:[{key:'kopi',qty:5},{key:'spons',qty:1}],note:'catatan admin',txTime:''});
t('Admin boleh edit milik orang lain (note saja, stok tetap)',r.ok&&stock().kopi===15);

r=run('editTransaction',{accessCode:'EDO',txId:id,items:[{key:'kopi',qty:5},{key:'spons',qty:1}],note:'catatan admin',txTime:iso(-2*86400000)});
t('ubah waktu ke 2 hari lalu',r.ok&&r.recent.find(x=>x.txId===id).backdated===true);
r=run('editTransaction',{accessCode:'EDO',txId:id,items:[{key:'kopi',qty:5},{key:'spons',qty:1}],note:'catatan admin',txTime:iso(-9*86400000)});
t('ubah waktu ke 9 hari lalu ditolak',!r.ok,r.message);
r=run('editTransaction',{accessCode:'EDO',txId:id,items:[{key:'kopi',qty:5},{key:'spons',qty:1}],note:'catatan admin',txTime:iso(+3600000)});
t('waktu masa depan ditolak',!r.ok,r.message);

// Koreksi kopi -> tx (2 hari lalu) kini sebelum opname
r=run('correctStock',{accessCode:'ADMIN',key:'kopi',actualStock:30,reason:'opname'});
t('koreksi kopi ke 30',r.ok&&stock().kopi===30);
const kor=r.recent[0].txId;
r=run('editTransaction',{accessCode:'EDO',txId:id,items:[{key:'kopi',qty:6},{key:'spons',qty:1}],note:'catatan admin',txTime:''});
t('ubah qty kopi pada tx sebelum opname ditolak',!r.ok&&stock().kopi===30,r.message);
r=run('editTransaction',{accessCode:'EDO',txId:id,items:[{key:'kopi',qty:5},{key:'spons',qty:2}],note:'catatan admin',txTime:''});
t('ubah qty spons (tanpa opname) tetap boleh',r.ok&&stock().spons===18,JSON.stringify(stock()));
r=run('editTransaction',{accessCode:'ADMIN',txId:kor,items:[{key:'kopi',qty:1}],note:'',txTime:''});
t('KOREKSI tidak bisa diedit',!r.ok,r.message);

// DATANG
r=run('addStock',{accessCode:'WAY',items:[{key:'teh',qty:10}],note:''});
const inId=r.recent[0].txId;
t('DATANG awal',r.ok&&stock().teh===30);
r=run('editTransaction',{accessCode:'WAY',txId:inId,items:[{key:'teh',qty:4}],note:'',txTime:''});
t('edit DATANG 10->4',r.ok&&stock().teh===24,JSON.stringify(stock().teh));

// minus
r=run('submitTransaction',{accessCode:'WAY',items:[{key:'sabun',qty:25}],note:''});
const mId=r.recent[0].txId;
r=run('editTransaction',{accessCode:'WAY',txId:mId,items:[{key:'sabun',qty:30}],note:'',txTime:''});
t('edit bikin stok minus + peringatan',r.ok&&stock().sabun===-10&&r.message.includes('minus'),r.message);
r=run('editTransaction',{accessCode:'WAY',txId:mId,items:[{key:'sabun',qty:1000}],note:'',txTime:''});
t('qty > 999 ditolak',!r.ok,r.message);
// hapus setelah edit: stok kembali tepat
r=run('deleteTransaction',{accessCode:'WAY',txId:mId});
t('hapus tx yang sudah diedit -> stok pulih',r.ok&&stock().sabun===20,JSON.stringify(stock().sabun));
// header kolom 12-13
t('header kolom Riwayat Edit',sheets['Transaksi Log']._d[0][12]==='Riwayat Edit'&&sheets['Transaksi Log']._d[0][11]==='Dicatat Pada');

// --- baris lama dengan txId bertipe ANGKA (disisipkan manual seperti data lama di Sheets)
fresh();const sh=sheets['Transaksi Log'];
const CD=vm.runInContext('Date',ctx);
sh._d.push([new CD(Date.now()-3600000),20250301123045,'EDO','EDO','USER','[{"key":"teh","qty":10}]','🍵Teh +10',10,'lama','MASUK','']);
const before=stock().teh;
r=run('getDashboard','EDO');
t('mapLogRow_: txId angka dikirim sebagai teks',r.recent.some(x=>x.txId==='20250301123045'&&typeof x.txId==='string'));
r=run('editTransaction',{accessCode:'EDO',txId:'20250301123045',items:[{key:'teh',qty:4}],note:'lama',txTime:''});
t('edit baris ber-ID angka berhasil',r.ok&&stock().teh===before-6,r.message||'');
r=run('deleteTransaction',{accessCode:'EDO',txId:'20250301123045'});
t('hapus baris ber-ID angka berhasil',r.ok&&stock().teh===before-6-4,r.message||'');


{
const CD=vm.runInContext('Date',ctx);
const sh2=sheets['Transaksi Log'];
const nowJ=new Date(Date.now()+H); const y=nowJ.getUTCFullYear(), m=nowJ.getUTCMonth();   // bulan ini (WIB)
const prevStart=Date.UTC(y,m-1,1)-H;            // 1 bulan lalu, tgl 1 00:00 WIB
const before=sh2._d.length;
const add=(ms,id)=>sh2._d.push([new CD(ms),id,'EDO','EDO','USER','[{"key":"tisu","qty":1}]','🧻Tisu -1',1,'','KELUAR','']);
add(prevStart-3600000,'OLD00001');   // 1 jam sebelum jendela (akhir bulan sebelumnya lagi) -> TIDAK ikut
add(prevStart-86400000*20,'OLD00002');
add(prevStart+60000,'IN000001');     // 1 menit setelah 00:00 tgl 1 bulan lalu -> ikut
add(Date.now()-3600000,'IN000002');
r=run('getDashboard','EDO'); const ids=r.recent.map(x=>x.txId);
t('1 bulan lalu tgl 1 00:01 ikut',ids.includes('IN000001'));
t('sebelum tgl 1 bulan lalu (bulan lebih lama) TIDAK ikut',!ids.includes('OLD00001')&&!ids.includes('OLD00002'));
const ts=r.recent.map(x=>x.timestamp.split(' ')[0].split('/').reverse().join('')+x.timestamp.split(' ')[1]);
t('urut terbaru dulu',ts.every((v,k)=>k===0||ts[k-1]>=v));
// beban: 240 transaksi (60 hari x 4) + ukuran respons
for(let d=0;d<60;d++)for(let k=0;k<4;k++)sh2._d.push([new CD(Date.now()-d*86400000-k*3600000-7200000),'B'+d+'X'+k,'EDO','EDO','USER','[{"key":"kopi","qty":2},{"key":"gula","qty":1},{"key":"teh","qty":1}]','☕Kopi -2, 🧂Gula -1, 🍵Teh -1',4,'catatan contoh','KELUAR','']);
r=run('getDashboard','EDO');
const json=JSON.stringify(r.recent);
console.log('   [ukur] transaksi dalam jendela:',r.recent.length,'| ukuran recent JSON:',(json.length/1024).toFixed(0),'KB | per baris ~',Math.round(json.length/r.recent.length),'byte');
// pagar RECENT_MAX_ROWS
vm.runInContext('APP_CONFIG.RECENT_MAX_ROWS=50',ctx); fresh();
t('pagar RECENT_MAX_ROWS memotong yang terlama',vm.runInContext('getRecentTransactions_().length',ctx)===50);
vm.runInContext('APP_CONFIG.RECENT_MAX_ROWS=500',ctx);
}

// ===== Riwayat lazy-load =====
{
const LOG=sheets['Transaksi Log'];
let c0=LOG._reads;
let rr=raw('getDashboard','EDO'); t('getDashboard tanpa recent',rr.ok&&rr.recent===undefined);
rr=raw('login','EDO'); t('login tanpa recent',rr.ok&&rr.recent===undefined);
rr=raw('submitTransaction',{accessCode:'EDO',items:[{key:'tisu',qty:1}],note:'lz'}); t('simpan AMBIL tanpa recent',rr.ok&&rr.recent===undefined);
rr=raw('addStock',{accessCode:'WAY',items:[{key:'tisu',qty:1}],note:'lz2'}); t('simpan DATANG tanpa recent',rr.ok&&rr.recent===undefined);
rr=raw('correctStock',{accessCode:'ADMIN',key:'air330',actualStock:7,reason:'uji'}); t('koreksi tanpa recent',rr.ok&&rr.recent===undefined);
t('dashboard/login/simpan/koreksi: 0 pembacaan data Log',LOG._reads===c0,'('+(LOG._reads-c0)+' baca)');
c0=LOG._reads;
rr=raw('getRiwayat','EDO'); t('getRiwayat mengirim daftar',rr.ok&&Array.isArray(rr.recent)&&rr.recent.length>0,String(rr.recent&&rr.recent.length));
t('getRiwayat: 1x pembacaan Log',LOG._reads-c0===1);
t('getRiwayat kode salah ditolak',!raw('getRiwayat','XXX').ok);
t('getRiwayat DEMO boleh melihat',raw('getRiwayat','DEMO').ok);
const mine=raw('getRiwayat','EDO').recent.find(x=>x.note==='lz');
rr=raw('editTransaction',{accessCode:'EDO',txId:mine.txId,items:[{key:'tisu',qty:2}],note:'lz',txTime:''});
t('edit tetap mengirim recent',rr.ok&&Array.isArray(rr.recent)&&rr.recent.find(x=>x.txId===mine.txId).edited===true);
rr=raw('deleteTransaction',{accessCode:'EDO',txId:mine.txId});
t('hapus tetap mengirim recent',rr.ok&&Array.isArray(rr.recent)&&!rr.recent.some(x=>x.txId===mine.txId));
// transaksi bulan lalu: pemilik/Admin boleh edit & hapus (seragam, tanpa batas umur)
const CD2=vm.runInContext('Date',ctx);
const nj=new Date(Date.now()+H);const ps=Date.UTC(nj.getUTCFullYear(),nj.getUTCMonth()-1,5,3,0)-H;
LOG._d.push([new CD2(ps),'LASTMON1','EDO','EDO','USER','[{"key":"gula","qty":2}]','🧂Gula -2',2,'bln lalu','KELUAR','']);
rr=raw('editTransaction',{accessCode:'EDO',txId:'LASTMON1',items:[{key:'gula',qty:3}],note:'bln lalu',txTime:''});
t('pemilik boleh edit transaksi bulan lalu',rr.ok,rr.message||'');
rr=raw('deleteTransaction',{accessCode:'ADMIN',txId:'LASTMON1'});
t('Admin boleh hapus transaksi bulan lalu',rr.ok,rr.message||'');
}

// ===== Guard koreksi pada HAPUS =====
{
const stk=()=>stock();
let rr=raw('submitTransaction',{accessCode:'EDO',items:[{key:'airCup',qty:2}],note:'dg1',txTime:iso(-2*86400000)});
t('(siap) transaksi airCup 2 hari lalu',rr.ok,rr.message||'');
const idOld=raw('getRiwayat','EDO').recent.find(x=>x.note==='dg1').txId;
rr=raw('correctStock',{accessCode:'ADMIN',key:'airCup',actualStock:10,reason:'opname uji'});
t('(siap) opname airCup -> 10',rr.ok&&stk().airCup===10);
rr=raw('deleteTransaction',{accessCode:'EDO',txId:idOld});
t('pemilik: hapus transaksi sebelum opname DITOLAK',!rr.ok&&rr.message.includes('koreksi stok terakhir')&&rr.message.includes('dihapus'),rr.message);
t('stok tidak bergeser setelah penolakan',stk().airCup===10);
rr=raw('deleteTransaction',{accessCode:'ADMIN',txId:idOld});
t('Admin pun DITOLAK (seragam)',!rr.ok);
rr=raw('submitTransaction',{accessCode:'EDO',items:[{key:'airCup',qty:1}],note:'dg2'});
const idNew=raw('getRiwayat','EDO').recent.find(x=>x.note==='dg2').txId;
rr=raw('deleteTransaction',{accessCode:'EDO',txId:idNew});
t('transaksi SESUDAH opname tetap bisa dihapus + stok pulih',rr.ok&&stk().airCup===10,rr.message||'');
rr=raw('submitTransaction',{accessCode:'EDO',items:[{key:'tisu',qty:1}],note:'dg3',txTime:iso(-2*86400000)});
const idOther=raw('getRiwayat','EDO').recent.find(x=>x.note==='dg3').txId;
rr=raw('deleteTransaction',{accessCode:'EDO',txId:idOther});
t('transaksi lama item LAIN (tanpa opname) tetap bisa dihapus',rr.ok,rr.message||'');
rr=raw('editTransaction',{accessCode:'EDO',txId:idOld,items:[{key:'airCup',qty:3}],note:'dg1',txTime:''});
t('edit sebelum opname tetap ditolak (pesan seragam)',!rr.ok&&rr.message.includes('diubah'),rr.message);
}

// ===== Guard koreksi stok pada HAPUS =====
{
const wait=(ms)=>{const e=Date.now()+ms;while(Date.now()<e);};
const idOf=(note)=>raw('getRiwayat','EDO').recent.find(x=>x.note===note).txId;
raw('submitTransaction',{accessCode:'EDO',items:[{key:'spons',qty:2}],note:'g1'});          // spons saja
raw('submitTransaction',{accessCode:'EDO',items:[{key:'teh',qty:1}],note:'g2'});            // teh saja (tanpa opname)
raw('submitTransaction',{accessCode:'EDO',items:[{key:'spons',qty:1},{key:'teh',qty:1}],note:'g3'}); // campuran
wait(8);
const sBefore=stock().spons;
let rr=raw('correctStock',{accessCode:'ADMIN',key:'spons',actualStock:sBefore+1,reason:'opname uji'});
t('opname spons berhasil',rr.ok);
wait(8);
const afterOp=stock();
rr=raw('deleteTransaction',{accessCode:'EDO',txId:idOf('g1')});
t('HAPUS tx spons sebelum opname -> DITOLAK',!rr.ok&&/koreksi stok terakhir/i.test(rr.message)&&stock().spons===afterOp.spons,rr.message);
rr=raw('deleteTransaction',{accessCode:'ADMIN',txId:idOf('g1')});
t('Admin pun ditolak (tanpa pengecualian)',!rr.ok&&stock().spons===afterOp.spons);
rr=raw('deleteTransaction',{accessCode:'EDO',txId:idOf('g3')});
t('HAPUS tx campuran (spons+teh) -> DITOLAK karena salah satu item sudah dilewati opname',!rr.ok&&stock().teh===afterOp.teh&&stock().spons===afterOp.spons);
rr=raw('deleteTransaction',{accessCode:'EDO',txId:idOf('g2')});
t('HAPUS tx teh (tidak ada opname teh) -> BOLEH',rr.ok&&stock().teh===afterOp.teh+1,rr.message||'');
raw('submitTransaction',{accessCode:'EDO',items:[{key:'spons',qty:1}],note:'g4'});         // SETELAH opname
rr=raw('deleteTransaction',{accessCode:'EDO',txId:idOf('g4')});
t('HAPUS tx spons SETELAH opname -> BOLEH',rr.ok&&stock().spons===afterOp.spons,rr.message||'');
rr=raw('editTransaction',{accessCode:'EDO',txId:idOf('g1'),items:[{key:'spons',qty:3}],note:'g1',txTime:''});
t('EDIT jumlah tx sebelum opname -> tetap DITOLAK (seragam dengan hapus)',!rr.ok&&/koreksi stok terakhir/i.test(rr.message),rr.message);
rr=raw('editTransaction',{accessCode:'EDO',txId:idOf('g1'),items:[{key:'spons',qty:2}],note:'g1 catatan baru',txTime:''});
t('EDIT keterangan saja pada tx sebelum opname -> BOLEH',rr.ok,rr.message||'');
console.log('   pesan: '+raw('deleteTransaction',{accessCode:'EDO',txId:idOf('g1 catatan baru')}).message);
}

// ===== airCup (kunci camelCase) =====
{
const RAW=(fn,arg)=>{fresh();return call(fn,arg);};
const before=stock().airCup;
let rr=RAW('submitTransaction',{accessCode:'EDO',items:[{key:'airCup',qty:2},{key:'kopi',qty:1}],note:'ac1'});
t('transaksi campuran airCup+kopi: airCup TIDAK terbuang',rr.ok&&stock().airCup===before-2,'airCup '+before+'->'+stock().airCup);
const row=RAW('getRiwayat','EDO').recent.find(x=>x.note==='ac1');
t('log mencatat airCup',JSON.parse(row.itemsJson).some(i=>i.key==='airCup'&&i.qty===2));
rr=RAW('submitTransaction',{accessCode:'EDO',items:[{key:'airCup',qty:1}],note:'ac2'});
t('transaksi airCup saja berhasil (sebelumnya: "Item transaksi kosong")',rr.ok,rr.message||'');
rr=RAW('addStock',{accessCode:'WAY',items:[{key:'airCup',qty:5}],note:'ac3'});
t('DATANG airCup menambah stok',rr.ok&&stock().airCup===before-2-1+5,String(stock().airCup));
{const e=Date.now()+8;while(Date.now()<e);}
const sNow=stock().airCup;
// stok airCup benar-benar tersimpan di sheet & terbaca kembali pada eksekusi berikutnya
t('stok airCup persisten (terbaca ulang dari sheet)',stock().airCup===sNow&&sNow!==20||sNow===20);
rr=RAW('correctStock',{accessCode:'ADMIN',key:'airCup',actualStock:sNow+3,reason:'opname airCup'});
t('koreksi stok airCup berhasil (sebelumnya: "Item tidak valid")',rr.ok&&stock().airCup===sNow+3,rr.message||'');
const ids=RAW('getRiwayat','EDO').recent;
const ac2=ids.find(x=>x.note==='ac2');
rr=RAW('deleteTransaction',{accessCode:'EDO',txId:ac2.txId});
t('hapus transaksi airCup SEBELUM opname ditolak guard',!rr.ok&&/Air Mineral Gelas/.test(rr.message),rr.message);
const ym=new Date(Date.now()+H);
const rep=RAW('getMonthlyReport',{accessCode:'ADMIN',year:ym.getUTCFullYear(),month:ym.getUTCMonth()+1});
const ac=rep.items.find(i=>i.key==='airCup');
t('laporan bulanan memuat pemakaian airCup',!!ac&&ac.usage>=3&&ac.tambahanStok>=5,JSON.stringify(ac&&{usage:ac.usage,tambah:ac.tambahanStok,koreksi:ac.koreksi}));
}

// ===== Gateway API (doPost) =====
{
const post=(o)=>{fresh();const out=call('doPost',{postData:{contents:typeof o==='string'?o:JSON.stringify(o)}});return {mime:out._m,b:JSON.parse(out.getContent())};};
const login=(c)=>post({fn:'login',args:[c]});
fresh();let g=vm.runInContext('doGet({parameter:{api:"ping"}})',ctx); let gb=JSON.parse(g.getContent());
t('GET ?api=ping: JSON sehat',gb.status==='ok'&&gb.result.apiVersion===1&&g._m==='JSON');
fresh();t('GET tanpa parameter: tetap menyajikan HTML (frontend GAS identik)',vm.runInContext('doGet({parameter:{}})',ctx)._html===true);
fresh();t('GET tanpa argumen (panggilan lama): tetap HTML',vm.runInContext('doGet()',ctx)._html===true);


fresh();t('favicon: default kosong -> tidak dipasang',vm.runInContext('doGet()',ctx)._favicon===null);
vm.runInContext('APP_CONFIG.FAVICON_URL="https://x.github.io/app/favicon.ico"',ctx);
fresh();t('favicon: URL dikonfigurasi -> setFaviconUrl dipanggil',vm.runInContext('doGet()',ctx)._favicon==='https://x.github.io/app/favicon.ico');
vm.runInContext('APP_CONFIG.FAVICON_URL=""',ctx);
let r=login('EDO'); const tok=r.b.token;
t('login: token 64 hex + hasil lengkap + MIME JSON',r.b.status==='ok'&&/^[0-9a-f]{64}$/.test(tok)&&r.b.result.ok&&r.b.result.user.code==='EDO'&&r.mime==='JSON'&&r.b.expiresInSec===1800);
r=login('NOPE'); t('login gagal: status ok, result.ok=false, tanpa token',r.b.status==='ok'&&r.b.result.ok===false&&!r.b.token);

r=post({fn:'getDashboard',args:['ADMIN'],token:tok});
t('identitas dari TOKEN (EDO), kode kiriman klien (ADMIN) diabaikan',r.b.status==='ok'&&r.b.result.user.code==='EDO'&&r.b.result.user.role!=='ADMIN');
r=post({fn:'correctStock',args:[{accessCode:'ADMIN',key:'kopi',actualStock:5,reason:'serang'}],token:tok});
t('SERANGAN: token EDO + accessCode ADMIN tidak bisa koreksi stok',r.b.status==='ok'&&r.b.result.ok===false&&/Admin/.test(r.b.result.message),r.b.result&&r.b.result.message);
r=post({fn:'submitTransaction',args:[{accessCode:'ADMIN',items:[{key:'tisu',qty:1}],note:'api1'}],token:tok});
t('transaksi via API tercatat atas nama pemilik token',r.b.result.ok&&raw('getRiwayat','ADMIN').recent.find(x=>x.note==='api1').userCode==='EDO');
raw('submitTransaction',{accessCode:'WAY',items:[{key:'tisu',qty:1}],note:'milikWAY'});
const wayId=raw('getRiwayat','ADMIN').recent.find(x=>x.note==='milikWAY').txId;
r=post({fn:'deleteTransaction',args:[{accessCode:'WAY',txId:wayId}],token:tok});
t('SERANGAN: token EDO mengaku WAY tidak bisa menghapus transaksi WAY',r.b.result.ok===false&&/milik sendiri/.test(r.b.result.message),r.b.result.message);
r=post({fn:'getRiwayat',args:[],token:tok}); t('getRiwayat via token',r.b.status==='ok'&&r.b.result.ok&&Array.isArray(r.b.result.recent));
r=post({fn:'getMonthlyReport',args:[{year:2026,month:10}],token:tok}); t('getMonthlyReport via token (tanpa accessCode di argumen)',r.b.status==='ok'&&r.b.result.ok);
r=post({fn:'getDashboard',args:[],token:tok}); t('args kosong untuk fungsi kode-akses tetap jalan',r.b.status==='ok'&&r.b.result.user.code==='EDO');
r=post({fn:'submitTransaction',args:[],token:tok}); t('payload kosong ditangani (bukan crash)',r.b.status==='ok'&&r.b.result.ok===false);

// tanpa / token salah
for(const [lbl,tk] of [['tanpa token',undefined],['token ngawur',('x'.repeat(64))],['token berformat salah','../../TK:abc'],['token hex tapi tak terdaftar','a'.repeat(64)],['token bukan string',{a:1}]])
  { r=post({fn:'getDashboard',args:['EDO'],token:tk}); t('AUTH ditolak: '+lbl,r.b.status==='error'&&r.b.code==='AUTH'); }
// allowlist
for(const f of ['setupSystem','doGet','getUserByCode_','constructor','__proto__','hasOwnProperty','toString','processTransaction_','getApiHandlers_','']) {
  r=post({fn:f,args:[],token:tok}); t('FORBIDDEN_FN: "'+f+'"',r.b.status==='error'&&r.b.code==='FORBIDDEN_FN'); }
// body buruk
for(const [lbl,body,code] of [['bukan JSON','bukan json','BAD_REQUEST'],['kosong','','BAD_REQUEST'],['null','null','BAD_REQUEST'],['array','[]','BAD_REQUEST'],['terlalu besar','a'.repeat(vm.runInContext('APP_CONFIG.API_MAX_BODY_CHARS',ctx)+1),'BAD_REQUEST']])
  { r=post(body); t('BAD_REQUEST: '+lbl,r.b.status==='error'&&r.b.code===code,r.b.code); }

// logout
let r2=login('EDO'); const tok2=r2.b.token;
r=post({fn:'logout',args:[],token:tok2}); t('logout berhasil',r.b.status==='ok'&&r.b.result.ok);
r=post({fn:'getDashboard',args:['EDO'],token:tok2}); t('token setelah logout tidak berlaku',r.b.code==='AUTH');
r=post({fn:'logout',args:[],token:undefined}); t('logout tanpa token ditolak',r.b.code==='AUTH');

// DEMO
r2=login('DEMO'); r=post({fn:'submitTransaction',args:[{items:[{key:'tisu',qty:1}]}],token:r2.b.token});
t('DEMO via API: baca boleh, tulis ditolak',r.b.result.ok===false&&/Demo/.test(r.b.result.message)&&post({fn:'getDashboard',args:[],token:r2.b.token}).b.status==='ok');

// idle geser 30 menit
const MIN=60000;
r2=login('WAY'); const tk=r2.b.token;
advance(20*MIN); t('idle: aktif di menit ke-20',post({fn:'getDashboard',args:[],token:tk}).b.status==='ok');
advance(20*MIN); t('idle: masih aktif di menit ke-40 (menit ke-20 sejak aktivitas terakhir) = masa idle bergeser',post({fn:'getDashboard',args:[],token:tk}).b.status==='ok');
advance(31*MIN); t('idle: 31 menit diam -> sesi habis',post({fn:'getDashboard',args:[],token:tk}).b.code==='AUTH');
// batas mutlak 12 jam
r2=login('WAY'); const tk3=r2.b.token; let alive=true,steps=0;
while(alive&&steps<40){advance(25*MIN);steps++;alive=post({fn:'getDashboard',args:[],token:tk3}).b.status==='ok';}
t('batas mutlak: sesi terus aktif tetap gugur sekitar 12 jam',!alive&&steps*25>=720&&steps*25<=750,'gugur di menit '+steps*25);

// throttle login
alignWindow(); for(const k of Object.keys(cacheStore)) if(k.startsWith('LF:')) delete cacheStore[k];
r2=login('EDO'); const keep=r2.b.token;
for(let i=0;i<20;i++) login('SALAH'+i);
r=login('EDO'); t('setelah 20 gagal: login (bahkan kode benar) diblokir RATE_LIMIT',r.b.status==='error'&&r.b.code==='RATE_LIMIT'&&!r.b.token,r.b.message);
t('sesi yang sudah login TIDAK terpengaruh pemblokiran login',post({fn:'getDashboard',args:[],token:keep}).b.status==='ok');
advance(11*MIN); r=login('EDO'); t('jendela berikutnya: login pulih',r.b.status==='ok'&&!!r.b.token);
// login sukses tidak menambah hitungan gagal
alignWindow(); for(const k of Object.keys(cacheStore)) if(k.startsWith('LF:')) delete cacheStore[k];
for(let i=0;i<30;i++) login('WAY'); t('30x login SUKSES tidak memicu pemblokiran',login('WAY').b.status==='ok');
}

// ===== Urutan Riwayat saat waktu transaksi SAMA =====
{
const day=new Date(Date.now()+H-86400000*2).toISOString().slice(0,10);   // 2 hari lalu (WIB), jam sama untuk keduanya
const same=day+'T09:00';
raw('submitTransaction',{accessCode:'EDO',items:[{key:'tisu',qty:1}],note:'tie-pertama',txTime:same});
raw('submitTransaction',{accessCode:'EDO',items:[{key:'tisu',qty:1}],note:'tie-kedua',txTime:same});
raw('submitTransaction',{accessCode:'EDO',items:[{key:'tisu',qty:1}],note:'tie-ketiga',txTime:same});
const order=raw('getRiwayat','EDO').recent.filter(x=>x.note.startsWith('tie-')).map(x=>x.note);
t('waktu transaksi identik: yang diinput belakangan tampil lebih dulu',order.join()==='tie-ketiga,tie-kedua,tie-pertama',order.join());
const fresh1=raw('submitTransaction',{accessCode:'EDO',items:[{key:'tisu',qty:1}],note:'baru-sekali'});
t('transaksi yang baru dibuat SELALU jadi recent[0] (tidak bergantung kecepatan mesin)',raw('getRiwayat','EDO').recent[0].note==='baru-sekali');
}
console.log(`\n${pass} lulus, ${failn} gagal`);
process.exit(failn?1:0);
