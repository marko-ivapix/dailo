// ===== Čišćenje =============================================================
SCREEN_TITLE.cleaning = 'Čišćenje';
const choreRepeat = r => !r ? 'Ne ponavlja se' : r.freq === 'daily' ? (r.interval > 1 ? `Svakih ${r.interval} dana` : 'Svaki dan') : r.freq === 'weekly' ? (r.interval > 1 ? `Svake ${r.interval}. nedelje` : 'Svake nedelje') : r.interval > 1 ? `Svaka ${r.interval} meseca` : 'Svakog meseca';
function choreWhen(t) {
  const d = t.due || t.plan;
  if (!d) return '<span>Bez datuma</span>';
  const n = daysTo(d);
  return n < 0 ? `<span class="red">Kasni · ${short(d)}</span>` : n === 0 ? '<span class="amber">Danas</span>' : n === 1 ? '<span>Sutra</span>' : `<span>${short(d)}</span>`;
}
// Chores get a round check here, so they can be done without opening them.
function choreRow(t) {
  return `<div class="trow"><button class="round ${t.done ? 'on' : ''}" data-act="toggleTask" data-id="${t.id}" aria-label="${t.done ? 'Vrati' : 'Završi'}: ${esc(t.title)}">${t.done ? IC.tick : ''}</button><button class="main" data-act="openTask" data-id="${t.id}"><div class="ttl ${t.done ? 'done-title' : ''}">${esc(t.title)}</div><div class="meta">${t.done ? `Završeno ${relDay(t.doneAt).toLowerCase()}` : choreRepeat(t.repeat)}</div></button><span class="side">${t.done ? '' : choreWhen(t)}</span></div>`;
}
SUB.cleaning = () => {
  const f = S.ui.room || 'all', rooms = S.rooms.filter(r => f === 'all' || r.id === f);
  const open = S.tasks.filter(t => t.room && !t.done), late = open.filter(t => (t.due || t.plan) < TODAY).length;
  let html = `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Čišćenje</h1>
    <div class="summary">${open.length} ${plural(open.length, 'obaveza', 'obaveze', 'obaveza')}${late ? ` · <span class="red">${late} kasni</span>` : ''}</div>`;
  if (!S.rooms.length) return html + `<div class="empty"><strong>Još nema prostorija</strong>Napravi prostoriju, pa dodaj obaveze koje se ponavljaju.</div><div class="chips" style="justify-content:center"><button class="chip" data-act="roomPreset" data-v="stan">Primer: stan</button><button class="chip" data-act="roomPreset" data-v="kuca">Primer: kuća</button></div>`;
  html += `<div class="filters" style="margin-bottom:4px"><button class="chip sm ${f === 'all' ? 'on' : ''}" data-act="roomFilter" data-v="all">Sve prostorije</button>${S.rooms.map(r => `<button class="chip sm ${f === r.id ? 'on' : ''}" data-act="roomFilter" data-v="${r.id}">${esc(r.name)}</button>`).join('')}<button class="chip sm quiet" data-act="newRoom">＋ Prostorija</button></div>`;
  for (const r of rooms) {
    const list = S.tasks.filter(t => t.room === r.id && !t.done).sort((a, b) => (a.due || a.plan || '9999').localeCompare(b.due || b.plan || '9999'));
    const done = S.tasks.filter(t => t.room === r.id && t.done);
    html += `<div class="section" style="justify-content:space-between"><span style="color:var(--text);font-weight:600">${esc(r.name)} <span class="meta" style="display:inline;font-weight:500">· ${list.length}</span></span><button class="icon-btn" style="width:32px;height:32px" data-act="roomMenu" data-id="${r.id}" aria-label="Radnje za prostoriju">${IC.dots}</button></div>
      <div class="card">${list.map(choreRow).join('')}<button class="addrow" data-act="newChore" data-room="${r.id}">＋ Dodaj obavezu</button></div>
      ${done.length ? `<button class="collapsed" data-act="roomDone" data-id="${r.id}" style="margin-top:8px">${IC.fold(S.ui.roomDone?.[r.id])}Završeno · ${done.length}</button>${S.ui.roomDone?.[r.id] ? `<div class="card" style="margin-top:6px">${done.map(choreRow).join('')}</div>` : ''}` : ''}`;
  }
  return html;
};
A.roomFilter = el => { S.ui.room = el.dataset.v; render(); };
A.roomDone = el => { S.ui.roomDone = S.ui.roomDone || {}; S.ui.roomDone[el.dataset.id] = !S.ui.roomDone[el.dataset.id]; render(); };
A.roomMenu = el => { const r = room(el.dataset.id); openPick({ kind: 'choice', title: r.name, current: null, options: [{ v: 'ren', label: 'Preimenuj' }, { v: 'arch', label: 'Arhiviraj prostoriju' }, { v: 'del', label: 'Obriši prostoriju' }], onPick: v => toast(v === 'ren' ? 'Isti mali prozor kao „Nova prostorija“' : 'Traži potvrdu, pa nudi Poništi') }); };
A.roomPreset = () => toast('Dodaje primer prostorija i obaveza');
A.newRoom = () => openPick({ kind: 'newRoom', name: '' });
PICK.newRoom = p => ({ title: 'Nova prostorija', body: `<label class="field"><input class="wide" placeholder="Dnevna soba, kupatilo…" value="${esc(p.name)}" data-in="nrName" aria-label="Naziv prostorije"></label>${p.err ? `<p class="err">${p.err}</p>` : ''}<button class="primary" data-act="nrCreate">Napravi prostoriju</button>` });
IN.nrName = el => { P.name = el.value; };
A.nrCreate = () => { const name = P.name.trim(); if (!name) { P.err = 'Prostorija mora imati naziv.'; return renderPick(); } if (S.rooms.some(r => r.name.toLowerCase() === name.toLowerCase())) { P.err = 'Ta prostorija već postoji.'; return renderPick(); } S.rooms.push({ id: newId('r'), name }); closePick(); render(); toast(`Prostorija „${name}“ je napravljena`); };
// New chore: a name, the room, the first day and how often (the reminder stays in the task window).
A.newChore = el => openWin({ kind: 'chore', title: '', room: el?.dataset?.room || S.rooms[0]?.id, date: TODAY, freq: 'weekly', interval: 1, err: '' });
WIN.chore = w => ({
  head: winHead('Nova obaveza'),
  body: `<input class="bigtitle" placeholder="Usisaj, obriši prašinu…" value="${esc(w.title)}" data-in="chTitle" aria-label="Obaveza">${w.err ? `<p class="err">${w.err}</p>` : ''}
    <div class="glabel" style="margin-top:6px">Prostorija</div><div class="chips">${S.rooms.map(r => `<button class="chip sm ${w.room === r.id ? 'on' : ''}" data-act="chRoom" data-v="${r.id}">${esc(r.name)}</button>`).join('')}</div>
    <div class="glabel" style="margin-top:0">Prvi put</div><div class="chips">${[['Danas', TODAY], ['Sutra', addDays(TODAY, 1)], ['Subota', '2026-10-10']].map(([l, d]) => `<button class="chip sm ${w.date === d ? 'on' : ''}" data-act="chDate" data-v="${d}">${l}</button>`).join('')}</div>
    <div class="glabel" style="margin-top:0">Ponavljanje</div>${seg('freq', [['daily', 'Svaki dan'], ['weekly', 'Nedeljno'], ['monthly', 'Mesečno']], w.freq)}
    <div class="field" style="margin-top:10px"><span class="lbl">Na svakih</span>${`<span class="stepper"><button data-act="chStep" data-d="-1" ${w.interval <= 1 ? 'disabled' : ''} aria-label="Manje">−</button><span>${w.interval}</span><button data-act="chStep" data-d="1" aria-label="Više">+</button></span>`}<span class="meta" style="margin:0">${{ daily: 'dana', weekly: 'nedelje', monthly: 'meseca' }[w.freq]}</span></div>
    <p class="note" style="margin-top:0">${choreRepeat({ freq: w.freq, interval: w.interval })} · prvi put ${relDay(w.date).toLowerCase()}. Ponavljanje nema kraj.</p>`,
  foot: '<button class="primary" data-act="chCreate">Zakaži obavezu</button>',
});
IN.chTitle = el => { W.title = el.value; };
A.chRoom = el => { W.room = el.dataset.v; renderWin(); };
A.chDate = el => { W.date = el.dataset.v; renderWin(); };
A.chStep = el => { W.interval = Math.max(1, W.interval + Number(el.dataset.d)); renderWin(); };
A.chCreate = () => {
  if (!W.title.trim()) { W.err = 'Unesi obavezu.'; return renderWin(); }
  S.tasks.push(T(W.title.trim(), { room: W.room, area: 'a2', plan: W.date, due: W.date, repeat: { freq: W.freq, interval: W.interval, days: [], end: 'never' } }));
  closeWin(); render(); toast('Obaveza je zakazana');
};

