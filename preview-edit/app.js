/* MyAssistant · daily briefing + schedule, widget home (preview) · calendar-edit: tap to change, hold-drag to move, ＋ to add
   Architecture: ONE shared STORE (briefing slice + schedule slice). Each SECTION reads its slice and owns
   widget(), summary() and detail(). The Briefing page is built only from section summaries. */
(()=>{
'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let TZ='America/Toronto';
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

/* ---------------- schedule edits: an override layer over the calendar feed (calendar-edit) ----------------
   SAME RULES as /workspace/fullapp-shared/schedule-edits/schedule_edits.py (Cal's nightly apply). Change both together.
   - Edit key = source id + '@' + occurrence date (+ '#n' if the same id repeats on one date).
     Source id = the feed's uid (+ '/' + recurrenceId) when it has one, else 'h' + FNV-1a(type|label|start).
     (Cal's ids e1, e2… are positions in the file, so they can't be used: they shift whenever an event is added.)
   - Ops: move {key,covers,src,date,start,dur} · delete {key,covers,src} · add {id,key:'add:'+id,date,start,dur,label,type}.
     covers = the other pieces of an overnight block (the feed splits at midnight), hidden along with the head.
   - An edit whose source event is gone (or whose start/title/type changed, which changes the key) is an orphan: not applied,
     flagged in "Your changes". Edits dated outside the feed's date range are just skipped (old days drop off the feed).
   - A schedule that already had edits applied (Cal's apply step) carries editsApplied.rawEvents; unapply() restores it first. */
const fnv=s=>{let h=0x811c9dc5;for(const b of new TextEncoder().encode(s)){h^=b;h=Math.imul(h,0x01000193)>>>0}return h.toString(36)};
const srcId=e=>e.uid?String(e.uid)+(e.recurrenceId?'/'+e.recurrenceId:''):'h'+fnv([e.type||'',e.label||'',e.start||''].join('|'));
function keyed(evs){const seen={};return (evs||[]).map(e=>{let k=srcId(e)+'@'+e.date;seen[k]=(seen[k]||0)+1;if(seen[k]>1)k+='#'+seen[k];return Object.assign({},e,{k})})}
function unapply(S){if(!S||!S.editsApplied||!Array.isArray(S.editsApplied.rawEvents))return S;const o=Object.assign({},S,{events:S.editsApplied.rawEvents});delete o.editsApplied;return o}
const segsOf=(date,start,dur)=>{const s=t2m(start),z=s+dur;return z<=1440?[{date,start,end:z===1440?'24:00':m2t(z)}]:[{date,start,end:'24:00'},{date:diso(dnum(date)+1),start:'00:00',end:z-1440>=1440?'24:00':m2t(z-1440)}]};
const endAt=(start,dur)=>{const z=t2m(start)+dur;return z%1440===0&&z>0?'24:00':m2t(z)};
const EDIT_KEEP_DAYS=30;
function applyEdits(evs,edits){const K=keyed(evs),by=new Map(K.map(e=>[e.k,e])),hide=new Set(),out=[],orphans=[],changed=[];
 const ds=K.map(e=>e.date).sort(),lo=ds[0],hi=ds[ds.length-1];
 for(const x of edits||[]){if(!x||!x.op)continue;
  if(x.op==='add'){if(x.date&&x.start&&x.dur>0)segsOf(x.date,x.start,x.dur).forEach(g=>out.push(Object.assign({type:x.type||'event',label:x.label||'Event',notes:x.notes||''},g,{k:x.key,edit:{op:'add',key:x.key}})));continue}
  const h=by.get(x.key);
  if(!h){const sd=((x.src&&x.src.date)||String(x.key).split('@')[1]||'').slice(0,10);if(lo&&sd>=lo&&sd<=hi)orphans.push(x);continue}
  if(x.src&&x.src.end&&h.end!==x.src.end)changed.push(x);
  hide.add(x.key);(x.covers||[]).forEach(c=>hide.add(c));
  if(x.op==='move'&&x.date&&x.start&&x.dur>0)segsOf(x.date,x.start,x.dur).forEach(g=>out.push(Object.assign({},h,g,{k:x.key,edit:{op:'move',key:x.key}})))}
 return {events:K.filter(e=>!hide.has(e.k)).concat(out),orphans,changed}}

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
 // Owner fallback ONLY (CONFIG.PUBLIC_FALLBACK): the public briefing Sunny publishes, else the bundled snapshot.
 if(!CONFIG.PUBLIC_FALLBACK)throw Error('public fallback is off');
 try{const r=await fetch('../index.html',{cache:'no-store'});if(!r.ok)throw 0;STORE.briefing=parseBriefingHTML(await r.text());STORE.meta.briefing='Live: public briefing'}
 catch(e){STORE.briefing=await getJSON('data/briefing.json');STORE.meta.briefing='Snapshot: '+STORE.briefing.date}
 const B=STORE.briefing;B.tasks=noFin(B.tasks);B.noteworthy=noFin(B.noteworthy);
 // Schedule slice: Cal's combined schedule (public schedule.json), else bundled snapshot.
 try{STORE.schedule=await getJSON('/schedule/data/schedule.json');STORE.meta.schedule='Live: Cal\u2019s combined schedule'}
 catch(e){STORE.schedule=await getJSON('data/schedule.json');STORE.meta.schedule='Snapshot'}
 STORE.meta.scheduleUpdated=STORE.schedule.updated;STORE.baseSchedule=unapply(STORE.schedule);
 try{STORE.archive=(await getJSON('../days/index.json')).days}catch(e){STORE.archive=[{date:B.date,label:B.date_label,focus:B.focus}]}
 rebuildSchedule()}

/* ---------------- per-section models (memoised from the store) ---------------- */
const MODEL={cache:{},get(k){return this.cache[k]||(this.cache[k]=BUILD[k]())}};
const WORK=new Set(['chartright','ea','work']),TYPEN={sleep:'Sleep',chartright:'Chartright',ea:'EA',workout:'Workout',guelph:'Guelph',event:'Event',work:'Work'};
const BUILD={
 schedule(){const S=STORE.schedule,B=STORE.briefing,day0=dnum(B.date),now=nowTor();
  const segs=S.events.map(e=>({d:dnum(e.date),s:t2m(e.start),e:t2m(e.end),type:e.type,label:e.label,notes:e.notes||'',split:e.split,k:e.k,ed:e.edit?e.edit.op:''})).sort((a,b)=>a.d-b.d||a.s-b.s);
  // merge overnight continuations into spans (absolute minutes)
  const spans=[];for(const x of segs){const a=x.d*1440+x.s,z=x.d*1440+x.e,p=spans.find(q=>q.type===x.type&&q.z===a&&(x.s===0));
   if(p){p.z=z;p.keys.push(x.k);if(x.ed&&!p.ed)p.ed=x.ed;if(x.notes&&!p.notes.includes(x.notes))p.notes=(p.notes?p.notes+' · ':'')+x.notes}else spans.push({a,z,type:x.type,label:x.label,notes:x.notes,split:x.split,keys:[x.k],ed:x.ed})}
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
 reminders(){if(isUser())return userRemindersModel();const B=STORE.briefing,yr=+B.date.slice(0,4),d0=dnum(B.date);let status='';const items=[];
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
 const id=WKB.push({s,d})-1,lab=`${TYPEN[ty]}${s.label&&s.label!==TYPEN[ty]?' '+s.label:''}, ${dlab(Math.floor(s.a/1440))} ${m2t(s.a)} to ${endT(s.z)}${s.ed?', edited':''}. Tap to change, hold and drag to move`;
 return `<i role="button" tabindex="0" data-wkb="${id}" aria-label="${esc(lab)}" class="${sl?'sl':''}${px<13?' tiny':''}${s.ed?' ed':''}" style="top:${s.cs/60*H}px;height:${Math.max(3,px)}px;background:var(--${ty})">${L.map(x=>Array.isArray(x)?`<em class="${x[1]}">${x[1]?esc(x[0]).replace('Chartright','Chart&shy;right').replace('Workout','Work&shy;out'):esc(x[0])}</em>`:`<span>${esc(x)}</span>`).join('')}</i>`}
/* tapping a block opens evSheet() (calendar editing, below) */
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
  weekSummary(m){return {t1:`This week: ${m.wk.shifts} shifts (${hrs(m.wk.work)}), ${m.wk.workouts} workouts`,t2:`${m.wk.sleepAvg?`Avg sleep ${hrs(m.wk.sleepAvg)} a day`:isUser()?'Tap to see and edit your week':''}${m.flags.length?` · ⚠ ${m.flags.length} short-sleep night${m.flags.length>1?'s':''}`:''}`}},
  detail(m){const H=22;WKB.length=0;const reg=(s,d)=>WKB.push({s,d})-1;
   const src=isUser()?userEventsCard()+`<p class="sm" style="margin-top:6px">Times are ${esc(TZ)}, 24 h.</p>`:MODE.qa?`<p class="sm" style="margin-top:6px">QA demo: a sample schedule. Edits stay in this browser tab. Times are 24 h.</p>`:`<p class="sm" style="margin-top:6px">Source: Cal\u2019s combined schedule (${esc(STORE.meta.schedule)}, updated ${esc((m.updated||'').replace('T',' ').slice(0,16))} UTC), with your changes on top. Times are Ontario, 24 h.</p>`;
   return hd('schedule',`${dlab(m.day0)} – ${dlab(m.day0+6)}${m.live?` · now ${m2t(m.now.min)}`:''}`)+`<div class="stat3"><div><b>${m.wk.shifts}</b><span>Shifts</span></div><div><b>${hrs(m.wk.work)}</b><span>Work</span></div><div><b>${m.wk.workouts}</b><span>Workouts</span></div></div>`+
    card('Week view',`<div class="wg" style="--hh:${H}px" data-hh="${H}"><div></div>${m.week.map((w,i)=>`<div class="h${i===0?' today':''}">${ddow(w.d)}<br>${new Date(w.d*864e5).getUTCDate()}</div>`).join('')}
     <div class="ax" style="height:${24*H}px">${[0,3,6,9,12,15,18,21,24].map(h=>`<span class="${h===0?'f':h===24?'l':''}" style="top:${h*H}px">${String(h).padStart(2,'0')}:00</span>`).join('')}</div>
     ${m.week.map((w,i)=>`<div class="col${i===0?' today':''}" data-d="${w.d}" style="height:${24*H}px">${w.segs.map(s=>wkBlk(s,w.d,H)).join('')}${m.live&&w.d===m.day0?`<span class="nowk" style="top:${m.now.min/60*H}px" aria-hidden="true"></span>`:''}</div>`).join('')}</div>
     <p class="sm wkhint">Tap a block to change or delete it. Hold a block, then drag to move it (15 min steps). ↑ continues from the day before · ↓ continues past midnight.</p>
     <div class="legend">${Object.keys(TYPEN).map(t=>`<span style="--ec:var(--${t})">${TYPEN[t]}</span>`).join('')}</div>`)+
    changesCard()+
    (m.flags.length?card('⚠ Sleep flags',m.flags.map(f=>`<div class="li">${esc(f)}</div>`).join('')):'')+
    card('Day by day',m.week.map((w,i)=>`<div class="dayrow${i===0?' today':''}"><h4>${dlab(w.d)}${i===0?' · Today':''} <span class="muted" style="font-weight:400;font-size:12px">· work ${hrs(w.work)} · sleep ${hrs(w.sleep)}</span></h4>${w.starts.map(s=>`<button class="ev" data-wkb="${reg(s,w.d)}" style="--ec:var(--${s.type in TYPEN?s.type:'event'})" aria-label="Change ${esc(s.label)} ${s.range}"><b>${s.range}</b><span>${esc(s.label)}${s.ed?' <em class="edt">· edited</em>':''}${s.notes?` <span class="muted">· ${esc(s.notes)}</span>`:''}</span></button>`).join('')||'<div class="sm">Nothing scheduled</div>'}</div>`).join(''))+src}},
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
   return hd('aviation',`${esc(a.station)}${a.name?' · '+esc(a.name):isUser()?'':' · Region of Waterloo International'}`)+card('Flight category',`<div style="display:flex;align-items:center;gap:10px"><span class="cat ${esc(a.category)}" style="font-size:14px;padding:4px 12px">${esc(a.category)}</span><span class="sm">${CATX[a.category]||''}</span></div>`)+
    card('METAR',`<pre>${esc(a.metar)}</pre><div class="dec">${esc(a.metar_decoded)}</div>`)+(a.taf?card('TAF',`<pre>${esc(a.taf)}</pre><div class="dec">${esc(a.taf_decoded)}</div>`):'')+
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
   card("Today's calendar",m.cal?`<img src="${m.cal}" alt="Today's calendar" style="width:100%;border-radius:12px">`:'<div class="sm">Calendar image appears with the live briefing.</div>'+xlink('schedule','Open your week','week'))+
   card(`Open tasks (${m.tasks.length})`,m.tasks.map(t=>`<div class="li">☐ ${esc(t)}</div>`).join('')||'<div class="sm">All caught up</div>')+
   `<p class="sm">${esc(m.generated)}</p>`}},
 reminders:{name:'Reminders',ico:'⏰',c:'#fb7185',
  widget(m){const n=m.items[0];return `<div class="wl">⏰ Reminders</div><div class="wb">${n?`<div class="mid" style="color:var(--sc)">${esc(n.days===0?'Today':n.days===1?'Tomorrow':n.when)}</div><div class="sm cl3" style="color:var(--text)">${esc(n.text)}</div>`:'<div class="sm">Nothing due</div>'}<div class="sm" style="margin-top:4px">${m.items.length} upcoming</div></div>`},
  summary(m){const n=m.items[0];return {t1:n?`${n.days===1?'Tomorrow':n.when}: ${n.text}`:'No reminders',t2:m.status||`${m.items.length} upcoming`}},
  detail(m){if(isUser())return userRemindersDetail(m);const grp={};m.items.forEach(i=>{const g=i.days==null?'Later':i.days<=1?'Next 24 h':i.days<=7?'This week':'Later';(grp[g]=grp[g]||[]).push(i)});
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
const settingsHTML=()=>`<div class="hd" style="--sc:var(--accent)"><div class="ico">⚙️</div><div><h2>Settings</h2><p>Account, colourways and data sources</p></div></div>`+
 accountCard()+
 card('Colourway',`<div class="cws">${Object.entries(THEMES).map(([k,[n,mode,t]])=>`<button class="cw${k===THEME?' on':''}" data-theme="${k}"><div class="sw" style="background:${t.bg}"><i style="left:8px;background:${t.accent}"></i><i style="left:30px;background:${t.accent2}"></i><i style="left:52px;background:${t.card}"></i></div><b>${n}</b><span>${mode}</span></button>`).join('')}</div>`)+
 (isUser()?card('Your setup',`<div class="li"><div class="k">Name</div>${esc(MODE.profile.name||'—')}</div><div class="li"><div class="k">Home</div>${esc(MODE.profile.city?MODE.profile.city.label:'Not set')}</div><div class="li"><div class="k">Airport</div>${esc(MODE.profile.icao||'None')}</div><div class="li"><div class="k">Sections</div>${esc((MODE.profile.sections||[]).join(', '))}</div><button class="ubtn ghost" data-ua="resetup" style="margin-top:10px">Change setup</button>`)+card('Data sources',`<div class="li"><div class="k">Weather</div>Open-Meteo (free, no account)</div><div class="li"><div class="k">METAR</div>VATSIM METAR service</div><div class="li"><div class="k">Schedule and reminders</div>${MODE.cloud?'Saved to your account':'Saved on this device (account storage isn’t switched on yet)'}</div>`):card('Data sources',`<div class="li"><div class="k">Briefing · weather, aviation, work, day, reminders, inbox highlights, more</div>${esc(STORE.meta.briefing)} · ${esc(STORE.briefing.generated)}</div><div class="li"><div class="k">Schedule · week, with your changes</div>${esc(STORE.meta.schedule)}</div><div class="li"><div class="k">Inbox thread list</div><span class="sample">SAMPLE DATA</span></div>`))+
 card('Gestures',`<div class="li">Swipe left and right between pages</div><div class="li">Tap any widget or briefing line to open its section</div><div class="li">Swipe up from the bottom bar to close</div>`)+
 `<p class="sm">No money or financial information is shown in this app. Times are ${isUser()?esc(TZ):'Ontario (America/Toronto)'}, 24 h.</p>`;
function accountCard(){const u=MODE.user;if(!u)return '';return card('Account',`<div class="li"><div class="k">Signed in</div>${esc(u.email||u.displayName||'Account')}</div><div class="li"><div class="k">Mode</div>${MODE.kind==='owner'?(MODE.feed?'Your crew feeds (private)':'Your crew feeds (temporary public files)'):'Personal'}</div><button class="ubtn ghost" data-ua="signout" style="margin-top:10px">Sign out</button><p class="sm">Signing out also signs you out of Logbook and Pantry on this browser.</p>`)}

/* ---------------- springboard ---------------- */
const SB={cur:+(sessionStorage.getItem('dbw:pg')||0),n:3};
const PAGES=[{name:'Briefing'},{name:'Today',w:[['schedule','today','c2 r2'],['weather','','',],['aviation',''],['work','','c2']]},{name:'Plan',w:[['week','week','c2 r2'],['day',''],['reminders',''],['inbox',''],['more','']]}];
const DOCK=[['week','week','Week','📆','linear-gradient(160deg,#a78bfa,#6d28d9)'],['inbox','','Inbox','✉️','linear-gradient(160deg,#60a5fa,#2563eb)'],['settings','','Settings','⚙️','linear-gradient(160deg,#c8ccd2,#6b7280)']];
const BRIEF=[['day','','summary'],['weather','','summary'],['aviation','','summary'],['work','','summary'],['reminders','','summary'],['inbox','','summary'],['more','','summary']];
function briefingHTML(){const B=STORE.briefing,live=B.source==='live'||B.source==='user';
 return `<header class="top"><div style="min-width:0"><div class="kick">✈ MyAssistant</div><h1>${esc(B.date_label.replace(/, \d{4}$/,''))}</h1><div class="sub cl2">${esc(B.greeting)}</div></div><span class="live${live?'':' snap'}">${live?'● LIVE':'SNAPSHOT'}</span></header>
 <div class="roll">${(()=>{if(!vis('schedule'))return '';const S=SEC.schedule,m=MODEL.get('schedule'),r=S.summary(m),w=S.weekSummary(m);
  return `<div class="ri hero" style="--sc:${S.c}"><button class="hz" data-open="schedule" data-view="week" aria-label="Schedule today (opens your week): ${esc(r.t1)}"><div style="display:flex;gap:10px;align-items:center"><span class="ico">${S.ico}</span><span class="tx"><div class="src">from Schedule · Today</div><div class="t1 cl1">${esc(r.t1)}</div></span></div>${r.html}</button>
  <button class="hz wk" data-open="schedule" data-view="week" aria-label="Schedule week: ${esc(w.t1)}"><span class="tx"><div class="src">from Schedule · Week</div><div class="t1 cl1">${esc(w.t1)}</div><div class="t2 cl1">${esc(w.t2)}</div></span><span class="chev">›</span></button></div>`})()}
 ${BRIEF.map(([k,view,fn])=>{const S=SEC[k],r=S[fn](MODEL.get(k));
  return `<button class="ri ${r.cls||''}" style="--sc:${S.c}" data-open="${k}" data-view="${view}" aria-label="${esc(S.name)}: ${esc(r.t1)}"><span class="ico">${r.ico||S.ico}</span><span class="tx"><div class="src">from ${S.name}</div><div class="t1 cl1">${esc(r.t1)}</div>${r.t2?`<div class="t2 cl1">${esc(r.t2)}</div>`:''}</span><span class="chev">›</span></button>`}).join('')}</div>`}
function pageHTML(p,i){if(i===0)return briefingHTML();
 return `<header class="top"><div><div class="kick">${i===1?'Today':'Plan ahead'}</div><h1>${i===1?'Sections':'Week & more'}</h1></div></header><div class="wgrid">${p.w.map(([k,view,cls])=>{const s=SECK(k);return `<button class="w ${cls||''}" style="--sc:${SEC[s].c}" data-open="${s}" data-view="${s==='schedule'?'week':view}" aria-label="Open ${SEC[s].name}${s==='schedule'?' week':''}">${SEC[s].widget(MODEL.get(s),view)}</button>`}).join('')}</div>`}
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
document.addEventListener('keydown',e=>{const wp=$('.usheet');if(e.key==='Escape'&&wp)return wp.remove();if(e.key==='Escape'&&OV)return closeOV();if(OV)return;if(e.key==='ArrowRight')setPage(SB.cur+1);if(e.key==='ArrowLeft')setPage(SB.cur-1)});

/* ---------------- zoom-open detail + swipe up to close ---------------- */
let OV=null;
const rectFT=r=>`translate(${r.left}px,${r.top}px) scale(${r.width/VW()},${r.height/VH()})`;
function ovBody(){return OV.sec==='settings'?settingsHTML():SEC[OV.sec].detail(MODEL.get(OV.sec),OV.view)}
function ovTitle(){return OV.sec==='settings'?'Settings':OV.sec==='schedule'?'Week':SEC[OV.sec].name}
function drawOV(){let el=$('#ov');if(!el){el=document.createElement('div');el.id='ov';el.className='ov';document.body.appendChild(el)}
 const sc=OV.sec==='settings'?'var(--accent)':SEC[OV.sec].c;el.style.setProperty('--sc',sc);
 const ob0=el.querySelector('.ovb'),keep=ob0&&el.dataset.k===OV.sec?ob0.scrollTop:0;el.dataset.k=OV.sec;
 el.innerHTML=`<div class="ovh"><button class="back" data-close aria-label="Back to home">‹ Home</button><b>${esc(ovTitle())}</b></div><div class="ovb">${ovBody()}</div>${OV.sec==='schedule'?'<button class="fab" data-add aria-label="Add event">＋</button>':''}<div class="homebar" role="button" tabindex="0" aria-label="Swipe up to go home"><i></i></div>`;if(keep)el.querySelector('.ovb').scrollTop=keep;bindOV(el)}
function openOV(state,src){OV=state;OV.src=src;const o0=$('#ov');if(o0)o0.dataset.k='';drawOV();const el=$('#ov'),r=src?src.getBoundingClientRect():{left:VW()*.3,top:VH()*.35,width:VW()*.4,height:VH()*.3};
 el.style.transition='none';el.style.transform=rectFT(r);el.style.borderRadius='60px';el.style.opacity='.5';el.offsetWidth;
 el.style.transition='transform .42s cubic-bezier(.2,.9,.25,1),border-radius .42s,opacity .2s';el.style.transform='none';el.style.borderRadius='0';el.style.opacity='1';document.body.classList.add('ovopen')}
function closeOV(){const el=$('#ov');if(!el){OV=null;return}const src=OV.src&&document.contains(OV.src)?OV.src:null,r=src?src.getBoundingClientRect():{left:VW()*.3,top:VH()*.35,width:VW()*.4,height:VH()*.3};
 el.style.transition='transform .36s cubic-bezier(.3,.7,.3,1),border-radius .36s,opacity .36s';el.style.transform=rectFT(r);el.style.borderRadius='60px';el.style.opacity='0';
 OV=null;document.body.classList.remove('ovopen');setTimeout(()=>{if(!OV)el.remove()},380)}
function bindOV(el){
 el.querySelector('[data-close]').onclick=closeOV;
 el.querySelectorAll('[data-ua]').forEach(b=>b.onclick=e=>{e.stopPropagation();userAction(b.dataset.ua,b.dataset.id,el)});
 el.querySelectorAll('.ovb [data-wkb]').forEach(b=>{b.onclick=()=>{if(Date.now()-DRAG.dropAt<450)return;const x=WKB[+b.dataset.wkb];x&&evSheet(x.s)};b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click()}}});
 const wg=el.querySelector('.wg');if(wg)bindDrag(wg,el);
 const fab=el.querySelector('[data-add]');if(fab)fab.onclick=()=>evSheet(null);
 el.querySelectorAll('[data-ereset]').forEach(b=>b.onclick=()=>resetEdit(b.dataset.ereset));
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

/* ================= accounts (w5) =================
   Sign-in is shared with Logbook v2 / Pantry (Firebase logbook-e784a, jwauth.js).
   - Jackson (owner): reads his crew feeds from Firestore briefing/{uid}/feed/* (written by the box, never by this app).
     Until the migration is done, PUBLIC_FALLBACK lets the owner keep reading the current public files.
   - Everyone else: a clean slate. Their own profile, schedule and reminders at briefing/{uid}/user/*,
     weather from Open-Meteo, METAR from VATSIM (both free, no key). Inbox, Work, Day and More stay hidden. */
const CONFIG={
 OWNER_UID:'',          // Jackson's uid once known (Firebase console > Authentication > Users)
 PUBLIC_FALLBACK:true   // SINGLE SWITCH: set to false after migration so nothing is read from the public files any more
};
const MODE={kind:null,user:null,profile:null,sched:{events:[]},rem:{items:[]},cloud:null,feed:false};
const qs=new URLSearchParams(location.search);
if(CONFIG.PUBLIC_FALLBACK&&qs.get('owner')==='1')localStorage.setItem('dbw:owner','1');
const uidK=n=>'dbw:u:'+(MODE.user?MODE.user.uid:'anon')+':'+n,upath=n=>`briefing/${MODE.user.uid}/user/${n}`;
const US={
 async get(n){let local=null;try{local=JSON.parse(localStorage.getItem(uidK(n))||'null')}catch(e){}
  if(MODE.cloud!==false){try{const d=await JWAUTH.getDoc(upath(n));MODE.cloud=true;if(d){localStorage.setItem(uidK(n),JSON.stringify(d));return d}
    if(local){try{await JWAUTH.setDoc(upath(n),local)}catch(e){}}return local}catch(e){if(JWAUTH.denied(e))MODE.cloud=false;console.warn('cloud get',n,e)}}
  return local},
 async set(n,data){data=Object.assign({},data,{updatedAt:Date.now()});localStorage.setItem(uidK(n),JSON.stringify(data));
  if(MODE.cloud!==false){try{await JWAUTH.setDoc(upath(n),data);MODE.cloud=true}catch(e){if(JWAUTH.denied(e))MODE.cloud=false;console.warn('cloud set',n,e)}}}};
const isUser=()=>MODE.kind==='user';
const uid8=()=>Math.random().toString(36).slice(2,10);
/* ---- free data sources for new users ---- */
const WMO={0:['☀️','Clear'],1:['🌤️','Mostly clear'],2:['⛅','Partly cloudy'],3:['☁️','Overcast'],45:['🌫️','Fog'],48:['🌫️','Freezing fog'],51:['🌦️','Light drizzle'],53:['🌦️','Drizzle'],55:['🌧️','Heavy drizzle'],56:['🌧️','Freezing drizzle'],57:['🌧️','Freezing drizzle'],61:['🌦️','Light rain'],63:['🌧️','Rain'],65:['🌧️','Heavy rain'],66:['🌧️','Freezing rain'],67:['🌧️','Freezing rain'],71:['🌨️','Light snow'],73:['🌨️','Snow'],75:['❄️','Heavy snow'],77:['🌨️','Snow grains'],80:['🌦️','Showers'],81:['🌧️','Showers'],82:['⛈️','Heavy showers'],85:['🌨️','Snow showers'],86:['❄️','Snow showers'],95:['⛈️','Thunderstorms'],96:['⛈️','Thunderstorms, hail'],99:['⛈️','Thunderstorms, hail']};
const CMP=d=>['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((d%360)+360)%360/22.5)%16];
async function fetchWeather(c){if(!c)return null;try{
 const r=await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=1`);
 const cu=r.current,d=r.daily,cn=WMO[cu.weather_code]||['🌡️',''],dn=WMO[d.weather_code[0]]||cn;
 return {location:c.label,icon:cn[0],now_c:cu.temperature_2m,now_label:`Now (${(cu.time||'').slice(11,16)})`,high_c:d.temperature_2m_max[0],low_c:d.temperature_2m_min[0],
  conditions:`${dn[1]} today; now ${cn[1].toLowerCase()}`,wind:`${CMP(cu.wind_direction_10m)} ${Math.round(cu.wind_speed_10m)} km/h, gusts ${Math.round(cu.wind_gusts_10m)}`,precip_pct:d.precipitation_probability_max[0]??0}}catch(e){console.warn('weather',e);return null}}
function decodeMetar(raw){const t=raw.replace(/=$/,'').split(/\s+/);let wind='',vis=null,visT='',ceil=null,sky=[],temp='',alt='',obs='';
 for(const x of t){let m;
  if((m=/^(\d{2})(\d{2})(\d{2})Z$/.exec(x))){const d=new Date();const u=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),+m[1],+m[2],+m[3]));obs=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(u)}
  else if((m=/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(x)))wind=m[2]==='00'?'Calm':`${m[1]==='VRB'?'Variable':m[1]+'°'} ${+m[2]} ${m[4]==='KT'?'kt':'m/s'}${m[3]?`, gusts ${+m[3]}`:''}`;
  else if((m=/^(P)?(\d+)?(?:(\d)\/(\d))?SM$/.exec(x))&&(m[2]||m[3])){vis=(+m[2]||0)+(m[3]?m[3]/m[4]:0);visT=(m[1]?'more than ':'')+(m[2]||'')+(m[3]?(m[2]?' ':'')+m[3]+'/'+m[4]:'')+' SM'}
  else if((m=/^(\d)\/(\d)SM$/.exec(x))){vis=m[1]/m[2];visT=x.replace('SM',' SM')}
  else if(/^\d{4}$/.test(x)&&vis==null&&t.indexOf(x)>1){vis=+x/1609;visT=(+x>=9999?'10+ km':(+x/1000)+' km')}
  else if((m=/^(FEW|SCT|BKN|OVC|VV)(\d{3})/.exec(x))){const ft=+m[2]*100;sky.push(`${{FEW:'Few',SCT:'Scattered',BKN:'Broken',OVC:'Overcast',VV:'Vertical vis'}[m[1]]} ${ft.toLocaleString()} ft`);if(/BKN|OVC|VV/.test(m[1])&&ceil==null)ceil=ft}
  else if(/^(CLR|SKC|NSC|NCD|CAVOK)$/.test(x))sky.push('Sky clear');
  else if((m=/^(M?\d{2})\/(M?\d{2})?$/.exec(x))){const f=s=>s?(s[0]==='M'?-+s.slice(1):+s):null;temp=`Temp ${f(m[1])}°C${m[2]?` / dew ${f(m[2])}°C`:''}`}
  else if((m=/^A(\d{4})$/.exec(x)))alt=`Altimeter ${(m[1]/100).toFixed(2)} inHg`;else if((m=/^Q(\d{4})$/.exec(x)))alt=`QNH ${m[1]} hPa`;
  else if(x==='RMK')break}
 const v=vis??10,c=ceil??99999,cat=c<500||v<1?'LIFR':c<1000||v<3?'IFR':c<=3000||v<=5?'MVFR':'VFR';
 return {category:cat,metar_decoded:[obs&&'Observed '+obs,wind&&'Wind '+wind,visT&&'Visibility '+visT,sky.join(', '),temp,alt].filter(Boolean).join(' · ')}}
async function fetchMetar(icao){if(!icao)return null;try{const r=await getJSON(`https://metar.vatsim.net/${encodeURIComponent(icao)}?format=json`);const m=r&&r[0]&&r[0].metar;if(!m)return null;
 const raw=(m.startsWith(icao)?'':icao+' ')+m,d=decodeMetar(raw);return {station:icao,name:MODE.profile&&MODE.profile.icaoName||'',category:d.category,metar:raw,metar_decoded:d.metar_decoded,taf:'',taf_decoded:'',note:''}}catch(e){console.warn('metar',e);return null}}
/* ---- a new user's schedule: their own events (one-off or repeating) expanded into schedule.json shape ---- */
function expandEvents(evs,d0,days){const out=[];for(const e of evs){for(let d=d0-1;d<d0+days;d++){const iso=diso(d),dw=new Date(d*864e5).getUTCDay(),ed=dnum(e.date);if(d<ed)continue;
  const hit=e.repeat==='daily'||(e.repeat==='weekdays'&&dw>0&&dw<6)||(e.repeat==='weekly'&&(d-ed)%7===0)||(!e.repeat&&d===ed);if(!hit)continue;
  const s=t2m(e.start),z=t2m(e.end),base={type:e.type,label:e.label||TYPEN[e.type]||'Event',notes:e.notes||'',id:e.id,uid:'u'+e.id,tpl:e.id};
  if(z>s)out.push(Object.assign({date:iso,start:e.start,end:e.end},base));else{out.push(Object.assign({date:iso,start:e.start,end:'24:00'},base));out.push(Object.assign({date:diso(d+1),start:'00:00',end:e.end},base))}}}
 return out}
function todayLabel(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date()).replace(/^(\w+), /,'$1, ')}
async function loadUser(){const P=MODE.profile;TZ=(P.city&&P.city.tz)||Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Toronto';
 const n=nowTor(),h=Math.floor(n.min/60),greet=(h<12?'Morning':h<18?'Afternoon':'Evening')+(P.name?', '+P.name:'')+'.';
 const want=k=>(P.sections||[]).includes(k);
 const [wx,av]=await Promise.all([want('weather')?fetchWeather(P.city):null,want('aviation')?fetchMetar(P.icao):null]);
 STORE.briefing={date:n.iso,date_label:todayLabel(),greeting:greet,generated:'Updated '+m2t(n.min),weather:wx,aviation:av,shifts:[],overlap:false,movements:[],workout:null,tasks:[],noteworthy:[],focus:'',sixers:null,prospects:[],source:'user'};
 STORE.baseSchedule={timezone:TZ,updated:new Date().toISOString(),events:expandEvents(MODE.sched.events||[],dnum(n.iso),14)};
 STORE.meta={briefing:'Your sources: '+[wx&&'Open-Meteo weather',av&&'VATSIM METAR'].filter(Boolean).join(', ')||'Your sources',schedule:'Your own events'};STORE.archive=[];rebuildSchedule()}
/* ---- which sections a new user sees ---- */
const USER_SECS=[['schedule','Schedule','🗓️'],['weather','Weather','🌤️'],['aviation','Aviation (METAR)','🛫'],['reminders','Reminders','⏰']];
const vis=k=>{if(!isUser())return true;const s=SECK(k);if(['work','inbox','more','day'].includes(s))return false;if(s==='aviation'&&!MODE.profile.icao)return false;return (MODE.profile.sections||[]).includes(s)};
function applyVisibility(){if(!isUser())return;PAGES.forEach(p=>{if(p.w)p.w=p.w.filter(x=>vis(x[0]))});for(let i=PAGES.length-1;i>0;i--)if(!PAGES[i].w.length)PAGES.splice(i,1);
 if(vis('reminders')&&!PAGES.some(p=>p.w&&p.w.some(x=>x[0]==='reminders')))(PAGES[1]||PAGES[0]).w&&PAGES[PAGES.length-1].w.push(['reminders','']);
 for(let i=DOCK.length-1;i>=0;i--)if(DOCK[i][0]!=='settings'&&!vis(DOCK[i][0]))DOCK.splice(i,1);
 if(vis('reminders')&&!DOCK.some(d=>d[0]==='reminders'))DOCK.splice(DOCK.length-1,0,['reminders','','Reminders','⏰','linear-gradient(160deg,#fb7185,#be123c)']);
 for(let i=BRIEF.length-1;i>=0;i--)if(!vis(BRIEF[i][0]))BRIEF.splice(i,1)}
/* ---- editing sheets (new users) ---- */
function usheet(html,bind){const bg=document.createElement('div');bg.className='usheet';bg.innerHTML=`<div class="ub" role="dialog" aria-modal="true">${html}</div>`;bg.onclick=e=>{if(e.target===bg)bg.remove()};document.body.appendChild(bg);bind&&bind(bg.querySelector('.ub'),()=>bg.remove())}
const ETYPES=[['work','Work'],['workout','Workout'],['event','Event'],['sleep','Sleep']],REP=[['','Once'],['daily','Every day'],['weekdays','Weekdays'],['weekly','Weekly']];
function eventSheet(id){const ev=(MODE.sched.events||[]).find(e=>e.id===id)||{id:null,type:'event',label:'',date:nowTor().iso,start:'09:00',end:'10:00',repeat:'',notes:''};
 usheet(`<h3>${ev.id?'Edit event':'Add event'}</h3><label>Name<input id="ue_l" value="${esc(ev.label)}" placeholder="e.g. Work, Gym, Class"></label>
 <label>Type<select id="ue_t">${ETYPES.map(([k,n])=>`<option value="${k}" ${k===ev.type?'selected':''}>${n}</option>`).join('')}</select></label>
 <div class="ur"><label>Date<input id="ue_d" type="date" value="${esc(ev.date)}"></label><label>Repeats<select id="ue_r">${REP.map(([k,n])=>`<option value="${k}" ${k===(ev.repeat||'')?'selected':''}>${n}</option>`).join('')}</select></label></div>
 <div class="ur"><label>Start${TSEL('ue_s',ev.start)}</label><label>End${TSEL('ue_e',ev.end)}</label></div>
 <label>Notes<input id="ue_n" value="${esc(ev.notes||'')}" placeholder="Optional"></label><p class="uerr" id="ue_x"></p>
 <div class="ur"><button class="ubtn" id="ue_ok">Save</button>${ev.id?'<button class="ubtn ghost danger" id="ue_del">Delete</button>':'<button class="ubtn ghost" id="ue_c">Cancel</button>'}</div>`,(el,close)=>{const g=s=>el.querySelector(s);
  g('#ue_ok').onclick=async()=>{const v={id:ev.id||uid8(),label:g('#ue_l').value.trim(),type:g('#ue_t').value,date:g('#ue_d').value,start:tval(el,'ue_s'),end:tval(el,'ue_e'),repeat:g('#ue_r').value,notes:g('#ue_n').value.trim()};
   if(!v.date||!v.start||!v.end){g('#ue_x').textContent='Pick a date, start and end.';return}if(v.start===v.end){g('#ue_x').textContent='Start and end can’t be the same.';return}
   const l=(MODE.sched.events||[]).filter(e=>e.id!==v.id);l.push(v);MODE.sched={events:l};close();await US.set('schedule',MODE.sched);await refreshUser()};
  g('#ue_c')&&(g('#ue_c').onclick=close);
  g('#ue_del')&&(g('#ue_del').onclick=async()=>{MODE.sched={events:(MODE.sched.events||[]).filter(e=>e.id!==ev.id)};close();await US.set('schedule',MODE.sched);await refreshUser()})})}
/* ================= calendar editing (calendar-edit) =================
   Tap a block (Week view or Day by day): change its date and times (and the title, for events you added), delete it,
   or reset it to the calendar. Hold a block, then drag it to move it (15 min steps; a mouse just drags). ＋ adds an event.
   Edits are saved to briefing/{uid}/user/scheduleEdits (a device copy is the fallback) and applied over the feed (applyEdits). */
const EDITS={list:[],orphans:[],changed:[],
 async load(){let d=null;if(MODE.qa){try{d=JSON.parse(sessionStorage.getItem('dbw:qa:edits')||'null')}catch(e){}}else d=await US.get('scheduleEdits');
  const cut=diso(dnum(nowTor().iso)-EDIT_KEEP_DAYS);this.list=((d&&Array.isArray(d.edits)&&d.edits)||[]).filter(x=>x&&x.op&&x.key&&((x.op==='add'?x.date:(x.src&&x.src.date)||x.date)||'9')>=cut)},
 async save(){const d=JSON.parse(JSON.stringify({v:1,edits:this.list}));if(MODE.qa){sessionStorage.setItem('dbw:qa:edits',JSON.stringify(d));return}await US.set('scheduleEdits',d)},
 find(k){return this.list.find(x=>x.key===k)},
 put(x){x.at=Date.now();this.list=this.list.filter(y=>y.key!==x.key).concat([x])},
 drop(k){this.list=this.list.filter(y=>y.key!==k)}};
function rebuildSchedule(){const B=STORE.baseSchedule||{events:[]},r=applyEdits(B.events,EDITS.list);
 STORE.schedule=Object.assign({},B,{events:r.events});EDITS.orphans=r.orphans;EDITS.changed=r.changed;STORE.baseKeyed=new Map(keyed(B.events).map(e=>[e.k,e]));MODEL.cache={}}
const DRAG={dropAt:0};
/* 24 h time picker (iPhone's own time input follows the phone's 12/24 h setting, so we use two selects) */
function TSEL(id,v){let [h,m]=String(v||'09:00').split(':');if(h==='24')h='00';const mins=[...new Set([...Array(12)].map((_,i)=>i*5).concat([+m]))].sort((a,b)=>a-b);
 return `<span class="tsel" id="${id}"><select aria-label="Hour" data-p="h">${[...Array(24)].map((_,i)=>{const x=String(i).padStart(2,'0');return `<option ${x===h?'selected':''}>${x}</option>`}).join('')}</select><b>:</b><select aria-label="Minutes" data-p="m">${mins.map(i=>{const x=String(i).padStart(2,'0');return `<option ${i===+m?'selected':''}>${x}</option>`}).join('')}</select></span>`}
const tval=(el,id)=>el.querySelector('#'+id+' [data-p=h]').value+':'+el.querySelector('#'+id+' [data-p=m]').value;
function srcOf(s){const h=STORE.baseKeyed&&STORE.baseKeyed.get(s.keys[0]);
 return h?{date:h.date,start:h.start,end:h.end,dur:s.z-s.a,type:h.type||'',label:h.label||''}:{date:diso(Math.floor(s.a/1440)),start:m2t(s.a),end:endT(s.z),dur:s.z-s.a,type:s.type||'',label:s.label||''}}
const coversOf=(s,ex)=>[...new Set(((ex&&ex.covers)||[]).concat(s.keys.slice(1)))].filter(k=>k&&k!==s.keys[0]);
function editSpan(s,v){const k=s.keys[0],ex=EDITS.find(k);
 if(ex&&ex.op==='add'){EDITS.put(Object.assign({},ex,{date:v.date,start:v.start,dur:v.dur,end:endAt(v.start,v.dur)},v.label!=null?{label:v.label}:{},v.type?{type:v.type}:{}));return}
 const src=(ex&&ex.src)||srcOf(s);
 if(src.date===v.date&&src.start===v.start&&src.dur===v.dur){EDITS.drop(k);return}  // moved back to where the calendar has it
 EDITS.put({op:'move',key:k,covers:coversOf(s,ex),src,date:v.date,start:v.start,dur:v.dur,end:endAt(v.start,v.dur)})}
async function commitEdits(msg,prev){rebuildSchedule();if(OV)render();toast(msg,prev);await EDITS.save()}
function toast(msg,prev){$$('.toast').forEach(t=>t.remove());const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');
 t.innerHTML=`<span>${esc(msg)}</span>${prev?'<button>Undo</button>':''}`;document.body.appendChild(t);
 if(prev)t.querySelector('button').onclick=async()=>{t.remove();EDITS.list=prev;rebuildSchedule();if(OV)render();await EDITS.save()};
 setTimeout(()=>t.remove(),prev?6000:3000)}
async function resetEdit(k){const prev=EDITS.list.slice(),x=EDITS.find(k);EDITS.drop(k);await commitEdits(x&&x.op==='add'?'Deleted':'Back to your calendar',prev)}
function evSheet(s,def){const isAdd=!s,k=s?s.keys[0]:null,ex=k?EDITS.find(k):null,added=!!(ex&&ex.op==='add'),own=isAdd||added;
 const ty=isAdd?'event':(s.type in TYPEN?s.type:'event'),raw=k&&STORE.baseKeyed?STORE.baseKeyed.get(k):null,tpl=raw&&raw.tpl,n=nowTor();
 const d0=isAdd?(def&&def.d!=null?def.d:dnum(n.iso)):Math.floor(s.a/1440),nx=Math.min(23,Math.floor(n.min/60)+1);
 const st=isAdd?m2t(nx*60):m2t(s.a),en=isAdd?m2t(nx*60+60):m2t(s.z),chg=k&&EDITS.changed.some(c=>c.key===k);
 const head=own?`<label>Title<input id="es_l" value="${esc(added?ex.label:'')}" placeholder="e.g. Dentist, Class, Gym" maxlength="80"></label><label>Type<select id="es_t">${ETYPES.map(([v,nm])=>`<option value="${v}" ${v===(added?ex.type:'event')?'selected':''}>${nm}</option>`).join('')}</select></label>`
  :`<div class="evh" style="--ec:var(--${ty})"><div class="k"><span class="dot"></span>${esc(TYPEN[ty]||'Event')}${s.ed?' · <span class="edt">edited</span>':''}</div><b>${esc(s.label||TYPEN[ty])}</b>${s.notes?`<div class="sm">${esc(s.notes)}</div>`:''}${ex&&ex.src?`<div class="sm">In your calendar: ${esc(dlab(dnum(ex.src.date)))} ${esc(ex.src.start)}–${esc(endAt(ex.src.start,ex.src.dur))}</div>`:''}${chg?'<div class="sm warn">⚠ Your calendar changed this event after you edited it.</div>':''}${tpl?'<div class="sm">Changes here are for this day only. <button class="lnk" id="es_series">Edit every repeat</button></div>':''}</div>`;
 usheet(`<h3>${isAdd?'Add event':added?'Edit your event':'Change event'}</h3>${head}
  <label>Date<input id="es_d" type="date" value="${diso(d0)}"></label>
  <div class="ur"><label>Start${TSEL('es_s',st)}</label><label>End${TSEL('es_e',en)}</label></div>
  <p class="sm" id="es_h"></p><p class="uerr" id="es_x"></p>
  <div class="ur"><button class="ubtn" id="es_ok">${isAdd?'Add':'Save'}</button>${isAdd?'':'<button class="ubtn ghost danger" id="es_del">Delete</button>'}</div>
  <div class="ur">${ex&&!added?'<button class="ubtn ghost" id="es_rs">Reset to calendar</button>':''}<button class="ubtn ghost" id="es_c">Cancel</button></div>`,(el,close)=>{const g=q=>el.querySelector(q);
  const dur=()=>(t2m(tval(el,'es_e'))-t2m(tval(el,'es_s'))+1440)%1440;
  const hint=()=>{const d=dur();g('#es_h').textContent=d?`${hrs(d)}${t2m(tval(el,'es_s'))+d>1440?' · ends the next day (+1)':''}`:''};
  el.querySelectorAll('.tsel select').forEach(x=>x.onchange=hint);hint();
  g('#es_c').onclick=close;
  g('#es_series')&&(g('#es_series').onclick=()=>{close();eventSheet(tpl)});
  g('#es_ok').onclick=async()=>{const date=g('#es_d').value,start=tval(el,'es_s'),d=dur(),prev=EDITS.list.slice();
   if(!/^\d{4}-\d\d-\d\d$/.test(date)){g('#es_x').textContent='Pick a date.';return}
   if(!d){g('#es_x').textContent='Start and end can\u2019t be the same.';return}
   if(own){const type=g('#es_t').value,label=g('#es_l').value.trim()||(type==='sleep'?'Sleep':'');if(!label){g('#es_x').textContent='Add a title.';return}
    if(isAdd){const id=uid8();EDITS.put({op:'add',id,key:'add:'+id,date,start,dur:d,end:endAt(start,d),label,type,notes:''})}else editSpan(s,{date,start,dur:d,label,type})}
   else editSpan(s,{date,start,dur:d});
   close();await commitEdits(isAdd?`Added ${dlab(dnum(date))} ${start}`:'Saved',prev)};
  g('#es_del')&&(g('#es_del').onclick=async()=>{const prev=EDITS.list.slice();if(added)EDITS.drop(k);else EDITS.put({op:'delete',key:k,covers:coversOf(s,ex),src:(ex&&ex.src)||srcOf(s)});close();await commitEdits('Deleted',prev)});
  g('#es_rs')&&(g('#es_rs').onclick=async()=>{const prev=EDITS.list.slice();EDITS.drop(k);close();await commitEdits('Back to your calendar',prev)})})}
function changesCard(){const L=EDITS.list;if(!L.length)return '';const orph=new Set(EDITS.orphans.map(x=>x.key)),chg=new Set(EDITS.changed.map(x=>x.key));
 const when=(date,start,dur)=>date&&start?`${dlab(dnum(date))} ${start}–${endAt(start,dur||0)}${t2m(start)+(dur||0)>1440?' (+1)':''}`:'';const at=x=>(x.date||(x.src&&x.src.date)||'')+(x.start||(x.src&&x.src.start)||'');
 const rows=L.slice().sort((a,b)=>at(a).localeCompare(at(b))).map(x=>{const o=orph.has(x.key),c=chg.has(x.key),s=x.src||{};
  const t=x.op==='add'?`<b>Added</b> · ${esc(x.label)}<div class="sm">${esc(when(x.date,x.start,x.dur))}</div>`:x.op==='move'?`<b>Moved</b> · ${esc(s.label)}<div class="sm">${esc(when(s.date,s.start,s.dur))} → ${esc(when(x.date,x.start,x.dur))}</div>`:`<b>Deleted</b> · ${esc(s.label)}<div class="sm">${esc(when(s.date,s.start,s.dur))}</div>`;
  return `<div class="li chg${o?' orphan':''}"><div>${t}${o?'<div class="sm warn">⚠ No longer in your calendar, so this change isn\u2019t used.</div>':c?'<div class="sm warn">⚠ Your calendar changed this event after you edited it.</div>':''}</div><button class="ubtn ghost" data-ereset="${esc(x.key)}">${x.op==='add'?'Delete':o?'Remove':'Reset'}</button></div>`}).join('');
 return card(`Your changes (${L.length})`,rows+`<p class="sm" style="margin-top:8px">${MODE.qa?'QA demo: kept in this browser tab only.':MODE.cloud?'Saved to your account.':'Saved on this device.'}${MODE.kind==='owner'&&!MODE.qa?' Cal\u2019s nightly schedule build picks these up for your briefing.':''}</p>`)}
/* hold-and-drag in the Week view. Touch: hold 0.4 s, then drag (moving sooner just scrolls). Mouse: drag straight away. */
function bindDrag(wg,ov){const H=+wg.dataset.hh,cols=[...wg.querySelectorAll('.col')],ob=ov.querySelector('.ovb');let P=null,raf=0;
 const colAt=x=>{let best=cols[0],bd=1e9;for(const c of cols){const r=c.getBoundingClientRect(),d=Math.abs(x-(r.left+r.right)/2);if(d<bd){bd=d;best=c}}return best};
 const stop=()=>{if(!P)return;clearTimeout(P.t);cancelAnimationFrame(raf);P.g&&P.g.remove();P.b.classList.remove('lift');wg.classList.remove('dragging');document.body.classList.remove('wkdrag');P=null};
 const place=()=>{const c=colAt(P.x),r=c.getBoundingClientRect(),d=+c.dataset.d,pm=(P.y-r.top)/H*60;let a=Math.round((d*1440+pm-P.grab)/15)*15;
  a=Math.max(+cols[0].dataset.d*1440-P.dur+15,Math.min((+cols[cols.length-1].dataset.d+1)*1440-15,a));P.a=a;
  if(P.g.parentNode!==c)c.appendChild(P.g);const top=Math.max(0,a-d*1440),bot=Math.min(1440,a+P.dur-d*1440);
  P.g.style.top=top/60*H+'px';P.g.style.height=Math.max(6,(bot-top)/60*H)+'px';P.g.querySelector('span').textContent=`${ddow(Math.floor(a/1440))} ${m2t(a)}–${endAt(m2t(a),P.dur)}`};
 const auto=()=>{if(!P||!P.on)return;const r=ob.getBoundingClientRect();const v=P.y<r.top+50?-7:P.y>r.bottom-80?7:0;if(v){const t=ob.scrollTop;ob.scrollTop+=v;if(ob.scrollTop!==t)place()}raf=requestAnimationFrame(auto)};
 const begin=()=>{if(!P)return;P.on=true;try{navigator.vibrate&&navigator.vibrate(10)}catch(_){}try{wg.setPointerCapture(P.id)}catch(_){}
  P.b.classList.add('lift');wg.classList.add('dragging');document.body.classList.add('wkdrag');
  P.g=document.createElement('div');P.g.className='ghost';P.g.style.setProperty('--ec',getComputedStyle(P.b).backgroundColor);P.g.innerHTML='<span></span>';place();raf=requestAnimationFrame(auto)};
 wg.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-wkb]');if(!b||(e.pointerType==='mouse'&&e.button!==0))return;const W=WKB[+b.dataset.wkb];if(!W)return;stop();
  const s=W.s,r=b.parentNode.getBoundingClientRect(),pm=(e.clientY-r.top)/H*60;
  P={b,s,id:e.pointerId,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,touch:e.pointerType!=='mouse',on:false,dur:s.z-s.a,grab:W.d*1440+pm-s.a,a:s.a};
  if(P.touch)P.t=setTimeout(begin,400)});
 wg.addEventListener('pointermove',e=>{if(!P||e.pointerId!==P.id)return;P.x=e.clientX;P.y=e.clientY;
  if(!P.on){if(Math.hypot(P.x-P.x0,P.y-P.y0)>8){if(P.touch)stop();else begin()}return}
  e.preventDefault();place()});
 wg.addEventListener('pointerup',async e=>{if(!P||e.pointerId!==P.id)return;if(!P.on)return stop();
  const s=P.s,a=P.a;stop();DRAG.dropAt=Date.now();if(a===s.a)return;
  const prev=EDITS.list.slice(),date=diso(Math.floor(a/1440)),start=m2t(a);editSpan(s,{date,start,dur:s.z-s.a});
  await commitEdits(`Moved to ${dlab(Math.floor(a/1440))} ${start}–${endAt(start,s.z-s.a)}`,prev)});
 wg.addEventListener('pointercancel',e=>{if(P&&e.pointerId===P.id)stop()});
 wg.addEventListener('touchmove',e=>{if(P&&P.on&&e.cancelable)e.preventDefault()},{passive:false}); // holds the page still while dragging (iOS)
 wg.addEventListener('contextmenu',e=>{if(P)e.preventDefault()})}
