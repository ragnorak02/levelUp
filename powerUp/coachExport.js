/* =========================
   CoachExport — the "copy for ChatGPT" export.

   Two formats, both built from TrainingStats (never re-deriving the maths):
   - Coach pack: compact plain text an LLM (or a human) can read at a glance —
     today's sets in W×R form with PRs, recent history and rep bests per
     exercise, then weekly sets per muscle, days since trained, stalls, recent
     PRs, every other exercise in the window, and a closing ASK.
   - Raw JSON (levelup.workout.v2): the same facts, structured, for archiving.

   window.CoachExport = { open(day, iso), buildCoachPack(opts), buildRawJson(opts),
                          getProfile(), saveProfile(p), openProfile() }

   The build functions are DOM-free (the Node test runner requires this file);
   the sheet UI and its CSS are only touched from open()/openProfile().
   Settings it owns: powerUp:coachProfile, powerUp:coachExportPrefs.
   ========================= */
(function(){
  'use strict';

  const PROFILE_KEY = 'powerUp:coachProfile';
  const PREFS_KEY   = 'powerUp:coachExportPrefs';
  const WEEK_CHOICES = [4, 8, 12];
  const RECENT_SESSIONS = 5;      // history lines per exercise in the pack
  const FRONTIER_MAX = 8;         // rep-best points per exercise
  const PR_DAYS = 30;
  const PR_LIST_MAX = 12;
  const CHARS_PER_TOKEN = 3.6;

  const DEFAULT_ASK = "Act as my strength coach. Review today's session against my history, " +
    "point out what's improving or stalling, and suggest my next session for these muscle " +
    'groups with specific weights and reps.';

  const PROFILE_FIELDS = ['goal', 'bodyweightLb', 'bodyweightDate', 'heightIn', 'age',
    'experience', 'injuries', 'equipment', 'schedule', 'notes', 'ask'];

  const TS = ()=> window.TrainingStats;
  const num = v => Number(v) || 0;
  const fmtN = n => Math.round(num(n)).toLocaleString('en-US');
  const signPct = p => (p > 0 ? '+' : (p < 0 ? '−' : '±')) + Math.abs(Math.round(p)) + '%';
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function todayIso(){ return TS().isoOf(new Date()); }
  function dow(iso){ return new Date(iso + 'T12:00:00').getDay(); }

  /* "8/05"; adds "/25" when the year differs from `ref`. */
  function md(iso, ref){
    if(!iso) return '';
    const [y, m, d] = iso.split('-');
    const base = `${Number(m)}/${d}`;
    return (ref && ref.slice(0, 4) !== y) ? `${base}/${y.slice(2)}` : base;
  }
  const wr = (w, r)=> `${num(w) > 0 ? num(w) : 'bw'}×${num(r)}`;
  const oneLine = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /* ---------- Storage ---------- */

  function readJson(key){
    try{ return JSON.parse(localStorage.getItem(key)); }catch{ return null; }
  }
  function writeJson(key, val){
    try{ localStorage.setItem(key, JSON.stringify(val)); }catch{}
  }

  function getProfile(){
    const p = readJson(PROFILE_KEY) || {};
    const out = {};
    PROFILE_FIELDS.forEach(f=>{ out[f] = p[f] == null ? '' : p[f]; });
    if(!String(out.ask).trim()) out.ask = DEFAULT_ASK;
    return out;
  }

  /* Merges `p` into the stored profile. A new (or first) bodyweight is
     stamped with today's date. Returns the saved profile. */
  function saveProfile(p){
    const old = readJson(PROFILE_KEY) || {};
    const next = Object.assign({}, old);
    PROFILE_FIELDS.forEach(f=>{ if(p && f in p) next[f] = p[f]; });
    ['bodyweightLb', 'heightIn', 'age'].forEach(f=>{
      const n = num(next[f]);
      if(n > 0) next[f] = n; else delete next[f];
    });
    if(next.bodyweightLb && (next.bodyweightLb !== old.bodyweightLb || !next.bodyweightDate)){
      next.bodyweightDate = todayIso();
    }
    if(!next.bodyweightLb) delete next.bodyweightDate;
    if(String(next.ask || '').trim() === DEFAULT_ASK) delete next.ask;   // keep following the default
    writeJson(PROFILE_KEY, next);
    return getProfile();
  }

  function getPrefs(){
    const p = readJson(PREFS_KEY) || {};
    return {
      mode: p.mode === 'json' ? 'json' : 'pack',
      weeks: WEEK_CHOICES.includes(p.weeks) ? p.weeks : 8
    };
  }
  function savePrefs(p){ writeJson(PREFS_KEY, Object.assign(getPrefs(), p)); }

  /* ---------- Shared context ---------- */

  function loadStoredDay(iso){
    const d = readJson('powerUp:' + iso);
    return d && (d.exercises || []).length ? { date: iso, exercises: d.exercises } : null;
  }

  /* Resolves { day, iso } — explicit, from storage, or the latest logged day. */
  function resolveDay(day, iso){
    if(day && iso) return { day, iso };
    if(iso) return { day: loadStoredDay(iso) || { date: iso, exercises: [] }, iso };
    if(day && day.date) return { day, iso: day.date };
    const days = TS().readDays();
    const last = days[days.length - 1];
    return last ? { day: last, iso: last.date } : { day: null, iso: null };
  }

  /* Everything both formats need, computed once. */
  function buildContext(opts){
    opts = opts || {};
    const T = TS();
    const r = resolveDay(opts.day, opts.iso);
    const iso = r.iso || todayIso();
    const day = r.day || { date: iso, exercises: [] };
    const weeks = WEEK_CHOICES.includes(opts.weeks) ? opts.weeks : (num(opts.weeks) > 0 ? num(opts.weeks) : getPrefs().weeks);
    const profile = opts.profile || getProfile();
    const idx = T.buildIndex();
    const windowStart = T.addDays(T.weekStart(iso), -7 * (weeks - 1));

    // ---- Today's exercises ----
    const exercises = (day.exercises || []).filter(ex=> ex && ex.name).map(ex=>{
      const counted = T.countedSets(ex);
      const logged = (ex.sets || []).filter(s=> num(s.weight) > 0 || num(s.reps) > 0);
      const roles = T.setRoles(logged);
      const perHand = T.volMult(ex) === 2;
      const sets = logged.map((s, i)=>({
        weight: num(s.weight), reps: num(s.reps),
        rp: !!s.superset,
        role: roles[i],
        notDone: !ex.finished && counted.indexOf(s) < 0
      }));
      const prs = T.exercisePRs(ex, iso, counted, idx);
      const prior = T.priorSessions(ex.name, ex.bodyPart, iso, idx);
      const todaySess = counted.length ? [{ date: iso, sets: counted.map(s=>({ weight: num(s.weight), reps: num(s.reps), superset: !!s.superset })), e1: prs.today.e1 }] : [];
      const all = prior.concat(todaySess);
      return {
        ex, name: ex.name, bodyPart: ex.bodyPart || 'Other', perHand, finished: !!ex.finished,
        sets, counted,
        vol: T.exVolume(ex, counted),
        e1: Math.round(prs.today.e1),
        priorBest: prs.prior.e1 ? { e1: Math.round(prs.prior.e1), date: prs.prior.e1Date } : null,
        firstEver: prs.firstEver,
        prs: prs.list,
        recent: prior.slice(-RECENT_SESSIONS).reverse(),
        frontier: trimFrontier(T.frontier(all)),
        trendPct: T.e1rmTrendPct(all),
        sessions: all.length,
        firstDate: all.length ? all[0].date : null
      };
    });

    // ---- Totals & muscle groups ----
    const parts = {};
    let countedSets = 0, reps = 0, vol = 0, loggedSets = 0;
    exercises.forEach(e=>{
      loggedSets += e.sets.length;
      countedSets += e.counted.length;
      const rr = e.counted.reduce((a, s)=> a + num(s.reps), 0);
      reps += rr; vol += e.vol;
      const p = parts[e.bodyPart] || (parts[e.bodyPart] = { part: e.bodyPart, exercises: 0, sets: 0, volume: 0 });
      p.exercises++; p.sets += e.counted.length; p.volume += e.vol;
    });
    const muscleGroups = Object.values(parts).sort((a, b)=> b.volume - a.volume)
      .map(p=> Object.assign(p, { volume: Math.round(p.volume), pct: vol ? Math.round(p.volume / vol * 100) : 0 }));
    const totals = { exercises: exercises.length, loggedSets, countedSets, reps, volume: Math.round(vol) };

    const similar = lastSimilarDay(idx, iso, new Set(exercises.map(e=> e.bodyPart)));

    // ---- History-wide ----
    const weekly = T.weeklySummary(weeks, iso, idx);
    const lastTrained = T.lastTrainedByPart(iso, idx);
    const stalled = T.stalls(iso, idx);
    const prFrom = T.addDays(iso, -PR_DAYS);
    const prsRecent = T.prTimeline(idx).filter(p=> p.date > prFrom && p.date < iso);

    const todayKeys = new Set(exercises.map(e=> T.exKey(e.name, e.bodyPart)));
    const others = [];
    idx.exercises.forEach(rec=>{
      if(todayKeys.has(rec.key)) return;
      const ss = rec.sessions.filter(s=> s.date <= iso);
      const inWin = ss.filter(s=> s.date >= windowStart);
      if(!inWin.length) return;
      const last = ss[ss.length - 1];
      others.push({
        name: rec.name, bodyPart: rec.bodyPart, perHand: rec.perHand,
        sessions: inWin.length, lastDate: last.date, lastSets: last.sets,
        bestE1: Math.round(Math.max(...ss.map(s=> s.e1))),
        trendPct: T.e1rmTrendPct(ss)
      });
    });
    others.sort((a, b)=> a.bodyPart.localeCompare(b.bodyPart) || (a.lastDate < b.lastDate ? 1 : -1));

    return { iso, day, weeks, windowStart, profile, exercises, totals, muscleGroups, similar,
             weekly, lastTrained, stalled, prsRecent, others, isToday: iso === todayIso() };
  }

  /* Keep the frontier readable: heaviest, lightest-highest-rep, evenly between. */
  function trimFrontier(f){
    if(f.length <= FRONTIER_MAX) return f;
    const out = [];
    for(let i = 0; i < FRONTIER_MAX; i++) out.push(f[Math.round(i * (f.length - 1) / (FRONTIER_MAX - 1))]);
    return out;
  }

  /* Most recent day before iso that trained any of `parts`, with its total volume. */
  function lastSimilarDay(idx, iso, parts){
    if(!parts.size) return null;
    const byDate = {};
    idx.exercises.forEach(rec=> rec.sessions.forEach(s=>{
      if(s.date >= iso) return;
      const d = byDate[s.date] || (byDate[s.date] = { date: s.date, vol: 0, hit: false });
      d.vol += s.vol;
      if(parts.has(rec.bodyPart)) d.hit = true;
    }));
    const hits = Object.values(byDate).filter(d=> d.hit && d.vol > 0).sort((a, b)=> a.date < b.date ? 1 : -1);
    return hits[0] ? { date: hits[0].date, vol: Math.round(hits[0].vol) } : null;
  }

  /* ---------- Coach pack (plain text) ---------- */

  function setText(s){
    let t = wr(s.weight, s.reps);
    if(s.rp) t += 'rp';
    if(s.role === 'warmup') t += 'wu';
    else if(s.role === 'backoff') t += 'bo';
    if(s.notDone) t += ' (not done)';
    return t;
  }

  function prText(pr){
    switch(pr.kind){
      case 'e1rm':   return `Strength PR e1RM ${pr.value} (prev ${pr.prev})`;
      case 'weight': return `Weight PR ${wr(pr.weight, pr.reps)} (prev ${wr(pr.prev.weight, pr.prev.reps)})`;
      case 'reps':   return `Rep PR ${wr(pr.weight, pr.reps)} (prev at ≥${pr.weight}: ${pr.prev ? wr(pr.prev.weight, pr.prev.reps) : 'none'})`;
      case 'volume': return `Volume PR ${fmtN(pr.value)} lb (prev ${fmtN(pr.prev)})`;
      case 'setVolume': return `Best set ${fmtN(pr.value)} lb (prev ${fmtN(pr.prev)})`;
      default:       return pr.label || pr.kind;
    }
  }
  function prShort(pr){
    switch(pr.kind){
      case 'e1rm':   return `e1RM ${pr.value}`;
      case 'weight': return `weight ${wr(pr.weight, pr.reps)}`;
      case 'reps':   return `reps ${wr(pr.weight, pr.reps)}`;
      case 'volume': return `volume ${fmtN(pr.value)}`;
      case 'setVolume': return `best set ${fmtN(pr.value)}`;
      default:       return pr.kind;
    }
  }

  function exLabel(name, bodyPart, perHand){
    return `${name} [${bodyPart}]${perHand ? ' (per hand)' : ''}`;
  }

  function aboutMe(p, iso){
    const bits = [];
    if(oneLine(p.goal)) bits.push('goal ' + oneLine(p.goal));
    if(num(p.bodyweightLb)) bits.push(`bodyweight ${num(p.bodyweightLb)} lb${p.bodyweightDate ? ` (${md(p.bodyweightDate, iso)})` : ''}`);
    if(num(p.heightIn)){
      const h = num(p.heightIn);
      bits.push(`height ${Math.floor(h / 12)}'${Math.round(h % 12)}"`);
    }
    if(num(p.age)) bits.push('age ' + num(p.age));
    ['experience', 'injuries', 'equipment', 'schedule', 'notes'].forEach(f=>{
      if(oneLine(p[f])) bits.push(`${f} ${oneLine(p[f])}`);
    });
    return bits.length ? 'ABOUT ME: ' + bits.join(' · ') : '';
  }

  function buildCoachPack(opts){
    const c = buildContext(opts);
    const T = TS();
    const iso = c.iso;
    const L = [];
    const hasRp = c.exercises.some(e=> e.sets.some(s=> s.rp));
    const legend = ['units lb', 'sets written weight×reps (' +
      (hasRp ? 'rp = rest-pause, ' : '') + 'wu = warm-up, bo = back-off)',
      'e1RM = estimated 1-rep max (Epley)'];
    if(c.exercises.some(e=> e.perHand) || c.others.some(o=> o.perHand)) legend.push('(per hand) = weight in each hand');
    L.push(`LEVELUP COACH PACK · ${WEEKDAYS[dow(iso)]} ${iso} · ${legend.join(' · ')}`);
    const about = aboutMe(c.profile, iso);
    if(about) L.push(about);

    // ---- Today ----
    if(c.exercises.length){
      L.push('');
      const partNames = c.muscleGroups.map(p=> p.part);
      let head = `${c.isToday ? 'TODAY' : 'SESSION ' + md(iso)} — ${partNames.join(' + ')} · ` +
        `${c.totals.exercises} exercise${c.totals.exercises === 1 ? '' : 's'} · ${c.totals.countedSets} sets · ${fmtN(c.totals.volume)} lb`;
      if(c.similar && c.similar.vol){
        const d = (c.totals.volume - c.similar.vol) / c.similar.vol * 100;
        head += ` (${signPct(d)} vs last ${partNames.join('/')} day ${md(c.similar.date, iso)})`;
      }
      if(c.exercises.some(e=> !e.finished)) head += ' · in progress';
      L.push(head);
      if(c.muscleGroups.length > 1){
        L.push('  volume by muscle: ' + c.muscleGroups.map(p=> `${p.part} ${fmtN(p.volume)} (${p.pct}%)`).join(' · '));
      }

      c.exercises.forEach(e=>{
        let line = `${exLabel(e.name, e.bodyPart, e.perHand)}  ${e.sets.map(setText).join(', ') || '(no sets)'}`;
        if(e.e1){
          line += `  e1RM ${e.e1}`;
          if(e.priorBest) line += ` (best ${e.priorBest.e1} on ${md(e.priorBest.date, iso)})`;
        }
        if(e.firstEver) line += '  · first time logged';
        L.push(line);
        if(e.prs.length) L.push('  ★ ' + e.prs.map(prText).join(' · '));
        if(e.recent.length){
          L.push('  recent: ' + e.recent.map(s=> `${md(s.date, iso)} ${T.fmtSets(s.sets)}`).join(' | '));
        }
        if(e.frontier.length > 1 || (e.frontier.length && !e.firstEver)){
          L.push('  rep bests: ' + e.frontier.map(p=> wr(p.weight, p.reps)).join(' · '));
        }
        const tr = [];
        if(e.trendPct != null) tr.push(`e1RM ${signPct(e.trendPct)} (last 3 vs prior 3)`);
        if(e.sessions > 1) tr.push(`${e.sessions} sessions since ${md(e.firstDate, iso)}`);
        if(tr.length) L.push('  trend: ' + tr.join(' · '));
      });
    }

    // ---- Weeks ----
    const wk = c.weekly;
    const totalSets = wk.reduce((a, w)=> a + w.sets, 0);
    if(totalSets){
      L.push('');
      L.push(`LAST ${c.weeks} WEEKS (Mon-start, oldest→newest; hard sets = sets ≥50% of that day's top weight)`);
      const partTotals = {};
      wk.forEach(w=> Object.keys(w.byPart).forEach(p=>{ partTotals[p] = (partTotals[p] || 0) + w.byPart[p].sets; }));
      const partList = Object.keys(partTotals).sort((a, b)=> partTotals[b] - partTotals[a]);
      const lw = Math.max(9, ...partList.map(p=> p.length)) + 1;
      const cell = v => String(v).padStart(6);
      const row = (label, vals)=> ('  ' + label.padEnd(lw) + vals.map(cell).join('')).replace(/\s+$/, '');
      L.push(row('week of', wk.map(w=> md(w.weekStart, iso))));
      L.push(row('workouts', wk.map(w=> w.workouts)));
      L.push(row('k lb', wk.map(w=> w.volume ? (w.volume / 1000).toFixed(1) : '-')));
      partList.forEach(p=> L.push(row(p, wk.map(w=> w.byPart[p] ? w.byPart[p].sets : '-'))));
      const last4 = wk.slice(-4);
      const avg = partList.map(p=> `${p} ${Math.round(last4.reduce((a, w)=> a + (w.byPart[p] ? w.byPart[p].sets : 0), 0) / last4.length)}`);
      L.push(`  avg hard sets/wk, last ${last4.length} wks (this week may be partial): ` + avg.join(' · '));
    }

    // ---- Days since ----
    if(c.lastTrained.length){
      L.push('');
      L.push('DAYS SINCE TRAINED: ' + c.lastTrained.map(x=> `${x.part} ${x.daysAgo}`).join(' · '));
    }

    // ---- Stalls ----
    if(c.stalled.length){
      L.push('');
      L.push(`STALLED (no e1RM gain in last ${T.STALL_SESSIONS} sessions):`);
      c.stalled.forEach(s=> L.push(`  ${s.name} [${s.bodyPart}] best ${s.bestE1}, recent ${s.recentE1}, since ${md(s.since, iso)}`));
    }

    // ---- PRs ----
    if(c.prsRecent.length){
      const groups = [];
      c.prsRecent.forEach(p=>{
        const g = groups.find(x=> x.date === p.date && x.name === p.name);
        if(g) g.prs.push(p); else groups.push({ date: p.date, name: p.name, prs: [p] });
      });
      L.push('');
      L.push(`PRs LAST ${PR_DAYS} DAYS (before this session):`);
      groups.slice(0, PR_LIST_MAX).forEach(g=> L.push(`  ${md(g.date, iso)} ${g.name}: ${g.prs.map(prShort).join(', ')}`));
      if(groups.length > PR_LIST_MAX) L.push(`  …and ${groups.length - PR_LIST_MAX} more`);
    }

    // ---- Other exercises ----
    if(c.others.length){
      L.push('');
      L.push(`OTHER EXERCISES (last ${c.weeks} wks): sessions in window · last session · best e1RM · trend`);
      c.others.forEach(o=>{
        let line = `  ${exLabel(o.name, o.bodyPart, o.perHand)} ${o.sessions}× · last ${md(o.lastDate, iso)} ${T.fmtSets(o.lastSets)} · best ${o.bestE1}`;
        if(o.trendPct != null) line += ` · ${signPct(o.trendPct)}`;
        L.push(line);
      });
    }

    L.push('');
    L.push('ASK: ' + oneLine(c.profile.ask || DEFAULT_ASK));
    return L.join('\n');
  }

  /* ---------- Raw JSON (v2) ---------- */

  const setArr = s => {
    const a = [s.weight, s.reps];
    const f = [];
    if(s.rp || s.superset) f.push('rp');
    if(s.role === 'warmup') f.push('wu');
    if(s.role === 'backoff') f.push('bo');
    if(s.notDone) f.push('nd');
    if(f.length) a.push(f.join(' '));
    return a;
  };

  function compactPr(p){
    const o = { kind: p.kind };
    if(p.date) o.date = p.date;
    if(p.name) o.name = p.name;
    if(p.weight != null) o.set = [p.weight, p.reps];
    if(p.value != null) o.value = p.value;
    if(p.prev != null) o.prev = typeof p.prev === 'object' ? [p.prev.weight, p.prev.reps] : p.prev;
    return o;
  }

  function buildRawObject(opts){
    const c = buildContext(opts);
    const p = c.profile;
    const profile = {};
    PROFILE_FIELDS.forEach(f=>{ if(p[f] !== '' && p[f] != null) profile[f] = p[f]; });
    return {
      schema: 'levelup.workout.v2',
      exportedAt: new Date().toISOString(),
      units: 'lb',
      legend: 'sets are [weight, reps, flags?]; flags: rp = rest-pause, wu = warm-up, bo = back-off, nd = not done. ' +
        'perHand: weight is per hand, volume counts both hands. e1rm = Epley estimate (reps capped at 15). ' +
        'Weekly sets are hard sets (>= 50% of that day\'s top weight).',
      profile,
      today: {
        date: c.iso,
        weekday: WEEKDAYS_LONG[dow(c.iso)],
        totals: { exercises: c.totals.exercises, loggedSets: c.totals.loggedSets, countedSets: c.totals.countedSets,
                  reps: c.totals.reps, volumeLb: c.totals.volume },
        muscleGroups: c.muscleGroups.map(g=>({ part: g.part, exercises: g.exercises, sets: g.sets, volumeLb: g.volume, pct: g.pct })),
        comparedTo: c.similar ? { date: c.similar.date, volumeLb: c.similar.vol,
          deltaPct: c.similar.vol ? Math.round((c.totals.volume - c.similar.vol) / c.similar.vol * 1000) / 10 : null } : null,
        exercises: c.exercises.map(e=>({
          name: e.name, bodyPart: e.bodyPart, perHand: e.perHand, finished: e.finished,
          sets: e.sets.map(setArr),
          e1rm: e.e1 || null,
          priorBestE1rm: e.priorBest ? [e.priorBest.e1, e.priorBest.date] : null,
          prs: e.prs.map(compactPr),
          repBests: e.frontier.map(f=> [f.weight, f.reps]),
          recent: e.recent.map(s=>({ date: s.date, sets: s.sets.map(setArr) })),
          sessions: e.sessions,
          trendPct: e.trendPct
        }))
      },
      weeks: c.weekly,
      lastTrained: c.lastTrained,
      stalls: c.stalled,
      prsLast30: c.prsRecent.map(compactPr),
      otherExercises: c.others.map(o=>({ name: o.name, bodyPart: o.bodyPart, perHand: o.perHand, sessions: o.sessions,
        lastDate: o.lastDate, lastSets: o.lastSets.map(setArr), bestE1rm: o.bestE1, trendPct: o.trendPct }))
    };
  }

  /* JSON with 1-space indent, but arrays of primitives (or of arrays of
     primitives — set lists) stay on one line, and so do small objects. */
  const INLINE_MAX = 110;
  function stringifyCompact(v, ind){
    ind = ind || '';
    const flat = x => x === null || typeof x !== 'object';
    const flatArr = x => Array.isArray(x) && x.every(y=> flat(y) || (Array.isArray(y) && y.every(flat)));
    if(v && typeof v === 'object' && !Array.isArray(v)){
      const one = JSON.stringify(v);
      if(one.length <= INLINE_MAX && Object.values(v).every(x=> flat(x) || flatArr(x) ||
        (x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).every(flat)))) return one;
    }
    if(Array.isArray(v)){
      if(!v.length) return '[]';
      if(v.every(x=> flat(x) || (Array.isArray(x) && x.every(flat)))) return JSON.stringify(v);
      const inner = ind + ' ';
      return '[\n' + v.map(x=> inner + stringifyCompact(x, inner)).join(',\n') + '\n' + ind + ']';
    }
    if(v && typeof v === 'object'){
      const keys = Object.keys(v).filter(k=> v[k] !== undefined);
      if(!keys.length) return '{}';
      const inner = ind + ' ';
      return '{\n' + keys.map(k=> inner + JSON.stringify(k) + ': ' + stringifyCompact(v[k], inner)).join(',\n') + '\n' + ind + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  function buildRawJson(opts){ return stringifyCompact(buildRawObject(opts)); }

  /* ---------- UI (browser only) ---------- */

  const CSS = `
.cx-popup{position:fixed; inset:0; background:rgba(0,0,0,.55); display:none; align-items:flex-end; justify-content:center; z-index:120;
  --ink:#e8eef6; --muted:#9fb0c7; --ring:#1c2a37; --accent:#22c55e; color:var(--ink);
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.cx-popup.cx-open{display:flex}
.cx-popup.cx-profile{z-index:130}
.cx-sheet{box-sizing:border-box; width:100%; max-width:650px; max-height:92vh; overflow-y:auto; overflow-x:hidden;
  background:#0b1118; border:1px solid var(--ring); border-bottom:0; border-radius:16px 16px 0 0; padding:14px 16px 18px}
.cx-head{display:flex; align-items:center; gap:10px; margin-bottom:10px}
.cx-title{flex:1; margin:0; font-size:1rem; color:#c7d2fe; font-weight:900}
.cx-sub{display:block; color:var(--muted); font-size:.75rem; font-weight:700; margin-top:2px}
.cx-x{all:unset; cursor:pointer; min-width:44px; min-height:44px; display:flex; align-items:center; justify-content:center;
  border:1px solid var(--ring); border-radius:10px; color:var(--muted); box-sizing:border-box}
.cx-label{color:var(--muted); font-size:.7rem; font-weight:800; letter-spacing:.6px; text-transform:uppercase; margin:10px 0 6px}
.cx-chips{display:flex; flex-wrap:wrap; gap:6px}
.cx-chip{all:unset; box-sizing:border-box; cursor:pointer; min-height:40px; padding:0 14px; display:flex; align-items:center;
  border:1px solid var(--ring); border-radius:999px; background:#0f1720; color:var(--muted); font-weight:800; font-size:.85rem}
.cx-chip.active{background:rgba(34,197,94,.15); border-color:rgba(34,197,94,.6); color:#bbf7d0}
.cx-box{display:block; width:100%; box-sizing:border-box; height:38vh; min-height:180px; resize:vertical; margin-top:12px;
  background:#080d13; color:#cbd5e1; border:1px solid var(--ring); border-radius:10px; padding:10px;
  white-space:pre; overflow:auto; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:.7rem; line-height:1.45}
.cx-meta{display:flex; justify-content:space-between; gap:8px; color:var(--muted); font-size:.75rem; font-weight:700; margin-top:6px}
.cx-actions{display:flex; gap:8px; margin-top:12px}
.cx-btn{all:unset; box-sizing:border-box; cursor:pointer; min-height:48px; padding:0 16px; display:flex; align-items:center; justify-content:center;
  border-radius:12px; font-weight:900; font-size:.95rem; border:1px solid var(--ring); background:#111a24; color:var(--ink)}
.cx-btn.primary{flex:1; background:#16a34a; border-color:#22c55e; color:#04120a; font-size:1.05rem}
.cx-btn.primary.ok{background:#14532d; color:#bbf7d0}
.cx-btn:active{filter:brightness(1.15)}
.cx-empty{color:var(--muted); font-weight:700; padding:20px 0; text-align:center}
.cx-field{display:block; margin-top:10px}
.cx-field span{display:block; color:var(--muted); font-size:.72rem; font-weight:800; margin-bottom:4px}
.cx-field input, .cx-field textarea{display:block; width:100%; box-sizing:border-box; background:#080d13; color:var(--ink);
  border:1px solid var(--ring); border-radius:10px; padding:10px; font:inherit; font-size:16px}
.cx-field textarea{min-height:64px; resize:vertical}
.cx-row{display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px}
.cx-row .cx-field{min-width:0}
.cx-hint{color:var(--muted); font-size:.72rem; font-weight:700; margin:6px 0 0}
`;

  function hasDom(){ return typeof document !== 'undefined' && !!document.body; }

  function injectStyles(){
    if(document.getElementById('coachExportStyles')) return;
    const st = document.createElement('style');
    st.id = 'coachExportStyles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => (
    {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]
  ));

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

  const sheets = {};
  function makeSheet(name, extraClass){
    if(sheets[name]) return sheets[name];
    injectStyles();
    const el = document.createElement('div');
    el.className = 'cx-popup' + (extraClass ? ' ' + extraClass : '');
    el.innerHTML = '<div class="cx-sheet" role="dialog" aria-modal="true"></div>';
    el.addEventListener('click', e=>{
      if(e.target === el || e.target.closest('.cx-x')) closeSheet(el);
    });
    document.body.appendChild(el);
    sheets[name] = el;
    return el;
  }
  function showSheet(el){
    el.classList.add('cx-open');
    document.body.classList.add('ss-popup-open');
  }
  function closeSheet(el){
    el.classList.remove('cx-open');
    if(!document.querySelector('.cx-popup.cx-open, .ss-popup[style*="flex"]')) document.body.classList.remove('ss-popup-open');
  }
  function onKey(e){
    if(e.key !== 'Escape') return;
    const open = [...document.querySelectorAll('.cx-popup.cx-open')];
    if(open.length) closeSheet(open[open.length - 1]);
  }

  let current = { day: null, iso: null };

  function open(day, iso){
    if(!hasDom() || !TS()) return;
    const r = resolveDay(day, iso);
    current = r;
    const el = makeSheet('export');
    if(!el.dataset.bound){
      el.dataset.bound = '1';
      document.addEventListener('keydown', onKey);
    }
    renderExport(el);
    showSheet(el);
  }

  function renderExport(el){
    const prefs = getPrefs();
    const sheet = el.querySelector('.cx-sheet');
    const iso = current.iso;
    const sub = iso ? `${WEEKDAYS[dow(iso)]} ${md(iso)} · ${prefs.mode === 'pack' ? 'plain text for ChatGPT' : 'structured, for saving'}` : '';
    const chip = (group, val, label, on)=>
      `<button type="button" class="cx-chip${on ? ' active' : ''}" data-${group}="${val}" aria-pressed="${on}">${label}</button>`;

    let text = '';
    if(iso){
      try{
        const opts = { day: current.day, iso, weeks: prefs.weeks };
        text = prefs.mode === 'json' ? buildRawJson(opts) : buildCoachPack(opts);
      }catch(err){
        text = 'Could not build the export: ' + (err && err.message);
      }
    }
    const tokens = Math.round(text.length / CHARS_PER_TOKEN);
    const tokLabel = tokens >= 1000 ? `~${(tokens / 1000).toFixed(1)}k tokens` : `~${tokens} tokens`;
    const kb = text.length >= 1024 ? `${(text.length / 1024).toFixed(1)} KB` : `${text.length} B`;

    sheet.innerHTML = `
      <div class="cx-head">
        <h2 class="cx-title">Copy for ChatGPT<span class="cx-sub">${esc(sub)}</span></h2>
        <button type="button" class="cx-x" aria-label="Close">✕</button>
      </div>
      ${iso ? `
        <div class="cx-label">Format</div>
        <div class="cx-chips">
          ${chip('mode', 'pack', 'Coach pack', prefs.mode === 'pack')}
          ${chip('mode', 'json', 'Raw JSON', prefs.mode === 'json')}
        </div>
        <div class="cx-label">History</div>
        <div class="cx-chips">
          ${WEEK_CHOICES.map(w=> chip('weeks', w, w + ' wks', prefs.weeks === w)).join('')}
        </div>
        <textarea class="cx-box" readonly spellcheck="false" aria-label="Export text"></textarea>
        <div class="cx-meta"><span>${tokLabel}</span><span>${kb}</span></div>
        <div class="cx-actions">
          <button type="button" class="cx-btn primary" data-act="copy">Copy</button>
          <button type="button" class="cx-btn" data-act="profile">✎ About me</button>
        </div>
      ` : `
        <div class="cx-empty">No workouts logged yet — log one, then copy it here.</div>
        <div class="cx-actions"><button type="button" class="cx-btn" data-act="profile">✎ About me</button></div>
      `}
    `;
    const box = sheet.querySelector('.cx-box');
    if(box){
      box.value = text;
      box.addEventListener('focus', ()=> box.select());
    }
    sheet.querySelectorAll('[data-mode]').forEach(b=> b.addEventListener('click', ()=>{
      savePrefs({ mode: b.dataset.mode }); renderExport(el);
    }));
    sheet.querySelectorAll('[data-weeks]').forEach(b=> b.addEventListener('click', ()=>{
      savePrefs({ weeks: Number(b.dataset.weeks) }); renderExport(el);
    }));
    const copyBtn = sheet.querySelector('[data-act="copy"]');
    if(copyBtn) copyBtn.addEventListener('click', async ()=>{
      const ok = await copyText(text);
      if(ok){
        copyBtn.textContent = '✓ Copied — paste into ChatGPT';
        copyBtn.classList.add('ok');
      }else{
        copyBtn.textContent = 'Select the text above and copy';
        box.focus(); box.select();
      }
      setTimeout(()=>{ copyBtn.textContent = 'Copy'; copyBtn.classList.remove('ok'); }, 2200);
    });
    sheet.querySelector('[data-act="profile"]').addEventListener('click', openProfile);
  }

  function openProfile(){
    if(!hasDom()) return;
    const el = makeSheet('profile', 'cx-profile');
    const p = getProfile();
    const sheet = el.querySelector('.cx-sheet');
    const field = (f, label, type, ph)=> type === 'area'
      ? `<label class="cx-field"><span>${label}</span><textarea data-f="${f}" placeholder="${esc(ph || '')}">${esc(p[f])}</textarea></label>`
      : `<label class="cx-field"><span>${label}</span><input data-f="${f}" type="${type}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} placeholder="${esc(ph || '')}" value="${esc(p[f])}"></label>`;
    sheet.innerHTML = `
      <div class="cx-head">
        <h2 class="cx-title">About me<span class="cx-sub">Added to the top of every coach pack</span></h2>
        <button type="button" class="cx-x" aria-label="Close">✕</button>
      </div>
      ${field('goal', 'Goal', 'area', 'e.g. build muscle, bench 225 by summer')}
      <div class="cx-row">
        ${field('bodyweightLb', 'Bodyweight (lb)', 'number', '182')}
        ${field('heightIn', 'Height (in)', 'number', '70')}
        ${field('age', 'Age', 'number', '')}
      </div>
      ${p.bodyweightDate ? `<p class="cx-hint">Bodyweight last updated ${esc(p.bodyweightDate)}</p>` : ''}
      ${field('experience', 'Experience', 'text', 'e.g. 3 years lifting, consistent since spring')}
      ${field('injuries', 'Injuries / limits', 'area', 'e.g. left shoulder clicks on overhead pressing')}
      ${field('equipment', 'Equipment', 'text', 'e.g. commercial gym, dumbbells to 100')}
      ${field('schedule', 'Schedule', 'text', 'e.g. 4 days/wk, ~60 min')}
      ${field('notes', 'Other notes', 'area', '')}
      ${field('ask', 'What to ask the coach', 'area', '')}
      <div class="cx-actions">
        <button type="button" class="cx-btn primary" data-act="save">Save</button>
        <button type="button" class="cx-btn" data-act="cancel">Cancel</button>
      </div>
    `;
    sheet.querySelector('[data-act="cancel"]').addEventListener('click', ()=> closeSheet(el));
    sheet.querySelector('[data-act="save"]').addEventListener('click', ()=>{
      const next = {};
      sheet.querySelectorAll('[data-f]').forEach(inp=>{ next[inp.dataset.f] = inp.value.trim(); });
      saveProfile(next);
      closeSheet(el);
      const exp = sheets.export;
      if(exp && exp.classList.contains('cx-open')) renderExport(exp);
    });
    showSheet(el);
  }

  window.CoachExport = {
    open, buildCoachPack, buildRawJson, getProfile, saveProfile, openProfile,
    // extras (tests / other pages)
    PROFILE_KEY, PREFS_KEY, DEFAULT_ASK, getPrefs, savePrefs
  };
})();
