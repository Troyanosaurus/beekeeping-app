/* global React, ReactDOM */
const { useEffect, useMemo, useRef, useState } = React;

/**
 * Beekeeping App — Yellow & Black (Previewable)
 * -------------------------------------------------
 * Single-file React app (no external UI/icon deps).
 *
 * Highlights:
 * - Dashboard: Total Hives, Singles, Doubles, Nucs, Queenless Hives, To Do count
 * - Inventory: inline editing (multi-digit), +/- controls
 * - Tasks: To Do list sorted by date; double-click title to edit; custom calendar popover
 * - Apiaries: searchable vertical list with checkboxes + confirm delete; detail view
 * - Add/Edit Apiary modals; Last Update shown (dd/mm/yyyy)
 * - JSON & CSV Import/Export with merge/dedupe protection
 * - LocalStorage persistence; runtime sanity tests (console.table)
 */

// ================================================================ Helpers
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, days) => { const d = iso ? new Date(iso) : new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
function toInt(v) { const n = parseInt(String((v ?? 0)), 10); return Number.isFinite(n) && n >= 0 ? n : 0; }
function fmtDMY(iso) { if (!iso) return ""; const [y,m,d] = String(iso).split("T")[0].split("-"); if(!y||!m||!d) return String(iso); return `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}`; }
function isoToYMD(iso){ if(!iso) return {}; const [y,m,d]=String(iso).split("T")[0].split("-").map(n=>parseInt(n,10)); return {y,m,d}; }
function ymdToISO(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function daysInMonth(y,m){ return new Date(y,m,0).getDate(); }
function monthName(m){ return ["January","February","March","April","May","June","July","August","September","October","November","December"][m-1]; }
function validateApiary(form){
  const errors = {};
  const name=(form.name||"").trim();
  const numHives=toInt(form.numHives);
  const singleHives=toInt(form.singleHives);
  const doubleHives=toInt(form.doubleHives);
  const queenlessHives=toInt(form.queenlessHives);
  const nucs=toInt(form.nucs);
  if(!name) errors.name="Name is required.";
  if(numHives<0) errors.numHives="Enter a total number 0 or greater.";
  if(singleHives>numHives) errors.singleHives="Single hives cannot exceed total.";
  if(doubleHives>numHives) errors.doubleHives="Double hives cannot exceed total.";
  if(singleHives+doubleHives>numHives) errors.doubleHives="Single + Double cannot exceed total.";
  if(queenlessHives>numHives) errors.queenlessHives="Queenless hives cannot exceed total.";
  return { valid:Object.keys(errors).length===0, errors, values:{...form, name, numHives, singleHives, doubleHives, queenlessHives, nucs} };
}

// ------------------------------ Safe localStorage
const safeStorage = { get(key, fb){ try{ const raw=window?.localStorage?.getItem(key); return raw? JSON.parse(raw): fb; } catch { return fb; } }, set(key,val){ try{ window?.localStorage?.setItem(key, JSON.stringify(val)); } catch {} } };

// ------------------------------ Download & File IO
function downloadJSON(data, filename='beekeeping-backup.json'){ try{ const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);}catch{}}
function readFileAsText(file){ return new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onerror=()=>reject(new Error('Failed to read file')); fr.onload=()=>resolve(String(fr.result||'')); fr.readAsText(file); }); }

// ------------------------------ CSV helpers
function escapeCSV(v){ const s=String(v??''); return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }
function toCSV(rows){ const arr=Array.isArray(rows)?rows:[]; if(arr.length===0) return ''; const headers=Object.keys(arr[0]); const head=headers.map(escapeCSV).join(','); const lines=arr.map(r=>headers.map(h=>escapeCSV(r[h])).join(',')); return [head,...lines].join('\n'); }
function downloadCSV(rows, filename='data.csv'){ try{ const csv=toCSV(rows); const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);}catch{}}
function parseCSV(text){ const s=String(text||'').replace(/^\uFEFF/,''); const rows=[]; let row=[]; let field=''; let inQuotes=false; for(let i=0;i<s.length;i++){ const c=s[i]; if(inQuotes){ if(c==='"'){ if(s[i+1]==='"'){ field+='"'; i++; } else { inQuotes=false; } } else { field+=c; } } else { if(c==='"'){ inQuotes=true; } else if(c===','){ row.push(field); field=''; } else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; } else if(c==='\r'){ /* skip */ } else { field+=c; } } } if(field!==''||row.length>0){ row.push(field); rows.push(row); } if(rows.length===0) return []; const header=rows[0].map(h=>String(h||'').trim()); return rows.slice(1).filter(r=>r.some(x=>String(x).trim().length)).map(r=>{ const obj={}; header.forEach((h,i)=>{ obj[h]=r[i]??''; }); return obj; }); }

// ------------------------------ Coercion
const coerceApiary = (a)=>({ id:String(a?.id||`A-${Math.random().toString(36).slice(2,7)}`), name:String(a?.name||''), queenStatus:String(a?.queenStatus||'Laying'), strength:String(a?.strength||'Moderate'), numHives:toInt(a?.numHives), singleHives:toInt(a?.singleHives), doubleHives:toInt(a?.doubleHives), queenlessHives:toInt(a?.queenlessHives), nucs:toInt(a?.nucs), notes:String(a?.notes||''), lastInspection:(a?.lastInspection && String(a.lastInspection)) || todayISO() });
const coerceTask = (t)=>({ id:String(t?.id||`T-${Math.random().toString(36).slice(2,7)}`), title:String(t?.title||''), hiveId:String(t?.hiveId||''), due:(t?.due && String(t.due))||todayISO(), status:(t?.status==='Done' ? 'Done':'To Do'), priority:(['Low','Medium','High'].includes(String(t?.priority)) ? String(t.priority) : 'Medium') });
const coerceInventory = (inv)=>({ supers:toInt(inv?.supers), boxes:toInt(inv?.boxes), feeders:toInt(inv?.feeders), syrupL:toInt(inv?.syrupL) });