/* QA demo (?qa=1): sample schedule, no sign-in, nothing leaves the tab. For Bugsy and for trying the editor safely. */
function qaFeed(d0){const E=[],ev=(d,s,e,type,label,notes,x)=>E.push(Object.assign({date:diso(d),start:s,end:e,type,label,notes:notes||''},x||{}));
 for(let i=-1;i<14;i++){const d=d0+i,w=((i%7)+7)%7;
  if(w!==4){ev(d,'23:00','24:00','sleep','Sleep');ev(d+1,'00:00','07:00','sleep','Sleep')}
  if(w===0||w===1||w===3)ev(d,'08:00','16:30','work','Day shift');
  if(w===4){ev(d,'20:00','24:00','ea','Night shift');ev(d+1,'00:00','03:00','ea','Night shift (cont.)');ev(d+1,'03:30','10:00','sleep','Sleep')}
  if(w===0||w===2||w===5)ev(d,'17:30','19:00','workout','Gym','Leg day');
  if(w===2)ev(d,'12:00','12:30','event','Team meeting','Weekly',{recurrence:'FREQ=WEEKLY'});
  if(w===6)ev(d,'10:00','13:00','event','Family visit')}
 E.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));E.forEach((x,i)=>x.id='e'+(i+1));return E}
async function startQA(){MODE.qa=true;MODE.kind='owner';MODE.cloud=false;MODE.user={uid:'qa-demo',email:'QA demo (sample data, nothing saved to an account)'};const n=nowTor();
 STORE.briefing={date:n.iso,date_label:todayLabel(),greeting:'QA demo with a sample schedule. Edits stay in this browser tab.',generated:'Sample data',weather:null,aviation:null,shifts:[],overlap:false,movements:[],workout:null,tasks:[],noteworthy:[],focus:'Try editing the week',sixers:null,prospects:[],source:'qa'};
 STORE.meta={briefing:'QA sample',schedule:'QA sample schedule'};STORE.archive=[];STORE.baseSchedule={timezone:TZ,updated:new Date().toISOString(),events:qaFeed(dnum(n.iso))};
 await EDITS.load();rebuildSchedule();render();
 if(qs.get('open')){const s=SECK(qs.get('open'));if(SEC[s]||s==='settings'){OV={sec:s,view:qs.get('view')||''};drawOV();document.body.classList.add('ovopen')}}}
