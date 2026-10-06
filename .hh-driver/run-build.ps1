# run-build.ps1 : builds The Hitchhiker's Guide to Web Design from hh-build-plan/prompts, one prompt at a time.
#
# Each prompt runs in a fresh headless Grok session on the DEFAULT login (C:\Users\lucid\.grok; GROK_HOME is unset, never changed).
#   grok -p=<prompt file contents> -m grok-4.7 --effort <prompt effort> --output-format streaming-json --max-turns <N>
#        --always-approve --sandbox workspace --deny <rules...> --rules <driver rules>    (cwd = project root)
# After each prompt: a new commit must exist and the tree must be clean; leftovers are committed with the prompt's own commit message.
# After every checkpoint (and the once-over): git push origin main (normal push, never force).
#
# Control (all files live in .hh-driver\):
#   PAUSE       create it to pause between prompts (the running prompt finishes first). Delete it to resume.
#   BLOCKED.md  written when the driver stops (stall after one retry, usage limit, failed prompt). Read it, fix, delete it,
#               then relaunch (it resumes from STATE.json).
#   STATE.json  current prompt, start time, status, last commit, last push.
#   logs\NNN.log (stdout, streaming JSON), logs\NNN.err.log (stderr), driver.log (driver timeline).
# Launch detached:
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\lucid\Desktop\hitchhikers-guide-to-web-design\.hh-driver\run-build.ps1'
# Options: -StartAt 12 (start at prompt 012), -StopAfter 40 (stop cleanly after prompt 040), -SmokeTest (one tiny call with the full flag set).
param([int]$StartAt = 0, [int]$StopAfter = 0, [switch]$SmokeTest)

$ErrorActionPreference = 'Continue'
$Root      = 'C:\Users\lucid\Desktop\hitchhikers-guide-to-web-design'
$Drv       = Join-Path $Root '.hh-driver'
$LogDir    = Join-Path $Drv 'logs'
$PromptDir = Join-Path $Root 'hh-build-plan\prompts'
$StateFile = Join-Path $Drv 'STATE.json'
$PauseFile = Join-Path $Drv 'PAUSE'
$Blocked   = Join-Path $Drv 'BLOCKED.md'
$DLog      = Join-Path $Drv 'driver.log'
$LockFile  = Join-Path $Drv 'driver.pid'
$EmptyIn   = Join-Path $Drv 'empty-stdin.txt'
$Grok      = 'C:\Users\lucid\.grok\bin\grok.exe'
$Model     = 'grok-4.7'
$StallMin  = 30
$PollSec   = 20

New-Item -ItemType Directory -Force $LogDir | Out-Null
if (-not (Test-Path $EmptyIn)) { [IO.File]::WriteAllText($EmptyIn, '') }

# Default kr8tivai login only: make sure nothing redirects the Grok home or forces a sandbox profile from the environment.
Remove-Item Env:GROK_HOME -ErrorAction SilentlyContinue
Remove-Item Env:GROK_SANDBOX -ErrorAction SilentlyContinue

