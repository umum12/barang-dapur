// Situs statis hasil build -> fetch -> backend GAS ASLI: login, token, transaksi, riwayat lazy, edit, laporan, logout, sesi habis, gangguan jaringan.
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const createBackend = require('./backend');
const { GAS, DIST, EXEC, ok, sleep, until, finish } = require('./helpers');

async function openPage(backend){
  const errs=[],reqs=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errs.push(e.message));
  const state={mode:'ok'};
  const dom=await JSDOM.fromFile(path.join(DIST,'index.html'),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      w.Element.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
      w.fetch=async(url,opts={})=>{
        reqs.push({url,opts,body:opts.body?JSON.parse(opts.body):null});
        if(state.mode==='netfail') throw new TypeError('Failed to fetch');
        if(state.mode==='abort'){const e=new Error('aborted');e.name='AbortError';throw e;}
        if(state.mode==='html') return {ok:true,status:200,json:async()=>{throw new SyntaxError('Unexpected token <');}};
        const out=backend.doPost(opts.body);
        return {ok:true,status:200,json:async()=>JSON.parse(out)};
      };
    }});
  await new Promise(r=>dom.window.addEventListener('load',r));
  return {w:dom.window,d:dom.window.document,errs,reqs,state};
}
const visible=(d,id)=>!d.getElementById(id).classList.contains('hidden');
async function login(P,code){const {d}=P;d.getElementById('loginCodeInput').value=code;d.getElementById('loginSubmitBtn').click();}
const stock=(b,k)=>b.eval('getStocks_()').find(s=>s.key===k).stock;

