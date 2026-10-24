/* =========================
   WorkoutXP — how much of a character level each workout earns.

   A workout's score is a percentage of one level (100 = level up):

     pct = BASE_PCT × work × strength^STRENGTH_POWER + PR bonus

   work      How much you did, judged per body part against that part's own
             usual volume (median of its earlier sessions) — so a 25,000 lb
             legs day and an 8,000 lb arms day both count as "a full day".
   strength  Each exercise's best estimated 1-rep max today divided by where
             you started on it (median of its first sessions). As you get
             stronger the same workout earns more, and the power makes that
             gain accelerate.
   PR bonus  Flat extra for new weight / rep / volume PRs and for repeating
             your heaviest weight across several sets.

   Tuned on 58 real workouts (Aug 2025 – Oct 2026, 4-day split): a typical
   session earns ~25% (a level every ~4 workouts), heavy PR days ~35–40%.
   Reads the powerUp:YYYY-MM-DD records; never writes.
   ========================= */
(function(){
  'use strict';

  const BASE_PCT       = 15;    // a baseline workout at starting strength
  const STRENGTH_POWER = 1.5;   // >1: strength gains count for more than linear
  const WORK_MIN = 0.5, WORK_MAX = 1.2;           // per body-part volume ratio
  const STRENGTH_MIN = 0.7, STRENGTH_MAX = 2.0;   // per exercise e1RM ratio
  const ANCHOR_SESSIONS = 3;    // "where you started" = median of the first N
  const E1RM_REP_CAP = 15;      // high-rep sets stop inflating the estimate

  const PR_BONUS = {
    weight: 1.5,      // heavier top set than ever before
    reps: 1,          // same top weight, more reps
    volume: 0.5,      // most total volume for the exercise
    maxRepeat: 0.5,   // each extra set at/above your previous heaviest...
    maxRepeatCap: 1.5 // ...up to this much per exercise
  };
  const BONUS_CAP = 6;

  const num = v => Number(v) || 0;
  const e1rm = (w, r) => (w > 0 && r > 0) ? w * (1 + Math.min(r, E1RM_REP_CAP) / 30) : 0;
  const median = arr => {
    const a = arr.slice().sort((x,y)=> x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
  };
  const mean = arr => arr.reduce((s,x)=> s + x, 0) / arr.length;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const exKey = ex => `${ex.bodyPart || ''}|${String(ex.name || '').toLowerCase().trim()}`;

  /* Sets that count: all of a finished exercise, else only those ticked Done. */
  function countedSets(ex){
    const sets = ex.sets || [];
    return (ex.finished ? sets : sets.filter(s=> !!s.done))
      .filter(s=> num(s.weight) > 0 && num(s.reps) > 0);
  }

  function readDays(){
    const days = [];
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(!/^powerUp:\d{4}-\d{2}-\d{2}$/.test(k)) continue;
      try{
        const d = JSON.parse(localStorage.getItem(k));
        if(d) days.push({ date: k.slice('powerUp:'.length), exercises: d.exercises || [] });
      }catch{}
    }
    return days.sort((a,b)=> a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
  }

  /* Score every workout in date order. Each one is judged only against the
     sessions before it, so past scores never shift when you log new ones.
     Returns Map(date -> { pct, work, strength, bonus, prs: [{name, kind}] }). */
  function scoreAll(days = readDays()){
    const exHist = new Map();     // exercise -> [{ e1, topW, topR, vol }]
    const partHist = new Map();   // body part -> [volume per session]
    const out = new Map();

    days.forEach(day=>{
      const partVol = new Map();
      const ratios = [];
      const prs = [];
      let bonus = 0;

      (day.exercises || []).forEach(ex=>{
        const cs = countedSets(ex);
        if(!cs.length) return;

        const vol  = cs.reduce((s,x)=> s + num(x.weight) * num(x.reps), 0);
        const best = Math.max(...cs.map(x=> e1rm(num(x.weight), num(x.reps))));
        const topW = Math.max(...cs.map(x=> num(x.weight)));
        const topR = Math.max(...cs.filter(x=> num(x.weight) === topW).map(x=> num(x.reps)));
        const part = ex.bodyPart || 'Other';
        partVol.set(part, (partVol.get(part) || 0) + vol);

        const key = exKey(ex);
        const hist = exHist.get(key) || [];
        if(hist.length){
          const anchor = median(hist.slice(0, ANCHOR_SESSIONS).map(h=> h.e1));
          if(anchor > 0) ratios.push(clamp(best / anchor, STRENGTH_MIN, STRENGTH_MAX));

          const prevW = Math.max(...hist.map(h=> h.topW));
          const prevR = Math.max(0, ...hist.filter(h=> h.topW === prevW).map(h=> h.topR));
          const prevV = Math.max(...hist.map(h=> h.vol));
          if(topW > prevW){ bonus += PR_BONUS.weight; prs.push({ name: ex.name, kind: 'weight' }); }
          else if(topW === prevW && topR > prevR){ bonus += PR_BONUS.reps; prs.push({ name: ex.name, kind: 'reps' }); }
          else if(vol > prevV){ bonus += PR_BONUS.volume; prs.push({ name: ex.name, kind: 'volume' }); }

          const atMax = cs.filter(x=> num(x.weight) >= prevW).length;
          if(atMax >= 2) bonus += Math.min(PR_BONUS.maxRepeatCap, (atMax - 1) * PR_BONUS.maxRepeat);
        }
        hist.push({ e1: best, topW, topR, vol });
        exHist.set(key, hist);
      });

      if(!partVol.size) return;   // nothing counted — rest day or not started

      const work = mean([...partVol].map(([part, vol])=>{
        const prior = partHist.get(part) || [];
        const ratio = prior.length ? vol / median(prior) : 1;
        partHist.set(part, prior.concat(vol));
        return clamp(ratio, WORK_MIN, WORK_MAX);
      }));
      const strength = ratios.length ? mean(ratios) : 1;
      bonus = Math.min(bonus, BONUS_CAP);

      const pct = BASE_PCT * work * Math.pow(strength, STRENGTH_POWER) + bonus;
      out.set(day.date, { pct, work, strength, bonus, prs });
    });
    return out;
  }

  /* Level-% earned by workouts dated strictly after `isoDate`. */
  function pctSince(isoDate, scores = scoreAll()){
    let total = 0;
    scores.forEach((s, date)=>{ if(date > isoDate) total += s.pct; });
    return total;
  }

  window.WorkoutXP = {
    scoreAll, pctSince, readDays,
    BASE_PCT, STRENGTH_POWER, PR_BONUS, BONUS_CAP
  };
})();
