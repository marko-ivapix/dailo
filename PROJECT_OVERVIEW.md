# Dailo — pregled projekta za brainstorming

Dailo je lokalna To-Do aplikacija za organizaciju zadataka, projekata, oblasti,
ciljeva, navika, beleški i resursa. Osnovni tok je:

**Capture → Organize → Plan → Complete**

## V1.5 — implementirane dopune

- Tasks imaju opciono trajanje, Today Focus red do tri zadatka i Daily Review. Quick Add prepoznaje završni datum/vreme; eksplicitno unete vrednosti imaju prednost.
- Goals prikazuju health i doprinos povezanih stavki. Habits imaju minimum/ideal ciljeve i grace dane sa pregledom oporavka; numerički ciljevi podržavaju razlomljene vrednosti.
- Calendar blokovi koriste postojeći task, planirano vreme i trajanje, uz oznaku preklapanja.
- Notes i Resources ostaju odvojeni. Podržani su isečci teksta, favoriti i lokalni filteri; Resources dodatno imaju tip, status čitanja, autora i datum poslednjeg pregleda.
- Templates podržavaju promenljive i jednokratno zakazano kreiranje zadataka. Provera radi posle čuvanja dospelog rasporeda, pri pokretanju i na 30 sekundi dok je aplikacija otvorena. Propušten datum izvršava se jednom pri sledećoj spremnoj proveri; datumi/promenljive ostaju vezani za prvobitno zakazani dan. Task trajanje i Habit minimum/ideal/grace podešavanja čuvaju se u template-u bez istorije izvršavanja. Today zadržava naslov/datum na vrhu, zatim pinovane sekcije; Up/Down menja red unutar iste grupe.
- Čuva se najviše pet automatskih lokalnih kopija, najčešće jednom u pet minuta nakon čuvanja. Kopije sadrže metadata, fajlove, Habit logove i Goal istoriju. Kopije prekinutih operacija čuvaju se zasebno.
- Settings → Data → Local snapshots vraća jednu izabranu stavku sa njenim fajlovima/istorijom. Povezane stavke moraju već postojati. Pre zamene nastaju sigurnosni ZIP i interna kopija, pa se zahteva unos RESTORE. Kratkotrajni Undo važi dok nije bilo novih izmena; neuspešna provera ne prepisuje novije podatke.
- Jasno su odvojene greške čuvanja podataka od grešaka automatske kopije, uz Retry. Uvažava se reduced-motion podešavanje.

Node testovi pokrivaju podatke, UI module, ZIP i selektivni recovery; izolovana provera u browseru ostaje zaseban korak kada okruženje dozvoljava pokretanje browsera/lokalnog servera. Pitanja za brainstorming ispod su ranije zabeležene ideje, a nisu potvrda da su sve navedene opcije u opsegu.

## 1. Today i Upcoming

- **Today** prikazuje današnje zadatke, zakasnele stavke, zakazane navike,
  aktivne ciljeve i relevantne milestones.
- **Upcoming** prikazuje buduće zadatke, sledeće zakazane navike, ciljeve i
  milestones koji uskoro dolaze.
- Stavke su izvedeni prikazi nad istim podacima, pa se izmena vidi svuda.
- Dostupne su brze akcije poput pomeranja, odlaganja i završavanja.

**Za brainstorming:** da li Today treba da bude strogo dnevni plan ili i
"command center" sa prioritetima, energijom i fokusom?

## 2. Tasks

Task može imati naslov, opis, status, prioritet, planirani datum/vreme, due
datum/vreme, reminder, projekat, Area, Goal, tagove, podzadatke, ponavljanje,
Important/Urgent oznake, Focus i fajlove.

- **Quick Add** služi za brzo hvatanje ideje ili obaveze.
- **Inbox** čuva još neobrađene stavke.
- `Plan for` označava kada planiramo rad, a `Due date` krajnji rok.
- Podržani su Today, Tomorrow, drag-and-drop pomeranje, duplikat i Undo.
- Ponavljanje može biti dnevno, nedeljno, mesečno ili po prilagođenom intervalu.
- Task Properties otvara detaljne opcije, uključujući attachments.

**Za brainstorming:** da li task treba da ima procenu trajanja, energiju,
status "waiting", checklistu sa više nivoa ili zavisnosti od drugih taskova?

## 3. Projects i Areas

- **Projects** predstavljaju konkretne rezultate ili veće celine rada.
- **Areas** predstavljaju trajne oblasti života, npr. Work, Health, Home ili
  Finance.
- Area Detail može da prikaže povezane projekte, taskove, ciljeve, beleške i
  resurse.
- Podržani su pinovanje, ručni redosled, arhiviranje i vraćanje iz arhive.
- Nova stavka može da nasledi Area kontekst; brisanje Area ne briše povezane
  zapise, već uklanja njihovu Area vezu.

**Za brainstorming:** da li Areas treba da imaju vlasnika, boju, ikonicu,
budžet, health indikator ili svoje rutine i nedeljni pregled?

## 4. Goals

Goals podržavaju horizonte **Short-term**, **Mid-term**, **Long-term** i grupu
**By month** prema ciljnom mesecu.

- Goal može imati opis, rok, reminder, status i procenat napretka.
- Progress može biti ručni ili izveden iz povezanih Tasks, Projects i Habits.
- **Milestones** dele veliki cilj na proverljive korake.
- Detail prikazuje povezane stavke, istoriju napretka i rokove.
- Na 100% aplikacija prikazuje prompt za potvrdu završetka ili nastavak rada.

