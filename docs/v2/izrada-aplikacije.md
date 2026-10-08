# Dailo V2.0-b — aplikacija za iPhone i Android

Kako da napraviš Dailo aplikaciju na svom Mac-u i pokreneš je na telefonu. To je ista aplikacija kao veb verzija. Uz nju dobijaš:

- podsetnike koji stižu i kad je aplikacija zatvorena;
- izvoz rezervne kopije preko menija za deljenje;
- podatke koje Safari ne briše.

Objava u App Store i Google Play dolazi kasnije (V2.0-c).

## Šta treba jednom

- **Mac i alati:**
  - **Xcode**, najnovija verzija iz App Store-a. Posle instalacije otvori ga jednom i prihvati uslove.
  - **Node.js 22** ili noviji (sa [nodejs.org](https://nodejs.org)). Proveri u Terminalu: `node --version`.
- **Za Android:** **Android Studio** (sa [developer.android.com/studio](https://developer.android.com/studio)), najnovija verzija. Pri prvom pokretanju ostavi podrazumevana podešavanja.
- **Apple ID:** za probu na svom iPhone-u dovoljan je običan, besplatan Apple ID. Plaćeni Apple Developer nalog treba tek za TestFlight i App Store.

## Preuzimanje i priprema

U Terminalu:

```bash
git clone https://github.com/marko-ivapix/dailo.git
cd dailo
git checkout ccr-95f6062b-lgg2fr
npm ci
npm run sync
```

Šta rade ove komande:

- `git checkout ccr-95f6062b-lgg2fr` je potreban samo dok aplikacija nije spojena u `main`.
- `npm ci` instalira Capacitor tačno u verzijama iz `package-lock.json`.
- `npm run sync` kopira aplikaciju u `www/` i u iOS i Android projekte.

## iPhone

1. `npx cap open ios` otvara projekat u Xcode-u. Prvi put Xcode nekoliko minuta preuzima pakete; sačekaj da nestane „Fetching“.
2. Levo izaberi projekat **App**, pa target **App**, pa karticu **Signing & Capabilities**:
   - **Team**: tvoj Apple ID (ako ga nema: **Add an Account…**);
   - **Bundle Identifier** ostaje `cloud.ivapix.dailo`.
3. Poveži iPhone kablom, otključaj ga i potvrdi **Trust** (Veruj ovom računaru).
4. Na iPhone-u uključi **Podešavanja → Privatnost i bezbednost → Režim za programere** (Developer Mode). Telefon se restartuje.
5. U Xcode-u gore izaberi svoj iPhone i klikni ▶ (Run).
6. Prvi put iPhone traži potvrdu programera: **Podešavanja → Opšte → VPN i upravljanje uređajem** → tvoj Apple ID → **Veruj**. Zatim ponovo ▶.

Sa besplatnim Apple ID-jem aplikacija radi 7 dana. Posle toga je ponovo pokreni iz Xcode-a (▶); podaci ostaju.

## Android

1. `npx cap open android` otvara projekat u Android Studiju. Sačekaj da se završi „Gradle sync“ (dole desno).
2. Na telefonu uključi programerske opcije:
   - **Podešavanja → O telefonu → Broj verzije** (Build number): dodirni ga 7 puta;
   - zatim u **Opcijama za programere** uključi **USB otklanjanje grešaka**.
3. Poveži telefon kablom i na telefonu dozvoli otklanjanje grešaka za ovaj računar.
4. U Android Studiju gore izaberi telefon i klikni ▶ (Run).

## Prva provera u aplikaciji

- **Podsetnici:**
  1. **Podešavanja → Obaveštenja → Podsetnici → Uključi**, pa dozvoli obaveštenja.
  2. Napravi zadatak sa podsetnikom za 2–3 minuta i potpuno zatvori aplikaciju.
  3. Obaveštenje treba da stigne, a dodir na njega otvara Dailo.
- **Izvoz:** **Podešavanja → Podaci → Izvezi ZIP** otvara meni za deljenje. Izaberi **Sačuvaj u Fajlove** (iPhone) ili aplikaciju za fajlove (Android).
- **Podaci:** podaci u aplikaciji su odvojeni od Safarija. Prenesi ih na jedan od ovih načina:
  - **ZIP:** u veb verziji **Izvezi ZIP**, pa u aplikaciji **Uvezi ZIP**;
  - **sinhronizacija:** prijava na isti nalog, kad bude uključena.

## Posle svake nove verzije

```bash
git pull
npm ci
npm run sync
```

Zatim u Xcode-u ili Android Studiju ponovo ▶.

Ključevi i lozinke nikad ne idu u repozitorijum. Potpisivanje ostaje samo u Xcode-u na tvom Mac-u.
