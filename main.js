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

/* ===== Finance Threshold (for Fin vertical bar only) ===== */
const FIN_MAX = 2000;

/* ===== Nutrition shared state (set by renderNutritionCard, read by renderModulesAndCharacter) ===== */
let lastNutritionCal = 0;

/* ===== Finance State ===== */
const financeState = {
  chart: null,
  monthOffset: 0,      // 0 = current month, -1 = previous, etc.
  chartVisible: true,
  category: 'all',     // active filter: 'all', 'groc', 'rental', 'cafe'
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
----------------------------------*/
const FIN_STORAGE_KEY = 'finances:receipts';

async function ensureFinanceSeeded(){
  try{
    await (window.FinancesDataLoader?.ready || Promise.resolve());
  }catch(e){
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
  if(!dateStr) return null;
  if(typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const dt = new Date(dateStr);
  if(!isNaN(dt.getTime())) return dt.toISOString().slice(0,10);
  return null;
}

function monthRangeFromOffset(offset){
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const y = base.getFullYear();
  const m = String(base.getMonth()+1).padStart(2,'0');
  const start = `${y}-${m}-01`;
  const endDt = new Date(y, base.getMonth()+1, 1);
  const end = endDt.toISOString().slice(0,10);
  const label = base.toLocaleString('en-US', { month: 'long', year: (y !== now.getFullYear() ? 'numeric' : undefined) });
  return { start, end, label, year: y, month: base.getMonth() };
}

function getMonthLabel(offset){
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const sameYear = base.getFullYear() === now.getFullYear();
  const m = base.toLocaleString('en-US', { month: 'long' });
  return sameYear ? m : `${m} ${base.getFullYear()}`;
}

function receiptsToEntries(receipts){
  const out = [];

  receipts.forEach(r => {
    const date = parseYMD(r.date || r.purchaseDate || r.createdAt);
    if(!date) return;

    if(Array.isArray(r.items) && r.items.length){
      r.items.forEach(it => {
        const qty = Number(it.quantity ?? 1) || 1;
        const price = Number(it.price ?? it.amount ?? it.cost ?? 0) || 0;
        const amount = price * qty;

        const category = String(it.category ?? r.category ?? 'Other').trim() || 'Other';
        const subcategory = String(it.subcategory ?? it.subCategory ?? it.type ?? '').trim();

        if(amount > 0){
          out.push({ date, amount, category, subcategory });
        }
      });
      return;
    }

    const amount = Number(r.total ?? r.amount ?? r.cost ?? 0) || 0;
    const category = String(r.category ?? 'Other').trim() || 'Other';
    const subcategory = String(r.subcategory ?? r.subCategory ?? r.type ?? r.store ?? '').trim();

    if(amount > 0){
      out.push({ date, amount, category, subcategory });
    }
  });

  return out;
}

function filterByMonthOffset(entries, offset){
  const { start, end } = monthRangeFromOffset(offset);
  return entries.filter(e => e.date >= start && e.date < end);
}

function isGroceriesCat(cat){
  const c = String(cat || '').toLowerCase();
  return c.includes('groc');
}

function filterGroceries(entries){
  return entries.filter(e => isGroceriesCat(e.category) || isGroceriesCat(e.subcategory));
}

function isRentalCat(cat){
  const c = String(cat || '').toLowerCase();
  return c.includes('rent') || c.includes('mortgage') || c.includes('housing') || c.includes('utilit');
}

function isCafeCat(cat){
  const c = String(cat || '').toLowerCase();
  return c.includes('cafe') || c.includes('restaurant') || c.includes('dining') || c.includes('food service') || c.includes('takeout') || c.includes('fast food');
}

function filterByActiveCategory(entries){
  const cat = financeState.category;
  if(cat === 'all') return entries;
  if(cat === 'groc') return filterGroceries(entries);
  if(cat === 'rental') return entries.filter(e => isRentalCat(e.category) || isRentalCat(e.subcategory));
  if(cat === 'cafe') return entries.filter(e => isCafeCat(e.category) || isCafeCat(e.subcategory));
  return entries;
}

function getCategoryLabel(){
  if(financeState.category === 'all') return 'All Spending';
  if(financeState.category === 'groc') return 'Groceries';
  if(financeState.category === 'rental') return 'Rental';
  if(financeState.category === 'cafe') return 'Cafe';
  return 'All Spending';
}

function sumBySubcategory(entries){
  const isAll = financeState.category === 'all';
  const fallback = getCategoryLabel();
  const map = new Map();
  for(const e of entries){
    const k = isAll ? (e.category || 'Other') : (e.subcategory || fallback);
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

function renderFinanceMonthLabel(){
  setText('financeMonthLabel', getMonthLabel(financeState.monthOffset));
}

function renderFinanceDonut(){
  const emptyEl = $('financeEmpty');
  const legendEl = $('financeLegend');
  const canvas = $('financeDonut');
  const donutWrap = $('financeDonutWrap');

  if(!legendEl || !canvas) return;

  // Handle chart visibility toggle
  if(donutWrap){
    donutWrap.style.display = financeState.chartVisible ? 'flex' : 'none';
  }

  renderFinanceMonthLabel();

  // Chart.js availability
  if(typeof Chart === 'undefined'){
    if(emptyEl){
      emptyEl.classList.add('show');
      emptyEl.innerHTML = `Chart.js not loaded. Add the Chart.js script tag in <b>main.html</b>.`;
    }
    legendEl.innerHTML = '';
    return;
  }

  const catLabel = getCategoryLabel();
  const receipts = loadFinanceReceipts();
  const allEntries = receiptsToEntries(receipts);
  const monthEntries = filterByMonthOffset(allEntries, financeState.monthOffset);
  const filteredEntries = filterByActiveCategory(monthEntries);

  const rows = sumBySubcategory(filteredEntries);
  const total = rows.reduce((s,r)=>s+r.value, 0);
  setText('financeTotal', formatMoney(total));
  setText('financeTotalLabel', catLabel);

  // Empty state
  if(!rows.length){
    destroyFinanceChart();
    if(emptyEl){
      emptyEl.classList.add('show');
      emptyEl.innerHTML = `No ${escapeHtml(catLabel.toLowerCase())} data for <b>${escapeHtml(getMonthLabel(financeState.monthOffset))}</b>.<br/>Add receipts and this will populate automatically.`;
    }
    legendEl.innerHTML = '';
    return;
  }
  if(emptyEl) emptyEl.classList.remove('show');

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
  if(!financeState.chartVisible){
    destroyFinanceChart();
    return;
  }

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

  // Update FIN vertical bar power based on grocery total for this month
  // Only update from current month
  if(financeState.monthOffset === 0){
    setHeight('modFinFill', pct(total, FIN_MAX));
  }
}

/* --------------------------------
   Nutrition: daily summary for dashboard
----------------------------------*/
function loadNutritionMeals(){
  try { return JSON.parse(localStorage.getItem('nutrition:meals') || '[]'); }
  catch { return []; }
}

function loadNutritionTargets(){
  try {
    return JSON.parse(localStorage.getItem('nutrition:targets')) || { dailyCalories: 2200, dailyProtein: 165, dailyCarbs: 250, dailyFat: 75 };
  } catch { return { dailyCalories: 2200, dailyProtein: 165, dailyCarbs: 250, dailyFat: 75 }; }
}

function renderNutritionCard(){
  const allMeals = loadNutritionMeals();
  const todayMeals = allMeals.filter(m => m.date === todayISO);
  const targets = loadNutritionTargets();

  // Fallback to most recent date with EITHER meals or workouts
  let meals = todayMeals;
  let isToday = true;
  let displayDate = todayISO;

  if(!todayMeals.length){
    const mealDates = [...new Set(allMeals.map(m => m.date))];
    const workoutDates = getAllWorkouts().map(w => w.date);
    const allDates = [...new Set([...mealDates, ...workoutDates])].sort();
    const fallbackDate = allDates.length ? allDates[allDates.length - 1] : null;
    if(fallbackDate){
      meals = allMeals.filter(m => m.date === fallbackDate);
      isToday = false;
      displayDate = fallbackDate;
    }
  }

  let cal = 0, pro = 0, carb = 0, fat = 0;
  meals.forEach(m => {
    if(!m.totals) return;
    cal += m.totals.calories || 0;
    pro += m.totals.protein || 0;
    carb += m.totals.carbs || 0;
    fat += m.totals.fat || 0;
  });

  const nbarCal = $('nbarCal');
  const nbarPro = $('nbarPro');
  const nbarCarb = $('nbarCarb');
  const nbarFat = $('nbarFat');

  if(nbarCal) nbarCal.style.width = pct(cal, targets.dailyCalories).toFixed(1) + '%';
  if(nbarPro) nbarPro.style.width = pct(pro, targets.dailyProtein).toFixed(1) + '%';
  if(nbarCarb) nbarCarb.style.width = pct(carb, targets.dailyCarbs).toFixed(1) + '%';
  if(nbarFat) nbarFat.style.width = pct(fat, targets.dailyFat).toFixed(1) + '%';

  setText('nvalCal', `${Math.round(cal)} / ${targets.dailyCalories}`);
  setText('nvalPro', `${Math.round(pro)}g / ${targets.dailyProtein}g`);
  setText('nvalCarb', `${Math.round(carb)}g / ${targets.dailyCarbs}g`);
  setText('nvalFat', `${Math.round(fat)}g / ${targets.dailyFat}g`);

  // Store computed cal for vertical bar in renderModulesAndCharacter()
  lastNutritionCal = cal;

  // Intake vs exercise burn comparison — uses displayDate (today or fallback)
  const vsEl = $('nutritionVs');
  if(vsEl){
    const dateWorkouts = getAllWorkouts().filter(w => w.date === displayDate);
    let dateVolume = 0;
    dateWorkouts.forEach(w => { dateVolume += dayTotals(w).volume; });
    const burnEstimate = Math.round(dateVolume * 0.05);

    vsEl.classList.add('show');

    if(cal > 0 && burnEstimate > 0){
      const diff = Math.round(cal - burnEstimate);
      const status = diff >= 0 ? 'surplus' : 'deficit';
      const target = targets.dailyCalories + burnEstimate;
      const recoveryPct = Math.max(0, Math.min(100, Math.round((cal / target) * 100)));
      let recoveryColor = 'var(--good)';
      if(recoveryPct < 60) recoveryColor = 'var(--danger)';
      else if(recoveryPct < 80) recoveryColor = 'var(--warn)';

      const diffColor = diff >= 0 ? 'var(--good)' : 'var(--warn)';
      vsEl.innerHTML = `Ate <b>${Math.round(cal)}</b> cal, burned ~<b>${burnEstimate}</b> cal → <span style="color:${diffColor}">${Math.abs(diff)} cal ${status}</span>
        <div style="margin-top:6px; height:6px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden">
          <div style="height:100%; width:${recoveryPct}%; border-radius:999px; background:${recoveryColor}; transition:width .35s ease"></div>
        </div>
        <div style="margin-top:2px; font-size:11px; color:var(--muted)">${recoveryPct}% recovery target</div>`;
    } else if(cal > 0){
      vsEl.innerHTML = `Ate <b>${Math.round(cal)}</b> cal — <span style="color:var(--muted)">No workout data${isToday ? ' today' : ''}</span>`;
    } else if(burnEstimate > 0){
      vsEl.innerHTML = `Burned ~<b>${burnEstimate}</b> cal from workout — <span style="color:var(--muted)">No meal data${isToday ? ' today' : ''}</span>`;
    } else {
      vsEl.innerHTML = `<span style="color:var(--muted)">Log a meal or workout to see intake vs burn</span>`;
    }
  }

  // Update sub text
  const sub = $('nutritionSub');
  if(sub){
    if(isToday){
      sub.textContent = meals.length ? `${meals.length} meal${meals.length > 1 ? 's' : ''} logged today` : 'No meals logged today';
    } else {
      const d = new Date(displayDate + 'T12:00:00');
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      sub.textContent = `${meals.length} meal${meals.length > 1 ? 's' : ''} on ${label}`;
    }
  }

  // Cross-section: estimated food cost from today's meals
  const foodCostEl = $('financeFoodCost');
  if(foodCostEl){
    let todayCost = 0;
    meals.forEach(m => { todayCost += (m.totals && m.totals.cost) ? m.totals.cost : 0; });
    if(todayCost > 0){
      foodCostEl.classList.add('show');
      foodCostEl.textContent = `Est. food cost today: ${formatMoney2(todayCost)}`;
    } else {
      foodCostEl.classList.remove('show');
    }
  }
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

  // Nutrition fill: calorie intake as % of target (uses lastNutritionCal from renderNutritionCard)
  const nutTargets = loadNutritionTargets();
  setHeight('modNutFill', pct(lastNutritionCal, nutTargets.dailyCalories));

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

  // Top 3 heaviest exercises, one per body part
  const scored = latest.exercises.map(ex => {
    const sets = (ex.sets || []).filter(s => (s.weight > 0 || s.reps > 0)).length;
    const vol = (ex.sets || []).reduce((sum, s) => sum + ((s.weight>0 && s.reps>0) ? (s.weight*s.reps) : 0), 0);
    const maxWeight = (ex.sets || []).reduce((mx, s) => Math.max(mx, s.weight || 0), 0);
    return { ex, sets, vol, maxWeight };
  }).filter(s => s.sets > 0 || s.vol > 0);

  // Group by bodyPart, pick heaviest per group
  const byPart = new Map();
  scored.forEach(s => {
    const part = s.ex.bodyPart;
    if(!byPart.has(part) || s.maxWeight > byPart.get(part).maxWeight){
      byPart.set(part, s);
    }
  });

  // Sort by maxWeight desc, take top 3
  const top3 = [...byPart.values()].sort((a, b) => b.maxWeight - a.maxWeight).slice(0, 3);

  const rows = top3.map(s => `
    <div class="ex-row">
      <div>
        <div class="n">${escapeHtml(s.ex.name)}</div>
        <div class="m">${escapeHtml(s.ex.bodyPart)} • ${s.sets} set(s)</div>
      </div>
      <div class="r">
        ${Math.round(s.maxWeight).toLocaleString()} lb
        <small>heaviest</small>
      </div>
    </div>
  `);

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
    modStudy.addEventListener('click', ()=> go('./study/studyHome.html'));
    modStudy.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') go('./study/studyHome.html'); });
  }
  if(modFin){
    modFin.addEventListener('click', ()=> go('./finances/index.html'));
    modFin.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') go('./finances/index.html'); });
  }

  const modNutrition = $('modNutrition');
  if(modNutrition){
    modNutrition.addEventListener('click', ()=> go('./nutrition/index.html'));
    modNutrition.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') go('./nutrition/index.html'); });
  }
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

  // Nutrition
  const openNutrition = $('openNutrition');
  if(openNutrition){
    openNutrition.addEventListener('click', ()=> location.href = './nutrition/index.html');
  }

  // Finance month navigation
  const monthPrev = $('financeMonthPrev');
  const monthNext = $('financeMonthNext');

  if(monthPrev){
    monthPrev.addEventListener('click', ()=>{
      financeState.monthOffset -= 1;
      renderFinanceDonut();
    });
  }
  if(monthNext){
    monthNext.addEventListener('click', ()=>{
      financeState.monthOffset += 1;
      renderFinanceDonut();
    });
  }

  // Finance chart toggle
  const toggleChart = $('financeToggleChart');
  if(toggleChart){
    toggleChart.addEventListener('click', ()=>{
      financeState.chartVisible = !financeState.chartVisible;
      toggleChart.classList.toggle('active', !financeState.chartVisible);
      renderFinanceDonut();
    });
  }

  // Finance category filter buttons
  document.querySelectorAll('.fin-filter').forEach(btn => {
    btn.addEventListener('click', ()=>{
      financeState.category = btn.dataset.cat;
      document.querySelectorAll('.fin-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFinanceDonut();
    });
  });
}

/* --------------------------------
   Render All
----------------------------------*/
function renderAll(){
  renderTop();
  renderNutritionCard();        // must run before renderModulesAndCharacter (sets lastNutritionCal)
  renderModulesAndCharacter();
  renderHistory();
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
