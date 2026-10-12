# R58 — security fixes and the completed privacy policy

**Date:** 2026-10-12 · **Status:** the user's "Da. Marko Radičević" to fixing the findings of `docs/superpowers/specs/2026-10-12-security-review.md` and naming the data controller. · **Release:** `2.0.0-alpha.85`. · **Server:** needs migration `0006_security.sql`.

## The change

- **Finding 2 — the encrypted journal stays sealed on the server** (`js/sync.js` `syncOnce`):
  - **Detection:** when a device with the journal key pulls a readable journal row, an older device that did not know about the encryption wrote it. Such rows are collected in `readableJournal`.
  - **Normal round:** after the pull is applied, those entries go back sealed in the same round, from this device's copy (equal or newer by last-write-wins). The shadow records the sealed copy.
  - **First sync:** the "take the server" and "keep this device" choices leave those rows out of the shadow, so the next round seals them.
  - **History:** a sealed push that replaces a readable row sets `meta.purgeJournalHistory`. The app then purges the readable copies from the server history after the round, as R51 does.
- **Finding 3 — the goal unit is escaped** in the progress sheet (`js/goals-ui.js` `progressSheetHtml`). The other unit labels were already escaped by their callers.
- **Finding 4 — Realtime no longer publishes `records`:**
  - **The new table:** `0006_security.sql` adds `record_pokes`, one row per account.
    - Its primary key is a random id, so a DELETE event carries no user or record id.
    - It has RLS (select only, own row), `anon` revoked and no writes for `authenticated`.
  - **The triggers:** `records` inserts and updates poke the row through statement-level triggers, one poke per statement. Hard deletes happen only in account deletion and poke nothing.
  - **The publication** drops `records` and adds `record_pokes`. `DailoSync.createRealtime` subscribes to `record_pokes` with the account filter.
- **Finding 5 — links:**
  - **`?shortcut=`** on the web opens only `new-task`, `today` and `journal` (`consumeLaunchParams`).
  - **`dailo://auth`** counts only while this device has a Google or Apple sign-in pending (`handleIncomingLink`).
  - **Widget links:** a per-install token for `habit-done` was not added. The habit id cannot be guessed (random plus a timestamp), and the effect is one check-in with Undo.
- **Finding 6:** Android `allowBackup="false"`. Cloud and `adb` backups no longer carry the session or the journal key. A move to a new phone still works through the ZIP backup or sync.
- **Findings 8 and 9 — server limits** (`0006_security.sql`):
  - **Size cap:** one record holds at most 256 KB (`records_data_size`, `not valid`, so existing rows are not checked). `DailoSync.serverMessage` reads the violation as a Serbian sentence.
  - **History:** previous versions are kept 90 days. `keep_record_history` clears the account's older history on each write, with a new index `(user_id, replaced_at)`.
  - **Grants:** `purge_journal_history()` is revoked from `anon`.
- **Finding 9 — the CSP:** `connect-src` names only the project host from `js/sync-config.js`, for `https` and `wss`. `tests/security-r58.test.js` keeps the two equal.
- **The privacy policy (`privatnost.html`):**
  - **Ukratko:** no marketing e-mail.
  - **"Ko obrađuje podatke":**
    - the controller is Marko Radičević, with the contact address;
    - Supabase stores the account data on the controller's behalf in the EU (Frankfurt);
    - the legal basis is the contract, and the time of accepting the terms is recorded.
  - **Brisanje:** retention while the account exists, previous versions for 90 days, none for the encrypted journal.
  - **"Tvoja prava":**
    - access and portability through Izvezi ZIP;
    - correction and deletion in the app;
    - objection and restriction by e-mail, answered within 30 days;
    - a complaint to the Poverenik (`poverenik.rs`).
  - **"Deca":** an account from 15 years (the threshold of the Serbian law); younger people only with a parent's or guardian's consent, and the app works without an account.
  - **"Bezbednost i povrede podataka":** HTTPS, per-account access on the server, and the Poverenik notified within 72 hours, the user without delay when the risk is high.
