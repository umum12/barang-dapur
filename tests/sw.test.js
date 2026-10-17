// Service worker: precache, activate, strategi fetch (navigasi, shell, config network-first, lintas-origin) dengan Cache API tiruan.
const fs=require('fs'),vm=require('vm'),path=require('path');
const { DIST, ok, finish } = require('./helpers');
const SRC=fs.readFileSync(path.join(DIST,'sw.js'),'utf8');
const ORIGIN='https://u.github.io',SCOPE=ORIGIN+'/app/';
function mkEnv(){
  const stores=new Map(),listeners={},fetched=[];let online=true,skipped=0,claimed=0;
  const abs=u=>new URL(typeof u==='string'?u:u.url,SCOPE).href;
  const mkCache=(name)=>{const m=stores.get(name);return{
    addAll:async reqs=>{for(const r of reqs){const res=await env.fetch(r);m.set(abs(r),res);}},
    put:async(r,res)=>{m.set(abs(r),res);},match:async r=>m.get(abs(r))};};
  const caches={open:async n=>{if(!stores.has(n))stores.set(n,new Map());return mkCache(n);},
    keys:async()=>[...stores.keys()],delete:async n=>stores.delete(n),
    match:async r=>{for(const m of stores.values()){const h=m.get(abs(r));if(h)return h;}return undefined;}};
  class Request{constructor(u,o={}){this.url=abs(u);this.cache=o.cache;this.method='GET';}}
  const mkRes=(body)=>({ok:true,body,clone(){return mkRes(body);}});
  const env={stores,fetched,setOnline:v=>online=v,get skipped(){return skipped;},get claimed(){return claimed;},
    fetch:async(r,o)=>{const url=abs(r);fetched.push({url,cache:(o&&o.cache)||r.cache});if(!online)throw new TypeError('offline');return mkRes('NET:'+url);}};
  const self={location:{origin:ORIGIN},registration:{scope:SCOPE},clients:{claim:()=>{claimed++;return Promise.resolve();}},
    skipWaiting:()=>{skipped++;},addEventListener:(t,f)=>{listeners[t]=f;}};
  const ctx=vm.createContext({self,caches,Request,URL,fetch:env.fetch,Promise,Map});
  vm.runInContext(SRC,ctx);
  env.fire=async(type,ev)=>{let p;ev.waitUntil=x=>{p=x;};ev.respondWith=x=>{ev._resp=x;ev._responded=true;};listeners[type](ev);if(p)await p;return ev;};
  env.version=vm.runInContext('VERSION',ctx);env.precache=vm.runInContext('PRECACHE',ctx);
  return env;
}
(async()=>{
 let e=mkEnv();
 ok('versi di sw.js = versi build',e.version===JSON.parse(fs.readFileSync(path.join(DIST,'version.json'))).version);
 await e.fire('install',{});
 const shell=e.stores.get('bd-shell-'+e.version);
 ok('install: seluruh shell ('+e.precache.length+' berkas) masuk cache',shell&&shell.size===e.precache.length);
 ok('install: diambil dengan cache:"reload" (lewati cache HTTP)',e.fetched.every(f=>f.cache==='reload'));
 ok('install: config.js TIDAK ikut precache',!e.precache.some(u=>u.startsWith('config.js')));
 ok('install: tanpa skipWaiting otomatis (menunggu pilihan pengguna)',e.skipped===0);
 // activate
 e.stores.set('bd-shell-lama',new Map());e.stores.set('lain',new Map());e.stores.set('bd-runtime',new Map());
 await e.fire('activate',{});
 ok('activate: cache shell lama & asing dihapus, runtime dipertahankan',!e.stores.has('bd-shell-lama')&&!e.stores.has('lain')&&e.stores.has('bd-runtime')&&e.stores.has('bd-shell-'+e.version));
 ok('activate: clients.claim dipanggil',e.claimed===1);
 // message
 await e.fire('message',{data:{type:'SKIP_WAITING'}});await e.fire('message',{data:{type:'lain'}});await e.fire('message',{data:null});
 ok('message SKIP_WAITING -> skipWaiting (pesan lain diabaikan)',e.skipped===1);
 const F=async(url,extra={})=>{e.fetched.length=0;return e.fire('fetch',{request:Object.assign({method:'GET',url,mode:'no-cors'},extra)});};
 // fetch
 let ev=await F(SCOPE+'x',{method:'POST'});ok('POST (API) tidak disentuh service worker',!ev._responded);
 ev=await F('https://script.google.com/macros/s/ABC/exec');ok('GET lintas-origin (GAS) tidak disentuh, tidak di-cache',!ev._responded);
 ev=await F(ORIGIN+'/lain/file.js');ok('di luar scope tidak disentuh',!ev._responded);
 ev=await F(SCOPE+'?source=pwa',{mode:'navigate'});let r=await ev._resp;
 ok('navigasi (juga dengan ?source=pwa) -> index.html dari cache, tanpa jaringan',r.body&&e.fetched.length===0&&e.stores.get('bd-shell-'+e.version).get(SCOPE+'index.html')===r);
 e.setOnline(false);ev=await F(SCOPE,{mode:'navigate'});r=await ev._resp;
 ok('OFFLINE: aplikasi tetap terbuka (index.html dari cache)',!!r&&r.body===e.stores.get('bd-shell-'+e.version).get(SCOPE+'index.html').body);
 const appJs=e.precache.find(u=>u.startsWith('app.js'));
 ev=await F(SCOPE+appJs);r=await ev._resp;ok('OFFLINE: app.js berversi dilayani dari cache',!!r&&e.fetched.length===0);
 ev=await F(SCOPE+'icons/icon-192.png');r=await ev._resp;ok('OFFLINE: ikon dilayani dari cache',!!r&&e.fetched.length===0);
 // config.js network-first
 e.setOnline(true);ev=await F(SCOPE+'config.js');r=await ev._resp;
 ok('config.js online: ambil dari JARINGAN (no-store) & simpan runtime',r.body==='NET:'+SCOPE+'config.js'&&e.fetched[0].cache==='no-store'&&e.stores.get('bd-runtime').has(SCOPE+'config.js'));
 e.setOnline(false);ev=await F(SCOPE+'config.js');r=await ev._resp;
 ok('config.js offline: pakai salinan runtime terakhir',r&&r.body==='NET:'+SCOPE+'config.js');
 // tak dikenal -> jaringan
 e.setOnline(true);ev=await F(SCOPE+'tidak-ada.js');r=await ev._resp;
 ok('berkas tak dikenal -> jaringan (tidak di-cache sembarangan)',r.body.startsWith('NET:')&&![...e.stores.get('bd-runtime').keys()].some(k=>k.endsWith('tidak-ada.js')));
 finish();
})();
