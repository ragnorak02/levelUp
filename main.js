/* --------------------------------
   Dashboard: Exercise + Finance
----------------------------------*/

/* ===== Storage Keys (existing) ===== */
const KEY_LEVEL = 'levelUp:characterLevel';
const KEY_TRANSFORMS = 'levelUp:transformCount';
const KEY_EX_RESET_AT = 'levelUp:exerciseResetAt';   // pre-carry-over meter reset; read once to migrate
const KEY_EX_SPENT = 'levelUp:exerciseSpentPct';    // level-% used up by transforms
const todayISO = new Date().toISOString().slice(0,10);

/* ===== Exercise Threshold =====
   Level progress is a percentage: workouts earn their share via
   powerUp/workoutXP.js (~25% for a typical session). Bowling and garden
   still produce raw volume, converted at EX_MAX volume = one level. */
const LEVEL_PCT = 100;
const EX_MAX = 50000;

/* ===== Finance Threshold (for Fin vertical bar only) ===== */
const FIN_MAX = 2000;

/* ===== Bowling: score-based volume contribution ===== */
const BOWL_VOLUME_MULTIPLIER = 10;  // each bowling pin scored = 10 exercise volume
const GARDEN_VOLUME_MULTIPLIER = 50;  // each garden XP = 50 exercise volume

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

