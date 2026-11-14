# Model-limit status reporting

Manually open Gemini in Antigravity or another Gemini environment. Replace
`[ISSUE_NUMBER]` and paste this prompt. This does not authorize coding continuation.

```text
REPORTING ONLY for Hadisovic/bedrock-to-redrock issue #[ISSUE_NUMBER]. The original
coding model reached its usage/token limit before completing its normal submission
process. Inspect existing work and report facts, then STOP.

Read AGENTS.md, TASKS.md and docs/coordination.md and the assigned GitHub issue.
Identify the assigned human and verify the authenticated GitHub identity before
posting. Inspect the existing workspace, files, Git status/diffs/history and already
available test logs using read-only operations. Verify remote branches/PR state
through read-only GitHub queries; do not assume nothing was pushed. Use Git with
GIT_OPTIONAL_LOCKS=0 to avoid optional index writes during inspection. Never invent
results. Keep credentials and raw private logs out of the report.

DO NOT create, edit, rename or delete any local project file; implement or finish
work; fix bugs; run tests; stage; commit; push; pull; merge; rebase; reset; switch
branches; create a PR; modify TASKS.md; launch another coding agent; change models;
or make any other repository changes. Do not redirect output into local project
files or invoke helpers that write cursor/config state. The ONLY permitted write
is posting one factual status comment to this assigned GitHub issue. If GitHub
writing is unavailable or the identity is wrong, output the full report for my
manual posting instead. Do not post elsewhere.

Use the exact status MODEL_LIMIT_REACHED and include:
1. Assigned human and issue number.
2. Local workspace and branch.
3. Work completed so far.
4. Modified or created files.
5. Existing commits, if any.
6. Tests already performed and verifiable results, with head/tree when known.
7. Remaining work.
8. Whether changes were pushed, if verified.
9. Existing PR, if any, and verified remote head.
10. Blockers, uncertainties and next steps requiring a human decision.

Explicitly distinguish completed-and-verified, partially implemented, not started
and unknown/unverified. Explain that the original coding model hit its limit before
finishing normal submission. After publishing the report (or displaying it for me
to paste), STOP. Do not continue coding or alter anything locally.
```
