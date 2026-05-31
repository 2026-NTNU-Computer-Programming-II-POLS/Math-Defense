<#
.SYNOPSIS
  One-command stress run: brings up the stress stack, seeds, runs every k6
  scenario + the compute benches, then writes a dated summary to RESULTS.md
  (keeping the latest 2 runs) with full logs under stress/results/<timestamp>/.

.DESCRIPTION
  Self-contained: detects k6 (repairs PATH, or installs via winget), defines its
  own COMPOSE / k6 env args, waits for backend health, and orchestrates the run.
  Default is a FULL run (real ramping profiles, ~20 min). Run it as:

    powershell -ExecutionPolicy Bypass -File stress\run-stress.ps1

  NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads a
  no-BOM script in the system code page (Big5 here), which would corrupt any
  non-ASCII glyph (em dash, middle dot, arrow, multiplication sign, box-drawing).

.PARAMETER Quick
  Short smoke profiles (~3 min total) for validating the script itself, not for
  the numbers you publish.

.PARAMETER Build
  Force "docker compose up --build" (use after backend code changes).

.PARAMETER TearDown
  Run "docker compose down -v" at the end (wipes the throwaway DB). Default
  leaves the stack up.

.PARAMETER SkipBench
  Skip the Vitest compute benches.
#>
[CmdletBinding()]
param(
  [switch]$Quick,
  [switch]$Build,
  [switch]$TearDown,
  [switch]$SkipBench
)

# k6 / docker / npm are native commands that write to stderr; under 5.1 with
# ErrorActionPreference=Stop a 2>&1 pipeline can throw on the first stderr line.
# Keep Continue and gate on $LASTEXITCODE / explicit checks instead.
$ErrorActionPreference = 'Continue'

# Decode native-command (k6/docker/npm) output as UTF-8 so their banners, check
# marks, and the unicode project path render instead of mojibake in a Big5/
# legacy console. Harmless if it fails (older hosts).
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# --- Paths (derived from this script's location -- no hard-coded absolute path) ---
$StressDir   = $PSScriptRoot
$ProjectRoot = Split-Path $StressDir -Parent
$ComposeFile = Join-Path $StressDir 'docker-compose.stress.yml'
$EnvFile     = Join-Path $StressDir '.env.stress'
$ResultsMd   = Join-Path $StressDir 'RESULTS.md'
$K6Dir       = Join-Path $StressDir 'k6'

$Compose   = @('-f', $ComposeFile, '--env-file', $EnvFile)
$UserCount = 200
$K6Base    = @('-e', 'BASE_URL=http://localhost:8001', '-e', "USER_COUNT=$UserCount", '-e', 'SEED_PASS=StressTest2026!')

