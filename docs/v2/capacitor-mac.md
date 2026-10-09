# Dailo — aplikacija za iPhone i Android (izrada na Mac-u)

Kako da napraviš Dailo aplikaciju na svom Mac-u i pokreneš je na telefonu. To je ista aplikacija kao veb verzija (2.0.0-alpha.3), u Capacitor ljusci. Uz nju dobijaš:

- podsetnike koji stižu i kad je aplikacija zatvorena;
- izvoz rezervne kopije i otvaranje priloga preko menija za deljenje;
- podatke koje Safari ne briše, uz dodatnu kopiju u fajlovima aplikacije;
- dugme Nazad na Androidu, koje zatvara prozore i menije.

Objava u App Store i Google Play dolazi kasnije. Za nju treba plaćeni Apple Developer nalog, Google Play nalog i stranica o privatnosti.

## Šta treba jednom

- **Mac i alati:**
  - **Xcode 26** ili noviji, iz App Store-a. Posle instalacije otvori ga jednom i prihvati uslove.
  - **Node.js 22** ili noviji (sa [nodejs.org](https://nodejs.org)). Proveri u Terminalu: `node --version`.
- **Za Android:** **Android Studio** Otter (2025.2.1) ili noviji (sa [developer.android.com/studio](https://developer.android.com/studio)). Pri prvom pokretanju ostavi podrazumevana podešavanja; Android Studio sam instalira SDK 36 i Javu 21.
- **Apple ID:** za probu na svom iPhone-u dovoljan je običan, besplatan Apple ID.

## Preuzimanje i priprema

U Terminalu:

```bash
git clone https://github.com/marko-ivapix/dailo.git
cd dailo
npm ci
npm run verify
npm run cap:sync
```

Šta rade ove komande:

- `npm ci` instalira Capacitor i dodatke tačno u verzijama iz `package-lock.json`.
- `npm run verify` proverava sintaksu i pokreće sve testove; na kraju treba da piše `# fail 0`.
- `npm run cap:sync` kopira aplikaciju u `www/`, a zatim u iOS i Android projekte.

## iPhone

1. `npm run cap:ios` otvara projekat u Xcode-u. Prvi put Xcode nekoliko minuta preuzima pakete; sačekaj da nestane „Fetching“.
2. Levo izaberi projekat **App**, pa target **App**, pa karticu **Signing & Capabilities**:
   - **Team**: tvoj Apple ID (ako ga nema: **Add an Account…**);
   - **Bundle Identifier** ostaje `cloud.ivapix.dailo`.
3. Poveži iPhone kablom, otključaj ga i potvrdi **Trust** (Veruj ovom računaru).
4. Na iPhone-u uključi **Podešavanja → Privatnost i bezbednost → Režim za programere** (Developer Mode). Telefon se restartuje.
5. U Xcode-u gore izaberi svoj iPhone i klikni ▶ (Run).
6. Prvi put iPhone traži potvrdu programera: **Podešavanja → Opšte → VPN i upravljanje uređajem** → tvoj Apple ID → **Veruj**. Zatim ponovo ▶.

Sa besplatnim Apple ID-jem aplikacija radi 7 dana. Posle toga je ponovo pokreni iz Xcode-a (▶); podaci ostaju.

## Android

1. `npm run cap:android` otvara projekat u Android Studiju. Sačekaj da se završi „Gradle sync“ (dole desno).
2. Na telefonu uključi programerske opcije:
   - **Podešavanja → O telefonu → Broj verzije** (Build number): dodirni ga 7 puta;
   - zatim u **Opcijama za programere** uključi **USB otklanjanje grešaka**.
3. Poveži telefon kablom i na telefonu dozvoli otklanjanje grešaka za ovaj računar.
4. U Android Studiju gore izaberi telefon i klikni ▶ (Run).

## Prva provera u aplikaciji

Upiši rezultat svake provere (prošlo / nije prošlo, telefon i verzija sistema) i pošalji ga; tek tada se računa kao provereno.

1. **Zadatak ostaje posle ponovnog otvaranja:**
   1. Napravi zadatak preko **Brzo dodavanje**.
   2. Potpuno zatvori aplikaciju (prevuci je iz liste otvorenih aplikacija).
   3. Ponovo je otvori: zadatak je tu.
2. **Podsetnici:**
   1. Napravi zadatak sa podsetnikom za 2–3 minuta. Prvi put telefon pita za obaveštenja; dozvoli.
   2. Potpuno zatvori aplikaciju. Obaveštenje treba da stigne na vreme.
   3. Dodir na obaveštenje otvara taj zadatak.
   4. Na Androidu: ako **Podešavanja → Obaveštenja** prikazuje **Tačno vreme**, dodirni **Dozvoli**; bez toga Android može da kasni nekoliko minuta.
   5. Ako obaveštenja odbiješ, **Podešavanja → Obaveštenja → Podsetnici** to kaže; podsetnici se tada vide samo dok je aplikacija otvorena.
3. **Nazad (Android):** otvori **Brzo dodavanje** i pritisni Nazad: prozor se zatvara. Sa prvog ekrana Nazad sklanja aplikaciju.
4. **Tastatura:** u **Brzo dodavanje** tastatura ne prekriva polje, a stranica se ne uvećava.
5. **Izvoz:** **Podešavanja → Podaci → Izvezi ZIP** otvara meni za deljenje. Izaberi **Sačuvaj u Fajlove** (iPhone) ili aplikaciju za fajlove (Android). Ako meni zatvoriš bez izbora, aplikacija kaže da je izvoz otkazan.
6. **Linkovi:** **Podešavanja → O aplikaciji → Otvori uputstvo** otvara stranicu u pregledaču, a aplikacija ostaje otvorena ispod.

## Prenos podataka iz veb verzije

Podaci u aplikaciji su odvojeni od Safarija i Chrome-a. Na prvom pokretanju **Danas** pita „Imate podatke u veb verziji?“:

- **ZIP:** u veb verziji **Podešavanja → Podaci → Izvezi ZIP**, prebaci fajl na telefon (AirDrop, Fajlovi, Drive), pa u aplikaciji **Uvezi rezervnu kopiju** na ekranu **Danas** (ili **Podešavanja → Podaci → Uvezi ZIP**). Pre zamene aplikacija proverava fajl i traži potvrdu.
- **Sinhronizacija:** kad je uključena (`docs/v2/podesavanje-supabase.md`), prijavi se na isti nalog. Dok su u aplikaciji samo primeri sa prvog pokretanja, podaci sa naloga ih zamenjuju bez pitanja.

## Posle svake nove verzije

```bash
git pull
npm ci
npm run cap:sync
```

Zatim u Xcode-u ili Android Studiju ponovo ▶.

Ključevi i lozinke nikad ne idu u repozitorijum. Potpisivanje ostaje samo u Xcode-u i Android Studiju na tvom Mac-u.
