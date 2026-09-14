[CmdletBinding()]
param(
  [string] $WorkspacePath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$modulePath = Join-Path $PSScriptRoot 'windows\Workbench.psm1'
Import-Module $modulePath -Force

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resolvedWorkspace = Invoke-WorkbenchSetup `
  -RepositoryRoot $repositoryRoot `
  -WorkspacePath $WorkspacePath

Write-Output "Workspace: $resolvedWorkspace"
Write-Output 'Setup completed successfully.'
