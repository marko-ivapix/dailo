# Redesign prototypes

Clickable HTML mockups made during the 2026-10 redesign review. Each one illustrates decisions in
`docs/superpowers/specs/2026-10-08-redesign-decisions.md`, which cites them by file name. They are design
references only: they are not part of the app, are not loaded by `index.html`, are not in the `sw.js`
precache and are not in the distributable ZIP. The UI text is Serbian, like the app.

Open any file directly in a browser (desktop or phone). Nothing is saved: a reload restores the sample data.
The sample day is Thursday, 8 October 2026.

| File | Shows | Decisions |
| --- | --- | --- |
| `dailo-prototip.html` | **Combined prototype:** every decided screen in one phone frame, joined by the bottom navigation and sharing one set of data; since 2026-10-09 also the smaller screens (areas, notes and resources, recurring tasks ("Redovne obaveze", formerly cleaning), weekly review, tags, templates, saved views, completed, archived projects, search, focus, habit details) and the shared repeat editor (S15) | all, S1–S15 |
| `dailo-racunar.html` | **Desktop prototype** (1280 × 800): the same parts plus the desktop layer (`zbirni/60-desktop.css`, `60-desktop.js`): sidebar, centered windows, the floating "+", popovers, two columns, the 7-column week and the month with titles, drag and drop, shortcuts | K1–K12 |
| `danas-predlog.html` | Today: sections, limits, habit rows | T1–T7 |
| `navike-predlog.html` | Early habit-row options for Today | T4, T5 |
| `kalendar-predlog.html` | Calendar month with the day list and the "Raspored" view | C1–C9 |
| `zadatak-prototip.html` | Task window with every picker sheet | D1–D4, E1–E9 |
| `navike-ekran.html` | Habits screen, proposals 1 and 2 | H1–H3 |
| `navike-dan-nedelja.html` | Habits Dan / Nedelja, week rings, per-habit bars, month chart | H1–H7 |
| `nova-navika.html` | New habit window, "Više" and the frequency sheet | N1–N6 |
| `ciljevi-predlog.html` | Goals list, goal window, new goal | GO1–GO7 |
| `jos-podesavanja.html` | "Još" and Settings | M1–M6 |
| `zadaci-predlog.html` | Zadaci: Kad stignem / Projekti, suggestions, project screen | Z1–Z7 |
| `inbox-predlog.html` | Inbox list, filters and "Razvrstaj redom" | I1–I6 |

## Combined prototype sources

`zbirni/` holds the parts of `dailo-prototip.html`: the stylesheet (`00-head.html`), the phone markup
(`10-body.html`), one script per screen or window (`20-core.js` … `54-repeat.js`) and the closing tags
(`99-tail.html`). Edit the parts, then rebuild:

```bash
sh docs/design/prototipovi/zbirni/build.sh
```

The script joins the parts into `dailo-prototip.html` and, with the desktop layer, into `dailo-racunar.html`, and runs `node --check` on both joined scripts. During the
review the prototypes were also driven in jsdom (every screen, sheet and flow, no script errors). They have not
been checked in a real browser by Claude; visual review is the user's.
