// ===== Još (M4) =============================================================
function navRow(act, icon, label, { sub = '', val = '', valClass = '', cls = '', data = '' } = {}) {
  return `<button class="prow ${cls}" data-act="${act}" ${data}><span class="ico">${icon}</span><span class="grow">${label}${sub ? `<span class="sub">${sub}</span>` : ''}</span>${val ? `<span class="val ${valClass}" style="flex:none">${val}</span>` : ''}${IC.chev}</button>`;
}
const sub = (type, extra = '') => `data-sub="${type}" ${extra}`;
TAB.more = () => {
  const pinnedAreas = activeAreas().filter(a => a.pinned), pinnedViews = S.views.filter(v => v.pinned);
  const pinned = [...pinnedAreas.map(a => navRow('go', `<span class="dot" style="background:${a.color};border-radius:4px"></span>`, esc(a.name), { sub: 'Oblast', data: sub('area', `data-id="${a.id}"`) })), ...pinnedViews.map(v => navRow('go', IC.funnel, esc(v.name), { sub: 'Sačuvani prikaz', data: sub('view', `data-id="${v.id}"`) }))];
  const last = S.reviews[0];
  return `<div class="status"><span>09:41</span><span>•••</span></div><h1 class="h1">Još</h1>
  ${pinned.length ? `<div class="glabel">Zakačeno</div><div class="card">${pinned.join('')}</div>` : ''}
  <div class="glabel">Planiranje</div><div class="card">
    ${navRow('openGoals', IC.goal, 'Ciljevi', { val: String(S.goals.filter(g => g.status === 'active').length) })}
    ${navRow('go', IC.area, 'Oblasti', { val: String(activeAreas().length), data: sub('areas') })}
    ${navRow('go', IC.repeat, 'Redovne obaveze', { val: String(recurringSections().flatMap(x => x.list).filter(t => !t.done).length), data: sub('cleaning') })}
    ${navRow('go', IC.review, 'Nedeljni pregled', { val: reviewDone() ? 'Završen' : last ? `Poslednji ${short(last.completedAt)}` : '', data: sub('review') })}</div>
  <div class="glabel">Biblioteka</div><div class="card">
    ${navRow('go', IC.note, 'Beleške', { val: String(S.library.filter(x => x.kind === 'note').length), data: sub('notes') })}
    ${navRow('go', IC.book, 'Dnevnik', { val: String(S.journal.length), data: sub('journal') })}
    ${navRow('go', IC.link, 'Resursi', { val: String(S.library.filter(x => x.kind === 'resource').length), data: sub('resources') })}
    ${navRow('go', IC.tag, 'Oznake', { val: String(S.tags.length), data: sub('tags') })}
    ${navRow('go', IC.copy, 'Šabloni', { val: String(S.templates.length), data: sub('templates') })}
    ${navRow('go', IC.funnel, 'Sačuvani prikazi', { val: String(S.views.length), data: sub('views') })}</div>
  <div class="glabel">Arhiva</div><div class="card">
    ${navRow('go', IC.checkc, 'Završeni zadaci', { val: String(S.tasks.filter(t => t.done).length), data: sub('completed') })}
    ${navRow('go', IC.archive, 'Arhivirani projekti', { val: String(S.projects.filter(p => p.archived).length), data: sub('archived') })}</div>
  <div class="card" style="margin-top:18px">${navRow('openSettings', IC.gear, 'Podešavanja', { sub: S.settings.sync ? 'Sinhronizovano pre 2 min' : 'Podaci su samo na ovom uređaju' })}</div>`;
};
A.go = el => push({ type: el.dataset.sub, ...(el.dataset.id ? { id: el.dataset.id } : {}) });
A.openGoals = () => push({ type: 'goals' });
A.openSettings = () => push({ type: 'settings' });

