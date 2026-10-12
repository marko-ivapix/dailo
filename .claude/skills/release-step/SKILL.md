---
name: release-step
description: Ship one Dailo step (Rnn) from a failing test to a pushed commit — spec, version bump, ledger row with the commit hash, checks. Use whenever implementing a new feature, fix or change in this repository that the user asked for.
---

# One Dailo step, start to push

Every change the user asks for ships as one numbered step (`R58`, `R59`, …), with one version bump. Follow these in order.

1. **Number and version.**
   - The next step number is the last row of `docs/superpowers/progress-redesign.md` plus one.
   - The next version is `js/release.js` `APP_VERSION` with the alpha number plus one.
2. **Failing test first.** Write `tests/<topic>-r<NN>.test.js` in the style of the newest ones:
   - a header comment that names the spec;
   - `node:test` and `node:assert/strict`;
   - functions read through `tests/support/source.js` (`functionSource`) when they live in app code.

   End it with the exact version pin:

   ```js
   test('R<NN> is released as 2.0.0-alpha.<V>', () => {
     assert.equal(Release.APP_VERSION, '2.0.0-alpha.<V>');
     assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.<V>';/);
     assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.<V>');
   });
   ```

   Run it (`node --test tests/<file>`) and note how many tests fail. That number goes into the spec and the ledger.
3. **Relax the previous pin.** The previous step's exact version test becomes "or later":

   ```js
   test('R<prev> shipped as 2.0.0-alpha.<prevV> or later (the newest release test pins the exact version)', () => {
     assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
     assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= <prevV>);
   });
   ```
4. **Implement the smallest compatible change.**
   - Obey `AGENTS.md` and `CLAUDE.md` → "Rules that are easy to break".
   - New user-visible text goes into `js/i18n-sr.js` (Latin script).
   - New CSS uses `:root` tokens and sits before `/* Keep primary compact actions touchable after all density rules. */`.
   - A data-model change needs its own data-model spec.
5. **Bump the version** in `js/release.js` (`APP_VERSION`), `sw.js` (`VERSION`), `package.json` and both places in `package-lock.json`.
6. **Spec.** Write `docs/superpowers/specs/<YYYY-MM-DD>-r<NN>-<topic>.md` with these parts:
   - title;
   - date, status (quote the user's request) and release;
   - "The change" as nested bullets;
   - "Checks": the test written first and how many tests failed, the other suites, and the manual-pending items.
7. **Run everything:**

   ```bash
   npm run verify && npm run smoke && npm run check:python && npm run check:links
   ```

   All must pass. If an older test breaks, fix the cause, or update the test with a comment explaining why it changed. Never skip a test.
8. **Ledger.** Add a row to `docs/superpowers/progress-redesign.md`: `| R<NN> <title> | pending | <spec, what changed, checks with exact counts, manual-pending> |`.
9. **Commit** as `feat(R<NN>): <what> (2.0.0-alpha.<V>)` (or `fix`/`refactor`), with the trailers from the session's system reminder.
10. **Record the hash and push.**
    - Put the short hash into the row in place of `pending`.
    - Commit `docs: record the R<NN> commit in the redesign ledger`.
    - Push with `git push -u origin <branch>`.
    - The CI run (`ci.yml`, and `links.yml` when pages or `js/` changed) must go green. Check it through the GitHub MCP Actions tools.
11. **Tell the user** in Serbian, briefly:
    - what changed;
    - the version;
    - what still needs their device or account.

Never report phone, iPhone, visual or real-server checks as passed unless the user reported them.
