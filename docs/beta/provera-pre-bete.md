# Dailo — provera pre bete

Kratka ručna provera pre nego što Dailo pošalješ testerima. Radi je na **telefonu (instalirana aplikacija, iPhone ili Android)** i na **računaru (Safari ili Chrome)**. Kad nešto ne radi, zapiši broj stavke, uređaj i šta se desilo, i javi; svaka popravka ide kao novi korak, sa testom.

Lista odgovara verziji **2.0.0-alpha.135**. Stavke označene sa ✅ su potvrđene na iPhone-u 2026-10-08. Rezultati se upisuju u `CLAUDE.md` (Current state) i u `docs/superpowers/progress-redesign.md`.

## Instalacija, podaci, rad bez interneta

- [x] ✅ **B1.** Instalacija na početni ekran iz Safarija.
- [x] ✅ **B2.** Raspored: ništa ne ide ispod statusne trake ni ispod donje linije.
- [x] ✅ **B3.** Rad u avionskom režimu posle jednog otvaranja sa internetom.
- [x] ✅ **B4.** Podešavanja → Podaci → Trajno čuvanje piše „odobreno“.
- [x] ✅ **B5.** Izvoz rezervne kopije i uvoz nazad; zadaci ostaju.
- [ ] **B6.** Nova verzija: posle objave nove verzije pojavi se „Dostupna je nova verzija Dailo-a.“ sa dugmetom **Osveži**. Posle osvežavanja, u **Podešavanja → Pomoć → O aplikaciji** piše nova verzija (na primer **2.0.0-alpha.135**), a Dailo jednom javi da je stigla nova verzija (veza **Šta je novo**).
- [ ] **B7.** **Podešavanja → Pomoć → Prijavi problem** otvara e-poruku sa verzijom, uređajem i do pet poslednjih grešaka; poruku vidiš pre slanja.
- [ ] **B8.** Zatvori aplikaciju (prevuci je iz liste otvorenih) i otvori ponovo: sve je tu.

## Zadaci

- [ ] **B9.** Brzo dodavanje: napravi zadatak `Probni zadatak sutra u 10:00`. Pojavljuje se u **Predstojeće** za sutra u 10:00.
- [ ] **B10.** Otvori zadatak, promeni naslov, dodaj **Rok** i jedan **podzadatak**, zatvori. Izmene ostaju posle ponovnog otvaranja aplikacije.
- [ ] **B11.** Završi zadatak, pa dodirni **Poništi** u obaveštenju. Zadatak se vraća.
- [ ] **B12.** Obriši zadatak, pa **Poništi**. Zadatak se vraća sa podzadacima.
- [ ] **B13.** Ponavljajući zadatak (**Ponavljanje** → svaki dan): kad ga završiš, pojavi se sledeći.
- [ ] **B14.** **Inbox**: zadatak bez datuma je tu; **Razvrstaj redom** ga prebaci na **Danas**.

## Planiranje

- [ ] **B15.** **Danas** prikazuje današnje i zakasnele zadatke.
- [ ] **B16.** **Kalendar**: prikazi **Nedelja**, **Mesec** i **3 dana**; zadatak sa datumom je na pravom danu.
- [ ] **B17.** **Pretraga** nalazi zadatak po delu naslova.

## Navike, ciljevi, beleške

- [ ] **B18.** Napravi naviku „svaki dan“ i dodirni njen krug za danas (✓); niz i uspešnost za 30 dana se ažuriraju. Drugi dodir je crveni ✗, treći prazno.
- [ ] **B19.** Napravi cilj i poveži ga sa zadatkom; kad završiš zadatak, napredak cilja raste.
- [ ] **B20.** Napravi belešku sa linkom i označi je zvezdicom; filter **Omiljeno** je prikazuje.

## Računar (Mac, Safari ili Chrome)

- [ ] **B21.** Otvori `https://marko-ivapix.github.io/dailo/`; raspored je čitljiv na širokom ekranu.
- [ ] **B22.** Prečice: **N** novi zadatak, **T** Danas, **I** Inbox, **C** Kalendar, **Cmd+F** Pretraga, **Cmd+K** paleta komandi.
- [ ] **B23.** Prevuci zadatak na drugi dan u Kalendaru ili promeni redosled u listi.

## Nove funkcije (V1.10–V1.12)

- [ ] **B25.** Brzo dodavanje: upiši `Pošalji ponudu +ImeProjekta rok petak 45min sutra u 9:30` (ime postojećeg projekta). Ispod naslova odmah piše šta je prepoznato. Sačuvan zadatak ima projekat, rok u petak, 45 min i plan za sutra u 9:30.
- [ ] **B26.** Čip **Trajanje** u Brzom dodavanju: izaberi 30 min; zadatak ga dobija.
- [ ] **B27.** **Nedeljni pregled** (**Još → Biblioteka** ili bočni meni): prođi korake (svaki može da se preskoči) i dodirni **Završi nedeljni pregled**. Na polju **Nedeljni pregled** u **Još** posle toga piše „Poslednji: …“ umesto „Vreme je za pregled ove nedelje“.
- [ ] **B28.** **Kalendar**: dodirni dan, pa izaberi **Raspored**. Zadatku iz liste **Bez vremena** upiši vreme; pojavljuje se u rasporedu. Dva zadatka u isto vreme dobijaju oznaku preklapanja.
- [ ] **B29.** **Dnevni kapacitet** (**Podešavanja → Opšte**): sa zadacima koji imaju trajanje, raspored dana u **Kalendaru** prikazuje „Planirano … od 6 h“, a kad se pređe, „Preko kapaciteta za …“.
- [ ] **B30.** Računar: u rasporedu dana prevuci zadatak na drugi sat.

