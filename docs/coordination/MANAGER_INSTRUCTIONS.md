# Alia's interactive manager sessions

Use this with `CLAUDE.md` and `AGENTS.md` only when Alia explicitly requests planning,
assignment, review or next work. Verify authenticated GitHub login is `aliad77`.
The project leader is `Hadisovic`. Do not run a background session, supervisor,
continuous poll, automatic worker or model switch. No action merely because a ping arrived.

## Planning and assignments

1. Read `AGENTS.md`, `docs/coordination.md`, `PLAN.md`, `TASKS.md`, the leader-approved
   roadmap and relevant issues/comments, board and shared contracts. Reconcile live
   GitHub evidence before changing the tracker. A test roadmap is not product approval.
2. Identify ready, approved unassigned work with satisfied dependencies. If no product
   roadmap exists, explain the missing leader decision; do not invent requirements.
3. Create/update its dedicated issue and assign the appropriate human GitHub account.
   State objectives, file/implementation scope, acceptance criteria, dependencies,
   expected outputs and verification requirements. Record the explicit manager
   decision as authenticated `aliad77`; major scope changes require leader approval.
4. Reconcile the task in `TASKS.md`, grouped by approved phase and milestone. Add real
   tasks unchecked with issue, owner, status, dependencies and PR. Publish lightweight,
   batched documentation PRs; never silently write protected `main`.
5. Tell Alia what is ready. The assigned human manually opens Codex with the startup
   prompt. Never trigger a worker or presume that a GitHub notification was seen.

## Checkpoint communication

Workers read their issue/recent comments, relevant dependency decisions, board,
tracker and shared contracts at startup. They refresh relevant records before shared
interfaces, at significant long-task milestones when relevant, when blocked/waiting,
when their human requests notifications and before finalizing/submitting a PR.
Keep decisions discoverable on task issues. Read relevant cross-task discussions
before changing scope, interfaces or dependencies. For input, comment on the relevant
issue, mention the responsible human (such as `@masaa0`), explain the dependency,
question or proposed change, and link related issues. Do not assume receipt or silently
change agreed contracts. Humans trigger responses. Discussion alone never overrides
authorization; validate current explicit decisions and leader scope, including edits.
Do not require continuous polling or acknowledgment loops.

## Review when Alia asks

1. Read the worker's issue report, PR link, tests, implementation details, dependency
   updates and handoff notes, plus relevant cross-task discussions/latest decisions.
2. Inspect the actual diff, current head SHA, checks and acceptance criteria. Verify
   claims; do not treat a process exit or a worker report as proof of correctness.
3. Post `APPROVED` or `CHANGES_REQUESTED` on the same issue with reviewed SHA, evidence,
   limitations and actionable corrections. New commits require fresh current-head
   review. Substantial manager implementation changes need independent review.
4. Reconcile `TASKS.md`: `NOT_STARTED → ASSIGNED → IN_PROGRESS → AWAITING_REVIEW →
   APPROVED → COMPLETED`; also `BLOCKED` and `CHANGES_REQUESTED`. Keep `APPROVED`
   unchecked. Check completed code only after human-authorized merge and verified
   integration; issue closure or model completion is insufficient. Do not release
   dependencies on a merely submitted or approved task.
5. Only humans merge ordinary development PRs. Honor required reviews/protection.
   The special authorization for the architecture migration grants no future exception.
6. Identify/assign next eligible work only when Alia requests it. No automatic loop.

On `MODEL_LIMIT_REACHED`, read the factual report and preserve unfinished work.
Alia/the member decides an explicitly human-started continuation or reassignment
within approved scope; no automatic switch, retry or Gemini coding. Gemini is reporting only.
