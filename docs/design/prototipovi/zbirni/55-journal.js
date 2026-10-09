// ===== Dnevnik (journal, added 2026-10-09) ===================================
// One entry per day: free text, an optional mood and a read-only summary of the day. It lives in "Još" →
// Biblioteka. Global Search does not include it (its scope must not change); the screen has its own search.
SCREEN_TITLE.journal = 'Dnevnik';
IC.book = SV('<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10M9 8h6"/>');
const MOODS = [['😞', 'Loše'], ['🙁', 'Slabo'], ['😐', 'Onako'], ['🙂', 'Dobro'], ['😄', 'Odlično']];
S.journal = [
  { date: '2026-10-07', mood: 4, text: 'Prezentacija za klijenta je gotova i prošla je bolje od očekivanog. Uveče kratka šetnja.\nSutra: pozvati Anu i završiti pregled početne strane.' },
  { date: '2026-10-06', mood: 2, text: 'Ceo dan sastanci, malo stvarno urađenog. Treba više vremena bez telefona pre podne.' },
  { date: '2026-10-04', mood: 5, text: 'Nedelja bez žurbe. Pola knjige pročitano, ručak za celu nedelju skuvan.' },
  { date: '2026-10-01', mood: 3, text: 'Prvi dan meseca: sređeni računi i plan za oktobar.' },
];
S.ui.jMonth = S.ui.jMonth || TODAY.slice(0, 7);
const entryOn = d => S.journal.find(e => e.date === d);
// The summary comes from the day itself: completed tasks and, within this week, the habits.
function daySummary(d) {
  const done = doneOn(d), i = Math.round((parse(d) - parse(WEEK_START)) / 864e5), parts = [`Završeno ${done} ${plural(done, 'zadatak', 'zadatka', 'zadataka')}`];
  if (i >= 0 && i < 7 && d <= TODAY) { const due = S.habits.filter(h => h.week[i] && h.week[i] !== 'n'), ok = due.filter(h => h.week[i] === 'd').length; if (due.length) parts.push(`navike ${ok}/${due.length}`); }
  return parts.join(' · ');
}
// A quiet notice on Today in the evening until today has an entry (in the app after 20:00; the prototype shows it always).
function journalNotice() {
  if (entryOn(TODAY)?.text || S.ui.jLater === TODAY) return '';
  return `<div class="notice">${IC.book}<span class="main"><b>Zapiši kako je prošao dan</b>${daySummary(TODAY)}.</span><button data-act="openJournal" data-d="${TODAY}">Zapiši</button><button data-act="journalLater" style="color:var(--muted)">Ne danas</button></div>`;
}
A.journalLater = () => { S.ui.jLater = TODAY; render(); toast('Podsetnik se vraća sutra uveče'); };

