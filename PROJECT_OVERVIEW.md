# Dailo — pregled projekta i brainstorming

> Current implementation: V1.7 behavior, V1.8 visual layer and V1.9 beta-ready additions (Serbian UI, install, offline, data protection; merged into `main` through PR #5), completed as V1.9.1 (problem-report address, tester guide `uputstvo.html`, beta checklist `docs/beta/provera-pre-bete.md`; merged through PR #6), plus V1.10 Smart Quick Add (version `1.10.0`, pending merge into `main` through its PR). For agent onboarding and verified source facts, read `CLAUDE.md` and `docs/claude/` first. The brainstorming questions below are ideas, not accepted requirements.

Dailo je lokalna To-Do aplikacija za organizaciju zadataka, projekata, oblasti,
ciljeva, navika, beleški i resursa. Osnovni tok je:

**Capture → Organize → Plan → Complete**

## V1.6 — implementirane dopune

- Tasks imaju opciono trajanje, Today Focus red do tri zadatka i Daily Review. Quick Add prepoznaje završni datum/vreme; eksplicitno unete vrednosti imaju prednost.
- Goals prikazuju health i doprinos povezanih stavki. Habits imaju minimum/ideal ciljeve i grace dane sa pregledom oporavka; numerički ciljevi podržavaju razlomljene vrednosti.
- Calendar blokovi koriste postojeći task, planirano vreme i trajanje, uz oznaku preklapanja.
- Notes i Resources ostaju odvojeni. Podržani su isečci teksta, favoriti i lokalni filteri; Resources dodatno imaju tip, status čitanja, autora i datum poslednjeg pregleda.
- Templates podržavaju promenljive i jednokratno zakazano kreiranje zadataka. Provera radi posle čuvanja dospelog rasporeda, pri pokretanju i na 30 sekundi dok je aplikacija otvorena. Propušten datum izvršava se jednom pri sledećoj spremnoj proveri; datumi/promenljive ostaju vezani za prvobitno zakazani dan. Task trajanje i Habit minimum/ideal/grace podešavanja čuvaju se u template-u bez istorije izvršavanja. Today zadržava naslov/datum na vrhu, zatim pinovane sekcije; Up/Down menja red unutar iste grupe.
- Čuva se najviše pet automatskih lokalnih kopija, najčešće jednom u pet minuta nakon čuvanja. Kopije sadrže metadata, fajlove, Habit logove i Goal istoriju. Kopije prekinutih operacija čuvaju se zasebno.
- Settings → Data → Local snapshots vraća jednu izabranu stavku sa njenim fajlovima/istorijom. Povezane stavke moraju već postojati. Pre zamene nastaju sigurnosni ZIP i interna kopija, pa se zahteva unos RESTORE. Kratkotrajni Undo važi dok nije bilo novih izmena; neuspešna provera ne prepisuje novije podatke.
- Jasno su odvojene greške čuvanja podataka od grešaka automatske kopije, uz Retry. Uvažava se reduced-motion podešavanje.
- Inbox sada ima All / Tasks / Goals / Habits / Notes / Resources filtere, grupisanje po datumu i uklanjanje iz Inbox-a bez brisanja zapisa.
- Na mobilnim i tablet širinama postoji stalna donja navigacija za Today, Inbox, Calendar, Goals i Habits. Quick Add je plutajući kružni meni, sa istim rasporedom i na desktopu.

Node testovi pokrivaju podatke, UI module, ZIP i selektivni recovery; izolovana provera u browseru ostaje zaseban korak kada okruženje dozvoljava pokretanje browsera/lokalnog servera. Pitanja za brainstorming ispod su ranije zabeležene ideje, a nisu potvrda da su sve navedene opcije u opsegu.

## V1.7 — stabilizacija i ciljano poliranje

- Donja navigacija na užim ekranima zadržava Today, Inbox, Calendar, Goals i Habits, a `More` otvara sve ostale rute bez promene hash navigacije.
- Dijalozi i popoveri imaju imenovanje i dosledan fokus; Area tabovi koriste semantičke tabove, a primarne mobilne kontrole ostaju touch-safe.
- Regresioni runner razdvaja statičke/automatizovane provere od scenarija koji zahtevaju user-owned browser. Pokriveni su reload, attachments, Delete → Undo, Reset/Restore, drag-and-drop, Escape/fokus, mobilna navigacija i kompaktni touch layout.
- Validacija podataka i ZIP/recovery tokovi imaju recipročne Goal veze, timestamp/ID proveru, limite veličine i stale-tab zaštitu.
- Ciljano je zbijen prikaz mobilnih filtera, Notes/Resources/Areas listi i Calendar Day Detail-a. Nema širokog redesign-a.
- Globalni Search ostaje nepromenjen, a bulk selekcije i bulk akcije nisu dodate.

V1.7 status i tačni brojevi provera vode se u `docs/superpowers/progress-v1-7.md`. Native browser provera je **manual-pending** dok ne bude izvršena u user-owned browseru; statičke i Node provere nisu zamena za vizuelnu ili stvarnu browser potvrdu.

## V1.8 — vizuelni redizajn (Quiet Graphite / Swiss Compact)

- Samo vizuelna promena preko V1.7 ponašanja: bez izmene šeme podataka, Search-a, recovery tokova, entiteta ili značenja navigacije, i bez novih zavisnosti.
- Grafitne neutralne boje i tanke linije umesto punih kartica; manji radijusi (4/6/8/12px); senke samo na overlay elementima; bez blur-a i glow-a.
- Space Grotesk za naslove i brojeve, Geist za sve ostalo; električno plava za primarne akcije, svetlija plava za fokus i aktivnu navigaciju, mint za završeno, žuta za upozorenje, crvena za opasnost/kašnjenje.
- Sidebar ponovo 240px/72px; donja navigacija sa indikatorom aktivne rute; More sheet pri dnu ekrana; Quick Add kao zaobljeni kvadrat od 44px.
- Segmentirane kontrole (Inbox filteri, Calendar Week/Month, tipovi Template-a), podvučeni Area tabovi, obojene trake po tipu u Calendar-u.
- Vidljiv fokus prsten, podrška za `prefers-contrast: more` i forced-colors, loading indikator koji poštuje reduced motion; touch mete na telefonu ostaju 44px.

Detalji: `docs/superpowers/specs/2026-10-07-todo-v1-8-design.md` i `docs/superpowers/progress-v1-8.md`. Vizuelna provera u pravom browseru je **manual-pending**. Globalni Search ostaje nepromenjen, a bulk akcije nisu dodate.

## V1.10 — pametno brzo dodavanje (trenutno izdanje)

Ceo zadatak može da stane u jedan red brzog dodavanja, na srpskom ili engleskom, a ispod naslova se odmah vidi šta je Dailo prepoznao. Verzija je `1.10.0`.

```text
Pošalji ponudu +Klijenti #posao !visok rok petak 45min sutra u 9:30
```

Rezultat: naslov „Pošalji ponudu”, projekat Klijenti, oznaka `posao`, visok prioritet, rok u petak, trajanje 45 minuta, planirano za sutra u 9:30.

- **Na kraju naslova**, bilo kojim redom i po jedan od svake vrste:
  - kada: `danas`, `sutra`, `prekosutra`, dani u nedelji (`u sredu`), `za 3 dana`, `za 2 nedelje`, `15.10.`, `15.10.2026.`; na engleskom `today`, `tomorrow`, `in 3 days`, `2026-10-15`;
  - vreme: `u 9:30`, `at 09:30`;
  - rok: `rok petak`, `do petka`, `do sutra`, `do 15.10.`, `due friday`;
  - trajanje: `45min`, `45 min`, `45m`, `1h`, `1,5h`, `1h30`, `1h 30min`, `2 sata` (od 1 do 1440 minuta).
- **Bilo gde u naslovu:** `#oznaka`, `!visok`/`!srednji`/`!nizak` (i `!high`/`!medium`/`!low`), `+projekat`, `@oblast`. Imena se porede slobodno: velika i mala slova, razmaci, `_`, `-` i dijakritici se zanemaruju, pa `+kucni_projekat` nalazi „Kućni projekat”. Arhivirani projekti i oblasti se preskaču. Nepoznato ime ostaje u naslovu i ništa se ne pravi automatski. Važi prvi prioritet u naslovu, a projekat ima prednost nad oblašću.
- **Šta ostaje kako je napisano:** čitanje staje na prvoj običnoj reči, a bar jedna reč uvek ostaje naslov. Neispravna vrednost (`25:00`, `31.02.`, `0min`) ostavlja kraj naslova netaknut. `do 17:00` i dan posle `za` (`za nedelju`) se ne prepoznaju.
- **Izbor u brzom dodavanju ima prednost.** Datum, vreme, rok, trajanje, projekat ili oblast izabrani dugmićima ispod naslova jači su od prepoznatog teksta. Zadatak sa prepoznatim projektom ili datumom ne ide u Inbox.
- **Pregled uživo.** Dok se kuca, ispod naslova se prikazuje šta je prepoznato („Prepoznato u naslovu”): datum i vreme, rok, trajanje, projekat ili oblast, oznake i prioritet. Kada ništa nije prepoznato, ovaj red se ne vidi.
- `uputstvo.html` opisuje novu sintaksu. Glasovni unos nije u planu: diktiranje na iPhone tastaturi već upisuje tekst u polje naslova.

Detalji: `docs/superpowers/specs/2026-10-08-todo-v1-10-design.md`, `docs/superpowers/plans/2026-10-08-todo-v1-10.md` i `docs/superpowers/progress-v1-10.md`. Automatske provere su prošle (348 Node testova, svih 348 prošlo). V1.10 stiže u `main` kroz svoj PR. Za V1.10 se ne pravi novi ZIP paket; sledeći je planiran posle V1.12. Upotreba nove sintakse i pregleda na iPhone-u je **manual-pending**.

## V1.9 — spremno za beta testiranje (V1.9.1)

Cilj je mala beta grupa na iPhone-u (Safari), i dalje bez backend-a, naloga i sinhronizacije; to stiže sa V2.0 mobilnom aplikacijom.

- **Instalacija na početni ekran.** U Safariju: Deli → Dodaj na početni ekran → Dodaj. Podešavanja → Opšte → Instaliraj aplikaciju prikazuje ove korake ili potvrdu da je aplikacija instalirana. Safari i instalirana aplikacija čuvaju podatke odvojeno: prvo instalirati, pa tek onda koristiti; postojeći podaci se prenose ZIP izvozom i uvozom.
- **Rad bez interneta.** Fontovi i Phosphor ikonice su lokalni, sa licencama; CDN se više ne koristi. Service worker čuva osnovne fajlove aplikacije u kešu označenom verzijom. Nova verzija čeka dok korisnik ne dodirne „Osveži”; stranica se nikad ne osvežava sama.
- **Zaštita podataka.** Aplikacija traži od browsera trajno čuvanje (`navigator.storage.persist()`) pri prvom dodiru u sesiji ili iz Podešavanja → Podaci → Trajno čuvanje, gde se vidi i status. Today prikazuje podsetnik kada je poslednja rezervna kopija starija od zadatog broja dana (podrazumevano 7; Isključeno / 3 / 7 / 14 / 30), sa izvozom jednim dodirom i opcijom „Podseti me sutra” (24 sata).
- **Srpski interfejs.** Sve je na srpskom (latinica, `sr-Latn`), uključujući natpise u Search prozoru; ponašanje Search-a je isto. Datumi i brojevi koriste `sr-Latn-RS`. Potvrde i dalje traže kucanje `RESET` i `RESTORE`.
- **Quick Add na srpskom.** Na kraju naslova se prepoznaju `danas`, `sutra` i dani u nedelji, sa i bez dijakritika, i posle `u` (npr. `u sredu`, `cetvrtak`), kao i vreme `u 9:30`. Engleske reči i dalje rade. V1.10 proširuje ovu sintaksu (gore).
- **Verzija i prijava problema.** Verzija (`1.9.1` u tom izdanju, sada `1.10.0`) se vidi u kartici Podešavanja → O aplikaciji. „Prijavi problem” otvara e-mail na adresu `marko.radicevic@ivapix.cloud` (zadata u V1.9.1) sa verzijom i podacima o uređaju, bez podataka iz aplikacije.
- **Uputstvo i provera pre bete (V1.9.1).** Podešavanja → O aplikaciji → „Uputstvo za beta testere” otvara `uputstvo.html`: kratko uputstvo na srpskom (instalacija na iPhone, podaci na uređaju, rezervne kopije, brzo dodavanje, rad bez interneta i nove verzije, ograničenja, prijava problema). Stranica nije u kešu service worker-a, pa se otvara samo sa internetom. `docs/beta/provera-pre-bete.md` je ručna provera B1–B24 pre slanja testerima.
- **Ispravke.** V1.9.1 prevodi još dva engleska teksta: oznaku „Planiraj za” u brzom dodavanju dok se kuca i red „Provera:” u Podešavanja → Podaci posle uvoza ili resetovanja. Zvezdica omiljene beleške ili resursa ponovo se vidi; početak nedelje se svuda tumači isto; uklonjen je zastareli red o početku nedelje iz opštih podešavanja; ID-jevi se prave i bez `crypto.randomUUID` (npr. na lokalnoj HTTP adresi).

Detalji: `docs/superpowers/specs/2026-10-07-todo-v1-9-design.md`, `docs/superpowers/plans/2026-10-07-todo-v1-9.md` i `docs/superpowers/progress-v1-9.md`. Automatske provere su prošle (335 Node testova, svih 335 prošlo, 0 na čekanju). Korisnik je 2026-10-08 na iPhone-u potvrdio instalaciju, raspored, rad u avionskom režimu, srpski interfejs i brzo dodavanje, zvezdicu, trajno čuvanje i izvoz/uvoz ZIP-a (B1–B5). Ponuda nove verzije (B6), ostatak provere (B7–B24) i podsetnik za rezervnu kopiju (pojavljuje se tek 7 dana posle izvoza) su **manual-pending**. Paket je `Dailo-v1.9.1-distributable.zip` (V1.9.0 nije pakovan).

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

## 8. Cleaning workspace

Cleaning koristi postojeće Projects i Tasks, bez nove persistence kolekcije.

- Room Project dobija oznaku `isCleaningRoom`.
- Chore je običan Task unutar tog Project-a.
- Preseti mogu dodati prostorije i početne stavke poput usisavanja, brisanja
  prašine i periodične provere bojlera.
- Cleaning prikaz grupiše otvorene i završene chores po prostoriji.

Detalji implementacije su u `js/cleaning-ui.js`, `js/projects-ui.js` i
`docs/claude/FEATURES.md`.

## 9. Templates, Saved Views i shortcuts

- Templates postoje za Task, Project, Habit i Goal.
- Mogu se sačuvati relativni datumi, ponavljanje i podrazumevane veze.
- Postoje Saved Views za filtrirane prikaze Tasks, Goals i Habits.
- Views mogu biti pinovane, a shortcut mapiranje je prilagodljivo uz proveru
  konflikata i reset na podrazumevane prečice.

**Za brainstorming:** da li dodati javne/privatne template kolekcije, template
varijable, automatsko kreiranje po rasporedu ili deljenje Saved View-a?

## 10. Quick Add, navigacija i mobilni interfejs

- Quick Add meni omogućava brzo dodavanje Task-a, Goal-a, Habit-a i drugih
  tipova.
- Na mobilnom, tablet i desktop prikazu je plutajuće dugme sa plusom; klik
  otvara kružne akcije za pojedinačne tipove stavki.
- Na užim ekranima je donja navigacija stalno dostupna i nalazi se ispred
  sadržaja, dok je Quick Add pozicioniran iznad nje.
- Task se može završiti swipe gestom udesno.
- Od V1.10 naslov u brzom dodavanju prepoznaje datum, vreme, rok, trajanje,
  `+projekat`, `@oblast`, `#oznaku` i `!prioritet`, uz pregled prepoznatog ispod
  naslova.
- Focus stanje, tastatura i modalni prozori imaju pristupačne focus stilove.

**Za brainstorming:** da li dodati glasovni unos, predloge na osnovu teksta,
quick-add komande poput `tomorrow`, skeniranje slike ili offline queue?

## 11. Backup, recovery i Undo

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

Zatim otvoriti `http://localhost:8080`. Service worker se registruje samo na `https:` ili `localhost`. GitHub Pages verzija je na `https://marko-ivapix.github.io/dailo/` i prikazuje `main`: V1.9.1 je tamo od PR #6, a V1.10 stiže posle spajanja u `main` kroz svoj PR. Uputstvo za testere: `https://marko-ivapix.github.io/dailo/uputstvo.html`.

## Trenutni status

V1.9 je završen kao V1.9.1 (koraci 1–7), spojen u `main` kroz PR #6 i proveren
automatskim testovima prema `docs/superpowers/progress-v1-9.md` (335 Node
testova, 0 grešaka); paket je `Dailo-v1.9.1-distributable.zip`. V1.10 pametno
brzo dodavanje je urađeno i provereno prema `docs/superpowers/progress-v1-10.md`
(348 Node testova, 0 grešaka) i čeka spajanje u `main` kroz svoj PR; novi ZIP
paket se pravi tek posle V1.12. Sledi provera pre bete sa korisnikom
(`docs/beta/provera-pre-bete.md`, B6–B24) i pozivanje testera, a paralelno
V1.11 nedeljni pregled, V1.12 trajanje i vremenski blokovi i nacrt
specifikacije za V2.0 (mobilna aplikacija + Supabase sinhronizacija). V1.7 osnova ostaje zabeležena u
`docs/superpowers/progress-v1-7.md`. Tačni brojevi Node, syntax, Python/static i
ZIP provera upisuju se tek posle stvarnog pokretanja komandi; browser/visual i
iPhone acceptance ostaju **manual-pending** dok ih korisnik ne izvrši.