function getExerciseResetAt(){
  const v = localStorage.getItem(KEY_EX_RESET_AT);
  return (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : '1900-01-01';
}

/* Level-% earned after `isoDate`: scored workouts, plus bowling and garden
   volume converted at EX_MAX per level. */
function powerSince(isoDate, scores){
  const workouts = window.WorkoutXP ? WorkoutXP.pctSince(isoDate, scores || WorkoutXP.scoreAll()) : 0;
  const otherVolume = bowlingVolumeSince(isoDate) + gardenVolumeSince(isoDate);
  return workouts + (otherVolume / EX_MAX) * LEVEL_PCT;
}

/* Level-% used up by transforms. First run after the switch to carry-over:
   everything earned before the old reset date counts as already spent, so
   the meter shows exactly what it did before. */
function getExerciseSpent(scores){
  const raw = localStorage.getItem(KEY_EX_SPENT);
  if(raw !== null && raw !== '' && isFinite(Number(raw))) return Number(raw);
  const spent = powerSince('0000-00-00', scores) - powerSince(getExerciseResetAt(), scores);
  localStorage.setItem(KEY_EX_SPENT, String(spent));
  return spent;
}

/* Progress toward the next level: everything ever earned minus what
   transforms spent, so whatever ran past 100% carries into the next level. */
function getExerciseProgress(scores){
  scores = scores || (window.WorkoutXP ? WorkoutXP.scoreAll() : new Map());
  return Math.max(0, powerSince('0000-00-00', scores) - getExerciseSpent(scores));
}

function flashTransform(){
  const frame = $('characterFrame');
  if(!frame) return;
  frame.classList.remove('transforming');
  void frame.offsetWidth;
  frame.classList.add('transforming');
  setTimeout(()=>frame.classList.remove('transforming'), 950);

  // Trigger power-up animation
  triggerPowerUpAnimation();
}

function doExerciseTransform(){
  if(getExerciseProgress() < LEVEL_PCT) return;

  setLevel(getLevel() + 1);
  setTransformCount(getTransformCount() + 1);

  // spend one level's worth; anything over it stays on the meter
  localStorage.setItem(KEY_EX_SPENT, String(getExerciseSpent() + LEVEL_PCT));

  flashTransform();
  renderAll();
}

/* --------------------------------
   Character Animation System
----------------------------------*/
const CHAR_FRAMES = 12;
const CHAR_PATH = './images/character/character_frame_';
const IDLE_FRAMES = [1, 2, 3, 4];
const POWERUP_FRAMES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const CHARGED_FRAMES = [8, 9, 10, 11, 12, 11, 10, 9]; // ping-pong

const charState = {
  mode: 'idle',        // 'idle' | 'powerup' | 'charged'
  frameIdx: 0,
  lastTick: 0,
  rafId: null
};

// Preload all frames
const charImages = [];
for(let i = 1; i <= CHAR_FRAMES; i++){
  const img = new Image();
  img.src = `${CHAR_PATH}${String(i).padStart(2, '0')}.png`;
  charImages.push(img);
}

function getCharFrameRate(){
  if(charState.mode === 'idle') return 320;      // ms per frame — slow idle
  if(charState.mode === 'powerup') return 120;   // faster power-up
  if(charState.mode === 'charged') return 180;    // medium charged loop
  return 320;
}

function getCharFrameList(){
  if(charState.mode === 'idle') return IDLE_FRAMES;
  if(charState.mode === 'powerup') return POWERUP_FRAMES;
  if(charState.mode === 'charged') return CHARGED_FRAMES;
  return IDLE_FRAMES;
}

function tickCharAnimation(timestamp){
  const elapsed = timestamp - charState.lastTick;
  const rate = getCharFrameRate();

  if(elapsed >= rate){
    charState.lastTick = timestamp;
    const frames = getCharFrameList();
    charState.frameIdx++;

    // When powerup finishes, switch to charged loop
    if(charState.mode === 'powerup' && charState.frameIdx >= frames.length){
      charState.mode = 'charged';
      charState.frameIdx = 0;
    }

    // Wrap index for looping modes
    const list = getCharFrameList();
    const idx = charState.frameIdx % list.length;
    const frameNum = list[idx];

    const sprite = $('characterSprite');
    if(sprite){
      sprite.src = charImages[frameNum - 1].src;
    }
  }

  charState.rafId = requestAnimationFrame(tickCharAnimation);
}

function startCharAnimation(){
  if(charState.rafId) cancelAnimationFrame(charState.rafId);
  charState.lastTick = 0;
  charState.rafId = requestAnimationFrame(tickCharAnimation);
}

function triggerPowerUpAnimation(){
  charState.mode = 'powerup';
  charState.frameIdx = 0;
  charState.lastTick = 0;
}

function resetToIdle(){
  charState.mode = 'idle';
  charState.frameIdx = 0;
  charState.lastTick = 0;
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
   Bowling: read scores, contribute to exercise volume
----------------------------------*/
function getISOWeek(date){
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function listBowlingWeekKeys(){
  const keys = [];
  for(let i = 0; i < localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith('bowling:week:')) keys.push(k);
  }
  return keys;
}

function bowlingVolumeSince(isoDate){
  let total = 0;
  listBowlingWeekKeys().forEach(k => {
    const week = safeParse(k);
    if(!week || !Array.isArray(week.games)) return;
    week.games.forEach(g => {
      if(g.score != null && g.completedDate && g.completedDate > isoDate){
        total += g.score * BOWL_VOLUME_MULTIPLIER;
      }
    });
  });
  return Math.round(total);
}

function getBowlingAverage(){
  let total = 0, count = 0;
  listBowlingWeekKeys().forEach(k => {
    const week = safeParse(k);
    if(!week || !Array.isArray(week.games)) return;
    week.games.forEach(g => {
      if(g.score != null){ total += g.score; count++; }
    });
  });
  return count > 0 ? Math.round(total / count) : null;
}

function getLastNBowlingGames(n){
  const games = [];
  listBowlingWeekKeys().forEach(k => {
    const week = safeParse(k);
    if(!week || !Array.isArray(week.games)) return;
    week.games.forEach(g => {
      if(g.score != null){
        games.push({ score: g.score, date: g.completedDate || week.weekId });
      }
    });
  });
  games.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  return games.slice(0, n);
}

/* Every scored game, newest first, with its week for grouping series. */
function getAllBowlingGames(){
  const games = [];
  listBowlingWeekKeys().forEach(k => {
    const week = safeParse(k);
    if(!week || !Array.isArray(week.games)) return;
    week.games.forEach((g, i) => {
      if(g.score != null){
        games.push({ score: g.score, date: g.completedDate || '', weekId: week.weekId || k.slice('bowling:week:'.length), order: i, frames: g.frames });
      }
    });
  });
  games.sort((a, b) => (a.date !== b.date) ? (a.date > b.date ? -1 : 1) : (b.order - a.order));
  return games;
}

/* Strike % of first balls, spare % of the non-strike frames — same rules as bowling/index.html. */
function bowlingRates(games){
  let firsts = 0, strikes = 0, spares = 0;
  games.forEach(g => (g.frames || []).forEach((f, fi) => {
    const shots = f.shots || [];
    if(!shots.length) return;
    const knocked1 = 10 - (shots[0].pinsLeft ? shots[0].pinsLeft.length : 0);
    firsts++;
    if(knocked1 === 10){ strikes++; return; }
    if(shots.length >= 2){
      const knocked2 = 10 - (shots[1].pinsLeft ? shots[1].pinsLeft.length : 0);
      if(fi < 9 ? knocked1 + knocked2 === 10 : knocked1 + knocked2 >= 10) spares++;
    }
  }));
  return {
    strikeRate: firsts ? Math.round((strikes / firsts) * 100) : null,
    spareRate: (firsts - strikes) ? Math.round((spares / (firsts - strikes)) * 100) : null
  };
}

/* Bowling summary card (shown when the bowling slot is tapped). */
function renderBowlCard(){
  const body = $('bowlCardBody');
  if(!body) return;
  const games = getAllBowlingGames();
  if(!games.length){
    setText('bowlCardSub', 'No games yet');
    body.innerHTML = `<div class="empty">No bowling games logged yet.<br/>Log a game in <b>Bowling</b> and your stats will show up here.</div>`;
    return;
  }

  const scores = games.map(g => g.score);
  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const high = Math.max(...scores);

  // a series = one week's games, scored when it has three
  const byWeek = new Map();
  games.forEach(g => { if(!byWeek.has(g.weekId)) byWeek.set(g.weekId, []); byWeek.get(g.weekId).push(g); });
  const series = [...byWeek.values()].filter(w => w.length === 3).map(w => w.reduce((s, g) => s + g.score, 0));
  const bestSeries = series.length ? Math.max(...series) : null;
  const rates = bowlingRates(games);

  const last = games[0];
  const lastDate = last.date ? new Date(last.date.slice(0,10) + 'T12:00:00').toLocaleDateString(undefined, {month:'short', day:'numeric'}) : last.weekId;
  setText('bowlCardSub', `${games.length} game${games.length === 1 ? '' : 's'} · last ${lastDate}`);

  const chip = (label, val) => `<div class="chip"><small>${label}</small> <span>${val}</span></div>`;
  const chips = [
    chip('Avg', avg),
    chip('High', high),
    bestSeries != null ? chip('Best series', bestSeries) : '',
    rates.strikeRate != null ? chip('Strike', rates.strikeRate + '%') : '',
    rates.spareRate != null ? chip('Spare', rates.spareRate + '%') : ''
  ].join('');

  // latest week's games, in the order bowled
  const latestWeek = byWeek.get(last.weekId).slice().sort((a, b) => a.order - b.order);
  const latestTotal = latestWeek.reduce((s, g) => s + g.score, 0);
  const latestHtml = latestWeek.map((g, i) => `
    <div class="bowl-game-box${g.score === high ? ' best' : ''}"><b>${g.score}</b><small>G${i + 1}</small></div>
  `).join('') + (latestWeek.length > 1 ? `<div class="bowl-game-box total"><b>${latestTotal}</b><small>Series</small></div>` : '');

  // last 10 games, oldest → newest, bars against the average
  const recent = games.slice(0, 10).reverse();
  const lo = Math.min(...recent.map(g => g.score), avg) - 20;
  const hi = Math.max(...recent.map(g => g.score), avg);
  const h = v => Math.max(6, Math.round(((v - lo) / ((hi - lo) || 1)) * 100));
  const trendHtml = recent.map(g => `
    <div class="bowl-bar${g.score >= avg ? ' up' : ''}" style="height:${h(g.score)}%" title="${g.score}"><span>${g.score}</span></div>
  `).join('');

  body.innerHTML = `
    <div class="summary">${chips}</div>
    <div class="bowl-label">Latest series</div>
    <div class="bowl-games-row">${latestHtml}</div>
    <div class="bowl-label">Last ${recent.length} games <span>· avg line ${avg}</span></div>
    <div class="bowl-trend"><div class="bowl-trend-plot">
      <div class="bowl-avg-line" style="bottom:${h(avg)}%"></div>
      ${trendHtml}
    </div></div>
  `;
}

function renderBowlDashboard(){
  const avg = getBowlingAverage();
  const avgEl = $('bowlAvg');
  if(avgEl){
    avgEl.textContent = avg != null ? 'Avg ' + avg : '';
  }

  const recentEl = $('bowlRecent');
  if(recentEl){
    const games = getLastNBowlingGames(3);
    if(games.length){
      recentEl.style.display = 'flex';
      recentEl.innerHTML = games.map((g, i) =>
        `<div class="bowl-game"><div class="bg-score">${g.score}</div><div class="bg-label">G${games.length - i}</div></div>`
      ).join('');
    } else {
      recentEl.style.display = 'none';
    }
  }
}

/* --------------------------------
   Garden: read data from gardenData_v2
----------------------------------*/
function loadGardenData(){
  try { return JSON.parse(localStorage.getItem('gardenData_v2') || '{}'); }
  catch { return {}; }
}

function getGardenTotalXP(){
  return loadGardenData().totalXp || 0;
}

function loadGardenXpLog(){
  return loadGardenData().xpLog || [];
}

function gardenVolumeSince(isoDate){
  let total = 0;
  loadGardenXpLog().forEach(function(entry){
    if(entry.date && entry.date > isoDate && entry.amount > 0){
      total += entry.amount * GARDEN_VOLUME_MULTIPLIER;
    }
  });
  return Math.round(total);
}

/* --------------------------------
   Calendar: state + data layer
----------------------------------*/
const calendarState = {
    monthOffset: 0,
    selectedDate: todayISO,
    detailOpen: false
};

function loadCalendarEvents(){
    try { return JSON.parse(localStorage.getItem('calendar:events') || '[]'); }
    catch { return []; }
}

function saveCalendarEvents(events){
    localStorage.setItem('calendar:events', JSON.stringify(events));
}

function getEventsForDate(dateStr){
    return loadCalendarEvents().filter(e => e.date === dateStr);
}

function addCalendarEvent(event){
    const events = loadCalendarEvents();
    events.push(event);
    saveCalendarEvents(events);
}

function deleteCalendarEvent(id){
    const events = loadCalendarEvents().filter(e => e.id !== id);
    saveCalendarEvents(events);
}

/* --------------------------------
   Calendar: activity heatmap
----------------------------------*/
function buildDailyActivityMap(year, month){
    const map = {};
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Exercise volume
    listWorkoutKeys().forEach(k => {
        if(!k.startsWith('powerUp:' + prefix)) return;
        const dateStr = k.replace('powerUp:', '');
        const day = normalizeDay(safeParse(k));
        if(!day) return;
        const vol = dayTotals(day).volume;
        const d = Number(dateStr.slice(8, 10));
        map[d] = (map[d] || 0) + vol;
    });

    // Nutrition calories
    const allMeals = loadNutritionMeals();
    allMeals.forEach(m => {
        if(!m.date || !m.date.startsWith(prefix)) return;
        const d = Number(m.date.slice(8, 10));
        const cal = (m.totals && m.totals.calories) ? m.totals.calories : 0;
        map[d] = (map[d] || 0) + Math.min(cal / 10, 300);
    });

    // Bowling scores
    listBowlingWeekKeys().forEach(k => {
        const week = safeParse(k);
        if(!week || !Array.isArray(week.games)) return;
        week.games.forEach(g => {
            if(g.score != null && g.completedDate && g.completedDate.startsWith(prefix)){
                const d = Number(g.completedDate.slice(8, 10));
                map[d] = (map[d] || 0) + g.score * BOWL_VOLUME_MULTIPLIER;
            }
        });
    });

    // Calendar events with xpAmount
    loadCalendarEvents().forEach(e => {
        if(!e.date || !e.date.startsWith(prefix)) return;
        if(e.xpAmount > 0){
            const d = Number(e.date.slice(8, 10));
            map[d] = (map[d] || 0) + e.xpAmount;
        }
    });

    // Garden xpLog
    loadGardenXpLog().forEach(entry => {
        if(!entry.date || !entry.date.startsWith(prefix)) return;
        if(entry.amount > 0){
            const d = Number(entry.date.slice(8, 10));
            map[d] = (map[d] || 0) + entry.amount * GARDEN_VOLUME_MULTIPLIER;
        }
    });

    return map;
}

function activityClass(score){
    if(score >= 10000) return 'activity-4';
    if(score >= 5000) return 'activity-3';
    if(score >= 2000) return 'activity-2';
    if(score >= 1) return 'activity-1';
    return '';
}

/* --------------------------------
   Calendar: rendering
----------------------------------*/
function getCalendarMonth(){
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + calendarState.monthOffset, 1);
}

function renderCalendarGrid(){
    const grid = $('calGrid');
    const label = $('calMonthLabel');
    if(!grid) return;

    const base = getCalendarMonth();
    const year = base.getFullYear();
    const month = base.getMonth();

    if(label){
        const sameYear = year === new Date().getFullYear();
        const mName = base.toLocaleString('en-US', { month: 'long' });
        label.textContent = sameYear ? mName : `${mName} ${year}`;
    }

    // Pre-build activity map
    const actMap = buildDailyActivityMap(year, month);

    // Pre-build date lookup sets for dots
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const workoutDates = new Set();
    listWorkoutKeys().forEach(k => {
        const d = k.replace('powerUp:', '');
        if(d.startsWith(monthPrefix)) workoutDates.add(d);
    });

    const mealDates = new Set();
    loadNutritionMeals().forEach(m => {
        if(m.date && m.date.startsWith(monthPrefix)) mealDates.add(m.date);
    });

    const bowlDates = new Set();
    listBowlingWeekKeys().forEach(k => {
        const week = safeParse(k);
        if(!week || !Array.isArray(week.games)) return;
        week.games.forEach(g => {
            if(g.completedDate && g.completedDate.startsWith(monthPrefix)) bowlDates.add(g.completedDate);
        });
    });

    const eventDates = new Set();
    loadCalendarEvents().forEach(e => {
        if(e.date && e.date.startsWith(monthPrefix)) eventDates.add(e.date);
    });

    const gardenDates = new Set();
    loadGardenXpLog().forEach(entry => {
        if(entry.date && entry.date.startsWith(monthPrefix)) gardenDates.add(entry.date);
    });

    // Build grid
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    let html = '';

    // Previous month overflow
    for(let i = firstDay - 1; i >= 0; i--){
        const d = prevDays - i;
        html += `<div class="cal-cell outside"><span class="cal-num">${d}</span></div>`;
    }

    // Current month days
    for(let d = 1; d <= daysInMonth; d++){
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayISO;
        const isSelected = dateStr === calendarState.selectedDate;
        const score = actMap[d] || 0;
        const actCls = activityClass(score);

        let cls = 'cal-cell';
        if(isToday) cls += ' today';
        if(isSelected) cls += ' selected';
        if(actCls) cls += ' ' + actCls;

        // Dots
        let dots = '';
        if(workoutDates.has(dateStr)) dots += '<span class="cal-dot dot-ex"></span>';
        if(mealDates.has(dateStr)) dots += '<span class="cal-dot dot-nut"></span>';
        if(bowlDates.has(dateStr)) dots += '<span class="cal-dot dot-bowl"></span>';
        if(gardenDates.has(dateStr)) dots += '<span class="cal-dot dot-garden"></span>';
        if(eventDates.has(dateStr)) dots += '<span class="cal-dot dot-event"></span>';

        html += `<div class="${cls}" data-date="${dateStr}">
            <span class="cal-num">${d}</span>
            ${dots ? '<div class="cal-dots">' + dots + '</div>' : ''}
        </div>`;
    }

    // Next month overflow
    const totalCells = firstDay + daysInMonth;
    const remainder = totalCells % 7;
    if(remainder > 0){
        for(let d = 1; d <= 7 - remainder; d++){
            html += `<div class="cal-cell outside"><span class="cal-num">${d}</span></div>`;
        }
    }

    grid.innerHTML = html;

    // Bind cell clicks
    grid.querySelectorAll('.cal-cell:not(.outside)').forEach(cell => {
        cell.addEventListener('click', () => {
            const date = cell.dataset.date;
            if(calendarState.selectedDate === date && calendarState.detailOpen){
                calendarState.detailOpen = false;
            } else {
                calendarState.selectedDate = date;
                calendarState.detailOpen = true;
            }
            renderCalendarGrid();
            renderCalendarDayDetail();
        });
    });

    // Show/hide detail
    const detail = $('calDayDetail');
    if(detail){
        detail.style.display = calendarState.detailOpen ? 'block' : 'none';
        if(calendarState.detailOpen) renderCalendarDayDetail();
    }
}

function renderCalendarDayDetail(){
    const detail = $('calDayDetail');
    if(!detail || !calendarState.detailOpen) return;

    const dateStr = calendarState.selectedDate;
    const d = new Date(dateStr + 'T12:00:00');
    const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    let html = `<div class="cal-detail-head">
        <b>${escapeHtml(label)}</b>
    </div>`;

    // Auto-detected activity
    const workoutKey = 'powerUp:' + dateStr;
    const workoutRaw = safeParse(workoutKey);
    const workout = normalizeDay(workoutRaw);
    if(workout && workout.exercises.length){
        const totals = dayTotals(workout);
        html += `<div class="cal-activity-item">
            <span class="cal-act-icon" style="color:var(--ex)">💪</span>
            <span>Workout — ${totals.moves} exercise${totals.moves !== 1 ? 's' : ''}, ${totals.volume.toLocaleString()} lb vol</span>
        </div>`;
    }

    // Nutrition
    const allMeals = loadNutritionMeals();
    const dateMeals = allMeals.filter(m => m.date === dateStr);
    if(dateMeals.length){
        let cal = 0;
        dateMeals.forEach(m => { cal += (m.totals && m.totals.calories) || 0; });
        html += `<div class="cal-activity-item">
            <span class="cal-act-icon" style="color:var(--nut)">🍎</span>
            <span>${dateMeals.length} meal${dateMeals.length !== 1 ? 's' : ''} — ${Math.round(cal)} cal</span>
        </div>`;
    }

    // Bowling
    listBowlingWeekKeys().forEach(k => {
        const week = safeParse(k);
        if(!week || !Array.isArray(week.games)) return;
        week.games.forEach(g => {
            if(g.completedDate === dateStr && g.score != null){
                html += `<div class="cal-activity-item">
                    <span class="cal-act-icon" style="color:var(--bowl)">🎳</span>
                    <span>Bowling — Score ${g.score}</span>
                </div>`;
            }
        });
    });

    // Garden xpLog entries
    const gardenActs = loadGardenXpLog().filter(entry => entry.date === dateStr);
    if(gardenActs.length){
        let gardenXP = 0;
        gardenActs.forEach(entry => { gardenXP += entry.amount || 0; });
        html += `<div class="cal-activity-item">
            <span class="cal-act-icon" style="color:var(--garden)">\ud83c\udf31</span>
            <span>${gardenActs.length} garden activit${gardenActs.length !== 1 ? 'ies' : 'y'} \u2014 ${gardenXP} XP</span>
        </div>`;
    }

    // Manual calendar events
    const events = getEventsForDate(dateStr);
    if(events.length){
        html += `<div class="cal-events-label">Events</div>`;
        events.forEach(evt => {
            html += `<div class="cal-event-item">
                <span>${escapeHtml(evt.title)}</span>
                <button class="cal-event-del" data-id="${escapeHtml(evt.id)}" title="Delete event">✕</button>
            </div>`;
        });
    }

    html += `<button class="cal-add-inline" id="calAddInline">+ Add Event</button>`;

    detail.innerHTML = html;

    // Bind delete buttons
    detail.querySelectorAll('.cal-event-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCalendarEvent(btn.dataset.id);
            renderCalendarGrid();
            renderCalendarDayDetail();
        });
    });

    // Bind add inline
    const addBtn = $('calAddInline');
    if(addBtn) addBtn.addEventListener('click', openCalendarEventModal);
}

