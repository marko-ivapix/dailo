# Dailo — provera pre bete

Kratka ručna provera pre nego što Dailo pošalješ testerima (plan izdanja, Faza 2). Radi je na **iPhone-u (instalirana aplikacija)** i na **Mac-u (Safari ili Chrome)**. Kad nešto ne radi, zapiši broj stavke, uređaj i šta se desilo. Popravke idu kao V1.9.x, svaka sa testom.

Rezultati se upisuju u `docs/superpowers/progress-v1-9.md` (tabela „Manual iPhone acceptance“ i beta gate). Stavke označene sa ✅ su već potvrđene na iPhone-u 2026-10-08.

## Instalacija, podaci, rad bez interneta

- [x] ✅ **B1.** Instalacija na početni ekran iz Safarija.
- [x] ✅ **B2.** Raspored: ništa ne ide ispod statusne trake ni ispod donje linije.
- [x] ✅ **B3.** Rad u avionskom režimu posle jednog otvaranja sa internetom.
- [x] ✅ **B4.** Podešavanja → Podaci → Trajno čuvanje piše „odobreno“.
- [x] ✅ **B5.** Izvoz rezervne kopije i uvoz nazad; zadaci ostaju.
- [ ] **B6.** Nova verzija: posle objave nove verzije pojavi se „Dostupna je nova verzija Dailo-a.“ sa dugmetom **Osveži**. Posle osvežavanja, u Podešavanja → O aplikaciji piše nova verzija (npr. **2.0.0-alpha.1**) i vidi se **Prijavi problem**.
- [ ] **B7.** **Prijavi problem** otvara e-poruku sa verzijom i uređajem.
- [ ] **B8.** Zatvori aplikaciju (prevuci je iz liste otvorenih) i otvori ponovo: sve je tu.

## Zadaci

- [ ] **B9.** Brzo dodavanje: napravi zadatak `Probni zadatak sutra u 10:00`. Pojavljuje se u **Predstojeće** za sutra u 10:00.
- [ ] **B10.** Otvori zadatak, promeni naslov, dodaj **Rok** i jedan **podzadatak**, zatvori. Izmene ostaju posle ponovnog otvaranja aplikacije.
- [ ] **B11.** Završi zadatak, pa dodirni **Poništi** u obaveštenju. Zadatak se vraća.
- [ ] **B12.** Obriši zadatak, pa **Poništi**. Zadatak se vraća sa podzadacima.
- [ ] **B13.** Ponavljajući zadatak (**Ponavljanje** → svaki dan): kad ga završiš, pojavi se sledeći.
- [ ] **B14.** **Inbox**: zadatak bez datuma je tu; prebaci ga na **Danas**.

## Planiranje

- [ ] **B15.** **Danas** prikazuje današnje i zakasnele zadatke.
- [ ] **B16.** **Kalendar**: prikaz **Nedelja** i **Mesec**; zadatak sa datumom je na pravom danu.
- [ ] **B17.** **Pretraga** nalazi zadatak po delu naslova.

## Navike, ciljevi, beleške

- [ ] **B18.** Napravi naviku „svaki dan“ i dodirni **Zabeleži** za danas; niz i napredak se ažuriraju.
- [ ] **B19.** Napravi cilj i poveži ga sa zadatkom; kad završiš zadatak, napredak cilja raste.
- [ ] **B20.** Napravi belešku sa linkom i označi je zvezdicom; filter **Omiljeno** je prikazuje.

## Mac (Safari ili Chrome)

- [ ] **B21.** Otvori `https://marko-ivapix.github.io/dailo/`; raspored je čitljiv na širokom ekranu.
- [ ] **B22.** Prečice: **N** novi zadatak, **T** Danas, **I** Inbox, **C** Kalendar, **Cmd+F** Pretraga.
- [ ] **B23.** Prevuci zadatak na drugi dan u Kalendaru ili promeni redosled u listi.

## Nove funkcije (V1.10–V1.12)

- [ ] **B25.** Brzo dodavanje: upiši `Pošalji ponudu +ImeProjekta rok petak 45min sutra u 9:30` (ime postojećeg projekta). Ispod naslova odmah piše šta je prepoznato. Sačuvan zadatak ima projekat, rok u petak, 45 min i plan za sutra u 9:30.
- [ ] **B26.** Čip **Trajanje** u Brzom dodavanju: izaberi 30 min; zadatak ga dobija.
- [ ] **B27.** **Nedeljni pregled** (meni **Još** ili bočni meni): prođi korake i dodirni **Završi nedeljni pregled**. Petkom, subotom i nedeljom poziv na ekranu **Danas** posle toga nestaje.
- [ ] **B28.** **Kalendar → Dan**: zadatku iz liste **Bez vremena** izaberi vreme; pojavljuje se u rasporedu. Dva zadatka u isto vreme dobijaju oznaku preklapanja.
- [ ] **B29.** **Dnevni kapacitet** (Podešavanja): sa zadacima koji imaju trajanje, **Danas** prikazuje npr. „2 h 30 min / 6 h“, a kad se pređe, upozorenje.
- [ ] **B30.** Mac: u dnevnom prikazu prevuci zadatak na drugi sat.

## Sinhronizacija (V2.0-a, tek kad se podesi Supabase)

Dok Supabase nije podešen (`docs/v2/podesavanje-supabase.md`), kartica **Sinhronizacija** se ne vidi i ove stavke se preskaču.

- [ ] **B31.** Podešavanja → **Sinhronizacija**: upiši e-adresu i dodirni **Pošalji kod**. Kod stiže e-poštom; upiši ga i dodirni **Potvrdi**. Vide se nalog i vreme poslednje sinhronizacije.
- [ ] **B32.** Na Mac-u se prijavi istom e-adresom. Ako oba uređaja već imaju podatke, pojavi se izbor; izaberi **Spoji**. Posle toga su isti zadaci na oba uređaja.
- [ ] **B33.** Napravi zadatak na iPhone-u. Na Mac-u se pojavi posle **Sinhronizuj sada**, ili sam za najviše 5 minuta.
- [ ] **B34.** Izmeni jedan i obriši drugi zadatak na Mac-u. Kad se vratiš u aplikaciju na iPhone-u, obe promene su i tu.
- [ ] **B35.** U avionskom režimu napravi zadatak. Isključi avionski režim i vrati se u aplikaciju: zadatak stiže na drugi uređaj.
- [ ] **B36.** **Odjavi se**: podaci ostaju na uređaju. Zatim se prijavi ponovo i dodirni **Obriši nalog** (traži da upišeš `OBRIŠI`): nalog i podaci na serveru su obrisani, a podaci na uređaju ostaju.

## Na kraju

- [ ] **B24.** **Resetuj podatke aplikacije** (samo na Mac-u, ili posle izvoza): traži da upišeš `RESET`, pravi sigurnosnu kopiju i briše podatke. Posle toga **Uvezi rezervnu kopiju** vraća sve.

Kad su B6–B30 prošli (i B31–B36, kad je sinhronizacija uključena), ili su greške popravljene, Dailo je spreman za prve testere: pošalji im link na uputstvo `https://marko-ivapix.github.io/dailo/uputstvo.html`.