**Za brainstorming:** da li cilj treba da ima početnu vrednost, metriku,
ciljanu brojku, plan akcija, motivacionu belešku ili automatski nedeljni review?

## 5. Habits

Habits imaju rutine **Morning**, **Daily** i **Night**, kao i raspored koji
određuje kada su aktivne.

- Podržani su checkbox habit i numeric habit (npr. broj minuta ili količina).
- Mesečna tabela omogućava čekiranje prethodnih dana; budući dani su
  onemogućeni.
- Prikazuju se streak, procenat izvršenja, trend i grafikon.
- Postoje reminders, snooze, pause/resume, skip i end conditions.
- Istorija se čuva nezavisno od trenutnog stanja navike.
- Nedeljni target može biti različit od svakodnevnog rasporeda.

**Za brainstorming:** da li dodati nivoe težine, minimum/ideal cilj, grace day,
motivacione bedževe, povezivanje sa Goal-om i automatske sugestije za bolji
raspored?

## 6. Calendar i planiranje

- **Week** i **Month** prikazuju Task, Habit, Goal i Milestone stavke.
- **Day Detail** prikazuje detalje izabranog dana.
- Planirani i due termini imaju odvojeno značenje.
- Drag-and-drop i forme za Calendar mogu da kreiraju ili pomere stavke.
- Conflict hints ukazuju na preklapanje termina.

**Za brainstorming:** da li dodati time-blocking, trajanje taska, kalendar po
Area/Project boji, radno vreme, vremenske zone ili sinhronizaciju sa spoljnim
kalendarom?

## 7. Notes i Resources

Notes i Resources su zasebne kolekcije, odvojene od Goals i Habits.

- Oba tipa imaju naziv, opcioni opis, Area i tagove.
- Resource obavezno može da čuva URL/link, sliku ili fajl.
- Podržani su attachments, odnosi prema drugim zapisima i kontekstualni prikaz
  iz Area Detail-a.
- Resource može da se poveže sa Task-om, Project-om, Goal-om ili Habit-om.

**Za brainstorming:** da li dodati tip resursa, autora, datum pregleda,
favorit, status "pročitano", preview slike, tekstualni clipping ili web import?

## 8. Templates, Saved Views i shortcuts

- Templates postoje za Task, Project, Habit i Goal.
- Mogu se sačuvati relativni datumi, ponavljanje i podrazumevane veze.
- Postoje Saved Views za filtrirane prikaze Tasks, Goals i Habits.
- Views mogu biti pinovane, a shortcut mapiranje je prilagodljivo uz proveru
  konflikata i reset na podrazumevane prečice.

**Za brainstorming:** da li dodati javne/privatne template kolekcije, template
varijable, automatsko kreiranje po rasporedu ili deljenje Saved View-a?

## 9. Quick Add i mobilni interfejs

- Quick Add meni omogućava brzo dodavanje Task-a, Goal-a, Habit-a i drugih
  tipova.
- Na mobilnom prikazu je plutajuće dugme sa plusom i većim touch targetima.
- Task se može završiti swipe gestom udesno.
- Focus stanje, tastatura i modalni prozori imaju pristupačne focus stilove.

**Za brainstorming:** da li dodati glasovni unos, predloge na osnovu teksta,
quick-add komande poput `tomorrow`, skeniranje slike ili offline queue?

## 10. Backup, recovery i Undo

- Podaci se mogu izvesti i uvesti kroz ZIP backup.
- Backup uključuje metadata, V3 podatke, attachments, Habit logs i Goal history.
- Pre rizičnih operacija kreiraju se safety snapshot i recovery ZIP.
- RESET i RESTORE zahtevaju eksplicitno kucanje potvrde.
- Brisanje entiteta koristi potvrdu, zatim Undo prozor; povezani podaci i fajlovi
  se čuvaju gde je to potrebno.

**Za brainstorming:** da li dodati automatski backup, više snapshot verzija,
šifrovanje, cloud destinaciju, diff između backup-a ili "restore one item"?

## Kako je projekat napravljen

- Vanilla HTML/CSS/JavaScript, bez frameworka i backend-a.
- Metadata je u `localStorage`, a fajlovi, Habit logs i Goal history u
  IndexedDB.
- `js/core.js` sadrži pravila i izračunavanja.
- `js/*-ui.js` moduli prikazuju pojedinačne delove aplikacije.
- `js/app.js` povezuje rute, modalne prozore, događaje i čuvanje podataka.
- Today, Upcoming, Calendar i Saved Views su izvedeni prikazi nad istim zapisima.

## Pokretanje

```bash
python3 -m http.server 8080
```

Zatim otvoriti `http://localhost:8080`.

## Trenutni status

V1.5 prototip je upakovan u `Dailo-v1.5-distributable.zip`. Node suite ima
146/146 prolaznih testova posle završnih ispravki I1–I6, uz 2/2 testa browser adaptera. JavaScript sintaksa, diff i integritet oba čista ZIP paketa provereni su, kao i poklapanje fajlova sa izvornim kodom.
Browser/visual acceptance je dokumentovano odložena jer trenutno okruženje ne
dozvoljava pokretanje izolovanog test browsera; lični Google Chrome nije otvaran.