function openCalendarEventModal(){
    const overlay = $('calModalOverlay');
    if(!overlay) return;
    overlay.classList.add('open');

    const dateInput = $('calEventDate');
    if(dateInput) dateInput.value = calendarState.selectedDate;

    const titleInput = $('calEventTitle');
    if(titleInput){ titleInput.value = ''; titleInput.focus(); }

    const catSelect = $('calEventCat');
    if(catSelect) catSelect.value = 'general';

    const notesInput = $('calEventNotes');
    if(notesInput) notesInput.value = '';
}

function closeCalendarEventModal(){
    const overlay = $('calModalOverlay');
    if(overlay) overlay.classList.remove('open');
}

function saveCalendarEvent(){
    const title = ($('calEventTitle') || {}).value || '';
    const date = ($('calEventDate') || {}).value || calendarState.selectedDate;
    const category = ($('calEventCat') || {}).value || 'general';
    const notes = ($('calEventNotes') || {}).value || '';

    if(!title.trim()) return;

    const id = 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    addCalendarEvent({
        id,
        date,
        title: title.trim(),
        category,
        notes,
        xpCategory: null,
        xpAmount: 0
    });

    closeCalendarEventModal();
    renderCalendarGrid();
    if(calendarState.detailOpen) renderCalendarDayDetail();
}