// --------------------------------------------------------------- Seed Data
const seedHives=[
  { id:"A-001", name:"Sunflower-1", queenStatus:"Laying", strength:"Strong",   numHives:5, singleHives:3, doubleHives:2, queenlessHives:0, nucs:0, lastInspection:"2025-08-19" },
  { id:"A-002", name:"Clover-2",    queenStatus:"Queenless", strength:"Weak",  numHives:2, singleHives:2, doubleHives:0, queenlessHives:2, nucs:0, lastInspection:"2025-08-28" },
  { id:"A-003", name:"Acacia-3",    queenStatus:"Laying",    strength:"Moderate", numHives:4, singleHives:1, doubleHives:3, queenlessHives:0, nucs:0, lastInspection:"2025-08-23" },
];
const seedTasks=[
  { id:"T-001", title:"Oxalic vapor treatment", hiveId:"A-003", due:todayISO(), status:"To Do", priority:"High" },
  { id:"T-002", title:"Add equipment",          hiveId:"A-001", due:todayISO(), status:"To Do", priority:"Medium" },
  { id:"T-003", title:"Introduce queen",        hiveId:"A-002", due:todayISO(), status:"To Do", priority:"High" },
];
const seedInventory={ supers:12, boxes:120, feeders:6, syrupL:30 };

