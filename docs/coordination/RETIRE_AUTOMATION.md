# Retire old automation on each computer

Each human must do this locally. Updating this repository cannot stop a supervisor
or detached model already running from an older checkout on another computer.
Do not delete `.coordination/`, `.board/`, worktrees, branches or unfinished files.
Keep local credentials private. Do not restart old queues, adapters or model sessions.

## Windows (ordinary PowerShell)

Disable startup first. For the known worker task:

```powershell
Get-ScheduledTask -TaskName 'BedrockToRedrock-WorkerSupervisor' -ErrorAction SilentlyContinue |
  Disable-ScheduledTask
Get-ScheduledTask | Where-Object TaskName -Like '*Bedrock*' |
  Select-Object TaskName, State
```

Inspect any other listed task's action before disabling it; only disable confirmed
old supervisor entries. Do the same for any manually installed Startup shortcut.
If running in a terminal, use Ctrl+C there. For a running scheduled task, use
`Stop-ScheduledTask -TaskName 'BedrockToRedrock-WorkerSupervisor'`. Inspect processes:

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'tools\.coordination|tools[/\\]board.*wait' } |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine
```

For each confirmed old supervisor/wait PID, stop only that process with
`Stop-Process -Id <PID>`. Inspect its recorded children for detached Codex/Claude
sessions in Task Manager; stop only confirmed old unattended sessions, preserving
files. Do not kill every Python/Codex process or this interactive application.
Re-run the inspection and verify known startup entries are disabled. If permissions
prevent shutdown, ask the local human; never bypass permissions.

If retaining old local config, set `allow_execution` to `false` in
`.coordination/config.json` after stopping the supervisor. No new config is required.

## macOS (ordinary Terminal)

Use Ctrl+C in the old supervisor terminal. Inspect processes and launch agents:

```sh
pgrep -fl 'tools[.]coordination|tools/board.*wait'
launchctl list | grep -i 'bedrock\|redrock\|coordination'
ls "$HOME/Library/LaunchAgents"
crontab -l
```

Inspect any suspected LaunchAgent plist's ProgramArguments/Label; for a confirmed
old supervisor unload and disable that exact local service:

```sh
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/<confirmed-file>.plist"
launchctl disable "gui/$(id -u)/<confirmed-label>"
```

Remove only confirmed old supervisor entries from Login Items, shell startup files
or the user's crontab if configured. Stop each confirmed old process with `kill <PID>`;
inspect descendants (`ps -axo pid,ppid,command`) for detached unattended model sessions.
Do not stop unrelated interactive tools or delete work. Re-run process/service checks.
If old config is retained, set `allow_execution` to `false`. No administrator service
or new login job replaces the old one.

## After shutdown

Safely update the primary clone to current `main` without resetting local work.
Read `AGENTS.md` and the coordination guide, then start tasks manually with the fresh
Codex prompt. Existing worktrees may still contain retired code: do not run it.
The manual board remains available for one-off checkpoint reads/posts. Nothing waits
in the background and no agent is launched by a notification.