/* --------------------------------
   Calendar Toggle
----------------------------------*/
let calendarVisible = false;

function toggleCalendar(){
  calendarVisible = !calendarVisible;
  const card = $('calendarCard');
  const btn = $('calToggleBtn');
  if(card) card.style.display = calendarVisible ? 'block' : 'none';
  if(btn) btn.classList.toggle('active', calendarVisible);
  if(calendarVisible) renderCalendarGrid();
}

/* --------------------------------
   Level Names & Badges
----------------------------------*/
const LEVEL_NAMES = [
  'Novice','Adept','Scout','Warrior','Knight',
  'Champion','Master','Grandmaster','Legend','Mythic'
];
const LEVEL_BADGES = ['🛡️','⚔️','🏹','🔥','👑','💎','🌟','⚜️','🐉','✨'];

function getLevelName(level){
  if(level <= 0) return LEVEL_NAMES[0];
  if(level > LEVEL_NAMES.length) return LEVEL_NAMES[LEVEL_NAMES.length - 1];
  return LEVEL_NAMES[level - 1];
}

function getLevelBadge(level){
  if(level <= 0) return LEVEL_BADGES[0];
  if(level > LEVEL_BADGES.length) return LEVEL_BADGES[LEVEL_BADGES.length - 1];
  return LEVEL_BADGES[level - 1];
}

