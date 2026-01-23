/* --------------------------------
   Dashboard: Exercise + Finance
----------------------------------*/

/* ===== Storage Keys (existing) ===== */
const KEY_LEVEL = 'levelUp:characterLevel';
const KEY_TRANSFORMS = 'levelUp:transformCount';
const KEY_EX_RESET_AT = 'levelUp:exerciseResetAt';
const todayISO = new Date().toISOString().slice(0,10);

/* ===== Exercise Threshold ===== */
const EX_MAX = 50000;

/* ===== Finance Threshold (for Fin vertical bar only) =====
   This does NOT affect your finance page — just maps monthly spend into a %.
   You can tune later.
*/
const FIN_MAX = 2000;

/* ===== Finance State ===== */
const financeState = {
  tab: 'all',                // 'all' | 'groceries'
  hideMortgage: false,
  hideUtilities: false,
  chart: null,
};

/* --------------------------------
   Utilities
----------------------------------*/
function $(id){ return document.getElementById(id); }

function pct(now, max){
  if(max <= 0) return 0;
  return Math.max(0, Math.min(100, (now / max) * 100));
}

function setText(id, text){
  const el = $(id);
  if(el) el.textContent = text;
}

function setWidth(id, percent){
  const el = $(id);
  if(el) el.style.width = percent.toFixed(1) + '%';
}

function setHeight(id, percent){
  const el = $(id);
  if(el) el.style.height = percent.toFixed(1) + '%';
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function formatMoney(n){
  const v = Number(n) || 0;
  return '$' + Math.round(v).toLocaleString();
}

function formatMoney2(n){
  const v = Number(n) || 0;
  return '$' + v.toFixed(2);
}

/* --------------------------------
   Character Level
----------------------------------*/
function getLevel(){
  const v = Number(localStorage.getItem(KEY_LEVEL));
  return (Number.isFinite(v) && v > 0) ? Math.floor(v) : 1;
}
function setLevel(n){
  localStorage.setItem(KEY_LEVEL, String(Math.max(1, Math.floor(n))));
}
function getTransformCount(){
  const v = Number(localStorage.getItem(KEY_TRANSFORMS));
  return (Number.isFinite(v) && v >= 0) ? Math.floor(v) : 0;
}
function setTransformCount(n){
  localStorage.setItem(KEY_TRANSFORMS, String(Math.max(0, Math.floor(n))));
}

/* --------------------------------
   Exercise: read existing workout schema (powerUp:YYYY-MM-DD)
----------------------------------*/
function listWorkoutKeys(){
  const keys = [];
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(/^powerUp:\d{4}-\d{2}-\d{2}$/.test(k)) keys.push(k);
  }
  return keys;
}

function safeParse(key){
  try { return JSON.parse(localStorage.getItem(key)); }
  catch { return null; }
}

function normalizeDay(raw){
  if(!raw || !raw.date) return null;
  const exercises = Array.isArray(raw.exercises) ? raw.exercises : [];
  return {
    date: String(raw.date),
    exercises: exercises.map(ex => ({
      name: String(ex.name || ex.exercise || 'Exercise'),
      bodyPart: String(ex.bodyPart || ex.muscle || ex.group || 'Other'),
      sets: Array.isArray(ex.sets) ? ex.sets.map(s => ({
        weight: Number(s.weight) || 0,
        reps: Number(s.reps) || 0,
        done: !!s.done || !!s.completed
      })) : []
    }))
  };
}

function dayTotals(day){
  let sets = 0;
  let volume = 0;
  let moves = 0;

  (day.exercises || []).forEach(ex => {
    if(ex.sets && ex.sets.length) moves++;
    (ex.sets || []).forEach(s => {
      if((s.weight > 0) || (s.reps > 0)) sets++;
      if(s.weight > 0 && s.reps > 0) volume += (s.weight * s.reps);
    });
  });

  return { sets, volume, moves };
}

