/* Daily Briefing · widget home (preview)
   Architecture: ONE shared STORE (briefing slice + schedule slice). Each SECTION reads its slice and owns
   widget(), summary() and detail(). The Briefing page is built only from section summaries. */
(()=>{
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TZ='America/Toronto';
// no money / financial info, ever (stricter than the public page)
const FIN=/\$|CA\$|\bOSAP\b|NSLSC|\bBMO\b|chequing|savings|payday|refund|subscription|renew|\bloan\b|bank|account ending|financ|receipt|invoice|budget/i;
const noFin=xs=>(xs||[]).filter(x=>!FIN.test(typeof x==='string'?x:JSON.stringify(x)));
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* ---------------- time helpers (24 h, Ontario) ---------------- */
const dnum=iso=>Math.round(Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))/864e5);
const diso=n=>new Date(n*864e5).toISOString().slice(0,10);
const ddow=n=>DOW[new Date(n*864e5).getUTCDay()];
const dlab=n=>{const d=new Date(n*864e5);return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`};
const t2m=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const m2t=m=>{m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
const hrs=m=>{const h=m/60;return (Math.round(h*10)/10).toString().replace(/\.0$/,'')+' h'};
function nowTor(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
 return {iso:`${p.year}-${p.month}-${p.day}`,min:(+p.hour%24)*60+ +p.minute}}
const parseMD=(s,yr)=>{const m=/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/.exec(s||'');return m?dnum(`${yr}-${String(MON.indexOf(m[1])+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`):null};

/* ---------------- shared data store ---------------- */
const STORE={briefing:null,schedule:null,archive:[],meta:{}};
function parseBriefingHTML(t){
 const doc=new DOMParser().parseFromString(t,'text/html'),tx=e=>e?e.textContent.replace(/\s+/g,' ').trim():'';
 const title=c=>{const h=c.querySelector('h2').cloneNode(true);h.querySelectorAll('.ic,.badge').forEach(x=>x.remove());return tx(h)};
 const cards=[...doc.querySelectorAll('section.card')],find=p=>cards.find(c=>title(c).startsWith(p));
 const label=tx(doc.querySelector('header .date'));const lm=/([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(label);if(!lm)throw Error('no date');
 const MONL=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const b={date:`${lm[3]}-${String(MONL.indexOf(lm[1])+1).padStart(2,'0')}-${lm[2].padStart(2,'0')}`,date_label:label,greeting:tx(doc.querySelector('header .greet')),generated:tx([...doc.querySelectorAll('footer')].pop()),source:'live'};
 let c=find('Weather');if(c&&c.querySelector('.big')){const big=c.querySelector('.big').cloneNode(true),sm=big.querySelector('small');const nl=tx(sm);sm&&sm.remove();const bm=/(\S+)\s*(-?\d+)°/.exec(tx(big))||[];
  const g=[...c.querySelectorAll('.grid4>div')].map(d=>tx(d.querySelector('b')));const hl=/(-?\d+)°\s*\/\s*(-?\d+)°/.exec(g[0]||'')||[];
  b.weather={location:title(c).split('—')[1]?.trim()||'Waterloo, ON',icon:bm[1]||'🌤',now_c:+bm[2],now_label:nl,high_c:+hl[1],low_c:+hl[2],conditions:g[1]||'',wind:g[2]||'',precip_pct:parseInt(g[3])||0}}
 c=find('Aviation');if(c&&c.querySelector('pre')){const pr=[...c.querySelectorAll('pre')],dc=[...c.querySelectorAll('.dec')];
  b.aviation={station:title(c).split('—')[1]?.trim()||'CYKF',category:tx(c.querySelector('.badge')),metar:pr[0]?.textContent.trim()||'',metar_decoded:tx(dc[0]),taf:pr[1]?.textContent.trim()||'',taf_decoded:tx(dc[1]),note:tx(c.querySelector('.note'))}}
 c=find("Today's Shifts");b.shifts=c?[...c.querySelectorAll('.shift')].map(s=>{const tm=tx(s.querySelector('.tm')),m=/(\d\d:\d\d)\s*[–-]\s*(\d\d:\d\d)/.exec(tm);return {employer:tx(s.querySelector('.emp')),start:m?m[1]:null,end:m?m[2]:null,detail:tx(s.querySelector('.det'))}}):[];
 b.overlap=!!(c&&c.querySelector('.badge'));
 c=find('Movements');b.movements=c?[...c.querySelectorAll('tr')].slice(1).map(r=>{const d=[...r.children].map(tx);return {time:d[0],tail:d[1],type:d[2],dir:d[3],parking:d[4],services:d[5]}}):[];
 c=find('Workout');b.workout=c&&c.querySelector('.wo')?{group:tx(c.querySelector('.wo .b')),time:tx(c.querySelector('.wo .tm')),label:tx(c.querySelector('.wo .muted'))}:null;
 c=find("Today's Calendar");b.calendar_img=c&&c.querySelector('img.cal')?c.querySelector('img.cal').getAttribute('src'):null;
 c=find('Open Tasks');b.tasks=c?[...c.querySelectorAll('.task')].map(x=>tx(x).replace(/^☐\s*/,'')):[];
 c=find('Top Pilot');b.prospects=c?[...c.querySelectorAll('.pr')].map(p=>{const pt=p.querySelector('.pt').cloneNode(true),nw=pt.querySelector('.new');nw&&nw.remove();const pc=tx(p.querySelector('.pc')).split(' · ');
  return {rank:+tx(p.querySelector('.rk')),title:tx(pt),company:pc[0],location:pc.slice(1).join(' · '),minimums:tx(p.querySelector('.pm')),link:p.querySelector('.pl a')?.getAttribute('href')||'',isNew:!!nw}}):[];
 c=find('Next 76ers');if(c&&c.querySelector('.nm')){const nm=c.querySelector('.nm').cloneNode(true),ha=tx(nm.querySelector('.ha')),hb=tx(nm.querySelector('.hb'));nm.querySelectorAll('.ha,.hb').forEach(x=>x.remove());const nt=tx(c.querySelector('.nt')).split(' · '),nv=[...c.querySelectorAll('.nv')].map(tx);
  b.sixers={opponent:tx(nm),home_away:hb.toLowerCase()==='home'?'home':'away',date_label:nt[0],tipoff:nt[1]||'',venue:(nv[0]||'').replace(/^📍\s*/,''),tv:(nv[1]||'').replace(/^📺\s*/,''),game_day:!!c.querySelector('.badge')}}else b.sixers=null;
 c=find('Other Noteworthy');b.noteworthy=c?[...c.querySelectorAll('.li')].map(l=>{const f=tx(l.querySelector('b'));return {from:f,text:tx(l.querySelector('div')).slice(f.length).trim()}}):[];
 b.focus=tx(doc.querySelector('.focus .ft'));
 return b}
async function getJSON(u){const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error(r.status);return r.json()}
async function load(){
 // Briefing slice: the live public briefing Sunny publishes each morning (same origin), else the bundled snapshot.
 try{const r=await fetch('../index.html',{cache:'no-store'});if(!r.ok)throw 0;STORE.briefing=parseBriefingHTML(await r.text());STORE.meta.briefing='Live: public briefing'}
 catch(e){STORE.briefing=await getJSON('data/briefing.json');STORE.meta.briefing='Snapshot: '+STORE.briefing.date}
 const B=STORE.briefing;B.tasks=noFin(B.tasks);B.noteworthy=noFin(B.noteworthy);
 // Schedule slice: Cal's combined schedule (public schedule.json), else bundled snapshot.
 try{STORE.schedule=await getJSON('/schedule/data/schedule.json');STORE.meta.schedule='Live: Cal\u2019s combined schedule'}
 catch(e){STORE.schedule=await getJSON('data/schedule.json');STORE.meta.schedule='Snapshot'}
 STORE.meta.scheduleUpdated=STORE.schedule.updated;
 try{STORE.archive=(await getJSON('../days/index.json')).days}catch(e){STORE.archive=[{date:B.date,label:B.date_label,focus:B.focus}]}
 MODEL.cache={}}

/* ---------------- per-section models (memoised from the store) ---------------- */
const MODEL={cache:{},get(k){return this.cache[k]||(this.cache[k]=BUILD[k]())}};
const WORK=new Set(['chartright','ea']),TYPEN={sleep:'Sleep',chartright:'Chartright',ea:'EA',workout:'Workout',guelph:'Guelph',event:'Event'};
const BUILD={
 schedule(){const S=STORE.schedule,B=STORE.briefing,day0=dnum(B.date),now=nowTor();
  const segs=S.events.map(e=>({d:dnum(e.date),s:t2m(e.start),e:t2m(e.end),type:e.type,label:e.label,notes:e.notes||'',split:e.split})).sort((a,b)=>a.d-b.d||a.s-b.s);
  // merge overnight continuations into spans (absolute minutes)
  const spans=[];for(const x of segs){const a=x.d*1440+x.s,z=x.d*1440+x.e,p=spans.find(q=>q.type===x.type&&q.z===a&&(x.s===0));
   if(p){p.z=z;if(x.notes&&!p.notes.includes(x.notes))p.notes=(p.notes?p.notes+' · ':'')+x.notes}else spans.push({a,z,type:x.type,label:x.label,notes:x.notes,split:x.split})}
  spans.forEach(s=>{s.d=Math.floor(s.a/1440);s.range=m2t(s.a)+'–'+m2t(s.z)+(Math.floor((s.z-1)/1440)>s.d?' (+1)':'')});
  const clip=d=>spans.filter(s=>s.a<(d+1)*1440&&s.z>d*1440).map(s=>Object.assign({},s,{cs:Math.max(0,s.a-d*1440),ce:Math.min(1440,s.z-d*1440)}));
  const live=now.iso===B.date,nowAbs=live?day0*1440+now.min:null;
  const today=clip(day0),todayList=today.filter(s=>s.d===day0||s.type!=='sleep'||s.ce>s.cs);
  const next=(live?spans.find(s=>s.z>nowAbs&&s.type!=='sleep'):today.find(s=>s.type!=='sleep'))||null;
  const free=[];let cur=6*60;for(const s of today.filter(s=>s.ce>6*60).sort((a,b)=>a.cs-b.cs)){if(s.cs-cur>=45)free.push([cur,Math.min(s.cs,23*60)]);cur=Math.max(cur,s.ce)}if(23*60-cur>=45)free.push([cur,23*60]);
  const week=[...Array(7)].map((_,i)=>{const d=day0+i,c=clip(d);return {d,segs:c,starts:spans.filter(s=>s.d===d),work:c.filter(s=>WORK.has(s.type)).reduce((t,s)=>t+s.ce-s.cs,0),sleep:c.filter(s=>s.type==='sleep').reduce((t,s)=>t+s.ce-s.cs,0)}});
  const wk={work:week.reduce((t,x)=>t+x.work,0),shifts:spans.filter(s=>WORK.has(s.type)&&s.d>=day0&&s.d<day0+7).length,workouts:spans.filter(s=>s.type==='workout'&&s.d>=day0&&s.d<day0+7).length,sleepAvg:week.reduce((t,x)=>t+x.sleep,0)/7};
  // nightly sleep before each work shift (flags)
  const flags=[];spans.filter(s=>WORK.has(s.type)&&s.d>=day0&&s.d<day0+7).forEach(w=>{const sl=spans.filter(s=>s.type==='sleep'&&s.z<=w.a&&s.z>w.a-14*60);const m=sl.reduce((t,s)=>t+s.z-s.a,0);if(m&&m<7*60)flags.push(`${dlab(w.d)}: ${hrs(m)} of sleep before ${TYPEN[w.type]} ${m2t(w.a)}`)});
  return {day0,live,now,nowAbs,today,todayList,next,free,week,wk,flags,updated:S.updated}},
 weather(){return STORE.briefing.weather},
 aviation(){return STORE.briefing.aviation},
 work(){const B=STORE.briefing,sc=MODEL.get('schedule');
  return {shifts:B.shifts||[],overlap:B.overlap,movements:B.movements||[],upcoming:[]
   .concat(...sc.week.map(w=>w.starts.filter(s=>WORK.has(s.type)))).filter(s=>s.d>sc.day0||s.d===sc.day0),hours:sc.wk.work,count:sc.wk.shifts}},
 day(){const B=STORE.briefing,R=/^(Reminders?\b|Due\b|Later\b)/i;return {focus:B.focus,greeting:B.greeting,workout:B.workout,cal:B.calendar_img,tasks:(B.tasks||[]).filter(t=>!R.test(t)).map(t=>t.replace(/^No due date:\s*/i,'')),generated:B.generated}},
 reminders(){const B=STORE.briefing,yr=+B.date.slice(0,4),d0=dnum(B.date);let status='';const items=[];
  for(const t of B.tasks||[]){if(/^Reminders:/i.test(t)){status=t.replace(/^Reminders:\s*/i,'');continue}
   const m=/^(?:Reminder,?\s*|Due\s+)?([^:]+?)(?:\s*\(([^)]*)\))?:\s*(.+)$/i.exec(t);if(!/^(Reminder|Due|Later)/i.test(t)||!m)continue;
   const when=m[1].replace(/^Reminder,?\s*/i,'').trim(),dn=/later/i.test(when)?null:parseMD(when,yr);
   items.push({when:/later/i.test(t.slice(0,6))?'Later':when,dn,days:dn==null?null:dn-d0,text:m[3],flag:m[2]||''})}
  items.sort((a,b)=>(a.dn??1e9)-(b.dn??1e9));return {status,items}},
 inbox(){return {highlights:STORE.briefing.noteworthy||[],sample:[
  {from:'Flight school',subj:'Ground school slides for next week',when:'08:12',label:'Training'},
  {from:'Crew scheduling',subj:'Next week\u2019s roster is available',when:'Yesterday 17:40',label:'Work'},
  {from:'Airport ops',subj:'NOTAM digest: taxiway closure overnight',when:'Yesterday 21:05',label:'Work'},
  {from:'A friend',subj:'Weekend plans?',when:'Yesterday 19:30',label:'Personal'}]}},
 more(){const B=STORE.briefing;return {prospects:B.prospects||[],sixers:B.sixers,archive:STORE.archive||[]}}
};

/* ---------------- sections ---------------- */
const tl=(segs,nowMin)=>`<div class="tl">${segs.map(s=>`<i style="left:${s.cs/14.4}%;width:${(s.ce-s.cs)/14.4}%;background:var(--${s.type in TYPEN?s.type:'event'})"></i>`).join('')}${nowMin!=null?`<span class="now" style="left:${nowMin/14.4}%"></span>`:''}</div><div class="tlx"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>`;
const evrow=(s,nx)=>`<div class="ev${nx?' next':''}" style="--ec:var(--${s.type})"><b>${s.range}</b><span>${esc(s.label)}</span></div>`;
const hd=(k,sub)=>`<div class="hd" style="--sc:${SEC[k].c}"><div class="ico">${SEC[k].ico}</div><div><h2>${esc(SEC[k].name)}</h2><p>${sub}</p></div></div>`;
const card=(t,b,tag='')=>`<div class="card"><h3>${t}${tag?`<span class="tag">${tag}</span>`:''}</h3>${b}</div>`;
const xlink=(k,txt,view)=>`<button class="link" data-open="${k}"${view?` data-view="${view}"`:''}>${txt} ›</button>`;

/* week-grid blocks: name + start + end, sized to fit; every block is tappable (popover with full details) */
const WKB=[];
const endT=z=>z%1440===0?'24:00':m2t(z);
function wkBlk(s,d,H){const px=(s.ce-s.cs)/60*H,from=s.a<d*1440,cont=s.z>(d+1)*1440,sl=s.type==='sleep',ty=s.type in TYPEN?s.type:'event';
 const st=(from?'↑':'')+m2t(s.a),en=endT(s.z)+(cont?'↓':'');let L=[];
 if(px>=36)L=[[TYPEN[ty],px>=48?'wr':''],st,en];else if(px>=33)L=[st,en];else if(px>=13)L=[from?'…'+en:st];
 const id=WKB.push({s,d})-1,lab=`${TYPEN[ty]}${s.label&&s.label!==TYPEN[ty]?' '+s.label:''}, ${dlab(Math.floor(s.a/1440))} ${m2t(s.a)} to ${endT(s.z)}`;
 return `<i role="button" tabindex="0" data-wkb="${id}" aria-label="${esc(lab)}" class="${sl?'sl':''}${px<13?' tiny':''}" style="top:${s.cs/60*H}px;height:${Math.max(3,px)}px;background:var(--${ty})">${L.map(x=>Array.isArray(x)?`<em class="${x[1]}">${x[1]?esc(x[0]).replace('Chartright','Chart&shy;right').replace('Workout','Work&shy;out'):esc(x[0])}</em>`:`<span>${esc(x)}</span>`).join('')}</i>`}
function wkPop(id,ov){const b=WKB[id];if(!b)return;const s=b.s,ty=s.type in TYPEN?s.type:'event',d1=Math.floor(s.a/1440),d2=Math.floor((s.z-1)/1440);
 const when=d1===d2?`${dlab(d1)}`:`${dlab(d1)} → ${dlab(d2)}`;
 let p=ov.querySelector('.wkpop');if(p)p.remove();p=document.createElement('div');p.className='wkpop';
 p.innerHTML=`<div class="wkp" role="dialog" aria-label="${esc(TYPEN[ty])} details" style="--ec:var(--${ty})"><div class="k"><span class="dot"></span>${esc(TYPEN[ty])}</div><b>${esc(s.label||TYPEN[ty])}</b><div class="tm">${m2t(s.a)}–${endT(s.z)}${d2>d1?' <small>(+1)</small>':''}</div><div class="sm">${esc(when)} · ${hrs(s.z-s.a)}${b.d!==d1?` · continued from ${ddow(d1)}`:''}</div>${s.notes?`<div class="sm nt">${esc(s.notes)}</div>`:''}<button class="done">Done</button></div>`;
 p.onclick=e=>{if(e.target===p||e.target.closest('.done'))p.remove()};ov.appendChild(p);p.querySelector('.done').focus({preventScroll:true})}

const SEC={
 schedule:{name:'Schedule',ico:'🗓️',c:'#38bdf8',
  widget(m,view){if(view==='week'){return `<div class="wl">🗓️ This week<span class="tag muted">${m.wk.shifts} shifts · ${m.wk.workouts} workouts</span></div><div class="wkm">${m.week.map((w,i)=>`<div class="d${i===0?' today':''}"><small>${ddow(w.d).slice(0,2)} ${new Date(w.d*864e5).getUTCDate()}</small><div class="col">${w.segs.map(s=>`<i style="top:${s.cs/14.4}%;height:${(s.ce-s.cs)/14.4}%;background:var(--${s.type})"></i>`).join('')}</div></div>`).join('')}</div>`}
   const list=m.todayList.filter(s=>s.type!=='sleep'||s.d===m.day0);
   return `<div class="wl">🗓️ Today<span class="tag muted">${m.live?'Now '+m2t(m.now.min):dlab(m.day0)}</span></div>
   <div style="margin:8px 0 6px">${tl(m.today,m.live?m.now.min:null)}</div>
   ${m.next?`<div class="mid cl1" style="margin:4px 0 2px">${esc(m.next.label)}</div><div class="sm">${m.live&&m.next.a<=m.nowAbs?'Happening now':'Next up'} · ${m.next.range}</div>`:''}
   <div class="evl" style="margin-top:8px">${list.map(s=>evrow(s,s===m.next||(m.next&&s.a===m.next.a))).join('')}</div>`},
  summary(m){const n=m.next,on=n&&m.live&&n.a<=m.nowAbs;return {cls:'hero',t1:n?`${on?'Now':'Next'}: ${n.label} · ${n.range}`:'Nothing else scheduled today',
   html:`${tl(m.today,m.live?m.now.min:null)}<div class="evl">${m.todayList.filter(s=>s.type!=='sleep').slice(0,4).map(s=>evrow(s,n&&s.a===n.a)).join('')}</div>`}},
  weekSummary(m){return {t1:`This week: ${m.wk.shifts} shifts (${hrs(m.wk.work)}), ${m.wk.workouts} workouts`,t2:`Avg sleep ${hrs(m.wk.sleepAvg)} a day${m.flags.length?` · ⚠ ${m.flags.length} short-sleep night${m.flags.length>1?'s':''}`:''}`}},
  detail(m,view){const seg=`<div class="seg"><button data-view="today" class="${view!=='week'?'on':''}">Today</button><button data-view="week" class="${view==='week'?'on':''}">Week</button></div>`;
   const src=`<p class="sm" style="margin-top:6px">Source: Cal\u2019s combined schedule (${esc(STORE.meta.schedule)}, updated ${esc((m.updated||'').replace('T',' ').slice(0,16))} UTC). Times are Ontario, 24 h.</p>`;
   if(view==='week'){const H=22;WKB.length=0;
    return hd('schedule',`${dlab(m.day0)} – ${dlab(m.day0+6)}`)+seg+`<div class="stat3"><div><b>${m.wk.shifts}</b><span>Shifts</span></div><div><b>${hrs(m.wk.work)}</b><span>Work</span></div><div><b>${m.wk.workouts}</b><span>Workouts</span></div></div>`+
    card('Week view',`<div class="wg" style="--hh:${H}px"><div></div>${m.week.map((w,i)=>`<div class="h${i===0?' today':''}">${ddow(w.d)}<br>${new Date(w.d*864e5).getUTCDate()}</div>`).join('')}
     <div class="ax" style="height:${24*H}px">${[0,3,6,9,12,15,18,21,24].map(h=>`<span class="${h===0?'f':h===24?'l':''}" style="top:${h*H}px">${String(h).padStart(2,'0')}:00</span>`).join('')}</div>
     ${m.week.map((w,i)=>`<div class="col${i===0?' today':''}" style="height:${24*H}px">${w.segs.map(s=>wkBlk(s,w.d,H)).join('')}</div>`).join('')}</div>
     <p class="sm wkhint">Tap any block for its full times. ↑ continues from the day before · ↓ continues past midnight.</p>
     <div class="legend">${Object.keys(TYPEN).map(t=>`<span style="--ec:var(--${t})">${TYPEN[t]}</span>`).join('')}</div>`)+
    (m.flags.length?card('⚠ Sleep flags',m.flags.map(f=>`<div class="li">${esc(f)}</div>`).join('')):'')+
    card('Day by day',m.week.map((w,i)=>`<div class="dayrow${i===0?' today':''}"><h4>${dlab(w.d)}${i===0?' · Today':''} <span class="muted" style="font-weight:400;font-size:12px">· work ${hrs(w.work)} · sleep ${hrs(w.sleep)}</span></h4>${w.starts.map(s=>`<div class="ev" style="--ec:var(--${s.type})"><b>${s.range}</b><span>${esc(s.label)}${s.notes?` <span class="muted">· ${esc(s.notes)}</span>`:''}</span></div>`).join('')||'<div class="sm">Nothing scheduled</div>'}</div>`).join(''))+src}
   const H=38,blocks=m.today.map(s=>`<div class="blk" style="--ec:var(--${s.type});top:${s.cs/60*H}px;height:${Math.max(22,(s.ce-s.cs)/60*H-2)}px"><b>${esc(s.label)}</b><small>${m2t(s.cs)}–${m2t(s.ce)}${s.a<m.day0*1440?' · since yesterday':''}${s.z>(m.day0+1)*1440?' · continues':''}</small>${s.notes&&(s.ce-s.cs)>=90?`<div class="muted">${esc(s.notes)}</div>`:''}</div>`).join('');
   const fr=m.free.map(f=>`<div class="blk free" style="top:${f[0]/60*H}px;height:${(f[1]-f[0])/60*H-2}px"><b class="muted">Free</b><small>${m2t(f[0])}–${m2t(f[1])}</small></div>`).join('');
   return hd('schedule',dlab(m.day0)+(m.live?` · now ${m2t(m.now.min)}`:''))+seg+
    (m.next?card(m.live&&m.next.a<=m.nowAbs?'Happening now':'Next up',`<div class="mid">${esc(m.next.label)}</div><div class="sm">${m.next.range}${m.next.notes?' · '+esc(m.next.notes):''}</div>`):'')+
    card('Free windows',m.free.length?`<div class="chips">${m.free.map(f=>`<span class="chip">${m2t(f[0])}–${m2t(f[1])} · ${hrs(f[1]-f[0])}</span>`).join('')}</div>`:'<div class="sm">No free windows over 45 min between 06:00 and 23:00</div>')+
    card('Timeline',`<div class="dt" style="height:${24*H}px">${[...Array(25)].map((_,h)=>`<div class="hl" style="top:${h*H}px"></div><div class="hr" style="top:${h*H}px">${String(h).padStart(2,'0')}:00</div>`).join('')}${fr}${blocks}${m.live?`<div class="nowl" style="top:${m.now.min/60*H}px"></div>`:''}</div>`)+
    card('All of today',m.todayList.map(s=>`<div class="li"><div class="k" style="color:var(--${s.type})">${TYPEN[s.type]||'Event'} · ${s.range}</div>${esc(s.label)}${s.notes?`<div class="sm">${esc(s.notes)}</div>`:''}</div>`).join(''))+src}},
 weather:{name:'Weather',ico:'🌤️',c:'#fbbf24',
  widget(w){if(!w)return `<div class="wl">🌤️ Weather</div><div class="wb sm">Unavailable</div>`;return `<div class="wl">🌤️ ${esc(w.location.split(',')[0])}</div><div class="wb"><div class="big">${w.icon} ${Math.round(w.now_c)}°</div><div class="sm cl2" style="margin-top:6px">H ${Math.round(w.high_c)}° · L ${Math.round(w.low_c)}° · ${w.precip_pct}% precip</div></div>`},
  summary(w){return w?{t1:`${Math.round(w.now_c)}° now, high ${Math.round(w.high_c)}°, low ${Math.round(w.low_c)}°`,t2:w.conditions,ico:w.icon}:{t1:'Weather unavailable'}},
  detail(w){if(!w)return hd('weather','Unavailable');const lo=Math.min(w.low_c,w.now_c),hi=Math.max(w.high_c,w.now_c),p=v=>((v-lo)/((hi-lo)||1)*100).toFixed(1);
   const sc=MODEL.get('schedule'),out=sc.todayList.filter(s=>s.type!=='sleep');
   return hd('weather',esc(w.location)+' · '+esc(w.now_label))+card('Now',`<div style="display:flex;align-items:center;gap:16px"><div class="big" style="font-size:56px">${w.icon} ${Math.round(w.now_c)}°</div><div class="sm">${esc(w.conditions)}</div></div>
    <div style="margin:14px 0 4px;position:relative;height:10px;border-radius:5px;background:linear-gradient(90deg,#60a5fa,#fbbf24,#f97316)"><span style="position:absolute;left:${p(w.now_c)}%;top:-4px;width:4px;height:18px;border-radius:2px;background:var(--text)"></span></div><div class="tlx"><span>Low ${Math.round(w.low_c)}°</span><span>High ${Math.round(w.high_c)}°</span></div>`)+
    card('Details',`<div class="kv"><div><b>${Math.round(w.high_c)}° / ${Math.round(w.low_c)}°</b><span>High / low</span></div><div><b>${w.precip_pct}%</b><span>Precipitation</span></div><div><b>${esc(w.wind)}</b><span>Wind</span></div><div><b>${esc(w.now_label)}</b><span>Observed</span></div></div>`)+
    card('Your day outside',out.map(s=>`<div class="ev" style="--ec:var(--${s.type})"><b>${s.range}</b><span>${esc(s.label)}</span></div>`).join('')+`<p class="sm" style="margin-top:8px">${esc(w.conditions)}</p>`,'from Schedule')+
    (STORE.briefing.aviation?.note?card('Field note',`<div class="note">${esc(STORE.briefing.aviation.note)}</div>`,'from Aviation'):'')}},
 aviation:{name:'Aviation',ico:'🛫',c:'#4ade80',
  widget(a){if(!a)return `<div class="wl">🛫 Aviation</div><div class="wb sm">METAR/TAF unavailable</div>`;const wm=/Wind ([^·]+)/.exec(a.metar_decoded||'');return `<div class="wl">🛫 ${esc(a.station)}</div><div class="wb"><div><span class="cat ${esc(a.category)}">${esc(a.category)}</span></div><div class="mid" style="margin-top:8px">${esc(wm?wm[1].trim():'')}</div><div class="sm cl2">${esc((a.metar_decoded||'').split('·').slice(2,4).join('·'))}</div></div>`},
  summary(a){return a?{t1:`${a.category} at ${a.station}`,t2:(a.metar_decoded||'').split(' · ').slice(1,4).join(' · ')}:{t1:'METAR/TAF unavailable'}},
  detail(a){if(!a)return hd('aviation','Unavailable');const CATX={VFR:'Ceiling above 3,000 ft and visibility above 5 SM',MVFR:'Ceiling 1,000–3,000 ft and/or visibility 3–5 SM',IFR:'Ceiling 500–1,000 ft and/or visibility 1–3 SM',LIFR:'Ceiling below 500 ft and/or visibility below 1 SM'};
   return hd('aviation',`${esc(a.station)} · Region of Waterloo International`)+card('Flight category',`<div style="display:flex;align-items:center;gap:10px"><span class="cat ${esc(a.category)}" style="font-size:14px;padding:4px 12px">${esc(a.category)}</span><span class="sm">${CATX[a.category]||''}</span></div>`)+
    card('METAR',`<pre>${esc(a.metar)}</pre><div class="dec">${esc(a.metar_decoded)}</div>`)+card('TAF',`<pre>${esc(a.taf)}</pre><div class="dec">${esc(a.taf_decoded)}</div>`)+
    (a.note?card('Briefing note',`<div class="note">${esc(a.note)}</div>`):'')+
    card('Categories',Object.entries(CATX).map(([k,v])=>`<div class="li"><span class="cat ${k}">${k}</span> <span class="sm">${v}</span></div>`).join(''))+
    `<a class="link" href="https://flightplanning.navcanada.ca/" target="_blank" rel="noopener">NAV CANADA flight planning ›</a>`}},
 work:{name:'Work',ico:'🧰',c:'#f59e0b',
  widget(m){const on=m.shifts.filter(s=>s.start),off=m.shifts.filter(s=>!s.start);return `<div class="wl">🧰 Work today<span class="tag muted">${m.count} shifts this week</span></div><div class="wb">${on.map(s=>`<div class="mid">${esc(s.employer)} <span style="color:var(--chartright)">${s.start}–${s.end}</span></div>`).join('')||'<div class="mid">No shifts today</div>'}<div class="sm cl1">${off.map(s=>'No '+esc(s.employer)+' shift').join(' · ')}${m.upcoming.find(u=>u.d>MODEL.get('schedule').day0)?` · Next: ${(u=>`${TYPEN[u.type]} ${dlab(u.d)} ${m2t(u.a)}`)(m.upcoming.find(u=>u.d>MODEL.get('schedule').day0))}`:''}</div></div>`},
  summary(m){const on=m.shifts.filter(s=>s.start);return {t1:on.length?on.map(s=>`${s.employer} ${s.start}–${s.end}`).join(' · '):'No shifts today',t2:(m.overlap?'⚠ Shift overlap · ':'')+m.shifts.filter(s=>!s.start).map(s=>`No ${s.employer} shift`).join(' · ')+(m.movements.length?` · ${m.movements.length} movements`:'')}},
  detail(m){const sc=MODEL.get('schedule');return hd('work',`${m.count} shifts · ${hrs(m.hours)} over the next 7 days`)+
   card("Today's shifts",m.shifts.map(s=>`<div class="li"><div class="k">${esc(s.employer)}</div><div class="mid" style="color:${s.start?'var(--chartright)':'var(--muted)'}">${s.start?`${s.start}–${s.end}`:'No shift today'}</div><div class="sm">${esc(s.detail)}</div></div>`).join(''),m.overlap?'⚠ Overlap':'')+
   card('Aircraft movements · FlightBridge',m.movements.length?m.movements.map(v=>`<div class="li"><span class="mono">${esc(v.time)}</span> <b>${esc(v.tail)}</b> ${esc(v.type)} · ${esc(v.dir)} <div class="sm">${esc(v.parking)} · ${esc(v.services)}</div></div>`).join(''):`<div class="sm">${m.shifts.some(s=>s.employer==='Chartright'&&s.start)?'No movements during your shift':'Not a Chartright day, so no movements to check'}</div>`)+
   card('Upcoming shifts',m.upcoming.map(u=>`<div class="ev" style="--ec:var(--${u.type})"><b>${ddow(u.d)} ${new Date(u.d*864e5).getUTCDate()} ${m2t(u.a)}</b><span>${TYPEN[u.type]} · ${u.range}${u.notes?` <span class="muted">· ${esc(u.notes)}</span>`:''}</span></div>`).join('')||'<div class="sm">None in the next 7 days</div>','from Schedule')+
   (sc.flags.length?card('⚠ Rest before shifts',sc.flags.map(f=>`<div class="li sm">${esc(f)}</div>`).join(''),'from Schedule'):'')}},
 day:{name:'Day',ico:'📋',c:'#c084fc',
  widget(m){return `<div class="wl">📋 Day</div><div class="wb"><div class="sm cl3" style="color:var(--text);font-weight:600">🎯 ${esc(m.focus)}</div><div class="sm" style="margin-top:6px">${m.tasks.length} open tasks</div></div>`},
  summary(m){return {cls:'focus',t1:'🎯 '+m.focus,t2:`${m.tasks.length} open tasks`+(m.workout?` · ${m.workout.group} ${m.workout.time}`:'')}},
  detail(m){return hd('day',esc(STORE.briefing.date_label))+card("Today's focus",`<div class="mid" style="font-size:18px">${esc(m.focus)}</div><p class="sm" style="margin-top:8px">${esc(m.greeting)}</p>`)+
   (m.workout?card('Workout',`<div class="mid">${esc(m.workout.group)}</div><div class="sm">${esc(m.workout.time)} · ${esc(m.workout.label)}</div>`):card('Workout','<div class="sm">Rest day</div>'))+
   card("Today's calendar",m.cal?`<img src="${m.cal}" alt="Today's calendar" style="width:100%;border-radius:12px">`:'<div class="sm">Calendar image appears with the live briefing.</div>'+xlink('schedule','Open today\u2019s schedule'))+
   card(`Open tasks (${m.tasks.length})`,m.tasks.map(t=>`<div class="li">☐ ${esc(t)}</div>`).join('')||'<div class="sm">All caught up</div>')+
   `<p class="sm">${esc(m.generated)}</p>`}},
 reminders:{name:'Reminders',ico:'⏰',c:'#fb7185',
  widget(m){const n=m.items[0];return `<div class="wl">⏰ Reminders</div><div class="wb">${n?`<div class="mid" style="color:var(--sc)">${esc(n.days===0?'Today':n.days===1?'Tomorrow':n.when)}</div><div class="sm cl3" style="color:var(--text)">${esc(n.text)}</div>`:'<div class="sm">Nothing due</div>'}<div class="sm" style="margin-top:4px">${m.items.length} upcoming</div></div>`},
  summary(m){const n=m.items[0];return {t1:n?`${n.days===1?'Tomorrow':n.when}: ${n.text}`:'No reminders',t2:m.status||`${m.items.length} upcoming`}},
  detail(m){const grp={};m.items.forEach(i=>{const g=i.days==null?'Later':i.days<=1?'Next 24 h':i.days<=7?'This week':'Later';(grp[g]=grp[g]||[]).push(i)});
   return hd('reminders',esc(m.status||'Upcoming'))+Object.entries(grp).map(([g,xs])=>card(g,xs.map(i=>`<div class="li"><div class="k" style="color:var(--sc)">${esc(i.when)}${i.days!=null?` · in ${i.days} day${i.days===1?'':'s'}`:''}${i.flag?` · ${esc(i.flag)}`:''}</div>${esc(i.text)}</div>`).join(''))).join('')+
   '<p class="sm">From the reminders in today\u2019s public briefing. Money items are left out.</p>'}},
 inbox:{name:'Inbox',ico:'✉️',c:'#60a5fa',
  widget(m){const h=m.highlights[0];return `<div class="wl">✉️ Inbox</div><div class="wb">${h?`<div class="sm" style="color:var(--text);font-weight:700">${esc(h.from)}</div><div class="sm cl3">${esc(h.text)}</div>`:'<div class="sm">Nothing new</div>'}<div class="sm" style="margin-top:4px">${m.highlights.length} highlights</div></div>`},
  summary(m){const h=m.highlights[0];return {t1:h?`${h.from}: ${h.text}`:'No inbox highlights',t2:`${m.highlights.length} highlights from your assistants`}},
  detail(m){return hd('inbox','Highlights and recent mail')+card('Highlights',m.highlights.map(h=>`<div class="li"><div class="k" style="color:var(--sc)">${esc(h.from)}</div>${esc(h.text)}</div>`).join('')||'<div class="sm">Nothing new</div>','from the public briefing')+
   card('Recent threads',m.sample.map(s=>`<div class="li"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(s.from)}</b><span class="sm">${esc(s.when)}</span></div>${esc(s.subj)}<div class="sm">${esc(s.label)}</div></div>`).join(''),'<span class="sample">SAMPLE DATA</span>')+
   '<p class="sm">The full inbox summary isn\u2019t published publicly, so the thread list above is clearly labelled sample data.</p>'}},
 more:{name:'More',ico:'✨',c:'#f472b6',
  widget(m){const g=m.sixers,p=m.prospects[0];return `<div class="wl">✨ More</div><div class="wb">${g?`<div class="sm" style="color:var(--text);font-weight:700">🏀 ${g.home_away==='home'?'vs':'@'} ${esc(g.opponent.split(' ').pop())}</div><div class="sm">${esc(g.date_label)} · ${esc(g.tipoff)}</div>`:''}${p?`<div class="sm cl2" style="margin-top:6px;color:var(--text)">🧑‍✈️ ${esc(p.company)}</div>`:''}</div>`},
  summary(m){const g=m.sixers;return {t1:g?`76ers ${g.home_away==='home'?'vs':'@'} ${g.opponent} · ${g.date_label} ${g.tipoff}`:'No game info',t2:`${m.prospects.length} pilot prospects · ${m.archive.length} days in the archive`}},
  detail(m){const g=m.sixers;return hd('more','Prospects, the Sixers and the archive')+
   card('Next 76ers game',g?`<div class="mid">${g.home_away==='home'?'vs':'@'} ${esc(g.opponent)} <span class="chip">${g.home_away.toUpperCase()}</span></div><div class="sm" style="margin-top:4px">${esc(g.date_label)} · ${esc(g.tipoff)}</div><div class="sm">📍 ${esc(g.venue)}</div><div class="sm">📺 ${esc(g.tv)}</div>`:'<div class="sm">Not available yet</div>',g&&g.game_day?'🏀 GAME DAY':'')+
   card('Top pilot prospects',m.prospects.map(p=>`<div class="li"><div class="k">#${p.rank}${p.isNew?' · NEW':''}</div><b>${esc(p.title)}</b><div class="sm" style="color:var(--accent2)">${esc(p.company)} · ${esc(p.location)}</div><div class="sm">${esc(p.minimums)}</div>${p.link?`<a href="${esc(p.link)}" target="_blank" rel="noopener" class="sm">Open posting ›</a>`:''}</div>`).join('')||'<div class="sm">Waiting on the pilot jobs list</div>')+
   card('Briefing archive',m.archive.map(a=>`<a class="li" style="display:block;color:inherit" href="../days/${esc(a.date)}.html"><b>${esc(a.label)}</b><div class="sm cl2">${esc(a.focus)}</div></a>`).join(''))}}
};
const SECK=k=>k==='week'?'schedule':k;