// ===== Ciljevi (GO1–GO7) ====================================================
const HORIZONS = [['short', 'Kratkoročno'], ['mid', 'Srednjoročno'], ['long', 'Dugoročno']];
const SOURCE_LONG = { manual: 'Ručno', tasks: 'Povezani zadaci', habits: 'Povezane navike' };
function progress(g) {
  if (g.source === 'tasks') {
    const all = projectTasks(g.project), done = all.filter(t => t.done).length;
    return { pct: all.length ? Math.round(done / all.length * 100) : 0, label: `${done} od ${all.length} zadataka` };
  }
  if (g.source === 'habits') return { pct: Math.round(g.habits.reduce((s, h) => s + Math.min(100, h.pct), 0) / g.habits.length), label: `${g.habits.length} ${plural(g.habits.length, 'navika', 'navike', 'navika')}` };
  const pct = Math.min(100, Math.round(g.current / g.target * 100));
  return { pct, label: g.type === 'number' ? `${money(g.current)} od ${money(g.target)} ${g.unit}`.trim() : 'Ručno' };
}
// Overdue when the date has passed; at risk within seven days and below 75%.
function health(g) {
  const { pct } = progress(g);
  if (pct >= 100) return 'complete';
  if (g.date && g.date < TODAY) return 'overdue';
  if (g.date && daysTo(g.date) <= 7 && pct < 75) return 'risk';
  return 'ok';
}
const TONE = { ok: 'var(--green)', complete: 'var(--green)', risk: 'var(--amber)', overdue: 'var(--red)' };
const HEALTH_TEXT = { ok: ['Na dobrom putu', 'Napredak i ciljni datum su na dobrom putu.'], risk: ['U riziku', 'Ciljni datum je u narednih sedam dana, a napredak je ispod 75%.'], overdue: ['Kasni', 'Ciljni datum je prošao.'], complete: ['Dostignuto', 'Ciljna vrednost je dostignuta. Označi cilj kao ostvaren kad želiš.'] };
function goalDateSide(g) {
  const h = health(g);
  if (!g.date) return '<span>Bez datuma</span>';
  if (h === 'overdue') return `<span class="red">Kasni · ${short(g.date)}</span>`;
  if (h === 'risk') return `<span class="amber">U riziku · ${short(g.date)}</span>`;
  return `<span>${short(g.date)}</span>`;
}
function goalRow(g) {
  const p = progress(g);
  return `<button class="goalrow" data-act="openGoal" data-id="${g.id}"><span class="gtop"><span class="ttl">${esc(g.title)}</span><span class="pct">${p.pct}%</span></span><span class="track"><i style="width:${p.pct}%;background:${TONE[health(g)]}"></i></span><span class="gmeta"><span>${esc(p.label)}</span>${goalDateSide(g)}</span></button>`;
}
SUB.goals = () => {
  const active = S.goals.filter(g => g.status === 'active').sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const risk = active.filter(g => health(g) === 'risk').length, late = active.filter(g => health(g) === 'overdue').length;
  let groups;
  if (S.ui.goalGroup === 'horizon') groups = HORIZONS.map(([k, l]) => ({ icon: IC[k], label: l, items: active.filter(g => g.horizon === k) }));
  else {
    const map = new Map();
    for (const g of active) { const k = g.date ? g.date.slice(0, 7) : 'none'; if (!map.has(k)) map.set(k, []); map.get(k).push(g); }
    groups = [...map].map(([k, items]) => ({ icon: k === 'none' ? '' : IC.month, label: k === 'none' ? 'Bez datuma' : `${cap(MONTHS[Number(k.slice(5)) - 1])} ${k.slice(0, 4)}`, items }));
  }
  const fold = (key, label, list) => `<button class="collapsed" data-act="goalFold" data-k="${key}">${IC.fold(S.ui.goalFold[key])}${label} · ${list.length}</button>${S.ui.goalFold[key] ? `<div class="card" style="margin-top:8px">${list.map(x => `<div class="goalrow"><div class="ttl" style="color:var(--muted)">${esc(x.title)}</div><div class="meta">${x.when}</div></div>`).join('')}</div>` : ''}`;
  return `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}
    <div class="titlebar"><h1 class="h1">Ciljevi</h1><button class="icon-btn" data-act="search" aria-label="Pretraga">${IC.search}</button></div>
    <div class="summary">${active.length} ${plural(active.length, 'aktivan', 'aktivna', 'aktivnih')}${risk ? ` · <span class="amber">${risk} u riziku</span>` : ''}${late ? ` · <span class="red">${late} kasni</span>` : ''}</div>
    <div class="seg" role="tablist"><button role="tab" class="${S.ui.goalGroup === 'horizon' ? 'on' : ''}" data-act="goalGroup" data-v="horizon">Horizont</button><button role="tab" class="${S.ui.goalGroup === 'date' ? 'on' : ''}" data-act="goalGroup" data-v="date">Rok</button></div>
    ${groups.filter(x => x.items.length).map(x => `<div class="section">${x.icon}${x.label} <span>· ${x.items.length}</span></div><div class="card">${x.items.map(goalRow).join('')}</div>`).join('')}
    ${fold('done', 'Ostvareni', S.finishedGoals)}${fold('paused', 'Pauzirani', S.pausedGoals)}`;
};
A.goalGroup = el => { S.ui.goalGroup = el.dataset.v; render(); };
A.goalFold = el => { S.ui.goalFold[el.dataset.k] = !S.ui.goalFold[el.dataset.k]; render(); };

