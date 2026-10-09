// ===== Smaller screens: data ===============================================
Object.assign(S.areas[0], { icon: 'briefcase', pinned: true });
Object.assign(S.areas[1], { icon: 'house' });
Object.assign(S.areas[2], { icon: 'heart' });
S.areas.push({ id: 'a4', name: 'Volontiranje', color: '#FF8A5B', icon: 'heart', status: 'archived' });
S.projects.push({ id: 'p5', name: 'Stari sajt', area: 'a1', color: '#8B929C', archived: true });
S.tasks.push(T('Prebaci stare tekstove', { project: 'p5' }));
for (const [id, area] of [['h1', 'a3'], ['h2', 'a3'], ['h3', 'a3'], ['h4', 'a2'], ['h5', 'a2'], ['h6', 'a3']]) habit(id).area = area;
S.rooms = [{ id: 'r1', name: 'Dnevna soba' }, { id: 'r2', name: 'Kupatilo' }, { id: 'r3', name: 'Kuhinja' }];
const weekly = { freq: 'weekly', interval: 1, days: [], end: 'never' }, monthly = { freq: 'monthly', interval: 1, days: [], end: 'never' };
S.tasks.push(
  T('Usisaj', { room: 'r1', area: 'a2', plan: '2026-10-10', due: '2026-10-10', repeat: weekly }),
  T('Obriši prašinu', { room: 'r1', area: 'a2', plan: '2026-10-11', due: '2026-10-11', repeat: weekly }),
  T('Očisti kupatilo', { room: 'r2', area: 'a2', plan: '2026-10-09', due: '2026-10-09', repeat: weekly }),
  T('Proveri bojler', { room: 'r2', area: 'a2', plan: '2026-12-01', due: '2026-12-01', repeat: { freq: 'monthly', interval: 3, days: [], end: 'never' } }),
  T('Obriši radne površine', { room: 'r3', area: 'a2', plan: TODAY, due: TODAY, repeat: weekly }),
  T('Očisti frižider', { room: 'r3', area: 'a2', plan: '2026-10-07', due: '2026-10-07', repeat: monthly }),
);
S.library = [
  { id: 'l1', kind: 'note', title: 'Ideje za poklone', body: 'Ana: knjiga o biljkama ili kurs keramike. Marko: slušalice.', area: 'a2', fav: true, links: ['https://www.knjizare-vulkan.rs'], files: 0, tags: [], clip: '', updated: '2026-10-07' },
  { id: 'l2', kind: 'note', title: 'Sastanak sa klijentom 6. okt', body: 'Dogovor: pregled početne do 9. okt, objava 13. okt.', area: 'a1', fav: false, links: ['https://portal.primer.rs/sastanci'], files: 1, tags: ['t1'], clip: 'Klijent želi tamniji meni.', updated: '2026-10-06' },
  { id: 'l3', kind: 'note', title: 'Recept za palačinke', body: '2 jaja, 250 ml mleka, 150 g brašna.', area: 'a2', fav: false, links: ['https://recepti.primer.rs/palacinke'], files: 0, tags: [], clip: '', updated: '2026-09-30' },
  { id: 'l4', kind: 'resource', title: 'Refactoring UI', body: 'Praktični saveti za izgled interfejsa.', type: 'Knjiga', status: 'U čitanju', author: 'Adam Wathan, Steve Schoger', reviewed: '2026-10-05', area: 'a1', fav: true, links: ['https://www.refactoringui.com'], files: 1, tags: ['t2'], clip: '', linked: { tasks: 1, projects: 1, goals: 0, habits: 0 }, updated: '2026-10-05' },
  { id: 'l5', kind: 'resource', title: 'Figma za početnike', body: '', type: 'Kurs', status: 'Nepročitano', author: '', reviewed: null, area: 'a1', fav: false, links: ['https://www.figma.com/resources/learn-design'], files: 0, tags: ['t4'], clip: '', linked: { tasks: 0, projects: 0, goals: 0, habits: 0 }, updated: '2026-09-21' },
  { id: 'l6', kind: 'resource', title: 'Plan treninga za polumaraton', body: '12 nedelja, 4 treninga nedeljno.', type: 'Članak', status: 'Završeno', author: 'Trkački klub', reviewed: '2026-09-15', area: 'a3', fav: false, links: ['https://trcanje.primer.rs/plan-21k'], files: 0, tags: [], clip: '', linked: { tasks: 0, projects: 0, goals: 1, habits: 2 }, updated: '2026-09-15' },
];
S.ui.libFilters = { note: {}, resource: {} };
const AREA_ICON = { briefcase: SV('<rect x="3.5" y="7" width="17" height="12" rx="2"/><path d="M9 7V5h6v2M3.5 12h17"/>'), house: SV('<path d="M4 11l8-6 8 6v8H4z"/><path d="M10 19v-5h4v5"/>'), heart: SV('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>') };
const areaIcon = a => `<span style="color:${a.color};display:grid">${AREA_ICON[a.icon] || IC.area}</span>`;

