/* =========================
   SessionSummary — one day's workout summary, shared by
   powerUp/workout.html and the dashboard (main.html).

   Everything below the workout page's top bar is rendered here: the volume
   card, the totals strip, and the In Progress / Completed sections, plus the
   exercise-history and copy-JSON popups. Change it once, both pages follow.

   Read-only against storage — the workout page owns every write.
   ========================= */
(function(){
  'use strict';

  const esc = (s)=> String(s ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));

  /* ---------- Storage ---------- */

  const keyFor = (iso)=> `powerUp:${iso}`;
  const WORKOUT_KEY_RE = /^powerUp:\d{4}-\d{2}-\d{2}$/;

  /* `finished` locks a card read-only, `completed` decides which section it sits
     in - they move together. Data written before Undo cleared `finished` can be
     locked while still listed under In Progress; unstick it on read. */
  function loadDay(iso){
    let day = null;
    try{ day = JSON.parse(localStorage.getItem(keyFor(iso))); }catch{}
    if(!day) day = { date: iso, exercises: [] };
    day.exercises = day.exercises || [];
    day.exercises.forEach(ex=>{ if(ex.finished && !ex.completed) ex.finished = false; });
    return day;
  }

  /* Every date with at least one exercise logged, oldest → newest. */
  function listWorkoutDates(){
    const out = [];
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(!WORKOUT_KEY_RE.test(k)) continue;
      try{
        const day = JSON.parse(localStorage.getItem(k));
        if(day?.exercises?.length) out.push(k.slice('powerUp:'.length));
      }catch{}
    }
    return out.sort();
  }

  /* Nearest workout date before (dir < 0) or after (dir > 0) `iso`, or null. */
  function adjacentWorkoutDate(iso, dir){
    const dates = listWorkoutDates();
    if(dir < 0){
      for(let i=dates.length-1; i>=0; i--) if(dates[i] < iso) return dates[i];
    }else{
      for(let i=0; i<dates.length; i++) if(dates[i] > iso) return dates[i];
    }
    return null;
  }

  /* ---------- Stats ----------
     Volume goes through TrainingStats so per-hand exercises (dumbbells,
     single-arm cables) count both hands. Weights and PRs stay per hand. */

  const volMult = (ex)=> (window.TrainingStats ? TrainingStats.volMult(ex) : 1);
  const setVol  = (ex, a)=> (Number(a.weight)||0) * (Number(a.reps)||0) * volMult(ex);

  function exStats(ex){
    const m = volMult(ex);
    const vol = ex.sets.reduce((s,a)=> s + (Number(a.weight)||0)*(Number(a.reps)||0)*m, 0);
    const reps = ex.sets.reduce((s,a)=> s + (Number(a.reps)||0), 0);
    const avg = reps ? vol / reps : 0;
    return { vol, reps, avg };
  }

  function countedSets(ex){ return ex.finished ? ex.sets : ex.sets.filter(s=> !!s.done); }
  function totalsFiltered(day){
    let sets=0, vol=0, exCount=day.exercises.length;
    day.exercises.forEach(ex=>{
      const cs = countedSets(ex);
      sets += cs.length;
      vol  += cs.reduce((s,a)=> s + setVol(ex, a), 0);
    });
    return {sets, vol, exCount};
  }

  function mdFromISO(iso){
    if(!iso) return '—';
    const d = new Date(String(iso).slice(0,10) + 'T00:00:00');
    return `${d.getMonth()+1}/${d.getDate()}`;
  }

  /* "Today · 10/24/26" or "Wed · 10/21/26". Takes a Date or a YYYY-MM-DD. */
  function dateLabel(when){
    const d = (when instanceof Date) ? when : new Date(String(when).slice(0,10) + 'T12:00:00');
    const isToday = new Date().toISOString().slice(0,10) === d.toISOString().slice(0,10);
    const weekday = new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(d);
    const num = `${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
    return isToday ? `Today · ${num}` : `${weekday} · ${num}`;
  }

  const sameExName = (a,b)=> String(a||'').toLowerCase().trim() === String(b||'').toLowerCase().trim();

  /* Memoises full-localStorage history scans. Rendering re-runs on every
     keystroke, so without this each one re-parses every stored workout.
     Anything that writes a workout must call clearCache(). */
  const historyScanCache = new Map();
  function clearCache(){ historyScanCache.clear(); if(window.TrainingStats) TrainingStats.clearCache(); }

  /* Every logged session of one exercise, oldest → newest.
     `excludeISO` lets callers ask "what was my best BEFORE today?". */
  function scanExerciseSessions(exName, bodyPart, excludeISO){
    const cacheKey = `${String(exName||'').toLowerCase().trim()}|${bodyPart||''}|${excludeISO||''}`;
    if(historyScanCache.has(cacheKey)) return historyScanCache.get(cacheKey);

    const out = [];
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(!WORKOUT_KEY_RE.test(k)) continue;
      const iso = k.slice('powerUp:'.length);
      if(excludeISO && iso === excludeISO) continue;

      try{
        const day = JSON.parse(localStorage.getItem(k));
        const ex = (day?.exercises || []).find(e =>
          sameExName(e.name, exName) && String(e.bodyPart||'') === String(bodyPart||'')
        );
        if(!ex) continue;
        out.push({ date: day?.date || iso, sets: ex.sets || [] });
      }catch{}
    }
    out.sort((a,b)=> a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
    historyScanCache.set(cacheKey, out);
    return out;
  }

  /* Heaviest set + biggest-volume session for an exercise across the given sessions. */
  function bestsFromSessions(sessions, mult = 1){
    let topSet = { weight:0, reps:0, date:null };
    let bestVol = { vol:0, date:null };

    sessions.forEach(s=>{
      let vol = 0;
      (s.sets||[]).forEach(st=>{
        const w = Number(st.weight)||0, r = Number(st.reps)||0;
        vol += w * r * mult;
        if(w > topSet.weight || (w === topSet.weight && r > topSet.reps)){
          topSet = { weight:w, reps:r, date:s.date };
        }
      });
      if(vol > bestVol.vol) bestVol = { vol, date:s.date };
    });

    return { topSet, bestVol, sessions: sessions.length };
  }

  /* Bests recorded on every day EXCEPT `excludeISO` — i.e. the mark to beat. */
  function priorBests(exName, bodyPart, excludeISO){
    return bestsFromSessions(scanExerciseSessions(exName, bodyPart, excludeISO),
                             volMult({ name: exName, bodyPart }));
  }

  /* Does this set beat the mark to beat? The baseline excludes today, so it
     stays frozen for the whole session — hit the same PR weight on sets 2, 3
     and 4 and every one of them lights up. Nothing is "banked" until Complete.
     A first-ever session is a baseline, not a PR, so it doesn't badge. */
  function beatsPriorPR(s, priorTop){
    const w = Number(s.weight)||0, r = Number(s.reps)||0;
    if(!w || !r) return false;
    if(!priorTop || !priorTop.weight) return false;
    return w > priorTop.weight || (w === priorTop.weight && r > priorTop.reps);
  }

  /* Heaviest set logged today for one exercise (ties broken by reps). */
  function topSetOf(ex){
    let best = { weight:0, reps:0 };
    (ex.sets||[]).forEach(s=>{
      const w = Number(s.weight)||0, r = Number(s.reps)||0;
      if(w > best.weight || (w === best.weight && r > best.reps)) best = { weight:w, reps:r };
    });
    return best;
  }

  /* What kind of personal record (if any) this exercise set today. */
  function prStatus(ex, iso){
    const top = topSetOf(ex);
    const { vol } = exStats(ex);
    const prior = priorBests(ex.name, ex.bodyPart, iso);

    const firstEver = prior.sessions === 0;
    const weightPR  = !firstEver && top.weight > 0 && top.weight > prior.topSet.weight;
    const repPR     = !firstEver && top.weight > 0 &&
                      top.weight === prior.topSet.weight && top.reps > prior.topSet.reps;
    const volumePR  = !firstEver && vol > 0 && vol > prior.bestVol.vol;

    return { top, vol, prior, firstEver, weightPR, repPR, volumePR,
             any: weightPR || repPR || volumePR };
  }

  /* ---------- PRs via TrainingStats ----------
     The newer PR kinds (strength = e1RM, rep PR at a weight, best set) come
     from TrainingStats.exercisePRs, judged against sessions strictly before
     the day. Without TrainingStats loaded these degrade to "no PRs". */

  const TS = ()=> window.TrainingStats || null;
  const fmtN = n => Math.round(Number(n)||0).toLocaleString();

  /* Finished exercises that set at least one PR on `iso`:
     [{ name, bodyPart, prs: [TrainingStats PR objects, tier 1 first] }] */
  function prHitsToday(day, iso){
    const T = TS(); if(!T) return [];
    const out = [];
    (day.exercises || []).filter(ex=> ex.finished).forEach(ex=>{
      const r = T.exercisePRs(ex, iso);
      if(r.list.length) out.push({ name: ex.name, bodyPart: ex.bodyPart,
        prs: r.list.slice().sort((a,b)=> a.tier - b.tier) });
    });
    return out;
  }

  /* One PR as display text: { value: '125×16', was: 'was 125×12' }. */
  function fmtPR(pr){
    const ws = p => p ? `${p.weight}×${p.reps}` : '';
    switch(pr.kind){
      case 'e1rm':      return { value: `e1RM ${fmtN(pr.value)}`, was: pr.prev ? `was ${fmtN(pr.prev)}` : '' };
      case 'weight':    return { value: ws(pr), was: pr.prev && pr.prev.weight ? `was ${ws(pr.prev)}` : '' };
      case 'reps':      return { value: ws(pr), was: pr.prev ? `was ${ws(pr.prev)}` : '' };
      case 'volume':    return { value: `${fmtN(pr.value)} lb`, was: pr.prev ? `was ${fmtN(pr.prev)}` : '' };
      case 'setVolume': return { value: `${fmtN(pr.value)} lb set`, was: pr.prev ? `was ${fmtN(pr.prev)}` : '' };
      default:          return { value: '', was: '' };
    }
  }

  /* Today's volume vs the last similar session, for the headline pill. */
  function volumeDelta(vol, similar){
    if(!similar || !(similar.vol > 0) || !(vol > 0)) return null;
    const delta = vol - similar.vol;
    return { dir: delta >= 0 ? 'up' : 'down', delta: Math.round(delta),
             pct: Math.round((Math.abs(delta) / similar.vol) * 100), date: similar.date };
  }

  /* Everything the live per-set PR badge needs, computed once per render:
     the frozen prior sessions, their top set and the rep-PR weight floor. */
  function livePRContext(ex, iso){
    const T = TS();
    const prior = T ? T.priorSessions(ex.name, ex.bodyPart, iso) : [];
    let topW = 0, topR = 0, e1 = 0;
    prior.forEach(s=>{
      if(s.topW > topW || (s.topW === topW && s.topR > topR)){ topW = s.topW; topR = s.topR; }
      e1 = Math.max(e1, s.e1 || 0);
    });
    return { prior, priorTop: { weight: topW, reps: topR },
             minW: e1 * (T ? T.REP_PR_MIN_PCT : 0.5), firstEver: prior.length === 0 };
  }

  /* 'pr' (heavier, or more reps at the top weight), 'rep' (beats the rep-best
     frontier at a lighter weight), or null. First-ever sessions never badge. */
  function setPRKind(s, ctx){
    if(!s || !ctx || ctx.firstEver) return null;
    const w = Number(s.weight)||0, r = Number(s.reps)||0;
    if(!w || !r) return null;
    if(beatsPriorPR(s, ctx.priorTop)) return 'pr';
    const T = TS();
    if(T && w >= ctx.minW && T.beatsFrontier(w, r, ctx.prior)) return 'rep';
    return null;
  }

  /* Rep-best frontier across prior sessions + today's sets, at most `max`
     points (today's new bests always kept), heaviest first.
     [{ weight, reps, today }] */
  function repBestsLine(prior, todaySets, iso, max = 6){
    const T = TS(); if(!T) return [];
    const sets = (todaySets || []).filter(s=> (Number(s.weight)||0) > 0 && (Number(s.reps)||0) > 0);
    const f = T.frontier((prior || []).concat(sets.length ? [{ date: iso, sets }] : []))
      .map(p=>({ weight: p.weight, reps: p.reps, today: p.date === iso && (prior || []).length > 0 }));
    if(f.length <= max) return f;
    const keep = new Set(f.map((p,i)=> p.today ? i : -1).filter(i=> i >= 0));
    const room = Math.max(0, max - keep.size);
    const others = f.map((p,i)=> i).filter(i=> !keep.has(i));
    for(let k=0; k<room; k++) keep.add(others[Math.round(k * (others.length - 1) / Math.max(1, room - 1))]);
    return f.filter((p,i)=> keep.has(i));
  }

  /* Sparkline: <=n most recent sessions as {date, weight, vol}, oldest → newest. */
  function trendPoints(exName, bodyPart, n = 8){
    return scanExerciseSessions(exName, bodyPart, null)
      .map(s=>{
        const weights = (s.sets||[]).map(x=>Number(x.weight)||0).filter(w=>w>0);
        return {
          date: s.date,
          weight: weights.length ? Math.max(...weights) : 0,
          vol: (s.sets||[]).reduce((a,x)=> a + setVol({ name: exName, bodyPart }, x), 0)
        };
      })
      .filter(p=> p.weight > 0)
      .slice(-n);
  }

  /* Most recent earlier day that trained at least one of today's body parts. */
  function findLastSimilarWorkout(day, iso){
    const todayParts = new Set(day.exercises.map(e=>e.bodyPart).filter(Boolean));
    if(!todayParts.size) return null;

    let best = null;
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(!WORKOUT_KEY_RE.test(k)) continue;
      const d = k.slice('powerUp:'.length);
      if(d >= iso) continue;
      if(best && d <= best.date) continue;

      try{
        const prev = JSON.parse(localStorage.getItem(k));
        const parts = (prev?.exercises||[]).map(e=>e.bodyPart).filter(Boolean);
        if(!parts.some(p=>todayParts.has(p))) continue;
        const vol = totalsFiltered(prev).vol;
        if(vol <= 0) continue;
        best = { date:d, vol };
      }catch{}
    }
    return best;
  }

  const PART_COLORS = {
    Chest:'#f87171', Back:'#60a5fa', Biceps:'#a78bfa', Triceps:'#f472b6',
    Shoulders:'#fbbf24', Legs:'#34d399', Lats:'#22d3ee', Forearms:'#fb923c',
    Cardio:'#94a3b8'
  };
  const partColor = p => PART_COLORS[p] || '#64748b';

  const POWER_LEVELS = [
    {th:0,    color:'#1e3a8a'},
    {th:1000, color:'#0ea5e9'},
    {th:2000, color:'#22c55e'},
    {th:3500, color:'#eab308'},
    {th:5000, color:'#f59e0b'},
    {th:6500, color:'#ef4444'},
    {th:8000, color:'#f5d142'}
  ];
  const levelFor = (vol)=> POWER_LEVELS.reduce((idx,lv,i)=> vol>=lv.th?i:idx,0);

  /* =========================
     Copy workout as JSON
     A self-describing snapshot of one day: totals, muscle split, every set, and
     the history each exercise is measured against — sized to paste straight into
     a chat assistant. Read-only; never writes to the stored day.
     ========================= */

  const round1 = (n)=> Math.round((Number(n)||0) * 10) / 10;

  function sumSets(sets, mult = 1){
    let reps = 0, vol = 0;
    (sets||[]).forEach(s=>{
      const w = Number(s.weight)||0, r = Number(s.reps)||0;
      reps += r; vol += w * r * mult;
    });
    return { reps, volume: Math.round(vol) };
  }

  function exportExercise(ex, iso){
    const cs      = countedSets(ex);
    const sum     = sumSets(cs, volMult(ex));
    const top     = topSetOf(ex);
    const prior   = priorBests(ex.name, ex.bodyPart, iso);
    const past    = scanExerciseSessions(ex.name, ex.bodyPart, iso);
    const last    = past.length ? past[past.length-1] : null;
    const lastSum = last ? sumSets(last.sets, volMult(ex)) : null;
    const st      = prStatus(ex, iso);

    return {
      name: ex.name,
      muscleGroup: ex.bodyPart || null,
      completed: !!ex.finished,
      sets: (ex.sets||[]).map((s, i)=>({
        set: i + 1,
        weightLb: Number(s.weight)||0,
        reps: Number(s.reps)||0,
        volumeLb: Math.round(setVol(ex, s)),
        completed: !!(ex.finished || s.done),
        superset: !!s.superset
      })),
      totals: {
        countedSets: cs.length,
        reps: sum.reps,
        volumeLb: sum.volume,
        avgWeightPerRepLb: sum.reps ? round1(sum.volume / sum.reps) : 0,
        topSet: { weightLb: top.weight, reps: top.reps }
      },
      personalRecordToday: st.any ? (st.weightPR ? 'weight' : (st.repPR ? 'reps' : 'volume')) : null,
      history: {
        priorSessionsLogged: prior.sessions,
        priorBestSet: prior.topSet.weight
          ? { weightLb: prior.topSet.weight, reps: prior.topSet.reps, date: prior.topSet.date }
          : null,
        priorBestSessionVolume: prior.bestVol.vol
          ? { volumeLb: Math.round(prior.bestVol.vol), date: prior.bestVol.date }
          : null,
        previousSession: last
          ? { date: last.date, sets: (last.sets||[]).length, reps: lastSum.reps, volumeLb: lastSum.volume }
          : null
      }
    };
  }

  function buildWorkoutExport(day, iso){
    const totals = totalsFiltered(day);

    const byPart = {};
    let totalReps = 0;
    day.exercises.forEach(ex=>{
      const p   = ex.bodyPart || 'Other';
      const cs  = countedSets(ex);
      const sum = sumSets(cs, volMult(ex));
      totalReps += sum.reps;
      const b = byPart[p] || (byPart[p] = { muscleGroup:p, exercises:0, sets:0, reps:0, volumeLb:0 });
      b.exercises++; b.sets += cs.length; b.reps += sum.reps; b.volumeLb += sum.volume;
    });
    const muscleGroups = Object.values(byPart)
      .sort((a,b)=> b.volumeLb - a.volumeLb)
      .map(b=> Object.assign(b, {
        pctOfSessionVolume: totals.vol ? round1((b.volumeLb / totals.vol) * 100) : 0
      }));

    const similar = findLastSimilarWorkout(day, iso);

    return {
      source: 'LevelUp · Power Up workout log',
      exportedAt: new Date().toISOString(),
      units: { weight:'lb', volume:'lb — weight × reps, summed over sets' },
      note: 'Only completed sets count toward volume totals; every logged set is listed with its own completed flag.',
      workout: {
        date: iso,
        weekday: new Intl.DateTimeFormat('en-US', { weekday:'long' }).format(new Date(iso + 'T00:00:00')),
        totals: {
          exercises: totals.exCount,
          loggedSets: day.exercises.reduce((n, ex)=> n + (ex.sets||[]).length, 0),
          completedSets: totals.sets,
          reps: totalReps,
          volumeLb: Math.round(totals.vol),
          avgWeightPerRepLb: totalReps ? round1(totals.vol / totalReps) : 0
        },
        muscleGroups,
        comparedToLastSimilarSession: similar ? {
          date: similar.date,
          volumeLb: Math.round(similar.vol),
          deltaVolumeLb: Math.round(totals.vol - similar.vol),
          deltaPct: similar.vol ? round1(((totals.vol - similar.vol) / similar.vol) * 100) : null
        } : null,
        exercises: day.exercises.map(ex=> exportExercise(ex, iso))
      }
    };
  }

  /* Clipboard write, with the old execCommand path for browsers that refuse the
     async API outside a secure context. */
  async function copyText(text){
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(text);
        return true;
      }
    }catch{}
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed; top:-1000px; left:0; opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }catch{ return false; }
  }

  /* ---------- Popups (history, copy JSON) ----------
     Built on first use and appended to <body>, so a host page needs no markup.
     While one is open, body.ss-popup-open hides the sticky totals strip. */

  const popups = {};
  function ensurePopup(name, innerHTML){
    if(popups[name]) return popups[name];
    const el = document.createElement('div');
    el.className = 'ss-popup';
    el.innerHTML = `<div class="ss-sheet"><button class="ss-x" aria-label="Close">✕</button>${innerHTML}</div>`;
    el.addEventListener('click', (e)=>{
      if(e.target === el || e.target.closest('.ss-x')) closePopup(el);
    });
    document.body.appendChild(el);
    popups[name] = el;
    return el;
  }
  function openPopup(el){ el.style.display = 'flex'; document.body.classList.add('ss-popup-open'); }
  function closePopup(el){
    el.style.display = 'none';
    if(!document.querySelector('.ss-popup[style*="flex"]')) document.body.classList.remove('ss-popup-open');
  }

  function copyPopup(){
    const el = ensurePopup('copy', `
      <h2 class="ss-sheet-title">Workout JSON</h2>
      <p class="json-hint">Tap the box to select it all, then copy and paste it into ChatGPT.</p>
      <textarea class="json-box" readonly spellcheck="false"></textarea>
      <div style="display:flex; gap:8px; margin-top:10px">
        <button class="mini-btn" data-role="copyAgain">Copy to clipboard</button>
      </div>
    `);
    if(!el.dataset.bound){
      el.dataset.bound = '1';
      const box = el.querySelector('.json-box');
      box.addEventListener('focus', ()=> box.select());
      el.querySelector('[data-role="copyAgain"]').addEventListener('click', async (e)=>{
        const ok = await copyText(box.value);
        e.target.textContent = ok ? '✓ Copied' : 'Select the text above to copy';
        setTimeout(()=>{ e.target.textContent = 'Copy to clipboard'; }, 1800);
      });
    }
    return el;
  }

  /* Mini line chart of top weight per session. Responsive: the SVG stretches
     (preserveAspectRatio=none) with a non-scaling stroke, and the end dot is an
     HTML element positioned in percentages so it stays circular. */
  function renderTrendSparkline(points, opts = {}){
    const wrap = document.createElement('div');
    wrap.className = 'trend' + (opts.large ? ' trend-lg' : '');

    if(points.length < 2){
      wrap.innerHTML = `<div class="trend-head"><span>Trend</span><b>First session</b></div>`;
      return wrap;
    }

    const vals = points.map(p=>p.weight);
    const vMin = Math.min(...vals), vMax = Math.max(...vals);
    const span = (vMax - vMin) || 1;
    const flat = vMax === vMin;

    const X = i => (i / (points.length - 1)) * 100;
    const Y = v => flat ? 15 : 26 - ((v - vMin) / span) * 22;

    const coords = points.map((p,i)=> [X(i), Y(p.weight)]);
    const line = coords.map(([x,y],i)=> `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const area = `${line} L100 30 L0 30 Z`;

    // one dot per session, so you can see how many sessions the line covers
    const dots = coords.map(([x,y],i)=>{
      const isLast = i === coords.length - 1;
      const cls = isLast
        ? (points[i].weight >= vMax ? 'trend-dot gold' : 'trend-dot')
        : 'trend-dot sm';
      return `<span class="${cls}" title="${mdFromISO(points[i].date)} · ${points[i].weight} lb"
        style="left:${x.toFixed(2)}%; top:${((y/30)*100).toFixed(2)}%"></span>`;
    }).join('');

    wrap.innerHTML = `
      <div class="trend-head">
        <span>Top weight · last ${points.length} sessions</span>
        <b>${vMin === vMax ? `${vMax} lb` : `${vMin}–${vMax} lb`}</b>
      </div>
      <div class="trend-plot">
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
          <path class="trend-area" d="${area}"/>
          <path class="trend-line" d="${line}" vector-effect="non-scaling-stroke"/>
        </svg>
        ${dots}
      </div>
      <div class="trend-foot">
        <span>${mdFromISO(points[0].date)}</span>
        <span>${mdFromISO(points[points.length-1].date)}</span>
      </div>
    `;
    return wrap;
  }

  /* History modal: the PR to beat, the weight trend, and every set of the recent
     sessions — the numbers you need to pick today's opening weight. */
  function openExerciseHistory(ex){
    const sessions = scanExerciseSessions(ex.name, ex.bodyPart, null)
      .map(s=>({ date: s.date, sets: (s.sets||[]).filter(x=> (Number(x.weight)||0) > 0 || (Number(x.reps)||0) > 0) }))
      .filter(s=> s.sets.length);

    if(!sessions.length){
      alert('No previous workout data found for this exercise');
      return;
    }

    const el = ensurePopup('history', `<h2 class="ss-sheet-title"></h2><div class="ss-hist-body"></div>`);
    el.querySelector('.ss-sheet-title').textContent = `${ex.name} — History`;
    const body = el.querySelector('.ss-hist-body');
    body.innerHTML = '';

    // heaviest set ever logged for this exercise
    const { topSet } = bestsFromSessions(sessions);
    const pr = document.createElement('div');
    pr.className = 'hist-pr';
    pr.innerHTML = `
      <span class="k">PR</span>
      <span class="v">${topSet.weight} lb × ${topSet.reps}</span>
      <span class="sep">·</span>
      <span class="note">${mdFromISO(topSet.date)}</span>
      <span class="sep">·</span>
      <span class="note">${sessions.length} session${sessions.length===1?'':'s'}</span>
    `;
    body.appendChild(pr);

    body.appendChild(renderTrendSparkline(trendPoints(ex.name, ex.bodyPart, 10), { large:true }));

    // recent sessions, newest first, with every set spelled out
    sessions.slice(-8).reverse().forEach(s=>{
      // index, not value — otherwise two identical top sets both get marked
      let topIdx = -1, best = {w:0, r:0};
      s.sets.forEach((x,i)=>{
        const w = Number(x.weight)||0, r = Number(x.reps)||0;
        if(w > best.w || (w === best.w && r > best.r)){ best = {w, r}; topIdx = i; }
      });

      const block = document.createElement('div');
      block.className = 'hist-session';
      block.innerHTML = `
        <div class="hist-head">
          <span class="hist-date">${mdFromISO(s.date)}</span>
          <span class="hist-meta">${s.sets.length} set${s.sets.length===1?'':'s'}</span>
        </div>
        <div class="hist-sets">
          ${s.sets.map((st,i)=>{
            const isTop = best.w > 0 && i === topIdx;
            return `<div class="hist-set${isTop ? ' set-top' : ''}">
              <span class="si-n">SET ${i+1}</span>
              <span class="si-w">${esc(st.weight ?? '—')}</span><span class="si-unit">lb</span>
              <span class="si-x">×</span><span class="si-r">${esc(st.reps ?? '—')}</span>
            </div>`;
          }).join('')}
        </div>
      `;
      body.appendChild(block);
    });

    openPopup(el);
  }

  function renderExerciseComparisonSummary(ex, iso){
    const st = prStatus(ex, iso);
    const { top, vol, weightPR, repPR } = st;

    // PRs and the marks to beat come from TrainingStats (sessions strictly
    // before `iso`); the older prStatus maths is the fallback without it.
    const T   = TS();
    const tsr = T ? T.exercisePRs(ex, iso) : null;
    const firstEver = tsr ? tsr.firstEver : st.firstEver;
    const volumePR  = tsr ? tsr.list.some(p=> p.kind === 'volume') : st.volumePR;
    const priorTop  = tsr ? { weight: tsr.prior.topW, reps: tsr.prior.topR, date: tsr.prior.topDate }
                          : st.prior.topSet;
    const bestVol   = tsr ? tsr.prior.vol : st.prior.bestVol.vol;

    const pctRaw  = bestVol > 0 ? Math.round((vol / bestVol) * 100) : (vol > 0 ? 100 : 0);
    const pct     = Math.max(0, Math.min(100, pctRaw));

    const topSetTxt = top.weight ? `${top.weight} lb × ${top.reps}` : '—';

    const prLine = firstEver
      ? `<span class="note">First time logging this exercise</span>`
      : `<span class="v">${priorTop.weight} lb × ${priorTop.reps}</span>
         <span class="sep">·</span>
         <span class="note">${mdFromISO(priorTop.date)}</span>`;

    const volNote = firstEver
      ? `<span class="note">no previous session to compare</span>`
      : volumePR
        ? `<span class="note gold">best ever — beat ${Math.round(bestVol).toLocaleString()} lb</span>`
        : `<span class="note">${pctRaw}% of best (${Math.round(bestVol).toLocaleString()} lb)</span>`;

    // top-set badges: strength (e1RM), weight, rep PR at a weight
    const kinds = tsr ? tsr.list.filter(p=> p.kind === 'e1rm' || p.kind === 'weight' || p.kind === 'reps') : [];
    let badge = '';
    if(tsr){
      badge = kinds.map(p=> p.kind === 'reps'
        ? `<span class="pr-badge t${p.tier}">Rep PR ${p.weight}×${p.reps}</span>`
        : `<span class="pr-badge t${p.tier}">${esc(p.label)}</span>`).join('');
    }else if(weightPR) badge = `<span class="note gold">🏆 new weight PR</span>`;
    else if(repPR)     badge = `<span class="note gold">🏆 new rep PR at ${top.weight} lb</span>`;
    if(!badge && firstEver) badge = `<span class="note">baseline</span>`;
    const topGold = tsr ? kinds.some(p=> p.tier === 1) : (weightPR || repPR);

    const e1 = tsr ? Math.round(tsr.today.e1) : 0;
    const e1Txt = e1 ? `<span class="note">e1RM ${e1}</span>` : '';

    // rep bests: prior sessions + today, today's new bests in gold
    const bests = T ? repBestsLine(T.priorSessions(ex.name, ex.bodyPart, iso), ex.sets, iso) : [];
    const bestsRow = bests.length ? `
      <div class="prsum-row prsum-bests">
        <span class="k">Rep bests</span>
        <span class="bests">${bests.map(p=>
          `<span class="${p.today ? 'gold' : ''}">${p.weight}×${p.reps}</span>`).join('<span class="sep">·</span>')}</span>
      </div>` : '';

    const wrap = document.createElement('div');
    wrap.className = 'prsum';
    wrap.innerHTML = `
      <div class="prsum-row">
        <span class="k">Top set</span>
        <span class="v${topGold ? ' gold' : ''}">${topSetTxt}</span>
        ${e1Txt}
        ${badge}
      </div>
      <div class="prsum-row">
        <span class="k">PR</span>
        ${prLine}
      </div>
      ${bestsRow}
      <div class="prsum-row">
        <span class="k">Volume</span>
        <span class="v${volumePR ? ' gold' : ''}">${Math.round(vol).toLocaleString()} lb</span>
        ${volNote}
      </div>
      <div class="prsum-bar"><i class="${volumePR ? 'gold' : ''}" style="width:${volumePR ? 100 : pct}%"></i></div>
    `;

    wrap.appendChild(renderTrendSparkline(trendPoints(ex.name, ex.bodyPart, 8)));
    return wrap;
  }

  /* One logged set, read-only. `pending` = not ticked Done yet (dashboard
     view of an unfinished exercise). */
  function renderLockedSet(exId, s, idx, isTop, pending, mult = 1){
    const row = document.createElement('div');
    const special = !!(s.restPause || s.superset || s.special || s.extra);
    row.className = 'set-item' + (special ? ' set-special' : '') + (isTop ? ' set-top' : '')
      + (pending ? ' set-pending' : '');
    row.dataset.exId = exId; row.dataset.idx = idx;
    const wNum = Number(s.weight)||0, rNum = Number(s.reps)||0;
    const w = (s.weight ?? '—');
    const r = (s.reps ?? '—');
    row.innerHTML =
      `<span class="si-n">SET ${idx+1}</span>` +
      `<span class="si-w">${esc(w)}</span><span class="si-unit">lb</span>` +
      `<span class="si-x">×</span><span class="si-r">${esc(r)}</span>` +
      `<span class="si-vol">${(wNum && rNum) ? (wNum*rNum*mult).toLocaleString()+' lb' : ''}</span>`;
    return row;
  }

  /* ---------- View ----------
     SessionSummary.create(root, opts) fills `root` with the summary markup and
     returns a view; call view.render(day, iso) whenever the day changes.

     opts.readOnly          no Undo button; unfinished exercises render locked
     opts.flash             sweep the volume card when the power level changes
     opts.collapse          { isCollapsed(key), setBulk([[key, bool]]) }
     opts.renderInProgress  (container, list, iso) → editable In Progress list
                            (ignored when readOnly)
  */

  const UI_COLLAPSE_KEY = 'powerUp:uiCollapsed';

  /* The workout page's saved collapse state. Its own key — never touches the
     `powerUp:YYYY-MM-DD` workout records. */
  const storedCollapse = {
    isCollapsed(key){
      try{ return !!(JSON.parse(localStorage.getItem(UI_COLLAPSE_KEY)) || {})[key]; }catch{ return false; }
    },
    setBulk(pairs){
      let m = {};
      try{ m = JSON.parse(localStorage.getItem(UI_COLLAPSE_KEY)) || {}; }catch{}
      pairs.forEach(([id, collapsed])=>{
        if(!id) return;
        if(collapsed) m[id] = 1; else delete m[id];
      });
      try{ localStorage.setItem(UI_COLLAPSE_KEY, JSON.stringify(m)); }catch{}
    }
  };

  /* Unsaved collapse state: everything starts folded, toggles last until reset(). */
  function memoryCollapse(){
    let m = {};
    return {
      isCollapsed(key){ return key in m ? m[key] : true; },
      setBulk(pairs){ pairs.forEach(([id, collapsed])=>{ if(id) m[id] = !!collapsed; }); },
      reset(){ m = {}; }
    };
  }

  const SHELL_HTML = `
    <section class="ss-card ss-power">
      <h3 class="sess-label ss-power-label">Volume</h3>
      <div class="top">
        <div class="ss-power-val">0 lb</div>
        <div class="ss-power-trend">—</div>
        <button class="copy-btn" data-act="copyWorkout" title="Tap: copy coach pack (12 wks) · Hold: more options" aria-label="Copy coach pack for ChatGPT; hold for more options">📋</button>
      </div>

      <div class="ss-stats">
        <div class="ss-stat"><b class="ss-s-sets">0</b><span class="ss-s-sets-k">sets</span></div>
        <div class="ss-stat"><b class="ss-s-reps">0</b><span>reps</span></div>
        <div class="ss-stat"><b class="ss-s-ex">0</b><span>exercises</span></div>
      </div>
      <div class="sess-prog ss-prog-thin" title="Sets done"><i class="ss-prog-fill" style="width:0%"></i></div>

      <div class="sess-block ss-xp-block">
        <div class="ss-xp-row">
          <span class="ss-k">Level earned</span>
          <b class="ss-xp-val">—</b>
          <span class="ss-xp-why"></span>
        </div>
        <div class="sess-prog ss-xp-track"><i class="ss-xp-fill" style="width:0%"></i></div>
      </div>

      <div class="sess-block ss-split-block">
        <h3 class="sess-label">Volume by muscle group</h3>
        <div class="ss-split-list"></div>
      </div>

      <div class="sess-block ss-pr-block">
        <h3 class="sess-label">PRs</h3>
        <div class="pr-hits ss-pr-hits"></div>
      </div>
    </section>

    <section class="ss-totals">
      <span class="ss-chip">Sets: <b class="ss-t-sets">0</b></span>
      <span class="ss-chip">Volume: <b class="ss-t-vol">0 lb</b></span>
      <span class="ss-chip">Exercises: <b class="ss-t-ex">0</b></span>
    </section>

    <section class="supergroup ss-sg-inprogress">
      <div class="sg-head">
        <h2>In Progress</h2>
        <div class="sg-actions">
          <button class="mini-btn" data-act="expandAll" data-scope="inprogress">Expand all</button>
          <button class="mini-btn" data-act="collapseAll" data-scope="inprogress">Collapse all</button>
        </div>
      </div>
      <div class="ss-log-inprogress"></div>
    </section>

    <section class="supergroup ss-sg-completed">
      <div class="sg-head">
        <h2>Completed</h2>
        <div class="sg-actions">
          <button class="mini-btn" data-act="expandAll" data-scope="completed">Expand all</button>
          <button class="mini-btn" data-act="collapseAll" data-scope="completed">Collapse all</button>
        </div>
      </div>
      <div class="ss-log-completed"></div>
    </section>
  `;

  function create(root, opts = {}){
    const readOnly = !!opts.readOnly;
    const collapse = opts.collapse || storedCollapse;
    const q = sel => root.querySelector(sel);

    root.classList.add('session-summary');
    root.innerHTML = SHELL_HTML;

    let curDay = null, curIso = null;
    let lastLevelIdx = -1;
    let copyFlashTimer = null;

    function applyPowerTheme(vol){
      const card = q('.ss-power');
      const idx = levelFor(vol);
      const col = POWER_LEVELS[idx].color;
      card.style.setProperty('--power-glow', col);
      const left = POWER_LEVELS[Math.max(0, idx-1)].color;
      const right = POWER_LEVELS[Math.min(POWER_LEVELS.length-1, idx+1)].color;
      const grad = `linear-gradient(90deg, transparent 0%, ${left}22 10%, ${col}55 30%, #ffffff22 50%, ${right}55 70%, transparent 90%)`;
      card.style.setProperty('--power-grad', grad);
      if(idx !== lastLevelIdx){
        if(opts.flash){
          document.body.classList.remove('level-up'); void card.offsetWidth; document.body.classList.add('level-up');
          setTimeout(()=>document.body.classList.remove('level-up'), 700);
        }
        lastLevelIdx = idx;
      }
    }

    function renderPowerCard(day, iso){
      const { vol } = totalsFiltered(day);

      q('.ss-power-val').textContent = Math.round(vol).toLocaleString() + ' lb';
      if(iso){
        const d = new Date(String(iso).slice(0,10) + 'T12:00:00');
        const wd = new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(d);
        q('.ss-power-label').textContent = `Volume · ${wd} ${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
      }

      // --- Headline: today vs the last workout that hit the same muscles ---
      const similar = findLastSimilarWorkout(day, iso);
      const trendEl = q('.ss-power-trend');
      trendEl.classList.remove('up','down','pill');
      const dv = volumeDelta(vol, similar);
      if(dv){
        trendEl.textContent = `${dv.dir === 'up' ? '▲' : '▼'} ${dv.pct}% vs ${mdFromISO(dv.date)}`;
        trendEl.title = `${dv.delta >= 0 ? '+' : '−'}${Math.abs(dv.delta).toLocaleString()} lb vs ${mdFromISO(dv.date)}`;
        trendEl.classList.add('pill', dv.dir);
      }else{
        trendEl.textContent = vol > 0 ? 'no comparable session yet' : '—';
        trendEl.title = '';
      }

      // --- Sets done / reps / exercises, with a thin session-progress bar ---
      let doneSets = 0, allSets = 0, reps = 0;
      day.exercises.forEach(ex=>{
        (ex.sets||[]).forEach(s=>{
          allSets++;
          if(ex.finished || s.done){ doneSets++; reps += Number(s.reps)||0; }
        });
      });
      const pctDone = allSets ? Math.round((doneSets/allSets)*100) : 0;
      const complete = allSets > 0 && doneSets === allSets;
      q('.ss-s-sets').textContent = allSets ? `${doneSets}/${allSets}` : '0';
      q('.ss-s-sets-k').textContent = complete ? 'sets ✓' : 'sets';
      q('.ss-s-reps').textContent = reps.toLocaleString();
      q('.ss-s-ex').textContent = day.exercises.length;
      const fill = q('.ss-prog-fill');
      fill.style.width = pctDone + '%';
      fill.classList.toggle('done', complete);

      // --- Share of a character level this workout earned (powerUp/workoutXP.js) ---
      const xp = window.WorkoutXP ? WorkoutXP.scoreAll().get(iso) : null;
      q('.ss-xp-block').style.display = xp ? '' : 'none';
      if(xp){
        q('.ss-xp-val').textContent = `+${xp.pct.toFixed(1)}%`;
        q('.ss-xp-fill').style.width = Math.min(100, xp.pct) + '%';
        q('.ss-xp-why').innerHTML = [
          `<span>Effort <b>${xp.work.toFixed(2)}×</b></span>`,
          `<span>Strength <b>${xp.strength.toFixed(2)}×</b></span>`,
          xp.bonus ? `<span>PR bonus <b>+${xp.bonus.toFixed(1)}%</b></span>` : ''
        ].join('');
      }

      // --- Volume split by muscle group ---
      const byPart = {};
      day.exercises.forEach(ex=>{
        const v = countedSets(ex).reduce((s,a)=> s + setVol(ex, a), 0);
        if(v <= 0) return;
        const p = ex.bodyPart || 'Other';
        byPart[p] = (byPart[p] || 0) + v;
      });
      const parts = Object.entries(byPart).sort((a,b)=> b[1]-a[1]);
      q('.ss-split-block').style.display = parts.length ? '' : 'none';
      if(parts.length){
        const maxV = parts[0][1];
        q('.ss-split-list').innerHTML = parts.map(([p,v])=>`
          <div class="split-row">
            <span class="split-name">${esc(p)}</span>
            <span class="split-track"><i style="width:${Math.round((v/maxV)*100)}%; background:${partColor(p)}"></i></span>
            <span class="split-val">${Math.round(v).toLocaleString()} lb · ${Math.round((v/vol)*100)}%</span>
          </div>
        `).join('');
      }

      // --- PRs set today (finished exercises only), one row per exercise ---
      const hits = prHitsToday(day, iso);
      q('.ss-pr-block').style.display = hits.length ? '' : 'none';
      if(hits.length){
        q('.ss-pr-hits').innerHTML = hits.map(h=>`
          <div class="pr-hit t${h.prs[0].tier}">
            <span class="pr-name">${esc(h.name)}</span>
            <span class="pr-segs">${h.prs.map(pr=>{
              const t = fmtPR(pr);
              return `<span class="pr-seg"><span class="pr-val">${esc(t.value)}</span>`
                + `<span class="pr-badge t${pr.tier}">${esc(pr.label)}</span>`
                + (t.was ? `<span class="pr-was">${esc(t.was)}</span>` : '') + `</span>`;
            }).join('')}</span>
          </div>
        `).join('');
      }

      applyPowerTheme(vol);
    }

    function renderTotals(day){
      const {sets, vol, exCount} = totalsFiltered(day);
      q('.ss-t-sets').textContent = sets;
      q('.ss-t-vol').textContent = Math.round(vol).toLocaleString() + ' lb';
      q('.ss-t-ex').textContent = exCount;
    }

    /* A finished exercise (or, read-only, an unfinished one): collapsible card
       with the PR summary, trend sparkline and every set in order. */
    function renderLockedExercise(ex, iso){
      const node = document.createElement('div');
      const pending = !ex.finished;
      node.className = 'ex finished' + (ex.copied ? ' copied' : '') + (pending ? ' ex-pending' : '');
      node.dataset.id = ex.id;
      node.setAttribute('tabindex','0');

      const {vol, avg} = exStats(ex);
      const copiedText = ex.copied ? ' (copied)' : '';

      const exKey = `ex:${ex.bodyPart}:${ex.name}`;
      node.dataset.key = exKey;
      if(collapse.isCollapsed(exKey)) node.classList.add('ex-collapsed');

      node.innerHTML = `
        <div class="ex-header" data-act="toggleCExercise">
          <span class="ex-chev">▼</span>
          <div class="ex-title">
            <div class="ex-name">${esc(ex.name)}${copiedText}</div>
            <div class="tag">${ex.sets.length} set${ex.sets.length===1?"":"s"} • ${Math.round(vol).toLocaleString()} lb • ${Math.round(avg)} lb/rep${volMult(ex) === 2 ? ' <span class="ph-mark" title="Weight is per hand; volume counts both">per hand ×2</span>' : ''}</div>
          </div>
          <div class="ex-head-actions">
            ${readOnly ? '' : '<button class="btn-undo" data-act="markComplete" title="Reopen for editing">↩ Undo</button>'}
            <!-- no 📊 here: expanding a completed card already shows its history chart -->
          </div>
        </div>

        <div class="ex-body">
          <div class="sets"></div>
        </div>
      `;

      const setsWrap = node.querySelector('.sets');
      // an unfinished exercise is judged on the sets actually done so far
      setsWrap.appendChild(renderExerciseComparisonSummary(
        pending ? Object.assign({}, ex, { sets: countedSets(ex) }) : ex, iso));

      // Sets in a single column, in the order they were performed.
      const setGrid = document.createElement('div');
      setGrid.className = 'set-grid';
      setsWrap.appendChild(setGrid);

      const top = topSetOf(ex);
      const topIdx = (ex.sets||[]).findIndex(s=>
        (Number(s.weight)||0) === top.weight && (Number(s.reps)||0) === top.reps
      );
      (ex.sets||[]).forEach((s,i)=>
        setGrid.appendChild(renderLockedSet(ex.id, s, i, top.weight > 0 && i === topIdx, pending && !s.done, volMult(ex)))
      );

      return node;
    }

    /* One collapsible section per body part, every exercise stacked inside it.
       Nothing is hidden behind a tab — scroll, don't select. */
    function renderLockedGroups(container, list, iso, keyPrefix){
      const groups = list.reduce((m,o)=>((m[o.bodyPart]??=[]).push(o),m),{});
      const bps = Object.keys(groups).sort();

      container.innerHTML = '';
      bps.forEach(bp=>{
        const exList  = groups[bp];
        const volume  = exList.reduce((s,ex)=> s + exStats(ex).vol, 0);
        const setCnt  = exList.reduce((s,ex)=> s + (ex.sets||[]).length, 0);
        const key     = keyPrefix + bp;

        const g = document.createElement('div');
        g.className = 'cgroup' + (collapse.isCollapsed(key) ? ' collapsed' : '');
        g.dataset.key = key;
        g.innerHTML = `
          <div class="cgroup-head" data-act="toggleCGroup">
            <span class="cgroup-chev">▼</span>
            <span class="cgroup-name">${esc(bp)}</span>
            <span class="cgroup-meta">${exList.length} ex · ${setCnt} sets · ${Math.round(volume).toLocaleString()} lb</span>
          </div>
          <div class="cgroup-body"></div>
        `;

        const body = g.querySelector('.cgroup-body');
        exList.forEach(ex=> body.appendChild(renderLockedExercise(ex, iso)));
        container.appendChild(g);
      });
      return bps.length;
    }

    function render(day, iso){
      curDay = day; curIso = iso;
      renderTop(day);

      const inProg = day.exercises.filter(ex=> !ex.completed);
      const done   = day.exercises.filter(ex=> !!ex.completed);

      const ipLog = q('.ss-log-inprogress');
      let ipCount;
      if(readOnly){
        ipCount = renderLockedGroups(ipLog, inProg, iso, 'ip:bp:');
      }else{
        ipLog.innerHTML = '';
        if(opts.renderInProgress) opts.renderInProgress(ipLog, inProg, iso);
        ipCount = ipLog.children.length;
      }
      q('.ss-sg-inprogress').classList.toggle('hidden', ipCount === 0);

      const cCount = renderLockedGroups(q('.ss-log-completed'), done, iso, 'bp:');
      q('.ss-sg-completed').classList.toggle('hidden', cCount === 0);
    }

    /* Volume card + totals only — cheap enough to run on every keystroke. */
    function renderTop(day){
      curDay = day;
      renderPowerCard(day, curIso);
      renderTotals(day);
    }

    function flashCopyBtn(msg, ok){
      const b = q('.copy-btn'); if(!b) return;
      clearTimeout(copyFlashTimer);
      b.textContent = msg;
      b.classList.toggle('ok', !!ok);
      copyFlashTimer = setTimeout(()=>{
        b.textContent = '📋';
        b.classList.remove('ok');
      }, 1800);
    }

    // 📋: tap copies the 12-week coach pack straight away; hold opens the options sheet
    const LONG_PRESS_MS = 500;
    let pressTimer = null, pressFired = false;
    const cancelPress = ()=>{ clearTimeout(pressTimer); pressTimer = null; };
    root.addEventListener('pointerdown', e=>{
      if(!e.target.closest('.copy-btn')) return;
      pressFired = false;
      cancelPress();
      pressTimer = setTimeout(()=>{
        pressTimer = null;
        if(!curDay || !curDay.exercises.length || !window.CoachExport) return;
        pressFired = true;
        if(navigator.vibrate) navigator.vibrate(15);
        window.CoachExport.open(curDay, curIso);
      }, LONG_PRESS_MS);
    });
    ['pointerup', 'pointercancel'].forEach(t=> root.addEventListener(t, cancelPress));
    root.addEventListener('pointerout', e=>{ if(e.target.closest('.copy-btn')) cancelPress(); });
    root.addEventListener('contextmenu', e=>{ if(e.target.closest('.copy-btn')) e.preventDefault(); });

    root.addEventListener('click', async (e)=>{
      // closest() so clicks land even when they hit a child of the labelled element
      const host = e.target.closest('[data-act]'); if(!host || !root.contains(host)) return;
      const act = host.dataset.act;

      // Completed view: remember which sections the user folded away
      if(act==='toggleCGroup'){
        const g = host.closest('.cgroup');
        if(g){ g.classList.toggle('collapsed'); collapse.setBulk([[g.dataset.key, g.classList.contains('collapsed')]]); }
        return;
      }
      if(act==='toggleCExercise'){
        const ex = host.closest('.ex');
        if(ex){ ex.classList.toggle('ex-collapsed'); collapse.setBulk([[ex.dataset.key, ex.classList.contains('ex-collapsed')]]); }
        return;
      }

      // Expand/collapse every section at once. "Collapse all" folds the
      // exercise cards but leaves the body-part sections open — that's the
      // compact one-screen view worth screenshotting.
      if(act==='expandAll' || act==='collapseAll'){
        const collapseIt = (act === 'collapseAll');
        const log = q(host.dataset.scope === 'completed' ? '.ss-log-completed' : '.ss-log-inprogress');
        const writes = [];
        log.querySelectorAll('.cgroup').forEach(g=>{
          g.classList.remove('collapsed');
          writes.push([g.dataset.key, false]);
        });
        log.querySelectorAll('.ex[data-key]').forEach(ex=>{
          ex.classList.toggle('ex-collapsed', collapseIt);
          writes.push([ex.dataset.key, collapseIt]);
        });
        // the workout page's editable In Progress groups
        log.querySelectorAll('.group').forEach(g=> g.classList.toggle('collapsed', collapseIt));
        collapse.setBulk(writes);
        return;
      }

      if(act==='viewHistory'){
        const exId = host.closest('.ex')?.dataset.id;
        const ex = curDay?.exercises.find(x=> x.id === exId);
        if(ex) openExerciseHistory(ex);
        return;
      }

      if(act==='copyWorkout'){
        if(!curDay || !curDay.exercises.length){ flashCopyBtn('–', false); return; }
        if(pressFired){ pressFired = false; return; }   // that was a long press — the sheet is open
        // the coach export (powerUp/coachExport.js): tap = quick copy, hold = sheet
        if(window.CoachExport && window.CoachExport.quickCopy){
          // false = clipboard blocked; quickCopy has opened the sheet to copy by hand
          if(await window.CoachExport.quickCopy(curDay, curIso)) flashCopyBtn('✓', true);
          return;
        }
        const text = JSON.stringify(buildWorkoutExport(curDay, curIso), null, 2);
        if(await copyText(text)){
          flashCopyBtn('✓', true);
        }else{
          const el = copyPopup();
          el.querySelector('.json-box').value = text;   // clipboard blocked — let them select it by hand
          openPopup(el);
        }
      }
    });

    return {
      render,
      renderTop,
      resetFlash(){ lastLevelIdx = -1; }
    };
  }

  window.SessionSummary = {
    // storage
    keyFor, loadDay, listWorkoutDates, adjacentWorkoutDate, clearCache,
    // stats
    exStats, countedSets, totalsFiltered, topSetOf, prStatus, priorBests,
    bestsFromSessions, scanExerciseSessions, beatsPriorPR, trendPoints,
    findLastSimilarWorkout, buildWorkoutExport, volMult, setVol,
    prHitsToday, fmtPR, volumeDelta, livePRContext, setPRKind, repBestsLine,
    // formatting
    esc, mdFromISO, dateLabel, partColor,
    // ui
    create, memoryCollapse, openExerciseHistory, renderTrendSparkline
  };
})();
