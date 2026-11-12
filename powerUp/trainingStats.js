/* =========================
   TrainingStats — the shared workout maths behind the workout card, the
   analytics page and the coach export.

   One pass over the powerUp:YYYY-MM-DD records builds an index of every
   exercise's sessions; everything else (e1RM, rep bests, PRs, weekly sets per
   muscle, stalls) is computed from that index. Read-only against workouts;
   the only keys it writes are its own settings (per-hand list).

   Per-hand exercises: dumbbell / single-arm cable work is logged as the weight
   in ONE hand. Volume doubles it (both hands moved the weight); weights, PRs
   and e1RM stay per hand, because that's the number you load.
   ========================= */
(function(){
  'use strict';

  const WORKOUT_KEY_RE = /^powerUp:\d{4}-\d{2}-\d{2}$/;
  const PER_HAND_KEY   = 'powerUp:perHand';

  const E1RM_REP_CAP   = 15;    // high-rep sets stop inflating the estimate (matches workoutXP)
  const REP_PR_MIN_PCT = 0.5;   // rep PRs only count at >= 50% of your best e1RM
  const HARD_SET_PCT   = 0.5;   // a set counts toward weekly sets at >= 50% of that day's top weight
  const STALL_SESSIONS = 5;     // no e1RM gain across this many sessions = stalled

  const num = v => Number(v) || 0;
  const round1 = n => Math.round((Number(n)||0) * 10) / 10;
  const normName = s => String(s || '').toLowerCase().trim();
  const exKey = (name, bodyPart) => `${bodyPart || ''}|${normName(name)}`;

  /* Epley, rep-capped. 0 for a set with no weight or no reps. */
  function e1rm(w, r){
    w = num(w); r = num(r);
    return (w > 0 && r > 0) ? w * (1 + Math.min(r, E1RM_REP_CAP) / 30) : 0;
  }

  /* ---------- Per-hand ---------- */

  function readPerHand(){
    try{ return JSON.parse(localStorage.getItem(PER_HAND_KEY)) || {}; }catch{ return {}; }
  }
  function isPerHand(name, bodyPart){ return !!readPerHand()[exKey(name, bodyPart)]; }
  function setPerHand(name, bodyPart, on){
    const m = readPerHand();
    const k = exKey(name, bodyPart);
    if(on) m[k] = 1; else delete m[k];
    try{ localStorage.setItem(PER_HAND_KEY, JSON.stringify(m)); }catch{}
    clearCache();
  }
  /* Volume multiplier for an exercise object ({ name, bodyPart }). */
  function volMult(ex){ return ex && isPerHand(ex.name, ex.bodyPart) ? 2 : 1; }

  /* Volume of one set of `ex`, per-hand aware. */
  function setVolume(ex, s){ return num(s && s.weight) * num(s && s.reps) * volMult(ex); }

  /* Volume of `sets` (default: all of ex.sets), per-hand aware. */
  function exVolume(ex, sets){
    const m = volMult(ex);
    return (sets || (ex && ex.sets) || []).reduce((a, s)=> a + num(s.weight) * num(s.reps) * m, 0);
  }

  /* ---------- Reading workouts ---------- */

  /* Sets that count: all of a finished exercise, else those ticked Done. Days
     imported without done flags fall back to every set with a weight and reps. */
  function countedSets(ex){
    const all = (ex.sets || []).filter(s=> num(s.weight) > 0 && num(s.reps) > 0);
    if(ex.finished) return all;
    const done = all.filter(s=> !!s.done);
    const anyFlag = (ex.sets || []).some(s=> 'done' in s);
    return (done.length || anyFlag) ? done : all;
  }

  function readDays(){
    const days = [];
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(!WORKOUT_KEY_RE.test(k)) continue;
      try{
        const d = JSON.parse(localStorage.getItem(k));
        if(d && (d.exercises || []).length) days.push({ date: k.slice('powerUp:'.length), exercises: d.exercises });
      }catch{}
    }
    return days.sort((a,b)=> a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
  }

  /* Summary of one exercise's sets on one day. */
  function summarizeSets(ex, sets){
    const mult = volMult(ex);
    let vol = 0, reps = 0, topW = 0, topR = 0, bestE1 = 0, bestSetVol = 0;
    sets.forEach(s=>{
      const w = num(s.weight), r = num(s.reps);
      vol += w * r * mult; reps += r;
      if(w > topW || (w === topW && r > topR)){ topW = w; topR = r; }
      bestE1 = Math.max(bestE1, e1rm(w, r));
      bestSetVol = Math.max(bestSetVol, w * r * mult);
    });
    return { vol, reps, topW, topR, e1: bestE1, bestSetVol, setCount: sets.length };
  }

  /* Index of every exercise: key -> { key, name, bodyPart, perHand, sessions: [
       { date, sets: [{weight, reps, superset}], vol, reps, topW, topR, e1, bestSetVol } ] }
     sessions oldest → newest. Memoised until clearCache(). */
  let indexCache = null;
  function clearCache(){ indexCache = null; }

  function buildIndex(days){
    const useCache = !days;
    if(useCache && indexCache) return indexCache;
    days = days || readDays();

    const exercises = new Map();
    days.forEach(day=>{
      (day.exercises || []).forEach(ex=>{
        const cs = countedSets(ex);
        if(!cs.length) return;
        const key = exKey(ex.name, ex.bodyPart);
        let rec = exercises.get(key);
        if(!rec){
          rec = { key, name: ex.name, bodyPart: ex.bodyPart || 'Other', perHand: volMult(ex) === 2, sessions: [] };
          exercises.set(key, rec);
        }
        rec.name = ex.name;   // latest spelling wins
        const mapped = cs.map(s=>({ weight: num(s.weight), reps: num(s.reps), superset: !!s.superset }));
        // logged twice on one day (e.g. re-added later) → one session
        const last = rec.sessions[rec.sessions.length - 1];
        if(last && last.date === day.date){
          const merged = last.sets.concat(mapped);
          Object.assign(last, { sets: merged }, summarizeSets(ex, merged));
          return;
        }
        rec.sessions.push(Object.assign({ date: day.date, sets: mapped }, summarizeSets(ex, mapped)));
      });
    });
    const idx = { days, exercises };
    if(useCache) indexCache = idx;
    return idx;
  }

  function exerciseHistory(name, bodyPart, idx){
    return (idx || buildIndex()).exercises.get(exKey(name, bodyPart)) || null;
  }

  /* Sessions of one exercise strictly before `iso` (or all, if no iso). */
  function priorSessions(name, bodyPart, iso, idx){
    const rec = exerciseHistory(name, bodyPart, idx);
    if(!rec) return [];
    return iso ? rec.sessions.filter(s=> s.date < iso) : rec.sessions.slice();
  }

  /* ---------- Rep bests (the "best reps at a weight" frontier) ----------
     A set W×R is on the frontier when no other set was at least W lb for at
     least R reps. Returned heaviest first, e.g. 140×5, 130×6, 120×7, 100×12. */
  function frontier(sessions){
    const pts = [];
    (sessions || []).forEach(s=> (s.sets || []).forEach(x=>{
      const w = num(x.weight), r = num(x.reps);
      if(w > 0 && r > 0) pts.push({ weight: w, reps: r, date: s.date });
    }));
    // heaviest first; same weight → most reps first; ties keep the earliest date
    pts.sort((a,b)=> b.weight - a.weight || b.reps - a.reps || (a.date < b.date ? -1 : 1));
    const out = [];
    let bestReps = 0;
    pts.forEach(p=>{
      if(p.reps > bestReps){ out.push(p); bestReps = p.reps; }
    });
    return out;
  }

  /* Rep-max table: heaviest weight done for at least N reps, per bucket. */
  const REP_BUCKETS = [
    { label: '1–3',  min: 1,  max: 3 },
    { label: '4–6',  min: 4,  max: 6 },
    { label: '7–9',  min: 7,  max: 9 },
    { label: '10–12',min: 10, max: 12 },
    { label: '13+',  min: 13, max: Infinity }
  ];
  function repBests(sessions){
    const f = frontier(sessions);
    return REP_BUCKETS.map(b=>{
      // best set whose reps land in this bucket (heaviest; ties → more reps)
      let best = null;
      (sessions || []).forEach(s=> (s.sets || []).forEach(x=>{
        const w = num(x.weight), r = num(x.reps);
        if(w <= 0 || r < b.min || r > b.max) return;
        if(!best || w > best.weight || (w === best.weight && r > best.reps)) best = { weight: w, reps: r, date: s.date };
      }));
      return { label: b.label, min: b.min, max: b.max, best };
    }).map(row=> Object.assign(row, { onFrontier: !!(row.best && f.some(p=> p.weight === row.best.weight && p.reps === row.best.reps)) }));
  }

  /* Would W×R beat the frontier of `sessions`? */
  function beatsFrontier(w, r, sessions){
    w = num(w); r = num(r);
    if(w <= 0 || r <= 0) return false;
    return !(sessions || []).some(s=> (s.sets || []).some(x=> num(x.weight) >= w && num(x.reps) >= r));
  }

  /* ---------- PRs ----------
     PRs for one exercise's sets today, judged against every session BEFORE
     `iso` (so the mark to beat stays frozen through the workout). A first-ever
     session is a baseline, never a PR.

     Returns { firstEver, prior: {topW, topR, e1, vol, bestSetVol, sessions},
               list: [{ kind, tier, label, weight?, reps?, value?, prev? }] }
     kinds: 'e1rm' | 'weight' | 'reps' (rep PR at a weight) | 'volume' (session) | 'setVolume' */
  function exercisePRs(ex, iso, sets, idx){
    const prior = priorSessions(ex.name, ex.bodyPart, iso, idx);
    const cs = (sets || countedSets(ex)).filter(s=> num(s.weight) > 0 && num(s.reps) > 0);
    const today = summarizeSets(ex, cs);

    const p = { topW: 0, topR: 0, e1: 0, vol: 0, bestSetVol: 0, sessions: prior.length, e1Date: null, topDate: null, volDate: null };
    prior.forEach(s=>{
      if(s.topW > p.topW || (s.topW === p.topW && s.topR > p.topR)){ p.topW = s.topW; p.topR = s.topR; p.topDate = s.date; }
      if(s.e1 > p.e1){ p.e1 = s.e1; p.e1Date = s.date; }
      if(s.vol > p.vol){ p.vol = s.vol; p.volDate = s.date; }
      p.bestSetVol = Math.max(p.bestSetVol, s.bestSetVol);
    });

    const list = [];
    const firstEver = prior.length === 0;
    if(firstEver || !cs.length) return { firstEver, prior: p, today, list };

    if(today.e1 > p.e1 + 0.01){
      list.push({ kind: 'e1rm', tier: 1, label: 'Strength PR', value: Math.round(today.e1), prev: Math.round(p.e1) });
    }
    if(today.topW > p.topW){
      list.push({ kind: 'weight', tier: 1, label: 'Weight PR', weight: today.topW, reps: today.topR,
                  prev: { weight: p.topW, reps: p.topR } });
    }

    // Rep PR at a weight: the best set today that beats the old frontier,
    // excluding sets already counted as the weight PR and very light sets.
    const minW = p.e1 * REP_PR_MIN_PCT;
    let repHit = null;
    cs.forEach(s=>{
      const w = num(s.weight), r = num(s.reps);
      if(w > p.topW) return;              // that's a weight PR, not a rep PR
      if(w < minW) return;                // too light to mean anything
      if(!beatsFrontier(w, r, prior)) return;
      if(!repHit || e1rm(w, r) > e1rm(repHit.weight, repHit.reps)) repHit = { weight: w, reps: r };
    });
    if(repHit){
      // previous best at this weight or heavier
      let prev = null;
      prior.forEach(s=> s.sets.forEach(x=>{
        if(x.weight >= repHit.weight && (!prev || x.reps > prev.reps)) prev = { weight: x.weight, reps: x.reps, date: s.date };
      }));
      list.push({ kind: 'reps', tier: 2, label: 'Rep PR', weight: repHit.weight, reps: repHit.reps, prev });
    }

    if(today.vol > p.vol){
      list.push({ kind: 'volume', tier: 2, label: 'Volume PR', value: Math.round(today.vol), prev: Math.round(p.vol) });
    }
    if(today.bestSetVol > p.bestSetVol && !list.some(x=> x.kind === 'reps' || x.kind === 'weight')){
      list.push({ kind: 'setVolume', tier: 3, label: 'Best set', value: Math.round(today.bestSetVol), prev: Math.round(p.bestSetVol) });
    }
    return { firstEver, prior: p, today, list };
  }

  /* Every PR event across history (each session judged against the ones
     before it), newest first. [{ date, name, bodyPart, kind, tier, label, ... }] */
  function prTimeline(idx){
    idx = idx || buildIndex();
    const out = [];
    idx.exercises.forEach(rec=>{
      rec.sessions.forEach((s, i)=>{
        if(i === 0) return;
        const fakeEx = { name: rec.name, bodyPart: rec.bodyPart, finished: true, sets: s.sets };
        const r = exercisePRs(fakeEx, s.date, s.sets, idx);
        r.list.forEach(pr=> out.push(Object.assign({ date: s.date, name: rec.name, bodyPart: rec.bodyPart }, pr)));
      });
    });
    return out.sort((a,b)=> a.date < b.date ? 1 : (a.date > b.date ? -1 : a.tier - b.tier));
  }

  /* ---------- Set roles (for exports) ----------
     Guessed from the shape of the day: light sets before the first top-weight
     set are warm-ups, lighter sets after it are back-offs. */
  function setRoles(sets){
    const ws = (sets || []).map(s=> num(s.weight));
    const topW = Math.max(0, ...ws);
    const firstTop = ws.indexOf(topW);
    return ws.map((w, i)=>{
      if(!topW || !w) return 'work';
      if(i < firstTop && w < topW * 0.6) return 'warmup';
      if(i > firstTop && w <= topW * 0.85) return 'backoff';
      return 'work';
    });
  }

  /* ---------- Dates & weeks ---------- */

  const toDate = iso => new Date(String(iso).slice(0,10) + 'T12:00:00');
  const isoOf  = d => {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
  };
  function addDays(iso, n){ const d = toDate(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  function daysBetween(a, b){ return Math.round((toDate(b) - toDate(a)) / 86400000); }
  /* Monday of the week containing iso. */
  function weekStart(iso){
    const d = toDate(iso);
    const dow = (d.getDay() + 6) % 7;   // Mon = 0
    d.setDate(d.getDate() - dow);
    return isoOf(d);
  }

  /* Hard sets of one exercise on one day: >= HARD_SET_PCT of that day's top weight. */
  function hardSetCount(sets){
    const topW = Math.max(0, ...(sets || []).map(s=> num(s.weight)));
    return (sets || []).filter(s=> num(s.weight) >= topW * HARD_SET_PCT && num(s.reps) > 0).length;
  }

  /* Weekly totals for the `weeks` weeks ending with the week of `endIso`
     (oldest → newest): [{ weekStart, workouts, sets, volume, byPart: {part: {sets, volume}} }] */
  function weeklySummary(weeks, endIso, idx){
    idx = idx || buildIndex();
    endIso = endIso || isoOf(new Date());
    const lastWk = weekStart(endIso);
    const out = [];
    for(let i = weeks - 1; i >= 0; i--){
      out.push({ weekStart: addDays(lastWk, -7 * i), workouts: 0, sets: 0, volume: 0, byPart: {} });
    }
    const first = out[0].weekStart;
    const dates = new Set();
    idx.exercises.forEach(rec=> rec.sessions.forEach(s=>{
      if(s.date < first || s.date > addDays(lastWk, 6)) return;
      const wk = out.find(w=> w.weekStart === weekStart(s.date));
      if(!wk) return;
      const n = hardSetCount(s.sets);
      const part = rec.bodyPart || 'Other';
      const bp = wk.byPart[part] || (wk.byPart[part] = { sets: 0, volume: 0 });
      bp.sets += n; bp.volume += s.vol;
      wk.sets += n; wk.volume += s.vol;
      dates.add(s.date);
    }));
    dates.forEach(d=>{ const wk = out.find(w=> w.weekStart === weekStart(d)); if(wk) wk.workouts++; });
    out.forEach(w=>{ w.volume = Math.round(w.volume); Object.values(w.byPart).forEach(b=> b.volume = Math.round(b.volume)); });
    return out;
  }

  /* Last date each body part was trained (on or before asOf), and days since. */
  function lastTrainedByPart(asOf, idx){
    idx = idx || buildIndex();
    asOf = asOf || isoOf(new Date());
    const last = {};
    idx.exercises.forEach(rec=> rec.sessions.forEach(s=>{
      if(s.date > asOf) return;
      const p = rec.bodyPart || 'Other';
      if(!last[p] || s.date > last[p]) last[p] = s.date;
    }));
    return Object.keys(last).map(part=>({ part, date: last[part], daysAgo: daysBetween(last[part], asOf) }))
      .sort((a,b)=> b.daysAgo - a.daysAgo);
  }

  /* ---------- Trends & stalls ---------- */

  /* e1RM per session, oldest → newest: [{ date, e1, topW, topR, vol }] */
  function e1rmSeries(name, bodyPart, idx){
    const rec = exerciseHistory(name, bodyPart, idx);
    return rec ? rec.sessions.map(s=>({ date: s.date, e1: round1(s.e1), topW: s.topW, topR: s.topR, vol: Math.round(s.vol) })) : [];
  }

  /* % change in best e1RM: last `n` sessions' best vs the `n` before them. null if too few. */
  function e1rmTrendPct(sessions, n = 3){
    if(!sessions || sessions.length < n + 1) return null;
    const recent = sessions.slice(-n), before = sessions.slice(-2 * n, -n);
    if(!before.length) return null;
    const a = Math.max(...before.map(s=> s.e1)), b = Math.max(...recent.map(s=> s.e1));
    return a > 0 ? round1(((b - a) / a) * 100) : null;
  }

  /* Exercises whose best e1RM hasn't improved over their last STALL_SESSIONS
     sessions, among those trained in the last `activeDays` days. */
  function stalls(asOf, idx, activeDays = 45){
    idx = idx || buildIndex();
    asOf = asOf || isoOf(new Date());
    const out = [];
    idx.exercises.forEach(rec=>{
      const ss = rec.sessions.filter(s=> s.date <= asOf);
      if(ss.length < STALL_SESSIONS + 1) return;
      if(daysBetween(ss[ss.length-1].date, asOf) > activeDays) return;
      const window = ss.slice(-STALL_SESSIONS);
      const before = ss.slice(0, -STALL_SESSIONS);
      const bestBefore = Math.max(...before.map(s=> s.e1));
      const bestRecent = Math.max(...window.map(s=> s.e1));
      if(bestRecent <= bestBefore + 0.01){
        out.push({ name: rec.name, bodyPart: rec.bodyPart, sessions: STALL_SESSIONS,
                   bestE1: Math.round(bestBefore), recentE1: Math.round(bestRecent),
                   since: window[0].date });
      }
    });
    return out;
  }

  /* One-line summary for every exercise, sorted by most recent. */
  function exerciseList(idx){
    idx = idx || buildIndex();
    return [...idx.exercises.values()].map(rec=>{
      const ss = rec.sessions;
      const last = ss[ss.length-1];
      const bestE1 = Math.max(0, ...ss.map(s=> s.e1));
      return { key: rec.key, name: rec.name, bodyPart: rec.bodyPart, perHand: rec.perHand,
               sessions: ss.length, firstDate: ss[0].date, lastDate: last.date,
               bestE1: Math.round(bestE1), lastE1: Math.round(last.e1),
               trendPct: e1rmTrendPct(ss) };
    }).sort((a,b)=> a.lastDate < b.lastDate ? 1 : (a.lastDate > b.lastDate ? -1 : 0));
  }

  /* Compact "120×6, 120×6, 85×15" for a list of sets. Repeats collapse: "3×(120×6)"? no —
     keep every set so the order (and fatigue) is visible to a reader. */
  function fmtSets(sets){
    return (sets || []).map(s=> `${num(s.weight)}×${num(s.reps)}${s.superset ? 'rp' : ''}`).join(', ');
  }

  window.TrainingStats = {
    // constants
    PER_HAND_KEY, E1RM_REP_CAP, REP_PR_MIN_PCT, HARD_SET_PCT, STALL_SESSIONS, REP_BUCKETS,
    // per-hand + volume
    isPerHand, setPerHand, volMult, setVolume, exVolume,
    // reading
    countedSets, readDays, buildIndex, clearCache, exerciseHistory, priorSessions, exKey,
    // strength
    e1rm, frontier, repBests, beatsFrontier, exercisePRs, prTimeline, setRoles,
    e1rmSeries, e1rmTrendPct, stalls, exerciseList,
    // calendar
    weeklySummary, lastTrainedByPart, weekStart, addDays, daysBetween, isoOf, hardSetCount,
    // formatting
    fmtSets, round1
  };
})();
