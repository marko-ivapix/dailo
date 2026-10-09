// ===== Task window (D1–D4, E1–E9) ===========================================
const dateTime = (d, t) => d ? `${relDay(d)}${t ? ` · ${t}` : ''}` : '';
const tprow = (k, icon, label, value) => `<button class="prow" data-act="tPick" data-k="${k}">${icon}<span class="lbl">${label}</span><span class="val ${value ? 'set' : ''}">${value ? esc(value) : 'Nije podešeno'}</span>${IC.chev}</button>`;

A.openTask = el => openWin({ kind: 'task', id: el.dataset.id });
WIN.task = w => {
  const t = task(w.id);
  if (!t) return { head: winHead('Zadatak'), body: '<p class="note">Zadatak je obrisan.</p>' };
  const p = t.project ? project(t.project) : null;
  const tags = S.tags.filter(x => t.tags.includes(x.id)).map(x => x.name).join(', ');
  const subDone = t.subtasks.filter(s => s.d).length;
  return {
    tall: true,
    head: winHead(t.inbox ? 'Zadatak · u Inbox-u' : 'Zadatak', `<button class="x" data-act="taskMenu" aria-label="Radnje zadatka">${IC.dots}</button>`),
    body: `<textarea class="bigtitle" rows="2" data-in="taskTitle" aria-label="Naslov">${esc(t.title)}</textarea>
      <button class="plink" data-act="tPick" data-k="project">${IC.folder}${esc(p ? p.name : 'Bez projekta')}</button>
      <div class="glabel">Planiranje</div><div class="card">
        ${tprow('plan', IC.cal, 'Planirano', dateTime(t.plan, t.time))}
        ${tprow('due', IC.due, 'Rok', dateTime(t.due, t.dueTime))}
        ${tprow('reminder', IC.bell, 'Podsetnik', t.reminder ? dateTime(t.reminder.date, t.reminder.time) : '')}
        ${tprow('repeat', IC.repeat, 'Ponavljanje', t.repeat ? repeatText(t.repeat, t.plan || t.due) : '')}
        ${tprow('duration', IC.timer, 'Trajanje', durLabel(t.duration))}</div>
      <div class="glabel">Organizacija</div><div class="card">
        ${tprow('project', IC.folder, 'Projekat', p ? p.name : '')}
        ${tprow('tags', IC.tag, 'Oznake', tags)}
        <button class="prow" data-act="tPick" data-k="priority">${IC.flag(PRI[t.priority]).replace('width="15" height="15"', 'width="20" height="20"')}<span class="lbl">Prioritet</span><span class="val ${t.priority !== 'none' ? 'set' : ''}">${t.priority === 'none' ? 'Nije podešeno' : PRI_NAME[t.priority]}</span>${IC.chev}</button></div>
      <div class="glabel">Podzadaci · ${subDone}/${t.subtasks.length}</div><div class="card">
        ${t.subtasks.map((s, k) => `<button class="prow" data-act="subToggle" data-k="${k}"><span class="box ${s.d ? 'on' : ''}">${s.d ? IC.tick : ''}</span><span class="grow ${s.d ? 'done-title' : ''}">${esc(s.t)}</span></button>`).join('')}
        <button class="prow add" data-act="subAdd">＋ Dodaj podzadatak</button></div>
      <div class="glabel">Beleške</div><textarea class="notes" data-in="taskNotes" placeholder="Beleška">${esc(t.notes)}</textarea>
      ${t.attach ? `<div class="glabel">Prilozi · 1</div><div class="card"><div class="prow">${IC.file}<span class="grow">${esc(t.attach)}<span class="sub">PDF · 1,2 MB</span></span></div></div>` : ''}
      <button class="more" data-act="soon" data-msg="Više opcija: oblast, ciljevi, šablon">Više opcija <span style="display:inline-flex;gap:4px;align-items:center">Oblast, ciljevi, šablon${IC.chev}</span></button>`,
    foot: `<button class="primary ${t.done ? 'quiet' : ''}" data-act="taskComplete">${t.done ? 'Vrati kao otvoren' : 'Završi zadatak'}</button>`,
  };
};
IN.taskTitle = el => { task(W.id).title = el.value; };
IN.taskNotes = el => { task(W.id).notes = el.value; };
A.taskComplete = () => { const t = task(W.id); if (!t.done) t.inbox = false; const { next, undo } = completeTask(t); render(); toast(t.done ? (next ? `Završeno · sledeći put ${relDay(next.plan || next.due)}` : 'Zadatak je završen') : 'Zadatak je vraćen', undo); };
A.subToggle = el => { const s = task(W.id).subtasks[Number(el.dataset.k)]; s.d = !s.d; renderWin(); };
A.subAdd = () => { const t = task(W.id); t.subtasks.push({ t: `Novi podzadatak ${t.subtasks.length + 1}`, d: false }); renderWin(); };
// The task menu holds Focus (T2a) and Delete (I2).
A.taskMenu = () => {
  const t = task(W.id);
  openPick({ kind: 'choice', title: t.title, current: null, options: [{ v: 'focus', label: 'Započni fokus', icon: IC.timer }, { v: 'dup', label: 'Dupliraj', icon: IC.copy }, { v: 'tpl', label: 'Sačuvaj kao šablon', icon: IC.copy }, { v: 'del', label: 'Obriši zadatak', icon: IC.trash }], onPick: v => {
    if (v === 'del') { const k = S.tasks.indexOf(t); S.tasks.splice(k, 1); closeWin(); render(); toast('Zadatak je obrisan', () => S.tasks.splice(k, 0, t)); }
    else if (v === 'dup') { S.tasks.push({ ...JSON.parse(JSON.stringify(t)), id: newId('t'), title: `${t.title} (kopija)` }); render(); toast('Napravljena je kopija'); }
    else if (v === 'focus') openFocus(t.id);
    else toast('Otvara šablon zadatka, popunjen ovim zadatkom');
  } });
};

