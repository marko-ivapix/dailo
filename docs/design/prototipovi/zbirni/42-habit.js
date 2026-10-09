// ===== New habit (N1–N6) ====================================================
function openNewHabit() {
  openWin({ kind: 'newHabit', name: '', area: null, routine: '1', tracking: 'checkbox', target: 2, unit: 'l', freq: { type: 'daily', weekdays: [0, 1, 2, 3, 4], perWeek: 4, everyN: 2, start: TODAY }, reminders: [], more: true, end: 'never', err: '' });
}
function freqLabel(f) {
  if (f.type === 'daily') return 'Svaki dan';
  if (f.type === 'weekdays') { const d = [...f.weekdays].sort(); return d.length === 7 ? 'Svaki dan' : d.join() === '0,1,2,3,4' ? 'Radnim danima' : d.join() === '5,6' ? 'Vikendom' : cap(listWords(d.map(i => WDINSTR[i]))); }
  if (f.type === 'perWeek') return f.perWeek === 1 ? 'Jednom nedeljno' : `${f.perWeek} puta nedeljno`;
  return f.everyN === 2 ? 'Svaki drugi dan' : `Na ${plural(f.everyN, 'svaki', 'svaka', 'svakih')} ${f.everyN} dana`;
}
const habitStartLabel = s => s === TODAY ? 'Danas' : relDay(s);
WIN.newHabit = w => {
  const numeric = w.tracking === 'numeric', targets = numeric || w.freq.type === 'perWeek';
  const same = 'data-msg="Isti prozor kao u prototipu „Nova navika“"';
  return {
    tall: true, head: winHead('Nova navika'),
    body: `<input class="bigtitle" placeholder="Šta želiš da vežbaš?" value="${esc(w.name)}" data-in="nhName" aria-label="Naziv navike">${w.err ? `<p class="err">${w.err}</p>` : ''}
      <div class="card" style="margin-top:8px">
        ${prow('nhArea', IC.person, 'Oblast', areaOf(w.area)?.name, 'Bez oblasti (opciono)')}
        <div class="block"><div class="lbl">${IC.routine}Rutina</div>${seg('routine', [['0', 'Jutro'], ['1', 'Dan'], ['2', 'Veče']], w.routine)}</div>
        <div class="block"><div class="lbl">${IC.track}Praćenje</div>${seg('tracking', [['checkbox', 'Kvadratić'], ['numeric', 'Brojevno']], w.tracking)}
          ${numeric ? `<div class="inline">Cilj<input type="number" min="0" step="any" value="${w.target}" data-in="nhTarget" aria-label="Cilj"><input class="unit" value="${esc(w.unit)}" placeholder="jedinica" data-in="nhUnit" aria-label="Jedinica">po danu</div>` : ''}</div>
        ${prow('nhFreq', IC.repeat, 'Učestalost', freqLabel(w.freq), '')}
        ${prow('nhRem', IC.bell, 'Podsetnik', [...w.reminders].sort().join(', '), 'Nije podešen')}</div>
      <button class="more" data-act="nhMore"><b>Više</b><span style="display:inline-flex;gap:4px;align-items:center">${w.more ? 'Sakrij' : 'Početak, kraj, ciljevi'}${IC.fold(w.more)}</span></button>
      ${w.more ? `<div class="card" style="margin-top:8px">
        ${prow('nhStart', IC.cal, 'Početak', habitStartLabel(w.freq.start), '')}
        ${prow('soon', IC.short.replace('width="16" height="16"', 'width="20" height="20"'), 'Kraj', 'Nikad', '', same)}
        ${targets ? prow('soon', IC.goal, 'Minimalna i idealna', '', 'Kao cilj', same) : ''}
        ${numeric ? prow('soon', IC.bolt, 'Brze vrednosti', [w.target / 8, w.target / 4, w.target / 2].map(v => `+${num(v)}`).join('  '), '', same) : ''}
        ${prow('soon', IC.goal, 'Povezani ciljevi', '', 'Nijedan', same)}</div>
        <p class="note">„Nastavak“ i „Dani tolerancije“ su u detaljima navike.</p>` : ''}`,
    foot: '<button class="primary" data-act="nhCreate">Napravi naviku</button>',
  };
};
IN.nhName = el => { W.name = el.value; };
IN.nhTarget = el => { W.target = Number(el.value); };
IN.nhUnit = el => { W.unit = el.value; };
A.nhMore = () => { W.more = !W.more; renderWin(); };
A.nhArea = () => openPick({ kind: 'choice', title: 'Oblast', sub: W.name || 'Nova navika', current: W.area, options: [{ v: null, label: 'Bez oblasti' }, ...activeAreas().map(a => ({ v: a.id, label: a.name, dot: a.color }))], onPick: v => { W.area = v; renderWin(); } });
A.nhStart = () => openDate({ mode: 'habitStart', date: W.freq.start, time: null });
A.nhFreq = () => openPick({ kind: 'freq', f: JSON.parse(JSON.stringify(W.freq)) });
A.nhRem = () => openPick({ kind: 'hrem', times: W.reminders.length ? [...W.reminders] : ['09:00'] });
function nextDates(f) {
  const out = []; let s = f.start;
  while (s < TODAY) s = addDays(s, f.everyN);
  for (let k = 0; k < 3; k++) { out.push(short(s)); s = addDays(s, f.everyN); }
  return out;
}
const stepper = (key, v, min, max) => `<span class="stepper"><button data-act="fqStep" data-k="${key}" data-d="-1" ${v <= min ? 'disabled' : ''} aria-label="Manje">−</button><span>${v}</span><button data-act="fqStep" data-k="${key}" data-d="1" ${v >= max ? 'disabled' : ''} aria-label="Više">+</button></span>`;
// The frequency sheet (N6): one "Primeni", X closes without a change.
PICK.freq = p => {
  const f = p.f;
  let extra = '';
  if (f.type === 'weekdays') extra = `<div class="wdays">${WD.map((d, i) => `<button class="${f.weekdays.includes(i) ? 'on' : ''}" data-act="fqDay" data-i="${i}" aria-pressed="${f.weekdays.includes(i)}">${d}</button>`).join('')}</div><p class="note" style="margin-top:0">${f.weekdays.length ? freqLabel(f) : 'Izaberi bar jedan dan.'}</p>`;
  if (f.type === 'perWeek') extra = `<div class="field"><span class="lbl">Uspešnih dana nedeljno</span>${stepper('perWeek', f.perWeek, 1, 7)}</div><p class="note" style="margin-top:0">Jedno označavanje po danu, bilo kog dana u nedelji. Možeš da pređeš nedeljni cilj.</p>`;
  if (f.type === 'everyN') extra = `<div class="field"><span class="lbl">Na ${plural(f.everyN, 'svaki', 'svaka', 'svakih')}</span>${stepper('everyN', f.everyN, 2, 30)}<span class="meta" style="margin:0">dana</span></div><label class="field">${IC.cal}<span class="lbl">Počinje</span><input type="date" value="${f.start}" data-ch="fqStart"></label><p class="note" style="margin-top:0"><span style="color:var(--text)">Sledeći dani:</span> ${nextDates(f).join(' · ')}</p>`;
  return { title: 'Učestalost', sub: W.name || 'Nova navika', body: `<div class="card" style="margin-bottom:12px">${[['daily', 'Svaki dan'], ['weekdays', 'Određeni dani'], ['perWeek', 'X puta nedeljno'], ['everyN', 'Na svakih N dana']].map(([v, l]) => `<div class="opt" role="radio" tabindex="0" aria-checked="${f.type === v}" data-act="fqType" data-v="${v}"><span class="radio ${f.type === v ? 'on' : ''}"></span><span class="lbl">${l}</span></div>`).join('')}</div>${extra}<button class="primary" data-act="fqApply" ${f.type === 'weekdays' && !f.weekdays.length ? 'disabled' : ''}>Primeni</button>` };
};
A.fqType = el => { P.f.type = el.dataset.v; renderPick(); };
A.fqDay = el => { const i = Number(el.dataset.i), d = P.f.weekdays; P.f.weekdays = d.includes(i) ? d.filter(x => x !== i) : [...d, i].sort(); renderPick(); };
A.fqStep = el => { P.f[el.dataset.k] += Number(el.dataset.d); renderPick(); };
CH.fqStart = el => { if (el.value) P.f.start = el.value; renderPick(); };
A.fqApply = () => { W.freq = P.f; closePick(); renderWin(); };
PICK.hrem = p => ({ title: 'Podsetnik', sub: W.name || 'Nova navika', body: `${p.times.map((t, k) => `<div class="field">${IC.bell}<span class="lbl">Vreme ${p.times.length > 1 ? k + 1 : ''}</span><input type="time" value="${t}" data-ch="hrTime" data-k="${k}">${p.times.length > 1 ? `<button class="x" data-act="hrRm" data-k="${k}" aria-label="Ukloni vreme">✕</button>` : ''}</div>`).join('')}
  <button class="ghost" data-act="hrAdd" style="padding-top:2px">＋ Dodaj vreme</button><p class="note" style="margin-top:0">Podsetnik stiže samo u dane kada je navika u planu.</p>
  <div class="split"><button class="ghost" data-act="hrClear">Bez podsetnika</button><button class="primary" data-act="hrApply">Primeni</button></div>` });
