[CmdletBinding()]
param(
  [string] $WorkspacePath,

  [ValidateRange(1, 65535)]
  [int] $Port = 3210,

  [ValidateRange(1, [int]::MaxValue)]
  [int] $HealthTimeoutSeconds = 30,

  [switch] $NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$modulePath = Join-Path $PSScriptRoot 'windows\Workbench.psm1'
Import-Module $modulePath -Force

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$result = Start-WorkbenchServer `
  -RepositoryRoot $repositoryRoot `
  -WorkspacePath $WorkspacePath `
  -Port $Port `
  -HealthTimeoutSeconds $HealthTimeoutSeconds `
  -NoBrowser:$NoBrowser

Write-Output "Workbench: $($result.Url)"
Write-Output "Process ID: $($result.ProcessId)"
