// ===== Inbox (I1–I6) ========================================================
const KIND = { task: ['Zadaci', 'Zadatak'], note: ['Beleške', 'Beleška', 'note'], resource: ['Resursi', 'Resurs', 'link'], goal: ['Ciljevi', 'Cilj', 'goal'], habit: ['Navike', 'Navika', 'habit'] };
const CAPTURE = ['Danas', 'Juče', 'Ove nedelje', 'Ranije'];
function inboxRecords() {
  return [
    ...S.tasks.filter(t => t.inbox && !t.done).map(t => ({ type: 'task', id: t.id, title: t.title, group: t.captured || 'Danas', item: t })),
    ...S.inboxOther.filter(o => o.inbox).map(o => ({ type: o.type, id: o.id, title: o.t, group: o.g, item: o })),
  ];
}
function inboxCount() { return inboxRecords().length; }
const record = (type, id) => inboxRecords().find(r => r.type === type && r.id === id) || { type, id, item: type === 'task' ? task(id) : S.inboxOther.find(o => o.id === id) };

function inboxButtons(r, big = false) {
  const cls = big ? 'act' : 'chip sm';
  const b = (act, label, extra = '') => `<button class="${cls}${extra}" data-act="${act}" data-type="${r.type}" data-id="${r.id}">${label}</button>`;
  return r.type === 'task'
    ? b('ibToday', 'Danas') + b('ibTomorrow', 'Sutra') + b('ibLater', 'Kad stignem') + b('ibProject', 'Projekat…')
    : b('ibOpen', 'Otvori') + b('ibArea', 'Oblast…') + b('ibSorted', 'Razvrstano', big ? ' wide' : ' quiet');
}
function inboxRow(r) {
  const lead = r.type === 'task' ? '<span class="box"></span>' : `<span class="tico">${IC[KIND[r.type][2]]}</span>`;
  const meta = r.type === 'task' ? '' : `<div class="meta">${KIND[r.type][1]}${r.item.sub ? ` · ${esc(r.item.sub)}` : ''}</div>`;
  const open = r.type === 'task' ? `data-act="openTask" data-id="${r.id}"` : `data-act="ibOpen" data-type="${r.type}" data-id="${r.id}"`;
  return `<div class="item"><div class="irow">${lead}<button class="main" ${open}><div class="ttl">${esc(r.title)}</div>${meta}</button>${r.item.due ? `<span class="side">${dueLabel(r.item.due)}</span>` : ''}</div><div class="ichips">${inboxButtons(r)}</div></div>`;
}
TAB.inbox = () => {
  const all = inboxRecords();
  const types = Object.keys(KIND).filter(type => all.some(r => r.type === type));
  if (S.ui.inboxFilter !== 'all' && !types.includes(S.ui.inboxFilter)) S.ui.inboxFilter = 'all';
  const list = all.filter(r => S.ui.inboxFilter === 'all' || r.type === S.ui.inboxFilter);
  let html = `<div class="status"><span>09:41</span><span>•••</span></div><h1 class="h1">Inbox</h1><div class="summary">${all.length ? `${all.length} ${plural(all.length, 'stavka čeka', 'stavke čekaju', 'stavki čeka')} razvrstavanje` : 'Ništa ne čeka'}</div>`;
  if (!all.length) return html + `<div class="empty"><div class="ring">${IC.bigCheck}</div><strong>Inbox je prazan</strong>Sve je razvrstano.</div>`;
  html += `<button class="triage-btn" data-act="triageStart">${IC.sort}<span class="main" style="font-weight:600">Razvrstaj redom <span class="meta" style="font-weight:400;display:inline">· jednu po jednu</span></span>${IC.chev}</button>`;
  if (types.length > 1) html += `<div class="filters" role="tablist"><button role="tab" class="${S.ui.inboxFilter === 'all' ? 'on' : ''}" data-act="ibFilter" data-f="all">Sve ${all.length}</button>${types.map(type => `<button role="tab" class="${S.ui.inboxFilter === type ? 'on' : ''}" data-act="ibFilter" data-f="${type}">${KIND[type][0]} ${all.filter(r => r.type === type).length}</button>`).join('')}</div>`;
  for (const g of CAPTURE) {
    const rows = list.filter(r => r.group === g);
    if (rows.length) html += `<div class="section">${g} <span>· ${rows.length}</span></div><div class="card">${rows.map(inboxRow).join('')}</div>`;
  }
  return html;
};
A.ibFilter = el => { S.ui.inboxFilter = el.dataset.f; render(); };

