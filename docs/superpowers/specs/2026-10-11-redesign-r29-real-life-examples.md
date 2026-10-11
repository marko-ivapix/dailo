# Redesign R29 — real-life starter examples (design)

**Date:** 2026-10-11 · **Status:** asked for by the user ("ovo popuni primere je dobro, ali mislim da mozes jos toga da dodas iz stvarnog zivota … navike, ciljevi, bucket list, oznake, projekti … listu za kampovanje"). It adds example records only, so there is no new data field and no migration. One normalization repair is listed under "Fix" · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.54`.

## Why

Settings → Podaci → "Popuni primerima" filled the workspace with abstract samples ("Isplaniraj nedelju", "Portfolio za karijeru"). The user wants examples from everyday life that show what each part of the app is good for, such as a camping packing list.

## Research the content follows

- **Habits:** health habits lead in surveys of what people track: water, steps, sleep, exercise, reading and meditation.
- **Goals:** the most common resolutions are to save money, exercise more, eat healthier, spend time with family and grow personally (Statista, YouGov 2025).
- **Bucket lists:** travel to landmarks and natural wonders leads, followed by health, a money goal and a once-in-a-lifetime experience such as skydiving.
- **Camping checklist:** common checklists (WeRoad, Home Depot, Pitchup) group it as follows:
  - shelter and sleep;
  - kitchen and water;
  - layered clothing and rain gear;
  - first aid and hygiene.
  They also warn about what is often forgotten: toilet paper, batteries, spare stakes and chargers.
- **Health figures:** WHO recommends 150–300 minutes of moderate activity a week for adults.
- **Emergency numbers:** the Serbian numbers are 192 (police), 193 (fire service), 194 (ambulance) and 1987 (AMSS roadside assistance); 112 from a mobile phone reaches 192.

## Behavior

1. **The button stays the same.** "Popuni primerima" still adds the first set (areas, routines, cleaning rooms) and then the new real-life set from `js/starter-examples.js` (`DailoStarterExamples.realLifeExamples`). Both sets are added in one save. If the save fails, both are removed together.
2. **Each item is added once.** Every example has a stable `sampleKey` (`workspace-starter-v2:<kind>:<key>`). A later run skips an example when its key or its name already exists (names compared case-insensitively). This means:
   - A deleted example comes back on the next run, alone.
   - The user's own tag or task with the same name is reused, never duplicated.
3. **What the set contains** (Serbian in the app; the English source strings are the catalog keys):
   - **Tags (7):** Brzo (5 min), Na čekanju, Telefon, Računar, Kupovina, Jednog dana, Malo energije. The colors are hex values.
   - **Habits (10):**
     - Numeric habits with quick values: Popij 2 litra vode (2 l; 0.25 and 0.5), 10.000 koraka, Pet porcija voća i povrća.
     - Morning: Namesti krevet, Meditacija 10 minuta.
     - Weekdays: Španski 15 minuta.
     - Twice a week: Pozovi roditelje ili prijatelja.
     - Evening: Upiši troškove, Bez telefona sat pre spavanja, Zapiši tri lepe stvari iz dana.
     - Each habit goes in the first set's matching area, when that area exists.
   - **Projects (4), with their tasks:**
     - **Kampovanje na Tari:**
       - Rezerviši mesto u kampu (due in 14 days) and Proveri vremensku prognozu.
       - Five "Spakuj: …" tasks whose 37 subtasks are the packing list: šator i spavanje, kuhinja i voda, odeća, prva pomoć i higijena, često se zaboravi.
       - Ostavi kamp čistijim nego što je bio.
     - **Bucket lista:** ten undated dreams tagged "Jednog dana":
       - polarna svetlost, Japan u vreme cvetanja trešanja, skok padobranom;
       - Bobotov kuk, rafting na Tari, let balonom, ronjenje;
       - izlazak sunca na Rtnju, nacionalni parkovi Srbije, instrument.
     - **Selidba u novi stan:** eight tasks, among them:
       - the moving-company offers (due in 7 days);
       - "Spakuj kutiju za prvu noć" with subtasks;
       - the meters, the internet, registering the address with the police, and the deposit ("Na čekanju").
     - **Proslava rođendana:** six tasks, among them the invitations (due in 10 days) and the cake (due in 17 days).
   - **Recurring chores (8)** for Redovne obaveze. Each has a first planned and due date:

     | Chore | Repeats |
     | --- | --- |
     | Plati račune | monthly |
     | Promeni posteljinu | every 2 weeks |
     | Proveri pritisak u gumama | monthly |
     | Zameni filter za vodu | every 3 months |
     | Proveri rokove trajanja lekova | every 6 months |
     | Kontrola kod zubara | every 6 months |
     | Sačuvaj kopiju fotografija sa telefona | monthly |
     | Registracija i tehnički pregled automobila | yearly |
   - **Goals (5):**
     - Pročitaj 12 knjiga za godinu dana: numeric, 0 / 12 knjiga.
     - Istrči polumaraton: five milestones from 5 km to 21.1 km, the last on the target date.
     - Fond za hitne slučajeve za tri meseca: three milestones.
     - Nauči španski do nivoa A1: linked to the Spanish habit, 60 check-ins, with two milestones.
     - Provodi više vremena u prirodi: linked to the camping project, all tasks.
     - **How links are made:** a link is written on both sides only when this run also adds the habit or project. An existing item is never changed.
   - **Notes (5):**
     - Ideje za poklone, Knjige za čitanje (Andrić, Selimović and others).
     - Filmovi i serije za gledanje, Recept: proja.
     - Hitni brojevi (192, 193, 194, 1987, 112).
     - Note bodies are built from lines, so no catalog key holds a line break.
   - **Resources (5), with real links:**
     - Planinarski savez Srbije (`https://www.pss.rs`).
     - Nacionalni park Tara (`https://www.nptara.rs`).
     - Ne ostavljaj trag: sedam principa (`https://lnt.org/why/7-principles/`).
     - SZO: fizička aktivnost (`https://www.who.int/europe/news-room/fact-sheets/item/physical-activity`).
     - Atomske navike (book, James Clear, `https://jamesclear.com/atomic-habits`).
     - They are related to the camping project, the nature goal, the steps habit and the half-marathon goal.
   - **Templates (2):**
     - "Pakovanje za put": a task template with ten subtasks, documents through headphones.
     - "Vikend na kampovanju": a project template made from the camping project with `Core.templateFromEntity`. Its goal links are cleared, so a new camping weekend does not join the example goal.
