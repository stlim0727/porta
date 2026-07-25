param(
  [string]$HostAddress,
  [int]$WebPort = 5173,
  [int]$ProxyPort = 3170,
  [switch]$Foreground,
  [switch]$RequireLanguageServer,
  [switch]$Stable,
  [switch]$Clean,
  [switch]$Tail
)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\porta-process-lib.ps1"

$repoRoot = Get-PortaRepoRoot
Set-Location -LiteralPath $repoRoot

$tailscaleIp = Resolve-PortaTailscaleIp -HostAddress $HostAddress

Write-Host "Stopping existing Porta dev processes..."
$existing = @(Get-PortaDevProcesses -RepoRoot $repoRoot -Ports @($WebPort, $ProxyPort))
if ($existing.Count -gt 0) {
  $existing | Select-Object ProcessId, ParentProcessId, CommandLine | Format-Table -AutoSize
  Stop-PortaProcessTree -RootIds @($existing | ForEach-Object { [int]$_.ProcessId })
  Start-Sleep -Seconds 2
} else {
  Write-Host "No existing Porta dev processes found."
}

if ($Clean) {
  Write-Host "Cleaning node_modules and restoring dependencies..."
  $nmFolders = @(
    "node_modules",
    "packages\web\node_modules",
    "packages\proxy\node_modules"
  )
  foreach ($folder in $nmFolders) {
    $fullPath = Join-Path $repoRoot $folder
    if (Test-Path $fullPath) {
      Write-Host "Removing $folder..."
      try {
        Remove-Item -Recurse -Force $fullPath -ErrorAction Stop
      } catch {
        Write-Warning "Could not remove ${folder}: $($_.Exception.Message)"
      }
    }
  }
  Write-Host "Running pnpm install..."
  pnpm install
}

if ($Foreground) {
  if ($Stable) {
    Write-Host "Starting Porta stable server in the foreground..."
    pnpm serve:tailscale
  } else {
    Write-Host "Starting Porta dev server in the foreground..."
    pnpm dev:tailscale
  }
  exit $LASTEXITCODE
}

$scriptName = if ($Stable) { "serve:tailscale" } else { "dev:tailscale" }
$modeName = if ($Stable) { "stable" } else { "dev" }

Write-Host "Starting Porta $modeName server in the background..."

# Create a self-deleting Windows Scheduled Task to launch Porta.  This is the
# most reliable way to get a truly detached process tree on Windows — the task
# runs under the Task Scheduler service, so it has zero dependency on the
# calling terminal's console host or session.
# Collect and serialize caller's PORTA_* environment variables to preserve them
$envAssignments = @()
foreach ($envVar in Get-ChildItem Env:PORTA_*) {
  $name = $envVar.Name
  $val = $envVar.Value -replace '"', '`"'
  $envAssignments += "`$env:$name = `"$val`""
}
$envBlock = $envAssignments -join "; "
if ($envBlock) { $envBlock += "; " }

$taskName = "PortaDev_$(Get-Random)"
try {
  $taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command `"${envBlock}Set-Location -LiteralPath '$repoRoot'; pnpm $scriptName`"" -WorkingDirectory $repoRoot
  $taskTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(1)
  $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Force | Out-Null

  # Start it immediately
  Start-ScheduledTask -TaskName $taskName
  Start-Sleep -Seconds 2

  # Find the PID that the task spawned
  $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
  $launcher = [pscustomobject]@{ Id = "task:$taskName" }

  Write-Host "Launcher PID: $($launcher.Id)"

  $webUrl = "http://${tailscaleIp}:${WebPort}/"
  $healthUrl = "http://${tailscaleIp}:${ProxyPort}/api/health"
  $startupTimeoutSeconds = if ($Stable) { 180 } else { 45 }

  Write-Host "Waiting for $webUrl ..."
  if (-not (Wait-PortaHttpOk -Url $webUrl -TimeoutSeconds $startupTimeoutSeconds)) {
    throw "Web UI did not become healthy at $webUrl"
  }

  Write-Host "Waiting for $healthUrl ..."
  if (-not (Wait-PortaHttpOk -Url $healthUrl -TimeoutSeconds $startupTimeoutSeconds)) {
    throw "Proxy health did not become healthy through Vite at $healthUrl"
  }

  $health = Get-PortaHealth -HostAddress $tailscaleIp -ProxyPort $ProxyPort
  $languageServerCount = @($health.languageServers).Count

  if ($RequireLanguageServer -and $languageServerCount -eq 0) {
    throw "Porta is running, but no Antigravity Language Server was discovered."
  }

  Write-Host "Porta is running:"
  Write-Host "  Web UI:           $webUrl"
  Write-Host "  Proxy:            http://${tailscaleIp}:${ProxyPort}"
  Write-Host "  Mode:             $modeName"
  Write-Host "  Language servers: $languageServerCount"
} finally {
  # Clean up the registered task so expired tasks do not accumulate
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false | Out-Null
  }
}

if ($Tail) {
  $logFile = Join-Path $repoRoot "logs\proxy.log"
  if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "Streaming logs/proxy.log... Press Ctrl+C to stop."
    Get-Content -Path $logFile -Wait -Tail 20
  } else {
    Write-Host "Log file $logFile not found to stream."
  }
}