// ===== Nedeljni pregled =====================================================
SCREEN_TITLE.review = 'Nedeljni pregled';
S.reviews = [{ weekStart: '2026-09-28', completedAt: '2026-10-04' }, { weekStart: '2026-09-21', completedAt: '2026-09-27' }, { weekStart: '2026-09-14', completedAt: '2026-09-20' }];
const reviewDone = () => S.reviews.some(r => r.weekStart === WEEK_START);
SUB.review = () => {
  const inboxTasks = S.tasks.filter(t => t.inbox && !t.done);
  const overdue = liveTasks().filter(t => t.due && t.due < TODAY), missed = liveTasks().filter(t => t.plan && t.plan < TODAY && !(t.due && t.due < TODAY));
  const step = (n, title, count, ok, body) => `<div class="section" style="gap:10px"><span style="width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:13px;flex:none;${ok ? 'background:var(--green);color:#0F1114' : 'background:#262B33;color:var(--text)'}">${ok ? '✓' : n}</span><span style="color:var(--text)">${title}</span>${count === null ? '' : `<span>· ${count}</span>`}</div>${body}`;
  const days = Array.from({ length: 7 }, (_, k) => addDays(TODAY, k + 1)).map(d => { const planned = S.tasks.filter(t => !t.done && !t.inbox && t.plan === d).length, dues = S.tasks.filter(t => !t.done && !t.inbox && t.due === d).length; return { d, planned, dues }; });
  const done = reviewDone(), last = S.reviews.filter(r => r.weekStart !== WEEK_START).slice(0, 4);
  return `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Nedeljni pregled</h1><div class="summary">Nedelja od ${short(WEEK_START)}</div>
    ${step(1, 'Isprazni Inbox', inboxTasks.length, !inboxTasks.length, inboxTasks.length ? `<div class="card">${inboxTasks.map(t => inboxRow({ type: 'task', id: t.id, title: t.title, group: t.captured, item: t })).join('')}</div>` : '<p class="note" style="margin-top:0">Inbox je prazan.</p>')}
    ${step(2, 'Kasni i propušteno', overdue.length + missed.length, !(overdue.length + missed.length), overdue.length + missed.length ? `<div class="card">${[...overdue, ...missed].map(t => `<div class="srow"><button class="main" data-act="openTask" data-id="${t.id}"><div class="ttl">${esc(t.title)}</div><div class="meta">${t.due && t.due < TODAY ? `Rok ${short(t.due)}` : `Propušten plan ${short(t.plan)}`} · ${esc(placeName(t) || 'Bez projekta')}</div></button><button class="plan" data-act="planToday" data-id="${t.id}">+ Danas</button></div>`).join('')}</div>` : '<p class="note" style="margin-top:0">Ništa ne kasni niti je propušteno.</p>')}
    ${step(3, 'Sledećih 7 dana', null, false, `<div class="card">${days.map(x => `<button class="prow" data-act="reviewDay" data-d="${x.d}"><span class="grow">${WDNAME[mondayIndex(x.d)]}, ${short(x.d)}</span><span class="val ${x.planned + x.dues ? 'set' : ''}">${x.planned} u planu · ${x.dues} ${plural(x.dues, 'rok', 'roka', 'rokova')}</span>${IC.chev}</button>`).join('')}</div>`)}
    ${step(4, 'Ciljevi', S.goals.filter(g => g.status === 'active').length, false, `<div class="card">${S.goals.filter(g => g.status === 'active').map(goalRow).join('')}</div>`)}
    ${step(5, 'Navike', S.habits.length, false, `<div class="card">${S.habits.map(h => { const d = h.week.filter(s => s === 'd').length, p = h.weekly || h.week.filter(s => !['n', 's', 'f'].includes(s)).length; return `<div class="prow"><span class="grow">${esc(h.name)}</span><span class="val">niz ${h.streak || 0} · ${p ? Math.round(d / p * 100) : 0}%</span></div>`; }).join('')}</div>`)}
    ${step(6, 'Oblasti', activeAreas().length, false, `<div class="card">${activeAreas().map(a => `<button class="prow" data-act="go" data-sub="area" data-id="${a.id}">${areaIcon(a)}<span class="grow">${esc(a.name)}</span><span class="val">${openCount(areaTasks(a.id).length)}</span>${IC.chev}</button>`).join('')}</div>`)}
    <div style="margin-top:18px">${done ? `<div class="pcard" style="display:flex;gap:10px;align-items:center"><span class="round on">${IC.tick}</span><span>Pregled za ovu nedelju je završen ${short(S.reviews[0].completedAt)}.</span></div>` : '<button class="primary" data-act="reviewFinish">Završi nedeljni pregled</button>'}</div>
    <p class="note">Prethodni pregledi: ${last.map(r => short(r.completedAt)).join(', ')}</p>`;
};
A.reviewDay = el => { S.ui.calDay = el.dataset.d; S.ui.calView = 'week'; S.ui.calWeek = addDays(el.dataset.d, -mondayIndex(el.dataset.d)); go('calendar'); };
A.reviewFinish = () => { S.reviews.unshift({ weekStart: WEEK_START, completedAt: TODAY }); render(); toast('Nedeljni pregled je završen', () => S.reviews.shift()); };

