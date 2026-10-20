param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$taskName = "AuraStudio-SqliteBackup"

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "Agendamento de backup removido."
    exit 0
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$npmCommand = Get-Command npm.cmd -ErrorAction Stop
$action = New-ScheduledTaskAction `
    -Execute $npmCommand.Source `
    -Argument "run backup --workspace backend" `
    -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At "3:00 AM"
$principal = New-ScheduledTaskPrincipal `
    -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Backup diário do banco SQLite do Aura Studio." `
    -Force | Out-Null

Write-Output "Backup automático agendado diariamente às 03:00 para o usuário atual."
Write-Output "Execute 'npm run backup' para criar um backup agora."
