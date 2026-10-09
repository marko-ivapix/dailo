// ===== Desktop layer (dailo-racunar.html) ===================================
// Same data and screens as the phone prototype; only the frame and a few layouts change.
document.body.classList.add('desk');
$('phone').classList.add('desk');
$('phone').insertAdjacentHTML('afterbegin', '<aside id="side" aria-label="Glavna navigacija"></aside>');
document.querySelector('.top').innerHTML = '<b>Prototip za računar (1280 × 800).</b> Isti podaci i ekrani kao na telefonu. Levo je bočni meni (donja traka i „Još“ zajedno). Zadatak, cilj, navika i beleška se otvaraju u prozoru u sredini; „+“ dole desno dodaje ono što pripada ekranu. Mali izbori su prozorčići pored reda. Zadatak prevuci na dan u kalendaru, na „Danas“ ili „Sutra“ ili na projekat u bočnom meniju. Prečice: Q novi zadatak, / pretraga, [ sakriva meni, ← → i T u kalendaru, Esc zatvara.';

// ----- Sidebar --------------------------------------------------------------
const routeKey = () => { const top = R.stack.at(-1); return top ? `${top.type}:${top.id || ''}` : `tab:${R.tab}`; };
function sbItem(key, act, data, icon, label, extra = '') {
  return `<button class="sb-item ${routeKey() === key ? 'on' : ''}" data-act="${act}" ${data} ${routeKey() === key ? 'aria-current="page"' : ''} title="${label}">${icon}<span class="sb-txt">${label}</span>${extra}</button>`;
}
// Planiranje, Biblioteka and Arhiva fold on their title (K1, decided 2026-10-09); the app remembers it per device.
// A folded group still shows the item that is open.
S.ui.sbFold = S.ui.sbFold || {};
const sbGroup = (id, label, items) => {
  const folded = !!S.ui.sbFold[id] && !S.ui.sbMini, shown = folded ? items.filter(([key]) => routeKey() === key) : items;
  return `<button class="sb-label sb-fold" data-act="sbFold" data-g="${id}" aria-expanded="${!folded}">${label}${IC.fold(!folded)}</button>${shown.map(([, html]) => html).join('')}`;
};
A.sbFold = el => { const g = el.dataset.g; S.ui.sbFold[g] = !S.ui.sbFold[g]; renderNav(); };
// The sidebar can shrink to a narrow strip of icons (K1, decided 2026-10-09): the button at the top or "[".
A.sbMini = () => { S.ui.sbMini = !S.ui.sbMini; $('phone').classList.toggle('sb-mini', S.ui.sbMini); renderNav(); };
const deskSub = (tab, type, id = '') => `data-tab="${tab}" data-sub="${type}"${id ? ` data-id="${id}"` : ''}`;
function addLabel() {
  const top = R.stack.at(-1)?.type;
  return { habits: 'Nova navika' }[R.tab] || { goals: 'Novi cilj', notes: 'Nova beleška', resources: 'Novi resurs', cleaning: 'Nova redovna obaveza', tags: 'Nova oznaka', tag: 'Nova oznaka', templates: 'Novi šablon', views: 'Novi prikaz', view: 'Novi prikaz', areas: 'Nova oblast' }[top] || 'Novi zadatak';
}
function renderSidebar() {
  const nav = (key, label, path) => sbItem(`tab:${key}`, 'tab', `data-tab="${key}" ${key === 'today' ? 'data-drop-plan="today"' : ''}`, SV(path, 18), label, key === 'inbox' && inboxCount() ? `<span class="sb-badge">${inboxCount()}</span>` : key === 'today' ? `<span class="sb-n">${liveTasks().filter(t => t.plan === TODAY).length}</span>` : '');
  const pinned = [...activeAreas().filter(a => a.pinned).map(a => sbItem(`area:${a.id}`, 'deskGo', deskSub('more', 'area', a.id), `<span class="dot" style="background:${a.color};border-radius:3px"></span>`, esc(a.name))), ...S.views.filter(v => v.pinned).map(v => sbItem(`view:${v.id}`, 'deskGo', deskSub('more', 'view', v.id), SV('<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>', 16), esc(v.name)))];
  const ic18 = i => i.replace('width="20" height="20"', 'width="18" height="18"');
  const mini = !!S.ui.sbMini, toggle = `<button class="sb-toggle" data-act="sbMini" aria-label="${mini ? 'Prikaži meni' : 'Sakrij meni'}" title="${mini ? 'Prikaži meni' : 'Sakrij meni'} ([)">${SV(mini ? '<path d="M4 5h16M4 12h16M4 19h16"/>' : '<path d="M15 6l-6 6 6 6"/>', 16)}</button>`;
  $('side').innerHTML = `<div class="sb-top"><strong><i></i><span>Dailo</span></strong><span class="meta sb-state" style="margin:0">${S.settings.sync ? 'Sinhronizovano' : 'Na uređaju'}</span>${toggle}</div>
    <button class="sb-search" data-act="search">${SV('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', 16)}<span>Pretraga</span><kbd>/</kbd></button>
    ${NAV.filter(n => n[0] !== 'more').map(([k, l, p]) => nav(k, l, p)).join('')}
    <div class="sb-drop" data-drop-plan="tomorrow">${SV('<path d="M5 6v6a4 4 0 0 0 4 4h10M15 12l4 4-4 4"/>', 14)}Prevuci ovde za sutra</div>
    ${pinned.length ? `<div class="sb-label">Zakačeno</div>${pinned.join('')}` : ''}
    <div class="sb-label">Projekti</div>
    ${activeAreas().map(a => { const list = activeProjects().filter(p => p.area === a.id); return list.length ? `<div class="sb-sub">${esc(a.name)}</div>${list.map(p => sbItem(`project:${p.id}`, 'deskGo', `${deskSub('tasks', 'project', p.id)} data-drop-project="${p.id}"`, `<span class="dot" style="background:${p.color}"></span>`, esc(p.name), `<span class="sb-n">${projectTasks(p.id).filter(t => !t.done).length}</span>`)).join('')}` : ''; }).join('')}
    ${[['plan', 'Planiranje', [['goals', 'Ciljevi', IC.goal], ['areas', 'Oblasti', IC.area], ['cleaning', 'Redovne obaveze', IC.repeat], ['review', 'Nedeljni pregled', IC.review]]],
      ['lib', 'Biblioteka', [['notes', 'Beleške', IC.note], ['resources', 'Resursi', IC.link], ['tags', 'Oznake', IC.tag], ['templates', 'Šabloni', IC.copy], ['views', 'Sačuvani prikazi', IC.funnel]]],
      ['arch', 'Arhiva', [['completed', 'Završeni zadaci', IC.checkc], ['archived', 'Arhivirani projekti', IC.archive]]]]
      .map(([id, label, list]) => sbGroup(id, label, list.map(([t, l, i]) => [`${t}:`, sbItem(`${t}:`, 'deskGo', deskSub('more', t), ic18(i), l)]))).join('')}
    <div class="sb-foot">${sbItem('settings:', 'deskGo', deskSub('more', 'settings'), IC.gear.replace('width="20" height="20"', 'width="18" height="18"'), 'Podešavanja')}</div>`;
}
renderNav = renderSidebar;

