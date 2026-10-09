// ===== Navike (H1–H7) =======================================================
const SEP = [67, 50, 83, 67, 50, 33, 67, 83, 50, 67, 83, 67, 100, 83, 50, 67, 83, 100, 83, 67, 33, 50, 67, 83, 100, 100, 83, 67, 50, 67];
const OCT14 = [83, 100, 83, 67];
const CHART_MONTHS = [{ name: 'Septembar 2026', short: 'sep', days: 30 }, { name: 'Oktobar 2026', short: 'okt', days: 31 }];
const chartSeries = () => S.ui.chartMonth === 0 ? SEP : [...OCT14, ...[0, 1, 2, 3].map(i => dayPct(i) ?? 0)];

function ringsCard() {
  return `<div class="card" style="margin-bottom:12px"><div class="rings" role="group" aria-label="Ova nedelja, urađeno od planiranog">${WD.map((d, i) => {
    const pct = i > TI ? null : dayPct(i);
    const arc = pct ? `<circle cx="22" cy="22" r="18" fill="none" stroke="#34C77B" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(pct / 100 * 113.1).toFixed(1)} 113.1" transform="rotate(-90 22 22)"/>` : '';
    // A full ring shows a small check instead of "100%" (H4).
    const text = pct === null ? '<text class="na" x="22" y="26" text-anchor="middle">–</text>'
      : pct === 100 ? '<path d="M17.5 22.3l3 3 6-6.3" fill="none" stroke="#34C77B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
      : `<text x="22" y="26" text-anchor="middle">${pct}<tspan class="pc">%</tspan></text>`;
    const sel = S.ui.habTab === 'day' && i === S.ui.habDay;
    const day = addDays(WEEK_START, i);
    return `<button class="${i === TI ? 'today' : ''} ${sel ? 'sel' : ''}" data-act="habDay" data-i="${i}" ${i > TI ? 'disabled' : ''} aria-label="${longDate(day)}, ${pct === null ? 'nema podataka' : `${pct}%`}" ${sel ? 'aria-current="date"' : ''}>${d}<svg class="ring" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="#2C3139" stroke-width="4"/>${arc}${text}</svg><span>${parse(day).getDate()}</span></button>`;
  }).join('')}</div></div>`;
}
function habitMeta(h, i) {
  const state = h.week[i];
  if (state === 's') return `${h.freq} · preskočeno`;
  if (h.weekly) return `${h.freq} · ${h.week.filter(s => s === 'd').length}/${h.weekly} ove nedelje`;
  if (i !== TI) return state === 'm' ? `${h.freq} · propušteno` : h.freq;
  const streak = (h.streak || 0) + (state === 'd' ? 1 : 0);
  return `${h.freq} · niz ${streak} ${streak === 1 ? 'dan' : 'dana'}`;
}
function habitsDay() {
  const i = S.ui.habDay;
  let html = i === TI ? '' : `<div class="note" style="margin:14px 2px -6px"><b style="color:var(--text)">${longDate(addDays(WEEK_START, i))}</b></div>`;
  ROUTINES.forEach(([title, icon], r) => {
    const list = S.habits.filter(h => h.routine === r && !['n', 'f'].includes(h.week[i]));
    const sorted = [...list.filter(h => h.week[i] !== 'd'), ...list.filter(h => h.week[i] === 'd')];
    if (sorted.length) html += `<div class="section">${IC[icon]}${title} <span>· ${sorted.length}</span></div><div class="card">${sorted.map(h => habitRow(h, i, { meta: habitMeta(h, i) })).join('')}</div>`;
  });
  return html;
}
function habitsWeek() {
  const head = `<div class="wkhead"><span></span>${WD.map((d, i) => { const n = parse(addDays(WEEK_START, i)).getDate(); return i === TI ? `<b>${d}<br>${n}</b>` : `<span>${d}<br>${n}</span>`; }).join('')}</div>`;
  const rows = ROUTINES.map(([title], r) => `<div class="wklabel">${title}</div>` + S.habits.filter(h => h.routine === r).map(h => `<div class="wkrow"><span class="wkname">${esc(h.name)}</span>${h.week.map((s, i) => `<button class="cell ${s}${i === TI ? ' today' : ''}" data-act="habCell" data-id="${h.id}" data-i="${i}" ${['f', 'n'].includes(s) ? 'disabled' : ''} aria-label="${esc(h.name)}, ${parse(addDays(WEEK_START, i)).getDate()}. okt">${s === 'd' ? IC.tick : ''}</button>`).join('')}</div>`).join('')).join('');
  return `<div class="section">5–11. oktobar</div><div class="wkgrid">${head}${rows}</div><div class="legend"><span><i style="background:var(--green)"></i>urađeno</span><span><i style="border:2px solid #5A3A3C"></i>propušteno</span><span><i style="border:2px dashed #5B6270"></i>preskočeno</span><span><i style="background:#2C3139;height:2px;border-radius:1px"></i>nije u planu</span></div>`;
}
// Per-habit weekly bars (H7): done days against the week's plan, without skipped days.
function habitBars() {
  return S.habits.map(h => {
    const done = h.week.filter(s => s === 'd').length;
    const planned = h.weekly || h.week.filter(s => !['n', 's'].includes(s)).length;
    const pct = planned ? Math.min(100, Math.round(done / planned * 100)) : 0;
    const count = pct === 100 ? '<svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align:-2px"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#34C77B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' : `${done}/${planned}`;
    return `<div class="hbar"><span class="ttl">${esc(h.name)}</span><span class="count">${count}</span><span class="track" role="img" aria-label="${esc(h.name)}: ${done} od ${planned}"><i style="width:${pct}%;background:var(--green)"></i></span></div>`;
  }).join('');
}
function chartCard() {
  const m = CHART_MONTHS[S.ui.chartMonth], values = chartSeries(), last = values.length - 1;
  const W = 320, H = 150, L = 30, R = 10, T = 10, B = 22;
  const x = i => L + i * (W - L - R) / (m.days - 1), y = v => T + (100 - v) / 100 * (H - T - B);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const isNow = S.ui.chartMonth === CHART_MONTHS.length - 1;
  const grid = [0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text class="axis" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}%</text>`).join('');
  const ticks = [0, 7, 14, 21, m.days - 1].map(i => `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="${i === m.days - 1 ? 'end' : i ? 'middle' : 'start'}">${i + 1}. ${m.short}</text>`).join('');
  return `<div class="card" style="margin-top:10px"><div class="chart" id="chartBox">
    <div class="chart-head"><div><strong>${avg}%</strong> <span class="sub">prosek</span></div><div class="month"><button data-act="chartMonth" data-d="-1" ${S.ui.chartMonth === 0 ? 'disabled' : ''} aria-label="Prethodni mesec">${IC.left}</button><span>${m.name}</span><button data-act="chartMonth" data-d="1" ${isNow ? 'disabled' : ''} aria-label="Sledeći mesec">${IC.right}</button></div></div>
    <svg id="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Procenat urađenih navika po danu, ${m.name.toLowerCase()}" data-days="${m.days}" data-last="${last}">
      <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34C77B" stop-opacity=".28"/><stop offset="1" stop-color="#34C77B" stop-opacity="0"/></linearGradient></defs>
      ${grid}${ticks}
      <polygon points="${x(0)},${y(0)} ${pts} ${x(last)},${y(0)}" fill="url(#fade)"/>
      <polyline points="${pts}" fill="none" stroke="#34C77B" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line id="cross" x1="0" x2="0" y1="${T}" y2="${y(0)}" stroke="#5B6270" visibility="hidden"/>
      <circle id="cdot" r="4.5" fill="#34C77B" stroke="#16191E" stroke-width="2" cx="${x(last)}" cy="${y(values[last])}" visibility="${isNow ? 'visible' : 'hidden'}"/>
      ${isNow ? `<text class="axis" x="${x(last) + 8}" y="${y(values[last]) - 10}" style="fill:var(--text);font-weight:600">danas ${values[last]}%</text>` : ''}
      <rect id="hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>
    </svg><div class="tip" id="tip"></div>
    <table style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"><caption>${m.name}</caption>${values.map((v, i) => `<tr><td>${i + 1}. ${m.short}</td><td>${v}%</td></tr>`).join('')}</table></div></div>`;
}
// Crosshair and tooltip for the month chart; text goes in through textContent.
AFTER.push(() => {
  const svg = $('chart');
  if (!svg) return;
  const m = CHART_MONTHS[S.ui.chartMonth], values = chartSeries(), last = values.length - 1;
  const W = 320, H = 150, L = 30, R = 10, T = 10, B = 22;
  const x = i => L + i * (W - L - R) / (m.days - 1), y = v => T + (100 - v) / 100 * (H - T - B);
  const tip = $('tip'), cross = $('cross'), dot = $('cdot');
  const move = ev => {
    const box = svg.getBoundingClientRect();
    if (!box.width) return;
    const i = Math.max(0, Math.min(last, Math.round(((ev.clientX - box.left) / box.width * W - L) / (W - L - R) * (m.days - 1))));
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(values[i])); dot.setAttribute('visibility', 'visible');
    const strong = document.createElement('strong'); strong.textContent = `${values[i]}%`;
    tip.replaceChildren(strong, document.createTextNode(`${i + 1}. ${m.short}`));
    const host = $('chartBox').getBoundingClientRect();
    tip.style.left = `${box.left - host.left + x(i) / W * box.width}px`;
    tip.style.top = `${box.top - host.top + y(values[i]) / H * box.height - 8}px`;
    tip.classList.add('show');
  };
  const leave = () => { tip.classList.remove('show'); cross.setAttribute('visibility', 'hidden'); dot.setAttribute('cx', x(last)); dot.setAttribute('cy', y(values[last])); dot.setAttribute('visibility', S.ui.chartMonth === CHART_MONTHS.length - 1 ? 'visible' : 'hidden'); };
  $('hit').addEventListener('pointermove', move);
  $('hit').addEventListener('pointerdown', move);
  $('hit').addEventListener('pointerleave', leave);
});

