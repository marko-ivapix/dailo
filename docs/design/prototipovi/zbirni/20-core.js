'use strict';
// ===== Dates and words =====================================================
const TODAY = '2026-10-08';
const TI = 3; // today's index in this week (Mon 5 – Sun 11 Oct)
const WEEK_START = '2026-10-05';
const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
const SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];
const WD = ['P', 'U', 'S', 'Č', 'P', 'S', 'N'];
const WDNAME = ['Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota', 'Nedelja'];
const WDINSTR = ['ponedeljkom', 'utorkom', 'sredom', 'četvrtkom', 'petkom', 'subotom', 'nedeljom'];

const $ = id => document.getElementById(id);
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const mondayIndex = s => (parse(s).getDay() + 6) % 7;
const daysTo = s => Math.round((parse(s) - parse(TODAY)) / 86400000);
const cap = s => s[0].toUpperCase() + s.slice(1);
const short = s => { const d = parse(s); return `${d.getDate()}. ${SHORT[d.getMonth()]}${d.getFullYear() !== 2026 ? ` ${d.getFullYear()}` : ''}`; };
const longDate = s => { const d = parse(s); return `${WDNAME[mondayIndex(s)]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const relDay = s => s === TODAY ? 'Danas' : s === addDays(TODAY, 1) ? 'Sutra' : s === addDays(TODAY, -1) ? 'Juče' : short(s);
const num = v => String(Math.round(v * 100) / 100).replace('.', ',');
const money = v => Number(v).toLocaleString('de-DE');
const plural = (n, one, few, other) => (n % 10 === 1 && n % 100 !== 11) ? one : ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) ? few : other;
const listWords = w => w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} i ${w.at(-1)}`;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const durLabel = m => !m ? '' : m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
const nextMonday = () => addDays(TODAY, (7 - mondayIndex(TODAY)) % 7 || 7);

// ===== Icons ===============================================================
const SV = (p, w = 20, extra = '') => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${extra}>${p}</svg>`;
const IC = {
  search: SV('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', 22),
  chev: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  fold: o => `<svg class="chev" width="16" height="16" viewBox="0 0 24 24" style="transform:rotate(${o ? 90 : 0}deg)"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  left: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  right: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  tick: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#0F1114" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tickW: '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bigCheck: '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#34C77B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  target: '<svg width="22" height="22" viewBox="0 0 24 24" style="flex:none"><circle cx="12" cy="12" r="9" fill="none" stroke="#8FA2FF" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="#8FA2FF" stroke-width="2"/><circle cx="12" cy="12" r="1.2" fill="#8FA2FF"/></svg>',
  flag: c => `<svg width="15" height="15" viewBox="0 0 24 24" style="color:${c}"><path d="M5 21V4h11l-2 4 2 4H5" fill="${c === '#5B6270' ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  cal: SV('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  due: SV('<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>'),
  bell: SV('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>'),
  repeat: SV('<path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3"/>'),
  timer: SV('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M10 2.5h4"/>'),
  folder: SV('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
  tag: SV('<path d="M3.5 12.5V5A1.5 1.5 0 0 1 5 3.5h7.5l8 8-9 9z"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/>'),
  area: SV('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  person: SV('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
  routine: SV('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
  sun: SV('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>', 16),
  dayic: SV('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>', 16),
  moon: SV('<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/>', 16),
  track: SV('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>'),
  bolt: SV('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  goal: SV('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  milestone: SV('<path d="M12 3l9 9-9 9-9-9z"/>'),
  link: SV('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  note: SV('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h6M9 16h6"/>'),
  habit: SV('<path d="M6 20V12M12 20V5M18 20v-9"/>'),
  tray: SV('<path d="M4 13l2.5-7h11L20 13v6H4zM4 13h5l1 2h4l1-2h5"/>', 18),
  sparkle: '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 4l1.8 4.7L18.5 10.5l-4.7 1.8L12 17l-1.8-4.7-4.7-1.8 4.7-1.8z" fill="none" stroke="#8FA2FF" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  sort: SV('<path d="M4 6h16M7 12h10M10 18h4"/>'),
  dots: SV('<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/>', 22),
  short: SV('<path d="M5 21V4h11l-2 4 2 4H5"/>', 16),
  mid: SV('<path d="M5 20c0-5 3-6 7-8s7-3 7-8"/><circle cx="5" cy="20" r="1.4" fill="currentColor"/><circle cx="19" cy="4" r="1.4" fill="currentColor"/>', 16),
  long: SV('<path d="M3 20l6-10 4 6 2.5-3.5L21 20z"/>', 16),
  month: SV('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>', 16),
  broom: SV('<path d="M14 4l-4 9M7 13h8l1.5 7h-11z"/>'),
  review: SV('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'),
  copy: SV('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  funnel: SV('<path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/>'),
  checkc: SV('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>'),
  archive: SV('<rect x="4" y="4" width="16" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>'),
  gear: SV('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>'),
  sync: SV('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/>'),
  upload: SV('<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v6h14v-6"/>'),
  download: SV('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 14v6h14v-6"/>'),
  clock: SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  shield: SV('<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4.5"/>'),
  trash: SV('<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5"/>'),
  book: SV('<path d="M5 4.5h5a2 2 0 0 1 2 2V20a2 2 0 0 0-2-2H5zM19 4.5h-5a2 2 0 0 0-2 2V20a2 2 0 0 1 2-2h5z"/>'),
  mail: SV('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>'),
  phoneic: SV('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  lock: SV('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  info: SV('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
  file: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z M14 3v4h4" fill="none" stroke="#F0645A" stroke-width="1.7" stroke-linejoin="round"/></svg>',
};

// ===== Data ================================================================
const S = {
  areas: [{ id: 'a1', name: 'Posao', color: '#3BA7F5' }, { id: 'a2', name: 'Lično', color: '#A38CF0' }, { id: 'a3', name: 'Zdravlje', color: '#34C77B' }],
  projects: [
    { id: 'p1', name: 'Redizajn sajta', area: 'a1', color: '#5362FF', goal: 'g2' },
    { id: 'p2', name: 'Klijentski portal', area: 'a1', color: '#30CBAD' },
    { id: 'p3', name: 'Kućni poslovi', area: 'a2', color: '#F5B942' },
    { id: 'p4', name: 'Putovanje u Rim', area: 'a2', color: '#F06A8A' },
  ],
  tags: [{ id: 't1', name: 'Klijent', color: '#3BA7F5' }, { id: 't2', name: 'Dizajn', color: '#A38CF0' }, { id: 't3', name: 'Administracija', color: '#F2B544' }, { id: 't4', name: 'Učenje', color: '#8B929C' }],
  tasks: [],
  goals: [],
  habits: [],
  inboxOther: [
    { id: 'n1', type: 'note', t: 'Ideje za rođendan', g: 'Danas', inbox: true },
    { id: 'r1', type: 'resource', t: 'Članak o dizajnu tabela', sub: 'smashingmagazine.com', g: 'Juče', inbox: true },
    { id: 'gi1', type: 'goal', t: 'Naučiti da plivam', g: 'Ove nedelje', inbox: true },
    { id: 'hi1', type: 'habit', t: 'Istezanje uveče', g: 'Ranije', inbox: true },
  ],
  settings: { weekStart: 'Ponedeljak', capacity: 360, backupDays: 7, lastBackup: 'pre 8 dana', backupNotice: true, sync: null },
  ui: {
    expand: { overdue: false, today: false, habits: false }, doneOpen: false,
    zadView: 'anytime', suggOpen: false,
    calView: 'week', calDay: TODAY, calWeek: WEEK_START, calMonth: '2026-10', dayMode: 'list',
    habTab: 'day', habDay: TI, chartMonth: 1, pausedOpen: false,
    goalGroup: 'horizon', goalFold: { done: false, paused: false }, inboxFilter: 'all',
  },
};
let seq = 100;
const newId = p => `${p}${++seq}`;
function T(title, props = {}) {
  return { id: newId('t'), title, project: null, area: null, plan: null, time: null, due: null, dueTime: null, reminder: null, repeat: null, duration: null, tags: [], priority: 'none', subtasks: [], notes: '', done: false, doneAt: null, inbox: false, captured: null, ...props };
}
S.tasks = [
  T('Pošalji fakturu', { area: 'a1', due: '2026-10-07', priority: 'high' }),
  T('Vrati knjigu u biblioteku', { area: 'a2', due: '2026-10-06' }),
  T('Pregledaj početnu stranu', { project: 'p1', plan: TODAY, time: '10:30', duration: 60, due: '2026-10-09', priority: 'high' }),
  T('Pošalji pregled početne strane', { project: 'p1', plan: TODAY, time: '14:00', duration: 90, due: '2026-10-09', dueTime: '18:00', priority: 'medium', reminder: { date: TODAY, time: '13:30' }, tags: ['t1', 't2'], subtasks: [{ t: 'Proveri razmake na telefonu', d: true }, { t: 'Izvezi slike pregleda', d: false }, { t: 'Napiši poruku', d: false }], notes: 'Uključi prikaz za telefon i računar.' }),
  T('Plati račun za struju', { project: 'p3', plan: TODAY, due: TODAY }),
  T('Pozovi Anu', { plan: TODAY, time: '16:00', duration: 30 }),
  T('Izvezi slike pregleda', { project: 'p1', plan: TODAY, duration: 30 }),
  T('Kupi poklon za Anu', { area: 'a2', plan: TODAY }),
  T('Zameni filter za vodu', { project: 'p3', plan: TODAY, repeat: { freq: 'monthly', interval: 1, days: [], end: 'never' } }),
  T('Proveri razmake na telefonu', { project: 'p1' }),
  T('Napiši tekst za „O nama“', { project: 'p1', priority: 'medium' }),
  T('Prijava preko e-pošte', { project: 'p2', plan: '2026-10-12', time: '10:00', duration: 120 }),
  T('Sastanak sa timom', { project: 'p2', plan: '2026-10-09', time: '11:00', duration: 60 }),
  T('Spisak grešaka iz testa', { project: 'p2', due: '2026-10-14' }),
  T('Očisti oluke', { project: 'p3' }),
  T('Rezerviši smeštaj', { project: 'p4', plan: '2026-10-06', priority: 'high' }),
  T('Kupi karte za muzej', { project: 'p4' }),
  T('Proveri pasoš', { project: 'p4', plan: '2026-10-09' }),
  T('Obnovi registraciju', { area: 'a2', due: '2026-10-20' }),
  T('Pozovi zubara', { area: 'a3' }),
  T('Rođendan kod Marka', { area: 'a2', plan: '2026-10-17', time: '19:00', duration: 180 }),
  T('Odgovori na mejl klijentu', { project: 'p2', plan: TODAY, done: true, doneAt: TODAY }),
  T('Uplati članarinu', { area: 'a3', plan: TODAY, done: true, doneAt: TODAY }),
  T('Wireframe-ovi', { project: 'p1', done: true, doneAt: '2026-09-20' }),
  T('Paleta boja', { project: 'p1', done: true, doneAt: '2026-09-28' }),
  T('Postavi server', { project: 'p2', done: true, doneAt: '2026-09-15' }),
  T('Pozovi majstora za bojler', { inbox: true, captured: 'Danas' }),
  T('Proveri ponudu za osiguranje', { inbox: true, captured: 'Juče' }),
  T('Javi se Marku za sastanak', { inbox: true, captured: 'Ove nedelje' }),
];
S.goals = [
  { id: 'g1', title: 'Prijava poreza', area: 'a2', horizon: 'short', source: 'manual', type: 'percent', current: 40, target: 100, unit: '', date: '2026-10-05', reminder: 'Nedelju dana pre u 9:00', milestones: [{ t: 'Prikupi potvrde', d: true, date: '2026-09-25' }, { t: 'Popuni obrazac', d: false, date: '2026-10-03' }] },
  { id: 'g2', title: 'Završi redizajn sajta', area: 'a1', horizon: 'short', source: 'tasks', project: 'p1', date: '2026-10-13', reminder: 'Dan pre u 9:00', milestones: [{ t: 'Wireframe-ovi', d: true, date: '2026-09-20' }, { t: 'Dizajn početne', d: true, date: '2026-09-30' }, { t: 'Razvoj', d: false, date: TODAY }, { t: 'Objava', d: false, date: '2026-10-13' }] },
  { id: 'g3', title: 'Pročitaj 4 knjige', area: 'a2', horizon: 'short', source: 'manual', type: 'number', current: 3, target: 4, unit: 'knjige', date: '2026-12-31', reminder: null, milestones: [] },
  { id: 'g4', title: 'Polumaraton u aprilu', area: 'a3', horizon: 'mid', source: 'habits', date: '2027-04-18', reminder: 'Nedelju dana pre u 9:00', habits: [{ t: 'Šetnja', pct: 42, label: '19 / 45 uspešnih dana' }, { t: 'Teretana', pct: 30, label: '9 / 30 uspešnih nedelja' }], milestones: [{ t: '10 km bez pauze', d: false, date: '2026-11-01' }, { t: '15 km', d: false, date: '2027-01-31' }, { t: 'Polumaraton', d: false, date: '2027-04-18' }] },
  { id: 'g5', title: 'Engleski B2', area: 'a2', horizon: 'mid', source: 'manual', type: 'percent', current: 50, target: 100, unit: '', date: '2027-06-30', reminder: null, milestones: [{ t: 'B1 test', d: true, date: '2026-06-15' }, { t: 'Probni B2 test', d: false, date: '2027-03-01' }] },
  { id: 'g6', title: 'Ušteda za stan', area: 'a2', horizon: 'long', source: 'manual', type: 'number', current: 4200, target: 15000, unit: '€', date: null, reminder: null, milestones: [] },
].map(g => ({ status: 'active', ...g }));
S.finishedGoals = [{ title: 'Nauči osnove fotografije', when: 'Ostvaren 12. sep' }, { title: 'Selidba kancelarije', when: 'Ostvaren 30. jul' }];
S.pausedGoals = [{ title: 'Kurs gitare', when: 'Pauziran od 1. sep' }];
// Week states: d done, m missed, s skipped, o open (today), f future, n not scheduled.
S.habits = [
  { id: 'h1', name: 'Voda', routine: 0, tracking: 'numeric', target: 2, unit: 'l', quick: [0.25, 0.5, 1], vals: [2, 2, 2.25, 1.5], freq: 'Svaki dan', streak: 3, week: 'd d d o f f f' },
  { id: 'h2', name: 'Meditacija 10 min', routine: 0, tracking: 'checkbox', freq: 'Svaki dan', streak: 1, week: 'd m d o f f f' },
  { id: 'h3', name: 'Teretana', routine: 1, tracking: 'checkbox', freq: '4 puta nedeljno', weekly: 4, week: 'd n d o f f f' },
  { id: 'h4', name: 'Engleski 15 min', routine: 1, tracking: 'checkbox', freq: 'Radnim danima', streak: 8, week: 'd d s o f n n' },
  { id: 'h5', name: 'Čitanje 20 min', routine: 2, tracking: 'checkbox', freq: 'Svaki dan', streak: 20, week: 'd d d d f f f' },
  { id: 'h6', name: 'Šetnja', routine: 2, tracking: 'checkbox', freq: 'Svaki dan', streak: 1, week: 'm m d o f f f' },
].map(h => ({ ...h, week: h.week.split(' ') }));
S.pausedHabits = [{ name: 'Hladan tuš', when: 'Pauzirana od 20. sep' }];
const ROUTINES = [['Jutro', 'sun'], ['Dan', 'dayic'], ['Veče', 'moon']];

const task = id => S.tasks.find(t => t.id === id);
const project = id => S.projects.find(p => p.id === id);
const areaOf = id => S.areas.find(a => a.id === id);
const goal = id => S.goals.find(g => g.id === id);
const habit = id => S.habits.find(h => h.id === id);
const taskArea = t => t.project ? areaOf(project(t.project).area) : areaOf(t.area);
const room = id => S.rooms.find(r => r.id === id);
const placeName = t => t.project ? project(t.project).name : t.room ? room(t.room).name : taskArea(t)?.name || '';
const activeAreas = () => S.areas.filter(a => a.status !== 'archived');
const activeProjects = () => S.projects.filter(p => !p.archived);

// ===== Rendering shell =====================================================
const R = { tab: 'today', stack: [] };
const TAB = {}, SUB = {}, AFTER = [];
let lastKey = '';
function render() {
  const top = R.stack.at(-1);
  const key = R.tab + (top ? JSON.stringify(top) : '');
  const screen = $('screen');
  const keep = key === lastKey ? screen.scrollTop : 0;
  screen.innerHTML = top ? SUB[top.type](top) : TAB[R.tab]();
  screen.scrollTop = keep;
  lastKey = key;
  renderNav();
  AFTER.forEach(fn => fn());
  if (W) renderWin();
  if (P) renderPick();
}
const NAV = [['today', 'Danas', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'],
  ['inbox', 'Inbox', '<path d="M4 13l2.5-7h11L20 13v6H4zM4 13h5l1 2h4l1-2h5"/>'],
  ['tasks', 'Zadaci', '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>'],
  ['calendar', 'Kalendar', '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4M8 14h2M12 14h2M8 17h2"/>'],
  ['habits', 'Navike', '<path d="M6 20V12M12 20V5M18 20v-9"/>'],
  ['more', 'Još', '<circle cx="6" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18" cy="12" r="1.2" fill="currentColor"/>']];
function renderNav() {
  const n = inboxCount();
  $('nav').innerHTML = NAV.map(([key, label, path]) => `<button class="${R.tab === key ? 'on' : ''}" data-act="tab" data-tab="${key}" ${R.tab === key ? 'aria-current="page"' : ''}>${SV(path, 22)}${label}${key === 'inbox' && n ? `<span class="badge" aria-label="${n} u Inbox-u">${n}</span>` : ''}</button>`).join('');
}
function go(tab) { R.tab = tab; R.stack = []; render(); }
function push(sub) { R.stack.push(sub); render(); }
function pop() { R.stack.pop(); render(); }
// The back button names the screen it returns to.
const SCREEN_TITLE = {};
function backBtn() {
  const prev = R.stack.at(-2);
  const t = prev ? SCREEN_TITLE[prev.type] : NAV.find(n => n[0] === R.tab)[1];
  return `<button class="back" data-act="back">${IC.left}${esc(typeof t === 'function' ? t(prev) : t)}</button>`;
}

// ===== Layers: window (L1) and picker (L2) =================================
let W = null, P = null;
const WIN = {}, PICK = {};
function renderWin() {
  const body = $('winBody');
  const keep = body.dataset.kind === W.kind ? body.scrollTop : 0;
  const v = WIN[W.kind](W);
  $('winHead').innerHTML = v.head;
  body.innerHTML = v.body;
  $('winFoot').innerHTML = v.foot || '';
  $('win').classList.toggle('tall', Boolean(v.tall));
  body.dataset.kind = W.kind;
  body.scrollTop = keep;
}
function openWin(w) { W = w; $('winBody').dataset.kind = ''; renderWin(); $('win').classList.add('show'); $('winDim').classList.add('show'); }
function closeWin() { W = null; $('win').classList.remove('show'); $('winDim').classList.remove('show'); }
function renderPick() {
  const v = PICK[P.kind](P);
  $('pickHead').innerHTML = `<div><h2>${v.title}</h2>${v.sub ? `<div class="meta">${esc(v.sub)}</div>` : ''}</div><button class="x" data-act="closePick" aria-label="Zatvori">✕</button>`;
  $('pickBody').innerHTML = v.body;
}
function openPick(p) { P = p; renderPick(); $('pick').classList.add('show'); $('pickDim').classList.add('show'); }
function closePick() { P = null; $('pick').classList.remove('show'); $('pickDim').classList.remove('show'); }
const winHead = (label, extra = '') => `<span class="meta">${label}</span><span style="display:flex;gap:4px;align-items:center">${extra}<button class="x" data-act="closeWin" aria-label="Zatvori">✕</button></span>`;

// ===== Toast with Undo =====================================================
let undoFn = null, toastTimer = null;
function toast(text, undo = null) {
  $('toastText').textContent = text;
  undoFn = undo;
  $('toastUndo').style.display = undo ? '' : 'none';
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), undo ? 3000 : 1600);
}
function snapshot(obj) { const copy = JSON.parse(JSON.stringify(obj)); return () => { Object.assign(obj, copy); }; }

// ===== Events ==============================================================
const A = {}, IN = {}, CH = {};
A.tab = el => { closePick(); closeWin(); go(el.dataset.tab); };
A.back = () => pop();
A.closeWin = () => { closeWin(); render(); };
A.closePick = () => closePick();
A.undo = () => { if (undoFn) { undoFn(); undoFn = null; render(); } $('toast').classList.remove('show'); };
A.soon = el => toast(el.dataset.msg || 'Ovaj ekran dolazi u sledećem koraku');
function bindEvents() {
  const phone = $('phone');
  phone.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled || !phone.contains(el)) return;
    const fn = A[el.dataset.act];
    if (fn) fn(el, ev);
  });
  phone.addEventListener('input', ev => { const el = ev.target.closest('[data-in]'); if (el && IN[el.dataset.in]) IN[el.dataset.in](el, ev); });
  phone.addEventListener('change', ev => { const el = ev.target.closest('[data-ch]'); if (el && CH[el.dataset.ch]) CH[el.dataset.ch](el, ev); });
}

// ===== Shared row pieces ===================================================
const PRI = { high: '#F0645A', medium: '#F2A93B', low: '#8FA2FF', none: '#5B6270' };
const PRI_NAME = { none: 'Bez', low: 'Nizak', medium: 'Srednji', high: 'Visok' };
// Due date in the G6 colors: overdue red, due today amber, later gray.
function dueLabel(due) {
  if (!due) return '';
  const d = daysTo(due);
  return d < 0 ? `<span class="red">Rok ${short(due)}</span>` : d === 0 ? '<span class="amber">Rok danas</span>' : d === 1 ? '<span>Rok sutra</span>' : `<span>Rok ${short(due)}</span>`;
}
function planLabel(t) { return !t.plan ? '' : t.plan === TODAY ? 'Danas' : t.plan < TODAY ? `Propušteno ${short(t.plan)}` : relDay(t.plan); }
// One task row, as on Today (T3): checkbox, title, meta, and two labels on the right.
function taskRow(t, { meta = 'today' } = {}) {
  const parts = meta === 'today' ? [t.time, placeName(t)] : meta === 'project' ? [planLabel(t), t.time] : meta === 'plan' ? [planLabel(t), placeName(t)] : meta === 'area' ? [taskArea(t)?.name] : [];
  const metaText = parts.filter(Boolean).join(' · ');
  const flag = ['high', 'medium'].includes(t.priority) ? IC.flag(PRI[t.priority]) : '';
  return `<div class="trow"><button class="box ${t.done ? 'on' : ''}" data-act="toggleTask" data-id="${t.id}" aria-label="${t.done ? 'Vrati kao otvoren' : 'Završi'}: ${esc(t.title)}">${t.done ? IC.tick : ''}</button><button class="main" data-act="openTask" data-id="${t.id}"><div class="ttl ${t.done ? 'done-title' : ''}">${esc(t.title)}</div>${metaText ? `<div class="meta">${esc(metaText)}</div>` : ''}</button><span class="side">${flag}${t.done ? '' : dueLabel(t.due)}</span></div>`;
}
// Goal and milestone deadlines use the target icon instead of the checkbox (T2a, C4).
function deadlineRow(item) {
  const { g, m } = item;
  const title = m ? m.t : g.title;
  const meta = m ? `Etapa · ${g.title}` : `Cilj · ${progress(g).pct}%`;
  return `<div class="trow"><span aria-hidden="true">${IC.target}</span><button class="main" data-act="openGoal" data-id="${g.id}"><div class="ttl">${esc(title)}</div><div class="meta">${esc(meta)}</div></button><span class="side">${dueLabel(m ? m.date : g.date)}</span></div>`;
}
function deadlinesOn(day) {
  const out = [];
  for (const g of S.goals.filter(x => x.status === 'active')) {
    if (g.date === day && progress(g).pct < 100) out.push({ g });
    for (const m of g.milestones) if (!m.d && m.date === day) out.push({ g, m });
  }
  return out;
}
function deadlinesOverdue() {
  const out = [];
  for (const g of S.goals.filter(x => x.status === 'active')) {
    if (g.date && g.date < TODAY && progress(g).pct < 100) out.push({ g });
    for (const m of g.milestones) if (!m.d && m.date < TODAY) out.push({ g, m });
  }
  return out;
}

function nextDate(day, r) {
  if (r.freq === 'daily') return addDays(day, r.interval);
  if (r.freq === 'weekdays') { let d = addDays(day, 1); while (mondayIndex(d) > 4) d = addDays(d, 1); return d; }
  if (r.freq === 'weekly') return addDays(day, 7 * r.interval);
  const d = parse(day); d.setMonth(d.getMonth() + (r.freq === 'yearly' ? 12 : r.interval)); return iso(d);
}
function completeTask(t) {
  const undo = snapshot(t);
  t.done = !t.done; t.doneAt = t.done ? TODAY : null;
  let next = null;
  if (t.done && t.repeat && (t.plan || t.due)) {
    next = { ...JSON.parse(JSON.stringify(t)), id: newId('t'), done: false, doneAt: null, plan: t.plan ? nextDate(t.plan, t.repeat) : null, due: t.due ? nextDate(t.due, t.repeat) : null };
    S.tasks.push(next);
  }
  return { next, undo: () => { undo(); if (next) S.tasks.splice(S.tasks.indexOf(next), 1); } };
}
A.toggleTask = el => {
  const t = task(el.dataset.id), { next, undo } = completeTask(t);
  render();
  toast(t.done ? (next ? `Završeno · sledeći put ${relDay(next.plan || next.due)}` : 'Zadatak je završen') : 'Zadatak je vraćen', undo);
};