A.deskGo = el => { closePick(); closeWin(); R.tab = el.dataset.tab; R.stack = [{ type: el.dataset.sub, ...(el.dataset.id ? { id: el.dataset.id } : {}) }]; render(); };
// Screens opened from the sidebar need no back button; deeper ones keep it.
const backBtnPhone = backBtn;
backBtn = function () { return R.stack.length <= 1 ? '' : backBtnPhone(); };

// ----- Windows: centered dialogs (decided 2026-10-09); the "+" names what it adds --
const renderNavDesk = renderNav;
renderNav = function () { renderNavDesk(); const label = `${addLabel()} (Q)`; $('fab').setAttribute('aria-label', label); $('fab').title = label; };

// Search is a centered dialog on the desktop, like a command palette.
const searchWinPhone = WIN.search;
WIN.search = w => ({ ...searchWinPhone(w), tall: false });

// ----- Pickers as popovers next to the row that opened them ------------------
let anchor = null;
$('phone').addEventListener('click', ev => { const el = ev.target.closest('[data-act]'); if (el && !el.closest('#pick')) anchor = el; }, true);
const openPickPhone = openPick;
openPick = function (p) {
  openPickPhone(p);
  const box = $('phone').getBoundingClientRect(), pick = $('pick');
  // The repeat editor is too long for a popover: it opens as a centered window (K6, decided 2026-10-09).
  pick.classList.toggle('center', p.kind === 'repeat');
  if (p.kind === 'repeat') { Object.assign(pick.style, { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }); return; }
  if (!anchor || !box.width) { pick.style.left = '50%'; pick.style.top = '120px'; pick.style.transform = 'translateX(-50%)'; return; }
  const a = anchor.getBoundingClientRect(), h = Math.min(pick.scrollHeight || 360, 520);
  const left = Math.min(Math.max(8, a.left - box.left), box.width - 348);
  const below = a.bottom - box.top + 6, top = below + h > box.height - 8 ? Math.max(8, a.top - box.top - h - 6) : below;
  Object.assign(pick.style, { left: `${left}px`, top: `${top}px`, transform: 'none' });
};