async function refreshUser(){await loadUser();render()}
function userEventsCard(){const l=(MODE.sched.events||[]).slice().sort((a,b)=>a.start.localeCompare(b.start));
 return card('Your events',`${l.length?l.map(e=>`<button class="li ue" data-ua="ev" data-id="${esc(e.id)}"><div class="k" style="color:var(--${e.type in TYPEN?e.type:'event'})">${esc(TYPEN[e.type]||'Event')} · ${esc(e.start)}–${esc(e.end)} · ${esc((REP.find(r=>r[0]===(e.repeat||''))||REP[0])[1])}${e.repeat?'':' · '+esc(dlab(dnum(e.date)))}</div>${esc(e.label||TYPEN[e.type])}</button>`).join(''):'<div class="sm">Nothing yet. Add your work, classes, workouts and plans.</div>'}
 <button class="ubtn" data-ua="addev" style="margin-top:10px">＋ Add event</button>`)}
function userRemindersDetail(m){const done=(MODE.rem.items||[]).filter(i=>i.done);
 return hd('reminders',`${m.items.length} upcoming`)+card('Add a reminder',`<input class="uin" id="ur_t" placeholder="What do you need to remember?"><div class="ur"><input class="uin" id="ur_d" type="date"><button class="ubtn" data-ua="addrem">Add</button></div>`)+
  (m.items.length?card('Upcoming',m.items.map(i=>`<div class="li urm"><button class="uck" data-ua="remdone" data-id="${esc(i.id)}" aria-label="Mark done">○</button><div><div class="k" style="color:var(--sc)">${esc(i.when)}${i.days!=null&&i.days>=0?` · ${i.days===0?'today':i.days===1?'tomorrow':'in '+i.days+' days'}`:i.days!=null?' · overdue':''}</div>${esc(i.text)}</div><button class="uck x" data-ua="remdel" data-id="${esc(i.id)}" aria-label="Delete">✕</button></div>`).join('')):'')+
  (done.length?card('Done',done.slice(-10).reverse().map(i=>`<div class="li urm"><button class="uck on" data-ua="remundo" data-id="${esc(i.id)}" aria-label="Not done">✓</button><div class="muted">${esc(i.text)}</div><button class="uck x" data-ua="remdel" data-id="${esc(i.id)}" aria-label="Delete">✕</button></div>`).join('')):'')+
  `<p class="sm">${MODE.cloud?'Saved to your account.':'Saved on this device.'}</p>`}