// ===== Oblasti =============================================================
SCREEN_TITLE.areas = 'Oblasti';
SCREEN_TITLE.area = e => areaOf(e.id).name;
const areaTasks = id => S.tasks.filter(t => !t.done && !t.inbox && (t.project ? project(t.project)?.area === id : t.area === id));
function areaSummary(a) {
  const projects = activeProjects().filter(p => p.area === a.id).length, open = areaTasks(a.id).length;
  const goals = S.goals.filter(g => g.status === 'active' && g.area === a.id).length;
  return [projects && `${projects} ${plural(projects, 'projekat', 'projekta', 'projekata')}`, `${openCount(open)}`, goals && `${goals} ${plural(goals, 'cilj', 'cilja', 'ciljeva')}`].filter(Boolean).join(' · ');
}
SUB.areas = () => {
  const active = activeAreas(), archived = S.areas.filter(a => a.status === 'archived');
  return `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Oblasti</h1>
    <div class="summary">${active.length} ${plural(active.length, 'aktivna oblast', 'aktivne oblasti', 'aktivnih oblasti')}</div>
    <div class="card">${active.map(a => `<button class="prj" data-act="go" data-sub="area" data-id="${a.id}">${areaIcon(a)}<span class="main"><div class="ttl">${esc(a.name)}${a.pinned ? ' <span class="meta" style="display:inline">· zakačena</span>' : ''}</div><div class="meta">${areaSummary(a)}</div></span>${IC.chev}</button>`).join('')}<button class="addrow" data-act="newArea">＋ Nova oblast</button></div>
    <button class="collapsed" data-act="foldArchivedAreas">${IC.fold(S.ui.archAreas)}Arhivirane · ${archived.length}</button>
    ${S.ui.archAreas ? `<div class="card" style="margin-top:8px">${archived.map(a => `<div class="prj">${areaIcon(a)}<span class="main"><div class="ttl" style="color:var(--muted)">${esc(a.name)}</div></span><button class="chip sm" data-act="restoreArea" data-id="${a.id}">Vrati</button></div>`).join('')}</div>` : ''}`;
};
A.foldArchivedAreas = () => { S.ui.archAreas = !S.ui.archAreas; render(); };
A.restoreArea = el => { areaOf(el.dataset.id).status = 'active'; render(); toast('Oblast je vraćena'); };
A.newArea = () => openPick({ kind: 'newArea', name: '', color: COLORS[2], icon: 'heart' });
PICK.newArea = p => ({ title: 'Nova oblast', body: `<label class="field"><input class="wide" placeholder="Naziv oblasti" value="${esc(p.name)}" data-in="naName" aria-label="Naziv oblasti"></label>
  <div class="glabel" style="margin-top:4px">Boja</div><div class="chips">${COLORS.map(c => `<button class="chip ${p.color === c ? 'on' : ''}" data-act="naColor" data-c="${c}" aria-label="Boja"><span class="dot" style="background:${c}"></span></button>`).join('')}</div>
  <div class="glabel" style="margin-top:4px">Ikonica</div><div class="chips">${Object.keys(AREA_ICON).map(k => `<button class="chip ${p.icon === k ? 'on' : ''}" data-act="naIcon" data-k="${k}" aria-label="${k}">${AREA_ICON[k]}</button>`).join('')}</div>
  ${p.err ? `<p class="err">${p.err}</p>` : ''}<button class="primary" data-act="naCreate">Napravi oblast</button>` });