## Novo u verzijama 2.0.0-alpha.110–135

- [ ] **B43.** **Danas** sa zakasnelim zadacima: **Sredi jedan po jedan** prolazi kroz njih, a **Sve na sutra** ih pomeri na sutra. **Poništi** vraća sve kako je bilo.
- [ ] **B44.** Uveče (od vremena podsetnika za dnevnik, a ne pre 18 h), dok je za danas ostalo neurađenih zadataka, **Danas** nudi **Zatvori dan**. **Sve na sutra** ih pomeri, a **Ne danas** sakrije karticu do sutra.
- [ ] **B45.** Zadatak sa **Ponavljanje → Od dana završetka**, svaka 3 dana: kad ga završiš, sledeći dolazi 3 dana posle dana završetka, a ne po rasporedu.
- [ ] **B46.** Brzo dodavanje: upiši `Teretana utorkom u pola deset`. Ispod naslova piše ponavljanje utorkom i 09:30; dodir na jedan prepoznati deo vraća te reči u naslov.
- [ ] **B47.** Telefon: u Brzo dodavanje nalepi listu od tri reda. Nudi **Napravi 3 zadatka**; posle toga **Poništi** briše sva tri.
- [ ] **B48.** Telefon: u **Kalendaru** drži zadatak, pa ga prevuci na drugi dan.
- [ ] **B49.** **Detalji navike → Trajanje**: upiši 30 min. Raspored dana u **Kalendaru** računa i tu naviku dok je tog dana ne uradiš.
- [ ] **B50.** Brojčana navika sa **Najviše 2** (na primer kafa): 1 je u granici (✓), 3 je crveni ✗. Beleška uz dan (meni navike) vidi se u **Detaljima navike**.
- [ ] **B51.** **Pretraga**: `cacak` nalazi zadatak „Čačak“, a reč otkucana ćirilicom nalazi istu reč latinicom.
- [ ] **B52.** Telefon: instaliraj novu verziju preko stare. Zadaci, navike, prilozi i **Završeni zadaci** (i stari završeni) su tu.

## Sinhronizacija (V2.0-a, tek kad se podesi Supabase)

Dok Supabase nije podešen (`docs/v2/podesavanje-supabase.md`), kartica **Sinhronizacija** se ne vidi i ove stavke se preskaču. Na svim uređajima neka bude ista verzija: starije verzije brišu beleške uz dan navike i „Od dana završetka“.

- [ ] **B31.** Na prvom pokretanju (ili **Još → Nalog → Napravi nalog**) dodirni **Registruj se**, upiši e-adresu i lozinku dva puta, prihvati uslove i dodirni **Napravi nalog**. Kod stiže e-poštom; upiši ga i dodirni **Potvrdi**. U **Još → Nalog** se vide nalog i vreme poslednje sinhronizacije.
- [ ] **B32.** Na Mac-u se prijavi istom e-adresom. Ako oba uređaja već imaju podatke, pojavi se izbor; izaberi **Spoji**. Posle toga su isti zadaci na oba uređaja.
- [ ] **B33.** Napravi zadatak na iPhone-u. Na Mac-u se pojavi posle **Sinhronizuj sada**, ili sam za najviše 5 minuta.
- [ ] **B34.** Izmeni jedan i obriši drugi zadatak na Mac-u. Kad se vratiš u aplikaciju na iPhone-u, obe promene su i tu.
- [ ] **B35.** U avionskom režimu napravi zadatak. Isključi avionski režim i vrati se u aplikaciju: zadatak stiže na drugi uređaj.
- [ ] **B36.** **Odjavi se**: podaci ostaju na uređaju. Zatim se prijavi ponovo i dodirni **Obriši nalog** (traži da upišeš `OBRIŠI`): nalog i podaci na serveru su obrisani, a podaci na uređaju ostaju.
- [ ] **B37.** Novi uređaj (ili posle brisanja aplikacije): prvi ekran je ekran za prijavu. **Nastavi bez naloga** ga zatvara i ne pojavljuje se ponovo; aplikacija radi bez naloga.
- [ ] **B38.** **Zaboravljena lozinka?**: upiši e-adresu, upiši kod iz e-poruke i novu lozinku dva puta. Posle toga prijava novom lozinkom radi.
- [ ] **B39.** Kad su Google ili Apple uključeni u Supabase-u: dugme otvara prijavu u pregledaču, a posle odobrenja se vraća u Dailo prijavljen (veb, Android, iPhone).
- [ ] **B40.** **Još → Nalog → Lozinka → Promeni**: nova lozinka dva puta. Prijava novom lozinkom radi, a drugi uređaj traži ponovnu prijavu.
- [ ] **B41.** **Još → Nalog → E-adresa → Promeni**: upiši novu adresu, pa kod (i kod sa stare adrese, ako ga server traži). Nalog pokazuje novu adresu, a prijava njom radi.
- [ ] **B42.** Posle migracije `0003_attachments.sql`: dodaj prilog zadatku na telefonu i sinhronizuj; na drugom uređaju se prilog otvara. Obriši ga na drugom uređaju: posle sinhronizacije nestaje i sa telefona.

## Na kraju

- [ ] **B24.** **Resetuj podatke aplikacije** (samo na računaru, ili posle izvoza): traži da upišeš `RESETUJ`, pravi sigurnosnu kopiju i briše podatke. Posle toga **Uvezi rezervnu kopiju** (uz reč `VRATI`) vraća sve.

Kad su B6–B30 i B43–B52 prošli (i B31–B42, kad je sinhronizacija uključena), ili su greške popravljene, Dailo je spreman za prve testere: pošalji im link na uputstvo `https://marko-ivapix.github.io/dailo/uputstvo.html`.
