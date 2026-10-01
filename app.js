(function(){
const $ = id => document.getElementById(id);
const BUY_SIZES=[500,1000,2500,5000,10000,15000,20000,30000,50000];
const SELL_SIZES=[250,500,1000,2500,5000,7500,10000];
const PS_PCTS=[5,10,25,50,75,100];

let cfg, D, pool, presaleBag, traderBag, hist, pts, tradeNo=0, base='launch', timer=null;

function readCfg(){
  return {
    supply: Math.max(1, +$('supply').value||1e9),
    fee: (+$('fee').value||0)/100,
    presalePct: Math.max(0,+$('presalePct').value||0),
    presaleUsd: Math.max(0,+$('presaleUsd').value||0),
    lpPct: Math.max(0.1,+$('lpPct').value||30),
    lpUsd: Math.max(1,+$('lpUsd').value||15000)
  };
}
function derive(c){
  const presaleTokens=c.supply*c.presalePct/100, lpTokens=c.supply*c.lpPct/100;
  const launchPrice=c.lpUsd/lpTokens, presalePrice=presaleTokens? c.presaleUsd/presaleTokens:0;
  return {presaleTokens,lpTokens,launchPrice,presalePrice,otherPct:100-c.presalePct-c.lpPct,
    launchMc:launchPrice*c.supply, presaleMc:presalePrice*c.supply, leftover:c.presaleUsd-c.lpUsd,
    k:c.lpUsd*lpTokens};
}

// ---- AMM math (pure) ----
const priceOf = p => p.y/p.x;
function qBuy(p,usd,fee){ const inn=usd*(1-fee), y=p.y+inn, x=p.k/y; return {tokens:p.x-x, pool:{x,y,k:p.k}}; }
function qSellTokens(p,t,fee){ const inn=t*(1-fee), x=p.x+inn, y=p.k/x; return {usd:p.y-y, pool:{x,y,k:p.k}}; }
function tokensForUsd(p,usd,fee){ if(usd>=p.y) return Infinity; return (p.k/(p.y-usd)-p.x)/(1-fee); }
function usdToReachPrice(p,price,fee){ const y=Math.sqrt(p.k*price); return (y-p.y)/(1-fee); }

// ---- formatting ----
function fUsd(v,dp){ const a=Math.abs(v), s=v<0?'−':'';
  if(a>=1e6) return s+'$'+(a/1e6).toFixed(2)+'M';
  if(a>=1e4) return s+'$'+(a/1e3).toFixed(a>=1e5?0:1)+'k';
  return s+'$'+a.toLocaleString('en-US',{maximumFractionDigits:dp??0}); }
function fTok(v){ const a=Math.abs(v);
  if(a>=1e9) return (v/1e9).toFixed(2)+'B'; if(a>=1e6) return (v/1e6).toFixed(2)+'M';
  if(a>=1e3) return (v/1e3).toFixed(1)+'k'; return v.toFixed(0); }
function fPrice(p){ if(!isFinite(p)) return '—'; if(p===0) return '$0'; if(p<1e-6) return '$'+p.toExponential(3); if(p<1) return '$'+p.toPrecision(4); return '$'+p.toFixed(4); }
function fPct(v){ if(!isFinite(v)) return '—'; const s=v>0?'+':v<0?'−':''; return s+Math.abs(v).toFixed(Math.abs(v)<10?2:1)+'%'; }
function cls(v){ return v>0.0001?'up':v<-0.0001?'down':''; }
function fX(v){ return v.toFixed(v<10?2:1)+'×'; }

// ---- sim state ----
function reset(){
  stopAuto();
  cfg=readCfg(); D=derive(cfg);
  pool={x:D.lpTokens,y:cfg.lpUsd,k:D.k};
  presaleBag=D.presaleTokens; traderBag=0; hist=[]; tradeNo=0;
  pts=[{mc:D.launchMc,price:D.launchPrice,side:null,label:'Launch'}];
  renderSetup(); renderAll();
}
function record(side,who,usd,tokens,before){
  const price=priceOf(pool), mc=price*cfg.supply;
  tradeNo++;
  const row={n:tradeNo,side,who,usd,tokens,fill:usd/tokens,price,mc,move:(price/before-1)*100};
  hist.push(row); pts.push({mc,price,side,label:`#${tradeNo} ${side==='b'?'Buy':'Sell'} ${fUsd(usd)}`});
  if(pts.length>4000){ pts.splice(1,1); }
}
function doBuy(usd,who='Trader'){
  if(!(usd>0)) return; const before=priceOf(pool);
  const q=qBuy(pool,usd,cfg.fee); pool=q.pool; traderBag+=q.tokens;
  record('b',who,usd,q.tokens,before);
}
function doSellTokens(t,who){
  if(!(t>0)) return; const before=priceOf(pool);
  const q=qSellTokens(pool,t,cfg.fee); pool=q.pool;
  record('s',who,q.usd,t,before);
}
function doSellUsd(usd){
  if(!(usd>0)) return;
  const avail=traderBag+presaleBag; if(avail<=0) return;
  let t=tokensForUsd(pool,usd,cfg.fee);
  if(!isFinite(t)||t>avail) t=avail;
  const fromTrader=Math.min(traderBag,t), fromPresale=t-fromTrader;
  traderBag-=fromTrader; presaleBag-=fromPresale;
  doSellTokens(t, fromPresale>fromTrader?'Presale':'Trader');
}
function doPresaleSell(pct){
  const t=presaleBag*pct/100; if(t<=0) return; presaleBag-=t; doSellTokens(t,'Presale');
}

// ---- auto market ----
function randn(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function tick(){
  const pressure=+$('pressure').value/100, avg=+$('avgSize').value, dump=+$('dump').value/100;
  if(presaleBag>1 && Math.random()<dump){ doPresaleSell(5+Math.random()*20); }
  else{
    const size=Math.max(10, avg*Math.exp(randn()*0.9-0.405));
    if(Math.random()<pressure) doBuy(size); else doSellUsd(size);
  }
  renderAll();
}
function startAuto(){ stopAuto(); timer=setInterval(tick, 1000/+$('speed').value); $('autoBtn').textContent='Pause auto market'; }
function stopAuto(){ if(timer){clearInterval(timer);timer=null;} if($('autoBtn')) $('autoBtn').textContent='Start auto market'; }

// ---- rendering ----
function renderSetup(){
  const segs=[['Presale',cfg.presalePct,'var(--accent)'],['Liquidity',cfg.lpPct,'var(--buy)'],['Team / other',Math.max(0,D.otherPct),'var(--muted)']];
  $('allocBar').innerHTML=segs.filter(s=>s[1]>0).map(s=>`<span style="width:${s[1]}%;background:${s[2]}"></span>`).join('');
  $('allocLegend').innerHTML=segs.map(s=>`<span><i style="background:${s[2]}"></i>${s[0]} ${+s[1].toFixed(2)}% · ${fTok(cfg.supply*s[1]/100)}</span>`).join('');
  const ratio=D.presalePrice? D.launchPrice/D.presalePrice:0;
  $('derived').innerHTML=`
    <div><small>Launch price</small><b>${fPrice(D.launchPrice)}</b></div>
    <div><small>Launch MC (FDV)</small><b>${fUsd(D.launchMc)}</b></div>
    <div><small>Presale price</small><b>${fPrice(D.presalePrice)}</b></div>
    <div><small>Presale entry vs launch</small><b>${ratio?fX(ratio)+' at open':'—'}</b></div>
    <div><small>Pool at open</small><b>${fUsd(cfg.lpUsd)} + ${fTok(D.lpTokens)}</b></div>
    <div><small>Raise left after LP</small><b>${fUsd(D.leftover)}</b></div>`;
  let note='';
  if(cfg.presalePct+cfg.lpPct>100) note=`<div class="note bad">Presale and liquidity add up to ${cfg.presalePct+cfg.lpPct}% of supply. Lower one of them.</div>`;
  else if(D.leftover<0) note=`<div class="note warn">Liquidity needs ${fUsd(-D.leftover)} more than the presale raised.</div>`;
  else if(ratio && ratio<1) note=`<div class="note warn">Presale buyers pay more than the launch price, so they open at a loss.</div>`;
  else if(ratio && Math.abs(ratio-1)<0.001) note=`<div class="note warn">Presale price equals launch price, so presale buyers open at break-even with no built-in markup.</div>`;
  $('setupNote').innerHTML=note;
}
function renderStats(){
  const price=priceOf(pool), mc=price*cfg.supply, chg=(price/D.launchPrice-1)*100;
  const ath=Math.max(...pts.map(p=>p.mc));
  const exit=presaleBag>0? qSellTokens(pool,presaleBag,cfg.fee):{usd:0,pool};
  const exitMove=(priceOf(exit.pool)/price-1)*100;
  const roi=D.presalePrice? price/D.presalePrice:0;
  const circ=(D.presaleTokens+D.lpTokens)*price;
  const S=(l,v,s,c='')=>`<div class="stat"><div class="eyebrow">${l}</div><div class="v">${v}</div><div class="s ${c}">${s}</div></div>`;
  $('stats').innerHTML=
    S('Market cap (FDV)',fUsd(mc),fPct(chg)+' vs launch',cls(chg))+
    S('Price',fPrice(price),'ATH MC '+fUsd(ath))+
    S('Pool depth',fUsd(pool.y),fTok(pool.x)+' tokens')+
    S('Circulating MC',fUsd(circ),'presale + LP tokens')+
    S('Presale ROI',roi?fX(roi):'—','bag '+fTok(presaleBag),cls(roi-1))+
    S('Presale full exit',fUsd(exit.usd),'MC → '+fUsd(priceOf(exit.pool)*cfg.supply)+' ('+fPct(exitMove)+')','down')+
    S('Trades',String(hist.length),fUsd(hist.filter(h=>h.side==='b').reduce((a,h)=>a+h.usd,0))+' bought')+
    S('Sold into pool',fUsd(hist.filter(h=>h.side==='s').reduce((a,h)=>a+h.usd,0)),'traders hold '+fTok(traderBag));
  const pill=$('statusPill');
  pill.textContent= hist.length? `${fUsd(mc)} MC · ${fPct(chg)}` : 'Launch state';
  pill.style.background= chg>0.01?'var(--buy-soft)':chg<-0.01?'var(--sell-soft)':'var(--accent-soft)';
  pill.style.color= chg>0.01?'var(--buy)':chg<-0.01?'var(--sell)':'var(--accent)';
}
function renderLog(){
  const rows=hist.slice(-60).reverse().map(h=>`<tr><td>${h.n}</td><td style="text-align:left"><span class="tag ${h.side}">${h.side==='b'?'BUY':'SELL'}</span></td><td style="font-family:var(--f-body)">${h.who}</td><td>${fUsd(h.usd)}</td><td>${fTok(h.tokens)}</td><td>${fPrice(h.fill)}</td><td>${fUsd(h.mc)}</td><td class="${cls(h.move)}">${fPct(h.move)}</td></tr>`).join('');
  $('logBody').innerHTML=rows||`<tr><td colspan="8" style="text-align:left;font-family:var(--f-body)" class="muted">No trades yet. Hit a buy or sell button, or start the auto market.</td></tr>`;
  $('logCount').textContent=hist.length>60?`latest 60 of ${hist.length}`:'';
}

// chart
let geo=null;
function niceTicks(min,max,n){ const span=max-min, step0=span/n, mag=Math.pow(10,Math.floor(Math.log10(step0))), r=step0/mag;
  const step=(r<1.5?1:r<3?2:r<7?5:10)*mag; const out=[]; for(let v=Math.ceil(min/step)*step; v<=max+1e-9; v+=step) out.push(v); return out; }
function renderChart(){
  const svg=$('chart'), W=svg.clientWidth||600, H=280, L=58, R=14, T=12, B=26;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const n=pts.length, mcs=pts.map(p=>p.mc);
  let lo=Math.min(...mcs,D.launchMc), hi=Math.max(...mcs,D.launchMc);
  if(hi-lo<hi*0.02){ lo*=0.95; hi*=1.05; } else { const pad=(hi-lo)*0.08; lo=Math.max(0,lo-pad); hi+=pad; }
  const xs=i=>L+(n<=1?0:i/(n-1))*(W-L-R), ys=v=>T+(1-(v-lo)/(hi-lo))*(H-T-B);
  const ticks=niceTicks(lo,hi,4);
  let g='';
  ticks.forEach(t=>{ const y=ys(t); g+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text x="${L-8}" y="${y+3.5}" text-anchor="end">${fUsd(t)}</text>`; });
  const xt=n<=1?[0]:niceTicks(0,n-1,Math.min(6,n-1)).filter(v=>Number.isInteger(v));
  xt.forEach(i=>{ g+=`<text x="${xs(i)}" y="${H-8}" text-anchor="middle">${i===0?'open':'#'+i}</text>`; });
  const yl=ys(D.launchMc);
  g+=`<line x1="${L}" x2="${W-R}" y1="${yl}" y2="${yl}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1"/>`;
  const line=pts.map((p,i)=>`${i?'L':'M'}${xs(i).toFixed(1)},${ys(p.mc).toFixed(1)}`).join('');
  const last=pts[n-1], up=last.mc>=D.launchMc;
  const col=up?'var(--buy)':'var(--sell)';
  if(n>1){
    g+=`<path d="${line}L${xs(n-1)},${H-B}L${L},${H-B}Z" fill="${col}" fill-opacity=".10" stroke="none"/>`;
    g+=`<path d="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`;
  }
  if(n<=160) pts.forEach((p,i)=>{ if(!p.side) return; const x=xs(i), y=ys(p.mc);
    g+= p.side==='b'? `<path d="M${x},${y-9}l4,6h-8z" fill="var(--buy)"/>` : `<path d="M${x},${y+9}l4,-6h-8z" fill="var(--sell)"/>`; });
  g+=`<circle cx="${xs(n-1)}" cy="${ys(last.mc)}" r="4.5" fill="${col}" stroke="var(--panel)" stroke-width="2"/>`;
  g+=`<line id="xh" x1="0" x2="0" y1="${T}" y2="${H-B}" stroke="var(--muted)" stroke-width="1" visibility="hidden"/><circle id="xd" r="4" fill="var(--accent)" stroke="var(--panel)" stroke-width="2" visibility="hidden"/>`;
  g+=`<rect x="${L}" y="0" width="${W-L-R}" height="${H}" fill="transparent" id="hit"/>`;
  svg.innerHTML=g; geo={xs,ys,L,R,W,n};
}
function chartHover(e){
  if(!geo) return; const svg=$('chart'), r=svg.getBoundingClientRect();
  const px=(e.clientX-r.left)*(geo.W/r.width);
  if(px<geo.L-4||px>geo.W-geo.R+4){ hideTip(); return; }
  const i=Math.max(0,Math.min(geo.n-1,Math.round((px-geo.L)/Math.max(1,(geo.W-geo.L-geo.R))*(geo.n-1))));
  const p=pts[i], x=geo.xs(i), y=geo.ys(p.mc);
  const xh=$('xh'), xd=$('xd'); if(!xh) return;
  xh.setAttribute('x1',x); xh.setAttribute('x2',x); xh.setAttribute('visibility','visible');
  xd.setAttribute('cx',x); xd.setAttribute('cy',y); xd.setAttribute('visibility','visible');
  const tip=$('tip'); tip.hidden=false;
  const vs=(p.mc/D.launchMc-1)*100;
  tip.innerHTML=`<div style="font-family:var(--f-body);font-weight:600">${p.label}</div>MC ${fUsd(p.mc)} <span class="${cls(vs)}">${fPct(vs)}</span><br>Price ${fPrice(p.price)}`;
  const sx=x*(r.width/geo.W), tw=tip.offsetWidth;
  tip.style.left=Math.max(0,Math.min(r.width-tw, sx+12 > r.width-tw ? sx-tw-12 : sx+12))+'px';
  tip.style.top=Math.max(0,y*(r.height/280)-50)+'px';
}
function hideTip(){ $('tip').hidden=true; const xh=$('xh'),xd=$('xd'); if(xh){xh.setAttribute('visibility','hidden');xd.setAttribute('visibility','hidden');} }

function basePool(){ return base==='launch'? {x:D.lpTokens,y:cfg.lpUsd,k:D.k} : {...pool}; }
function renderTables(){
  const bp=basePool(), p0=priceOf(bp), mc0=p0*cfg.supply, bag= base==='launch'? D.presaleTokens : presaleBag;
  $('tBuy').innerHTML=BUY_SIZES.map(u=>{ const q=qBuy(bp,u,cfg.fee), p=priceOf(q.pool), mv=(p/p0-1)*100;
    return `<tr><td>${fUsd(u)}</td><td>${fTok(q.tokens)}</td><td>${(q.tokens/cfg.supply*100).toFixed(2)}%</td><td>${fPrice(u/q.tokens)}</td><td>${fUsd(p*cfg.supply)}</td><td class="up">${fPct(mv)}</td></tr>`; }).join('');
  $('tSell').innerHTML=SELL_SIZES.filter(u=>u<bp.y*0.95).map(u=>{ const t=tokensForUsd(bp,u,cfg.fee), q=qSellTokens(bp,t,cfg.fee), p=priceOf(q.pool), mv=(p/p0-1)*100;
    return `<tr><td>${fUsd(u)}</td><td>${fTok(t)}</td><td>${(t/cfg.supply*100).toFixed(2)}%</td><td>${fPrice(u/t)}</td><td>${fUsd(p*cfg.supply)}</td><td class="down">${fPct(mv)}</td></tr>`; }).join('')
    || `<tr><td colspan="6" class="muted" style="font-family:var(--f-body)">Pool is too thin for these sizes.</td></tr>`;
  const targets=[1.5,2,3,5,10,20].map(m=>{ const raw=mc0*m, mag=Math.pow(10,Math.floor(Math.log10(raw))-1); return Math.round(raw/mag)*mag; });
  $('tRoad').innerHTML=targets.map(t=>{ const price=t/cfg.supply, need=usdToReachPrice(bp,price,cfg.fee), y=Math.sqrt(bp.k*price);
    return `<tr><td>${fUsd(t)}</td><td>${fPrice(price)}</td><td class="up">${fUsd(need)}</td><td>${fUsd(y)}</td><td>${fX(t/mc0)}</td></tr>`; }).join('');
  $('tPresale').innerHTML= bag>0? PS_PCTS.map(pc=>{ const t=bag*pc/100, q=qSellTokens(bp,t,cfg.fee), p=priceOf(q.pool), mv=(p/p0-1)*100;
    const roi=D.presaleUsd>0? q.usd/(D.presaleUsd*t/D.presaleTokens):0;
    return `<tr><td>${pc}%</td><td>${fTok(t)}</td><td>${fUsd(q.usd)}</td><td class="${cls(roi-1)}">${roi?fX(roi):'—'}</td><td>${fUsd(p*cfg.supply)}</td><td class="down">${fPct(mv)}</td></tr>`; }).join('')
    : `<tr><td colspan="6" class="muted" style="font-family:var(--f-body)">Presale bag is empty.</td></tr>`;
}
function renderInsights(){
  const bp={x:D.lpTokens,y:cfg.lpUsd,k:D.k};
  const need2=usdToReachPrice(bp,D.launchPrice*2,cfg.fee), need10=usdToReachPrice(bp,D.launchPrice*10,cfg.fee);
  const full=qSellTokens(bp,D.presaleTokens,cfg.fee), fullMove=(priceOf(full.pool)/D.launchPrice-1)*100;
  const ratio=D.presaleTokens/D.lpTokens;
  const b5=qBuy(bp,5000,cfg.fee), m5=(priceOf(b5.pool)/D.launchPrice-1)*100;
  $('insights').innerHTML=`
    <div class="insight"><div class="eyebrow">To double from launch</div><div class="big up">${fUsd(need2)} net buys</div><p>MC ${fUsd(D.launchMc)} → ${fUsd(D.launchMc*2)}. Reaching 10× (${fUsd(D.launchMc*10)}) takes ${fUsd(need10)}. Price grows with the square of the $ in the pool.</p></div>
    <div class="insight"><div class="eyebrow">A single $5k buy at open</div><div class="big up">${fPct(m5)}</div><p>Takes MC to ${fUsd(priceOf(b5.pool)*cfg.supply)}. The same $5k sold right after only gets back what the pool gives on the way down, minus fees both ways.</p></div>
    <div class="insight"><div class="eyebrow">Presale overhang</div><div class="big down">${ratio.toFixed(2)}× the pool</div><p>Presale holders own ${fTok(D.presaleTokens)} tokens vs ${fTok(D.lpTokens)} in the pool. If they all sold at open, MC falls to ${fUsd(priceOf(full.pool)*cfg.supply)} (${fPct(fullMove)}) and they pull out ${fUsd(full.usd)}.</p></div>`;
}
function renderAll(){ renderStats(); renderChart(); renderLog(); if(base==='now') renderTables(); }

// ---- wiring ----
['supply','fee','presalePct','presaleUsd','lpPct','lpUsd'].forEach(id=>$(id).addEventListener('change',()=>{ reset(); renderTables(); renderInsights(); }));
document.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>{ doBuy(+b.dataset.buy); renderAll(); }));
document.querySelectorAll('[data-sell]').forEach(b=>b.addEventListener('click',()=>{ doSellUsd(+b.dataset.sell); renderAll(); }));
document.querySelectorAll('[data-ps]').forEach(b=>b.addEventListener('click',()=>{ doPresaleSell(+b.dataset.ps); renderAll(); }));
$('customBuy').addEventListener('click',()=>{ doBuy(+$('customUsd').value); renderAll(); });
$('customSell').addEventListener('click',()=>{ doSellUsd(+$('customUsd').value); renderAll(); });
$('resetBtn').addEventListener('click',()=>{ reset(); renderTables(); });
$('autoBtn').addEventListener('click',()=>{ timer? stopAuto() : startAuto(); });
const outs={pressure:v=>v+'% buys',avgSize:v=>'$'+(+v).toLocaleString(),dump:v=>v+'%',speed:v=>v+' trades/s'};
Object.keys(outs).forEach(id=>$(id).addEventListener('input',()=>{ $(id+'Out').textContent=outs[id]($(id).value); if(id==='speed'&&timer) startAuto(); }));
function setBase(b){ base=b; $('baseLaunch').setAttribute('aria-pressed',b==='launch'); $('baseNow').setAttribute('aria-pressed',b==='now'); renderTables(); }
$('baseLaunch').addEventListener('click',()=>setBase('launch'));
$('baseNow').addEventListener('click',()=>setBase('now'));
const svg=$('chart'); svg.addEventListener('mousemove',chartHover); svg.addEventListener('mouseleave',hideTip);
if('ResizeObserver' in window) new ResizeObserver(()=>renderChart()).observe($('chartbox'));

// open with a short example sequence so the chart isn't empty
reset();
[1000,500,2500,-800,1500,-400,5000,-1200].forEach(v=> v>0? doBuy(v) : doSellUsd(-v));
doPresaleSell(10);
renderAll(); renderTables(); renderInsights();
})();
