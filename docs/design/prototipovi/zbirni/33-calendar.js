// ===== Kalendar (C1–C9) =====================================================
function dayItems(day) {
  const tasks = S.tasks.filter(t => !t.inbox && !t.done && (t.plan === day || (!t.plan && t.due === day)));
  return {
    timed: tasks.filter(t => t.plan === day && t.time).sort(byTime),
    untimed: tasks.filter(t => !(t.plan === day && t.time)),
    deadlines: deadlinesOn(day),
  };
}
const hasItems = day => { const d = dayItems(day); return d.timed.length + d.untimed.length + d.deadlines.length > 0; };
function cday(day, { strip = false } = {}) {
  const d = parse(day);
  return `<button class="cday ${day === S.ui.calDay ? 'sel' : ''} ${day === TODAY ? 'today' : ''}" data-act="calPick" data-d="${day}" aria-label="${longDate(day)}" ${day === S.ui.calDay ? 'aria-current="date"' : ''}>${strip ? `<small class="wl">${WD[mondayIndex(day)]}</small>` : ''}<span>${d.getDate()}</span><i class="${hasItems(day) ? '' : 'none'}"></i></button>`;
}
TAB.calendar = () => {
  const v = S.ui.calView;
  let html = `<div class="status"><span>09:41</span><span>•••</span></div><h1 class="h1" style="margin-bottom:10px">Kalendar</h1>
    <div class="seg" role="tablist">${[['week', 'Nedelja'], ['month', 'Mesec'], ['upcoming', 'Predstojeće']].map(([k, l]) => `<button role="tab" class="${v === k ? 'on' : ''}" data-act="calView" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (v === 'upcoming') return html + upcoming();
  if (v === 'week') {
    const start = S.ui.calWeek, end = addDays(start, 6), a = parse(start), b = parse(end);
    const label = a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()}. ${SHORT[a.getMonth()]} ${a.getFullYear()}` : `${short(start)} – ${short(end)}`;
    html += `<div class="monthbar"><strong>${label}</strong><span class="arrows"><button data-act="calMove" data-d="-1" aria-label="Prethodna nedelja">${IC.left}</button><button data-act="calMove" data-d="1" aria-label="Sledeća nedelja">${IC.right}</button></span></div>
      <div class="grid7 wstrip">${Array.from({ length: 7 }, (_, i) => cday(addDays(start, i), { strip: true })).join('')}</div>`;
  } else {
    const [y, m] = S.ui.calMonth.split('-').map(Number);
    const first = `${S.ui.calMonth}-01`, count = new Date(y, m, 0).getDate();
    html += `<div class="monthbar"><strong>${cap(MONTHS[m - 1])} ${y}</strong><span class="arrows"><button data-act="calMove" data-d="-1" aria-label="Prethodni mesec">${IC.left}</button><button data-act="calMove" data-d="1" aria-label="Sledeći mesec">${IC.right}</button></span></div>
      <div class="grid7">${WD.map(w => `<div class="wd">${w}</div>`).join('')}${'<div></div>'.repeat(mondayIndex(first))}${Array.from({ length: count }, (_, i) => cday(addDays(first, i))).join('')}</div>`;
  }
  return html + dayPanel(S.ui.calDay);
};
function dayPanel(day) {
  const items = dayItems(day), mode = S.ui.dayMode;
  let html = `<div class="dayhead"><strong>${longDate(day)}</strong><span class="seg sm">${[['list', 'Lista'], ['schedule', 'Raspored']].map(([k, l]) => `<button class="${mode === k ? 'on' : ''}" data-act="dayMode" data-v="${k}">${l}</button>`).join('')}</span></div>`;
  if (mode === 'list') {
    const rows = [...items.timed.map(t => taskRow(t)), ...items.deadlines.map(deadlineRow), ...items.untimed.map(t => taskRow(t))];
    return html + (rows.length ? `<div class="card">${rows.join('')}</div>` : '<div class="card"><p class="note" style="margin:12px 14px">Nema zadataka za ovaj dan. „+“ dodaje zadatak za ovaj dan.</p></div>');
  }
  // Raspored (C6): capacity, untimed tasks above, timed blocks on the hour grid.
  const planned = S.tasks.filter(t => !t.inbox && !t.done && t.plan === day);
  const minutes = planned.reduce((sum, t) => sum + (t.duration || 0), 0), capMin = S.settings.capacity;
  const pct = capMin ? Math.min(100, Math.round(minutes / capMin * 100)) : 0, over = capMin && minutes > capMin;
  html += capMin ? `<div class="cap"><b>Planirano ${durLabel(minutes) || '0 min'}</b> od ${durLabel(capMin)}${over ? ' · <span class="amber">preko kapaciteta</span>' : ''}<div class="bar"><span style="width:${pct}%;background:${over ? 'var(--amber)' : 'var(--green)'}"></span></div></div>` : '';
  const untimed = [...items.untimed, ...items.deadlines.map(x => ({ deadline: x }))];
  if (untimed.length) html += `<div class="untimed">${untimed.map(x => x.deadline ? `<button class="chip sm" data-act="openGoal" data-id="${x.deadline.g.id}">${IC.goal.replace('width="20" height="20"', 'width="14" height="14"')}${esc(x.deadline.m ? x.deadline.m.t : x.deadline.g.title)}</button>` : `<button class="chip sm" data-act="openTask" data-id="${x.id}">${esc(x.title)} <span class="meta" style="margin:0">· bez vremena</span></button>`).join('')}</div>`;
  const H0 = 8, H1 = 21;
  html += `<div class="hours">${Array.from({ length: H1 - H0 }, (_, k) => `<div class="h">${String(H0 + k).padStart(2, '0')}:00</div>`).join('')}`;
  for (const t of items.timed) {
    const [hh, mm] = t.time.split(':').map(Number), dur = t.duration || 30;
    const top = (hh - H0 + mm / 60) * 40, height = Math.max(26, dur / 60 * 40);
    const end = new Date(2026, 0, 1, hh, mm + dur);
    if (hh >= H0 && hh < H1) html += `<button class="blk" data-act="openTask" data-id="${t.id}" style="top:${top}px;height:${height}px">${esc(t.title)}<small>${t.time}–${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}</small></button>`;
  }
  return html + '</div>';
}
function upcoming() {
  let html = '';
  for (let k = 1; k <= 21; k++) {
    const day = addDays(TODAY, k), items = dayItems(day);
    const rows = [...items.timed.map(t => taskRow(t)), ...items.deadlines.map(deadlineRow), ...items.untimed.map(t => taskRow(t))];
    if (rows.length) html += `<div class="section">${k === 1 ? 'Sutra' : WDNAME[mondayIndex(day)]} <span>· ${short(day)}</span></div><div class="card">${rows.join('')}</div>`;
  }
  return html || '<div class="empty"><strong>Ništa u narednim danima</strong></div>';
}
A.calView = el => { S.ui.calView = el.dataset.v; S.ui.calWeek = addDays(S.ui.calDay, -mondayIndex(S.ui.calDay)); S.ui.calMonth = S.ui.calDay.slice(0, 7); render(); };
A.calPick = el => { S.ui.calDay = el.dataset.d; render(); };
A.dayMode = el => { S.ui.dayMode = el.dataset.v; render(); };
A.calMove = el => {
  const d = Number(el.dataset.d);
  if (S.ui.calView === 'week') {
    S.ui.calWeek = addDays(S.ui.calWeek, 7 * d);
    S.ui.calDay = addDays(S.ui.calDay, 7 * d);
  } else {
    const [y, m] = S.ui.calMonth.split('-').map(Number), next = new Date(y, m - 1 + d, 1);
    S.ui.calMonth = iso(next).slice(0, 7);
    S.ui.calDay = TODAY.startsWith(S.ui.calMonth) ? TODAY : `${S.ui.calMonth}-01`;
    S.ui.calWeek = addDays(S.ui.calDay, -mondayIndex(S.ui.calDay));
  }
  render();
};
