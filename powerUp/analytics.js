/* =========================
   Power Up! — Analytics page.

   Tabs: Overview (zero setup: this week, sets per muscle, what's due, recent
   PRs, stalls, backup), Exercises (searchable list → full-screen detail with
   e1RM chart, rep maxes, reps-at-weight scatter and session history),
   Consistency (day bars, streaks, recency) and Records.

   All the maths comes from TrainingStats (powerUp/trainingStats.js) — volume
   in particular always goes through it, so per-hand exercises count both
   hands. READ ONLY against workouts; the single exception is the explicit
   Import button. The only other keys written are powerUp:analytics* UI prefs.
   ========================= */
(function(){
    'use strict';

    const TS = window.TrainingStats;
    const $ = id => document.getElementById(id);

    /* ---------- UI prefs ---------- */
    const UI_KEYS = {
        tab:        'powerUp:analyticsTab',
        range:      'powerUp:analyticsRange',        // consistency day range
        exPart:     'powerUp:analyticsExPart',
        exSort:     'powerUp:analyticsExSort',
        chartRange: 'powerUp:analyticsChartRange',
        recKind:    'powerUp:analyticsRecKind',
        recSort:    'powerUp:analyticsRecSort'
    };
    const readUI  = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const writeUI = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    const pick    = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);

    /* ---------- formatting ---------- */
    const num = v => Number(v) || 0;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const nf  = n => Math.round(n).toLocaleString();
    function compact(n){
        const v = Math.round(n);
        const a = Math.abs(v);
        if (a >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (a >= 10000)   return Math.round(v / 1000) + 'k';
        if (a >= 1000)    return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return String(v);
    }
    const dateOf = iso => new Date(String(iso).slice(0, 10) + 'T12:00:00');
    const TODAY_ISO = TS.isoOf(new Date());
    const THIS_YEAR = dateOf(TODAY_ISO).getFullYear();
    function mdOf(iso){ const d = dateOf(iso); return `${d.getMonth() + 1}/${d.getDate()}`; }
    function shortDate(iso){
        const d = dateOf(iso);
        const o = { weekday: 'short', month: 'short', day: 'numeric' };
        if (d.getFullYear() !== THIS_YEAR) o.year = 'numeric';
        return d.toLocaleDateString(undefined, o);
    }
    function longDate(iso){
        return dateOf(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    function agoLabel(iso){
        const n = TS.daysBetween(iso, TODAY_ISO);
        if (n <= 0)  return 'today';
        if (n === 1) return 'yesterday';
        if (n < 30)  return `${n}d ago`;
        if (n < 365) return `${Math.round(n / 30)}mo ago`;
        return `${(n / 365).toFixed(1)}y ago`;
    }
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    function signed(n, fmt){
        const f = fmt || (x => nf(x));
        if (n > 0) return `<b class="up">+${f(n)}</b>`;
        if (n < 0) return `<b class="down">−${f(-n)}</b>`;
        return '<b class="flat">±0</b>';
    }
    function trendHtml(p){
        if (p == null) return '<span class="flat">—</span>';
        const cls = p > 0.05 ? 'up' : (p < -0.05 ? 'down' : 'flat');
        return `<span class="${cls}">${p > 0 ? '+' : ''}${p.toFixed(1)}%</span>`;
    }

    /* ---------- muscle colours (same as sessionSummary.js) ---------- */
    const PART_COLORS = {
        Chest: '#f87171', Back: '#60a5fa', Biceps: '#a78bfa', Triceps: '#f472b6',
        Shoulders: '#fbbf24', Legs: '#34d399', Lats: '#22d3ee', Forearms: '#fb923c',
        Cardio: '#94a3b8'
    };
    const PART_ORDER = ['Chest', 'Back', 'Lats', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Legs', 'Cardio'];
    const partColor = p => PART_COLORS[p] || '#64748b';
    const partRank  = p => { const i = PART_ORDER.indexOf(p); return i < 0 ? 99 : i; };
    const byPart    = (a, b) => partRank(a) - partRank(b) || String(a).localeCompare(String(b));
    const dot       = p => `<i style="background:${partColor(p)}"></i>`;

    /* ---------- PR kinds ---------- */
    const KIND = {
        e1rm:      { label: 'Strength PR' },
        weight:    { label: 'Weight PR' },
        reps:      { label: 'Rep PR' },
        volume:    { label: 'Volume PR' },
        setVolume: { label: 'Best set' }
    };
    const kindBadge = k => `<span class="kb k-${esc(k)}">${esc((KIND[k] || {}).label || k)}</span>`;
    function prText(pr){
        const wr = o => (o && o.weight ? `${o.weight}×${o.reps}` : '');
        switch (pr.kind){
            // both sides arrive rounded, so a sub-pound gain would read "245, prev 245"
            case 'e1rm':      return { now: `${nf(pr.value)} lb e1RM`, prev: pr.prev ? `prev ${nf(pr.prev)}${pr.value === pr.prev ? ' (+<1)' : ''}` : '' };
            case 'weight':    return { now: wr(pr), prev: wr(pr.prev) ? `prev ${wr(pr.prev)}` : '' };
            case 'reps':      return { now: wr(pr), prev: wr(pr.prev) ? `prev ${wr(pr.prev)}` : '' };
            case 'volume':    return { now: `${nf(pr.value)} lb`, prev: pr.prev ? `prev ${nf(pr.prev)}` : '' };
            case 'setVolume': return { now: `${nf(pr.value)} lb set`, prev: pr.prev ? `prev ${nf(pr.prev)}` : '' };
            default:          return { now: '', prev: '' };
        }
    }

    /* =========================================================
       Data — one index, everything else derived from it.
       ========================================================= */
    const IDX     = TS.buildIndex();
    const EX_ROWS = TS.exerciseList(IDX);              // newest first
    const PR_ALL  = TS.prTimeline(IDX);                // newest first

    // PRs per exercise: key -> [pr] (newest first) and key -> date -> [pr]
    const PR_LIST = new Map();
    const PR_DAY  = new Map();
    PR_ALL.forEach(pr => {
        const k = TS.exKey(pr.name, pr.bodyPart);
        if (!PR_LIST.has(k)) { PR_LIST.set(k, []); PR_DAY.set(k, new Map()); }
        PR_LIST.get(k).push(pr);
        const byDate = PR_DAY.get(k);
        if (!byDate.has(pr.date)) byDate.set(pr.date, []);
        byDate.get(pr.date).push(pr);
    });

    // One entry per trained day, exercises in logged order. Volume via TrainingStats.
    const DAY_MAP = new Map();
    IDX.days.forEach(day => {
        const exercises = [];
        (day.exercises || []).forEach(ex => {
            const cs = TS.countedSets(ex);
            if (!cs.length) return;
            const src = { name: ex.name || 'Exercise', bodyPart: ex.bodyPart || 'Other' };
            exercises.push({
                name: src.name, bodyPart: src.bodyPart,
                key: TS.exKey(src.name, src.bodyPart),
                mult: TS.volMult(src),
                sets: cs.map(s => ({ weight: num(s.weight), reps: num(s.reps) })),
                vol: TS.exVolume(src, cs),
                hard: TS.hardSetCount(cs)
            });
        });
        if (!exercises.length) return;
        DAY_MAP.set(day.date, {
            date: day.date, exercises,
            vol:  exercises.reduce((a, e) => a + e.vol, 0),
            sets: exercises.reduce((a, e) => a + e.sets.length, 0),
            hard: exercises.reduce((a, e) => a + e.hard, 0)
        });
    });
    const HAS_DATA = DAY_MAP.size > 0;

    /* =========================================================
       Charts (Chart.js, if the CDN loaded)
       ========================================================= */
    const HAS_CHART = typeof window.Chart === 'function';
    if (HAS_CHART) {
        Chart.defaults.color = '#9fb0c7';
        Chart.defaults.borderColor = 'rgba(42,53,67,.55)';
        Chart.defaults.font.family = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
        Chart.defaults.font.size = 11;
        Chart.defaults.font.weight = '600';
    }
    const charts = {};
    function killChart(id){ if (charts[id]) { charts[id].destroy(); charts[id] = null; } }
    function chartFallback(canvasId, text){
        const box = $(canvasId) && $(canvasId).parentElement;
        if (!box) return;
        let fb = box.querySelector('.chart-fallback');
        if (!fb) { fb = document.createElement('div'); fb.className = 'chart-fallback'; box.appendChild(fb); }
        fb.textContent = text;
        fb.hidden = !text;
        $(canvasId).style.display = text ? 'none' : '';
    }
    const TOOLTIP = {
        backgroundColor: 'rgba(11,17,24,.96)', borderColor: '#2a3543', borderWidth: 1,
        titleColor: '#e8eef6', bodyColor: '#c9d5e3', padding: 9, displayColors: false,
        titleFont: { weight: '800' }, bodyFont: { weight: '700' }
    };

    /* =========================================================
       Tab 1 — Overview
       ========================================================= */
    function weekToDate(startIso, nDays){
        const out = { workouts: 0, sets: 0, vol: 0 };
        for (let i = 0; i < nDays; i++) {
            const d = DAY_MAP.get(TS.addDays(startIso, i));
            if (!d) continue;
            out.workouts++; out.sets += d.hard; out.vol += d.vol;
        }
        return out;
    }

    function renderWeek(){
        const thisWk = TS.weekStart(TODAY_ISO);
        const lastWk = TS.addDays(thisWk, -7);
        const dayN   = TS.daysBetween(thisWk, TODAY_ISO) + 1;
        const cur    = weekToDate(thisWk, dayN);
        const same   = weekToDate(lastWk, dayN);
        const full   = weekToDate(lastWk, 7);

        const dn = iso => dateOf(iso).toLocaleDateString(undefined, { weekday: 'short' });
        $('weekSub').textContent = dayN >= 7 ? 'vs last week'
            : `${dn(thisWk)}–${dn(TODAY_ISO)} vs same days last wk`;

        const tile = (label, v, s, f, fmt) => `
            <div class="tile">
                <div class="tv">${fmt(v)}</div>
                <div class="tl">${label}</div>
                <div class="ts">${signed(v - s, fmt)} · wk ${fmt(f)}</div>
            </div>`;
        $('weekTiles').innerHTML =
            tile('Workouts', cur.workouts, same.workouts, full.workouts, nf) +
            tile('Hard sets', cur.sets, same.sets, full.sets, nf) +
            tile('Volume lb', cur.vol, same.vol, full.vol, compact);
    }

    function renderMuscleSets(){
        const el = $('muscleSets');
        if (!HAS_DATA) { el.innerHTML = '<div class="empty">No workouts logged yet.</div>'; return; }

        const weeks = TS.weeklySummary(4, TODAY_ISO, IDX);       // oldest → newest
        const cur   = weeks[weeks.length - 1];
        const prev  = weeks.slice(0, -1).reverse();              // newest → oldest
        const parts = new Set();
        IDX.exercises.forEach(rec => { if (rec.bodyPart !== 'Cardio') parts.add(rec.bodyPart); });
        weeks.forEach(w => Object.keys(w.byPart).forEach(p => parts.add(p)));

        const setsOf = (w, p) => (w.byPart[p] ? w.byPart[p].sets : 0);
        let max = 24;
        weeks.forEach(w => Object.values(w.byPart).forEach(b => { max = Math.max(max, b.sets); }));
        const pctOf = n => Math.min(100, (n / max) * 100);
        const bandL = pctOf(10), bandW = pctOf(20) - bandL;

        el.innerHTML = [...parts].sort(byPart).map(p => {
            const c   = partColor(p);
            const now = setsOf(cur, p);
            const avg = prev.reduce((a, w) => a + setsOf(w, p), 0) / prev.length;
            const bar = (n, isCur) => `<i class="ms-bar${isCur ? ' cur' : ''}${n ? '' : ' zero'}" style="width:${pctOf(n).toFixed(1)}%; background:${c}; opacity:${isCur ? 1 : 0.32}"></i>`;
            return `<div class="ms-row">
                <span class="ms-name">${dot(p)}${esc(p)}</span>
                <div class="ms-bars">
                    <span class="ms-band" style="left:${bandL.toFixed(1)}%; width:${bandW.toFixed(1)}%"></span>
                    ${bar(now, true)}${prev.map(w => bar(setsOf(w, p), false)).join('')}
                </div>
                <span class="ms-val"><b>${now}</b><small>avg ${Math.round(avg)}</small></span>
            </div>`;
        }).join('');
    }

    const staleColor = d => (d <= 3 ? '#4ade80' : d <= 7 ? '#a3e635' : d <= 14 ? '#f59e0b' : '#ef4444');

    function renderDue(){
        const el = $('dueList');
        const rows = TS.lastTrainedByPart(TODAY_ISO, IDX);
        if (!rows.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1">Nothing trained yet.</div>'; return; }
        el.innerHTML = rows.map(r => `
            <div class="due" style="border-left-color:${staleColor(r.daysAgo)}">
                <div class="dn">${esc(r.part)}</div>
                <div class="dd" style="color:${staleColor(r.daysAgo)}">${r.daysAgo === 0 ? 'today' : r.daysAgo + 'd'}</div>
            </div>`).join('');
    }

    let prFeedAll = false;
    function renderPrFeed(){
        const el = $('prFeed');
        const since = TS.addDays(TODAY_ISO, -30);
        const recent = PR_ALL.filter(p => p.date >= since && p.kind !== 'setVolume');

        // date -> key -> { name, bodyPart, prs }
        const cards = [];
        const seen = new Map();
        recent.forEach(pr => {
            const id = pr.date + '|' + TS.exKey(pr.name, pr.bodyPart);
            if (!seen.has(id)) {
                const c = { date: pr.date, key: TS.exKey(pr.name, pr.bodyPart), name: pr.name, bodyPart: pr.bodyPart, prs: [] };
                seen.set(id, c); cards.push(c);
            }
            seen.get(id).prs.push(pr);
        });
        $('prFeedCount').textContent = recent.length ? `${plural(recent.length, 'PR')} · last 30 days` : 'last 30 days';

        if (!cards.length) {
            el.innerHTML = `<div class="empty">${HAS_DATA ? 'No PRs in the last 30 days — the Stalled list below is a good place to look.' : 'Log a few workouts and PRs show up here.'}</div>`;
            return;
        }
        const LIMIT = 8;
        const shown = prFeedAll ? cards : cards.slice(0, LIMIT);
        let lastDate = null;
        el.innerHTML = shown.map(c => {
            const head = c.date !== lastDate ? `<div class="prf-day">${esc(shortDate(c.date))} · ${esc(agoLabel(c.date))}</div>` : '';
            lastDate = c.date;
            const lines = c.prs.map(pr => {
                const t = prText(pr);
                return `<div class="prf-line">${kindBadge(pr.kind)}<span class="pv">${esc(t.now)}</span>${t.prev ? `<span class="pp">${esc(t.prev)}</span>` : ''}</div>`;
            }).join('');
            return `${head}<button class="prf" type="button" data-open="${esc(c.key)}">
                <div class="prf-name">${dot(c.bodyPart)}<span>${esc(c.name)}</span></div>${lines}
            </button>`;
        }).join('') + (cards.length > LIMIT
            ? `<button class="more-btn" type="button" id="prFeedMore">${prFeedAll ? 'Show fewer' : `Show all ${cards.length}`}</button>` : '');
    }

    function renderStalls(){
        const el = $('stallList');
        const rows = TS.stalls(TODAY_ISO, IDX);
        if (!rows.length) {
            el.innerHTML = `<div class="empty">${HAS_DATA ? `Nothing stalled — every lift you're training has moved in its last ${TS.STALL_SESSIONS} sessions.` : 'Nothing yet.'}</div>`;
            return;
        }
        el.innerHTML = rows.map(s => `
            <button class="stall" type="button" data-open="${esc(TS.exKey(s.name, s.bodyPart))}">
                <div class="st-main">
                    <div class="st-name">${esc(s.name)}</div>
                    <div class="st-sub">${esc(s.bodyPart)} · best ${nf(s.bestE1)} before ${mdOf(s.since)} · last ${s.sessions}: ${nf(s.recentE1)}</div>
                </div>
                <span class="st-val">${nf(s.recentE1)}</span><span class="chev">›</span>
            </button>`).join('');
    }

    const coachReady = () => !!(window.CoachExport && typeof window.CoachExport.open === 'function');
    function renderCoachBtn(){ $('coachBtn').hidden = !coachReady(); }

    function renderOverview(){
        renderCoachBtn();
        renderWeek();
        renderMuscleSets();
        renderDue();
        renderPrFeed();
        renderStalls();
    }

    /* =========================================================
       Tab 2 — Exercises
       ========================================================= */
    const EX_PARTS = [...new Set(EX_ROWS.map(e => e.bodyPart))].sort(byPart);
    let exPart  = pick(readUI(UI_KEYS.exPart), ['all', ...EX_PARTS], 'all');
    let exSort  = pick(readUI(UI_KEYS.exSort), ['recent', 'sessions', 'trend', 'name'], 'recent');
    let exQuery = '';

    const EX_SORTERS = {
        recent:   (a, b) => (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0),
        sessions: (a, b) => b.sessions - a.sessions || EX_SORTERS.recent(a, b),
        trend:    (a, b) => (b.trendPct == null ? -Infinity : b.trendPct) - (a.trendPct == null ? -Infinity : a.trendPct) || EX_SORTERS.recent(a, b),
        name:     (a, b) => a.name.localeCompare(b.name)
    };

    function renderExChips(){
        const count = p => EX_ROWS.filter(e => e.bodyPart === p).length;
        $('exPartChips').innerHTML =
            `<button class="chip sm${exPart === 'all' ? ' active' : ''}" type="button" data-part="all">All ${EX_ROWS.length}</button>` +
            EX_PARTS.map(p => `<button class="chip sm${exPart === p ? ' active' : ''}" type="button" data-part="${esc(p)}"><i class="dot" style="background:${partColor(p)}"></i>${esc(p)} ${count(p)}</button>`).join('');
        document.querySelectorAll('#exSortChips .chip').forEach(c => c.classList.toggle('active', c.dataset.sort === exSort));
    }

    function renderExList(){
        const el = $('exList');
        if (!EX_ROWS.length) { el.innerHTML = '<div class="card"><div class="empty">No exercises logged yet.</div></div>'; return; }
        const q = exQuery.trim().toLowerCase();
        const rows = EX_ROWS.filter(e => (exPart === 'all' || e.bodyPart === exPart) && (!q || e.name.toLowerCase().includes(q)));
        if (!rows.length) { el.innerHTML = '<div class="card"><div class="empty">No exercises match.</div></div>'; return; }

        const groups = new Map();
        rows.forEach(e => { if (!groups.has(e.bodyPart)) groups.set(e.bodyPart, []); groups.get(e.bodyPart).push(e); });
        el.innerHTML = [...groups.keys()].sort(byPart).map(p => {
            const list = groups.get(p).slice().sort(EX_SORTERS[exSort]);
            return `<div class="exg">
                <div class="exg-head">${dot(p)}${esc(p)}<span>${list.length}</span></div>
                ${list.map(e => `<button class="exr" type="button" data-open="${esc(e.key)}">
                    <div class="er-main">
                        <div class="er-name">${esc(e.name)}${e.perHand ? '<span class="ph-tag">per hand</span>' : ''}</div>
                        <div class="er-sub">${plural(e.sessions, 'session')} · ${esc(agoLabel(e.lastDate))}</div>
                    </div>
                    <div class="er-right">
                        <div class="er-e1">${e.bestE1 ? nf(e.bestE1) : '—'}<small>e1RM</small></div>
                        <div class="er-tr">${trendHtml(e.trendPct)}</div>
                    </div>
                    <span class="chev">›</span>
                </button>`).join('')}
            </div>`;
        }).join('');
    }

    function renderExercises(){ renderExChips(); renderExList(); }

    /* =========================================================
       Exercise detail (full-screen view)
       ========================================================= */
    let detailKey  = null;
    let chartRange = pick(readUI(UI_KEYS.chartRange), ['3m', '6m', '1y', 'all'], '6m');
    let histAll    = false;
    const RANGE_DAYS = { '3m': 91, '6m': 182, '1y': 365 };

    function openDetail(key){
        const rec = IDX.exercises.get(key);
        if (!rec) return;
        const wasOpen = !$('detail').hidden;
        detailKey = key;
        histAll = false;
        $('detail').hidden = false;
        $('detail').scrollTop = 0;
        document.body.classList.add('locked');
        // a history entry, so the phone's back gesture closes the detail, not the page
        if (!wasOpen) { try { history.pushState({ analyticsEx: key }, ''); } catch (e) {} }
        renderDetail();
    }
    function hideDetail(){
        $('detail').hidden = true;
        document.body.classList.remove('locked');
        detailKey = null;
        killChart('line'); killChart('scatter');
    }
    function closeDetail(){
        if (history.state && history.state.analyticsEx) history.back();   // popstate hides it
        else hideDetail();
    }
    window.addEventListener('popstate', () => { if (!$('detail').hidden) hideDetail(); });

    function renderDetail(){
        const rec = IDX.exercises.get(detailKey);
        if (!rec) return;
        const ss    = rec.sessions;
        const first = ss[0], last = ss[ss.length - 1];
        const row   = EX_ROWS.find(e => e.key === rec.key) || {};

        $('detailName').textContent = rec.name;
        $('detailSub').innerHTML = `${dot(rec.bodyPart)}${esc(rec.bodyPart)} · last ${esc(agoLabel(last.date))}${rec.perHand ? ' <span class="ph-tag">per hand</span>' : ''}`;
        $('detailNote').hidden = !rec.perHand;

        let bestE1 = ss[0], heavy = ss[0];
        ss.forEach(s => {
            if (s.e1 > bestE1.e1) bestE1 = s;
            if (s.topW > heavy.topW || (s.topW === heavy.topW && s.topR > heavy.topR)) heavy = s;
        });
        $('detailTiles').innerHTML = `
            <div class="tile gold"><div class="tv">${nf(bestE1.e1)}<small>lb</small></div><div class="tl">Best e1RM</div><div class="ts">${esc(shortDate(bestE1.date))}</div></div>
            <div class="tile"><div class="tv">${heavy.topW}×${heavy.topR}</div><div class="tl">Heaviest set</div><div class="ts">${esc(shortDate(heavy.date))}</div></div>
            <div class="tile"><div class="tv">${ss.length}</div><div class="tl">Sessions</div><div class="ts">since ${esc(mdOf(first.date))}${dateOf(first.date).getFullYear() !== THIS_YEAR ? '/' + String(dateOf(first.date).getFullYear()).slice(-2) : ''}</div></div>
            <div class="tile"><div class="tv">${trendHtml(row.trendPct)}</div><div class="tl">Trend</div><div class="ts">last 3 vs 3 before</div></div>`;

        renderLineChart(rec);
        renderRepTable(rec);
        renderScatter(rec);
        renderHistory(rec);
    }

    function renderLineChart(rec){
        document.querySelectorAll('#chartRangeChips .chip').forEach(c => c.classList.toggle('active', c.dataset.crange === chartRange));
        const color = partColor(rec.bodyPart);
        $('lineKeyE1').style.background = color;

        const all = TS.e1rmSeries(rec.name, rec.bodyPart, IDX);
        const cutoff = RANGE_DAYS[chartRange] ? TS.addDays(TODAY_ISO, -RANGE_DAYS[chartRange]) : null;
        const pts = all.filter(p => !cutoff || p.date >= cutoff);
        const prDates = PR_DAY.get(rec.key) || new Map();
        const isE1PR = d => (prDates.get(d) || []).some(p => p.kind === 'e1rm');

        killChart('line');
        if (pts.length) {
            const a = pts[0].e1, b = pts[pts.length - 1].e1;
            const ch = a > 0 ? ((b - a) / a) * 100 : 0;
            $('lineSub').innerHTML = pts.length > 1
                ? `${nf(a)} → ${nf(b)} lb <span class="${ch > 0.05 ? 'up' : ch < -0.05 ? 'down' : 'flat'}">${ch > 0 ? '+' : ''}${ch.toFixed(1)}%</span>`
                : `${nf(b)} lb`;
        } else {
            $('lineSub').textContent = '';
        }
        $('lineNote').textContent = !pts.length
            ? `Nothing logged in this range — the last session was ${agoLabel(all[all.length - 1].date)}.`
            : 'Est. 1RM is the Epley estimate (weight × (1 + reps ÷ 30), reps capped at 15) from each session\'s best set. Tap a point to read it.';

        if (!HAS_CHART) { chartFallback('lineChart', 'Charts need a connection the first time (Chart.js).'); return; }
        chartFallback('lineChart', pts.length ? '' : 'No sessions in this range');
        if (!pts.length) return;

        const t = iso => dateOf(iso).getTime();
        const crossesYear = dateOf(pts[0].date).getFullYear() !== dateOf(pts[pts.length - 1].date).getFullYear();
        charts.line = new Chart($('lineChart'), {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Est. 1RM',
                        data: pts.map(p => ({ x: t(p.date), y: p.e1, s: p })),
                        borderColor: color, backgroundColor: color + '22', fill: 'origin',
                        borderWidth: 2.2, tension: 0.25,
                        pointRadius: pts.map(p => (isE1PR(p.date) ? 4 : (pts.length > 40 ? 0 : 2.5))),
                        pointBackgroundColor: pts.map(p => (isE1PR(p.date) ? '#ffd54a' : color)),
                        pointBorderWidth: 0, pointHitRadius: 10
                    },
                    {
                        label: 'Top set',
                        data: pts.map(p => ({ x: t(p.date), y: p.topW, s: p })),
                        borderColor: 'rgba(159,176,199,.5)', borderDash: [4, 4], borderWidth: 1.5,
                        pointRadius: 0, pointHitRadius: 8, tension: 0, fill: false
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { right: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: Object.assign({}, TOOLTIP, {
                        callbacks: {
                            title: items => (items.length ? longDate(items[0].raw.s.date) : ''),
                            label: item => (item.datasetIndex === 0
                                ? `e1RM ${nf(item.raw.y)} lb${isE1PR(item.raw.s.date) ? '  · Strength PR' : ''}`
                                : `Top set ${item.raw.s.topW}×${item.raw.s.topR}`)
                        }
                    })
                },
                scales: {
                    x: {
                        type: 'linear', bounds: 'data',
                        grid: { display: false },
                        ticks: {
                            maxTicksLimit: 5, maxRotation: 0,
                            callback: v => { const d = new Date(v); return `${d.getMonth() + 1}/${d.getDate()}` + (crossesYear ? `/${String(d.getFullYear()).slice(-2)}` : ''); }
                        }
                    },
                    y: { grace: '8%', ticks: { maxTicksLimit: 5, callback: v => compact(v) } }
                }
            }
        });
    }

    function renderRepTable(rec){
        const rows = TS.repBests(rec.sessions);
        $('repTable').innerHTML = `<table class="tbl">
            <thead><tr><th>Reps</th><th class="num">Best</th><th class="num">e1RM</th><th class="num">When</th></tr></thead>
            <tbody>${rows.map(r => r.best
                ? `<tr class="${r.onFrontier ? 'front' : ''}"><td>${esc(r.label)}</td><td class="num">${r.best.weight}×${r.best.reps}</td><td class="num">${nf(TS.e1rm(r.best.weight, r.best.reps))}</td><td class="num dim">${esc(agoLabel(r.best.date))}</td></tr>`
                : `<tr><td>${esc(r.label)}</td><td class="num dim">—</td><td class="num dim">—</td><td class="num dim"></td></tr>`).join('')}
            </tbody></table>
            <div class="note">Heaviest weight you've done for that many reps. Gold = also a rep best (nothing heavier for more reps).</div>`;
    }

    function renderScatter(rec){
        killChart('scatter');
        if (!HAS_CHART) { chartFallback('scatterChart', 'Charts need a connection the first time (Chart.js).'); return; }
        chartFallback('scatterChart', '');

        const lastDate = rec.sessions[rec.sessions.length - 1].date;
        const pts = new Map();                     // one dot per weight×reps, newest date kept
        const lastPts = [];
        rec.sessions.forEach(s => s.sets.forEach(x => {
            if (!(x.weight > 0 && x.reps > 0)) return;
            const k = x.weight + '|' + x.reps;
            const p = pts.get(k) || { x: x.reps, y: x.weight, n: 0, date: s.date };
            p.n++; p.date = s.date;
            pts.set(k, p);
            if (s.date === lastDate) lastPts.push({ x: x.reps, y: x.weight, n: 1, date: s.date });
        }));

        // frontier, lightest-heaviest flipped so reps run left → right; lead-in from 0 reps
        const f = TS.frontier(rec.sessions).slice().sort((a, b) => a.reps - b.reps);
        const step = f.length ? [{ x: 0, y: f[0].weight, lead: true }].concat(f.map(p => ({ x: p.reps, y: p.weight, date: p.date, n: 0 }))) : [];
        const color = partColor(rec.bodyPart);

        charts.scatter = new Chart($('scatterChart'), {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Rep bests', data: step, showLine: true, stepped: 'after',
                        borderColor: '#ffd54a', borderWidth: 2, backgroundColor: '#ffd54a',
                        pointRadius: step.map(p => (p.lead ? 0 : 3.5)), pointHitRadius: step.map(p => (p.lead ? 0 : 8)),
                        order: 0
                    },
                    {
                        label: 'Last session', data: lastPts,
                        backgroundColor: '#ffffff', borderColor: '#0b1118', borderWidth: 1, pointRadius: 4, order: 1
                    },
                    {
                        label: 'Sets', data: [...pts.values()],
                        backgroundColor: color + '66', borderWidth: 0,
                        pointRadius: [...pts.values()].map(p => Math.min(6, 2.5 + Math.sqrt(p.n) * 0.8)), order: 2
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: Object.assign({}, TOOLTIP, {
                        filter: item => !item.raw.lead,
                        callbacks: {
                            title: () => '',
                            label: item => {
                                const p = item.raw;
                                if (item.datasetIndex === 0) return `Rep best ${p.y}×${p.x} · ${mdOf(p.date)}`;
                                if (item.datasetIndex === 1) return `Last session ${p.y}×${p.x}`;
                                return `${p.y}×${p.x}${p.n > 1 ? ` · ${p.n} sets` : ''} · last ${mdOf(p.date)}`;
                            }
                        }
                    })
                },
                scales: {
                    x: { min: 0, suggestedMax: 12, title: { display: true, text: 'reps' }, ticks: { precision: 0, maxTicksLimit: 8 }, grid: { color: 'rgba(42,53,67,.35)' } },
                    y: { grace: '6%', title: { display: true, text: rec.perHand ? 'lb per hand' : 'lb' }, ticks: { maxTicksLimit: 6 } }
                }
            }
        });
    }

    function renderHistory(rec){
        const ss = rec.sessions.slice().reverse();
        const LIMIT = 12;
        const prDates = PR_DAY.get(rec.key) || new Map();
        $('histCount').textContent = plural(ss.length, 'session');
        const shown = histAll ? ss : ss.slice(0, LIMIT);

        $('histList').innerHTML = shown.map(s => {
            const prs = (prDates.get(s.date) || []).filter(p => p.kind !== 'setVolume');
            let topDone = false;
            const sets = s.sets.map(x => {
                const isTop = !topDone && x.weight === s.topW && x.reps === s.topR;
                if (isTop) topDone = true;
                return `<span class="${isTop ? 'top' : ''}">${x.weight}×${x.reps}${x.superset ? 'rp' : ''}</span>`;
            }).join('');
            const badges = prs.map(p => `${kindBadge(p.kind)}<span>${esc(prText(p).now)}</span>`).join('');
            return `<div class="hs${prs.length ? ' pr' : ''}">
                <div class="hs-top">
                    <span class="hs-date">${esc(shortDate(s.date))}</span>
                    <span class="hs-ago">${esc(agoLabel(s.date))}</span>
                    <span class="hs-e1">e1RM <b>${nf(s.e1)}</b></span>
                </div>
                <div class="hs-sets">${sets}</div>
                <div class="hs-meta"><span>${plural(s.setCount, 'set')} · ${nf(s.vol)} lb</span>${badges}</div>
            </div>`;
        }).join('') + (ss.length > LIMIT
            ? `<button class="more-btn" type="button" id="histMore">${histAll ? 'Show fewer' : `Show all ${ss.length}`}</button>` : '');
    }

    /* =========================================================
       Tab 3 — Consistency
       ========================================================= */
    /* Fill for one day's bar. A single muscle group is flat colour; two or more
       become alternating 45° stripes, widths proportional to each group's share. */
    function stripeBackground(parts, total){
        if (!parts.length) return '';
        if (parts.length === 1) return partColor(parts[0][0]);
        const CYCLE = Math.max(18, parts.length * 10);
        const MIN = 4;
        let widths = parts.map(([, vol]) => Math.max(MIN, (vol / total) * CYCLE));
        const sum = widths.reduce((a, b) => a + b, 0);
        widths = widths.map(w => (w * CYCLE) / sum);
        let pos = 0;
        const stops = parts.map(([part], i) => {
            const start = pos, end = pos + widths[i];
            pos = end;
            return `${partColor(part)} ${start.toFixed(2)}px ${end.toFixed(2)}px`;
        });
        return `repeating-linear-gradient(45deg, ${stops.join(', ')})`;
    }

    /* [part, volume] for one day, biggest first. */
    function dayParts(day){
        const m = {};
        day.exercises.forEach(ex => { if (ex.vol > 0) m[ex.bodyPart] = (m[ex.bodyPart] || 0) + ex.vol; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    }

    let selectedRange  = pick(readUI(UI_KEYS.range), ['7', '14', '21', 'month'], '7');
    let selectedDayIso = null;
    let collapsedGroups   = new Set();
    let expandedExercises = new Set();

    function rangeDates(){
        const out = [];
        if (selectedRange === 'month') {
            const start = TODAY_ISO.slice(0, 8) + '01';
            for (let d = start; d <= TODAY_ISO; d = TS.addDays(d, 1)) out.push(d);
        } else {
            const n = Number(selectedRange) || 7;
            for (let i = n - 1; i >= 0; i--) out.push(TS.addDays(TODAY_ISO, -i));
        }
        return out;
    }

    function renderTraining(){
        document.querySelectorAll('#rangeChips .chip').forEach(c => c.classList.toggle('active', c.dataset.range === selectedRange));
        const rows = rangeDates().map(iso => {
            const day = DAY_MAP.get(iso);
            return { iso, day, vol: day ? day.vol : 0, parts: day ? dayParts(day) : [] };
        });
        const trained = rows.filter(r => r.vol > 0);
        const max = Math.max(0, ...rows.map(r => r.vol));
        $('rangeMax').textContent = max > 0 ? `peak ${compact(max)} lb` : '';

        if (!rows.some(r => r.iso === selectedDayIso)) {
            selectDay(trained.length ? trained[trained.length - 1].iso : null, false);
        }

        const step = rows.length <= 7 ? 1 : rows.length <= 14 ? 2 : rows.length <= 21 ? 3 : 4;
        $('dayBars').innerHTML = rows.map((r, i) => {
            const h = max > 0 ? Math.round((r.vol / max) * 100) : 0;
            const showLbl = (i % step === 0) || i === rows.length - 1 || r.iso === selectedDayIso;
            const cls = ['daybar', r.vol > 0 ? '' : 'rest', r.iso === selectedDayIso ? 'sel' : '', r.iso === TODAY_ISO ? 'today' : ''].filter(Boolean).join(' ');
            const fill = r.vol > 0 ? `; background:${stripeBackground(r.parts, r.vol)}` : '';
            return `<button class="${cls}" type="button" data-iso="${r.iso}" aria-label="${r.iso}">
                <span class="db-track"><i class="db-fill" style="height:${h}%${fill}"></i></span>
                <span class="db-lbl">${showLbl ? dateOf(r.iso).getDate() : ''}</span>
            </button>`;
        }).join('');

        const parts = [...new Set(trained.flatMap(r => r.parts.map(p => p[0])))].sort(byPart);
        $('partLegend').innerHTML = parts.map(p => `<span><i style="background:${partColor(p)}"></i>${esc(p)}</span>`).join('');
        renderDayPanel();
    }

    function selectDay(iso, rerender){
        if (iso !== selectedDayIso) { collapsedGroups = new Set(); expandedExercises = new Set(); }
        selectedDayIso = iso;
        if (rerender !== false) renderTraining();
    }

    function dayGroups(day){
        const groups = {};
        day.exercises.forEach(ex => { (groups[ex.bodyPart] = groups[ex.bodyPart] || []).push(ex); });
        return groups;
    }

    function renderDayPanel(){
        const sumEl = $('daySum'), wrapEl = $('dayGroups'), actEl = $('dayActions');
        const day = selectedDayIso ? DAY_MAP.get(selectedDayIso) : null;
        if (!day) {
            sumEl.textContent = selectedDayIso ? 'Rest day' : 'No workouts in this range.';
            wrapEl.innerHTML = '';
            actEl.style.visibility = 'hidden';
            return;
        }
        actEl.style.visibility = '';
        const groups = dayGroups(day);
        const bps = Object.keys(groups).sort(byPart);
        sumEl.innerHTML = `<b>${nf(day.vol)} lb</b> · ${day.sets} sets · ${day.exercises.length} ex · ${esc(shortDate(day.date))}`;

        wrapEl.innerHTML = bps.map(bp => {
            const list = groups[bp];
            const gVol = list.reduce((s, e) => s + e.vol, 0);
            const gSets = list.reduce((s, e) => s + e.sets.length, 0);
            const gKey = `g:${bp}`;
            const body = list.map((ex, i) => {
                const eKey = `e:${bp}:${i}`;
                const open = expandedExercises.has(eKey);
                const top = ex.sets.reduce((b, s) => ((s.weight > b.weight || (s.weight === b.weight && s.reps > b.reps)) ? s : b), { weight: 0, reps: 0 });
                const reps = ex.sets.reduce((a, s) => a + s.reps, 0);
                const setRows = ex.sets.map((s, j) => `<div class="set-item${s.weight === top.weight && s.reps === top.reps ? ' set-top' : ''}">
                        <span class="si-n">SET ${j + 1}</span>
                        <span class="si-w">${s.weight}</span><span class="si-unit">lb</span>
                        <span class="si-x">×</span><span class="si-r">${s.reps}</span>
                        <span class="si-vol">${nf(TS.setVolume(ex, s))} lb</span>
                    </div>`).join('');
                return `<div class="exrow${open ? '' : ' collapsed'}">
                    <div class="exrow-head" data-ekey="${esc(eKey)}">
                        <span class="ex-chev">▼</span>
                        <div style="flex:1 1 auto; min-width:0">
                            <div class="exrow-name">${esc(ex.name)}${ex.mult === 2 ? '<span class="ph-tag">per hand</span>' : ''}</div>
                            <div class="exrow-tag">${ex.sets.length} set(s) · ${nf(ex.vol)} lb · avg ${reps ? Math.round(ex.vol / reps) : 0} lb/rep</div>
                        </div>
                        ${IDX.exercises.has(ex.key) ? `<button class="exrow-open" type="button" data-open="${esc(ex.key)}" aria-label="Open ${esc(ex.name)}">›</button>` : ''}
                    </div>
                    <div class="exrow-body">${setRows}</div>
                </div>`;
            }).join('');
            return `<div class="cgroup${collapsedGroups.has(gKey) ? ' collapsed' : ''}">
                <div class="cgroup-head" data-gkey="${esc(gKey)}">
                    <span class="cgroup-chev">▼</span>
                    <span class="cgroup-name">${dot(bp)}${esc(bp)}</span>
                    <span class="cgroup-meta">${list.length} ex · ${gSets} sets · ${compact(gVol)} lb</span>
                </div>
                <div class="cgroup-body">${body}</div>
            </div>`;
        }).join('');
    }

    function renderStreakTiles(){
        const dates = [...DAY_MAP.keys()].sort();
        const el = $('streakTiles');
        if (!dates.length) {
            el.innerHTML = '<div class="tile"><div class="tv">—</div><div class="tl">No workouts logged</div></div>';
            return;
        }
        const last = dates[dates.length - 1];
        const spanWks = Math.max(1, (TS.daysBetween(dates[0], TODAY_ISO) + 1) / 7);
        const perWeek = (dates.length / spanWks).toFixed(1);

        // consecutive Mon–Sun weeks with >= 1 workout; an empty current week doesn't break it yet
        const weekKeys = new Set(dates.map(d => TS.weekStart(d)));
        let streak = 0;
        let w = TS.weekStart(TODAY_ISO);
        if (!weekKeys.has(w)) w = TS.addDays(w, -7);
        while (weekKeys.has(w)) { streak++; w = TS.addDays(w, -7); }

        let best = 0, run = 0, prevW = null;
        [...weekKeys].sort().forEach(wk => {
            run = (prevW && TS.daysBetween(prevW, wk) === 7) ? run + 1 : 1;
            best = Math.max(best, run);
            prevW = wk;
        });

        el.innerHTML = `
            <div class="tile ${streak >= 2 ? 'gold' : ''}"><div class="tv">${streak}</div><div class="tl">Week streak</div><div class="ts">best: ${best}</div></div>
            <div class="tile"><div class="tv">${esc(agoLabel(last))}</div><div class="tl">Last workout</div><div class="ts">${mdOf(last)}</div></div>
            <div class="tile"><div class="tv">${perWeek}</div><div class="tl">Per week</div><div class="ts">lifetime average</div></div>
            <div class="tile"><div class="tv">${nf(dates.length)}</div><div class="tl">Workouts</div><div class="ts">all time</div></div>`;
    }

    function renderRecency(){
        const el = $('recencyList');
        const rows = TS.lastTrainedByPart(TODAY_ISO, IDX);
        if (!rows.length) { el.innerHTML = '<div class="note">No workouts logged yet.</div>'; return; }
        const since = TS.addDays(TODAY_ISO, -29);
        const count30 = {};
        DAY_MAP.forEach(day => {
            if (day.date < since || day.date > TODAY_ISO) return;
            new Set(day.exercises.map(e => e.bodyPart)).forEach(p => { count30[p] = (count30[p] || 0) + 1; });
        });
        const maxDays = Math.max(7, ...rows.map(r => r.daysAgo));
        el.innerHTML = rows.map(r => `
            <div class="rec-row">
                <span class="rec-name">${esc(r.part)}</span>
                <span class="rec-track"><i style="width:${Math.round((r.daysAgo / maxDays) * 100)}%; background:${staleColor(r.daysAgo)}"></i></span>
                <span class="rec-val">${r.daysAgo === 0 ? 'today' : r.daysAgo + 'd'} · ${count30[r.part] || 0}×/30d</span>
            </div>`).join('');
    }

    function renderConsistency(){ renderTraining(); renderStreakTiles(); renderRecency(); }

    /* =========================================================
       Tab 4 — Records
       ========================================================= */
    const REC_ROWS = [...IDX.exercises.values()].map(rec => {
        let e1 = { v: 0, date: null }, heavy = { w: 0, r: 0, date: null }, vol = { v: 0, date: null };
        rec.sessions.forEach(s => {
            if (s.e1 > e1.v) e1 = { v: s.e1, date: s.date };
            if (s.topW > heavy.w || (s.topW === heavy.w && s.topR > heavy.r)) heavy = { w: s.topW, r: s.topR, date: s.date };
            if (s.vol > vol.v) vol = { v: s.vol, date: s.date };
        });
        return {
            rec, e1, heavy, vol,
            front: TS.frontier(rec.sessions),
            prs: PR_LIST.get(rec.key) || [],
            last: rec.sessions[rec.sessions.length - 1]
        };
    });

    let recKind = pick(readUI(UI_KEYS.recKind), ['all', 'e1rm', 'weight', 'reps', 'volume'], 'all');
    let recSort = pick(readUI(UI_KEYS.recSort), ['recent', 'stale', 'strong', 'name'], 'recent');

    const lastPrOf = r => r.prs.find(p => (recKind === 'all' ? p.kind !== 'setVolume' : p.kind === recKind)) || null;

    function renderRecords(){
        document.querySelectorAll('#recKindChips .chip').forEach(c => c.classList.toggle('active', c.dataset.kind === recKind));
        document.querySelectorAll('#recSortChips .chip').forEach(c => c.classList.toggle('active', c.dataset.sort === recSort));

        const el = $('recordsList');
        if (!REC_ROWS.length) {
            $('recordsCount').textContent = '';
            el.innerHTML = '<div class="card"><div class="empty">No records yet — log a workout to get started.</div></div>';
            return;
        }
        const rows = REC_ROWS.map(r => ({ r, pr: lastPrOf(r) }));
        const since = TS.addDays(TODAY_ISO, -30);
        const n30 = PR_ALL.filter(p => p.date >= since && (recKind === 'all' ? p.kind !== 'setVolume' : p.kind === recKind)).length;
        const kindName = recKind === 'all' ? 'PRs' : KIND[recKind].label + 's';
        $('recordsCount').textContent = `${plural(REC_ROWS.length, 'exercise')} · ${n30} ${kindName} in the last 30 days`;

        const prDate = x => (x.pr ? x.pr.date : null);
        const nullsLast = (a, b, cmp) => (prDate(a) && prDate(b) ? cmp() : prDate(a) ? -1 : prDate(b) ? 1 : a.r.rec.name.localeCompare(b.r.rec.name));
        const sorters = {
            recent: (a, b) => nullsLast(a, b, () => (prDate(a) < prDate(b) ? 1 : prDate(a) > prDate(b) ? -1 : 0)),
            stale:  (a, b) => nullsLast(a, b, () => (prDate(a) > prDate(b) ? 1 : prDate(a) < prDate(b) ? -1 : 0)),
            strong: (a, b) => b.r.e1.v - a.r.e1.v,
            name:   (a, b) => a.r.rec.name.localeCompare(b.r.rec.name)
        };
        rows.sort(sorters[recSort]);

        el.innerHTML = rows.map(({ r, pr }) => {
            const rec = r.rec;
            const fresh = pr && pr.date >= since;
            const hi = k => (recKind === k ? ' hi' : '');
            const FRONT_MAX = 6;
            const front = r.front.slice(0, FRONT_MAX).map(p => `<span class="f">${p.weight}×${p.reps}</span>`).join('') +
                (r.front.length > FRONT_MAX ? `<span class="dim">+${r.front.length - FRONT_MAX}</span>` : '');
            const foot = pr
                ? `${kindBadge(pr.kind)}<span class="pv">${esc(prText(pr).now)}</span><span>· ${esc(agoLabel(pr.date))}</span>`
                : `<span class="kb k-none">${rec.sessions.length > 1 ? `No ${recKind === 'all' ? 'PR' : esc(KIND[recKind].label)} yet` : 'Baseline'}</span>`;
            return `<button class="prc${fresh ? ' fresh' : ''}" type="button" data-open="${esc(rec.key)}">
                <div class="prc-top">
                    <span class="prc-name">${esc(rec.name)}${rec.perHand ? '<span class="ph-tag">per hand</span>' : ''}</span>
                    <span class="prc-part">${dot(rec.bodyPart)}${esc(rec.bodyPart)}</span>
                </div>
                <div class="prc-grid">
                    <div class="prc-cell${hi('e1rm')}"><div class="k">Est. 1RM</div><div class="v">${nf(r.e1.v)} lb</div><div class="d">${r.e1.date ? mdOf(r.e1.date) : ''}</div></div>
                    <div class="prc-cell${hi('weight')}"><div class="k">Heaviest</div><div class="v">${r.heavy.w}×${r.heavy.r}</div><div class="d">${r.heavy.date ? mdOf(r.heavy.date) : ''}</div></div>
                    <div class="prc-cell${hi('volume')}"><div class="k">Best session</div><div class="v">${compact(r.vol.v)} lb</div><div class="d">${r.vol.date ? mdOf(r.vol.date) : ''}</div></div>
                </div>
                <div class="prc-front${hi('reps')}"><span class="k">Rep bests</span>${front}</div>
                <div class="prc-foot">${foot}<span>· ${plural(rec.sessions.length, 'session')}</span></div>
            </button>`;
        }).join('');
    }

    /* =========================================================
       Backup / restore — unchanged behaviour
       ========================================================= */
    function exportAllWorkoutData(){
        const all = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!/^powerUp:\d{4}-\d{2}-\d{2}$/.test(k)) continue;
            try {
                const day = JSON.parse(localStorage.getItem(k));
                if (day && day.date) all.push(day);
            } catch (e) {}
        }
        all.sort((a, b) => (a.date < b.date ? -1 : 1));
        return all;
    }

    function importWorkoutData(jsonArray){
        if (!Array.isArray(jsonArray)) {
            alert('Invalid file: expected a JSON array of workouts.');
            return { added: 0, skipped: 0 };
        }
        let added = 0, skipped = 0;
        jsonArray.forEach(day => {
            if (!day || !day.date || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return;
            const key = 'powerUp:' + day.date;
            if (localStorage.getItem(key)) { skipped++; return; }   // never overwrite existing data
            try { localStorage.setItem(key, JSON.stringify(day)); added++; }
            catch (e) { console.error('Failed to import ' + day.date, e); }
        });
        return { added, skipped };
    }

    function downloadJSON(filename, dataObj){
        const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 250);
    }

    /* =========================================================
       Wiring
       ========================================================= */
    const VIEWS = ['overview', 'exercises', 'consistency', 'records'];
    function showTab(view){
        view = pick(view, VIEWS, 'overview');
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
        VIEWS.forEach(v => { $('panel-' + v).hidden = (v !== view); });
        writeUI(UI_KEYS.tab, view);
        window.scrollTo(0, 0);
    }
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.view)));

    // anything with data-open (PR feed, stalls, exercise rows, records, day panel) opens the detail
    document.addEventListener('click', e => {
        const b = e.target.closest('[data-open]');
        if (!b || b.closest('#detail')) return;
        e.stopPropagation();
        openDetail(b.dataset.open);
    }, true);

    $('coachBtn').addEventListener('click', () => {
        if (coachReady()) window.CoachExport.open(null, null);
        else renderCoachBtn();
    });

    $('prFeed').addEventListener('click', e => {
        if (e.target.closest('#prFeedMore')) { prFeedAll = !prFeedAll; renderPrFeed(); }
    });

    // Exercises
    $('exSearch').addEventListener('input', e => { exQuery = e.target.value || ''; renderExList(); });
    $('exPartChips').addEventListener('click', e => {
        const b = e.target.closest('[data-part]'); if (!b) return;
        exPart = b.dataset.part;
        writeUI(UI_KEYS.exPart, exPart);
        renderExercises();
    });
    $('exSortChips').addEventListener('click', e => {
        const b = e.target.closest('[data-sort]'); if (!b) return;
        exSort = b.dataset.sort;
        writeUI(UI_KEYS.exSort, exSort);
        renderExercises();
    });

    // Detail
    $('detailBack').addEventListener('click', closeDetail);
    $('chartRangeChips').addEventListener('click', e => {
        const b = e.target.closest('[data-crange]'); if (!b || !detailKey) return;
        chartRange = b.dataset.crange;
        writeUI(UI_KEYS.chartRange, chartRange);
        const rec = IDX.exercises.get(detailKey);
        if (rec) renderLineChart(rec);
    });
    $('histList').addEventListener('click', e => {
        if (!e.target.closest('#histMore') || !detailKey) return;
        histAll = !histAll;
        const rec = IDX.exercises.get(detailKey);
        if (rec) renderHistory(rec);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('detail').hidden) closeDetail(); });

    // Consistency
    $('rangeChips').addEventListener('click', e => {
        const b = e.target.closest('[data-range]'); if (!b) return;
        selectedRange = b.dataset.range;
        writeUI(UI_KEYS.range, selectedRange);
        renderTraining();
    });
    $('dayBars').addEventListener('click', e => {
        const bar = e.target.closest('.daybar[data-iso]'); if (!bar) return;
        selectDay(bar.dataset.iso);
    });
    $('dayGroups').addEventListener('click', e => {
        const g = e.target.closest('[data-gkey]');
        if (g) {
            const k = g.dataset.gkey;
            collapsedGroups.has(k) ? collapsedGroups.delete(k) : collapsedGroups.add(k);
            renderDayPanel();
            return;
        }
        const x = e.target.closest('[data-ekey]');
        if (x) {
            const k = x.dataset.ekey;
            expandedExercises.has(k) ? expandedExercises.delete(k) : expandedExercises.add(k);
            renderDayPanel();
        }
    });
    $('dayActions').addEventListener('click', e => {
        const b = e.target.closest('[data-day-act]'); if (!b) return;
        const day = selectedDayIso ? DAY_MAP.get(selectedDayIso) : null;
        if (!day) return;
        collapsedGroups = new Set();
        expandedExercises = new Set();
        if (b.dataset.dayAct === 'expandAll') {
            const groups = dayGroups(day);
            Object.keys(groups).forEach(bp => groups[bp].forEach((_, i) => expandedExercises.add(`e:${bp}:${i}`)));
        }
        renderDayPanel();
    });

    // Records
    $('recKindChips').addEventListener('click', e => {
        const b = e.target.closest('[data-kind]'); if (!b) return;
        recKind = b.dataset.kind;
        writeUI(UI_KEYS.recKind, recKind);
        renderRecords();
    });
    $('recSortChips').addEventListener('click', e => {
        const b = e.target.closest('[data-sort]'); if (!b) return;
        recSort = b.dataset.sort;
        writeUI(UI_KEYS.recSort, recSort);
        renderRecords();
    });

    // Backup
    $('downloadDataBtn').addEventListener('click', () => {
        const all = exportAllWorkoutData();
        if (!all.length) { alert('No workout data to download yet.'); return; }
        downloadJSON(`powerup-workouts-${TODAY_ISO}.json`, all);
    });
    $('importDataBtn').addEventListener('click', () => $('importFileInput').click());
    $('importFileInput').addEventListener('change', e => {
        const file = e.target.files && e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const { added, skipped } = importWorkoutData(JSON.parse(ev.target.result));
                alert(`Import complete.\nAdded: ${added} day(s)\nSkipped (already present): ${skipped}`);
                if (added) location.reload();
            } catch (err) {
                alert('Could not read that file — is it a Power Up backup?');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    /* ---- boot ---- */
    // a reload while the detail was open leaves its history entry behind; drop it
    try { if (history.state && history.state.analyticsEx) history.replaceState(null, ''); } catch (e) {}

    renderOverview();
    renderExercises();
    renderConsistency();
    renderRecords();
    showTab(readUI(UI_KEYS.tab));
    // CoachExport may finish loading after us
    window.addEventListener('load', renderCoachBtn);
})();
