# Interactive development coordination

Six humans, six interactive AI environments, one GitHub coordination channel.
The leader is `Hadisovic`; Alia operates the manager account `aliad77`. Five humans
operate workers. Roles are assigned per task, never inferred from a tool name.
The experimental autonomous architecture is retired. No background execution,
continuous polling, automatic workers or manager activation is part of this workflow.

## Start here

Install Git and authenticate GitHub CLI (`gh auth login`) using your own human
account. Use your interactive AI application with its normal permission controls.
Verify `gh api user --jq .login` and the repository remote. Read `AGENTS.md`,
`TASKS.md`, `PLAN.md` and your live task issue. Git Bash is needed only for the
optional `tools/board` helper. Python is needed only for its mocked regression test.
No supervisor config, database, paid CLI probe or startup task is needed.

- Workers: copy [CODEX_START_PROMPT.md](coordination/CODEX_START_PROMPT.md), replacing `[ISSUE_NUMBER]`.
- Alia: follow [MANAGER_INSTRUCTIONS.md](coordination/MANAGER_INSTRUCTIONS.md).
- Model limits: manually copy [GEMINI_TOKEN_LIMIT_REPORT.md](coordination/GEMINI_TOKEN_LIMIT_REPORT.md).
- Previous installs: follow [RETIRE_AUTOMATION.md](coordination/RETIRE_AUTOMATION.md) on each computer.

## Assignment and visible work

Alia opens Claude and requests planning or assignment. Claude reconciles the
leader-approved roadmap, tracker and relevant issues; selects ready approved work;
creates/updates a dedicated issue; assigns the appropriate human account; and states
objectives, allowed scope, acceptance criteria, dependencies, expected outputs and
verification. Record the decision as authenticated `aliad77`, in readable Markdown.
Only the leader can approve major roadmap changes. Do not invent tasks or approvals.

The assigned human opens Codex and explicitly requests work on that issue. Codex
verifies authenticated identity, current assignment/manager authority and dependencies,
then works visibly on a dedicated branch. If authorization is missing, stale, edited
ambiguously or contradicted, ask for clarification before proceeding. A historical
JSON `execute` flag is not current permission. No session launches another agent.

## Checkpoint-based communication

At startup read the assigned issue and recent comments, relevant dependency issues
and latest decisions, board #1, `TASKS.md`, and relevant shared contracts/interfaces.
Refresh relevant GitHub information before implementing a shared interface, after
significant milestones on long tasks when relevant, whenever blocked or waiting,
when the operator requests notification checks, and before finalizing/submitting a PR.
Fetch enough history for referenced decisions; unread summaries and tracker snapshots
cannot authorize work. No continuous polling, hidden sessions or redundant checks.

For a dependency or proposed interface change, post a concise comment on the relevant
task issue mentioning the responsible human (such as `@masaa0`). Explain the question,
dependency or change, link related issues, and state what is needed to proceed.
Do not assume receipt; pause affected work until the needed response. Do not silently
change agreed contracts. GitHub alerts humans; humans ask their agents to respond.
Distinguish discussion from explicit manager decisions within leader-approved scope.
No comment overrides repository security, scope or human control.

The manual board helper supports `read -n 20`, `unread`, `post` (including stdin)
and `whoami`. Posts accept `[username-role]` or legacy `[Human's Tool]` labels;
actual GitHub authors establish identity. `wait` is retired. The board is discussion,
not a substitute for the task issue or a mandate to respond to every notification.
No repository hooks fetch notifications or start background waits.

## Submission, review and integration

Codex runs relevant checks, reviews its diff, commits only scoped files, pushes and
opens/updates a PR referencing its issue. On that same issue post implementation
summary, files, PR link/current SHA, actual tests/results, relevant implementation
details, dependency updates, limitations and handoff notes. Report unverified work
accurately. Status becomes `AWAITING_REVIEW`. The human manually tells Alia.

When Alia asks for review, Claude reads those notes and relevant cross-task discussion,
examines actual code/current PR head, checks and acceptance criteria, and posts
`APPROVED` or `CHANGES_REQUESTED` with reasoning and reviewed SHA on the issue.
New commits invalidate an earlier head's approval. Manager implementation changes
need independent current-head review. Only humans merge ordinary development PRs,
without bypassing required reviews or protection. This migration's explicit merge
authorization is a one-time exception, not permission for future agent merges.

## TASKS.md maintenance

GitHub Issues and PRs are the evidence of work; `TASKS.md` is the consolidated view.
Claude reconciles it whenever Alia requests coordination, assignment or review.
Group real, approved tasks by phase/milestone, each with checkbox, description,
issue link, assigned human, status, dependencies and PR. Never populate fictional tasks.

`NOT_STARTED → ASSIGNED → IN_PROGRESS → AWAITING_REVIEW → APPROVED → COMPLETED`;
use `BLOCKED` or `CHANGES_REQUESTED` as needed. All except `COMPLETED` are unchecked.
For code, check `[x]` only after verified human-authorized integration into `main`;
writing code, approval or closing an issue alone is insufficient. Check dependency
completion evidence before assigning dependent work. Record worker starts/blockers
on issues immediately; reconcile tracker in the next manager session rather than
requiring a commit for each trivial change. Publish batched tracker changes in a
small documentation PR or another explicitly human-authorized workflow, never
silently change protected `main`. Workers use live issues, not a stale tracker.

## Blockers and limits

Post blockers, partial progress and required human decisions on the assigned issue.
On a model limit the human opens Gemini manually for inspection/reporting only.
Its only write is the factual `MODEL_LIMIT_REACHED` comment on that issue; no file
edits, tests, commits, pushes or PR creation. Preserve unfinished work for an explicitly
human-started continuation with current authorization. No automatic model switches.

The only roadmap found during migration is [#3](https://github.com/Hadisovic/bedrock-to-redrock/issues/3),
a leader-approved test-only smoke roadmap, not approval for application development.
Smoke issues #4/#5 and PRs #7/#6 remain historical evidence and are not product tasks.