function getAllWorkouts(){
  const days = [];
  listWorkoutKeys().forEach(k => {
    const raw = safeParse(k);
    const day = normalizeDay(raw);
    if(!day) return;

    const totals = dayTotals(day);
    const logged = (day.exercises && day.exercises.length) || totals.sets > 0 || totals.volume > 0;
    if(logged) days.push(day);
  });

  days.sort((a,b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return days;
}

function getLatestWorkout(){
  const all = getAllWorkouts();
  return all.length ? all[all.length - 1] : null;
}

function getExerciseResetAt(){
  const v = localStorage.getItem(KEY_EX_RESET_AT);
  return (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '1900-01-01';
}

function volumeSince(isoDate){
  const all = getAllWorkouts();
  let total = 0;
  all.forEach(day => {
    if(day.date > isoDate){
      total += dayTotals(day).volume;
    }
  });
  return Math.round(total);
}

function flashTransform(){
  const frame = $('characterFrame');
  if(!frame) return;
  frame.classList.remove('transforming');
  void frame.offsetWidth;
  frame.classList.add('transforming');
  setTimeout(()=>frame.classList.remove('transforming'), 950);
}

function doExerciseTransform(){
  const exPower = volumeSince(getExerciseResetAt());
  if(exPower < EX_MAX) return;

  setLevel(getLevel() + 1);
  setTransformCount(getTransformCount() + 1);

  // reset dashboard meter only
  localStorage.setItem(KEY_EX_RESET_AT, todayISO);

  flashTransform();
  renderAll();
}

/* --------------------------------
   Finance: REAL adapter (finances:receipts)
   - matches receipts.html storage + shape
----------------------------------*/
const FIN_STORAGE_KEY = 'finances:receipts';

async function ensureFinanceSeeded(){
  // If your finance module has a loader that seeds localStorage on first load,
  // this will wait for it (same pattern used in receipts.html).
  try{
    await (window.FinancesDataLoader?.ready || Promise.resolve());
  }catch(e){
    // non-fatal
    console.warn('[finance] dataLoader ready wait failed:', e);
  }
}

function loadFinanceReceipts(){
  try{
    return JSON.parse(localStorage.getItem(FIN_STORAGE_KEY) || '[]');
  }catch(e){
    console.error('[finance] failed to parse finances:receipts', e);
    return [];
  }
}

function parseYMD(dateStr){
  // accepts "YYYY-MM-DD" or ISO-like; returns YYYY-MM-DD or null
  if(!dateStr) return null;
  if(typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const dt = new Date(dateStr);
  if(!isNaN(dt.getTime())) return dt.toISOString().slice(0,10);
  return null;
}

function thisMonthRange(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const start = `${y}-${m}-01`;
  const endDt = new Date(y, now.getMonth()+1, 1); // exclusive
  const end = endDt.toISOString().slice(0,10);
  return { start, end };
}

function receiptsToEntries(receipts){
  // Normalize into "entries" that the donut can aggregate:
  // entry: { date, amount, category, subcategory }
  const out = [];

  receipts.forEach(r => {
    const date = parseYMD(r.date || r.purchaseDate || r.createdAt);
    if(!date) return;

    // If items exist, treat each item as an entry (category/subcategory)
    if(Array.isArray(r.items) && r.items.length){
      r.items.forEach(it => {
        const qty = Number(it.quantity ?? 1) || 1;
        const price = Number(it.price ?? it.amount ?? it.cost ?? 0) || 0;
        const amount = price * qty;

        // fallbacks: item.category/subcategory, then receipt.category
        const category = String(it.category ?? r.category ?? 'Other').trim() || 'Other';
        const subcategory = String(it.subcategory ?? it.subCategory ?? it.type ?? '').trim();

        if(amount > 0){
          out.push({ date, amount, category, subcategory });
        }
      });
      return;
    }

    // Otherwise treat receipt itself as one entry (use receipt.category)
    const amount = Number(r.total ?? r.amount ?? r.cost ?? 0) || 0;
    const category = String(r.category ?? 'Other').trim() || 'Other';
    const subcategory = String(r.subcategory ?? r.subCategory ?? r.type ?? r.store ?? '').trim();

    if(amount > 0){
      out.push({ date, amount, category, subcategory });
    }
  });

  return out;
}

function filterThisMonth(entries){
  const { start, end } = thisMonthRange();
  return entries.filter(e => e.date >= start && e.date < end);
}

function isMortgageCat(cat){
  const c = String(cat || '').toLowerCase();
  return c.includes('mortgage');
}
function isUtilitiesCat(cat){
  const c = String(cat || '').toLowerCase();
  return c.includes('utilit') || c.includes('electric') || c.includes('gas') || c.includes('water') || c.includes('internet');
}
function isGroceriesCat(cat){
  const c = String(cat || '').toLowerCase();
  return c.includes('groc');
}

function applyFinanceFilters(entries){
  let out = [...entries];

  // Tab: all vs groceries
  if(financeState.tab === 'groceries'){
    out = out.filter(e => isGroceriesCat(e.category) || isGroceriesCat(e.subcategory));
  }

  if(financeState.hideMortgage){
    out = out.filter(e => !isMortgageCat(e.category));
  }
  if(financeState.hideUtilities){
    out = out.filter(e => !isUtilitiesCat(e.category));
  }

  return out;
}

function sumByCategory(entries){
  const map = new Map();
  for(const e of entries){
    const k = e.category || 'Other';
    map.set(k, (map.get(k) || 0) + (Number(e.amount) || 0));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a,b)=>b.value-a.value);
}

function sumByGroceriesSubcategory(entries){
  const map = new Map();
  for(const e of entries){
    const k = e.subcategory || 'Groceries';
    map.set(k, (map.get(k) || 0) + (Number(e.amount) || 0));
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a,b)=>b.value-a.value);
}

function palette(n){
  const base = [
    '#22c55e','#60a5fa','#f59e0b','#a78bfa','#fb7185',
    '#2dd4bf','#c026d3','#a3a3a3','#34d399','#38bdf8',
  ];
  const out = [];
  for(let i=0; i<n; i++) out.push(base[i % base.length]);
  return out;
}

function destroyFinanceChart(){
  try{
    if(financeState.chart){
      financeState.chart.destroy();
      financeState.chart = null;
    }
  }catch(e){
    financeState.chart = null;
  }
}

function renderFinanceDonut(){
  const emptyEl = $('financeEmpty');
  const legendEl = $('financeLegend');
  const canvas = $('financeDonut');

  if(!legendEl || !canvas){
    return;
  }

  // Chart.js availability
  if(typeof Chart === 'undefined'){
    if(emptyEl){
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = `Chart.js not loaded. Add the Chart.js script tag in <b>main.html</b>.`;
    }
    legendEl.innerHTML = '';
    return;
  }

  const receipts = loadFinanceReceipts();
  const entriesAll = filterThisMonth(receiptsToEntries(receipts));
  const entries = applyFinanceFilters(entriesAll);

  const rows = (financeState.tab === 'groceries')
    ? sumByGroceriesSubcategory(entries)
    : sumByCategory(entries);

  const total = rows.reduce((s,r)=>s+r.value, 0);
  setText('financeTotal', formatMoney(total));
  setText('financeTotalLabel', 'Total');

  // Empty state
  if(!rows.length){
    destroyFinanceChart();
    if(emptyEl){
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = `No finance data found for <b>this month</b>.<br/>Add receipts and this donut will populate automatically.`;
    }
    legendEl.innerHTML = '';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  const labels = rows.map(r => r.name);
  const values = rows.map(r => r.value);
  const colors = palette(rows.length);

  // Legend
  legendEl.innerHTML = rows.map((r, i) => `
    <div class="legend-row" title="${escapeHtml(r.name)}">
      <div class="legend-left">
        <span class="swatch" style="background:${colors[i]}"></span>
        <div class="legend-name">${escapeHtml(r.name)}</div>
      </div>
      <div class="legend-right">${formatMoney2(r.value)}</div>
    </div>
  `).join('');

  // Chart
  destroyFinanceChart();
  financeState.chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = Number(ctx.raw || 0);
              const pctVal = total > 0 ? Math.round((v / total) * 100) : 0;
              return ` ${ctx.label}: ${formatMoney2(v)} (${pctVal}%)`;
            }
          }
        }
      }
    }
  });

  // Update FIN vertical bar power based on monthly total
  setHeight('modFinFill', pct(total, FIN_MAX));
}