SUB.journal = () => {
  const [y, m] = S.ui.jMonth.split('-').map(Number), count = new Date(y, m, 0).getDate(), q = plain(S.ui.jQuery || '');
  const days = Array.from({ length: count }, (_, k) => addDays(`${S.ui.jMonth}-01`, k));
  const strip = days.map(d => { const e = entryOn(d), future = d > TODAY; return `<button class="jday ${d === TODAY ? 'today' : ''} ${e ? 'has' : ''}" data-act="openJournal" data-d="${d}" ${future ? 'disabled' : ''} aria-label="${longDate(d)}${e ? ', ima zapis' : ''}"><span>${WD[mondayIndex(d)]}</span><b>${parse(d).getDate()}</b><i></i></button>`; }).join('');
  const list = [...S.journal].filter(e => e.text || e.mood).filter(e => !q || plain(e.text).includes(q)).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="status"><span>09:41</span><span>•••</span></div>${backBtn()}<h1 class="h1">Dnevnik</h1>
    <div class="summary">${S.journal.length} ${plural(S.journal.length, 'zapis', 'zapisa', 'zapisa')}</div>
    <div class="monthbar"><strong>${cap(MONTHS[m - 1])} ${y}</strong><span class="arrows"><button data-act="jMonth" data-d="-1" aria-label="Prethodni mesec">${IC.left}</button><button data-act="jMonth" data-d="1" aria-label="Sledeći mesec" ${S.ui.jMonth >= TODAY.slice(0, 7) ? 'disabled' : ''}>${IC.right}</button></span></div>
    <div class="jstrip filters">${strip}</div>
    <label class="field" style="margin-top:10px">${IC.search}<input class="wide" placeholder="Pretraži dnevnik" value="${esc(S.ui.jQuery || '')}" data-in="jQuery" aria-label="Pretraži dnevnik"></label>
    <div id="jList">${journalList(list, q)}</div>`;
};
function journalList(list, q) {
  if (!list.length) return q ? '<div class="empty"><strong>Nema zapisa sa tim rečima</strong>Pretraga gleda samo tekst dnevnika.</div>' : '<div class="empty"><strong>Dnevnik je prazan</strong>Dodir na dan ili „+“ otvara zapis za taj dan.</div>';
  return `<div class="card">${list.map(e => `<button class="jrow" data-act="openJournal" data-d="${e.date}"><span class="jhead"><b>${longDate(e.date)}</b>${e.mood ? `<span aria-label="${MOODS[e.mood - 1][1]}">${MOODS[e.mood - 1][0]}</span>` : ''}</span><span class="jtext">${esc(e.text) || '<i>Bez teksta</i>'}</span></button>`).join('')}</div>`;
}
// Typing filters the list without redrawing the field.
IN.jQuery = el => { S.ui.jQuery = el.value; const q = plain(el.value); $('jList').innerHTML = journalList([...S.journal].filter(e => e.text || e.mood).filter(e => !q || plain(e.text).includes(q)).sort((a, b) => b.date.localeCompare(a.date)), q); };
A.jMonth = el => { const [y, m] = S.ui.jMonth.split('-').map(Number), n = new Date(y, m - 1 + Number(el.dataset.d), 1); S.ui.jMonth = iso(n).slice(0, 7); render(); };

// The entry window: the date, the summary of the day, the mood and the text; it saves while typing.
A.openJournal = el => {
  const d = el.dataset.d || TODAY;
  if (!entryOn(d)) S.journal.push({ date: d, mood: null, text: '', isNew: true });
  openWin({ kind: 'journal', date: d });
};
WIN.journal = w => {
  const e = entryOn(w.date);
  return {
    tall: true,
    head: winHead('Dnevnik', `<button class="x" data-act="journalMenu" aria-label="Radnje">${IC.dots}</button>`),
    body: `<h2 style="font-size:22px;margin:0 0 4px">${longDate(w.date)}</h2><p class="note" style="margin:0 2px 14px">${daySummary(w.date)}</p>
      <div class="glabel">Raspoloženje</div><div class="moods">${MOODS.map(([f, l], k) => `<button class="${e.mood === k + 1 ? 'on' : ''}" data-act="jMood" data-v="${k + 1}" aria-pressed="${e.mood === k + 1}" aria-label="${l}"><span>${f}</span><small>${l}</small></button>`).join('')}</div>
      <textarea class="jarea" rows="10" placeholder="Kako je prošao dan? Šta je bilo dobro? Šta sutra?" data-in="jText" aria-label="Zapis">${esc(e.text)}</textarea>
      <p class="note">Čuva se dok pišeš. Dnevnik se ne vidi u Pretrazi, samo u svojoj pretrazi na ekranu Dnevnik.</p>`,
  };
};
IN.jText = el => { const e = entryOn(W.date); e.text = el.value; delete e.isNew; };
A.jMood = el => { const e = entryOn(W.date), v = Number(el.dataset.v); e.mood = e.mood === v ? null : v; delete e.isNew; renderWin(); };
A.journalMenu = () => { const e = entryOn(W.date); openPick({ kind: 'choice', title: longDate(e.date), current: null, options: [{ v: 'del', label: 'Obriši zapis' }], onPick: () => { const k = S.journal.indexOf(e); S.journal.splice(k, 1); closeWin(); render(); toast('Zapis je obrisan', () => S.journal.splice(k, 0, e)); } }); };
// Closing an untouched new entry drops it.
const closeWinJournal = closeWin;
closeWin = function () { if (W?.kind === 'journal') { const e = entryOn(W.date); if (e && (e.isNew || (!e.text.trim() && !e.mood))) S.journal.splice(S.journal.indexOf(e), 1); } closeWinJournal(); };

// "+" on the Dnevnik screen opens today's entry.
const fabJournal = A.fab;
A.fab = () => R.stack.at(-1)?.type === 'journal' ? A.openJournal({ dataset: { d: TODAY } }) : fabJournal();
