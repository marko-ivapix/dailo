# R71 — more examples: car and health dates, the meal-plan shopping list, saved views, gift ideas

**Date:** 2026-10-13 · **Status:**
- **The picks:** asked for more suggestions, the user picked 1 (car and motorcycle), 2 (without the ID card and licence), 3, 6 and 8. They left out 4, 5 and 7: "7, ovo imam u kalendaru na telefonu".
- **The pruning:** from the item lists they removed 14 (the monthly bills), 17 (the dermatologist), 18 (the flu jab) and 40 (the recipes note).
- **The shopping list:** for the shopping template they sent their own list as a picture ("Na slici je lista za kupovinu"). It is "Lista namirnica za kupovinu — za 4 dana plana ishrane".

**Release:** `2.0.0-alpha.98`.

## The change

All of this is added by "Popuni primerima" (`js/starter-examples.js`).

- **Redovne obaveze groups:** two projects with `isCleaningRoom`, after the lists.
  - **"Auto i motor"** (no area) has 13 chores:
    - **Yearly:**
      - registracija i tehnički pregled auta and registracija motora;
      - mali servis auta;
      - servis motora pred sezonu, from 1 March;
      - zimske gume, from 25 October (before winter equipment is required on 1 November);
      - letnje gume, from 10 April;
      - brisači and the first aid kit's expiry date.
    - **Monthly:** pritisak u gumama, ulje i tečnosti, and the motorcycle battery over the winter.
    - **Every 2 weeks:** the motorcycle chain and the car wash.
  - **"Zdravlje i računi"** (Zdravlje) has 4 chores:
    - zubar, every 6 months;
    - sistematski pregled, yearly;
    - kontrola vida, every 2 years;
    - porez na imovinu, every 3 months. It starts at the next instalment, due 45 days into a quarter: 14 February, 15 May, 14 August or 14 November.
  - **First days:** every chore starts after today. Its planned day is also its due day, with no notes.
- **The shopping template** "Nabavka za plan ishrane (4 dana)":
  - It is a task template for Namirnice, with the picture's 32 items and amounts as subtasks.
  - Order: proteins, carbohydrates, vegetables, fruit and nuts, fats and the rest.
  - Its note says "Za 8 dana udvostruči količine.", as the picture does.
- **Saved views:** Kupovina, Posao, Kuća and Zdravlje each show the open tasks with that tag. None is pinned.
- **The note** "Ideje za poklone" (Lično) has the lines Mama, Tata, Prijatelji and Kolege.
- **The toast** after "Popuni primerima" also counts the saved views (a new catalog key replaces the old one).
- **Redovne obaveze** (`js/cleaning-ui.js`):
  - The groups above fill the screen, which used to hide "Primer: stan" and "Primer: kuća".
  - Those two chips now stay at the end of the list until a cleaning example was added. A cleaning example is a group with a `cleaning:` sample key.

## Checks

- **Node:** `tests/more-examples-r71.test.js` was written first; all 8 of its tests failed. It covers:
  - both groups, their rhythms and first days, including the tax instalment from two dates;
  - the template's items, project and note, and an instance of it;
  - the saved views and what they show;
  - the note, validation and the second run;
  - the toast key and the cleaning chips;
  - the Serbian names and the version.
- **Older tests:** R67 and R70 now expect the groups, the template, the note and the new toast, each with an R71 comment.
- **Suites:**
  - `npm run verify`: 1247/1247.
  - `npm run smoke`: OK.
  - `npm run check:python`: 4/4.
  - `npm run check:links`: OK.
- **Manual-pending:** on the phone:
  - run "Popuni primerima";
  - look at Redovne obaveze, the template under Šabloni, and Sačuvani prikazi.