/* ---------------- colourways ---------------- */
const THEMES={
 midnight:['Midnight','Dark',{bg:'#070b14',bg2:'#0d1526',card:'#111a2e',card2:'#0b1222',text:'#eef2f8',muted:'#8a97ab',line:'rgba(255,255,255,.08)',accent:'#38bdf8',accent2:'#fbbf24',glass:'rgba(17,26,46,.62)'}],
 runway:['Runway','Dark',{bg:'#0c0a09',bg2:'#1c1917',card:'#1c1917',card2:'#141210',text:'#fafaf9',muted:'#a8a29e',line:'rgba(255,255,255,.08)',accent:'#f59e0b',accent2:'#38bdf8',glass:'rgba(28,25,23,.62)'}],
 aurora:['Aurora','Dark',{bg:'#06110f',bg2:'#0b1d1a',card:'#0f2420',card2:'#0a1916',text:'#ecfdf5',muted:'#86a39c',line:'rgba(255,255,255,.08)',accent:'#2dd4bf',accent2:'#a78bfa',glass:'rgba(15,36,32,.62)'}],
 cockpit:['Cockpit','Dark',{bg:'#000000',bg2:'#0a0a0a',card:'#111111',card2:'#070707',text:'#f5f5f5',muted:'#8f8f8f',line:'rgba(255,255,255,.1)',accent:'#4ade80',accent2:'#f472b6',glass:'rgba(20,20,20,.65)'}],
 daylight:['Daylight','Light',{bg:'#eef3f9',bg2:'#ffffff',card:'#ffffff',card2:'#f3f6fb',text:'#0f172a',muted:'#5b6b82',line:'rgba(15,23,42,.09)',accent:'#0284c7',accent2:'#d97706',glass:'rgba(255,255,255,.62)'}],
 paper:['Paper','Light',{bg:'#f6f1e7',bg2:'#fffaf0',card:'#fffdf8',card2:'#f3ecdf',text:'#2a2118',muted:'#7a6b58',line:'rgba(42,33,24,.1)',accent:'#b45309',accent2:'#0f766e',glass:'rgba(255,253,248,.65)'}]};