/* --------------------------------
   Render: top + modules + history
----------------------------------*/
function renderTop(){
  const level = getLevel();
  setText('levelNum', String(level));
  setText('levelName', getLevelName(level));
  const badgeEl = $('levelBadge');
  if(badgeEl) badgeEl.textContent = getLevelBadge(level);
}

function renderModulesAndCharacter(){
  const scores = window.WorkoutXP ? WorkoutXP.scoreAll() : new Map();
  const exPower = getExerciseProgress(scores);
  if(window.WorkoutXP) WorkoutXP.save(scores);   // keep the saved scores current

  // Thin level bar (replaces old power strip)
  setWidth('levelFill', pct(exPower, LEVEL_PCT));

  // Stacked: everything before today, with today's gain glowing on top
  const yesterday = new Date(todayISO + 'T00:00:00Z');
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const exToday = Math.min(exPower, powerSince(yesterday.toISOString().slice(0,10), scores));
  const exBase = pct(exPower - exToday, LEVEL_PCT);
  setHeight('modExFill', exBase);
  const todayFill = $('modExToday');
  if(todayFill){
    const h = pct(exPower, LEVEL_PCT) - exBase;
    todayFill.style.bottom = exBase.toFixed(1) + '%';
    todayFill.style.height = h.toFixed(1) + '%';
    todayFill.classList.toggle('on', h > 0);
    $('modExFill').classList.toggle('dim', h > 0);
  }

  // Study fill: (placeholder until you wire study power)
  setHeight('modStudyFill', 0);

  // Nutrition fill: calorie intake as % of target (uses lastNutritionCal from renderNutritionCard)
  const nutTargets = loadNutritionTargets();
  setHeight('modNutFill', pct(lastNutritionCal, nutTargets.dailyCalories));

  const ready = exPower >= LEVEL_PCT;
  const btn = $('exTransform');

  if(btn){
    btn.classList.toggle('ready', ready);
  }

  // "Improved today" highlight
  highlightImprovedToday();
}

