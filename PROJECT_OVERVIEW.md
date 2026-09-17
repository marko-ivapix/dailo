# Dailo — kratak pregled projekta

Dailo je lokalna To-Do aplikacija za organizaciju svakodnevnog rada, ciljeva i navika.

## Glavne funkcionalnosti

- **Today / Upcoming:** prikaz današnjih, zakasnelih i budućih Tasks, Habits, Goals i Milestones.
- **Tasks:** Quick Add, Inbox, planirani/due datumi i vremena, prioritet, Important/Urgent, Focus, tagovi, projekti, ciljevi, podzadaci, ponavljanje i fajlovi.
- **Projects i Areas:** organizacija rada po projektima i oblastima; pinovanje, arhiviranje i nasleđivanje Area vrednosti.
- **Goals:** kratkoročni/srednjoročni/dugoročni ciljevi, ručni ili povezani progress, Milestones, reminders, istorija i prompt na 100%.
- **Habits:** jutarnje/dnevne/noćne rutine, checkbox ili numeric tracking, rasporedi, streaks, reminders, snooze i mesečna tabela sa grafikonom.
- **Calendar:** Week/Month/Day Detail prikaz Tasks, Habits, Goals i Milestones, planiranje vremena i conflict hints.
- **Notes i Resources:** odvojene kolekcije sa Area/tag vezama, linkovima, odnosima i fajlovima.
- **Templates i Saved Views:** šabloni za Task/Project/Habit/Goal i sačuvani filtrirani prikazi.
- **Quick Add i mobile UI:** brzi meni, veći touch targeti i swipe završavanje Task-a.
- **Backup i Undo:** ZIP backup/restore, safety snapshot, typed RESET/RESTORE i Undo za brisanje.

## Kako radi

- Vanilla HTML/CSS/JavaScript, bez frameworka i backend-a.
- Podaci se čuvaju lokalno: metadata u `localStorage`, fajlovi, Habit logs i Goal history u IndexedDB.
- Today, Upcoming, Calendar i Saved Views su izvedeni prikazi nad istim podacima.
- `js/core.js` sadrži pravila i izračunavanja, `js/*-ui.js` prikaz po modulima, a `js/app.js` povezuje rute, modalne prozore i čuvanje podataka.

## Pokretanje

```bash
python3 -m http.server 8080
```

Zatim otvoriti `http://localhost:8080`.

## Trenutni status

V1.4 prototip je upakovan u `Dailo-v1.4-distributable.zip`. Node suite ima 88/88 prolaznih testova, a izolovani browser/migration/safety testovi su prošli.
