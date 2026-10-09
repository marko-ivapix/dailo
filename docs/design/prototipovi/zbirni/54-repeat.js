// ===== Repeat editor: one editor for the task window (E7) and new recurring tasks
// Rule: freq daily | weekdays | weekly (days) | monthly (a day of the month, the last day,
// or the nth weekday) | yearly; interval; end. Today's app knows only daily/weekly/monthly + interval.
const ORD = { 1: ['prvog', 'prve', 'Prvi'], 2: ['drugog', 'druge', 'Drugi'], 3: ['trećeg', 'treće', 'Treći'], 4: ['četvrtog', 'četvrte', 'Četvrti'], '-1': ['poslednjeg', 'poslednje', 'Poslednji'] };
const WD_GEN = ['ponedeljka', 'utorka', 'srede', 'četvrtka', 'petka', 'subote', 'nedelje'];
const FEM = [2, 5, 6];
const MONTH_GEN = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
function normRepeat(r, start = TODAY) {
  const base = { freq: 'weekly', interval: 1, days: [], monthMode: 'day', monthDay: parse(start).getDate(), nth: 1, nthDay: mondayIndex(start), end: 'never', endDate: addDays(start, 90), count: 10 };
  const out = { ...base, ...(r || {}) };
  if (out.freq === 'weekdays') Object.assign(out, { freq: 'weekly', interval: 1, days: [0, 1, 2, 3, 4] });
  if (out.freq === 'weekly' && !out.days?.length) out.days = [mondayIndex(start)];
  return out;
}
const nthLabel = (r) => `${ORD[r.nth][FEM.includes(r.nthDay) ? 1 : 0]} ${WD_GEN[r.nthDay]}`;
// The sentence under the editor and on the task row ("Sredom i subotom", "Svakog 10. u mesecu" …).
function repeatText(r, start = TODAY) {
  if (!r) return 'Ne ponavlja se';
  r = normRepeat(r, start);
  const n = r.interval, every = n > 1 ? `Na ${plural(n, 'svaki', 'svaka', 'svakih')} ${n}` : '', everyF = `Na ${plural(n, 'svaku', 'svake', 'svakih')} ${n}`;
  let text;
  if (r.freq === 'daily') text = n > 1 ? `${every} ${plural(n, 'dan', 'dana', 'dana')}` : 'Svaki dan';
  else if (r.freq === 'weekdays') text = 'Radnim danima';
  else if (r.freq === 'weekly') {
    const d = [...r.days].sort((a, b) => a - b), names = d.join() === '0,1,2,3,4' ? 'radnim danima' : d.join() === '5,6' ? 'vikendom' : listWords(d.map(i => WDINSTR[i]));
    text = n > 1 ? `${everyF} ${plural(n, 'nedelju', 'nedelje', 'nedelja')}, ${names}` : cap(names);
  } else if (r.freq === 'monthly') {
    const which = r.monthMode === 'weekday' ? nthLabel(r) : r.monthDay === 'last' ? 'poslednjeg dana' : `${r.monthDay}.`;
    text = n > 1 ? `${every} ${plural(n, 'mesec', 'meseca', 'meseci')}, ${which} u mesecu` : `${r.monthMode === 'weekday' && FEM.includes(r.nthDay) ? 'Svake' : 'Svakog'} ${which} u mesecu`;
  } else {
    const d = parse(start);
    text = `${n > 1 ? `${everyF} ${plural(n, 'godinu', 'godine', 'godina')}` : 'Svake godine'}, ${d.getDate()}. ${MONTH_GEN[d.getMonth()]}`;
  }
  return text + (r.end === 'date' ? ` · do ${short(r.endDate)}` : r.end === 'count' ? ` · ${r.count} puta` : '');
}
function dayInMonth(y, m, r) {
  const last = new Date(y, m + 1, 0).getDate();
  if (r.monthMode !== 'weekday') return new Date(y, m, r.monthDay === 'last' ? last : Math.min(r.monthDay, last));
  if (r.nth === -1) { const d = new Date(y, m, last); while ((d.getDay() + 6) % 7 !== r.nthDay) d.setDate(d.getDate() - 1); return d; }
  const d = new Date(y, m, 1); while ((d.getDay() + 6) % 7 !== r.nthDay) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7 * (r.nth - 1)); return d;
}
// The first date on or after `start` that fits the rule.
function firstOccurrence(start, r) {
  r = normRepeat(r, start);
  if (r.freq === 'weekly') { let d = start; while (!r.days.includes(mondayIndex(d))) d = addDays(d, 1); return d; }
  if (r.freq === 'weekdays') { let d = start; while (mondayIndex(d) > 4) d = addDays(d, 1); return d; }
  if (r.freq === 'monthly') { const s = parse(start); let c = iso(dayInMonth(s.getFullYear(), s.getMonth(), r)); if (c < start) { const n = new Date(s.getFullYear(), s.getMonth() + 1, 1); c = iso(dayInMonth(n.getFullYear(), n.getMonth(), r)); } return c; }
  return start;
}
// The next date after `day` (used when a repeating task is completed).
function nextOccurrence(day, r) {
  r = normRepeat(r, day);
  if (r.freq === 'daily') return addDays(day, r.interval);
  if (r.freq === 'weekdays') { let d = addDays(day, 1); while (mondayIndex(d) > 4) d = addDays(d, 1); return d; }
  if (r.freq === 'weekly') {
    const days = [...r.days].sort((a, b) => a - b), wd = mondayIndex(day), later = days.find(x => x > wd);
    return later !== undefined ? addDays(day, later - wd) : addDays(day, 7 * r.interval - wd + days[0]);
  }
  const d = parse(day);
  if (r.freq === 'monthly') { const t = new Date(d.getFullYear(), d.getMonth() + r.interval, 1); return iso(dayInMonth(t.getFullYear(), t.getMonth(), r)); }
  const y = d.getFullYear() + r.interval, last = new Date(y, d.getMonth() + 1, 0).getDate();
  return iso(new Date(y, d.getMonth(), Math.min(d.getDate(), last)));
}
function upcomingDates(r, start, k = 3) {
  r = normRepeat(r, start);
  const out = [], max = r.end === 'count' ? Math.min(k, r.count) : k; let d = firstOccurrence(start, r);
  while (d < TODAY) d = nextOccurrence(d, r);
  while (out.length < max && !(r.end === 'date' && d > r.endDate)) { out.push(d); d = nextOccurrence(d, r); }
  return out;
}
nextDate = (day, r) => nextOccurrence(day, r);
// Completing respects the end: no next one after the end date or the last count.
const completeTaskBase = completeTask;
completeTask = t => {
  const res = completeTaskBase(t), n = res.next;
  if (!n) return res;
  const r = t.repeat, d = n.plan || n.due;
  if ((r.end === 'date' && d > r.endDate) || (r.end === 'count' && r.count <= 1)) { S.tasks.splice(S.tasks.indexOf(n), 1); return { next: null, undo: res.undo }; }
  if (r.end === 'count') n.repeat.count = r.count - 1;
  return res;
};

