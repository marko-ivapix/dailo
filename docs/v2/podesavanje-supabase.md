# Dailo V2.0 — podešavanje Supabase-a

Jednokratno podešavanje servera za sinhronizaciju (V2.0-a). Traje desetak minuta. Dok ovo nije urađeno, aplikacija radi kao i do sada: sve je samo na uređaju, a kartica „Sinhronizacija“ se ne prikazuje.

## 1. Projekat

1. Otvori [supabase.com](https://supabase.com), prijavi se i izaberi **New project**.
2. Naziv: `dailo`. Region: **Central EU (Frankfurt)**.
3. Lozinku baze sačuvaj u menadžeru lozinki. Aplikaciji nije potrebna i nikome je ne šalješ.

## 2. Tabele i pravila pristupa

1. U projektu otvori **SQL Editor → New query**.
2. Nalepi ceo sadržaj fajla `supabase/migrations/0001_sync.sql` iz repozitorijuma i klikni **Run**.
3. Treba da piše „Success“. Napravljene su tabele `records` i `record_history`, pravila po kojima svaki korisnik vidi samo svoje podatke, i funkcija za brisanje naloga.
4. Otvori novi upit (**New query**), nalepi ceo sadržaj fajla `supabase/migrations/0002_journal.sql` i klikni **Run**. On dozvoljava sinhronizaciju Dnevnika. Treba ponovo da piše „Success“.

## 3. Prijava e-poštom i lozinkom

Od verzije `2.0.0-alpha.66` (R40) prijava je e-adresom i lozinkom. Kod iz e-poruke služi da se potvrdi nov nalog i da se postavi nova lozinka.

1. **Authentication → Sign In / Providers → Email**: uključeno, sa **Confirm email**. Za **Minimum password length** upiši `8` (aplikacija i sama traži bar 8 znakova, sa brojem i slovom).
2. **Authentication → Emails → Templates**: šabloni **Confirm signup** i **Reset Password** moraju da imaju `{{ .Token }}`, jer aplikacija traži kod.

   **Confirm signup** (Subject: `Dailo — potvrdi nalog`):

   ```html
   <p>Tvoj Dailo kod za potvrdu naloga: <strong>{{ .Token }}</strong></p>
   <p>Možeš i da otvoriš <a href="{{ .ConfirmationURL }}">ovaj link</a>, pa da se prijaviš u aplikaciji.</p>
   ```

   **Reset Password** (Subject: `Dailo — nova lozinka`):

   ```html
   <p>Tvoj Dailo kod za novu lozinku: <strong>{{ .Token }}</strong></p>
   <p>Ako nova lozinka nije tražena sa tvog uređaja, ignoriši ovu poruku.</p>
   ```

   Oznake `<p>` drže rečenice u posebnim redovima; bez njih bi se u e-poruci spojile. Šablon **Magic Link** više nije potreban.

3. **Authentication → URL Configuration**:
   - **Site URL**: `https://marko-ivapix.github.io/dailo/`
   - **Redirect URLs**: dodaj `https://marko-ivapix.github.io/dailo/` i `dailo://auth`. Na te adrese se aplikacija vraća posle prijave sa Google ili Apple nalogom.

## 3a. Google i Apple (kad želiš ta dugmad)

Dok neki od njih nije uključen, njegovo dugme u aplikaciji kaže da prijava sa tim nalogom još nije uključena. Sve ostalo radi.

**Google:**

1. Otvori [console.cloud.google.com](https://console.cloud.google.com), napravi projekat `Dailo`.
2. **APIs & Services → OAuth consent screen**: tip **External**, naziv `Dailo`, tvoja e-adresa za podršku. Za proveru pre objave dodaj sebe kao test korisnika.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, tip **Web application**. U **Authorized redirect URIs** upiši `https://qjfpnvjuqbrmdkjxxmsq.supabase.co/auth/v1/callback`.
4. Dobijene **Client ID** i **Client secret** upiši u Supabase: **Authentication → Sign In / Providers → Google**, i uključi ga.

**Apple** (potreban je Apple Developer Program, 99 USD godišnje):

1. Na [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles → Identifiers**: kod App ID-a `cloud.ivapix.dailo` uključi **Sign in with Apple**.
2. Napravi **Services ID** (npr. `cloud.ivapix.dailo.signin`), uključi **Sign in with Apple** i u **Configure** upiši domen `qjfpnvjuqbrmdkjxxmsq.supabase.co` i Return URL `https://qjfpnvjuqbrmdkjxxmsq.supabase.co/auth/v1/callback`.
3. **Keys → +**: ključ sa **Sign in with Apple**; preuzmi `.p8` fajl i zapiši **Key ID** i **Team ID**.
4. U Supabase-u: **Authentication → Sign In / Providers → Apple**. Za **Client IDs** upiši Services ID, a tajnu napravi alatom koji Supabase nudi na toj strani (od `.p8` fajla, Key ID-a i Team ID-a). Uključi ga.
5. Ta tajna ističe posle 6 meseci; tada je napravi ponovo. Ključ i `.p8` fajl ne šalješ meni niti ih stavljaš u repozitorijum.

## 4. Šta mi šalješ

U **Project Settings → API** (ili **API Keys**) nađi:

- **Project URL**, na primer `https://abcd1234.supabase.co`;
- javni ključ: **anon public**, ili u novijim projektima **publishable** (`sb_publishable_…`).

Ta dva podatka su javna po dizajnu: nalaze se u svakoj aplikaciji koja koristi Supabase, a podatke štite pravila pristupa iz koraka 2. Upisujem ih u `js/sync-config.js`.

**Nikada ne šalji** ključ **service_role** / **secret** ni lozinku baze.

## 5. Ograničenja besplatnog plana

- Ugrađeno slanje e-pošte šalje samo nekoliko poruka na sat. To je dovoljno za probu. Za betu sa više ljudi podesi svoj SMTP (**Authentication → SMTP**, npr. Resend ili Brevo).
- Besplatan projekat se pauzira posle nedelju dana bez korišćenja i ponovo se pokreće iz kontrolne table. Za pravo puštanje: plan Pro (oko 25 USD mesečno).

## 6. Provera

Na prvom pokretanju aplikacija otvara ekran za prijavu (posle toga: **Još → Nalog → Prijavi se**).

1. **Registruj se**: ime (nije obavezno), e-adresa, lozinka dva puta i saglasnost sa uslovima → **Napravi nalog**. Stiže kod; upiši ga i dodirni **Potvrdi**.
2. **Sinhronizuj sada** u **Još → Nalog** šalje podatke na server, a na drugom uređaju se posle prijave istom e-adresom i lozinkom pojavljuju isti zadaci.
3. **Zaboravljena lozinka?** šalje kod; sa njim se postavlja nova lozinka.
4. Ako su uključeni Google ili Apple, njihova dugmad otvaraju prijavu u pregledaču i vraćaju se u Dailo.