/* --------------------------------
   Exercise: the workout page's day summary, read-only.
   Same renderer as powerUp/workout.html (powerUp/sessionSummary.js), so any
   change to that summary shows up here too. ←/→ step between logged
   workouts, skipping rest days; everything opens collapsed.
----------------------------------*/
const exerciseView = { iso: null, view: null, collapse: null };

function renderHistory(){
  const SS = window.SessionSummary;
  const root = $('exSummary');
  if(!SS || !root) return;

  const dates = SS.listWorkoutDates();
  const hasAny = dates.length > 0;
  $('exNav').style.display = hasAny ? '' : 'none';
  $('exEmpty').style.display = hasAny ? 'none' : '';
  root.style.display = hasAny ? '' : 'none';
  if(!hasAny) return;

  // start on the latest workout; fall back to it if the shown one was deleted
  if(!exerciseView.iso || !dates.includes(exerciseView.iso)){
    exerciseView.iso = dates[dates.length - 1];
  }
  if(!exerciseView.view){
    exerciseView.collapse = SS.memoryCollapse();
    exerciseView.view = SS.create(root, { readOnly: true, collapse: exerciseView.collapse });
  }

  const iso = exerciseView.iso;
  const idx = dates.indexOf(iso);
  setText('exDate', SS.dateLabel(iso));
  setText('historySub', idx === dates.length - 1 ? 'Most recent workout' : `${dates.length - 1 - idx} workout${dates.length - 1 - idx === 1 ? '' : 's'} back`);
  $('exPrev').disabled = idx <= 0;
  $('exNext').disabled = idx >= dates.length - 1;

  exerciseView.view.render(SS.loadDay(iso), iso);
}

