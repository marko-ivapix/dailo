#!/bin/bash
# PreToolUse guard for Bash: blocks pushes to main/master and force pushes without a lease. Work goes to the session's
# branch, and main changes only through a merged pull request (CLAUDE.md → "Branches and pull requests").
# The hook gets the tool call as JSON on stdin; exit 2 blocks the command and shows the reason to Claude.
node -e '
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  let command = "";
  try { command = JSON.parse(input).tool_input?.command || ""; } catch { process.exit(0); }
  for (const part of command.split(/&&|\|\||;|\n/)) {
    if (!/\bgit\s+push\b/.test(part)) continue;
    if (/(\s|:|refs\/heads\/)(main|master)(\s|$)/.test(part)) {
      console.error("Blocked: do not push to main/master. Push the session branch; main changes only through a merged pull request.");
      process.exit(2);
    }
    if (/\s(--force(?!-with-lease)|-f)(\s|$)/.test(part)) {
      console.error("Blocked: force push without a lease. Use --force-with-lease, and only on the session branch.");
      process.exit(2);
    }
  }
});
'