IN.naName = el => { P.name = el.value; };
A.naColor = el => { P.color = el.dataset.c; renderPick(); };
A.naIcon = el => { P.icon = el.dataset.k; renderPick(); };
A.naCreate = () => {
  const name = P.name.trim();
  if (!name) { P.err = 'Oblast mora imati naziv.'; return renderPick(); }
  if (S.areas.some(a => a.name.toLowerCase() === name.toLowerCase())) { P.err = 'Oblast sa ovim nazivom već postoji.'; return renderPick(); }
  S.areas.push({ id: newId('a'), name, color: P.color, icon: P.icon, status: 'active' }); closePick(); render(); toast(`Oblast „${name}“ je napravljena`);
};
// One area: a summary line, then its projects, tasks, goals, habits and library.
SUB.area = ({ id }) => {
  const a = areaOf(id), projects = activeProjects().filter(p => p.area === id), tasks = areaTasks(id).sort(byTime);
  const goals = S.goals.filter(g => g.area === id && g.status === 'active'), lib = S.library.filter(x => x.area === id), habits = S.habits.filter(h => h.area === id);
  const head = (label, n, act) => `<div class="section" style="justify-content:space-between"><span style="color:var(--text);font-weight:600">${label} <span class="meta" style="display:inline;font-weight:500">· ${n}</span></span>${act ? `<button class="icon-btn" style="width:32px;height:32px;color:var(--link)" data-act="${act}" data-id="${id}" aria-label="Dodaj: ${label}">＋</button>` : ''}</div>`;
  const shownTasks = S.ui.areaTasksAll ? tasks : tasks.slice(0, 5);
  return `<div class="status"><span>09:41</span><span>•••</span></div><div class="titlebar">${backBtn()}<button class="icon-btn" data-act="areaMenu" data-id="${id}" aria-label="Radnje za oblast">${IC.dots}</button></div>
    <h1 class="h1" style="display:flex;gap:10px;align-items:center">${areaIcon(a)}${esc(a.name)}</h1>
    <div class="summary">${areaSummary(a)} · ${lib.length} u biblioteci</div>
    ${head('Projekti', projects.length, 'areaNewProject')}${projects.length ? `<div class="card">${projects.map(projectRow).join('')}</div>` : '<p class="note">U ovoj oblasti nema projekata.</p>'}
    ${head('Zadaci', tasks.length, 'areaNewTask')}${tasks.length ? `<div class="card">${shownTasks.map(t => taskRow(t, { meta: 'plan' })).join('')}${tasks.length > 5 ? `<button class="more-btn" data-act="areaTasksAll">${S.ui.areaTasksAll ? 'Prikaži manje' : `Prikaži još ${tasks.length - 5}`}</button>` : ''}</div>` : '<p class="note">U ovoj oblasti nema otvorenih zadataka.</p>'}
    ${head('Ciljevi', goals.length, 'areaNewGoal')}${goals.length ? `<div class="card">${goals.map(goalRow).join('')}</div>` : '<p class="note">U ovoj oblasti nema ciljeva.</p>'}
    ${head('Navike', habits.length, 'areaNewHabit')}${habits.length ? `<div class="card">${habits.map(h => habitRow(h, TI, { meta: h.freq })).join('')}</div>` : '<p class="note">U ovoj oblasti nema navika.</p>'}
    ${head('Beleške i resursi', lib.length, 'areaNewNote')}${lib.length ? `<div class="card">${lib.map(libRow).join('')}</div>` : '<p class="note">U ovoj oblasti nema beleški ni resursa.</p>'}`;
};
A.areaTasksAll = () => { S.ui.areaTasksAll = !S.ui.areaTasksAll; render(); };
A.areaNewProject = el => openPick({ kind: 'newProject', name: '', color: COLORS[0], area: el.dataset.id });
A.areaNewTask = el => openQuick({ date: null, project: 'none', area: el.dataset.id });
A.areaNewGoal = el => openWin({ ...freshGoal(), area: el.dataset.id });
A.areaNewNote = el => openLibItem('note', el.dataset.id);
A.areaNewHabit = el => { openNewHabit(); W.area = el.dataset.id; renderWin(); };
A.areaMenu = el => {
  const a = areaOf(el.dataset.id);
  openPick({ kind: 'choice', title: a.name, current: null, options: [{ v: 'edit', label: 'Izmeni oblast', sub: 'Naziv, boja i ikonica' }, { v: 'pin', label: a.pinned ? 'Otkači iz „Još“' : 'Zakači u „Još“' }, { v: 'arch', label: 'Arhiviraj oblast' }, { v: 'del', label: 'Obriši oblast', sub: 'Povezane stavke ostaju, a uklanja se njihova pripadnost ovoj oblasti.' }], onPick: v => {
    if (v === 'pin') { a.pinned = !a.pinned; render(); toast(a.pinned ? 'Zakačeno u „Još“' : 'Otkačeno'); }
    else if (v === 'arch') { a.status = 'archived'; a.pinned = false; pop(); toast('Oblast je arhivirana', () => { a.status = 'active'; }); }
    else if (v === 'del') toast('Traži potvrdu „Obrisati oblast?“, pa nudi Poništi');
    else toast('Isti mali prozor kao „Nova oblast“');
  } });
};