function stepExerciseWorkout(dir){
  const SS = window.SessionSummary;
  if(!SS || !exerciseView.iso) return;
  const next = SS.adjacentWorkoutDate(exerciseView.iso, dir);
  if(!next) return;
  exerciseView.iso = next;
  exerciseView.collapse.reset();   // every workout opens folded
  renderHistory();
}

/* --------------------------------
   UI Bindings
----------------------------------*/
/* --------------------------------
   Focus Mode State
----------------------------------*/
let focusModule = null; // 'exercise' | 'study' | 'finance' | 'nutrition' | null

const MODULE_FOCUS_MAP = {
  exercise: 'exercise',
  study: 'study',
  finance: 'finance',
  nutrition: 'nutrition'
};

function bindNav(){
  // Icons are now <a> links in HTML — no JS navigation needed.
  // Stop icon clicks from bubbling to the modv bar (which triggers focus).
  document.querySelectorAll('.micon').forEach(icon => {
    icon.addEventListener('click', (e) => e.stopPropagation());
  });

  // Module bar / bowling slot click → focus mode
  document.querySelectorAll('.modv[data-module], .mini-slot[data-module]').forEach(el => {
    el.addEventListener('click', () => {
      const mod = el.dataset.module;
      // second tap on the selected one opens its module, same as its icon
      if(focusModule === mod){
        const link = el.querySelector('.micon');
        const href = el.dataset.href || (link && link.href);
        if(href) location.href = href;
        return;
      }
      focusModule = mod;
      updateFocusMode();
    });
  });
}