- **The terms (`uslovi.html`):** Dailo is developed and provided by Marko Radičević, and an account needs 15 years (younger with consent).
- **Not changed, with the reason:**
  - **Finding 1 (shared `github.io` origin):** needs a custom domain the user has to set up.
  - **Finding 7 (public debug key):** intended for testing; outside testers should get release-signed builds.
  - **The first sync merging into an empty account without asking:** the expected path on a personal device.
  - **Actions pinned by tag:** low risk.

## Fixes after the code review

The `code-reviewer` agent reviewed the first R58 commit (`6bd282d`) and reproduced each sync finding against the fake server. All are fixed in the same release:

- **Encryption turned off on another device (high).**
  - **Problem:** a device that still held the key re-sealed the whole journal with a key it then forgot, so no device could read it.
  - **Fix:** re-sealing now happens only while the account's cipher is still the key's cipher. `journalSyncOptions` passes the key's salt, and `keyFits` compares it with the settings after the pull.
  - **Tests:** test 1 now uses a pre-R51 app in a normal round, and a new test turns encryption off.
- **"Keep this device's data":** account-only readable journal rows keep their shadow mark, so they are deleted as promised. Only rows this device has go up sealed.
- **The 256 KB cap stopped the whole sync.**
  - **Fix:** items over `SYNC_RECORD_LIMIT` (240 KB, measured after sealing) stay on the device and out of the shadow, while the rest syncs.
  - **Display:** `meta.tooLarge` names them, and Nalog shows "Preveliko za sinhronizaciju (najviše 240 KB): …".
  - **Server message:** now "Jedna stavka je prevelika za sinhronizaciju (najviše 256 KB). Skrati je.".
- **Same-round re-seal:** a first sync that takes the server copy now re-seals in the same round and sets the purge flag.
- **The purge flag:** it is set before the re-seal push, so a failed push still leaves it set.
- **The privacy policy:** it now says the server keeps only sealed previous versions of an encrypted journal. The earlier "none are kept" was not true.
- **The goal unit** is escaped once. The "of {target}" label builds from the raw unit inside one `esc()`.
- **`pushed`** now counts re-seal pushes, so "nothing left to re-seal" is a real check.
- **Pushed twice:** a readable row already pushed sealed in the diff push is not pushed again.
- **Realtime:** a DELETE event of `record_pokes` (a deleted account) starts no sync.
- **Grants:** `record_pokes` is `revoke all` from `anon` and `authenticated`, then `grant select`.
- **Rollout:** run `0006_security.sql` only once every device is on `2.0.0-alpha.85` or later, because older versions lose instant changes. The guide says so.
- **Android device-to-device transfer:** `allowBackup="false"` stops cloud and `adb` backups. With targetSdk 36, a direct transfer to a new phone still moves the app data, including the session. That is the user's own new phone, so it stays as is.

## Checks

- **Node:** `tests/security-r58.test.js`, written first; it failed 10/10, and after the review it grew to 14 tests, of which 10 failed before the fixes. It covers:
  - a readable journal row re-sealed in the same round, with the history purge;
  - a first "server" sync re-sealing on the next round;
  - the escaped unit;
  - the Realtime table and the migration;
  - the size cap, the history window and the revoke;
  - the shortcut allow-list and the auth guard;
  - `allowBackup`;
  - the CSP against `js/sync-config.js`;
  - the policy and terms texts;
  - the version.
- **Older tests updated (with comments):**
  - `tests/realtime-r50.test.js`: the subscribed table and the CSP;
  - `tests/mobile-m7.test.js`: the CSP host;
  - `tests/redesign-r40.test.js`: the auth guard;
  - `tests/site-r57.test.js`: the version is now "or later".
- **Manual-pending:**
  - **Supabase:** running `0006_security.sql`, then realtime between two devices.
  - **Large items:** a record over 256 KB showing the message.
  - **Android:** the backup setting.
  - **Facts for the user to confirm:** that the Supabase project's region is Frankfurt, as the policy now says.