// ===== Beleške i Resursi ====================================================
SCREEN_TITLE.notes = 'Beleške';
SCREEN_TITLE.resources = 'Resursi';
const RES_TYPES = ['Knjiga', 'Video', 'Članak', 'Kurs', 'Dokument', 'Ostalo'];
const RES_STATUS = ['Nepročitano', 'U čitanju', 'Završeno'];
function libRow(x) {
  const meta = x.kind === 'resource' ? [`${x.type} · ${x.status}`, areaOf(x.area)?.name] : [areaOf(x.area)?.name || 'Bez oblasti', x.links.length && `${x.links.length} ${plural(x.links.length, 'link', 'linka', 'linkova')}`, x.files && `${x.files} ${plural(x.files, 'fajl', 'fajla', 'fajlova')}`];
  const dots = x.tags.map(id => `<span class="dot" style="background:${S.tags.find(t => t.id === id)?.color};width:8px;height:8px"></span>`).join('');
  return `<div class="trow"><span class="tico">${x.kind === 'note' ? IC.note : IC.link}</span><button class="main" data-act="openLib" data-id="${x.id}"><div class="ttl">${esc(x.title)}</div><div class="meta" style="display:flex;gap:6px;align-items:center">${esc(meta.filter(Boolean).join(' · '))}${dots}</div></button><button class="icon-btn" style="width:36px;height:36px;color:${x.fav ? 'var(--amber)' : '#5B6270'}" data-act="libFav" data-id="${x.id}" aria-pressed="${x.fav}" aria-label="${x.fav ? 'Ukloni iz omiljenog' : 'Dodaj u omiljeno'}">${x.fav ? '★' : '☆'}</button></div>`;
}
function libList(kind) {
  const f = S.ui.libFilters[kind];
  return S.library.filter(x => x.kind === kind && (!f.fav || x.fav) && (!f.area || (f.area === 'none' ? !x.area : x.area === f.area)) && (!f.tag || x.tags.includes(f.tag)) && (!f.type || x.type === f.type) && (!f.status || x.status === f.status)).sort((a, b) => b.updated.localeCompare(a.updated));
}
function libScreen(kind) {
  const f = S.ui.libFilters[kind], all = S.library.filter(x => x.kind === kind), list = libList(kind);
  const any = Object.values(f).some(Boolean);
  const chip = (key, label, value) => `<button class="chip sm ${value ? 'on' : ''}" data-act="libFilter" data-kind="${kind}" data-k="${key}">${esc(value || label)} ▾</button>`;
  const areaName = f.area === 'none' ? 'Bez oblasti' : areaOf(f.area)?.name;
  return `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">${kind === 'note' ? 'Beleške' : 'Resursi'}</h1>
    <div class="summary">${any ? `${list.length} od ${all.length}` : all.length} ${kind === 'note' ? plural(all.length, 'beleška', 'beleške', 'beleški') : plural(all.length, 'resurs', 'resursa', 'resursa')}</div>
    <div class="filters" style="margin-bottom:12px"><button class="chip sm ${f.fav ? 'on' : ''}" data-act="libFavFilter" data-kind="${kind}">${f.fav ? '★' : '☆'} Omiljeno</button>${kind === 'resource' ? chip('type', 'Vrsta', f.type) + chip('status', 'Status', f.status) : ''}${chip('area', 'Oblast', areaName)}${chip('tag', 'Oznaka', S.tags.find(t => t.id === f.tag)?.name)}${any ? `<button class="chip sm quiet" data-act="libClear" data-kind="${kind}">Obriši filtere</button>` : ''}</div>
    ${list.length ? `<div class="card">${list.map(libRow).join('')}</div>` : `<div class="empty"><strong>${all.length ? 'Nijedna stavka ne odgovara ovim filterima.' : kind === 'note' ? 'Još nema beleški' : 'Još nema resursa'}</strong>${all.length ? '' : '„+“ dole desno dodaje novu.'}</div>`}`;
}
SUB.notes = () => libScreen('note');
SUB.resources = () => libScreen('resource');
A.libFav = el => { const x = S.library.find(i => i.id === el.dataset.id); x.fav = !x.fav; render(); };
A.libFavFilter = el => { const f = S.ui.libFilters[el.dataset.kind]; f.fav = !f.fav; render(); };
A.libClear = el => { S.ui.libFilters[el.dataset.kind] = {}; render(); };
A.libFilter = el => {
  const kind = el.dataset.kind, k = el.dataset.k, f = S.ui.libFilters[kind];
  const options = k === 'area' ? [{ v: '', label: 'Sve oblasti' }, { v: 'none', label: 'Bez oblasti' }, ...S.areas.map(a => ({ v: a.id, label: a.name, dot: a.color }))]
    : k === 'tag' ? [{ v: '', label: 'Sve oznake' }, ...S.tags.map(t => ({ v: t.id, label: t.name, dot: t.color }))]
    : k === 'type' ? [{ v: '', label: 'Sve vrste' }, ...RES_TYPES.map(v => ({ v, label: v }))] : [{ v: '', label: 'Svi statusi' }, ...RES_STATUS.map(v => ({ v, label: v }))];
  openPick({ kind: 'choice', title: { area: 'Oblast', tag: 'Oznaka', type: 'Vrsta', status: 'Status čitanja' }[k], current: f[k] || '', options, onPick: v => { f[k] = v || undefined; render(); } });
};
// A note or resource opens in a window like the task window; changes save at once.
A.openLib = el => openWin({ kind: 'lib', id: el.dataset.id });
function openLibItem(kind, area = null) {
  const x = { id: newId('l'), kind, title: '', body: '', area, fav: false, links: [], files: 0, tags: [], clip: '', updated: TODAY, isNew: true, ...(kind === 'resource' ? { type: 'Članak', status: 'Nepročitano', author: '', reviewed: null, linked: { tasks: 0, projects: 0, goals: 0, habits: 0 } } : {}) };
  S.library.push(x);
  openWin({ kind: 'lib', id: x.id });
}
WIN.lib = w => {
  const x = S.library.find(i => i.id === w.id), res = x.kind === 'resource';
  const linkedRows = res ? Object.entries({ tasks: 'Povezani zadaci', projects: 'Povezani projekti', goals: 'Povezani ciljevi', habits: 'Povezane navike' }).map(([k, l]) => prow('soon', IC.link, l, x.linked[k] ? String(x.linked[k]) : '', 'Nijedan', 'data-msg="Višestruki izbor, kao oznake"')).join('') : '';
  return {
    tall: true,
    head: winHead(res ? 'Resurs' : 'Beleška', `<button class="x" style="color:${x.fav ? 'var(--amber)' : 'var(--muted)'}" data-act="libFav" data-id="${x.id}" aria-pressed="${x.fav}" aria-label="Omiljeno">${x.fav ? '★' : '☆'}</button><button class="x" data-act="libMenu" aria-label="Radnje">${IC.dots}</button>`),
    body: `<textarea class="bigtitle" rows="1" placeholder="${res ? 'Naziv resursa' : 'Naziv beleške'}" data-in="libTitle" aria-label="Naziv">${esc(x.title)}</textarea>
      <button class="plink" data-act="libArea">${IC.person}${esc(areaOf(x.area)?.name || 'Bez oblasti')}</button>
      ${res ? `<div class="card">${prow('libType', IC.copy, 'Vrsta', x.type, '')}${prow('libStatus', IC.book, 'Status čitanja', x.status, '')}${prow('soon', IC.person, 'Autor', x.author, 'Bez autora', 'data-msg="Polje za autora"')}${prow('soon', IC.cal, 'Poslednji pregled', x.reviewed ? short(x.reviewed) : '', 'Još nije pregledano', 'data-msg="Isti prozor za datum kao kod zadatka"')}</div>` : ''}
      <div class="glabel">${res ? 'Opis' : 'Tekst'}</div><textarea class="notes" data-in="libBody" placeholder="${res ? 'Opis' : 'Tekst beleške'}">${esc(x.body)}</textarea>
      ${x.clip ? `<div class="glabel">Isečak teksta</div><div class="pcard" style="border-left:3px solid #3A3F48;color:var(--muted)">${esc(x.clip)}</div>` : ''}
      <div class="glabel">Linkovi · ${x.links.length}</div><div class="card">${x.links.map((l, k) => `<div class="prow">${IC.link}<span class="grow" style="color:var(--link);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.replace(/^https?:\/\//, ''))}</span><button class="x" data-act="libRmLink" data-k="${k}" aria-label="Ukloni link">✕</button></div>`).join('')}<div class="prow"><span class="ico">${IC.link}</span><input class="grow" style="background:none;border:0;outline:none" placeholder="https://…" data-in="libNewLink" aria-label="Novi link"><button class="chip sm" data-act="libAddLink">Dodaj</button></div></div>
      <div class="glabel">Organizacija</div><div class="card">${prow('libTags', IC.tag, 'Oznake', S.tags.filter(t => x.tags.includes(t.id)).map(t => t.name).join(', '), 'Nema')}${linkedRows}</div>
      <div class="glabel">Prilozi · ${x.files}</div><div class="card">${x.files ? `<div class="prow">${IC.file}<span class="grow">${res ? 'Poglavlje-3.pdf' : 'Zapisnik.pdf'}<span class="sub">PDF · 1,2 MB</span></span></div>` : ''}<button class="prow add" data-act="soon" data-msg="Bira fajl, najviše 10 MB">＋ Dodaj prilog</button></div>
      ${x.err ? `<p class="err" style="margin-top:10px">${x.err}</p>` : ''}`,
    foot: x.isNew ? `<button class="primary" data-act="libSave">${res ? 'Napravi resurs' : 'Napravi belešku'}</button>` : '',
  };
};
const lib = () => S.library.find(i => i.id === W.id);
IN.libTitle = el => { lib().title = el.value; };
IN.libBody = el => { lib().body = el.value; };
let newLink = '';
IN.libNewLink = el => { newLink = el.value; };
A.libAddLink = () => {
  const x = lib(), v = newLink.trim();
  if (!/^(https?:\/\/|mailto:)\S+$/.test(v)) return toast('Unesi ispravan veb ili imejl link');
  if (x.links.includes(v)) return toast('Ovaj link je već dodat');
  x.links.push(v); newLink = ''; renderWin();
};
A.libRmLink = el => { lib().links.splice(Number(el.dataset.k), 1); renderWin(); };
A.libArea = () => { const x = lib(); openPick({ kind: 'choice', title: 'Oblast', sub: x.title, current: x.area, options: [{ v: null, label: 'Bez oblasti' }, ...activeAreas().map(a => ({ v: a.id, label: a.name, dot: a.color }))], onPick: v => { x.area = v; render(); } }); };
A.libType = () => { const x = lib(); openPick({ kind: 'choice', title: 'Vrsta', sub: x.title, current: x.type, options: RES_TYPES.map(v => ({ v, label: v })), onPick: v => { x.type = v; render(); } }); };
A.libStatus = () => { const x = lib(); openPick({ kind: 'choice', title: 'Status čitanja', sub: x.title, current: x.status, options: RES_STATUS.map(v => ({ v, label: v })), onPick: v => { x.status = v; render(); } }); };
A.libTags = () => { const x = lib(); openPick({ kind: 'libTags', ids: [...x.tags] }); };
PICK.libTags = p => ({ title: 'Oznake', sub: lib().title, body: `<div class="card" style="margin-bottom:14px">${S.tags.map(t => `<button class="opt" data-act="ltToggle" data-id="${t.id}" aria-pressed="${p.ids.includes(t.id)}"><span class="dot" style="background:${t.color}"></span><span class="lbl">${esc(t.name)}</span><span class="check ${p.ids.includes(t.id) ? 'on' : ''}">${p.ids.includes(t.id) ? IC.tickW : ''}</span></button>`).join('')}</div><button class="primary" data-act="ltApply">Primeni</button>` });
A.ltToggle = el => { const id = el.dataset.id; P.ids = P.ids.includes(id) ? P.ids.filter(x => x !== id) : [...P.ids, id]; renderPick(); };
A.ltApply = () => { lib().tags = P.ids; closePick(); render(); };
// A note needs only a title (decided 2026-10-09); a resource still needs a link, image or file.
A.libSave = () => {
  const x = lib(), what = x.kind === 'note' ? 'Beleška' : 'Resurs';
  if (!x.title.trim()) { x.err = `${what} mora imati naziv.`; return renderWin(); }
  if (x.kind === 'resource' && !x.links.length && !x.files) { x.err = 'Resurs mora imati bar jedan URL, sliku ili priloženi fajl.'; return renderWin(); }
  delete x.isNew; delete x.err; render(); toast(`${what} je napravljen${x.kind === 'note' ? 'a' : ''}`);
};
A.libMenu = () => { const x = lib(); openPick({ kind: 'choice', title: x.title || 'Stavka', current: null, options: [{ v: 'del', label: x.kind === 'note' ? 'Obriši belešku' : 'Obriši resurs' }], onPick: () => { S.library.splice(S.library.indexOf(x), 1); closeWin(); render(); toast('Obrisano', () => S.library.push(x)); } }); };
// Closing an unsaved new item drops it.
const closeWinCore = closeWin;
closeWin = function () { if (W?.kind === 'lib') { const x = lib(); if (x?.isNew) S.library.splice(S.library.indexOf(x), 1); } closeWinCore(); };