function L($m) { Add-Content -Path $DLog -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" -Encoding UTF8 }
function G { $o = & git -C $Root @args 2>&1; $script:GitCode = $LASTEXITCODE; @($o | ForEach-Object { "$_" }) }
function Head { (G rev-parse HEAD | Select-Object -First 1) }
function Dirty { @(G status --porcelain | Where-Object { $_.Trim() }) }

$State = [ordered]@{ current = ''; file = ''; kind = ''; effort = ''; started = ''; status = 'idle'; attempt = 0; last_commit = ''; last_done = ''; last_push = ''; pid = $PID; updated = '' }
if (Test-Path $StateFile) {
  try { $old = Get-Content $StateFile -Raw | ConvertFrom-Json; foreach ($k in @('last_done', 'last_commit', 'last_push')) { if ($old.$k) { $State[$k] = "$($old.$k)" } } } catch {}
}
function Save([hashtable]$kv) {
  foreach ($k in $kv.Keys) { $State[$k] = $kv[$k] }
  $State.updated = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); $State.pid = $PID
  [IO.File]::WriteAllText($StateFile, ($State | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
}
function Block($why, $detail) {
  $body = "# BLOCKED $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (America/Costa_Rica)`n`nPrompt: $($State.current) ($($State.file))`n`nReason: $why`n`n$detail`n`nFix the cause, delete this file, then relaunch run-build.ps1 (it resumes after STATE.json last_done).`n"
  [IO.File]::WriteAllText($Blocked, $body, (New-Object Text.UTF8Encoding $false))
  L "BLOCKED: $why"; Save @{ status = "blocked: $why" }
}

# Windows command-line quoting (MSVC / Rust argv rules) so prompt text with quotes, backslashes and newlines arrives intact.
function Q([string]$s) {
  if ($s -eq '') { return '""' }
  if ($s -notmatch '[\s"]') { return $s }
  $sb = New-Object System.Text.StringBuilder; [void]$sb.Append('"'); $bs = 0
  foreach ($ch in $s.ToCharArray()) {
    if ($ch -eq [char]92) { $bs++; continue }
    if ($ch -eq [char]34) { [void]$sb.Append([string][char]92 * ($bs * 2 + 1)); [void]$sb.Append([char]34); $bs = 0; continue }
    if ($bs -gt 0) { [void]$sb.Append([string][char]92 * $bs); $bs = 0 }
    [void]$sb.Append($ch)
  }
  if ($bs -gt 0) { [void]$sb.Append([string][char]92 * ($bs * 2)) }
  [void]$sb.Append('"'); $sb.ToString()
}

# Approve tool calls, but deny anything outside this build's lane. (On Windows the --sandbox profile is not kernel-enforced, so the deny rules carry the weight.)
$DenyRules = @(
  'Bash(*git push*)', 'Bash(*git reset --hard*)', 'Bash(*git clean -*)', 'Bash(*git filter-branch*)', 'Bash(*git config --global*)',
  'Bash(*grok login*)', 'Bash(*grok logout*)', 'Bash(*GROK_HOME*)', 'Bash(*.grok-aurahomes*)', 'Bash(*Vanguard-Eco-Homes*)',
  'Bash(*taskkill*)', 'Bash(*Stop-Process*)', 'Bash(*pkill*)', 'Bash(*killall*)', 'Bash(*wmic*)',
  'Bash(*vercel deploy*)', 'Bash(*vercel --prod*)', 'Bash(*netlify deploy*)', 'Bash(*wrangler deploy*)', 'Bash(*wrangler pages deploy*)',
  'Bash(*npm publish*)', 'Bash(*pnpm publish*)', 'Bash(*gh release create*)', 'Bash(*gh repo delete*)',
  'Bash(*Set-ExecutionPolicy*)', 'Bash(*Set-MpPreference*)', 'Bash(*reg add*)', 'Bash(*reg delete*)', 'Bash(*bcdedit*)', 'Bash(*netsh*)', 'Bash(*schtasks*)',
  'Bash(*shutdown*)', 'Bash(*format c:*)', 'Bash(*Remove-Item*C:\Users\lucid\*-Recurse*)', 'Bash(*rm -rf ~*)', 'Bash(*rm -rf /*)',
  'Read(**/.ssh/**)', 'Read(**/.git-credentials)', 'Read(**/.grok/auth*)', 'Read(**/.grok/*token*)', 'Read(**/.grok/*cred*)', 'Read(**/.grok-aurahomes/**)',
  'Read(**/.env)', 'Read(**/.env.local)', 'Edit(**/.grok-aurahomes/**)', 'Edit(**/Vanguard-Eco-Homes/**)', 'Write(**/.grok-aurahomes/**)', 'Write(**/Vanguard-Eco-Homes/**)'
)
$DriverRules = 'You are running headless under an automated build driver in ' + $Root + '. Work only inside this project. ' +
  'Do not run git push (the driver pushes after checkpoints). Do not sign in or out of Grok, change GROK_HOME, or touch other projects. ' +
  'Do not stop or kill processes you did not start; stop any dev server you start before you finish. Never print or commit secrets. ' +
  'Use PowerShell syntax for terminal commands (no && chaining; use ;). When the prompt is done, make the commit named in its Commit section and leave the working tree clean. Nobody can answer questions: make the reasonable choice, note it in the report, and keep going.'

function Build-Args([string]$text, [string]$effort, [int]$turns) {
  # -p=<contents>: the prompt files start with '---' frontmatter, which a bare -p value would be parsed as a flag.
  $a = @((Q ('-p=' + $text)), '-m', $Model, '--effort', $effort, '--output-format', 'streaming-json', '--max-turns', "$turns",
         '--always-approve', '--sandbox', 'workspace', '--cwd', (Q $Root))
  foreach ($d in $DenyRules) { $a += @('--deny', (Q $d)) }
  $a += @('--rules', (Q $DriverRules))
  ($a -join ' ')
}

function Kill-Tree([int]$id) {
  # Only ever our own child grok.exe and its descendants (never other Grok sessions).
  $kids = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$id" -ErrorAction SilentlyContinue)
  foreach ($k in $kids) { Kill-Tree ([int]$k.ProcessId) }
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}

function Is-UsageLimit([string]$log, [string]$err) {
  $tail = @()
  if (Test-Path $err) { $tail += Get-Content $err -Tail 60 -ErrorAction SilentlyContinue }
  if (Test-Path $log) { $tail += @(Get-Content $log -Tail 40 -ErrorAction SilentlyContinue | Where-Object { $_ -match '"type":"(error|end)"' -or $_ -notmatch '^\{' }) }
  $t = ($tail -join "`n")
  return ($t -match '(?i)usage limit|rate.?limit(ed)?\b.*(reached|exceeded)|quota|limit (reached|exceeded)|too many requests|\b429\b|insufficient (credit|balance)|out of credits|subscription limit|upgrade your plan')
}

# One Grok session for one prompt. Returns: ok | stall | usage | fail
function Run-Once($p, [int]$attempt) {
  $suffix = $(if ($attempt -gt 1) { ".retry$($attempt - 1)" } else { '' })
  $log = Join-Path $LogDir "$($p.id)$suffix.log"; $err = Join-Path $LogDir "$($p.id)$suffix.err.log"
  $argStr = Build-Args $p.text $p.effort $p.turns
  Save @{ current = $p.id; file = $p.name; kind = $p.kind; effort = $p.effort; started = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); status = 'running'; attempt = $attempt }
  L "START $($p.id) $($p.name) kind=$($p.kind) effort=$($p.effort) turns=$($p.turns) attempt=$attempt argsLen=$($argStr.Length)"
  $proc = $null
  try {
    $proc = Start-Process -FilePath $Grok -ArgumentList $argStr -WorkingDirectory $Root -NoNewWindow -PassThru `
              -RedirectStandardOutput $log -RedirectStandardError $err -RedirectStandardInput $EmptyIn -ErrorAction Stop
  } catch { L "SPAWN ERROR $($p.id): $($_.Exception.Message)"; return 'fail' }
  if (-not $proc) { L "SPAWN ERROR $($p.id): no process object"; return 'fail' }
  $null = $proc.Handle   # keep a handle so ExitCode is readable after exit
  L "SPAWNED $($p.id) grok pid $($proc.Id)"
  Save @{ grok_pid = $proc.Id }
  $lastSize = -1; $lastGrow = Get-Date
  while (-not $proc.HasExited) {
    Start-Sleep -Seconds $PollSec
    $size = 0; foreach ($f in @($log, $err)) { if (Test-Path $f) { $size += (Get-Item $f).Length } }
    if ($size -ne $lastSize) { $lastSize = $size; $lastGrow = Get-Date }
    elseif (((Get-Date) - $lastGrow).TotalMinutes -ge $StallMin) {
      L "STALL $($p.id): no log growth for $StallMin min (size $size); killing grok pid $($proc.Id)"
      Kill-Tree $proc.Id; Start-Sleep 5; return 'stall'
    }
  }
  $proc.WaitForExit(); $code = $proc.ExitCode
  $end = @(Get-Content $log -Tail 80 -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\{"type":"end"' } | Select-Object -Last 1)
  $stop = ''; if ($end.Count) { try { $stop = ($end[0] | ConvertFrom-Json).stopReason } catch {} }
  L "EXIT $($p.id) code=$code stopReason=$stop logBytes=$((Get-Item $log -ErrorAction SilentlyContinue).Length)"
  if (Is-UsageLimit $log $err) { if ($code -ne 0 -or -not $end.Count -or $stop -ne 'end_turn') { return 'usage' } }
  if ($code -ne 0 -and -not $end.Count) { return 'fail' }
  return 'ok'
}

function Read-Prompt($file) {
  $text = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
  $fm = ''; if ($text -match '(?s)^---\r?\n(.*?)\r?\n---') { $fm = $Matches[1] }
  $id = $file.Name.Substring(0, 3)
  $kind = $(if ($fm -match '(?m)^kind:\s*"?([\w-]+)') { $Matches[1] } else { 'build' })
  $effort = $(if ($fm -match '(?m)^effort:\s*"?(\w+)') { $Matches[1] } else { 'high' })
  $msg = "build($id): $($file.BaseName)"
  if ($text -match '(?s)## Commit\s*\r?\n\s*```[^\n]*\r?\n(.*?)\r?\n```') { $msg = $Matches[1].Trim() }
  $turns = $(switch ($kind) { 'once-over' { 600 } 'checkpoint' { 400 } default { 300 } })
  [pscustomobject]@{ id = $id; num = [int]$id; name = $file.Name; text = $text; kind = $kind; effort = $effort; msg = $msg; turns = $turns }
}

function Push-Main($why) {
  $o = G push origin main
  if ($GitCode -eq 0) { L "PUSH ok after $why : $(Head)"; Save @{ last_push = "$(Head) $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" } }
  else { L "PUSH FAILED after $why (continuing; next checkpoint retries): $(($o | Select-Object -Last 6) -join ' | ')"; Save @{ last_push = "FAILED $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" } }
}

# ---------- smoke test ----------
if ($SmokeTest) {
  $a = Build-Args 'Reply with exactly the word READY and nothing else. Do not use any tools.' 'low' 2
  $out = Join-Path $LogDir 'smoke.log'
  $pr = Start-Process -FilePath $Grok -ArgumentList $a -WorkingDirectory $Root -NoNewWindow -PassThru -Wait -RedirectStandardOutput $out -RedirectStandardError "$out.err" -RedirectStandardInput $EmptyIn
  Write-Output "exit=$($pr.ExitCode) argsLen=$($a.Length)"; Get-Content $out | Where-Object { $_ -match '"type":"(text|end|error)"' } | ForEach-Object { $_.Substring(0, [Math]::Min(240, $_.Length)) }
  Get-Content "$out.err" -ErrorAction SilentlyContinue | Select-Object -Last 10
  exit 0
}

# ---------- single instance ----------
if (Test-Path $LockFile) {
  $op = (Get-Content $LockFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($op -and (Get-Process -Id ([int]$op) -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'powershell|pwsh' })) { L "another driver is running (pid $op); exiting"; exit 1 }
}
Set-Content $LockFile $PID
try {
  if (Test-Path $Blocked) { L "BLOCKED.md exists; not starting. Delete it to resume."; exit 2 }
  $files = @(Get-ChildItem $PromptDir -Filter '*.md' | Where-Object { $_.Name -match '^\d{3}-' } | Sort-Object Name)
  $from = $StartAt; if ($from -le 0) { $from = $(if ($State.last_done) { [int]$State.last_done + 1 } else { 1 }) }
  L "driver start pid=$PID prompts=$($files.Count) from=$from stopAfter=$StopAfter GROK_HOME='$env:GROK_HOME' head=$(Head)"
  foreach ($f in $files) {
    $p = Read-Prompt $f
    if ($p.num -lt $from) { continue }
    if ($StopAfter -gt 0 -and $p.num -gt $StopAfter) { L "StopAfter $StopAfter reached"; Save @{ status = "stopped after $StopAfter" }; break }
    while (Test-Path $PauseFile) { Save @{ status = "paused before $($p.id)" }; Start-Sleep 30 }
    $d = Dirty
    if ($d.Count) { L "tree dirty before $($p.id): $($d -join '; ')"; Block "working tree not clean before prompt $($p.id)" ("git status --porcelain:`n" + ($d -join "`n")); exit 3 }
    $before = Head
    $result = ''; $attempt = 0
    while ($attempt -lt 2) {
      $attempt++
      $result = Run-Once $p $attempt
      if ($result -eq 'usage') { Block "Grok usage limit reached during prompt $($p.id)" "See logs\$($p.id)*.log and logs\$($p.id)*.err.log. Relaunch when the limit resets; the prompt reruns from the start in a fresh session (commit or stash any partial work first)."; exit 4 }
      $after = Head; $d = Dirty
      if ($result -eq 'ok' -and ($after -ne $before -or $d.Count)) { break }
      if ($result -eq 'ok') { $result = 'nochange'; L "prompt $($p.id) finished with no commit and no changes" }
      if ($attempt -lt 2) {
        if ($d.Count) { L "keeping partial work from attempt $attempt for the retry" }
        L "retrying $($p.id) in a fresh session (reason: $result)"
      }
    }
    if ($result -ne 'ok') {
      Block "prompt $($p.id) did not complete after one retry (last result: $result)" "See logs\$($p.id).log and logs\$($p.id).retry1.log. HEAD is $(Head); partial work, if any, is left uncommitted."; exit 5
    }
    $d = Dirty
    if ($d.Count) {
      L "prompt $($p.id) left $($d.Count) uncommitted paths; committing with the prompt's message"
      $null = G add -A; $null = G commit -m $p.msg -m "Committed by .hh-driver after the Grok session ended with a dirty tree."
      if ($GitCode -ne 0) { Block "driver commit failed after prompt $($p.id)" ((G status --short) -join "`n"); exit 6 }
    }
    $after = Head; $d = Dirty
    if ($after -eq $before) { Block "no commit after prompt $($p.id)" 'The session ended cleanly but nothing was committed.'; exit 7 }
    if ($d.Count) { Block "tree still dirty after prompt $($p.id)" ($d -join "`n"); exit 8 }
    $count = @(G rev-list --count "$before..$after")[0]
    L "DONE $($p.id): $count commit(s), HEAD $after : $(@(G log -1 --format=%s)[0])"
    Save @{ status = "done $($p.id)"; last_done = $p.id; last_commit = $after }
    if ($p.kind -eq 'checkpoint' -or $p.kind -eq 'once-over') { Push-Main "checkpoint $($p.id)" }
  }
  if (-not (Test-Path $Blocked) -and $State.status -notmatch '^stopped') { L 'all prompts done'; Save @{ status = 'complete' }; Push-Main 'final' }
}
finally { Remove-Item $LockFile -ErrorAction SilentlyContinue }