/* --------------------------------
   Render: top + modules + history
----------------------------------*/
function renderTop(){
  setText('overallLevel', 'Lv ' + getLevel());
}

function renderModulesAndCharacter(){
  const exPower = volumeSince(getExerciseResetAt());

  setText('exPowerNow', exPower.toLocaleString());
  setText('exPowerMax', EX_MAX.toLocaleString());
  setWidth('exFill', pct(exPower, EX_MAX));

  setHeight('modExFill', pct(exPower, EX_MAX));

  // Study fill: (placeholder until you wire study power)
  setHeight('modStudyFill', 0);

  const ready = exPower >= EX_MAX && EX_MAX > 0;
  const statusText = $('statusText');
  const dot = $('statusDot');
  const btn = $('exTransform');

  if(statusText) statusText.textContent = ready ? 'READY' : 'Charging';
  if(dot) dot.classList.toggle('ready', ready);

  if(btn){
    btn.classList.toggle('ready', ready);
    btn.disabled = !ready;
    btn.style.cursor = ready ? 'pointer' : 'not-allowed';
  }
}

function renderHistory(){
  const container = $('historyBody');
  const summary = $('historySummary');

  const latest = getLatestWorkout();
  if(!latest){
    if(summary) summary.style.display = 'none';
    if(container){
      container.innerHTML = `
        <div class="empty">
          No workout data found yet.<br/>
          Start logging workouts in <b>Power Up</b> and your latest workout will appear here automatically.
        </div>
      `;
    }
    return;
  }

  const totals = dayTotals(latest);

  if(summary) summary.style.display = 'flex';
  setText('hDate', new Date(latest.date + 'T12:00:00').toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}));
  setText('hMoves', String(totals.moves));
  setText('hSets', String(totals.sets));
  setText('hVol', totals.volume.toLocaleString() + ' lb');

  const rows = [];
  latest.exercises.forEach(ex => {
    const sets = (ex.sets || []).filter(s => (s.weight > 0 || s.reps > 0)).length;
    const vol = (ex.sets || []).reduce((sum, s) => sum + ((s.weight>0 && s.reps>0) ? (s.weight*s.reps) : 0), 0);
    if(sets === 0 && vol === 0) return;

    rows.push(`
      <div class="ex-row">
        <div>
          <div class="n">${escapeHtml(ex.name)}</div>
          <div class="m">${escapeHtml(ex.bodyPart)} • ${sets} set(s)</div>
        </div>
        <div class="r">
          ${Math.round(vol).toLocaleString()} lb
          <small>volume</small>
        </div>
      </div>
    `);
  });

  if(container){
    container.innerHTML = `
      <div class="exercise-list">
        ${rows.length ? rows.join('') : `<div class="empty">Workout found, but sets are empty.</div>`}
      </div>
    `;
  }
}