// ----- Today and Habits in two columns where there is room ------------------
TAB.today = () => {
  const overdueTasks = liveTasks().filter(t => t.due && t.due < TODAY).sort((a, b) => a.due.localeCompare(b.due));
  const overdueRows = [...overdueTasks.map(t => taskRow(t)), ...deadlinesOverdue().map(deadlineRow)];
  const planned = liveTasks().filter(t => t.plan === TODAY && !(t.due && t.due < TODAY)).sort(byTime);
  const todayRows = [...planned.filter(t => t.time).map(t => taskRow(t)), ...deadlinesOn(TODAY).map(deadlineRow), ...planned.filter(t => !t.time).map(t => taskRow(t))];
  const habits = S.habits.filter(h => h.week[TI] !== 'n'), sorted = [...habits.filter(h => h.week[TI] !== 'd'), ...habits.filter(h => h.week[TI] === 'd')];
  const doneToday = S.tasks.filter(t => t.done && t.doneAt === TODAY);
  const notice = S.settings.backupNotice ? `<div class="notice">${IC.upload}<span class="main"><b>Rezervna kopija je stara 8 dana</b>Izvezi ZIP da podaci budu sigurni.</span><button data-act="noticeExport">Izvezi</button><button data-act="noticeLater" style="color:var(--muted)">Kasnije</button></div>` : '';
  const left = `${overdueRows.length ? `<div class="section">Zakasnelo <span>· ${overdueRows.length}</span></div><div class="card">${limited('overdue', overdueRows)}</div>` : ''}
    <div class="section">Planirano danas <span>· ${todayRows.length}</span></div><div class="card">${todayRows.length ? limited('today', todayRows) : '<p class="note" style="margin:12px 14px">Ništa nije planirano.</p>'}</div>
    ${doneToday.length ? `<button class="collapsed" data-act="doneToggle">${IC.fold(S.ui.doneOpen)}Završeno · ${doneToday.length}</button>${S.ui.doneOpen ? `<div class="card" style="margin-top:8px">${doneToday.map(t => taskRow(t)).join('')}</div>` : ''}` : ''}`;
  const right = `<div class="section">Navike <span>· ${habits.filter(h => h.week[TI] === 'd').length}/${habits.length}</span></div><div class="card">${limited('habits', sorted.map(h => habitRow(h, TI)))}</div>`;
  return `<div class="date">${longDate(TODAY)}</div><div class="titlebar"><h1 class="h1">Danas</h1></div>${notice}<div class="cols"><div>${left}</div><div>${right}</div></div>`;
};
TAB.habits = () => {
  const planned = S.habits.filter(h => ['d', 'o'].includes(h.week[TI]));
  return `<div class="titlebar" style="margin-bottom:10px"><h1 class="h1">Navike</h1><span class="meta">${planned.filter(h => h.week[TI] === 'd').length} od ${planned.length} danas</span></div>
    <div class="cols"><div>${ringsCard()}<div class="seg" role="tablist"><button role="tab" class="${S.ui.habTab === 'day' ? 'on' : ''}" data-act="habTab" data-v="day">Dan</button><button role="tab" class="${S.ui.habTab === 'week' ? 'on' : ''}" data-act="habTab" data-v="week">Nedelja</button></div>${S.ui.habTab === 'day' ? habitsDay() : habitsWeek()}</div>
    <div><div class="section" style="margin-top:0">Napredak</div><div class="card"><div class="meta" style="padding:10px 14px 2px;margin:0">Po navici · ova nedelja</div>${habitBars()}</div>${chartCard()}
      <button class="collapsed" data-act="pausedToggle">${IC.fold(S.ui.pausedOpen)}Pauzirane · ${S.pausedHabits.length}</button>${S.ui.pausedOpen ? `<div class="card" style="margin-top:8px">${S.pausedHabits.map(h => `<div class="hrow"><span class="main"><div class="ttl" style="color:var(--muted)">${esc(h.name)}</div><div class="meta">${h.when}</div></span></div>`).join('')}</div>` : ''}</div></div>`;
};

