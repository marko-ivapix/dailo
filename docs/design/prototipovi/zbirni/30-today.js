// ===== Today (T1–T7) ========================================================
const LIMITS = { overdue: 3, today: 5, habits: 5 };
function limited(key, rows) {
  const open = S.ui.expand[key], max = LIMITS[key];
  let html = (open ? rows : rows.slice(0, max)).join('');
  if (rows.length > max) html += `<button class="more-btn" data-act="expand" data-key="${key}">${open ? 'Prikaži manje' : `Prikaži još ${rows.length - max}`}</button>`;
  return html;
}
A.expand = el => { const k = el.dataset.key; S.ui.expand[k] = !S.ui.expand[k]; render(); };
const byTime = (a, b) => (a.time ? 0 : 1) - (b.time ? 0 : 1) || String(a.time || '').localeCompare(String(b.time || ''));
// Tasks of archived projects leave every list until the project is restored.
const liveTasks = () => S.tasks.filter(t => !t.done && !t.inbox && !(t.project && project(t.project)?.archived));

// Habit circles: done is a green check; numeric and weekly habits fill with progress (T5, H6).
function habitCircle(h, i) {
  const state = h.week[i];
  if (state === 'd') return '<svg class="circle" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12.5" fill="#34C77B"/><path d="M8.5 14.5l3.5 3.5 7.5-8" fill="none" stroke="#0F1114" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if (state === 's') return '<svg class="circle" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="#5B6270" stroke-width="2.5" stroke-dasharray="4 3.4"/></svg>';
  let frac = 0;
  if (h.tracking === 'numeric') frac = Math.min(1, (h.vals[i] || 0) / h.target);
  else if (h.weekly) frac = Math.min(1, h.week.filter(s => s === 'd').length / h.weekly);
  const arc = frac ? `<circle cx="14" cy="14" r="11" fill="none" stroke="#34C77B" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${(frac * 69.1).toFixed(1)} 69.1" transform="rotate(-90 14 14)"/>` : '';
  return `<svg class="circle" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="${frac ? '#3A3F48' : '#4A505A'}" stroke-width="2.5"/>${arc}</svg>`;
}
function habitRight(h, i) {
  if (h.tracking === 'numeric') return `${num(h.vals[i] || 0)} / ${num(h.target)} ${h.unit}`;
  if (h.weekly) return `${h.week.filter(s => s === 'd').length}/${h.weekly} nedeljno`;
  return '';
}
function habitRow(h, i, { meta = '' } = {}) {
  const done = h.week[i] === 'd';
  return `<div class="hrow ${meta ? 'tall' : ''} ${done ? 'done' : ''}"><button data-act="habitTap" data-id="${h.id}" data-i="${i}" aria-pressed="${done}" aria-label="${esc(h.name)}">${habitCircle(h, i)}</button><button class="main" data-act="habitMenu" data-id="${h.id}" data-i="${i}"><div class="ttl">${esc(h.name)}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ''}</button><span class="count">${habitRight(h, i)}</span></div>`;
}
function setHabitState(h, i, state) { h.week[i] = state; }
A.habitTap = el => {
  const h = habit(el.dataset.id), i = Number(el.dataset.i);
  if (h.tracking === 'numeric') return openPick({ kind: 'value', id: h.id, i, total: h.vals[i] || 0 });
  const before = [...h.week];
  setHabitState(h, i, h.week[i] === 'd' ? (i === TI ? 'o' : 'm') : 'd');
  render();
  toast(h.week[i] === 'd' ? `${h.name}: urađeno` : `${h.name}: vraćeno`, () => { h.week = before; });
};
A.habitMenu = el => openPick({ kind: 'habitMenu', id: el.dataset.id, i: Number(el.dataset.i) });
PICK.habitMenu = p => {
  const h = habit(p.id), skipped = h.week[p.i] === 's';
  return { title: h.name, sub: p.i === TI ? 'Danas' : longDate(addDays(WEEK_START, p.i)), body: `<div class="card">
    ${h.tracking === 'numeric' ? `<button class="opt" data-act="habitValueFromMenu">${IC.bolt}<span class="lbl">Upiši vrednost</span></button>` : ''}
    <button class="opt" data-act="habitSkip">${IC.right}<span class="lbl">${skipped ? 'Poništi preskakanje' : 'Preskoči ovaj dan'}<small>Preskočen dan ne prekida niz i ne ulazi u procenat.</small></span></button>
    <button class="opt" data-act="habitDetail">${IC.habit}<span class="lbl">Detalji navike</span></button></div>` };
};
A.habitSkip = () => { const h = habit(P.id), i = P.i; h.week[i] = h.week[i] === 's' ? (i === TI ? 'o' : 'm') : 's'; closePick(); render(); toast(h.week[i] === 's' ? 'Dan je preskočen' : 'Preskakanje je poništeno'); };
A.habitValueFromMenu = () => { const h = habit(P.id); P = { kind: 'value', id: h.id, i: P.i, total: h.vals[P.i] || 0 }; renderPick(); };
// The value sheet for a numeric habit (H6).
PICK.value = p => {
  const h = habit(p.id);
  return { title: h.name, sub: p.i === TI ? 'Danas' : longDate(addDays(WEEK_START, p.i)), body: `
    <div class="pcard" style="margin-bottom:12px"><div class="pbig"><strong>${num(p.total)} <span style="font-size:18px">/ ${num(h.target)} ${h.unit}</span></strong></div><span class="track"><i style="width:${Math.min(100, p.total / h.target * 100)}%;background:var(--green)"></i></span></div>
    <div class="chips">${h.quick.map(v => `<button class="chip" data-act="valueAdd" data-v="${v}">+${num(v)} ${h.unit}</button>`).join('')}</div>
    <label class="field"><span class="lbl">Ukupno za dan</span><input type="number" min="0" step="any" value="${p.total}" data-in="valueTotal" aria-label="Ukupno"><span class="meta" style="margin:0">${h.unit}</span></label>
    <button class="primary" data-act="valueApply">Primeni</button>` };
};
A.valueAdd = el => { P.total = Math.round((Number(P.total) + Number(el.dataset.v)) * 100) / 100; renderPick(); };
IN.valueTotal = el => { P.total = Math.max(0, Number(el.value) || 0); };
A.valueApply = () => {
  const h = habit(P.id), i = P.i, total = P.total;
  const before = { vals: [...h.vals], week: [...h.week] };
  h.vals[i] = total;
  h.week[i] = total >= h.target ? 'd' : (i === TI ? 'o' : 'm');
  closePick(); render();
  toast(`${h.name}: ${num(total)} od ${num(h.target)} ${h.unit}`, () => Object.assign(h, before));
};
const dayPct = i => {
  const planned = S.habits.filter(h => ['d', 'm', 'o'].includes(h.week[i]));
  return planned.length ? Math.round(planned.filter(h => h.week[i] === 'd').length / planned.length * 100) : null;
};

