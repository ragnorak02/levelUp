/* =========================
   MuscleCalendar — month calendar where each workout day is tinted by the
   muscle groups it trained (diagonal stripes, sized by volume share).
   Shared by powerUp/index.html and the workout page's calendar popup, so
   both show the same thing. Reads the powerUp:YYYY-MM-DD records directly.

   const cal = MuscleCalendar.create(rootEl, {
     selected: ()=> 'YYYY-MM-DD',     // outlined in blue
     onSelect: (iso)=> { ... }        // a day was tapped
   });
   cal.render();                       // month defaults to the selected day's
   cal.showMonth(date);                // jump to the month containing `date`
   ========================= */
(function(){
  'use strict';

  // toISOString() is UTC — after 8pm Eastern it rolls the date forward a day
  const isoLocal = d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const GROUPS = [
    { key:'Chest',     label:'Chest', color:'var(--mg-chest)' },
    { key:'Back',      label:'Back',  color:'var(--mg-back)' },
    { key:'Legs',      label:'Legs',  color:'var(--mg-legs)' },
    { key:'Shoulders', label:'Shldr', color:'var(--mg-shoulders)' },
    { key:'Triceps',   label:'Tri',   color:'var(--mg-triceps)' },
    { key:'Biceps',    label:'Bi',    color:'var(--mg-biceps)' },
    { key:'Forearms',  label:'Fore',  color:'var(--mg-forearms)' }
  ];
  const colorOf = key => (GROUPS.find(g=> g.key === key) || {}).color || '';

  function muscleKey(raw){
    const s = String(raw||'').toLowerCase();
    if(s.includes('chest') || s.includes('pec')) return 'Chest';
    if(s.includes('back') || s.includes('lat') || s.includes('row')) return 'Back';
    if(s.includes('leg') || s.includes('quad') || s.includes('ham') || s.includes('glute') || s.includes('calf')) return 'Legs';
    if(s.includes('shoulder') || s.includes('delt')) return 'Shoulders';
    if(s.includes('tricep')) return 'Triceps';
    if(s.includes('bicep')) return 'Biceps';
    if(s.includes('forearm') || s.includes('grip')) return 'Forearms';
    return null;
  }

  // A day that trained more than one group shows every colour as diagonal
  // stripes, each slice sized by that group's share of the day's volume.
  function muscleStripes(entries){
    if(!entries.length) return '';
    if(entries.length === 1) return colorOf(entries[0][0]);

    const CYCLE = Math.max(18, entries.length * 10);
    const total = entries.reduce((sum,[,v])=> sum + v, 0) || 1;

    let widths = entries.map(([,v])=> Math.max(4, (v/total) * CYCLE));
    const sum  = widths.reduce((a,b)=> a+b, 0);
    widths = widths.map(w=> (w * CYCLE) / sum);

    let pos = 0;
    const stops = entries.map(([k],i)=>{
      const start = pos, end = pos + widths[i];
      pos = end;
      return `${colorOf(k)} ${start.toFixed(2)}px ${end.toFixed(2)}px`;
    });
    return `repeating-linear-gradient(45deg, ${stops.join(', ')})`;
  }

  /* day-of-month -> { hasWorkout, vols: Map(muscle -> volume) } for one month */
  function monthInfo(year, month){
    const byDay = new Map();
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(!/^powerUp:\d{4}-\d{2}-\d{2}$/.test(k)) continue;

      let w = null;
      try{ w = JSON.parse(localStorage.getItem(k)); }catch{}
      if(!w) continue;
      const d = new Date(String(w.date || k.slice('powerUp:'.length)).slice(0,10) + 'T00:00:00');
      if(d.getFullYear() !== year || d.getMonth() !== month) continue;

      const dayNum = d.getDate();
      if(!byDay.has(dayNum)) byDay.set(dayNum, { hasWorkout:false, vols:new Map() });
      const info = byDay.get(dayNum);

      // Completion: at least one set with any meaningful values OR any exercises exist
      let anyLogged = false;
      (w.exercises||[]).forEach(ex=>{
        const mk = muscleKey(ex.bodyPart || ex.muscle || ex.group);
        if(!mk) return;
        (ex.sets||[]).forEach(st=>{
          const reps = Number(st.reps)||0;
          const weight = Number(st.weight)||0;
          if(reps>0 || weight>0) anyLogged = true;
          const vol = reps>0 && weight>0 ? (reps*weight) : 0;
          if(vol>0) info.vols.set(mk, (info.vols.get(mk)||0) + vol);
        });
      });
      if((w.exercises||[]).length>0) anyLogged = true;
      if(anyLogged) info.hasWorkout = true;
    }
    return byDay;
  }

  const SHELL_HTML = `
    <div class="cal-header">
      <h3 class="mcal-title">—</h3>
      <div class="cal-nav">
        <button data-step="-1" aria-label="Previous month">←</button>
        <button data-step="1" aria-label="Next month">→</button>
      </div>
    </div>
    <div class="legend legend-muscle">
      ${GROUPS.map(g=> `<span><i class="swatch" style="background:${g.color}"></i> ${g.label}</span>`).join('')}
    </div>
    <div class="cal-grid mcal-dow">
      ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=> `<div class="dow">${d}</div>`).join('')}
    </div>
    <div class="cal-grid mcal-grid"></div>
  `;

  function create(root, opts = {}){
    const selected = opts.selected || (()=> null);
    root.classList.add('mcal');
    root.innerHTML = SHELL_HTML;

    let monthStart = null;

    function showMonth(date){
      monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      render();
    }

    function render(){
      if(!monthStart){
        const sel = selected();
        const base = sel ? new Date(sel + 'T00:00:00') : new Date();
        monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
      }
      const year = monthStart.getFullYear();
      const month = monthStart.getMonth();
      const monthEnd = new Date(year, month+1, 0);
      const now = new Date();
      const todayISO = isoLocal(now);
      const selISO = selected();

      root.querySelector('.mcal-title').textContent =
        monthStart.toLocaleDateString(undefined, {month:'long', year:'numeric'});

      const byDay = monthInfo(year, month);
      const grid = root.querySelector('.mcal-grid');
      grid.innerHTML = '';

      // Previous month dates (muted)
      for(let i = monthStart.getDay() - 1; i >= 0; i--){
        const cell = document.createElement('div');
        cell.className = 'day muted';
        cell.innerHTML = `<div class="num">${new Date(year, month, -i).getDate()}</div>`;
        grid.appendChild(cell);
      }

      // Current month dates
      for(let day=1; day<=monthEnd.getDate(); day++){
        const cell = document.createElement('div');
        const cellISO = isoLocal(new Date(year, month, day));
        const info = byDay.get(day) || { hasWorkout:false, vols:new Map() };

        // every group trained that day, biggest share first
        const ranked = [...info.vols.entries()]
          .filter(([,v])=> (v||0) > 0)
          .sort((a,b)=> b[1] - a[1])
          .slice(0,3);

        let state = info.hasWorkout ? 'hasWorkout' : '';
        if(cellISO === selISO) state += ' selected';
        else if(cellISO === todayISO) state += ' today';
        if(cellISO > todayISO) state += ' future';
        cell.className = `day ${state}`.trim();
        if(info.hasWorkout && ranked.length) cell.style.background = muscleStripes(ranked);

        cell.dataset.iso = cellISO;
        cell.innerHTML = `<div class="num">${day}</div>`;
        grid.appendChild(cell);
      }
    }

    root.addEventListener('click', (e)=>{
      const step = e.target.closest('[data-step]');
      if(step){
        monthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + Number(step.dataset.step), 1);
        render();
        return;
      }
      const cell = e.target.closest('.day[data-iso]');
      if(cell && opts.onSelect) opts.onSelect(cell.dataset.iso);
    });

    return { render, showMonth };
  }

  window.MuscleCalendar = { create, muscleKey, GROUPS };
})();