// The editor itself. It works in a picker (P.r) or in a window (W.r).
const repTarget = el => el.closest('#pick') ? { o: P, redraw: renderPick } : { o: W, redraw: renderWin };
function repeatEditor(r, start) {
  r = normRepeat(r, start);
  const sd = parse(start), wd = mondayIndex(start);
  const presets = [['Svaki dan', { freq: 'daily', interval: 1 }], ['Svake nedelje', { freq: 'weekly', interval: 1, days: [wd] }], ['Svakog meseca', { freq: 'monthly', interval: 1, monthMode: 'day', monthDay: sd.getDate() }], ['Na 3 meseca', { freq: 'monthly', interval: 3, monthMode: 'day', monthDay: sd.getDate() }], ['Svake godine', { freq: 'yearly', interval: 1 }]];
  const on = p => Object.entries(p).every(([k, v]) => JSON.stringify(r[k]) === JSON.stringify(v));
  const unit = { daily: ['dan', 'dana', 'dana'], weekly: ['nedelja', 'nedelje', 'nedelja'], monthly: ['mesec', 'meseca', 'meseci'], yearly: ['godina', 'godine', 'godina'] }[r.freq];
  let extra = '';
  if (r.freq === 'weekly') extra = `<div class="glabel" style="margin-top:2px">Dani</div><div class="wdays">${WD.map((d, i) => `<button class="${r.days.includes(i) ? 'on' : ''}" data-act="rxDay" data-i="${i}" aria-pressed="${r.days.includes(i)}" aria-label="${WDNAME[i]}">${d}</button>`).join('')}</div>`;
  if (r.freq === 'monthly') extra = `<div class="card" style="margin-bottom:10px">
      <div class="opt" role="radio" tabindex="0" aria-checked="${r.monthMode === 'day'}" data-act="rxMode" data-v="day"><span class="radio ${r.monthMode === 'day' ? 'on' : ''}"></span><span class="lbl">Dan u mesecu</span><span class="meta" style="margin:0">${r.monthDay === 'last' ? 'poslednji' : `${r.monthDay}.`}</span></div>
      ${r.monthMode === 'day' ? `<div style="padding:4px 10px 10px"><div class="grid7">${Array.from({ length: 31 }, (_, k) => `<button class="day ${r.monthDay === k + 1 ? 'sel' : ''}" data-act="rxMonthDay" data-v="${k + 1}"><span style="width:30px;height:30px;font-size:13px">${k + 1}</span></button>`).join('')}<button class="chip sm ${r.monthDay === 'last' ? 'on' : ''}" style="grid-column:span 4;justify-content:center;margin:4px" data-act="rxMonthDay" data-v="last">Poslednji dan</button></div>${typeof r.monthDay === 'number' && r.monthDay > 28 ? `<p class="note" style="margin:6px 2px 0">U kraćim mesecima pada na poslednji dan.</p>` : ''}</div>` : ''}
      <div class="opt" role="radio" tabindex="0" aria-checked="${r.monthMode === 'weekday'}" data-act="rxMode" data-v="weekday"><span class="radio ${r.monthMode === 'weekday' ? 'on' : ''}"></span><span class="lbl">Dan u nedelji</span><span class="meta" style="margin:0">${nthLabel(r)}</span></div>
      ${r.monthMode === 'weekday' ? `<div style="padding:4px 10px 10px"><div class="chips" style="margin-bottom:8px">${Object.keys(ORD).sort((a, b) => (a === '-1') - (b === '-1') || a - b).map(k => `<button class="chip sm ${String(r.nth) === k ? 'on' : ''}" data-act="rxNth" data-v="${k}">${ORD[k][2]}</button>`).join('')}</div><div class="wdays" style="margin:0">${WD.map((d, i) => `<button class="${r.nthDay === i ? 'on' : ''}" data-act="rxNthDay" data-i="${i}" aria-label="${WDNAME[i]}">${d}</button>`).join('')}</div></div>` : ''}</div>`;
  if (r.freq === 'yearly') extra = `<p class="note" style="margin-top:0">Datum je dan prvog puta: ${sd.getDate()}. ${MONTH_GEN[sd.getMonth()]}.</p>`;
  const dates = upcomingDates(r, start);
  return `<div class="chips">${presets.map(([l, p], k) => `<button class="chip sm ${on(p) ? 'on' : ''}" data-act="rxPreset" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="seg" style="margin-bottom:10px">${[['daily', 'Dnevno'], ['weekly', 'Nedeljno'], ['monthly', 'Mesečno'], ['yearly', 'Godišnje']].map(([v, l]) => `<button class="${r.freq === v ? 'on' : ''}" data-act="rxFreq" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="field"><span class="lbl">Razmak</span><span class="stepper"><button data-act="rxStep" data-d="-1" ${r.interval <= 1 ? 'disabled' : ''} aria-label="Manje">−</button><span>${r.interval}</span><button data-act="rxStep" data-d="1" aria-label="Više">+</button></span><span class="meta" style="margin:0;min-width:56px">${plural(r.interval, ...unit)}</span></div>
    ${extra}
    <p class="rxsum" style="margin:4px 4px 2px;font-weight:600">${repeatText(r, start)}</p>
    <p class="note" style="margin-top:0">${dates.length ? `Sledeći put: ${dates.map(d => `${WDNAME[mondayIndex(d)].slice(0, 3).toLowerCase()} ${short(d)}`).join(' · ')}` : 'Nema više ponavljanja.'}</p>
    <div class="glabel">Kraj</div><div class="card" style="margin-bottom:14px">
      <div class="opt" role="radio" tabindex="0" aria-checked="${r.end === 'never'}" data-act="rxEnd" data-v="never"><span class="radio ${r.end === 'never' ? 'on' : ''}"></span><span class="lbl">Nikad</span></div>
      <div class="opt" role="radio" tabindex="0" aria-checked="${r.end === 'date'}" data-act="rxEnd" data-v="date"><span class="radio ${r.end === 'date' ? 'on' : ''}"></span><span class="lbl">Na datum</span>${r.end === 'date' ? `<input type="date" value="${r.endDate}" data-ch="rxEndDate" style="background:#1F232A;border:1px solid #2C3139;border-radius:8px;padding:6px;color-scheme:dark">` : ''}</div>
      <div class="opt" role="radio" tabindex="0" aria-checked="${r.end === 'count'}" data-act="rxEnd" data-v="count"><span class="radio ${r.end === 'count' ? 'on' : ''}"></span><span class="lbl">Posle broja ponavljanja</span>${r.end === 'count' ? `<input type="number" min="1" value="${r.count}" data-ch="rxCount" style="width:64px;background:#1F232A;border:1px solid #2C3139;border-radius:8px;padding:6px">` : ''}</div></div>`;
}
const rx = (el, fn) => { const { o, redraw } = repTarget(el); o.r = normRepeat(o.r, o.start || TODAY); fn(o.r, o); redraw(); };
A.rxPreset = el => rx(el, (r, o) => { const sd = parse(o.start), p = [{ freq: 'daily', interval: 1 }, { freq: 'weekly', interval: 1, days: [mondayIndex(o.start)] }, { freq: 'monthly', interval: 1, monthMode: 'day', monthDay: sd.getDate() }, { freq: 'monthly', interval: 3, monthMode: 'day', monthDay: sd.getDate() }, { freq: 'yearly', interval: 1 }][Number(el.dataset.k)]; Object.assign(r, p); });
A.rxFreq = el => rx(el, r => { r.freq = el.dataset.v; r.interval = 1; });
A.rxStep = el => rx(el, r => { r.interval = Math.max(1, r.interval + Number(el.dataset.d)); });
A.rxDay = el => rx(el, r => { const i = Number(el.dataset.i); r.days = r.days.includes(i) ? (r.days.length > 1 ? r.days.filter(x => x !== i) : r.days) : [...r.days, i].sort((a, b) => a - b); });
A.rxMode = (el, ev) => { if (ev.target.closest('button') && ev.target.closest('button') !== el) return; rx(el, r => { r.monthMode = el.dataset.v; }); };
A.rxMonthDay = el => rx(el, r => { r.monthDay = el.dataset.v === 'last' ? 'last' : Number(el.dataset.v); });
A.rxNth = el => rx(el, r => { r.nth = Number(el.dataset.v); });
A.rxNthDay = el => rx(el, r => { r.nthDay = Number(el.dataset.i); });
A.rxEnd = (el, ev) => { if (ev.target.tagName === 'INPUT') return; rx(el, r => { r.end = el.dataset.v; }); };
CH.rxEndDate = el => rx(el, r => { if (el.value) r.endDate = el.value; });
CH.rxCount = el => rx(el, r => { r.count = Math.max(1, Number(el.value) || 1); });

// The task window's repeat sheet uses the editor.
PICK.repeat = p => ({ title: 'Ponavljanje', sub: task(W.id).title, body: `${repeatEditor(p.r, p.start)}<div class="split"><button class="ghost" data-act="rxClear">Ne ponavlja se</button><button class="primary" data-act="rxApply">Primeni</button></div>` });
A.rxClear = () => { task(W.id).repeat = null; closePick(); render(); toast('Sačuvano'); };
A.rxApply = () => { const t = task(W.id); t.repeat = JSON.parse(JSON.stringify(normRepeat(P.r, P.start))); closePick(); render(); toast('Sačuvano'); };

// New recurring task: name, group, first time, then the same editor.
A.newChore = el => openWin({ kind: 'chore', title: '', room: el?.dataset?.room || S.rooms[0]?.id, start: TODAY, r: normRepeat({ freq: 'weekly', interval: 1, days: [mondayIndex(TODAY)] }), err: '' });
WIN.chore = w => ({
  tall: true,
  head: winHead('Nova redovna obaveza'),
  body: `<input class="bigtitle" placeholder="Usisaj, plati račun, promeni ulje…" value="${esc(w.title)}" data-in="chTitle" aria-label="Obaveza">${w.err ? `<p class="err">${w.err}</p>` : ''}
    <div class="glabel" style="margin-top:6px">Grupa</div><div class="chips">${S.rooms.map(r => `<button class="chip sm ${w.room === r.id ? 'on' : ''}" data-act="chRoom" data-v="${r.id}">${esc(r.name)}</button>`).join('')}</div>
    <div class="glabel" style="margin-top:0">Počinje</div><div class="chips">${[['Danas', TODAY], ['Sutra', addDays(TODAY, 1)], ['Sledeće nedelje', nextMonday()]].map(([l, d]) => `<button class="chip sm ${w.start === d ? 'on' : ''}" data-act="chDate" data-v="${d}">${l}</button>`).join('')}<input type="date" value="${w.start}" data-ch="chStart" aria-label="Datum početka" style="background:#1F232A;border:1px solid #2C3139;border-radius:9px;padding:5px 8px;color-scheme:dark"></div>
    <div class="glabel" style="margin-top:0">Ponavljanje</div>${repeatEditor(w.r, w.start)}`,
  foot: '<button class="primary" data-act="chCreate">Zakaži obavezu</button>',
});
IN.chTitle = el => { W.title = el.value; };
A.chRoom = el => { W.room = el.dataset.v; renderWin(); };
A.chDate = el => { W.start = el.dataset.v; renderWin(); };
CH.chStart = el => { if (el.value) { W.start = el.value; renderWin(); } };
A.chCreate = () => {
  if (!W.title.trim()) { W.err = 'Unesi obavezu.'; return renderWin(); }
  const r = JSON.parse(JSON.stringify(normRepeat(W.r, W.start))), first = firstOccurrence(W.start, r);
  S.tasks.push(T(W.title.trim(), { room: W.room, area: 'a2', plan: first, due: first, repeat: r }));
  closeWin(); render(); toast(`Zakazano · prvi put ${relDay(first).toLowerCase()}`);
};