function bindButtons(){
  const exTransform = $('exTransform');
  if(exTransform){
    exTransform.addEventListener('click', () => {
      if(getExerciseProgress() >= LEVEL_PCT){
        doExerciseTransform();
      } else {
        // Play power-up animation preview, then reset to idle
        triggerPowerUpAnimation();
        setTimeout(resetToIdle, 3000);
      }
    });
  }

  // Open Workout / the date label both open the workout being shown
  const openShownWorkout = ()=>{
    if(exerciseView.iso) location.href = `./powerUp/workout.html?date=${exerciseView.iso}`;
    else location.href = './powerUp/index.html';
  };
  const openExercise = $('openExercise');
  if(openExercise) openExercise.addEventListener('click', openShownWorkout);
  const downloadScores = $('downloadScores');
  if(downloadScores && window.WorkoutXP) downloadScores.addEventListener('click', ()=> WorkoutXP.download());

  const exDate = $('exDate');
  if(exDate) exDate.addEventListener('click', openShownWorkout);

  const exPrev = $('exPrev');
  if(exPrev) exPrev.addEventListener('click', ()=> stepExerciseWorkout(-1));
  const exNext = $('exNext');
  if(exNext) exNext.addEventListener('click', ()=> stepExerciseWorkout(1));

  // Nutrition
  const openBowling = $('openBowling');
  if(openBowling) openBowling.addEventListener('click', ()=> location.href = './bowling/index.html');

  const openNutrition = $('openNutrition');
  if(openNutrition){
    openNutrition.addEventListener('click', ()=> location.href = './nutrition/index.html');
  }

  // Calendar toggle
  const calToggle = $('calToggleBtn');
  if(calToggle) calToggle.addEventListener('click', toggleCalendar);

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

  // Calendar month navigation
  const calPrev = $('calMonthPrev');
  const calNext = $('calMonthNext');
  if(calPrev){
    calPrev.addEventListener('click', () => {
      calendarState.monthOffset -= 1;
      calendarState.detailOpen = false;
      renderCalendarGrid();
    });
  }
  if(calNext){
    calNext.addEventListener('click', () => {
      calendarState.monthOffset += 1;
      calendarState.detailOpen = false;
      renderCalendarGrid();
    });
  }

  // Calendar + Event button
  const calAddBtn = $('calAddEvent');
  if(calAddBtn) calAddBtn.addEventListener('click', openCalendarEventModal);

  // Calendar modal
  const calModalClose = $('calModalClose');
  if(calModalClose) calModalClose.addEventListener('click', closeCalendarEventModal);

  const calModalOverlay = $('calModalOverlay');
  if(calModalOverlay){
    calModalOverlay.addEventListener('click', (e) => {
      if(e.target === calModalOverlay) closeCalendarEventModal();
    });
  }

  const calSaveBtn = $('calSaveEvent');
  if(calSaveBtn) calSaveBtn.addEventListener('click', saveCalendarEvent);

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
   Improved Today Detection
----------------------------------*/
function highlightImprovedToday(){
  // Exercise: has a workout logged today
  const exToday = !!safeParse('powerUp:' + todayISO);
  const modEx = $('modExercise');
  if(modEx) modEx.classList.toggle('improved-today', exToday);

  // Study: has flashcard activity today
  let studyToday = false;
  try{
    const flashData = JSON.parse(localStorage.getItem('levelupFlashData') || '{}');
    if(flashData.cards){
      studyToday = flashData.cards.some(c => c.lastStudied && c.lastStudied.startsWith(todayISO));
    }
  }catch(e){}
  const modSt = $('modStudy');
  if(modSt) modSt.classList.toggle('improved-today', studyToday);

  // Finance: has receipt dated today
  let finToday = false;
  try{
    const receipts = JSON.parse(localStorage.getItem('finances:receipts') || '[]');
    finToday = receipts.some(r => r.date === todayISO);
  }catch(e){}
  const modFn = $('modFin');
  if(modFn) modFn.classList.toggle('improved-today', finToday);

  // Nutrition: has meal logged today
  let nutToday = false;
  try{
    const meals = JSON.parse(localStorage.getItem('nutrition:meals') || '[]');
    nutToday = meals.some(m => m.date === todayISO);
  }catch(e){}
  const modNt = $('modNutrition');
  if(modNt) modNt.classList.toggle('improved-today', nutToday);
}

/* --------------------------------
   Focus Mode
----------------------------------*/
function updateFocusMode(){
  document.querySelectorAll('.modv[data-module], .mini-slot[data-module]').forEach(m => {
    m.classList.toggle('selected', m.dataset.module === focusModule);
  });

  // Hide all detail panels
  document.querySelectorAll('.detail-panel').forEach(p => {
    p.style.display = 'none';
    p.classList.remove('visible');
  });

  if(!focusModule) return;

  // Show matching detail panel
  const detail = document.querySelector(`.detail-panel[data-focus="${focusModule}"]`);
  if(detail){
    detail.style.display = 'block';
    detail.classList.add('visible');
  }

  // Re-render finance chart now that canvas is visible (fixes first-render zero-size bug)
  if(focusModule === 'finance'){
    requestAnimationFrame(() => renderFinanceDonut());
  }
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
  renderBowlDashboard();
  renderBowlCard();
  if(calendarVisible) renderCalendarGrid();
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

  // Start character idle animation
  startCharAnimation();
})();