TAB.habits = () => {
  const planned = S.habits.filter(h => ['d', 'o'].includes(h.week[TI]));
  let html = `<div class="status"><span>09:41</span><span>•••</span></div><div class="titlebar" style="margin-bottom:10px"><h1 class="h1">Navike</h1><span class="meta">${planned.filter(h => h.week[TI] === 'd').length} od ${planned.length} danas</span></div>`;
  html += ringsCard();
  html += `<div class="seg" role="tablist"><button role="tab" class="${S.ui.habTab === 'day' ? 'on' : ''}" data-act="habTab" data-v="day">Dan</button><button role="tab" class="${S.ui.habTab === 'week' ? 'on' : ''}" data-act="habTab" data-v="week">Nedelja</button></div>`;
  html += S.ui.habTab === 'day' ? habitsDay() : habitsWeek();
  html += `<div class="section">Napredak</div><div class="card"><div class="meta" style="padding:10px 14px 2px;margin:0">Po navici · ova nedelja</div>${habitBars()}</div>${chartCard()}`;
  html += `<button class="collapsed" data-act="pausedToggle">${IC.fold(S.ui.pausedOpen)}Pauzirane · ${S.pausedHabits.length}</button>`;
  if (S.ui.pausedOpen) html += `<div class="card" style="margin-top:8px">${S.pausedHabits.map(h => `<div class="hrow"><span class="main"><div class="ttl" style="color:var(--muted)">${esc(h.name)}</div><div class="meta">${h.when}</div></span><button class="chip sm" data-act="soon" data-msg="Navika je ponovo aktivna (u prototipu bez promene)">Nastavi</button></div>`).join('')}</div>`;
  return html;
};
A.habTab = el => { S.ui.habTab = el.dataset.v; if (S.ui.habTab === 'day') S.ui.habDay = TI; render(); };
A.habDay = el => { S.ui.habDay = Number(el.dataset.i); S.ui.habTab = 'day'; render(); };
A.habCell = el => {
  const h = habit(el.dataset.id), i = Number(el.dataset.i);
  if (h.tracking === 'numeric') return openPick({ kind: 'value', id: h.id, i, total: h.vals[i] || 0 });
  h.week[i] = h.week[i] === 'd' ? (i === TI ? 'o' : 'm') : 'd';
  render();
};
A.chartMonth = el => { S.ui.chartMonth = Math.max(0, Math.min(CHART_MONTHS.length - 1, S.ui.chartMonth + Number(el.dataset.d))); render(); };
A.pausedToggle = () => { S.ui.pausedOpen = !S.ui.pausedOpen; render(); };
