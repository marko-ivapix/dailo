// ===== Zadaci (Z1–Z7) =======================================================
// Suggestions keep today's four reasons; overdue tasks stay in Today's "Zakasnelo".
function suggestions() {
  const out = [];
  for (const t of liveTasks()) {
    if (t.plan === TODAY || (t.due && t.due < TODAY)) continue;
    let r = null;
    if (t.due === TODAY) r = [0, 'Rok danas'];
    else if (t.plan && t.plan < TODAY) r = [1, `Propušten plan ${short(t.plan)}`];
    else if (t.due && daysTo(t.due) === 1) r = [2, 'Rok sutra'];
    else if (t.due && daysTo(t.due) > 1 && daysTo(t.due) <= 7) r = [3, `Rok ${short(t.due)}`];
    if (r) out.push({ t, rank: r[0], why: r[1] });
  }
  return out.sort((a, b) => a.rank - b.rank);
}
const projectTasks = id => S.tasks.filter(t => !t.inbox && (id === 'none' ? !t.project && !t.room : t.project === id));
const openCount = n => `${n} ${plural(n, 'otvoren', 'otvorena', 'otvorenih')}`;

TAB.tasks = () => {
  const live = liveTasks(), later = live.filter(t => !t.plan), sugg = suggestions();
  let html = `<div class="status"><span>09:41</span><span>•••</span></div>
    <div class="titlebar"><h1 class="h1">Zadaci</h1><button class="icon-btn" data-act="search" aria-label="Pretraga">${IC.search}</button></div>
    <div class="summary">${openCount(live.length)} · ${activeProjects().length} ${plural(activeProjects().length, 'projekat', 'projekta', 'projekata')}</div>`;
  if (sugg.length) {
    html += `<div class="card" style="margin-bottom:12px"><button class="sugg-head" data-act="suggToggle" aria-expanded="${S.ui.suggOpen}">${IC.sparkle}<span class="main" style="font-weight:600">Predlozi za danas</span><span class="count">${sugg.length}</span>${IC.fold(S.ui.suggOpen)}</button>`;
    if (S.ui.suggOpen) html += sugg.map(x => `<div class="srow"><button class="main" data-act="openTask" data-id="${x.t.id}"><div class="ttl">${esc(x.t.title)}</div><div class="meta">${x.why} · ${esc(placeName(x.t) || 'Bez projekta')}</div></button><button class="plan" data-act="planToday" data-id="${x.t.id}">+ Danas</button></div>`).join('') + '<button class="addall" data-act="planAll">Dodaj sve u Danas</button>';
    html += '</div>';
  }
  html += `<div class="seg" role="tablist"><button role="tab" class="${S.ui.zadView === 'anytime' ? 'on' : ''}" data-act="zadView" data-v="anytime">Kad stignem · ${later.length}</button><button role="tab" class="${S.ui.zadView === 'projects' ? 'on' : ''}" data-act="zadView" data-v="projects">Projekti</button></div>`;
  if (S.ui.zadView === 'anytime') {
    html += '<p class="note" style="margin:12px 4px 0">Razvrstani zadaci bez planiranog dana, po projektima.</p>';
    for (const [id, name, color] of [['none', 'Bez projekta', null], ...activeProjects().map(p => [p.id, p.name, p.color])]) {
      const rows = later.filter(t => (id === 'none' ? !t.project : t.project === id));
      if (rows.length) html += `<div class="section">${color ? `<span class="dot" style="background:${color}"></span>` : ''}${esc(name)} <span>· ${rows.length}</span></div><div class="card">${rows.map(t => taskRow(t, { meta: id === 'none' ? 'area' : 'none' })).join('')}</div>`;
    }
    if (!later.length) html += '<div class="empty"><strong>Ništa ne čeka</strong>Zadaci bez plana pojavljuju se ovde.</div>';
  } else {
    const loose = projectTasks('none').filter(t => !t.done);
    html += `<div class="card" style="margin-top:12px"><button class="prj" data-act="openProject" data-id="none"><span style="color:var(--muted);width:18px;display:grid;place-items:center">${IC.tray}</span><span class="main"><div class="ttl">Bez projekta</div><div class="meta">${openCount(loose.length)}</div></span>${IC.chev}</button></div>`;
    for (const a of activeAreas()) {
      const list = activeProjects().filter(p => p.area === a.id);
      if (list.length) html += `<div class="section">${esc(a.name)} <span>· ${list.length}</span></div><div class="card">${list.map(projectRow).join('')}</div>`;
    }
    html += '<div class="card" style="margin-top:12px"><button class="addrow" data-act="newProject">＋ Novi projekat</button></div>';
  }
  return html;
};
function projectRow(p) {
  const all = projectTasks(p.id), open = all.filter(t => !t.done);
  const pct = all.length ? Math.round((all.length - open.length) / all.length * 100) : 0;
  const next = open.filter(t => t.due).sort((a, b) => a.due.localeCompare(b.due))[0];
  return `<button class="prj" data-act="openProject" data-id="${p.id}"><span class="dot" style="background:${p.color}"></span><span class="main"><div class="ttl">${esc(p.name)}</div><div class="meta">${openCount(open.length)}${next ? ` · ${dueLabel(next.due)}` : ''}</div><span class="track"><i style="width:${pct}%;background:${p.color}"></i></span></span>${IC.chev}</button>`;
}
A.suggToggle = () => { S.ui.suggOpen = !S.ui.suggOpen; render(); };
A.zadView = el => { S.ui.zadView = el.dataset.v; render(); };
A.planToday = el => { const t = task(el.dataset.id), undo = snapshot(t); t.plan = TODAY; render(); toast('Dodato u Danas', undo); };
A.planAll = () => { const list = suggestions().map(x => x.t), undos = list.map(snapshot); list.forEach(t => { t.plan = TODAY; }); render(); toast(`Dodato u Danas: ${list.length}`, () => undos.forEach(u => u())); };
A.openProject = el => push({ type: 'project', id: el.dataset.id });