// ===== Oznake ===============================================================
SCREEN_TITLE.tags = 'Oznake';
SCREEN_TITLE.tag = e => S.tags.find(t => t.id === e.id)?.name || 'Oznaka';
const tagTasks = id => S.tasks.filter(t => !t.done && !t.inbox && t.tags.includes(id));
SUB.tags = () => `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Oznake</h1>
  <div class="summary">${S.tags.length} ${plural(S.tags.length, 'oznaka', 'oznake', 'oznaka')}</div>
  <div class="card">${[...S.tags].sort((a, b) => a.name.localeCompare(b.name)).map(t => { const n = tagTasks(t.id).length; return `<button class="prow" data-act="go" data-sub="tag" data-id="${t.id}"><span class="dot" style="background:${t.color}"></span><span class="grow">${esc(t.name)}</span><span class="val">${n} ${plural(n, 'zadatak', 'zadatka', 'zadataka')}</span>${IC.chev}</button>`; }).join('')}<button class="addrow" data-act="newTag">＋ Nova oznaka</button></div>`;
SUB.tag = ({ id }) => {
  const t = S.tags.find(x => x.id === id), list = tagTasks(id), libItems = S.library.filter(x => x.tags.includes(id));
  return `<div class="status"><span>09:41</span><span>•••</span></div><div class="titlebar">${backBtn()}<button class="icon-btn" data-act="tagMenu" data-id="${id}" aria-label="Radnje za oznaku">${IC.dots}</button></div>
    <h1 class="h1" style="display:flex;gap:10px;align-items:center"><span class="dot" style="background:${t.color};width:12px;height:12px"></span>${esc(t.name)}</h1>
    <div class="summary">${list.length} ${plural(list.length, 'aktivan zadatak', 'aktivna zadatka', 'aktivnih zadataka')}</div>
    ${list.length ? `<div class="card">${list.map(x => taskRow(x, { meta: 'plan' })).join('')}</div>` : '<div class="empty"><strong>Nema aktivnih zadataka sa ovom oznakom</strong>Dodeli je kroz brzo dodavanje (#oznaka) ili u prozoru zadatka.</div>'}
    ${libItems.length ? `<div class="section">U biblioteci <span>· ${libItems.length}</span></div><div class="card">${libItems.map(libRow).join('')}</div>` : ''}`;
};
A.newTag = () => openPick({ kind: 'newTag', name: '', color: COLORS[0] });
PICK.newTag = p => ({ title: p.id ? 'Izmeni oznaku' : 'Nova oznaka', body: `<label class="field"><input class="wide" placeholder="Naziv oznake" value="${esc(p.name)}" data-in="ntName" aria-label="Naziv oznake"></label><div class="glabel" style="margin-top:4px">Boja</div><div class="chips">${COLORS.map(c => `<button class="chip ${p.color === c ? 'on' : ''}" data-act="ntColor" data-c="${c}" aria-label="Boja"><span class="dot" style="background:${c}"></span></button>`).join('')}</div>${p.err ? `<p class="err">${p.err}</p>` : ''}<button class="primary" data-act="ntSave">${p.id ? 'Sačuvaj' : 'Napravi oznaku'}</button>` });
IN.ntName = el => { P.name = el.value; };
A.ntColor = el => { P.color = el.dataset.c; renderPick(); };
A.ntSave = () => {
  const name = P.name.trim();
  if (!name) { P.err = 'Oznaci treba naziv.'; return renderPick(); }
  if (S.tags.some(t => t.id !== P.id && t.name.toLowerCase() === name.toLowerCase())) { P.err = 'Oznaka sa tim nazivom već postoji.'; return renderPick(); }
  if (P.id) Object.assign(S.tags.find(t => t.id === P.id), { name, color: P.color }); else S.tags.push({ id: newId('tag'), name, color: P.color });
  closePick(); render(); toast('Sačuvano');
};
A.tagMenu = el => { const t = S.tags.find(x => x.id === el.dataset.id); openPick({ kind: 'choice', title: t.name, current: null, options: [{ v: 'edit', label: 'Izmeni oznaku', sub: 'Naziv i boja' }, { v: 'del', label: 'Obriši oznaku', sub: 'Zadaci ostaju, a uklanja se samo ova oznaka sa njih.' }], onPick: v => {
  if (v === 'edit') return openPick({ kind: 'newTag', id: t.id, name: t.name, color: t.color });
  const k = S.tags.indexOf(t), had = S.tasks.filter(x => x.tags.includes(t.id));
  S.tags.splice(k, 1); had.forEach(x => { x.tags = x.tags.filter(id => id !== t.id); }); pop();
  toast('Oznaka je obrisana', () => { S.tags.splice(k, 0, t); had.forEach(x => x.tags.push(t.id)); });
} }); };