// Goal window (GO5, GO6), built like the task window.
A.openGoal = el => openWin({ kind: 'goal', id: el.dataset.id });
function prow(act, icon, label, value, empty, data = '') {
  return `<button class="prow" data-act="${act}" ${data}>${icon}<span class="lbl">${label}</span><span class="val ${value ? 'set' : ''}">${esc(value || empty)}</span>${IC.chev}</button>`;
}
WIN.goal = w => {
  const g = goal(w.id), p = progress(g), h = health(g), [ht, hx] = HEALTH_TEXT[h];
  const ms = g.milestones;
  let linked = '';
  if (g.source === 'tasks') {
    const open = projectTasks(g.project).filter(t => !t.done);
    linked = `<div class="glabel">Zadaci · ${openCount(open.length)}</div><div class="card">${open.slice(0, 3).map(t => taskRow(t, { meta: 'plan' })).join('')}<button class="addrow" data-act="goalToProject" data-id="${g.project}">Prikaži sve (${open.length})</button></div>`;
  } else if (g.source === 'habits') {
    linked = `<div class="glabel">Doprinos navika</div><div class="card">${g.habits.map(x => `<div class="hbar"><span class="ttl">${esc(x.t)}</span><span class="count">${x.pct}%</span><span class="track"><i style="width:${x.pct}%;background:var(--green)"></i></span><span class="meta" style="grid-column:1/-1;margin:0">${esc(x.label)}</span></div>`).join('')}</div>`;
  }
  const source = SOURCE_LONG[g.source] + (g.source === 'manual' ? (g.type === 'number' ? ` · ${money(g.target)} ${g.unit}` : ' · procenat') : '');
  const done = g.status === 'done';
  return {
    tall: true, head: winHead('Cilj'),
    body: `<div class="bigtitle" style="padding-bottom:6px">${esc(g.title)}</div><button class="plink" data-act="goalArea">${IC.person}${esc(areaOf(g.area)?.name || 'Bez oblasti')}</button>
      <div class="pcard"><div class="pbig"><strong>${p.pct}%</strong><span>${esc(p.label)}</span></div><span class="track"><i style="width:${p.pct}%;background:${TONE[h]}"></i></span>
        <div class="health"><span class="hdot" style="background:${TONE[h]}"></span><span><b style="color:${TONE[h]}">${ht}</b> · ${hx}</span></div>
        ${g.source === 'manual' ? '<button class="update" data-act="goalUpdate">Ažuriraj napredak</button>' : `<p class="note" style="margin:10px 0 0">${g.source === 'tasks' ? 'Napredak se računa iz zadataka projekta.' : 'Svaka povezana navika ima jednaku težinu; njen doprinos je ograničen na 100%.'}</p>`}</div>
      <div class="glabel">Etape · ${ms.filter(m => m.d).length}/${ms.length}</div>
      <div class="card">${ms.map((m, k) => `<button class="prow" data-act="msToggle" data-k="${k}"><span class="round ${m.d ? 'on' : ''}">${m.d ? IC.tick : ''}</span><span class="grow ${m.d ? 'done-title' : ''}">${esc(m.t)}</span><span class="side">${m.d ? short(m.date) : dueLabel(m.date).replace('Rok ', '')}</span></button>`).join('')}<button class="prow add" data-act="msAdd">＋ Dodaj etapu</button></div>
      ${linked}
      <div class="glabel">Planiranje</div><div class="card">
        ${prow('goalDate', IC.cal, 'Ciljni datum', g.date ? short(g.date) : '', 'Bez ciljnog datuma')}
        ${prow('goalHorizon', IC.long.replace('width="16" height="16"', 'width="20" height="20"'), 'Horizont', HORIZONS.find(x => x[0] === g.horizon)[1])}
        ${prow('soon', IC.habit, 'Izvor napretka', source, '', 'data-msg="Izvor napretka: Ručno / Zadaci / Navike, kao u novom cilju"')}
        ${prow('soon', IC.bell, 'Podsetnik', g.reminder, 'Nije podešen', 'data-msg="Podsetnik: isti prozor kao kod zadatka"')}</div>
      <div class="glabel">Organizacija</div><div class="card">
        ${prow('goalArea', IC.person, 'Oblast', areaOf(g.area)?.name, 'Bez oblasti')}
        ${prow('soon', IC.link, 'Povezano', g.source === 'tasks' ? `Projekat ${project(g.project).name}` : g.source === 'habits' ? `${g.habits.length} navike` : '', 'Ništa', 'data-msg="Povezani projekti, zadaci i navike"')}</div>
      <button class="more" data-act="soon" data-msg="Istorija, pauza i arhiva">Više opcija <span style="display:inline-flex;gap:4px;align-items:center">Istorija, pauza, arhiva${IC.chev}</span></button>`,
    foot: `<button class="primary ${h === 'complete' || done ? '' : 'quiet'}" data-act="goalComplete">${done ? 'Vrati kao aktivan' : 'Označi kao ostvaren'}</button>`,
  };
};
A.msToggle = el => { const m = goal(W.id).milestones[Number(el.dataset.k)]; m.d = !m.d; render(); toast(m.d ? 'Etapa je završena' : 'Etapa je vraćena'); };
A.msAdd = () => { const g = goal(W.id); g.milestones.push({ t: `Nova etapa ${g.milestones.length + 1}`, d: false, date: addDays(g.date || TODAY, 0) }); render(); };
A.goalToProject = el => { closeWin(); R.tab = 'tasks'; R.stack = [{ type: 'project', id: el.dataset.id }]; render(); };
A.goalArea = () => { const g = goal(W.id); openPick({ kind: 'choice', title: 'Oblast', sub: g.title, current: g.area, options: activeAreas().map(a => ({ v: a.id, label: a.name, dot: a.color })), onPick: v => { g.area = v; render(); toast('Sačuvano'); } }); };
A.goalHorizon = () => { const g = goal(W.id); openPick({ kind: 'choice', title: 'Horizont', sub: g.title, current: g.horizon, options: HORIZONS.map(([v, l]) => ({ v, label: l, icon: IC[v] })), onPick: v => { g.horizon = v; render(); toast('Sačuvano'); } }); };
A.goalDate = () => { const g = goal(W.id); openPick({ kind: 'goalDate', target: g, value: g.date }); };
A.goalComplete = () => {
  const g = goal(W.id);
  if (g.status === 'done') { g.status = 'active'; S.finishedGoals = S.finishedGoals.filter(x => x.id !== g.id); render(); return toast('Cilj je ponovo aktivan'); }
  g.status = 'done'; S.finishedGoals.unshift({ id: g.id, title: g.title, when: `Ostvaren ${short(TODAY)}` });
  closeWin(); render(); toast('Cilj je ostvaren');
};
A.goalUpdate = () => { const g = goal(W.id); openPick({ kind: 'goalUpdate', id: g.id, value: g.current }); };
PICK.goalUpdate = p => {
  const g = goal(p.id), isNum = g.type === 'number';
  const steps = isNum ? [1, 5, 10].map(v => v * Math.max(1, Math.round(g.target / 40))) : [5, 10, 25];
  return { title: 'Ažuriraj napredak', sub: g.title, body: `
    <div class="chips">${steps.map(v => `<button class="chip" data-act="guAdd" data-v="${v}">+${money(v)}${isNum ? ` ${g.unit}` : '%'}</button>`).join('')}</div>
    <label class="field"><span class="lbl">${isNum ? 'Trenutno' : 'Procenat napretka'}</span><input type="number" min="0" step="any" value="${p.value}" data-in="guVal"><span class="meta" style="margin:0">${isNum ? `od ${money(g.target)} ${g.unit}` : '%'}</span></label>
    <p class="note" style="margin-top:0">Svaka promena se čuva u istoriji cilja.</p><button class="primary" data-act="guApply">Primeni</button>` };
};
A.guAdd = el => { const g = goal(P.id); P.value = Math.min(g.target, Number(P.value) + Number(el.dataset.v)); renderPick(); };
IN.guVal = el => { P.value = Math.max(0, Number(el.value) || 0); };
A.guApply = () => { const g = goal(P.id); g.current = Math.min(g.target, Number(P.value) || 0); closePick(); render(); toast('Napredak je ažuriran'); };
PICK.goalDate = p => {
  const quick = [['Za mesec dana', addDays(TODAY, 30)], ['Za 3 meseca', addDays(TODAY, 91)], ['Kraj godine', '2026-12-31']];
  return { title: 'Ciljni datum', sub: p.target.title, body: `
    <div class="chips">${quick.map(([l, v]) => `<button class="chip ${p.value === v ? 'on' : ''}" data-act="gdQuick" data-v="${v}">${l}</button>`).join('')}</div>
    <label class="field">${IC.cal}<span class="lbl">Datum</span><input type="date" value="${p.value || ''}" data-ch="gdVal"></label>
    <p class="note" style="margin-top:0">Sedam dana pre ciljnog datuma, cilj ispod 75% dobija oznaku „U riziku“.</p>
    <div class="split"><button class="ghost" data-act="gdClear">Bez datuma</button><button class="primary" data-act="gdApply">Primeni</button></div>` };
};
A.gdQuick = el => { P.value = el.dataset.v; renderPick(); };
CH.gdVal = el => { P.value = el.value || null; };
A.gdClear = () => { P.target.date = null; closePick(); render(); };
A.gdApply = () => { P.target.date = P.value; closePick(); render(); toast('Sačuvano'); };

