# Child84j read-only project-specific backup inventory.
# Only explicit Supabase Management API GET. No backup restore or export.
# Execution requires SUPABASE_ACCESS_TOKEN in the caller's *process*
# environment. Never paste a PAT into this script, terminal command line,
# ChatGPT, GitHub, CI logs, or a PR. Script prints only aggregate status/times.
# Supabase Management API docs: GET /v1/projects/{ref}/database/backups
# Required token scopes: database:read and fine-grained backups_read.
param(
  [string] $ProjectRef = 'nyxbnccuvmlzffgtdadi'
)
$ErrorActionPreference = 'Stop'
if ($ProjectRef -cne 'nyxbnccuvmlzffgtdadi') {
  Write-Output 'BACKUP_INVENTORY=REJECTED_WRONG_PROJECT'
  exit 2
}
$token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Process')
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Output 'BACKUP_INVENTORY=BLOCKED_NO_MANAGEMENT_TOKEN'
  Write-Output 'Only the authorized owner may inspect Supabase Dashboard > Database > Backups.'
  exit 3
}
$uri = "https://api.supabase.com/v1/projects/$ProjectRef/database/backups"
try {
  $result = Invoke-RestMethod -Method Get -Uri $uri -Headers @{
    Authorization = "Bearer $token"
    Accept = 'application/json'
  } -MaximumRedirection 0 -TimeoutSec 20 -ErrorAction Stop
} catch {
  # Do not output exception text, authorization headers or raw API payloads.
  $statusCode = $null
  try {
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
  } catch {}
  if ($statusCode -in @(401,403)) {
    Write-Output 'BACKUP_INVENTORY=NO_BACKUPS_READ_PERMISSION'
  } elseif ($statusCode -eq 429) {
    Write-Output 'BACKUP_INVENTORY=RATE_LIMITED'
  } else {
    Write-Output 'BACKUP_INVENTORY=QUERY_FAILED'
  }
  exit 4
} finally {
  $token = $null
}
if ($null -eq $result -or $null -eq $result.backups) {
  Write-Output 'BACKUP_INVENTORY=UNEXPECTED_RESPONSE'
  exit 5
}
$records = @($result.backups)
$complete = @($records | Where-Object { $_.status -eq 'COMPLETED' })
$parsed = @(
  foreach ($item in $complete) {
    if (-not $item.inserted_at) { continue }
    try {
      $stamp = [DateTimeOffset]::Parse([string]$item.inserted_at).ToUniversalTime()
      [pscustomobject]@{
        Time = $stamp
        IsPhysical = [bool]$item.is_physical_backup
      }
    } catch {
      # No invented timestamp for an unparseable provider response.
    }
  }
)
$latest = @($parsed | Sort-Object Time -Descending | Select-Object -First 1)
Write-Output 'BACKUP_INVENTORY=READ_ONLY_MANAGEMENT_RESPONSE'
Write-Output "PROJECT_REF=$ProjectRef"
Write-Output "PROVIDER_BACKUP_RECORDS=$($records.Count)"
Write-Output "COMPLETED_BACKUP_RECORDS=$($complete.Count)"
Write-Output "COMPLETED_WITH_PARSEABLE_TIMESTAMP=$($parsed.Count)"
Write-Output "PITR_ENABLED=$([bool]$result.pitr_enabled)"
Write-Output "WALG_ENABLED=$([bool]$result.walg_enabled)"
if ($latest.Count -gt 0) {
  Write-Output "LATEST_COMPLETED_BACKUP_UTC=$($latest[0].Time.ToString('yyyy-MM-ddTHH:mm:ssZ'))"
  Write-Output "LATEST_BACKUP_IS_PHYSICAL=$($latest[0].IsPhysical)"
  Write-Output 'RESTORE_PROOF=NOT_PERFORMED'
  exit 0
}
Write-Output 'LATEST_COMPLETED_BACKUP_UTC=UNVERIFIED'
Write-Output 'RESTORE_PROOF=NOT_PERFORMED'
exit 6