let THEME=localStorage.getItem('dbw:theme')||'midnight';if(!THEMES[THEME])THEME='midnight';
function applyTheme(){const t=THEMES[THEME][2],r=document.documentElement.style;Object.entries(t).forEach(([k,v])=>r.setProperty('--'+k,v));
 const light=THEMES[THEME][1]==='Light';r.setProperty('--sleep',light?'#6366f1':'#818cf8');const mt=document.querySelector('meta[name=theme-color]');if(mt)mt.content=t.bg}
const settingsHTML=()=>`<div class="hd" style="--sc:var(--accent)"><div class="ico">⚙️</div><div><h2>Settings</h2><p>Colourways and data sources</p></div></div>`+
 card('Colourway',`<div class="cws">${Object.entries(THEMES).map(([k,[n,mode,t]])=>`<button class="cw${k===THEME?' on':''}" data-theme="${k}"><div class="sw" style="background:${t.bg}"><i style="left:8px;background:${t.accent}"></i><i style="left:30px;background:${t.accent2}"></i><i style="left:52px;background:${t.card}"></i></div><b>${n}</b><span>${mode}</span></button>`).join('')}</div>`)+
 card('Data sources',`<div class="li"><div class="k">Briefing · weather, aviation, work, day, reminders, inbox highlights, more</div>${esc(STORE.meta.briefing)} · ${esc(STORE.briefing.generated)}</div><div class="li"><div class="k">Schedule · today and week</div>${esc(STORE.meta.schedule)}</div><div class="li"><div class="k">Inbox thread list</div><span class="sample">SAMPLE DATA</span></div>`)+
 card('Gestures',`<div class="li">Swipe left and right between pages</div><div class="li">Tap any widget or briefing line to open its section</div><div class="li">Swipe up from the bottom bar to close</div>`)+
 '<p class="sm">No money or financial information is shown in this app. Times are Ontario (America/Toronto), 24 h.</p>';

