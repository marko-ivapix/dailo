// ===== Pretraga (same scope, ranking and grouping as today) =================
// Tasks match on title and notes (completed included); projects on name (archived included).
function searchResults(q) {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const tasks = S.tasks.map((t, k) => ({ t, k, rank: t.title.toLowerCase() === s ? 0 : t.title.toLowerCase().includes(s) ? 1 : (t.notes || '').toLowerCase().includes(s) ? 2 : 9 }))
    .filter(x => x.rank < 9).sort((a, b) => a.rank - b.rank || b.k - a.k).map(x => x.t);
  const projects = S.projects.filter(p => p.name.toLowerCase().includes(s)).sort((a, b) => a.name.localeCompare(b.name));
  return { tasks, projects };
}
function searchHtml(q) {
  const r = searchResults(q);
  if (!r) return '<div class="empty" style="padding-top:30px"><strong>Pretraži zadatke i projekte</strong>Upiši naslov zadatka, belešku ili naziv projekta.</div>';
  if (!r.tasks.length && !r.projects.length) return `<div class="empty" style="padding-top:30px"><strong>Nema rezultata za „${esc(q)}“</strong></div>`;
  const taskMeta = t => [placeName(t), t.done ? `Završeno: ${short(t.doneAt)}` : t.plan ? relDay(t.plan) : '', !t.done && t.due ? `Rok: ${short(t.due)}` : ''].filter(Boolean).join(' · ') || 'Zadatak';
  return (r.tasks.length ? `<div class="section">Zadaci <span>· ${r.tasks.length}</span></div><div class="card">${r.tasks.map(t => `<button class="trow" data-act="openTask" data-id="${t.id}"><span class="${t.done ? 'round on' : 'round'}">${t.done ? IC.tick : ''}</span><span class="main"><div class="ttl">${esc(t.title)}</div><div class="meta">${esc(taskMeta(t))}</div></span></button>`).join('')}</div>` : '')
    + (r.projects.length ? `<div class="section">Projekti <span>· ${r.projects.length}</span></div><div class="card">${r.projects.map(p => `<button class="prj" data-act="searchProject" data-id="${p.id}"><span class="dot" style="background:${p.color}"></span><span class="main"><div class="ttl">${esc(p.name)}</div><div class="meta">Projekat${p.archived ? ' · arhiviran' : ''}</div></span>${IC.chev}</button>`).join('')}</div>` : '');
}
A.search = () => { openWin({ kind: 'search', q: '' }); setTimeout(() => $('srInput')?.focus(), 0); };
WIN.search = w => ({ tall: true, head: winHead('Pretraga'), body: `<label class="search">${IC.search}<input id="srInput" placeholder="Pretraži zadatke i projekte…" value="${esc(w.q)}" data-in="srQ" aria-label="Pretraga"></label><div id="srResults">${searchHtml(w.q)}</div>` });
IN.srQ = el => { W.q = el.value; $('srResults').innerHTML = searchHtml(W.q); };
A.searchProject = el => { closeWin(); R.tab = 'tasks'; R.stack = [{ type: 'project', id: el.dataset.id }]; render(); };