// --------------------------------------------------------------- UI Primitives
function Card({ children, className="" }){ return <div className={`rounded-2xl border border-yellow-500/20 bg-black/40 ${className}`}>{children}</div>; }
function CardHeader({ children, className="" }){ return <div className={`px-4 pt-4 pb-2 ${className}`}>{children}</div>; }
function CardTitle({ children, className="" }){ return <div className={`text-yellow-200 font-semibold ${className}`}>{children}</div>; }
function CardContent({ children, className="" }){ return <div className={`px-4 pb-4 ${className}`}>{children}</div>; }
function Button({ children, onClick, variant='solid', className='', disabled, type='button' }){ const base = variant==='solid' ? 'bg-yellow-500 text-black hover:bg-yellow-400' : 'border border-yellow-500/40 text-yellow-300 bg-black/40 hover:bg-black/60'; const dis = disabled ? 'opacity-50 cursor-not-allowed' : ''; return <button type={type} onClick={onClick} disabled={disabled} className={`px-3 py-2 rounded-xl text-sm ${base} ${dis} ${className}`}>{children}</button>; }
function Input({ value, onChange, placeholder='', type='text', className='', min, style, innerRef, ...props }){ return <input ref={innerRef} value={value} onChange={onChange} placeholder={placeholder} type={type} min={min} style={style} {...props} className={`w-full px-3 py-2 rounded-xl bg-black/40 border border-yellow-500/30 text-yellow-100 ${className}`} />; }
function Textarea({ value, onChange, className='', rows=3 }){ return <textarea value={value} onChange={onChange} rows={rows} className={`w-full px-3 py-2 rounded-xl bg-black/40 border border-yellow-500/30 text-yellow-100 ${className}`} />; }
function Stat({ title, value, accent='text-yellow-100' }){ return (<Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wider text-yellow-300">{title}</CardTitle></CardHeader><CardContent><div className={`text-2xl font-bold ${accent}`}>{value}</div></CardContent></Card>); }
function CalendarIcon({ className='' }){ return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>); }

// ------------------------------------------------ Custom Calendar Popover
function CalendarPopover({ valueISO, onSelect, onClose }){
  const today = new Date();
  const sel = isoToYMD(valueISO || todayISO());
  const [y,setY] = useState(sel.y || today.getFullYear());
  const [m,setM] = useState(sel.m || (today.getMonth()+1));
  const firstDow = new Date(y, m-1, 1).getDay();
  const days = daysInMonth(y,m);
  const blanks = Array.from({length:firstDow});
  const dates = Array.from({length:days},(_,i)=>i+1);
  const goto=(delta)=>{ let nm=m+delta, ny=y; while(nm<1){nm+=12;ny--;} while(nm>12){nm-=12;ny++;} setM(nm); setY(ny); };
  const tY=today.getFullYear(), tM=today.getMonth()+1, tD=today.getDate();
  const isToday=(d)=> y===tY && m===tM && d===tD;
  const isSelected=(d)=> y===sel.y && m===sel.m && d===sel.d;
  return (
    <div className="absolute z-50 right-0 bottom-full mb-2 w-72 rounded-xl border border-yellow-500/30 bg-black shadow-xl p-2">
      <div className="flex items-center justify-between px-1 py-1">
        <Button variant="outline" onClick={()=>goto(-1)}>‹</Button>
        <div className="text-sm font-semibold text-yellow-200">{monthName(m)} {y}</div>
        <Button variant="outline" onClick={()=>goto(1)}>›</Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[11px] text-yellow-300/80 px-1 mt-1">{"SMTWTFS".split("").map(d=> <div key={d} className="text-center">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1 p-1">
        {blanks.map((_,i)=><div key={`b${i}`} />)}
        {dates.map(d=> (
          <button key={d} onClick={()=>{ onSelect?.(ymdToISO(y,m,d)); onClose?.(); }}
            className={`h-8 rounded-lg text-sm flex items-center justify-center border border-transparent hover:border-yellow-500/40 ${isSelected(d)?'bg-yellow-500 text-black': isToday(d)?'ring-1 ring-yellow-400':'bg-black/40 text-yellow-100'}`}>{d}</button>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 px-1 pb-1">
        <Button variant="outline" onClick={()=>{ const t=todayISO(); setY(today.getFullYear()); setM(today.getMonth()+1); onSelect?.(t); onClose?.(); }}>Today</Button>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

// ================================================================= App
function BeekeepingApp(){
  // App State
  const [tab,setTab] = useState('dashboard');
  const [hives,setHives] = useState(()=>safeStorage.get('bk.hives', seedHives));
  const [tasks,setTasks] = useState(()=>safeStorage.get('bk.tasks', seedTasks));
  const [inventory,setInventory] = useState(()=>safeStorage.get('bk.inventory', seedInventory));
  const [showNewHive,setShowNewHive] = useState(false);
  const [editing,setEditing] = useState(null);
  const [showDone,setShowDone] = useState(false);
  const jsonFileRef = useRef(null); const csvFileRef = useRef(null);
  const [importMsg,setImportMsg] = useState('');

  // Persist
  useEffect(()=>{ safeStorage.set('bk.hives', hives); }, [hives]);
  useEffect(()=>{ safeStorage.set('bk.tasks', tasks); }, [tasks]);
  useEffect(()=>{ safeStorage.set('bk.inventory', inventory); }, [inventory]);

  // Derived
  const totalHiveCount   = useMemo(()=>hives.reduce((s,a)=>s+toInt(a.numHives),0), [hives]);
  const queenlessCount   = useMemo(()=>hives.reduce((s,a)=>s+toInt(a.queenlessHives),0), [hives]);
  const totalSingleCount = useMemo(()=>hives.reduce((s,a)=>s+toInt(a.singleHives),0), [hives]);
  const totalDoubleCount = useMemo(()=>hives.reduce((s,a)=>s+toInt(a.doubleHives),0), [hives]);
  const totalNucCount    = useMemo(()=>hives.reduce((s,a)=>s+toInt(a.nucs),0), [hives]);
  const todosOnly        = useMemo(()=>tasks.filter(t=>t.status==='To Do'), [tasks]);

  // Apiary CRUD
  function updateHive(id, patch){ setHives(hives.map(h=>h.id===id?{...h,...patch}:h)); }
  function addHive(data){ const id=`A-${String(hives.length+1).padStart(3,'0')}`; const {valid,values}=validateApiary(data); if(!valid) return; setHives([{ id, lastInspection: todayISO(), queenStatus: values.queenStatus||'Laying', strength: values.strength||'Moderate', ...values }, ...hives]); }

  // Task helpers
  function addTask(t){ const id = t.id || `T-${Math.random().toString(36).slice(2,7)}`; setTasks(ts=>[{...t,id,status:'To Do'},...ts]); }
  function deleteTask(id){ setTasks(ts=>ts.filter(t=>t.id!==id)); }
  function setTaskStatus(id,status){ setTasks(ts=>ts.map(t=>t.id===id?{...t,status}:t)); }
  function updateTask(id,patch){ setTasks(ts=>ts.map(t=>t.id===id?{...t,...patch}:t)); }

  // Import/Export JSON
  function doExport(){ downloadJSON({ version:1, exportedAt:new Date().toISOString(), hives, tasks, inventory }); }
  async function doImport(ev){ setImportMsg(''); try{ const file=ev.target.files?.[0]; if(!file) return; const txt=await readFileAsText(file); const json=JSON.parse(txt); const nextHives=Array.isArray(json.hives)?json.hives.map(coerceApiary):[]; const nextTasks=Array.isArray(json.tasks)?json.tasks.map(coerceTask):[]; const nextInv=coerceInventory(json.inventory||{}); const hiveMap=new Map(hives.map(h=>[h.id,h])); nextHives.forEach(n=>hiveMap.set(n.id,{...(hiveMap.get(n.id)||{}),...n})); const taskMap=new Map(tasks.map(t=>[t.id,t])); nextTasks.forEach(n=>taskMap.set(n.id,{...(taskMap.get(n.id)||{}),...n})); setHives(Array.from(hiveMap.values())); setTasks(Array.from(taskMap.values())); setInventory({...inventory,...nextInv}); setImportMsg(`Imported ${nextHives.length} apiaries, ${nextTasks.length} tasks.`); } catch { setImportMsg('Import failed: invalid file'); } finally { if(jsonFileRef.current) jsonFileRef.current.value=''; } }

  // CSV Import/Export
  function doExportCSV(){ const apiaryRows=hives.map(h=>({ id:h.id, name:h.name, queenStatus:h.queenStatus, strength:h.strength, numHives:h.numHives, singleHives:h.singleHives, doubleHives:h.doubleHives, queenlessHives:h.queenlessHives??0, nucs:h.nucs??0, notes:h.notes||'', lastInspection:h.lastInspection||todayISO() })); downloadCSV(apiaryRows,'apiaries.csv'); const taskRows=tasks.map(t=>({ id:t.id, title:t.title, hiveId:t.hiveId, due:t.due, status:t.status, priority:t.priority })); downloadCSV(taskRows,'tasks.csv'); const invRow=[{ boxes:inventory.boxes??0, supers:inventory.supers??0, feeders:inventory.feeders??0, syrupL:inventory.syrupL??0 }]; downloadCSV(invRow,'inventory.csv'); }
  async function doImportCSV(ev){ setImportMsg(''); try{ const file=ev.target.files?.[0]; if(!file) return; const rows=parseCSV(await readFileAsText(file)); if(!rows.length){ setImportMsg('CSV contains no rows.'); return; } const hdrs=Object.keys(rows[0]).map(s=>s.toLowerCase()); const has=(k)=>hdrs.includes(k); if(has('title')&&has('due')){ const next=rows.map(coerceTask); const byId=new Map(tasks.map(t=>[t.id,t])); const sig=(t)=>`${t.title}|${t.hiveId}|${t.due}`; const bySig=new Map(tasks.map(t=>[sig(t),t])); let count=0; next.forEach(n=>{ if(n.id&&byId.has(n.id)){ byId.set(n.id,{...byId.get(n.id),...n}); count++; } else if(bySig.has(sig(n))){ const e=bySig.get(sig(n)); byId.set(e.id,{...e,...n}); } else { const id=`T-${Math.random().toString(36).slice(2,7)}`; byId.set(id,{...n,id}); count++; } }); setTasks(Array.from(byId.values())); setImportMsg(`Imported/merged ${count} tasks from CSV.`); } else if(has('name')||has('numhives')||has('singlehives')||has('doublehives')){ const next=rows.map(coerceApiary); const byId=new Map(hives.map(h=>[h.id,h])); const byName=new Map(hives.map(h=>[h.name.toLowerCase(),h])); let count=0; next.forEach(n=>{ if(n.id&&byId.has(n.id)){ byId.set(n.id,{...byId.get(n.id),...n}); count++; } else if(n.name && byName.has(n.name.toLowerCase())){ const e=byName.get(n.name.toLowerCase()); byId.set(e.id,{...e,...n,id:e.id}); count++; } else { const id=`A-${String(byId.size+1).padStart(3,'0')}`; byId.set(id,{...n,id}); count++; } }); setHives(Array.from(byId.values())); setImportMsg(`Imported/merged ${count} apiaries from CSV.`); } else if(has('boxes')||has('supers')||has('feeders')||has('syrupl')){ const first=rows[0]||{}; const patch={ boxes:toInt(first.boxes), supers:toInt(first.supers), feeders:toInt(first.feeders), syrupL:toInt(first.syrupL) }; setInventory(prev=>({ ...prev, ...patch })); setImportMsg('Inventory updated from CSV.'); } else { setImportMsg('Unknown CSV format. Expected Apiaries, Tasks, or Inventory columns.'); } } catch { setImportMsg('Import failed: invalid CSV'); } finally { if(csvFileRef.current) csvFileRef.current.value=''; } }

  // Runtime sanity tests
  useEffect(()=>{ const tests=[]; tests.push({name:'Stat component exists', pass:typeof Stat==='function'}); tests.push({name:'hives is array', pass:Array.isArray(hives)}); tests.push({name:'toInt nullish->0', pass:toInt(undefined)===0 && toInt(null)===0}); tests.push({name:'toInt parses 1234', pass:toInt('1234')===1234}); const v1=validateApiary({name:'',numHives:1,singleHives:0,doubleHives:0}); tests.push({name:'validate: name required', pass:!v1.valid && !!v1.errors.name}); const v2=validateApiary({name:'X',numHives:0,singleHives:0,doubleHives:0}); tests.push({name:'validate: numHives≥0', pass:v2.valid}); const v2b=validateApiary({name:'X',numHives:0,singleHives:1,doubleHives:0}); tests.push({name:'validate: singles fit total', pass:!v2b.valid}); const v3=validateApiary({name:'Y',numHives:2,singleHives:2,doubleHives:1}); tests.push({name:'validate: singles+doubles ≤ total', pass:!v3.valid}); tests.push({name:'fmtDMY 2025-09-05', pass:fmtDMY('2025-09-05')==='05/09/2025'}); tests.push({name:'daysInMonth Feb/2024=29', pass:daysInMonth(2024,2)===29}); const _iso=ymdToISO(2025,9,6), _ymd=isoToYMD(_iso); tests.push({name:'ymd<->iso', pass:_iso==='2025-09-06' && _ymd.y===2025 && _ymd.m===9 && _ymd.d===6}); tests.push({name:'inventory keys ok', pass:['boxes','supers','feeders','syrupL'].every(k=>Object.prototype.hasOwnProperty.call(inventory,k))}); tests.push({name:'CSV roundtrip small', pass:(()=>{ const rows=[{a:1,b:'x,y'},{a:2,b:'"q"'}]; const csv=toCSV(rows); const back=parseCSV(csv); return Array.isArray(back)&&back.length===2; })()}); console.table(tests); }, []);

  // ------------------- Dashboard
  function Dashboard(){
    function InvRow({k,v}){ const [draft,setDraft]=useState(String(v)); const [focused,setFocused]=useState(false); useEffect(()=>{ if(!focused) setDraft(String(v)); },[v,focused]); const commit=()=>{ const clean=Math.max(0,toInt(draft)); setInventory(prev=>({...prev,[k]:clean})); }; return (<div className="flex items-center justify-between"><span className="capitalize">{k.replace(/([A-Z])/g,' $1').toLowerCase()}</span><div className="flex items-center gap-2"><Button variant="outline" onClick={()=>{ const base=Math.max(0,toInt(draft)); const next=Math.max(0,base-1); setDraft(String(next)); setInventory(prev=>({...prev,[k]:next})); }}>-</Button><Input type="text" inputMode="numeric" pattern="[0-9]*" className="text-center" style={{width:'12ch'}} value={draft} onChange={(e)=>setDraft(e.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>{ setFocused(false); commit(); }} onKeyDown={(e)=>{ if(e.key==='Enter') e.currentTarget.blur(); }} /><Button onClick={()=>{ const base=Math.max(0,toInt(draft)); const next=base+1; setDraft(String(next)); setInventory(prev=>({...prev,[k]:next})); }}>+</Button></div></div>); }
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Stat title="Total Hives" value={totalHiveCount} />
            <Stat title="Singles" value={totalSingleCount} />
            <Stat title="Doubles" value={totalDoubleCount} />
            <Stat title="Nucs" value={totalNucCount} />
            <Stat title="Queenless Hives" value={queenlessCount} accent="text-red-300" />
            <Stat title="To Do" value={todosOnly.length} />
          </div>
          <Card><CardHeader><CardTitle>Tasks</CardTitle></CardHeader><CardContent><TaskBoard tasks={tasks} onAdd={(t)=>addTask({ id:`T-${Date.now()}`, ...t })} onDelete={deleteTask} onSetStatus={setTaskStatus} onUpdate={updateTask} hives={hives} showDone={showDone} setShowDone={setShowDone} /></CardContent></Card>
        </div>
        <div className="space-y-4"><Card><CardHeader><CardTitle>Inventory</CardTitle></CardHeader><CardContent className="space-y-2 text-yellow-100/90">{Object.entries(inventory).map(([k,v])=> <InvRow key={k} k={k} v={v} />)}</CardContent></Card></div>
      </div>
    );
  }

  // ------------------- Task Board
  function TaskBoard({ tasks, onAdd, onDelete, onSetStatus, onUpdate, hives, showDone, setShowDone }){
    const [draft,setDraft] = useState({ title:'', hiveId:hives[0]?.id||'', due:todayISO(), priority:'Medium' });
    const [calOpen,setCalOpen] = useState(false); const calWrapRef = useRef(null);
    useEffect(()=>{ if(!calOpen) return; const handler=(e)=>{ const root=calWrapRef.current; if(root && !root.contains(e.target)) setCalOpen(false); }; document.addEventListener('mousedown',handler); document.addEventListener('touchstart',handler,{passive:true}); return ()=>{ document.removeEventListener('mousedown',handler); document.removeEventListener('touchstart',handler); }; }, [calOpen]);
    const todos = useMemo(()=> tasks.filter(t=>t.status==='To Do').slice().sort((a,b)=>{ const ta=new Date(a.due).getTime(); const tb=new Date(b.due).getTime(); return (Number.isFinite(ta)?ta:Infinity) - (Number.isFinite(tb)?tb:Infinity); }), [tasks]);
    const dones = tasks.filter(t=>t.status==='Done');
    const isOverdue=(d)=>{ const t=new Date(todayISO()).getTime(); const due=new Date(d).getTime(); return Number.isFinite(due)&&due<t; };
    function TaskItem({ t }){
      const [editingTitle,setEditingTitle]=useState(false); const [titleDraft,setTitleDraft]=useState(t.title); const [rowCalOpen,setRowCalOpen]=useState(false); const rowRef=useRef(null);
      useEffect(()=>{ if(!rowCalOpen) return; const handler=(e)=>{ const root=rowRef.current; if(root && !root.contains(e.target)) setRowCalOpen(false); }; document.addEventListener('mousedown',handler); document.addEventListener('touchstart',handler,{passive:true}); return ()=>{ document.removeEventListener('mousedown',handler); document.removeEventListener('touchstart',handler); }; }, [rowCalOpen]);
      useEffect(()=>{ if(!editingTitle) setTitleDraft(t.title); }, [t.title, editingTitle]);
      const saveTitle=()=>{ const next=(titleDraft||'').trim(); if(next && next!==t.title) onUpdate?.(t.id,{ title: next }); setEditingTitle(false); };
      return (
        <div className="rounded-xl border border-yellow-500/20 bg-black/40 p-3" ref={rowRef}>
          <div className="font-medium text-yellow-100">{ editingTitle ? (<Input value={titleDraft} onChange={(e)=>setTitleDraft(e.target.value)} onBlur={saveTitle} onKeyDown={(e)=>{ if(e.key==='Enter') (e.currentTarget).blur(); if(e.key==='Escape'){ setTitleDraft(t.title); setEditingTitle(false); } }} autoFocus />) : (<span onDoubleClick={()=>setEditingTitle(true)} className="cursor-text select-text">{t.title}</span>) }</div>
          <div className="mt-1 flex items-center gap-2 relative"><span className="text-base font-semibold text-yellow-100">Due {fmtDMY(t.due)}</span><button type="button" aria-label="Edit due date" onClick={()=>setRowCalOpen(!rowCalOpen)} className="bg-black/40 border border-yellow-500/30 rounded-lg p-1 hover:bg-black/60"><CalendarIcon className="w-5 h-5" /></button>{rowCalOpen && (<CalendarPopover valueISO={t.due} onSelect={(iso)=>onUpdate?.(t.id,{ due: iso })} onClose={()=>setRowCalOpen(false)} />)}<span className="text-xs opacity-80">• Priority: {t.priority}</span></div>
          <div className="flex gap-2 mt-2"><Button variant="outline" onClick={()=>onSetStatus?.(t.id,'Done')}>Mark Done</Button>{isOverdue(t.due)&&(<Button variant="outline" onClick={()=>onUpdate?.(t.id,{ due: addDays(todayISO(),1) })}>Snooze +1d</Button>)}<Button variant="outline" className="text-red-300" onClick={()=>onDelete(t.id)}>Delete</Button></div>
          {isOverdue(t.due) && <div className="mt-2 text-xs text-red-300">Overdue</div>}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2"><div className="font-semibold text-yellow-300">To Do</div><span className="text-xs opacity-80">{todos.length}</span><Button variant="outline" className="ml-auto" onClick={()=>setShowDone(!showDone)}>{showDone?'Hide Done':'Show Done'}</Button></div>
        <div className="bg-black/30 border border-yellow-500/20 rounded-2xl p-3"><div className="space-y-2">{todos.map(t=> <TaskItem key={t.id} t={t} />)}{todos.length===0 && <div className="text-sm opacity-80">All clear! No To Do items.</div>}</div></div>
        {showDone && (<div className="bg-black/30 border border-green-500/20 rounded-2xl p-3"><div className="font-semibold text-green-300 mb-2">Done <span className="text-xs opacity-80">{dones.length}</span></div><div className="space-y-2">{dones.length===0 && <div className="text-sm opacity-80">No completed tasks yet.</div>}{dones.map(t=> (<div key={t.id} className="rounded-xl border border-green-500/20 bg-black/40 p-3"><div className="font-medium text-green-100 line-through">{t.title}</div><div className="text-xs opacity-60 mt-1">Due {fmtDMY(t.due)}</div></div>))}</div></div>)}
        <div className="bg-black/30 border border-yellow-500/20 rounded-2xl p-3" ref={calWrapRef}><div className="font-semibold text-yellow-300 mb-2">+ Add Task</div><div className="space-y-2"><Input placeholder="Title" value={draft.title} onChange={(e)=>setDraft({ ...draft, title:e.target.value })} /><div className="flex items-center gap-2 flex-wrap"><div className="relative"><Input type="text" readOnly className="pr-10 select-none pointer-events-none" value={fmtDMY(draft.due)} /><button type="button" aria-label="Open calendar" onClick={()=>setCalOpen(!calOpen)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 border border-yellow-500/30 rounded-lg p-1 hover:bg-black/60"><CalendarIcon className="w-5 h-5" /></button>{calOpen && (<CalendarPopover valueISO={draft.due} onSelect={(iso)=>setDraft({ ...draft, due: iso })} onClose={()=>setCalOpen(false)} />)}</div><select value={draft.priority} onChange={(e)=>setDraft({ ...draft, priority:e.target.value })} className="px-3 py-2 rounded-xl bg-black/40 border border-yellow-500/30 text-yellow-100"><option>Low</option><option>Medium</option><option>High</option></select></div><Button className="w-full" onClick={()=>{ if(!draft.title) return; onAdd({ ...draft }); setDraft({ ...draft, title:'' }); }}>Create</Button></div></div>
      </div>
    );
  }

  // ------------------- Apiaries
  function Row({ k, v }){ return (<div className="flex items-center justify-between px-3 py-2 rounded-xl border border-yellow-500/20 bg-black/30"><span className="opacity-80">{k}</span><span className="font-medium">{String(v)}</span></div>); }
  function Apiaries(){
    const [selectedIds,setSelectedIds] = useState(new Set());
    const [openId,setOpenId] = useState(null);
    const [showConfirm,setShowConfirm] = useState(false);
    const [query,setQuery] = useState('');
    const [qaOpen,setQaOpen] = useState(false);
    const [qaCalOpen,setQaCalOpen] = useState(false);
    const [qaDraft,setQaDraft] = useState({ title:'', due:todayISO(), priority:'Medium' });
    const qaRef = useRef(null);
    useEffect(()=>{ if(!qaCalOpen && !qaOpen) return; const handler=(e)=>{ const root=qaRef.current; if(root && !root.contains(e.target)) setQaCalOpen(false); }; document.addEventListener('mousedown',handler); document.addEventListener('touchstart',handler,{passive:true}); return ()=>{ document.removeEventListener('mousedown',handler); document.removeEventListener('touchstart',handler); }; }, [qaCalOpen, qaOpen]);
    const lc=(s)=>String(s??'').toLowerCase().trim();
    const filtered = useMemo(()=>{ const q=lc(query); if(!q) return hives; return hives.filter(h=> lc(h.name).includes(q) || lc(h.id).includes(q)); }, [hives,query]);
    const toggleSelect=(id,checked)=>{ setSelectedIds(prev=>{ const next=new Set(prev); if(checked) next.add(id); else next.delete(id); return next; }); };
    const confirmDelete=()=>{ if(selectedIds.size===0){ setShowConfirm(false); return; } setHives(hives.filter(h=>!selectedIds.has(h.id))); if(openId && selectedIds.has(openId)) setOpenId(null); setSelectedIds(new Set()); setShowConfirm(false); };
    const selectedNames = hives.filter(h=>selectedIds.has(h.id)).map(h=>h.name);
    const current = hives.find(h=>h.id===openId) || null;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button onClick={()=>setShowNewHive(true)}>+ Add Apiary</Button>
            <Button onClick={()=>setShowConfirm(true)} disabled={selectedIds.size===0} className={selectedIds.size? 'bg-red-500 text-black hover:bg-red-400' : ''} variant={selectedIds.size? 'solid':'outline'}>Delete</Button>
          </div>
          <div className="relative">
            <Input aria-label="Search apiaries" placeholder="Search apiaries..." value={query} onChange={(e)=>setQuery(e.target.value)} />
            {query && <button className="absolute right-2 top-1/2 -translate-y-1/2 text-yellow-300 text-xs" onClick={()=>setQuery('')}>Clear</button>}
          </div>
          <div className="text-xs opacity-70">{filtered.length} of {hives.length} shown</div>
          <div className="rounded-2xl border border-yellow-500/20 bg-black/40 divide-y divide-yellow-500/10 max-h-[60vh] overflow-auto">
            {filtered.length===0 ? (<div className="px-3 py-2 text-sm opacity-70">No matches</div>) : (
              filtered.map(h => (
                <div key={`list-${h.id}`} className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-black/50 ${selectedIds.has(h.id)?'bg-black/50':''}`}
                  onClick={(e)=>{ const tag=(e.target && e.target.tagName || '').toLowerCase(); if(tag!=='input'){ setOpenId(h.id); setQaOpen(false); setQaCalOpen(false);} }}>
                  <input type="checkbox" checked={selectedIds.has(h.id)} onClick={(e)=>e.stopPropagation()} onChange={(e)=>toggleSelect(h.id,e.target.checked)} />
                  <span className="truncate">{h.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          {!current && (<Card><CardHeader><CardTitle>Select an apiary</CardTitle></CardHeader><CardContent className="text-sm opacity-80">Choose an apiary from the list to view its details here.</CardContent></Card>)}
          {current && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="flex flex-col">
                  <CardTitle>{current.name}</CardTitle>
                  <div className="text-xs text-yellow-300/80 mt-1">Last Update: {fmtDMY(current.lastInspection || todayISO())}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={()=>setQaOpen(v=>!v)}>{qaOpen ? 'Close' : 'Add Task'}</Button>
                  <Button variant="outline" onClick={()=>setEditing(current)}>Edit</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-yellow-100/90">
                {qaOpen && (
                  <div className="mb-3 p-3 rounded-xl border border-yellow-500/30 bg-black/30" ref={qaRef}>
                    <div className="font-semibold text-yellow-300 mb-2">Quick Add Task</div>
                    <div className="flex items-center gap-2 flex-wrap relative">
                      <Input placeholder="Title" value={qaDraft.title} onChange={(e)=>setQaDraft({ ...qaDraft, title:e.target.value })} />
                      <div className="relative">
                        <Input type="text" readOnly className="pr-10 select-none pointer-events-none" value={fmtDMY(qaDraft.due)} />
                        <button type="button" aria-label="Open calendar" onClick={()=>setQaCalOpen(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 border border-yellow-500/30 rounded-lg p-1 hover:bg-black/60"><CalendarIcon className="w-5 h-5" /></button>
                        {qaCalOpen && (<CalendarPopover valueISO={qaDraft.due} onSelect={(iso)=>{ setQaDraft({ ...qaDraft, due: iso }); setQaCalOpen(false); }} onClose={()=>setQaCalOpen(false)} />)}
                      </div>
                      <select value={qaDraft.priority} onChange={(e)=>setQaDraft({ ...qaDraft, priority:e.target.value })} className="px-3 py-2 rounded-xl bg-black/40 border border-yellow-500/30 text-yellow-100"><option>Low</option><option>Medium</option><option>High</option></select>
                      <Button onClick={()=>{ if(!qaDraft.title) return; addTask({ id:`T-${Date.now()}`, title:qaDraft.title, hiveId:current.id, due:qaDraft.due, priority:qaDraft.priority }); setQaDraft({ title:'', due:todayISO(), priority:'Medium' }); setQaOpen(false); }}>Create</Button>
                    </div>
                  </div>
                )}
                <Row k="Strength" v={current.strength} />
                <Row k="Queenless Hives" v={current.queenlessHives ?? 0} />
                <Row k="Number of Hives" v={current.numHives} />
                <Row k="Single Hives" v={current.singleHives} />
                <Row k="Double Hives" v={current.doubleHives} />
                <Row k="Nucs" v={current.nucs ?? 0} />
                {(current.notes && String(current.notes).trim().length>0) ? (
                  <div className="pt-2"><div className="text-xs uppercase tracking-wide text-yellow-300/80">Comments</div><div className="mt-1 whitespace-pre-wrap text-lg leading-relaxed">{current.notes}</div></div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
        {showConfirm && (<div className="fixed inset-0 bg-black/70 grid place-items-center p-4 z-50"><div className="w-full max-w-md rounded-2xl border border-yellow-500/30 bg-black text-yellow-100 p-4"><div className="text-yellow-200 font-semibold mb-2">Delete {selectedIds.size} {selectedIds.size===1?'apiary':'apiaries'}?</div><div className="text-sm opacity-80 mb-3">This action cannot be undone.</div>{selectedNames.length>0 && <div className="text-xs opacity-80 mb-3">{selectedNames.join(', ')}</div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowConfirm(false)}>Cancel</Button><Button className="bg-red-500 text-black hover:bg-red-400" onClick={confirmDelete}>Delete</Button></div></div></div>)}
      </div>
    );
  }

  // ------------------- Modals (Add/Edit Apiary)
  function FieldError({ msg }){ return msg ? <div className="text-xs text-red-300 mt-0.5">{msg}</div> : null; }
  function NewApiaryModal(){ const [form,setForm]=useState({ name:"", strength:"Moderate", numHives:0, singleHives:0, doubleHives:0, queenlessHives:0, nucs:0, notes:"" }); const { valid, errors }=validateApiary(form); if(!showNewHive) return null; return (<div className="fixed inset-0 bg-black/70 grid place-items-center p-4"><div className="w-full max-w-lg rounded-2xl border border-yellow-500/30 bg-black text-yellow-100 p-4"><div className="text-yellow-200 font-semibold mb-2">Add Apiary</div><div className="grid grid-cols-2 gap-2"><label className="col-span-2 text-sm">Name<Input value={form.name} onChange={(e)=>setForm({ ...form, name:e.target.value })} /><FieldError msg={errors.name} /></label><label className="text-sm">Queenless Hives<Input type="number" min={0} value={form.queenlessHives} onChange={(e)=>setForm({ ...form, queenlessHives: toInt(e.target.value) })} /><FieldError msg={errors.queenlessHives} /></label><label className="text-sm">Strength<select value={form.strength} onChange={(e)=>setForm({ ...form, strength:e.target.value })} className="w-full px-3 py-2 rounded-xl bg-black/40 border border-yellow-500/30 text-yellow-100"><option>Weak</option><option>Moderate</option><option>Strong</option></select></label><label className="text-sm col-span-2">Number of Hives<Input type="number" min={0} value={form.numHives} onChange={(e)=>setForm({ ...form, numHives: toInt(e.target.value) })} /><FieldError msg={errors.numHives} /></label><label className="text-sm">Single Hives<Input type="number" min={0} value={form.singleHives} onChange={(e)=>setForm({ ...form, singleHives: toInt(e.target.value) })} /><FieldError msg={errors.singleHives} /></label><label className="text-sm">Double Hives<Input type="number" min={0} value={form.doubleHives} onChange={(e)=>setForm({ ...form, doubleHives: toInt(e.target.value) })} /><FieldError msg={errors.doubleHives} /></label><label className="text-sm">Nucs<Input type="number" min={0} value={form.nucs} onChange={(e)=>setForm({ ...form, nucs: toInt(e.target.value) })} /></label><label className="col-span-2 text-sm">Notes<Textarea value={form.notes} onChange={(e)=>setForm({ ...form, notes:e.target.value })} /></label></div><div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={()=>setShowNewHive(false)}>Cancel</Button><Button disabled={!valid} onClick={()=>{ addHive(form); setShowNewHive(false); }}>Create Apiary</Button></div></div></div>); }
  function EditApiaryModal(){ const h=editing; const [form,setForm]=useState(()=> (h ? { nucs:0, queenlessHives:0, ...h } : null)); const [errs,setErrs]=useState({}); useEffect(()=>{ if(editing){ setForm({ ...editing }); setErrs({}); } }, [editing]); if(!h || !form) return null; const handleSave=()=>{ const { valid, errors, values }=validateApiary(form); setErrs(errors); if(!valid) return; updateHive(h.id,{ ...values, lastInspection: todayISO() }); setEditing(null); }; const { valid }=validateApiary(form); return (<div className="fixed inset-0 bg-black/70 grid place-items-center p-4"><div className="w-full max-w-xl rounded-2xl border border-yellow-500/30 bg-black text-yellow-100 p-4"><div className="text-yellow-200 font-semibold mb-2">Edit {h.name}</div><div className="grid grid-cols-2 gap-2"><label className="col-span-2 text-sm">Name<Input value={form.name} onChange={(e)=>setForm({ ...form, name:e.target.value })} /><FieldError msg={errs.name} /></label><label className="text-sm">Queenless Hives<Input type="number" min={0} value={form.queenlessHives} onChange={(e)=>setForm({ ...form, queenlessHives: toInt(e.target.value) })} /><FieldError msg={errs.queenlessHives} /></label><label className="text-sm">Strength<select value={form.strength} onChange={(e)=>setForm({ ...form, strength:e.target.value })} className="w-full px-3 py-2 rounded-xl bg-black/40 border border-yellow-500/30 text-yellow-100"><option>Weak</option><option>Moderate</option><option>Strong</option></select></label><label className="text-sm col-span-2">Number of Hives<Input type="number" min={0} value={form.numHives} onChange={(e)=>setForm({ ...form, numHives: toInt(e.target.value) })} /><FieldError msg={errs.numHives} /></label><label className="text-sm">Single Hives<Input type="number" min={0} value={form.singleHives} onChange={(e)=>setForm({ ...form, singleHives: toInt(e.target.value) })} /><FieldError msg={errs.singleHives} /></label><label className="text-sm">Double Hives<Input type="number" min={0} value={form.doubleHives} onChange={(e)=>setForm({ ...form, doubleHives: toInt(e.target.value) })} /><FieldError msg={errs.doubleHives} /></label><label className="text-sm">Nucs<Input type="number" min={0} value={form.nucs} onChange={(e)=>setForm({ ...form, nucs: toInt(e.target.value) })} /></label><label className="col-span-2 text-sm">Notes<Textarea value={form.notes} onChange={(e)=>setForm({ ...form, notes:e.target.value })} /></label></div><div className="flex justify-end gap-2 mt-3"><Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button><Button onClick={handleSave} disabled={!valid}>Save</Button></div></div></div>); }

  // ------------------- Render
  return (
    <div className="p-6 text-yellow-200">
      <div className="flex items-center justify-between mb-4">
        <div className="inline-flex gap-2">{['dashboard','apiaries','settings'].map(k => (<button key={k} onClick={()=>setTab(k)} className={`px-3 py-2 rounded-xl ${tab===k? 'bg-yellow-500 text-black':'bg-black/40'}`}>{k[0].toUpperCase()+k.slice(1)}</button>))}</div>
        <div className="flex items-center gap-2">
          <input type="file" accept="application/json" ref={jsonFileRef} onChange={doImport} className="hidden" />
          <input type="file" accept=".csv,text/csv" ref={csvFileRef} onChange={doImportCSV} className="hidden" />
          <Button variant="outline" onClick={()=>jsonFileRef.current?.click()}>Import (JSON)</Button>
          <Button variant="outline" onClick={()=>csvFileRef.current?.click()}>Import (CSV)</Button>
          <Button onClick={doExport}>Export (JSON)</Button>
          <Button onClick={doExportCSV}>Export (CSV)</Button>
        </div>
      </div>
      {importMsg && <div className="mb-3 text-xs opacity-80">{importMsg}</div>}
      {tab==='dashboard' && <Dashboard />}
      {tab==='apiaries' && <Apiaries />}
      {tab==='settings' && (
        <Card><CardHeader><CardTitle>Settings</CardTitle></CardHeader><CardContent className="text-sm opacity-80">No extra settings yet.</CardContent></Card>
      )}
      <NewApiaryModal />
      <EditApiaryModal />
    </div>
  );
}

// Make it globally visible for index.html mount script
if (typeof window !== 'undefined') { window.BeekeepingApp = BeekeepingApp; }
