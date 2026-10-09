// ===== Šabloni ==============================================================
SCREEN_TITLE.templates = 'Šabloni';
const TPL_TYPES = [['task', 'Zadaci', IC.checkc], ['project', 'Projekti', IC.folder], ['habit', 'Navike', IC.habit], ['goal', 'Ciljevi', IC.goal]];
S.templates = [
  { id: 'tp1', type: 'task', name: 'Nedeljni izveštaj', item: 'Pošalji nedeljni izveštaj', detail: 'Plan: petak · rok +2 dana · 3 podzadatka', task: { planDay: 4, dueAfter: 2, subtasks: ['Prikupi brojke', 'Napiši sažetak', 'Pošalji timu'] } },
  { id: 'tp2', type: 'task', name: 'Putni troškovi', item: 'Predaj putne troškove', detail: 'Rok +5 dana · #Administracija', task: { dueAfter: 5, tags: ['Administracija'] } },
  { id: 'tp3', type: 'project', name: 'Novi klijent', item: 'Klijent: uvodni projekat', detail: '5 zadataka · Posao' },
  { id: 'tp4', type: 'habit', name: 'Jutarnja rutina', item: 'Meditacija 10 min', detail: 'Svaki dan · Jutro' },
  { id: 'tp5', type: 'goal', name: 'Čitanje knjiga', item: 'Pročitaj 6 knjiga', detail: 'Brojevno · 3 etape · rok +6 meseci' },
];
SUB.templates = () => `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Šabloni</h1>
  <div class="summary">Stavke za ponovnu upotrebu, sa datumima u odnosu na dan kad ih praviš.</div>
  ${TPL_TYPES.map(([type, label, icon]) => { const list = S.templates.filter(t => t.type === type); return list.length ? `<div class="section">${label} <span>· ${list.length}</span></div><div class="card">${list.map(t => `<button class="prow" data-act="tplOpen" data-id="${t.id}"><span class="ico">${icon}</span><span class="grow">${esc(t.name)}<span class="sub">${esc(t.item)} · ${esc(t.detail)}</span></span>${IC.chev}</button>`).join('')}</div>` : ''; }).join('')}
  <div class="card" style="margin-top:12px"><button class="addrow" data-act="tplNew">＋ Novi šablon</button></div>
  <p class="note">Šablon se pravi i iz menija zadatka, projekta, navike ili cilja: „Sačuvaj kao šablon“.</p>`;