CH.hrTime = el => { P.times[Number(el.dataset.k)] = el.value; };
A.hrRm = el => { P.times.splice(Number(el.dataset.k), 1); renderPick(); };
A.hrAdd = () => { P.times.push('18:00'); renderPick(); };
A.hrClear = () => { W.reminders = []; closePick(); renderWin(); };
A.hrApply = () => { W.reminders = [...new Set(P.times.filter(Boolean))]; closePick(); renderWin(); };
// A new habit gets this week's plan from its frequency; days before the start are not scheduled.
A.nhCreate = () => {
  const w = W;
  if (!w.name.trim()) { w.err = 'Upiši naziv navike.'; return renderWin(); }
  if (w.tracking === 'numeric' && !(w.target > 0)) { w.err = 'Cilj mora biti veći od nule.'; return renderWin(); }
  const f = w.freq;
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(WEEK_START, i);
    if (day < f.start) return 'n';
    const scheduled = f.type === 'weekdays' ? f.weekdays.includes(i) : f.type === 'everyN' ? daysTo(day) % f.everyN === daysTo(f.start) % f.everyN : true;
    if (!scheduled) return 'n';
    return i < TI ? 'm' : i === TI ? 'o' : 'f';
  });
  const h = { id: newId('h'), name: w.name.trim(), routine: Number(w.routine), tracking: w.tracking, target: w.target, unit: w.unit, quick: [w.target / 8, w.target / 4, w.target / 2], vals: [], freq: freqLabel(f), streak: 0, week };
  if (f.type === 'perWeek') h.weekly = f.perWeek;
  S.habits.push(h);
  closeWin(); render(); toast('Navika je napravljena');
};