SUB.project = ({ id }) => {
  const p = id === 'none' ? null : project(id);
  const all = projectTasks(id), open = all.filter(t => !t.done).sort((a, b) => String(a.plan || '9999').localeCompare(String(b.plan || '9999')) || byTime(a, b)), done = all.filter(t => t.done);
  const g = p?.goal ? goal(p.goal) : null;
  let html = `<div class="status"><span>09:41</span><span>•••</span></div>
    <div class="titlebar">${backBtn()}${p ? `<button class="icon-btn" data-act="projectMenu" data-id="${p.id}" aria-label="Radnje projekta">${IC.dots}</button>` : ''}</div>
    <h1 class="h1" style="display:flex;align-items:center;gap:10px">${p ? `<span class="dot" style="background:${p.color};width:12px;height:12px"></span>` : ''}${esc(p ? p.name : 'Bez projekta')}</h1>
    <div class="summary" style="margin-bottom:4px">${p ? `${esc(areaOf(p.area).name)} · ` : ''}${openCount(open.length)}${done.length ? ` · ${done.length} ${plural(done.length, 'završen', 'završena', 'završenih')}` : ''}</div>
    ${g ? `<button class="plink" data-act="openGoal" data-id="${g.id}">${IC.goal}Cilj: ${esc(g.title)} · ${progress(g).pct}%</button>` : ''}
    <div class="card" style="margin-top:10px">${open.map(t => taskRow(t, { meta: p ? 'project' : 'plan' })).join('')}<button class="addrow" data-act="quickProject" data-id="${id}">＋ Dodaj zadatak</button></div>`;
  if (done.length) {
    html += `<button class="collapsed" data-act="projDone">${IC.fold(S.ui.projDone)}Završeno · ${done.length}</button>`;
    if (S.ui.projDone) html += `<div class="card" style="margin-top:8px">${done.map(t => taskRow(t, { meta: 'none' })).join('')}</div>`;
  }
  if (!p) html += '<p class="note">Razvrstani zadaci koji ne pripadaju nijednom projektu.</p>';
  return html;
};
A.projDone = () => { S.ui.projDone = !S.ui.projDone; render(); };
A.quickProject = el => openQuick({ project: el.dataset.id === 'none' ? 'none' : el.dataset.id, date: null });
A.projectMenu = el => openPick({ kind: 'choice', title: project(el.dataset.id).name, current: null, options: ['Preimenuj i boja', 'Oblast', 'Povezani cilj', 'Sačuvaj kao šablon', 'Arhiviraj projekat', 'Obriši projekat'].map(l => ({ v: l, label: l })), onPick: v => toast(`${v}: isti mali prozor kao ostali`) });

// New project: name, color and area; a tap on "Napravi projekat" adds it.
const COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
A.newProject = () => openPick({ kind: 'newProject', name: '', color: COLORS[4], area: 'a1' });
PICK.newProject = p => ({ title: 'Novi projekat', body: `
  <label class="field"><input class="wide" placeholder="Naziv projekta" value="${esc(p.name)}" data-in="npName" aria-label="Naziv projekta"></label>
  <div class="glabel" style="margin-top:4px">Boja</div><div class="chips">${COLORS.map(c => `<button class="chip ${p.color === c ? 'on' : ''}" data-act="npColor" data-c="${c}" aria-label="Boja ${c}"><span class="dot" style="background:${c}"></span></button>`).join('')}</div>
  <div class="glabel" style="margin-top:4px">Oblast</div><div class="seg" style="margin-bottom:14px">${activeAreas().map(a => `<button class="${p.area === a.id ? 'on' : ''}" data-act="npArea" data-a="${a.id}">${a.name}</button>`).join('')}</div>
  ${p.err ? `<p class="err">${p.err}</p>` : ''}<button class="primary" data-act="npCreate">Napravi projekat</button>` });
IN.npName = el => { P.name = el.value; };
A.npColor = el => { P.color = el.dataset.c; renderPick(); };
A.npArea = el => { P.area = el.dataset.a; renderPick(); };
A.npCreate = () => {
  if (!P.name.trim()) { P.err = 'Upiši naziv projekta.'; return renderPick(); }
  const p = { id: newId('p'), name: P.name.trim(), area: P.area, color: P.color };
  S.projects.push(p); closePick(); render(); toast(`Projekat „${p.name}“ je napravljen`);
};