// ----- Calendar: the week in 7 columns, the month with titles ---------------
function kcard(t) { return `<button class="kcard" draggable="true" data-drag="${t.id}" data-act="openTask" data-id="${t.id}">${t.time ? `<b>${t.time}${t.duration ? ` · ${durLabel(t.duration)}` : ''}</b>` : ''}${esc(t.title)}${t.due && !t.plan ? `<div>${dueLabel(t.due)}</div>` : ''}</button>`; }
A.calToday = () => { S.ui.calDay = TODAY; S.ui.calWeek = addDays(TODAY, -mondayIndex(TODAY)); S.ui.calMonth = TODAY.slice(0, 7); render(); };
function calHeader(label) {
  return `<div class="titlebar"><h1 class="h1">Kalendar</h1><div class="seg" style="width:320px">${[['week', 'Nedelja'], ['month', 'Mesec'], ['upcoming', 'Predstojeće']].map(([k, l]) => `<button class="${S.ui.calView === k ? 'on' : ''}" data-act="calView" data-v="${k}">${l}</button>`).join('')}</div></div>
    ${label ? `<div class="monthbar"><strong>${label}</strong><span class="arrows"><button class="chip sm" data-act="calToday" title="Danas (T)" style="margin-right:6px">Danas</button><button data-act="calMove" data-d="-1" aria-label="Nazad" title="Nazad (←)">${IC.left}</button><button data-act="calMove" data-d="1" aria-label="Napred" title="Napred (→)">${IC.right}</button></span></div>` : ''}`;
}
TAB.calendar = () => {
  if (S.ui.calView === 'upcoming') return calHeader('') + upcoming();
  if (S.ui.calView === 'week') {
    const start = S.ui.calWeek, a = parse(start), b = parse(addDays(start, 6));
    const label = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()}. ${SHORT[a.getMonth()]} ${a.getFullYear()}` : `${short(start)} – ${short(addDays(start, 6))}`;
    const cols = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i), items = dayItems(day), mins = S.tasks.filter(t => !t.done && !t.inbox && t.plan === day).reduce((s, t) => s + (t.duration || 0), 0);
      const pct = S.settings.capacity ? Math.min(100, Math.round(mins / S.settings.capacity * 100)) : 0;
      return `<div class="col ${day === TODAY ? 'today' : ''} ${day === S.ui.calDay ? 'sel' : ''}" data-drop-day="${day}"><button class="colhead" data-act="calPick" data-d="${day}" aria-pressed="${day === S.ui.calDay}" title="Lista i raspored za ovaj dan"><span>${WD[i]}</span><b>${parse(day).getDate()}</b></button><div class="colload" title="${durLabel(mins) || '0 min'} od ${durLabel(S.settings.capacity)}"><span style="width:${pct}%;${mins > S.settings.capacity ? 'background:var(--amber)' : ''}"></span></div>
        ${items.timed.map(kcard).join('')}${items.deadlines.map(x => `<button class="kcard deadline" data-act="openGoal" data-id="${x.g.id}">${IC.goal.replace('width="20" height="20"', 'width="12" height="12"')} ${esc(x.m ? x.m.t : x.g.title)}</button>`).join('')}${items.untimed.map(kcard).join('')}
        <button class="coladd" data-act="deskAddDay" data-d="${day}">＋ Dodaj</button></div>`;
    }).join('');
    // Cards, no hour grid in the week (K8, decided 2026-10-09); a click on a date shows that day below, with its "Raspored" (C6).
    const sel = S.ui.calDay >= start && S.ui.calDay <= addDays(start, 6) ? S.ui.calDay : null;
    return `${calHeader(label)}<div class="wk7">${cols}</div><p class="note">Prevuci karticu na drugi dan. Traka ispod datuma je popunjenost dana (kapacitet ${durLabel(S.settings.capacity)}). Klik na datum prikazuje dan ispod, sa rasporedom po satima.</p>${sel ? dayPanel(sel) : ''}`;
  }
  const [y, m] = S.ui.calMonth.split('-').map(Number), first = `${S.ui.calMonth}-01`, count = new Date(y, m, 0).getDate();
  const cells = Array.from({ length: count }, (_, k) => {
    const day = addDays(first, k), it = dayItems(day), titles = [...it.timed, ...it.untimed].map(t => `${t.time ? `${t.time} ` : ''}${t.title}`).concat(it.deadlines.map(x => `◎ ${x.m ? x.m.t : x.g.title}`));
    return `<button class="mcell ${day === S.ui.calDay ? 'sel' : ''} ${day === TODAY ? 'today' : ''}" data-act="calPick" data-d="${day}" data-drop-day="${day}"><span class="n">${k + 1}</span>${titles.slice(0, 3).map(x => `<span class="t">${esc(x)}</span>`).join('')}${titles.length > 3 ? `<span class="more">+${titles.length - 3} još</span>` : ''}</button>`;
  }).join('');
  return `${calHeader(`${cap(MONTHS[m - 1])} ${y}`)}<div class="mgrid">${WD.map(w => `<div class="wd">${w}</div>`).join('')}${'<div></div>'.repeat(mondayIndex(first))}${cells}</div>${dayPanel(S.ui.calDay)}`;
};
A.deskAddDay = el => openQuick({ date: el.dataset.d, project: 'none' });

// ----- Drag and drop: task rows and cards onto days, Today, Tomorrow, projects --
AFTER.push(() => {
  $('screen').classList.toggle('wide', R.tab === 'calendar' && !R.stack.length && S.ui.calView !== 'upcoming');
  for (const row of document.querySelectorAll('#screen .trow')) {
    const open = row.querySelector('[data-act="openTask"]');
    if (open) { row.draggable = true; row.dataset.drag = open.dataset.id; }
  }
  for (const el of document.querySelectorAll('[data-drag]')) el.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', el.dataset.drag); ev.dataTransfer.effectAllowed = 'move'; });
  for (const el of document.querySelectorAll('[data-drop-day], [data-drop-plan], [data-drop-project]')) {
    el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', ev => { ev.preventDefault(); el.classList.remove('drop'); dropTask(ev.dataTransfer.getData('text/plain'), el.dataset); });
  }
});
function dropTask(id, target) {
  const t = task(id);
  if (!t) return;
  const undo = snapshot(t);
  if (target.dropProject) { t.project = target.dropProject; t.area = null; t.inbox = false; render(); return toast(`U projekat „${project(t.project).name}“`, undo); }
  const day = target.dropDay || (target.dropPlan === 'today' ? TODAY : addDays(TODAY, 1));
  if (t.repeat && t.plan !== day) return askScope(t, scope => moveDate(t, 'plan', day, t.time, scope), undo);
  t.plan = day; t.inbox = false;
  render(); toast(`Planirano: ${relDay(day)}`, undo);
}

// ----- Settings: the desktop-only rows (M5) ----------------------------------
const settingsPhone = SUB.settings;
SUB.settings = () => settingsPhone().replace(/<p class="note">Na računaru[\s\S]*?<\/p>/, `<div class="glabel">Računar</div><div class="card">${navRow('deskShortcuts', SV('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h1M11 10h1M15 10h2M7 14h10"/>', 20), 'Prečice na tastaturi', { val: 'Q · / · Esc' })}<button class="prow" data-act="deskDensity"><span class="ico">${SV('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>', 20)}</span><span class="grow">Zbijeniji prikaz<span class="sub">Niži redovi u listama</span></span><span class="check ${S.settings.compact !== false ? 'on' : ''}">${S.settings.compact !== false ? IC.tickW : ''}</span></button></div>`);
A.deskShortcuts = () => openPick({ kind: 'choice', title: 'Prečice na tastaturi', current: null, options: [['Q', 'Novi zadatak (ili nova stavka ekrana)'], ['/', 'Pretraga'], ['[', 'Sakriva i prikazuje bočni meni'], ['← →', 'Kalendar: prethodna i sledeća nedelja ili mesec'], ['T', 'Kalendar: nazad na danas'], ['Esc', 'Zatvara prozor'], ['1–5', 'Danas, Inbox, Zadaci, Kalendar, Navike']].map(([v, l]) => ({ v, label: l, icon: `<kbd style="min-width:34px;text-align:center">${v}</kbd>` })), onPick: () => toast('Prečica se menja ovde, kao danas u Podešavanjima') });
A.deskDensity = () => { S.settings.compact = S.settings.compact === false; document.body.classList.toggle('desk', true); $('phone').classList.toggle('desk-roomy', S.settings.compact === false); render(); };

// ----- Keyboard -------------------------------------------------------------
document.addEventListener('keydown', ev => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
  if (ev.key === 'Escape') { if (P) closePick(); else if (W) { closeWin(); render(); } return; }
  if (typing || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === 'q' || ev.key === 'Q') { ev.preventDefault(); A.fab(); }
  else if (ev.key === '/') { ev.preventDefault(); A.search(); }
  else if (ev.key === '[') { ev.preventDefault(); A.sbMini(); }
  // Calendar (K10, decided 2026-10-09): arrows move the week or month, T goes back to today.
  else if (R.tab === 'calendar' && !R.stack.length && S.ui.calView !== 'upcoming' && ['ArrowLeft', 'ArrowRight'].includes(ev.key)) { ev.preventDefault(); A.calMove({ dataset: { d: ev.key === 'ArrowLeft' ? -1 : 1 } }); }
  else if (R.tab === 'calendar' && !R.stack.length && (ev.key === 't' || ev.key === 'T')) { ev.preventDefault(); A.calToday(); }
  else if (/^[1-5]$/.test(ev.key)) { closePick(); closeWin(); go(['today', 'inbox', 'tasks', 'calendar', 'habits'][Number(ev.key) - 1]); }
});