/* ---------------- springboard ---------------- */
const SB={cur:+(sessionStorage.getItem('dbw:pg')||0),n:3};
const PAGES=[{name:'Briefing'},{name:'Today',w:[['schedule','today','c2 r2'],['weather','','',],['aviation',''],['work','','c2']]},{name:'Plan',w:[['week','week','c2 r2'],['day',''],['reminders',''],['inbox',''],['more','']]}];
const DOCK=[['schedule','today','Today','🗓️','linear-gradient(160deg,#38bdf8,#1d4ed8)'],['week','week','Week','📆','linear-gradient(160deg,#a78bfa,#6d28d9)'],['inbox','','Inbox','✉️','linear-gradient(160deg,#60a5fa,#2563eb)'],['settings','','Settings','⚙️','linear-gradient(160deg,#c8ccd2,#6b7280)']];
const BRIEF=[['day','','summary'],['weather','','summary'],['aviation','','summary'],['work','','summary'],['reminders','','summary'],['inbox','','summary'],['more','','summary']];
function briefingHTML(){const B=STORE.briefing,live=B.source==='live';
 return `<header class="top"><div style="min-width:0"><div class="kick">✈ Daily Briefing</div><h1>${esc(B.date_label.replace(/, \d{4}$/,''))}</h1><div class="sub cl2">${esc(B.greeting)}</div></div><span class="live${live?'':' snap'}">${live?'● LIVE':'SNAPSHOT'}</span></header>
 <div class="roll">${(()=>{const S=SEC.schedule,m=MODEL.get('schedule'),r=S.summary(m),w=S.weekSummary(m);
  return `<div class="ri hero" style="--sc:${S.c}"><button class="hz" data-open="schedule" data-view="today" aria-label="Schedule today: ${esc(r.t1)}"><div style="display:flex;gap:10px;align-items:center"><span class="ico">${S.ico}</span><span class="tx"><div class="src">from Schedule · Today</div><div class="t1 cl1">${esc(r.t1)}</div></span></div>${r.html}</button>
  <button class="hz wk" data-open="schedule" data-view="week" aria-label="Schedule week: ${esc(w.t1)}"><span class="tx"><div class="src">from Schedule · Week</div><div class="t1 cl1">${esc(w.t1)}</div><div class="t2 cl1">${esc(w.t2)}</div></span><span class="chev">›</span></button></div>`})()}
 ${BRIEF.map(([k,view,fn])=>{const S=SEC[k],r=S[fn](MODEL.get(k));
  return `<button class="ri ${r.cls||''}" style="--sc:${S.c}" data-open="${k}" data-view="${view}" aria-label="${esc(S.name)}: ${esc(r.t1)}"><span class="ico">${r.ico||S.ico}</span><span class="tx"><div class="src">from ${S.name}</div><div class="t1 cl1">${esc(r.t1)}</div>${r.t2?`<div class="t2 cl1">${esc(r.t2)}</div>`:''}</span><span class="chev">›</span></button>`}).join('')}</div>`}