A.tplOpen = el => {
  const t = S.templates.find(x => x.id === el.dataset.id);
  openPick({ kind: 'tpl', id: t.id });
};
PICK.tpl = p => { const t = S.templates.find(x => x.id === p.id); return { title: t.name, sub: `${t.item} · ${t.detail}`, body: `<button class="primary" data-act="tplUse" style="margin-bottom:12px">Upotrebi šablon</button><div class="card"><button class="opt" data-act="soon" data-msg="Izmena: isti prozor kao stavka, datumi su pomeraji u danima">${IC.note}<span class="lbl">Izmeni šablon</span></button><button class="opt" data-act="tplDup">${IC.copy}<span class="lbl">Dupliraj</span></button><button class="opt danger" data-act="tplDel">${IC.trash}<span class="lbl">Obriši šablon<small>Stavke napravljene iz ovog šablona ostaju.</small></span></button></div>` }; };
// Using a template opens the usual new-item window, already filled; the user still saves it.
A.tplUse = () => {
  const t = S.templates.find(x => x.id === P.id); closePick();
  if (t.type === 'task') { openQuick({ date: null, project: 'none' }); W.text = t.item; W.tpl = t.id; renderWin(); }
  else if (t.type === 'habit') { openNewHabit(); W.name = t.item; W.routine = '0'; renderWin(); }
  else if (t.type === 'goal') { openWin({ ...freshGoal(), title: t.item, type: 'number', target: 6, unit: 'knjiga', more: true, milestones: ['2 knjige', '4 knjige', '6 knjiga'] }); }
  else openPick({ kind: 'newProject', name: t.item, color: COLORS[1], area: 'a1' });
};
A.tplDup = () => { const t = S.templates.find(x => x.id === P.id); S.templates.push({ ...t, id: newId('tp'), name: `${t.name} (kopija)` }); closePick(); render(); toast('Šablon je dupliran'); };
A.tplDel = () => { const t = S.templates.find(x => x.id === P.id), k = S.templates.indexOf(t); S.templates.splice(k, 1); closePick(); render(); toast('Šablon je obrisan', () => S.templates.splice(k, 0, t)); };
// Quick Add can start from a task template (S7, decided 2026-10-09): the title, the plan day, the due offset,
// the subtasks and the tags come from it; what the user typed or picked still wins.
const taskTemplates = () => S.templates.filter(t => t.type === 'task');
function tplPlan(w) {
  const x = w.tpl && S.templates.find(t => t.id === w.tpl)?.task;
  return x && x.planDay !== undefined ? addDays(TODAY, (x.planDay - mondayIndex(TODAY) + 7) % 7) : null;
}
function quickTplRow(w) {
  if (!taskTemplates().length) return '';
  const t = w.tpl && S.templates.find(x => x.id === w.tpl);
  return t ? `<div class="chips" style="margin:-2px 0 4px"><button class="chip sm on" data-act="qTpl">${IC.copy}Šablon: ${esc(t.name)}</button><button class="chip sm" data-act="qTplClear" aria-label="Ukloni šablon">✕</button></div><p class="note" style="margin:0 2px 8px">${esc(t.detail)}</p>`
    : `<div class="chips" style="margin:-2px 0 8px"><button class="chip sm" data-act="qTpl">${IC.copy}Iz šablona</button></div>`;
}
A.qTpl = () => openPick({ kind: 'choice', title: 'Šablon zadatka', current: W.tpl, options: taskTemplates().map(t => ({ v: t.id, label: t.name, sub: `${t.item} · ${t.detail}` })), onPick: v => { const old = S.templates.find(x => x.id === W.tpl), t = S.templates.find(x => x.id === v); if (!W.text.trim() || W.text === old?.item) W.text = t.item; W.tpl = v; renderWin(); } });
A.qTplClear = () => { const old = S.templates.find(x => x.id === W.tpl); if (W.text === old?.item) W.text = ''; W.tpl = null; renderWin(); };
function applyTaskTemplate(task, id) {
  const x = S.templates.find(t => t.id === id)?.task;
  if (!x) return;
  if (x.dueAfter) task.due = addDays(task.plan || TODAY, x.dueAfter);
  if (x.subtasks) task.subtasks = x.subtasks.map(t => ({ t, d: false }));
  for (const name of x.tags || []) { const tg = S.tags.find(g => g.name === name); if (tg && !task.tags.includes(tg.id)) task.tags.push(tg.id); }
}
A.tplNew = () => openPick({ kind: 'choice', title: 'Novi šablon', current: null, options: TPL_TYPES.map(([v, , icon]) => ({ v, label: { task: 'Šablon zadatka', project: 'Šablon projekta', habit: 'Šablon navike', goal: 'Šablon cilja' }[v], icon })), onPick: () => toast('Otvara prazan prozor stavke, sa „Sačuvaj šablon“') });