function userRemindersModel(){const d0=dnum(nowTor().iso);const items=(MODE.rem.items||[]).filter(i=>!i.done).map(i=>{const dn=i.date?dnum(i.date):null;return {id:i.id,text:i.text,dn,days:dn==null?null:dn-d0,when:dn==null?'Later':dlab(dn),flag:''}}).sort((a,b)=>(a.dn??1e9)-(b.dn??1e9));return {status:'',items}}
async function userAction(a,id,el){const R=MODE.rem.items=MODE.rem.items||[];
 if(a==='ev')return eventSheet(id);if(a==='addev')return eventSheet(null);
 if(a==='addrem'){const t=el.querySelector('#ur_t').value.trim(),d=el.querySelector('#ur_d').value;if(!t)return;R.push({id:uid8(),text:t,date:d||null,done:false,at:Date.now()})}
 else if(a==='remdone'||a==='remundo'){const x=R.find(i=>i.id===id);if(x)x.done=a==='remdone'}
 else if(a==='remdel'){MODE.rem.items=R.filter(i=>i.id!==id)}
 else if(a==='resetup')return onboarding(true);
 else if(a==='signout'){await JWAUTH.signOut();localStorage.removeItem('dbw:owner');location.reload();return}
 else return;
 await US.set('reminders',MODE.rem);MODEL.cache={};drawOV()}