function pageHTML(p,i){if(i===0)return briefingHTML();
 return `<header class="top"><div><div class="kick">${i===1?'Today':'Plan ahead'}</div><h1>${i===1?'Sections':'Week & more'}</h1></div></header><div class="wgrid">${p.w.map(([k,view,cls])=>{const s=SECK(k);return `<button class="w ${cls||''}" style="--sc:${SEC[s].c}" data-open="${s}" data-view="${view}" aria-label="Open ${SEC[s].name}">${SEC[s].widget(MODEL.get(s),view)}</button>`}).join('')}</div>`}
function render(){applyTheme();
 $('#app').innerHTML=`<div class="sb" id="sb"><div class="track" id="track">${PAGES.map((p,i)=>`<section class="page" data-pi="${i}">${pageHTML(p,i)}</section>`).join('')}</div></div>
 <div class="dockwrap"><div class="pdots">${PAGES.map((p,i)=>`<button data-pg="${i}" aria-label="${p.name}" class="${i===SB.cur?'on':''}"><i></i></button>`).join('')}</div><nav class="dock" aria-label="Apps">${DOCK.map(([k,v,n,ic,bg])=>`<button data-app="${k}" data-view="${v}" aria-label="${n}"><span class="aico" style="background:${bg}">${ic}</span><span>${n}</span></button>`).join('')}</nav></div>`;
 setPage(SB.cur,false);bindSB();if(OV)drawOV()}