// ===== Sačuvani prikazi =====================================================
SCREEN_TITLE.views = 'Sačuvani prikazi';
SCREEN_TITLE.view = e => S.views.find(v => v.id === e.id)?.name || 'Prikaz';
S.views = [
  { id: 'v1', name: 'Visok prioritet · Posao', type: 'tasks', filters: { area: 'a1', priority: 'high' }, pinned: true },
  { id: 'v2', name: 'Brojevne navike', type: 'habits', filters: { tracking: 'numeric' }, pinned: false },
  { id: 'v3', name: 'Ciljevi u Ličnom', type: 'goals', filters: { area: 'a2' }, pinned: false },
];
const VIEW_TYPES = [['tasks', 'Zadaci'], ['goals', 'Ciljevi'], ['habits', 'Navike']];
const VIEW_FILTERS = {
  tasks: [['area', 'Oblast'], ['project', 'Projekat'], ['tag', 'Oznaka'], ['priority', 'Prioritet'], ['state', 'Završenost']],
  goals: [['area', 'Oblast'], ['status', 'Status']],
  habits: [['area', 'Oblast'], ['tracking', 'Praćenje']],
};
const FILTER_OPTIONS = {
  area: () => S.areas.map(a => ({ v: a.id, label: a.name, dot: a.color })), project: () => S.projects.map(p => ({ v: p.id, label: p.name, dot: p.color })), tag: () => S.tags.map(t => ({ v: t.id, label: t.name, dot: t.color })),
  priority: () => Object.entries(PRI_NAME).map(([v, l]) => ({ v, label: l })), state: () => [{ v: 'open', label: 'Otvoreno' }, { v: 'done', label: 'Završeno' }],
  status: () => [{ v: 'active', label: 'Aktivno' }, { v: 'paused', label: 'Pauzirano' }, { v: 'done', label: 'Završeno' }], tracking: () => [{ v: 'checkbox', label: 'Kvadratić' }, { v: 'numeric', label: 'Brojevno' }],
};
const filterLabel = (k, v) => FILTER_OPTIONS[k]().find(o => o.v === v)?.label || 'Stavka ne postoji';
function viewSummary(v) {
  const parts = VIEW_FILTERS[v.type].filter(([k]) => v.filters[k]).map(([k, l]) => `${l}: ${filterLabel(k, v.filters[k])}`);
  return parts.length ? parts.join(' · ') : { tasks: 'Svi zadaci', goals: 'Svi ciljevi', habits: 'Sve navike' }[v.type];
}
function viewResults(v) {
  const f = v.filters;
  const stateOk = t => f.state === 'done' ? t.done : f.state === 'open' ? !t.done : true;
  if (v.type === 'tasks') return S.tasks.filter(t => !t.inbox && stateOk(t) && (!f.area || taskArea(t)?.id === f.area) && (!f.project || t.project === f.project) && (!f.tag || t.tags.includes(f.tag)) && (!f.priority || t.priority === f.priority));
  if (v.type === 'goals') return S.goals.filter(g => (!f.area || g.area === f.area) && (!f.status || g.status === f.status));
  return S.habits.filter(h => (!f.tracking || h.tracking === f.tracking));
}
SUB.views = () => `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Sačuvani prikazi</h1>
  <div class="summary">Sačuvani filteri za jednu vrstu stavki.</div>
  <div class="card">${S.views.map(v => `<button class="prow" data-act="go" data-sub="view" data-id="${v.id}"><span class="ico">${IC.funnel}</span><span class="grow">${esc(v.name)}<span class="sub">${VIEW_TYPES.find(t => t[0] === v.type)[1]}${v.pinned ? ' · zakačen' : ''} · ${esc(viewSummary(v))}</span></span><span class="val">${viewResults(v).length}</span>${IC.chev}</button>`).join('')}<button class="addrow" data-act="viewNew">＋ Novi sačuvani prikaz</button></div>`;