A.tPick = el => {
  const t = task(W.id), k = el.dataset.k;
  if (k === 'plan' || k === 'due') return openDate({ mode: 'task', which: k, date: k === 'plan' ? t.plan : t.due, time: k === 'plan' ? t.time : t.dueTime });
  if (k === 'reminder') return openPick({ kind: 'reminder', ...(t.reminder || { date: t.plan || TODAY, time: t.time || '09:00' }) });
  if (k === 'repeat') { const start = t.plan || t.due || TODAY; return openPick({ kind: 'repeat', start, r: normRepeat(t.repeat ? JSON.parse(JSON.stringify(t.repeat)) : null, start) }); }
  if (k === 'duration') return openPick({ kind: 'duration' });
  if (k === 'project') return openPick({ kind: 'project', current: t.project, allowNone: true, sub: t.title, onPick: id => { t.project = id; if (id) { t.area = null; t.inbox = false; } render(); toast('Sačuvano'); } });
  if (k === 'tags') return openPick({ kind: 'tags', ids: [...t.tags], q: '' });
  if (k === 'priority') return openPick({ kind: 'choice', title: 'Prioritet', sub: t.title, current: t.priority, options: Object.entries(PRI_NAME).map(([v, l]) => ({ v, label: l, icon: IC.flag(PRI[v]).replace('width="15" height="15"', 'width="20" height="20"') })), onPick: v => { t.priority = v; render(); toast('Prioritet ne menja redosled'); } });
};