const VW=()=>innerWidth,VH=()=>innerHeight;
function setPage(i,anim=true){if(!$('#track'))return;SB.cur=Math.max(0,Math.min(PAGES.length-1,i));sessionStorage.setItem('dbw:pg',SB.cur);const t=$('#track');t.style.transition=anim?'transform .45s cubic-bezier(.2,.9,.25,1)':'none';t.style.transform=`translate3d(${-SB.cur*VW()}px,0,0)`;$$('.pdots button').forEach((d,j)=>d.classList.toggle('on',j===SB.cur))}
function bindSB(){const sb=$('#sb'),track=$('#track');let st=null,moved=false;
 sb.addEventListener('pointerdown',e=>{st={x:e.clientX,y:e.clientY,t:Date.now(),drag:false};moved=false});
 sb.addEventListener('pointermove',e=>{if(!st)return;const dx=e.clientX-st.x,dy=e.clientY-st.y;if(!st.drag&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)){st.drag=true;try{sb.setPointerCapture(e.pointerId)}catch(_){}}
  if(st.drag){moved=true;let x=-SB.cur*VW()+dx;if((SB.cur===0&&dx>0)||(SB.cur===PAGES.length-1&&dx<0))x=-SB.cur*VW()+dx*.3;track.style.transition='none';track.style.transform=`translate3d(${x}px,0,0)`}});
 const end=e=>{if(!st)return;const dx=e.clientX-st.x,v=dx/Math.max(1,Date.now()-st.t);if(st.drag){if(dx<-VW()*.18||v<-.45)setPage(SB.cur+1);else if(dx>VW()*.18||v>.45)setPage(SB.cur-1);else setPage(SB.cur)}st=null};
 sb.addEventListener('pointerup',end);sb.addEventListener('pointercancel',end);
 sb.addEventListener('click',e=>{if(moved){moved=false;return}const b=e.target.closest('[data-open]');if(b)openOV({sec:b.dataset.open,view:b.dataset.view||''},b)});
 $$('.pdots [data-pg]').forEach(b=>b.onclick=()=>setPage(+b.dataset.pg));
 $$('.dock [data-app]').forEach(b=>b.onclick=()=>openOV({sec:SECK(b.dataset.app),view:b.dataset.view||''},b.querySelector('.aico')));
 sb.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)&&Math.abs(e.deltaX)>30&&!SB.wl){SB.wl=1;setPage(SB.cur+(e.deltaX>0?1:-1));setTimeout(()=>SB.wl=0,500)}},{passive:true})}
