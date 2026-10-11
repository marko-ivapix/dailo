# Redesign R26 — "Na današnji dan", the journal export and the journal lock (design)

**Date:** 2026-10-11 · **Status:** additions G, H and I of the second design pass, which the user approved with "moze sve". The journal lock adds one device-local setting, specified below · **Plan:** `docs/superpowers/plans/2026-10-10-redesign-implementation.md` · **Release:** `2.0.0-alpha.51`.

## G — "Na današnji dan"

- **Where:** on Dnevnik, for the current month and without a search, a card "Na današnji dan" sits above the entries.
- **What it lists:** entries with text or a mood from the same day of an earlier month or year, newest first, at most six (`Core.journalOnThisDay`).
- **Each row:** reads like an entry row, with the date and how long ago ("pre 1 mesec", "pre 3 meseca", "pre 1 godinu"). A tap opens that entry.
- **Without any:** the card is not shown.

## H — The journal as text

- **Where:** Dnevnik gets a ⋯ in its header. "Izvezi kao tekst" saves the whole journal as Markdown, `dailo-dnevnik-<datum>.md`.
- **The file:** a "# Dnevnik" heading, then one "## <full date> · <face> <mood>" section per entry with its text, newest first.
- **How it is saved:** the share sheet in the phone app, a download on the web (`DailoPlatform.files.saveFile`).
- **An empty journal:** says "Dnevnik je prazan" and saves nothing.

## I — The journal lock

1. **Where it can be turned on:** the phone app, when the phone can unlock with a fingerprint, face or its PIN. The plugin is `@aparajita/capacitor-biometric-auth` 10.0.0: MIT, for Capacitor 8, pinned exactly and synced into both native projects. The web never shows the option.
2. **Turning it on or off:** Dnevnik's ⋯ offers "Zaključaj dnevnik" or "Isključi zaključavanje". Either one asks for the fingerprint, face or PIN first, so a lock that cannot be opened is never set.
3. **While locked:**
   - **Dnevnik:** shows only "Dnevnik je zaključan" and "Otključaj".
   - **An entry:** opening one from anywhere (the strip, Danas, Nedeljni pregled, "+", a notification) asks first.
   - **Nedeljni pregled:** leaves out "Dnevnik ove nedelje".
   - **Export:** asks first.

   The journal stays open for the visit. It closes again when Dailo goes to the background, and an open entry is saved and closed.
4. **iOS:** `Info.plist` carries `NSFaceIDUsageDescription` ("Dailo koristi Face ID da otključa tvoj dnevnik.").

## Data model

- **No change to `state`, backups or sync.**
- **One new device-local `localStorage` key, `dailoJournalLock`:** `"1"` while the lock is on, absent otherwise. It joins the other device-local keys (`dailoSync`, `dailoNotified`, …). It is not exported, imported or synced, so a restored backup or a second device never comes up locked. Each phone sets its own lock.
- **The unlocked state:** memory only.

The lock keeps casual eyes out of the journal on this phone. It does not encrypt the stored data.

## Tests (written first)

`tests/redesign-r26.test.js`:

- `journalOnThisDay`;
- the card on Dnevnik;
- the Markdown export and the empty journal;
- the lock screen and asking before an entry;
- the menu with and without a lock;
- the platform unlock through the plugin and its failure;
- the device-local key, relocking in the background, the review guard, Face ID text, the pinned and synced plugin;
- the version `2.0.0-alpha.51`.

`tests/native-m8.test.js` now lists the plugin.

## Manual checks

On a phone:

- turn the lock on and off;
- unlock with a fingerprint and with the PIN;
- relock in the background;
- the export's share sheet.