SUB.view = ({ id }) => {
  const v = S.views.find(x => x.id === id), list = viewResults(v);
  const rows = v.type === 'tasks' ? list.map(t => taskRow(t, { meta: 'plan' })) : v.type === 'goals' ? list.map(goalRow) : list.map(h => habitRow(h, TI, { meta: h.freq }));
  return `<div class="status"><span>09:41</span><span>•••</span></div><div class="titlebar">${backBtn()}<button class="icon-btn" data-act="viewMenu" data-id="${id}" aria-label="Radnje za prikaz">${IC.dots}</button></div>
    <h1 class="h1">${esc(v.name)}</h1><div class="summary">${esc(viewSummary(v))} · ${list.length}</div>
    ${rows.length ? `<div class="card">${rows.join('')}</div>` : '<div class="empty"><strong>Nema odgovarajućih stavki</strong>Za drugačije rezultate promeni filtere ovog prikaza.</div>'}`;
};
A.viewMenu = el => { const v = S.views.find(x => x.id === el.dataset.id); openPick({ kind: 'choice', title: v.name, current: null, options: [{ v: 'edit', label: 'Izmeni prikaz' }, { v: 'dup', label: 'Dupliraj prikaz' }, { v: 'pin', label: v.pinned ? 'Otkači iz „Još“' : 'Zakači u „Još“' }, { v: 'del', label: 'Obriši prikaz', sub: 'Stavke iz prikaza ostaju.' }], onPick: x => {
  if (x === 'edit') return openWin({ kind: 'viewEdit', ...JSON.parse(JSON.stringify(v)) });
  if (x === 'dup') { S.views.push({ ...JSON.parse(JSON.stringify(v)), id: newId('v'), name: `${v.name} (kopija)`, pinned: false }); render(); return toast('Prikaz je dupliran'); }
  if (x === 'pin') { v.pinned = !v.pinned; render(); return toast(v.pinned ? 'Zakačeno u „Još“' : 'Otkačeno'); }
  const k = S.views.indexOf(v); S.views.splice(k, 1); pop(); toast('Sačuvani prikaz je obrisan', () => S.views.splice(k, 0, v));
} }); };
A.viewNew = () => openWin({ kind: 'viewEdit', id: null, name: '', type: 'tasks', filters: {}, pinned: false, err: '' });
WIN.viewEdit = w => ({
  head: winHead(w.id ? 'Izmeni sačuvani prikaz' : 'Novi sačuvani prikaz'),
  body: `<input class="bigtitle" placeholder="Naziv prikaza" value="${esc(w.name)}" data-in="veName" aria-label="Naziv prikaza">${w.err ? `<p class="err">${w.err}</p>` : ''}
    <div class="glabel" style="margin-top:6px">Vrsta stavki</div>${seg('type', VIEW_TYPES, w.type)}
    <div class="glabel">Filteri</div><div class="card">${VIEW_FILTERS[w.type].map(([k, l]) => `<button class="prow" data-act="veFilter" data-k="${k}"><span class="lbl">${l}</span><span class="val ${w.filters[k] ? 'set' : ''}">${w.filters[k] ? esc(filterLabel(k, w.filters[k])) : 'Sve'}</span>${IC.chev}</button>`).join('')}${w.type === 'tasks' ? '<button class="prow" data-act="soon" data-msg="Tačan dan, isti prozor za datum"><span class="lbl">Planirani dan / rok</span><span class="val">Sve</span>' + IC.chev + '</button>' : ''}</div>
    <button class="prow" style="margin-top:10px;padding:0 4px" data-act="vePin"><span class="check ${w.pinned ? 'on' : ''}">${w.pinned ? IC.tickW : ''}</span><span class="grow">Zakači u „Još“</span></button>
    <p class="note">Rezultata sada: ${viewResults(w).length}</p>`,
  foot: '<button class="primary" data-act="veSave">Sačuvaj prikaz</button>',
});
IN.veName = el => { W.name = el.value; };
A.veFilter = el => { const k = el.dataset.k; openPick({ kind: 'choice', title: VIEW_FILTERS[W.type].find(f => f[0] === k)[1], current: W.filters[k] || '', options: [{ v: '', label: 'Sve' }, ...FILTER_OPTIONS[k]()], onPick: v => { if (v) W.filters[k] = v; else delete W.filters[k]; renderWin(); } }); };
A.vePin = () => { W.pinned = !W.pinned; renderWin(); };
// Changing the type drops filters that do not apply to it.
const wSegBase = A.wSeg;
A.wSeg = el => { if (W?.kind === 'viewEdit' && el.dataset.k === 'type') { const keep = VIEW_FILTERS[el.dataset.v].map(f => f[0]); W.filters = Object.fromEntries(Object.entries(W.filters).filter(([k]) => keep.includes(k))); } wSegBase(el); };
A.veSave = () => {
  if (!W.name.trim()) { W.err = 'Unesi naziv prikaza.'; return renderWin(); }
  const data = { id: W.id || newId('v'), name: W.name.trim(), type: W.type, filters: W.filters, pinned: W.pinned };
  const old = S.views.find(v => v.id === W.id);
  if (old) Object.assign(old, data); else S.views.push(data);
  closeWin(); render(); toast('Prikaz je sačuvan');
};