// ===== Fokus (T2a: started from the task menu) ==============================
// A count-up timer like today's; "Sledeći" walks the overdue and Today tasks.
let focusTimer = null;
const focusQueue = () => liveTasks().filter(t => (t.due && t.due < TODAY) || t.plan === TODAY).sort(byTime);
function openFocus(id) { clearInterval(focusTimer); openWin({ kind: 'focus', id, elapsed: 0, running: true }); focusTimer = setInterval(() => { if (W?.kind !== 'focus') return clearInterval(focusTimer); if (W.running) { W.elapsed++; const el = $('fxTime'); if (el) el.textContent = mmss(W.elapsed); } }, 1000); }
const mmss = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
WIN.focus = w => {
  const t = task(w.id);
  const meta = [placeName(t), t.due ? (t.due < TODAY ? `Kasni · ${short(t.due)}` : `Rok: ${short(t.due)}`) : '', t.plan ? `Planirano: ${relDay(t.plan)}` : '', t.priority !== 'none' ? `Prioritet: ${PRI_NAME[t.priority]}` : ''].filter(Boolean);
  return {
    tall: true, head: winHead('Fokus'),
    body: `<div class="bigtitle" style="padding-bottom:4px">${esc(t.title)}</div><div class="meta" style="margin:0 2px 18px">${esc(meta.join(' · '))}</div>
      <div style="display:grid;justify-items:center;gap:6px;margin:6px 0 18px"><div style="width:180px;height:180px;border-radius:50%;border:6px solid ${w.running ? 'var(--green)' : '#2C3139'};display:grid;place-items:center;align-content:center"><span class="meta" style="margin:0">Proteklo</span><strong id="fxTime" style="font-size:40px;font-variant-numeric:tabular-nums">${mmss(w.elapsed)}</strong></div>
        <div style="display:flex;gap:10px;margin-top:8px"><button class="secondary" style="width:140px" data-act="fxPause">${w.running ? 'Pauziraj' : 'Nastavi'}</button><button class="ghost" data-act="fxReset">Resetuj</button></div></div>
      ${t.subtasks.length ? `<div class="glabel">Podzadaci · ${t.subtasks.filter(s => s.d).length}/${t.subtasks.length}</div><div class="card">${t.subtasks.map((s, k) => `<button class="prow" data-act="fxSub" data-k="${k}"><span class="box ${s.d ? 'on' : ''}">${s.d ? IC.tick : ''}</span><span class="grow ${s.d ? 'done-title' : ''}">${esc(s.t)}</span></button>`).join('')}</div>` : ''}
      ${t.notes ? `<div class="glabel">Beleške</div><p class="note" style="margin-top:0;color:var(--text)">${esc(t.notes)}</p>` : ''}`,
    foot: `<div style="display:flex;gap:8px;margin-bottom:8px"><button class="secondary" style="flex:1" data-act="fxTomorrow">Sutra</button><button class="secondary" style="flex:1" data-act="fxNext">Sledeći</button><button class="secondary" style="flex:1" data-act="fxDetails">Detalji</button></div><button class="primary" data-act="fxDone">Završi zadatak</button>`,
  };
};
A.fxPause = () => { W.running = !W.running; renderWin(); };
A.fxReset = () => { W.elapsed = 0; renderWin(); };
A.fxSub = el => { const s = task(W.id).subtasks[Number(el.dataset.k)]; s.d = !s.d; renderWin(); };
function focusNext(skipId) {
  const q = focusQueue().filter(t => t.id !== skipId);
  if (!q.length) { closeWin(); render(); return toast('Nema više ničega za fokus'); }
  W.id = q[0].id; W.elapsed = 0; W.running = true; render();
}
A.fxNext = () => { const q = focusQueue(), k = q.findIndex(t => t.id === W.id); const next = q[(k + 1) % q.length]; if (!next || next.id === W.id) return toast('Nema sledećeg zadatka'); W.id = next.id; W.elapsed = 0; render(); };
A.fxTomorrow = () => { const t = task(W.id); t.plan = addDays(TODAY, 1); toast('Premešteno za sutra'); focusNext(t.id); };
A.fxDone = () => { const t = task(W.id); completeTask(t); toast('Zadatak je završen'); focusNext(t.id); };
A.fxDetails = () => { clearInterval(focusTimer); W = { kind: 'task', id: W.id }; renderWin(); };

