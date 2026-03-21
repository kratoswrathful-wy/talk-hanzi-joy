# Reads profiles CSV (semicolon or comma), generates PowerShell snippets for auth.admin.createUser.
# Output: scripts\create-users-commands.txt (UTF-8 BOM) - copy each block into PowerShell.
#
# Auth Admin API needs Legacy "service_role" JWT (starts with eyJ...). Do NOT use sb_secret_* here.
# User-Agent avoids "Forbidden use of secret API key in browser" when calling from PowerShell.
#
# Before run, set:
#   $env:SUPABASE_SERVICE_ROLE = "eyJ..."
#
# Usage:
#   .\scripts\generate-admin-user-commands.ps1 -CsvPath "C:\path\profiles-export.csv"

param(
  [Parameter(Mandatory = $true)]
  [string] $CsvPath,

  [string] $SupabaseUrl = "https://wshsmerltcakffllgyul.supabase.co",

  [string] $DefaultPassword = "TempMigrate2026!ChangeMe",

  [string] $OutputPath = "",

  [string] $Delimiter = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $CsvPath)) {
  Write-Error "CSV not found: $CsvPath"
}

$serviceRole = $env:SUPABASE_SERVICE_ROLE
if (-not $serviceRole) {
  Write-Host "Set env SUPABASE_SERVICE_ROLE (Dashboard - API - service_role)." -ForegroundColor Yellow
  $serviceRole = Read-Host "Or paste service_role here"
}

if (-not $OutputPath) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $OutputPath = Join-Path $scriptDir "create-users-commands.txt"
}

$firstLine = Get-Content -LiteralPath $CsvPath -TotalCount 1 -Encoding UTF8
if (-not $firstLine) { Write-Error "CSV is empty" }

if ($Delimiter) {
  $d = $Delimiter
} else {
  $d = if ($firstLine -match ";") { ";" } else { "," }
}

$rows = Import-Csv -LiteralPath $CsvPath -Encoding UTF8 -Delimiter $d

$required = @("id", "email")
foreach ($col in $required) {
  if ($rows[0].PSObject.Properties.Name -notcontains $col) {
    Write-Error "CSV must have columns id, email. Found: $($rows[0].PSObject.Properties.Name -join ', ')"
  }
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm')")
[void]$sb.AppendLine("# Supabase: $SupabaseUrl")
[void]$sb.AppendLine("# Users: $($rows.Count)")
[void]$sb.AppendLine("# One command per line: copy top-to-bottom, Enter after each. Or paste whole # ----- block.")
[void]$sb.AppendLine("# PS 5: send JSON as UTF-8 bytes + charset=utf-8 (fixes Chinese display_name showing as ???).")
[void]$sb.AppendLine("# Stuck at >> ? Ctrl+C. Use Legacy service_role JWT (eyJ...), NOT sb_secret_. User-Agent avoids browser error.")
[void]$sb.AppendLine("# Run once in this window, then each # ----- section below:")
[void]$sb.AppendLine('#   $env:SUPABASE_SERVICE_ROLE = "paste eyJ... service_role here"')
[void]$sb.AppendLine("")
[void]$sb.AppendLine('$supabaseUrl = "' + $SupabaseUrl + '"')
[void]$sb.AppendLine('$serviceRole = $env:SUPABASE_SERVICE_ROLE')
[void]$sb.AppendLine('if (-not $serviceRole) { throw "Set SUPABASE_SERVICE_ROLE first" }')
[void]$sb.AppendLine("")

$i = 0
foreach ($r in $rows) {
  $i++
  $id = ($r.id).Trim()
  $email = ($r.email).Trim()
  $name = if ($r.display_name) { ($r.display_name).Trim() } else { "" }
  if (-not $name) { $name = ($email -split "@")[0] }

  if (-not $id -or -not $email) {
    Write-Warning "Row $i skipped: missing id or email"
    continue
  }

  $esc = { param($s) $s -replace "'", "''" }
  $emailQ = & $esc $email
  $nameQ = & $esc $name
  $pwdQ = & $esc $DefaultPassword

  [void]$sb.AppendLine("# ----- $i / $($rows.Count) : $email -----")
  [void]$sb.AppendLine('$bodyObj = @{ email=''' + $emailQ + '''; password=''' + $pwdQ + '''; email_confirm=$true; user_metadata=@{ display_name = ''' + $nameQ + ''' }; id=''' + $id + ''' }')
  [void]$sb.AppendLine('$bodyUtf8 = [System.Text.Encoding]::UTF8.GetBytes(($bodyObj | ConvertTo-Json -Depth 5))')
  [void]$sb.AppendLine('$headers = @{ "apikey" = $serviceRole; "Authorization" = "Bearer $serviceRole"; "Content-Type" = "application/json; charset=utf-8"; "User-Agent" = "1UP-TMS-Migration/1.0 (PowerShell)" }')
  [void]$sb.AppendLine("try { Invoke-RestMethod -Uri `"`$supabaseUrl/auth/v1/admin/users`" -Method Post -Headers `$headers -Body `$bodyUtf8; Write-Host 'OK: $($emailQ)' -ForegroundColor Green } catch { Write-Host ('FAIL: $($emailQ) - ' + `$_.Exception.Message) -ForegroundColor Red }")
  [void]$sb.AppendLine("")
}

$utf8Bom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($OutputPath, $sb.ToString(), $utf8Bom)

Write-Host "Wrote: $OutputPath" -ForegroundColor Green
Write-Host "Open in Notepad/VS Code; copy line-by-line (or whole block) into PowerShell." -ForegroundColor Cyan