function Info($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Die($m)  { Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }

# --- 1. Ensure k6 is callable (detect -> repair PATH -> winget install) ---
function Ensure-K6 {
  if (Get-Command k6 -ErrorAction SilentlyContinue) { return }
  $known = 'C:\Program Files\k6\k6.exe'
  if (Test-Path $known) {
    $env:Path += ";$(Split-Path $known)"
    Write-Host "k6 found at $known - added to PATH for this session."
    return
  }
  Info 'k6 not found - installing via winget'
  winget install k6 --source winget --accept-package-agreements --accept-source-agreements
  if (Test-Path $known) { $env:Path += ";$(Split-Path $known)"; return }
  if (Get-Command k6 -ErrorAction SilentlyContinue) { return }
  Die 'k6 is not installed and auto-install failed. Install k6, then re-run.'
}

# --- k6 text-summary parsing (defensive -- never throws on a miss) ---
function Get-Match([string]$text, [string]$pattern) {
  $m = [regex]::Match($text, $pattern)
  if ($m.Success) { return $m.Groups[1].Value.Trim() } else { return 'n/a' }
}

function Parse-K6([string]$text, [string]$name, [int]$exit) {
  [pscustomobject]@{
    Name   = $name
    Rate   = Get-Match $text 'http_reqs[^\r\n]*?([\d.]+)/s'
    P95    = Get-Match $text 'http_req_duration[^\r\n]*?p\(95\)=([\d.]+\s*\w+)'
    Errors = (Get-Match $text 'http_req_failed[^\r\n]*?([\d.]+)%') + '%'
    Checks = (Get-Match $text 'checks_succeeded[^\r\n]*?([\d.]+)%') + '%'
    Result = if ($exit -eq 0) { 'PASS' } else { "FAIL (thresholds, exit $exit)" }
  }
}

# Run one k6 script, tee output to a log, return ONLY the parsed result row.
#  - `2>&1 | ForEach { "$_" }` stringifies k6's stderr so a "thresholds crossed"
#    line renders as plain text instead of a scary red PowerShell
#    NativeCommandError (5.1 wraps native stderr as ErrorRecords). $LASTEXITCODE
#    still reflects k6's real exit code (99 on a breached threshold).
#  - `| Out-Host` displays k6 live but keeps its output OUT of the function's
#    return value (otherwise every k6 line becomes a bogus result row).
function Invoke-K6([string]$name, [string]$file, [string[]]$extraEnv, [string]$runDir) {
  Info "k6: $name"
  $log = Join-Path $runDir ((($name -replace '[^\w]', '_')) + '.log')
  $a = @('run') + $K6Base + $extraEnv + @((Join-Path $K6Dir $file))
  & k6 @a 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log | Out-Host
  $exit = $LASTEXITCODE
  return Parse-K6 (Get-Content $log -Raw) $name $exit
}

# --- 2. Bring the stack up and wait for health ---
Ensure-K6
& k6 version | Out-Null

Info 'Starting stress stack (docker compose up -d)'
$upArgs = @('compose') + $Compose + @('up', '-d')
if ($Build) { $upArgs += '--build' }
& docker @upArgs
if ($LASTEXITCODE -ne 0) { Die 'docker compose up failed.' }

Info 'Waiting for backend health (http://localhost:8001/health)'
$healthy = $false
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 3
  try {
    $h = Invoke-RestMethod 'http://localhost:8001/health' -TimeoutSec 3
    if ($h.status -eq 'ok') { $healthy = $true; break }
  } catch { }
}
if (-not $healthy) { Die 'Backend did not become healthy within 120s. Check: docker compose logs backend' }
Write-Host 'Backend healthy.'

# --- 3. Per-run output dir + seed ---
$stamp  = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$runDir = Join-Path $StressDir "results\$stamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

# Retention: keep only the 5 most recent result dirs (timestamp names sort
# lexically, so the newest 5 are the keepers). Logs are disposable; RESULTS.md
# (the curated summary) lives one level up and is untouched.
Get-ChildItem (Join-Path $StressDir 'results') -Directory -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -Skip 5 |
  ForEach-Object {
    Write-Host "Pruning old result dir: $($_.Name)"
    Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
  }

Info 'Seeding user pool'
& k6 run @K6Base (Join-Path $K6Dir 'seed-users.js') 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath (Join-Path $runDir 'seed.log') | Out-Host
if ($LASTEXITCODE -ne 0) { Die 'Seeding failed.' }

# --- 4. Run every scenario ---
$tests = @(
  @{ Name = '01 read-heavy';        File = '01-read-heavy.js';        Quick = @('-e','DURATION=20s','-e','VUS=15') },
  @{ Name = '02 auth-flow';         File = '02-auth-flow.js';         Quick = @('-e','DURATION=20s','-e','VUS=15') },
  @{ Name = '03 session-lifecycle'; File = '03-session-lifecycle.js'; Quick = @('-e','DURATION=20s','-e','VUS=15') },
  @{ Name = '05 login-spike';       File = '05-login-spike.js';       Quick = @('-e','SPIKE_VUS=20','-e','SPIKE_LOGINS=40') },
  @{ Name = '04 peak-100';          File = '04-peak-100.js';          Quick = @('-e','DURATION=20s','-e','VUS=20') }
)