// Every sorting action takes the item out of Inbox and offers Undo (I6).
function sortItem(r, change, text) {
  const undo = snapshot(r.item);
  change(r.item);
  r.item.inbox = false;
  if (W?.kind === 'triage') W.done = (W.done || 0) + 1;
  render();
  toast(text, () => { undo(); if (W?.kind === 'triage') W.done = Math.max(0, W.done - 1); });
}
const rec = el => record(el.dataset.type, el.dataset.id);
A.ibToday = el => sortItem(rec(el), t => { t.plan = TODAY; }, 'U Danas');
A.ibTomorrow = el => sortItem(rec(el), t => { t.plan = addDays(TODAY, 1); }, 'Planirano za sutra');
A.ibLater = el => sortItem(rec(el), () => {}, 'U „Kad stignem“');
A.ibSorted = el => sortItem(rec(el), () => {}, 'Razvrstano');
A.ibOpen = el => { const r = rec(el); toast(`Otvara: ${KIND[r.type][1].toLowerCase()} „${r.item.t}“`); };
A.ibProject = el => { const r = rec(el); openPick({ kind: 'project', current: null, sub: r.item.title, onPick: id => sortItem(r, t => { t.project = id; t.area = null; }, `U projekat „${project(id).name}“`) }); };
A.ibArea = el => { const r = rec(el); openPick({ kind: 'choice', title: 'Oblast', sub: r.item.t, current: r.item.area, options: S.areas.map(a => ({ v: a.id, label: a.name, dot: a.color })), onPick: v => sortItem(r, o => { o.area = v; }, `U oblast „${areaOf(v).name}“`) }); };

// "Razvrstaj redom": one item at a time (I2). Deleting stays in the task window.
A.triageStart = () => {
  const list = inboxRecords().filter(r => S.ui.inboxFilter === 'all' || r.type === S.ui.inboxFilter);
  openWin({ kind: 'triage', queue: list.map(r => [r.type, r.id]), qi: 0, done: 0 });
};
WIN.triage = w => {
  const open = w.queue.filter(([type, id]) => record(type, id).item.inbox);
  const head = winHead('Razvrstavanje');
  if (!open.length) return { head, body: `<div class="empty" style="padding:20px 0 6px"><div class="ring">${IC.bigCheck}</div><strong>Gotovo</strong>${inboxCount() ? 'Ova lista je razvrstana.' : 'Inbox je prazan.'}</div><button class="secondary" data-act="closeWin" style="margin-top:14px">Zatvori</button>` };
  if (w.qi >= open.length) w.qi = 0;
  const [type, id] = open[w.qi], r = record(type, id);
  return { head, body: `
    <div class="focus"><div class="meta" style="display:flex;gap:6px;align-items:center;margin:0 0 6px">${type === 'task' ? '' : IC[KIND[type][2]]}${KIND[type][1]} · dodato ${r.group.toLowerCase()}</div><div class="big">${esc(r.title)}</div>${r.item.due ? `<div class="meta" style="margin-top:6px">${dueLabel(r.item.due)}</div>` : ''}</div>
    <div class="actions">${inboxButtons(r, true)}</div>
    <div class="split" style="margin-top:6px"><span class="meta">${w.done + 1} od ${w.queue.length}</span><button class="ghost" data-act="triageSkip">Preskoči</button></div>` };
};
A.triageSkip = () => { W.qi++; renderWin(); };

// A generic single-choice sheet: a tap applies and closes (E3).
PICK.choice = p => ({ title: p.title, sub: p.sub, body: `<div class="card" style="margin-bottom:10px">${p.options.map((o, k) => `<button class="opt" data-act="choicePick" data-k="${k}">${o.dot ? `<span class="dot" style="background:${o.dot}"></span>` : o.icon || ''}<span class="lbl">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span><span class="radio ${p.current === o.v ? 'on' : ''}"></span></button>`).join('')}</div><p class="note" style="margin-top:0">Dodir odmah primenjuje izbor.</p>` });
A.choicePick = el => { const p = P, o = p.options[Number(el.dataset.k)]; closePick(); p.onPick(o.v); };