addEventListener('resize',()=>{clearTimeout(SB.rz);SB.rz=setTimeout(()=>setPage(SB.cur,false),100)});
document.addEventListener('keydown',e=>{const wp=$('.wkpop');if(e.key==='Escape'&&wp)return wp.remove();if(e.key==='Escape'&&OV)return closeOV();if(OV)return;if(e.key==='ArrowRight')setPage(SB.cur+1);if(e.key==='ArrowLeft')setPage(SB.cur-1)});

/* ---------------- zoom-open detail + swipe up to close ---------------- */
let OV=null;
const rectFT=r=>`translate(${r.left}px,${r.top}px) scale(${r.width/VW()},${r.height/VH()})`;
function ovBody(){return OV.sec==='settings'?settingsHTML():SEC[OV.sec].detail(MODEL.get(OV.sec),OV.view)}
function ovTitle(){return OV.sec==='settings'?'Settings':OV.sec==='schedule'?(OV.view==='week'?'Week':'Today'):SEC[OV.sec].name}
function drawOV(){let el=$('#ov');if(!el){el=document.createElement('div');el.id='ov';el.className='ov';document.body.appendChild(el)}
 const sc=OV.sec==='settings'?'var(--accent)':SEC[OV.sec].c;el.style.setProperty('--sc',sc);
 el.innerHTML=`<div class="ovh"><button class="back" data-close aria-label="Back to home">‹ Home</button><b>${esc(ovTitle())}</b></div><div class="ovb">${ovBody()}</div><div class="homebar" role="button" tabindex="0" aria-label="Swipe up to go home"><i></i></div>`;bindOV(el)}