$results = @()
foreach ($t in $tests) {
  $extra = if ($Quick) { $t.Quick } else { @() }
  $results += Invoke-K6 $t.Name $t.File $extra $runDir
}

# --- 5. Compute benches (no API; cmd /c dodges the PS execution-policy block on npm.ps1) ---
$benchSummary = 'skipped'
if (-not $SkipBench) {
  Info 'Compute benches (npm run bench)'
  $benchLog = Join-Path $runDir 'bench.log'
  Push-Location (Join-Path $ProjectRoot 'frontend')
  cmd /c "npm run bench" 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $benchLog | Out-Host
  Pop-Location
  $bt = Get-Content $benchLog -Raw
  $curve = Get-Match $bt 'curve_evaluate[^\r\n]*?([\d.]+M ops/s)'
  $score = Get-Match $bt 'compute_total_score[^\r\n]*?([\d.]+M ops/s)'
  $frame = Get-Match $bt '32t x 300e[^\r\n]*?(p95=[\d.]+ms[^\r\n]*?over-budget=\d+/\d+)'
  $benchSummary = "curve_evaluate $curve | compute_total_score $score | hotpath 32t-x-300e $frame"
}

# --- 6. Build this run's markdown entry ---
$now  = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$mode = if ($Quick) { 'quick (smoke)' } else { 'full' }
$lines = @()
$lines += "## $now"
$lines += ''
$lines += "- Mode: **$mode** | host k6 -> dockerized backend (co-located: latency is a floor, not the app ceiling)"
$lines += "- Full logs: ``stress/results/$stamp/``"
$lines += ''
$lines += '| Test | req/s | p95 (overall) | Errors | Checks | Result |'
$lines += '|---|---|---|---|---|---|'
foreach ($r in $results) {
  $lines += "| $($r.Name) | $($r.Rate) | $($r.P95) | $($r.Errors) | $($r.Checks) | $($r.Result) |"
}
$lines += ''
$lines += "**Compute bench:** $benchSummary"
$newEntry = ($lines -join "`r`n").TrimEnd()

# --- 7. Write RESULTS.md, keeping THIS run + the previous one (latest 2) ---
$startMark = '<!-- STRESS-RESULTS:START -->'
$endMark   = '<!-- STRESS-RESULTS:END -->'
$prevNewest = ''
if (Test-Path $ResultsMd) {
  $existing = Get-Content $ResultsMd -Raw
  $blockMatch = [regex]::Match($existing, [regex]::Escape($startMark) + '(.*?)' + [regex]::Escape($endMark), 'Singleline')
  if ($blockMatch.Success) {
    $block = $blockMatch.Groups[1].Value
    # @(...) forces an array: with a single entry PowerShell would return a
    # scalar string and $entries[0] would index its first CHARACTER ('#').
    $entries = @([regex]::Split($block, '(?m)(?=^## )') | Where-Object { $_.Trim() -ne '' })
    if ($entries.Count -ge 1) { $prevNewest = $entries[0].TrimEnd() }
  }
}
$blockContent = $newEntry
if ($prevNewest -ne '') { $blockContent += "`r`n`r`n" + $prevNewest }

$header = @"
# Stress test results

Auto-generated by ``stress/run-stress.ps1`` - keeps the **latest 2 runs** (this
run + the previous one). Older runs are dropped from this file; their full logs
remain under ``stress/results/``. See ``stress/README.md`` for what each
scenario stresses and the important "run the load generator on a separate
machine" caveat.

"@
$final = $header + $startMark + "`r`n`r`n" + $blockContent + "`r`n`r`n" + $endMark + "`r`n"
Set-Content -Path $ResultsMd -Value $final -Encoding ascii

Info 'Summary written to RESULTS.md'
$results | Format-Table -AutoSize | Out-String | Write-Host
Write-Host "Bench: $benchSummary"

# --- 8. Optional teardown ---
if ($TearDown) {
  Info 'Tearing down (docker compose down -v)'
  & docker @Compose down -v
}

Write-Host "`nDone. Results: $ResultsMd  |  Logs: $runDir" -ForegroundColor Green