// ===== Završeni zadaci (M6: "Obriši završene" lives here) ===================
SCREEN_TITLE.completed = 'Završeni zadaci';
SUB.completed = () => {
  const f = S.ui.doneFilter || {}, from = f.period ? addDays(TODAY, -f.period) : '0000';
  const list = S.tasks.filter(t => t.done && t.doneAt >= from && (!f.project || t.project === f.project)).sort((a, b) => b.doneAt.localeCompare(a.doneAt));
  const groups = [...new Set(list.map(t => t.doneAt))];
  const pName = f.project ? project(f.project).name : '';
  return `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Završeni zadaci</h1>
    <div class="summary">${list.length} ${plural(list.length, 'zadatak', 'zadatka', 'zadataka')}</div>
    <div class="filters" style="margin-bottom:4px"><button class="chip sm ${f.project ? 'on' : ''}" data-act="doneProject">${esc(pName || 'Svi projekti')} ▾</button>${[[0, 'Sve vreme'], [7, '7 dana'], [30, '30 dana']].map(([d, l]) => `<button class="chip sm ${(f.period || 0) === d ? 'on' : ''}" data-act="donePeriod" data-v="${d}">${l}</button>`).join('')}</div>
    ${groups.map(d => { const rows = list.filter(t => t.doneAt === d); return `<div class="section">${relDay(d)}${['Danas', 'Juče'].includes(relDay(d)) ? ` <span>· ${short(d)}</span>` : ''} <span>· ${rows.length}</span></div><div class="card">${rows.map(t => taskRow(t, { meta: 'today' })).join('')}</div>`; }).join('') || '<div class="empty"><strong>Nijedan završen zadatak ne odgovara ovim filterima</strong>Probaj drugi projekat ili period.</div>'}
    <div class="card" style="margin-top:18px"><button class="prow danger" data-act="doneClear"><span class="ico">${IC.trash}</span><span class="grow">Obriši završene zadatke<span class="sub">Trajno briše sve završene zadatke i njihove priloge.</span></span></button></div>`;
};
A.doneProject = () => openPick({ kind: 'choice', title: 'Projekat', current: S.ui.doneFilter?.project || '', options: [{ v: '', label: 'Svi projekti' }, ...S.projects.map(p => ({ v: p.id, label: p.name + (p.archived ? ' (arhiviran)' : ''), dot: p.color }))], onPick: v => { S.ui.doneFilter = { ...S.ui.doneFilter, project: v || undefined }; render(); } });
A.donePeriod = el => { S.ui.doneFilter = { ...S.ui.doneFilter, period: Number(el.dataset.v) || undefined }; render(); };
A.doneClear = () => openPick({ kind: 'confirmClear' });
PICK.confirmClear = () => { const n = S.tasks.filter(t => t.done).length; return { title: 'Obrisati sve završene zadatke?', body: `<p class="note" style="margin:0 4px 14px">${n} ${plural(n, 'zadatak', 'zadatka', 'zadataka')} i njihovi prilozi biće obrisani. Odmah posle toga možeš da poništiš.</p><button class="dangerbtn" data-act="doneClearYes">Obriši završene</button>` }; };
A.doneClearYes = () => { const removed = S.tasks.filter(t => t.done); S.tasks = S.tasks.filter(t => !t.done); closePick(); render(); toast('Završeni zadaci su obrisani', () => S.tasks.push(...removed)); };

// ===== Arhivirani projekti ==================================================
SCREEN_TITLE.archived = 'Arhivirani projekti';
SUB.archived = () => {
  const list = S.projects.filter(p => p.archived);
  return `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Arhivirani projekti</h1>
    <div class="summary">${list.length} ${plural(list.length, 'arhiviran projekat', 'arhivirana projekta', 'arhiviranih projekata')}</div>
    ${list.length ? `<div class="card">${list.map(p => `<div class="prj"><span class="dot" style="background:${p.color}"></span><button class="main" data-act="openProject" data-id="${p.id}"><div class="ttl">${esc(p.name)}</div><div class="meta">${areaOf(p.area)?.name || ''} · ${openCount(projectTasks(p.id).filter(t => !t.done).length)}</div></button><button class="chip sm" data-act="restoreProject" data-id="${p.id}">Vrati</button></div>`).join('')}</div>` : '<div class="empty"><strong>Nema arhiviranih projekata</strong>Arhivirani projekti ostaju ovde dok ih ne vratiš.</div>'}`;
};
A.restoreProject = el => { const p = project(el.dataset.id); p.archived = false; render(); toast('Projekat je vraćen', () => { p.archived = true; }); };
// The project menu archives and restores for real; the rest stays a note.
A.projectMenu = el => {
  const p = project(el.dataset.id);
  openPick({ kind: 'choice', title: p.name, current: null, options: [{ v: 'edit', label: 'Preimenuj i boja' }, { v: 'area', label: 'Oblast' }, { v: 'goal', label: 'Povezani cilj' }, { v: 'tpl', label: 'Sačuvaj kao šablon' }, { v: 'arch', label: p.archived ? 'Vrati projekat' : 'Arhiviraj projekat' }, { v: 'del', label: 'Obriši projekat' }], onPick: v => {
    if (v === 'arch') { p.archived = !p.archived; if (p.archived) pop(); else render(); return toast(p.archived ? 'Projekat je arhiviran' : 'Projekat je vraćen', () => { p.archived = !p.archived; }); }
    toast(v === 'tpl' ? 'Otvara šablon projekta, popunjen ovim projektom' : 'Isti mali prozor kao ostali');
  } });
};