// Date sheet (E4), shared by the task window and Quick Add.
function openDate(p) { const base = p.date || TODAY; openPick({ kind: 'date', ...p, view: { y: parse(base).getFullYear(), m: parse(base).getMonth() } }); }
function monthGrid(selected, view) {
  const first = iso(new Date(view.y, view.m, 1)), count = new Date(view.y, view.m + 1, 0).getDate();
  let html = `<div class="cal"><div class="calhead"><button data-act="dMove" data-d="-1" aria-label="Prethodni mesec">‹</button><span>${cap(MONTHS[view.m])} ${view.y}</span><button data-act="dMove" data-d="1" aria-label="Sledeći mesec">›</button></div><div class="grid7">${WD.map(w => `<div class="wd">${w}</div>`).join('')}${'<div></div>'.repeat(mondayIndex(first))}`;
  for (let d = 1; d <= count; d++) { const s = iso(new Date(view.y, view.m, d)); html += `<button class="day ${s === selected ? 'sel' : ''} ${s === TODAY ? 'today' : ''}" data-act="dDay" data-d="${s}"><span>${d}</span></button>`; }
  return html + '</div></div>';
}
PICK.date = p => {
  const quick = [['Danas', TODAY], ['Sutra', addDays(TODAY, 1)], ['Sledeće nedelje', nextMonday()]];
  let other = '';
  if (p.mode === 'task') { const t = task(W.id); other = p.which === 'plan' ? (t.due ? `Rok ostaje isti: ${dateTime(t.due, t.dueTime)}` : 'Rok nije postavljen.') : (t.plan ? `Planirano ostaje isto: ${dateTime(t.plan, t.time)}` : 'Planirani datum nije postavljen.'); }
  return { title: p.mode === 'habitStart' ? 'Početak' : p.which === 'due' ? 'Rok' : 'Planirani datum', sub: p.mode === 'task' ? task(W.id).title : '', body: `
    <div class="chips">${quick.map(([l, d]) => `<button class="chip ${p.date === d ? 'on' : ''}" data-act="dQuick" data-d="${d}">${l}</button>`).join('')}</div>
    ${monthGrid(p.date, p.view)}
    <label class="field">${IC.timer}<span class="lbl">Vreme</span><input type="time" value="${p.time || ''}" data-ch="dTime"></label>
    ${other ? `<p class="note" style="margin-top:0">${esc(other)}</p>` : ''}
    <div class="split"><button class="ghost" data-act="dClear">Ukloni datum</button><button class="primary" data-act="dApply">Primeni</button></div>` };
};
A.dQuick = el => { P.date = el.dataset.d; P.view = { y: parse(P.date).getFullYear(), m: parse(P.date).getMonth() }; renderPick(); };
A.dDay = el => { P.date = el.dataset.d; renderPick(); };
A.dMove = el => { P.view.m += Number(el.dataset.d); if (P.view.m < 0) { P.view.m = 11; P.view.y--; } if (P.view.m > 11) { P.view.m = 0; P.view.y++; } renderPick(); };
CH.dTime = el => { P.time = el.value || null; };
function applyDate(date, time) {
  if (P.mode === 'quick') { W.date = date; W.time = time; W.datePicked = true; closePick(); return renderWin(); }
  if (P.mode === 'habitStart') { W.freq.start = date || TODAY; closePick(); return renderWin(); }
  const t = task(W.id);
  if (P.which === 'plan') { t.plan = date; t.time = date ? time : null; if (date) t.inbox = false; } else { t.due = date; t.dueTime = date ? time : null; }
  closePick(); render(); toast('Sačuvano');
}
A.dClear = () => applyDate(null, null);
A.dApply = () => applyDate(P.date, P.time);

// Reminder (E6).
PICK.reminder = p => {
  const t = task(W.id);
  const base = t.plan && t.time ? new Date(`${t.plan}T${t.time}`) : null;
  const shift = min => { const d = new Date(base.getTime() - min * 60000); return { date: iso(d), time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }; };
  const presets = base ? [['U vreme plana', shift(0)], ['15 min pre', shift(15)], ['1 h pre', shift(60)], ['Dan pre u 9:00', { date: addDays(t.plan, -1), time: '09:00' }]] : [];
  P.presets = presets;
  return { title: 'Podsetnik', sub: t.title, body: `
    ${presets.length ? `<div class="chips">${presets.map(([l, v], k) => `<button class="chip ${p.date === v.date && p.time === v.time ? 'on' : ''}" data-act="rPreset" data-k="${k}">${l}</button>`).join('')}</div>` : '<p class="note" style="margin-top:0">Brzi izbori se pojavljuju kad zadatak ima planirano vreme.</p>'}
    <label class="field">${IC.cal}<span class="lbl">Datum</span><input type="date" value="${p.date}" data-ch="rDate"></label>
    <label class="field">${IC.timer}<span class="lbl">Vreme</span><input type="time" value="${p.time}" data-ch="rTime"></label>
    <p class="note" style="margin-top:0">Podseti me ${short(p.date)} u ${p.time}</p>
    <div class="glabel" style="margin-top:4px">Datumi zadatka</div><div class="card" style="margin-bottom:14px"><div class="prow">${IC.cal}<span class="lbl">Planirano</span><span class="val">${dateTime(t.plan, t.time) || '—'}</span></div><div class="prow">${IC.due}<span class="lbl">Rok</span><span class="val">${dateTime(t.due, t.dueTime) || '—'}</span></div></div>
    <div class="split"><button class="ghost" data-act="rClear">Ukloni podsetnik</button><button class="primary" data-act="rApply">Primeni</button></div>` };
};
A.rPreset = el => { Object.assign(P, P.presets[Number(el.dataset.k)][1]); renderPick(); };
CH.rDate = el => { if (el.value) P.date = el.value; renderPick(); };
CH.rTime = el => { if (el.value) P.time = el.value; renderPick(); };
A.rClear = () => { task(W.id).reminder = null; closePick(); render(); toast('Sačuvano'); };
A.rApply = () => { task(W.id).reminder = { date: P.date, time: P.time }; closePick(); render(); toast('Sačuvano'); };