4. **The toast** now counts templates as well: "… resursi: {resources}, šabloni: {templates}. Svi primeri mogu da se menjaju."
5. **The Settings row** describes the examples as everyday-life examples: habits, goals, a bucket list, a camping list, recurring chores, tags, notes, resources and templates.
6. **No journal entries are added.** The journal is personal.

## Fix

- **The bug:** the first set saved its linked goals with `progressType: 'linkedTasks'`. Backup validation accepts only `percentage` or `numeric`, so after "Popuni primerima" an export (and the R27 automatic backup) failed with "Nevažeća rezervna kopija: progressType".
- **The first-set fix:** it now saves `percentage`.
- **The repair on load:** `Core.normalizeState` reads any other stored `progressType` as `percentage`. A linked goal does not use the field, and a manual goal already treated an unknown value as a percentage, so nothing on screen changes.

## Files

- **New module:** `js/starter-examples.js`. It works in the browser and in Node, is loaded before `js/habits-ui.js` and is precached in `sw.js`.
- **Changed:**
  - `js/habits-ui.js` (`addStarterExamples`);
  - `js/settings-ui.js` (the row text);
  - `js/core.js` (`normalizeState`);
  - `js/i18n-sr.js` (170 Serbian entries; the toast and the Settings text changed).
- **Test:** `tests/redesign-r29.test.js`.

## Checks

- **Node:**
  - every part of the set;
  - idempotency, a single example coming back, and reuse of the user's own names;
  - rollback on a failed save;
  - state validation and `Backup.validateDomain` on the whole example workspace;
  - instantiating both templates;
  - Serbian names with the catalog loaded;
  - the script order and precache;
  - the version.
- **Manual-pending:** the look of the examples on a phone.