TAB.today = () => {
  const overdueTasks = liveTasks().filter(t => t.due && t.due < TODAY).sort((a, b) => a.due.localeCompare(b.due));
  const overdueRows = [...overdueTasks.map(t => taskRow(t)), ...deadlinesOverdue().map(deadlineRow)];
  const planned = liveTasks().filter(t => t.plan === TODAY && !(t.due && t.due < TODAY)).sort(byTime);
  const todayRows = [...planned.filter(t => t.time).map(t => taskRow(t)), ...deadlinesOn(TODAY).map(deadlineRow), ...planned.filter(t => !t.time).map(t => taskRow(t))];
  const habits = S.habits.filter(h => h.week[TI] !== 'n');
  const habitsSorted = [...habits.filter(h => h.week[TI] !== 'd'), ...habits.filter(h => h.week[TI] === 'd')];
  const doneToday = S.tasks.filter(t => t.done && t.doneAt === TODAY);
  const notice = S.settings.backupNotice ? `<div class="notice">${IC.upload}<span class="main"><b>Rezervna kopija je stara 8 dana</b>Izvezi ZIP da podaci budu sigurni.</span><button data-act="noticeExport">Izvezi</button><button data-act="noticeLater" style="color:var(--muted)">Kasnije</button></div>` : '';
  let html = `<div class="status"><span>09:41</span><span>•••</span></div><div class="date">${longDate(TODAY)}</div>
    <div class="titlebar"><h1 class="h1">Danas</h1><button class="icon-btn" data-act="search" aria-label="Pretraga" style="color:var(--text)">${IC.search}</button></div>${notice}`;
  if (overdueRows.length) html += `<div class="section">Zakasnelo <span>· ${overdueRows.length}</span></div><div class="card">${limited('overdue', overdueRows)}</div>`;
  html += `<div class="section">Planirano danas <span>· ${todayRows.length}</span></div>`;
  html += todayRows.length ? `<div class="card">${limited('today', todayRows)}</div>` : '<div class="card"><p class="note" style="margin:12px 14px">Ništa nije planirano. „+“ dodaje zadatak za danas.</p></div>';
  if (habits.length) html += `<div class="section">Navike <span>· ${habits.filter(h => h.week[TI] === 'd').length}/${habits.length}</span></div><div class="card">${limited('habits', habitsSorted.map(h => habitRow(h, TI)))}</div>`;
  if (doneToday.length) {
    html += `<button class="collapsed" data-act="doneToggle">${IC.fold(S.ui.doneOpen)}Završeno · ${doneToday.length}</button>`;
    if (S.ui.doneOpen) html += `<div class="card" style="margin-top:8px">${doneToday.map(t => taskRow(t)).join('')}</div>`;
  }
  return html;
};
A.doneToggle = () => { S.ui.doneOpen = !S.ui.doneOpen; render(); };
A.noticeExport = () => { S.settings.backupNotice = false; S.settings.lastBackup = 'danas'; render(); toast('ZIP je preuzet'); };
A.noticeLater = () => { S.settings.backupNotice = false; render(); toast('Podsetiću te ponovo za 24 sata'); };