// ===== Detalji navike =======================================================
const HABIT_STATS = { h1: [3, 14, 120], h2: [1, 9, 64], h3: [2, 6, 38], h4: [8, 15, 92], h5: [20, 21, 140], h6: [1, 7, 51] };
const habitState = (h, day) => {
  const k = daysTo(day) + TI;
  if (k >= 0 && k < 7) return h.week[k];
  if (day > TODAY) return 'f';
  const n = Number(day.slice(8)) + S.habits.indexOf(h);
  return h.weekly && n % 2 ? 'n' : n % 5 === 0 ? 'm' : n % 11 === 0 ? 's' : 'd';
};
A.habitDetail = () => { const id = P.id; closePick(); openWin({ kind: 'habit', id }); };
WIN.habit = w => {
  const h = habit(w.id), [streak0, best, total] = HABIT_STATS[h.id] || [0, 0, 0];
  const streak = (h.streak ?? streak0) + (h.week[TI] === 'd' ? 1 : 0);
  const weekDone = h.week.filter(s => s === 'd').length, weekPlan = h.weekly || h.week.filter(s => !['n', 's', 'f'].includes(s)).length;
  const days = Array.from({ length: 31 }, (_, k) => `2026-10-${String(k + 1).padStart(2, '0')}`);
  const color = { d: 'background:var(--green);color:#0F1114', m: 'border:2px solid #5A3A3C', s: 'border:2px dashed #5B6270', o: 'border:2px solid #4A505A', f: 'border:2px solid #23272E;color:#5B6270', n: 'color:#3A3F48' };
  const todayState = { d: 'Urađeno', o: 'Čeka', s: 'Preskočeno', m: 'Propušteno', n: 'Nije u planu' }[h.week[TI]];
  const missedRecently = h.week.slice(0, TI).includes('m');
  const tile = (v, l) => `<div style="background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px"><strong style="font-size:20px">${v}</strong><div class="meta">${l}</div></div>`;
  return {
    tall: true, head: winHead('Navika', `<button class="x" data-act="habitMore" aria-label="Radnje za naviku">${IC.dots}</button>`),
    body: `<div class="bigtitle" style="padding-bottom:4px">${esc(h.name)}</div><div class="meta" style="margin:0 2px 12px">${esc(h.freq)} · ${ROUTINES[h.routine][0]} · Aktivna</div>
      <div class="pcard" style="display:flex;align-items:center;gap:12px">${habitRow(h, TI).replace('class="hrow', 'style="flex:1;padding:0" class="hrow')}</div>
      <div class="split" style="margin:6px 2px 0"><span class="meta" style="margin:0">Danas: ${todayState}</span>${h.week[TI] !== 'd' ? `<button class="ghost" style="padding:6px 2px" data-act="habitSkipToday">${h.week[TI] === 's' ? 'Poništi preskakanje' : 'Preskoči danas'}</button>` : ''}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">${tile(`${streak} ${streak === 1 ? 'dan' : 'dana'}`, 'Trenutni niz')}${tile(`${best} dana`, 'Najduži niz')}${tile(total, 'Ukupno unosa')}${tile(`${weekPlan ? Math.round(weekDone / weekPlan * 100) : 0}%`, 'Ostvareno ove nedelje')}</div>
      <div class="glabel">Oktobar 2026</div><div class="cal"><div class="grid7">${WD.map(d => `<div class="wd">${d}</div>`).join('')}${'<div></div>'.repeat(mondayIndex(days[0]))}${days.map(d => { const st = habitState(h, d); return `<button class="day" data-act="habitHist" data-d="${d}" ${st === 'f' || st === 'n' ? 'disabled' : ''} aria-label="${short(d)}"><span style="width:30px;height:30px;font-size:12px;${color[st]}">${Number(d.slice(8))}</span></button>`; }).join('')}</div></div>
      <p class="note" style="margin-top:-4px">Dodir na prošli dan menja istoriju (urađeno / propušteno).</p>
      <div class="glabel">Uvid</div><div class="pcard" style="font-size:14px;display:grid;gap:6px"><span>Ova nedelja: <b>${weekDone} od ${weekPlan}</b></span>${h.tracking === 'numeric' ? `<span>Cilj perioda: <b>${num(h.vals[TI] || 0)} / ${num(h.target)} ${h.unit}</b> · minimum ${num(h.target * 0.75)} · ideal ${num(h.target)}</span>` : ''}<span class="meta" style="margin:0">${missedRecently ? 'Nastavi posle propuštenog dana · u okviru tolerancije od 1 dana.' : 'Nema nedavno propuštenog perioda.'}</span></div>
      <div class="glabel">Podešavanja</div><div class="card">
        ${prow('soon', IC.routine, 'Rutina', ROUTINES[h.routine][0], '', 'data-msg="Jutro / Dan / Veče"')}
        ${prow('soon', IC.track, 'Praćenje', h.tracking === 'numeric' ? `Brojevno · ${num(h.target)} ${h.unit}` : 'Kvadratić', '', 'data-msg="Praćenje se ne menja kad postoji istorija"')}
        ${h.tracking === 'numeric' ? prow('soon', IC.bolt, 'Brze vrednosti', h.quick.map(v => `+${num(v)}`).join('  '), '', 'data-msg="Isti prozor kao u novoj navici"') : ''}
        ${prow('soon', IC.repeat, 'Učestalost', h.freq, '', 'data-msg="Isti prozor kao u novoj navici"')}
        ${prow('soon', IC.bell, 'Podsetnici', h.id === 'h2' ? '07:30' : '', 'Nisu podešeni', 'data-msg="Isključeni podsetnici ostaju sačuvani"')}
        ${prow('soon', IC.goal, 'Minimalna i idealna', '', 'Kao cilj', 'data-msg="Isti prozor kao u novoj navici"')}
        ${prow('soon', IC.shield, 'Dani tolerancije', '1 dan', '', 'data-msg="Tolerancija opisuje oporavak; nizovi ostaju isti"')}
        ${prow('soon', IC.repeat, 'Nastavak', 'Ponavljaj automatski', '', 'data-msg="Automatski / Pitaj za svaki period / Samo jedan period"')}
        ${prow('soon', IC.short.replace('width="16" height="16"', 'width="20" height="20"'), 'Kraj', 'Nikad', '', 'data-msg="Nikad / Na datum / Posle uspešnih perioda"')}
        ${prow('soon', IC.goal, 'Povezani ciljevi', h.id === 'h6' || h.id === 'h3' ? 'Polumaraton u aprilu' : '', 'Nijedan', 'data-msg="Višestruki izbor, kao oznake"')}</div>`,
    foot: '<button class="primary quiet" data-act="habitPause">Pauziraj naviku</button>',
  };
};
A.habitSkipToday = () => { const h = habit(W.id); h.week[TI] = h.week[TI] === 's' ? 'o' : 's'; render(); };
A.habitHist = el => {
  const h = habit(W.id), d = el.dataset.d, k = daysTo(d) + TI;
  if (k < 0 || k > TI) return toast('U prototipu se menjaju dani ove nedelje');
  if (h.tracking === 'numeric') return openPick({ kind: 'value', id: h.id, i: k, total: h.vals[k] || 0 });
  h.week[k] = h.week[k] === 'd' ? (k === TI ? 'o' : 'm') : 'd'; render();
};
A.habitMore = () => { const h = habit(W.id); openPick({ kind: 'choice', title: h.name, current: null, options: [{ v: 'tpl', label: 'Sačuvaj kao šablon' }, { v: 'snooze', label: 'Odloži podsetnik', sub: '15 min, 1 sat ili za večeras' }, { v: 'arch', label: 'Arhiviraj naviku' }, { v: 'del', label: 'Obriši naviku', sub: 'Uklanjaju se unosi, istorija i podsetnici. Ciljevi ostaju.' }], onPick: v => toast(v === 'del' ? 'Traži potvrdu, pa nudi Poništi' : v === 'arch' ? 'Navika je arhivirana (u prototipu bez promene)' : 'Isti mali prozor kao ostali') }); };
A.habitPause = () => {
  const h = habit(W.id), k = S.habits.indexOf(h);
  S.habits.splice(k, 1); S.pausedHabits.unshift({ name: h.name, when: `Pauzirana od ${short(TODAY)}` });
  closeWin(); render(); toast('Navika je pauzirana', () => { S.habits.splice(k, 0, h); S.pausedHabits.shift(); });
};

// ===== "+" on the smaller screens adds what they list ======================
const fabMain = A.fab;
A.fab = () => {
  const top = R.stack.at(-1), t = top?.type;
  if (t === 'areas') return A.newArea();
  if (t === 'area') return openQuick({ date: null, project: 'none', area: top.id });
  if (t === 'notes' || t === 'resources') return openLibItem(t === 'notes' ? 'note' : 'resource');
  if (t === 'cleaning') return A.newChore();
  if (t === 'tags' || t === 'tag') return A.newTag();
  if (t === 'templates') return A.tplNew();
  if (t === 'views' || t === 'view') return A.viewNew();
  return fabMain();
};
