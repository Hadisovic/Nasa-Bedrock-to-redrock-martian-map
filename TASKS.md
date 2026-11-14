# Project Task Tracker

Maintained by Claude when Alia (`aliad77`) requests coordination. Reconcile current
GitHub issues/PRs first. Publish batched tracker updates through a documentation PR.
See [workflow and status rules](docs/coordination.md#tasksmd-maintenance).

## Application phases and milestones — awaiting leader approval

No verified, approved application tasks exist yet. No task checkboxes are invented.
The leader must approve a product roadmap before Alia assigns implementation work.
When approved tasks exist, group them by their actual phase/milestone. Each entry
must have a checkbox, short description, linked issue, assigned human GitHub username
(or explicitly unassigned), status, dependencies and linked PR (or none yet).

Statuses: `NOT_STARTED`, `ASSIGNED`, `IN_PROGRESS`, `AWAITING_REVIEW`, `APPROVED`,
`COMPLETED`, `BLOCKED`, `CHANGES_REQUESTED`. Only verified `COMPLETED` entries use
`[x]`; code normally requires human-authorized merge into `main` and integration
verification. `APPROVED` remains `[ ]`. Issue closure alone is not completion.

## Historical experiments — excluded from the active checklist

[Roadmap #3](https://github.com/Hadisovic/bedrock-to-redrock/issues/3) approved only
smoke testing. Its submitted work was manager-approved but not integrated at migration
inspection; it must not be marked completed. PRs are closed as obsolete by this migration.

| Task evidence | Recorded human | Historical result | Dependencies | PR |
|---|---|---|---|---|
| [Smoke A #4](https://github.com/Hadisovic/bedrock-to-redrock/issues/4) | @Hadisovic | Approved, unmerged; retired | None | [#7](https://github.com/Hadisovic/bedrock-to-redrock/pull/7) |
| [Smoke B #5](https://github.com/Hadisovic/bedrock-to-redrock/issues/5) | @masaa0 | Approved, unmerged; retired | None | [#6](https://github.com/Hadisovic/bedrock-to-redrock/pull/6) |

Issue discussions, approvals, remote branches and unfinished local work are preserved.
Retirement is not `COMPLETED` and supplies no dependency completion evidence.
