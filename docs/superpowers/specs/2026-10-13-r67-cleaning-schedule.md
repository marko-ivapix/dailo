# R67 — the Redovne obaveze examples follow a cleaning schedule

**Date:** 2026-10-13 · **Status:** the user asked for research ("da li mozes da mi istrazis za redovne obaveze - na koliko se sta cisti i menja i u kojoj prostoriji?"). After seeing it they said: "necemo ovo sto pise za svaki dan, i ne trebaju mi informacije zasto se nesto radi. ne treba: testiraj detektor dima, servis gasnog kotla. i mozes da ubacis". · **Release:** `2.0.0-alpha.94`.

## The change

- **The empty Redovne obaveze screen still offers its two examples,** "Primer: stan" and "Primer: kuća" (`addExamples` in `js/cleaning-ui.js`).
  - Both now add a researched cleaning and replacement schedule by room, in place of the old six or seven chores.
  - **Sources:** NSF, ADA, Sleep Foundation, Energy Star and appliance makers, read from search summaries.
- **Rooms:**
  - **Both examples:** Kuhinja (15), Kupatilo (10), Spavaća soba (8), Dnevna soba (10), Hodnik (5), Uređaji (6).
  - **The house also gets** Bašta with "Proveri spoljna svetla".
- **Rhythms:**
  - **Every 3 days:** usisaj hodnik, istresi otirač.
  - **Weekly:**
    - dezinfikuj sudoperu, mikrotalasna, pokvarena hrana iz frižidera;
    - očisti kupatilo (subtasks WC šolja, Tuš, Ogledalo, Pod), peškiri, prostirka, čaša za četkice;
    - posteljina, prašina i usisavanje;
    - pod u dnevnoj sobi;
    - kvake i prekidači.
  - **Every 2 weeks:** zameni sunđer, navlaka za jorgan.
  - **Monthly:**
    - filter aspiratora, program čišćenja mašine za sudove;
    - zavesa za tuš;
    - nameštaj i zavese usisati, radijatori;
    - otirač, cipelarnik i vrata;
    - program čišćenja veš mašine, filter usisivača oprati, kante za smeće, filter klime.
  - **Every 2 months:** filter u bokalu za vodu, prozori iznutra.
  - **Every 3 months:**
    - frižider, rerna, filter mašine za sudove, kamenac iz kuvala, ugljeni filter aspiratora;
    - četkice za zube, kamenac sa tuša;
    - dušek;
    - filter pumpe veš mašine.
  - **Every 4 months:** filter za vodu na slavini.
  - **Every 6 months:** rešetka iza frižidera, odmrzavanje zamrzivača, jorgan i ćebad, jastuci oprati, zavese, prozori spolja.
  - **Yearly:** zavesa za tuš zameniti, ispiranje bojlera, tepisi, ispuštanje vazduha iz radijatora, filter usisivača zameniti.
  - **Every 2 years:** jastuci.
  - **Every 4 years:** anoda bojlera.
- **Left out, as the user asked:**
  - the daily chores (counters, stove, sink, dish cloths, wiping the sink and tap);
  - every explanation (chores carry no notes);
  - the smoke alarm and the gas boiler service.
  - The old "Obriši radne površine" (daily) and "Proveri bojler" (replaced by the yearly flush) left the examples and the catalog.
- **First dates:**
  - Each chore starts on its own day from today, so Danas gets at most three on the first day.
  - The planned day and the due day are the same, as before.
- **Unchanged:**
  - Rooms, keys (`cleaning:<preset>:<room>:<chore>`) and the "second run adds only what is missing" rule stay.
  - Chores kept from the old examples (Usisaj, Obriši prašinu, Očisti kupatilo, Promeni posteljinu, Usisaj hodnik, Očisti frižider, Proveri spoljna svetla) keep their keys. A workspace that already has them gets only the new ones.

## Checks

- **Node:** `tests/cleaning-schedule-r67.test.js` was written first; 6 of its 7 tests failed. It covers:
  - the rooms of both examples;
  - 29 rhythms;
  - the bathroom subtasks;
  - no daily chores, no notes, no smoke alarm or boiler service;
  - the spread first dates;
  - the second run and validation;
  - the Serbian names;
  - the version.
- **Suites:**
  - `npm run verify`: 1229/1229.
  - `npm run smoke`: OK.
  - `npm run check:python`: 4/4.
  - `npm run check:links`: OK.
- **Manual-pending:** open Redovne obaveze on an empty workspace on the phone, tap "Primer: stan", and look at the rooms and the first dates.
