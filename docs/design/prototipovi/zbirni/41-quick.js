// ===== Quick Add (Q1–Q3) ====================================================
// The parser follows V1.10: plan day, time, #tag, !priority and +project in the title.
// Matching ignores case and diacritics, so "+kuc" finds "Kućni poslovi".
const plain = v => v.toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const DAYWORDS = { ponedeljak: 0, utorak: 1, sredu: 2, sreda: 2, četvrtak: 3, petak: 4, subotu: 5, subota: 5, nedelju: 6, nedelja: 6 };
function parseQuick(text) {
  const out = { date: null, time: null, tags: [], priority: null, project: null, parts: [] };
  const keep = [];
  const words = text.split(/\s+/).filter(Boolean);
  for (let k = 0; k < words.length; k++) {
    const w = words[k], lw = w.toLowerCase();
    if (lw === 'danas' || lw === 'sutra' || lw === 'prekosutra') { out.date = addDays(TODAY, { danas: 0, sutra: 1, prekosutra: 2 }[lw]); continue; }
    if (lw === 'u' && words[k + 1] && (/^\d{1,2}(:\d{2})?$/.test(words[k + 1]) || DAYWORDS[words[k + 1].toLowerCase()] !== undefined)) continue;
    if (DAYWORDS[lw] !== undefined) { const diff = (DAYWORDS[lw] - mondayIndex(TODAY) + 7) % 7 || 7; out.date = addDays(TODAY, diff); continue; }
    if (/^\d{1,2}(:\d{2})?$/.test(w) && words[k - 1]?.toLowerCase() === 'u' || /^\d{1,2}:\d{2}$/.test(w)) { const [h, m = '00'] = w.split(':'); if (Number(h) < 24) { out.time = `${h.padStart(2, '0')}:${m}`; continue; } }
    if (/^#\S+/.test(w)) { const name = w.slice(1); out.tags.push(S.tags.find(t => t.name.toLowerCase() === name.toLowerCase())?.name || name); continue; }
    if (/^!(visok|srednji|nizak|[123])$/i.test(w)) { out.priority = { visok: 'high', srednji: 'medium', nizak: 'low', 1: 'high', 2: 'medium', 3: 'low' }[lw.slice(1)]; continue; }
    if (/^\+\S+/.test(w)) { const q = plain(w.slice(1)); const p = activeProjects().find(x => plain(x.name).replace(/\s+/g, '').startsWith(q)); if (p) { out.project = p.id; continue; } }
    keep.push(w);
  }
  out.title = keep.join(' ');
  if (out.date) out.parts.push(relDay(out.date));
  if (out.time) out.parts.push(out.time);
  out.tags.forEach(t => out.parts.push(`#${t}`));
  if (out.project) out.parts.push(`+${project(out.project).name}`);
  if (out.priority) out.parts.push(`${PRI_NAME[out.priority]} prioritet`);
  return out;
}
function openQuick({ date = null, project: proj = 'inbox', area = null } = {}) { openWin({ kind: 'quick', text: '', date, time: null, project: proj, area, datePicked: false, projectPicked: false, err: '' }); setTimeout(() => $('qText')?.focus(), 0); }
function quickEffective(w) {
  const p = parseQuick(w.text);
  return { p, date: w.datePicked ? w.date : (p.date ?? w.date), time: w.datePicked ? w.time : (p.time ?? w.time), project: w.projectPicked ? w.project : (p.project ?? w.project) };
}
const quickPlace = v => v === 'inbox' ? 'Inbox' : v === 'none' ? (W?.area ? `Bez projekta · ${areaOf(W.area).name}` : 'Bez projekta') : project(v).name;
function quickPreview(w) {
  const { p } = quickEffective(w);
  return p.parts.length ? `Prepoznato u naslovu: <b>${p.parts.map(esc).join(' · ')}</b>` : '';
}
WIN.quick = w => {
  const e = quickEffective(w);
  return {
    head: winHead('Novi zadatak'),
    body: `<input id="qText" class="bigtitle" placeholder="Šta treba uraditi?" value="${esc(w.text)}" data-in="qText" aria-label="Naslov zadatka">
      <div class="qprev" id="qPrev">${quickPreview(w)}</div>${w.err ? `<p class="err">${w.err}</p>` : ''}
      <div class="qsel"><button data-act="qDate">${IC.cal}<span>${e.date ? dateTime(e.date, e.time) : 'Bez datuma'}</span>${IC.chev}</button><button data-act="qProject">${IC.folder}<span>${esc(quickPlace(e.project))}</span>${IC.chev}</button></div>
      <button class="more" data-act="qMore" style="padding-top:0">Više opcija <span style="display:inline-flex;gap:4px;align-items:center">Rok, podsetnik, oznake${IC.chev}</span></button>`,
    foot: '<button class="primary" data-act="qAdd">Dodaj zadatak</button>',
  };
};
// The preview updates while typing, without redrawing the field.
IN.qText = el => { W.text = el.value; $('qPrev').innerHTML = quickPreview(W); };
A.qDate = () => { const e = quickEffective(W); openDate({ mode: 'quick', date: e.date, time: e.time }); };
A.qProject = () => { const e = quickEffective(W); openPick({ kind: 'choice', title: 'Gde ide zadatak', current: e.project, options: [{ v: 'inbox', label: 'Inbox', icon: IC.tray, sub: 'Razvrstaćeš ga kasnije' }, { v: 'none', label: 'Bez projekta' }, ...activeProjects().map(p => ({ v: p.id, label: p.name, dot: p.color, sub: `Oblast: ${areaOf(p.area).name}` }))], onPick: v => { W.project = v; W.projectPicked = true; renderWin(); } }); };
function quickCreate() {
  const e = quickEffective(W);
  if (!e.p.title.trim()) { W.err = 'Upiši naziv zadatka.'; renderWin(); return null; }
  const tags = e.p.tags.map(name => { let tg = S.tags.find(x => x.name.toLowerCase() === name.toLowerCase()); if (!tg) { tg = { id: newId('tag'), name, color: '#8FA2FF' }; S.tags.push(tg); } return tg.id; });
  const proj = !['inbox', 'none'].includes(e.project) ? e.project : null;
  const t = T(e.p.title.trim(), { plan: e.date, time: e.date ? e.time : null, project: proj, area: proj ? null : W.area || null, tags, priority: e.p.priority || 'none', inbox: !e.date && e.project === 'inbox', captured: 'Danas' });
  S.tasks.push(t);
  return t;
}
A.qAdd = () => {
  const t = quickCreate();
  if (!t) return;
  closeWin(); render();
  toast(t.inbox ? 'Dodato u Inbox' : t.plan === TODAY ? 'Dodato u Danas' : t.plan ? `Planirano: ${relDay(t.plan)}` : t.project ? `U projekat „${project(t.project).name}“` : 'U „Kad stignem“', () => { S.tasks.splice(S.tasks.indexOf(t), 1); });
};
// "Više opcija" saves the task and opens the full task window.
A.qMore = () => { const t = quickCreate(); if (!t) return; render(); W = { kind: 'task', id: t.id }; renderWin(); };

// ===== Floating "+" (G2): adds what belongs to the screen ==================
A.fab = () => {
  const top = R.stack.at(-1);
  if (R.tab === 'today') return openQuick({ date: TODAY, project: 'none' });
  if (R.tab === 'tasks') return openQuick({ date: null, project: top?.type === 'project' ? (top.id === 'none' ? 'none' : top.id) : 'none' });
  if (R.tab === 'calendar') return openQuick({ date: S.ui.calDay, project: 'none' });
  if (R.tab === 'habits') return openNewHabit();
  if (R.tab === 'more' && top?.type === 'goals') return openWin(freshGoal());
  return openQuick({ date: null, project: 'inbox' });
};