// New goal window (GO7).
const freshGoal = () => ({ kind: 'newGoal', title: '', area: null, horizon: 'short', source: 'manual', type: 'percent', target: 21, unit: 'km', date: null, more: false, milestones: [], err: '' });
function seg(key, options, value) { return `<div class="seg" role="radiogroup">${options.map(([v, l]) => `<button role="radio" aria-checked="${v === value}" class="${v === value ? 'on' : ''}" data-act="wSeg" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`; }
A.wSeg = el => { W[el.dataset.k] = el.dataset.v; renderWin(); };
WIN.newGoal = d => {
  const extra = d.source === 'manual'
    ? `<div style="margin-top:10px">${seg('type', [['percent', 'Procenat'], ['number', 'Broj']], d.type)}</div>${d.type === 'number' ? `<div class="inline">Cilj<input type="number" min="0" step="any" value="${d.target}" data-in="ngTarget" aria-label="Ciljna vrednost"><input class="unit" value="${esc(d.unit)}" data-in="ngUnit" placeholder="jedinica" aria-label="Jedinica"></div>` : '<p class="note" style="margin:8px 2px 0">Napredak upisuješ ručno, od 0 do 100%.</p>'}`
    : `<p class="note" style="margin:10px 2px 0">${d.source === 'tasks' ? 'Napredak = završeni zadaci povezanih projekata. Povezuješ ih u „Više“.' : 'Napredak = doprinos povezanih navika. Navike povezuješ u „Više“.'}</p>`;
  return {
    tall: true, head: winHead('Novi cilj'),
    body: `<input class="bigtitle" placeholder="Šta želiš da postigneš?" value="${esc(d.title)}" data-in="ngTitle" aria-label="Naziv cilja">${d.err ? `<p class="err">${d.err}</p>` : ''}
      <div class="card" style="margin-top:8px">
        ${prow('ngArea', IC.person, 'Oblast', areaOf(d.area)?.name, 'Bez oblasti (opciono)')}
        <div class="block"><div class="lbl">${IC.long.replace('width="16" height="16"', 'width="20" height="20"')}Horizont</div>${seg('horizon', HORIZONS, d.horizon)}</div>
        <div class="block"><div class="lbl">${IC.habit}Napredak</div>${seg('source', [['manual', 'Ručno'], ['tasks', 'Zadaci'], ['habits', 'Navike']], d.source)}${extra}</div>
        ${prow('ngDate', IC.cal, 'Ciljni datum', d.date ? short(d.date) : '', 'Nije podešen')}</div>
      <button class="more" data-act="ngMore"><b>Više</b><span style="display:inline-flex;gap:4px;align-items:center">${d.more ? 'Sakrij' : 'Etape, podsetnik, veze'}${IC.fold(d.more)}</span></button>
      ${d.more ? `<div class="card" style="margin-top:8px">${d.milestones.map((m, k) => `<div class="prow"><span class="round"></span><span class="grow">${esc(m)}</span><button class="x" data-act="ngRmMs" data-k="${k}" aria-label="Ukloni etapu">✕</button></div>`).join('')}<button class="prow add" data-act="ngAddMs">＋ Dodaj etapu</button></div>
        <div class="card" style="margin-top:10px">${prow('soon', IC.bell, 'Podsetnik', '', 'Nije podešen', 'data-msg="Podsetnik: isti prozor kao kod zadatka"')}${prow('soon', IC.link, d.source === 'habits' ? 'Povezane navike' : 'Povezani projekti i zadaci', '', 'Ništa', 'data-msg="Višestruki izbor, kao oznake"')}</div>` : ''}`,
    foot: '<button class="primary" data-act="ngCreate">Napravi cilj</button>',
  };
};
IN.ngTitle = el => { W.title = el.value; };
IN.ngTarget = el => { W.target = Number(el.value); };
IN.ngUnit = el => { W.unit = el.value; };
A.ngMore = () => { W.more = !W.more; renderWin(); };
A.ngAddMs = () => { W.milestones.push(`Etapa ${W.milestones.length + 1}`); renderWin(); };
A.ngRmMs = el => { W.milestones.splice(Number(el.dataset.k), 1); renderWin(); };
A.ngArea = () => openPick({ kind: 'choice', title: 'Oblast', sub: W.title || 'Novi cilj', current: W.area, options: activeAreas().map(a => ({ v: a.id, label: a.name, dot: a.color })), onPick: v => { W.area = v; renderWin(); } });
A.ngDate = () => openPick({ kind: 'goalDate', target: W, value: W.date });
A.ngCreate = () => {
  const d = W;
  if (!d.title.trim()) { d.err = 'Upiši naziv cilja.'; return renderWin(); }
  if (d.source === 'manual' && d.type === 'number' && !(d.target > 0)) { d.err = 'Brojčani cilj mora biti veći od nule.'; return renderWin(); }
  const g = { id: newId('g'), status: 'active', title: d.title.trim(), area: d.area, horizon: d.horizon, date: d.date, reminder: null, milestones: d.milestones.map((t, k) => ({ t, d: false, date: addDays(d.date || TODAY, k * 7) })) };
  if (d.source === 'manual') Object.assign(g, { source: 'manual', type: d.type, current: 0, target: d.type === 'number' ? d.target : 100, unit: d.type === 'number' ? d.unit : '' });
  else if (d.source === 'tasks') Object.assign(g, { source: 'tasks', project: 'p2' });
  else Object.assign(g, { source: 'habits', habits: [{ t: 'Šetnja', pct: 0, label: '0 uspešnih dana' }] });
  S.goals.push(g); closeWin(); S.ui.goalGroup = 'horizon'; render(); toast('Cilj je napravljen');
};

// ===== Podešavanja (M5, M6) =================================================
const hoursLabel = m => m === 0 ? 'Isključen' : durLabel(m);
SUB.settings = () => {
  const st = S.settings;
  return `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Podešavanja</h1>
  <div class="glabel">Nalog</div><div class="card">${navRow('setSheet', IC.sync, 'Sinhronizacija', { sub: st.sync || 'Za rad na više uređaja', val: st.sync ? 'Uključena' : 'Isključena', valClass: st.sync ? 'green' : '', data: 'data-k="sync"' })}</div>
  <div class="glabel">Opšte</div><div class="card">
    ${navRow('setSheet', IC.cal, 'Prvi dan nedelje', { val: st.weekStart, data: 'data-k="week"' })}
    ${navRow('setSheet', IC.timer, 'Dnevni kapacitet', { val: hoursLabel(st.capacity), data: 'data-k="capacity"' })}
    ${navRow('soon', IC.bell, 'Podsetnici', { val: 'Uključeni', data: 'data-msg="Podsetnici u pregledaču; na telefonu sa aplikacijom"' })}
    ${navRow('jRemind', IC.book, 'Podsetnik za dnevnik', { sub: 'Poruka na Danas uveče', val: st.journalTime || 'Isključen' })}</div>
  <div class="glabel">Podaci</div><div class="card">
    ${navRow('setSheet', IC.upload, 'Rezervna kopija', { sub: `Poslednja ${st.lastBackup}`, data: 'data-k="backup"' })}
    ${navRow('soon', IC.download, 'Vrati iz kopije', { sub: 'Zamenjuje trenutne podatke', data: 'data-msg="Bira ZIP, proverava ga, pa traži potvrdu"' })}
    ${navRow('soon', IC.clock, 'Lokalni snimci', { sub: 'Pet automatskih kopija na uređaju', data: 'data-msg="Lista snimaka sa vraćanjem jedne stavke"' })}
    ${navRow('soon', IC.shield, 'Trajno čuvanje', { val: 'Odobreno', valClass: 'green', data: 'data-msg="Pregledač neće sam obrisati podatke"' })}
    ${navRow('soon', IC.sparkle, 'Popuni primerima', { data: 'data-msg="Dodaje primere koji nedostaju"' })}
    ${navRow('setSheet', IC.trash, 'Resetuj aplikaciju', { cls: 'danger', data: 'data-k="reset"' })}</div>
  <div class="glabel">Pomoć</div><div class="card">
    ${navRow('soon', IC.book, 'Uputstvo', { data: 'data-msg="Otvara uputstvo.html"' })}
    ${navRow('soon', IC.mail, 'Prijavi problem', { data: 'data-msg="Otvara e-poštu sa verzijom i uređajem"' })}
    ${navRow('soon', IC.phoneic, 'Instaliraj aplikaciju', { sub: 'Vidi se dok Dailo nije na početnom ekranu', data: 'data-msg="Uputstvo za Dodaj na početni ekran"' })}
    ${navRow('soon', IC.lock, 'Privatnost', { data: 'data-msg="Gde su podaci i šta se šalje"' })}
    ${navRow('soon', IC.info, 'O aplikaciji', { val: '2.0.0-alpha.1', data: 'data-msg="Verzija i licence"' })}</div>
  <p class="note">Na računaru se ovde vide i „Prečice na tastaturi“ i „Zbijeniji prikaz“.</p>`;
};
A.setSheet = el => openPick({ kind: 'set', k: el.dataset.k });
PICK.set = p => {
  const st = S.settings;
  if (p.k === 'sync') return { title: 'Sinhronizacija', body: st.sync
    ? `<div class="facts"><span>Nalog</span><span>${esc(st.sync)}</span><span>Poslednja</span><span>pre 2 min</span></div><button class="secondary" data-act="setToast" data-msg="Sinhronizovano">Sinhronizuj sada</button><div class="split" style="margin-top:8px"><button class="ghost" data-act="syncOut">Odjavi se</button><button class="ghost" style="color:var(--red)" data-act="setToast" data-msg="Traži upis OBRIŠI, kao sada">Obriši nalog</button></div>`
    : `<p class="note" style="margin:0 4px 12px">Prijavi se e-poštom da bi isti podaci bili na telefonu i računaru. Bez naloga sve ostaje samo na ovom uređaju.</p><label class="field">${IC.mail}<input class="wide" type="email" placeholder="tvoja@adresa.rs" data-in="syncMail" aria-label="E-pošta"></label><button class="primary" data-act="syncIn">Pošalji kod</button>` };
  if (p.k === 'week') return { title: 'Prvi dan nedelje', body: `<div class="card">${['Ponedeljak', 'Nedelja'].map(d => `<button class="opt" data-act="setWeek" data-v="${d}"><span class="lbl">${d}</span><span class="radio ${st.weekStart === d ? 'on' : ''}"></span></button>`).join('')}</div><p class="note">Koristi se u kalendaru, kod navika i u nedeljnom pregledu. Dodir odmah primenjuje izbor.</p>` };
  if (p.k === 'capacity') return { title: 'Dnevni kapacitet', body: `<div class="chips">${[0, 240, 360, 480, 600].map(m => `<button class="chip ${st.capacity === m ? 'on' : ''}" data-act="setCap" data-v="${m}">${hoursLabel(m)}</button>`).join('')}</div><p class="note" style="margin-top:0">Koliko planiranog rada staje u dan. Vidi se u Kalendaru, u prikazu „Raspored“.</p>` };
  if (p.k === 'backup') return { title: 'Rezervna kopija', body: `<div class="facts"><span>Poslednji izvoz</span><span>${st.lastBackup}</span><span>Poslednji uvoz</span><span>nikad</span></div><button class="primary" data-act="setExport">Izvezi ZIP</button><div class="glabel">Podseti me na kopiju</div><div class="chips">${[[3, 'Posle 3 dana'], [7, 'Posle 7 dana'], [14, 'Posle 14 dana'], [0, 'Nikad']].map(([d, l]) => `<button class="chip ${st.backupDays === d ? 'on' : ''}" data-act="setBackupDays" data-v="${d}">${l}</button>`).join('')}</div><p class="note" style="margin-top:0">ZIP sadrži sve podatke, i beleške, resurse i priloge.</p>` };
  return { title: 'Resetuj aplikaciju', body: `<p class="note" style="margin:0 4px 14px">Prvo se pravi sigurnosni ZIP, a zatim se brišu svi zadaci, projekti, oznake, prilozi i podešavanja na ovom uređaju.</p><label class="field"><input class="wide" placeholder="Upiši RESETUJ" data-in="resetWord" aria-label="Potvrda"></label><button class="dangerbtn" data-act="setReset">Resetuj</button>` };
};
let syncMail = '', resetWord = '';
IN.syncMail = el => { syncMail = el.value; };
IN.resetWord = el => { resetWord = el.value; };
A.setToast = el => toast(el.dataset.msg);
A.syncIn = () => { if (!syncMail.includes('@')) return toast('Upiši ispravnu e-poštu'); S.settings.sync = syncMail.trim(); closePick(); render(); toast('Prijava je uspela (u prototipu bez koda)'); };
A.syncOut = () => { S.settings.sync = null; closePick(); render(); toast('Odjava je uspela'); };
A.setWeek = el => { S.settings.weekStart = el.dataset.v; closePick(); render(); toast('Sačuvano'); };
A.setCap = el => { S.settings.capacity = Number(el.dataset.v); closePick(); render(); toast('Sačuvano'); };
A.setExport = () => { S.settings.lastBackup = 'danas'; S.settings.backupNotice = false; closePick(); render(); toast('ZIP je preuzet'); };
A.setBackupDays = el => { S.settings.backupDays = Number(el.dataset.v); renderPick(); toast('Sačuvano'); };
A.setReset = () => { if (resetWord.trim().toUpperCase() !== 'RESETUJ') return toast('Upiši RESETUJ za potvrdu'); closePick(); toast('U prototipu se ništa ne briše'); };