// Repeat (E7): the sheet is in 54-repeat.js.

// Duration: a tap applies at once (E3).
PICK.duration = () => ({ title: 'Trajanje', sub: task(W.id).title, body: `<div class="chips">${[15, 30, 45, 60, 90, 120].map(m => `<button class="chip ${task(W.id).duration === m ? 'on' : ''}" data-act="durPick" data-v="${m}">${durLabel(m)}</button>`).join('')}</div><p class="note" style="margin-top:0">Dodir odmah postavlja trajanje. Trajanje se vidi u Kalendaru, u prikazu „Raspored“.</p><button class="ghost" data-act="durPick" data-v="0">Ukloni trajanje</button>` });
A.durPick = el => { task(W.id).duration = Number(el.dataset.v) || null; closePick(); render(); toast('Sačuvano'); };

// Project (E8): search, grouped by area, "+ Novi projekat"; a tap applies.
function projectList(p) {
  const q = (p.q || '').toLowerCase();
  let html = p.allowNone ? `<button class="opt" data-act="pjPick" data-id=""><span class="lbl">Bez projekta</span><span class="radio ${!p.current ? 'on' : ''}"></span></button>` : '';
  for (const a of activeAreas()) for (const pr of activeProjects().filter(x => x.area === a.id && x.name.toLowerCase().includes(q))) html += `<button class="opt" data-act="pjPick" data-id="${pr.id}"><span class="dot" style="background:${pr.color}"></span><span class="lbl">${esc(pr.name)}<small>Oblast: ${esc(a.name)}</small></span><span class="radio ${p.current === pr.id ? 'on' : ''}"></span></button>`;
  return html + '<button class="opt" data-act="newProject" style="color:var(--link)">＋ Novi projekat</button>';
}
PICK.project = p => ({ title: 'Projekat', sub: p.sub, body: `<label class="search">${IC.search}<input placeholder="Pretraži projekte" value="${esc(p.q || '')}" data-in="pjSearch" aria-label="Pretraži projekte"></label><div class="card" id="pjList" style="margin-bottom:10px">${projectList(p)}</div><p class="note" style="margin-top:0">Zadatak dobija oblast svog projekta. Dodir odmah primenjuje izbor.</p>` });
IN.pjSearch = el => { P.q = el.value; $('pjList').innerHTML = projectList(P); };
A.pjPick = el => { const p = P; closePick(); p.onPick(el.dataset.id || null); };

// Tags (E9): several at once, then "Primeni".
function tagList(p) {
  const q = (p.q || '').toLowerCase();
  return S.tags.filter(x => x.name.toLowerCase().includes(q)).map(x => `<button class="opt" data-act="tgToggle" data-id="${x.id}" aria-pressed="${p.ids.includes(x.id)}"><span class="dot" style="background:${x.color}"></span><span class="lbl">${esc(x.name)}</span><span class="check ${p.ids.includes(x.id) ? 'on' : ''}">${p.ids.includes(x.id) ? IC.tickW : ''}</span></button>`).join('') + `<button class="opt" data-act="tgNew" style="color:var(--link)">＋ Nova oznaka${p.q ? ` „${esc(p.q)}“` : ''}</button>`;
}
PICK.tags = p => ({ title: 'Oznake', sub: task(W.id).title, body: `<label class="search">${IC.search}<input placeholder="Pretraži oznake" value="${esc(p.q || '')}" data-in="tgSearch" aria-label="Pretraži oznake"></label><div class="card" id="tgList" style="margin-bottom:14px">${tagList(p)}</div><button class="primary" data-act="tgApply">Primeni</button>` });
IN.tgSearch = el => { P.q = el.value; $('tgList').innerHTML = tagList(P); };
A.tgToggle = el => { const id = el.dataset.id; P.ids = P.ids.includes(id) ? P.ids.filter(x => x !== id) : [...P.ids, id]; $('tgList').innerHTML = tagList(P); };
A.tgNew = () => { const name = (P.q || '').trim() || `Oznaka ${S.tags.length + 1}`; const tg = { id: newId('tag'), name, color: '#8FA2FF' }; S.tags.push(tg); P.ids.push(tg.id); P.q = ''; renderPick(); };
A.tgApply = () => { task(W.id).tags = P.ids; closePick(); render(); toast('Sačuvano'); };
