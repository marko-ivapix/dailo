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

## 3. Prijava kodom na e-poštu

1. **Authentication → Sign In / Providers → Email**: uključeno, sa **Confirm email**.
2. **Authentication → Emails → Templates**: u šablonima **Magic Link** i **Confirm signup** zameni tekst ovim (oba šablona moraju da imaju `{{ .Token }}`):

   ```text
   Tvoj Dailo kod za prijavu: {{ .Token }}

   Kod važi kratko. Ako prijava nije tražena sa tvog uređaja, ignoriši ovu poruku.
   ```

3. **Authentication → URL Configuration → Site URL**: `https://marko-ivapix.github.io/dailo/`

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

Posle mog ažuriranja aplikacije otvori **Podešavanja → Sinhronizacija** i upiši e-adresu. Stiže ti kod, koji ukucaš u aplikaciju. Posle toga **Sinhronizuj sada** šalje podatke na server, a na drugom uređaju se posle prijave isti zadaci pojavljuju.
