---
name: merge-pr
description: Open the Dailo pull request from the work branch into main, merge it after CI is green, restart the branch from main and record the merge. Use when the user says yes to "da otvorim PR i spojim" or asks to merge.
---

# Pull request, merge and the records after it

Only when the user asked for it.

1. **Check that it can go in.**
   - `git fetch origin main <branch>`.
   - The branch must be ahead of `origin/main` and not behind; otherwise merge `origin/main` in first and re-run the checks.
   - The latest `CI` run on the branch head must be green. Check it with the GitHub MCP `actions_list`.
2. **Look for a PR template** (`.github/pull_request_template.md` and the other usual places). If one exists, follow its headings.
3. **Open the PR** (GitHub MCP `create_pull_request`, base `main`).
   - **Title:** `R<a>–R<b>: <short list> (2.0.0-alpha.<V>)`.
   - **Body:** a Summary with one bullet per step, then Checks (exact local counts and the CI head), then Manual-pending.
   - **End of body:** the attribution lines from the session's system reminder.
   - No model identifiers anywhere.
4. **Merge** with `merge_pull_request`:
   - `merge_method: merge`;
   - `expectedHeadSha` set to the head;
   - `commit_title: Merge PR #<n>: R<a>–R<b> (2.0.0-alpha.<V>)`.
5. **Restart the work branch:**

   ```bash
   git fetch origin main
   git checkout -B <branch> origin/main
   ```
6. **Wait for GitHub Pages.** The "pages build and deployment" run must finish green (Actions API; the cloud proxy blocks `github.io`). If it sits queued, re-run it once with `actions_run_trigger` `rerun_workflow_run`.
7. **Record the merge.**
   - Add a ledger row to `docs/superpowers/progress-redesign.md`: `| PR #<n> | \`<sha>\` (merge) | … GitHub Pages serves 2.0.0-alpha.<V> … |`.
   - Update CLAUDE.md → "Current state".
   - Commit `docs: record the PR #<n> merge (…)` and push with `git push --force-with-lease -u origin <branch>`.
8. **Tell the user** in Serbian:
   - the PR number and merge commit;
   - that Pages serves the version;
   - what is still manual.

   If they may want it, offer the `android-apk` skill.