/* ---- first-run questions ---- */
function onboarding(again){const P=MODE.profile||{};const o={step:0,name:P.name||((MODE.user&&MODE.user.displayName)||'').split(' ')[0],city:P.city||null,icao:P.icao||'',icaoName:P.icaoName||'',sched:P.schedType||'',secs:(P.sections||['schedule','weather','reminders']).slice(),res:[],err:''};
 return new Promise(done=>{let el=document.createElement('div');el.id='uonb';el.className='uonb';document.body.appendChild(el);const N=5;
 const draw=()=>{const st=o.step;let h,sub,f;
  if(st===0){h='Welcome to MyAssistant';sub='Your day, weather and schedule in one place. A few quick questions to set it up.';f=`<label>What should we call you?<input id="uo_n" value="${esc(o.name)}" placeholder="First name" autocomplete="given-name"></label>`}
  else if(st===1){h='Where are you based?';sub='For your local weather and time zone.';f=`<div class="ur"><input class="uin" id="uo_c" placeholder="City, e.g. Waterloo" value="${esc(o.cq||'')}"><button class="ubtn" id="uo_cs">Search</button></div>${o.city?`<div class="upick on">✓ ${esc(o.city.label)}</div>`:''}${o.res.map((r,i)=>`<button class="upick" data-ci="${i}">${esc(r.label)}</button>`).join('')}`}
  else if(st===2){h='Home airport?';sub='Optional. Adds live METAR for a 4-letter ICAO code, like CYKF or KJFK.';f=`<input class="uin" id="uo_a" value="${esc(o.icao)}" placeholder="ICAO code (optional)" maxlength="4" autocapitalize="characters" style="text-transform:uppercase">`}
  else if(st===3){h='How does your week work?';sub='We’ll start your schedule from this. You can change anything later.';f=[['shift','Shift work','I’ll add my shifts as they come'],['9to5','Mon–Fri, 9 to 5','Adds a repeating weekday work block'],['student','Student','I’ll add my classes'],['flex','Flexible','Nothing fixed']].map(([k,n,d])=>`<button class="upick ${o.sched===k?'on':''}" data-sc="${k}"><b>${n}</b><span>${d}</span></button>`).join('')}
  else{h='What should Home show?';sub='Pick the sections you want. Change it any time in Settings.';f=`<div class="uchips">${USER_SECS.filter(([k])=>k!=='aviation'||o.icao).map(([k,n,i])=>`<button class="uchip ${o.secs.includes(k)?'on':''}" data-se="${k}">${i} ${n}</button>`).join('')}</div>`}
  el.innerHTML=`<div class="ui"><div class="ustep">Setup · ${st+1} of ${N}</div><h1>${h}</h1><p>${sub}</p>${f}<p class="uerr">${esc(o.err)}</p><div class="ur"><button class="ubtn ghost" id="uo_b">${st?'Back':again?'Cancel':'Skip'}</button><button class="ubtn" id="uo_x">${st===N-1?'Finish':'Continue'}</button></div></div>`;
  const g=s=>el.querySelector(s);o.err='';
  const grab=()=>{if(g('#uo_n'))o.name=g('#uo_n').value.trim();if(g('#uo_a'))o.icao=g('#uo_a').value.trim().toUpperCase();if(g('#uo_c'))o.cq=g('#uo_c').value.trim()};
  g('#uo_cs')&&(g('#uo_cs').onclick=async()=>{grab();if(!o.cq)return;try{const r=await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(o.cq.split(',')[0])}&count=8&language=en&format=json`);o.res=(r.results||[]).map(x=>({label:[x.name,x.admin1,x.country].filter(Boolean).join(', '),lat:x.latitude,lon:x.longitude,tz:x.timezone}));if(!o.res.length)o.err='No places found. Try another spelling.'}catch(e){o.err='Couldn’t search right now.'}draw()});
  g('#uo_c')&&(g('#uo_c').onkeydown=e=>{if(e.key==='Enter')g('#uo_cs').click()});
  el.querySelectorAll('[data-ci]').forEach(b=>b.onclick=()=>{o.city=o.res[+b.dataset.ci];o.res=[];draw()});
  el.querySelectorAll('[data-sc]').forEach(b=>b.onclick=()=>{o.sched=b.dataset.sc;draw()});
  el.querySelectorAll('[data-se]').forEach(b=>b.onclick=()=>{const k=b.dataset.se,i=o.secs.indexOf(k);i<0?o.secs.push(k):o.secs.splice(i,1);draw()});
  g('#uo_b').onclick=()=>{grab();if(o.step)o.step--,draw();else if(again){el.remove();done(false)}else finish(true)};
  g('#uo_x').onclick=async()=>{grab();
   if(o.step===2&&o.icao){if(!/^[A-Z0-9]{4}$/.test(o.icao)){o.err='ICAO codes are 4 letters, like CYKF.';return draw()}g('#uo_x').textContent='Checking…';const m=await fetchMetar(o.icao);if(!m){o.err=`No METAR found for ${o.icao}. Check the code or leave it blank.`;return draw()}if(!o.secs.includes('aviation'))o.secs.push('aviation')}
   if(o.step===2&&!o.icao)o.secs=o.secs.filter(k=>k!=='aviation');
   if(o.step<N-1){o.step++;draw()}else finish(false)};
  const f0=el.querySelector('input');if(f0&&matchMedia('(pointer:fine)').matches)f0.focus()};
 const finish=async skipped=>{const p=Object.assign({},MODE.profile||{},{name:o.name,city:o.city,icao:o.icao,schedType:o.sched||'flex',sections:o.secs.length?o.secs:['schedule'],onboarded:true,skipped:!!skipped,at:Date.now()});
  MODE.profile=p;await US.set('profile',p);
  if(o.sched==='9to5'&&!(MODE.sched.events||[]).some(e=>e.seed)){MODE.sched={events:(MODE.sched.events||[]).concat([{id:uid8(),seed:true,label:'Work',type:'work',date:nowTor().iso,start:'09:00',end:'17:00',repeat:'weekdays',notes:''}])};await US.set('schedule',MODE.sched)}
  el.remove();done(true)};
 draw()})}
/* ---- owner detection + boot ---- */
async function readFeed(u){try{const f=await JWAUTH.getCol(`briefing/${u.uid}/feed`);return f&&f.briefing&&f.briefing.data?f:null}catch(e){if(!JWAUTH.denied(e))console.warn('feed',e);return null}}
async function loadFeed(f){STORE.briefing=f.briefing.data;STORE.briefing.source='live';STORE.meta.briefing='Live: your crew feed ('+(f.briefing.date||STORE.briefing.date)+')';
 STORE.schedule=STORE.baseSchedule=unapply(f.schedule&&f.schedule.data||{events:[],updated:''});STORE.meta.schedule='Live: Cal\u2019s schedule feed';STORE.meta.scheduleUpdated=STORE.schedule.updated;
 STORE.archive=(f.archive&&f.archive.days)||[{date:STORE.briefing.date,label:STORE.briefing.date_label,focus:STORE.briefing.focus}];const B=STORE.briefing;B.tasks=noFin(B.tasks);B.noteworthy=noFin(B.noteworthy);rebuildSchedule()}
async function start(u){MODE.user=u;$('#app').innerHTML='<div class="boot">Loading MyAssistant…</div>';
 await EDITS.load();
 const feed=await readFeed(u),ownerUid=CONFIG.OWNER_UID&&u.uid===CONFIG.OWNER_UID;
 if(feed){MODE.kind='owner';MODE.feed=true;await loadFeed(feed)}
 else if(CONFIG.PUBLIC_FALLBACK&&(ownerUid||localStorage.getItem('dbw:owner')==='1')){MODE.kind='owner';await load()}
 else if(ownerUid){MODE.kind='owner';$('#app').innerHTML='<div class="boot">Your crew feed hasn’t been published to your account yet.</div>';return}
 else{MODE.kind='user';const [p,s,r]=await Promise.all([US.get('profile'),US.get('schedule'),US.get('reminders')]);MODE.profile=p;MODE.sched=s||{events:[]};MODE.rem=r||{items:[]};
  if(!p||!p.onboarded){await onboarding(false)}await loadUser();applyVisibility()}
 render();
 if(qs.get('open')){const s=SECK(qs.get('open'));if((SEC[s]&&vis(s))||s==='settings'){OV={sec:s,view:qs.get('view')||(qs.get('open')==='week'?'week':'')};drawOV();document.body.classList.add('ovopen')}}
 setInterval(async()=>{if(!OV){if(isUser())await loadUser();else MODEL.cache={};render()}},isUser()?600000:60000)}
function boot(){applyTheme();if(qs.get('qa')==='1')return startQA();JWAUTH.ready().then(u=>{if(u)return start(u);$('#app').innerHTML='';
  JWAUTH.gate({title:'MyAssistant',icon:'icons/icon-180.png',sub:'Your daily briefing and schedule. Sign in to start with a clean slate, or to see your own feeds.',note:'Same account as Logbook and Pantry.',onUser:start})})
 .catch(e=>{console.error(e);$('#app').innerHTML='<div class="boot">Couldn\u2019t load sign-in. Check your connection and reopen.</div>'})}

/* ---------------- boot ---------------- */
boot();
window.__DBW={STORE,MODEL,SEC,MODE,CONFIG,decodeMetar,expandEvents,EDITS,applyEdits,keyed,unapply,fnv};
})();