function openOV(state,src){OV=state;OV.src=src;drawOV();const el=$('#ov'),r=src?src.getBoundingClientRect():{left:VW()*.3,top:VH()*.35,width:VW()*.4,height:VH()*.3};
 el.style.transition='none';el.style.transform=rectFT(r);el.style.borderRadius='60px';el.style.opacity='.5';el.offsetWidth;
 el.style.transition='transform .42s cubic-bezier(.2,.9,.25,1),border-radius .42s,opacity .2s';el.style.transform='none';el.style.borderRadius='0';el.style.opacity='1';document.body.classList.add('ovopen')}
function closeOV(){const el=$('#ov');if(!el){OV=null;return}const src=OV.src&&document.contains(OV.src)?OV.src:null,r=src?src.getBoundingClientRect():{left:VW()*.3,top:VH()*.35,width:VW()*.4,height:VH()*.3};
 el.style.transition='transform .36s cubic-bezier(.3,.7,.3,1),border-radius .36s,opacity .36s';el.style.transform=rectFT(r);el.style.borderRadius='60px';el.style.opacity='0';
 OV=null;document.body.classList.remove('ovopen');setTimeout(()=>{if(!OV)el.remove()},380)}
function bindOV(el){
 el.querySelector('[data-close]').onclick=closeOV;
 el.querySelectorAll('.wg [data-wkb]').forEach(b=>{b.onclick=()=>wkPop(+b.dataset.wkb,el);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();wkPop(+b.dataset.wkb,el)}}});
 el.querySelectorAll('.ovb [data-view]').forEach(b=>b.onclick=()=>{OV.view=b.dataset.view;drawOV()});
 el.querySelectorAll('.ovb [data-open]').forEach(b=>b.onclick=()=>{OV.sec=b.dataset.open;OV.view=b.dataset.view||'';drawOV()});
 el.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>{THEME=b.dataset.theme;localStorage.setItem('dbw:theme',THEME);render()});
 const hb=el.querySelector('.homebar');let st=null;hb.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')closeOV()};
 hb.addEventListener('pointerdown',e=>{e.preventDefault();st={x:e.clientX,y:e.clientY,hist:[[e.clientY,Date.now()]],p:0};el.classList.add('dragging');try{hb.setPointerCapture(e.pointerId)}catch(_){}});
 hb.addEventListener('pointermove',e=>{if(!st)return;const dx=e.clientX-st.x,dy=e.clientY-st.y,W=VW(),H=VH();st.hist.push([e.clientY,Date.now()]);if(st.hist.length>6)st.hist.shift();
  const up=Math.max(0,-dy),p=up/H,s=Math.max(.35,1-p*1.1),tx=W*(1-s)/2+dx*.35*s,ty=H-up-H*s;st.p=p;el.style.transition='none';el.style.transform=`translate(${tx}px,${ty}px) scale(${s})`;el.style.borderRadius=Math.min(44,8+p*160)+'px'});
 const end=()=>{if(!st)return;const p=st.p,h=st.hist,a=h[0],z=h[h.length-1],vy=z[1]>a[1]?(a[0]-z[0])/(z[1]-a[1]):0;st=null;el.classList.remove('dragging');
  if(p>.15||(vy>.5&&p>.04))closeOV();else{el.style.transition='transform .38s cubic-bezier(.2,1.25,.4,1),border-radius .38s';el.style.transform='none';el.style.borderRadius='0'}};
 hb.addEventListener('pointerup',end);hb.addEventListener('pointercancel',end)}

/* ---------------- boot ---------------- */
load().then(()=>{render();const q=new URLSearchParams(location.search);if(q.get('open')){const s=SECK(q.get('open'));if(SEC[s]||s==='settings'){OV={sec:s,view:q.get('view')||(q.get('open')==='week'?'week':'')};drawOV();document.body.classList.add('ovopen')}}
 setInterval(()=>{if(!OV){MODEL.cache={};render()}},60000)}).catch(e=>{console.error(e);$('#app').innerHTML='<div class="boot">Couldn\u2019t load the briefing.</div>'});
window.__DBW={STORE,MODEL,SEC};
})();