/* --------------------------------
   UI Bindings
----------------------------------*/
function bindNav(){
  const go = (url)=>{ location.href = url; };

  const modExercise = $('modExercise');
  const modStudy = $('modStudy');
  const modFin = $('modFin');

  if(modExercise){
    modExercise.addEventListener('click', ()=> go('./powerUp/index.html'));
    modExercise.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') go('./powerUp/index.html'); });
  }
  if(modStudy){
    // update this path to your real study page if different
    modStudy.addEventListener('click', ()=> go('./study/studyHome.html'));
    modStudy.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') go('./study/studyHome.html'); });
  }
  if(modFin){
    // update this path to your real finance page if different
    modFin.addEventListener('click', ()=> go('./finances/index.html'));
    modFin.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') go('./finances/index.html'); });
  }
}

function setFinanceBtnStates(){
  const tabAll = $('financeTabAll');
  const tabGro = $('financeTabGroceries');
  const hm = $('financeHideMortgage');
  const hu = $('financeHideUtilities');

  if(tabAll) tabAll.classList.toggle('active', financeState.tab === 'all');
  if(tabGro) tabGro.classList.toggle('active', financeState.tab === 'groceries');

  if(hm) hm.classList.toggle('active', !!financeState.hideMortgage);
  if(hu) hu.classList.toggle('active', !!financeState.hideUtilities);
}

function bindButtons(){
  const refreshBtn = $('refreshBtn');
  if(refreshBtn) refreshBtn.addEventListener('click', ()=>location.reload());

  const exTransform = $('exTransform');
  if(exTransform) exTransform.addEventListener('click', doExerciseTransform);

  const openExercise = $('openExercise');
  if(openExercise){
    openExercise.addEventListener('click', ()=>{
      const latest = getLatestWorkout();
      if(latest) location.href = `./powerUp/workout.html?date=${latest.date}`;
      else location.href = './powerUp/index.html';
    });
  }

  const openAnalytics = $('openAnalytics');
  if(openAnalytics){
    openAnalytics.addEventListener('click', ()=> location.href = './powerUp/analytics.html');
  }

  // Finance buttons
  const tabAll = $('financeTabAll');
  const tabGro = $('financeTabGroceries');
  const hm = $('financeHideMortgage');
  const hu = $('financeHideUtilities');
  const reset = $('financeReset');

  if(tabAll){
    tabAll.addEventListener('click', ()=>{
      financeState.tab = 'all';
      setFinanceBtnStates();
      renderFinanceDonut();
    });
  }
  if(tabGro){
    tabGro.addEventListener('click', ()=>{
      financeState.tab = 'groceries';
      setFinanceBtnStates();
      renderFinanceDonut();
    });
  }

  if(hm){
    hm.addEventListener('click', ()=>{
      financeState.hideMortgage = !financeState.hideMortgage;
      setFinanceBtnStates();
      renderFinanceDonut();
    });
  }

  if(hu){
    hu.addEventListener('click', ()=>{
      financeState.hideUtilities = !financeState.hideUtilities;
      setFinanceBtnStates();
      renderFinanceDonut();
    });
  }

  if(reset){
    reset.addEventListener('click', ()=>{
      financeState.tab = 'all';
      financeState.hideMortgage = false;
      financeState.hideUtilities = false;
      setFinanceBtnStates();
      renderFinanceDonut();
    });
  }
}

/* --------------------------------
   Render All
----------------------------------*/
function renderAll(){
  renderTop();
  renderModulesAndCharacter();
  renderHistory();
  setFinanceBtnStates();
  renderFinanceDonut();
}

/* --------------------------------
   Init
----------------------------------*/
(async function init(){
  bindNav();
  bindButtons();

  // ensure finances seeded before first render
  await ensureFinanceSeeded();

  renderAll();
})();