(async()=>{
 const backend=createBackend(GAS);
 let P=await openPage(backend);let {w,d,reqs}=P;
 // ---- A. boot
 ok('halaman statis termuat; google.script.run = shim',typeof w.google.script.run==='object'&&w.BD_CONFIG.EXEC_URL===EXEC);
 ok('layar login tampil, aplikasi tersembunyi',visible(d,'loginView')&&!visible(d,'appView'));
 ok('logo login memakai symbol SVG (bukan emoji)',!!d.querySelector('.login-logo-svg use'));
 // ---- B. kode salah
 login(P,'XXX');await until(()=>!d.getElementById('loginError').classList.contains('hidden'));
 ok('kode salah -> pesan dari backend',/tidak ditemukan/i.test(d.getElementById('loginError').textContent),d.getElementById('loginError').textContent);
 ok('permintaan login: POST ke /exec tanpa token, tanpa header khusus, tanpa cookie',reqs[0].url===EXEC&&reqs[0].opts.method==='POST'&&!reqs[0].opts.headers&&reqs[0].opts.credentials==='omit'&&reqs[0].body.fn==='login'&&!('token' in reqs[0].body));
 ok('body berupa string (jadi text/plain, bukan preflight)',typeof reqs[0].opts.body==='string');
 // ---- C. login benar
 login(P,'EDO');await until(()=>visible(d,'appView'));
 ok('login EDO: aplikasi tampil',visible(d,'appView')&&!visible(d,'loginView'));
 ok('dashboard: 8 kartu stok dari backend',await until(()=>d.querySelectorAll('#stockStrip .strip-card').length===8));
 ok('sesi memegang token',w.BD_API.hasSession());
 ok('login TIDAK memuat riwayat (lazy)',!reqs.some(r=>r.body&&r.body.fn==='getRiwayat'));
 // ---- D. transaksi AMBIL
 w.switchView('input');
 const inc=d.querySelector('.qty-btn[data-action="inc"][data-key="kopi"]');inc.click();
 d.querySelector('.qty-btn[data-action="inc"][data-key="kopi"]').click();
 d.getElementById('txnSubmitBtn').click();await sleep(600);d.getElementById('confirmModalBtn').click();
 ok('AMBIL 2 kopi via UI -> stok backend 18',await until(()=>stock(backend,'kopi')===18),'kopi='+stock(backend,'kopi'));
 await until(()=>d.getElementById('txnSubmitSummary').textContent==='Pilih item dahulu'); // form direset = balasan simpan sudah diterapkan UI
 const sub=reqs.filter(r=>r.body&&r.body.fn==='submitTransaction').pop();
 ok('permintaan simpan membawa token',!!(sub&&sub.body.token&&/^[0-9a-f]{64}$/.test(sub.body.token)));
 // ---- E. riwayat lazy
 const before=reqs.filter(r=>r.body&&r.body.fn==='getRiwayat').length;
 w.switchView('riwayat');
 ok('buka Riwayat: daftar termuat via getRiwayat',await until(()=>d.querySelectorAll('.recent-item').length===1)&&reqs.filter(r=>r.body&&r.body.fn==='getRiwayat').length===before+1);
 ok('transaksi tercatat atas nama EDO',/EDO/.test(d.querySelector('.recent-name').textContent));
 // ---- F. edit
 const el=d.querySelector('.recent-item');el.dispatchEvent(new w.Event('touchstart',{bubbles:true}));await sleep(700);el.dispatchEvent(new w.Event('touchend',{bubbles:true}));await sleep(600);
 d.getElementById('txActEditBtn').click();await sleep(600);
 w.setEditQty_('kopi',3);d.getElementById('confirmModalBtn').click();
 ok('edit 2->3 via UI -> stok backend 17, badge DIEDIT',await until(()=>stock(backend,'kopi')===17&&!!d.querySelector('.recent-edited')),'kopi='+stock(backend,'kopi'));
 // ---- G. laporan
 w.switchView('laporan');w.renderMonthlyReport_();
 ok('laporan bulanan termuat dari backend',await until(()=>/Laporan Barang Dapur/.test(d.getElementById('reportContent').textContent)));
 // ---- H. logout mencabut token di server
 d.getElementById('logoutBtn').click();await sleep(600);d.getElementById('confirmModalBtn').click();
 ok('logout: kembali ke login',await until(()=>visible(d,'loginView')));
 ok('logout: token DICABUT di server',await until(()=>!Object.keys(backend.cacheStore).some(k=>k.startsWith('TK:'))));
 ok('logout: tidak ada sesi tersisa di klien',!w.BD_API.hasSession());
 // ---- I. sesi habis di server
 login(P,'EDO');await until(()=>visible(d,'appView'));
 backend.advance(31*60000);
 d.getElementById('refreshBtn').click();
 ok('sesi habis 31 mnt: UI kembali ke login + pemberitahuan',await until(()=>visible(d,'loginView'))&&/Sesi berakhir/.test(d.getElementById('toast').textContent),d.getElementById('toast').textContent);
 ok('tidak ada error runtime di halaman',P.errs.length===0,P.errs.join('|'));

 // ---- J..N: kegagalan jaringan & server
 P=await openPage(backend);({w,d,reqs}=P);
 P.state.mode='netfail';login(P,'EDO');await until(()=>!d.getElementById('loginError').classList.contains('hidden'));
 ok('jaringan gagal -> pesan jelas',/Tidak dapat terhubung/.test(d.getElementById('loginError').textContent));
 P.state.mode='abort';login(P,'EDO');await until(()=>/terlalu lama/.test(d.getElementById('loginError').textContent));
 ok('timeout -> pesan jelas',/terlalu lama/.test(d.getElementById('loginError').textContent));
 P.state.mode='html';login(P,'EDO');await until(()=>/bukan JSON/.test(d.getElementById('loginError').textContent));
 ok('jawaban non-JSON (mis. akses bukan "Anyone") -> petunjuk jelas',/Anyone/.test(d.getElementById('loginError').textContent));
 P.state.mode='ok';
 Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});
 const nBefore=reqs.length;login(P,'EDO');await until(()=>/offline/i.test(d.getElementById('loginError').textContent));
 ok('offline -> pesan jelas & tidak mengirim permintaan',/offline/i.test(d.getElementById('loginError').textContent)&&reqs.length===nBefore);
 Object.defineProperty(w.navigator,'onLine',{value:true,configurable:true});
 // RATE_LIMIT lewat UI
 for(let i=0;i<20;i++) await new Promise(r=>w.google.script.run.withSuccessHandler(r).withFailureHandler(r).login('BAD'+i));
 login(P,'EDO');await until(()=>/Terlalu banyak/.test(d.getElementById('loginError').textContent));
 ok('20 login gagal -> UI menampilkan pesan RATE_LIMIT',/Terlalu banyak percobaan/.test(d.getElementById('loginError').textContent),d.getElementById('loginError').textContent);
 ok('tidak ada error runtime di halaman (sesi 2)',P.errs.length===0,P.errs.join('|'));
 finish();
})().catch(e=>{console.error('CRASH',e);process.exit(2);});
