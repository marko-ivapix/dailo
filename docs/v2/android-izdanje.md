# Dailo za Android — izdanje za Google Play

Ovo uputstvo vodi od upload ključa do prve verzije na Google Play-u. Debug APK za probu (sa zajedničkim debug ključem) i dalje nastaje u CI-ju posle svakog push-a: Actions → CI → `dailo-debug-apk`.

## 1. Upload ključ (jednom)

Google Play koristi **Play App Signing**: Google čuva ključ kojim se aplikacija potpisuje za telefone, a ti potpisuješ samo paket koji šalješ (upload ključ). Ako se upload ključ izgubi, Google ga može zameniti, ali je i dalje važno da ga čuvaš.

Na Mac-u (keytool dolazi uz Android Studio ili JDK):

```bash
keytool -genkeypair -v -keystore dailo-upload.jks -alias dailo-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

- Lozinke i fajl `dailo-upload.jks` sačuvaj u menadžeru lozinki i napravi rezervnu kopiju.
- Fajl **nikad ne ide u repo** (`.gitignore` ignoriše `*.jks` i `*.keystore`, osim zajedničkog debug ključa).

## 2. Tajne na GitHub-u (jednom)

GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:

| Ime | Vrednost |
| --- | --- |
| `DAILO_UPLOAD_KEYSTORE_BASE64` | izlaz komande `base64 -i dailo-upload.jks \| pbcopy` (kopira se u clipboard) |
| `DAILO_UPLOAD_STORE_PASSWORD` | lozinka keystore-a |
| `DAILO_UPLOAD_KEY_ALIAS` | `dailo-upload` |
| `DAILO_UPLOAD_KEY_PASSWORD` | lozinka ključa (ista kao gore ako nisi zadao drugu) |

## 3. Pravljenje izdanja

**Na GitHub-u:**
1. Pokreni build na jedan od dva načina:
   - Actions → **Android release** → Run workflow;
   - ili napravi tag `v2.0.0` (`git tag v2.0.0 && git push origin v2.0.0`).
2. Kad se završi, preuzmi artefakt `dailo-release`. U njemu su `app-release.aab` (za Google Play) i `app-release.apk` (za ručnu instalaciju).

**Lokalno (umesto GitHub-a):**

```bash
export DAILO_UPLOAD_STORE_FILE=~/kljucevi/dailo-upload.jks
export DAILO_UPLOAD_STORE_PASSWORD='…' DAILO_UPLOAD_KEY_ALIAS=dailo-upload DAILO_UPLOAD_KEY_PASSWORD='…'
npm run cap:sync && cd android && ./gradlew bundleRelease
```

Isto može i u Android Studio-u: Build → Generate Signed App Bundle. Bez ključa release build staje sa porukom šta nedostaje.

## 4. Verzija

- `versionName` je verzija iz `package.json` (na primer `2.0.0-alpha.76`).
- **`versionCode`** se računa sam, tako da je svaka sledeća verzija veća: alpha < beta < rc < izdanje. Na primer:
  - `2.0.0-alpha.76` → 20000076;
  - `2.0.0` → 20000999.
- Google Play prima samo veći `versionCode` od prethodnog, pa se pre svakog slanja podiže verzija u `package.json`.

## 5. Google Play Console

1. **Nalog:** Google Play developer nalog (jednokratno 25 $).
2. **Nova aplikacija:**
   - Create app → ime „Dailo”, jezik srpski, aplikacija, besplatna;
   - Play App Signing ostaje uključen (podrazumevano).
3. **Interno testiranje:** Testing → Internal testing → nova verzija → otpremi `app-release.aab`, dodaj testere (e-adrese).
4. **Store listing:** kratak i pun opis na srpskom, ikona 512 × 512, grafika 1024 × 500, slike ekrana sa telefona.
5. **Privacy policy:** adresa stranice `privatnost.html` na GitHub Pages.
6. **App access:** aplikacija radi bez naloga („Nastavi bez naloga”), pa probni nalog nije obavezan; za proveru sinhronizacije možeš dati probni nalog.
7. **Ads:** nema reklama.
8. **Content rating:** popuni upitnik (nema nasilja, kupovine ni deljenja lokacije).
9. **Target audience:** odrasli (nije namenjena deci).
10. **Data safety:**
    - **Prikupljaju se, samo uz nalog:**
      - e-adresa i ime (opciono);
      - sadržaj korisnika: zadaci, beleške, dnevnik, fajlovi.
    - **Namena:** funkcija aplikacije (sinhronizacija). Ne deli se sa trećim stranama; Supabase je obrađivač, ne treća strana.
    - **Zaštita:** prenos je šifrovan (HTTPS), a brisanje može da se zatraži u aplikaciji (Još → Nalog → Obriši nalog).
    - **Nema** analitike, reklama ni praćenja.

## 6. Dozvole u aplikaciji

| Dozvola | Zašto |
| --- | --- |
| `INTERNET` | sinhronizacija i prijava (samo uz nalog) |
| `POST_NOTIFICATIONS` | podsetnici; Android 13+ pita korisnika |
| `SCHEDULE_EXACT_ALARM` | podsetnici u tačno vreme. Na Androidu 14+ korisnik ih uključuje u Podešavanjima („Dozvoli tačne podsetnike”); bez toga podsetnik može da kasni nekoliko minuta. Ako Play pita, odgovor je: podsetnici za zadatke i navike u vreme koje je korisnik izabrao. |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | podsetnici ostaju zakazani posle restarta telefona (dodaje ih plugin za obaveštenja) |
| `VIBRATE` | haptički odziv |
| `USE_BIOMETRIC` | zaključavanje dnevnika otiskom ili licem |
| `READ/WRITE_EXTERNAL_STORAGE` | samo na Androidu 10 i starijim (ograničeno sa `maxSdkVersion`), za automatsku rezervnu kopiju u `Documents/Dailo` |

## 7. Pre slanja na proveru

- Proveri na pravom telefonu podsetnike, widgete, prijavu i sinhronizaciju (kontrolna lista `docs/beta/provera-pre-bete.md`).
- Interno testiranje traje dok testeri ne potvrde da je sve u redu. Zatim ide zatvoreno ili otvoreno testiranje, pa produkcija.
